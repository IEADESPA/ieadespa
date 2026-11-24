// e2e-202-financeiro-r30.js — FASE 10, Financeiro (módulo 2): o que as telas da rodada 30 (aprovadas em 24/11/2026) pedem ao servidor, contra o SQL
// Server de verdade. Base: cenario-200 (a 200, a 201, a 202 e a 203 aplicadas duas vezes), no LocalDB próprio do Financeiro:
//   E2E_INSTANCIA=fin E2E_BANCO=ieadespa_fin E2E_CS='Server=(localdb)\fin;Database=ieadespa_fin;Integrated Security=true' BASE=cenario-200 bash rodar.sh roteiro e2e-202-financeiro-r30.js
// Cobre:
// - as folhas da r30: o seletor de bloco em todos os níveis (a situação, as datas, a faixa vista e as usadas de cada bloco; o bloco que voltou em
//   parte também na Geral, "na Tesouraria Geral") e a volta parcial (de onde, quando e as usadas: a faixa da entrega antes da primeira em branco);
// - a FOLHA INEXISTENTE (decisão dele de 24/11/2026): a folha que a gráfica não imprimiu é um tipo a mais de exceção, onde as outras já aparecem
//   (marcar, ver, contar no livro, desfazer), com a observação obrigatória; a migração 203 (o destino com 11 letras nas duas tabelas e os CHECKs),
//   rodada de novo sobre dados. Duas consequências da regra ao pé da letra ficam fixadas como estão (perguntas abertas): a 50ª inexistente com
//   folhas em branco antes dela não deixa a devolução ser parcial, e a Geral não marca a inexistente antes de entregar o bloco.
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
  // pergunta aberta (regra ao pé da letra: a inexistente vale onde as outras valem): com a 50ª inexistente, não sobra "primeira em branco" depois da
  // última folha com destino, e a parcial antes dela é recusada
  ok(r.body.primeiraEmBranco === null, "pergunta aberta: com a 50ª inexistente, o rastreio não sugere a primeira em branco", r.body.primeiraEmBranco);
  r = await POST(H, "devolver", geral, { primeiraFolha: 70051, pessoa: { nome: "Rute Santos" }, parcial: true, primeiraEmBranco: 70090, data: "2026-11-20" });
  ok(r.status === 422 && r.body.mensagem === "A folha 70.090 não pode ser a primeira em branco: a 70.100 já tem destino.", "pergunta aberta: a parcial antes da 50ª inexistente é recusada", r.body);
  // pergunta aberta: a Geral não cataloga a inexistente de um bloco que ainda não saiu
  r = await POST(H, "folha", geral, { folha: 70200, oQueAconteceu: "inexistente", observacao: "A gráfica não imprimiu" });
  ok(r.status === 422 && r.body.mensagem === "O bloco 1.403 ainda está na Tesouraria Geral: a folha só tem destino depois da entrega.", "pergunta aberta: a Geral não marca a inexistente antes da entrega", r.body);

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

  console.log("== a 203 de novo, sobre dados ==");
  const antes = await retratoFin();
  await aplicarMigracao("203");
  await aplicarMigracao("203");
  ok((await retratoFin()) === antes, "a 203 rodada duas vezes sobre o banco com inexistentes não muda nada");
  ok(Number(await escalar(`SELECT COUNT(*) FROM FinFolhas WHERE Destino = 'INEXISTENTE'`)) === 2 && b1402 > 0, "as duas inexistentes continuam lá");

  fim("e2e-202 (Financeiro: o que a r30 pede ao servidor)");
})().catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
