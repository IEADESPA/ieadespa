// GestaoComissoes (v2.4; v4.8 segunda parte generaliza pra PMO)
// Comissões Permanentes (Regimento, Art. 19-23) — CFO e CEP são calculadas
// (shared/comissoes.js), CCJ é a única com cadastro manual (eleita pelo
// Plenário, Art. 19, I — máximo 3 membros ativos). PMO (Comissão de
// Acompanhamento de Projetos / PMO Eclesiástico, Art. 30, monitora o PDQ)
// reaproveita o mesmo cadastro manual — mesma tabela ComissaoMembros, só
// muda a sigla e o limite de membros (sem tabela nova por comissão).
// GET  /api/comissoes                      -> { CCJ: [...], CFO: [...], CEP: [...], PMO: [...] }
// POST /api/comissoes/{ccj|pmo}                  -> body: { membroId }
// POST /api/comissoes/{ccj|pmo}/{id}/encerrar    -> body: { motivoEncerramento? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { composicaoCFO, composicaoCEP, composicaoCCJ, composicaoPorSiglaEleita } = require("../shared/comissoes");

// Limite de membros ativos por comissão de cadastro manual — CCJ é eleita
// pelo Plenário com número fixo (Art. 19, I); PMO não tem número fixo no
// Regimento, um teto prático evita uma comissão inchada sem propósito.
const LIMITES_COMISSAO_MANUAL = { CCJ: 3, PMO: 9 };

module.exports = async function (context, req) {
  const sigla = (context.bindingData.sigla || "").toUpperCase();
  const id = context.bindingData.id;
  const acao = context.bindingData.acao;
  const pool = await getPool();

  if (req.method === "GET" && !sigla) {
    const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
    if (!usuario) return;
    const [ccj, cfo, cep, pmo] = await Promise.all([composicaoCCJ(pool), composicaoCFO(pool), composicaoCEP(pool), composicaoPorSiglaEleita(pool, "PMO")]);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { CCJ: ccj, CFO: cfo, CEP: cep, PMO: pmo } };
    return;
  }

  if (!LIMITES_COMISSAO_MANUAL[sigla]) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Só CCJ e PMO têm cadastro manual — CFO e CEP são calculadas." } };
    return;
  }
  const limite = LIMITES_COMISSAO_MANUAL[sigla];

  const usuario = auth.exigirPermissao(req, context, sigla === "PMO" ? "financeiro" : "pessoas");
  if (!usuario) return;

  if (req.method === "POST" && id && acao === "encerrar") {
    const { motivoEncerramento } = req.body || {};
    const antes = await pool.request().input("id", sql.Int, id).input("sigla", sql.NVarChar(10), sigla).query(`SELECT * FROM ComissaoMembros WHERE ComissaoMembroId = @id AND Sigla = @sigla`);
    if (!antes.recordset[0]) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Membro da ${sigla} não encontrado.` } };
      return;
    }
    if (antes.recordset[0].DataFim) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Esse membro já saiu da ${sigla}.` } };
      return;
    }
    await pool.request().input("id", sql.Int, id).input("motivo", sql.NVarChar(200), motivoEncerramento || null)
      .query(`UPDATE ComissaoMembros SET DataFim = CAST(SYSUTCDATETIME() AS DATE), MotivoEncerramento = @motivo WHERE ComissaoMembroId = @id`);
    await registrarAuditoria({
      tabela: "ComissaoMembros", registroId: Number(id), acao: `Encerrou membro da ${sigla}`, usuarioId: usuario.membroId,
      dadosAntes: antes.recordset[0], dadosDepois: { motivoEncerramento: motivoEncerramento || null }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Membro removido da ${sigla}.` } };
    return;
  }

  if (req.method === "POST" && !id) {
    const { membroId } = req.body || {};
    if (!membroId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula." } };
      return;
    }
    const membro = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
    if (membro.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
      return;
    }
    const ativos = sigla === "CCJ" ? await composicaoCCJ(pool) : await composicaoPorSiglaEleita(pool, sigla);
    if (ativos.some(m => m.membroId === Number(membroId))) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Essa pessoa já está na ${sigla}.` } };
      return;
    }
    if (ativos.length >= limite) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `A ${sigla} já tem ${limite} membros ativos — encerre um antes de adicionar outro.` } };
      return;
    }

    const result = await pool.request().input("sigla", sql.NVarChar(10), sigla).input("membroId", sql.Int, membroId)
      .query(`INSERT INTO ComissaoMembros (Sigla, MembroId) OUTPUT INSERTED.ComissaoMembroId VALUES (@sigla, @membroId)`);
    const comissaoMembroId = result.recordset[0].ComissaoMembroId;

    await registrarAuditoria({
      tabela: "ComissaoMembros", registroId: comissaoMembroId, acao: `Adicionou membro à ${sigla}`,
      usuarioId: usuario.membroId, dadosDepois: { membroId }
    });

    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Membro adicionado à ${sigla}.` } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método/rota não suportado." } };
};
