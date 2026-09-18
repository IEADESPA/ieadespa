-- ============================================================
-- Migração 096 — Concede a permissão `tesouraria_departamental` (v5.4,
-- migração 095) aos papéis de nível GLOBAL (Presidente e Secretário Geral).
--
-- Mesmo achado da migração 093 (v5.2), verificado ao vivo de novo:
-- permissão nova nunca é concedida automaticamente a papel nenhum. Concessão
-- aditiva na string CSV de `Papeis.Permissoes`, idempotente.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

UPDATE dbo.Papeis
SET Permissoes = Permissoes + ',tesouraria_departamental'
WHERE Nome IN ('Presidente', 'Secretário Geral')
  AND (',' + ISNULL(Permissoes, '') + ',') NOT LIKE '%,tesouraria_departamental,%';
GO
