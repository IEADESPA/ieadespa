// AbrirReuniao
// Motor único de sessão, reaproveitado por QUALQUER órgão (Assembleia, CLI,
// Diretoria, CEI, Conselho Fiscal — ver GetOrgaos). Prioridade em vez de trava
// global: a Assembleia Geral é exclusiva (órgão soberano do Regimento) — enquanto
// ela está aberta, nada mais abre, e ela não abre se já houver outra reunião em
// andamento.
//
// Os demais órgãos travam por SOBREPOSIÇÃO REAL DE PESSOAS, não por "mesmo
// órgão": a CLI tem composição mista (Regimento Art. 15 — Diretoria + Conselho
// Fiscal + CEI + Dirigentes entram por Função, Assentos) e comparecimento
// obrigatório (Art. 27 — faltas consecutivas tiram o assento), então não dá
// pra abrir a reunião da CLI ao mesmo tempo que a da Diretoria: quem está nas
// duas seria contado como falta numa delas só por causa do horário, não por
// ausência de verdade. Calculado a partir de shared/universo.js (o mesmo motor
// que decide quem falta quando a reunião encerra), não de uma tabela de
// prioridade configurada à mão — cobre qualquer composição futura sozinho.
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { universoDoOrgao } = require("../shared/universo");

module.exports = async function (context, req) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;

  const { orgaoId, descricao, senhaAcesso } = req.body || {};
  const usuarioId = usuario.membroId;

  if (!orgaoId || !descricao || !senhaAcesso) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: orgaoId, descricao, senhaAcesso." } };
    return;
  }

  const pool = await getPool();

  const orgaoResult = await pool.request().input("id", sql.Int, orgaoId).query(`SELECT OrgaoId AS orgaoId, Sigla AS sigla, Nome AS nome FROM Orgaos WHERE OrgaoId = @id`);
  const orgao = orgaoResult.recordset[0];
  if (!orgao) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Órgão inválido." } };
    return;
  }

  const assembleiaAberta = await pool.request().query(
    `SELECT TOP 1 1 AS x FROM Sessoes s JOIN Orgaos o ON o.OrgaoId = s.OrgaoId WHERE s.Status = 'ABERTA' AND o.Sigla = 'ASSEMBLEIA_GERAL'`
  );
  if (assembleiaAberta.recordset.length > 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "A Assembleia Geral está em andamento — nenhuma outra reunião pode ser aberta até ela encerrar." } };
    return;
  }

  if (orgao.sigla === "ASSEMBLEIA_GERAL") {
    const qualquerAberta = await pool.request().query(`SELECT TOP 1 1 AS x FROM Sessoes WHERE Status = 'ABERTA'`);
    if (qualquerAberta.recordset.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Já existe outra reunião em andamento — encerre-a antes de abrir a Assembleia Geral (ela é exclusiva)." } };
      return;
    }
  } else {
    const abertasResult = await pool.request().query(`
      SELECT s.OrgaoId AS orgaoId, o.Sigla AS sigla, o.Nome AS nome
      FROM Sessoes s JOIN Orgaos o ON o.OrgaoId = s.OrgaoId
      WHERE s.Status = 'ABERTA'`);
    if (abertasResult.recordset.length > 0) {
      const universoNovo = await universoDoOrgao(pool, orgao);
      const idsNovo = new Set(universoNovo.map(m => m.membroId));
      for (const sessaoAberta of abertasResult.recordset) {
        const universoExistente = sessaoAberta.orgaoId === orgao.orgaoId
          ? universoNovo
          : await universoDoOrgao(pool, sessaoAberta);
        const conflito = universoExistente.find(m => idsNovo.has(m.membroId));
        if (conflito) {
          const mesmoOrgao = sessaoAberta.orgaoId === orgao.orgaoId;
          context.res = {
            status: 200,
            body: {
              sucesso: false,
              mensagem: mesmoOrgao
                ? `Já existe uma reunião ABERTA do ${orgao.nome}. Encerre-a antes de abrir outra.`
                : `Não dá pra abrir: ${conflito.nome} participa tanto do ${orgao.nome} quanto do ${sessaoAberta.nome}, que já está com reunião aberta. Encerre-a antes (senão essa pessoa levaria falta numa das duas só por causa do horário).`
            }
          };
          return;
        }
      }
    }
  }

  const result = await pool.request()
    .input("orgaoId", sql.Int, orgaoId)
    .input("descricao", sql.NVarChar(200), descricao)
    .input("senha", sql.NVarChar(50), senhaAcesso)
    .query(`
      INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, Status, SenhaAcesso)
      OUTPUT INSERTED.SessaoId
      VALUES (@orgaoId, @descricao, CAST(SYSUTCDATETIME() AS DATE), 'ABERTA', @senha)
    `);
  const sessaoId = result.recordset[0].SessaoId;

  await registrarAuditoria({
    tabela: "Sessoes",
    registroId: sessaoId,
    acao: "Abriu reunião",
    usuarioId,
    dadosDepois: { descricao, orgaoId, orgaoSigla: orgao.sigla }
  });

  context.res = {
    status: 201,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: `✅ Reunião aberta!\nSenha: ${senhaAcesso}`, sessaoId }
  };
};
