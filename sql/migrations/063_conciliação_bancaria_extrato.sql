-- ============================================================
-- Migração 063 — v4.13: Conciliação Bancária por Importação de Extrato.
-- Em vez de integrar com Open Finance (API paga/regulada, com tarifa),
-- a Tesouraria importa o extrato que o próprio banco já fornece de graça
-- (OFX/CSV, baixado do internet banking) e o sistema cruza automaticamente
-- contra Entradas/Saídas, apontando só as divergências reais.
-- Duas trilhas: CONTA_BANCARIA (extrato) e CAIXA_FISICO (cofre — dinheiro
-- vivo não passa pelo banco, é conciliado contra o Fundo Fixo de Caixa).
-- ============================================================

-- Fontes de caixa (catálogo): contas bancárias + cofre físico.
IF OBJECT_ID(N'dbo.FontesCaixa', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FontesCaixa (
        FonteId    INT IDENTITY PRIMARY KEY,
        Nome       NVARCHAR(150) NOT NULL,
        Tipo       NVARCHAR(20) NOT NULL, -- CONTA_BANCARIA | CAIXA_FISICO
        Ativa      BIT NOT NULL DEFAULT 1
    );
    INSERT INTO dbo.FontesCaixa (Nome, Tipo) VALUES
        (N'Conta Bancária Única', 'CONTA_BANCARIA'),
        (N'Caixa Físico (Cofre)', 'CAIXA_FISICO');
END
GO

-- Cabeçalho de cada extrato importado (arquivo original guardado no Blob).
IF OBJECT_ID(N'dbo.ExtratosBancarios', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ExtratosBancarios (
        ExtratoId      INT IDENTITY PRIMARY KEY,
        FonteId        INT NOT NULL REFERENCES dbo.FontesCaixa(FonteId),
        MesReferencia  CHAR(7) NOT NULL,
        TipoArquivo    NVARCHAR(10) NOT NULL, -- OFX | CSV
        ArquivoUrl     NVARCHAR(500) NOT NULL,
        SaldoFinal     DECIMAL(12,2) NULL,
        TotalLinhas    INT NOT NULL DEFAULT 0,
        ImportadoPor   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Linhas do extrato (cada movimentação importada).
IF OBJECT_ID(N'dbo.ExtratoLinhas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ExtratoLinhas (
        LinhaId        INT IDENTITY PRIMARY KEY,
        ExtratoId      INT NOT NULL REFERENCES dbo.ExtratosBancarios(ExtratoId),
        DataLancamento DATE NOT NULL,
        Valor          DECIMAL(12,2) NOT NULL, -- positivo = crédito, negativo = débito
        Historico      NVARCHAR(300) NULL,
        Identificador  NVARCHAR(100) NULL
    );
END
GO

-- Resultado da conciliação por fonte + mês.
IF OBJECT_ID(N'dbo.ConciliacoesBancarias', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ConciliacoesBancarias (
        ConciliacaoId INT IDENTITY PRIMARY KEY,
        FonteId       INT NOT NULL REFERENCES dbo.FontesCaixa(FonteId),
        MesReferencia CHAR(7) NOT NULL,
        Status        NVARCHAR(20) NOT NULL DEFAULT 'ABERTO', -- ABERTO | BATIDO | DIVERGENTE
        TotalExtrato  DECIMAL(12,2) NOT NULL DEFAULT 0,
        TotalSistema  DECIMAL(12,2) NOT NULL DEFAULT 0,
        TotalBatidas  DECIMAL(12,2) NOT NULL DEFAULT 0,
        ConcluidoPor  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        ConcluidoEm   DATETIME2 NULL,
        CONSTRAINT UQ_Conciliacao_FonteMes UNIQUE (FonteId, MesReferencia)
    );
END
GO

-- Divergências apontadas (o que não bateu) pra resolução manual.
IF OBJECT_ID(N'dbo.ConciliacaoDivergencias', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ConciliacaoDivergencias (
        DivergenciaId   INT IDENTITY PRIMARY KEY,
        ConciliacaoId   INT NOT NULL REFERENCES dbo.ConciliacoesBancarias(ConciliacaoId),
        Tipo            NVARCHAR(20) NOT NULL, -- SO_BANCO | SO_SISTEMA
        Valor           DECIMAL(12,2) NOT NULL,
        Referencia      NVARCHAR(300) NULL,
        LinhaExtratoId  INT NULL REFERENCES dbo.ExtratoLinhas(LinhaId),
        LancamentoId    INT NULL REFERENCES dbo.LancamentosTesouraria(LancamentoId),
        SaidaId         INT NULL REFERENCES dbo.SaidasTesouraria(SaidaId),
        Status          NVARCHAR(20) NOT NULL DEFAULT 'PENDENTE', -- PENDENTE | RESOLVIDA
        ResolvidoPor    INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ResolvidoEm     DATETIME2 NULL
    );
END
GO
