// Testes de UNIDADE do passo que traz as imagens do Directus para dentro do site (scripts/localizar-imagens.mjs, roda depois do `astro build`):
// achar as URLs em todos os formatos (src, srcset, og:image, url() de CSS, JSON-LD, &amp;), reescrever o HTML, og:image absoluta, falha de download
// mantendo a URL original, resposta que não é imagem, deduplicação, teto de tamanho, concorrência, HTML sem imagem intacto byte a byte e o fluxo
// inteiro (inclusive a linha de comando) contra um servidor HTTP de MENTIRA local. Sem rede de verdade.
// Como rodar (de dentro de site/):  node scripts/testes/imagens-locais-unidade.cjs
// Para provar que o teste pega defeito: LOCALIZAR_IMAGENS_MODULO=<caminho de uma cópia estragada do .mjs> node scripts/testes/imagens-locais-unidade.cjs
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const Module = require("module");
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");
const ts = require("typescript");

let falhas = 0;
let total = 0;
const eq = (a, b, d) => {
  total++;
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { falhas++; console.log("  FALHA", d, "→", JSON.stringify(a), "esperado", JSON.stringify(b)); } else console.log("  ok   ", d);
};
const verdade = (c, d) => eq(!!c, true, d);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const RAIZ_SITE = path.join(__dirname, "../..");
const MODULO = process.env.LOCALIZAR_IMAGENS_MODULO || path.join(RAIZ_SITE, "scripts/localizar-imagens.mjs");

// Os ajudantes REAIS do site (src/lib/directus.ts) geram as URLs dos casos: se um dia mudarem o formato, este teste pega.
function carregarDirectus() {
  const arquivo = path.join(RAIZ_SITE, "src/lib/directus.ts");
  const js = ts.transpileModule(fs.readFileSync(arquivo, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = new Module("directus.js");
  mod.require = (req) => (req === "@/lib/congregacoes" ? {} : require(req));
  mod._compile(js, "directus.js");
  return mod.exports;
}
const D = carregarDirectus();
const HOST = D.DIRECTUS_URL;
const ORIGEM = "https://ieadespa.org.br";

const ID1 = "8fc8e8fa-8fdf-4ff3-8d09-61c3b4eeb927";
const ID2 = "94c36f1a-b847-4596-8a73-23ef7bc666ce";
const ID3 = "11111111-2222-4333-8444-555555555555";
const html = (s) => s.replace(/&/g, "&amp;"); // como o Astro escreve a URL num atributo
const png = (n, byte = 7) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(n, byte)]);

// Resposta de mentira para o baixador: sempre um Response de verdade (cabeçalhos e corpo em fluxo, como o fetch do Node)
const resp = (corpo, tipo = "image/webp", status = 200, extra = {}) =>
  new Response(corpo, { status, headers: tipo ? { "content-type": tipo, ...extra } : { ...extra } });

// O sinal de tempo limite do Node não segura o processo vivo: nos testes de "servidor que não responde" isto impede o Node de sair em silêncio.
const mantemVivo = setInterval(() => {}, 1000);

(async () => {
  const L = await import(pathToFileURL(MODULO).href);

  console.log("== as constantes combinadas ==");
  eq([L.TETO_BYTES, L.CONCORRENCIA, L.TEMPO_LIMITE_MS, L.TENTATIVAS], [120 * 1024 * 1024, 4, 30000, 2], "teto 120 MB, concorrência 4, 30 s, 2 tentativas");
  eq([L.extensaoDoTipo("image/webp"), L.extensaoDoTipo("image/jpeg"), L.extensaoDoTipo("image/png"), L.extensaoDoTipo("image/avif"), L.extensaoDoTipo("image/gif"), L.extensaoDoTipo("IMAGE/WEBP; charset=x")], ["webp", "jpg", "png", "avif", "gif", "webp"], "extensão pelo tipo da resposta");
  eq([L.extensaoDoTipo("image/svg+xml"), L.extensaoDoTipo("text/html"), L.extensaoDoTipo("application/pdf"), L.extensaoDoTipo(""), L.extensaoDoTipo(undefined), L.extensaoDoTipo("image/x-qualquer")], [null, null, null, null, null, null], "SVG, não-imagem e tipo desconhecido não viram arquivo local");

  console.log("== achar as URLs (todos os formatos) ==");
  const u800 = D.directusAssetUrl(ID1, { width: 800, quality: 80, format: "webp" });
  const u1600 = D.directusAssetUrl(ID1, { width: 1600, quality: 80, format: "webp" });
  const uCapa = D.directusAssetUrl(ID2, { width: 400, height: 260, fit: "cover" });
  const uSemQuery = D.directusAssetUrl(ID3);
  const srcset = D.directusAssetSrcset(ID2, D.COVER_WIDTHS, { quality: 80, format: "webp" });
  verdade(u800.startsWith(`${HOST}/assets/${ID1}?`) && u800.includes("&quality=80"), "(as URLs de teste vêm do ajudante real do site)");
  eq(L.extrairUrls(`<img src="${html(u800)}" alt="x">`, HOST), [u800], "src com &amp; escapado volta com & puro");
  eq(L.extrairUrls(`<img src="${u800}">`, HOST), [u800], "src com & cru");
  eq(L.extrairUrls(`<img srcset="${html(srcset)}" sizes="100vw">`, HOST).length, 3, "srcset com 3 candidatos acha os 3");
  eq(L.extrairUrls(`<img srcset="${html(srcset)}">`, HOST), srcset.split(", ").map((c) => c.split(" ")[0]), "srcset: cada candidato sem o descritor 640w");
  eq(L.extrairUrls(`<meta property="og:image" content="${html(u1600)}"><meta name="twitter:image" content="${html(u1600)}">`, HOST), [u1600, u1600], "og:image e twitter:image");
  eq(L.extrairUrls(`<style>.a{background:url(${html(uCapa)})}</style>`, HOST), [uCapa], "url() de CSS sem aspas, em <style>");
  eq(L.extrairUrls(`<style>.a{background:url('${uCapa}');color:red}</style>`, HOST), [uCapa], "url('...') de CSS com aspas simples");
  eq(L.extrairUrls(`<style>.a{background:url("${uCapa}")}</style>`, HOST), [uCapa], 'url("...") de CSS com aspas duplas');
  eq(L.extrairUrls(`<div style="background-image:url(&quot;${html(uCapa)}&quot;)"></div>`, HOST), [uCapa], "url() num atributo style, fechado por &quot; (a entidade não entra na URL)");
  eq(L.extrairUrls(`<div style="background-image:url(&#39;${html(uCapa)}&#39;)"></div>`, HOST), [uCapa], "url() num atributo style, fechado por &#39;");
  eq(L.extrairUrls(`<script type="application/ld+json">{"image":"${u1600}","logo":"${uSemQuery}"}</script>`, HOST), [u1600, uSemQuery], "JSON-LD embutido (& cru e sem query)");
  eq(L.extrairUrls(`<script>var u="${u800.replace(/&/g, "\\u0026")}";</script>`, HOST), [u800], "string de script com \\u0026");
  eq(L.extrairUrls(`<img src=${u800}>`, HOST), [u800], "atributo sem aspas");
  eq(L.extrairUrls(`<a href="${uSemQuery}">pdf</a>`, HOST), [uSemQuery], "sem query (o PDF também aparece; quem decide é o tipo da resposta)");
  eq(L.extrairUrls(`<img src="${HOST}/assets/${ID1.toUpperCase()}?width=10">`, HOST), [`${HOST}/assets/${ID1.toUpperCase()}?width=10`], "UUID em maiúsculas");
  eq(L.extrairUrls(`<img src="${HOST}/assets/${ID1}/capa.jpg?download">`, HOST), [`${HOST}/assets/${ID1}/capa.jpg?download`], "forma /assets/<id>/<nome>");
  eq(L.extrairUrls(`<img src="${HOST}/assets/${ID1}?">`, HOST), [`${HOST}/assets/${ID1}?`], "'?' vazio");
  eq(L.extrairUrls(`<p>${u800}</p> <p>${uCapa}</p>`, HOST), [u800, uCapa], "duas no mesmo texto, separadas por tag");
  eq(L.extrairUrls(`a ${u800}, b ${uCapa}`, HOST), [u800, uCapa], "duas separadas por vírgula e espaço");
  eq(L.extrairUrls(`<img src="https://outro.example.com/assets/${ID1}?width=1"><img src="${HOST}/items/x/${ID1}"><img src="${HOST}/assets/sem-uuid"><img src="${HOST}/assets/\${id}?width=1"><img src="${HOST}/assets/${ID1}x">`, HOST), [], "outro domínio, outro caminho, sem UUID, modelo de texto e id comprido NÃO são pegos");
  eq(L.extrairUrls("<html><body><h1>Sem imagem nenhuma</h1><img src=\"/logo.png\"></body></html>", HOST), [], "página sem imagem do Directus");
  eq(L.normalizarUrl("a?x=1&amp;y=2&#38;z=3&#x26;w=4\\u0026v=5"), "a?x=1&y=2&z=3&w=4&v=5", "normalização do &");

  console.log("== reescrever o HTML ==");
  const mapa = new Map([[u800, "/media/aaa.webp"], [u1600, "/media/bbb.webp"], [uCapa, "/media/ccc.png"]]);
  const R = (h, m = mapa, origem = ORIGEM) => L.reescreverHtml(h, { directusUrl: HOST, origem, mapa: m });
  eq(R(`<img src="${html(u800)}" alt="x">`).html, `<img src="/media/aaa.webp" alt="x">`, "src vira caminho relativo /media/...");
  const comSrcset = `<img src="${html(uCapa)}" srcset="${html(srcset)}">`;
  const m3 = new Map([[uCapa, "/media/ccc.png"], ...srcset.split(", ").map((c, i) => [c.split(" ")[0], `/media/s${i}.webp`])]);
  eq(R(comSrcset, m3).html, `<img src="/media/ccc.png" srcset="/media/s0.webp 640w, /media/s1.webp 1024w, /media/s2.webp 1600w">`, "srcset: cada candidato trocado e os descritores (640w...) preservados");
  const metas = `<meta property="og:image" content="${html(u1600)}"><meta name="twitter:image" content="${html(u1600)}"><meta property="og:image:secure_url" content="${html(u1600)}">`;
  eq(R(metas).html, `<meta property="og:image" content="${ORIGEM}/media/bbb.webp"><meta name="twitter:image" content="${ORIGEM}/media/bbb.webp"><meta property="og:image:secure_url" content="${ORIGEM}/media/bbb.webp">`, "og:image, twitter:image e og:image:secure_url viram URL ABSOLUTA com a origem do site");
  eq(R(`<meta content="${html(u1600)}" property="og:image" />`).html, `<meta content="${ORIGEM}/media/bbb.webp" property="og:image" />`, "og:image com o content ANTES do property");
  eq(R(metas, mapa, `${ORIGEM}/`).html.includes(`${ORIGEM}/media/bbb.webp`) && !R(metas, mapa, `${ORIGEM}/`).html.includes("//media"), true, "origem com barra no fim não duplica a barra");
  eq(R(`<meta property="og:description" content="veja ${html(u1600)}">`).html, `<meta property="og:description" content="veja /media/bbb.webp">`, "outra meta (não é imagem) fica relativa");
  eq(R(`<style>.a{background:url(${html(uCapa)})}</style>`).html, `<style>.a{background:url(/media/ccc.png)}</style>`, "url() de CSS inline, relativo");
  eq(R(`<div style="background-image:url(&quot;${html(uCapa)}&quot;)"></div>`).html, `<div style="background-image:url(&quot;/media/ccc.png&quot;)"></div>`, "url() num style: o &quot; que fecha continua lá");
  eq(R(`<script type="application/ld+json">{"image":"${u1600}","x":"y"}</script><img src="${u800}">`).html, `<script type="application/ld+json">{"image":"${ORIGEM}/media/bbb.webp","x":"y"}</script><img src="/media/aaa.webp">`, "JSON-LD fica absoluto e a <img> da mesma página relativa");
  eq(R(`<script>var u="${u800.replace(/&/g, "\\u0026")}";</script>`).html, `<script>var u="/media/aaa.webp";</script>`, "string de script com \\u0026 trocada inteira");
  eq(R(`<img src="${html(u800)}"><img src="${html(u800)}">`).trocas, 2, "a mesma URL duas vezes: duas trocas, um arquivo só");
  const original = `<img src="${html(uCapa)}"><img src="${html(u800)}">`;
  eq(R(original, new Map([[u800, "/media/aaa.webp"]])).html, `<img src="${html(uCapa)}"><img src="/media/aaa.webp">`, "URL fora do mapa (download falhou) fica EXATAMENTE como estava, com o &amp; original");
  eq(R(`<meta property="og:image" content="${html(u1600)}">`, new Map()).html, `<meta property="og:image" content="${html(u1600)}">`, "og:image sem arquivo local fica com a URL do Directus");
  const semImagem = `<!doctype html>\r\n<html lang="pt-BR"><head><meta property="og:image" content="${ORIGEM}/og-image.png"><meta charset="utf-8"></head><body>Missão — ação &amp; fé <img src="/logo.png" srcset="/a.png 1x, /b.png 2x"></body></html>\r\n`;
  eq(R(semImagem).html === semImagem && R(semImagem).trocas === 0, true, "HTML sem imagem do Directus volta idêntico (inclusive CRLF e acentos)");
  eq(R(`<a href="${uSemQuery}">relatório</a>`, new Map()).html, `<a href="${uSemQuery}">relatório</a>`, "link para PDF (sem arquivo local) intacto");

  console.log("== baixar UMA imagem ==");
  const sem = { esperaMs: 0, dormir: async () => {} };
  let chamadas = 0;
  const contar = (fn) => async (...a) => { chamadas++; return fn(...a, chamadas); };
  let r = await L.baixarImagem("http://x/a", { ...sem, fetchFn: contar(() => resp(png(50), "image/webp")) });
  eq([r.ok, r.ext, r.tipo, r.buffer.length], [true, "webp", "image/webp", 58], "imagem webp baixada");
  r = await L.baixarImagem("http://x/a", { ...sem, fetchFn: async () => resp(png(5), "image/jpeg; charset=binary") });
  eq([r.ok, r.ext], [true, "jpg"], "tipo com parâmetros (image/jpeg; charset=...) vale e vira .jpg");
  chamadas = 0;
  r = await L.baixarImagem("http://x/a", { ...sem, fetchFn: contar(() => resp("<html>erro</html>", "text/html")) });
  eq([r.ok, chamadas, /não é imagem/.test(r.motivo)], [false, 1, true], "resposta 200 que é HTML: não é imagem, sem nova tentativa");
  r = await L.baixarImagem("http://x/a", { ...sem, fetchFn: async () => resp("%PDF-1.7", "application/pdf") });
  eq([r.ok, /não é imagem/.test(r.motivo)], [false, true], "PDF: não é imagem");
  r = await L.baixarImagem("http://x/a", { ...sem, fetchFn: async () => resp("{}", "application/json") });
  eq(r.ok, false, "JSON: não é imagem");
  r = await L.baixarImagem("http://x/a", { ...sem, fetchFn: async () => resp("<svg onload='x()'/>", "image/svg+xml") });
  eq([r.ok, /não trazido/.test(r.motivo)], [false, true], "SVG não vem para o nosso domínio");
  r = await L.baixarImagem("http://x/a", { ...sem, fetchFn: async () => resp(png(5), null) });
  eq(r.ok, false, "sem tipo nenhum na resposta: não vale");
  chamadas = 0;
  r = await L.baixarImagem("http://x/a", { ...sem, fetchFn: contar(() => resp("nada", "application/json", 404)) });
  eq([r.ok, r.motivo, chamadas], [false, "HTTP 404", 1], "404: falha sem repetir");
  chamadas = 0;
  r = await L.baixarImagem("http://x/a", { ...sem, fetchFn: contar((_a, _b, n) => (n === 1 ? resp("x", "text/plain", 503) : resp(png(9))) ) });
  eq([r.ok, chamadas], [true, 2], "503 na primeira: a segunda tentativa traz a imagem");
  chamadas = 0;
  r = await L.baixarImagem("http://x/a", { ...sem, fetchFn: contar(() => resp("x", "text/plain", 500)) });
  eq([r.ok, r.motivo, chamadas], [false, "HTTP 500", 2], "500 sempre: exatamente 2 tentativas");
  chamadas = 0;
  r = await L.baixarImagem("http://x/a", { ...sem, fetchFn: contar((_a, _b, n) => { if (n === 1) throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }); return resp(png(9)); }) });
  eq([r.ok, chamadas], [true, 2], "erro de rede na primeira: a segunda tentativa traz a imagem");
  chamadas = 0;
  r = await L.baixarImagem("http://x/a", { ...sem, fetchFn: contar(() => { throw new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } }); }) });
  eq([r.ok, r.motivo, chamadas], [false, "erro de rede (ENOTFOUND)", 2], "rede fora do ar: falha com o motivo, 2 tentativas, não lança");
  chamadas = 0;
  const t0 = Date.now();
  r = await L.baixarImagem("http://x/a", { ...sem, tempoMs: 80, fetchFn: contar((_u, opc) => new Promise((_ok, erro) => opc.signal.addEventListener("abort", () => erro(opc.signal.reason)))) });
  eq([r.ok, r.motivo, chamadas], [false, "tempo esgotado", 2], "servidor que não responde: tempo esgotado, 2 tentativas");
  verdade(Date.now() - t0 < 2000, "(o tempo limite do teste foi respeitado)");
  r = await L.baixarImagem("http://x/a", { ...sem, tempoMs: 80, fetchFn: async (_u, opc) => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(10)); opc.signal.addEventListener("abort", () => c.error(opc.signal.reason)); } }), { headers: { "content-type": "image/png" } }) });
  eq([r.ok, r.motivo], [false, "tempo esgotado"], "corpo que trava no meio também respeita o tempo limite");
  let sinal;
  await L.baixarImagem("http://x/a", { ...sem, fetchFn: async (_u, opc) => { sinal = opc.signal; return resp(png(2)); } });
  verdade(sinal instanceof AbortSignal, "o download leva um sinal de tempo limite");
  r = await L.baixarImagem("http://x/a", { ...sem, maxBytes: 100, fetchFn: async () => resp(png(500), "image/png", 200, { "content-length": "508" }) });
  eq([r.ok, r.teto], [false, true], "content-length maior que o que cabe: recusa sem ler o corpo");
  r = await L.baixarImagem("http://x/a", { ...sem, maxBytes: 100, fetchFn: async () => resp(png(500)) });
  eq([r.ok, r.teto], [false, true], "sem content-length: desiste ao passar do que cabe");
  r = await L.baixarImagem("http://x/a", { ...sem, fetchFn: async () => resp(new Uint8Array(0)) });
  eq([r.ok, r.motivo], [false, "resposta vazia"], "corpo vazio não vira arquivo");
  r = await L.baixarImagem("http://x/a", { ...sem, fetchFn: () => { throw new Error("quebrou na hora"); } });
  eq(r.ok, false, "fetch que lança direto não derruba (devolve falha)");

  console.log("== baixar tudo: deduplicação, falhas, teto, concorrência ==");
  const gravados = new Map();
  const gravar = async (nome, buf) => { gravados.set(nome, buf); };
  const hash = (b) => crypto.createHash("sha256").update(b).digest("hex").slice(0, 32);
  let pedidas = [];
  const baixaFalsa = (tabela) => async (url, o) => { pedidas.push(url); const x = tabela[url]; if (typeof x === "function") return x(o); return x || { ok: false, motivo: "HTTP 404" }; };
  const imgA = png(100, 1);
  const imgB = png(200, 2);
  const ok = (buffer, ext = "webp") => ({ ok: true, buffer, ext });
  let f = await L.localizarImagens([u800, u800, uCapa, u800, uCapa, u1600], { baixar: baixaFalsa({ [u800]: ok(imgA), [uCapa]: ok(imgB, "png"), [u1600]: ok(imgA) }), gravar });
  eq(pedidas.length, 3, "a mesma URL em várias páginas é baixada UMA vez");
  eq([...new Set(pedidas)].length, pedidas.length, "(nenhuma URL pedida duas vezes)");
  eq(f.mapa.get(u800), `/media/${hash(imgA)}.webp`, "o nome do arquivo é o hash do conteúdo + extensão do tipo");
  eq(f.mapa.get(uCapa), `/media/${hash(imgB)}.png`, "outra imagem, outro nome e a extensão png");
  eq(f.mapa.get(u1600), f.mapa.get(u800), "duas URLs que devolvem os MESMOS bytes viram um arquivo só");
  eq([f.arquivos, gravados.size, f.bytes, f.distintas], [2, 2, imgA.length + imgB.length, 3], "2 arquivos gravados, bytes contados uma vez por arquivo");
  eq(gravados.get(`${hash(imgA)}.webp`).equals(imgA), true, "o arquivo gravado tem exatamente os bytes baixados");
  gravados.clear(); pedidas = [];
  f = await L.localizarImagens([u800, uCapa, u1600, uSemQuery], { baixar: baixaFalsa({ [u800]: ok(imgA), [uCapa]: { ok: false, motivo: "HTTP 500" }, [u1600]: { ok: false, motivo: "a resposta não é imagem (text/html)" }, [uSemQuery]: () => { throw new Error("explodiu"); } }), gravar });
  eq([f.mapa.has(u800), f.mapa.has(uCapa), f.mapa.has(u1600), f.mapa.has(uSemQuery)], [true, false, false, false], "só a que deu certo entra no mapa; falha, não-imagem e exceção ficam de fora");
  eq(f.falhas.map((x) => x.url).sort(), [uCapa, u1600, uSemQuery].sort(), "as 3 falhas são listadas com a URL");
  eq(f.falhas.find((x) => x.url === u1600).motivo, "a resposta não é imagem (text/html)", "e com o motivo");
  gravados.clear();
  f = await L.localizarImagens([u800, uCapa], { baixar: baixaFalsa({ [u800]: ok(imgA), [uCapa]: ok(imgB) }), gravar: async (n, b) => { if (b === imgA) throw Object.assign(new Error("disco"), { code: "ENOSPC" }); gravados.set(n, b); } });
  eq([f.mapa.has(u800), f.mapa.has(uCapa), f.falhas.length, f.falhas[0]?.motivo], [false, true, 1, "não consegui gravar (ENOSPC)"], "disco cheio na gravação: aquela URL fica no Directus e o resto segue");
  // teto
  gravados.clear(); pedidas = [];
  const quarenta = (n) => Buffer.alloc(40, n);
  const urlsTeto = [1, 2, 3, 4, 5].map((n) => `${HOST}/assets/${ID1}?width=${n}00`);
  f = await L.localizarImagens(urlsTeto, { teto: 100, baixar: async (url, o) => { pedidas.push(url); const n = Number(url.match(/width=(\d)/)[1]); if (40 > o.maxBytes) return { ok: false, motivo: "não cabe no teto de tamanho", teto: true }; return ok(quarenta(n)); }, gravar, concorrencia: 1 });
  eq([f.arquivos, f.bytes, f.foraDoTeto.length, f.mapa.size], [2, 80, 3, 2], "teto de 100 bytes com arquivos de 40: 2 entram, as outras 3 ficam fora");
  verdade(f.bytes <= 100, "(o total gravado nunca passa do teto)");
  eq(pedidas.length, 3, "passou do teto, não baixa mais nada (a 4ª e a 5ª nem foram pedidas)");
  gravados.clear();
  f = await L.localizarImagens(urlsTeto, { teto: 100, baixar: async (url) => ok(quarenta(Number(url.match(/width=(\d)/)[1]))), gravar, concorrencia: 4 });
  verdade(f.bytes <= 100 && f.arquivos === 2 && f.foraDoTeto.length === 3, "mesmo com 4 downloads ao mesmo tempo o total gravado não passa do teto");
  eq(gravados.size, 2, "(e só 2 arquivos foram gravados de verdade)");
  gravados.clear();
  f = await L.localizarImagens([u800, uCapa], { teto: 100, baixar: baixaFalsa({ [u800]: ok(quarenta(1)), [uCapa]: ok(quarenta(1)) }), gravar, concorrencia: 1 });
  eq([f.arquivos, f.bytes], [1, 40], "o mesmo conteúdo duas vezes conta UMA vez no teto");
  // concorrência
  let agora = 0;
  let maximo = 0;
  const muitas = Array.from({ length: 12 }, (_, i) => `${HOST}/assets/${ID1}?width=${i + 1}`);
  gravados.clear();
  f = await L.localizarImagens(muitas, { baixar: async (url) => { agora++; maximo = Math.max(maximo, agora); await dormir(20); agora--; return ok(Buffer.from(url)); }, gravar });
  eq([maximo, f.arquivos], [4, 12], "12 downloads: no máximo 4 ao mesmo tempo (e os 12 acontecem)");
  agora = 0; maximo = 0;
  await L.localizarImagens(muitas.slice(0, 2), { baixar: async (url) => { agora++; maximo = Math.max(maximo, agora); await dormir(20); agora--; return ok(Buffer.from(url)); }, gravar });
  eq(maximo, 2, "com 2 URLs só 2 trabalhadores");
  eq((await L.localizarImagens([], { baixar: async () => ok(imgA), gravar })).arquivos, 0, "lista vazia não quebra");

  console.log("== o fluxo inteiro numa pasta dist de mentira (sem rede) ==");
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "imagens-locais-"));
  const novaPasta = (nome) => { const p = path.join(base, nome); fs.mkdirSync(p, { recursive: true }); return p; };
  const escrever = (dist, rel, conteudo) => { const p = path.join(dist, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, conteudo); return p; };
  const dist = novaPasta("dist");
  const pgSrcset = escrever(dist, "noticia/index.html", Buffer.from(`<!doctype html>\r\n<html><body><img src="${html(uCapa)}" srcset="${html(srcset)}" alt="Missão">\r\n</body></html>\r\n`));
  const pgOg = escrever(dist, "camiseta/marcha/index.html", Buffer.from(`<html><head><meta property="og:image" content="${html(u1600)}"><meta name="twitter:image" content="${html(u1600)}"><script type="application/ld+json">{"image":"${u1600}"}</script></head><body><img src="${html(u800)}"><img src="${html(u800)}"></body></html>`));
  const conteudoSem = Buffer.concat([Buffer.from("<!doctype html>\r\n<html><body>Sem imagem — ação, fé, esperança ", "utf8"), Buffer.from([0xff, 0xfe, 0x80]), Buffer.from(" fim</body></html>\r\n", "utf8")]);
  const pgSem = escrever(dist, "sobre/index.html", conteudoSem);
  const pgOutroTipo = escrever(dist, "transparencia/index.html", Buffer.from(`<a href="${uSemQuery}">PDF</a> <img src="${html(uCapa)}">`));
  const arquivoQueNaoEHtml = escrever(dist, "rss.xml", Buffer.from(`<rss>${u800}</rss>`));
  const antesSem = fs.readFileSync(pgSem);
  const idsPedidos = [];
  const baixa = async (url) => {
    idsPedidos.push(url);
    if (url === u800) return ok(imgA);
    if (url === u1600) return ok(imgB);
    if (url === uSemQuery) return { ok: false, motivo: "a resposta não é imagem (application/pdf)" };
    if (url === uCapa) return { ok: false, motivo: "HTTP 500" };
    if (url.includes("width=640")) return ok(png(10, 5));
    if (url.includes("width=1024")) return ok(png(20, 6));
    return { ok: false, motivo: "HTTP 404" };
  };
  const linhas = [];
  const resumo = await L.executar({ dist, directusUrl: HOST, origem: ORIGEM, baixar: baixa, log: (m) => linhas.push(m) });
  eq(resumo.erro, null, "sem erro");
  eq([resumo.paginas, resumo.paginasAlteradas, resumo.distintas], [4, 2, 7], "4 páginas, 2 alteradas, 7 URLs distintas (a capa e o PDF falham)");
  eq(idsPedidos.length, 7, "cada URL distinta baixada uma vez, mesmo repetida em várias páginas");
  eq(fs.readFileSync(pgSem).equals(antesSem), true, "página sem imagem: BYTE A BYTE igual (CRLF, acentos e até bytes que não são UTF-8)");
  const textoOg = fs.readFileSync(pgOg, "utf8");
  const nomeA = `${hash(imgA)}.webp`;
  const nomeB = `${hash(imgB)}.webp`;
  verdade(textoOg.includes(`<meta property="og:image" content="${ORIGEM}/media/${nomeB}">`) && textoOg.includes(`<meta name="twitter:image" content="${ORIGEM}/media/${nomeB}">`), "og:image e twitter:image absolutas na página de campanha");
  verdade(textoOg.includes(`{"image":"${ORIGEM}/media/${nomeB}"}`), "JSON-LD absoluto");
  eq(textoOg.split(`<img src="/media/${nomeA}">`).length - 1, 2, "as duas <img> iguais apontam para o mesmo arquivo local relativo");
  verdade(!textoOg.includes("azurewebsites"), "nenhuma URL do Directus sobrou na página de campanha");
  const textoNoticia = fs.readFileSync(pgSrcset, "utf8");
  verdade(textoNoticia.includes("Missão"), "(acentos do HTML preservados)");
  verdade(textoNoticia.includes(`src="${html(uCapa)}"`), "a <img src> cujo download falhou continua com a URL original do Directus (com &amp;)");
  const candidatos = /srcset="([^"]*)"/.exec(textoNoticia)[1].split(", ");
  verdade(candidatos[0].startsWith("/media/") && candidatos[1].startsWith("/media/") && candidatos[2].startsWith(HOST) && candidatos[2].endsWith(" 1600w"), "srcset: 640 e 1024 locais; o 1600 (falhou) fica no Directus e mantém o descritor");
  const textoOutro = fs.readFileSync(pgOutroTipo, "utf8");
  verdade(textoOutro.includes(`href="${uSemQuery}"`) && textoOutro.includes(`src="${html(uCapa)}"`), "PDF e imagem com falha continuam no Directus");
  eq(fs.readFileSync(arquivoQueNaoEHtml, "utf8"), `<rss>${u800}</rss>`, "só .html é reescrito (rss.xml não)");
  const media = fs.readdirSync(path.join(dist, "media")).sort();
  eq(media.length, 4, "4 arquivos em dist/media (A, B e os 2 do srcset)");
  verdade(media.includes(nomeA) && media.includes(nomeB), "com o nome pelo hash do conteúdo");
  eq(fs.readFileSync(path.join(dist, "media", nomeA)).equals(imgA), true, "conteúdo do arquivo local = bytes baixados");
  eq(resumo.falhas.map((x) => x.motivo).sort(), ["HTTP 404", "HTTP 500", "a resposta não é imagem (application/pdf)"], "os motivos das falhas ficam no resumo");
  eq(resumo.falhas.length, 3,"3 falhas: a capa (500), o 1600 do srcset (404) e o PDF (não é imagem)");
  verdade(linhas.some((l) => /4 arquivo\(s\)/.test(l) && /3 falha\(s\)/.test(l)), "o resumo diz quantos arquivos, MB e falhas");
  verdade(linhas.some((l) => /AVISO: ficou no Directus \(HTTP 500\)/.test(l)), "e lista cada falha");
  // idempotente
  const antesTudo = [pgSrcset, pgOg, pgSem, pgOutroTipo].map((p) => fs.readFileSync(p));
  const pedidasAntes = idsPedidos.length;
  const resumo2 = await L.executar({ dist, directusUrl: HOST, origem: ORIGEM, baixar: async (u) => { idsPedidos.push(u); return { ok: false, motivo: "HTTP 404" }; }, log: () => {} });
  eq([resumo2.erro, resumo2.paginasAlteradas, resumo2.distintas], [null, 0, 3], "segunda rodada: sem erro, nada alterado, só as 3 URLs que sobraram");
  const depois = [pgSrcset, pgOg, pgSem, pgOutroTipo].map((p) => fs.readFileSync(p));
  eq(depois.map((b, i) => b.equals(antesTudo[i])), [true, true, true, true], "rodar de novo não muda nada que já está feito (o que falhou tenta de novo e segue falhando)");
  verdade(idsPedidos.length - pedidasAntes === 3, "a segunda rodada só tenta de novo as 3 URLs que ainda estão no Directus");

  console.log("== o passo nunca derruba a montagem ==");
  const semNada = novaPasta("dist-sem-imagem");
  escrever(semNada, "index.html", "<html><body>oi</body></html>");
  const linhas2 = [];
  const resumo3 = await L.executar({ dist: semNada, directusUrl: HOST, origem: ORIGEM, baixar: async () => { throw new Error("não devia baixar"); }, log: (m) => linhas2.push(m) });
  eq([resumo3.erro, resumo3.distintas, fs.existsSync(path.join(semNada, "media"))], [null, 0, false], "sem nenhuma imagem do Directus: nada a fazer e nem cria a pasta media");
  verdade(linhas2.length === 1 && /nada a fazer/.test(linhas2[0]), "e diz isso em uma linha");
  const r1 = await L.executar({ dist: path.join(base, "nao-existe"), directusUrl: HOST, origem: ORIGEM, log: () => {} });
  verdade(r1.erro, "dist que não existe: avisa, não lança");
  const r2 = await L.executar({ dist: semNada, directusUrl: null, origem: ORIGEM, log: () => {} });
  verdade(r2.erro, "sem o endereço do Directus: avisa, não lança");
  const todasFalham = novaPasta("dist-tudo-falha");
  const pgF = escrever(todasFalham, "a/index.html", `<img src="${html(u800)}"><meta property="og:image" content="${html(u800)}">`);
  const antesF = fs.readFileSync(pgF);
  const r3 = await L.executar({ dist: todasFalham, directusUrl: HOST, origem: ORIGEM, baixar: async () => { throw new Error("explodiu"); }, log: () => {} });
  eq([r3.erro, r3.falhas.length, r3.arquivos, r3.paginasAlteradas, fs.readFileSync(pgF).equals(antesF)], [null, 1, 0, 0, true], "todos os downloads falham: nenhuma página muda, sem erro");
  const dTeto = novaPasta("dist-teto");
  escrever(dTeto, "a/index.html", `<img src="${html(u800)}"><img src="${html(uCapa)}">`);
  const linhasTeto = [];
  const r4 = await L.executar({ dist: dTeto, directusUrl: HOST, origem: ORIGEM, teto: 150, baixar: async (u, o) => (o.maxBytes < imgA.length ? { ok: false, motivo: "não cabe no teto de tamanho", teto: true } : ok(u === u800 ? imgA : imgB)), log: (m) => linhasTeto.push(m) });
  eq([r4.arquivos, r4.foraDoTeto.length], [1, 1], "teto no fluxo inteiro: 1 arquivo, 1 fora");
  verdade(linhasTeto.some((l) => /teto de .* atingido/.test(l)), "e o resumo AVISA do teto");
  verdade(fs.readFileSync(path.join(dTeto, "a/index.html"), "utf8").includes(html(uCapa)), "o que ficou fora do teto continua com a URL do Directus");

  console.log("== a configuração lida do código do site ==");
  const cfg = await L.lerConfiguracao(RAIZ_SITE);
  eq(cfg.directusUrl, HOST, "o endereço do Directus lido é o mesmo que o site exporta (DIRECTUS_URL)");
  verdade(/^https:\/\/[^/]+$/.test(cfg.origem || ""), "a origem do site (siteUrl) lida é https sem barra no fim");
  const astroCfg = fs.readFileSync(path.join(RAIZ_SITE, "astro.config.mjs"), "utf8");
  verdade(astroCfg.includes("site: siteConfig.siteUrl"), "(o astro.config.mjs usa o mesmo siteUrl para o canonical)");
  const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ_SITE, "package.json"), "utf8"));
  eq(pkg.scripts.build, "astro build && node scripts/localizar-imagens.mjs", "o `npm run build` (usado pelo CI) roda o passo depois do astro build");
  const swa = JSON.parse(fs.readFileSync(path.join(RAIZ_SITE, "public/staticwebapp.config.json"), "utf8"));
  const rotaMedia = swa.routes.find((x) => x.route === "/media/*");
  eq(rotaMedia && rotaMedia.headers["Cache-Control"], "public, max-age=31536000, immutable", "/media/* com cache de 1 ano e immutable");
  const csp = swa.globalHeaders["Content-Security-Policy"];
  verdade(/img-src 'self'/.test(csp), "a CSP aceita imagem do próprio domínio (img-src 'self')");
  verdade(/default-src 'self'/.test(csp) && !/img-src[^;]*(\s\*|\shttps:(\s|;)|\shttp:(\s|;))/.test(csp), "a CSP segue fechada (sem curinga solto nem 'https:' inteiro em img-src)");

  console.log("== a linha de comando contra um servidor HTTP de mentira ==");
  const imgServ = png(3000, 9);
  const servidor = http.createServer((req, res) => {
    const id = req.url.split("?")[0].split("/")[2];
    if (id === ID1) { res.writeHead(200, { "content-type": "image/webp" }); res.end(imgServ); }
    else if (id === ID2) { res.writeHead(200, { "content-type": "text/html" }); res.end("<html>Directus caiu</html>"); }
    else if (id === ID3) { res.writeHead(200, { "content-type": "application/pdf" }); res.end("%PDF-1.4"); }
    else { res.writeHead(404, { "content-type": "application/json" }); res.end("{}"); }
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const falso = `http://127.0.0.1:${servidor.address().port}`;
  const dCli = novaPasta("dist-cli");
  const a1 = `${falso}/assets/${ID1}?width=800&quality=80&format=webp`;
  const a2 = `${falso}/assets/${ID2}?width=800`;
  const a3 = `${falso}/assets/${ID3}`;
  const a4 = `${falso}/assets/${"0".repeat(8)}-0000-4000-8000-000000000000?width=1`;
  const pgCli = escrever(dCli, "camiseta/x/index.html", `<meta property="og:image" content="${html(a1)}"><img src="${html(a1)}" srcset="${html(a1)} 800w"><img src="${html(a2)}"><a href="${a3}">pdf</a><img src="${html(a4)}">`);
  const saida = await new Promise((resolve) => {
    const p = spawn(process.execPath, [MODULO, `--dist=${dCli}`, `--directus=${falso}`, `--origem=${ORIGEM}`], { cwd: base });
    let txt = "";
    p.stdout.on("data", (d) => (txt += d));
    p.stderr.on("data", (d) => (txt += d));
    p.on("close", (codigo) => resolve({ codigo, txt }));
  });
  servidor.close();
  eq(saida.codigo, 0, "a linha de comando termina com código 0 mesmo com falhas");
  verdade(/Imagens locais: 1 arquivo\(s\)/.test(saida.txt) && /3 falha\(s\)/.test(saida.txt), "e imprime o resumo");
  const nomeServ = `${hash(imgServ)}.webp`;
  const textoCli = fs.readFileSync(pgCli, "utf8");
  verdade(textoCli.includes(`<meta property="og:image" content="${ORIGEM}/media/${nomeServ}">`), "og:image absoluta pela linha de comando");
  verdade(textoCli.includes(`<img src="/media/${nomeServ}" srcset="/media/${nomeServ} 800w">`), "src e srcset relativos pela linha de comando");
  verdade(textoCli.includes(`src="${html(a2)}"`) && textoCli.includes(`href="${a3}"`) && textoCli.includes(`src="${html(a4)}"`), "HTML de erro, PDF e 404 ficam com a URL original");
  eq(fs.readFileSync(path.join(dCli, "media", nomeServ)).equals(imgServ), true, "arquivo igual ao que o servidor mandou");
  const saida2 = await new Promise((resolve) => {
    const p = spawn(process.execPath, [MODULO, `--dist=${path.join(base, "nao-existe")}`, `--directus=${falso}`, `--origem=${ORIGEM}`], { cwd: base });
    let txt = "";
    p.stdout.on("data", (d) => (txt += d));
    p.stderr.on("data", (d) => (txt += d));
    p.on("close", (codigo) => resolve({ codigo, txt }));
  });
  eq(saida2.codigo, 0, "pasta dist inexistente: código 0 e um aviso");
  verdade(/AVISO/.test(saida2.txt), "(o aviso aparece)");
  verdade(!/token|secret|senha|password/i.test(saida.txt + saida2.txt), "o resumo não imprime nada que pareça segredo");

  clearInterval(mantemVivo);
  fs.rmSync(base, { recursive: true, force: true });
  console.log(`\n${total - falhas}/${total} verificações ok`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.log("ERRO:", e.stack || e.message); process.exit(1); });
