// Completar o arrolamento (FASE 10, Membros, rodada 28): as regras da TELA (front/src/membros/arrolamento.ts) — o que vai no pedido, o que a tela recusa
// antes de mandar (o servidor confere de novo: shared/arrolamento.js), o andamento em %, as frases do painel e a cor do departamento no círculo.
// O arquivo .ts é carregado direto: o Node tira os tipos (module.stripTypeScriptTypes, Node 22.13 ou mais novo) e o código roda num contexto isolado.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { stripTypeScriptTypes } = require("node:module");

const ARQ = path.join(__dirname, "..", "..", "..", "front", "src", "membros", "arrolamento.ts");
const NOMES = ["SITUACOES", "FORMAS", "formInicial", "montarEnvio", "pctAndamento", "fraseSemCongregacao", "fraseResto", "corDoDepartamento", "diaPorExtenso", "diaMes", "depoisDe", "notaDaData", "lerPainelArrol", "lerRespostaFicha"];

function carregar() {
  if (typeof stripTypeScriptTypes !== "function") throw new Error("este Node não tira tipos do TypeScript (precisa do 22.13 ou mais novo)");
  const js = stripTypeScriptTypes(fs.readFileSync(ARQ, "utf8"), { mode: "strip" }).replace(/^export (function|const) /gm, "$1 ");
  expect(js).not.toMatch(/^\s*(import|export)\b/m);
  return vm.runInNewContext(`${js}\n;({ ${NOMES.join(", ")} })`, {});
}
const T = carregar();
const HOJE = "2026-12-15";
const ficha = (extra = {}) => ({ matricula: 4102, nascimento: "1988-07-21", congregacaoId: 7, formaAdmissao: null, dataAdmissao: null, ...extra });
const comForm = (extra = {}) => ({ ...T.formInicial(ficha()), formaAdmissao: "BATISMO", dataAdmissao: "2009-03-12", ...extra });
// o vm devolve objetos de outro "mundo": compara pelo JSON
const igual = (a, b) => expect(JSON.parse(JSON.stringify(a))).toEqual(b);

describe("o formulário de completar", () => {
  test("começa em comunhão (como no desenho), sem forma e sem data (a função eclesiástica não é do formulário)", () => {
    igual(T.formInicial(ficha()), { situacao: "EM_COMUNHAO", formaAdmissao: "", dataAdmissao: "" });
  });
  test("o que o sistema pago já trouxe vem preenchido; forma fora da lista e data inválida, não", () => {
    igual(T.formInicial(ficha({ formaAdmissao: "CARTA_MUDANCA", dataAdmissao: "2015-06-01T00:00:00.000Z" })), { situacao: "EM_COMUNHAO", formaAdmissao: "CARTA_MUDANCA", dataAdmissao: "2015-06-01" });
    igual(T.formInicial(ficha({ formaAdmissao: "TRANSFERENCIA", dataAdmissao: "2015-13-45" })), { situacao: "EM_COMUNHAO", formaAdmissao: "", dataAdmissao: "" });
  });
  // menor 8 da revisão de 24/11/2026: "membro: ganha o voto" (do aprovado) contradizia a nota da Assembleia na mesma tela (18 anos e 90 dias de entrada,
  // estatuto.js). O texto diz a regra de verdade, sem prometer o voto na hora
  test("as 3 situações e as 4 formas do desenho, com os textos aprovados (o de em comunhão com a regra da Assembleia)", () => {
    igual(T.SITUACOES.map((s) => [s.valor, s.rotulo, s.sub]), [["EM_COMUNHAO", "Em comunhão", "membro: vota com 18 anos e 90 dias de entrada"], ["CONGREGADO", "Congregado", "ainda não membro: não vota"], ["SEM_COMUNHAO", "Sem comunhão", "em disciplina ou afastado"]]);
    expect(T.SITUACOES.some((s) => /ganha o voto/.test(s.sub))).toBe(false);
    igual(T.FORMAS.map((f) => f.valor), ["BATISMO", "CARTA_MUDANCA", "RECONCILIACAO", "ACLAMACAO"]);
    expect(T.FORMAS[0].rotulo).toBe("Batismo nas águas");
  });
});

describe("o que vai no pedido", () => {
  test("em comunhão: a matrícula, a situação, a forma e a data; nunca a função eclesiástica (regra dele de 24/11: só a Câmara e a academia)", () => {
    igual(T.montarEnvio(comForm(), ficha(), HOJE), { ok: true, corpo: { matricula: 4102, situacao: "EM_COMUNHAO", formaAdmissao: "BATISMO", dataAdmissao: "2009-03-12" } });
    expect(T.montarEnvio(comForm({ cargo: "DIACONO" }), ficha(), HOJE).corpo).not.toHaveProperty("cargoMinisterial");
  });
  test("sem comunhão também pede a forma e a data", () => {
    const r = T.montarEnvio(comForm({ situacao: "SEM_COMUNHAO" }), ficha(), HOJE);
    expect(r.ok).toBe(true);
    expect(r.corpo.formaAdmissao).toBe("BATISMO");
  });
  test("o congregado vai sem forma, sem data e sem cargo, mesmo que tenham ficado no formulário", () => {
    igual(T.montarEnvio(comForm({ situacao: "CONGREGADO", cargo: "DIACONO" }), ficha(), HOJE), { ok: true, corpo: { matricula: 4102, situacao: "CONGREGADO" } });
  });
  // G3 (decisão dele de 24/11/2026): sem congregação não há importação; a congregação nunca vai no pedido (muda pela transferência)
  test("a congregação nunca vai no pedido (G3), nem o formulário a tem", () => {
    expect(T.formInicial(ficha())).not.toHaveProperty("congregacaoId");
    expect(T.montarEnvio(comForm({ congregacaoId: 9 }), ficha(), HOJE).corpo).not.toHaveProperty("congregacaoId");
    expect(T.montarEnvio(comForm({ congregacaoId: 9 }), ficha({ congregacaoId: null }), HOJE).corpo).not.toHaveProperty("congregacaoId");
  });
});

describe("o que a tela recusa antes de mandar", () => {
  const recusa = (form, f = ficha()) => { const r = T.montarEnvio(form, f, HOJE); expect(r.ok).toBe(false); return [r.campo, r.mensagem]; };
  test("situação fora da lista", () => {
    igual(recusa(comForm({ situacao: "ARROLAMENTO" })), ["situacao", "Escolha a situação: em comunhão, congregado ou sem comunhão."]);
  });
  test("sem a forma de entrada", () => {
    igual(recusa(comForm({ formaAdmissao: "" })), ["forma", "Escolha como a pessoa entrou."]);
    igual(recusa(comForm({ formaAdmissao: "CONGREGADO" })), ["forma", "Escolha como a pessoa entrou."]);
  });
  test("sem a data, data inválida ou antes de 1900", () => {
    for (const d of ["", "12/03/2009", "2009-02-30", "1899-12-31"]) igual(recusa(comForm({ dataAdmissao: d })), ["data", "Informe quando a pessoa entrou (dia, mês e ano)."]);
  });
  test("data depois de hoje e antes do nascimento", () => {
    igual(recusa(comForm({ dataAdmissao: "2026-12-16" })), ["data", "A data de entrada não pode ser depois de hoje."]);
    igual(recusa(comForm({ dataAdmissao: "1988-07-20" })), ["data", "A data de entrada não pode ser antes do nascimento."]);
    expect(T.montarEnvio(comForm({ dataAdmissao: "1988-07-21" }), ficha(), HOJE).ok).toBe(true);
    expect(T.montarEnvio(comForm({ dataAdmissao: HOJE }), ficha(), HOJE).ok).toBe(true);
  });
});

describe("o andamento e as frases do painel", () => {
  test("a porcentagem do andamento: arredondada, nunca 100% enquanto falta alguém", () => {
    expect(T.pctAndamento(48, 312)).toBe(15);
    expect(T.pctAndamento(0, 154)).toBe(0);
    expect(T.pctAndamento(0, 0)).toBe(0);
    expect(T.pctAndamento(999, 1000)).toBe(99);
    expect(T.pctAndamento(1000, 1000)).toBe(100);
  });
  // G3: a frase não promete mais que a Geral escolhe a congregação (ninguém escolhe: a importação recusa a linha sem ela). Só a ficha de antes da regra
  // cai aqui, e ela não se completa pelo arrolamento.
  test("as fichas sem congregação (de antes da regra G3): a frase diz o que fazer, sem prometer a escolha", () => {
    expect(T.fraseSemCongregacao(1)).toBe("1 ficha está sem congregação e não se completa pelo arrolamento: avise o suporte.");
    expect(T.fraseSemCongregacao(1234)).toBe("1.234 fichas estão sem congregação e não se completam pelo arrolamento: avise o suporte.");
    expect(T.fraseSemCongregacao(2)).not.toMatch(/escolhe/);
  });
  test("as congregações que não cabem na tabela", () => {
    expect(T.fraseResto(6, "Área 2")).toBe("+ 6 congregações da Área 2");
    expect(T.fraseResto(1, null)).toBe("+ 1 congregação");
  });
  test("o dia por extenso e o dia da importação", () => {
    expect(T.diaPorExtenso("2026-12-15")).toBe("terça, 15/12/2026");
    expect(T.diaPorExtenso("2026-11-22")).toBe("domingo, 22/11/2026");
    expect(T.diaPorExtenso("lixo")).toBe("");
    expect(T.diaMes("2026-12-10")).toBe("10/12");
    expect(T.diaMes(null)).toBe("");
  });
  test("o depois de completar, por situação", () => {
    igual(T.depoisDe("EM_COMUNHAO"), { rotulo: "membro em comunhão", tom: "ok", voto: "com voto" });
    igual(T.depoisDe("CONGREGADO"), { rotulo: "congregado", tom: "info", voto: "sem voto" });
    igual(T.depoisDe("SEM_COMUNHAO"), { rotulo: "sem comunhão", tom: "atrasado", voto: "sem voto" });
  });
  test("a nota da data, só para quem fica em comunhão", () => {
    // A4 (revisão de 24/11): a Assembleia pede 18 anos, 90 dias da entrada e as duas datas (estatuto.js, calcularCapacidadeEleitoral): nada de "vale na hora"
    expect(T.notaDaData("EM_COMUNHAO", "2009-03-12")).toBe("A data de entrada é a de verdade (2009). Na Assembleia, vota quem tem 18 anos e 90 dias de entrada, com a data de nascimento na ficha.");
    expect(T.notaDaData("EM_COMUNHAO", "")).toBe("A data de entrada é a de verdade. Na Assembleia, vota quem tem 18 anos e 90 dias de entrada, com a data de nascimento na ficha.");
    expect(T.notaDaData("CONGREGADO", "2009-03-12")).toBe("");
    expect(T.notaDaData("SEM_COMUNHAO", "2009-03-12")).toBe("");
  });
  test("a cor do círculo pelo departamento (as do desenho); sem departamento, o azul", () => {
    expect(T.corDoDepartamento("Senhoras")).toBe("#BE185D");
    expect(T.corDoDepartamento("Círculo de Oração das Irmãs")).toBe("#BE185D");
    expect(T.corDoDepartamento("Varões")).toBe("#1D4ED8");
    expect(T.corDoDepartamento("União de Mocidade")).toBe("#6D28D9");
    expect(T.corDoDepartamento("Adolescentes")).toBe("#0369A1");
    expect(T.corDoDepartamento("Departamento Infantil")).toBe("#15803D");
    expect(T.corDoDepartamento(null)).toBe("#1D4ED8");
  });
});

describe("a resposta do servidor que a tela aceita (o painel não quebra com resposta estranha nem antes da importação)", () => {
  const and = { vieram: 312, completadas: 48, faltam: 264 };
  test("a resposta certa passa inteira", () => {
    const p = T.lerPainelArrol({ sucesso: true, andamento: and, veioEm: "2026-12-10", porCongregacao: [{ id: 1, nome: "Vila Nova", area: "Área 2", ...and }], proximas: [{ matricula: 4102, nome: "Ana", sexo: "F", departamento: "Senhoras" }], porArea: [], semCongregacao: 1 });
    igual(p, { andamento: and, veioEm: "2026-12-10", porCongregacao: [{ id: 1, nome: "Vila Nova", area: "Área 2", ...and }], proximas: [{ matricula: 4102, nome: "Ana", sexo: "F", departamento: "Senhoras" }], porArea: [], semCongregacao: 1 });
  });
  test("sem o andamento (servidor antigo, simulado ou resposta estranha): nada, e o painel fica como era", () => {
    for (const x of [null, undefined, "texto", [], { sucesso: true }, { andamento: "x" }, { andamento: { vieram: "3", completadas: 0, faltam: 3 } }, { andamento: { vieram: 3 } }]) expect(T.lerPainelArrol(x)).toBeNull();
  });
  test("listas e números que não vieram certos ficam vazios", () => {
    igual(T.lerPainelArrol({ andamento: and, veioEm: 5, porCongregacao: "x", proximas: null }), { andamento: and, veioEm: null, porCongregacao: [], proximas: [], porArea: null, semCongregacao: 0 });
  });
  test("a ficha: só com matrícula e nome; sem isso, conta como 'não falta nenhuma'", () => {
    const f = { matricula: 4102, nome: "Ana", nascimento: null, idade: 38, sexo: "F", congregacaoId: 7, congregacao: "Vila Nova", departamento: null, formaAdmissao: null, dataAdmissao: null };
    igual(T.lerRespostaFicha({ ficha: f, proxima: { matricula: 4118, nome: "Carlos" }, andamento: and }), { ficha: f, proxima: { matricula: 4118, nome: "Carlos" }, andamento: and });
    igual(T.lerRespostaFicha({ sucesso: true }), { ficha: null, proxima: null, andamento: null });
    igual(T.lerRespostaFicha({ ficha: { nome: "sem matrícula" }, proxima: { nome: "x" } }), { ficha: null, proxima: null, andamento: null });
  });
});

// G3 (decisão dele de 24/11/2026): sem congregação não há importação; toda ficha do arrolamento tem congregação. A frase do aprovado ("a Secretaria Geral
// escolhe a congregação") prometia uma escolha que não existe: troca pela que diz o que fazer, e só aparece se sobrou ficha de antes da regra. A tela
// Completar perde a rota "semCongregacao" e o campo da congregação (o servidor recusa a congregação no pedido).
const MEMBROS = path.join(__dirname, "..", "..", "..", "front", "src", "membros");
// menor 8 da revisão de 24/11/2026: a frase do painel também prometia o voto na hora ("sai deste grupo e ganha o voto")
describe("o painel não promete o voto na hora (menor 8)", () => {
  const painel = fs.readFileSync(path.join(MEMBROS, "telas", "Painel.svelte"), "utf8");
  test("a explicação do grupo diz a regra da Assembleia", () => {
    expect(painel).not.toMatch(/ganha o voto/);
    expect(painel).toMatch(/Ao completar, a pessoa sai deste grupo; em comunhão, vota com 18 anos e 90 dias de entrada\./);
  });
});

describe("o painel da Geral e a tela Completar sem a escolha da congregação (G3)", () => {
  const painel = fs.readFileSync(path.join(MEMBROS, "telas", "Painel.svelte"), "utf8");
  const completar = fs.readFileSync(path.join(MEMBROS, "telas", "Completar.svelte"), "utf8");
  const estado = fs.readFileSync(path.join(MEMBROS, "estado.svelte.ts"), "utf8");
  const app = fs.readFileSync(path.join(MEMBROS, "App.svelte"), "utf8");
  test("a frase das fichas sem congregação continua só para a Geral, sem o \"Completar ›\" depois dela", () => {
    expect(painel).toMatch(/sessao\.geral && \(arrol\?\.semCongregacao \?\? 0\) > 0/);
    const fim = painel.slice(painel.indexOf("{#snippet fimCima()}"), painel.indexOf("{/snippet}", painel.indexOf("{#snippet fimCima()}")));
    expect(fim).toMatch(/fraseSemCongregacao\(arrol\?\.semCongregacao \?\? 0\)/);
    expect(fim).not.toMatch(/Completar ›/);
    // o "Completar ›" de cada ficha da lista "a completar" da congregação continua (é do desenho)
    expect(painel).toMatch(/<span class="mais">Completar ›<\/span>/);
  });
  test("nenhuma rota nem campo para escolher a congregação no arrolamento", () => {
    for (const arq of [completar, estado, app]) expect(arq).not.toMatch(/semCongregacao/);
    // no painel, só a contagem que o servidor manda (para a frase acima)
    expect(painel.replace(/arrol\?\.semCongregacao \?\? 0/g, "")).not.toMatch(/semCongregacao/);
    expect(completar).not.toMatch(/\{#snippet congregacao\(\)\}/);
    expect(completar).not.toMatch(/Escolha a congregação/);
    expect(completar).not.toMatch(/congregacoesDestino/);
    expect(estado).toMatch(/tela: "completar"; readonly matricula: number \| null; readonly congregacaoId: number \| null \}/);
  });
});
