// e2e-204-financeiro-lancamentos.js — FASE 10, Financeiro (módulo 2), incremento 3: LANÇAR DÍZIMOS E OFERTAS (tela r24-lancamento, opção 1), contra o
// SQL Server de verdade. Base: cenario-200 (a 200 a 204 aplicadas duas vezes), no LocalDB próprio do Financeiro:
//   E2E_INSTANCIA=fin E2E_BANCO=ieadespa_fin E2E_CS='Server=(localdb)\fin;Database=ieadespa_fin;Integrated Security=true' BASE=cenario-200 bash rodar.sh roteiro e2e-204-financeiro-lancamentos.js
// Cobre:
// - a migração 204: as três tabelas, os CHECKs (o mês em que soma, a voluntária só no dízimo, a marca "mês posterior" sem valor, o dízimo com nome),
//   os índices das chaves estrangeiras e a 204 rodada de novo sobre dados;
// - a planilha: a vazia, a do mês anterior (a folha marcada "mês posterior" só com a linha), a do mês de agora (começa na marcada, que se preenche
//   com o nome e o valor obrigatórios), os pendentes da devolução parcial lançados depois, com a SaidaId da entrega original, mesmo com o bloco
//   já em outra congregação (N3), os totais e a tira;
// - a folha marcada na própria planilha (a decisão 4 corrigida de 26/11/2026): a cancelada, a arrancada e a inexistente, com o motivo, pela mesma
//   regra da aba Folhas (o papel da hora no histórico, o mesmo desfazer da r30), na ordem do bloco, tudo ou nada, só na entrega em curso;
// - o dia do lançamento (o mês de agora ou o anterior, nunca depois de hoje, o anterior só antes de mandar o relatório);
// - a correção com o motivo (a r27) e o histórico; a procura do dizimista (a Igreja inteira, só o nome, o número e a congregação);
// - a Geral lançando por uma congregação; a área que acompanha e não grava;
// - a bateria de segurança: cada nível, outra congregação, o "403/404 igual" para o que existe e o que não existe, injeção, lixo e a corrida de duas
//   gravações na mesma folha (a 2ª recusada), do lançamento com a exceção da mesma folha e da marca na planilha com a marca na aba Folhas.
// O "hoje" é o de Belém no dia em que o roteiro roda: as datas saem dele (o mês de agora e o anterior).
const L = require("./lib");
const { q, um, escalar, ok, fim, GET, POST, GERAL, LIDER, API, path, LIXO, hojeBr } = L;
const HB = require(path.join(API, "FinBlocos/index.js"));
const H = require(path.join(API, "FinLancamentos/index.js"));
const R = require(path.join(API, "shared/finLancamentos.js"));

const TESOUREIRO_GERAL = 1002, TESOUREIRA_LOCAL = 1003;
const CENTRAL = 1, VILA_NOVA = 2, BETA = 3;
const geral = GERAL(TESOUREIRO_GERAL, ["financeiro"]);
const local = LIDER(TESOUREIRA_LOCAL, ["financeiro"], ["Vila Nova E2E"]);
const central = LIDER(TESOUREIRA_LOCAL, ["financeiro"], ["Central E2E"]);
const area = LIDER(TESOUREIRA_LOCAL, ["financeiro"], ["Central E2E", "Vila Nova E2E"], "AREA");
const semFinanceiro = LIDER(TESOUREIRA_LOCAL, ["pessoas"], ["Vila Nova E2E"]);

// os dizimistas de mentira (os números da faixa 7.900.xxx não existem na base)
const ANA = 7900001, BRUNO = 7900002, CARLA = 7900003, INATIVO = 7900004, EXCLUIDO = 7900005, DAVI = 7900006;

const hoje = hojeBr(), agora = R.mesDe(hoje), anterior = R.mesAnterior(agora);
const nomeAgora = R.nomeDoMes(agora), nomeAnterior = R.nomeDoMes(anterior);
const ultimoAnterior = R.ultimoDia(anterior), penultimoAnterior = `${anterior.slice(0, 8)}${String(Number(ultimoAnterior.slice(8)) - 1).padStart(2, "0")}`;
const mesTela = (m) => m.slice(0, 7);

const TABELAS = ["FinFolhas", "FinLancamentos", "FinLancamentosCorrecoes", "FinRelatoriosMes", "FinLivroBlocos", "AuditLog"];
async function retratoFin() {
  const partes = [];
  for (const t of TABELAS) partes.push(JSON.stringify(await um(`SELECT COUNT(*) n, CHECKSUM_AGG(CHECKSUM(*)) c FROM ${t}`)));
  return partes.join("|");
}
async function aplicarMigracao(numero) {
  const fs = require("fs");
  const pasta = path.join(API, "..", "sql", "migrations");
  const nome = fs.readdirSync(pasta).find((n) => n.startsWith(`${numero}_`) && n.endsWith(".sql"));
  for (const lote of fs.readFileSync(path.join(pasta, nome), "utf8").split(/^\s*GO\s*$/gim).map((t) => t.trim()).filter(Boolean)) await q(lote);
}
async function recusaNoBanco(texto) {
  try { await q(texto); return false; } catch (e) { return /CHECK|FOREIGN KEY|UNIQUE|conflicted|duplicate/i.test(String(e.message)); }
}
const idDo = (numero) => escalar(`SELECT BlocoId FROM FinBlocos WHERE Numero = ${numero}`);
const salvar = (token, congregacaoId, dia, linhas) => POST(H, "salvar", token, { congregacaoId, dia, linhas });
const dizimo = (folha, membroId, valor, extra = {}) => ({ folha, referente: "ESTE_MES", tipo: "DIZIMO", forma: "PIX", valor, pessoa: { membroId }, ...extra });
const igual = (a, b) => a.status === b.status && JSON.stringify(a.body) === JSON.stringify(b.body);
// as corridas em processos separados (cada um com a sua conexão), no mesmo instante (o worker.js, como no e2e-201)
const { spawn } = require("child_process");
async function disparar(chamadas) {
  const t0 = Date.now() + 6000 + chamadas.length * 600;
  return Promise.all(chamadas.map((spec) => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-r", path.join(__dirname, "shim-mssql.js"), path.join(__dirname, "worker.js"), JSON.stringify({ ...spec, t0 })], { env: process.env });
    let saida = ""; p.stdout.on("data", (d) => { saida += d; });
    p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { status: -1 }); });
  })));
}
const TOK_CENTRAL = { tipo: "LIDER", membroId: 1003, permissoes: ["financeiro"], escopo: ["Central E2E"] };
const TOK_LOCAL = { tipo: "LIDER", membroId: 1003, permissoes: ["financeiro"], escopo: ["Vila Nova E2E"] };
const lancar = (token, congregacaoId, linhas) => ({ handler: "finLancamentos", acao: "salvar", token, corpo: { congregacaoId, dia: hojeBr(), linhas } });

(async () => {
  console.log(`== hoje (Belém): ${hoje}; o mês de agora: ${nomeAgora}; o anterior: ${nomeAnterior} ==`);

  console.log("== a migração 204 ==");
  for (const t of ["FinLancamentos", "FinLancamentosCorrecoes", "FinRelatoriosMes"]) ok(!!(await escalar(`SELECT OBJECT_ID(N'dbo.${t}', N'U')`)), `a tabela ${t} existe`);
  const semIndice = await q(`
    SELECT OBJECT_NAME(fk.parent_object_id) AS Tabela, c.name AS Coluna
    FROM sys.foreign_keys fk
    JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id AND fkc.constraint_column_id = 1
    JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
    WHERE OBJECT_NAME(fk.parent_object_id) IN ('FinLancamentos', 'FinLancamentosCorrecoes', 'FinRelatoriosMes') AND c.name NOT IN ('RegistradoPor')
      AND NOT EXISTS (SELECT 1 FROM sys.index_columns ic WHERE ic.object_id = fkc.parent_object_id AND ic.column_id = fkc.parent_column_id AND ic.key_ordinal = 1)`);
  ok(semIndice.length === 0, "toda chave estrangeira das tabelas da 204 começa um índice (menos quem registrou)", semIndice);

  console.log("== o cenário: o lote, a chegada, as entregas e os dizimistas ==");
  let r = await POST(HB, "lote", geral, { serie: 2026, primeiraFolha: 70001, totalFolhas: 10000 });
  ok(r.status === 201, "o lote 70.001 a 80.000", r.body);
  ok((await POST(HB, "chegada", geral, { loteId: r.body.loteId, ateFolha: 75000, data: `${anterior.slice(0, 8)}01` })).status === 200, "chegaram os blocos até a 75.000");
  ok((await POST(HB, "entregar", geral, { primeiraFolha: 70051, congregacaoId: VILA_NOVA, pessoa: { membroId: TESOUREIRA_LOCAL }, data: `${anterior.slice(0, 8)}02` })).status === 200, "o 1.401 (70.051 a 70.100) entregue a Vila Nova");
  ok((await POST(HB, "entregar", geral, { primeiraFolha: 70101, congregacaoId: CENTRAL, pessoa: { nome: "Rute Santos" }, data: `${anterior.slice(0, 8)}02` })).status === 200, "o 1.402 (70.101 a 70.150) entregue à Central");
  const [b1401, b1402] = [await idDo(1401), await idDo(1402)];
  const saida1401 = await escalar(`SELECT RegistroId FROM FinLivroBlocos WHERE Tipo = 'SAIDA' AND BlocoId = ${b1401}`);
  await q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status) VALUES
    (${ANA}, N'Ana Teste Cidade', ${CENTRAL}, 'ATIVO'), (${BRUNO}, N'Bruno Teste Vila', ${VILA_NOVA}, 'ATIVO'), (${CARLA}, N'Carla Teste Beta', ${BETA}, 'ATIVO'),
    (${INATIVO}, N'Anastácio Teste Inativo', ${VILA_NOVA}, 'INATIVO'), (${EXCLUIDO}, N'Anabela Teste Excluída', ${VILA_NOVA}, 'ATIVO'), (${DAVI}, N'Davi Teste 100% [x]_y', ${VILA_NOVA}, 'ATIVO')`);
  await q(`INSERT INTO SolicitacoesTitularLGPD (MembroId, Tipo, Status) VALUES (${EXCLUIDO}, 'EXCLUSAO', 'ATENDIDA')`);
  // a tesoureira é da liderança de Vila Nova, como tesoureira: o papel da hora vai para o histórico da folha que ela marca (205)
  await q(`UPDATE Lideranca SET EscopoTipo = 'CONGREGACAO', EscopoId = ${VILA_NOVA}, AtivoAte = NULL,
             PapelId = COALESCE((SELECT TOP 1 PapelId FROM Papeis WHERE Nome = 'Tesoureiro'), PapelId) WHERE MembroId = ${TESOUREIRA_LOCAL}`);
  if (!Number(await escalar(`SELECT COUNT(*) FROM Lideranca WHERE MembroId = ${TESOUREIRA_LOCAL}`))) {
    await q(`INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) SELECT TOP 1 ${TESOUREIRA_LOCAL}, PapelId, 'CONGREGACAO', ${VILA_NOVA} FROM Papeis WHERE Nome = 'Tesoureiro'`);
  }
  const PAPEL_VN = `${String(await escalar(`SELECT p.Nome FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId WHERE l.MembroId = ${TESOUREIRA_LOCAL}`)).toLowerCase()} de Vila Nova E2E`;

  console.log("== a planilha vazia ==");
  r = await GET(H, "", local, {});
  ok(r.status === 200 && r.body.congregacao && r.body.congregacao.nome === "Vila Nova E2E" && r.body.mes === agora && r.body.lancavel === true && r.body.podeLancar === true,
    "Vila Nova abre a planilha do mês de agora, a congregação vem sozinha", r.body);
  ok(r.body.comeca === 70051 && r.body.proxima && r.body.proxima.folha === 70051 && r.body.proxima.bloco === 1401 && r.body.linhas.length === 0 && r.body.diaPadrao === hoje,
    "sem nada lançado: começa na 70.051, a próxima, e o dia é hoje", { comeca: r.body.comeca, proxima: r.body.proxima, dia: r.body.diaPadrao });
  ok(r.body.tira && r.body.tira.numero === 1401 && r.body.tira.posicoes.length === 50 && r.body.tira.posicoes[0] === "proxima" && r.body.tira.legenda.length === 1,
    "a tira do 1.401: a 1ª é a próxima", r.body.tira && r.body.tira.legenda);

  console.log(`== ${nomeAnterior}: lançado no último dia, com uma folha marcada "mês posterior" ==`);
  r = await salvar(local, VILA_NOVA, penultimoAnterior, [dizimo(70051, BRUNO, "250,00"), { folha: 70052, referente: "ESTE_MES", tipo: "OFERTA_CULTO", forma: "ESPECIE", valor: "486,50" }]);
  ok(r.status === 200 && r.body.mensagem === "2 folhas salvas (70.051 a 70.052).", `Vila Nova lança a 70.051 e a 70.052 em ${penultimoAnterior}`, r.body);
  r = await salvar(local, VILA_NOVA, ultimoAnterior, [{ folha: 70053, referente: "MES_POSTERIOR" }, { folha: 70054, referente: "MES_POSTERIOR" }]);
  ok(r.status === 200, `a 70.053 e a 70.054 entregues em ${ultimoAnterior}, marcadas "mês posterior"`, r.body);
  let lin = await q(`SELECT Folha, CONVERT(char(10), Dia, 23) AS Dia, Referente, CONVERT(char(10), MesSoma, 23) AS MesSoma, Tipo, Forma, Valor, Voluntaria, MembroId, NomeDigitado, PelaGeral, RegistradoPor, SaidaId
                     FROM FinLancamentos ORDER BY Folha`);
  ok(lin.length === 4 && lin[0].Dia === penultimoAnterior && lin[0].MesSoma === anterior && Number(lin[0].Valor) === 250 && lin[0].MembroId === BRUNO && lin[0].PelaGeral === false
    && lin[0].RegistradoPor === TESOUREIRA_LOCAL && lin[0].SaidaId === saida1401, "a 70.051: o dia, o mês em que soma, o valor, o dizimista, quem registrou e a entrega", lin[0]);
  ok(lin[1].Tipo === "OFERTA_CULTO" && lin[1].MembroId === null && lin[1].NomeDigitado === null && Number(lin[1].Valor) === 486.5, "a 70.052: oferta de culto sem nome, R$ 486,50", lin[1]);
  ok(lin[2].Referente === "MES_POSTERIOR" && lin[2].MesSoma === agora && lin[2].Valor === null && lin[2].Tipo === null, `a 70.053: soma em ${nomeAgora}, sem nome e sem valor`, lin[2]);
  ok(Number(await escalar(`SELECT COUNT(*) FROM FinFolhas WHERE Folha BETWEEN 70051 AND 70054 AND Destino = 'LANCADA' AND SaidaId = ${saida1401}`)) === 4, "as quatro folhas lançadas em FinFolhas, com a entrega");
  r = await GET(H, "", local, { mes: mesTela(anterior) });
  let sit = r.body.linhas && r.body.linhas.map((x) => `${x.folha}:${x.situacao}`).join(" ");
  ok(r.status === 200 && sit === "70051:lancada 70052:lancada 70053:posterior 70054:posterior" && r.body.lancavel === true && r.body.diaPadrao === ultimoAnterior,
    `a planilha de ${nomeAnterior}: a 70.053 e a 70.054 só com a linha "referente ao mês posterior"`, { sit, lancavel: r.body.lancavel });
  ok(r.body.totais.total === 73650 && r.body.totais.dizimos === 25000 && r.body.totais.ofertaCulto === 48650 && r.body.totais.adiantado === 0,
    `os totais de ${nomeAnterior}: R$ 736,50 (as marcadas não somam)`, r.body.totais);
  const l1 = r.body.linhas[0];
  ok(l1.membroId === BRUNO && l1.membro === "Bruno Teste Vila" && l1.valor === 25000 && l1.tipo === "DIZIMO" && !("saidaId" in l1) && !("blocoId" in l1),
    "a linha traz o dizimista e o valor em centavos, sem os números internos", l1);

  console.log(`== ${nomeAgora}: a planilha começa na 1ª marcada; o nome e o valor são obrigatórios ==`);
  r = await GET(H, "", local, {});
  sit = r.body.linhas.map((x) => `${x.folha}:${x.situacao}`).join(" ");
  ok(sit === "70053:preencher 70054:preencher" && r.body.comeca === 70053 && JSON.stringify(r.body.marcadasNoAnterior) === "[70053,70054]" && r.body.proxima.folha === 70055,
    `${nomeAgora} começa na 70.053 (marcada em ${nomeAnterior}); a próxima é a 70.055`, { sit, comeca: r.body.comeca, proxima: r.body.proxima });
  ok(r.body.linhas[0].veioDoMesAnterior === true, "a linha diz que veio do mês anterior");
  r = await salvar(local, VILA_NOVA, hoje, [{ folha: 70053, tipo: "OFERTA_CULTO", forma: "ESPECIE", valor: "100,00" }]);
  ok(r.status === 422 && r.body.mensagem === "Folha 70.053: informe quem deu (a folha veio marcada do mês anterior).", "a marcada sem quem deu é recusada", r.body);
  ok(r.body.folha === 70053, "a recusa diz a folha (a tela marca a linha)", r.body);
  r = await salvar(local, VILA_NOVA, hoje, [{ folha: 70053, referente: "MES_POSTERIOR", tipo: "DIZIMO", forma: "ESPECIE", valor: "250,00", voluntaria: "30,00", pessoa: { membroId: BRUNO } },
    { folha: 70054, tipo: "DIZIMO", forma: "PIX", valor: "280,00", pessoa: { nome: "  Lídia   Teste " } }, dizimo(70055, ANA, "320,00"), dizimo(70056, BRUNO, "410,00", { forma: "ESPECIE" })]);
  ok(r.status === 200 && r.body.mensagem === "4 folhas salvas (70.053 a 70.056).", "a 70.053 e a 70.054 preenchidas, a 70.055 e a 70.056 novas, de uma vez", r.body);
  lin = await q(`SELECT Folha, CONVERT(char(10), Dia, 23) AS Dia, Referente, CONVERT(char(10), MesSoma, 23) AS MesSoma, Valor, Voluntaria, MembroId, NomeDigitado, PreenchidoPor, PreenchidoEm FROM FinLancamentos WHERE Folha IN (70053, 70054, 70055) ORDER BY Folha`);
  ok(lin[0].Dia === ultimoAnterior && lin[0].Referente === "MES_POSTERIOR" && Number(lin[0].Valor) === 250 && Number(lin[0].Voluntaria) === 30 && lin[0].PreenchidoPor === TESOUREIRA_LOCAL && lin[0].PreenchidoEm,
    "a 70.053 preenchida: o dia da entrega continua, o valor, a voluntária e quem preencheu", lin[0]);
  ok(lin[1].NomeDigitado === "Lídia Teste" && lin[1].MembroId === null, "a 70.054 com o nome digitado (espaços limpos)", lin[1]);
  ok(lin[2].Dia === hoje && lin[2].MesSoma === agora && lin[2].PreenchidoPor === null, "a 70.055: lançada hoje, soma neste mês", lin[2]);
  r = await GET(H, "", local, {});
  sit = r.body.linhas.map((x) => `${x.folha}:${x.situacao}`).join(" ");
  ok(sit === "70053:lancada 70054:lancada 70055:lancada 70056:lancada" && r.body.linhas[0].veioDoMesAnterior === true && r.body.proxima.folha === 70057, "as quatro lançadas; a próxima é a 70.057", sit);
  const t = r.body.totais;
  ok(t.dizimos === 25000 + 28000 + 32000 + 41000 && t.ofertaVoluntaria === 3000 && t.voluntariasJunto === 1 && t.total === 129000 && t.adiantado === 25000 + 3000 + 28000
    && t.pix === 28000 + 32000 && t.especie === 25000 + 3000 + 41000, `os totais de ${nomeAgora}: R$ 1.290,00, com R$ 560,00 adiantados`, t);
  const tira = r.body.tira;
  ok(tira.posicoes.slice(0, 7).join(",") === "antes,antes,posterior,posterior,mes,mes,proxima"
    && JSON.stringify(tira.legenda.map((x) => x.texto)) === JSON.stringify([`${nomeAnterior}: 1ª e 2ª`, "mês posterior: 3ª e 4ª", `${nomeAgora}: da 5ª`, "a próxima: 70.057"]),
    "a tira e a legenda, na ordem do papel", tira.legenda);

  console.log("== o que não vale ao lançar ==");
  let antes = await retratoFin();
  const recusas = [
    [[dizimo(70059, BRUNO, "10")], hoje, 422, "Folha 70.059: a próxima folha deste bloco é a 70.057 (as folhas vão na ordem do bloco)."],
    [[dizimo(70101, BRUNO, "10")], hoje, 422, "A folha 70.101 não é de um bloco entregue a Vila Nova E2E."],
    [[dizimo(79999, BRUNO, "10")], hoje, 422, "A folha 79.999 não é de um bloco entregue a Vila Nova E2E."],
    [[dizimo(70057, BRUNO, "10"), dizimo(70057, BRUNO, "11")], hoje, 422, "A folha 70.057 está duas vezes."],
    [[dizimo(70051, BRUNO, "10")], hoje, 409, "A folha 70.051 já foi lançada: para mudar, use Corrigir."],
    [[{ folha: 70057, referente: "ESTE_MES", tipo: "DIZIMO", forma: "PIX", valor: "10,00" }], hoje, 422, "Folha 70.057: o dízimo precisa de quem deu (do cadastro ou o nome digitado)."],
    [[dizimo(70057, 99999999, "10")], hoje, 422, "Folha 70.057: o membro escolhido não foi encontrado no cadastro."],
    [[{ folha: 70057, referente: "MES_POSTERIOR", valor: "10,00" }], hoje, 422, "Folha 70.057: a folha do mês posterior fica sem nome e sem valor; eles entram na planilha do mês seguinte."],
    [[dizimo(70057, BRUNO, "10")], R.mesSeguinte(agora), 422, "Depois de hoje: confira a data."],
    [[dizimo(70057, BRUNO, "10")], R.ultimoDia(R.mesAnterior(anterior)), 422, `Só se lança no mês de agora ou no anterior (${nomeAnterior}).`],
    [[dizimo(70057, BRUNO, "10")], "2026-02-30", 422, "Confira o dia do lançamento."],
    [[], hoje, 422, "Nenhuma folha para salvar."]
  ];
  for (const [linhas, dia, status, mensagem] of recusas) {
    r = await salvar(local, VILA_NOVA, dia, linhas);
    ok(r.status === status && r.body.mensagem === mensagem, `recusada: ${mensagem}`, r.body);
  }
  ok((await retratoFin()) === antes, "nenhuma recusa mexeu no banco");

  console.log("== o relatório do mês anterior mandado: o mês fecha para lançar ==");
  await q(`INSERT INTO FinRelatoriosMes (CongregacaoId, Mes, RegistradoPor) VALUES (${VILA_NOVA}, '${anterior}', ${TESOUREIRA_LOCAL})`);
  r = await salvar(local, VILA_NOVA, ultimoAnterior, [dizimo(70057, BRUNO, "10")]);
  ok(r.status === 422 && r.body.mensagem === `O relatório de ${nomeAnterior} já foi mandado: lance em ${nomeAgora}.`, "o mês anterior não recebe mais", r.body);
  r = await GET(H, "", local, { mes: mesTela(anterior) });
  ok(r.status === 200 && r.body.lancavel === false && r.body.mandouAnterior === true, "a planilha do mês anterior fica só para ver", { lancavel: r.body.lancavel });
  ok(await recusaNoBanco(`INSERT INTO FinRelatoriosMes (CongregacaoId, Mes, RegistradoPor) VALUES (${VILA_NOVA}, '${anterior}', ${TESOUREIRA_LOCAL})`), "o mesmo mês não se manda duas vezes (UNIQUE)");
  ok(await recusaNoBanco(`INSERT INTO FinRelatoriosMes (CongregacaoId, Mes, RegistradoPor) VALUES (${VILA_NOVA}, '2026-01-15', ${TESOUREIRA_LOCAL})`), "o mês do relatório no dia 15 é recusado (CHECK)");
  await q(`DELETE FROM FinRelatoriosMes`);

  console.log("== os CHECKs da 204 ==");
  const ins = (campos) => `INSERT INTO FinLancamentos (CongregacaoId, BlocoId, Folha, SaidaId, Dia, Referente, MesSoma, Tipo, Forma, Valor, Voluntaria, MembroId, NomeDigitado, RegistradoPor)
    VALUES (${VILA_NOVA}, ${b1401}, 70051, ${saida1401}, ${campos})`;
  await q(`DELETE FROM FinLancamentos WHERE Folha = 70052`);
  const insLivre = (campos) => ins(campos).replace("70051", "70052");
  ok(await recusaNoBanco(insLivre(`'2026-11-10', 'ESTE_MES', '2026-12-01', 'DIZIMO', 'PIX', 10, NULL, ${BRUNO}, NULL, ${TESOUREIRA_LOCAL}`)), "o mês em que soma não confere com o dia: recusado");
  ok(await recusaNoBanco(insLivre(`'2026-11-10', 'MES_ANTERIOR', '2026-10-01', 'DIZIMO', 'PIX', 10, NULL, ${BRUNO}, NULL, ${TESOUREIRA_LOCAL}`)), "\"mês anterior\" não existe: recusado");
  ok(await recusaNoBanco(insLivre(`'2026-11-10', 'ESTE_MES', '2026-11-01', 'OFERTA_CULTO', 'PIX', 10, 5, NULL, NULL, ${TESOUREIRA_LOCAL}`)), "a voluntária junto da oferta de culto: recusada");
  ok(await recusaNoBanco(insLivre(`'2026-11-10', 'ESTE_MES', '2026-11-01', NULL, NULL, NULL, NULL, NULL, NULL, ${TESOUREIRA_LOCAL}`)), "a folha \"este mês\" sem valor: recusada");
  ok(await recusaNoBanco(insLivre(`'2026-11-10', 'ESTE_MES', '2026-11-01', 'DIZIMO', 'PIX', 10, NULL, NULL, NULL, ${TESOUREIRA_LOCAL}`)), "o dízimo sem quem deu: recusado");
  ok(await recusaNoBanco(insLivre(`'2026-11-10', 'ESTE_MES', '2026-11-01', 'DIZIMO', 'PIX', 0, NULL, ${BRUNO}, NULL, ${TESOUREIRA_LOCAL}`)), "o valor zero: recusado");
  ok(await recusaNoBanco(insLivre(`'2026-11-10', 'ESTE_MES', '2026-11-01', 'DIZIMO', 'PIX', 10, NULL, ${BRUNO}, N'Fulano', ${TESOUREIRA_LOCAL}`)), "o membro e o nome digitado juntos: recusado");
  ok(await recusaNoBanco(insLivre(`'2026-11-10', 'MES_POSTERIOR', '2026-12-01', 'DIZIMO', NULL, NULL, NULL, ${BRUNO}, NULL, ${TESOUREIRA_LOCAL}`)), "a marca \"mês posterior\" com só uma parte preenchida: recusada");
  ok(await recusaNoBanco(ins(`'2026-11-10', 'ESTE_MES', '2026-11-01', 'DIZIMO', 'PIX', 10, NULL, ${BRUNO}, NULL, ${TESOUREIRA_LOCAL}`)), "a mesma folha duas vezes: recusada (UNIQUE)");
  ok(await recusaNoBanco(insLivre(`'2026-11-10', 'ESTE_MES', '2026-11-01', 'DIZIMO', 'PIX', 10, NULL, ${BRUNO}, NULL, ${TESOUREIRA_LOCAL}`).replace(`${saida1401}, '2026`, `${await escalar(`SELECT RegistroId FROM FinLivroBlocos WHERE Tipo = 'SAIDA' AND BlocoId = ${b1402}`)}, '2026`)),
    "a entrega de outro bloco: recusada (a chave composta)");
  await q(`INSERT INTO FinLancamentos (CongregacaoId, BlocoId, Folha, SaidaId, Dia, Referente, MesSoma, Tipo, Forma, Valor, RegistradoPor)
           VALUES (${VILA_NOVA}, ${b1401}, 70052, ${saida1401}, '${penultimoAnterior}', 'ESTE_MES', '${anterior}', 'OFERTA_CULTO', 'ESPECIE', 486.50, ${TESOUREIRA_LOCAL})`);
  console.log("== a 204 rodada de novo sobre dados ==");
  const contagem = await retratoFin();
  await aplicarMigracao(204);
  ok((await retratoFin()) === contagem, "a 204 de novo não muda nada (idempotente)");

  console.log("== a correção (a regra da r27) e o histórico ==");
  r = await POST(H, "corrigir", local, { folha: 70055, tipo: "DIZIMO", forma: "PIX", valor: "230,00", pessoa: { membroId: ANA }, motivo: "  digitei 320 no lugar de 230 " });
  ok(r.status === 200 && r.body.mensagem === "Folha 70.055 corrigida.", "Vila Nova corrige a 70.055 de R$ 320,00 para R$ 230,00", r.body);
  const cor = await um(`SELECT l.Valor, l.CorrigidoEm, x.Antes, x.Depois, x.Motivo, x.RegistradoPor FROM FinLancamentos l JOIN FinLancamentosCorrecoes x ON x.LancamentoId = l.LancamentoId WHERE l.Folha = 70055`);
  ok(cor && Number(cor.Valor) === 230 && cor.CorrigidoEm && JSON.parse(cor.Antes).valor === 32000 && JSON.parse(cor.Depois).valor === 23000 && JSON.parse(cor.Antes).quem === "Ana Teste Cidade"
    && cor.Motivo === "digitei 320 no lugar de 230" && cor.RegistradoPor === TESOUREIRA_LOCAL, "a linha muda e a trilha guarda o antes, o depois, o motivo e quem", cor);
  r = await GET(H, "historico", local, { folha: 70055 });
  ok(r.status === 200 && r.body.lancamento.dia === hoje && r.body.correcoes.length === 1 && r.body.correcoes[0].antes.valor === 32000 && r.body.correcoes[0].depois.valor === 23000
    && r.body.correcoes[0].motivo === "digitei 320 no lugar de 230" && r.body.correcoes[0].por && r.body.correcoes[0].em, "o histórico da linha: o antigo, o novo, o motivo, quem e quando", r.body);
  r = await GET(H, "historico", local, { folha: 70053 });
  ok(r.status === 200 && r.body.lancamento.preenchidoEm && r.body.lancamento.dia === ultimoAnterior && r.body.correcoes.length === 0, "o histórico da 70.053: quem preencheu e quando", r.body.lancamento);
  antes = await retratoFin();
  const recusasCorrecao = [
    [{ folha: 70055, tipo: "DIZIMO", forma: "PIX", valor: "230,00", pessoa: { membroId: ANA }, motivo: "   " }, 422, "Escreva o motivo da correção."],
    [{ folha: 70055, tipo: "DIZIMO", forma: "PIX", valor: "230,00", pessoa: { membroId: ANA }, motivo: "de novo" }, 422, "Nada mudou: confira os campos."],
    [{ folha: 70055, tipo: "OFERTA_CULTO", forma: "PIX", valor: "230,00", voluntaria: "5,00", motivo: "x" }, 422, "A oferta voluntária junto só vai com o dízimo."],
    [{ folha: 70055, tipo: "DIZIMO", forma: "PIX", valor: "230,00", pessoa: { membroId: 99999999 }, motivo: "x" }, 422, "O membro escolhido não foi encontrado no cadastro."]
  ];
  for (const [corpo, status, mensagem] of recusasCorrecao) {
    r = await POST(H, "corrigir", local, corpo);
    ok(r.status === status && r.body.mensagem === mensagem, `correção recusada: ${mensagem}`, r.body);
  }
  ok((await retratoFin()) === antes, "nenhuma correção recusada mexeu no banco");

  console.log("== a exceção se marca na própria planilha, com o motivo (a decisão 4 corrigida de 26/11/2026) ==");
  const marca = (folha, oQueAconteceu, observacao) => ({ folha, excecao: { oQueAconteceu, observacao } });
  const salvasAntes = Number(await escalar(`SELECT COUNT(*) FROM AuditLog WHERE Acao = 'FIN_LANCAMENTO_SALVO'`));
  r = await salvar(local, VILA_NOVA, hoje, [marca(70057, "arrancada", "  Rasgou ao preencher ")]);
  ok(r.status === 200 && r.body.mensagem === "Folha 70.057 marcada como arrancada.", "Vila Nova marca a 70.057 como arrancada na planilha", r.body);
  let fol = await um(`SELECT Destino, Observacao, PapelNaHora, RegistradoPor, SaidaId FROM FinFolhas WHERE Folha = 70057`);
  ok(fol && fol.Destino === "ARRANCADA" && fol.Observacao === "Rasgou ao preencher" && fol.PapelNaHora === PAPEL_VN && fol.RegistradoPor === TESOUREIRA_LOCAL && fol.SaidaId === saida1401,
    "a folha guarda o destino, o motivo, o papel da hora, quem marcou e a entrega (a mesma regra da aba Folhas)", fol);
  ok(Number(await escalar(`SELECT COUNT(*) FROM FinLancamentos WHERE Folha = 70057`)) === 0, "a marcada não vira lançamento");
  ok(Number(await escalar(`SELECT COUNT(*) FROM AuditLog WHERE Acao = 'FIN_FOLHA_EXCECAO' AND DadosDepois LIKE '%70057%'`)) === 1
    && Number(await escalar(`SELECT COUNT(*) FROM AuditLog WHERE Acao = 'FIN_LANCAMENTO_SALVO'`)) === salvasAntes, "a auditoria da exceção, sem a do lançamento");
  r = await GET(HB, "historico", local, { folha: 70057 });
  ok(r.status === 200 && r.body.itens.length === 1 && r.body.itens[0].tipo === "marcou" && r.body.itens[0].papel === PAPEL_VN && r.body.itens[0].destino === "arrancada"
    && r.body.itens[0].texto === "Rasgou ao preencher", "o histórico da 70.057: quem marcou, com o papel da hora e o motivo", r.body.itens);
  r = await GET(H, "", local, {});
  let lin57 = r.body.linhas.find((x) => x.folha === 70057);
  ok(lin57 && lin57.situacao === "excecao" && lin57.destino === "ARRANCADA" && lin57.observacao === "Rasgou ao preencher" && r.body.proxima.folha === 70058,
    "a planilha mostra a arrancada com o motivo; a próxima é a 70.058", { lin57, proxima: r.body.proxima });
  r = await salvar(local, VILA_NOVA, hoje, [dizimo(70057, BRUNO, "10")]);
  ok(r.status === 409 && r.body.mensagem === "A folha 70.057 está marcada como arrancada." && r.body.folha === 70057, "a arrancada não se lança (a recusa diz a folha)", r.body);

  console.log("== o desfazer da r30 vale para a folha marcada na planilha ==");
  ok((await POST(HB, "desfazer-folha", local, { folha: 70057, motivo: "x" })).status === 403, "a congregação não desfaz (só a Tesouraria Geral)");
  r = await POST(HB, "desfazer-folha", geral, { folha: 70057, motivo: "A folha estava inteira, só dobrada" });
  ok(r.status === 200, "a Tesouraria Geral desfaz a marca da 70.057", r.body);
  r = await GET(H, "", local, {});
  ok(!r.body.linhas.some((x) => x.folha === 70057) && r.body.proxima.folha === 70057, "a 70.057 volta a ser a próxima", r.body.proxima);
  r = await salvar(local, VILA_NOVA, hoje, [marca(70057, "arrancada", "Rasgou de vez ao preencher")]);
  ok(r.status === 200, "e se marca de novo, na planilha", r.body);
  r = await GET(HB, "historico", local, { folha: 70057 });
  ok(r.status === 200 && r.body.itens.map((x) => `${x.tipo}:${x.papel}`).join(" ") === `marcou:${PAPEL_VN} desfez:Tesouraria Geral marcou:${PAPEL_VN}`
    && r.body.itens[1].texto === "A folha estava inteira, só dobrada" && r.body.itens[2].texto === "Rasgou de vez ao preencher", "o histórico: marcou, desfez (com o motivo) e marcou de novo", r.body.itens);

  console.log("== o que não vale ao marcar na planilha ==");
  antes = await retratoFin();
  const recusasMarca = [
    [[marca(70060, "cancelada", "Preenchida errado")], 422, "Folha 70.060: a próxima folha deste bloco é a 70.058 (as folhas vão na ordem do bloco)."],
    [[marca(70058, "extraviada", "Sumiu")], 422, "Folha 70.058: a extraviada se marca na aba Folhas do bloco."],
    [[marca(70058, "rasgada", "x")], 422, "Folha 70.058: escolha o que aconteceu: cancelada, arrancada ou inexistente."],
    [[marca(70058, "cancelada", "   ")], 422, "Folha 70.058: escreva o motivo (o que aconteceu com a folha)."],
    [[{ ...marca(70058, "cancelada", "x"), valor: "10,00" }], 422, "Folha 70.058: a folha marcada fica sem tipo, sem valor e sem quem deu."],
    [[marca(70056, "cancelada", "x")], 409, "A folha 70.056 já foi lançada: para mudar, use Corrigir."],
    [[marca(70057, "cancelada", "x")], 409, "A folha 70.057 está marcada como arrancada."],
    [[marca(70101, "cancelada", "x")], 422, "A folha 70.101 não é de um bloco entregue a Vila Nova E2E."],
    // tudo ou nada: a linha boa junto da ruim também não entra
    [[dizimo(70058, BRUNO, "5,00"), marca(70059, "cancelada", "")], 422, "Folha 70.059: escreva o motivo (o que aconteceu com a folha)."],
    [[marca(70058, "cancelada", "Preenchida errado"), dizimo(70060, BRUNO, "5,00")], 422, "Folha 70.060: a próxima folha deste bloco é a 70.059 (as folhas vão na ordem do bloco)."]
  ];
  for (const [linhas, status, mensagem] of recusasMarca) {
    r = await salvar(local, VILA_NOVA, hoje, linhas);
    ok(r.status === status && r.body.mensagem === mensagem, `marca recusada: ${mensagem}`, r.body);
  }
  ok((await retratoFin()) === antes, "nenhuma marca recusada mexeu no banco (nem a 1ª linha boa junto da ruim)");
  ok(igual(await salvar(area, VILA_NOVA, hoje, [marca(70058, "cancelada", "x")]), await salvar(area, BETA, hoje, [marca(70058, "cancelada", "x")]))
    && (await salvar(area, VILA_NOVA, hoje, [marca(70058, "cancelada", "x")])).status === 403, "a área não marca na planilha (o mesmo 403)");

  console.log("== a aba Folhas marca também, pela mesma regra; o pendente da devolução parcial ganha destino pelo lançamento (N3) ==");
  r = await POST(HB, "folha", local, { folha: 70062, oQueAconteceu: "cancelada", observacao: "Preenchida errado" });
  ok(r.status === 200, "a 70.062 cancelada na aba Folhas: a 70.058 a 70.061 ficam para trás, sem destino");
  r = await GET(H, "", local, {});
  sit = r.body.linhas.map((x) => `${x.folha}:${x.situacao}`).join(" ");
  ok(/70057:excecao 70058:pendente 70059:pendente 70060:pendente 70061:pendente 70062:excecao$/.test(sit) && r.body.proxima.folha === 70063, "a planilha: as exceções com o motivo e os pendentes no meio", sit);
  const arr = r.body.linhas.find((x) => x.folha === 70057);
  ok(arr.destino === "ARRANCADA" && arr.observacao === "Rasgou de vez ao preencher", "a arrancada mostra o motivo", arr);
  r = await salvar(local, VILA_NOVA, hoje, [dizimo(70059, BRUNO, "15,00")]);
  ok(r.status === 200, "o pendente do meio se lança fora da sequência", r.body);
  r = await POST(HB, "devolver", geral, { primeiraFolha: 70051, pessoa: { nome: "Rute Santos" }, parcial: true, primeiraEmBranco: 70063, data: hoje });
  ok(r.status === 200, "o 1.401 volta parcial (70.063 em diante livres); a 70.058, a 70.060 e a 70.061 continuam com Vila Nova", r.body);
  ok((await POST(HB, "entregar", geral, { primeiraFolha: 70063, congregacaoId: CENTRAL, pessoa: { nome: "Rute Santos" }, data: hoje })).status === 200, "o resto do 1.401 sai para a Central");
  r = await GET(H, "", local, {});
  sit = r.body.linhas.map((x) => `${x.folha}:${x.situacao}`).join(" ");
  ok(sit.includes("70058:pendente") && sit.includes("70060:pendente") && !sit.includes("70063") && r.body.proxima === null, "Vila Nova ainda vê os pendentes; não tem próxima (sem bloco em curso)", { sit, proxima: r.body.proxima });
  antes = await retratoFin();
  r = await salvar(local, VILA_NOVA, hoje, [marca(70058, "cancelada", "Preenchida errado")]);
  ok(r.status === 422 && r.body.mensagem === "Folha 70.058: o bloco 1.401 já voltou desta entrega; a folha que ficou sem destino só se lança.", "o pendente da entrega que voltou não se marca", r.body);
  r = await POST(HB, "folha", local, { folha: 70058, oQueAconteceu: "cancelada", observacao: "Preenchida errado" });
  ok(r.status === 404, "nem na aba Folhas (o bloco já está na Central: para Vila Nova, a folha não aparece)", r.body);
  ok((await retratoFin()) === antes, "nada mudou");
  r = await salvar(local, VILA_NOVA, hoje, [dizimo(70060, BRUNO, "20,00"), dizimo(70058, BRUNO, "18,00")]);
  ok(r.status === 200 && r.body.mensagem === "2 folhas salvas (70.058 a 70.060).", "Vila Nova lança os pendentes com o bloco já na Central", r.body);
  ok(Number(await escalar(`SELECT COUNT(*) FROM FinLancamentos WHERE Folha IN (70058, 70060) AND SaidaId = ${saida1401} AND CongregacaoId = ${VILA_NOVA}`)) === 2
    && Number(await escalar(`SELECT COUNT(*) FROM FinFolhas WHERE Folha IN (70058, 70060) AND SaidaId = ${saida1401}`)) === 2, "com a SaidaId da entrega original, nas duas tabelas");
  r = await salvar(central, CENTRAL, hoje, [dizimo(70061, ANA, "10")]);
  ok(r.status === 422 && r.body.mensagem === "A folha 70.061 não é de um bloco entregue a Central E2E.", "a Central não lança o pendente de Vila Nova", r.body);
  r = await salvar(central, CENTRAL, hoje, [dizimo(70063, ANA, "40,00")]);
  ok(r.status === 200, "a Central lança a 70.063, a primeira da entrega dela", r.body);
  r = await salvar(local, VILA_NOVA, hoje, [dizimo(70064, BRUNO, "10")]);
  ok(r.status === 422 && r.body.mensagem === "A folha 70.064 não é de um bloco entregue a Vila Nova E2E.", "Vila Nova não lança na entrega da Central", r.body);

  console.log("== a Tesouraria Geral lançando por Vila Nova ==");
  r = await GET(H, "", geral, {});
  ok(r.status === 200 && r.body.congregacao === null && r.body.podeLancar === true, "sem escolher, a Geral recebe só o pedido de escolha", r.body);
  r = await GET(H, "congregacoes", geral, {});
  ok(r.status === 200 && r.body.congregacoes.some((c) => c.nome === "Vila Nova E2E" && c.area === "Área Alfa E2E") && r.body.congregacoes.some((c) => c.nome === "Beta E2E"),
    "o seletor da Geral: as congregações com a área", r.body.congregacoes);
  const vnSel = r.body.congregacoes.find((c) => c.nome === "Vila Nova E2E"), ceSel = r.body.congregacoes.find((c) => c.nome === "Central E2E");
  ok(JSON.stringify(vnSel.situacao) === JSON.stringify({ texto: "1 folha sem destino", tom: "pend" }) && JSON.stringify(ceSel.situacao) === JSON.stringify({ texto: "em dia", tom: "ok" }),
    "a situação de cada uma é só o que o lançamento sabe: Vila Nova com a 70.061 sem destino; a Central em dia", { vnSel, ceSel });
  r = await GET(H, "", geral, { congregacaoId: VILA_NOVA });
  ok(r.status === 200 && r.body.congregacao.nome === "Vila Nova E2E" && r.body.linhas.some((x) => x.folha === 70061 && x.situacao === "pendente"), "a Geral abre a planilha de Vila Nova", r.body.congregacao);
  r = await salvar(geral, VILA_NOVA, hoje, [dizimo(70061, BRUNO, "12,00")]);
  ok(r.status === 200, "a Geral lança a 70.061 por Vila Nova", r.body);
  ok((await um(`SELECT PelaGeral, RegistradoPor, CongregacaoId FROM FinLancamentos WHERE Folha = 70061`)).PelaGeral === true, "fica registrado que a Geral lançou");
  r = await GET(H, "congregacoes", local, {});
  ok(r.status === 200 && r.body.congregacoes.length === 1 && r.body.congregacoes[0].nome === "Vila Nova E2E", "a congregação vê só a dela no seletor", r.body);

  console.log("== a área acompanha ==");
  r = await GET(H, "area", area, {});
  const vn = r.body.congregacoes && r.body.congregacoes.find((c) => c.nome === "Vila Nova E2E"), ce = r.body.congregacoes && r.body.congregacoes.find((c) => c.nome === "Central E2E");
  ok(r.status === 200 && r.body.congregacoes.length === 2 && vn && ce, "a área vê as duas congregações dela (a Beta não)", r.body.congregacoes && r.body.congregacoes.map((c) => c.nome));
  const lancadoVn = Number(await escalar(`SELECT CAST(SUM(Valor + ISNULL(Voluntaria, 0)) * 100 AS INT) FROM FinLancamentos WHERE CongregacaoId = ${VILA_NOVA} AND MesSoma = '${agora}'`));
  ok(vn.lancadoNoMes === lancadoVn && vn.ultimoLancamento && vn.agora === null && JSON.stringify(vn.precisa) === "[]", "Vila Nova: o lançado no mês, o último lançamento, sem bloco agora, tudo certo", vn);
  ok(ce.agora && ce.agora.bloco === 1401 && ce.agora.folha === 70064 && ce.precisa.length === 0, "a Central: no 1.401, na 70.064", ce);
  ok(r.body.resumo.congregacoes === 2 && r.body.resumo.lancaram === 2 && r.body.resumo.precisam === 0, "o resumo da área", r.body.resumo);
  r = await GET(H, "", area, { congregacaoId: VILA_NOVA });
  ok(r.status === 200 && r.body.podeLancar === false && r.body.lancavel === false, "a área abre a planilha só para ver", { podeLancar: r.body.podeLancar });
  const a1 = await salvar(area, VILA_NOVA, hoje, [dizimo(70100, BRUNO, "10")]);
  const a2 = await salvar(area, BETA, hoje, [dizimo(70100, BRUNO, "10")]);
  const a3 = await salvar(area, 999999, hoje, [dizimo(70100, BRUNO, "10")]);
  ok(a1.status === 403 && igual(a1, a2) && igual(a1, a3), "a área não grava: o mesmo 403 na dela, na de fora e na que não existe", a1.body);
  ok(igual(await POST(H, "corrigir", area, { folha: 70055, motivo: "x" }), a1), "nem corrige (o mesmo 403)");
  ok((await GET(H, "membros", area, { procura: "ana" })).status === 403, "nem procura dizimista");

  console.log("== cada nível, outra congregação e o que não existe ==");
  ok((await GET(H, "", null, {})).status === 401 && (await POST(H, "salvar", null, {})).status === 401 && (await GET(H, "nada", null, {})).status === 401, "sem sessão: 401 em tudo, até na ação que não existe");
  ok((await GET(H, "", semFinanceiro, {})).status === 403 && (await POST(H, "nada", semFinanceiro, {})).status === 403, "sem a permissão financeiro: 403, até na ação que não existe");
  const c1 = await GET(H, "", central, { congregacaoId: VILA_NOVA }), c2 = await GET(H, "", central, { congregacaoId: 999999 }), c3 = await GET(H, "", central, { congregacaoId: "abc" });
  ok(c1.status === 404 && igual(c1, c2) && igual(c1, c3), "a Central na planilha de Vila Nova: o mesmo 404 da que não existe e do lixo", c1.body);
  const s1 = await salvar(central, VILA_NOVA, hoje, [dizimo(70100, BRUNO, "10")]), s2 = await salvar(central, 999999, hoje, [dizimo(70100, BRUNO, "10")]);
  ok(s1.status === 404 && igual(s1, s2), "a Central lançando por Vila Nova: o mesmo 404 da que não existe", s1.body);
  const h1 = await GET(H, "historico", central, { folha: 70055 }), h2 = await GET(H, "historico", central, { folha: 79999 }), h3 = await GET(H, "historico", central, { folha: "1e1" });
  ok(h1.status === 404 && igual(h1, h2) && igual(h1, h3), "o histórico de Vila Nova pela Central: o mesmo 404 da folha que não existe", h1.body);
  const k1 = await POST(H, "corrigir", central, { folha: 70055, tipo: "DIZIMO", forma: "PIX", valor: "1,00", pessoa: { membroId: ANA }, motivo: "x" });
  const k2 = await POST(H, "corrigir", central, { folha: 79999, tipo: "DIZIMO", forma: "PIX", valor: "1,00", pessoa: { membroId: ANA }, motivo: "x" });
  const k3 = await POST(H, "corrigir", central, { folha: 70055, lixo: true });
  ok(k1.status === 404 && igual(k1, k2) && igual(k1, k3), "a correção de Vila Nova pela Central: o mesmo 404 da folha que não existe", k1.body);
  ok((await GET(H, "", local, { mes: "2099-01" })).status === 422 && (await GET(H, "", local, { mes: "' OR 1=1 --" })).status === 422, "o mês depois de agora e o lixo no mês: 422");
  ok((await GET(H, "nada", local, {})).status === 404 && (await POST(H, "apagar", local, {})).status === 404, "a ação que não existe: 404");

  console.log("== a procura do dizimista: a Igreja inteira, só o nome, o número e a congregação ==");
  r = await GET(H, "membros", local, { procura: "ana teste" });
  const nomes = r.body.membros.map((m) => m.nome);
  ok(r.status === 200 && nomes.includes("Ana Teste Cidade"), "a Ana de Cidade aparece em Vila Nova", nomes);
  ok((await GET(H, "membros", local, { procura: "Teste Inativo" })).body.membros.length === 0 && (await GET(H, "membros", local, { procura: "Teste Excluída" })).body.membros.length === 0,
    "o inativo e quem pediu a exclusão (LGPD) não aparecem");
  ok(r.body.membros.every((m) => JSON.stringify(Object.keys(m).sort()) === JSON.stringify(["congregacao", "membroId", "nome"])), "só o nome, o número e a congregação", r.body.membros[0]);
  ok(r.body.membros.find((m) => m.nome === "Ana Teste Cidade").congregacao === "Central E2E", "com a congregação dela");
  r = await GET(H, "membros", local, { procura: "ÁNÂ TÉSTE" });
  ok(r.body.membros.some((m) => m.membroId === ANA), "sem acento e sem maiúscula");
  r = await GET(H, "membros", local, { procura: String(CARLA) });
  ok(r.body.membros.length === 1 && r.body.membros[0].nome === "Carla Teste Beta", "pelo número (de outra área também)", r.body.membros);
  r = await GET(H, "membros", local, { procura: "7.900.003" });
  ok(r.body.membros.length === 1 && r.body.membros[0].membroId === CARLA, "o número com o ponto do milhar", r.body.membros);
  for (const termo of ["a", "", "%", "_", "[", "' OR 1=1 --", "'; DROP TABLE FinLancamentos; --", "x".repeat(5000)]) {
    r = await GET(H, "membros", local, { procura: termo });
    ok(r.status === 200 && Array.isArray(r.body.membros) && r.body.membros.length === 0, `a procura ${JSON.stringify(termo.slice(0, 20))} não traz ninguém`, r.body);
  }
  r = await GET(H, "membros", local, { procura: "100% [x]_" });
  ok(r.body.membros.length === 1 && r.body.membros[0].membroId === DAVI, "o %, o _ e o [ valem como letra", r.body.membros);
  ok(Number(await escalar(`SELECT OBJECT_ID(N'dbo.FinLancamentos', N'U')`)) > 0, "a tabela continua lá");

  console.log("== o lixo em cada campo ==");
  const quebras = [], mudancas = [];
  let chamadas = 0;
  const base = { congregacaoId: CENTRAL, dia: hoje, linhas: [dizimo(70064, ANA, "10,00")] };
  const desfazerBase = () => q(`DELETE FROM FinLancamentos WHERE Folha = 70064; DELETE FROM FinFolhas WHERE Folha = 70064`);
  r = await POST(H, "salvar", central, base);
  ok(r.status === 200, "o pedido-base do lixo passa (cada campo ruim chega à regra)", r.body);
  await desfazerBase();
  const tentar = async (rotulo, chamada) => {
    const antesL = await retratoFin();
    const x = await chamada();
    chamadas++;
    if (x.status === 200 && /^(salvar|linha|pessoa)\./.test(rotulo)) await desfazerBase();
    if (x.status === 500 || ![200, 400, 401, 403, 404, 409, 422].includes(x.status)) quebras.push(`${rotulo} -> ${x.status} ${JSON.stringify(x.body).slice(0, 100)}`);
    else if (x.status >= 400 && (await retratoFin()) !== antesL) mudancas.push(rotulo);
    if (x.body && /SELECT |INSERT |UPDATE |ConnectionError|mssql|tedious|at Object|node_modules/i.test(JSON.stringify(x.body))) quebras.push(`${rotulo} vazou: ${JSON.stringify(x.body).slice(0, 120)}`);
  };
  for (const lixo of LIXO) {
    for (const campo of ["congregacaoId", "dia", "linhas"]) await tentar(`salvar.${campo}=${JSON.stringify(lixo)}`, () => POST(H, "salvar", central, { ...base, [campo]: lixo }));
    for (const campo of ["folha", "referente", "tipo", "forma", "valor", "voluntaria", "pessoa", "excecao"]) {
      await tentar(`linha.${campo}=${JSON.stringify(lixo)}`, () => POST(H, "salvar", central, { ...base, linhas: [{ ...base.linhas[0], [campo]: lixo }] }));
    }
    await tentar(`pessoa.membroId=${JSON.stringify(lixo)}`, () => POST(H, "salvar", central, { ...base, linhas: [{ ...base.linhas[0], pessoa: { membroId: lixo } }] }));
    await tentar(`pessoa.nome=${JSON.stringify(lixo)}`, () => POST(H, "salvar", central, { ...base, linhas: [{ ...base.linhas[0], pessoa: { nome: lixo } }] }));
    for (const campo of ["oQueAconteceu", "observacao"]) {
      await tentar(`linha.excecao.${campo}=${JSON.stringify(lixo)}`, () => POST(H, "salvar", central,
        { ...base, linhas: [{ folha: 70064, excecao: { oQueAconteceu: "cancelada", observacao: "lixo", [campo]: lixo } }] }));
    }
    for (const campo of ["folha", "motivo", "valor", "tipo", "pessoa"]) {
      await tentar(`corrigir.${campo}=${JSON.stringify(lixo)}`, () => POST(H, "corrigir", local, { folha: 70056, tipo: "DIZIMO", forma: "ESPECIE", valor: "410,00", pessoa: { membroId: BRUNO }, motivo: "teste", [campo]: lixo }));
    }
    for (const campo of ["mes", "congregacaoId"]) await tentar(`planilha.${campo}=${JSON.stringify(lixo)}`, () => GET(H, "", local, { [campo]: lixo }));
    await tentar(`historico.folha=${JSON.stringify(lixo)}`, () => GET(H, "historico", local, { folha: lixo }));
    await tentar(`membros.procura=${JSON.stringify(lixo)}`, () => GET(H, "membros", local, { procura: lixo }));
  }
  await tentar("corpo lista", () => POST(H, "salvar", central, [base]));
  await tentar("corpo texto", () => POST(H, "salvar", central, "lixo"));
  await tentar("201 linhas", () => POST(H, "salvar", central, { ...base, linhas: Array.from({ length: 201 }, (_, i) => dizimo(70064 + i, ANA, "1")) }));
  ok(quebras.length === 0, `${chamadas} chamadas com lixo: nenhuma 500 nem vazamento`, quebras.slice(0, 6));
  ok(mudancas.length === 0, "chamada recusada nunca altera o banco", mudancas.slice(0, 6));
  ok(Number(await escalar(`SELECT COUNT(*) FROM FinFolhas WHERE Folha = 70064`)) === 0, "o lixo que passou voltou atrás: a 70.064 continua livre para as corridas");

  console.log("== as corridas (processos separados) ==");
  // duas gravações da mesma folha ao mesmo tempo: uma passa, a outra é recusada
  const [x1, x2] = await disparar([lancar(TOK_CENTRAL, CENTRAL, [dizimo(70064, ANA, "1,00")]), lancar(TOK_CENTRAL, CENTRAL, [dizimo(70064, ANA, "2,00")])]);
  const st = [x1.status, x2.status].sort().join(",");
  ok(st === "200,409" || st === "200,422", "duas gravações da 70.064 juntas: uma passa, a outra é recusada", [x1.body, x2.body]);
  ok(Number(await escalar(`SELECT COUNT(*) FROM FinLancamentos WHERE Folha = 70064`)) === 1 && Number(await escalar(`SELECT COUNT(*) FROM FinFolhas WHERE Folha = 70064`)) === 1, "uma linha só, nas duas tabelas");
  // o lançamento e a exceção da mesma folha ao mesmo tempo
  const [y1, y2] = await disparar([lancar(TOK_CENTRAL, CENTRAL, [dizimo(70065, ANA, "1,00")]),
    { handler: "finBlocos", acao: "folha", token: TOK_CENTRAL, corpo: { folha: 70065, oQueAconteceu: "cancelada", observacao: "corrida" } }]);
  const destino = await escalar(`SELECT Destino FROM FinFolhas WHERE Folha = 70065`), temLanc = Number(await escalar(`SELECT COUNT(*) FROM FinLancamentos WHERE Folha = 70065`));
  ok([y1.status, y2.status].filter((s) => s === 200).length === 1 && ((destino === "LANCADA" && temLanc === 1) || (destino === "CANCELADA" && temLanc === 0)),
    "o lançamento e a exceção da 70.065 juntos: só um vence, e as tabelas concordam", { lancar: y1.body, excecao: y2.body, destino, temLanc });
  // a marca na planilha e a marca na aba Folhas da mesma folha ao mesmo tempo: a mesma regra no servidor, só uma vence
  const [w1, w2] = await disparar([lancar(TOK_CENTRAL, CENTRAL, [marca(70066, "arrancada", "corrida na planilha")]),
    { handler: "finBlocos", acao: "folha", token: TOK_CENTRAL, corpo: { folha: 70066, oQueAconteceu: "cancelada", observacao: "corrida na aba Folhas" } }]);
  const marcas66 = await q(`SELECT Destino FROM FinFolhas WHERE Folha = 70066`);
  ok([w1.status, w2.status].sort().join(",") === "200,409" && marcas66.length === 1, "as duas marcas da 70.066 juntas: uma vence, a outra recebe 409", { planilha: w1.body, abaFolhas: w2.body, marcas66 });
  // duas correções da mesma linha juntas: as duas entram na trilha, uma depois da outra
  const [z1, z2] = await disparar([
    { handler: "finLancamentos", acao: "corrigir", token: TOK_LOCAL, corpo: { folha: 70056, tipo: "DIZIMO", forma: "ESPECIE", valor: "401,11", pessoa: { membroId: BRUNO }, motivo: "corrida 1" } },
    { handler: "finLancamentos", acao: "corrigir", token: TOK_LOCAL, corpo: { folha: 70056, tipo: "DIZIMO", forma: "ESPECIE", valor: "402,22", pessoa: { membroId: BRUNO }, motivo: "corrida 2" } }]);
  const trilha = await q(`SELECT x.Antes, x.Depois FROM FinLancamentosCorrecoes x JOIN FinLancamentos l ON l.LancamentoId = x.LancamentoId WHERE l.Folha = 70056 ORDER BY x.CorrecaoId`);
  const encadeada = trilha.length < 2 || JSON.parse(trilha[trilha.length - 1].Antes).valor === JSON.parse(trilha[trilha.length - 2].Depois).valor;
  ok(z1.status === 200 && z2.status === 200 && encadeada, "duas correções da 70.056 juntas: a trilha encadeia o antes de uma no depois da outra", trilha);

  console.log("== a trilha da auditoria ==");
  const aud = await q(`SELECT Acao, DadosDepois FROM AuditLog WHERE Acao IN ('FIN_LANCAMENTO_SALVO', 'FIN_LANCAMENTO_CORRIGIDO')`);
  ok(aud.some((a) => a.Acao === "FIN_LANCAMENTO_SALVO") && aud.some((a) => a.Acao === "FIN_LANCAMENTO_CORRIGIDO"), "cada gravação e cada correção ficam na auditoria", aud.length);
  ok(!aud.some((a) => /Lídia|Bruno|Ana Teste/.test(String(a.DadosDepois))), "sem o nome de quem deu na auditoria (só o número e se houve nome digitado)");

  fim("e2e-204 (lançar dízimos e ofertas)");
})().catch((e) => { console.error("ERRO", e); process.exit(1); });
