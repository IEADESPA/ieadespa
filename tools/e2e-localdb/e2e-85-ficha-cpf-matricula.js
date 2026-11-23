// e2e-85-ficha-cpf-matricula.js — a ficha do membro por dentro (FASE 10, v10.1b, migração 174, 14/11/2026): o CPF (conferido pelos dígitos, único, mascarado em
// toda resposta; inteiro só para a Secretaria Geral, com a leitura registrada, e para a própria pessoa em Meus Dados), a filiação, a escolaridade e a MATRÍCULA
// GERADA pelo sistema (primeiro o menor número liberado ao juntar fichas, senão a maior + 1), com corridas de vários processos node, cada um com a sua conexão.
// Roda sobre a base cenario-174 (`bash rodar.sh preparar-174` e depois `BASE=cenario-174 bash rodar.sh roteiro e2e-85-ficha-cpf-matricula.js`); monta o próprio cenário.
// Desde 23/11/2026 (a trava das matrículas) semeia uma importação do sistema pago CONCLUÍDA: rode sobre a cenario-185 (`bash rodar.sh preparar-185`).
process.env.AUTH_SECRET = "segredo-da-ficha-cpf-e-matricula-" + "x".repeat(24);
const { spawn } = require("child_process");
const L = require("./lib");
const { ok, fim, q, escalar, obterPool, path } = L;

const CPF_A = "52998224725", CPF_A_FMT = "529.982.247-25";   // CPFs de teste (dígitos verificadores certos, números públicos de exemplo)
const CPF_B = "12345678909";
const CPF_C = "11144477735";
const CPF_CORRIDA = "39053344705";
const CONG_A = "Ficha A E2E85", CONG_B = "Ficha B E2E85";
const PERM = ["pessoas"];
const fator = () => ({ via: "CHAVE", em: Date.now() });
const tokenLocalA = () => L.sessao(8502, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [CONG_A], permissoes: PERM });
const tokenLocalB = () => L.sessao(8503, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [CONG_B], permissoes: PERM });
const tokenGeral = () => L.sessao(8501, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM });

async function filho() {
  const spec = JSON.parse(process.argv[3]);
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  try {
    const res = await chamarRota("GestaoPessoas/index.js", { metodo: "POST", token: tokenLocalA(), corpo: spec.corpo });
    const b = res.body || {};
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: true, status: res.status, sucesso: b.sucesso, id: b.membro && b.membro.membroId, mensagem: b.mensagem, bruto: JSON.stringify(b) }) + "\n");
  } catch (e) {
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: false, erro: e && e.message }) + "\n");
  }
  L.shimEncerrar();
}
async function disparar(corpos) {
  const t0 = Date.now() + 7000 + corpos.length * 800;
  return Promise.all(corpos.map((corpo, i) => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-r", path.join(__dirname, "shim-mssql.js"), __filename, "filho", JSON.stringify({ n: i, t0, corpo })], { env: process.env });
    let saida = ""; p.stdout.on("data", (d) => { saida += d; });
    p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { ok: false, erro: "sem resultado" }); });
  })));
}

async function principal() {
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  await L.importacaoConcluida();   // a trava das matrículas (23/11/2026): este roteiro cadastra gente, então roda depois da importação do sistema pago
  const pessoas = (token, corpo) => chamarRota("GestaoPessoas/index.js", { metodo: "POST", token, corpo });
  const listar = (token, query) => chamarRota("GestaoPessoas/index.js", { metodo: "GET", token, query: query || {} });
  const verCpf = (token, id) => chamarRota("GestaoPessoas/index.js", { metodo: "GET", token, binding: { membroId: String(id) }, query: { ver: "cpf" } });
  const semCpfBruto = (res, rotulo, ...cpfs) => ok(cpfs.every((c) => !JSON.stringify(res && res.body).includes(c)), `${rotulo}: nenhum CPF inteiro na resposta`, JSON.stringify(res && res.body).slice(0, 300));
  const cpfDe = async (id) => { const v = await escalar("SELECT Cpf FROM MembroReferencia WHERE MembroId = @id", { id }); return v ? String(v).trim() : null; };

  console.log("== a migração 174 (aplicada duas vezes no preparo) ==");
  ok(await escalar("SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID('dbo.MembroReferencia') AND name IN ('Cpf','NomeMae','NomePai','Escolaridade')") === 4, "as 4 colunas novas na ficha");
  ok(await escalar("SELECT COUNT(*) FROM sys.indexes WHERE name = 'UX_MembroReferencia_Cpf' AND is_unique = 1 AND has_filter = 1") === 1, "o índice único filtrado do CPF");
  ok(await escalar("SELECT COUNT(*) FROM sys.tables WHERE name IN ('CpfLeituras','MatriculasLivres')") === 2, "as tabelas CpfLeituras e MatriculasLivres");

  console.log("== o cenário: duas congregações e as pessoas de teste ==");
  const area = (await q("INSERT INTO Areas (Nome) VALUES (N'Área Ficha E2E85'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const congA = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (@n, @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: CONG_A, a: area }))[0].id;
  const congB = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (@n, @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: CONG_B, a: area }))[0].id;
  for (const id of [8501, 8502, 8503]) await q(`IF NOT EXISTS (SELECT 1 FROM MembroReferencia WHERE MembroId = @id)
    INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro) VALUES (@id, @n, @c, 'ATIVO', 'EM_COMUNHAO')`, { id, n: `Secretaria ${id} E2E85`, c: congA });

  console.log("== o banco garante: 11 dígitos, um CPF por pessoa (vazio repete), escolaridade da lista ==");
  let recusou = false;
  try { await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, Cpf) VALUES (850090, N'Cpf letras E2E85', @c, 'ATIVO', 'abc12345678')", { c: congA }); } catch { recusou = true; }
  ok(recusou, "CPF com letra: o banco recusa (CHECK)");
  recusou = false;
  try { await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, Escolaridade) VALUES (850091, N'Esc E2E85', @c, 'ATIVO', N'DOUTORADO')", { c: congA }); } catch { recusou = true; }
  ok(recusou, "escolaridade fora da lista: o banco recusa (CHECK)");
  await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, Cpf) VALUES (850092, N'Indice 1 E2E85', @c, 'ATIVO', @cpf)", { c: congA, cpf: CPF_C });
  recusou = false;
  try { await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, Cpf) VALUES (850093, N'Indice 2 E2E85', @c, 'ATIVO', @cpf)", { c: congA, cpf: CPF_C }); } catch { recusou = true; }
  ok(recusou, "o mesmo CPF em duas fichas: o índice único recusa");
  await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status) VALUES (850094, N'Sem CPF 1 E2E85', @c, 'ATIVO'), (850095, N'Sem CPF 2 E2E85', @c, 'ATIVO')", { c: congA });
  ok(await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId IN (850094, 850095) AND Cpf IS NULL") === 2, "duas fichas sem CPF convivem (o índice só olha quem tem)");

  console.log("== cadastrar pela rota: CPF, filiação e escolaridade; a resposta só com o CPF mascarado ==");
  const cad = await pessoas(tokenLocalA(), { membroId: 850001, nome: "Ana Ficha E2E85", congregacaoId: congA, status: "ATIVO", dataNascimento: "1990-03-14",
    cpf: CPF_A_FMT, nomeMae: "Lúcia  Moreira", nomePai: "José Moreira", escolaridade: "SUPERIOR_COMPLETO" });
  ok(cad.status === 200 && cad.body.sucesso === true, "a secretaria local cadastra com CPF, mãe, pai e escolaridade", JSON.stringify(cad.body).slice(0, 300));
  ok(cad.body.membro && cad.body.membro.cpfMascarado === "***.982.247-**" && cad.body.membro.nomeMae === "Lúcia Moreira", "a ficha volta com o CPF mascarado e a mãe com os espaços arrumados", JSON.stringify(cad.body.membro));
  semCpfBruto(cad, "o cadastro", CPF_A, CPF_A_FMT);
  ok((await cpfDe(850001)) === CPF_A, "no banco o CPF fica inteiro, só os 11 dígitos");
  const invalido = await pessoas(tokenLocalA(), { membroId: 850003, nome: "Cpf Errado E2E85", congregacaoId: congA, cpf: "529.982.247-24" });
  ok(invalido.body.sucesso === false && !/529/.test(invalido.body.mensagem) && (await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId = 850003")) === 0, "CPF com dígito errado: recusado, sem gravar e sem repetir o número na mensagem", invalido.body.mensagem);

  console.log("== a lista e a busca: sempre mascarado; procurar pelo CPF inteiro acha ==");
  const lista = await listar(tokenLocalA());
  const ana = (lista.body || []).find((p) => p.membroId === 850001);
  ok(ana && ana.cpfMascarado === "***.982.247-**", "na lista inteira, o CPF vem mascarado");
  semCpfBruto(lista, "a lista inteira", CPF_A, CPF_C);
  const busca = await listar(tokenLocalA(), { pagina: "1", busca: CPF_A_FMT });
  ok(busca.body && busca.body.total === 1 && busca.body.itens[0].membroId === 850001, "procurar pelo CPF com pontos acha a pessoa", JSON.stringify(busca.body).slice(0, 200));
  semCpfBruto(busca, "a busca pelo CPF", CPF_A);
  const pedaco = await listar(tokenLocalA(), { pagina: "1", busca: "98224" });
  ok(pedaco.body && !pedaco.body.itens.some((p) => p.membroId === 850001), "um pedaço do CPF não acha ninguém (só o número inteiro)");
  const outra = await listar(tokenLocalB(), { pagina: "1", busca: CPF_A });
  ok(outra.body && outra.body.total === 0, "a secretaria de outra congregação não acha a pessoa pelo CPF (o escopo vale na busca)");

  console.log("== ver o CPF inteiro: só a Geral, com a leitura registrada ==");
  const leiturasAntes = await escalar("SELECT COUNT(*) FROM CpfLeituras WHERE MembroId = 850001");
  const local = await verCpf(tokenLocalA(), 850001);
  ok(local.status === 403 && (await escalar("SELECT COUNT(*) FROM CpfLeituras WHERE MembroId = 850001")) === leiturasAntes, "a secretaria local não vê o inteiro, e nada é registrado");
  semCpfBruto(local, "a recusa", CPF_A);
  const geral = await verCpf(tokenGeral(), 850001);
  ok(geral.status === 200 && geral.body.cpf === CPF_A_FMT, "a Secretaria Geral vê o CPF inteiro", JSON.stringify(geral.body));
  ok((await escalar("SELECT COUNT(*) FROM CpfLeituras WHERE MembroId = 850001 AND LidoPor = 8501")) === leiturasAntes + 1, "a leitura ficou em CpfLeituras (quem e de quem)");
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = 'MembroReferencia' AND RegistroId = 850001 AND Acao = N'Viu o CPF inteiro'")) >= 1, "e na trilha");
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE ISNULL(DadosDepois, '') LIKE @a OR ISNULL(DadosAntes, '') LIKE @a OR ISNULL(DadosDepois, '') LIKE @f", { a: `%${CPF_A}%`, f: `%${CPF_A_FMT}%` })) === 0, "a trilha não guarda o CPF inteiro em lugar nenhum");
  ok((await verCpf(tokenGeral(), 899999)).status === 403, "matrícula que não existe: a mesma recusa, sem dizer quem tem cadastro");

  console.log("== quem troca o CPF; a tela antiga não apaga ==");
  const troca = await pessoas(tokenLocalA(), { membroId: 850001, nome: "Ana Ficha E2E85", congregacaoId: congA, status: "ATIVO", dataNascimento: "1990-03-14", cpf: CPF_B });
  ok(troca.status === 403 && (await cpfDe(850001)) === CPF_A, "a secretaria local não troca um CPF já gravado");
  const apaga = await pessoas(tokenLocalA(), { membroId: 850001, nome: "Ana Ficha E2E85", congregacaoId: congA, status: "ATIVO", dataNascimento: "1990-03-14", cpf: "" });
  ok(apaga.status === 403 && (await cpfDe(850001)) === CPF_A, "nem apaga");
  const antiga = await pessoas(tokenLocalA(), { membroId: 850001, nome: "Ana Ficha E2E85", congregacaoId: congA, status: "ATIVO", dataNascimento: "1990-03-14", telefone: "00999990000" });
  ok(antiga.body.sucesso === true && (await cpfDe(850001)) === CPF_A && (await escalar("SELECT NomeMae FROM MembroReferencia WHERE MembroId = 850001")) === "Lúcia Moreira", "salvar sem os campos novos (a tela antiga) mantém o CPF e a filiação");
  const geralTroca = await pessoas(tokenGeral(), { membroId: 850001, nome: "Ana Ficha E2E85", congregacaoId: congA, status: "ATIVO", dataNascimento: "1990-03-14", cpf: CPF_B });
  ok(geralTroca.body.sucesso === true && (await cpfDe(850001)) === CPF_B, "a Secretaria Geral troca");
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE RegistroId = 850001 AND ISNULL(DadosDepois, '') LIKE N'%cpfAlterado%' AND ISNULL(DadosDepois, '') LIKE N'%***.456.789-**%'")) >= 1, "a troca entra na trilha, só mascarada");

  console.log("== CPF de outra pessoa ==");
  const repetidoLocal = await pessoas(tokenLocalA(), { membroId: 850002, nome: "Outra Ficha E2E85", congregacaoId: congA, cpf: CPF_B });
  // desde o passo 4 (17/11/2026, decisão dele): a ficha DENTRO do escopo de quem cadastra aparece (para ir até ela); fora do escopo, só "já tem cadastro" (e2e-90)
  ok(repetidoLocal.body.sucesso === false && repetidoLocal.body.cpfRepetido === "NO_ESCOPO" && repetidoLocal.body.matricula === 850001 && /850001/.test(repetidoLocal.body.mensagem),
    "a local (a outra ficha é da mesma congregação): recusado, com a matrícula da ficha para abrir", repetidoLocal.body.mensagem);
  const repetidoGeral = await pessoas(tokenGeral(), { membroId: 850002, nome: "Outra Ficha E2E85", congregacaoId: congA, cpf: CPF_B });
  ok(repetidoGeral.body.sucesso === false && /850001/.test(repetidoGeral.body.mensagem), "a Geral: recusado, com a matrícula da outra ficha", repetidoGeral.body.mensagem);
  ok((await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId = 850002")) === 0, "nenhuma ficha gravada");

  console.log("== Meus Dados: a própria pessoa vê o próprio CPF inteiro; ninguém mais ==");
  const meus = await chamarRota("AtualizarMeusDados/index.js", { metodo: "GET", token: L.PIN(850001), binding: { matricula: "850001" } });
  ok(meus.status === 200 && meus.body.dados && meus.body.dados.cpf === "123.456.789-09" && meus.body.dados.nomeMae === "Lúcia Moreira", "a pessoa vê o próprio CPF e a filiação", JSON.stringify(meus.body).slice(0, 200));
  const alheio = await chamarRota("AtualizarMeusDados/index.js", { metodo: "GET", token: L.PIN(8502), binding: { matricula: "850001" } });
  ok(alheio.status === 403, "outra pessoa não abre os dados dela");
  semCpfBruto(alheio, "a recusa dos dados alheios", CPF_B);

  console.log("== a matrícula gerada: o número liberado primeiro, senão a maior + 1 ==");
  await q("INSERT INTO MatriculasLivres (MembroId) VALUES (850001), (850050), (850051)");   // 850001 está em uso: precisa ser pulado
  const g1 = await pessoas(tokenLocalA(), { nome: "Gerada 1 E2E85", congregacaoId: congA, status: "ATIVO", gerarMatricula: true });
  ok(g1.body.sucesso === true && g1.body.membro.membroId === 850050 && /850050/.test(g1.body.mensagem), "sem matrícula: recebe a menor livre que ninguém usa (850050, pulando a 850001)", JSON.stringify(g1.body).slice(0, 200));
  ok((await escalar("SELECT COUNT(*) FROM MatriculasLivres WHERE MembroId = 850050")) === 0, "e o número sai da lista de livres");
  await q("DELETE FROM MatriculasLivres WHERE MembroId IN (850001, 850051)");
  const maior = await escalar("SELECT MAX(MembroId) FROM MembroReferencia");
  const g2 = await pessoas(tokenLocalA(), { nome: "Gerada 2 E2E85", congregacaoId: congA, status: "ATIVO", gerarMatricula: true });
  ok(g2.body.sucesso === true && g2.body.membro.membroId === maior + 1, `sem número livre: a maior + 1 (${maior + 1})`, JSON.stringify(g2.body).slice(0, 200));
  const digitada = await pessoas(tokenLocalA(), { membroId: "850070", nome: "Digitada E2E85", congregacaoId: congA, status: "ATIVO" });
  ok(digitada.body.sucesso === true && digitada.body.membro.membroId === 850070, "a matrícula digitada continua valendo");
  const semPedir = await pessoas(tokenLocalA(), { nome: "Sem Pedir E2E85", congregacaoId: congA, status: "ATIVO" });
  ok(semPedir.status === 400 && (await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE Nome = N'Sem Pedir E2E85'")) === 0, "sem matrícula e sem pedir para gerar: recusado (uma tela que mandasse vazio por engano não cria ninguém)");
  ok((await pessoas(tokenLocalA(), { membroId: "85x", nome: "Ruim E2E85", congregacaoId: congA })).status === 400, "matrícula que não é número: 400");

  console.log("== corrida: 6 cadastros sem matrícula ao mesmo tempo, com 2 números livres ==");
  await q("INSERT INTO MatriculasLivres (MembroId) VALUES (850060), (850061)");
  const maiorAntes = await escalar("SELECT MAX(MembroId) FROM MembroReferencia");
  const res = await disparar(Array.from({ length: 6 }, (_, i) => ({ nome: `Corrida ${i} E2E85`, congregacaoId: congA, status: "ATIVO", gerarMatricula: true })));
  const bons = res.filter((r) => r.ok && r.status === 200 && r.sucesso);
  ok(bons.length === 6, "os 6 cadastros simultâneos gravam (nenhum erro por matrícula repetida)", JSON.stringify(res.map((r) => ({ s: r.status, ok: r.sucesso, id: r.id, m: r.mensagem || r.erro }))));
  const ids = bons.map((r) => r.id).sort((a, b) => a - b);
  ok(new Set(ids).size === 6, "as 6 matrículas são diferentes", ids.join(", "));
  const esperados = [850060, 850061, maiorAntes + 1, maiorAntes + 2, maiorAntes + 3, maiorAntes + 4].sort((a, b) => a - b);
  ok(JSON.stringify(ids) === JSON.stringify(esperados), "os 2 números livres foram usados primeiro, e depois a maior + 1, + 2, + 3, + 4 (sem pular)", `${ids.join(", ")} × ${esperados.join(", ")}`);
  ok((await escalar("SELECT COUNT(*) FROM MatriculasLivres WHERE MembroId IN (850060, 850061)")) === 0, "os números livres saíram da lista");

  console.log("== corrida: 4 cadastros com o MESMO CPF ao mesmo tempo ==");
  const resCpf = await disparar(Array.from({ length: 4 }, (_, i) => ({ nome: `Cpf Corrida ${i} E2E85`, congregacaoId: congA, status: "ATIVO", cpf: CPF_CORRIDA, gerarMatricula: true })));
  const gravaram = resCpf.filter((r) => r.ok && r.sucesso === true);
  const recusados = resCpf.filter((r) => r.ok && r.sucesso === false && /outra pessoa|já está na ficha/.test(r.mensagem || ""));
  ok(gravaram.length === 1 && recusados.length === 3, "exatamente 1 grava; os outros 3 recebem a mensagem do CPF repetido (nenhum erro 500)", JSON.stringify(resCpf.map((r) => ({ s: r.status, ok: r.sucesso, m: r.mensagem || r.erro }))));
  ok((await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE Cpf = @c", { c: CPF_CORRIDA })) === 1, "no banco, uma ficha só com esse CPF");
  ok(resCpf.every((r) => !String(r.bruto || "").includes(CPF_CORRIDA)), "nenhuma das 4 respostas trouxe o CPF inteiro");

  console.log("== a saída por carta (minimização) apaga o CPF, a filiação e a escolaridade ==");
  const { minimizarCamposExMembro } = require(path.join(L.API, "shared/minimizacaoLgpd.js"));
  const pool = await obterPool();
  await minimizarCamposExMembro(pool, 850001, { dataSaida: "2026-11-14", motivo: "Carta de Mudança" });
  ok(await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId = 850001 AND Cpf IS NULL AND NomeMae IS NULL AND NomePai IS NULL AND Escolaridade IS NULL") === 1, "o ex-membro fica sem CPF, filiação e escolaridade");

  console.log("== lixo nos campos novos: nunca erro 500 ==");
  let quebrou = 0;
  for (const v of L.LIXO) {
    const r = await pessoas(tokenLocalA(), { membroId: 850080, nome: "Lixo E2E85", congregacaoId: congA, cpf: v, nomeMae: v, escolaridade: v });
    if (!r || r.status >= 500 || r.status === 0) quebrou++;
  }
  ok(quebrou === 0, `nenhum dos ${L.LIXO.length} valores esquisitos derruba a rota`);
  fim("e2e-85 ficha: CPF, filiação, escolaridade e matrícula gerada");
}

if (process.argv[2] === "filho") filho(); else principal().catch((e) => { console.log("ERRO", e.message, e.stack); fim("e2e-85 (abortado)"); });
