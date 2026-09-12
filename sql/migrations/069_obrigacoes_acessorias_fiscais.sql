-- ============================================================
-- Migração 069 — v4.19: Obrigações Acessórias Fiscais (risco de multa).
-- A igreja é IMUNE, não DISPENSADA — a imunidade afasta o imposto, não a
-- obrigação acessória. Multa por não entregar existe mesmo sem imposto.
--   - ECF (obrigatória; multa mínima R$ 500/mês — IN RFB 2.004/2021)
--   - ECD (gatilho R$ 1,2 mi/ano — IN RFB 1.420/2015 art. 3º-A)
--   - eSocial + DCTFWeb (categoria 781 / rubrica 3525 — prebendas)
--   - EFD-Reinf R-4000 (retenções na fonte, dia 15 do mês seguinte)
--   - Calendário + cofre de recibos de entrega
-- ============================================================

-- Calendário de obrigações fiscais (por CNPJ + exercício).
IF OBJECT_ID(N'dbo.ObrigacoesFiscais', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ObrigacoesFiscais (
        ObrigacaoId    INT IDENTITY PRIMARY KEY,
        Tipo           NVARCHAR(30) NOT NULL, -- ECF | ECD | ESOCIAL | DCTFWEB | EFD_REINF | INFORME_RENDIMENTOS
        AnoReferencia  INT NOT NULL,
        Cnpj           VARCHAR(18) NOT NULL,
        PrazoEntrega   DATE NOT NULL,
        Status         NVARCHAR(20) NOT NULL DEFAULT 'PENDENTE', -- PENDENTE | TRANSMITIDA | VENCIDA
        ReciboUrl      NVARCHAR(500) NULL,
        DataTransmissao DATETIME2 NULL,
        Observacao     NVARCHAR(300) NULL,
        RegistradoPor  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_Obrigacao_TipoAno UNIQUE (Tipo, AnoReferencia, Cnpj)
    );
END
GO

-- Retenções na fonte (EFD-Reinf R-4000): natureza do rendimento + competência.
IF OBJECT_ID(N'dbo.RetencoesFonte', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RetencoesFonte (
        RetencaoId        INT IDENTITY PRIMARY KEY,
        NaturezaRendimento NVARCHAR(30) NOT NULL, -- SERVICO_PJ | ALUGUEL_PF | AUTONOMO | IRRF_PREBENDA | OUTROS
        Competencia       CHAR(7) NOT NULL,
        ValorBase         DECIMAL(12,2) NOT NULL,
        ValorRetido       DECIMAL(12,2) NOT NULL,
        Status            NVARCHAR(20) NOT NULL DEFAULT 'PENDENTE', -- PENDENTE | RECOLHIDA
        DataRecolhimento  DATE NULL,
        Observacao        NVARCHAR(300) NULL,
        RegistradoPor     INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO
