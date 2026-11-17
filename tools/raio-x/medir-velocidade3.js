// tools/raio-x/medir-velocidade3.js — a medição antes × depois da correção 3 do raio-x e das listas lentas (17/11/2026): votações, reuniões, órgãos locais, ROPA,
// dossiê fiscal, relatórios dos departamentos, elegíveis da assembleia e vínculos de família, por papel. Conta as consultas por pedido, as linhas e o tempo, e GUARDA
// cada resposta em <pasta>/<caso>.json, para o comparar-respostas.js provar que a resposta nova é igual à antiga. Mesma massa e mesmos papéis do medir-rotas.js. Uso:
//   cd tools/e2e-localdb && node -r ./shim-mssql.js ../raio-x/medir-velocidade3.js <rótulo> <pasta-das-respostas>
process.env.AUTH_SECRET = "segredo-do-raio-x-de-velocidade-" + "x".repeat(24);
const fs = require("fs");
const path = require("path");
const L = require("../e2e-localdb/lib");
const { q, obterPool } = L;
const API = path.join(__dirname, "..", "..", "api");
const db = require(path.join(API, "shared", "db"));
const fator = () => ({ via: "CHAVE", em: Date.now() });

const PERMISSOES = ["financeiro", "pessoas", "disciplina", "reunioes", "assembleia", "relatorios_departamentais", "protecaodedados", "cli"];

async function principal() {
  const rotulo = process.argv[2] || "medição";
  const pasta = process.argv[3] || path.join(__dirname, "respostas-" + rotulo);
  fs.mkdirSync(pasta, { recursive: true });
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
  const membro = (await q(`SELECT TOP 1 MembroId FROM MembroReferencia WHERE MembroId BETWEEN 700400 AND 799999 AND Status = 'ATIVO' ORDER BY MembroId`))[0].MembroId;
  const papeis = {
    geral: L.sessao(700002, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERMISSOES }),
    area: L.sessao(700021, { via: "SENHA", fator: fator(), nivel: "AREA", escopoCongregacoes: congsArea, permissoes: PERMISSOES }),
    local: L.sessao(700102, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [congLocal.Nome], permissoes: PERMISSOES }),
    membro: L.sessao(membro, { via: "PIN", permissoes: [], escopoCongregacoes: [] })
  };
  const ano = new Date().getFullYear();
  const casos = [
    ["enquetes", "GestaoEnquetes/index.js", {}, {}, ["geral", "area", "local", "membro"]],
    ["enquetes-paraVotar", "GestaoEnquetes/index.js", {}, { paraVotar: "1" }, ["membro", "local"]],
    ["reunioes", "ListarReunioes/index.js", {}, {}, ["geral", "area", "local"]],
    ["meus-orgaos-locais", "MeusOrgaosLocais/index.js", {}, {}, ["geral", "area", "local"]],
    ["lgpd-ropa", "GestaoRopa/index.js", {}, {}, ["geral"]],
    ["dossie-fiscal", "RelatorioDossieFiscal/index.js", { ano: String(ano) }, {}, ["geral"]],
    ["relatorios-departamentais", "GestaoRelatoriosDepartamentais/index.js", {}, {}, ["geral", "area", "local"]],
    ["assembleia-elegiveis", "GestaoElegiveisAssembleia/index.js", {}, {}, ["geral", "area", "local"]],
    ["vinculos-familiares", "GestaoVinculosFamiliares/index.js", {}, {}, ["geral", "area", "local"]]
  ];
  const resultados = [];
  for (const [nome, handler, binding, query, quem] of casos) {
    for (const papel of quem) {
      const medir = async () => {
        consultas = 0;
        const t0 = process.hrtime.bigint();
        const res = await chamarRota(handler, { metodo: "GET", token: papeis[papel], binding, query });
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        const corpo = res && res.body;
        const linhas = Array.isArray(corpo) ? corpo.length : corpo && Array.isArray(corpo.enquetes) ? corpo.enquetes.length : null;
        return { ms, consultas, linhas, status: res ? res.status : null, corpo };
      };
      await medir();               // aquece (carrega o módulo)
      const m = await medir();
      fs.writeFileSync(path.join(pasta, `${nome}--${papel}.json`), JSON.stringify({ status: m.status, corpo: m.corpo }));
      resultados.push({ caso: nome, papel, ms: Math.round(m.ms), consultas: m.consultas, linhas: m.linhas, status: m.status });
      console.error(`${rotulo} | ${nome} | ${papel}: ${Math.round(m.ms)} ms, ${m.consultas} consultas, ${m.linhas} linhas, status ${m.status}`);
    }
  }
  console.log(JSON.stringify({ rotulo, congregacaoLocal: congLocal.Nome, area: area.Nome, congregacoesNaArea: congsArea.length, resultados }));
  L.shimEncerrar();
}

principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
