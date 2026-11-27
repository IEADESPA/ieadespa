// e2e-206-financeiro-dizimo-digital.js — FASE 10, Financeiro (módulo 2), incremento 4: O DÍZIMO DIGITAL (tela r22-dizimo-digital, opção 1), contra o
// SQL Server de verdade. Base: cenario-200 (a 200 a 206 aplicadas duas vezes), no LocalDB próprio do Financeiro:
//   E2E_INSTANCIA=fin E2E_BANCO=ieadespa_fin E2E_CS='Server=(localdb)\fin;Database=ieadespa_fin;Integrated Security=true' BASE=cenario-200 bash rodar.sh roteiro e2e-206-financeiro-dizimo-digital.js
// Cobre:
// - a migração 206: a tabela, os CHECKs, a chave composta da entrega, os índices das chaves estrangeiras, a regra do aviso e a 206 rodada de novo
//   sobre dados;
// - o membro informa o Pix (meu-dizimo-digital): quem deu e a congregação vêm da sessão e do cadastro, o dia (o mês de agora ou o anterior, nunca
//   depois de hoje), o limite de 5 esperando, o inativo e quem pediu a exclusão (LGPD), a matrícula de outra pessoa; e vê os 3 passos;
// - a tesouraria: a lista (os que esperam primeiro, o último lançamento, o "raro" da Igreja toda), a conferência da folha ("livre · bloco 1.401"),
//   ligar (a folha reservada) e excluir com o motivo (o aviso ao membro), pela congregação e pela Geral; a área acompanha;
// - a trava: com Pix para ligar, a planilha abre para ver, mas não se salva; o seletor e a área dizem quantos;
// - a folha reservada na planilha: vem preenchida (`ligadas`), lança-se só com {folha, referente} (e a do mês anterior só com {folha}); o corpo não
//   traz o nome nem o valor; a exceção (aba Folhas e planilha) e a devolução parcial não passam por cima dela; a lançada leva "Pix ligado";
// - a bateria de segurança: cada nível, outra congregação, o "403/404 igual" para o que existe e o que não existe, lixo em cada campo e as corridas
//   (ligar × lançar, ligar × exceção, dois Pix na mesma folha, ligar × excluir, dois envios do membro no limite).
const L = require("./lib");
const { q, um, escalar, ok, fim, GET, POST, GERAL, LIDER, PIN, API, path, LIXO, hojeBr } = L;
const HB = require(path.join(API, "FinBlocos/index.js"));
const HL = require(path.join(API, "FinLancamentos/index.js"));
const H = require(path.join(API, "FinDizimoDigital/index.js"));
const HM = require(path.join(API, "MeuDizimoDigital/index.js"));
const R = require(path.join(API, "shared/finLancamentos.js"));

const TESOUREIRO_GERAL = 1002, TESOUREIRA_LOCAL = 1003;
const CENTRAL = 1, VILA_NOVA = 2;
const geral = GERAL(TESOUREIRO_GERAL, ["financeiro"]);
const local = LIDER(TESOUREIRA_LOCAL, ["financeiro"], ["Vila Nova E2E"]);
const central = LIDER(TESOUREIRA_LOCAL, ["financeiro"], ["Central E2E"]);
const area = LIDER(TESOUREIRA_LOCAL, ["financeiro"], ["Central E2E", "Vila Nova E2E"], "AREA");
const semFinanceiro = LIDER(TESOUREIRA_LOCAL, ["pessoas"], ["Vila Nova E2E"]);

// os membros de mentira (os números da faixa 7.900.1xx não existem na base)
const HELENA = 7900101, JOAO = 7900102, LUCAS = 7900103, MARIA = 7900104, INATIVO = 7900105, APAGADO = 7900106, RUTE = 7900107;

const hoje = hojeBr(), agora = R.mesDe(hoje), anterior = R.mesAnterior(agora), ultimoAnterior = R.ultimoDia(anterior);
const noAnterior = (dia, hora) => `${anterior.slice(0, 8)}${dia}T${hora}`;
const MSG_TRAVA = (n) => `Há ${n} dízimos por Pix para ligar: ligue cada um à folha do recibo de papel (ou exclua com o motivo) antes de salvar.`;

const TABELAS = ["FinDizimosDigitais", "FinFolhas", "FinLancamentos", "Notificacoes", "AuditLog"];
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
const salvar = (token, congregacaoId, dia, linhas) => POST(HL, "salvar", token, { congregacaoId, dia, linhas });
const dizimo = (folha, membroId, valor) => ({ folha, referente: "ESTE_MES", tipo: "DIZIMO", forma: "PIX", valor, pessoa: { membroId } });
const igual = (a, b) => a.status === b.status && JSON.stringify(a.body) === JSON.stringify(b.body);
const ligar = (token, id, folha) => POST(H, "ligar", token, { id, folha });
const excluir = (token, id, motivo) => POST(H, "excluir", token, { id, motivo });
const pixDo = (id) => um(`SELECT Situacao, Folha, BlocoId, SaidaId, LigadoPor, LigadoPelaGeral, Motivo, ExcluidoPor, CongregacaoId, MembroId FROM FinDizimosDigitais WHERE DizimoDigitalId = ${Number(id)}`);

// o membro, na página dele: a rota meu-dizimo-digital/{matricula} (a matrícula chega em texto, como no HTTP)
async function meu(token, matricula, metodo = "GET", corpo) {
  const ctx = { bindingData: { matricula: matricula == null ? matricula : String(matricula) }, log: { error() { }, info() { }, warn() { }, verbose() { } } };
  await HM(ctx, { method: metodo, query: {}, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return ctx.res || { status: 0, body: null };
}
const informar = (membroId, valor, pixEm) => meu(PIN(membroId), membroId, "POST", { valor, pixEm });

// as corridas em processos separados (cada um com a sua conexão), no mesmo instante (o worker.js, como no e2e-204)
const { spawn } = require("child_process");
async function disparar(chamadas) {
  const t0 = Date.now() + 6000 + chamadas.length * 600;
  return Promise.all(chamadas.map((spec) => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-r", path.join(__dirname, "shim-mssql.js"), path.join(__dirname, "worker.js"), JSON.stringify({ ...spec, t0 })], { env: process.env });
    let saida = ""; p.stdout.on("data", (d) => { saida += d; });
    p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { status: -1 }); });
  })));
}
const TOK_LOCAL = { tipo: "LIDER", membroId: TESOUREIRA_LOCAL, permissoes: ["financeiro"], escopo: ["Vila Nova E2E"] };
const TOK_GERAL = { tipo: "GERAL", membroId: TESOUREIRO_GERAL, permissoes: ["financeiro"] };
const ligarEm = (token, id, folha) => ({ handler: "finDizimoDigital", acao: "ligar", token, corpo: { id, folha } });

(async () => {
  console.log(`== hoje (Belém): ${hoje}; o mês de agora: ${R.nomeDoMes(agora)}; o anterior: ${R.nomeDoMes(anterior)} ==`);

  console.log("== a migração 206 ==");
  ok(!!(await escalar(`SELECT OBJECT_ID(N'dbo.FinDizimosDigitais', N'U')`)), "a tabela FinDizimosDigitais existe");
  const semIndice = await q(`
    SELECT c.name AS Coluna
    FROM sys.foreign_keys fk
    JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id AND fkc.constraint_column_id = 1
    JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
    WHERE OBJECT_NAME(fk.parent_object_id) = 'FinDizimosDigitais' AND c.name NOT IN ('LigadoPor', 'ExcluidoPor')
      AND NOT EXISTS (SELECT 1 FROM sys.index_columns ic WHERE ic.object_id = fkc.parent_object_id AND ic.column_id = fkc.parent_column_id AND ic.key_ordinal = 1)`);
  ok(semIndice.length === 0, "toda chave estrangeira da 206 começa um índice (menos quem ligou e quem excluiu)", semIndice);
  ok(Number(await escalar(`SELECT COUNT(*) FROM sys.indexes WHERE name = 'UX_FinDizimosDigitais_Folha' AND is_unique = 1 AND has_filter = 1`)) === 1, "uma folha, um Pix só (o índice único filtrado)");
  ok(Number(await escalar(`SELECT COUNT(*) FROM NotificacaoRegras WHERE Chave = 'DIZIMO_DIGITAL_EXCLUIDO'`)) === 1, "a regra do aviso da exclusão semeada uma vez");

  console.log("== o cenário: o lote, as entregas, os membros e o mês anterior lançado ==");
  let r = await POST(HB, "lote", geral, { serie: 2026, primeiraFolha: 70001, totalFolhas: 10000 });
  ok(r.status === 201, "o lote 70.001 a 80.000", r.body);
  ok((await POST(HB, "chegada", geral, { loteId: r.body.loteId, ateFolha: 75000, data: `${anterior.slice(0, 8)}01` })).status === 200, "chegaram os blocos até a 75.000");
  await L.naLiderancaDe(TESOUREIRA_LOCAL, VILA_NOVA);
  ok((await POST(HB, "entregar", geral, { primeiraFolha: 70051, congregacaoId: VILA_NOVA, pessoa: { membroId: TESOUREIRA_LOCAL }, data: `${anterior.slice(0, 8)}02` })).status === 200, "o 1.401 (70.051 a 70.100) entregue a Vila Nova");
  ok((await POST(HB, "entregar", geral, { primeiraFolha: 70101, congregacaoId: CENTRAL, pessoa: { nome: "Rute Santos" }, data: `${anterior.slice(0, 8)}02` })).status === 200, "o 1.402 (70.101 a 70.150) entregue à Central");
  const b1401 = await idDo(1401), b1402 = await idDo(1402);
  const saida1401 = await escalar(`SELECT RegistroId FROM FinLivroBlocos WHERE Tipo = 'SAIDA' AND BlocoId = ${b1401}`);
  const saida1402 = await escalar(`SELECT RegistroId FROM FinLivroBlocos WHERE Tipo = 'SAIDA' AND BlocoId = ${b1402}`);
  await q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status) VALUES
    (${HELENA}, N'Helena Prado Teste', ${VILA_NOVA}, 'ATIVO'), (${JOAO}, N'João Lima Teste', ${VILA_NOVA}, 'ATIVO'), (${LUCAS}, N'Lucas Teste Vila', ${VILA_NOVA}, 'ATIVO'),
    (${MARIA}, N'Maria Teste Central', ${CENTRAL}, 'ATIVO'), (${INATIVO}, N'Ivo Teste Inativo', ${VILA_NOVA}, 'INATIVO'), (${APAGADO}, N'Abel Teste Apagado', ${VILA_NOVA}, 'ATIVO'),
    (${RUTE}, N'Rute Teste Beta', 3, 'ATIVO')`);
  await q(`INSERT INTO SolicitacoesTitularLGPD (MembroId, Tipo, Status) VALUES (${APAGADO}, 'EXCLUSAO', 'ATENDIDA')`);
  r = await salvar(local, VILA_NOVA, ultimoAnterior, [dizimo(70051, LUCAS, "50,00"), dizimo(70052, LUCAS, "60,00")]);
  ok(r.status === 200, `Vila Nova lançou a 70.051 e a 70.052 em ${ultimoAnterior} (antes de qualquer Pix)`, r.body);

  console.log("== os CHECKs da 206 ==");
  ok(await recusaNoBanco(`INSERT INTO FinDizimosDigitais (MembroId, CongregacaoId, Valor, PixEm) VALUES (${HELENA}, ${VILA_NOVA}, 0, SYSDATETIME())`), "o Pix de R$ 0,00 é recusado");
  ok(await recusaNoBanco(`INSERT INTO FinDizimosDigitais (MembroId, CongregacaoId, Valor, PixEm, Situacao) VALUES (${HELENA}, ${VILA_NOVA}, 1, SYSDATETIME(), N'OUTRA')`), "a situação fora da lista é recusada");
  ok(await recusaNoBanco(`INSERT INTO FinDizimosDigitais (MembroId, CongregacaoId, Valor, PixEm, Situacao) VALUES (${HELENA}, ${VILA_NOVA}, 1, SYSDATETIME(), N'LIGADO')`), "o ligado sem a folha é recusado");
  ok(await recusaNoBanco(`INSERT INTO FinDizimosDigitais (MembroId, CongregacaoId, Valor, PixEm, Situacao) VALUES (${HELENA}, ${VILA_NOVA}, 1, SYSDATETIME(), N'EXCLUIDO')`), "o excluído sem o motivo é recusado");
  ok(await recusaNoBanco(`INSERT INTO FinDizimosDigitais (MembroId, CongregacaoId, Valor, PixEm, Folha) VALUES (${HELENA}, ${VILA_NOVA}, 1, SYSDATETIME(), 70060)`), "o informado com folha é recusado");
  ok(Number(await escalar(`SELECT COUNT(*) FROM FinDizimosDigitais`)) === 0, "nada ficou gravado");

  console.log("== o membro informa o Pix ==");
  r = await informar(HELENA, "350,00", `${hoje}T09:15`);
  ok(r.status === 201 && r.body.mensagem === "Informado à tesouraria de Vila Nova E2E. Ela escreve o recibo de papel e você recebe o número aqui." && r.body.id > 0,
    "Helena informa o Pix de R$ 350,00 (201, a mensagem da r20)", r.body);
  const hel = r.body.id;
  let p = await pixDo(hel);
  ok(p.Situacao === "INFORMADO" && p.CongregacaoId === VILA_NOVA && p.MembroId === HELENA && p.Folha === null, "gravado como informado, na congregação do cadastro", p);
  const valores = ["200,00", "12,00", "13,00", "14,00", "15,00"];
  const joao = [];
  r = await informar(JOAO, valores[0], noAnterior("15", "20:05"));
  ok(r.status === 201, `João informa um Pix de ${R.nomeDoMes(anterior)} (o mês anterior vale)`, r.body);
  joao.push(r.body.id);
  for (let i = 1; i < 5; i++) { r = await meu(PIN(JOAO), JOAO, "POST", { valor: valores[i], pixEm: `${hoje}T10:0${i}`, congregacaoId: CENTRAL, membroId: MARIA }); joao.push(r.body.id); }
  ok(r.status === 201 && Number(await escalar(`SELECT COUNT(*) FROM FinDizimosDigitais WHERE MembroId = ${JOAO} AND CongregacaoId = ${VILA_NOVA}`)) === 5,
    "o corpo não escolhe a pessoa nem a congregação: os 5 de João ficam com ele, em Vila Nova", r.body);
  r = await informar(JOAO, "16,00", `${hoje}T11:00`);
  ok(r.status === 422 && r.body.mensagem === "Você já tem 5 Pix esperando a tesouraria. Espere ela escrever os recibos de papel.", "o 6º esperando é recusado", r.body);
  r = await informar(MARIA, "", `${hoje}T11:00`);
  ok(r.status === 422 && r.body.mensagem === "Informe o valor do Pix.", "sem o valor: 422", r.body);
  r = await informar(MARIA, "10,00", "");
  ok(r.status === 422 && r.body.mensagem === "Informe o dia e a hora do Pix.", "sem o dia e a hora: 422", r.body);
  r = await informar(MARIA, "10,00", `${R.mesSeguinte(agora).slice(0, 8)}01T10:00`);
  ok(r.status === 422 && r.body.mensagem === "O dia do Pix é depois de hoje: confira a data.", "o dia depois de hoje: 422", r.body);
  r = await informar(MARIA, "10,00", `${R.mesAnterior(anterior).slice(0, 8)}10T10:00`);
  ok(r.status === 422 && r.body.mensagem === `Só se informa o Pix deste mês ou do anterior (${R.nomeDoMes(anterior)}).`, "o mês antes do anterior: 422", r.body);
  const semFicha = "Não foi possível informar o Pix por aqui: fale com a secretaria da sua congregação.";
  ok((await informar(INATIVO, "10,00", `${hoje}T10:00`)).body.mensagem === semFicha && (await informar(APAGADO, "10,00", `${hoje}T10:00`)).body.mensagem === semFicha,
    "o inativo e quem pediu a exclusão (LGPD) não informam");
  ok((await meu(PIN(MARIA), HELENA, "POST", { valor: "1,00", pixEm: `${hoje}T10:00` })).status === 403 && (await meu(PIN(MARIA), HELENA)).status === 403,
    "a matrícula de outra pessoa: 403 (nem informa nem vê)");
  ok((await meu(null, HELENA)).status === 401 && (await meu(PIN(HELENA), "abc")).status === 400 && (await meu(PIN(HELENA), HELENA, "DELETE")).status === 404,
    "sem sessão 401; matrícula malformada 400; o método que não existe 404");
  r = await meu(PIN(HELENA), HELENA);
  ok(r.status === 200 && r.body.conta === "Conta geral da Igreja (Pix pelo CNPJ)" && r.body.congregacao === "Vila Nova E2E" && r.body.digitais.length === 1
    && r.body.digitais[0].passo === 1 && r.body.digitais[0].valor === 35000 && r.body.digitais[0].pixEm === `${hoje}T09:15` && r.body.digitais[0].folha === null,
    "Helena vê só o dela: no passo 1, sem a folha", r.body);
  ok(Number(await escalar(`SELECT COUNT(*) FROM FinDizimosDigitais`)) === 6, "6 Pix gravados (as recusas não gravaram)");

  console.log("== a tesouraria: a lista, a trava, o seletor e a área ==");
  r = await GET(H, "", local, {});
  const ord = r.body.digitais && r.body.digitais.map((d) => d.id).join(",");
  ok(r.status === 200 && r.body.congregacao.nome === "Vila Nova E2E" && r.body.podeLigar === true && r.body.paraLigar === 6 && ord === [joao[0], hel, ...joao.slice(1)].join(","),
    "Vila Nova vê os 6 esperando, o mais antigo primeiro (o de João do mês anterior)", { ord, paraLigar: r.body.paraLigar });
  ok(r.body.ultimoLancamento && r.body.ultimoLancamento.folha === 70052 && r.body.ultimoLancamento.dia === ultimoAnterior && r.body.noMesNaIgreja === 5
    && JSON.stringify(r.body.blocos) === "[1401]", "a dica do último lançamento (70.052), o bloco em uso (1.401) e o \"raro\" da Igreja toda (5 neste mês)",
    { u: r.body.ultimoLancamento, n: r.body.noMesNaIgreja, b: r.body.blocos });
  const d0 = r.body.digitais.find((d) => d.id === hel);
  ok(d0.membro === "Helena Prado Teste" && d0.valor === 35000 && d0.passo === 1 && d0.situacao === "INFORMADO"
    && JSON.stringify(Object.keys(d0).sort()) === JSON.stringify(["bloco", "folha", "id", "lancada", "membro", "motivo", "passo", "pelaGeral", "pixEm", "situacao", "valor"]),
    "cada Pix: o nome, o valor, o dia e a hora e o passo, sem a matrícula", d0);
  let antes = await retratoFin();
  r = await salvar(local, VILA_NOVA, hoje, [dizimo(70053, LUCAS, "10,00")]);
  ok(r.status === 422 && r.body.paraLigar === 6 && r.body.mensagem === MSG_TRAVA(6), "a trava: com Pix para ligar, não se salva", r.body);
  ok((await salvar(geral, VILA_NOVA, hoje, [dizimo(70053, LUCAS, "10,00")])).status === 422 && (await retratoFin()) === antes, "nem a Geral salva por ela; nada mudou no banco");
  r = await GET(HL, "", local, {});
  ok(r.status === 200 && r.body.paraLigar === 6 && r.body.lancavel === true && Array.isArray(r.body.ligadas) && r.body.ligadas.length === 0, "a planilha abre para ver e diz quantos esperam", { p: r.body.paraLigar });
  r = await GET(HL, "congregacoes", geral, {});
  const vnSel = r.body.congregacoes && r.body.congregacoes.find((c) => c.nome === "Vila Nova E2E");
  ok(vnSel && JSON.stringify(vnSel.situacao) === JSON.stringify({ texto: "6 dízimos por Pix para ligar", tom: "pend" }), "o seletor da Geral diz o que falta primeiro", vnSel);
  r = await GET(H, "area", area, {});
  const vnA = r.body.congregacoes && r.body.congregacoes.find((c) => c.nome === "Vila Nova E2E"), ceA = r.body.congregacoes && r.body.congregacoes.find((c) => c.nome === "Central E2E");
  ok(r.status === 200 && r.body.congregacoes.length === 2 && vnA.noMes === 5 && vnA.paraLigar === 6 && ceA.noMes === 0 && ceA.paraLigar === 0 && r.body.resumo.paraLigar === 6,
    "a área acompanha as duas dela (a Beta não): Vila Nova com 6 esperando", r.body);

  console.log("== a conferência da folha ==");
  r = await GET(H, "folha", local, { folha: 70053 });
  ok(r.status === 200 && r.body.livre === true && r.body.bloco === 1401 && r.body.folha === 70053, "a 70.053: livre, bloco 1.401", r.body);
  r = await GET(H, "folha", local, { folha: 70051 });
  ok(r.body.livre === false && r.body.mensagem === "A folha 70.051 já está lançada: confira no papel a próxima folha em branco.", "a 70.051 já está lançada", r.body);
  r = await GET(H, "folha", local, { folha: 70120 });
  ok(r.body.livre === false && r.body.mensagem === "A folha 70.120 não é de um bloco em uso por Vila Nova E2E.", "a 70.120 é da Central", r.body);
  ok((await GET(H, "folha", local, { folha: "abc" })).status === 422, "a folha sem número: 422");

  console.log("== ligar ==");
  r = await ligar(local, hel, 70054);
  ok(r.status === 200 && r.body.mensagem === "Pix ligado à folha 70.054: ao lançar, ela vem preenchida." && r.body.bloco === 1401, "Vila Nova liga o Pix de Helena à 70.054", r.body);
  p = await pixDo(hel);
  ok(p.Situacao === "LIGADO" && p.Folha === 70054 && p.BlocoId === b1401 && p.SaidaId === saida1401 && p.LigadoPor === TESOUREIRA_LOCAL && p.LigadoPelaGeral === false,
    "ligado: a folha, o bloco, a entrega e quem ligou", p);
  r = await ligar(geral, joao[0], 70053);
  ok(r.status === 200 && (await pixDo(joao[0])).LigadoPelaGeral === true, "a Geral liga o Pix de João à 70.053 por Vila Nova (fica registrado)", r.body);
  r = await ligar(local, hel, 70060);
  ok(r.status === 409 && r.body.mensagem === "Este Pix já foi ligado à folha 70.054.", "ligar de novo: 409", r.body);
  r = await ligar(local, joao[1], 70054);
  ok(r.status === 422 && r.body.mensagem === "A folha 70.054 já está ligada a outro dízimo por Pix.", "a folha de outro Pix: 422", r.body);
  ok((await ligar(local, joao[1], 70051)).body.mensagem === "A folha 70.051 já está lançada: confira no papel a próxima folha em branco.", "a folha lançada: recusada");
  ok((await ligar(local, joao[1], 70120)).body.mensagem === "A folha 70.120 não é de um bloco em uso por Vila Nova E2E.", "a folha de outra congregação: recusada");
  ok((await ligar(local, joao[1], null)).body.mensagem === "Digite o número da folha do recibo de papel.", "sem a folha: recusado");
  ok(await recusaNoBanco(`UPDATE FinDizimosDigitais SET SaidaId = ${saida1402} WHERE DizimoDigitalId = ${hel}`), "no banco, a entrega tem de ser do bloco da folha (a chave composta)");
  const a1 = await ligar(area, joao[1], 70060), a2 = await ligar(area, 999999, 70060);
  ok(a1.status === 403 && igual(a1, a2), "a área não liga: o mesmo 403 no Pix que existe e no que não existe", a1.body);
  const c1 = await ligar(central, joao[1], 70060), c2 = await ligar(central, 999999, 70060), c3 = await ligar(central, "abc", 70060);
  ok(c1.status === 404 && igual(c1, c2) && igual(c1, c3), "a Central no Pix de Vila Nova: o mesmo 404 do que não existe", c1.body);
  r = await GET(H, "folha", local, { folha: 70054 });
  ok(r.body.livre === false && /já está ligada/.test(r.body.mensagem), "a conferência já diz que a 70.054 tem Pix", r.body);
  r = await meu(PIN(HELENA), HELENA);
  ok(r.body.digitais[0].passo === 2 && r.body.digitais[0].folha === 70054 && r.body.digitais[0].bloco === 1401, "Helena vê o passo 2 com o número do recibo de papel", r.body.digitais[0]);

  console.log("== excluir com o motivo ==");
  antes = await retratoFin();
  r = await excluir(local, joao[1], "  ");
  ok(r.status === 422 && r.body.mensagem === "Escreva o motivo da exclusão: o membro é avisado do porquê." && (await retratoFin()) === antes, "sem o motivo: 422, nada muda", r.body);
  ok((await excluir(local, joao[1], "x".repeat(301))).body.mensagem === "O motivo tem no máximo 300 letras.", "o motivo longo: recusado");
  r = await excluir(local, joao[1], "Não achei este Pix no extrato do dia.");
  ok(r.status === 200 && r.body.mensagem === "Pix excluído. O membro é avisado do motivo.", "Vila Nova exclui o Pix de R$ 12,00 com o motivo", r.body);
  p = await pixDo(joao[1]);
  ok(p.Situacao === "EXCLUIDO" && p.Motivo === "Não achei este Pix no extrato do dia." && p.ExcluidoPor === TESOUREIRA_LOCAL && p.Folha === null, "excluído: o motivo e quem excluiu", p);
  const aviso = await um(`SELECT Titulo, Mensagem, Categoria FROM Notificacoes WHERE RegraChave = 'DIZIMO_DIGITAL_EXCLUIDO' AND DestinatarioMembroId = ${JOAO} AND ReferenciaId = ${joao[1]}`);
  ok(aviso && aviso.Titulo === "O seu dízimo por Pix não foi confirmado" && aviso.Mensagem.includes("Vila Nova E2E") && aviso.Mensagem.includes("R$ 12,00")
    && aviso.Mensagem.endsWith("O motivo: Não achei este Pix no extrato do dia."), "o aviso ao membro: a congregação, o valor e o motivo", aviso);
  ok((await excluir(local, joao[1], "de novo")).status === 409 && (await ligar(local, joao[1], 70060)).body.mensagem === "Este Pix já foi excluído.", "o excluído não se exclui nem se liga de novo (409)");
  const e1 = await excluir(area, joao[2], "x"), e2 = await excluir(area, 999999, "x");
  ok(e1.status === 403 && igual(e1, e2), "a área não exclui (o mesmo 403)", e1.body);
  const k1 = await excluir(central, joao[2], "x"), k2 = await excluir(central, 999999, "x");
  ok(k1.status === 404 && igual(k1, k2), "a Central no Pix de Vila Nova: o mesmo 404", k1.body);
  ok((await excluir(geral, joao[2], "Pix em duplicidade.")).status === 200 && (await excluir(local, joao[3], "Valor diferente.")).status === 200
    && (await excluir(local, joao[4], "Valor diferente.")).status === 200, "a Geral exclui um por Vila Nova; Vila Nova exclui os outros");
  r = await meu(PIN(JOAO), JOAO);
  const excl = r.body.digitais.filter((d) => d.situacao === "EXCLUIDO");
  ok(excl.length === 4 && excl.every((d) => d.passo === 0 && d.motivo) && r.body.digitais.some((d) => d.situacao === "LIGADO" && d.folha === 70053), "João vê os 4 excluídos com o motivo e o ligado", r.body.digitais);

  console.log("== a folha reservada: a exceção e a devolução parcial não passam por cima ==");
  r = await POST(HB, "folha", local, { folha: 70054, oQueAconteceu: "cancelada", observacao: "rasgou" });
  ok(r.status === 422 && r.body.mensagem === "A folha 70.054 está ligada a um dízimo por Pix: ela se lança na planilha, preenchida com o Pix.", "a exceção na aba Folhas: recusada", r.body);
  r = await salvar(local, VILA_NOVA, hoje, [{ folha: 70054, excecao: { oQueAconteceu: "arrancada", observacao: "x" } }]);
  ok(r.status === 422 && r.body.mensagem === "Folha 70.054: a folha está ligada a um dízimo por Pix; ela se lança com o Pix, não se marca.", "a marca na planilha: recusada", r.body);
  r = await POST(HB, "devolver", geral, { primeiraFolha: 70051, pessoa: { nome: "Lia Fontes" }, parcial: true, primeiraEmBranco: 70053 });
  ok(r.status === 422 && r.body.mensagem === "A folha 70.053 está ligada a um dízimo por Pix e ainda não foi lançada: lance-a antes; a primeira em branco vem depois dela.",
    "a devolução parcial com a primeira em branco antes da folha ligada: recusada", r.body);
  ok(Number(await escalar(`SELECT COUNT(*) FROM FinFolhas WHERE Folha IN (70053, 70054)`)) === 0, "as duas folhas continuam reservadas, sem destino");
  ok((await POST(HB, "folha", local, { folha: 70099, oQueAconteceu: "cancelada", observacao: "rasgou" })).status === 200, "a 70.099 cancelada na aba Folhas");
  r = await GET(H, "folha", local, { folha: 70099 });
  ok(r.body.livre === false && /^A folha 70\.099 está marcada como /.test(r.body.mensagem), "a conferência: a folha marcada não se liga", r.body);

  console.log("== a planilha: a folha reservada vem preenchida ==");
  r = await GET(HL, "", local, {});
  ok(r.body.paraLigar === 0 && JSON.stringify(r.body.ligadas) === JSON.stringify([
    { folha: 70053, membroId: JOAO, membro: "João Lima Teste", valor: 20000 }, { folha: 70054, membroId: HELENA, membro: "Helena Prado Teste", valor: 35000 }]),
    "as duas folhas reservadas, com o nome e o valor do Pix", r.body.ligadas);
  r = await salvar(local, VILA_NOVA, ultimoAnterior, [{ folha: 70053, referente: "MES_POSTERIOR", valor: "1,00" }]);
  ok(r.status === 422 && r.body.mensagem === "Folha 70.053: a folha está ligada a um dízimo por Pix; o nome e o valor vêm do Pix." && r.body.folha === 70053, "o corpo não traz o valor da folha reservada", r.body);
  ok((await salvar(local, VILA_NOVA, ultimoAnterior, [dizimo(70053, LUCAS, "10,00")])).status === 422, "nem outro dizimista");
  r = await salvar(local, VILA_NOVA, ultimoAnterior, [{ folha: 70053 }]);
  ok(r.status === 422 && r.body.mensagem === "Folha 70.053: escolha “Este mês” ou “Mês posterior”.", "sem o \"Referente a\": recusado", r.body);
  r = await salvar(local, VILA_NOVA, ultimoAnterior, [{ folha: 70053, referente: "MES_POSTERIOR" }]);
  ok(r.status === 200, `a 70.053 entregue em ${ultimoAnterior}, marcada "mês posterior" (só a linha)`, r.body);
  let lin = await um(`SELECT Referente, CONVERT(char(10), MesSoma, 23) AS MesSoma, Valor, MembroId FROM FinLancamentos WHERE Folha = 70053`);
  ok(lin.Referente === "MES_POSTERIOR" && lin.MesSoma === agora && lin.Valor === null && lin.MembroId === null, "a 70.053 soma no mês de agora, ainda sem o nome e o valor", lin);
  r = await GET(HL, "", local, {});
  ok(r.body.ligadas.some((x) => x.folha === 70053) && r.body.linhas.some((x) => x.folha === 70053 && x.situacao === "preencher"), "no mês de agora, a 70.053 é para preencher e vem com o Pix");
  ok((await salvar(local, VILA_NOVA, hoje, [{ folha: 70053, valor: "200,00" }])).status === 422, "a de preencher também não traz o valor");
  r = await salvar(local, VILA_NOVA, hoje, [{ folha: 70053 }, { folha: 70054, referente: "ESTE_MES" }, dizimo(70055, LUCAS, "30,00")]);
  ok(r.status === 200, "a 70.053 preenchida, a 70.054 lançada com o Pix e a 70.055 normal, numa gravação só", r.body);
  const ls = await q(`SELECT Folha, Referente, Tipo, Forma, Valor, MembroId, NomeDigitado, CONVERT(char(10), MesSoma, 23) AS MesSoma FROM FinLancamentos WHERE Folha IN (70053, 70054) ORDER BY Folha`);
  ok(ls[0].Tipo === "DIZIMO" && ls[0].Forma === "PIX" && Number(ls[0].Valor) === 200 && ls[0].MembroId === JOAO && ls[0].Referente === "MES_POSTERIOR", "a 70.053: o dízimo de João, por Pix, R$ 200,00", ls[0]);
  ok(ls[1].Tipo === "DIZIMO" && ls[1].Forma === "PIX" && Number(ls[1].Valor) === 350 && ls[1].MembroId === HELENA && ls[1].NomeDigitado === null && ls[1].MesSoma === agora,
    "a 70.054: o dízimo de Helena, por Pix, R$ 350,00, no mês de agora", ls[1]);
  const audSalvo = JSON.parse(await escalar(`SELECT TOP 1 DadosDepois FROM AuditLog WHERE Acao = 'FIN_LANCAMENTO_SALVO' ORDER BY AuditId DESC`));
  ok(audSalvo.folhas.map((f) => `${f.folha}:${f.doPix}`).join(" ") === "70053:true 70054:true 70055:false", "a auditoria diz quais vieram do Pix", audSalvo.folhas);
  r = await GET(HL, "", local, {});
  ok(r.body.ligadas.length === 0 && r.body.linhas.filter((x) => x.pixLigado).map((x) => x.folha).join(",") === "70053,70054", "a planilha: \"Pix ligado\" nas duas, sem folha reservada", r.body.linhas.map((x) => [x.folha, x.pixLigado]));
  r = await GET(H, "", local, {});
  ok(r.body.paraLigar === 0 && r.body.digitais.find((d) => d.id === hel).lancada === true, "a lista: o Pix de Helena lançado", r.body.digitais.find((d) => d.id === hel));

  console.log("== cada nível, outra congregação e o que não existe ==");
  r = await GET(H, "", geral, {});
  ok(r.status === 200 && r.body.congregacao === null && r.body.podeLigar === true, "a Geral sem escolher: só o pedido de escolha", r.body);
  ok((await GET(H, "", geral, { congregacaoId: VILA_NOVA })).body.congregacao.nome === "Vila Nova E2E", "a Geral abre a lista de Vila Nova");
  r = await GET(H, "", area, { congregacaoId: VILA_NOVA });
  ok(r.status === 200 && r.body.podeLigar === false && r.body.digitais.length === 6, "a área vê a lista só para acompanhar", { podeLigar: r.body.podeLigar });
  ok((await GET(H, "", area, {})).body.congregacao === null && (await GET(H, "folha", area, { congregacaoId: VILA_NOVA, folha: 70060 })).status === 403, "a área escolhe a congregação e não confere folha");
  const g1 = await GET(H, "", central, { congregacaoId: VILA_NOVA }), g2 = await GET(H, "", central, { congregacaoId: 999999 }), g3 = await GET(H, "", central, { congregacaoId: "abc" });
  ok(g1.status === 404 && igual(g1, g2) && igual(g1, g3), "a Central na lista de Vila Nova: o mesmo 404 da que não existe e do lixo", g1.body);
  const f1 = await GET(H, "folha", central, { congregacaoId: VILA_NOVA, folha: 70060 }), f2 = await GET(H, "folha", central, { congregacaoId: 999999, folha: 70060 });
  ok(f1.status === 404 && igual(f1, f2), "a Central conferindo folha de Vila Nova: o mesmo 404", f1.body);
  ok((await GET(H, "", null, {})).status === 401 && (await POST(H, "ligar", null, {})).status === 401 && (await GET(H, "nada", null, {})).status === 401, "sem sessão: 401 em tudo, até na ação que não existe");
  ok((await GET(H, "", semFinanceiro, {})).status === 403 && (await POST(H, "nada", semFinanceiro, {})).status === 403 && (await GET(H, "", PIN(HELENA), {})).status === 403,
    "sem a permissão financeiro (e o membro comum): 403, até na ação que não existe");
  ok((await GET(H, "nada", local, {})).status === 404 && (await POST(H, "apagar", local, {})).status === 404 && (await GET(H, "ligar", local, {})).status === 404, "a ação que não existe: 404");

  console.log("== o lixo em cada campo ==");
  const quebras = [], mudancas = [];
  let chamadas = 0;
  r = await informar(MARIA, "5,00", `${hoje}T08:00`);
  ok(r.status === 201, "o Pix-base do lixo (Maria, na Central)", r.body);
  const pm = r.body.id;
  const reabrir = () => q(`UPDATE FinDizimosDigitais SET Situacao = 'INFORMADO', Folha = NULL, BlocoId = NULL, SaidaId = NULL, LigadoPor = NULL, LigadoEm = NULL, LigadoPelaGeral = NULL,
    Motivo = NULL, ExcluidoPor = NULL, ExcluidoEm = NULL WHERE DizimoDigitalId = ${pm}`);
  const tentar = async (rotulo, chamada) => {
    const antesL = await retratoFin();
    const x = await chamada();
    chamadas++;
    if (x.status === 200 || x.status === 201) { await reabrir(); await q(`DELETE FROM FinDizimosDigitais WHERE MembroId = ${MARIA} AND DizimoDigitalId <> ${pm}`); }
    if (x.status === 500 || ![200, 201, 400, 401, 403, 404, 409, 422].includes(x.status)) quebras.push(`${rotulo} -> ${x.status} ${JSON.stringify(x.body).slice(0, 100)}`);
    else if (x.status >= 400 && (await retratoFin()) !== antesL) mudancas.push(rotulo);
    if (x.body && /SELECT |INSERT |UPDATE |ConnectionError|mssql|tedious|at Object|node_modules/i.test(JSON.stringify(x.body))) quebras.push(`${rotulo} vazou: ${JSON.stringify(x.body).slice(0, 120)}`);
  };
  for (const lixo of LIXO) {
    const j = JSON.stringify(lixo);
    for (const campo of ["valor", "pixEm"]) await tentar(`informar.${campo}=${j}`, () => meu(PIN(MARIA), MARIA, "POST", { valor: "5,00", pixEm: `${hoje}T08:00`, [campo]: lixo }));
    for (const campo of ["id", "folha"]) await tentar(`ligar.${campo}=${j}`, () => POST(H, "ligar", central, { id: pm, folha: 70101, [campo]: lixo }));
    for (const campo of ["id", "motivo"]) await tentar(`excluir.${campo}=${j}`, () => POST(H, "excluir", central, { id: pm, motivo: "teste do lixo", [campo]: lixo }));
    await tentar(`lista.congregacaoId=${j}`, () => GET(H, "", central, { congregacaoId: lixo }));
    for (const campo of ["congregacaoId", "folha"]) await tentar(`folha.${campo}=${j}`, () => GET(H, "folha", central, { congregacaoId: CENTRAL, folha: 70101, [campo]: lixo }));
    await tentar(`meu.matricula=${j}`, () => meu(PIN(MARIA), lixo));
  }
  for (const corpo of [[{ id: pm }], "lixo", null]) {
    await tentar(`ligar corpo ${JSON.stringify(corpo)}`, () => POST(H, "ligar", central, corpo));
    await tentar(`excluir corpo ${JSON.stringify(corpo)}`, () => POST(H, "excluir", central, corpo));
    await tentar(`informar corpo ${JSON.stringify(corpo)}`, () => meu(PIN(MARIA), MARIA, "POST", corpo));
  }
  ok(quebras.length === 0, `${chamadas} chamadas com lixo: nenhuma 500 nem vazamento`, quebras.slice(0, 6));
  ok(mudancas.length === 0, "chamada recusada nunca altera o banco", mudancas.slice(0, 6));
  ok((await pixDo(pm)).Situacao === "INFORMADO" && Number(await escalar(`SELECT COUNT(*) FROM FinDizimosDigitais WHERE MembroId = ${MARIA}`)) === 1, "o lixo que passou voltou atrás");

  console.log("== as corridas (processos separados) ==");
  const ph = [];
  for (let i = 1; i <= 5; i++) { r = await informar(HELENA, `${i},00`, `${hoje}T07:0${i}`); ph.push(r.body.id); }
  ok(ph.every((x) => x > 0), "Helena informa mais 5 Pix para as corridas");
  // ligar e lançar a mesma folha juntos: com o Pix esperando, o lançamento é recusado (a trava) e, depois de ligado, a folha só se lança com o Pix
  const [x1, x2] = await disparar([ligarEm(TOK_LOCAL, ph[0], 70056), { handler: "finLancamentos", acao: "salvar", token: TOK_LOCAL, corpo: { congregacaoId: VILA_NOVA, dia: hoje, linhas: [dizimo(70056, LUCAS, "1,00")] } }]);
  ok(x1.status === 200 && x2.status === 422 && Number(await escalar(`SELECT COUNT(*) FROM FinLancamentos WHERE Folha = 70056`)) === 0 && (await pixDo(ph[0])).Folha === 70056,
    "ligar × lançar a 70.056: o Pix fica com a folha e o outro lançamento é recusado", [x1, x2]);
  // ligar e marcar a mesma folha juntos (a mesma trava do bloco): só um vence, e as tabelas concordam
  const [y1, y2] = await disparar([ligarEm(TOK_LOCAL, ph[1], 70057), { handler: "finBlocos", acao: "folha", token: TOK_LOCAL, corpo: { folha: 70057, oQueAconteceu: "cancelada", observacao: "corrida" } }]);
  const destino57 = await escalar(`SELECT Destino FROM FinFolhas WHERE Folha = 70057`), pix57 = await pixDo(ph[1]);
  ok([y1.status, y2.status].filter((s) => s === 200).length === 1 && ((pix57.Situacao === "LIGADO" && destino57 === null) || (pix57.Situacao === "INFORMADO" && destino57 === "CANCELADA")),
    "ligar × exceção da 70.057: só um vence", { ligar: y1, excecao: y2, destino57, situacao: pix57.Situacao });
  // dois Pix na mesma folha juntos: um vence
  const [z1, z2] = await disparar([ligarEm(TOK_LOCAL, ph[2], 70058), ligarEm(TOK_GERAL, ph[3], 70058)]);
  ok([z1.status, z2.status].sort().join(",").match(/^200,(409|422)$/) && Number(await escalar(`SELECT COUNT(*) FROM FinDizimosDigitais WHERE Folha = 70058`)) === 1,
    "dois Pix na 70.058 juntos: um vence, o outro é recusado", [z1, z2]);
  // ligar e excluir o mesmo Pix juntos: um vence
  const [w1, w2] = await disparar([ligarEm(TOK_LOCAL, ph[4], 70059), { handler: "finDizimoDigital", acao: "excluir", token: TOK_LOCAL, corpo: { id: ph[4], motivo: "corrida" } }]);
  const pix59 = await pixDo(ph[4]);
  ok([w1.status, w2.status].sort().join(",") === "200,409" && ((w1.status === 200 && pix59.Situacao === "LIGADO") || (w2.status === 200 && pix59.Situacao === "EXCLUIDO")),
    "ligar × excluir o mesmo Pix: um vence, o outro recebe 409", { ligar: w1, excluir: w2, situacao: pix59.Situacao });
  // dois envios do membro no limite (4 esperando): só um entra
  for (let i = 1; i <= 4; i++) await informar(LUCAS, `${i},00`, `${hoje}T06:0${i}`);
  const env = { funcao: { modulo: "finDizimoDigitalDb", nome: "informar", args: [{ membroId: LUCAS, dados: { valor: "9,00", pixEm: `${hoje}T06:30` } }] } };
  const [v1, v2] = await disparar([env, env]);
  const passaram = [v1, v2].filter((v) => v.resultado && v.resultado.sucesso).length;
  ok(passaram === 1 && Number(await escalar(`SELECT COUNT(*) FROM FinDizimosDigitais WHERE MembroId = ${LUCAS} AND Situacao = 'INFORMADO'`)) === 5, "dois envios no limite juntos: só um entra (5 esperando)", [v1, v2]);

  console.log("== a 206 de novo, sobre os dados ==");
  const antesMig = await retratoFin();
  await aplicarMigracao(206);
  ok((await retratoFin()) === antesMig && Number(await escalar(`SELECT COUNT(*) FROM NotificacaoRegras WHERE Chave = 'DIZIMO_DIGITAL_EXCLUIDO'`)) === 1, "a 206 rodada de novo não muda nada");

  console.log("== a trilha da auditoria ==");
  const aud = await q(`SELECT Acao, DadosDepois FROM AuditLog WHERE Acao LIKE 'FIN_DIZIMO_DIGITAL_%'`);
  ok(["INFORMADO", "LIGADO", "EXCLUIDO"].every((a) => aud.some((x) => x.Acao === `FIN_DIZIMO_DIGITAL_${a}`)), "informar, ligar e excluir ficam na auditoria", aud.length);
  ok(!aud.some((a) => /Helena|João|Lucas|Maria/.test(String(a.DadosDepois))), "sem o nome do membro na auditoria (só os números)");

  fim("e2e-206 (o dízimo digital)");
})().catch((e) => { console.error("ERRO", e); process.exit(1); });
