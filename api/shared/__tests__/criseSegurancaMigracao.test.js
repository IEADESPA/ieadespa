// O texto da migração 152 (v7.15 — crise e segurança): idempotente, com os limites das colunas do sistema, os gatilhos no molde que já pagou o preço (o UPDATE que não alcança
// linha também dispara o gatilho), os CHECK que fecham o NULL, a crise única no banco, a categoria CRISE da comunicação e as permissões. A prova contra o banco de verdade está
// em tools/e2e-localdb/e2e-33 (a 152 aplicada duas vezes).
const fs = require("fs");
const path = require("path");
const TEXTO = fs.readFileSync(path.join(__dirname, "..", "..", "..", "sql", "migrations", "152_crise_e_seguranca.sql"), "utf8");
const lotes = TEXTO.split(/^\s*GO\s*$/gim).map((t) => t.trim()).filter(Boolean);

describe("migração 152", () => {
  test("toda tabela e todo índice são criados só se não existem", () => {
    const tabelas = [...TEXTO.matchAll(/CREATE TABLE dbo\.(\w+)/g)].map((m) => m[1]);
    expect(tabelas.sort()).toEqual(["CriseDemandaRespostas", "CriseDemandasImprensa", "CriseHistorico", "CriseManifestacoes", "CriseRegimes", "SegurancaEquipe", "SegurancaPlanos",
      "SegurancaSimulados", "SegurancaVistoriaItens", "SegurancaVistorias"]);
    for (const t of tabelas) expect(TEXTO).toMatch(new RegExp(`IF OBJECT_ID\\(N'dbo\\.${t}', N'U'\\) IS NULL\\s+BEGIN\\s+CREATE TABLE dbo\\.${t}`));
    const indices = [...TEXTO.matchAll(/CREATE (?:UNIQUE )?INDEX (\w+)/g)].map((m) => m[1]);
    expect(indices.length).toBeGreaterThanOrEqual(14);
    for (const ix of indices) expect(TEXTO).toMatch(new RegExp(`IF NOT EXISTS \\(SELECT 1 FROM sys\\.indexes WHERE name = N'${ix}'`));
  });
  test("uma crise ativa por vez: índice único filtrado no banco; a primeira resposta e cada correção são únicas", () => {
    expect(TEXTO).toMatch(/CREATE UNIQUE INDEX UX_CriseRegimes_UmaAtiva ON dbo\.CriseRegimes \(Status\) WHERE Status = N'ATIVA'/);
    expect(TEXTO).toMatch(/CREATE UNIQUE INDEX UX_CriseDemandaRespostas_Primeira ON dbo\.CriseDemandaRespostas \(DemandaId\) WHERE SubstituiRespostaId IS NULL/);
    expect(TEXTO).toMatch(/CREATE UNIQUE INDEX UX_CriseDemandaRespostas_Substitui ON dbo\.CriseDemandaRespostas \(SubstituiRespostaId\) WHERE SubstituiRespostaId IS NOT NULL/);
    expect(TEXTO).toMatch(/CREATE UNIQUE INDEX UX_CriseManifestacoes_Correcao ON dbo\.CriseManifestacoes \(CorrigeManifestacaoId\) WHERE CorrigeManifestacaoId IS NOT NULL/);
    expect(TEXTO).toMatch(/CREATE UNIQUE INDEX UX_SegurancaEquipe_Ativo ON dbo\.SegurancaEquipe \(CongregacaoId, MembroId, Funcao\) WHERE EncerradoEm IS NULL/);
  });
  test("todo gatilho é CREATE OR ALTER; os que deixam alguma mudança tratam o UPDATE que não alcança linha (inserted vazio só é DELETE se há linha em deleted)", () => {
    const gatilhos = [...TEXTO.matchAll(/CREATE OR ALTER TRIGGER dbo\.(\w+)/g)].map((m) => m[1]);
    expect(gatilhos.sort()).toEqual(["TR_CriseDemandaRespostas_Imutavel", "TR_CriseDemandasImprensa_Protegida", "TR_CriseHistorico_Imutavel", "TR_CriseManifestacoes_Imutavel",
      "TR_CriseRegimes_Protegido", "TR_SegurancaEquipe_Protegida", "TR_SegurancaPlanos_Imutavel", "TR_SegurancaSimulados_Protegido", "TR_SegurancaVistoriaItens_Protegido",
      "TR_SegurancaVistorias_Protegida"]);
    for (const g of ["TR_CriseRegimes_Protegido", "TR_CriseDemandasImprensa_Protegida", "TR_SegurancaSimulados_Protegido", "TR_SegurancaVistorias_Protegida", "TR_SegurancaVistoriaItens_Protegido",
      "TR_SegurancaEquipe_Protegida"]) {
      const corpo = lotes.find((l) => l.includes(`TRIGGER dbo.${g}`));
      expect(corpo).toMatch(/IF NOT EXISTS \(SELECT 1 FROM inserted\)\s+BEGIN\s+IF EXISTS \(SELECT 1 FROM deleted\)/);
    }
    for (const g of ["TR_CriseHistorico_Imutavel", "TR_CriseManifestacoes_Imutavel", "TR_CriseDemandaRespostas_Imutavel", "TR_SegurancaPlanos_Imutavel"]) {
      expect(lotes.find((l) => l.includes(`TRIGGER dbo.${g}`))).toMatch(/IF EXISTS \(SELECT 1 FROM deleted\)\s+BEGIN\s+RAISERROR/);
    }
  });
  test("a crise encerrada não muda mais nada; o porta-voz só muda com a crise ativa", () => {
    const corpo = lotes.find((l) => l.includes("TRIGGER dbo.TR_CriseRegimes_Protegido"));
    expect(corpo).toMatch(/OR d\.Status = N''ENCERRADA''/);
    expect(corpo).toMatch(/i\.Motivo <> d\.Motivo OR i\.Alcance <> d\.Alcance OR i\.OrdenadoPorMembroId <> d\.OrdenadoPorMembroId/);
  });
  test("o contato do jornalista só sai com a marca crise_purga; a pessoa só sai da equipe com a marca seguranca_purga", () => {
    expect(lotes.find((l) => l.includes("TRIGGER dbo.TR_CriseDemandasImprensa_Protegida"))).toMatch(/SESSION_CONTEXT\(N''crise_purga''\) AS INT\), 0\) <> 1/);
    expect(lotes.find((l) => l.includes("TRIGGER dbo.TR_SegurancaEquipe_Protegida"))).toMatch(/SESSION_CONTEXT\(N''seguranca_purga''\) AS INT\), 0\) = 1/);
  });
  test("os CHECK de lista fecham o NULL, e nenhum LEN(coluna que aceita NULL) fica sem o IS NOT NULL ao lado", () => {
    const listas = [...TEXTO.matchAll(/CHECK \((\w+) (IS NOT NULL AND \w+ )?IN \(/g)];
    expect(listas.length).toBeGreaterThanOrEqual(12);
    for (const l of listas) if (!["Categoria", "MotivoEncerramento", "Situacao"].includes(l[1])) expect(l[0]).toMatch(/IS NOT NULL AND/);   // as três: coluna NOT NULL ou o NULL é permitido de propósito
    for (const col of ["DesignacaoAto", "MotivoAnulacao", "Pendencia", "ComoResolvida"]) {
      for (const m of TEXTO.matchAll(new RegExp(`LEN\\(${col}\\)`, "g"))) expect(TEXTO.slice(m.index - 40, m.index)).toMatch(new RegExp(`${col} IS NOT NULL AND $`));
    }
  });
  test("a categoria CRISE entra nos CHECK da comunicação (v7.12) sem tirar nenhuma, e só se ainda não entrou", () => {
    for (const t of ["ComunicacaoModelos", "ComunicacaoEnvios"]) {
      expect(TEXTO).toMatch(new RegExp(`IF EXISTS \\(SELECT 1 FROM sys\\.check_constraints WHERE name = N'CK_${t}_Categoria' AND definition NOT LIKE N'%CRISE%'\\)`));
      expect(TEXTO).toMatch(new RegExp(`ALTER TABLE dbo\\.${t} ADD CONSTRAINT CK_${t}_Categoria CHECK \\(Categoria IN \\(N'CONVOCACAO', N'EVENTOS', N'DEVOCIONAL', N'FINANCEIRO', N'CRISE'\\)\\)`));
    }
  });
  test("as permissões vão só aos papéis do contrato, sem duplicar", () => {
    expect(TEXTO).toMatch(/WHERE Nome IN \(N'Presidente', N'Secretário Geral'\) AND \(',' \+ ISNULL\(Permissoes, ''\) \+ ','\) NOT LIKE '%,crise_gestao,%'/);
    expect(TEXTO).toMatch(/WHERE Nome IN \(N'Presidente', N'Secretário Geral', N'Dirigente de Congregação', N'Pastor de Área'\) AND \(',' \+ ISNULL\(Permissoes, ''\) \+ ','\) NOT LIKE '%,seguranca_congregacao,%'/);
  });
  test("os limites das colunas do sistema: Funcionalidades.Nome 100, Prazos.Sigla 40 e Nome 150, PoliticasRetencao Categoria 60 e BaseLegal 300, NotificacaoRegras.Titulo 150", () => {
    for (const [, nome] of TEXTO.matchAll(/INSERT INTO dbo\.Funcionalidades \(Chave, Nome\) VALUES \('\w+', N'([^']+)'\)/g)) expect(nome.length).toBeLessThanOrEqual(100);
    const prazos = [...TEXTO.matchAll(/INSERT INTO dbo\.Prazos \(Sigla, Nome, Dias\) VALUES \('(\w+)', N'([^']+)', (\d+)\)/g)];
    expect(prazos.map((p) => [p[1], Number(p[3])])).toEqual([["SEGURANCA_PLANO_REVISAO_DIAS", 365], ["SEGURANCA_SIMULADO_MAX_DIAS", 365], ["SEGURANCA_VISTORIA_MAX_DIAS", 180], ["COMUNICACAO_CRISE_EMAILS_POR_HORA", 30]]);
    for (const p of prazos) { expect(p[1].length).toBeLessThanOrEqual(40); expect(p[2].length).toBeLessThanOrEqual(150); }
    for (const [, cat] of TEXTO.matchAll(/INSERT INTO dbo\.PoliticasRetencao \(Categoria, BaseLegal, DiasRetencao\) VALUES \(N'([^']+)'/g)) expect(cat.length).toBeLessThanOrEqual(60);
    const bases = [...TEXTO.matchAll(/SET BaseLegal = N'([^']+)'/g)].map((m) => m[1]);
    expect(bases).toHaveLength(3);
    for (const b of bases) expect(b.length).toBeLessThanOrEqual(300);
  });
  test("os avisos: o pedido da imprensa é obrigatório e vai ao celular; os da segurança vão só ao sininho (o e-mail direto do motor passaria dos 100 por hora)", () => {
    const regras = [...TEXTO.matchAll(/INSERT INTO dbo\.NotificacaoRegras \(Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria\)\s+VALUES \(N'(\w+)', N'([^']+)', N'(\w+)', NULL, NULL, (\d), (\d), (\d)\)/g)];
    expect(regras.map((r) => r[1]).sort()).toEqual(["CRISE_DEMANDA_IMPRENSA", "CRISE_EM_SEU_NOME", "SEGURANCA_AVCB_SEGURO", "SEGURANCA_PLANO_REVISAO", "SEGURANCA_SEM_SIMULADO", "SEGURANCA_SEM_VISTORIA"]);
    const emSeuNome = regras.find((r) => r[1] === "CRISE_EM_SEU_NOME");
    expect([emSeuNome[4], emSeuNome[5], emSeuNome[6]]).toEqual(["0", "1", "1"]);
    for (const r of regras) expect(r[2].length).toBeLessThanOrEqual(150);
    const imprensa = regras.find((r) => r[1] === "CRISE_DEMANDA_IMPRENSA");
    expect([imprensa[4], imprensa[5], imprensa[6]]).toEqual(["0", "1", "1"]);
    for (const r of regras.filter((x) => x[3] === "SEGURANCA")) expect([r[4], r[5], r[6]]).toEqual(["0", "0", "0"]);
  });
  test("revisão independente: a situação ALCANCADO entra no CHECK da entrega sem tirar nenhuma, e só uma vez", () => {
    expect(TEXTO).toMatch(/IF EXISTS \(SELECT 1 FROM sys\.check_constraints WHERE name = N'CK_ComunicacaoEntregas_Situacao' AND definition NOT LIKE N'%ALCANCADO%'\)/);
    const add = /ADD CONSTRAINT CK_ComunicacaoEntregas_Situacao CHECK \(Situacao IN \(([^)]*)\)\)/.exec(TEXTO);
    expect(add && add[1].replace(/\s+/g, " ")).toBe("N'PENDENTE', N'ENVIANDO', N'ACEITO', N'FALHOU', N'SEM_CONSENTIMENTO', N'SEM_CONTATO', N'SEM_APARELHO', N'CANCELADO', N'ALCANCADO'");
  });
  test("revisão independente: Papeis.Permissoes é alargada para 2000 ANTES do UPDATE quando o acréscimo não cabe; se nem assim couber, a migração para com a explicação", () => {
    const iAlarga = TEXTO.indexOf("ALTER TABLE dbo.Papeis ALTER COLUMN Permissoes NVARCHAR(2000) NULL");
    const iErro = TEXTO.indexOf("RAISERROR(N'Migração 152: a lista de permissões");
    const iUpdate = TEXTO.indexOf("SET Permissoes = CASE WHEN ISNULL(Permissoes, '') = '' THEN 'crise_gestao'");
    expect(iAlarga).toBeGreaterThan(0);
    expect(iAlarga < iErro && iErro < iUpdate).toBe(true);
    expect(TEXTO.slice(iAlarga - 900, iAlarga)).toMatch(/BETWEEN 1 AND 1999\s*$/);
    // a conta é exata: só soma o que falta (13 de ",crise_gestao" para o Presidente e o Secretário; 22 de ",seguranca_congregacao")
    expect(",crise_gestao".length).toBe(13);
    expect(",seguranca_congregacao".length).toBe(22);
    expect((TEXTO.match(/THEN 13 ELSE 0 END/g) || []).length).toBe(2);
    expect((TEXTO.match(/THEN 22 ELSE 0 END/g) || []).length).toBe(2);
  });
  test("o cabeçalho diz que é idempotente", () => {
    expect(TEXTO).toMatch(/-- Idempotente: seguro para reexecutar sem apagar dados\./);
  });
});
