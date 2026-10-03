// GestaoTurmasBatismo (vB.11 — Esteira de Batismo, Regimento Art. 80)
// Permissão "consagracoes" — mesmo processo ministerial usado por
// CriarConsagracao/EvoluirConsagracao, não uma permissão nova.
// GET  /api/turmas-batismo         -> lista, com oficiantes
// POST /api/turmas-batismo         -> { dataBatismo, local, tipoLocal, congregacaoId?, oficiantesMembroIds:[] }
// PUT  /api/turmas-batismo/{id}    -> { acao: 'AUTORIZAR_MESA' | 'REALIZAR' | 'CANCELAR' }
//
// Auditoria de escopo (02/10/2026): a turma é dado de CONGREGAÇÃO (TurmasBatismo.CongregacaoId; nulo = turma da igreja toda).
//  - a lista só traz turmas do escopo de quem consulta; turma sem congregação só o nível geral enxerga;
//  - criar: a congregação indicada (o DESTINO) precisa estar no escopo, e turma sem congregação só o nível geral cria; os oficiantes precisam ser pessoas do escopo;
//  - agir sobre turma de fora do escopo responde igual a "turma não encontrada";
//  - AUTORIZAR_MESA (a autorização da Mesa) e REALIZAR (efetiva os batizados como membros em comunhão) são decisão da administração geral: só o nível GERAL;
//  - o estado da turma vai no WHERE (turma já realizada ou cancelada não muda de novo).
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { mesValidoParaTurma, localPermitido, efetivarTurma, turmaNoEscopo } = require("../shared/batismo");
const { exigirGeral, ehGeral, pessoaAlcancavel, congregacaoNoEscopo, FORA_DO_ESCOPO } = require("../shared/escopoRotas");

const ACOES_DO_GERAL = ["AUTORIZAR_MESA", "REALIZAR"];
const MAX_OFICIANTES = 30;
const afetadas = (r) => (r && r.rowsAffected && r.rowsAffected[0]) || 0;

module.exports = async function (context, req) {
  const idBruto = context.bindingData.id;
  const acaoPedida = req.method === "PUT" && req.body ? req.body.acao : undefined;
  const usuario = ACOES_DO_GERAL.includes(acaoPedida)
    ? exigirGeral(req, context, "consagracoes")
    : auth.exigirPermissao(req, context, "consagracoes");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !idBruto) {
    const todas = (await pool.request().query(`
      SELECT t.TurmaId AS turmaId, CONVERT(varchar(10), t.DataBatismo, 120) AS dataBatismo,
             t.Local AS local, t.TipoLocal AS tipoLocal, t.AutorizacaoMesa AS autorizacaoMesa,
             t.CongregacaoId AS congregacaoId, cg.Nome AS congregacaoNome, t.Status AS status
      FROM TurmasBatismo t LEFT JOIN Congregacoes cg ON cg.CongregacaoId = t.CongregacaoId
      ORDER BY t.DataBatismo DESC
    `)).recordset;
    const turmas = todas.filter((t) => turmaNoEscopo(usuario, t));
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

  if (req.method === "POST" && !idBruto) {
    const { dataBatismo, local, tipoLocal, congregacaoId, oficiantesMembroIds } = req.body || {};
    if (!dataBatismo || !local || typeof local !== "string" || !local.trim() || !tipoLocal) {
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

    // Destino: a congregação da turma precisa estar no escopo; turma sem congregação (da igreja toda) só o geral cria.
    let congregacaoDaTurma = null;
    if (congregacaoId !== undefined && congregacaoId !== null && congregacaoId !== "") {
      if (!(await congregacaoNoEscopo(pool, usuario, congregacaoId))) {
        context.res = ehGeral(usuario)
          ? { status: 400, body: { sucesso: false, mensagem: "Congregação não encontrada." } }
          : { status: 403, body: FORA_DO_ESCOPO };
        return;
      }
      congregacaoDaTurma = auth.idDeRota(congregacaoId);
    } else if (!ehGeral(usuario)) {
      context.res = { status: 403, body: FORA_DO_ESCOPO };
      return;
    }

    // Oficiantes: matrículas válidas, sem repetição, de pessoas do escopo (inexistente e fora do escopo dão a mesma recusa) — validado ANTES de gravar qualquer coisa.
    const pedidos = Array.isArray(oficiantesMembroIds) ? oficiantesMembroIds : [];
    const oficiantes = [];
    if (pedidos.length > MAX_OFICIANTES) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `No máximo ${MAX_OFICIANTES} oficiantes por turma.` } };
      return;
    }
    for (const pedido of pedidos) {
      const pessoa = await pessoaAlcancavel(pool, usuario, pedido);
      if (!pessoa) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Oficiante inválido ou fora do seu escopo. Confira as matrículas." } };
        return;
      }
      if (!oficiantes.includes(pessoa.membroId)) oficiantes.push(pessoa.membroId);
    }

    const criada = await pool.request()
      .input("dataBatismo", sql.Date, dataBatismo).input("local", sql.NVarChar(200), local.trim())
      .input("tipoLocal", sql.NVarChar(30), String(tipoLocal).toUpperCase()).input("congregacaoId", sql.Int, congregacaoDaTurma)
      .input("criadoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO TurmasBatismo (DataBatismo, Local, TipoLocal, CongregacaoId, CriadoPor)
              OUTPUT INSERTED.TurmaId VALUES (@dataBatismo, @local, @tipoLocal, @congregacaoId, @criadoPor)`);
    const turmaId = criada.recordset[0].TurmaId;

    for (const membroId of oficiantes) {
      await pool.request().input("turmaId", sql.Int, turmaId).input("membroId", sql.Int, membroId)
        .query(`INSERT INTO OficiantesBatismo (TurmaId, MembroId) VALUES (@turmaId, @membroId)`);
    }

    await registrarAuditoria({ tabela: "TurmasBatismo", registroId: turmaId, acao: "Criou turma de batismo", usuarioId: usuario.membroId, dadosDepois: { dataBatismo, local, tipoLocal, congregacaoId: congregacaoDaTurma, oficiantes } });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Turma de batismo criada.", turmaId } };
    return;
  }

  if (req.method === "PUT" && idBruto) {
    const naoEncontrada = () => { context.res = { status: 404, body: { sucesso: false, mensagem: "Turma não encontrada." } }; };
    const id = auth.idDeRota(idBruto);
    if (!id) { naoEncontrada(); return; }
    const { acao } = req.body || {};
    const turma = (await pool.request().input("id", sql.Int, id).query(`
      SELECT t.Status, t.AutorizacaoMesa, t.CongregacaoId AS congregacaoId, cg.Nome AS congregacaoNome
      FROM TurmasBatismo t LEFT JOIN Congregacoes cg ON cg.CongregacaoId = t.CongregacaoId WHERE t.TurmaId = @id`)).recordset[0];
    // Turma de fora do escopo = "não existe".
    if (!turma || !turmaNoEscopo(usuario, turma)) {
      naoEncontrada();
      return;
    }

    if (acao === "AUTORIZAR_MESA") {
      if (turma.Status !== "ABERTA") {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Esta turma já foi concluída/cancelada." } };
        return;
      }
      await pool.request().input("id", sql.Int, id).query(`UPDATE TurmasBatismo SET AutorizacaoMesa = 1 WHERE TurmaId = @id AND Status = 'ABERTA'`);
      await registrarAuditoria({ tabela: "TurmasBatismo", registroId: id, acao: "Registrou autorização da Mesa", usuarioId: usuario.membroId });
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
      const realizou = await pool.request().input("id", sql.Int, id).query(`UPDATE TurmasBatismo SET Status = 'REALIZADA' WHERE TurmaId = @id AND Status = 'ABERTA'`);
      if (afetadas(realizou) !== 1) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Esta turma já foi concluída/cancelada." } };
        return;
      }
      const efetivados = await efetivarTurma(pool, id);
      await registrarAuditoria({ tabela: "TurmasBatismo", registroId: id, acao: `Realizou o batismo (${efetivados} candidato(s) efetivado(s))`, usuarioId: usuario.membroId });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Batismo realizado — ${efetivados} candidato(s) agora em comunhão.`, efetivados } };
      return;
    }

    if (acao === "CANCELAR") {
      if (turma.Status !== "ABERTA") {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Esta turma já foi concluída/cancelada." } };
        return;
      }
      const cancelou = await pool.request().input("id", sql.Int, id).query(`UPDATE TurmasBatismo SET Status = 'CANCELADA' WHERE TurmaId = @id AND Status = 'ABERTA'`);
      if (afetadas(cancelou) !== 1) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Esta turma já foi concluída/cancelada." } };
        return;
      }
      await pool.request().input("id", sql.Int, id).query(`UPDATE CandidatosBatismo SET TurmaId = NULL, Status = 'AGUARDANDO_TURMA' WHERE TurmaId = @id AND Status = 'APROVADO'`);
      await registrarAuditoria({ tabela: "TurmasBatismo", registroId: id, acao: "Cancelou turma de batismo", usuarioId: usuario.membroId });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Turma cancelada — candidatos voltaram pra fila." } };
      return;
    }

    context.res = { status: 400, body: { sucesso: false, mensagem: "Ação inválida. Use AUTORIZAR_MESA, REALIZAR ou CANCELAR." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Requisição inválida." } };
};
