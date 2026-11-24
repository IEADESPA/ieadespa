// e2e-102-importacao-parada.js — G2 da revisão de 24/11/2026: a importação que começou a gravar e PAROU (IMPORTANDO) não tinha prazo, e as linhas que
// faltavam ficavam com o CPF, o celular, a mãe e o pai. Contra o SQL Server de verdade; só dados de mentira (CPF de mentira com os dígitos certos, que não
// é de ninguém). O prazo é o da prévia (7 dias, contados da confirmação; a política "prévia" ajusta). O que se prova:
//   1. parada SEM ninguém importado: a rotina NÃO mexe nela, nem passados os 7 dias (o 7902eca mexia, e era defeito: sem as linhas, o "Continuar" recusava
//      para sempre, com o "Avise o suporte", e nenhuma outra importação podia começar). Com 12 dias, as linhas continuam pendentes e com os dados, sem
//      trilha da rotina, as matrículas travadas, e um lote depois importa de onde parou;
//   2. parada COM gente importada: com 8 dias, as que faltavam ficam de fora só com o nome e o motivo, ela CONCLUI (as matrículas destravam), as
//      importadas ficam como na conclusão de sempre, a lista e o CSV mostram o motivo novo; rodar de novo não faz nada; a cadeia de hashes confere.
// Roda sobre a base cenario-186: `BASE=cenario-186 bash rodar.sh roteiro e2e-102-importacao-parada.js`.
process.env.AUTH_SECRET = "segredo-da-importacao-parada-" + "x".repeat(24);
const crypto = require("crypto");
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, API, path } = L;

const PERM = ["pessoas"];
const fator = () => ({ via: "CHAVE", em: Date.now() });
const CONG = "Vila Parada E2E102";
const tok = { geral: () => L.sessao(9920, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM }) };
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
  const voltar = (id, dias) => q("UPDATE ImportacoesMembros SET CriadaEm = DATEADD(DAY, -@d, CriadaEm), ConfirmadaEm = DATEADD(DAY, -@d, ConfirmadaEm) WHERE ImportacaoId = @i", { i: id, d: dias });
  const travadas = async () => (await escalar("SELECT COUNT(*) FROM ImportacoesMembros WHERE Situacao = N'CONCLUIDA'")) === 0;
  const trilha = (acao) => q("SELECT AuditId, RegistroId, Acao, UsuarioId, DadosDepois FROM AuditLog WHERE Tabela = N'ImportacoesMembros' AND Acao LIKE @a ORDER BY AuditId", { a: acao });
  const ate8 = async (id) => { await voltar(id, 6); const a = await db.aplicarRetencao(pool); return a; };

  console.log("== o cenário ==");
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembros") === 0, "nenhuma importação ainda (a base cenario-186)");
  const area = (await q("INSERT INTO Areas (Nome) VALUES (N'Área E2E102'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const cong = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (@n, @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: CONG, a: area }))[0].id;
  await q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro) VALUES (9920, N'Secretaria Geral E2E102', @c, N'ATIVO', N'EM_COMUNHAO')`, { c: cong });
  const auditAntes = await escalar("SELECT ISNULL(MAX(AuditId), 0) FROM AuditLog");

  console.log("== 1. parada sem ninguém importado ==");
  const pA = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { nomeArquivo: "parada-a.csv", texto: arquivo([pessoa(992001, "Ana Parada E2E102"), pessoa(992002, "Bia Parada E2E102")]) } });
  const idA = pA.body.importacaoId;
  const cA = await R(tok.geral(), { metodo: "POST", acao: "confirmar", corpo: { importacaoId: idA } });
  ok(pA.status === 200 && cA.status === 200 && cA.body.restantes === 2, "a prévia confirmada, 2 a importar (e nenhum lote rodou: parou antes)", cA.body);
  await voltar(idA, 2);   // a confirmação foi há 2 dias
  await db.aplicarRetencao(pool);
  ok(await pessoais(idA) === 2 && (await escalar("SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND Estado = N'PENDENTE'", { i: idA })) === 2,
    "com 2 dias: nada muda (as linhas pendentes, ainda com os dados)");
  const nA = await escalar("SELECT COUNT(*) FROM AuditLog");
  await voltar(idA, 4);
  await db.aplicarRetencao(pool);
  ok(await pessoais(idA) === 2, "com 6 dias: nada muda");
  await ate8(idA);
  const lA = await q("SELECT Linha, Acao, Estado, Problemas, Nome FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i ORDER BY Linha", { i: idA });
  ok(lA.length === 2 && lA.every((l) => l.Acao === "NOVA" && l.Estado === "PENDENTE" && l.Problemas === null) && await pessoais(idA) === 2,
    "com 12 dias (passou dos 7), sem ninguém importado: a rotina não mexe (as 2 linhas pendentes, ainda com os dados)", lA);
  ok(await escalar("SELECT Situacao FROM ImportacoesMembros WHERE ImportacaoId = @i", { i: idA }) === "IMPORTANDO" && await travadas(),
    "ela continua em andamento e as matrículas continuam travadas (não concluiu com zero)");
  ok(await escalar("SELECT COUNT(*) FROM AuditLog") === nA && (await trilha("A rotina%importação parada%")).length === 0, "nenhuma trilha da rotina para ela");
  const loteA = await db.importarLote(pool, { membroId: 9920 }, idA, {});
  ok(loteA.sucesso === true && loteA.importadas === 2 && loteA.concluida === true
    && await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId IN (992001, 992002) AND SituacaoMembro = N'ARROLAMENTO'") === 2,
    "a Secretaria Geral volta e continua: as 2 entram, de onde parou", loteA);
  // (limpeza do roteiro, só no LocalDB: a importação é uma vez só; para o caso 2 rodar, a do caso 1 sai daqui. As 2 fichas dela ficam: o caso 2 usa outras)
  await q("DELETE FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i; DELETE FROM ImportacoesMembros WHERE ImportacaoId = @i", { i: idA });

  console.log("== 2. parada com gente importada ==");
  const pB = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { nomeArquivo: "parada-b.csv",
    texto: arquivo([pessoa(992101, "Caio Entrou E2E102"), pessoa(992102, "Dora Entrou E2E102"), pessoa(992103, "Eva Faltou E2E102"), pessoa(992104, "Fábio Faltou E2E102")]) } });
  const idB = pB.body.importacaoId;
  await R(tok.geral(), { metodo: "POST", acao: "confirmar", corpo: { importacaoId: idB } });
  const lote = await db.importarLote(pool, { membroId: 9920 }, idB, { tamanho: 2 });
  ok(lote.sucesso === true && lote.importadas === 2 && lote.restantes === 2 && lote.concluida === false, "um lote de 2 entrou e a importação parou (faltam 2)", lote);
  await voltar(idB, 6);
  await db.aplicarRetencao(pool);
  const sB6 = await escalar("SELECT Situacao FROM ImportacoesMembros WHERE ImportacaoId = @i", { i: idB }), pB6 = await pessoais(idB);
  // as 4 linhas ainda com os dados: as 2 pendentes e as 2 importadas (as importadas só se limpam na conclusão, como sempre)
  ok(sB6 === "IMPORTANDO" && pB6 === 4, "com 6 dias: nada muda (em andamento, as 4 linhas ainda com os dados)", { situacao: sB6, comDados: pB6 });
  await ate8(idB);
  const imp = await um("SELECT Situacao, Resumo FROM ImportacoesMembros WHERE ImportacaoId = @i", { i: idB });
  const res = JSON.parse(imp.Resumo || "{}").resultado || {};
  ok(imp.Situacao === "CONCLUIDA" && res.importadas === 2 && res.fora === 2, "com 12 dias: ela conclui com as 2 que entraram e as 2 de fora", { situacao: imp.Situacao, res });
  ok(!(await travadas()), "concluída: as matrículas novas destravam");
  const lB = await q("SELECT Linha, Estado, Problemas FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i ORDER BY Linha", { i: idB });
  ok(lB.map((l) => `${l.Linha}:${l.Estado}:${l.Problemas || ""}`).join(",") === "2:IMPORTADA:,3:IMPORTADA:,4:FORA:NAO_TERMINOU,5:FORA:NAO_TERMINOU", "as que entraram ficam; as que faltavam, de fora com o motivo", lB);
  ok(await sobraFora(idB) === 0 && await pessoais(idB) === 0, "nenhum dado pessoal sobrou em linha nenhuma (a conclusão de sempre limpa as importadas)");
  ok(await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId IN (992101, 992102) AND SituacaoMembro = N'ARROLAMENTO'") === 2
    && await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId IN (992103, 992104)") === 0, "as fichas: as 2 que entraram, em arrolamento; as de fora, nenhuma");
  const tB = await trilha("A rotina encerrou a importação parada%");
  ok(tB.length === 1 && tB[0].RegistroId === idB && tB[0].UsuarioId === null && JSON.parse(tB[0].DadosDepois).linhasDeFora === 2, "a trilha do encerramento, sem usuário", tB);
  ok((await trilha("Concluiu a importação do sistema pago")).some((t) => t.RegistroId === idB && t.UsuarioId === null), "e a da conclusão, sem usuário");
  const lp = await R(tok.geral(), { acao: "lista", query: { importacaoId: String(idB), filtro: "problemas" } });
  const texto = textoDe("NAO_TERMINOU");
  ok(lp.status === 200 && lp.body.total === 2 && lp.body.itens.every((i) => i.motivos.length === 1 && i.motivos[0] === texto), "a lista 'problemas' mostra as 2, com o motivo novo", lp.body.itens);
  const cv = await R(tok.geral(), { acao: "lista.csv", query: { importacaoId: idB } });
  ok(cv.status === 200 && String(cv.body).includes("Eva Faltou E2E102") && String(cv.body).includes(texto) && !/90000-|example\.org|Mãe de/.test(String(cv.body)),
    "o CSV: as de fora com o motivo, sem celular, e-mail nem mãe", cv.status);
  const nB = await escalar("SELECT COUNT(*) FROM AuditLog");
  await db.aplicarRetencao(pool);
  ok(await escalar("SELECT COUNT(*) FROM AuditLog") === nB, "rodar de novo não faz nada");

  console.log("== a trilha ==");
  const todas = await q("SELECT AuditId, Tabela, RegistroId, Acao, UsuarioId, DadosAntes, DadosDepois, HashRegistro FROM AuditLog WHERE AuditId > @a AND Tabela = N'ImportacoesMembros' ORDER BY AuditId", { a: auditAntes });
  ok(!todas.some((t) => /Parada E2E102|Faltou|Entrou|90000-|example\.org|Mãe de|99210[1-4][0-9]/.test(`${t.DadosAntes || ""} ${t.DadosDepois || ""}`)), "a trilha sem nome, celular, e-mail, mãe nem CPF");
  let cadeiaOk = true;
  for (const t of todas) {
    const ant = await escalar("SELECT TOP 1 HashRegistro FROM AuditLog WHERE Tabela = N'ImportacoesMembros' AND AuditId < @a ORDER BY AuditId DESC", { a: t.AuditId });
    const payload = JSON.stringify({ tabela: t.Tabela, registroId: t.RegistroId, acao: t.Acao, usuarioId: t.UsuarioId || null, dadosAntes: t.DadosAntes, dadosDepois: t.DadosDepois });
    if (sha256(payload + (ant || "")) !== t.HashRegistro) cadeiaOk = false;
  }
  ok(cadeiaOk, "a cadeia de hashes da trilha da importação confere");
  fim("e2e-102 (a importação que parou e passou do prazo)");
}

principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
