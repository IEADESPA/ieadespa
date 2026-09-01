// ExcluirDados — apaga dados fictícios por categoria (exige permissão "permissoes").
// POST /api/dados/excluir   body: { categorias: ["pessoas", "estrutura", "funcoes", ...] }
//
// ATENÇÃO: no Azure SQL isso é DELETE de verdade (antes, no mock, era só um
// reset de um JSON local). Roda em transação — ou todas as categorias pedidas
// são apagadas, ou nenhuma é. Sempre preserva o admin (matrícula 3), o papel
// dele (PapelId 1) e a liderança dele, senão o próprio login da Secretaria
// quebra. Onde uma categoria (ex: "pessoas") apagaria uma tabela referenciada
// por outra via FK (Presencas/Assentos/Consagracoes/Lideranca apontam pra
// MembroReferencia), a filha é limpa primeiro — senão o Azure SQL recusa o DELETE.
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");

const ADMIN_MEMBRO_ID = 3;
const ADMIN_PAPEL_ID = 1;

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "permissoes");
  if (!usuario) return;

  const { categorias } = req.body || {};
  if (!Array.isArray(categorias) || categorias.length === 0) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe ao menos uma categoria." } };
    return;
  }
  const quer = (cat) => categorias.includes(cat);

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  const r = () => new sql.Request(transaction);

  await transaction.begin();
  try {
    if (quer("pessoas")) {
      await r().input("adminId", sql.Int, ADMIN_MEMBRO_ID).query(`DELETE FROM Presencas WHERE MembroId <> @adminId`);
      await r().input("adminId", sql.Int, ADMIN_MEMBRO_ID).query(`DELETE FROM Assentos WHERE MembroId <> @adminId`);
      await r().input("adminId", sql.Int, ADMIN_MEMBRO_ID).query(`DELETE FROM Consagracoes WHERE MembroId <> @adminId AND (ProponenteMembroId IS NULL OR ProponenteMembroId <> @adminId)`);
      await r().input("adminId", sql.Int, ADMIN_MEMBRO_ID).query(`DELETE FROM Lideranca WHERE MembroId <> @adminId`);
      await r().input("adminId", sql.Int, ADMIN_MEMBRO_ID).query(`DELETE FROM ProcessosDisciplinares WHERE MembroId <> @adminId`);
      await r().input("adminId", sql.Int, ADMIN_MEMBRO_ID).query(`DELETE FROM Matriculas_AFM WHERE MembroId <> @adminId`);
      await r().input("adminId", sql.Int, ADMIN_MEMBRO_ID).query(`DELETE FROM MembroReferencia WHERE MembroId <> @adminId`);
    }

    if (quer("reunioes")) {
      await r().query(`DELETE FROM Presencas`);
      await r().query(`DELETE FROM Sessoes`);
    }

    if (quer("consagracoes")) {
      await r().query(`DELETE FROM Consagracoes`);
    }

    if (quer("liderancas")) {
      await r().input("adminId", sql.Int, ADMIN_MEMBRO_ID).query(`DELETE FROM Lideranca WHERE MembroId <> @adminId`);
    }

    if (quer("permissoes")) {
      await r().input("adminId", sql.Int, ADMIN_MEMBRO_ID).query(`DELETE FROM Lideranca WHERE MembroId <> @adminId`);
      await r().input("papelId", sql.Int, ADMIN_PAPEL_ID).query(`DELETE FROM Papeis WHERE PapelId <> @papelId`);
      await r().query(`DELETE FROM Funcionalidades`);
    }

    if (quer("orgaos")) {
      await r().query(`DELETE FROM Assentos`);
      await r().query(`DELETE FROM Presencas`);
      await r().query(`DELETE FROM Sessoes`);
      await r().query(`DELETE FROM ProcessosDisciplinares`);
      await r().query(`DELETE FROM Orgaos`);
    }

    if (quer("funcoes")) {
      await r().query(`UPDATE MembroReferencia SET Funcao = NULL`);
      await r().query(`DELETE FROM Funcoes`);
    }

    if (quer("departamentos")) {
      await r().query(`UPDATE MembroReferencia SET DepartamentoId = NULL`);
      await r().query(`DELETE FROM Departamentos`);
    }

    if (quer("situacoes")) {
      await r().query(`DELETE FROM SituacoesMembro`);
    }

    if (quer("congregacoes")) {
      await r().query(`UPDATE MembroReferencia SET CongregacaoId = NULL`);
      await r().query(`DELETE FROM VinculoCongregacaoArea`);
      await r().query(`DELETE FROM ExtensoesTenda`);
      await r().query(`DELETE FROM Congregacoes`);
    }

    if (quer("estrutura")) {
      // Ordem importa: Areas -> Regioes -> Quadrantes -> Distritos (cada uma
      // referencia a próxima via *Id opcional — migração 004).
      await r().query(`UPDATE Congregacoes SET AreaId = NULL`);
      await r().query(`DELETE FROM VinculoCongregacaoArea`);
      await r().query(`DELETE FROM Areas`);
      await r().query(`DELETE FROM Regioes`);
      await r().query(`DELETE FROM Quadrantes`);
      await r().query(`DELETE FROM Distritos`);
    }

    await transaction.commit();
  } catch (e) {
    await transaction.rollback();
    context.res = { status: 500, body: { sucesso: false, mensagem: "Falha ao excluir: " + e.message } };
    return;
  }

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: "✅ Dados fictícios excluídos. Admin (matrícula 3) preservado." }
  };
};
