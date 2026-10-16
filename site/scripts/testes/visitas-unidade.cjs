// Testes de UNIDADE do contador de visitas (api/src/lib/visitas.js + api/RegistrarVisita): a validação, os robôs, o buffer em memória (descarga por tamanho e por tempo com relógio injetável), a
// falha do Directus devolvendo as linhas ao buffer, o teto de 500 e uma rajada de 500 visitas ao mesmo tempo que vira poucas gravações — e o handler de verdade (limite por IP, 204, 400, 413, corpo
// do POST ao Directus) com o `fetch` trocado por um de mentira. Sem rede e sem segredos. Como rodar (de dentro de site/):  node scripts/testes/visitas-unidade.cjs
const path = require("path");

let falhas = 0;
let total = 0;
const eq = (a, b, d) => {
  total++;
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { falhas++; console.log("  FALHA", d, "→", JSON.stringify(a), "esperado", JSON.stringify(b)); } else console.log("  ok   ", d);
};
const verdade = (c, d) => eq(!!c, true, d);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const LIB = path.join(__dirname, "../../api/src/lib/visitas.js");
const RATE = path.join(__dirname, "../../api/src/lib/rateLimit.js");
const HANDLER = path.join(__dirname, "../../api/RegistrarVisita/index.js");
const V = require(LIB);

const linha = (i) => ({ path: `/pagina-${i}`, referrer_domain: null });

// um registrador com relógio nosso e uma gravação de mentira que anota tudo
function montar({ falhar = false, atraso = 0, opcoes = {} } = {}) {
  const estado = { agora: 1_000_000, gravacoes: [], emVoo: 0, maxEmVoo: 0, falhar, atraso };
  const gravar = async (linhas) => {
    estado.emVoo++;
    estado.maxEmVoo = Math.max(estado.maxEmVoo, estado.emVoo);
    try {
      if (estado.atraso) await dormir(estado.atraso);
      if (estado.falhar) throw new Error("Directus fora do ar");
      estado.gravacoes.push(linhas.map((l) => l.path));
    } finally { estado.emVoo--; }
  };
  const reg = V.criarRegistrador({ gravar, agora: () => estado.agora, ...opcoes });
  return { estado, reg };
}
const gravadas = (e) => e.gravacoes.reduce((s, g) => s + g.length, 0);

function validacao() {
  console.log("== validar a visita ==");
  eq(V.validarVisita({ path: "/", referrer_domain: null }), { ok: true, linha: { path: "/", referrer_domain: null } }, "a página inicial, sem origem");
  eq(V.validarVisita({ path: "/noticias/2026/", referrer_domain: "www.google.com" }).linha, { path: "/noticias/2026/", referrer_domain: "www.google.com" }, "caminho e origem normais");
  eq(V.validarVisita({ path: "/a", referrer_domain: "WWW.Google.COM" }).linha.referrer_domain, "www.google.com", "o domínio é gravado em minúsculas");
  eq(V.validarVisita({ path: "/a" }).linha, { path: "/a", referrer_domain: null }, "sem o campo da origem = null");
  eq(V.validarVisita({ path: "/a", referrer_domain: "" }).linha.referrer_domain, null, "origem vazia = null");
  eq(V.validarVisita({ path: "/a", referrer_domain: "[2001:db8::1]" }).ok, true, "host IPv6 entre colchetes vale");
  eq(V.validarVisita({ path: "/a", referrer_domain: "10.0.0.1" }).ok, true, "host por número vale");
  eq(V.validarVisita({ path: "/a", extra: "x", referrer_domain: null, outro: { a: 1 } }).linha, { path: "/a", referrer_domain: null }, "campos além dos dois são ignorados (só path e referrer_domain passam)");

  for (const [corpo, desc] of [
    [null, "corpo nulo"], [undefined, "sem corpo"], ["texto", "corpo texto"], [[{ path: "/a" }], "corpo lista"], [42, "corpo número"],
    [{}, "sem caminho"], [{ path: "" }, "caminho vazio"], [{ path: 5 }, "caminho que não é texto"], [{ path: null }, "caminho nulo"],
    [{ path: "pagina" }, "caminho que não começa com /"], [{ path: "http://x.com/" }, "URL inteira no lugar do caminho"],
    [{ path: "/a?x=1" }, "com consulta (?)"], [{ path: "/a#topo" }, "com âncora (#)"], [{ path: "/a\nb" }, "com quebra de linha"],
    [{ path: "/a\u0000b" }, "com byte nulo"], [{ path: "/a\tb" }, "com tabulação"], [{ path: "/a\u007fb" }, "com DEL"], [{ path: "/a\u0085b" }, "com controle C1"], [{ path: "/a b" }, "com separador de linha Unicode"],
    [{ path: "/" + "a".repeat(200) }, "com 201 caracteres"],
    [{ path: "/a", referrer_domain: 7 }, "origem número"], [{ path: "/a", referrer_domain: ["x.com"] }, "origem lista"],
    [{ path: "/a", referrer_domain: "https://x.com/pagina" }, "origem com URL inteira"], [{ path: "/a", referrer_domain: "x.com/pagina" }, "origem com barra"],
    [{ path: "/a", referrer_domain: "x.com:8080" }, "origem com porta"], [{ path: "/a", referrer_domain: "a b.com" }, "origem com espaço"],
    [{ path: "/a", referrer_domain: "x.com\n" }, "origem com quebra de linha"], [{ path: "/a", referrer_domain: ".x.com" }, "origem começando com ponto"], [{ path: "/a", referrer_domain: "x.com-" }, "origem terminando em hífen"],
    [{ path: "/a", referrer_domain: "a".repeat(101) }, "origem com 101 caracteres"], [{ path: "/a", referrer_domain: "<script>" }, "origem com marcação"],
  ]) eq(V.validarVisita(corpo).ok, false, `recusa: ${desc}`);
  eq(V.validarVisita({ path: "/" + "a".repeat(199) }).ok, true, "200 caracteres exatos valem");
  eq(V.validarVisita({ path: "/a", referrer_domain: "a".repeat(100) }).ok, true, "origem com 100 caracteres exatos vale");

  console.log("== tamanho e leitura do corpo ==");
  eq(V.tamanhoDoCorpo({ rawBody: "x".repeat(1024) }), 1024, "tamanho pelo texto cru");
  eq(V.tamanhoDoCorpo({ rawBody: "é" }), 2, "tamanho em bytes, não em letras");
  eq(V.tamanhoDoCorpo({ body: { a: "x".repeat(2000) } }) > V.LIMITE_CORPO_BYTES, true, "sem texto cru, mede o corpo lido");
  eq(V.tamanhoDoCorpo({}), 0, "sem corpo = 0");
  eq(V.lerCorpo({ body: '{"path":"/a"}' }), { path: "/a" }, "corpo que chega como texto JSON é lido");
  eq(V.lerCorpo({ body: "{lixo" }), null, "texto que não é JSON = nulo");
  eq(V.lerCorpo({ body: { path: "/a" } }), { path: "/a" }, "corpo já lido passa direto");
}

function robos() {
  console.log("== robôs ==");
  for (const ua of [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Mozilla/5.0 (compatible; bingbot/2.0)", "Mozilla/5.0 (Windows NT 10.0) HeadlessChrome/120.0", "curl/8.4.0",
    "WhatsApp/2.23.20 A", "facebookexternalhit/1.1", "Mozilla/5.0 (compatible; YandexBot/3.0)", "Slackbot-LinkExpanding 1.0", "Mozilla/5.0 (compatible; AhrefsSpider)", "Twitterbot/1.0",
    "Mozilla/5.0 (X11) Chrome Lighthouse web-preview","Mozilla/5.0 Crawler-Teste", "BOT", "Mozilla/5.0 SPIDER",
  ]) eq(V.ehRobo(ua), true, `robô: ${ua.slice(0, 50)}`);
  for (const ua of [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36", "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
  ]) eq(V.ehRobo(ua), false, `pessoa: ${ua.slice(0, 50)}`);
  eq(V.ehRobo(undefined), false, "sem user-agent não é tratado como robô (o limite por IP é quem segura abuso)");
}

async function bufferEDescarga() {
  console.log("== buffer: descarga por tamanho e por tempo ==");
  {
    const { estado, reg } = montar();
    const r1 = await reg.registrar(linha(1));
    eq([r1.descarregou, r1.ok, estado.gravacoes.length], [true, true, 1], "a primeira visita de uma instância nova já grava (com pouco movimento nada fica esperando)");
    eq(estado.gravacoes[0], ["/pagina-1"], "…e grava essa linha");
    eq(reg.tamanhoDoBuffer(), 0, "buffer vazio depois da descarga");

    for (let i = 2; i <= 25; i++) { estado.agora += 100; const r = await reg.registrar(linha(i)); if (r.descarregou) eq(i, -1, "não era hora de gravar"); }
    eq([estado.gravacoes.length, reg.tamanhoDoBuffer()], [1, 24], "24 visitas em 2,4 s: nenhuma gravação nova, tudo no buffer");
    estado.agora += 100;
    const r26 = await reg.registrar(linha(26));
    eq([r26.descarregou, r26.linhas, estado.gravacoes.length, reg.tamanhoDoBuffer()], [true, 25, 2, 0], "a 25ª visita do buffer dispara UMA gravação de 25 linhas");
    eq(estado.gravacoes[1].slice(0, 2).concat(estado.gravacoes[1].slice(-1)), ["/pagina-2", "/pagina-3", "/pagina-26"], "as 25 linhas estão em ordem de chegada");

    for (let i = 27; i <= 30; i++) { estado.agora += 1000; await reg.registrar(linha(i)); }
    eq([estado.gravacoes.length, reg.tamanhoDoBuffer()], [2, 4], "4 visitas em 4 s: ainda esperando");
    estado.agora += 5999;
    const r31 = await reg.registrar(linha(31));
    eq([r31.descarregou, reg.tamanhoDoBuffer()], [false, 5], "9,999 s depois da última descarga: ainda não");
    estado.agora += 1;
    const r32 = await reg.registrar(linha(32));
    eq([r32.descarregou, r32.linhas, estado.gravacoes.length], [true, 6, 3], "10 s exatos depois da última descarga: grava o que tem (por tempo)");
    eq(gravadas(estado), 1 + 25 + 6, "nenhuma visita se perdeu nem se repetiu (32 visitas, 32 linhas gravadas)");
    eq(new Set(estado.gravacoes.flat()).size, 32, "nenhuma linha repetida");
  }
  {
    const { estado, reg } = montar();
    await reg.registrar(linha(0));
    estado.agora += 30_000;
    const r = await reg.registrar(linha(1));
    eq([r.descarregou, r.linhas], [true, 1], "com pouco movimento (uma visita a cada 30 s) cada visita grava a si mesma");
  }
  {
    const { estado, reg } = montar({ opcoes: { tamanho: 3, intervaloMs: 500 } });
    await reg.registrar(linha(0));
    for (let i = 1; i <= 3; i++) await reg.registrar(linha(i));
    eq(estado.gravacoes.length, 2, "os limites são configuráveis (3 linhas): a terceira dispara a gravação");
  }
}

async function falhaDoDirectus() {
  console.log("== falha do Directus ==");
  const { estado, reg } = montar();
  await reg.registrar(linha(0)); // primeira descarga, ok
  estado.falhar = true;
  for (let i = 1; i <= 24; i++) { estado.agora += 100; await reg.registrar(linha(i)); }
  estado.agora += 100;
  const falha = await reg.registrar(linha(25));
  eq([falha.descarregou, falha.ok, falha.linhas, !!falha.erro], [true, false, 25, true], "a 25ª visita tenta gravar e falha: o resultado diz que falhou (a visita em si não quebra)");
  eq(reg.tamanhoDoBuffer(), 25, "as 25 linhas voltaram ao buffer");
  eq(reg.copiaDoBuffer().map((l) => l.path)[0], "/pagina-1", "…na ordem de chegada (as mais antigas na frente)");

  // com o buffer cheio e o Directus mal, as visitas seguintes NÃO martelam o Directus: só tentam de novo passados 10 s
  let tentou = 0;
  for (let i = 26; i <= 60; i++) { estado.agora += 100; const r = await reg.registrar(linha(i)); if (r.descarregou) tentou++; }
  eq([tentou, reg.tamanhoDoBuffer()], [0, 60], "35 visitas durante a espera de 10 s depois da falha: nenhuma nova tentativa, buffer cresce");

  estado.agora += 10_000; // Directus voltou
  estado.falhar = false;
  const volta = await reg.registrar(linha(61));
  eq([volta.descarregou, volta.ok, volta.linhas], [true, true, 61], "passados 10 s a gravação é refeita e leva tudo o que ficou (61 linhas de uma vez)");
  eq(reg.tamanhoDoBuffer(), 0, "buffer vazio");
  eq(gravadas(estado), 1 + 61, "nenhuma visita se perdeu (62 visitas, 62 linhas gravadas)");
  eq(new Set(estado.gravacoes.flat()).size, 62, "e nenhuma ficou repetida");
  eq(estado.gravacoes[1][0], "/pagina-1", "as mais antigas saem primeiro");

  // falha por exceção síncrona também não derruba
  const sincrono = V.criarRegistrador({ gravar: () => { throw new Error("quebrou sem promessa"); }, agora: () => 5 });
  const rs = await sincrono.registrar(linha(1));
  eq([rs.ok, sincrono.tamanhoDoBuffer()], [false, 1], "gravar que lança erro sem promessa também só devolve a linha ao buffer");
}

async function teto() {
  console.log("== teto de 500 linhas ==");
  const { estado, reg } = montar({ falhar: true });
  await reg.registrar(linha(0));
  for (let i = 1; i <= 700; i++) { estado.agora += 11_000; await reg.registrar(linha(i)); } // Directus fora do ar o tempo todo, uma tentativa a cada visita
  eq(reg.tamanhoDoBuffer(), 500, "700 visitas com o Directus fora do ar: o buffer para em 500");
  const caminhos = reg.copiaDoBuffer().map((l) => l.path);
  eq([caminhos[0], caminhos[499]], ["/pagina-201", "/pagina-700"], "ficaram as 500 mais NOVAS (as mais antigas foram descartadas)");

  estado.falhar = false;
  estado.agora += 11_000;
  const r = await reg.registrar(linha(701));
  eq([r.ok, r.linhas], [true, 500], "quando o Directus volta, uma gravação de no máximo 500 linhas");
  eq(estado.gravacoes[0].length, 500, "a gravação tem 500 linhas");
  eq(estado.gravacoes[0][499], "/pagina-701", "…e termina na visita mais nova");

  // a devolução depois de falha também respeita o teto: chegam visitas durante a gravação que falha
  const b = montar({ atraso: 30, opcoes: { teto: 10, tamanho: 5, intervaloMs: 1000 } });
  b.estado.falhar = true;
  const disparo = Promise.all([1, 2, 3, 4, 5].map((i) => b.reg.registrar(linha(i)))); // a 1ª já grava (e falha daqui a 30 ms); as outras 4 chegam durante a gravação
  await dormir(5);
  for (let i = 6; i <= 12; i++) await b.reg.registrar(linha(i)); // mais 7 enquanto grava: buffer novo com 11 (4 + 7) > 10 → já aparou antes da devolução
  await disparo;
  const caminhosB = b.reg.copiaDoBuffer().map((l) => l.path);
  verdade(caminhosB.length <= 10, `devolução depois da falha não passa do teto (${caminhosB.length} linhas, teto 10)`);
  eq(caminhosB[caminhosB.length - 1], "/pagina-12", "a mais nova continua lá");
}

async function rajada() {
  console.log("== rajada de 500 visitas ao mesmo tempo ==");
  {
    const { estado, reg } = montar({ atraso: 20 });
    const resultados = await Promise.all(Array.from({ length: 500 }, (_, i) => reg.registrar(linha(i))));
    eq(resultados.filter((r) => r.descarregou).length, 1, "instância nova, 500 visitas ao mesmo tempo: só UMA requisição grava (as outras só guardam e respondem)");
    eq(estado.maxEmVoo, 1, "nunca duas gravações ao mesmo tempo");
    eq([estado.gravacoes.length, reg.tamanhoDoBuffer()], [1, 499], "uma gravação feita, 499 esperando no buffer (cabem nos 500)");
    estado.agora += 100;
    const depois = await reg.registrar(linha(500));
    eq([depois.descarregou, depois.linhas], [true, 500], "a próxima visita grava as 500 de uma vez");
    eq([estado.gravacoes.length, gravadas(estado), new Set(estado.gravacoes.flat()).size], [2, 501, 501], "501 visitas = 2 gravações, 501 linhas, nenhuma repetida nem perdida");
  }
  {
    // instância já aquecida (houve descarga há pouco): a 25ª visita da rajada grava, o resto espera a gravação terminar
    const { estado, reg } = montar({ atraso: 20 });
    await reg.registrar(linha(-1));
    estado.agora += 50;
    estado.atraso = 20;
    const resultados = await Promise.all(Array.from({ length: 500 }, (_, i) => reg.registrar(linha(i))));
    eq(resultados.filter((r) => r.descarregou).length, 1, "instância aquecida: 500 visitas ao mesmo tempo = 1 requisição grava");
    eq([estado.gravacoes.length, estado.gravacoes[1].length, reg.tamanhoDoBuffer()], [2, 25, 475], "a 25ª dispara a gravação de 25; as outras 475 esperam");
    eq(estado.maxEmVoo, 1, "uma gravação por vez");
    estado.agora += 100;
    await reg.registrar(linha(500));
    eq([estado.gravacoes.length, gravadas(estado)], [3, 1 + 500 + 1], "3 gravações para 502 visitas, nenhuma perdida");
  }
  {
    // ondas: 2.000 visitas em ondas de 100, com o relógio andando 1 s por onda — o Directus vê dezenas de gravações, não milhares
    const { estado, reg } = montar({ atraso: 5 });
    for (let onda = 0; onda < 20; onda++) {
      await Promise.all(Array.from({ length: 100 }, (_, i) => reg.registrar(linha(onda * 100 + i))));
      estado.agora += 1000;
    }
    verdade(estado.gravacoes.length <= 25, `2.000 visitas em 20 ondas viraram ${estado.gravacoes.length} gravações (antes: 2.000 gravações + 2.000 pré-voos)`);
    eq(estado.maxEmVoo, 1, "uma gravação por vez");
    eq(gravadas(estado) + reg.tamanhoDoBuffer(), 2000, "nada se perdeu: gravadas + buffer = 2.000");
  }
}

// ---------------------------------------------------------------- o handler de verdade, com o fetch trocado

function handlerNovo() {
  for (const m of [LIB, RATE, HANDLER]) delete require.cache[require.resolve(m)];
  return require(HANDLER);
}
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
function pedido(corpo, { ip = "198.51.100.7", ua = UA, bruto } = {}) {
  const texto = bruto !== undefined ? bruto : JSON.stringify(corpo);
  return { method: "POST", headers: { "x-forwarded-for": `${ip}, 10.0.0.1`, "User-Agent": ua, "content-type": "application/json" }, body: corpo, rawBody: texto };
}
async function chamar(h, req) {
  const logs = [];
  const contexto = { log: Object.assign(() => {}, { warn: (m) => logs.push(m), error: (m) => logs.push(m), info() {} }), res: undefined };
  await h(contexto, req);
  return { res: contexto.res, logs };
}

async function handler() {
  console.log("== o handler (RegistrarVisita) ==");
  const realFetch = global.fetch;
  const realNow = Date.now;
  const antes = { u: process.env.DIRECTUS_URL, t: process.env.DIRECTUS_ADMIN_TOKEN };
  process.env.DIRECTUS_URL = "https://directus.exemplo.invalid";
  process.env.DIRECTUS_ADMIN_TOKEN = "token-de-teste-nao-e-segredo";
  let relogio = 5_000_000;
  Date.now = () => relogio;
  const chamadas = [];
  let resposta = () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) });
  global.fetch = async (url, opcoes) => { chamadas.push({ url, opcoes }); return resposta(); };
  try {
    let h = handlerNovo();

    let r = await chamar(h, pedido({ path: "/noticias/", referrer_domain: "www.google.com" }));
    eq([r.res.status, r.res.body, r.res.headers["Cache-Control"]], [204, undefined, "no-store"], "visita normal: 204, sem corpo, Cache-Control: no-store");
    eq(chamadas.length, 1, "a primeira visita da instância já grava (um POST)");
    eq(chamadas[0].url, "https://directus.exemplo.invalid/items/pageviews", "o POST vai para /items/pageviews");
    eq(chamadas[0].opcoes.method, "POST", "método POST");
    eq(chamadas[0].opcoes.headers.Authorization, "Bearer token-de-teste-nao-e-segredo", "com o token de administrador");
    eq(JSON.parse(chamadas[0].opcoes.body), [{ path: "/noticias/", referrer_domain: "www.google.com" }], "o corpo é um ARRAY com {path, referrer_domain} (date_created o Directus preenche)");
    verdade(chamadas[0].opcoes.signal && typeof chamadas[0].opcoes.signal.aborted === "boolean", "a gravação tem prazo (AbortSignal): Directus preso não prende a Function");

    for (let i = 1; i <= 24; i++) { relogio += 100; r = await chamar(h, pedido({ path: `/p${i}/`, referrer_domain: null })); }
    eq(chamadas.length, 1, "24 visitas seguidas: nenhuma chamada ao Directus");
    relogio += 100;
    r = await chamar(h, pedido({ path: "/p25/", referrer_domain: null }));
    eq([r.res.status, chamadas.length, JSON.parse(chamadas[1].opcoes.body).length], [204, 2, 25], "a 25ª junta tudo num único POST de 25 linhas");
    eq(JSON.parse(chamadas[1].opcoes.body).every((l) => Object.keys(l).sort().join() === "path,referrer_domain"), true, "cada linha tem só path e referrer_domain");

    // robôs: 204 sem guardar
    const antesRobo = chamadas.length;
    for (let i = 0; i < 30; i++) { relogio += 5; r = await chamar(h, pedido({ path: "/r/", referrer_domain: null }, { ua: i % 2 ? "Googlebot/2.1" : "curl/8.4.0" })); }
    eq([r.res.status, chamadas.length], [204, antesRobo], "robôs: 204 e nada gravado (nem com 30 chamadas)");
    relogio += 10_000;
    await chamar(h, pedido({ path: "/depois-dos-robos/", referrer_domain: null }));
    eq(JSON.parse(chamadas[chamadas.length - 1].opcoes.body).map((l) => l.path), ["/depois-dos-robos/"], "e os robôs não ficaram no buffer");

    // malformados
    const n = chamadas.length;
    r = await chamar(h, pedido({ path: "sem-barra" }));
    eq([r.res.status, r.res.body.erro, r.res.headers["Cache-Control"]], [400, "Caminho inválido.", "no-store"], "caminho inválido: 400 com no-store");
    r = await chamar(h, pedido({ path: "/a?x=1" }));
    eq(r.res.status, 400, "caminho com consulta: 400");
    r = await chamar(h, pedido({ path: "/a", referrer_domain: "https://x.com/" }));
    eq(r.res.status, 400, "origem com URL: 400");
    r = await chamar(h, pedido(null, { bruto: "" }));
    eq(r.res.status, 400, "sem corpo: 400");
    r = await chamar(h, pedido({ path: "/a", lixo: "x".repeat(2000) }));
    eq([r.res.status, r.res.body.erro], [413, "Corpo grande demais."], "corpo acima de 1 KB: 413");
    r = await chamar(h, { method: "POST", headers: { "x-forwarded-for": "198.51.100.7, 10.0.0.1", "user-agent": UA, "content-type": "text/plain" }, body: '{"path":"/texto-puro/","referrer_domain":null}', rawBody: '{"path":"/texto-puro/","referrer_domain":null}' });
    eq(r.res.status, 204, "corpo que chega como texto (text/plain) também é lido");
    eq(chamadas.length, n, "nada disso chegou ao Directus (a visita de texto puro só entrou no buffer)");

    // limite por IP
    h = handlerNovo();
    relogio += 1_000_000;
    let statuses = [];
    for (let i = 0; i < 125; i++) statuses.push((await chamar(h, pedido({ path: "/x/", referrer_domain: null }, { ip: "203.0.113.9" }))).res.status);
    eq([statuses.filter((s) => s === 204).length, statuses.filter((s) => s === 429).length], [120, 5], "120 visitas por IP em 5 min; da 121ª em diante, 429");
    r = await chamar(h, pedido({ path: "/x/", referrer_domain: null }, { ip: "203.0.113.10" }));
    eq(r.res.status, 204, "outro IP não é afetado");
    r = await chamar(h, pedido({ path: "/x/", referrer_domain: null }, { ip: "203.0.113.9" }));
    eq([r.res.status, r.res.headers["Cache-Control"], r.res.body.erro], [429, "no-store", "Muitas visitas em pouco tempo."], "o 429 também vem com no-store");
    relogio += 5 * 60 * 1000 + 1;
    r = await chamar(h, pedido({ path: "/x/", referrer_domain: null }, { ip: "203.0.113.9" }));
    eq(r.res.status, 204, "passados 5 min, o IP volta a poder");
    // a entrada x-forwarded-for com valor inventado à esquerda não burla o limite (o IP é o penúltimo)
    h = handlerNovo();
    statuses = [];
    for (let i = 0; i < 125; i++) statuses.push((await chamar(h, { ...pedido({ path: "/y/", referrer_domain: null }), headers: { "x-forwarded-for": `1.2.3.${i % 250}, 203.0.113.50, 10.0.0.1`, "user-agent": UA } })).res.status);
    eq(statuses.filter((s) => s === 429).length, 5, "primeira entrada do x-forwarded-for inventada: o limite continua valendo (o IP real é o penúltimo)");

    // o Directus falha: a visita NUNCA falha
    h = handlerNovo();
    relogio += 10_000_000;
    chamadas.length = 0;
    resposta = () => ({ ok: false, status: 500, arrayBuffer: async () => new ArrayBuffer(0) });
    r = await chamar(h, pedido({ path: "/falha/", referrer_domain: null }, { ip: "192.0.2.1" }));
    eq([r.res.status, r.res.headers["Cache-Control"]], [204, "no-store"], "Directus responde 500: a visita responde 204 do mesmo jeito");
    eq(r.logs.length, 1, "…e a falha fica no log da Function (um aviso)");
    verdade(!/token-de-teste/.test(r.logs.join(" ")), "o log não carrega o token");
    resposta = () => { throw new Error("rede caiu"); };
    relogio += 10_000;
    r = await chamar(h, pedido({ path: "/falha-2/", referrer_domain: null }, { ip: "192.0.2.2" }));
    eq(r.res.status, 204, "Directus inalcançável (fetch lança): 204");
    resposta = () => ({ ok: true, status: 201, arrayBuffer: async () => new ArrayBuffer(0) });
    relogio += 10_000;
    chamadas.length = 0;
    r = await chamar(h, pedido({ path: "/volta/", referrer_domain: null }, { ip: "192.0.2.3" }));
    eq(JSON.parse(chamadas[0].opcoes.body).map((l) => l.path), ["/falha/", "/falha-2/", "/volta/"], "quando o Directus volta, as visitas das falhas seguem junto (na ordem)");

    // sem configuração do Directus: ignora, sem encher a memória
    h = handlerNovo();
    delete process.env.DIRECTUS_ADMIN_TOKEN;
    chamadas.length = 0;
    relogio += 10_000;
    r = await chamar(h, pedido({ path: "/sem-config/", referrer_domain: null }, { ip: "192.0.2.4" }));
    eq([r.res.status, chamadas.length], [204, 0], "sem token do Directus configurado: 204 e nenhuma chamada");
    process.env.DIRECTUS_ADMIN_TOKEN = "token-de-teste-nao-e-segredo";

    // erro inesperado dentro do handler: ainda 204
    r = await chamar(h, { method: "POST", headers: null, body: { path: "/a", referrer_domain: null } });
    verdade([204, 400, 429].includes(r.res.status), `pedido sem cabeçalhos não derruba o handler (status ${r.res.status})`);
  } finally {
    global.fetch = realFetch;
    Date.now = realNow;
    if (antes.u === undefined) delete process.env.DIRECTUS_URL; else process.env.DIRECTUS_URL = antes.u;
    if (antes.t === undefined) delete process.env.DIRECTUS_ADMIN_TOKEN; else process.env.DIRECTUS_ADMIN_TOKEN = antes.t;
  }

  console.log("== function.json ==");
  const fj = require("../../api/RegistrarVisita/function.json");
  const gatilho = fj.bindings.find((b) => b.type === "httpTrigger");
  eq([gatilho.authLevel, gatilho.methods, gatilho.route], ["anonymous", ["post"], "registrar-visita"], "anônima, só POST, rota registrar-visita");
}

(async () => {
  validacao();
  robos();
  await bufferEDescarga();
  await falhaDoDirectus();
  await teto();
  await rajada();
  await handler();
  console.log(`\n${total - falhas}/${total} verificações ok`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.log("ERRO:", e.stack || e.message); process.exit(1); });
