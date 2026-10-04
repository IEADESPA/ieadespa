// teste rápido do equipamento: entra como geral na ORIGINAL e mostra o que viu
const path = require("path");
const { criarServidor } = require("./servidor");
const { abrirNavegador, executarAcao, arquivosDeTeste } = require("./cobertor");
const modelo = require("./modelo-respostas.json");
(async () => {
  const pasta = process.argv[2] || path.join(__dirname, "original", "app");
  const perfil = process.argv[3] || "geral";
  const srv = await criarServidor({ raiz: pasta, porta: 47811, csp: process.argv.includes("--csp"), permissoes: modelo.permissoes });
  const nav = await abrirNavegador(path.join(__dirname, "perfil-edge-fumaca"));
  const arqs = arquivosDeTeste();
  const t0 = Date.now();
  const tr = await executarAcao(nav, srv, modelo, arqs, { id: perfil + ":0", perfil, caminho: [], alvo: null });
  console.log("ms", Date.now() - t0, "instavel", tr.instavel, "falha", tr.falhaDoEquipamento);
  console.log("api", tr.api.length, tr.api.slice(0, 12));
  console.log("erros", tr.erros, "csp", tr.csp, "recursos", tr.recursos, "toasts", tr.toasts, "dialogos", tr.dialogos);
  console.log("titulo", tr.retrato && tr.retrato.titulo, tr.retrato && tr.retrato.contagens);
  console.log("controles", tr.controlesDepois && tr.controlesDepois.length);
  if (tr.controlesDepois) console.log(tr.controlesDepois.slice(0, 80).map(c => `${c.tag} ${c.rotulo} #${c.ord} [${c.eventos}] ${c.fonte} ${JSON.stringify(c.codigo).slice(0, 70)}`).join("\n"));
  console.log((tr.retrato && tr.retrato.texto || "").slice(0, 1500));
  await nav.close(); await srv.fechar();
})();
