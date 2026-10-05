// eventos.js — despachante único dos eventos da tela (CSP forte: script-src 'self', sem 'unsafe-inline').
// Antes, cada botão trazia o código no próprio HTML (onclick="f(12, 'G')"); a política de segurança forte bloqueia esse código escrito dentro do HTML.
// Agora o HTML só DIZ o que fazer, e quem faz é este arquivo:
//   data-on-click="nomeDaAcao"            (também data-on-change, data-on-input, data-on-submit, data-on-keydown)
//   data-args-click='[12,"G"]'             argumentos em JSON, um atributo por tipo de evento (sem ele: chamada sem argumentos)
//   data-prevent="submit"                  chama event.preventDefault() ANTES da ação (o antigo "event.preventDefault(); f()" ou "f(); return false")
//   data-stop="click"                      para a subida do evento depois da ação (o antigo "event.stopPropagation(); f()"); pode existir sem data-on-*
// (data-prevent/data-stop levam os tipos de evento a que se aplicam, separados por espaço: um botão que para o clique não deve parar o change de dentro.)
// Argumentos especiais, resolvidos na hora do evento (em qualquer profundidade, inclusive dentro de objeto): {"$":"this"} = o elemento do atributo,
// {"$":"event"} = o evento, {"$":"value"} = this.value, {"$":"checked"} = this.checked; {"$":"undefined"}/{"$":"NaN"} guardam o que o JSON não tem.
// No script.js os argumentos entram por argsAttr(...) (JSON + escape de HTML) e os especiais por ARG.elemento / ARG.evento / ARG.valor / ARG.marcado.
// SEGURANÇA: o nome da ação vem do HTML, mas NUNCA vira window[nome]. Só roda o que o script.js registrou com registrarAcoes({ f, g, ... }) (referência
// direta à função); nome fora do registro = console.error e nada acontece. Teste permanente: api/shared/__tests__/frontCsp.test.js e eventosDespachante.test.js.
// Semântica imitada do evento em linha: (a) o caminho é fixado no começo (como o navegador faz), do alvo até o document; cada elemento com data-on-<tipo>
// roda na ordem da bolha (filho antes do pai) até um data-stop ou até a ação chamar evento.stopPropagation(); (b) `this` do antigo atributo = ARG.elemento;
// (c) erro numa ação não impede as outras (vai para o console, como um erro de onclick ia); promessa rejeitada segue solta para o "unhandledrejection"
// do script.js, igual a antes. O ouvinte fica na fase de CAPTURA do document: roda antes dos ouvintes de "clicar fora fecha" (que estão na bolha do
// document) — a mesma ordem de antes —, e, quando a emulação manda parar, para o evento de verdade (evento.stopPropagation()), então esses ouvintes não
// recebem o clique, exatamente como acontecia com o stopPropagation do atributo.
const ARG = Object.freeze({
  elemento: Object.freeze({ $: "this" }),
  evento: Object.freeze({ $: "event" }),
  valor: Object.freeze({ $: "value" }),
  marcado: Object.freeze({ $: "checked" })
});
const ACOES_DA_TELA = new Map();
const TIPOS_DE_EVENTO_DA_TELA = ["click", "change", "input", "submit", "keydown"];

// Registro explícito das ações que o HTML pode pedir. Chamado UMA vez no fim do script.js (lista gerada e conferida pelo teste).
function registrarAcoes(mapa) {
  for (const nome of Object.keys(mapa)) {
    if (typeof mapa[nome] !== "function") throw new TypeError(`registrarAcoes: "${nome}" não é função`);
    ACOES_DA_TELA.set(nome, mapa[nome]);
  }
}

// Valor -> forma que vai no JSON do atributo. Objeto "{ $: ... }" vindo de DADO (não um marcador ARG) é embrulhado para nunca ser lido como especial.
function codificarArgEvento(v) {
  if (v === undefined) return { $: "undefined" };
  if (typeof v === "number" && !Number.isFinite(v)) return { $: "NaN" };
  if (v === ARG.elemento || v === ARG.evento || v === ARG.valor || v === ARG.marcado) return { $: v.$ };
  if (Array.isArray(v)) return v.map(codificarArgEvento);
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v)) o[k] = codificarArgEvento(v[k]);
    return Object.prototype.hasOwnProperty.call(v, "$") ? { $: "objeto", v: o } : o;
  }
  return v;
}
function resolverArgEvento(v, elemento, evento) {
  if (Array.isArray(v)) return v.map(x => resolverArgEvento(x, elemento, evento));
  if (!v || typeof v !== "object") return v;
  if (Object.prototype.hasOwnProperty.call(v, "$")) {
    switch (v.$) {
      case "this": return elemento;
      case "event": return evento;
      case "value": return elemento.value;
      case "checked": return elemento.checked;
      case "undefined": return undefined;
      case "NaN": return NaN;
      case "objeto": { const o = {}; for (const k of Object.keys(v.v || {})) o[k] = resolverArgEvento(v.v[k], elemento, evento); return o; }
    }
  }
  const o = {};
  for (const k of Object.keys(v)) o[k] = resolverArgEvento(v[k], elemento, evento);
  return o;
}
const marcaDoTipo = (el, atributo, tipo) => el.hasAttribute(atributo) && el.getAttribute(atributo).split(/\s+/).includes(tipo);

function despacharEventoDaTela(evento) {
  const tipo = evento.type;
  const atributo = "data-on-" + tipo;
  // caminho fixado agora: uma ação que redesenha a tela (innerHTML) não pode impedir a vez dos ancestrais que já estavam no caminho
  const caminho = [];
  for (let no = evento.target; no && no.nodeType !== 9; no = no.parentNode) {
    if (no.nodeType === 1 && (no.hasAttribute(atributo) || marcaDoTipo(no, "data-stop", tipo) || marcaDoTipo(no, "data-prevent", tipo))) caminho.push(no);
  }
  for (const elemento of caminho) {
    if (marcaDoTipo(elemento, "data-prevent", tipo)) evento.preventDefault();
    const nome = elemento.getAttribute(atributo);
    if (nome) executarAcaoDaTela(nome, elemento, evento, tipo);
    if (marcaDoTipo(elemento, "data-stop", tipo) || evento.cancelBubble) { evento.stopPropagation(); break; }
  }
}
function executarAcaoDaTela(nome, elemento, evento, tipo) {
  const acao = ACOES_DA_TELA.get(nome);
  if (!acao) { console.error(`[eventos] ação não registrada: "${nome}" (data-on-${tipo})`); return; }
  let args = [];
  const bruto = elemento.getAttribute("data-args-" + tipo);
  if (bruto) {
    try { args = JSON.parse(bruto); } catch (e) { console.error(`[eventos] data-args-${tipo} inválido em "${nome}"`, e); return; }
    if (!Array.isArray(args)) args = [args];
    args = resolverArgEvento(args, elemento, evento);
  }
  try {
    acao.apply(undefined, args); // promessa devolvida não é esperada nem capturada: rejeição solta vai ao "unhandledrejection", como no onclick antigo
  } catch (e) {
    console.error(`[eventos] erro na ação "${nome}"`, e);
  }
}
for (const tipo of TIPOS_DE_EVENTO_DA_TELA) document.addEventListener(tipo, despacharEventoDaTela, true);
