// GestaoCandidatosBatismo (vB.11 — Esteira de Batismo, Regimento Art. 80)
// Permissão "consagracoes". Aptidão (Art. 80 §2º) sempre recalculada na
// leitura (shared/batismo.js) — nunca um booleano digitado à mão.
// GET  /api/candidatos-batismo?turmaId=&status=  -> lista, com aptidão calculada
// POST /api/candidatos-batismo                    -> { membroId } -> inscreve
// PUT  /api/candidatos-batismo/{id}               -> ações abaixo
//      ATRIBUIR_TURMA { turmaId } | PARECER { parecerVidaPregressa, observacao? }
//      DISCIPULADO_CONCLUIDO { concluido } | ACEITAR_ESTATUTO {}
//      APROVAR {} (exige aptidão completa) | REPROVAR { motivo }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { calcularAptidaoBatismo, registrarAceiteEstatuto } = require("../shared/batismo");

const SELECT_CANDIDATO = `
  SELECT c.CandidatoId AS candidatoId, c.MembroId AS membroId, m.Nome AS nome,
         CONVERT(varchar(10), m.DataNascimento, 120) AS dataNascimento, m.EstadoCivil AS estadoCivil,
         c.TurmaId AS turmaId, c.Status AS status, c.ParecerVidaPregressa AS parecerVidaPregressa,
         c.ParecerObservacao AS parecerObservacao, c.DiscipuladoConcluidoManual AS discipuladoConcluidoManual,
         c.MotivoReprovacao AS motivoReprovacao, c.AceiteTermoAssinadoId AS aceiteTermoAssinadoId,
         CONVERT(varchar(10), c.DataInscricao, 120) AS dataInscricao
  FROM CandidatosBatismo c JOIN MembroReferencia m ON m.MembroId = c.MembroId`;

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "consagracoes");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const { turmaId, status } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (turmaId) { request.input("turmaId", sql.Int, turmaId); where += " AND c.TurmaId = @turmaId"; }
    if (status) { request.input("status", sql.NVarChar(20), status); where += " AND c.Status = @status"; }
    const candidatos = (await request.query(`${SELECT_CANDIDATO} WHERE ${where} ORDER BY c.DataInscricao`)).recordset;
    for (const candidato of candidatos) {
      candidato.aptidao = await calcularAptidaoBatismo(pool, candidato);
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: candidatos };
    return;
  }

  if (req.method === "POST" && !id) {
    const { membroId } = req.body || {};
    if (!membroId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe membroId." } };
      return;
    }
    const membro = (await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id AND Status = 'ATIVO'`)).recordset;
    if (membro.length === 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Matrícula não encontrada ou inativa." } };
      return;
    }
    const existente = await pool.request().input("id", sql.Int, membroId).query(`SELECT 1 FROM CandidatosBatismo WHERE MembroId = @id`);
    if (existente.recordset.length > 0) {
      context.res = { status: 409, body: { sucesso: false, mensagem: "Esta matrícula já tem candidatura de batismo (ativa ou já batizada)." } };
      return;
    }
    const criado = await pool.request().input("membroId", sql.Int, membroId)
      .query(`INSERT INTO CandidatosBatismo (MembroId) OUTPUT INSERTED.CandidatoId VALUES (@membroId)`);
    const candidatoId = criado.recordset[0].CandidatoId;
    await registrarAuditoria({ tabela: "CandidatosBatismo", registroId: candidatoId, acao: "Inscreveu candidato ao batismo", usuarioId: usuario.membroId, dadosDepois: { membroId } });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Candidato inscrito.", candidatoId } };
    return;
  }

  if (req.method === "PUT" && id) {
    const { acao } = req.body || {};
    const candidato = (await pool.request().input("id", sql.Int, id).query(`${SELECT_CANDIDATO} WHERE c.CandidatoId = @id`)).recordset[0];
    if (!candidato) {
      context.res = { status: 404, body: { sucesso: false, mensagem: "Candidato não encontrado." } };
      return;
    }

    if (acao === "ATRIBUIR_TURMA") {
      const { turmaId } = req.body || {};
      if (!turmaId) { context.res = { status: 400, body: { sucesso: false, mensagem: "Informe turmaId." } }; return; }
      const turma = (await pool.request().input("id", sql.Int, turmaId).query(`SELECT Status FROM TurmasBatismo WHERE TurmaId = @id`)).recordset[0];
      if (!turma || turma.Status !== "ABERTA") {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Turma inválida ou já encerrada." } };
        return;
      }
      await pool.request().input("id", sql.Int, id).input("turmaId", sql.Int, turmaId).query(`UPDATE CandidatosBatismo SET TurmaId = @turmaId WHERE CandidatoId = @id`);
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Candidato atribuído à turma." } };
      return;
    }

    if (acao === "PARECER") {
      const { parecerVidaPregressa, observacao } = req.body || {};
      if (!["FAVORAVEL", "DESFAVORAVEL"].includes(parecerVidaPregressa)) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Informe parecerVidaPregressa: FAVORAVEL ou DESFAVORAVEL." } };
        return;
      }
      await pool.request().input("id", sql.Int, id).input("parecer", sql.NVarChar(20), parecerVidaPregressa)
        .input("obs", sql.NVarChar(500), observacao || null).input("por", sql.Int, usuario.membroId)
        .query(`UPDATE CandidatosBatismo SET ParecerVidaPregressa = @parecer, ParecerObservacao = @obs, ParecerPor = @por WHERE CandidatoId = @id`);
      await registrarAuditoria({ tabela: "CandidatosBatismo", registroId: Number(id), acao: `Registrou parecer de vida pregressa: ${parecerVidaPregressa}`, usuarioId: usuario.membroId });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Parecer registrado." } };
      return;
    }

    if (acao === "DISCIPULADO_CONCLUIDO") {
      const { concluido } = req.body || {};
      await pool.request().input("id", sql.Int, id).input("concluido", sql.Bit, !!concluido)
        .query(`UPDATE CandidatosBatismo SET DiscipuladoConcluidoManual = @concluido WHERE CandidatoId = @id`);
      context.res = {
        status: 200, headers: { "Content-Type": "application/json" },
        body: { sucesso: true, mensagem: "✅ Atestação de discipulado registrada (manual — a v6.9 vai verificar isso de verdade)." }
      };
      return;
    }

    if (acao === "ACEITAR_ESTATUTO") {
      if (candidato.aceiteTermoAssinadoId) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Este candidato já aceitou o Estatuto/Regimento." } };
        return;
      }
      const termoId = await registrarAceiteEstatuto(pool, candidato.membroId);
      await pool.request().input("id", sql.Int, id).input("termoId", sql.Int, termoId).query(`UPDATE CandidatosBatismo SET AceiteTermoAssinadoId = @termoId WHERE CandidatoId = @id`);
      await registrarAuditoria({ tabela: "CandidatosBatismo", registroId: Number(id), acao: "Registrou aceite eletrônico do Estatuto/Regimento (Art. 80 §2º, V)", usuarioId: usuario.membroId });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Aceite do Estatuto/Regimento registrado." } };
      return;
    }

    if (acao === "APROVAR") {
      const aptidao = await calcularAptidaoBatismo(pool, candidato);
      if (!aptidao.apto) {
        const pendencias = Object.entries(aptidao.itens).filter(([, v]) => !v.ok).map(([, v]) => v.detalhe);
        context.res = { status: 200, body: { sucesso: false, mensagem: `Candidato ainda não está apto: ${pendencias.join("; ")}.` } };
        return;
      }
      if (!candidato.aceiteTermoAssinadoId) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Falta o aceite eletrônico do Estatuto/Regimento (Art. 80 §2º, V)." } };
        return;
      }
      await pool.request().input("id", sql.Int, id).query(`UPDATE CandidatosBatismo SET Status = 'APROVADO' WHERE CandidatoId = @id`);
      await registrarAuditoria({ tabela: "CandidatosBatismo", registroId: Number(id), acao: "Aprovou candidato ao batismo", usuarioId: usuario.membroId });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Candidato aprovado." } };
      return;
    }

    if (acao === "REPROVAR") {
      const { motivo } = req.body || {};
      if (!motivo || !motivo.trim()) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o motivo da reprovação." } };
        return;
      }
      // Permanece na fila pra turma seguinte (Regimento — não recomeça o
      // cadastro), só sai da turma atual e some da lista de "aprovados".
      await pool.request().input("id", sql.Int, id).input("motivo", sql.NVarChar(300), motivo.trim())
        .query(`UPDATE CandidatosBatismo SET Status = 'AGUARDANDO_TURMA', TurmaId = NULL, MotivoReprovacao = @motivo WHERE CandidatoId = @id`);
      await registrarAuditoria({ tabela: "CandidatosBatismo", registroId: Number(id), acao: `Reprovou candidato (${motivo.trim()}) — volta pra fila`, usuarioId: usuario.membroId });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Candidato voltou pra fila da turma seguinte." } };
      return;
    }

    context.res = { status: 400, body: { sucesso: false, mensagem: "Ação inválida." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Requisição inválida." } };
};
