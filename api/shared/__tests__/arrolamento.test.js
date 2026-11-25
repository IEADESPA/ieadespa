// FASE 10, Membros (rodada 28, aprovada em 23/11/2026) — COMPLETAR O ARROLAMENTO: as regras puras (shared/arrolamento.js).
// A secretaria escolhe a situação, como e quando a pessoa entrou e o cargo, só se tiver (plano da fase 10, "As regras da rodada 28"). A congregação, a área e a
// Geral completam, cada uma no seu escopo ("se a congregação não faz, a área faz"); ninguém completa a própria ficha; toda ficha tem congregação
// (G3, 24/11/2026: sem congregação não há importação). A consulta e a gravação de verdade rodam no roteiro ponta a ponta (tools/e2e-localdb/e2e-98-arrolamento.js).
const regras = require("../arrolamento");

const HOJE = "2026-11-23";
const NASC = "1988-07-21";
const v = (corpo, ctx = {}) => regras.validarCompletar(corpo, { hoje: HOJE, nascimento: NASC, ...ctx });
const comunhao = { situacao: "EM_COMUNHAO", formaAdmissao: "BATISMO", dataAdmissao: "2009-03-12" };

describe("validarCompletar: a situação", () => {
  test("em comunhão, com a forma e a data de entrada de verdade: passa (sem função: o arrolamento não grava)", () => {
    expect(v(comunhao)).toEqual({ ok: true, dados: { situacao: "EM_COMUNHAO", formaAdmissao: "BATISMO", dataAdmissao: "2009-03-12" } });
  });
  test.each([undefined, null, "", "ARROLAMENTO", "em_comunhao", "MEMBRO", 1, [], {}, "' OR 1=1 --"])("situação %p: recusada", (situacao) => {
    const r = v({ ...comunhao, situacao });
    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/situação/i);
  });
  test("sem comunhão (em disciplina ou afastado): passa, com a forma e a data", () => {
    expect(v({ ...comunhao, situacao: "SEM_COMUNHAO", formaAdmissao: "CARTA_MUDANCA" }).ok).toBe(true);
  });
  test("o corpo que não é objeto: recusado", () => {
    for (const corpo of [null, undefined, "x", 3, []]) expect(regras.validarCompletar(corpo, { hoje: HOJE }).ok).toBe(false);
  });
});

describe("validarCompletar: como e quando a pessoa entrou", () => {
  test.each(["BATISMO", "CARTA_MUDANCA", "RECONCILIACAO", "ACLAMACAO"])("a forma %s: passa", (formaAdmissao) => {
    expect(v({ ...comunhao, formaAdmissao }).dados.formaAdmissao).toBe(formaAdmissao);
  });
  test.each([undefined, "", "batismo", "OUTRA", 7, "<b>"])("membro sem a forma certa (%p): recusado", (formaAdmissao) => {
    const r = v({ ...comunhao, formaAdmissao });
    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/como a pessoa entrou/i);
  });
  test.each([undefined, "", "2026-02-30", "12/03/2009", "20090312", "2009-13-01", 2009, "1899-12-31"])("membro sem a data certa (%p): recusado", (dataAdmissao) => {
    const r = v({ ...comunhao, dataAdmissao });
    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/quando a pessoa entrou/i);
  });
  test("a data de entrada depois de hoje: recusada", () => {
    expect(v({ ...comunhao, dataAdmissao: "2026-11-24" }).mensagem).toMatch(/depois de hoje/);
    expect(v({ ...comunhao, dataAdmissao: HOJE }).ok).toBe(true);
  });
  test("a data de entrada antes do nascimento: recusada (sem o nascimento na ficha, não há o que comparar)", () => {
    expect(v({ ...comunhao, dataAdmissao: "1988-07-20" }).mensagem).toMatch(/antes do nascimento/);
    expect(v({ ...comunhao, dataAdmissao: "1988-07-20" }, { nascimento: null }).ok).toBe(true);
  });
});

describe("validarCompletar: o congregado", () => {
  test("o congregado ainda não é membro: sem forma, sem data e sem cargo, passa", () => {
    expect(v({ situacao: "CONGREGADO" })).toEqual({ ok: true, dados: { situacao: "CONGREGADO", formaAdmissao: null, dataAdmissao: null } });
    expect(v({ situacao: "CONGREGADO", formaAdmissao: "", dataAdmissao: null, cargoMinisterial: "" }).ok).toBe(true);
  });
  test("o congregado com forma ou data de entrada: recusado", () => {
    expect(v({ situacao: "CONGREGADO", formaAdmissao: "BATISMO" }).mensagem).toMatch(/congregado/i);
    expect(v({ situacao: "CONGREGADO", dataAdmissao: "2009-03-12" }).mensagem).toMatch(/congregado/i);
  });
  test("o congregado com função: recusado (o arrolamento não grava função)", () => {
    expect(v({ situacao: "CONGREGADO", cargoMinisterial: "DIACONO" }).ok).toBe(false);
  });
});

// Regra dele de 24/11/2026 (A3 da revisão): a função eclesiástica (auxiliar, diácono, presbítero, evangelista, missionário, pastor) só a Câmara de
// liderança e a academia mudam; a secretaria local e a da área NUNCA. O "cargo" do arrolamento era essa função (MembroReferencia.CargoMinisterial):
// o arrolamento não a grava mais, em nenhum nível; a tela mostra a que já existe, só para ler.
describe("validarCompletar: a função eclesiástica não se grava no arrolamento", () => {
  test("nenhuma, vazia ou MEMBRO: passa, e os dados não levam função", () => {
    for (const cargoMinisterial of [undefined, null, "", "MEMBRO"]) {
      const r = v({ ...comunhao, cargoMinisterial });
      expect(r.ok).toBe(true);
      expect(r.dados).not.toHaveProperty("cargo");
    }
  });
  test.each(["AUXILIAR", "DIACONO", "PRESBITERO", "EVANGELISTA", "MISSIONARIO", "PASTOR"])("a função %s: recusada (só a Câmara de liderança e a academia)", (cargoMinisterial) => {
    const r = v({ ...comunhao, cargoMinisterial });
    expect(r).toEqual({ ok: false, mensagem: "A função eclesiástica (auxiliar, diácono, presbítero, evangelista, missionário, pastor) só a Câmara de liderança e a academia mudam: o arrolamento não grava função." });
    expect(v({ ...comunhao, situacao: "SEM_COMUNHAO", cargoMinisterial }).ok).toBe(false);
  });
  test.each(["'; DROP TABLE x; --", "presbitero", 5, {}, "X".repeat(40)])("lixo no campo %p: recusado", (cargoMinisterial) => {
    const r = v({ ...comunhao, cargoMinisterial });
    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/função/i);
  });
});

// G3 (decisão dele de 24/11/2026): sem congregação não há importação. Toda ficha do arrolamento tem congregação; ninguém escolhe a congregação aqui (para
// mudar, é a transferência). A ficha sem congregação que ficou de antes da regra não se completa pelo arrolamento (a tela diz o porquê).
describe("validarCompletar: a congregação não vem no arrolamento", () => {
  test("sem o campo (ou vazio): passa, e os dados não levam congregação", () => {
    for (const congregacaoId of [undefined, null, ""]) {
      const r = v({ ...comunhao, congregacaoId });
      expect(r.ok).toBe(true);
      expect(r.dados).not.toHaveProperty("congregacaoId");
    }
  });
  test.each([5, "12", "abc", -1, 0, {}, "1 OR 1=1"])("congregação %p: recusada (a congregação muda pela transferência)", (congregacaoId) => {
    expect(v({ ...comunhao, congregacaoId })).toEqual({ ok: false, mensagem: "A congregação não muda pelo arrolamento: para mudar, use a transferência." });
  });
});

describe("podeCompletar: quem completa", () => {
  const base = { propria: false, temCongregacao: true };
  test("a secretaria (congregação ou área) e a Geral completam a ficha (o escopo já foi conferido antes)", () => {
    expect(regras.podeCompletar(base)).toEqual({ pode: true });
  });
  test("ninguém completa a própria ficha", () => {
    const r = regras.podeCompletar({ ...base, propria: true });
    expect(r).toMatchObject({ pode: false, status: 403 });
    expect(r.mensagem).toMatch(/própria ficha/);
  });
  test("a ficha sem congregação (de antes da regra): ninguém completa pelo arrolamento, nem a Geral", () => {
    expect(regras.podeCompletar({ ...base, temCongregacao: false })).toEqual({ pode: false, status: 409, mensagem: regras.MSG_SEM_CONGREGACAO });
    expect(regras.MSG_SEM_CONGREGACAO).toBe("Esta ficha está sem congregação: ela não se completa pelo arrolamento. Toda ficha precisa de uma congregação; avise o suporte.");
    expect(regras.MSG_SEM_CONGREGACAO).not.toMatch(/escolhe/);
  });
});

describe("o recado depois de completar", () => {
  test("em comunhão ganha o voto; o congregado e o sem comunhão não votam", () => {
    expect(regras.recadoFeito("EM_COMUNHAO", "Ana Exemplo")).toBe("Arrolamento completado: Ana Exemplo está em comunhão (na Assembleia, vota com 18 anos e 90 dias de entrada).");
    expect(regras.recadoFeito("EM_COMUNHAO", "Ana Exemplo")).not.toMatch(/ganhou o voto/);
    expect(regras.recadoFeito("CONGREGADO", "Ana Exemplo")).toMatch(/congregado/i);
    expect(regras.recadoFeito("SEM_COMUNHAO", "Ana Exemplo")).toMatch(/sem comunhão/i);
  });
});
