// e2e-202-financeiro-r30.js — FASE 10, Financeiro (módulo 2): o que as telas da rodada 30 (aprovadas em 24/11/2026) pedem ao servidor, contra o SQL
// Server de verdade. Base: cenario-200 (a 200, a 201, a 202 e a 203 aplicadas duas vezes), no LocalDB próprio do Financeiro:
//   E2E_INSTANCIA=fin E2E_BANCO=ieadespa_fin E2E_CS='Server=(localdb)\fin;Database=ieadespa_fin;Integrated Security=true' BASE=cenario-200 bash rodar.sh roteiro e2e-202-financeiro-r30.js
// Cobre:
// - as folhas da r30: o seletor de bloco em todos os níveis (a situação, as datas, a faixa vista e as usadas de cada bloco; o bloco que voltou em
//   parte também na Geral, "na Tesouraria Geral") e a volta parcial (de onde, quando e as usadas: a faixa da entrega antes da primeira em branco);
// - a FOLHA INEXISTENTE (decisão dele de 24/11/2026): a folha que a gráfica não imprimiu é um tipo a mais de exceção, onde as outras já aparecem
//   (marcar, ver, contar no livro, desfazer), com a observação obrigatória; a migração 203 (o destino com 11 letras nas duas tabelas e os CHECKs),
//   rodada de novo sobre dados. As respostas dele (24/11/2026): a primeira em branco é procurada ignorando as inexistentes (a devolução parcial
//   passa com a 50ª inexistente: as folhas antes dela voltam livres e ela continua inexistente, sem contar como livre nem como pendente, nem
//   tirar o "esperando" de quem recebe o bloco de novo; a do meio também); e a inexistente
//   só se marca onde as outras exceções se marcam, com o bloco já entregue (ninguém confere folha por folha quando o lote chega).
const L = require("./lib");
const { q, um, escalar, ok, fim, GET, POST, GERAL, LIDER, API, path } = L;
const H = require(path.join(API, "FinBlocos/index.js"));

const TESOUREIRO_GERAL = 1002, TESOUREIRA_LOCAL = 1003;
const CENTRAL = 1, VILA_NOVA = 2;
const geral = GERAL(TESOUREIRO_GERAL, ["financeiro"]);
const local = LIDER(TESOUREIRA_LOCAL, ["financeiro"], ["Vila Nova E2E"]);
const central = LIDER(TESOUREIRA_LOCAL, ["financeiro"], ["Central E2E"]);

const TABELAS = ["FinBlocos", "FinFolhas", "FinLivroBlocos", "FinFolhasDesfeitas", "AuditLog"];
async function retratoFin() {
  const partes = [];
  for (const t of TABELAS) partes.push(JSON.stringify(await um(`SELECT COUNT(*) n, CHECKSUM_AGG(CHECKSUM(*)) c FROM ${t}`)));
  return partes.join("|");
}
async function aplicarMigracao(numero) {
  const fs = require("fs");
  const pasta = path.join(API, "..", "sql", "migrations");
  const nome = fs.readdirSync(pasta).find((n) => n.startsWith(`${numero}_`) && n.endsWith(".sql"));
  if (!nome) return ok(false, `a migração ${numero} existe`);
  for (const lote of fs.readFileSync(path.join(pasta, nome), "utf8").split(/^\s*GO\s*$/gim).map((t) => t.trim()).filter(Boolean)) await q(lote);
}
const idDo = (numero) => escalar(`SELECT BlocoId FROM FinBlocos WHERE Numero = ${numero}`);
// o lançamento (incremento 3) ainda não existe: as folhas lançadas entram direto no banco, na entrega atual do bloco (a última saída)
async function lancarDireto(blocoId, de, ate, exceto = []) {
  await q(`WITH n AS (SELECT ${de} + v.number AS Folha FROM master.dbo.spt_values v WHERE v.type = 'P' AND v.number <= ${ate - de})
           INSERT INTO FinFolhas (BlocoId, Folha, Destino, RegistradoPor, SaidaId)
           SELECT ${blocoId}, n.Folha, 'LANCADA', ${TESOUREIRA_LOCAL},
                  (SELECT TOP 1 s.RegistroId FROM FinLivroBlocos s WHERE s.Tipo = 'SAIDA' AND s.BlocoId = ${blocoId} ORDER BY s.RegistroId DESC) FROM n
           WHERE NOT EXISTS (SELECT 1 FROM FinFolhas f WHERE f.Folha = n.Folha) ${exceto.length ? `AND n.Folha NOT IN (${exceto.join(", ")})` : ""}`);
}
const largura = (tabela) => escalar(`SELECT max_length / 2 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.${tabela}') AND name = N'Destino'`);
const definicao = (restricao) => escalar(`SELECT definition FROM sys.check_constraints WHERE name = N'${restricao}'`);

(async () => {
  console.log("== o cenário: o lote, a chegada e as entregas ==");
  let r = await POST(H, "lote", geral, { serie: 2026, primeiraFolha: 70001, totalFolhas: 10000 });
  ok(r.status === 201, "o lote 70.001 a 80.000 (200 blocos)", r.body);
  ok((await POST(H, "chegada", geral, { loteId: r.body.loteId, ateFolha: 75000, data: "2026-11-01" })).status === 200, "chegaram os blocos até a folha 75.000 em 01/11");
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70051, congregacaoId: VILA_NOVA, pessoa: { membroId: TESOUREIRA_LOCAL }, data: "2026-11-10" })).status === 200, "o 1.401 entregue a Vila Nova em 10/11");
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70101, congregacaoId: VILA_NOVA, pessoa: { nome: "Rute Santos" }, data: "2026-11-12" })).status === 200, "o 1.402 entregue a Vila Nova em 12/11");
  const [b1401, b1402] = [await idDo(1401), await idDo(1402)];

  console.log("== a migração 203: o destino da folha com a inexistente ==");
  ok(Number(await largura("FinFolhas")) >= 11 && Number(await largura("FinFolhasDesfeitas")) >= 11, "o destino cabe \"INEXISTENTE\" (11 letras) nas duas tabelas",
    { folhas: await largura("FinFolhas"), desfeitas: await largura("FinFolhasDesfeitas") });
  ok(/INEXISTENTE/.test(String(await definicao("CK_FinFolhas_Destino"))) && /INEXISTENTE/.test(String(await definicao("CK_FinFolhasDesfeitas_Destino"))),
    "os CHECKs do destino aceitam a inexistente (com os mesmos nomes)");
  ok(!/LANCADA/.test(String(await definicao("CK_FinFolhasDesfeitas_Destino"))), "a folha lançada continua fora das desfeitas (só a exceção se desfaz)");
  const naoNulas = await escalar(`SELECT COUNT(*) FROM sys.columns WHERE name = N'Destino' AND is_nullable = 1 AND object_id IN (OBJECT_ID(N'dbo.FinFolhas'), OBJECT_ID(N'dbo.FinFolhasDesfeitas'))`);
  ok(Number(naoNulas) === 0, "o destino continua obrigatório (NOT NULL) nas duas tabelas");

  console.log("== a folha inexistente: marcar, ver, contar e desfazer ==");
  r = await POST(H, "folha", local, { folha: 70100, oQueAconteceu: "inexistente", observacao: "A gráfica não imprimiu a 50ª" });
  ok(r.status === 200 && r.body.mensagem === "Folha 70.100 (50ª do bloco 1.401) registrada como inexistente.", "Vila Nova cataloga a 50ª do 1.401 como inexistente", r.body);
  const f = await um(`SELECT Destino, Observacao, RegistradoPor FROM FinFolhas WHERE Folha = 70100`);
  ok(f && f.Destino === "INEXISTENTE" && f.Observacao === "A gráfica não imprimiu a 50ª" && f.RegistradoPor === TESOUREIRA_LOCAL, "guardada como INEXISTENTE, com a observação e quem registrou", f);
  r = await POST(H, "folha", local, { folha: 70099, oQueAconteceu: "inexistente", observacao: "  " });
  ok(r.status === 422 && r.body.mensagem === "Escreva a observação: o que aconteceu com a folha.", "a inexistente sem observação é recusada, como as outras", r.body);
  r = await POST(H, "folha", local, { folha: 70099, oQueAconteceu: "sumida", observacao: "x" });
  ok(r.status === 422 && r.body.mensagem === "Escolha o que aconteceu: cancelada, arrancada, extraviada ou inexistente.", "o que não é exceção é recusado, com as quatro na mensagem", r.body);
  r = await GET(H, "folhas", local, { bloco: b1401 });
  const g = r.body.folhas && r.body.folhas.find((x) => x.folha === 70100);
  ok(r.status === 200 && g && g.destino === "inexistente" && g.observacao === "A gráfica não imprimiu a 50ª" && r.body.bloco.usadas === 1 && r.body.bloco.livres === 49,
    "as folhas do 1.401: a 70.100 inexistente, com a observação; conta como usada", r.body.folhas);
  r = await GET(H, "rastreio", geral, { folha: 70051 });
  ok(r.status === 200 && JSON.stringify(r.body.contagem) === JSON.stringify({ lancadas: 0, canceladas: 0, arrancadas: 0, extraviadas: 0, inexistentes: 1, livres: 49 }),
    "o rastreio conta a inexistente", r.body.contagem);
  // resposta dele: a primeira em branco é procurada ignorando as inexistentes (nada lançado ainda: a primeira folha do bloco)
  ok(r.body.primeiraEmBranco === 70051, "o rastreio procura a primeira em branco ignorando a 50ª inexistente", r.body.primeiraEmBranco);
  // resposta dele: a inexistente só se marca com o bloco já entregue, onde as outras exceções se marcam (nada de marcar antes da entrega)
  r = await POST(H, "folha", geral, { folha: 70200, oQueAconteceu: "inexistente", observacao: "A gráfica não imprimiu" });
  ok(r.status === 422 && r.body.mensagem === "O bloco 1.403 ainda está na Tesouraria Geral: a folha só tem destino depois da entrega.", "a Geral não marca a inexistente antes da entrega", r.body);

  // desfazer a inexistente (a linha vai inteira para FinFolhasDesfeitas, com o destino de 11 letras)
  r = await POST(H, "desfazer-folha", geral, { folha: 70100, motivo: "A folha estava no fim do bloco" });
  ok(r.status === 200, "a Tesouraria Geral desfaz a inexistente", r.body);
  const d = await um(`SELECT Destino, Observacao, Motivo FROM FinFolhasDesfeitas WHERE Folha = 70100`);
  ok(d && d.Destino === "INEXISTENTE" && d.Observacao === "A gráfica não imprimiu a 50ª" && d.Motivo === "A folha estava no fim do bloco", "a inexistente desfeita fica no histórico inteira", d);
  ok(Number(await escalar(`SELECT COUNT(*) FROM FinFolhas WHERE Folha = 70100`)) === 0, "a folha volta a ficar livre");
  r = await POST(H, "folha", local, { folha: 70100, oQueAconteceu: "inexistente", observacao: "Conferido: a gráfica não imprimiu" });
  ok(r.status === 200, "e pode ser catalogada de novo");

  // o livro conta a inexistente na entrada (nunca como pendente calada)
  await lancarDireto(b1401, 70051, 70099);
  r = await POST(H, "devolver", geral, { primeiraFolha: 70051, pessoa: { nome: "Rute Santos" }, data: "2026-11-20" });
  ok(r.status === 200, "o 1.401 volta completo (49 lançadas e a 50ª inexistente)", r.body);
  r = await GET(H, "livro", geral, {});
  const e = r.body.registros.find((x) => x.tipo === "entrada" && x.bloco === 1401);
  ok(e && JSON.stringify(e.contagem) === JSON.stringify({ lancadas: 49, canceladas: 0, arrancadas: 0, extraviadas: 0, inexistentes: 1, livres: 0 }) && e.pendentes === 0,
    "a entrada do 1.401 no livro: 49 lançadas, 1 inexistente, nenhuma pendente", e);
  r = await POST(H, "folha", local, { folha: 70150, oQueAconteceu: "inexistente", observacao: "Faltou na gráfica" });
  ok(r.status === 200, "a 50ª do 1.402 também inexistente (para a 203 de novo sobre dados)");

  console.log("== as folhas da r30: o seletor e a volta parcial ==");
  // o 1.403 (70.151 a 70.200) vai a Vila Nova, usa 35 folhas (duas sem destino ainda: os pendentes) e volta PARCIAL; depois sai para a Central
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70151, congregacaoId: VILA_NOVA, pessoa: { nome: "Rute Santos" }, data: "2026-11-13" })).status === 200, "o 1.403 entregue a Vila Nova em 13/11");
  const b1403 = await idDo(1403);
  await lancarDireto(b1403, 70151, 70185, [70180, 70181]);
  r = await GET(H, "folhas", local, {});
  let op = r.body.opcoes && r.body.opcoes.find((o) => o.numero === 1403);
  ok(op && op.situacao === "em-uso" && op.congregacao === "Vila Nova E2E" && op.entregueEm === "2026-11-13" && op.devolvidoEm === null && op.parcial === false
    && op.faixa.primeiraFolha === 70151 && op.faixa.ultimaFolha === 70200 && op.usadas === 33, "o seletor da congregação: o 1.403 em uso, entregue em 13/11, 33 com destino", op);
  r = await POST(H, "devolver", geral, { primeiraFolha: 70151, pessoa: { nome: "Rute Santos" }, parcial: true, primeiraEmBranco: 70186, data: "2026-11-20" });
  ok(r.status === 200, "o 1.403 volta parcial (70.186 a 70.200 livres; a 70.180 e a 70.181 continuam com Vila Nova)", r.body);
  r = await GET(H, "folhas", geral, {});
  op = r.body.opcoes && r.body.opcoes.find((o) => o.numero === 1403);
  ok(op && op.situacao === "na-geral" && op.congregacao === null && op.parcial === true && op.faixa.primeiraFolha === 70186 && op.faixa.ultimaFolha === 70200 && op.usadas === 0,
    "a Geral vê no seletor o 1.403 que voltou em parte (na Tesouraria Geral, as 15 livres)", op);
  r = await GET(H, "folhas", geral, { bloco: b1403 });
  ok(r.status === 200 && r.body.bloco.situacao === "na-geral" && JSON.stringify(r.body.bloco.volta) === JSON.stringify({ congregacao: "Vila Nova E2E", data: "2026-11-20", usadas: 35 }),
    "as folhas do 1.403 na Geral: voltou de Vila Nova em 20/11, a entrega usou 35 (as 33 com destino e as 2 pendentes)", r.body.bloco);
  r = await GET(H, "rastreio", geral, { folha: 70190 });
  ok(r.status === 200 && JSON.stringify(r.body.volta) === JSON.stringify({ congregacao: "Vila Nova E2E", data: "2026-11-20", usadas: 35 }) && r.body.bloco.parcial === true,
    "o rastreio da saída: as mesmas 35 usadas (a faixa da entrega antes da primeira em branco)", r.body.volta);
  r = await GET(H, "folhas", local, {});
  op = r.body.opcoes && r.body.opcoes.find((o) => o.numero === 1403);
  ok(op && op.situacao === "fechado" && op.parcial === true && op.devolvidoEm === "2026-11-20" && op.faixa.primeiraFolha === 70151 && op.faixa.ultimaFolha === 70185,
    "o seletor de Vila Nova: o 1.403 devolvido em 20/11, parcial, só a faixa que ela usou (35)", op);
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70186, congregacaoId: CENTRAL, pessoa: { nome: "Davi Moura" }, data: "2026-11-21" })).status === 200, "o 1.403 sai de novo, parcial, para a Central");
  r = await GET(H, "folhas", central, { bloco: b1403 });
  ok(r.status === 200 && r.body.bloco.faixa.primeiraFolha === 70186 && r.body.bloco.livres === 15 && r.body.folhas.some((x) => x.folha === 70151 && x.destino === "lancada"),
    "a Central vê o 1.403: as folhas de Vila Nova com a cor, e as 15 dela livres", r.body.bloco);
  op = r.body.opcoes.find((o) => o.numero === 1403);
  ok(op && op.situacao === "esperando" && op.congregacao === "Central E2E" && op.entregueEm === "2026-11-21" && op.faixa.primeiraFolha === 70186 && op.usadas === 0,
    "o seletor da Central: o 1.403 esperando, recebido em 21/11, a faixa dela", op);
  r = await GET(H, "folhas", local, { bloco: b1403 });
  ok(r.status === 200 && r.body.bloco.faixa.ultimaFolha === 70185 && !r.body.folhas.some((x) => x.folha >= 70186), "Vila Nova continua vendo só as folhas dela do 1.403", r.body.bloco);
  ok(!(await GET(H, "folhas", central, {})).body.opcoes.some((o) => o.congregacao === "Vila Nova E2E"), "a Central não vê no seletor os blocos de Vila Nova");

  console.log("== a devolução parcial com a 50ª inexistente (resposta dele, 24/11/2026) ==");
  // o 1.402 (70.101 a 70.150, a 50ª inexistente) usa até a 39ª e volta parcial: as folhas 40ª a 49ª voltam livres e a 50ª continua inexistente
  await lancarDireto(b1402, 70101, 70139);
  r = await GET(H, "rastreio", geral, { folha: 70101 });
  ok(r.status === 200 && r.body.primeiraEmBranco === 70140, "o rastreio sugere a 70.140 (a 40ª), ignorando a 50ª inexistente", r.body.primeiraEmBranco);
  r = await POST(H, "devolver", geral, { primeiraFolha: 70101, pessoa: { nome: "Rute Santos" }, parcial: true, primeiraEmBranco: 70150, data: "2026-11-20" });
  ok(r.status === 422 && r.body.mensagem === "A folha 70.150 não pode ser a primeira em branco: ela é inexistente.", "a própria inexistente não é a primeira em branco", r.body);
  r = await POST(H, "devolver", geral, { primeiraFolha: 70101, pessoa: { nome: "Rute Santos" }, parcial: true, primeiraEmBranco: 70140, data: "2026-11-20" });
  ok(r.status === 200 && r.body.mensagem === "Bloco 1.402 de volta, parcial: as folhas 70.140 a 70.149 estão livres para outra entrega.",
    "o 1.402 volta parcial: da 40ª à 49ª livres; a 50ª continua inexistente", r.body);
  ok((await um(`SELECT Destino FROM FinFolhas WHERE Folha = 70150`)).Destino === "INEXISTENTE", "a 50ª continua inexistente");
  r = await GET(H, "livro", geral, {});
  let ent = r.body.registros.find((x) => x.tipo === "entrada" && x.bloco === 1402);
  ok(ent && JSON.stringify(ent.contagem) === JSON.stringify({ lancadas: 39, canceladas: 0, arrancadas: 0, extraviadas: 0, inexistentes: 1, livres: 10 }) && ent.pendentes === 0
    && ent.parcial === true && JSON.stringify(ent.faixaLivre) === JSON.stringify({ primeiraFolha: 70140, ultimaFolha: 70150 }),
    "a entrada do 1.402 no livro: 39 lançadas, 1 inexistente, 10 livres (a faixa 70.140 a 70.150 menos a inexistente), nenhuma pendente", ent);
  r = await GET(H, "folhas", geral, { bloco: b1402 });
  ok(r.status === 200 && r.body.bloco.situacao === "na-geral" && r.body.bloco.livres === 10 && r.body.folhas.some((x) => x.folha === 70150 && x.destino === "inexistente"),
    "a Geral vê o 1.402 com as 10 livres, e a 50ª continua inexistente", r.body.bloco);
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70140, congregacaoId: CENTRAL, pessoa: { nome: "Davi Moura" }, data: "2026-11-21" })).status === 200,
    "o 1.402 sai de novo para a Central, com as 10 livres");
  r = await GET(H, "rastreio", geral, { folha: 70140 });
  ok(r.status === 200 && r.body.bloco.situacao === "esperando" && r.body.bloco.livres === 10 && r.body.primeiraEmBranco === 70140,
    "com a Central, o 1.402 está esperando: as 10 folhas dela livres (a inexistente de antes não tira o esperando)", r.body.bloco);
  r = await GET(H, "", central, {});
  let item = r.body.blocos && r.body.blocos.find((x) => x.numero === 1402);
  ok(item && item.situacao === "esperando" && item.livres === 10, "a lista da Central: o 1.402 esperando, 10 livres", item);
  op = (await GET(H, "folhas", central, {})).body.opcoes.find((o) => o.numero === 1402);
  ok(op && op.situacao === "esperando" && op.faixa.ultimaFolha - op.faixa.primeiraFolha + 1 - op.usadas === 10, "o seletor da Central: o 1.402 esperando, 10 livres", op);
  await lancarDireto(b1402, 70140, 70149);
  r = await POST(H, "devolver", geral, { primeiraFolha: 70140, pessoa: { nome: "Davi Moura" }, data: "2026-11-23" });
  ok(r.status === 200, "o 1.402 volta completo da Central", r.body);
  r = await GET(H, "livro", geral, {});
  ent = r.body.registros.find((x) => x.tipo === "entrada" && x.bloco === 1402);
  ok(ent && JSON.stringify(ent.contagem) === JSON.stringify({ lancadas: 10, canceladas: 0, arrancadas: 0, extraviadas: 0, inexistentes: 0, livres: 0 }) && ent.pendentes === 0,
    "a entrada da Central no livro: 10 lançadas, nenhuma pendente (a 50ª inexistente ficou na entrada de Vila Nova)", ent);

  // a inexistente no meio (a 45ª do 1.404): a parcial na 40ª passa, a mensagem diz qual não está livre, e nada vira pendente nem livre por ela
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70201, congregacaoId: VILA_NOVA, pessoa: { nome: "Rute Santos" }, data: "2026-11-14" })).status === 200, "o 1.404 entregue a Vila Nova em 14/11");
  const b1404 = await idDo(1404);
  ok((await POST(H, "folha", local, { folha: 70245, oQueAconteceu: "inexistente", observacao: "A gráfica pulou a 45ª" })).status === 200, "a 45ª do 1.404 inexistente");
  await lancarDireto(b1404, 70201, 70239);
  r = await GET(H, "rastreio", geral, { folha: 70201 });
  ok(r.status === 200 && r.body.primeiraEmBranco === 70240, "o rastreio sugere a 70.240, ignorando a 45ª inexistente", r.body.primeiraEmBranco);
  r = await POST(H, "devolver", geral, { primeiraFolha: 70201, pessoa: { nome: "Rute Santos" }, parcial: true, primeiraEmBranco: 70240, data: "2026-11-20" });
  ok(r.status === 200 && r.body.mensagem === "Bloco 1.404 de volta, parcial: as folhas 70.240 a 70.250 (menos a 70.245, inexistente) estão livres para outra entrega.",
    "o 1.404 volta parcial: a mensagem diz que a 70.245 não está livre", r.body);
  r = await GET(H, "livro", geral, {});
  ent = r.body.registros.find((x) => x.tipo === "entrada" && x.bloco === 1404);
  ok(ent && JSON.stringify(ent.contagem) === JSON.stringify({ lancadas: 39, canceladas: 0, arrancadas: 0, extraviadas: 0, inexistentes: 1, livres: 10 }) && ent.pendentes === 0,
    "a entrada do 1.404 no livro: 39 lançadas, 1 inexistente, 10 livres, nenhuma pendente", ent);
  r = await POST(H, "devolver", geral, { primeiraFolha: 70201, pessoa: { nome: "Rute Santos" }, data: "2026-11-21" });
  ok(r.status === 422 && r.body.mensagem === "O bloco 1.404 já voltou, parcial, em 20/11/2026: as folhas 70.240 a 70.250 (menos a 70.245, inexistente) estão livres na Tesouraria Geral para outra entrega.",
    "a recusa de voltar de novo diz as mesmas livres", r.body);
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70240, congregacaoId: CENTRAL, pessoa: { nome: "Davi Moura" }, data: "2026-11-21" })).status === 200, "o 1.404 sai de novo para a Central");
  r = await GET(H, "", central, {});
  item = r.body.blocos && r.body.blocos.find((x) => x.numero === 1404);
  ok(item && item.situacao === "esperando" && item.livres === 10, "a lista da Central: o 1.404 esperando, 10 livres (a 45ª continua inexistente)", item);
  await lancarDireto(b1404, 70240, 70250);
  r = await POST(H, "devolver", geral, { primeiraFolha: 70240, pessoa: { nome: "Davi Moura" }, data: "2026-11-23" });
  ok(r.status === 200, "o 1.404 volta completo da Central", r.body);
  ent = (await GET(H, "livro", geral, {})).body.registros.find((x) => x.tipo === "entrada" && x.bloco === 1404);
  ok(ent && ent.contagem.lancadas === 10 && ent.contagem.inexistentes === 0 && ent.pendentes === 0, "a entrada da Central do 1.404: 10 lançadas, nenhuma pendente", ent);

  console.log("== a 203 de novo, sobre dados ==");
  const antes = await retratoFin();
  await aplicarMigracao("203");
  await aplicarMigracao("203");
  ok((await retratoFin()) === antes, "a 203 rodada duas vezes sobre o banco com inexistentes não muda nada");
  ok(Number(await escalar(`SELECT COUNT(*) FROM FinFolhas WHERE Destino = 'INEXISTENTE'`)) === 3 && b1402 > 0, "as três inexistentes continuam lá");

  fim("e2e-202 (Financeiro: o que a r30 pede ao servidor)");
})().catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
