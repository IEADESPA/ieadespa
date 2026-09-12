-- ============================================================
-- Migração 061 — v4.11: Patrimônio, Alçadas e Depreciação.
-- Inventário físico anual (Reg. Art. 59/Art. 57), Teto de Alçada
-- Patrimonial (5% do PL, Art. 58 §1º do Estatuto), blindagem
-- patrimonial (assinatura conjunta Art. 31 + quarentena de 12 meses
-- Art. 58 §7º), registro de escrituras/títulos/alvarás/veículos/
-- contratos (2º/3º Secretários), depreciação de ativo fixo (método
-- linear, alimenta o Balanço Patrimonial da v4.9) e Casa Pastoral
-- como ativo com regra de ocupação (Reg. Art. 115).
-- ============================================================

-- Bens patrimoniais (inventário) — móveis, imóveis, veículos,
-- equipamentos, Casa Pastoral. Registrado em nome da Matriz (Art. 58).
-- Cada bem tem vida útil e valor residual pra depreciação LINEAR
-- (calculada na leitura, nunca lançada à mão).
IF OBJECT_ID(N'dbo.BensPatrimoniais', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.BensPatrimoniais (
        BemId            INT IDENTITY PRIMARY KEY,
        CongregacaoId    INT NULL REFERENCES dbo.Congregacoes(CongregacaoId), -- NULL = Sede/Matriz
        Tipo             NVARCHAR(30) NOT NULL, -- IMOVEL | VEICULO | EQUIPAMENTO | MOVEL | CASA_PASTORAL | OUTROS
        Descricao        NVARCHAR(300) NOT NULL,
        ValorAquisicao   DECIMAL(12,2) NOT NULL,
        DataAquisicao    DATE NOT NULL,
        VidaUtilMeses    INT NULL,
        ValorResidual    DECIMAL(12,2) NULL,
        EhTemploSede     BIT NOT NULL DEFAULT 0,
        Status           NVARCHAR(20) NOT NULL DEFAULT 'ATIVO', -- ATIVO | BAIXADO | ALIENADO
        RegistradoPor    INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm         DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Documentos patrimoniais (escrituras, títulos, alvarás, veículos,
-- contratos) sob guarda dos 2º/3º Secretários (Reg. Art. 57, III;
-- Art. 31, II — assinatura conjunta nos atos administrativos).
IF OBJECT_ID(N'dbo.BensDocumentos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.BensDocumentos (
        DocumentoBemId    INT IDENTITY PRIMARY KEY,
        BemId             INT NULL REFERENCES dbo.BensPatrimoniais(BemId),
        TipoDocumento     NVARCHAR(30) NOT NULL, -- ESCRITURA | TITULO | ALVARA | VEICULO | CONTRATO | IPTU | OUTROS
        Descricao         NVARCHAR(300) NOT NULL,
        ResponsavelCargo  NVARCHAR(30) NOT NULL, -- SECRETARIO_2 | SECRETARIO_3
        DocumentoUrl      NVARCHAR(500) NOT NULL,
        RegistradoPor     INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Alienação/venda de bens com rito de alçada (Art. 58 §1º): até o teto
-- (5% do PL) e sem ser Templo Sede → CLI; acima do teto ou Templo Sede
-- → Assembleia Geral. A quarentena patrimonial (Art. 58 §7º) trava
-- qualquer alienação de imóvel durante os 12 meses.
IF OBJECT_ID(N'dbo.AlienacoesBens', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AlienacoesBens (
        AlienacaoId            INT IDENTITY PRIMARY KEY,
        BemId                  INT NOT NULL REFERENCES dbo.BensPatrimoniais(BemId),
        ValorProposto          DECIMAL(12,2) NOT NULL,
        TetoAlcadaPatrimonial  DECIMAL(12,2) NOT NULL, -- 5% do PL no momento da proposta
        AprovacaoNecessaria    NVARCHAR(20) NOT NULL,  -- CLI | ASSEMBLEIA (calculado)
        Status                 NVARCHAR(20) NOT NULL DEFAULT 'PROPOSTA', -- PROPOSTA | AUTORIZADA_CLI | AUTORIZADA_ASSEMBLEIA | REJEITADA | CONCLUIDA
        PropostoPor            INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AprovadoPor            INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AtaUrl                 NVARCHAR(500) NULL, -- ata da deliberação (CLI ou Assembleia)
        Motivo                 NVARCHAR(300) NULL,
        CriadoEm               DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        AprovadoEm             DATETIME2 NULL
    );
END
GO

-- Quarentena patrimonial (Art. 58 §7º): 12 meses vedando alienação de
-- imóvel após posse de nova Diretoria por via diversa da eleição
-- ordinária, ou destituição de mais da metade dos membros.
IF OBJECT_ID(N'dbo.QuarentenasPatrimoniais', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.QuarentenasPatrimoniais (
        QuarentenaId   INT IDENTITY PRIMARY KEY,
        Motivo         NVARCHAR(300) NOT NULL,
        DataInicio     DATE NOT NULL,
        DataFim        DATE NOT NULL, -- DataInicio + 12 meses
        RegistradoPor  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Inventário físico anual (dezembro — Reg. Art. 59, I/II): cada
-- congregação/departamento abre o inventário do ano e relaciona cada bem
-- com estado de conservação e presença física.
IF OBJECT_ID(N'dbo.InventariosAnuais', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.InventariosAnuais (
        InventarioId    INT IDENTITY PRIMARY KEY,
        AnoReferencia   INT NOT NULL,
        CongregacaoId   INT NULL REFERENCES dbo.Congregacoes(CongregacaoId), -- NULL = consolidado Sede
        Status          NVARCHAR(20) NOT NULL DEFAULT 'ABERTO', -- ABERTO | CONCLUIDO
        RegistradoPor   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_Inventario_AnoCong UNIQUE (AnoReferencia, CongregacaoId)
    );
END
GO

IF OBJECT_ID(N'dbo.InventarioItens', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.InventarioItens (
        InventarioItemId    INT IDENTITY PRIMARY KEY,
        InventarioId        INT NOT NULL REFERENCES dbo.InventariosAnuais(InventarioId),
        BemId               INT NOT NULL REFERENCES dbo.BensPatrimoniais(BemId),
        EstadoConservacao   NVARCHAR(30) NOT NULL, -- BOM | REGULAR | RUIM | INSERVIVEL
        Presente            BIT NOT NULL DEFAULT 1,
        Observacao          NVARCHAR(300) NULL,
        CONSTRAINT UQ_InventarioItem_Bem UNIQUE (InventarioId, BemId)
    );
END
GO

-- Casa Pastoral como ativo com regra de ocupação (Reg. Art. 115):
-- uso exclusivo do Dirigente Titular durante o mandato, vedada cessão a
-- terceiros, destituição automática por uso irregular ("gato" de luz-água).
IF OBJECT_ID(N'dbo.CasaPastoralOcupacoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CasaPastoralOcupacoes (
        OcupacaoId          INT IDENTITY PRIMARY KEY,
        BemId               INT NOT NULL REFERENCES dbo.BensPatrimoniais(BemId), -- bem Tipo = CASA_PASTORAL
        CongregacaoId       INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        OcupanteMembroId    INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId), -- Dirigente Titular
        DataInicio          DATE NOT NULL,
        DataFim             DATE NULL,
        Status              NVARCHAR(20) NOT NULL DEFAULT 'ATIVA', -- ATIVA | ENCERRADA | DESTITUIDA
        MotivoDestituicao   NVARCHAR(300) NULL,
        RegistradoPor       INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

