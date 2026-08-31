// ListarFrequencia
// Roster de uma sessão: matrícula, nome, função eclesiástica, presente/falta/
// justificada — filtrado pelo escopo de quem está logado (um Dirigente só vê
// gente da(s) congregação(ões) dele). O quórum, por ser um dado institucional
// (não individual), é calculado sobre TODOS os ATIVOS do órgão, não só o
// escopo de quem está vendo.
const auth = require("../shared/auth");
const mockDb = require("../shared/mockDb");
const estatuto = require("../shared/estatuto");

module.exports = async function (context, req) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;

  const sessaoId = context.bindingData.sessaoId;

  if (!sessaoId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o sessaoId na rota." } };
    return;
  }

  // ---- Versão real com Azure SQL ----
  // const sql = require("mssql");
  // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
  // const result = await pool.request().input("sessaoId", sql.Int, sessaoId).query(`
  //   SELECT m.MembroId, m.Nome, m.Funcao, c.Nome AS Congregacao, p.Presente, p.FaltaJustificada, p.MotivoJustificativa
  //   FROM Presencas p
  //   JOIN MembroReferencia m ON m.MembroId = p.MembroId
  //   LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
  //   WHERE p.SessaoId = @sessaoId
  //   ORDER BY m.Nome
  // `); // filtre por escopo na aplicação, igual ao mock, e calcule quórum à parte (sem filtro de escopo)
  // context.res = { status: 200, body: result.recordset };
  // return;

  const sessao = mockDb.getSessao(sessaoId);
  if (!sessao) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Reunião não encontrada." } };
    return;
  }

  const frequencia = mockDb
    .listarFrequenciaPorSessao(sessaoId, { escopoCongregacoes: usuario.escopoCongregacoes })
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const orgao = mockDb.getOrgao(sessao.orgaoId);
  const totalAtivos = mockDb.contarUniversoOrgao(orgao, "TODAS");
  const totalPresentesGeral = mockDb.listarFrequenciaPorSessao(sessaoId).filter(f => f.presente).length;
  const percentualPresenca = totalAtivos > 0 ? Math.round((totalPresentesGeral / totalAtivos) * 100) : 0;

  // Assembleia Geral e CLI usam o quórum de instalação em 2 estágios do Estatuto (maioria
  // absoluta em 1ª convocação, qualquer número 30 min depois em 2ª — ver estatuto.js). Os
  // demais órgãos ainda usam o percentual fixo genérico (QuorumMinimoPct), enquanto não têm
  // regra própria definida.
  const quorumEstatuto = orgao ? estatuto.avaliarQuorumInstalacao(orgao.sigla, totalPresentesGeral, totalAtivos) : null;
  const quorum = quorumEstatuto
    ? {
        totalAtivos,
        totalPresentes: totalPresentesGeral,
        percentualPresenca,
        quorumMinimoPct: null,
        quorumAtingido: quorumEstatuto.maioriaAbsolutaAtingida,
        maioriaAbsolutaNecessaria: quorumEstatuto.maioriaAbsolutaNecessaria,
        mensagemQuorum: quorumEstatuto.mensagem
      }
    : {
        totalAtivos,
        totalPresentes: totalPresentesGeral,
        percentualPresenca,
        quorumMinimoPct: orgao ? orgao.quorumMinimoPct : null,
        quorumAtingido: orgao && orgao.quorumMinimoPct != null ? percentualPresenca >= orgao.quorumMinimoPct : null,
        mensagemQuorum: null
      };

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, sessao, frequencia, quorum }
  };
};
