-- ============================================================
-- Migração 168 — Trava de Revisão 9-A (v9.1 a v9.3).
--
-- As três políticas de retenção da FASE 9 (Entidades vinculadas, Expansão, Distritos) diziam "guardada sem prazo final" no texto, mas gravavam 1825 dias:
-- a tela de Políticas de retenção mostrava 5 anos, contradizendo o ROPA. Pela migração 012, NULL é que quer dizer prazo indeterminado (o mesmo das 152 e 160).
-- Só muda onde ainda está 1825 — se a administração tiver ajustado o prazo, fica o dela.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================
UPDATE dbo.PoliticasRetencao
SET DiasRetencao = NULL
WHERE DiasRetencao = 1825
  AND Categoria IN (N'Entidades vinculadas: atos de governança', N'Expansão: abertura e emancipação', N'Distritos: decretos, intervenções e balanços');
GO
