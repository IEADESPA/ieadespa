// O segredo que assina o crachá de sessão e tempera o hash do PIN nunca pode ser um valor conhecido (o repositório é público).
const { resolverSegredo, FRASE_PUBLICA_ANTIGA } = require("../segredoSessao");

describe("resolverSegredo", () => {
  test("AUTH_SECRET definida: usa exatamente ela (sem espaços nas pontas)", () => {
    expect(resolverSegredo({ AUTH_SECRET: "um-segredo-bem-guardado" })).toBe("um-segredo-bem-guardado");
    expect(resolverSegredo({ AUTH_SECRET: "  com-espaco  " })).toBe("com-espaco");
    expect(resolverSegredo({ AUTH_SECRET: "x", FUNCTIONS_WORKER_RUNTIME: "node" })).toBe("x");
  });

  test.each([["ausente", {}], ["vazia", { AUTH_SECRET: "" }], ["só espaços", { AUTH_SECRET: "   " }], ["a frase pública antiga", { AUTH_SECRET: FRASE_PUBLICA_ANTIGA }],
    ["a frase pública antiga com espaços", { AUTH_SECRET: ` ${FRASE_PUBLICA_ANTIGA} ` }], ["tipo errado", { AUTH_SECRET: 12345 }]])(
    "como Azure Function (FUNCTIONS_WORKER_RUNTIME), AUTH_SECRET %s: recusa subir, com a causa na mensagem", (_nome, env) => {
      expect(() => resolverSegredo({ ...env, FUNCTIONS_WORKER_RUNTIME: "node" })).toThrow(/AUTH_SECRET ausente/);
    });

  test("fora do Azure (testes, scripts) e sem AUTH_SECRET: segredo ALEATÓRIO, nunca o valor público, diferente a cada chamada", () => {
    const a = resolverSegredo({}), b = resolverSegredo({});
    for (const s of [a, b]) {
      expect(s).toMatch(/^[0-9a-f]{64}$/);
      expect(s).not.toBe(FRASE_PUBLICA_ANTIGA);
    }
    expect(a).not.toBe(b);
  });

  test("a frase antiga fora do Azure também não vale: vira segredo aleatório", () => {
    const s = resolverSegredo({ AUTH_SECRET: FRASE_PUBLICA_ANTIGA });
    expect(s).not.toBe(FRASE_PUBLICA_ANTIGA);
    expect(s).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("quem usa o segredo", () => {
  const fs = require("fs");
  const path = require("path");
  test("nenhum módulo da API volta a ter a frase pública como padrão (só o resolvedor a conhece, para recusá-la)", () => {
    const raiz = path.join(__dirname, "..", "..");
    const achados = [];
    const varrer = (dir) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        if (f.name === "node_modules" || f.name === "__tests__") continue;
        const p = path.join(dir, f.name);
        if (f.isDirectory()) varrer(p);
        else if (f.name.endsWith(".js") && fs.readFileSync(p, "utf8").includes(FRASE_PUBLICA_ANTIGA)) achados.push(path.relative(raiz, p).replace(/\\/g, "/"));
      }
    };
    varrer(raiz);
    expect(achados).toEqual(["shared/segredoSessao.js"]);
  });

  test("auth.js e pinMembro.js usam o resolvedor (e não process.env.AUTH_SECRET direto)", () => {
    for (const arq of ["auth.js", "pinMembro.js"]) {
      const src = fs.readFileSync(path.join(__dirname, "..", arq), "utf8");
      expect(src).toMatch(/require\("\.\/segredoSessao"\)\.resolverSegredo\(\)/);
      expect(src).not.toMatch(/process\.env\.AUTH_SECRET\s*\|\|/);
    }
  });

  test("um crachá assinado com a frase pública antiga NÃO é aceito pelo auth.js (mesmo sem AUTH_SECRET no ambiente)", () => {
    const crypto = require("crypto");
    const assinar = (payload, segredo) => {
      const corpo = Buffer.from(JSON.stringify(payload)).toString("base64url");
      return `${corpo}.${crypto.createHmac("sha256", segredo).update(corpo).digest("base64url")}`;
    };
    const salvo = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    try {
      jest.isolateModules(() => {
        const auth = require("../auth");
        const forjado = assinar({ membroId: 1, permissoes: ["permissoes"], nivel: "GLOBAL", exp: Date.now() + 3600000 }, FRASE_PUBLICA_ANTIGA);
        expect(auth.getSessao(forjado)).toBeNull();
      });
    } finally {
      if (salvo !== undefined) process.env.AUTH_SECRET = salvo;
    }
  });
});
