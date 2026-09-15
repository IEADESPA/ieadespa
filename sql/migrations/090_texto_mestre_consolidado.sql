-- ============================================================
-- Migração 090 — Texto Mestre Consolidado (vB.15, retrofit da v2.9)
--
-- Reg. Art. 162 §§2º-4º e Art. 162-B. A v2.9 base guarda "alterações do
-- Regimento" como Documentos soltos (Tipo=REGIMENTO) — sem data de
-- vigência, sem ponteiro pra ata, sem versão consolidada. Pra saber a
-- regra vigente hoje, alguém precisa somar a versão original + todas as
-- alterações em ordem — exatamente o problema que a consolidação existe
-- pra eliminar.
--
-- TextoMestreVersoes: cada linha é uma versão CONSOLIDADA do Regimento
-- (arquivo inteiro, não diff), com vigência e ponteiro opcional pro
-- Documento (Tipo=REGIMENTO ou ATA) que a originou. NumeroVersao é
-- sequencial, calculado na inserção — nunca reescrito.
--
-- ParametrosTextoMestre: 1 linha (mesmo padrão de ParametrosSaida /
-- ParametrosParecerViabilidade), guarda a data da última revisão
-- sistêmica quadrienal (Art. 162-B). Semeada com NULL de propósito — não
-- fabricamos uma data histórica que ninguém informou; a Secretaria define
-- a baseline real na primeira vez que usar a tela.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.TextoMestreVersoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TextoMestreVersoes (
        VersaoId           INT IDENTITY PRIMARY KEY,
        NumeroVersao        INT NOT NULL,
        UrlBlob             NVARCHAR(500) NOT NULL,
        DataVigencia        DATE NOT NULL,
        DocumentoOrigemId   INT NULL REFERENCES dbo.Documentos(DocumentoId),
        TotalArtigos        INT NULL,
        ArtigosTocados      INT NULL,
        RegistradoPor       INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_TextoMestreVersoes_Numero UNIQUE (NumeroVersao)
    );
END
GO

IF OBJECT_ID(N'dbo.ParametrosTextoMestre', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ParametrosTextoMestre (
        ParametroId                 INT NOT NULL PRIMARY KEY CHECK (ParametroId = 1),
        DataUltimaRevisaoSistemica  DATE NULL
    );
    INSERT INTO dbo.ParametrosTextoMestre (ParametroId, DataUltimaRevisaoSistemica) VALUES (1, NULL);
END
GO
