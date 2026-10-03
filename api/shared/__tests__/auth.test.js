// Testes da trilha de sessão (vB.9) — criarSessao/encerrarSessao viraram
// assíncronos e passaram a tocar o banco (SessoesAtivas); getSessao/
// exigirLogin continuam 100% síncronos de propósito (ver comentário em
// shared/auth.js) — não testados aqui de novo, só o que mudou.
const { criarPoolFalso, sqlFalso } = require("./testUtils");
const auth = require("../auth");

describe("criarSessao (vB.9 — grava SessoesAtivas e embute o sid no token)", () => {
  test("insere 1 linha em SessoesAtivas e o token resultante carrega o sid", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ SessaoId: "11111111-1111-1111-1111-111111111111" }]]);
    const token = await auth.criarSessao(pool, sqlFalso, { membroId: 1, nome: "Fulano", permissoes: [] }, "Mozilla/5.0 teste");
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].inputs.membroId).toBe(1);
    expect(chamadas[0].inputs.dispositivoInfo).toBe("Mozilla/5.0 teste");
    const sessao = auth.getSessao(token);
    expect(sessao.sid).toBe("11111111-1111-1111-1111-111111111111");
    expect(sessao.membroId).toBe(1);
  });
});

describe("reassinarSessao (nunca abre sessão rastreada nova)", () => {
  test("preserva o sid existente sem tocar o banco", () => {
    const token = auth.reassinarSessao({ membroId: 1, sid: "abc-123", permissoes: ["financeiro"] });
    const sessao = auth.getSessao(token);
    expect(sessao.sid).toBe("abc-123");
    expect(sessao.permissoes).toEqual(["financeiro"]);
  });
});

describe("encerrarSessao", () => {
  test("marca a SessoesAtivas certa (pelo sid do token) como encerrada", async () => {
    const token = auth.reassinarSessao({ membroId: 1, sid: "abc-123" });
    const { pool, chamadas } = criarPoolFalso([[]]);
    await auth.encerrarSessao(pool, sqlFalso, token);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].inputs.id).toBe("abc-123");
    expect(chamadas[0].sql).toMatch(/SET Encerrada = 1/);
  });

  test("token inválido ou sem sid (sessão de antes da vB.9) não toca o banco", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    await auth.encerrarSessao(pool, sqlFalso, "token-invalido");
    expect(chamadas).toHaveLength(0);
  });
});

describe("encerrarSessaoEspecifica (checa posse antes de encerrar)", () => {
  test("recusa encerrar sessão de outro membro", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ MembroId: 999 }]]);
    const ok = await auth.encerrarSessaoEspecifica(pool, sqlFalso, 1, "sid-de-outro");
    expect(ok).toBe(false);
    expect(chamadas).toHaveLength(1); // só a checagem de posse, nunca chega no UPDATE
  });

  test("encerra quando o dono confere", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ MembroId: 1 }], []]);
    const ok = await auth.encerrarSessaoEspecifica(pool, sqlFalso, 1, "sid-proprio");
    expect(ok).toBe(true);
    expect(chamadas).toHaveLength(2);
  });
});
