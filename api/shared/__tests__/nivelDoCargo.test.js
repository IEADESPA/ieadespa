// shared/nivelDoCargo.js por conta própria: só a concessão que tem "pessoas" conta para alcançar o cargo, mesmo quando quem chama passa a sessão inteira (e não a
// visão da permissão). Os casos de rota (local, área, geral, 428, mais de um cargo) estão em pessoasGravacao.test.js e no e2e-152 (seção 3).
const nivelDoCargo = require("../nivelDoCargo");
const { sqlFalso } = require("./testUtils");

// O banco por TEXTO: o cargo de área 3 da pessoa e as congregações da área 3.
const pool = {
  request: () => {
    const r = {
      input: () => r,
      query: async (texto) => {
        if (/FROM Lideranca l/.test(texto)) return { recordset: [{ EscopoTipo: "AREA", EscopoId: 3 }] };
        if (/FROM Congregacoes WHERE AreaId = @id/.test(texto)) return { recordset: [{ Nome: "Central" }, { Nome: "Vila Nova" }] };
        return { recordset: [] };
      }
    };
    return r;
  }
};
const sessao = (concessoes) => ({ membroId: 9, concessoes });
const local = { nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], permissoes: ["pessoas"] };

test("a concessão de área SEM 'pessoas' não alcança o cargo de área (a de 'pessoas' é só local)", async () => {
  const usuario = sessao([local, { nivel: "AREA", escopoCongregacoes: ["Central", "Vila Nova"], permissoes: ["financeiro"] }]);
  expect(await nivelDoCargo.alcancaOsCargos(pool, sqlFalso, usuario, 50, "2026-11-25")).toBe(false);
});

test("a concessão de área COM 'pessoas' alcança", async () => {
  const usuario = sessao([local, { nivel: "AREA", escopoCongregacoes: ["Central", "Vila Nova"], permissoes: ["pessoas"] }]);
  expect(await nivelDoCargo.alcancaOsCargos(pool, sqlFalso, usuario, 50, "2026-11-25")).toBe(true);
});
