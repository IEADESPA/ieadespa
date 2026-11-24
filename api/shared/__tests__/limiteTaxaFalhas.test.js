// O freio de falhas por conexão (shared/limiteTaxa.js): conta as tentativas SEM acerto que saem de uma mesma conexão, em qualquer matrícula, e para a
// conexão (não a conta de ninguém) com um bloqueio que cresce, no mesmo desenho do bloqueio por pessoa de shared/pinMembro.js (15 min, 1 h, 4 h, 24 h;
// um dia sem falha esquece). Quem acerta devolve a própria tentativa. E a chave da conexão: o IPv6 conta pela rede /64.
const { criarFreioDeFalhas, chaveDeRede, chaveDeOrigem } = require("../limiteTaxa");

const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 10, 24, 15, 0, 0);

describe("criarFreioDeFalhas", () => {
  const LIMITE = 30;
  const falhar = (freio, chave, vezes, agora) => { let r; for (let i = 0; i < vezes; i++) r = freio.reservar(chave, agora); return r; };

  test("até o limite, passa; a tentativa que completa o limite ainda é conferida e abre um bloqueio de 15 minutos; a seguinte já é recusada", () => {
    const freio = criarFreioDeFalhas({ limite: LIMITE });
    const antes = falhar(freio, "a", LIMITE - 1, T0);
    expect(antes).toMatchObject({ bloqueado: false, falhas: LIMITE - 1, bloqueadaAgora: false });
    const limite = freio.reservar("a", T0);
    expect(limite).toMatchObject({ bloqueado: false, falhas: LIMITE, bloqueadaAgora: true, minutos: 15 });
    const depois = freio.reservar("a", T0 + 1000);
    expect(depois.bloqueado).toBe(true);
    expect(depois.retryAposSegundos).toBe(15 * 60 - 1);
  });

  test("o bloqueio cresce enquanto a conexão não para de errar: 15 min, 1 h, 4 h e 24 h", () => {
    const freio = criarFreioDeFalhas({ limite: LIMITE });
    let agora = T0;
    for (const minutos of [15, 60, 240, 1440, 1440]) {
      const r = falhar(freio, "a", LIMITE, agora);
      expect(r).toMatchObject({ bloqueadaAgora: true, minutos });
      expect(freio.reservar("a", agora + minutos * MIN - 1000).bloqueado).toBe(true);           // recusada durante o bloqueio, sem contar
      agora += minutos * MIN;
    }
  });

  test("um dia inteiro sem falha esquece o histórico; dentro do dia, não", () => {
    const freio = criarFreioDeFalhas({ limite: LIMITE });
    falhar(freio, "a", LIMITE - 1, T0);
    expect(freio.reservar("a", T0 + 23 * 60 * MIN).falhas).toBe(LIMITE);            // 23 h depois: ainda conta (e completa o limite)
    const g = criarFreioDeFalhas({ limite: LIMITE });
    falhar(g, "b", LIMITE - 1, T0);
    expect(g.reservar("b", T0 + 24 * 60 * MIN).falhas).toBe(1);                     // 24 h depois da última falha: recomeça
  });

  test("quem acerta devolve a própria tentativa (não zera as falhas de antes); a que completou o limite e acertou desfaz o bloqueio que ela abriu", () => {
    const freio = criarFreioDeFalhas({ limite: LIMITE });
    falhar(freio, "a", 10, T0);
    const certa = freio.reservar("a", T0);
    freio.devolver("a", certa);
    expect(freio.reservar("a", T0).falhas).toBe(11);                                // as 10 de antes continuam; a certa saiu da conta
    falhar(freio, "a", LIMITE - 12, T0);
    const completou = freio.reservar("a", T0);
    expect(completou).toMatchObject({ falhas: LIMITE, bloqueadaAgora: true });
    freio.devolver("a", completou);
    expect(freio.reservar("a", T0 + 1000)).toMatchObject({ bloqueado: false, falhas: LIMITE, bloqueadaAgora: true });
  });

  test("cada conexão tem a sua conta", () => {
    const freio = criarFreioDeFalhas({ limite: LIMITE });
    falhar(freio, "a", LIMITE, T0);
    expect(freio.reservar("a", T0).bloqueado).toBe(true);
    expect(freio.reservar("b", T0)).toMatchObject({ bloqueado: false, falhas: 1 });
  });

  test("a memória tem teto: com muitas conexões, as antigas sem bloqueio saem primeiro e as bloqueadas ficam", () => {
    const freio = criarFreioDeFalhas({ limite: 3, maxChaves: 50 });
    falhar(freio, "bloqueada", 3, T0);
    for (let i = 0; i < 200; i++) freio.reservar(`c${i}`, T0 + i);
    expect(freio._tamanho()).toBeLessThanOrEqual(51);
    expect(freio.reservar("bloqueada", T0 + 1000).bloqueado).toBe(true);
  });

  test("devolver sem reserva válida não faz nada", () => {
    const freio = criarFreioDeFalhas({ limite: LIMITE });
    expect(() => freio.devolver("nada", null)).not.toThrow();
    expect(() => freio.devolver("nada", { bloqueado: true })).not.toThrow();
    expect(freio._tamanho()).toBe(0);
  });
});

describe("chaveDeRede — de onde vem a tentativa", () => {
  const req = (cliente) => ({ headers: { "x-forwarded-for": `${cliente}, 40.70.146.136:6000` } });
  test("IPv4: o endereço inteiro (a mesma chave do limitador por origem)", () => {
    expect(chaveDeRede(req("177.20.1.1:5000"))).toBe(chaveDeOrigem(req("177.20.1.1:5000")));
    expect(chaveDeRede(req("177.20.1.1:5000"))).not.toBe(chaveDeRede(req("177.20.1.2:5000")));
  });
  test("IPv6: os endereços da mesma rede /64 dividem a chave, com ou sem abreviação; outra rede /64 é outra chave", () => {
    const a = chaveDeRede(req("[2804:14c:5b81:9a10:1111:2222:3333:4444]:443"));
    expect(chaveDeRede(req("[2804:14c:5b81:9a10::1]:443"))).toBe(a);
    expect(chaveDeRede(req("2804:014c:5b81:9a10:ffff:ffff:ffff:ffff"))).toBe(a);
    expect(chaveDeRede(req("[2804:14c:5b81:9a11::1]:443"))).not.toBe(a);
    expect(chaveDeRede(req("[2804:14c::1]:443"))).toBe(chaveDeRede(req("[2804:14c:0:0:ffff::9]:443")));
  });
  test("IPv4 dentro de IPv6 (::ffff:a.b.c.d) é o próprio IPv4", () => {
    expect(chaveDeRede(req("[::ffff:177.20.1.1]:443"))).toBe(chaveDeRede(req("177.20.1.1:5000")));
  });
  test("sem endereço legível: uma chave só (o freio fica mais apertado, nunca mais frouxo)", () => {
    expect(chaveDeRede({ headers: {} })).toBe(chaveDeRede({ headers: { "x-forwarded-for": "lixo, 40.70.146.136:6000" } }));
  });
  test("a chave não carrega o IP em claro", () => {
    expect(chaveDeRede(req("177.20.1.1:5000"))).toMatch(/^[0-9a-f]{16}$/);
  });
});
