// CSP forte — fidelidade do TIPO dos argumentos dos botões. Antes, o código do atributo era escrito como texto: onclick="fechar(${congregacaoId}, ...)" virava um LITERAL no código,
// então "12" lido de um campo da tela chegava à função como o NÚMERO 12. Agora os argumentos viajam em JSON (data-args-click) e um texto continua texto: o POST sairia com
// {"congregacaoId":"12"} em vez de {"congregacaoId":12}, e os handlers do servidor (que conferem `typeof === "number"` de propósito) recusariam. Foi o único defeito que a
// comparação antiga × nova em navegador de verdade achou (Remover professor da EBD), e a busca por escrito achou mais dois (fechar mês, repasse da tesouraria).
// Este teste procura, em app/script.js, argsAttr(...) que recebe uma VARIÁVEL SIMPLES atribuída a algo lido da tela (.value, dataset, textContent, getAttribute...) sem passar por
// Number(...) — o que reintroduziria o mesmo defeito. Parâmetro de função e membro de objeto da API (p.membroId) não entram: vêm do JSON da API, já com o tipo certo.
const fs = require("fs");
const path = require("path");

const SCRIPT = path.join(__dirname, "..", "..", "..", "app", "script.js");
const TEXTO_DA_TELA = /(\.value\b|\.dataset\b|\.textContent\b|\.innerText\b|getAttribute\(|\.split\(|\.replace\(|\.trim\(|\.padStart\(|searchParams|\.get\()/;
const JA_NUMERICO = /^\s*(Number|parseInt|parseFloat)\(|\.indexOf\(|\.findIndex\(|\.length\b|^\s*\+\+|^\s*Math\./;

function argumentos(txt, ini) {
  let prof = 1, atual = "", lista = [], aspa = null;
  for (let i = ini; i < txt.length && prof > 0; i++) {
    const c = txt[i];
    if (aspa) { atual += c; if (c === "\\") { atual += txt[++i]; continue; } if (c === aspa) aspa = null; continue; }
    if (c === '"' || c === "'" || c === "`") { aspa = c; atual += c; continue; }
    if (c === "(" || c === "[" || c === "{") prof++;
    if (c === ")" || c === "]" || c === "}") { prof--; if (prof === 0) break; }
    if (c === "," && prof === 1) { lista.push(atual.trim()); atual = ""; continue; }
    atual += c;
  }
  if (atual.trim()) lista.push(atual.trim());
  return lista;
}

// -> lista de { linha, variavel, atribuicao }
function suspeitos(codigo) {
  const linhas = codigo.split("\n");
  const linhaDe = (pos) => codigo.slice(0, pos).split("\n").length;
  const achados = [];
  for (const m of codigo.matchAll(/argsAttr\(/g)) {
    const linha = linhaDe(m.index);
    for (const a of argumentos(codigo, m.index + m[0].length)) {
      if (!/^[A-Za-z_$][\w$]*$/.test(a) || /^(true|false|null|undefined)$/.test(a)) continue;
      const trecho = linhas.slice(Math.max(0, linha - 141), linha).join("\n");
      const atrib = [...trecho.matchAll(new RegExp("(?:const|let|var)\\s+" + a + "\\s*=\\s*([^;\\n]+)", "g"))].pop();
      if (atrib && TEXTO_DA_TELA.test(atrib[1]) && !JA_NUMERICO.test(atrib[1])) achados.push({ linha, variavel: a, atribuicao: atrib[1].trim().slice(0, 90) });
    }
  }
  return achados;
}

describe("argumentos dos botões: o tipo de um valor lido da tela não muda na conversão para JSON", () => {
  test("app/script.js: nenhuma variável lida de um campo da tela vai crua para argsAttr (passa por Number() ou String())", () => {
    const achados = suspeitos(fs.readFileSync(SCRIPT, "utf8"));
    expect(achados.map((x) => `L${x.linha}: ${x.variavel} = ${x.atribuicao}`)).toEqual([]);
  });
  test("o detector pega o defeito de verdade (mutação): o texto do campo indo cru, e solta quando vira Number()", () => {
    const ruim = 'function f() {\n  const congregacaoId = document.getElementById("x").value;\n  return `<button data-args-click="${argsAttr(congregacaoId, mes)}">ok</button>`;\n}';
    expect(suspeitos(ruim)).toHaveLength(1);
    expect(suspeitos(ruim.replace("argsAttr(congregacaoId,", "argsAttr(Number(congregacaoId),"))).toHaveLength(0);
    // atribuição já numérica, índice e variável vinda de parâmetro/JSON da API não são suspeitas
    expect(suspeitos('function f(id) { const t = Number(document.getElementById("x").value); return `${argsAttr(t, id)}`; }')).toHaveLength(0);
    expect(suspeitos("function f(l) { const i = l.indexOf(String(x)); return `${argsAttr(i)}`; }")).toHaveLength(0);
    expect(suspeitos("function f(p) { return `${argsAttr(p.membroId)}`; }")).toHaveLength(0);
  });
  test("a correção dos três pontos achados está no código (mutação no arquivo real: desfazer um e o teste acusa)", () => {
    const real = fs.readFileSync(SCRIPT, "utf8");
    expect(real).toMatch(/argsAttr\(Number\(turmaId\), p\.membroId\)/);
    expect((real.match(/argsAttr\(Number\(congregacaoId\), String\(mesReferencia/g) || []).length).toBe(2);
    const estragado = real.replace("argsAttr(Number(turmaId), p.membroId)", "argsAttr(turmaId, p.membroId)");
    expect(estragado).not.toBe(real);
    // turmaId nessa função vem de .value: o detector tem que acusar quando o Number() sai
    const antes = suspeitos(real).length;
    expect(antes).toBe(0);
  });
});
