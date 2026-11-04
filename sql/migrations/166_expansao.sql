-- ============================================================
-- Migração 166 — v9.2: Expansão (Extensões da Tenda, emancipação e nova congregação). Desenho em docs/plano/fase-9-entidades-vinculadas.md.
--
-- Base legal: Estatuto Art. 5º §§2º, 3º e 5º e Art. 50; Regimento Art. 23 (CME), Art. 24 §2º, Art. 43 e 44 (SEMIADESPA), Art. 104-B, I, Art. 106, III, e Art. 109-A.
--
--   PedidosExpansao: o pedido (abertura de Extensão, emancipação de Extensão ou nova congregação), o parecer da CME (15 dias) e a decisão da CLI. Aprovado, o
--                    sistema executa na mesma gravação e guarda aqui a unidade que nasceu.
--   ExtensaoEncarregados: o Encarregado de cada Extensão (Art. 109-A, I) — um em aberto por vez, com o histórico das trocas.
--   ExtensoesTenda ganha o endereço, a data de abertura e a marca da emancipação (a Extensão emancipada fica inativa, apontando para a congregação que nasceu).
--   Papel novo "Secretário de Missões" (nível Departamento, como o Líder Geral: entra na CLI pelo mesmo caminho) e a permissão "expansao".
--
-- Idempotente: seguro para reexecutar sem apagar dados. Cada ALTER em batch próprio (GO).
-- ============================================================

-- ---- ExtensoesTenda: endereço, abertura e emancipação ----
IF COL_LENGTH('dbo.ExtensoesTenda', 'Endereco') IS NULL
    ALTER TABLE dbo.ExtensoesTenda ADD Endereco NVARCHAR(300) NULL;
GO
IF COL_LENGTH('dbo.ExtensoesTenda', 'Bairro') IS NULL
    ALTER TABLE dbo.ExtensoesTenda ADD Bairro NVARCHAR(150) NULL;
GO
IF COL_LENGTH('dbo.ExtensoesTenda', 'Cidade') IS NULL
    ALTER TABLE dbo.ExtensoesTenda ADD Cidade NVARCHAR(150) NULL;
GO
IF COL_LENGTH('dbo.ExtensoesTenda', 'UF') IS NULL
    ALTER TABLE dbo.ExtensoesTenda ADD UF NVARCHAR(2) NULL;
GO
IF COL_LENGTH('dbo.ExtensoesTenda', 'AbertaEm') IS NULL
    ALTER TABLE dbo.ExtensoesTenda ADD AbertaEm DATE NULL;
GO
IF COL_LENGTH('dbo.ExtensoesTenda', 'EmancipadaEm') IS NULL
    ALTER TABLE dbo.ExtensoesTenda ADD EmancipadaEm DATE NULL;
GO
IF COL_LENGTH('dbo.ExtensoesTenda', 'CongregacaoEmancipadaId') IS NULL
    ALTER TABLE dbo.ExtensoesTenda ADD CongregacaoEmancipadaId INT NULL
        CONSTRAINT FK_ExtensoesTenda_Emancipada REFERENCES dbo.Congregacoes(CongregacaoId);
GO
-- emancipada = inativa, com a data e a congregação que nasceu (as três juntas)
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_ExtensoesTenda_Emancipada')
    ALTER TABLE dbo.ExtensoesTenda ADD CONSTRAINT CK_ExtensoesTenda_Emancipada CHECK (
        (EmancipadaEm IS NULL AND CongregacaoEmancipadaId IS NULL)
        OR (EmancipadaEm IS NOT NULL AND CongregacaoEmancipadaId IS NOT NULL AND Ativa = 0));
GO

-- ---- o Encarregado de cada Extensão (Regimento Art. 109-A, I) ----
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.ExtensaoEncarregados') AND type = N'U')
BEGIN
    CREATE TABLE dbo.ExtensaoEncarregados (
        EncarregadoId   INT IDENTITY CONSTRAINT PK_ExtensaoEncarregados PRIMARY KEY,
        ExtensaoId      INT NOT NULL CONSTRAINT FK_ExtensaoEncarregados_Extensao REFERENCES dbo.ExtensoesTenda(ExtensaoId),
        MembroId        INT NOT NULL CONSTRAINT FK_ExtensaoEncarregados_Membro REFERENCES dbo.MembroReferencia(MembroId),
        Desde           DATE NOT NULL,
        Ate             DATE NULL,
        MotivoSaida     NVARCHAR(1000) NULL,
        RegistradoPor   INT NULL,
        RegistradoEm    DATETIME2 NOT NULL CONSTRAINT DF_ExtensaoEncarregados_Em DEFAULT SYSUTCDATETIME(),
        EncerradoPor    INT NULL,
        CONSTRAINT CK_ExtensaoEncarregados_Datas CHECK (Ate IS NULL OR Ate >= Desde),
        CONSTRAINT CK_ExtensaoEncarregados_Saida CHECK ((Ate IS NULL AND MotivoSaida IS NULL) OR (Ate IS NOT NULL AND MotivoSaida IS NOT NULL))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ExtensaoEncarregados_Aberto' AND object_id = OBJECT_ID(N'dbo.ExtensaoEncarregados'))
    CREATE UNIQUE INDEX UX_ExtensaoEncarregados_Aberto ON dbo.ExtensaoEncarregados (ExtensaoId) WHERE Ate IS NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ExtensaoEncarregados_Membro' AND object_id = OBJECT_ID(N'dbo.ExtensaoEncarregados'))
    CREATE INDEX IX_ExtensaoEncarregados_Membro ON dbo.ExtensaoEncarregados (MembroId);
GO

-- ---- o pedido de expansão ----
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.PedidosExpansao') AND type = N'U')
BEGIN
    CREATE TABLE dbo.PedidosExpansao (
        PedidoId                INT IDENTITY CONSTRAINT PK_PedidosExpansao PRIMARY KEY,
        Tipo                    NVARCHAR(20) NOT NULL,
        Status                  NVARCHAR(20) NOT NULL,
        Nome                    NVARCHAR(150) NOT NULL,
        Endereco                NVARCHAR(300) NULL,
        Bairro                  NVARCHAR(150) NULL,
        Cidade                  NVARCHAR(150) NULL,
        UF                      NVARCHAR(2) NULL,
        Justificativa           NVARCHAR(2000) NOT NULL,
        CongregacaoMaeId        INT NULL CONSTRAINT FK_PedidosExpansao_Mae REFERENCES dbo.Congregacoes(CongregacaoId),
        ExtensaoId              INT NULL CONSTRAINT FK_PedidosExpansao_Extensao REFERENCES dbo.ExtensoesTenda(ExtensaoId),
        AreaId                  INT NULL CONSTRAINT FK_PedidosExpansao_Area REFERENCES dbo.Areas(AreaId),
        EncarregadoMembroId     INT NULL CONSTRAINT FK_PedidosExpansao_Encarregado REFERENCES dbo.MembroReferencia(MembroId),
        SolicitadoPor           INT NOT NULL,
        SolicitadoEm            DATE NOT NULL,
        CriadoEm                DATETIME2 NOT NULL CONSTRAINT DF_PedidosExpansao_Em DEFAULT SYSUTCDATETIME(),
        -- o parecer da CME (Regimento Art. 23 e 24 §2º)
        ParecerCME              NVARCHAR(10) NULL,
        ParecerFundamentacao    NVARCHAR(2000) NULL,
        ParecerPor              INT NULL,
        ParecerEm               DATE NULL,
        -- a decisão da CLI (Estatuto Art. 5º §5º): a reunião, o resultado e, sem o parecer, o regime de urgência por 2/3
        DecisaoSessaoId         INT NULL CONSTRAINT FK_PedidosExpansao_Sessao REFERENCES dbo.Sessoes(SessaoId),
        DecisaoEm               DATE NULL,
        DecisaoResultado        NVARCHAR(10) NULL,
        DecisaoUrgencia         BIT NOT NULL CONSTRAINT DF_PedidosExpansao_Urgencia DEFAULT 0,
        DecisaoMotivo           NVARCHAR(1000) NULL,
        DecisaoRegistradaPor    INT NULL,
        DecisaoRegistradaEm     DATETIME2 NULL,
        -- o que nasceu da aprovação
        ExtensaoCriadaId        INT NULL CONSTRAINT FK_PedidosExpansao_ExtCriada REFERENCES dbo.ExtensoesTenda(ExtensaoId),
        CongregacaoCriadaId     INT NULL CONSTRAINT FK_PedidosExpansao_CongCriada REFERENCES dbo.Congregacoes(CongregacaoId),
        MembrosTransferidos     INT NULL,
        -- a desistência antes da decisão
        DesistidoEm             DATE NULL,
        DesistidoPor            INT NULL,
        DesistenciaMotivo       NVARCHAR(1000) NULL,
        CONSTRAINT CK_PedidosExpansao_Tipo CHECK (Tipo IN (N'ABERTURA_EXTENSAO', N'EMANCIPACAO', N'NOVA_CONGREGACAO')),
        CONSTRAINT CK_PedidosExpansao_Status CHECK (Status IN (N'EM_PARECER', N'AGUARDANDO_CLI', N'APROVADO', N'REJEITADO', N'DESISTIDO')),
        CONSTRAINT CK_PedidosExpansao_UF CHECK (UF IS NULL OR LEN(UF) = 2),
        -- o que cada tipo exige: a Extensão nasce de uma Mãe com o Encarregado; a emancipação parte de uma Extensão (e guarda a Mãe, para o escopo); a nova
        -- congregação não tem Mãe nem Extensão
        CONSTRAINT CK_PedidosExpansao_Campos CHECK (
            (Tipo = N'ABERTURA_EXTENSAO' AND CongregacaoMaeId IS NOT NULL AND EncarregadoMembroId IS NOT NULL AND ExtensaoId IS NULL AND AreaId IS NULL)
            OR (Tipo = N'EMANCIPACAO' AND CongregacaoMaeId IS NOT NULL AND ExtensaoId IS NOT NULL AND EncarregadoMembroId IS NULL)
            OR (Tipo = N'NOVA_CONGREGACAO' AND CongregacaoMaeId IS NULL AND ExtensaoId IS NULL AND EncarregadoMembroId IS NULL)),
        -- o parecer: inteiro ou ausente, nunca na abertura de Extensão, nunca antes do pedido
        CONSTRAINT CK_PedidosExpansao_Parecer CHECK (
            (ParecerCME IS NULL AND ParecerFundamentacao IS NULL AND ParecerPor IS NULL AND ParecerEm IS NULL)
            OR (ParecerCME IN (N'FAVORAVEL', N'CONTRARIO') AND ParecerFundamentacao IS NOT NULL AND ParecerPor IS NOT NULL AND ParecerEm IS NOT NULL
                AND ParecerEm >= SolicitadoEm AND Tipo <> N'ABERTURA_EXTENSAO')),
        -- a decisão: inteira ou ausente; depois do pedido e do parecer; a urgência só sem parecer
        CONSTRAINT CK_PedidosExpansao_Decisao CHECK (
            (DecisaoSessaoId IS NULL AND DecisaoEm IS NULL AND DecisaoResultado IS NULL AND DecisaoUrgencia = 0 AND DecisaoMotivo IS NULL)
            OR (DecisaoSessaoId IS NOT NULL AND DecisaoEm IS NOT NULL AND DecisaoResultado IN (N'APROVADO', N'REJEITADO') AND DecisaoEm >= SolicitadoEm
                AND (ParecerEm IS NULL OR DecisaoEm >= ParecerEm)
                AND (DecisaoUrgencia = 0 OR (ParecerCME IS NULL AND Tipo <> N'ABERTURA_EXTENSAO'))
                AND (DecisaoResultado = N'APROVADO' OR DecisaoMotivo IS NOT NULL))),
        -- cada situação com o que lhe corresponde
        CONSTRAINT CK_PedidosExpansao_Situacao CHECK (
            (Status = N'EM_PARECER' AND Tipo <> N'ABERTURA_EXTENSAO' AND ParecerCME IS NULL AND DecisaoResultado IS NULL AND DesistidoEm IS NULL)
            OR (Status = N'AGUARDANDO_CLI' AND (Tipo = N'ABERTURA_EXTENSAO' OR ParecerCME IS NOT NULL) AND DecisaoResultado IS NULL AND DesistidoEm IS NULL)
            OR (Status = N'APROVADO' AND DecisaoResultado = N'APROVADO' AND DesistidoEm IS NULL
                AND ((Tipo = N'ABERTURA_EXTENSAO' AND ExtensaoCriadaId IS NOT NULL AND CongregacaoCriadaId IS NULL)
                  OR (Tipo <> N'ABERTURA_EXTENSAO' AND CongregacaoCriadaId IS NOT NULL AND ExtensaoCriadaId IS NULL)))
            OR (Status = N'REJEITADO' AND DecisaoResultado = N'REJEITADO' AND DesistidoEm IS NULL AND ExtensaoCriadaId IS NULL AND CongregacaoCriadaId IS NULL)
            OR (Status = N'DESISTIDO' AND DesistidoEm IS NOT NULL AND DesistenciaMotivo IS NOT NULL AND DecisaoResultado IS NULL
                AND ExtensaoCriadaId IS NULL AND CongregacaoCriadaId IS NULL))
    );
END
GO
-- uma Extensão só tem um pedido de emancipação em andamento
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_PedidosExpansao_ExtensaoEmAndamento' AND object_id = OBJECT_ID(N'dbo.PedidosExpansao'))
    CREATE UNIQUE INDEX UX_PedidosExpansao_ExtensaoEmAndamento ON dbo.PedidosExpansao (ExtensaoId)
        WHERE ExtensaoId IS NOT NULL AND Status IN (N'EM_PARECER', N'AGUARDANDO_CLI');
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PedidosExpansao_Status' AND object_id = OBJECT_ID(N'dbo.PedidosExpansao'))
    CREATE INDEX IX_PedidosExpansao_Status ON dbo.PedidosExpansao (Status, Tipo);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PedidosExpansao_Mae' AND object_id = OBJECT_ID(N'dbo.PedidosExpansao'))
    CREATE INDEX IX_PedidosExpansao_Mae ON dbo.PedidosExpansao (CongregacaoMaeId);
GO

-- ---- permissão e o papel "Secretário de Missões" (Regimento Art. 23, I, e Art. 43-44) ----
IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'expansao')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('expansao', N'Expansão — Extensões da Tenda, emancipação e nova congregação');
GO
-- O papel nasce com as permissões do Líder Geral de Departamento/Secretaria de hoje mais a de expansão (nível Departamento: assento na CLI pelo mesmo caminho).
IF NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = N'Secretário de Missões')
    INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes)
    SELECT N'Secretário de Missões', 'DEPARTAMENTO',
           CASE WHEN ISNULL(MAX(Permissoes), '') = '' THEN 'reunioes,pessoas,expansao' ELSE MAX(Permissoes) + ',expansao' END
    FROM dbo.Papeis WHERE Nome = N'Líder Geral de Departamento/Secretaria';
GO
UPDATE dbo.Papeis
SET Permissoes = CASE WHEN ISNULL(Permissoes, '') = '' THEN 'expansao' ELSE Permissoes + ',expansao' END
WHERE Nome IN (N'Presidente', N'Secretário Geral', N'Dirigente de Congregação', N'Pastor de Área', N'Secretário de Missões')
  AND (',' + ISNULL(Permissoes, '') + ',') NOT LIKE '%,expansao,%';
GO

-- ---- avisos ----
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'EXPANSAO_PEDIDO_NOVO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'EXPANSAO_PEDIDO_NOVO', N'Novo pedido de expansão (Extensão, emancipação ou nova congregação)', N'EXPANSAO', N'expansao', N'GLOBAL', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'EXPANSAO_PARECER_VENCIDO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'EXPANSAO_PARECER_VENCIDO', N'Parecer da CME vencido (15 dias) em pedido de expansão', N'EXPANSAO', N'expansao', N'GLOBAL', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'EXPANSAO_DECIDIDO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'EXPANSAO_DECIDIDO', N'A CLI decidiu o seu pedido de expansão', N'EXPANSAO', NULL, NULL, 1);
GO

-- ---- retenção: a abertura e a emancipação são a certidão de nascimento da unidade ----
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Expansão: abertura e emancipação')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (N'Expansão: abertura e emancipação', N'x', 1825);
GO
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Pedidos de abertura de Extensão da Tenda, emancipação e nova congregação, com o parecer da CME e a decisão da CLI (Estatuto Art. 5º §5º; Reg. Art. 23, 24 e 109-A): a certidão de nascimento da unidade, guardada sem prazo final. Do Encarregado, só a matrícula e as datas.'
WHERE Categoria = N'Expansão: abertura e emancipação' AND BaseLegal = N'x';
GO
