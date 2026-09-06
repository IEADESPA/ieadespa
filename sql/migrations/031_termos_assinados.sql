-- ============================================================
-- Migração 031 — Termos de Compromisso/Confidencialidade assinados
-- Trilha de assinatura: quem assinou qual termo, em qual versão, quando.
-- VersaoTermo (não o texto em si) é o que muda em shared/termos.js — trocar a
-- versão faz quem já assinou a antiga voltar a ficar pendente, sem apagar o
-- histórico de assinaturas anteriores (prova documental, Art. 57 §2º).
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.TermosAssinados') AND type = N'U')
BEGIN
    CREATE TABLE dbo.TermosAssinados (
        TermoAssinadoId INT IDENTITY PRIMARY KEY,
        MembroId        INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        TipoTermo       NVARCHAR(40) NOT NULL,
        VersaoTermo     NVARCHAR(20) NOT NULL,
        DataAssinatura  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO
