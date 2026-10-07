// Regra permanente da tela para a CSP forte (script-src 'self', sem 'unsafe-inline' nem 'unsafe-eval'): NENHUM código escrito dentro do HTML.
// O navegador, com essa política, simplesmente ignora onclick="...", <script> sem src, href="javascript:..." e eval — o botão "morre" em silêncio.
// Por isso este teste lê o código de verdade (app/index.html, app/verificar.html, app/script.js, app/modulos/*.js, app/eventos.js, app/verificar.js) e falha quando:
//   - aparece atributo de evento em linha (onclick=, onchange=, ... qualquer on<algo>=) no HTML ou num texto/template do script.js/módulos;
//   - aparece "javascript:", <script> sem src (ou com src de fora), eval, new Function, setTimeout/setInterval com texto, setAttribute("on...");
//   - um data-on-<tipo>="acao" pede ação que não está em NENHUM registrarAcoes({...}) (fim do script.js e fim de cada módulo), ou o registro tem nome que ninguém usa;
//   - (vD.2) um módulo de app/modulos/ não tem o seu registrarAcoes, ou repete nome de nível superior de outro arquivo (scripts clássicos dividem um só
//     escopo: função repetida esconde a outra em silêncio; const/let repetido faz o navegador recusar o arquivo inteiro);
//   - um nome de ação dinâmico (data-on-click="${x}") não vem de lista fechada do código (texto fixo, ou parâmetro que só recebe texto fixo);
//   - um data-args-<tipo>="${...}" não passa por argsAttr(...) (o valor de usuário entraria cru no atributo).
// Como os eventos funcionam agora: app/eventos.js (despachante por delegação; teste próprio em eventosDespachante.test.js).
// Exceções: lista explícita e justificada em EXCECOES — vazia de propósito (precisando, entra com o motivo; decisão consciente, nunca esquecimento).
// Depende só do @babel/parser e @babel/traverse que já vêm com o jest (devDependency); nada disso vai para produção.
const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const APP = path.join(__dirname, "..", "..", "..", "app");
const ler = (nome) => fs.readFileSync(path.join(APP, nome), "utf8");
const TIPOS = ["click", "change", "input", "submit", "keydown"];
const ESPECIAIS = new Set(["this", "event", "value", "checked", "undefined", "NaN", "objeto"]);
// trecho exato -> motivo. Vazia de propósito: hoje nenhum ponto precisa.
const EXCECOES = {};

// ================= HTML (tokenizador de tags: respeita aspas e o conteúdo cru de <script>/<style>) =================
function tagsDoHtml(html) {
  const tags = [];
  let i = 0;
  const n = html.length;
  while (i < n) {
    if (html.startsWith("<!--", i)) { const f = html.indexOf("-->", i + 4); i = f < 0 ? n : f + 3; continue; }
    if (html[i] !== "<" || !/[a-zA-Z]/.test(html[i + 1] || "")) { i++; continue; }
    const ini = i;
    i++;
    let nome = "";
    while (i < n && /[^\s/>]/.test(html[i])) nome += html[i++];
    nome = nome.toLowerCase();
    const attrs = [];
    for (;;) {
      while (i < n && /[\s/]/.test(html[i])) i++;
      if (i >= n || html[i] === ">") { i++; break; }
      let an = "";
      while (i < n && /[^\s=>/]/.test(html[i])) an += html[i++];
      while (i < n && /\s/.test(html[i])) i++;
      let valor = null;
      if (html[i] === "=") {
        i++;
        while (i < n && /\s/.test(html[i])) i++;
        if (html[i] === "\"" || html[i] === "'") { const q = html[i]; const f = html.indexOf(q, i + 1); valor = html.slice(i + 1, f < 0 ? n : f); i = f < 0 ? n : f + 1; } else { valor = ""; while (i < n && /[^\s>]/.test(html[i])) valor += html[i++]; }
      }
      attrs.push({ nome: an.toLowerCase(), valor });
    }
    const tag = { nome, attrs, linha: html.slice(0, ini).split("\n").length, conteudo: null };
    if (nome === "script" || nome === "style") { const f = html.toLowerCase().indexOf("</" + nome, i); tag.conteudo = html.slice(i, f < 0 ? n : f); i = f < 0 ? n : f; }
    tags.push(tag);
  }
  return tags;
}
const decodificarAtributo = (s) => s.replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
function especiaisInvalidos(v) {
  if (Array.isArray(v)) return v.some(especiaisInvalidos);
  if (v && typeof v === "object") {
    if (Object.prototype.hasOwnProperty.call(v, "$") && !ESPECIAIS.has(v.$)) return true;
    return Object.values(v).some(especiaisInvalidos);
  }
  return false;
}
// -> { problemas: [texto], acoes: Map(nome -> [onde]) }
function analisarHtml(nomeArq, html) {
  const problemas = [], acoes = new Map();
  const onde = (t) => `${nomeArq}:${t.linha} <${t.nome}>`;
  for (const t of tagsDoHtml(html)) {
    const at = new Map(t.attrs.map(a => [a.nome, a.valor]));
    for (const a of t.attrs) {
      if (/^on/.test(a.nome)) problemas.push(`${onde(t)} atributo de evento em linha: ${a.nome}="${String(a.valor).slice(0, 80)}"`);
      if (["href", "src", "action", "formaction", "xlink:href", "data"].includes(a.nome) && /^\s*javascript:/i.test(decodificarAtributo(a.valor || "").replace(/[\u0000- ]/g, ""))) problemas.push(`${onde(t)} ${a.nome}="javascript:..."`);
      let m;
      if ((m = /^data-on-(.+)$/.exec(a.nome))) {
        if (!TIPOS.includes(m[1])) problemas.push(`${onde(t)} tipo de evento sem despachante: ${a.nome}`);
        if (!/^[A-Za-z_$][\w$]*$/.test(a.valor || "")) problemas.push(`${onde(t)} ${a.nome} sem nome de ação válido: "${a.valor}"`);
        else (acoes.get(a.valor) || acoes.set(a.valor, []).get(a.valor)).push(onde(t));
      }
      if ((m = /^data-args-(.+)$/.exec(a.nome))) {
        if (!at.has("data-on-" + m[1])) problemas.push(`${onde(t)} ${a.nome} sem data-on-${m[1]}`);
        let v;
        try { v = JSON.parse(decodificarAtributo(a.valor || "")); } catch (e) { problemas.push(`${onde(t)} ${a.nome} não é JSON: ${a.valor}`); continue; }
        if (!Array.isArray(v)) problemas.push(`${onde(t)} ${a.nome} não é lista JSON`);
        if (especiaisInvalidos(v)) problemas.push(`${onde(t)} ${a.nome} com argumento especial desconhecido`);
      }
      if ((a.nome === "data-prevent" || a.nome === "data-stop") && !String(a.valor || "").split(/\s+/).every(x => TIPOS.includes(x))) problemas.push(`${onde(t)} ${a.nome}="${a.valor}" com tipo de evento desconhecido`);
    }
    if (t.nome === "script") {
      if (!at.has("src")) problemas.push(`${onde(t)} <script> em linha (sem src)`);
      else {
        if (/^\s*(https?:)?\/\//i.test(at.get("src") || "")) problemas.push(`${onde(t)} <script src> de fora do próprio site: ${at.get("src")}`);
        if ((t.conteudo || "").trim()) problemas.push(`${onde(t)} <script src> com código dentro`);
      }
    }
  }
  return { problemas, acoes };
}

// ================= JS (árvore do código) =================
const ehChamada = (n) => n && (n.type === "CallExpression" || n.type === "OptionalCallExpression");
function nomeDaFuncao(fnPath) {
  if (fnPath.isFunctionDeclaration() && fnPath.node.id) return { nome: fnPath.node.id.name, escopo: fnPath.parentPath.scope };
  if (fnPath.parentPath && fnPath.parentPath.isVariableDeclarator() && fnPath.parentPath.node.id.type === "Identifier") return { nome: fnPath.parentPath.node.id.name, escopo: fnPath.parentPath.scope };
  return null;
}
// nomes que uma expressão pode ter, se vierem de lista fechada do código; null = não dá para garantir (dado, ou caminho que o teste não segue)
function nomesPossiveis(p, visitando = new Set()) {
  const n = p.node;
  if (!n) return null;
  if (n.type === "StringLiteral") return [n.value];
  if (n.type === "TemplateLiteral") return n.expressions.length ? null : [n.quasis[0].value.cooked];
  if (n.type === "ConditionalExpression") { const a = nomesPossiveis(p.get("consequent"), visitando), b = nomesPossiveis(p.get("alternate"), visitando); return a && b ? a.concat(b) : null; }
  if (n.type === "Identifier") {
    const b = p.scope.getBinding(n.name);
    if (!b || visitando.has(b.identifier)) return b ? [] : null;
    visitando.add(b.identifier);
    if (b.kind === "param") {
      if (b.path.node.type !== "Identifier" || b.path.listKey !== "params") return null;
      const fn = nomeDaFuncao(b.path.parentPath);
      if (!fn) return null;
      const fb = fn.escopo.getBinding(fn.nome);
      if (!fb || !fb.referencePaths.length || fb.constantViolations.length) return null;
      let out = [];
      for (const ref of fb.referencePaths) {
        if (!(ehChamada(ref.parent) && ref.parent.callee === ref.node)) return null; // a função escapa (registro, callback): o teste não vê os argumentos
        const arg = ref.parentPath.get("arguments")[b.path.key];
        if (!arg || arg.isSpreadElement()) return null;
        const r = nomesPossiveis(arg, visitando);
        if (!r) return null;
        out = out.concat(r);
      }
      return out;
    }
    if (b.path.isVariableDeclarator() && b.path.node.id.type === "Identifier" && b.path.node.init) {
      let out = nomesPossiveis(b.path.get("init"), visitando);
      for (const v of b.constantViolations) { if (!out) break; const r = v.isAssignmentExpression() ? nomesPossiveis(v.get("right"), visitando) : null; out = r ? out.concat(r) : null; }
      return out;
    }
  }
  return null;
}
const RE_EVENTO_EM_TEXTO = /(^|[\s"'\/;])on[a-z]+\s*=/i;
// -> { problemas, acoes: Map(nome -> [onde]), registradas: Map(nome -> linha) | null, argsAttr: n, declaradas: Map(nome de nível superior -> linha) }
function analisarScript(nomeArq, codigo, opcoes = {}) {
  const ast = parser.parse(codigo, { sourceType: "script", errorRecovery: true });
  const problemas = [], acoes = new Map();
  let registradas = null, chamadasRegistro = 0, argsAttr = 0;
  // nomes de nível superior (função, class, const/let/var): conferidos entre arquivos em conferirTela
  const declaradas = new Map();
  for (const no of ast.program.body) {
    if ((no.type === "FunctionDeclaration" || no.type === "ClassDeclaration") && no.id) declaradas.set(no.id.name, no.loc.start.line);
    else if (no.type === "VariableDeclaration") for (const d of no.declarations) if (d.id.type === "Identifier") declaradas.set(d.id.name, no.loc.start.line);
  }
  const usar = (nome, onde) => (acoes.get(nome) || acoes.set(nome, []).get(nome)).push(onde);
  const onde = (no) => `${nomeArq}:${no.loc.start.line}`;
  const conferirTexto = (txt, no) => {
    if (txt == null) return;
    if (RE_EVENTO_EM_TEXTO.test(txt) && !Object.prototype.hasOwnProperty.call(EXCECOES, txt)) problemas.push(`${onde(no)} atributo de evento em linha num texto/template: ${txt.replace(/\s+/g, " ").slice(0, 100)}`);
    if (/javascript:/i.test(txt)) problemas.push(`${onde(no)} "javascript:" num texto/template`);
    if (/<script/i.test(txt)) problemas.push(`${onde(no)} <script> montado num texto/template`);
  };
  // data-on-*/data-args-* dentro de um texto (template com ${} trocado por \u0001k\u0001)
  const conferirDataOn = (txt, exps, no) => {
    for (const m of txt.matchAll(/data-on-([a-z]+)\s*=\s*"([^"]*)"/g)) {
      if (!TIPOS.includes(m[1])) problemas.push(`${onde(no)} tipo de evento sem despachante: data-on-${m[1]}`);
      const v = m[2];
      if (/^[A-Za-z_$][\w$]*$/.test(v)) { usar(v, onde(no)); continue; }
      const k = /^\u0001(\d+)\u0001$/.exec(v);
      const nomes = k ? nomesPossiveis(exps[Number(k[1])]) : null;
      if (!nomes || !nomes.length) { problemas.push(`${onde(no)} nome de ação dinâmico que não vem de lista fechada do código: data-on-${m[1]}="${v.replace(/\u0001\d+\u0001/g, "${...}")}"`); continue; }
      for (const nm of nomes) { if (/^[A-Za-z_$][\w$]*$/.test(nm)) usar(nm, onde(no)); else problemas.push(`${onde(no)} nome de ação inválido: "${nm}"`); }
    }
    for (const m of txt.matchAll(/data-args-([a-z]+)\s*=\s*"([^"]*)"/g)) {
      const k = /^\u0001(\d+)\u0001$/.exec(m[2]);
      const e = k ? exps[Number(k[1])].node : null;
      if (!e || !ehChamada(e) || e.callee.type !== "Identifier" || e.callee.name !== "argsAttr") problemas.push(`${onde(no)} data-args-${m[1]} sem argsAttr(...): o valor entraria cru no atributo`);
      else argsAttr++;
    }
    for (const m of txt.matchAll(/data-(prevent|stop)\s*=\s*"([^"]*)"/g)) if (!m[2].split(/\s+/).every(x => TIPOS.includes(x))) problemas.push(`${onde(no)} data-${m[1]}="${m[2]}" com tipo de evento desconhecido`);
  };
  traverse(ast, {
    StringLiteral(p) { conferirTexto(p.node.value, p.node); conferirDataOn(p.node.value, [], p.node); },
    TemplateLiteral(p) {
      const q = p.node.quasis;
      for (const x of q) conferirTexto(x.value.cooked, x);
      conferirDataOn(q.map((x, i) => x.value.cooked + (i < q.length - 1 ? `\u0001${i}\u0001` : "")).join(""), p.get("expressions"), p.node);
    },
    CallExpression(p) {
      const c = p.node.callee;
      if (c.type === "Identifier" && (c.name === "eval" || c.name === "Function")) problemas.push(`${onde(p.node)} ${c.name}(...) (bloqueado pela CSP sem 'unsafe-eval')`);
      if (c.type === "Identifier" && (c.name === "setTimeout" || c.name === "setInterval") && p.node.arguments[0] && /StringLiteral|TemplateLiteral|BinaryExpression/.test(p.node.arguments[0].type)) problemas.push(`${onde(p.node)} ${c.name} com texto (vira eval)`);
      const prop = c.type === "MemberExpression" && !c.computed ? c.property.name : null;
      if (prop === "setAttribute" && p.node.arguments[0] && p.node.arguments[0].type === "StringLiteral" && /^on/i.test(p.node.arguments[0].value)) problemas.push(`${onde(p.node)} setAttribute("${p.node.arguments[0].value}") — evento em linha`);
      if (c.type === "Identifier" && c.name === "registrarAcoes" && p.parentPath.isExpressionStatement() && p.parentPath.parentPath.isProgram()) {
        chamadasRegistro++;
        const obj = p.node.arguments[0];
        registradas = registradas || new Map();
        if (!obj || obj.type !== "ObjectExpression") { problemas.push(`${onde(p.node)} registrarAcoes sem objeto literal`); return; }
        for (const pr of obj.properties) {
          if (pr.type !== "ObjectProperty" || pr.computed || pr.key.type !== "Identifier" || pr.value.type !== "Identifier" || pr.key.name !== pr.value.name) { problemas.push(`${onde(pr)} registrarAcoes: use só { nome } (referência direta à função de mesmo nome)`); continue; }
          if (registradas.has(pr.key.name)) problemas.push(`${onde(pr)} registrarAcoes: "${pr.key.name}" repetido`);
          registradas.set(pr.key.name, pr.loc.start.line);
          // a referência tem de ser função de nível superior, que não é trocada depois (o registro guarda a função do momento)
          const b = p.scope.getBinding(pr.value.name);
          const ehFuncaoTopo = b && b.scope.path.isProgram() && (b.path.isFunctionDeclaration() || (b.path.isVariableDeclarator() && /FunctionExpression|ArrowFunctionExpression/.test(b.path.node.init && b.path.node.init.type)));
          if (!ehFuncaoTopo) problemas.push(`${onde(pr)} registrarAcoes: "${pr.key.name}" não é função de nível superior do ${nomeArq}`);
          else if (b.constantViolations.length) problemas.push(`${onde(pr)} registrarAcoes: "${pr.key.name}" é reatribuída em algum lugar (o registro ficaria com a versão velha)`);
        }
      }
    },
    NewExpression(p) { if (p.node.callee.type === "Identifier" && p.node.callee.name === "Function") problemas.push(`${onde(p.node)} new Function(...) (bloqueado pela CSP sem 'unsafe-eval')`); },
    AssignmentExpression(p) {
      // window.nomeDeAcao = ... trocaria a função por fora do registro
      const l = p.node.left;
      if (l.type === "MemberExpression" && l.object.type === "Identifier" && l.object.name === "window" && !l.computed && opcoes.avisarWindow) opcoes.avisarWindow(l.property.name, onde(p.node));
    }
  });
  if (opcoes.exigirRegistro && chamadasRegistro !== 1) problemas.push(`${nomeArq}: registrarAcoes({...}) tem de aparecer exatamente 1 vez no nível superior (achei ${chamadasRegistro})`);
  return { problemas, acoes, registradas, argsAttr, declaradas };
}

// junta tudo o que a tela usa x o que o script.js registra (a análise do script.js, ~1 s, é guardada por conteúdo: as mutações só do HTML a reaproveitam)
const memoScript = new Map();
function analisarScriptDaTela(codigo) {
  if (!memoScript.has(codigo)) {
    const janelas = [];
    const r = analisarScript("script.js", codigo, { exigirRegistro: true, avisarWindow: (nome, onde) => janelas.push({ nome, onde }) });
    memoScript.set(codigo, Object.assign(r, { janelas }));
  }
  return memoScript.get(codigo);
}
// arquivos = { index, verificar, script, "eventos.js", "verificar.js", modulos: { "modulos/x.js": código, ... } }
function conferirTela(arquivos) {
  const html = analisarHtml("index.html", arquivos.index);
  const verif = analisarHtml("verificar.html", arquivos.verificar);
  const scr = analisarScriptDaTela(arquivos.script);
  const janelas = [...scr.janelas];
  // módulos (app/modulos/*.js, vD.2): scripts clássicos carregados depois do script.js, cada um com o SEU registrarAcoes({...}) — mesmas regras do script.js
  const modulos = Object.entries(arquivos.modulos || {}).map(([nome, codigo]) => Object.assign(analisarScript(nome, codigo, { exigirRegistro: true, avisarWindow: (n, onde) => janelas.push({ nome: n, onde }) }), { nome }));
  const outros = ["eventos.js", "verificar.js"].map(n => Object.assign(analisarScript(n, arquivos[n] || ""), { nome: n }));
  const usadas = new Map();
  for (const fonte of [html.acoes, scr.acoes, ...modulos.map(m => m.acoes)]) for (const [k, v] of fonte) usadas.set(k, (usadas.get(k) || []).concat(v));
  const problemas = [...html.problemas, ...verif.problemas, ...scr.problemas, ...modulos.flatMap(m => m.problemas), ...outros.flatMap(o => o.problemas)];
  // registros: a união do script.js com os módulos; o mesmo nome em dois registros = o segundo esconderia o primeiro
  const registradas = new Map(), ondeRegistrada = new Map();
  for (const arq of [Object.assign({ nome: "script.js" }, scr), ...modulos]) for (const [nome, linha] of arq.registradas || []) {
    if (registradas.has(nome)) problemas.push(`registrarAcoes: "${nome}" registrada em ${ondeRegistrada.get(nome)} e em ${arq.nome}:${linha} (a segunda esconderia a primeira)`);
    registradas.set(nome, linha);
    ondeRegistrada.set(nome, `${arq.nome}:${linha}`);
  }
  // scripts clássicos dividem um só escopo: nome de nível superior repetido em dois arquivos = função que esconde a outra em silêncio, ou const/let que faz o
  // navegador recusar o arquivo inteiro ("Identifier has already been declared") — e a tela "morre" sem aviso
  const donos = new Map();
  for (const arq of [outros[0], Object.assign({ nome: "script.js" }, scr), ...modulos]) for (const [nome, linha] of arq.declaradas) {
    if (donos.has(nome)) problemas.push(`nome de nível superior "${nome}" declarado em ${donos.get(nome)} e em ${arq.nome}:${linha} (scripts clássicos dividem o escopo: um esconde o outro, ou o navegador recusa o arquivo inteiro)`);
    else donos.set(nome, `${arq.nome}:${linha}`);
  }
  for (const [nome, onde] of usadas) if (!registradas.has(nome)) problemas.push(`ação usada e NÃO registrada no registrarAcoes: "${nome}" (${onde.slice(0, 3).join(", ")})`);
  for (const [nome] of registradas) if (!usadas.has(nome)) problemas.push(`registrarAcoes tem "${nome}" (${ondeRegistrada.get(nome)}) que nenhum data-on-* usa`);
  for (const j of janelas) if (registradas.has(j.nome)) problemas.push(`${j.onde} window.${j.nome} = ... troca uma ação registrada por fora do registro`);
  if (verif.acoes.size) problemas.push("verificar.html não carrega o despachante: não pode ter data-on-*");
  return { problemas, usadas, registradas, argsAttr: scr.argsAttr + modulos.reduce((s, m) => s + m.argsAttr, 0), modulos: modulos.map(m => ({ nome: m.nome, registradas: (m.registradas || new Map()).size })) };
}

module.exports = { tagsDoHtml, analisarHtml, analisarScript, conferirTela, nomesPossiveis };

if (typeof describe === "function") {
  // módulos do front (vD.2): tudo o que está em app/modulos/*.js, em ordem de nome — o index.html tem de carregar exatamente esses, nessa ordem
  const MODULOS = fs.readdirSync(path.join(APP, "modulos")).filter(n => n.endsWith(".js")).sort().map(n => "modulos/" + n);
  const ARQUIVOS = {
    index: ler("index.html"), verificar: ler("verificar.html"), script: ler("script.js"),
    "eventos.js": ler("eventos.js"), "verificar.js": ler("verificar.js"),
    modulos: Object.fromEntries(MODULOS.map(n => [n, ler(n)]))
  };

  describe("CSP forte: nenhum código escrito dentro do HTML do front", () => {
    let r;
    beforeAll(() => { r = conferirTela(ARQUIVOS); });

    test("index.html, verificar.html, script.js, eventos.js e verificar.js: zero evento em linha, javascript:, <script> em linha, eval; registro de ações fechado", () => {
      if (r.problemas.length) throw new Error(`${r.problemas.length} problema(s):\n  ${r.problemas.slice(0, 60).join("\n  ")}`);
      // a varredura passou de fato pelos arquivos (não é um "zero" por não ter lido nada)
      expect(r.usadas.size).toBeGreaterThan(400);
      expect(r.registradas.size).toBe(r.usadas.size);
      expect(r.argsAttr).toBeGreaterThan(350);
      expect((ARQUIVOS.index.match(/data-on-[a-z]+="/g) || []).length).toBeGreaterThan(450);
      // os módulos existem, foram lidos e cada um registra as suas ações
      expect(MODULOS).toEqual(expect.arrayContaining(["modulos/psc.js"]));
      for (const m of r.modulos) expect([m.nome, m.registradas > 0]).toEqual([m.nome, true]);
    });

    test("a lista de exceções está vazia (e, se um dia tiver item, o trecho ainda existe)", () => {
      expect(Object.keys(EXCECOES)).toEqual([]);
    });

    test("index.html carrega eventos.js ANTES do script.js, os módulos DEPOIS (todos os de app/modulos/), e todo <script> é do próprio site", () => {
      const scripts = tagsDoHtml(ARQUIVOS.index).filter(t => t.nome === "script").map(t => t.attrs.find(a => a.nome === "src").valor);
      expect(scripts).toEqual(["vendor/xlsx.full.min.js", "eventos.js", "script.js", ...MODULOS]);
      const scriptsVerif = tagsDoHtml(ARQUIVOS.verificar).filter(t => t.nome === "script").map(t => t.attrs.find(a => a.nome === "src").valor);
      expect(scriptsVerif).toEqual(["verificar.js"]);
    });

    test("verificar.html (página pública) sem <style> nem style= em linha: o estilo está em verificar.css", () => {
      const tags = tagsDoHtml(ARQUIVOS.verificar);
      expect(tags.filter(t => t.nome === "style")).toEqual([]);
      expect(tags.filter(t => t.attrs.some(a => a.nome === "style"))).toEqual([]);
      expect(tags.some(t => t.nome === "link" && t.attrs.some(a => a.nome === "href" && a.valor === "verificar.css"))).toBe(true);
    });

    test("service-worker: cache novo (v22), eventos.js e todos os módulos na casca offline", () => {
      const sw = ler("service-worker.js");
      expect(sw).toMatch(/const CACHE_NOME = "ieadespa-app-shell-v22";/);
      const casca = JSON.parse(/const ARQUIVOS_SHELL = (\[[^\]]*\]);/.exec(sw)[1]);
      expect(casca).toEqual(expect.arrayContaining(["/index.html", "/eventos.js", "/script.js", "/style.css", ...MODULOS.map(m => "/" + m)]));
    });

    // Com a CSP estrita o `connect-src 'self'` vale também para o service worker: o fetch() dele para as fontes do Google era recusado e a página perdia a fonte
    // (a recusa só aparece no console do service worker, não na página). Por isso ele só trata pedidos do PRÓPRIO endereço e deixa os de fora para o navegador.
    test("service-worker: ignora pedido de outra origem (antes do respondWith), para não cair no connect-src 'self'", () => {
      const sw = ler("service-worker.js");
      const ouvinte = sw.slice(sw.indexOf('addEventListener("fetch"'));
      const posOrigem = ouvinte.indexOf("url.origin !== self.location.origin");
      const posResposta = ouvinte.indexOf("respondWith(");
      expect(posOrigem).toBeGreaterThan(-1);
      expect(ouvinte.slice(posOrigem, posOrigem + 140)).toMatch(/\)\s*return;/);
      expect(posOrigem).toBeLessThan(posResposta);
      // mutação: sem a checagem, o teste acusa
      expect(sw.replace("url.origin !== self.location.origin", "false")).not.toMatch(/url\.origin !== self\.location\.origin/);
    });
  });

  describe("mutação: reintroduzir cada coisa proibida faz o teste acusar", () => {
    const comMudanca = (mudar) => conferirTela(Object.assign({}, ARQUIVOS, mudar(ARQUIVOS))).problemas;
    const acrescentarNoScript = (codigo) => (a) => ({ script: a.script + "\n" + codigo + "\n" });
    const mudarModulo = (f) => (a) => ({ modulos: Object.assign({}, a.modulos, { [MODULOS[0]]: f(a.modulos[MODULOS[0]]) }) });
    const CASOS = [
      ["onclick no index.html", (a) => ({ index: a.index.replace("<body>", "<body><button onclick=\"alert(1)\">x</button>") }), /atributo de evento em linha: onclick/],
      ["onclick em template do script.js", acrescentarNoScript("function __m(d) { return `<b onclick=\"f(${argsAttr(d.x)})\">x</b>`; }"), /atributo de evento em linha num texto/],
      ["onchange colado no começo do template", acrescentarNoScript("function __m(d) { return `<b ${d.ok ? `onchange=\"g()\"` : \"\"}>x</b>`; }"), /atributo de evento em linha num texto/],
      ["href=javascript: no index.html", (a) => ({ index: a.index.replace("<body>", "<body><a href=\"javascript:alert(1)\">x</a>") }), /javascript:/],
      ["<script> em linha no index.html", (a) => ({ index: a.index.replace("<body>", "<body><script>alert(1)</script>") }), /<script> em linha/],
      ["<script src> de fora", (a) => ({ index: a.index.replace("<body>", "<body><script src=\"https://cdn.exemplo.org/x.js\"></script>") }), /de fora do próprio site/],
      ["<script> em linha no verificar.html", (a) => ({ verificar: a.verificar.replace("</body>", "<script>alert(1)</script></body>") }), /<script> em linha/],
      ["eval no script.js", acrescentarNoScript("eval(\"1\");"), /eval\(/],
      ["new Function no eventos.js", (a) => ({ "eventos.js": a["eventos.js"] + "\nnew Function(\"return 1\");" }), /new Function/],
      ["setTimeout com texto", acrescentarNoScript("setTimeout(\"f()\", 10);"), /setTimeout com texto/],
      ["setAttribute(\"onclick\")", acrescentarNoScript("document.body.setAttribute(\"onclick\", \"f()\");"), /setAttribute\("onclick"\)/],
      ["ação usada e não registrada", (a) => ({ index: a.index.replace("<body>", "<body><button data-on-click=\"acaoQueNaoExiste\">x</button>") }), /NÃO registrada.*acaoQueNaoExiste/],
      ["ação registrada que ninguém usa", (a) => ({ script: a.script.replace(/registrarAcoes\(\{/, "function sobrando() {}\nregistrarAcoes({ sobrando,") }), /"sobrando".*que nenhum data-on-\* usa/],
      ["tirar um nome do registro", (a) => ({ script: a.script.replace(/(registrarAcoes\(\{[\s\S]*?)\babrirNotificacao,\s*/, "$1") }), /NÃO registrada.*"abrirNotificacao"/],
      ["nome de ação vindo de dado", acrescentarNoScript("function __m(d) { return `<b data-on-click=\"${d.acao}\">x</b>`; }"), /nome de ação dinâmico/],
      ["data-args sem argsAttr", acrescentarNoScript("function __m(d) { return `<b data-on-click=\"abrirNotificacao\" data-args-click=\"${JSON.stringify([d.x])}\">x</b>`; }"), /sem argsAttr/],
      ["registro com referência que não é a função de mesmo nome", (a) => ({ script: a.script.replace(/registrarAcoes\(\{/, "registrarAcoes({ abrirNotificacao: alert,") }), /use só \{ nome \}|repetido/],
      ["ação registrada reatribuída", acrescentarNoScript("abrirNotificacao = () => {};"), /reatribuída/],
      ["data-args que não é JSON no index.html", (a) => ({ index: a.index.replace("<body>", "<body><button data-on-click=\"abrirNotificacao\" data-args-click='[1,'>x</button>") }), /não é JSON/],
      ["tipo de evento sem despachante", (a) => ({ index: a.index.replace("<body>", "<body><input data-on-blur=\"abrirNotificacao\">") }), /sem despachante/],
      // módulos (vD.2)
      ["módulo com função de mesmo nome que uma do script.js", mudarModulo((m) => m + "\nfunction abrirNotificacao() {}\n"), /nome de nível superior "abrirNotificacao" declarado em script\.js:\d+ e em modulos\//],
      ["módulo com const de mesmo nome que uma do eventos.js", mudarModulo((m) => m + "\nconst ACOES_DA_TELA = {};\n"), /"ACOES_DA_TELA" declarado em eventos\.js:\d+ e em modulos\//],
      ["módulo sem o seu registrarAcoes", mudarModulo((m) => m.replace(/registrarAcoes\(\{[\s\S]*?\}\);/, "")), /modulos\/.*registrarAcoes\(\{\.\.\.\}\) tem de aparecer exatamente 1 vez/],
      ["ação registrada no script.js E num módulo", mudarModulo((m) => m.replace(/registrarAcoes\(\{/, "registrarAcoes({ abrirNotificacao,")), /"abrirNotificacao" registrada em script\.js:\d+ e em modulos\//],
      ["onclick em template de módulo", mudarModulo((m) => m + "\nfunction __m(d) { return `<b onclick=\"f(${argsAttr(d.x)})\">x</b>`; }\n"), /modulos\/.* atributo de evento em linha num texto/],
      ["ação de módulo registrada que ninguém usa", mudarModulo((m) => m.replace(/registrarAcoes\(\{/, "function sobrandoNoModulo() {}\nregistrarAcoes({ sobrandoNoModulo,")), /"sobrandoNoModulo" \(modulos\/[^)]+\) que nenhum data-on-\* usa/]
    ];
    test.each(CASOS)("%s", (_nome, mudar, esperado) => {
      const problemas = comMudanca(mudar);
      expect(problemas.join("\n")).toMatch(esperado);
    });
    test("o nome dinâmico de lista fechada passa (parâmetro que só recebe texto fixo; condicional de textos fixos)", () => {
      const r = analisarScript("x.js", "function b(acao) { return `<b data-on-click=\"${acao}\">x</b>`; }\nconst h = b(\"um\") + b(\"dois\");\nconst c = (ok) => `<i data-on-click=\"${ok ? \"tres\" : \"quatro\"}\">y</i>`;");
      expect(r.problemas).toEqual([]);
      expect([...r.acoes.keys()].sort()).toEqual(["dois", "quatro", "tres", "um"]);
    });
  });
}
