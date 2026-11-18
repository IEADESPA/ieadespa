-- ============================================================
-- Migração 176 — A TRANSFERÊNCIA DE CONGREGAÇÃO como fluxo (FASE 10, v10.1b passo 3, 17/11/2026)
--
-- Regras do responsável (decisão 3 da pesquisa da gestão de membros, 13/11/2026; o nome é TRANSFERÊNCIA — a carta de mudança/recomendação para OUTRA igreja
-- continua em CartasTransito):
--  - quem pede: a secretaria da congregação de ORIGEM (de onde a pessoa sai), a PRÓPRIA pessoa ou a Secretaria GERAL; a pessoa não precisa aceitar;
--  - pedido pela Geral → entra na hora; MESMA ÁREA → entra na hora; ÁREAS DIFERENTES → a secretaria de DESTINO (ou a Geral) aceita ou recusa, com motivo;
--  - a congregação da ficha (MembroReferencia.CongregacaoId) passa a mudar só por este fluxo (o cadastro recusa a troca: GestaoPessoas).
--
-- Uma linha por pedido. Situação: PENDENTE (esperando o destino) → CONCLUIDA | RECUSADA | CANCELADA. Só um pedido PENDENTE por pessoa (índice único filtrado).
-- Regra: GERAL (pedido pela Geral), MESMA_AREA, ENTRE_AREAS. PedidoComo: GERAL, ORIGEM, PROPRIO. DecididoComo: AUTOMATICO (na hora), DESTINO, GERAL.
-- Idempotente.
-- ============================================================

IF OBJECT_ID(N'dbo.TransferenciasCongregacao', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TransferenciasCongregacao (
        TransferenciaId       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TransferenciasCongregacao PRIMARY KEY,
        MembroId              INT NOT NULL CONSTRAINT FK_Transferencias_Membro REFERENCES dbo.MembroReferencia(MembroId),
        CongregacaoOrigemId   INT NOT NULL CONSTRAINT FK_Transferencias_Origem REFERENCES dbo.Congregacoes(CongregacaoId),
        CongregacaoDestinoId  INT NOT NULL CONSTRAINT FK_Transferencias_Destino REFERENCES dbo.Congregacoes(CongregacaoId),
        Regra                 NVARCHAR(20) NOT NULL,
        PedidoComo            NVARCHAR(20) NOT NULL,
        PedidoPor             INT NOT NULL,
        PedidoEm              DATETIME2 NOT NULL CONSTRAINT DF_Transferencias_PedidoEm DEFAULT SYSUTCDATETIME(),
        Motivo                NVARCHAR(500) NULL,
        Situacao              NVARCHAR(20) NOT NULL CONSTRAINT DF_Transferencias_Situacao DEFAULT N'PENDENTE',
        DecididoComo          NVARCHAR(20) NULL,
        DecididoPor           INT NULL,
        DecididoEm            DATETIME2 NULL,
        MotivoRecusa          NVARCHAR(500) NULL,
        CanceladoPor          INT NULL,
        CanceladoEm           DATETIME2 NULL,
        CONSTRAINT CK_Transferencias_Regra CHECK (Regra IN (N'GERAL', N'MESMA_AREA', N'ENTRE_AREAS')),
        CONSTRAINT CK_Transferencias_PedidoComo CHECK (PedidoComo IN (N'GERAL', N'ORIGEM', N'PROPRIO')),
        CONSTRAINT CK_Transferencias_Situacao CHECK (Situacao IN (N'PENDENTE', N'CONCLUIDA', N'RECUSADA', N'CANCELADA')),
        CONSTRAINT CK_Transferencias_DecididoComo CHECK (DecididoComo IS NULL OR DecididoComo IN (N'AUTOMATICO', N'DESTINO', N'GERAL')),
        CONSTRAINT CK_Transferencias_Destino CHECK (CongregacaoDestinoId <> CongregacaoOrigemId),
        -- coerência da situação: concluída/recusada tem decisão; cancelada tem quem cancelou; recusada tem motivo
        CONSTRAINT CK_Transferencias_Coerencia CHECK (
            (Situacao = N'PENDENTE' AND DecididoEm IS NULL AND CanceladoEm IS NULL)
         OR (Situacao = N'CONCLUIDA' AND DecididoEm IS NOT NULL AND DecididoComo IS NOT NULL AND CanceladoEm IS NULL)
         OR (Situacao = N'RECUSADA' AND DecididoEm IS NOT NULL AND DecididoComo IN (N'DESTINO', N'GERAL') AND MotivoRecusa IS NOT NULL AND CanceladoEm IS NULL)
         OR (Situacao = N'CANCELADA' AND CanceladoEm IS NOT NULL AND CanceladoPor IS NOT NULL AND DecididoEm IS NULL))
    );
END
GO

-- só um pedido em andamento por pessoa (dois pedidos ao mesmo tempo: o segundo recebe "já há um pedido")
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Transferencias_PendentePorMembro' AND object_id = OBJECT_ID(N'dbo.TransferenciasCongregacao'))
    CREATE UNIQUE INDEX UX_Transferencias_PendentePorMembro ON dbo.TransferenciasCongregacao (MembroId) WHERE Situacao = N'PENDENTE';
GO
-- as caixas "chegando" (destino) e "saindo" (origem), e a linha do tempo da pessoa
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Transferencias_Destino' AND object_id = OBJECT_ID(N'dbo.TransferenciasCongregacao'))
    CREATE INDEX IX_Transferencias_Destino ON dbo.TransferenciasCongregacao (CongregacaoDestinoId, Situacao) INCLUDE (PedidoEm);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Transferencias_Origem' AND object_id = OBJECT_ID(N'dbo.TransferenciasCongregacao'))
    CREATE INDEX IX_Transferencias_Origem ON dbo.TransferenciasCongregacao (CongregacaoOrigemId, Situacao) INCLUDE (PedidoEm);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Transferencias_Membro' AND object_id = OBJECT_ID(N'dbo.TransferenciasCongregacao'))
    CREATE INDEX IX_Transferencias_Membro ON dbo.TransferenciasCongregacao (MembroId, Situacao) INCLUDE (DecididoEm);
GO

-- os avisos do fluxo (motor de notificações da vB.2): o destino tem um pedido para aceitar; quem pediu sabe da recusa; a pessoa e quem pediu sabem da conclusão
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'TRANSFERENCIA_PARA_ACEITAR')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'TRANSFERENCIA_PARA_ACEITAR', N'Transferência de congregação esperando o destino aceitar', N'SECRETARIA', N'pessoas', N'CONGREGACAO', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'TRANSFERENCIA_RECUSADA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'TRANSFERENCIA_RECUSADA', N'Transferência de congregação recusada pelo destino', N'SECRETARIA', NULL, NULL, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'TRANSFERENCIA_CONCLUIDA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'TRANSFERENCIA_CONCLUIDA', N'Transferência de congregação concluída', N'SECRETARIA', NULL, NULL, 1);
GO
