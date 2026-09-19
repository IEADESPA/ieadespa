// shared/escalas.js (v5.6 — Escalas de serviço com auto-escalador)
//
// A grade em si (quem está escalado quando) é a parte fácil. O que
// transforma isso em ferramenta útil é o que acontece quando alguém não
// pode: indisponibilidade declarada exclui o voluntário da sugestão, o
// auto-escalador escolhe por "quem serviu por último" + frequência
// preferida, detecta conflito entre equipes (mesma pessoa em louvor E
// recepção no mesmo culto), e uma recusa dispara convite em cadeia pro
// próximo elegível — sem o secretário refazendo a corrida de WhatsApp na
// mão. Toda a lógica abaixo é pura (sem tocar o banco) de propósito, pra
// ser testável sem Azure SQL; as funções que tocam o banco ficam ao final,
// bem mais finas, só orquestrando o que já foi decidido aqui.
const { sql } = require("./db");

const STATUS_ALOCACAO_ATIVOS = ["CONVIDADO", "ACEITO", "CONFIRMADO"];

function paraData(valor) {
  return valor instanceof Date ? valor : new Date(valor);
}

function diffDias(dataMaisNova, dataMaisVelha) {
  const MS_POR_DIA = 86400000;
  return Math.floor((paraData(dataMaisNova).getTime() - paraData(dataMaisVelha).getTime()) / MS_POR_DIA);
}

// Indisponibilidade declarada pelo voluntário (viagem, trabalho, período) —
// a escala nunca sugere quem já se declarou indisponível pra aquela data.
// `indisponibilidades`: [{ dataInicio, dataFim }] (limites inclusivos).
function estaIndisponivelNaData(indisponibilidades, dataServico) {
  const data = paraData(dataServico).getTime();
  return (indisponibilidades || []).some(ind => {
    const inicio = paraData(ind.dataInicio).getTime();
    const fim = paraData(ind.dataFim).getTime();
    return data >= inicio && data <= fim;
  });
}

// "Quem serviu por último" + frequência preferida: um voluntário só volta a
// ficar elegível depois de FrequenciaPreferidaDias desde o último serviço
// (nunca serviu = elegível já na primeira oportunidade). Devolve a fila
// ordenada (quem espera há mais tempo primeiro) — é essa fila que vira a
// cadeia de convite: primeiro é o convidado atual, os demais são o
// fallback automático se ele recusar.
function ordenarCandidatosElegiveis(candidatos, dataServico) {
  return (candidatos || [])
    .filter(c => !estaIndisponivelNaData(c.indisponibilidades, dataServico))
    .filter(c => {
      if (!c.ultimoServicoEm) return true; // nunca serviu — sempre elegível
      return diffDias(dataServico, c.ultimoServicoEm) >= (c.frequenciaPreferidaDias || 30);
    })
    .slice()
    .sort((a, b) => {
      // Nunca serviu vem antes de quem já serviu alguma vez (espera "infinita").
      if (!a.ultimoServicoEm && !b.ultimoServicoEm) return 0;
      if (!a.ultimoServicoEm) return -1;
      if (!b.ultimoServicoEm) return 1;
      return paraData(a.ultimoServicoEm).getTime() - paraData(b.ultimoServicoEm).getTime();
    });
}

// Conflito entre equipes: a mesma pessoa não pode estar escalada em louvor
// E recepção no mesmo culto. `alocacoesDoServico` é toda alocação ATIVA
// (CONVIDADO/ACEITO/CONFIRMADO — RECUSADO/CANCELADA liberam a pessoa) já
// existente para aquele ServicoId, em qualquer equipe.
function temConflitoEntreEquipes(alocacoesDoServico, membroId, equipeId) {
  return (alocacoesDoServico || []).some(a =>
    a.membroId === membroId &&
    a.equipeId !== equipeId &&
    STATUS_ALOCACAO_ATIVOS.includes(a.status)
  );
}

// Monta o plano do auto-escalador pra um serviço: por equipe, a fila de
// convite em cadeia inteira (não só o escolhido) — já filtrando quem está
// indisponível, fora da janela de frequência, ou conflitando com outra
// equipe (inclusive conflito criado pelas próprias escolhas deste mesmo
// autoescalonamento, processadas equipe a equipe na ordem recebida).
//
// `equipes`: [{ equipeId, candidatos: [{ membroId, ultimoServicoEm,
//   frequenciaPreferidaDias, indisponibilidades }] }]
// `alocacoesExistentes`: alocações ativas já feitas neste serviço por OUTRO
//   processo (ex: alguém já confirmado manualmente antes de rodar o
//   auto-escalador) — entram no mesmo cálculo de conflito.
function autoEscalarServico({ dataServico, equipes, alocacoesExistentes }) {
  const ocupadosNesteServico = new Set(
    (alocacoesExistentes || [])
      .filter(a => STATUS_ALOCACAO_ATIVOS.includes(a.status))
      .map(a => a.membroId)
  );

  const plano = [];
  for (const equipe of equipes || []) {
    const elegiveis = ordenarCandidatosElegiveis(equipe.candidatos, dataServico)
      .filter(c => !ocupadosNesteServico.has(c.membroId));

    const filaConvite = elegiveis.map(c => c.membroId);
    plano.push({ equipeId: equipe.equipeId, filaConvite, convidadoAtual: filaConvite[0] || null });

    if (filaConvite[0]) ocupadosNesteServico.add(filaConvite[0]);
  }
  return plano;
}

// Convite em cadeia: recusou, convida o próximo da mesma fila
// automaticamente. `filaConvite` é a fila já calculada por
// autoEscalarServico (ou recalculada na hora); `jaRecusaram` acumula quem
// já saiu da rodada (evita reconvidar alguém que já recusou nesta mesma
// cadeia).
function proximoConviteAposRecusa(filaConvite, membroQueRecusou, jaRecusaram) {
  const recusados = new Set([...(jaRecusaram || []), membroQueRecusou]);
  const proximo = (filaConvite || []).find(membroId => !recusados.has(membroId));
  return { proximoConvidado: proximo || null, recusados: [...recusados] };
}

// Confirmação de recebimento: quem não confirmou (ainda CONVIDADO ou já
// ACEITO mas não CONFIRMADO) até X dias depois de a escala ser publicada
// vira pendência do líder da equipe — cada alocação carrega sua própria
// equipe/líder pra a pendência já sair endereçada a quem resolve.
// `alocacoes`: [{ alocacaoId, equipeId, membroId, status, servicoId }]
function listarPendenciasConfirmacao(alocacoes, publicadaEm, prazoDias, agora) {
  if (!publicadaEm) return [];
  const dias = diffDias(agora || new Date(), publicadaEm);
  if (dias < prazoDias) return [];
  return (alocacoes || []).filter(a => a.status === "CONVIDADO" || a.status === "ACEITO");
}

// Validação de pedido de troca: o destino não pode já estar noutra equipe
// do mesmo serviço (conflito entre equipes vale aqui também) nem estar
// indisponível na data — a aprovação do líder não pode "empurrar" um
// conflito ou uma indisponibilidade já declarada.
function validarTroca({ servicoId, equipeId, membroDestinoId, dataServico, indisponibilidadesDestino, alocacoesDoServico }) {
  if (estaIndisponivelNaData(indisponibilidadesDestino, dataServico)) {
    return { valido: false, mensagem: "O voluntário destino já se declarou indisponível nessa data." };
  }
  if (temConflitoEntreEquipes(alocacoesDoServico, membroDestinoId, equipeId)) {
    return { valido: false, mensagem: "O voluntário destino já está escalado em outra equipe neste mesmo serviço." };
  }
  return { valido: true };
}

// ---------------------------------------------------------------
// Funções de banco (finas — só buscam/gravam o que a lógica acima decide).
// ---------------------------------------------------------------

async function buscarCandidatosDaEquipe(pool, equipeId, dataServico) {
  const membros = (await pool.request().input("equipeId", sql.Int, equipeId).query(`
    SELECT em.MembroId AS membroId, em.FrequenciaPreferidaDias AS frequenciaPreferidaDias
    FROM EscalasEquipeMembros em
    WHERE em.EquipeId = @equipeId AND em.Ativo = 1
  `)).recordset;

  const candidatos = [];
  for (const m of membros) {
    const ultimoResult = await pool.request()
      .input("membroId", sql.Int, m.membroId)
      .input("dataServico", sql.DateTime2, dataServico)
      .query(`
        SELECT MAX(s.DataHora) AS ultimoServicoEm
        FROM EscalasAlocacoes a
        JOIN EscalasServicos s ON s.ServicoId = a.ServicoId
        WHERE a.MembroId = @membroId AND a.Status IN ('ACEITO','CONFIRMADO') AND s.DataHora < @dataServico
      `);
    candidatos.push({ ...m, ultimoServicoEm: ultimoResult.recordset[0] ? ultimoResult.recordset[0].ultimoServicoEm : null });
  }

  const indisponibilidadesResult = await pool.request().query(`
    SELECT MembroId AS membroId, DataInicio AS dataInicio, DataFim AS dataFim
    FROM EscalasIndisponibilidades
    WHERE DataFim >= CAST(GETDATE() AS DATE)
  `);
  const indisponibilidadesPorMembro = new Map();
  for (const ind of indisponibilidadesResult.recordset) {
    if (!indisponibilidadesPorMembro.has(ind.membroId)) indisponibilidadesPorMembro.set(ind.membroId, []);
    indisponibilidadesPorMembro.get(ind.membroId).push(ind);
  }

  return candidatos.map(c => ({
    membroId: c.membroId,
    frequenciaPreferidaDias: c.frequenciaPreferidaDias,
    ultimoServicoEm: c.ultimoServicoEm || null,
    indisponibilidades: indisponibilidadesPorMembro.get(c.membroId) || []
  }));
}

async function buscarAlocacoesAtivasDoServico(pool, servicoId) {
  const result = await pool.request().input("servicoId", sql.Int, servicoId).query(`
    SELECT AlocacaoId AS alocacaoId, EquipeId AS equipeId, MembroId AS membroId, Status AS status, OrdemConvite AS ordemConvite
    FROM EscalasAlocacoes
    WHERE ServicoId = @servicoId AND Status IN ('${STATUS_ALOCACAO_ATIVOS.join("','")}')
  `);
  return result.recordset;
}

// "Minhas Escalas" (hook do Portal do Membro, vB.5) — tudo que essa pessoa
// precisa pra aceitar/recusar/confirmar sem abrir o painel administrativo.
async function listarAlocacoesDoMembro(pool, membroId) {
  const result = await pool.request().input("membroId", sql.Int, membroId).query(`
    SELECT a.AlocacaoId AS alocacaoId, a.Status AS status, a.EquipeId AS equipeId, eq.Nome AS equipeNome,
           s.ServicoId AS servicoId, s.DataHora AS dataHora, s.Descricao AS descricao, s.Status AS servicoStatus
    FROM EscalasAlocacoes a
    JOIN EscalasEquipes eq ON eq.EquipeId = a.EquipeId
    JOIN EscalasServicos s ON s.ServicoId = a.ServicoId
    WHERE a.MembroId = @membroId AND a.Status != 'CANCELADA'
    ORDER BY s.DataHora DESC
  `);
  return result.recordset;
}

async function gravarAlocacao(pool, { servicoId, equipeId, membroId, ordemConvite }) {
  await pool.request()
    .input("servicoId", sql.Int, servicoId)
    .input("equipeId", sql.Int, equipeId)
    .input("membroId", sql.Int, membroId)
    .input("ordem", sql.Int, ordemConvite || 1)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM EscalasAlocacoes WHERE ServicoId = @servicoId AND EquipeId = @equipeId AND MembroId = @membroId)
        INSERT INTO EscalasAlocacoes (ServicoId, EquipeId, MembroId, Status, OrdemConvite)
        VALUES (@servicoId, @equipeId, @membroId, 'CONVIDADO', @ordem)
    `);
}

async function criarEquipe(pool, { nome, congregacaoId, liderMembroId }) {
  const result = await pool.request()
    .input("nome", sql.NVarChar(100), nome)
    .input("congregacaoId", sql.Int, congregacaoId)
    .input("liderMembroId", sql.Int, liderMembroId)
    .query(`INSERT INTO EscalasEquipes (Nome, CongregacaoId, LiderMembroId) OUTPUT INSERTED.EquipeId VALUES (@nome, @congregacaoId, @liderMembroId)`);
  return result.recordset[0].EquipeId;
}

async function buscarEquipe(pool, equipeId) {
  const result = await pool.request().input("id", sql.Int, equipeId).query(`
    SELECT e.EquipeId AS equipeId, e.Nome AS nome, e.CongregacaoId AS congregacaoId, e.LiderMembroId AS liderMembroId, e.Ativa AS ativa, c.Nome AS congregacaoNome
    FROM EscalasEquipes e JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoId
    WHERE e.EquipeId = @id
  `);
  return result.recordset[0] || null;
}

async function listarEquipes(pool, congregacaoId) {
  const result = await pool.request().input("congregacaoId", sql.Int, congregacaoId).query(`
    SELECT e.EquipeId AS equipeId, e.Nome AS nome, e.LiderMembroId AS liderMembroId, m.Nome AS liderNome, e.Ativa AS ativa
    FROM EscalasEquipes e JOIN MembroReferencia m ON m.MembroId = e.LiderMembroId
    WHERE e.CongregacaoId = @congregacaoId
    ORDER BY e.Nome
  `);
  return result.recordset;
}

async function adicionarMembroEquipe(pool, { equipeId, membroId, frequenciaPreferidaDias }) {
  await pool.request()
    .input("equipeId", sql.Int, equipeId)
    .input("membroId", sql.Int, membroId)
    .input("frequencia", sql.Int, frequenciaPreferidaDias || 30)
    .query(`
      IF EXISTS (SELECT 1 FROM EscalasEquipeMembros WHERE EquipeId = @equipeId AND MembroId = @membroId)
        UPDATE EscalasEquipeMembros SET FrequenciaPreferidaDias = @frequencia, Ativo = 1 WHERE EquipeId = @equipeId AND MembroId = @membroId
      ELSE
        INSERT INTO EscalasEquipeMembros (EquipeId, MembroId, FrequenciaPreferidaDias) VALUES (@equipeId, @membroId, @frequencia)
    `);
}

async function listarMembrosEquipe(pool, equipeId) {
  const result = await pool.request().input("equipeId", sql.Int, equipeId).query(`
    SELECT em.MembroId AS membroId, m.Nome AS nome, em.FrequenciaPreferidaDias AS frequenciaPreferidaDias, em.Ativo AS ativo
    FROM EscalasEquipeMembros em JOIN MembroReferencia m ON m.MembroId = em.MembroId
    WHERE em.EquipeId = @equipeId
    ORDER BY m.Nome
  `);
  return result.recordset;
}

async function criarServico(pool, { congregacaoId, dataHora, descricao, prazoConfirmacaoDias, criadoPorMembroId }) {
  const result = await pool.request()
    .input("congregacaoId", sql.Int, congregacaoId)
    .input("dataHora", sql.DateTime2, dataHora)
    .input("descricao", sql.NVarChar(200), descricao || null)
    .input("prazo", sql.Int, prazoConfirmacaoDias || 3)
    .input("criadoPor", sql.Int, criadoPorMembroId || null)
    .query(`
      INSERT INTO EscalasServicos (CongregacaoId, DataHora, Descricao, PrazoConfirmacaoDias, CriadoPorMembroId)
      OUTPUT INSERTED.ServicoId
      VALUES (@congregacaoId, @dataHora, @descricao, @prazo, @criadoPor)
    `);
  return result.recordset[0].ServicoId;
}

async function buscarServico(pool, servicoId) {
  const result = await pool.request().input("id", sql.Int, servicoId).query(`
    SELECT ServicoId AS servicoId, CongregacaoId AS congregacaoId, DataHora AS dataHora, Descricao AS descricao,
           Status AS status, PublicadaEm AS publicadaEm, PrazoConfirmacaoDias AS prazoConfirmacaoDias
    FROM EscalasServicos WHERE ServicoId = @id
  `);
  return result.recordset[0] || null;
}

async function listarServicos(pool, congregacaoId) {
  const result = await pool.request().input("congregacaoId", sql.Int, congregacaoId).query(`
    SELECT ServicoId AS servicoId, DataHora AS dataHora, Descricao AS descricao, Status AS status, PublicadaEm AS publicadaEm
    FROM EscalasServicos WHERE CongregacaoId = @congregacaoId
    ORDER BY DataHora DESC
  `);
  return result.recordset;
}

async function publicarServico(pool, servicoId) {
  await pool.request().input("id", sql.Int, servicoId).query(`
    UPDATE EscalasServicos SET Status = 'PUBLICADA', PublicadaEm = SYSUTCDATETIME() WHERE ServicoId = @id AND Status = 'RASCUNHO'
  `);
}

async function buscarAlocacao(pool, alocacaoId) {
  const result = await pool.request().input("id", sql.Int, alocacaoId).query(`
    SELECT AlocacaoId AS alocacaoId, ServicoId AS servicoId, EquipeId AS equipeId, MembroId AS membroId, Status AS status, OrdemConvite AS ordemConvite
    FROM EscalasAlocacoes WHERE AlocacaoId = @id
  `);
  return result.recordset[0] || null;
}

async function responderConvite(pool, alocacaoId, resposta) {
  await pool.request()
    .input("id", sql.Int, alocacaoId)
    .input("status", sql.NVarChar(20), resposta)
    .query(`UPDATE EscalasAlocacoes SET Status = @status, RespondidoEm = SYSUTCDATETIME() WHERE AlocacaoId = @id AND Status IN ('CONVIDADO','ACEITO')`);
}

async function confirmarRecebimento(pool, alocacaoId) {
  await pool.request().input("id", sql.Int, alocacaoId).query(`
    UPDATE EscalasAlocacoes SET Status = 'CONFIRMADO', ConfirmadoEm = SYSUTCDATETIME() WHERE AlocacaoId = @id AND Status IN ('CONVIDADO','ACEITO')
  `);
}

async function criarIndisponibilidade(pool, { membroId, dataInicio, dataFim, motivo }) {
  const result = await pool.request()
    .input("membroId", sql.Int, membroId)
    .input("dataInicio", sql.Date, dataInicio)
    .input("dataFim", sql.Date, dataFim)
    .input("motivo", sql.NVarChar(200), motivo || null)
    .query(`INSERT INTO EscalasIndisponibilidades (MembroId, DataInicio, DataFim, Motivo) OUTPUT INSERTED.IndisponibilidadeId VALUES (@membroId, @dataInicio, @dataFim, @motivo)`);
  return result.recordset[0].IndisponibilidadeId;
}

async function listarIndisponibilidades(pool, membroId) {
  const result = await pool.request().input("membroId", sql.Int, membroId).query(`
    SELECT IndisponibilidadeId AS indisponibilidadeId, DataInicio AS dataInicio, DataFim AS dataFim, Motivo AS motivo
    FROM EscalasIndisponibilidades WHERE MembroId = @membroId ORDER BY DataInicio DESC
  `);
  return result.recordset;
}

async function criarTroca(pool, { alocacaoOrigemId, membroDestinoId, solicitadaPorMembroId }) {
  const result = await pool.request()
    .input("alocacaoOrigemId", sql.Int, alocacaoOrigemId)
    .input("membroDestinoId", sql.Int, membroDestinoId)
    .input("solicitadaPor", sql.Int, solicitadaPorMembroId)
    .query(`
      INSERT INTO EscalasTrocas (AlocacaoOrigemId, MembroDestinoId, SolicitadaPorMembroId)
      OUTPUT INSERTED.TrocaId
      VALUES (@alocacaoOrigemId, @membroDestinoId, @solicitadaPor)
    `);
  return result.recordset[0].TrocaId;
}

async function buscarTroca(pool, trocaId) {
  const result = await pool.request().input("id", sql.Int, trocaId).query(`
    SELECT t.TrocaId AS trocaId, t.AlocacaoOrigemId AS alocacaoOrigemId, t.MembroDestinoId AS membroDestinoId,
           t.Status AS status, a.ServicoId AS servicoId, a.EquipeId AS equipeId, a.MembroId AS membroOrigemId
    FROM EscalasTrocas t JOIN EscalasAlocacoes a ON a.AlocacaoId = t.AlocacaoOrigemId
    WHERE t.TrocaId = @id
  `);
  return result.recordset[0] || null;
}

async function listarTrocasPendentesDaEquipe(pool, equipeId) {
  const result = await pool.request().input("equipeId", sql.Int, equipeId).query(`
    SELECT t.TrocaId AS trocaId, t.AlocacaoOrigemId AS alocacaoOrigemId, t.MembroDestinoId AS membroDestinoId,
           t.Status AS status, t.CriadaEm AS criadaEm, a.ServicoId AS servicoId, a.MembroId AS membroOrigemId
    FROM EscalasTrocas t JOIN EscalasAlocacoes a ON a.AlocacaoId = t.AlocacaoOrigemId
    WHERE a.EquipeId = @equipeId AND t.Status = 'PENDENTE'
    ORDER BY t.CriadaEm
  `);
  return result.recordset;
}

// Aprovar troca: a alocação original passa pro MembroDestinoId (mesma
// equipe/serviço, sem reabrir cadeia de convite — foi um acordo direto
// entre voluntários, só carimbado pelo líder) e vai direto pra ACEITO (o
// destino já topou ao pedir/aceitar a troca).
async function decidirTroca(pool, { trocaId, aprovar, observacao, decididoPorMembroId }) {
  const troca = await buscarTroca(pool, trocaId);
  if (!troca) return { sucesso: false, mensagem: "Troca não encontrada." };
  if (troca.status !== "PENDENTE") return { sucesso: false, mensagem: "Esta troca já foi decidida." };

  await pool.request()
    .input("id", sql.Int, trocaId)
    .input("status", sql.NVarChar(20), aprovar ? "APROVADA" : "RECUSADA")
    .input("observacao", sql.NVarChar(300), observacao || null)
    .input("decididoPor", sql.Int, decididoPorMembroId)
    .query(`UPDATE EscalasTrocas SET Status = @status, ObservacaoLider = @observacao, DecididaPorMembroId = @decididoPor, DecididaEm = SYSUTCDATETIME() WHERE TrocaId = @id`);

  if (aprovar) {
    await pool.request()
      .input("alocacaoId", sql.Int, troca.alocacaoOrigemId)
      .input("membroDestinoId", sql.Int, troca.membroDestinoId)
      .query(`UPDATE EscalasAlocacoes SET MembroId = @membroDestinoId, Status = 'ACEITO', RespondidoEm = SYSUTCDATETIME() WHERE AlocacaoId = @alocacaoId`);
  }
  return { sucesso: true, mensagem: aprovar ? "✅ Troca aprovada." : "✅ Troca recusada." };
}

module.exports = {
  STATUS_ALOCACAO_ATIVOS,
  diffDias,
  estaIndisponivelNaData,
  ordenarCandidatosElegiveis,
  temConflitoEntreEquipes,
  autoEscalarServico,
  proximoConviteAposRecusa,
  listarPendenciasConfirmacao,
  validarTroca,
  buscarCandidatosDaEquipe,
  buscarAlocacoesAtivasDoServico,
  listarAlocacoesDoMembro,
  gravarAlocacao,
  criarEquipe, buscarEquipe, listarEquipes, adicionarMembroEquipe, listarMembrosEquipe,
  criarServico, buscarServico, listarServicos, publicarServico,
  buscarAlocacao, responderConvite, confirmarRecebimento,
  criarIndisponibilidade, listarIndisponibilidades,
  criarTroca, buscarTroca, listarTrocasPendentesDaEquipe, decidirTroca
};
