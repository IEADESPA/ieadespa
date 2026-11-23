// FASE 10, Membros (rodada 28, aprovada em 23/11/2026) — COMPLETAR O ARROLAMENTO: as regras puras (shared/arrolamento.js).
// A secretaria escolhe a situação, como e quando a pessoa entrou e o cargo, só se tiver (plano da fase 10, "As regras da rodada 28"). A congregação, a área e a
// Geral completam, cada uma no seu escopo ("se a congregação não faz, a área faz"); ninguém completa a própria ficha; a ficha que veio sem congregação fica com
// a Geral, que escolhe a congregação. A consulta e a gravação de verdade rodam no roteiro ponta a ponta (tools/e2e-localdb/e2e-98-arrolamento.js).
const regras = require("../arrolamento");

const HOJE = "2026-11-23";
const NASC = "1988-07-21";
const v = (corpo, ctx = {}) => regras.validarCompletar(corpo, { hoje: HOJE, nascimento: NASC, ...ctx });
const comunhao = { situacao: "EM_COMUNHAO", formaAdmissao: "BATISMO", dataAdmissao: "2009-03-12" };

describe("validarCompletar: a situação", () => {
  test("em comunhão, com a forma e a data de entrada de verdade: passa, sem cargo", () => {
    expect(v(comunhao)).toEqual({ ok: true, dados: { situacao: "EM_COMUNHAO", formaAdmissao: "BATISMO", dataAdmissao: "2009-03-12", cargo: null, congregacaoId: null } });
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
    expect(v({ situacao: "CONGREGADO" })).toEqual({ ok: true, dados: { situacao: "CONGREGADO", formaAdmissao: null, dataAdmissao: null, cargo: null, congregacaoId: null } });
    expect(v({ situacao: "CONGREGADO", formaAdmissao: "", dataAdmissao: null, cargoMinisterial: "" }).ok).toBe(true);
  });
  test("o congregado com forma ou data de entrada: recusado", () => {
    expect(v({ situacao: "CONGREGADO", formaAdmissao: "BATISMO" }).mensagem).toMatch(/congregado/i);
    expect(v({ situacao: "CONGREGADO", dataAdmissao: "2009-03-12" }).mensagem).toMatch(/congregado/i);
  });
  test("o congregado com cargo: recusado", () => {
    expect(v({ situacao: "CONGREGADO", cargoMinisterial: "DIACONO" }).mensagem).toMatch(/congregado/i);
  });
});

describe("validarCompletar: o cargo, só se tiver", () => {
  test("nenhum, vazio ou MEMBRO: sem cargo", () => {
    for (const cargoMinisterial of [undefined, null, "", "MEMBRO"]) expect(v({ ...comunhao, cargoMinisterial }).dados.cargo).toBeNull();
  });
  test("a sigla do cargo passa (o catálogo é conferido no banco)", () => {
    expect(v({ ...comunhao, cargoMinisterial: "PRESBITERO" }).dados.cargo).toBe("PRESBITERO");
    expect(v({ ...comunhao, situacao: "SEM_COMUNHAO", cargoMinisterial: "DIACONO" }).dados.cargo).toBe("DIACONO");
  });
  test.each(["'; DROP TABLE x; --", "presbitero", 5, {}, "X".repeat(40)])("cargo %p: recusado", (cargoMinisterial) => {
    const r = v({ ...comunhao, cargoMinisterial });
    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/cargo/i);
  });
});

describe("validarCompletar: a congregação (só a ficha que veio sem ela)", () => {
  test("a matrícula da congregação, em número ou texto canônico", () => {
    expect(v({ ...comunhao, congregacaoId: 5 }).dados.congregacaoId).toBe(5);
    expect(v({ ...comunhao, congregacaoId: "12" }).dados.congregacaoId).toBe(12);
  });
  test.each(["abc", -1, 0, 1.5, "05", {}, "1 OR 1=1"])("congregação %p: recusada", (congregacaoId) => {
    expect(v({ ...comunhao, congregacaoId }).mensagem).toMatch(/congregação/i);
  });
});

describe("podeCompletar: quem completa", () => {
  const base = { geral: false, propria: false, temCongregacao: true, congregacaoPedida: null };
  test("a secretaria (congregação ou área) e a Geral completam a ficha que tem congregação", () => {
    expect(regras.podeCompletar(base)).toEqual({ pode: true });
    expect(regras.podeCompletar({ ...base, geral: true })).toEqual({ pode: true });
  });
  test("ninguém completa a própria ficha", () => {
    const r = regras.podeCompletar({ ...base, propria: true, geral: true });
    expect(r).toMatchObject({ pode: false, status: 403 });
    expect(r.mensagem).toMatch(/própria ficha/);
  });
  test("a ficha que veio sem congregação: só a Geral, escolhendo a congregação", () => {
    expect(regras.podeCompletar({ ...base, temCongregacao: false })).toMatchObject({ pode: false, status: 403, mensagem: expect.stringMatching(/Secretaria Geral/) });
    expect(regras.podeCompletar({ ...base, temCongregacao: false, geral: true })).toMatchObject({ pode: false, status: 400, mensagem: expect.stringMatching(/Escolha a congregação/) });
    expect(regras.podeCompletar({ ...base, temCongregacao: false, geral: true, congregacaoPedida: 3 })).toEqual({ pode: true });
  });
  test("a ficha que já tem congregação não muda de congregação por aqui (é a transferência)", () => {
    expect(regras.podeCompletar({ ...base, geral: true, congregacaoPedida: 3 })).toMatchObject({ pode: false, status: 400, mensagem: expect.stringMatching(/transferência/) });
  });
});

describe("o recado depois de completar", () => {
  test("em comunhão ganha o voto; o congregado e o sem comunhão não votam", () => {
    expect(regras.recadoFeito("EM_COMUNHAO", "Ana Exemplo")).toMatch(/Ana Exemplo.*voto/);
    expect(regras.recadoFeito("CONGREGADO", "Ana Exemplo")).toMatch(/congregado/i);
    expect(regras.recadoFeito("SEM_COMUNHAO", "Ana Exemplo")).toMatch(/sem comunhão/i);
  });
});
