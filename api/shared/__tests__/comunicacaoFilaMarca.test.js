// v7.12 — a marca da fila de comunicados no Storage (shared/comunicacaoFilaMarca.js): uma gravação lenta de "0" nunca apaga a marca de um envio novo (revisão independente,
// 22/10/2026), a gravação é condicional (ETag) e, na falha, a marca vira "não sei" (a rotina abre o banco).
const marca = require("../comunicacaoFilaMarca");

function storageFalso() {
  const st = { blob: null, versao: 0, gravacoes: 0, conflitarProxima: 0, quebrar: false };
  st.lerJsonPrivadoComVersao = async () => (st.blob ? { dados: JSON.parse(JSON.stringify(st.blob)), etag: `v${st.versao}` } : null);
  st.salvarJsonPrivadoSe = async (_n, objeto, etag) => {
    if (st.quebrar) throw new Error("Storage fora do ar");
    if (st.conflitarProxima > 0) { st.conflitarProxima--; st.versao++; const c = new Error("mudou"); c.conflito = true; throw c; }
    if ((etag === null && st.blob) || (etag !== null && etag !== `v${st.versao}`)) { const c = new Error("mudou"); c.conflito = true; throw c; }
    st.blob = objeto; st.versao++; st.gravacoes++;
  };
  st.salvarJsonPrivado = async (_n, objeto) => { st.blob = objeto; st.versao++; };
  return st;
}
const erroOriginal = console.error;
beforeAll(() => { console.error = () => { }; });
afterAll(() => { console.error = erroOriginal; });

test("grava a contagem com o seq; uma contagem com seq MENOR (gravação atrasada) não volta atrás", async () => {
  const st = storageFalso();
  await marca.gravar(5, 120, { storage: st });
  expect(st.blob).toMatchObject({ pendentes: 5, seq: 120 });
  await marca.gravar(0, 100, { storage: st });               // a rodada que contou 0 antes do envio novo chega depois
  expect(st.blob).toMatchObject({ pendentes: 5, seq: 120 });
  await marca.gravar(0, 120, { storage: st });               // a rodada que viu o envio novo e esvaziou a fila
  expect(st.blob).toMatchObject({ pendentes: 0, seq: 120 });
});
test("alguém gravou no meio: relê e decide de novo", async () => {
  const st = storageFalso();
  await marca.gravar(3, 10, { storage: st });
  st.conflitarProxima = 1;
  expect(await marca.gravar(2, 11, { storage: st })).toBe(true);
  expect(st.blob).toMatchObject({ pendentes: 2, seq: 11 });
});
test("Storage fora do ar: a marca vira \"não sei\" (nunca fica um 0 velho)", async () => {
  const st = storageFalso();
  await marca.gravar(0, 10, { storage: st });
  st.quebrar = true;
  expect(await marca.gravar(4, 20, { storage: st })).toBe(false);
  expect(st.blob.pendentes).toBeNull();
});
test("invalidar (pendentes null) sempre entra, mesmo com seq menor", async () => {
  const st = storageFalso();
  await marca.gravar(0, 50, { storage: st });
  await marca.gravar(null, 0, { storage: st });
  expect(st.blob.pendentes).toBeNull();
});
