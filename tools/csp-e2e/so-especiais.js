// roda só as peças especiais: node so-especiais.js --original <pasta> [--nova <pasta>] [--porta 47820]
const path = require("path");
const fs = require("fs");
const { gerarModelo } = require("./modelo");
const { abrirNavegador, arquivosDeTeste } = require("./cobertor");
const { rodarEspeciais } = require("./especiais");
const a = process.argv.slice(2);
const arg = (k) => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : null; };
const pastaApp = (p) => { const abs = path.resolve(p); return fs.existsSync(path.join(abs, "index.html")) ? abs : path.join(abs, "app"); };
(async () => {
  const original = pastaApp(arg("original") || path.join(__dirname, "original", "app"));
  const nova = arg("nova") ? pastaApp(arg("nova")) : null;
  const modelo = gerarModelo(path.join(original, "script.js"));
  const nav = await abrirNavegador(path.join(__dirname, "perfil-edge-especiais"));
  const r = await rodarEspeciais(nav, { original, nova, modelo, arqs: arquivosDeTeste(), porta: Number(arg("porta")) || 47820, log: console.log });
  await nav.close();
  process.exit(r.ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(3); });
