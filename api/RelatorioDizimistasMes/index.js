// RelatorioDizimistasMes (v4.1.2)
// Resposta direta a um pedido concreto: "visualizar quantas pessoas já
// dizimaram, a lista dos dizimistas mensais" — hoje só existia a lista de
// LANÇAMENTOS (por termo), não a lista de PESSOAS com quem já contribuiu
// e quem ainda não naquele mês. Junta o cadastro de Dizimistas ativos com
// os lançamentos ATIVOS do mês (LEFT JOIN — quem não lançou aparece com
// contribuiu=false), mais os nomes avulsos que contribuíram sem estar no
// cadastro (não têm como "faltar", só aparecem quando contribuem).
// GET /api/tesouraria-dizimistas-mes?congregacaoId=&mesReferencia=
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;

  const { congregacaoId, mesReferencia } = req.query || {};
  if (!congregacaoId || !mesReferencia) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe congregacaoId e mesReferencia." } };
    return;
  }

  const pool = await getPool();
  const cong = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
  if (cong.recordset.length === 0 || !auth.estaNoEscopo(usuario, cong.recordset[0].Nome)) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
    return;
  }

  const dizimistasResult = await pool.request()
    .input("congregacaoId", sql.Int, congregacaoId).input("mesReferencia", sql.Char(7), mesReferencia)
    .query(`
      SELECT d.DizimistaId AS dizimistaId, d.Nome AS nome,
             ISNULL(SUM(CASE WHEN l.Status = 'ATIVO' THEN l.Valor ELSE 0 END), 0) AS totalContribuido,
             MAX(CASE WHEN l.Status = 'ATIVO' THEN 1 ELSE 0 END) AS contribuiuInt
      FROM Dizimistas d
      LEFT JOIN LancamentosTesouraria l
        ON l.DizimistaId = d.DizimistaId AND l.MesReferencia = @mesReferencia
      WHERE d.CongregacaoId = @congregacaoId AND d.Ativo = 1
      GROUP BY d.DizimistaId, d.Nome
      ORDER BY d.Nome
    `);
  const dizimistas = dizimistasResult.recordset.map(d => ({
    dizimistaId: d.dizimistaId, nome: d.nome, contribuiu: !!d.contribuiuInt, totalContribuido: d.totalContribuido
  }));

  const avulsosResult = await pool.request()
    .input("congregacaoId", sql.Int, congregacaoId).input("mesReferencia", sql.Char(7), mesReferencia)
    .query(`
      SELECT NomeAvulso AS nome, SUM(Valor) AS totalContribuido
      FROM LancamentosTesouraria
      WHERE CongregacaoId = @congregacaoId AND MesReferencia = @mesReferencia AND DizimistaId IS NULL AND Status = 'ATIVO'
      GROUP BY NomeAvulso
      ORDER BY NomeAvulso
    `);

  context.res = {
    status: 200, headers: { "Content-Type": "application/json" },
    body: {
      congregacaoNome: cong.recordset[0].Nome,
      mesReferencia,
      totalDizimistas: dizimistas.length,
      totalContribuiram: dizimistas.filter(d => d.contribuiu).length,
      dizimistas,
      avulsos: avulsosResult.recordset
    }
  };
};
