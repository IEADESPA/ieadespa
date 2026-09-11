-- ============================================================
-- Migração 051 — v4.4.1: correção de rumo (feedback direto do usuário).
-- Sorteio NÃO é um "Tipo" da própria Campanha com número individual
-- vendido pelo sistema: os cupons são físicos, confeccionados em gráfica,
-- e vendidos pra qualquer pessoa (não só membro/dizimista cadastrado) — o
-- sistema não tem como nem deve controlar um pool de números. Sorteio
-- agora é um DERIVADO de uma Campanha (uma campanha pode ter zero, um ou
-- vários sorteios ligados a ela): o que diferencia um sorteio de uma
-- arrecadação simples são os PRÊMIOS. O resultado do sorteio (quem
-- ganhou) é registrado depois, manualmente, porque o sorteio em si
-- acontece fisicamente (gráfica/evento), fora do sistema.
-- ============================================================

-- Modelo antigo (v4.4 inicial) descartado: número individual de cupom
-- controlado pelo sistema não fazia sentido pra cupom físico vendido ao
-- público em geral.
IF OBJECT_ID(N'dbo.CampanhaSorteioNumeros', N'U') IS NOT NULL
    DROP TABLE dbo.CampanhaSorteioNumeros;
GO

IF OBJECT_ID(N'dbo.Sorteios', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Sorteios (
        SorteioId     INT IDENTITY PRIMARY KEY,
        CampanhaId    INT NOT NULL REFERENCES dbo.Campanhas(CampanhaId),
        Nome          NVARCHAR(200) NOT NULL,
        Descricao     NVARCHAR(500) NULL,
        PrecoCupom    DECIMAL(10,2) NULL, -- informativo (cupom é físico; não há venda individual pelo sistema)
        DataSorteio   DATE NULL,
        Status        NVARCHAR(20) NOT NULL DEFAULT 'ATIVO', -- ATIVO | REALIZADO | CANCELADO
        CriadoPor     INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Prêmios é o que diferencia um sorteio de uma campanha comum — cada
-- sorteio pode ter vários (1º prêmio, 2º prêmio...), e o ganhador de cada
-- um é preenchido manualmente depois do sorteio físico acontecer.
IF OBJECT_ID(N'dbo.SorteioPremios', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SorteioPremios (
        SorteioPremioId INT IDENTITY PRIMARY KEY,
        SorteioId       INT NOT NULL REFERENCES dbo.Sorteios(SorteioId),
        Ordem           INT NOT NULL,
        Descricao       NVARCHAR(300) NOT NULL,
        NomeGanhador    NVARCHAR(200) NULL,
        RegistradoEm    DATETIME2 NULL,
        CONSTRAINT UQ_SorteioPremio_Ordem UNIQUE (SorteioId, Ordem)
    );
END
GO

-- Colunas que só faziam sentido no modelo antigo (Tipo/preço/resultado na
-- própria Campanha) saem daqui — dropar o default constraint auto-gerado
-- antes de dropar a coluna (nome não é previsível, precisa de SQL dinâmico).
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Campanhas') AND name = N'Tipo')
BEGIN
    DECLARE @nomeConstraint NVARCHAR(200);
    SELECT @nomeConstraint = dc.name FROM sys.default_constraints dc
        JOIN sys.columns c ON c.default_object_id = dc.object_id
        WHERE dc.parent_object_id = OBJECT_ID(N'dbo.Campanhas') AND c.name = 'Tipo';
    IF @nomeConstraint IS NOT NULL
        EXEC('ALTER TABLE dbo.Campanhas DROP CONSTRAINT ' + @nomeConstraint);
    ALTER TABLE dbo.Campanhas DROP COLUMN Tipo;
END
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Campanhas') AND name = N'PrecoNumeroSorteio')
    ALTER TABLE dbo.Campanhas DROP COLUMN PrecoNumeroSorteio;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Campanhas') AND name = N'NumeroVencedor')
    ALTER TABLE dbo.Campanhas DROP COLUMN NumeroVencedor;
GO
-- SorteadoPor tem FK pra MembroReferencia (REFERENCES inline na criação —
-- migração 050) — nome de constraint auto-gerado pelo SQL Server, não
-- previsível, então precisa de SQL dinâmico igual ao default constraint do
-- Tipo acima. Sem isso o DROP COLUMN falha com "one or more objects access
-- this column" (erro real que travou todo deploy desde 08/09 — a partir
-- daqui esta migração nunca tinha completado, e por isso as migrações
-- 052-059 também nunca tinham rodado em produção).
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Campanhas') AND name = N'SorteadoPor')
BEGIN
    DECLARE @nomeFk NVARCHAR(200);
    SELECT @nomeFk = fk.name
        FROM sys.foreign_keys fk
        JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
        JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
        WHERE fk.parent_object_id = OBJECT_ID(N'dbo.Campanhas') AND c.name = 'SorteadoPor';
    IF @nomeFk IS NOT NULL
        EXEC('ALTER TABLE dbo.Campanhas DROP CONSTRAINT ' + @nomeFk);
    ALTER TABLE dbo.Campanhas DROP COLUMN SorteadoPor;
END
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Campanhas') AND name = N'SorteadoEm')
    ALTER TABLE dbo.Campanhas DROP COLUMN SorteadoEm;
GO
