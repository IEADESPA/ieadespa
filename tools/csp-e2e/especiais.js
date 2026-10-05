// Peças especiais, roteiro fixo e conferências próprias (rodam nas duas versões; a NOVA com a CSP estrita):
//  1) importar pessoas com planilha .xlsx DE VERDADE (gerada com o SheetJS do app): modal de revisão com os 3 casos, troca das decisões nos <select>
//     (manipulador que usa "this"), confirmação e o corpo exato enviado a /api/pessoas/importar;
//  2) exportar o rol: XLSX.writeFile vira download registrado; a planilha baixada é aberta e conferida;
//  3) impressão da carta (Meu Painel → Cartas) e do certificado (Meu Painel → Minha Formação): HTML escrito na janela e print() chamado;
//  4) verificar.html: código por endereço (?c=) para cada situação, código digitado + botão, e código incompleto.
const path = require("path");
const { criarServidor, criarRemoto } = require("./servidor");
const { Sessao } = require("./cobertor");
const { compararAcao } = require("./comparar");

async function clicar(s, seletor, texto) {
  const ok = await s.avaliar((sel, t) => {
    const el = [...document.querySelectorAll(sel)].find(e => e.checkVisibility() && (!t || (e.innerText || e.textContent || "").includes(t)));
    if (!el) return false;
    el.click(); return true;
  }, seletor, texto || "");
  await s.calmo();
  return ok;
}
async function coletar(s, srv, marca) {
  const tr = await s.avaliar(() => window.__reg.coletar());
  tr.retrato = await s.avaliar(() => window.__reg.retrato());
  tr.api = srv.chamadasDe(s.acaoId, marca).map(c => `${c.metodo} ${c.rota}${c.corpo ? " " + c.corpo : ""}`);
  tr.htmlJanelas = await s.avaliar(() => window.__reg.janelas.map((_, i) => window.__reg.htmlJanela(i)));
  tr.instavel = s.instavel || 0;
  tr.cspTotal = await s.avaliar(() => window.__reg.cspTotal.slice()); // violações do cenário inteiro (desde a entrada), não só do último passo
  return tr;
}

const CENARIOS = [
  {
    nome: "importar pessoas (planilha .xlsx real)", perfil: "geral",
    async rodar(s, srv, ctx) {
      const passos = [];
      passos.push(await clicar(s, ".card-modulo", "Pessoas & Membresia"));
      passos.push(await clicar(s, "#btnSubPessoasBuscar"));
      const h = await s.page.$("#arquivoExcelPessoas");
      await h.uploadFile(ctx.arqs.xlsx); await s.calmo();
      await s.avaliar(() => window.__reg.zerar());
      const marca = srv.marca();
      passos.push(await clicar(s, "button", "Importar Pessoas"));
      const modal = await s.avaliar(() => document.getElementById("modalCaixa").innerText);
      const selects = await s.avaliar(() => { const l = [...document.querySelectorAll("#modalCaixa select")]; return l.map(x => x.value); });
      // troca as duas decisões pelo <select> (o manipulador grava this.value na linha)
      await s.avaliar(() => { const l = [...document.querySelectorAll("#modalCaixa select")]; l.forEach(x => { x.selectedIndex = 1; x.dispatchEvent(new Event("change", { bubbles: true })); }); });
      await s.calmo();
      passos.push(await clicar(s, "#modalConfirmar"));
      const tr = await coletar(s, srv, marca);
      tr.extra = { modal: modal.replace(/\s+/g, " ").slice(0, 400), selectsAntes: selects, passos };
      const post = tr.api.find(a => a.startsWith("POST /api/pessoas/importar"));
      const esperado = 'POST /api/pessoas/importar {"linhas":[{"membroId":101,"nome":"Nome A da Planilha","situacaoMembro":"EM_COMUNHAO","sobrescrever":true},{"membroId":555,"nome":"Nome B","situacaoMembro":"EM_COMUNHAO","sobrescrever":false},{"membroId":777,"nome":"Maria da Silva Teste","situacaoMembro":"CONGREGADO","sobrescrever":false}]}';
      tr.conferencias = [
        [/Revisar Importação \(3 linha/.test(modal), "modal de revisão com as 3 linhas da planilha"],
        [JSON.stringify(selects) === JSON.stringify(["MANTER", "IGNORAR"]), `decisões iniciais MANTER / IGNORAR (veio ${JSON.stringify(selects)})`],
        [post === esperado, `corpo enviado com as decisões trocadas (ATUALIZAR / IMPORTAR)${post === esperado ? "" : " — veio: " + post}`],
        [passos.every(Boolean), "todos os cliques acharam o controle"]
      ];
      return tr;
    }
  },
  {
    nome: "exportar o rol (XLSX.writeFile)", perfil: "geral",
    async rodar(s, srv, ctx) {
      const passos = [];
      passos.push(await clicar(s, ".card-modulo", "Pessoas & Membresia"));
      passos.push(await clicar(s, "#btnSubPessoasBuscar"));
      await s.avaliar(() => window.__reg.zerar());
      const marca = srv.marca();
      passos.push(await clicar(s, "button", "Exportar"));
      passos.push(await clicar(s, "#modalConfirmar"));
      const tr = await coletar(s, srv, marca);
      const d = (tr.downloads || [])[0];
      const obj = (tr.objetos || [])[0];
      let linhas = null;
      if (obj && obj.b64) {
        const XLSX = require(path.join(ctx.original, "vendor", "xlsx.full.min.js"));
        const wb = XLSX.read(Buffer.from(obj.b64, "base64"), { type: "buffer" });
        linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        tr.extra = { abas: wb.SheetNames, linhas };
        delete obj.b64;
      }
      tr.conferencias = [
        [tr.api.some(a => a.startsWith("POST /api/pessoas/exportar")), "passou pelo servidor (auditoria) antes de gerar"],
        [!!d && d.nome === "rol-de-membros.xlsx", `download rol-de-membros.xlsx (veio ${d && d.nome})`],
        [!!linhas && linhas.length === 6 && linhas[0].includes("Matrícula") && linhas[0].includes("Nome") && String(linhas[1]).includes("Nome A"), `planilha com cabeçalho + as 5 pessoas da lista (veio ${JSON.stringify(linhas && linhas.slice(0, 3)).slice(0, 200)})`],
        [passos.every(Boolean), "todos os cliques acharam o controle"]
      ];
      return tr;
    }
  },
  {
    nome: "imprimir carta (Meu Painel → Cartas)", perfil: "geral",
    async rodar(s, srv) {
      const passos = [await clicar(s, "#btnSubMeupainelCartas")];
      await s.avaliar(() => window.__reg.zerar());
      const marca = srv.marca();
      passos.push(await clicar(s, "#subMeupainelCartas button", "Imprimir"));
      const tr = await coletar(s, srv, marca);
      const j = (tr.janelas || [])[0] || {}, html = (tr.htmlJanelas || [])[0] || "";
      tr.conferencias = [
        [tr.janelas.length === 1, `uma janela de impressão (veio ${tr.janelas.length})`],
        [/CARTA DE RECOMENDAÇÃO/.test(html) && /Nome [A-E]/.test(html), "HTML da carta escrito (cabeçalho e nome da pessoa)"],
        [j.impresso === 1 && j.docFechado === 1, `document.close() e print() chamados (print=${j.impresso}, close=${j.docFechado})`],
        [passos.every(Boolean), "todos os cliques acharam o controle"]
      ];
      return tr;
    }
  },
  {
    nome: "imprimir certificado (Meu Painel → Minha Formação)", perfil: "geral",
    async rodar(s, srv) {
      const passos = [await clicar(s, "#btnSubMeupainelMinhaformacao")];
      await s.avaliar(() => window.__reg.zerar());
      const marca = srv.marca();
      passos.push(await clicar(s, "#subMeupainelMinhaformacao button", "Imprimir"));
      const tr = await coletar(s, srv, marca);
      const j = (tr.janelas || [])[0] || {}, html = (tr.htmlJanelas || [])[0] || "";
      tr.conferencias = [
        [tr.janelas.length === 1, `uma janela de impressão (veio ${tr.janelas.length})`],
        [/CERTIFICADO/.test(html) && /verificar\.html/.test(html) && /data:image\/svg\+xml/.test(html), "HTML do certificado com o QR (data:) e o endereço de verificação"],
        [tr.api.some(a => /^GET \/api\/certificados\/\d+\/qr/.test(a)), "QR pedido ao servidor pela sessão"],
        [j.impresso === 1, `print() chamado (print=${j.impresso})`],
        [passos.every(Boolean), "todos os cliques acharam o controle"]
      ];
      return tr;
    }
  },
  ...[["VALI", "Certificado autêntico e válido"], ["VENC", "validade vencida"], ["REVO", "REVOGADO"], ["INTE", "Não foi possível confirmar"], ["NAOE", "Certificado não encontrado"]].map(([pref, txt]) => ({
    nome: `verificar.html?c=${pref}… (${txt})`, perfil: "anonimo", pagina: `verificar.html?c=${pref}AAAABBBBCCCC`,
    async rodar(s, srv) {
      const tr = await coletar(s, srv, 0);
      tr.conferencias = [[tr.retrato.texto.includes(txt), `resultado mostra "${txt}"`], [tr.api.includes(`GET /api/verificacao-certificado/${pref}AAAABBBBCCCC`), "consultou a API com o código limpo"]];
      return tr;
    }
  })),
  {
    nome: "verificar.html: código digitado + botão, e código incompleto", perfil: "anonimo", pagina: "verificar.html",
    async rodar(s, srv) {
      await s.avaliar(() => { document.getElementById("codigo").value = "vali-1234-abcd-9999"; });
      await clicar(s, "#botao");
      const t1 = await s.avaliar(() => document.getElementById("resultado").innerText);
      const campo = await s.avaliar(() => document.getElementById("codigo").value);
      await s.avaliar(() => { document.getElementById("codigo").value = "ABC"; });
      await clicar(s, "#botao");
      const tr = await coletar(s, srv, 0);
      tr.conferencias = [
        [/autêntico e válido/.test(t1), "código digitado e enviado pelo botão: válido"],
        [campo === "VALI-1234-ABCD-9999", `código formatado no campo (veio ${campo})`],
        [/Código incompleto/.test(tr.retrato.texto), "código incompleto avisado sem chamar a API"],
        [tr.api.length === 1, `uma chamada só à API (veio ${tr.api.length})`],
        [tr.retrato.url.indexOf("?") < 0, "o formulário não navegou (preventDefault)"]
      ];
      return tr;
    }
  }
];

async function rodarCenario(nav, pasta, csp, cen, ctx) {
  // pasta = caminho local, ou { remoto: url } (front real, /api simulado por interceptação)
  const srv = typeof pasta === "object" ? criarRemoto({ url: pasta.remoto, permissoes: ctx.modelo.permissoes }) : await criarServidor({ raiz: pasta, porta: ctx.porta, csp, permissoes: ctx.modelo.permissoes });
  const s = new Sessao(nav, srv, ctx.modelo, ctx.arqs, "especial-" + cen.nome);
  s.guardarBlobs = true;
  let tr;
  try {
    await s.abrir(cen.perfil, cen.pagina);
    if (!cen.pagina) await s.login(cen.perfil);
    tr = await cen.rodar(s, srv, ctx);
  } catch (e) { tr = { falhaDoEquipamento: String(e && e.message || e).slice(0, 300), conferencias: [[false, "cenário rodou até o fim"]] }; }
  finally { await s.fechar(); await srv.fechar(); }
  return tr;
}

async function rodarEspeciais(nav, ctx) {
  const { log } = ctx;
  let ok = true;
  for (const cen of CENARIOS) {
    const A = await rodarCenario(nav, ctx.original, false, cen, ctx);
    const B = ctx.nova ? await rodarCenario(nav, ctx.nova, ctx.cspNova !== false, cen, ctx) : null;
    const confA = (A.conferencias || []).filter(c => !c[0]).map(c => c[1]);
    const confB = B ? (B.conferencias || []).filter(c => !c[0]).map(c => c[1]) : [];
    const dif = B ? compararAcao(A, B) : [];
    const csp = B ? (B.cspTotal || B.csp || []).map(v => (typeof v === "string" ? { diretiva: v, bloqueado: "", amostra: "", fonte: "", linha: "" } : v)) : [];
    const bom = confA.length === 0 && confB.length === 0 && dif.length === 0 && csp.length === 0 && !(A.erros || []).length && !(B && (B.erros || []).length);
    if (!bom) ok = false;
    log(`  ${bom ? "OK   " : "FALHA"} ${cen.nome} — ${(A.conferencias || []).length} conferências${B ? ", original × nova " + (dif.length ? "DIFERENTES" : "iguais") + ", CSP " + csp.length : ""}`);
    for (const c of confA) log(`        original: não conferiu — ${c}`);
    for (const c of confB) log(`        nova: não conferiu — ${c}`);
    for (const e of (A.erros || [])) log(`        original: erro — ${e}`);
    for (const e of ((B && B.erros) || [])) log(`        nova: erro — ${e}`);
    for (const v of csp.slice(0, 5)) log(`        CSP: ${v.diretiva} ${v.bloqueado} ${v.amostra ? "«" + v.amostra + "»" : ""} ${v.fonte}${v.linha ? ":" + v.linha : ""}`);
    if (csp.length > 5) log(`        (+${csp.length - 5} violações de CSP)`);
    if (dif.length) log(dif.slice(0, 30).map(x => "      " + x).join("\n"));
  }
  return { ok };
}

module.exports = { rodarEspeciais, CENARIOS };
