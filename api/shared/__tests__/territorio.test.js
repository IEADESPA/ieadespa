// v9.5 — Mapa territorial: a regra pura (shared/territorio.js).
const tr = require("../territorio");

describe("endereço em linhas", () => {
  test("CEP: 8 números, gravado com o traço; vazio é sem CEP", () => {
    expect(tr.normalizarCep("68515000")).toEqual({ valido: true, cep: "68515-000" });
    expect(tr.normalizarCep("68.515-000")).toEqual({ valido: true, cep: "68515-000" });
    expect(tr.normalizarCep(68515000)).toEqual({ valido: true, cep: "68515-000" });
    expect(tr.normalizarCep("")).toEqual({ valido: true, cep: null });
    expect(tr.normalizarCep(null)).toEqual({ valido: true, cep: null });
    for (const ruim of ["6851500", "685150000", "abcdefgh", "00000000", {}, ["68515000"]]) expect(tr.normalizarCep(ruim).valido).toBe(false);
  });

  test("tudo opcional; o bairro é da lista OU escrito; escrito pede cidade e UF", () => {
    expect(tr.validarEnderecoPartes({})).toEqual({ valido: true, partes: { logradouro: null, numero: null, complemento: null, bairroTexto: null, cidade: null, bairroId: null, uf: null, cep: null } });
    const ok = tr.validarEnderecoPartes({ logradouro: "  Rua  A ", numero: "12", bairroId: "7", uf: "pa", cep: "68515000" });
    expect(ok.valido).toBe(true);
    expect(ok.partes).toMatchObject({ logradouro: "Rua A", numero: "12", bairroId: 7, uf: "PA", cep: "68515-000" });
    expect(tr.validarEnderecoPartes({ bairroId: 7, bairroTexto: "Centro" }).valido).toBe(false);
    expect(tr.validarEnderecoPartes({ bairroTexto: "Centro" }).mensagem).toMatch(/cidade e a UF/);
    expect(tr.validarEnderecoPartes({ bairroTexto: "Centro", cidade: "Parauapebas", uf: "PA" }).valido).toBe(true);
    expect(tr.validarEnderecoPartes({ bairroTexto: "C", cidade: "Parauapebas", uf: "PA" }).valido).toBe(false);
    expect(tr.validarEnderecoPartes({ uf: "XX" }).valido).toBe(false);
    for (const id of ["0x10", "1e1", "-1", "1.5", true, [3], {}]) expect(tr.validarEnderecoPartes({ bairroId: id }).valido).toBe(false);
    expect(tr.validarEnderecoPartes({ logradouro: "x".repeat(201) }).valido).toBe(false);
    expect(tr.validarEnderecoPartes({ numero: "x".repeat(21) }).valido).toBe(false);
    expect(tr.validarEnderecoPartes({ complemento: "x".repeat(101) }).valido).toBe(false);
    expect(tr.validarEnderecoPartes({ logradouro: 5 }).valido).toBe(false);
    for (const lixo of [null, "texto", [1], 5]) expect(tr.validarEnderecoPartes(lixo).valido).toBe(false);
  });

  test("o bairro da lista manda na cidade e na UF", () => {
    const p = tr.aplicarBairro({ bairroId: 7, cidade: "Marabá", uf: "PA" }, { bairroId: 7, nome: "Bairro da Paz", cidade: "Parauapebas", uf: "PA" });
    expect(p).toMatchObject({ cidade: "Parauapebas", uf: "PA" });
    expect(tr.aplicarBairro({ bairroTexto: "X", cidade: "Marabá", uf: "PA" }, null)).toMatchObject({ cidade: "Marabá" });
  });

  test("a linha única montada com as linhas (até 300 caracteres)", () => {
    expect(tr.montarLinhaEndereco({ logradouro: "Rua A", numero: "123", complemento: "apto 2", bairroId: 7, cidade: "Parauapebas", uf: "PA", cep: "68515-000" }, "Bairro da Paz"))
      .toBe("Rua A, 123, apto 2 — Bairro da Paz — Parauapebas/PA — CEP 68515-000");
    expect(tr.montarLinhaEndereco({ bairroTexto: "Novo Horizonte", cidade: "Parauapebas", uf: "PA" }, null)).toBe("Novo Horizonte — Parauapebas/PA");
    expect(tr.montarLinhaEndereco({}, null)).toBeNull();
    expect(tr.montarLinhaEndereco({ logradouro: "x".repeat(200), complemento: "y".repeat(100), bairroTexto: "z".repeat(150), cidade: "w".repeat(150), uf: "PA" }, null).length).toBe(300);
  });

  test("a limpeza da LGPD cobre as 8 colunas novas", () => {
    for (const c of ["EnderecoLogradouro", "EnderecoNumero", "EnderecoComplemento", "EnderecoBairroId", "EnderecoBairroTexto", "EnderecoCidade", "EnderecoUF", "EnderecoCep"]) {
      expect(tr.LIMPAR_ENDERECO_LINHAS).toContain(`${c} = NULL`);
    }
  });
});

describe("pontos no mapa", () => {
  test("validarPonto: os dois ou nenhum; faixas; o 0,0 recusado; 6 casas", () => {
    expect(tr.validarPonto(null, null)).toEqual({ valido: true, lat: null, lng: null });
    expect(tr.validarPonto("", "", { opcional: false }).valido).toBe(false);
    expect(tr.validarPonto(-6.0675, null).valido).toBe(false);
    expect(tr.validarPonto("-6.06751234", "-49.9025")).toEqual({ valido: true, lat: -6.067512, lng: -49.9025 });
    expect(tr.validarPonto(0, 0).valido).toBe(false);
    expect(tr.validarPonto(91, 0).valido).toBe(false);
    expect(tr.validarPonto(0, 181).valido).toBe(false);
    for (const ruim of ["abc", "1e2", "0x10", NaN, Infinity, "-6,07", [1], {}]) expect(tr.validarPonto(ruim, -49).valido).toBe(false);
  });

  test("interpretarPonto: o pino exato vale mais que o centro da tela, que vale mais que q=", () => {
    const pino = "https://www.google.com/maps/place/X/@-6.0700,-49.9000,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-6.0675!4d-49.9025";
    expect(tr.interpretarPonto(pino)).toEqual({ valido: true, lat: -6.0675, lng: -49.9025 });
    expect(tr.interpretarPonto("https://www.google.com/maps/@-6.07,-49.9,15z")).toEqual({ valido: true, lat: -6.07, lng: -49.9 });
    expect(tr.interpretarPonto("https://maps.google.com/?q=-6.07%2C-49.91")).toEqual({ valido: true, lat: -6.07, lng: -49.91 });
    expect(tr.interpretarPonto("-6.0675, -49.9025")).toEqual({ valido: true, lat: -6.0675, lng: -49.9025 });
    expect(tr.interpretarPonto("-6.0675 -49.9025")).toEqual({ valido: true, lat: -6.0675, lng: -49.9025 });
    expect(tr.interpretarPonto("https://maps.app.goo.gl/abc123").mensagem).toMatch(/link curto/);
    expect(tr.interpretarPonto("Rua A, 123").valido).toBe(false);
    expect(tr.interpretarPonto("").valido).toBe(false);
    expect(tr.interpretarPonto(5).valido).toBe(false);
    expect(tr.interpretarPonto("x".repeat(3001)).valido).toBe(false);
    expect(tr.interpretarPonto("%E0%A4%A").valido).toBe(false);   // codificação quebrada não derruba
  });

  test("distância em linha reta (haversine)", () => {
    expect(tr.distanciaKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.2, 1);
    expect(tr.distanciaKm({ lat: -6.0675, lng: -49.9025 }, { lat: -6.0675, lng: -49.9025 })).toBe(0);
    expect(tr.distanciaKm({ lat: null, lng: 1 }, { lat: 0, lng: 0 })).toBeNull();
    expect(tr.distanciaKm(null, { lat: 0, lng: 0 })).toBeNull();
  });
});

describe("bairros e raio", () => {
  test("validarBairro", () => {
    expect(tr.validarBairro({ nome: " Bairro da Paz ", cidade: "Parauapebas", uf: "pa" })).toEqual({ valido: true, bairro: { nome: "Bairro da Paz", cidade: "Parauapebas", uf: "PA", lat: null, lng: null } });
    expect(tr.validarBairro({ nome: "B", cidade: "Parauapebas", uf: "PA" }).valido).toBe(false);
    expect(tr.validarBairro({ nome: "Bairro", cidade: "Parauapebas", uf: "ZZ" }).valido).toBe(false);
    expect(tr.validarBairro({ nome: "Bairro", cidade: "Parauapebas", uf: "PA", lat: 1 }).valido).toBe(false);
    expect(tr.validarBairro(null).valido).toBe(false);
  });
  test("validarRaio: 0,1 a 100 km", () => {
    expect(tr.validarRaio(3)).toEqual({ valido: true, raio: 3 });
    expect(tr.validarRaio("2,5")).toEqual({ valido: true, raio: 2.5 });
    for (const ruim of [0, 0.05, 101, "abc", "", null, "1e1", -3]) expect(tr.validarRaio(ruim).valido).toBe(false);
  });
});

describe("cobertura e densidade", () => {
  // duas unidades a ~1 km uma da outra no eixo leste-oeste; 1 grau de longitude no equador ≈ 111 km
  const U = [{ chave: "C1", tipo: "CONGREGACAO", nome: "Sede", lat: 0, lng: 0 }, { chave: "E1", tipo: "EXTENSAO", nome: "Ext", lat: 0, lng: 0.01 }, { chave: "C2", tipo: "CONGREGACAO", nome: "Sem ponto", lat: null, lng: null }];
  const B = [
    { bairroId: 1, nome: "Perto", lat: 0, lng: 0.001, membros: 10 },
    { bairroId: 2, nome: "Longe", lat: 0, lng: 0.1, membros: 5 },
    { bairroId: 3, nome: "Sem ponto", lat: null, lng: null, membros: 4 },
    { bairroId: 4, nome: "Longe e vazio", lat: 0, lng: 0.2, membros: 0 }
  ];
  test("o mais perto, a distância e o descoberto (tem membros e nada dentro do raio)", () => {
    const c = tr.cobertura(B, U, 3);
    expect(c[0]).toMatchObject({ maisPerto: { chave: "C1" }, distanciaKm: 0.1, descoberto: false, semPonto: false });
    expect(c[1]).toMatchObject({ maisPerto: { chave: "E1" }, descoberto: true });
    expect(c[1].distanciaKm).toBeCloseTo(10, 0);
    expect(c[2]).toMatchObject({ semPonto: true, descoberto: false, maisPerto: null });
    expect(c[3].descoberto).toBe(false);   // sem membros não é descoberto
    expect(tr.cobertura(B, [], 3)[0].descoberto).toBe(true);   // nenhuma unidade com ponto: todo bairro com gente é descoberto
  });
  test("empate de distância decide pela chave (sempre o mesmo resultado)", () => {
    const m = tr.maisPerto({ lat: 0, lng: 0.005 }, [{ chave: "E1", lat: 0, lng: 0.01 }, { chave: "C1", lat: 0, lng: 0 }]);
    expect(m.unidade.chave).toBe("C1");
  });
  test("por unidade: localizados, distância média e quantos moram mais perto de outra", () => {
    const linhas = [
      { bairroId: 1, unidadeChave: "E1", membros: 6 },   // moram perto da Sede (0,1 km), mas vão à Extensão (0,9 km)
      { bairroId: 1, unidadeChave: "C1", membros: 4 },
      { bairroId: 3, unidadeChave: "C1", membros: 4 },   // bairro sem ponto: não entra
      { bairroId: 1, unidadeChave: "C2", membros: 2 },   // unidade sem ponto: não entra
      { bairroId: 99, unidadeChave: "C1", membros: 1 }   // bairro desconhecido: não entra
    ];
    const d = tr.densidadePorUnidade(linhas, B, U);
    const e1 = d.find((x) => x.chave === "E1"), c1 = d.find((x) => x.chave === "C1"), c2 = d.find((x) => x.chave === "C2");
    expect(e1).toMatchObject({ membrosLocalizados: 6, maisPertoDeOutra: 6, distanciaMediaKm: 1 });
    expect(c1).toMatchObject({ membrosLocalizados: 4, maisPertoDeOutra: 0, distanciaMediaKm: 0.1 });
    expect(c2).toMatchObject({ semPonto: true, membrosLocalizados: 0, distanciaMediaKm: null });
  });
});

describe("critérios da simulação", () => {
  test("validarCriterio: indicador da lista; sim/não só com \"precisa ser sim\"; número com valor", () => {
    expect(tr.validarCriterio({ indicador: "MEMBROS_EM_COMUNHAO", operador: "MINIMO", valor: "50" })).toEqual({ valido: true, criterio: { indicador: "MEMBROS_EM_COMUNHAO", operador: "MINIMO", valor: 50, ativo: true, ordem: 0, observacao: null } });
    expect(tr.validarCriterio({ indicador: "ENCARREGADO_EM_COMUNHAO", operador: "SIM", valor: 3 }).criterio.valor).toBeNull();
    expect(tr.validarCriterio({ indicador: "ENCARREGADO_EM_COMUNHAO", operador: "MINIMO", valor: 1 }).valido).toBe(false);
    expect(tr.validarCriterio({ indicador: "MEMBROS_EM_COMUNHAO", operador: "SIM" }).valido).toBe(false);
    expect(tr.validarCriterio({ indicador: "DIZIMO_MEDIO_12M", operador: "MINIMO", valor: "3000,50" }).criterio.valor).toBe(3000.5);
    expect(tr.validarCriterio({ indicador: "MEMBROS_EM_COMUNHAO", operador: "MINIMO", valor: 2.5 }).mensagem).toMatch(/inteiro/);
    expect(tr.validarCriterio({ indicador: "NIVEL_PSC_MAE", operador: "MINIMO", valor: 6 }).mensagem).toMatch(/até 5/);
    expect(tr.validarCriterio({ indicador: "DISTANCIA_MAE_KM", operador: "MAXIMO", valor: 1.5, ativo: "false", ordem: "12", observacao: " ok " }).criterio)
      .toEqual({ indicador: "DISTANCIA_MAE_KM", operador: "MAXIMO", valor: 1.5, ativo: false, ordem: 12, observacao: "ok" });
    for (const ruim of [{ indicador: "toString", operador: "MINIMO", valor: 1 }, { indicador: "__proto__", operador: "MINIMO", valor: 1 }, { indicador: "X", operador: "MINIMO", valor: 1 },
      { indicador: "OBREIROS", operador: "IGUAL", valor: 1 }, { indicador: "OBREIROS", operador: "MINIMO", valor: -1 }, { indicador: "OBREIROS", operador: "MINIMO", valor: "1e3" },
      { indicador: "OBREIROS", operador: "MINIMO" }, { indicador: "OBREIROS", operador: "MINIMO", valor: 1, ordem: 1000 }, { indicador: "OBREIROS", operador: "MINIMO", valor: 1, ordem: "1.5" },
      { indicador: "OBREIROS", operador: "MINIMO", valor: 1, observacao: "x".repeat(301) }, null, [1]]) {
      expect(tr.validarCriterio(ruim).valido).toBe(false);
    }
  });

  test("avaliarCriterio: atende, não atende ou sem dado (sem dado nunca conta como atendido)", () => {
    expect(tr.avaliarCriterio({ operador: "MINIMO", valor: 50 }, 50)).toBe("ATENDE");
    expect(tr.avaliarCriterio({ operador: "MINIMO", valor: 50 }, 49)).toBe("NAO_ATENDE");
    expect(tr.avaliarCriterio({ operador: "MAXIMO", valor: 5 }, 5)).toBe("ATENDE");
    expect(tr.avaliarCriterio({ operador: "MAXIMO", valor: 5 }, 5.1)).toBe("NAO_ATENDE");
    expect(tr.avaliarCriterio({ operador: "SIM" }, true)).toBe("ATENDE");
    expect(tr.avaliarCriterio({ operador: "SIM" }, false)).toBe("NAO_ATENDE");
    expect(tr.avaliarCriterio({ operador: "MINIMO", valor: 1 }, null)).toBe("SEM_DADO");
    expect(tr.avaliarCriterio({ operador: "MINIMO", valor: 1 }, NaN)).toBe("SEM_DADO");
    expect(tr.avaliarCriterio({ operador: "MINIMO", valor: 1 }, "5")).toBe("SEM_DADO");
  });

  test("avaliarExtensao: só os ativos, na ordem; a situação geral", () => {
    const C = [
      { criterioId: 2, indicador: "MEMBROS_EM_COMUNHAO", operador: "MINIMO", valor: 50, ativo: true, ordem: 20 },
      { criterioId: 1, indicador: "MESES_ABERTA", operador: "MINIMO", valor: 24, ativo: true, ordem: 10 },
      { criterioId: 3, indicador: "OBREIROS", operador: "MINIMO", valor: 1, ativo: false, ordem: 5 }
    ];
    const tudo = tr.avaliarExtensao(C, { MESES_ABERTA: 30, MEMBROS_EM_COMUNHAO: 60, OBREIROS: 0 });
    expect(tudo).toMatchObject({ situacao: "ATENDE_TUDO", atendidos: 2, total: 2 });
    expect(tudo.itens.map((i) => i.criterioId)).toEqual([1, 2]);
    expect(tr.avaliarExtensao(C, { MESES_ABERTA: null, MEMBROS_EM_COMUNHAO: 60 }).situacao).toBe("SEM_DADO");
    expect(tr.avaliarExtensao(C, { MESES_ABERTA: null, MEMBROS_EM_COMUNHAO: 10 }).situacao).toBe("NAO_ATENDE");
    expect(tr.avaliarExtensao([], {}).situacao).toBe("SEM_CRITERIOS");
    expect(tr.avaliarExtensao([{ ...C[2] }], {}).situacao).toBe("SEM_CRITERIOS");
  });
});

describe("datas", () => {
  test("meses completos desde a abertura", () => {
    expect(tr.mesesEntre("2024-03-15", "2026-03-15")).toBe(24);
    expect(tr.mesesEntre("2024-03-15", "2026-03-14")).toBe(23);
    expect(tr.mesesEntre("2026-12-01", "2026-11-06")).toBe(0);
    expect(tr.mesesEntre(null, "2026-11-06")).toBeNull();
  });
  test("os últimos 12 meses fechados (o mês corrente não entra), na virada do ano também", () => {
    expect(tr.janela12Meses("2026-11-06")).toEqual({ de: "2025-11", ate: "2026-10" });
    expect(tr.janela12Meses("2026-01-31")).toEqual({ de: "2025-01", ate: "2025-12" });
    expect(tr.janela12Meses("2026-12-01")).toEqual({ de: "2025-12", ate: "2026-11" });
  });
});
