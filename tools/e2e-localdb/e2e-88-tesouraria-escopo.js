// e2e-88-tesouraria-escopo.js — lançamentos e saídas da tesouraria filtrados NO BANCO pelo escopo (FASE 10, raio-x de velocidade, 17/11/2026; aprovado pelo
// responsável). Antes, GET /api/tesouraria-lancamentos e GET /api/saidas liam a tabela inteira da Igreja e filtravam o escopo na memória (minutos na massa
// grande); agora o banco só devolve o escopo. A prova compara a resposta da rota com um "gabarito" tirado direto do banco (que é exatamente o que a regra
// antiga — ler tudo e filtrar por nome de congregação — devolvia), para cada escopo (geral, área, congregação, vazio, nome que não existe), confere as
// páginas opcionais, as entradas malformadas e que os índices da migração 175 existem e são usados. Roda sobre a base cenario-175
// (`bash rodar.sh preparar-175` e `BASE=cenario-175 bash rodar.sh roteiro e2e-88-tesouraria-escopo.js`); monta o próprio cenário.
process.env.AUTH_SECRET = "segredo-da-tesouraria-no-banco-" + "x".repeat(24);
const L = require("./lib");
const { ok, fim, q, escalar, obterPool } = L;

const fator = () => ({ via: "CHAVE", em: Date.now() });
const token = (escopo, nivel = "CONGREGACAO", extra = {}) => L.sessao(1002, { via: "SENHA", fator: fator(), nivel, escopoCongregacoes: escopo, permissoes: ["financeiro"], ...extra });

async function principal() {
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  const lancs = (tk, query) => chamarRota("GestaoLancamentosTesouraria/index.js", { metodo: "GET", token: tk, query: query || {} });
  const saidas = (tk, query) => chamarRota("GestaoSaidas/index.js", { metodo: "GET", token: tk, query: query || {} });
  const mesmo = (a, b) => a.length === b.length && [...a].sort((x, y) => x - y).every((v, i) => v === [...b].sort((x, y) => x - y)[i]);

  console.log("== a migração 175: os índices existem ==");
  const indices = (await q(`SELECT name FROM sys.indexes WHERE name LIKE N'IX_LancamentosTesouraria_%' OR name LIKE N'IX_SaidasTesouraria_%' OR name IN
    (N'IX_MembroReferencia_Congregacao_Status', N'IX_MembroReferencia_Nome', N'IX_AprovacoesRelatorioDepartamental_Relatorio', N'IX_ExtratoLinhas_Extrato')`)).map((x) => x.name);
  ok(indices.length === 13, "os 13 índices da 175 existem (a 175 rodou duas vezes no preparo, sem erro)", indices.join(", "));

  console.log("== o cenário: uma área com duas congregações, uma congregação de fora, lançamentos e saídas ==");
  const area = await escalar("INSERT INTO Areas (Nome) OUTPUT INSERTED.AreaId VALUES (N'Área Tesouraria E2E88')");
  const outraArea = await escalar("INSERT INTO Areas (Nome) OUTPUT INSERTED.AreaId VALUES (N'Área Fora E2E88')");
  const congX = await escalar("INSERT INTO Congregacoes (Nome, AreaId) OUTPUT INSERTED.CongregacaoId VALUES (N'Tesouraria X E2E88', @a)", { a: area });
  const congY = await escalar("INSERT INTO Congregacoes (Nome, AreaId) OUTPUT INSERTED.CongregacaoId VALUES (N'Tesouraria Y E2E88', @a)", { a: area });
  const congZ = await escalar("INSERT INTO Congregacoes (Nome, AreaId) OUTPUT INSERTED.CongregacaoId VALUES (N'Tesouraria Z E2E88', @a)", { a: outraArea });
  const nome = async (id) => (await q("SELECT Nome FROM Congregacoes WHERE CongregacaoId = @c", { c: id }))[0].Nome;
  const [nX, nY, nZ] = [await nome(congX), await nome(congY), await nome(congZ)];
  let termo = 880000;
  const lanc = (c, mes, comComprovante) => q(`INSERT INTO LancamentosTesouraria (CongregacaoId, TermoNumero, Tipo, Valor, FormaPagamento, MesReferencia, RegistradoPor, Status, StatusConfirmacao, ComprovanteUrl, NomeAvulso)
    VALUES (@c, @t, N'DIZIMO', 50, N'PIX', @m, 1002, N'ATIVO', N'CONFIRMADO', @u, N'Doador E2E88')`, { c, t: ++termo, m: mes, u: comComprovante ? `https://blob.e2e/documentos-institucionais/comp-${termo}.png` : null });
  for (let i = 0; i < 12; i++) await lanc(congX, i < 7 ? "2026-09" : "2026-10", i % 3 === 0);
  for (let i = 0; i < 10; i++) await lanc(congY, "2026-10", false);
  for (let i = 0; i < 8; i++) await lanc(congZ, "2026-10", i % 2 === 0);
  const categoria = await escalar("SELECT TOP 1 Codigo FROM CategoriasSaida WHERE CentroCusto = N'LOCAL' ORDER BY Codigo");
  const forn = await escalar(`INSERT INTO Fornecedores (Nome, CpfCnpj, Tipo, Banco, Agencia, Conta, TipoConta, DadosBancariosConfirmados, CriadoPor)
    OUTPUT INSERTED.FornecedorId VALUES (N'Loja E2E88', N'12.345.678/0001-88', N'PJ', N'Banco E2E', N'0001', N'12345-6', N'CORRENTE', 1, 1002)`);
  const saida = (c, v, st) => q(`INSERT INTO SaidasTesouraria (CongregacaoId, FornecedorId, Tipo, Descricao, Valor, DocumentoFiscalUrl, SolicitadoPor, Status)
    VALUES (@c, @f, @t, N'Saída E2E88', @v, N'https://blob.e2e/documentos-institucionais/nota-e2e88', 1002, @s)`, { c, f: forn, t: categoria, v, s: st });
  for (let i = 0; i < 6; i++) await saida(congX, 100 + i, i < 4 ? "SOLICITADA" : "PAGA");
  for (let i = 0; i < 5; i++) await saida(congY, 200 + i, "SOLICITADA");
  for (let i = 0; i < 4; i++) await saida(congZ, 300 + i, "SOLICITADA");

  // o gabarito: o que a regra antiga devolvia (a tabela inteira, filtrada pelo NOME da congregação no escopo)
  const gabLanc = async (nomes, extra = "", p = {}) => (await q(`SELECT l.LancamentoId AS id FROM LancamentosTesouraria l JOIN Congregacoes c ON c.CongregacaoId = l.CongregacaoId
    WHERE 1=1 ${nomes ? "AND c.Nome IN (SELECT value FROM OPENJSON(@n))" : ""} ${extra}`, { n: JSON.stringify(nomes || []), ...p })).map((x) => x.id);
  const gabSaida = async (nomes, extra = "", p = {}) => (await q(`SELECT s.SaidaId AS id FROM SaidasTesouraria s JOIN Congregacoes c ON c.CongregacaoId = s.CongregacaoId
    JOIN CategoriasSaida cs ON cs.Codigo = s.Tipo
    WHERE 1=1 ${nomes ? "AND c.Nome IN (SELECT value FROM OPENJSON(@n))" : ""} ${extra}`, { n: JSON.stringify(nomes || []), ...p })).map((x) => x.id);

  console.log("== lançamentos: cada escopo contra o gabarito ==");
  const casosLanc = [
    ["congregação X", [nX], {}, ""],
    ["congregação X, mês 2026-09", [nX], { congregacaoId: String(congX), mesReferencia: "2026-09" }, `AND l.CongregacaoId = ${congX} AND l.MesReferencia = '2026-09'`],
    ["área (X e Y)", [nX, nY], {}, ""],
    ["área, pedindo a congregação Z (de fora)", [nX, nY], { congregacaoId: String(congZ) }, `AND l.CongregacaoId = ${congZ}`]
  ];
  for (const [rot, escopo, query, extra] of casosLanc) {
    const r = await lancs(token(escopo), query);
    const esperado = await gabLanc(escopo, extra);
    ok(r.status === 200 && Array.isArray(r.body) && mesmo(r.body.map((x) => x.lancamentoId), esperado), `lançamentos, ${rot}: ${esperado.length} — igual ao gabarito`, JSON.stringify({ veio: r.body && r.body.length, esperado: esperado.length }));
  }
  const geral = await lancs(token("TODAS", "GLOBAL"), { mesReferencia: "2026-10" });
  const gabGeral = await gabLanc(null, "AND l.MesReferencia = '2026-10'");
  ok(mesmo(geral.body.map((x) => x.lancamentoId), gabGeral), `lançamentos, Geral (TODAS) no mês 2026-10: ${gabGeral.length} — igual ao gabarito`, `${geral.body.length} × ${gabGeral.length}`);
  ok(Array.isArray((await lancs(token([]))).body) && (await lancs(token([]))).body.length === 0, "lançamentos, escopo vazio: lista vazia");
  ok((await lancs(token(["Não Existe E2E88"]))).body.length === 0, "lançamentos, escopo com nome que não existe: lista vazia");
  const comComp = (await lancs(token([nX]))).body.filter((x) => x.comprovanteUrl);
  ok(comComp.length === 4 && comComp.every((x) => /comp-\d+\.png\?/.test(x.comprovanteUrl)), "o comprovante continua vindo como link assinado (o formato da tela de hoje)", JSON.stringify(comComp.map((x) => x.comprovanteUrl).slice(0, 1)));
  const umX = (await lancs(token([nX]))).body[0];
  ok(["lancamentoId", "congregacaoNome", "termoNumero", "valor", "formaPagamento", "comprovantePendente", "contabilizado", "mesReferencia"].every((k) => k in umX), "cada lançamento tem os mesmos campos de antes");

  console.log("== lançamentos: as páginas (opcionais) ==");
  const p1 = await lancs(token([nX, nY]), { pagina: "1", porPagina: "8" });
  const p2 = await lancs(token([nX, nY]), { pagina: "2", porPagina: "8" });
  const p3 = await lancs(token([nX, nY]), { pagina: "3", porPagina: "8" });
  const tudo = (await lancs(token([nX, nY]))).body.map((x) => x.lancamentoId);
  ok(p1.body.total === 22 && p1.body.itens.length === 8 && p2.body.itens.length === 8 && p3.body.itens.length === 6, "a área em páginas de 8: 22 no total, 8 + 8 + 6", JSON.stringify({ t: p1.body.total }));
  ok(JSON.stringify([...p1.body.itens, ...p2.body.itens, ...p3.body.itens].map((x) => x.lancamentoId)) === JSON.stringify(tudo), "as páginas juntas = a lista inteira, na mesma ordem");
  const longe = await lancs(token([nX]), { pagina: "99", porPagina: "10" });
  ok(longe.body.total === 12 && longe.body.itens.length === 0, "página além do fim: vazia, com o total certo");

  console.log("== saídas: cada escopo contra o gabarito ==");
  const casosSaida = [
    ["congregação X", [nX], {}, ""],
    ["congregação X, só SOLICITADA", [nX], { status: "SOLICITADA" }, "AND s.Status = 'SOLICITADA'"],
    ["área (X e Y)", [nX, nY], {}, ""],
    ["área, pedindo Z (de fora)", [nX, nY], { congregacaoId: String(congZ) }, `AND s.CongregacaoId = ${congZ}`]
  ];
  for (const [rot, escopo, query, extra] of casosSaida) {
    const r = await saidas(token(escopo), query);
    const esperado = await gabSaida(escopo, `AND cs.CentroCusto = N'LOCAL' ${extra}`);
    ok(r.status === 200 && Array.isArray(r.body) && mesmo(r.body.map((x) => x.saidaId), esperado), `saídas, ${rot}: ${esperado.length} — igual ao gabarito`, JSON.stringify({ veio: r.body && r.body.length, esperado: esperado.length }));
  }
  const gSaidas = await saidas(token("TODAS", "GLOBAL"), { congregacaoId: String(congZ) });
  ok(mesmo(gSaidas.body.map((x) => x.saidaId), await gabSaida(null, `AND s.CongregacaoId = ${congZ}`)), "saídas, Geral pedindo a congregação Z: igual ao gabarito");
  ok((await saidas(token([]))).body.length === 0, "saídas, escopo vazio: lista vazia");
  const sX = (await saidas(token([nX]))).body;
  ok(sX.every((x) => /nota-e2e88\?/.test(x.documentoFiscalUrl)) && sX.every((x) => "possivelDuplicidade" in x), "a nota fiscal continua como link assinado e a marca de possível duplicidade continua");
  const sp = await saidas(token([nX, nY]), { pagina: "2", porPagina: "4" });
  ok(sp.body.total === 11 && sp.body.itens.length === 4, "saídas em páginas: 11 no total, a página 2 com 4");

  console.log("== entradas malformadas: 400, sem chegar ao banco ==");
  for (const [rot, fn, query] of [["congregacaoId com SQL", lancs, { congregacaoId: "1 OR 1=1" }], ["mês com aspas", lancs, { mesReferencia: "2026-10' --" }], ["congregacaoId negativo nas saídas", saidas, { congregacaoId: "-3" }]]) {
    const r = await fn(token("TODAS", "GLOBAL"), query);
    ok(r.status === 400, `${rot}: 400`, String(r.status));
  }

  console.log("== o banco usa os índices (o plano da consulta da tela) ==");
  const usaIndice = await escalar(`SELECT COUNT(*) FROM sys.dm_db_index_usage_stats u JOIN sys.indexes i ON i.object_id = u.object_id AND i.index_id = u.index_id
    WHERE u.database_id = DB_ID() AND i.name = N'IX_LancamentosTesouraria_Congregacao_Mes' AND (u.user_seeks + u.user_scans) > 0`);
  ok(usaIndice === 1, "o índice da congregação + mês foi usado pelas consultas acima (estatística de uso do SQL Server)", String(usaIndice));

  await q("DELETE FROM SaidasTesouraria WHERE FornecedorId = @f", { f: forn });
  await q("DELETE FROM Fornecedores WHERE FornecedorId = @f", { f: forn });
  await q("DELETE FROM LancamentosTesouraria WHERE TermoNumero BETWEEN 880001 AND 880100 AND NomeAvulso = N'Doador E2E88'");
  fim("e2e-88 (lançamentos e saídas no banco)");
  L.shimEncerrar();
}

principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
