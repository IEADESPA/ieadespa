// GestaoCartas — Secretaria gerencia as Cartas de Trânsito (v1.4 — Reg. Art. 131).
// Exige a permissão "pessoas".
//
// GET   /api/cartas                  -> lista (com nome do membro)
// POST  /api/cartas/emitir           -> body: { cartaId }  (Recomendação ganha validade de 30 dias)
// POST  /api/cartas/cancelar         -> body: { cartaId }
// POST  /api/cartas/processar        -> minimização de 30 dias (Reg. Art. 132 §2º)
//
// A minimização é SOB DEMANDA (sem job/timer): cartas de Mudança com ≥30 dias da
// confirmação têm os dados pessoais minimizados (Registro Histórico Mínimo), salvo
// se o membro foi readmitido (DataAdmissao posterior ao pedido) — aí a carta é
// cancelada ("o relógio zerou", Reg. Art. 131 §4º, II).
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const estatuto = require("../shared/estatuto");

const DIAS_MINIMIZACAO = 30;

const SELECT_LISTA = `
  SELECT c.CartaId AS cartaId, c.MembroId AS membroId, m.Nome AS nome, cg.Nome AS congregacao,
         c.Tipo AS tipo, c.Status AS status, c.Destino AS destino, c.MotivoSaida AS motivoSaida,
         c.DeclaracaoCiencia AS declaracaoCiencia,
         CONVERT(varchar(10), c.DataEmissao, 120) AS dataEmissao,
         CONVERT(varchar(10), c.DataValidade, 120) AS dataValidade,
         CONVERT(varchar(10), ISNULL(c.DataConfirmacao, c.DataSolicitacao), 120) AS dataPedido,
         CONVERT(varchar(10), m.DataAdmissao, 120) AS dataAdmissao,
         COALESCE(cm.Nome, m.Funcao) AS funcao, m.CargoMinisterial AS cargoMinisterial,
         m.SituacaoMembro AS situacaoMembro, m.EstadoCivil AS estadoCivil, m.Status AS statusMembro
  FROM CartasTransito c
  JOIN MembroReferencia m ON m.MembroId = c.MembroId
  LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
  LEFT JOIN CargosMinisteriais cm ON cm.Sigla = m.CargoMinisterial`;

function dataISO(data) {
  if (!data) return null;
  const d = new Date(data);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const method = req.method;
  const acao = context.bindingData.acao;
  const pool = await getPool();

  if (method === "GET") {
    const result = await pool.request().query(`${SELECT_LISTA} ORDER BY c.CartaId DESC`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (method === "POST" && acao === "emitir") {
    const { cartaId } = req.body || {};
    if (!cartaId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe cartaId." } };
      return;
    }
    const cartaResult = await pool.request().input("id", sql.Int, cartaId).query(`SELECT Tipo, Status FROM CartasTransito WHERE CartaId = @id`);
    const carta = cartaResult.recordset[0];
    if (!carta) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Carta não encontrada." } };
      return;
    }
    if (!["SOLICITADA", "CONFIRMADA"].includes(carta.Status)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Carta com status "${carta.Status}" não pode ser emitida.` } };
      return;
    }
    const hoje = new Date();
    const validade = carta.Tipo === "RECOMENDACAO"
      ? dataISO(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 30))
      : null;
    await pool.request()
      .input("id", sql.Int, cartaId)
      .input("hoje", sql.Date, dataISO(hoje))
      .input("validade", sql.Date, validade)
      .input("emitidoPor", sql.Int, usuario.membroId)
      .query(`UPDATE CartasTransito SET Status = 'EMITIDA', DataEmissao = @hoje, DataValidade = @validade, EmitidoPor = @emitidoPor WHERE CartaId = @id`);
    await registrarAuditoria({ tabela: "CartasTransito", registroId: Number(cartaId), acao: "Emitiu carta", usuarioId: usuario.membroId, dadosDepois: { status: "EMITIDA", validade } });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Carta emitida." } };
    return;
  }

  if (method === "POST" && acao === "cancelar") {
    const { cartaId } = req.body || {};
    if (!cartaId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe cartaId." } };
      return;
    }
    const upd = await pool.request().input("id", sql.Int, cartaId)
      .query(`UPDATE CartasTransito SET Status = 'CANCELADA' WHERE CartaId = @id AND Status <> 'CONCLUIDA'`);
    if (upd.rowsAffected[0] === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Carta não encontrada ou já concluída." } };
      return;
    }
    await registrarAuditoria({ tabela: "CartasTransito", registroId: Number(cartaId), acao: "Cancelou carta", usuarioId: usuario.membroId });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Carta cancelada." } };
    return;
  }

  if (method === "POST" && acao === "processar") {
    const candidatas = await pool.request().query(`
      SELECT c.CartaId, c.MembroId, c.MotivoSaida,
             CONVERT(varchar(10), ISNULL(c.DataConfirmacao, c.DataSolicitacao), 120) AS dataBase,
             CONVERT(varchar(10), m.DataAdmissao, 120) AS dataAdmissao
      FROM CartasTransito c
      JOIN MembroReferencia m ON m.MembroId = c.MembroId
      WHERE c.Tipo = 'MUDANCA' AND c.Status IN ('CONFIRMADA','EMITIDA')`);

    let minimizadas = 0;
    let canceladas = 0;

    for (const c of candidatas.recordset) {
      const dias = estatuto.diasDesde(c.dataBase);
      if (c.dataAdmissao && c.dataBase && c.dataAdmissao > c.dataBase) {
        await pool.request().input("id", sql.Int, c.CartaId)
          .query(`UPDATE CartasTransito SET Status = 'CANCELADA' WHERE CartaId = @id`);
        canceladas++;
      } else if (dias !== null && dias >= DIAS_MINIMIZACAO) {
        await pool.request()
          .input("id", sql.Int, c.MembroId)
          .input("dataSaida", sql.Date, c.dataBase)
          .input("motivo", sql.NVarChar(200), c.MotivoSaida || "Carta de Mudança")
          .query(`UPDATE MembroReferencia SET
                  Status = 'DESLIGADO', SituacaoMembro = 'SEM_COMUNHAO',
                  Telefone = NULL, Email = NULL, Endereco = NULL,
                  Funcao = NULL, CargoMinisterial = NULL, DepartamentoId = NULL,
                  Origem = NULL, IgrejaAnterior = NULL, DataRitoRecebimento = NULL,
                  NomeLidoRito = NULL, MinistranteRito = NULL, DizimistaFiel = NULL,
                  CongregacaoId = NULL, ExtensaoId = NULL,
                  DataSaida = @dataSaida, MotivoSaida = @motivo
                  WHERE MembroId = @id`);
        await pool.request().input("id", sql.Int, c.CartaId)
          .query(`UPDATE CartasTransito SET Status = 'CONCLUIDA' WHERE CartaId = @id`);
        minimizadas++;
      }
    }

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: `✅ Processamento concluído: ${minimizadas} saída(s) minimizada(s), ${canceladas} carta(s) cancelada(s) por retorno.` }
    };
    return;
  }

  context.res = { status: 404, body: { sucesso: false, mensagem: "Ação não reconhecida. Use emitir, cancelar ou processar." } };
};

