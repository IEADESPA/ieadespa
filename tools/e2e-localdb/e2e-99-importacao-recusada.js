// e2e-99-importacao-recusada.js — A SAÍDA DO IMPORTANDO (revisão de 23/11/2026 da importação dos membros do sistema pago, migração 185), contra o SQL Server
// de verdade. Só dados de mentira. Cada lote é uma transação própria e a tela continua de onde parou; o caso que prendia a importação para sempre (com as
// matrículas novas travadas no sistema todo) era a linha que o banco RECUSA SEMPRE: o lote inteiro se desfazia a cada chamada. O banco aqui recusa de verdade,
// com regras (CHECK) de mentira postas só nesta base: uma linha sozinha no meio, uma no fim da fila (a de número novo) e um bloco de 5 seguidas.
// O que se prova: a recusada sozinha fica de fora COMO PROBLEMA (na lista, no CSV, no resultado e na trilha, com o número do erro e sem a mensagem do banco) e
// as outras entram na ordem; 5 seguidas é o banco, não a linha: 409, ninguém de fora, nada gravado, a importação continua em andamento e as matrículas travadas;
// a saída pela tela (A6 da revisão de 24/11/2026, sem mexer no banco à mão): a Secretaria Geral confirma "deixar essas linhas de fora e continuar", só as 5
// ficam de fora (a liderança local não pode) e a importação continua de onde parou até concluir. Roda sobre a base cenario-185:
// `BASE=cenario-185 bash rodar.sh roteiro e2e-99-importacao-recusada.js`.
process.env.AUTH_SECRET = "segredo-da-importacao-recusada-" + "x".repeat(24);
const crypto = require("crypto");
const L = require("./lib");
const { ok, fim, q, escalar, obterPool } = L;

const PERM = ["pessoas"];
const fator = () => ({ via: "CHAVE", em: Date.now() });
const tok = { geral: () => L.sessao(9901, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM }),
  local: () => L.sessao(9902, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [1], permissoes: PERM }) };
const CONG = "Vila Recusa E2E99";
const sha256 = (t) => crypto.createHash("sha256").update(String(t), "utf8").digest("hex");
const CAB = "MATRÍCULA;NOME;IGREJA;SEXO";
const pessoa = (mat, nome) => `${mat};${nome};IEADESPA - ${CONG};FEMININO`;
// a ordem do lote: as de matrícula do arquivo na ordem do arquivo (2, 3, 4, 6..11) e depois a de número novo (5)
const ARQUIVO = [CAB,
  pessoa(990201, "Ana Aceita E2E99"),               // 2
  pessoa(990202, "Recusada Sozinha E2E99"),         // 3  o banco recusa: fica de fora (uma linha depois dela entra)
  pessoa(990203, "Caio Aceito E2E99"),              // 4
  pessoa(0, "Recusada Sozinha Final E2E99"),        // 5  número novo: a última da fila, recusada no fim
  pessoa(990206, "Recusado Bloco 1 E2E99"),         // 6  o bloco de 5 seguidas: é o banco, não a linha
  pessoa(990207, "Recusado Bloco 2 E2E99"),         // 7
  pessoa(990208, "Recusado Bloco 3 E2E99"),         // 8
  pessoa(990209, "Recusado Bloco 4 E2E99"),         // 9
  pessoa(990210, "Recusado Bloco 5 E2E99"),         // 10
  pessoa(990211, "Eva Aceita E2E99")                // 11
].join("\r\n");
const BLOCO = [6, 7, 8, 9, 10];

async function principal() {
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  const R = (token, { metodo = "GET", acao = "", corpo, query } = {}) =>
    chamarRota("ImportacaoMembros/index.js", { metodo, token, binding: { acao }, corpo: corpo || {}, query: query || {} });
  // a trava das matrículas novas (shared/matriculaNova.js): liberada só com uma importação CONCLUÍDA
  const travadas = async () => (await escalar("SELECT COUNT(*) FROM ImportacoesMembros WHERE Situacao = N'CONCLUIDA'")) === 0;
  const linhaDb = (id, linha) => L.um("SELECT Acao, Estado, Problemas, MatriculaFinal FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND Linha = @l", { i: id, l: linha });

  console.log("== o cenário ==");
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembros") === 0, "nenhuma importação ainda (a base cenario-185)");
  const area = (await q("INSERT INTO Areas (Nome) VALUES (N'Área E2E99'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const cong = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (@n, @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: CONG, a: area }))[0].id;
  await q(`IF NOT EXISTS (SELECT 1 FROM MembroReferencia WHERE MembroId = 9901) INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro)
    VALUES (9901, N'Secretaria Geral E2E99', @c, N'ATIVO', N'EM_COMUNHAO')`, { c: cong });
  // as regras de mentira que fazem o banco recusar (só nesta base, restaurada a cada roteiro)
  await q("ALTER TABLE MembroReferencia WITH NOCHECK ADD CONSTRAINT CK_E2E99_Sozinha CHECK (Nome NOT LIKE N'Recusada Sozinha%')");
  await q("ALTER TABLE MembroReferencia WITH NOCHECK ADD CONSTRAINT CK_E2E99_Bloco CHECK (Nome NOT LIKE N'Recusado Bloco%')");
  const auditAntes = await escalar("SELECT ISNULL(MAX(AuditId), 0) FROM AuditLog");

  console.log("== a prévia e a confirmação ==");
  const p = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { nomeArquivo: "membros.csv", texto: ARQUIVO } });
  ok(p.status === 200 && p.body.sucesso === true, "a prévia: 200 (a prévia não grava ficha: o banco ainda não recusou nada)", p.body);
  const id = p.body.importacaoId;
  const c = await R(tok.geral(), { metodo: "POST", acao: "confirmar", corpo: { importacaoId: id } });
  ok(c.status === 200 && c.body.restantes === 10, "confirmada: 10 a importar", c.body);

  console.log("== 1º lote: a recusada sozinha fica de fora e as outras entram, na ordem ==");
  const b1 = await R(tok.geral(), { metodo: "POST", acao: "lote", corpo: { importacaoId: id } });
  ok(b1.status === 200 && b1.body.sucesso === true && b1.body.importadas === 2 && b1.body.fora === 1 && b1.body.restantes === 7 && b1.body.concluida === false,
    "200: 2 entraram (a 2 e a 4, a prova), 1 de fora (a 3), 7 faltam", b1.body);
  const l3 = await linhaDb(id, 3);
  ok(l3 && l3.Acao === "PROBLEMA" && l3.Estado === "FORA" && l3.Problemas === "ERRO_AO_GRAVAR" && l3.MatriculaFinal === null, "a linha 3: PROBLEMA, FORA, ERRO_AO_GRAVAR, sem matrícula", l3);
  ok(await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId IN (990201, 990203) AND SituacaoMembro = N'ARROLAMENTO'") === 2, "a 2 e a 4 no banco, em ARROLAMENTO");
  ok(await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId = 990202 OR Nome LIKE N'Recusad%'") === 0, "a recusada não entrou (nem pela metade)");
  ok(await escalar("SELECT COUNT(*) FROM FichasPendencias WHERE MembroId = 990202") === 0, "nenhuma pendência para quem não entrou");

  console.log("== 2º lote: 5 seguidas é o banco, não a linha ==");
  const b2 = await R(tok.geral(), { metodo: "POST", acao: "lote", corpo: { importacaoId: id } });
  ok(b2.status === 409 && b2.body.mensagem === "O sistema não conseguiu gravar 5 linhas seguidas (a partir da linha 6 do arquivo): a importação parou sem deixar ninguém de fora. "
    + "Se o problema for dessas linhas, deixe-as de fora e continue; se voltar nas seguintes, avise o suporte." && b2.body.podeDeixarDeFora === true
    && JSON.stringify(b2.body.recusadas) === JSON.stringify(BLOCO), "409 com a primeira do bloco (a linha 6), e a tela pode deixá-las de fora", b2.body);
  const bloco = await q(`SELECT Linha, Acao, Estado FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND Linha IN (${BLOCO.join(",")}) ORDER BY Linha`, { i: id });
  ok(bloco.length === 5 && bloco.every((l) => l.Acao === "NOVA" && l.Estado === "PENDENTE"), "o bloco continua pendente (ninguém de fora)", bloco);
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND Estado = N'IMPORTADA'", { i: id }) === 2, "nada mais gravado (só as 2 do 1º lote)");
  ok(await escalar("SELECT Situacao FROM ImportacoesMembros WHERE ImportacaoId = @i", { i: id }) === "IMPORTANDO", "a importação continua em andamento");
  ok(await travadas(), "as matrículas novas continuam travadas (nada concluiu)");
  const e1 = await R(tok.geral());
  ok(e1.body.emAndamento === true && e1.body.restantes === 7, "o estado: em andamento, 7 faltando (a tela mostra 'continuar')", e1.body);
  const b2b = await R(tok.geral(), { metodo: "POST", acao: "lote", corpo: { importacaoId: id } });
  ok(b2b.status === 409 && /linha 6/.test(b2b.body.mensagem), "chamar de novo sem corrigir: o mesmo 409 (não marca ninguém aos poucos)", b2b.body);

  console.log("== a saída pela tela: deixar essas linhas de fora e continuar (A6, sem mexer no banco à mão) ==");
  const tl = await R(tok.local(), { metodo: "POST", acao: "lote", corpo: { importacaoId: id, deixarDeFora: true } });
  ok(tl.status === 403 && (await escalar("SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND Estado = N'FORA'", { i: id })) === 1, "a liderança local não pode: 403, nada muda", tl.status);
  // o cliente manda lixo junto (uma lista de linhas): o servidor ignora e decide pelas que ele mesmo viu recusar
  const b3 = await R(tok.geral(), { metodo: "POST", acao: "lote", corpo: { importacaoId: id, deixarDeFora: true, linhas: [2, 4, 11] } });
  ok(b3.status === 200 && b3.body.sucesso === true && b3.body.importadas === 0 && b3.body.fora === 5 && b3.body.restantes === 2 && b3.body.concluida === false,
    "200: só as 5 do bloco ficam de fora, ninguém mais é gravado nesta chamada, faltam 2", b3.body);
  const bl = await q(`SELECT Linha, Acao, Estado, Problemas FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND Linha IN (${BLOCO.join(",")}) ORDER BY Linha`, { i: id });
  ok(bl.length === 5 && bl.every((l) => l.Acao === "PROBLEMA" && l.Estado === "FORA" && l.Problemas === "ERRO_AO_GRAVAR"), "o bloco: PROBLEMA, FORA, ERRO_AO_GRAVAR", bl);
  ok((await escalar("SELECT Estado FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND Linha = 11", { i: id })) === "PENDENTE", "a 11 (a lista do cliente) continua pendente");
  ok(await travadas(), "ainda em andamento: as matrículas continuam travadas");
  const b4 = await R(tok.geral(), { metodo: "POST", acao: "lote", corpo: { importacaoId: id } });
  ok(b4.status === 200 && b4.body.importadas === 1 && b4.body.fora === 1 && b4.body.restantes === 0 && b4.body.concluida === true,
    "o lote seguinte, como sempre: a 11 entra, a última da fila (a 5, de número novo) recusada fica de fora, e conclui", b4.body);
  const l5 = await linhaDb(id, 5);
  ok(l5 && l5.Acao === "PROBLEMA" && l5.Estado === "FORA" && l5.Problemas === "ERRO_AO_GRAVAR", "a linha 5: PROBLEMA, FORA, ERRO_AO_GRAVAR", l5);
  ok(b4.body.resultado && b4.body.resultado.importadas === 3 && b4.body.resultado.fora === 7, "o resultado: 3 importadas e 7 de fora", b4.body.resultado);
  ok(await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId BETWEEN 990206 AND 990211") === 1, "do bloco ninguém entrou; a 11 entrou com a matrícula do arquivo");
  ok(!(await travadas()), "concluída: as matrículas novas liberadas");

  console.log("== ninguém some calado: a lista, o CSV e o resultado ==");
  const lp = await R(tok.geral(), { acao: "lista", query: { importacaoId: String(id), filtro: "problemas" } });
  const texto = require(L.path.join(L.API, "shared/importacaoMembros")).PROBLEMAS.ERRO_AO_GRAVAR;
  ok(lp.status === 200 && lp.body.total === 7 && lp.body.itens.map((i) => i.linha).join(",") === "3,5,6,7,8,9,10" && lp.body.itens.every((i) => i.motivos.length === 1 && i.motivos[0] === texto),
    "a lista 'problemas': as linhas 3, 5 e o bloco, com o motivo", lp.body.itens);
  ok(/não conseguiu gravar esta linha/.test(texto), "o motivo em português simples", texto);
  const cv = await R(tok.geral(), { acao: "lista.csv", query: { importacaoId: id } });
  ok(cv.status === 200 && String(cv.body).includes("Recusada Sozinha E2E99") && String(cv.body).includes("Recusada Sozinha Final E2E99") && String(cv.body).includes("Recusado Bloco 3 E2E99")
    && String(cv.body).includes(texto), "o CSV para o Excel tem as de fora, com o motivo", cv.status);
  const eF = await R(tok.geral());
  ok(eF.body.feita === true && eF.body.importacao.resumo.resultado.fora === 7 && eF.body.importacao.resumo.resultado.importadas === 3, "o estado: feita, 3 importadas e 7 de fora", eF.body.importacao);

  console.log("== a trilha ==");
  const marcas = await q("SELECT AuditId, Tabela, RegistroId, Acao, UsuarioId, DadosAntes, DadosDepois, HashRegistro FROM AuditLog WHERE AuditId > @a AND Tabela = N'ImportacoesMembros' ORDER BY AuditId", { a: auditAntes });
  const deFora = marcas.filter((t) => /não conseguiu gravar/.test(t.Acao));
  ok(deFora.length === 3 && deFora.every((t) => t.RegistroId === id && t.UsuarioId === 9901), "3 registros 'Deixou de fora linhas que o sistema não conseguiu gravar' (o 409 não deixou nenhum)", deFora.map((t) => t.Acao));
  const dados = deFora.map((t) => JSON.parse(t.DadosDepois || "{}"));
  ok(JSON.stringify(dados.map((d) => d.linhas)) === JSON.stringify([[{ linha: 3, erro: 547 }], BLOCO.map((l) => ({ linha: l, erro: 547 })), [{ linha: 5, erro: 547 }]]),
    "a trilha: a linha e o número do erro (547, a regra do banco)", dados);
  ok(dados.length === 3 && !dados[0].confirmadoNaTela && dados[1].confirmadoNaTela === true && !dados[2].confirmadoNaTela, "a trilha diz qual saída a Secretaria Geral confirmou na tela", dados);
  ok(!deFora.some((t) => /CK_E2E99|Recusad|conflicted/i.test(String(t.DadosDepois))), "a trilha sem a mensagem do banco (pode trazer o valor da linha)");
  let cadeiaOk = true;
  for (const t of marcas) {
    const ant = await escalar("SELECT TOP 1 HashRegistro FROM AuditLog WHERE Tabela = N'ImportacoesMembros' AND AuditId < @a ORDER BY AuditId DESC", { a: t.AuditId });
    const payload = JSON.stringify({ tabela: t.Tabela, registroId: t.RegistroId, acao: t.Acao, usuarioId: t.UsuarioId || null, dadosAntes: t.DadosAntes, dadosDepois: t.DadosDepois });
    if (sha256(payload + (ant || "")) !== t.HashRegistro) cadeiaOk = false;
  }
  ok(cadeiaOk, "a cadeia de hashes da trilha da importação confere");

  await q("ALTER TABLE MembroReferencia DROP CONSTRAINT CK_E2E99_Sozinha; ALTER TABLE MembroReferencia DROP CONSTRAINT CK_E2E99_Bloco");
  fim("e2e-99 (a linha que o banco recusa na importação)");
}

principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
