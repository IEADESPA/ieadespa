// Testes do v6.5 (Certificados + página imprimível) — foco na lógica pura:
// validação da emissão (membroId + título são as únicas exigências reais)
// e a regra de acesso (autoatendimento só pra própria matrícula, terceiros
// exigem a permissão de gestão da EBD).
const certificados = require("../certificados");

describe("validarEmissaoCertificado", () => {
  test("recusa sem membroId", () => {
    const r = certificados.validarEmissaoCertificado({ membroId: null, titulo: "Conclusão do Curso" });
    expect(r.valido).toBe(false);
    expect(r.mensagem).toMatch(/matrícula/);
  });

  test("recusa membroId inválido (zero, negativo ou não-inteiro)", () => {
    expect(certificados.validarEmissaoCertificado({ membroId: 0, titulo: "X" }).valido).toBe(false);
    expect(certificados.validarEmissaoCertificado({ membroId: -5, titulo: "X" }).valido).toBe(false);
    expect(certificados.validarEmissaoCertificado({ membroId: "abc", titulo: "X" }).valido).toBe(false);
  });

  test("recusa sem título", () => {
    const r = certificados.validarEmissaoCertificado({ membroId: 10, titulo: "" });
    expect(r.valido).toBe(false);
    expect(r.mensagem).toMatch(/título/);
  });

  test("recusa título vazio só com espaços", () => {
    expect(certificados.validarEmissaoCertificado({ membroId: 10, titulo: "   " }).valido).toBe(false);
  });

  test("recusa título maior que 150 caracteres", () => {
    const tituloGrande = "A".repeat(151);
    const r = certificados.validarEmissaoCertificado({ membroId: 10, titulo: tituloGrande });
    expect(r.valido).toBe(false);
    expect(r.mensagem).toMatch(/150 caracteres/);
  });

  test("aceita membroId e título válidos, sem exigir descrição ou conquista", () => {
    expect(certificados.validarEmissaoCertificado({ membroId: 10, titulo: "Conclusão do Curso de Obreiros" }).valido).toBe(true);
  });
});

describe("podeAcessarCertificado (autoatendimento — mesmo modelo de CartaPdf)", () => {
  const certificado = { membroId: 42 };

  test("nega quando o certificado não existe", () => {
    expect(certificados.podeAcessarCertificado(null, { membroIdSolicitante: 42, temGestao: false })).toBe(false);
  });

  test("permite quando a própria matrícula solicita o próprio certificado", () => {
    expect(certificados.podeAcessarCertificado(certificado, { membroIdSolicitante: 42, temGestao: false })).toBe(true);
  });

  test("recusa quando outra matrícula solicita sem a permissão de gestão", () => {
    expect(certificados.podeAcessarCertificado(certificado, { membroIdSolicitante: 99, temGestao: false })).toBe(false);
  });

  test("permite ver o certificado de qualquer um com a permissão de gestão (ebd_gestao)", () => {
    expect(certificados.podeAcessarCertificado(certificado, { membroIdSolicitante: 99, temGestao: true })).toBe(true);
  });
});

describe("mapearCertificado (linha do banco -> objeto da API, inclui o vínculo opcional com conquista)", () => {
  test("mapeia todos os campos, com conquistaNome null quando não há vínculo", () => {
    const linha = {
      CertificadoId: 1, MembroId: 42, Nome: "Fulano de Tal", Titulo: "Conclusão do Curso",
      Descricao: "Concluiu o curso com aproveitamento.", ConquistaId: null, ConquistaNome: null,
      EmitidoPorMembroId: 7, Protocolo: "CERT-2026-0001", DataEmissao: "2026-09-19T00:00:00.000Z"
    };
    const mapeado = certificados.mapearCertificado(linha);
    expect(mapeado).toEqual({
      certificadoId: 1, membroId: 42, nome: "Fulano de Tal", titulo: "Conclusão do Curso",
      descricao: "Concluiu o curso com aproveitamento.", conquistaId: null, conquistaNome: null,
      emitidoPorMembroId: 7, protocolo: "CERT-2026-0001", dataEmissao: "2026-09-19T00:00:00.000Z"
    });
  });

  test("mapeia o nome da conquista quando o certificado tem o vínculo opcional (v6.4)", () => {
    const linha = {
      CertificadoId: 2, MembroId: 42, Nome: "Fulano de Tal", Titulo: "Trimestre Perfeito",
      Descricao: null, ConquistaId: 3, ConquistaNome: "Trimestre Perfeito",
      EmitidoPorMembroId: 7, Protocolo: "CERT-2026-0002", DataEmissao: "2026-09-19T00:00:00.000Z"
    };
    expect(certificados.mapearCertificado(linha).conquistaNome).toBe("Trimestre Perfeito");
  });
});
