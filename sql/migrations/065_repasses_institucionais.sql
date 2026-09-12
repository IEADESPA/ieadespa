-- ============================================================
-- Migração 065 — v4.15: Repasses institucionais.
-- Art. 126-N, I (Regimento): o Distrito retém 100% para expansão local e
-- repassa apenas o "Dízimo Institucional" (10% da arrecadação líquida
-- consolidada) à Sede Geral. Art. 144, II: atraso injustificado no repasse
-- de dízimos/ofertas das Congregações à Matriz é infração de intervenção.
-- ============================================================

-- Parâmetros do repasse institucional (nunca hardcoded).
IF OBJECT_ID(N'dbo.ParametrosRepasseInstitucional', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ParametrosRepasseInstitucional (
        ParametroId                    INT NOT NULL PRIMARY KEY CHECK (ParametroId = 1),
        PercentualDizimoInstitucional  DECIMAL(5,2) NOT NULL DEFAULT 10.00,
        DiasTolerancia                 INT NOT NULL DEFAULT 5
    );
    INSERT INTO dbo.ParametrosRepasseInstitucional (ParametroId, PercentualDizimoInstitucional, DiasTolerancia) VALUES (1, 10.00, 5);
END
GO

-- Repasses institucionais (congregação/departamento/distrito → Sede).
IF OBJECT_ID(N'dbo.RepassesInstitucionais', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RepassesInstitucionais (
        RepasseId               INT IDENTITY PRIMARY KEY,
        OrigemTipo              NVARCHAR(20) NOT NULL, -- CONGREGACAO | DEPARTAMENTO | DISTRITO
        OrigemId                INT NOT NULL,
        OrigemNome              NVARCHAR(200) NOT NULL,
        MesReferencia           CHAR(7) NOT NULL,
        ValorArrecadadoLiquido  DECIMAL(12,2) NOT NULL,
        Percentual              DECIMAL(5,2) NOT NULL,
        ValorRepasse            DECIMAL(12,2) NOT NULL,
        Status                  NVARCHAR(20) NOT NULL DEFAULT 'PENDENTE', -- PENDENTE | REPASSADO
        DataRepasse             DATETIME2 NULL,
        RepassadoPor            INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoPor           INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm                DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_RepasseOrigemMes UNIQUE (OrigemTipo, OrigemId, MesReferencia)
    );
END
GO
