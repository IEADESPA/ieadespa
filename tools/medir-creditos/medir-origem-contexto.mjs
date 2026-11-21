// De onde vem o contexto relido? (só leitura, nada sai do computador)
// Para cada pedido ao modelo, soma o tamanho estimado de cada pedaço que está "vivo" no
// contexto naquele momento, separado pela origem (Read de .js, Read de .html, terminal,
// fotos, relatórios de agentes...). Isso aproxima a parte de cada origem na releitura.
// Uso: node medir-origem-contexto.mjs [pasta-do-projeto] [data-inicial ISO] [sem-raciocinio]
//   sem pasta (ou "-"): a das conversas do repositório onde o comando roda, em ~/.claude/projects; sem data: 7 dias.
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
const CHARS_POR_TOKEN = 4;
const SOMAR_RACIOCINIO = process.argv[4] !== "sem-raciocinio";

function arquivos(dir) {
  const out = [];
  for (const nome of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, nome.name);
    if (nome.isDirectory()) {
      if (nome.name === "memory" || nome.name === "tool-results") continue;
      out.push(...arquivos(p));
    } else if (nome.name.endsWith(".jsonl") && fs.statSync(p).mtime >= desde) out.push(p);
  }
  return out;
}

function tokensImagem(b64) {
  try {
    const buf = Buffer.from(b64.slice(0, 200000), "base64");
    let w = 0;
    let h = 0;
    if (buf[0] === 0x89 && buf[1] === 0x50) {
      w = buf.readUInt32BE(16);
      h = buf.readUInt32BE(20);
    } else if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marca = buf[i + 1];
        const tam = buf.readUInt16BE(i + 2);
        if (marca >= 0xc0 && marca <= 0xc3) {
          h = buf.readUInt16BE(i + 5);
          w = buf.readUInt16BE(i + 7);
          break;
        }
        i += 2 + tam;
      }
    }
    if (!w || !h) return 1600;
    return Math.min(4784, Math.ceil(w / 28) * Math.ceil(h / 28));
  } catch {
    return 1600;
  }
}

function classeRead(fp) {
  const p = String(fp || "").toLowerCase().replaceAll("\\", "/");
  if (/\.(png|jpe?g|gif|webp)$/.test(p)) return "Read: imagem";
  if (p.endsWith(".html") || p.endsWith(".htm")) return "Read: página .html (desenho/protótipo)";
  if (/\.(m?js|cjs|ts)$/.test(p)) return "Read: código .js/.ts";
  if (p.endsWith(".sql")) return "Read: .sql";
  if (p.endsWith(".md")) return "Read: documento .md";
  if (p.endsWith(".json") || p.endsWith(".jsonl")) return "Read: .json";
  if (p.endsWith(".css")) return "Read: .css";
  return "Read: outros";
}

function classeTerminal(cmd) {
  const c = String(cmd || "");
  if (/node --test|npm (run )?test|rodar\.sh|tudo\.sh|playwright|e2e|bateria|vitest|jest/i.test(c)) return "Terminal: testes e baterias";
  if (/^\s*(git|gh)\s/.test(c) || /&&\s*(git|gh)\s/.test(c)) return "Terminal: git/gh";
  if (/\b(cat|sed|head|tail|grep|rg|Get-Content|Select-String|find|ls|wc|awk)\b/.test(c)) return "Terminal: ler/buscar arquivos";
  if (/\bnode\b/.test(c)) return "Terminal: scripts node";
  return "Terminal: outros";
}

function classeFerramenta(nome, input) {
  if (nome === "Read") return classeRead(input?.file_path);
  if (nome === "Bash" || nome === "PowerShell") return classeTerminal(input?.command);
  if (nome === "Grep") return "Grep";
  if (nome === "Glob") return "Glob";
  if (nome === "Agent" || nome === "Task") return "Relatórios de agentes";
  if (nome === "WebFetch" || nome === "WebSearch") return "Web (busca e páginas)";
  if (nome?.startsWith("mcp__claude-in-chrome")) return "Navegador (texto)";
  if (nome?.startsWith("mcp__memoria-projeto")) return "Memória MCP";
  if (nome === "Artifact" || nome === "ArtifactComments") return "Artifact";
  if (nome === "Edit" || nome === "Write") return "Edit/Write (resultado)";
  return "Outras ferramentas";
}

function tamanhoTexto(conteudo) {
  if (typeof conteudo === "string") return { texto: conteudo.length, imgs: [] };
  let texto = 0;
  const imgs = [];
  if (Array.isArray(conteudo)) {
    for (const d of conteudo) {
      if (d?.type === "text") texto += (d.text || "").length;
      else if (d?.type === "image") imgs.push(tokensImagem(d.source?.data || ""));
      else if (d?.type === "tool_reference") texto += 50;
    }
  }
  return { texto, imgs };
}

const total = {};
const grupos = { principal: { contexto: 0, estimado: 0, pedidos: 0 }, agentes: { contexto: 0, estimado: 0, pedidos: 0 } };
const porGrupo = { principal: {}, agentes: {} };
let releituraMesmoArquivo = 0;
let readTotal = 0;

for (const arq of arquivos(raiz)) {
  const grupo = arq.includes(`${path.sep}subagents${path.sep}`) ? "agentes" : "principal";
  const vivos = {};
  const nomes = new Map();
  const lidos = new Set();
  const pedidosVistos = new Set();
  const somar = (cat, tok) => { vivos[cat] = (vivos[cat] || 0) + tok; };
  const FIXO_MAX = 65000;
  let fixo = null;
  let msgAtual = null;
  let saidaAtual = 0;
  let visivelAtual = 0;
  const fecharMensagem = () => {
    if (msgAtual && SOMAR_RACIOCINIO) somar("Raciocínio oculto (saída − texto visível)", Math.max(0, saidaAtual - visivelAtual));
    msgAtual = null;
    saidaAtual = 0;
    visivelAtual = 0;
  };
  for (const linha of fs.readFileSync(arq, "utf8").split("\n")) {
    if (!linha.trim()) continue;
    let o;
    try { o = JSON.parse(linha); } catch { continue; }
    if (o.type === "system" && o.subtype === "compact_boundary") {
      fecharMensagem();
      for (const k of Object.keys(vivos)) delete vivos[k];
      lidos.clear();
      continue;
    }
    const antes = o.timestamp && new Date(o.timestamp) < desde;
    const m = o.message;
    if (o.type === "assistant" && m) {
      if (m.id && m.id !== msgAtual) fecharMensagem();
      if (m.id && m.usage && !pedidosVistos.has(m.id)) {
        pedidosVistos.add(m.id);
        msgAtual = m.id;
        const u = m.usage;
        const ctx = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
        if (fixo === null) {
          let est0 = 0;
          for (const v of Object.values(vivos)) est0 += v;
          const r0 = Math.max(0, ctx - est0);
          fixo = Math.min(r0, FIXO_MAX);
          if (r0 > FIXO_MAX) somar("Herdado do chefe (agente tipo fork)", r0 - FIXO_MAX);
        }
        if (!antes) {
          let est = fixo;
          const cf = "Fixo: instruções do sistema, ferramentas, plugins, CLAUDE.md";
          total[cf] = (total[cf] || 0) + fixo;
          porGrupo[grupo][cf] = (porGrupo[grupo][cf] || 0) + fixo;
          for (const [k, v] of Object.entries(vivos)) {
            total[k] = (total[k] || 0) + v;
            porGrupo[grupo][k] = (porGrupo[grupo][k] || 0) + v;
            est += v;
          }
          const resto = Math.max(0, ctx - est);
          const cr = "Não explicado (erro da estimativa)";
          total[cr] = (total[cr] || 0) + resto;
          porGrupo[grupo][cr] = (porGrupo[grupo][cr] || 0) + resto;
          grupos[grupo].contexto += ctx;
          grupos[grupo].estimado += est;
          grupos[grupo].pedidos++;
        }
      }
      if (m.usage && m.id === msgAtual) saidaAtual = Math.max(saidaAtual, m.usage.output_tokens || 0);
      if (Array.isArray(m.content)) {
        for (const b of m.content) {
          if (b.type === "tool_use") {
            nomes.set(b.id, { nome: b.name, input: b.input });
            const t = JSON.stringify(b.input || {}).length / CHARS_POR_TOKEN;
            visivelAtual += t;
            somar("Pedidos do próprio agente (comandos, edições, Write)", t);
          } else if (b.type === "text") {
            const t = (b.text || "").length / CHARS_POR_TOKEN;
            visivelAtual += t;
            somar("Texto do próprio agente", t);
          } else if (b.type === "thinking") {
            const t = (b.thinking || "").length / CHARS_POR_TOKEN;
            visivelAtual += t;
            somar("Raciocínio guardado", t);
          }
        }
      }
      continue;
    }
    fecharMensagem();
    if (o.type === "attachment") {
      if (o.attachment?.type === "prompt_snapshot") continue;
      somar("Anexos e lembretes do sistema", JSON.stringify(o.attachment || {}).length / CHARS_POR_TOKEN);
      continue;
    }
    if (o.type === "user" && m) {
      if (typeof m.content === "string") {
        somar(o.isCompactSummary ? "Resumo da compactação" : "Pedidos (do usuário, do chefe ou lembretes)", m.content.length / CHARS_POR_TOKEN);
        continue;
      }
      if (!Array.isArray(m.content)) continue;
      for (const c of m.content) {
        if (c.type === "text") somar(o.isCompactSummary ? "Resumo da compactação" : "Pedidos (do usuário, do chefe ou lembretes)", (c.text || "").length / CHARS_POR_TOKEN);
        else if (c.type === "image") somar("Fotos de tela e imagens", tokensImagem(c.source?.data || ""));
        else if (c.type === "tool_result") {
          const ref = nomes.get(c.tool_use_id) || { nome: "?" };
          const cat = classeFerramenta(ref.nome, ref.input);
          const { texto, imgs } = tamanhoTexto(c.content);
          const tok = texto / CHARS_POR_TOKEN;
          somar(cat, tok);
          for (const t of imgs) somar("Fotos de tela e imagens", t);
          if (ref.nome === "Read" && !antes) {
            readTotal += tok;
            const chave = `${ref.input?.file_path}|${ref.input?.offset || 0}|${ref.input?.limit || 0}`;
            if (lidos.has(chave)) releituraMesmoArquivo += tok;
            lidos.add(chave);
          }
        }
      }
    }
  }
}

function tabela(obj, ctxTotal) {
  const linhas = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of linhas) {
    console.log(`${(100 * v / ctxTotal).toFixed(1).padStart(5)} %  ${(v / 1e6).toFixed(1).padStart(8)} mi  ${k}`);
  }
}

const ctxTotal = grupos.principal.contexto + grupos.agentes.contexto;
console.log("Pedidos:", grupos.principal.pedidos, "principal;", grupos.agentes.pedidos, "agentes");
for (const g of ["principal", "agentes"]) {
  console.log(`Calibração ${g}: estimado ${(grupos[g].estimado / 1e6).toFixed(0)} mi de ${(grupos[g].contexto / 1e6).toFixed(0)} mi medidos (${(100 * grupos[g].estimado / grupos[g].contexto).toFixed(0)} %)`);
}
console.log("\n== TUDO (parte de cada origem no contexto relido) ==");
tabela(total, ctxTotal);
console.log("\n== SÓ AGENTES ==");
tabela(porGrupo.agentes, grupos.agentes.contexto);
console.log("\n== SÓ CONVERSA PRINCIPAL ==");
tabela(porGrupo.principal, grupos.principal.contexto);
console.log(`\nRead do mesmo arquivo e trecho já lido antes (na mesma conversa): ${(100 * releituraMesmoArquivo / readTotal).toFixed(1)} % dos tokens de Read`);
