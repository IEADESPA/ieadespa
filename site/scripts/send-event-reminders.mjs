// Roda uma vez por dia (ver .github/workflows/event-notifications.yml).
// Três mecanismos de aviso sobre eventos especiais que acontecem amanhã:
// 1. Quem ativou o aviso geral em /eventos/ (push_subscriptions) — só de
//    eventos cujo responsável está na lista de preferência da pessoa, ou
//    de todos, se ela não restringiu nada.
// 2. Quem se inscreveu naquele evento específico e ativou o lembrete na
//    própria página de inscrição (push_* em inscricoes_eventos) — sempre
//    só daquele evento, nunca dos outros.
// 3. Quem se inscreveu e deixou e-mail (Fase 21) — lembrete por e-mail,
//    independente de ter ativado push ou não (é o "segundo canal" que
//    faltava, comparado a Sympla/Even3/Eventbrite — ver README, Fase 21).
import webpush from "web-push";
import { EmailClient } from "@azure/communication-email";
import { renderEmailShell, escaparHtml } from "./emailTemplate.mjs";

const { DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, SITE_URL, ACS_CONNECTION_STRING } = process.env;

if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SITE_URL || !ACS_CONNECTION_STRING) {
  throw new Error("Faltam variáveis de ambiente obrigatórias (ver README).");
}

webpush.setVapidDetails("mailto:seta@ieadespa.org", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
const emailClient = new EmailClient(ACS_CONNECTION_STRING);
const REMETENTE = "DoNotReply@ieadespa.org.br";

function amanhaISO() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function enviar(subscriptionKeys, payload) {
  try {
    await webpush.sendNotification(subscriptionKeys, payload);
    return { expirada: false };
  } catch (err) {
    // 404/410: inscrição não existe mais no navegador do visitante
    // (ex.: limpou os dados do site) — sem problema, só remove.
    if (err.statusCode === 404 || err.statusCode === 410) return { expirada: true };
    console.error("Falha ao enviar push:", err.statusCode, err.body);
    return { expirada: false };
  }
}

async function main() {
  const amanha = amanhaISO();

  const eventsRes = await fetch(`${DIRECTUS_URL}/items/eventos?limit=-1`);
  if (!eventsRes.ok) throw new Error(`Falha ao buscar eventos: ${eventsRes.status}`);
  const { data: events } = await eventsRes.json();

  // Cobre eventos de vários dias: "amanhã" pode cair no meio do intervalo,
  // não só no primeiro dia.
  const matching = events.filter((e) => {
    if (!e.event_date) return false;
    const inicio = e.event_date;
    const fim = e.end_date || e.event_date;
    return amanha >= inicio && amanha <= fim;
  });

  if (matching.length === 0) {
    console.log(`Nenhum evento em ${amanha} — nada a enviar.`);
    return;
  }

  // --- Mecanismo 1: avisos gerais, filtrados por responsável preferido ---
  const subsRes = await fetch(`${DIRECTUS_URL}/items/push_subscriptions?limit=-1`, {
    headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` },
  });
  if (!subsRes.ok) throw new Error(`Falha ao buscar inscrições gerais: ${subsRes.status}`);
  const { data: subs } = await subsRes.json();

  console.log(`Mecanismo geral: ${matching.length} evento(s), ${subs.length} inscrito(s) em avisos.`);

  const expiradasGerais = new Set();

  for (const sub of subs) {
    const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
    const preferencias = Array.isArray(sub.responsaveis) && sub.responsaveis.length > 0 ? sub.responsaveis : null;

    for (const event of matching) {
      if (preferencias && !preferencias.includes(event.responsavel)) continue;

      const url = event.body ? `${SITE_URL}/evento/${event.slug}/` : `${SITE_URL}/eventos/`;
      const payload = JSON.stringify({
        title: `Amanhã: ${event.title}`,
        body: [event.time, event.location].filter(Boolean).join(" · ") || "Não perca!",
        url,
      });

      const { expirada } = await enviar(subscription, payload);
      if (expirada) expiradasGerais.add(sub.id);
    }
  }

  for (const id of expiradasGerais) {
    await fetch(`${DIRECTUS_URL}/items/push_subscriptions/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` },
    });
    console.log("Removida inscrição geral expirada:", id);
  }

  // --- Mecanismo 2: lembrete de quem se inscreveu no próprio evento ---
  const eventIds = matching.map((e) => e.id).join(",");
  const inscritosRes = await fetch(
    `${DIRECTUS_URL}/items/inscricoes_eventos?filter[_and][0][evento][_in]=${eventIds}&filter[_and][1][aguardando_vaga][_eq]=false&filter[_and][2][push_endpoint][_nnull]=true&fields=id,nome,evento,push_endpoint,push_p256dh,push_auth&limit=-1`,
    { headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` } },
  );
  if (!inscritosRes.ok) throw new Error(`Falha ao buscar inscritos com lembrete: ${inscritosRes.status}`);
  const { data: inscritos } = await inscritosRes.json();

  console.log(`Mecanismo por inscrição: ${inscritos.length} inscrito(s) com lembrete ativado.`);

  const expiradasInscricoes = new Set();
  const eventsPorId = new Map(matching.map((e) => [e.id, e]));

  for (const inscrito of inscritos) {
    const event = eventsPorId.get(inscrito.evento);
    if (!event) continue;

    const subscription = { endpoint: inscrito.push_endpoint, keys: { p256dh: inscrito.push_p256dh, auth: inscrito.push_auth } };
    const url = event.body ? `${SITE_URL}/evento/${event.slug}/` : `${SITE_URL}/eventos/`;
    const payload = JSON.stringify({
      title: `Amanhã: ${event.title}`,
      body: `${inscrito.nome}, não esqueça! ${[event.time, event.location].filter(Boolean).join(" · ")}`.trim(),
      url,
    });

    const { expirada } = await enviar(subscription, payload);
    if (expirada) expiradasInscricoes.add(inscrito.id);
  }

  for (const id of expiradasInscricoes) {
    await fetch(`${DIRECTUS_URL}/items/inscricoes_eventos/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ push_endpoint: null, push_p256dh: null, push_auth: null }),
    });
    console.log("Removido lembrete de inscrição expirado:", id);
  }

  // --- Mecanismo 3: lembrete por e-mail (Fase 21) ---
  const comEmailRes = await fetch(
    `${DIRECTUS_URL}/items/inscricoes_eventos?filter[_and][0][evento][_in]=${eventIds}&filter[_and][1][aguardando_vaga][_eq]=false&filter[_and][2][email][_nnull]=true&fields=nome,evento,email&limit=-1`,
    { headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` } },
  );
  if (!comEmailRes.ok) throw new Error(`Falha ao buscar inscritos com e-mail: ${comEmailRes.status}`);
  const { data: comEmail } = await comEmailRes.json();

  console.log(`Mecanismo por e-mail: ${comEmail.length} inscrito(s) com e-mail cadastrado.`);

  for (const inscrito of comEmail) {
    const event = eventsPorId.get(inscrito.evento);
    if (!event || !inscrito.email) continue;

    const local = [event.time, event.location].filter(Boolean).join(" · ");
    const assunto = `Amanhã: ${event.title}`;
    const corpoHtml = `
      <p style="margin:0 0 16px;font-size:15px;color:#3a3226;line-height:1.5;">
        ${escaparHtml(inscrito.nome)}, não esqueça! <strong>${escaparHtml(event.title)}</strong> é amanhã${local ? `, ${escaparHtml(local)}` : ""}.
      </p>
      <p style="margin:0;font-size:14px;">
        <a href="${SITE_URL}/evento/${event.slug}/" style="color:#8f6f1f;">Ver detalhes do evento</a>
      </p>`;
    try {
      const poller = await emailClient.beginSend({
        senderAddress: REMETENTE,
        content: {
          subject: assunto,
          plainText: `${inscrito.nome}, não esqueça! ${event.title}${local ? ` — ${local}` : ""}.\n\n${SITE_URL}/evento/${event.slug}/`,
          html: renderEmailShell({ titulo: assunto, corpoHtml }),
        },
        recipients: { to: [{ address: inscrito.email }] },
      });
      await poller.pollUntilDone();
    } catch (err) {
      console.error("Falha ao enviar lembrete por e-mail:", inscrito.email, err);
    }
  }

  console.log("Concluído.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
