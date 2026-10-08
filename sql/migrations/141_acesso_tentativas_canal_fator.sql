-- ============================================================
-- Migração 141 — vD.4: o canal 'FATOR' na contagem de tentativas (segunda etapa do login da liderança).
--
-- AcessoTentativas (migração 118) limita os erros por pessoa e por canal: PIN, SENHA e CODIGO. A segunda etapa do
-- login (chave de acesso recusada ou código errado) conta no canal próprio 'FATOR' — a prova em navegador de 08/10/2026
-- achou que a restrição CHECK da tabela recusava o canal novo e derrubava a rota (500). Aqui a restrição ganha 'FATOR'.
-- Idempotente: só recria a restrição se ela ainda não aceitar o canal.
-- ============================================================
IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = 'CK_AcessoTentativas_Canal' AND definition LIKE '%FATOR%'
)
BEGIN
  IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_AcessoTentativas_Canal')
    ALTER TABLE dbo.AcessoTentativas DROP CONSTRAINT CK_AcessoTentativas_Canal;
  ALTER TABLE dbo.AcessoTentativas WITH CHECK
    ADD CONSTRAINT CK_AcessoTentativas_Canal CHECK (Canal IN ('PIN', 'SENHA', 'CODIGO', 'FATOR'));
END;
