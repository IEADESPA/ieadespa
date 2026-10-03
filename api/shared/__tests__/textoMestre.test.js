// Testes do Texto Mestre Consolidado (vB.15, Art. 162 §§2º-4º e 162-B).
const { criarPoolFalso } = require("./testUtils");
const textoMestre = require("../textoMestre");

describe("versaoVigenteEm", () => {
  test("devolve a versão vigente numa data", async () => {
    const { pool } = criarPoolFalso([[{ versaoId: 3, numeroVersao: 3, urlBlob: "x", dataVigencia: "2026-01-01", documentoOrigemId: null, totalArtigos: null, artigosTocados: null }]]);
    const v = await textoMestre.versaoVigenteEm(pool, "2026-06-01");
    expect(v.numeroVersao).toBe(3);
  });
  test("nenhuma versão vigente ainda -> null", async () => {
    const { pool } = criarPoolFalso([[]]);
    const v = await textoMestre.versaoVigenteEm(pool, "2020-01-01");
    expect(v).toBeNull();
  });
});

describe("alteracoesRegimentoPendentes (Art. 162 §2º — prazo de 48h)", () => {
  test("alteração registrada há mais de 2 dias sem consolidação: prazo vencido", async () => {
    const { pool } = criarPoolFalso([[{ documentoId: 1, descricao: "Alteração X", registradoEm: "2026-01-01" }]]);
    const pendentes = await textoMestre.alteracoesRegimentoPendentes(pool, "2026-01-10");
    expect(pendentes).toHaveLength(1);
    expect(pendentes[0].prazoVencido).toBe(true);
  });
  test("alteração recém-registrada (dentro de 48h): não vencido", async () => {
    const { pool } = criarPoolFalso([[{ documentoId: 1, descricao: "Alteração X", registradoEm: "2026-01-09" }]]);
    const pendentes = await textoMestre.alteracoesRegimentoPendentes(pool, "2026-01-10");
    expect(pendentes[0].prazoVencido).toBe(false);
  });
});

describe("avaliarLimiar30Porcento (Art. 162 §§3º-4º)", () => {
  test("acima de 30% exige registro integral", () => {
    const r = textoMestre.avaliarLimiar30Porcento(10, 4);
    expect(r.exigeRegistroIntegral).toBe(true);
  });
  test("30% exato ou abaixo não exige", () => {
    const r = textoMestre.avaliarLimiar30Porcento(10, 3);
    expect(r.exigeRegistroIntegral).toBe(false);
  });
  test("sem contagem informada, nunca assume", () => {
    const r = textoMestre.avaliarLimiar30Porcento(null, null);
    expect(r.exigeRegistroIntegral).toBe(false);
    expect(r.percentual).toBeNull();
  });
});

describe("registrarVersao", () => {
  test("calcula o próximo número de versão sequencial", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ proximo: 5 }], [{ VersaoId: 20 }]]);
    const r = await textoMestre.registrarVersao(pool, { urlBlob: "x", dataVigencia: "2026-01-01", registradoPor: 1 });
    expect(r.numeroVersao).toBe(5);
    expect(r.versaoId).toBe(20);
    expect(chamadas).toHaveLength(2);
  });
});

describe("situacaoRevisaoQuadrienal (Art. 162-B)", () => {
  test("sem baseline definida", async () => {
    const { pool } = criarPoolFalso([[{ data: null }]]);
    const r = await textoMestre.situacaoRevisaoQuadrienal(pool, "2026-01-01");
    expect(r.definida).toBe(false);
  });
  test("dentro da antecedência de 180 dias: alerta", async () => {
    const { pool } = criarPoolFalso([[{ data: "2022-08-01" }]]); // +4 anos = 2026-08-01
    const r = await textoMestre.situacaoRevisaoQuadrienal(pool, "2026-06-01");
    expect(r.definida).toBe(true);
    expect(r.dentroAntecedencia).toBe(true);
    expect(r.vencida).toBe(false);
  });
  test("já vencida", async () => {
    const { pool } = criarPoolFalso([[{ data: "2020-01-01" }]]); // +4 anos = 2024-01-01
    const r = await textoMestre.situacaoRevisaoQuadrienal(pool, "2026-01-01");
    expect(r.vencida).toBe(true);
  });
});
