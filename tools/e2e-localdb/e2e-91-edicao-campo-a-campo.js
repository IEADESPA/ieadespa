// e2e-91-edicao-campo-a-campo.js — a EDIÇÃO DA FICHA CAMPO A CAMPO e as SUGESTÕES do membro (FASE 10, v10.1b passo 5, migração 178, 18/11/2026), contra o SQL
// Server de verdade: a secretaria muda um campo (a trilha certa, o CPF mascarado), o campo travado pelo papel é recusado (o nome e o CPF gravado só a Geral, o
// processo de cargo, o próprio cadastro), o membro muda o que pode (contato e o vazio) e sugere o resto, a caixa por nível (a local aplica, a área acompanha, a
// Geral aplica tudo), aplicar e recusar com motivo (a pessoa lê), o histórico da ficha, fora do escopo = não existe, e as corridas com vários processos node
// (duas mudanças no mesmo campo, sugestão aplicada × membro mudando, duas decisões, dois pedidos, secretaria × membro no mesmo campo vazio).
// Roda sobre a base cenario-178 (`bash rodar.sh preparar-178` e depois `BASE=cenario-178 bash rodar.sh roteiro e2e-91-edicao-campo-a-campo.js`); monta o próprio cenário.
process.env.AUTH_SECRET = "segredo-da-edicao-campo-a-campo-" + "x".repeat(24);
const { spawn } = require("child_process");
const L = require("./lib");
const { ok, fim, q, escalar, obterPool, path, LIXO } = L;

const PERM = ["pessoas"];
const fator = () => ({ via: "CHAVE", em: Date.now() });
const C = { VN: "Vila Nova E2E91", CJ: "Cidade Jardim E2E91", BP: "Bairro da Paz E2E91" };
const tok = {
  geral: () => L.sessao(9101, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM }),
  vn: () => L.sessao(9102, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [C.VN], permissoes: PERM }),
  cj: () => L.sessao(9103, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [C.CJ], permissoes: PERM }),
  area1: () => L.sessao(9104, { via: "SENHA", fator: fator(), nivel: "AREA", escopoCongregacoes: [C.VN, C.CJ], permissoes: PERM }),
  extVn: () => L.sessao(9105, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [C.VN], escopoExtensaoNome: "Tenda E2E91", permissoes: PERM }),
  vn2: () => L.sessao(9106, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [C.VN], permissoes: PERM }),
  pin: (id) => L.PIN(id)
};
// CPF de teste: 9 números e os 2 dígitos verificadores calculados
function cpfDe(base9) {
  const d = String(base9).padStart(9, "0").split("").map(Number);
  const dv = (arr) => { const n = arr.length + 1; const s = arr.reduce((acc, x, i) => acc + x * (n - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(d); const d2 = dv([...d, d1]);
  return [...d, d1, d2].join("");
}

async function filho() {
  const spec = JSON.parse(process.argv[3]);
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  try {
    const token = spec.pin ? tok.pin(spec.pin) : tok[spec.quem]();
    const res = await chamarRota(spec.rota, { metodo: "POST", token, binding: spec.binding || {}, corpo: spec.corpo || {} });
    const b = res.body || {};
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: true, status: res.status, sucesso: b.sucesso, mensagem: b.mensagem }) + "\n");
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
  const F = (quem, membroId, acao, { metodo = "GET", corpo, query } = {}) => chamarRota("EdicaoFicha/index.js", { metodo, token: tok[quem](),
    binding: { membroId: String(membroId), acao }, corpo: corpo || {}, query: query || {} });
  const campo = (quem, membroId, corpo) => F(quem, membroId, "campo", { metodo: "POST", corpo });
  const meus = (id, corpo) => chamarRota("AtualizarMeusDados/index.js", { metodo: corpo ? "POST" : "GET", token: tok.pin(id), binding: { matricula: String(id) }, corpo: corpo || {} });
  const sugerir = (id, campos) => chamarRota("SolicitarEdicaoPessoa/index.js", { metodo: "POST", token: tok.pin(id), binding: { matricula: String(id) }, corpo: { campos } });
  const minhas = (id) => chamarRota("SolicitarEdicaoPessoa/index.js", { metodo: "GET", token: tok.pin(id), binding: { matricula: String(id) } });
  const caixa = (quem, query) => chamarRota("GestaoFilaAprovacoes/index.js", { metodo: "GET", token: tok[quem](), query: query || {} });
  const decidir = (quem, solicitacaoId, decisoes) => chamarRota("GestaoFilaAprovacoes/index.js", { metodo: "POST", token: tok[quem](),
    binding: { solicitacaoId: String(solicitacaoId), acao: "decidir" }, corpo: { decisoes } });
  const col = async (id, coluna) => escalar(`SELECT ${coluna} FROM MembroReferencia WHERE MembroId = @id`, { id });
  const ultimaTrilha = async (id) => (await q("SELECT TOP 1 Acao, UsuarioId, DadosAntes, DadosDepois FROM AuditLog WHERE Tabela = 'MembroReferencia' AND RegistroId = @id ORDER BY AuditId DESC", { id }))[0];
  const trilhaInteira = async (id) => JSON.stringify(await q("SELECT Acao, DadosAntes, DadosDepois FROM AuditLog WHERE (Tabela = 'MembroReferencia' AND RegistroId = @id) OR Tabela = 'SolicitacoesEdicaoPessoa'", { id }));
  const rcsi = process.env.E2E_RCSI === "1";
  if (rcsi) {
    await q("ALTER DATABASE CURRENT SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE");
    ok((await escalar("SELECT CAST(is_read_committed_snapshot_on AS INT) FROM sys.databases WHERE name = DB_NAME()")) === 1, "READ_COMMITTED_SNAPSHOT ligado (como o Azure SQL)");
  }

  console.log("== a migração 178 (aplicada duas vezes no preparo) ==");
  ok(await escalar("SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SolicitacoesEdicaoCampos') AND name = 'MotivoDecisao'") === 1, "a coluna do motivo da recusa");
  ok(await escalar(`SELECT COUNT(*) FROM sys.indexes WHERE name IN ('IX_SolicitacoesEdicaoPessoa_Status_Membro', 'IX_SolicitacoesEdicaoCampos_Solicitacao', 'IX_AuditLog_FichaMembro')`) === 3,
    "os índices da caixa e do histórico, sem repetir");

  console.log("== o cenário: uma área com duas congregações, outra área, as secretarias e as pessoas ==");
  const a1 = (await q("INSERT INTO Areas (Nome) VALUES (N'Área E2E91'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const a2 = (await q("INSERT INTO Areas (Nome) VALUES (N'Área 2 E2E91'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const cong = async (nome, area) => (await q("INSERT INTO Congregacoes (Nome, AreaId, Ativa) VALUES (@n, @a, 1); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: nome, a: area }))[0].id;
  const VN = await cong(C.VN, a1), CJ = await cong(C.CJ, a1), BP = await cong(C.BP, a2);
  await q("INSERT INTO ExtensoesTenda (Nome, CongregacaoMaeId) VALUES (N'Tenda E2E91', @c)", { c: VN });
  const pessoa = (id, nome, c, extra = {}) => q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, DataAdmissao, FormaAdmissao,
      Telefone, Email, EstadoCivil, Sexo, Cpf)
      VALUES (@id, @n, @c, 'ATIVO', 'EM_COMUNHAO', '1990-01-01', '2015-04-12', 'BATISMO', @t, @e, @ec, @s, @cpf)`,
    { id, n: nome, c, t: extra.telefone === undefined ? "(91) 98888-1111" : extra.telefone, e: extra.email === undefined ? `p${id}@exemplo.org` : extra.email,
      ec: extra.estadoCivil === undefined ? "CASADO" : extra.estadoCivil, s: extra.sexo === undefined ? "F" : extra.sexo, cpf: extra.cpf || null });
  for (const [id, nome] of [[9101, "Geral E2E91"], [9102, "Sec VN E2E91"], [9103, "Sec CJ E2E91"], [9104, "Area E2E91"], [9105, "Ext E2E91"], [9106, "Sec2 VN E2E91"]]) await pessoa(id, nome, VN);
  const P1 = 910001, P2 = 910002, P3 = 910003, P4 = 910004, P5 = 910005, P6 = 910006, P7 = 910007, P8 = 910008;
  await pessoa(P1, "Ana E2E91", VN);
  await pessoa(P2, "Bia em processo E2E91", VN);
  await pessoa(P3, "Caio de fora E2E91", BP);
  await pessoa(P4, "Davi com CPF E2E91", VN, { cpf: cpfDe(910000004) });
  await pessoa(P5, "Eva corridas E2E91", VN, { estadoCivil: "SOLTEIRO" });
  await pessoa(P6, "Fábio da CJ E2E91", CJ);
  await pessoa(P7, "Gil do CPF de fora E2E91", BP, { cpf: cpfDe(910000007) });
  await pessoa(P8, "Hugo da corrida do vazio E2E91", VN);
  await q(`INSERT INTO Consagracoes (MembroId, Assunto, CargoAtual, CargoAlvo, Status, DataProtocolo) VALUES (@p, N'Diaconato E2E91', 'MEMBRO', 'DIACONO', 'PROTOCOLADO', '2026-10-01')`, { p: P2 });
  ok(true, "cenário montado");

  console.log("== a secretaria muda UM campo: a trilha certa ==");
  let r = await campo("vn", P1, { campo: "telefone", valor: "(91) 97777-2222", valorLido: "(91) 98888-1111" });
  ok(r.body && r.body.sucesso === true && await col(P1, "Telefone") === "(91) 97777-2222", "a secretaria local muda o celular", JSON.stringify(r.body));
  let t = await ultimaTrilha(P1);
  ok(t.Acao === "Mudou celular (campo a campo)" && t.UsuarioId === 9102, "a trilha: quem mudou e o quê", JSON.stringify(t));
  ok(!/97777-2222|98888-1111/.test(t.DadosAntes + t.DadosDepois) && /2222/.test(t.DadosDepois) && /1111/.test(t.DadosAntes), "o telefone na trilha só com o fim (antes e depois)", t.DadosAntes + t.DadosDepois);
  const cpfP1 = cpfDe(910000001);
  r = await campo("vn", P1, { campo: "cpf", valor: `${cpfP1.slice(0, 3)}.${cpfP1.slice(3, 6)}.${cpfP1.slice(6, 9)}-${cpfP1.slice(9)}`, valorLido: null });
  ok(r.body && r.body.sucesso === true && String(await col(P1, "Cpf")) === cpfP1, "a secretaria local preenche o CPF vazio", JSON.stringify(r.body));
  ok(r.body.valor === `***.${cpfP1.slice(3, 6)}.${cpfP1.slice(6, 9)}-**` && !JSON.stringify(r.body).includes(cpfP1), "a resposta leva o CPF mascarado");
  t = await ultimaTrilha(P1);
  ok(t.Acao === "Mudou cpf (campo a campo)" && !(t.DadosDepois || "").includes(cpfP1) && /\*\*\*\./.test(t.DadosDepois), "a trilha guarda só o CPF mascarado", t.DadosDepois);

  console.log("== o campo travado pelo papel é recusado ==");
  r = await campo("vn", P1, { campo: "cpf", valor: cpfDe(910000011) });
  ok(r.status === 403 && String(await col(P1, "Cpf")) === cpfP1, "CPF já gravado: a secretaria local não troca (403)", JSON.stringify(r.body));
  r = await campo("vn", P1, { campo: "nome", valor: "Ana Maria E2E91" });
  ok(r.status === 403 && await col(P1, "Nome") === "Ana E2E91", "o NOME: a secretaria local não muda (403)", JSON.stringify(r.body));
  r = await campo("area1", P1, { campo: "nome", valor: "Ana Maria E2E91" });
  ok(r.status === 403, "o NOME: a área também não", JSON.stringify(r.body));
  r = await campo("vn", P2, { campo: "dataNascimento", valor: "1991-01-01" });
  ok(r.status === 403 && /processo de cargo/.test(r.body.mensagem), "processo de cargo em andamento: nascimento só a Geral", JSON.stringify(r.body));
  r = await campo("vn", P2, { campo: "estadoCivil", valor: "VIUVO" });
  ok(r.status === 403, "processo de cargo em andamento: estado civil só a Geral");
  r = await campo("vn", 9102, { campo: "dataNascimento", valor: "1980-01-01" });
  ok(r.status === 403 && /próprio cadastro/.test(r.body.mensagem), "ninguém muda o próprio nascimento", JSON.stringify(r.body));
  r = await campo("vn", P1, { campo: "congregacaoId", valor: CJ });
  ok(r.status === 422 && /transferência/.test(r.body.mensagem), "a congregação muda pela transferência (422)", JSON.stringify(r.body));
  r = await campo("vn", P1, { campo: "cargoMinisterial", valor: "PASTOR" });
  ok(r.status === 422 && /consagração/.test(r.body.mensagem), "o cargo vai pela consagração (422)");
  r = await campo("geral", P1, { campo: "nome", valor: "Ana Maria E2E91", valorLido: "Ana E2E91" });
  ok(r.body.sucesso === true && await col(P1, "Nome") === "Ana Maria E2E91", "a Geral muda o nome", JSON.stringify(r.body));
  r = await campo("geral", P2, { campo: "dataNascimento", valor: "1991-01-01" });
  ok(r.body.sucesso === true, "a Geral muda o nascimento de quem está em processo");
  r = await campo("geral", P1, { campo: "cpf", valor: cpfDe(910000011) });
  ok(r.body.sucesso === true && String(await col(P1, "Cpf")) === cpfDe(910000011), "a Geral troca o CPF gravado");
  t = await ultimaTrilha(P1);
  ok(!(t.DadosAntes + t.DadosDepois).includes(cpfP1) && !(t.DadosAntes + t.DadosDepois).includes(cpfDe(910000011)), "a troca do CPF na trilha: antes e depois mascarados", t.DadosAntes + t.DadosDepois);

  console.log("== mudou enquanto a tela estava aberta; o CPF de outra ficha ==");
  r = await campo("vn", P1, { campo: "telefone", valor: "(91) 96666-3333", valorLido: "(91) 98888-1111" });
  ok(r.status === 409 && await col(P1, "Telefone") === "(91) 97777-2222", "a tela leu o valor antigo: 409, nada gravado", JSON.stringify(r.body));
  const casosAntes = await escalar("SELECT COUNT(*) FROM CasosCadastroGeral WHERE MembroIdExistente = @p", { p: P7 });
  r = await campo("vn", P5, { campo: "cpf", valor: cpfDe(910000007) });
  ok(r.body.sucesso === false && !r.body.matricula && !JSON.stringify(r.body).includes(String(P7)) && await col(P5, "Cpf") === null,
    "CPF que está numa ficha de FORA do escopo: não grava e não revela a outra ficha", JSON.stringify(r.body));
  ok(await escalar("SELECT COUNT(*) FROM CasosCadastroGeral WHERE MembroIdExistente = @p", { p: P7 }) === casosAntes + 1, "o caso vai à Secretaria Geral (a regra do passo 4)");
  r = await campo("vn", P5, { campo: "cpf", valor: cpfDe(910000004) });
  ok(r.body.sucesso === false && r.body.matricula === P4, "CPF que está numa ficha do escopo: a mensagem leva à ficha", JSON.stringify(r.body));

  console.log("== fora do escopo = não existe ==");
  const fora = await campo("vn", P3, { campo: "telefone", valor: "(91) 95555-0000" });
  const inexistente = await campo("vn", 999991, { campo: "telefone", valor: "(91) 95555-0000" });
  ok(JSON.stringify(fora) === JSON.stringify(inexistente) && fora.body.mensagem === "Matrícula não encontrada.", "gravar fora do escopo = matrícula inexistente", JSON.stringify(fora));
  ok(JSON.stringify(await F("vn", P3, "alteracoes")) === JSON.stringify(await F("vn", 999991, "alteracoes")), "o histórico de fora do escopo = matrícula inexistente");
  ok(JSON.stringify(await F("vn", P3, "campos")) === JSON.stringify(await F("vn", 999991, "campos")), "os campos de fora do escopo = matrícula inexistente");
  ok(await col(P3, "Telefone") === "(91) 98888-1111", "a ficha de fora não mudou");
  r = await F("extVn", P1, "campos");
  ok(r.body.sucesso === false, "a concessão presa à Extensão não abre quem está fora dela");

  console.log("== os campos e o histórico para a tela ==");
  r = await F("vn", P1, "campos");
  const porChave = Object.fromEntries((r.body.campos || []).map((c) => [c.chave, c]));
  ok(porChave.cpf && porChave.cpf.pode === false && /\*\*\*/.test(porChave.cpf.valor) && !JSON.stringify(r.body).includes(cpfDe(910000011)), "os campos: o CPF mascarado e travado para a local");
  ok(porChave.nome.pode === false && porChave.telefone.pode === true && porChave.escolaridade.pode === true, "os campos: o nome travado, o contato e o vazio livres");
  ok(Array.isArray(r.body.quemMudaOQue) && r.body.quemMudaOQue.find((x) => x.chave === "nome").secretaria === "SO_GERAL", "a tabela 'quem muda o quê'");
  r = await F("vn", P1, "alteracoes", { query: { porPagina: 3 } });
  const totalTrilha = await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = 'MembroReferencia' AND RegistroId = @p", { p: P1 });
  ok(r.body.sucesso && r.body.total === totalTrilha && r.body.itens.length === 3, "o histórico paginado conta a trilha inteira", `${r.body.total} × ${totalTrilha}`);
  ok(r.body.itens[0].acao === "Mudou cpf (campo a campo)" && r.body.itens[0].quem.matricula === 9101, "o histórico: do mais novo, com quem mudou");
  const hist = JSON.stringify((await F("area1", P1, "alteracoes", { query: { porPagina: 100 } })).body);
  ok(!hist.includes(cpfP1) && !hist.includes(cpfDe(910000011)) && !hist.includes("97777-2222"), "o histórico nunca leva o CPF nem o telefone inteiros");

  console.log("== o membro muda o que pode e sugere o resto ==");
  r = await meus(P1);
  const modo = Object.fromEntries((r.body.campos || []).map((c) => [c.chave, c.modo]));
  ok(modo.telefone === "MUDA" && modo.escolaridade === "MUDA" && modo.estadoCivil === "SUGERE" && modo.nome === "SUGERE" && modo.dataAdmissao === "SUGERE" && modo.departamentoId === "NAO",
    "Meus Dados diz o que o membro muda e o que sugere", JSON.stringify(modo));
  r = await meus(P1, { telefone: "(91) 94444-5555", escolaridade: "SUPERIOR_COMPLETO", estadoCivil: "CASADO", nomeMae: "Maria E2E91" });
  ok(r.body.sucesso === true && await col(P1, "Telefone") === "(91) 94444-5555" && await col(P1, "Escolaridade") === "SUPERIOR_COMPLETO" && await col(P1, "NomeMae") === "Maria E2E91",
    "o membro muda o contato e preenche o vazio (escolaridade, nome da mãe)", JSON.stringify(r.body));
  t = await ultimaTrilha(P1);
  ok(t.Acao === "Atualizou os próprios dados (autoatendimento)" && t.UsuarioId === P1 && !/94444-5555/.test(t.DadosDepois), "a trilha do membro, com o telefone mascarado");
  r = await meus(P1, { estadoCivil: "DIVORCIADO", telefone: "(91) 93333-0000" });
  ok(r.body.sucesso === false && r.body.campo === "estadoCivil" && await col(P1, "EstadoCivil") === "CASADO" && await col(P1, "Telefone") === "(91) 94444-5555",
    "o estado civil preenchido não muda sozinho: nada é gravado e a mensagem manda sugerir", JSON.stringify(r.body));
  r = await meus(P1, { escolaridade: "MEDIO_COMPLETO" });
  ok(r.body.sucesso === false && await col(P1, "Escolaridade") === "SUPERIOR_COMPLETO", "o que ele mesmo preencheu, agora preenchido, também vira sugestão");
  r = await meus(P2, { dataNascimento: "1970-01-01" });
  ok(r.body.sucesso === false, "o nascimento (preenchido) não muda sozinho");
  r = await sugerir(P1, { estadoCivil: "DIVORCIADO", dataBatismo: "2001-03-04", nome: "Ana Maria Souza E2E91" });
  const s1 = r.body && r.body.solicitacaoId;
  ok(r.status === 201 && s1 && await escalar("SELECT COUNT(*) FROM SolicitacoesEdicaoCampos WHERE SolicitacaoId = @s AND Status = 'PENDENTE'", { s: s1 }) === 3,
    "o membro sugere o estado civil, o batismo e o nome", JSON.stringify(r.body));
  r = await sugerir(P1, { estadoCivil: "VIUVO" });
  ok(r.status === 409 && /Estado civil/.test(r.body.mensagem), "uma sugestão pendente por campo: o segundo pedido do mesmo campo é recusado", JSON.stringify(r.body));
  r = await sugerir(P1, { telefone: "(91) 90000-0000" });
  ok(r.body.sucesso === false && /Meus Dados/.test(r.body.mensagem), "o contato não vira pedido: ele mesmo muda");
  r = await sugerir(P1, { congregacaoId: CJ });
  ok(r.body.sucesso === false && /transferência/.test(r.body.mensagem), "a congregação não vira pedido: é a transferência");
  r = await sugerir(9102, { dataBatismo: "2000-02-02" });
  const sProprio = r.body && r.body.solicitacaoId;
  ok(r.status === 201, "a secretaria local também é membro: sugere para si");

  console.log("== a caixa por nível ==");
  const temNaCaixa = (lista, id) => (Array.isArray(lista) ? lista : []).find((s) => s.solicitacaoId === id);
  r = await caixa("vn");
  const nVn = temNaCaixa(r.body, s1);
  ok(nVn && nVn.podeAplicar === true && nVn.campos.length === 3, "a secretaria local vê e pode aplicar", JSON.stringify(nVn));
  ok(nVn.campos.find((c) => c.nomeCampo === "nome").podeAplicar === false && nVn.campos.find((c) => c.nomeCampo === "nome").podeRecusar === true,
    "o nome na caixa da local: recusa, mas não aplica (só a Geral)");
  ok(!temNaCaixa(r.body, sProprio), "o pedido da própria pessoa não aparece na caixa dela");
  r = await caixa("area1");
  const nArea = temNaCaixa(r.body, s1);
  ok(nArea && nArea.podeAplicar === false && nArea.campos.every((c) => !c.podeAplicar && !c.podeRecusar), "a área acompanha (vê, sem aplicar nem recusar)");
  ok(!!temNaCaixa(r.body, sProprio), "a área vê o pedido da secretaria local");
  ok(!temNaCaixa((await caixa("cj")).body, s1), "a outra congregação não vê");
  ok(!temNaCaixa((await caixa("extVn")).body, s1), "a concessão da Extensão não vê quem está fora dela");
  ok(!!temNaCaixa((await caixa("geral")).body, s1), "a Geral vê tudo");
  const campoDe = async (s, nome) => escalar("SELECT CampoId FROM SolicitacoesEdicaoCampos WHERE SolicitacaoId = @s AND NomeCampo = @n", { s, n: nome });
  const cEstado = await campoDe(s1, "estadoCivil"), cBatismo = await campoDe(s1, "dataBatismo"), cNome = await campoDe(s1, "nome");
  r = await decidir("area1", s1, [{ campoId: cEstado, decisao: "APROVADO" }]);
  ok(r.status === 403 && await col(P1, "EstadoCivil") === "CASADO", "a área não aplica (403)", JSON.stringify(r.body));
  r = await decidir("cj", s1, [{ campoId: cEstado, decisao: "APROVADO" }]);
  ok(r.body.mensagem === "Solicitação não encontrada.", "a outra congregação: 'não encontrada'");
  r = await decidir("vn", sProprio, [{ campoId: await campoDe(sProprio, "dataBatismo"), decisao: "APROVADO" }]);
  ok(r.status === 403, "ninguém decide o próprio pedido");
  r = await decidir("vn2", sProprio, [{ campoId: await campoDe(sProprio, "dataBatismo"), decisao: "APROVADO" }]);
  ok(r.body.sucesso === true, "outra pessoa da secretaria local decide o pedido do colega", JSON.stringify(r.body));

  console.log("== aplicar e recusar com motivo ==");
  r = await decidir("vn", s1, [{ campoId: cEstado, decisao: "APROVADO" }]);
  ok(r.body.sucesso === true && await col(P1, "EstadoCivil") === "DIVORCIADO", "a local aplica o estado civil", JSON.stringify(r.body));
  t = await ultimaTrilha(P1);
  ok(t.Acao === "Aplicou a sugestão de estado civil" && t.UsuarioId === 9102, "a trilha da aplicação");
  r = await decidir("vn", s1, [{ campoId: cEstado, decisao: "REJEITADO", motivo: "tarde demais" }]);
  ok(r.status === 409, "decidir de novo o que já foi decidido: 409");
  r = await decidir("vn", s1, [{ campoId: cNome, decisao: "APROVADO" }]);
  ok(r.status === 403 && await col(P1, "Nome") === "Ana Maria E2E91", "o nome: a local não aplica (403)");
  r = await decidir("vn", s1, [{ campoId: cBatismo, decisao: "REJEITADO", motivo: "  " }]);
  ok(r.body.sucesso === false && /motivo/.test(r.body.mensagem), "recusar sem motivo: pede o motivo");
  r = await decidir("vn", s1, [{ campoId: cBatismo, decisao: "REJEITADO", motivo: "No livro de batismo a data é 04/03/2002." }]);
  ok(r.body.sucesso === true && await escalar("SELECT MotivoDecisao FROM SolicitacoesEdicaoCampos WHERE CampoId = @c", { c: cBatismo }) === "No livro de batismo a data é 04/03/2002."
    && await col(P1, "DataBatismo") === null, "a local recusa com o motivo; a ficha não muda");
  ok(await escalar("SELECT Status FROM SolicitacoesEdicaoPessoa WHERE SolicitacaoId = @s", { s: s1 }) === "PENDENTE", "o pedido segue aberto enquanto há campo pendente");
  r = await decidir("geral", s1, [{ campoId: cNome, decisao: "APROVADO" }]);
  ok(r.body.sucesso === true && await col(P1, "Nome") === "Ana Maria Souza E2E91", "a Geral aplica o nome");
  ok(await escalar("SELECT Status FROM SolicitacoesEdicaoPessoa WHERE SolicitacaoId = @s", { s: s1 }) === "CONCLUIDA", "todos decididos: o pedido fecha");
  r = await minhas(P1);
  const respostas = (r.body || []).find((s) => s.solicitacaoId === s1);
  const bat = respostas && respostas.campos.find((c) => c.nomeCampo === "dataBatismo");
  ok(bat && bat.status === "REJEITADO" && bat.motivo === "No livro de batismo a data é 04/03/2002." && !/decididoPor/.test(JSON.stringify(r.body)), "o membro lê o motivo da recusa (sem saber quem decidiu)");
  r = await caixa("vn", { situacao: "DECIDIDAS" });
  ok(!!temNaCaixa(r.body, s1), "a caixa das decididas");
  // a ficha mudou depois do pedido: não aplica por cima
  r = await sugerir(P1, { dataAdmissao: "2014-01-01" });
  const s2 = r.body && r.body.solicitacaoId;
  await campo("geral", P1, { campo: "dataAdmissao", valor: "2013-05-05" });
  r = await decidir("vn", s2, [{ campoId: await campoDe(s2, "dataAdmissao"), decisao: "APROVADO" }]);
  ok(r.status === 409 && await col(P1, "DataAdmissao").then((d) => d.toISOString().slice(0, 10)) === "2013-05-05", "a ficha mudou depois do pedido: 409 e nada aplicado por cima", JSON.stringify(r.body));
  // o CPF sugerido: mascarado na caixa da local, que não aplica; a Geral aplica
  r = await sugerir(P4, { cpf: cpfDe(910000044) });
  const s3 = r.body && r.body.solicitacaoId;
  const caixaVn = JSON.stringify((await caixa("vn")).body);
  ok(s3 && !caixaVn.includes(cpfDe(910000044)) && !caixaVn.includes(cpfDe(910000004)), "o CPF sugerido sai mascarado na caixa da local");
  r = await decidir("vn", s3, [{ campoId: await campoDe(s3, "cpf"), decisao: "APROVADO" }]);
  ok(r.status === 403 && String(await col(P4, "Cpf")) === cpfDe(910000004), "o CPF gravado: a local não aplica a troca");
  r = await decidir("geral", s3, [{ campoId: await campoDe(s3, "cpf"), decisao: "APROVADO" }]);
  ok(r.body.sucesso === true && String(await col(P4, "Cpf")) === cpfDe(910000044), "a Geral aplica a troca do CPF");
  const trilhaP4 = await trilhaInteira(P4);
  ok(!trilhaP4.includes(cpfDe(910000044)) && !trilhaP4.includes(cpfDe(910000004)), "nem o pedido nem a aplicação deixam o CPF inteiro na trilha");
  const guardado = JSON.stringify(await q("SELECT ValorAnterior, ValorProposto FROM SolicitacoesEdicaoCampos WHERE SolicitacaoId = @s", { s: s3 }));
  ok(!guardado.includes(cpfDe(910000044)) && !guardado.includes(cpfDe(910000004)) && /\*\*\*\./.test(guardado), "decidido o pedido, o CPF não fica inteiro guardado nele", guardado);
  // o membro preenche um CPF (vazio) que já está noutra ficha: não grava, não diz de quem é, e o caso vai à Geral
  const casosP7 = await escalar("SELECT COUNT(*) FROM CasosCadastroGeral WHERE MembroIdExistente = @p AND PedidoPor = @m", { p: P7, m: P6 });
  r = await meus(P6, { cpf: cpfDe(910000007) });
  ok(r.body.sucesso === false && r.body.campo === "cpf" && !JSON.stringify(r.body).includes(String(P7)) && await col(P6, "Cpf") === null, "o membro com o CPF de outra ficha: recusado, sem revelar a outra", JSON.stringify(r.body));
  ok(await escalar("SELECT COUNT(*) FROM CasosCadastroGeral WHERE MembroIdExistente = @p AND PedidoPor = @m", { p: P7, m: P6 }) === casosP7 + 1, "o caso (ficha em dobro?) vai à Secretaria Geral");
  // a mensagem da trava da readmissão não conta a quem não tem "disciplina" que houve exclusão
  await q(`INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, DataConclusao, Status, Resultado) VALUES (@p, '2024-03-01', '2024-05-05', 'JULGADO', 'EXCLUSAO')`, { p: P8 });
  r = await campo("vn", P8, { campo: "dataAdmissao", valor: "2025-01-01" });
  ok(r.status === 403 && !/exclus|disciplin/i.test(r.body.mensagem), "readmissão: só a Geral, e a mensagem não revela a exclusão", JSON.stringify(r.body));
  const camposP8 = JSON.stringify((await F("vn", P8, "campos")).body.campos);   // (a tabela geral "quem muda o quê" cita a regra; a ficha da pessoa, não)
  ok(!/exclus|disciplin/i.test(camposP8) && /só a Secretaria Geral/.test(camposP8), "os campos da ficha também não revelam a exclusão", camposP8.slice(0, 200));

  console.log("== corridas (vários processos) ==");
  // 1) duas secretarias mudam o MESMO campo ao mesmo tempo, as duas com a tela aberta no mesmo valor
  const telAntes = await col(P5, "Telefone");
  const trilhaAntes = await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = 'MembroReferencia' AND RegistroId = @p", { p: P5 });
  let rr = await disparar([
    { rota: "EdicaoFicha/index.js", quem: "vn", binding: { membroId: String(P5), acao: "campo" }, corpo: { campo: "telefone", valor: "(91) 91111-0001", valorLido: telAntes } },
    { rota: "EdicaoFicha/index.js", quem: "geral", binding: { membroId: String(P5), acao: "campo" }, corpo: { campo: "telefone", valor: "(91) 91111-0002", valorLido: telAntes } }
  ]);
  const venceu = rr.filter((x) => x.sucesso === true);
  ok(rr.every((x) => x.ok && x.status !== 500) && venceu.length === 1 && rr.filter((x) => x.status === 409).length === 1, "duas mudanças no mesmo campo: uma vale, a outra recebe 409", JSON.stringify(rr));
  const telDepois = await col(P5, "Telefone");
  ok(["(91) 91111-0001", "(91) 91111-0002"].includes(telDepois) && await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = 'MembroReferencia' AND RegistroId = @p", { p: P5 }) === trilhaAntes + 1,
    "a ficha fica com o valor de quem venceu, e a trilha com UMA linha", telDepois);
  // 2) sugestão aplicada × o membro salvando Meus Dados (a tela antiga reenvia o estado civil que leu)
  r = await sugerir(P5, { estadoCivil: "CASADO" });
  const s4 = r.body && r.body.solicitacaoId;
  const c4 = await campoDe(s4, "estadoCivil");
  rr = await disparar([
    { rota: "GestaoFilaAprovacoes/index.js", quem: "vn", binding: { solicitacaoId: String(s4), acao: "decidir" }, corpo: { decisoes: [{ campoId: c4, decisao: "APROVADO" }] } },
    { rota: "AtualizarMeusDados/index.js", pin: P5, binding: { matricula: String(P5) }, corpo: { telefone: "(91) 92222-0000", estadoCivil: "SOLTEIRO" } }
  ]);
  ok(rr.every((x) => x.ok && x.status !== 500) && rr[0].sucesso === true, "a sugestão é aplicada mesmo com o membro salvando junto", JSON.stringify(rr));
  ok(await col(P5, "EstadoCivil") === "CASADO" && await escalar("SELECT Status FROM SolicitacoesEdicaoCampos WHERE CampoId = @c", { c: c4 }) === "APROVADO",
    "o estado civil aplicado NÃO volta ao valor antigo (sem atualização perdida)");
  const telP5 = await col(P5, "Telefone");
  ok(rr[1].sucesso === true ? telP5 === "(91) 92222-0000" : telP5 === telDepois, "o telefone do membro: gravado se ele chegou antes, intacto se chegou depois (tudo ou nada)", `${rr[1].sucesso} ${telP5}`);
  // 3) duas decisões no mesmo campo (aplicar × recusar)
  r = await sugerir(P6, { dataBatismo: "2010-10-10" });
  const s5 = r.body && r.body.solicitacaoId;
  const c5 = await campoDe(s5, "dataBatismo");
  rr = await disparar([
    { rota: "GestaoFilaAprovacoes/index.js", quem: "cj", binding: { solicitacaoId: String(s5), acao: "decidir" }, corpo: { decisoes: [{ campoId: c5, decisao: "APROVADO" }] } },
    { rota: "GestaoFilaAprovacoes/index.js", quem: "geral", binding: { solicitacaoId: String(s5), acao: "decidir" }, corpo: { decisoes: [{ campoId: c5, decisao: "REJEITADO", motivo: "corrida" }] } }
  ]);
  const st5 = await escalar("SELECT Status FROM SolicitacoesEdicaoCampos WHERE CampoId = @c", { c: c5 });
  const bat6 = await col(P6, "DataBatismo");
  ok(rr.every((x) => x.ok && x.status !== 500) && rr.filter((x) => x.sucesso === true).length === 1 && rr.filter((x) => x.status === 409).length === 1, "aplicar × recusar o mesmo campo: uma decisão vale, a outra 409", JSON.stringify(rr));
  ok((st5 === "APROVADO" && bat6 && bat6.toISOString().slice(0, 10) === "2010-10-10") || (st5 === "REJEITADO" && bat6 === null), "o estado final é coerente com a ficha", `${st5} ${bat6}`);
  // 4) dois pedidos do mesmo campo ao mesmo tempo (duas abas)
  rr = await disparar([
    { rota: "SolicitarEdicaoPessoa/index.js", pin: P8, binding: { matricula: String(P8) }, corpo: { campos: { origem: "Igreja A E2E91" } } },
    { rota: "SolicitarEdicaoPessoa/index.js", pin: P8, binding: { matricula: String(P8) }, corpo: { campos: { origem: "Igreja B E2E91" } } }
  ]);
  ok(rr.every((x) => x.ok && x.status !== 500) && rr.filter((x) => x.sucesso === true).length === 1, "dois pedidos do mesmo campo juntos: um só é criado", JSON.stringify(rr));
  ok(await escalar(`SELECT COUNT(*) FROM SolicitacoesEdicaoCampos c JOIN SolicitacoesEdicaoPessoa s ON s.SolicitacaoId = c.SolicitacaoId
    WHERE s.MembroId = @p AND c.NomeCampo = 'origem' AND c.Status = 'PENDENTE'`, { p: P8 }) === 1, "no banco, UMA sugestão pendente do campo");
  // 5) a secretaria e o membro preenchem o MESMO campo vazio ao mesmo tempo
  rr = await disparar([
    { rota: "EdicaoFicha/index.js", quem: "vn", binding: { membroId: String(P8), acao: "campo" }, corpo: { campo: "escolaridade", valor: "MEDIO_COMPLETO", valorLido: null } },
    { rota: "AtualizarMeusDados/index.js", pin: P8, binding: { matricula: String(P8) }, corpo: { escolaridade: "SUPERIOR_COMPLETO" } }
  ]);
  const esc8 = await col(P8, "Escolaridade");
  ok(rr.every((x) => x.ok && x.status !== 500) && rr.filter((x) => x.sucesso === true).length === 1, "secretaria × membro no mesmo campo vazio: um preenche, o outro é recusado", JSON.stringify(rr));
  ok((rr[0].sucesso === true && esc8 === "MEDIO_COMPLETO") || (rr[1].sucesso === true && esc8 === "SUPERIOR_COMPLETO"), "a ficha fica com o valor de quem venceu", esc8);

  console.log("== entradas estranhas (sem erro 500) ==");
  let quinhentos = 0;
  for (const v of LIXO) {
    for (const x of [await campo("vn", P1, { campo: v, valor: v, valorLido: v }), await campo("vn", P1, { campo: "dataBatismo", valor: v }), await campo("vn", v, { campo: "telefone", valor: v }),
      await F("vn", P1, "alteracoes", { query: { pagina: v, porPagina: v } }), await meus(P1, { telefone: v, cpf: v, estadoCivil: v, enderecoPartes: v }),
      await sugerir(P1, { nome: v, dataAdmissao: v }), await sugerir(P1, v), await decidir("vn", v, [{ campoId: v, decisao: v, motivo: v }]), await caixa("vn", { situacao: v })]) {
      if (!x || x.status === 500) quinhentos++;
    }
  }
  ok(quinhentos === 0, "lixo nas rotas da edição e da caixa: nenhum erro 500", String(quinhentos));
  const texto = JSON.stringify((await caixa("geral")).body) + JSON.stringify((await F("geral", P1, "alteracoes", { query: { porPagina: 100 } })).body);
  ok(!/SELECT |INSERT |UPDATE |mssql|tedious|node_modules/.test(texto), "as respostas não vazam texto interno");

  fim(`e2e-91 (edição campo a campo e caixa de sugestões)${rcsi ? " (RCSI)" : ""}`);
  L.shimEncerrar();
}

if (process.argv[2] === "filho") filho(); else principal().catch((e) => { console.log("ERRO", e.message, e.stack); fim("e2e-91 (abortado)"); L.shimEncerrar(); });
