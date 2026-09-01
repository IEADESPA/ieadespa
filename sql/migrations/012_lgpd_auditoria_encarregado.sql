-- ============================================================
-- Migração 012 — v0.3: Auditoria e trilha de dados
--
-- Fecha a FASE 0 (Fundamentos): permissão + papel de Encarregado de Dados,
-- consentimento LGPD (trilha append-only por tipo de dado), solicitações do
-- titular (acesso/exclusão/retificação/portabilidade — Art. 18 LGPD) e o
-- catálogo informativo de Políticas de Retenção (mesmo espírito do catálogo
-- `Prazos` da v0.1: valor de referência, não um job automático de expurgo).
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

-- Nova chave de permissão: Encarregado de Dados (DPO) — vê e responde
-- solicitações do titular, sem precisar da permissão ampla "pessoas".
INSERT INTO dbo.Funcionalidades (Chave, Nome)
SELECT 'protecaodedados', 'Proteção de Dados (LGPD)'
WHERE NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'protecaodedados');
GO

-- Papel pronto para atribuir a alguém: Auditoria (trilha) + Proteção de Dados
-- (consentimentos, solicitações do titular, retenção).
INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes)
SELECT 'Encarregado de Dados', 'GLOBAL', 'auditoria,protecaodedados'
WHERE NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = 'Encarregado de Dados');
GO

-- ------------------------------------------------------------
-- Consentimento LGPD — trilha append-only (cada linha é um evento; o estado
-- atual de um Tipo para um membro é a linha mais recente). Hoje só existe
-- coleta de "dados de contato" (Telefone/Email/Endereço, v0.2); o campo Tipo
-- é livre para os dados sensíveis da v1.7 (saúde/menores) usarem a mesma trilha.
-- ------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.ConsentimentosLGPD') AND type = N'U')
BEGIN
    CREATE TABLE dbo.ConsentimentosLGPD (
        ConsentimentoId INT IDENTITY PRIMARY KEY,
        MembroId        INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Tipo            NVARCHAR(40) NOT NULL DEFAULT 'DADOS_CONTATO',
        Concedido       BIT NOT NULL,
        BaseLegal       NVARCHAR(40) NOT NULL DEFAULT 'CONSENTIMENTO', -- CONSENTIMENTO / OBRIGACAO_LEGAL / LEGITIMO_INTERESSE / EXECUCAO_ESTATUTO
        Observacao      NVARCHAR(300) NULL,
        RegistradoPor   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DataRegistro    DATETIME2 DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ConsentimentosLGPD') AND name = N'IX_ConsentimentosLGPD_Membro')
    CREATE INDEX IX_ConsentimentosLGPD_Membro ON dbo.ConsentimentosLGPD(MembroId, Tipo, DataRegistro DESC);
GO

-- ------------------------------------------------------------
-- Solicitações do titular (Art. 18 LGPD): acesso, exclusão, retificação,
-- portabilidade. Fica pendente até o Encarregado de Dados responder.
-- ------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.SolicitacoesTitularLGPD') AND type = N'U')
BEGIN
    CREATE TABLE dbo.SolicitacoesTitularLGPD (
        SolicitacaoId   INT IDENTITY PRIMARY KEY,
        MembroId        INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Tipo            NVARCHAR(30) NOT NULL,     -- ACESSO / EXCLUSAO / RETIFICACAO / PORTABILIDADE
        Descricao       NVARCHAR(500) NULL,
        Status          NVARCHAR(20) NOT NULL DEFAULT 'PENDENTE', -- PENDENTE / EM_ANALISE / ATENDIDA / NEGADA
        DataSolicitacao DATETIME2 DEFAULT SYSUTCDATETIME(),
        DataResposta    DATETIME2 NULL,
        RespostaTexto   NVARCHAR(500) NULL,
        AtendidoPor     INT NULL REFERENCES dbo.MembroReferencia(MembroId)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.SolicitacoesTitularLGPD') AND name = N'IX_SolicitacoesTitularLGPD_Membro')
    CREATE INDEX IX_SolicitacoesTitularLGPD_Membro ON dbo.SolicitacoesTitularLGPD(MembroId, DataSolicitacao DESC);
GO

-- ------------------------------------------------------------
-- Políticas de Retenção — catálogo informativo (mesmo espírito de `Prazos`):
-- não roda expurgo automático, é a referência que o Encarregado de Dados usa
-- ao responder uma solicitação de exclusão (ver ExecutarExclusaoLGPD).
-- ------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.PoliticasRetencao') AND type = N'U')
BEGIN
    CREATE TABLE dbo.PoliticasRetencao (
        PoliticaId   INT IDENTITY PRIMARY KEY,
        Categoria    NVARCHAR(60) NOT NULL,
        BaseLegal    NVARCHAR(300) NOT NULL,
        DiasRetencao INT NULL,     -- NULL = indeterminado (ver BaseLegal)
        Ativo        BIT NOT NULL DEFAULT 1
    );
END
GO

INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
SELECT v.Categoria, v.BaseLegal, v.DiasRetencao FROM (VALUES
    ('Dados Cadastrais Básicos',   'LGPD Art. 16, I — cumprimento de obrigação legal/regulatória do Estatuto; mantidos enquanto durar o vínculo de membresia.', NULL),
    ('Dados de Contato (Telefone/E-mail/Endereço)', 'LGPD Art. 7º, I (consentimento) — pode ser retirado a qualquer momento pelo titular (ver Consentimento LGPD).', NULL),
    ('Processo Disciplinar',       'LGPD Art. 16, II — exercício regular de direitos (histórico disciplinar/reincidência, Regimento Art. 77); retenção indeterminada.', NULL),
    ('Trilha de Auditoria (AuditLog)', 'LGPD Art. 16, I — cumprimento de obrigação legal (prestação de contas/governança); trilha imutável, retenção indeterminada.', NULL),
    ('Atas e Registros de Sessão/Presença', 'LGPD Art. 16, I — obrigação legal (registro histórico de deliberações e quórum); retenção indeterminada.', NULL)
) AS v(Categoria, BaseLegal, DiasRetencao)
WHERE NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao p WHERE p.Categoria = v.Categoria);
GO
