-- ============================================================
-- Migração 122 — Rede de segurança do nível GERAL.
--
-- O escopo hierárquico passou a valer em todas as rotas (02/10/2026) e as telas da administração geral só abrem para quem é "geral": papel de nível Global E
-- liderança com escopo Global. Se, por um cadastro antigo, NINGUÉM estiver nessa situação com a permissão de conceder cargos ("permissoes"), a própria
-- administração ficaria trancada para fora e só se resolveria direto no banco.
--
-- Esta migração só age nesse caso extremo: se NÃO existir nenhuma liderança ativa de papel Global, escopo Global e permissão "permissoes", os cadastros ATIVOS dos
-- papéis Presidente e Secretário Geral (os dois papéis que o sistema define como de alcance total) voltam ao escopo Global. Existindo ao menos uma pessoa assim,
-- não toca em nada. Não reativa cadastro suspenso (AtivoAte vencido) e não mexe em outros papéis.
--
-- Idempotente: seguro para reexecutar.
-- ============================================================

IF NOT EXISTS (
    SELECT 1 FROM dbo.Lideranca l JOIN dbo.Papeis p ON p.PapelId = l.PapelId
    WHERE p.Nivel = 'GLOBAL' AND l.EscopoTipo = 'GLOBAL'
      AND (',' + ISNULL(p.Permissoes, '') + ',') LIKE '%,permissoes,%'
      AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE)))
BEGIN
    UPDATE l SET EscopoTipo = 'GLOBAL', EscopoId = NULL
    FROM dbo.Lideranca l JOIN dbo.Papeis p ON p.PapelId = l.PapelId
    WHERE p.Nome IN ('Presidente', 'Secretário Geral')
      AND (',' + ISNULL(p.Permissoes, '') + ',') LIKE '%,permissoes,%'
      AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))
      AND (l.EscopoTipo <> 'GLOBAL' OR l.EscopoId IS NOT NULL);
END
GO
