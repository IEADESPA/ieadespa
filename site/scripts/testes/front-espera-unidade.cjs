// Testes de UNIDADE da "espera sozinha" dos formulários (19/10/2026), sem navegador e sem rede: extrai `enviarComEspera` das páginas do pedido de camiseta e da inscrição em evento
// (as duas têm de ter exatamente o mesmo texto) e roda com um `fetch` de mentira. Garante: 503 com motivo "ocupado" (recusa ANTES de gravar) é repetido sozinho, com aviso de espera;
// qualquer outra resposta volta na hora (nunca se repete uma resposta que pode ter gravado: 500/502, 4xx, 200); e há um teto de tentativas.
// Como rodar (de dentro de site/):  node scripts/testes/front-espera-unidade.cjs
const fs = require("fs");
const path = require("path");

let falhas = 0;
const eq = (a, b, d) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { falhas++; console.log("  FALHA", d, "→", JSON.stringify(a), "esperado", JSON.stringify(b)); } else console.log("  ok   ", d);
};

function extrair(arquivo) {
  const texto = fs.readFileSync(path.join(__dirname, "../../src/pages", arquivo), "utf8").replace(/\r\n/g, "\n");
  const ini = texto.indexOf("async function enviarComEspera(url, init) {");
  if (ini < 0) throw new Error(arquivo + ": enviarComEspera não encontrada");
  // a função termina na primeira linha "        }" (8 espaços) depois do início
  const fim = texto.indexOf("\n        }\n", ini);
  return texto.slice(ini, fim + "\n        }".length);
}
const codigoCamiseta = extrair("camiseta/[slug].astro");
const codigoEvento = extrair("evento/[slug].astro");
eq(codigoCamiseta === codigoEvento, true, "a função é idêntica nas duas páginas (pedido de camiseta e inscrição)");

const resposta = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
function montar(respostas) {
  const chamadas = [];
  const esperas = [];
  const fetchFalso = async (url, init) => { chamadas.push([url, init]); const r = respostas[Math.min(chamadas.length - 1, respostas.length - 1)]; return typeof r === "function" ? r() : r.clone(); };
  const setTimeoutFalso = (fn, ms) => { esperas.push(ms); fn(); }; // sem esperar de verdade: registra o tempo pedido
  // eslint-disable-next-line no-new-func
  const enviarComEspera = new Function("fetch", "setTimeout", "Math", `${codigoCamiseta}; return enviarComEspera;`)(fetchFalso, setTimeoutFalso, { random: () => 0.5 });
  return { enviarComEspera, chamadas, esperas };
}

(async () => {
  console.log("== 503 'ocupado' é repetido sozinho ==");
  {
    const m = montar([resposta(503, { motivo: "ocupado", erro: "x" }), resposta(503, { motivo: "ocupado", erro: "x" }), resposta(200, { ok: true })]);
    const avisos = [];
    const r = await m.enviarComEspera("/api/x", { method: "POST", body: "{}", avisoEspera: (n) => avisos.push(n) });
    eq([r.status, m.chamadas.length, avisos], [200, 3, [1, 2]], "ocupado, ocupado, 200: devolve o 200 na 3ª tentativa e avisa a espera nas duas primeiras");
    eq(m.esperas.every((ms) => ms >= 2000 && ms <= 5000), true, "cada espera fica entre 2 e 5 segundos (e com acaso, para não voltarem todos juntos)");
    eq(Object.keys(m.chamadas[0][1]).includes("avisoEspera"), false, "o aviso NÃO vai para o fetch (só método, corpo e cabeçalhos)");
    eq(m.chamadas[0][1].body, "{}", "o corpo é reenviado igual");
  }

  console.log("== o que nunca se repete ==");
  for (const [rotulo, resp] of [["200", resposta(200, { ok: true })], ["409 esgotado", resposta(409, { motivo: "esgotado" })], ["403 encerrado", resposta(403, { erro: "fechado" })], ["429", resposta(429, {})], ["500", resposta(500, {})], ["502 (pode ter gravado)", resposta(502, { erro: "Falha" })], ["503 sem motivo", resposta(503, { erro: "Configuração" })], ["503 com outro motivo", resposta(503, { motivo: "manutencao" })]]) {
    const m = montar([resp]);
    const r = await m.enviarComEspera("/api/x", { method: "POST", body: "{}" });
    eq([r.status, m.chamadas.length], [resp.status, 1], `${rotulo}: volta na hora, UMA chamada só`);
  }

  console.log("== teto de tentativas ==");
  {
    const m = montar([resposta(503, { motivo: "ocupado" })]);
    const avisos = [];
    const r = await m.enviarComEspera("/api/x", { method: "POST", body: "{}", avisoEspera: (n) => avisos.push(n) });
    eq([r.status, m.chamadas.length, avisos.length], [503, 12, 11], "sempre ocupado: para na 12ª tentativa e devolve o 503 (a página mostra a mensagem do servidor)");
  }

  console.log("== queda de rede ==");
  {
    const m = montar([() => { throw new TypeError("Failed to fetch"); }]);
    let erro = null;
    try { await m.enviarComEspera("/api/x", { method: "POST", body: "{}" }); } catch (e) { erro = e; }
    eq([erro && erro.name, m.chamadas.length], ["TypeError", 1], "erro de rede sobe na hora como TypeError (a página manda conferir antes de reenviar), sem repetir");
  }

  console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.log("ERRO NO TESTE:", e && e.stack); process.exit(1); });
