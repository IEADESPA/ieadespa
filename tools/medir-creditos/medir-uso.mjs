// Soma o uso de tokens das conversas locais do Claude Code (só leitura, nada sai do computador).
// Uso: node medir-uso.mjs [pasta-do-projeto-em-~/.claude/projects] [data-inicial ISO]
//   sem pasta (ou "-"): a das conversas do repositório onde o comando roda; sem data: os últimos 7 dias.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const raiz = process.argv[2] && process.argv[2] !== "-"
  ? process.argv[2]
  : path.join(os.homedir(), ".claude", "projects", process.cwd().replace(/[^A-Za-z0-9]/g, "-"));
if (!fs.existsSync(raiz)) {
  console.error(`Não achei a pasta das conversas: ${raiz}. Rode na raiz do repositório ou passe a pasta.`);
  process.exit(1);
}
const desde = new Date(process.argv[3] || Date.now() - 7 * 864e5);

function arquivos(dir) {
  const out = [];
  for (const nome of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, nome.name);
    if (nome.isDirectory()) out.push(...arquivos(p));
    else if (nome.name.endsWith(".jsonl") && fs.statSync(p).mtime >= desde) out.push(p);
  }
  return out;
}

const vazio = () => ({ arquivos: 0, req: 0, input: 0, cw: 0, cr: 0, output: 0, imagens: 0, leituraHtmlGrande: 0 });
const grupos = { principal: vazio(), subagentes: vazio() };
const porAgente = [];

for (const arq of arquivos(raiz)) {
  if (arq.includes(`${path.sep}memory${path.sep}`)) continue;
  const g = arq.includes(`${path.sep}subagents${path.sep}`) ? grupos.subagentes : grupos.principal;
  const vistos = new Map();
  let imagens = 0;
  let htmlGrande = 0;
  for (const linha of fs.readFileSync(arq, "utf8").split("\n")) {
    if (!linha.trim()) continue;
    let o;
    try { o = JSON.parse(linha); } catch { continue; }
    if (o.timestamp && new Date(o.timestamp) < desde) continue;
    const m = o.message;
    if (o.type === "assistant" && m?.usage && m.id) vistos.set(m.id, m.usage);
    if (o.type === "user" && Array.isArray(m?.content)) {
      for (const c of m.content) {
        if (c.type === "image") imagens++;
        if (c.type === "tool_result" && Array.isArray(c.content)) {
          for (const d of c.content) {
            if (d.type === "image") imagens++;
            if (d.type === "text" && d.text && d.text.length > 200000) htmlGrande++;
          }
        }
        if (c.type === "tool_result" && typeof c.content === "string" && c.content.length > 200000) htmlGrande++;
      }
    }
  }
  const s = vazio();
  for (const u of vistos.values()) {
    s.req++;
    s.input += u.input_tokens || 0;
    s.cw += u.cache_creation_input_tokens || 0;
    s.cr += u.cache_read_input_tokens || 0;
    s.output += u.output_tokens || 0;
  }
  s.imagens = imagens;
  s.leituraHtmlGrande = htmlGrande;
  if (!s.req) continue;
  g.arquivos++;
  for (const k of ["req", "input", "cw", "cr", "output", "imagens", "leituraHtmlGrande"]) g[k] += s[k];
  porAgente.push({ arq: path.relative(raiz, arq), ...s });
}

const mil = (n) => (n / 1e6).toFixed(1).replace(".", ",") + " mi";
for (const [nome, g] of Object.entries(grupos)) {
  console.log(`${nome}: ${g.arquivos} conversas, ${g.req} pedidos, entrada nova ${mil(g.input)}, gravação no cache ${mil(g.cw)}, leitura do cache ${mil(g.cr)}, saída ${mil(g.output)}, imagens ${g.imagens}, resultados >200 mil caracteres ${g.leituraHtmlGrande}`);
}
porAgente.sort((a, b) => (b.cw + b.cr + b.output) - (a.cw + a.cr + a.output));
console.log("\nAs 10 conversas mais pesadas (gravação + leitura do cache + saída):");
for (const a of porAgente.slice(0, 10)) {
  console.log(`${a.arq.slice(0, 90)} | pedidos ${a.req} | grav ${mil(a.cw)} | leit ${mil(a.cr)} | saída ${mil(a.output)} | imagens ${a.imagens} | grandes ${a.leituraHtmlGrande}`);
}
