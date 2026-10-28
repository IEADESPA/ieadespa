// v8.2 — Escada ministerial (Regimento Art. 66 §§3º–5º, 67, 71 a 74): a regra pura de shared/escada.js e o texto da migração 157. A prova contra o banco de verdade está em
// tools/e2e-localdb/e2e-51 a 53.
const fs = require("fs");
const path = require("path");
const escada = require("../escada");

const HOJE = "2026-10-28";
// Uma pessoa que atende tudo para ir de Missionário a Diácono; cada teste estraga só o que quer provar.
const base = (extra = {}) => ({
  cargoAtual: "MISSIONARIO", cargoDesde: "2023-01-10", status: "ATIVO", emComunhao: true, sobDisciplina: false, cartaMudanca: false,
  dataNascimento: "1990-05-01", dataAdmissao: "2015-03-01", dizimistaFiel: true, sexo: "M", estadoCivil: "CASADO", batismoEspirito: true,
  afm: { statusMatricula: "ATIVA", nivel: "MEDIO", concluido: false, chm: true, chmEm: "2026-09-01" },
  ...extra
});
const situacao = (av, chave) => (av.itens.find((i) => i.chave === chave) || {}).situacao;
const avaliar = (dados, alvo, modalidade = "INDICACAO") => escada.avaliarAscensao(dados, alvo, { modalidade, hojeIso: HOJE });

describe("a escada (Art. 71)", () => {
  test("a ordem e o próximo degrau", () => {
    expect(escada.ESCADA).toEqual(["MEMBRO", "AUXILIAR", "MISSIONARIO", "DIACONO", "PRESBITERO", "EVANGELISTA", "PASTOR"]);
    expect(escada.proximoDegrau(null)).toBe("AUXILIAR");
    expect(escada.proximoDegrau("MEMBRO")).toBe("AUXILIAR");
    expect(escada.proximoDegrau("AUXILIAR")).toBe("MISSIONARIO");
    expect(escada.proximoDegrau("MISSIONARIO")).toBe("DIACONO");
    expect(escada.proximoDegrau("PASTOR")).toBeNull();
    expect(escada.proximoDegrau("COOPERADOR")).toBeNull();
  });
  test("quem atende tudo passa; a lista diz o artigo de cada item", () => {
    const av = avaliar(base(), "DIACONO");
    expect(av.bloqueado).toBe(false);
    expect(av.mensagemBloqueio).toBeNull();
    for (const i of av.itens) {
      expect(i.artigo).toMatch(/^Art\. /);
      expect(["ATENDE", "AVISO"]).toContain(i.situacao);
    }
    expect(av.itens.map((i) => i.chave)).toEqual(expect.arrayContaining(["degrau", "comunhao", "dizimo", "intersticio", "sexo", "batismoEspirito", "matricula", "escolaridade", "chm"]));
  });
  test("vedada a queima de etapas: Auxiliar não vai direto a Diácono; ninguém 'sobe' para o próprio cargo ou abaixo", () => {
    const pulo = avaliar(base({ cargoAtual: "AUXILIAR" }), "DIACONO");
    expect(situacao(pulo, "degrau")).toBe("FALTA");
    expect(pulo.itens.find((i) => i.chave === "degrau").detalhe).toMatch(/próximo degrau é Missionário/);
    expect(situacao(avaliar(base({ cargoAtual: "DIACONO" }), "DIACONO"), "degrau")).toBe("FALTA");
    expect(situacao(avaliar(base({ cargoAtual: "PRESBITERO" }), "DIACONO"), "degrau")).toBe("FALTA");
    expect(situacao(avaliar(base({ cargoAtual: "COOPERADOR" }), "DIACONO"), "degrau")).toBe("FALTA");
  });
  test("ministro de outra convenção dispensa o degrau e o interstício (mas não a comunhão nem o dízimo)", () => {
    const av = avaliar(base({ cargoAtual: "MEMBRO", cargoDesde: null, dizimistaFiel: false }), "PASTOR", "OUTRA_CONVENCAO");
    expect(situacao(av, "degrau")).toBe("DISPENSADO");
    expect(situacao(av, "dizimo")).toBe("FALTA");
    expect(av.bloqueado).toBe(true);
    const ok = avaliar(base({ cargoAtual: "MEMBRO", cargoDesde: null, afm: null }), "PRESBITERO", "OUTRA_CONVENCAO");
    expect(situacao(ok, "intersticio")).toBe("DISPENSADO");
    expect(ok.bloqueado).toBe(false);
    expect(ok.nivelamento).toBe(true);   // sem matrícula, nível e CHM: dispensados agora, nivelamento depois da posse
  });
  test("o tipo que não leva a cargo da escada trava (nunca 'sobe' para Membro)", () => {
    expect(avaliar(base(), "MEMBRO").bloqueado).toBe(true);
    expect(avaliar(base(), "BISPO").bloqueado).toBe(true);
  });
});

describe("requisitos por degrau (Art. 72)", () => {
  test("Auxiliar: 17 anos e 1 ano de membresia, contados pelo dia de Brasília", () => {
    const membro = base({ cargoAtual: "MEMBRO", cargoDesde: null, afm: { statusMatricula: "ATIVA", nivel: "BASICO", concluido: false, chm: true } });
    expect(avaliar(membro, "AUXILIAR").bloqueado).toBe(false);
    expect(situacao(avaliar({ ...membro, dataNascimento: "2009-10-29" }, "AUXILIAR"), "idade")).toBe("FALTA");   // faz 17 amanhã
    expect(situacao(avaliar({ ...membro, dataNascimento: "2009-10-28" }, "AUXILIAR"), "idade")).toBe("ATENDE");  // faz 17 hoje
    const novo = avaliar({ ...membro, dataAdmissao: "2025-11-01" }, "AUXILIAR");
    expect(situacao(novo, "membresia")).toBe("FALTA");
    expect(novo.itens.find((i) => i.chave === "membresia").detalhe).toMatch(/completa 1 ano em 01\/11\/2026/);
    expect(situacao(avaliar({ ...membro, dataAdmissao: "2025-10-28" }, "AUXILIAR"), "membresia")).toBe("ATENDE");
  });
  test("interstício: 1 ano como Auxiliar, 2 como Missionário(a), 2 como Diácono; diz quando completa", () => {
    expect(situacao(avaliar(base({ cargoAtual: "AUXILIAR", cargoDesde: "2025-10-28", afm: { statusMatricula: "ATIVA", nivel: "MEDIO", chm: true } }), "MISSIONARIO"), "intersticio")).toBe("ATENDE");
    expect(situacao(avaliar(base({ cargoAtual: "AUXILIAR", cargoDesde: "2025-10-29", afm: { statusMatricula: "ATIVA", nivel: "MEDIO", chm: true } }), "MISSIONARIO"), "intersticio")).toBe("FALTA");
    const cedo = avaliar(base({ cargoDesde: "2025-02-28" }), "DIACONO");
    expect(situacao(cedo, "intersticio")).toBe("FALTA");
    expect(cedo.itens.find((i) => i.chave === "intersticio").detalhe).toMatch(/completa em 28\/02\/2027/);
    const presb = avaliar(base({ cargoAtual: "DIACONO", cargoDesde: "2024-10-28", afm: { statusMatricula: "ATIVA", nivel: "AVANCADO", chm: true } }), "PRESBITERO");
    expect(situacao(presb, "intersticio")).toBe("ATENDE");
  });
  test("sem a data de entrada no cargo atual o interstício não é presumido: trava pedindo o dado", () => {
    const av = avaliar(base({ cargoDesde: null }), "DIACONO");
    expect(situacao(av, "intersticio")).toBe("SEM_DADO");
    expect(av.bloqueado).toBe(true);
    expect(av.itens.find((i) => i.chave === "intersticio").detalhe).toMatch(/No cargo desde/);
  });
  test("29 de fevereiro + 1 ano = 28 de fevereiro", () => {
    expect(escada.somarAnos("2024-02-29", 1)).toBe("2025-02-28");
    expect(escada.somarAnos("2024-02-29", 4)).toBe("2028-02-29");
  });
  test("Diácono: Batismo no Espírito Santo", () => {
    expect(situacao(avaliar(base({ batismoEspirito: false }), "DIACONO"), "batismoEspirito")).toBe("FALTA");
    expect(situacao(avaliar(base({ cargoAtual: "DIACONO", cargoDesde: "2020-01-01", batismoEspirito: false, afm: { statusMatricula: "ATIVA", nivel: "AVANCADO", chm: true } }), "PRESBITERO"), "batismoEspirito")).toBeUndefined();
  });
  test("Presbítero: menos de 30 anos é só aviso (idade preferencial)", () => {
    const jovem = avaliar(base({ cargoAtual: "DIACONO", cargoDesde: "2020-01-01", dataNascimento: "2000-01-01", afm: { statusMatricula: "ATIVA", nivel: "AVANCADO", chm: true } }), "PRESBITERO");
    expect(situacao(jovem, "idadePresbitero")).toBe("AVISO");
    expect(jovem.bloqueado).toBe(false);
  });
  test("escolaridade: Médio cursando para Diácono; Evangelista e Pastor só com o curso concluído", () => {
    expect(situacao(avaliar(base({ afm: { statusMatricula: "ATIVA", nivel: "BASICO", chm: true } }), "DIACONO"), "escolaridade")).toBe("FALTA");
    expect(situacao(avaliar(base({ afm: { statusMatricula: "ATIVA", nivel: null, chm: true } }), "DIACONO"), "escolaridade")).toBe("SEM_DADO");
    const ev = (concluido) => avaliar(base({ cargoAtual: "PRESBITERO", afm: { statusMatricula: "ATIVA", nivel: "AVANCADO", concluido, chm: true } }), "EVANGELISTA", "NOMEACAO_PRESIDENCIAL");
    expect(situacao(ev(false), "escolaridade")).toBe("FALTA");      // nem a nomeação do Presidente dispensa (Art. 72, V, b)
    expect(ev(false).bloqueado).toBe(true);
    expect(ev(true).bloqueado).toBe(false);
    // o ministro já ordenado de outra convenção não é candidato: o curso fica para o nivelamento (Regimento Art. 8º e 10)
    const fora = avaliar(base({ cargoAtual: "MEMBRO", cargoDesde: null, afm: null }), "PASTOR", "OUTRA_CONVENCAO");
    expect(situacao(fora, "escolaridade")).toBe("DISPENSADO");
    expect(fora.bloqueado).toBe(false);
    expect(fora.nivelamento).toBe(true);
  });
  test("comunhão: inativo, disciplina e carta de mudança travam; dízimo em branco não conta como atendido", () => {
    expect(situacao(avaliar(base({ status: "INATIVO" }), "DIACONO"), "comunhao")).toBe("FALTA");
    expect(situacao(avaliar(base({ emComunhao: false }), "DIACONO"), "comunhao")).toBe("FALTA");
    expect(avaliar(base({ sobDisciplina: true }), "DIACONO").itens.find((i) => i.chave === "comunhao").detalhe).toMatch(/disciplina/);
    expect(avaliar(base({ cartaMudanca: true }), "DIACONO").itens.find((i) => i.chave === "comunhao").detalhe).toMatch(/Carta de mudança/);
    expect(situacao(avaliar(base({ dizimistaFiel: null }), "DIACONO"), "dizimo")).toBe("SEM_DADO");
    expect(situacao(avaliar(base({ dizimistaFiel: false }), "DIACONO"), "dizimo")).toBe("FALTA");
  });
  test("fora do nível geral o motivo da comunhão some (dado sigiloso)", () => {
    const av = escada.mascararParaEscopo(avaliar(base({ sobDisciplina: true }), "DIACONO"));
    const i = av.itens.find((x) => x.chave === "comunhao");
    expect(i.situacao).toBe("FALTA");
    expect(i.detalhe).not.toMatch(/disciplina/i);
    expect(av.bloqueado).toBe(true);
  });
});

describe("Missionária é o teto das obreiras (Art. 71, III)", () => {
  test("obreira não sobe a Diácono; sem o sexo no cadastro também trava", () => {
    expect(situacao(avaliar(base({ sexo: "F" }), "DIACONO"), "sexo")).toBe("FALTA");
    expect(situacao(avaliar(base({ sexo: null }), "DIACONO"), "sexo")).toBe("SEM_DADO");
    expect(situacao(avaliar(base({ sexo: "M" }), "DIACONO"), "sexo")).toBe("ATENDE");
  });
  test("até Missionária não se pergunta o sexo; ordenação convencional de fora dispensa", () => {
    const aux = base({ cargoAtual: "AUXILIAR", cargoDesde: "2020-01-01", sexo: null });
    expect(situacao(avaliar(aux, "MISSIONARIO"), "sexo")).toBeUndefined();
    expect(situacao(avaliar(base({ sexo: "F", cargoAtual: "MEMBRO" }), "PASTOR", "OUTRA_CONVENCAO"), "sexo")).toBe("DISPENSADO");
    expect(situacao(avaliar(base({ sexo: "F" }), "DIACONO", "NOMEACAO_PRESIDENCIAL"), "sexo")).toBe("FALTA");   // não é requisito técnico
  });
});

describe("AFM: matrícula, CHM e a soberania presidencial (Art. 66 §§3º–5º, 67)", () => {
  test("indicação sem CHM ou sem matrícula trava", () => {
    expect(situacao(avaliar(base({ afm: { statusMatricula: "ATIVA", nivel: "MEDIO", chm: false } }), "DIACONO"), "chm")).toBe("FALTA");
    const candidato = avaliar(base({ cargoAtual: "MEMBRO", cargoDesde: null, afm: null }), "AUXILIAR");
    expect(situacao(candidato, "matricula")).toBe("FALTA");
    expect(candidato.itens.find((i) => i.chave === "matricula").detalhe).toMatch(/Básico/);
  });
  test("nomeação direta do Presidente dispensa só o técnico, e fica o nivelamento obrigatório", () => {
    const av = avaliar(base({ afm: { statusMatricula: "ATIVA", nivel: "BASICO", chm: false } }), "DIACONO", "NOMEACAO_PRESIDENCIAL");
    expect(situacao(av, "chm")).toBe("DISPENSADO");
    expect(situacao(av, "escolaridade")).toBe("DISPENSADO");
    expect(av.itens.find((i) => i.chave === "chm").detalhe).toMatch(/Art\. 66 §5º/);
    expect(av.bloqueado).toBe(false);
    expect(av.nivelamento).toBe(true);
    // o que não é técnico continua valendo
    expect(avaliar(base({ cargoDesde: "2026-01-01" }), "DIACONO", "NOMEACAO_PRESIDENCIAL").bloqueado).toBe(true);
    expect(avaliar(base({ batismoEspirito: false }), "DIACONO", "NOMEACAO_PRESIDENCIAL").bloqueado).toBe(true);
    expect(avaliar(base({ cargoAtual: "AUXILIAR" }), "DIACONO", "NOMEACAO_PRESIDENCIAL").bloqueado).toBe(true);   // a nomeação não pula degrau
  });
  test("matrícula INATIVA trava em qualquer modalidade (é suspensão, não lacuna técnica)", () => {
    for (const m of ["INDICACAO", "NOMEACAO_PRESIDENCIAL", "OUTRA_CONVENCAO"]) {
      expect(situacao(avaliar(base({ afm: { statusMatricula: "INATIVA", nivel: "MEDIO", chm: true } }), "DIACONO", m), "matricula")).toBe("FALTA");
    }
  });
  test("Evangelista e Pastor só por indicação do Presidente (indicação comum trava); CIADSETA e Pastor casado são avisos", () => {
    const presb = base({ cargoAtual: "EVANGELISTA", afm: { statusMatricula: "ATIVA", nivel: "BACHAREL", concluido: true, chm: true }, estadoCivil: "SOLTEIRO" });
    expect(situacao(avaliar(presb, "PASTOR"), "prerrogativa")).toBe("FALTA");
    const nom = avaliar(presb, "PASTOR", "NOMEACAO_PRESIDENCIAL");
    expect(nom.bloqueado).toBe(false);
    expect(situacao(nom, "ciadseta")).toBe("AVISO");
    expect(situacao(nom, "pastorCasado")).toBe("AVISO");
  });
  test("divorciado(a): aviso do escrutínio especial do CEI (Art. 73, III, b)", () => {
    const av = avaliar(base({ estadoCivil: "DIVORCIADO" }), "DIACONO");
    expect(situacao(av, "divorcio")).toBe("AVISO");
    expect(av.bloqueado).toBe(false);
  });
  test("nivelamento: só quem chegou por nomeação ou de outra convenção e ainda está abaixo do nível do cargo", () => {
    expect(escada.emNivelamento("DIACONO", "NOMEACAO_PRESIDENCIAL", "BASICO", false)).toBe(true);
    expect(escada.emNivelamento("DIACONO", "NOMEACAO_PRESIDENCIAL", "MEDIO", false)).toBe(false);
    expect(escada.emNivelamento("DIACONO", "CONSAGRACAO", "BASICO", false)).toBe(false);
    expect(escada.emNivelamento("PASTOR", "OUTRA_CONVENCAO", "AVANCADO", false)).toBe(true);
    expect(escada.emNivelamento("PASTOR", "OUTRA_CONVENCAO", null, false)).toBe(true);
  });
  test("o retrato guardado no processo cabe na coluna e diz o que foi conferido", () => {
    const r = JSON.parse(escada.retrato(avaliar(base(), "DIACONO"), HOJE));
    expect(r).toMatchObject({ em: HOJE, alvo: "DIACONO", modalidade: "INDICACAO" });
    expect(r.itens).toEqual(expect.arrayContaining([["chm", "ATENDE"], ["intersticio", "ATENDE"]]));
    expect(escada.retrato(avaliar(base(), "DIACONO"), HOJE).length).toBeLessThanOrEqual(4000);
  });
});

describe("migração 157", () => {
  const TEXTO = fs.readFileSync(path.join(__dirname, "..", "..", "..", "sql", "migrations", "157_escada_ministerial.sql"), "utf8");
  test("toda tabela, coluna, índice e CHECK são criados só se não existem", () => {
    for (const m of TEXTO.matchAll(/ALTER TABLE dbo\.(\w+) ADD (\w+) /g)) {
      if (m[2] === "CONSTRAINT") continue;
      expect(TEXTO).toMatch(new RegExp(`IF COL_LENGTH\\(N'dbo\\.${m[1]}', N'${m[2]}'\\) IS NULL\\s+ALTER TABLE dbo\\.${m[1]} ADD ${m[2]} `));
    }
    for (const ix of [...TEXTO.matchAll(/CREATE (?:UNIQUE )?INDEX (\w+)/g)].map((m) => m[1])) {
      expect(TEXTO).toMatch(new RegExp(`IF NOT EXISTS \\(SELECT 1 FROM sys\\.indexes WHERE name = N'${ix}'`));
    }
    for (const ck of [...TEXTO.matchAll(/ADD CONSTRAINT (CK_\w+)/g)].map((m) => m[1])) {
      expect(TEXTO).toMatch(new RegExp(`IF NOT EXISTS \\(SELECT 1 FROM sys\\.check_constraints WHERE name = N'${ck}'`));
    }
    expect(TEXTO).toMatch(/IF NOT EXISTS \(SELECT 1 FROM sys\.objects WHERE object_id = OBJECT_ID\(N'dbo\.CargosMinisteriaisHistorico'\)/);
  });
  test("a origem de CANDIDATO entra no CHECK da matrícula sem perder as da v8.1", () => {
    expect(TEXTO).toMatch(/Origem IN \(N'AUTOMATICA', N'REMATRICULA', N'LEGADO', N'CANDIDATO'\)/);
    expect(TEXTO).toMatch(/definition NOT LIKE N'%CANDIDATO%'/);   // só recria o CHECK antigo uma vez
  });
  test("um processo em andamento por pessoa e uma linha aberta de cargo por pessoa", () => {
    expect(TEXTO).toMatch(/CREATE UNIQUE INDEX UX_Consagracoes_EmAndamento ON dbo\.Consagracoes \(MembroId\)\s+WHERE CargoAlvo IS NOT NULL AND Status IN \(N'PROTOCOLADO', N'EM_ANALISE_CONSELHO', N'AGUARDANDO_PLENARIO'\)/);
    expect(TEXTO).toMatch(/CREATE UNIQUE INDEX UX_CargosHist_Aberto ON dbo\.CargosMinisteriaisHistorico \(MembroId\) WHERE Ate IS NULL/);
  });
  test("o veto só existe sobre indicação reprovada, com quem e por quê", () => {
    expect(TEXTO).toMatch(/VetoAFMEm IS NULL OR \(Modalidade = N'INDICACAO' AND Status = N'REPROVADO' AND VetoAFMPor IS NOT NULL/);
  });
  test("os tipos que faltavam na escada entram com o cargo resultante", () => {
    for (const [nome, cargo] of [["Consagração a Auxiliar", "AUXILIAR"], ["Consagração a Missionário(a)", "MISSIONARIO"], ["Consagração a Pastor", "PASTOR"]]) {
      expect(TEXTO).toContain(`(N'${nome}', N'${cargo}')`);
    }
  });
});
