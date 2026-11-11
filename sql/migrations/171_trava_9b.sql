-- ============================================================
-- Migração 171 — Trava de Revisão 9-B (v9.4 e v9.5; a v9.6 saiu do plano em 11/11/2026).
--
--   CamposMissionarios.Versao:      a edição do campo confere a versão (como Bairros e Critérios da v9.5): antes, quem salvava um formulário
--                                   aberto antes desfazia a mudança do outro — inclusive a divulgação RESTRITA voltando a PÚBLICA (o mural expunha o lugar).
--   EnvioSustentoValores.CliSessaoId e CliEm: o aumento do sustento passa pela CLI (Estatuto, Art. 58 §4º: o pagamento a obreiros só não é
--                                   distribuição de resultado com a prévia aprovação da CLI) — a reunião que aprovou fica gravada com o valor.
--
-- Idempotente: seguro para reexecutar sem apagar dados. Cada ALTER em batch próprio (GO).
-- ============================================================

IF COL_LENGTH(N'dbo.CamposMissionarios', N'Versao') IS NULL
    ALTER TABLE dbo.CamposMissionarios ADD Versao INT NOT NULL CONSTRAINT DF_CamposMissionarios_Versao DEFAULT 0;
GO

IF COL_LENGTH(N'dbo.EnvioSustentoValores', N'CliSessaoId') IS NULL
    ALTER TABLE dbo.EnvioSustentoValores ADD CliSessaoId INT NULL CONSTRAINT FK_EnvioSustentoValores_Sessao REFERENCES dbo.Sessoes(SessaoId);
GO
IF COL_LENGTH(N'dbo.EnvioSustentoValores', N'CliEm') IS NULL
    ALTER TABLE dbo.EnvioSustentoValores ADD CliEm DATE NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_EnvioSustentoValores_Cli' AND parent_object_id = OBJECT_ID(N'dbo.EnvioSustentoValores'))
    ALTER TABLE dbo.EnvioSustentoValores ADD CONSTRAINT CK_EnvioSustentoValores_Cli CHECK ((CliSessaoId IS NULL AND CliEm IS NULL) OR (CliSessaoId IS NOT NULL AND CliEm IS NOT NULL));
GO
