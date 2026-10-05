// Gera o "modelo de respostas" da API simulada a partir do script.js ORIGINAL:
//  - todos os nomes de campo que o front lê (x.campo);
//  - quais são lidos como LISTA (x.campo.map / .forEach / for...of / (x.campo || []).length / apelido const v = x.campo; v.map / passado como argumento
//    a uma função que usa o parâmetro como lista), como OBJETO (x.campo.sub) e como NÚMERO (x.campo.toFixed, x.campo * 2, x.campo > 0);
//  - textos fixos comparados com cada campo (x.status === "ATIVA"), no geral e POR ROTA: para cada função que chama uma rota da API, os textos
//    comparados nela e nas funções que ela chama — assim a resposta de cada rota traz, nas linhas da lista, os estados que aquela tela testa;
//  - todas as chaves de permissão citadas no front.
// O MESMO modelo é usado nas duas versões (original e nova) — as respostas são idênticas.
const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

function gerarModelo(arquivoScript) {
  const js = fs.readFileSync(arquivoScript, "utf8");
  const ast = parser.parse(js, { sourceType: "script", errorRecovery: true });
  const props = new Set(), listas = new Set(), fracos = new Set(), objetos = new Set(), numeros = new Set(), literais = {};
  const METODOS_LISTA = new Set(["map", "forEach", "filter", "length", "reduce", "some", "find", "join", "slice", "every", "sort", "flatMap", "findIndex", "concat"]);
  const METODOS_FRACOS = new Set(["length", "slice", "concat"]);
  const METODOS_NATIVOS = new Set([...Object.getOwnPropertyNames(String.prototype), ...Object.getOwnPropertyNames(Array.prototype), ...Object.getOwnPropertyNames(Number.prototype), ...Object.getOwnPropertyNames(Object.prototype), "length"]);
  const ARIT = new Set(["*", "/", "-", "%", ">", "<", ">=", "<="]);
  const PARECE_TEXTO = /^(data|hora|nome|texto|titulo|descricao|codigo|mensagem|observ|motivo|cpf|telefone|email|endereco|senha|token|url|link|cep|rg)|(Em|Nome|Texto|Data|Inicio|Fim|Codigo|Descricao|Titulo|Hora|Url|At)$/;
  const addLiteral = (alvo, p, v) => { if (typeof v !== "string" || v.length > 40) return; (alvo[p] = alvo[p] || []); if (!alvo[p].includes(v)) alvo[p].push(v); };
  const nomeProp = (n) => (n && n.type === "MemberExpression" && !n.computed && n.property.type === "Identifier") ? n.property.name : null;
  // campos de onde vem um valor: obj.campo, (obj && obj.campo) || [], obj.campo ?? x
  function camposDe(n) {
    if (!n) return [];
    const p = nomeProp(n);
    if (p) return [p];
    if (n.type === "LogicalExpression") return [...camposDe(n.left), ...camposDe(n.right)];
    if (n.type === "AwaitExpression") return camposDe(n.argument);
    return [];
  }
  // como uma variável/parâmetro é usado: lista, objeto, número
  function usoDe(binding) {
    const u = { lista: false, objeto: false, numero: false };
    if (!binding) return u;
    for (const r of binding.referencePaths) {
      const pai = r.parentPath;
      if (pai.isMemberExpression() && pai.node.object === r.node && !pai.node.computed) {
        const sub = pai.node.property.name;
        if (METODOS_LISTA.has(sub) && !METODOS_FRACOS.has(sub)) u.lista = true;
        else if (sub === "toFixed") u.numero = true;
        else if (!METODOS_NATIVOS.has(sub)) u.objeto = true;
      }
      if (pai.isForOfStatement() && pai.node.right === r.node) u.lista = true;
      if (pai.isBinaryExpression() && ARIT.has(pai.node.operator) && [pai.node.left, pai.node.right].some(x => x.type === "NumericLiteral")) u.numero = true;
    }
    return u;
  }
  const aplicarUso = (nomes, u) => { for (const n of nomes) { if (PARECE_TEXTO.test(n)) continue; if (u.lista) listas.add(n); else if (u.objeto) objetos.add(n); else if (u.numero) numeros.add(n); } };

  // 1ª passada: uso dos parâmetros de cada função declarada (para "f(obj.campo)")
  const usoParametros = {};
  traverse(ast, {
    FunctionDeclaration(p) {
      if (!p.node.id) return;
      usoParametros[p.node.id.name] = p.node.params.map(par => par.type === "Identifier" ? usoDe(p.scope.getBinding(par.name)) : { lista: false, objeto: false, numero: false });
    }
  });
  // por função: rotas chamadas, textos comparados, funções chamadas
  const funcoes = {};
  let atual = null;
  traverse(ast, {
    FunctionDeclaration: {
      enter(p) { if (p.parentPath.isProgram() && p.node.id) { atual = funcoes[p.node.id.name] = { rotas: new Set(), literais: {}, chama: new Set() }; } },
      exit(p) { if (p.parentPath.isProgram()) atual = null; }
    },
    TemplateLiteral(p) {
      if (!atual) return;
      const q = p.node.quasis, ex = p.node.expressions;
      if (!(ex[0] && ex[0].type === "Identifier" && ex[0].name === "API_BASE" && q[0].value.cooked === "")) return;
      let rota = "";
      for (let i = 1; i < q.length; i++) { rota += q[i].value.cooked; if (i < ex.length) rota += "*"; }
      rota = rota.split("?")[0].replace(/\*+/g, "*");
      if (rota.startsWith("/")) atual.rotas.add(rota);
    },
    CallExpression(p) {
      const c = p.node.callee;
      // ["PENDENTE", "APROVADA"].includes(x.status)
      if (c.type === "MemberExpression" && !c.computed && c.property.name === "includes" && c.object.type === "ArrayExpression") {
        const campo = nomeProp(p.node.arguments[0]);
        if (campo) for (const el of c.object.elements) if (el && el.type === "StringLiteral") { addLiteral(literais, campo, el.value); if (atual) addLiteral(atual.literais, campo, el.value); }
      }
      if (atual && c.type === "Identifier") atual.chama.add(c.name);
      if (c.type === "Identifier" && usoParametros[c.name]) p.node.arguments.forEach((a, i) => { const u = usoParametros[c.name][i]; if (u) aplicarUso(camposDe(a), u); });
    },
    MemberExpression(p) {
      const nome = nomeProp(p.node);
      if (!nome) return;
      props.add(nome);
      const pai = p.parentPath;
      if (pai.isMemberExpression() && pai.node.object === p.node && !pai.node.computed) {
        const sub = pai.node.property.name;
        if (!METODOS_NATIVOS.has(sub)) objetos.add(nome);
        if (sub === "toFixed") numeros.add(nome);
        if (METODOS_LISTA.has(sub)) { if (METODOS_FRACOS.has(sub)) fracos.add(nome); else listas.add(nome); }
      }
      // (obj.campo || []).map(...), (obj && obj.campo) || []
      let q = p;
      while (q.parentPath.isLogicalExpression()) {
        q = q.parentPath;
        if (q.node.right.type === "ArrayExpression") { listas.add(nome); break; }
      }
      if (pai.isSpreadElement() && pai.parentPath.isArrayExpression()) listas.add(nome);
      if (pai.isForOfStatement() && pai.node.right === p.node) listas.add(nome);
      if (pai.isCallExpression() && pai.node.arguments[0] === p.node && pai.node.callee.type === "MemberExpression" && pai.node.callee.object.name === "Array" && pai.node.callee.property.name === "isArray") listas.add(nome);
      if (pai.isBinaryExpression() && ARIT.has(pai.node.operator) && [pai.node.left, pai.node.right].some(x => x.type === "NumericLiteral")) numeros.add(nome);
    },
    // const v = obj.campo  /  const v = (obj && obj.campo) || []
    VariableDeclarator(p) {
      if (p.node.id.type !== "Identifier") return;
      const nomes = camposDe(p.node.init);
      if (!nomes.length) return;
      aplicarUso(nomes, usoDe(p.scope.getBinding(p.node.id.name)));
    },
    BinaryExpression(p) {
      if (!["===", "==", "!==", "!="].includes(p.node.operator)) return;
      const a = nomeProp(p.node.left), b = nomeProp(p.node.right);
      for (const [campo, lit] of [[a, p.node.right], [b, p.node.left]]) {
        if (!campo || lit.type !== "StringLiteral") continue;
        addLiteral(literais, campo, lit.value);
        if (atual) addLiteral(atual.literais, campo, lit.value);
      }
    },
    SwitchStatement(p) {
      const a = nomeProp(p.node.discriminant);
      if (!a) return;
      for (const c of p.node.cases) if (c.test && c.test.type === "StringLiteral") { addLiteral(literais, a, c.test.value); if (atual) addLiteral(atual.literais, a, c.test.value); }
    }
  });
  for (const n of fracos) if (!PARECE_TEXTO.test(n)) listas.add(n);
  for (const n of listas) { objetos.delete(n); numeros.delete(n); }
  // rotas → textos comparados na função que chama a rota + nas funções que ela chama (1 nível)
  const porRota = {};
  for (const [nome, f] of Object.entries(funcoes)) {
    if (!f.rotas.size) continue;
    const lit = {};
    const juntar = (orig) => { for (const [k, vs] of Object.entries(orig)) for (const v of vs) addLiteral(lit, k, v); };
    juntar(f.literais);
    for (const g of f.chama) if (funcoes[g] && !funcoes[g].rotas.size) juntar(funcoes[g].literais);
    for (const r of f.rotas) { porRota[r] = porRota[r] || {}; for (const [k, vs] of Object.entries(lit)) for (const v of vs) addLiteral(porRota[r], k, v); }
  }
  // chaves de permissão citadas no front
  const permissoes = new Set();
  for (const m of js.matchAll(/authPermissoes\.(?:includes|indexOf)\(\s*"([a-z_]+)"/g)) permissoes.add(m[1]);
  traverse(ast, {
    VariableDeclarator(p) {
      if (!p.node.id || !["ABA_PERMISSOES_ALT", "NOMES_ABAS"].includes(p.node.id.name)) return;
      p.traverse({ StringLiteral(q) { if (/^[a-z_]+$/.test(q.node.value)) permissoes.add(q.node.value); } });
    }
  });
  return {
    props: [...props].sort(), listas: [...listas].sort(), objetos: [...objetos].filter(n => !PARECE_TEXTO.test(n)).sort(), numeros: [...numeros].sort(),
    literais, rotas: Object.entries(porRota).filter(([, l]) => Object.keys(l).length).map(([r, l]) => ({ rota: r, literais: l })),
    permissoes: [...permissoes].sort()
  };
}

module.exports = { gerarModelo };

if (require.main === module) {
  const arq = process.argv[2];
  const saida = process.argv[3] || path.join(__dirname, "modelo-respostas.json");
  const m = gerarModelo(arq);
  fs.writeFileSync(saida, JSON.stringify(m));
  console.log(`props=${m.props.length} listas=${m.listas.length} objetos=${m.objetos.length} numeros=${m.numeros.length} comLiterais=${Object.keys(m.literais).length} rotasComLiterais=${m.rotas.length} permissoes=${m.permissoes.length}`);
}
