// e2e-82-doacoes-recibo.js — o número do recibo de doação (FASE 10, 12/11/2026): nasce numa transação com a faixa do ano travada e é o MAIOR número do ano
// + 1. Antes era a CONTAGEM + 1 sem trava: dois registros ao mesmo tempo, ou um buraco na sequência, davam o mesmo número e o índice único de
// Doacoes.NumeroRecibo derrubava a gravação (erro 500). Corridas de verdade: N processos node, cada um com a sua conexão (cada filho roda este arquivo com
// "filho"). Roda sobre qualquer base com a migração 072 (ex.: `BASE=cenario-172 bash rodar.sh roteiro e2e-82-doacoes-recibo.js`); monta o próprio cenário.
process.env.AUTH_SECRET = "segredo-das-corridas-das-doacoes-" + "x".repeat(24);
const { spawn } = require("child_process");
const L = require("./lib");
const { ok, fim, q, escalar, obterPool, path } = L;
const ANO = 2031;   // um ano sem nenhuma doação na base: a numeração começa limpa
const TOKEN = () => L.GERAL(1002, ["financeiro"]);
const corpo = (n) => ({ valor: 10 + n, formaPagamento: "PIX", dataRecebimento: `${ANO}-03-0${1 + (n % 9)}`, doadorNome: `Doador E2E ${n}` });

async function filho() {
  const spec = JSON.parse(process.argv[3]);
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  try {
    const res = await chamarRota("GestaoDoacoes/index.js", { metodo: "POST", binding: {}, token: TOKEN(), corpo: corpo(spec.n) });
    const b = res.body || {};
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: true, status: res.status, sucesso: b.sucesso, recibo: b.numeroRecibo, mensagem: b.mensagem }) + "\n");
  } catch (e) {
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: false, erro: e && e.message }) + "\n");
  }
  L.shimEncerrar();
}

async function disparar(n) {
  const t0 = Date.now() + 7000 + n * 800;
  return Promise.all(Array.from({ length: n }, (_, i) => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-r", path.join(__dirname, "shim-mssql.js"), __filename, "filho", JSON.stringify({ n: i, t0 })], { env: process.env });
    let saida = ""; p.stdout.on("data", (d) => { saida += d; });
    p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { ok: false, erro: "sem resultado" }); });
  })));
}

async function principal() {
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  const POST = (n) => chamarRota("GestaoDoacoes/index.js", { metodo: "POST", binding: {}, token: TOKEN(), corpo: corpo(n) });
  const recibos = async () => (await L.q(`SELECT NumeroRecibo FROM Doacoes WHERE NumeroRecibo LIKE 'DOA-${ANO}-%' ORDER BY NumeroRecibo`)).map((x) => x.NumeroRecibo);

  console.log("== em sequência ==");
  ok((await recibos()).length === 0, `o ano ${ANO} começa sem recibo`);
  const a = await POST(1), b = await POST(2);
  ok(a.status === 201 && a.body.numeroRecibo === `DOA-${ANO}-00001`, "a primeira doação do ano é o recibo 00001", JSON.stringify(a.body));
  ok(b.status === 201 && b.body.numeroRecibo === `DOA-${ANO}-00002`, "a segunda é o 00002", JSON.stringify(b.body));

  console.log("== um buraco na sequência (antes: a contagem repetia um número que já existe) ==");
  await q(`INSERT INTO Doacoes (CongregacaoId, Valor, FormaPagamento, DataRecebimento, DoadorNome, NumeroRecibo, RegistradoPor)
           VALUES (NULL, 5, N'PIX', '${ANO}-02-01', N'Recibo antigo E2E', N'DOA-${ANO}-00004', 1002)`);
  const c = await POST(3);
  ok(c.status === 201 && c.body.numeroRecibo === `DOA-${ANO}-00005`, "com 00001, 00002 e 00004 existindo, o próximo é o 00005 (a regra antiga, contagem + 1, dava 00004 de novo e caía com erro)", JSON.stringify(c.body));

  console.log("== corrida: 6 registros ao mesmo tempo, cada um na sua conexão ==");
  const antes = (await recibos()).length;
  const res = await disparar(6);
  const bons = res.filter((r) => r.ok && r.status === 201 && r.sucesso);
  ok(bons.length === 6, "os 6 registros simultâneos gravam (nenhum erro 500 por número repetido)", JSON.stringify(res));
  const numeros = bons.map((r) => r.recibo);
  ok(new Set(numeros).size === 6, "os 6 recibos têm números diferentes", numeros.join(", "));
  const todos = await recibos();
  ok(todos.length === antes + 6, "no banco há exatamente 6 recibos a mais", `${antes} → ${todos.length}`);
  const esperados = Array.from({ length: 6 }, (_, i) => `DOA-${ANO}-${String(6 + i).padStart(5, "0")}`);
  ok(esperados.every((e) => todos.includes(e)), "os números novos são 00006 a 00011, sem pular e sem repetir", todos.join(", "));
  fim("e2e-82 recibo de doação");
}

if (process.argv[2] === "filho") filho(); else principal().catch((e) => { console.log("ERRO", e.message); fim("e2e-82 (abortado)"); });
