-- ============================================================
-- Migração 158 — v8.3: Consagração e documentação.
--
-- Base legal: Regimento Art. 7º, III; 9º; 10; 67; 73, II e III; 74 e 75. Desenho em docs/plano/fase-8-ministerial-afm.md.
--
--   1) Consagracoes: o número do processo (os documentos da indicação vão como anexo — AnexosGenericos usa número inteiro), por que ele foi encerrado, a homologação
--      (ato do Presidente ou reunião da CLI), a taxa de consagração, a cerimônia, a presença e o diploma (código reservado na impressão; certificado na conclusão).
--      A etapa nova HOMOLOGADO (aguardando a cerimônia) entra no "um processo em andamento por pessoa".
--   2) PareceresCEIConsagracao: o parecer do CEI (Art. 74, III), com a sabatina do Art. 9º §1º, o escrutínio especial do Art. 73, III e a exceção do Pastor não casado
--      (Art. 73, II, b). Um parecer por processo. A fundamentação é sigilosa (só quem tem a permissão "cei" lê).
--   3) CerimoniasConsagracao e CerimoniasComissaoUncao: a cerimônia (Art. 75), com o valor da taxa daquele ano e a Comissão de Unção (mínimo de 4 pastores titulares).
--   4) CertificadosEmitidos.Natureza (CHM, DIPLOMA) e Matriculas_AFM.CHMCertificadoId: o CHM vira documento verificável (Art. 67).
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

-- ---- 1) Consagracoes ----
IF COL_LENGTH(N'dbo.Consagracoes', N'Numero') IS NULL
    ALTER TABLE dbo.Consagracoes ADD Numero INT IDENTITY(1, 1) NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Consagracoes_Numero' AND object_id = OBJECT_ID(N'dbo.Consagracoes'))
    CREATE UNIQUE INDEX UX_Consagracoes_Numero ON dbo.Consagracoes (Numero);
GO
IF COL_LENGTH(N'dbo.Consagracoes', N'MotivoEncerramento') IS NULL
    ALTER TABLE dbo.Consagracoes ADD MotivoEncerramento NVARCHAR(24) NULL;
GO
IF COL_LENGTH(N'dbo.Consagracoes', N'HomologadoEm') IS NULL
    ALTER TABLE dbo.Consagracoes ADD HomologadoEm DATE NULL, HomologadoPor INT NULL, HomologacaoSessaoId INT NULL REFERENCES dbo.Sessoes(SessaoId),
        HomologacaoAto NVARCHAR(200) NULL;
GO
IF COL_LENGTH(N'dbo.Consagracoes', N'TaxaPagaEm') IS NULL
    ALTER TABLE dbo.Consagracoes ADD TaxaPagaEm DATE NULL, TaxaValor DECIMAL(10, 2) NULL, TaxaForma NVARCHAR(10) NULL, TaxaRegistradaPor INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.CerimoniasConsagracao') AND type = N'U')
BEGIN
    CREATE TABLE dbo.CerimoniasConsagracao (
        CerimoniaId     INT IDENTITY PRIMARY KEY,
        DataCerimonia   DATE NOT NULL,
        Local           NVARCHAR(200) NOT NULL,
        Ocasiao         NVARCHAR(12) NOT NULL,   -- AGO | MAGNA_CLI | SOLENE_CLI (Art. 75 caput; Art. 13, II)
        ValorTaxa       DECIMAL(10, 2) NOT NULL, -- Art. 75, I, a: R$ 70,00 em 2026, corrigido a cada ano
        Status          NVARCHAR(12) NOT NULL CONSTRAINT DF_CerimoniasConsagracao_Status DEFAULT N'PLANEJADA',
        CriadaPor       INT NULL,
        CriadaEm        DATETIME2 NOT NULL CONSTRAINT DF_CerimoniasConsagracao_CriadaEm DEFAULT SYSUTCDATETIME(),
        RealizadaPor    INT NULL,
        RealizadaEm     DATETIME2 NULL,
        MotivoCancelamento NVARCHAR(300) NULL,
        CONSTRAINT CK_CerimoniasConsagracao_Ocasiao CHECK (Ocasiao IN (N'AGO', N'MAGNA_CLI', N'SOLENE_CLI')),
        CONSTRAINT CK_CerimoniasConsagracao_Status CHECK (Status IN (N'PLANEJADA', N'REALIZADA', N'CANCELADA')),
        CONSTRAINT CK_CerimoniasConsagracao_Valor CHECK (ValorTaxa > 0 AND ValorTaxa <= 10000)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.CerimoniasComissaoUncao') AND type = N'U')
BEGIN
    CREATE TABLE dbo.CerimoniasComissaoUncao (
        CerimoniaId INT NOT NULL REFERENCES dbo.CerimoniasConsagracao(CerimoniaId),
        MembroId    INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CONSTRAINT PK_CerimoniasComissaoUncao PRIMARY KEY (CerimoniaId, MembroId)
    );
END
GO
IF COL_LENGTH(N'dbo.Consagracoes', N'CerimoniaId') IS NULL
    ALTER TABLE dbo.Consagracoes ADD CerimoniaId INT NULL REFERENCES dbo.CerimoniasConsagracao(CerimoniaId), PresenteCerimonia BIT NULL,
        DiplomaCodigo NVARCHAR(20) NULL, DiplomaCertificadoId INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Consagracoes_DiplomaCodigo' AND object_id = OBJECT_ID(N'dbo.Consagracoes'))
    CREATE UNIQUE INDEX UX_Consagracoes_DiplomaCodigo ON dbo.Consagracoes (DiplomaCodigo) WHERE DiplomaCodigo IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Consagracoes_Encerramento')
    ALTER TABLE dbo.Consagracoes ADD CONSTRAINT CK_Consagracoes_Encerramento CHECK (
        MotivoEncerramento IS NULL OR MotivoEncerramento IN (N'INAPTO_CEI', N'AUSENCIA_CERIMONIA'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Consagracoes_Taxa')
    ALTER TABLE dbo.Consagracoes ADD CONSTRAINT CK_Consagracoes_Taxa CHECK (
        (TaxaPagaEm IS NULL AND TaxaValor IS NULL AND TaxaForma IS NULL)
        OR (TaxaPagaEm IS NOT NULL AND TaxaValor > 0 AND TaxaForma IN (N'PIX', N'BOLETO')));
GO
-- A etapa nova (HOMOLOGADO) também é "em andamento": o índice da v8.2 é refeito com ela.
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Consagracoes_EmAndamento' AND object_id = OBJECT_ID(N'dbo.Consagracoes')
           AND filter_definition NOT LIKE N'%HOMOLOGADO%')
    DROP INDEX UX_Consagracoes_EmAndamento ON dbo.Consagracoes;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Consagracoes_EmAndamento' AND object_id = OBJECT_ID(N'dbo.Consagracoes'))
    CREATE UNIQUE INDEX UX_Consagracoes_EmAndamento ON dbo.Consagracoes (MembroId)
    WHERE CargoAlvo IS NOT NULL AND Status IN (N'PROTOCOLADO', N'EM_ANALISE_CONSELHO', N'AGUARDANDO_PLENARIO', N'HOMOLOGADO');
GO

-- ---- 2) Parecer do CEI ----
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.PareceresCEIConsagracao') AND type = N'U')
BEGIN
    CREATE TABLE dbo.PareceresCEIConsagracao (
        ParecerId                 INT IDENTITY PRIMARY KEY,
        ConsagracaoId             UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.Consagracoes(ConsagracaoId),
        Resultado                 NVARCHAR(8) NOT NULL,
        SabatinaEm                DATE NOT NULL,
        Fundamentacao             NVARCHAR(2000) NULL,   -- sigilosa; a minimização (LGPD) apaga
        SabatinaVidaPregressa     BIT NULL,              -- Art. 9º §1º, I a III (Presbítero, Evangelista e Pastor)
        SabatinaFinanceira        BIT NULL,
        SabatinaDoutrina          BIT NULL,
        EscrutinioConjugal        BIT NOT NULL CONSTRAINT DF_PareceresCEI_Escrutinio DEFAULT 0,   -- Art. 73, III, b
        EscrutinioFundamento      NVARCHAR(20) NULL,     -- TEMPO_IGNORANCIA | EXCECAO_BIBLICA (Art. 73, III, c)
        EscrutinioDocumental      BIT NULL,
        Recasado                  BIT NULL,
        CasamentoAtualEstavel     BIT NULL,              -- Art. 73, III, d
        ExcecaoPastorNaoCasado    NVARCHAR(500) NULL,    -- Art. 73, II, b
        EmitidoPor                INT NOT NULL,
        EmitidoEm                 DATETIME2 NOT NULL CONSTRAINT DF_PareceresCEI_EmitidoEm DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UX_PareceresCEI_Consagracao UNIQUE (ConsagracaoId),
        CONSTRAINT CK_PareceresCEI_Resultado CHECK (Resultado IN (N'APTO', N'INAPTO')),
        CONSTRAINT CK_PareceresCEI_Fundamento CHECK (EscrutinioFundamento IS NULL OR EscrutinioFundamento IN (N'TEMPO_IGNORANCIA', N'EXCECAO_BIBLICA'))
    );
END
GO

-- ---- 4) Documentos: CHM e diploma ----
IF COL_LENGTH(N'dbo.CertificadosEmitidos', N'Natureza') IS NULL
    ALTER TABLE dbo.CertificadosEmitidos ADD Natureza NVARCHAR(12) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_CertificadosEmitidos_Natureza')
    ALTER TABLE dbo.CertificadosEmitidos ADD CONSTRAINT CK_CertificadosEmitidos_Natureza CHECK (Natureza IS NULL OR Natureza IN (N'CHM', N'DIPLOMA'));
GO
IF COL_LENGTH(N'dbo.Matriculas_AFM', N'CHMCertificadoId') IS NULL
    ALTER TABLE dbo.Matriculas_AFM ADD CHMCertificadoId INT NULL;
GO
