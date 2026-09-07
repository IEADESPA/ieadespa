-- ============================================================
-- Migração 043 — v4.1: Tesouraria Local e Repasses (Art. 118). Digitaliza
-- o "bloco de dízimo" físico: lançamentos de entrada por congregação,
-- fechamento mensal com rateio 40%/60% SEMPRE calculado (nunca digitado),
-- e registro do repasse à Tesouraria Geral. Perfis territoriais de acesso
-- (Local/Área/Região/Quadrante/Distrito) seguem o mesmo motor Papel×Escopo
-- já usado pelos órgãos territoriais (migration 041) — "Tesoureiro Geral"
-- (GLOBAL) já existe desde a 002/005.
-- ============================================================

-- Parâmetros financeiros por congregação (editável, nunca hardcoded —
-- Art. 118 fixa 40/60 hoje, mas aluguel/lote variam por local).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Congregacoes') AND name = N'ValorAluguelMensal')
    ALTER TABLE dbo.Congregacoes ADD ValorAluguelMensal DECIMAL(10,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Congregacoes') AND name = N'ValorLoteMensal')
    ALTER TABLE dbo.Congregacoes ADD ValorLoteMensal DECIMAL(10,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Congregacoes') AND name = N'PercentualRetencaoLocal')
    ALTER TABLE dbo.Congregacoes ADD PercentualRetencaoLocal DECIMAL(5,2) NOT NULL DEFAULT 40.00;
GO

-- Cadastro de dizimistas (substitui a planilha) — pode ou não ser membro
-- cadastrado no sistema (visitante fiel, cônjuge não-membro etc.)
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Dizimistas') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Dizimistas (
        DizimistaId    INT IDENTITY PRIMARY KEY,
        CongregacaoId  INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        Nome           NVARCHAR(200) NOT NULL,
        MembroId       INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Ativo          BIT NOT NULL DEFAULT 1,
        CriadoEm       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Lançamentos de entrada (o "bloco de dízimo" digital — Termo nº sequencial,
-- nunca digitado à mão, gerado por shared/tesouraria.js::proximoNumeroTermo)
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.LancamentosTesouraria') AND type = N'U')
BEGIN
    CREATE TABLE dbo.LancamentosTesouraria (
        LancamentoId     INT IDENTITY PRIMARY KEY,
        CongregacaoId    INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        DizimistaId      INT NULL REFERENCES dbo.Dizimistas(DizimistaId),
        NomeAvulso       NVARCHAR(200) NULL,
        TermoNumero      INT NOT NULL,
        Tipo             NVARCHAR(20) NOT NULL,   -- DIZIMO | OFERTA
        Valor            DECIMAL(10,2) NOT NULL,
        FormaPagamento   NVARCHAR(20) NOT NULL,   -- DINHEIRO | PIX
        ComprovanteUrl   NVARCHAR(500) NULL,
        MesReferencia    CHAR(7) NOT NULL,        -- 'YYYY-MM'
        FechamentoId     INT NULL,                -- preenchido quando o mês fecha (trava edição)
        RegistradoPor    INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm         DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Fechamento mensal — o cálculo nunca é digitado, é derivado dos lançamentos
-- (Art. 118: retenção local + repasse geral)
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.FechamentosTesouraria') AND type = N'U')
BEGIN
    CREATE TABLE dbo.FechamentosTesouraria (
        FechamentoId            INT IDENTITY PRIMARY KEY,
        CongregacaoId           INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        MesReferencia           CHAR(7) NOT NULL,
        TotalRecebido           DECIMAL(10,2) NOT NULL,
        ValorAluguel            DECIMAL(10,2) NOT NULL DEFAULT 0,
        ValorLote               DECIMAL(10,2) NOT NULL DEFAULT 0,
        TotalFinal              DECIMAL(10,2) NOT NULL,
        PercentualRetencaoLocal DECIMAL(5,2) NOT NULL,
        ValorRetidoLocal        DECIMAL(10,2) NOT NULL,
        ValorRepasseGeral       DECIMAL(10,2) NOT NULL,
        Status                  NVARCHAR(20) NOT NULL DEFAULT 'FECHADO', -- FECHADO | REPASSADO
        DataFechamento          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        FechadoPor              INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DataRepasse             DATETIME2 NULL,
        ComprovanteRepasseUrl   NVARCHAR(500) NULL,
        RepassadoPor            INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CONSTRAINT UQ_Fechamento_Congregacao_Mes UNIQUE (CongregacaoId, MesReferencia)
    );
END
GO

-- Perfis territoriais de acesso ao financeiro — mesmo padrão da migration 041
-- (Nivel = EscopoTipo esperado na Lideranca). "Tesoureiro Geral" (GLOBAL) já
-- existe desde a 002/005 com a permissão "financeiro".
IF NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = 'Tesoureiro Local')
    INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes) VALUES ('Tesoureiro Local', 'CONGREGACAO', 'financeiro');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = 'Tesoureiro de Área')
    INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes) VALUES ('Tesoureiro de Área', 'AREA', 'financeiro');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = 'Tesoureiro de Região')
    INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes) VALUES ('Tesoureiro de Região', 'REGIAO', 'financeiro');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = 'Tesoureiro de Quadrante')
    INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes) VALUES ('Tesoureiro de Quadrante', 'QUADRANTE', 'financeiro');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = 'Tesoureiro de Distrito')
    INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes) VALUES ('Tesoureiro de Distrito', 'DISTRITO', 'financeiro');
GO
