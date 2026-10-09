// A regra pura da v7.8 (incidentes, notificação obrigatória e escuta protegida): o relógio de 24 horas, a validação de cada ato, o que fecha um caso, o Comitê e o
// padrão de pequenas quebras. O banco e as rotas têm testes próprios.
const pm = require("../protecaoMenores");

const AGORA = new Date("2026-10-09T15:00:00.000Z");
const HOJE = "2026-10-09";
const base = (extra = {}) => ({ nivel: "QUEBRA_POLITICA", dataOcorrencia: "2026-10-08", congregacaoId: 3, descricao: "Um adulto ficou a sós com uma criança na sala.", ...extra });
const alegacao = (extra = {}) => base({ nivel: "ALEGACAO", relatadoPor: "VOLUNTARIO", relato: "A criança disse, com as palavras dela, que o tio a machucou.", ...extra });

describe("o relógio das 24 horas", () => {
  test("o prazo é a ciência + 24 horas, e o relógio muda de faixa em 12 h e em 4 h", () => {
    const conhecido = new Date("2026-10-09T15:00:00.000Z");
    const prazo = pm.prazoNotificacao(conhecido);
    expect(prazo.toISOString()).toBe("2026-10-10T15:00:00.000Z");
    const faixa = (horasDepois) => pm.relogio(prazo, new Date(conhecido.getTime() + horasDepois * 3600000)).faixa;
    expect([faixa(0), faixa(11), faixa(12), faixa(19.9), faixa(20), faixa(23.9), faixa(24), faixa(30)]).toEqual(["NORMAL", "NORMAL", "ATENCAO", "ATENCAO", "CRITICO", "CRITICO", "VENCIDO", "VENCIDO"]);
    expect(pm.relogio(prazo, conhecido)).toMatchObject({ vencido: false, horasRestantes: 24, texto: "faltam 24 h 00 min" });
    expect(pm.relogio(prazo, new Date("2026-10-10T17:30:00.000Z"))).toMatchObject({ vencido: true, texto: "vencido há 2 h 30 min" });
    expect(pm.relogio(prazo, new Date("2026-10-10T14:45:00.000Z")).texto).toBe("faltam 15 min");
  });
  test("data inválida não quebra: devolve relógio neutro", () => {
    expect(pm.prazoNotificacao("lixo")).toBeNull();
    expect(pm.relogio(null, AGORA)).toMatchObject({ restanteMs: null, vencido: false, faixa: "NORMAL" });
  });
  test("as etapas de aviso: nada até 12 h; 12 h; 4 h; vencido (repete de 6 em 6 horas)", () => {
    const prazo = new Date("2026-10-10T15:00:00.000Z");
    const em = (h) => pm.etapaDeAviso(prazo, new Date(prazo.getTime() - h * 3600000));
    expect(em(13)).toBeNull();
    expect(em(12)).toMatchObject({ codigo: "DOZE_HORAS", bloco: 1 });
    expect(em(5)).toMatchObject({ codigo: "DOZE_HORAS" });
    expect(em(4)).toMatchObject({ codigo: "QUATRO_HORAS", bloco: 2 });
    expect(em(0)).toMatchObject({ codigo: "VENCIDO_0", bloco: 3 });
    expect(em(-5).codigo).toBe("VENCIDO_0");
    expect(em(-6).codigo).toBe("VENCIDO_1");
    expect(em(-13).codigo).toBe("VENCIDO_2");
    expect(em(-24).codigo).toBe("VENCIDO_4");
    expect(em(-30)).toBeNull();                 // depois de 5 avisos vencidos o caso não gera mais aviso próprio (o resumo diário assume)
    expect(em(-5000)).toBeNull();
    // a referência é um INT por incidente × etapa e não colide entre incidentes
    const refs = new Set([1, 2, 3].flatMap((i) => [1, 2, 3, 4].map((b) => pm.referenciaDoAviso(i, b))));
    expect(refs.size).toBe(12);
    expect(pm.referenciaDoAviso(2000000, 999999)).toBeLessThan(2147483647);
  });
});

describe("registrar um incidente", () => {
  test("quebra de política: o relato é opcional; alegação: quem relatou e o relato são obrigatórios", () => {
    expect(pm.validarIncidente(base(), { hoje: HOJE, agora: AGORA })).toMatchObject({ valido: true, dados: { nivel: "QUEBRA_POLITICA", exigeComunicacao: false, relato: null, onde: null, equipeId: null, origem: "MEMBRO" } });
    const sem = pm.validarIncidente(base({ nivel: "ALEGACAO" }), { hoje: HOJE, agora: AGORA });
    expect(sem.valido).toBe(false);
    expect(sem.mensagem).toMatch(/quem contou/);
    expect(pm.validarIncidente(alegacao({ relato: "curto" }), { hoje: HOJE, agora: AGORA }).mensagem).toMatch(/do jeito que foi contado/);
    expect(pm.validarIncidente(alegacao({ relatadoPor: "ELE_MESMO" }), { hoje: HOJE, agora: AGORA }).valido).toBe(false);
    const ok = pm.validarIncidente(alegacao({ envolvidoMembroId: "77", equipeId: 5, onde: "Sala do maternal" }), { hoje: HOJE, agora: AGORA });
    expect(ok).toMatchObject({ valido: true, dados: { exigeComunicacao: true, envolvidoMembroId: 77, equipeId: 5, relatadoPor: "VOLUNTARIO" } });
  });
  test("a ciência: 'soubemos há N horas' recua o início do relógio; limites e tipos", () => {
    const r = pm.validarIncidente(alegacao({ conhecidoHaHoras: 10 }), { hoje: HOJE, agora: AGORA });
    expect(r.dados.conhecidoEm.toISOString()).toBe("2026-10-09T05:00:00.000Z");
    expect(pm.validarIncidente(alegacao(), { hoje: HOJE, agora: AGORA }).dados.conhecidoEm.toISOString()).toBe(AGORA.toISOString());
    for (const ruim of [-1, 721, 1.5, "abc", NaN]) expect(pm.validarIncidente(alegacao({ conhecidoHaHoras: ruim }), { hoje: HOJE, agora: AGORA }).valido).toBe(false);
  });
  test("recusas: nível, data, congregação, equipe, texto com marca, ids tortos", () => {
    const v = (extra) => pm.validarIncidente(base(extra), { hoje: HOJE, agora: AGORA });
    expect(v({ nivel: "OUTRO" }).valido).toBe(false);
    expect(v({ nivel: undefined }).valido).toBe(false);
    expect(v({ dataOcorrencia: "2026-10-10" }).mensagem).toMatch(/futuro/);
    expect(v({ dataOcorrencia: "ontem" }).valido).toBe(false);
    expect(v({ congregacaoId: "0x10" }).valido).toBe(false);
    expect(v({ congregacaoId: 0 }).valido).toBe(false);
    expect(v({ equipeId: "1e1" }).valido).toBe(false);
    expect(v({ descricao: "curta" }).valido).toBe(false);
    expect(v({ descricao: "<b>fato</b> acontecido ontem" }).valido).toBe(false);
    expect(v({ onde: "x".repeat(151) }).valido).toBe(false);
    expect(v({ envolvidoMembroId: "abc" }).valido).toBe(false);
    expect(v({ envolvidoNome: "<i>Fulano</i>" }).valido).toBe(false);
    expect(pm.validarIncidente(null, { hoje: HOJE, agora: AGORA }).valido).toBe(false);
    expect(pm.validarIncidente([], { hoje: HOJE, agora: AGORA }).valido).toBe(false);
  });
  test("o pedido de ajuda (canal sem login): só o texto é obrigatório; sem campo de pergunta", () => {
    expect(pm.validarPedidoDeAjuda({ texto: "Um adulto me tocou e eu não gostei." }, { hoje: HOJE, agora: AGORA })).toMatchObject({ valido: true, dados: { congregacaoId: null, contato: null, quemSou: null } });
    expect(pm.validarPedidoDeAjuda({ texto: "curto" }).valido).toBe(false);
    expect(pm.validarPedidoDeAjuda({ texto: "<script>alert(1)</script> isso" }).valido).toBe(false);
    expect(pm.validarPedidoDeAjuda({ texto: "Escrevo para pedir ajuda com a minha prima.", quemSou: "RESPONSAVEL", contato: "WhatsApp 91 99999-0000", congregacaoId: "4" }).dados).toMatchObject({ quemSou: "RESPONSAVEL", congregacaoId: 4, contato: "WhatsApp 91 99999-0000" });
    expect(pm.validarPedidoDeAjuda({ texto: "Escrevo para pedir ajuda com a minha prima.", quemSou: "PAPAI_NOEL" }).valido).toBe(false);
    expect(pm.validarPedidoDeAjuda({ texto: "Escrevo para pedir ajuda com a minha prima.", congregacaoId: "x" }).valido).toBe(false);
    expect(pm.validarPedidoDeAjuda({ texto: "Escrevo para pedir ajuda com a minha prima.", contato: "x".repeat(151) }).valido).toBe(false);
  });
});

describe("comunicação externa e encerramento", () => {
  const conhecido = new Date("2026-10-09T10:00:00.000Z");
  const com = (extra = {}) => ({ orgao: "CONSELHO_TUTELAR", forma: "OFICIO", comunicadoEm: "2026-10-09T13:00:00.000Z", ...extra });
  test("valida órgão, forma, hora (nem futura nem antes da ciência) e comprovante opcional", () => {
    expect(pm.validarComunicacaoExterna(com({ protocoloExterno: "CT-2026/118" }), { agora: AGORA, conhecidoEm: conhecido })).toMatchObject({ valido: true, dados: { orgao: "CONSELHO_TUTELAR", protocoloExterno: "CT-2026/118", referenciaArquivo: null } });
    expect(pm.validarComunicacaoExterna(com({ orgao: "VIZINHO" }), { agora: AGORA }).valido).toBe(false);
    expect(pm.validarComunicacaoExterna(com({ forma: "POMBO" }), { agora: AGORA }).valido).toBe(false);
    expect(pm.validarComunicacaoExterna(com({ comunicadoEm: "2026-10-09T16:00:00.000Z" }), { agora: AGORA }).mensagem).toMatch(/futuro/);
    expect(pm.validarComunicacaoExterna(com({ comunicadoEm: "2026-10-09T08:00:00.000Z" }), { agora: AGORA, conhecidoEm: conhecido }).mensagem).toMatch(/anterior/);
    expect(pm.validarComunicacaoExterna(com({ comunicadoEm: "lixo" }), { agora: AGORA }).valido).toBe(false);
    expect(pm.validarComunicacaoExterna(com({ protocoloExterno: "<x>" }), { agora: AGORA }).valido).toBe(false);
    expect(pm.validarComunicacaoExterna(com({ referenciaArquivo: "y".repeat(201) }), { agora: AGORA }).valido).toBe(false);
    for (const ruim of ["-", "x", "n/a", "0000", "sem protocolo"]) {
      expect(pm.validarComunicacaoExterna(com({ protocoloExterno: ruim }), { agora: AGORA }).mensagem).toMatch(/incompleto/);
      expect(pm.validarComunicacaoExterna(com({ referenciaArquivo: ruim }), { agora: AGORA }).mensagem).toMatch(/com clareza/);
    }
  });
  test("comprovante = protocolo do órgão, lugar onde o papel está guardado ou arquivo anexado; fora do prazo é marcado", () => {
    expect(pm.temComprovante({ protocoloExterno: "CT-2026/118" })).toBe(true);
    expect(pm.temComprovante({ referenciaArquivo: "Pasta 4, ofício 12" })).toBe(true);
    for (const vazio of ["-", "x", "0", ".", "n/a", "N/A", "sem protocolo", "teste", "0000", "xxxx", "1234", "123", "não tem", "   ", "--- ---"]) {
      expect(pm.temComprovante({ protocoloExterno: vazio })).toBe(false);
      expect(pm.temComprovante({ referenciaArquivo: vazio })).toBe(false);
    }
    expect(pm.temComprovante({ temAnexo: true })).toBe(true);
    expect(pm.temComprovante({})).toBe(false);
    expect(pm.temComprovante(null)).toBe(false);
    const prazo = "2026-10-10T10:00:00.000Z";
    expect(pm.foraDoPrazo("2026-10-10T09:59:00.000Z", prazo)).toBe(false);
    expect(pm.foraDoPrazo("2026-10-10T10:00:01.000Z", prazo)).toBe(true);
  });
  test("a suspeita de violência só encerra com comunicação COM comprovante e com a decisão do Comitê sobre o afastamento", () => {
    const i = { nivel: "ALEGACAO", status: "ABERTO" };
    expect(pm.podeEncerrar(i, [], []).motivos[0]).toMatch(/Falta registrar a comunicação/);
    expect(pm.podeEncerrar(i, [{ orgao: "CONSELHO_TUTELAR" }], []).motivos[0]).toMatch(/falta o comprovante/);
    expect(pm.podeEncerrar(i, [{ protocoloExterno: "-" }], []).motivos[0]).toMatch(/falta o comprovante/);        // "-" não é comprovante
    expect(pm.podeEncerrar(i, [{ protocoloExterno: "CT-001" }], [{ membroId: 9, nivelAlegacao: true, decisao: null }]).motivos[0]).toMatch(/Comitê decidir/);
    expect(pm.podeEncerrar(i, [{ protocoloExterno: "CT-001" }], [{ membroId: 9, nivelAlegacao: true, decisao: "MANTIDO_AFASTADO" }]).ok).toBe(true);
    expect(pm.podeEncerrar(i, [{ protocoloExterno: "CT-001" }], [{ membroId: 9, nivelAlegacao: true, decisao: "LIBERADO" }]).ok).toBe(true);
    expect(pm.podeEncerrar(i, [{ temAnexo: true }], []).ok).toBe(true);                                        // o arquivo anexado ao incidente vale como comprovante
    expect(pm.podeEncerrar(i, [{ protocoloExterno: "CT-001" }], [{ membroId: null, nivelAlegacao: true, decisao: null }]).ok).toBe(true);       // envolvido que não é do cadastro não tem afastamento
    // pedido do canal sem conteúdo de proteção: arquiva sem comunicar — mas não se há alguém do cadastro vinculado como envolvido
    expect(pm.podeEncerrar({ nivel: "ALEGACAO", status: "ABERTO", semConteudo: true }, [], []).ok).toBe(true);
    expect(pm.podeEncerrar({ nivel: "ALEGACAO", status: "ABERTO", semConteudo: true }, [], [{ membroId: 9 }]).ok).toBe(false);
    expect(pm.podeEncerrar({ nivel: "QUASE_ACIDENTE", status: "ABERTO" }, [], []).ok).toBe(true);
    expect(pm.podeEncerrar({ nivel: "QUEBRA_POLITICA", status: "ENCERRADO" }, [], []).ok).toBe(false);
    expect(pm.podeEncerrar(null).ok).toBe(false);
  });
  test("o resultado do encerramento acompanha o nível: violência só 'encaminhado às autoridades'", () => {
    const e = (r, nivel, p = "Conversamos com a equipe e reforçamos a regra dos dois adultos.") => pm.validarEncerramento({ resultado: r, providencia: p }, { nivel });
    expect(e("ENCAMINHADO_AUTORIDADE", "ALEGACAO", "Comunicado ao Conselho Tutelar, protocolo registrado.").valido).toBe(true);
    expect(e("SEM_CONTINUIDADE", "ALEGACAO").mensagem).toMatch(/apuração não é da Igreja/);
    expect(e("ENCAMINHADO_AUTORIDADE", "QUEBRA_POLITICA").mensagem).toMatch(/reclassifique/);
    expect(e("MEDIDA_INTERNA", "QUEBRA_POLITICA").valido).toBe(true);
    expect(e("OUTRO", "QUEBRA_POLITICA").valido).toBe(false);
    // "sem conteúdo de proteção": só para o canal sem login
    const sc = (origem, nivel = "ALEGACAO") => pm.validarEncerramento({ resultado: "SEM_CONTEUDO_DE_PROTECAO", providencia: "Texto de teste, sem nenhum relato de violência." }, { nivel, origem });
    expect(sc("CANAL_AJUDA").valido).toBe(true);
    expect(sc("MEMBRO").valido).toBe(false);
    expect(sc("CANAL_AJUDA", "QUEBRA_POLITICA").valido).toBe(false);
    expect(pm.validarEncerramento({ resultado: "SEM_CONTEUDO_DE_PROTECAO", providencia: "curto" }, { nivel: "ALEGACAO", origem: "CANAL_AJUDA" }).valido).toBe(false);
    expect(e("MEDIDA_INTERNA", "QUEBRA_POLITICA", "curto").valido).toBe(false);
    expect(e("MEDIDA_INTERNA", "QUEBRA_POLITICA", "<b>feito</b> assim assim").valido).toBe(false);
  });
  test("reclassificar só sobe de nível; ao virar suspeita de violência pede o relato", () => {
    const r = (extra, nivelAtual = "QUEBRA_POLITICA") => pm.validarReclassificacao({ nivelNovo: "ALEGACAO", motivo: "A criança contou algo mais grave depois.", relatadoPor: "PROPRIA_CRIANCA", relato: "Ela disse que o tio a machucou de verdade.", ...extra }, { nivelAtual, agora: AGORA });
    expect(r({}).valido).toBe(true);
    expect(r({}).dados.conhecidoEm.toISOString()).toBe(AGORA.toISOString());
    expect(r({}, "ALEGACAO").mensagem).toMatch(/nunca é rebaixada/);
    expect(r({ nivelNovo: "QUASE_ACIDENTE" }, "ALEGACAO").valido).toBe(false);
    expect(r({ relato: undefined }).valido).toBe(false);
    expect(r({ relatadoPor: undefined }).valido).toBe(false);
    expect(r({ motivo: "curto" }).valido).toBe(false);
    expect(pm.validarReclassificacao({ nivelNovo: "QUEBRA_POLITICA", motivo: "Mais grave que um quase-acidente." }, { nivelAtual: "QUASE_ACIDENTE" }).valido).toBe(true);
  });
});

describe("afastamento cautelar", () => {
  test("ninguém decide sobre o próprio afastamento; a decisão e o motivo são obrigatórios", () => {
    const d = (extra, ator = 1, membro = 9) => pm.validarDecisaoCautelar({ decisao: "MANTIDO_AFASTADO", observacao: "O Comitê decidiu manter até a apuração das autoridades.", ...extra }, { atorId: ator, membroId: membro });
    expect(d({}).valido).toBe(true);
    expect(d({}, 9, 9).mensagem).toMatch(/próprio afastamento/);
    expect(d({ decisao: "TALVEZ" }).valido).toBe(false);
    expect(d({ observacao: "curto" }).valido).toBe(false);
    expect(d({ observacao: "<b>x</b> motivo longo o bastante" }).valido).toBe(false);
  });
});

describe("o padrão de pequenas quebras", () => {
  const ev = (id, extra = {}) => ({ incidenteId: id, nivel: "QUEBRA_POLITICA", equipeId: 4, envolvidoMembroId: null, data: "2026-09-20", ...extra });
  test("três registros em 90 dias na mesma equipe (ou na mesma pessoa) formam um padrão; alegação não entra", () => {
    const p = pm.padraoDeQuebras([ev(1), ev(2), ev(3), ev(4, { equipeId: 9 })], { hoje: HOJE });
    expect(p).toEqual([{ tipo: "EQUIPE", id: 4, total: 3, incidentes: [1, 2, 3] }]);
    const pessoa = pm.padraoDeQuebras([1, 2, 3].map((i) => ev(i, { equipeId: null, envolvidoMembroId: 55 })), { hoje: HOJE });
    expect(pessoa).toEqual([{ tipo: "PESSOA", id: 55, total: 3, incidentes: [1, 2, 3] }]);
    expect(pm.padraoDeQuebras([ev(1), ev(2), ev(3, { nivel: "ALEGACAO" })], { hoje: HOJE })).toEqual([]);
  });
  test("fora da janela de 90 dias, no futuro ou com data torta não conta; o mesmo incidente conta uma vez", () => {
    expect(pm.padraoDeQuebras([ev(1), ev(2), ev(3, { data: "2026-06-01" })], { hoje: HOJE })).toEqual([]);
    expect(pm.padraoDeQuebras([ev(1), ev(2), ev(3, { data: "2026-12-01" })], { hoje: HOJE })).toEqual([]);
    expect(pm.padraoDeQuebras([ev(1), ev(2), ev(3, { data: "lixo" })], { hoje: HOJE })).toEqual([]);
    expect(pm.padraoDeQuebras([ev(1), ev(1), ev(2)], { hoje: HOJE })).toEqual([]);
    expect(pm.padraoDeQuebras(null, { hoje: HOJE })).toEqual([]);
  });
  test("a referência do aviso muda quando o total cresce e cabe em INT", () => {
    const a = pm.referenciaDoPadrao("EQUIPE", 4, 3), b = pm.referenciaDoPadrao("EQUIPE", 4, 4), c = pm.referenciaDoPadrao("PESSOA", 4, 3);
    expect(new Set([a, b, c]).size).toBe(3);
    expect(pm.referenciaDoPadrao("PESSOA", 999999, 99)).toBeLessThan(2147483647);
  });
});

describe("o Comitê de Proteção", () => {
  test("a composição precisa de 3 membros e de pelo menos um leigo; o cargo vem do cadastro (nunca digitado)", () => {
    const m = (id, cargo, extra = {}) => ({ membroId: id, cargoMinisterial: cargo, ...extra });
    const ruim = pm.avaliarComposicao([m(1, "PASTOR"), m(2, "PRESBITERO"), m(3, "DIACONO")]);
    expect(ruim).toMatchObject({ total: 3, clericos: 3, leigos: 0, ok: false });
    expect(ruim.problemas[0]).toMatch(/não seja do clero/);
    const bom = pm.avaliarComposicao([m(1, "PASTOR"), m(2, "MEMBRO"), m(3, null), m(4, "AUXILIAR", { ativo: false })]);
    expect(bom).toMatchObject({ total: 3, clericos: 1, leigos: 2, ok: true });
    expect(pm.avaliarComposicao([m(1, "MEMBRO")]).problemas).toHaveLength(1);
    expect(pm.avaliarComposicao([]).problemas).toHaveLength(2);
    expect(pm.avaliarComposicao(undefined).ok).toBe(false);
    expect(pm.ehClerigo("pastor")).toBe(true);
    expect(pm.ehClerigo("MEMBRO")).toBe(false);
    expect(pm.ehClerigo(undefined)).toBe(false);
  });
});

describe("os textos dos avisos", () => {
  test("nenhum aviso leva nome, conteúdo de relato nem tipo de violência além do que o nível diz; o prazo vai em horário de Brasília", () => {
    expect(pm.formatarPrazo("2026-10-10T15:00:00.000Z")).toBe("10/10 às 12h00");
    const textos = [
      pm.textoIncidenteNovo({ nivel: "ALEGACAO", prazoEm: "2026-10-10T15:00:00.000Z" }), pm.textoIncidenteNovo({ nivel: "QUEBRA_POLITICA", prazoEm: null }),
      pm.textoPrazo({ etapa: "DOZE_HORAS", prazoEm: "2026-10-10T15:00:00.000Z" }), pm.textoPrazo({ etapa: "QUATRO_HORAS", prazoEm: "2026-10-10T15:00:00.000Z" }), pm.textoPrazo({ etapa: "VENCIDO_0", prazoEm: "2026-10-10T15:00:00.000Z" }),
      pm.textoPadrao({ tipo: "EQUIPE", total: 3 }), pm.textoComiteIncompleto({ problemas: ["falta leigo."] }), pm.textoCautelarSemDecisao({ dias: 4 }), pm.textoCautelarPessoa(), pm.textoCautelarLevantada(), pm.textoConfirmacaoDeAjuda(), pm.textoResumoDiario({ vencidas: 2, semComprovante: 1 }), pm.textoArquivadoSemConteudo(), pm.textoRetiradaCautelar({ equipes: ["Berçário"], nEscalas: 2 })
    ];
    for (const t of textos) { expect(typeof t).toBe("string"); expect(t.length).toBeGreaterThan(20); expect(t.length).toBeLessThanOrEqual(1000); expect(t).not.toMatch(/<|>/); }
    expect(textos[0]).toMatch(/até 24 horas.*10\/10 às 12h00/);
    expect(pm.textoCautelarPessoa()).not.toMatch(/alega|suspeita|incidente|violência|abuso/i);        // a pessoa afastada não lê o motivo
    expect(textos[4]).toMatch(/PRAZO VENCIDO/);
    expect(pm.textoConfirmacaoDeAjuda()).toMatch(/190/);
    expect(pm.textoConfirmacaoDeAjuda()).toMatch(/100/);
  });
  test("a orientação da escuta protegida: acolher, registrar, encaminhar; e o que NÃO fazer", () => {
    expect(pm.ROTEIRO_ESCUTA.map((p) => p.passo)).toEqual(["1. Acolher", "2. Registrar o que foi dito", "3. Encaminhar"]);
    expect(pm.NAO_FACA.join(" ")).toMatch(/Não faça perguntas/);
    expect(pm.CONTATOS_DE_AJUDA.map((c) => c.numero)).toEqual(["100", "190", null]);
    // não existe nenhum campo/etapa de "inquirição"
    expect(JSON.stringify(pm.ROTEIRO_ESCUTA)).not.toMatch(/interrog|inquir(ir|ição) a|pergunte/i);
  });
});
