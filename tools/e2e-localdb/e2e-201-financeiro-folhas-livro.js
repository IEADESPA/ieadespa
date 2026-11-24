// e2e-201-financeiro-folhas-livro.js — FASE 10, Financeiro (módulo 2), incremento 2 (22/11/2026): as folhas de um bloco, a exceção da folha, o livro
// de entrada e saída, o rastreio e a devolução (rota FinBlocos) contra o SQL Server de verdade. Telas aprovadas: r17-blocos-folhas e r17-blocos-livro.
// Base: cenario-200 (a mesma do e2e-200), no LocalDB próprio do Financeiro:
//   E2E_INSTANCIA=fin E2E_BANCO=ieadespa_fin E2E_CS='Server=(localdb)\fin;Database=ieadespa_fin;Integrated Security=true' BASE=cenario-200 bash rodar.sh roteiro e2e-201-financeiro-folhas-livro.js
// Cobre: quem entra (folhas, livro e exceção com a permissão financeiro; rastreio e devolução só a Geral); o escopo (fora do escopo = não existe);
// a exceção (só em bloco com a congregação, uma vez por folha, com a observação); a devolução (datas, recusas, o livro e a trilha); o livro em páginas
// e os blocos "agora"; lixo em cada campo; e corridas em processos separados (a mesma folha, a mesma devolução, devolução × exceção).
// Revisão de 23/11/2026, as regras dele: a devolução só de bloco CHEIO (toda folha com destino) e desfazer a exceção da folha (só a Tesouraria
// Geral, com o motivo; o histórico em FinFolhasDesfeitas; não em bloco devolvido; a folha volta a poder ter destino), com a corrida desfazer × devolver.
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
// livres de `de` a `ate`, menos as de `exceto`.
async function lancarDireto(blocoId, de, ate, exceto = []) {
  await q(`WITH n AS (SELECT ${de} + v.number AS Folha FROM master.dbo.spt_values v WHERE v.type = 'P' AND v.number <= ${ate - de})
           INSERT INTO FinFolhas (BlocoId, Folha, Destino, RegistradoPor)
           SELECT ${blocoId}, n.Folha, 'LANCADA', ${TESOUREIRA_LOCAL} FROM n
           WHERE NOT EXISTS (SELECT 1 FROM FinFolhas f WHERE f.Folha = n.Folha) ${exceto.length ? `AND n.Folha NOT IN (${exceto.join(", ")})` : ""}`);
}
// a regra dele (23/11/2026): nenhum bloco fica devolvido com folha livre
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
  // a regra dele (23/11/2026): o bloco só volta CHEIO, com toda folha com destino
  r = await POST(H, "devolver", geral, { primeiraFolha: 70051, pessoa: { nome: "Lia Fontes" } });
  ok(r.status === 422 && /^O bloco 1\.401 ainda tem 49 folhas livres: /.test(r.body.mensagem), "o bloco com 49 folhas livres não volta", r.body);
  ok((await retratoFin()) === antes1, "as devoluções recusadas não mexeram no banco");
  await lancarDireto(b1401, 70051, 70100, [70091]);
  const antes2 = await retratoFin();
  r = await POST(H, "devolver", geral, { primeiraFolha: 70051, pessoa: { nome: "Lia Fontes" } });
  ok(r.status === 422 && /^O bloco 1\.401 ainda tem 1 folha livre: /.test(r.body.mensagem), "com 1 folha livre ainda não volta (a mensagem no singular)", r.body);
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

  r = await POST(H, "devolver", geral, { primeiraFolha: 70051, pessoa: { nome: "Lia Fontes" } });
  ok(r.status === 200 && /1\.401/.test(r.body.mensagem), "o 1.401 cheio devolvido por Lia Fontes", r.body);
  const bd = await um(`SELECT Situacao, CONVERT(char(10), DevolvidoEm, 23) AS Dia FROM FinBlocos WHERE BlocoId = ${b1401}`);
  ok(bd.Situacao === "DEVOLVIDO" && bd.Dia === hoje, "o bloco fica devolvido, com a data de hoje", bd);
  const ent = await um(`SELECT CongregacaoId, PessoaMembroId, PessoaNome, RegistradoPor FROM FinLivroBlocos WHERE Tipo = 'ENTRADA' AND BlocoId = ${b1401}`);
  ok(ent && ent.CongregacaoId === VILA_NOVA && ent.PessoaMembroId === null && ent.PessoaNome === "Lia Fontes" && ent.RegistradoPor === TESOUREIRO_GERAL, "o livro registra a entrada: de Vila Nova, devolvido por Lia Fontes, recebido por quem registrou", ent);
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

  console.log("== lixo em cada campo ==");
  // o 1.404 cheio (a 70.210 extraviada e as outras lançadas), para o lixo da devolução chegar até o fim; a 70.131 cancelada, para o do desfazer
  await lancarDireto(await idDo(1404), 70201, 70250);
  ok((await POST(H, "folha", local, { folha: 70131, oQueAconteceu: "cancelada", observacao: "para o lixo" })).status === 200, "a 70.131 cancelada (base do lixo do desfazer)");
  const quebras = [], mudancas = [];
  const casos = [
    [local, "folha", { folha: 70130, oQueAconteceu: "cancelada", observacao: "Rasgou" }, ["folha", "oQueAconteceu", "observacao"]],
    [geral, "devolver", { primeiraFolha: 70201, pessoa: { nome: "Fulano" } }, ["primeiraFolha", "pessoa", "data"]],
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
  ok((await devolvidosComFolhaLivre()) === 0, "depois das corridas, nenhum bloco devolvido com folha livre");
  ok(Number(await escalar(`SELECT COUNT(*) FROM AuditLog WHERE Acao LIKE 'FIN_%' AND RegistroId IS NULL`)) === 0, "nenhuma linha da trilha sem o registro");

  fim("e2e-201 (Financeiro: as folhas do bloco e o livro)");
})().catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
