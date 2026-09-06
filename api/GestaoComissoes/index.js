// GestaoComissoes (v2.4)
// Comissões Permanentes (Regimento, Art. 19-23) — CFO e CEP são calculadas
// (shared/comissoes.js), CCJ é a única com cadastro manual (eleita pelo
// Plenário, Art. 19, I — máximo 3 membros ativos).
// GET  /api/comissoes                      -> { CCJ: [...], CFO: [...], CEP: [...] }
// POST /api/comissoes/ccj                  -> body: { membroId }
// POST /api/comissoes/ccj/{id}/encerrar    -> body: { motivoEncerramento? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { composicaoCFO, composicaoCEP, composicaoCCJ } = require("../shared/comissoes");

const LIMITE_CCJ = 3;

module.exports = async function (context, req) {
  const sigla = (context.bindingData.sigla || "").toUpperCase();
  const id = context.bindingData.id;
  const acao = context.bindingData.acao;
  const pool = await getPool();

  if (req.method === "GET" && !sigla) {
    const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
    if (!usuario) return;
    const [ccj, cfo, cep] = await Promise.all([composicaoCCJ(pool), composicaoCFO(pool), composicaoCEP(pool)]);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { CCJ: ccj, CFO: cfo, CEP: cep } };
    return;
  }

  if (sigla !== "CCJ") {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Só a CCJ tem cadastro manual — CFO e CEP são calculadas." } };
    return;
  }

  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  if (req.method === "POST" && id && acao === "encerrar") {
    const { motivoEncerramento } = req.body || {};
    const antes = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM ComissaoMembros WHERE ComissaoMembroId = @id AND Sigla = 'CCJ'`);
    if (!antes.recordset[0]) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Membro da CCJ não encontrado." } };
      return;
    }
    if (antes.recordset[0].DataFim) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esse membro já saiu da CCJ." } };
      return;
    }
    await pool.request().input("id", sql.Int, id).input("motivo", sql.NVarChar(200), motivoEncerramento || null)
      .query(`UPDATE ComissaoMembros SET DataFim = CAST(SYSUTCDATETIME() AS DATE), MotivoEncerramento = @motivo WHERE ComissaoMembroId = @id`);
    await registrarAuditoria({
      tabela: "ComissaoMembros", registroId: Number(id), acao: "Encerrou membro da CCJ", usuarioId: usuario.membroId,
      dadosAntes: antes.recordset[0], dadosDepois: { motivoEncerramento: motivoEncerramento || null }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Membro removido da CCJ." } };
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
    const ativos = await composicaoCCJ(pool);
    if (ativos.some(m => m.membroId === Number(membroId))) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Essa pessoa já está na CCJ." } };
      return;
    }
    if (ativos.length >= LIMITE_CCJ) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `A CCJ já tem ${LIMITE_CCJ} membros ativos (Art. 19, I) — encerre um antes de adicionar outro.` } };
      return;
    }

    const result = await pool.request().input("membroId", sql.Int, membroId)
      .query(`INSERT INTO ComissaoMembros (Sigla, MembroId) OUTPUT INSERTED.ComissaoMembroId VALUES ('CCJ', @membroId)`);
    const comissaoMembroId = result.recordset[0].ComissaoMembroId;

    await registrarAuditoria({
      tabela: "ComissaoMembros", registroId: comissaoMembroId, acao: "Adicionou membro à CCJ",
      usuarioId: usuario.membroId, dadosDepois: { membroId }
    });

    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Membro adicionado à CCJ." } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método/rota não suportado." } };
};
