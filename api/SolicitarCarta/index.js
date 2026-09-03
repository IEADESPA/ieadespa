// SolicitarCarta — auto-atendimento (Meu Painel): o PRÓPRIO membro solicita a
// Carta de Recomendação, de Mudança ou o Atestado de Trânsito Supletivo pela
// própria matrícula (Reg. Art. 131). Ninguém pode solicitar no lugar de outra
// pessoa — a matrícula é a identidade do solicitante (mesmo modelo de
// autoatendimento do MeusDadosLGPD).
//
// GET  /api/cartas/minhas?matricula=123        -> lista as cartas do próprio membro
// POST /api/cartas/minhas                      -> body: { matricula, tipo, destino?, motivoSaida?, confirmar? }
//
// Carta de Mudança tem 2 passos (Reg. Art. 131 §3º, II): o 1º cria SOLICITADA; o
// 2º (confirmar=true) grava a "declaração de ciência" digital e avança para
// CONFIRMADA — a partir daí corre o prazo de 30 dias para a minimização (Reg.
// Art. 132 §2º). É a única que passa por essa etapa, por ser um desligamento.
//
// Carta de Recomendação e Atestado de Trânsito Supletivo (Reg. Art. 131 §2º,
// III) saem direto como EMITIDA, com validade de 30 dias: como é o próprio
// membro que pede, direto no sistema, não existe "competência de emissão"
// (Dirigente/Secretário/CEI) a intermediar.
const { getPool, sql } = require("../shared/db");
const { registrarAuditoria } = require("../shared/auditoria");

const TIPOS = ["RECOMENDACAO", "MUDANCA", "ATESTADO_SUPLETIVO"];
const EMISSAO_IMEDIATA = ["RECOMENDACAO", "ATESTADO_SUPLETIVO"];

function dataISO(data) {
  const d = new Date(data);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const SELECT_CARTA = `
  SELECT c.CartaId AS cartaId, c.MembroId AS membroId, m.Nome AS nome, cg.Nome AS congregacao,
         c.Tipo AS tipo, c.Status AS status, c.Destino AS destino,
         c.MotivoSaida AS motivoSaida, c.DeclaracaoCiencia AS declaracaoCiencia,
         CONVERT(varchar(10), c.DataEmissao, 120) AS dataEmissao,
         CONVERT(varchar(10), c.DataValidade, 120) AS dataValidade,
         CONVERT(varchar(10), ISNULL(c.DataConfirmacao, c.DataSolicitacao), 120) AS dataPedido,
         CONVERT(varchar(10), m.DataAdmissao, 120) AS dataAdmissao,
         COALESCE(cm.Nome, m.Funcao) AS funcao, m.CargoMinisterial AS cargoMinisterial,
         m.SituacaoMembro AS situacaoMembro, m.EstadoCivil AS estadoCivil
  FROM CartasTransito c
  JOIN MembroReferencia m ON m.MembroId = c.MembroId
  LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
  LEFT JOIN CargosMinisteriais cm ON cm.Sigla = m.CargoMinisterial
  WHERE c.MembroId = @id`;

module.exports = async function (context, req) {
  const method = req.method;

  if (method === "GET") {
    const mat = Number((req.query || {}).matricula);
    if (!mat) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula: /api/cartas/minhas?matricula=123" } };
      return;
    }
    const pool = await getPool();
    const result = await pool.request().input("id", sql.Int, mat).query(`${SELECT_CARTA} ORDER BY c.CartaId DESC`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (method !== "POST") {
    context.res = { status: 405, body: { erro: "Método não suportado." } };
    return;
  }

  const { matricula, tipo, destino, motivoSaida, confirmar } = req.body || {};
  if (!matricula || !tipo || !TIPOS.includes(tipo)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: `Informe matricula e tipo válido (${TIPOS.join(", ")}).` } };
    return;
  }

  const pool = await getPool();
  const membro = await pool.request().input("id", sql.Int, matricula)
    .query(`SELECT MembroId, Nome FROM MembroReferencia WHERE MembroId = @id`);
  if (membro.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
    return;
  }
  const nome = membro.recordset[0].Nome;

  // Para Recomendação/Atestado Supletivo (emissão imediata, validade de 30 dias),
  // uma carta EMITIDA só bloqueia pedido novo enquanto ainda estiver dentro da
  // validade — vencida, não conta como "em aberto". A Carta de Mudança não tem
  // esse recorte: enquanto não cancelada, é sempre a mesma solicitação de saída.
  const ativa = await pool.request().input("id", sql.Int, matricula).input("tipo", sql.NVarChar(30), tipo)
    .query(`SELECT TOP 1 CartaId, Status FROM CartasTransito
            WHERE MembroId = @id AND Tipo = @tipo
              AND (
                Status IN ('SOLICITADA','CONFIRMADA')
                OR (Status = 'EMITIDA' AND (DataValidade IS NULL OR DataValidade >= CAST(SYSUTCDATETIME() AS DATE)))
              )
            ORDER BY CartaId DESC`);
  const cartaAtiva = ativa.recordset[0];

  if (confirmar) {
    if (!cartaAtiva) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Nenhuma solicitação pendente para confirmar." } };
      return;
    }
    const declaracao = `Eu, ${nome}, solicito minha Carta de Mudança e estou ciente do meu desligamento do rol de membros da IEADESPA.`;
    await pool.request().input("id", sql.Int, cartaAtiva.CartaId).input("declaracao", sql.NVarChar(500), declaracao)
      .query(`UPDATE CartasTransito SET Status = 'CONFIRMADA', DeclaracaoCiencia = @declaracao, DataConfirmacao = SYSUTCDATETIME() WHERE CartaId = @id`);
    await registrarAuditoria({ tabela: "CartasTransito", registroId: Number(cartaAtiva.CartaId), acao: "Confirmou solicitação de carta", usuarioId: Number(matricula), dadosDepois: { tipo, declaracao } });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Solicitação confirmada.", cartaId: cartaAtiva.CartaId } };
    return;
  }

  if (cartaAtiva) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Você já tem uma carta deste tipo em aberto (aguardando ou ainda dentro da validade)." } };
    return;
  }

  if (EMISSAO_IMEDIATA.includes(tipo)) {
    const hoje = new Date();
    const validade = dataISO(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 30));
    const declaracao = tipo === "ATESTADO_SUPLETIVO"
      ? `Eu, ${nome}, solicito o Atestado de Trânsito Supletivo diretamente pelo sistema (Reg. Art. 131 §2º, III), por não dispor da carta da igreja de origem.`
      : `Eu, ${nome}, solicito esta Carta de Recomendação diretamente pelo sistema (Reg. Art. 131 §1º).`;
    const result = await pool.request()
      .input("membroId", sql.Int, matricula)
      .input("tipo", sql.NVarChar(30), tipo)
      .input("destino", sql.NVarChar(150), destino || null)
      .input("motivoSaida", sql.NVarChar(200), motivoSaida || null)
      .input("solicitadoPor", sql.Int, matricula)
      .input("declaracao", sql.NVarChar(500), declaracao)
      .input("hoje", sql.Date, dataISO(hoje))
      .input("validade", sql.Date, validade)
      .query(`INSERT INTO CartasTransito (MembroId, Tipo, Destino, MotivoSaida, SolicitadoPor, EmitidoPor, DeclaracaoCiencia, Status, DataConfirmacao, DataEmissao, DataValidade)
              OUTPUT INSERTED.CartaId
              VALUES (@membroId, @tipo, @destino, @motivoSaida, @solicitadoPor, @solicitadoPor, @declaracao, 'EMITIDA', SYSUTCDATETIME(), @hoje, @validade)`);
    const cartaId = result.recordset[0].CartaId;
    await registrarAuditoria({ tabela: "CartasTransito", registroId: Number(cartaId), acao: "Emitiu carta (autoatendimento)", usuarioId: Number(matricula), dadosDepois: { tipo, destino, validade } });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Carta emitida — já pode imprimir.", cartaId } };
    return;
  }

  const result = await pool.request()
    .input("membroId", sql.Int, matricula)
    .input("tipo", sql.NVarChar(30), tipo)
    .input("destino", sql.NVarChar(150), destino || null)
    .input("motivoSaida", sql.NVarChar(200), motivoSaida || null)
    .input("solicitadoPor", sql.Int, matricula)
    .query(`INSERT INTO CartasTransito (MembroId, Tipo, Destino, MotivoSaida, SolicitadoPor, Status)
            OUTPUT INSERTED.CartaId
            VALUES (@membroId, @tipo, @destino, @motivoSaida, @solicitadoPor, 'SOLICITADA')`);
  const cartaId = result.recordset[0].CartaId;

  await registrarAuditoria({ tabela: "CartasTransito", registroId: Number(cartaId), acao: "Solicitou carta", usuarioId: Number(matricula), dadosDepois: { tipo, destino } });

  context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Solicitação registrada.", cartaId } };
};
