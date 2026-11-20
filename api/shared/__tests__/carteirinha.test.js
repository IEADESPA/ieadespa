// shared/carteirinha.js (FASE 10, passo 8) — a regra das carteirinhas: o tipo da pessoa (o modelo sai sozinho), quem pode ter a física impressa, por que
// entra na lista, o que a página de conferência mostra e o desenho do modelo (a física só leva o que não muda; um QR só).
jest.mock("../db", () => ({ sql: new Proxy({}, { get: () => () => undefined }), getPool: async () => ({}) }));
const c = require("../carteirinha");

const pessoa = (extra = {}) => ({ nome: "Ana Beatriz Moreira", status: "ATIVO", situacaoMembro: "EM_COMUNHAO", cargo: null, funcao: null, congregacao: "Vila Nova",
  area: "Área 2", dataAdmissao: "2015-04-12", statusMatricula: null, sobDisciplina: false, excluido: false, foraDaComunhao: false, educacao: null, ...extra });

describe("o tipo da pessoa escolhe o modelo", () => {
  test("membro, congregado e obreiro em comunhão", () => {
    expect(c.tipoDaPessoa(pessoa())).toBe("MEMBRO");
    expect(c.tipoDaPessoa(pessoa({ situacaoMembro: "CONGREGADO" }))).toBe("CONGREGADO");
    expect(c.tipoDaPessoa(pessoa({ cargo: "DIACONO" }))).toBe("OBREIRO");
    expect(c.tipoDaPessoa(pessoa({ cargo: "PRESBITERO", situacaoMembro: "SEM_COMUNHAO" }))).toBe("MEMBRO");
    expect(c.tipoDaPessoa(null)).toBeNull();
  });
});

describe("quem pode ter a física impressa", () => {
  test("no rol, em comunhão ou congregado", () => {
    expect(c.podeImprimir(pessoa()).pode).toBe(true);
    expect(c.podeImprimir(pessoa({ situacaoMembro: "CONGREGADO" })).pode).toBe(true);
    expect(c.podeImprimir(pessoa({ status: "LICENÇA" })).pode).toBe(true);
  });
  test("fora do rol ou em disciplina: não", () => {
    for (const p of [pessoa({ status: "DESLIGADO" }), pessoa({ status: "FALECIDO" }), pessoa({ excluido: true }), pessoa({ sobDisciplina: true }),
      pessoa({ situacaoMembro: "SEM_COMUNHAO" }), pessoa({ foraDaComunhao: true }), null]) {
      expect(c.podeImprimir(p).pode).toBe(false);
    }
  });
});

describe("por que entra na lista para imprimir", () => {
  test("nova, mudou de tipo, segunda via; quem já tem a sua não entra", () => {
    expect(c.motivoParaImprimir("MEMBRO", null, null)).toBe("NOVA");
    expect(c.motivoParaImprimir("OBREIRO", { publico: "MEMBRO" }, null)).toBe("MUDOU");
    expect(c.motivoParaImprimir("MEMBRO", { publico: "MEMBRO" }, { motivo: "perdeu" })).toBe("SEGUNDA_VIA");
    expect(c.motivoParaImprimir("MEMBRO", { publico: "MEMBRO" }, null)).toBeNull();
  });
});

describe("a página de conferência (o que o QR abre)", () => {
  test("em comunhão: cargo, função, congregação, área e membro desde; nunca matrícula, CPF ou contato", () => {
    const r = c.situacaoConferencia(pessoa({ cargo: "MEMBRO", funcao: "Professora · Ministério Infantil", cpf: "52998224725", telefone: "91999990000", membroId: 700412 }));
    expect(r).toMatchObject({ situacao: "EM_COMUNHAO", nome: "Ana Beatriz Moreira", cargo: "Membro", funcao: "Professora · Ministério Infantil", congregacao: "Vila Nova", area: "Área 2", membroDesde: "04/2015", foto: true });
    const texto = JSON.stringify(r);
    expect(texto).not.toMatch(/52998224725|91999990000|700412/);
  });
  test("obreiro: diz se exerce o cargo agora (a mesma regra da licença para oficiar)", () => {
    expect(c.situacaoConferencia(pessoa({ cargo: "DIACONO", statusMatricula: "ATIVA" })).exerceCargo).toBe(true);
    expect(c.situacaoConferencia(pessoa({ cargo: "DIACONO", statusMatricula: "INATIVA" })).exerceCargo).toBe(false);
    expect(c.situacaoConferencia(pessoa({ cargo: "MEMBRO" })).exerceCargo).toBeNull();
  });
  test("congregado, disciplina e quem saiu: só o necessário; quem saiu nem foto nem congregação", () => {
    expect(c.situacaoConferencia(pessoa({ situacaoMembro: "CONGREGADO" }))).toMatchObject({ situacao: "CONGREGADO", foto: true, congregacao: "Vila Nova" });
    const d = c.situacaoConferencia(pessoa({ cargo: "PRESBITERO", sobDisciplina: true, funcao: "Dirigente" }));
    expect(d).toEqual({ situacao: "DISCIPLINA", nome: "Ana Beatriz Moreira", foto: true });
    expect(c.situacaoConferencia(pessoa({ situacaoMembro: "SEM_COMUNHAO" })).situacao).toBe("DISCIPLINA");
    for (const p of [pessoa({ status: "DESLIGADO" }), pessoa({ status: "FALECIDO" }), pessoa({ excluido: true })]) {
      expect(c.situacaoConferencia(p)).toEqual({ situacao: "SAIU", nome: "Ana Beatriz Moreira" });
    }
    expect(c.situacaoConferencia(null)).toEqual({ situacao: "NAO_ENCONTRADA" });
  });
});

describe("o desenho do modelo", () => {
  test("o padrão de cada público passa na conferência e tem um QR só", () => {
    for (const p of ["MEMBRO", "CONGREGADO", "OBREIRO", "OUTRO"]) {
      const r = c.validarDesenho(c.desenhoPadrao(p));
      expect(r.ok).toBe(true);
      const qrs = [...r.desenho.lados.frente.camadas, ...r.desenho.lados.verso.camadas].filter((k) => k.tipo === "QR");
      expect(qrs).toHaveLength(1);
    }
  });
  test("a física só leva o que não muda: CPF, congregação, cargo e contato são recusados", () => {
    for (const campo of ["CPF", "CONGREGACAO", "CARGO", "FUNCAO", "SITUACAO", "TELEFONE", "ENDERECO"]) {
      const d = c.desenhoPadrao("MEMBRO");
      d.lados.frente.camadas.push({ id: "x", tipo: "CAMPO", campo, x: 1, y: 1, larg: 10, alt: 3 });
      const r = c.validarDesenho(d);
      expect(r.ok).toBe(false);
      expect(r.mensagem).toMatch(/só leva o que não muda/);
    }
  });
  test("sem QR, com dois QR, fora do cartão, tipo estranho, texto vazio, JSON quebrado ou grande demais: recusado", () => {
    const semQr = c.desenhoPadrao("MEMBRO"); semQr.lados.verso.camadas = semQr.lados.verso.camadas.filter((k) => k.tipo !== "QR");
    const doisQr = c.desenhoPadrao("MEMBRO"); doisQr.lados.frente.camadas.push({ id: "qr2", tipo: "QR", x: 60, y: 20, larg: 15, alt: 15 });
    const fora = c.desenhoPadrao("MEMBRO"); fora.lados.frente.camadas[0].x = 500;
    const estranho = c.desenhoPadrao("MEMBRO"); estranho.lados.frente.camadas.push({ id: "s", tipo: "SCRIPT", x: 1, y: 1, larg: 2, alt: 2 });
    const vazio = c.desenhoPadrao("MEMBRO"); vazio.lados.frente.camadas.push({ id: "t", tipo: "TEXTO", texto: "   ", x: 1, y: 1, larg: 10, alt: 3 });
    const semVerso = c.desenhoPadrao("MEMBRO"); delete semVerso.lados.verso;
    const muitas = c.desenhoPadrao("MEMBRO"); for (let i = 0; i < 31; i++) muitas.lados.frente.camadas.push({ id: `f${i}`, tipo: "FORMA", x: 1, y: 1, larg: 2, alt: 2 });
    for (const d of [semQr, doisQr, fora, estranho, vazio, semVerso, muitas, "{quebrado", "x".repeat(70000), null, [], 42]) {
      expect(c.validarDesenho(d).ok).toBe(false);
    }
  });
  test("o texto livre sai limpo (sem marcação nem caracteres de controle) e as cores inválidas voltam ao padrão", () => {
    const d = c.desenhoPadrao("MEMBRO");
    d.lados.frente.camadas.push({ id: "t", tipo: "TEXTO", texto: "<img src=x onerror=alert(1)>Olá\u0000 mundo", x: 1, y: 1, larg: 30, alt: 4, cor: "red", fonte: "Comic Sans" });
    const r = c.validarDesenho(JSON.stringify(d));
    expect(r.ok).toBe(true);
    const t = r.desenho.lados.frente.camadas.find((k) => k.id === "t");
    expect(t.texto).not.toMatch(/[<>\u0000]/);
    expect(t.cor).toBe("#ffffff");
    expect(t.fonte).toBe("Inter");
  });
  test("o nome do modelo", () => {
    expect(c.validarNome("  Visitante  ")).toEqual({ ok: true, nome: "Visitante" });
    expect(c.validarNome("ab").ok).toBe(false);
    expect(c.validarNome(null).ok).toBe(false);
  });
});

describe("o endereço que o QR guarda", () => {
  test("a página de conferência, com o código formatado (é o que fica impresso no PVC para sempre)", () => {
    const { urlConferencia } = require("../carteirinhaDb");
    const antes = process.env.APP_URL_PUBLICA;
    delete process.env.APP_URL_PUBLICA;
    expect(urlConferencia("abcdefghjklmnpqr")).toBe("https://app.ieadespa.org.br/conferir.html?c=ABCD-EFGH-JKLM-NPQR");
    process.env.APP_URL_PUBLICA = "https://homolog.exemplo.org/";
    expect(urlConferencia("ABCD-EFGH-JKLM-NPQR")).toBe("https://homolog.exemplo.org/conferir.html?c=ABCD-EFGH-JKLM-NPQR");
    if (antes === undefined) delete process.env.APP_URL_PUBLICA; else process.env.APP_URL_PUBLICA = antes;
  });
});
