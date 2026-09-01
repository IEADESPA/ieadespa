-- ============================================================
-- Migração 008 — Perfil do membro (v0.2): dados de contato (LGPD) +
-- catálogo de Prazos que faltava desde a v0.1.
--
-- CargoMinisterial já existe em MembroReferencia desde a migração 001
-- (só não tinha CRUD/catálogo registrado nem estava exposto nas rotas/tela
-- — isso é código, não schema). Aqui só entram colunas/tabelas novas:
--   - Telefone/Email/Endereco: dados de contato básicos (LGPD - coleta
--     mínima; dados sensíveis como saúde/menores ficam para a v1.7).
--   - Prazos: catálogo configurável dos prazos citados no Estatuto/Regimento
--     (90 dias de integração, 1 ano de interstício, 30 dias de carta de
--     recomendação, 5 dias de defesa, etc.). NÃO alimenta os cálculos de
--     categoria/elegibilidade (Art. 7º/23º) — esses ficam fixos de propósito
--     em api/shared/estatuto.js ("regra jurídica vira função, não dado
--     editável por tela"). Serve de valor padrão *sugerido* pro processo
--     disciplinar (v0.2), onde o prazo pode ser reduzido caso a caso pela
--     Câmara/Conselho, sempre auditado (decisão confirmada, ver README).
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MembroReferencia') AND name = N'Telefone')
    ALTER TABLE dbo.MembroReferencia ADD Telefone NVARCHAR(20) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MembroReferencia') AND name = N'Email')
    ALTER TABLE dbo.MembroReferencia ADD Email NVARCHAR(150) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MembroReferencia') AND name = N'Endereco')
    ALTER TABLE dbo.MembroReferencia ADD Endereco NVARCHAR(300) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Prazos') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Prazos (
        PrazoId INT IDENTITY PRIMARY KEY,
        Sigla   NVARCHAR(40) NOT NULL,
        Nome    NVARCHAR(150) NOT NULL,
        Dias    INT NOT NULL,
        Ativo   BIT NOT NULL DEFAULT 1
    );
END
GO

INSERT INTO dbo.Prazos (Sigla, Nome, Dias)
SELECT v.Sigla, v.Nome, v.Dias FROM (VALUES
    ('INTEGRACAO',            'Período de Integração (Art. 6º §2º)',                         90),
    ('INTERSTICIO_FIDELIDADE','Interstício de Fidelidade p/ Diretoria/CF (Art. 23 §2º, I)',  365),
    ('CARTA_RECOMENDACAO',    'Validade da Carta de Recomendação (Reg. Art. 131)',            30),
    ('DEFESA_PREVIA',         'Prazo de defesa prévia no processo disciplinar (Reg. Art. 101)', 5),
    ('PARECER_COMISSAO',      'Parecer de comissão da CLI (Regimento)',                        15),
    ('RECURSO_ASSEMBLEIA',    'Recurso à Assembleia contra perda de membresia (Art. 11)',      30),
    ('ABANDONO_MATERIAL',     'Abandono Eclesiástico Material (Art. 11)',                      90),
    ('ABANDONO_DIGITAL',      'Abandono Eclesiástico Digital/incomunicável (Art. 11)',         90)
) AS v(Sigla, Nome, Dias)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Prazos p WHERE p.Sigla = v.Sigla);
GO
