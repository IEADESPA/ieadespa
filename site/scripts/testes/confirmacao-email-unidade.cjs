// Testes de UNIDADE do e-mail de confirmação da inscrição (api/EnviarConfirmacaoInscricao, 09/11/2026), sem rede: o navegador manda só o
// e-mail, o evento e os códigos; tudo o que vai no e-mail sai do Directus, e só para inscrições daquele evento, feitas há pouco, uma vez
// cada. Antes, qualquer pessoa disparava do e-mail da Igreja um "Inscrição em <qualquer texto>" para qualquer endereço — o golpe perfeito.
// O envio (Azure Communication Services) e o Directus são de mentira; nada sai daqui.
// Como rodar (de dentro de site/):  node scripts/testes/confirmacao-email-unidade.cjs
process.env.ACS_CONNECTION_STRING = "endpoint=https://teste.invalid/;accesskey=dGVzdGU=";
process.env.DIRECTUS_URL = "http://directus.teste";
process.env.DIRECTUS_ADMIN_TOKEN = "token-admin-de-teste";
const path = require("path");
const Module = require("module");

// o cliente de e-mail de mentira: guarda o que seria enviado
const enviados = [];
let falharEnvio = false;
const carregarOriginal = Module._load;
Module._load = function (pedido, ...resto) {
  if (pedido === "@azure/communication-email") {
    return {
      EmailClient: class {
        async beginSend(msg) {
          if (falharEnvio) throw new Error("ACS fora do ar");
          enviados.push(msg);
          return { pollUntilDone: async () => ({ status: "Succeeded" }) };
        }
      },
    };
  }
  return carregarOriginal.call(this, pedido, ...resto);
};

// o Directus de mentira: as inscrições guardadas
const AGORA = Date.now();
const evento = { id: 304, title: "Engenharia Ministerial", slug: "engenharia-ministerial", event_date: "2026-11-28", end_date: "2026-11-29", time: "19h", end_time: "22h", location: "Templo Central" };
const outroEvento = { id: 99, title: "Outro", slug: "outro" };
let banco = [];
const chamadasDirectus = [];
let directusFora = false;
global.fetch = async (url, op = {}) => {
  chamadasDirectus.push({ url: String(url), auth: op.headers && op.headers.Authorization });
  if (directusFora) return { ok: false, status: 503, json: async () => ({}) };
  const u = new URL(String(url));
  const eventoId = Number(u.searchParams.get("filter[_and][0][evento][_eq]"));
  const codigos = (u.searchParams.get("filter[_and][1][codigo][_in]") || "").split(",");
  return { ok: true, status: 200, json: async () => ({ data: banco.filter((i) => i.evento.id === eventoId && codigos.includes(i.codigo)) }) };
};
const insc = (codigo, extra = {}) => ({ nome: `Pessoa ${codigo}`, codigo, valor: 50, aguardando_vaga: false, pendente_aprovacao: false, date_created: new Date(AGORA - 60 * 1000).toISOString(), evento, ...extra });

const fn = require(path.join(__dirname, "../../api/EnviarConfirmacaoInscricao/index.js"));

let falhas = 0;
let total = 0;
const eq = (a, b, d) => {
  total += 1;
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { falhas++; console.log("  FALHA", d, "→", JSON.stringify(a), "esperado", JSON.stringify(b)); } else console.log("  ok   ", d);
};
const verdade = (c, d) => eq(!!c, true, d);
async function tentar(nome, f) {
  try { await f(); } catch (e) { falhas++; total++; console.log("  FALHA", nome, "→ o bloco quebrou:", e && e.message); }
}
let ip = 0;
async function chamar(body, ipFixo) {
  const context = { log: Object.assign(() => {}, { error: () => {}, warn: () => {} }), res: null };
  await fn(context, { body, headers: { "x-forwarded-for": ipFixo || `10.0.${Math.floor(ip / 250)}.${(ip++ % 250) + 1}` } });
  return context.res;
}

(async () => {
  await tentar("o pedido", async () => {
    console.log("== o que o navegador pode mandar ==");
    const base = { email: "maria@exemplo.com", eventoId: 304, codigos: ["ABC234"] };
    eq(fn.lerPedido(base), base, "e-mail, evento e códigos certos: aceitos");
    eq(fn.lerPedido({ ...base, codigos: ["abc234", "ABC234"] }).codigos, ["ABC234"], "código em minúscula vira maiúscula; repetido sai");
    for (const [d, b] of [
      ["sem e-mail", { ...base, email: "" }],
      ["e-mail sem arroba", { ...base, email: "maria.exemplo.com" }],
      ["e-mail com <", { ...base, email: "a<b@x.com" }],
      ["e-mail enorme", { ...base, email: `${"a".repeat(64)}@${"b".repeat(190)}.com` }],
      ["evento texto", { ...base, eventoId: "x" }],
      ["evento zero", { ...base, eventoId: 0 }],
      ["sem códigos", { ...base, codigos: [] }],
      ["código com letra ambígua (O)", { ...base, codigos: ["ABCD0O"] }],
      ["código curto", { ...base, codigos: ["ABC"] }],
      ["21 códigos", { ...base, codigos: Array.from({ length: 21 }, (_, i) => `ABCD${"ABCDEFGHJKMNPQRSTUVWXYZ"[i]}2`) }],
    ])
      verdade(fn.lerPedido(b).erro, `${d}: recusado`);
    eq(fn.lerPedido(null).erro, "E-mail inválido.", "corpo vazio: recusado");
  });

  await tentar("o envio", async () => {
    console.log("== o envio (só com dados do Directus) ==");
    banco = [insc("ABC234"), insc("XYZ789", { evento: outroEvento }), insc("VEHAS2", { date_created: new Date(AGORA - 31 * 60 * 1000).toISOString() }), insc("ESPERA", { aguardando_vaga: true, valor: 80 })];

    let r = await chamar({ email: "a@b.com", eventoId: 304, codigos: ["ZZZZZZ"] });
    eq([r.status, enviados.length], [404, 0], "código que não existe: não envia");
    r = await chamar({ email: "a@b.com", eventoId: 304, codigos: ["XYZ789"] });
    eq([r.status, enviados.length], [404, 0], "código de OUTRO evento: não envia");
    r = await chamar({ email: "a@b.com", eventoId: 304, codigos: ["VEHAS2"] });
    eq([r.status, enviados.length], [404, 0], "inscrição de mais de 30 minutos: não envia (não serve para mandar e-mail velho a qualquer um)");
    r = await chamar({ email: "a@b.com", eventoId: 304, codigos: ["ABC234", "ZZZZZZ"] });
    eq([r.status, enviados.length], [404, 0], "um código certo e um errado: não envia nada");
    verdade(chamadasDirectus.every((c) => c.auth === "Bearer token-admin-de-teste"), "lê o Directus com o token do servidor");

    r = await chamar({ email: "maria@exemplo.com", eventoId: 304, codigos: ["ABC234"], eventoTitulo: "PAGUE O PIX 999 AGORA", pessoas: [{ nome: "Golpista", codigo: "GOLPE1" }], eventoLocal: "<b>x</b>" });
    eq([r.status, r.body.enviado, enviados.length], [200, true, 1], "inscrição certa e recente: envia um e-mail");
    const m = enviados[0];
    eq(m.recipients.to, [{ address: "maria@exemplo.com" }], "para o e-mail pedido");
    eq(m.content.subject, "Inscrição em Engenharia Ministerial", "o assunto com o título do Directus");
    const tudo = m.content.subject + m.content.plainText + m.content.html;
    verdade(!/PAGUE O PIX|Golpista|GOLPE1|<b>x<\/b>/.test(tudo), "nada do que o navegador mandou além de e-mail/evento/códigos entra no e-mail");
    verdade(/28 de novembro de 2026 a 29 de novembro de 2026, 19h–22h — Templo Central/.test(m.content.plainText), "data, horário e local saem do Directus");
    verdade(/Pessoa ABC234: código ABC234 — Confirmada/.test(m.content.plainText), "o nome, o código e a situação");
    verdade(/Valor a pagar: R\$\s?50,00\. Como pagar: https:\/\/ieadespa\.org\.br\/evento\/engenharia-ministerial\/#como-pagar/.test(m.content.plainText), "o valor e o link do \"Como pagar\" da página do evento");
    verdade(/A Igreja não entra em contato pedindo pagamento ou Pix/.test(m.content.plainText) && !/chave/i.test(m.content.plainText), "o aviso contra golpe vai junto, e o e-mail não traz chave Pix (ela fica só no site)");

    r = await chamar({ email: "outra@exemplo.com", eventoId: 304, codigos: ["ABC234"] });
    eq([r.status, enviados.length], [409, 1], "a mesma inscrição de novo (até para outro e-mail): não envia o segundo");
  });

  await tentar("grupo, espera e nomes", async () => {
    console.log("== grupo, lista de espera e nomes com HTML ==");
    banco = [insc("GRUP22", { nome: "Ana <img src=x onerror=alert(1)>" }), insc("GRUP23", { aguardando_vaga: true, valor: 80 }), insc("GRUP24", { pendente_aprovacao: true, valor: 70 })];
    const antes = enviados.length;
    const r = await chamar({ email: "grupo@exemplo.com", eventoId: 304, codigos: ["GRUP22", "GRUP23", "GRUP24"] });
    eq([r.status, enviados.length - antes], [200, 1], "o grupo recebe um e-mail só");
    const m = enviados[enviados.length - 1];
    eq(m.content.subject, "Inscrições em Engenharia Ministerial", "assunto no plural");
    verdade(/Valor a pagar: R\$\s?50,00/.test(m.content.plainText), "o valor conta só quem ficou confirmado (espera e aprovação pendente ainda não pagam)");
    verdade(!/<img src=x/.test(m.content.html) && /&lt;img src=x/.test(m.content.html), "nome com HTML vai escapado");
    verdade(/Lista de espera/.test(m.content.plainText) && /Aguardando aprovação/.test(m.content.plainText), "as situações de cada um");
  });

  await tentar("sem valor e falhas", async () => {
    console.log("== sem valor, Directus fora e envio que falha ==");
    banco = [insc("GRATS2", { valor: 0, evento: { ...evento, slug: null, location: null, end_date: null, time: null, end_time: null } })];
    let r = await chamar({ email: "g@exemplo.com", eventoId: 304, codigos: ["GRATS2"] });
    const m = enviados[enviados.length - 1];
    verdade(r.status === 200 && !/Valor a pagar/.test(m.content.plainText) && !/A Igreja não entra em contato/.test(m.content.plainText), "inscrição sem valor: sem o bloco de pagamento");
    verdade(/em "Engenharia Ministerial"\.\n28 de novembro de 2026\n/.test(m.content.plainText), "evento sem horário nem local: só a data");
    banco = [insc("FXRA22")];
    directusFora = true;
    const antes = enviados.length;
    r = await chamar({ email: "f@exemplo.com", eventoId: 304, codigos: ["FXRA22"] });
    eq([r.status, r.body.enviado, enviados.length - antes], [200, false, 0], "Directus fora do ar: não envia e não quebra");
    directusFora = false;
    falharEnvio = true;
    r = await chamar({ email: "f@exemplo.com", eventoId: 304, codigos: ["FXRA22"] });
    eq([r.status, r.body.enviado], [200, false], "o envio falhando: responde sem quebrar");
    falharEnvio = false;
  });

  await tentar("limite por IP", async () => {
    console.log("== limite por acesso ==");
    const res = [];
    for (let i = 0; i < 22; i++) res.push((await chamar({ email: "x" }, "203.0.113.9")).status);
    eq([res.slice(0, 20).every((s) => s === 400), res[20], res[21]], [true, 429, 429], "o mesmo acesso: 20 tentativas em 5 minutos, depois 429");
  });

  await tentar("a página", async () => {
    console.log("== a página do evento ==");
    const ev = require("fs").readFileSync(path.join(__dirname, "../../src/pages/evento/[slug].astro"), "utf8");
    verdade(/body: JSON\.stringify\(\{ email, eventoId: Number\(form\.dataset\.eventoId\), codigos: resultados\.map\(\(r\) => r\.codigo\) \}\)/.test(ev), "a página manda só o e-mail, o evento e os códigos");
    verdade(!/eventoTitulo|eventoPeriodo|eventoLocal/.test(ev), "e não tem mais o título, o período e o local para mandar");
  });

  console.log(`\nconfirmação por e-mail: ${total - falhas}/${total} verificações ok${falhas ? ` — ${falhas} FALHA(S)` : ""}`);
  process.exit(falhas ? 1 : 0);
})();
