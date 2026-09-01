// GetOrgaos
// GET    /api/orgaos             -> lista órgãos (público)
// POST   /api/orgaos             -> cria/atualiza órgão (permissão "pessoas")
// DELETE /api/orgaos/{orgaoId}   -> exclui órgão (permissão "pessoas")
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");

const SELECT_ORGAO = `SELECT OrgaoId AS orgaoId, Sigla AS sigla, Nome AS nome,
       QuorumMinimoPct AS quorumMinimoPct, QuorumDeliberativoPct AS quorumDeliberativoPct,
       FaltasParaPerdaAssento AS faltasParaPerdaAssento FROM Orgaos`;

module.exports = async function (context, req) {
  const method = (req.method || "GET").toUpperCase();
  const pool = await getPool();

  if (method === "GET") {
    const result = await pool.request().query(`${SELECT_ORGAO} ORDER BY OrgaoId`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  if (method === "POST") {
    const { orgaoId, sigla, nome, quorumMinimoPct, quorumDeliberativoPct, faltasParaPerdaAssento } = req.body || {};
    if (!sigla || !nome) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe sigla e nome do órgão." } };
      return;
    }

    if (orgaoId) {
      const upd = await pool.request()
        .input("id", sql.Int, orgaoId)
        .input("sigla", sql.NVarChar(30), sigla)
        .input("nome", sql.NVarChar(200), nome)
        .input("qmin", sql.Decimal(5, 2), quorumMinimoPct != null ? quorumMinimoPct : null)
        .input("qdel", sql.Decimal(5, 2), quorumDeliberativoPct != null ? quorumDeliberativoPct : null)
        .input("faltas", sql.Int, faltasParaPerdaAssento != null ? faltasParaPerdaAssento : null)
        .query(`UPDATE Orgaos SET Sigla=@sigla, Nome=@nome, QuorumMinimoPct=@qmin,
                QuorumDeliberativoPct=@qdel, FaltasParaPerdaAssento=@faltas WHERE OrgaoId=@id`);
      if (upd.rowsAffected[0] === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Órgão não encontrado." } };
        return;
      }
    } else {
      await pool.request()
        .input("sigla", sql.NVarChar(30), sigla)
        .input("nome", sql.NVarChar(200), nome)
        .input("qmin", sql.Decimal(5, 2), quorumMinimoPct != null ? quorumMinimoPct : null)
        .input("qdel", sql.Decimal(5, 2), quorumDeliberativoPct != null ? quorumDeliberativoPct : null)
        .input("faltas", sql.Int, faltasParaPerdaAssento != null ? faltasParaPerdaAssento : null)
        .query(`INSERT INTO Orgaos (Sigla, Nome, QuorumMinimoPct, QuorumDeliberativoPct, FaltasParaPerdaAssento)
                VALUES (@sigla, @nome, @qmin, @qdel, @faltas)`);
    }

    const result = await pool.request().input("sigla", sql.NVarChar(30), sigla)
      .query(`${SELECT_ORGAO} WHERE Sigla = @sigla ORDER BY OrgaoId DESC`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Órgão salvo.", orgao: result.recordset[0] } };
    return;
  }

  if (method === "DELETE") {
    const orgaoId = context.bindingData.orgaoId;
    if (!orgaoId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o órgão na rota: /api/orgaos/{orgaoId}" } };
      return;
    }
    const del = await pool.request().input("id", sql.Int, orgaoId).query(`DELETE FROM Orgaos WHERE OrgaoId = @id`);
    const ok = del.rowsAffected[0] > 0;
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: ok, mensagem: ok ? "✅ Órgão excluído." : "Órgão não encontrado." } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
