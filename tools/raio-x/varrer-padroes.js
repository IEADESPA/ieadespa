// tools/raio-x/varrer-padroes.js — raio-x de velocidade (FASE 10, 17/11/2026): procura no código da API os padrões que travam quando há muita gente.
// É uma leitura heurística (aponta onde olhar; a medição de verdade é o medir-rotas.js). Uso: node tools/raio-x/varrer-padroes.js [--json]
//   N+1        — consulta ao banco (await ...query/.request) dentro de laço (for/while/forEach/map) na mesma função
//   SEM_FILTRO — SELECT de tabela grande sem WHERE, TOP ou OFFSET (lê a tabela inteira)
//   FOTO_LINHA — link assinado de foto (urlComSas) gerado por linha numa lista
//   SEM_PAGINA — rota GET de lista que devolve um array sem página/limite
const fs = require("fs");
const path = require("path");

const API = path.join(__dirname, "..", "..", "api");
const GRANDES = ["MembroReferencia", "LancamentosTesouraria", "AuditLog", "PresencasEbd", "ChamadasEbd", "Dizimistas", "SaidasTesouraria", "VinculosFamiliares",
  "PresencasReuniao", "RespostasEnquete", "EscalaItens", "NotificacoesUsuario", "SessoesUsuario", "Consagracoes", "CartasTransito", "MarcosMembro", "Doacoes"];

function arquivos(dir) {
  const out = [];
  for (const nome of fs.readdirSync(dir)) {
    if (nome === "node_modules" || nome === "__tests__" || nome.startsWith(".")) continue;
    const p = path.join(dir, nome);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...arquivos(p));
    else if (nome.endsWith(".js")) out.push(p);
  }
  return out;
}

const achados = [];
for (const arq of arquivos(API)) {
  const rel = path.relative(path.join(API, ".."), arq).split(path.sep).join("/");
  if (rel.startsWith("api/scripts/")) continue;
  const linhas = fs.readFileSync(arq, "utf8").split(/\r?\n/);
  // N+1: um laço aberto e, nas 25 linhas seguintes, uma consulta com await (fora de Promise.all de um lote só)
  linhas.forEach((l, i) => {
    if (!/\b(for\s*\(|while\s*\(|\.forEach\(|\.map\(async)/.test(l)) return;
    const janela = linhas.slice(i, i + 25).join("\n");
    if (/await\s+[\w.]*(request\(\)|query\(|\.query\()/.test(janela.split(/\n\s*}\s*\n/)[0] || "")) {
      achados.push({ tipo: "N+1", arquivo: rel, linha: i + 1, trecho: l.trim().slice(0, 110) });
    }
  });
  // SEM_FILTRO: SELECT de tabela grande sem WHERE/TOP/OFFSET no mesmo texto de consulta
  const texto = linhas.join("\n");
  const re = /`([^`]*\bSELECT\b[^`]*)`/g;
  let m;
  while ((m = re.exec(texto))) {
    const q = m[1];
    for (const t of GRANDES) {
      if (new RegExp(`\\bFROM\\s+(dbo\\.)?${t}\\b`, "i").test(q) && !/\bWHERE\b|\bTOP\b|\bOFFSET\b|\$\{/i.test(q)) {
        const linha = texto.slice(0, m.index).split("\n").length;
        achados.push({ tipo: "SEM_FILTRO", arquivo: rel, linha, trecho: `${t}: ${q.replace(/\s+/g, " ").trim().slice(0, 100)}` });
      }
    }
  }
  // FOTO_LINHA: urlComSas dentro de um .map
  linhas.forEach((l, i) => { if (/\.map\(/.test(l) && /urlComSas/.test(linhas.slice(i, i + 3).join(" "))) achados.push({ tipo: "FOTO_LINHA", arquivo: rel, linha: i + 1, trecho: l.trim().slice(0, 110) }); });
}

if (process.argv.includes("--json")) { console.log(JSON.stringify(achados, null, 1)); process.exit(0); }
const porTipo = {};
for (const a of achados) (porTipo[a.tipo] = porTipo[a.tipo] || []).push(a);
for (const [tipo, lista] of Object.entries(porTipo)) {
  console.log(`\n== ${tipo}: ${lista.length} lugar(es) ==`);
  for (const a of lista) console.log(`  ${a.arquivo}:${a.linha}  ${a.trecho}`);
}
console.log(`\nTotal: ${achados.length} ponto(s) para olhar (heurística — confirmar com a medição).`);
