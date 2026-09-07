-- ============================================================
-- Migração 047 — v4.1.5: correção de rumo (feedback direto do usuário) —
-- não existe "outras entradas" genérica (risco real de compliance/AML: um
-- balde sem categoria nomeada é exatamente o tipo de rubrica que esconde
-- lavagem de dinheiro). No lugar, um catálogo de Categorias de Entrada,
-- configurável como qualquer outro catálogo do sistema (Departamentos,
-- Congregações etc.) — cada entrada tem nome próprio e claro. Dízimo e
-- Oferta continuam existindo, só que agora como duas linhas desse catálogo
-- em vez de um enum fixo no código.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.CategoriasEntrada') AND type = N'U')
BEGIN
    CREATE TABLE dbo.CategoriasEntrada (
        CategoriaId INT IDENTITY PRIMARY KEY,
        Codigo      NVARCHAR(30) NOT NULL UNIQUE,
        Nome        NVARCHAR(150) NOT NULL,
        Ativa       BIT NOT NULL DEFAULT 1
    );
END
GO

INSERT INTO dbo.CategoriasEntrada (Codigo, Nome)
SELECT v.Codigo, v.Nome
FROM (VALUES
    ('DIZIMO', 'Dízimo'),
    ('OFERTA', 'Oferta'),
    ('DEPARTAMENTO', 'Entrada de Departamento'),
    ('OFERTA_CULTO_DEPARTAMENTO', 'Oferta de Culto do Departamento'),
    ('SECRETARIA', 'Entrada de Secretaria'),
    ('REVISTA', 'Entrada de Revista'),
    ('CONGRESSO', 'Entrada de Congresso')
) AS v(Codigo, Nome)
WHERE NOT EXISTS (SELECT 1 FROM dbo.CategoriasEntrada c WHERE c.Codigo = v.Codigo);
GO
