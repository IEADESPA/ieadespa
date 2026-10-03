// Testes do motor de workflow genérico (vB.3) — o que mais importa aqui é
// a progressão de etapa (aprovar/rejeitar/devolver) e a escalada territorial
// nunca pular nível nem girar em círculo quando já chegou no topo (GLOBAL).
const { criarPoolFalso, sqlFalso } = require("./testUtils");
const workflow = require("../workflow");

describe("nivelEfetivo / proximoNivel (escalada territorial)", () => {
  test("sem escalonamento, usa o nível da própria etapa", () => {
    expect(workflow.nivelEfetivo("AREA", null)).toBe("AREA");
  });

  test("etapa sem nível (NULL) sempre vira GLOBAL", () => {
    expect(workflow.nivelEfetivo(null, null)).toBe("GLOBAL");
  });

  test("escalonamento só vale se for MAIS ALTO que o nível da etapa (nunca desce)", () => {
    expect(workflow.nivelEfetivo("REGIAO", "AREA")).toBe("REGIAO"); // AREA é mais baixo que REGIAO — ignora
    expect(workflow.nivelEfetivo("AREA", "REGIAO")).toBe("REGIAO"); // REGIAO é mais alto — vale
  });

  test("proximoNivel sobe um degrau na hierarquia territorial", () => {
    expect(workflow.proximoNivel("CONGREGACAO")).toBe("AREA");
    expect(workflow.proximoNivel("DISTRITO")).toBe("GLOBAL");
  });

  test("proximoNivel de GLOBAL é null — não tem pra onde escalonar mais", () => {
    expect(workflow.proximoNivel("GLOBAL")).toBeNull();
    expect(workflow.proximoNivel(null)).toBeNull(); // null já é GLOBAL (nivelEfetivo), consistente
  });
});

describe("iniciarFluxo (idempotência por origem)", () => {
  test("cria a instância na etapa 1, com prazo calculado a partir de FluxoEtapas", async () => {
    const { pool, chamadas } = criarPoolFalso([
      [], // checagem de instância existente -> nenhuma
      [{ PrazoDias: 5 }], // etapa 1
      [{ InstanciaId: 42 }], // insert
      [] // insert do histórico (INICIAR)
    ]);
    const r = await workflow.iniciarFluxo(pool, { tipoFluxo: "TESTE", referenciaTabela: "Tabela", referenciaId: 1, congregacaoId: 9, solicitanteMembroId: 7 });
    expect(r).toEqual({ criada: true, instanciaId: 42 });
    expect(chamadas).toHaveLength(4); // checagem + etapa1 + insert + historico
  });

  test("não duplica quando já existe instância pra mesma origem", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ InstanciaId: 10 }]]);
    const r = await workflow.iniciarFluxo(pool, { tipoFluxo: "TESTE", referenciaTabela: "Tabela", referenciaId: 1 });
    expect(r).toEqual({ criada: false, instanciaId: 10 });
    expect(chamadas).toHaveLength(1);
  });

  test("tipo de fluxo sem etapa cadastrada é erro explícito, não silêncio", async () => {
    const { pool } = criarPoolFalso([[], []]);
    await expect(workflow.iniciarFluxo(pool, { tipoFluxo: "SEM_ETAPA", referenciaTabela: "T", referenciaId: 1 }))
      .rejects.toThrow(/não tem etapas cadastradas/);
  });
});

describe("avancarEtapa (aprovar/rejeitar/devolver)", () => {
  test("REJEITAR é terminal — grava histórico e encerra, sem tentar buscar próxima etapa", async () => {
    const { pool, chamadas } = criarPoolFalso([
      [{ InstanciaId: 1, Status: "EM_ANDAMENTO", EtapaAtualOrdem: 1, TipoFluxo: "T" }], // SELECT instancia
      [], // insert historico
      [] // update instancia
    ]);
    const r = await workflow.avancarEtapa(pool, { instanciaId: 1, acao: "REJEITAR", usuarioMembroId: 5 });
    expect(r.sucesso).toBe(true);
    expect(chamadas).toHaveLength(3);
    expect(chamadas[2].sql).toMatch(/Status = @status/);
  });

  test("já encerrado não deixa agir de novo (evita duplo aprovar/rejeitar)", async () => {
    const { pool } = criarPoolFalso([[{ InstanciaId: 1, Status: "CONCLUIDO", EtapaAtualOrdem: 2, TipoFluxo: "T" }]]);
    const r = await workflow.avancarEtapa(pool, { instanciaId: 1, acao: "APROVAR", usuarioMembroId: 5 });
    expect(r).toEqual({ sucesso: false, mensagem: "Este fluxo já foi encerrado." });
  });

  test("APROVAR na última etapa conclui o fluxo (não fica esperando uma etapa que não existe)", async () => {
    const { pool } = criarPoolFalso([
      [{ InstanciaId: 1, Status: "EM_ANDAMENTO", EtapaAtualOrdem: 2, TipoFluxo: "T" }],
      [], // historico
      [], // busca próxima etapa (ordem 3) -> nenhuma
      [] // update pra CONCLUIDO
    ]);
    const r = await workflow.avancarEtapa(pool, { instanciaId: 1, acao: "APROVAR", usuarioMembroId: 5 });
    expect(r.sucesso).toBe(true);
    expect(r.mensagem).toMatch(/concluído/i);
  });

  test("APROVAR com próxima etapa existente avança a ordem e zera o escalonamento anterior", async () => {
    const { pool, chamadas } = criarPoolFalso([
      [{ InstanciaId: 1, Status: "EM_ANDAMENTO", EtapaAtualOrdem: 1, TipoFluxo: "T" }],
      [],
      [{ PrazoDias: 3 }], // etapa 2 existe
      [] // update
    ]);
    const r = await workflow.avancarEtapa(pool, { instanciaId: 1, acao: "APROVAR", usuarioMembroId: 5 });
    expect(r.sucesso).toBe(true);
    const updateChamada = chamadas[chamadas.length - 1];
    expect(updateChamada.sql).toMatch(/EtapaAtualOrdem = @etapaAtualOrdem/);
    expect(updateChamada.sql).toMatch(/EscalonadoNivel = @escalonadoNivel/);
    expect(updateChamada.inputs.etapaAtualOrdem).toBe(2);
    expect(updateChamada.inputs.escalonadoNivel).toBeNull();
  });
});

describe("resolverResponsaveisEtapa", () => {
  test("nível GLOBAL (ou sem congregação) não passa pela hierarquia territorial", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ membroId: 1, nome: "A", email: "a@x.com" }]]);
    const r = await workflow.resolverResponsaveisEtapa(pool, { permissao: "financeiro", nivel: "GLOBAL", congregacaoId: 9 });
    expect(r).toHaveLength(1);
    expect(chamadas).toHaveLength(1); // só a query de destinatários por permissão, sem ancestraisTerritoriais
  });

  test("nível territorial sem ancestral resolvido (ex: sem Área) não retorna 'todo mundo' — retorna vazio", async () => {
    // ancestraisTerritoriais(nivel=1) faz 1 query (AreaId da congregação) — devolve sem AreaId
    const { pool, chamadas } = criarPoolFalso([[{ AreaId: null }]]);
    const r = await workflow.resolverResponsaveisEtapa(pool, { permissao: "financeiro", nivel: "AREA", congregacaoId: 9 });
    expect(r).toEqual([]);
    expect(chamadas).toHaveLength(1); // nunca chega a consultar Lideranca sem saber o escopoId
  });
});
