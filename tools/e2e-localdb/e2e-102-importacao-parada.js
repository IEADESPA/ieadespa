// e2e-102-importacao-parada.js — G2, a importação que começou a gravar e PAROU (IMPORTANDO). A decisão dele de 24/11/2026: o prazo é de 7 dias contados do
// ÚLTIMO LOTE (e não da confirmação); a tela parada mostra "faltam N dias"; vencido, os dados pessoais se apagam e as matrículas se soltam, e o sistema guarda
// QUAIS linhas faltaram (só o número da linha e o nome); a parada sem ninguém importado tem o mesmo prazo e ganha a saída "descartar a importação". Contra o
// SQL Server de verdade (a migração 187); só dados de mentira (CPF de mentira com os dígitos certos, que não é de ninguém). O que se prova:
//   1. parada SEM ninguém importado: o estado mostra o prazo (7 dias da confirmação, sem lote) e 0 importadas; com 6 dias nada muda; com 8 a rotina a
//      DESCARTA (as linhas saem inteiras, a data da confirmação fica, as matrículas continuam travadas, a trilha sem usuário), o lote dela recusa, a tela
//      diz qual foi descartada e uma importação nova pode começar. À mão: descartar a parada pede a confirmação recente (428), a liderança local não pode
//      (403 igual para a que existe e a que não existe), o número errado é 409 e o lixo 400; com tudo certo, ela sai, com a trilha de quem descartou;
//   2. parada COM gente importada: não se descarta (409). Confirmada há 20 dias e com o último lote agora, a rotina não mexe (o prazo conta do lote: faltam
//      7 dias); com 6 dias do lote, nada; com 8, as que faltavam ficam de fora só com o nome e o motivo, ela CONCLUI (as matrículas destravam), as
//      importadas ficam como na conclusão de sempre, a lista e o CSV mostram o motivo novo; rodar de novo não faz nada;
//   3. a importação SÓ DAS LINHAS QUE FALTARAM (o resto: a exceção ao "uma vez só", uma vez): o estado diz quais faltaram; a prévia comum continua recusada;
//      a planilha só com algumas delas entra pelo nome e avisa quem não foi achado; o mesmo arquivo de novo substitui essa prévia e acha todas (as outras linhas
//      do arquivo nem entram); a matrícula tomada depois (um cadastro novo; a linha que repetia a matrícula de quem entrou) vira número novo, e a mesma pessoa
//      vira possível repetida; o lixo, a liderança local, o 428 e o arquivo sem nenhuma delas; confirmada e importada, a tela volta ao resultado com o que o
//      resto fez, a lista de antes diz que o resto foi feito, um segundo resto é recusado (e o banco o impede), e o painel do arrolamento guarda o dia de
//      antes. No fim, a trilha sem dado pessoal e a cadeia de hashes.
// Roda sobre a base cenario-187: `BASE=cenario-187 bash rodar.sh roteiro e2e-102-importacao-parada.js`.
process.env.AUTH_SECRET = "segredo-da-importacao-parada-" + "x".repeat(24);
const crypto = require("crypto");
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, API, path } = L;

const PERM = ["pessoas"];
const fator = () => ({ via: "CHAVE", em: Date.now() });
const CONG = "Vila Parada E2E102";
const tok = { geral: () => L.sessao(9920, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM }),
  semFator: () => L.sessao(9920, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM }),
  // outra pessoa da Secretaria Geral: as tentativas recusadas do caso 3 não gastam as 10 prévias por minuto da 9920
  geral2: () => L.sessao(9922, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM }),
  local: () => L.sessao(9921, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [CONG], permissoes: PERM }) };
const sha256 = (t) => crypto.createHash("sha256").update(String(t), "utf8").digest("hex");
function cpfDe(base9) {
  const b = String(base9).padStart(9, "0");
  const dv = (s) => { let t = 0; for (let i = 0; i < s.length; i++) t += Number(s[i]) * (s.length + 1 - i); const r = (t * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(b); return b + d1 + dv(b + d1);
}
const CAB = "MATRÍCULA;NOME;IGREJA;SEXO;NASCIMENTO;ESTADO CIVIL;E-MAIL;CELULAR;MÃE;PAI;CPF";
const pessoa = (mat, nome) => `${mat};${nome};IEADESPA - ${CONG};FEMININO;14/03/1990;CASADA;e2e102.${mat}@example.org;(91) 90000-${String(mat).slice(-4)};`
  + `Mãe de ${nome};Pai de ${nome};${cpfDe(mat)}`;
const arquivo = (linhas) => [CAB, ...linhas].join("\r\n");
// o que fica na linha de fora (escrito aqui: o roteiro confere a regra, não a cópia dela)
const FICA_FORA = ["ImportacaoId", "Linha", "Acao", "Estado", "Nome", "Problemas", "NumeroNovo"];

async function principal() {
  const { chamarRota } = require("./lib-afm");
  const db = require(path.join(API, "shared/importacaoMembrosDb.js"));
  const textoDe = require(path.join(API, "shared/importacaoMembros.js")).textoDe;
  const pool = await obterPool();
  const R = (token, { metodo = "GET", acao = "", corpo, query } = {}) =>
    chamarRota("ImportacaoMembros/index.js", { metodo, token, binding: { acao }, corpo: corpo || {}, query: query || {} });
  const colunas = (await q("SELECT name FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ImportacoesMembrosLinhas') ORDER BY column_id")).map((c) => c.name);
  const sobraFora = (id) => escalar(`SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND Estado = N'FORA' AND (${colunas.filter((c) => !FICA_FORA.includes(c))
    .map((c) => `[${c}] IS NOT NULL`).join(" OR ")} OR NumeroNovo = 1)`, { i: id });
  const pessoais = (id) => escalar("SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND (Cpf IS NOT NULL OR Telefone IS NOT NULL OR NomeMae IS NOT NULL OR NomePai IS NOT NULL OR Email IS NOT NULL)", { i: id });
  // o tempo passa: a prévia, a confirmação e o último lote vão para trás juntos; voltarConfirmacao só a prévia e a confirmação (o lote fica onde está)
  const voltar = (id, dias) => q(`UPDATE ImportacoesMembros SET CriadaEm = DATEADD(DAY, -@d, CriadaEm), ConfirmadaEm = DATEADD(DAY, -@d, ConfirmadaEm),
    UltimoLoteEm = DATEADD(DAY, -@d, UltimoLoteEm) WHERE ImportacaoId = @i`, { i: id, d: dias });
  const voltarConfirmacao = (id, dias) => q("UPDATE ImportacoesMembros SET CriadaEm = DATEADD(DAY, -@d, CriadaEm), ConfirmadaEm = DATEADD(DAY, -@d, ConfirmadaEm) WHERE ImportacaoId = @i",
    { i: id, d: dias });
  const MSG = db.MSG;
  const travadas = async () => (await escalar("SELECT COUNT(*) FROM ImportacoesMembros WHERE Situacao = N'CONCLUIDA'")) === 0;
  const trilha = (acao) => q("SELECT AuditId, RegistroId, Acao, UsuarioId, DadosDepois FROM AuditLog WHERE Tabela = N'ImportacoesMembros' AND Acao LIKE @a ORDER BY AuditId", { a: acao });

  console.log("== o cenário ==");
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembros") === 0, "nenhuma importação ainda (a base cenario-187)");
  const area = (await q("INSERT INTO Areas (Nome) VALUES (N'Área E2E102'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const cong = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (@n, @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: CONG, a: area }))[0].id;
  await q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro) VALUES (9920, N'Secretaria Geral E2E102', @c, N'ATIVO', N'EM_COMUNHAO'),
    (9921, N'Liderança Local E2E102', @c, N'ATIVO', N'EM_COMUNHAO'), (9922, N'Secretaria Geral Dois E2E102', @c, N'ATIVO', N'EM_COMUNHAO')`, { c: cong });
  const auditAntes = await escalar("SELECT ISNULL(MAX(AuditId), 0) FROM AuditLog");

  console.log("== 1. parada sem ninguém importado ==");
  const pA = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { nomeArquivo: "parada-a.csv", texto: arquivo([pessoa(992001, "Ana Parada E2E102"), pessoa(992002, "Bia Parada E2E102")]) } });
  const idA = pA.body.importacaoId;
  const cA = await R(tok.geral(), { metodo: "POST", acao: "confirmar", corpo: { importacaoId: idA } });
  ok(pA.status === 200 && cA.status === 200 && cA.body.restantes === 2, "a prévia confirmada, 2 a importar (e nenhum lote rodou: parou antes)", cA.body);
  const eA = (await R(tok.geral())).body;
  ok(eA.emAndamento === true && eA.importadas === 0 && eA.prazo && eA.prazo.dias === 7 && eA.prazo.faltam === 7,
    "o estado da parada: 0 importadas e o prazo de 7 dias, contado da confirmação (nenhum lote gravado): faltam 7", { importadas: eA.importadas, prazo: eA.prazo });
  await voltar(idA, 2);
  await db.aplicarRetencao(pool);
  ok(await pessoais(idA) === 2 && (await escalar("SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND Estado = N'PENDENTE'", { i: idA })) === 2,
    "com 2 dias: nada muda (as linhas pendentes, ainda com os dados)");
  ok((await R(tok.geral())).body.prazo.faltam === 5, "e a tela diz que faltam 5 dias");
  const nA = await escalar("SELECT COUNT(*) FROM AuditLog");
  await voltar(idA, 4);
  await db.aplicarRetencao(pool);
  ok(await pessoais(idA) === 2 && await escalar("SELECT COUNT(*) FROM AuditLog") === nA, "com 6 dias: nada muda e nada vai para a trilha");
  await voltar(idA, 2);
  await db.aplicarRetencao(pool);
  const sA = await um("SELECT Situacao, ConfirmadaEm, DescartadaEm, ConcluidaEm, Resumo FROM ImportacoesMembros WHERE ImportacaoId = @i", { i: idA });
  ok(sA.Situacao === "DESCARTADA" && sA.ConfirmadaEm !== null && sA.DescartadaEm !== null && sA.ConcluidaEm === null && JSON.parse(sA.Resumo).descartadaPeloPrazo === 7,
    "com 8 dias, sem ninguém importado: a rotina a DESCARTA (a data da confirmação fica; o resumo guarda o prazo)", sA);
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i", { i: idA }) === 0, "as linhas saíram inteiras (com o CPF, o celular, a mãe e o pai)");
  ok(await travadas(), "as matrículas continuam travadas: nada concluiu (a importação de verdade ainda vai acontecer)");
  ok(await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId IN (992001, 992002)") === 0, "e nenhuma ficha foi criada");
  const tA = await trilha("A rotina descartou a importação parada%");
  ok(tA.length === 1 && tA[0].RegistroId === idA && tA[0].UsuarioId === null && tA[0].Acao === "A rotina descartou a importação parada há 7 dias, sem ninguém importado"
    && JSON.parse(tA[0].DadosDepois).retencaoDias === 7, "a trilha da rotina, sem usuário, com o prazo", tA);
  const loteA = await db.importarLote(pool, { membroId: 9920 }, idA, {});
  ok(loteA.sucesso === false && loteA.status === 409 && loteA.mensagem === MSG.DESCARTADA, "o 'continuar' dela agora diz que foi descartada", loteA);
  const eA2 = (await R(tok.geral())).body;
  ok(eA2.emAndamento === false && eA2.feita === false && eA2.importacao === null && eA2.descartadaPeloPrazo && eA2.descartadaPeloPrazo.importacaoId === idA
    && eA2.descartadaPeloPrazo.dias === 7 && eA2.descartadaPeloPrazo.nomeArquivo === "parada-a.csv", "a tela volta ao arquivo dizendo qual foi descartada e por quê", eA2.descartadaPeloPrazo);
  await db.aplicarRetencao(pool);
  ok((await trilha("A rotina descartou a importação parada%")).length === 1, "rodar de novo não faz nada");

  console.log("== 1b. descartar a parada sem ninguém, à mão ==");
  const pA2 = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { nomeArquivo: "parada-a2.csv", texto: arquivo([pessoa(992011, "Gabi Parada E2E102")]) } });
  ok(pA2.status === 200, "uma importação nova pode começar (a descartada não gastou a importação única)", pA2.body);
  ok((await R(tok.geral())).body.descartadaPeloPrazo === null, "com a prévia nova, a tela não fala mais da descartada");
  const idA2 = pA2.body.importacaoId;
  ok((await R(tok.geral(), { metodo: "POST", acao: "confirmar", corpo: { importacaoId: idA2 } })).status === 200, "confirmada (e parou antes do primeiro lote)");
  const semF = await R(tok.semFator(), { metodo: "POST", acao: "descartar-parada", corpo: { importacaoId: idA2 } });
  ok(semF.status === 428, "sem a confirmação recente: 428", semF.status);
  const loc1 = await R(tok.local(), { metodo: "POST", acao: "descartar-parada", corpo: { importacaoId: idA2 } });
  const loc2 = await R(tok.local(), { metodo: "POST", acao: "descartar-parada", corpo: { importacaoId: idA2 + 999 } });
  ok(loc1.status === 403 && loc2.status === 403 && JSON.stringify(loc1.body) === JSON.stringify(loc2.body), "a liderança local: 403, igual para a que existe e a que não existe",
    { a: loc1.body, b: loc2.body });
  const errado = await R(tok.geral(), { metodo: "POST", acao: "descartar-parada", corpo: { importacaoId: idA2 + 999 } });
  ok(errado.status === 409 && errado.body.mensagem === MSG.NAO_ESTA_PARADA, "o número que não é o da parada: 409", errado.body);
  let lixoOk = true;
  for (const lixo of ["x", -1, 0, "1 OR 1=1", null, [idA2], { id: idA2 }]) {
    const r = await R(tok.geral(), { metodo: "POST", acao: "descartar-parada", corpo: { importacaoId: lixo } });
    if (r.status !== 400) lixoOk = false;
  }
  ok(lixoOk, "o lixo no número: 400");
  ok(await escalar("SELECT Situacao FROM ImportacoesMembros WHERE ImportacaoId = @i", { i: idA2 }) === "IMPORTANDO" && await pessoais(idA2) === 1,
    "nada disso mexeu nela (em andamento, a linha com os dados)");
  const dm = await R(tok.geral(), { metodo: "POST", acao: "descartar-parada", corpo: { importacaoId: idA2 } });
  const sA2 = await um("SELECT Situacao, ConfirmadaEm, Resumo FROM ImportacoesMembros WHERE ImportacaoId = @i", { i: idA2 });
  ok(dm.status === 200 && sA2.Situacao === "DESCARTADA" && sA2.ConfirmadaEm !== null && !("descartadaPeloPrazo" in JSON.parse(sA2.Resumo))
    && await escalar("SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i", { i: idA2 }) === 0, "com tudo certo: ela sai inteira, DESCARTADA", sA2);
  const tM = await trilha("Descartou a importação parada%");
  ok(tM.length === 1 && tM[0].RegistroId === idA2 && tM[0].UsuarioId === 9920, "a trilha de quem descartou", tM);
  ok((await R(tok.geral())).body.descartadaPeloPrazo === null && await travadas(), "a tela não explica a descartada à mão; as matrículas continuam travadas");

  console.log("== 2. parada com gente importada ==");
  // a linha 6 repete a matrícula (e a pessoa) da linha 2: entra com número novo, no fim da fila, e falta junto com as outras
  const ARQ_B = arquivo([pessoa(992101, "Caio Entrou E2E102"), pessoa(992102, "Dora Entrou E2E102"), pessoa(992103, "Eva Faltou E2E102"), pessoa(992104, "Fábio Faltou E2E102"),
    pessoa(992101, "Caio Entrou E2E102")]);
  const pB = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { nomeArquivo: "parada-b.csv", texto: ARQ_B } });
  const idB = pB.body.importacaoId;
  await R(tok.geral(), { metodo: "POST", acao: "confirmar", corpo: { importacaoId: idB } });
  const lote = await db.importarLote(pool, { membroId: 9920 }, idB, { tamanho: 2 });
  ok(lote.sucesso === true && lote.importadas === 2 && lote.restantes === 3 && lote.concluida === false, "um lote de 2 entrou e a importação parou (faltam 3)", lote);
  const ndB = await R(tok.geral(), { metodo: "POST", acao: "descartar-parada", corpo: { importacaoId: idB } });
  ok(ndB.status === 409 && ndB.body.mensagem === MSG.JA_ENTROU_ALGUEM && await pessoais(idB) === 5, "a parada com gente importada não se descarta (409; nada sai)", ndB.body);
  await voltarConfirmacao(idB, 20);
  await db.aplicarRetencao(pool);
  const eB = (await R(tok.geral())).body;
  ok(await escalar("SELECT Situacao FROM ImportacoesMembros WHERE ImportacaoId = @i", { i: idB }) === "IMPORTANDO" && eB.prazo.faltam === 7 && eB.importadas === 2,
    "confirmada há 20 dias e com o último lote agora: nada muda (o prazo conta do último lote: faltam 7)", eB.prazo);
  await voltar(idB, 6);
  await db.aplicarRetencao(pool);
  const sB6 = await escalar("SELECT Situacao FROM ImportacoesMembros WHERE ImportacaoId = @i", { i: idB }), pB6 = await pessoais(idB);
  // as 5 linhas ainda com os dados: as 3 pendentes e as 2 importadas (as importadas só se limpam na conclusão, como sempre)
  ok(sB6 === "IMPORTANDO" && pB6 === 5, "com 6 dias do último lote: nada muda (em andamento, as 5 linhas ainda com os dados)", { situacao: sB6, comDados: pB6 });
  ok((await R(tok.geral())).body.prazo.faltam === 1, "e a tela diz que falta 1 dia");
  await voltar(idB, 2);
  await db.aplicarRetencao(pool);
  const imp = await um("SELECT Situacao, Resumo FROM ImportacoesMembros WHERE ImportacaoId = @i", { i: idB });
  const res = JSON.parse(imp.Resumo || "{}").resultado || {};
  ok(imp.Situacao === "CONCLUIDA" && res.importadas === 2 && res.fora === 3, "com 8 dias do último lote: ela conclui com as 2 que entraram e as 3 de fora", { situacao: imp.Situacao, res });
  ok(!(await travadas()), "concluída: as matrículas novas destravam");
  const lB = await q("SELECT Linha, Estado, Problemas FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i ORDER BY Linha", { i: idB });
  ok(lB.map((l) => `${l.Linha}:${l.Estado}:${l.Problemas || ""}`).join(",") === "2:IMPORTADA:,3:IMPORTADA:,4:FORA:NAO_TERMINOU,5:FORA:NAO_TERMINOU,6:FORA:NAO_TERMINOU",
    "as que entraram ficam; as que faltavam, de fora com o motivo", lB);
  ok(await sobraFora(idB) === 0 && await pessoais(idB) === 0, "nenhum dado pessoal sobrou em linha nenhuma (a conclusão de sempre limpa as importadas)");
  ok(await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId IN (992101, 992102) AND SituacaoMembro = N'ARROLAMENTO'") === 2
    && await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId IN (992103, 992104)") === 0, "as fichas: as 2 que entraram, em arrolamento; as de fora, nenhuma");
  const tB = await trilha("A rotina encerrou a importação parada%");
  ok(tB.length === 1 && tB[0].RegistroId === idB && tB[0].UsuarioId === null && JSON.parse(tB[0].DadosDepois).linhasDeFora === 3, "a trilha do encerramento, sem usuário", tB);
  ok((await trilha("Concluiu a importação do sistema pago")).some((t) => t.RegistroId === idB && t.UsuarioId === null), "e a da conclusão, sem usuário");
  const lp = await R(tok.geral(), { acao: "lista", query: { importacaoId: String(idB), filtro: "problemas" } });
  const texto = textoDe("NAO_TERMINOU");
  ok(lp.status === 200 && lp.body.total === 3 && lp.body.itens.every((i) => i.motivos.length === 1 && i.motivos[0] === texto), "a lista 'problemas' mostra as 3, com o motivo novo", lp.body.itens);
  const cv = await R(tok.geral(), { acao: "lista.csv", query: { importacaoId: idB } });
  ok(cv.status === 200 && String(cv.body).includes("Eva Faltou E2E102") && String(cv.body).includes(texto) && !/90000-|example\.org|Mãe de/.test(String(cv.body)),
    "o CSV: as de fora com o motivo, sem celular, e-mail nem mãe", cv.status);
  const nB = await escalar("SELECT COUNT(*) FROM AuditLog");
  await db.aplicarRetencao(pool);
  ok(await escalar("SELECT COUNT(*) FROM AuditLog") === nB, "rodar de novo não faz nada");

  console.log("== 3. a importação só das linhas que faltaram (o resto) ==");
  const regras = require(path.join(API, "shared/importacaoMembros.js"));
  const { hojeBrasilia } = require(path.join(API, "shared/dataBrasilia.js"));
  const e3 = (await R(tok.geral())).body;
  ok(e3.feita === true && e3.importacao && e3.importacao.importacaoId === idB && e3.resto && e3.resto.de === idB && e3.resto.faltaram === 3 && e3.resto.possivel === true
    && e3.resto.aberto === false && e3.resto.feito === null && e3.resto.linhas.map((l) => `${l.linha}:${l.nome}`).join(",")
      === "4:Eva Faltou E2E102,5:Fábio Faltou E2E102,6:Caio Entrou E2E102", "o estado diz QUAIS linhas faltaram (só a linha e o nome) e que o resto pode ser feito", e3.resto);
  const comum = await R(tok.geral2(), { metodo: "POST", acao: "previa", corpo: { nomeArquivo: "parada-b.csv", texto: ARQ_B } });
  ok(comum.status === 409 && comum.body.mensagem === MSG.JA_IMPORTADO, "a prévia comum continua recusada (uma vez só)", comum.body);
  let lixoResto = true;
  for (const resto of ["true", 1, [true], { sim: true }]) {
    const r = await R(tok.geral2(), { metodo: "POST", acao: "previa", corpo: { texto: ARQ_B, resto } });
    if (r.status !== 409 || r.body.mensagem !== MSG.JA_IMPORTADO) lixoResto = false;
  }
  ok(lixoResto, "o resto que não é exatamente true é a prévia comum: 409 (uma vez só)");
  const locR = await R(tok.local(), { metodo: "POST", acao: "previa", corpo: { texto: ARQ_B, resto: true } });
  const locC = await R(tok.local(), { metodo: "POST", acao: "previa", corpo: { texto: ARQ_B } });
  ok(locR.status === 403 && JSON.stringify(locR.body) === JSON.stringify(locC.body), "a liderança local: 403, igual ao da prévia comum", locR.body);
  const semTexto = await R(tok.geral2(), { metodo: "POST", acao: "previa", corpo: { texto: 12, resto: true } });
  ok(semTexto.status === 400, "sem o texto do arquivo: 400", semTexto.status);
  const nada = await R(tok.geral2(), { metodo: "POST", acao: "previa", corpo: { texto: arquivo([pessoa(992190, "Ninguém da Lista E2E102")]), resto: true } });
  ok(nada.status === 409 && nada.body.mensagem === MSG.RESTO_NADA_ACHADO && await escalar("SELECT COUNT(*) FROM ImportacoesMembros WHERE Situacao = N'PREVIA'") === 0,
    "o arquivo sem nenhuma das que faltaram: 409, e nada se grava", nada.body);
  // depois da importação de antes, alguém cadastrou uma ficha com a matrícula 992104 (a da linha 5): a linha não fica de fora por isso
  await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro) VALUES (992104, N'Outra Pessoa Cadastrada E2E102', @c, N'ATIVO', N'EM_COMUNHAO')",
    { c: cong });
  // a planilha só com duas delas (os números mudam): entram pelo nome, e o aviso diz quem não foi achado
  const parcial = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { nomeArquivo: "so-as-que-faltaram.csv", resto: true,
    texto: arquivo([pessoa(992104, "Fábio Faltou E2E102"), pessoa(992103, "Eva Faltou E2E102")]) } });
  const rp = parcial.body.resumo || {};
  ok(parcial.status === 200 && rp.total === 2 && rp.resto && rp.resto.achadas === 2 && rp.resto.naoAchadas === 1 && rp.resto.listaNaoAchadas[0].linha === 6
    && rp.avisosGerais[0].codigo === "RESTO_NAO_ACHADAS", "a planilha só com duas: as duas entram pelo nome; a que não veio fica avisada (antes de confirmar)", rp.resto);
  const idP = parcial.body.importacaoId;
  // o mesmo arquivo de novo: substitui a prévia de antes e acha as três (as que já entraram nem vão para a prévia)
  const pR = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { nomeArquivo: "parada-b.csv", texto: ARQ_B, resto: true } });
  const idR = pR.body.importacaoId;
  const rr = pR.body.resumo || {};
  ok(pR.status === 200 && rr.total === 3 && rr.resto.faltaram === 3 && rr.resto.achadas === 3 && rr.resto.naoAchadas === 0 && rr.resto.foraDaLista === 2
    && !rr.avisosGerais.some((a) => a.codigo === "RESTO_NAO_ACHADAS"), "o mesmo arquivo: as três achadas; as duas que já entraram ficam fora da prévia", rr.resto);
  ok(await escalar("SELECT Situacao FROM ImportacoesMembros WHERE ImportacaoId = @i", { i: idP }) === "DESCARTADA"
    && await escalar("SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i", { i: idP }) === 0, "a prévia de antes foi descartada, com as linhas");
  ok(await escalar("SELECT RestoDe FROM ImportacoesMembros WHERE ImportacaoId = @i", { i: idR }) === idB, "a prévia nova é o resto da importação de antes");
  const lR = await q("SELECT Linha, Acao, Matricula, NumeroNovo, MotivoNumero, RepetidaMembro, Cpf FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i ORDER BY Linha", { i: idR });
  const mostra = lR.map((l) => `${l.Linha}:${l.Acao}:${l.Matricula || ""}:${l.NumeroNovo ? 1 : 0}:${l.MotivoNumero || ""}:${l.RepetidaMembro || ""}:${l.Cpf ? "cpf" : ""}`).join(",");
  ok(mostra === "4:NOVA:992103:0:::cpf,5:NOVA::1:DE_OUTRA_FICHA::cpf,6:NOVA::1:DE_OUTRA_FICHA:992101:",
    "a matrícula tomada depois vira número novo; a linha que repetia quem entrou é possível repetida dele, sem o CPF (que já está na ficha)", mostra);
  const e3b = (await R(tok.geral())).body;
  ok(e3b.feita === true && e3b.importacao.importacaoId === idR && e3b.importacao.situacao === "PREVIA" && e3b.importacao.restoDe === idB && e3b.resto.aberto === true
    && e3b.resto.possivel === false, "a tela abre na prévia do resto", { importacao: e3b.importacao && e3b.importacao.importacaoId, resto: e3b.resto });
  const tP = await trilha("Fez a prévia da importação das linhas que faltaram");
  ok(tP.length === 2 && tP[1].RegistroId === idR && tP[1].UsuarioId === 9920 && JSON.parse(tP[1].DadosDepois).restoDe === idB, "a trilha das prévias do resto", tP);
  ok((await R(tok.geral(), { metodo: "POST", acao: "confirmar", corpo: { importacaoId: idP } })).body.mensagem === MSG.PREVIA_MUDOU, "a prévia descartada não se confirma");
  ok((await R(tok.semFator(), { metodo: "POST", acao: "confirmar", corpo: { importacaoId: idR } })).status === 428, "confirmar o resto pede a confirmação recente (428)");
  ok((await R(tok.local(), { metodo: "POST", acao: "confirmar", corpo: { importacaoId: idR } })).status === 403, "a liderança local não confirma (403)");
  const cR = await R(tok.geral(), { metodo: "POST", acao: "confirmar", corpo: { importacaoId: idR } });
  ok(cR.status === 200 && cR.body.restantes === 3, "confirmado: 3 a importar", cR.body);
  const loteR = await db.importarLote(pool, { membroId: 9920 }, idR, {});
  ok(loteR.sucesso === true && loteR.concluida === true && loteR.importadas === 3, "o lote importa as três e conclui o resto", loteR);
  const fR = await q(`SELECT l.Linha, l.MatriculaFinal, m.SituacaoMembro FROM ImportacoesMembrosLinhas l JOIN MembroReferencia m ON m.MembroId = l.MatriculaFinal
    WHERE l.ImportacaoId = @i AND l.Estado = N'IMPORTADA' ORDER BY l.Linha`, { i: idR });
  const mat = Object.fromEntries(fR.map((l) => [l.Linha, l.MatriculaFinal]));
  ok(fR.length === 3 && fR.every((l) => l.SituacaoMembro === "ARROLAMENTO") && mat[4] === 992103 && mat[5] !== 992104 && mat[6] !== 992101 && mat[5] !== mat[6],
    "as três em arrolamento: a Eva com a matrícula do arquivo; as outras duas com matrícula nova", fR);
  ok(await escalar("SELECT Nome FROM MembroReferencia WHERE MembroId = 992104") === "Outra Pessoa Cadastrada E2E102", "a ficha cadastrada depois ficou como estava");
  const pend = await q("SELECT MembroId, Tipo, OutroMembroId, Detalhe FROM FichasPendencias WHERE MembroId IN (@a, @b) AND Situacao = N'ABERTA' ORDER BY MembroId, Tipo",
    { a: mat[5], b: mat[6] });
  const pendTxt = pend.map((p) => `${p.MembroId === mat[5] ? "Fábio" : "Caio"}:${p.Tipo}:${p.OutroMembroId || ""}`).join(",");
  ok(pendTxt.split(",").sort().join(",") === "Caio:ARROLAMENTO:,Caio:NUMERO:,Caio:REPETIDA:992101,Fábio:ARROLAMENTO:,Fábio:NUMERO:"
    && pend.some((p) => p.Tipo === "NUMERO" && p.Detalhe === "A matrícula 992104 do sistema pago já era de outra ficha: confira o número."),
    "as pendências: o número a acertar das duas e a possível repetida da linha que repetia o Caio", pendTxt);
  ok(await sobraFora(idR) === 0 && await pessoais(idR) === 0, "o resto terminou como sempre: nenhum dado pessoal nas linhas");
  // a importação de antes concluiu há 3 dias (o painel do arrolamento guarda o dia dela, e não o do resto)
  await q("UPDATE ImportacoesMembros SET ConcluidaEm = DATEADD(DAY, -3, ConcluidaEm) WHERE ImportacaoId = @i", { i: idB });
  const e3c = (await R(tok.geral())).body;
  ok(e3c.feita === true && e3c.emAndamento === false && e3c.importacao.importacaoId === idB && e3c.resto.feito && e3c.resto.feito.importacaoId === idR
    && e3c.resto.feito.importadas === 3 && e3c.resto.feito.fora === 0 && e3c.resto.possivel === false && e3c.resto.aberto === false,
    "a tela volta ao resultado da importação de antes, com o que o resto fez", e3c.resto);
  const lp2 = await R(tok.geral(), { acao: "lista", query: { importacaoId: String(idB), filtro: "problemas" } });
  const feitoTxt = regras.textoDe("NAO_TERMINOU_RESTO_FEITO");
  ok(lp2.body.total === 3 && lp2.body.itens.every((i) => i.motivos[0] === feitoTxt), "a lista de antes diz que a importação das que faltaram já foi feita", lp2.body.itens);
  const cv2 = await R(tok.geral(), { acao: "lista.csv", query: { importacaoId: idB } });
  ok(String(cv2.body).includes(feitoTxt), "e o CSV de antes também");
  const outro = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { texto: ARQ_B, resto: true } });
  ok(outro.status === 409 && outro.body.mensagem === MSG.RESTO_JA_FEITO, "um segundo resto é recusado (uma vez só)", outro.body);
  let bancoBarra = false;
  try {
    await q(`INSERT INTO ImportacoesMembros (NomeArquivo, HashArquivo, CriadaPor, Resumo, RestoDe, Situacao, ConfirmadaEm, ConfirmadaPor, ConcluidaEm)
      VALUES (N'x.csv', REPLICATE('0', 64), 9920, N'{}', @b, N'CONCLUIDA', SYSUTCDATETIME(), 9920, SYSUTCDATETIME())`, { b: idB });
  } catch (e) { bancoBarra = e && (e.number === 2601 || e.number === 2627); }
  ok(bancoBarra, "e o banco impede um segundo resto concluído da mesma importação (o índice único)");
  const ar = await chamarRota("Arrolamento/index.js", { token: tok.geral(), query: {} });
  const diaAntes = hojeBrasilia((await um("SELECT ConcluidaEm FROM ImportacoesMembros WHERE ImportacaoId = @i", { i: idB })).ConcluidaEm);
  ok(ar.status === 200 && ar.body.veioEm === diaAntes && diaAntes !== L.hojeBr(), "o painel do arrolamento: vieram no dia da importação de antes (o resto não muda a data)",
    { veioEm: ar.body.veioEm, diaAntes });

  console.log("== a trilha ==");
  const todas = await q("SELECT AuditId, Tabela, RegistroId, Acao, UsuarioId, DadosAntes, DadosDepois, HashRegistro FROM AuditLog WHERE AuditId > @a AND Tabela = N'ImportacoesMembros' ORDER BY AuditId", { a: auditAntes });
  ok(!todas.some((t) => /Parada E2E102|Faltou|Entrou|Ninguém da Lista|90000-|example\.org|Mãe de|99210[1-4][0-9]/.test(`${t.DadosAntes || ""} ${t.DadosDepois || ""}`)),
    "a trilha sem nome, celular, e-mail, mãe nem CPF");
  let cadeiaOk = true;
  for (const t of todas) {
    const ant = await escalar("SELECT TOP 1 HashRegistro FROM AuditLog WHERE Tabela = N'ImportacoesMembros' AND AuditId < @a ORDER BY AuditId DESC", { a: t.AuditId });
    const payload = JSON.stringify({ tabela: t.Tabela, registroId: t.RegistroId, acao: t.Acao, usuarioId: t.UsuarioId || null, dadosAntes: t.DadosAntes, dadosDepois: t.DadosDepois });
    if (sha256(payload + (ant || "")) !== t.HashRegistro) cadeiaOk = false;
  }
  ok(cadeiaOk, "a cadeia de hashes da trilha da importação confere");
  fim("e2e-102 (a importação que parou e passou do prazo, e a importação só das linhas que faltaram)");
}

principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
