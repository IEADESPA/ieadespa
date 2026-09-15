// GestaoTurmasBatismo (vB.11 — Esteira de Batismo, Regimento Art. 80)
// Permissão "consagracoes" — mesmo processo ministerial usado por
// CriarConsagracao/EvoluirConsagracao, não uma permissão nova.
// GET  /api/turmas-batismo         -> lista, com oficiantes
// POST /api/turmas-batismo         -> { dataBatismo, local, tipoLocal, congregacaoId?, oficiantesMembroIds:[] }
// PUT  /api/turmas-batismo/{id}    -> { acao: 'AUTORIZAR_MESA' | 'REALIZAR' | 'CANCELAR' }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { mesValidoParaTurma, localPermitido, efetivarTurma } = require("../shared/batismo");

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "consagracoes");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const turmas = (await pool.request().query(`
      SELECT t.TurmaId AS turmaId, CONVERT(varchar(10), t.DataBatismo, 120) AS dataBatismo,
             t.Local AS local, t.TipoLocal AS tipoLocal, t.AutorizacaoMesa AS autorizacaoMesa,
             t.CongregacaoId AS congregacaoId, cg.Nome AS congregacaoNome, t.Status AS status
      FROM TurmasBatismo t LEFT JOIN Congregacoes cg ON cg.CongregacaoId = t.CongregacaoId
      ORDER BY t.DataBatismo DESC
    `)).recordset;
    for (const turma of turmas) {
      const oficiantes = (await pool.request().input("id", sql.Int, turma.turmaId).query(`
        SELECT m.MembroId AS membroId, m.Nome AS nome FROM OficiantesBatismo o JOIN MembroReferencia m ON m.MembroId = o.MembroId WHERE o.TurmaId = @id
      `)).recordset;
      turma.oficiantes = oficiantes;
      const candidatos = (await pool.request().input("id", sql.Int, turma.turmaId).query(`SELECT COUNT(*) AS total FROM CandidatosBatismo WHERE TurmaId = @id`)).recordset[0];
      turma.totalCandidatos = candidatos.total;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: turmas };
    return;
  }

  if (req.method === "POST" && !id) {
    const { dataBatismo, local, tipoLocal, congregacaoId, oficiantesMembroIds } = req.body || {};
    if (!dataBatismo || !local || !local.trim() || !tipoLocal) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe dataBatismo, local e tipoLocal." } };
      return;
    }
    if (!mesValidoParaTurma(dataBatismo)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Batismo só pode ser marcado pra maio ou outubro (Regimento, Art. 80 §3º, I)." } };
      return;
    }
    if (!localPermitido(tipoLocal)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Rio e represa são locais vedados pro batismo (Regimento, Art. 80 §3º, II-III)." } };
      return;
    }
    const criada = await pool.request()
      .input("dataBatismo", sql.Date, dataBatismo).input("local", sql.NVarChar(200), local.trim())
      .input("tipoLocal", sql.NVarChar(30), tipoLocal.toUpperCase()).input("congregacaoId", sql.Int, congregacaoId || null)
      .input("criadoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO TurmasBatismo (DataBatismo, Local, TipoLocal, CongregacaoId, CriadoPor)
              OUTPUT INSERTED.TurmaId VALUES (@dataBatismo, @local, @tipoLocal, @congregacaoId, @criadoPor)`);
    const turmaId = criada.recordset[0].TurmaId;

    for (const membroId of Array.isArray(oficiantesMembroIds) ? oficiantesMembroIds : []) {
      await pool.request().input("turmaId", sql.Int, turmaId).input("membroId", sql.Int, membroId)
        .query(`INSERT INTO OficiantesBatismo (TurmaId, MembroId) VALUES (@turmaId, @membroId)`);
    }

    await registrarAuditoria({ tabela: "TurmasBatismo", registroId: turmaId, acao: "Criou turma de batismo", usuarioId: usuario.membroId, dadosDepois: { dataBatismo, local, tipoLocal } });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Turma de batismo criada.", turmaId } };
    return;
  }

  if (req.method === "PUT" && id) {
    const { acao } = req.body || {};
    const turma = (await pool.request().input("id", sql.Int, id).query(`SELECT Status, AutorizacaoMesa FROM TurmasBatismo WHERE TurmaId = @id`)).recordset[0];
    if (!turma) {
      context.res = { status: 404, body: { sucesso: false, mensagem: "Turma não encontrada." } };
      return;
    }

    if (acao === "AUTORIZAR_MESA") {
      await pool.request().input("id", sql.Int, id).query(`UPDATE TurmasBatismo SET AutorizacaoMesa = 1 WHERE TurmaId = @id`);
      await registrarAuditoria({ tabela: "TurmasBatismo", registroId: Number(id), acao: "Registrou autorização da Mesa", usuarioId: usuario.membroId });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Autorização da Mesa registrada." } };
      return;
    }

    if (acao === "REALIZAR") {
      if (turma.Status !== "ABERTA") {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Esta turma já foi concluída/cancelada." } };
        return;
      }
      if (!turma.AutorizacaoMesa) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Falta a autorização da Mesa (Regimento, Art. 80 §1º) antes de realizar o batismo." } };
        return;
      }
      await pool.request().input("id", sql.Int, id).query(`UPDATE TurmasBatismo SET Status = 'REALIZADA' WHERE TurmaId = @id`);
      const efetivados = await efetivarTurma(pool, id);
      await registrarAuditoria({ tabela: "TurmasBatismo", registroId: Number(id), acao: `Realizou o batismo (${efetivados} candidato(s) efetivado(s))`, usuarioId: usuario.membroId });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Batismo realizado — ${efetivados} candidato(s) agora em comunhão.`, efetivados } };
      return;
    }

    if (acao === "CANCELAR") {
      await pool.request().input("id", sql.Int, id).query(`UPDATE TurmasBatismo SET Status = 'CANCELADA' WHERE TurmaId = @id`);
      await pool.request().input("id", sql.Int, id).query(`UPDATE CandidatosBatismo SET TurmaId = NULL, Status = 'AGUARDANDO_TURMA' WHERE TurmaId = @id AND Status = 'APROVADO'`);
      await registrarAuditoria({ tabela: "TurmasBatismo", registroId: Number(id), acao: "Cancelou turma de batismo", usuarioId: usuario.membroId });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Turma cancelada — candidatos voltaram pra fila." } };
      return;
    }

    context.res = { status: 400, body: { sucesso: false, mensagem: "Ação inválida. Use AUTORIZAR_MESA, REALIZAR ou CANCELAR." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Requisição inválida." } };
};
