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
//
// ESCOPO: a carta é da PESSOA — lista, emissão, cancelamento e o "processar" só alcançam as cartas de quem está na congregação que o usuário alcança
// (shared/escopoRotas.js); carta de fora do escopo tem a MESMA resposta de "não encontrada". O "processar" é irreversível (zera contatos e desliga o membro), então cada
// minimização e cada cancelamento por retorno deixam trilha de auditoria.
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const estatuto = require("../shared/estatuto");
const { diasMinimizacaoExMembro, minimizarCamposExMembro } = require("../shared/minimizacaoLgpd");
const { filtrarPorEscopo, pessoaAlcancavel } = require("../shared/escopoRotas");

const SELECT_LISTA = `
  SELECT c.CartaId AS cartaId, c.MembroId AS membroId, m.Nome AS nome, cg.Nome AS congregacao,
         c.Tipo AS tipo, c.Status AS status, c.Destino AS destino, c.MotivoSaida AS motivoSaida,
         c.DeclaracaoCiencia AS declaracaoCiencia,
         CONVERT(varchar(10), c.DataEmissao, 120) AS dataEmissao,
         CONVERT(varchar(10), c.DataValidade, 120) AS dataValidade,
         CONVERT(varchar(10), ISNULL(c.DataConfirmacao, c.DataSolicitacao), 120) AS dataPedido,
         CONVERT(varchar(10), m.DataAdmissao, 120) AS dataAdmissao,
         COALESCE(cm.Nome, m.Funcao) AS funcao, m.CargoMinisterial AS cargoMinisterial,
         m.SituacaoMembro AS situacaoMembro, m.EstadoCivil AS estadoCivil, m.Status AS statusMembro,
         c.ManterAcessoSite AS manterAcessoSite, ex.Nome AS extensaoNome
  FROM CartasTransito c
  JOIN MembroReferencia m ON m.MembroId = c.MembroId
  LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
  LEFT JOIN ExtensoesTenda ex ON ex.ExtensaoId = m.ExtensaoId
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
    const visiveis = filtrarPorEscopo(usuario, result.recordset, c => c.congregacao, c => c.extensaoNome)
      .map(({ extensaoNome, ...resto }) => resto);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: visiveis };
    return;
  }

  if (method === "POST" && acao === "emitir") {
    const { cartaId: cartaIdBruto } = req.body || {};
    if (!cartaIdBruto) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe cartaId." } };
      return;
    }
    const cartaId = auth.idDeRota(cartaIdBruto);
    const cartaResult = cartaId ? await pool.request().input("id", sql.Int, cartaId).query(`SELECT Tipo, Status, MembroId FROM CartasTransito WHERE CartaId = @id`) : { recordset: [] };
    const carta = cartaResult.recordset[0];
    // Carta inexistente e carta de pessoa fora do escopo: a mesma resposta.
    if (!carta || !(await pessoaAlcancavel(pool, usuario, carta.MembroId))) {
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
    // Só emite quem ainda a encontra SOLICITADA/CONFIRMADA (duas emissões ao mesmo tempo não se atropelam).
    const upd = await pool.request()
      .input("id", sql.Int, cartaId)
      .input("hoje", sql.Date, dataISO(hoje))
      .input("validade", sql.Date, validade)
      .input("emitidoPor", sql.Int, usuario.membroId)
      .query(`UPDATE CartasTransito SET Status = 'EMITIDA', DataEmissao = @hoje, DataValidade = @validade, EmitidoPor = @emitidoPor WHERE CartaId = @id AND Status IN ('SOLICITADA','CONFIRMADA')`);
    if (upd.rowsAffected[0] === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Carta não pode ser emitida (o status mudou)." } };
      return;
    }
    await registrarAuditoria({ tabela: "CartasTransito", registroId: Number(cartaId), acao: "Emitiu carta", usuarioId: usuario.membroId, dadosDepois: { status: "EMITIDA", validade } });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Carta emitida." } };
    return;
  }

  if (method === "POST" && acao === "cancelar") {
    const { cartaId: cartaIdBruto } = req.body || {};
    if (!cartaIdBruto) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe cartaId." } };
      return;
    }
    const cartaId = auth.idDeRota(cartaIdBruto);
    const carta = cartaId ? (await pool.request().input("id", sql.Int, cartaId).query(`SELECT MembroId FROM CartasTransito WHERE CartaId = @id`)).recordset[0] : null;
    if (!carta || !(await pessoaAlcancavel(pool, usuario, carta.MembroId))) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Carta não encontrada ou já concluída." } };
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
    // (o apelido da data não pode se chamar "dataBase": DATABASE é palavra reservada do SQL Server e a consulta daria erro)
    const candidatasResult = await pool.request().query(`
      SELECT c.CartaId, c.MembroId, c.MotivoSaida,
             CONVERT(varchar(10), ISNULL(c.DataConfirmacao, c.DataSolicitacao), 120) AS dataReferencia,
             CONVERT(varchar(10), m.DataAdmissao, 120) AS dataAdmissao,
             cg.Nome AS congregacaoNome, ex.Nome AS extensaoNome
      FROM CartasTransito c
      JOIN MembroReferencia m ON m.MembroId = c.MembroId
      LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
      LEFT JOIN ExtensoesTenda ex ON ex.ExtensaoId = m.ExtensaoId
      WHERE c.Tipo = 'MUDANCA' AND c.Status IN ('CONFIRMADA','EMITIDA')`);
    // Só as cartas de quem está no escopo de quem aciona o processamento.
    const candidatas = filtrarPorEscopo(usuario, candidatasResult.recordset, c => c.congregacaoNome, c => c.extensaoNome);

    // vB.8 — o prazo agora vem de PoliticasRetencao (antes era um número
    // fixo no código, sem nenhuma relação com o catálogo de retenção).
    const diasMinimizacao = await diasMinimizacaoExMembro(pool);
    let minimizadas = 0;
    let canceladas = 0;

    for (const c of candidatas) {
      const dias = estatuto.diasDesde(c.dataReferencia);
      if (c.dataAdmissao && c.dataReferencia && c.dataAdmissao > c.dataReferencia) {
        await pool.request().input("id", sql.Int, c.CartaId)
          .query(`UPDATE CartasTransito SET Status = 'CANCELADA' WHERE CartaId = @id`);
        await registrarAuditoria({
          tabela: "CartasTransito", registroId: Number(c.CartaId), acao: "Cancelou carta por retorno do membro (processamento)", usuarioId: usuario.membroId,
          dadosDepois: { status: "CANCELADA", membroId: c.MembroId }
        });
        canceladas++;
      } else if (dias !== null && dias >= diasMinimizacao) {
        await minimizarCamposExMembro(pool, c.MembroId, { dataSaida: c.dataReferencia, motivo: c.MotivoSaida });
        await pool.request().input("id", sql.Int, c.CartaId)
          .query(`UPDATE CartasTransito SET Status = 'CONCLUIDA' WHERE CartaId = @id`);
        // Irreversível (contatos e vínculo territorial zerados): fica na trilha QUEM mandou processar e QUAL carta, sem repetir o dado minimizado.
        await registrarAuditoria({
          tabela: "MembroReferencia", registroId: Number(c.MembroId), acao: "Minimizou dados de ex-membro (Carta de Mudança, Art. 132 §2º)", usuarioId: usuario.membroId,
          dadosDepois: { cartaId: c.CartaId, diasDesdeOPedido: dias }
        });
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
