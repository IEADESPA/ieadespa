// A regra PURA do consentimento do responsável (v7.7, LGPD art. 14, § 1º): os textos e o hash do que a pessoa leu, o estado de cada (menor, finalidade) a partir da
// ÚLTIMA linha e dos responsáveis ativos, e as validações de forma (ids estritos, caixa estrita, IP, referência da ficha). Sem banco.
const crypto = require("crypto");
const mc = require("../menoresConsentimento");
const IP = "177.8.9.10";
const HASH = (f) => mc.textoDe(f).hash;
const CONCEDE = { menorId: 30, responsavelId: 40, finalidade: "IMAGEM", aceito: true, termoHash: HASH("IMAGEM"), ip: IP };
const linha = (extra = {}) => ({ concedido: true, responsavelId: 40, textoVersao: 1, textoHash: HASH("IMAGEM"), forma: "CLICK_RESP", registradoEm: "2026-10-08T12:00:00.000Z", ...extra });

describe("os textos (um por finalidade) e o hash", () => {
  test("duas finalidades, versão 1, cada uma com título, itens e frase de aceite; o hash tem 64 hexadecimais e é DIFERENTE por finalidade", () => {
    expect(mc.CODIGOS_FINALIDADE).toEqual(["IMAGEM", "SAUDE_CRACHA"]);
    expect(mc.CONSENTIMENTO_VERSAO).toBe(1);
    const hashes = mc.textosVigentes().map((t) => t.hash);
    for (const t of mc.textosVigentes()) {
      expect(t.versao).toBe(1);
      expect(t.titulo.length).toBeGreaterThan(10);
      expect(t.aceite).toMatch(/responsável legal/);
      expect(t.hash).toMatch(/^[0-9a-f]{64}$/);
      for (const i of t.itens) expect(Object.keys(i).sort()).toEqual(["base", "codigo", "texto"]);
    }
    expect(new Set(hashes).size).toBe(2);
  });
  test("o hash é o sha256 do JSON de { v, finalidade, titulo, itens, aceite } — o mesmo desenho dos outros termos", () => {
    for (const f of mc.CODIGOS_FINALIDADE) {
      const t = mc.textoDe(f);
      expect(t.hash).toBe(crypto.createHash("sha256").update(JSON.stringify({ v: t.versao, finalidade: f, titulo: t.titulo, itens: t.itens, aceite: t.aceite })).digest("hex"));
    }
  });
  test("mudar UMA palavra do texto muda o hash (a prova é o texto que a pessoa viu)", () => {
    const t = mc.textoDe("IMAGEM");
    const itens = t.itens.map((i, n) => (n === 1 ? { ...i, texto: i.texto + " " } : i));
    const outro = crypto.createHash("sha256").update(JSON.stringify({ v: t.versao, finalidade: "IMAGEM", titulo: t.titulo, itens, aceite: t.aceite })).digest("hex");
    expect(outro).not.toBe(t.hash);
  });
  test("cada texto é ESPECÍFICO e em destaque: o que, com qual dado, quem vê, quanto tempo, opcional, como revogar e o efeito", () => {
    for (const f of mc.CODIGOS_FINALIDADE) {
      const codigos = mc.textoDe(f).itens.map((i) => i.codigo);
      for (const c of ["RESPONSAVEL", "O_QUE", "QUEM_VE", "PRAZO", "OPCIONAL", "REVOGAR", "REGISTRO"]) expect(codigos).toContain(c);
      const todo = mc.textoDe(f).itens.map((i) => i.texto).join(" ");
      expect(todo).toMatch(/NÃO é condição para o\(a\) menor participar/);
      expect(todo).toMatch(/revogar a qualquer momento/);
      expect(todo).toMatch(/IP, a data e a hora/);
    }
  });
  test("IMAGEM: foto no cadastro, no crachá e em materiais internos; revogar APAGA o arquivo e a imagem deixa de ser usada; não vai à internet", () => {
    const todo = mc.textoDe("IMAGEM").itens.map((i) => i.texto).join(" ");
    expect(todo).toMatch(/foto do rosto/);
    expect(todo).toMatch(/crachá/);
    expect(todo).toMatch(/materiais internos/);
    expect(todo).toMatch(/arquivo da foto é apagado e a imagem deixa de ser usada/);
    expect(todo).toMatch(/não é publicada na internet/);
  });
  test("SAUDE_CRACHA: alergia ou condição que o responsável ESCOLHE informar, no crachá do check-in infantil; dado sensível, só para cuidado e segurança", () => {
    const t = mc.textoDe("SAUDE_CRACHA");
    expect(t.itens.map((i) => i.codigo)).toContain("DADO_SENSIVEL");
    const todo = t.itens.map((i) => i.texto).join(" ");
    expect(todo).toMatch(/alergia/);
    expect(todo).toMatch(/check-in infantil/);
    expect(todo).toMatch(/Informo só o que eu escolher/);
    expect(todo).toMatch(/dado pessoal sensível/);
    expect(todo).toMatch(/cuidado e a segurança/);
    expect(t.itens.find((i) => i.codigo === "DADO_SENSIVEL").base).toMatch(/art\. 11, I/);
  });
  test("textoDe devolve CÓPIA (quem chama não muda o texto vigente) e null para finalidade fora da lista", () => {
    const t = mc.textoDe("IMAGEM");
    t.itens[0].texto = "adulterado"; t.titulo = "x";
    expect(mc.textoDe("IMAGEM").itens[0].texto).not.toBe("adulterado");
    expect(mc.textoDe("IMAGEM").titulo).not.toBe("x");
    for (const f of ["OUTRA", "", null, undefined, 5, ["IMAGEM"], "imagem", "toString", "__proto__", "constructor"]) expect(mc.textoDe(f)).toBeNull();
    for (const f of ["toString", "__proto__", "constructor", "hasOwnProperty"]) expect(mc.ehFinalidade(f)).toBe(false);
  });
  test("hashConfere: só o hash do texto vigente da MESMA finalidade (maiúsculas e espaços não importam; tipo errado, não)", () => {
    expect(mc.hashConfere("IMAGEM", HASH("IMAGEM"))).toBe(true);
    expect(mc.hashConfere("IMAGEM", `  ${HASH("IMAGEM").toUpperCase()} `)).toBe(true);
    expect(mc.hashConfere("IMAGEM", HASH("SAUDE_CRACHA"))).toBe(false);          // o texto da saúde não vale pela imagem
    for (const h of [undefined, null, 5, true, ["x"], {}, "", "0".repeat(64)]) expect(mc.hashConfere("IMAGEM", h)).toBe(false);
    expect(mc.hashConfere("OUTRA", HASH("IMAGEM"))).toBe(false);
  });
  test("a integridade do registro: ficha é documento externo; o aceite digital confere o hash da versão", () => {
    expect(mc.avaliarIntegridade({ forma: "FICHA_FISICA", textoVersao: 1, textoHash: "x" }, "IMAGEM").status).toBe("DOCUMENTO_EXTERNO");
    expect(mc.avaliarIntegridade({ forma: "CLICK_RESP", textoVersao: 1, textoHash: HASH("IMAGEM") }, "IMAGEM").status).toBe("OK");
    expect(mc.avaliarIntegridade({ forma: "CLICK_RESP", textoVersao: 1, textoHash: "0".repeat(64) }, "IMAGEM").status).toBe("DIVERGENTE");
    expect(mc.avaliarIntegridade({ forma: "CLICK_RESP", textoVersao: 0, textoHash: "0".repeat(64) }, "IMAGEM").status).toBe("VERSAO_ANTERIOR");
    expect(mc.avaliarIntegridade({ forma: "CLICK_RESP", textoVersao: 1 }, "IMAGEM").status).toBe("SEM_HASH");
  });
});

describe("menor de idade (idade CONHECIDA abaixo de 18)", () => {
  test("17 é menor; 18 e mais não; idade desconhecida NÃO é tratada como menor nem como adulto", () => {
    expect(mc.ehMenor(0)).toBe(true);
    expect(mc.ehMenor(17)).toBe(true);
    expect(mc.ehMenor(18)).toBe(false);
    expect(mc.ehMenor(null)).toBe(false);
    expect(mc.ehMenor(undefined)).toBe(false);
    expect(mc.ehAdulto(18)).toBe(true);
    expect(mc.ehAdulto(null)).toBe(false);
  });
  test("a condição diz por que não: sem data de nascimento e adulto têm motivos diferentes", () => {
    expect(mc.condicaoDoMenor(10)).toEqual({ menor: true, motivo: null });
    expect(mc.condicaoDoMenor(null).motivo).toMatch(/data de nascimento/);
    expect(mc.condicaoDoMenor(30).motivo).toMatch(/18 anos ou mais/);
    expect(mc.condicaoDoResponsavel(40).pode).toBe(true);
    expect(mc.condicaoDoResponsavel(17).pode).toBe(false);
    expect(mc.condicaoDoResponsavel(null).pode).toBe(false);
  });
});

describe("estadoDoConsentimento: a última linha + os responsáveis ativos", () => {
  test("sem nenhuma linha: NUNCA_DADO quando há responsável que possa dar; SEM_RESPONSAVEL_ATIVO quando não há", () => {
    expect(mc.estadoDoConsentimento(null, [40])).toMatchObject({ situacao: "NUNCA_DADO", vigente: false, podeConceder: true });
    expect(mc.estadoDoConsentimento(null, [])).toMatchObject({ situacao: "SEM_RESPONSAVEL_ATIVO", vigente: false, podeConceder: false });
    expect(mc.estadoDoConsentimento(undefined, undefined).situacao).toBe("SEM_RESPONSAVEL_ATIVO");
  });
  test("CONCEDIDO só vale se quem concedeu AINDA é responsável ativo", () => {
    expect(mc.estadoDoConsentimento(linha(), [40])).toMatchObject({ situacao: "CONCEDIDO", vigente: true, desatualizado: false, forma: "CLICK_RESP" });
    expect(mc.estadoDoConsentimento(linha(), [40, 41]).vigente).toBe(true);
    expect(mc.estadoDoConsentimento(linha(), new Set([40])).vigente).toBe(true);
    // O responsável que concedeu foi revogado: a autorização não vale mais, mesmo havendo outro responsável (que precisa autorizar de novo).
    const saiu = mc.estadoDoConsentimento(linha(), [41]);
    expect(saiu).toMatchObject({ situacao: "SEM_RESPONSAVEL_ATIVO", vigente: false, quemAutorizouSaiu: true, podeConceder: true });
    expect(saiu.mensagem).toMatch(/autorizar de novo/);
    // E sem nenhum responsável ativo: também não vale, e a mensagem manda procurar a Secretaria.
    const sozinho = mc.estadoDoConsentimento(linha(), []);
    expect(sozinho).toMatchObject({ situacao: "SEM_RESPONSAVEL_ATIVO", vigente: false, quemAutorizouSaiu: true, podeConceder: false });
    expect(sozinho.mensagem).toMatch(/Secretaria/);
  });
  test("REVOGADO: a última linha revoga, qualquer que seja o responsável ativo", () => {
    for (const ativos of [[40], [41], []]) expect(mc.estadoDoConsentimento(linha({ concedido: false }), ativos)).toMatchObject({ situacao: "REVOGADO", vigente: false });
  });
  test("a matrícula pode chegar em texto (o banco devolve número, mas a regra não se apoia nisso); lixo na lista de ativos é ignorado", () => {
    expect(mc.estadoDoConsentimento(linha({ responsavelId: "40" }), ["40"]).vigente).toBe(true);
    expect(mc.estadoDoConsentimento(linha(), [null, "x", -1, 0, 1.5, "0x28"]).vigente).toBe(false);
    expect(mc.estadoDoConsentimento(linha(), "40").vigente).toBe(false);
  });
  test("texto de versão antiga continua valendo (a prova é o hash da época), mas fica marcado como desatualizado", () => {
    // Simula uma versão futura: o estado só compara o número guardado com o vigente.
    const e = mc.estadoDoConsentimento(linha({ textoVersao: 0 }), [40]);
    expect(e).toMatchObject({ vigente: true, desatualizado: true, textoVersao: 0 });
  });
  test("o rótulo e a mensagem existem para todas as situações (a tela não fica em branco)", () => {
    for (const e of [mc.estadoDoConsentimento(null, [1]), mc.estadoDoConsentimento(null, []), mc.estadoDoConsentimento(linha(), [40]), mc.estadoDoConsentimento(linha({ concedido: false }), [40])]) {
      expect(e.rotulo).toBe(mc.SITUACOES[e.situacao]);
      expect(e.mensagem.length).toBeGreaterThan(5);
    }
  });
});

describe("validarConceder", () => {
  test("o caminho feliz devolve só o que o banco grava (a versão e o hash são os do texto VIGENTE, não os enviados)", () => {
    const v = mc.validarConceder({ ...CONCEDE, finalidade: "saude_cracha", termoHash: HASH("SAUDE_CRACHA").toUpperCase() });
    expect(v).toEqual({ valido: true, dados: { menorId: 30, responsavelId: 40, finalidade: "SAUDE_CRACHA", textoVersao: 1, textoHash: HASH("SAUDE_CRACHA") } });
  });
  test("ids estritos: '0x10', '1e1' (texto), true, [5], 0, negativo, decimal, grande demais e nulos NÃO são identificadores", () => {
    for (const ruim of ["0x10", "1e1", true, [5], {}, 0, -1, 1.5, "1.5", "-3", 3e9, "99999999999", "", " ", null, undefined, "abc"]) {
      expect(mc.validarConceder({ ...CONCEDE, menorId: ruim }).valido).toBe(false);
      expect(mc.validarConceder({ ...CONCEDE, responsavelId: ruim }).valido).toBe(false);
    }
    expect(mc.validarConceder({ ...CONCEDE, menorId: "30" }).valido).toBe(true);        // a query string chega em texto
  });
  test("ninguém autoriza por si mesmo (menor = responsável): a mesma recusa de quem não é responsável (403), no conceder e no revogar", () => {
    const v = mc.validarConceder({ ...CONCEDE, menorId: 40, responsavelId: 40 });
    expect(v).toEqual({ valido: false, proibido: true, mensagem: mc.MENSAGENS.NAO_E_RESPONSAVEL });
    expect(mc.validarRevogar({ menorId: 40, responsavelId: 40, finalidade: "IMAGEM" })).toEqual(v);
  });
  test("a finalidade tem de ser da lista", () => {
    for (const f of [undefined, null, "", "OUTRA", 1, true, ["IMAGEM"], {}, "IMAGEM,SAUDE_CRACHA"]) expect(mc.validarConceder({ ...CONCEDE, finalidade: f }).valido).toBe(false);
  });
  test("aceito é ESTRITAMENTE true (nada de 'true', 1, 'on')", () => {
    for (const a of [false, "true", 1, "on", "sim", undefined, null, [true], {}]) {
      const v = mc.validarConceder({ ...CONCEDE, aceito: a });
      expect(v.valido).toBe(false);
      expect(v.mensagem).toMatch(/caixa de aceite/);
    }
  });
  test("o hash do texto que a tela mostrou: velho, de outra finalidade, ausente ou de tipo errado → termoMudou", () => {
    for (const h of ["0".repeat(64), HASH("SAUDE_CRACHA"), undefined, null, 5, ["x"], ""]) {
      const v = mc.validarConceder({ ...CONCEDE, termoHash: h });
      expect(v).toMatchObject({ valido: false, termoMudou: true });
      expect(v.mensagem).toMatch(/texto da autorização mudou/);
    }
  });
  test("sem IP (público e identificável) não há prova: recusa", () => {
    for (const ip of [null, undefined, "", 0]) {
      const v = mc.validarConceder({ ...CONCEDE, ip });
      expect(v.valido).toBe(false);
      expect(v.mensagem).toMatch(/origem da conexão/);
    }
  });
  test("chamar sem nada não quebra", () => {
    expect(mc.validarConceder().valido).toBe(false);
    expect(mc.validarConceder({}).valido).toBe(false);
  });
});

describe("validarRevogar", () => {
  test("não exige caixa, hash nem IP (revogar é um direito); exige ids estritos e finalidade da lista", () => {
    expect(mc.validarRevogar({ menorId: 30, responsavelId: 40, finalidade: "IMAGEM" })).toEqual({ valido: true, dados: { menorId: 30, responsavelId: 40, finalidade: "IMAGEM" } });
    for (const ruim of ["0x10", "1e1", true, [5], 0, -1, 1.5, null]) {
      expect(mc.validarRevogar({ menorId: ruim, responsavelId: 40, finalidade: "IMAGEM" }).valido).toBe(false);
      expect(mc.validarRevogar({ menorId: 30, responsavelId: ruim, finalidade: "IMAGEM" }).valido).toBe(false);
    }
    expect(mc.validarRevogar({ menorId: 30, responsavelId: 40, finalidade: "x" }).valido).toBe(false);
    expect(mc.validarRevogar({ menorId: 40, responsavelId: 40, finalidade: "IMAGEM" }).valido).toBe(false);
  });
});

describe("validarRegistroManual (a ficha assinada, registrada pela Secretaria)", () => {
  const FICHA = { menorId: 30, responsavelId: 40, finalidade: "IMAGEM", concedido: true, referencia: "Ficha 12, pasta azul", por: 5 };
  test("o caminho feliz (concede ou revoga) devolve os dados com a versão e o hash vigentes", () => {
    const v = mc.validarRegistroManual(FICHA);
    expect(v).toEqual({ valido: true, dados: { menorId: 30, responsavelId: 40, finalidade: "IMAGEM", concedido: true, referencia: "Ficha 12, pasta azul", registradoPor: 5, textoVersao: 1, textoHash: HASH("IMAGEM") } });
    expect(mc.validarRegistroManual({ ...FICHA, concedido: false }).dados.concedido).toBe(false);
  });
  test("ids estritos (menor, responsável e quem registra)", () => {
    for (const ruim of ["0x10", "1e1", true, [5], 0, -1, null, undefined]) {
      for (const campo of ["menorId", "responsavelId", "por"]) expect(mc.validarRegistroManual({ ...FICHA, [campo]: ruim }).valido).toBe(false);
    }
  });
  test("concedido é ESTRITAMENTE booleano", () => {
    for (const c of ["true", "false", 1, 0, null, undefined, [true]]) expect(mc.validarRegistroManual({ ...FICHA, concedido: c }).valido).toBe(false);
  });
  test("a referência da ficha: de 3 a 200 caracteres, sem < ou >, e só texto", () => {
    for (const r of ["", "ab", "  ab  ", "x".repeat(201), "<script>alert(1)</script>", "ficha > 3", undefined, null, ["Ficha 12"], { a: 1 }, true]) expect(mc.validarRegistroManual({ ...FICHA, referencia: r }).valido).toBe(false);
    expect(mc.validarRegistroManual({ ...FICHA, referencia: "x".repeat(200) }).valido).toBe(true);
    expect(mc.validarRegistroManual({ ...FICHA, referencia: "  abc  " }).dados.referencia).toBe("abc");
  });
  test("quem registra NÃO é o responsável que assinou nem o próprio menor (separação de funções): é recusa de permissão", () => {
    expect(mc.validarRegistroManual({ ...FICHA, por: 40 })).toMatchObject({ valido: false, proibido: true });
    expect(mc.validarRegistroManual({ ...FICHA, por: 30 })).toMatchObject({ valido: false, proibido: true });
  });
  test("o responsável não é o próprio menor", () => {
    expect(mc.validarRegistroManual({ ...FICHA, responsavelId: 30 }).valido).toBe(false);
  });
});

describe("textos curtos dos avisos", () => {
  test("a mensagem de revogar a IMAGEM diz que a foto foi apagada e que a imagem deixa de ser usada; a de saúde, que deixa de ser usada no crachá", () => {
    expect(mc.mensagemRevogado({ finalidade: "IMAGEM", menorNome: "Caio", fotoApagada: true })).toMatch(/foto de Caio foi apagada e a imagem deixa de ser usada/);
    expect(mc.mensagemRevogado({ finalidade: "IMAGEM", menorNome: "Caio", fotoApagada: false })).toMatch(/imagem de Caio deixa de ser usada/);
    expect(mc.mensagemRevogado({ finalidade: "SAUDE_CRACHA", menorNome: "Caio" })).toMatch(/deixa de ser usada no crachá/);
    expect(mc.mensagemRevogado({ finalidade: "IMAGEM", menorNome: "" })).toMatch(/o\(a\) menor/);
  });
  test("os demais avisos existem e não deixam 'undefined' no texto", () => {
    const todos = [
      mc.mensagemConcedido({ finalidade: "IMAGEM", menorNome: "Caio" }), mc.mensagemConcedido({ finalidade: "SAUDE_CRACHA", menorNome: "Caio" }),
      mc.mensagemJaRevogado({ finalidade: "IMAGEM", fotoApagada: true }), mc.mensagemJaConcedido(),
      mc.mensagemRegistroManual({ finalidade: "IMAGEM", menorNome: "Caio", concedido: true }), mc.mensagemRegistroManual({ finalidade: "SAUDE_CRACHA", menorNome: "Caio", concedido: false }),
      mc.MSG_FOTO_MENOR_PROPRIO, mc.MSG_FOTO_MENOR_SECRETARIA, ...Object.values(mc.MENSAGENS)
    ];
    for (const m of todos) { expect(m.length).toBeGreaterThan(10); expect(m).not.toMatch(/undefined|\[object/); }
    expect(mc.MSG_FOTO_MENOR_PROPRIO).toMatch(/responsável precisa autorizar o uso da sua imagem/);
    expect(mc.MSG_FOTO_MENOR_SECRETARIA).toMatch(/responsável precisa autorizar o uso da imagem/);
  });
});
