// Regra permanente da tela (app/script.js + app/index.html): TODO valor que entra em HTML montado em string passa pela proteção certa para o lugar onde entra.
//   - texto e atributo comum (<td>${x}</td>, title="${x}", value="${x}") ........ escaparHtmlEbd(x)
//   - argumento de evento (onclick="f(${x})") ...................................... argJs(x) — SEM aspas em volta; o escape de HTML não basta ali, porque o
//     navegador desfaz o &#39; antes de rodar o JS e a aspa volta, fechando a string
//   - endereço (href="${x}", src="${x}") ............................................ urlSegura(x) — o escape de HTML não barra "javascript:"
// Nasceu da v7.6: depois de duas rodadas "manuais" (161 de 216 e depois o resto, mais o código novo), sobravam ~950 pontos crus — notas, nomes, mensagens da
// API, links. A varredura abaixo lê o código de verdade (árvore do JavaScript, não grep), acompanha variável, retorno de função, parâmetro (pelos chamadores) e
// lista (.map/.join/.push) até a origem, e falha apontando linha e contexto quando surge um ponto novo sem proteção.
// Exceções são REGRAS, não trechos: estão listadas e justificadas em EXCECOES_POR_REGRA. Precisando de exceção pontual, ela entra em EXCECOES_POR_TRECHO com o
// motivo — decisão consciente, nunca esquecimento.
// Depende só do @babel/parser e @babel/traverse que já vêm com o jest (devDependency); nada disso vai para produção.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const APP = path.join(__dirname, "..", "..", "..", "app");
const SCRIPT = fs.readFileSync(path.join(APP, "script.js"), "utf8");
const INDEX = fs.readFileSync(path.join(APP, "index.html"), "utf8");

// Regras que deixam um valor entrar sem helper — cada uma com o porquê. (Aplicadas dentro do analisador: rotulo0/rotuloElementos.)
const EXCECOES_POR_REGRA = {
  "nome terminado em Id, ou id (x.membroId, sessaoId)": "chave INT/GUID gerada pelo banco; nunca é texto digitado",
  ".length / .size, Number(), parseInt(), Math.*, operação aritmética, comparação, !x, typeof": "resultado é número ou booleano",
  "toFixed, toLocaleString, toLocaleDateString/TimeString, getFullYear...": "formatação de número/data (string de texto não tem toLocaleDateString; toLocaleString só é chamado em número/data)",
  "literal do código (\"x\", 10, objeto/lista literal em const, mapa de rótulos do código: ROTULO_X[s])": "texto escrito pelo programador, não vem de fora",
  "índice do callback (map((x, i) => ...))": "número",
  "encodeURIComponent(x)": "só sobra [A-Za-z0-9-_.!~*'()]: serve em texto, atributo e URL (não em evento)",
  "parâmetro de função local": "vale o que TODOS os chamadores passam naquela posição; função chamada de dentro de texto (onclick) não conta como resolvida"
};
// Exceções pontuais (trecho exato -> motivo). Vazia de propósito: hoje nenhum ponto precisa.
const EXCECOES_POR_TRECHO = {};

// ================= analisador (árvore do JS) =================
// ---- rótulos (onde um valor pode entrar com segurança) ----
const C = { text: 1, attr: 2, unq: 4, event: 8, url: 16, tag: 32, raw: 64 };
const TODOS = 127;
const L = {
  NUM: TODOS, CONST: TODOS, ID: TODOS,
  ESC: C.text | C.attr,
  JS: C.text | C.attr | C.event,
  URL: C.text | C.attr | C.url,
  HTML: C.text | C.tag,
  ENC: C.text | C.attr | C.url,
  NADA: 0
};
const ESCAPE_HTML = new Set(["escaparHtmlEbd"]);
const ESCAPE_JS = new Set(["argJs"]);
const ESCAPE_URL = new Set(["urlSegura"]);
const METODOS_NUM = new Set(["toFixed", "toLocaleDateString", "toLocaleTimeString", "toLocaleString", "getFullYear", "getMonth", "getDate", "getDay", "getHours", "getMinutes", "getSeconds", "getTime", "indexOf", "lastIndexOf", "findIndex", "localeCompare", "includes", "some", "every", "has", "startsWith", "endsWith", "test", "charCodeAt", "toISOString"]);
const METODOS_TEXTO = new Set(["trim", "trimStart", "trimEnd", "toUpperCase", "toLowerCase", "slice", "substring", "substr", "padStart", "padEnd", "toString", "replace", "replaceAll", "repeat", "normalize", "at", "charAt", "concat", "split"]);
const METODOS_LISTA = new Set(["filter", "slice", "sort", "reverse", "concat", "flat"]);
const CALLBACK_INDICE = new Set(["map", "forEach", "filter", "some", "every", "find", "findIndex", "flatMap"]);
const TAG = /<[a-zA-Z!\/]/;
const ATRIB_URL = new Set(["href", "src", "action", "formaction", "poster", "background", "xlink:href", "data", "srcdoc"]);

function nomePropriedade(m) {
  if (!m) return null;
  if (!m.computed && m.property.type === "Identifier") return m.property.name;
  if (m.computed && m.property.type === "StringLiteral") return m.property.value;
  return null;
}
const ehMembro = (n) => n && (n.type === "MemberExpression" || n.type === "OptionalMemberExpression");
const ehChamada = (n) => n && (n.type === "CallExpression" || n.type === "OptionalCallExpression");
const ehFuncao = (n) => n && (n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression");

// ---- varredura do HTML (estado do tokenizador ao chegar em cada ${}) ----
function novoEstado(ctx) {
  // ctx herdado do pai (template aninhado): começa no mesmo estado do pai
  if (ctx && ctx.estado) return Object.assign({}, ctx.estado);
  return { s: "text", nome: "", attr: "", val: "" };
}
function avancar(e, txt) {
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    switch (e.s) {
      case "text":
        if (ch === "<") {
          if (txt.startsWith("!--", i + 1)) { e.s = "comment"; i += 3; }
          else if (/[a-zA-Z\/]/.test(txt[i + 1] || "")) { e.s = "tagname"; e.nome = ""; }
        }
        break;
      case "comment": if (txt.startsWith("-->", i)) { e.s = "text"; i += 2; } break;
      case "raw": if (txt.slice(i, i + 2 + e.nome.length).toLowerCase() === "</" + e.nome) { e.s = "tagname"; e.nome = "/"; i += 1; } break;
      case "tagname":
        if (/\s/.test(ch)) e.s = "tag";
        else if (ch === ">") e.s = (e.nome === "script" || e.nome === "style") ? "raw" : "text";
        else e.nome += ch.toLowerCase();
        break;
      case "tag":
        if (ch === ">") e.s = (e.nome === "script" || e.nome === "style") ? "raw" : "text";
        else if (!/[\s\/]/.test(ch)) { e.s = "attrname"; e.attr = ch.toLowerCase(); }
        break;
      case "attrname":
        if (ch === "=") e.s = "beforeval";
        else if (ch === ">") e.s = "text";
        else if (/\s/.test(ch)) e.s = "afterattr";
        else e.attr += ch.toLowerCase();
        break;
      case "afterattr":
        if (ch === "=") e.s = "beforeval";
        else if (ch === ">") e.s = "text";
        else if (!/\s/.test(ch)) { e.s = "attrname"; e.attr = ch.toLowerCase(); }
        break;
      case "beforeval":
        if (ch === '"') { e.s = "valdq"; e.val = ""; }
        else if (ch === "'") { e.s = "valsq"; e.val = ""; }
        else if (ch === ">") e.s = "text";
        else if (!/\s/.test(ch)) { e.s = "valunq"; e.val = ch; }
        break;
      case "valdq": if (ch === '"') e.s = "tag"; else e.val += ch; break;
      case "valsq": if (ch === "'") e.s = "tag"; else e.val += ch; break;
      case "valunq":
        if (/\s/.test(ch)) e.s = "tag";
        else if (ch === ">") e.s = "text";
        else e.val += ch;
        break;
    }
  }
}
function contextoDe(e) {
  switch (e.s) {
    case "text": case "comment": return "text";
    case "raw": return "raw";
    case "tagname": case "tag": case "attrname": case "afterattr": return "tag";
    case "beforeval": case "valunq": return "unq";
    case "valdq": case "valsq": {
      if (/^on/.test(e.attr)) return "event";
      if (ATRIB_URL.has(e.attr) && e.val.trim() === "") return "url";
      return "attr";
    }
  }
  return "text";
}

function analisar(codigo, opcoes = {}) {
  const ast = parser.parse(codigo, { sourceType: "script", errorRecovery: true, allowReturnOutsideFunction: true });
  const achados = [];
  const vistos = new Set();
  const visitando = new Set();
  const memoRotulo = new Map();
  // nomes de função chamados de dentro de texto (onclick="f(...)" montado em string, ou no index.html): os argumentos não são visíveis daqui
  const chamadosPorTexto = new Set();
  const RE_CHAMADA = /([A-Za-z_$][\w$]*)\(/g;
  const juntarNomes = (s) => { let m; RE_CHAMADA.lastIndex = 0; while ((m = RE_CHAMADA.exec(s))) chamadosPorTexto.add(m[1]); };
  juntarNomes(opcoes.htmlExtra || "");
  traverse(ast, {
    StringLiteral(p) { juntarNomes(p.node.value); },
    TemplateElement(p) { juntarNomes(p.node.value.raw); }
  });
  const memoParam = new Map();
  // parâmetro de função local: seguro se TODAS as chamadas passam valor seguro naquela posição
  function rotuloParam(b) {
    if (ehParamIndice(b)) return L.NUM;
    const p = b.path;
    // 1º parâmetro (ou pedaço desestruturado dele) de callback de lista: vale o que a lista tem
    if (p.listKey === "params" && p.key === 0 && ehFuncao(p.parent)) {
      const fnp = p.parentPath, ch = fnp.parentPath;
      if (ch && ehChamada(ch.node) && fnp.listKey === "arguments" && fnp.key === 0 && ehMembro(ch.node.callee) && CALLBACK_INDICE.has(nomePropriedade(ch.node.callee))) {
        const obj = ch.get("callee").get("object");
        if (ehChamada(obj.node) && ehMembro(obj.node.callee) && obj.node.callee.object.type === "Identifier" && obj.node.callee.object.name === "Object" && ["entries", "keys", "values"].includes(nomePropriedade(obj.node.callee))) {
          const alvo = obj.get("arguments")[0];
          return alvo && objetoConstante(alvo) ? L.CONST : L.NADA;
        }
        if (p.node.type !== "Identifier") return listaConstante(obj) ? L.CONST : L.NADA;
        if (memoParam.has(b.identifier)) return memoParam.get(b.identifier);
        memoParam.set(b.identifier, TODOS);
        const r = rotuloElementos(obj);
        memoParam.set(b.identifier, r);
        return r;
      }
    }
    if (p.node.type !== "Identifier" || p.listKey !== "params") return L.NADA;
    if (memoParam.has(b.identifier)) return memoParam.get(b.identifier);
    memoParam.set(b.identifier, TODOS); // ciclo (recursão): otimista
    const r = rotuloParam0(p);
    memoParam.set(b.identifier, r);
    return r;
  }
  function listaConstante(p) {
    if (p.node.type === "ArrayExpression") return ehLiteralConstante(p.node);
    if (p.node.type === "Identifier") return !!bindingConstante(p);
    if (ehChamada(p.node) && ehMembro(p.node.callee) && METODOS_LISTA.has(nomePropriedade(p.node.callee))) return listaConstante(p.get("callee").get("object"));
    return false;
  }
  // argumentos que os chamadores passam na posição deste parâmetro (null se a função escapa para lugar que não se vê)
  function argumentosDoParametro(p) {
    if (p.node.type !== "Identifier" || p.listKey !== "params") return null;
    const fn = p.parentPath;
    let nome = null;
    if (fn.isFunctionDeclaration() && fn.node.id) nome = fn.node.id.name;
    else if (fn.parentPath && fn.parentPath.isVariableDeclarator() && fn.parentPath.node.id.type === "Identifier") nome = fn.parentPath.node.id.name;
    if (!nome) return null;
    const fb = fn.parentPath.scope.getBinding(nome);
    if (fb && fb.scope.path.isProgram() && chamadosPorTexto.has(nome)) return null;
    if (!fb || !fb.referencePaths.length || fb.constantViolations.length) return null;
    const out = [];
    for (const ref of fb.referencePaths) {
      if (!(ehChamada(ref.parent) && ref.parent.callee === ref.node)) return null;
      const args = ref.parentPath.get("arguments");
      if (args.some(a => a.isSpreadElement())) return null;
      out.push(args[p.key] || null);
    }
    return out;
  }
  function rotuloParam0(p) {
    const fn = p.parentPath;
    let nome = null;
    if (fn.isFunctionDeclaration() && fn.node.id) nome = fn.node.id.name;
    else if (fn.parentPath && fn.parentPath.isVariableDeclarator() && fn.parentPath.node.id.type === "Identifier") nome = fn.parentPath.node.id.name;
    if (!nome) return L.NADA;
    const fb = fn.parentPath.scope.getBinding(nome);
    if (fb && fb.scope.path.isProgram() && chamadosPorTexto.has(nome)) return L.NADA;
    if (!fb || !fb.referencePaths.length || fb.constantViolations.length) return L.NADA;
    let r = TODOS;
    for (const ref of fb.referencePaths) {
      if (!(ehChamada(ref.parent) && ref.parent.callee === ref.node)) return L.NADA;
      const args = ref.parentPath.get("arguments");
      if (args.some(a => a.isSpreadElement())) return L.NADA;
      r &= args[p.key] ? rotulo(args[p.key]) : L.CONST;
      if (!r) return L.NADA;
    }
    return r;
  }

  function reportar(no, ctx, motivo, remoto, origem) {
    const chave = no.start + ":" + ctx;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    achados.push({ inicio: no.start, fim: no.end, linha: no.loc.start.line, coluna: no.loc.start.column, ctx, motivo, remoto: !!remoto, texto: codigo.slice(no.start, no.end), origem });
    return true;
  }

  // índice do callback (2º parâmetro de map/forEach...) é número
  function ehParamIndice(binding) {
    const p = binding.path;
    const fn = p.parentPath;
    if (!fn || !ehFuncao(fn.node) || p.listKey !== "params") return false;
    const chamada = fn.parentPath;
    if (!chamada || !ehChamada(chamada.node) || fn.listKey !== "arguments") return false;
    const nome = nomePropriedade(chamada.node.callee);
    if (CALLBACK_INDICE.has(nome) && p.key === 1) return true;
    if (nome === "reduce" && p.key === 2) return true;
    return false;
  }

  // objeto/array literal constante (const MAPA = { A: "x" }) → qualquer acesso dá constante
  function ehLiteralConstante(no) {
    if (!no) return false;
    if (no.type === "StringLiteral" || no.type === "NumericLiteral" || no.type === "BooleanLiteral" || no.type === "NullLiteral") return true;
    if (no.type === "TemplateLiteral") return no.expressions.length === 0;
    if (no.type === "ArrayExpression") return no.elements.every(ehLiteralConstante);
    if (no.type === "ObjectExpression") return no.properties.every(pr => pr.type === "ObjectProperty" && ehLiteralConstante(pr.value));
    if (no.type === "UnaryExpression") return ehLiteralConstante(no.argument);
    return false;
  }

  function bindingConstante(p) {
    if (p.node.type !== "Identifier") return null;
    const b = p.scope.getBinding(p.node.name);
    if (!b || b.kind !== "const" || !b.path.isVariableDeclarator()) return null;
    return ehLiteralConstante(b.path.node.init) ? b : null;
  }

  // map(escaparHtmlEbd), map(Number)...: callback que é o próprio helper/conversor
  function rotuloCallbackNativo(cb) {
    if (cb.node.type !== "Identifier") return null;
    const nm = cb.node.name;
    if (ESCAPE_HTML.has(nm)) return L.ESC;
    if (ESCAPE_JS.has(nm)) return L.JS;
    if (ESCAPE_URL.has(nm)) return L.URL;
    if (nm === "Number" || nm === "parseInt" || nm === "parseFloat" || nm === "Boolean") return L.NUM;
    return null;
  }
  // objeto constante do código: literal em const, ou parâmetro que só recebe objetos assim (pscDe(PSC_ROTULO, ...))
  const visitandoObj = new Set();
  function objetoConstante(p) {
    if (p.node.type !== "Identifier") return false;
    if (bindingConstante(p)) return true;
    const b = p.scope.getBinding(p.node.name);
    if (!b || b.kind !== "param") return false;
    if (visitandoObj.has(b.identifier)) return true; // recursão: os outros chamadores decidem
    visitandoObj.add(b.identifier);
    try {
      // parâmetro repassado de função em função (cnlSelo(mapa) -> cnlDe(mapa)): todos os chamadores, em cadeia, passam objeto constante
      const args = argumentosDoParametro(b.path);
      return !!args && args.length > 0 && args.every(a => a && objetoConstante(a));
    } finally { visitandoObj.delete(b.identifier); }
  }

  // a expressão monta HTML (tem tag em algum pedaço literal)? Variável/função assim é "acumulador de HTML": o conserto é no pedaço cru lá dentro.
  function contemTag(n) {
    if (!n) return false;
    switch (n.type) {
      case "StringLiteral": return TAG.test(n.value);
      case "TemplateLiteral": return n.quasis.some(q => TAG.test(q.value.cooked || "")) || n.expressions.some(contemTag);
      case "ConditionalExpression": return contemTag(n.consequent) || contemTag(n.alternate);
      case "LogicalExpression": return contemTag(n.left) || contemTag(n.right);
      case "BinaryExpression": return n.operator === "+" && (contemTag(n.left) || contemTag(n.right));
      case "AssignmentExpression": return contemTag(n.right);
    }
    return false;
  }

  function funcoesDoParametro(calleePath) {
    if (calleePath.node.type !== "Identifier") return null;
    const b = calleePath.scope.getBinding(calleePath.node.name);
    if (!b || b.kind !== "param" || b.path.node.type !== "Identifier" || b.path.listKey !== "params") return null;
    const fn = b.path.parentPath;
    let nome = null;
    if (fn.isFunctionDeclaration() && fn.node.id) nome = fn.node.id.name;
    else if (fn.parentPath && fn.parentPath.isVariableDeclarator() && fn.parentPath.node.id.type === "Identifier") nome = fn.parentPath.node.id.name;
    if (!nome) return null;
    const fb = fn.parentPath.scope.getBinding(nome);
    if (fb && fb.scope.path.isProgram() && chamadosPorTexto.has(nome)) return null;
    if (!fb || !fb.referencePaths.length) return null;
    const out = [];
    for (const ref of fb.referencePaths) {
      if (!(ehChamada(ref.parent) && ref.parent.callee === ref.node)) return null;
      const arg = ref.parentPath.get("arguments")[b.path.key];
      if (!arg) return null;
      const alvo = ehFuncao(arg.node) ? arg : funcaoLocal(arg);
      if (!alvo) return null;
      out.push(alvo);
    }
    return out;
  }
  function funcaoLocal(calleePath) {
    if (calleePath.node.type === "FunctionExpression" || calleePath.node.type === "ArrowFunctionExpression") return calleePath;
    if (calleePath.node.type !== "Identifier") return null;
    const b = calleePath.scope.getBinding(calleePath.node.name);
    if (!b) return null;
    if (b.path.isFunctionDeclaration()) return b.path;
    if (b.path.isVariableDeclarator() && ehFuncao(b.path.node.init) && b.constantViolations.length === 0) return b.path.get("init");
    return null;
  }
  function retornosDe(fnPath) {
    const out = [];
    if (fnPath.node.type === "ArrowFunctionExpression" && fnPath.node.body.type !== "BlockStatement") return [fnPath.get("body")];
    fnPath.traverse({
      Function(p) { p.skip(); },
      ReturnStatement(p) { if (p.node.argument) out.push(p.get("argument")); }
    });
    return out;
  }

  // ---- rótulo de uma expressão "atômica" (sem estrutura de HTML) ----
  function rotulo(p) {
    const n = p.node;
    if (!n) return L.CONST;
    if (memoRotulo.has(n)) return memoRotulo.get(n);
    if (visitando.has(n)) return TODOS; // ciclo: otimista (o outro caminho decide)
    visitando.add(n);
    const r = rotulo0(p);
    visitando.delete(n);
    memoRotulo.set(n, r);
    return r;
  }
  function rotulo0(p) {
    const n = p.node;
    switch (n.type) {
      case "StringLiteral": case "NumericLiteral": case "BooleanLiteral": case "NullLiteral": case "RegExpLiteral": case "ObjectExpression": return L.CONST;
      case "UnaryExpression": case "UpdateExpression": return L.NUM;
      case "BinaryExpression":
        if (n.operator !== "+") return L.NUM;
        return rotulo(p.get("left")) & rotulo(p.get("right"));
      case "TemplateLiteral": {
        let r = n.quasis.some(q => TAG.test(q.value.cooked || "")) ? L.HTML : TODOS;
        // quasi com aspas/espaços: o texto constante continua seguro em texto; os pedaços decidem
        for (const e of p.get("expressions")) r &= rotulo(e);
        return r;
      }
      case "ConditionalExpression": return rotulo(p.get("consequent")) & rotulo(p.get("alternate"));
      case "LogicalExpression":
        if (n.operator === "&&") return rotulo(p.get("right"));
        return rotulo(p.get("left")) & rotulo(p.get("right"));
      case "AssignmentExpression": return rotulo(p.get("right"));
      case "SequenceExpression": return rotulo(p.get("expressions")[n.expressions.length - 1]);
      case "AwaitExpression": return L.NADA;
      case "ArrayExpression": return p.get("elements").reduce((a, e) => a & (e.node ? rotulo(e) : TODOS), TODOS);
      case "Identifier": {
        if (n.name === "undefined" || n.name === "NaN" || n.name === "Infinity") return L.CONST;
        if (/Id$/.test(n.name) || n.name === "id") return L.ID;
        const b = p.scope.getBinding(n.name);
        if (!b) return L.NADA;
        if (b.kind === "param") return rotuloParam(b);
        if (!b.path.isVariableDeclarator()) return L.NADA;
        if (b.path.node.id.type === "ArrayPattern" && b.path.node.init) {
          const idx = b.path.node.id.elements.findIndex(e => e && e.type === "Identifier" && e.name === n.name);
          const porIndice = (q) => q.isArrayExpression() ? (q.get("elements")[idx] && q.get("elements")[idx].node ? rotulo(q.get("elements")[idx]) : L.CONST)
            : q.isConditionalExpression() ? porIndice(q.get("consequent")) & porIndice(q.get("alternate"))
              : q.isLogicalExpression() ? porIndice(q.get("left")) & porIndice(q.get("right"))
                : q.isNullLiteral() ? L.CONST
                  : ehChamada(q.node) || ehMembro(q.node) ? rotulo(q) : L.NADA; // lista inteira constante (mapa de rótulos do código)
          return idx >= 0 && b.constantViolations.length === 0 ? porIndice(b.path.get("init")) : L.NADA;
        }
        if (b.path.node.id.type !== "Identifier") return L.NADA; // desestruturação: dado cru
        const pai = b.path.parentPath && b.path.parentPath.parentPath;
        if (pai && (pai.isForOfStatement() || pai.isForInStatement())) return L.NADA;
        let r = b.path.node.init ? rotulo(b.path.get("init")) : L.CONST;
        for (const v of b.constantViolations) {
          if (v.isAssignmentExpression()) r &= rotulo(v.get("right"));
          else if (v.isUpdateExpression()) r &= L.NUM;
          else r &= L.NADA;
        }
        return r;
      }
      case "MemberExpression": case "OptionalMemberExpression": {
        const nome = nomePropriedade(n);
        if (nome === "length" || nome === "size") return L.NUM;
        if (nome && (/Id$/.test(nome) || nome === "id")) return L.ID;
        if (objetoConstante(p.get("object"))) return L.CONST;
        return L.NADA;
      }
      case "CallExpression": case "OptionalCallExpression": {
        const cal = p.get("callee");
        if (cal.node.type === "Identifier") {
          const nm = cal.node.name;
          if (ESCAPE_HTML.has(nm)) return L.ESC;
          if (ESCAPE_JS.has(nm)) return L.JS;
          if (ESCAPE_URL.has(nm)) return L.URL;
          if (nm === "Number" || nm === "parseInt" || nm === "parseFloat" || nm === "Boolean" || nm === "isNaN") return L.NUM;
          if (nm === "encodeURIComponent") return L.ENC;
          if (nm === "String") return n.arguments.length ? rotulo(p.get("arguments")[0]) : L.CONST;
          const fn = funcaoLocal(cal);
          if (fn) return retornosDe(fn).reduce((a, r) => a & rotulo(r), TODOS);
          // função recebida por parâmetro (desenho(i)): vale o que as funções passadas pelos chamadores devolvem
          const fns = funcoesDoParametro(cal);
          if (fns) return fns.reduce((a, f2) => a & retornosDe(f2).reduce((x, r) => x & rotulo(r), TODOS), TODOS);
          return L.NADA;
        }
        if (ehMembro(cal.node)) {
          const nome = nomePropriedade(cal.node);
          const obj = cal.get("object");
          if (obj.node.type === "Identifier" && (obj.node.name === "Math" || obj.node.name === "Date")) return L.NUM;
          if (nome === "toLocaleString" || METODOS_NUM.has(nome)) return L.NUM;
          if (nome === "join") {
            let r = n.arguments.length ? rotulo(p.get("arguments")[0]) : L.CONST;
            return r & rotuloElementos(obj);
          }
          if (nome === "map" || nome === "flatMap") return rotuloElementos(p);
          if (METODOS_TEXTO.has(nome)) {
            // replace(x, y): o resultado tem pedaços do objeto e de y
            let r = rotulo(obj);
            if ((nome === "replace" || nome === "replaceAll") && n.arguments[1] && !ehFuncao(n.arguments[1])) r &= rotulo(p.get("arguments")[1]);
            return r;
          }
          if (nome === "toString") return rotulo(obj);
        }
        return L.NADA;
      }
      default: return L.NADA;
    }
  }
  // rótulo dos elementos de uma lista (o que o .join juntaria)
  function rotuloElementos(p) {
    const n = p.node;
    if (ehChamada(n) && ehMembro(n.callee)) {
      const nome = nomePropriedade(n.callee);
      const obj = p.get("callee").get("object");
      if (nome === "map" || nome === "flatMap") {
        const cb = p.get("arguments")[0];
        if (!cb) return L.NADA;
        const rcb = rotuloCallbackNativo(cb);
        if (rcb !== null) return rcb;
        let fn = ehFuncao(cb.node) ? cb : funcaoLocal(cb);
        if (!fn) return L.NADA;
        return retornosDe(fn).reduce((a, r) => a & rotulo(r), TODOS);
      }
      if (METODOS_LISTA.has(nome)) {
        let r = rotuloElementos(obj);
        if (nome === "concat") for (const a of p.get("arguments")) r &= rotuloElementos(a) & (a.isArrayExpression() ? TODOS : TODOS);
        return r;
      }
      if (nome === "split") return rotulo(obj);
      if (obj.node.type === "Identifier" && obj.node.name === "Object" && (nome === "keys")) return L.NADA;
      return L.NADA;
    }
    if (n.type === "NewExpression" && n.callee.type === "Identifier" && n.callee.name === "Set" && n.arguments[0]) return rotuloElementos(p.get("arguments")[0]);
    if (n.type === "Identifier") {
      const b = p.scope.getBinding(n.name);
      if (b && b.kind === "param") {
        const args = argumentosDoParametro(b.path);
        if (!args) return L.NADA;
        if (memoParam.has(b.identifier)) return memoParam.get(b.identifier);
        memoParam.set(b.identifier, TODOS);
        const r = args.reduce((a, x) => a & (x ? rotuloElementos(x) : TODOS), TODOS);
        memoParam.set(b.identifier, r);
        return r;
      }
    }
    if (n.type === "ArrayExpression") return p.get("elements").reduce((a, e) => a & (e.node ? (e.isSpreadElement() ? rotuloElementos(e.get("argument")) : rotulo(e)) : TODOS), TODOS);
    if (n.type === "Identifier") {
      const b = p.scope.getBinding(n.name);
      if (!b || !b.path.isVariableDeclarator() || b.path.node.id.type !== "Identifier" || !b.path.node.init) return L.NADA;
      let r = rotuloElementos(b.path.get("init"));
      for (const ref of b.referencePaths) {
        const m = ref.parentPath;
        if (m && ehMembro(m.node) && m.node.object === ref.node && (nomePropriedade(m.node) === "push" || nomePropriedade(m.node) === "unshift") && ehChamada(m.parent) && m.parent.callee === m.node) {
          for (const a of m.parentPath.get("arguments")) r &= rotulo(a);
        }
      }
      for (const v of b.constantViolations) r &= v.isAssignmentExpression() ? rotuloElementos(v.get("right")) : L.NADA;
      return r;
    }
    if (n.type === "LogicalExpression") return rotuloElementos(p.get("left")) & rotuloElementos(p.get("right"));
    if (n.type === "ConditionalExpression") return rotuloElementos(p.get("consequent")) & rotuloElementos(p.get("alternate"));
    return L.NADA;
  }

  // ---- checagem estrutural: desce pelo HTML e relata onde o dado entra sem a proteção certa ----
  // "ponto": quando o caminho passou por uma variável ou retorno de função, o conserto vai no ponto em que ela entra no HTML (não na origem, que pode servir a
  // outro uso em texto puro). Dentro de um template com tags o ponto zera: o pedaço cru ali dentro é o lugar do conserto.
  const checados = new Set();
  const ehVarSimples = (b) => b && b.path.isVariableDeclarator() && b.path.node.id.type === "Identifier" && !(b.path.parentPath && b.path.parentPath.parentPath && (b.path.parentPath.parentPath.isForOfStatement() || b.path.parentPath.parentPath.isForInStatement()));
  function checar(p, ctxObj, ponto) {
    const n = p.node;
    if (!n) return;
    const ctx = ctxObj.ctx;
    const chave = n.start + ":" + n.end + ":" + n.type + ":" + ctx + ":" + JSON.stringify(ctxObj.estado || null) + ":" + (ponto ? ponto.start : "-");
    if (checados.has(chave)) return;
    checados.add(chave);
    switch (n.type) {
      case "TemplateLiteral": {
        const e = novoEstado(ctxObj);
        const exps = p.get("expressions");
        for (let i = 0; i < n.quasis.length; i++) {
          avancar(e, n.quasis[i].value.cooked != null ? n.quasis[i].value.cooked : n.quasis[i].value.raw);
          if (i < exps.length) {
            checar(exps[i], { ctx: contextoDe(e), estado: Object.assign({}, e) }, null);
            if (e.s === "valdq" || e.s === "valsq" || e.s === "valunq" || e.s === "beforeval") { e.val += "\u0001"; if (e.s === "beforeval") e.s = "valunq"; }
          }
        }
        return;
      }
      case "BinaryExpression": {
        if (n.operator !== "+") break;
        const partes = [];
        (function achatar(q) { if (q.node.type === "BinaryExpression" && q.node.operator === "+") { achatar(q.get("left")); achatar(q.get("right")); } else partes.push(q); })(p);
        if (!partes.some(q => q.node.type === "StringLiteral" || q.node.type === "TemplateLiteral")) {
          // soma de pedaços sem texto literal (htmlA + htmlB, ou número + número): cada pedaço entra no mesmo lugar
          for (const q of partes) checar(q, ctxObj, ponto);
          return;
        }
        const e = novoEstado(ctxObj);
        for (const q of partes) {
          if (q.node.type === "StringLiteral") { avancar(e, q.node.value); continue; }
          checar(q, { ctx: contextoDe(e), estado: Object.assign({}, e) }, null);
          if (e.s === "valdq" || e.s === "valsq" || e.s === "valunq") e.val += "\u0001";
        }
        return;
      }
      case "ConditionalExpression": checar(p.get("consequent"), ctxObj, ponto); checar(p.get("alternate"), ctxObj, ponto); return;
      case "LogicalExpression":
        if (n.operator !== "&&") checar(p.get("left"), ctxObj, ponto);
        checar(p.get("right"), ctxObj, ponto);
        return;
      case "Identifier": {
        const b = p.scope.getBinding(n.name);
        if (ehVarSimples(b)) {
          if (rotulo(p) & C[ctx]) return; // já é seguro neste contexto
          const acumulaHtml = contemTag(b.path.node.init) || b.constantViolations.some(v => contemTag(v.node));
          const pt = acumulaHtml ? null : (ponto || n);
          if (b.path.node.init) checar(b.path.get("init"), ctxObj, pt);
          for (const v of b.constantViolations) if (v.isAssignmentExpression()) checar(v.get("right"), ctxObj, pt);
          return;
        }
        break;
      }
      case "CallExpression": case "OptionalCallExpression": {
        const cal = p.get("callee");
        if (rotulo(p) & C[ctx]) return;
        const ehEscape = cal.node.type === "Identifier" && (ESCAPE_HTML.has(cal.node.name) || ESCAPE_JS.has(cal.node.name) || ESCAPE_URL.has(cal.node.name));
        const fn = ehEscape ? null : funcaoLocal(cal);
        const fns = fn ? [fn] : (ehEscape ? null : funcoesDoParametro(cal));
        if (fns) {
          for (const f2 of fns) { const rets = retornosDe(f2); const pt = rets.some(r => contemTag(r.node)) ? null : (ponto || n); for (const r of rets) checar(r, ctxObj, pt); }
          return;
        }
        if (ehMembro(cal.node)) {
          const nome = nomePropriedade(cal.node);
          if (nome === "join" || nome === "map" || nome === "flatMap") {
            if (nome === "join" && n.arguments[0]) checar(p.get("arguments")[0], ctxObj, ponto);
            checarElementos(nome === "join" ? cal.get("object") : p, ctxObj, ponto, ponto || n);
            return;
          }
        }
        break;
      }
      case "ArrayExpression": checarElementos(p, ctxObj, ponto, ponto || n); return;
    }
    const r = rotulo(p);
    if (!(r & C[ctx])) {
      const alvo = ponto || n;
      const novo = reportar(alvo, ctx, r === 0 ? "dado sem escape" : "escape errado para o contexto", !!ponto, ponto ? codigo.slice(n.start, n.end) : null);
      if (novo && !ponto && n.type === "Identifier") { const b = p.scope.getBinding(n.name); if (b && b.kind === "param") achados[achados.length - 1].param = true; }
    }
  }
  // elementos de uma lista que vai ser juntada (join) no HTML; "pontoLista" = a expressão inteira (o join), para consertar quando a origem é remota
  function checarElementos(p, ctxObj, ponto, pontoLista) {
    const n = p.node;
    if (ehChamada(n) && ehMembro(n.callee)) {
      const nome = nomePropriedade(n.callee);
      const obj = p.get("callee").get("object");
      if (nome === "map" || nome === "flatMap") {
        const cb = p.get("arguments")[0];
        const inline = cb && ehFuncao(cb.node);
        const rcb = cb ? rotuloCallbackNativo(cb) : null;
        if (rcb !== null) { if (!(rcb & C[ctxObj.ctx])) reportar(pontoLista, ctxObj.ctx, "lista sem escape", true, codigo.slice(n.start, n.end)); return; }
        const fn = cb && (inline ? cb : funcaoLocal(cb));
        if (!fn) { reportar(pontoLista, ctxObj.ctx, "lista sem escape", true, codigo.slice(n.start, n.end)); return; }
        for (const r of retornosDe(fn)) checar(r, ctxObj, inline ? ponto : pontoLista);
        return;
      }
      if (METODOS_LISTA.has(nome)) { checarElementos(obj, ctxObj, ponto, pontoLista); if (nome === "concat") for (const a of p.get("arguments")) checarElementos(a, ctxObj, ponto, pontoLista); return; }
    }
    if (n.type === "ArrayExpression") { for (const e of p.get("elements")) if (e.node) (e.isSpreadElement() ? checarElementos(e.get("argument"), ctxObj, ponto, pontoLista) : checar(e, ctxObj, ponto)); return; }
    if (n.type === "Identifier") {
      const b = p.scope.getBinding(n.name);
      if (ehVarSimples(b) && b.path.node.init) {
        checarElementos(b.path.get("init"), ctxObj, pontoLista, pontoLista);
        for (const ref of b.referencePaths) {
          const m = ref.parentPath;
          if (m && ehMembro(m.node) && m.node.object === ref.node && (nomePropriedade(m.node) === "push" || nomePropriedade(m.node) === "unshift") && ehChamada(m.parent) && m.parent.callee === m.node) {
            for (const a of m.parentPath.get("arguments")) checar(a, ctxObj, pontoLista);
          }
        }
        for (const v of b.constantViolations) if (v.isAssignmentExpression()) checarElementos(v.get("right"), ctxObj, pontoLista, pontoLista);
        return;
      }
    }
    if (n.type === "LogicalExpression") { checarElementos(p.get("left"), ctxObj, ponto, pontoLista); checarElementos(p.get("right"), ctxObj, ponto, pontoLista); return; }
    if (n.type === "ConditionalExpression") { checarElementos(p.get("consequent"), ctxObj, ponto, pontoLista); checarElementos(p.get("alternate"), ctxObj, ponto, pontoLista); return; }
    if (!(rotuloElementos(p) & C[ctxObj.ctx])) reportar(pontoLista, ctxObj.ctx, "lista sem escape", true, codigo.slice(n.start, n.end));
  }

  const TEXTO = { ctx: "text" };
  let raizes = 0, sinks = 0;
  traverse(ast, {
    TemplateLiteral(p) {
      if (p.parentPath.isTaggedTemplateExpression()) return;
      if (!p.node.quasis.some(q => TAG.test(q.value.cooked || ""))) return;
      raizes++;
      checar(p, TEXTO, null);
    },
    BinaryExpression(p) {
      if (p.node.operator !== "+" || (p.parentPath.isBinaryExpression() && p.parent.operator === "+")) return;
      const partes = [];
      (function achatar(q) { if (q.type === "BinaryExpression" && q.operator === "+") { achatar(q.left); achatar(q.right); } else partes.push(q); })(p.node);
      if (!partes.some(q => q.type === "StringLiteral" && TAG.test(q.value))) return;
      raizes++;
      checar(p, TEXTO, null);
    },
    AssignmentExpression(p) {
      const l = p.node.left;
      if (!ehMembro(l)) return;
      const nome = nomePropriedade(l);
      if (nome !== "innerHTML" && nome !== "outerHTML") return;
      sinks++;
      checar(p.get("right"), TEXTO, null);
    },
    CallExpression(p) {
      const cal = p.node.callee;
      const nome = ehMembro(cal) ? nomePropriedade(cal) : null;
      if (nome === "insertAdjacentHTML" && p.node.arguments[1]) { sinks++; checar(p.get("arguments")[1], TEXTO, null); }
      if ((nome === "write" || nome === "writeln") && cal.object.type === "Identifier" && cal.object.name === "document") { sinks++; for (const a of p.get("arguments")) checar(a, TEXTO, null); }
      if (nome === "createContextualFragment" || nome === "parseFromString") { sinks++; checar(p.get("arguments")[0], TEXTO, null); }
    }
  });
  achados.sort((a, b) => a.inicio - b.inicio);
  return { achados, raizes, sinks };
}


const DICA = {
  text: "escaparHtmlEbd(valor)",
  attr: "escaparHtmlEbd(valor)",
  event: "argJs(valor), sem aspas em volta: onclick=\"f(${argJs(valor)})\" (ou Number(valor) se é número)",
  url: "urlSegura(valor)",
  unq: "ponha o atributo entre aspas e use escaparHtmlEbd(valor)",
  tag: "não monte atributo/tag com dado; use um template com o atributo fixo e o valor escapado",
  raw: "não ponha dado dentro de <script>/<style>"
};
function filtrarExcecoes(achados) {
  return achados.filter(a => !Object.prototype.hasOwnProperty.call(EXCECOES_POR_TRECHO, a.texto));
}
function descrever(achados) {
  return achados.map(a => `  linha ${a.linha}: [${a.ctx}] ${a.texto.replace(/\s+/g, " ").slice(0, 120)}${a.origem ? `  (vem de: ${a.origem.replace(/\s+/g, " ").slice(0, 80)})` : ""}  -> use ${DICA[a.ctx]}`).join("\n");
}
const opcoesApp = { htmlExtra: INDEX };

describe("tela: nenhum dado entra em HTML sem a proteção do lugar", () => {
  let resultado;
  beforeAll(() => { resultado = analisar(SCRIPT, opcoesApp); });

  test("app/script.js: zero interpolação desprotegida (texto, atributo, evento e endereço)", () => {
    const achados = filtrarExcecoes(resultado.achados);
    if (achados.length) throw new Error(`${achados.length} ponto(s) de HTML sem a proteção certa em app/script.js:\n${descrever(achados)}`);
    // a varredura de fato passou pelo arquivo (não é um "zero" por não ter lido nada)
    expect(resultado.raizes).toBeGreaterThan(1000);
    expect(resultado.sinks).toBeGreaterThan(500);
  });

  test("toda exceção pontual ainda existe no código (lista não acumula lixo)", () => {
    for (const trecho of Object.keys(EXCECOES_POR_TRECHO)) expect(SCRIPT.includes(trecho)).toBe(true);
    for (const [regra, motivo] of Object.entries(EXCECOES_POR_REGRA)) { expect(regra.length).toBeGreaterThan(3); expect(motivo.length).toBeGreaterThan(4); }
  });

  test("app/index.html: HTML fixo, sem interpolação e sem script em linha (o único JS é o script.js e a biblioteca da planilha)", () => {
    expect(INDEX.includes("${")).toBe(false);
    const scripts = [...INDEX.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const s of scripts) {
      expect(/\bsrc\s*=/.test(s[1])).toBe(true);
      expect(s[2].trim()).toBe("");
    }
    // atributo de evento do index.html só chama função com argumento fixo (nada de valor vindo de fora)
    for (const m of INDEX.matchAll(/\son[a-z]+="([^"]*)"/gi)) expect(/\$\{|innerHTML|document\.write|eval\(/.test(m[1])).toBe(false);
  });
});

describe("o detector pega o que deve (e não reclama do que é seguro)", () => {
  const CASOS = [
    ["texto cru", "el.innerHTML = `<p>${d.nome}</p>`;", 1],
    ["texto escapado", "el.innerHTML = `<p>${escaparHtmlEbd(d.nome)}</p>`;", 0],
    ["mensagem da API concatenada", "el.innerHTML = '<p>' + data.mensagem + '</p>';", 1],
    ["mensagem da API direto no innerHTML", "el.innerHTML = data.mensagem;", 1],
    ["evento com escape de HTML (a aspa volta)", 'el.innerHTML = `<b onclick="f(\'${escaparHtmlEbd(d.nome)}\')">x</b>`;', 1],
    ["evento com argJs", 'el.innerHTML = `<b onclick="f(${argJs(d.nome)})">x</b>`;', 0],
    ["evento com id do banco", 'el.innerHTML = `<b onclick="f(${d.membroId})">x</b>`;', 0],
    ["href com escape de HTML (javascript: passa)", 'el.innerHTML = `<a href="${escaparHtmlEbd(d.link)}">x</a>`;', 1],
    ["href com urlSegura", 'el.innerHTML = `<a href="${urlSegura(d.link)}">x</a>`;', 0],
    ["href com caminho fixo", 'el.innerHTML = `<a href="/api/x/${encodeURIComponent(d.codigo)}">x</a>`;', 0],
    ["variável crua", "const n = d.nome || '-'; el.innerHTML = `<p>${n}</p>`;", 1],
    ["variável escapada", "const n = escaparHtmlEbd(d.nome); el.innerHTML = `<p>${n}</p>`;", 0],
    ["lista crua", "el.innerHTML = lista.map(x => `<li>${x.nome}</li>`).join('');", 1],
    ["lista com map(escaparHtmlEbd)", "el.innerHTML = `<p>${lista.map(escaparHtmlEbd).join(', ')}</p>`;", 0],
    ["push cru", "const b = []; b.push(d.nome); el.innerHTML = `<p>${b.join(', ')}</p>`;", 1],
    ["função que devolve cru", "function r(x) { return x.nome; } el.innerHTML = `<p>${r(d)}</p>`;", 1],
    ["parâmetro: um chamador manda cru", "function s(t) { return `<b>${t}</b>`; } el.innerHTML = s(d.nome); el2.innerHTML = s('Ok');", 1],
    ["parâmetro: chamadores mandam constante", "function s(t) { return `<b>${t}</b>`; } el.innerHTML = s('Ok');", 0],
    ["mapa de rótulos do código", "const R = { A: 'Ativo' }; el.innerHTML = `<p>${R[d.status]}</p>`;", 0],
    ["atributo sem aspas", "el.innerHTML = `<td class=${escaparHtmlEbd(d.c)}>x</td>`;", 1],
    ["insertAdjacentHTML", "el.insertAdjacentHTML('beforeend', `<p>${d.nome}</p>`);", 1],
    ["document.write", "w.document.write(`<title>${d.titulo}</title>`);", 1],
    ["números", "el.innerHTML = `<p>${d.lista.length} de ${Number(d.total)} (${(d.v * 100).toFixed(1)}%)</p>`;", 0],
    ["acumulador de HTML com pedaço cru", "let h = ''; h += `<tr><td>${d.nome}</td></tr>`; el.innerHTML = h;", 1]
  ];
  test.each(CASOS)("%s", (_nome, codigo, esperado) => {
    const { achados } = analisar(codigo, {});
    expect(achados.length).toBe(esperado);
  });
});

describe("mutação no arquivo real: tirar a proteção de pontos verdadeiros faz a varredura acusar cada um", () => {
  test("texto, evento e endereço", () => {
    const linhaDe = (txt, idx) => txt.slice(0, idx).split("\n").length;
    const mutacoes = [];
    const escolher = (re, filtro, max) => {
      let m, n = 0;
      re.lastIndex = 0;
      while ((m = re.exec(SCRIPT)) && n < max) {
        const linha = SCRIPT.slice(SCRIPT.lastIndexOf("\n", m.index) + 1, SCRIPT.indexOf("\n", m.index));
        if (!filtro(m, linha)) continue;
        mutacoes.push({ ini: m.index, fim: m.index + m[0].length, m });
        n++;
      }
    };
    // 3 nomes/títulos escapados em linha de HTML -> cru
    escolher(/\$\{escaparHtmlEbd\(([a-zA-Z_]\w*\.(?:nome|titulo|descricao|motivo))\)\}/g, (m, l) => l.includes("<"), 3);
    // 1 argumento de evento -> volta ao '${x}' antigo
    escolher(/\$\{argJs\(([a-zA-Z_]\w*\.[a-zA-Z_]\w*)\)\}/g, (m) => !/Id$/.test(m[1]), 1);
    // 1 endereço -> escape de HTML (que não barra "javascript:")
    escolher(/\$\{urlSegura\(([^()]+)\)\}/g, () => true, 1);
    expect(mutacoes.length).toBe(5);
    const trocar = (mu) => mu.m[0].startsWith("${escaparHtmlEbd(") ? "${" + mu.m[1] + "}" : mu.m[0].startsWith("${argJs(") ? "'${" + mu.m[1] + "}'" : "${escaparHtmlEbd(" + mu.m[1] + ")}";
    let mutado = SCRIPT;
    for (const mu of mutacoes.slice().sort((a, b) => b.ini - a.ini)) mutado = mutado.slice(0, mu.ini) + trocar(mu) + mutado.slice(mu.fim);
    const { achados } = analisar(mutado, opcoesApp);
    const linhasAcusadas = new Set(achados.map(a => a.linha));
    for (const mu of mutacoes) expect([mu.m[0], linhasAcusadas.has(linhaDe(SCRIPT, mu.ini))]).toEqual([mu.m[0], true]);
    expect(new Set(achados.map(a => a.ctx))).toEqual(new Set(["text", "event", "url"]));
  });
});

describe("os helpers da tela resistem a texto hostil", () => {
  // tira as funções do próprio script.js (as mesmas que rodam no navegador)
  const ast = parser.parse(SCRIPT, { sourceType: "script" });
  const fontes = {};
  for (const no of ast.program.body) if (no.type === "FunctionDeclaration" && ["escaparHtmlEbd", "argJs", "urlSegura"].includes(no.id.name)) fontes[no.id.name] = SCRIPT.slice(no.start, no.end);
  const ctx = vm.createContext({});
  vm.runInContext(Object.values(fontes).join("\n") + "\nthis.h = { escaparHtmlEbd, argJs, urlSegura };", ctx);
  const h = ctx.h;
  // o que o navegador faz com o valor de um atributo antes de rodar o JS dele
  const decodificarAtributo = (s) => s.replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const HOSTIS = ["'", "\"", "\\", "</script><script>alert(1)</script>", "linha 1\nlinha 2\r\n", "${alert(1)}", "`", "');alert(1);//", "\"><img src=x onerror=window.__pwn=1>", "  ", "a\\'b", "&#39;); alert(1); ('"];

  test("os três helpers existem no script.js", () => expect(Object.keys(fontes).sort()).toEqual(["argJs", "escaparHtmlEbd", "urlSegura"]));

  test.each(HOSTIS)("argJs(%j): não fecha o atributo e o JS recebe exatamente o texto", (hostil) => {
    const valorAtributo = `f(${h.argJs(hostil)})`;
    expect(valorAtributo).not.toMatch(/["<>]/); // nada fecha o onclick="..." nem abre tag
    let recebido = "__nada__";
    const sandbox = vm.createContext({ f: (x) => { recebido = x; }, alert: () => { throw new Error("executou código injetado"); } });
    vm.runInContext(decodificarAtributo(valorAtributo), sandbox);
    expect(recebido).toBe(hostil);
  });

  test("argJs de nulo/número vira string (nunca 'null' solto no código)", () => {
    expect(decodificarAtributo(h.argJs(null))).toBe("\"\"");
    expect(decodificarAtributo(h.argJs(12))).toBe("\"12\"");
  });

  test.each([
    ["javascript:alert(1)", "#"],
    [" JaVaScRiPt:alert(1)", "#"],
    ["java\tscript:alert(1)", "#"],
    ["java\nscript:alert(1)", "#"],
    ["\u0001javascript:alert(1)", "#"],
    ["vbscript:msgbox(1)", "#"],
    ["data:text/html,<script>alert(1)</script>", "#"],
    ["https://conta.blob.core.windows.net/a/b.pdf?sv=1&sig=x", "https://conta.blob.core.windows.net/a/b.pdf?sv=1&amp;sig=x"],
    ["http://exemplo.org/\"onmouseover=\"alert(1)", "http://exemplo.org/&quot;onmouseover=&quot;alert(1)"],
    ["/api/anexos/1", "/api/anexos/1"],
    ["verificar.html?c=AB12", "verificar.html?c=AB12"],
    ["data:image/png;base64,iVBORw0KGgo=", "data:image/png;base64,iVBORw0KGgo="],
    ["blob:https://app/123", "blob:https://app/123"],
    ["mailto:secretaria@exemplo.org", "mailto:secretaria@exemplo.org"],
    [null, ""]
  ])("urlSegura(%j) -> %j", (entrada, esperado) => expect(h.urlSegura(entrada)).toBe(esperado));

  test("escaparHtmlEbd cobre os 5 caracteres e nulo", () => {
    expect(h.escaparHtmlEbd("<a href=\"x\" title='y'>&</a>")).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
    expect(h.escaparHtmlEbd(null)).toBe("");
    expect(h.escaparHtmlEbd(0)).toBe("0");
  });
});
