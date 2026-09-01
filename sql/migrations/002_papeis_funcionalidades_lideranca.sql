-- ============================================================
-- Migração 002 — Papéis, Funcionalidades e Liderança por papel/escopo
-- Alinha o schema ao modelo atual do app: permissões como catálogos
-- configuráveis (Funcionalidades + Papeis) e liderança por papelId/
-- escopoTipo/escopoId (em vez das colunas antigas Tipo/Escopo/Permissoes).
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

-- Chaves de permissão (catálogo configurável)
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Funcionalidades') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Funcionalidades (
        FuncionalidadeId INT IDENTITY PRIMARY KEY,
        Chave            NVARCHAR(50) NOT NULL,
        Nome             NVARCHAR(100) NOT NULL
    );
END
GO

INSERT INTO dbo.Funcionalidades (Chave, Nome)
SELECT v.Chave, v.Nome FROM (VALUES
    ('reunioes','Reuniões'),
    ('assembleia','Assembleia Geral'),
    ('cli','CLI'),
    ('pessoas','Pessoas'),
    ('permissoes','Permissões'),
    ('consagracoes','Consagrações'),
    ('estrutura','Estrutura'),
    ('catalogos','Catálogos'),
    ('financeiro','Financeiro'),
    ('relatorios','Relatórios'),
    ('auditoria','Auditoria'),
    ('disciplina','Disciplina')
) AS v(Chave, Nome)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades f WHERE f.Chave = v.Chave);
GO

-- Papéis: agrupam permissões + nível de escopo
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Papeis') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Papeis (
        PapelId    INT IDENTITY PRIMARY KEY,
        Nome       NVARCHAR(100) NOT NULL,
        Nivel      NVARCHAR(30) NOT NULL,
        Permissoes NVARCHAR(500) NULL
    );
END
GO

INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes)
SELECT v.Nome, v.Nivel, v.Permissoes FROM (VALUES
    ('Secretário Geral','GLOBAL','reunioes,assembleia,cli,pessoas,permissoes,consagracoes,estrutura,catalogos,financeiro,relatorios,auditoria,disciplina'),
    ('Dirigente de Congregação','CONGREGACAO','reunioes,pessoas,estrutura'),
    ('Pastor de Área','AREA','reunioes,pessoas,assembleia'),
    ('Secretário de Reuniões','GLOBAL','reunioes'),
    ('Tesoureiro','GLOBAL','financeiro'),
    ('Líder de Consagrações','GLOBAL','consagracoes')
) AS v(Nome, Nivel, Permissoes)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Papeis p WHERE p.Nome = v.Nome);
GO

-- Lideranca: passa a referenciar papel + escopo (mantém as colunas antigas p/ compatibilidade)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Lideranca') AND name = N'PapelId')
    ALTER TABLE dbo.Lideranca ADD PapelId INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Lideranca') AND name = N'EscopoTipo')
    ALTER TABLE dbo.Lideranca ADD EscopoTipo NVARCHAR(30) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Lideranca') AND name = N'EscopoId')
    ALTER TABLE dbo.Lideranca ADD EscopoId INT NULL;
GO
