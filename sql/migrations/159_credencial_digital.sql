-- ============================================================
-- Migração 159 — v8.4: Credencial digital com QR Code.
--
-- Base legal: Regimento Art. 76 (credencial digital, sem validade impressa, QR que consulta a Sede em tempo real, gratuita, impressão física só na Secretaria Geral);
-- Art. 69 §3º e 77 (credencial do obreiro inativo suspensa e reativada); Art. 95 §2º, IV, a (exclusão: recolhimento da credencial). Desenho em
-- docs/plano/fase-8-ministerial-afm.md.
--
--   CredenciaisEclesiasticas: uma linha por via emitida. Uma credencial VÁLIDA por pessoa (índice filtrado); a nova via substitui a anterior (SUBSTITUIDA) e o
--   cancelamento a encerra (CANCELADA) — nada se apaga. O código de segurança (16 caracteres, o mesmo alfabeto dos certificados) é o que o QR carrega. O pedido de
--   impressão e a impressão registrada pela Secretaria ficam na própria via.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.CredenciaisEclesiasticas') AND type = N'U')
BEGIN
    CREATE TABLE dbo.CredenciaisEclesiasticas (
        CredencialId            INT IDENTITY PRIMARY KEY,
        MembroId                INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Via                     INT NOT NULL,
        Codigo                  NVARCHAR(20) NOT NULL,
        Situacao                NVARCHAR(12) NOT NULL CONSTRAINT DF_Credenciais_Situacao DEFAULT N'VALIDA',
        EmitidaEm               DATETIME2 NOT NULL CONSTRAINT DF_Credenciais_EmitidaEm DEFAULT SYSUTCDATETIME(),
        EmitidaPor              INT NULL,
        EncerradaEm             DATETIME2 NULL,
        EncerradaPor            INT NULL,
        MotivoEncerramento      NVARCHAR(300) NULL,
        ImpressaoSolicitadaEm   DATETIME2 NULL,
        ImpressaEm              DATETIME2 NULL,
        ImpressaPor             INT NULL,
        CONSTRAINT UX_Credenciais_Codigo UNIQUE (Codigo),
        CONSTRAINT UX_Credenciais_Via UNIQUE (MembroId, Via),
        CONSTRAINT CK_Credenciais_Situacao CHECK (Situacao IN (N'VALIDA', N'SUBSTITUIDA', N'CANCELADA')),
        CONSTRAINT CK_Credenciais_Encerramento CHECK ((Situacao = N'VALIDA' AND EncerradaEm IS NULL) OR (Situacao <> N'VALIDA' AND EncerradaEm IS NOT NULL)),
        CONSTRAINT CK_Credenciais_Via CHECK (Via >= 1)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Credenciais_Valida' AND object_id = OBJECT_ID(N'dbo.CredenciaisEclesiasticas'))
    CREATE UNIQUE INDEX UX_Credenciais_Valida ON dbo.CredenciaisEclesiasticas (MembroId) WHERE Situacao = N'VALIDA';
GO
