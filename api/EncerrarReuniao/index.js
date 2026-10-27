// EncerrarReuniao
// Ao encerrar:
// 1. Marca a sessão como ENCERRADA
// 2. Para todo membro do universo do órgão (shared/universo.js) que NÃO
//    bateu ponto, gera uma falta (Presente = 0)
// 3. A justificativa dessa falta é lançada depois, pela Secretaria, via
//    JustificarFalta.
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { universoDoOrgao } = require("../shared/universo");
const { membroAutorizadoNoOrgaoLocal } = require("../shared/escopo");
const { violouUnicidade } = require("../shared/violacaoUnica");
const afmDb = require("../shared/afmDb");

module.exports = async function (context, req) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;

  const sessaoId = context.bindingData.sessaoId;
  const usuarioId = usuario.membroId;

  if (!sessaoId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o sessaoId na rota." } };
    return;
  }

  const pool = await getPool();
  const sessaoResult = await pool.request().input("id", sql.Int, sessaoId)
    .query(`SELECT SessaoId AS sessaoId, OrgaoId AS orgaoId, OrgaoLocalId AS orgaoLocalId, Status AS status, TipoSessao AS tipoSessao, ContaFaltasCLI AS contaFaltasCLI
            FROM Sessoes WHERE SessaoId = @id`);
  const sessao = sessaoResult.recordset[0];
  if (!sessao) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Reunião não encontrada." } };
    return;
  }
  if (sessao.status !== "ABERTA") {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Esta reunião já está encerrada." } };
    return;
  }
  if (sessao.orgaoLocalId && !(await membroAutorizadoNoOrgaoLocal(pool, sql, usuarioId, sessao.orgaoLocalId))) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Você não tem vínculo com o órgão territorial desta reunião." } };
    return;
  }

  await pool.request().input("id", sql.Int, sessaoId).query(`UPDATE Sessoes SET Status = 'ENCERRADA' WHERE SessaoId = @id`);

  const orgaoResult = await pool.request().input("id", sql.Int, sessao.orgaoId).input("idLocal", sql.Int, sessao.orgaoLocalId).query(`
    SELECT o.OrgaoId AS orgaoId, o.Sigla AS sigla, NULL AS orgaoLocalId, NULL AS nivel, NULL AS referenciaId FROM Orgaos o WHERE o.OrgaoId = @id
    UNION ALL
    SELECT NULL, ol.Sigla, ol.OrgaoLocalId, ol.Nivel, ol.ReferenciaId FROM OrgaosLocais ol WHERE ol.OrgaoLocalId = @idLocal
  `);
  const orgao = orgaoResult.recordset[0] || null;

  const presencasResult = await pool.request().input("id", sql.Int, sessaoId)
    .query(`SELECT MembroId AS membroId, Presente AS presente, FaltaJustificada AS faltaJustificada FROM Presencas WHERE SessaoId = @id`);
  const idsComPresenca = new Set(presencasResult.recordset.map(p => p.membroId));

  // v8.1 — reunião da CLI: cada falta guarda se a pessoa era esperada pela CLI e/ou pela Academia (Sessão Magna, Regimento Art. 69 — falta dupla).
  const ehCLI = !!orgao && orgao.sigla === "CLI";
  const universo = await universoDoOrgao(pool, orgao, { magnaAFM: ehCLI && sessao.tipoSessao === "MAGNA_AFM" });
  let totalFaltas = 0;
  for (const membro of universo) {
    if (idsComPresenca.has(membro.membroId)) continue;
    try {
      await pool.request().input("sessaoId", sql.Int, sessaoId).input("mat", sql.Int, membro.membroId)
        .input("cli", sql.Bit, ehCLI ? !!membro.esperadoCLI : null).input("afm", sql.Bit, ehCLI ? !!membro.esperadoAFM : null)
        .query(`INSERT INTO Presencas (SessaoId, MembroId, Presente, FaltaJustificada, EsperadoCLI, EsperadoAFM) VALUES (@sessaoId, @mat, 0, 0, @cli, @afm)`);
    } catch (e) {
      // A pessoa bateu ponto entre a leitura das presenças e este INSERT: o índice único (UX_Presencas_Sessao_Membro) recusa a falta, e a presença dela vale. Sem isto o
      // encerramento parava aqui com a reunião já ENCERRADA e as faltas dos demais nunca seriam lançadas.
      if (!violouUnicidade(e)) throw e;
      continue;
    }
    totalFaltas++;
  }

  const totalPresentes = presencasResult.recordset.filter(p => p.presente).length;
  const totalJustificadas = presencasResult.recordset.filter(p => !p.presente && p.faltaJustificada).length;

  await registrarAuditoria({ tabela: "Sessoes", registroId: Number(sessaoId), acao: "Encerrou reunião", usuarioId });

  // v8.1 — reunião que conta falta: apura na hora as 3 faltas seguidas (CLI e AFM). Falha não desfaz o encerramento: a rotina diária repete.
  let apuracao = "";
  if (ehCLI && sessao.contaFaltasCLI) {
    const ids = [...new Set(universo.map(m => Number(m.membroId)).concat(presencasResult.recordset.map(p => Number(p.membroId))))];
    apuracao = afmDb.resumoDaApuracao(await afmDb.apurarSemFalhar(pool, { membroIds: ids }, context.log.error));
  }

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: {
      sucesso: true,
      mensagem: `✅ Reunião Encerrada!\nPresentes: ${totalPresentes}\nFaltas geradas: ${totalFaltas}\nJustificadas consumidas: ${totalJustificadas}${apuracao}`
    }
  };
};
