// só a sondagem do modo remoto: node so-sondagem.js <url>
const path = require("path");
const { criarRemoto } = require("./servidor");
const { abrirNavegador } = require("./cobertor");
const { sondarRemoto } = require("./remoto");
(async () => {
  const url = process.argv[2];
  const nav = await abrirNavegador(path.join(__dirname, "perfis-edge", "sondagem"), { remoto: true });
  const r = await sondarRemoto(nav, criarRemoto({ url, permissoes: [] }), console.log);
  console.log("pedidos a /api interceptados:", r.apiInterceptada);
  await nav.close();
})().catch(e => { console.error(e); process.exit(3); });
