// Origem da conexão (v7.5, revisão de segurança). Os formatos de x-forwarded-for abaixo foram MEDIDOS em produção em 02/10/2026, com um endpoint de
// diagnóstico temporário: o Azure Static Web Apps acrescenta, à direita, o IP do cliente e depois o IP do proxy; x-azure-clientip e x-client-ip chegam
// como o cliente escreveu (não são filtrados). O que o cliente escreve em x-forwarded-for fica à ESQUERDA.
const o = require("../origemConexao");
const { chaveDeOrigem } = require("../limiteTaxa");

const CLIENTE = "177.87.165.132";
const PROXY = "40.70.146.136:36945";
const normal = { "x-forwarded-for": `${CLIENTE}:24465, ${PROXY}`, "client-ip": PROXY };
const forjando = { "x-forwarded-for": `1.2.3.4, ${CLIENTE}:24294, ${PROXY}`, "x-azure-clientip": "9.9.9.9", "x-client-ip": "5.6.7.8", "client-ip": "10.0.32.4:56687" };

describe("o IP do cliente é o PENÚLTIMO do x-forwarded-for (o último é o proxy do Azure)", () => {
  test("chamada normal, como o Azure entrega", () => {
    expect(o.ipDoCliente(normal)).toBe(CLIENTE);
  });
  test("cliente forjando x-forwarded-for, x-azure-clientip e x-client-ip: o IP escolhido continua sendo o real", () => {
    expect(o.ipDoCliente(forjando)).toBe(CLIENTE);
  });
  test("forjar MUITAS entradas à esquerda não muda nada", () => {
    const lixo = Array.from({ length: 50 }, (_, i) => `8.8.${i}.1`).join(", ");
    expect(o.ipDoCliente({ "x-forwarded-for": `${lixo}, ${CLIENTE}:1, ${PROXY}` })).toBe(CLIENTE);
  });
  test("x-azure-clientip e x-client-ip sozinhos NÃO valem (o cliente os escreve)", () => {
    expect(o.ipDoCliente({ "x-azure-clientip": "189.10.20.30" })).toBeNull();
    expect(o.ipDoCliente({ "x-client-ip": "189.10.20.30" })).toBeNull();
    expect(o.ipDoCliente({ "client-ip": "189.10.20.30:1" })).toBeNull();
  });
  test("uma só entrada = pedido direto à Function: vale a entrada", () => {
    expect(o.ipDoCliente({ "x-forwarded-for": "177.8.9.10" })).toBe("177.8.9.10");
    expect(o.ipDoCliente({ "x-forwarded-for": "177.8.9.10:51234" })).toBe("177.8.9.10");
  });
  test("IPv6: colchetes e porta saem, o endereço fica inteiro", () => {
    expect(o.ipDoCliente({ "x-forwarded-for": `[2804:14d:5c80::1]:443, ${PROXY}` })).toBe("2804:14d:5c80::1");
    expect(o.ipDoCliente({ "x-forwarded-for": "2804:14d:5c80::7334" })).toBe("2804:14d:5c80::7334");
  });
  test("o nome do cabeçalho vale em qualquer caixa; lista em array também", () => {
    expect(o.ipDoCliente({ "X-Forwarded-For": `${CLIENTE}:1, ${PROXY}` })).toBe(CLIENTE);
    expect(o.ipDoCliente({ "x-forwarded-for": [`${CLIENTE}:1`, PROXY] })).toBe(CLIENTE);
  });
  test("sem cabeçalho, vazio ou indefinido: null", () => {
    for (const h of [{}, undefined, null, { "x-forwarded-for": "" }, { "x-forwarded-for": " , " }]) expect(o.ipDoCliente(h)).toBeNull();
  });
});

describe("o alvo precisa ser um endereço PÚBLICO e bem formado", () => {
  test("privado, loopback, link-local, CGNAT, reservado e de documentação não provam de onde veio a conexão", () => {
    for (const ip of ["10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.5", "127.0.0.1", "0.0.0.0", "169.254.1.1", "100.64.0.1", "224.0.0.1", "255.255.255.255", "203.0.113.9", "198.51.100.7", "192.0.2.1",
      "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "2001:db8::7334", "::ffff:10.0.0.1"]) {
      expect(o.ipDoCliente({ "x-forwarded-for": `${ip}:9, ${PROXY}` })).toBeNull();
    }
    expect(o.ipPublico("172.32.0.1")).toBe(true);
    expect(o.ipPublico("8.8.8.8")).toBe(true);
    expect(o.ipDoCliente({ "x-forwarded-for": `::ffff:177.8.9.10, ${PROXY}` })).toBe("::ffff:177.8.9.10");
  });
  test("NÃO procura outro endereço na lista: se o penúltimo é privado, recusa (varrer a lista pegaria um valor forjado)", () => {
    expect(o.ipDoCliente({ "x-forwarded-for": `1.2.3.4, 10.0.0.5, ${PROXY}` })).toBeNull();
  });
  test("lixo, octeto impossível e texto longo viram null — nunca um IP inventado", () => {
    for (const lixo of ["desconhecida", "999.1.1.1", "'; DROP TABLE x;--", ":::::", "a:b:c", "1:2:3", "g::1", "12345::1", "a".repeat(80), "1.2.3", "1.2.3.4.5"]) {
      expect(o.ipDoCliente({ "x-forwarded-for": `${lixo}, ${PROXY}` })).toBeNull();
      expect(o.ipDoCliente({ "x-forwarded-for": lixo })).toBeNull();
    }
  });
  test("sem exigir público (usado pelo limitador), o endereço privado passa", () => {
    expect(o.ipDoCliente({ "x-forwarded-for": `10.0.0.5, ${PROXY}` }, { apenasPublico: false })).toBe("10.0.0.5");
    expect(o.ipDoCliente({ "x-forwarded-for": "lixo, " + PROXY }, { apenasPublico: false })).toBeNull();
  });
});

describe("a cadeia guardada com o aceite", () => {
  test("guarda os cabeçalhos como chegaram — inclusive o que foi forjado, para quem examinar depois", () => {
    expect(JSON.parse(o.cadeiaDeCabecalhos(forjando))).toEqual({
      "x-forwarded-for": `1.2.3.4, ${CLIENTE}:24294, ${PROXY}`, "client-ip": "10.0.32.4:56687", "x-azure-clientip": "9.9.9.9", "x-client-ip": "5.6.7.8"
    });
    expect(o.cadeiaDeCabecalhos({})).toBeNull();
    expect(o.cadeiaDeCabecalhos(undefined)).toBeNull();
  });
  test("sai limpa (só dígitos, letras a-f, dois-pontos, ponto, vírgula, colchetes e espaço) e cortada", () => {
    const suja = o.cadeiaDeCabecalhos({ "x-forwarded-for": "1.2.3.4'; DROP TABLE X;-- <script>alert(1)</script>" });
    expect(suja).not.toMatch(/[<>';]/);
    expect(o.cadeiaDeCabecalhos({ "x-forwarded-for": "1".repeat(500), "client-ip": "2".repeat(500), "x-azure-clientip": "3".repeat(500), "x-client-ip": "4".repeat(500) }).length).toBeLessThanOrEqual(400);
  });
});

describe("limitador de requisições anônimas: forjar cabeçalho não escapa do limite", () => {
  test("o mesmo cliente tem a mesma chave com ou sem cabeçalhos forjados, e clientes diferentes têm chaves diferentes", () => {
    expect(chaveDeOrigem({ headers: normal })).toBe(chaveDeOrigem({ headers: forjando }));
    const outro = { "x-forwarded-for": `189.10.20.30:1, ${PROXY}` };
    expect(chaveDeOrigem({ headers: outro })).not.toBe(chaveDeOrigem({ headers: normal }));
  });
  test("girar o valor forjado a cada requisição não gera chave nova", () => {
    const chaves = new Set();
    for (let i = 0; i < 100; i++) chaves.add(chaveDeOrigem({ headers: { "x-forwarded-for": `9.9.${i}.1, ${CLIENTE}:${1000 + i}, ${PROXY}`, "x-azure-clientip": `5.5.5.${i}` } }));
    expect(chaves.size).toBe(1);
  });
  test("a chave é hash (nunca o IP em claro); sem origem identificável, todos caem numa chave só", () => {
    const k = chaveDeOrigem({ headers: normal });
    expect(k).toMatch(/^[0-9a-f]{16}$/);
    expect(k).not.toContain("177");
    expect(chaveDeOrigem({ headers: {} })).toBe(chaveDeOrigem({}));
    expect(chaveDeOrigem({ headers: { "x-forwarded-for": "lixo" } })).toBe(chaveDeOrigem({}));
  });
});
