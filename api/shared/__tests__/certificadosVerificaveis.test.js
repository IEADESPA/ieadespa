// Testes do v6.9 (certificado verificável) — código público, selo de
// integridade, o que a verificação PÚBLICA pode (e não pode) mostrar, e o QR.
const certificados = require("../certificados");
const qr = require("../certificadoQr");
const PDFDocument = require("pdfkit");

describe("código de verificação", () => {
  test("16 caracteres do alfabeto sem ambíguos (sem I, O, 0, 1), e não se repete", () => {
    const vistos = new Set();
    for (let i = 0; i < 300; i++) {
      const c = certificados.gerarCodigoVerificacao();
      expect(c).toMatch(/^[A-HJ-NP-Z2-9]{16}$/);
      vistos.add(c);
    }
    expect(vistos.size).toBe(300);
  });

  test("aceita o código como a pessoa digita: minúsculo, com hífen e espaços", () => {
    expect(certificados.normalizarCodigo(" abcd-efgh jklm-npqr ")).toBe("ABCDEFGHJKLMNPQR");
    expect(certificados.formatarCodigo("abcdefghjklmnpqr")).toBe("ABCD-EFGH-JKLM-NPQR");
    expect(certificados.codigoValido("ABCD-EFGH-JKLM-NPQR")).toBe(true);
    expect(certificados.codigoValido("ABCD-EFGH")).toBe(false);
    expect(certificados.codigoValido("")).toBe(false);
    expect(certificados.codigoValido(null)).toBe(false);
  });

  test("os certificados antigos (código em hexadecimal, da migração) continuam aceitos", () => {
    expect(certificados.codigoValido("3F9A1C0D7B2E4A68")).toBe(true);
    expect(certificados.formatarCodigo("3f9a1c0d7b2e4a68")).toBe("3F9A-1C0D-7B2E-4A68");
  });

  test("a URL do QR aponta para a página pública com o código formatado (e respeita APP_URL_PUBLICA)", () => {
    const original = process.env.APP_URL_PUBLICA;
    delete process.env.APP_URL_PUBLICA;
    expect(certificados.urlVerificacao("abcdefghjklmnpqr")).toBe("https://app.ieadespa.org.br/verificar.html?c=ABCD-EFGH-JKLM-NPQR");
    process.env.APP_URL_PUBLICA = "https://homolog.exemplo.org/";
    expect(certificados.urlVerificacao("abcdefghjklmnpqr")).toBe("https://homolog.exemplo.org/verificar.html?c=ABCD-EFGH-JKLM-NPQR");
    if (original === undefined) delete process.env.APP_URL_PUBLICA; else process.env.APP_URL_PUBLICA = original;
  });
});

describe("selo de integridade", () => {
  const base = { codigo: "ABCDEFGHJKLMNPQR", membroId: 42, titulo: "Conclusão da trilha X", dataEmissao: "2026-09-30T10:00:00.000Z", validoAte: "2028-09-30" };

  test("é determinístico e ignora formatação do código e milissegundos da data", () => {
    const h = certificados.calcularHashIntegridade(base);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(certificados.calcularHashIntegridade({ ...base, codigo: "abcd-efgh-jklm-npqr" })).toBe(h);
    expect(certificados.calcularHashIntegridade({ ...base, dataEmissao: new Date("2026-09-30T10:00:00.789Z") })).toBe(h);
    expect(certificados.calcularHashIntegridade({ ...base, validoAte: new Date("2028-09-30T00:00:00.000Z") })).toBe(h); // coluna DATE do mssql
  });

  test("qualquer campo adulterado muda o selo (titular, título, data, validade, código)", () => {
    const h = certificados.calcularHashIntegridade(base);
    for (const alterado of [{ membroId: 43 }, { titulo: "Outro título" }, { dataEmissao: "2026-10-01T10:00:00.000Z" }, { validoAte: "2030-09-30" }, { validoAte: null }, { codigo: "ZZZZZZZZZZZZZZZZ" }]) {
      expect(certificados.calcularHashIntegridade({ ...base, ...alterado })).not.toBe(h);
    }
  });
});

describe("verificação pública", () => {
  const HOJE = "2026-09-30";
  const registro = (extra) => {
    const r = {
      certificadoId: 7, membroId: 42, nome: "Maria da Silva", titulo: "Conclusão da trilha X", protocolo: "CERT-2026-000007",
      dataEmissao: "2026-09-01T12:00:00.000Z", validoAte: "2028-09-01", revogadoEm: null, motivoRevogacao: null,
      codigoVerificacao: "ABCDEFGHJKLMNPQR", ...extra
    };
    if (r.hashIntegridade === undefined) {
      r.hashIntegridade = certificados.calcularHashIntegridade({ codigo: r.codigoVerificacao, membroId: r.membroId, titulo: r.titulo, dataEmissao: r.dataEmissao, validoAte: r.validoAte });
    }
    return r;
  };

  test("código que não existe", () => {
    expect(certificados.avaliarVerificacaoPublica({ certificado: null, hojeIso: HOJE })).toEqual({ situacao: "NAO_ENCONTRADO" });
  });

  test("certificado válido mostra só o que está impresso nele — nunca matrícula, motivo ou quem emitiu", () => {
    const r = certificados.avaliarVerificacaoPublica({ certificado: registro(), hojeIso: HOJE });
    expect(r).toEqual({
      situacao: "VALIDO", titulo: "Conclusão da trilha X", nome: "Maria da Silva", protocolo: "CERT-2026-000007",
      dataEmissao: "2026-09-01", validoAte: "2028-09-01", revogadoEm: null, selo: "COM_SELO"
    });
    expect(JSON.stringify(r)).not.toMatch(/membroId|motivo|emitidoPor|42/);
  });

  test("vencido depois da validade; no último dia ainda é válido", () => {
    expect(certificados.avaliarVerificacaoPublica({ certificado: registro({ validoAte: "2026-09-30" }), hojeIso: HOJE }).situacao).toBe("VALIDO");
    expect(certificados.avaliarVerificacaoPublica({ certificado: registro({ validoAte: "2026-09-29" }), hojeIso: HOJE }).situacao).toBe("VENCIDO");
  });

  test("certificado sem validade nunca vence", () => {
    const r = certificados.avaliarVerificacaoPublica({ certificado: registro({ validoAte: null }), hojeIso: "2099-01-01" });
    expect(r.situacao).toBe("VALIDO");
    expect(r.validoAte).toBeNull();
  });

  test("revogado: avisa a data, mas não revela o motivo", () => {
    const r = certificados.avaliarVerificacaoPublica({ certificado: registro({ revogadoEm: "2026-09-15T08:00:00.000Z", motivoRevogacao: "Emitido por engano para a pessoa errada" }), hojeIso: HOJE });
    expect(r.situacao).toBe("REVOGADO");
    expect(r.revogadoEm).toBe("2026-09-15");
    expect(JSON.stringify(r)).not.toMatch(/engano/);
  });

  test("selo divergente (dado mexido direto no banco) NÃO mostra os dados do registro", () => {
    // o selo foi calculado com a validade 2028; alguém estendeu a validade direto na tabela
    const adulterado = { ...registro(), validoAte: "2099-12-31" };
    const r = certificados.avaliarVerificacaoPublica({ certificado: adulterado, hojeIso: HOJE });
    expect(r).toEqual({ situacao: "INTEGRIDADE_FALHOU" });
  });

  test("certificado antigo (v6.5, sem selo) ainda verifica, marcado SEM_SELO", () => {
    const r = certificados.avaliarVerificacaoPublica({ certificado: registro({ hashIntegridade: null }), hojeIso: HOJE });
    expect(r.situacao).toBe("VALIDO");
    expect(r.selo).toBe("SEM_SELO");
  });
});

describe("podeRevogarCertificado", () => {
  test("exige certificado existente, ainda não revogado e motivo de ao menos 5 caracteres", () => {
    expect(certificados.podeRevogarCertificado(null, "motivo válido").permitido).toBe(false);
    expect(certificados.podeRevogarCertificado({ revogadoEm: "2026-01-01" }, "motivo válido").mensagem).toMatch(/já foi revogado/);
    expect(certificados.podeRevogarCertificado({ revogadoEm: null }, "abc").mensagem).toMatch(/motivo/);
    expect(certificados.podeRevogarCertificado({ revogadoEm: null }, "  ").permitido).toBe(false);
    expect(certificados.podeRevogarCertificado({ revogadoEm: null }, "emitido por engano").permitido).toBe(true);
  });
});

describe("mapearCertificado — campos de verificação", () => {
  test("formata o código, devolve a validade como dia e mantém a revogação", () => {
    const m = certificados.mapearCertificado({
      CertificadoId: 1, MembroId: 2, Nome: "Fulano", Titulo: "T", Descricao: null, ConquistaId: null, EmitidoPorMembroId: 3, Protocolo: "CERT-1",
      DataEmissao: "2026-09-01T00:00:00.000Z", CodigoVerificacao: "ABCDEFGHJKLMNPQR", ValidoAte: new Date("2028-09-01T00:00:00.000Z"),
      TrilhaMatriculaId: 9, RevogadoEm: null, MotivoRevogacao: null, HashIntegridade: "abc"
    });
    expect(m.codigoVerificacao).toBe("ABCD-EFGH-JKLM-NPQR");
    expect(m.validoAte).toBe("2028-09-01");
    expect(m.trilhaMatriculaId).toBe(9);
    expect(m.hashIntegridade).toBe("abc");
  });
});

describe("QR de verificação", () => {
  const url = "https://app.ieadespa.org.br/verificar.html?c=ABCD-EFGH-JKLM-NPQR";

  test("a matriz é quadrada, determinística e tem o padrão de localização (canto superior esquerdo)", () => {
    const a = qr.gerarMatriz(url);
    const b = qr.gerarMatriz(url);
    expect(a.size).toBeGreaterThanOrEqual(21);
    expect(a.size).toBe(b.size);
    for (let c = 0; c < 7; c++) expect(a.get(0, c)).toBe(true); // 1ª linha do finder pattern toda escura
    let igual = true;
    for (let l = 0; l < a.size; l++) for (let c = 0; c < a.size; c++) if (a.get(l, c) !== b.get(l, c)) igual = false;
    expect(igual).toBe(true);
  });

  test("textos diferentes geram QRs diferentes", () => {
    const a = qr.gerarMatriz(url);
    const b = qr.gerarMatriz(url.replace("NPQR", "NPQS"));
    let diferente = false;
    for (let l = 0; l < Math.min(a.size, b.size) && !diferente; l++) for (let c = 0; c < Math.min(a.size, b.size); c++) if (a.get(l, c) !== b.get(l, c)) { diferente = true; break; }
    expect(diferente).toBe(true);
  });

  test("SVG vetorial, com margem de silêncio e sem imagens embutidas", () => {
    const m = qr.gerarMatriz(url);
    const svg = qr.matrizParaSvg(m);
    const total = m.size + 2 * qr.MARGEM_MODULOS;
    expect(svg).toContain(`viewBox="0 0 ${total} ${total}"`);
    expect(svg).toMatch(/<path d="M\d+ \d+h\d+v1h-\d+z/);
    expect(svg).not.toMatch(/<image|base64/);
  });

  test("as sequências escuras cobrem exatamente os módulos escuros da matriz", () => {
    const m = qr.gerarMatriz(url);
    let escuros = 0;
    for (let l = 0; l < m.size; l++) for (let c = 0; c < m.size; c++) if (m.get(l, c)) escuros++;
    expect(qr.sequenciasEscuras(m).reduce((s, x) => s + x.largura, 0)).toBe(escuros);
  });

  test("desenha num PDF de verdade (pdfkit) sem quebrar", async () => {
    const doc = new PDFDocument({ size: "A4", margin: 56 });
    const partes = [];
    doc.on("data", p => partes.push(p));
    const fim = new Promise(res => doc.on("end", res));
    qr.desenharQrNoPdf(doc, url, { x: 56, y: 600, tamanho: 92 });
    doc.end();
    await fim;
    const buf = Buffer.concat(partes);
    expect(buf.slice(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(500);
  });
});
