// v7.14 — a regra pura da Identidade Visual Anual (shared/identidadeVisual.js): o calendário do Art. 159 pela data de Brasília, o texto, o igual e o parecido, as cores, a
// imagem, a apuração, o resultado e os avisos.
const iv = require("../identidadeVisual");

describe("o calendário (Art. 159 § 1º)", () => {
  test("as datas do processo da identidade de 2028 (em novembro e dezembro de 2027)", () => {
    const c = iv.calendario(2028);
    expect(c).toMatchObject({ anoDoProcesso: 2027, sugestao: { inicio: "2027-11-01", fim: "2027-11-15" }, triagem: { inicio: "2027-11-16", fim: "2027-11-21" },
      votacao: { inicio: "2027-11-22", fim: "2027-11-30" }, arte: { inicio: "2027-12-01", fim: "2027-12-31" } });
    expect(c.votacaoFechaEm).toBe("2027-12-01T03:00:00.000Z");
  });
  test.each([
    ["2027-10-31", "AGUARDANDO"], ["2027-11-01", "SUGESTAO"], ["2027-11-15", "SUGESTAO"], ["2027-11-16", "TRIAGEM"], ["2027-11-21", "TRIAGEM"],
    ["2027-11-22", "VOTACAO"], ["2027-11-30", "VOTACAO"], ["2027-12-01", "ARTE"], ["2027-12-31", "ARTE"], ["2028-01-01", "ENCERRADO"], ["2030-06-01", "ENCERRADO"]
  ])("no dia %s a etapa é %s", (dia, fase) => { expect(iv.fase(2028, dia)).toBe(fase); });
  test("com o resultado registrado, encerrado (mesmo em dezembro)", () => { expect(iv.fase(2028, "2027-12-10", { encerrado: true })).toBe("ENCERRADO"); });
  test("a votação fecha à meia-noite de Brasília do dia 30 (03h UTC de 1º/12), nem antes nem depois", () => {
    expect(iv.votacaoFechou(2028, new Date("2027-12-01T02:59:59.999Z"))).toBe(false);
    expect(iv.votacaoFechou(2028, new Date("2027-12-01T03:00:00.000Z"))).toBe(true);
    expect(iv.votacaoFechou(2028, new Date("2027-11-30T23:30:00Z"))).toBe(false);       // 20h30 do dia 30 em Brasília
  });
  test("o dia vem de Brasília: às 22h de 15/11 (01h UTC do dia 16) ainda é dia de sugestão", () => {
    expect(iv.fase(2028, iv.hoje(new Date("2027-11-16T01:00:00Z")))).toBe("SUGESTAO");
    expect(iv.fase(2028, iv.hoje(new Date("2027-11-16T03:00:00Z")))).toBe("TRIAGEM");
  });
  test("abrir o ciclo: só o do ano que vem, até 15/11 (o deste ano, feito fora do sistema, não é aberto sozinho)", () => {
    expect(iv.anoAlvoDoDia("2026-10-23")).toBe(2027);
    expect(iv.podeAbrirCiclo(2028, "2027-03-10").ok).toBe(true);
    expect(iv.podeAbrirCiclo(2028, "2027-11-15").ok).toBe(true);
    expect(iv.podeAbrirCiclo(2028, "2027-11-16").problema).toMatch(/terminaram em 15\/11/);
    expect(iv.podeAbrirCiclo(2029, "2027-03-10").problema).toMatch(/ano que vem \(2028\)/);
    expect(iv.podeAbrirCiclo("2028", "2027-03-10").problema).toBeDefined();
  });
  test("(revisão) o primeiro ciclo no sistema é o da identidade de 2028 (o de 2027 foi feito fora — decisão de 23/10/2026)", () => {
    expect(iv.PRIMEIRO_CICLO).toBe(2028);
    expect(iv.podeAbrirCiclo(2027, "2026-10-23").problema).toMatch(/primeiro ciclo no sistema é o da identidade de 2028/);
    expect(iv.podeAbrirCiclo(2028, "2027-10-23").ok).toBe(true);
  });
  test("(revisão) a arte se retira até 24/12 do ano do processo", () => { expect(iv.retiradaDeArteAte(2028)).toBe("2027-12-24"); });
  test("ano fora do intervalo: erro (nunca um calendário inventado)", () => { expect(() => iv.calendario(1999)).toThrow(); expect(() => iv.calendario(2028.5)).toThrow(); });
});

describe("o texto da sugestão", () => {
  test("normalizar: sem acento, minúsculas, só letras e números, espaço simples", () => {
    expect(iv.normalizar("  Avante,   IGREJA! Ação & Fé ")).toBe("avante igreja acao fe");
    expect(iv.normalizar("Família: fé — e missão...")).toBe("familia fe e missao");
    expect(iv.normalizar(null)).toBe("");
  });
  test("válido: espaços colapsados", () => {
    expect(iv.validarTema("  Fé   que  vence ")).toEqual({ texto: "Fé que vence", normalizado: "fe que vence" });
    expect(iv.validarTema("é".repeat(80)).texto).toHaveLength(80);
  });
  test("(revisão) o tamanho é o do banco (NVARCHAR conta unidades UTF-16: um emoji conta 2) — 40 emojis e mais texto não passam de 80 sem a recusa", () => {
    const emoji = String.fromCodePoint(0x1f600);
    expect(iv.validarTema(emoji.repeat(40) + " fé").problema).toMatch(/até 80 caracteres \(tem 83; um emoji conta 2\)/);
    expect(iv.validarTema(emoji.repeat(30) + " Fé que vence").problema).toBeUndefined();
    expect(iv.validarTextoLivre(emoji.repeat(151), { campo: "o motivo", max: 300 }).problema).toMatch(/tem 302/);
    expect(iv.validarTextoLivre(emoji.repeat(150), { campo: "o motivo", max: 300 }).texto).toHaveLength(300);
  });
  test("(revisão) letra de outro alfabeto (o 'а' cirílico, o 'ο' grego, que parecem latinos) é recusada com aviso; a letra larga e a ligadura viram a comum", () => {
    const cirilico = String.fromCharCode(0x0410) + "vante igreja";          // "Аvante" com o A cirílico
    const grego = "Ig" + String.fromCharCode(0x03bf) + "reja";               // "o" grego
    expect(iv.validarTema(cirilico).problema).toMatch(/letras de outro alfabeto/);
    expect(iv.validarTema(grego).problema).toMatch(/letras de outro alfabeto/);
    const largo = Array.from("Avante", (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).join("") + " igreja";   // "Ａｖａｎｔｅ igreja"
    expect(iv.validarTema(largo).normalizado).toBe("avante igreja");
    expect(iv.normalizar(String.fromCharCode(0xfb01) + "el" + String.fromCharCode(0x00b2))).toBe("fiel2");          // "ﬁel²"
    expect(iv.conferirTemasUsados(iv.validarTema(largo).normalizado, [{ ano: 2027, tema: "Avante, Igreja!", normalizado: "avante igreja" }]).igual.ano).toBe(2027);
    expect(iv.validarTema("Ação, fé e coração").problema).toBeUndefined();      // acento e cedilha são do nosso alfabeto
  });
  const invisivel = String.fromCharCode(0x200b), bidi = String.fromCharCode(0x202e), separador = String.fromCharCode(0x2028);
  test.each([
    [undefined, /Escreva/], [12, /Escreva/], ["ab", /mínimo 3/], ["x".repeat(81), /até 80 caracteres \(tem 81/], ["<b>Tema</b>", /< e >/], ["Tema " + invisivel + "oculto", /invisível/],
    ["Tema " + bidi + "invertido", /invisível/], ["Tema" + separador + "linha", /invisível/], ["Tema\noutra linha", /quebra de linha/], ["Tema\u0000nulo", /invisível/], ["!!! ???", /palavras/], ["123 456", /palavras/]
  ])("recusa %p", (v, msg) => { expect(iv.validarTema(v).problema).toMatch(msg); });
  test("texto livre (motivo, ata): opcional quando pode faltar; o limite e o invisível valem", () => {
    expect(iv.validarTextoLivre("", { campo: "a ata", max: 10, opcional: true })).toEqual({ texto: null });
    expect(iv.validarTextoLivre("x".repeat(11), { campo: "a ata", max: 10 }).problema).toMatch(/até 10/);
    expect(iv.validarTextoLivre("linha 1\nlinha 2", { campo: "a ata", max: 100 }).texto).toBe("linha 1\nlinha 2");
    expect(iv.validarTextoLivre("a\nb", { campo: "o nome", max: 100, umaLinha: true }).problema).toMatch(/quebra de linha/);
    expect(iv.validarTextoLivre("ok" + invisivel, { campo: "o motivo", max: 100 }).problema).toMatch(/invisível/);
  });
});

describe("antiduplicidade: igual e parecido", () => {
  const usados = [{ ano: 2027, tema: "Avante, Igreja!", normalizado: "avante igreja" }, { ano: 2026, tema: "Fé que vence o mundo", normalizado: "fe que vence o mundo" }];
  test("igual (sem diferença de acento, maiúscula ou pontuação): devolve o tema e o ano", () => {
    expect(iv.conferirTemasUsados(iv.normalizar("AVANTE igreja!!!"), usados).igual.ano).toBe(2027);
  });
  test.each([
    ["Avante a Igreja", 2027, "mesmas palavras que contam, com palavra vazia a mais"],
    ["Igreja, avante!", 2027, "mesmas palavras em outra ordem"],
    ["Uma fé que vence o mundo inteiro", 2026, "todas as palavras do mais curto estão no mais longo"],
    ["Fé que vençe o mundo", null, "acento é ignorado: vira igual"],
    ["Fe que vence os mundos", 2026, "plural: poucas letras de diferença"]
  ])("\"%s\"", (texto, ano, _porque) => {
    const r = iv.conferirTemasUsados(iv.normalizar(texto), usados);
    if (ano === null) expect(r.igual).not.toBeNull();
    else { expect(r.igual).toBeNull(); expect(r.parecido && r.parecido.ano).toBe(ano); }
  });
  test.each([["Família em Cristo"], ["Jovens em missão"], ["Paz"], ["Luz do mundo e sal da terra"]])("\"%s\" não é parecido", (texto) => {
    const r = iv.conferirTemasUsados(iv.normalizar(texto), usados);
    expect(r).toEqual({ igual: null, parecido: null });
  });
  test("texto curto: uma letra de diferença só (\"Paz\" × \"Luz\" não, \"Paz\" × \"Pas\" sim)", () => {
    expect(iv.parecidos("paz", "luz")).toBe(false);
    expect(iv.parecidos("paz", "pas")).toBe(true);
  });
  test("lista vazia ou malformada não quebra", () => {
    expect(iv.conferirTemasUsados("abc", null)).toEqual({ igual: null, parecido: null });
    expect(iv.conferirTemasUsados("abc", [null, {}])).toEqual({ igual: null, parecido: null });
  });
  test("distância de edição", () => { expect(iv.distancia("abc", "abc")).toBe(0); expect(iv.distancia("", "abc")).toBe(3); expect(iv.distancia("kitten", "sitting")).toBe(3); });
});

describe("cores, imagem, apuração e resultado", () => {
  test("cor: posição 1 a 3, nome sem tag, #RRGGBB (guardado em maiúsculas)", () => {
    expect(iv.validarCor({ ordem: "2", nome: " Azul royal ", hex: "#1a4d8f" }).dados).toEqual({ ordem: 2, nome: "Azul royal", hex: "#1A4D8F" });
    for (const d of [{ ordem: 0, nome: "Azul", hex: "#112233" }, { ordem: 4, nome: "Azul", hex: "#112233" }, { ordem: 1, nome: "A", hex: "#112233" }, { ordem: 1, nome: "<i>Azul</i>", hex: "#112233" },
      { ordem: 1, nome: "Azul", hex: "#123" }, { ordem: 1, nome: "Azul", hex: "112233" }, { ordem: 1, nome: "Azul", hex: "#GGGGGG" }, null, [1]]) {
      expect(iv.validarCor(d).problema).toBeDefined();
    }
  });
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(10)]);
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(10)]);
  test("imagem: a assinatura do arquivo tem de bater com o tipo; até 5 MB; só PNG e JPEG", () => {
    expect(iv.conferirImagem(png, "image/png").ok).toBe(true);
    expect(iv.conferirImagem(jpg, "image/jpeg").ok).toBe(true);
    expect(iv.conferirImagem(png, "image/jpeg").problema).toMatch(/não é a imagem/);
    expect(iv.conferirImagem(Buffer.from("texto qualquer, não imagem"), "image/png").problema).toMatch(/não é a imagem/);
    expect(iv.conferirImagem(png, "image/gif").problema).toMatch(/PNG ou JPEG/);
    expect(iv.conferirImagem(Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]), "image/png").problema).toMatch(/5 MB/);
    expect(iv.conferirImagem(Buffer.alloc(3), "image/png").problema).toMatch(/vazia/);
  });
  test("base64: recusa antes de decodificar o que passa do limite ou não é base64", () => {
    expect(iv.base64CabeNoLimite(png.toString("base64"))).toBe(true);
    expect(iv.base64CabeNoLimite("")).toBe(false);
    expect(iv.base64CabeNoLimite("abc$")).toBe(false);
    expect(iv.base64CabeNoLimite("A".repeat(8 * 1024 * 1024))).toBe(false);
    expect(iv.base64CabeNoLimite(123)).toBe(false);
  });
  test("apuração: vencedor, empate e nenhum voto", () => {
    expect(iv.apurar([{ opcaoId: 1, votos: 4 }, { opcaoId: 2, votos: 3 }])).toMatchObject({ situacao: "VENCEDOR", vencedor: 1, total: 7, maior: 4 });
    expect(iv.apurar([{ opcaoId: 1, votos: 3 }, { opcaoId: 2, votos: 3 }, { opcaoId: 3, votos: 1 }])).toMatchObject({ situacao: "EMPATE", empatados: [1, 2] });
    expect(iv.apurar([{ opcaoId: 1, votos: 0 }, { opcaoId: 2, votos: 0 }])).toMatchObject({ situacao: "SEM_VOTOS", empatados: [1, 2] });
    expect(iv.apurar(null)).toMatchObject({ situacao: "SEM_VOTOS", total: 0 });
  });
  test("resultado do culto: dezembro do ano do processo, nunca no futuro, votos e presentes coerentes", () => {
    const ctx = { anoAlvo: 2028, hoje: "2027-12-20" };
    const ok = { dataCulto: "2027-12-19", ocasiao: "VIGILIA", votosVencedor: "40", presentes: 70, ata: " Ata 3 " };
    expect(iv.validarResultado(ok, ctx).dados).toEqual({ dataCulto: "2027-12-19", ocasiao: "VIGILIA", votosVencedor: 40, presentes: 70, ata: "Ata 3" });
    expect(iv.validarResultado({ ...ok, presentes: "" }, ctx).dados.presentes).toBeNull();
    for (const [d, msg] of [[{ ...ok, dataCulto: "2027-11-30" }, /dezembro/], [{ ...ok, dataCulto: "2027-12-21" }, /futuro/], [{ ...ok, dataCulto: "2027-02-30" }, /data do culto/],
      [{ ...ok, ocasiao: "OUTRA" }, /ocasião/], [{ ...ok, votosVencedor: 0 }, /votos/], [{ ...ok, votosVencedor: 1.5 }, /votos/], [{ ...ok, presentes: 10 }, /presentes/]]) {
      expect(iv.validarResultado(d, ctx).problema).toMatch(msg);
    }
  });
});

describe("(revisão) os metadados da imagem saem antes de guardar (GPS, aparelho, data, autor, perfil de cor)", () => {
  const chunk = (tipo, dados) => { const d = Buffer.from(dados, "latin1"); const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(tipo, 4, "latin1"); d.copy(b, 8); return b; };
  const ASS = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const png = Buffer.concat([ASS, chunk("IHDR", "x".repeat(13)), chunk("tEXt", "Author" + String.fromCharCode(0) + "Fulano"), chunk("eXIf", "MM*GPSLatitude -6.06 GPSLongitude -49.9"),
    chunk("iTXt", "XML:com.adobe.xmp GPS"), chunk("iCCP", "perfil do aparelho"), chunk("tIME", "1234567"), chunk("pHYs", "123456789"), chunk("IDAT", "dados da imagem"), chunk("IEND", "")]);
  const seg = (marcador, dados) => { const d = Buffer.from(dados, "latin1"); const b = Buffer.alloc(4 + d.length); b[0] = 0xff; b[1] = marcador; b.writeUInt16BE(d.length + 2, 2); d.copy(b, 4); return b; };
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, "JFIF" + String.fromCharCode(0) + "dados"), seg(0xe1, "Exif GPSLatitude -6.06 Canon"), seg(0xe2, "ICC_PROFILE perfil"),
    seg(0xed, "Photoshop IPTC autor"), seg(0xfe, "comentario do GPS"), seg(0xee, "Adobe"), seg(0xdb, "tabela"), seg(0xc0, "quadro"), seg(0xc4, "huffman"), seg(0xda, "cabecalho"),
    Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78]), Buffer.from([0xff, 0xd9]), Buffer.from("lixo depois do fim com GPS", "latin1")]);
  test("PNG: saem texto, EXIF, XMP, perfil e data; ficam o cabeçalho, os dados, o fim e a densidade", () => {
    const r = iv.prepararImagem(png, "image/png");
    expect(r.problema).toBeUndefined();
    const t = r.buffer.toString("latin1");
    for (const x of ["GPS", "Author", "Fulano", "perfil", "tEXt", "eXIf", "iTXt", "iCCP", "tIME"]) expect(t).not.toContain(x);
    for (const x of ["IHDR", "IDAT", "dados da imagem", "IEND", "pHYs"]) expect(t).toContain(x);
    expect(r.buffer.subarray(0, 8).equals(ASS)).toBe(true);
  });
  test("JPEG: saem APP1 (EXIF/XMP), APP2 (perfil), APP13 (IPTC), o comentário e o que vem depois do fim; ficam JFIF, Adobe, tabelas, quadro e os dados comprimidos", () => {
    const r = iv.prepararImagem(jpeg, "image/jpeg");
    expect(r.problema).toBeUndefined();
    const t = r.buffer.toString("latin1");
    for (const x of ["GPS", "Exif", "Canon", "ICC_PROFILE", "Photoshop", "comentario", "lixo"]) expect(t).not.toContain(x);
    for (const x of ["JFIF", "Adobe", "tabela", "quadro", "huffman", "cabecalho"]) expect(t).toContain(x);
    expect(r.buffer.subarray(r.buffer.length - 2).equals(Buffer.from([0xff, 0xd9]))).toBe(true);
    expect(t).toContain(Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78]).toString("latin1"));     // os dados comprimidos, com o byte de enchimento e o reinício
  });
  test("arquivo que não se deixa percorrer é recusado (não é a imagem que diz ser)", () => {
    expect(iv.prepararImagem(Buffer.concat([ASS, Buffer.from("lixo")]), "image/png").problema).toMatch(/corrompida/);
    expect(iv.prepararImagem(Buffer.concat([ASS, chunk("IHDR", "x".repeat(13))]), "image/png").problema).toMatch(/corrompida/);          // sem o fim (IEND)
    expect(iv.prepararImagem(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0x00]), "image/jpeg").problema).toMatch(/corrompida/);        // tamanho além do arquivo
    expect(iv.prepararImagem(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0x12]), "image/jpeg").problema).toMatch(/corrompida/);   // sem o fim (EOI)
  });
});

describe("os avisos à Diretoria", () => {
  test("cada etapa diz o que fazer e até quando", () => {
    expect(iv.textoTriagem({ anoAlvo: 2028, quantas: 12 })).toMatch(/12 sugestão\(ões\).*21\/11\/2027/);
    expect(iv.textoVotacaoAberta({ anoAlvo: 2028, finalistas: 3 })).toMatch(/Meu Painel.*30\/11\/2027/);
    expect(iv.textoVotacaoSemFinalistas({ anoAlvo: 2028, finalistas: 1 })).toMatch(/NÃO abriu.*pelo menos 2/);
    expect(iv.textoVotacaoEsperando({ anoAlvo: 2028, pendentes: 3, finalistas: 4 })).toMatch(/NÃO abriu sozinha: há 3 sugestão\(ões\) ainda sem decisão/);
    expect(iv.textoApuracao({ anoAlvo: 2028, situacao: "VENCEDOR", tema: "Fé", votos: 3, total: 5 })).toMatch(/"Fé" \(3 de 5/);
    expect(iv.textoApuracao({ anoAlvo: 2028, situacao: "EMPATE", total: 4 })).toMatch(/EMPATE/);
    expect(iv.textoApuracao({ anoAlvo: 2028, situacao: "SEM_VOTOS" })).toMatch(/sem nenhum voto/);
    expect(iv.textoArte({ anoAlvo: 2028, cores: 0 })).toMatch(/Registre até 3 cores/);
    expect(iv.textoArte({ anoAlvo: 2028, cores: 2 })).toMatch(/2 cor\(es\)/);
  });
  test("os três critérios do descarte são os do inciso I, a", () => {
    expect(Object.keys(iv.CRITERIOS)).toEqual(["1", "2", "3"]);
    expect(iv.CRITERIOS[3].rotulo).toBe("Originalidade total");
  });
});
