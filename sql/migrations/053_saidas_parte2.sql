-- ============================================================
-- Migração 053 — v4.5 (segunda parte, 2/2): verificação de pagamento
-- duplicado, exigência de 3 cotações acima de um valor de referência
-- (Reg. Art. 62), e Fundo Fixo de Caixa (petty cash) por congregação.
-- ============================================================

-- Parâmetro único e configurável (nunca hardcoded) — valor a partir do
-- qual uma Saída exige 3 cotações anexadas antes de poder ser solicitada.
IF OBJECT_ID(N'dbo.ParametrosSaida', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ParametrosSaida (
        ParametroId               INT NOT NULL PRIMARY KEY CHECK (ParametroId = 1),
        ValorReferenciaCotacoes   DECIMAL(10,2) NOT NULL DEFAULT 1000.00
    );
    INSERT INTO dbo.ParametrosSaida (ParametroId, ValorReferenciaCotacoes) VALUES (1, 1000.00);
END
GO

-- 3 cotações obrigatórias (Reg. Art. 62) acima do valor de referência —
-- anexadas já na solicitação, cada uma com o documento do orçamento.
IF OBJECT_ID(N'dbo.SaidaCotacoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SaidaCotacoes (
        CotacaoId       INT IDENTITY PRIMARY KEY,
        SaidaId         INT NOT NULL REFERENCES dbo.SaidasTesouraria(SaidaId),
        FornecedorNome  NVARCHAR(200) NOT NULL,
        Valor           DECIMAL(10,2) NOT NULL,
        DocumentoUrl    NVARCHAR(500) NOT NULL,
        CriadoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Fundo Fixo de Caixa — teto de valor + custodiante responsável, pra
-- despesa miúda sem precisar da alçada cheia de uma Saída normal. Saldo
-- nunca é coluna própria — sempre CALCULADO NA LEITURA (soma de
-- reposições menos soma de despesas), mesmo princípio de sempre.
IF OBJECT_ID(N'dbo.FundosFixosCaixa', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FundosFixosCaixa (
        FundoId        INT IDENTITY PRIMARY KEY,
        CongregacaoId  INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        ValorTeto      DECIMAL(10,2) NOT NULL,
        CustodiantePor INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Status         NVARCHAR(20) NOT NULL DEFAULT 'ATIVO', -- ATIVO | ENCERRADO
        CriadoPor      INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_FundoFixo_Congregacao UNIQUE (CongregacaoId)
    );
END
GO

IF OBJECT_ID(N'dbo.FundoFixoMovimentos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FundoFixoMovimentos (
        MovimentoId    INT IDENTITY PRIMARY KEY,
        FundoId        INT NOT NULL REFERENCES dbo.FundosFixosCaixa(FundoId),
        Tipo           NVARCHAR(20) NOT NULL, -- DESPESA | REPOSICAO
        Valor          DECIMAL(10,2) NOT NULL,
        Descricao      NVARCHAR(300) NOT NULL,
        DocumentoUrl   NVARCHAR(500) NOT NULL, -- recibo (despesa) ou comprovante (reposição)
        RegistradoPor  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO
