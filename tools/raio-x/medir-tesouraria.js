// tools/raio-x/medir-tesouraria.js — a medição antes × depois das correções 1 e 2 do raio-x (17/11/2026): os lançamentos e as saídas da tesouraria, por papel,
// do jeito que a tela pede (lançamentos: congregação + mês; saídas: a lista inteira do escopo) e sem filtro (lançamentos). Mesma massa e mesmos papéis do
// medir-rotas.js. Uso (a base "cenario-massa" restaurada antes):
//   cd tools/e2e-localdb && node -r ./shim-mssql.js ../raio-x/medir-tesouraria.js [rótulo]
// Atenção: no LocalDB a ponte do equipamento (PowerShell) converte cada linha devolvida em texto — o tempo cresce com o número de LINHAS, bem mais do que
// na nuvem; por isso o número que importa aqui é o de linhas lidas e devolvidas, e a comparação antes × depois na mesma máquina.
process.env.AUTH_SECRET = "segredo-do-raio-x-de-velocidade-" + "x".repeat(24);
const path = require("path");
const L = require("../e2e-localdb/lib");
const { q, obterPool } = L;
const API = path.join(__dirname, "..", "..", "api");
const db = require(path.join(API, "shared", "db"));
const fator = () => ({ via: "CHAVE", em: Date.now() });

async function principal() {
  const rotulo = process.argv[2] || "medição";
  const pool = await obterPool();
  const realPool = await db.getPool();
  let consultas = 0;
  for (const p of new Set([pool, realPool])) {
    const orig = p.request.bind(p);
    p.request = () => { const r = orig(); const oq = r.query.bind(r); r.query = (...a) => { consultas++; return oq(...a); }; return r; };
  }
  const { chamarRota } = require("../e2e-localdb/lib-afm");
  const area = (await q(`SELECT TOP 1 a.AreaId, a.Nome FROM Areas a WHERE a.Nome LIKE N'% (Fictícia)' ORDER BY a.AreaId`))[0];
  const congsArea = (await q(`SELECT Nome FROM Congregacoes WHERE AreaId = @a`, { a: area.AreaId })).map((x) => x.Nome);
  const congLocal = (await q(`SELECT TOP 1 c.CongregacaoId, c.Nome, COUNT(*) AS n FROM Congregacoes c JOIN MembroReferencia m ON m.CongregacaoId = c.CongregacaoId
                              WHERE c.Nome LIKE N'% (Fictícia)' GROUP BY c.CongregacaoId, c.Nome ORDER BY COUNT(*) DESC`))[0];
  const mes = (await q(`SELECT TOP 1 MesReferencia FROM LancamentosTesouraria WHERE CongregacaoId = @c ORDER BY MesReferencia DESC`, { c: congLocal.CongregacaoId }))[0].MesReferencia;
  const papeis = {
    geral: L.sessao(700002, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["financeiro"] }),
    area: L.sessao(700021, { via: "SENHA", fator: fator(), nivel: "AREA", escopoCongregacoes: congsArea, permissoes: ["financeiro"] }),
    local: L.sessao(700102, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [congLocal.Nome], permissoes: ["financeiro"] })
  };
  const casos = [
    ["lançamentos: a tela (congregação + mês)", "GestaoLancamentosTesouraria/index.js", { congregacaoId: String(congLocal.CongregacaoId), mesReferencia: mes }, ["geral", "area", "local"]],
    ["lançamentos: sem filtro", "GestaoLancamentosTesouraria/index.js", {}, ["area", "local"]],
    ["saídas: a lista do escopo (a tela)", "GestaoSaidas/index.js", {}, ["geral", "area", "local"]],
    ["saídas: uma congregação", "GestaoSaidas/index.js", { congregacaoId: String(congLocal.CongregacaoId) }, ["geral"]]
  ];
  const resultados = [];
  for (const [nome, handler, query, quem] of casos) {
    for (const papel of quem) {
      const medir = async () => {
        consultas = 0;
        const t0 = process.hrtime.bigint();
        const res = await chamarRota(handler, { metodo: "GET", token: papeis[papel], query });
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        return { ms, consultas, linhas: Array.isArray(res.body) ? res.body.length : null, status: res.status };
      };
      await medir();
      const m = await medir();
      resultados.push({ caso: nome, papel, ms: Math.round(m.ms), consultas: m.consultas, linhas: m.linhas, status: m.status });
      console.error(`${rotulo} | ${nome} | ${papel}: ${Math.round(m.ms)} ms, ${m.linhas} linhas, ${m.consultas} consultas`);
    }
  }
  console.log(JSON.stringify({ rotulo, congregacaoLocal: congLocal.Nome, area: area.Nome, congregacoesNaArea: congsArea.length, mes, resultados }));
  L.shimEncerrar();
}

principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
