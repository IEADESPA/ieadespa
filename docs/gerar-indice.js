#!/usr/bin/env node
// docs/gerar-indice.js — gera docs/plano/INDICE.md a partir dos arquivos de fase em docs/plano/.
//
// Por que existe: o histórico de cada versão (checklist, decisões, verificação) mora em um arquivo por
// fase, e os comentários do código citam versões pelo número ("v6.5"). O índice responde "onde está a
// v6.5 e em que pé ela está?" sem abrir 15 arquivos — e, por ser gerado, não fica desatualizado.
//
// Uso (na raiz do repositório):  node docs/gerar-indice.js
// Regra: depois de registrar uma entrega em docs/plano/fase-*.md, rode o script e commite o INDICE.md junto.
const fs = require("fs");
const path = require("path");

const PASTA = path.join(__dirname, "plano");
// Ordem em que as fases aparecem no índice (a do plano, não a alfabética).
const FASES = [
  "fase-0-fundamentos.md", "fase-1-membresia.md", "fase-2-governanca.md", "fase-3-disciplina-e-etica.md",
  "fase-4-financeiro-e-patrimonio.md", "fase-b-consolidacao-da-base.md", "fase-c-integracao-com-o-site.md",
  "fase-5-departamentos-e-relatorios.md", "fase-6-ebd.md", "fase-7-saude-eventos-e-comunicacao.md",
  "fase-d-robustez-e-operacao.md", "fase-8-ministerial-afm.md", "fase-9-entidades-vinculadas.md", "fase-10-experiencia-design-performance.md",
  "fase-11-sistema-campal.md", "fase-12-inteligencia-e-indicadores.md"
];

// Âncora no estilo do GitHub: minúsculas, sem pontuação/emoji, espaço vira hífen; repetidos ganham -1, -2...
function criarSlugger() {
  const usados = new Map();
  return (texto) => {
    const base = texto
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[`*~]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
      .replace(/ /g, "-");
    const n = usados.get(base) || 0;
    usados.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };
}

function lerArquivo(nome) {
  const caminho = path.join(PASTA, nome);
  if (!fs.existsSync(caminho)) return null;
  const linhas = fs.readFileSync(caminho, "utf8").replace(/\r\n/g, "\n").split("\n");
  const slug = criarSlugger();
  let cerca = false;
  let titulo = null;
  const versoes = [];
  let atual = null;
  for (const linha of linhas) {
    if (/^\s*(```|~~~)/.test(linha)) { cerca = !cerca; continue; }
    if (cerca) continue;
    const h = /^(#{1,6}) (.*)$/.exec(linha);
    if (h) {
      const nivel = h[1].length;
      const texto = h[2].trim();
      const ancora = slug(texto);
      if (nivel === 1 && !titulo) { titulo = texto; continue; }
      if (nivel <= 2) {
        atual = { texto, ancora, feitos: 0, abertos: 0 };
        if (nivel === 2) versoes.push(atual);
      }
      continue;
    }
    const item = /^\s*[-*] \[( |x|X)\]/.exec(linha);
    if (item && atual) { if (item[1] === " ") atual.abertos++; else atual.feitos++; }
  }
  return { nome, titulo: titulo || nome, versoes };
}

function separarId(texto) {
  const limpo = texto.replace(/^🔒\s*/, "🔒 ");
  const m = /^(v[A-Z0-9]+(?:\.[0-9]+)*(?:\.[0-9]+)?)\s+[—–-]\s+(.*)$/.exec(limpo);
  if (m) return { id: m[1], titulo: m[2] };
  const t = /^🔒 Trava de Revisão ([0-9A-Za-z]+-[A-Za-z])\s+[—–-]\s+(.*)$/.exec(limpo);
  if (t) return { id: `🔒 ${t[1]}`, titulo: t[2] };
  return { id: "", titulo: limpo };
}

function situacao(feitos, abertos) {
  const total = feitos + abertos;
  if (total === 0) return "—";
  if (abertos === 0) return `✅ ${feitos}/${total}`;
  if (feitos === 0) return `⬜ 0/${total}`;
  return `🟡 ${feitos}/${total}`;
}

const celula = (s) => String(s).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

function gerar() {
  const arquivos = FASES.map(lerArquivo).filter(Boolean);
  const saida = [];
  saida.push("# Índice do plano de versões");
  saida.push("");
  saida.push("> **Gerado** por `node docs/gerar-indice.js` — não edite à mão. Cada linha leva ao histórico da versão (checklist,");
  saida.push("> decisões e verificação) no arquivo da fase. Itens: concluídos/total do checklist da versão.");
  saida.push("> ✅ tudo concluído · 🟡 em andamento · ⬜ nada começado · — sem checklist (referência ou trava).");
  saida.push("");
  saida.push("Volta ao [README](../../README.md#3-plano-de-versões-mega-sistema-fase-a-fase).");
  saida.push("");
  for (const f of arquivos) {
    const feitos = f.versoes.reduce((s, v) => s + v.feitos, 0);
    const abertos = f.versoes.reduce((s, v) => s + v.abertos, 0);
    saida.push(`## ${celula(f.titulo)}`);
    saida.push("");
    saida.push(`Arquivo: [\`${f.nome}\`](${f.nome}) — ${f.versoes.length} bloco(s) · itens ${feitos}/${feitos + abertos} concluídos.`);
    saida.push("");
    saida.push("| Versão | Título | Itens |");
    saida.push("| --- | --- | --- |");
    for (const v of f.versoes) {
      const { id, titulo } = separarId(v.texto);
      saida.push(`| ${celula(id) || "·"} | [${celula(titulo)}](${f.nome}#${v.ancora}) | ${situacao(v.feitos, v.abertos)} |`);
    }
    saida.push("");
  }
  return saida.join("\n");
}

if (require.main === module) {
  const destino = path.join(PASTA, "INDICE.md");
  fs.writeFileSync(destino, gerar());
  console.log(`Índice escrito em ${path.relative(process.cwd(), destino)}`);
}

module.exports = { criarSlugger, lerArquivo, separarId, situacao, gerar };
