// shared/notificacaoPush.js (vB.5 — canal push do motor de notificações)
// Terceiro canal de NotificacaoRegras (junto de e-mail — vB.2), pro membro
// que instalou o PWA e autorizou notificação (PushInscricoesMembro,
// migração 082). WhatsApp continua fora (decisão da vB.2, custo de API
// paga) — push web é gratuito, só depende do par de chaves VAPID.
const webpush = require("web-push");

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

let configurado = false;
function garantirConfigurado() {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  if (!configurado) {
    webpush.setVapidDetails("mailto:secretaria@ieadespa.org.br", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    configurado = true;
  }
  return true;
}

// Best-effort, igual ao canal de e-mail: uma falha de push nunca derruba a
// notificação em si (já existe na central de avisos, vB.2). Inscrição
// morta (404/410 — a pessoa desinstalou ou revogou a permissão no
// navegador) é removida na hora, pra não ficar tentando pra sempre.
async function enviarPushNotificacao(pool, sql, membroId, { titulo, mensagem }) {
  if (!garantirConfigurado()) return 0;
  const inscricoes = (await pool.request().input("membroId", sql.Int, membroId)
    .query(`SELECT InscricaoId, Endpoint, P256dh, Auth FROM PushInscricoesMembro WHERE MembroId = @membroId`)).recordset;

  let enviados = 0;
  for (const insc of inscricoes) {
    try {
      await webpush.sendNotification(
        { endpoint: insc.Endpoint, keys: { p256dh: insc.P256dh, auth: insc.Auth } },
        JSON.stringify({ titulo, mensagem })
      );
      enviados++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await pool.request().input("id", sql.Int, insc.InscricaoId).query(`DELETE FROM PushInscricoesMembro WHERE InscricaoId = @id`);
      } else {
        console.error("[NOTIFICACOES] falha ao enviar push:", e.message);
      }
    }
  }
  return enviados;
}

module.exports = { enviarPushNotificacao };
