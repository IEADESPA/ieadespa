// Testes da trilha de integridade de assinatura interna (vB.6) — as 5
// combinações que avaliarIntegridadeTermo precisa distinguir corretamente.
const crypto = require("crypto");
const { avaliarIntegridadeTermo } = require("../assinaturaInterna");

function sha256(texto) { return crypto.createHash("sha256").update(texto, "utf8").digest("hex"); }

describe("avaliarIntegridadeTermo", () => {
  test("tipo removido do catálogo", () => {
    const r = avaliarIntegridadeTermo({ catalogoTermo: null, hashConteudo: "x", versaoTermo: "2026-1" });
    expect(r.status).toBe("TIPO_REMOVIDO_DO_CATALOGO");
  });

  test("assinatura antiga sem hash capturado (anterior à vB.6)", () => {
    const r = avaliarIntegridadeTermo({ catalogoTermo: { versao: "2026-1", texto: "t" }, hashConteudo: null, versaoTermo: "2026-1" });
    expect(r.status).toBe("SEM_HASH_ANTIGO");
  });

  test("catálogo já tem versão mais nova que a assinada", () => {
    const r = avaliarIntegridadeTermo({ catalogoTermo: { versao: "2026-2", texto: "t" }, hashConteudo: sha256("t"), versaoTermo: "2026-1" });
    expect(r.status).toBe("VERSAO_DESATUALIZADA");
  });

  test("mesma versão, mas o texto mudou sem bump de versão (inconsistência real)", () => {
    const r = avaliarIntegridadeTermo({ catalogoTermo: { versao: "2026-1", texto: "texto novo" }, hashConteudo: sha256("texto antigo"), versaoTermo: "2026-1" });
    expect(r.status).toBe("CONTEUDO_DIVERGENTE");
  });

  test("integro: mesma versão, hash bate com o texto atual do catálogo", () => {
    const r = avaliarIntegridadeTermo({ catalogoTermo: { versao: "2026-1", texto: "texto original" }, hashConteudo: sha256("texto original"), versaoTermo: "2026-1" });
    expect(r.status).toBe("OK");
  });
});
