// Mediação e Arbitragem — o aceite do acordo e do compromisso arbitral só nasce de ATO DA PARTE (fecho dos itens em aberto, 03/10/2026; migração 132).
// Antes, "Registrar Acordo"/"Registrar Compromisso" gravavam um aceite em nome de cada parte sem ato dela. Agora: o mediador/a Câmara só PROPÕE; a parte decide
// com a PRÓPRIA sessão, ou o mediador/árbitro/Câmara registra a decisão em papel COM o documento assinado anexado. O acordo só é firmado com as duas partes.
// Handler de verdade; banco simulado com estado (casos, aceites, termos), com transação.
let mockEstado;
let mockConsultas = [];
let mockTransacoes = [];
let mockFalhar = null;
jest.mock("../db", () => {
  const responder = (texto, i) => {
    const E = mockEstado;
    if (mockFalhar && mockFalhar.test(texto)) throw new Error("falha simulada");
    if (/FROM MediacoesArbitragens WITH \(UPDLOCK, HOLDLOCK\) WHERE MediacaoId = @id/.test(texto)) return E.casos[i.id] ? [{ ...E.casos[i.id] }] : [];
    if (/^\s*SELECT \* FROM MediacoesArbitragens WHERE MediacaoId = @id/.test(texto)) return E.casos[i.id] ? [{ ...E.casos[i.id] }] : [];
    if (/SELECT MediacaoId, ParteAId, ParteBId(, MediadorId)?/.test(texto)) return E.casos[i.id] ? [{ ...E.casos[i.id] }] : [];
    if (/WHERE m\.ParteAId = @eu OR m\.ParteBId = @eu/.test(texto)) return Object.values(E.casos).filter(c => c.ParteAId === i.eu || c.ParteBId === i.eu).map(c => ({ ...c }));
    if (/WHERE m\.MediacaoId = @id/.test(texto)) return E.casos[i.id] ? [{ mediacaoId: i.id, assunto: E.casos[i.id].Assunto, status: E.casos[i.id].Status, dataInstauracao: "2026-09-01", prazoDiasEncerramento: 60 }] : [];
    if (/INSERT INTO TermosAssinados/.test(texto)) { E.termos.push({ id: E.termos.length + 100, ...i }); return [{ TermoAssinadoId: E.termos.length + 99 }]; }
    if (/INSERT INTO AceitesMediacao/.test(texto)) { E.aceites.push({ aceiteMediacaoId: E.aceites.length + 1, mediacaoId: i.id, instrumento: i.inst, parte: i.parte, parteMembroId: i.parteMembroId, decisao: i.decisao, canal: i.canal, hashTexto: i.hash, termoAssinadoId: i.termo, registradoPorMembroId: i.por, anexoUrl: i.url, anexoHash: i.anexoHash, anexoNome: i.anexoNome, dataAssinaturaPresencial: i.dataAss, registradoEm: "2026-10-03T12:00:00Z" }); return []; }
    if (/FROM AceitesMediacao a LEFT JOIN/.test(texto)) return E.aceites.filter(a => a.mediacaoId === i.id).map(a => ({ ...a }));
    if (/SET AcordoTextoProposto = @texto/.test(texto)) { const c = E.casos[i.id]; if (!c || c.Status !== "MEDIACAO_EM_CURSO") return { afetadas: 0 }; Object.assign(c, { AcordoTextoProposto: i.texto, AcordoHashProposto: i.hash, AcordoPropostoEm: new Date("2026-10-01T12:00:00Z"), AcordoPropostoPor: i.por, AcordoSaidaPropostaId: i.saidaId }); return { afetadas: 1 }; }
    if (/SET CompromissoTextoProposto = @texto/.test(texto)) { Object.assign(E.casos[i.id], { CompromissoTextoProposto: i.texto, CompromissoHashProposto: i.hash, CompromissoPropostoEm: new Date("2026-10-01T12:00:00Z") }); return { afetadas: 1 }; }
    if (/SET Status = 'MEDIACAO_ACORDO'/.test(texto)) { Object.assign(E.casos[i.id], { Status: "MEDIACAO_ACORDO", TermoAcordoParteAAssinadoId: E.casos[i.id].TermoAcordoParteAAssinadoId || i.ta, TermoAcordoParteBAssinadoId: E.casos[i.id].TermoAcordoParteBAssinadoId || i.tb }); return { afetadas: 1 }; }
    if (/SET CompromissoFirmadoEm = SYSUTCDATETIME\(\)/.test(texto)) { Object.assign(E.casos[i.id], { CompromissoFirmadoEm: new Date() }); return { afetadas: 1 }; }
    if (/SELECT Nome FROM MembroReferencia WHERE MembroId = @id/.test(texto)) return [{ Nome: `Pessoa ${i.id}` }];
    if (/FROM SaidasTesouraria WHERE SaidaId = @s/.test(texto)) return i.s === 9 ? [{ SaidaId: 9 }] : [];
    return [];
  };
  const novoRequest = (transacao) => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs }, transacao: transacao ? transacao.id : null });
    const v = responder(texto, inputs);
    if (Array.isArray(v)) return { recordset: v, rowsAffected: [v.length] };
    return { recordset: [], rowsAffected: [v.afetadas] };
  } }; return r; };
  class Transaction {
    constructor() { this.id = mockTransacoes.length + 1; this.estado = "nova"; mockTransacoes.push(this); }
    async begin() { this.estado = "aberta"; this.copia = JSON.stringify(mockEstado); }
    async commit() { this.estado = "confirmada"; }
    async rollback() { this.estado = "desfeita"; const volta = JSON.parse(this.copia); for (const k of Object.keys(volta)) mockEstado[k] = volta[k]; }
  }
  return {
    getPool: async () => ({ request: () => novoRequest(null) }),
    sql: new Proxy({}, { get: (_a, k) => (k === "Transaction" ? Transaction : k === "Request" ? function (t) { return novoRequest(t); } : () => undefined) })
  };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), registrarAuditoriaNaTransacao: jest.fn(async () => true), sha256: (t) => require("crypto").createHash("sha256").update(t, "utf8").digest("hex") }));
jest.mock("../storage", () => ({ salvarDocumento: jest.fn(async () => "https://blob.exemplo/documentos/assinado-1"), excluirDocumento: jest.fn(async () => {}), urlDocumentoComSas: (u) => `${u}?sas` }));
jest.mock("../canaisDb", () => ({ notificarAgora: jest.fn(async () => ({ criadas: 1 })) }));

const crypto = require("crypto");
const auth = require("../auth");
const storage = require("../storage");
const { notificarAgora } = require("../canaisDb");
const { registrarAuditoriaNaTransacao } = require("../auditoria");
const med = require("../mediacaoArbitragem");
const h = require("../../GestaoMediacoesArbitragens/index.js");

const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
const PIN = (membroId) => tokenDe(membroId, { via: "PIN" });                                  // sessão de membro (matrícula + PIN)
const CAMARA = (membroId = 50) => tokenDe(membroId, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["mediacao"] });
const PDF = Buffer.from("%PDF-1.4 termo assinado pelas partes").toString("base64");

async function chamar({ metodo = "PUT", ligado = { id: "7" }, corpo = {}, token } = {}) {
  const context = { bindingData: ligado, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await h(context, { method: metodo, query: {}, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const propor = (resumoAcordo = "A Sede devolve R$ 1.000,00 à congregação até 30/11.", token = CAMARA()) => chamar({ corpo: { acao: "REGISTRAR_ACORDO", resumoAcordo }, token });
const decidir = (token, corpo, id = "7") => chamar({ metodo: "POST", ligado: { id, acao: "decisao" }, corpo, token });
const presencial = (token, corpo, id = "7") => chamar({ metodo: "POST", ligado: { id, acao: "decisao-presencial" }, token,
  corpo: { instrumento: "ACORDO", parte: "B", decisao: "ACEITE", dataAssinatura: "2026-10-02", documentoBase64: PDF, mimeType: "application/pdf", nomeArquivo: "termo.pdf", ...corpo } });
const escritas = () => mockConsultas.filter(c => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(c.sql));

beforeEach(() => {
  mockEstado = {
    casos: {
      7: { MediacaoId: 7, Assunto: "Repasse", ParteAId: 20, ParteBId: 21, MediadorId: 60, ArbitroId: null, Status: "MEDIACAO_EM_CURSO" },
      8: { MediacaoId: 8, Assunto: "Imóvel", ParteAId: 20, ParteBId: null, ParteBDescricao: "Congregação Sede", MediadorId: 60, Status: "MEDIACAO_EM_CURSO" },
      9: { MediacaoId: 9, Assunto: "Veículo", ParteAId: 20, ParteBId: 21, MediadorId: 60, ArbitroId: 61, Status: "ARBITRAGEM_EM_CURSO" },
      // caso antigo: encerrado com acordo pelo fluxo velho, com os aceites gravados sem ato das partes
      10: { MediacaoId: 10, Assunto: "Antigo", ParteAId: 20, ParteBId: 21, MediadorId: 60, Status: "MEDIACAO_ACORDO", TermoAcordoParteAAssinadoId: 1, TermoAcordoParteBAssinadoId: 2 }
    },
    aceites: [
      { aceiteMediacaoId: 1, mediacaoId: 10, instrumento: "ACORDO", parte: "A", parteMembroId: 20, decisao: "ACEITE", canal: "LEGADO_NAO_VERIFICADO", hashTexto: null, termoAssinadoId: 1, registradoPorMembroId: null },
      { aceiteMediacaoId: 2, mediacaoId: 10, instrumento: "ACORDO", parte: "B", parteMembroId: 21, decisao: "ACEITE", canal: "LEGADO_NAO_VERIFICADO", hashTexto: null, termoAssinadoId: 2, registradoPorMembroId: null }
    ],
    termos: []
  };
  mockConsultas = [];
  mockTransacoes = [];
  mockFalhar = null;
  storage.salvarDocumento.mockClear();
  storage.excluirDocumento.mockClear();
  notificarAgora.mockClear();
  registrarAuditoriaNaTransacao.mockClear();
});

describe("propor não é aceitar", () => {
  test("REGISTRAR_ACORDO só propõe: nenhum termo em nome das partes, nenhuma decisão gravada, a mediação continua em curso e as partes são avisadas", async () => {
    const r = await propor();
    expect(r.body.sucesso).toBe(true);
    expect(r.body.hashTexto).toMatch(/^[0-9a-f]{64}$/);
    expect(mockEstado.termos).toHaveLength(0);
    expect(mockEstado.aceites.filter(a => a.mediacaoId === 7)).toHaveLength(0);
    expect(mockEstado.casos[7].Status).toBe("MEDIACAO_EM_CURSO");
    expect(mockEstado.casos[7].AcordoTextoProposto).toMatch(/Termo de Acordo de Mediação nº 7 .*A Sede devolve/);
    expect(rodouTermos()).toHaveLength(0);
    expect(notificarAgora).toHaveBeenCalledTimes(1);
    expect(notificarAgora.mock.calls[0][1]).toMatchObject({ regraChave: "MEDIACAO_DECISAO_PENDENTE", referenciaId: 7 });
  });
  test("REGISTRAR_COMPROMISSO_ARBITRAL só propõe (texto com o árbitro); nada é gravado em nome das partes", async () => {
    const r = await chamar({ ligado: { id: "9" }, corpo: { acao: "REGISTRAR_COMPROMISSO_ARBITRAL" }, token: CAMARA() });
    expect(r.body.sucesso).toBe(true);
    expect(mockEstado.casos[9].CompromissoTextoProposto).toMatch(/árbitro Pessoa 61/);
    expect(mockEstado.casos[9].CompromissoFirmadoEm).toBeUndefined();
    expect(mockEstado.termos).toHaveLength(0);
    expect(mockEstado.aceites.filter(a => a.mediacaoId === 9)).toHaveLength(0);
  });
});
const rodouTermos = () => mockConsultas.filter(c => /INSERT INTO TermosAssinados/.test(c.sql));

describe("a parte decide com a PRÓPRIA sessão", () => {
  test("parte A aceita: canal PROPRIO, registrado por ela, termo em nome dela; o acordo ainda NÃO está firmado", async () => {
    const hash = (await propor()).body.hashTexto;
    const r = await decidir(PIN(20), { instrumento: "ACORDO", decisao: "ACEITE", hashTexto: hash });
    expect(r.body).toMatchObject({ sucesso: true, firmado: false });
    expect(r.body.mensagem).toMatch(/só é firmado quando a outra parte também aceitar/);
    const a = mockEstado.aceites.filter(x => x.mediacaoId === 7);
    expect(a).toEqual([expect.objectContaining({ parte: "A", parteMembroId: 20, decisao: "ACEITE", canal: "PROPRIO", registradoPorMembroId: 20, hashTexto: hash, anexoUrl: null })]);
    expect(mockEstado.termos).toEqual([expect.objectContaining({ membroId: 20, tipo: "ACORDO_MEDIACAO" })]);
    expect(mockEstado.casos[7].Status).toBe("MEDIACAO_EM_CURSO");
    expect(mockTransacoes.map(t => t.estado)).toEqual(["confirmada"]);
    for (const c of escritas().filter(c => /AceitesMediacao|TermosAssinados/.test(c.sql))) expect(c.transacao).toBe(1);
    expect(registrarAuditoriaNaTransacao).toHaveBeenCalledTimes(1);
  });
  test("as DUAS partes aceitam o mesmo texto: acordo firmado (MEDIACAO_ACORDO) com o termo de cada uma", async () => {
    const hash = (await propor()).body.hashTexto;
    await decidir(PIN(20), { instrumento: "ACORDO", decisao: "ACEITE", hashTexto: hash });
    const r = await decidir(PIN(21), { instrumento: "ACORDO", decisao: "ACEITE", hashTexto: hash });
    expect(r.body).toMatchObject({ sucesso: true, firmado: true });
    expect(mockEstado.casos[7].Status).toBe("MEDIACAO_ACORDO");
    expect(mockEstado.casos[7].TermoAcordoParteAAssinadoId).toBeTruthy();
    expect(mockEstado.casos[7].TermoAcordoParteBAssinadoId).toBeTruthy();
    // depois de firmado não há mais decisão
    expect((await decidir(PIN(21), { instrumento: "ACORDO", decisao: "RECUSA", hashTexto: hash })).body.sucesso).toBe(false);
  });
  test("recusa da parte é registrada e o acordo não é firmado (mesmo com a outra aceitando)", async () => {
    const hash = (await propor()).body.hashTexto;
    await decidir(PIN(20), { instrumento: "ACORDO", decisao: "ACEITE", hashTexto: hash });
    const r = await decidir(PIN(21), { instrumento: "ACORDO", decisao: "RECUSA", hashTexto: hash });
    expect(r.body).toMatchObject({ sucesso: true, firmado: false, recusadoPor: ["B"] });
    expect(r.body.mensagem).toMatch(/Recusa registrada/);
    expect(mockEstado.casos[7].Status).toBe("MEDIACAO_EM_CURSO");
    expect(mockEstado.termos.filter(t => t.membroId === 21)).toHaveLength(0);       // recusa não gera termo
  });
  test("o MEDIADOR, a Câmara ou qualquer não-parte NÃO decide pela parte por aqui: mesma resposta de caso inexistente, nada gravado", async () => {
    const hash = (await propor()).body.hashTexto;
    mockConsultas = [];
    for (const token of [PIN(60), CAMARA(50), PIN(99)]) {
      expect(await decidir(token, { instrumento: "ACORDO", decisao: "ACEITE", hashTexto: hash })).toEqual({ status: 200, body: { sucesso: false, mensagem: "Caso não encontrado." } });
    }
    expect(await decidir(PIN(20), { instrumento: "ACORDO", decisao: "ACEITE", hashTexto: hash }, "999")).toEqual({ status: 200, body: { sucesso: false, mensagem: "Caso não encontrado." } });
    expect(escritas()).toHaveLength(0);
    expect(mockTransacoes).toHaveLength(0);
  });
  test("sem sessão: 401; corpo malformado: 400 sem tocar no banco", async () => {
    expect((await decidir(undefined, { instrumento: "ACORDO", decisao: "ACEITE", hashTexto: "a".repeat(64) })).status).toBe(401);
    for (const corpo of [{}, { instrumento: "OUTRO", decisao: "ACEITE", hashTexto: "a".repeat(64) }, { instrumento: "ACORDO", decisao: "TALVEZ", hashTexto: "a".repeat(64) }, { instrumento: "ACORDO", decisao: "ACEITE", hashTexto: "curto" }]) {
      expect((await decidir(PIN(20), corpo)).status).toBe(400);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("o texto mudou (outro hash): recusado, nada gravado; propor texto NOVO faz o aceite antigo deixar de contar", async () => {
    const hash1 = (await propor("Texto um.")).body.hashTexto;
    expect((await decidir(PIN(20), { instrumento: "ACORDO", decisao: "ACEITE", hashTexto: "f".repeat(64) })).body).toMatchObject({ sucesso: false, textoMudou: true });
    expect(mockEstado.aceites.filter(a => a.mediacaoId === 7)).toHaveLength(0);
    await decidir(PIN(20), { instrumento: "ACORDO", decisao: "ACEITE", hashTexto: hash1 });
    const hash2 = (await propor("Texto dois.")).body.hashTexto;
    expect(hash2).not.toBe(hash1);
    const r = await decidir(PIN(21), { instrumento: "ACORDO", decisao: "ACEITE", hashTexto: hash2 });
    expect(r.body.firmado).toBe(false);                                                   // o aceite de A era do texto um
    expect(mockEstado.casos[7].Status).toBe("MEDIACAO_EM_CURSO");
    expect((await decidir(PIN(20), { instrumento: "ACORDO", decisao: "ACEITE", hashTexto: hash2 })).body.firmado).toBe(true);
  });
  test("falha no meio (ao gravar a decisão): a transação é desfeita e nada fica (nem o termo)", async () => {
    const hash = (await propor()).body.hashTexto;
    mockFalhar = /INSERT INTO AceitesMediacao/;
    await expect(decidir(PIN(20), { instrumento: "ACORDO", decisao: "ACEITE", hashTexto: hash })).rejects.toThrow("falha simulada");
    expect(mockTransacoes.map(t => t.estado)).toEqual(["desfeita"]);
    expect(mockEstado.termos).toHaveLength(0);
    expect(mockEstado.aceites.filter(a => a.mediacaoId === 7)).toHaveLength(0);
  });
  test("compromisso arbitral: só firmado quando as duas partes aceitam", async () => {
    const hash = (await chamar({ ligado: { id: "9" }, corpo: { acao: "REGISTRAR_COMPROMISSO_ARBITRAL" }, token: CAMARA() })).body.hashTexto;
    expect((await decidir(PIN(20), { instrumento: "COMPROMISSO", decisao: "ACEITE", hashTexto: hash }, "9")).body.firmado).toBe(false);
    expect(mockEstado.casos[9].CompromissoFirmadoEm).toBeUndefined();
    expect((await decidir(PIN(21), { instrumento: "COMPROMISSO", decisao: "ACEITE", hashTexto: hash }, "9")).body.firmado).toBe(true);
    expect(mockEstado.casos[9].CompromissoFirmadoEm).toBeInstanceOf(Date);
    expect(mockEstado.termos.map(t => t.tipo)).toEqual(["COMPROMISSO_ARBITRAL", "COMPROMISSO_ARBITRAL"]);
  });
});

describe("registro presencial: só com o documento assinado anexado", () => {
  test("sem anexo, com conteúdo que não é do tipo declarado, ou data futura/anterior à proposta: 400, nada gravado nem enviado ao armazenamento", async () => {
    const hash = (await propor()).body.hashTexto;
    mockConsultas = [];
    for (const extra of [{ documentoBase64: undefined }, { documentoBase64: Buffer.from("não é pdf").toString("base64") }, { mimeType: "text/plain" }, { dataAssinatura: "2099-01-01" }, { dataAssinatura: "2026-09-01" }, { dataAssinatura: "ontem" }]) {
      expect((await presencial(CAMARA(), { hashTexto: hash, ...extra })).status).toBe(400);
    }
    expect(storage.salvarDocumento).not.toHaveBeenCalled();
    expect(escritas()).toHaveLength(0);
  });
  test("com o anexo: canal PRESENCIAL_ANEXO, quem registrou, a data da assinatura e o hash do arquivo; SEM termo eletrônico em nome da parte", async () => {
    const hash = (await propor()).body.hashTexto;
    const r = await presencial(CAMARA(50), { hashTexto: hash });
    expect(r.body).toMatchObject({ sucesso: true, firmado: false });
    const a = mockEstado.aceites.filter(x => x.mediacaoId === 7);
    expect(a).toEqual([expect.objectContaining({ parte: "B", parteMembroId: 21, canal: "PRESENCIAL_ANEXO", registradoPorMembroId: 50, dataAssinaturaPresencial: "2026-10-02",
      anexoUrl: "https://blob.exemplo/documentos/assinado-1", anexoHash: crypto.createHash("sha256").update(Buffer.from(PDF, "base64")).digest("hex"), anexoNome: "termo.pdf" })]);
    expect(mockEstado.termos).toHaveLength(0);
  });
  test("o mediador DESIGNADO registra sem a permissão 'mediacao'; outro membro sem ela não (mesma resposta de caso inexistente)", async () => {
    const hash = (await propor()).body.hashTexto;
    expect((await presencial(PIN(99), { hashTexto: hash })).body).toEqual({ sucesso: false, mensagem: "Caso não encontrado." });
    expect((await presencial(PIN(60), { hashTexto: hash })).body.sucesso).toBe(true);
    // o árbitro do caso não registra o ACORDO (só o compromisso)
    mockEstado.casos[7].ArbitroId = 61;
    expect((await presencial(PIN(61), { hashTexto: hash, parte: "A" })).body).toEqual({ sucesso: false, mensagem: "Caso não encontrado." });
  });
  test("quem é PARTE não registra presencial (nem a própria decisão, nem a da outra parte): 403", async () => {
    const hash = (await propor()).body.hashTexto;
    const comoParte = tokenDe(20, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["mediacao"] });
    for (const parte of ["A", "B"]) expect((await presencial(comoParte, { hashTexto: hash, parte })).status).toBe(403);
    expect(mockEstado.aceites.filter(a => a.mediacaoId === 7)).toHaveLength(0);
  });
  test("parte que não é membro (congregação descrita) só decide pelo presencial; com a outra parte aceitando pela própria sessão, o acordo é firmado", async () => {
    const hash = (await chamar({ ligado: { id: "8" }, corpo: { acao: "REGISTRAR_ACORDO", resumoAcordo: "Divisão do imóvel." }, token: CAMARA() })).body.hashTexto;
    expect((await decidir(PIN(20), { instrumento: "ACORDO", decisao: "ACEITE", hashTexto: hash }, "8")).body.firmado).toBe(false);
    const r = await presencial(CAMARA(), { hashTexto: hash, parte: "B" }, "8");
    expect(r.body.firmado).toBe(true);
    expect(mockEstado.casos[8].Status).toBe("MEDIACAO_ACORDO");
    expect(mockEstado.aceites.find(a => a.mediacaoId === 8 && a.parte === "B")).toMatchObject({ parteMembroId: null, canal: "PRESENCIAL_ANEXO" });
  });
  test("falha na transação depois do upload: o arquivo é apagado do armazenamento (não fica órfão)", async () => {
    const hash = (await propor()).body.hashTexto;
    mockFalhar = /INSERT INTO AceitesMediacao/;
    await expect(presencial(CAMARA(), { hashTexto: hash })).rejects.toThrow("falha simulada");
    expect(storage.excluirDocumento).toHaveBeenCalledWith("https://blob.exemplo/documentos/assinado-1");
    expect(mockTransacoes.map(t => t.estado)).toEqual(["desfeita"]);
  });
});

describe("o que a tela mostra", () => {
  test("detalhe (Câmara): o canal e o autor de cada decisão, o link do documento; os aceites antigos marcados 'registrado antes da verificação'", async () => {
    const hash = (await propor()).body.hashTexto;
    await decidir(PIN(20), { instrumento: "ACORDO", decisao: "ACEITE", hashTexto: hash });
    await presencial(CAMARA(50), { hashTexto: hash });
    const d = (await chamar({ metodo: "GET", token: CAMARA() })).body;
    expect(d.acordo).toMatchObject({ proposto: true, hashTexto: hash, firmado: true });
    expect(d.acordo.partes.A).toMatchObject({ canal: "PROPRIO", rotuloCanal: "pela própria parte, com a sessão dela", registradoPorNome: null });
    expect(d.acordo.partes.B).toMatchObject({ canal: "PRESENCIAL_ANEXO", rotuloCanal: "presencial, com o documento assinado anexado", anexoUrl: "https://blob.exemplo/documentos/assinado-1?sas" });
    const antigo = (await chamar({ metodo: "GET", ligado: { id: "10" }, token: CAMARA() })).body;
    expect(antigo.acordo.firmadoAntesDaVerificacao).toBe(true);
    expect(antigo.acordo.legado.map(l => l.rotuloCanal)).toEqual(["registrado antes da verificação por ato da parte", "registrado antes da verificação por ato da parte"]);
    expect(antigo.acordo.firmado).toBe(false);
  });
  test("Minhas (a parte): o texto a decidir e o que falta, sem o documento anexado; quem não é parte não vê o caso", async () => {
    await propor();
    const minhas = (await chamar({ metodo: "GET", ligado: { id: "minhas" }, token: PIN(21) })).body;
    const caso = minhas.casos.find(c => c.mediacaoId === 7);
    expect(caso).toMatchObject({ minhasPartes: ["B"], podeDecidirAcordo: true });
    expect(caso.acordo).toMatchObject({ proposto: true, aguardaMinhaDecisao: true });
    expect(caso.acordo.texto).toMatch(/A Sede devolve/);
    expect(JSON.stringify(minhas)).not.toMatch(/anexoUrl/);
    expect((await chamar({ metodo: "GET", ligado: { id: "minhas" }, token: PIN(99) })).body.casos).toEqual([]);
    expect((await chamar({ metodo: "GET", ligado: { id: "minhas" } })).status).toBe(401);
  });
});

describe("situacaoInstrumento (regra pura)", () => {
  const linha = (id, parte, decisao, canal, hashTexto) => ({ aceiteMediacaoId: id, instrumento: "ACORDO", parte, decisao, canal, hashTexto });
  test("vale a decisão MAIS RECENTE de cada parte sobre o texto ATUAL, pelos canais válidos; legado e texto antigo não contam", () => {
    const s = med.situacaoInstrumento([
      linha(1, "A", "ACEITE", "LEGADO_NAO_VERIFICADO", null), linha(2, "B", "ACEITE", "PROPRIO", "h0"),
      linha(3, "A", "RECUSA", "PROPRIO", "h1"), linha(4, "A", "ACEITE", "PROPRIO", "h1"), linha(5, "B", "ACEITE", "PRESENCIAL_ANEXO", "h1")
    ], { instrumento: "ACORDO", hashAtual: "h1" });
    expect(s.firmado).toBe(true);
    expect(s.partes.A.aceiteMediacaoId).toBe(4);
    expect(s.legado).toHaveLength(1);
    expect(med.situacaoInstrumento([linha(1, "A", "ACEITE", "LEGADO_NAO_VERIFICADO", null), linha(2, "B", "ACEITE", "LEGADO_NAO_VERIFICADO", null)], { instrumento: "ACORDO", hashAtual: null }).firmado).toBe(false);
    expect(med.situacaoInstrumento([linha(1, "A", "ACEITE", "PROPRIO", "h1")], { instrumento: "ACORDO", hashAtual: "h1" }).firmado).toBe(false);
    // canal LEGADO nunca vale como decisão, mesmo que a linha trouxesse o hash do texto atual
    const comLegado = med.situacaoInstrumento([linha(1, "A", "ACEITE", "PROPRIO", "h1"), linha(2, "B", "ACEITE", "LEGADO_NAO_VERIFICADO", "h1")], { instrumento: "ACORDO", hashAtual: "h1" });
    expect(comLegado.firmado).toBe(false);
    expect(comLegado.partes.B).toBeNull();
  });
});
