-- ============================================================
-- Migração 017 — Cartas de Trânsito (v1.4 — Regimento Art. 130/131/132).
--
-- Documentos oficiais de trânsito eclesiástico:
--   - Carta de Recomendação (Reg. Art. 131 §1º): viajar/visitar sem perder o vínculo.
--   - Carta de Mudança (Reg. Art. 131 §3º): desvinculação formal.
--   - Atestado de Trânsito Supletivo (Reg. Art. 131 §2º, III): emitido pelo CEI.
--
-- A Carta de Mudança é auto-atendimento (o próprio membro solicita pelo Meu Painel)
-- com "declaração de ciência" digital — equivalente à 2ª via assinada de próprio
-- punho (Reg. Art. 131 §3º, II). A partir da confirmação corre o prazo de 30 dias
-- (Reg. Art. 132 §2º, I) para a Secretaria inativar o cadastro e aplicar a
-- minimização do "Registro Histórico Mínimo" (matrícula + nome + data de admissão
-- + data/motivo da saída, preservando o batismo — Reg. Art. 132 §2º, II).
-- Essa minimização é CALCULADA SOB DEMANDA (função GestaoCartas/processar), nunca
-- por job/timer — mesmo espírito de "vencimento calculado na leitura" do projeto.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.CartasTransito') AND type = N'U')
BEGIN
    CREATE TABLE dbo.CartasTransito (
        CartaId            INT IDENTITY PRIMARY KEY,
        MembroId           INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Tipo               NVARCHAR(30) NOT NULL,          -- RECOMENDACAO / MUDANCA / ATESTADO_SUPLETIVO
        Status             NVARCHAR(30) NOT NULL DEFAULT 'SOLICITADA', -- SOLICITADA / CONFIRMADA / EMITIDA / CANCELADA / CONCLUIDA
        Destino            NVARCHAR(150) NULL,             -- igreja/cidade de destino
        MotivoSaida        NVARCHAR(200) NULL,
        DeclaracaoCiencia  NVARCHAR(500) NULL,             -- declaração digital (Reg. Art. 131 §3º, II)
        DataSolicitacao    DATETIME2 DEFAULT SYSUTCDATETIME(),
        DataConfirmacao    DATETIME2 NULL,
        DataEmissao        DATE NULL,
        DataValidade       DATE NULL,                      -- Carta de Recomendação: emissão + 30 dias
        SolicitadoPor      INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        EmitidoPor         INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm           DATETIME2 DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MembroReferencia') AND name = N'DataSaida')
    ALTER TABLE dbo.MembroReferencia ADD DataSaida DATE NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MembroReferencia') AND name = N'MotivoSaida')
    ALTER TABLE dbo.MembroReferencia ADD MotivoSaida NVARCHAR(200) NULL;
GO
