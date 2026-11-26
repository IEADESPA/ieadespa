// tools/ensaio-importacao/ensaio-localdb.js — o ENSAIO DA IMPORTAÇÃO no tamanho real, contra o SQL Server local (LocalDB), pela rota de verdade
// (api/ImportacaoMembros): a prévia do arquivo inteiro, a confirmação e os lotes até o fim. Mede o tempo de cada passo, as idas ao banco (cada consulta
// é uma ida; na nuvem, cada ida custa a distância entre a API e o banco), a memória do processo e as consultas mais pesadas do banco
// (sys.dm_exec_query_stats). Confere o resultado contra o gabarito da massa (gerar-massa.js). Só dados de mentira. A ponte não conta o BEGIN e o COMMIT de
// cada transação: na nuvem, são mais duas idas por chamada.
//
// Roda sobre a base cenario-188 (ou mais nova; a 188 é o índice do nascimento das fichas), com a trava do banco de teste:
//   until mkdir /c/tmp/localdb-trava 2>/dev/null; do sleep 20; done && \
//   (cd tools/e2e-localdb && BASE=cenario-188 bash rodar.sh roteiro ../ensaio-importacao/ensaio-localdb.js) ; rmdir /c/tmp/localdb-trava
// Variáveis: ENSAIO_LINHAS (padrão 6000), ENSAIO_SEMENTE, ENSAIO_SAIDA (a pasta do relatório; padrão C:/tmp/ieadespa-membros/ensaio), ENSAIO_ORCAMENTO_MS
// (os lotes chamam a camada do banco com esse orçamento de tempo, em vez da rota com o de sempre: simula a nuvem longe, com o lote cortado pelo tempo) e
// ENSAIO_FICHAS_EXTRA (padrão 0: as fichas fictícias postas no banco antes da importação. Com 0, o banco tem poucas fichas, como a produção antes da
// importação grande: é o caso em que, sem o índice da 188, a procura do mesmo nome e nascimento relia o arquivo inteiro para cada ficha. Com 5000, o
// banco fica como a massa grande da homologação, onde o plano é outro).
process.env.AUTH_SECRET = "segredo-do-ensaio-da-importacao-" + "x".repeat(24);
const fs = require("fs");
const sql = require("mssql");
const L = require("../e2e-localdb/lib");
const { chamarRota } = require("../e2e-localdb/lib-afm");
const { gerarMassa } = require("./gerar-massa");
const { ok, fim, q, escalar, obterPool } = L;

const LINHAS = Number(process.env.ENSAIO_LINHAS || 6000);
const SEMENTE = Number(process.env.ENSAIO_SEMENTE || 20261205);
const SAIDA = process.env.ENSAIO_SAIDA || "C:/tmp/ieadespa-membros/ensaio";
const ORCAMENTO = process.env.ENSAIO_ORCAMENTO_MS ? Number(process.env.ENSAIO_ORCAMENTO_MS) : null;
const FICHAS_EXTRA = Number(process.env.ENSAIO_FICHAS_EXTRA || 0);
const TETO_LEITURAS = 100000;   // páginas lidas numa execução de uma consulta: acima disso, ela lê a tabela inteira (ou mais) e não aguenta o Basic
const GERAL_ID = 9701;
const tok = () => L.GERAL(GERAL_ID, ["pessoas"]);

// as idas ao banco: cada request.query da ponte conta uma, com o tempo, dentro da fase que estiver valendo
const idas = { fase: "preparo", porFase: {} };
const queryOriginal = sql.Request.prototype.query;
sql.Request.prototype.query = async function (texto) {
  const f = (idas.porFase[idas.fase] = idas.porFase[idas.fase] || { idas: 0, ms: 0 });
  const t0 = process.hrtime.bigint();
  try { return await queryOriginal.call(this, texto); } finally { f.idas++; f.ms += Number(process.hrtime.bigint() - t0) / 1e6; }
};
const fase = (nome) => { idas.fase = nome; return idas.porFase[nome] = idas.porFase[nome] || { idas: 0, ms: 0 }; };

// a memória: a maior que o processo usou enquanto a fase rodava (amostra a cada 25 ms, mais a de antes e a de depois)
async function medirMemoria(fazer) {
  const mb = (b) => Math.round((b / 1048576) * 10) / 10;
  let pico = process.memoryUsage().rss;
  const antes = process.memoryUsage();
  const timer = setInterval(() => { pico = Math.max(pico, process.memoryUsage().rss); }, 25);
  const t0 = Date.now();
  try {
    const r = await fazer();
    pico = Math.max(pico, process.memoryUsage().rss);
    return { r, ms: Date.now() - t0, memoria: { rssAntesMb: mb(antes.rss), rssPicoMb: mb(pico), heapDepoisMb: mb(process.memoryUsage().heapUsed) } };
  } finally { clearInterval(timer); }
}

const R = (opcoes) => chamarRota("ImportacaoMembros/index.js", { token: tok(), ...opcoes });
const percentil = (lista, p) => { const o = [...lista].sort((a, b) => a - b); return o.length ? o[Math.min(o.length - 1, Math.ceil((p / 100) * o.length) - 1)] : 0; };

async function principal() {
  await obterPool();
  fs.mkdirSync(SAIDA, { recursive: true });
  const relatorio = { quando: new Date().toISOString(), linhas: LINHAS, semente: SEMENTE, banco: "LocalDB (ponte PowerShell)", orcamentoMs: ORCAMENTO };

  console.log("== o cenário ==");
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembros") === 0, "nenhuma importação na base");
  const area = (await q("INSERT INTO Areas (Nome) VALUES (N'Área Ensaio'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const nomesCongs = Array.from({ length: 45 }, (_, i) => `Congregação Ensaio ${String(i + 1).padStart(2, "0")}`);
  for (const nome of nomesCongs) await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (@n, @a)", { n: nome, a: area });
  const congSede = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = @n", { n: nomesCongs[0] });
  await q(`IF NOT EXISTS (SELECT 1 FROM MembroReferencia WHERE MembroId = @id) INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro)
    VALUES (@id, N'Secretaria Geral Ensaio', @c, N'ATIVO', N'EM_COMUNHAO')`, { id: GERAL_ID, c: congSede });
  const { texto, plantio } = gerarMassa({ linhas: LINHAS, semente: SEMENTE, congregacoes: nomesCongs });
  // as fichas que já existem e batem com linhas do arquivo (a matrícula, o CPF, o nome e o nascimento)
  for (const f of plantio.fichasNoBanco) {
    await q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, Cpf) VALUES (@id, @n, @c, N'ATIVO', N'EM_COMUNHAO', @d, @cpf)`,
      { id: f.membroId, n: f.nome, c: congSede, d: f.dataNascimento || "1970-01-01", cpf: f.cpf || null });
  }
  // as fichas que já estão no banco antes da importação (fictícias, matrículas 600001 em diante: fora da massa, das fichas plantadas e da base), com o
  // nascimento espalhado em 70 anos; nenhuma tem o nome de uma linha do arquivo
  if (FICHAS_EXTRA > 0) {
    await q(`WITH n AS (SELECT TOP (@k) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS i FROM sys.all_objects a CROSS JOIN sys.all_objects b)
      INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento)
      SELECT 600000 + n.i, CONCAT(N'Ficha Base ', n.i, N' (Fictícia)'), @c, N'ATIVO', N'EM_COMUNHAO', DATEADD(DAY, (n.i * 37) % 25550, '1940-01-01')
      FROM n WHERE NOT EXISTS (SELECT 1 FROM MembroReferencia m WHERE m.MembroId = 600000 + n.i)`, { k: FICHAS_EXTRA, c: congSede });
  }
  const fichasAntes = await escalar("SELECT COUNT(*) FROM MembroReferencia");
  relatorio.fichasNoBancoAntes = fichasAntes;
  relatorio.arquivo ={ bytes: Buffer.byteLength(texto, "utf8"), corpoJsonBytes: Buffer.byteLength(JSON.stringify({ nomeArquivo: "massa.csv", texto }), "utf8") };
  relatorio.gabarito = plantio.gabarito;
  console.log(`  massa: ${LINHAS} pessoas, ${relatorio.arquivo.bytes.toLocaleString("pt-BR")} bytes (o corpo do pedido: ${relatorio.arquivo.corpoJsonBytes.toLocaleString("pt-BR")}); ${fichasAntes} fichas no banco antes`);

  // a ida ao banco mais simples, para separar o custo da ponte do trabalho do banco
  fase("calibragem");
  const tc = Date.now();
  for (let i = 0; i < 200; i++) await q("SELECT 1 AS um");
  relatorio.idaVaziaMs = Math.round(((Date.now() - tc) / 200) * 100) / 100;
  await q("DBCC FREEPROCCACHE WITH NO_INFOMSGS");

  console.log("== a prévia do arquivo inteiro ==");
  const fp = fase("previa");
  const pv = await medirMemoria(() => R({ metodo: "POST", binding: { acao: "previa" }, corpo: { nomeArquivo: "massa-ensaio.csv", texto } }));
  ok(pv.r.status === 200 && pv.r.body.sucesso === true, "a prévia passou", pv.r.status === 200 ? undefined : pv.r.body);
  const resumo = (pv.r.body && pv.r.body.resumo) || {};
  relatorio.previa = { ms: pv.ms, idas: fp.idas, idasMs: Math.round(fp.ms), memoria: pv.memoria,
    resumo: { total: resumo.total, novas: resumo.novas, problemas: resumo.problemas, numeroNovo: resumo.numeroNovo, possivelRepetida: resumo.possivelRepetida, jaExistem: resumo.jaExistem },
    avisosGerais: (resumo.avisosGerais || []).length };
  console.log(`  ${pv.ms} ms, ${fp.idas} idas ao banco, memória: ${JSON.stringify(pv.memoria)}`);
  ok(resumo.total === plantio.gabarito.total, `o total da prévia é o do arquivo (${plantio.gabarito.total})`, resumo.total);
  ok(resumo.problemas === plantio.gabarito.problemas, `as que ficam de fora: ${plantio.gabarito.problemas} (congregação desconhecida, GERAL e vazia, sem nome, ';' solto, matrícula de outra ficha)`, resumo.problemas);
  ok(resumo.numeroNovo === plantio.gabarito.numeroNovo, `as que entram com a próxima matrícula: ${plantio.gabarito.numeroNovo} (zerada, vazia, que não é número, repetida)`, resumo.numeroNovo);
  ok(resumo.possivelRepetida >= plantio.gabarito.possivelRepetidaNoMinimo, `as possíveis repetidas: pelo menos ${plantio.gabarito.possivelRepetidaNoMinimo}`, resumo.possivelRepetida);
  const importacaoId = pv.r.body && pv.r.body.importacaoId;
  const linhasGravadas = await escalar("SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @id", { id: importacaoId });
  ok(linhasGravadas === LINHAS, "a prévia gravou uma linha por pessoa do arquivo", linhasGravadas);

  console.log("== a confirmação (428 sem o fator recente) ==");
  const fc = fase("confirmar");
  const semFator = await chamarRota("ImportacaoMembros/index.js", { metodo: "POST", binding: { acao: "confirmar" }, corpo: { importacaoId },
    token: L.sessao(GERAL_ID, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["pessoas"] }) });
  ok(semFator.status === 428, "sem o fator recente: 428", semFator.status);
  const tcf = Date.now();
  const cf = await R({ metodo: "POST", binding: { acao: "confirmar" }, corpo: { importacaoId } });
  ok(cf.status === 200 && cf.body.sucesso === true, "confirmada", cf.body);
  relatorio.confirmar = { ms: Date.now() - tcf, idas: fc.idas };

  console.log("== os lotes até o fim ==");
  const lotes = [];
  let resultado = null;
  for (let n = 1; n <= 2000 && !resultado; n++) {
    const f = fase(`lote${n}`);
    const lt = await medirMemoria(async () => {
      if (ORCAMENTO == null) return R({ metodo: "POST", binding: { acao: "lote" }, corpo: { importacaoId } });
      const camada = require(L.path.join(L.API, "shared/importacaoMembrosDb"));
      const pool = await require(L.path.join(L.API, "shared/db")).getPool();
      return { status: 200, body: await camada.importarLote(pool, { membroId: GERAL_ID }, importacaoId, { orcamentoMs: ORCAMENTO }) };
    });
    if (lt.r.status !== 200 || lt.r.body.sucesso !== true) { ok(false, `o lote ${n} passou`, lt.r.body); break; }
    lotes.push({ n, ms: lt.ms, idas: f.idas, importadas: lt.r.body.importadas, restantes: lt.r.body.restantes, rssPicoMb: lt.memoria.rssPicoMb });
    if (n === 1 || lt.r.body.concluida || n % (ORCAMENTO == null ? 5 : 25) === 0) console.log(`  lote ${n}: ${lt.ms} ms, ${f.idas} idas, ${lt.r.body.importadas} entraram, faltam ${lt.r.body.restantes}`);
    if (lt.r.body.concluida) resultado = lt.r.body.resultado;
  }
  ok(!!resultado, "a importação terminou (CONCLUIDA)");
  const tempos = lotes.map((l) => l.ms), idasLote = lotes.map((l) => l.idas);
  relatorio.lotes = { quantos: lotes.length, totalMs: tempos.reduce((a, b) => a + b, 0), mediaMs: Math.round(tempos.reduce((a, b) => a + b, 0) / (lotes.length || 1)),
    p95Ms: percentil(tempos, 95), maxMs: Math.max(0, ...tempos), idasPorLoteMedia: Math.round(idasLote.reduce((a, b) => a + b, 0) / (lotes.length || 1)),
    idasPorLoteMax: Math.max(0, ...idasLote), ultimo: lotes[lotes.length - 1] || null, rssPicoMb: Math.max(0, ...lotes.map((l) => l.rssPicoMb)), cadaUm: lotes };
  relatorio.resultado = resultado;

  console.log("== o que ficou no banco ==");
  fase("conferencia");
  const fichasDepois = await escalar("SELECT COUNT(*) FROM MembroReferencia");
  const entraram = fichasDepois - fichasAntes;
  ok(entraram === plantio.gabarito.entram, `entraram ${plantio.gabarito.entram} fichas (o total menos as que ficam de fora)`, entraram);
  ok(resultado && resultado.importadas === entraram && resultado.fora === plantio.gabarito.problemas, "o resultado bate com as fichas e com as de fora", resultado);
  const pend = Object.fromEntries((await q(`SELECT Tipo, COUNT(*) AS n FROM FichasPendencias WHERE Origem = N'IMPORTACAO' AND Situacao = N'ABERTA' GROUP BY Tipo`)).map((l) => [l.Tipo, l.n]));
  relatorio.pendencias = pend;
  ok(pend.ARROLAMENTO === entraram, "cada ficha importada com a pendência do arrolamento", pend);
  ok(pend.NUMERO === plantio.gabarito.numeroNovo, "a pendência do número para cada uma que entrou com a próxima matrícula", pend);
  ok((pend.REPETIDA || 0) >= plantio.gabarito.possivelRepetidaNoMinimo, "a pendência de possível repetida, pelo menos as plantadas", pend);
  ok(await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId BETWEEN 810001 AND 899999 AND SituacaoMembro <> N'ARROLAMENTO'") === 0, "todas em arrolamento");
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @id AND (Cpf IS NOT NULL OR Telefone IS NOT NULL OR NomeMae IS NOT NULL OR Email IS NOT NULL)",
    { id: importacaoId }) === 0, "no fim, as linhas da importação sem o CPF, o celular, a mãe e o e-mail");
  ok(await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId BETWEEN 810001 AND 899999 AND (Nome LIKE N'%ã%' OR Nome LIKE N'%ç%' OR Nome LIKE N'%''%')") > 0,
    "os acentos e o apóstrofo chegaram inteiros nas fichas");

  // as consultas mais pesadas do banco durante o ensaio (o plano de cada uma fica para quem for olhar; aqui, o custo). O banco do comando vem dos atributos
  // do plano: no comando com parâmetros (sp_executesql), o dbid do texto vem nulo (o primeiro ensaio, de 26/11, voltou sem nenhuma linha por isso)
  const pesadas = await q(`SELECT TOP 12 qs.execution_count AS execucoes, CAST(qs.total_elapsed_time / 1000.0 AS DECIMAL(12,1)) AS totalMs,
      CAST(qs.max_elapsed_time / 1000.0 AS DECIMAL(12,1)) AS maxMs, qs.total_logical_reads AS leituras, qs.max_logical_reads AS maxLeituras,
      qs.total_logical_writes AS escritas, LEFT(REPLACE(REPLACE(SUBSTRING(t.text, qs.statement_start_offset / 2 + 1,
        (CASE WHEN qs.statement_end_offset = -1 THEN DATALENGTH(t.text) ELSE qs.statement_end_offset END - qs.statement_start_offset) / 2 + 1), CHAR(10), ' '), CHAR(13), ' '), 160) AS trecho
    FROM sys.dm_exec_query_stats qs CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) t
    CROSS APPLY (SELECT CONVERT(INT, value) AS dbid FROM sys.dm_exec_plan_attributes(qs.plan_handle) WHERE attribute = N'dbid') pa
    WHERE pa.dbid = DB_ID() ORDER BY qs.total_elapsed_time DESC`);
  // a que mais leu numa execução (pode não estar entre as mais demoradas): nenhuma consulta pode reler o arquivo inteiro (ou a tabela das fichas) uma
  // vez para cada ficha ou para cada linha
  const maisLeu = (await q(`SELECT TOP 1 qs.max_logical_reads AS maxLeituras, qs.execution_count AS execucoes, LEFT(REPLACE(REPLACE(SUBSTRING(t.text, qs.statement_start_offset / 2 + 1,
        (CASE WHEN qs.statement_end_offset = -1 THEN DATALENGTH(t.text) ELSE qs.statement_end_offset END - qs.statement_start_offset) / 2 + 1), CHAR(10), ' '), CHAR(13), ' '), 160) AS trecho
    FROM sys.dm_exec_query_stats qs CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) t
    CROSS APPLY (SELECT CONVERT(INT, value) AS dbid FROM sys.dm_exec_plan_attributes(qs.plan_handle) WHERE attribute = N'dbid') pa
    WHERE pa.dbid = DB_ID() ORDER BY qs.max_logical_reads DESC`))[0] || { maxLeituras: 0, trecho: "" };
  relatorio.consultaQueMaisLeu = { ...maisLeu, maxLeituras: Number(maisLeu.maxLeituras), trecho: String(maisLeu.trecho).replace(/\s+/g, " ").trim() };
  ok(relatorio.consultaQueMaisLeu.maxLeituras <= TETO_LEITURAS,
    `nenhuma consulta lê mais de ${TETO_LEITURAS.toLocaleString("pt-BR")} páginas numa execução (a que mais leu: ${relatorio.consultaQueMaisLeu.maxLeituras.toLocaleString("pt-BR")})`,
    relatorio.consultaQueMaisLeu.trecho.slice(0, 120));
  relatorio.consultasPesadas = pesadas.map((l) => ({ ...l, totalMs: Number(l.totalMs), maxMs: Number(l.maxMs), trecho: String(l.trecho).replace(/\s+/g, " ").trim() }));
  relatorio.idasPorFase = Object.fromEntries(Object.entries(idas.porFase).filter(([k]) => !/^lote\d+$/.test(k)));

  const arq = `${SAIDA}/relatorio-ensaio-${LINHAS}${ORCAMENTO == null ? "" : `-orcamento-${ORCAMENTO}`}.json`;
  fs.writeFileSync(arq, JSON.stringify(relatorio, null, 2));
  console.log("== resumo ==");
  console.log(`  ida vazia ao banco (a ponte): ${relatorio.idaVaziaMs} ms`);
  console.log(`  prévia: ${relatorio.previa.ms} ms, ${relatorio.previa.idas} idas, pico de memória ${relatorio.previa.memoria.rssPicoMb} MB`);
  console.log(`  lotes: ${relatorio.lotes.quantos}, total ${relatorio.lotes.totalMs} ms, média ${relatorio.lotes.mediaMs} ms, p95 ${relatorio.lotes.p95Ms} ms, máx ${relatorio.lotes.maxMs} ms`);
  console.log(`  idas por lote: média ${relatorio.lotes.idasPorLoteMedia}, máx ${relatorio.lotes.idasPorLoteMax}; o último (o fim): ${JSON.stringify(relatorio.lotes.ultimo)}`);
  for (const p of relatorio.consultasPesadas.slice(0, 6)) console.log(`  pesada: ${p.execucoes}x, ${p.totalMs} ms no total, máx ${p.maxMs} ms, ${p.leituras} leituras — ${p.trecho.slice(0, 110)}`);
  console.log(`  relatório: ${arq}`);
  fim("ensaio-importacao");
}

principal().catch((e) => { console.error("ERRO NO ENSAIO:", e && e.stack ? e.stack : e); process.exitCode = 1; L.shimEncerrar && L.shimEncerrar(); });
