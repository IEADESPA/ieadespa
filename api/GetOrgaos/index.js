// GetOrgaos
// GET    /api/orgaos             -> lista órgãos (exige sessão; a configuração dos órgãos não é mais pública)
// POST   /api/orgaos             -> cria/atualiza órgão (permissão "pessoas" + nível GERAL)
// DELETE /api/orgaos/{orgaoId}   -> exclui órgão (permissão "pessoas" + nível GERAL)
// Órgão central é INSTITUCIONAL (a igreja inteira): quórum, faltas e siglas mexem em toda a governança (as siglas são chaves usadas pelo código). Por isso criar/editar/
// excluir é só do GERAL (papel Global com escopo "TODAS"), nunca de papel local que por acaso tenha "pessoas" (Dirigente, Pastor de Área, Líder Geral de Departamento).
const auth = require("../shared/auth");
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const SELECT_ORGAO = `SELECT OrgaoId AS orgaoId, Sigla AS sigla, Nome AS nome,
       QuorumMinimoPct AS quorumMinimoPct, QuorumDeliberativoPct AS quorumDeliberativoPct,
       FaltasParaPerdaAssento AS faltasParaPerdaAssento FROM Orgaos`;

// Siglas que o código procura pelo texto (WHERE Sigla = '...'): trocar a sigla de um desses órgãos desligaria, em silêncio, a Assembleia, a CLI, a Diretoria etc.
const SIGLAS_DO_SISTEMA = ["ASSEMBLEIA_GERAL", "CLI", "DIRETORIA_EXECUTIVA", "CONSELHO_FISCAL", "CEI", "CONSELHO_CONSULTIVO_TECNICO", "COLEGIO_DIRIGENTES"];

function recusar(context, mensagem) {
  context.res = { status: 200, body: { sucesso: false, mensagem } };
}

// Percentual: vazio vale como "sem regra"; informado precisa ser número entre 0 e 100.
function percentualValido(v) {
  if (v === undefined || v === null || v === "") return true;
  const n = Number(v);
  return typeof v !== "boolean" && Number.isFinite(n) && n >= 0 && n <= 100;
}
function faltasValidas(v) {
  if (v === undefined || v === null || v === "") return true;
  const n = Number(v);
  return typeof v !== "boolean" && Number.isInteger(n) && n >= 1 && n <= 100;
}

module.exports = async function (context, req) {
  const method = (req.method || "GET").toUpperCase();

  if (method === "GET") {
    if (!auth.exigirLoginIgnorandoTermos(req, context)) return;
    const pool = await getPool();
    const result = await pool.request().query(`${SELECT_ORGAO} ORDER BY OrgaoId`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (method !== "POST" && method !== "DELETE") {
    context.res = { status: 405, body: { sucesso: false, mensagem: "Método não suportado." } };
    return;
  }

  const usuario = exigirGeral(req, context, "pessoas");
  if (!usuario) return;
  const pool = await getPool();

  if (method === "POST") {
    const { orgaoId, sigla, nome, quorumMinimoPct, quorumDeliberativoPct, faltasParaPerdaAssento } = req.body || {};
    if (typeof sigla !== "string" || typeof nome !== "string" || !sigla.trim() || !nome.trim()) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe sigla e nome do órgão." } };
      return;
    }
    const siglaFinal = sigla.trim();
    const nomeFinal = nome.trim();
    if (siglaFinal.length > 30 || nomeFinal.length > 200) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Sigla (até 30 caracteres) ou nome (até 200) longo demais." } };
      return;
    }
    if (!percentualValido(quorumMinimoPct) || !percentualValido(quorumDeliberativoPct)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Os quóruns são percentuais entre 0 e 100." } };
      return;
    }
    if (!faltasValidas(faltasParaPerdaAssento)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "As faltas para perder o assento são um número inteiro de 1 a 100." } };
      return;
    }
    const idOrgao = orgaoId ? auth.idDeRota(orgaoId) : null;
    if (orgaoId && !idOrgao) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Órgão inválido." } };
      return;
    }

    // A sigla é única: duas linhas com a mesma sigla fazem as buscas por sigla (ex.: a do Presidente) apontarem para uma linha qualquer.
    const repetida = await pool.request().input("sigla", sql.NVarChar(30), siglaFinal).input("id", sql.Int, idOrgao)
      .query(`SELECT TOP 1 OrgaoId FROM Orgaos WHERE Sigla = @sigla AND (@id IS NULL OR OrgaoId <> @id)`);
    if (repetida.recordset.length > 0) {
      recusar(context, "Já existe um órgão com essa sigla.");
      return;
    }

    let dadosAntes = null;
    let orgaoSalvoId = idOrgao;
    if (idOrgao) {
      const anterior = await pool.request().input("id", sql.Int, idOrgao).query(`${SELECT_ORGAO} WHERE OrgaoId = @id`);
      dadosAntes = anterior.recordset[0] || null;
      if (!dadosAntes) {
        recusar(context, "Órgão não encontrado.");
        return;
      }
      if (SIGLAS_DO_SISTEMA.includes(dadosAntes.sigla) && dadosAntes.sigla !== siglaFinal) {
        recusar(context, "A sigla deste órgão é usada pelo sistema e não pode ser trocada.");
        return;
      }

      const upd = await pool.request()
        .input("id", sql.Int, idOrgao)
        .input("sigla", sql.NVarChar(30), siglaFinal)
        .input("nome", sql.NVarChar(200), nomeFinal)
        .input("qmin", sql.Decimal(5, 2), quorumMinimoPct != null && quorumMinimoPct !== "" ? quorumMinimoPct : null)
        .input("qdel", sql.Decimal(5, 2), quorumDeliberativoPct != null && quorumDeliberativoPct !== "" ? quorumDeliberativoPct : null)
        .input("faltas", sql.Int, faltasParaPerdaAssento != null && faltasParaPerdaAssento !== "" ? faltasParaPerdaAssento : null)
        .query(`UPDATE Orgaos SET Sigla=@sigla, Nome=@nome, QuorumMinimoPct=@qmin,
                QuorumDeliberativoPct=@qdel, FaltasParaPerdaAssento=@faltas WHERE OrgaoId=@id`);
      if (upd.rowsAffected[0] === 0) {
        recusar(context, "Órgão não encontrado.");
        return;
      }
    } else {
      const criado = await pool.request()
        .input("sigla", sql.NVarChar(30), siglaFinal)
        .input("nome", sql.NVarChar(200), nomeFinal)
        .input("qmin", sql.Decimal(5, 2), quorumMinimoPct != null && quorumMinimoPct !== "" ? quorumMinimoPct : null)
        .input("qdel", sql.Decimal(5, 2), quorumDeliberativoPct != null && quorumDeliberativoPct !== "" ? quorumDeliberativoPct : null)
        .input("faltas", sql.Int, faltasParaPerdaAssento != null && faltasParaPerdaAssento !== "" ? faltasParaPerdaAssento : null)
        .query(`INSERT INTO Orgaos (Sigla, Nome, QuorumMinimoPct, QuorumDeliberativoPct, FaltasParaPerdaAssento)
                OUTPUT INSERTED.OrgaoId
                VALUES (@sigla, @nome, @qmin, @qdel, @faltas)`);
      orgaoSalvoId = criado.recordset[0] ? criado.recordset[0].OrgaoId : null;
    }

    // Relê pela chave (não pela sigla: com a sigla única isso era equivalente, mas a chave não depende disso).
    const result = orgaoSalvoId
      ? await pool.request().input("id", sql.Int, orgaoSalvoId).query(`${SELECT_ORGAO} WHERE OrgaoId = @id`)
      : await pool.request().input("sigla", sql.NVarChar(30), siglaFinal).query(`${SELECT_ORGAO} WHERE Sigla = @sigla ORDER BY OrgaoId DESC`);
    const orgao = result.recordset[0];

    await registrarAuditoria({
      tabela: "Orgaos", registroId: orgao.orgaoId, acao: idOrgao ? "Atualizou órgão" : "Criou órgão",
      usuarioId: usuario.membroId, dadosAntes, dadosDepois: orgao
    });

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Órgão salvo.", orgao } };
    return;
  }

  // DELETE
  const orgaoId = auth.idDeRota(context.bindingData.orgaoId);
  if (!orgaoId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o órgão na rota: /api/orgaos/{orgaoId}" } };
    return;
  }
  const anterior = await pool.request().input("id", sql.Int, orgaoId).query(`${SELECT_ORGAO} WHERE OrgaoId = @id`);
  const orgaoAntes = anterior.recordset[0] || null;
  if (orgaoAntes && SIGLAS_DO_SISTEMA.includes(orgaoAntes.sigla)) {
    recusar(context, "Este órgão é usado pelo sistema e não pode ser excluído.");
    return;
  }
  let del;
  try {
    del = await pool.request().input("id", sql.Int, orgaoId).query(`DELETE FROM Orgaos WHERE OrgaoId = @id`);
  } catch (e) {
    if (e && e.number === 547) { // chave estrangeira: o órgão já tem cadeiras, reuniões, documentos...
      recusar(context, "Este órgão já tem cadeiras, reuniões ou documentos ligados a ele e não pode ser excluído.");
      return;
    }
    throw e;
  }
  const ok = del.rowsAffected[0] > 0;
  if (ok) {
    await registrarAuditoria({ tabela: "Orgaos", registroId: orgaoId, acao: "Excluiu órgão", usuarioId: usuario.membroId, dadosAntes: orgaoAntes });
  }
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: ok, mensagem: ok ? "✅ Órgão excluído." : "Órgão não encontrado." } };
};
