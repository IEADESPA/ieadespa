-- ============================================================
-- Migração 062 — v4.12: Auditoria, Compliance e Indicadores (nível pico).
-- COSO Internal Control Framework (5 componentes) formalizado no sistema:
--   - Trilha de Auditoria Inviolável (hash SHA-256 em cadeia + ancoragem externa)
--   - Monitoramento Contínuo de Controles (CCM — alertas em tempo real)
--   - Revisão Periódica de Acessos (Access Recertification)
--   - Princípio dos Quatro Olhos (dual control)
--   - NIF (Núcleo de Inteligência Financeira) + COS (COAF/PLD-FT)
--   - Auditoria em 3 níveis + Parecer mensal do Conselho Fiscal
--   - Prestação de Contas (bloqueio de repasse + prazo fatal + Ata de Pendência)
-- ============================================================

-- 1) Hash em cadeia na trilha de auditoria (imutabilidade) + alargar Acao
--    (o código já gravava acoes longas, que eram truncadas silenciosamente).
IF COL_LENGTH(N'dbo.AuditLog', N'HashRegistro') IS NULL
    ALTER TABLE dbo.AuditLog ADD HashRegistro NVARCHAR(64) NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.AuditLog') AND name = 'Acao')
    ALTER TABLE dbo.AuditLog ALTER COLUMN Acao NVARCHAR(100) NOT NULL;
GO

-- 2) Ancoragem externa do hash mais recente (RFC 3161 / registro público).
IF OBJECT_ID(N'dbo.AuditoriaAncoragens', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuditoriaAncoragens (
        AncoragemId    INT IDENTITY PRIMARY KEY,
        HashAncorado   NVARCHAR(64) NOT NULL,
        Metodo         NVARCHAR(30) NOT NULL, -- RFC3161 | REGISTRO_PUBLICO
        ComprovanteUrl NVARCHAR(500) NULL,
        AncoradoPor    INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 3) Parâmetros de compliance (nunca hardcoded).
IF OBJECT_ID(N'dbo.ParametrosCompliance', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ParametrosCompliance (
        ParametroId                     INT NOT NULL PRIMARY KEY CHECK (ParametroId = 1),
        ValorCriticoQuatroOlhos         DECIMAL(12,2) NOT NULL DEFAULT 10000.00,
        PeriodicidadeRecertificacaoMeses INT NOT NULL DEFAULT 3
    );
    INSERT INTO dbo.ParametrosCompliance (ParametroId, ValorCriticoQuatroOlhos, PeriodicidadeRecertificacaoMeses) VALUES (1, 10000.00, 3);
END
GO

-- 4) Alertas de Monitoramento Contínuo de Controles (CCM).
IF OBJECT_ID(N'dbo.AlertasCompliance', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AlertasCompliance (
        AlertaId         INT IDENTITY PRIMARY KEY,
        Tipo             NVARCHAR(30) NOT NULL, -- PAGAMENTO_ATIPICO | DADO_BANCARIO_ALTERADO | FRACIONAMENTO | FORNECEDOR_SEM_HISTORICO | ACESSO_VENCIDO
        Severidade       NVARCHAR(20) NOT NULL DEFAULT 'MEDIA', -- BAIXA | MEDIA | ALTA
        Descricao        NVARCHAR(500) NOT NULL,
        TabelaOrigem     NVARCHAR(50) NULL,
        RegistroOrigemId INT NULL,
        Status           NVARCHAR(20) NOT NULL DEFAULT 'ATIVO', -- ATIVO | RESOLVIDO
        CriadoEm         DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        ResolvidoPor     INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ResolvidoEm      DATETIME2 NULL
    );
END
GO

-- 5) Revisão Periódica de Acessos (Access Recertification).
IF OBJECT_ID(N'dbo.RecertificacoesAcesso', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RecertificacoesAcesso (
        RecertificacaoId INT IDENTITY PRIMARY KEY,
        MembroId         INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        PapelId          INT NOT NULL REFERENCES dbo.Papeis(PapelId),
        Permissao        NVARCHAR(50) NOT NULL,
        Status           NVARCHAR(20) NOT NULL DEFAULT 'PENDENTE', -- PENDENTE | CONFIRMADA | EXPIRADA
        Prazo            DATE NOT NULL,
        RecertificadoPor INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RecertificadoEm  DATETIME2 NULL,
        CriadoEm         DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 6) NIF — sinalizações de risco (Avaliação de Riscos do COSO).
IF OBJECT_ID(N'dbo.NifSinalizacoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.NifSinalizacoes (
        SinalizacaoId   INT IDENTITY PRIMARY KEY,
        Tipo            NVARCHAR(30) NOT NULL, -- VALOR_ATIPICO | FRACIONAMENTO | FORNECEDOR_SEM_HISTORICO
        Descricao       NVARCHAR(500) NOT NULL,
        SaidaId         INT NULL REFERENCES dbo.SaidasTesouraria(SaidaId),
        FornecedorId    INT NULL REFERENCES dbo.Fornecedores(FornecedorId),
        Status          NVARCHAR(20) NOT NULL DEFAULT 'PENDENTE', -- PENDENTE | CONFIRMADA | DESCARTADA
        RegistradoPor   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        DecididoPor     INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DecididoEm      DATETIME2 NULL
    );
END
GO


-- 7) Comunicação de Operações Suspeitas (COS/COAF — Lei 9.613/1998, prazo 24h).
IF OBJECT_ID(N'dbo.ComunicacoesCoaf', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ComunicacoesCoaf (
        ComunicacaoId   INT IDENTITY PRIMARY KEY,
        SinalizacaoId   INT NOT NULL REFERENCES dbo.NifSinalizacoes(SinalizacaoId),
        Protocolo       NVARCHAR(50) NULL,
        DataComunicacao DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        DentroPrazo24h  BIT NOT NULL DEFAULT 1,
        Observacao      NVARCHAR(500) NULL,
        ComunicadoPor   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 8) Auditoria em 3 níveis (interna, NIF, externa).
IF OBJECT_ID(N'dbo.AuditoriasNiveis', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuditoriasNiveis (
        AuditoriaId     INT IDENTITY PRIMARY KEY,
        Nivel           NVARCHAR(20) NOT NULL, -- INTERNA | NIF | EXTERNA
        Titulo          NVARCHAR(200) NOT NULL,
        AnoReferencia   INT NOT NULL,
        Conclusao       NVARCHAR(500) NULL,
        DocumentoUrl    NVARCHAR(500) NULL,
        Status          NVARCHAR(20) NOT NULL DEFAULT 'PLANEJADA', -- PLANEJADA | EM_ANDAMENTO | CONCLUIDA
        RegistradoPor   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 9) Parecer mensal do Conselho Fiscal (aprova/rejeita contas).
IF OBJECT_ID(N'dbo.PareceresConselhoFiscal', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PareceresConselhoFiscal (
        ParecerId       INT IDENTITY PRIMARY KEY,
        MesReferencia   CHAR(7) NOT NULL,
        Decisao         NVARCHAR(20) NOT NULL, -- APROVADO | REJEITADO
        Justificativa   NVARCHAR(500) NULL,
        DocumentoUrl    NVARCHAR(500) NULL,
        ParecerPor      INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_Parecer_Mes UNIQUE (MesReferencia)
    );
END
GO

-- 10) Prestação de contas mensal (Reg. Art. 120) — comprovantes de água/luz,
--     prazo fatal (dia 1º útil, tolerância dia 5), Ata de Pendência e
--     bloqueio de repasse por falta de prestação.
IF OBJECT_ID(N'dbo.PrestacoesContas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PrestacoesContas (
        PrestacaoId        INT IDENTITY PRIMARY KEY,
        CongregacaoId      INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        MesReferencia      CHAR(7) NOT NULL,
        ComprovanteAguaUrl NVARCHAR(500) NULL,
        ComprovanteLuzUrl  NVARCHAR(500) NULL,
        Status             NVARCHAR(20) NOT NULL DEFAULT 'PENDENTE', -- PENDENTE | COMPLETA | ATA_PENDENCIA
        AtaPendenciaUrl    NVARCHAR(500) NULL,
        BloqueioRepasse    BIT NOT NULL DEFAULT 0,
        RegistradoPor      INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm           DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_Prestacao_CongMes UNIQUE (CongregacaoId, MesReferencia)
    );
END
GO
