// Testes da regra pura do voluntariado (v7.5): o Termo de Adesão e a prova do aceite, o rodízio por grupos (a conta que decide quem serve
// em cada data), a trava de habitualidade e a remoção da escala. Sem banco.
const crypto = require("crypto");
const v = require("../voluntariado");
const hv = require("../habilitacaoVoluntarios");

const HOJE = "2026-10-01"; // quinta-feira
const rodizioBase = (extra = {}) => ({ nome: "Limpeza do templo", equipeId: 4, diaSemana: 6, hora: "08:00", intervaloSemanas: 1, dataAncora: "2026-10-03", ...extra });
const grupos3 = [{ grupoId: 11, nome: "Grupo A", ordem: 1 }, { grupoId: 12, nome: "Grupo B", ordem: 2 }, { grupoId: 13, nome: "Grupo C", ordem: 3 }];
const rodizioPlano = (extra = {}) => ({ dataAncora: "2026-10-03", diaSemana: 6, intervaloSemanas: 1, hora: "08:00", ...extra });

describe("Termo de Adesão — o texto e o que o torna prova", () => {
  test("traz a frase de aceite do Regimento (Art. 133 §8º, II, a) e cada item cita o dispositivo", () => {
    const t = v.termoVigente();
    expect(t.aceite).toBe("Li, aceito as normas estatutárias e concordo com o regime de trabalho voluntário");
    expect(t.itens.map(i => i.codigo)).toEqual(["NATUREZA", "OBJETO", "AUTONOMIA", "DESPESAS", "SEM_REMUNERACAO", "REMOCAO", "CIENCIA", "REGISTRO"]);
    for (const i of t.itens) { expect(i.texto.length).toBeGreaterThan(40); expect(i.base).toMatch(/Regimento|Lei 9\.608/); }
  });
  test("o termo diz o que a Lei 9.608/98 exige: voluntário, sem vínculo, objeto e condições, despesas só se autorizadas", () => {
    const todo = v.TERMO_ITENS.map(i => i.texto).join(" ");
    expect(todo).toMatch(/sem receber qualquer pagamento/);
    expect(todo).toMatch(/não existe, nem passará a existir, vínculo de emprego/);
    expect(v.TERMO_ITENS.find(i => i.codigo === "OBJETO").base).toMatch(/art\. 2º/);
    expect(todo).toMatch(/Ordem de Serviço escrita e assinada ANTES da despesa/);
  });
  test("o termo informa que o IP, a data e a hora são guardados (transparência com o titular)", () => {
    expect(v.TERMO_ITENS.find(i => i.codigo === "REGISTRO").texto).toMatch(/IP, a data e a hora/);
  });
  test("o hash é o sha256 do conteúdo e muda se qualquer palavra mudar", () => {
    const igual = crypto.createHash("sha256").update(JSON.stringify({ v: v.TERMO_VERSAO, t: v.TERMO_TITULO, i: v.TERMO_ITENS, a: v.TERMO_ACEITE })).digest("hex");
    expect(v.TERMO_HASH).toBe(igual);
    const alterado = crypto.createHash("sha256").update(JSON.stringify({ v: v.TERMO_VERSAO, t: v.TERMO_TITULO, i: v.TERMO_ITENS.map((x, k) => k === 0 ? { ...x, texto: x.texto + "." } : x), a: v.TERMO_ACEITE })).digest("hex");
    expect(alterado).not.toBe(v.TERMO_HASH);
    expect(v.TERMO_HASH).toMatch(/^[0-9a-f]{64}$/);
  });
  test("termoVigente devolve cópia: mexer no resultado não altera o texto de verdade", () => {
    const t = v.termoVigente();
    t.itens[0].texto = "adulterado";
    expect(v.TERMO_ITENS[0].texto).not.toBe("adulterado");
  });
  test("o texto da ratificação menciona o Art. 133, a Lei 9.608 e a convalidação do período anterior", () => {
    expect(v.RATIFICACAO_TEXTO).toMatch(/Art\. 133/);
    expect(v.RATIFICACAO_TEXTO).toMatch(/Lei nº 9\.608\/1998/);
    expect(v.RATIFICACAO_TEXTO).toMatch(/convalido todo o período anterior/);
    expect(v.ratificacaoVigente().hash).toBe(v.RATIFICACAO_HASH);
  });
});

describe("IP do aceite digital — guardado, então tem que ser um endereço de verdade", () => {
  test("pega o cabeçalho do Azure primeiro, depois o do proxy, depois o primeiro endereço PÚBLICO do X-Forwarded-For", () => {
    expect(v.extrairIp({ "x-azure-clientip": "189.10.20.30", "x-forwarded-for": "1.1.1.1" })).toBe("189.10.20.30");
    expect(v.extrairIp({ "x-client-ip": "189.1.2.3" })).toBe("189.1.2.3");
    expect(v.extrairIp({ "x-forwarded-for": "177.8.9.10, 10.0.0.1, 10.0.0.2" })).toBe("177.8.9.10");
    expect(v.extrairIp({ "x-forwarded-for": "10.0.0.5, 177.8.9.10" })).toBe("177.8.9.10");
  });
  test("o nome do cabeçalho vale em qualquer caixa", () => {
    expect(v.extrairIp({ "X-Azure-ClientIP": "189.10.20.30" })).toBe("189.10.20.30");
    expect(v.extrairIp({ "X-Forwarded-For": "177.8.9.10" })).toBe("177.8.9.10");
  });
  test("endereço privado, loopback, link-local, reservado e de documentação NÃO prova de onde veio a conexão", () => {
    for (const ip of ["10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.5", "127.0.0.1", "0.0.0.0", "169.254.1.1", "100.64.0.1", "224.0.0.1", "255.255.255.255", "203.0.113.9", "198.51.100.7", "192.0.2.1",
      "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "2001:db8::7334", "::ffff:10.0.0.1"]) {
      expect(v.extrairIp({ "x-forwarded-for": ip })).toBeNull();
    }
    expect(v.ipPublico("172.32.0.1")).toBe(true);        // fora da faixa privada 172.16/12
    expect(v.ipPublico("8.8.8.8")).toBe(true);
    expect(v.extrairIp({ "x-forwarded-for": "::ffff:177.8.9.10" })).toBe("::ffff:177.8.9.10");
  });
  test("a cadeia dos cabeçalhos é guardada limpa e cortada, para a prova não depender só do primeiro IP", () => {
    expect(v.cadeiaDeCabecalhos({ "x-forwarded-for": "1.2.3.4, 177.8.9.10:55", "x-azure-clientip": "177.8.9.10" }))
      .toBe(JSON.stringify({ "x-azure-clientip": "177.8.9.10", "x-forwarded-for": "1.2.3.4, 177.8.9.10:55" }));
    expect(v.cadeiaDeCabecalhos({})).toBeNull();
    const suja = v.cadeiaDeCabecalhos({ "x-forwarded-for": "1.2.3.4'; DROP TABLE X;-- <script>" });
    expect(suja).not.toMatch(/[<>';]/);
    expect(v.cadeiaDeCabecalhos({ "x-forwarded-for": "1".repeat(500) }).length).toBeLessThanOrEqual(400);
  });
  test("tira a porta do IPv4 e os colchetes do IPv6", () => {
    expect(v.extrairIp({ "x-forwarded-for": "177.8.9.10:51234" })).toBe("177.8.9.10");
    expect(v.extrairIp({ "x-forwarded-for": "[2804:14d:5c80::1]:443" })).toBe("2804:14d:5c80::1");
    expect(v.extrairIp({ "x-forwarded-for": "2804:14d:5c80::1" })).toBe("2804:14d:5c80::1");
  });
  test("IPv6 sem colchetes não perde o último bloco (não confunde com porta)", () => {
    expect(v.extrairIp({ "x-azure-clientip": "2804:14d:5c80::7334" })).toBe("2804:14d:5c80::7334");
  });
  test("o que parece IPv6 mas não é (só dois-pontos, grupos de letras) não passa", () => {
    for (const lixo of [":::::", ":::", "a:b:c", "1:2:3", "::::::", "g::1", "12345::1"]) expect(v.extrairIp({ "x-forwarded-for": lixo })).toBeNull();
  });
  test("lixo, octeto impossível e ausência viram null — nunca um IP inventado", () => {
    expect(v.extrairIp({ "x-forwarded-for": "desconhecida" })).toBeNull();
    expect(v.extrairIp({ "x-forwarded-for": "999.1.1.1" })).toBeNull();
    expect(v.extrairIp({ "x-forwarded-for": "'; DROP TABLE x;--" })).toBeNull();
    expect(v.extrairIp({})).toBeNull();
    expect(v.extrairIp(undefined)).toBeNull();
    expect(v.extrairIp({ "x-forwarded-for": "a".repeat(80) })).toBeNull();
  });
});

describe("aceite digital (clickwrap)", () => {
  test("só vale com a caixa marcada de verdade (true) e com IP", () => {
    expect(v.validarAceiteDigital({ aceito: true, ip: "1.2.3.4" }).valido).toBe(true);
    for (const aceito of [false, "true", 1, undefined, null, "on"]) expect(v.validarAceiteDigital({ aceito, ip: "1.2.3.4" }).valido).toBe(false);
  });
  test("sem IP identificável não registra, e a mensagem manda procurar a Secretaria", () => {
    const r = v.validarAceiteDigital({ aceito: true, ip: null });
    expect(r.valido).toBe(false);
    expect(r.mensagem).toMatch(/Art\. 133 §8º, II/);
    expect(r.mensagem).toMatch(/Secretaria/);
  });
});

describe("registro da ficha e da mensagem (Secretaria)", () => {
  const ficha = (extra = {}) => ({ forma: "FICHA_FISICA", dataAceite: "2026-09-10", referencia: "Ficha nº 142, pasta Congregação Central", ...extra });
  test("ficha física e mensagem são as únicas formas que a Secretaria registra", () => {
    expect(v.validarRegistroAdesao(ficha(), { hoje: HOJE }).valido).toBe(true);
    expect(v.validarRegistroAdesao(ficha({ forma: "mensageria", canal: "whatsapp" }), { hoje: HOJE }).dados).toMatchObject({ forma: "MENSAGERIA", canal: "WHATSAPP" });
    for (const forma of ["CLICKWRAP", "LISTA_OURO", "OUTRA", ""]) expect(v.validarRegistroAdesao(ficha({ forma }), { hoje: HOJE }).valido).toBe(false);
  });
  test("data inválida ou no futuro, referência ausente e canal ausente na mensagem", () => {
    expect(v.validarRegistroAdesao(ficha({ dataAceite: "2026-02-30" }), { hoje: HOJE }).mensagem).toMatch(/AAAA-MM-DD/);
    expect(v.validarRegistroAdesao(ficha({ dataAceite: "2026-10-02" }), { hoje: HOJE }).mensagem).toMatch(/futuro/);
    expect(v.validarRegistroAdesao(ficha({ referencia: "ok" }), { hoje: HOJE }).mensagem).toMatch(/onde está a ficha/);
    expect(v.validarRegistroAdesao(ficha({ forma: "MENSAGERIA", referencia: "x" }), { hoje: HOJE }).mensagem).toMatch(/conversa foi arquivada/);
    expect(v.validarRegistroAdesao(ficha({ forma: "MENSAGERIA" }), { hoje: HOJE }).mensagem).toMatch(/canal/);
  });
  test("a data de hoje é aceita (o aceite pode ter sido hoje)", () => {
    expect(v.validarRegistroAdesao(ficha({ dataAceite: HOJE }), { hoje: HOJE }).valido).toBe(true);
  });
});

describe("ratificação coletiva — Lista de Ouro (Art. 133 §8º, III)", () => {
  const lista = (extra = {}) => ({ origem: "ASSEMBLEIA_GERAL", sessaoId: 9, descricao: "Assembleia Geral Ordinária de 14/03/2026", dataLista: "2026-03-14", cabecalhoConfirmado: true, ...extra });
  test("assembleia e reunião pedem a sessão; escala pede o serviço — e só um dos dois", () => {
    expect(v.validarRatificacao(lista(), { hoje: HOJE }).dados).toMatchObject({ origem: "ASSEMBLEIA_GERAL", sessaoId: 9, servicoId: null });
    expect(v.validarRatificacao(lista({ origem: "ESCALA_SERVICO", sessaoId: undefined, servicoId: 5 }), { hoje: HOJE }).dados).toMatchObject({ sessaoId: null, servicoId: 5 });
    expect(v.validarRatificacao(lista({ sessaoId: null }), { hoje: HOJE }).mensagem).toMatch(/sessão/);
    expect(v.validarRatificacao(lista({ origem: "ESCALA_SERVICO", servicoId: null }), { hoje: HOJE }).mensagem).toMatch(/serviço/);
    expect(v.validarRatificacao(lista({ origem: "CULTO" }), { hoje: HOJE }).mensagem).toMatch(/origem da lista/);
  });
  test("sem a confirmação do cabeçalho a ratificação não vale", () => {
    for (const cabecalhoConfirmado of [false, undefined, "true", 1]) {
      const r = v.validarRatificacao(lista({ cabecalhoConfirmado }), { hoje: HOJE });
      expect(r.valido).toBe(false);
      expect(r.mensagem).toMatch(/CABEÇALHO/);
    }
  });
  test("a lista não pode ser anterior à Lei 9.608/98 (a adesão é irreversível: data absurda não passa)", () => {
    expect(v.DATA_MINIMA_RATIFICACAO).toBe("1998-02-19");
    for (const dataLista of ["1900-01-01", "1998-02-18"]) {
      const r = v.validarRatificacao(lista({ dataLista }), { hoje: HOJE });
      expect(r.valido).toBe(false);
      expect(r.mensagem).toMatch(/Lei 9\.608\/98/);
    }
    expect(v.validarRatificacao(lista({ dataLista: "0001-01-01" }), { hoje: HOJE }).valido).toBe(false);   // ano 1 nem é data válida no calendário do sistema
    expect(v.validarRatificacao(lista({ dataLista: "1998-02-19" }), { hoje: HOJE }).valido).toBe(true);
  });
  test("descrição, data (não futura) e matrículas avulsas", () => {
    expect(v.validarRatificacao(lista({ descricao: "AG" }), { hoje: HOJE }).mensagem).toMatch(/Descreva a lista/);
    expect(v.validarRatificacao(lista({ dataLista: "2026-13-01" }), { hoje: HOJE }).mensagem).toMatch(/data da lista/);
    expect(v.validarRatificacao(lista({ dataLista: "2026-10-05" }), { hoje: HOJE }).mensagem).toMatch(/futuro/);
    expect(v.validarRatificacao(lista({ membroIds: [3, "3", 4, 4] }), { hoje: HOJE }).dados.membroIds).toEqual([3, 4]);
    expect(v.validarRatificacao(lista({ membroIds: [3, "x"] }), { hoje: HOJE }).mensagem).toMatch(/matrícula inválida/);
    expect(v.validarRatificacao(lista({ membroIds: "3" }), { hoje: HOJE }).mensagem).toMatch(/lista de matrículas/);
    expect(v.validarRatificacao(lista({ membroIds: Array.from({ length: 501 }, (_, i) => i + 1) }), { hoje: HOJE }).mensagem).toMatch(/até 500/);
  });
});

describe("integridade da adesão", () => {
  test("clickwrap na versão vigente com o hash vigente é íntegro; hash diferente acusa; versão antiga é só 'anterior'", () => {
    expect(v.avaliarIntegridadeAdesao({ forma: "CLICKWRAP", termoVersao: v.TERMO_VERSAO, termoHash: v.TERMO_HASH }).status).toBe("OK");
    expect(v.avaliarIntegridadeAdesao({ forma: "CLICKWRAP", termoVersao: v.TERMO_VERSAO, termoHash: "0".repeat(64) }).status).toBe("DIVERGENTE");
    expect(v.avaliarIntegridadeAdesao({ forma: "CLICKWRAP", termoVersao: 0, termoHash: "abc" }).status).toBe("VERSAO_ANTERIOR");
    expect(v.avaliarIntegridadeAdesao({ forma: "CLICKWRAP", termoVersao: 1, termoHash: null }).status).toBe("SEM_HASH");
  });
  test("a Lista de Ouro é conferida contra o texto da ratificação, não contra o Termo", () => {
    expect(v.avaliarIntegridadeAdesao({ forma: "LISTA_OURO", termoVersao: v.RATIFICACAO_VERSAO, termoHash: v.RATIFICACAO_HASH }).status).toBe("OK");
    expect(v.avaliarIntegridadeAdesao({ forma: "LISTA_OURO", termoVersao: v.RATIFICACAO_VERSAO, termoHash: v.TERMO_HASH }).status).toBe("DIVERGENTE");
  });
  test("ficha e mensagem não têm texto no sistema: a prova é o documento arquivado", () => {
    expect(v.avaliarIntegridadeAdesao({ forma: "FICHA_FISICA", termoVersao: null, termoHash: null }).status).toBe("DOCUMENTO_EXTERNO");
    expect(v.avaliarIntegridadeAdesao({ forma: "MENSAGERIA", termoVersao: null, termoHash: null }).status).toBe("DOCUMENTO_EXTERNO");
  });
});

describe("natureza da equipe", () => {
  test("zeladoria, portaria e cozinha exigem revezamento; louvor e 'outra' não", () => {
    for (const n of ["ZELADORIA", "PORTARIA", "COZINHA"]) expect(v.equipeExigeRevezamento(n)).toBe(true);
    for (const n of ["LITURGIA", "OUTRA", "QUALQUER"]) expect(v.equipeExigeRevezamento(n)).toBe(false);
  });
  test("validarNatureza normaliza e recusa o que não existe", () => {
    expect(v.validarNatureza(" zeladoria ")).toEqual({ valido: true, natureza: "ZELADORIA" });
    expect(v.validarNatureza("FAXINA").valido).toBe(false);
    expect(v.validarNatureza(undefined).valido).toBe(false);
  });
});

describe("validarRodizio", () => {
  test("aceita e normaliza", () => {
    const r = v.validarRodizio(rodizioBase({ nome: "  Limpeza do templo  ", diaSemana: "6", equipeId: "4", intervaloSemanas: "" }));
    expect(r.valido).toBe(true);
    expect(r.dados).toEqual({ nome: "Limpeza do templo", equipeId: 4, diaSemana: 6, hora: "08:00", intervaloSemanas: 1, dataAncora: "2026-10-03" });
  });
  test("a data de partida precisa cair no dia da semana escolhido", () => {
    const r = v.validarRodizio(rodizioBase({ dataAncora: "2026-10-04" })); // domingo
    expect(r.valido).toBe(false);
    expect(r.mensagem).toMatch(/sábado/);
  });
  test.each([
    [{ nome: "ab" }, /nome/i], [{ equipeId: 0 }, /equipe/], [{ diaSemana: 7 }, /dia da semana/], [{ diaSemana: "x" }, /dia da semana/],
    [{ hora: "8h" }, /HH:MM/], [{ hora: "24:00" }, /HH:MM/], [{ intervaloSemanas: 5 }, /1 a 4/], [{ intervaloSemanas: 0 }, /1 a 4/], [{ dataAncora: "2026-02-30" }, /primeira escala/]
  ])("recusa %j", (extra, esperado) => {
    const r = v.validarRodizio(rodizioBase(extra));
    expect(r.valido).toBe(false);
    expect(r.mensagem).toMatch(esperado);
  });
});

describe("composição: grupos distintos se alternam (Art. 135 §1º, I)", () => {
  test("um grupo só não é rodízio", () => {
    expect(v.validarComposicao([{ nome: "A", membros: 5 }]).valido).toBe(false);
    expect(v.validarComposicao([]).valido).toBe(false);
    expect(v.validarComposicao(undefined).valido).toBe(false);
  });
  test("dois grupos com gente passam; grupo vazio é apontado pelo nome; grupo desativado não conta", () => {
    expect(v.validarComposicao([{ nome: "A", membros: 2 }, { nome: "B", membros: 1 }]).valido).toBe(true);
    expect(v.validarComposicao([{ nome: "A", membros: 2 }, { nome: "B", membros: 0 }]).mensagem).toMatch(/“B”/);
    expect(v.validarComposicao([{ nome: "A", membros: 2 }, { nome: "B", membros: 3, ativo: false }]).valido).toBe(false);
  });
  test("nome do grupo", () => {
    expect(v.validarNomeGrupo("  Grupo A ")).toEqual({ valido: true, nome: "Grupo A" });
    expect(v.validarNomeGrupo("").valido).toBe(false);
    expect(v.validarNomeGrupo("x".repeat(61)).valido).toBe(false);
  });
  // Defesa em profundidade contra HTML injetado em nome (o front e o e-mail também escapam na saída — é lá que a defesa principal está).
  test("nome de grupo e de rodízio não aceitam os sinais < e >", () => {
    expect(v.validarNomeGrupo("<img src=x onerror=alert(1)>").valido).toBe(false);
    expect(v.validarNomeGrupo("Grupo > A").valido).toBe(false);
    expect(v.validarRodizio(rodizioBase({ nome: "<script>alert(1)</script>" })).valido).toBe(false);
    expect(v.validarRodizio(rodizioBase({ nome: "Limpeza & manutenção (sábado)" })).valido).toBe(true);
  });
  test("tetos que ficam longe do limite de 2.100 parâmetros do SQL Server", () => {
    expect(v.MAX_MEMBROS_POR_GRUPO * v.MAX_GRUPOS).toBeLessThan(2100);
    expect(v.MAX_RODIZIOS_POR_CONGREGACAO).toBeLessThan(2100);
    expect(v.MAX_MEMBROS_AO_CRIAR_GRUPO).toBeLessThanOrEqual(v.MAX_MEMBROS_POR_GRUPO);
  });
});

describe("a conta do revezamento", () => {
  test("o grupo da data é 'voltas desde a âncora' módulo o número de grupos", () => {
    const c = (dataIso, totalGrupos = 3, intervaloSemanas = 1) => v.indiceDoGrupo({ dataAncora: "2026-10-03", intervaloSemanas, dataIso, totalGrupos });
    expect([c("2026-10-03"), c("2026-10-10"), c("2026-10-17"), c("2026-10-24"), c("2026-10-31")]).toEqual([0, 1, 2, 0, 1]);
    expect(c("2026-10-03", 1)).toBe(0);
  });
  test("data antes da âncora, fora do passo ou sem grupos não é data do rodízio", () => {
    const c = (dataIso, totalGrupos = 3, intervaloSemanas = 1) => v.indiceDoGrupo({ dataAncora: "2026-10-03", intervaloSemanas, dataIso, totalGrupos });
    expect(c("2026-09-26")).toBeNull();
    expect(c("2026-10-05")).toBeNull();
    expect(c("2026-10-10", 3, 2)).toBeNull();
    expect(c("2026-10-17", 3, 2)).toBe(1);
    expect(c("2026-10-10", 0)).toBeNull();
  });
  test("planeja as datas do período, cada uma com o grupo da vez", () => {
    const p = v.planejarOcorrencias({ rodizio: rodizioPlano(), grupos: grupos3, de: "2026-10-01", ate: "2026-10-31" });
    expect(p.ocorrencias.map(o => [o.dataIso, o.grupoNome])).toEqual([
      ["2026-10-03", "Grupo A"], ["2026-10-10", "Grupo B"], ["2026-10-17", "Grupo C"], ["2026-10-24", "Grupo A"], ["2026-10-31", "Grupo B"]
    ]);
    expect(p.ocorrencias[0]).toMatchObject({ dataHora: "2026-10-03T08:00", grupoId: 11, indiceGrupo: 0 });
    expect(p.jaExistem).toEqual([]);
  });
  test("gerar de novo não duplica: as datas que já têm serviço ficam de fora e o revezamento das outras não se desloca", () => {
    const p = v.planejarOcorrencias({ rodizio: rodizioPlano(), grupos: grupos3, de: "2026-10-01", ate: "2026-10-31", existentes: new Set(["2026-10-10", "2026-10-17"]) });
    expect(p.ocorrencias.map(o => [o.dataIso, o.grupoNome])).toEqual([["2026-10-03", "Grupo A"], ["2026-10-24", "Grupo A"], ["2026-10-31", "Grupo B"]]);
    expect(p.jaExistem).toEqual(["2026-10-10", "2026-10-17"]);
  });
  test("o mesmo dia cai no mesmo grupo não importa de onde se comece a gerar (sem ponteiro que se perca)", () => {
    const tudo = v.planejarOcorrencias({ rodizio: rodizioPlano(), grupos: grupos3, de: "2026-10-01", ate: "2026-12-31" }).ocorrencias;
    const depois = v.planejarOcorrencias({ rodizio: rodizioPlano(), grupos: grupos3, de: "2026-11-15", ate: "2026-12-31" }).ocorrencias;
    for (const o of depois) expect(tudo.find(t => t.dataIso === o.dataIso).grupoNome).toBe(o.grupoNome);
    expect(depois[0].dataIso).toBe("2026-11-21");
  });
  test("intervalo de 2 semanas pula a semana de folga de todos", () => {
    const p = v.planejarOcorrencias({ rodizio: rodizioPlano({ intervaloSemanas: 2 }), grupos: grupos3.slice(0, 2), de: "2026-10-01", ate: "2026-11-15" });
    expect(p.ocorrencias.map(o => [o.dataIso, o.grupoNome])).toEqual([["2026-10-03", "Grupo A"], ["2026-10-17", "Grupo B"], ["2026-10-31", "Grupo A"], ["2026-11-14", "Grupo B"]]);
  });
  test("começar antes da âncora gera a partir da âncora; período vazio, invertido ou sem grupos gera nada", () => {
    expect(v.planejarOcorrencias({ rodizio: rodizioPlano(), grupos: grupos3, de: "2026-09-01", ate: "2026-10-05" }).ocorrencias.map(o => o.dataIso)).toEqual(["2026-10-03"]);
    expect(v.planejarOcorrencias({ rodizio: rodizioPlano(), grupos: grupos3, de: "2026-10-05", ate: "2026-10-09" }).ocorrencias).toEqual([]);
    expect(v.planejarOcorrencias({ rodizio: rodizioPlano(), grupos: grupos3, de: "2026-10-10", ate: "2026-10-01" }).ocorrencias).toEqual([]);
    expect(v.planejarOcorrencias({ rodizio: rodizioPlano(), grupos: [], de: "2026-10-01", ate: "2026-10-31" }).ocorrencias).toEqual([]);
  });
  test("a ordem dos grupos é a da coluna Ordem, não a da lista recebida", () => {
    const embaralhados = [grupos3[2], grupos3[0], grupos3[1]];
    const p = v.planejarOcorrencias({ rodizio: rodizioPlano(), grupos: embaralhados, de: "2026-10-01", ate: "2026-10-17" });
    expect(p.ocorrencias.map(o => o.grupoNome)).toEqual(["Grupo A", "Grupo B", "Grupo C"]);
  });
  test("com um grupo desativado no meio, a sequência fecha o buraco (só os ativos entram na lista)", () => {
    const p = v.planejarOcorrencias({ rodizio: rodizioPlano(), grupos: [grupos3[0], grupos3[2]], de: "2026-10-01", ate: "2026-10-24" });
    expect(p.ocorrencias.map(o => o.grupoNome)).toEqual(["Grupo A", "Grupo C", "Grupo A", "Grupo C"]);
  });
  test("o período de geração vai de hoje até N semanas e N tem limites", () => {
    expect(v.validarGeracao({}, { hoje: HOJE }).dados).toEqual({ de: HOJE, ate: "2026-11-26", semanas: 8, publicar: false });
    expect(v.validarGeracao({ semanas: 4, publicar: true }, { hoje: HOJE }).dados).toMatchObject({ ate: "2026-10-29", publicar: true });
    expect(v.validarGeracao({ semanas: 4, publicar: "true" }, { hoje: HOJE }).dados.publicar).toBe(false);
    for (const semanas of [0, 27, 1.5, "x"]) expect(v.validarGeracao({ semanas }, { hoje: HOJE }).valido).toBe(false);
  });
});

describe("hora de parede", () => {
  test("a hora digitada é a hora guardada, em qualquer servidor", () => {
    const d = v.dataHoraDeParede("2026-10-03", "19:30");
    expect(d.toISOString()).toBe("2026-10-03T19:30:00.000Z");
    expect(v.textoDataHora(d)).toBe("03/10/2026 às 19:30");
    expect(v.textoDataHora("2026-10-17T08:00:00.000Z")).toBe("17/10/2026 às 08:00");
  });
});

describe("trava de habitualidade (Art. 135 §1º, II)", () => {
  const s = (id, dia, membroIds) => ({ servicoId: id, dataHora: `2026-10-${String(dia).padStart(2, "0")}T08:00:00.000Z`, membroIds });
  test("quem serve as últimas 3 escalas seguidas é apontado, com a sequência e o período", () => {
    const r = v.analisarHabitualidade({ servicos: [s(1, 3, [10, 11]), s(2, 10, [10, 12]), s(3, 17, [10, 13])], limite: 3 });
    expect(r).toEqual([{ membroId: 10, sequencia: 3, desde: "2026-10-03T08:00:00.000Z", ate: "2026-10-17T08:00:00.000Z" }]);
  });
  test("quem folgou na última escala está revezando: sequência zero, sem alerta", () => {
    const r = v.analisarHabitualidade({ servicos: [s(1, 3, [10]), s(2, 10, [10]), s(3, 17, [10]), s(4, 24, [11])] });
    expect(r).toEqual([]);
  });
  test("uma folga no meio quebra a sequência", () => {
    const r = v.analisarHabitualidade({ servicos: [s(1, 3, [10]), s(2, 10, [10]), s(3, 17, [11]), s(4, 24, [10]), s(5, 31, [10])] });
    expect(r).toEqual([]);
    expect(v.analisarHabitualidade({ servicos: [s(1, 3, [10]), s(2, 10, [10]), s(3, 17, [11]), s(4, 24, [10]), s(5, 31, [10])], limite: 2 })[0]).toMatchObject({ membroId: 10, sequencia: 2 });
  });
  test("equipe que nunca reveza acusa todo mundo, do mais seguido ao menos", () => {
    const r = v.analisarHabitualidade({ servicos: [s(1, 3, [10, 11]), s(2, 10, [10, 11, 12]), s(3, 17, [10, 11, 12]), s(4, 24, [10, 11, 12])], limite: 3 });
    expect(r.map(x => [x.membroId, x.sequencia])).toEqual([[10, 4], [11, 4], [12, 3]]);
  });
  test("a ordem dos serviços recebidos não importa e o limite padrão é 3", () => {
    const r = v.analisarHabitualidade({ servicos: [s(3, 17, [10]), s(1, 3, [10]), s(2, 10, [10])] });
    expect(r).toHaveLength(1);
    expect(v.LIMITE_SEQUENCIA_PADRAO).toBe(3);
  });
  test("sem serviços, ou com limite menor que 2, não há o que acusar", () => {
    expect(v.analisarHabitualidade({ servicos: [] })).toEqual([]);
    expect(v.analisarHabitualidade({ servicos: undefined })).toEqual([]);
    expect(v.analisarHabitualidade({ servicos: [s(1, 3, [10])], limite: 1 })).toEqual([]);
  });
  test("o texto do alerta cita o artigo e o limite", () => {
    const t = v.textoHabitualidade({ equipeNome: "Limpeza", itens: [{ nome: "Ana", sequencia: 4 }, { nome: "Beto", sequencia: 3 }], limite: 3 });
    expect(t).toMatch(/Equipe Limpeza: Ana \(4 seguidas\), Beto \(3 seguidas\)/);
    expect(t).toMatch(/Art\. 135 §1º, II/);
    expect(t).toMatch(/a partir de 3 escalas seguidas/);
  });
});

describe("remoção da escala (Art. 133-D)", () => {
  const base = (extra = {}) => ({ membroId: 20, atorId: 5, motivo: "Faltas repetidas sem aviso", tipoMotivo: "PERDA_CONFIANCA", ...extra });
  test("aceita; o tipo padrão é perda de confiança; é a mesma lista de tipos da habilitação (v5.7)", () => {
    expect(v.validarRemocao(base()).dados).toEqual({ membroId: 20, tipoMotivo: "PERDA_CONFIANCA", motivo: "Faltas repetidas sem aviso" });
    expect(v.validarRemocao(base({ tipoMotivo: "" })).dados.tipoMotivo).toBe("PERDA_CONFIANCA");
    expect(v.validarRemocao(base({ tipoMotivo: "mudanca" })).dados.tipoMotivo).toBe("MUDANCA");
    expect(v.TIPOS_MOTIVO_DESLIGAMENTO).toBe(hv.TIPOS_MOTIVO_DESLIGAMENTO);
  });
  test("ninguém remove a si mesmo", () => {
    expect(v.validarRemocao(base({ membroId: 5 })).mensagem).toMatch(/remove a si mesmo/);
    expect(v.validarRemocao(base({ membroId: "5", atorId: 5 })).valido).toBe(false);
  });
  test("exige o voluntário, o motivo (5 a 300) e um tipo conhecido", () => {
    expect(v.validarRemocao(base({ membroId: null })).mensagem).toMatch(/voluntário/);
    expect(v.validarRemocao(base({ motivo: "abc" })).mensagem).toMatch(/motivo/);
    expect(v.validarRemocao(base({ motivo: "x".repeat(301) })).valido).toBe(false);
    expect(v.validarRemocao(base({ tipoMotivo: "SANCAO_DISCIPLINAR" })).mensagem).toMatch(/Tipo de motivo inválido/);
  });
  test("o aviso ao voluntário é o do Art. 133-D, III: 'a partir de hoje', sem multa, e NÃO traz o motivo", () => {
    const t = v.textoAvisoRemocao({ equipes: ["Limpeza"], hoje: HOJE });
    expect(t).toMatch(/não está mais na escala da equipe Limpeza, a partir de hoje \(01\/10\/2026\)/);
    expect(t).toMatch(/sem qualquer desconto, multa ou penalidade trabalhista/);
    expect(t).toMatch(/Art\. 133-D/);
    expect(t).not.toMatch(/Faltas repetidas/);
    expect(v.textoAvisoRemocao({ equipes: ["Limpeza", "Portaria"], hoje: HOJE })).toMatch(/das equipes Limpeza, Portaria/);
  });
  test("o aviso ao líder lista as vagas (até 5) e diz como cobrir; sem vaga, diz isso", () => {
    const vagas = Array.from({ length: 7 }, (_, i) => ({ dataHora: `2026-10-${10 + i}T08:00:00.000Z` }));
    const t = v.textoVagaAberta({ membroNome: "Ana", equipeNome: "Limpeza", vagas, causa: "REMOCAO" });
    expect(t).toMatch(/Ana saiu da escala na equipe Limpeza: 7 vaga\(s\) em aberto/);
    expect(t).toMatch(/10\/10\/2026 às 08:00/);
    expect(t).toMatch(/e mais 2/);
    expect(t).toMatch(/serviços de rodízio, combine com o grupo/);
    expect(v.textoVagaAberta({ membroNome: "Ana", equipeNome: "Limpeza", vagas: [], causa: "REMOCAO" })).toMatch(/Não havia escalas futuras/);
  });
  test("o aviso do afastamento e o da recusa citam o direito, não a saída", () => {
    expect(v.textoVagaAberta({ membroNome: "Ana", equipeNome: "L", vagas: [{ dataHora: "2026-10-10T08:00:00.000Z" }], causa: "AFASTAMENTO" })).toMatch(/pediu afastamento \(direito de recusa, Art\. 133 §7º\)/);
    expect(v.textoVagaAberta({ membroNome: "Ana", equipeNome: "L", vagas: [{ dataHora: "2026-10-10T08:00:00.000Z" }], causa: "RECUSA" })).toMatch(/sem penalidade/);
  });
  test("o aviso de reintegração e o de rodízio", () => {
    expect(v.textoAvisoReintegracao({ equipeNome: "Limpeza", hoje: HOJE })).toMatch(/voltou a fazer parte da equipe Limpeza/);
    const t = v.textoEscaladoNoRodizio({ rodizioNome: "Limpeza do templo", grupoNome: "Grupo B", datas: [new Date("2026-10-10T08:00:00Z"), new Date("2026-10-31T08:00:00Z")] });
    expect(t).toMatch(/rodízio “Limpeza do templo” \(Grupo B\): 10\/10\/2026 às 08:00; 31\/10\/2026 às 08:00/);
    expect(t).toMatch(/recusar é um direito, sem penalidade/);
  });
});
