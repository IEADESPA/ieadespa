-- ============================================================
-- Migração 066 — Trava de Revisão 4-A: a trilha CAIXA_FISICO da
-- Conciliação Bancária (v4.13) dizia conciliar contra o Fundo Fixo de
-- Caixa (v4.5), mas na prática tratava CAIXA_FISICO igual a
-- CONTA_BANCARIA (extrato digitado à mão em ExtratoLinhas, nunca tocava
-- FundoFixoMovimentos). Corrigido em api/shared/conciliação.js.
--
-- Esta migração só adiciona a coluna de rastreabilidade que faltava em
-- ConciliacaoDivergencias para apontar, no lado "só no cofre" da trilha
-- CAIXA_FISICO, qual FundoFixoMovimentos ficou sem correspondência no
-- sistema — mesmo padrão que já existe para LancamentoId/SaidaId no lado
-- "só no sistema".
-- ============================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.ConciliacaoDivergencias') AND name = 'MovimentoFundoId'
)
BEGIN
    ALTER TABLE dbo.ConciliacaoDivergencias
        ADD MovimentoFundoId INT NULL REFERENCES dbo.FundoFixoMovimentos(MovimentoId);
END
GO
