// Carrega um arquivo .ts de site/src/lib para os testes SEM depender do `typescript` instalado (v7.13, revisão de 22/10/2026: os testes só rodavam com o
// node_modules do repositório principal). Com o `typescript` disponível, usa ele (como `painel-unidade.cjs`); sem ele, usa o "tirar os tipos" do próprio Node
// (`module.stripTypeScriptTypes`, Node 22.13 ou mais novo) e carrega o resultado como módulo ES. Só serve para arquivos sem `enum`/`namespace` (os de src/lib usados aqui).
//   const { carregarTs } = require("./carregar-ts.cjs");  const C = await carregarTs("credenciamento");
const fs = require("fs");
const path = require("path");
const Module = require("module");

let ts = null;
try { ts = require("typescript"); } catch { ts = null; }

async function carregarTs(nome) {
  const arquivo = path.join(__dirname, `../../src/lib/${nome}.ts`);
  const fonte = fs.readFileSync(arquivo, "utf8");
  if (ts) {
    const js = ts.transpileModule(fonte, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const mod = new Module(`${nome}.js`);
    mod._compile(js, `${nome}.js`);
    return mod.exports;
  }
  if (typeof Module.stripTypeScriptTypes !== "function") throw new Error("Sem o pacote typescript e sem module.stripTypeScriptTypes (Node 22.13+): rode `npm ci` em site/ ou use um Node mais novo.");
  const js = Module.stripTypeScriptTypes(fonte, { mode: "strip" });
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
}

module.exports = { carregarTs, comTypescript: Boolean(ts) };
