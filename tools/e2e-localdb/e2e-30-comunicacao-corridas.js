// e2e-30-comunicacao-corridas.js — v7.12 (Comunicação): corridas de verdade (N processos node, cada um com a sua conexão ao SQL Server) sobre a base "cenario-pastoral" + 150.
// Seis rodadas da fila ao mesmo tempo nunca mandam o mesmo e-mail duas vezes nem passam do teto da hora; o mesmo envio disparado em quatro processos vira UM envio; quatro mudanças
// de consentimento da mesma pessoa ao mesmo tempo terminam num estado que uma ordem qualquer produziria (sem erro, sem linha repetida).
// Cada processo filho roda este mesmo arquivo com o primeiro argumento "filho".
process.env.AUTH_SECRET = "segredo-das-corridas-da-comunicacao-" + "x".repeat(24);
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const L = require("./lib");
const { path, API } = L;
const db = require(path.join(API, "shared/comunicacaoDb.js"));
const cm = require(path.join(API, "shared/comunicacao.js"));
const VER_GERAL = { membroId: 1002, gestao: true, geral: true, podeVerCongregacao: () => true };

async function filho() {
  const spec = JSON.parse(process.argv[3]);
  const pool = await L.obterPool();
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  let resultado;
  try {
    if (spec.tipo === "rodada") {
      const deps = { enviarEmail: async (m) => { fs.appendFileSync(spec.arquivo, `${m.email}|${m.assunto}\n`); return { ok: true }; }, enviarPush: async () => 1 };
      resultado = await db.processarFila(pool, { deps });
    } else if (spec.tipo === "enviar") {
      resultado = await db.enviar(pool, { ver: VER_GERAL, dados: spec.dados, deps: { enviarEmail: async () => ({ limite: true }), enviarPush: async () => 1 } });
      resultado = { sucesso: resultado.sucesso, envioId: resultado.envioId, repetido: resultado.repetido };
    } else if (spec.tipo === "preferencias") {
      resultado = await db.salvarPreferencias(pool, { membroId: spec.membroId, dados: { mudancas: spec.mudancas }, ip: null });
      resultado = { sucesso: resultado.sucesso, gravadas: resultado.gravadas, limite: resultado.limite };
    }
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: true, resultado }) + "\n");
  } catch (e) {
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: false, erro: e && e.message }) + "\n");
  }
  L.shimEncerrar();
}

async function disparar(specs) {
  const t0 = Date.now() + 6000 + specs.length * 700;
  return Promise.all(specs.map((spec) => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-r", path.join(__dirname, "shim-mssql.js"), __filename, "filho", JSON.stringify({ ...spec, t0 })], { env: process.env });
    let saida = ""; p.stdout.on("data", (d) => { saida += d; });
    p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { ok: false, erro: "sem resultado" }); });
  })));
}

async function principal() {
  const { ok, fim, q, escalar, obterPool } = L;
  const pool = await obterPool();
  const c1 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'");
  await q("UPDATE Prazos SET Dias = 7 WHERE Sigla = 'COMUNICACAO_EMAILS_POR_RODADA'; UPDATE Prazos SET Dias = 12 WHERE Sigla = 'COMUNICACAO_EMAILS_POR_HORA'");
  // todo adulto ativo da Central com e-mail autoriza "eventos" por e-mail (direto no banco: aqui o assunto é a fila)
  await q(`INSERT INTO ComunicacaoConsentimentos (MembroId, Canal, Categoria, Concedido, Origem, TextoVersao, TextoHash)
           SELECT m.MembroId, 'EMAIL', 'EVENTOS', 1, 'MEU_PAINEL', @v, @h FROM MembroReferencia m WHERE m.CongregacaoId = @c AND m.Status = 'ATIVO' AND m.Email IS NOT NULL`,
    { v: cm.TEXTO_VERSAO, h: cm.hashDoTexto("EVENTOS"), c: c1 });
  const modelo = (await db.salvarModelo(pool, { ver: VER_GERAL, dados: { categoria: "EVENTOS", titulo: "Corrida da fila", corpo: "Olá, {{primeiro_nome}}: teste das corridas da fila." } })).modelo.modeloId;
  await db.aprovarModelo(pool, { ver: VER_GERAL, modeloId: modelo });
  const criterios = { territorio: { tipo: "CONGREGACAO", ids: [c1] } };

  console.log("== o mesmo envio em quatro processos ==");
  let rs = await disparar(Array.from({ length: 4 }, () => ({ tipo: "enviar", dados: { modeloId: modelo, criterios } })));
  ok(rs.every((r) => r.ok && r.resultado.sucesso), "os quatro terminam sem erro", rs);
  const ids = new Set(rs.map((r) => r.resultado.envioId));
  ok(ids.size === 1 && rs.filter((r) => !r.resultado.repetido).length === 1, "um envio só; os outros três recebem \"é o mesmo\"", rs.map((r) => r.resultado));
  const envioId = [...ids][0];
  const naFila = await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND Canal = 'EMAIL' AND Situacao = 'PENDENTE'", { e: envioId });
  ok(naFila >= 12, `há ${naFila} e-mails na fila (o serviço "recusou por excesso" na primeira rodada)`);

  console.log("== seis rodadas da fila ao mesmo tempo ==");
  const arquivo = path.join(os.tmpdir(), `e2e-30-emails-${process.pid}.txt`);
  fs.writeFileSync(arquivo, "");
  rs = await disparar(Array.from({ length: 6 }, () => ({ tipo: "rodada", arquivo })));
  ok(rs.every((r) => r.ok), "as seis rodadas terminam sem erro", rs.filter((r) => !r.ok));
  const linhas = fs.readFileSync(arquivo, "utf8").split("\n").filter(Boolean);
  fs.unlinkSync(arquivo);
  ok(new Set(linhas).size === linhas.length, `nenhum e-mail saiu duas vezes (${linhas.length} enviados)`);
  ok(linhas.length === 12, "o teto da HORA (12) vale para todas as rodadas juntas, e foi usado até o fim", linhas.length);
  const aceitos = await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND Canal = 'EMAIL' AND Situacao = 'ACEITO'", { e: envioId });
  ok(aceitos === linhas.length, "o banco registra exatamente o que saiu", { aceitos });
  ok((await escalar("SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @e AND Situacao = 'ENVIANDO'", { e: envioId })) === 0, "nada ficou preso em \"enviando\"");

  console.log("== quatro mudanças de consentimento da mesma pessoa ==");
  const h = cm.hashDoTexto("DEVOCIONAL");
  rs = await disparar([true, false, true, false].map((s) => ({ tipo: "preferencias", membroId: 8013, mudancas: [{ canal: "PUSH", categoria: "DEVOCIONAL", concedido: s, hash: h }] })));
  ok(rs.every((r) => r.ok && (r.resultado.sucesso || r.resultado.limite)), "as quatro terminam sem erro (ou \"tente de novo\")", rs.map((r) => r.resultado));
  const hist = (await q("SELECT CAST(Concedido AS INT) AS s FROM ComunicacaoConsentimentos WHERE MembroId = 8013 AND Canal = 'PUSH' AND Categoria = 'DEVOCIONAL' ORDER BY ConsentimentoId")).map((l) => l.s);
  ok(hist.length >= 1 && hist[0] === 1 && hist.every((s, i) => i === 0 || s !== hist[i - 1]), "o histórico alterna (nunca dois \"sim\" ou dois \"não\" seguidos) e começa num \"sim\"", hist);

  fim("e2e-30 (corridas da comunicação)");
}

(process.argv[2] === "filho" ? filho() : principal()).catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
