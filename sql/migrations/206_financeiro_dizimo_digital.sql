-- ============================================================
-- Migração 206 — FASE 10, Financeiro (módulo 2), incremento 4: O DÍZIMO DIGITAL (tela aprovada r22 "r22-dizimo-digital", opção 1).
--
-- FinDizimosDigitais: o Pix que o membro informa na página dele (raro: o normal é entregar à tesouraria e levar o recibo de papel).
--   - Quem deu é o membro da sessão (MembroId) e a congregação é a dele quando informou (CongregacaoId): nada disso vem do corpo do pedido.
--   - O valor (DECIMAL(14,2), sempre positivo) e o dia e a hora do Pix como o membro informou (PixEm, hora de Belém).
--   - A situação: INFORMADO (esperando a tesouraria), LIGADO (a tesouraria escreveu o recibo de papel e ligou o Pix àquela folha: a folha fica
--     reservada para ele e se lança na planilha, preenchida com o Pix) ou EXCLUIDO (com o motivo; o membro é avisado do porquê).
--   - Ligado: a folha, o bloco e a entrega (a SaidaId aponta para uma SAÍDA do mesmo bloco, a chave composta da 202), quem ligou, quando e se foi
--     a Tesouraria Geral. Uma folha, um Pix: o índice único filtrado na folha.
--   - Nada se apaga: a exclusão muda a situação e guarda o motivo, quem e quando.
-- A regra do aviso ao membro (motor de notificações da vB.2): DIZIMO_DIGITAL_EXCLUIDO.
--
-- Idempotente: a tabela, cada índice e a regra só são criados se ainda não existirem.
-- ============================================================

IF OBJECT_ID(N'dbo.FinDizimosDigitais', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FinDizimosDigitais (
        DizimoDigitalId  INT IDENTITY PRIMARY KEY,
        MembroId         INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CongregacaoId    INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        Valor            DECIMAL(14,2) NOT NULL,
        PixEm            DATETIME2(0) NOT NULL,
        InformadoEm      DATETIME2 NOT NULL CONSTRAINT DF_FinDizimosDigitais_InformadoEm DEFAULT SYSUTCDATETIME(),
        Situacao         NVARCHAR(9) NOT NULL CONSTRAINT DF_FinDizimosDigitais_Situacao DEFAULT N'INFORMADO',
        BlocoId          INT NULL REFERENCES dbo.FinBlocos(BlocoId),
        Folha            INT NULL,
        SaidaId          INT NULL,
        SaidaTipo        AS CAST(N'SAIDA' AS NVARCHAR(10)) PERSISTED,
        LigadoPor        INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        LigadoEm         DATETIME2 NULL,
        LigadoPelaGeral  BIT NULL,
        Motivo           NVARCHAR(300) NULL,
        ExcluidoPor      INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ExcluidoEm       DATETIME2 NULL,
        CONSTRAINT FK_FinDizimosDigitais_SaidaDoBloco FOREIGN KEY (SaidaId, BlocoId, SaidaTipo) REFERENCES dbo.FinLivroBlocos (RegistroId, BlocoId, Tipo),
        CONSTRAINT CK_FinDizimosDigitais_Situacao CHECK (Situacao IN (N'INFORMADO', N'LIGADO', N'EXCLUIDO')),
        CONSTRAINT CK_FinDizimosDigitais_Valor CHECK (Valor > 0),
        -- ligado: a folha, o bloco, a entrega, quem, quando e se foi a Geral, todos juntos; fora do ligado, nenhum deles
        CONSTRAINT CK_FinDizimosDigitais_Ligado CHECK (
            (Situacao = N'LIGADO' AND Folha IS NOT NULL AND BlocoId IS NOT NULL AND SaidaId IS NOT NULL AND LigadoPor IS NOT NULL AND LigadoEm IS NOT NULL AND LigadoPelaGeral IS NOT NULL)
            OR (Situacao <> N'LIGADO' AND Folha IS NULL AND BlocoId IS NULL AND SaidaId IS NULL AND LigadoPor IS NULL AND LigadoEm IS NULL AND LigadoPelaGeral IS NULL)),
        -- excluído: o motivo (não vazio), quem e quando, todos juntos; fora do excluído, nenhum deles
        CONSTRAINT CK_FinDizimosDigitais_Excluido CHECK (
            (Situacao = N'EXCLUIDO' AND Motivo IS NOT NULL AND LEN(LTRIM(RTRIM(Motivo))) > 0 AND ExcluidoPor IS NOT NULL AND ExcluidoEm IS NOT NULL)
            OR (Situacao <> N'EXCLUIDO' AND Motivo IS NULL AND ExcluidoPor IS NULL AND ExcluidoEm IS NULL))
    );
END
GO
-- uma folha, um Pix (a folha reservada não se liga a outro)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_FinDizimosDigitais_Folha' AND object_id = OBJECT_ID(N'dbo.FinDizimosDigitais'))
    CREATE UNIQUE INDEX UX_FinDizimosDigitais_Folha ON dbo.FinDizimosDigitais (Folha) WHERE Folha IS NOT NULL;
GO
-- os Pix de cada congregação por situação (o aviso "Há 2 dízimos digitais para ligar", a trava do salvar e a lista da tesouraria)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinDizimosDigitais_CongregacaoSituacao' AND object_id = OBJECT_ID(N'dbo.FinDizimosDigitais'))
    CREATE INDEX IX_FinDizimosDigitais_CongregacaoSituacao ON dbo.FinDizimosDigitais (CongregacaoId, Situacao) INCLUDE (PixEm, Valor, Folha);
GO
-- os Pix do membro (a página dele)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinDizimosDigitais_Membro' AND object_id = OBJECT_ID(N'dbo.FinDizimosDigitais'))
    CREATE INDEX IX_FinDizimosDigitais_Membro ON dbo.FinDizimosDigitais (MembroId, Situacao);
GO
-- as folhas reservadas de um bloco (a devolução parcial e a exceção da folha conferem)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinDizimosDigitais_Bloco' AND object_id = OBJECT_ID(N'dbo.FinDizimosDigitais'))
    CREATE INDEX IX_FinDizimosDigitais_Bloco ON dbo.FinDizimosDigitais (BlocoId) INCLUDE (Folha, Situacao);
GO
-- a entrega da folha ligada (a chave estrangeira composta começa na SaidaId)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinDizimosDigitais_Saida' AND object_id = OBJECT_ID(N'dbo.FinDizimosDigitais'))
    CREATE INDEX IX_FinDizimosDigitais_Saida ON dbo.FinDizimosDigitais (SaidaId) WHERE SaidaId IS NOT NULL;
GO

-- o aviso ao membro quando a tesouraria exclui o Pix (o porquê vai na mensagem)
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'DIZIMO_DIGITAL_EXCLUIDO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'DIZIMO_DIGITAL_EXCLUIDO', N'Dízimo por Pix não confirmado pela tesouraria', N'FINANCEIRO', NULL, NULL, 1);
GO
