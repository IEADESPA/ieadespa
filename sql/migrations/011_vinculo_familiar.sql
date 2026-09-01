-- ============================================================
-- Migração 011 — Vínculo Familiar (núcleo mínimo, v0.2)
--
-- Cadastro de relacionamentos entre membros (cônjuge, pai/mãe-filho, irmão,
-- sogro/genro/nora) — base para as vedações de nepotismo de fases futuras
-- (v2.6 Conselho Fiscal Art. 43 §3º, v3.1 CEI Art. 91). O cálculo de grau de
-- parentesco por travessia (shared/parentesco.js) só nasce quando um desses
-- consumidores existir de verdade — por isso o tipo SOGRO_GENRO_NORA já entra
-- como vínculo direto cadastrável (ainda não há motor de dedução por travessia).
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.TiposVinculoFamiliar') AND type = N'U')
BEGIN
    CREATE TABLE dbo.TiposVinculoFamiliar (
        TipoVinculoId  INT IDENTITY PRIMARY KEY,
        Codigo         NVARCHAR(30) NOT NULL,
        RotuloDireto   NVARCHAR(100) NOT NULL,
        RotuloInverso  NVARCHAR(100) NULL,
        Simetrico      BIT NOT NULL DEFAULT 0,
        Ativo          BIT NOT NULL DEFAULT 1
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.TiposVinculoFamiliar') AND name = N'UQ_TiposVinculoFamiliar_Codigo')
    CREATE UNIQUE INDEX UQ_TiposVinculoFamiliar_Codigo ON dbo.TiposVinculoFamiliar(Codigo);
GO

INSERT INTO dbo.TiposVinculoFamiliar (Codigo, RotuloDireto, RotuloInverso, Simetrico)
SELECT v.Codigo, v.RotuloDireto, v.RotuloInverso, v.Simetrico FROM (VALUES
    ('CONJUGE',         'Cônjuge de',              NULL,               1),
    ('PAI_FILHO',       'Pai/Mãe de',              'Filho(a) de',      0),
    ('IRMAO',           'Irmão/Irmã de',           NULL,               1),
    ('SOGRO_GENRO_NORA','Sogro/Sogra de',          'Genro/Nora de',    0)
) AS v(Codigo, RotuloDireto, RotuloInverso, Simetrico)
WHERE NOT EXISTS (SELECT 1 FROM dbo.TiposVinculoFamiliar t WHERE t.Codigo = v.Codigo);
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.VinculosFamiliares') AND type = N'U')
BEGIN
    CREATE TABLE dbo.VinculosFamiliares (
        VinculoId        INT IDENTITY PRIMARY KEY,
        MembroId         INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        MembroParenteId  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        TipoVinculoId    INT NOT NULL REFERENCES dbo.TiposVinculoFamiliar(TipoVinculoId),
        CriadoEm         DATETIME2 DEFAULT SYSUTCDATETIME(),
        CriadoPor        INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CONSTRAINT CK_VinculosFamiliares_NaoAutoVinculo CHECK (MembroId <> MembroParenteId)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.VinculosFamiliares') AND name = N'UQ_VinculosFamiliares_Par')
    CREATE UNIQUE INDEX UQ_VinculosFamiliares_Par ON dbo.VinculosFamiliares(MembroId, MembroParenteId, TipoVinculoId);
GO
