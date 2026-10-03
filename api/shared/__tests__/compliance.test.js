// Testes da recertificação generalizada (vB.9) — achado real corrigido: o
// `EXISTS` antigo checava só MembroId (não Permissao), então alguém com 2
// permissões só ganhava recertificação pendente pra 1 delas.
const { criarPoolFalso, sqlFalso } = require("./testUtils");
const compliance = require("../compliance");

describe("gerarRecertificacoesTodasPermissoes", () => {
  test("cria uma recertificação PENDENTE por permissão, não uma só por membro", async () => {
    const { pool, chamadas } = criarPoolFalso([
      [{ PeriodicidadeRecertificacaoMeses: 3 }], // parametrosCompliance
      [{ membroId: 1, papelId: 10, permissoesStr: "financeiro,pessoas" }], // alvos
      [], // existe? financeiro -> não
      [], // insert financeiro
      [], // existe? pessoas -> não
      []  // insert pessoas
    ]);
    const criados = await compliance.gerarRecertificacoesTodasPermissoes(pool, sqlFalso);
    expect(criados).toBe(2);
    expect(chamadas).toHaveLength(6);
  });

  test("não duplica quando já existe PENDENTE pra aquela permissão específica", async () => {
    const { pool, chamadas } = criarPoolFalso([
      [{ PeriodicidadeRecertificacaoMeses: 3 }],
      [{ membroId: 1, papelId: 10, permissoesStr: "financeiro,pessoas" }],
      [{ x: 1 }], // já existe PENDENTE pra financeiro
      [], // não existe pra pessoas
      []  // insert só de pessoas
    ]);
    const criados = await compliance.gerarRecertificacoesTodasPermissoes(pool, sqlFalso);
    expect(criados).toBe(1);
    expect(chamadas).toHaveLength(5);
  });
});

describe("permissoesComRecertificacaoExpirada", () => {
  test("devolve só as permissões cuja recertificação MAIS RECENTE está EXPIRADA", async () => {
    const { pool } = criarPoolFalso([[{ Permissao: "financeiro" }]]);
    const expiradas = await compliance.permissoesComRecertificacaoExpirada(pool, sqlFalso, 1);
    expect(expiradas).toEqual(["financeiro"]);
  });

  test("sem nenhuma expirada, devolve vazio", async () => {
    const { pool } = criarPoolFalso([[]]);
    const expiradas = await compliance.permissoesComRecertificacaoExpirada(pool, sqlFalso, 1);
    expect(expiradas).toEqual([]);
  });
});
