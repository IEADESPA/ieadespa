-- ============================================================
-- Migração 169 — v9.4: Missões — campos, missionários e prestação de contas. Desenho em docs/plano/fase-9-entidades-vinculadas.md.
--
-- Base legal: Regimento Art. 23 e 24 §2º (parecer da CME sobre o envio de missionários), Art. 43 e 44 (SEMIADESPA; §1º frentes no município; §2º envio para
-- outros Estados ou Países e convênios externos: CLI e Pastor Presidente), Art. 126-N, I, Art. 133-C e Art. 134 §6º, I (sustento por determinação expressa).
--
--   CamposMissionarios:   o campo (frente local, cidade do Pará, outro Estado ou outro país); a abrangência é calculada pelo lugar.
--   EnviosMissionarios:   o envio do missionário ao campo — o pedido, o parecer da CME, a decisão da CLI, a concordância do Presidente, a ativação e o encerramento.
--   EnvioSustentoValores: o sustento mensal vigente de cada envio, com o histórico (o valor da ativação e cada reajuste do Presidente).
--   RelatoriosCampo:      o relatório de cada período (mês ou trimestre) do envio.
--   SustentoGeracoes:     a Saída do Contas a Pagar gerada para cada envio e mês (uma só).
--   Categorias de Saída "Sustento missionário" (Tesouro Geral) e "Sustento missionário (caixa local)"; a permissão "missoes"; os avisos; a retenção.
--
-- Idempotente: seguro para reexecutar sem apagar dados. Cada ALTER em batch próprio (GO).
-- ============================================================

-- ---- o campo missionário ----
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.CamposMissionarios') AND type = N'U')
BEGIN
    CREATE TABLE dbo.CamposMissionarios (
        CampoId                  INT IDENTITY CONSTRAINT PK_CamposMissionarios PRIMARY KEY,
        Nome                     NVARCHAR(150) NOT NULL,
        Pais                     NVARCHAR(80) NOT NULL CONSTRAINT DF_CamposMissionarios_Pais DEFAULT N'Brasil',
        UF                       NVARCHAR(2) NULL,
        Cidade                   NVARCHAR(150) NULL,
        ZonaRuralAdjacente       BIT NOT NULL CONSTRAINT DF_CamposMissionarios_Zona DEFAULT 0,
        Abrangencia              NVARCHAR(15) NOT NULL,
        CongregacaoMantenedoraId INT NULL CONSTRAINT FK_CamposMissionarios_Mantenedora REFERENCES dbo.Congregacoes(CongregacaoId),
        Divulgacao               NVARCHAR(10) NOT NULL CONSTRAINT DF_CamposMissionarios_Divulgacao DEFAULT N'RESTRITA',
        Descricao                NVARCHAR(1000) NULL,
        Status                   NVARCHAR(10) NOT NULL CONSTRAINT DF_CamposMissionarios_Status DEFAULT N'ATIVO',
        AbertoEm                 DATE NOT NULL,
        AbertoPor                INT NOT NULL,
        CriadoEm                 DATETIME2 NOT NULL CONSTRAINT DF_CamposMissionarios_Em DEFAULT SYSUTCDATETIME(),
        EncerradoEm              DATE NULL,
        EncerradoPor             INT NULL,
        MotivoEncerramento       NVARCHAR(1000) NULL,
        CONSTRAINT CK_CamposMissionarios_Abrangencia CHECK (Abrangencia IN (N'LOCAL', N'ESTADUAL', N'NACIONAL', N'TRANSCULTURAL')),
        CONSTRAINT CK_CamposMissionarios_Divulgacao CHECK (Divulgacao IN (N'PUBLICA', N'RESTRITA')),
        CONSTRAINT CK_CamposMissionarios_Status CHECK (Status IN (N'ATIVO', N'ENCERRADO')),
        CONSTRAINT CK_CamposMissionarios_Encerramento CHECK ((Status = N'ATIVO' AND EncerradoEm IS NULL AND MotivoEncerramento IS NULL)
            OR (Status = N'ENCERRADO' AND EncerradoEm IS NOT NULL AND MotivoEncerramento IS NOT NULL))
    );
END
GO
-- dois campos ativos com o mesmo nome, não (a comparação sem acento fica no código; esta é a rede do banco)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CamposMissionarios_NomeAtivo' AND object_id = OBJECT_ID(N'dbo.CamposMissionarios'))
    CREATE UNIQUE INDEX UX_CamposMissionarios_NomeAtivo ON dbo.CamposMissionarios (Nome) WHERE Status = N'ATIVO';
GO

-- ---- o envio do missionário ----
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.EnviosMissionarios') AND type = N'U')
BEGIN
    CREATE TABLE dbo.EnviosMissionarios (
        EnvioId                 INT IDENTITY CONSTRAINT PK_EnviosMissionarios PRIMARY KEY,
        CampoId                 INT NOT NULL CONSTRAINT FK_EnviosMissionarios_Campo REFERENCES dbo.CamposMissionarios(CampoId),
        MembroId                INT NOT NULL CONSTRAINT FK_EnviosMissionarios_Membro REFERENCES dbo.MembroReferencia(MembroId),
        Status                  NVARCHAR(25) NOT NULL,
        -- as etapas que o caso exige, calculadas no pedido e guardadas (o campo e o sustento do pedido não mudam depois)
        PrecisaCME              BIT NOT NULL,
        PrecisaCLI              BIT NOT NULL,
        PrecisaPresidente       BIT NOT NULL,
        -- o sustento proposto no pedido; o vigente mora em EnvioSustentoValores
        SustentoMensal          DECIMAL(10,2) NOT NULL CONSTRAINT DF_EnviosMissionarios_Sustento DEFAULT 0,
        Fonte                   NVARCHAR(12) NULL,
        CongregacaoFonteId      INT NULL CONSTRAINT FK_EnviosMissionarios_CongregacaoFonte REFERENCES dbo.Congregacoes(CongregacaoId),
        FornecedorId            INT NULL CONSTRAINT FK_EnviosMissionarios_Fornecedor REFERENCES dbo.Fornecedores(FornecedorId),
        DocumentoUrl            NVARCHAR(500) NULL,
        Periodicidade           NVARCHAR(12) NOT NULL,
        DivulgarNome            BIT NOT NULL CONSTRAINT DF_EnviosMissionarios_Divulgar DEFAULT 0,
        Justificativa           NVARCHAR(2000) NOT NULL,
        SolicitadoPor           INT NOT NULL,
        SolicitadoEm            DATE NOT NULL,
        CriadoEm                DATETIME2 NOT NULL CONSTRAINT DF_EnviosMissionarios_Em DEFAULT SYSUTCDATETIME(),
        -- o parecer da CME (Regimento Art. 23, II, e 24 §2º)
        ParecerCME              NVARCHAR(10) NULL,
        ParecerFundamentacao    NVARCHAR(2000) NULL,
        ParecerPor              INT NULL,
        ParecerEm               DATE NULL,
        -- a decisão da CLI: a reunião, o resultado e, sem o parecer, o regime de urgência por 2/3
        DecisaoSessaoId         INT NULL CONSTRAINT FK_EnviosMissionarios_Sessao REFERENCES dbo.Sessoes(SessaoId),
        DecisaoEm               DATE NULL,
        DecisaoResultado        NVARCHAR(10) NULL,
        DecisaoUrgencia         BIT NOT NULL CONSTRAINT DF_EnviosMissionarios_Urgencia DEFAULT 0,
        DecisaoMotivo           NVARCHAR(1000) NULL,
        DecisaoRegistradaPor    INT NULL,
        DecisaoRegistradaEm     DATETIME2 NULL,
        -- a concordância do Pastor Presidente (Art. 44 §2º; Art. 134 §6º, I)
        PresidenteResultado     NVARCHAR(10) NULL,
        PresidenteMotivo        NVARCHAR(1000) NULL,
        PresidentePor           INT NULL,
        PresidenteEm            DATE NULL,
        -- a vida do envio: o mês em que o sustento e o relatório começam e o último mês de sustento
        AtivadoEm               DATE NULL,
        InicioMes               CHAR(7) NULL,
        EncerradoEm             DATE NULL,
        FimMes                  CHAR(7) NULL,
        EncerradoPor            INT NULL,
        MotivoEncerramento      NVARCHAR(1000) NULL,
        DesistidoEm             DATE NULL,
        DesistidoPor            INT NULL,
        DesistenciaMotivo       NVARCHAR(1000) NULL,
        CONSTRAINT CK_EnviosMissionarios_Status CHECK (Status IN (N'EM_PARECER', N'AGUARDANDO_CLI', N'AGUARDANDO_PRESIDENTE', N'ATIVO', N'ENCERRADO', N'REJEITADO', N'DESISTIDO')),
        CONSTRAINT CK_EnviosMissionarios_Periodicidade CHECK (Periodicidade IN (N'MENSAL', N'TRIMESTRAL')),
        CONSTRAINT CK_EnviosMissionarios_Fonte CHECK (Fonte IS NULL OR Fonte IN (N'GERAL', N'CONGREGACAO')),
        CONSTRAINT CK_EnviosMissionarios_Sustento CHECK (SustentoMensal >= 0
            AND (SustentoMensal = 0 OR (Fonte IS NOT NULL AND FornecedorId IS NOT NULL AND DocumentoUrl IS NOT NULL))
            AND (Fonte IS NULL OR Fonte = N'GERAL' OR CongregacaoFonteId IS NOT NULL)),
        CONSTRAINT CK_EnviosMissionarios_Parecer CHECK (ParecerCME IS NULL OR ParecerCME IN (N'FAVORAVEL', N'CONTRARIO')),
        CONSTRAINT CK_EnviosMissionarios_Decisao CHECK (DecisaoResultado IS NULL OR DecisaoResultado IN (N'APROVADO', N'REJEITADO')),
        CONSTRAINT CK_EnviosMissionarios_Presidente CHECK (PresidenteResultado IS NULL OR PresidenteResultado IN (N'CONCORDA', N'RECUSA')),
        -- ativo ou encerrado: com o mês de início; encerrado: com a data, o motivo e o último mês (que pode ser o anterior ao início: nenhum sustento)
        CONSTRAINT CK_EnviosMissionarios_Vida CHECK (
            (Status NOT IN (N'ATIVO', N'ENCERRADO') AND AtivadoEm IS NULL AND InicioMes IS NULL)
            OR (Status = N'ATIVO' AND AtivadoEm IS NOT NULL AND InicioMes IS NOT NULL AND EncerradoEm IS NULL AND FimMes IS NULL)
            OR (Status = N'ENCERRADO' AND AtivadoEm IS NOT NULL AND InicioMes IS NOT NULL AND EncerradoEm IS NOT NULL AND FimMes IS NOT NULL AND MotivoEncerramento IS NOT NULL))
    );
END
GO
-- um envio vivo (em andamento ou ativo) por pessoa
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_EnviosMissionarios_Vivo' AND object_id = OBJECT_ID(N'dbo.EnviosMissionarios'))
    CREATE UNIQUE INDEX UX_EnviosMissionarios_Vivo ON dbo.EnviosMissionarios (MembroId)
        WHERE Status IN (N'EM_PARECER', N'AGUARDANDO_CLI', N'AGUARDANDO_PRESIDENTE', N'ATIVO');
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_EnviosMissionarios_Campo' AND object_id = OBJECT_ID(N'dbo.EnviosMissionarios'))
    CREATE INDEX IX_EnviosMissionarios_Campo ON dbo.EnviosMissionarios (CampoId);
GO

-- ---- o sustento vigente e o histórico (a ativação e cada reajuste) ----
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.EnvioSustentoValores') AND type = N'U')
BEGIN
    CREATE TABLE dbo.EnvioSustentoValores (
        ValorId            INT IDENTITY CONSTRAINT PK_EnvioSustentoValores PRIMARY KEY,
        EnvioId            INT NOT NULL CONSTRAINT FK_EnvioSustentoValores_Envio REFERENCES dbo.EnviosMissionarios(EnvioId),
        DesdeMes           CHAR(7) NOT NULL,
        Valor              DECIMAL(10,2) NOT NULL,
        Fonte              NVARCHAR(12) NULL,
        CongregacaoFonteId INT NULL CONSTRAINT FK_EnvioSustentoValores_CongregacaoFonte REFERENCES dbo.Congregacoes(CongregacaoId),
        FornecedorId       INT NULL CONSTRAINT FK_EnvioSustentoValores_Fornecedor REFERENCES dbo.Fornecedores(FornecedorId),
        Motivo             NVARCHAR(1000) NULL,
        RegistradoPor      INT NOT NULL,
        RegistradoEm       DATETIME2 NOT NULL CONSTRAINT DF_EnvioSustentoValores_Em DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_EnvioSustentoValores_Mes UNIQUE (EnvioId, DesdeMes),
        CONSTRAINT CK_EnvioSustentoValores_Valor CHECK (Valor >= 0
            AND (Valor = 0 OR (Fonte IS NOT NULL AND FornecedorId IS NOT NULL))
            AND (Fonte IS NULL OR Fonte IN (N'GERAL', N'CONGREGACAO'))
            AND (Fonte IS NULL OR Fonte = N'GERAL' OR CongregacaoFonteId IS NOT NULL))
    );
END
GO

-- ---- o relatório de campo de cada período ----
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.RelatoriosCampo') AND type = N'U')
BEGIN
    CREATE TABLE dbo.RelatoriosCampo (
        RelatorioId    INT IDENTITY CONSTRAINT PK_RelatoriosCampo PRIMARY KEY,
        EnvioId        INT NOT NULL CONSTRAINT FK_RelatoriosCampo_Envio REFERENCES dbo.EnviosMissionarios(EnvioId),
        PeriodoInicio  CHAR(7) NOT NULL,
        Batismos       INT NOT NULL,
        Conversoes     INT NOT NULL,
        Discipulado    INT NOT NULL,
        Atividades     NVARCHAR(4000) NOT NULL,
        Pedidos        NVARCHAR(2000) NULL,
        AnexoUrl       NVARCHAR(500) NULL,
        RecebidoEm     DATE NOT NULL,
        RegistradoPor  INT NOT NULL,
        RegistradoEm   DATETIME2 NOT NULL CONSTRAINT DF_RelatoriosCampo_Em DEFAULT SYSUTCDATETIME(),
        RetificadoPor  INT NULL,
        RetificadoEm   DATETIME2 NULL,
        CONSTRAINT UQ_RelatoriosCampo_Periodo UNIQUE (EnvioId, PeriodoInicio),
        CONSTRAINT CK_RelatoriosCampo_Numeros CHECK (Batismos >= 0 AND Conversoes >= 0 AND Discipulado >= 0)
    );
END
GO

-- ---- a Saída gerada para cada envio e mês ----
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.SustentoGeracoes') AND type = N'U')
BEGIN
    CREATE TABLE dbo.SustentoGeracoes (
        GeracaoId      INT IDENTITY CONSTRAINT PK_SustentoGeracoes PRIMARY KEY,
        EnvioId        INT NOT NULL CONSTRAINT FK_SustentoGeracoes_Envio REFERENCES dbo.EnviosMissionarios(EnvioId),
        MesReferencia  CHAR(7) NOT NULL,
        Valor          DECIMAL(10,2) NOT NULL,
        SaidaId        INT NOT NULL CONSTRAINT FK_SustentoGeracoes_Saida REFERENCES dbo.SaidasTesouraria(SaidaId),
        GeradaPor      INT NOT NULL,
        GeradaEm       DATETIME2 NOT NULL CONSTRAINT DF_SustentoGeracoes_Em DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_SustentoGeracoes_Mes UNIQUE (EnvioId, MesReferencia),
        CONSTRAINT CK_SustentoGeracoes_Valor CHECK (Valor > 0)
    );
END
GO

-- ---- as categorias de Saída do sustento (Contas a Pagar, v4.5) ----
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '5.1.5')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '5.1.5', N'Missões e Sustento Missionário', 'DESPESA', ContaId FROM dbo.PlanoContas WHERE Codigo = '5.1';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.CategoriasSaida WHERE Codigo = 'SUSTENTO_MISSIONARIO')
    INSERT INTO dbo.CategoriasSaida (Codigo, Nome, CentroCusto, TipoFundo, ContaContabilId)
    SELECT 'SUSTENTO_MISSIONARIO', N'Sustento missionário (Tesouro Geral)', 'GERAL', 'LIVRE', ContaId FROM dbo.PlanoContas WHERE Codigo = '5.1.5';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.CategoriasSaida WHERE Codigo = 'SUSTENTO_MISSIONARIO_LOCAL')
    INSERT INTO dbo.CategoriasSaida (Codigo, Nome, CentroCusto, TipoFundo, ContaContabilId)
    SELECT 'SUSTENTO_MISSIONARIO_LOCAL', N'Sustento missionário (caixa local da congregação mantenedora)', 'LOCAL', 'LIVRE', ContaId FROM dbo.PlanoContas WHERE Codigo = '5.1.5';
GO

-- ---- a permissão "missoes" ----
-- UMA vez (quando a funcionalidade ainda não existe): vai ao Presidente, ao Secretário Geral, ao Tesoureiro (o nível geral que gera o sustento), ao Secretário de
-- Missões (a SEMIADESPA) e ao Pastor de Área (a CME dá o parecer sobre o envio). Nos deploys seguintes nada se repete: se a administração tirar "missoes" de um
-- papel em Permissões, o deploy não a devolve.
IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'missoes')
BEGIN
    UPDATE dbo.Papeis
    SET Permissoes = CASE WHEN ISNULL(Permissoes, '') = '' THEN 'missoes' ELSE Permissoes + ',missoes' END
    WHERE Nome IN (N'Presidente', N'Secretário Geral', N'Tesoureiro', N'Secretário de Missões', N'Pastor de Área')
      AND (',' + ISNULL(Permissoes, '') + ',') NOT LIKE '%,missoes,%';
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('missoes', N'Missões — campos, envio de missionários, sustento e relatórios de campo');
END
GO

-- ---- avisos ----
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'MISSOES_ENVIO_NOVO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'MISSOES_ENVIO_NOVO', N'Novo pedido de envio de missionário para o parecer da CME', N'MISSOES', N'missoes', N'GLOBAL', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'MISSOES_PARECER_VENCIDO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'MISSOES_PARECER_VENCIDO', N'Parecer da CME vencido (15 dias) em envio de missionário', N'MISSOES', N'missoes', N'GLOBAL', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'MISSOES_AGUARDANDO_PRESIDENTE')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'MISSOES_AGUARDANDO_PRESIDENTE', N'Envio de missionário aguardando a concordância do Pastor Presidente', N'MISSOES', NULL, NULL, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'MISSOES_ENVIO_DECIDIDO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'MISSOES_ENVIO_DECIDIDO', N'O pedido de envio de missionário foi decidido', N'MISSOES', NULL, NULL, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'MISSOES_RELATORIO_ATRASADO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'MISSOES_RELATORIO_ATRASADO', N'Relatório de campo vencido: o sustento do missionário fica suspenso', N'MISSOES', N'missoes', N'GLOBAL', 1);
GO

-- ---- retenção: a obra missionária é história da instituição e prestação de contas à Assembleia ----
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Missões: campos, envios, sustento e relatórios de campo')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (N'Missões: campos, envios, sustento e relatórios de campo', N'x', NULL);
GO
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Campos, envios de missionários (pedido, parecer da CME, decisão da CLI, concordância do Presidente), sustento e relatórios de campo (Reg. Art. 23, 44 e 134 §6º, I): história da obra missionária e prestação de contas à Assembleia, sem prazo final.'
WHERE Categoria = N'Missões: campos, envios, sustento e relatórios de campo' AND BaseLegal = N'x';
GO
