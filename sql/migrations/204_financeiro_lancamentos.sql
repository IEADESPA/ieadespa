-- ============================================================
-- Migração 204 — FASE 10, Financeiro (módulo 2), incremento 3: LANÇAR DÍZIMOS E OFERTAS (tela aprovada r24 "r24-lancamento", opção 1).
--
-- 1. FinLancamentos: a folha do bloco preenchida. Cada folha tem no máximo um lançamento (UNIQUE na folha) e precisa existir em FinFolhas com
--    o destino LANCADA (a chave estrangeira na folha; o servidor grava as duas na mesma transação). A folha lançada já sem lançamento (a
--    semeadura da homologação e os roteiros das migrações 200 a 203) continua valendo.
--    - O dia do lançamento (Dia) é escolhido na tela (hoje, ou um dia do mês anterior que a congregação ainda não mandou); a hora entra
--      sozinha (RegistradoEm).
--    - "Este mês" ou "Mês posterior" (Referente): só esses dois existem (ninguém marca "mês anterior"). O mês em que a folha soma (MesSoma) é
--      o do dia ou o seguinte, e o banco confere a conta.
--    - A folha marcada "mês posterior" fica sem o nome e sem o valor (a regra dele de 20/11: o nome e o valor vêm na planilha do mês
--      seguinte, obrigatórios); quando chegam, ficam PreenchidoPor e PreenchidoEm. A folha "este mês" tem sempre o tipo, a forma e o valor.
--    - Quem deu: um membro do cadastro (MembroId) ou o nome digitado (NomeDigitado), nunca os dois; o dízimo sempre tem um deles; a oferta
--      pode ir sem nome. A oferta voluntária junto do dízimo é a coluna Voluntaria (só no dízimo).
--    - A entrega a que a folha pertence (SaidaId) aponta para uma SAÍDA do mesmo bloco (a chave composta da 202).
--    - Dinheiro em DECIMAL(14,2), sempre positivo.
-- 2. FinLancamentosCorrecoes: a correção do lançamento (a regra da r27: "nada de estorno com nota nova; a trilha guarda o valor antigo, o
--    novo, o motivo e quem"). O lançamento muda na própria linha e cada correção fica aqui, com o antes e o depois; nada se apaga.
-- 3. FinRelatoriosMes: só o ponto de encaixe de "a congregação mandou o relatório do mês" (a regra dele: o mês anterior recebe lançamento
--    enquanto a congregação não mandou aquele relatório). O envio e o fechamento do mês vêm com o desenho deles; aqui nada grava ainda.
--
-- Idempotente: cada tabela e cada índice só é criado se ainda não existir.
-- ============================================================

-- ---- 1. os lançamentos ----

IF OBJECT_ID(N'dbo.FinLancamentos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FinLancamentos (
        LancamentoId   INT IDENTITY PRIMARY KEY,
        CongregacaoId  INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        BlocoId        INT NOT NULL REFERENCES dbo.FinBlocos(BlocoId),
        Folha          INT NOT NULL REFERENCES dbo.FinFolhas(Folha),
        SaidaId        INT NOT NULL,
        SaidaTipo      AS CAST(N'SAIDA' AS NVARCHAR(10)) PERSISTED,
        Dia            DATE NOT NULL,
        Referente      NVARCHAR(13) NOT NULL,
        MesSoma        DATE NOT NULL,
        Tipo           NVARCHAR(17) NULL,
        Forma          NVARCHAR(7) NULL,
        Valor          DECIMAL(14,2) NULL,
        Voluntaria     DECIMAL(14,2) NULL,
        MembroId       INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        NomeDigitado   NVARCHAR(120) NULL,
        PelaGeral      BIT NOT NULL CONSTRAINT DF_FinLancamentos_PelaGeral DEFAULT 0,
        RegistradoPor  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm   DATETIME2 NOT NULL CONSTRAINT DF_FinLancamentos_RegistradoEm DEFAULT SYSUTCDATETIME(),
        PreenchidoPor  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        PreenchidoEm   DATETIME2 NULL,
        CorrigidoEm    DATETIME2 NULL,
        CONSTRAINT UQ_FinLancamentos_Folha UNIQUE (Folha),
        CONSTRAINT FK_FinLancamentos_SaidaDoBloco FOREIGN KEY (SaidaId, BlocoId, SaidaTipo) REFERENCES dbo.FinLivroBlocos (RegistroId, BlocoId, Tipo),
        CONSTRAINT CK_FinLancamentos_Referente CHECK (Referente IN ('ESTE_MES', 'MES_POSTERIOR')),
        -- o mês em que soma: o do dia ("este mês") ou o seguinte ("mês posterior"), sempre no dia 1
        CONSTRAINT CK_FinLancamentos_MesSoma CHECK (MesSoma = CASE WHEN Referente = 'ESTE_MES' THEN DATEFROMPARTS(YEAR(Dia), MONTH(Dia), 1)
                                                                   ELSE DATEADD(MONTH, 1, DATEFROMPARTS(YEAR(Dia), MONTH(Dia), 1)) END),
        CONSTRAINT CK_FinLancamentos_Tipo CHECK (Tipo IS NULL OR Tipo IN ('DIZIMO', 'OFERTA_CULTO', 'OFERTA_VOLUNTARIA')),
        CONSTRAINT CK_FinLancamentos_Forma CHECK (Forma IS NULL OR Forma IN ('PIX', 'ESPECIE')),
        CONSTRAINT CK_FinLancamentos_Valor CHECK (Valor IS NULL OR Valor > 0),
        CONSTRAINT CK_FinLancamentos_Voluntaria CHECK (Voluntaria IS NULL OR (Voluntaria > 0 AND Tipo = 'DIZIMO')),
        CONSTRAINT CK_FinLancamentos_QuemDeu CHECK (MembroId IS NULL OR NomeDigitado IS NULL),
        CONSTRAINT CK_FinLancamentos_Nome CHECK (NomeDigitado IS NULL OR LEN(LTRIM(RTRIM(NomeDigitado))) > 0),
        -- preenchida (tipo, forma e valor juntos) ou só a marca do "mês posterior" (nada preenchido)
        CONSTRAINT CK_FinLancamentos_Preenchida CHECK (
            (Valor IS NOT NULL AND Tipo IS NOT NULL AND Forma IS NOT NULL)
            OR (Valor IS NULL AND Tipo IS NULL AND Forma IS NULL AND Voluntaria IS NULL AND MembroId IS NULL AND NomeDigitado IS NULL)),
        CONSTRAINT CK_FinLancamentos_SoPosteriorSemValor CHECK (Valor IS NOT NULL OR Referente = 'MES_POSTERIOR'),
        CONSTRAINT CK_FinLancamentos_DizimoComNome CHECK (Tipo IS NULL OR Tipo <> 'DIZIMO' OR MembroId IS NOT NULL OR NomeDigitado IS NOT NULL)
    );
END
GO
-- os totais do mês (a congregação e o mês em que soma); o último lançamento de cada congregação (a área); as chaves estrangeiras
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinLancamentos_CongregacaoMes' AND object_id = OBJECT_ID(N'dbo.FinLancamentos'))
    CREATE INDEX IX_FinLancamentos_CongregacaoMes ON dbo.FinLancamentos (CongregacaoId, MesSoma) INCLUDE (Folha, Referente, Tipo, Forma, Valor, Voluntaria);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinLancamentos_CongregacaoRegistro' AND object_id = OBJECT_ID(N'dbo.FinLancamentos'))
    CREATE INDEX IX_FinLancamentos_CongregacaoRegistro ON dbo.FinLancamentos (CongregacaoId, RegistradoEm);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinLancamentos_Bloco' AND object_id = OBJECT_ID(N'dbo.FinLancamentos'))
    CREATE INDEX IX_FinLancamentos_Bloco ON dbo.FinLancamentos (BlocoId) INCLUDE (Folha);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinLancamentos_Saida' AND object_id = OBJECT_ID(N'dbo.FinLancamentos'))
    CREATE INDEX IX_FinLancamentos_Saida ON dbo.FinLancamentos (SaidaId) INCLUDE (Dia, MesSoma);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinLancamentos_Membro' AND object_id = OBJECT_ID(N'dbo.FinLancamentos'))
    CREATE INDEX IX_FinLancamentos_Membro ON dbo.FinLancamentos (MembroId) WHERE MembroId IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinLancamentos_PreenchidoPor' AND object_id = OBJECT_ID(N'dbo.FinLancamentos'))
    CREATE INDEX IX_FinLancamentos_PreenchidoPor ON dbo.FinLancamentos (PreenchidoPor) WHERE PreenchidoPor IS NOT NULL;
GO

-- ---- 2. a correção do lançamento (o antes e o depois, o motivo e quem; nada se apaga) ----

IF OBJECT_ID(N'dbo.FinLancamentosCorrecoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FinLancamentosCorrecoes (
        CorrecaoId     INT IDENTITY PRIMARY KEY,
        LancamentoId   INT NOT NULL REFERENCES dbo.FinLancamentos(LancamentoId),
        Antes          NVARCHAR(600) NOT NULL,
        Depois         NVARCHAR(600) NOT NULL,
        Motivo         NVARCHAR(300) NOT NULL,
        RegistradoPor  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm   DATETIME2 NOT NULL CONSTRAINT DF_FinLancamentosCorrecoes_RegistradoEm DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_FinLancamentosCorrecoes_Motivo CHECK (LEN(LTRIM(RTRIM(Motivo))) > 0)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinLancamentosCorrecoes_Lancamento' AND object_id = OBJECT_ID(N'dbo.FinLancamentosCorrecoes'))
    CREATE INDEX IX_FinLancamentosCorrecoes_Lancamento ON dbo.FinLancamentosCorrecoes (LancamentoId);
GO

-- ---- 3. o relatório do mês mandado (só o ponto de encaixe) ----

IF OBJECT_ID(N'dbo.FinRelatoriosMes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FinRelatoriosMes (
        RelatorioId    INT IDENTITY PRIMARY KEY,
        CongregacaoId  INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        Mes            DATE NOT NULL,
        RegistradoPor  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm   DATETIME2 NOT NULL CONSTRAINT DF_FinRelatoriosMes_RegistradoEm DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_FinRelatoriosMes_CongregacaoMes UNIQUE (CongregacaoId, Mes),
        CONSTRAINT CK_FinRelatoriosMes_Mes CHECK (Mes = DATEFROMPARTS(YEAR(Mes), MONTH(Mes), 1))
    );
END
GO
