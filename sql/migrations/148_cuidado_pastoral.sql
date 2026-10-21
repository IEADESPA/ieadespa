-- ============================================================
-- Migração 148 — v7.11: Cuidado pastoral — filas com responsável, prazo e sigilo
-- (Regimento Art. 128 §5º, II, b — "Busca Ativa" do visitante em até 48 horas; Art. 85 §3º, I — "nunca a sós" na visita; Art. 132 §2º, II — as anotações pastorais saem
--  com o membro; LGPD arts. 7º, 11 e 18 — nota pastoral e pedido de oração são dado sensível)
--
-- Hoje o sistema registra o que ACONTECEU (disciplina, abandono, carta) e não o que alguém PRECISA FAZER por alguém. Esta migração acrescenta:
--   1) a fila de acompanhamento: cada item tem um tipo (visitante, novo convertido, membro afastado, pedido de visita, pedido de oração, pós-internação), uma
--      congregação, um responsável nomeado, um prazo e o degrau da escada em que está (Congregação → Área → Região → nível geral);
--   2) o histórico de acréscimo de cada item (criado, responsável trocado, contato, prazo adiado, subiu de degrau, concluído, cancelado);
--   3) as notas pastorais em três níveis de sigilo (equipe, liderança local, somente pastor) e o registro de cada abertura (quem e quando, nunca o conteúdo);
--   4) os pedidos de oração, com moderação antes do boletim (que leva só uma linha sem nome) e o sinal de risco (autolesão, violência);
--   5) a permissão cuidado_pastoral, o papel Superintendente Regional, os prazos ajustáveis, os avisos e a retenção.
--
-- O histórico e as notas não se alteram (gatilhos no banco). A única saída de uma nota é a regra do Regimento (Art. 132 §2º, II: as anotações pastorais são eliminadas
-- na saída do membro) e a exclusão LGPD, que apagam com uma marca de sessão (SESSION_CONTEXT 'cuidado_purga') posta e retirada dentro da mesma transação.
-- Limite conhecido (o mesmo da 145): quem tem ALTER na tabela pode desligar o gatilho, e TRUNCATE não dispara gatilho; isso se fecha na permissão do usuário do banco.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

-- ---- 1) Os pedidos de oração ----
-- Vem antes da fila porque o item nascido de um pedido aponta para ele. O texto é do pedido e nunca vai ao boletim: o boletim leva TextoBoletim, uma linha sem nome que o
-- moderador confere. O texto sai na retenção (AnonimizadoEm); a categoria e as datas ficam para a contagem.

IF OBJECT_ID(N'dbo.PedidosOracao', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PedidosOracao (
        PedidoId                    INT IDENTITY PRIMARY KEY,
        CongregacaoId               INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        SolicitanteMembroId         INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoPorMembroId       INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        SolicitanteNome             NVARCHAR(150) NULL,
        SolicitanteContato          NVARCHAR(150) NULL,
        ParaQuem                    NVARCHAR(12) NOT NULL CONSTRAINT CK_PedidosOracao_ParaQuem CHECK (ParaQuem IS NOT NULL AND ParaQuem IN (N'PROPRIO', N'OUTRA_PESSOA')),
        Categoria                   NVARCHAR(12) NOT NULL CONSTRAINT CK_PedidosOracao_Categoria CHECK (Categoria IS NOT NULL AND Categoria IN (N'SAUDE', N'FAMILIA', N'TRABALHO', N'LUTO', N'ESPIRITUAL', N'GRATIDAO', N'OUTRO')),
        Texto                       NVARCHAR(1000) NULL,
        PodeBoletim                 BIT NOT NULL,
        QuerContato                 BIT NOT NULL,
        Moderacao                   NVARCHAR(12) NOT NULL CONSTRAINT DF_PedidosOracao_Moderacao DEFAULT N'AGUARDANDO'
                                        CONSTRAINT CK_PedidosOracao_Moderacao CHECK (Moderacao IS NOT NULL AND Moderacao IN (N'AGUARDANDO', N'APROVADO', N'NAO_PUBLICAR')),
        TextoBoletim                NVARCHAR(200) NULL,
        BoletimAte                  DATE NULL,
        ModeradoPorMembroId         INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ModeradoEm                  DATETIME2(0) NULL,
        Risco                       BIT NOT NULL CONSTRAINT DF_PedidosOracao_Risco DEFAULT 0,
        RiscoOrigem                 NVARCHAR(10) NULL CONSTRAINT CK_PedidosOracao_RiscoOrigem CHECK (RiscoOrigem IS NULL OR RiscoOrigem IN (N'AUTOMATICO', N'LIDERANCA')),
        RiscoCrianca                BIT NOT NULL CONSTRAINT DF_PedidosOracao_RiscoCrianca DEFAULT 0,
        RiscoJaTeve                 BIT NOT NULL CONSTRAINT DF_PedidosOracao_RiscoJaTeve DEFAULT 0,
        RiscoMarcadoEm              DATETIME2(0) NULL,
        RiscoDesmarcadoPorMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RiscoDesmarcadoEm           DATETIME2(0) NULL,
        RiscoDesmarcadoMotivo       NVARCHAR(300) NULL,
        CriadoEm                    DATETIME2(0) NOT NULL CONSTRAINT DF_PedidosOracao_CriadoEm DEFAULT SYSUTCDATETIME(),
        AnonimizadoEm               DATETIME2(0) NULL,
        -- o texto só falta depois da retenção
        CONSTRAINT CK_PedidosOracao_Texto CHECK (Texto IS NOT NULL OR AnonimizadoEm IS NOT NULL),
        CONSTRAINT CK_PedidosOracao_Quem CHECK (SolicitanteMembroId IS NOT NULL OR SolicitanteNome IS NOT NULL OR AnonimizadoEm IS NOT NULL),
        CONSTRAINT CK_PedidosOracao_Registrante CHECK (RegistradoPorMembroId IS NOT NULL OR AnonimizadoEm IS NOT NULL),
        CONSTRAINT CK_PedidosOracao_Anonimizado CHECK (AnonimizadoEm IS NULL OR (Texto IS NULL AND SolicitanteMembroId IS NULL AND RegistradoPorMembroId IS NULL AND SolicitanteNome IS NULL AND SolicitanteContato IS NULL AND TextoBoletim IS NULL AND RiscoDesmarcadoMotivo IS NULL AND Moderacao <> N'APROVADO')),
        -- no boletim só entra o que pode ir ao boletim, sem sinal de risco, com a linha conferida e a data de saída
        CONSTRAINT CK_PedidosOracao_Aprovado CHECK (Moderacao <> N'APROVADO' OR (PodeBoletim = 1 AND Risco = 0 AND TextoBoletim IS NOT NULL AND BoletimAte IS NOT NULL AND ModeradoPorMembroId IS NOT NULL)),
        CONSTRAINT CK_PedidosOracao_RiscoMarca CHECK (Risco = 0 OR (RiscoOrigem IS NOT NULL AND RiscoJaTeve = 1))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PedidosOracao_Congregacao' AND object_id = OBJECT_ID(N'dbo.PedidosOracao'))
    CREATE INDEX IX_PedidosOracao_Congregacao ON dbo.PedidosOracao (CongregacaoId, Moderacao, CriadoEm DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PedidosOracao_Solicitante' AND object_id = OBJECT_ID(N'dbo.PedidosOracao'))
    CREATE INDEX IX_PedidosOracao_Solicitante ON dbo.PedidosOracao (SolicitanteMembroId, CriadoEm DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PedidosOracao_Registrante' AND object_id = OBJECT_ID(N'dbo.PedidosOracao'))
    CREATE INDEX IX_PedidosOracao_Registrante ON dbo.PedidosOracao (RegistradoPorMembroId, CriadoEm DESC);
GO

-- O pedido não se apaga (só a retenção tira o texto). Quem pediu, quando e para qual congregação não se reescrevem.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_PedidosOracao_Protegido ON dbo.PedidosOracao AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        IF EXISTS (SELECT 1 FROM deleted)
        BEGIN
            RAISERROR(N''O pedido de oração é registro do cuidado pastoral: não se apaga.'', 16, 1);
            ROLLBACK TRANSACTION;
        END
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.PedidoId = i.PedidoId
        WHERE i.CongregacaoId <> d.CongregacaoId OR i.CriadoEm <> d.CriadoEm
           OR (ISNULL(i.RegistradoPorMembroId, -1) <> ISNULL(d.RegistradoPorMembroId, -1) AND NOT (i.AnonimizadoEm IS NOT NULL AND i.RegistradoPorMembroId IS NULL))
           OR (ISNULL(i.SolicitanteMembroId, -1) <> ISNULL(d.SolicitanteMembroId, -1) AND NOT (i.AnonimizadoEm IS NOT NULL AND i.SolicitanteMembroId IS NULL)) OR i.ParaQuem <> d.ParaQuem OR i.Categoria <> d.Categoria
           OR (i.AnonimizadoEm IS NULL AND (ISNULL(i.SolicitanteNome, N'''') <> ISNULL(d.SolicitanteNome, N'''') OR ISNULL(i.SolicitanteContato, N'''') <> ISNULL(d.SolicitanteContato, N'''')))
           OR (d.RiscoJaTeve = 1 AND i.RiscoJaTeve = 0)
           OR (ISNULL(i.Texto, N'''') <> ISNULL(d.Texto, N'''') AND NOT (i.AnonimizadoEm IS NOT NULL AND i.Texto IS NULL))
           OR (d.AnonimizadoEm IS NOT NULL AND ISNULL(i.AnonimizadoEm, ''19000101'') <> d.AnonimizadoEm))
    BEGIN
        RAISERROR(N''O pedido de oração não se reescreve: quem pediu, quando, o assunto e o texto ficam como foram recebidos.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 2) A fila de acompanhamento ----
-- A pessoa acompanhada é um membro (MembroId) OU alguém de fora do cadastro (nome e contato: visitante, novo convertido). O prazo é um instante (UTC); o degrau diz até
-- onde a escada já subiu. Encerrado (concluído ou cancelado), o item fica 5 anos e perde a identificação (AnonimizadoEm).

IF OBJECT_ID(N'dbo.CuidadoItens', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CuidadoItens (
        ItemId                  INT IDENTITY PRIMARY KEY,
        Tipo                    NVARCHAR(20) NOT NULL CONSTRAINT CK_CuidadoItens_Tipo
                                    CHECK (Tipo IS NOT NULL AND Tipo IN (N'VISITANTE', N'NOVO_CONVERTIDO', N'AFASTAMENTO', N'PEDIDO_VISITA', N'PEDIDO_ORACAO', N'POS_INTERNACAO')),
        CongregacaoId           INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        MembroId                INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        PessoaNome              NVARCHAR(150) NULL,
        PessoaContato           NVARCHAR(150) NULL,
        Motivo                  NVARCHAR(300) NULL,
        Origem                  NVARCHAR(16) NOT NULL CONSTRAINT CK_CuidadoItens_Origem
                                    CHECK (Origem IS NOT NULL AND Origem IN (N'LIDERANCA', N'DETECCAO', N'PEDIDO_MEMBRO', N'PEDIDO_ORACAO')),
        PedidoOracaoId          INT NULL REFERENCES dbo.PedidosOracao(PedidoId),
        Urgente                 BIT NOT NULL CONSTRAINT DF_CuidadoItens_Urgente DEFAULT 0,
        DeteccaoResumo          NVARCHAR(200) NULL,
        ResponsavelMembroId     INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        PrazoEm                 DATETIME2(0) NOT NULL,
        Nivel                   NVARCHAR(12) NOT NULL CONSTRAINT DF_CuidadoItens_Nivel DEFAULT N'CONGREGACAO'
                                    CONSTRAINT CK_CuidadoItens_Nivel CHECK (Nivel IS NOT NULL AND Nivel IN (N'CONGREGACAO', N'AREA', N'REGIAO', N'GERAL')),
        Escalonamentos          INT NOT NULL CONSTRAINT DF_CuidadoItens_Escalonamentos DEFAULT 0,
        LembretesGerais         INT NOT NULL CONSTRAINT DF_CuidadoItens_Lembretes DEFAULT 0,
        Status                  NVARCHAR(10) NOT NULL CONSTRAINT DF_CuidadoItens_Status DEFAULT N'ABERTO'
                                    CONSTRAINT CK_CuidadoItens_Status CHECK (Status IS NOT NULL AND Status IN (N'ABERTO', N'CONCLUIDO', N'CANCELADO')),
        Desfecho                NVARCHAR(20) NULL CONSTRAINT CK_CuidadoItens_Desfecho
                                    CHECK (Desfecho IS NULL OR Desfecho IN (N'INTEGRADO', N'ACOMPANHADO', N'NAO_LOCALIZADO', N'RECUSOU_CONTATO', N'ENCAMINHADO', N'OUTRO', N'DUPLICADO', N'ENGANO')),
        EncerradoEm             DATETIME2(0) NULL,
        EncerradoPorMembroId    INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        PrimeiroContatoEm       DATETIME2(0) NULL,
        CriadoEm                DATETIME2(0) NOT NULL CONSTRAINT DF_CuidadoItens_CriadoEm DEFAULT SYSUTCDATETIME(),
        CriadoPorMembroId       INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AnonimizadoEm           DATETIME2(0) NULL,
        CONSTRAINT CK_CuidadoItens_Pessoa CHECK (MembroId IS NOT NULL OR PessoaNome IS NOT NULL OR AnonimizadoEm IS NOT NULL),
        -- aberto não tem desfecho; encerrado tem quando e o desfecho do jeito certo (concluir não usa os de cancelar, e vice-versa)
        CONSTRAINT CK_CuidadoItens_Encerramento CHECK (
            (Status = N'ABERTO' AND EncerradoEm IS NULL AND Desfecho IS NULL)
            OR (Status = N'CONCLUIDO' AND EncerradoEm IS NOT NULL AND Desfecho IS NOT NULL AND Desfecho NOT IN (N'DUPLICADO', N'ENGANO'))
            OR (Status = N'CANCELADO' AND EncerradoEm IS NOT NULL AND Desfecho IN (N'DUPLICADO', N'ENGANO'))),
        CONSTRAINT CK_CuidadoItens_Anonimizado CHECK (AnonimizadoEm IS NULL OR (Status <> N'ABERTO' AND MembroId IS NULL AND PessoaNome IS NULL AND PessoaContato IS NULL AND Motivo IS NULL AND DeteccaoResumo IS NULL)),
        CONSTRAINT CK_CuidadoItens_Contadores CHECK (Escalonamentos BETWEEN 0 AND 10 AND LembretesGerais BETWEEN 0 AND 10)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CuidadoItens_Fila' AND object_id = OBJECT_ID(N'dbo.CuidadoItens'))
    CREATE INDEX IX_CuidadoItens_Fila ON dbo.CuidadoItens (Status, CongregacaoId, PrazoEm);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CuidadoItens_Responsavel' AND object_id = OBJECT_ID(N'dbo.CuidadoItens'))
    CREATE INDEX IX_CuidadoItens_Responsavel ON dbo.CuidadoItens (ResponsavelMembroId, Status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CuidadoItens_Membro' AND object_id = OBJECT_ID(N'dbo.CuidadoItens'))
    CREATE INDEX IX_CuidadoItens_Membro ON dbo.CuidadoItens (MembroId, Tipo, Status);
-- uma pessoa do cadastro tem no máximo UM item aberto de cada um destes tipos (a rotina de detecção e dois cliques ao mesmo tempo não abrem dois)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CuidadoItens_UmAbertoPorPessoa' AND object_id = OBJECT_ID(N'dbo.CuidadoItens'))
    CREATE UNIQUE INDEX UX_CuidadoItens_UmAbertoPorPessoa ON dbo.CuidadoItens (Tipo, MembroId)
        WHERE Status = N'ABERTO' AND MembroId IS NOT NULL AND Tipo IN (N'NOVO_CONVERTIDO', N'AFASTAMENTO', N'PEDIDO_VISITA', N'POS_INTERNACAO');
-- um pedido de oração gera no máximo um item
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CuidadoItens_UmPorPedido' AND object_id = OBJECT_ID(N'dbo.CuidadoItens'))
    CREATE UNIQUE INDEX UX_CuidadoItens_UmPorPedido ON dbo.CuidadoItens (PedidoOracaoId) WHERE PedidoOracaoId IS NOT NULL;
GO

-- O item não se apaga; tipo, congregação, pessoa, origem e criação não se reescrevem; encerrado não reabre; a identificação só sai pela anonimização.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_CuidadoItens_Protegido ON dbo.CuidadoItens AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        IF EXISTS (SELECT 1 FROM deleted)
        BEGIN
            RAISERROR(N''O item de acompanhamento pastoral não se apaga.'', 16, 1);
            ROLLBACK TRANSACTION;
        END
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.ItemId = i.ItemId
        WHERE i.Tipo <> d.Tipo OR i.CongregacaoId <> d.CongregacaoId OR i.Origem <> d.Origem OR i.CriadoEm <> d.CriadoEm
           OR ISNULL(i.CriadoPorMembroId, -1) <> ISNULL(d.CriadoPorMembroId, -1) OR ISNULL(i.PedidoOracaoId, -1) <> ISNULL(d.PedidoOracaoId, -1)
           OR (ISNULL(i.MembroId, -1) <> ISNULL(d.MembroId, -1) AND NOT (i.AnonimizadoEm IS NOT NULL AND i.MembroId IS NULL))
           OR (d.Status <> N''ABERTO'' AND (i.Status <> d.Status OR ISNULL(i.Desfecho, N'''') <> ISNULL(d.Desfecho, N'''') OR ISNULL(i.EncerradoEm, ''19000101'') <> ISNULL(d.EncerradoEm, ''19000101'')
                OR ISNULL(i.ResponsavelMembroId, -1) <> ISNULL(d.ResponsavelMembroId, -1) OR i.PrazoEm <> d.PrazoEm OR i.Nivel <> d.Nivel))
           OR (i.AnonimizadoEm IS NULL AND (ISNULL(i.PessoaNome, N'''') <> ISNULL(d.PessoaNome, N'''') OR ISNULL(i.PessoaContato, N'''') <> ISNULL(d.PessoaContato, N'''')
                OR ISNULL(i.DeteccaoResumo, N'''') <> ISNULL(d.DeteccaoResumo, N'''') OR ISNULL(i.Motivo, N'''') <> ISNULL(d.Motivo, N'''')))
           OR (d.AnonimizadoEm IS NOT NULL AND ISNULL(i.AnonimizadoEm, ''19000101'') <> d.AnonimizadoEm))
    BEGIN
        RAISERROR(N''O item de acompanhamento não se reescreve: o tipo, a pessoa e a origem ficam; encerrado não reabre.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 3) O histórico de cada item ----
-- Só de acréscimo. A observação e o acompanhante são texto curto do trabalho do dia (nada de diagnóstico: isso vai para a nota pastoral, com sigilo); saem na retenção do item.
-- Toda visita presencial tem quem foi junto (Regimento Art. 85 §3º, I).

IF OBJECT_ID(N'dbo.CuidadoEventos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CuidadoEventos (
        EventoId                INT IDENTITY PRIMARY KEY,
        ItemId                  INT NOT NULL REFERENCES dbo.CuidadoItens(ItemId),
        Tipo                    NVARCHAR(16) NOT NULL CONSTRAINT CK_CuidadoEventos_Tipo
                                    CHECK (Tipo IS NOT NULL AND Tipo IN (N'CRIADO', N'ATRIBUIDO', N'CONTATO', N'PRAZO_ADIADO', N'ESCALONADO', N'LEMBRETE_GERAL', N'CONCLUIDO', N'CANCELADO', N'URGENTE')),
        MembroId                INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Em                      DATETIME2(0) NOT NULL CONSTRAINT DF_CuidadoEventos_Em DEFAULT SYSUTCDATETIME(),
        Forma                   NVARCHAR(16) NULL CONSTRAINT CK_CuidadoEventos_Forma
                                    CHECK (Forma IS NULL OR Forma IN (N'LIGACAO', N'MENSAGEM', N'VISITA_LAR', N'VISITA_HOSPITAL', N'NO_CULTO', N'OUTRO')),
        Conseguiu               BIT NULL,
        Acompanhante            NVARCHAR(150) NULL,
        Observacao              NVARCHAR(300) NULL,
        NivelDe                 NVARCHAR(12) NULL,
        NivelPara               NVARCHAR(12) NULL,
        PrazoNovo               DATETIME2(0) NULL,
        ResponsavelMembroId     INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AnonimizadoEm           DATETIME2(0) NULL,
        CONSTRAINT CK_CuidadoEventos_Contato CHECK (Tipo <> N'CONTATO' OR (Forma IS NOT NULL AND Conseguiu IS NOT NULL)),
        CONSTRAINT CK_CuidadoEventos_Visita CHECK (Forma IS NULL OR Forma NOT IN (N'VISITA_LAR', N'VISITA_HOSPITAL') OR Acompanhante IS NOT NULL OR AnonimizadoEm IS NOT NULL)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CuidadoEventos_Item' AND object_id = OBJECT_ID(N'dbo.CuidadoEventos'))
    CREATE INDEX IX_CuidadoEventos_Item ON dbo.CuidadoEventos (ItemId, EventoId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CuidadoEventos_Tipo' AND object_id = OBJECT_ID(N'dbo.CuidadoEventos'))
    CREATE INDEX IX_CuidadoEventos_Tipo ON dbo.CuidadoEventos (Tipo, Em);
GO

EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_CuidadoEventos_Imutavel ON dbo.CuidadoEventos AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        IF EXISTS (SELECT 1 FROM deleted)
        BEGIN
            RAISERROR(N''O histórico do acompanhamento pastoral não se apaga.'', 16, 1);
            ROLLBACK TRANSACTION;
        END
        RETURN;
    END
    -- a única mudança aceita é a anonimização: carimbo novo, observação e acompanhante apagados (ou trocados pelo texto neutro), e nada mais
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.EventoId = i.EventoId
        WHERE d.AnonimizadoEm IS NOT NULL OR i.AnonimizadoEm IS NULL
           OR i.ItemId <> d.ItemId OR i.Tipo <> d.Tipo OR i.Em <> d.Em OR ISNULL(i.MembroId, -1) <> ISNULL(d.MembroId, -1)
           OR ISNULL(i.Forma, N'''') <> ISNULL(d.Forma, N'''') OR ISNULL(CAST(i.Conseguiu AS INT), -1) <> ISNULL(CAST(d.Conseguiu AS INT), -1)
           OR ISNULL(i.NivelDe, N'''') <> ISNULL(d.NivelDe, N'''') OR ISNULL(i.NivelPara, N'''') <> ISNULL(d.NivelPara, N'''')
           OR ISNULL(i.PrazoNovo, ''19000101'') <> ISNULL(d.PrazoNovo, ''19000101'') OR ISNULL(i.ResponsavelMembroId, -1) <> ISNULL(d.ResponsavelMembroId, -1)
           OR i.Observacao IS NOT NULL OR (i.Acompanhante IS NOT NULL AND i.Acompanhante <> N''(anonimizado)''))
    BEGIN
        RAISERROR(N''O histórico do acompanhamento pastoral não se altera.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 4) As notas pastorais ----
-- Sobre um membro (MembroId) ou, para quem não é do cadastro, sobre o item (ItemId). Três níveis: EQUIPE (a liderança e o responsável de um item aberto da pessoa),
-- LIDERANCA (só a liderança com a permissão no território) e PASTORAL (quem escreveu e quem, nessa liderança, tem o cargo de Pastor). A nota não se edita: a correção é
-- outra nota que aponta a anterior (RetificaNotaId).

IF OBJECT_ID(N'dbo.NotasPastorais', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.NotasPastorais (
        NotaId                  INT IDENTITY PRIMARY KEY,
        MembroId                INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ItemId                  INT NULL REFERENCES dbo.CuidadoItens(ItemId),
        Nivel                   NVARCHAR(10) NOT NULL CONSTRAINT CK_NotasPastorais_Nivel CHECK (Nivel IS NOT NULL AND Nivel IN (N'EQUIPE', N'LIDERANCA', N'PASTORAL')),
        Texto                   NVARCHAR(2000) NOT NULL,
        AutorMembroId           INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadaEm                DATETIME2(0) NOT NULL CONSTRAINT DF_NotasPastorais_CriadaEm DEFAULT SYSUTCDATETIME(),
        RetificaNotaId          INT NULL REFERENCES dbo.NotasPastorais(NotaId),
        CONSTRAINT CK_NotasPastorais_Alvo CHECK ((MembroId IS NOT NULL AND ItemId IS NULL) OR (MembroId IS NULL AND ItemId IS NOT NULL))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_NotasPastorais_Membro' AND object_id = OBJECT_ID(N'dbo.NotasPastorais'))
    CREATE INDEX IX_NotasPastorais_Membro ON dbo.NotasPastorais (MembroId, NotaId DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_NotasPastorais_Item' AND object_id = OBJECT_ID(N'dbo.NotasPastorais'))
    CREATE INDEX IX_NotasPastorais_Item ON dbo.NotasPastorais (ItemId, NotaId DESC);
GO

-- Cada abertura de nota: quem e quando (nunca o conteúdo).
IF OBJECT_ID(N'dbo.NotasPastoraisLeituras', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.NotasPastoraisLeituras (
        LeituraId               INT IDENTITY PRIMARY KEY,
        NotaId                  INT NOT NULL REFERENCES dbo.NotasPastorais(NotaId),
        MembroId                INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        LidaEm                  DATETIME2(0) NOT NULL CONSTRAINT DF_NotasPastoraisLeituras_LidaEm DEFAULT SYSUTCDATETIME()
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_NotasPastoraisLeituras_Nota' AND object_id = OBJECT_ID(N'dbo.NotasPastoraisLeituras'))
    CREATE INDEX IX_NotasPastoraisLeituras_Nota ON dbo.NotasPastoraisLeituras (NotaId, LeituraId DESC);
GO

-- A nota não se altera nunca. Apagar só com a marca de sessão 'cuidado_purga' (a regra dos 30 dias do Art. 132 §2º, II e a exclusão LGPD), posta e retirada pela própria
-- rotina dentro da transação. O registro de leituras segue a nota.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_NotasPastorais_Imutavel ON dbo.NotasPastorais AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM inserted)
    BEGIN
        RAISERROR(N''A nota pastoral não se edita: escreva outra nota que corrige a anterior.'', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM deleted) AND ISNULL(CAST(SESSION_CONTEXT(N''cuidado_purga'') AS INT), 0) <> 1
    BEGIN
        RAISERROR(N''A nota pastoral só sai pela regra do Regimento (saída do membro) ou pela exclusão LGPD.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_NotasPastoraisLeituras_Imutavel ON dbo.NotasPastoraisLeituras AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM inserted)
    BEGIN
        RAISERROR(N''O registro de leitura da nota pastoral não se altera.'', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM deleted) AND ISNULL(CAST(SESSION_CONTEXT(N''cuidado_purga'') AS INT), 0) <> 1
    BEGIN
        RAISERROR(N''O registro de leitura da nota pastoral só sai junto com a nota.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 5) A permissão e os papéis ----
-- A fila é de quem cuida: Dirigente, Pastor de Área, Superintendente Regional e a Diretoria (Presidente e Secretário Geral). O Superintendente Regional é o papel do
-- Regimento ("a presidência regional é exercida pelo Superintendente Regional"); sem ninguém cadastrado nele, a escada pula o degrau da Região.

IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'cuidado_pastoral')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('cuidado_pastoral', N'Cuidado pastoral — fila de acompanhamento, notas pastorais e pedidos de oração');
GO
UPDATE dbo.Papeis
SET Permissoes = CASE WHEN ISNULL(Permissoes, '') = '' THEN 'cuidado_pastoral' ELSE Permissoes + ',cuidado_pastoral' END
WHERE Nome IN (N'Presidente', N'Secretário Geral', N'Dirigente de Congregação', N'Pastor de Área') AND (',' + ISNULL(Permissoes, '') + ',') NOT LIKE '%,cuidado_pastoral,%';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = N'Superintendente Regional')
    INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes) VALUES (N'Superintendente Regional', 'REGIAO', 'cuidado_pastoral');
GO

-- ---- 6) Prazos ajustáveis (Catálogos → Prazos) ----
-- A coluna Dias guarda também horas e porcentagens (inteiros de 1 a 3650).

IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'CUIDADO_PRAZO_VISITANTE_HORAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('CUIDADO_PRAZO_VISITANTE_HORAS', N'Cuidado pastoral — HORAS para o primeiro contato com o visitante (Regimento Art. 128 §5º: 48 horas)', 48);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'CUIDADO_PRAZO_NOVO_CONVERTIDO_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('CUIDADO_PRAZO_NOVO_CONVERTIDO_DIAS', N'Cuidado pastoral — dias para o acompanhamento do novo convertido', 7);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'CUIDADO_PRAZO_AFASTAMENTO_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('CUIDADO_PRAZO_AFASTAMENTO_DIAS', N'Cuidado pastoral — dias para procurar o membro que se afastou', 14);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'CUIDADO_PRAZO_PEDIDO_VISITA_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('CUIDADO_PRAZO_PEDIDO_VISITA_DIAS', N'Cuidado pastoral — dias para atender um pedido de visita', 7);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'CUIDADO_PRAZO_PEDIDO_ORACAO_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('CUIDADO_PRAZO_PEDIDO_ORACAO_DIAS', N'Cuidado pastoral — dias para falar com quem pediu oração e pediu contato', 3);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'CUIDADO_PRAZO_POS_INTERNACAO_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('CUIDADO_PRAZO_POS_INTERNACAO_DIAS', N'Cuidado pastoral — dias para visitar quem esteve internado', 3);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'CUIDADO_PRAZO_DEGRAU_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('CUIDADO_PRAZO_DEGRAU_DIAS', N'Cuidado pastoral — dias de prazo novo a cada degrau que o item vencido sobe', 3);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'CUIDADO_DETECCAO_SEMANAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('CUIDADO_DETECCAO_SEMANAS', N'Cuidado pastoral — detecção de afastamento: SEMANAS recentes comparadas com o costume da pessoa', 6);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'CUIDADO_DETECCAO_COSTUME_PCT')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('CUIDADO_DETECCAO_COSTUME_PCT', N'Cuidado pastoral — detecção: presença mínima (%) no período de base para haver costume', 50);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'CUIDADO_DETECCAO_QUEDA_PCT')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('CUIDADO_DETECCAO_QUEDA_PCT', N'Cuidado pastoral — detecção: queda mínima (%) da presença nas semanas recentes para abrir o item', 60);
GO

-- ---- 7) Avisos (motor da vB.2). O de sinal de risco é obrigatório e sai por e-mail e pelo celular; os outros a pessoa pode ajustar. ----

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CUIDADO_ATRIBUIDO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'CUIDADO_ATRIBUIDO', N'Cuidado pastoral: você foi nomeado responsável por um acompanhamento', N'CUIDADO', NULL, NULL, 1, 1, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CUIDADO_RESUMO_DIARIO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'CUIDADO_RESUMO_DIARIO', N'Cuidado pastoral: seus acompanhamentos de hoje', N'CUIDADO', NULL, NULL, 1, 0, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CUIDADO_DEGRAU')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'CUIDADO_DEGRAU', N'Cuidado pastoral: um acompanhamento venceu e subiu para você', N'CUIDADO', NULL, NULL, 1, 1, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CUIDADO_MODERACAO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'CUIDADO_MODERACAO', N'Cuidado pastoral: pedidos de oração esperando moderação', N'CUIDADO', NULL, NULL, 1, 0, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CUIDADO_RISCO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'CUIDADO_RISCO', N'Cuidado pastoral: chegou um pedido com SINAL DE RISCO — atenda agora', N'CUIDADO', NULL, NULL, 1, 1, 1);
GO

-- ---- 8) Retenção ----

IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Cuidado pastoral — acompanhamentos')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao) VALUES (N'Cuidado pastoral — acompanhamentos', N'x', 1825);
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Cuidado pastoral — pedidos de oração')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao) VALUES (N'Cuidado pastoral — pedidos de oração', N'x', 365);
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Cuidado pastoral — pedidos de oração com sinal de risco')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao) VALUES (N'Cuidado pastoral — pedidos de oração com sinal de risco', N'x', 1825);
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Cuidado pastoral — notas pastorais após a saída')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao) VALUES (N'Cuidado pastoral — notas pastorais após a saída', N'x', 30);
GO
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Fila de acompanhamento (Regimento Art. 128 §5º; LGPD arts. 7º, IX e 11): o item encerrado guarda-se 5 anos como registro do cuidado e depois perde o nome, o contato, o motivo e as observações; a contagem fica.'
WHERE Categoria = N'Cuidado pastoral — acompanhamentos';
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Pedido de oração (LGPD art. 11, dado sensível de convicção religiosa e saúde): o texto sai em 1 ano; o assunto e as datas ficam para a contagem. O boletim nunca leva o texto.'
WHERE Categoria = N'Cuidado pastoral — pedidos de oração';
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Pedido de oração que teve sinal de risco (autolesão ou violência; LGPD art. 11, II, e — proteção da vida): o texto fica 5 anos como prova de que a Igreja agiu, depois sai.'
WHERE Categoria = N'Cuidado pastoral — pedidos de oração com sinal de risco';
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Regimento Art. 132 §2º, II (as anotações pastorais são eliminadas na saída do membro, regra dos 30 dias) e LGPD art. 16: a rotina diária apaga as notas de quem saiu há mais de 30 dias; a exclusão LGPD apaga na hora.'
WHERE Categoria = N'Cuidado pastoral — notas pastorais após a saída';
GO
