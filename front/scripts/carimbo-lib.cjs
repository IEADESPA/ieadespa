// O CARIMBO do build das telas Svelte (FASE 10): a saída em app/svelte é versionada (o deploy do Azure não roda o build), então
// precisamos de uma prova de que ela corresponde ao código-fonte. O carimbo guarda o resumo (SHA-256) do fonte (front/src, as
// configurações e o package-lock) e de cada arquivo gerado. O teste do jest da API (frontSvelteCarimbo.test.js), que roda no deploy
// ANTES de mexer no banco, refaz as contas: fonte mudado sem build novo, ou saída mexida à mão, para o deploy.
// As quebras de linha contam como LF (o Windows com core.autocrlf não muda o resumo).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RAIZ_FRONT = path.resolve(__dirname, "..");
const SAIDA = path.resolve(RAIZ_FRONT, "..", "app", "svelte");
const ARQUIVO_CARIMBO = "carimbo.json";
const FONTES_SOLTAS = ["package.json", "package-lock.json", "vite.config.ts", "svelte.config.js", "tsconfig.json"];

/** @param {string} dir @returns {string[]} */
function listar(dir) {
  /** @type {string[]} */
  const saida = [];
  for (const nome of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, nome);
    if (fs.statSync(p).isDirectory()) saida.push(...listar(p));
    else saida.push(p);
  }
  return saida;
}
/** @param {string} p */
function texto(p) { return fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n"); }
/** @param {string} s */
function resumo(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex"); }

function resumoDoFonte() {
  const h = crypto.createHash("sha256");
  const arquivos = FONTES_SOLTAS.map((n) => path.join(RAIZ_FRONT, n)).concat(listar(path.join(RAIZ_FRONT, "src")));
  for (const p of arquivos) {
    const rel = path.relative(RAIZ_FRONT, p).split(path.sep).join("/");
    h.update(rel + "\n" + texto(p) + "\n");
  }
  return h.digest("hex");
}
function resumosDaSaida() {
  /** @type {Record<string, string>} */
  const r = {};
  if (!fs.existsSync(SAIDA)) return r;
  for (const p of listar(SAIDA)) {
    const rel = path.relative(SAIDA, p).split(path.sep).join("/");
    if (rel === ARQUIVO_CARIMBO) continue;
    r[rel] = resumo(texto(p));
  }
  return r;
}
function carimbar() {
  const carimbo = { fonte: resumoDoFonte(), arquivos: resumosDaSaida() };
  fs.writeFileSync(path.join(SAIDA, ARQUIVO_CARIMBO), JSON.stringify(carimbo, null, 2) + "\n");
  return carimbo;
}
// devolve a lista do que não bate (vazia = tudo certo)
function conferir() {
  const p = path.join(SAIDA, ARQUIVO_CARIMBO);
  if (!fs.existsSync(p)) return ["falta app/svelte/carimbo.json (rode npm run build em front/)"];
  /** @type {{ fonte: string, arquivos: Record<string, string> }} */
  const salvo = JSON.parse(fs.readFileSync(p, "utf8"));
  const erros = [];
  if (salvo.fonte !== resumoDoFonte()) erros.push("o código-fonte de front/ mudou depois do último build (rode npm run build em front/ e versione app/svelte)");
  const agora = resumosDaSaida();
  for (const [arq, h] of Object.entries(salvo.arquivos || {})) {
    if (!(arq in agora)) erros.push(`falta app/svelte/${arq}`);
    else if (agora[arq] !== h) erros.push(`app/svelte/${arq} não é o que o build gerou`);
  }
  for (const arq of Object.keys(agora)) if (!(arq in (salvo.arquivos || {}))) erros.push(`app/svelte/${arq} não veio do build`);
  return erros;
}
module.exports = { carimbar, conferir, resumoDoFonte, SAIDA };
