// Testes da v7.3 (Canais Oficiais e Comunicação) — lógica pura de shared/canais.js.
const c = require("../canais");

const BASE = {
  nome: "Instagram da IEADESPA", plataforma: "INSTAGRAM", categoria: "INSTITUCIONAL", identificador: "@AdSeta.Parauapebas",
  vinculoInstitucional: "MARCA", declaracaoInstitucional: true, escopo: "CAMPO"
};

describe("identificador do canal", () => {
  test("telefone: aceita com e sem máscara, com e sem o 55, e normaliza", () => {
    expect(c.normalizarTelefone("(94) 99999-0000")).toBe("5594999990000");
    expect(c.normalizarTelefone("+55 94 99999-0000")).toBe("5594999990000");
    expect(c.normalizarTelefone("94 3333-0000")).toBe("559433330000");
    expect(c.formatarTelefone("5594999990000")).toBe("(94) 99999-0000");
    expect(c.formatarTelefone("559433330000")).toBe("(94) 3333-0000");
  });

  test("telefone: recusa número curto, celular sem 9 e DDD inválido", () => {
    expect(c.normalizarTelefone("99999-0000")).toBeNull();
    expect(c.normalizarTelefone("(94) 88888-0000")).toBeNull();
    expect(c.normalizarTelefone("(04) 99999-0000")).toBeNull();
    expect(c.normalizarTelefone("abc")).toBeNull();
  });

  test("a chave do telefone ignora o 55 e o 9 extra do celular antigo", () => {
    expect(c.chaveDeTelefone("(94) 99999-0000")).toBe(c.chaveDeTelefone("+5594999990000"));
    expect(c.chaveDeTelefone("(94) 99999-0000")).toBe("9499990000");
  });

  test("e-mail: minúsculas e formato", () => {
    expect(c.normalizarIdentificador("EMAIL", "Secretaria@IEADESPA.org")).toMatchObject({ ok: true, normalizado: "secretaria@ieadespa.org" });
    expect(c.normalizarIdentificador("EMAIL", "sem-arroba").ok).toBe(false);
  });

  test("perfil: tira o @, põe em minúsculas e recusa símbolo e link de convite", () => {
    expect(c.normalizarIdentificador("INSTAGRAM", "@AdSeta.Parauapebas")).toMatchObject({ ok: true, normalizado: "adseta.parauapebas", exibicao: "@adseta.parauapebas" });
    expect(c.normalizarIdentificador("INSTAGRAM", "ad seta!").ok).toBe(false);
    expect(c.normalizarIdentificador("TELEGRAM", "https://t.me/+AbCdEf").ok).toBe(false);
  });

  test("grupo de WhatsApp: guarda o NOME e recusa o link de convite", () => {
    expect(c.normalizarIdentificador("WHATSAPP_GRUPO", "Família IEADESPA — Gênesis")).toMatchObject({ ok: true });
    const r = c.normalizarIdentificador("WHATSAPP_GRUPO", "https://chat.whatsapp.com/AbCdEfGh123");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/convite/i);
    expect(c.normalizarIdentificador("WHATSAPP_GRUPO", "ab").ok).toBe(false);
  });

  test("endereço: exige https e o domínio da plataforma", () => {
    expect(c.normalizarIdentificador("YOUTUBE", "https://www.youtube.com/@ieadespa")).toMatchObject({ ok: true });
    expect(c.normalizarIdentificador("YOUTUBE", "http://www.youtube.com/@ieadespa").ok).toBe(false);
    expect(c.normalizarIdentificador("YOUTUBE", "https://vimeo.com/ieadespa").ok).toBe(false);
    expect(c.normalizarIdentificador("YOUTUBE", "https://youtube.com.golpe.example/x").ok).toBe(false);
    expect(c.normalizarIdentificador("SITE", "https://www.ieadespa.org.br/")).toMatchObject({ ok: true, normalizado: "https://ieadespa.org.br" });
  });

  test("plataforma inválida e identificador vazio", () => {
    expect(c.normalizarIdentificador("ORKUT", "x").ok).toBe(false);
    expect(c.normalizarIdentificador("INSTAGRAM", "  ").ok).toBe(false);
  });

  test("links seguros por plataforma; grupo e sistema não têm link", () => {
    expect(c.linkDoCanal("WHATSAPP", "5594999990000")).toBe("https://wa.me/5594999990000");
    expect(c.linkDoCanal("EMAIL", "a@b.org")).toBe("mailto:a@b.org");
    expect(c.linkDoCanal("INSTAGRAM", "adseta")).toBe("https://www.instagram.com/adseta/");
    expect(c.linkDoCanal("TELEFONE", "559433330000")).toBe("tel:+559433330000");
    expect(c.linkDoCanal("WHATSAPP_GRUPO", "grupo")).toBeNull();
    expect(c.linkDoCanal("SISTEMA", "x")).toBeNull();
    expect(c.linkDoCanal("SITE", "javascript:alert(1)")).toBeNull();
  });
});

describe("Art. 12 — conta pessoal nunca é canal oficial", () => {
  const contatos = [
    { membroId: 7, telefone: "(94) 98888-1111", email: "Irmao@Gmail.com" },
    { membroId: 9, telefone: "94 97777-2222", email: null }
  ];
  test("número que é contato pessoal de membro é achado, com ou sem máscara e 55", () => {
    expect(c.acharContatoPessoal("WHATSAPP", "5594988881111", contatos)).toMatchObject({ membroId: 7 });
    expect(c.acharContatoPessoal("TELEFONE", "559497777" + "2222", contatos)).toMatchObject({ membroId: 9 });
    expect(c.acharContatoPessoal("WHATSAPP", "5594999990000", contatos)).toBeNull();
  });
  test("e-mail pessoal é achado sem diferenciar maiúsculas", () => {
    expect(c.acharContatoPessoal("EMAIL", "irmao@gmail.com", contatos)).toMatchObject({ membroId: 7 });
    expect(c.acharContatoPessoal("EMAIL", "secretaria@ieadespa.org", contatos)).toBeNull();
  });
  test("perfis e endereços não têm contato pessoal para comparar", () => {
    expect(c.acharContatoPessoal("INSTAGRAM", "adseta", contatos)).toBeNull();
  });
});

describe("validarCanal", () => {
  test("canal institucional válido sai normalizado", () => {
    const r = c.validarCanal(BASE);
    expect(r.valido).toBe(true);
    expect(r.dados).toMatchObject({ plataforma: "INSTAGRAM", categoria: "INSTITUCIONAL", identificador: "@adseta.parauapebas", identificadorNormalizado: "adseta.parauapebas", escopo: "CAMPO", congregacaoId: null, vinculoInstitucional: "MARCA" });
  });

  test("sem a declaração de titularidade institucional não registra (Art. 12)", () => {
    const r = c.validarCanal({ ...BASE, declaracaoInstitucional: false });
    expect(r.valido).toBe(false);
    expect(r.mensagem).toMatch(/Art\. 12|Estatuto/);
    expect(c.validarCanal({ ...BASE, declaracaoInstitucional: "true" }).valido).toBe(false);
  });

  test("sem vínculo institucional não registra; 'PESSOAL' não existe como opção", () => {
    expect(c.validarCanal({ ...BASE, vinculoInstitucional: "" }).valido).toBe(false);
    expect(c.validarCanal({ ...BASE, vinculoInstitucional: "PESSOAL" }).valido).toBe(false);
  });

  test("grupo: WhatsApp só como grupo; categoria de grupo só em plataforma de grupo", () => {
    const grupo = { ...BASE, nome: "Grupo geral Gênesis", plataforma: "WHATSAPP_GRUPO", categoria: "GRUPO_OFICIAL", identificador: "IEADESPA Gênesis" };
    expect(c.validarCanal(grupo).valido).toBe(true);
    expect(c.validarCanal({ ...grupo, categoria: "INSTITUCIONAL" }).valido).toBe(false);
    expect(c.validarCanal({ ...BASE, categoria: "GRUPO_OFICIAL" }).mensagem).toMatch(/não é um grupo/);
  });

  test("grupo focado exige o tema (Art. 160, §6º)", () => {
    const focado = { ...BASE, nome: "Política e cidadania", plataforma: "WHATSAPP_GRUPO", categoria: "GRUPO_FOCADO", identificador: "Cidadania IEADESPA" };
    expect(c.validarCanal(focado).valido).toBe(false);
    expect(c.validarCanal({ ...focado, temaFocado: "cidadania_politica" }).dados.temaFocado).toBe("CIDADANIA_POLITICA");
    expect(c.validarCanal({ ...focado, temaFocado: "CULTO" }).valido).toBe(false);
  });

  test("escopo exige a referência certa e zera as outras", () => {
    expect(c.validarCanal({ ...BASE, escopo: "CONGREGACAO" }).valido).toBe(false);
    const r = c.validarCanal({ ...BASE, escopo: "CONGREGACAO", congregacaoId: "12", areaId: 3 });
    expect(r.dados).toMatchObject({ congregacaoId: 12, areaId: null, departamentoId: null });
    expect(c.validarCanal({ ...BASE, escopo: "AREA" }).valido).toBe(false);
    expect(c.validarCanal({ ...BASE, escopo: "DEPARTAMENTO", departamentoId: 2 }).valido).toBe(true);
    expect(c.validarCanal({ ...BASE, escopo: "PLANETA" }).valido).toBe(false);
  });

  test("nome, descrição e identificador inválidos", () => {
    expect(c.validarCanal({ ...BASE, nome: "ab" }).valido).toBe(false);
    expect(c.validarCanal({ ...BASE, descricao: "x".repeat(501) }).valido).toBe(false);
    expect(c.validarCanal({ ...BASE, identificador: "" }).valido).toBe(false);
    expect(c.validarCanal({ ...BASE, plataforma: "ORKUT" }).valido).toBe(false);
  });

  test("as marcações booleanas só valem quando literalmente verdadeiras", () => {
    const r = c.validarCanal({ ...BASE, publicoNoSite: "sim", incluiMenores: 1, custodiaSecretaria: true });
    expect(r.dados).toMatchObject({ publicoNoSite: false, incluiMenores: false, custodiaSecretaria: true });
  });
});

describe("uso do canal", () => {
  test("Abandono Digital só aceita contato individual institucional", () => {
    expect(c.contaParaAbandono({ plataforma: "EMAIL", categoria: "INSTITUCIONAL", ativo: true })).toBe(true);
    expect(c.contaParaAbandono({ plataforma: "WHATSAPP", categoria: "INSTITUCIONAL", ativo: true })).toBe(true);
    expect(c.contaParaAbandono({ plataforma: "SISTEMA", categoria: "INSTITUCIONAL", ativo: true })).toBe(true);
    expect(c.contaParaAbandono({ plataforma: "INSTAGRAM", categoria: "INSTITUCIONAL", ativo: true })).toBe(false);
    expect(c.contaParaAbandono({ plataforma: "WHATSAPP_GRUPO", categoria: "GRUPO_OFICIAL", ativo: true })).toBe(false);
    expect(c.contaParaAbandono({ plataforma: "EMAIL", categoria: "INSTITUCIONAL", ativo: false })).toBe(false);
  });
  test("canal legado, sem plataforma, continua valendo (não quebra o que já existe)", () => {
    expect(c.contaParaAbandono({ plataforma: null, ativo: true })).toBe(true);
  });
  test("custódia: contas com senha exigem; grupo e telefone fixo não", () => {
    expect(c.exigeCustodia({ plataforma: "INSTAGRAM" })).toBe(true);
    expect(c.exigeCustodia({ plataforma: "EMAIL" })).toBe(true);
    expect(c.exigeCustodia({ plataforma: "WHATSAPP_GRUPO" })).toBe(false);
    expect(c.exigeCustodia({ plataforma: "TELEFONE" })).toBe(false);
  });
});

describe("escopo de quem gere os canais", () => {
  const congs = new Map([[1, { nome: "Gênesis", areaId: 10 }], [2, { nome: "Bom Pastor", areaId: 10 }], [3, { nome: "Águas Vivas", areaId: 20 }]]);
  const ctx = { congregacoes: congs, congregacoesDaArea: (a) => [...congs].filter(([, x]) => x.areaId === a).map(([id]) => id) };
  test("global cobre tudo", () => {
    expect(c.escopoCobreCanal("TODAS", { escopo: "CAMPO" }, ctx)).toBe(true);
    expect(c.escopoCobreCanal(null, { escopo: "DEPARTAMENTO", departamentoId: 1 }, ctx)).toBe(true);
  });
  test("dirigente cobre o canal da própria congregação e nada além", () => {
    expect(c.escopoCobreCanal(["Gênesis"], { escopo: "CONGREGACAO", congregacaoId: 1 }, ctx)).toBe(true);
    expect(c.escopoCobreCanal(["Gênesis"], { escopo: "CONGREGACAO", congregacaoId: 2 }, ctx)).toBe(false);
    expect(c.escopoCobreCanal(["Gênesis"], { escopo: "CAMPO" }, ctx)).toBe(false);
    expect(c.escopoCobreCanal(["Gênesis"], { escopo: "DEPARTAMENTO", departamentoId: 1 }, ctx)).toBe(false);
  });
  test("pastor de Área cobre o canal da Área só se tem a Área inteira", () => {
    expect(c.escopoCobreCanal(["Gênesis", "Bom Pastor"], { escopo: "AREA", areaId: 10 }, ctx)).toBe(true);
    expect(c.escopoCobreCanal(["Gênesis"], { escopo: "AREA", areaId: 10 }, ctx)).toBe(false);
    expect(c.escopoCobreCanal(["Gênesis", "Bom Pastor"], { escopo: "AREA", areaId: 99 }, ctx)).toBe(false);
  });
});

describe("Regra das 24 Horas", () => {
  const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
  const H = c.HORA_MS;

  test("o prazo é de 24 horas depois do aviso", () => {
    expect(c.PRAZO_REMOCAO_HORAS).toBe(24);
    expect(c.prazoDaOcorrencia(T0)).toBe(T0 + 24 * H);
  });

  test("aberta: no prazo, urgente nas últimas 6 horas, vencida depois (a Igreja fica corresponsável)", () => {
    const oc = { status: "ABERTA", relatadaEmMs: T0 };
    expect(c.situacaoDaOcorrencia(oc, T0 + 2 * H)).toMatchObject({ fase: "NO_PRAZO", dentroDoPrazo: true });
    expect(c.situacaoDaOcorrencia(oc, T0 + 19 * H).fase).toBe("URGENTE");
    expect(c.situacaoDaOcorrencia(oc, T0 + 24 * H).fase).toBe("URGENTE"); // exatamente 24 h ainda é prazo
    const v = c.situacaoDaOcorrencia(oc, T0 + 24 * H + 1);
    expect(v).toMatchObject({ fase: "VENCIDA", dentroDoPrazo: false, igrejaCorresponsavel: true });
    expect(v.horasVencida).toBeGreaterThan(0);
  });

  test("removida dentro ou fora do prazo", () => {
    expect(c.situacaoDaOcorrencia({ status: "REMOVIDA", relatadaEmMs: T0, removidaEmMs: T0 + 3 * H }, T0 + 99 * H)).toMatchObject({ fase: "REMOVIDA_NO_PRAZO", dentroDoPrazo: true, horasAteRemover: 3 });
    expect(c.situacaoDaOcorrencia({ status: "REMOVIDA", relatadaEmMs: T0, removidaEmMs: T0 + 30 * H }, T0 + 99 * H)).toMatchObject({ fase: "REMOVIDA_FORA_DO_PRAZO", dentroDoPrazo: false });
    expect(c.situacaoDaOcorrencia({ status: "IMPROCEDENTE", relatadaEmMs: T0 }, T0 + 99 * H).fase).toBe("IMPROCEDENTE");
  });

  test("validação da ocorrência", () => {
    const ok = c.validarOcorrencia({ canalId: "5", categoria: "propaganda_politica", descricao: "Santinho digital de candidato postado no grupo", linkEvidencia: "https://exemplo.org/print.png" });
    expect(ok.valido).toBe(true);
    expect(ok.dados).toMatchObject({ canalId: 5, categoria: "PROPAGANDA_POLITICA" });
    expect(c.validarOcorrencia({ canalId: 5, categoria: "NADA", descricao: "Conteúdo irregular postado" }).valido).toBe(false);
    expect(c.validarOcorrencia({ canalId: 5, categoria: "OUTRO", descricao: "curto" }).valido).toBe(false);
    expect(c.validarOcorrencia({ canalId: 0, categoria: "OUTRO", descricao: "Conteúdo irregular postado" }).valido).toBe(false);
    expect(c.validarOcorrencia({ canalId: 5, categoria: "OUTRO", descricao: "Conteúdo irregular postado", linkEvidencia: "http://inseguro" }).valido).toBe(false);
  });

  test("prova de remoção: texto obrigatório, hora informada nunca antes do aviso nem no futuro", () => {
    const base = { relatadaEmMs: T0, agoraMs: T0 + 5 * H };
    expect(c.validarRemocao({ provaRemocao: "Mensagem removida e membro orientado por privado" }, base)).toMatchObject({ valido: true, dados: { removidaEmMs: base.agoraMs } });
    expect(c.validarRemocao({ provaRemocao: "curto" }, base).valido).toBe(false);
    expect(c.validarRemocao({ provaRemocao: "Mensagem removida às 13h e membro orientado", removidaEm: new Date(T0 + 1 * H).toISOString() }, base).dados.removidaEmMs).toBe(T0 + H);
    expect(c.validarRemocao({ provaRemocao: "Mensagem removida e membro orientado", removidaEm: new Date(T0 - H).toISOString() }, base).valido).toBe(false);
    expect(c.validarRemocao({ provaRemocao: "Mensagem removida e membro orientado", removidaEm: new Date(T0 + 9 * H).toISOString() }, base).valido).toBe(false);
    expect(c.validarRemocao({ provaRemocao: "Mensagem removida e membro orientado", removidaEm: "ontem" }, base).valido).toBe(false);
    expect(c.validarRemocao({ provaRemocao: "Mensagem removida e membro orientado", linkProva: "ftp://x" }, base).valido).toBe(false);
  });

  test("orientação: política manda advertir e redirecionar; menor avisa a liderança; sempre pede a prova", () => {
    const pol = c.orientacaoDaOcorrencia("PROPAGANDA_POLITICA").join(" ");
    expect(pol).toContain(c.FRASE_REDIRECIONAMENTO);
    expect(pol).toMatch(/Cidadania e política/);
    expect(pol).toMatch(/Advirta/);
    expect(c.orientacaoDaOcorrencia("EXPOSICAO_MENOR").join(" ")).toMatch(/responsável legal/);
    expect(c.orientacaoDaOcorrencia("OFENSIVO").pop()).toMatch(/prova da remoção/);
    expect(c.orientacaoDaOcorrencia("NADA")).toEqual([]);
  });

  test("as categorias de gravidade alta são as que avisam a gestão na hora", () => {
    const altas = Object.entries(c.CATEGORIAS_OCORRENCIA).filter(([, v]) => v.gravidade === "ALTA").map(([k]) => k).sort();
    expect(altas).toEqual(["EXPOSICAO_MENOR", "NEUTRALIDADE_REDE", "PORNOGRAFICO", "PROPAGANDA_POLITICA"]);
  });
});

describe("Termo de Dever de Moderação", () => {
  test("texto fixo e versionado — se mudar o texto, aumente TERMO_VERSAO e atualize este hash", () => {
    expect(c.TERMO_VERSAO).toBe(1);
    expect(c.TERMO_HASH).toBe("dec163069cce7bb3b156747829da600106826aadc81aa5f377caf32aaa546714");
    const t = c.termoVigente();
    expect(t.itens).toHaveLength(9);
    expect(t.itens.join(" ")).toMatch(/24 horas/);
    expect(t.itens.join(" ")).toMatch(/Secretaria Geral/);
  });
  test("o resumo para a descrição do grupo cobre as três vedações do Art. 160, §1º, III", () => {
    const t = c.modeloTermoDeUso();
    expect(t).toMatch(/fake news/);
    expect(t).toMatch(/propaganda comercial/);
    expect(t).toMatch(/político-partidários/);
  });
});

describe("conferência de conformidade", () => {
  test("cada tipo de canal tem os seus itens", () => {
    const codigos = (canal) => c.itensDeConferencia(canal).map(i => i.codigo);
    expect(codigos({ plataforma: "WHATSAPP_GRUPO", categoria: "GRUPO_OFICIAL" })).toEqual(["TERMO_DE_USO"]);
    expect(codigos({ plataforma: "WHATSAPP_GRUPO", categoria: "GRUPO_FOCADO" })).toEqual(["AVISO_ATENCAO"]);
    expect(codigos({ plataforma: "INSTAGRAM", categoria: "INSTITUCIONAL" })).toEqual(["NEUTRALIDADE", "POSTURA", "CUSTODIA"]);
    expect(codigos({ plataforma: "EMAIL", categoria: "INSTITUCIONAL" })).toEqual(["CUSTODIA"]);
    expect(codigos({ plataforma: "INSTAGRAM", categoria: "INSTITUCIONAL", incluiMenores: true })).toContain("PROTECAO_MENORES");
  });

  test("avalia: todos os itens respondidos; um 'não' torna a conferência irregular", () => {
    const canal = { plataforma: "INSTAGRAM", categoria: "INSTITUCIONAL" };
    expect(c.avaliarConferencia(canal, { NEUTRALIDADE: true }).valido).toBe(false);
    const ok = c.avaliarConferencia(canal, { NEUTRALIDADE: true, POSTURA: true, CUSTODIA: true, ESTRANHO: false });
    expect(ok).toMatchObject({ valido: true, resultado: "CONFORME", irregulares: [] });
    expect(Object.keys(ok.itens)).toEqual(["NEUTRALIDADE", "POSTURA", "CUSTODIA"]);
    const ruim = c.avaliarConferencia(canal, { NEUTRALIDADE: false, POSTURA: true, CUSTODIA: true });
    expect(ruim).toMatchObject({ resultado: "IRREGULAR", irregulares: ["NEUTRALIDADE"] });
    expect(c.avaliarConferencia(canal, { NEUTRALIDADE: "sim", POSTURA: true, CUSTODIA: true }).valido).toBe(false);
  });
});

describe("conformidade do canal", () => {
  const HOJE = "2026-10-01";
  const grupo = { plataforma: "WHATSAPP_GRUPO", categoria: "GRUPO_OFICIAL", identificador: "Grupo Gênesis", ativo: true, custodiaSecretaria: false };
  const conf = (canal, estado) => c.conformidadeDoCanal(canal, { termoVersao: 1, administradores: [], trocasAbertas: [], ocorrenciasVencidas: 0, ultimaConferencia: null, ...estado }, { hoje: HOJE, conferenciaDias: 180 });
  const codigos = (r) => r.pendencias.map(p => p.codigo);

  test("grupo sem administrador é irregular", () => {
    const r = conf(grupo, {});
    expect(r.situacao).toBe("IRREGULAR");
    expect(codigos(r)).toEqual(expect.arrayContaining(["SEM_ADMINISTRADOR", "SEM_CONFERENCIA"]));
  });

  test("administrador designado que não aceitou o termo ainda deixa o canal irregular", () => {
    const r = conf(grupo, { administradores: [{ papel: "ADMINISTRADOR", termoVersaoAceita: null }] });
    expect(codigos(r)).toContain("TERMO_PENDENTE");
    expect(r.situacao).toBe("IRREGULAR");
  });

  test("termo de versão antiga não vale para a versão vigente", () => {
    const r = conf(grupo, { termoVersao: 2, administradores: [{ papel: "ADMINISTRADOR", termoVersaoAceita: 1 }] });
    expect(codigos(r)).toContain("TERMO_PENDENTE");
  });

  test("grupo regular: administrador com termo e conferência recente conforme", () => {
    const r = conf(grupo, { administradores: [{ papel: "ADMINISTRADOR", termoVersaoAceita: 1 }], ultimaConferencia: { em: "2026-09-01T10:00:00Z", resultado: "CONFORME" } });
    expect(r).toEqual({ situacao: "REGULAR", pendencias: [] });
  });

  test("um administrador a mais sem termo é só atenção", () => {
    const r = conf(grupo, { administradores: [{ papel: "ADMINISTRADOR", termoVersaoAceita: 1 }, { papel: "ADMINISTRADOR", termoVersaoAceita: null }], ultimaConferencia: { em: "2026-09-01T00:00:00Z", resultado: "CONFORME" } });
    expect(r.situacao).toBe("ATENCAO");
    expect(codigos(r)).toEqual(["TERMO_PENDENTE_PARCIAL"]);
  });

  test("conferência vencida é atenção; irregular é grave", () => {
    const base = { administradores: [{ papel: "ADMINISTRADOR", termoVersaoAceita: 1 }] };
    expect(codigos(conf(grupo, { ...base, ultimaConferencia: { em: "2026-01-01T00:00:00Z", resultado: "CONFORME" } }))).toEqual(["CONFERENCIA_VENCIDA"]);
    const irr = conf(grupo, { ...base, ultimaConferencia: { em: "2026-09-25T00:00:00Z", resultado: "IRREGULAR" } });
    expect(codigos(irr)).toEqual(["CONFERENCIA_IRREGULAR"]);
    expect(irr.situacao).toBe("IRREGULAR");
  });

  test("conta com senha sem custódia confirmada é grave; troca vencida também", () => {
    const rede = { plataforma: "INSTAGRAM", categoria: "INSTITUCIONAL", identificador: "@adseta", ativo: true, custodiaSecretaria: false };
    const r = conf(rede, { administradores: [{ papel: "OPERADOR", termoVersaoAceita: 1 }], trocasAbertas: [{ prazoEm: "2026-09-20" }], ultimaConferencia: { em: "2026-09-30T00:00:00Z", resultado: "CONFORME" } });
    expect(codigos(r)).toEqual(expect.arrayContaining(["SEM_CUSTODIA", "TROCA_VENCIDA"]));
    expect(conf({ ...rede, custodiaSecretaria: true }, { administradores: [{ papel: "OPERADOR", termoVersaoAceita: 1 }], trocasAbertas: [{ prazoEm: "2026-10-05" }], ultimaConferencia: { em: "2026-09-30T00:00:00Z", resultado: "CONFORME" } }).pendencias.map(p => p.codigo)).toEqual(["TROCA_PENDENTE"]);
  });

  test("ocorrência vencida pesa no canal; canal legado sem identificador pede o cadastro completo", () => {
    expect(codigos(conf(grupo, { administradores: [{ papel: "ADMINISTRADOR", termoVersaoAceita: 1 }], ocorrenciasVencidas: 2, ultimaConferencia: { em: "2026-09-30T00:00:00Z", resultado: "CONFORME" } }))).toEqual(["OCORRENCIA_VENCIDA"]);
    expect(codigos(conf({ ...grupo, identificador: null }, {}))).toContain("IDENTIFICADOR_PENDENTE");
  });

  test("canal institucional sem senha (telefone fixo) não exige administrador; canal inativo não cobra nada", () => {
    expect(codigos(conf({ plataforma: "TELEFONE", categoria: "INSTITUCIONAL", identificador: "(94) 3333-0000", ativo: true }, { ultimaConferencia: { em: "2026-09-30T00:00:00Z", resultado: "CONFORME" } }))).toEqual([]);
    expect(conf({ ...grupo, ativo: false }, {}).pendencias.map(p => p.codigo)).toEqual([]);
  });
});

describe("transmissão dos cultos e Área Cega (Art. 160, §2º)", () => {
  test("quem não transmite não tem pendência; sem informação fica 'não informada'", () => {
    expect(c.avaliarTransmissao({ transmite: false })).toEqual({ situacao: "NAO_SE_APLICA", pendencias: [] });
    expect(c.avaliarTransmissao(null).situacao).toBe("NAO_INFORMADA");
  });
  test("transmite: precisa de placa nos acessos e da Área Cega definida (ou justificada)", () => {
    const r = c.avaliarTransmissao({ transmite: true, placaAvisoInstaladaEm: null, areaCegaSituacao: "PENDENTE" });
    expect(r.situacao).toBe("PENDENTE");
    expect(r.pendencias).toHaveLength(2);
    expect(c.avaliarTransmissao({ transmite: true, placaAvisoInstaladaEm: "2026-03-01", areaCegaSituacao: "DEFINIDA" }).situacao).toBe("CONFORME");
    expect(c.avaliarTransmissao({ transmite: true, placaAvisoInstaladaEm: "2026-03-01", areaCegaSituacao: "ESTRUTURA_NAO_PERMITE" }).situacao).toBe("CONFORME");
  });
  test("validação: Área Cega definida ou justificada exige descrição", () => {
    expect(c.validarTransmissao({ congregacaoId: 3, transmite: true, areaCegaSituacao: "DEFINIDA" }).valido).toBe(false);
    expect(c.validarTransmissao({ congregacaoId: 3, transmite: true, areaCegaSituacao: "DEFINIDA", areaCegaDescricao: "Duas últimas fileiras", placaAvisoInstaladaEm: "2026-03-01" })).toMatchObject({ valido: true });
    expect(c.validarTransmissao({ congregacaoId: 3, transmite: true, areaCegaSituacao: "ESTRUTURA_NAO_PERMITE", areaCegaDescricao: "Salão pequeno, sem galeria" }).valido).toBe(true);
    expect(c.validarTransmissao({ congregacaoId: 3, transmite: true, areaCegaSituacao: "QUALQUER" }).valido).toBe(false);
    expect(c.validarTransmissao({ congregacaoId: 3, transmite: true, areaCegaSituacao: "PENDENTE", placaAvisoInstaladaEm: "ontem" }).valido).toBe(false);
    expect(c.validarTransmissao({ congregacaoId: 0, transmite: false }).valido).toBe(false);
  });
  test("quem deixa de transmitir zera os campos", () => {
    expect(c.validarTransmissao({ congregacaoId: 3, transmite: false, areaCegaSituacao: "DEFINIDA", areaCegaDescricao: "x" }).dados).toMatchObject({ transmite: false, placaAvisoInstaladaEm: null, areaCegaDescricao: null });
  });
});

describe("sucessão de liderança → troca de senha (Art. 160, §4º, I)", () => {
  test("só a SAÍDA de alguém obriga a troca; quem entra não", () => {
    expect(c.compararSucessao("12", "40")).toEqual({ sairam: [12], entraram: [40] });
    expect(c.compararSucessao("12", "12,40")).toEqual({ sairam: [], entraram: [40] });
    expect(c.compararSucessao("12,40", "12")).toEqual({ sairam: [40], entraram: [] });
    expect(c.compararSucessao("12", "12")).toEqual({ sairam: [], entraram: [] });
    expect(c.compararSucessao("12", "")).toEqual({ sairam: [12], entraram: [] });
    expect(c.compararSucessao("", "12")).toEqual({ sairam: [], entraram: [12] });
  });
  test("assinatura ordenada, sem repetição e sem lixo", () => {
    expect(c.assinaturaDeMatriculas([40, 12, 12, "x", 0, -3, 7])).toBe("7,12,40");
    expect(c.assinaturaDeMatriculas([])).toBe("");
  });
  test("a ação pedida depende de o canal ter senha ou ser grupo", () => {
    expect(c.acaoDaTroca({ plataforma: "INSTAGRAM" })).toMatch(/senha/);
    expect(c.acaoDaTroca({ plataforma: "WHATSAPP_GRUPO" })).toMatch(/administradores do grupo/);
  });
  test("datas ISO", () => {
    expect(c.diasEntreIso("2026-09-01", "2026-10-01")).toBe(30);
    expect(c.somarDiasIso("2026-10-30", 3)).toBe("2026-11-02");
  });
});
