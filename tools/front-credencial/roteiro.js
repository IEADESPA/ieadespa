// roteiro.js — prova da tela da v8.4 (Credencial digital) sem navegador: o index.html de verdade, o eventos.js e as funções reais da credencial em
// modulos/pessoas.js (a sub-aba Credenciais da Secretaria Geral) e modulos/meu-painel.js (Minha Credencial), num DOM simulado (tools/front-cuidado/ambiente.js); e a
// página pública credencial.html com o credencial.js inteiros. As respostas do servidor vêm de contrato-real.json — gravado pelo e2e-59 com os handlers e o banco REAIS
// (`E2E_CONTRATO=1 BASE=cenario-escada bash rodar.sh roteiro e2e-59-credencial.js` em tools/e2e-localdb) — com texto de ataque em todo campo de texto.
// Rodar: node roteiro.js (da pasta tools/front-credencial). MUTAR=1 roda também as mutações (cada uma precisa ser acusada).
"use strict";
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const { criarAmbiente, extrair, lerApp } = require("../front-cuidado/ambiente");
const { Documento, carregarHtml } = require("../front-menores/dom");
const REAL = require("./contrato-real.json");

const ATAQUE = '<img src=x onerror="__xss(1)">';
let total = 0, falhas = 0;
const ok = (c, d, det) => { total++; if (!c) { falhas++; if (!process.env.CALADO) console.log(`  ✗ ${d}${det !== undefined ? ` — ${JSON.stringify(det).slice(0, 300)}` : ""}`); } else if (process.env.LISTA) console.log(`  ✓ ${d}`); };
const CAMPOS_TEXTO = ["nome", "categoria", "congregacao", "motivoEncerramento", "mensagem"];
function envenenar(v, chave) {
  if (Array.isArray(v)) return v.map((x) => envenenar(x));
  if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = envenenar(x, k); return o; }
  if (typeof v === "string" && CAMPOS_TEXTO.includes(chave)) return `${v} ${ATAQUE}`;
  return v;
}
const R = envenenar(REAL);
var MUTADO = {};   // texto mutado por arquivo (MUTAR=1)
const lerComMutacao = (rel) => (MUTADO[rel] !== undefined ? MUTADO[rel] : lerApp(rel));
const extrairDe = (rel, nomes) => { const orig = lerApp; void orig; const codigo = lerComMutacao(rel); return extrairDoTexto(codigo, nomes, rel); };
function extrairDoTexto(codigo, nomes, rel) {
  const parser = require(path.join(__dirname, "..", "..", "api", "node_modules", "@babel", "parser"));
  const ast = parser.parse(codigo, { sourceType: "script" });
  const achados = new Map();
  for (const n of ast.program.body) {
    if (n.type === "FunctionDeclaration" && nomes.includes(n.id.name)) achados.set(n.id.name, codigo.slice(n.start, n.end));
    if (n.type === "VariableDeclaration") for (const d of n.declarations) if (d.id.type === "Identifier" && nomes.includes(d.id.name)) achados.set(d.id.name, codigo.slice(n.start, n.end));
  }
  const falta = nomes.filter((x) => !achados.has(x));
  if (falta.length) throw new Error(`extrair(${rel}): não achei ${falta.join(", ")}`);
  return nomes.map((x) => achados.get(x)).join("\n");
}

const DA_PESSOAS = ["ROTULO_SITUACAO_CREDENCIAL", "credCache", "credOcupada", "credDataBr", "credLimparTela", "credCarregarListaAcao", "credFiltrarAcao", "credPost", "credEmitirAcao",
  "credEmitirLoteAcao", "credNovaViaAcao", "credCancelarAcao", "credMarcarImpressaAcao", "credBaixarPdf", "credPdfDeAcao", "TITULOS_SUB_PESSOAS", "mostrarSubAbaPessoas"];
const DO_PAINEL = ["ROTULO_SITUACAO_AGORA", "credMinhaOcupada", "credCarregarMinhaAcao", "credBaixarMinhaAcao", "credPedirImpressaoAcao"];

function montar({ permissoes = ["pessoas"], gerais = ["pessoas"] } = {}) {
  const amb = criarAmbiente({ semModulo: true });
  const { ev } = amb;
  ev(extrair("script.js", ["jsonDaTela", "avisarResultado", "pedirTexto", "geralPara"]), "script.js(extra)");
  ev(`var authPermissoesGerais = ${JSON.stringify(gerais)}; var subAbaPessoasAtual = "buscar";`, "permissoes-gerais");
  ev("function moverFormPessoaPara() {} function limparFormPessoa() {} function carregarFilaAprovacoes() {}", "stubs-pessoas");
  ev(extrairDe("modulos/pessoas.js", DA_PESSOAS), "pessoas.js(credencial)");
  ev(extrairDe("modulos/meu-painel.js", DO_PAINEL), "meu-painel.js(credencial)");
  ev("registrarAcoes({ credEmitirAcao, credEmitirLoteAcao, credFiltrarAcao, credNovaViaAcao, credCancelarAcao, credMarcarImpressaAcao, credPdfDeAcao, credBaixarMinhaAcao, credPedirImpressaoAcao, mostrarSubAbaPessoas });", "acoes");
  amb.sessao({ matricula: 9202, token: "tok", nivel: gerais.length ? "GLOBAL" : "CONGREGACAO", permissoes, geral: gerais.length > 0 });
  amb.__minha = R.minha;
  amb.__respostas = {};
  // o QR vem como texto (SVG): o simulador da resposta só tem json(); aqui ganha o text() do navegador
  const fetchOriginal = amb.ctx.fetch;
  amb.ctx.fetch = async (url, opts) => { const r = await fetchOriginal(url, opts); if (/credenciais\/qr/.test(String(url))) r.text = async () => '<svg xmlns="http://www.w3.org/2000/svg"></svg>'; return r; };
  amb.api.servidor = (c) => {
    if (c.chave === "GET credenciais") return { corpo: R.lista };
    if (c.chave === "GET credenciais/minha") return { corpo: amb.__minha };
    if (c.chave === "GET credenciais/qr") return { corpo: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', naoJson: true };
    if (amb.__respostas[c.chave]) return amb.__respostas[c.chave];
    if (c.metodo === "POST") return { status: 200, corpo: { sucesso: true, mensagem: "ok" } };
    return null;
  };
  return amb;
}
// <img> legítimas (a foto do cadastro e o QR em data:) não contam; texto do servidor que vira tag conta
const ataques = (amb) => amb.doc._ataques.filter((a) => !(a.tag === "img" && a.atributo === "(tag)" && (/^data:image\/svg\+xml/.test(a.valor) || /blob\.core\.windows\.net/.test(a.valor))));
const semAtaque = (amb, onde) => ok(amb.ctx.__xss.chamadas.length === 0 && ataques(amb).length === 0, `${onde}: nenhum texto do servidor virou código`, { xss: amb.ctx.__xss.chamadas, ataques: ataques(amb).slice(0, 3) });
const todos = (amb, raizId) => { const raiz = amb.e(raizId); return raiz ? [...raiz.descendentes()] : []; };
const botoes = (amb, raizId, acao) => todos(amb, raizId).filter((b) => b.getAttribute("data-on-click") === acao);
const posts = (amb, caminho) => amb.api.chamadas.filter((c) => c.metodo === "POST" && c.caminho === caminho);
const args = (b) => JSON.parse(b.getAttribute("data-args-click") || "[]");

// A página pública: o credencial.html e o credencial.js inteiros, num documento próprio; o fetch devolve a resposta real (envenenada).
async function paginaPublica(resposta, codigoNaUrl) {
  const doc = new Documento();
  carregarHtml(doc, lerComMutacao("credencial.html"));
  const chamadas = [];
  const xss = [];
  const ctx = vm.createContext({
    document: doc, console: { log() {}, error() {} }, URLSearchParams,
    location: { search: codigoNaUrl ? `?c=${encodeURIComponent(codigoNaUrl)}` : "" },
    fetch: async (url) => { chamadas.push(String(url)); return { json: async () => resposta }; },
    __xss: (x) => xss.push(x)
  });
  doc._executar = (codigo) => { try { vm.runInContext(codigo, ctx); } catch (e) { /* só importa se rodou */ } };
  // o formulário da página registra o envio com addEventListener (o simulador de elemento não tem: anota aqui)
  const form = doc.getElementById("form");
  form.addEventListener = (tipo, fn) => { form.__ouvinte = fn; };
  vm.runInContext(lerComMutacao("credencial.js"), ctx, { filename: "credencial.js" });
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  return { doc, chamadas, xss, texto: doc.getElementById("resultado").textContent, html: doc.getElementById("resultado").innerHTML };
}

async function prova() {
  total = 0; falhas = 0;
  console.log("== contrato real ==");
  for (const k of ["minha", "minhaSem", "publicaAtiva", "publicaObreiroInativo", "publicaSubstituida", "lista", "publicaNaoEncontrada", "publicaCancelada"]) ok(REAL[k] != null, `o e2e-59 gravou ${k}`);
  ok(["nome", "categoria", "congregacao", "matricula", "via", "codigo", "url", "situacaoAgora", "emitidaEm"].every((k) => k in REAL.minha.credencial), "Minha credencial: os campos que a tela lê");
  ok(REAL.lista.itens.every((c) => !c.codigo), "a lista da Secretaria nunca traz o código (o segredo do QR)");
  ok(Object.keys(REAL.publicaAtiva).every((k) => ["sucesso", "situacao", "nome", "categoria", "congregacao", "via", "funcao", "consultadoEm"].includes(k)), "a resposta pública só com o mínimo");

  console.log("== Minha Credencial (Meu Painel) ==");
  let amb = montar({ permissoes: [], gerais: [] });
  await amb.g("credCarregarMinhaAcao")();
  await amb.ocioso();
  let t = amb.e("credMinha").textContent;
  const mc = REAL.minha.credencial;
  ok(t.includes(mc.nome) && t.includes(mc.categoria) && t.includes(mc.codigo) && /sem data de validade/.test(t) && /Ativa/.test(t) && /habilitado/.test(t), "o cartão com nome, categoria, código, sem validade e a situação de agora", t.slice(0, 200));
  ok(todos(amb, "credMinha").some((x) => x.localName === "img" && /^data:image\/svg\+xml/.test(x.getAttribute("src") || "")), "o QR (SVG pela sessão, como data:)");
  ok(botoes(amb, "credMinha", "credPedirImpressaoAcao").length === 1 && botoes(amb, "credMinha", "credBaixarMinhaAcao").length === 1, "baixar o PDF e pedir a impressão");
  semAtaque(amb, "Minha Credencial");
  amb.__respostas["POST credenciais/pedir-impressao"] = { corpo: { sucesso: true, mensagem: "Pedido enviado à Secretaria Geral." } };
  amb.limparRegistro();
  amb.g("credPedirImpressaoAcao")();
  const pergunta = await amb.responderModal(true);
  await amb.ocioso();
  ok(pergunta.aberto && /gratuita/.test(pergunta.texto) && posts(amb, "credenciais/pedir-impressao").length === 1 && /Pedido enviado/.test(amb.e("credMinhaResultado").textContent), "pedir a impressão: confirma, envia e avisa");
  amb.__minha = R.minhaSem;
  await amb.g("credCarregarMinhaAcao")();
  ok(/ainda não foi emitida/.test(amb.e("credMinha").textContent) && /gratuita/.test(amb.e("credMinha").textContent), "sem credencial: diz que a Secretaria Geral emite, de graça");
  // resposta atrasada depois da saída: descartada
  amb.__minha = R.minha;
  const ret = amb.retem((c) => c.chave === "GET credenciais/minha");
  amb.g("credCarregarMinhaAcao")();
  await amb.ocioso();
  amb.g("limparSessao")();
  ret.liberar();
  await amb.ocioso();
  ok(amb.e("credMinha").innerHTML === "", "a credencial que chega depois da saída não aparece");

  console.log("== Credenciais (Pessoas, Secretaria Geral) ==");
  amb = montar();
  amb.g("mostrarSubAbaPessoas")("credenciais");
  await amb.ocioso();
  ok(amb.e("btnSubPessoasCredenciais").style.display !== "none" && amb.e("subPessoasCredenciais").style.display === "block", "no nível geral de 'pessoas': a sub-aba aparece e abre");
  t = amb.e("credLista").textContent;
  ok(R.lista.itens.slice(0, 5).every((c) => t.includes(REAL.lista.itens.find((x) => x.credencialId === c.credencialId).nome)) && /pedida em/.test(t), "a lista com os nomes e o pedido de impressão");
  ok(/sem credencial|têm credencial/.test(amb.e("credResultado").textContent), "quantos ainda não têm");
  semAtaque(amb, "lista de credenciais");
  const validas = REAL.lista.itens.filter((c) => c.situacao === "VALIDA");
  ok(botoes(amb, "credLista", "credNovaViaAcao").length === validas.length && botoes(amb, "credLista", "credCancelarAcao").length === validas.length, "nova via e cancelar só nas válidas");
  amb.doc.digitar(amb.e("credFiltro"), REAL.lista.itens[0].nome.slice(0, 12).toLowerCase());
  ok(todos(amb, "credLista").filter((x) => x.localName === "tr").length - 1 >= 1 && !amb.e("credLista").textContent.includes("Nenhuma"), "o filtro pelo nome");
  amb.doc.digitar(amb.e("credFiltro"), "zzzz-ninguem");
  ok(/Nenhuma credencial com esse filtro/.test(amb.e("credLista").textContent), "filtro sem resultado: diz isso");
  amb.doc.digitar(amb.e("credFiltro"), "");
  // emitir
  amb.limparRegistro();
  amb.g("credEmitirAcao")();
  await amb.ocioso();
  ok(posts(amb, "credenciais/emitir").length === 0 && /Informe a matrícula/.test(amb.e("credResultado").textContent), "sem matrícula: nem envia");
  amb.doc.digitar(amb.e("credMatricula"), "9203");
  amb.__respostas["POST credenciais/emitir"] = { status: 201, corpo: { sucesso: true, mensagem: "Credencial emitida (via 1)." } };
  amb.g("credEmitirAcao")(); amb.g("credEmitirAcao")();
  await amb.ocioso();
  let p = posts(amb, "credenciais/emitir");
  ok(p.length === 1 && p[0].corpo.membroId === 9203 && amb.e("credMatricula").value === "", "duplo clique: uma emissão, com a matrícula como número; o campo limpa", p.map((x) => x.corpo));
  // nova via e cancelar pedem o motivo
  amb.limparRegistro();
  amb.doc.clicar(botoes(amb, "credLista", "credNovaViaAcao")[0]);
  for (let i = 0; i < 30 && amb.e("modalOverlay").classList.contains("escondido"); i++) await new Promise((r) => setImmediate(r));
  const textoModal = amb.e("modalCaixa").textContent;
  amb.doc.digitar(amb.e("modalTexto"), "Perda do cartão");
  await amb.responderModal(true);
  await amb.ocioso();
  p = posts(amb, "credenciais/nova-via");
  ok(p.length === 1 && p[0].corpo.motivo === "Perda do cartão" && Number.isInteger(p[0].corpo.membroId) && /deixa de valer/.test(textoModal), "nova via: pede o motivo, avisa que a atual deixa de valer e envia", p.map((x) => x.corpo));
  amb.limparRegistro();
  amb.doc.clicar(botoes(amb, "credLista", "credCancelarAcao")[0]);
  await amb.responderModal(false);
  await amb.ocioso();
  ok(posts(amb, "credenciais/cancelar").length === 0, "cancelar sem motivo (desistiu): nada vai");
  amb.limparRegistro();
  const imp = botoes(amb, "credLista", "credMarcarImpressaAcao")[0];
  if (imp) {
    amb.doc.clicar(imp);
    await amb.responderModal(true);
    await amb.ocioso();
    p = posts(amb, "credenciais/impressa");
    ok(p.length === 1 && p[0].corpo.credencialId === args(imp)[0], "marcar impressa: confirma e envia a credencial certa");
  }
  amb.limparRegistro();
  amb.g("credEmitirLoteAcao")();
  await amb.responderModal(true);
  await amb.ocioso();
  ok(posts(amb, "credenciais/lote").length === 1, "lote: confirma e envia");
  // fora do nível geral: a sub-aba some e não abre
  const local = montar({ permissoes: ["pessoas"], gerais: [] });
  local.g("mostrarSubAbaPessoas")("credenciais");
  await local.ocioso();
  ok(local.e("btnSubPessoasCredenciais").style.display === "none" && local.e("subPessoasCredenciais").style.display === "none" && local.api.chamadas.filter((c) => c.chave === "GET credenciais").length === 0, "fora do nível geral: o botão some, a sub-aba não abre e nada é pedido");
  amb.g("limparSessao")();
  ok(amb.e("credLista").innerHTML === "" && amb.e("credMatricula").value === "", "saída: a lista some");

  console.log("== a página pública do QR ==");
  let pg = await paginaPublica(R.publicaAtiva, REAL.minha.credencial.codigo);
  ok(pg.chamadas.length === 1 && pg.chamadas[0].startsWith("/api/verificacao-credencial/"), "o QR abre a página e ela consulta sozinha", pg.chamadas);
  ok(/Credencial ativa/.test(pg.texto) && pg.texto.includes(REAL.publicaAtiva.nome) && /Habilitado/.test(pg.texto) && /Consultado em/.test(pg.texto), "ativa: nome, categoria, habilitado e a hora da consulta", pg.texto.slice(0, 200));
  ok(pg.xss.length === 0 && pg.doc._ataques.length === 0 && pg.texto.includes(ATAQUE), "o texto do servidor entra como TEXTO (nunca HTML)");
  pg = await paginaPublica(R.publicaObreiroInativo, REAL.minha.credencial.codigo);
  ok(/obreiro\(a\) inativo/i.test(pg.texto) && /não pode oficiar/.test(pg.texto), "obreiro inativo: diz que não pode oficiar no momento");
  pg = await paginaPublica(R.publicaSubstituida, REAL.minha.credencial.codigo);
  ok(/substituída/.test(pg.texto) && /não vale mais/.test(pg.texto), "substituída");
  pg = await paginaPublica(R.publicaCancelada, REAL.minha.credencial.codigo);
  ok(/cancelada/.test(pg.texto), "cancelada");
  pg = await paginaPublica(R.publicaNaoEncontrada, "ABCD-EFGH-JKLM-NPQR");
  ok(/não encontrada/.test(pg.texto) && /pode não ser autêntico/.test(pg.texto), "não encontrada: o documento pode não ser autêntico");
  pg = await paginaPublica(R.publicaAtiva, "ABC");
  ok(pg.chamadas.length === 0 && /Código incompleto/.test(pg.texto), "código incompleto: nem consulta");

  return { total, falhas };
}

const MUTACOES = [
  ["a página pública usar innerHTML na resposta", "credencial.js", ["if (texto !== undefined) e.textContent = texto;", "if (texto !== undefined) e.innerHTML = texto;"]],
  ["mostrar a sub-aba Credenciais fora do nível geral", "modulos/pessoas.js", ['document.getElementById("btnSubPessoasCredenciais").style.display = credGeral ? "" : "none";', 'document.getElementById("btnSubPessoasCredenciais").style.display = "";']],
  ["tirar o escape do nome no cartão", "modulos/meu-painel.js", ["<strong>${escaparHtmlEbd(c.nome)}</strong>", "<strong>${c.nome}</strong>"]]
];

(async () => {
  const r = await prova();
  console.log(`\nprova da tela da v8.4 (credencial): ${r.total - r.falhas}/${r.total} verificações ok${r.falhas ? ` — ${r.falhas} FALHA(S)` : ""}`);
  let mutFalhou = 0;
  if (process.env.MUTAR) {
    for (const [nome, rel, [de, para]] of MUTACOES) {
      const fonte = lerApp(rel);
      if (fonte.split(de).length !== 2) throw new Error(`mutação inaplicável (${rel}): ${de}`);
      MUTADO = { [rel]: fonte.split(de).join(para) };
      process.env.CALADO = "1";
      let m;
      try { m = await prova(); } catch (e) { m = { falhas: 1 }; }
      delete process.env.CALADO;
      MUTADO = {};
      console.log(`  mutação "${nome}": ${m.falhas ? `acusada (${m.falhas} falha(s))` : "NÃO acusada"}`);
      if (!m.falhas) mutFalhou++;
    }
  }
  process.exitCode = r.falhas || mutFalhou ? 1 : 0;
})().catch((e) => { console.log("ERRO", e); process.exit(1); });
