// Testes do v6.6 (EBD — Revistas e pedidos) — foco na lógica pura: validação
// de catálogo/itens, cálculo do valor total (sempre a partir do preço
// TRAVADO no item, nunca do catálogo vigente), a máquina de estados mínima
// pendente -> aprovado (pedido e pagamento, com as guardas contra decidir
// duas vezes / aprovar pedido vazio / pagar antes de aprovar) e a
// consolidação Área -> Congregação -> Pedidos.
const revistas = require("../ebdRevistas");

describe("trimestreValido", () => {
  test("aceita o formato AAAA-T1..T4", () => {
    expect(revistas.trimestreValido("2026-T1")).toBe(true);
    expect(revistas.trimestreValido("2026-T4")).toBe(true);
  });

  test("recusa formatos fora do padrão", () => {
    expect(revistas.trimestreValido("2026-T5")).toBe(false);
    expect(revistas.trimestreValido("26-T1")).toBe(false);
    expect(revistas.trimestreValido("")).toBe(false);
    expect(revistas.trimestreValido(null)).toBe(false);
  });
});

describe("validarNovaRevista", () => {
  test("recusa nome vazio ou curto demais", () => {
    expect(revistas.validarNovaRevista({ nome: "", trimestre: "2026-T1", precoUnitario: 10 }).valido).toBe(false);
    expect(revistas.validarNovaRevista({ nome: "A", trimestre: "2026-T1", precoUnitario: 10 }).valido).toBe(false);
  });

  test("recusa trimestre em formato inválido", () => {
    const r = revistas.validarNovaRevista({ nome: "Revista Adultos", trimestre: "1º trimestre", precoUnitario: 10 });
    expect(r.valido).toBe(false);
    expect(r.mensagem).toMatch(/trimestre/i);
  });

  test("recusa preço negativo ou ausente", () => {
    expect(revistas.validarNovaRevista({ nome: "Revista Adultos", trimestre: "2026-T1", precoUnitario: -1 }).valido).toBe(false);
    expect(revistas.validarNovaRevista({ nome: "Revista Adultos", trimestre: "2026-T1", precoUnitario: null }).valido).toBe(false);
  });

  test("aceita preço zero (revista gratuita/patrocinada) e dados válidos", () => {
    const r = revistas.validarNovaRevista({ nome: "Revista Adultos", trimestre: "2026-T1", precoUnitario: 0 });
    expect(r.valido).toBe(true);
  });
});

describe("validarItensPedido", () => {
  test("recusa lista vazia ou ausente", () => {
    expect(revistas.validarItensPedido([]).valido).toBe(false);
    expect(revistas.validarItensPedido(null).valido).toBe(false);
  });

  test("recusa item sem revistaId ou com quantidade inválida", () => {
    expect(revistas.validarItensPedido([{ revistaId: null, quantidade: 5 }]).valido).toBe(false);
    expect(revistas.validarItensPedido([{ revistaId: 1, quantidade: 0 }]).valido).toBe(false);
    expect(revistas.validarItensPedido([{ revistaId: 1, quantidade: -3 }]).valido).toBe(false);
    expect(revistas.validarItensPedido([{ revistaId: 1, quantidade: 1.5 }]).valido).toBe(false);
  });

  test("recusa revista repetida em duas linhas do mesmo pedido", () => {
    const r = revistas.validarItensPedido([{ revistaId: 1, quantidade: 5 }, { revistaId: 1, quantidade: 3 }]);
    expect(r.valido).toBe(false);
    expect(r.mensagem).toMatch(/repetida/);
  });

  test("aceita lista válida com revistas distintas", () => {
    const r = revistas.validarItensPedido([{ revistaId: 1, quantidade: 5 }, { revistaId: 2, quantidade: 3 }]);
    expect(r.valido).toBe(true);
  });
});

describe("calcularValorTotalPedido (sempre a partir do preço travado no item)", () => {
  test("soma quantidade * precoUnitarioRegistrado de cada item", () => {
    const total = revistas.calcularValorTotalPedido([
      { quantidade: 10, precoUnitarioRegistrado: 8.5 },
      { quantidade: 5, precoUnitarioRegistrado: 12 }
    ]);
    expect(total).toBeCloseTo(145);
  });

  test("lista vazia soma zero, sem quebrar", () => {
    expect(revistas.calcularValorTotalPedido([])).toBe(0);
    expect(revistas.calcularValorTotalPedido(undefined)).toBe(0);
  });
});

describe("podeAprovarPedido", () => {
  test("recusa pedido inexistente", () => {
    expect(revistas.podeAprovarPedido(null).permitido).toBe(false);
  });

  test("recusa aprovar pedido já aprovado (guarda contra aprovar duas vezes)", () => {
    const r = revistas.podeAprovarPedido({ status: "APROVADO", totalItens: 2 });
    expect(r.permitido).toBe(false);
    expect(r.mensagem).toMatch(/já foi aprovado/);
  });

  test("recusa aprovar pedido sem nenhum item", () => {
    const r = revistas.podeAprovarPedido({ status: "PENDENTE", totalItens: 0 });
    expect(r.permitido).toBe(false);
    expect(r.mensagem).toMatch(/nenhum item/);
  });

  test("permite aprovar pedido pendente com pelo menos um item", () => {
    expect(revistas.podeAprovarPedido({ status: "PENDENTE", totalItens: 1 }).permitido).toBe(true);
  });
});

describe("podeRegistrarPagamento", () => {
  test("recusa pagar pedido ainda pendente de aprovação", () => {
    const r = revistas.podeRegistrarPagamento({ status: "PENDENTE", statusPagamento: "PENDENTE" });
    expect(r.permitido).toBe(false);
    expect(r.mensagem).toMatch(/já aprovado/);
  });

  test("recusa registrar pagamento duas vezes", () => {
    const r = revistas.podeRegistrarPagamento({ status: "APROVADO", statusPagamento: "APROVADO" });
    expect(r.permitido).toBe(false);
    expect(r.mensagem).toMatch(/já foi registrado/);
  });

  test("permite registrar pagamento de pedido aprovado ainda não pago", () => {
    expect(revistas.podeRegistrarPagamento({ status: "APROVADO", statusPagamento: "PENDENTE" }).permitido).toBe(true);
  });
});

describe("podeEditarItensPedido", () => {
  test("permite editar itens enquanto pendente", () => {
    expect(revistas.podeEditarItensPedido({ status: "PENDENTE" }).permitido).toBe(true);
  });

  test("recusa editar itens depois de aprovado", () => {
    const r = revistas.podeEditarItensPedido({ status: "APROVADO" });
    expect(r.permitido).toBe(false);
    expect(r.mensagem).toMatch(/já foi aprovado/);
  });
});

describe("consolidarPedidosPorAreaCongregacao", () => {
  const pedidosPlanos = [
    { pedidoId: 1, turmaId: 10, turmaNome: "Adultos", trimestre: "2026-T1", status: "APROVADO", statusPagamento: "PENDENTE",
      congregacaoId: 100, congregacaoNome: "Sede", areaId: 1, areaNome: "Área 1", valorTotal: 150 },
    { pedidoId: 2, turmaId: 11, turmaNome: "Juvenis", trimestre: "2026-T1", status: "PENDENTE", statusPagamento: "PENDENTE",
      congregacaoId: 100, congregacaoNome: "Sede", areaId: 1, areaNome: "Área 1", valorTotal: 60 },
    { pedidoId: 3, turmaId: 20, turmaNome: "Adultos", trimestre: "2026-T1", status: "APROVADO", statusPagamento: "APROVADO",
      congregacaoId: 200, congregacaoNome: "Bairro Novo", areaId: 2, areaNome: "Área 2", valorTotal: 90 }
  ];

  test("agrupa por área, depois por congregação, somando o valor total em cada nível", () => {
    const agrupado = revistas.consolidarPedidosPorAreaCongregacao(pedidosPlanos);
    expect(agrupado.map(a => a.areaNome)).toEqual(["Área 1", "Área 2"]);
    const area1 = agrupado.find(a => a.areaNome === "Área 1");
    expect(area1.valorTotal).toBe(210);
    expect(area1.congregacoes).toHaveLength(1);
    expect(area1.congregacoes[0].pedidos).toHaveLength(2);
    expect(area1.congregacoes[0].valorTotal).toBe(210);
  });

  test("congregação sem área definida cai no grupo 'Sem Área definida', sem quebrar", () => {
    const agrupado = revistas.consolidarPedidosPorAreaCongregacao([
      { pedidoId: 4, turmaId: 30, turmaNome: "Crianças", trimestre: "2026-T1", status: "PENDENTE", statusPagamento: "PENDENTE",
        congregacaoId: 300, congregacaoNome: "Sem Área", areaId: null, areaNome: null, valorTotal: 40 }
    ]);
    expect(agrupado[0].areaNome).toBe("Sem Área definida");
    expect(agrupado[0].congregacoes[0].congregacaoNome).toBe("Sem Área");
  });

  test("lista vazia devolve array vazio", () => {
    expect(revistas.consolidarPedidosPorAreaCongregacao([])).toEqual([]);
  });
});

// v6.10 — pedido calculado a partir da matrícula real.
describe("sugerirItensPedido (v6.10)", () => {
  const catalogo = [
    { revistaId: 1, nome: "Lições Bíblicas — Jovens (Aluno)", faixaEtaria: "Jovens", ativa: true },
    { revistaId: 2, nome: "Lições Bíblicas — Jovens (Mestre)", faixaEtaria: "jovens", ativa: true },
    { revistaId: 3, nome: "Lições Bíblicas — Adultos", faixaEtaria: "Adultos", ativa: true },
    { revistaId: 4, nome: "Revista antiga Jovens", faixaEtaria: "Jovens", ativa: false }
  ];

  test("ehEdicaoDoProfessor pelo nome (sem acento/maiúscula)", () => {
    expect(revistas.ehEdicaoDoProfessor("Lições Bíblicas — MESTRE")).toBe(true);
    expect(revistas.ehEdicaoDoProfessor("Revista da Professora")).toBe(true);
    expect(revistas.ehEdicaoDoProfessor("Lições Bíblicas — Aluno")).toBe(false);
    expect(revistas.ehEdicaoDoProfessor("Maestria")).toBe(false);
  });

  test("edição do aluno = alunos ativos; edição do mestre = professores ativos", () => {
    const r = revistas.sugerirItensPedido({ matriculados: 18, professores: 2, faixaEtaria: "Jovens", catalogoDoTrimestre: catalogo });
    expect(r.itens).toEqual([{ revistaId: 1, quantidade: 18 }, { revistaId: 2, quantidade: 2 }]);
    expect(r.avisos).toEqual([]);
  });

  test("sem edição do professor no catálogo, o professor entra na conta do aluno", () => {
    const r = revistas.sugerirItensPedido({ matriculados: 10, professores: 1, faixaEtaria: "adultos", catalogoDoTrimestre: catalogo });
    expect(r.itens).toEqual([{ revistaId: 3, quantidade: 11 }]);
  });

  test("revista inativa não entra; turma sem faixa ou sem revista da faixa não sugere nada", () => {
    expect(revistas.sugerirItensPedido({ matriculados: 5, professores: 1, faixaEtaria: null, catalogoDoTrimestre: catalogo }).itens).toEqual([]);
    const r = revistas.sugerirItensPedido({ matriculados: 5, professores: 1, faixaEtaria: "Crianças", catalogoDoTrimestre: catalogo });
    expect(r.itens).toEqual([]);
    expect(r.avisos[0]).toMatch(/Nenhuma revista/);
  });

  test("turma sem aluno ativo avisa e não pede revista do aluno", () => {
    const r = revistas.sugerirItensPedido({ matriculados: 0, professores: 1, faixaEtaria: "Jovens", catalogoDoTrimestre: catalogo });
    expect(r.itens).toEqual([{ revistaId: 2, quantidade: 1 }]);
    expect(r.avisos.some(a => /não tem aluno ativo/.test(a))).toBe(true);
  });

  test("mais de uma edição do aluno: usa a primeira em ordem alfabética e avisa", () => {
    const r = revistas.sugerirItensPedido({
      matriculados: 4, professores: 0, faixaEtaria: "Jovens",
      catalogoDoTrimestre: [...catalogo, { revistaId: 5, nome: "A Revista Jovem", faixaEtaria: "Jovens", ativa: true }]
    });
    expect(r.itens[0]).toEqual({ revistaId: 5, quantidade: 4 });
    expect(r.avisos[0]).toMatch(/2 edições do aluno/);
  });

  test("compararPedidoComMatricula", () => {
    expect(revistas.compararPedidoComMatricula({ totalRevistas: 20, matriculadosNoPedido: 18, professoresNoPedido: 2 })).toEqual({ esperado: 20, totalRevistas: 20, diferenca: 0 });
    expect(revistas.compararPedidoComMatricula({ totalRevistas: 30, matriculadosNoPedido: 18, professoresNoPedido: 2 }).diferenca).toBe(10);
    expect(revistas.compararPedidoComMatricula({ totalRevistas: 30, matriculadosNoPedido: null })).toBeNull();
  });
});
