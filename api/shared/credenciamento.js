// shared/credenciamento.js (vB.13 — Credenciamento de Assembleia, Reg. Art. 142-143)
// "Impedido" é sempre CALCULADO a partir do que já existe (shared/disciplina.js,
// shared/universo.js, shared/estatuto.js) — nunca uma marcação manual. Este
// módulo só soma a isso o "por qual artigo" e a trilha (quem operou, quando),
// que é o que faltava (v2.1/RegistrarPresenca não guarda recusa nenhuma).
const { sql } = require("./db");
const estatuto = require("./estatuto");
const disciplina = require("./disciplina");
const { membrosComCartaMudancaEmitida } = require("./universo");

// Reg. Art. 142-143 e o regime geral de deliberação associativa (CC art.
// 44-61): o voto em assembleia é personalíssimo. O Estatuto da IEADESPA não
// prevê procuração/representação — não é admitida. Registrado por escrito
// aqui (e exibido na tela de credenciamento) porque essa é a dúvida número
// um em assembleia de associação, e sem isso escrito a mesa improvisa
// caso a caso.
const AVISO_PROCURACAO =
  "Voto por procuração/representação NÃO é admitido (Art. 142-143; regime geral de deliberação " +
  "associativa, CC art. 44-61: o voto em assembleia é personalíssimo). Cada credenciado vota em " +
  "nome próprio, presente fisicamente.";

async function membrosAtivosParaAssembleia(pool) {
  const result = await pool.request().query(`
    SELECT m.MembroId AS membroId, m.Nome AS nome, m.SituacaoMembro AS situacaoMembro,
           m.Status AS status, CONVERT(varchar(10), m.DataNascimento, 120) AS dataNascimento,
           CONVERT(varchar(10), m.DataAdmissao, 120) AS dataAdmissao, m.DizimistaFiel AS dizimistaFiel
    FROM MembroReferencia m
    WHERE m.Status = 'ATIVO'
  `);
  return result.recordset;
}

// Prioridade de checagem: carta de mudança > disciplina > capacidade eleitoral
// geral (Art. 23 §1º) — mesma ordem em que shared/universo.js já compõe o
// universo da Assembleia Geral, só que aqui devolvendo O MOTIVO, não só
// filtrando quem passa.
function avaliarMotivo(membro, idsSobDisciplina, idsCartaMudanca) {
  if (idsCartaMudanca.has(membro.membroId)) {
    return { artigo: "Art. 142, III", detalhe: "Carta de mudança já emitida (trânsito eclesiástico em curso)." };
  }
  if (idsSobDisciplina.has(membro.membroId)) {
    return { artigo: "Art. 142, II", detalhe: "Sob disciplina em curso." };
  }
  const capacidade = estatuto.calcularCapacidadeEleitoral(Object.assign({}, membro, { processoDisciplinarAtivo: false }));
  if (!capacidade.capacidadeAtiva) {
    const detalhe = capacidade.emPeriodoIntegracao
      ? `Em período de integração — faltam ${capacidade.diasRestantesIntegracao} dia(s) (Art. 6º §2º).`
      : (capacidade.motivo || "Não atende à capacidade eleitoral ativa (Art. 23 §1º) — não é membro em comunhão plena.");
    return { artigo: "Art. 142, I", detalhe };
  }
  return null; // sem impedimento — credenciável
}

// candidato: registro de MembroReferencia (membroId, situacaoMembro, status, dataNascimento, dataAdmissao, dizimistaFiel)
async function avaliarCredenciamento(pool, membro) {
  const [idsSobDisciplina, idsCartaMudanca] = await Promise.all([
    disciplina.membrosSobDisciplina(pool),
    membrosComCartaMudancaEmitida(pool)
  ]);
  const impedimento = avaliarMotivo(membro, idsSobDisciplina, idsCartaMudanca);
  return impedimento ? { credenciado: false, ...impedimento } : { credenciado: true, artigo: null, detalhe: null };
}

// Lista, pra toda a base ATIVA, quem seria recusado na porta e por qual
// artigo — é o "relatório de impedidos calculado" (item 1 da vB.13): a mesa
// não precisa adivinhar, o sistema já traz o motivo legível pronto.
async function listarImpedidosAssembleia(pool) {
  const [ativos, idsSobDisciplina, idsCartaMudanca] = await Promise.all([
    membrosAtivosParaAssembleia(pool),
    disciplina.membrosSobDisciplina(pool),
    membrosComCartaMudancaEmitida(pool)
  ]);
  return ativos
    .map((m) => ({ membroId: m.membroId, nome: m.nome, ...avaliarMotivo(m, idsSobDisciplina, idsCartaMudanca) }))
    .filter((m) => m.artigo)
    .map((m) => ({ membroId: m.membroId, nome: m.nome, motivoArtigo: m.artigo, motivoDetalhe: m.detalhe }));
}

// Relatório de credenciamento (Robert's Rules — Credentials Report): gerado
// UMA VEZ por sessão e CONGELADO — se já existe, devolve o que já foi
// gerado, nunca recalcula (mesmo padrão do protocolo em CartaPdf: número
// emitido na 1ª vez, nunca antes, nunca de novo). Isso evita que uma carta
// de mudança emitida DEPOIS da instalação reescreva retroativamente a base
// de cálculo do quórum já fixada.
async function gerarOuObterRelatorioCredenciamento(pool, sessaoId, geradoPor) {
  const existente = (await pool.request().input("id", sql.Int, sessaoId)
    .query(`SELECT RelatorioId AS relatorioId, TotalCredenciados AS totalCredenciados, TotalImpedidos AS totalImpedidos,
                    CONVERT(varchar(19), GeradoEm, 120) AS geradoEm
             FROM RelatoriosCredenciamento WHERE SessaoId = @id`)).recordset[0];
  if (existente) return { ...existente, novo: false };

  const totalCredenciados = (await pool.request().input("id", sql.Int, sessaoId)
    .query(`SELECT COUNT(*) AS total FROM Presencas WHERE SessaoId = @id AND Presente = 1`)).recordset[0].total;
  const totalImpedidos = (await pool.request().input("id", sql.Int, sessaoId)
    .query(`SELECT COUNT(*) AS total FROM CredenciamentosAssembleia WHERE SessaoId = @id AND Resultado = 'RECUSADO'`)).recordset[0].total;

  const inserido = await pool.request()
    .input("sessaoId", sql.Int, sessaoId).input("totalCredenciados", sql.Int, totalCredenciados)
    .input("totalImpedidos", sql.Int, totalImpedidos).input("geradoPor", sql.Int, geradoPor || null)
    .query(`INSERT INTO RelatoriosCredenciamento (SessaoId, TotalCredenciados, TotalImpedidos, GeradoPor)
            OUTPUT INSERTED.RelatorioId AS relatorioId, CONVERT(varchar(19), INSERTED.GeradoEm, 120) AS geradoEm
            VALUES (@sessaoId, @totalCredenciados, @totalImpedidos, @geradoPor)`);
  return { relatorioId: inserido.recordset[0].relatorioId, totalCredenciados, totalImpedidos, geradoEm: inserido.recordset[0].geradoEm, novo: true };
}

module.exports = {
  AVISO_PROCURACAO,
  avaliarCredenciamento, listarImpedidosAssembleia, gerarOuObterRelatorioCredenciamento
};
