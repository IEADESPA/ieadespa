// RegistrarPresenca (Portaria / Check-in)
// Desde que AbrirReuniao passou a permitir reuniões de órgãos diferentes abertas
// ao mesmo tempo (só a Assembleia Geral é exclusiva — ver AbrirReuniao), o check-in
// não pode mais assumir "a" única sessão aberta:
// 1. A senha digitada localiza a(s) sessão(ões) ABERTA(S) com essa SenhaAcesso
//    (cada reunião recebe sua própria senha, então normalmente já é só uma).
// 2. A matrícula precisa existir e estar no universo do órgão de cada candidata
//    (shared/universo.js), e ainda não ter batido ponto nela.
// 3. No raríssimo caso de duas reuniões concorrentes com a mesma senha e a pessoa
//    sendo elegível pras duas, devolve precisaEscolher pro front perguntar qual
//    (reenvia com sessaoId preenchido).
const { getPool, sql } = require("../shared/db");
const { universoDoOrgao } = require("../shared/universo");
const { registrarAuditoria } = require("../shared/auditoria");

module.exports = async function (context, req) {
  const { matricula, senha, sessaoId } = req.body || {};

  if (!matricula || !senha) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe matrícula e senha da reunião." } };
    return;
  }

  const pool = await getPool();

  const abertasResult = await pool.request().query(`
    SELECT s.SessaoId AS sessaoId, s.OrgaoId AS orgaoId, s.OrgaoLocalId AS orgaoLocalId, s.Descricao AS descricao, s.SenhaAcesso AS senhaAcesso,
           COALESCE(o.Sigla, ol.Sigla) AS orgaoSigla, COALESCE(o.Nome, ol.Nome) AS orgaoNome, ol.Nivel AS nivel, ol.ReferenciaId AS referenciaId
    FROM Sessoes s
    LEFT JOIN Orgaos o ON o.OrgaoId = s.OrgaoId
    LEFT JOIN OrgaosLocais ol ON ol.OrgaoLocalId = s.OrgaoLocalId
    WHERE s.Status = 'ABERTA'`);
  if (abertasResult.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Nenhuma reunião aberta no momento." } };
    return;
  }

  const candidatasSenha = abertasResult.recordset.filter(s => String(s.senhaAcesso).trim() === String(senha).trim());
  if (candidatasSenha.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Senha da reunião incorreta." } };
    return;
  }

  const membroResult = await pool.request().input("mat", sql.Int, matricula)
    .query(`SELECT MembroId AS membroId, Nome AS nome FROM MembroReferencia WHERE MembroId = @mat`);
  const membro = membroResult.recordset[0];
  if (!membro) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada no sistema." } };
    return;
  }

  let algumNoUniverso = false;
  let algumJaRegistrado = false;
  const elegiveis = [];
  for (const sessao of candidatasSenha) {
    const universo = await universoDoOrgao(pool, { orgaoId: sessao.orgaoId, orgaoLocalId: sessao.orgaoLocalId, sigla: sessao.orgaoSigla, nivel: sessao.nivel, referenciaId: sessao.referenciaId });
    if (!universo.some(m => String(m.membroId) === String(membro.membroId))) continue;
    algumNoUniverso = true;
    const jaRegistrado = await pool.request().input("sessaoId", sql.Int, sessao.sessaoId).input("mat", sql.Int, matricula)
      .query(`SELECT 1 AS x FROM Presencas WHERE SessaoId = @sessaoId AND MembroId = @mat`);
    if (jaRegistrado.recordset.length > 0) { algumJaRegistrado = true; continue; }
    elegiveis.push(sessao);
  }

  if (elegiveis.length === 0) {
    const mensagem = algumJaRegistrado ? "Presença JÁ REGISTRADA para hoje!" : (algumNoUniverso ? "Presença já registrada nesta reunião." : "Você não está na lista de participantes desta convocação.");
    context.res = { status: 200, body: { sucesso: false, mensagem } };
    return;
  }

  let sessaoEscolhida = elegiveis[0];
  if (elegiveis.length > 1) {
    if (sessaoId) {
      sessaoEscolhida = elegiveis.find(s => String(s.sessaoId) === String(sessaoId));
      if (!sessaoEscolhida) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Reunião escolhida não é mais válida." } };
        return;
      }
    } else {
      context.res = {
        status: 200,
        body: {
          sucesso: false,
          precisaEscolher: true,
          mensagem: "Você pode participar de mais de uma reunião aberta agora. Escolha qual:",
          sessoes: elegiveis.map(s => ({ sessaoId: s.sessaoId, descricao: s.descricao, orgaoNome: s.orgaoNome }))
        }
      };
      return;
    }
  }

  await pool.request().input("sessaoId", sql.Int, sessaoEscolhida.sessaoId).input("mat", sql.Int, matricula)
    .query(`INSERT INTO Presencas (SessaoId, MembroId, Presente) VALUES (@sessaoId, @mat, 1)`);

  await registrarAuditoria({
    tabela: "Presencas", registroId: Number(sessaoEscolhida.sessaoId), acao: "Registrou presença (Portaria)",
    usuarioId: Number(matricula), dadosDepois: { sessaoId: sessaoEscolhida.sessaoId, membroId: membro.membroId }
  });

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: `✅ Presença confirmada: ${membro.nome} (${sessaoEscolhida.orgaoNome})` }
  };
};
