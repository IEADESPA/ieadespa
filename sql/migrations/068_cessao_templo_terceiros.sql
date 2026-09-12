-- ============================================================
-- Migração 068 — v4.18: Cessão de templo a terceiros (gap da varredura).
-- Art. 156: o templo pode ser cedido a solenidades da comunidade, como
-- concessão precária sujeita à aprovação da Diretoria, com censura musical
-- (lista aprovada 48h antes), Taxa de Zeladoria (ressarcimento, não aluguel),
-- Termo de Responsabilidade por danos e vedação a comércio/coaches.
-- ============================================================

-- Categoria de entrada para a Taxa de Zeladoria (receita acessória).
IF NOT EXISTS (SELECT 1 FROM dbo.CategoriasEntrada WHERE Codigo = 'CESSAO_TEMPLO')
    INSERT INTO dbo.CategoriasEntrada (Codigo, Nome) VALUES ('CESSAO_TEMPLO', 'Cessão de Templo (Taxa de Zeladoria)');
GO

-- Cessões de templo para eventos de terceiros.
IF OBJECT_ID(N'dbo.CessoesTemplo', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CessoesTemplo (
        CessaoId                 INT IDENTITY PRIMARY KEY,
        CongregacaoId            INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        SolicitanteNome          NVARCHAR(200) NOT NULL,
        SolicitanteContato       NVARCHAR(200) NULL,
        TipoEvento               NVARCHAR(20) NOT NULL, -- CASAMENTO | VELORIO | EVENTO_SOCIAL | OUTROS
        DataEvento               DATE NOT NULL,
        HoraInicio               NVARCHAR(5) NULL,
        HoraFim                  NVARCHAR(5) NULL,
        TaxaZeladoria            DECIMAL(10,2) NOT NULL DEFAULT 0,
        IsencaoTaxa              BIT NOT NULL DEFAULT 0, -- isenção social (Art. 156 §2º III)
        ListaMusicalAprovada     BIT NOT NULL DEFAULT 0, -- censura musical (Art. 156 §1º I)
        TermoResponsabilidadeUrl NVARCHAR(500) NULL,     -- Termo de Responsabilidade (Art. 156 §4º II)
        ContaReceberId           INT NULL REFERENCES dbo.ContasAReceber(ContaReceberId),
        Status                   NVARCHAR(20) NOT NULL DEFAULT 'SOLICITADA', -- SOLICITADA | AUTORIZADA | REJEITADA | CONCLUIDA | CANCELADA
        AprovadoPor              INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        MotivoRejeicao           NVARCHAR(300) NULL,
        RegistradoPor            INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm                 DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO
