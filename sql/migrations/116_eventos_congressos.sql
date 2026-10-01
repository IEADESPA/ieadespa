-- ============================================================
-- Migração 116 — v7.4: Eventos e Congressos (governança do evento)
-- (Regimento Art. 53-E §2º, 111, 111-A e 152; Estatuto: procedimentos para eventos e convites).
--
-- O calendário (v7.2) já é o cadastro de eventos (local, Área, geral, os Congressos Unificados) e o SITE
-- continua dono da inscrição, lista de espera, check-in, certificado e programação do evento com página
-- (decisão registrada na v7.4). Esta migração acrescenta o que o site não tem e o Regimento exige:
--   - ORGANIZADORES do evento (responsável, organizador, tesoureiro), sem criar permissão por evento;
--   - CONVIDADOS EXTERNOS (preletores e cantores) com o Protocolo de Convidados: consulta ao Conselho de
--     Ética com 10 dias de antecedência quando a reputação é desconhecida (Art. 111, parágrafo único) e
--     "Nada Consta" da Presidência nos eventos gerais (Art. 111-A) — só depois o convite é oficializado
--     e divulgado. O banco impede AUTORIZADO sem os pareceres exigidos;
--   - CAIXA FLUTUANTE DE EVENTOS (Art. 53-E §2º): arrecadação e custeio do evento de Área/Região/Geral,
--     encerramento com a destinação OBRIGATÓRIA do superávit (recolher à Sede ou converter em benfeitoria,
--     sem conta com saldo acumulado), declaração de que não há conta bancária paralela (§3º) e conferência
--     pela Tesouraria Geral.
-- Permissões novas (nunca concedidas por padrão): eventos_gestao, eventos_etica, eventos_presidencia.
-- Seis regras de aviso.
--
-- Idempotente: seguro para reexecutar sem apagar dados. Cada DDL em batch próprio (GO); gatilho por EXEC.
-- ============================================================

-- ---- 1) Organizadores do evento ----

IF OBJECT_ID(N'dbo.EventoOrganizadores', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EventoOrganizadores (
        OrganizadorId         INT IDENTITY PRIMARY KEY,
        EventoId              INT NOT NULL REFERENCES dbo.CalendarioEventos(EventoId),
        MembroId              INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Papel                 NVARCHAR(14) NOT NULL CONSTRAINT CK_EventoOrganizadores_Papel CHECK (Papel IN ('RESPONSAVEL','ORGANIZADOR','TESOUREIRO')),
        DesignadoPorMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DesignadoEm           DATETIME2 NOT NULL CONSTRAINT DF_EventoOrganizadores_Em DEFAULT SYSUTCDATETIME(),
        EncerradoEm           DATETIME2 NULL,
        EncerradoPorMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        MotivoEncerramento    NVARCHAR(200) NULL
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_EventoOrganizadores_Ativo' AND object_id = OBJECT_ID(N'dbo.EventoOrganizadores'))
    CREATE UNIQUE INDEX UX_EventoOrganizadores_Ativo ON dbo.EventoOrganizadores (EventoId, MembroId) WHERE EncerradoEm IS NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_EventoOrganizadores_Membro' AND object_id = OBJECT_ID(N'dbo.EventoOrganizadores'))
    CREATE INDEX IX_EventoOrganizadores_Membro ON dbo.EventoOrganizadores (MembroId) INCLUDE (EventoId, Papel) WHERE EncerradoEm IS NULL;
GO

-- ---- 2) Convidados externos (Art. 111 e 111-A) ----

IF OBJECT_ID(N'dbo.EventoConvidados', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EventoConvidados (
        ConvidadoId             INT IDENTITY PRIMARY KEY,
        EventoId                INT NOT NULL REFERENCES dbo.CalendarioEventos(EventoId),
        Nome                    NVARCHAR(150) NOT NULL,
        Tipo                    NVARCHAR(10) NOT NULL CONSTRAINT CK_EventoConvidados_Tipo CHECK (Tipo IN ('PRELETOR','CANTOR','BANDA','OUTRO')),
        MinisterioOrigem        NVARCHAR(150) NULL,
        Contato                 NVARCHAR(150) NULL,                       -- dado pessoal de terceiro: só a organização e a gestão veem
        ReputacaoConhecida      BIT NOT NULL,                             -- declaração do organizador (Art. 111, parágrafo único)
        ObservacaoOrganizador   NVARCHAR(500) NULL,
        DivulgacaoAutorizada    BIT NOT NULL CONSTRAINT DF_EventoConvidados_Divulg DEFAULT 0,   -- o convidado aceitou ter o nome divulgado
        Status                  NVARCHAR(10) NOT NULL CONSTRAINT DF_EventoConvidados_Status DEFAULT 'RASCUNHO'
                                CONSTRAINT CK_EventoConvidados_Status CHECK (Status IN ('RASCUNHO','EM_ANALISE','AUTORIZADO','VETADO','CANCELADO')),
        ExigeEtica              BIT NOT NULL CONSTRAINT DF_EventoConvidados_ExEt DEFAULT 0,
        ExigeNadaConsta         BIT NOT NULL CONSTRAINT DF_EventoConvidados_ExNc DEFAULT 0,
        SubmetidoEm             DATETIME2 NULL,
        SubmetidoPorMembroId    INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        EticaParecer            NVARCHAR(12) NULL CONSTRAINT CK_EventoConvidados_Etica CHECK (EticaParecer IS NULL OR EticaParecer IN ('FAVORAVEL','DESFAVORAVEL')),
        EticaMotivo             NVARCHAR(500) NULL,
        EticaPorMembroId        INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        EticaEm                 DATETIME2 NULL,
        NadaConsta              NVARCHAR(10) NULL CONSTRAINT CK_EventoConvidados_NC CHECK (NadaConsta IS NULL OR NadaConsta IN ('CONCEDIDO','NEGADO')),
        NadaConstaMotivo        NVARCHAR(500) NULL,
        NadaConstaPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        NadaConstaEm            DATETIME2 NULL,
        OficializadoEm          DATETIME2 NULL,
        OficializadoPorMembroId INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CanceladoEm             DATETIME2 NULL,
        CanceladoPorMembroId    INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        MotivoCancelamento      NVARCHAR(300) NULL,
        CriadoPorMembroId       INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm                DATETIME2 NOT NULL CONSTRAINT DF_EventoConvidados_Em DEFAULT SYSUTCDATETIME(),
        -- Ninguém é AUTORIZADO sem os pareceres que a regra exige. ISNULL evita o "desconhecido" do SQL, que um CHECK aceita.
        CONSTRAINT CK_EventoConvidados_Autorizado CHECK (Status <> 'AUTORIZADO'
            OR ((ExigeEtica = 0 OR ISNULL(EticaParecer, '') = 'FAVORAVEL') AND (ExigeNadaConsta = 0 OR ISNULL(NadaConsta, '') = 'CONCEDIDO'))),
        CONSTRAINT CK_EventoConvidados_Vetado CHECK (Status <> 'VETADO' OR ISNULL(EticaParecer, '') = 'DESFAVORAVEL' OR ISNULL(NadaConsta, '') = 'NEGADO'),
        CONSTRAINT CK_EventoConvidados_Oficial CHECK (OficializadoEm IS NULL OR Status IN ('AUTORIZADO','CANCELADO')),
        CONSTRAINT CK_EventoConvidados_Cancel CHECK (Status <> 'CANCELADO' OR (CanceladoEm IS NOT NULL AND MotivoCancelamento IS NOT NULL))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_EventoConvidados_Evento' AND object_id = OBJECT_ID(N'dbo.EventoConvidados'))
    CREATE INDEX IX_EventoConvidados_Evento ON dbo.EventoConvidados (EventoId, Status);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_EventoConvidados_Analise' AND object_id = OBJECT_ID(N'dbo.EventoConvidados'))
    CREATE INDEX IX_EventoConvidados_Analise ON dbo.EventoConvidados (Status) INCLUDE (EventoId, ExigeEtica, ExigeNadaConsta) WHERE Status = 'EM_ANALISE';
GO

-- ---- 3) Caixa Flutuante de Eventos (Art. 53-E §2º e §3º) ----

IF OBJECT_ID(N'dbo.EventoCaixas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EventoCaixas (
        EventoId                  INT NOT NULL PRIMARY KEY REFERENCES dbo.CalendarioEventos(EventoId),
        Status                    NVARCHAR(10) NOT NULL CONSTRAINT DF_EventoCaixas_Status DEFAULT 'ABERTO'
                                  CONSTRAINT CK_EventoCaixas_Status CHECK (Status IN ('ABERTO','ENCERRADO','CONFERIDO')),
        AbertoEm                  DATETIME2 NOT NULL CONSTRAINT DF_EventoCaixas_Em DEFAULT SYSUTCDATETIME(),
        AbertoPorMembroId         INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        -- Art. 53-E §3º: conta bancária paralela é infração gravíssima — a declaração é de quem abre o caixa.
        DeclaracaoSemContaEm      DATETIME2 NOT NULL,
        DeclaracaoSemContaPorMembroId INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        PrazoEncerramentoEm       DATE NOT NULL,
        Ciclo                     INT NOT NULL CONSTRAINT DF_EventoCaixas_Ciclo DEFAULT 1,     -- sobe a cada devolução pela Tesouraria (chave dos avisos)
        EncerradoEm               DATETIME2 NULL,
        EncerradoPorMembroId      INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        TotalEntradas             DECIMAL(12,2) NULL,
        TotalSaidas               DECIMAL(12,2) NULL,
        Saldo                     DECIMAL(12,2) NULL,
        JustificativaDeficit      NVARCHAR(500) NULL,
        ConferidoEm               DATETIME2 NULL,
        ConferidoPorMembroId      INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ConferenciaObs            NVARCHAR(500) NULL,
        DevolvidoEm               DATETIME2 NULL,
        DevolvidoPorMembroId      INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DevolvidoMotivo           NVARCHAR(300) NULL,
        CONSTRAINT CK_EventoCaixas_Encerrado CHECK (Status = 'ABERTO' OR (EncerradoEm IS NOT NULL AND Saldo IS NOT NULL)),
        CONSTRAINT CK_EventoCaixas_Conferido CHECK (Status <> 'CONFERIDO' OR (ConferidoEm IS NOT NULL AND ConferidoPorMembroId IS NOT NULL))
    );
END
GO

IF OBJECT_ID(N'dbo.EventoCaixaLancamentos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EventoCaixaLancamentos (
        LancamentoId          INT IDENTITY PRIMARY KEY,
        EventoId              INT NOT NULL REFERENCES dbo.EventoCaixas(EventoId),
        Tipo                  NVARCHAR(7) NOT NULL CONSTRAINT CK_EventoCaixaLanc_Tipo CHECK (Tipo IN ('ENTRADA','SAIDA')),
        Categoria             NVARCHAR(24) NOT NULL,
        Valor                 DECIMAL(12,2) NOT NULL CONSTRAINT CK_EventoCaixaLanc_Valor CHECK (Valor > 0),
        DataLancamento        DATE NOT NULL,
        Descricao             NVARCHAR(300) NOT NULL,
        Comprovante           NVARCHAR(200) NULL,
        RegistradoPorMembroId INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm          DATETIME2 NOT NULL CONSTRAINT DF_EventoCaixaLanc_Em DEFAULT SYSUTCDATETIME(),
        CanceladoEm           DATETIME2 NULL,
        CanceladoPorMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        MotivoCancelamento    NVARCHAR(300) NULL,
        CONSTRAINT CK_EventoCaixaLanc_Categoria CHECK (
            (Tipo = 'ENTRADA' AND Categoria IN ('OFERTA_VOLUNTARIA','CAMPANHA','VENDAS_CANTINA','OUTRA_ENTRADA'))
         OR (Tipo = 'SAIDA' AND Categoria IN ('ESTRUTURA','ALIMENTACAO','TRANSPORTE','HOSPEDAGEM','MATERIAL','SOM_E_MIDIA','OFERTA_A_CONVIDADO','OUTRA_SAIDA'))),
        -- Toda saída tem comprovante (Art. 152, I: toda arrecadação e gasto documentados para a auditoria).
        CONSTRAINT CK_EventoCaixaLanc_Comprovante CHECK (Tipo = 'ENTRADA' OR LEN(ISNULL(Comprovante, '')) >= 3),
        CONSTRAINT CK_EventoCaixaLanc_Cancel CHECK ((CanceladoEm IS NULL AND MotivoCancelamento IS NULL) OR (CanceladoEm IS NOT NULL AND MotivoCancelamento IS NOT NULL))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_EventoCaixaLanc_Evento' AND object_id = OBJECT_ID(N'dbo.EventoCaixaLancamentos'))
    CREATE INDEX IX_EventoCaixaLanc_Evento ON dbo.EventoCaixaLancamentos (EventoId, DataLancamento);
GO

IF OBJECT_ID(N'dbo.EventoCaixaDestinos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EventoCaixaDestinos (
        DestinoId             INT IDENTITY PRIMARY KEY,
        EventoId              INT NOT NULL REFERENCES dbo.EventoCaixas(EventoId),
        Tipo                  NVARCHAR(14) NOT NULL CONSTRAINT CK_EventoCaixaDest_Tipo CHECK (Tipo IN ('RECOLHIDO_SEDE','BENFEITORIA')),
        Valor                 DECIMAL(12,2) NOT NULL CONSTRAINT CK_EventoCaixaDest_Valor CHECK (Valor > 0),
        DataDestino           DATE NOT NULL,
        Comprovante           NVARCHAR(200) NOT NULL CONSTRAINT CK_EventoCaixaDest_Comp CHECK (LEN(Comprovante) >= 3),
        Descricao             NVARCHAR(300) NULL,
        RegistradoEm          DATETIME2 NOT NULL CONSTRAINT DF_EventoCaixaDest_Em DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Caixa que não está ABERTO não aceita lançamento nem alteração: o fechamento é a prova.
IF OBJECT_ID(N'dbo.TR_EventoCaixaLancamentos_SoAberto', N'TR') IS NULL
    EXEC(N'CREATE TRIGGER dbo.TR_EventoCaixaLancamentos_SoAberto ON dbo.EventoCaixaLancamentos AFTER INSERT, UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM inserted i JOIN dbo.EventoCaixas c ON c.EventoId = i.EventoId WHERE c.Status <> ''ABERTO'')
    BEGIN
        RAISERROR(N''O caixa do evento não está aberto: encerrado não recebe lançamento nem alteração (Regimento Art. 53-E, §2º).'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 4) Permissões, prazos, avisos e retenção ----

IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'eventos_gestao')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('eventos_gestao', N'Eventos — Secretaria Geral: organizadores, painel de eventos, convidados e caixas');
IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'eventos_etica')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('eventos_etica', N'Eventos — Conselho de Ética: parecer sobre convidados de reputação desconhecida');
IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'eventos_presidencia')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('eventos_presidencia', N'Eventos — Presidência: Nada Consta dos convidados dos eventos gerais');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'EVENTO_ETICA_ANTECEDENCIA_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('EVENTO_ETICA_ANTECEDENCIA_DIAS', N'Eventos — antecedência (dias) da consulta ao Conselho de Ética sobre convidado de reputação desconhecida (Reg. Art. 111)', 10);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'EVENTO_CAIXA_ENCERRAR_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('EVENTO_CAIXA_ENCERRAR_DIAS', N'Eventos — prazo (dias após o fim do evento) para encerrar o caixa flutuante e destinar o superávit (Reg. Art. 53-E §2º)', 15);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'EVENTOS_ORGANIZADOR_DESIGNADO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'EVENTOS_ORGANIZADOR_DESIGNADO', N'Você foi designado para organizar um evento', N'EVENTOS', NULL, NULL, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'EVENTOS_CONVIDADO_PARA_ANALISE')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'EVENTOS_CONVIDADO_PARA_ANALISE', N'Convidado de evento aguardando o seu parecer (Protocolo de Convidados)', N'EVENTOS', NULL, NULL, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'EVENTOS_CONVIDADO_DECIDIDO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'EVENTOS_CONVIDADO_DECIDIDO', N'Houve decisão sobre um convidado do seu evento', N'EVENTOS', NULL, NULL, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'EVENTOS_CONVIDADO_ATRASADO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'EVENTOS_CONVIDADO_ATRASADO', N'Convidado de evento próximo ainda sem parecer', N'EVENTOS', NULL, NULL, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'EVENTOS_CAIXA_ENCERRAR')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'EVENTOS_CAIXA_ENCERRAR', N'Caixa do evento fora do prazo: encerre e destine o superávit', N'EVENTOS', NULL, NULL, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'EVENTOS_CAIXA_PARA_CONFERIR')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'EVENTOS_CAIXA_PARA_CONFERIR', N'Caixa de evento encerrado aguardando a conferência da Tesouraria Geral', N'EVENTOS', N'financeiro', NULL, 1);
GO

-- Retenção: o caixa do evento é registro financeiro (guarda fiscal de 5 anos, CTN art. 173); o contato do
-- convidado externo é dado pessoal de terceiro, desnecessário depois do evento — o descarte automático AINDA
-- NÃO existe e o prazo é decisão da CLI/Encarregado.
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Eventos, convidados externos e caixa flutuante')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (
        N'Eventos, convidados externos e caixa flutuante',
        N'Caixa do evento: registro financeiro, 5 anos (CTN art. 173; Reg. Art. 152). Convidado externo: prova do Protocolo de Convidados (Reg. Art. 111-A); o contato é dado de terceiro e não é necessário após o evento. Sem descarte automático por ora.',
        1825
    );
GO
