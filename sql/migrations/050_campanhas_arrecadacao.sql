-- ============================================================
-- Migração 050 — v4.4: Campanhas de Arrecadação com Meta (Reforma do
-- Templo, Congresso, etc.) e Sorteios integrados como um tipo de campanha.
-- Meta pode ser personalizada por congregação (Congregação A: R$1.000,
-- Congregação B: R$500) — a meta geral da campanha e o total arrecadado
-- são sempre CALCULADOS NA LEITURA a partir das metas por congregação e
-- dos LancamentosTesouraria vinculados, nunca digitados à mão. Toda
-- campanha nasce com fundo RESTRITO (v4.2) — o dinheiro só pode ser
-- gasto na finalidade da campanha quando as Saídas (v4.5) existirem.
-- ============================================================

IF OBJECT_ID(N'dbo.Campanhas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Campanhas (
        CampanhaId          INT IDENTITY PRIMARY KEY,
        Nome                NVARCHAR(200) NOT NULL,
        Descricao           NVARCHAR(500) NULL,
        Tipo                NVARCHAR(20) NOT NULL DEFAULT 'ARRECADACAO', -- ARRECADACAO | SORTEIO
        DataInicio          DATE NOT NULL,
        DataFim             DATE NULL,
        Status              NVARCHAR(20) NOT NULL DEFAULT 'ATIVA', -- ATIVA | ENCERRADA | CANCELADA
        PrecoNumeroSorteio  DECIMAL(10,2) NULL, -- só p/ Tipo=SORTEIO
        NumeroVencedor      INT NULL,
        SorteadoPor         INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        SorteadoEm          DATETIME2 NULL,
        CriadoPor           INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.CampanhaMetas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CampanhaMetas (
        CampanhaMetaId  INT IDENTITY PRIMARY KEY,
        CampanhaId      INT NOT NULL REFERENCES dbo.Campanhas(CampanhaId),
        CongregacaoId   INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        MetaValor       DECIMAL(10,2) NOT NULL,
        CONSTRAINT UQ_CampanhaMeta_Congregacao UNIQUE (CampanhaId, CongregacaoId)
    );
END
GO

-- Numeração sequencial do "número da sorte" por campanha — mesmo princípio
-- do Termo nº (shared/tesouraria.js::proximoNumeroTermo): gerado pelo
-- servidor na venda, nunca digitado à mão, nunca reinicia.
IF OBJECT_ID(N'dbo.CampanhaSorteioNumeros', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CampanhaSorteioNumeros (
        NumeroSorteioId INT IDENTITY PRIMARY KEY,
        CampanhaId      INT NOT NULL REFERENCES dbo.Campanhas(CampanhaId),
        Numero          INT NOT NULL,
        LancamentoId    INT NOT NULL REFERENCES dbo.LancamentosTesouraria(LancamentoId),
        DizimistaId     INT NULL REFERENCES dbo.Dizimistas(DizimistaId),
        NomeAvulso      NVARCHAR(200) NULL,
        Sorteado        BIT NOT NULL DEFAULT 0,
        CriadoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_CampanhaSorteioNumero UNIQUE (CampanhaId, Numero)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.LancamentosTesouraria') AND name = N'CampanhaId')
    ALTER TABLE dbo.LancamentosTesouraria ADD CampanhaId INT NULL REFERENCES dbo.Campanhas(CampanhaId);
GO

-- Conta contábil e categoria de entrada próprias pra campanha (cobre tanto
-- arrecadação simples quanto venda de número de sorteio) — sempre restrita,
-- mesma lógica de Revista/Congresso (v4.2).
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '4.2.3')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '4.2.3', 'Entrada de Campanha de Arrecadação', 'RECEITA', ContaId FROM dbo.PlanoContas WHERE Codigo = '4.2';
GO

IF NOT EXISTS (SELECT 1 FROM dbo.CategoriasEntrada WHERE Codigo = 'CAMPANHA')
    INSERT INTO dbo.CategoriasEntrada (Codigo, Nome, TipoFundo, ContaContabilId)
    SELECT 'CAMPANHA', 'Entrada de Campanha (Arrecadação/Sorteio)', 'RESTRITO', ContaId FROM dbo.PlanoContas WHERE Codigo = '4.2.3';
GO
