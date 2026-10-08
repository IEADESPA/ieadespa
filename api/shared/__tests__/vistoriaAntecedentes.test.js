// Regra pura do Termo de Vistoria de antecedentes (v7.6): o que o Regimento Art. 133 §5º manda guardar (data, hash, parecer, assinatura) e o que proíbe (cópia da
// certidão). O hash chega pronto do aparelho de quem confere; o sistema só confere que é um SHA-256 em hexadecimal.
const crypto = require("crypto");
const va = require("../vistoriaAntecedentes");

const HOJE = "2026-10-08";
const hashDe = (txt) => crypto.createHash("sha256").update(txt).digest("hex");
const doc = (extra = {}) => ({ tipo: "ANTECEDENTES_FEDERAL", hash: hashDe("certidao 1"), dataEmissao: "2026-10-05", ...extra });
const base = (extra = {}) => ({
  membroId: 20, motivo: "INVESTIDURA", funcao: "Professor da EBD infantil", comVulneraveis: true, dataVerificacao: "2026-10-08", resultado: "SEM_RESTRICAO",
  parecer: "Certidões sem apontamentos; apto à função.", destinoOriginal: "DEVOLVIDO", documentos: [doc()], ...extra
});

describe("o hash da certidão", () => {
  test("só vale SHA-256 em hexadecimal de 64 caracteres; maiúsculas são aceitas e guardadas em minúsculas", () => {
    const h = hashDe("x");
    expect(va.validarHash(h)).toEqual({ valido: true, hash: h });
    expect(va.validarHash(h.toUpperCase())).toEqual({ valido: true, hash: h });
    expect(va.validarHash(`  ${h}  `).hash).toBe(h);
    for (const ruim of ["", "abc", h.slice(1), h + "0", "g".repeat(64), "0x" + "a".repeat(62), "<b>" + "a".repeat(61), null, undefined, 12345, ["a".repeat(64)]]) expect(va.validarHash(ruim).valido).toBe(false);
  });
});

describe("lavrar o Termo de Vistoria", () => {
  test("o termo completo sai normalizado, com as certidões em minúsculas", () => {
    const v = va.validarVistoria(base({ documentos: [doc({ hash: hashDe("a").toUpperCase(), tipo: "distribuicao_civel" })] }), { hoje: HOJE, atorId: 1 });
    expect(v.valido).toBe(true);
    expect(v.dados).toMatchObject({ membroId: 20, motivo: "INVESTIDURA", resultado: "SEM_RESTRICAO", destinoOriginal: "DEVOLVIDO", comVulneraveis: true });
    expect(v.dados.documentos).toEqual([{ tipo: "DISTRIBUICAO_CIVEL", hash: hashDe("a"), dataEmissao: "2026-10-05" }]);
  });
  test("ninguém assina a própria vistoria", () => {
    const v = va.validarVistoria(base({ membroId: 1 }), { hoje: HOJE, atorId: 1 });
    expect(v.valido).toBe(false);
    expect(v.mensagem).toMatch(/própria vistoria/);
  });
  test("exige o que o Regimento manda arquivar: a data, o parecer, o destino do original e ao menos uma certidão", () => {
    const f = (extra) => va.validarVistoria(base(extra), { hoje: HOJE, atorId: 1 });
    expect(f({ dataVerificacao: "" }).valido).toBe(false);
    expect(f({ dataVerificacao: "2026-10-09" }).valido).toBe(false);                    // futuro
    expect(f({ dataVerificacao: "1999-12-31" }).valido).toBe(false);
    expect(f({ dataVerificacao: "2026-02-30" }).valido).toBe(false);                    // data que não existe
    expect(f({ parecer: "" }).valido).toBe(false);
    expect(f({ parecer: "curto" }).valido).toBe(false);
    expect(f({ parecer: "x".repeat(1001) }).valido).toBe(false);
    expect(f({ destinoOriginal: "" }).mensagem).toMatch(/original/);
    expect(f({ destinoOriginal: "GUARDADO" }).valido).toBe(false);                      // a Igreja não guarda cópia
    expect(f({ destinoOriginal: "DESCARTADO" }).valido).toBe(true);
    expect(f({ documentos: [] }).valido).toBe(false);
    expect(f({ documentos: undefined }).valido).toBe(false);
  });
  test("a certidão: tipo da lista, hash válido, data de emissão que existe e não é futura, sem repetir o mesmo documento", () => {
    const f = (documentos) => va.validarVistoria(base({ documentos }), { hoje: HOJE, atorId: 1 });
    expect(f([doc({ tipo: "OUTRO" })]).valido).toBe(true);
    expect(f([doc({ tipo: "CPF" })]).valido).toBe(false);
    expect(f([doc({ hash: "abc" })]).valido).toBe(false);
    expect(f([doc({ dataEmissao: "2026-10-09" })]).valido).toBe(false);
    expect(f([doc({ dataEmissao: "" })]).valido).toBe(false);
    expect(f([doc(), doc({ tipo: "DISTRIBUICAO_CIVEL" })]).valido).toBe(false);          // o mesmo hash duas vezes
    expect(f([doc(), doc({ hash: hashDe("b"), tipo: "DISTRIBUICAO_CIVEL" })]).valido).toBe(true);
    expect(f(Array.from({ length: va.MAX_DOCUMENTOS + 1 }, (_, i) => doc({ hash: hashDe(String(i)) }))).valido).toBe(false);
    expect(f(Array.from({ length: va.MAX_DOCUMENTOS }, (_, i) => doc({ hash: hashDe(String(i)) }))).valido).toBe(true);
    expect(f([null]).valido).toBe(false);
    expect(f(["a".repeat(64)]).valido).toBe(false);
    expect(f("não é lista").valido).toBe(false);
    expect(f({ 0: doc() }).valido).toBe(false);
  });
  test("a recusa não tem certidão nem destino do original: quem recusou não apresentou nada", () => {
    const v = va.validarVistoria(base({ resultado: "RECUSA", documentos: [], destinoOriginal: undefined, parecer: "Recusou apresentar; afastado preventivamente." }), { hoje: HOJE, atorId: 1 });
    expect(v.valido).toBe(true);
    expect(v.dados).toMatchObject({ resultado: "RECUSA", destinoOriginal: null, documentos: [] });
    expect(va.validarVistoria(base({ resultado: "RECUSA" }), { hoje: HOJE, atorId: 1 }).valido).toBe(false);       // recusa com certidão: contradição
  });
  test("motivo, função, resultado e bandeira de vulneráveis: valores da lista, texto sem tag", () => {
    const f = (extra) => va.validarVistoria(base(extra), { hoje: HOJE, atorId: 1 });
    for (const motivo of ["INVESTIDURA", "MUDANCA_FUNCAO", "SUSPEITA_FUNDADA", "SOLICITACAO_DIRETORIA"]) expect(f({ motivo }).valido).toBe(true);
    for (const motivo of ["", "OUTRO", "investiduraa", null]) expect(f({ motivo }).valido).toBe(false);
    for (const funcao of ["", "ab", "x".repeat(151), "<img src=x onerror=1>", null]) expect(f({ funcao }).valido).toBe(false);
    for (const resultado of ["", "TALVEZ", "sem_restricao ", null]) expect(f({ resultado }).valido).toBe(resultado === "sem_restricao ");
    for (const comVulneraveis of ["true", 1, [], {}]) expect(f({ comVulneraveis }).valido).toBe(false);
    expect(f({ comVulneraveis: undefined }).dados.comVulneraveis).toBe(false);
    expect(f({ parecer: "Sem apontamentos <script>alert(1)</script>" }).valido).toBe(false);
  });
  test("matrícula: só inteiro positivo escrito direito", () => {
    for (const membroId of ["0x14", "1e1", true, [20], 0, -3, "", null, 2.5, "abc"]) expect(va.validarVistoria(base({ membroId }), { hoje: HOJE, atorId: 1 }).valido).toBe(false);
    expect(va.validarVistoria(base({ membroId: "20" }), { hoje: HOJE, atorId: 1 }).dados.membroId).toBe(20);
  });
});

describe("solicitar as certidões (Art. 133 §5º, I)", () => {
  test("o pedido sai com motivo padrão da Diretoria e a função opcional", () => {
    expect(va.validarSolicitacao({ membroId: 7 }, { atorId: 1 }).dados).toEqual({ membroId: 7, motivo: "SOLICITACAO_DIRETORIA", funcao: null });
    expect(va.validarSolicitacao({ membroId: 7, motivo: "investidura", funcao: "Dirigente" }, { atorId: 1 }).dados).toEqual({ membroId: 7, motivo: "INVESTIDURA", funcao: "Dirigente" });
  });
  test("ninguém solicita a si mesmo; matrícula e função malformadas são recusadas", () => {
    expect(va.validarSolicitacao({ membroId: 1 }, { atorId: 1 }).valido).toBe(false);
    for (const membroId of [undefined, "0x7", 0, true]) expect(va.validarSolicitacao({ membroId }, { atorId: 1 }).valido).toBe(false);
    expect(va.validarSolicitacao({ membroId: 7, motivo: "QUALQUER" }, { atorId: 1 }).valido).toBe(false);
    expect(va.validarSolicitacao({ membroId: 7, funcao: "<b>" }, { atorId: 1 }).valido).toBe(false);
  });
  test("o aviso à pessoa diz o que levar, que não fica cópia e que a recusa tem consequência", () => {
    const t = va.textoSolicitacao({ motivo: "INVESTIDURA", funcao: "Professor da EBD infantil" });
    expect(t).toMatch(/certidão de antecedentes criminais e certidão de distribuição cível/);
    expect(t).toMatch(/Professor da EBD infantil/);
    expect(t).toMatch(/nunca uma cópia/);
    expect(t).toMatch(/recusa em apresentar implica impedimento/);
    // O e-mail da pessoa não diz POR QUE a Diretoria pergunta quando o motivo é uma suspeita: o motivo fica no termo.
    const suspeita = va.textoSolicitacao({ motivo: "SUSPEITA_FUNDADA" });
    expect(suspeita).toMatch(/por determinação da Diretoria/);
    expect(suspeita).not.toMatch(/notícia|suspeita|denúncia|rumor/i);
  });
  test("o aviso mensal cita quantos faltam e abrevia a lista de nomes", () => {
    const nomes = Array.from({ length: 9 }, (_, i) => `Pessoa ${i + 1}`);
    const t = va.textoPendentes({ total: 9, nomes });
    expect(t).toMatch(/^9 liderança\(s\)/);
    expect(t).toMatch(/e mais 3/);
    // Nomes enormes não podem estourar a coluna das notificações (1000): o motor diário não corta e a rodada inteira cairia.
    const gigante = va.textoPendentes({ total: 6, nomes: Array.from({ length: 6 }, () => "N".repeat(200)) });
    expect(gigante.length).toBeLessThanOrEqual(1000);
  });
});

describe("catálogos do Termo", () => {
  test("cada motivo cita o inciso do Regimento que o fundamenta", () => {
    for (const m of Object.values(va.MOTIVOS)) expect(m.base).toMatch(/Art\. 133 §5º/);
    expect(Object.keys(va.RESULTADOS)).toEqual(["SEM_RESTRICAO", "COM_RESTRICAO", "RECUSA"]);
    expect(Object.keys(va.DESTINOS_ORIGINAL)).toEqual(["DEVOLVIDO", "DESCARTADO"]);
  });
});
