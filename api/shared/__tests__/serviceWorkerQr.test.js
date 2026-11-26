// Volta 10 do Membros (importante 3 do portão v9): o service worker não guarda no aparelho o endereço das páginas públicas que levam um código no endereço.
// O código do QR da carteirinha (conferir.html?c=...) nunca vence e abre o nome, a foto e a situação de uma pessoa: quem confere com um aparelho que já abriu o
// aplicativo (o porteiro, a secretaria) não pode ficar com a lista dos códigos lidos no armazenamento do navegador. O mesmo já valia para o certificado
// (verificar.html) e para a credencial (credencial.html).
// O teste RODA o app/service-worker.js de verdade, com o cache e a rede de mentira, e olha o que ele intercepta e o que guarda.
const fs = require("fs");
const path = require("path");

const FONTE = fs.readFileSync(path.join(__dirname, "../../../app/service-worker.js"), "utf8");

function carregar() {
  const ouvintes = {};
  const guardados = [];
  const self = { addEventListener: (n, f) => { ouvintes[n] = f; }, location: { origin: "https://app.exemplo" }, skipWaiting() {}, clients: { claim() {} }, registration: {} };
  const caches = {
    open: async () => ({ put: async (req) => { guardados.push(req.url); }, addAll: async () => {}, match: async () => null }),
    keys: async () => [], match: async () => null, delete: async () => true
  };
  const fetch = async () => ({ clone: () => ({}) });
  new Function("self", "caches", "fetch", "URL", "Response", FONTE)(self, caches, fetch, URL, { error: () => ({}) });
  async function pedir(caminho) {
    let interceptou = false;
    let promessa = null;
    const ev = { request: { url: "https://app.exemplo" + caminho, method: "GET", mode: "navigate" }, respondWith: (p) => { interceptou = true; promessa = p; } };
    ouvintes.fetch(ev);
    if (promessa) await promessa;
    await new Promise((r) => setTimeout(r, 5));
    return interceptou;
  }
  return { pedir, guardados };
}

describe("o service worker e as páginas públicas com código no endereço", () => {
  test.each([
    "/conferir.html?c=ABCD1234EFGH5678",
    "/conferir.html",
    "/conferir.js",
    "/credencial.html?c=ABCD1234EFGH5678",
    "/credencial.js",
    "/verificar.html?c=X1Y2Z3"
  ])("%s passa direto: o service worker não intercepta nem guarda", async (caminho) => {
    const sw = carregar();
    expect(await sw.pedir(caminho)).toBe(false);
    expect(sw.guardados).toEqual([]);
  });

  test("controle: a casca (index.html) continua passando pelo service worker, com a rede primeiro e a cópia guardada", async () => {
    const sw = carregar();
    expect(await sw.pedir("/index.html")).toBe(true);
    expect(sw.guardados).toEqual(["https://app.exemplo/index.html"]);
  });

  test("o comentário diz o mesmo que o código: a página do QR da carteirinha não entra no cache", () => {
    expect(FONTE).toMatch(/conferir\.html[^\n]*não entra no cache/);
    expect(FONTE).toMatch(/url\.pathname === "\/conferir\.html" \|\| url\.pathname === "\/conferir\.js"\) return;/);
  });
});
