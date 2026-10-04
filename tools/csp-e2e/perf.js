// mede a vazão com B navegadores × W trabalhadores cada
const path = require("path");
const { criarServidor } = require("./servidor");
const { abrirNavegador, executarAcao, arquivosDeTeste, emParalelo, contextosDosTrabalhadores } = require("./cobertor");
const { gerarModelo } = require("./modelo");
(async () => {
  const pasta = path.join(__dirname, "original", "app");
  const modelo = gerarModelo(path.join(pasta, "script.js"));
  const srv = await criarServidor({ raiz: pasta, porta: 47830, permissoes: modelo.permissoes });
  const arqs = arquivosDeTeste();
  const acao = { id: "membro:x", perfil: "membro", caminho: [{ alvo: { tag: "button", rotulo: "#btnSubMeupainelCartas", ord: 0 }, evento: "click" }], alvo: { tag: "button", rotulo: "#btnSubMeupainelDados", ord: 0 }, evento: "click" };
  for (const [B, W] of [[1, 6], [2, 4], [4, 4], [6, 3]]) {
    const navs = await Promise.all(Array.from({ length: B }, (_, i) => abrirNavegador(path.join(__dirname, "perfil-edge-perf-" + i))));
    const ctxs = [];
    for (const nav of navs) for (const c of await contextosDosTrabalhadores(nav, W)) ctxs.push({ nav, c });
    const N = ctxs.length * 3;
    const t0 = Date.now();
    await emParalelo(Array.from({ length: N }, (_, i) => Object.assign({}, acao, { id: "membro:x" + i })), ctxs.length, (a, k, w) => executarAcao(ctxs[w].nav, srv, modelo, arqs, a, { ctx: ctxs[w].c }));
    const ms = Date.now() - t0;
    console.log(`${B} navegador(es) × ${W}: ${N} ações em ${ms} ms = ${Math.round(ms / N)} ms/ação`);
    for (const nav of navs) await nav.close();
  }
  await srv.fechar();
})();
