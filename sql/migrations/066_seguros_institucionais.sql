-- ============================================================
-- Migração 066 — v4.16: Seguros institucionais (gap da varredura).
-- Art. 65-A: apólice MANDATÓRIA para Templo Sede e grandes eventos, com
-- cobertura mínima de Incêndio, Danos Elétricos e Responsabilidade Civil
-- (RC); a ausência é negligência grave da gestão.
-- Art. 42-A: Seguro de Responsabilidade Civil para Administradores
-- (Diretoria/Tesouraria), sem cobertura para dolo/fraude/ato ilícito.
-- ============================================================

IF OBJECT_ID(N'dbo.ApolicesSeguro', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ApolicesSeguro (
        ApoliceId      INT IDENTITY PRIMARY KEY,
        Tipo           NVARCHAR(30) NOT NULL, -- TEMPLO_SEDE | GRANDE_EVENTO | RC_ADMINISTRADORES | OUTROS
        Seguradora     NVARCHAR(150) NOT NULL,
        NumeroApolice  NVARCHAR(50) NOT NULL,
        DataInicio     DATE NOT NULL,
        DataFim        DATE NOT NULL,
        Coberturas     NVARCHAR(500) NOT NULL, -- lista separada por vírgula (INCENDIO,DANOS_ELETRICOS,RC,...)
        ValorPremio    DECIMAL(12,2) NULL,
        BemId          INT NULL REFERENCES dbo.BensPatrimoniais(BemId), -- Templo Sede vinculado
        EventoDescricao NVARCHAR(300) NULL, -- para GRANDE_EVENTO
        DocumentoUrl   NVARCHAR(500) NULL,
        Status         NVARCHAR(20) NOT NULL DEFAULT 'ATIVA', -- ATIVA | CANCELADA
        Observacao     NVARCHAR(300) NULL,
        RegistradoPor  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO
