// Trava 7-C — o texto da migração 153 e a guarda das políticas de retenção em TODAS as migrações. A prova contra o banco de verdade está em
// tools/e2e-localdb/e2e-35 (a 153 aplicada duas vezes; o texto editado na tela sobrevive; o original troca) e e2e-36 (a retenção que a rotina diária aplica).
const fs = require("fs");
const path = require("path");
const PASTA = path.join(__dirname, "..", "..", "..", "sql", "migrations");
const ler = (nome) => fs.readFileSync(path.join(PASTA, nome), "utf8");
const TODAS = fs.readdirSync(PASTA).filter((n) => n.endsWith(".sql")).sort();
const T153 = ler(TODAS.find((n) => n.startsWith("153_")));
const semComentarios = (t) => t.split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join("\n");

describe("guarda das políticas de retenção (achado B)", () => {
  test("todo UPDATE da BaseLegal em qualquer migração só regrava o texto que ainda é o de partida (N'x') ou o original exato", () => {
    const semGuarda = [];
    for (const nome of TODAS) {
      const t = semComentarios(ler(nome));
      for (const m of t.matchAll(/UPDATE dbo\.PoliticasRetencao\s+SET BaseLegal = N'[^']*'\s+WHERE ([^;]*);/g)) {
        if (!/AND BaseLegal = N'/.test(m[1])) semGuarda.push(`${nome}: ${m[1].slice(0, 80)}`);
      }
    }
    expect(semGuarda).toEqual([]);
  });
  test("as que eram regravadas a cada deploy (117, 142, 143, 144, 145, 148) agora têm a guarda", () => {
    for (const n of ["117", "142", "143", "144", "145", "148"]) {
      const t = semComentarios(ler(TODAS.find((x) => x.startsWith(`${n}_`))));
      const updates = [...t.matchAll(/UPDATE dbo\.PoliticasRetencao\s+SET BaseLegal = N'[^']*'\s+WHERE ([^;]*);/g)];
      expect(updates.length).toBeGreaterThanOrEqual(1);
      for (const u of updates) expect(u[1]).toMatch(/AND BaseLegal = N'x'$/);
    }
  });
});

describe("migração 153", () => {
  const corrigidas = [...semComentarios(T153).matchAll(/SET BaseLegal = N'([^']*)'\s+WHERE Categoria = N'([^']+)'\s+AND BaseLegal = N'([^']*)';/g)].filter((m) => m[3] !== "x");

  test("troca a base legal de 9 políticas, cada uma SÓ quando o texto é exatamente o original de uma migração anterior", () => {
    expect(corrigidas.map((m) => m[2]).sort()).toEqual([
      "Canais de comunicação e ocorrências de moderação", "Comunicação — registro de entrega", "Cuidado pastoral — acompanhamentos", "Cuidado pastoral — pedidos de oração",
      "Dados Cadastrais Básicos", "Eventos, convidados externos e caixa flutuante", "Formação e certificados (trilhas)", "Incidentes de proteção de crianças e adolescentes",
      "Processo Disciplinar"]);
    const anteriores = TODAS.filter((n) => n < "153").map(ler).join("\n");
    for (const [, , cat, original] of corrigidas) expect([cat, anteriores.includes(`'${original}'`)]).toEqual([cat, true]);
  });
  test("o texto novo não usa 'organização religiosa', o Art. 245 nem o legítimo interesse para dado sensível", () => {
    for (const [, novo, cat] of corrigidas) {
      expect([cat, novo]).not.toEqual([cat, expect.stringMatching(/organiza[çc][ãa]o religiosa|245|tutela da sa[úu]de/i)]);
      if (/Cuidado pastoral|Formação|Comunicação/.test(cat)) expect([cat, novo]).not.toEqual([cat, expect.stringMatching(/7º, IX/)]);
    }
  });
  test("cada texto cabe na coluna (BaseLegal 300, Categoria 60)", () => {
    for (const [, texto] of T153.matchAll(/N'([^']*)'/g)) {
      if (texto.length > 60 && !/CREATE OR ALTER|RAISERROR/.test(texto)) expect(texto.length).toBeLessThanOrEqual(300);
    }
    for (const [, cat] of T153.matchAll(/INSERT INTO dbo\.PoliticasRetencao \(Categoria, BaseLegal, DiasRetencao\) VALUES \(N'([^']+)'/g)) expect(cat.length).toBeLessThanOrEqual(60);
  });
  test("as 4 políticas novas nascem com N'x' e o texto só entra na linha recém-criada; os prazos padrão são os do código", () => {
    const novas = [...T153.matchAll(/VALUES \(N'([^']+)', N'x', (\d+)\)/g)].map((m) => [m[1], Number(m[2])]);
    const cal = require("../calendarioDb"), canais = require("../canaisDb"), eventos = require("../eventosDb");
    expect(novas).toEqual([
      [cal.POLITICA_JUSTIFICATIVA_CEIA.categoria, cal.POLITICA_JUSTIFICATIVA_CEIA.padrao],
      [canais.POLITICAS_CANAIS.ocorrencia.categoria, canais.POLITICAS_CANAIS.ocorrencia.padrao],
      [canais.POLITICAS_CANAIS.administrador.categoria, canais.POLITICAS_CANAIS.administrador.padrao],
      [eventos.POLITICA_CONTATO_CONVIDADO.categoria, eventos.POLITICA_CONTATO_CONVIDADO.padrao]]);
    for (const [cat] of novas) expect(T153).toContain(`WHERE Categoria = N'${cat}' AND BaseLegal = N'x';`);
  });
  test("o esquema: colunas novas só se não existem; a nulidade muda só se ainda é NOT NULL; os índices voltam iguais; o gatilho é CREATE OR ALTER", () => {
    for (const [tab, col] of [["CalendarioPresencasDirigente", "JustificativaApagadaEm"], ["EventoConvidados", "ContatoApagadoEm"], ["CanalOcorrencias", "AnonimizadaEm"], ["CanalAdministradores", "AnonimizadoEm"]]) {
      expect(T153).toContain(`IF COL_LENGTH(N'dbo.${tab}', N'${col}') IS NULL\n    ALTER TABLE dbo.${tab} ADD ${col} DATETIME2 NULL;`.replace(/\n/g, T153.includes("\r\n") ? "\r\n" : "\n"));
    }
    expect(T153).toMatch(/name = N'RelatadaPorMembroId' AND is_nullable = 0\)\s+ALTER TABLE dbo\.CanalOcorrencias ALTER COLUMN RelatadaPorMembroId INT NULL;/);
    expect(T153).toMatch(/CREATE UNIQUE INDEX UX_CanalAdministradores_Ativo ON dbo\.CanalAdministradores \(CanalId, MembroId\) WHERE EncerradoEm IS NULL;/);
    expect(T153).toMatch(/CREATE INDEX IX_CanalAdministradores_Membro ON dbo\.CanalAdministradores \(MembroId\) INCLUDE \(CanalId\) WHERE EncerradoEm IS NULL;/);
    expect(T153).toMatch(/CREATE OR ALTER TRIGGER dbo\.TR_CanalOcorrencias_RelogioImutavel/);
    const blocos = T153.match(/EXEC\(N'[^]*?'\);/g) || [];
    expect(blocos.length).toBe(1);
    for (const b of blocos) expect(((b.match(/'/g) || []).length) % 2).toBe(0);
  });
});
