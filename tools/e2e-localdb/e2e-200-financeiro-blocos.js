// e2e-200-financeiro-blocos.js — FASE 10, Financeiro (módulo 2), incremento 1a (21/11/2026): a migração 200 (a base do Financeiro novo) e a rota
// FinBlocos (os blocos de recibo) contra o SQL Server de verdade. Base: cenario-184 com a 200 aplicada duas vezes (bash rodar.sh preparar-200).
// O Financeiro roda no LocalDB próprio, para não atropelar o agente de Membros (que usa a instância psc7):
//   E2E_INSTANCIA=fin E2E_BANCO=ieadespa_fin E2E_CS='Server=(localdb)\fin;Database=ieadespa_fin;Integrated Security=true' BASE=cenario-200 bash rodar.sh roteiro e2e-200-financeiro-blocos.js
// Cobre: o esquema (tabelas, CHECK, índices únicos, os centros de custo que nascem sozinhos e a idempotência); o lote da gráfica (200 blocos numerados
// pela primeira folha), o cruzamento de lotes, a chegada, a entrega (e as recusas); a lista em páginas de 40 com os filtros, a procura e o quadro da
// direita; o escopo (Geral, área, congregação, fora do escopo = não existe); lixo em cada campo; e corridas em processos separados.
const { spawn } = require("child_process");
const L = require("./lib");
const { q, um, escalar, ok, fim, GET, POST, GERAL, LIDER, API, path } = L;
const H = require(path.join(API, "FinBlocos/index.js"));

const TESOUREIRO_GERAL = 1002, TESOUREIRA_LOCAL = 1003;
const CENTRAL = 1, VILA_NOVA = 2, BETA = 3;
const geral = GERAL(TESOUREIRO_GERAL, ["financeiro"]);
const local = LIDER(TESOUREIRA_LOCAL, ["financeiro"], ["Vila Nova E2E"]);
const area = LIDER(TESOUREIRA_LOCAL, ["financeiro"], ["Central E2E", "Vila Nova E2E"], "AREA");
const semFinanceiro = LIDER(TESOUREIRA_LOCAL, ["pessoas"], ["Vila Nova E2E"]);
const geralSemFinanceiro = GERAL(TESOUREIRO_GERAL, ["pessoas"]);

const TABELAS = ["FinCentrosCusto", "FinMovimentosCentro", "FinLotesGrafica", "FinBlocos", "FinFolhas", "FinLivroBlocos"];
async function retratoFin() {
  const partes = [];
  for (const t of TABELAS) partes.push(JSON.stringify(await um(`SELECT COUNT(*) n, CHECKSUM_AGG(CHECKSUM(*)) c FROM ${t}`)));
  return partes.join("|");
}
async function recusa(sqlTexto, descricao) {
  let falhou = false;
  try { await q(sqlTexto); } catch (e) { falhou = true; }
  ok(falhou, `o banco recusa: ${descricao}`);
}
async function disparar(chamadas) {
  const t0 = Date.now() + 6000 + chamadas.length * 600;
  return Promise.all(chamadas.map((spec) => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-r", path.join(__dirname, "shim-mssql.js"), path.join(__dirname, "worker.js"), JSON.stringify({ ...spec, t0 })], { env: process.env });
    let saida = ""; p.stdout.on("data", (d) => { saida += d; });
    p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { status: -1 }); });
  })));
}

(async () => {
  console.log("== o esquema da 200 ==");
  for (const t of TABELAS) ok(!!(await escalar(`SELECT OBJECT_ID(N'dbo.${t}', N'U')`)), `a tabela ${t} existe`);
  const cc = await q(`SELECT Codigo, Nome, Tipo, CongregacaoId FROM FinCentrosCusto ORDER BY CentroCustoId`);
  ok(cc.filter((c) => c.Tipo === "GERAL").map((c) => c.Nome).join(",") === "Presidente,Tesouro Geral,Convenção", "os 3 centros de custo da Geral nascem sozinhos (Presidente, Tesouro Geral, Convenção)", cc);
  const nCong = await escalar(`SELECT COUNT(*) FROM Congregacoes`);
  ok(cc.filter((c) => c.Tipo === "CONGREGACAO").length === nCong, "um centro de custo por congregação, com o nome dela (a 200 aplicada duas vezes não duplicou)");
  ok(cc.some((c) => c.Tipo === "CONGREGACAO" && c.CongregacaoId === VILA_NOVA && c.Nome === "Vila Nova E2E"), "o de Vila Nova tem o nome da congregação");
  await recusa(`INSERT INTO FinCentrosCusto (Codigo, Nome, Tipo, CongregacaoId) VALUES ('CONG_X', 'Outro', 'CONGREGACAO', ${VILA_NOVA})`, "segundo centro de custo da mesma congregação");
  await recusa(`INSERT INTO FinCentrosCusto (Codigo, Nome, Tipo) VALUES ('X1', 'Sem congregação', 'CONGREGACAO')`, "centro de custo de congregação sem a congregação");
  await recusa(`INSERT INTO FinCentrosCusto (Codigo, Nome, Tipo) VALUES ('X2', 'Tipo nulo', NULL)`, "tipo nulo (o CHECK não deixa passar NULL)");
  const presidente = await escalar(`SELECT CentroCustoId FROM FinCentrosCusto WHERE Codigo = 'GERAL_PRESIDENTE'`);
  await recusa(`INSERT INTO FinMovimentosCentro (CentroCustoId, Tipo, Valor, DataMovimento, CriadoPor) VALUES (${presidente}, 'ABERTURA', 0, '2027-01-01', ${TESOUREIRO_GERAL})`, "movimento de valor zero");
  await recusa(`INSERT INTO FinMovimentosCentro (CentroCustoId, Tipo, Valor, DataMovimento, CriadoPor) VALUES (${presidente}, 'ESTORNO', -10, '2027-01-01', ${TESOUREIRO_GERAL})`, "estorno sem dizer o que estorna");
  await recusa(`INSERT INTO FinMovimentosCentro (CentroCustoId, Tipo, Valor, DataMovimento, CriadoPor) VALUES (${presidente}, 'CULTO', 10, '2027-01-01', ${TESOUREIRO_GERAL})`, "tipo de movimento que não existe");
  const abertura = (await q(`INSERT INTO FinMovimentosCentro (CentroCustoId, Tipo, Valor, DataMovimento, Descricao, CriadoPor) OUTPUT INSERTED.MovimentoId VALUES (${presidente}, 'ABERTURA', -1250.75, '2027-01-01', 'saldo de abertura', ${TESOUREIRO_GERAL})`))[0].MovimentoId;
  ok(!!abertura, "o saldo de abertura pode ser negativo");
  await q(`INSERT INTO FinMovimentosCentro (CentroCustoId, Tipo, Valor, DataMovimento, Descricao, EstornoDeId, CriadoPor) VALUES (${presidente}, 'ESTORNO', 1250.75, '2027-01-02', 'digitado errado', ${abertura}, ${TESOUREIRO_GERAL})`);
  await recusa(`INSERT INTO FinMovimentosCentro (CentroCustoId, Tipo, Valor, DataMovimento, Descricao, EstornoDeId, CriadoPor) VALUES (${presidente}, 'ESTORNO', 1250.75, '2027-01-02', 'de novo', ${abertura}, ${TESOUREIRO_GERAL})`, "estornar duas vezes o mesmo movimento");
  ok(Number(await escalar(`SELECT SUM(Valor) FROM FinMovimentosCentro WHERE CentroCustoId = ${presidente}`)) === 0, "abertura + estorno = saldo zero (nada se apaga)");

  console.log("== quem entra ==");
  const antes0 = await retratoFin();
  ok((await GET(H, "", null)).status === 401, "sem sessão: 401");
  ok((await GET(H, "", semFinanceiro)).status === 403, "sem a permissão financeiro: 403");
  ok((await POST(H, "lote", local, { serie: 2026, primeiraFolha: 70001, totalFolhas: 10000 })).status === 403, "a tesouraria local não cadastra lote (403)");
  ok((await POST(H, "lote", area, { serie: 2026, primeiraFolha: 70001, totalFolhas: 10000 })).status === 403, "a área não cadastra lote (403)");
  ok((await POST(H, "lote", geralSemFinanceiro, { serie: 2026, primeiraFolha: 70001, totalFolhas: 10000 })).status === 403, "o nível geral sem a permissão financeiro não cadastra (403)");
  ok((await POST(H, "apagar", geral, {})).status === 404, "ação que não existe: 404");
  ok((await retratoFin()) === antes0, "as recusas não mexeram no banco");

  console.log("== o lote da gráfica, a chegada e a entrega ==");
  let r = await POST(H, "lote", geral, { serie: 2026, primeiraFolha: 70001, totalFolhas: 10000 });
  ok(r.status === 201 && r.body.blocos === 200, "a Tesouraria Geral cadastra o lote de 10.000 folhas: 200 blocos", r);
  const loteId = r.body.loteId;
  const blocos = await q(`SELECT Numero, PrimeiraFolha, UltimaFolha, Situacao, ChegouEm FROM FinBlocos WHERE LoteId = ${loteId} ORDER BY Numero`);
  ok(blocos.length === 200 && blocos[0].Numero === 1400 && blocos[1].Numero === 1401 && blocos[1].PrimeiraFolha === 70051 && blocos[199].UltimaFolha === 80000, "os blocos numerados pela primeira folha (70.051 = bloco 1.401) até a 80.000");
  ok(blocos.every((b) => b.Situacao === "NA_GERAL" && !b.ChegouEm), "todos na Geral, ainda na gráfica");
  ok(Number(await escalar(`SELECT COUNT(*) FROM FinLivroBlocos WHERE Tipo = 'CADASTRO' AND LoteId = ${loteId} AND Quantidade = 10000`)) === 1, "o livro registra o cadastro do lote");
  ok(Number(await escalar(`SELECT COUNT(*) FROM AuditLog WHERE Acao = 'FIN_LOTE_CADASTRADO' AND RegistroId = ${loteId}`)) === 1, "a trilha registra o cadastro do lote");
  r = await POST(H, "lote", geral, { serie: 2026, primeiraFolha: 79951, totalFolhas: 100 });
  ok(r.status === 422 && /cruzam/.test(r.body.mensagem), "um lote que cruza as folhas de outro é recusado", r.body);
  r = await POST(H, "lote", geral, { serie: 2026, primeiraFolha: 70001, totalFolhas: 75 });
  ok(r.status === 422, "o total que não fecha blocos de 50 é recusado");

  r = await POST(H, "entregar", geral, { primeiraFolha: 70051, congregacaoId: VILA_NOVA, pessoa: { nome: "Tesoureira de Vila Nova" } });
  ok(r.status === 422 && /ainda não chegou/.test(r.body.mensagem), "o bloco que não chegou da gráfica não se entrega", r.body);
  r = await POST(H, "chegada", geral, { loteId, ateFolha: 75000 });
  ok(r.status === 200 && r.body.blocos === 100, "a chegada até a folha 75.000: 100 blocos", r.body);
  r = await POST(H, "chegada", geral, { loteId, ateFolha: 75000 });
  ok(r.status === 200 && r.body.blocos === 0, "registrar a mesma chegada de novo não muda nada");
  ok((await POST(H, "chegada", geral, { loteId: 999999, ateFolha: 75000 })).status === 404, "lote que não existe: 404");
  r = await POST(H, "chegada", geral, { loteId, ateFolha: 90000 });
  ok(r.status === 422, "folha de fora do lote na chegada é recusada");

  r = await POST(H, "entregar", geral, { primeiraFolha: 70051, congregacaoId: VILA_NOVA, pessoa: { membroId: TESOUREIRA_LOCAL } });
  ok(r.status === 200, "o bloco 1.401 entregue a Vila Nova", r.body);
  r = await POST(H, "entregar", geral, { primeiraFolha: 70051, congregacaoId: BETA, pessoa: { nome: "Outra pessoa" } });
  ok(r.status === 422 && /já foi entregue/.test(r.body.mensagem), "o mesmo bloco não sai duas vezes");
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70101, congregacaoId: VILA_NOVA, pessoa: { nome: "Rute (tesoureira)" }, levadoPelaArea: true })).status === 200, "o bloco 1.402 entregue a Vila Nova, levado pela área");
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70151, congregacaoId: BETA, pessoa: { nome: "Tesoureiro da Beta" } })).status === 200, "o bloco 1.403 entregue à Beta");
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70201, congregacaoId: 999, pessoa: { nome: "x" } })).status === 422, "congregação que não existe é recusada");
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70201, congregacaoId: CENTRAL, pessoa: { membroId: 987654 } })).status === 422, "pessoa que não existe é recusada");
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70202, congregacaoId: CENTRAL, pessoa: { nome: "x" } })).status === 422, "folha que não é a primeira de um bloco é recusada");
  const livro = await q(`SELECT Tipo, CongregacaoId, PessoaMembroId, PessoaNome, LevadoPelaArea FROM FinLivroBlocos WHERE Tipo = 'SAIDA' ORDER BY RegistroId`);
  ok(livro.length === 3 && livro[0].PessoaMembroId === TESOUREIRA_LOCAL && livro[1].LevadoPelaArea === true && livro[2].PessoaNome === "Tesoureiro da Beta", "o livro registra cada saída, com quem levou e se foi pela área", livro);
  // uma folha do 1.401 com destino (a tela das folhas vem no incremento 2): o bloco passa a "em uso"
  const b1401 = await escalar(`SELECT BlocoId FROM FinBlocos WHERE Numero = 1401`);
  await q(`INSERT INTO FinFolhas (BlocoId, Folha, Destino, Observacao, RegistradoPor) VALUES (${b1401}, 70090, 'ARRANCADA', 'Rasgou na hora de preencher', ${TESOUREIRA_LOCAL})`);
  await recusa(`INSERT INTO FinFolhas (BlocoId, Folha, Destino, Observacao, RegistradoPor) VALUES (${b1401}, 70090, 'CANCELADA', 'de novo', ${TESOUREIRA_LOCAL})`, "a mesma folha com dois destinos");
  await recusa(`INSERT INTO FinFolhas (BlocoId, Folha, Destino, Observacao, RegistradoPor) VALUES (${b1401}, 70091, 'CANCELADA', '   ', ${TESOUREIRA_LOCAL})`, "folha cancelada sem a observação");
  await recusa(`UPDATE FinBlocos SET Situacao = 'NA_GERAL' WHERE BlocoId = ${b1401}`, "bloco na Geral com congregação");
  await recusa(`UPDATE FinBlocos SET Situacao = 'DEVOLVIDO' WHERE BlocoId = ${b1401}`, "bloco devolvido sem a data da devolução");
  await recusa(`UPDATE FinBlocos SET Situacao = 'ENTREGUE', CongregacaoId = ${CENTRAL}, EntregueEm = '2026-11-21' WHERE Numero = 1590`, "entregar bloco que não chegou (direto no banco)");

  console.log("== a lista: a Tesouraria Geral ==");
  r = await GET(H, "", geral, {});
  ok(r.status === 200 && r.body.total === 200 && r.body.blocos.length === 40 && r.body.porPagina === 40, "200 blocos em páginas de 40", { total: r.body.total, n: r.body.blocos.length });
  ok(r.body.blocos[0].situacao !== "na-geral" && r.body.blocos.slice(0, 3).every((b) => b.congregacao), "os entregues vêm primeiro");
  const b = r.body.blocos.find((x) => x.numero === 1401);
  ok(b && b.situacao === "em-uso" && b.usadas === 1 && b.livres === 49 && b.congregacao.nome === "Vila Nova E2E" && b.primeiraFolha === 70051 && b.ultimaFolha === 70100, "o 1.401: em uso, 1 usada e 49 livres, de Vila Nova", b);
  ok(r.body.blocos.find((x) => x.numero === 1402).situacao === "esperando", "o 1.402: esperando (entregue, nenhuma folha usada)");
  ok(JSON.stringify(r.body.resumo) === JSON.stringify({ tipo: "lote", lote: { id: loteId, serie: 2026, primeiraFolha: 70001, ultimaFolha: 80000, folhasPorBloco: 50, blocos: 200, folhas: 10000, folhasChegaram: 5000, blocosChegaram: 100, folhasFaltam: 5000 } }),
    "o quadro do lote: 200 blocos, 10.000 folhas, chegaram 5.000 e faltam 5.000 (como no desenho)", r.body.resumo);
  ok((await GET(H, "", geral, { pagina: 5 })).body.blocos.length === 40 && (await GET(H, "", geral, { pagina: 6 })).body.blocos.length === 0, "a página 5 é a última");
  ok((await GET(H, "", geral, { situacao: "em-uso" })).body.blocos.map((x) => x.numero).join() === "1401", "filtro em uso: só o 1.401");
  ok((await GET(H, "", geral, { situacao: "esperando" })).body.blocos.map((x) => x.numero).sort().join() === "1402,1403", "filtro esperando: o 1.402 e o 1.403");
  ok((await GET(H, "", geral, { situacao: "fechado" })).body.total === 0, "filtro fechado: nenhum ainda");
  ok((await GET(H, "", geral, { situacao: "na-geral" })).body.total === 197, "na Geral: os outros 197");
  ok((await GET(H, "", geral, { procura: "70.090" })).body.blocos.map((x) => x.numero).join() === "1401", "procurar a folha 70.090 acha o bloco 1.401");
  ok((await GET(H, "", geral, { procura: "1402" })).body.blocos.map((x) => x.numero).join() === "1402", "procurar o número 1.402 acha o bloco");
  ok((await GET(H, "", geral, { procura: "abc" })).body.total === 0, "procura que não é número não acha nada");
  r = await GET(H, "", geral, { congregacaoId: VILA_NOVA });
  ok(r.body.total === 2 && r.body.resumo.tipo === "seus" && r.body.resumo.emUsoOuEsperando === 2 && r.body.resumo.folhasLivres === 99, "a Geral escolhendo Vila Nova vê os 2 blocos dela e o quadro dela", r.body.resumo);

  console.log("== a lista: a congregação e a área ==");
  r = await GET(H, "", local, {});
  ok(r.status === 200 && r.body.blocos.map((x) => x.numero).sort().join() === "1401,1402", "a tesouraria de Vila Nova vê só os 2 blocos dela", r.body.blocos.map((x) => x.numero));
  ok(JSON.stringify(r.body.resumo) === JSON.stringify({ tipo: "seus", emUsoOuEsperando: 2, folhasLivres: 99 }), "o quadro \"Seus blocos\": 2 em uso ou esperando, 99 folhas livres", r.body.resumo);
  ok((await GET(H, "", local, { situacao: "na-geral" })).body.total === 0, "a congregação não vê o que está na Geral");
  ok((await GET(H, "", local, { procura: "70151" })).body.total === 0, "procurar uma folha de outra congregação não acha nada");
  const fora = await GET(H, "", local, { congregacaoId: BETA });
  const naoExiste = await GET(H, "", local, { congregacaoId: 99999 });
  ok(fora.status === 404 && naoExiste.status === 404 && JSON.stringify(fora.body) === JSON.stringify(naoExiste.body), "congregação fora do escopo e congregação que não existe: a mesma resposta");
  r = await GET(H, "", area, {});
  ok(r.body.blocos.map((x) => x.numero).sort().join() === "1401,1402", "a área (Central e Vila Nova) vê os blocos das suas congregações, não os da Beta");

  console.log("== lixo em cada campo ==");
  const quebras = [], mudancas = [];
  const casos = [
    ["lote", { serie: 2027, primeiraFolha: 90001, totalFolhas: 50 }, ["serie", "primeiraFolha", "totalFolhas", "folhasPorBloco"]],
    ["chegada", { loteId, ateFolha: 70100 }, ["loteId", "ateFolha", "data"]],
    ["entregar", { primeiraFolha: 70201, congregacaoId: CENTRAL, pessoa: { nome: "Fulano" } }, ["primeiraFolha", "congregacaoId", "pessoa", "levadoPelaArea", "data"]]
  ];
  for (const [acao, base, campos] of casos) for (const campo of campos) for (const lixo of L.LIXO) {
    const corpo = { ...base };
    if (lixo === undefined) delete corpo[campo]; else corpo[campo] = lixo;
    const antes = await retratoFin();
    const res = await POST(H, acao, geral, corpo);
    if (res.status === 500 || ![200, 201, 404, 409, 422].includes(res.status)) quebras.push(`${acao}.${campo}=${JSON.stringify(lixo).slice(0, 30)} -> ${res.status}`);
    else if (res.status >= 400 && (await retratoFin()) !== antes) mudancas.push(`${acao}.${campo}=${JSON.stringify(lixo).slice(0, 30)}`);
    if (res.body && /SELECT |INSERT |UPDATE |mssql|tedious|node_modules/i.test(JSON.stringify(res.body))) quebras.push(`${acao}.${campo} vazou texto interno`);
    // o que passou (um lixo que por acaso é válido) volta atrás para o próximo caso partir do mesmo estado
    if (res.status === 200 || res.status === 201) { /* aceitável: o valor de base era válido */ }
  }
  for (const campo of ["situacao", "procura", "pagina", "congregacaoId"]) for (const lixo of L.LIXO) {
    if (lixo === undefined) continue;
    const res = await GET(H, "", local, { [campo]: typeof lixo === "object" && lixo !== null ? JSON.stringify(lixo) : lixo });
    if (res.status === 500 || ![200, 404].includes(res.status)) quebras.push(`GET ${campo}=${JSON.stringify(lixo).slice(0, 30)} -> ${res.status}`);
    else if (res.status === 200 && res.body.blocos.some((x) => !x.congregacao || x.congregacao.id !== VILA_NOVA)) quebras.push(`GET ${campo}=${JSON.stringify(lixo).slice(0, 30)} trouxe bloco de fora`);
  }
  ok(quebras.length === 0, "nenhuma chamada com lixo dá 500, vaza texto interno ou traz bloco de fora", quebras.slice(0, 6));
  ok(mudancas.length === 0, "chamada recusada nunca altera o banco", mudancas.slice(0, 6));

  console.log("== corridas (processos separados) ==");
  const tok = { tipo: "GERAL", membroId: TESOUREIRO_GERAL, permissoes: ["financeiro"] };
  let rs = await disparar([0, 1, 2, 3].map(() => ({ handler: "finBlocos", acao: "lote", token: tok, corpo: { serie: 2027, primeiraFolha: 100001, totalFolhas: 1000 } })));
  const lotesNovos = Number(await escalar(`SELECT COUNT(*) FROM FinLotesGrafica WHERE PrimeiraFolha = 100001`));
  ok(rs.filter((x) => x.status === 201).length === 1 && lotesNovos === 1 && Number(await escalar(`SELECT COUNT(*) FROM FinBlocos WHERE PrimeiraFolha BETWEEN 100001 AND 101000`)) === 20,
    "4 cadastros do mesmo lote ao mesmo tempo: só 1 entra (20 blocos), os outros são recusados", rs.map((x) => x.status));
  rs = await disparar([CENTRAL, VILA_NOVA, BETA, CENTRAL].map((c, i) => ({ handler: "finBlocos", acao: "entregar", token: tok, corpo: { primeiraFolha: 70251, congregacaoId: c, pessoa: { nome: `Pessoa ${i}` } } })));
  ok(rs.filter((x) => x.status === 200).length === 1 && Number(await escalar(`SELECT COUNT(*) FROM FinLivroBlocos WHERE Tipo = 'SAIDA' AND BlocoId = (SELECT BlocoId FROM FinBlocos WHERE PrimeiraFolha = 70251)`)) === 1,
    "4 entregas do mesmo bloco ao mesmo tempo: só 1 sai, e o livro tem uma linha só", rs.map((x) => x.status));
  rs = await disparar([0, 1, 2, 3].map((i) => ({ handler: "finBlocos", acao: "lote", token: tok, corpo: { serie: 2027, primeiraFolha: 200001 + i * 25, totalFolhas: 100 } })));
  const sobrepostos = Number(await escalar(`SELECT COUNT(*) FROM FinLotesGrafica a JOIN FinLotesGrafica b ON a.LoteId < b.LoteId AND a.PrimeiraFolha <= b.UltimaFolha AND a.UltimaFolha >= b.PrimeiraFolha`));
  ok(sobrepostos === 0 && rs.filter((x) => x.status === 201).length === 1, "4 lotes que se cruzam ao mesmo tempo: nenhum par de lotes se sobrepõe", rs.map((x) => x.status));
  ok(Number(await escalar(`SELECT COUNT(*) FROM AuditLog WHERE Acao LIKE 'FIN_%' AND RegistroId IS NULL`)) === 0, "nenhuma linha da trilha sem o registro");

  fim("e2e-200 (Financeiro: a base e os blocos de recibo)");
})().catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
