-- ============================================================
-- Migração 093 — Concede a permissão `relatorios_departamentais` (v5.2,
-- migração 092) aos papéis de nível GLOBAL (Presidente e Secretário Geral).
--
-- Pedido explícito do usuário, verificado ao vivo em produção: login real
-- (matrícula 1, Presidente) confirmou que ninguém tinha a permissão ainda —
-- mesmo padrão de toda permissão nova do sistema, nunca concedida
-- automaticamente a papel nenhum (ex: "mediacao" na vB.16). Concessão
-- aditiva na string `Papeis.Permissoes` (NVARCHAR(500), formato CSV) — só
-- adiciona se ainda não tiver, nunca duplica nem remove o que já existia.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

UPDATE dbo.Papeis
SET Permissoes = Permissoes + ',relatorios_departamentais'
WHERE Nome IN ('Presidente', 'Secretário Geral')
  AND (',' + ISNULL(Permissoes, '') + ',') NOT LIKE '%,relatorios_departamentais,%';
GO
