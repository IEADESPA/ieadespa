// Testes de UNIDADE da imagem do evento (09/11/2026), sem rede: a conferência do arquivo antes do envio (src/lib/imagemEvento.ts) e as costuras
// que fazem a imagem chegar à prévia do link no WhatsApp — a aba "Imagem" do painel grava SÓ o campo `cover`, o "Salvar evento" nunca manda `cover`
// (um não apaga o outro), a página do evento passa a imagem para o `og:image` e a página da camiseta vinculada dá prioridade à imagem do evento.
// Como rodar (de dentro de site/):  node scripts/testes/imagem-evento-unidade.cjs
const fs = require("fs");
const path = require("path");
const { carregarTs } = require("./carregar-ts.cjs");

let falhas = 0;
let total = 0;
const eq = (a, b, d) => {
  total += 1;
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { falhas++; console.log("  FALHA", d, "→", JSON.stringify(a), "esperado", JSON.stringify(b)); } else console.log("  ok   ", d);
};
const verdade = (c, d) => eq(!!c, true, d);
async function tentar(nome, fn) {
  try { await fn(); } catch (e) { falhas++; total++; console.log("  FALHA", nome, "→ o bloco quebrou:", e && e.message); }
}
const ler = (rel) => fs.readFileSync(path.join(__dirname, "../../src", rel), "utf8");

(async () => {
  await tentar("a conferência do arquivo", async () => {
    console.log("== a conferência do arquivo ==");
    const I = await carregarTs("imagemEvento");
    const MB = 1024 * 1024;
    eq(I.problemaDaImagem(null), "Escolha um arquivo primeiro.", "sem arquivo: pede para escolher");
    eq(I.problemaDaImagem(undefined), "Escolha um arquivo primeiro.", "sem arquivo (undefined): pede para escolher");
    for (const tipo of ["image/jpeg", "image/png", "image/webp", "IMAGE/JPEG"]) eq(I.problemaDaImagem({ type: tipo, size: 300 * 1024 }), null, `${tipo} de 300 KB: pode enviar`);
    for (const tipo of ["image/gif", "image/svg+xml", "application/pdf", "text/html", "", "image/heic"])
      eq(I.problemaDaImagem({ type: tipo, size: 1000 }), "Envie uma imagem JPG, PNG ou WebP.", `tipo "${tipo}": recusado com o motivo`);
    eq(I.problemaDaImagem({ type: "image/png", size: 0 }), "Esse arquivo está vazio.", "arquivo vazio: recusado");
    eq(I.problemaDaImagem({ type: "image/png", size: NaN }), "Esse arquivo está vazio.", "tamanho que não é número: recusado");
    eq(I.problemaDaImagem({ type: "image/jpeg", size: 10 * MB }), null, "exatamente 10 MB: pode enviar");
    eq(I.problemaDaImagem({ type: "image/jpeg", size: 10 * MB + 1 }), "A imagem tem 10 MB e o limite é 10 MB. Diminua a imagem e envie de novo.", "10 MB e 1 byte: recusado");
    eq(I.problemaDaImagem({ type: "image/jpeg", size: 12.5 * MB }), "A imagem tem 12,5 MB e o limite é 10 MB. Diminua a imagem e envie de novo.", "12,5 MB: recusado, com o tamanho em português");
  });

  await tentar("o painel de eventos", async () => {
    console.log("== o painel de eventos (aba Imagem) ==");
    const p = ler("pages/painel-eventos/evento/index.astro");
    verdade(/data-tab="imagem">Imagem<\/button>/.test(p) && /data-tab-panel="imagem"/.test(p), "a aba Imagem e o painel dela existem");
    verdade(/accept="image\/jpeg,image\/png,image\/webp"/.test(p), "o seletor de arquivo só oferece JPG, PNG e WebP");
    const lerForm = p.slice(p.indexOf("function lerFormulario()"), p.indexOf("// ---------- v7.13: crachá"));
    verdade(lerForm.length > 100 && !/cover/.test(lerForm), "o \"Salvar evento\" não manda `cover` (salvar os dados nunca apaga a imagem)");
    const envio = p.slice(p.indexOf("imagemEnviar?.addEventListener"), p.indexOf("imagemRemover?.addEventListener"));
    verdade(envio.indexOf("problemaDaImagem(arquivo)") > -1 && envio.indexOf("problemaDaImagem(arquivo)") < envio.indexOf("/files"), "confere o arquivo ANTES de enviar");
    verdade(envio.indexOf('formData.append("title"') > -1 && envio.indexOf('formData.append("title"') < envio.indexOf('formData.append("file"'), "o título vai antes do arquivo (o Directus ignora campo depois do arquivo)");
    verdade(/body: JSON\.stringify\(\{ cover: arquivoId \}\)/.test(envio), "o envio grava SÓ o campo `cover` do evento");
    verdade(/if \(imagemOcupada\) return;/.test(envio) && /travarImagem\(true\)/.test(envio) && /finally \{\s*travarImagem\(false\)/.test(envio), "um envio por vez (duplo clique não sobe dois arquivos) e o botão volta depois do erro");
    const remover = p.slice(p.indexOf("imagemRemover?.addEventListener"), p.indexOf("imagemRemover?.addEventListener") + 1500);
    verdade(/confirm\(/.test(remover) && /body: JSON\.stringify\(\{ cover: null \}\)/.test(remover), "remover pede confirmação e grava só `cover: null`");
    verdade(/import \{ problemaDaImagem \} from "@\/lib\/imagemEvento";/.test(p) && /import \{ directusAssetUrl \} from "@\/lib\/directus";/.test(p), "o painel usa a conferência e o endereço da imagem do próprio site");
    verdade(/cover: string \| null;/.test(p), "o tipo do evento no painel conhece o `cover`");
  });

  await tentar("a prévia do link", async () => {
    console.log("== a prévia do link (WhatsApp) ==");
    const ev = ler("pages/evento/[slug].astro");
    verdade(/const cover = event\.cover \? directusAssetUrl\(event\.cover/.test(ev) && /<BaseLayout [^>]*image=\{cover\}/.test(ev), "a página do evento passa a imagem do evento para o og:image");
    const base = ler("layouts/BaseLayout.astro");
    verdade(/image = siteConfig\.socialImage/.test(base) && /<meta property="og:image" content=\{absoluteImage\} \/>/.test(base), "sem imagem, cai na imagem padrão do site (a logo)");
    const cam = ler("pages/camiseta/[slug].astro");
    verdade(/const imagemId = lote\.evento\?\.cover \?\? lote\.imagem \?\? null;/.test(cam), "a camiseta vinculada ao evento usa a imagem do evento primeiro");
  });

  console.log(`\nimagem do evento: ${total - falhas}/${total} verificações ok${falhas ? ` — ${falhas} FALHA(S)` : ""}`);
  process.exit(falhas ? 1 : 0);
})();
