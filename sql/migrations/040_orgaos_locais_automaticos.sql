-- ============================================================
-- Migração 040 — v3.6.1: cadastrar Área/Região/Quadrante/Distrito já cria
-- automaticamente os órgãos daquele nível (via GestaoCatalogos, ver
-- api/GestaoCatalogos/index.js::criarOrgaosAutomaticos). Esta migração só
-- faz o BACKFILL de quem já existia antes dessa mudança — Congregação já
-- tinha esse backfill (migração 007, só JAI).
-- Idempotente: só insere Nivel+ReferenciaId+Sigla que ainda não existir.
-- ============================================================

-- Área (Nível 2): JEA + JUC
INSERT INTO dbo.OrgaosLocais (Sigla, Nome, Nivel, ReferenciaId, Ativo)
SELECT 'JEA', 'Junta Executiva de Área — ' + a.Nome, 2, a.AreaId, 1
FROM dbo.Areas a
WHERE NOT EXISTS (SELECT 1 FROM dbo.OrgaosLocais ol WHERE ol.Nivel = 2 AND ol.ReferenciaId = a.AreaId AND ol.Sigla = 'JEA');
GO
INSERT INTO dbo.OrgaosLocais (Sigla, Nome, Nivel, ReferenciaId, Ativo)
SELECT 'JUC', 'Junta de Contas de Área — ' + a.Nome, 2, a.AreaId, 1
FROM dbo.Areas a
WHERE NOT EXISTS (SELECT 1 FROM dbo.OrgaosLocais ol WHERE ol.Nivel = 2 AND ol.ReferenciaId = a.AreaId AND ol.Sigla = 'JUC');
GO

-- Região (Nível 3): CRA + TER + CRAF
INSERT INTO dbo.OrgaosLocais (Sigla, Nome, Nivel, ReferenciaId, Ativo)
SELECT 'CRA', 'Conselho Regional de Administração — ' + r.Nome, 3, r.RegiaoId, 1
FROM dbo.Regioes r
WHERE NOT EXISTS (SELECT 1 FROM dbo.OrgaosLocais ol WHERE ol.Nivel = 3 AND ol.ReferenciaId = r.RegiaoId AND ol.Sigla = 'CRA');
GO
INSERT INTO dbo.OrgaosLocais (Sigla, Nome, Nivel, ReferenciaId, Ativo)
SELECT 'TER', 'Tribunal Eclesiástico Regional — ' + r.Nome, 3, r.RegiaoId, 1
FROM dbo.Regioes r
WHERE NOT EXISTS (SELECT 1 FROM dbo.OrgaosLocais ol WHERE ol.Nivel = 3 AND ol.ReferenciaId = r.RegiaoId AND ol.Sigla = 'TER');
GO
INSERT INTO dbo.OrgaosLocais (Sigla, Nome, Nivel, ReferenciaId, Ativo)
SELECT 'CRAF', 'Conselho Regional de Auditoria e Fiscalização — ' + r.Nome, 3, r.RegiaoId, 1
FROM dbo.Regioes r
WHERE NOT EXISTS (SELECT 1 FROM dbo.OrgaosLocais ol WHERE ol.Nivel = 3 AND ol.ReferenciaId = r.RegiaoId AND ol.Sigla = 'CRAF');
GO

-- Quadrante (Nível 4): CEQ + CAQ
INSERT INTO dbo.OrgaosLocais (Sigla, Nome, Nivel, ReferenciaId, Ativo)
SELECT 'CEQ', 'Colegiado Estratégico de Quadrante — ' + q.Nome, 4, q.QuadranteId, 1
FROM dbo.Quadrantes q
WHERE NOT EXISTS (SELECT 1 FROM dbo.OrgaosLocais ol WHERE ol.Nivel = 4 AND ol.ReferenciaId = q.QuadranteId AND ol.Sigla = 'CEQ');
GO
INSERT INTO dbo.OrgaosLocais (Sigla, Nome, Nivel, ReferenciaId, Ativo)
SELECT 'CAQ', 'Câmara de Arbitragem do Quadrante — ' + q.Nome, 4, q.QuadranteId, 1
FROM dbo.Quadrantes q
WHERE NOT EXISTS (SELECT 1 FROM dbo.OrgaosLocais ol WHERE ol.Nivel = 4 AND ol.ReferenciaId = q.QuadranteId AND ol.Sigla = 'CAQ');
GO

-- Distrito (Nível 5): CDE
INSERT INTO dbo.OrgaosLocais (Sigla, Nome, Nivel, ReferenciaId, Ativo)
SELECT 'CDE', 'Conselho Distrital Eclesiástico — ' + d.Nome, 5, d.DistritoId, 1
FROM dbo.Distritos d
WHERE NOT EXISTS (SELECT 1 FROM dbo.OrgaosLocais ol WHERE ol.Nivel = 5 AND ol.ReferenciaId = d.DistritoId AND ol.Sigla = 'CDE');
GO
