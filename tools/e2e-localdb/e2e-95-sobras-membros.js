// e2e-95-sobras-membros.js — AS SOBRAS DE MEMBROS (FASE 10, 19/11/2026), contra o SQL Server de verdade. Parte 1: ONDE A PESSOA SERVE (migração 181): registrar
// um ministério (só os do catálogo que não são departamento, ativos), não duplicar, a data que não pode ser no futuro, encerrar (nada se apaga), listar, o escopo
// (fora = não existe), sem sessão e sem permissão, e juntar fichas com as duas servindo no mesmo ministério.
// Parte 2: O ANEXO DA SUGESTÃO (migração 182). Parte 3: A PESSOA COMPLETA O PRÓPRIO CADASTRO PELO E-MAIL (migração 183). Roda sobre a base cenario-183
// (`bash rodar.sh preparar-183` e depois `BASE=cenario-183 bash rodar.sh roteiro e2e-95-sobras-membros.js`); monta o próprio cenário.
process.env.AUTH_SECRET = "segredo-das-sobras-de-membros-" + "x".repeat(24);
const L = require("./lib");
const { ok, fim, q, escalar, obterPool } = L;

const PERM = ["pessoas"];
const fator = () => ({ via: "CHAVE", em: Date.now() });
const C = { VN: "Vila Nova E2E95", CJ: "Cidade Jardim E2E95" };
const tok = {
  geral: () => L.sessao(9501, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM }),
  vn: () => L.sessao(9502, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [C.VN], permissoes: PERM }),
  cj: () => L.sessao(9503, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [C.CJ], permissoes: PERM }),
  semPessoas: () => L.sessao(9504, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["reunioes"] })
};

async function principal() {
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  const M = (token, membroId, { metodo = "GET", acao, corpo } = {}) =>
    chamarRota("MinisteriosPessoa/index.js", { metodo, token, binding: { membroId: String(membroId), acao }, corpo: corpo || {} });

  console.log("== a migração 181 ==");
  ok(await escalar("SELECT COUNT(*) FROM sys.tables WHERE name = 'MembrosMinisterios'") === 1, "a tabela nova");
  ok(await escalar("SELECT COUNT(*) FROM sys.indexes WHERE name = 'UX_MembrosMinisterios_Aberto' AND has_filter = 1") === 1, "o índice único filtrado (um em aberto por pessoa e ministério)");

  console.log("== o cenário ==");
  const area = (await q("INSERT INTO Areas (Nome) VALUES (N'Área E2E95'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const cong = {};
  for (const [k, nome] of [["VN", C.VN], ["CJ", C.CJ]]) cong[k] = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (@n, @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: nome, a: area }))[0].id;
  let nDep = 0;
  const novoDep = async (nome, tipo, ativo = 1) => (await q("INSERT INTO Departamentos (Sigla, Nome, Tipo, Ativo) VALUES (@s, @n, @t, @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { s: `E2E95-${++nDep}`, n: nome, t: tipo, a: ativo }))[0].id;
  const infantil = await novoDep("Ministério Infantil E2E95", "SECRETARIA_ADJUNTA");
  const louvor = await novoDep("Ministério de Louvor E2E95", "SECRETARIA_ADJUNTA");
  const parado = await novoDep("Ministério Parado E2E95", "SECRETARIA_ADJUNTA", 0);
  const depIdade = await novoDep("União de Teste E2E95", "DEPARTAMENTO");
  const ficha = (id, nome, c, criado) => q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, CriadoEm)
    VALUES (@id, @n, @c, N'ATIVO', N'EM_COMUNHAO', '1990-03-14', @cr)`, { id, n: nome, c, cr: criado || "2020-01-01" });
  await ficha(950001, "Ana Serve", cong.VN);
  await ficha(950002, "Bia de Outra", cong.CJ);
  await ficha(950003, "Caio Repetido", cong.VN, "2012-01-01");
  await ficha(950004, "CAIO REPETIDO", cong.VN, "2026-01-01");
  ok((await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId BETWEEN 950001 AND 950004")) === 4, "4 pessoas");

  console.log("== registrar ==");
  const r1 = await M(tok.vn(), 950001, { metodo: "POST", corpo: { departamentoId: infantil, desde: "2019-02-10" } });
  ok(r1.status === 201 && /Ministério Infantil/.test(r1.body.mensagem), "registra o ministério com a data", JSON.stringify(r1.body));
  const r2 = await M(tok.vn(), 950001, { metodo: "POST", corpo: { departamentoId: infantil } });
  ok(r2.status === 201 && r2.body.jaEstava === true && (await escalar("SELECT COUNT(*) FROM MembrosMinisterios WHERE MembroId = 950001 AND EncerradoEm IS NULL")) === 1, "registrar de novo não duplica", JSON.stringify(r2.body));
  const r3 = await M(tok.vn(), 950001, { metodo: "POST", corpo: { departamentoId: louvor } });
  ok(r3.status === 201, "um segundo ministério");
  const rDep = await M(tok.vn(), 950001, { metodo: "POST", corpo: { departamentoId: depIdade } });
  const rParado = await M(tok.vn(), 950001, { metodo: "POST", corpo: { departamentoId: parado } });
  const rNada = await M(tok.vn(), 950001, { metodo: "POST", corpo: { departamentoId: 99999999 } });
  const rLixo = await M(tok.vn(), 950001, { metodo: "POST", corpo: { departamentoId: "1 OR 1=1" } });
  const rFuturo = await M(tok.vn(), 950001, { metodo: "POST", corpo: { departamentoId: louvor, desde: "2999-01-01" } });
  const rData = await M(tok.vn(), 950001, { metodo: "POST", corpo: { departamentoId: louvor, desde: "10/02/2019" } });
  ok([rDep, rParado, rNada, rLixo, rFuturo, rData].every((r) => r.status === 422) && /Departamento/.test(rDep.body.mensagem), "departamento (pela idade), ministério parado, que não existe, lixo, data no futuro e data fora do formato: recusados",
    JSON.stringify([rDep.status, rParado.status, rNada.status, rLixo.status, rFuturo.status, rData.status]));

  console.log("== listar e encerrar ==");
  const l1 = await M(tok.vn(), 950001);
  const lista = (l1.body && l1.body.ministerios) || [];
  ok(l1.status === 200 && lista.length === 2 && lista.every((x) => x.ativo) && lista.find((x) => x.departamentoId === infantil).desde === "2019-02-10", "a lista com os dois, a data de quando começou", JSON.stringify(lista));
  const idInf = lista.find((x) => x.departamentoId === infantil).id;
  const enc = await M(tok.vn(), 950001, { metodo: "POST", acao: "encerrar", corpo: { id: idInf } });
  ok(enc.status === 200 && (await escalar("SELECT COUNT(*) FROM MembrosMinisterios WHERE MembroMinisterioId = @id AND EncerradoEm IS NOT NULL AND EncerradoPor = 9502", { id: idInf })) === 1, "encerrar guarda a data e quem (nada se apaga)");
  const enc2 = await M(tok.vn(), 950001, { metodo: "POST", acao: "encerrar", corpo: { id: idInf } });
  ok(enc2.status === 404, "encerrar de novo: 404 (já encerrado)", String(enc2.status));
  const l2 = (await M(tok.vn(), 950001)).body.ministerios;
  ok(l2.length === 2 && l2[0].ativo && !l2[1].ativo && l2[1].departamentoId === infantil, "a lista mostra o encerrado embaixo, para a história", JSON.stringify(l2));
  const deNovo = await M(tok.vn(), 950001, { metodo: "POST", corpo: { departamentoId: infantil } });
  ok(deNovo.status === 201 && !deNovo.body.jaEstava, "voltar a servir depois de encerrar: registro novo");
  const encOutro = await M(tok.vn(), 950001, { metodo: "POST", acao: "encerrar", corpo: { id: 99999999 } });
  ok(encOutro.status === 404, "encerrar um registro que não é desta pessoa: 404");

  console.log("== escopo e acesso ==");
  const fora = await M(tok.vn(), 950002);
  const foraPost = await M(tok.vn(), 950002, { metodo: "POST", corpo: { departamentoId: infantil } });
  const naoExiste = await M(tok.vn(), 99999999);
  ok(fora.status === 404 && foraPost.status === 404 && naoExiste.status === 404 && (await escalar("SELECT COUNT(*) FROM MembrosMinisterios WHERE MembroId = 950002")) === 0, "outra congregação e matrícula que não existe: 404 igual, nada gravado");
  const geral = await M(tok.geral(), 950002, { metodo: "POST", corpo: { departamentoId: louvor } });
  ok(geral.status === 201, "a Geral registra em qualquer congregação");
  const semSessao = await M(null, 950001);
  const semPerm = await M(tok.semPessoas(), 950001);
  ok(semSessao.status === 401 && semPerm.status === 403, "sem sessão 401, sem a permissão 403", JSON.stringify([semSessao.status, semPerm.status]));
  const estranha = await M(tok.vn(), 950001, { metodo: "POST", acao: "apagar", corpo: {} });
  ok(estranha.status === 404, "ação estranha: 404");

  console.log("== juntar fichas com as duas servindo no mesmo ministério ==");
  await M(tok.vn(), 950003, { metodo: "POST", corpo: { departamentoId: louvor } });
  await M(tok.vn(), 950004, { metodo: "POST", corpo: { departamentoId: louvor } });
  await M(tok.vn(), 950004, { metodo: "POST", corpo: { departamentoId: infantil } });
  await q("INSERT INTO FichasPendencias (MembroId, Tipo, OutroMembroId, Origem) VALUES (950004, N'REPETIDA', 950003, N'MARCADA')");
  const comp = await chamarRota("FichasRepetidas/index.js", { metodo: "GET", token: tok.vn(), binding: { acao: "comparar" }, query: { a: 950003, b: 950004 } });
  const junta = await chamarRota("FichasRepetidas/index.js", { metodo: "POST", token: tok.vn(), binding: { acao: "juntar" }, corpo: { a: 950003, b: 950004, escolhas: {}, versao: comp.body && comp.body.versao } });
  ok(junta.status === 200, "a junção passa (o mesmo ministério nas duas não bloqueia)", JSON.stringify(junta.body).slice(0, 200));
  const depois = (await M(tok.vn(), 950003)).body.ministerios || [];
  ok(depois.filter((x) => x.ativo).map((x) => x.departamentoId).sort().join() === [infantil, louvor].sort().join(), "a que fica serve nos dois (o repetido foi para o arquivo, o outro veio junto)", JSON.stringify(depois));


  console.log("== parte 2: o anexo da sugestão (migração 182) ==");
  ok(await escalar("SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SolicitacoesEdicaoPessoa') AND name IN ('AnexoNome', 'AnexoTipo')") === 2, "as duas colunas novas");
  await ficha(950005, "Eva Sugere", cong.VN);
  await q("UPDATE MembroReferencia SET DataBatismo = '2010-05-05' WHERE MembroId = 950005");
  const tokEva = () => L.sessao(950005, { via: "SENHA", fator: fator(), nivel: "MEMBRO", escopoCongregacoes: [], permissoes: [] });
  const S = (corpo) => chamarRota("SolicitarEdicaoPessoa/index.js", { metodo: "POST", token: tokEva(), binding: { matricula: "950005" }, corpo });
  const pngCab = (() => { const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0); b.writeUInt32BE(13, 8); b.write("IHDR", 12, "ascii"); b.writeUInt32BE(800, 16); b.writeUInt32BE(600, 20); return b.toString("base64"); })();
  const campos = { dataBatismo: "2011-06-12" };
  const conta = async () => Number(await escalar("SELECT COUNT(*) FROM SolicitacoesEdicaoPessoa WHERE MembroId = 950005"));
  const aTxt = await S({ campos, anexo: { tipo: "text/plain", base64: Buffer.from("oi").toString("base64") } });
  const aFalso = await S({ campos, anexo: { tipo: "image/png", base64: Buffer.from("<script>x</script>").toString("base64") } });
  const aPdfFalso = await S({ campos, anexo: { tipo: "application/pdf", base64: Buffer.from("não é pdf").toString("base64") } });
  const aGrande = await S({ campos, anexo: { tipo: "image/png", base64: "A".repeat(7100000) } });
  const aLixo = await S({ campos, anexo: "x" });
  ok([aTxt, aFalso, aPdfFalso, aGrande, aLixo].every((r) => r.status === 400) && (await conta()) === 0, "anexo de outro tipo, conteúdo que não confere, PDF falso, grande demais e lixo: 400 e nenhuma sugestão criada",
    JSON.stringify([aTxt.status, aFalso.status, aPdfFalso.status, aGrande.status, aLixo.status]));
  const aBom = await S({ campos, anexo: { tipo: "image/png", base64: pngCab } });
  ok((aBom.status === 201 && (await conta()) === 1) || (aBom.status === 503 && (await conta()) === 0), "anexo bom: a sugestão sai com ele — ou, sem o armazenamento aqui, 503 e NADA enviado", JSON.stringify([aBom.status, aBom.body && aBom.body.mensagem]));
  if (aBom.status === 503) {
    const semAnexo = await S({ campos });
    ok(semAnexo.status === 201 && (await conta()) === 1, "a sugestão sem anexo continua funcionando", JSON.stringify(semAnexo.body));
  }
  const sid = await escalar("SELECT TOP 1 SolicitacaoId FROM SolicitacoesEdicaoPessoa WHERE MembroId = 950005 ORDER BY SolicitacaoId DESC");
  await q("UPDATE SolicitacoesEdicaoPessoa SET AnexoNome = N'sug-1763500000000-abc123', AnexoTipo = N'image/png' WHERE SolicitacaoId = @s", { s: sid });
  const Fa = (token, id, acao, extra = {}) => chamarRota("GestaoFilaAprovacoes/index.js", { metodo: extra.metodo || "GET", token, binding: { solicitacaoId: String(id), acao }, corpo: extra.corpo, query: extra.query || {} });
  const verVn = await Fa(tok.vn(), sid, "anexo");
  ok(verVn.status === 200 && /sug-1763500000000-abc123/.test(verVn.body.url) && verVn.body.tipo === "image/png", "a secretaria da congregação vê o documento (endereço assinado)", JSON.stringify(verVn.body).slice(0, 160));
  const verCj = await Fa(tok.cj(), sid, "anexo");
  const verNada = await Fa(tok.vn(), 99999999, "anexo");
  const verLixo = await Fa(tok.vn(), "abc", "anexo");
  ok(verCj.status === 404 && verNada.status === 404 && verLixo.status === 404, "outra congregação, sugestão que não existe e lixo: 404 igual", JSON.stringify([verCj.status, verNada.status, verLixo.status]));
  const verEva = await chamarRota("GestaoFilaAprovacoes/index.js", { metodo: "GET", token: tokEva(), binding: { solicitacaoId: String(sid), acao: "anexo" } });
  ok(verEva.status === 403, "o membro (sem a permissão de secretaria) não abre a caixa", String(verEva.status));
  const minhas = await chamarRota("SolicitarEdicaoPessoa/index.js", { metodo: "GET", token: tokEva(), binding: { matricula: "950005" } });
  ok(Array.isArray(minhas.body) && minhas.body.some((x) => x.solicitacaoId === sid && x.temAnexo === true), "o membro vê que a sugestão foi com anexo", JSON.stringify(minhas.body).slice(0, 200));
  const caixa = await chamarRota("GestaoFilaAprovacoes/index.js", { metodo: "GET", token: tok.vn(), binding: {} });
  ok(Array.isArray(caixa.body) && caixa.body.some((x) => x.solicitacaoId === sid && x.temAnexo === true), "a caixa mostra que tem anexo", JSON.stringify(caixa.body).slice(0, 200));
  await q("UPDATE SolicitacoesEdicaoPessoa SET AnexoNome = N'doc-1763500000000-abc123' WHERE SolicitacaoId = @s", { s: sid });
  const verOutro = await Fa(tok.vn(), sid, "anexo");
  ok(verOutro.status === 404, "um nome que não é de anexo de sugestão (doc-...) nunca vira endereço", String(verOutro.status));
  await q("UPDATE SolicitacoesEdicaoPessoa SET AnexoNome = N'sug-1763500000000-abc123' WHERE SolicitacaoId = @s", { s: sid });
  const campoId = await escalar("SELECT TOP 1 CampoId FROM SolicitacoesEdicaoCampos WHERE SolicitacaoId = @s", { s: sid });
  const dec = await Fa(tok.vn(), sid, "decidir", { metodo: "POST", corpo: { decisoes: [{ campoId, decisao: "REJEITADO", motivo: "A certidão não confere com a data." }] } });
  ok(dec.status === 200 && (await escalar("SELECT Status FROM SolicitacoesEdicaoPessoa WHERE SolicitacaoId = @s", { s: sid })) === "CONCLUIDA"
    && (await escalar("SELECT COUNT(*) FROM SolicitacoesEdicaoPessoa WHERE SolicitacaoId = @s AND AnexoNome IS NULL AND AnexoTipo IS NULL", { s: sid })) === 1,
  "decidida a sugestão, o documento sai (as colunas voltam a vazio)", JSON.stringify(dec.body));
  const depoisDec = await Fa(tok.vn(), sid, "anexo");
  ok(depoisDec.status === 404, "depois de decidida, o anexo não abre mais", String(depoisDec.status));


  console.log("== parte 3: a pessoa completa o próprio cadastro pelo e-mail (migração 183) ==");
  ok(await escalar("SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PreCadastros') AND name LIKE 'PedidoPessoa%'") === 5, "as cinco colunas novas");
  const pessoaPre = require("../../api/shared/preCadastroPessoa");
  const pdbPre = require("../../api/shared/preCadastroDb");
  const pool = await obterPool();
  const novoPre = async (nome, extra = {}) => {
    const id = (await q(`INSERT INTO PreCadastros (Origem, CongregacaoId, Nome, Cpf, Email, DataNascimento, Sexo, EstadoCivil, Situacao)
      VALUES (N'SITE', @c, @n, @cpf, @e, @nasc, @sexo, @ec, N'PENDENTE'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`,
      { c: cong.VN, n: nome, cpf: extra.cpf || null, e: extra.email === undefined ? "pessoa@exemplo.org" : extra.email, nasc: extra.nasc || null, sexo: extra.sexo || "F", ec: extra.ec || "SOLTEIRO" }))[0].id;
    await pdbPre.processar(pool, id);
    return id;
  };
  const cpfDe = (base9) => { const d = String(base9).padStart(9, "0").split("").map(Number); const dv = (a) => { const n = a.length + 1; const s2 = a.reduce((x, y, i) => x + y * (n - i), 0); const r = (s2 * 10) % 11; return r === 10 ? 0 : r; }; const d1 = dv(d); const d2 = dv([...d, d1]); return [...d, d1, d2].join(""); };
  const pre1 = await novoPre("Fernanda Completa Sozinha");
  ok((await escalar("SELECT Pendencias FROM PreCadastros WHERE PreCadastroId = @id", { id: pre1 })).includes("FALTA_CPF"), "o pré-cadastro chegou sem CPF e sem nascimento (fica na fila)");
  const P = (token, id, acao, corpo) => chamarRota("PreCadastros/index.js", { metodo: "POST", token, binding: { id: String(id), acao }, corpo: corpo || {} });
  const viaRota = await P(tok.vn(), pre1, "pedir-pessoa");
  const colunas = async (id) => (await q("SELECT PedidoPessoaEm, PedidoPessoaTokenHash, PedidoPessoaExpiraEm FROM PreCadastros WHERE PreCadastroId = @id", { id }))[0];
  const c1 = await colunas(pre1);
  ok((viaRota.status === 200 && c1.PedidoPessoaTokenHash) || (viaRota.status === 503 && !c1.PedidoPessoaEm && !c1.PedidoPessoaTokenHash),
    "pedir pela rota: o e-mail sai — ou, sem o serviço de e-mail aqui, 503 e o pedido NÃO vale (nada fica pela metade)", JSON.stringify([viaRota.status, viaRota.body && viaRota.body.mensagem]));
  const preSemEmail = await novoPre("Sem E-mail Nenhum", { email: null });
  const semEmail = await P(tok.vn(), preSemEmail, "pedir-pessoa");
  ok(semEmail.status === 200 && semEmail.body.sucesso === false && /não tem e-mail/.test(semEmail.body.mensagem), "sem e-mail: não dá para pedir à pessoa", JSON.stringify(semEmail.body));
  const foraCj = await P(tok.cj(), pre1, "pedir-pessoa");
  ok(foraCj.body && foraCj.body.sucesso === false, "outra congregação não pede (não existe para ela)", JSON.stringify(foraCj.body));
  const ped = await pessoaPre.pedir(pool, { id: pre1, por: 9502 });
  const c2 = await colunas(pre1);
  ok(ped.sucesso && /^[A-Za-z0-9_-]{32}$/.test(ped.token) && c2.PedidoPessoaTokenHash && c2.PedidoPessoaTokenHash !== ped.token && !String(c2.PedidoPessoaTokenHash).includes(ped.token),
    "o pedido guarda só o resumo do código (nunca o código)", JSON.stringify({ falta: ped.falta }));
  const dias = (new Date(c2.PedidoPessoaExpiraEm) - Date.now()) / 86400000;
  ok(dias > 6.9 && dias < 7.1, "o link vale 7 dias", String(dias));
  ok(/vale 7 dias e uma vez só/.test(pessoaPre.textoDoEmail({ nome: "Fernanda X", falta: ped.falta, url: "https://exemplo/x" })) && /Graça e paz, Fernanda!/.test(pessoaPre.textoDoEmail({ nome: "Fernanda X", falta: ped.falta, url: "x" })), "o texto do e-mail");
  const listaPre = await chamarRota("PreCadastros/index.js", { metodo: "GET", token: tok.vn(), binding: {}, query: {} });
  const naFila = ((listaPre.body && listaPre.body.itens) || []).find((x) => x.preCadastroId === pre1);
  ok(naFila && naFila.pedidoPessoa && naFila.pedidoPessoa.vencido === false, "na esteira: esperando a pessoa (a coluna \"a pessoa completa\")", JSON.stringify(naFila && naFila.pedidoPessoa));
  const Cc = (codigo, metodo = "GET", corpo) => chamarRota("CompletarCadastro/index.js", { metodo, binding: { codigo }, corpo, headers: { "x-forwarded-for": "203.0.113.95, 10.0.0.1" } });
  const g1 = await Cc(ped.token);
  ok(g1.status === 200 && g1.body.nome === "Fernanda" && JSON.stringify(g1.body.falta) === JSON.stringify(["cpf", "dataNascimento"]) && !JSON.stringify(g1.body).includes("@"),
    "a página pública vê só o primeiro nome e o que falta (nunca o e-mail)", JSON.stringify(g1.body));
  const gErrado = await Cc("A".repeat(32));
  const gLixo = await Cc("'; DROP TABLE PreCadastros; --");
  ok(gErrado.status === 404 && gLixo.status === 404 && gErrado.body.mensagem === gLixo.body.mensagem, "código errado e lixo: 404 com a mesma frase", JSON.stringify([gErrado.status, gLixo.status]));
  const pFalta = await Cc(ped.token, "POST", { cpf: cpfDe(950000099) });
  const pCpf = await Cc(ped.token, "POST", { cpf: "11111111111", dataNascimento: "1995-05-05" });
  const pFuturo = await Cc(ped.token, "POST", { cpf: cpfDe(950000099), dataNascimento: "2999-01-01" });
  ok(pFalta.status === 422 && /data de nascimento/.test(pFalta.body.mensagem) && pCpf.status === 422 && pFuturo.status === 422, "faltou um campo, CPF inválido, data no futuro: 422 (o link continua valendo)",
    JSON.stringify([pFalta.status, pCpf.status, pFuturo.status]));
  ok((await Cc(ped.token)).status === 200, "depois dos erros, o link ainda abre");
  const pBom = await Cc(ped.token, "POST", { cpf: cpfDe(950000099), dataNascimento: "1995-05-05", sexo: "M", nome: "Outro Nome", congregacaoId: cong.CJ, email: "outro@x.org" });
  const preDepois = (await q("SELECT Situacao, Nome, Sexo, CongregacaoId, Email, MembroIdResultado, PedidoPessoaTokenHash, PedidoPessoaRespondidoEm FROM PreCadastros WHERE PreCadastroId = @id", { id: pre1 }))[0];
  ok(pBom.status === 200 && /Recebemos/.test(pBom.body.mensagem) && preDepois.PedidoPessoaTokenHash === null && preDepois.PedidoPessoaRespondidoEm,
    "a pessoa completa: resposta de sucesso e o link deixa de valer", JSON.stringify(pBom.body));
  ok(preDepois.Nome === "Fernanda Completa Sozinha" && preDepois.Sexo === "F" && preDepois.CongregacaoId === cong.VN && preDepois.Email === "pessoa@exemplo.org",
    "ela só muda o que faltava: o nome, o sexo, a congregação e o e-mail que mandou a mais foram ignorados", JSON.stringify(preDepois));
  ok(preDepois.Situacao === "ACEITO" && preDepois.MembroIdResultado, "completo e sem repetição: entrou sozinho na hora (a matrícula nasceu)", JSON.stringify([depois.Situacao, preDepois.MembroIdResultado]));
  ok((await Cc(ped.token, "POST", { cpf: cpfDe(950000098), dataNascimento: "1995-05-05" })).status === 404 && (await Cc(ped.token)).status === 404, "o link usado não vale de novo (404)");
  // o vencido
  const pre2 = await novoPre("Gustavo Vencido");
  const ped2 = await pessoaPre.pedir(pool, { id: pre2, por: 9502 });
  await q("UPDATE PreCadastros SET PedidoPessoaExpiraEm = DATEADD(minute, -1, SYSUTCDATETIME()) WHERE PreCadastroId = @id", { id: pre2 });
  ok((await Cc(ped2.token)).status === 404 && (await Cc(ped2.token, "POST", { cpf: cpfDe(950000097), dataNascimento: "1990-01-01" })).status === 404, "o link vencido não abre nem grava");
  const lista2 = await chamarRota("PreCadastros/index.js", { metodo: "GET", token: tok.vn(), binding: {}, query: {} });
  ok((((lista2.body && lista2.body.itens) || []).find((x) => x.preCadastroId === pre2) || {}).pedidoPessoa?.vencido === true, "na esteira, o pedido vencido volta para a secretaria");
  // o CPF que já é de uma ficha: a resposta é a mesma (não revela), e o pré-cadastro vai para a correção
  await q("UPDATE MembroReferencia SET Cpf = @c WHERE MembroId = 950001", { c: cpfDe(950000096) });
  const pre3 = await novoPre("Helena Repetida");
  const ped3 = await pessoaPre.pedir(pool, { id: pre3, por: 9502 });
  const p3 = await Cc(ped3.token, "POST", { cpf: cpfDe(950000096), dataNascimento: "1990-01-01" });
  ok(p3.status === 200 && p3.body.mensagem === pBom.body.mensagem && (await escalar("SELECT Situacao FROM PreCadastros WHERE PreCadastroId = @id", { id: pre3 })) === "CORRECAO",
    "CPF que já tem ficha: a pessoa recebe a MESMA resposta e o pré-cadastro vai para a correção", JSON.stringify(p3.body));
  const pedNada = await pessoaPre.pedir(pool, { id: pre1, por: 9502 });
  ok(!pedNada.sucesso, "pedir para um pré-cadastro já aceito: recusado");

  fim("e2e-95 (as sobras de Membros no banco)");
  L.shimEncerrar();
}

principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
