// e2e-202-financeiro-r30.js — FASE 10, Financeiro (módulo 2): o que as telas da rodada 30 (aprovadas em 24/11/2026) pedem ao servidor, contra o SQL
// Server de verdade. Base: cenario-200 (a 200, a 201, a 202 e a 203 aplicadas duas vezes), no LocalDB próprio do Financeiro:
//   E2E_INSTANCIA=fin E2E_BANCO=ieadespa_fin E2E_CS='Server=(localdb)\fin;Database=ieadespa_fin;Integrated Security=true' BASE=cenario-200 bash rodar.sh roteiro e2e-202-financeiro-r30.js
// Cobre:
// - a devolução (r30-blocos-devolver): a primeira em branco que já tem destino ("A folha 70.530 já está lançada: a primeira em branco vem depois
//   dela."), quem trouxe ("Escolha quem trouxe o bloco.") e a linha do livro da entrada parcial com as usadas da entrega;
// - a saída (r30-blocos-saida): as congregações ativas com a área (a inativa nem aparece), a liderança da congregação escolhida (a inativa, a que
//   não existe e o lixo: o mesmo 404; só a Tesouraria Geral), o rastreio do bloco que nunca saiu (a faixa desde a primeira folha e a chegada) e a
//   linha do livro com a primeira folha do bloco (a saída parcial diz as folhas e as posições);
// - o histórico da folha (r30-blocos-desfazer): quem marcou e quem desfez, quando e por quê, só das entregas que a pessoa alcança (a mesma resposta
//   para o que existe fora do alcance e o que não existe), as folhas com histórico na grade, a mensagem do motivo e a do desfazer;
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
const area = LIDER(TESOUREIRA_LOCAL, ["financeiro"], ["Central E2E", "Vila Nova E2E"], "AREA");
const semFinanceiro = LIDER(TESOUREIRA_LOCAL, ["pessoas"], ["Vila Nova E2E"]);

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

  console.log("== o histórico da folha e o desfazer (r30-blocos-desfazer) ==");
  // a tesoureira é da liderança de Vila Nova, como tesoureira (uma liderança por pessoa; o papel do histórico vem dela); o 1.405 (70.251 a 70.300)
  // vai a Vila Nova
  await q(`UPDATE Lideranca SET EscopoTipo = 'CONGREGACAO', EscopoId = ${VILA_NOVA}, AtivoAte = NULL,
             PapelId = COALESCE((SELECT TOP 1 PapelId FROM Papeis WHERE Nome = 'Tesoureiro'), PapelId) WHERE MembroId = ${TESOUREIRA_LOCAL}`);
  if (!Number(await escalar(`SELECT COUNT(*) FROM Lideranca WHERE MembroId = ${TESOUREIRA_LOCAL}`))) {
    await q(`INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) SELECT TOP 1 ${TESOUREIRA_LOCAL}, PapelId, 'CONGREGACAO', ${VILA_NOVA} FROM Papeis WHERE Nome = 'Tesoureiro'`);
  }
  const papelVN = await escalar(`SELECT p.Nome FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId WHERE l.MembroId = ${TESOUREIRA_LOCAL}`);
  const nomeTes = await escalar(`SELECT Nome FROM MembroReferencia WHERE MembroId = ${TESOUREIRA_LOCAL}`);
  const nomeGeral = await escalar(`SELECT Nome FROM MembroReferencia WHERE MembroId = ${TESOUREIRO_GERAL}`);
  const HORA = /^\d{4}-\d\d-\d\dT\d\d:\d\d$/;
  ok(!!papelVN && !!nomeTes && !!nomeGeral, "a tesoureira tem papel em Vila Nova", { papelVN, nomeTes, nomeGeral });
  ok((await POST(H, "entregar", geral, { primeiraFolha: 70251, congregacaoId: VILA_NOVA, pessoa: { nome: "Rute Santos" }, data: "2026-11-15" })).status === 200, "o 1.405 entregue a Vila Nova em 15/11");
  const b1405 = await idDo(1405);
  await lancarDireto(b1405, 70251, 70285);
  ok((await POST(H, "folha", local, { folha: 70286, oQueAconteceu: "extraviada", observacao: "Não achei a folha no bloco." })).status === 200, "Vila Nova marca a 36ª extraviada");
  r = await GET(H, "folhas", local, { bloco: b1405 });
  ok(r.status === 200 && JSON.stringify(r.body.comHistorico) === JSON.stringify([70286]), "as folhas dizem quais têm histórico: a 70.286 (a lançada sem histórico, não)", r.body.comHistorico);
  r = await GET(H, "historico", local, { folha: 70286 });
  let it = r.body && r.body.itens;
  ok(r.status === 200 && r.body.folha === 70286 && r.body.bloco === 1405 && r.body.posicao === 36 && it && it.length === 1
    && it[0].tipo === "marcou" && it[0].nome === nomeTes && it[0].papel === `${String(papelVN).toLowerCase()} de Vila Nova E2E` && it[0].destino === "extraviada"
    && it[0].texto === "Não achei a folha no bloco." && HORA.test(it[0].quando), "o histórico da 70.286: a tesoureira de Vila Nova marcou como extraviada, com a observação", r.body);

  console.log("-- desfazer, com o motivo --");
  r = await POST(H, "desfazer-folha", geral, { folha: 70286, motivo: "   " });
  ok(r.status === 422 && r.body.mensagem === "Escreva o motivo para desfazer.", "sem o motivo: a mensagem da r30", r.body);
  r = await POST(H, "desfazer-folha", geral, { folha: 70286, motivo: "A folha apareceu, estava com os recibos de outubro" });
  ok(r.status === 200 && r.body.mensagem === "A folha 70.286 voltou a ficar livre. O histórico guarda quem marcou, quem desfez e por quê.", "a Geral desfaz: a mensagem da r30", r.body);
  r = await GET(H, "historico", geral, { folha: 70286 });
  it = r.body && r.body.itens;
  ok(r.status === 200 && it && it.length === 2 && it[0].tipo === "marcou" && it[1].tipo === "desfez" && it[1].nome === nomeGeral && it[1].papel === "Tesouraria Geral"
    && it[1].destino === null && it[1].texto === "A folha apareceu, estava com os recibos de outubro" && HORA.test(it[1].quando) && it[1].quando >= it[0].quando,
    "o histórico depois de desfazer: quem marcou e quem desfez (a Tesouraria Geral), com o motivo", r.body);
  r = await GET(H, "folhas", local, { bloco: b1405 });
  ok(JSON.stringify(r.body.comHistorico) === JSON.stringify([70286]) && !r.body.folhas.some((x) => x.folha === 70286), "a folha livre de novo continua com histórico", r.body.comHistorico);
  ok((await GET(H, "historico", area, { folha: 70286 })).status === 200, "a área de Vila Nova vê o histórico");

  console.log("-- quem não alcança: a mesma resposta do que não existe --");
  const fora = await GET(H, "historico", central, { folha: 70286 });
  const semHist = await GET(H, "historico", local, { folha: 70287 });
  const naoExiste = await GET(H, "historico", local, { folha: 990001 });
  const lixo = await GET(H, "historico", local, { folha: "70286 OR 1=1" });
  ok(fora.status === 404 && semHist.status === 404 && naoExiste.status === 404 && lixo.status === 404
    && new Set([fora, semHist, naoExiste, lixo].map((x) => JSON.stringify(x.body))).size === 1,
    "a Central, a folha sem histórico, a que não existe e o lixo: o mesmo 404", [fora.body, semHist.body, naoExiste.body, lixo.body]);
  ok((await GET(H, "historico", null, { folha: 70286 })).status === 401, "sem sessão: 401");
  ok((await GET(H, "historico", semFinanceiro, { folha: 70286 })).status === 403, "sem a permissão financeiro: 403");

  console.log("-- marcar de novo, desfazer e lançar: o histórico acumula --");
  ok((await POST(H, "folha", local, { folha: 70286, oQueAconteceu: "cancelada", observacao: "Preenchida errado" })).status === 200, "a 70.286 marcada de novo, cancelada");
  it = (await GET(H, "historico", local, { folha: 70286 })).body.itens;
  ok(it && it.map((x) => x.tipo).join(",") === "marcou,desfez,marcou" && it[2].destino === "cancelada" && it[2].texto === "Preenchida errado", "três linhas, na ordem", it);
  ok((await POST(H, "desfazer-folha", geral, { folha: 70286, motivo: "Engano de novo" })).status === 200, "desfeita de novo");
  await lancarDireto(b1405, 70286, 70286);
  it = (await GET(H, "historico", local, { folha: 70286 })).body.itens;
  ok(it && it.map((x) => x.tipo).join(",") === "marcou,desfez,marcou,desfez", "a folha lançada mostra as exceções de antes dela (a lançada não é marcação)", it);
  r = await GET(H, "folhas", local, { bloco: b1405 });
  ok(JSON.stringify(r.body.comHistorico) === JSON.stringify([70286]), "a lançada com histórico continua na lista; a lançada sem histórico, não", r.body.comHistorico);
  ok((await GET(H, "historico", local, { folha: 70251 })).status === 404, "a lançada sem histórico não tem o que mostrar");

  console.log("-- a marcação de outra congregação no bloco que mudou de mãos --");
  r = await GET(H, "folhas", central, { bloco: b1404 });
  ok(r.status === 200 && !(r.body.comHistorico || []).includes(70245) && r.body.folhas.some((x) => x.folha === 70245 && x.destino === "inexistente"),
    "a Central vê a 45ª do 1.404 inexistente, sem o histórico de Vila Nova", r.body.comHistorico);
  ok((await GET(H, "historico", central, { folha: 70245 })).status === 404, "e não abre o histórico dela");
  r = await GET(H, "historico", local, { folha: 70245 });
  ok(r.status === 200 && r.body.itens.length === 1 && r.body.itens[0].destino === "inexistente", "Vila Nova abre o histórico da marcação dela", r.body);

  console.log("== a saída da r30: para quem o bloco vai ==");
  const ativas = await q(`SELECT c.CongregacaoId, c.Nome, a.Nome AS Area FROM Congregacoes c LEFT JOIN Areas a ON a.AreaId = c.AreaId WHERE c.Ativa = 1 ORDER BY c.Nome, c.CongregacaoId`);
  r = await GET(H, "para-saida", geral, {});
  ok(r.status === 200 && JSON.stringify(r.body.congregacoes) === JSON.stringify(ativas.map((c) => ({ id: c.CongregacaoId, nome: c.Nome, area: c.Area || null }))),
    "as congregações ativas, em ordem de nome, com a área de cada uma", r.body);
  ok(ativas.some((c) => c.Area) , "o cenário tem congregação com área (a frase do \"Levado pela área\")", ativas);
  await q(`UPDATE Congregacoes SET Ativa = 0 WHERE CongregacaoId = 3`);
  const semInativa = await GET(H, "para-saida", geral, {});
  const inativa = await GET(H, "para-saida", geral, { congregacaoId: 3 });
  await q(`UPDATE Congregacoes SET Ativa = 1 WHERE CongregacaoId = 3`);
  ok(semInativa.status === 200 && !semInativa.body.congregacoes.some((c) => c.id === 3), "a congregação inativa nem aparece na lista", semInativa.body);
  const lideres = await q(`SELECT m.MembroId, m.Nome, MIN(p.Nome) AS Papel FROM Lideranca l JOIN MembroReferencia m ON m.MembroId = l.MembroId LEFT JOIN Papeis p ON p.PapelId = l.PapelId
                           WHERE l.EscopoTipo = 'CONGREGACAO' AND l.EscopoId = ${VILA_NOVA} AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))
                           GROUP BY m.MembroId, m.Nome ORDER BY m.Nome`);
  r = await GET(H, "para-saida", geral, { congregacaoId: VILA_NOVA });
  const vn = ativas.find((c) => c.CongregacaoId === VILA_NOVA);
  ok(r.status === 200 && JSON.stringify(r.body.congregacao) === JSON.stringify({ id: VILA_NOVA, nome: vn.Nome, area: vn.Area || null })
    && JSON.stringify(r.body.pessoas) === JSON.stringify(lideres.map((l) => ({ membroId: l.MembroId, nome: l.Nome, papel: l.Papel || "" }))),
    "Vila Nova: a congregação, a área e a liderança dela (a lista de \"Entregue a\")", r.body);
  ok(lideres.some((l) => l.MembroId === TESOUREIRA_LOCAL), "a tesoureira de Vila Nova está na lista", lideres);
  const naoHa = await GET(H, "para-saida", geral, { congregacaoId: 999999 });
  const lixoC = await GET(H, "para-saida", geral, { congregacaoId: "2 OR 1=1" });
  const injecao = await GET(H, "para-saida", geral, { congregacaoId: "2; DROP TABLE FinBlocos" });
  ok([inativa, naoHa, lixoC, injecao].every((x) => x.status === 404) && new Set([inativa, naoHa, lixoC, injecao].map((x) => JSON.stringify(x.body))).size === 1,
    "a inativa, a que não existe, o lixo e a injeção: o mesmo 404", [inativa, naoHa, lixoC, injecao].map((x) => x.status));
  ok(Number(await escalar(`SELECT COUNT(*) FROM FinBlocos`)) > 0, "a injeção não apagou nada");
  ok((await GET(H, "para-saida", null, {})).status === 401, "sem sessão: 401");
  const negados = [await GET(H, "para-saida", local, {}), await GET(H, "para-saida", area, { congregacaoId: VILA_NOVA }), await GET(H, "para-saida", semFinanceiro, {})];
  ok(negados.every((x) => x.status === 403), "a congregação, a área e quem não tem o financeiro: 403 (só a Tesouraria Geral registra a saída)", negados.map((x) => x.status));

  console.log("-- o rastreio do bloco que nunca saiu e a linha do livro --");
  r = await GET(H, "rastreio", geral, { folha: 70520 });
  ok(r.status === 200 && r.body.bloco.numero === 1410 && r.body.bloco.situacao === "na-geral" && r.body.bloco.chegouEm === "2026-11-01" && r.body.bloco.parcial === false
    && JSON.stringify(r.body.bloco.faixa) === JSON.stringify({ primeiraFolha: 70501, ultimaFolha: 70550 }),
    "qualquer folha acha o bloco que nunca saiu: a faixa desde a primeira folha e a chegada", r.body.bloco);
  r = await POST(H, "entregar", geral, { primeiraFolha: 70501, congregacaoId: VILA_NOVA, pessoa: { membroId: TESOUREIRA_LOCAL }, data: "2026-11-20" });
  ok(r.status === 200 && r.body.mensagem === `Bloco 1.410 entregue a ${vn.Nome}. Está no livro.`, "o 1.410 sai para Vila Nova (a confirmação da r30)", r.body);
  // o livro inteiro, de 5 em 5 (a saída do 1.410, de 20/11, vem depois das reentregas de 21/11)
  const todas = [];
  for (let pg = 1; pg <= 10; pg++) {
    const x = (await GET(H, "livro", geral, { porPagina: 5, pagina: pg })).body.registros;
    todas.push(...x);
    if (x.length < 5) break;
  }
  const s1410 = todas.find((x) => x.tipo === "saida" && x.bloco === 1410);
  ok(s1410 && s1410.blocoPrimeiraFolha === 70501 && s1410.folhas.primeiraFolha === 70501 && s1410.folhas.ultimaFolha === 70550,
    "a linha da saída inteira: as folhas começam na primeira do bloco", s1410);
  const parciais = todas.filter((x) => x.tipo === "saida" && x.folhas.primeiraFolha !== x.blocoPrimeiraFolha);
  ok(parciais.length > 0 && parciais.every((x) => x.folhas.primeiraFolha > x.blocoPrimeiraFolha && x.folhas.ultimaFolha >= x.folhas.primeiraFolha),
    "a saída do bloco que voltou em parte: a linha tem a faixa e a primeira folha do bloco (as posições)", parciais);

  console.log("== a devolução da r30: completa ou parcial ==");
  const b1410 = await idDo(1410);
  await lancarDireto(b1410, 70501, 70535);
  ok((await POST(H, "folha", local, { folha: 70536, oQueAconteceu: "cancelada", observacao: "Preenchida errado" })).status === 200, "a 70.536 cancelada em Vila Nova");
  const antesDev = await retratoFin();
  r = await POST(H, "devolver", geral, { primeiraFolha: 70501, pessoa: {}, parcial: false });
  ok(r.status === 422 && r.body.mensagem === "Escolha quem trouxe o bloco.", "sem quem trouxe: o texto da r30", r.body);
  r = await POST(H, "devolver", geral, { primeiraFolha: 70501, pessoa: { nome: "Rute Santos" }, parcial: true, primeiraEmBranco: 70530, data: "2026-11-22" });
  ok(r.status === 422 && r.body.mensagem === "A folha 70.530 já está lançada: a primeira em branco vem depois dela.", "a primeira em branco digitada já está lançada (o texto da r30)", r.body);
  r = await POST(H, "devolver", geral, { primeiraFolha: 70501, pessoa: { nome: "Rute Santos" }, parcial: true, primeiraEmBranco: 70536, data: "2026-11-22" });
  ok(r.status === 422 && r.body.mensagem === "A folha 70.536 já está cancelada: a primeira em branco vem depois dela.", "e a que já está cancelada", r.body);
  ok((await retratoFin()) === antesDev, "as recusas não mexeram no banco");
  r = await GET(H, "rastreio", geral, { folha: 70501 });
  ok(r.status === 200 && r.body.primeiraEmBranco === 70537, "o rastreio sugere a 70.537, a seguinte à última com destino", r.body.primeiraEmBranco);
  r = await POST(H, "devolver", geral, { primeiraFolha: 70501, pessoa: { membroId: TESOUREIRA_LOCAL }, parcial: true, primeiraEmBranco: 70537, data: "2026-11-22" });
  ok(r.status === 200 && r.body.mensagem === "Bloco 1.410 de volta, parcial: as folhas 70.537 a 70.550 estão livres para outra entrega.", "o 1.410 de volta, parcial", r.body);
  const todasDev = [];
  for (let pg = 1; pg <= 10; pg++) {
    const x = (await GET(H, "livro", geral, { porPagina: 5, pagina: pg })).body.registros;
    todasDev.push(...x);
    if (x.length < 5) break;
  }
  const e1410 = todasDev.find((x) => x.tipo === "entrada" && x.bloco === 1410);
  ok(e1410 && e1410.parcial === true && e1410.usadas === 36 && e1410.contagem.livres === 14 && JSON.stringify(e1410.faixaLivre) === JSON.stringify({ primeiraFolha: 70537, ultimaFolha: 70550 }),
    "a linha da entrada parcial: as 36 usadas da entrega e as 14 livres de novo (70.537 a 70.550)", e1410);
  const c1401 = todasDev.find((x) => x.tipo === "entrada" && x.bloco === 1401);
  const c1402 = todasDev.find((x) => x.tipo === "entrada" && x.bloco === 1402 && x.parcial === false);
  ok(c1401 && c1401.parcial === false && c1401.usadas === 50 && c1402 && c1402.usadas === 11,
    "a entrada completa diz as usadas da entrega: as 50 do 1.401 e as 11 da reentrega do 1.402 (70.140 a 70.150)", [c1401, c1402]);

  console.log("== a 203 de novo, sobre dados ==");
  const antes = await retratoFin();
  await aplicarMigracao("203");
  await aplicarMigracao("203");
  ok((await retratoFin()) === antes, "a 203 rodada duas vezes sobre o banco com inexistentes não muda nada");
  ok(Number(await escalar(`SELECT COUNT(*) FROM FinFolhas WHERE Destino = 'INEXISTENTE'`)) === 3 && b1402 > 0, "as três inexistentes continuam lá");

  fim("e2e-202 (Financeiro: o que a r30 pede ao servidor)");
})().catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
