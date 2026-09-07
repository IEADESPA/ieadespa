-- ============================================================
-- Migração 044 — v4.1.1: flexibilidade real de tesouraria, a partir de como
-- o processo funciona na prática (bloco de dízimo físico):
-- 1) Cancelamento motivado (nunca exclusão) — "folha arrancada do bloco":
--    o Termo nº fica visível no relatório como CANCELADO, nunca some.
-- 2) Comprovante de PIX pode chegar depois (ComprovanteUrl já era NULL-able,
--    só muda a validação na Function — nada de schema aqui).
-- 3) Pagamento misto (parte dinheiro, parte PIX) no mesmo lançamento.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.LancamentosTesouraria') AND name = N'Status')
    ALTER TABLE dbo.LancamentosTesouraria ADD Status NVARCHAR(20) NOT NULL DEFAULT 'ATIVO'; -- ATIVO | CANCELADO
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.LancamentosTesouraria') AND name = N'MotivoCancelamento')
    ALTER TABLE dbo.LancamentosTesouraria ADD MotivoCancelamento NVARCHAR(300) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.LancamentosTesouraria') AND name = N'CanceladoPor')
    ALTER TABLE dbo.LancamentosTesouraria ADD CanceladoPor INT NULL REFERENCES dbo.MembroReferencia(MembroId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.LancamentosTesouraria') AND name = N'CanceladoEm')
    ALTER TABLE dbo.LancamentosTesouraria ADD CanceladoEm DATETIME2 NULL;
GO
-- Parte em PIX quando FormaPagamento = 'MISTO' (o restante de Valor é em
-- dinheiro) — em PIX puro, a parte em PIX é o próprio Valor, não precisa
-- duplicar aqui.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.LancamentosTesouraria') AND name = N'ValorPix')
    ALTER TABLE dbo.LancamentosTesouraria ADD ValorPix DECIMAL(10,2) NULL;
GO
