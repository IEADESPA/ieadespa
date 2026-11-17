// e2e-84-pessoas-escopo.js — a lista de pessoas filtrada NO BANCO pelo escopo (FASE 10, v10.1c, 13/11/2026). Antes, GET /api/pessoas lia o cadastro inteiro
// do campo e escondia na memória quem estava fora do escopo (comparando nomes de congregação); agora o banco só devolve a gente do escopo, e a lista também
// vem em páginas (?pagina=N) com a busca e os filtros no banco. A prova compara a resposta da rota com um "gabarito" tirado direto do banco, para cada tipo
// de escopo (geral, dirigente, área, extensão, cargo + delegação, escopo vazio). Roda sobre a base cenario-172 (`BASE=cenario-172 bash rodar.sh roteiro
// e2e-84-pessoas-escopo.js`); monta o próprio cenário.
process.env.AUTH_SECRET = "segredo-da-lista-de-pessoas-no-banco-" + "x".repeat(24);
const L = require("./lib");
const { ok, fim, q, escalar, obterPool } = L;

const PERM = ["pessoas"];
const fator = () => ({ via: "CHAVE", em: Date.now() });
const tokenLider = (escopo, extra = {}) => L.sessao(9001, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: escopo, permissoes: PERM, ...extra });
const tokenGeral = () => L.sessao(9002, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM });

async function principal() {
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  const listar = (token, query) => chamarRota("GestaoPessoas/index.js", { metodo: "GET", token, query: query || {} });
  const ids = (lista) => lista.map((p) => p.membroId);
  const gabarito = async (onde, params) => (await q(`SELECT m.MembroId FROM MembroReferencia m LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId
    ${onde ? "WHERE " + onde : ""} ORDER BY m.Nome, m.MembroId`, params)).map((x) => x.MembroId);
  const mesmoConjunto = (a, b) => a.length === b.length && [...a].sort((x, y) => x - y).every((v, i) => v === [...b].sort((x, y) => x - y)[i]);

  console.log("== o cenário: duas congregações novas, uma extensão e 30 pessoas ==");
  const area = (await q("INSERT INTO Areas (Nome) VALUES (N'Área Escopo E2E84'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const congA = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (N'Escopo A E2E84', @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { a: area }))[0].id;
  const congB = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (N'Escopo B E2E84', @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { a: area }))[0].id;
  const ext = (await q("INSERT INTO ExtensoesTenda (Nome, CongregacaoMaeId) VALUES (N'Tenda Norte E2E84', @c); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { c: congB }))[0].id;
  for (let i = 1; i <= 30; i++) {
    const cong = i <= 12 ? congA : congB;
    const naTenda = i > 24;   // 25..30: na extensão da B
    const situacao = i % 5 === 0 ? "SEM_COMUNHAO" : "EM_COMUNHAO";
    await q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, ExtensaoId, Status, SituacaoMembro, DataNascimento, Email)
             VALUES (@id, @n, @c, @x, 'ATIVO', @s, '1990-01-01', @em)`,
      { id: 840000 + i, n: `Pessoa ${String(31 - i).padStart(2, "0")} E2E84`, c: cong, x: naTenda ? ext : null, s: situacao, em: `p${840000 + i}@exemplo.org` });
  }
  ok((await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId BETWEEN 840001 AND 840030")) === 30, "30 pessoas do roteiro gravadas");

  console.log("== a lista inteira (sem ?pagina), escopo por escopo, contra o gabarito do banco ==");
  const geral = await listar(tokenGeral());
  const todos = await gabarito("");
  ok(geral.status === 200 && Array.isArray(geral.body), "geral: 200 com a lista", JSON.stringify(geral.body).slice(0, 200));
  ok(mesmoConjunto(ids(geral.body), todos), `geral: vê o cadastro inteiro (${todos.length} pessoas)`);

  const dirA = await listar(tokenLider(["Escopo A E2E84"]));
  const gabA = await gabarito("m.CongregacaoId = @c", { c: congA });
  ok(dirA.status === 200 && mesmoConjunto(ids(dirA.body), gabA) && gabA.length === 12, "dirigente da A: exatamente as 12 pessoas da A", JSON.stringify(ids(dirA.body)));

  const areaAB = await listar(tokenLider(["Escopo A E2E84", "Escopo B E2E84"], { nivel: "AREA" }));
  const gabAB = await gabarito("m.CongregacaoId IN (@a, @b)", { a: congA, b: congB });
  ok(mesmoConjunto(ids(areaAB.body), gabAB) && gabAB.length === 30, "pastor da área (A e B): as 30");

  const tenda = await listar(tokenLider(["Escopo B E2E84"], { escopoExtensaoNome: "Tenda Norte E2E84" }));
  const gabTenda = await gabarito("m.CongregacaoId = @b AND m.ExtensaoId = @x", { b: congB, x: ext });
  ok(mesmoConjunto(ids(tenda.body), gabTenda) && gabTenda.length === 6, "líder da extensão: só as 6 da Tenda Norte (não a congregação-mãe inteira)", JSON.stringify(ids(tenda.body)));

  const misto = await listar(L.sessao(9003, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: ["Escopo A E2E84"], permissoes: PERM, concessoes: [
    { origem: "PROPRIA", permissoes: PERM, nivel: "CONGREGACAO", escopoCongregacoes: ["Escopo A E2E84"] },
    { origem: "DELEGACAO", ate: "2099-12-31", permissoes: PERM, nivel: "CONGREGACAO", escopoCongregacoes: ["Escopo B E2E84"], escopoExtensaoNome: "Tenda Norte E2E84" }
  ] }));
  const gabMisto = await gabarito("m.CongregacaoId = @a OR (m.CongregacaoId = @b AND m.ExtensaoId = @x)", { a: congA, b: congB, x: ext });
  ok(mesmoConjunto(ids(misto.body), gabMisto) && gabMisto.length === 18, "cargo na A + delegação da extensão da B: as 12 da A e as 6 da tenda (a extensão da delegação não estreita o cargo próprio)", JSON.stringify(ids(misto.body)));

  const vencida = await listar(L.sessao(9004, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: ["Escopo A E2E84"], permissoes: PERM, concessoes: [
    { origem: "PROPRIA", permissoes: PERM, nivel: "CONGREGACAO", escopoCongregacoes: ["Escopo A E2E84"] },
    { origem: "DELEGACAO", ate: "2020-01-01", permissoes: PERM, nivel: "CONGREGACAO", escopoCongregacoes: "TODAS" }
  ] }));
  ok(mesmoConjunto(ids(vencida.body), gabA), "delegação vencida (escopo TODAS) não abre o campo inteiro: continua só a A");

  const vazio = await listar(tokenLider([]));
  ok(vazio.status === 200 && Array.isArray(vazio.body) && vazio.body.length === 0, "escopo vazio: lista vazia");
  const apagada = await listar(tokenLider(["Congregação Que Não Existe E2E84"]));
  ok(apagada.status === 200 && apagada.body.length === 0, "escopo com congregação que não existe: lista vazia");
  const semPerm = await listar(L.sessao(9005, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["financeiro"] }));
  ok(semPerm.status === 403, "sem a permissão pessoas: 403");

  console.log("== a lista em páginas (?pagina=N) ==");
  const paginas = [];
  let total = null;
  for (let p = 1; p <= 4; p++) {
    const r = await listar(tokenLider(["Escopo A E2E84", "Escopo B E2E84"], { nivel: "AREA" }), { pagina: p, porPagina: 8 });
    ok(r.status === 200 && r.body.sucesso === true && r.body.pagina === p && r.body.porPagina === 8, `página ${p}: 200, número e tamanho certos`);
    total = r.body.total;
    paginas.push(...ids(r.body.itens));
  }
  ok(total === 30, "o total conta as 30 do escopo (não o campo inteiro)", String(total));
  ok(JSON.stringify(paginas) === JSON.stringify(gabAB), "as 4 páginas de 8, juntas, são as 30 na ordem do nome, sem repetir nem pular", JSON.stringify(paginas));

  const p1Dir = await listar(tokenLider(["Escopo A E2E84"]), { pagina: 1, porPagina: 100 });
  ok(p1Dir.body.total === 12 && mesmoConjunto(ids(p1Dir.body.itens), gabA), "dirigente da A em páginas: total 12, só a A");

  const outraCong = await listar(tokenLider(["Escopo A E2E84"]), { pagina: 1, congregacaoId: congB });
  ok(outraCong.status === 200 && outraCong.body.total === 0 && outraCong.body.itens.length === 0, "filtrar por congregação FORA do escopo não abre nada (total 0)");

  const filtroB = await listar(tokenGeral(), { pagina: 1, porPagina: 100, congregacaoId: congB, situacao: "SEM_COMUNHAO" });
  const gabFiltroB = await gabarito("m.CongregacaoId = @b AND m.SituacaoMembro = 'SEM_COMUNHAO'", { b: congB });
  ok(filtroB.body.total === gabFiltroB.length && mesmoConjunto(ids(filtroB.body.itens), gabFiltroB), `geral filtrando B + sem comunhão: ${gabFiltroB.length} pessoas`);

  const busca = await listar(tokenGeral(), { pagina: 1, busca: "Pessoa 07 E2E84" });
  ok(busca.body.total === 1 && busca.body.itens[0].membroId === 840024, "busca por nome acha a pessoa", JSON.stringify(busca.body.itens.map((p) => p.membroId)));
  const buscaMat = await listar(tokenGeral(), { pagina: 1, busca: "840017" });
  ok(buscaMat.body.total === 1 && buscaMat.body.itens[0].membroId === 840017, "busca pela matrícula acha a pessoa");
  const curinga = await listar(tokenGeral(), { pagina: 1, busca: "%" });
  ok(curinga.status === 200 && curinga.body.total === (await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE CHARINDEX('%', Nome) > 0")), "o % da busca é letra, não curinga");
  const buscaFora = await listar(tokenLider(["Escopo A E2E84"]), { pagina: 1, busca: "840025" });
  ok(buscaFora.body.total === 0, "a busca do dirigente não acha quem está fora do escopo (matrícula da B)");

  const teto = await listar(tokenGeral(), { pagina: 1, porPagina: 5000 });
  ok(teto.body.porPagina === 100 && teto.body.itens.length <= 100, "página com no máximo 100");
  const alem = await listar(tokenGeral(), { pagina: 99999, porPagina: 100 });
  ok(alem.status === 200 && alem.body.itens.length === 0 && alem.body.total === todos.length, "página além do fim: vazia, com o total certo");
  const congInvalida = await listar(tokenGeral(), { pagina: 1, congregacaoId: "abc" });
  ok(congInvalida.status === 400, "congregação inválida no filtro: 400");
  for (const lixo of L.LIXO.slice(0, 20)) {
    const r = await listar(tokenGeral(), { pagina: lixo, porPagina: lixo, busca: lixo, situacao: lixo });
    ok([200, 400].includes(r.status), `entrada estranha não derruba a rota (${String(JSON.stringify(lixo)).slice(0, 30)})`, String(r.status));
  }

  fim("e2e-84 (lista de pessoas no banco)");
  L.shimEncerrar();
}

principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
