-- ============================================================
-- Migração 079 — Motor de notificações (vB.2)
--
-- Hoje o sistema "sabe" muita coisa (apólice vencendo, prestação de contas
-- atrasada, repasse parado no malote) e não conta pra ninguém — cada módulo
-- só expõe isso num endpoint de "alertas" próprio, que só quem já está
-- naquela tela vê. Este motor generaliza: uma tabela única de notificação
-- (Notificacoes, uma linha por destinatário) + um catálogo declarativo de
-- regras (NotificacaoRegras — o que dispara, pra quem, em que categoria),
-- sem duplicar tela por módulo.
--
-- WhatsApp Business API ficou de fora desta versão por decisão explícita
-- (custo — API paga por conversa/mensagem, sem orçamento aprovado ainda).
-- O motor já nasce com canal declarado por regra (CanalEmail) pra não
-- precisar de retrabalho quando o canal for aprovado — só ligar um novo
-- canal na regra existente, não redesenhar a tabela.
--
-- NotificacaoPreferencias é o opt-out por categoria (não por regra
-- individual — ninguém quer configurar regra por regra). Regras com
-- Obrigatoria = 1 (ex.: convocação estatutária, quando existir — v7.12)
-- ignoram esse opt-out; nenhuma das 3 regras semeadas aqui é obrigatória.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.NotificacaoRegras', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.NotificacaoRegras (
        Chave           NVARCHAR(60) NOT NULL PRIMARY KEY,   -- ex: 'SEGUROS_VENCENDO'
        Titulo          NVARCHAR(150) NOT NULL,
        Categoria       NVARCHAR(40) NOT NULL,               -- agrupa o digest (FINANCEIRO, PATRIMONIO, ...)
        PermissaoAlvo   NVARCHAR(60) NULL,                   -- chave de Papeis.Permissoes que recebe
        NivelAlvo       NVARCHAR(20) NULL,                   -- Papeis.Nivel exigido (NULL = qualquer nível com a permissão)
        CanalEmail      BIT NOT NULL DEFAULT 1,
        Obrigatoria     BIT NOT NULL DEFAULT 0,               -- ignora opt-out de NotificacaoPreferencias (v7.12)
        Ativa           BIT NOT NULL DEFAULT 1,
        CriadoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.Notificacoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Notificacoes (
        NotificacaoId         INT IDENTITY PRIMARY KEY,
        RegraChave             NVARCHAR(60) NOT NULL REFERENCES dbo.NotificacaoRegras(Chave),
        DestinatarioMembroId   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Titulo                 NVARCHAR(200) NOT NULL,
        Mensagem               NVARCHAR(1000) NOT NULL,
        Categoria              NVARCHAR(40) NOT NULL,
        ReferenciaTabela       NVARCHAR(60) NULL,             -- ex: 'ApolicesSeguro' (link pro registro de origem)
        ReferenciaId           INT NULL,
        Lida                   BIT NOT NULL DEFAULT 0,
        LidaEm                 DATETIME2 NULL,
        Arquivada              BIT NOT NULL DEFAULT 0,
        ArquivadaEm            DATETIME2 NULL,
        EnviadaEmail           BIT NOT NULL DEFAULT 0,
        EnviadaEmailEm         DATETIME2 NULL,
        CriadaEm               DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        -- Mesma regra + mesmo destinatário + mesma origem não duplica notificação
        -- a cada rodada do avaliador (ReferenciaTabela/Id NULL cai no mesmo grupo
        -- quando a regra não tem origem única — ok, é o caso raro de regra sem
        -- referência concreta).
        CONSTRAINT UQ_Notificacao_Origem UNIQUE (RegraChave, DestinatarioMembroId, ReferenciaTabela, ReferenciaId)
    );
END
GO

IF OBJECT_ID(N'dbo.NotificacaoPreferencias', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.NotificacaoPreferencias (
        MembroId       INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Categoria      NVARCHAR(40) NOT NULL,
        EmailAtivo     BIT NOT NULL DEFAULT 1,
        AtualizadoEm   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_NotificacaoPreferencias PRIMARY KEY (MembroId, Categoria)
    );
END
GO

-- Catálogo semeado com as 3 regras que já tinham detecção pronta em outros
-- módulos (Seguros v4.16, Prestação de Contas v4.12, Repasses v4.15) — o
-- motor reaproveita a mesma leitura, só empacota como notificação central.
-- Mais regras entram sem migração nova: INSERT em NotificacaoRegras +
-- um detector novo em api/shared/notificacaoDetectores.js.
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'SEGUROS_VENCENDO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'SEGUROS_VENCENDO', N'Apólice de seguro vencendo ou vencida', N'PATRIMONIO', N'financeiro', N'GLOBAL', 1);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'PRESTACAO_CONTAS_ATRASADA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'PRESTACAO_CONTAS_ATRASADA', N'Prestação de contas mensal atrasada', N'FINANCEIRO', N'financeiro', N'GLOBAL', 1);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'REPASSE_MALOTE_PARADO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'REPASSE_MALOTE_PARADO', N'Repasse institucional pendente de mês anterior', N'FINANCEIRO', N'financeiro', N'GLOBAL', 1);
GO
