// roteiro.js — prova da tela da v9.5 (Mapa territorial) sem navegador: o index.html de verdade, o eventos.js, o modulos/expansao.js (a aba), o modulos/territorio.js (a
// pílula) e o modulos/endereco.js (o endereço em linhas) inteiros, num DOM simulado (tools/front-cuidado/ambiente.js). As respostas do servidor vêm de contrato-real.json —
// gravado pelo e2e-78 com os handlers e o banco REAIS (`E2E_CONTRATO=1 BASE=cenario-territorio bash rodar.sh roteiro e2e-78-territorio.js` em tools/e2e-localdb) — com
// texto de ataque em todo campo de texto. Rodar: node roteiro.js (da pasta tools/front-territorio). MUTAR=1 roda também as mutações (cada uma precisa ser acusada).
"use strict";
const fs = require("fs");
const path = require("path");
const { criarAmbiente, lerApp, extrair } = require("../front-cuidado/ambiente");
const REAL = require("./contrato-real.json");
const EXP = require("../front-expansao/contrato-real.json");

const ATAQUE = '<img src=x onerror="__xss(1)">';
let total = 0, falhas = 0;
const ok = (c, d, det) => { total++; if (!c) { falhas++; if (!process.env.CALADO) console.log(`  ✗ ${d}${det !== undefined ? ` — ${JSON.stringify(det).slice(0, 300)}` : ""}`); } else if (process.env.LISTA) console.log(`  ✓ ${d}`); };

// os campos de texto (códigos — tipo, situação, resultado, operador, indicador, chave, escopo — não; os rótulos, sim)
const CAMPOS_TEXTO = ["nome", "cidade", "maeNome", "observacao", "mensagem", "rotulo", "bairro", "extensao", "endereco", "logradouro", "numero", "complemento", "bairroNome", "bairroTexto"];
function envenenar(v, chave) {
  if (Array.isArray(v)) return v.map((x) => envenenar(x, undefined));
  if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = envenenar(x, k); return o; }
  if (typeof v === "string" && CAMPOS_TEXTO.includes(chave)) return `${v} ${ATAQUE}`;
  return v;
}
const R = envenenar(REAL);
// os critérios das respostas de leitura (a "observação" e o "rótulo" do indicador já vêm envenenados); a atos de Meus Dados, o indicador é rótulo (texto)
R.meusDadosLgpdSec.territorio.atos.criterios = R.meusDadosLgpdSec.territorio.atos.criterios.map((c) => ({ ...c, indicador: `${c.indicador} ${ATAQUE}` }));
R.criteriosDirigente.criterios[0] = { ...R.criteriosDirigente.criterios[0], observacao: `Régua da Mãe ${ATAQUE}` };
var MUTADO = null;   // { arquivo, texto }

function montar({ permissoes = ["expansao"], geral = true, catalogo = "catalogosGeral", mapa = "mapaGeral", simulacao = "simulacaoGeral", matricula = 1002 } = {}) {
  const amb = criarAmbiente({ semModulo: true });
  for (const arq of ["expansao", "territorio", "endereco"]) amb.ev(MUTADO && MUTADO.arquivo === arq ? MUTADO.texto : lerApp(`modulos/${arq}.js`), `${arq}.js`);
  amb.sessao({ matricula, token: "tok", nivel: geral ? "GLOBAL" : "CONGREGACAO", permissoes, geral });
  amb.__respostas = {};
  amb.api.servidor = (c) => {
    if (amb.__respostas[c.chave]) return amb.__respostas[c.chave];
    if (c.chave === "GET expansao/catalogos") return { corpo: geral ? EXP.catalogosGeral : EXP.catalogosDirigente };
    if (c.chave === "GET expansao/reunioes") return { corpo: EXP.reunioes };
    if (c.chave === "GET expansao/painel") return { corpo: EXP.painelVencido };
    if (c.chave === "GET expansao/pedidos") return { corpo: EXP.pedidosGeral };
    if (c.chave === "GET territorio/catalogos") return { corpo: R[catalogo] };
    if (c.chave === "GET territorio/mapa") return { corpo: R[mapa] };
    if (c.chave === "GET territorio/simulacao") return { corpo: R[simulacao] };
    if (c.chave === "GET territorio/bairros") return { corpo: R.bairros };
    if (c.chave === "GET territorio/criterios") return { corpo: R.criteriosDirigente };
    if (c.chave === "GET territorio/extensoes") return { corpo: R.extensoesDirigente };
    if (c.chave.startsWith("GET meus-dados/")) return { corpo: R.meusDadosGet };
    if (c.chave === "GET pessoas" && c.consulta.lista === "bairros") return { corpo: { sucesso: true, bairros: R.meusDadosGet.bairros } };
    if (c.metodo === "POST") return { status: 200, corpo: { sucesso: true, mensagem: `Salvo ${ATAQUE}`, membrosLigados: 2, membrosMovidos: 1, raioKm: 2 } };
    return null;
  };
  return amb;
}
// o simulador acusa toda tag <svg>; o desenho do território é um <svg> do próprio código (class ter-svg, só no terDesenho): ele é contado à parte
const svgsDoCodigo = (amb) => [...amb.doc.body.descendentes()].filter((x) => x.localName === "svg").every((x) => x.getAttribute("class") === "ter-svg" && x.parentNode && x.parentNode.id === "terDesenho");
const ataquesReais = (amb) => amb.doc._ataques.filter((a) => !(a.tag === "svg" && a.atributo === "(tag)" && svgsDoCodigo(amb)));
const semAtaque = (amb, onde) => ok(amb.ctx.__xss.chamadas.length === 0 && ataquesReais(amb).length === 0, `${onde}: nenhum texto do servidor virou código`, { xss: amb.ctx.__xss.chamadas, ataques: ataquesReais(amb).slice(0, 3) });
const todos = (amb, raizId) => { const raiz = amb.e(raizId); return raiz ? [...raiz.descendentes()] : []; };
const botoes = (amb, raizId, acao) => todos(amb, raizId).filter((b) => b.getAttribute("data-on-click") === acao);
const args = (b) => JSON.parse(b.getAttribute("data-args-click") || "[]");
const posts = (amb, caminho) => amb.api.chamadas.filter((c) => c.metodo === "POST" && c.caminho === caminho);
const gets = (amb, caminho) => amb.api.chamadas.filter((c) => c.metodo === "GET" && c.caminho === caminho);
const visivel = (amb, id) => amb.e(id) && amb.e(id).style.display !== "none";
async function abrirTerritorio(amb) { amb.g("mostrarAbaSecretaria")("expansao"); await amb.ocioso(); amb.g("expMostrarSecaoAcao")("territorio"); await amb.ocioso(); }
async function sub(amb, s) { amb.g("terMostrarSubAcao")(s); await amb.ocioso(); }
async function comConfirmacao(amb, fn, confirmar = true) { const pend = fn(); const modal = await amb.responderModal(confirmar); await pend; await amb.ocioso(); return modal; }
// a moldura (iframe) que o módulo criou, com uma janela de mentira que anota o que recebe
function moldura(amb, alvoId) {
  const f = amb.e(alvoId) && amb.e(alvoId).children.find((x) => x.localName === "iframe");
  if (f && !f.contentWindow) { f.__recebidas = []; f.contentWindow = { postMessage: (m, o) => f.__recebidas.push({ m: JSON.parse(JSON.stringify(m)), o }) }; }
  return f;
}
const mensagem = (amb, fonte, data) => amb.g("terMensagemDaMoldura")({ source: fonte, data });

async function prova() {
  total = 0; falhas = 0;
  console.log("== contrato real e ganchos ==");
  for (const k of ["catalogosGeral", "catalogosDirigente", "catalogosCMESemPermissao", "mapaGeral", "mapaDirigente", "mapaComFila", "bairros", "extensoesDirigente", "criteriosDirigente",
    "simulacaoGeral", "simulacaoDirigente", "meusDadosGet", "meusDadosLgpd", "meusDadosLgpdSec"]) ok(REAL[k] && REAL[k].sucesso, `o e2e-78 gravou a resposta real de ${k}`);
  ok(REAL.catalogosGeral.mapa.chave && REAL.catalogosDirigente.mapa.chave === null, "um catálogo com a chave do mapa e um sem");
  ok(REAL.simulacaoDirigente.extensoes.some((e) => e.podePedir) && REAL.mapaComFila.fila.length === 1, "uma Extensão que atende tudo e a fila de um bairro escrito");
  const html = lerApp("index.html"), sw = lerApp("service-worker.js");
  ok(/id="btnExpSecaoTerritorio"/.test(html) && /id="expSecaoTerritorio"/.test(html) && /modulos\/territorio\.js/.test(html) && /modulos\/endereco\.js/.test(html), "a pílula, a seção e os dois módulos no index.html");
  ok(/"\/modulos\/territorio\.js"/.test(sw) && /"\/modulos\/endereco\.js"/.test(sw) && /startsWith\("\/mapa-territorial\."\)\) return;/.test(sw) && !/mapa-territorial/.test(sw.match(/ARQUIVOS_SHELL = \[[^\]]*\]/)[0]),
    "os módulos na casca do aparelho; a página do mapa do Google passa direto e fica fora da casca");
  ok(/terCartaoMeusDados\(data\.territorio\)/.test(lerApp("modulos/meu-painel.js")) && /"territorio"\]/.test(lerApp("modulos/expansao.js")), "os ganchos: o cartão de Meus Dados e a seção na aba");
  const cfg = JSON.parse(lerApp("staticwebapp.config.json"));
  const rotaMapa = (cfg.routes || []).find((x) => x.route === "/mapa-territorial.html");
  const cspMapa = rotaMapa && rotaMapa.headers["Content-Security-Policy"];
  ok(cspMapa && /sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox/.test(cspMapa) && !/allow-same-origin/.test(cspMapa) && /frame-ancestors https:\/\/app\.ieadespa\.org\.br/.test(cspMapa),
    "a página do mapa: a política dela com sandbox (sem a mesma origem) e só o sistema pode emoldurá-la", cspMapa);
  ok(cfg.globalHeaders["Content-Security-Policy"].includes("script-src 'self';") && !/maps\.googleapis|maps\.gstatic|\*\.gstatic|\*\.google\.com/.test(cfg.globalHeaders["Content-Security-Policy"]), "o sistema continua com a política forte (nenhum endereço do Google)");
  const pagina = lerApp("mapa-territorial.html");
  ok(!/<script>/.test(pagina) && !/\son[a-z]+="/.test(pagina) && /src="mapa-territorial\.js"/.test(pagina), "a página do mapa sem código escrito dentro do HTML");
  ok(/ev\.source !== mae \|\| ev\.origin !== ORIGEM/.test(lerApp("mapa-territorial.js")) && /mae\.postMessage\(msg, ORIGEM\)/.test(lerApp("mapa-territorial.js")) && /tipo: "desenhado"/.test(lerApp("mapa-territorial.js"))
    && /motivo: "tempo"/.test(lerApp("mapa-territorial.js")), "a página do mapa confere a janela e a origem, responde só à origem do sistema, avisa quando desenhou e quando o Google não respondeu");
  ok(/ev\.source !== mae/.test(lerApp("mapa-territorial.js")) && /textContent/.test(lerApp("mapa-territorial.js")) && !/innerHTML/.test(lerApp("mapa-territorial.js")), "a página do mapa só ouve a moldura-mãe e nunca monta HTML com texto");

  console.log("== o mapa (nível geral, lista e desenho) ==");
  let amb = montar();
  await abrirTerritorio(amb);
  ok(amb.e("expSecaoTerritorio").style.display === "block" && amb.e("terSubMapa").style.display === "block", "a pílula abre no Mapa");
  ok(gets(amb, "territorio/catalogos").length === 1 && gets(amb, "territorio/mapa").length === 1, "lê o catálogo e o mapa");
  ok(visivel(amb, "btnTerSubBairros") && visivel(amb, "btnTerNovoCriterio"), "o nível geral vê os Bairros e o Novo critério");
  const resumo = amb.e("terResumo").textContent;
  ok(resumo.includes(String(REAL.mapaGeral.totais.membros)) && /sem localização/.test(resumo) && /no campo/.test(resumo), "o resumo: os membros, os sem localização, o campo todo", resumo.slice(0, 200));
  ok(amb.e("terModo").value === "lista" && !visivel(amb, "terMolduraGoogle"), "sem escolha guardada: a lista e desenho");
  const comPonto = REAL.mapaGeral.bairros.filter((b) => b.lat != null).length;
  ok(todos(amb, "terDesenho").filter((x) => x.localName === "circle").length === comPonto, "o desenho: um círculo por bairro com ponto");
  ok(todos(amb, "terDesenho").filter((x) => x.localName === "rect" || x.localName === "polygon").length === REAL.mapaGeral.unidades.filter((u) => u.lat != null).length, "e uma marca por unidade com ponto");
  const linhas = todos(amb, "terTabelaBairros").filter((x) => x.localName === "tr").length - 1;
  ok(linhas === REAL.mapaGeral.bairros.length, "a tabela por bairro: uma linha por bairro");
  ok(/Tenda Território E2E/.test(amb.e("terDensidade").textContent) && /Central E2E/.test(amb.e("terDensidade").textContent), "a tabela por unidade");
  ok(!/Central Um E2E/.test(amb.e("expSecaoTerritorio").textContent), "nenhum nome de membro na tela do mapa");
  semAtaque(amb, "o mapa");
  // o descoberto oferece o pedido de Extensão; o coberto, não
  amb.__respostas["GET territorio/mapa"] = { corpo: R.mapaComFila };
  await amb.g("terCarregarMapaAcao")(); await amb.ocioso();
  const pedirAqui = botoes(amb, "terTabelaBairros", "terAbrirPedidoAcao");
  const descobertos = REAL.mapaComFila.bairros.filter((b) => b.descoberto).length;
  ok(pedirAqui.length === descobertos && pedirAqui.every((b) => args(b)[0] === "ABERTURA_EXTENSAO"), "o bairro descoberto oferece \"Pedir Extensão aqui\" (e só ele)", { pedirAqui: pedirAqui.length, descobertos });
  const fila = botoes(amb, "terFila", "terNovoBairroAcao");
  ok(fila.length === 1 && String(args(fila[0])[0]).startsWith(REAL.mapaComFila.fila[0].nome), "a fila dos escritos com o botão Cadastrar");
  if (pedirAqui.length) {
    amb.doc.clicar(pedirAqui[0]); await amb.ocioso();
    ok(amb.e("expSecaoPedidos").style.display === "block" && amb.e("expNovoDetalhes").open && amb.e("expNovoTipo").value === "ABERTURA_EXTENSAO", "o atalho abre o pedido de Extensão da v9.2");
    ok(amb.e("expNovoBairro").value.startsWith(String(args(pedirAqui[0])[2]).split(" <")[0]) && amb.e("expNovoCidade").value !== "", "com o bairro e a cidade preenchidos");
  }
  semAtaque(amb, "o atalho do bairro descoberto");

  console.log("== o mapa do Google (a moldura) ==");
  amb = montar();
  await abrirTerritorio(amb);
  amb.doc.escolher(amb.e("terModo"), "google"); await amb.ocioso();
  let f = moldura(amb, "terMolduraGoogle");
  ok(f && f.getAttribute("sandbox") === "allow-scripts allow-popups allow-popups-to-escape-sandbox" && f.src === "mapa-territorial.html", "o Mapa do Google: a moldura com sandbox (sem a mesma origem) e a página separada");
  ok(amb.gravacoes.some((x) => x.onde === "localStorage" && x.valor === "google") && visivel(amb, "terMolduraGoogle") && amb.e("terDesenho").innerHTML === "", "a escolha fica guardada no aparelho; o desenho sai");
  mensagem(amb, { postMessage() { } }, { fonte: "ieadespa-mapa", tipo: "pronto" });
  ok(f.__recebidas.length === 0, "mensagem de outra janela: ignorada");
  mensagem(amb, f.contentWindow, { fonte: "ieadespa-mapa", tipo: "pronto" });
  ok(f.__recebidas.length === 1 && f.__recebidas[0].m.tipo === "desenhar" && f.__recebidas[0].m.chave === REAL.catalogosGeral.mapa.chave && f.__recebidas[0].m.modo === "ver", "a moldura pronta recebe o que desenhar e a chave");
  const enviado = JSON.stringify(f.__recebidas[0].m);
  ok(f.__recebidas[0].m.bairros.length === comPonto && !/Central Um|membroId|token|tok"/.test(enviado), "só os bairros com ponto, as unidades e os números — nada de pessoa nem de login", enviado.slice(0, 200));
  mensagem(amb, f.contentWindow, { fonte: "ieadespa-mapa", tipo: "pronto" });
  ok(f.__recebidas.length === 1, "a chave vai uma vez só");
  mensagem(amb, f.contentWindow, { fonte: "ieadespa-mapa", tipo: "clique", lat: -6.1, lng: -49.9 });
  ok(!amb.e("terBairroLat"), "o clique no mapa de ver não marca nada");
  mensagem(amb, f.contentWindow, { fonte: "ieadespa-mapa", tipo: "erro", motivo: "chave" });
  ok(!moldura(amb, "terMolduraGoogle") && !visivel(amb, "terMolduraGoogle") && todos(amb, "terDesenho").some((x) => x.localName === "svg") && /recusou a chave/.test(amb.e("terMsgMapa").textContent),
    "o Google recusou: a moldura sai e a lista e desenho volta, dizendo o motivo");
  ok(amb.e("terModo").value === "lista" && amb.gravacoes.filter((x) => x.onde === "localStorage").pop().valor === "lista", "e a escolha guardada volta para a lista (a próxima visita não fica esperando o Google)");
  amb.doc.escolher(amb.e("terModo"), "google"); await amb.ocioso();
  f = moldura(amb, "terMolduraGoogle");
  mensagem(amb, f.contentWindow, { fonte: "ieadespa-mapa", tipo: "pronto" });
  amb.dispararTemporizador(20000); await amb.ocioso();
  ok(!moldura(amb, "terMolduraGoogle") && todos(amb, "terDesenho").some((x) => x.localName === "svg") && /não abriu/.test(amb.e("terMsgMapa").textContent), "o Google sem resposta em 20 s: volta à lista e desenho");
  amb.doc.escolher(amb.e("terModo"), "google"); await amb.ocioso();
  f = moldura(amb, "terMolduraGoogle");
  mensagem(amb, f.contentWindow, { fonte: "ieadespa-mapa", tipo: "pronto" });
  mensagem(amb, f.contentWindow, { fonte: "ieadespa-mapa", tipo: "desenhado" });
  amb.dispararTemporizador(20000); await amb.ocioso();
  ok(moldura(amb, "terMolduraGoogle") && amb.e("terModo").value === "google", "desenhado a tempo: o prazo não derruba o mapa");
  const semChave = montar({ geral: false, catalogo: "catalogosDirigente", mapa: "mapaDirigente", simulacao: "simulacaoDirigente", matricula: 3001 });
  await abrirTerritorio(semChave);
  const opGoogle = semChave.e("terModo").options.find((o) => o.value === "google");
  ok(opGoogle.disabled && /sem a chave/.test(opGoogle.textContent), "sem a chave: o Mapa do Google aparece desligado");
  semChave.doc.escolher(semChave.e("terModo"), "google"); await semChave.ocioso();
  ok(!moldura(semChave, "terMolduraGoogle") && semChave.e("terModo").value === "lista", "e escolher o Google mesmo assim fica na lista");
  const chaveTorta = montar();
  chaveTorta.__respostas["GET territorio/catalogos"] = { corpo: { ...R.catalogosGeral, mapa: { ...R.catalogosGeral.mapa, chave: "Chave A" } } };
  chaveTorta.ctx.localStorage.setItem("ieadespa.territorio.modo", "google");
  await abrirTerritorio(chaveTorta);
  ok(chaveTorta.e("terModo").options.find((o) => o.value === "google").disabled && !moldura(chaveTorta, "terMolduraGoogle") && chaveTorta.e("terModo").value === "lista",
    "um texto que não tem a forma de chave (\"Chave A\") vale como sem a chave: nada de moldura esperando o Google");
  const guardado = montar({ geral: false, catalogo: "catalogosDirigente", mapa: "mapaDirigente", simulacao: "simulacaoDirigente", matricula: 3001 });
  guardado.ctx.localStorage.setItem("ieadespa.territorio.modo", "google");
  await abrirTerritorio(guardado);
  ok(guardado.e("terModo").value === "lista" && todos(guardado, "terDesenho").some((x) => x.localName === "svg") && !visivel(guardado, "terMolduraGoogle"), "a escolha \"Google\" guardada no aparelho, sem a chave: abre na lista e desenho");
  await sub(guardado, "bairros");
  ok(guardado.e("terSubBairros").style.display === "none" && guardado.e("terSubMapa").style.display === "block" && gets(guardado, "territorio/bairros").length === 0, "o Dirigente pedindo os Bairros fica no Mapa (e nem pede a lista)");
  ok(!visivel(semChave, "btnTerSubBairros") && /suas congregações/.test(semChave.e("terResumo").textContent) && semChave.e("terFila").innerHTML === "", "o Dirigente: sem Bairros, sem fila, \"nas suas congregações\"");

  amb = montar();
  amb.__respostas["GET territorio/mapa"] = { corpo: { ...R.mapaGeral, bairros: R.mapaGeral.bairros.map((b, i) => (i === 0 ? { ...b, descoberto: false, aConferir: true } : b)), totais: { ...R.mapaGeral.totais, aConferir: 1 } } };
  await abrirTerritorio(amb);
  const primeiraLinha = todos(amb, "terTabelaBairros").filter((x) => x.localName === "tr")[1];
  ok(/a conferir/.test(primeiraLinha.textContent) && !botoes(amb, "terTabelaBairros", "terAbrirPedidoAcao").some((b) => args(b)[2] && String(args(b)[2]).startsWith(R.mapaGeral.bairros[0].nome.split(" <")[0]))
    && /a conferir/.test(amb.e("terResumo").textContent), "o bairro de unidade sem ponto: \"a conferir\", sem o atalho de pedir Extensão, e o aviso no resumo");
  ok(/com ponto no mapa/.test(amb.e("terDensidade").textContent), "a tabela por unidade diz que conta os membros em bairro com ponto");
  console.log("== simulação ==");
  amb = montar({ geral: false, catalogo: "catalogosDirigente", mapa: "mapaDirigente", simulacao: "simulacaoDirigente", matricula: 3001 });
  await abrirTerritorio(amb);
  await sub(amb, "simulacao");
  const sim = amb.e("terSimulacao").textContent;
  ok(/Atende todos os critérios/.test(sim) && /Critérios ativos/.test(sim) && /só aponta/.test(sim), "a simulação: a situação, os critérios e o aviso de que só aponta");
  ok(/oculto \(menos de 3 dizimistas/.test(sim) && /pelo menos R\$ 300,00/.test(sim) && (sim.match(/R\$ 300,00/g) || []).length === (sim.match(/pelo menos R\$ 300,00/g) || []).length && /pelo menos 24 meses/.test(sim), "o dízimo de 2 dizimistas aparece oculto; as regras por extenso (R$ e meses)", sim.slice(0, 300));
  const pedirEma = botoes(amb, "terSimulacao", "terAbrirPedidoAcao");
  ok(pedirEma.length === REAL.simulacaoDirigente.extensoes.filter((e) => e.podePedir).length && pedirEma.every((b) => args(b)[0] === "EMANCIPACAO" && typeof args(b)[1] === "number"),
    "\"Pedir a emancipação\" só onde o servidor diz que pode");
  amb.doc.clicar(pedirEma[0]); await amb.ocioso();
  ok(amb.e("expNovoTipo").value === "EMANCIPACAO" && amb.e("expSecaoPedidos").style.display === "block", "o atalho abre o pedido de emancipação");
  semAtaque(amb, "a simulação");
  amb = montar();
  await abrirTerritorio(amb); await sub(amb, "simulacao");
  ok(/não tem a data de abertura/.test(amb.e("terSimulacao").textContent), "\"não dá para medir\" diz o que falta");
  amb = montar();
  amb.__respostas["GET territorio/simulacao"] = { corpo: { ...R.simulacaoGeral, criterios: [], extensoes: R.simulacaoGeral.extensoes.map((e) => ({ ...e, podePedir: false, avaliacao: { situacao: "SEM_CRITERIOS", itens: [], atendidos: 0, total: 0 } })) } };
  await abrirTerritorio(amb); await sub(amb, "simulacao");
  ok(true, "(a simulação geral é lida abaixo)");
  ok(/Nenhum critério ativo/.test(amb.e("terSimulacao").textContent) && botoes(amb, "terSimulacao", "terAbrirPedidoAcao").length === 0, "sem critério ativo: diz isso e não aponta ninguém");

  console.log("== bairros (nível geral) ==");
  amb = montar();
  await abrirTerritorio(amb); await sub(amb, "bairros");
  ok(gets(amb, "territorio/bairros").length === 1 && botoes(amb, "terBairros", "terEditarBairroAcao").length === REAL.bairros.bairros.filter((b) => b.ativo).length, "a lista do cadastro com Editar nos ativos");
  const b0 = REAL.bairros.bairros.find((b) => b.ativo && b.lat != null);
  amb.g("terEditarBairroAcao")(b0.bairroId); await amb.ocioso();
  ok(amb.e("terBairroNome").value.startsWith(b0.nome) && amb.e("terBairroLat").value === String(b0.lat), "Editar abre o formulário preenchido");
  ok(moldura(amb, "terBairroMoldura") && amb.e("terBairroMoldura").children[0].getAttribute("sandbox") === "allow-scripts allow-popups allow-popups-to-escape-sandbox", "com a chave: o mapa para clicar, na moldura com sandbox");
  f = moldura(amb, "terBairroMoldura");
  mensagem(amb, f.contentWindow, { fonte: "ieadespa-mapa", tipo: "pronto" });
  ok(f.__recebidas[0].m.modo === "marcar" && f.__recebidas[0].m.ponto.lat === b0.lat && f.__recebidas[0].m.bairros.length === 0, "o mapa de marcar recebe o ponto atual (e nenhum bairro)");
  mensagem(amb, f.contentWindow, { fonte: "ieadespa-mapa", tipo: "clique", lat: -6.123456, lng: -49.876543 });
  ok(amb.e("terBairroLat").value === "-6.123456" && amb.e("terBairroLng").value === "-49.876543", "o clique no mapa preenche a latitude e a longitude");
  mensagem(amb, f.contentWindow, { fonte: "ieadespa-mapa", tipo: "clique", lat: 999, lng: 10 });
  ok(amb.e("terBairroLat").value === "-6.123456", "clique com número fora da faixa: ignorado");
  amb.e("terBairroLink").value = "https://www.google.com/maps/place/X/@-6.07,-49.9,17z/data=!3d-6.0675!4d-49.9025";
  amb.g("terLerLinkAcao")("terBairro");
  ok(amb.e("terBairroLat").value === "-6.0675" && amb.e("terBairroLng").value === "-49.9025", "o link colado: vale o pino exato (!3d!4d), não o centro da tela");
  amb.e("terBairroLink").value = "https://maps.app.goo.gl/abc";
  amb.g("terLerLinkAcao")("terBairro");
  ok(/link curto/.test(amb.e("terMsgBairros").textContent) && amb.e("terBairroLat").value === "-6.0675", "o link curto: explica e não mexe no ponto");
  await amb.g("terSalvarBairroAcao")(); await amb.ocioso();
  let p = posts(amb, "territorio/bairro-editar");
  ok(p.length === 1 && p[0].corpo.bairroId === b0.bairroId && p[0].corpo.versao === b0.versao && p[0].corpo.lat === "-6.0675", "salvar manda o bairro, a versão lida e o ponto", p[0] && p[0].corpo);
  ok(!moldura(amb, "terBairroMoldura") && amb.e("terFormBairro").innerHTML === "", "salvo: o formulário e a moldura fecham");
  amb.g("terNovoBairroAcao")("Lugar Novo", "Parauapebas", "PA"); await amb.ocioso();
  ok(amb.e("terBairroNome").value === "Lugar Novo" && amb.e("terBairroUf").value === "PA", "Cadastrar da fila abre o formulário com o nome escrito");
  await amb.g("terSalvarBairroAcao")(); await amb.ocioso();
  ok(posts(amb, "territorio/bairro").length === 1 && !("bairroId" in posts(amb, "territorio/bairro")[0].corpo), "bairro novo vai como cadastro (sem número)");
  amb.g("terJuntarBairroAcao")(b0.bairroId); await amb.ocioso();
  ok(!amb.e("terJuntarDestino").options.some((o) => o.value === String(b0.bairroId)), "juntar não oferece o próprio bairro como destino");
  const destino = amb.e("terJuntarDestino").options.find((o) => o.value);
  amb.e("terJuntarDestino").value = destino.value;
  let modal = await comConfirmacao(amb, () => amb.g("terConfirmarJuntarAcao")(), false);
  ok(modal.aberto && posts(amb, "territorio/bairro-juntar").length === 0, "juntar pergunta antes; cancelado não manda nada");
  modal = await comConfirmacao(amb, () => amb.g("terConfirmarJuntarAcao")(), true);
  p = posts(amb, "territorio/bairro-juntar");
  ok(p.length === 1 && String(p[0].corpo.destinoId) === destino.value && p[0].corpo.versao === b0.versao, "confirmado: junta, com a versão");
  modal = await comConfirmacao(amb, () => amb.g("terAtivarBairroAcao")(b0.bairroId, false), true);
  ok(modal.aberto && posts(amb, "territorio/bairro-ativo").length === 1 && posts(amb, "territorio/bairro-ativo")[0].corpo.ativo === false, "desativar pergunta e manda ativo=false");
  semAtaque(amb, "os bairros");

  console.log("== critérios e raio ==");
  amb = montar({ geral: false, catalogo: "catalogosDirigente", mapa: "mapaDirigente", simulacao: "simulacaoDirigente", matricula: 3001 });
  await abrirTerritorio(amb); await sub(amb, "criterios");
  ok(botoes(amb, "terCriterios", "terEditarCriterioAcao").length === 0 && !amb.e("terRaioKm") && /nível geral muda/.test(amb.e("terRaio").textContent), "o Dirigente lê a tabela, sem editar nem mudar o raio");
  ok(!visivel(amb, "btnTerNovoCriterio"), "sem Novo critério");
  amb = montar();
  await abrirTerritorio(amb); await sub(amb, "criterios");
  ok(botoes(amb, "terCriterios", "terEditarCriterioAcao").length === REAL.criteriosDirigente.criterios.length, "o nível geral edita cada linha");
  amb.e("terRaioKm").value = "2,5";
  await amb.g("terSalvarRaioAcao")(); await amb.ocioso();
  p = posts(amb, "territorio/raio");
  ok(p.length === 1 && p[0].corpo.raioKm === "2,5" && p[0].corpo.versao === REAL.criteriosDirigente.versaoParametros, "o raio vai com a versão lida");
  amb.g("terNovoCriterioAcao")(); await amb.ocioso();
  amb.doc.escolher(amb.e("terCritIndicador"), "ENCARREGADO_EM_COMUNHAO"); await amb.ocioso();
  ok(amb.e("terCritOperador").options.length === 1 && amb.e("terCritOperador").value === "SIM" && !visivel(amb, "terCritValorGrupo"), "o indicador de sim/não: só \"precisa ser sim\", sem valor");
  amb.doc.escolher(amb.e("terCritIndicador"), "DIZIMO_MEDIO_12M"); await amb.ocioso();
  ok(amb.e("terCritOperador").options.map((o) => o.value).join() === "MINIMO,MAXIMO" && visivel(amb, "terCritValorGrupo") && /reais/.test(amb.e("terCritValorRotulo").textContent), "o de número: pelo menos ou no máximo, com a unidade");
  amb.e("terCritValor").value = "3000,50"; amb.e("terCritOrdem").value = "15"; amb.e("terCritAtivo").checked = false;
  await amb.g("terSalvarCriterioAcao")(); await amb.ocioso();
  p = posts(amb, "territorio/criterio");
  ok(p.length === 1 && p[0].corpo.indicador === "DIZIMO_MEDIO_12M" && p[0].corpo.operador === "MINIMO" && p[0].corpo.valor === "3000,50" && p[0].corpo.ativo === false && p[0].corpo.ordem === "15", "o critério novo vai como escrito", p[0] && p[0].corpo);
  await amb.g("terCarregarCriteriosAcao")(); await amb.ocioso();
  const c0 = REAL.criteriosDirigente.criterios[0];
  amb.g("terEditarCriterioAcao")(c0.criterioId); await amb.ocioso();
  ok(amb.e("terCritIndicador").value === c0.indicador && amb.e("terCritValor").value === String(c0.valor), "Editar abre o critério preenchido");
  await amb.g("terSalvarCriterioAcao")(); await amb.ocioso();
  p = posts(amb, "territorio/criterio-editar");
  ok(p.length === 1 && p[0].corpo.criterioId === c0.criterioId && p[0].corpo.versao === c0.versao, "editar manda o número e a versão");
  modal = await comConfirmacao(amb, () => amb.g("terApagarCriterioAcao")(c0.criterioId), false);
  ok(modal.aberto && /desmarque/.test(modal.texto) && posts(amb, "territorio/criterio-apagar").length === 0, "apagar pergunta (e lembra de só desligar); cancelado não manda");
  await comConfirmacao(amb, () => amb.g("terApagarCriterioAcao")(c0.criterioId), true);
  ok(posts(amb, "territorio/criterio-apagar").length === 1, "confirmado: apaga");
  semAtaque(amb, "os critérios");

  console.log("== pontos das Extensões ==");
  amb = montar({ geral: false, catalogo: "catalogosDirigente", mapa: "mapaDirigente", simulacao: "simulacaoDirigente", matricula: 3001 });
  await abrirTerritorio(amb); await sub(amb, "pontos");
  const marcar = botoes(amb, "terPontos", "terMarcarPontoAcao");
  ok(marcar.length === REAL.extensoesDirigente.extensoes.filter((e) => e.podeMarcar).length, "Marcar só onde o servidor diz que pode");
  amb.doc.clicar(marcar[0]); await amb.ocioso();
  ok(amb.e("terPontoLat") && !amb.e("terPontoMoldura"), "sem a chave: o formulário do ponto, sem o mapa para clicar");
  amb.e("terPontoLink").value = "-6.151, -49.951";
  amb.g("terLerLinkAcao")("terPonto");
  await amb.g("terSalvarPontoAcao")(); await amb.ocioso();
  p = posts(amb, "territorio/ponto-extensao");
  ok(p.length === 1 && p[0].corpo.extensaoId === args(marcar[0])[0] && p[0].corpo.lat === "-6.151" && p[0].corpo.lng === "-49.951", "o ponto vai lido do texto colado");
  semAtaque(amb, "os pontos");

  console.log("== o endereço em linhas e Meus Dados ==");
  amb = montar({ geral: false, permissoes: [], matricula: 9804 });
  amb.ev(extrair("modulos/meus-dados.js", ["carregarMeusDadosForm", "salvarMeusDadosAcao", "ROTULO_FORMA_ADMISSAO_MEUPAINEL"]), "meus-dados(extraido)");
  amb.ev("function avisarResultado() {}", "avisar");
  amb.__respostas["GET meus-dados/9804"] = { corpo: { ...R.meusDadosGet, dados: { ...R.meusDadosGet.dados, endereco: "Rua Velha, 1", enderecoPartes: { logradouro: null, numero: null, complemento: null, bairroId: null, bairroNome: null, bairroTexto: null, cidade: null, uf: null, cep: null } } } };
  await amb.g("carregarMeusDadosForm")(); await amb.ocioso();
  const selB = amb.e("meuEndBairro");
  ok(selB.options.length === R.meusDadosGet.bairros.length + 2 && selB.options[selB.options.length - 1].value === "OUTRO" && amb.e("meuEndUf").options.length === 28, "o seletor: os bairros, \"não está na lista\" e as UFs");
  ok(amb.e("meuEndLogradouro").value === "Rua Velha, 1" && amb.e("meuEndereco").value === "Rua Velha, 1" && amb.e("meuEndereco").readOnly, "o endereço antigo numa linha vai para a Rua (não se perde ao escolher o bairro)");
  await amb.g("salvarMeusDadosAcao")(); await amb.ocioso();
  p = posts(amb, "meus-dados/9804");
  ok(p.length === 1 && p[0].corpo.enderecoPartes && p[0].corpo.enderecoPartes.logradouro === "Rua Velha, 1" && !("endereco" in p[0].corpo), "salvar sem mexer guarda o endereço antigo como Rua");
  for (const c of ["meuEndLogradouro"]) amb.doc.digitar(amb.e(c), "");
  await amb.ocioso();
  ok(!amb.e("meuEndereco").readOnly && JSON.stringify(amb.g("endLerParaEnviar")("meuEnd")) === JSON.stringify({ enderecoPartes: {} }), "apagar todas as linhas (sem escrever outra linha única) apaga o endereço de propósito");
  amb.doc.digitar(amb.e("meuEndereco"), "Outro lugar escrito");
  ok(amb.g("endLerParaEnviar")("meuEnd").endereco === "Outro lugar escrito", "escrevendo outra linha única, ela vale");
  amb.doc.digitar(amb.e("meuEndLogradouro"), "Rua Velha, 1");
  const b1 = R.meusDadosGet.bairros[0];
  amb.doc.escolher(selB, String(b1.bairroId)); await amb.ocioso();
  ok(amb.e("meuEndCidade").value === b1.cidade && amb.e("meuEndCidade").readOnly && amb.e("meuEndUf").disabled && amb.e("meuEndereco").readOnly, "o bairro da lista preenche e trava a cidade e a UF; a linha única fica só para ler");
  amb.doc.digitar(amb.e("meuEndLogradouro"), "Rua Nova"); amb.doc.digitar(amb.e("meuEndCep"), "68515000"); await amb.ocioso();
  await amb.g("salvarMeusDadosAcao")(); await amb.ocioso();
  p = posts(amb, "meus-dados/9804");
  ok(p.length === 2 && p[1].corpo.enderecoPartes && p[1].corpo.enderecoPartes.bairroId === String(b1.bairroId) && p[1].corpo.enderecoPartes.logradouro === "Rua Nova" && p[1].corpo.enderecoPartes.bairroTexto === null && !("endereco" in p[1].corpo),
    "com linhas: vão as linhas (a linha única o servidor monta)", p[1] && p[1].corpo);
  amb.doc.escolher(selB, "OUTRO"); await amb.ocioso();
  ok(visivel(amb, "meuEndBairroTextoGrupo") && !amb.e("meuEndCidade").readOnly && !amb.e("meuEndUf").disabled, "\"não está na lista\": aparece o nome do bairro e a cidade destrava");
  amb.doc.digitar(amb.e("meuEndBairroTexto"), "Bairro Escrito");
  ok(amb.g("endLerParaEnviar")("meuEnd").enderecoPartes.bairroTexto === "Bairro Escrito" && amb.g("endLerParaEnviar")("meuEnd").enderecoPartes.bairroId === null, "o escrito vai como texto, sem número de bairro");
  amb.doc.escolher(selB, String(b1.bairroId)); await amb.ocioso();
  ok(amb.g("endLerParaEnviar")("meuEnd").enderecoPartes.bairroTexto === null && amb.g("endLerParaEnviar")("meuEnd").enderecoPartes.bairroId === String(b1.bairroId), "voltando ao bairro da lista, o nome escrito que sobrou não vai junto");
  ok(amb.g("endLerParaEnviar")("qualquer") && Object.keys(amb.g("endLerParaEnviar")("qualquer")).length === 0, "prefixo desconhecido: nada");
  amb.g("endPreencher")("meuEnd", { bairroId: 999, bairroNome: `Antigo ${ATAQUE}` }, "x");
  ok(selB.value === "999" && /fora da lista/.test(selB.options[1].textContent), "o bairro desativado que a pessoa já tem aparece como \"fora da lista\"");
  amb.g("endPreencherBairros")("meuEnd", R.meusDadosGet.bairros);
  ok(selB.value === "999" && selB.options.some((o) => o.value === "999" && /fora da lista/.test(o.textContent)), "a lista dos bairros chegando depois da ficha não apaga o bairro \"fora da lista\"");
  semAtaque(amb, "o endereço em linhas");
  amb.g("endLimpar")("meuEnd");
  ok(selB.value === "" && amb.e("meuEndLogradouro").value === "" && amb.e("meuEndereco").value === "", "limpar apaga as linhas e a linha única");
  const cartao = amb.g("terCartaoMeusDados")(R.meusDadosLgpd.territorio);
  ok(/Rua A/.test(cartao) && /Centro E2E/.test(cartao) && /nunca pelo nome/.test(cartao) && !cartao.includes(ATAQUE), "o cartão de Meus Dados: o endereço em linhas, escapado");
  const cartaoSec = amb.g("terCartaoMeusDados")(R.meusDadosLgpdSec.territorio);
  ok(/cadastrado por você/.test(cartaoSec) && /Raio de cobertura/.test(cartaoSec) && !cartaoSec.includes(ATAQUE), "e os atos de quem cadastrou e mudou, escapados");
  ok(amb.g("terCartaoMeusDados")({ endereco: {}, atos: {} }) === "" && amb.g("terCartaoMeusDados")(null) === "", "sem nada: sem cartão");

  console.log("== a saída e a troca de login ==");
  amb = montar();
  amb.ctx.localStorage.setItem("ieadespa.territorio.modo", "google");
  await abrirTerritorio(amb);
  ok(moldura(amb, "terMolduraGoogle") && amb.e("terModo").value === "google", "a escolha guardada (Google) volta ao abrir");
  amb.g("expMostrarSecaoAcao")("painel"); await amb.ocioso();
  ok(!moldura(amb, "terMolduraGoogle"), "saindo da pílula, a moldura do Google é desmontada");
  await amb.g("expMostrarSecaoAcao")("territorio"); await amb.ocioso();
  amb.g("expLimparTela")();
  ok(amb.e("terResumo").innerHTML === "" && amb.e("terTabelaBairros").innerHTML === "" && !moldura(amb, "terMolduraGoogle") && amb.g("terCatalogos") === null, "a saída limpa a tela do Território (e a moldura)");
  amb = montar();
  await abrirTerritorio(amb);
  const espera = amb.retem((c) => c.chave === "GET territorio/simulacao");
  amb.g("terMostrarSubAcao")("simulacao");
  await amb.ocioso();
  amb.ev("authToken = 'outro'; authMatricula = '9999';", "troca");
  espera.liberar(); await amb.ocioso();
  ok(!/Tenda/.test(amb.e("terSimulacao").textContent), "a resposta que chega depois da troca de login não aparece");
  return { total, falhas };
}

const MUTACOES = [
  ["territorio", "aceitar qualquer texto como chave", ["typeof c === \"string\" && TER_FORMA_CHAVE.test(c) ? c : null", "c || null"]],
  ["territorio", "tirar o escape do nome do bairro na tabela", ["<tr><td>${terH(b.nome)}${b.inativo", "<tr><td>${b.nome}${b.inativo"]],
  ["territorio", "tirar o escape da unidade mais perto", ["const unidade = b.maisPerto ? `${terH(b.maisPerto.nome)}", "const unidade = b.maisPerto ? `${b.maisPerto.nome}"]],
  ["territorio", "tirar o escape da densidade", ["<tr><td>${terH(u.nome)}${u.tipo === \"EXTENSAO\" ? \" (Extensão)\" : \"\"}</td>\n", "<tr><td>${u.nome}${u.tipo === \"EXTENSAO\" ? \" (Extensão)\" : \"\"}</td>\n"]],
  ["territorio", "tirar o escape do rótulo no desenho", ["class=\"ter-rotulo\">${terH(u.nome)}</text>", "class=\"ter-rotulo\">${u.nome}</text>"]],
  ["territorio", "tirar o escape do nome da Extensão na simulação", ["<p class=\"linha-perfil\"><strong>${terH(e.nome)}</strong> <small>(Extensão de", "<p class=\"linha-perfil\"><strong>${e.nome}</strong> <small>(Extensão de"]],
  ["territorio", "tirar o escape da fila", ["`<li>${terH(f.nome)} — ${terH(f.cidade)}", "`<li>${f.nome} — ${terH(f.cidade)}"]],
  ["territorio", "tirar o escape do cadastro de bairros", ["<tr><td>${terH(b.nome)}</td><td>${terH(b.cidade)}/${terH(b.uf)}</td><td>${b.lat != null", "<tr><td>${b.nome}</td><td>${terH(b.cidade)}/${terH(b.uf)}</td><td>${b.lat != null"]],
  ["territorio", "tirar o escape da observação do critério", ["<td>${terH(c.observacao || \"\")}</td>", "<td>${c.observacao || \"\"}</td>"]],
  ["territorio", "tirar o escape do endereço da Extensão", ["<td>${terH(e.endereco || \"—\")}</td>", "<td>${e.endereco || \"—\"}</td>"]],
  ["territorio", "tirar o escape do cartão de Meus Dados", ["${temEndereco ? `<p class=\"linha-perfil\">${terH(linhas || \"—\")}", "${temEndereco ? `<p class=\"linha-perfil\">${linhas || \"—\"}"]],
  ["territorio", "tirar o escape dos atos de Meus Dados", ["`Critério \"${terH(c.indicador)}\"", "`Critério \"${c.indicador}\""]],
  ["territorio", "a moldura sem sandbox", ["  f.setAttribute(\"sandbox\", \"allow-scripts allow-popups allow-popups-to-escape-sandbox\");\n", ""]],
  ["territorio", "a moldura com a mesma origem", ["\"allow-scripts allow-popups allow-popups-to-escape-sandbox\");\n  f.setAttribute(\"referrerpolicy\"", "\"allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox\");\n  f.setAttribute(\"referrerpolicy\""]],
  ["territorio", "aceitar mensagem de qualquer janela", ["|| !ev || ev.source !== terMoldura.el.contentWindow) return;", "|| !ev) return;"]],
  ["territorio", "mandar a chave a cada \"pronto\"", ["if (m.tipo === \"pronto\" && !terMoldura.enviado) {", "if (m.tipo === \"pronto\") {"]],
  ["territorio", "aceitar clique fora da faixa", ["Math.abs(lat) > 90 || Math.abs(lng) > 180) return;", "false) return;"]],
  ["territorio", "o erro do Google não volta à lista", ["if (terMoldura.modo === \"ver\") { terDesmontarMoldura();", "if (false) { terDesmontarMoldura();"]],
  ["territorio", "o Google sem a chave", ["return m === \"google\" && terChave() ? \"google\" : \"lista\";", "return m === \"google\" ? \"google\" : \"lista\";"]],
  ["territorio", "mandar o nome dos membros à moldura", ["bairros: (Array.isArray(d.bairros) ? d.bairros : []).filter((b) => b.lat != null && b.lng != null).map((b) => ({ nome: b.nome,", "bairros: (Array.isArray(d.bairros) ? d.bairros : []).map((b) => ({ ...b, nome: b.nome,"]],
  ["territorio", "o Dirigente vê os Bairros", ["const terSubPermitida = (s) => TER_SUBS.includes(s) && (s !== \"bairros\" || terGeral());", "const terSubPermitida = (s) => TER_SUBS.includes(s);"]],
  ["territorio", "o botão Bairros a todos", ["const b = terEl(\"btnTerSubBairros\"); if (b) b.style.display = terGeral() ? \"\" : \"none\";", "const b = terEl(\"btnTerSubBairros\"); if (b) b.style.display = \"\";"]],
  ["territorio", "Pedir a emancipação a quem o servidor nega", ["const botao = e.podePedir ? `<button", "const botao = true ? `<button"]],
  ["territorio", "Pedir Extensão em bairro coberto", ["const acao = b.descoberto && podePedir", "const acao = podePedir"]],
  ["territorio", "salvar o bairro sem a versão", ["if (item) { corpo.bairroId = item.bairroId; corpo.versao = item.versao; }", "if (item) { corpo.bairroId = item.bairroId; }"]],
  ["territorio", "juntar sem perguntar", ["if (!(await confirmarAcao(`Juntar ${b.nome}", "if (false && !(await confirmarAcao(`Juntar ${b.nome}"]],
  ["territorio", "apagar o critério sem perguntar", ["if (!(await confirmarAcao(`Apagar o critério", "if (false && !(await confirmarAcao(`Apagar o critério"]],
  ["territorio", "o sim/não com valor", ["const grupo = terEl(\"terCritValorGrupo\"); if (grupo) grupo.style.display = simnao ? \"none\" : \"\";", "const grupo = terEl(\"terCritValorGrupo\");"]],
  ["territorio", "o link: o centro da tela antes do pino", ["const padroes = [new RegExp(`!3d${num}!4d${num}`), new RegExp(`@${num},${num}`),", "const padroes = [new RegExp(`@${num},${num}`), new RegExp(`!3d${num}!4d${num}`),"]],
  ["territorio", "a saída não desmonta a moldura", ["  terPedidoSub++; terPedidoOpcoes++;\n  terDesmontarMoldura();\n", "  terPedidoSub++; terPedidoOpcoes++;\n"]],
  ["territorio", "resposta de outro login aparece", ["  return terDono() === dono ? data : null;\n}\nasync function terPost", "  return data;\n}\nasync function terPost"]],
  ["endereco", "tirar o escape do nome do bairro no seletor", ["${escaparHtmlEbd(b.nome)} (${escaparHtmlEbd(b.cidade)}", "${b.nome} (${escaparHtmlEbd(b.cidade)}"]],
  ["endereco", "o endereço antigo não vai para a Rua", ["    const rua = endEl(p, \"Logradouro\"); if (rua) rua.value = t.slice(0, 200);\n", ""]],
  ["endereco", "apagar as linhas não apaga", ["    if (endAberta[p].tinhaLinhas && linha && linha.value === endAberta[p].linha) return { enderecoPartes: {} };\n", ""]],
  ["endereco", "a lista nova apaga o fora da lista", ["  if (fora && !Array.from(sel.options).some((o) => o.value === fora.valor)) endInserirForaDaLista(p, sel, fora.valor, fora.nome);\n", ""]],
  ["territorio", "o \"a conferir\" com o atalho", ["(b.aConferir ? \"a conferir (unidade sem ponto)\" : \"coberto\")", "\"coberto\""]],
  ["territorio", "mostrar o dízimo oculto", ["<td>${i.oculto ? \"<small>oculto", "<td>${false ? \"<small>oculto"]],
  ["territorio", "o prazo da moldura não cai", ["if (terMoldura === esta && !esta.desenhou) terMensagemDaMoldura(", "if (false) terMensagemDaMoldura("]],
  ["territorio", "o erro não guarda a lista", ["try { window.localStorage.setItem(TER_MODO_CHAVE, \"lista\"); } catch (e) { /* sem armazenamento */ }", ""]],
  ["territorio", "sem o motivo do não dá para medir", ["${i.resultado === \"SEM_DADO\" && TER_FALTA[i.indicador] ?", "${false ?"]],
  ["endereco", "o bairro da lista não manda na cidade", ["    if (cidade) cidade.value = doBairro.cidade;\n", ""]],
  ["endereco", "a linha única editável com linhas", ["  if (linha) linha.readOnly = comLinhas;\n", ""]],
  ["endereco", "mandar a linha única com as linhas", ["  if (!endTemLinhas(p)) {\n    // tinha linhas", "  if (true) {\n    // tinha linhas"]],
  ["endereco", "o escrito ao lado do bairro da lista", ["bairroTexto: bairro === END_OUTRO ? (v(\"BairroTexto\") || null) : null,", "bairroTexto: v(\"BairroTexto\") || null,"]],
  ["expansao", "a saída não limpa o Território", ["  if (typeof terLimparTela === \"function\") terLimparTela();   // v9.5: a pílula do Território\n", ""]],
  ["expansao", "a moldura fica fora da pílula", ["  if (expSecaoAtual !== \"territorio\" && typeof terDesmontarMoldura === \"function\") terDesmontarMoldura();\n", ""]]
];

(async () => {
  const r = await prova();
  console.log(`\nprova da tela da v9.5 (território): ${r.total - r.falhas}/${r.total} verificações ok${r.falhas ? ` — ${r.falhas} FALHA(S)` : ""}`);
  if (process.env.MUTAR !== "1") { if (r.falhas) process.exitCode = 1; return; }
  let acusadas = 0;
  const vivas = [];
  // uma mutação que deixa a tela esperando para sempre esvaziaria o laço e o processo terminaria calado: o intervalo o mantém vivo até o prazo de 60 s
  const vivo = setInterval(() => {}, 1000);
  let soltas = 0;
  const naoTratada = () => { soltas++; };
  process.on("unhandledRejection", naoTratada); process.on("uncaughtException", naoTratada);
  for (const [arquivo, nome, [de, para]] of MUTACOES) {
    const original = lerApp(`modulos/${arquivo}.js`);
    const n = original.split(de).length - 1;
    if (n !== 1) { vivas.push(`${nome} (trecho achado ${n} vez(es))`); continue; }
    MUTADO = { arquivo, texto: original.replace(de, () => para) };
    process.env.CALADO = "1";
    const soltasAntes = soltas;
    let res;
    try {
      res = await Promise.race([prova(), new Promise((resolve) => { const t = setTimeout(() => resolve({ total: 1, falhas: 1, travou: true }), 60000); t.unref(); })]);
    } catch (e) { res = { total: 1, falhas: 1 }; }
    delete process.env.CALADO;
    MUTADO = null;
    if (res.falhas > 0 || soltas > soltasAntes) acusadas++; else vivas.push(nome);
  }
  clearInterval(vivo);
  process.off("unhandledRejection", naoTratada); process.off("uncaughtException", naoTratada);
  console.log(`mutações: ${acusadas}/${MUTACOES.length} acusadas${vivas.length ? ` — vivas: ${vivas.join("; ")}` : ""}`);
  if (r.falhas || vivas.length) process.exitCode = 1;
})();
void fs; void path;
