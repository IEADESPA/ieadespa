-- ============================================================
-- Migração 045 — v4.1.2: melhorias reais de tesouraria local a partir de
-- como o processo funciona na prática (feedback de uso):
-- 1) Conciliação de PIX em lote: em vez de exigir 1 comprovante por
--    lançamento, permite conferir vários PIX/Misto de uma vez com UM
--    extrato bancário só (agilidade no fim do mês).
-- 2) Forma do repasse à Tesouraria Geral (o próprio repasse de 60% pode
--    ser feito em dinheiro, depósito ou PIX — hoje só registrava que
--    aconteceu, não como).
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.ConciliacoesTesouraria') AND type = N'U')
BEGIN
    CREATE TABLE dbo.ConciliacoesTesouraria (
        ConciliacaoId   INT IDENTITY PRIMARY KEY,
        CongregacaoId   INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        MesReferencia   CHAR(7) NOT NULL,
        ValorTotal      DECIMAL(10,2) NOT NULL,
        ComprovanteUrl  NVARCHAR(500) NOT NULL,
        CriadoPor       INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.LancamentosTesouraria') AND name = N'ConciliacaoId')
    ALTER TABLE dbo.LancamentosTesouraria ADD ConciliacaoId INT NULL REFERENCES dbo.ConciliacoesTesouraria(ConciliacaoId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.FechamentosTesouraria') AND name = N'FormaRepasse')
    ALTER TABLE dbo.FechamentosTesouraria ADD FormaRepasse NVARCHAR(20) NULL; -- PIX | DEPOSITO | DINHEIRO
GO
