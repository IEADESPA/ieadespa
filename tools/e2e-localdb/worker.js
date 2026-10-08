// worker.js — um processo = uma conexão própria. Espera o instante T0 e faz UMA chamada ao handler real, imprimindo { status, body }. Uso: node -r ./shim-mssql.js worker.js '<json>'
const L = require("./lib");
const { chamar, GERAL, LIDER, PIN, API, path, obterPool } = L;
const spec = JSON.parse(process.argv[2]);
const handlers = { setores: "GestaoSetoresTecnicos/index.js", vistorias: "GestaoVistoriasAntecedentes/index.js" };
(async () => {
  await obterPool();                                   // a ponte já está de pé e conectada
  const h = require(path.join(API, handlers[spec.handler]));
  const t = spec.token;
  const token = t.tipo === "PIN" ? PIN(t.membroId) : t.tipo === "GERAL" ? GERAL(t.membroId, t.permissoes) : LIDER(t.membroId, t.permissoes, t.escopo, t.nivel);
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  const r = await chamar(h, { acao: spec.acao, metodo: spec.metodo || "POST", token, corpo: spec.corpo, headers: spec.headers || {} });
  process.stdout.write("@@RESULTADO@@" + JSON.stringify({ status: r.status, mensagem: r.body && r.body.mensagem, body: r.body && r.body.sucesso !== undefined ? { sucesso: r.body.sucesso } : null }) + "\n");
  L.shimEncerrar();
})().catch((e) => { process.stdout.write("@@RESULTADO@@" + JSON.stringify({ status: 0, erro: String(e && e.message) }) + "\n"); try { L.shimEncerrar(); } catch { } process.exit(0); });
