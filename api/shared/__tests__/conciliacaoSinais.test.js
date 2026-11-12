// FASE 10 (12/11/2026): a conciliação casa pelo valor COM SINAL (defeito achado pela massa da homologação: nenhuma saída paga batia com o extrato) e reconhece
// o débito que o próprio banco desfaz (estorno). Correção aprovada pelo responsável: "se é um débito, vem negativo... e pode ter entrada negativa (saldo anterior)".
const { casarLancamentos, DIAS_ESTORNO } = require("../conciliação");

const linha = (chave, valor, data = "2026-10-10", historico = "") => ({ chave, valor, data, historico });
const entrada = (id, valor, data = "2026-10-10") => ({ id, tipo: "ENTRADA", valor, data, referencia: `Entrada ${id}` });
const saida = (id, valor, data = "2026-10-10") => ({ id, tipo: "SAIDA", valor: -valor, data, referencia: `Saida ${id}` });   // como buscarLadoSistema monta

describe("casarLancamentos — o sinal", () => {
  test("o pagamento (débito negativo no banco) bate com a saída paga (antes nunca batia: virava duas divergências)", () => {
    const r = casarLancamentos([linha(1, -350)], [saida(9, 350)]);
    expect(r.batidas).toEqual([{ chave: 1, sistemaId: 9, tipo: "SAIDA", valor: -350 }]);
    expect(r.soExterno).toEqual([]);
    expect(r.soSistema).toEqual([]);
  });
  test("a entrada (crédito positivo) bate com a entrada do sistema", () => {
    expect(casarLancamentos([linha(1, 120)], [entrada(5, 120)]).batidas).toHaveLength(1);
  });
  test("uma entrada NÃO bate com um débito do mesmo valor (antes podia, pela comparação sem sinal)", () => {
    const r = casarLancamentos([linha(1, -120)], [entrada(5, 120)]);
    expect(r.batidas).toHaveLength(0);
    expect(r.soExterno).toHaveLength(1);
    expect(r.soSistema).toHaveLength(1);
  });
  test("a entrada negativa do sistema (ex.: saldo anterior negativo) bate com o débito do mesmo valor", () => {
    expect(casarLancamentos([linha(1, -800)], [entrada(7, -800)]).batidas).toEqual([{ chave: 1, sistemaId: 7, tipo: "ENTRADA", valor: -800 }]);
  });
  test("entre candidatos do mesmo valor e sinal, escolhe o mais perto na data", () => {
    const r = casarLancamentos([linha(1, -50, "2026-10-20")], [saida(1, 50, "2026-10-02"), saida(2, 50, "2026-10-19")]);
    expect(r.batidas[0].sistemaId).toBe(2);
  });
  test("o mês inteiro: entradas e saídas misturadas batem todas", () => {
    const banco = [linha(1, 100), linha(2, -40), linha(3, 250), linha(4, -1200.5)];
    const sistema = [entrada(1, 100), saida(2, 40), entrada(3, 250), saida(4, 1200.5)];
    const r = casarLancamentos(banco, sistema);
    expect(r.batidas).toHaveLength(4);
    expect(r.soExterno).toEqual([]);
    expect(r.soSistema).toEqual([]);
  });
});

describe("casarLancamentos — o débito desfeito pelo banco (estorno)", () => {
  test("um débito e um crédito do mesmo valor, sem nada no sistema, saem juntos como estorno (não são divergência)", () => {
    const r = casarLancamentos([linha(1, -75, "2026-10-05"), linha(2, 75, "2026-10-07")], [], { parearEstornos: true });
    expect(r.estornos).toHaveLength(1);
    expect(r.estornos[0]).toMatchObject({ valor: 75, debito: { chave: 1 }, credito: { chave: 2 } });
    expect(r.soExterno).toEqual([]);
  });
  test(`passado o prazo (${DIAS_ESTORNO} dias), não é estorno: continuam como divergência`, () => {
    const r = casarLancamentos([linha(1, -75, "2026-10-01"), linha(2, 75, "2026-10-30")], [], { parearEstornos: true });
    expect(r.estornos).toHaveLength(0);
    expect(r.soExterno).toHaveLength(2);
  });
  test("o crédito que tem entrada no sistema bate com ela; só o que sobra entra no par de estorno", () => {
    const r = casarLancamentos([linha(1, -75, "2026-10-05"), linha(2, 75, "2026-10-06")], [entrada(3, 75, "2026-10-06")], { parearEstornos: true });
    expect(r.batidas).toHaveLength(1);
    expect(r.estornos).toHaveLength(0);
    expect(r.soExterno.map((x) => x.chave)).toEqual([1]);
  });
  test("sem a opção (o cofre do Fundo Fixo: despesa e reposição do mesmo valor são movimentos de verdade), não há estorno", () => {
    const r = casarLancamentos([linha(1, -75), linha(2, 75)], []);
    expect(r.estornos).toEqual([]);
    expect(r.soExterno).toHaveLength(2);
  });
  test("cada débito faz par com um só crédito, o mais perto na data", () => {
    const r = casarLancamentos([linha(1, -60, "2026-10-10"), linha(2, 60, "2026-10-20"), linha(3, 60, "2026-10-11")], [], { parearEstornos: true });
    expect(r.estornos).toHaveLength(1);
    expect(r.estornos[0].credito.chave).toBe(3);
    expect(r.soExterno.map((x) => x.chave)).toEqual([2]);
  });
});
