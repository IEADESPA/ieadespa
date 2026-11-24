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
--
-- Idempotente: cada objeto só nasce se não existir; nenhum DROP; a 3 só toca a linha que ainda está nas folhas.
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

-- a Quantidade do cadastro em blocos (o cadastro de antes da revisão gravou as folhas do lote)
UPDATE l SET l.Quantidade = (lg.UltimaFolha - lg.PrimeiraFolha + 1) / lg.FolhasPorBloco
FROM dbo.FinLivroBlocos l
JOIN dbo.FinLotesGrafica lg ON lg.LoteId = l.LoteId
WHERE l.Tipo = 'CADASTRO' AND lg.FolhasPorBloco > 1 AND l.Quantidade = lg.UltimaFolha - lg.PrimeiraFolha + 1;
GO
