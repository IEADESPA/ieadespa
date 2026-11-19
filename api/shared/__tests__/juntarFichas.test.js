// FASE 10, v10.1b passo 6 (18/11/2026) — as regras puras de JUNTAR FICHAS REPETIDAS (shared/juntarFichas.js) e o texto do alerta da assembleia. O comportamento
// contra o SQL Server de verdade (a transação, as ~420 colunas, os conflitos, desfazer, as corridas) está em tools/e2e-localdb/e2e-93-juntar-fichas.js.
const R = require("../juntarFichas");
const { textoDoAlerta } = require("../juntarFichasDb");

describe("quem fica: a ficha mais antiga", () => {
  test("sem número reaproveitado: o número menor (\"juntando a 15 e a 500, fica a 15\")", () => {
    const a = { membroId: 500, criadoEm: "2010-01-01" }, b = { membroId: 15, criadoEm: "2026-01-01" };
    expect(R.quemFica(a, b).fica.membroId).toBe(15);
    expect(R.quemFica(b, a).fica.membroId).toBe(15);
  });
  test("com um número reaproveitado (dado a uma pessoa nova): a que entrou primeiro no sistema", () => {
    const velha = { membroId: 700, criadoEm: "2020-01-01" }, reaproveitada = { membroId: 500, criadoEm: "2027-01-01", reaproveitada: true };
    expect(R.quemFica(velha, reaproveitada).fica.membroId).toBe(700);
    expect(R.quemFica(reaproveitada, velha).sai.membroId).toBe(500);
  });
  test("empate na data: o número menor", () => {
    expect(R.quemFica({ membroId: 9, criadoEm: "2020-01-01", reaproveitada: true }, { membroId: 8, criadoEm: "2020-01-01" }).fica.membroId).toBe(8);
  });
});

describe("os campos comparados", () => {
  test("iguais ignoram espaços em excesso; datas viram AAAA-MM-DD; o endereço anda inteiro (a linha e as 8 partes)", () => {
    expect(R.iguais("nome", { Nome: "Ana  Maria " }, { Nome: "Ana Maria" })).toBe(true);
    expect(R.iguais("nome", { Nome: "Ana Maria" }, { Nome: "ANA MARIA" })).toBe(false);
    expect(R.iguais("dataNascimento", { DataNascimento: new Date("1990-03-14T00:00:00Z") }, { DataNascimento: "1990-03-14" })).toBe(true);
    expect(R.CAMPOS.endereco.colunas).toEqual(expect.arrayContaining(["Endereco", "EnderecoBairroId", "EnderecoCep"]));
    expect(R.iguais("endereco", { Endereco: "Rua A", EnderecoCep: "66000-000" }, { Endereco: "Rua A", EnderecoCep: "66000-001" })).toBe(false);
    expect(R.CAMPOS.congregacao.colunas).toEqual(["CongregacaoId", "ExtensaoId"]);
  });
  test("todas as colunas lidas são da ficha (sem repetição)", () => {
    expect(new Set(R.COLUNAS_FICHA).size).toBe(R.COLUNAS_FICHA.length);
    expect(R.COLUNAS_FICHA).not.toContain("MembroId");
  });
});

describe("quem escolhe o quê (as travas da edição campo a campo)", () => {
  const ctx = (extra) => ({ papel: "SECRETARIA", ehProprio: false, valorFica: null, emProcessoDeCargo: false, temExclusao: false, ...extra });
  test("o nome: só a Geral", () => {
    expect(R.podeEscolher("nome", ctx({ valorFica: "Ana" })).pode).toBe(false);
    expect(R.podeEscolher("nome", ctx({ papel: "GERAL", valorFica: "Ana" })).pode).toBe(true);
  });
  test("o CPF: vazio na que fica, a secretaria preenche; preenchido, só a Geral", () => {
    expect(R.podeEscolher("cpf", ctx({ valorFica: null })).pode).toBe(true);
    expect(R.podeEscolher("cpf", ctx({ valorFica: "12345678909" })).pode).toBe(false);
    expect(R.podeEscolher("cpf", ctx({ papel: "GERAL", valorFica: "12345678909" })).pode).toBe(true);
  });
  test("os atos da Igreja (situação, cargo, dízimo, saída): só a Geral", () => {
    for (const c of ["situacaoMembro", "status", "cargo", "dizimistaFiel", "saida"]) {
      expect(R.podeEscolher(c, ctx()).pode).toBe(false);
      expect(R.podeEscolher(c, ctx({ papel: "GERAL" })).pode).toBe(true);
    }
  });
  test("contato, endereço, foto e congregação: a secretaria escolhe", () => {
    for (const c of ["telefone", "email", "endereco", "fotoUrl", "congregacao", "nomeMae"]) expect(R.podeEscolher(c, ctx()).pode).toBe(true);
  });
  test("processo de cargo: o que conta para a escada, só a Geral", () => {
    expect(R.podeEscolher("dataNascimento", ctx({ emProcessoDeCargo: true })).pode).toBe(false);
    expect(R.podeEscolher("dataNascimento", ctx({ papel: "GERAL", emProcessoDeCargo: true })).pode).toBe(true);
  });
  test("a própria ficha: nada", () => {
    expect(R.podeEscolher("telefone", ctx({ ehProprio: true, papel: "GERAL" })).pode).toBe(false);
  });
  test("campo que não existe", () => {
    expect(R.podeEscolher("__proto__", ctx()).pode).toBe(false);
    expect(R.podeEscolher("constructor", ctx()).pode).toBe(false);
  });
});

describe("o que a tela mostra", () => {
  const linha = { Cpf: "12345678909", Email: "ana.souza@exemplo.org", Telefone: "(91) 98888-7777", DataSaida: new Date("2026-03-01T00:00:00Z"), MotivoSaida: "EXCLUSAO",
    CongregacaoId: 2, ExtensaoId: null, DizimistaFiel: true, FotoUrl: "https://x/foto.jpg", CargoMinisterial: "PRESBITERO" };
  test("o CPF, o e-mail e o celular mascarados", () => {
    expect(R.valorParaTela("cpf", linha)).toBe("***.456.789-**");
    expect(R.valorParaTela("email", linha)).not.toContain("ana.souza");
    expect(R.valorParaTela("telefone", linha)).toMatch(/7777$/);
    expect(R.valorParaTela("telefone", linha)).not.toContain("98888");
  });
  test("o motivo disciplinar da saída só com \"disciplina\"", () => {
    expect(R.valorParaTela("saida", linha)).toBe("2026-03-01 · motivo reservado");
    expect(R.valorParaTela("saida", linha, { podeDisciplina: true })).toBe("2026-03-01 · EXCLUSAO");
    expect(R.valorParaTela("saida", { ...linha, MotivoSaida: "CARTA_MUDANCA" })).toBe("2026-03-01 · CARTA_MUDANCA");
  });
  test("nomes no lugar dos números; a foto não vira link", () => {
    const nomes = { congregacoes: new Map([[2, "Vila Nova"]]), cargos: new Map([["PRESBITERO", "Presbítero"]]) };
    expect(R.valorParaTela("congregacao", linha, { nomes })).toBe("Vila Nova");
    expect(R.valorParaTela("cargo", linha, { nomes })).toBe("Presbítero");
    expect(R.valorParaTela("fotoUrl", linha)).toBe("tem foto");
    expect(R.valorParaTela("dizimistaFiel", linha)).toBe("sim");
  });
});

describe("as escolhas que vêm da tela", () => {
  test("FICA/SAI ou a matrícula de uma das duas", () => {
    const r = R.lerEscolhas({ telefone: "SAI", email: 15, nome: "500" }, { fica: 15, sai: 500 });
    expect(r.ok).toBe(true);
    expect({ ...r.escolhas }).toEqual({ telefone: "SAI", email: "FICA", nome: "SAI" });
  });
  test("lixo é recusado", () => {
    for (const e of [[], "SAI", 1, { telefone: "talvez" }, { inexistente: "SAI" }, { telefone: 999 }, JSON.parse('{"__proto__": "SAI"}'), { constructor: "SAI" }]) {
      expect(R.lerEscolhas(e, { fica: 15, sai: 500 }).ok).toBe(false);
    }
    expect(R.lerEscolhas(undefined, { fica: 15, sai: 500 }).ok).toBe(true);
  });
});

describe("as outras tabelas", () => {
  test("a política do conflito: descartar o que é acesso e aviso, arquivar o mesmo fato, bloquear o resto", () => {
    expect(R.politicaDoConflito("MembroPins")).toBe("DESCARTAR");
    expect(R.politicaDoConflito("Presencas")).toBe("ARQUIVAR");
    expect(R.politicaDoConflito("Lideranca")).toBe("BLOQUEAR");
    expect(R.politicaDoConflito("TabelaNova")).toBe("BLOQUEAR");
  });
  test("a prévia: só os nomes conhecidos; o resto (disciplina, proteção, cuidado pastoral) em \"outros registros\"", () => {
    const p = R.previaParaTela([{ t: "Presencas", n: 3 }, { t: "ProcessosDisciplinares", n: 1 }, { t: "NotasPastorais", n: 2 }, { t: "IncidenteEnvolvidos", n: 1 }, { t: "Dizimistas", n: 1 }]);
    expect(p).toEqual([{ rotulo: "presenças em reuniões", n: 3 }, { rotulo: "cadastro de dizimista", n: 1 }, { rotulo: "outros registros", n: 4 }]);
    expect(JSON.stringify(p)).not.toMatch(/Disciplin|Pastora|Incidente/);
  });
  test("o bloqueio diz o que encerrar; tabela sem texto próprio ganha a mensagem geral", () => {
    expect(R.motivoDoBloqueio("Lideranca")).toMatch(/liderança/);
    expect(R.motivoDoBloqueio("Qualquer")).toMatch(/Secretaria Geral/);
  });
});

describe("o alerta da assembleia geral", () => {
  test("sem pendência: não pede confirmação", () => {
    expect(textoDoAlerta({ repetidas: 0, numero: 0, arrolamento: 0, possiveis: 0 })).toEqual({ precisaConfirmar: false, mensagem: null });
  });
  test("com ficha repetida, possível repetida ou número a acertar: pede confirmação e diz quantas", () => {
    const a = textoDoAlerta({ repetidas: 2, numero: 1, arrolamento: 0, possiveis: 3 });
    expect(a.precisaConfirmar).toBe(true);
    expect(a.mensagem).toMatch(/2 fichas marcadas como repetidas/);
    expect(a.mensagem).toMatch(/3 duplas/);
    expect(a.mensagem).toMatch(/1 ficha com o número a acertar/);
  });
  test("só o arrolamento a completar: avisa sem pedir confirmação (essas pessoas já não votam)", () => {
    const a = textoDoAlerta({ repetidas: 0, numero: 0, arrolamento: 5, possiveis: 0 });
    expect(a.precisaConfirmar).toBe(false);
    expect(a.mensagem).toMatch(/5 pessoas ainda esperam o arrolamento/);
  });
});
