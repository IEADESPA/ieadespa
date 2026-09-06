-- ============================================================
-- Migração 033 — v2.8 (Parte B): Tramitação de Projetos e Parecer de
-- Comissões (Regimento, Art. 24-25) — etapa que antecede uma Enquete
-- vinculante: todo projeto protocolado vai pra CCJ + comissão temática, que
-- têm 15 dias pra emitir parecer (calculado na leitura, mesmo padrão de
-- ProcessosDisciplinares).
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Projetos') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Projetos (
        ProjetoId        INT IDENTITY PRIMARY KEY,
        Protocolo        NVARCHAR(30) NOT NULL,
        AutorMembroId    INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Titulo           NVARCHAR(200) NOT NULL,
        Texto            NVARCHAR(MAX) NOT NULL,
        ComissaoTematica NVARCHAR(10) NOT NULL,     -- CFO | CEP
        Status           NVARCHAR(30) NOT NULL DEFAULT 'EM_PARECER', -- EM_PARECER | APTO_VOTACAO | ARQUIVADO
        RegimeUrgencia   BIT NOT NULL DEFAULT 0,
        DataProtocolo    DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.PareceresComissao') AND type = N'U')
BEGIN
    CREATE TABLE dbo.PareceresComissao (
        ParecerId    INT IDENTITY PRIMARY KEY,
        ProjetoId    INT NOT NULL REFERENCES dbo.Projetos(ProjetoId),
        Sigla        NVARCHAR(10) NOT NULL,
        Parecer      NVARCHAR(20) NULL,     -- FAVORAVEL | CONTRARIO
        DataEmissao  DATE NULL
    );
END
GO
