-- ============================================================
-- Migração 077 — Congregações: ano de fundação (vC.2)
-- Último campo achado ao levantar tudo que ainda dependia da coleção
-- "congregacoes" do Directus antes de aposentá-la: usado hoje só pela
-- página /transparencia/ do site (gráfico de crescimento por ano, quando
-- houver pelo menos 2 congregações com o ano preenchido). Nenhuma das 41
-- congregações reais tinha esse campo preenchido no Directus — nada a
-- migrar, só a coluna pra continuar existindo depois da coleção sair.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Congregacoes') AND name = N'FundacaoAno')
    ALTER TABLE dbo.Congregacoes ADD FundacaoAno SMALLINT NULL;
GO
