-- ============================================================
-- Migração 037 — v3.3: Código Penal Eclesiástico. Graduação de gravidade
-- (leve/média/grave/gravíssima) sobre o catálogo TiposInfracao (v3.2) e as
-- 4 infrações de intervenção financeira (Art. 144).
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.TiposInfracao') AND name = N'Gravidade')
    ALTER TABLE dbo.TiposInfracao ADD Gravidade NVARCHAR(20) NULL; -- LEVE | MEDIA | GRAVE | GRAVISSIMA
GO

-- Backfill único (só roda se a coluna ainda estiver toda NULL — não sobrescreve
-- ajuste manual feito depois pela tela de catálogo).
IF EXISTS (SELECT 1 FROM dbo.TiposInfracao WHERE Gravidade IS NULL)
BEGIN
    -- Art. 96 — chapeau: "infrações graves e gravíssimas" (piso GRAVE).
    UPDATE dbo.TiposInfracao SET Gravidade = 'GRAVE'      WHERE Codigo = 'ART96-I'    AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'MEDIA'      WHERE Codigo = 'ART96-II'   AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'GRAVISSIMA' WHERE Codigo = 'ART96-III'  AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'MEDIA'      WHERE Codigo = 'ART96-IV'   AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'GRAVE'      WHERE Codigo = 'ART96-V'    AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'MEDIA'      WHERE Codigo = 'ART96-VI'   AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'GRAVISSIMA' WHERE Codigo = 'ART96-VII'  AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'GRAVISSIMA' WHERE Codigo = 'ART96-VIII' AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'MEDIA'      WHERE Codigo = 'ART96-IX'   AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'GRAVISSIMA' WHERE Codigo = 'ART96-X'    AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'LEVE'       WHERE Codigo = 'ART96-XI'   AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'MEDIA'      WHERE Codigo = 'ART96-XII'  AND Gravidade IS NULL;

    -- Art. 97 — chapeau: "infrações de natureza gravíssima" (todas).
    UPDATE dbo.TiposInfracao SET Gravidade = 'GRAVISSIMA' WHERE Codigo LIKE 'ART97-%' AND Gravidade IS NULL;

    -- Art. 98 — chapeau: "infrações de natureza gravíssima" (todas).
    UPDATE dbo.TiposInfracao SET Gravidade = 'GRAVISSIMA' WHERE Codigo LIKE 'ART98-%' AND Gravidade IS NULL;

    -- Art. 99 — chapeau: "sujeitas a advertência, suspensão ou destituição de cargo" (piso mais baixo).
    UPDATE dbo.TiposInfracao SET Gravidade = 'GRAVE'  WHERE Codigo = 'ART99-I'    AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'LEVE'   WHERE Codigo = 'ART99-II'   AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'MEDIA'  WHERE Codigo = 'ART99-III'  AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'GRAVE'  WHERE Codigo = 'ART99-IV'   AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'MEDIA'  WHERE Codigo = 'ART99-V'    AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'GRAVE'  WHERE Codigo = 'ART99-VI'   AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'GRAVE'  WHERE Codigo = 'ART99-VII'  AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'GRAVE'  WHERE Codigo = 'ART99-VIII' AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'MEDIA'  WHERE Codigo = 'ART99-IX'   AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'LEVE'   WHERE Codigo = 'ART99-X'    AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'LEVE'   WHERE Codigo = 'ART99-XI'   AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'GRAVE'  WHERE Codigo = 'ART99-XII'  AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'MEDIA'  WHERE Codigo = 'ART99-XIII' AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'GRAVE'  WHERE Codigo = 'ART99-XIV'  AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'GRAVE'  WHERE Codigo = 'ART99-XV'   AND Gravidade IS NULL;
    UPDATE dbo.TiposInfracao SET Gravidade = 'GRAVE'  WHERE Codigo = 'ART99-XVI'  AND Gravidade IS NULL;

    -- Qualquer código não coberto acima (ex: registro criado manualmente entre
    -- migrações) cai em MEDIA por padrão, nunca fica sem gravidade.
    UPDATE dbo.TiposInfracao SET Gravidade = 'MEDIA' WHERE Gravidade IS NULL;
END
GO

-- Art. 144 — infrações de intervenção financeira (gatilho de intervenção
-- administrativa, distinto de disciplina individual, mas cadastrado no mesmo
-- catálogo — mesmo molde Codigo/Nome/ReferenciaRegimento/Gravidade).
IF NOT EXISTS (SELECT 1 FROM dbo.TiposInfracao WHERE Codigo LIKE 'ART144-%')
BEGIN
    INSERT INTO dbo.TiposInfracao (Codigo, Nome, ReferenciaRegimento, Gravidade) VALUES
    ('ART144-I',   '"Gatos" ou Ligações Clandestinas de Energia/Água em Imóveis da Igreja', 'Art. 144, I',   'GRAVE'),
    ('ART144-II',  'Atraso Injustificado no Repasse de Dízimos e Ofertas à Matriz',          'Art. 144, II',  'GRAVE'),
    ('ART144-III', 'Uso de Recursos da Igreja para Despesas Pessoais',                      'Art. 144, III', 'GRAVE'),
    ('ART144-IV',  'Ausência de Notas Fiscais ou Recibos Comprobatórios de Despesas',        'Art. 144, IV',  'MEDIA');
END
GO
