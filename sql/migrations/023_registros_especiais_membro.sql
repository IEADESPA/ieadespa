-- ============================================================
-- Migração 023 — Registros especiais do membro (v1.9 — gap da varredura
-- Estatuto/Regimento completa).
--
-- Cobre: Registro de Casamentos ministrados pela igreja (Reg. Art. 83) — hoje só
-- o batismo tem rastro (DataBatismo), casamento não tinha lugar nenhum — e
-- Licença Eclesiástica automática por candidatura política (Reg. Art. 157 §2º),
-- com status próprio no catálogo StatusMembro, distinto do LICENÇA genérico
-- (v1.6), já que o retorno depende de decisão da Diretoria, não é automático.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Casamentos') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Casamentos (
        CasamentoId          INT IDENTITY PRIMARY KEY,
        MembroId              INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        -- Cônjuge: opcional por matrícula (se também for membro cadastrado) + nome
        -- em texto (fallback pra cônjuge de fora) — pelo menos um dos dois precisa
        -- vir preenchido (validado em código, não em constraint).
        MembroConjugeId       INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        NomeConjuge           NVARCHAR(200) NULL,
        Celebrante            NVARCHAR(200) NULL,
        Modalidade            NVARCHAR(30) NOT NULL, -- CIVIL_E_RELIGIOSO / SOMENTE_RELIGIOSO (fixo em código)
        DataHabilitacaoCivil  DATE NULL,              -- validade de 90 dias (Art. 83) — checado em código, não bloqueante
        DataCasamento         DATE NOT NULL,
        RegistradoCartorio    BIT NOT NULL DEFAULT 0,
        DataRegistroCartorio  DATE NULL,
        CriadoPor             INT NULL,
        CriadoEm              DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.LicencasCandidatura') AND type = N'U')
BEGIN
    CREATE TABLE dbo.LicencasCandidatura (
        LicencaId            INT IDENTITY PRIMARY KEY,
        MembroId              INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DataPleito            DATE NOT NULL,
        DataInicioLicenca     DATE NOT NULL, -- calculado em código: DataPleito - 90 dias
        Status                NVARCHAR(20) NOT NULL DEFAULT 'EM_LICENCA', -- EM_LICENCA / RETORNOU / NAO_RETORNOU
        DataRetornoDecidida   DATE NULL,
        ObservacaoRetorno     NVARCHAR(300) NULL,
        CriadoPor             INT NULL,
        CriadoEm              DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Mesmo padrão de seed do FALECIDO (019): StatusMembro é catálogo editável por
-- tela (GestaoCatalogos), não hardcoded — só o seed inicial vem daqui.
IF NOT EXISTS (SELECT 1 FROM dbo.StatusMembro WHERE Sigla = N'LICENCA_CANDIDATURA')
    INSERT INTO dbo.StatusMembro (Sigla, Nome) VALUES (N'LICENCA_CANDIDATURA', N'Licença por Candidatura');
GO
