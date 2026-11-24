// e2e-201-financeiro-folhas-livro.js — FASE 10, Financeiro (módulo 2), incremento 2 (22/11/2026): as folhas de um bloco, a exceção da folha, o livro
// de entrada e saída, o rastreio e a devolução (rota FinBlocos) contra o SQL Server de verdade. Telas aprovadas: r17-blocos-folhas e r17-blocos-livro.
// Base: cenario-200 (a mesma do e2e-200), no LocalDB próprio do Financeiro:
//   E2E_INSTANCIA=fin E2E_BANCO=ieadespa_fin E2E_CS='Server=(localdb)\fin;Database=ieadespa_fin;Integrated Security=true' BASE=cenario-200 bash rodar.sh roteiro e2e-201-financeiro-folhas-livro.js
// Cobre: quem entra (folhas, livro e exceção com a permissão financeiro; rastreio e devolução só a Geral); o escopo (fora do escopo = não existe);
// a exceção (só em bloco com a congregação, uma vez por folha, com a observação); a devolução (datas, recusas, o livro e a trilha); o livro em páginas
// e os blocos "agora"; lixo em cada campo; e corridas em processos separados (a mesma folha, a mesma devolução, devolução × exceção).
// Revisão de 23/11/2026, a regra dele: desfazer a exceção da folha (só a Tesouraria Geral, com o motivo; o histórico em FinFolhasDesfeitas; não em
// bloco devolvido; a folha volta a poder ter destino), com a corrida desfazer × devolver.
// Regra dele de 24/11/2026 (no lugar da "devolução só de bloco cheio" de 23/11): a devolução é COMPLETA (toda folha da entrega com destino; o
// bloco fecha) ou PARCIAL (as folhas sem uso continuam livres e o bloco volta para a Tesouraria Geral, para sair de novo a partir da primeira folha
// livre, com a faixa guardada na saída); cada folha guarda a entrega que a usou. Com o acerto da 201 sobre os dados de antes e as corridas da
// reentrega e da devolução parcial × exceção.
// A base cenario-200 já traz a 201 (bash rodar.sh preparar-200).
const { spawn } = require("child_process");
const L = require("./lib");
const { q, um, escalar, ok, fim, GET, POST, GERAL, LIDER, API, path, hojeBr } = L;
const H = require(path.join(API, "FinBlocos/index.js"));

const TESOUREIRO_GERAL = 1002, TESOUREIRA_LOCAL = 1003;
const CENTRAL = 1, VILA_NOVA = 2, BETA = 3;
const geral = GERAL(TESOUREIRO_GERAL, ["financeiro"]);
const local = LIDER(TESOUREIRA_LOCAL, ["financeiro"], ["Vila Nova E2E"]);
const area = LIDER(TESOUREIRA_LOCAL, ["financeiro"], ["Central E2E", "Vila Nova E2E"], "AREA");
const semFinanceiro = LIDER(TESOUREIRA_LOCAL, ["pessoas"], ["Vila Nova E2E"]);

const TABELAS = ["FinBlocos", "FinFolhas", "FinLivroBlocos", "FinFolhasDesfeitas", "AuditLog"];
async function retratoFin() {
  const partes = [];
  for (const t of TABELAS) partes.push(JSON.stringify(await um(`SELECT COUNT(*) n, CHECKSUM_AGG(CHECKSUM(*)) c FROM ${t}`)));
  return partes.join("|");
}
async function disparar(chamadas) {
  const t0 = Date.now() + 6000 + chamadas.length * 600;
  return Promise.all(chamadas.map((spec) => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-r", path.join(__dirname, "shim-mssql.js"), path.join(__dirname, "worker.js"), JSON.stringify({ ...spec, t0 })], { env: process.env });
    let saida = ""; p.stdout.on("data", (d) => { saida += d; });
    p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { status: -1 }); });
  })));
}
const idDo = (numero) => escalar(`SELECT BlocoId FROM FinBlocos WHERE Numero = ${numero}`);
// O lançamento (incremento 3) ainda não existe: as folhas lançadas entram direto no banco, como na semeadura da homologação. Lança as folhas
// livres de `de` a `ate`, menos as de `exceto`, na entrega atual do bloco (a última saída).
async function lancarDireto(blocoId, de, ate, exceto = []) {
  await q(`WITH n AS (SELECT ${de} + v.number AS Folha FROM master.dbo.spt_values v WHERE v.type = 'P' AND v.number <= ${ate - de})
           INSERT INTO FinFolhas (BlocoId, Folha, Destino, RegistradoPor, SaidaId)
           SELECT ${blocoId}, n.Folha, 'LANCADA', ${TESOUREIRA_LOCAL},
                  (SELECT TOP 1 s.RegistroId FROM FinLivroBlocos s WHERE s.Tipo = 'SAIDA' AND s.BlocoId = ${blocoId} ORDER BY s.RegistroId DESC) FROM n
           WHERE NOT EXISTS (SELECT 1 FROM FinFolhas f WHERE f.Folha = n.Folha) ${exceto.length ? `AND n.Folha NOT IN (${exceto.join(", ")})` : ""}`);
}
// a migração 201 rodada aqui no meio do roteiro, sobre um banco com dados (prova o acerto dos dados de antes da regra de 24/11/2026)
async function aplicar201() {
  const fs = require("fs");
  const pasta = path.join(API, "..", "sql", "migrations");
  const nome = fs.readdirSync(pasta).find((n) => n.startsWith("201_") && n.endsWith(".sql"));
  if (!nome) return ok(false, "a migração 201 existe");
  for (const lote of fs.readFileSync(path.join(pasta, nome), "utf8").split(/^\s*GO\s*$/gim).map((t) => t.trim()).filter(Boolean)) await q(lote);
}
// o livro inteiro de quem vê (as páginas de 5, uma atrás da outra)
async function livroTodo(tok) {
  const primeira = (await GET(H, "livro", tok, {})).body;
  let registros = [...primeira.registros];
  for (let p = 2; (p - 1) * 5 < primeira.total; p++) registros = registros.concat((await GET(H, "livro", tok, { pagina: p })).body.registros);
  return registros;
}
const SAIDA_ATUAL = (blocoId) => `SELECT TOP 1 RegistroId FROM FinLivroBlocos WHERE Tipo = 'SAIDA' AND BlocoId = ${blocoId} ORDER BY RegistroId DESC`;
// nenhum bloco fica devolvido (fechado) com folha livre: com folha livre, a devolução é parcial
const devolvidosComFolhaLivre = () => escalar(`SELECT COUNT(*) FROM FinBlocos b
  WHERE b.Situacao = 'DEVOLVIDO' AND (SELECT COUNT(*) FROM FinFolhas f WHERE f.BlocoId = b.BlocoId) < b.UltimaFolha - b.PrimeiraFolha + 1`).then(Number);

(async () => {
  console.log("== o cenário: o lote, a chegada e as entregas ==");
  const hoje = hojeBr();
  let r = await POST(H, "lote", geral, { serie: 2026, primeiraFolha: 70001, totalFolhas: 10000 });
  ok(r.status === 201, "o lote 70.001 a 80.000 (200 blocos)", r.body);
  ok((await POST(H, "chegada", geral, { loteId: r.body.loteId, ateFolha: 75000, data: "2026-11-01" })).status === 200, "chegaram os blocos até a folha 75.000 em 01/11");
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70051, congregacaoId: VILA_NOVA, pessoa: { membroId: TESOUREIRA_LOCAL }, data: "2026-11-10" })).status === 200, "o 1.401 entregue a Vila Nova em 10/11");
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70101, congregacaoId: VILA_NOVA, pessoa: { nome: "Rute Santos" }, levadoPelaArea: true })).status === 200, "o 1.402 entregue a Vila Nova hoje, levado pela área");
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70151, congregacaoId: BETA, pessoa: { nome: "Tesoureiro da Beta" } })).status === 200, "o 1.403 entregue à Beta");
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70201, congregacaoId: CENTRAL, pessoa: { nome: "Tesoureira da Central" } })).status === 200, "o 1.404 entregue à Central");
  const [b1401, b1402, b1403, b1500] = [await idDo(1401), await idDo(1402), await idDo(1403), await idDo(1500)];

  console.log("== quem entra ==");
  const antes0 = await retratoFin();
  for (const [acao, metodo] of [["folhas", "GET"], ["livro", "GET"], ["folha", "POST"]]) {
    const semSessao = metodo === "GET" ? await GET(H, acao, null) : await POST(H, acao, null, {});
    const sem = metodo === "GET" ? await GET(H, acao, semFinanceiro) : await POST(H, acao, semFinanceiro, { folha: 70090, oQueAconteceu: "cancelada", observacao: "x" });
    ok(semSessao.status === 401 && sem.status === 403, `${metodo} ${acao}: 401 sem sessão e 403 sem a permissão financeiro`);
  }
  ok((await GET(H, "rastreio", local, { folha: 70051 })).status === 403, "a congregação não usa o rastreio (só a Tesouraria Geral)");
  ok((await POST(H, "devolver", local, { primeiraFolha: 70051, pessoa: { nome: "x" } })).status === 403, "a congregação não registra a entrada (só a Tesouraria Geral)");
  ok((await POST(H, "devolver", area, { primeiraFolha: 70051, pessoa: { nome: "x" } })).status === 403, "a área não registra a entrada");
  ok((await retratoFin()) === antes0, "as recusas não mexeram no banco");

  console.log("== a exceção da folha ==");
  r = await POST(H, "folha", local, { folha: 70090, oQueAconteceu: "cancelada", observacao: "Rasgou na hora de preencher" });
  ok(r.status === 200 && /70\.090 \(40ª do bloco 1\.401\)/.test(r.body.mensagem), "a tesouraria de Vila Nova cancela a folha 70.090 (a 40ª do bloco 1.401)", r.body);
  r = await POST(H, "folha", local, { folha: 70090, oQueAconteceu: "arrancada", observacao: "de novo" });
  ok(r.status === 409 && /já tem destino/.test(r.body.mensagem), "a mesma folha não ganha um segundo destino (409)", r.body);
  const foraA = await POST(H, "folha", local, { folha: 70160, oQueAconteceu: "cancelada", observacao: "x" });
  const foraB = await POST(H, "folha", local, { folha: 75001, oQueAconteceu: "cancelada", observacao: "x" });
  const naoExiste = await POST(H, "folha", local, { folha: 990001, oQueAconteceu: "cancelada", observacao: "x" });
  ok([foraA.status, foraB.status, naoExiste.status].every((s) => s === 404) && JSON.stringify(foraA.body) === JSON.stringify(naoExiste.body) && JSON.stringify(foraB.body) === JSON.stringify(naoExiste.body),
    "folha de bloco de outra congregação, de bloco ainda na Geral e folha que não existe: a mesma resposta (404)");
  r = await POST(H, "folha", geral, { folha: 75001, oQueAconteceu: "extraviada", observacao: "x" });
  ok(r.status === 422 && /ainda está na Tesouraria Geral/.test(r.body.mensagem), "nem a Geral dá destino a folha de bloco que não saiu", r.body);
  r = await POST(H, "folha", local, { folha: 70091, oQueAconteceu: "cancelada", observacao: "   " });
  ok(r.status === 422 && /observação/.test(r.body.mensagem), "sem a observação é recusada");
  r = await POST(H, "folha", area, { folha: 70120, oQueAconteceu: "arrancada", observacao: "Arrancada por engano" });
  ok(r.status === 200, "a área registra a exceção numa folha de Vila Nova (o 1.402)", r.body);
  r = await POST(H, "folha", geral, { folha: 70210, oQueAconteceu: "extraviada", observacao: "Sumiu no caminho" });
  ok(r.status === 200, "a Geral registra a exceção numa folha da Central (o 1.404)", r.body);
  const f = await um(`SELECT BlocoId, Destino, Observacao, RegistradoPor FROM FinFolhas WHERE Folha = 70090`);
  ok(f.BlocoId === b1401 && f.Destino === "CANCELADA" && f.Observacao === "Rasgou na hora de preencher" && f.RegistradoPor === TESOUREIRA_LOCAL, "a folha guardada com o bloco, o destino, a observação e quem registrou", f);
  ok(Number(await escalar(`SELECT COUNT(*) FROM AuditLog WHERE Acao = 'FIN_FOLHA_EXCECAO'`)) === 3, "a trilha tem as 3 exceções");

  console.log("== as folhas de um bloco ==");
  r = await GET(H, "folhas", local, {});
  ok(r.status === 200 && r.body.bloco && r.body.bloco.numero === 1402, "sem escolher, a congregação vê o bloco em uso entregue mais recente (o 1.402)", r.body.bloco);
  ok(r.body.opcoes.map((x) => x.numero).join() === "1401,1402" && r.body.opcoes.every((x) => x.congregacao === "Vila Nova E2E"), "o seletor tem só os blocos de Vila Nova", r.body.opcoes);
  ok(JSON.stringify(r.body.folhas) === JSON.stringify([{ folha: 70120, destino: "arrancada", observacao: "Arrancada por engano" }]) && r.body.bloco.usadas === 1 && r.body.bloco.livres === 49, "as folhas do 1.402: a 70.120 arrancada, 49 livres", r.body.folhas);
  r = await GET(H, "folhas", local, { bloco: b1401 });
  ok(r.status === 200 && r.body.bloco.numero === 1401 && r.body.bloco.primeiraFolha === 70051 && r.body.bloco.ultimaFolha === 70100 && r.body.bloco.situacao === "em-uso" && r.body.folhas[0].destino === "cancelada", "o 1.401 escolhido: 70.051 a 70.100, em uso, a 70.090 cancelada", r.body.bloco);
  const fx = [await GET(H, "folhas", local, { bloco: b1403 }), await GET(H, "folhas", local, { bloco: b1500 }), await GET(H, "folhas", local, { bloco: 9999999 })];
  ok(fx.every((x) => x.status === 404) && fx.every((x) => JSON.stringify(x.body) === JSON.stringify(fx[2].body)), "bloco de outra congregação, bloco na Geral e bloco que não existe: a mesma resposta (404)");
  r = await GET(H, "folhas", area, {});
  ok(r.status === 200 && r.body.opcoes.map((x) => x.numero).join() === "1401,1402,1404", "a área (Central e Vila Nova) escolhe entre os blocos das suas congregações", r.body.opcoes);
  r = await GET(H, "folhas", geral, {});
  ok(r.status === 200 && r.body.opcoes.map((x) => x.numero).join() === "1401,1402,1403,1404", "a Geral escolhe entre todos os entregues", r.body.opcoes);
  ok(r.body.escopo && r.body.escopo.geral === true, "a resposta diz quem está vendo");

  console.log("== o rastreio e a devolução ==");
  r = await GET(H, "rastreio", geral, { folha: 70051 });
  ok(r.status === 200 && r.body.bloco.numero === 1401 && r.body.bloco.congregacao.nome === "Vila Nova E2E" && r.body.bloco.entregueEm === "2026-11-10", "o rastreio pela primeira folha: o 1.401, com Vila Nova desde 10/11", r.body.bloco);
  ok(JSON.stringify(r.body.contagem) === JSON.stringify({ lancadas: 0, canceladas: 1, arrancadas: 0, extraviadas: 0, livres: 49 }), "o rastreio conta as folhas: 1 cancelada, 49 livres", r.body.contagem);
  ok(r.body.pessoas[0] && r.body.pessoas[0].membroId === TESOUREIRA_LOCAL && r.body.pessoas[0].papel === "quem levou o bloco", "a primeira pessoa que pode devolver é quem levou o bloco", r.body.pessoas);
  ok((await GET(H, "rastreio", geral, { folha: "70075" })).body.bloco.numero === 1401, "qualquer folha do bloco também acha o rastreio");
  ok((await GET(H, "rastreio", geral, { folha: 1 })).status === 422 && (await GET(H, "rastreio", geral, { folha: "abc" })).status === 422, "folha que não existe ou que não é número: 422");
  const antes1 = await retratoFin();
  ok((await POST(H, "devolver", geral, { primeiraFolha: 70051, pessoa: { nome: "Lia Fontes" }, data: "2026-11-01" })).status === 422, "devolução com data antes da entrega é recusada");
  ok((await POST(H, "devolver", geral, { primeiraFolha: 70051, pessoa: { nome: "Lia Fontes" }, data: "2099-01-01" })).status === 422, "devolução com data no futuro é recusada");
  ok((await POST(H, "devolver", geral, { primeiraFolha: 70052, pessoa: { nome: "Lia Fontes" } })).status === 422, "folha que não é a primeira de um bloco é recusada");
  ok((await POST(H, "devolver", geral, { primeiraFolha: 75001, pessoa: { nome: "Lia Fontes" } })).status === 422, "bloco que não saiu da Geral não volta");
  ok((await POST(H, "devolver", geral, { primeiraFolha: 70051, pessoa: { membroId: 987654 } })).status === 422, "pessoa que não existe é recusada");
  ok((await POST(H, "devolver", geral, { primeiraFolha: 70051, pessoa: {} })).status === 422, "sem dizer quem devolveu é recusada");
  // a regra dele (24/11/2026): a devolução é completa (o normal: toda folha da entrega com destino) ou parcial (a exceção). A completa com folha
  // livre é recusada e diz para marcar parcial; nunca manda anular a folha em branco (a recusa de 23/11 saiu)
  r = await POST(H, "devolver", geral, { primeiraFolha: 70051, pessoa: { nome: "Lia Fontes" } });
  ok(r.status === 422 && /^O bloco 1\.401 ainda tem 49 folhas livres: /.test(r.body.mensagem) && /parcial/.test(r.body.mensagem) && !/anul|toda folha precisa/i.test(r.body.mensagem),
    "a devolução completa do bloco com 49 folhas livres é recusada e diz para marcar parcial (sem mandar anular a folha em branco)", r.body);
  for (const lixo of ["sim", "true", 1, [], {}]) {
    r = await POST(H, "devolver", geral, { primeiraFolha: 70051, pessoa: { nome: "Lia Fontes" }, parcial: lixo });
    ok(r.status === 422 && r.body.mensagem === "Diga se a devolução é completa ou parcial.", `"parcial" = ${JSON.stringify(lixo)} é recusado (nunca vira "completa" calada)`, r.body);
  }
  ok((await retratoFin()) === antes1, "as devoluções recusadas não mexeram no banco");
  await lancarDireto(b1401, 70051, 70100, [70091]);
  const antes2 = await retratoFin();
  r = await POST(H, "devolver", geral, { primeiraFolha: 70051, pessoa: { nome: "Lia Fontes" } });
  ok(r.status === 422 && /^O bloco 1\.401 ainda tem 1 folha livre: /.test(r.body.mensagem), "com 1 folha livre a completa ainda é recusada (a mensagem no singular)", r.body);
  ok((await retratoFin()) === antes2, "e não mexeu no banco");

  console.log("== desfazer a exceção da folha (regra dele, 23/11/2026: só a Tesouraria Geral, com o motivo) ==");
  ok((await POST(H, "desfazer-folha", null, { folha: 70090, motivo: "x" })).status === 401, "sem sessão: 401");
  ok((await POST(H, "desfazer-folha", local, { folha: 70090, motivo: "x" })).status === 403, "a congregação não desfaz (403)");
  ok((await POST(H, "desfazer-folha", area, { folha: 70090, motivo: "x" })).status === 403, "a área não desfaz (403)");
  r = await POST(H, "desfazer-folha", geral, { folha: 70090, motivo: "   " });
  ok(r.status === 422 && /motivo/.test(r.body.mensagem), "sem o motivo é recusado", r.body);
  r = await POST(H, "desfazer-folha", geral, { folha: 70091, motivo: "x" });
  ok(r.status === 422 && /A folha 70\.091 não tem exceção para desfazer/.test(r.body.mensagem), "a folha livre não tem o que desfazer", r.body);
  r = await POST(H, "desfazer-folha", geral, { folha: 70060, motivo: "x" });
  ok(r.status === 422 && /A folha 70\.060 foi lançada/.test(r.body.mensagem), "a folha lançada não se desfaz aqui", r.body);
  r = await POST(H, "desfazer-folha", geral, { folha: 990001, motivo: "x" });
  ok(r.status === 422 && /Nenhum bloco tem a folha 990\.001/.test(r.body.mensagem), "folha que não existe", r.body);
  ok((await retratoFin()) === antes2, "os pedidos recusados não mexeram no banco");
  const folhaAntiga = await um(`SELECT FolhaId, CONVERT(varchar(30), RegistradoEm, 126) AS Em FROM FinFolhas WHERE Folha = 70090`);
  r = await POST(H, "desfazer-folha", geral, { folha: 70090, motivo: "Marcada na folha errada" });
  ok(r.status === 200 && r.body.mensagem === "Folha 70.090 (40ª do bloco 1.401) livre de novo: a exceção (cancelada) foi desfeita.", "a Tesouraria Geral desfaz a exceção da 70.090", r.body);
  ok(Number(await escalar(`SELECT COUNT(*) FROM FinFolhas WHERE Folha = 70090`)) === 0, "a folha fica livre");
  const hist = await um(`SELECT FolhaId, BlocoId, Destino, Observacao, RegistradoPor, CONVERT(varchar(30), RegistradoEm, 126) AS Em, DesfeitaPor, DesfeitaEm, Motivo FROM FinFolhasDesfeitas WHERE Folha = 70090`);
  ok(hist && hist.FolhaId === folhaAntiga.FolhaId && hist.BlocoId === b1401 && hist.Destino === "CANCELADA" && hist.Observacao === "Rasgou na hora de preencher" && hist.RegistradoPor === TESOUREIRA_LOCAL
    && hist.Em === folhaAntiga.Em && hist.DesfeitaPor === TESOUREIRO_GERAL && !!hist.DesfeitaEm && hist.Motivo === "Marcada na folha errada",
    "o histórico guarda tudo: quem marcou e quando, o que era, quem desfez, quando e por quê", hist);
  ok(Number(await escalar(`SELECT COUNT(*) FROM AuditLog WHERE Acao = 'FIN_FOLHA_DESFEITA' AND RegistroId = ${folhaAntiga.FolhaId}`)) === 1, "a trilha registra o desfazer");
  r = await POST(H, "desfazer-folha", geral, { folha: 70090, motivo: "de novo" });
  ok(r.status === 422 && /não tem exceção para desfazer/.test(r.body.mensagem), "desfazer de novo: nada a desfazer", r.body);
  r = await POST(H, "folha", local, { folha: 70090, oQueAconteceu: "arrancada", observacao: "Arrancada de verdade" });
  ok(r.status === 200, "a folha desfeita volta a poder ter destino", r.body);
  r = await POST(H, "folha", local, { folha: 70091, oQueAconteceu: "cancelada", observacao: "Ficou em branco" });
  ok(r.status === 200, "a última folha livre do 1.401 cancelada: o bloco está cheio", r.body);
  const antes3 = await retratoFin();
  r = await POST(H, "devolver", geral, { primeiraFolha: 70051, pessoa: { nome: "Lia Fontes" }, parcial: true });
  ok(r.status === 422 && r.body.mensagem === "O bloco 1.401 não tem folha livre: a devolução é completa.", "a devolução parcial do bloco cheio é recusada", r.body);
  ok((await retratoFin()) === antes3, "e não mexeu no banco");

  r = await POST(H, "devolver", geral, { primeiraFolha: 70051, pessoa: { nome: "Lia Fontes" } });
  ok(r.status === 200 && /1\.401/.test(r.body.mensagem), "o 1.401 cheio devolvido por Lia Fontes", r.body);
  const bd = await um(`SELECT Situacao, CONVERT(char(10), DevolvidoEm, 23) AS Dia FROM FinBlocos WHERE BlocoId = ${b1401}`);
  ok(bd.Situacao === "DEVOLVIDO" && bd.Dia === hoje, "o bloco fica devolvido, com a data de hoje", bd);
  const ent = await um(`SELECT CongregacaoId, PessoaMembroId, PessoaNome, RegistradoPor FROM FinLivroBlocos WHERE Tipo = 'ENTRADA' AND BlocoId = ${b1401}`);
  ok(ent && ent.CongregacaoId === VILA_NOVA && ent.PessoaMembroId === null && ent.PessoaNome === "Lia Fontes" && ent.RegistradoPor === TESOUREIRO_GERAL, "o livro registra a entrada: de Vila Nova, devolvido por Lia Fontes, recebido por quem registrou", ent);
  const ent2 = await um(`SELECT SaidaId, Parcial, FolhasLivres FROM FinLivroBlocos WHERE Tipo = 'ENTRADA' AND BlocoId = ${b1401}`);
  ok(ent2.SaidaId === await escalar(SAIDA_ATUAL(b1401)) && ent2.Parcial === false && ent2.FolhasLivres === 0, "a entrada completa fecha a saída do bloco, sem folha livre", ent2);
  ok(Number(await escalar(`SELECT COUNT(*) FROM AuditLog WHERE Acao = 'FIN_BLOCO_DEVOLVIDO' AND RegistroId = ${b1401}`)) === 1, "a trilha registra a devolução");
  r = await POST(H, "devolver", geral, { primeiraFolha: 70051, pessoa: { nome: "Lia Fontes" } });
  ok(r.status === 422 && /já foi devolvido/.test(r.body.mensagem), "o mesmo bloco não volta duas vezes", r.body);
  r = await POST(H, "folha", local, { folha: 70091, oQueAconteceu: "cancelada", observacao: "depois de devolvido" });
  ok(r.status === 422 && /já foi devolvido/.test(r.body.mensagem), "a folha de bloco devolvido não muda mais", r.body);
  r = await POST(H, "desfazer-folha", geral, { folha: 70090, motivo: "depois de devolvido" });
  ok(r.status === 422 && /O bloco 1\.401 já foi devolvido/.test(r.body.mensagem), "nem a Tesouraria Geral desfaz exceção de bloco devolvido", r.body);
  r = await POST(H, "entregar", geral, { primeiraFolha: 70051, congregacaoId: VILA_NOVA, pessoa: { nome: "x" } });
  ok(r.status === 422 && /^O bloco 1\.401 já foi devolvido em \d\d\/\d\d\/\d{4}\.$/.test(r.body.mensagem), "o bloco devolvido não sai de novo, e a recusa diz que ele já voltou (revisão M4)", r.body);
  ok((await devolvidosComFolhaLivre()) === 0, "nenhum bloco devolvido com folha livre");
  r = await GET(H, "folhas", local, {});
  ok(r.body.bloco.numero === 1402 && r.body.opcoes.find((x) => x.numero === 1401).situacao === "fechado", "o devolvido continua no seletor, como fechado", r.body.opcoes);

  console.log("== o livro ==");
  const totalLivro = Number(await escalar(`SELECT COUNT(*) FROM FinLivroBlocos`));
  r = await GET(H, "livro", geral, {});
  ok(r.status === 200 && r.body.total === totalLivro && r.body.registros.length === 5 && r.body.porPagina === 5, "a Geral vê o livro inteiro em páginas de 5", { total: r.body.total, n: r.body.registros.length });
  const e0 = r.body.registros[0];
  ok(e0.tipo === "entrada" && e0.bloco === 1401 && e0.congregacao === "Vila Nova E2E" && e0.pessoa === "Lia Fontes"
    && JSON.stringify(e0.contagem) === JSON.stringify({ lancadas: 48, canceladas: 1, arrancadas: 1, extraviadas: 0, livres: 0 }), "o mais novo primeiro: a entrada do 1.401, com a contagem das folhas", e0);
  ok(r.body.registros.some((x) => x.tipo === "saida" && x.bloco === 1402 && x.levadoPelaArea === true && x.pessoa === "Rute Santos"), "a saída do 1.402 diz que foi levada pela área");
  ok(r.body.agora === null, "a Geral não tem o quadro \"agora\"");
  const ult = await GET(H, "livro", geral, { pagina: 2, porPagina: 5 });
  ok([...r.body.registros, ...ult.body.registros].some((x) => x.tipo === "cadastro" && x.lote && x.lote.blocos === 200 && x.quantidade === 200), "o cadastro do lote está no livro (200 blocos; a Quantidade conta blocos, revisão M7)", ult.body.registros);
  ok((await GET(H, "livro", geral, { porPagina: 3 })).body.registros.length === 3, "no celular, páginas de 3");
  r = await GET(H, "livro", local, {});
  ok(r.status === 200 && r.body.total === 3 && r.body.registros.every((x) => ["saida", "entrada"].includes(x.tipo) && x.congregacao === "Vila Nova E2E"), "a congregação vê só as saídas e entradas dela (3)", r.body.registros);
  ok(JSON.stringify(r.body.agora) === JSON.stringify({ emUso: 1, esperando: 0, aDevolver: 0 }), "\"Seus blocos agora\": 1 em uso", r.body.agora);
  r = await GET(H, "livro", area, {});
  ok(r.body.total === 4 && JSON.stringify(r.body.agora) === JSON.stringify({ emUso: 2, esperando: 0, aDevolver: 0 }), "a área vê o livro de Central e Vila Nova e os blocos dela agora", r.body.agora);

  console.log("== a 201 sobre os dados de antes da regra de 24/11/2026 (o acerto que roda na homologação) ==");
  // cada bloco saiu uma vez só: a 201 acha a faixa de cada saída, a saída que cada entrada fecha, as folhas livres da entrada e a entrega de cada
  // folha. Simula o banco de antes (as colunas vazias, com a conferência desligada), roda a 201 duas vezes e liga a conferência de novo.
  const fotoLivro = () => q(`SELECT RegistroId, SaidaId, PrimeiraFolha, UltimaFolha, Parcial, FolhasLivres FROM FinLivroBlocos ORDER BY RegistroId`).then(JSON.stringify);
  const fotoFolhas = () => q(`SELECT FolhaId, SaidaId FROM FinFolhas ORDER BY FolhaId`).then(JSON.stringify);
  const [livroAntes, folhasAntes] = [await fotoLivro(), await fotoFolhas()];
  ok(Number(await escalar(`SELECT COUNT(*) FROM FinFolhas WHERE SaidaId IS NOT NULL`)) > 50 && Number(await escalar(`SELECT COUNT(*) FROM FinLivroBlocos WHERE SaidaId IS NOT NULL`)) === 1, "há folhas e entrada para o acerto conferir");
  await q(`ALTER TABLE FinFolhas NOCHECK CONSTRAINT CK_FinFolhas_Saida; ALTER TABLE FinLivroBlocos NOCHECK CONSTRAINT CK_FinLivroBlocos_Faixa; ALTER TABLE FinLivroBlocos NOCHECK CONSTRAINT CK_FinLivroBlocos_Entrada`);
  await q(`UPDATE FinFolhas SET SaidaId = NULL; UPDATE FinLivroBlocos SET SaidaId = NULL, PrimeiraFolha = NULL, UltimaFolha = NULL, FolhasLivres = NULL`);
  await aplicar201();
  await aplicar201();
  let conferiu = true;
  try { await q(`ALTER TABLE FinFolhas WITH CHECK CHECK CONSTRAINT CK_FinFolhas_Saida; ALTER TABLE FinLivroBlocos WITH CHECK CHECK CONSTRAINT CK_FinLivroBlocos_Faixa; ALTER TABLE FinLivroBlocos WITH CHECK CHECK CONSTRAINT CK_FinLivroBlocos_Entrada`); }
  catch (e) { conferiu = false; console.log(e.message); }
  ok(conferiu && Number(await escalar(`SELECT COUNT(*) FROM sys.check_constraints WHERE name IN ('CK_FinFolhas_Saida', 'CK_FinLivroBlocos_Faixa', 'CK_FinLivroBlocos_Entrada') AND is_disabled = 0 AND is_not_trusted = 0`)) === 3,
    "depois do acerto, a conferência do banco liga de novo e vale para todas as linhas");
  ok((await fotoLivro()) === livroAntes && (await fotoFolhas()) === folhasAntes, "a 201 (duas vezes) refaz a faixa das saídas, a saída de cada entrada, as folhas livres e a entrega de cada folha");

  console.log("== lixo em cada campo ==");
  // o 1.404 cheio (a 70.210 extraviada e as outras lançadas), para o lixo da devolução chegar até o fim; a 70.131 cancelada, para o do desfazer
  await lancarDireto(await idDo(1404), 70201, 70250);
  ok((await POST(H, "folha", local, { folha: 70131, oQueAconteceu: "cancelada", observacao: "para o lixo" })).status === 200, "a 70.131 cancelada (base do lixo do desfazer)");
  const quebras = [], mudancas = [];
  const casos = [
    [local, "folha", { folha: 70130, oQueAconteceu: "cancelada", observacao: "Rasgou" }, ["folha", "oQueAconteceu", "observacao"]],
    [geral, "devolver", { primeiraFolha: 70201, pessoa: { nome: "Fulano" } }, ["primeiraFolha", "pessoa", "data", "parcial"]],
    [geral, "desfazer-folha", { folha: 70131, motivo: "Engano" }, ["folha", "motivo"]]
  ];
  for (const [tok, acao, base, campos] of casos) for (const campo of campos) for (const lixo of L.LIXO) {
    const corpo = { ...base };
    if (lixo === undefined) delete corpo[campo]; else corpo[campo] = lixo;
    const antes = await retratoFin();
    const res = await POST(H, acao, tok, corpo);
    if (res.status === 500 || ![200, 404, 409, 422].includes(res.status)) quebras.push(`${acao}.${campo}=${JSON.stringify(lixo).slice(0, 30)} -> ${res.status}`);
    else if (res.status >= 400 && (await retratoFin()) !== antes) mudancas.push(`${acao}.${campo}=${JSON.stringify(lixo).slice(0, 30)}`);
    if (res.body && /SELECT |INSERT |UPDATE |mssql|tedious|node_modules/i.test(JSON.stringify(res.body))) quebras.push(`${acao}.${campo} vazou texto interno`);
  }
  for (const [tok, acao, campo] of [[local, "folhas", "bloco"], [local, "livro", "pagina"], [local, "livro", "porPagina"], [geral, "rastreio", "folha"]]) for (const lixo of L.LIXO) {
    if (lixo === undefined) continue;
    const res = await GET(H, acao, tok, { [campo]: typeof lixo === "object" && lixo !== null ? JSON.stringify(lixo) : lixo });
    if (res.status === 500 || ![200, 404, 422].includes(res.status)) quebras.push(`GET ${acao}.${campo}=${JSON.stringify(lixo).slice(0, 30)} -> ${res.status}`);
    else if (res.status === 200 && acao === "folhas" && res.body.bloco && res.body.bloco.congregacao.id !== VILA_NOVA) quebras.push(`GET folhas ${JSON.stringify(lixo).slice(0, 30)} trouxe bloco de fora`);
    else if (res.status === 200 && acao === "livro" && res.body.registros.some((x) => x.congregacao !== "Vila Nova E2E")) quebras.push(`GET livro ${JSON.stringify(lixo).slice(0, 30)} trouxe registro de fora`);
    if (res.body && /SELECT |INSERT |mssql|tedious|node_modules/i.test(JSON.stringify(res.body))) quebras.push(`GET ${acao}.${campo} vazou texto interno`);
  }
  ok(quebras.length === 0, "nenhuma chamada com lixo dá 500, vaza texto interno ou traz registro de fora", quebras.slice(0, 6));
  ok(mudancas.length === 0, "chamada recusada nunca altera o banco", mudancas.slice(0, 6));

  console.log("== a devolução parcial e a reentrega (regra dele, 24/11/2026) ==");
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70501, congregacaoId: BETA, pessoa: { nome: "Tesoureiro da Beta" }, data: "2026-11-05" })).status === 200, "o 1.410 entregue à Beta em 05/11");
  const b1410 = await idDo(1410);
  const saida1 = Number(await escalar(SAIDA_ATUAL(b1410)));
  await lancarDireto(b1410, 70501, 70520);
  ok((await POST(H, "folha", geral, { folha: 70530, oQueAconteceu: "extraviada", observacao: "Sumiu na Beta" })).status === 200, "na Beta, 20 folhas lançadas e a 70.530 extraviada (29 livres)");
  r = await POST(H, "devolver", geral, { primeiraFolha: 70501, pessoa: { nome: "Tesoureiro da Beta" }, parcial: true, data: "2026-11-04" });
  ok(r.status === 422 && /antes da entrega/.test(r.body.mensagem), "a parcial também confere a data contra a entrega", r.body);
  r = await POST(H, "devolver", geral, { primeiraFolha: 70501, pessoa: { nome: "Tesoureiro da Beta" }, parcial: true, data: "2026-11-12" });
  ok(r.status === 200 && r.body.mensagem === "Bloco 1.410 devolvido em parte: está de novo com a Tesouraria Geral, com 29 folhas livres para outra entrega.", "a devolução parcial do 1.410 em 12/11", r.body);
  const bp = await um(`SELECT Situacao, CongregacaoId, EntregueEm, DevolvidoEm, CONVERT(char(10), ChegouEm, 23) AS Chegou FROM FinBlocos WHERE BlocoId = ${b1410}`);
  ok(bp.Situacao === "NA_GERAL" && bp.CongregacaoId === null && bp.EntregueEm === null && bp.DevolvidoEm === null && bp.Chegou === "2026-11-01", "o bloco volta para a Tesouraria Geral (sem congregação), não fica fechado, e a chegada da gráfica continua", bp);
  const entP = await um(`SELECT CongregacaoId, PessoaNome, SaidaId, Parcial, FolhasLivres, CONVERT(char(10), DataRegistro, 23) AS Dia FROM FinLivroBlocos WHERE Tipo = 'ENTRADA' AND BlocoId = ${b1410}`);
  ok(entP.CongregacaoId === BETA && entP.SaidaId === saida1 && entP.Parcial === true && entP.FolhasLivres === 29 && entP.Dia === "2026-11-12", "o livro registra a entrada parcial: da Beta, fechando a 1ª saída, com as 29 folhas livres", entP);
  ok(Number(await escalar(`SELECT COUNT(*) FROM FinFolhas WHERE BlocoId = ${b1410}`)) === 21 && Number(await escalar(`SELECT COUNT(*) FROM FinFolhas WHERE BlocoId = ${b1410} AND SaidaId = ${saida1}`)) === 21,
    "as folhas sem uso continuam livres (nenhuma anulada) e as 21 usadas guardam a 1ª entrega");
  ok(Number(await escalar(`SELECT COUNT(*) FROM AuditLog WHERE Acao = 'FIN_BLOCO_DEVOLVIDO' AND RegistroId = ${b1410} AND DadosDepois LIKE '%"parcial":true%' AND DadosDepois LIKE '%"folhasLivres":29%'`)) === 1, "a trilha registra a devolução parcial e as folhas livres");
  const antesP = await retratoFin();
  r = await POST(H, "folha", geral, { folha: 70540, oQueAconteceu: "cancelada", observacao: "x" });
  ok(r.status === 422 && /1\.410 ainda está na Tesouraria Geral/.test(r.body.mensagem), "com o bloco de volta na Geral, a folha livre não ganha destino", r.body);
  r = await POST(H, "desfazer-folha", geral, { folha: 70530, motivo: "x" });
  ok(r.status === 422 && r.body.mensagem === "A folha 70.530 voltou com o bloco 1.410 numa devolução: as folhas que já voltaram não mudam mais.", "a exceção de uma entrega que já voltou não se desfaz", r.body);
  ok((await GET(H, "folhas", local, { bloco: b1410 })).status === 404, "a congregação não vê o bloco que está na Geral");
  r = await GET(H, "rastreio", geral, { folha: 70501 });
  ok(r.status === 200 && r.body.bloco.situacao === "na-geral" && r.body.bloco.livres === 29 && r.body.bloco.congregacao === null, "o rastreio: o 1.410 na Geral, com 29 folhas livres", r.body.bloco);
  r = await POST(H, "entregar", geral, { primeiraFolha: 70540, congregacaoId: VILA_NOVA, pessoa: { nome: "x" } });
  ok(r.status === 422 && r.body.mensagem === "O bloco 1.410 volta a sair pela folha 70.521, a primeira livre.", "a reentrega pela folha do meio é recusada e diz a primeira folha livre", r.body);
  r = await POST(H, "entregar", geral, { primeiraFolha: 70521, congregacaoId: VILA_NOVA, pessoa: { nome: "x" }, data: "2026-11-11" });
  ok(r.status === 422 && r.body.mensagem === "A data da entrega é antes da última devolução do bloco (12/11/2026).", "a reentrega com data antes da devolução parcial é recusada", r.body);
  r = await POST(H, "devolver", geral, { primeiraFolha: 70501, pessoa: { nome: "x" }, parcial: true });
  ok(r.status === 422 && /1\.410 ainda está na Tesouraria Geral/.test(r.body.mensagem), "o bloco devolvido em parte não volta de novo antes de sair", r.body);
  ok((await retratoFin()) === antesP, "as recusas não mexeram no banco");
  r = await POST(H, "entregar", geral, { primeiraFolha: 70521, congregacaoId: VILA_NOVA, pessoa: { membroId: TESOUREIRA_LOCAL }, data: "2026-11-13" });
  ok(r.status === 200 && r.body.mensagem === "Bloco 1.410 entregue a Vila Nova E2E (folhas 70.521 a 70.550).", "o 1.410 volta a sair, para Vila Nova, a partir da primeira folha livre (70.521)", r.body);
  const saida2 = Number(await escalar(SAIDA_ATUAL(b1410)));
  const s2 = await um(`SELECT CongregacaoId, PrimeiraFolha, UltimaFolha FROM FinLivroBlocos WHERE RegistroId = ${saida2}`);
  ok(saida2 !== saida1 && s2.CongregacaoId === VILA_NOVA && s2.PrimeiraFolha === 70521 && s2.UltimaFolha === 70550, "a 2ª saída guarda a faixa: 70.521 a 70.550", s2);
  r = await POST(H, "folha", local, { folha: 70525, oQueAconteceu: "cancelada", observacao: "Rasgou em Vila Nova" });
  ok(r.status === 200, "Vila Nova cancela a 70.525 (uma folha livre da entrega dela)", r.body);
  ok((await POST(H, "folha", local, { folha: 70530, oQueAconteceu: "cancelada", observacao: "x" })).status === 409 && (await POST(H, "folha", local, { folha: 70510, oQueAconteceu: "cancelada", observacao: "x" })).status === 409,
    "as folhas que a Beta usou continuam com o destino delas (409)");
  r = await POST(H, "desfazer-folha", geral, { folha: 70530, motivo: "x" });
  ok(r.status === 422 && /voltou com o bloco 1\.410/.test(r.body.mensagem), "nem na nova entrega se desfaz a exceção da entrega que já voltou", r.body);
  const quem = await q(`SELECT f.Folha, s.CongregacaoId FROM FinFolhas f JOIN FinLivroBlocos s ON s.RegistroId = f.SaidaId WHERE f.Folha IN (70510, 70530, 70525) ORDER BY f.Folha`);
  ok(JSON.stringify(quem.map((x) => [x.Folha, x.CongregacaoId])) === JSON.stringify([[70510, BETA], [70525, VILA_NOVA], [70530, BETA]]),
    "quem usou cada folha continua no histórico dela (a Beta, a 70.510 e a 70.530; Vila Nova, a 70.525)", quem);
  r = await GET(H, "folhas", local, { bloco: b1410 });
  const naGrade = (n) => r.body.folhas.find((x) => x.folha === n) || {};
  ok(r.status === 200 && r.body.bloco.livres === 28 && r.body.folhas.length === 22 && naGrade(70530).destino === "extraviada" && naGrade(70530).observacao === null && naGrade(70525).observacao === "Rasgou em Vila Nova",
    "Vila Nova vê as folhas do 1.410: as da Beta aparecem usadas, sem a observação da Beta; a dela, com a observação", r.body.folhas.slice(-3));
  r = await GET(H, "folhas", geral, { bloco: b1410 });
  ok(r.body.folhas.find((x) => x.folha === 70530).observacao === "Sumiu na Beta", "a Tesouraria Geral vê a observação de todas as entregas");
  r = await GET(H, "rastreio", geral, { folha: 70521 });
  ok(JSON.stringify(r.body.contagem) === JSON.stringify({ lancadas: 0, canceladas: 1, arrancadas: 0, extraviadas: 0, livres: 28 }), "o rastreio conta as folhas da entrega em curso (1 cancelada, 28 livres)", r.body.contagem);
  r = await POST(H, "devolver", geral, { primeiraFolha: 70501, pessoa: { nome: "Rute Santos" } });
  ok(r.status === 422 && /^O bloco 1\.410 ainda tem 28 folhas livres: /.test(r.body.mensagem), "a devolução completa com 28 livres é recusada", r.body);
  await lancarDireto(b1410, 70521, 70550);
  r = await POST(H, "devolver", geral, { primeiraFolha: 70521, pessoa: { nome: "Rute Santos" } });
  ok(r.status === 200 && r.body.mensagem === "Bloco 1.410 devolvido: está de novo com a Tesouraria Geral.", "o 1.410 cheio volta completo (pela primeira folha da 2ª entrega)", r.body);
  ok((await um(`SELECT Situacao FROM FinBlocos WHERE BlocoId = ${b1410}`)).Situacao === "DEVOLVIDO", "e fica fechado");
  const ents = await q(`SELECT SaidaId, Parcial, FolhasLivres FROM FinLivroBlocos WHERE Tipo = 'ENTRADA' AND BlocoId = ${b1410} ORDER BY RegistroId`);
  ok(ents.length === 2 && ents[1].SaidaId === saida2 && ents[1].Parcial === false && ents[1].FolhasLivres === 0, "a 2ª entrada fecha a 2ª saída, completa", ents);
  // a prova do histórico: a contagem da entrada parcial não muda depois da reentrega e da volta completa
  const livroB = (await livroTodo(geral)).filter((x) => x.bloco === 1410);   // do mais novo ao mais antigo
  ok(livroB.map((x) => x.tipo).join() === "entrada,saida,entrada,saida", "o livro do 1.410: saída, entrada parcial, saída de novo, entrada completa", livroB.map((x) => x.tipo));
  const [eComp, saida2L, eParc, saida1L] = livroB;
  ok(eParc && JSON.stringify(eParc.contagem) === JSON.stringify({ lancadas: 20, canceladas: 0, arrancadas: 0, extraviadas: 1, livres: 29 }) && eParc.parcial === true,
    "a entrada parcial continua contando só a entrega dela (20 lançadas, 1 extraviada, 29 livres), depois da reentrega e da volta completa", eParc);
  ok(eComp && JSON.stringify(eComp.contagem) === JSON.stringify({ lancadas: 28, canceladas: 1, arrancadas: 0, extraviadas: 0, livres: 0 }) && eComp.parcial === false, "a entrada completa conta a 2ª entrega (28 lançadas, 1 cancelada)", eComp);
  ok(saida1L && saida2L && JSON.stringify(saida1L.folhas) === JSON.stringify({ primeiraFolha: 70501, ultimaFolha: 70550 }) && JSON.stringify(saida2L.folhas) === JSON.stringify({ primeiraFolha: 70521, ultimaFolha: 70550 }),
    "cada saída do livro mostra a faixa das folhas entregues", [saida1L && saida1L.folhas, saida2L && saida2L.folhas]);
  ok((await livroTodo(local)).filter((x) => x.bloco === 1410).map((x) => x.tipo).join() === "entrada,saida", "Vila Nova vê no livro só a entrega dela do 1.410 (a saída e a entrada)");
  ok((await devolvidosComFolhaLivre()) === 0, "nenhum bloco fechado com folha livre");

  console.log("== corridas (processos separados) ==");
  const tokLocal = { tipo: "LIDER", membroId: TESOUREIRA_LOCAL, permissoes: ["financeiro"], escopo: ["Vila Nova E2E"] };
  const tokGeral = { tipo: "GERAL", membroId: TESOUREIRO_GERAL, permissoes: ["financeiro"] };
  let rs = await disparar(["cancelada", "arrancada", "extraviada", "cancelada"].map((o) => ({ handler: "finBlocos", acao: "folha", token: tokLocal, corpo: { folha: 70140, oQueAconteceu: o, observacao: `corrida ${o}` } })));
  ok(rs.filter((x) => x.status === 200).length === 1 && rs.every((x) => [200, 409].includes(x.status)) && Number(await escalar(`SELECT COUNT(*) FROM FinFolhas WHERE Folha = 70140`)) === 1,
    "4 exceções da mesma folha ao mesmo tempo: só 1 entra, as outras dão 409", rs.map((x) => x.status));
  await lancarDireto(b1403, 70151, 70200);   // o 1.403 cheio: só bloco cheio volta
  rs = await disparar([0, 1, 2, 3].map((i) => ({ handler: "finBlocos", acao: "devolver", token: tokGeral, corpo: { primeiraFolha: 70151, pessoa: { nome: `Pessoa ${i}` } } })));
  ok(rs.filter((x) => x.status === 200).length === 1 && Number(await escalar(`SELECT COUNT(*) FROM FinLivroBlocos WHERE Tipo = 'ENTRADA' AND BlocoId = ${b1403}`)) === 1,
    "4 devoluções do mesmo bloco ao mesmo tempo: só 1 volta, e o livro tem uma entrada só", rs.map((x) => x.status));
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70251, congregacaoId: VILA_NOVA, pessoa: { nome: "Rute Santos" } })).status === 200, "o 1.405 entregue a Vila Nova para a corrida seguinte");
  const b1405 = await idDo(1405);
  await lancarDireto(b1405, 70251, 70300, [70260]);   // 49 com destino, a 70.260 livre
  rs = await disparar([
    { handler: "finBlocos", acao: "devolver", token: tokGeral, corpo: { primeiraFolha: 70251, pessoa: { nome: "Rute Santos" } } },
    { handler: "finBlocos", acao: "folha", token: tokLocal, corpo: { folha: 70260, oQueAconteceu: "cancelada", observacao: "na hora da devolução" } }
  ]);
  const devolvido1405 = Number(await escalar(`SELECT COUNT(*) FROM FinBlocos WHERE BlocoId = ${b1405} AND Situacao = 'DEVOLVIDO'`)) === 1;
  ok(rs[1].status === 200 && Number(await escalar(`SELECT COUNT(*) FROM FinFolhas WHERE Folha = 70260`)) === 1 && [200, 422].includes(rs[0].status) && (rs[0].status === 200) === devolvido1405,
    "a devolução e a exceção da última folha livre ao mesmo tempo: a exceção sempre entra; a devolução só vale se veio depois (bloco cheio)", rs);
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70301, congregacaoId: VILA_NOVA, pessoa: { nome: "Rute Santos" } })).status === 200, "o 1.406 entregue a Vila Nova para a corrida do desfazer");
  const b1406 = await idDo(1406);
  await lancarDireto(b1406, 70301, 70350, [70310]);
  ok((await POST(H, "folha", local, { folha: 70310, oQueAconteceu: "cancelada", observacao: "para a corrida" })).status === 200, "o 1.406 cheio, com a 70.310 cancelada");
  rs = await disparar([
    { handler: "finBlocos", acao: "devolver", token: tokGeral, corpo: { primeiraFolha: 70301, pessoa: { nome: "Rute Santos" } } },
    { handler: "finBlocos", acao: "desfazer-folha", token: tokGeral, corpo: { folha: 70310, motivo: "corrida" } }
  ]);
  const devolvido1406 = Number(await escalar(`SELECT COUNT(*) FROM FinBlocos WHERE BlocoId = ${b1406} AND Situacao = 'DEVOLVIDO'`)) === 1;
  const desfeita1406 = Number(await escalar(`SELECT COUNT(*) FROM FinFolhasDesfeitas WHERE Folha = 70310`)) === 1;
  ok(rs.filter((x) => x.status === 200).length === 1 && rs.every((x) => [200, 422].includes(x.status)) && devolvido1406 !== desfeita1406 && (rs[0].status === 200) === devolvido1406,
    "a devolução e o desfazer do mesmo bloco ao mesmo tempo: só um vale", rs);
  // a reentrega: duas saídas do mesmo bloco devolvido em parte, ao mesmo tempo (uma pela primeira folha do bloco, outra pela primeira livre)
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70551, congregacaoId: BETA, pessoa: { nome: "Tesoureiro da Beta" }, data: "2026-11-05" })).status === 200, "o 1.411 entregue à Beta para a corrida da reentrega");
  const b1411 = await idDo(1411);
  await lancarDireto(b1411, 70551, 70560);
  ok((await POST(H, "devolver", geral, { primeiraFolha: 70551, pessoa: { nome: "Tesoureiro da Beta" }, parcial: true, data: "2026-11-12" })).status === 200, "o 1.411 devolvido em parte (40 livres)");
  rs = await disparar([
    { handler: "finBlocos", acao: "entregar", token: tokGeral, corpo: { primeiraFolha: 70551, congregacaoId: VILA_NOVA, pessoa: { nome: "Rute Santos" } } },
    { handler: "finBlocos", acao: "entregar", token: tokGeral, corpo: { primeiraFolha: 70561, congregacaoId: CENTRAL, pessoa: { nome: "Tesoureira da Central" } } }
  ]);
  const saidas1411 = await q(`SELECT PrimeiraFolha FROM FinLivroBlocos WHERE Tipo = 'SAIDA' AND BlocoId = ${b1411} ORDER BY RegistroId`);
  ok(rs.filter((x) => x.status === 200).length === 1 && rs.every((x) => [200, 422].includes(x.status)) && saidas1411.length === 2 && saidas1411[1].PrimeiraFolha === 70561,
    "duas reentregas do mesmo bloco ao mesmo tempo: só uma sai, e a saída começa na primeira folha livre (70.561)", rs);
  // a devolução parcial e a exceção da última folha livre ao mesmo tempo: ou a exceção entra e a parcial é recusada (o bloco ficou cheio), ou a
  // parcial vale e a exceção é recusada (o bloco voltou para a Geral: para a congregação, a mesma resposta de "não existe", 404)
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70601, congregacaoId: VILA_NOVA, pessoa: { nome: "Rute Santos" } })).status === 200, "o 1.412 entregue a Vila Nova para a corrida da parcial");
  const b1412 = await idDo(1412);
  await lancarDireto(b1412, 70601, 70650, [70640]);
  rs = await disparar([
    { handler: "finBlocos", acao: "devolver", token: tokGeral, corpo: { primeiraFolha: 70601, pessoa: { nome: "Rute Santos" }, parcial: true } },
    { handler: "finBlocos", acao: "folha", token: tokLocal, corpo: { folha: 70640, oQueAconteceu: "cancelada", observacao: "na hora da parcial" } }
  ]);
  const naGeral1412 = (await um(`SELECT Situacao FROM FinBlocos WHERE BlocoId = ${b1412}`)).Situacao === "NA_GERAL";
  const usada70640 = Number(await escalar(`SELECT COUNT(*) FROM FinFolhas WHERE Folha = 70640`)) === 1;
  ok(rs.filter((x) => x.status === 200).length === 1 && [200, 422].includes(rs[0].status) && [200, 404].includes(rs[1].status) && naGeral1412 === (rs[0].status === 200) && usada70640 === (rs[1].status === 200),
    "a devolução parcial e a exceção da última folha livre ao mesmo tempo: só uma vale", rs);

  ok((await devolvidosComFolhaLivre()) === 0, "depois das corridas, nenhum bloco devolvido com folha livre");
  ok(Number(await escalar(`SELECT COUNT(*) FROM FinFolhas f JOIN FinLivroBlocos s ON s.RegistroId = f.SaidaId
    WHERE NOT (s.Tipo = 'SAIDA' AND s.BlocoId = f.BlocoId AND f.Folha BETWEEN s.PrimeiraFolha AND s.UltimaFolha)`)) === 0, "toda folha usada está na faixa da entrega (do mesmo bloco) que a usou");
  ok(Number(await escalar(`SELECT COUNT(*) FROM FinBlocos b WHERE b.Situacao = 'NA_GERAL' AND EXISTS (SELECT 1 FROM FinFolhas f WHERE f.BlocoId = b.BlocoId)
    AND NOT EXISTS (SELECT 1 FROM FinLivroBlocos e WHERE e.Tipo = 'ENTRADA' AND e.BlocoId = b.BlocoId AND e.Parcial = 1)`)) === 0, "bloco na Geral com folha usada, só depois de uma devolução parcial");
  ok(Number(await escalar(`SELECT COUNT(*) FROM FinLivroBlocos s JOIN FinBlocos b ON b.BlocoId = s.BlocoId WHERE s.Tipo = 'SAIDA'
    AND NOT EXISTS (SELECT 1 FROM FinLivroBlocos e WHERE e.SaidaId = s.RegistroId)
    AND NOT (b.Situacao = 'ENTREGUE' AND s.RegistroId = (SELECT MAX(x.RegistroId) FROM FinLivroBlocos x WHERE x.Tipo = 'SAIDA' AND x.BlocoId = b.BlocoId))`)) === 0,
    "toda saída, menos a entrega em curso, foi fechada por uma entrada");
  ok(Number(await escalar(`SELECT COUNT(*) FROM AuditLog WHERE Acao LIKE 'FIN_%' AND RegistroId IS NULL`)) === 0, "nenhuma linha da trilha sem o registro");

  fim("e2e-201 (Financeiro: as folhas do bloco e o livro)");
})().catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
