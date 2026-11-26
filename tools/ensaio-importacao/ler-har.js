// tools/ensaio-importacao/ler-har.js — lê o arquivo HAR que o navegador grava (F12 → Rede → "Exportar HAR") durante o ensaio da importação na homologação
// e mostra o tempo de cada pedido à rota da importação: a prévia, a confirmação e cada lote (missão C, 26/11/2026; docs/plano/ensaio-importacao-05-12.md).
// Só lê os tempos, o método, o caminho e o código da resposta. O HAR tem o corpo dos pedidos (o arquivo da massa e as respostas): apague o HAR depois
// do ensaio e nunca o mande para o repositório.
//
// Uso: node ler-har.js <ensaio.har> [--json saida.json]
"use strict";
const fs = require("fs");

function lerHar(texto) {
  const har = JSON.parse(texto);
  const entradas = (har.log && har.log.entries) || [];
  return entradas
    .filter((e) => /\/api\/importacao-membros(\/|\?|$)/.test(e.request.url))
    .map((e) => {
      const u = new URL(e.request.url);
      const acao = u.pathname.replace(/^.*\/api\/importacao-membros\/?/, "") || "estado";
      const t = e.timings || {};
      return { inicio: e.startedDateTime, metodo: e.request.method, acao, status: e.response.status, totalMs: Math.round(e.time),
        esperaMs: Math.round(t.wait || 0), corpoPedidoBytes: e.request.bodySize > 0 ? e.request.bodySize : (e.request.postData && e.request.postData.text ? Buffer.byteLength(e.request.postData.text) : 0) };
    })
    .sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
}

function resumir(pedidos) {
  const lotes = pedidos.filter((p) => p.metodo === "POST" && p.acao === "lote");
  const ms = lotes.map((l) => l.esperaMs).sort((a, b) => a - b);
  const p = (q) => (ms.length ? ms[Math.min(ms.length - 1, Math.ceil((q / 100) * ms.length) - 1)] : 0);
  const primeiro = pedidos.find((x) => x.metodo === "POST" && x.acao === "previa");
  const ultimo = lotes[lotes.length - 1];
  return {
    previa: primeiro ? { esperaMs: primeiro.esperaMs, status: primeiro.status, corpoPedidoBytes: primeiro.corpoPedidoBytes } : null,
    lotes: { quantos: lotes.length, comErro: lotes.filter((l) => l.status !== 200).length, mediaMs: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : 0,
      p95Ms: p(95), maxMs: ms.length ? ms[ms.length - 1] : 0, acima30s: ms.filter((v) => v >= 30000).length, acima45s: ms.filter((v) => v >= 45000).length },
    duracaoTotalMin: primeiro && ultimo ? Math.round(((new Date(ultimo.inicio) - new Date(primeiro.inicio)) / 60000) * 10) / 10 : null
  };
}

if (require.main === module) {
  const [arquivo, opcao, saida] = process.argv.slice(2);
  if (!arquivo) { console.log("uso: node ler-har.js <ensaio.har> [--json saida.json]"); process.exit(2); }
  const pedidos = lerHar(fs.readFileSync(arquivo, "utf8"));
  const r = resumir(pedidos);
  for (const p of pedidos) console.log(`${p.inicio}  ${p.metodo.padEnd(4)} ${p.acao.padEnd(10)} ${p.status}  espera ${String(p.esperaMs).padStart(6)} ms  total ${String(p.totalMs).padStart(6)} ms`);
  console.log(JSON.stringify(r, null, 2));
  if (opcao === "--json" && saida) fs.writeFileSync(saida, JSON.stringify({ resumo: r, pedidos }, null, 2));
}

module.exports = { lerHar, resumir };
