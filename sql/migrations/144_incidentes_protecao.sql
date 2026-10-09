-- ============================================================
-- Migração 144 — v7.8: Incidentes, notificação obrigatória e escuta protegida
-- (ECA Art. 13 e Art. 245; Lei 13.431/2017; Regimento Art. 133 §5º; LGPD arts. 11 e 14)
--
-- O que a Igreja precisa poder PROVAR, sem investigar:
--   1) o registro de um incidente de proteção em três níveis (quase-acidente, quebra de política, suspeita ou relato de violência), com o instante
--      em que a Igreja ficou sabendo e o prazo de 24 horas para comunicar o Conselho Tutelar (calculado na leitura: o prazo vence mesmo que nenhuma rotina rode);
--   2) quem foi avisado e quando (órgão, forma, protocolo do órgão, onde o comprovante está guardado) e o que fecha o caso (nunca sem comprovante);
--   3) o relato espontâneo da criança, UMA vez e na íntegra, guardado em tabela à parte, só de leitura para o sistema e com registro de quem o leu;
--   4) o afastamento cautelar da pessoa envolvida de toda escala com menores (medida protetiva, não punição) e a decisão do Comitê de mantê-lo ou levantá-lo;
--   5) as reclassificações (só para cima) e os avisos obrigatórios.
--
-- Nada é apagado: os registros só acumulam (gatilhos de imutabilidade). O afastamento cautelar e o Comitê NÃO ganham coluna própria: o primeiro é calculado
-- (envolvido de incidente em nível de suspeita de violência, cuja última decisão não é "levantado") e o segundo é o papel "Comitê de Proteção" do cadastro de lideranças.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

-- ---- 1) O incidente ----

IF OBJECT_ID(N'dbo.IncidentesProtecao', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.IncidentesProtecao (
        IncidenteId               INT IDENTITY PRIMARY KEY,
        Protocolo                 NVARCHAR(30) NOT NULL CONSTRAINT UQ_IncidentesProtecao_Protocolo UNIQUE,
        Nivel                     NVARCHAR(16) NOT NULL CONSTRAINT CK_IncidentesProtecao_Nivel CHECK (Nivel IN ('QUASE_ACIDENTE','QUEBRA_POLITICA','ALEGACAO')),
        Origem                    NVARCHAR(12) NOT NULL CONSTRAINT CK_IncidentesProtecao_Origem CHECK (Origem IN ('MEMBRO','CANAL_AJUDA')),
        CongregacaoId             INT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        EquipeId                  INT NULL REFERENCES dbo.EscalasEquipes(EquipeId),
        DataOcorrencia            DATE NOT NULL,
        Onde                      NVARCHAR(150) NULL,
        Descricao                 NVARCHAR(1000) NOT NULL,
        RelatadoPor               NVARCHAR(16) NULL CONSTRAINT CK_IncidentesProtecao_RelatadoPor CHECK (RelatadoPor IS NULL OR RelatadoPor IN ('PROPRIA_CRIANCA','RESPONSAVEL','VOLUNTARIO','OUTRA_PESSOA')),
        ContatoCanal              NVARCHAR(150) NULL,
        ConhecidoEm               DATETIME2 NOT NULL,
        ExigeComunicacao          BIT NOT NULL,
        PrazoNotificacaoEm        DATETIME2 NULL,
        RegistradoPorMembroId     INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm              DATETIME2 NOT NULL CONSTRAINT DF_IncidentesProtecao_Em DEFAULT SYSUTCDATETIME(),
        Status                    NVARCHAR(10) NOT NULL CONSTRAINT DF_IncidentesProtecao_Status DEFAULT 'ABERTO' CONSTRAINT CK_IncidentesProtecao_Status CHECK (Status IN ('ABERTO','ENCERRADO')),
        EncerradoEm               DATETIME2 NULL,
        EncerradoPorMembroId      INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        EncerramentoResultado     NVARCHAR(24) NULL CONSTRAINT CK_IncidentesProtecao_Resultado CHECK (EncerramentoResultado IS NULL OR EncerramentoResultado IN ('ENCAMINHADO_AUTORIDADE','MEDIDA_INTERNA','SEM_CONTINUIDADE')),
        EncerramentoProvidencia   NVARCHAR(500) NULL,
        -- a suspeita de violência sempre tem prazo; o canal sem login não tem quem o registrou; a suspeita sempre diz quem contou
        CONSTRAINT CK_IncidentesProtecao_Prazo CHECK (ExigeComunicacao = 0 OR PrazoNotificacaoEm IS NOT NULL),
        CONSTRAINT CK_IncidentesProtecao_Exige CHECK (Nivel <> 'ALEGACAO' OR ExigeComunicacao = 1),
        CONSTRAINT CK_IncidentesProtecao_Registrante CHECK (Origem = 'CANAL_AJUDA' OR RegistradoPorMembroId IS NOT NULL),
        CONSTRAINT CK_IncidentesProtecao_QuemContou CHECK (Nivel <> 'ALEGACAO' OR RelatadoPor IS NOT NULL),
        CONSTRAINT CK_IncidentesProtecao_Encerrado CHECK (
            (Status = 'ABERTO' AND EncerradoEm IS NULL AND EncerradoPorMembroId IS NULL AND EncerramentoResultado IS NULL AND EncerramentoProvidencia IS NULL)
         OR (Status = 'ENCERRADO' AND EncerradoEm IS NOT NULL AND EncerradoPorMembroId IS NOT NULL AND EncerramentoResultado IS NOT NULL AND EncerramentoProvidencia IS NOT NULL))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_IncidentesProtecao_Fila' AND object_id = OBJECT_ID(N'dbo.IncidentesProtecao'))
    CREATE INDEX IX_IncidentesProtecao_Fila ON dbo.IncidentesProtecao (Status, CongregacaoId, RegistradoEm DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_IncidentesProtecao_Prazo' AND object_id = OBJECT_ID(N'dbo.IncidentesProtecao'))
    CREATE INDEX IX_IncidentesProtecao_Prazo ON dbo.IncidentesProtecao (PrazoNotificacaoEm) WHERE Status = 'ABERTO' AND ExigeComunicacao = 1;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_IncidentesProtecao_Canal' AND object_id = OBJECT_ID(N'dbo.IncidentesProtecao'))
    CREATE INDEX IX_IncidentesProtecao_Canal ON dbo.IncidentesProtecao (Origem, RegistradoEm DESC);
GO

-- ---- 2) A pessoa envolvida (membro do cadastro ou apenas um nome) ----

IF OBJECT_ID(N'dbo.IncidenteEnvolvidos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.IncidenteEnvolvidos (
        EnvolvidoId   INT IDENTITY PRIMARY KEY,
        IncidenteId   INT NOT NULL REFERENCES dbo.IncidentesProtecao(IncidenteId),
        MembroId      INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Nome          NVARCHAR(150) NULL,
        RegistradoEm  DATETIME2 NOT NULL CONSTRAINT DF_IncidenteEnvolvidos_Em DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_IncidenteEnvolvidos_Quem CHECK (MembroId IS NOT NULL OR Nome IS NOT NULL)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_IncidenteEnvolvidos_Membro' AND object_id = OBJECT_ID(N'dbo.IncidenteEnvolvidos'))
    CREATE INDEX IX_IncidenteEnvolvidos_Membro ON dbo.IncidenteEnvolvidos (MembroId) INCLUDE (IncidenteId) WHERE MembroId IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_IncidenteEnvolvidos_Incidente' AND object_id = OBJECT_ID(N'dbo.IncidenteEnvolvidos'))
    CREATE INDEX IX_IncidenteEnvolvidos_Incidente ON dbo.IncidenteEnvolvidos (IncidenteId);
GO

-- A decisão do Comitê sobre o afastamento cautelar: só acréscimo; a última decisão vale. Sem decisão, o afastamento continua (o sistema não rebaixa sozinho).
IF OBJECT_ID(N'dbo.IncidenteDecisoesCautelares', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.IncidenteDecisoesCautelares (
        DecisaoId             INT IDENTITY PRIMARY KEY,
        EnvolvidoId           INT NOT NULL REFERENCES dbo.IncidenteEnvolvidos(EnvolvidoId),
        Decisao               NVARCHAR(18) NOT NULL CONSTRAINT CK_IncidenteDecisoes_Decisao CHECK (Decisao IN ('MANTIDO_AFASTADO','LIBERADO')),
        Observacao            NVARCHAR(300) NOT NULL,
        DecididaPorMembroId   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DecididaEm            DATETIME2 NOT NULL CONSTRAINT DF_IncidenteDecisoes_Em DEFAULT SYSUTCDATETIME()
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_IncidenteDecisoes_Envolvido' AND object_id = OBJECT_ID(N'dbo.IncidenteDecisoesCautelares'))
    CREATE INDEX IX_IncidenteDecisoes_Envolvido ON dbo.IncidenteDecisoesCautelares (EnvolvidoId, DecisaoId DESC);
GO

-- ---- 3) O relato espontâneo (dado sensível de criança): tabela à parte, só acréscimo, com registro de quem leu ----

IF OBJECT_ID(N'dbo.IncidenteRelatos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.IncidenteRelatos (
        RelatoId               INT IDENTITY PRIMARY KEY,
        IncidenteId            INT NOT NULL REFERENCES dbo.IncidentesProtecao(IncidenteId),
        Tipo                   NVARCHAR(8) NOT NULL CONSTRAINT CK_IncidenteRelatos_Tipo CHECK (Tipo IN ('RELATO','ADENDO')),
        Texto                  NVARCHAR(4000) NOT NULL,
        RegistradoPorMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm           DATETIME2 NOT NULL CONSTRAINT DF_IncidenteRelatos_Em DEFAULT SYSUTCDATETIME()
    );
END
GO
-- um relato só por incidente: a conversa não se repete (repetir a escuta machuca de novo); informação nova e espontânea entra como adendo
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_IncidenteRelatos_Um' AND object_id = OBJECT_ID(N'dbo.IncidenteRelatos'))
    CREATE UNIQUE INDEX UX_IncidenteRelatos_Um ON dbo.IncidenteRelatos (IncidenteId) WHERE Tipo = 'RELATO';
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_IncidenteRelatos_Incidente' AND object_id = OBJECT_ID(N'dbo.IncidenteRelatos'))
    CREATE INDEX IX_IncidenteRelatos_Incidente ON dbo.IncidenteRelatos (IncidenteId);
GO

IF OBJECT_ID(N'dbo.IncidenteLeituras', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.IncidenteLeituras (
        LeituraId    INT IDENTITY PRIMARY KEY,
        IncidenteId  INT NOT NULL REFERENCES dbo.IncidentesProtecao(IncidenteId),
        MembroId     INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        LidoEm       DATETIME2 NOT NULL CONSTRAINT DF_IncidenteLeituras_Em DEFAULT SYSUTCDATETIME()
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_IncidenteLeituras_Incidente' AND object_id = OBJECT_ID(N'dbo.IncidenteLeituras'))
    CREATE INDEX IX_IncidenteLeituras_Incidente ON dbo.IncidenteLeituras (IncidenteId, LeituraId DESC);
GO

-- ---- 4) A comunicação ao órgão de proteção e a reclassificação ----

IF OBJECT_ID(N'dbo.IncidenteComunicacoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.IncidenteComunicacoes (
        ComunicacaoId          INT IDENTITY PRIMARY KEY,
        IncidenteId            INT NOT NULL REFERENCES dbo.IncidentesProtecao(IncidenteId),
        Orgao                  NVARCHAR(20) NOT NULL CONSTRAINT CK_IncidenteComunicacoes_Orgao CHECK (Orgao IN ('CONSELHO_TUTELAR','MINISTERIO_PUBLICO','POLICIA','DISQUE_100','OUTRO')),
        Forma                  NVARCHAR(16) NOT NULL CONSTRAINT CK_IncidenteComunicacoes_Forma CHECK (Forma IN ('OFICIO','PRESENCIAL','TELEFONE','EMAIL','SISTEMA_ONLINE')),
        ComunicadoEm           DATETIME2 NOT NULL,
        ProtocoloExterno       NVARCHAR(60) NULL,
        ReferenciaArquivo      NVARCHAR(200) NULL,
        Observacao             NVARCHAR(300) NULL,
        ForaDoPrazo            BIT NOT NULL,
        RegistradoPorMembroId  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm           DATETIME2 NOT NULL CONSTRAINT DF_IncidenteComunicacoes_Em DEFAULT SYSUTCDATETIME()
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_IncidenteComunicacoes_Incidente' AND object_id = OBJECT_ID(N'dbo.IncidenteComunicacoes'))
    CREATE INDEX IX_IncidenteComunicacoes_Incidente ON dbo.IncidenteComunicacoes (IncidenteId);
GO

IF OBJECT_ID(N'dbo.IncidenteReclassificacoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.IncidenteReclassificacoes (
        ReclassificacaoId     INT IDENTITY PRIMARY KEY,
        IncidenteId           INT NOT NULL REFERENCES dbo.IncidentesProtecao(IncidenteId),
        NivelAnterior         NVARCHAR(16) NOT NULL,
        NivelNovo             NVARCHAR(16) NOT NULL,
        Motivo                NVARCHAR(300) NOT NULL,
        ReclassificadoPorMembroId INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ReclassificadoEm      DATETIME2 NOT NULL CONSTRAINT DF_IncidenteReclass_Em DEFAULT SYSUTCDATETIME()
    );
END
GO

-- ---- 5) Gatilhos: acréscimo e proteção ----

-- O incidente: nada do que descreve o fato muda; o nível só SOBE (e a suspeita de violência ganha o prazo na hora); o encerramento entra uma única vez e fecha o caso.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_IncidentesProtecao_Protegido ON dbo.IncidentesProtecao AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF (EXISTS (SELECT 1 FROM deleted) AND NOT EXISTS (SELECT 1 FROM inserted)) OR EXISTS (
        SELECT 1 FROM inserted i JOIN deleted d ON d.IncidenteId = i.IncidenteId
        WHERE i.Protocolo <> d.Protocolo OR i.Origem <> d.Origem OR ISNULL(i.CongregacaoId, -1) <> ISNULL(d.CongregacaoId, -1) OR ISNULL(i.EquipeId, -1) <> ISNULL(d.EquipeId, -1)
           OR i.DataOcorrencia <> d.DataOcorrencia OR ISNULL(i.Onde, N'''') <> ISNULL(d.Onde, N'''') OR i.Descricao <> d.Descricao OR ISNULL(i.ContatoCanal, N'''') <> ISNULL(d.ContatoCanal, N'''')
           OR i.ConhecidoEm <> d.ConhecidoEm OR ISNULL(i.RegistradoPorMembroId, -1) <> ISNULL(d.RegistradoPorMembroId, -1) OR i.RegistradoEm <> d.RegistradoEm
           OR (d.RelatadoPor IS NOT NULL AND ISNULL(i.RelatadoPor, N'''') <> d.RelatadoPor)
           OR d.Status = N''ENCERRADO''
           OR (i.Nivel <> d.Nivel AND (CASE i.Nivel WHEN N''QUASE_ACIDENTE'' THEN 1 WHEN N''QUEBRA_POLITICA'' THEN 2 ELSE 3 END) <= (CASE d.Nivel WHEN N''QUASE_ACIDENTE'' THEN 1 WHEN N''QUEBRA_POLITICA'' THEN 2 ELSE 3 END))
           OR (d.ExigeComunicacao = 1 AND (i.ExigeComunicacao = 0 OR ISNULL(i.PrazoNotificacaoEm, ''19000101'') <> ISNULL(d.PrazoNotificacaoEm, ''19000101'')))
           OR (d.ExigeComunicacao = 0 AND i.ExigeComunicacao = 1 AND d.PrazoNotificacaoEm IS NOT NULL)
           OR (d.ExigeComunicacao = 0 AND i.ExigeComunicacao = 0 AND ISNULL(i.PrazoNotificacaoEm, ''19000101'') <> ISNULL(d.PrazoNotificacaoEm, ''19000101'')))
    BEGIN
        RAISERROR(N''O incidente de proteção é registro documental: não se apaga nem se altera o que descreve o fato; só o nível pode subir, e o encerramento entra uma única vez.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- Só acréscimo: envolvidos, decisões, relatos, leituras, comunicações e reclassificações.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_IncidenteEnvolvidos_Imutavel ON dbo.IncidenteEnvolvidos AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
    BEGIN
        RAISERROR(N''A pessoa envolvida num incidente de proteção é registro histórico: não se altera nem se apaga.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_IncidenteDecisoes_Imutavel ON dbo.IncidenteDecisoesCautelares AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
    BEGIN
        RAISERROR(N''A decisão sobre o afastamento cautelar é histórico: não se altera nem se apaga (para mudar, registre uma nova decisão).'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_IncidenteRelatos_Imutavel ON dbo.IncidenteRelatos AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
    BEGIN
        RAISERROR(N''O relato é registro documental: guarda-se como foi contado, sem alteração; informação nova entra como adendo.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_IncidenteLeituras_Imutavel ON dbo.IncidenteLeituras AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
    BEGIN
        RAISERROR(N''O registro de quem leu o relato é histórico: não se altera nem se apaga.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_IncidenteComunicacoes_Imutavel ON dbo.IncidenteComunicacoes AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
    BEGIN
        RAISERROR(N''A comunicação ao órgão de proteção é prova documental: não se altera nem se apaga (um erro se corrige com um novo registro e a observação).'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_IncidenteReclass_Imutavel ON dbo.IncidenteReclassificacoes AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
    BEGIN
        RAISERROR(N''A reclassificação do incidente é histórico: não se altera nem se apaga.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 6) Permissão e o papel do Comitê de Proteção ----

IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'protecao_menores')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('protecao_menores', N'Proteção de crianças — incidentes, aviso ao Conselho Tutelar, relato protegido e afastamento');
GO
IF (SELECT CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Papeis' AND COLUMN_NAME = 'Permissoes') BETWEEN 1 AND 999
    ALTER TABLE dbo.Papeis ALTER COLUMN Permissoes NVARCHAR(1000) NULL;
GO
-- Quem recebe: a Diretoria (Presidente e Secretário Geral, nível global), o Dirigente de cada congregação (só enxerga o que é da sua congregação) e o novo papel do Comitê.
UPDATE dbo.Papeis
SET Permissoes = CASE WHEN ISNULL(Permissoes, '') = '' THEN 'protecao_menores' ELSE Permissoes + ',protecao_menores' END
WHERE Nome IN ('Presidente', 'Secretário Geral', 'Dirigente de Congregação') AND (',' + ISNULL(Permissoes, '') + ',') NOT LIKE '%,protecao_menores,%';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = N'Comitê de Proteção')
    INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes) VALUES (N'Comitê de Proteção', 'GLOBAL', 'protecao_menores');
GO

-- ---- 7) Avisos (motor da vB.2): os que protegem criança não podem ser desligados pelo destinatário (Obrigatoria = 1) ----

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'PROTECAO_INCIDENTE_NOVO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'PROTECAO_INCIDENTE_NOVO', N'Proteção: incidente registrado', N'PROTECAO', NULL, NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'PROTECAO_PRAZO_24H')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'PROTECAO_PRAZO_24H', N'Proteção: prazo de 24 horas para comunicar o Conselho Tutelar', N'PROTECAO', NULL, NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'PROTECAO_PADRAO_QUEBRAS')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'PROTECAO_PADRAO_QUEBRAS', N'Proteção: pequenas quebras repetidas na mesma equipe ou pessoa', N'PROTECAO', NULL, NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'PROTECAO_COMITE_INCOMPLETO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'PROTECAO_COMITE_INCOMPLETO', N'Proteção: o Comitê de Proteção está incompleto', N'PROTECAO', NULL, NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'PROTECAO_CAUTELAR_SEM_DECISAO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'PROTECAO_CAUTELAR_SEM_DECISAO', N'Proteção: afastamento cautelar sem decisão do Comitê', N'PROTECAO', NULL, NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'PROTECAO_AFASTAMENTO_PESSOA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'PROTECAO_AFASTAMENTO_PESSOA', N'Proteção: o seu contato com menores foi suspenso por cautela', N'PROTECAO', NULL, NULL, 1, 1);
GO

-- ---- 8) Retenção (LGPD art. 16): o incidente guarda-se por muito tempo — o prazo para a vítima agir e para a Justiça apurar corre a partir dos 18 anos ----

IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Incidentes de proteção de crianças e adolescentes')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (N'Incidentes de proteção de crianças e adolescentes', N'x', 7300);
GO
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Incidente, relato espontâneo, comunicação ao Conselho Tutelar e decisões (ECA arts. 13 e 245; Lei 13.431/2017; LGPD arts. 11 e 14): guardados por 20 anos do encerramento, porque o prazo para a apuração corre a partir dos 18 anos da vítima. Acesso restrito, com registro de cada leitura do relato.'
WHERE Categoria = N'Incidentes de proteção de crianças e adolescentes';
GO
