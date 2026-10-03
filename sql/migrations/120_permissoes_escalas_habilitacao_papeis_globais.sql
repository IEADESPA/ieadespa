-- ============================================================
-- Migração 120 — Concede `escalas` e `habilitacao_voluntarios` (v5.6/v5.7, usadas pela v7.5)
-- aos dois papéis de nível GLOBAL que administram a igreja inteira: Presidente e Secretário Geral.
--
-- Mesmo achado das migrações 093 e 096: permissão nova nunca é concedida automaticamente a
-- papel nenhum, e a Secretaria tinha que dá-la à mão. Decisão do responsável pelo projeto
-- (02/10/2026): esses dois cargos já nascem com elas. Concessão aditiva na string CSV de
-- `Papeis.Permissoes` (não remove nem reordena nada), idempotente.
--
-- Efeito a conhecer: quem tem a permissão recebe os avisos automáticos dela, e papel GLOBAL
-- recebe os de TODAS as congregações (termo de adesão pendente, escala sem confirmação,
-- equipe sem revezamento). Cada regra de aviso pode ser desligada na tela de regras de notificação.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

UPDATE dbo.Papeis
SET Permissoes = CASE WHEN ISNULL(Permissoes, '') = '' THEN 'escalas' ELSE Permissoes + ',escalas' END
WHERE Nome IN ('Presidente', 'Secretário Geral')
  AND (',' + ISNULL(Permissoes, '') + ',') NOT LIKE '%,escalas,%';
GO

UPDATE dbo.Papeis
SET Permissoes = CASE WHEN ISNULL(Permissoes, '') = '' THEN 'habilitacao_voluntarios' ELSE Permissoes + ',habilitacao_voluntarios' END
WHERE Nome IN ('Presidente', 'Secretário Geral')
  AND (',' + ISNULL(Permissoes, '') + ',') NOT LIKE '%,habilitacao_voluntarios,%';
GO
