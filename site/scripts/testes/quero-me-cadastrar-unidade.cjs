// Testes de UNIDADE da página "Quero me cadastrar" (21/11/2026, as pendências da revisão de 20/11), sem navegador e sem rede: extrai da página as funções
// `mostrarTermo` (o texto do consentimento, que agora vem do sistema junto com a versão) e `idDoEnvio` (o identificador de um envio) e roda com um DOM de mentira.
// Garante: o texto aparece EXATAMENTE como o sistema mandou (só texto, nunca HTML), com "política de privacidade" virando o link da página de privacidade;
// o mesmo envio (os mesmos dados) leva o mesmo identificador e dados novos levam outro; a página não tem mais o texto escrito nela.
// Como rodar (de dentro de site/):  node scripts/testes/quero-me-cadastrar-unidade.cjs
const fs = require("fs");
const path = require("path");

let falhas = 0;
const eq = (a, b, d) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { falhas++; console.log("  FALHA", d, "→", JSON.stringify(a), "esperado", JSON.stringify(b)); } else console.log("  ok   ", d);
};

const pagina = fs.readFileSync(path.join(__dirname, "../../src/pages/quero-me-cadastrar.astro"), "utf8").replace(/\r\n/g, "\n");
function trecho(inicio, fimMarca) {
  const i = pagina.indexOf(inicio);
  if (i < 0) throw new Error(`não achei "${inicio}" na página`);
  const f = pagina.indexOf(fimMarca, i);
  if (f < 0) throw new Error(`não achei o fim de "${inicio}"`);
  return pagina.slice(i, f + fimMarca.length);
}
// as funções terminam na primeira linha "      }" (6 espaços) depois do início
const codigoTermo = trecho("function mostrarTermo(alvo, texto) {", "\n      }");
const codigoNovoId = trecho("const novoId = (bytes = 12) =>", ";\n");
const codigoEnvio = trecho("let envio = { assinatura: \"\", id: \"\" };", "\n      }");

// um DOM de mentira: só o que mostrarTermo usa
const documento = { createElement: (tag) => ({ tag, href: "", target: "", textContent: "" }) };
const alvoNovo = () => ({ filhos: null, replaceChildren(...n) { this.filhos = n; } });
const textoDe = (alvo) => alvo.filhos.map((n) => (typeof n === "string" ? n : n.textContent)).join("");
// eslint-disable-next-line no-new-func
const mostrarTermo = new Function("document", `${codigoTermo}; return mostrarTermo;`)(documento);
// eslint-disable-next-line no-new-func
const novaPagina = () => new Function("crypto", `${codigoNovoId}\n${codigoEnvio}; return idDoEnvio;`)(globalThis.crypto);

console.log("== (d) o texto do consentimento, como o sistema mandou ==");
{
  const TEXTO = "Autorizo a Igreja a guardar estes dados para o cadastro de membros. Veja a política de privacidade.";
  const alvo = alvoNovo();
  mostrarTermo(alvo, TEXTO);
  eq(textoDe(alvo), TEXTO, "o texto aparece exatamente como veio (o mesmo de antes, letra por letra)");
  const link = alvo.filhos.find((n) => typeof n !== "string");
  eq(link && [link.tag, link.href, link.target, link.textContent], ["a", "/privacidade/", "_blank", "política de privacidade"], "\"política de privacidade\" vira o link da página de privacidade, como antes");
  eq(alvo.filhos.filter((n) => typeof n !== "string").length, 1, "um link só");
}
{
  const alvo = alvoNovo();
  mostrarTermo(alvo, "Texto novo sem o trecho do link.");
  eq(alvo.filhos, ["Texto novo sem o trecho do link."], "texto sem o trecho: só o texto, sem link");
}
{
  const malicioso = "<img src=x onerror=alert(1)> Veja a política de privacidade <script>x</script>";
  const alvo = alvoNovo();
  mostrarTermo(alvo, malicioso);
  eq(textoDe(alvo), malicioso, "marcação no texto continua TEXTO (nada vira HTML)");
  eq(alvo.filhos.filter((n) => typeof n !== "string").map((n) => n.tag), ["a"], "o único elemento criado é o link da privacidade");
}

console.log("== (c) o identificador do envio ==");
{
  const idDoEnvio = novaPagina();
  const dados = { nome: "Lucas", cpf: "12345678909", consentimento: { aceito: true, versao: "2026-11" } };
  const a = idDoEnvio(dados);
  eq(/^[0-9a-f]{32}$/.test(a), true, "32 letras hexadecimais (o formato que o site e o sistema aceitam)");
  eq(idDoEnvio({ ...dados }), a, "os mesmos dados (enviar de novo depois de 'pode ser que tenha chegado'): o MESMO identificador");
  const b = idDoEnvio({ ...dados, nome: "Lucas Ferreira" });
  eq(b !== a && /^[0-9a-f]{32}$/.test(b), true, "mudou um dado: outro envio, outro identificador");
  eq(idDoEnvio({ ...dados, nome: "Lucas Ferreira" }), b, "…e ele se repete enquanto os dados não mudam de novo");
  eq(novaPagina()(dados) !== a, true, "outra página (outra pessoa, ou a página recarregada): outro identificador, ao acaso");
}

console.log("== a página ==");
eq(pagina.includes("Autorizo a Igreja a guardar"), false, "a página não tem mais o texto do consentimento escrito nela");
eq(/<input type="checkbox" name="aceito" required disabled \/>/.test(pagina), true, "a caixa de concordar começa desligada (só se marca depois que o texto chega)");
eq(pagina.includes("form.aceito.disabled = false;"), true, "…e liga quando o texto e a versão chegam");
eq(pagina.includes("corpo.envio = idDoEnvio(corpo);"), true, "o envio vai com o identificador");

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntudo ok");
process.exitCode = falhas ? 1 : 0;
