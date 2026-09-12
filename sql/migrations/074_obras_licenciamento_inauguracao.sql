-- ============================================================
-- Migração 074 — v4.24: Obras, licenciamento e inauguração de templos.
-- Art. 87: pedra fundamental, orçamento e cronograma da obra; a
-- inauguração é travada de verdade (não aviso) sem AVCB e Alvará/Habite-se
-- vigentes — o Regimento veda inaugurar templo clandestino (§2º, I), e a
-- consequência de descumprir é interdição e responsabilização pessoal.
-- Placa de inauguração não pode ter nome de doador/político (§3º). Obra
-- nova exige eficiência energética (Art. 162-A §2º).
-- ============================================================

-- Ficha de obra por congregação — orçamento e cronograma físico-financeiro
-- (mesmo espírito do motor de projetos do PDQ, v4.8), amarrado ao imóvel
-- resultante (BemId, quando já existir em BensPatrimoniais/v4.11).
IF OBJECT_ID(N'dbo.ObrasTemplo', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ObrasTemplo (
        ObraId                          INT IDENTITY PRIMARY KEY,
        CongregacaoId                   INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        BemId                           INT NULL REFERENCES dbo.BensPatrimoniais(BemId),
        Titulo                          NVARCHAR(200) NOT NULL,
        EhObraNova                      BIT NOT NULL DEFAULT 1, -- obra nova exige eficiência energética (Art. 162-A §2º)
        DataPedraFundamental            DATE NULL,               -- Art. 87 §1º
        OrcamentoPrevisto               DECIMAL(12,2) NOT NULL,
        DataInicioPrevista              DATE NOT NULL,
        DataFimPrevista                 DATE NOT NULL,
        Status                          NVARCHAR(20) NOT NULL DEFAULT 'PLANEJAMENTO', -- PLANEJAMENTO | EM_ANDAMENTO | PARALISADA | CONCLUIDA | INAUGURADA
        PlacaNomesConfirmados           BIT NOT NULL DEFAULT 0, -- checklist: nomes obrigatórios da placa presentes
        PlacaSemDoadorPoliticoConfirmado BIT NOT NULL DEFAULT 0, -- checklist: vedação de nome de doador/político (Art. 87 §3º)
        EficienciaEnergeticaConfirmada  BIT NOT NULL DEFAULT 0, -- Art. 162-A §2º — obrigatório só se EhObraNova
        DataInauguracao                 DATE NULL,
        InauguradoPor                   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoPor                   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm                        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Cronograma físico-financeiro — marcos com percentual previsto x
-- realizado, e valor previsto x gasto real (vinculado a uma Saída já
-- lançada em v4.5, quando houver).
IF OBJECT_ID(N'dbo.ObraMarcos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ObraMarcos (
        MarcoId                     INT IDENTITY PRIMARY KEY,
        ObraId                      INT NOT NULL REFERENCES dbo.ObrasTemplo(ObraId),
        Descricao                   NVARCHAR(300) NOT NULL,
        DataPrevista                DATE NOT NULL,
        DataConclusao               DATE NULL,
        PercentualFisicoPrevisto    DECIMAL(5,2) NOT NULL,
        PercentualFisicoRealizado   DECIMAL(5,2) NOT NULL DEFAULT 0,
        ValorPrevisto               DECIMAL(12,2) NOT NULL,
        SaidaId                     INT NULL REFERENCES dbo.SaidasTesouraria(SaidaId),
        RegistradoPor               INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm                    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- ImoveisSituacaoFiscal (v4.21) ganha AVCB e Alvará/Habite-se — mesmo
-- espírito de IPTU/ITBI já existentes: vigência e alerta de vencimento
-- calculados na leitura, agora também travando a inauguração (não só
-- avisando) via ObrasTemplo.
IF COL_LENGTH('dbo.ImoveisSituacaoFiscal', 'AvcbNumero') IS NULL
BEGIN
    ALTER TABLE dbo.ImoveisSituacaoFiscal ADD
        AvcbNumero        NVARCHAR(50) NULL,
        AvcbVigenciaFim   DATE NULL,
        AvcbDocumentoUrl  NVARCHAR(500) NULL,
        AlvaraNumero        NVARCHAR(50) NULL,
        AlvaraVigenciaFim   DATE NULL,
        AlvaraDocumentoUrl  NVARCHAR(500) NULL;
END
GO
