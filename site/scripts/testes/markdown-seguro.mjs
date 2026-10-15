// Regra do markdown seguro das páginas públicas (src/lib/markdownSeguro.ts) + comparação com os textos REAIS do site: a saída tem de ser idêntica à do marked puro.
// Roda à mão, de dentro de `site/` (precisa do `marked` instalado e do código-fonte; por isso não está no fluxo automático do site-testes):
//   DIRECTUS_URL=… DIRECTUS_ADMIN_TOKEN=… node scripts/testes/markdown-seguro.mjs   (as variáveis vêm dos segredos; só LÊ o Directus)
import { renderizarMarkdown, enderecoSeguro } from "../../src/lib/markdownSeguro.ts";
import { marked } from "marked";

let falhas = 0, total = 0;
const ok = (c, d, x) => { total++; if (!c) { falhas++; console.log("FALHA", d, x === undefined ? "" : JSON.stringify(x).slice(0, 300)); } };
const h = (md) => renderizarMarkdown(md);
let r = await h("Olá <script>alert(1)</script> mundo");
ok(!/<script/i.test(r) && /&lt;script&gt;/.test(r), "script escrito à mão vira texto, nunca marcação", r);
r = await h('<img src=x onerror="alert(1)">');
ok(!/<img/i.test(r) && /&lt;img/.test(r), "img com onerror vira texto", r);
r = await h('<iframe src="https://exemplo.com"></iframe>');
ok(!/<iframe/i.test(r), "iframe vira texto", r);
r = await h("[clique](javascript:alert(1))");
ok(!/href=/.test(r) && /clique/.test(r), "link javascript: perde o endereço, o texto fica", r);
r = await h("[clique](java\tscript:alert(1))");
ok(!/href=/.test(r), "javascript: com TAB no meio também", r);
r = await h("[x](data:text/html;base64,PHNjcmlwdD4=)");
ok(!/href=/.test(r), "link data: perde o endereço", r);
r = await h("![fig](javascript:alert(1))");
ok(!/<img/.test(r) && /fig/.test(r), "imagem javascript: some (fica o texto alternativo)", r);
r = await h("![fig](data:image/svg+xml;base64,AAAA)");
ok(!/<img/.test(r), "imagem data: some", r);
r = await h("[ok](https://ieadespa.org.br/x) [email](mailto:a@b.com) [fone](tel:+5594999999999) [rel](/mensagens/) [ancora](#topo)");
ok((r.match(/<a href=/g) || []).length === 5, "https, mailto, tel, relativo e âncora continuam sendo links", r);
r = await h("![ok](https://exemplo.com/a.png) ![rel](/img/a.png)");
ok((r.match(/<img /g) || []).length === 2, "imagens https e relativa continuam", r);
r = await h("[x](mailto:a@b.com) ![y](mailto:a@b.com)");
ok(/<a href="mailto/.test(r) && !/<img/.test(r), "mailto vale em link, não em imagem", r);
ok((await h(null)) === "" && (await h(undefined)) === "" && (await h("")) === "", "vazio, nulo e indefinido: texto vazio");
ok(enderecoSeguro("HTTPS://X.COM", false) && !enderecoSeguro("vbscript:x", true) && !enderecoSeguro("", true), "enderecoSeguro: maiúsculas ok, vbscript e vazio não");

const { DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN } = process.env;
let n = 0;
if (DIRECTUS_URL && DIRECTUS_ADMIN_TOKEN) {
  const fontes = [["noticias", "body"], ["mensagens", "body"], ["eventos", "body"], ["historia", "body"], ["ministerios", "body"], ["configuracoes", "sobre_corpo"], ["configuracoes", "crencas_corpo"], ["visitante", "boas_vindas"], ["visitante", "o_que_esperar"], ["visitante", "estrutura"]];
  const diferentes = [];
  for (const [col, campo] of fontes) {
    const rr = await (await fetch(`${DIRECTUS_URL}/items/${col}?fields=id,${campo}&limit=-1`, { headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` } })).json();
    const lista = Array.isArray(rr.data) ? rr.data : rr.data ? [rr.data] : [];
    for (const it of lista) { const md = it[campo]; if (!md) continue; n++; if ((await h(md)) !== (await marked.parse(md))) diferentes.push(`${col}#${it.id}`); }
  }
  ok(n >= 30 && diferentes.length === 0, `os ${n} textos reais do site saem IDÊNTICOS ao marked puro (nada muda para o público)`, diferentes);
} else console.log("(sem DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN: só a parte pura)");
console.log(falhas ? `${falhas} falha(s) de ${total}` : `${total}/${total} ok${n ? ` (${n} textos reais conferidos)` : ""}`);
process.exitCode = falhas ? 1 : 0;
