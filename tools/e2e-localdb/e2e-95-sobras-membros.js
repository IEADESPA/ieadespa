// e2e-95-sobras-membros.js — AS SOBRAS DE MEMBROS (FASE 10, 19/11/2026), contra o SQL Server de verdade. Parte 1: ONDE A PESSOA SERVE (migração 181): registrar
// um ministério (só os do catálogo que não são departamento, ativos), não duplicar, a data que não pode ser no futuro, encerrar (nada se apaga), listar, o escopo
// (fora = não existe), sem sessão e sem permissão, e juntar fichas com as duas servindo no mesmo ministério.
// Roda sobre a base cenario-181 (`bash rodar.sh preparar-181` e depois `BASE=cenario-181 bash rodar.sh roteiro e2e-95-sobras-membros.js`); monta o próprio cenário.
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

  fim("e2e-95 (as sobras de Membros no banco)");
  L.shimEncerrar();
}

principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
