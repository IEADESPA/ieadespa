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

// (os códigos e as chaves são identificadores: o servidor só os aceita em [A-Z0-9_] — validarTipoMarco/validarEtapa — então não carregam HTML)
const CAMPOS_TEXTO = ["nome", "descricao", "fonteRotulo", "trilhaNome", "mensagem", "preRequisitosPendentes", "MARCO", "BATISMO_AGUAS", "TRILHA", "SERVICO_VOLUNTARIO"];
function envenenar(v, chave) {
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" && CAMPOS_TEXTO.includes(chave) ? `${x} ${ATAQUE}` : envenenar(x)));
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
  for (const k of ["catalogo", "funilLocal", "funilGeral", "parados", "pessoa", "minha", "minhaVazia", "posBatismal"]) ok(REAL[k] && REAL[k].sucesso, `o e2e-62 gravou a resposta real de ${k}`);
  ok(["etapas", "tiposMarco", "fontes", "trilhas"].every((k) => k in REAL.catalogo) && REAL.catalogo.etapas.every((e) => ["etapaId", "chave", "fonte", "tipoMarco", "preRequisitos", "geraAcompanhamento", "ativa"].every((k) => k in e)), "catálogo: os campos que a tela lê");
  ok(["proximo", "iniciada", "etapas"].every((k) => k in REAL.pessoa.caminhada) && ["total", "etapas", "diasParado"].every((k) => k in REAL.funilGeral), "caminhada e funil: o próximo passo, o total e as etapas");
  ok(REAL.funilGeral.congregacoes.length >= 2, "o funil do nível geral tem mais de uma congregação (a tabela 'Todas')");
  ok(REAL.posBatismal.caminhada.etapas.some((e) => e.posBatismal), "uma caminhada com o batismo antes do curso (pós-batismal)");
  ok(REAL.catalogo.tiposMarco.some((t) => !t.ativo), "um tipo de marco desativado no catálogo");
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
  ok(!amb.e("discCatalogo").hidden && amb.e("discEtapasLista").textContent.includes(R.catalogo.etapas[0].nome) && amb.e("discTiposLista").textContent.includes(R.catalogo.tiposMarco[0].nome), "o catálogo aparece, com o que veio do servidor");
  ok(/Todas/.test(amb.e("discFunil").textContent), "mais de uma congregação: a tabela 'Todas'");
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
  amb.__respostas["GET discipulado/pessoa"] = { corpo: R.posBatismal };
  amb.ctx._membroPerfilAtual = 17;
  await amb.g("discCarregarCaminhadaPerfil")(17);
  ok(/Discipulado Pós-Batismal/.test(amb.e("discCaminhadaPerfil").textContent), "o batismo antes do curso: o Discipulado Pós-Batismal (Art. 70 §5º)");
  delete amb.__respostas["GET discipulado/pessoa"];
  await amb.g("discPreencherTiposMarco")();
  const opcoes = [...amb.e("marcoTipo").options].map((o) => o.value);
  const inativo = R.catalogo.tiposMarco.find((t) => !t.ativo);
  ok(!opcoes.includes(inativo.codigo), "o tipo desativado não aparece no formulário de marco", opcoes);
  ok(opcoes.includes("CONVERSAO") && !opcoes.includes("BATISMO_ESPIRITO_SANTO"), "o formulário de marco: os tipos do catálogo, sem o 'só do nível geral' para a liderança local", opcoes);
  semAtaque(amb, "caminhada");
  const geral = montar({ gerais: ["pessoas"] });
  await geral.g("discPreencherTiposMarco")();
  ok([...geral.e("marcoTipo").options].map((o) => o.value).includes("BATISMO_ESPIRITO_SANTO"), "o nível geral vê o batismo no Espírito Santo");

  // o catálogo de formato estranho (o simulador do teste de tela responde assim): o "Corrigir marco" não quebra
  const estranho = montar();
  estranho.__respostas["GET discipulado/catalogo"] = { corpo: { sucesso: true } };
  await estranho.g("discCarregarCatalogo")();
  ok(estranho.g("discCatalogo") === null && estranho.g("discNomeTipoMarco")("CONVERSAO") === null, "catálogo sem as listas: não vale, e o nome do tipo não quebra");
  console.log("== saída da sessão ==");
  const sai = montar({ gerais: ["pessoas"] });
  await sai.g("discAbrirSubAba")();
  await sai.ocioso();
  await sai.g("discVerParadosAcao")(...args(botoes(sai, "discFunil", "discVerParadosAcao")[0]));
  await sai.g("discPreencherTiposMarco")();
  sai.ctx._membroPerfilAtual = 15;
  await sai.g("discCarregarCaminhadaPerfil")(15);
  await sai.g("discCarregarMinhaCaminhada")();
  ok(sai.e("discFunil").innerHTML !== "" && sai.e("discParadosLista").innerHTML !== "" && sai.e("discEtapasLista").innerHTML !== "" && sai.e("marcoTipo").options.length > 0, "antes de sair, tudo carregado");
  sai.g("discLimparTela")();
  ok(["discFunil", "discParadosLista", "discEtapasLista", "discTiposLista", "discCaminhadaPerfil", "discMinhaCaminhada", "marcoTipo"].every((idEl) => sai.e(idEl).innerHTML === "")
    && sai.e("discParados").hidden && sai.e("discCatalogo").hidden && sai.g("discCatalogo") === null, "saiu: o funil, os parados, o catálogo, as caminhadas e os tipos do marco somem");
  // a resposta que chega depois da troca de login não volta para a tela
  const atr = montar();
  const ret = atr.retem((c) => c.chave === "GET discipulado/funil");
  const atrasada = atr.g("discCarregarFunilAcao")();
  await atr.ocioso();
  atr.g("discLimparTela")();
  atr.sessao({ matricula: 2002, token: "tok-b", nivel: "CONGREGACAO", permissoes: ["pessoas"], geral: false });
  ret.liberar(); await atrasada; await atr.ocioso();
  ok(atr.e("discFunil").innerHTML === "" && atr.g("discFunilAtual") === null, "a resposta atrasada do login anterior não aparece para o novo");
  // a "Minha caminhada" pedida por A e respondida depois que B entrou (sem passar pela limpeza): só a conferência do login segura
  const mc = montar();
  const retM = mc.retem((c) => c.chave === "GET discipulado/minha");
  const pm = mc.g("discCarregarMinhaCaminhada")();
  await mc.ocioso();
  mc.sessao({ matricula: 2003, token: "tok-c", nivel: "CONGREGACAO", permissoes: ["pessoas"], geral: false });
  retM.liberar(); await pm; await mc.ocioso();
  ok(mc.e("discMinhaCaminhada").innerHTML === "", "a caminhada de A não aparece para B", mc.e("discMinhaCaminhada").textContent.slice(0, 80));
  // dois "Atualizar" seguidos: vale o último
  const dois = montar();
  const ret1 = dois.retem((c) => c.chave === "GET discipulado/funil" && c.consulta.diasParado === "30");
  dois.e("discDiasParado").value = "30";
  const p1 = dois.g("discCarregarFunilAcao")();
  await dois.ocioso();
  dois.__respostas["GET discipulado/funil"] = { corpo: { ...R.funilLocal, diasParado: 180 } };
  dois.e("discDiasParado").value = "180";
  await dois.g("discCarregarFunilAcao")();
  ret1.liberar(); await p1; await dois.ocioso();
  ok(/180 dias/.test(dois.e("discFunil").textContent) && !/ 30 dias/.test(dois.e("discFunil").textContent), "dois 'Atualizar' seguidos: a tela fica com o último filtro");
  return { total, falhas };
}

const MUTACOES = [
  ["tirar o escape do nome da etapa na caminhada", ['<strong>${escaparHtmlEbd(e.nome)}</strong>${e.feita', "<strong>${e.nome}</strong>${e.feita"]],
  ["mostrar o catálogo à liderança local", ['discEl("discCatalogo").hidden = !geral;', 'discEl("discCatalogo").hidden = false;']],
  ["oferecer o 'só do nível geral' a todos", ['cat.tiposMarco.filter((t) => t.ativo && (!t.soNivelGeral || geralPara("pessoas")))', "cat.tiposMarco.filter((t) => t.ativo)"]],
  ["esquecer o funil na saída", ['for (const idEl of ["discFunil", "discParadosLista",', 'for (const idEl of ["discParadosLista",']],
  ["não conferir o login depois do pedido", ["return authToken === token ? data : null;", "return data;"]],
  ["não conferir o pedido mais recente do funil", ["if (data === null || pedido !== discPedidoFunil) return;", "if (data === null) return;"]]
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
