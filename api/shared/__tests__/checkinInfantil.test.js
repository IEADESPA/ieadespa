// A regra pura do check-in infantil (v7.10): o código, a janela, a lotação, quem pode retirar, a validação do que chega de fora e o que a tela mostra.
const ck = require("../checkinInfantil");
const mm = require("../ministerioMenores");

const SEGREDO = "segredo-de-teste-com-mais-de-16-caracteres";
const HOJE = "2026-10-15";

describe("o código de retirada", () => {
  test("tem 6 caracteres do alfabeto sem símbolos parecidos (0 O 1 I L)", () => {
    for (let i = 0; i < 300; i++) {
      const c = ck.gerarCodigo();
      expect(c).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
      expect(c).not.toMatch(/[01OIL]/);
    }
    expect(ck.ALFABETO_CODIGO).toHaveLength(31);
  });
  test("usa o sorteio injetado (determinístico) e cobre o alfabeto inteiro", () => {
    let i = 0;
    const seq = () => (i++ % 31);
    expect(ck.gerarCodigo(seq)).toBe(ck.ALFABETO_CODIGO.slice(0, 6));
    const visto = new Set();
    for (let n = 0; n < 31; n++) for (const ch of ck.gerarCodigo(() => n)) visto.add(ch);
    expect(visto.size).toBe(31);
  });
  test("dois códigos seguidos quase nunca coincidem (a fonte é aleatória)", () => {
    const todos = new Set(Array.from({ length: 200 }, () => ck.gerarCodigo()));
    expect(todos.size).toBeGreaterThan(190);
  });
  test("normalizar: ignora espaço e hífen, sobe para maiúscula e recusa o que não é código", () => {
    expect(ck.normalizarCodigo("ab3 k9z")).toBe("AB3K9Z");
    expect(ck.normalizarCodigo("ab3-k9z")).toBe("AB3K9Z");
    for (const ruim of ["AB3K9", "AB3K9ZZ", "AB3K90", "AB3K91", "AB3KIZ", "AB3KLZ", "AB3KOZ", "", "   ", null, undefined, 123456, {}, [], true, "AB3K9Z\u0000", "AB3K9<"]) {
      expect(ck.normalizarCodigo(ruim)).toBeNull();
    }
  });
  test("o HMAC é atado ao registro, à geração e ao segredo; só o texto certo confere", () => {
    const h = ck.hashCodigo("AB3K9Z", { registroId: 12, geracao: 1, segredo: SEGREDO });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(ck.confereCodigo("ab3-k9z", h, { registroId: 12, geracao: 1, segredo: SEGREDO })).toBe(true);
    expect(ck.confereCodigo("AB3K9Y", h, { registroId: 12, geracao: 1, segredo: SEGREDO })).toBe(false);
    expect(ck.confereCodigo("AB3K9Z", h, { registroId: 13, geracao: 1, segredo: SEGREDO })).toBe(false);   // o código de outra criança não serve
    expect(ck.confereCodigo("AB3K9Z", h, { registroId: 12, geracao: 2, segredo: SEGREDO })).toBe(false);   // o código antigo morre na segunda via
    expect(ck.confereCodigo("AB3K9Z", h, { registroId: 12, geracao: 1, segredo: `${SEGREDO}x` })).toBe(false);
  });
  test("o hash não contém o código e não muda de comprimento", () => {
    const h = ck.hashCodigo("AB3K9Z", { registroId: 1, geracao: 1, segredo: SEGREDO });
    expect(h.toLowerCase()).not.toContain("ab3k9z");
    expect(ck.hashCodigo("AB3K9Z", { registroId: 1, geracao: 1, segredo: SEGREDO })).toBe(h);   // determinístico
  });
  test("confereCodigo nunca lança com lixo no lugar do hash ou do código", () => {
    for (const lixo of [null, undefined, "", "xyz", 5, {}, [], "g".repeat(64), "A".repeat(64)]) {
      expect(ck.confereCodigo("AB3K9Z", lixo, { registroId: 1, geracao: 1, segredo: SEGREDO })).toBe(false);
    }
    expect(ck.confereCodigo(null, "a".repeat(64), { registroId: 1, geracao: 1, segredo: SEGREDO })).toBe(false);
  });
  test("segredo curto ou ausente recusa gerar hash (nada de HMAC com chave vazia)", () => {
    expect(() => ck.hashCodigo("AB3K9Z", { registroId: 1, geracao: 1, segredo: "" })).toThrow();
    expect(() => ck.hashCodigo("AB3K9Z", { registroId: 1, geracao: 1, segredo: "curto" })).toThrow();
    expect(() => ck.hashCodigo("AB3K9Z", { registroId: 1, geracao: 1 })).toThrow();
    expect(() => ck.hashCodigo("AB3K9", { registroId: 1, geracao: 1, segredo: SEGREDO })).toThrow();
    expect(() => ck.hashCodigo("AB3K9Z", { registroId: 0, geracao: 1, segredo: SEGREDO })).toThrow();
    expect(() => ck.hashCodigo("AB3K9Z", { registroId: 1, geracao: "1x", segredo: SEGREDO })).toThrow();
  });
  test("o teto de tentativas é 5 mesmo que a Igreja configure mais", () => {
    expect(ck.tentativasPermitidas(undefined)).toBe(5);
    expect(ck.tentativasPermitidas(3)).toBe(3);
    expect(ck.tentativasPermitidas(50)).toBe(5);
    expect(ck.tentativasPermitidas(0)).toBe(5);
    expect(ck.tentativasPermitidas(-2)).toBe(5);
    expect(ck.tentativasPermitidas("3")).toBe(5);
    expect(ck.tentativasPermitidas(2.5)).toBe(5);
  });
});

describe("idade e faixa", () => {
  test("a faixa da idade segue as da v7.7", () => {
    const esperado = { 0: "BERCARIO", 2: "BERCARIO", 3: "MATERNAL", 5: "MATERNAL", 6: "INFANTIL", 9: "INFANTIL", 10: "JUNIORES", 12: "JUNIORES", 13: "ADOLESCENTES", 17: "ADOLESCENTES" };
    for (const [idade, faixa] of Object.entries(esperado)) expect(ck.faixaDaIdade(Number(idade))).toBe(faixa);
    for (const x of [18, 30, -1, 1.5, null, undefined, "5", NaN]) expect(ck.faixaDaIdade(x)).toBeNull();
    for (const f of Object.values(esperado)) expect(Object.keys(mm.FAIXAS)).toContain(f);
  });
  test("idade fora da faixa da sala avisa, e sala sem faixa não acusa ninguém", () => {
    expect(ck.idadeForaDaFaixa(4, "MATERNAL")).toBe(false);
    expect(ck.idadeForaDaFaixa(8, "MATERNAL")).toBe(true);
    expect(ck.idadeForaDaFaixa(8, null)).toBe(false);
  });
});

describe("a janela do serviço", () => {
  const servicoIso = "2026-10-18T09:00:00.000Z";
  test("agora de Brasília é o UTC menos 3 horas", () => {
    expect(ck.agoraBrasiliaIso(new Date("2026-10-18T12:30:00Z"))).toBe("2026-10-18T09:30");
    expect(ck.agoraBrasiliaIso(new Date("2026-10-18T02:59:00Z"))).toBe("2026-10-17T23:59");
  });
  test("abre 60 minutos antes e fecha 5 horas depois (padrão); as bordas são inclusivas", () => {
    const j = (agoraIso, extra = {}) => ck.avaliarJanela({ servicoIso, agoraIso, ...extra });
    expect(j("2026-10-18T07:59").aberta).toBe(false);
    expect(j("2026-10-18T07:59").codigo).toBe("AINDA_NAO_ABRIU");
    expect(j("2026-10-18T07:59").faltamMinutos).toBe(1);
    expect(j("2026-10-18T08:00").aberta).toBe(true);
    expect(j("2026-10-18T14:00").aberta).toBe(true);
    expect(j("2026-10-18T14:01").aberta).toBe(false);
    expect(j("2026-10-18T14:01").codigo).toBe("JA_FECHOU");
    expect(j("2026-10-18T07:30", { antesMin: 30 }).aberta).toBe(false);
    expect(j("2026-10-18T08:30", { antesMin: 30 }).aberta).toBe(true);
    expect(j("2026-10-18T11:01", { depoisHoras: 2 }).aberta).toBe(false);
  });
  test("horário ilegível fecha a sala", () => {
    for (const x of [null, "", "amanhã", undefined, 5]) {
      expect(ck.avaliarJanela({ servicoIso: x, agoraIso: "2026-10-18T09:00" }).aberta).toBe(false);
      expect(ck.avaliarJanela({ servicoIso, agoraIso: x }).aberta).toBe(false);
    }
  });
  test("os prazos configurados só podem ficar dentro dos tetos", () => {
    expect(ck.prazosDoCheckin({})).toEqual({ abreMinutosAntes: 60, fechaHorasDepois: 5, tentativasCodigo: 5, visitanteContatoDias: 90 });
    expect(ck.prazosDoCheckin({ abreMinutosAntes: 9999, fechaHorasDepois: 999, tentativasCodigo: 99, visitanteContatoDias: 9999 })).toEqual({ abreMinutosAntes: 240, fechaHorasDepois: 12, tentativasCodigo: 5, visitanteContatoDias: 365 });
    expect(ck.prazosDoCheckin({ abreMinutosAntes: 0, fechaHorasDepois: -1, tentativasCodigo: 0, visitanteContatoDias: 0 })).toEqual({ abreMinutosAntes: 60, fechaHorasDepois: 5, tentativasCodigo: 5, visitanteContatoDias: 90 });
    expect(ck.prazosDoCheckin({ abreMinutosAntes: "30" }).abreMinutosAntes).toBe(60);
  });
});

describe("lotação da sala (a proporção da v7.7 com gente de verdade)", () => {
  test("com 2 adultos e maternal (5 por adulto) cabem 10; a 11ª é recusada", () => {
    const cabe = (criancas, adicionar = 1) => ck.avaliarLotacao({ adultos: 2, criancas, adicionar, faixa: "MATERNAL" });
    expect(cabe(9).ok).toBe(true);
    expect(cabe(10).ok).toBe(false);
    expect(cabe(10).problemas.map((p) => p.codigo)).toEqual(["SALA_CHEIA"]);
    expect(cabe(8, 3).ok).toBe(false);
    expect(cabe(7, 3).ok).toBe(true);
    expect(cabe(9).capacidade).toBe(10);
    expect(cabe(9).vagas).toBe(1);
  });
  test("menos de 2 adultos recusa SEMPRE, mesmo com a sala vazia (regra dos dois adultos)", () => {
    const r1 = ck.avaliarLotacao({ adultos: 1, criancas: 0, faixa: "INFANTIL" });
    expect(r1.ok).toBe(false);
    expect(r1.problemas.map((p) => p.codigo)).toEqual(["ADULTOS_INSUFICIENTES"]);
    expect(ck.avaliarLotacao({ adultos: 0, criancas: 0, faixa: "INFANTIL" }).ok).toBe(false);
    expect(ck.avaliarLotacao({ adultos: 2, criancas: 0, faixa: "INFANTIL" }).ok).toBe(true);
  });
  test("o mínimo de adultos configurado nunca fica abaixo de 2 (configurar 1 não afrouxa)", () => {
    expect(ck.avaliarLotacao({ adultos: 1, criancas: 0, faixa: "INFANTIL", adultosMinimos: 1 }).ok).toBe(false);
    expect(ck.avaliarLotacao({ adultos: 2, criancas: 0, faixa: "INFANTIL", adultosMinimos: 3 }).ok).toBe(false);
    expect(ck.avaliarLotacao({ adultos: 3, criancas: 0, faixa: "INFANTIL", adultosMinimos: 3 }).ok).toBe(true);
  });
  test("sala sem faixa não recebe criança (não se confere a proporção sem ela)", () => {
    const r = ck.avaliarLotacao({ adultos: 4, criancas: 0, faixa: null });
    expect(r.ok).toBe(false);
    expect(r.problemas[0].codigo).toBe("SEM_FAIXA");
    expect(ck.avaliarLotacao({ adultos: 4, criancas: 0, faixa: "INEXISTENTE" }).ok).toBe(false);
  });
  test("a proporção configurada vale (2 adultos x 3 = 6 crianças); sem ela vale o padrão da faixa", () => {
    expect(ck.avaliarLotacao({ adultos: 2, criancas: 5, faixa: "MATERNAL", criancasPorAdulto: 3 }).ok).toBe(true);    // 5 + 1 = 6 cabe
    expect(ck.avaliarLotacao({ adultos: 2, criancas: 6, faixa: "MATERNAL", criancasPorAdulto: 3 }).ok).toBe(false);   // 6 + 1 = 7 não cabe
    expect(ck.avaliarLotacao({ adultos: 2, criancas: 6, faixa: "MATERNAL" }).ok).toBe(true);                          // padrão do maternal: 5 por adulto = 10
  });
  test("saída de voluntário: não deixa a sala com criança abaixo de 2 adultos nem acima da proporção", () => {
    const sai = (o) => ck.avaliarSaidaVoluntario({ faixa: "MATERNAL", contaComoAdulto: true, ...o });
    expect(sai({ adultos: 2, criancas: 0 }).ok).toBe(true);
    expect(sai({ adultos: 2, criancas: 1 }).ok).toBe(false);
    expect(sai({ adultos: 3, criancas: 5 }).ok).toBe(true);
    expect(sai({ adultos: 3, criancas: 11 }).ok).toBe(false);     // sobrariam 2 adultos = 10 crianças
    expect(sai({ adultos: 3, criancas: 10 }).ok).toBe(true);
    expect(sai({ adultos: 2, criancas: 1 }).mensagem).toMatch(/ficaria com 1 adulto/);
  });
  test("o adolescente apto (auxiliar) pode sair a qualquer hora: não conta como adulto", () => {
    expect(ck.avaliarSaidaVoluntario({ adultos: 2, criancas: 8, contaComoAdulto: false, faixa: "INFANTIL" }).ok).toBe(true);
  });
});

describe("quem pode retirar", () => {
  const base = {
    responsaveis: [{ membroId: 10, nome: "Maria Silva", vinculo: "MAE" }, { membroId: 11, nome: "José Silva", vinculo: "PAI" }],
    fixos: [{ autorizadoId: 5, membroId: null, nome: "Dona Lúcia", parentesco: "AVO", validoAte: null }, { autorizadoId: 6, membroId: 40, nome: "Tio Paulo", parentesco: "TIO", validoAte: "2026-10-01" }],
    trouxe: { membroId: null, nome: "Ana Vizinha", parentesco: "AMIGO_FAMILIA" },
    daVisita: [{ autorizadoVisitaId: 9, nome: "Carla", parentesco: "TIO" }],
    hoje: HOJE
  };
  const lista = ck.montarAutorizados(base);
  test("os responsáveis cadastrados sempre estão; a autorização vencida some; quem trouxe e os da visita entram", () => {
    expect(lista.map((x) => x.ref)).toEqual(["RESP:10", "RESP:11", "AUT:5", "VIS:9", "TROUXE"]);
    expect(lista.find((x) => x.ref === "RESP:10")).toMatchObject({ tipo: "RESPONSAVEL", rotulo: "Mãe", nome: "Maria Silva" });
    expect(lista.find((x) => x.ref === "VIS:9").rotulo).toMatch(/só esta visita/);
    expect(lista.find((x) => x.ref === "TROUXE").rotulo).toMatch(/Quem trouxe a criança/);
  });
  test("a autorização que vence HOJE ainda vale; a de ontem não", () => {
    const l = ck.montarAutorizados({ fixos: [{ autorizadoId: 1, nome: "A", parentesco: "AVO", validoAte: HOJE }, { autorizadoId: 2, nome: "B", parentesco: "AVO", validoAte: "2026-10-14" }], hoje: HOJE });
    expect(l.map((x) => x.ref)).toEqual(["AUT:1"]);
  });
  test("quem é da lista não é divergente, e o tipo vem do cadastro (nunca do cliente)", () => {
    expect(ck.classificarRetirante({ ref: "RESP:10" }, lista)).toMatchObject({ divergente: false, tipo: "RESPONSAVEL", membroId: 10 });
    expect(ck.classificarRetirante({ ref: "AUT:5" }, lista)).toMatchObject({ divergente: false, tipo: "AUTORIZADO", nome: "Dona Lúcia" });
    expect(ck.classificarRetirante({ ref: "VIS:9" }, lista)).toMatchObject({ divergente: false, tipo: "AUTORIZADO" });
    expect(ck.classificarRetirante({ ref: "TROUXE" }, lista)).toMatchObject({ divergente: false, tipo: "TROUXE", nome: "Ana Vizinha" });
  });
  test("referência que não está na lista é recusada (não vira divergente por engano)", () => {
    for (const ref of ["RESP:99", "AUT:6", "AUT:99", "VIS:1", "RESP:10 ", "resp:10", "RESP:0", "RESP:-1", "RESP:1e1", "RESP:010", "AUT", "", "TROUXE ", 10, null, {}, []]) {
      const r = ck.classificarRetirante({ ref }, lista);
      expect(r.erro).toBeTruthy();
      expect(r.divergente).toBeUndefined();
    }
  });
  test("\"outra pessoa\" é divergente e exige nome, parentesco e documento conferido", () => {
    const ok = ck.classificarRetirante({ outro: { nome: "Roberto Dias", parentesco: "AMIGO_FAMILIA", documento: "RG" } }, lista);
    expect(ok).toMatchObject({ divergente: true, tipo: "OUTRO", nome: "Roberto Dias", parentesco: "AMIGO_FAMILIA", documento: "RG", membroId: null });
    for (const outro of [{}, { nome: "R", parentesco: "AMIGO_FAMILIA", documento: "RG" }, { nome: "Roberto", parentesco: "XX", documento: "RG" }, { nome: "Roberto", parentesco: "TIO", documento: "TITULO" },
      { nome: "Rob<b>", parentesco: "TIO", documento: "RG" }, { nome: "Roberto", parentesco: "TIO" }, "texto", null, [], 5]) {
      expect(ck.classificarRetirante({ outro }, lista).erro).toBeTruthy();
    }
    expect(ck.classificarRetirante({}, lista).erro).toBeTruthy();
  });
  test("alguém da lista com o mesmo nome digitado como \"outra pessoa\" continua divergente (a lista é por referência, não por nome)", () => {
    const r = ck.classificarRetirante({ outro: { nome: "Maria Silva", parentesco: "MAE", documento: "RG" } }, lista);
    expect(r.divergente).toBe(true);
  });
});

describe("validação do check-in", () => {
  const trouxe = { responsavelId: 10 };
  const corpo = (extra = {}) => ({ servicoId: 5, equipeId: 7, criancas: [{ menorId: 30 }], trouxe, ...extra });
  const v = (d) => ck.validarCheckin(d, { hoje: HOJE });
  test("o caso feliz: criança membro e responsável cadastrado", () => {
    const r = v(corpo());
    expect(r).toMatchObject({ valido: true, servicoId: 5, equipeId: 7, criancas: [{ tipo: "MEMBRO", menorId: 30 }], trouxe: { membroId: 10 }, extras: [] });
  });
  test("visitante: nome, nascimento (menor de 18) e quem trouxe com telefone", () => {
    const r = v(corpo({ criancas: [{ visitante: { nome: "  Davi   Lima ", nascimento: "2019-03-02" } }], trouxe: { nome: "Paula Lima", parentesco: "MAE", documento: "CNH", contato: "(94) 99111-2222" } }));
    expect(r.valido).toBe(true);
    expect(r.criancas[0]).toMatchObject({ tipo: "VISITANTE", nome: "Davi Lima", nascimento: "2019-03-02", idade: 7, saude: null });
    expect(r.trouxe).toEqual({ nome: "Paula Lima", parentesco: "MAE", documento: "CNH", contato: "94991112222" });
  });
  test("telefone é obrigatório quando há visitante e quem trouxe não é membro; opcional nos outros casos", () => {
    const livre = { nome: "Paula Lima", parentesco: "MAE", documento: "RG" };
    expect(v(corpo({ criancas: [{ visitante: { nome: "Davi", nascimento: "2019-03-02" } }], trouxe: livre })).valido).toBe(false);
    expect(v(corpo({ criancas: [{ menorId: 30 }], trouxe: livre })).valido).toBe(true);
    expect(v(corpo({ criancas: [{ visitante: { nome: "Davi", nascimento: "2019-03-02" } }], trouxe: { responsavelId: 10 } })).valido).toBe(true);
    expect(v(corpo({ trouxe: { ...livre, contato: "123" } })).valido).toBe(false);
  });
  test("a saúde do visitante exige texto, a concordância do responsável presente e o hash do texto mostrado", () => {
    const vis = (saude) => v(corpo({ criancas: [{ visitante: { nome: "Davi", nascimento: "2019-03-02", saude } }], trouxe: { responsavelId: 10 } }));
    expect(vis({ texto: "alergia a amendoim", concordo: true, textoHash: "ABC" }).criancas[0].saude).toEqual({ texto: "alergia a amendoim", textoHash: "abc" });
    expect(vis({ texto: "alergia a amendoim", concordo: false, textoHash: "abc" }).valido).toBe(false);
    expect(vis({ texto: "alergia a amendoim", textoHash: "abc" }).valido).toBe(false);
    expect(vis({ texto: "alergia a amendoim", concordo: "true", textoHash: "abc" }).valido).toBe(false);
    expect(vis({ texto: "alergia a amendoim", concordo: true }).valido).toBe(false);
    expect(vis({ texto: "x", concordo: true, textoHash: "abc" }).valido).toBe(false);
    expect(vis({ texto: "<script>", concordo: true, textoHash: "abc" }).valido).toBe(false);
    expect(vis({ texto: "a".repeat(401), concordo: true, textoHash: "abc" }).valido).toBe(false);
    expect(vis("alergia").valido).toBe(false);
  });
  test("de 1 a 6 crianças, sem repetição", () => {
    expect(v(corpo({ criancas: [] })).valido).toBe(false);
    expect(v(corpo({ criancas: undefined })).valido).toBe(false);
    expect(v(corpo({ criancas: "30" })).valido).toBe(false);
    expect(v(corpo({ criancas: [1, 2, 3, 4, 5, 6].map((menorId) => ({ menorId })) })).valido).toBe(true);
    expect(v(corpo({ criancas: [1, 2, 3, 4, 5, 6, 7].map((menorId) => ({ menorId })) })).valido).toBe(false);
    expect(v(corpo({ criancas: [{ menorId: 30 }, { menorId: "30" }] })).valido).toBe(false);
    const vis = { visitante: { nome: "Davi Lima", nascimento: "2019-03-02" } };
    expect(v(corpo({ criancas: [vis, { visitante: { nome: "DAVI  lima", nascimento: "2019-03-02" } }], trouxe: { responsavelId: 10 } })).valido).toBe(false);
  });
  test("cada criança é membro OU visitante, nunca os dois nem nenhum", () => {
    expect(v(corpo({ criancas: [{}] })).valido).toBe(false);
    expect(v(corpo({ criancas: [{ menorId: 30, visitante: { nome: "Davi", nascimento: "2019-03-02" } }] })).valido).toBe(false);
    for (const c of [null, 5, "x", [], true]) expect(v(corpo({ criancas: [c] })).valido).toBe(false);
  });
  test("identificadores só na grafia canônica", () => {
    for (const id of ["0", 0, -1, "1e1", "0x10", " 5", "05", 1.5, true, [5], {}, null]) {
      expect(v(corpo({ criancas: [{ menorId: id }] })).valido).toBe(false);
      expect(v(corpo({ servicoId: id })).valido).toBe(false);
      expect(v(corpo({ equipeId: id })).valido).toBe(false);
      expect(v(corpo({ trouxe: { responsavelId: id } })).valido).toBe(false);
    }
  });
  test("visitante com 18 anos ou mais, nascimento futuro ou data impossível são recusados", () => {
    const vis = (nascimento) => v(corpo({ criancas: [{ visitante: { nome: "Davi", nascimento } }], trouxe: { responsavelId: 10 } }));
    expect(vis("2008-10-15").valido).toBe(false);          // faz 18 hoje
    expect(vis("2008-10-16").valido).toBe(true);           // faz 18 amanhã
    expect(vis("2027-01-01").valido).toBe(false);
    expect(vis("2019-02-30").valido).toBe(false);
    expect(vis("02/03/2019").valido).toBe(false);
    expect(vis(20190302).valido).toBe(false);
    expect(vis(undefined).valido).toBe(false);
  });
  test("nomes: sem marcação, com letras, no tamanho certo", () => {
    for (const nome of ["<b>", "A", "  ", "12345", "!!", "a".repeat(151), 7, null, {}, "Davi <x>"]) {
      expect(v(corpo({ criancas: [{ visitante: { nome, nascimento: "2019-03-02" } }], trouxe: { responsavelId: 10 } })).valido).toBe(false);
    }
    expect(v(corpo({ criancas: [{ visitante: { nome: "José D'Ávila-Souza", nascimento: "2019-03-02" } }], trouxe: { responsavelId: 10 } })).valido).toBe(true);
  });
  test("até 3 pessoas autorizadas só para a visita, cada uma com nome e parentesco do catálogo", () => {
    const ok = [{ nome: "Carla Dias", parentesco: "TIO" }];
    expect(v(corpo({ autorizadosVisita: ok })).extras).toEqual(ok);
    expect(v(corpo({ autorizadosVisita: [...ok, ...ok, ...ok] })).valido).toBe(true);
    expect(v(corpo({ autorizadosVisita: [...ok, ...ok, ...ok, ...ok] })).valido).toBe(false);
    expect(v(corpo({ autorizadosVisita: [{ nome: "Carla Dias", parentesco: "XX" }] })).valido).toBe(false);
    expect(v(corpo({ autorizadosVisita: [{ nome: "<i>", parentesco: "TIO" }] })).valido).toBe(false);
    expect(v(corpo({ autorizadosVisita: "Carla" })).valido).toBe(false);
    expect(v(corpo({ autorizadosVisita: [null] })).valido).toBe(false);
  });
  test("quem trouxe: documento do catálogo e parentesco do catálogo", () => {
    const livre = (extra) => v(corpo({ trouxe: { nome: "Paula Lima", parentesco: "MAE", documento: "RG", ...extra } }));
    expect(livre({}).valido).toBe(true);
    expect(livre({ documento: "TITULO" }).valido).toBe(false);
    expect(livre({ parentesco: "CHEFE" }).valido).toBe(false);
    expect(livre({ documento: undefined }).valido).toBe(false);
    expect(v(corpo({ trouxe: null })).valido).toBe(false);
    expect(v(corpo({ trouxe: {} })).valido).toBe(false);
  });
});

describe("validação da retirada, da decisão e da segunda via", () => {
  test("retirada: criança, código no formato e escolha de quem retira", () => {
    const base = { registroId: 9, codigo: "ab3-k9z", retirante: { ref: "RESP:10" } };
    expect(ck.validarRetirada(base)).toMatchObject({ valido: true, registroId: 9, codigo: "AB3K9Z", retirante: { ref: "RESP:10" } });
    expect(ck.validarRetirada({ ...base, retirante: { outro: { nome: "X" } } }).valido).toBe(true);     // o conteúdo do "outro" é conferido na classificação
    expect(ck.validarRetirada({ ...base, codigo: "AB3K90" })).toMatchObject({ valido: false, formato: true });
    expect(ck.validarRetirada({ ...base, codigo: "" }).valido).toBe(false);
    expect(ck.validarRetirada({ ...base, codigo: 123456 }).valido).toBe(false);
    expect(ck.validarRetirada({ ...base, registroId: "0x9" }).valido).toBe(false);
    expect(ck.validarRetirada({ ...base, retirante: undefined }).valido).toBe(false);
    expect(ck.validarRetirada({ ...base, retirante: { ref: "RESP:10", outro: {} } }).valido).toBe(false);
    expect(ck.validarRetirada({ ...base, retirante: {} }).valido).toBe(false);
    expect(ck.validarRetirada({ ...base, retirante: "RESP:10" }).valido).toBe(false);
  });
  test("decisão da divergência: aprovar é booleano de verdade e o motivo tem de 8 a 300 caracteres", () => {
    const base = { registroId: 9, aprovar: true, motivo: "Liguei para a mãe e ela confirmou." };
    expect(ck.validarDecisaoDivergencia(base)).toMatchObject({ valido: true, aprovar: true });
    expect(ck.validarDecisaoDivergencia({ ...base, aprovar: false }).aprovar).toBe(false);
    for (const aprovar of ["true", 1, 0, null, undefined, "sim"]) expect(ck.validarDecisaoDivergencia({ ...base, aprovar }).valido).toBe(false);
    for (const motivo of ["curto", "", "a".repeat(301), "<b>motivo aqui</b>", 12345678, null]) expect(ck.validarDecisaoDivergencia({ ...base, motivo }).valido).toBe(false);
  });
  test("segunda via: pessoa da lista (referência) e documento conferido", () => {
    expect(ck.validarPedidoSegundaVia({ registroId: 9, pessoa: { ref: "RESP:10" }, documento: "RG" })).toMatchObject({ valido: true, pessoa: { tipo: "RESP", id: 10 }, documento: "RG" });
    expect(ck.validarPedidoSegundaVia({ registroId: 9, pessoa: { ref: "TROUXE" }, documento: "CNH" }).pessoa).toEqual({ tipo: "TROUXE", id: null });
    for (const p of [{ ref: "OUTRO" }, {}, null, "RESP:10", { ref: "RESP:x" }]) expect(ck.validarPedidoSegundaVia({ registroId: 9, pessoa: p, documento: "RG" }).valido).toBe(false);
    expect(ck.validarPedidoSegundaVia({ registroId: 9, pessoa: { ref: "RESP:10" }, documento: "NADA" }).valido).toBe(false);
    expect(ck.validarPedidoSegundaVia({ registroId: 9, pessoa: { ref: "RESP:10" } }).valido).toBe(false);
  });
  test("pessoa autorizada: nome, parentesco, matrícula opcional, validade opcional e referência opcional", () => {
    const base = { menorId: 30, nome: "Dona Lúcia", parentesco: "AVO" };
    expect(ck.validarAutorizado(base)).toMatchObject({ valido: true, menorId: 30, nome: "Dona Lúcia", parentesco: "AVO", membroId: null, validoAte: null, referencia: null });
    expect(ck.validarAutorizado({ ...base, membroId: 44, validoAte: "2027-01-31", referencia: "Ficha 12/2026" })).toMatchObject({ valido: true, membroId: 44, validoAte: "2027-01-31", referencia: "Ficha 12/2026" });
    for (const extra of [{ membroId: "0x2c" }, { membroId: 0 }, { validoAte: "31/01/2027" }, { validoAte: "2027-02-30" }, { referencia: "ab" }, { referencia: "<x>abc" }, { parentesco: "XX" }, { nome: "<b>" }, { menorId: "x" }]) {
      expect(ck.validarAutorizado({ ...base, ...extra }).valido).toBe(false);
    }
  });
  test("saúde: texto de 2 a 400 caracteres sem marcação", () => {
    expect(ck.validarSaudeDaCrianca({ menorId: 30, texto: "Alergia a amendoim e a leite." })).toMatchObject({ valido: true, texto: "Alergia a amendoim e a leite.", referencia: null });
    for (const texto of ["a", "", "<b>x</b>", "a".repeat(401), 5, null, undefined]) expect(ck.validarSaudeDaCrianca({ menorId: 30, texto }).valido).toBe(false);
    expect(ck.validarSaudeDaCrianca({ menorId: "x", texto: "alergia" }).valido).toBe(false);
  });
  test("sala: serviço e equipe inteiros positivos", () => {
    expect(ck.validarSala({ servicoId: "5", equipeId: 7 })).toEqual({ valido: true, servicoId: 5, equipeId: 7 });
    expect(ck.validarSala({ servicoId: 5 }).valido).toBe(false);
    expect(ck.validarSala({ servicoId: "05", equipeId: 7 }).valido).toBe(false);
    expect(ck.validarSala().valido).toBe(false);
  });
});

describe("o que a tela mostra", () => {
  test("a etiqueta leva o primeiro nome e a inicial do último, nunca o nome inteiro", () => {
    expect(ck.nomeParaEtiqueta("Maria das Dores Souza Lima")).toBe("Maria L.");
    expect(ck.nomeParaEtiqueta("  davi   lima ")).toBe("davi L.");
    expect(ck.nomeParaEtiqueta("Davi")).toBe("Davi");
    expect(ck.nomeParaEtiqueta("")).toBe("");
    expect(ck.nomeParaEtiqueta(null)).toBe("");
  });
  test("a etiqueta traz o código e a saúde só se vier; o recibo orienta", () => {
    const e = ck.montarEtiqueta({ nomeCrianca: "Davi Lima", idade: 7, salaNome: "Infantil", congregacaoNome: "Central", codigo: "AB3K9Z", saudeTexto: null, instante: "2026-10-18T12:00:00.000Z" });
    expect(e).toMatchObject({ nome: "Davi L.", idade: 7, sala: "Infantil", congregacao: "Central", codigo: "AB3K9Z", saude: null });
    expect(e.orientacao).toMatch(/sem ele a criança não é entregue/);
    expect(ck.montarEtiqueta({ nomeCrianca: "Davi Lima", idade: 7, salaNome: "I", congregacaoNome: "C", codigo: "AB3K9Z", saudeTexto: "alergia a amendoim", instante: "x" }).saude).toBe("alergia a amendoim");
  });
  test("o histórico do responsável nunca leva código, voluntário, saúde nem motivo da liderança", () => {
    const linha = ck.linhaDoHistoricoParaResponsavel({
      registroId: 1, data: "2026-10-18", salaNome: "Infantil", congregacaoNome: "Central", entregueEm: "a", retiradoEm: "b", situacao: "RETIRADA", quemTrouxe: "Maria", quemRetirou: "Dona Lúcia", divergente: true,
      codigo: "AB3K9Z", CodigoHash: "h", saude: "alergia", operador: "Voluntário X", DivergenciaMotivo: "segredo"
    });
    expect(Object.keys(linha).sort()).toEqual(["congregacao", "data", "entregueEm", "quemRetirou", "quemTrouxe", "registroId", "retiradaDivergente", "retiradoEm", "rotuloSituacao", "sala", "situacao"]);
    expect(JSON.stringify(linha)).not.toMatch(/AB3K9Z|alergia|Voluntário|segredo/);
  });
  test("os avisos: ao responsável leva só o primeiro nome da criança; à liderança nunca leva nome de criança", () => {
    const pais = ck.textoRetiradaDivergentePais({ nomeCrianca: "Davi Souza Lima", salaNome: "Infantil" });
    expect(pais).toMatch(/Davi/);
    expect(pais).not.toMatch(/Souza|Lima/);
    const gestao = ck.textoRetiradaDivergenteGestao({ salaNome: "Infantil" });
    expect(gestao).toMatch(/Infantil/);
    expect(ck.textoSegundaVia({ nomeCrianca: "Davi Souza Lima", salaNome: "Infantil" })).not.toMatch(/Souza/);
    for (const t of [pais, gestao, ck.textoSemRetirada({ quantidade: 2, salaNome: "Infantil", data: "18/10/2026" }), ck.textoProfessorRetirado({ turmaNome: "Juniores" })]) expect(t.length).toBeLessThanOrEqual(1000);
    expect(ck.textoSemRetirada({ quantidade: 2, salaNome: "Infantil", data: "18/10/2026" })).not.toMatch(/\bnome\b/i);
  });
  test("as referências dos avisos são números que cabem no INT e mudam com o fato", () => {
    const a = ck.referenciaDeSemRetirada(1234, 7), b = ck.referenciaDeSemRetirada(1235, 7), c = ck.referenciaDeSemRetirada(1234, 8);
    for (const n of [a, b, c]) { expect(Number.isInteger(n)).toBe(true); expect(Math.abs(n)).toBeLessThan(2147483647); }
    expect(new Set([a, b, c]).size).toBe(3);
    const p1 = ck.referenciaDeProfessor(3, 900, "2026-10-15"), p2 = ck.referenciaDeProfessor(3, 900, "2026-10-16"), p3 = ck.referenciaDeProfessor(4, 900, "2026-10-15");
    for (const n of [p1, p2, p3]) { expect(Number.isInteger(n)).toBe(true); expect(n).toBeGreaterThan(0); expect(n).toBeLessThan(2147483647); }
    expect(new Set([p1, p2, p3]).size).toBe(3);
  });
});

describe("catálogos", () => {
  test("parentescos e documentos têm código curto (cabem nas colunas) e rótulo", () => {
    for (const [codigo, rotulo] of Object.entries(ck.PARENTESCOS)) { expect(codigo.length).toBeLessThanOrEqual(20); expect(rotulo.length).toBeGreaterThan(2); }
    for (const [codigo, rotulo] of Object.entries(ck.DOCUMENTOS)) { expect(codigo.length).toBeLessThanOrEqual(10); expect(rotulo.length).toBeGreaterThan(1); }
  });
  test("todo tipo de evento do código existe na regra de CHECK do banco (migração 145)", () => {
    const fs = require("fs");
    const sql = fs.readFileSync(require("path").join(__dirname, "..", "..", "..", "sql", "migrations", "145_checkin_infantil.sql"), "utf8");
    for (const tipo of Object.keys(ck.TIPOS_EVENTO)) expect(sql).toContain(`'${tipo}'`);
    for (const faixa of Object.keys(mm.FAIXAS)) expect(sql).toContain(`'${faixa}'`);
    for (const tipo of ["NA_SALA", "RETIRADA_PENDENTE", "RETIRADA"]) expect(sql).toContain(`'${tipo}'`);
    for (const d of Object.keys(ck.DOCUMENTOS)) expect(sql).toContain(`'${d}'`);
    for (const sigla of Object.values(ck.SIGLAS_PRAZO)) { expect(sigla.length).toBeLessThanOrEqual(40); expect(sql).toContain(`'${sigla}'`); }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Revisão adversarial da v7.10 (servidor): a regra pura do encerramento da sala, o motivo do pedido divergente, a referência do aviso sem colisão e o histórico da baixa
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("encerrar a sala (baixa administrativa) — a regra pura", () => {
  const aberta = ck.avaliarJanela({ servicoIso: "2026-10-18T09:00", agoraIso: "2026-10-18T10:00" });
  const fechada = ck.avaliarJanela({ servicoIso: "2026-10-18T09:00", agoraIso: "2026-10-18T15:30" });
  test("com o check-in aberto e criança na sala, a liderança NÃO encerra (a criança sai pela retirada com código)", () => {
    expect(aberta.aberta).toBe(true);
    const r = ck.avaliarEncerramentoDaSala({ janela: aberta, servicoStatus: "PUBLICADA", criancas: 3 });
    expect(r.ok).toBe(false);
    expect(r.mensagem).toBe(ck.MENSAGENS.SALA_AINDA_ABERTA);
    expect(r.mensagem).toMatch(/ainda está aberta/);
  });
  test("com o check-in fechado, ou sem criança, ou com o serviço fora de 'publicado' (cancelado), encerra", () => {
    expect(fechada.aberta).toBe(false);
    expect(ck.avaliarEncerramentoDaSala({ janela: fechada, servicoStatus: "PUBLICADA", criancas: 3 }).ok).toBe(true);
    expect(ck.avaliarEncerramentoDaSala({ janela: aberta, servicoStatus: "PUBLICADA", criancas: 0 }).ok).toBe(true);
    expect(ck.avaliarEncerramentoDaSala({ janela: aberta, servicoStatus: "CANCELADA", criancas: 4 }).ok).toBe(true);
    expect(ck.avaliarEncerramentoDaSala({ janela: aberta, servicoStatus: "RASCUNHO", criancas: 1 }).ok).toBe(true);
  });
  test("o corpo: sala com identificadores estritos e motivo de 5 a 300 caracteres, texto sem marcação", () => {
    const ok = ck.validarEncerramentoSala({ servicoId: 5, equipeId: 7, motivo: "  Os voluntários   esqueceram o registro.  " });
    expect(ok).toMatchObject({ valido: true, servicoId: 5, equipeId: 7, motivo: "Os voluntários esqueceram o registro." });
    for (const motivo of [undefined, null, "", "    ", "abcd", "<b>motivo</b>", "x".repeat(301), ["motivo longo"], 12345678, {}]) expect(ck.validarEncerramentoSala({ servicoId: 5, equipeId: 7, motivo }).valido).toBe(false);
    expect(ck.validarEncerramentoSala({ servicoId: 5, equipeId: 7, motivo: "abcde" }).valido).toBe(true);
    expect(ck.validarEncerramentoSala({ servicoId: 5, equipeId: 7, motivo: "x".repeat(300) }).valido).toBe(true);
    for (const sala of [{}, { servicoId: 5 }, { servicoId: "05", equipeId: 7 }, { servicoId: 5.5, equipeId: 7 }, { servicoId: 5, equipeId: "7; x" }]) expect(ck.validarEncerramentoSala({ ...sala, motivo: "motivo válido" }).valido).toBe(false);
  });
  test("o histórico ganha o evento da baixa e o do encerramento, e o código do evento cabe na coluna", () => {
    expect(ck.TIPOS_EVENTO.BAIXA_ADMINISTRATIVA).toMatch(/Baixa administrativa/);
    expect(ck.TIPOS_EVENTO.SALA_ENCERRADA).toMatch(/Sala encerrada/);
    for (const tipo of Object.keys(ck.TIPOS_EVENTO)) expect(tipo.length).toBeLessThanOrEqual(32);
  });
});

describe("motivo do pedido de retirada divergente (opcional, texto sem marcação, até 300 caracteres)", () => {
  const lista = [];
  const base = { nome: "Roberto Dias", parentesco: "AMIGO_FAMILIA", documento: "RG" };
  test("sem motivo: continua valendo (motivo nulo); com motivo, vai limpo", () => {
    expect(ck.classificarRetirante({ outro: base }, lista)).toMatchObject({ divergente: true, motivo: null });
    expect(ck.classificarRetirante({ outro: { ...base, motivo: "" } }, lista).motivo).toBeNull();
    expect(ck.classificarRetirante({ outro: { ...base, motivo: "  A mãe   mandou buscar. " } }, lista).motivo).toBe("A mãe mandou buscar.");
  });
  test("motivo ruim é recusado ANTES de qualquer tentativa (a regra pura devolve erro)", () => {
    for (const motivo of ["<b>x</b>", "x".repeat(301), "ab", ["mãe"], 12345, {}]) expect(ck.classificarRetirante({ outro: { ...base, motivo } }, lista).erro).toBeTruthy();
  });
  test("quem retira da lista (ref) nunca leva motivo", () => {
    const r = ck.classificarRetirante({ ref: "RESP:10" }, [{ ref: "RESP:10", tipo: "RESPONSAVEL", membroId: 10, nome: "Maria" }]);
    expect(r.motivo).toBeUndefined();
  });
});

describe("a referência do aviso 'sem retirada' não tem colisão (achado C21)", () => {
  test("a equipe 5 e a equipe 105 do MESMO serviço têm referências diferentes (antes: o resto da divisão por 100 as juntava e o segundo aviso sumia)", () => {
    expect(ck.referenciaDeSemRetirada(1234, 5)).not.toBe(ck.referenciaDeSemRetirada(1234, 105));
    const vistas = new Set();
    for (let s = 1; s <= 60; s++) for (let e = 1; e <= 250; e++) vistas.add(ck.referenciaDeSemRetirada(s, e));
    expect(vistas.size).toBe(60 * 250);
  });
  test("cabe no INT (a coluna é INT) e é determinística, inclusive fora da faixa comum", () => {
    for (const [s, e] of [[1, 1], [1999999, 999], [2000000, 1], [123456789, 5000], [2147483647, 2147483647]]) {
      const a = ck.referenciaDeSemRetirada(s, e), b = ck.referenciaDeSemRetirada(s, e);
      expect(Number.isInteger(a)).toBe(true); expect(a).toBeGreaterThan(0); expect(a).toBeLessThanOrEqual(2147483647); expect(a).toBe(b);
    }
  });
});

describe("o histórico do responsável e a etiqueta depois da revisão", () => {
  const linha = { registroId: 1, data: "2026-10-18", salaNome: "Infantil", congregacaoNome: "Central", entregueEm: "2026-10-18T12:00:00.000Z", retiradoEm: "2026-10-18T19:00:00.000Z", situacao: "RETIRADA", quemTrouxe: "Maria", quemRetirou: null, divergente: false };
  test("a baixa administrativa NÃO aparece como retirada: sem 'retirado em', sem quem retirou, com o rótulo e o horário do encerramento", () => {
    const h = ck.linhaDoHistoricoParaResponsavel({ ...linha, baixaAdministrativa: true, quemRetirou: "Fulano que não devia aparecer" });
    expect(h).toMatchObject({ situacao: "RETIRADA", baixaAdministrativa: true, retiradoEm: null, quemRetirou: null, encerradaEm: "2026-10-18T19:00:00.000Z" });
    expect(h.rotuloSituacao).toMatch(/Encerrada pela liderança/);
    expect(JSON.stringify(h)).not.toMatch(/Fulano|motivo/i);
  });
  test("a linha comum não ganha campo nenhum (a tela antiga continua igual)", () => {
    expect(Object.keys(ck.linhaDoHistoricoParaResponsavel(linha)).sort()).toEqual(["congregacao", "data", "entregueEm", "quemRetirou", "quemTrouxe", "registroId", "retiradaDivergente", "retiradoEm", "rotuloSituacao", "sala", "situacao"]);
  });
  test("a etiqueta: 'instante' é a hora da entrada; 'segundaViaEm' só existe na segunda via", () => {
    const orig = ck.montarEtiqueta({ nomeCrianca: "Davi Lima", idade: 7, salaNome: "I", congregacaoNome: "C", codigo: "AB3K9Z", saudeTexto: null, instante: "2026-10-18T12:00:00.000Z" });
    expect("segundaViaEm" in orig).toBe(false);
    const via = ck.montarEtiqueta({ nomeCrianca: "Davi Lima", idade: 7, salaNome: "I", congregacaoNome: "C", codigo: "AB3K9Z", saudeTexto: null, instante: "2026-10-18T12:00:00.000Z", segundaViaEm: "2026-10-18T14:30:00.000Z" });
    expect(via).toMatchObject({ instante: "2026-10-18T12:00:00.000Z", segundaViaEm: "2026-10-18T14:30:00.000Z" });
  });
  test("os avisos novos: o da liderança manda ao botão 'Encerrar a sala'; o das autorizações sem efeito nunca leva nome de criança; todos cabem em 1000", () => {
    const sem = ck.textoSemRetirada({ quantidade: 2, salaNome: "Infantil", data: "18/10/2026" });
    expect(sem).toMatch(/Encerrar a sala/);
    const dep = ck.textoAutorizadosDeixaramDeValer({ quantidade: 3 });
    expect(dep).toMatch(/^3 autorização\(ões\)/);
    for (const t of [sem, dep, ck.MENSAGENS.SEM_AVISO_LIDERANCA, ck.MENSAGENS.SEM_AVISO_RESPONSAVEIS, ck.MENSAGENS.SALA_AINDA_ABERTA]) expect(t.length).toBeLessThanOrEqual(1000);
    expect(ck.MENSAGENS.SEM_AVISO_LIDERANCA).toMatch(/NÃO foi avisada/);
  });
});
