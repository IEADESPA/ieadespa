-- ============================================================
-- Migração 201 — FASE 10, Financeiro (módulo 2), a revisão de 23/11/2026 dos blocos de recibo.
--
-- 1. Os índices que a 200 deixou sem (regra 3 do banco, api/CLAUDE.md: índice em toda coluna filtrada, juntada ou apagada por chave
--    estrangeira; a de "quem registrou" não precisa): FinBlocos.LoteId (o quadro do lote e a chegada), FinLivroBlocos.BlocoId (o rastreio),
--    .CongregacaoId (o livro da área e da congregação), .LoteId e .PessoaMembroId (as chaves estrangeiras), FinCentrosCusto.CentroPaiId e
--    .AreaId (a árvore dos centros de custo).
-- 2. FinFolhasDesfeitas, o histórico da exceção desfeita (regra dele, 23/11/2026): só a Tesouraria Geral desfaz a exceção de uma folha
--    (cancelada, arrancada ou extraviada), escrevendo o motivo, e nunca em bloco já devolvido. A linha sai de FinFolhas e vem INTEIRA para cá,
--    na mesma transação (shared/finBlocosDb.js, desfazerFolha): quem marcou e quando, o que era, quem desfez, quando e por quê. Nada se perde, e
--    FinFolhas continua sendo "o destino de cada folha agora", com o número da folha único: a folha volta a poder ter destino.
-- 3. A Quantidade do livro conta BLOCOS no cadastro e na chegada (revisão M7). O cadastro gravava as folhas (10.000 em vez de 200 blocos):
--    acerta só a linha de cadastro cuja Quantidade é o total de folhas do lote (rodar de novo não muda nada).
-- 4. A devolução COMPLETA ou PARCIAL (regra dele, 24/11/2026, no lugar da "devolução só de bloco cheio" de 23/11). Completa (o normal): toda
--    folha da entrega tem destino e o bloco fecha. Parcial (a exceção): as folhas que ninguém usou continuam LIVRES (nada se anula) e o bloco
--    volta para a Tesouraria Geral, para sair de novo a partir da primeira folha livre. Para isso:
--    - FinLivroBlocos.PrimeiraFolha/UltimaFolha: a faixa de folhas que a SAÍDA entregou (o bloco inteiro, ou da primeira livre ao fim);
--    - FinLivroBlocos.SaidaId: a saída que a ENTRADA fecha (uma entrada por saída); .Parcial e .FolhasLivres: se a devolução foi parcial e
--      quantas folhas livres voltaram (a contagem da entrada fica parada no tempo, mesmo depois de o bloco sair de novo);
--    - FinFolhas.SaidaId (e FinFolhasDesfeitas.SaidaId): a entrega que usou cada folha (quem usou continua no histórico da folha).
--    O acerto dos dados de antes (cada bloco saía uma vez só, inteiro): a faixa de cada saída é a do bloco; a entrada fecha a última saída do
--    bloco antes dela; as folhas livres da entrada são as que o bloco tem sem destino; a folha foi usada na única saída do bloco. Só toca o que
--    ainda está vazio; depois do acerto, o banco passa a conferir (CHECK) cada linha.
--
-- Idempotente: cada objeto só nasce se não existir; nenhum DROP; a 3 e o acerto da 4 só tocam o que ainda está para acertar.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinBlocos_Lote' AND object_id = OBJECT_ID(N'dbo.FinBlocos'))
    CREATE INDEX IX_FinBlocos_Lote ON dbo.FinBlocos (LoteId, UltimaFolha) INCLUDE (ChegouEm);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinLivroBlocos_Bloco' AND object_id = OBJECT_ID(N'dbo.FinLivroBlocos'))
    CREATE INDEX IX_FinLivroBlocos_Bloco ON dbo.FinLivroBlocos (BlocoId, Tipo);
GO
-- o livro da área e da congregação: filtra pela congregação e ordena do mais novo ao mais antigo (o RegistroId vem junto, é a chave da tabela)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinLivroBlocos_Congregacao' AND object_id = OBJECT_ID(N'dbo.FinLivroBlocos'))
    CREATE INDEX IX_FinLivroBlocos_Congregacao ON dbo.FinLivroBlocos (CongregacaoId, DataRegistro DESC) INCLUDE (Tipo);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinLivroBlocos_Lote' AND object_id = OBJECT_ID(N'dbo.FinLivroBlocos'))
    CREATE INDEX IX_FinLivroBlocos_Lote ON dbo.FinLivroBlocos (LoteId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinLivroBlocos_PessoaMembro' AND object_id = OBJECT_ID(N'dbo.FinLivroBlocos'))
    CREATE INDEX IX_FinLivroBlocos_PessoaMembro ON dbo.FinLivroBlocos (PessoaMembroId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinCentrosCusto_Pai' AND object_id = OBJECT_ID(N'dbo.FinCentrosCusto'))
    CREATE INDEX IX_FinCentrosCusto_Pai ON dbo.FinCentrosCusto (CentroPaiId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinCentrosCusto_Area' AND object_id = OBJECT_ID(N'dbo.FinCentrosCusto'))
    CREATE INDEX IX_FinCentrosCusto_Area ON dbo.FinCentrosCusto (AreaId);
GO

IF OBJECT_ID(N'dbo.FinFolhasDesfeitas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FinFolhasDesfeitas (
        DesfeitaId     INT IDENTITY PRIMARY KEY,
        FolhaId        INT NOT NULL,
        BlocoId        INT NOT NULL REFERENCES dbo.FinBlocos(BlocoId),
        Folha          INT NOT NULL,
        Destino        NVARCHAR(10) NOT NULL,
        Observacao     NVARCHAR(300) NULL,
        RegistradoPor  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm   DATETIME2 NOT NULL,
        DesfeitaPor    INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DesfeitaEm     DATETIME2 NOT NULL CONSTRAINT DF_FinFolhasDesfeitas_DesfeitaEm DEFAULT SYSUTCDATETIME(),
        Motivo         NVARCHAR(300) NOT NULL,
        -- a entrega em que a folha tinha a exceção (a saída do livro; a regra de 24/11/2026)
        SaidaId        INT NOT NULL REFERENCES dbo.FinLivroBlocos(RegistroId),
        -- o FolhaId que a linha tinha em FinFolhas (a trilha usa esse número); uma linha de FinFolhas só sai uma vez
        CONSTRAINT UQ_FinFolhasDesfeitas_FolhaId UNIQUE (FolhaId),
        -- só a exceção se desfaz aqui: a folha lançada se corrige pelo lançamento
        CONSTRAINT CK_FinFolhasDesfeitas_Destino CHECK (Destino IS NOT NULL AND Destino IN ('CANCELADA', 'ARRANCADA', 'EXTRAVIADA')),
        CONSTRAINT CK_FinFolhasDesfeitas_Motivo CHECK (LEN(LTRIM(RTRIM(Motivo))) > 0)
    );
END
GO
-- a mesma folha pode ser marcada e desfeita mais de uma vez: o índice da folha não é único
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinFolhasDesfeitas_Bloco' AND object_id = OBJECT_ID(N'dbo.FinFolhasDesfeitas'))
    CREATE INDEX IX_FinFolhasDesfeitas_Bloco ON dbo.FinFolhasDesfeitas (BlocoId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinFolhasDesfeitas_Folha' AND object_id = OBJECT_ID(N'dbo.FinFolhasDesfeitas'))
    CREATE INDEX IX_FinFolhasDesfeitas_Folha ON dbo.FinFolhasDesfeitas (Folha);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinFolhasDesfeitas_Saida' AND object_id = OBJECT_ID(N'dbo.FinFolhasDesfeitas'))
    CREATE INDEX IX_FinFolhasDesfeitas_Saida ON dbo.FinFolhasDesfeitas (SaidaId);
GO

-- a Quantidade do cadastro em blocos (o cadastro de antes da revisão gravou as folhas do lote)
UPDATE l SET l.Quantidade = (lg.UltimaFolha - lg.PrimeiraFolha + 1) / lg.FolhasPorBloco
FROM dbo.FinLivroBlocos l
JOIN dbo.FinLotesGrafica lg ON lg.LoteId = l.LoteId
WHERE l.Tipo = 'CADASTRO' AND lg.FolhasPorBloco > 1 AND l.Quantidade = lg.UltimaFolha - lg.PrimeiraFolha + 1;
GO

-- ---- 4. a devolução completa ou parcial (regra dele, 24/11/2026) ----

-- as colunas novas (a tabela já tem linhas na homologação: todas nascem vazias, e o Parcial nasce "não")
IF COL_LENGTH(N'dbo.FinLivroBlocos', N'PrimeiraFolha') IS NULL
    ALTER TABLE dbo.FinLivroBlocos ADD PrimeiraFolha INT NULL, UltimaFolha INT NULL;
GO
IF COL_LENGTH(N'dbo.FinLivroBlocos', N'SaidaId') IS NULL
    ALTER TABLE dbo.FinLivroBlocos ADD SaidaId INT NULL CONSTRAINT FK_FinLivroBlocos_Saida REFERENCES dbo.FinLivroBlocos(RegistroId);
GO
IF COL_LENGTH(N'dbo.FinLivroBlocos', N'Parcial') IS NULL
    ALTER TABLE dbo.FinLivroBlocos ADD Parcial BIT NOT NULL CONSTRAINT DF_FinLivroBlocos_Parcial DEFAULT 0, FolhasLivres INT NULL;
GO
IF COL_LENGTH(N'dbo.FinFolhas', N'SaidaId') IS NULL
    ALTER TABLE dbo.FinFolhas ADD SaidaId INT NULL CONSTRAINT FK_FinFolhas_Saida REFERENCES dbo.FinLivroBlocos(RegistroId);
GO

-- o acerto dos dados de antes da regra (cada bloco saía uma vez só, inteiro); só o que ainda está vazio
UPDATE l SET l.PrimeiraFolha = b.PrimeiraFolha, l.UltimaFolha = b.UltimaFolha
FROM dbo.FinLivroBlocos l
JOIN dbo.FinBlocos b ON b.BlocoId = l.BlocoId
WHERE l.Tipo = 'SAIDA' AND l.PrimeiraFolha IS NULL;
GO
UPDATE l SET l.SaidaId = s.RegistroId
FROM dbo.FinLivroBlocos l
CROSS APPLY (SELECT TOP 1 x.RegistroId FROM dbo.FinLivroBlocos x
             WHERE x.Tipo = 'SAIDA' AND x.BlocoId = l.BlocoId AND x.RegistroId < l.RegistroId ORDER BY x.RegistroId DESC) s
WHERE l.Tipo = 'ENTRADA' AND l.SaidaId IS NULL;
GO
UPDATE l SET l.FolhasLivres = (b.UltimaFolha - b.PrimeiraFolha + 1) - (SELECT COUNT(*) FROM dbo.FinFolhas f WHERE f.BlocoId = l.BlocoId)
FROM dbo.FinLivroBlocos l
JOIN dbo.FinBlocos b ON b.BlocoId = l.BlocoId
WHERE l.Tipo = 'ENTRADA' AND l.FolhasLivres IS NULL;
GO
UPDATE f SET f.SaidaId = s.RegistroId
FROM dbo.FinFolhas f
CROSS APPLY (SELECT TOP 1 x.RegistroId FROM dbo.FinLivroBlocos x WHERE x.Tipo = 'SAIDA' AND x.BlocoId = f.BlocoId ORDER BY x.RegistroId DESC) s
WHERE f.SaidaId IS NULL;
GO

-- daqui em diante o banco confere cada linha: a saída tem a faixa (e só ela); a entrada fecha uma saída, com as folhas livres que voltaram (a
-- parcial, pelo menos uma); a folha com destino diz em que entrega foi usada
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_FinLivroBlocos_Faixa' AND parent_object_id = OBJECT_ID(N'dbo.FinLivroBlocos'))
    ALTER TABLE dbo.FinLivroBlocos WITH CHECK ADD CONSTRAINT CK_FinLivroBlocos_Faixa
        CHECK ((Tipo = 'SAIDA' AND PrimeiraFolha IS NOT NULL AND UltimaFolha >= PrimeiraFolha)
               OR (Tipo <> 'SAIDA' AND PrimeiraFolha IS NULL AND UltimaFolha IS NULL));
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_FinLivroBlocos_Entrada' AND parent_object_id = OBJECT_ID(N'dbo.FinLivroBlocos'))
    ALTER TABLE dbo.FinLivroBlocos WITH CHECK ADD CONSTRAINT CK_FinLivroBlocos_Entrada
        CHECK ((Tipo = 'ENTRADA' AND SaidaId IS NOT NULL AND FolhasLivres IS NOT NULL AND FolhasLivres >= 0 AND (Parcial = 0 OR FolhasLivres > 0))
               OR (Tipo <> 'ENTRADA' AND SaidaId IS NULL AND FolhasLivres IS NULL AND Parcial = 0));
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_FinFolhas_Saida' AND parent_object_id = OBJECT_ID(N'dbo.FinFolhas'))
    ALTER TABLE dbo.FinFolhas WITH CHECK ADD CONSTRAINT CK_FinFolhas_Saida CHECK (SaidaId IS NOT NULL);
GO

-- uma saída se fecha uma vez só (duas entradas para a mesma entrega, nunca)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_FinLivroBlocos_Saida' AND object_id = OBJECT_ID(N'dbo.FinLivroBlocos'))
    CREATE UNIQUE INDEX UX_FinLivroBlocos_Saida ON dbo.FinLivroBlocos (SaidaId) WHERE SaidaId IS NOT NULL;
GO
-- a contagem de cada entrada (as folhas de uma entrega, por destino)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinFolhas_Saida' AND object_id = OBJECT_ID(N'dbo.FinFolhas'))
    CREATE INDEX IX_FinFolhas_Saida ON dbo.FinFolhas (SaidaId) INCLUDE (Destino);
GO
