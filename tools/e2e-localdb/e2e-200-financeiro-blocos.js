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

const TABELAS = ["FinCentrosCusto", "FinMovimentosCentro", "FinLotesGrafica", "FinBlocos", "FinFolhas", "FinLivroBlocos", "FinFolhasDesfeitas"];
// a coluna começa algum índice da tabela (a chave da junção, do filtro ou da chave estrangeira)
const comecaIndice = async (tabela, coluna) => Number(await escalar(`
  SELECT COUNT(*) FROM sys.index_columns ic JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
  WHERE ic.object_id = OBJECT_ID(N'dbo.${tabela}') AND ic.key_ordinal = 1 AND c.name = N'${coluna}'`)) > 0;
// a migração 201 rodada aqui no meio do roteiro, sobre um banco com dados (prova a idempotência e o acerto da Quantidade do cadastro)
async function aplicar201() {
  const fs = require("fs");
  const pasta = path.join(API, "..", "sql", "migrations");
  const nome = fs.readdirSync(pasta).find((n) => n.startsWith("201_") && n.endsWith(".sql"));
  if (!nome) return ok(false, "a migração 201 existe");
  for (const lote of fs.readFileSync(path.join(pasta, nome), "utf8").split(/^\s*GO\s*$/gim).map((t) => t.trim()).filter(Boolean)) await q(lote);
}
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

  console.log("== a 201: os índices que faltavam (revisão de 23/11/2026, regra 3 do banco) e o histórico da exceção desfeita ==");
  for (const [t, c] of [["FinBlocos", "LoteId"], ["FinLivroBlocos", "BlocoId"], ["FinLivroBlocos", "CongregacaoId"], ["FinLivroBlocos", "LoteId"], ["FinLivroBlocos", "PessoaMembroId"],
    ["FinCentrosCusto", "CentroPaiId"], ["FinCentrosCusto", "AreaId"], ["FinFolhasDesfeitas", "BlocoId"], ["FinFolhasDesfeitas", "Folha"],
    // a regra de 24/11/2026 (a devolução parcial): a entrega de cada folha, a entrega que a entrada fecha
    ["FinFolhas", "SaidaId"], ["FinLivroBlocos", "SaidaId"], ["FinFolhasDesfeitas", "SaidaId"]]) {
    ok(await comecaIndice(t, c), `há índice que começa por ${t}.${c}`);
  }

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
  // revisão M7: a Quantidade do livro conta BLOCOS no cadastro e na chegada (antes o cadastro gravava as folhas)
  ok(Number(await escalar(`SELECT COUNT(*) FROM FinLivroBlocos WHERE Tipo = 'CADASTRO' AND LoteId = ${loteId} AND Quantidade = 200`)) === 1, "o livro registra o cadastro do lote (200 blocos)");
  ok(/série 2026 cadastrado: 200 blocos, folhas 70\.001 a 80\.000/.test(r.body.mensagem), "a mensagem do cadastro com o ponto do milhar nas folhas e a série sem ponto", r.body.mensagem);
  // o cadastro gravado antes da revisão (10.000 folhas): a 201 o acerta para 200 blocos, e rodar a 201 de novo não estraga
  await q(`UPDATE FinLivroBlocos SET Quantidade = 10000 WHERE Tipo = 'CADASTRO' AND LoteId = ${loteId}`);
  await aplicar201();
  await aplicar201();
  ok(Number(await escalar(`SELECT Quantidade FROM FinLivroBlocos WHERE Tipo = 'CADASTRO' AND LoteId = ${loteId}`)) === 200, "a 201 acerta o cadastro antigo para blocos e roda duas vezes sem estragar");
  ok(Number(await escalar(`SELECT COUNT(*) FROM AuditLog WHERE Acao = 'FIN_LOTE_CADASTRADO' AND RegistroId = ${loteId}`)) === 1, "a trilha registra o cadastro do lote");
  r = await POST(H, "lote", geral, { serie: 2026, primeiraFolha: 79951, totalFolhas: 100 });
  ok(r.status === 422 && /As folhas 79\.951 a 80\.050 cruzam o lote da série 2026 \(70\.001 a 80\.000\)/.test(r.body.mensagem), "um lote que cruza as folhas de outro é recusado", r.body);
  r = await POST(H, "lote", geral, { serie: 2026, primeiraFolha: 70001, totalFolhas: 75 });
  ok(r.status === 422, "o total que não fecha blocos de 50 é recusado");

  r = await POST(H, "entregar", geral, { primeiraFolha: 70051, congregacaoId: VILA_NOVA, pessoa: { nome: "Tesoureira de Vila Nova" } });
  ok(r.status === 422 && /O bloco 1\.401 ainda não chegou/.test(r.body.mensagem), "o bloco que não chegou da gráfica não se entrega", r.body);
  r = await POST(H, "chegada", geral, { loteId, ateFolha: 75000 });
  ok(r.status === 200 && r.body.blocos === 100, "a chegada até a folha 75.000: 100 blocos", r.body);
  r = await POST(H, "chegada", geral, { loteId, ateFolha: 75000 });
  ok(r.status === 200 && r.body.blocos === 0, "registrar a mesma chegada de novo não muda nada");
  ok((await POST(H, "chegada", geral, { loteId: 999999, ateFolha: 75000 })).status === 404, "lote que não existe: 404");
  r = await POST(H, "chegada", geral, { loteId, ateFolha: 90000 });
  ok(r.status === 422 && /A folha 90\.000 não é deste lote \(70\.001 a 80\.000\)/.test(r.body.mensagem), "folha de fora do lote na chegada é recusada", r.body);

  // revisão M2, M3 e M5: a data antes da chegada, a congregação inativa e o "levado pela área" que não é sim nem não
  const antesM = await retratoFin();
  r = await POST(H, "entregar", geral, { primeiraFolha: 70201, congregacaoId: CENTRAL, pessoa: { nome: "Tesoureira da Central" }, data: "2026-01-02" });
  ok(r.status === 422 && /antes da chegada/.test(r.body.mensagem), "a entrega com data antes da chegada do bloco é recusada", r.body);
  await q(`UPDATE Congregacoes SET Ativa = 0 WHERE CongregacaoId = ${BETA}`);
  r = await POST(H, "entregar", geral, { primeiraFolha: 70201, congregacaoId: BETA, pessoa: { nome: "Tesoureiro da Beta" } });
  await q(`UPDATE Congregacoes SET Ativa = 1 WHERE CongregacaoId = ${BETA}`);
  ok(r.status === 422 && /não está ativa/.test(r.body.mensagem), "a entrega a uma congregação inativa é recusada", r.body);
  for (const lixo of ["true", "false", 1, 0, "sim", [], {}]) {
    r = await POST(H, "entregar", geral, { primeiraFolha: 70201, congregacaoId: CENTRAL, pessoa: { nome: "x" }, levadoPelaArea: lixo });
    ok(r.status === 422 && /levado pela área/.test(r.body.mensagem), `"levado pela área" = ${JSON.stringify(lixo)} é recusado (nunca vira "não" calado)`, r.body);
  }
  ok((await retratoFin()) === antesM, "as entregas recusadas não mexeram no banco");

  r = await POST(H, "entregar", geral, { primeiraFolha: 70051, congregacaoId: VILA_NOVA, pessoa: { membroId: TESOUREIRA_LOCAL } });
  ok(r.status === 200 && r.body.mensagem === "Bloco 1.401 entregue a Vila Nova E2E.", "o bloco 1.401 entregue a Vila Nova", r.body);
  r = await POST(H, "entregar", geral, { primeiraFolha: 70051, congregacaoId: BETA, pessoa: { nome: "Outra pessoa" } });
  ok(r.status === 422 && /O bloco 1\.401 já foi entregue/.test(r.body.mensagem), "o mesmo bloco não sai duas vezes", r.body);
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70101, congregacaoId: VILA_NOVA, pessoa: { nome: "Rute (tesoureira)" }, levadoPelaArea: true })).status === 200, "o bloco 1.402 entregue a Vila Nova, levado pela área");
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70151, congregacaoId: BETA, pessoa: { nome: "Tesoureiro da Beta" } })).status === 200, "o bloco 1.403 entregue à Beta");
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70201, congregacaoId: 999, pessoa: { nome: "x" } })).status === 422, "congregação que não existe é recusada");
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70201, congregacaoId: CENTRAL, pessoa: { membroId: 987654 } })).status === 422, "pessoa que não existe é recusada");
  r = await POST(H, "entregar", geral, { primeiraFolha: 70202, congregacaoId: CENTRAL, pessoa: { nome: "x" } });
  ok(r.status === 422 && /Não há bloco que comece na folha 70\.202/.test(r.body.mensagem), "folha que não é a primeira de um bloco é recusada", r.body);
  const livro = await q(`SELECT l.Tipo, l.CongregacaoId, l.PessoaMembroId, l.PessoaNome, l.LevadoPelaArea, l.PrimeiraFolha, l.UltimaFolha, b.PrimeiraFolha AS BlocoPrimeira, b.UltimaFolha AS BlocoUltima
    FROM FinLivroBlocos l JOIN FinBlocos b ON b.BlocoId = l.BlocoId WHERE l.Tipo = 'SAIDA' ORDER BY l.RegistroId`);
  ok(livro.length === 3 && livro[0].PessoaMembroId === TESOUREIRA_LOCAL && livro[1].LevadoPelaArea === true && livro[2].PessoaNome === "Tesoureiro da Beta", "o livro registra cada saída, com quem levou e se foi pela área", livro);
  ok(livro.every((l) => l.PrimeiraFolha === l.BlocoPrimeira && l.UltimaFolha === l.BlocoUltima), "a saída guarda a faixa das folhas entregues: o bloco inteiro na primeira saída (regra de 24/11/2026)", livro);
  // uma folha do 1.401 com destino (a tela das folhas vem no incremento 2): o bloco passa a "em uso". A folha guarda a entrega que a usou.
  const b1401 = await escalar(`SELECT BlocoId FROM FinBlocos WHERE Numero = 1401`);
  const saida1401 = await escalar(`SELECT RegistroId FROM FinLivroBlocos WHERE Tipo = 'SAIDA' AND BlocoId = ${b1401}`);
  const saida1403 = await escalar(`SELECT RegistroId FROM FinLivroBlocos WHERE Tipo = 'SAIDA' AND BlocoId = (SELECT BlocoId FROM FinBlocos WHERE Numero = 1403)`);
  await q(`INSERT INTO FinFolhas (BlocoId, Folha, Destino, Observacao, RegistradoPor, SaidaId) VALUES (${b1401}, 70090, 'ARRANCADA', 'Rasgou na hora de preencher', ${TESOUREIRA_LOCAL}, ${saida1401})`);
  await recusa(`INSERT INTO FinFolhas (BlocoId, Folha, Destino, Observacao, RegistradoPor, SaidaId) VALUES (${b1401}, 70090, 'CANCELADA', 'de novo', ${TESOUREIRA_LOCAL}, ${saida1401})`, "a mesma folha com dois destinos");
  await recusa(`INSERT INTO FinFolhas (BlocoId, Folha, Destino, Observacao, RegistradoPor, SaidaId) VALUES (${b1401}, 70091, 'CANCELADA', '   ', ${TESOUREIRA_LOCAL}, ${saida1401})`, "folha cancelada sem a observação");
  await recusa(`INSERT INTO FinFolhas (BlocoId, Folha, Destino, Observacao, RegistradoPor) VALUES (${b1401}, 70092, 'LANCADA', NULL, ${TESOUREIRA_LOCAL})`, "folha com destino sem a entrega que a usou (regra de 24/11/2026)");
  const desfeita = (destino, motivo, saida = saida1401) => `INSERT INTO FinFolhasDesfeitas (FolhaId, BlocoId, Folha, Destino, Observacao, RegistradoPor, RegistradoEm, DesfeitaPor, Motivo, SaidaId)
    VALUES (999001, ${b1401}, 70092, '${destino}', 'x', ${TESOUREIRA_LOCAL}, SYSUTCDATETIME(), ${TESOUREIRO_GERAL}, '${motivo}', ${saida})`;
  await recusa(desfeita("CANCELADA", "   "), "exceção desfeita sem o motivo");
  await recusa(desfeita("LANCADA", "lançada"), "folha lançada no histórico das exceções desfeitas (o lançamento se corrige por estorno)");
  await recusa(desfeita("CANCELADA", "sem a entrega", "NULL"), "exceção desfeita sem a entrega que a usou");
  // o livro da regra de 24/11/2026: a saída com a faixa; a entrada com a saída que fecha, se foi parcial e as folhas livres que voltaram
  const livroDireto = (tipo, extra) => `INSERT INTO FinLivroBlocos (Tipo, BlocoId, CongregacaoId, PessoaNome, DataRegistro, RegistradoPor, ${Object.keys(extra).join(", ")})
    VALUES ('${tipo}', ${b1401}, ${VILA_NOVA}, N'Teste', '2026-11-20', ${TESOUREIRO_GERAL}, ${Object.values(extra).join(", ")})`;
  await recusa(livroDireto("SAIDA", { Parcial: 0 }), "saída sem a faixa das folhas");
  await recusa(livroDireto("SAIDA", { PrimeiraFolha: 70100, UltimaFolha: 70051 }), "saída com a faixa ao contrário");
  await recusa(livroDireto("ENTRADA", { FolhasLivres: 0 }), "entrada sem a saída que ela fecha");
  await recusa(livroDireto("ENTRADA", { SaidaId: saida1401, Parcial: 1, FolhasLivres: 0 }), "entrada parcial sem folha livre");
  await recusa(livroDireto("ENTRADA", { SaidaId: saida1401, Parcial: 0, FolhasLivres: -1 }), "entrada com folhas livres negativas");
  await recusa(livroDireto("ENTRADA", { SaidaId: saida1401, PrimeiraFolha: 70051, UltimaFolha: 70100, FolhasLivres: 0 }), "entrada com a faixa (a faixa é da saída)");
  await recusa(`INSERT INTO FinLivroBlocos (Tipo, LoteId, Quantidade, DataRegistro, RegistradoPor, Parcial) VALUES ('CHEGADA', ${loteId}, 1, '2026-11-20', ${TESOUREIRO_GERAL}, 1)`, "chegada marcada como parcial");
  await q(`INSERT INTO FinLivroBlocos (Tipo, BlocoId, CongregacaoId, PessoaNome, DataRegistro, RegistradoPor, SaidaId, FolhasLivres) VALUES ('ENTRADA', ${b1401}, ${VILA_NOVA}, N'Teste', '2026-11-20', ${TESOUREIRO_GERAL}, ${saida1403}, 3)`);
  await recusa(`INSERT INTO FinLivroBlocos (Tipo, BlocoId, CongregacaoId, PessoaNome, DataRegistro, RegistradoPor, SaidaId, FolhasLivres) VALUES ('ENTRADA', ${b1401}, ${VILA_NOVA}, N'Teste', '2026-11-20', ${TESOUREIRO_GERAL}, ${saida1403}, 3)`, "duas entradas fechando a mesma saída");
  await q(`DELETE FROM FinLivroBlocos WHERE Tipo = 'ENTRADA' AND SaidaId = ${saida1403}`);
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
  // incremento 1b (22/11/2026): a área vê o quadro do lote, como no desenho aprovado; e a lista diz quem está vendo (o título e o cabeçalho do módulo)
  ok(r.body.resumo.tipo === "lote" && r.body.resumo.lote && r.body.resumo.lote.blocos === 200, "a área vê o quadro do lote da gráfica (como no desenho)", r.body.resumo);
  ok(JSON.stringify(r.body.escopo) === JSON.stringify({ geral: false, congregacoes: 2, area: "Área Alfa E2E", congregacao: null }), "o escopo da área: 2 congregações da Área Alfa", r.body.escopo);
  r = await GET(H, "", local, {});
  ok(JSON.stringify(r.body.escopo) === JSON.stringify({ geral: false, congregacoes: 1, area: "Área Alfa E2E", congregacao: "Vila Nova E2E" }), "o escopo da congregação: Vila Nova", r.body.escopo);
  r = await GET(H, "", geral, {});
  const ativas = await escalar(`SELECT COUNT(*) FROM Congregacoes WHERE Ativa = 1`);
  ok(r.body.escopo.geral === true && r.body.escopo.congregacoes === ativas && r.body.escopo.area === null && r.body.escopo.congregacao === null, "o escopo da Geral: todas as congregações ativas", r.body.escopo);

  console.log("== a chegada no meio do primeiro bloco (revisão M6) ==");
  r = await POST(H, "lote", geral, { serie: 2027, primeiraFolha: 300001, totalFolhas: 100 });
  const loteM6 = r.body.loteId;
  r = await POST(H, "chegada", geral, { loteId: loteM6, ateFolha: 300010 });
  ok(r.status === 422 && /Até a folha 300\.010 nenhum bloco chegou inteiro: o bloco 6\.000 vai até a folha 300\.050/.test(r.body.mensagem), "a chegada no meio do 1º bloco não diz que já tinham chegado", r.body);
  ok(Number(await escalar(`SELECT COUNT(*) FROM FinBlocos WHERE LoteId = ${loteM6} AND ChegouEm IS NOT NULL`)) === 0, "nenhum bloco do lote ficou como chegado");
  r = await POST(H, "chegada", geral, { loteId: loteM6, ateFolha: 300050 });
  ok(r.status === 200 && r.body.blocos === 1, "até a última folha do 1º bloco: chegou 1 bloco", r.body);
  r = await POST(H, "chegada", geral, { loteId: loteM6, ateFolha: 300050 });
  ok(r.status === 200 && r.body.blocos === 0 && /já estavam registrados/.test(r.body.mensagem), "a mesma chegada de novo: já estavam registrados", r.body);
  ok(Number(await escalar(`SELECT Quantidade FROM FinLivroBlocos WHERE Tipo = 'CHEGADA' AND LoteId = ${loteM6}`)) === 1, "a chegada também conta blocos no livro");

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
  // revisão I4: as transações ligam o XACT_ABORT por lote e desligam antes de fechar (o roteiro usa uma conexão só: o que vazasse ficaria nela)
  ok(Number(await escalar(`SELECT @@OPTIONS & 16384`)) === 0, "depois das gravações, a conexão volta com o XACT_ABORT desligado");

  fim("e2e-200 (Financeiro: a base e os blocos de recibo)");
})().catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
