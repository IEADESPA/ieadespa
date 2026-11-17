// tools/raio-x/medir-rotas.js — raio-x de velocidade (FASE 10, 17/11/2026): mede o tempo e o número de consultas das rotas GET da API sobre a MASSA GRANDE
// (45 congregações, ~5.000 pessoas, 36 meses de tesouraria), chamando os handlers de verdade contra o SQL Server LocalDB, para quatro papéis: Secretaria Geral,
// secretaria de área, secretaria local e membro. Uso (a base "cenario-massa" já gerada pelo semeador da homologação):
//   cd tools/e2e-localdb && powershell -File bases.ps1 restaurar cenario-massa && node -r ./shim-mssql.js ../raio-x/medir-rotas.js > saida.json
process.env.AUTH_SECRET = "segredo-do-raio-x-de-velocidade-" + "x".repeat(24);
const fs = require("fs");
const path = require("path");
const L = require("../e2e-localdb/lib");
const { q, obterPool } = L;
const API = path.join(__dirname, "..", "..", "api");
const db = require(path.join(API, "shared", "db"));

const PERMISSOES = ["financeiro", "pessoas", "disciplina", "consagracoes", "mediacao", "relatorios_departamentais", "assembleia", "tesouraria_departamental",
  "protecaodedados", "ouvidoria", "ebd_gestao", "assistencia_social", "secretaria", "calendario", "comunicacao", "eventos", "escalas", "patrimonio"];
const fator = () => ({ via: "CHAVE", em: Date.now() });

// Rotas GET sem parâmetro obrigatório (só {x?} ou {*x}): chamadas sem nada, como a tela faz ao abrir a lista.
function rotasSemParametroObrigatorio() {
  const out = [];
  for (const d of fs.readdirSync(API)) {
    const f = path.join(API, d, "function.json");
    if (!fs.existsSync(f)) continue;
    try {
      const j = JSON.parse(fs.readFileSync(f, "utf8"));
      const b = (j.bindings || []).find((x) => x.type === "httpTrigger");
      if (!b || !(b.methods || []).map((m) => m.toLowerCase()).includes("get")) continue;
      const obrig = (b.route || "").match(/\{([^}*?]+)\}/g);
      if (obrig && obrig.length) continue;
      if (/Pdf$|Qr$|Publico$|Publica$|Sair$/.test(d)) continue;
      out.push({ handler: `${d}/index.js`, rota: b.route });
    } catch (e) { }
  }
  return out;
}

async function principal() {
  const pool = await obterPool();
  const realPool = await db.getPool();
  let consultas = 0;
  for (const p of new Set([pool, realPool])) {
    const orig = p.request.bind(p);
    p.request = () => { const r = orig(); const oq = r.query.bind(r); r.query = (...a) => { consultas++; return oq(...a); }; return r; };
  }
  const { chamarRota } = require("../e2e-localdb/lib-afm");

  // os papéis, com o escopo tirado da própria massa
  const area = (await q(`SELECT TOP 1 a.AreaId, a.Nome FROM Areas a WHERE a.Nome LIKE N'% (Fictícia)' ORDER BY a.AreaId`))[0];
  const congsArea = (await q(`SELECT Nome FROM Congregacoes WHERE AreaId = @a`, { a: area.AreaId })).map((x) => x.Nome);
  const congLocal = (await q(`SELECT TOP 1 c.Nome, COUNT(*) AS n FROM Congregacoes c JOIN MembroReferencia m ON m.CongregacaoId = c.CongregacaoId
                              WHERE c.Nome LIKE N'% (Fictícia)' GROUP BY c.Nome ORDER BY COUNT(*) DESC`))[0];
  const membro = (await q(`SELECT TOP 1 MembroId FROM MembroReferencia WHERE MembroId BETWEEN 700400 AND 799999 AND Status = 'ATIVO' ORDER BY MembroId`))[0].MembroId;
  const totalPessoas = (await q(`SELECT COUNT(*) AS n FROM MembroReferencia`))[0].n;
  const papeis = {
    geral: L.sessao(700002, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERMISSOES }),
    area: L.sessao(700021, { via: "SENHA", fator: fator(), nivel: "AREA", escopoCongregacoes: congsArea, permissoes: PERMISSOES }),
    local: L.sessao(700102, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [congLocal.Nome], permissoes: PERMISSOES }),
    membro: L.sessao(membro, { via: "PIN", permissoes: [], escopoCongregacoes: [] })
  };

  const rotas = rotasSemParametroObrigatorio();
  // as rotas do membro e as com matrícula, chamadas à parte
  const extras = [
    { handler: "GestaoPessoas/index.js", rota: "pessoas?pagina=1", query: { pagina: "1" } },
    { handler: "HistoricoMembro/index.js", rota: "pessoas/{id}/historico", binding: { membroId: String(membro) } },
    { handler: "AtualizarMeusDados/index.js", rota: "meus-dados/{matricula}", binding: { matricula: String(membro) }, so: "membro" },
    { handler: "PainelInicial/index.js", rota: "painel-inicial", so: null }
  ].filter((x) => fs.existsSync(path.join(API, x.handler)));

  const resultados = [];
  for (const papel of Object.keys(papeis)) {
    const lista = rotas.map((r) => ({ ...r })).concat(extras.filter((x) => !x.so || x.so === papel));
    for (const r of lista) {
      const medir = async () => {
        consultas = 0;
        const t0 = process.hrtime.bigint();
        let res, erro = null;
        try { res = await chamarRota(r.handler, { metodo: "GET", token: papeis[papel], binding: r.binding || {}, query: r.query || {} }); } catch (e) { erro = e.message; }
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        const corpo = res && res.body;
        const kb = corpo ? Math.round(Buffer.byteLength(typeof corpo === "string" ? corpo : JSON.stringify(corpo)) / 1024) : 0;
        const linhas = Array.isArray(corpo) ? corpo.length : corpo && Array.isArray(corpo.itens) ? corpo.itens.length : null;
        return { ms, consultas, kb, linhas, status: res ? res.status : null, erro };
      };
      await medir();                 // a primeira (carrega o módulo, aquece)
      const m = await medir();       // a que vale
      resultados.push({ papel, rota: r.rota, handler: r.handler, ms: +m.ms.toFixed(1), consultas: m.consultas, kb: m.kb, linhas: m.linhas, status: m.status, erro: m.erro });
    }
  }
  console.log(JSON.stringify({ totalPessoas, area: area.Nome, congregacoesNaArea: congsArea.length, congregacaoLocal: congLocal.Nome, pessoasNaLocal: congLocal.n, resultados }, null, 0));
  L.shimEncerrar();
}

principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
