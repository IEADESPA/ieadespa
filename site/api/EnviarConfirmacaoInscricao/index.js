const { EmailClient } = require("@azure/communication-email");
const { permitir, ipDoPedido } = require("../src/lib/rateLimit");
const { renderEmailShell, renderCodigoBox, escaparHtml } = require("../src/lib/emailTemplate");

const ACS_CONNECTION_STRING = process.env.ACS_CONNECTION_STRING;
const REMETENTE = process.env.ACS_REMETENTE || "DoNotReply@ieadespa.org.br";
const SITE_URL = "https://ieadespa.org.br";

/*
 * Fase 21 — e-mail de confirmação no momento da inscrição. E-mail é sempre opcional no formulário público (a verificação de identidade
 * continua sendo código + telefone, nunca e-mail) — esta Function só manda um comprovante para quem quis deixar o e-mail. Melhor esforço:
 * a inscrição já está gravada antes desta chamada, e a página ignora qualquer falha aqui.
 *
 * 09/11/2026 (contra golpe): antes, o navegador mandava o título do evento, a data, o local e os nomes, e esta Function mandava do e-mail da
 * Igreja o que viesse — qualquer pessoa podia disparar um "Inscrição em <qualquer texto>" (por exemplo, com um Pix falso no título) para
 * qualquer endereço. Agora o navegador manda SÓ o e-mail, o evento e os códigos das inscrições; tudo o que vai no e-mail sai do Directus,
 * e só se as inscrições existirem, forem daquele evento e tiverem sido feitas há pouco (JANELA_MS). Cada inscrição recebe UM e-mail só
 * (por instância). O e-mail não traz chave Pix: leva o valor e o link do "Como pagar" da página do evento — a mesma regra do aviso
 * contra golpe ("pague só pelos dados mostrados aqui no site").
 */
const JANELA_MS = 30 * 60 * 1000;
const MAX_CODIGOS = 20;
const CODIGO = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,185}\.[^\s@<>"']{2,}$/;
const jaEnviados = new Map(); // código → quando (uma confirmação por inscrição, por instância)

function limparEnviados(agora) {
  for (const [codigo, quando] of jaEnviados) if (agora - quando > JANELA_MS) jaEnviados.delete(codigo);
}

/** O que veio do navegador: e-mail, evento e códigos válidos, ou o motivo de recusar. Os outros campos são ignorados. */
function lerPedido(body) {
  const b = body && typeof body === "object" ? body : {};
  const email = typeof b.email === "string" ? b.email.trim() : "";
  const eventoId = Number(b.eventoId);
  const codigos = Array.isArray(b.codigos) ? [...new Set(b.codigos.map((c) => String(c ?? "").trim().toUpperCase()))] : [];
  if (!email || email.length > 254 || !EMAIL.test(email)) return { erro: "E-mail inválido." };
  if (!Number.isInteger(eventoId) || eventoId <= 0) return { erro: "Evento inválido." };
  if (!codigos.length || codigos.length > MAX_CODIGOS || !codigos.every((c) => CODIGO.test(c))) return { erro: "Códigos inválidos." };
  return { email, eventoId, codigos };
}

const situacaoDe = (p) => (p.pendente_aprovacao ? "Aguardando aprovação da equipe organizadora" : p.aguardando_vaga ? "Lista de espera — avisamos se abrir vaga" : "Confirmada");
const reais = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "12 de novembro de 2026, 19h30–22h" a partir do evento do Directus (datas "AAAA-MM-DD", dia de calendário). */
function periodoDo(evento) {
  const fmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const dia = (d) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d) ? fmt.format(new Date(`${d.slice(0, 10)}T00:00:00Z`)) : null);
  const inicio = dia(evento.event_date);
  const fim = evento.end_date && evento.end_date !== evento.event_date ? dia(evento.end_date) : null;
  const horas = [evento.time, evento.end_time].filter((h) => typeof h === "string" && h.trim()).map((h) => h.trim()).join("–");
  return [fim ? `${inicio} a ${fim}` : inicio, horas || null].filter(Boolean).join(", ");
}

/** O e-mail inteiro, só com dados do Directus. */
function montarEmail(evento, pessoas) {
  const titulo = String(evento.title || "evento");
  const assunto = pessoas.length === 1 ? `Inscrição em ${titulo}` : `Inscrições em ${titulo}`;
  const periodoLocal = [periodoDo(evento), typeof evento.location === "string" ? evento.location.trim() : ""].filter(Boolean).join(" — ");
  const aPagar = pessoas.filter((p) => !p.pendente_aprovacao && !p.aguardando_vaga && Number(p.valor) > 0).reduce((s, p) => s + Number(p.valor), 0);
  const slug = typeof evento.slug === "string" && /^[a-z0-9-]+$/.test(evento.slug) ? evento.slug : null;
  const linkPagar = slug ? `${SITE_URL}/evento/${slug}/#como-pagar` : null;
  const linkInformar = slug ? `${SITE_URL}/informar-pagamento/${slug}/` : null;

  const blocoPagarHtml =
    aPagar > 0
      ? `<p style="margin:16px 0 0;font-size:15px;color:#3a3226;line-height:1.5;">Valor a pagar: <strong>${escaparHtml(reais(aPagar))}</strong>.${
          linkPagar ? ` Veja <a href="${linkPagar}">como pagar na página do evento</a> e, depois de pagar, <a href="${linkInformar}">informe o pagamento</a>.` : ""
        }</p>
    <p style="margin:8px 0 0;font-size:13px;color:#8a8172;line-height:1.5;">A Igreja não entra em contato pedindo pagamento ou Pix por mensagem, telefone ou e-mail: pague só pelos dados mostrados no site.</p>`
      : "";
  const corpoHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#3a3226;line-height:1.5;">
      Recebemos ${pessoas.length === 1 ? "sua inscrição" : "as inscrições do grupo"} em
      <strong>${escaparHtml(titulo)}</strong>${periodoLocal ? `, ${escaparHtml(periodoLocal)}` : ""}.
    </p>
    ${pessoas.map((p) => renderCodigoBox({ nome: p.nome, codigo: p.codigo, situacao: situacaoDe(p) })).join("")}
    <p style="margin:16px 0 0;font-size:13px;color:#8a8172;line-height:1.5;">
      Guarde o(s) código(s) acima — é o que confirma sua presença na entrada do evento.
    </p>${blocoPagarHtml}`;

  const corpoTexto = [
    `Recebemos ${pessoas.length === 1 ? "sua inscrição" : "as inscrições do grupo"} em "${titulo}".`,
    periodoLocal,
    "",
    pessoas.map((p) => `${p.nome}: código ${p.codigo} — ${situacaoDe(p)}`).join("\n"),
    "",
    "Guarde o(s) código(s) acima — é o que confirma sua presença na entrada do evento.",
    aPagar > 0 ? `Valor a pagar: ${reais(aPagar)}.${linkPagar ? ` Como pagar: ${linkPagar} — depois, informe o pagamento: ${linkInformar}` : ""}` : "",
    aPagar > 0 ? "A Igreja não entra em contato pedindo pagamento ou Pix por mensagem, telefone ou e-mail: pague só pelos dados mostrados no site." : "",
  ]
    .filter((linha) => linha !== "")
    .join("\n");
  return { assunto, corpoHtml, corpoTexto };
}

module.exports = async function (context, req) {
  if (!permitir(`confirmacao:${ipDoPedido(req)}`)) {
    context.res = { status: 429, body: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    return;
  }
  const DIRECTUS_URL = process.env.DIRECTUS_URL;
  const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;
  if (!ACS_CONNECTION_STRING || !DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
    context.log.error("Configuração ausente (ACS_CONNECTION_STRING/DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN).");
    context.res = { status: 500, body: { erro: "Configuração ausente." } };
    return;
  }

  const pedido = lerPedido(req.body);
  if (pedido.erro) {
    context.res = { status: 400, body: { erro: pedido.erro } };
    return;
  }

  const agora = Date.now();
  limparEnviados(agora);
  if (pedido.codigos.some((c) => jaEnviados.has(c))) {
    context.res = { status: 409, body: { erro: "A confirmação destas inscrições já foi enviada." } };
    return;
  }

  // As inscrições de verdade: daquele evento, com aqueles códigos — e o evento junto. Nada do que o navegador mandou além disso entra no e-mail.
  const campos = "nome,codigo,valor,aguardando_vaga,pendente_aprovacao,date_created,evento.id,evento.title,evento.slug,evento.event_date,evento.end_date,evento.time,evento.end_time,evento.location";
  const filtro = `filter[_and][0][evento][_eq]=${pedido.eventoId}&filter[_and][1][codigo][_in]=${pedido.codigos.join(",")}`;
  let inscricoes;
  try {
    const r = await fetch(`${DIRECTUS_URL}/items/inscricoes_eventos?${filtro}&fields=${campos}&limit=${MAX_CODIGOS}`, { headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` } });
    if (!r.ok) throw new Error(`Directus ${r.status}`);
    inscricoes = ((await r.json()).data || []).filter((i) => i && i.evento && Number(i.evento.id) === pedido.eventoId && pedido.codigos.includes(i.codigo));
  } catch (err) {
    context.log.error("Falha ao ler as inscrições para a confirmação:", err && err.message);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { enviado: false } };
    return;
  }
  const recentes = inscricoes.filter((i) => {
    const criada = Date.parse(i.date_created);
    return Number.isFinite(criada) && agora - criada >= -60 * 1000 && agora - criada <= JANELA_MS;
  });
  if (recentes.length !== pedido.codigos.length) {
    context.res = { status: 404, body: { erro: "Inscrição não encontrada." } };
    return;
  }
  for (const c of pedido.codigos) jaEnviados.set(c, agora); // antes de enviar: duas chamadas ao mesmo tempo não mandam dois e-mails

  const pessoas = pedido.codigos.map((c) => recentes.find((i) => i.codigo === c));
  const { assunto, corpoHtml, corpoTexto } = montarEmail(pessoas[0].evento, pessoas);
  try {
    const client = new EmailClient(ACS_CONNECTION_STRING);
    const poller = await client.beginSend({
      senderAddress: REMETENTE,
      content: { subject: assunto, plainText: corpoTexto, html: renderEmailShell({ titulo: assunto, corpoHtml }) },
      recipients: { to: [{ address: pedido.email }] },
    });
    await poller.pollUntilDone();
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { enviado: true } };
  } catch (err) {
    context.log.error("Falha ao enviar e-mail de confirmação:", err);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { enviado: false } };
  }
};

module.exports.lerPedido = lerPedido;
module.exports.montarEmail = montarEmail;
module.exports.periodoDo = periodoDo;
