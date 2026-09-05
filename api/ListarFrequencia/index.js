// ListarFrequencia
// Roster de uma sessão: matrícula, nome, função eclesiástica, presente/falta/
// justificada — filtrado pelo escopo de quem está logado (um Dirigente só vê
// gente da(s) congregação(ões) dele). O quórum, por ser um dado institucional
// (não individual), é calculado sobre TODO o universo do órgão, não só o
// escopo de quem está vendo.
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const estatuto = require("../shared/estatuto");
const { universoDoOrgao } = require("../shared/universo");

module.exports = async function (context, req) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;

  const sessaoId = context.bindingData.sessaoId;
  if (!sessaoId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o sessaoId na rota." } };
    return;
  }

  const pool = await getPool();
  const sessaoResult = await pool.request().input("id", sql.Int, sessaoId).query(`
    SELECT SessaoId AS sessaoId, OrgaoId AS orgaoId, Descricao AS descricao,
           CONVERT(varchar(10), DataSessao, 120) AS dataSessao, Status AS status,
           QuorumTipo AS quorumTipo, VinculadaSessaoId AS vinculadaSessaoId, Materias AS materias
    FROM Sessoes WHERE SessaoId = @id`);
  const sessao = sessaoResult.recordset[0];
  if (!sessao) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Reunião não encontrada." } };
    return;
  }

  const presencasResult = await pool.request().input("id", sql.Int, sessaoId).query(`
    SELECT m.MembroId AS membroId, m.Nome AS nome, COALESCE(cm.Nome, m.Funcao) AS funcao, m.CongregacaoId AS congregacaoId,
           c.Nome AS congregacao, p.Presente AS presente, p.FaltaJustificada AS faltaJustificada,
           p.MotivoJustificativa AS motivoJustificativa, p.JustificativaPendente AS justificativaPendente
    FROM Presencas p
    JOIN MembroReferencia m ON m.MembroId = p.MembroId
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    LEFT JOIN CargosMinisteriais cm ON cm.Sigla = m.CargoMinisterial
    WHERE p.SessaoId = @id`);

  const frequencia = presencasResult.recordset
    .filter(item => auth.estaNoEscopo(usuario, item.congregacao))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const orgaoResult = await pool.request().input("id", sql.Int, sessao.orgaoId).query(
    `SELECT OrgaoId AS orgaoId, Sigla AS sigla, QuorumMinimoPct AS quorumMinimoPct FROM Orgaos WHERE OrgaoId = @id`
  );
  const orgao = orgaoResult.recordset[0] || null;

  const universo = await universoDoOrgao(pool, orgao);
  const totalAtivos = universo.length;
  const totalPresentesGeral = presencasResult.recordset.filter(f => f.presente).length;
  const percentualPresenca = totalAtivos > 0 ? Math.round((totalPresentesGeral / totalAtivos) * 100) : 0;

  // v2.2 — o quórum aplicável agora vem do QuorumTipo gravado na própria sessão
  // (derivado das matérias na convocação — ver ConvocarAssembleia/estatuto.js),
  // não mais implícito só pelo órgão. REFORMA_DESTITUICAO (Art. 21, II) e
  // REFORMA_DIFICULTADA (Art. 71 §1º) só existem pra Assembleia Geral; CLI e os
  // demais órgãos continuam sempre em GERAL (2 estágios, ou percentual fixo
  // genérico enquanto não tiverem regra própria).
  let quorum;
  if (sessao.quorumTipo === "REFORMA_DESTITUICAO") {
    const r = estatuto.avaliarQuorumReformaDestituicao(totalPresentesGeral, totalAtivos, !!sessao.vinculadaSessaoId);
    quorum = { totalAtivos, totalPresentes: totalPresentesGeral, percentualPresenca, quorumMinimoPct: null, ...r, mensagemQuorum: r.mensagem };
  } else if (sessao.quorumTipo === "REFORMA_DIFICULTADA") {
    const r = estatuto.avaliarQuorumReformaDificultada(totalPresentesGeral);
    quorum = { totalAtivos, totalPresentes: totalPresentesGeral, percentualPresenca, quorumMinimoPct: null, quorumAtingido: null, ...r, mensagemQuorum: r.mensagem };
  } else {
    const quorumEstatuto = orgao ? estatuto.avaliarQuorumInstalacao(orgao.sigla, totalPresentesGeral, totalAtivos) : null;
    quorum = quorumEstatuto
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
  }

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, sessao, frequencia, quorum }
  };
};
