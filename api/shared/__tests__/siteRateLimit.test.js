// Limite de tentativas do SITE (outro aplicativo, site/api): o IP de quem chama é o penúltimo do x-forwarded-for, porque o Azure acrescenta à direita e a esquerda pode ser inventada.
// Medido em produção em 03/10/2026: com um primeiro valor inventado diferente a cada chamada, 25 chamadas seguidas passaram pelo limite de 20 em 5 minutos.
const { permitir, ipDoPedido } = require("../../../site/api/src/lib/rateLimit");

const req = (xff) => ({ headers: xff === undefined ? {} : { "x-forwarded-for": xff } });

describe("ipDoPedido: o penúltimo da lista é o cliente", () => {
  test("chamada normal do Azure: <cliente>:<porta>, <proxy>:<porta> -> o cliente", () => {
    expect(ipDoPedido(req("177.55.1.2:51234, 40.70.146.136:2"))).toBe("177.55.1.2:51234");
  });
  test("quem inventa a primeira entrada não escolhe o próprio balde: vale o IP real que o Azure acrescentou", () => {
    expect(ipDoPedido(req("10.9.9.9, 177.55.1.2:51234, 40.70.146.136:2"))).toBe("177.55.1.2:51234");
    expect(ipDoPedido(req("a, b, c, d, 177.55.1.2:51234, 40.70.146.136:2"))).toBe("177.55.1.2:51234");
  });
  test("uma só entrada: é o próprio par da conexão", () => {
    expect(ipDoPedido(req("177.55.1.2"))).toBe("177.55.1.2");
  });
  test("sem o cabeçalho: um balde só, 'desconhecido' (nunca o x-azure-clientip, que o cliente escreve)", () => {
    expect(ipDoPedido(req())).toBe("desconhecido");
    expect(ipDoPedido({ headers: { "x-azure-clientip": "1.1.1.1" } })).toBe("desconhecido");
    expect(ipDoPedido(req(""))).toBe("desconhecido");
    expect(ipDoPedido({})).toBe("desconhecido");
  });
  test("o nome do cabeçalho vale em qualquer capitalização e como lista", () => {
    expect(ipDoPedido({ headers: { "X-Forwarded-For": "1.2.3.4:1, 9.9.9.9:2" } })).toBe("1.2.3.4:1");
    expect(ipDoPedido({ headers: { "x-forwarded-for": ["1.2.3.4:1", "9.9.9.9:2"] } })).toBe("1.2.3.4:1");
  });
  test("valor absurdo é cortado (a chave do balde não cresce sem limite)", () => {
    expect(ipDoPedido(req("x".repeat(500) + ", 9.9.9.9:2")).length).toBeLessThanOrEqual(64);
  });
});

describe("o limite não se desvia com IP inventado", () => {
  test("20 chamadas passam e a 21ª é barrada, mesmo variando o primeiro valor do x-forwarded-for", () => {
    let barradas = 0, passaram = 0;
    for (let i = 0; i < 25; i++) {
      const ip = ipDoPedido(req(`10.${i}.${i}.${i}, 177.77.8.8:1, 40.70.146.136:2`));
      if (permitir(`desvio:${ip}`)) passaram++; else barradas++;
    }
    expect(passaram).toBe(20);
    expect(barradas).toBe(5);
  });
});
