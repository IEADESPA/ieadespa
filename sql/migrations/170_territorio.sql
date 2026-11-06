-- ============================================================
-- Migração 170 — v9.5: Mapa territorial e inteligência de expansão. Desenho em docs/plano/fase-9-entidades-vinculadas.md.
--
--   Bairros:                o cadastro dos bairros (nome, cidade, UF e o ponto central marcado uma vez) — do nível geral.
--   MembroReferencia:       o endereço em linhas (logradouro, número, complemento, bairro da lista ou escrito, cidade, UF e CEP); a linha única
--                           (Endereco) continua e passa a ser montada pelo sistema com as linhas.
--   ExtensoesTenda:         o ponto no mapa (latitude e longitude).
--   TerritorioParametros:   uma linha só: o raio de cobertura (km) e a marca de que a régua inicial dos critérios já foi semeada.
--   CriteriosEmancipacao:   a tabela de critérios da simulação de emancipação, montada pelo responsável (indicador, comparação, valor, ativo, ordem).
--
-- Nenhuma permissão nova: a pílula Território é da permissão "expansao" (e da CME), como a v9.2.
-- Idempotente: seguro para reexecutar sem apagar dados. Cada ALTER em batch próprio (GO).
-- ============================================================

-- ---- os bairros ----
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Bairros') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Bairros (
        BairroId     INT IDENTITY CONSTRAINT PK_Bairros PRIMARY KEY,
        -- comparados sem maiúscula e sem acento: "São José" e "Sao Jose" são o mesmo bairro
        Nome         NVARCHAR(150) COLLATE Latin1_General_CI_AI NOT NULL,
        Cidade       NVARCHAR(150) COLLATE Latin1_General_CI_AI NOT NULL,
        UF           NCHAR(2) NOT NULL,
        Lat          DECIMAL(9,6) NULL,
        Lng          DECIMAL(9,6) NULL,
        Ativo        BIT NOT NULL CONSTRAINT DF_Bairros_Ativo DEFAULT 1,
        CriadoPor    INT NULL,
        CriadoEm     DATETIME2 NOT NULL CONSTRAINT DF_Bairros_CriadoEm DEFAULT SYSUTCDATETIME(),
        AlteradoPor  INT NULL,
        AlteradoEm   DATETIME2 NULL,
        Versao       INT NOT NULL CONSTRAINT DF_Bairros_Versao DEFAULT 0,
        CONSTRAINT CK_Bairros_Nome CHECK (LEN(Nome) >= 2 AND Nome = LTRIM(RTRIM(Nome))),
        CONSTRAINT CK_Bairros_Cidade CHECK (LEN(Cidade) >= 2 AND Cidade = LTRIM(RTRIM(Cidade))),
        CONSTRAINT CK_Bairros_UF CHECK (UF COLLATE Latin1_General_BIN LIKE N'[A-Z][A-Z]'),
        CONSTRAINT CK_Bairros_Ponto CHECK ((Lat IS NULL AND Lng IS NULL)
            OR (Lat IS NOT NULL AND Lng IS NOT NULL AND Lat BETWEEN -90 AND 90 AND Lng BETWEEN -180 AND 180))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_Bairros_NomeCidade' AND object_id = OBJECT_ID(N'dbo.Bairros'))
    CREATE UNIQUE INDEX UQ_Bairros_NomeCidade ON dbo.Bairros (Nome, Cidade, UF) WHERE Ativo = 1;
GO

-- ---- o endereço do membro em linhas ----
IF COL_LENGTH('dbo.MembroReferencia', 'EnderecoLogradouro') IS NULL
    ALTER TABLE dbo.MembroReferencia ADD EnderecoLogradouro NVARCHAR(200) NULL;
GO
IF COL_LENGTH('dbo.MembroReferencia', 'EnderecoNumero') IS NULL
    ALTER TABLE dbo.MembroReferencia ADD EnderecoNumero NVARCHAR(20) NULL;
GO
IF COL_LENGTH('dbo.MembroReferencia', 'EnderecoComplemento') IS NULL
    ALTER TABLE dbo.MembroReferencia ADD EnderecoComplemento NVARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.MembroReferencia', 'EnderecoBairroId') IS NULL
    ALTER TABLE dbo.MembroReferencia ADD EnderecoBairroId INT NULL CONSTRAINT FK_MembroReferencia_Bairro REFERENCES dbo.Bairros(BairroId);
GO
IF COL_LENGTH('dbo.MembroReferencia', 'EnderecoBairroTexto') IS NULL
    ALTER TABLE dbo.MembroReferencia ADD EnderecoBairroTexto NVARCHAR(150) NULL;
GO
IF COL_LENGTH('dbo.MembroReferencia', 'EnderecoCidade') IS NULL
    ALTER TABLE dbo.MembroReferencia ADD EnderecoCidade NVARCHAR(150) NULL;
GO
IF COL_LENGTH('dbo.MembroReferencia', 'EnderecoUF') IS NULL
    ALTER TABLE dbo.MembroReferencia ADD EnderecoUF NCHAR(2) NULL;
GO
IF COL_LENGTH('dbo.MembroReferencia', 'EnderecoCep') IS NULL
    ALTER TABLE dbo.MembroReferencia ADD EnderecoCep NCHAR(9) NULL;
GO
-- o bairro é da lista OU escrito (fila "bairros a cadastrar"), nunca os dois
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_MembroReferencia_BairroUmSo')
    ALTER TABLE dbo.MembroReferencia ADD CONSTRAINT CK_MembroReferencia_BairroUmSo CHECK (EnderecoBairroId IS NULL OR EnderecoBairroTexto IS NULL);
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_MembroReferencia_EnderecoUF')
    ALTER TABLE dbo.MembroReferencia ADD CONSTRAINT CK_MembroReferencia_EnderecoUF CHECK (EnderecoUF IS NULL OR EnderecoUF COLLATE Latin1_General_BIN LIKE N'[A-Z][A-Z]');
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_MembroReferencia_EnderecoCep')
    ALTER TABLE dbo.MembroReferencia ADD CONSTRAINT CK_MembroReferencia_EnderecoCep CHECK (EnderecoCep IS NULL OR EnderecoCep LIKE N'[0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9]');
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MembroReferencia_Bairro' AND object_id = OBJECT_ID(N'dbo.MembroReferencia'))
    CREATE INDEX IX_MembroReferencia_Bairro ON dbo.MembroReferencia (EnderecoBairroId) WHERE EnderecoBairroId IS NOT NULL;
GO

-- ---- o ponto das Extensões ----
IF COL_LENGTH('dbo.ExtensoesTenda', 'Lat') IS NULL
    ALTER TABLE dbo.ExtensoesTenda ADD Lat DECIMAL(9,6) NULL;
GO
IF COL_LENGTH('dbo.ExtensoesTenda', 'Lng') IS NULL
    ALTER TABLE dbo.ExtensoesTenda ADD Lng DECIMAL(9,6) NULL;
GO
IF COL_LENGTH('dbo.ExtensoesTenda', 'PontoMarcadoPor') IS NULL
    ALTER TABLE dbo.ExtensoesTenda ADD PontoMarcadoPor INT NULL;
GO
IF COL_LENGTH('dbo.ExtensoesTenda', 'PontoMarcadoEm') IS NULL
    ALTER TABLE dbo.ExtensoesTenda ADD PontoMarcadoEm DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_ExtensoesTenda_Ponto')
    ALTER TABLE dbo.ExtensoesTenda ADD CONSTRAINT CK_ExtensoesTenda_Ponto CHECK ((Lat IS NULL AND Lng IS NULL)
        OR (Lat IS NOT NULL AND Lng IS NOT NULL AND Lat BETWEEN -90 AND 90 AND Lng BETWEEN -180 AND 180));
GO

-- ---- os parâmetros (uma linha só) ----
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.TerritorioParametros') AND type = N'U')
BEGIN
    CREATE TABLE dbo.TerritorioParametros (
        Id                 TINYINT NOT NULL CONSTRAINT PK_TerritorioParametros PRIMARY KEY CONSTRAINT CK_TerritorioParametros_Id CHECK (Id = 1),
        RaioCoberturaKm    DECIMAL(5,2) NOT NULL CONSTRAINT DF_TerritorioParametros_Raio DEFAULT 3
                               CONSTRAINT CK_TerritorioParametros_Raio CHECK (RaioCoberturaKm BETWEEN 0.1 AND 100),
        CriteriosSemeados  BIT NOT NULL CONSTRAINT DF_TerritorioParametros_Semeados DEFAULT 0,
        AlteradoPor        INT NULL,
        AlteradoEm         DATETIME2 NULL,
        Versao             INT NOT NULL CONSTRAINT DF_TerritorioParametros_Versao DEFAULT 0
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM dbo.TerritorioParametros WHERE Id = 1)
    INSERT INTO dbo.TerritorioParametros (Id) VALUES (1);
GO

-- ---- a tabela de critérios da simulação de emancipação ----
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.CriteriosEmancipacao') AND type = N'U')
BEGIN
    CREATE TABLE dbo.CriteriosEmancipacao (
        CriterioId   INT IDENTITY CONSTRAINT PK_CriteriosEmancipacao PRIMARY KEY,
        Indicador    NVARCHAR(30) NOT NULL CONSTRAINT CK_CriteriosEmancipacao_Indicador CHECK (Indicador IN (
                         N'MESES_ABERTA', N'MEMBROS_EM_COMUNHAO', N'ENCARREGADO_EM_COMUNHAO', N'OBREIROS', N'DIZIMO_MEDIO_12M',
                         N'DIZIMISTAS_12M', N'DISTANCIA_MAE_KM', N'NIVEL_PSC_MAE')),
        Operador     NVARCHAR(10) NOT NULL CONSTRAINT CK_CriteriosEmancipacao_Operador CHECK (Operador IN (N'MINIMO', N'MAXIMO', N'SIM')),
        Valor        DECIMAL(12,2) NULL,
        Ativo        BIT NOT NULL CONSTRAINT DF_CriteriosEmancipacao_Ativo DEFAULT 1,
        Ordem        INT NOT NULL CONSTRAINT DF_CriteriosEmancipacao_Ordem DEFAULT 0 CONSTRAINT CK_CriteriosEmancipacao_Ordem CHECK (Ordem BETWEEN 0 AND 999),
        Observacao   NVARCHAR(300) NULL,
        CriadoPor    INT NULL,
        CriadoEm     DATETIME2 NOT NULL CONSTRAINT DF_CriteriosEmancipacao_CriadoEm DEFAULT SYSUTCDATETIME(),
        AlteradoPor  INT NULL,
        AlteradoEm   DATETIME2 NULL,
        Versao       INT NOT NULL CONSTRAINT DF_CriteriosEmancipacao_Versao DEFAULT 0,
        -- o de sim/não só aceita "precisa ser sim" (sem valor); os de número, "pelo menos" ou "no máximo" com um valor não negativo
        CONSTRAINT CK_CriteriosEmancipacao_Forma CHECK (
            (Indicador = N'ENCARREGADO_EM_COMUNHAO' AND Operador = N'SIM' AND Valor IS NULL)
            OR (Indicador <> N'ENCARREGADO_EM_COMUNHAO' AND Operador IN (N'MINIMO', N'MAXIMO') AND Valor IS NOT NULL AND Valor >= 0))
    );
END
GO

-- a régua inicial (sugerida em 06/11/2026; o responsável muda ou apaga): semeada uma vez só — apagar as linhas não as faz voltar no próximo deploy
IF EXISTS (SELECT 1 FROM dbo.TerritorioParametros WHERE Id = 1 AND CriteriosSemeados = 0)
BEGIN
    BEGIN TRANSACTION;
    IF NOT EXISTS (SELECT 1 FROM dbo.CriteriosEmancipacao)
        INSERT INTO dbo.CriteriosEmancipacao (Indicador, Operador, Valor, Ativo, Ordem, Observacao) VALUES
            (N'MESES_ABERTA', N'MINIMO', 24, 1, 10, N'Régua inicial sugerida em 06/11/2026: 2 anos de aberta.'),
            (N'MEMBROS_EM_COMUNHAO', N'MINIMO', 50, 1, 20, N'Régua inicial sugerida em 06/11/2026.'),
            (N'ENCARREGADO_EM_COMUNHAO', N'SIM', NULL, 1, 30, N'Régua inicial sugerida em 06/11/2026.'),
            (N'OBREIROS', N'MINIMO', 1, 1, 40, N'Régua inicial sugerida em 06/11/2026: ao menos 1 obreiro consagrado.'),
            (N'DIZIMO_MEDIO_12M', N'MINIMO', 3000, 1, 50, N'Régua inicial sugerida em 06/11/2026: R$ 3.000 por mês na média de 12 meses.');
    UPDATE dbo.TerritorioParametros SET CriteriosSemeados = 1 WHERE Id = 1;
    COMMIT TRANSACTION;
END
GO
