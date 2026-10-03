// Roda a cada publicação no Directus (ver .github/workflows/content-notifications.yml,
// disparado pelo mesmo repository_dispatch "directus-publish" que já existe).
// Avisa por notificação push quem ativou "avisar quando sair mensagem/notícia
// nova" em /mensagens/ ou /noticias/ — dois tipos de conteúdo, dois campos de
// preferência (avisar_mensagens, avisar_noticias) na mesma inscrição.
//
// Idempotente de propósito: só notifica item com notificacao_enviada=false, e
// marca true logo depois de enviar — o "directus-publish" dispara pra QUALQUER
// mudança em várias coleções (não só mensagem/notícia nova), então este script
// roda com frequência maior do que o necessário; sem essa marca, republicar
// (ou só editar) uma mensagem antiga notificaria todo mundo de novo.
import webpush from "web-push";

const { DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, SITE_URL } = process.env;

if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SITE_URL) {
  throw new Error("Faltam variáveis de ambiente obrigatórias (ver README).");
}

webpush.setVapidDetails("mailto:seta@ieadespa.org", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

async function enviar(subscriptionKeys, payload) {
  try {
    await webpush.sendNotification(subscriptionKeys, payload);
    return { expirada: false };
  } catch (err) {
    // 404/410: inscrição não existe mais no navegador do visitante — sem
    // problema, só remove (mesmo critério do script de eventos).
    if (err.statusCode === 404 || err.statusCode === 410) return { expirada: true };
    console.error("Falha ao enviar push:", err.statusCode, err.body);
    return { expirada: false };
  }
}

async function processarTipo({ tipo, collection, campoPreferencia, montarUrl, montarTitulo, subs }) {
  const pendentesRes = await fetch(
    `${DIRECTUS_URL}/items/${collection}?filter[_and][0][draft][_eq]=false&filter[_and][1][notificacao_enviada][_eq]=false&limit=-1`,
    { headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` } },
  );
  if (!pendentesRes.ok) throw new Error(`Falha ao buscar ${collection} pendentes: ${pendentesRes.status}`);
  const { data: pendentes } = await pendentesRes.json();

  if (pendentes.length === 0) {
    console.log(`${tipo}: nada pendente.`);
    return new Set();
  }

  const interessados = subs.filter((sub) => sub[campoPreferencia] === true);
  console.log(`${tipo}: ${pendentes.length} pendente(s), ${interessados.length} inscrito(s) interessado(s).`);

  const expiradas = new Set();

  for (const item of pendentes) {
    const payload = JSON.stringify({
      title: montarTitulo(item),
      body: item.excerpt || "Confira no site.",
      url: montarUrl(item),
    });

    for (const sub of interessados) {
      const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
      const { expirada } = await enviar(subscription, payload);
      if (expirada) expiradas.add(sub.id);
    }

    // Marca como enviado assim que processado (mesmo se ninguém estava
    // inscrito) — não é "reprocessar até ter interessado", é "processado".
    await fetch(`${DIRECTUS_URL}/items/${collection}/${item.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ notificacao_enviada: true }),
    });
  }

  return expiradas;
}

async function main() {
  const subsRes = await fetch(`${DIRECTUS_URL}/items/push_subscriptions?limit=-1`, {
    headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` },
  });
  if (!subsRes.ok) throw new Error(`Falha ao buscar inscrições: ${subsRes.status}`);
  const { data: subs } = await subsRes.json();

  const expiradasMensagens = await processarTipo({
    tipo: "Mensagens",
    collection: "mensagens",
    campoPreferencia: "avisar_mensagens",
    montarUrl: (m) => `${SITE_URL}/mensagem/${m.slug}/`,
    montarTitulo: (m) => `Nova mensagem: ${m.title}`,
    subs,
  });

  const expiradasNoticias = await processarTipo({
    tipo: "Notícias",
    collection: "noticias",
    campoPreferencia: "avisar_noticias",
    montarUrl: (n) => `${SITE_URL}/noticia/${n.slug}/`,
    montarTitulo: (n) => `Nova notícia: ${n.title}`,
    subs,
  });

  const expiradas = new Set([...expiradasMensagens, ...expiradasNoticias]);
  for (const id of expiradas) {
    await fetch(`${DIRECTUS_URL}/items/push_subscriptions/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` },
    });
    console.log("Removida inscrição expirada:", id);
  }

  console.log("Concluído.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
