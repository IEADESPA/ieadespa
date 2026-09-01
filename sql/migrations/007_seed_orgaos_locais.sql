-- ============================================================
-- Migração 007 — Órgãos Locais (Governança Escalonada, Regimento Art. 104-A/B/C).
-- A tabela OrgaosLocais (JAI/JEA/CRA/TER/CEQ/Distrito) já existia no schema
-- (001), mas sem seed e sem nenhuma rota usando. Esta migração só cria a
-- JAI (Junta Administrativa da Igreja) de cada Congregação existente —
-- nível 1, cuja ativação é "base" (sempre ativa assim que a congregação
-- existe, README seção 2.2). JEA/CRA/TER/CEQ/Distrito não são semeados
-- aqui: a ativação deles depende de contagem (≥3 congregações, ≥3 áreas
-- etc.), lógica ainda não implementada — ficam disponíveis para cadastro
-- manual via /api/catalogos/orgaosLocais enquanto isso.
-- Idempotente: só insere para quem ainda não tem JAI própria.
-- ============================================================

INSERT INTO dbo.OrgaosLocais (Sigla, Nome, Nivel, ReferenciaId, Ativo)
SELECT 'JAI', 'Junta Administrativa da Igreja — ' + c.Nome, 1, c.CongregacaoId, 1
FROM dbo.Congregacoes c
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.OrgaosLocais ol WHERE ol.Nivel = 1 AND ol.ReferenciaId = c.CongregacaoId
);
GO
