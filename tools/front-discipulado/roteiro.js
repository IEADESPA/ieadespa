// roteiro.js — prova da tela da v8.5 (Trilha de discipulado) sem navegador: o index.html de verdade, o eventos.js e o modulos/discipulado.js inteiros, num DOM simulado
// (tools/front-cuidado/ambiente.js). As respostas do servidor vêm de contrato-real.json — gravado pelo e2e-62 com os handlers e o banco REAIS
// (`E2E_CONTRATO=1 BASE=cenario-escada bash rodar.sh roteiro e2e-62-discipulado.js` em tools/e2e-localdb) — com texto de ataque em todo campo de texto.
// Rodar: node roteiro.js (da pasta tools/front-discipulado). MUTAR=1 roda também as mutações (cada uma precisa ser acusada).
"use strict";
const { criarAmbiente, extrair, lerApp } = require("../front-cuidado/ambiente");
const REAL = require("./contrato-real.json");

const ATAQUE = '<img src=x onerror="__xss(1)">';
let total = 0, falhas = 0;
const ok = (c, d, det) => { total++; if (!c) { falhas++; if (!process.env.CALADO) console.log(`  ✗ ${d}${det !== undefined ? ` — ${JSON.stringify(det).slice(0, 300)}` : ""}`); } else if (process.env.LISTA) console.log(`  ✓ ${d}`); };

const CAMPOS_TEXTO = ["nome", "descricao", "fonteRotulo", "trilhaNome", "mensagem"];
function envenenar(v, chave) {
  if (Array.isArray(v)) return v.map((x) => envenenar(x));
  if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = envenenar(x, k); return o; }
  if (typeof v === "string" && CAMPOS_TEXTO.includes(chave)) return `${v} ${ATAQUE}`;
  return v;
}
const R = envenenar(REAL);
var MUTADO = null;

function montar({ permissoes = ["pessoas"], gerais = [] } = {}) {
  const amb = criarAmbiente({ semModulo: true });
  const { ev } = amb;
  ev(extrair("script.js", ["jsonDaTela", "geralPara"]), "script.js(extra)");
  ev(`var authPermissoesGerais = ${JSON.stringify(gerais)};`, "permissoes-gerais");
  ev(MUTADO || lerApp("modulos/discipulado.js"), "discipulado.js");
  amb.sessao({ matricula: 1002, token: "tok", nivel: gerais.length ? "GLOBAL" : "CONGREGACAO", permissoes, geral: gerais.length > 0 });
  amb.__respostas = {};
  amb.api.servidor = (c) => {
    if (amb.__respostas[c.chave]) return amb.__respostas[c.chave];
    if (c.chave === "GET discipulado/catalogo") return { corpo: R.catalogo };
    if (c.chave === "GET discipulado/funil") return { corpo: gerais.length ? R.funilGeral : R.funilLocal };
    if (c.chave === "GET discipulado/parados") return { corpo: R.parados };
    if (c.chave === "GET discipulado/pessoa") return { corpo: R.pessoa };
    if (c.chave === "GET discipulado/minha") return { corpo: R.minha };
    if (c.metodo === "POST") return { status: 200, corpo: { sucesso: true, mensagem: `Salvo ${ATAQUE}` } };
    return null;
  };
  return amb;
}
const semAtaque = (amb, onde) => ok(amb.ctx.__xss.chamadas.length === 0 && amb.doc._ataques.length === 0, `${onde}: nenhum texto do servidor virou código`, { xss: amb.ctx.__xss.chamadas, ataques: amb.doc._ataques.slice(0, 3) });
const todos = (amb, raizId) => { const raiz = amb.e(raizId); return raiz ? [...raiz.descendentes()] : []; };
const botoes = (amb, raizId, acao) => todos(amb, raizId).filter((b) => b.getAttribute("data-on-click") === acao);
const args = (b) => JSON.parse(b.getAttribute("data-args-click") || "[]");
const posts = (amb, caminho) => amb.api.chamadas.filter((c) => c.metodo === "POST" && c.caminho === caminho);
const gets = (amb, caminho) => amb.api.chamadas.filter((c) => c.metodo === "GET" && c.caminho === caminho);

async function prova() {
  total = 0; falhas = 0;
  console.log("== contrato real ==");
  for (const k of ["catalogo", "funilLocal", "funilGeral", "parados", "pessoa", "minha", "minhaVazia"]) ok(REAL[k] && REAL[k].sucesso, `o e2e-62 gravou a resposta real de ${k}`);
  ok(REAL.funilLocal.congregacoes.every((c) => ["congregacaoId", "nome", "iniciadas", "concluiram", "etapas"].every((k) => k in c)) && REAL.funilLocal.congregacoes[0].etapas.every((e) => ["etapaId", "nome", "fizeram", "proximoPasso", "parados"].every((k) => k in e)), "funil: os campos que a tela lê");
  ok(REAL.parados.itens.every((p) => ["membroId", "nome", "ultimoPasso", "diasSemPasso"].every((k) => k in p)), "parados: os campos que a tela lê");
  ok(REAL.pessoa.caminhada.etapas.every((e) => ["nome", "feita", "data", "fonteRotulo", "foraDeOrdem"].every((k) => k in e)), "caminhada: os campos que a tela lê");
  ok(REAL.minhaVazia.caminhada.iniciada === false, "a caminhada de quem ainda não começou");

  console.log("== a liderança local: o funil e quem parou ==");
  let amb = montar();
  await amb.g("discAbrirSubAba")();
  await amb.ocioso();
  const txt = amb.e("discFunil").textContent;
  ok(/Central E2E/.test(txt) && /na trilha/.test(txt), "o funil da congregação", txt.slice(0, 200));
  ok(amb.e("discCatalogo").hidden && gets(amb, "discipulado/catalogo").length === 0, "a liderança local não vê nem pede o catálogo");
  const verQuem = botoes(amb, "discFunil", "discVerParadosAcao");
  ok(verQuem.length > 0, "'ver quem' onde há parados");
  amb.doc.clicar(verQuem[0]);
  await amb.ocioso();
  const pp = gets(amb, "discipulado/parados")[0];
  ok(pp && pp.consulta.congregacaoId === String(args(verQuem[0])[0]) && pp.consulta.etapaId === String(args(verQuem[0])[1]) && pp.consulta.diasParado === "90", "pede os parados daquela congregação e etapa", pp && pp.consulta);
  ok(!amb.e("discParados").hidden && amb.e("discParadosLista").textContent.length > 0, "e mostra a lista");
  semAtaque(amb, "funil local");
  amb.e("discDiasParado").value = "30";
  amb.limparRegistro();
  await amb.g("discCarregarFunilAcao")();
  ok(gets(amb, "discipulado/funil")[0].consulta.diasParado === "30", "o filtro de dias vai ao servidor");

  console.log("== o nível geral: o catálogo ==");
  amb = montar({ gerais: ["pessoas"] });
  await amb.g("discAbrirSubAba")();
  await amb.ocioso();
  ok(!amb.e("discCatalogo").hidden && /Tipos de marco|Curso de Discipulado/.test(amb.e("discCatalogo").textContent), "o catálogo aparece");
  const editar = botoes(amb, "discEtapasLista", "discEditarEtapaAcao");
  ok(editar.length === R.catalogo.etapas.length, "um 'Editar' por etapa");
  const curso = R.catalogo.etapas.find((e) => e.chave === "CURSO_DISCIPULADO");
  amb.g("discEditarEtapaAcao")(curso.etapaId);
  ok(!amb.e("discFormEtapa").hidden && amb.e("discEtapaChave").value === "CURSO_DISCIPULADO" && amb.e("discEtapaFonte").value === curso.fonte, "o formulário abre com a etapa", amb.e("discEtapaFonte").value);
  ok(amb.e("discGrupoTrilha").hidden === (curso.fonte !== "TRILHA"), "a trilha aparece só na etapa de trilha");
  amb.doc.escolher(amb.e("discEtapaFonte"), "BATISMO_AGUAS");
  amb.g("discMudouFonteAcao")();
  ok(amb.e("discGrupoTipoMarco").hidden && amb.e("discGrupoTrilha").hidden, "batismo nas águas: nem marco nem trilha");
  amb.doc.escolher(amb.e("discEtapaFonte"), "MARCO");
  amb.g("discMudouFonteAcao")();
  amb.e("discEtapaTipoMarco").value = "CURSO_DISCIPULADO";
  amb.limparRegistro();
  amb.g("discSalvarEtapaAcao")();
  amb.g("discSalvarEtapaAcao")();
  await amb.ocioso();
  let p = posts(amb, "discipulado/etapa");
  ok(p.length === 1 && p[0].corpo.etapaId === curso.etapaId && p[0].corpo.fonte === "MARCO" && p[0].corpo.tipoMarco === "CURSO_DISCIPULADO" && Array.isArray(p[0].corpo.preRequisitos), "duplo clique: um envio, com a etapa", p.map((x) => x.corpo));
  ok(amb.e("discFormEtapa").hidden, "salva: o formulário fecha");
  amb.g("discEditarTipoAcao")("CONVERSAO");
  ok(amb.e("discTipoCodigo").value === "CONVERSAO" && amb.e("discTipoCodigo").readOnly === true && amb.e("discTipoUnico").checked === true, "editar tipo: o código fica travado");
  amb.g("discNovoTipoAcao")();
  amb.doc.digitar(amb.e("discTipoCodigo"), "classe_novos");
  amb.doc.digitar(amb.e("discTipoNome"), "Classe de novos");
  amb.limparRegistro();
  await amb.g("discSalvarTipoAcao")();
  p = posts(amb, "discipulado/tipo-marco");
  ok(p.length === 1 && p[0].corpo.codigo === "classe_novos" && p[0].corpo.ativo === true, "novo tipo: envia", p.map((x) => x.corpo));
  ok(amb.e("discResultado").textContent.includes("Salvo") && !amb.e("discResultado").innerHTML.includes("<img"), "a mensagem do servidor vira texto");
  semAtaque(amb, "catálogo");

  console.log("== a caminhada: o perfil e a minha; o formulário de marco ==");
  amb = montar();
  amb.ctx._membroPerfilAtual = 15;
  await amb.g("discCarregarCaminhadaPerfil")(15);
  const cam = amb.e("discCaminhadaPerfil").textContent;
  ok(/Próximo passo/.test(cam) && /✔/.test(cam) && /◻/.test(cam), "a caminhada no perfil, com o próximo passo", cam.slice(0, 160));
  ok(gets(amb, "discipulado/pessoa")[0].consulta.membroId === "15", "pede a pessoa certa");
  amb.ctx._membroPerfilAtual = 16;
  await amb.g("discCarregarCaminhadaPerfil")(15);
  ok(amb.e("discCaminhadaPerfil").textContent === "Carregando…", "outra pessoa aberta no meio: a resposta velha não sobrescreve", amb.e("discCaminhadaPerfil").textContent.slice(0, 80));
  await amb.g("discCarregarMinhaCaminhada")();
  ok(/Próximo passo|Trilha concluída/.test(amb.e("discMinhaCaminhada").textContent), "a minha caminhada");
  amb.__respostas["GET discipulado/minha"] = { corpo: R.minhaVazia };
  await amb.g("discCarregarMinhaCaminhada")();
  ok(/Ainda não há passos/.test(amb.e("discMinhaCaminhada").textContent), "quem não começou lê o convite, não uma lista vazia");
  await amb.g("discPreencherTiposMarco")();
  const opcoes = [...amb.e("marcoTipo").options].map((o) => o.value);
  ok(opcoes.includes("CONVERSAO") && !opcoes.includes("BATISMO_ESPIRITO_SANTO"), "o formulário de marco: os tipos do catálogo, sem o 'só do nível geral' para a liderança local", opcoes);
  semAtaque(amb, "caminhada");
  const geral = montar({ gerais: ["pessoas"] });
  await geral.g("discPreencherTiposMarco")();
  ok([...geral.e("marcoTipo").options].map((o) => o.value).includes("BATISMO_ESPIRITO_SANTO"), "o nível geral vê o batismo no Espírito Santo");

  console.log("== saída da sessão ==");
  amb.g("discLimparTela")();
  ok(amb.e("discFunil").innerHTML === "" && amb.e("discCaminhadaPerfil").innerHTML === "" && amb.e("discMinhaCaminhada").innerHTML === "" && amb.e("discParados").hidden, "saiu: o funil e as caminhadas somem");
  return { total, falhas };
}

const MUTACOES = [
  ["tirar o escape do nome da etapa na caminhada", ['<strong>${escaparHtmlEbd(e.nome)}</strong>${e.feita', "<strong>${e.nome}</strong>${e.feita"]],
  ["mostrar o catálogo à liderança local", ['discEl("discCatalogo").hidden = !geral;', 'discEl("discCatalogo").hidden = false;']],
  ["oferecer o 'só do nível geral' a todos", ['cat.tiposMarco.filter((t) => t.ativo && (!t.soNivelGeral || geralPara("pessoas")))', "cat.tiposMarco.filter((t) => t.ativo)"]]
];

(async () => {
  const r = await prova();
  console.log(`\nprova da tela da v8.5 (discipulado): ${r.total - r.falhas}/${r.total} verificações ok${r.falhas ? ` — ${r.falhas} FALHA(S)` : ""}`);
  let mutFalhou = 0;
  if (process.env.MUTAR) {
    const fonte = lerApp("modulos/discipulado.js");
    for (const [nome, [de, para]] of MUTACOES) {
      if (fonte.split(de).length !== 2) throw new Error(`mutação inaplicável: ${de}`);
      MUTADO = fonte.split(de).join(para);
      process.env.CALADO = "1";
      let m;
      try { m = await prova(); } catch (e) { m = { falhas: 1 }; }
      delete process.env.CALADO;
      MUTADO = null;
      console.log(`  mutação "${nome}": ${m.falhas ? `acusada (${m.falhas} falha(s))` : "NÃO acusada"}`);
      if (!m.falhas) mutFalhou++;
    }
  }
  process.exitCode = r.falhas || mutFalhou ? 1 : 0;
})().catch((e) => { console.log("ERRO", e); process.exit(1); });
