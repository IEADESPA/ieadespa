// GestaoCandidatosBatismo (vB.11 — Esteira de Batismo, Regimento Art. 80)
// Permissão "consagracoes". Aptidão (Art. 80 §2º) sempre recalculada na
// leitura (shared/batismo.js) — nunca um booleano digitado à mão.
// GET  /api/candidatos-batismo?turmaId=&status=  -> lista, com aptidão calculada
// POST /api/candidatos-batismo                    -> { membroId } -> inscreve
// PUT  /api/candidatos-batismo/{id}               -> ações abaixo
//      ATRIBUIR_TURMA { turmaId } | PARECER { parecerVidaPregressa, observacao? }
//      DISCIPULADO_CONCLUIDO { concluido } | ACEITAR_ESTATUTO {}
//      APROVAR {} (exige aptidão completa) | REPROVAR { motivo }
//
// Auditoria de escopo (02/10/2026): o candidato é uma PESSOA (nascimento, estado civil, parecer de vida pregressa) — vale a congregação dela:
//  - a lista só traz candidatos do escopo de quem consulta; inscrever e agir sobre candidato de fora do escopo responde igual a "não encontrado";
//  - ATRIBUIR_TURMA confere candidato E turma (a turma com congregação precisa estar no escopo; turma sem congregação só o nível geral);
//  - ATRIBUIR_TURMA e DISCIPULADO_CONCLUIDO passam a ficar na trilha de auditoria; APROVAR só sai de AGUARDANDO_TURMA (e com o estado no WHERE); um já BATIZADO não é
//    reatribuído nem reprovado (isso desfaria o registro do batismo).
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { calcularAptidaoBatismo, registrarAceiteEstatuto, turmaNoEscopo } = require("../shared/batismo");
const { registrarAceiteClausulaCompromissoria } = require("../shared/mediacaoArbitragem");
const trilhas = require("../shared/trilhas");
const { noEscopoDaPessoa, pessoaAlcancavel } = require("../shared/escopoRotas");

const SELECT_CANDIDATO = `
  SELECT c.CandidatoId AS candidatoId, c.MembroId AS membroId, m.Nome AS nome,
         CONVERT(varchar(10), m.DataNascimento, 120) AS dataNascimento, m.EstadoCivil AS estadoCivil,
         c.TurmaId AS turmaId, c.Status AS status, c.ParecerVidaPregressa AS parecerVidaPregressa,
         c.ParecerObservacao AS parecerObservacao, c.DiscipuladoConcluidoManual AS discipuladoConcluidoManual,
         c.MotivoReprovacao AS motivoReprovacao, c.AceiteTermoAssinadoId AS aceiteTermoAssinadoId,
         CONVERT(varchar(10), c.DataInscricao, 120) AS dataInscricao,
         cg.Nome AS congregacaoNome, ex.Nome AS extensaoNome
  FROM CandidatosBatismo c JOIN MembroReferencia m ON m.MembroId = c.MembroId
  LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
  LEFT JOIN ExtensoesTenda ex ON ex.ExtensaoId = m.ExtensaoId`;

const afetadas = (r) => (r && r.rowsAffected && r.rowsAffected[0]) || 0;

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "consagracoes");
  if (!usuario) return;
  const idBruto = context.bindingData.id;
  const pool = await getPool();

  if (req.method === "GET" && !idBruto) {
    const { turmaId, status } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (turmaId) {
      const turma = auth.idDeRota(turmaId);
      if (!turma) { context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: [] }; return; }
      request.input("turmaId", sql.Int, turma);
      where += " AND c.TurmaId = @turmaId";
    }
    if (status) { request.input("status", sql.NVarChar(20), String(status)); where += " AND c.Status = @status"; }
    const todos = (await request.query(`${SELECT_CANDIDATO} WHERE ${where} ORDER BY c.DataInscricao`)).recordset;
    // Só calcula a aptidão (várias consultas por candidato) de quem está no escopo.
    const candidatos = todos.filter((c) => noEscopoDaPessoa(usuario, c.congregacaoNome, c.extensaoNome));
    for (const candidato of candidatos) {
      candidato.aptidao = await calcularAptidaoBatismo(pool, candidato);
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: candidatos };
    return;
  }

  if (req.method === "POST" && !idBruto) {
    const { membroId: membroInformado } = req.body || {};
    if (!membroInformado) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe membroId." } };
      return;
    }
    // Inexistente, malformada, inativa e fora do escopo dão a MESMA resposta.
    const pessoa = await pessoaAlcancavel(pool, usuario, membroInformado);
    if (!pessoa || pessoa.status !== "ATIVO") {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Matrícula não encontrada ou inativa." } };
      return;
    }
    const membroId = pessoa.membroId;
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

  if (req.method === "PUT" && idBruto) {
    const naoEncontrado = () => { context.res = { status: 404, body: { sucesso: false, mensagem: "Candidato não encontrado." } }; };
    const id = auth.idDeRota(idBruto);
    if (!id) { naoEncontrado(); return; }
    const { acao } = req.body || {};
    const candidato = (await pool.request().input("id", sql.Int, id).query(`${SELECT_CANDIDATO} WHERE c.CandidatoId = @id`)).recordset[0];
    // Candidato de fora do escopo = "não existe".
    if (!candidato || !noEscopoDaPessoa(usuario, candidato.congregacaoNome, candidato.extensaoNome)) {
      naoEncontrado();
      return;
    }

    if (acao === "ATRIBUIR_TURMA") {
      const { turmaId: turmaInformada } = req.body || {};
      if (!turmaInformada) { context.res = { status: 400, body: { sucesso: false, mensagem: "Informe turmaId." } }; return; }
      if (candidato.status === "BATIZADO") {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Este candidato já foi batizado." } };
        return;
      }
      const turmaId = auth.idDeRota(turmaInformada);
      const turma = turmaId
        ? (await pool.request().input("id", sql.Int, turmaId).query(`
            SELECT t.Status, t.CongregacaoId AS congregacaoId, cg.Nome AS congregacaoNome
            FROM TurmasBatismo t LEFT JOIN Congregacoes cg ON cg.CongregacaoId = t.CongregacaoId WHERE t.TurmaId = @id`)).recordset[0]
        : null;
      // Turma inexistente, encerrada ou de fora do escopo: a mesma resposta.
      if (!turma || turma.Status !== "ABERTA" || !turmaNoEscopo(usuario, turma)) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Turma inválida ou já encerrada." } };
        return;
      }
      await pool.request().input("id", sql.Int, id).input("turmaId", sql.Int, turmaId).query(`UPDATE CandidatosBatismo SET TurmaId = @turmaId WHERE CandidatoId = @id`);
      await registrarAuditoria({ tabela: "CandidatosBatismo", registroId: id, acao: "Atribuiu candidato à turma de batismo", usuarioId: usuario.membroId, dadosDepois: { turmaId } });
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
        .input("obs", sql.NVarChar(500), observacao ? String(observacao).slice(0, 500) : null).input("por", sql.Int, usuario.membroId)
        .query(`UPDATE CandidatosBatismo SET ParecerVidaPregressa = @parecer, ParecerObservacao = @obs, ParecerPor = @por WHERE CandidatoId = @id`);
      await registrarAuditoria({ tabela: "CandidatosBatismo", registroId: id, acao: `Registrou parecer de vida pregressa: ${parecerVidaPregressa}`, usuarioId: usuario.membroId });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Parecer registrado." } };
      return;
    }

    if (acao === "DISCIPULADO_CONCLUIDO") {
      // v6.9 — com trilha configurada como requisito, a conclusão é VERIFICADA
      // (shared/batismo.js::calcularAptidaoBatismo); a atestação manual deixa
      // de valer e de ser aceita, pra ninguém achar que marcou algo que o
      // cálculo ignora.
      const formacao = await trilhas.avaliarRequisitos(pool, { contexto: "BATISMO_DISCIPULADO", membroId: candidato.membroId });
      if (formacao.temRequisitos) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "O discipulado deste fluxo é verificado por trilha de formação — não há atestação manual. Situação atual: " + (formacao.bloqueado ? formacao.mensagemBloqueio : "formação vigente.") } };
        return;
      }
      const { concluido } = req.body || {};
      await pool.request().input("id", sql.Int, id).input("concluido", sql.Bit, !!concluido)
        .query(`UPDATE CandidatosBatismo SET DiscipuladoConcluidoManual = @concluido WHERE CandidatoId = @id`);
      await registrarAuditoria({ tabela: "CandidatosBatismo", registroId: id, acao: `Atestou discipulado manualmente: ${concluido ? "concluído" : "não concluído"}`, usuarioId: usuario.membroId });
      context.res = {
        status: 200, headers: { "Content-Type": "application/json" },
        body: { sucesso: true, mensagem: "✅ Atestação de discipulado registrada (manual — nenhuma trilha de discipulado está configurada como requisito)." }
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
      // vB.16 (Art. 161-A) — o aceite do Estatuto/Regimento na esteira de
      // batismo é o outro gancho natural pra cláusula compromissória: é o
      // momento em que a pessoa vira membro, antes de qualquer conflito existir.
      await registrarAceiteClausulaCompromissoria(pool, candidato.membroId);
      await registrarAuditoria({ tabela: "CandidatosBatismo", registroId: id, acao: "Registrou aceite eletrônico do Estatuto/Regimento (Art. 80 §2º, V)", usuarioId: usuario.membroId });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Aceite do Estatuto/Regimento registrado." } };
      return;
    }

    if (acao === "APROVAR") {
      // Só quem está na fila (AGUARDANDO_TURMA) é aprovado: um já APROVADO ou BATIZADO não passa de novo.
      if (candidato.status !== "AGUARDANDO_TURMA") {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Candidato com status "${candidato.status}" não pode ser aprovado.` } };
        return;
      }
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
      const aprovou = await pool.request().input("id", sql.Int, id)
        .query(`UPDATE CandidatosBatismo SET Status = 'APROVADO' WHERE CandidatoId = @id AND Status = 'AGUARDANDO_TURMA'`);
      if (afetadas(aprovou) !== 1) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "O status deste candidato mudou enquanto você olhava. Atualize a lista." } };
        return;
      }
      await registrarAuditoria({ tabela: "CandidatosBatismo", registroId: id, acao: "Aprovou candidato ao batismo", usuarioId: usuario.membroId });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Candidato aprovado." } };
      return;
    }

    if (acao === "REPROVAR") {
      const { motivo } = req.body || {};
      if (!motivo || typeof motivo !== "string" || !motivo.trim()) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o motivo da reprovação." } };
        return;
      }
      if (candidato.status === "BATIZADO") {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Este candidato já foi batizado." } };
        return;
      }
      // Permanece na fila pra turma seguinte (Regimento — não recomeça o
      // cadastro), só sai da turma atual e some da lista de "aprovados".
      await pool.request().input("id", sql.Int, id).input("motivo", sql.NVarChar(300), motivo.trim().slice(0, 300))
        .query(`UPDATE CandidatosBatismo SET Status = 'AGUARDANDO_TURMA', TurmaId = NULL, MotivoReprovacao = @motivo WHERE CandidatoId = @id AND Status <> 'BATIZADO'`);
      await registrarAuditoria({ tabela: "CandidatosBatismo", registroId: id, acao: `Reprovou candidato (${motivo.trim()}) — volta pra fila`, usuarioId: usuario.membroId });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Candidato voltou pra fila da turma seguinte." } };
      return;
    }

    context.res = { status: 400, body: { sucesso: false, mensagem: "Ação inválida." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Requisição inválida." } };
};
