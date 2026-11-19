// O gráfico grande do painel de Membros (front/src/membros/grafico.ts, telas Svelte) — defeito visto na homologação em 19/11/2026: o pastor de área com
// 60 pessoas no rol, todas sem departamento, via "0 e 0" e "Ninguém no rol para mostrar aqui" (a tela tirava a linha "Sem departamento" e cortava as
// linhas sem somar o resto). Aqui: todo grupo entra, "Sem ..." fica por último e sempre visível, o excesso vira "Outros (n)" e a legenda soma o rol.
// O arquivo .ts é carregado direto: o Node tira os tipos (module.stripTypeScriptTypes, Node 22.13 ou mais novo) e o código roda num contexto isolado.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { stripTypeScriptTypes } = require("node:module");

const ARQ = path.join(__dirname, "..", "..", "..", "front", "src", "membros", "grafico.ts");

function carregar() {
  if (typeof stripTypeScriptTypes !== "function") throw new Error("este Node não tira tipos do TypeScript (precisa do 22.13 ou mais novo)");
  const js = stripTypeScriptTypes(fs.readFileSync(ARQ, "utf8"), { mode: "strip" })
    .replace(/^export (function|const) /gm, "$1 ");
  expect(js).not.toMatch(/^\s*(import|export)\b/m);
  return vm.runInNewContext(`${js}\n;({ montarGrafico })`, {});
}
const { montarGrafico } = carregar();

const grupo = (nome, total, es = 0, extra = {}) => ({ nome, total, es, aguas: 0, cpf: 0, comunhao: 0, completo: 0, ...extra });
const soma = (lista, campo) => lista.reduce((a, x) => a + x[campo], 0);

describe("gráfico grande do painel de Membros", () => {
  test("a área com todo mundo sem departamento: a linha 'Sem departamento' com as 60 pessoas, nada de 'ninguém no rol'", () => {
    const g = montarGrafico([grupo("Sem departamento", 60)], "es", 6);
    expect(g.linhas).toHaveLength(1);
    expect(g.linhas[0]).toMatchObject({ nome: "Sem departamento", total: 60, sim: 0, nao: 60, largura: 100, sem: true });
    expect(g.total).toBe(60);
    expect(g.sim + g.nao).toBe(60);
  });

  test("a Geral (dados da homologação): os 4 departamentos e 'Sem departamento' por último; a legenda soma o rol do alto", () => {
    const grupos = [grupo("União de Senhoras", 1635, 464), grupo("União de Homens", 1487, 579), grupo("União de Mocidade", 1251, 294),
      grupo("União de Crianças", 557, 0), grupo("Sem departamento", 62, 0)];
    const g = montarGrafico(grupos, "es", 6);
    expect(g.linhas.map((l) => l.nome)).toEqual(["União de Senhoras", "União de Homens", "União de Mocidade", "União de Crianças", "Sem departamento"]);
    expect(g.total).toBe(4992);
    expect(g.sim).toBe(1337);
    expect(g.nao).toBe(4992 - 1337);
    expect(g.linhas.at(-1).sem).toBe(true);
    expect(g.linhas.filter((l) => l.sem)).toHaveLength(1);
  });

  test("'Sem departamento' que o servidor manda no meio da lista vai para o fim; grupo vazio sai", () => {
    const g = montarGrafico([grupo("Sem departamento", 300), grupo("Jovens", 20, 5), grupo("Crianças", 0)], "es", 6);
    expect(g.linhas.map((l) => l.nome)).toEqual(["Jovens", "Sem departamento"]);
    expect(g.linhas[1].largura).toBe(100);
    expect(g.linhas[0].largura).toBe(7);
  });

  test("mais grupos que linhas: o excesso vira 'Outros (n)' antes do 'Sem ...', e ninguém some da soma", () => {
    const congs = Array.from({ length: 11 }, (_, i) => grupo(`Congregação ${i + 1}`, 100 - i, i));
    const g = montarGrafico([...congs, grupo("Sem congregação", 4, 1)], "es", 6);
    expect(g.linhas).toHaveLength(6);
    expect(g.linhas.map((l) => l.nome)).toEqual(["Congregação 1", "Congregação 2", "Congregação 3", "Congregação 4", "Outros (7)", "Sem congregação"]);
    expect(g.total).toBe(soma(congs, "total") + 4);
    expect(g.sim).toBe(soma(congs, "es") + 1);
    const outros = g.linhas[4];
    expect(outros.total).toBe(soma(congs.slice(4), "total"));
    expect(outros.sem).toBe(false);
  });

  test("um 'Outros (k)' que já veio do servidor conta k grupos ao juntar de novo", () => {
    const grupos = [...Array.from({ length: 6 }, (_, i) => grupo(`C${i}`, 50 - i)), grupo("Outros (40)", 30)];
    const g = montarGrafico(grupos, "es", 6);
    expect(g.linhas.map((l) => l.nome)).toEqual(["C0", "C1", "C2", "C3", "C4", "Outros (41)"]);
    expect(g.total).toBe(soma(grupos, "total"));
  });

  test("cada recorte soma igual ao total dele, e 'Sem sexo informado'/'Sem data de nascimento' também ficam por último", () => {
    const grupos = [grupo("Sem sexo informado", 3, 0, { cpf: 1 }), grupo("Mulheres", 10, 2, { cpf: 7, comunhao: 9 }), grupo("Homens", 8, 1, { cpf: 5, comunhao: 6 })];
    for (const r of ["es", "aguas", "cpf", "comunhao", "completo"]) {
      const g = montarGrafico(grupos, r, 6);
      expect(g.sim).toBe(soma(grupos, r));
      expect(g.total).toBe(21);
      expect(g.linhas.at(-1).nome).toBe("Sem sexo informado");
    }
    const f = montarGrafico([grupo("Sem data de nascimento", 1), grupo("Crianças (até 11)", 2)], "es", 6);
    expect(f.linhas.map((l) => l.nome)).toEqual(["Crianças (até 11)", "Sem data de nascimento"]);
  });

  test("rol vazio: nenhuma linha e legenda zerada (a tela mostra 'Ninguém no rol ainda.')", () => {
    const g = montarGrafico([], "es", 6);
    expect(g.linhas).toHaveLength(0);
    expect([g.sim, g.nao, g.total]).toEqual([0, 0, 0]);
  });
});
