// HistoricoMembro
// Linha do Tempo do membro (v1.6) — agrega por leitura os eventos já estruturados em
// várias tabelas (nunca duplica dado) + os Marcos manuais (MarcosMembro). Processos
// Disciplinares e Procedimentos de Abandono são sigilosos: só entram na resposta se
// quem está vendo tiver a permissão "disciplina" (mesmo mascaramento já usado em
// GestaoPessoas para `processoDisciplinarAtivo`).
// GET /api/pessoas/{membroId}/historico
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { pessoaAlcancavel, noEscopoDaPessoa } = require("../shared/escopoRotas");

// ESCOPO: a linha do tempo é da PESSOA — só abre quem alcança a congregação dela (shared/escopoRotas.js); fora do escopo (ou matrícula malformada) vale a mesma resposta de
// "Matrícula não encontrada".
module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const membroIdBruto = context.bindingData.membroId;
  if (!membroIdBruto) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o membroId na rota." } };
    return;
  }

  const pool = await getPool();
  const alcancavel = await pessoaAlcancavel(pool, usuario, membroIdBruto);
  if (!alcancavel) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
    return;
  }
  const membroId = alcancavel.membroId;
  const membroResult = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT Nome, FormaAdmissao, CONVERT(varchar(10), DataAdmissao, 120) AS DataAdmissao,
           CONVERT(varchar(10), DataBatismo, 120) AS DataBatismo,
           CONVERT(varchar(10), DataRitoRecebimento, 120) AS DataRitoRecebimento,
           Origem, IgrejaAnterior,
           CONVERT(varchar(10), DataSaida, 120) AS DataSaida, MotivoSaida
    FROM MembroReferencia WHERE MembroId = @id
  `);
  const membro = membroResult.recordset[0];
  if (!membro) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
    return;
  }

  const eventos = [];

  if (membro.DataAdmissao) {
    eventos.push({
      data: membro.DataAdmissao,
      tipo: "ADMISSAO",
      titulo: `Admissão (${membro.FormaAdmissao || "não informado"})`,
      descricao: membro.IgrejaAnterior ? `Vindo de: ${membro.IgrejaAnterior}` : (membro.Origem || null)
    });
  }
  if (membro.DataBatismo) {
    eventos.push({ data: membro.DataBatismo, tipo: "BATISMO", titulo: "Batismo nas águas", descricao: null });
  }
  if (membro.DataRitoRecebimento) {
    eventos.push({ data: membro.DataRitoRecebimento, tipo: "RITO_RECEBIMENTO", titulo: "Rito Público de Recebimento", descricao: null });
  }
  if (membro.DataSaida) {
    eventos.push({ data: membro.DataSaida, tipo: "SAIDA", titulo: "Saída do rol de membros", descricao: membro.MotivoSaida });
  }

  const consagracoes = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT Assunto, CargoAtual, Status, CONVERT(varchar(10), DataProtocolo, 120) AS DataProtocolo,
           CONVERT(varchar(10), DataConclusao, 120) AS DataConclusao
    FROM Consagracoes WHERE MembroId = @id
  `);
  for (const c of consagracoes.recordset) {
    eventos.push({ data: c.DataProtocolo, tipo: "CONSAGRACAO_PROTOCOLO", titulo: `Protocolou: ${c.Assunto}`, descricao: null });
    if (c.Status === "CONCLUIDO" && c.DataConclusao) {
      eventos.push({ data: c.DataConclusao, tipo: "CONSAGRACAO_CONCLUIDA", titulo: `Concluiu: ${c.Assunto}`, descricao: c.CargoAtual });
    }
  }

  const cartas = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT Tipo, CONVERT(varchar(10), DataEmissao, 120) AS DataEmissao, Destino
    FROM CartasTransito WHERE MembroId = @id AND DataEmissao IS NOT NULL
  `);
  for (const c of cartas.recordset) {
    eventos.push({ data: c.DataEmissao, tipo: "CARTA_TRANSITO", titulo: `Carta de ${c.Tipo === "MUDANCA" ? "Mudança" : c.Tipo === "RECOMENDACAO" ? "Recomendação" : "Atestado Supletivo"} emitida`, descricao: c.Destino });
  }

  const marcos = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT MarcoId, Tipo, Descricao, CONVERT(varchar(10), DataMarco, 120) AS DataMarco, DataAproximada
    FROM MarcosMembro WHERE MembroId = @id
  `);
  for (const m of marcos.recordset) {
    eventos.push({ data: m.DataMarco, tipo: `MARCO_${m.Tipo}`, titulo: m.Descricao, descricao: m.DataAproximada ? "Data aproximada" : null, marcoId: m.MarcoId });
  }

  // v7.6 — o histórico disciplinar só para quem tem "disciplina" com a pessoa no escopo DESSA permissão (não basta o escopo de "pessoas").
  const vDisciplina = auth.visaoDaPermissao(usuario, "disciplina");
  if (vDisciplina && noEscopoDaPessoa(vDisciplina, alcancavel.congregacaoNome, alcancavel.extensaoNome)) {
    const processos = await pool.request().input("id", sql.Int, membroId).query(`
      SELECT CONVERT(varchar(10), p.DataAbertura, 120) AS DataAbertura,
             CONVERT(varchar(10), p.DataConclusao, 120) AS DataConclusao, p.Status AS Status, p.Resultado AS Resultado,
             p.DiasSancao AS DiasSancao, tp.Nome AS PenalidadeNome
      FROM ProcessosDisciplinares p
      LEFT JOIN TiposPenalidade tp ON tp.PenalidadeId = p.PenalidadeId
      WHERE p.MembroId = @id
    `);
    for (const p of processos.recordset) {
      eventos.push({ data: p.DataAbertura, tipo: "DISCIPLINA_ABERTURA", titulo: "Processo disciplinar aberto", descricao: null });
      if (p.DataConclusao) {
        const penalidade = p.PenalidadeNome ? ` — ${p.PenalidadeNome}${p.DiasSancao ? ` (${p.DiasSancao} dias)` : ""}` : "";
        eventos.push({ data: p.DataConclusao, tipo: "DISCIPLINA_CONCLUSAO", titulo: `Processo disciplinar concluído: ${p.Resultado}${penalidade}`, descricao: null });
      }
    }

    const abandonos = await pool.request().input("id", sql.Int, membroId).query(`
      SELECT Tipo, CONVERT(varchar(10), DataNotificacao, 120) AS DataNotificacao,
             CONVERT(varchar(10), DataHomologacao, 120) AS DataHomologacao
      FROM ProcedimentosAbandono WHERE MembroId = @id
    `);
    for (const a of abandonos.recordset) {
      eventos.push({ data: a.DataNotificacao, tipo: "ABANDONO_NOTIFICACAO", titulo: `Notificado — Abandono ${a.Tipo === "DIGITAL" ? "Digital" : "Material"}`, descricao: null });
      if (a.DataHomologacao) {
        eventos.push({ data: a.DataHomologacao, tipo: "ABANDONO_HOMOLOGACAO", titulo: `Abandono ${a.Tipo === "DIGITAL" ? "Digital" : "Material"} homologado`, descricao: null });
      }
    }
  }

  eventos.sort((a, b) => {
    if (!a.data && !b.data) return 0;
    if (!a.data) return 1;
    if (!b.data) return -1;
    return a.data.localeCompare(b.data);
  });

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { nome: membro.Nome, eventos } };
};
