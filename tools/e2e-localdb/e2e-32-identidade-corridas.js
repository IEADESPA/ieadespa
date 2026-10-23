// e2e-32-identidade-corridas.js — v7.14 (Identidade Visual): corridas de verdade (N processos node, cada um com a sua conexão ao SQL Server) sobre a base "cenario-pastoral" + 151.
// Seis sugestões da MESMA pessoa ao mesmo tempo: entram 3; o MESMO tema mandado por seis pessoas ao mesmo tempo: entra 1; oito pessoas com temas diferentes: entram as 8.
// A votação aberta por quatro acessos juntos no dia 22: UMA enquete; a mesma pessoa votando quatro vezes ao mesmo tempo: UM voto, sem erro; a rotina e três acessos fechando
// e apurando juntos depois do dia 30: UMA apuração; quatro artes da mesma pessoa juntas: no máximo 3; dois registros do resultado juntos: UM.
// Cada processo filho roda este mesmo arquivo com o primeiro argumento "filho".
process.env.AUTH_SECRET = "segredo-das-corridas-da-identidade-" + "x".repeat(24);
const { spawn } = require("child_process");
const L = require("./lib");
const { path, API } = L;
const db = require(path.join(API, "shared/identidadeVisualDb.js"));
const H = require(path.join(API, "GestaoIdentidadeVisual/index.js"));
const ENQ = require(path.join(API, "GestaoEnquetes/index.js"));
const ARMAZEM = { salvarDocumento: async () => `https://blob.e2e/documentos/doc-${process.pid}-${Math.random().toString(36).slice(2)}`, excluirDocumento: async () => { }, urlDocumentoComSas: (u) => u };
const pedaco = (tipo, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(tipo, 4, "latin1"); d.copy(b, 8); return b; };
const png = (semente) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pedaco("IHDR", Buffer.alloc(13, 1)), pedaco("IDAT", Buffer.alloc(120, semente)), pedaco("IEND", Buffer.alloc(0))]).toString("base64");

async function filho() {
  const spec = JSON.parse(process.argv[3]);
  const agora = new Date(spec.agora);
  db.usarRelogio(() => agora);
  db.usarArmazenamento(ARMAZEM);
  const pool = await L.obterPool();
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  let resultado;
  try {
    if (spec.tipo === "rota") {
      const token = spec.geral ? L.GERAL(spec.membroId, ["identidade_visual"]) : L.PIN(spec.membroId);
      const r = await L.chamar(H, { acao: spec.acao, metodo: spec.metodo || "POST", token, corpo: spec.corpo });
      resultado = { status: r.status, sucesso: r.body && r.body.sucesso, mensagem: r.body && r.body.mensagem, jaExistia: r.body && r.body.jaExistia, votacao: r.body && r.body.votacao ? { enqueteId: r.body.votacao.enqueteId } : undefined };
    } else if (spec.tipo === "votar") {
      const ctx = { bindingData: { id: String(spec.enqueteId), acao: "votar" }, log: { error() { } } };
      await ENQ(ctx, { method: "POST", query: {}, body: { respostas: [{ perguntaId: spec.perguntaId, opcaoId: spec.opcaoId }] }, headers: { "x-auth-token": L.PIN(spec.membroId) } });
      resultado = { status: ctx.res.status, sucesso: ctx.res.body.sucesso, mensagem: ctx.res.body.mensagem };
    } else if (spec.tipo === "rotina") {
      const r = await db.rotinaDiaria(pool, { agora });
      resultado = { falhas: r.falhas, apuradas: r.apuradas, votacoesAbertas: r.votacoesAbertas };
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
  await q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento)
    SELECT 9100 + n, CONCAT(N'Corrida ', n, N' E2E'), @c, 'ATIVO', 'EM_COMUNHAO', '1985-01-01' FROM (SELECT TOP 30 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS n FROM sys.all_objects) x
    WHERE NOT EXISTS (SELECT 1 FROM MembroReferencia WHERE MembroId = 9100 + n)`, { c: c1 });
  db.usarRelogio(() => new Date("2027-10-20T12:00:00Z"));
  const ciclo = await db.abrirCiclo(pool, { ver: { membroId: 1002 }, anoAlvo: 2028 });
  ok(ciclo.sucesso, "ciclo de 2028 aberto", ciclo);
  const CICLO = ciclo.cicloId;
  const NOV05 = "2027-11-05T12:00:00Z";

  console.log("== a mesma pessoa, seis sugestões ao mesmo tempo ==");
  let rs = await disparar(Array.from({ length: 6 }, (_, i) => ({ tipo: "rota", acao: "sugerir", membroId: 9100, corpo: { texto: `Tema da corrida número ${i + 1}` }, agora: NOV05 })));
  ok(rs.every((r) => r.ok && [201, 422, 429].includes(r.resultado.status)), "as seis terminam sem erro (201, recusa ou \"tente de novo\")", rs.map((r) => r.resultado || r.erro));
  const daPessoa = await escalar("SELECT COUNT(*) FROM IdentidadeSugestoes WHERE CicloId = @c AND MembroId = 9100 AND Status <> 'RETIRADA'", { c: CICLO });
  ok(daPessoa === 3 && rs.filter((r) => r.resultado.status === 201).length === 3, "entram exatamente 3 (o máximo)", { daPessoa, status: rs.map((r) => r.resultado.status) });

  console.log("== o mesmo tema, seis pessoas ao mesmo tempo ==");
  rs = await disparar(Array.from({ length: 6 }, (_, i) => ({ tipo: "rota", acao: "sugerir", membroId: 9101 + i, corpo: { texto: i % 2 ? "Unidos pela fé" : "UNIDOS, pela FÉ!" }, agora: NOV05 })));
  ok(rs.every((r) => r.ok && [201, 422, 429].includes(r.resultado.status)), "as seis terminam sem erro", rs.map((r) => r.resultado || r.erro));
  ok((await escalar("SELECT COUNT(*) FROM IdentidadeSugestoes WHERE CicloId = @c AND TextoNormalizado = N'unidos pela fe'", { c: CICLO })) === 1 && rs.filter((r) => r.resultado.status === 201).length === 1,
    "entra UMA (as outras: \"já foi sugerido\")", rs.map((r) => r.resultado.status));

  console.log("== oito pessoas, temas diferentes, ao mesmo tempo ==");
  const temas = ["Raízes profundas", "Luz nas nações", "Servir com alegria", "Colheita abundante", "Família no altar", "Firmes na rocha", "Vidas transformadas", "Avivamento já"];
  rs = await disparar(temas.map((t, i) => ({ tipo: "rota", acao: "sugerir", membroId: 9110 + i, corpo: { texto: t }, agora: NOV05 })));
  ok(rs.every((r) => r.ok && r.resultado.status === 201), "as oito entram (a trava do ciclo só põe em fila, não recusa)", rs.map((r) => r.resultado || r.erro));

  console.log("== cancelar o ciclo × mandar sugestão, ao mesmo tempo (a mesma trava do ciclo) ==");
  db.usarRelogio(() => new Date("2028-11-03T12:00:00Z"));
  const c29 = await db.abrirCiclo(pool, { ver: { membroId: 1002 }, anoAlvo: 2029 });
  const NOV03 = "2028-11-03T12:00:00Z";
  rs = await disparar([{ tipo: "rota", acao: "cancelar-ciclo", geral: true, membroId: 1002, corpo: { cicloId: c29.cicloId }, agora: NOV03 },
    ...Array.from({ length: 3 }, (_, i) => ({ tipo: "rota", acao: "sugerir", membroId: 9110 + i, corpo: { texto: `Corrida do cancelamento ${i + 1}` }, agora: NOV03 }))]);
  ok(rs.every((r) => r.ok && [200, 201, 422, 429].includes(r.resultado.status)), "(revisão) os quatro terminam sem erro (nada de 500 da chave estrangeira)", rs.map((r) => r.resultado || r.erro));
  const existe29 = await escalar("SELECT COUNT(*) FROM IdentidadeCiclos WHERE CicloId = @c", { c: c29.cicloId });
  const sug29 = await escalar("SELECT COUNT(*) FROM IdentidadeSugestoes WHERE CicloId = @c", { c: c29.cicloId });
  ok((existe29 === 0 && sug29 === 0 && rs[0].resultado.status === 200) || (existe29 === 1 && sug29 > 0 && rs[0].resultado.status === 422),
    "(revisão) ou o ciclo saiu sem nenhuma sugestão, ou ficou com elas e o cancelamento foi recusado", { existe29, sug29, cancelar: rs[0].resultado });

  console.log("== quatro acessos no dia 22 abrem a votação: uma enquete só ==");
  await db.triar(pool, { ver: { membroId: 1002 }, dados: { sugestaoId: await escalar("SELECT SugestaoId FROM IdentidadeSugestoes WHERE TextoNormalizado = N'raizes profundas'"), decisao: "FINALISTA" }, fatorRecente: true, agora: new Date("2027-11-17T12:00:00Z") });
  await db.triar(pool, { ver: { membroId: 1002 }, dados: { sugestaoId: await escalar("SELECT SugestaoId FROM IdentidadeSugestoes WHERE TextoNormalizado = N'luz nas nacoes'"), decisao: "FINALISTA" }, fatorRecente: true, agora: new Date("2027-11-17T12:00:00Z") });
  // a votação só abre sozinha com a triagem completa: as outras sugestões são descartadas (direto no banco: aqui o assunto é a corrida da abertura)
  await q("UPDATE IdentidadeSugestoes SET Status = 'DESCARTADA', Criterio = 1, TriadoPorMembroId = 1002, TriadoEm = SYSUTCDATETIME() WHERE CicloId = @c AND Status = 'ENVIADA'", { c: CICLO });
  const NOV22 = "2027-11-22T12:00:00Z";
  rs = await disparar([...Array.from({ length: 3 }, (_, i) => ({ tipo: "rota", acao: "meu", metodo: "GET", membroId: 9120 + i, agora: NOV22 })), { tipo: "rotina", agora: NOV22 }]);
  ok(rs.every((r) => r.ok && (r.resultado.status === 200 || Array.isArray(r.resultado.falhas))), "os quatro terminam sem erro", rs.map((r) => r.resultado || r.erro));
  ok((await escalar("SELECT COUNT(*) FROM Enquetes WHERE Titulo = N'Tema da Identidade Visual de 2028'")) === 1 && (await escalar("SELECT COUNT(*) FROM IdentidadeCiclos WHERE CicloId = @c AND EnqueteId IS NOT NULL", { c: CICLO })) === 1,
    "UMA enquete, ligada ao ciclo");
  ok((await escalar("SELECT COUNT(*) FROM OpcoesEnquete o JOIN PerguntasEnquete p ON p.PerguntaId = o.PerguntaId JOIN IdentidadeCiclos c ON c.EnqueteId = p.EnqueteId WHERE c.CicloId = @c", { c: CICLO })) === 2, "com as 2 finalistas (nenhuma opção órfã de outra tentativa)");
  const enq = await L.um("SELECT c.EnqueteId, p.PerguntaId FROM IdentidadeCiclos c JOIN PerguntasEnquete p ON p.EnqueteId = c.EnqueteId WHERE c.CicloId = @c", { c: CICLO });
  const opcoes = (await q("SELECT OpcaoId FROM OpcoesEnquete WHERE PerguntaId = @p ORDER BY OpcaoId", { p: enq.PerguntaId })).map((o) => o.OpcaoId);

  console.log("== a mesma pessoa vota quatro vezes ao mesmo tempo ==");
  rs = await disparar(Array.from({ length: 4 }, (_, i) => ({ tipo: "votar", membroId: 9125, enqueteId: enq.EnqueteId, perguntaId: enq.PerguntaId, opcaoId: opcoes[i % 2], agora: NOV22 })));
  ok(rs.every((r) => r.ok && r.resultado.status === 200), "os quatro terminam sem erro (nada de 500)", rs.map((r) => r.resultado || r.erro));
  ok((await escalar("SELECT COUNT(*) FROM RespostasEnquete WHERE PerguntaId = @p AND MembroId = 9125", { p: enq.PerguntaId })) === 1 && rs.filter((r) => r.resultado.sucesso).length === 1,
    "UM voto; os outros três: \"já respondeu\"", rs.map((r) => r.resultado.mensagem));
  rs = await disparar(Array.from({ length: 6 }, (_, i) => ({ tipo: "votar", membroId: 9100 + i, enqueteId: enq.EnqueteId, perguntaId: enq.PerguntaId, opcaoId: opcoes[0], agora: NOV22 })));
  ok(rs.every((r) => r.ok && r.resultado.sucesso), "seis pessoas diferentes votando juntas: os seis votos entram", rs.map((r) => r.resultado || r.erro));

  console.log("== a rotina e três acessos fecham e apuram juntos depois do dia 30 ==");
  const DEZ01 = "2027-12-01T10:00:00Z";
  // o banco "chega" à data marcada (a apuração decide pela hora do banco)
  await q("UPDATE Enquetes SET DataFechamentoPrevista = SYSUTCDATETIME() WHERE EnqueteId = @e", { e: enq.EnqueteId });
  rs = await disparar([{ tipo: "rotina", agora: DEZ01 }, { tipo: "rotina", agora: DEZ01 }, ...Array.from({ length: 2 }, (_, i) => ({ tipo: "rota", acao: "meu", metodo: "GET", membroId: 9126 + i, agora: DEZ01 }))]);
  ok(rs.every((r) => r.ok && (r.resultado.status === 200 || (Array.isArray(r.resultado.falhas) && r.resultado.falhas.length === 0))), "os quatro terminam sem erro", rs.map((r) => r.resultado || r.erro));
  const ap = await L.um("SELECT Apuracao, VotosTotal, TemaTexto, TemaVotos FROM IdentidadeCiclos WHERE CicloId = @c", { c: CICLO });
  ok(ap.Apuracao === "VENCEDOR" && ap.VotosTotal === 7 && ap.TemaVotos >= 6, "UMA apuração, com os 7 votos", ap);
  ok(rs.filter((r) => r.resultado.apuradas === 1).length <= 1, "no máximo uma rotina diz que apurou");
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = 'IdentidadeCiclos' AND RegistroId = @c AND Acao = 'IDENTIDADE_VOTACAO_APURADA'", { c: CICLO })) === 1, "e a auditoria registra uma só");
  ok((await escalar("SELECT Status FROM Enquetes WHERE EnqueteId = @e", { e: enq.EnqueteId })) === "ENCERRADA", "a enquete fechou");

  console.log("== quatro artes da mesma pessoa ao mesmo tempo ==");
  db.usarRelogio(() => new Date(DEZ01));
  await db.salvarCor(pool, { ver: { membroId: 1002 }, cicloId: CICLO, dados: { ordem: 1, nome: "Azul", hex: "#112255" } });
  rs = await disparar(Array.from({ length: 4 }, (_, i) => ({ tipo: "rota", acao: "arte", membroId: 9129, corpo: { imagemBase64: png(i + 1), tipo: "image/png" }, agora: DEZ01 })));
  ok(rs.every((r) => r.ok && [201, 422, 429].includes(r.resultado.status)), "as quatro terminam sem erro", rs.map((r) => r.resultado || r.erro));
  ok((await escalar("SELECT COUNT(*) FROM IdentidadeArtes WHERE CicloId = @c AND MembroId = 9129 AND Status = 'ENVIADA'", { c: CICLO })) === 3, "entram no máximo 3");

  console.log("== dois registros do resultado ao mesmo tempo ==");
  const arte = await escalar("SELECT TOP 1 ArteId FROM IdentidadeArtes WHERE CicloId = @c AND Status = 'ENVIADA'", { c: CICLO });
  const cor = await escalar("SELECT CorId FROM IdentidadeCores WHERE CicloId = @c", { c: CICLO });
  const DEZ20 = "2027-12-20T12:00:00Z";
  rs = await disparar(Array.from({ length: 2 }, () => ({ tipo: "rota", acao: "resultado", geral: true, membroId: 1002, corpo: { cicloId: CICLO, arteId: arte, corId: cor, dataCulto: "2027-12-19", ocasiao: "VIGILIA", votosVencedor: 50 }, agora: DEZ20 })));
  ok(rs.every((r) => r.ok && [201, 422, 409, 429].includes(r.resultado.status)), "os dois terminam sem erro", rs.map((r) => r.resultado || r.erro));
  ok((await escalar("SELECT COUNT(*) FROM IdentidadeResultados WHERE CicloId = @c", { c: CICLO })) === 1 && (await escalar("SELECT COUNT(*) FROM IdentidadeTemasUsados WHERE Ano = 2028")) === 1
    && rs.filter((r) => r.resultado.status === 201).length === 1, "UM resultado e UM tema na lista", rs.map((r) => r.resultado.status));

  fim("e2e-32 (corridas da identidade visual)");
}

(process.argv[2] === "filho" ? filho() : principal()).catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
