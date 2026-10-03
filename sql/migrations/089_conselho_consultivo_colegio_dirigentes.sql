-- ============================================================
-- Migração 089 — Conselho Consultivo Técnico e Colégio de Dirigentes (vB.14)
--
-- A varredura normativa encontrou dois órgãos de apoio que o Regimento cria
-- e que o sistema simplesmente não tinha cadastrados — não é refinamento do
-- que existe, é órgão faltando no organograma.
--
-- Conselho Consultivo Técnico (Art. 31): 3 a 5 membros — reaproveita
-- Assentos/GestaoAssentos com um catálogo de 5 cargos fixos (mesmo padrão
-- de Diretoria/Conselho Fiscal/CEI em shared/diretoria.js), e a vedação de
-- parentesco com a Diretoria Executiva (shared/parentesco.js, já usada por
-- Conselho Fiscal/CEI) passa a valer aqui também.
--
-- Colégio de Dirigentes Congregacionais (Art. 151 §2º): composição
-- AUTOMÁTICA (Pastores de Área + Dirigentes de Congregação, calculado a
-- partir de Lideranca/Papeis — mesmo mecanismo de shared/universo.js já
-- usado pela CLI) — não usa Assentos, não é lista mantida à mão.
--
-- Parecer de Viabilidade (Art. 31): pré-condição de ato patrimonial de alto
-- impacto. O único ato desse tipo que o sistema já modela de verdade é
-- alienação de bem (GestaoAlienacoesBens, v4.11) — "aquisição de imóvel" e
-- "contratação de empréstimo" NÃO têm módulo correspondente no sistema
-- ainda (varredura confirmou: zero ocorrência de "aquisição"/"empréstimo"
-- em todo o código), então o travamento real fica restrito a alienação;
-- os outros dois ficam documentados como gap (README), não fabricados.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

INSERT INTO dbo.Orgaos (Sigla, Nome, QuorumMinimoPct, QuorumDeliberativoPct, FaltasParaPerdaAssento)
SELECT v.Sigla, v.Nome, v.QuorumMinimoPct, v.QuorumDeliberativoPct, v.FaltasParaPerdaAssento
FROM (VALUES
    ('CONSELHO_CONSULTIVO_TECNICO', 'Conselho Consultivo Técnico', NULL, NULL, NULL),
    ('COLEGIO_DIRIGENTES', 'Colégio de Dirigentes Congregacionais', NULL, NULL, NULL)
) AS v(Sigla, Nome, QuorumMinimoPct, QuorumDeliberativoPct, FaltasParaPerdaAssento)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Orgaos o WHERE o.Sigla = v.Sigla);
GO

IF OBJECT_ID(N'dbo.ParametrosParecerViabilidade', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ParametrosParecerViabilidade (
        ParametroId  INT NOT NULL PRIMARY KEY CHECK (ParametroId = 1),
        ValorLimite  DECIMAL(12,2) NOT NULL DEFAULT 50000.00
    );
    INSERT INTO dbo.ParametrosParecerViabilidade (ParametroId, ValorLimite) VALUES (1, 50000.00);
END
GO

IF OBJECT_ID(N'dbo.PareceresViabilidadeAlienacao', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PareceresViabilidadeAlienacao (
        ParecerId      INT IDENTITY PRIMARY KEY,
        AlienacaoId    INT NOT NULL REFERENCES dbo.AlienacoesBens(AlienacaoId),
        Decisao        NVARCHAR(20) NOT NULL,  -- FAVORAVEL | DESFAVORAVEL
        Justificativa  NVARCHAR(500) NULL,
        EmitidoPor     INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO
