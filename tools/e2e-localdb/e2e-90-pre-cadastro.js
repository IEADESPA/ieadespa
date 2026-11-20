// e2e-90-pre-cadastro.js — o PRÉ-CADASTRO, a FILA DE CADASTROS e o CPF REPETIDO (FASE 10, v10.1b passo 4, migração 177, 17/11/2026), contra o SQL Server de verdade:
// o formulário do site (resposta sempre igual, limites), o líder/professor da EBD lançando, o aceite automático com a matrícula (inclusive reaproveitada), a
// pendência na fila e o completar/aceitar/descartar pela secretaria local, a área e a Geral acompanhando, o CPF repetido no cadastro pelo sistema (no escopo: a
// ficha; fora: só "já tem cadastro" e o caso à Geral, sem vazar nada), a repetição do site indo para correção, e as corridas com vários processos node.
// Roda sobre a base cenario-177 (`bash rodar.sh preparar-177` e depois `BASE=cenario-177 bash rodar.sh roteiro e2e-90-pre-cadastro.js`); monta o próprio cenário.
process.env.AUTH_SECRET = "segredo-do-pre-cadastro-e-da-fila-" + "x".repeat(24);
process.env.CHAVE_SITE_SISTEMA = "chave-e2e-do-site-precadastro";
const { spawn } = require("child_process");
const L = require("./lib");
const { ok, fim, q, escalar, obterPool, path, LIXO } = L;

const PERM = ["pessoas"];
const fator = () => ({ via: "CHAVE", em: Date.now() });
const C = { VN: "Vila Nova E2E90", CJ: "Cidade Jardim E2E90", BP: "Bairro da Paz E2E90" };
const tok = {
  geral: () => L.sessao(9001, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM }),
  vn: () => L.sessao(9002, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [C.VN], permissoes: PERM }),
  cj: () => L.sessao(9003, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [C.CJ], permissoes: PERM }),
  area1: () => L.sessao(9004, { via: "SENHA", fator: fator(), nivel: "AREA", escopoCongregacoes: [C.VN, C.CJ], permissoes: PERM }),
  bp: () => L.sessao(9005, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [C.BP], permissoes: PERM }),
  professor: () => L.PIN(9006),
  lider: () => L.PIN(9007),
  membro: () => L.PIN(9008)
};
const SITE = { "x-site-key": process.env.CHAVE_SITE_SISTEMA };
// CPF de teste: 9 números e os 2 dígitos verificadores calculados
function cpfDe(base9) {
  const d = String(base9).padStart(9, "0").split("").map(Number);
  const dv = (arr) => { const n = arr.length + 1; const s = arr.reduce((acc, x, i) => acc + x * (n - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(d); const d2 = dv([...d, d1]);
  return [...d, d1, d2].join("");
}
const consentimento = { aceito: true, versao: "2026-11" };

async function filho() {
  const spec = JSON.parse(process.argv[3]);
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  try {
    const res = await chamarRota(spec.rota, { metodo: "POST", token: spec.quem ? tok[spec.quem]() : undefined, binding: spec.binding || {}, corpo: spec.corpo || {}, headers: spec.site ? SITE : {} });
    const b = res.body || {};
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: true, status: res.status, sucesso: b.sucesso, situacao: b.situacao, mensagem: b.mensagem }) + "\n");
  } catch (e) {
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: false, erro: e && e.message }) + "\n");
  }
  L.shimEncerrar();
}
async function disparar(specs) {
  const t0 = Date.now() + 7000 + specs.length * 800;
  return Promise.all(specs.map((s, i) => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-r", path.join(__dirname, "shim-mssql.js"), __filename, "filho", JSON.stringify({ n: i, t0, ...s })], { env: process.env });
    let saida = ""; p.stdout.on("data", (d) => { saida += d; });
    p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { ok: false, erro: "sem resultado" }); });
  })));
}

async function principal() {
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  const site = (corpo, headers = SITE) => chamarRota("PreCadastroSite/index.js", { metodo: "POST", corpo, headers });
  const fila = (quem, { id, acao, metodo = "POST", corpo, query } = {}) => chamarRota("PreCadastros/index.js", { metodo, token: tok[quem](),
    binding: { ...(id != null ? { id: String(id) } : {}), ...(acao ? { acao } : {}) }, corpo: corpo || {}, query: query || {} });
  const conferir = (quem, corpo) => chamarRota("ConferenciaCadastro/index.js", { metodo: "POST", token: tok[quem](), binding: { acao: "conferir" }, corpo });
  const casos = (quem, { acao = "casos", id, metodo = "GET", corpo, query } = {}) => chamarRota("ConferenciaCadastro/index.js", { metodo, token: tok[quem](),
    binding: { acao, ...(id != null ? { id: String(id) } : {}) }, corpo: corpo || {}, query: query || {} });
  const pessoas = (quem, corpo) => chamarRota("GestaoPessoas/index.js", { metodo: "POST", token: tok[quem](), corpo });
  const pre = async (id) => (await q("SELECT * FROM PreCadastros WHERE PreCadastroId = @id", { id }))[0];
  const ultimoPreDoCpf = async (cpf) => (await q("SELECT TOP 1 * FROM PreCadastros WHERE Cpf = @c ORDER BY PreCadastroId DESC", { c: cpf }))[0];
  const fichaDoCpf = async (cpf) => (await q("SELECT * FROM MembroReferencia WHERE Cpf = @c", { c: cpf }));
  const corpoSite = (extra = {}) => ({ nome: "Pessoa Site E2E90", cpf: cpfDe(900000001), email: "site@example.org", telefone: "00988887777", dataNascimento: "1991-04-20",
    sexo: "F", estadoCivil: "SOLTEIRO", congregacaoId: VN, consentimento, origemVisitante: "visitante-" + Math.random(), ...extra });

  console.log("== a migração 177 (aplicada duas vezes no preparo) ==");
  ok(await escalar("SELECT COUNT(*) FROM sys.tables WHERE name IN ('PreCadastros','CasosCadastroGeral')") === 2, "as tabelas PreCadastros e CasosCadastroGeral");
  ok(await escalar("SELECT COUNT(*) FROM sys.indexes WHERE name = 'UX_CasosCadastro_Aberto' AND is_unique = 1 AND has_filter = 1") === 1, "um caso aberto por ficha, tipo e congregação (índice único filtrado)");
  ok(await escalar("SELECT COUNT(*) FROM sys.check_constraints WHERE name IN ('CK_PreCadastros_Aceito','CK_PreCadastros_Correcao','CK_PreCadastros_Cpf','CK_PreCadastros_Situacao')") === 4, "as travas de coerência");

  console.log("== o cenário: duas áreas, três congregações, as secretarias, um professor da EBD, um líder e as pessoas ==");
  const a1 = (await q("INSERT INTO Areas (Nome) VALUES (N'Área P1 E2E90'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const a2 = (await q("INSERT INTO Areas (Nome) VALUES (N'Área P2 E2E90'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const cong = async (nome, area) => (await q("INSERT INTO Congregacoes (Nome, AreaId, Ativa) VALUES (@n, @a, 1); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: nome, a: area }))[0].id;
  const VN = await cong(C.VN, a1), CJ = await cong(C.CJ, a1), BP = await cong(C.BP, a2);
  const pessoa = async (id, nome, c, extra = {}) => q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, Cpf)
    VALUES (@id, @n, @c, 'ATIVO', 'EM_COMUNHAO', @nasc, @cpf)`, { id, n: nome, c, nasc: extra.nasc || "1980-01-01", cpf: extra.cpf || null });
  for (const [id, nome] of [[9001, "Geral E2E90"], [9002, "Sec VN E2E90"], [9003, "Sec CJ E2E90"], [9004, "Area1 E2E90"], [9005, "Sec BP E2E90"], [9006, "Professor E2E90"], [9007, "Lider E2E90"], [9008, "Membro E2E90"]]) await pessoa(id, nome, VN);
  const turma = (await q("INSERT INTO EbdTurmas (CongregacaoId, Nome) VALUES (@c, N'Jovens E2E90'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { c: VN }))[0].id;
  await q("INSERT INTO EbdTurmaProfessores (TurmaId, MembroId, Ativo) VALUES (@t, 9006, 1)", { t: turma });
  const papel = await escalar("SELECT TOP 1 PapelId FROM Papeis ORDER BY PapelId");
  await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) VALUES (9007, @p, N'CONGREGACAO', @c)", { p: papel, c: VN });
  // fichas que já existem (com CPF): uma em VN, uma em CJ, uma em BP; e uma em VN com nome e nascimento conhecidos
  const CPF_VN = cpfDe(900000101), CPF_CJ = cpfDe(900000102), CPF_BP = cpfDe(900000103);
  await pessoa(9011, "Ana Existente VN E2E90", VN, { cpf: CPF_VN });
  await pessoa(9012, "Bruno Existente CJ E2E90", CJ, { cpf: CPF_CJ });
  await pessoa(9013, "Carla Existente BP E2E90", BP, { cpf: CPF_BP, nasc: "1975-06-15" });
  await pessoa(9014, "Joana Maria Parecida", VN, { nasc: "1988-08-08" });
  // um número liberado por junção de fichas (o próximo cadastro novo usa ele primeiro)
  const LIVRE = 9050;
  ok(await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId = @m", { m: LIVRE }) === 0, "o número 9050 está livre");
  await q("DELETE FROM MatriculasLivres; INSERT INTO MatriculasLivres (MembroId) VALUES (@m)", { m: LIVRE });

  console.log("== o site: sem a chave, 401; completo e sem pendência, entra sozinho (com a matrícula reaproveitada) ==");
  ok((await site(corpoSite(), {})).status === 401, "sem a chave combinada: 401");
  ok((await site(corpoSite(), { "x-site-key": "errada" })).status === 401, "com a chave errada: 401");
  const r1 = await site(corpoSite());
  ok(r1.status === 200 && r1.body.sucesso === true && /Recebemos/.test(r1.body.mensagem), "envio válido: 200 'recebemos'", JSON.stringify(r1.body));
  const p1 = await ultimoPreDoCpf(cpfDe(900000001));
  ok(p1 && p1.Situacao === "ACEITO" && p1.MembroIdResultado === LIVRE && p1.DecididoComo === "AUTOMATICO", "entrou sozinho, com a matrícula 9050 (reaproveitada)", JSON.stringify(p1 && { s: p1.Situacao, m: p1.MembroIdResultado, como: p1.DecididoComo, pend: p1.Pendencias }));
  const f1 = (await fichaDoCpf(cpfDe(900000001)))[0];
  ok(f1 && f1.MembroId === LIVRE && f1.SituacaoMembro === "CONGREGADO" && f1.CongregacaoId === VN && f1.Email === "site@example.org", "a ficha nasce como CONGREGADO, na congregação escolhida, com o e-mail");
  ok(await escalar("SELECT COUNT(*) FROM MatriculasLivres WHERE MembroId = @m", { m: LIVRE }) === 0, "o 9050 saiu da lista de livres");
  ok(p1.ConsentimentoVersao === "2026-11" && p1.ConsentimentoBase === "CONSENTIMENTO" && p1.ConsentimentoEm != null, "o consentimento ficou registrado (versão, base legal, quando)");
  const maior = await escalar("SELECT MAX(MembroId) FROM MembroReferencia");
  const r2 = await site(corpoSite({ nome: "Outra Pessoa Site E2E90", cpf: cpfDe(900000002), email: "outra@example.org" }));
  const p2 = await ultimoPreDoCpf(cpfDe(900000002));
  ok(r2.body.sucesso === true && p2.Situacao === "ACEITO" && p2.MembroIdResultado === maior + 1, "sem número livre, a próxima matrícula é a maior + 1", JSON.stringify({ m: p2.MembroIdResultado, maior }));

  console.log("== o site: a resposta é a MESMA com o CPF que já tem ficha (vai para correção, sem revelar nada) ==");
  const rRep = await site(corpoSite({ nome: "Carla Outra E2E90", cpf: CPF_BP, email: "carla2@example.org" }));
  ok(JSON.stringify(rRep) === JSON.stringify(r1), "a resposta do CPF repetido é idêntica à do cadastro novo", JSON.stringify(rRep.body));
  const pRep = await ultimoPreDoCpf(CPF_BP);
  ok(pRep.Situacao === "CORRECAO" && pRep.MembroIdRepetido === 9013 && /CPF_REPETIDO/.test(pRep.Pendencias), "na fila: CORREÇÃO junto com a ficha mais antiga (9013)");
  ok((await fichaDoCpf(CPF_BP)).length === 1, "nenhuma ficha nova com o CPF repetido");
  ok(await escalar("SELECT COUNT(*) FROM CasosCadastroGeral WHERE Tipo = 'PRECADASTRO_REPETIDO' AND MembroIdExistente = 9013 AND PreCadastroId = @p AND Situacao = 'ABERTO'", { p: pRep.PreCadastroId }) === 1,
    "a ficha repetida é de outra congregação: o caso foi também à Secretaria Geral");

  console.log("== o site: o que não está completo ou o consentimento errado é recusado só pela forma ==");
  ok((await site(corpoSite({ email: "" }))).status === 400, "faltando o e-mail: 400");
  ok((await site(corpoSite({ consentimento: { aceito: false, versao: "2026-11" } }))).status === 400, "sem concordar: 400");
  ok((await site(corpoSite({ consentimento: { aceito: true, versao: "1999-01" } }))).status === 400, "texto de consentimento antigo: 400");
  ok((await site(corpoSite({ congregacaoId: 999999 }))).status === 400, "congregação que não existe: 400");

  console.log("== menor de idade e nome parecido: ficam na fila até a secretaria confirmar ==");
  await site(corpoSite({ nome: "Menor Site E2E90", cpf: cpfDe(900000003), email: "menor@example.org", dataNascimento: "2013-03-03" }));
  const pMenor = await ultimoPreDoCpf(cpfDe(900000003));
  ok(pMenor.Situacao === "PENDENTE" && pMenor.Pendencias === "MENOR_DE_IDADE", "menor de 18: PENDENTE (consentimento do responsável)");
  await site(corpoSite({ nome: "Joana Parecida", cpf: cpfDe(900000004), email: "joana@example.org", dataNascimento: "1988-08-08" }));
  const pPar = await ultimoPreDoCpf(cpfDe(900000004));
  ok(pPar.Situacao === "PENDENTE" && pPar.Pendencias === "POSSIVEL_REPETICAO", "mesmo nascimento e nome parecido com a ficha 9014: PENDENTE (possível repetição)");
  const aceSem = await fila("vn", { id: pPar.PreCadastroId, acao: "aceitar", corpo: {} });
  ok(aceSem.body.sucesso === false && (await pre(pPar.PreCadastroId)).Situacao === "PENDENTE", "aceitar sem conferir a repetição: recusado, continua na fila");
  const aceCom = await fila("vn", { id: pPar.PreCadastroId, acao: "aceitar", corpo: { naoERepeticao: true } });
  ok(aceCom.body.sucesso === true && aceCom.body.situacao === "ACEITO" && (await pre(pPar.PreCadastroId)).DecididoComo === "LOCAL", "conferido 'não é a mesma pessoa': a secretaria local aceita", JSON.stringify(aceCom.body).slice(0, 200));
  const aceMenorArea = await fila("area1", { id: pMenor.PreCadastroId, acao: "aceitar", corpo: { responsavelConfirmado: true } });
  ok(aceMenorArea.status === 403, "a área acompanha mas não aceita (403)");
  const aceMenor = await fila("vn", { id: pMenor.PreCadastroId, acao: "aceitar", corpo: { responsavelConfirmado: true } });
  ok(aceMenor.body.situacao === "ACEITO" && (await pre(pMenor.PreCadastroId)).ResponsavelConfirmado === true, "o responsável confirmado: a secretaria local aceita o menor");

  console.log("== o professor da EBD e o líder lançam; quem não é, não ==");
  const prof = await fila("professor", { corpo: { nome: "Aluno Novo E2E90", cpf: cpfDe(900000005), email: "aluno@example.org", dataNascimento: "1999-09-09", sexo: "M", estadoCivil: "SOLTEIRO", congregacaoId: VN, consentimentoDaPessoa: true } });
  ok(prof.body.sucesso === true && prof.body.situacao === "ACEITO" && prof.body.matricula > 0, "o professor ativo da EBD lança completo: entra sozinho, com a matrícula", JSON.stringify(prof.body));
  ok((await pre(prof.body.preCadastroId)).Origem === "LIDER" && (await pre(prof.body.preCadastroId)).CriadoPor === 9006, "origem LIDER, lançado pelo professor");
  const lid = await fila("lider", { corpo: { nome: "Visitante Sem Email E2E90", cpf: cpfDe(900000006), dataNascimento: "1990-01-01", sexo: "M", estadoCivil: "CASADO", congregacaoId: VN, consentimentoDaPessoa: true } });
  ok(lid.body.situacao === "NA_FILA" && lid.body.pendencias.map((p) => p.codigo).join() === "FALTA_EMAIL", "o líder lança sem e-mail: na fila, faltando o e-mail", JSON.stringify(lid.body));
  const lidRep = await fila("lider", { corpo: { nome: "Bruno Outro E2E90", cpf: CPF_CJ, email: "b@example.org", dataNascimento: "1990-01-01", sexo: "M", estadoCivil: "CASADO", congregacaoId: VN, consentimentoDaPessoa: true } });
  ok(lidRep.body.situacao === "NA_FILA" && !/CPF|REPETID|CORREC|9012|Bruno Existente|Cidade Jardim/i.test(JSON.stringify(lidRep.body)), "o líder com CPF repetido: só 'na fila', sem saber por quê", JSON.stringify(lidRep.body));
  ok((await ultimoPreDoCpf(CPF_CJ)).Situacao === "CORRECAO", "…e o pré-cadastro foi para correção");
  ok((await fila("lider", { corpo: { nome: "Fora E2E90", congregacaoId: CJ, consentimentoDaPessoa: true } })).status === 403, "o líder de Vila Nova não lança em Cidade Jardim (403)");
  ok((await fila("membro", { corpo: { nome: "Qualquer E2E90", congregacaoId: VN, consentimentoDaPessoa: true } })).status === 403, "o membro comum não lança (403)");
  ok((await fila("lider", { corpo: { nome: "Sem Ok E2E90", congregacaoId: VN } })).body.sucesso === false, "sem a pessoa concordar: não lança");
  const meus = await fila("lider", { metodo: "GET", query: { caixa: "meus" } });
  ok(meus.body.sucesso === true && meus.body.itens.length >= 2 && meus.body.itens.every((i) => !("cpfMascarado" in i) && !("email" in i)), "o líder vê os seus (nome e situação, sem CPF nem contato)");
  ok((await fila("lider", { metodo: "GET" })).status === 403, "o líder (sem a permissão de secretaria) não vê a fila");

  console.log("== a secretaria completa: sem pendência, entra sozinho ==");
  const pLid = await ultimoPreDoCpf(cpfDe(900000006));
  const comp = await fila("vn", { id: pLid.PreCadastroId, acao: "completar", corpo: { campos: { email: "visitante@example.org" } } });
  ok(comp.body.sucesso === true && comp.body.situacao === "ACEITO" && (await pre(pLid.PreCadastroId)).DecididoComo === "LOCAL", "completado o e-mail: entrou (a secretaria local)", JSON.stringify(comp.body).slice(0, 200));
  const descArea = await fila("area1", { id: pRep.PreCadastroId, acao: "descartar", corpo: { motivo: "teste" } });
  ok(descArea.status === 403 || descArea.body.sucesso === false, "a área não descarta");

  console.log("== a fila por nível (escopo) ==");
  const filaVn = await fila("vn", { metodo: "GET" });
  const filaCj = await fila("cj", { metodo: "GET" });
  const filaArea = await fila("area1", { metodo: "GET" });
  const filaGeral = await fila("geral", { metodo: "GET" });
  const filaBp = await fila("bp", { metodo: "GET" });
  const congregacoesDe = (r) => [...new Set((r.body.itens || []).map((i) => i.congregacao))].sort().join("|");
  ok(filaVn.body.itens.length > 0 && congregacoesDe(filaVn) === C.VN, "a local de Vila Nova vê só a fila de Vila Nova", congregacoesDe(filaVn));
  ok((filaCj.body.itens || []).length === 0, "a local de Cidade Jardim não vê a fila de Vila Nova");
  ok(filaArea.body.itens.length === filaVn.body.itens.length && filaArea.body.itens.every((i) => i.podeResolver === false), "a área vê (acompanha), sem poder resolver");
  ok(filaGeral.body.itens.some((i) => i.congregacao === C.VN), "a Geral vê a fila de todos");
  ok((filaBp.body.itens || []).length === 0, "Bairro da Paz não vê a fila de Vila Nova");
  const itemRepVn = filaVn.body.itens.find((i) => i.preCadastroId === pRep.PreCadastroId);
  ok(itemRepVn && itemRepVn.repetido && itemRepVn.repetido.foraDoEscopo === true && !/9013|Carla Existente|Bairro da Paz/.test(JSON.stringify({ ...itemRepVn, versao: null, criadoEm: null, decididoEm: null })), "a local de VN vê a correção, mas não a ficha de Bairro da Paz", JSON.stringify(itemRepVn && itemRepVn.repetido));
  const itemRepGeral = filaGeral.body.itens.find((i) => i.preCadastroId === pRep.PreCadastroId);
  ok(itemRepGeral && itemRepGeral.repetido.matricula === 9013, "a Geral vê a ficha repetida (9013)");
  ok((await fila("bp", { metodo: "GET", id: pRep.PreCadastroId })).body.mensagem === "Pré-cadastro não encontrado.", "fora do escopo: a mesma resposta de 'não existe'");
  ok(!/"cpf":"\d{11}"|\d{3}\.\d{3}\.\d{3}-\d{2}/.test(JSON.stringify(filaGeral.body)), "a fila nunca devolve o CPF inteiro (só mascarado)");

  console.log("== a conferência ao digitar (cadastro pelo sistema) ==");
  const cNo = await conferir("vn", { cpf: CPF_VN, congregacaoId: VN });
  ok(cNo.body.cpf.situacao === "NO_ESCOPO" && cNo.body.cpf.matricula === 9011 && cNo.body.bloqueia === true, "CPF de uma ficha de Vila Nova: a ficha (para ir até ela) e não deixa concluir");
  const casosAntes = await escalar("SELECT COUNT(*) FROM CasosCadastroGeral WHERE Tipo = 'CPF_FORA_DO_ESCOPO'");
  const cFora = await conferir("vn", { cpf: CPF_BP, nome: "Carla Tentativa", dataNascimento: "1975-06-15", congregacaoId: VN });
  ok(cFora.body.cpf.situacao === "FORA_DO_ESCOPO" && cFora.body.bloqueia === true && /Secretaria Geral/.test(cFora.body.cpf.mensagem), "CPF de Bairro da Paz para a local de VN: 'já tem cadastro', o caso foi à Geral");
  ok(!/9013|Carla Existente|Bairro da Paz|1975/.test(JSON.stringify(cFora.body)), "fora do escopo: nada da outra ficha vaza (nem nome, matrícula, congregação ou parecidos)", JSON.stringify(cFora.body));
  await conferir("vn", { cpf: CPF_BP, nome: "Carla Tentativa", congregacaoId: VN });
  ok(await escalar("SELECT COUNT(*) FROM CasosCadastroGeral WHERE Tipo = 'CPF_FORA_DO_ESCOPO'") === casosAntes + 1, "digitar de novo não abre outro caso");
  ok((await conferir("area1", { cpf: CPF_CJ })).body.cpf.matricula === 9012, "a área alcança Cidade Jardim: a ficha");
  ok((await conferir("geral", { cpf: CPF_BP })).body.cpf.matricula === 9013, "a Geral alcança tudo");
  ok((await conferir("vn", { cpf: cpfDe(900000999) })).body.cpf.situacao === "LIVRE", "CPF novo: livre");
  ok((await conferir("vn", { cpf: "123.456.789-00" })).body.cpf.situacao === "INVALIDO", "CPF que não existe: inválido");
  const par = await conferir("vn", { nome: "Joana Parecida", dataNascimento: "1988-08-08" });
  ok(par.body.parecidos.some((p) => p.matricula === 9014) && par.body.bloqueia === false, "nome e nascimento parecidos: aviso (a ficha de VN), sem bloquear");
  ok((await conferir("bp", { nome: "Joana Parecida", dataNascimento: "1988-08-08" })).body.parecidos.length === 0, "os parecidos de outra congregação não aparecem para Bairro da Paz");
  const gp = await pessoas("vn", { nome: "Nova Com CPF de BP", congregacaoId: VN, cpf: CPF_BP, gerarMatricula: true, status: "ATIVO" });
  ok(gp.body.sucesso === false && gp.body.cpfRepetido === "FORA_DO_ESCOPO" && !/9013|Carla/.test(JSON.stringify(gp.body)), "o cadastro de hoje (GestaoPessoas) também recusa fora do escopo sem vazar", JSON.stringify(gp.body));
  const gpNo = await pessoas("vn", { nome: "Nova Com CPF de VN", congregacaoId: VN, cpf: CPF_VN, gerarMatricula: true, status: "ATIVO" });
  ok(gpNo.body.sucesso === false && gpNo.body.matricula === 9011, "…e no escopo, mostra a ficha (9011)");

  console.log("== os casos da Secretaria Geral ==");
  ok((await casos("vn")).status === 403, "a local não vê os casos (só a Geral)");
  const lista = await casos("geral");
  const caso = lista.body.casos.find((k) => k.tipo === "CPF_FORA_DO_ESCOPO" && k.fichaExistente.matricula === 9013);
  ok(caso && caso.nomeInformado === "Carla Tentativa" && caso.congregacaoQuePediu === C.VN, "a Geral vê o caso: a ficha existente, o nome digitado e quem pediu");
  ok((await casos("geral", { acao: "resolver-caso", id: caso.casoId, metodo: "POST", corpo: { nota: "" } })).body.sucesso === false, "resolver sem dizer como: recusado");
  ok((await casos("geral", { acao: "resolver-caso", id: caso.casoId, metodo: "POST", corpo: { nota: "Era a mesma pessoa: pedida a transferência." } })).body.sucesso === true, "a Geral resolve o caso");
  ok(await escalar("SELECT Situacao FROM CasosCadastroGeral WHERE CasoId = @c", { c: caso.casoId }) === "RESOLVIDO", "o caso ficou RESOLVIDO");

  console.log("== limites do site ==");
  const visitante = "visitante-limite-" + Date.now();
  const rs = [];
  for (let i = 0; i < 4; i++) rs.push(await site(corpoSite({ nome: `Limite ${i} E2E90`, cpf: cpfDe(900000700 + i), email: `l${i}@example.org`, origemVisitante: visitante })));
  ok(rs.slice(0, 3).every((r) => r.status === 200) && rs[3].status === 429, "3 por hora do mesmo visitante; o 4º é 429", JSON.stringify(rs.map((r) => r.status)));
  await q(`INSERT INTO PreCadastros (Origem, Nome, Situacao) SELECT TOP 200 N'SITE', N'Volume E2E90', N'DESCARTADO' FROM sys.all_objects`);
  ok((await site(corpoSite({ cpf: cpfDe(900000800), origemVisitante: "outro-" + Date.now() }))).status === 429, "200 por hora no total: 429");
  await q("DELETE FROM PreCadastros WHERE Nome = N'Volume E2E90'");

  console.log("== corridas com vários processos ==");
  // (a) 4 envios do site com o MESMO CPF ao mesmo tempo: exatamente uma ficha; os outros em correção; nenhum erro
  const CPF_CORRIDA = cpfDe(900000900);
  const ra = await disparar([0, 1, 2, 3].map((i) => ({ rota: "PreCadastroSite/index.js", site: true, corpo: corpoSite({ nome: `Corrida ${i} E2E90`, cpf: CPF_CORRIDA, email: `c${i}@example.org` }) })));
  ok(ra.every((r) => r.ok && r.status === 200 && r.sucesso === true), "os 4 recebem a mesma resposta (nenhum erro)", JSON.stringify(ra));
  ok((await fichaDoCpf(CPF_CORRIDA)).length === 1, "exatamente UMA ficha com o CPF");
  const situacoesA = (await q("SELECT Situacao, COUNT(*) AS n FROM PreCadastros WHERE Cpf = @c GROUP BY Situacao", { c: CPF_CORRIDA })).map((x) => `${x.Situacao}:${x.n}`).sort().join(",");
  ok(situacoesA === "ACEITO:1,CORRECAO:3", "1 aceito e 3 em correção", situacoesA);
  // (b) completar (vai aceitar) × o cadastro de hoje com o mesmo CPF: uma ficha só, e o pré-cadastro coerente (aceito, ou em correção)
  const CPF_B = cpfDe(900000901);
  await fila("lider", { corpo: { nome: "Corrida B E2E90", cpf: CPF_B, dataNascimento: "1990-02-02", sexo: "F", estadoCivil: "SOLTEIRO", congregacaoId: VN, consentimentoDaPessoa: true } });
  const pB = await ultimoPreDoCpf(CPF_B);
  ok(pB.Situacao === "PENDENTE", "o pré-cadastro B está na fila (falta o e-mail)");
  const rb = await disparar([
    { rota: "PreCadastros/index.js", quem: "vn", binding: { id: String(pB.PreCadastroId), acao: "completar" }, corpo: { campos: { email: "b2@example.org" } } },
    { rota: "GestaoPessoas/index.js", quem: "vn", corpo: { nome: "Corrida B Ficha E2E90", congregacaoId: VN, cpf: CPF_B, gerarMatricula: true, status: "ATIVO" } }
  ]);
  ok(rb.every((r) => r.ok && r.status !== 500), "nenhum erro 500", JSON.stringify(rb));
  ok((await fichaDoCpf(CPF_B)).length === 1, "uma ficha só com o CPF B");
  const pB2 = await pre(pB.PreCadastroId);
  ok((pB2.Situacao === "ACEITO" && pB2.MembroIdResultado != null) || (pB2.Situacao === "CORRECAO" && pB2.MembroIdRepetido != null), "o pré-cadastro B ficou coerente (aceito, ou em correção com a ficha)", pB2.Situacao);
  // (c) dois aceites do mesmo pré-cadastro ao mesmo tempo: uma ficha só
  await site(corpoSite({ nome: "Corrida C Menor E2E90", cpf: cpfDe(900000902), email: "cm@example.org", dataNascimento: "2012-12-12" }));
  const pC = await ultimoPreDoCpf(cpfDe(900000902));
  const rc = await disparar([0, 1, 2].map(() => ({ rota: "PreCadastros/index.js", quem: "vn", binding: { id: String(pC.PreCadastroId), acao: "aceitar" }, corpo: { responsavelConfirmado: true } })));
  ok(rc.every((r) => r.ok && r.status !== 500), "nenhum erro 500 nos 3 aceites", JSON.stringify(rc));
  ok((await fichaDoCpf(cpfDe(900000902))).length === 1 && (await pre(pC.PreCadastroId)).Situacao === "ACEITO", "uma ficha só, aceito uma vez");
  // (d) a local aceita × a Geral descarta o mesmo pré-cadastro ao mesmo tempo: ou aceito (com a ficha) ou descartado (sem ficha), nunca os dois
  await site(corpoSite({ nome: "Corrida D Menor E2E90", cpf: cpfDe(900000903), email: "dm@example.org", dataNascimento: "2011-11-11" }));
  const pD = await ultimoPreDoCpf(cpfDe(900000903));
  const rd = await disparar([
    { rota: "PreCadastros/index.js", quem: "vn", binding: { id: String(pD.PreCadastroId), acao: "aceitar" }, corpo: { responsavelConfirmado: true } },
    { rota: "PreCadastros/index.js", quem: "geral", binding: { id: String(pD.PreCadastroId), acao: "descartar" }, corpo: { motivo: "Cadastro em dobro (teste de corrida)." } }
  ]);
  ok(rd.every((r) => r.ok && r.status !== 500) && rd.filter((r) => r.sucesso === true).length === 1, "aceitar × descartar: um só vence, o outro é recusado (sem erro 500)", JSON.stringify(rd));
  const pD2 = await pre(pD.PreCadastroId); const fichasD = (await fichaDoCpf(cpfDe(900000903))).length;
  ok((pD2.Situacao === "ACEITO" && fichasD === 1) || (pD2.Situacao === "DESCARTADO" && fichasD === 0 && pD2.DecididoComo === "GERAL"), "o estado final é coerente com a ficha", `${pD2.Situacao} / fichas ${fichasD}`);

  console.log("== entradas estranhas (sem erro 500) ==");
  let quinhentos = 0;
  for (const v of LIXO) {
    for (const r of [await site({ ...corpoSite(), nome: v, cpf: v }), await site(v), await fila("vn", { corpo: { nome: v, congregacaoId: v, consentimentoDaPessoa: true } }),
      await fila("vn", { id: v, acao: "completar", corpo: { campos: { cpf: v, dataNascimento: v } } }), await conferir("vn", { cpf: v, nome: v, dataNascimento: v, congregacaoId: v })]) {
      if (!r || r.status === 500) quinhentos++;
    }
  }
  ok(quinhentos === 0, "lixo nas rotas do pré-cadastro: nenhum erro 500", String(quinhentos));
  const texto = JSON.stringify((await fila("geral", { metodo: "GET" })).body) + JSON.stringify((await casos("geral")).body);
  ok(!/SELECT |INSERT |UPDATE |mssql|tedious|node_modules/.test(texto), "as respostas não vazam texto interno");

  fim("e2e-90 (pré-cadastro e fila de cadastros)");
  L.shimEncerrar();
}

if (process.argv[2] === "filho") filho(); else principal().catch((e) => { console.log("ERRO", e.message, e.stack); fim("e2e-90 (abortado)"); L.shimEncerrar(); });
