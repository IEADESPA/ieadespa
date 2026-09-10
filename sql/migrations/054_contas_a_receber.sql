-- ============================================================
-- Migração 054 — v4.6: Contas a Receber. Registro de valor ESPERADO,
-- ainda não recebido (acordo de parcelamento, boleto emitido pra
-- terceiro) — não conta no Centro de Custo (v4.1.3) enquanto não virar um
-- LancamentoTesouraria de verdade na confirmação (não duplica dinheiro,
-- só antecipa a visibilidade de "isso ainda vai entrar"). "Vencido" é
-- CALCULADO NA LEITURA a partir da data de vencimento, nunca marcado à
-- mão.
-- ============================================================

IF OBJECT_ID(N'dbo.ContasAReceber', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ContasAReceber (
        ContaReceberId  INT IDENTITY PRIMARY KEY,
        CongregacaoId   INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        DizimistaId     INT NULL REFERENCES dbo.Dizimistas(DizimistaId),
        NomeAvulso      NVARCHAR(200) NULL,
        Tipo            NVARCHAR(30) NOT NULL, -- Codigo de CategoriasEntrada (o que vira quando confirmado)
        Descricao       NVARCHAR(300) NULL,
        Valor           DECIMAL(10,2) NOT NULL,
        DataVencimento  DATE NOT NULL,
        CampanhaId      INT NULL REFERENCES dbo.Campanhas(CampanhaId),
        Status          NVARCHAR(20) NOT NULL DEFAULT 'PREVISTO', -- PREVISTO | RECEBIDO | CANCELADO ("VENCIDO" é calculado, não gravado)
        LancamentoId    INT NULL REFERENCES dbo.LancamentosTesouraria(LancamentoId), -- preenchido só na confirmação
        MotivoCancelamento NVARCHAR(300) NULL,
        RegistradoPor   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        ConfirmadoPor   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ConfirmadoEm    DATETIME2 NULL,
        CanceladoPor    INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CanceladoEm     DATETIME2 NULL
    );
END
GO
