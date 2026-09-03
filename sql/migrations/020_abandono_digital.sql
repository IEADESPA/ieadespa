-- ============================================================
-- Migração 020 — Abandono Eclesiástico Digital (Estatuto Art. 11, V e Art. 12).
--
-- Art. 12 §1º: compete à Secretaria Geral manter atualizada a relação de Canais
-- Oficiais de Comunicação — vedado contar conta/telefone pessoal de dirigente/obreiro
-- como canal oficial (julgamento humano no cadastro, o sistema não valida isso).
--
-- Art. 12 §2º: a declaração de Abandono Digital pressupõe o registro, pela Secretaria
-- Geral, de ao menos 2 tentativas de contato por canais distintos, incluída uma
-- notificação final que reabre o prazo de 15 dias do procedimento sumário (Art. 11
-- §3º) — sob pena de nulidade do ato declaratório.
--
-- O procedimento sumário em si (notificação -> 15 dias -> homologação CLI -> recurso
-- de 30 dias) já existe desde a migração 019 (Abandono Material) — aqui só generaliza
-- ProcedimentosAbandono com um Tipo, pra servir aos dois.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.CanaisOficiaisComunicacao') AND type = N'U')
BEGIN
    CREATE TABLE dbo.CanaisOficiaisComunicacao (
        CanalId INT IDENTITY PRIMARY KEY,
        Sigla   NVARCHAR(30) NOT NULL,
        Nome    NVARCHAR(150) NOT NULL,
        Ativo   BIT NOT NULL DEFAULT 1
    );
    INSERT INTO dbo.CanaisOficiaisComunicacao (Sigla, Nome) VALUES
        (N'WHATSAPP_INSTITUCIONAL', N'WhatsApp institucional da Secretaria'),
        (N'EMAIL_OFICIAL', N'E-mail oficial da IEADESPA'),
        (N'SISTEMA', N'Sistema/Meu Painel');
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.TentativasContatoAbandono') AND type = N'U')
BEGIN
    CREATE TABLE dbo.TentativasContatoAbandono (
        TentativaId   INT IDENTITY PRIMARY KEY,
        MembroId      INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CanalId       INT NOT NULL REFERENCES dbo.CanaisOficiaisComunicacao(CanalId),
        DataTentativa DATE NOT NULL,
        Observacao    NVARCHAR(300) NULL,
        RegistradoPor INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm      DATETIME2 DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ProcedimentosAbandono') AND name = N'Tipo')
    ALTER TABLE dbo.ProcedimentosAbandono ADD Tipo NVARCHAR(20) NOT NULL DEFAULT 'MATERIAL'; -- MATERIAL / DIGITAL
GO
