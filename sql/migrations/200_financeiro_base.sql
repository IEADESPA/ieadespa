-- ============================================================
-- Migração 200 — FASE 10, Financeiro (módulo 2), incremento 1a (21/11/2026): A BASE DO FINANCEIRO NOVO.
--
-- O Financeiro refeito em Svelte usa tabelas NOVAS, com o prefixo Fin, e não regrava as antigas (043 a 097): o modelo antigo nasceu do
-- Regimento e traz o que não existe na Igreja (malote, PDQ, prebenda, 40/60 sobre o bruto, o centro de custo como texto). O Financeiro novo
-- começa em janeiro de 2027 só com os saldos de abertura; até a troca, as telas antigas continuam com as tabelas delas.
-- Plano: docs/plano/financeiro-construcao.md. Regras: docs/plano/fase-10-experiencia-design-performance.md, seção do Financeiro.
--
-- Esta migração cria:
--   FinCentrosCusto      os centros de custo da IGREJA INTEIRA, em árvore. Nascem sozinhos: os 3 da Geral (Presidente, Tesouro Geral e
--                        Convenção) e um por congregação (shared/finCentrosCusto.js os completa quando surge congregação nova). Os de
--                        departamentos e secretarias vêm com o módulo de cada um (fora da 1ª entrega).
--   FinMovimentosCentro  o livro de cada centro de custo, com o valor com sinal; o saldo é a soma. Nada se apaga: o erro se corrige com
--                        ESTORNO (o movimento contrário, com o motivo). Aqui nascem a ABERTURA (o saldo de janeiro de 2027, positivo ou
--                        negativo) e o ESTORNO; o rateio, o repasse e a saída usam os outros tipos nas próximas migrações.
--   FinLotesGrafica      o lote da gráfica: a série (o ano), a primeira e a última folha, as folhas por bloco (50).
--   FinBlocos            cada bloco do lote: o número (calculado pela primeira folha: 70.051 → bloco 1.401), as folhas, quando chegou da
--                        gráfica, com qual congregação está e a situação guardada (na Geral, entregue, devolvido). "Esperando" e "Em uso"
--                        não se guardam: saem do uso das folhas (entregue sem folha usada = esperando).
--   FinFolhas            a folha que teve destino: lançada (o lançamento vem na migração 201), cancelada, arrancada ou extraviada (com a
--                        observação). Uma folha, um destino: o número é único (a numeração da série nunca se repete).
--   FinLivroBlocos       o livro de entrada e saída: o cadastro do lote, a chegada da gráfica, a saída (entregue a quem, de qual
--                        congregação; a área só leva) e a entrada (devolvido por quem; quem recebe é a Tesouraria Geral).
--
-- Idempotente: cada objeto só nasce se não existir; os centros de custo só são semeados se faltarem (nunca regrava o que a tela edita).
-- ============================================================

IF OBJECT_ID(N'dbo.FinCentrosCusto', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FinCentrosCusto (
        CentroCustoId  INT IDENTITY PRIMARY KEY,
        Codigo         NVARCHAR(40)  NOT NULL,
        Nome           NVARCHAR(150) NOT NULL,
        Tipo           NVARCHAR(15)  NOT NULL,
        CongregacaoId  INT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        AreaId         INT NULL REFERENCES dbo.Areas(AreaId),
        CentroPaiId    INT NULL REFERENCES dbo.FinCentrosCusto(CentroCustoId),
        Ativo          BIT NOT NULL CONSTRAINT DF_FinCentrosCusto_Ativo DEFAULT 1,
        CriadoEm       DATETIME2 NOT NULL CONSTRAINT DF_FinCentrosCusto_CriadoEm DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_FinCentrosCusto_Codigo UNIQUE (Codigo),
        CONSTRAINT CK_FinCentrosCusto_Tipo CHECK (Tipo IS NOT NULL AND Tipo IN ('GERAL', 'CONGREGACAO', 'AREA', 'DEPARTAMENTO', 'SECRETARIA')),
        CONSTRAINT CK_FinCentrosCusto_Congregacao CHECK (Tipo <> 'CONGREGACAO' OR CongregacaoId IS NOT NULL),
        CONSTRAINT CK_FinCentrosCusto_Area CHECK (Tipo <> 'AREA' OR AreaId IS NOT NULL)
    );
END
GO

-- um centro de custo próprio por congregação (o de cada departamento, quando vier, é outro tipo)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_FinCentrosCusto_Congregacao' AND object_id = OBJECT_ID(N'dbo.FinCentrosCusto'))
    CREATE UNIQUE INDEX UX_FinCentrosCusto_Congregacao ON dbo.FinCentrosCusto (CongregacaoId) WHERE Tipo = 'CONGREGACAO';
GO

IF OBJECT_ID(N'dbo.FinMovimentosCentro', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FinMovimentosCentro (
        MovimentoId    INT IDENTITY PRIMARY KEY,
        CentroCustoId  INT NOT NULL REFERENCES dbo.FinCentrosCusto(CentroCustoId),
        Tipo           NVARCHAR(12) NOT NULL,
        Valor          DECIMAL(14,2) NOT NULL,
        DataMovimento  DATE NOT NULL,
        Descricao      NVARCHAR(300) NULL,
        EstornoDeId    INT NULL REFERENCES dbo.FinMovimentosCentro(MovimentoId),
        CriadoPor      INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm       DATETIME2 NOT NULL CONSTRAINT DF_FinMovimentosCentro_CriadoEm DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_FinMovimentosCentro_Tipo CHECK (Tipo IS NOT NULL AND Tipo IN ('ABERTURA', 'ESTORNO', 'RATEIO', 'REPASSE', 'SAIDA')),
        CONSTRAINT CK_FinMovimentosCentro_Valor CHECK (Valor <> 0),
        -- o estorno sempre diz o que estorna e por quê; nenhum outro tipo aponta para outro movimento
        CONSTRAINT CK_FinMovimentosCentro_Estorno CHECK ((Tipo = 'ESTORNO' AND EstornoDeId IS NOT NULL AND Descricao IS NOT NULL) OR (Tipo <> 'ESTORNO' AND EstornoDeId IS NULL))
    );
END
GO

-- um movimento só se estorna uma vez
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_FinMovimentosCentro_EstornoDe' AND object_id = OBJECT_ID(N'dbo.FinMovimentosCentro'))
    CREATE UNIQUE INDEX UX_FinMovimentosCentro_EstornoDe ON dbo.FinMovimentosCentro (EstornoDeId) WHERE EstornoDeId IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinMovimentosCentro_Centro' AND object_id = OBJECT_ID(N'dbo.FinMovimentosCentro'))
    CREATE INDEX IX_FinMovimentosCentro_Centro ON dbo.FinMovimentosCentro (CentroCustoId, DataMovimento) INCLUDE (Valor, Tipo);
GO

IF OBJECT_ID(N'dbo.FinLotesGrafica', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FinLotesGrafica (
        LoteId          INT IDENTITY PRIMARY KEY,
        Serie           SMALLINT NOT NULL,
        PrimeiraFolha   INT NOT NULL,
        UltimaFolha     INT NOT NULL,
        FolhasPorBloco  SMALLINT NOT NULL CONSTRAINT DF_FinLotesGrafica_FolhasPorBloco DEFAULT 50,
        CriadoPor       INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm        DATETIME2 NOT NULL CONSTRAINT DF_FinLotesGrafica_CriadoEm DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_FinLotesGrafica_Serie CHECK (Serie BETWEEN 2000 AND 2100),
        CONSTRAINT CK_FinLotesGrafica_Faixa CHECK (PrimeiraFolha > 0 AND UltimaFolha >= PrimeiraFolha),
        CONSTRAINT CK_FinLotesGrafica_Blocos CHECK (FolhasPorBloco BETWEEN 1 AND 500 AND (UltimaFolha - PrimeiraFolha + 1) % FolhasPorBloco = 0)
    );
END
GO

IF OBJECT_ID(N'dbo.FinBlocos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FinBlocos (
        BlocoId        INT IDENTITY PRIMARY KEY,
        LoteId         INT NOT NULL REFERENCES dbo.FinLotesGrafica(LoteId),
        Numero         INT NOT NULL,
        PrimeiraFolha  INT NOT NULL,
        UltimaFolha    INT NOT NULL,
        ChegouEm       DATE NULL,
        CongregacaoId  INT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        Situacao       NVARCHAR(10) NOT NULL CONSTRAINT DF_FinBlocos_Situacao DEFAULT 'NA_GERAL',
        EntregueEm     DATE NULL,
        DevolvidoEm    DATE NULL,
        CONSTRAINT UQ_FinBlocos_Numero UNIQUE (Numero),
        CONSTRAINT UQ_FinBlocos_PrimeiraFolha UNIQUE (PrimeiraFolha),
        CONSTRAINT CK_FinBlocos_Faixa CHECK (PrimeiraFolha > 0 AND UltimaFolha >= PrimeiraFolha),
        CONSTRAINT CK_FinBlocos_Situacao CHECK (Situacao IS NOT NULL AND Situacao IN ('NA_GERAL', 'ENTREGUE', 'DEVOLVIDO')),
        -- na Geral, o bloco não é de congregação nenhuma; entregue ou devolvido, guarda a congregação que o usou (a história do livro)
        CONSTRAINT CK_FinBlocos_Congregacao CHECK ((Situacao = 'NA_GERAL' AND CongregacaoId IS NULL AND EntregueEm IS NULL)
                                                   OR (Situacao <> 'NA_GERAL' AND CongregacaoId IS NOT NULL AND EntregueEm IS NOT NULL)),
        -- só se entrega o que chegou da gráfica; só se devolve o que foi entregue
        CONSTRAINT CK_FinBlocos_Chegou CHECK (Situacao = 'NA_GERAL' OR ChegouEm IS NOT NULL),
        CONSTRAINT CK_FinBlocos_Devolvido CHECK ((Situacao = 'DEVOLVIDO' AND DevolvidoEm IS NOT NULL) OR (Situacao <> 'DEVOLVIDO' AND DevolvidoEm IS NULL))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinBlocos_Congregacao' AND object_id = OBJECT_ID(N'dbo.FinBlocos'))
    CREATE INDEX IX_FinBlocos_Congregacao ON dbo.FinBlocos (CongregacaoId, Situacao) INCLUDE (Numero, PrimeiraFolha, UltimaFolha);
GO

IF OBJECT_ID(N'dbo.FinFolhas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FinFolhas (
        FolhaId        INT IDENTITY PRIMARY KEY,
        BlocoId        INT NOT NULL REFERENCES dbo.FinBlocos(BlocoId),
        Folha          INT NOT NULL,
        Destino        NVARCHAR(10) NOT NULL,
        Observacao     NVARCHAR(300) NULL,
        RegistradoPor  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm   DATETIME2 NOT NULL CONSTRAINT DF_FinFolhas_RegistradoEm DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_FinFolhas_Folha UNIQUE (Folha),
        CONSTRAINT CK_FinFolhas_Destino CHECK (Destino IS NOT NULL AND Destino IN ('LANCADA', 'CANCELADA', 'ARRANCADA', 'EXTRAVIADA')),
        -- a exceção sempre diz o que aconteceu
        CONSTRAINT CK_FinFolhas_Observacao CHECK (Destino = 'LANCADA' OR LEN(LTRIM(RTRIM(ISNULL(Observacao, N'')))) > 0)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinFolhas_Bloco' AND object_id = OBJECT_ID(N'dbo.FinFolhas'))
    CREATE INDEX IX_FinFolhas_Bloco ON dbo.FinFolhas (BlocoId) INCLUDE (Folha, Destino);
GO

IF OBJECT_ID(N'dbo.FinLivroBlocos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FinLivroBlocos (
        RegistroId      INT IDENTITY PRIMARY KEY,
        Tipo            NVARCHAR(10) NOT NULL,
        LoteId          INT NULL REFERENCES dbo.FinLotesGrafica(LoteId),
        BlocoId         INT NULL REFERENCES dbo.FinBlocos(BlocoId),
        CongregacaoId   INT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        PessoaMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        PessoaNome      NVARCHAR(200) NULL,
        LevadoPelaArea  BIT NOT NULL CONSTRAINT DF_FinLivroBlocos_LevadoPelaArea DEFAULT 0,
        Quantidade      INT NULL,
        DataRegistro    DATE NOT NULL,
        Observacao      NVARCHAR(300) NULL,
        RegistradoPor   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm    DATETIME2 NOT NULL CONSTRAINT DF_FinLivroBlocos_RegistradoEm DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_FinLivroBlocos_Tipo CHECK (Tipo IS NOT NULL AND Tipo IN ('CADASTRO', 'CHEGADA', 'SAIDA', 'ENTRADA')),
        -- o cadastro e a chegada são do lote; a saída e a entrada são de um bloco, de uma congregação, com a pessoa que levou ou devolveu
        CONSTRAINT CK_FinLivroBlocos_Ref CHECK ((Tipo IN ('CADASTRO', 'CHEGADA') AND LoteId IS NOT NULL AND BlocoId IS NULL)
                                                OR (Tipo IN ('SAIDA', 'ENTRADA') AND BlocoId IS NOT NULL AND CongregacaoId IS NOT NULL
                                                    AND (PessoaMembroId IS NOT NULL OR LEN(LTRIM(RTRIM(ISNULL(PessoaNome, N'')))) > 0)))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinLivroBlocos_Data' AND object_id = OBJECT_ID(N'dbo.FinLivroBlocos'))
    CREATE INDEX IX_FinLivroBlocos_Data ON dbo.FinLivroBlocos (DataRegistro DESC, RegistroId DESC);
GO

-- Os centros de custo que nascem sozinhos. Os 3 da Geral (a Sede administrativa: o Presidente, o Tesouro Geral e a Convenção, que recebe o
-- fundo convencional e o dízimo do pastor) e um por congregação, com o nome dela. Só entra o que falta (nunca regrava um nome editado).
IF NOT EXISTS (SELECT 1 FROM dbo.FinCentrosCusto WHERE Codigo = N'GERAL_PRESIDENTE')
    INSERT INTO dbo.FinCentrosCusto (Codigo, Nome, Tipo) VALUES (N'GERAL_PRESIDENTE', N'Presidente', 'GERAL');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.FinCentrosCusto WHERE Codigo = N'GERAL_TESOURO')
    INSERT INTO dbo.FinCentrosCusto (Codigo, Nome, Tipo) VALUES (N'GERAL_TESOURO', N'Tesouro Geral', 'GERAL');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.FinCentrosCusto WHERE Codigo = N'GERAL_CONVENCAO')
    INSERT INTO dbo.FinCentrosCusto (Codigo, Nome, Tipo) VALUES (N'GERAL_CONVENCAO', N'Convenção', 'GERAL');
GO
-- (a área de cada congregação vem da própria congregação na leitura: não se copia, para não envelhecer quando ela muda de área)
INSERT INTO dbo.FinCentrosCusto (Codigo, Nome, Tipo, CongregacaoId)
SELECT CONCAT(N'CONG_', c.CongregacaoId), LEFT(c.Nome, 150), 'CONGREGACAO', c.CongregacaoId
FROM dbo.Congregacoes c
WHERE NOT EXISTS (SELECT 1 FROM dbo.FinCentrosCusto f WHERE f.Tipo = 'CONGREGACAO' AND f.CongregacaoId = c.CongregacaoId)
  AND NOT EXISTS (SELECT 1 FROM dbo.FinCentrosCusto f WHERE f.Codigo = CONCAT(N'CONG_', c.CongregacaoId));
GO
