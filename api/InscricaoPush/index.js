// InscricaoPush (vB.5 — Portal do membro, notificação push)
// GET    /api/push-inscricoes -> { vapidPublicKey } (chave pública, segura
//        de expor — é o que o navegador usa em PushManager.subscribe)
// POST   /api/push-inscricoes -> { endpoint, keys: { p256dh, auth } }
// DELETE /api/push-inscricoes -> { endpoint }
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  if (req.method === "GET") {
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null } };
    return;
  }

  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "POST") {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Inscrição de push inválida." } };
      return;
    }
    // MERGE por Endpoint (único globalmente) — o mesmo dispositivo pode
    // reinscrever (o navegador às vezes gera um novo endpoint sozinho) sem
    // acumular linha morta apontando pro dono errado.
    await pool.request()
      .input("membroId", sql.Int, usuario.membroId).input("endpoint", sql.NVarChar(500), endpoint)
      .input("p256dh", sql.NVarChar(200), keys.p256dh).input("auth", sql.NVarChar(100), keys.auth)
      .query(`
        MERGE PushInscricoesMembro AS destino
        USING (SELECT @endpoint AS Endpoint) AS origem ON destino.Endpoint = origem.Endpoint
        WHEN MATCHED THEN UPDATE SET MembroId = @membroId, P256dh = @p256dh, Auth = @auth
        WHEN NOT MATCHED THEN INSERT (MembroId, Endpoint, P256dh, Auth) VALUES (@membroId, @endpoint, @p256dh, @auth);
      `);
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Notificação push ativada neste dispositivo." } };
    return;
  }

  if (req.method === "DELETE") {
    const { endpoint } = req.body || {};
    if (!endpoint) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o endpoint da inscrição." } };
      return;
    }
    await pool.request().input("membroId", sql.Int, usuario.membroId).input("endpoint", sql.NVarChar(500), endpoint)
      .query(`DELETE FROM PushInscricoesMembro WHERE MembroId = @membroId AND Endpoint = @endpoint`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Notificação push desativada neste dispositivo." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Requisição inválida." } };
};
