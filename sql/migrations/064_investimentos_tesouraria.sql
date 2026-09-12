-- ============================================================
-- Migração 064 — v4.14: Gestão de Investimentos e Tesouraria Avançada
-- (nível "pico") + cash pooling.
-- Reg. Art. 64: o Fundo de Reserva (0,2% das entradas líquidas, Estatuto
-- Art. 60) não pode ficar parado em conta sem rendimento — deve ser
-- aplicado em ativos de baixo risco e liquidez imediata (Títulos Públicos,
-- CDB de grandes instituições, Fundos de Renda Fixa DI); vedada renda
-- variável/cripto/alto risco (§2º). Meta de liquidez: 3 meses de despesas.
-- ============================================================

-- Aplicações financeiras do Fundo de Reserva (CDB, poupança, fundos, títulos).
IF OBJECT_ID(N'dbo.AplicacoesFinanceiras', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AplicacoesFinanceiras (
        AplicacaoId    INT IDENTITY PRIMARY KEY,
        FonteId        INT NULL REFERENCES dbo.FontesCaixa(FonteId),
        Tipo           NVARCHAR(30) NOT NULL, -- CDB | POUPANCA | FUNDO_RENDA_FIXA | TITULO_PUBLICO | OUTROS
        Instituicao    NVARCHAR(150) NOT NULL,
        ValorAplicado  DECIMAL(12,2) NOT NULL,
        TaxaAnual      DECIMAL(7,4) NULL, -- % ao ano (para cálculo na leitura)
        DataAplicacao  DATE NOT NULL,
        DataVencimento DATE NULL,
        Liquidez       NVARCHAR(20) NOT NULL DEFAULT 'NO_VENCIMENTO', -- DIARIA | D30 | D90 | NO_VENCIMENTO
        Status         NVARCHAR(20) NOT NULL DEFAULT 'ATIVA', -- ATIVA | RESGATADA | VENCIDA
        Observacao     NVARCHAR(300) NULL,
        RegistradoPor  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Resgates parciais/totais de aplicações.
IF OBJECT_ID(N'dbo.ResgatesAplicacoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ResgatesAplicacoes (
        ResgateId      INT IDENTITY PRIMARY KEY,
        AplicacaoId    INT NOT NULL REFERENCES dbo.AplicacoesFinanceiras(AplicacaoId),
        ValorResgatado DECIMAL(12,2) NOT NULL,
        DataResgate    DATE NOT NULL,
        RegistradoPor  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Cash pooling: marca a fonte centralizadora (a conta que concentra o caixa).
IF COL_LENGTH(N'dbo.FontesCaixa', N'Centralizadora') IS NULL
    ALTER TABLE dbo.FontesCaixa ADD Centralizadora BIT NOT NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM dbo.FontesCaixa WHERE Centralizadora = 1)
    UPDATE dbo.FontesCaixa SET Centralizadora = 1
    WHERE FonteId = (SELECT MIN(FonteId) FROM dbo.FontesCaixa WHERE Tipo = 'CONTA_BANCARIA');
GO

-- Movimentos de concentração/desconcentração entre fontes e a centralizadora.
IF OBJECT_ID(N'dbo.CashPoolingMovimentos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CashPoolingMovimentos (
        MovimentoId    INT IDENTITY PRIMARY KEY,
        FonteOrigemId  INT NOT NULL REFERENCES dbo.FontesCaixa(FonteId),
        FonteDestinoId INT NOT NULL REFERENCES dbo.FontesCaixa(FonteId),
        Valor          DECIMAL(12,2) NOT NULL,
        DataMovimento  DATE NOT NULL,
        Tipo           NVARCHAR(20) NOT NULL, -- CONCENTRACAO | DESCONCENTRACAO
        Observacao     NVARCHAR(300) NULL,
        RegistradoPor  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO
