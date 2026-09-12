-- ============================================================
-- Migração 070 — v4.20: Painel de Imunidade Tributária.
-- A imunidade (CF Art. 150, VI, "b") não é automática: o CTN Art. 14 a
-- condiciona a 3 requisitos, e a perda quase sempre vem de desorganização
-- formal, não de desvio. Aqui entram só os campos que faltavam:
--   - Fornecedores.Estrangeiro: marca remessa a missões/entidades no
--     exterior (requisito II — aplicar recursos integralmente no País).
--   - SaidasTesouraria.TributosEmbutidos: IBS/CBS embutido na aquisição
--     (LC 214/2025 — custo não recuperável; a imunidade vale pras operações
--     da igreja, não pras aquisições).
-- O semáforo dos 3 requisitos é CALCULADO NA LEITURA (shared/imunidade.js).
-- ============================================================

IF COL_LENGTH(N'dbo.Fornecedores', N'Estrangeiro') IS NULL
    ALTER TABLE dbo.Fornecedores ADD Estrangeiro BIT NOT NULL DEFAULT 0;
GO

IF COL_LENGTH(N'dbo.SaidasTesouraria', N'TributosEmbutidos') IS NULL
    ALTER TABLE dbo.SaidasTesouraria ADD TributosEmbutidos DECIMAL(10,2) NULL;
GO
