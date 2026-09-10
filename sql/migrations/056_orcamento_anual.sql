-- ============================================================
-- Migração 056 — v4.8 (primeira parte): Orçamento Anual + Orçado vs
-- Realizado + Empenho + Fluxo de Caixa Projetado. O Balanço Patrimonial
-- consolidado (também citado no roadmap original) fica pra v4.9
-- (Demonstrações Contábeis ITG 2002) — é uma demonstração contábil de
-- verdade, não o orçamento em si; mantém a v4.8 focada no motor
-- orçamentário. "Empenho" não vira tabela própria: é CALCULADO NA LEITURA
-- a partir das Saídas já aprovadas mas ainda não pagas (SaidasTesouraria
-- Status='APROVADA'), mesmo princípio de sempre — evita duplicar
-- lançamento do mesmo compromisso em dois lugares.
-- ============================================================

IF OBJECT_ID(N'dbo.OrcamentosAnuais', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.OrcamentosAnuais (
        OrcamentoId  INT IDENTITY PRIMARY KEY,
        Ano          INT NOT NULL UNIQUE,
        Status       NVARCHAR(20) NOT NULL DEFAULT 'ABERTO', -- ABERTO | ENCERRADO
        CriadoPor    INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.OrcamentoLinhas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.OrcamentoLinhas (
        OrcamentoLinhaId INT IDENTITY PRIMARY KEY,
        OrcamentoId      INT NOT NULL REFERENCES dbo.OrcamentosAnuais(OrcamentoId),
        TipoMovimento    NVARCHAR(10) NOT NULL, -- ENTRADA | SAIDA
        CategoriaCodigo  NVARCHAR(30) NOT NULL, -- Codigo de CategoriasEntrada ou CategoriasSaida, conforme TipoMovimento
        ValorOrcado      DECIMAL(12,2) NOT NULL,
        CONSTRAINT UQ_OrcamentoLinha UNIQUE (OrcamentoId, TipoMovimento, CategoriaCodigo)
    );
END
GO
