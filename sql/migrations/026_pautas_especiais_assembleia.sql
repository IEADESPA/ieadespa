-- ============================================================
-- Migração 026 — Pautas especiais da Assembleia Geral (v2.2).
--
-- Materias (Art. 18 — competências privativas, códigos separados por vírgula)
-- e ReformaNucleoFundamental (Art. 70/71) — a classificação (AGO/AGE Geral/AGE
-- Especial) e o quórum aplicável passam a ser DERIVADOS dessas matérias
-- (shared/estatuto.js: derivarClassificacaoAssembleia), não escolhidos
-- diretamente por quem convoca. VinculadaSessaoId e TipoSessao já existiam
-- desde as migrações 001/025 — aqui só usa VinculadaSessaoId de verdade pela
-- primeira vez, pra reconvocação do Art. 21, II, "c".
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Sessoes') AND name = N'Materias')
    ALTER TABLE dbo.Sessoes ADD Materias NVARCHAR(500) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Sessoes') AND name = N'ReformaNucleoFundamental')
    ALTER TABLE dbo.Sessoes ADD ReformaNucleoFundamental BIT NOT NULL DEFAULT 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Sessoes') AND name = N'QuorumTipo')
    ALTER TABLE dbo.Sessoes ADD QuorumTipo NVARCHAR(30) NOT NULL DEFAULT 'GERAL';
GO
