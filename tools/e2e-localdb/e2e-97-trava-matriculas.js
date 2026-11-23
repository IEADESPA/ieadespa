// e2e-97-trava-matriculas.js — A TRAVA DAS MATRÍCULAS (FASE 10, Membros, 23/11/2026), contra o SQL Server de verdade. Só dados de mentira.
// Decisão do responsável: "Ninguém vai ser cadastrado antes da importação. Não é para ninguém se cadastrar antes disso. Eu só vou liberar depois de importar."
// Enquanto não existir uma importação do sistema pago CONCLUÍDA, nenhum caminho cria ficha nova (409, a mesma mensagem): o "Cadastrar" (matrícula gerada e
// digitada), o importador antigo, o lançar e o aceite da fila e o "Quero me cadastrar" do site. Editar a ficha que já existe continua livre. O caminho inteiro:
//  1. TRAVADA (nenhuma importação): cada caminho recusado, nada gravado; quem não pode continua com o 401/403 de sempre; editar passa;
//  2. a importação em que NINGUÉM entra não se confirma (não vira CONCLUIDA, não solta a trava, não gasta a importação única);
//  3. a importação PARADA NO MEIO (confirmada, um lote de 1, IMPORTANDO): continua travada;
//  4. CONCLUÍDA (os lotes até o fim, pela rota): solta sozinha, sem botão — cada caminho volta a cadastrar, e a matrícula nova vem depois das importadas.
// Roda sobre a base cenario-185 (`bash rodar.sh preparar-185` e depois `BASE=cenario-185 bash rodar.sh roteiro e2e-97-trava-matriculas.js`).
process.env.AUTH_SECRET = "segredo-da-trava-das-matriculas-" + "x".repeat(24);
process.env.CHAVE_SITE_SISTEMA = "chave-e2e-do-site-trava";
process.env.PRE_CADASTRO_SITE_MIN_MS = "0";
const L = require("./lib");
const { ok, fim, q, escalar, obterPool } = L;

const MSG = "As matrículas novas só começam depois da importação do sistema pago.";
const PERM = ["pessoas"];
const fator = () => ({ via: "CHAVE", em: Date.now() });
const C = { VN: "Vila Nova E2E97", OU: "Outra E2E97" };
const tok = {
  geral: () => L.sessao(9701, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM }),
  local: () => L.sessao(9702, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [C.VN], permissoes: PERM }),
  membro: () => L.sessao(9703, { via: "PIN" })
};
const SITE = { "x-site-key": process.env.CHAVE_SITE_SISTEMA };
// CPF de teste: 9 números e os 2 dígitos verificadores calculados (não é de ninguém)
function cpfDe(base9) {
  const d = String(base9).padStart(9, "0").split("").map(Number);
  const dv = (arr) => { const n = arr.length + 1; const s = arr.reduce((acc, x, i) => acc + x * (n - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(d); const d2 = dv([...d, d1]);
  return [...d, d1, d2].join("");
}
const consentimento = { aceito: true, versao: "2026-11" };

async function principal() {
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  const pessoas = (token, corpo) => chamarRota("GestaoPessoas/index.js", { metodo: "POST", token, corpo });
  const importarAntigo = (token, linhas) => chamarRota("ImportarPessoas/index.js", { metodo: "POST", token, corpo: { linhas } });
  const lancar = (token, corpo) => chamarRota("PreCadastros/index.js", { metodo: "POST", token, corpo });
  const aceitar = (token, id, versao) => chamarRota("PreCadastros/index.js", { metodo: "POST", token, binding: { id: String(id), acao: "aceitar" }, corpo: { versao } });
  const site = (corpo, headers = SITE) => chamarRota("PreCadastroSite/index.js", { metodo: "POST", corpo, headers });
  const imp = (token, acao, corpo, metodo = "POST") => chamarRota("ImportacaoMembros/index.js", { metodo, token, binding: { acao }, corpo: corpo || {} });
  const fichas = () => escalar("SELECT COUNT(*) FROM MembroReferencia");
  const preCadastros = () => escalar("SELECT COUNT(*) FROM PreCadastros");
  const recusada = (r) => r && r.status === 409 && r.body && r.body.sucesso === false && r.body.mensagem && r.body.mensagem.startsWith(MSG);

  console.log("== a base ==");
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembros") === 0, "nenhuma importação na base (o roteiro prova a trava LIGADA primeiro)");

  console.log("== o cenário ==");
  const area = (await q("INSERT INTO Areas (Nome) VALUES (N'Área E2E97'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const cong = {};
  for (const [k, nome] of [["VN", C.VN], ["OU", C.OU]]) cong[k] = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (@n, @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: nome, a: area }))[0].id;
  const ficha = (id, nome) => q(`IF NOT EXISTS (SELECT 1 FROM MembroReferencia WHERE MembroId = @id) INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro,
    DataNascimento) VALUES (@id, @n, @c, N'ATIVO', N'EM_COMUNHAO', '1980-05-20')`, { id, n: nome, c: cong.VN });
  await ficha(9701, "Secretaria Geral E2E97");
  await ficha(9702, "Secretaria Local E2E97");
  await ficha(9703, "Membro Comum E2E97");
  await ficha(970001, "Ficha Antiga E2E97");
  // um pré-cadastro que já estava na fila, completo e sem pendência (de antes da regra): o aceite também é barrado
  const preAntigo = (await q(`INSERT INTO PreCadastros (Origem, CongregacaoId, Nome, Cpf, Email, DataNascimento, Sexo, EstadoCivil, ConsentimentoVersao, ConsentimentoBase, ConsentimentoEm)
    OUTPUT INSERTED.PreCadastroId VALUES (N'SECRETARIA', @c, N'Fila Antiga Exemplo', @cpf, N'fila.antiga.e2e97@example.org', '1991-02-03', N'F', N'SOLTEIRO', N'2026-11',
    N'CONSENTIMENTO', SYSUTCDATETIME())`, { c: cong.VN, cpf: cpfDe(970000001) }))[0].PreCadastroId;
  const versaoDe = async (id) => String(await escalar("SELECT CONVERT(varchar(20), CONVERT(bigint, Versao)) FROM PreCadastros WHERE PreCadastroId = @id", { id }));

  // ------------------------------------------------------------------------------------------------ 1. TRAVADA
  console.log("== 1. travada: nenhuma importação ==");
  const f0 = await fichas(), p0 = await preCadastros();
  const g = await pessoas(tok.local(), { nome: "Pessoa Nova Gerada", congregacaoId: cong.VN, status: "ATIVO", gerarMatricula: true });
  ok(recusada(g), "o Cadastrar com a matrícula gerada: 409 com a mensagem", g);
  const d = await pessoas(tok.local(), { membroId: 3, nome: "Pessoa Nova Digitada", congregacaoId: cong.VN, status: "ATIVO" });
  ok(recusada(d), "o Cadastrar com a matrícula DIGITADA de ficha que não existe (a tela antiga): 409", d);
  ok(await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId = 3") === 0, "a matrícula 3 continua livre para a importação");
  const fora = await pessoas(tok.local(), { membroId: 4, nome: "Fora do Escopo", congregacaoId: cong.OU, status: "ATIVO" });
  ok(fora.status === 403, "destino fora do escopo: o 403 de sempre vem antes da trava", fora.status);
  const edita = await pessoas(tok.local(), { membroId: 970001, nome: "Ficha Antiga Renomeada E2E97", congregacaoId: cong.VN, status: "ATIVO" });
  ok(edita.status === 200 && edita.body.sucesso === true, "editar a ficha que JÁ existe: continua livre", edita.body);
  ok(await escalar("SELECT Nome FROM MembroReferencia WHERE MembroId = 970001") === "Ficha Antiga Renomeada E2E97", "a edição gravou");
  const ia = await importarAntigo(tok.geral(), [{ membroId: 970001, nome: "Ficha Antiga Pela Planilha", sobrescrever: true }, { membroId: 970050, nome: "Nova Pela Planilha" }]);
  ok(recusada(ia), "o importador antigo com uma matrícula nova: 409", ia);
  ok(await escalar("SELECT Nome FROM MembroReferencia WHERE MembroId = 970001") === "Ficha Antiga Renomeada E2E97", "a planilha recusada não gravou nem a linha que só atualizava");
  const ia2 = await importarAntigo(tok.geral(), [{ membroId: 970001, nome: "Ficha Antiga Pela Planilha", sobrescrever: true }]);
  ok(ia2.status === 200 && ia2.body.resumo && ia2.body.resumo.atualizados === 1, "o importador antigo só com quem já existe: continua livre", ia2.body);
  const la = await lancar(tok.local(), { nome: "Pessoa Lancada Exemplo", congregacaoId: cong.VN, consentimentoDaPessoa: true });
  ok(recusada(la), "lançar na fila (o cadastro rápido): 409", la);
  const laMembro = await lancar(tok.membro(), { nome: "Pessoa Lancada Exemplo", congregacaoId: cong.VN, consentimentoDaPessoa: true });
  ok(laMembro.status === 403, "o membro comum continua com o 403 de sempre", laMembro.status);
  const corpoSite = (extra = {}) => ({ nome: "Visitante Site Exemplo", cpf: cpfDe(970000002), email: "visitante.e2e97@example.org", telefone: "(91) 98888-1111",
    dataNascimento: "1995-07-08", sexo: "M", estadoCivil: "SOLTEIRO", congregacaoId: cong.VN, consentimento, origemVisitante: "e2e97", envioId: "97".repeat(16), ...extra });
  const s1 = await site(corpoSite());
  ok(recusada(s1), "o Quero me cadastrar do site: 409 com a mensagem", s1);
  ok((await site(corpoSite(), { "x-site-key": "errada" })).status === 401, "o site com a chave errada: 401 (a trava não aparece para quem não é o site)");
  const ac = await aceitar(tok.local(), preAntigo, await versaoDe(preAntigo));
  ok(recusada(ac), "aceitar o pré-cadastro que já estava na fila: 409 (não a mensagem de 'ainda há pendências')", ac);
  ok(await escalar("SELECT Situacao FROM PreCadastros WHERE PreCadastroId = @id", { id: preAntigo }) === "PENDENTE", "ele continua PENDENTE, sem matrícula");
  ok(await fichas() === f0, "travada: nenhuma ficha nova", { antes: f0, depois: await fichas() });
  ok(await preCadastros() === p0, "travada: nenhum pré-cadastro novo (nada fica numa fila)", { antes: p0, depois: await preCadastros() });

  // ------------------------------------------------------------------------------------------------ 2. NINGUÉM ENTRA
  console.log("== 2. a importação em que ninguém entra ==");
  const CAB = "MATRÍCULA;NOME;IGREJA;SEXO;NASCIMENTO;ESTADO CIVIL;E-MAIL;CELULAR;MÃE;PAI;CPF";
  const vazia = await imp(tok.geral(), "previa", { nomeArquivo: "so-de-fora.csv", texto: [CAB, `970001;Ja Existe;IEADESPA - ${C.VN}`, "970060;Lugar Algum;IEADESPA - Nenhum Lugar E2E97"].join("\r\n") });
  ok(vazia.status === 200 && vazia.body.importacaoId, "a prévia com só linhas de fora", vazia.body && vazia.body.resumo);
  const cv = await imp(tok.geral(), "confirmar", { importacaoId: vazia.body.importacaoId });
  ok(cv.status === 409 && /nenhuma pessoa/i.test(cv.body.mensagem || ""), "confirmar sem ninguém para entrar: 409", cv);
  ok(await escalar("SELECT Situacao FROM ImportacoesMembros WHERE ImportacaoId = @id", { id: vazia.body.importacaoId }) === "PREVIA", "continua prévia (não gastou a importação única)");
  ok(recusada(await pessoas(tok.local(), { nome: "Pessoa Nova Gerada", congregacaoId: cong.VN, status: "ATIVO", gerarMatricula: true })), "continua travada");

  // ------------------------------------------------------------------------------------------------ 3. PARADA NO MEIO
  console.log("== 3. a importação parada no meio ==");
  const ARQ = [CAB, `970101;Ana Importada Exemplo;IEADESPA - ${C.VN};FEMININO;14/03/1990`, `970102;Bruno Importado Exemplo;IEADESPA - ${C.VN};MASCULINO;02/02/1985`,
    `970103;Clara Importada Exemplo;IEADESPA - ${C.VN};FEMININO;03/03/1970`].join("\r\n");
  const pv = await imp(tok.geral(), "previa", { nomeArquivo: "membros-de-mentira.csv", texto: ARQ });
  ok(pv.status === 200 && pv.body.importacaoId && pv.body.importacaoId !== vazia.body.importacaoId, "a prévia de verdade substitui a vazia", pv.body && pv.body.resumo);
  const id = pv.body.importacaoId;
  const c1 = await imp(tok.geral(), "confirmar", { importacaoId: id });
  ok(c1.status === 200 && c1.body.sucesso === true && c1.body.restantes === 3, "confirmada: 3 para entrar", c1.body);
  const db = require(require("path").join(L.API, "shared/importacaoMembrosDb.js"));
  const { getPool } = require(require("path").join(L.API, "shared/db.js"));
  const b1 = await db.importarLote(await getPool(), { membroId: 9701 }, id, { tamanho: 1 });
  ok(b1.sucesso === true && b1.concluida === false && b1.restantes === 2, "um lote de 1: parou no meio (IMPORTANDO)", b1);
  ok(await escalar("SELECT Situacao FROM ImportacoesMembros WHERE ImportacaoId = @id", { id }) === "IMPORTANDO", "no banco: IMPORTANDO");
  const meio = await imp(tok.geral(), "", {}, "GET");
  ok(meio.body && meio.body.emAndamento === true && meio.body.feita === false, "a tela mostra 'Continuar a importação'", meio.body && { feita: meio.body.feita, emAndamento: meio.body.emAndamento });
  ok(recusada(await pessoas(tok.local(), { nome: "Pessoa Nova Gerada", congregacaoId: cong.VN, status: "ATIVO", gerarMatricula: true })), "parada no meio: continua travada (o Cadastrar)");
  ok(recusada(await site(corpoSite())), "parada no meio: continua travada (o site)");
  ok(recusada(await lancar(tok.local(), { nome: "Pessoa Lancada Exemplo", congregacaoId: cong.VN, consentimentoDaPessoa: true })), "parada no meio: continua travada (a fila)");

  // ------------------------------------------------------------------------------------------------ 4. CONCLUÍDA
  console.log("== 4. concluída: solta sozinha ==");
  const b2 = await imp(tok.geral(), "lote", { importacaoId: id });
  ok(b2.status === 200 && b2.body.concluida === true, "o lote pela rota termina a importação", b2.body);
  ok(await escalar("SELECT Situacao FROM ImportacoesMembros WHERE ImportacaoId = @id", { id }) === "CONCLUIDA", "no banco: CONCLUIDA");
  const maiorImportada = await escalar("SELECT MAX(MatriculaFinal) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @id", { id });
  const g2 = await pessoas(tok.local(), { nome: "Pessoa Nova Gerada Depois", congregacaoId: cong.VN, status: "ATIVO", gerarMatricula: true });
  const nova = g2.body && g2.body.membro && g2.body.membro.membroId;
  ok(g2.status === 200 && g2.body.sucesso === true && nova > 0, "o Cadastrar com a matrícula gerada: grava", g2.body);
  ok(nova > maiorImportada, "a matrícula nova vem depois das importadas", { nova, maiorImportada });
  const d2 = await pessoas(tok.local(), { membroId: 970200, nome: "Pessoa Nova Digitada Depois", congregacaoId: cong.VN, status: "ATIVO" });
  ok(d2.status === 200 && d2.body.sucesso === true, "o Cadastrar com a matrícula digitada: grava", d2.body);
  const ia3 = await importarAntigo(tok.geral(), [{ membroId: 970050, nome: "Nova Pela Planilha" }]);
  ok(ia3.status === 200 && ia3.body.resumo && ia3.body.resumo.criados === 1, "o importador antigo cria a linha nova", ia3.body);
  const la2 = await lancar(tok.local(), { nome: "Pessoa Lancada Depois", cpf: cpfDe(970000003), email: "lancada.e2e97@example.org", dataNascimento: "1993-04-05", sexo: "F",
    estadoCivil: "CASADO", congregacaoId: cong.VN, consentimentoDaPessoa: true });
  ok(la2.status === 200 && la2.body.sucesso === true && la2.body.situacao === "ACEITO" && la2.body.matricula > maiorImportada, "lançar na fila: entra sozinho, com a matrícula", la2.body);
  const s2 = await site(corpoSite({ envioId: "98".repeat(16) }));
  ok(s2.status === 200 && s2.body.sucesso === true, "o site: recebemos", s2.body);
  const ac2 = await aceitar(tok.local(), preAntigo, await versaoDe(preAntigo));
  ok(ac2.status === 200 && ac2.body.situacao === "ACEITO" && ac2.body.matricula > 0, "aceitar o pré-cadastro que esperava: entra com a matrícula", ac2.body);
  const e2 = await imp(tok.geral(), "", {}, "GET");
  ok(e2.body && e2.body.feita === true, "a tela de importar: 'já foi feita' (uma vez só)", e2.body && e2.body.feita);

  console.log("== a trilha ==");
  const aud = await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = N'MembroReferencia' AND Acao IN (N'Cadastrou pessoa', N'Cadastrou pessoa pelo pré-cadastro') AND RegistroId IN (@a, 970200)", { a: nova });
  ok(aud === 2, "os cadastros de depois ficaram na trilha", aud);

  fim("e2e-97 (a trava das matrículas)");
}

principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
