// FASE 10 (19/11/2026) — as telas novas em Svelte (código em front/) vão ao ar pela SAÍDA DO BUILD versionada em app/svelte (o deploy do Azure não roda
// o build: um build quebrado não derruba o deploy da main nem o da homologação). Este teste roda no deploy ANTES da migração e para tudo se:
//   - o código de front/ mudou e ninguém refez o build (a tela no ar seria a velha);
//   - um arquivo de app/svelte foi mexido à mão, sumiu ou não veio do build;
//   - a saída tem algo que a CSP forte recusaria (script em linha, eval, new Function) ou que fala com outro endereço.
const fs = require("fs");
const path = require("path");
const { conferir, SAIDA } = require("../../../front/scripts/carimbo-lib.cjs");

describe("telas Svelte: a saída versionada corresponde ao código-fonte", () => {
  test("app/svelte bate com o carimbo do último build", () => {
    expect(conferir()).toEqual([]);
  });

  // 22/11/2026: o estilo de todas as telas Svelte num arquivo só (telas.css), pedido pela casca na primeira entrada num módulo
  test("os módulos de Membros e do Financeiro e o CSS único das telas existem", () => {
    expect(fs.existsSync(path.join(SAIDA, "membros.js"))).toBe(true);
    expect(fs.existsSync(path.join(SAIDA, "financeiro.js"))).toBe(true);
    expect(fs.existsSync(path.join(SAIDA, "telas.css"))).toBe(true);
    const casca = fs.readFileSync(path.join(__dirname, "..", "..", "..", "app", "modulos", "casca.js"), "utf8");
    expect(casca).toContain("/svelte/telas.css");
  });

  test("nada na saída que a CSP forte recusaria ou que fale com outro endereço", () => {
    for (const nome of fs.readdirSync(SAIDA).filter((n) => n.endsWith(".js"))) {
      const js = fs.readFileSync(path.join(SAIDA, nome), "utf8");
      expect(js).not.toMatch(/\beval\s*\(/);
      expect(js).not.toMatch(/new Function\s*\(/);
      // só os endereços que o próprio Svelte escreve como TEXTO (os links das mensagens de aviso e o nome do espaço do SVG/MathML): nada que a tela peça
      const enderecos = js.match(/https?:\/\/[a-z0-9.-]+/gi) || [];
      expect(enderecos.filter((e) => !/^https:\/\/svelte\.dev$|^http:\/\/www\.w3\.org$/.test(e))).toEqual([]);
    }
  });

  test("a casca baixa o módulo só sob demanda (o index.html não carrega app/svelte)", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "..", "..", "app", "index.html"), "utf8");
    expect(html).not.toMatch(/<script[^>]+svelte\//);
    const casca = fs.readFileSync(path.join(__dirname, "..", "..", "..", "app", "modulos", "casca.js"), "utf8");
    expect(casca).toContain("import(`/svelte/${nome}.js`)");
  });
});
