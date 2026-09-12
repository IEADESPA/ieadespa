-- ============================================================
-- Migração 067 — v4.17: Anexo de Parâmetros Monetários (gap da varredura).
-- Art. 65: valores monetários fixos são corrigidos automaticamente a cada
-- 12 meses por IPCA ou salário-mínimo. Art. 162-C §§1-2: parâmetros
-- quantitativos (tetos, taxas, valores de referência) são fixados por
-- Resolução Normativa da CLI, e a Secretaria Geral mantém o "Anexo Único".
-- ============================================================

-- Resoluções Normativas da CLI que fixaram/atualizaram os valores.
IF OBJECT_ID(N'dbo.ResolucoesNormativas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ResolucoesNormativas (
        ResolucaoId    INT IDENTITY PRIMARY KEY,
        Numero         NVARCHAR(30) NOT NULL,
        DataResolucao  DATE NOT NULL,
        Assunto        NVARCHAR(300) NOT NULL,
        RegistradoPor  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Valores monetários fixos (tetos, taxas, valores de referência).
IF OBJECT_ID(N'dbo.ValoresMonetarios', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ValoresMonetarios (
        ValorId             INT IDENTITY PRIMARY KEY,
        Sigla               NVARCHAR(40) NOT NULL,
        Nome                NVARCHAR(150) NOT NULL,
        Valor               DECIMAL(12,2) NOT NULL,
        Indexador           NVARCHAR(20) NOT NULL DEFAULT 'IPCA', -- IPCA | SALARIO_MINIMO
        Unidade             NVARCHAR(10) NOT NULL DEFAULT 'R$',   -- R$ | % | OUTRO
        ResolucaoId         INT NULL REFERENCES dbo.ResolucoesNormativas(ResolucaoId),
        DataUltimaCorrecao  DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
        Ativo               BIT NOT NULL DEFAULT 1
    );
END
GO

-- Seed inicial (valores já praticados no sistema — referência, editáveis).
INSERT INTO dbo.ValoresMonetarios (Sigla, Nome, Valor, Indexador, Unidade, DataUltimaCorrecao)
SELECT v.Sigla, v.Nome, v.Valor, v.Indexador, v.Unidade, CAST(SYSUTCDATETIME() AS DATE) FROM (VALUES
    ('ALCADA_AREA',        'Teto de alçada — Área (v4.5)',          1000.00, 'IPCA', 'R$'),
    ('ALCADA_DISTRITO',    'Teto de alçada — Distrito (v4.5)',      5000.00, 'IPCA', 'R$'),
    ('ALCADA_GLOBAL',      'Teto de alçada — Global (v4.5)',       20000.00, 'IPCA', 'R$'),
    ('QUATRO_OLHOS',       'Valor crítico dos Quatro Olhos (v4.12)',10000.00, 'IPCA', 'R$'),
    ('COTACOES',           'Valor de referência p/ 3 cotações (v4.5)', 1000.00, 'IPCA', 'R$'),
    ('DIZIMO_INSTITUCIONAL','Dízimo institucional do Distrito (v4.15)', 10.00, 'IPCA', '%')
) AS v(Sigla, Nome, Valor, Indexador, Unidade)
WHERE NOT EXISTS (SELECT 1 FROM dbo.ValoresMonetarios vm WHERE vm.Sigla = v.Sigla);
GO
