// e2e-95-sobras-membros.js — AS SOBRAS DE MEMBROS (FASE 10, 19/11/2026), contra o SQL Server de verdade. Parte 1: ONDE A PESSOA SERVE (migração 181): registrar
// um ministério (só os do catálogo que não são departamento, ativos), não duplicar, a data que não pode ser no futuro, encerrar (nada se apaga), listar, o escopo
// (fora = não existe), sem sessão e sem permissão, e juntar fichas com as duas servindo no mesmo ministério.
// Parte 2: O ANEXO DA SUGESTÃO (migração 182). Parte 3: A PESSOA COMPLETA O PRÓPRIO CADASTRO PELO E-MAIL (migração 183). Parte 4: o que o "Quero me cadastrar"
// do site lê. Parte 5 (21/11/2026, migração 184): AS PENDÊNCIAS DA REVISÃO DE 20/11 no envio do site — (a) o tempo da resposta igual com e sem ficha (medido),
// (b) as rajadas em vários processos não passam dos limites, (c) o mesmo envio repetido não grava dois e o que ficou sem avaliar é avaliado no reenvio,
// (d) o texto e a versão do consentimento do mesmo lugar. Parte 6 (22/11/2026): O BANCO LENTO — a resposta nunca passa do tempo fixo; o processamento que não
// cabe é desfeito (o pré-cadastro fica na fila sem avaliar), a gravação que não cabe é desfeita ("envie de novo"). Roda sobre a base cenario-184 (`bash rodar.sh preparar-184` e depois
// `BASE=cenario-184 bash rodar.sh roteiro e2e-95-sobras-membros.js`); monta o próprio cenário.
// Desde 23/11/2026 (a trava das matrículas) semeia uma importação do sistema pago CONCLUÍDA: rode sobre a cenario-185 (`bash rodar.sh preparar-185`).
process.env.AUTH_SECRET = "segredo-das-sobras-de-membros-" + "x".repeat(24);
process.env.CHAVE_SITE_SISTEMA = "chave-e2e-do-site-sobras";
const { spawn } = require("child_process");
const crypto = require("crypto");
const L = require("./lib");
const { ok, fim, q, escalar, obterPool, path } = L;

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
  await L.importacaoConcluida();   // a trava das matrículas (23/11/2026): este roteiro cadastra gente, então roda depois da importação do sistema pago
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


  console.log("== parte 4: o que o \"Quero me cadastrar\" do site lê (as congregações e a versão do consentimento) ==");
  const Sg = (headers) => chamarRota("PreCadastroSite/index.js", { metodo: "GET", headers });
  const semChave = await Sg({});
  const chaveErrada = await Sg({ "x-site-key": "errada" });
  ok(semChave.status === 401 && chaveErrada.status === 401, "sem a chave do site ou com a errada: 401", JSON.stringify([semChave.status, chaveErrada.status]));
  const lida = await Sg({ "x-site-key": process.env.CHAVE_SITE_SISTEMA });
  const congsSite = (lida.body && lida.body.congregacoes) || [];
  ok(lida.status === 200 && congsSite.some((c) => c.congregacaoId === cong.VN && c.nome === C.VN && c.area === "Área E2E95") && lida.body.consentimento.versao === require("../../api/shared/preCadastro").CONSENTIMENTO.versao,
    "com a chave: as congregações ativas (com a área) e a versão do consentimento", JSON.stringify(congsSite.slice(0, 2)));
  ok(!JSON.stringify(lida.body).match(/Fernanda|950001|exemplo\.org/), "a lista não traz gente nenhuma");
  await q("UPDATE Congregacoes SET Ativa = 0 WHERE CongregacaoId = @c", { c: cong.CJ });
  const semInativa = ((await Sg({ "x-site-key": process.env.CHAVE_SITE_SISTEMA })).body.congregacoes || []);
  ok(!semInativa.some((c) => c.congregacaoId === cong.CJ), "a congregação desativada some da lista");


  console.log("== parte 5: as pendências da revisão de 20/11 no envio do site (migração 184) ==");
  ok(await escalar("SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PreCadastros') AND name = 'EnvioId'") === 1
    && await escalar("SELECT COUNT(*) FROM sys.indexes WHERE name = 'UX_PreCadastros_Envio' AND is_unique = 1 AND has_filter = 1") === 1
    && await escalar("SELECT COUNT(*) FROM sys.check_constraints WHERE name = 'CK_PreCadastros_Envio'") === 1, "a coluna EnvioId, o índice único filtrado e o CHECK do formato");
  const regrasPre = require("../../api/shared/preCadastro");
  const SITE = { "x-site-key": process.env.CHAVE_SITE_SISTEMA };
  let nVisitante = 0;
  const corpoSite = (extra = {}) => ({ nome: "Pessoa do Site E2E95", cpf: cpfDe(950000300), email: "site95@example.org", dataNascimento: "1991-04-20", sexo: "F",
    estadoCivil: "SOLTEIRO", congregacaoId: cong.VN, consentimento: { aceito: true, versao: regrasPre.CONSENTIMENTO.versao },
    origemVisitante: `e2e95-${Date.now()}-${++nVisitante}`, envioId: crypto.randomBytes(16).toString("hex"), ...extra });
  const site = (corpo) => chamarRota("PreCadastroSite/index.js", { metodo: "POST", corpo, headers: SITE });
  const doEnvio = (e) => q("SELECT PreCadastroId, Situacao, Pendencias, MembroIdResultado, ConsentimentoVersao FROM PreCadastros WHERE EnvioId = @e", { e });
  const fichasDoCpf = (c) => escalar("SELECT COUNT(*) FROM MembroReferencia WHERE Cpf = @c", { c });
  const RECEBIDO = regrasPre.MSG.RECEBIDO;

  console.log("-- (d) o consentimento: o texto e a versão do mesmo lugar");
  const termo = (await chamarRota("PreCadastroSite/index.js", { metodo: "GET", headers: SITE })).body.consentimento;
  ok(termo && termo.versao === regrasPre.CONSENTIMENTO.versao && termo.texto === "Autorizo a Igreja a guardar estes dados para o cadastro de membros. Veja a política de privacidade.",
    "o GET serve o texto (o mesmo que a página mostrava, letra por letra) e a versão", JSON.stringify(termo));
  const velha = await site(corpoSite({ cpf: cpfDe(950000301), consentimento: { aceito: true, versao: "2025-01" } }));
  ok(velha.status === 400 && /recarregue/.test(velha.body.mensagem) && (await escalar("SELECT COUNT(*) FROM PreCadastros WHERE Cpf = @c", { c: cpfDe(950000301) })) === 0,
    "a versão que não é a atual: 400 'recarregue', nada gravado", JSON.stringify(velha.body));
  const semEnvio = await site({ ...corpoSite({ cpf: cpfDe(950000301) }), envioId: undefined });
  ok(semEnvio.status === 400 && /recarregue/.test(semEnvio.body.mensagem), "sem o identificador do envio: 400 'recarregue'", JSON.stringify(semEnvio.body));

  console.log("-- (a) o tempo da resposta: sem ficha (entra sozinho), com ficha (correção) e nome parecido (fila)");
  await q("UPDATE MembroReferencia SET Cpf = @c WHERE MembroId = 950002", { c: cpfDe(950000302) });   // a ficha (noutra congregação) que o CPF vai achar
  await ficha(950010, "Paula Parecida E2E95", cong.VN);                                                // nascida em 14/03/1990
  const medir = async (corpo) => { const t = Date.now(); const r = await site(corpo); return { ms: Date.now() - t, status: r.status, mensagem: r.body && r.body.mensagem, envio: corpo.envioId }; };
  let iSem = 0, iPar = 0;
  const DATAS = ["1971-01-11", "1972-02-12", "1973-03-13", "1974-04-14", "1975-05-15", "1976-06-16", "1977-07-17", "1978-08-18", "1979-09-19", "1980-10-20"];
  const NOMES = ["Abel", "Bento", "Caio", "Davi", "Elias", "Fabio", "Gael", "Hugo", "Igor", "Joel"];
  // 10 pessoas novas (5 em cada rodada), cada uma com um nascimento diferente: nenhuma parece com outra
  const semFicha = () => { const i = iSem++; return medir(corpoSite({ nome: `Sem Ficha ${NOMES[i]}`, cpf: cpfDe(950000400 + i), dataNascimento: DATAS[i] })); };
  const comFicha = () => medir(corpoSite({ nome: "Bia Tentativa E2E95", cpf: cpfDe(950000302) }));
  const parecido = () => medir(corpoSite({ nome: "Paula Parecida E2E95", cpf: cpfDe(950000450 + iPar++), dataNascimento: "1990-03-14" }));
  const rodada = async () => { const r = { semFicha: [], comFicha: [], parecido: [] }; for (let i = 0; i < 5; i++) { r.semFicha.push(await semFicha()); r.comFicha.push(await comFicha()); r.parecido.push(await parecido()); } return r; };
  const resumo = (xs) => { const v = xs.map((x) => x.ms).sort((a, b) => a - b); return { min: v[0], mediana: v[Math.floor(v.length / 2)], max: v[v.length - 1] }; };
  process.env.PRE_CADASTRO_SITE_MIN_MS = "0";   // SEM o tempo fixo: o que vazaria
  const sem = await rodada();
  delete process.env.PRE_CADASTRO_SITE_MIN_MS;  // COM o tempo fixo (o padrão, 3.000 ms)
  const com = await rodada();
  console.log("   tempos em ms SEM o tempo fixo (o processamento puro):", JSON.stringify({ semFicha: resumo(sem.semFicha), comFicha: resumo(sem.comFicha), parecido: resumo(sem.parecido) }));
  console.log("   tempos em ms COM o tempo fixo:                       ", JSON.stringify({ semFicha: resumo(com.semFicha), comFicha: resumo(com.comFicha), parecido: resumo(com.parecido) }));
  const situacaoDe = async (lista) => [...new Set(await Promise.all(lista.map(async (x) => ((await doEnvio(x.envio))[0] || {}).Situacao)))].join();
  ok(await situacaoDe([...sem.semFicha, ...com.semFicha]) === "ACEITO" && await situacaoDe([...sem.comFicha, ...com.comFicha]) === "CORRECAO"
    && await situacaoDe([...sem.parecido, ...com.parecido]) === "PENDENTE", "os três caminhos de verdade: sem ficha entrou sozinho, com ficha foi à correção, o parecido ficou na fila");
  const todosCom = [...com.semFicha, ...com.comFicha, ...com.parecido];
  ok([...todosCom, ...sem.semFicha, ...sem.comFicha, ...sem.parecido].every((x) => x.status === 200 && x.mensagem === RECEBIDO), "as 30 respostas: o mesmo 200 'recebemos'");
  ok(todosCom.every((x) => x.ms >= 2990 && x.ms < 3400), "com o tempo fixo, as 15 respostas saem nos 3.000 ms (entre 2.990 e 3.400)", JSON.stringify(todosCom.map((x) => x.ms)));
  const medianas = [resumo(com.semFicha).mediana, resumo(com.comFicha).mediana, resumo(com.parecido).mediana];
  ok(Math.max(...medianas) - Math.min(...medianas) < 60, "…e as medianas das três situações a menos de 60 ms uma da outra", JSON.stringify(medianas));
  const pior = Math.max(...[...sem.semFicha, ...sem.comFicha, ...sem.parecido].map((x) => x.ms));
  ok(pior < 2700, "o pior processamento medido (sem o tempo fixo) cabe com folga nos 3.000 ms", `${pior} ms`);

  console.log("-- (b) rajadas em vários processos: a contagem e a gravação na mesma trava");
  const visitanteRajada = `rajada-${Date.now()}`;
  const rb1 = await disparar(Array.from({ length: 8 }, (_, i) => ({ corpo: corpoSite({ nome: `Rajada Visitante ${NOMES[i]} E2E95`, cpf: cpfDe(950000500 + i), dataNascimento: DATAS[i],
    origemVisitante: visitanteRajada }) }))).promessa;
  const doVisitante = await escalar("SELECT COUNT(*) FROM PreCadastros WHERE OrigemHash = @h", { h: pdbPre.hashOrigem(visitanteRajada) });
  ok(rb1.every((r) => r.ok) && rb1.filter((r) => r.status === 200).length === 3 && rb1.filter((r) => r.status === 429).length === 5 && doVisitante === 3,
    "8 envios do MESMO visitante ao mesmo tempo: exatamente 3 gravados e 5 recusados (429)", `${rb1.map((r) => r.status).join(",")} / gravados ${doVisitante}`);
  const naHora = await escalar("SELECT COUNT(*) FROM PreCadastros WHERE Origem = N'SITE' AND CriadoEm >= DATEADD(HOUR, -1, SYSUTCDATETIME())");
  await q("INSERT INTO PreCadastros (Origem, Nome, Situacao) SELECT TOP (@n) N'SITE', N'Volume E2E95', N'DESCARTADO' FROM sys.all_objects", { n: 196 - naHora });
  const rb2 = await disparar(Array.from({ length: 8 }, (_, i) => ({ corpo: corpoSite({ nome: `Rajada Total ${NOMES[i]} E2E95`, cpf: cpfDe(950000600 + i), dataNascimento: DATAS[i] }) }))).promessa;
  const doTotal = await escalar("SELECT COUNT(*) FROM PreCadastros WHERE Nome LIKE N'Rajada Total % E2E95'");
  const totalHora = await escalar("SELECT COUNT(*) FROM PreCadastros WHERE Origem = N'SITE' AND CriadoEm >= DATEADD(HOUR, -1, SYSUTCDATETIME())");
  ok(rb2.every((r) => r.ok) && rb2.filter((r) => r.status === 200).length === 4 && rb2.filter((r) => r.status === 429).length === 4 && doTotal === 4 && totalHora === 200,
    "196 na hora e 8 envios de visitantes diferentes ao mesmo tempo: exatamente 4 gravados (o total para em 200) e 4 recusados", `${rb2.map((r) => r.status).join(",")} / gravados ${doTotal} / total ${totalHora}`);
  await q("DELETE FROM PreCadastros WHERE Nome = N'Volume E2E95'");

  console.log("-- (c) o mesmo envio repetido não grava dois");
  process.env.PRE_CADASTRO_SITE_MIN_MS = "0";
  const envA = corpoSite({ nome: "Reenvio Um E2E95", cpf: cpfDe(950000700), dataNascimento: "1981-11-21" });
  const resA1 = await site(envA); const resA2 = await site({ ...envA }); const resA3 = await site({ ...envA, nome: "Outro Nome Mesmo Envio" });
  const linA = await doEnvio(envA.envioId);
  ok(resA1.status === 200 && JSON.stringify(resA2) === JSON.stringify(resA1) && JSON.stringify(resA3) === JSON.stringify(resA1) && linA.length === 1 && linA[0].Situacao === "ACEITO"
    && (await fichasDoCpf(cpfDe(950000700))) === 1, "o mesmo envio 3 vezes (a 3ª com outro nome): a mesma resposta, UM pré-cadastro e UMA ficha", JSON.stringify(linA));
  const envB = corpoSite({ nome: "Reenvio Corrida E2E95", cpf: cpfDe(950000701), dataNascimento: "1982-12-22" });
  const resB = await disparar([0, 1, 2, 3].map(() => ({ corpo: envB }))).promessa;
  const linB = await doEnvio(envB.envioId);
  ok(resB.every((r) => r.ok && r.status === 200 && r.body.mensagem === RECEBIDO) && linB.length === 1 && linB[0].Situacao === "ACEITO" && (await fichasDoCpf(cpfDe(950000701))) === 1,
    "o mesmo envio em 4 processos ao mesmo tempo: os 4 recebem 200, UM pré-cadastro e UMA ficha", `${resB.map((r) => r.status).join(",")} / ${JSON.stringify(linB)}`);
  // a trava do CPF ocupada por outro processamento demorado: a espera tem teto (o tempo fixo continua), o pré-cadastro fica sem avaliar; o reenvio avalia
  delete process.env.PRE_CADASTRO_SITE_MIN_MS;
  const envC = corpoSite({ nome: "Trava Ocupada E2E95", cpf: cpfDe(950000702), dataNascimento: "1983-01-23" });
  const segura = disparar([{ segurar: { recurso: `precad-cpf:${envC.cpf}`, segundos: 7 } }]);
  let travada = false;
  for (let i = 0; i < 80 && !travada; i++) {
    travada = Date.now() > segura.t0 && (await escalar("SELECT APPLOCK_TEST('public', @r, 'Exclusive', 'Session')", { r: `precad-cpf:${envC.cpf}` })) === 0;
    if (!travada) await new Promise((r) => setTimeout(r, 250));
  }
  ok(travada, "outro processo segura a trava do CPF (7 s)");
  const tOcupada = Date.now(); const rOcupada = await site(envC); const msOcupada = Date.now() - tOcupada;
  const linC = (await doEnvio(envC.envioId))[0];
  ok(rOcupada.status === 200 && rOcupada.body.mensagem === RECEBIDO && msOcupada >= 2990 && msOcupada < 3400 && linC && linC.Situacao === "PENDENTE" && linC.Pendencias === null,
    "com a trava ocupada: a MESMA resposta no MESMO tempo fixo, e o pré-cadastro gravado, sem avaliar (a fila o mostra)", `${msOcupada} ms / ${JSON.stringify(linC)}`);
  await segura.promessa;
  const rDepois = await site({ ...envC });
  const linC2 = await doEnvio(envC.envioId);
  ok(rDepois.status === 200 && linC2.length === 1 && linC2[0].Situacao === "ACEITO" && linC2[0].MembroIdResultado && (await fichasDoCpf(cpfDe(950000702))) === 1,
    "o reenvio do MESMO envio avalia o que tinha ficado (entrou sozinho) e continua UM pré-cadastro", JSON.stringify(linC2));
  ok((await escalar("SELECT COUNT(*) FROM PreCadastros WHERE EnvioId IS NOT NULL AND ConsentimentoVersao <> @v", { v: regrasPre.CONSENTIMENTO.versao })) === 0
    && (await escalar("SELECT COUNT(*) FROM PreCadastros WHERE EnvioId IS NOT NULL")) > 30, "todo pré-cadastro do site guardou a versão atual do consentimento");

  // ---- parte 6 (22/11/2026): o BANCO LENTO — decisão do responsável: "a secretaria aceita depois". A resposta NUNCA passa do tempo fixo (3.000 ms): o
  // processamento que não cabe é desfeito e o pré-cadastro fica PENDENTE sem avaliar; a gravação que não cabe é desfeita e a resposta é "envie de novo".
  // O banco lento é simulado por outro processo que segura a TABELA inteira (TABLOCKX) por alguns segundos: o pedido do envio fica parado nela, como num
  // banco que não responde, e o limite do pedido (requestTimeout) o corta no prazo.
  console.log("== parte 6: o banco lento (a resposta nunca passa do tempo fixo) ==");
  delete process.env.PRE_CADASTRO_SITE_MIN_MS;   // o tempo fixo padrão (3.000 ms)
  // a trava X da tabela aparece uma vez por partição de travas (16 linhas nesta máquina): basta existir
  const tabelaSegura = (tabela) => escalar(`SELECT CASE WHEN EXISTS (SELECT 1 FROM sys.dm_tran_locks WHERE resource_database_id = DB_ID() AND resource_type = N'OBJECT'
    AND resource_associated_entity_id = OBJECT_ID(@t) AND request_mode = N'X' AND request_status = N'GRANT') THEN 1 ELSE 0 END`, { t: `dbo.${tabela}` });
  const segurarTabela = async (tabela, segundos) => {
    const s = disparar([{ segurar: { tabela, segundos } }]);
    let pega = false;
    for (let i = 0; i < 80 && !pega; i++) {
      pega = Date.now() > s.t0 && (await tabelaSegura(tabela)) === 1;
      if (!pega) await new Promise((r) => setTimeout(r, 200));
    }
    ok(pega, `outro processo segura a tabela ${tabela} inteira (${segundos} s)`);
    return s;
  };
  const medirSite = async (corpo) => { const t = Date.now(); const r = await site(corpo); return { ms: Date.now() - t, r }; };

  console.log("-- o processamento que não cabe: desfeito, o pré-cadastro na fila sem avaliar; a MESMA resposta no MESMO tempo");
  const envD = corpoSite({ nome: "Banco Lento Processa E2E95", cpf: cpfDe(950000800), dataNascimento: "1984-02-24" });
  const segD = await segurarTabela("MembroReferencia", 7);
  const d1 = await medirSite(envD);
  const linD = (await doEnvio(envD.envioId))[0];
  ok(d1.r.status === 200 && d1.r.body.mensagem === RECEBIDO && d1.ms >= 2990 && d1.ms < 3400, "com a tabela das fichas parada: 200 'recebemos' nos 3.000 ms (nunca 6 s, nem os 7 s do banco)",
    `${d1.ms} ms / ${d1.r.status} ${JSON.stringify(d1.r.body)}`);
  ok(linD && linD.Situacao === "PENDENTE" && linD.Pendencias === null && linD.MembroIdResultado === null, "…o pré-cadastro gravado, PENDENTE sem avaliar (a fila da secretaria o mostra)",
    JSON.stringify(linD));
  await segD.promessa;
  await new Promise((r) => setTimeout(r, 1500));   // se algo do processamento cortado fosse confirmar depois, já teria confirmado
  const linD2 = (await doEnvio(envD.envioId))[0];
  ok(linD2.Situacao === "PENDENTE" && linD2.Pendencias === null && (await fichasDoCpf(envD.cpf)) === 0,
    "depois que o banco volta: NENHUMA ficha nasceu e o pré-cadastro continua sem avaliar (o trabalho cortado foi desfeito, não confirmou depois)", JSON.stringify(linD2));
  const d2 = await medirSite({ ...envD });
  const linD3 = await doEnvio(envD.envioId);
  ok(d2.r.status === 200 && d2.r.body.mensagem === RECEBIDO && linD3.length === 1 && linD3[0].Situacao === "ACEITO" && (await fichasDoCpf(envD.cpf)) === 1,
    "o reenvio do mesmo envio, com o banco normal, avalia (entrou sozinho): UM pré-cadastro e UMA ficha", JSON.stringify(linD3));

  console.log("-- a GRAVAÇÃO que não cabe: desfeita, nada gravado; 'envie de novo' (503) no MESMO tempo, nunca 'recebemos' sem gravar");
  const envE = corpoSite({ nome: "Banco Lento Grava E2E95", cpf: cpfDe(950000801), dataNascimento: "1985-03-25" });
  const segE = await segurarTabela("PreCadastros", 7);
  const e1 = await medirSite(envE);
  ok(e1.r.status === 503 && e1.r.body.sucesso === false && e1.r.body.mensagem !== RECEBIDO && e1.ms >= 2990 && e1.ms < 3400,
    "com a tabela dos pré-cadastros parada: 503 'envie de novo' nos 3.000 ms", `${e1.ms} ms / ${e1.r.status} ${JSON.stringify(e1.r.body)}`);
  await segE.promessa;
  await new Promise((r) => setTimeout(r, 1500));
  ok((await doEnvio(envE.envioId)).length === 0 && (await fichasDoCpf(envE.cpf)) === 0, "depois que o banco volta: nada gravado (nem pré-cadastro, nem ficha)");
  const e2 = await medirSite({ ...envE });
  const linE = await doEnvio(envE.envioId);
  ok(e2.r.status === 200 && e2.r.body.mensagem === RECEBIDO && e2.ms >= 2990 && e2.ms < 3400 && linE.length === 1 && linE[0].Situacao === "ACEITO" && (await fichasDoCpf(envE.cpf)) === 1,
    "o reenvio do mesmo envio grava e avalia: 200 'recebemos' nos 3.000 ms, UM pré-cadastro e UMA ficha", `${e2.ms} ms / ${JSON.stringify(linE)}`);

  console.log("-- o banco lento que ainda cabe: o trabalho termina dentro do prazo e a resposta continua nos 3.000 ms");
  const envF = corpoSite({ nome: "Banco Lento Cabe E2E95", cpf: cpfDe(950000802), dataNascimento: "1986-04-26" });
  const segF = await segurarTabela("MembroReferencia", 1);
  const f1 = await medirSite(envF);
  await segF.promessa;
  const linF = await doEnvio(envF.envioId);
  ok(f1.r.status === 200 && f1.r.body.mensagem === RECEBIDO && f1.ms >= 2990 && f1.ms < 3400 && linF.length === 1 && linF[0].Situacao === "ACEITO" && (await fichasDoCpf(envF.cpf)) === 1,
    "com a tabela parada só 1 s: a ficha nasce (coube no prazo) e a resposta sai nos mesmos 3.000 ms", `${f1.ms} ms / ${JSON.stringify(linF)}`);
  console.log("   tempos em ms com o banco lento:", JSON.stringify({ processamentoNaoCabe: d1.ms, reenvio: d2.ms, gravacaoNaoCabe: e1.ms, reenvioDaGravacao: e2.ms, lentoQueCabe: f1.ms }));

  fim("e2e-95 (as sobras de Membros no banco)");
  L.shimEncerrar();
}

// ---- os processos filhos das corridas da parte 5 (cada um com a sua conexão; a ponte do shim é uma conexão só, então Promise.all não prova corrida)
async function filho() {
  const spec = JSON.parse(process.argv[3]);
  await obterPool();
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  let saida;
  try {
    if (spec.segurar && spec.segurar.tabela) {
      // o BANCO LENTO (parte 6): segura a tabela inteira (TABLOCKX) — o nome só de uma lista fechada, e o tempo escrito no texto (um número de 1 a 9)
      const tabela = { MembroReferencia: "dbo.MembroReferencia", PreCadastros: "dbo.PreCadastros" }[spec.segurar.tabela];
      if (!tabela) throw new Error("tabela fora da lista");
      const s = Math.max(1, Math.min(9, Math.floor(Number(spec.segurar.segundos) || 1)));
      await q(`BEGIN TRAN; SELECT COUNT(*) AS n FROM ${tabela} WITH (TABLOCKX, HOLDLOCK); WAITFOR DELAY '00:00:0${s}'; COMMIT`);
      saida = { ok: true };
    } else if (spec.segurar) {
      // segura a trava do CPF como um processamento demorado (o tempo vai escrito no texto: só um número de 1 a 9)
      const s = Math.max(1, Math.min(9, Math.floor(Number(spec.segurar.segundos) || 1)));
      await q(`BEGIN TRAN; DECLARE @rc INT; EXEC @rc = sp_getapplock @Resource = @r, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 5000;
               WAITFOR DELAY '00:00:0${s}'; COMMIT`, { r: spec.segurar.recurso });
      saida = { ok: true };
    } else {
      const { chamarRota } = require("./lib-afm");
      const t = Date.now();
      const res = await chamarRota("PreCadastroSite/index.js", { metodo: "POST", corpo: spec.corpo, headers: { "x-site-key": process.env.CHAVE_SITE_SISTEMA } });
      saida = { ok: true, status: res.status, body: res.body, ms: Date.now() - t };
    }
  } catch (e) { saida = { ok: false, erro: e && e.message }; }
  process.stdout.write("@@RESULTADO@@" + JSON.stringify(saida) + "\n");
  L.shimEncerrar();
}
// dispara os filhos para o mesmo instante (t0); os envios do site sem o tempo fixo (a corrida é da gravação, não do relógio)
function disparar(specs) {
  const t0 = Date.now() + 7000 + specs.length * 800;
  const promessa = Promise.all(specs.map((s, i) => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-r", path.join(__dirname, "shim-mssql.js"), __filename, "filho", JSON.stringify({ n: i, t0, ...s })],
      { env: { ...process.env, PRE_CADASTRO_SITE_MIN_MS: "0" } });
    let saida = ""; p.stdout.on("data", (d) => { saida += d; });
    p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { ok: false, erro: "sem resultado" }); });
  })));
  return { t0, promessa };
}

if (process.argv[2] === "filho") filho(); else principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
