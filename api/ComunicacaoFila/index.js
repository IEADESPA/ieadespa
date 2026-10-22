// ComunicacaoFila (v7.12) — uma rodada da fila de comunicados (celular e e-mail), chamada a cada 15 minutos pelo workflow rotinas-comunicacao.yml (segredo da rotina).
// POST /api/comunicacao-fila-interna   cabeçalhos: x-cron-secret; x-somente-se-pendente (pergunta antes à marca no Storage e não abre o banco se a fila está vazia)
//
// O serviço de e-mail do Azure aceita 30 por minuto e 100 por hora no domínio da Igreja: cada rodada manda até COMUNICACAO_EMAILS_POR_RODADA e nunca passa de
// COMUNICACAO_EMAILS_POR_HORA na última hora (Catálogos → Prazos). A rodada diária das 7h (NotificacoesAgendador) também roda uma.
const { getPool } = require("../shared/db");
const { exigirSegredoRotina } = require("../shared/cronAuth");
const marca = require("../shared/comunicacaoFilaMarca");
const db = require("../shared/comunicacaoDb");

module.exports = async function (context, req) {
  if (!exigirSegredoRotina(req, context)) return;
  if (req.headers && req.headers["x-somente-se-pendente"]) {
    const g = await marca.lerGuardada();
    if (g && g.pendentes === 0) { context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, ocioso: true } }; return; }
  }
  try {
    const r = await db.processarFila(await getPool());
    context.log(`[COMUNICACAO] rodada: celular ${r.push.aceitos}, e-mail ${r.email.aceitos} (cota ${r.email.cota}, adiados ${r.email.adiados}), na fila ${r.pendentes}.`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, ...r } };
  } catch (e) {
    context.log.error("[COMUNICACAO] rodada da fila:", e && e.message);
    await marca.gravar(null);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { sucesso: false } };
  }
};
