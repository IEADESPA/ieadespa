-- ============================================================
-- Migração 010 — Processo Disciplinar (núcleo mínimo, v0.2)
--
-- Deliberadamente mínima: abrir processo, julgar (Resultado + prazo de sanção),
-- ajustar prazo caso a caso com justificativa auditada, suspensão automática de
-- voto/ser votado, término automático calculado na leitura. Sem catálogo de
-- infrações/penalidades (fica pra v3.3/v3.4), sem status intermediário
-- AFASTAMENTO_CAUTELAR (v3.2) — ver README, roadmap FASE 3.
--
-- Todas as colunas de que esse núcleo precisa (Status, Resultado, DiasSancao,
-- DataTerminoPrevisao, Sigiloso, DataConclusao, OrgaoResponsavelId, MembroId,
-- DataAbertura) já existem desde a migração 001. Só falta um jeito de registrar
-- o que aconteceu — em texto livre por enquanto, até o catálogo TiposInfracao
-- existir (v3.3).
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ProcessosDisciplinares') AND name = N'Motivo')
    ALTER TABLE dbo.ProcessosDisciplinares ADD Motivo NVARCHAR(500) NULL;
GO
