-- ============================================================
-- Migração 001 — Esquema Governança IEADESPA (idempotente)
-- Banco alvo: Azure SQL Database
-- Seguro para reexecutar: usa IF NOT EXISTS / IF EXISTS, então não
-- quebra objetos já existentes (CREATE TABLE) e não apaga dados de
-- produção. Mantém os mesmos objetos de sql/schema.sql.
-- ============================================================

-- ---------- Catálogos geridos ----------
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Congregacoes') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Congregacoes (
        CongregacaoId   INT IDENTITY PRIMARY KEY,
        Nome            NVARCHAR(150) NOT NULL,
        Ativa           BIT NOT NULL DEFAULT 1
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Funcoes') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Funcoes (
        FuncaoId        INT IDENTITY PRIMARY KEY,
        Nome            NVARCHAR(100) NOT NULL,
        Ativa           BIT NOT NULL DEFAULT 1
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.MembroReferencia') AND type = N'U')
BEGIN
    CREATE TABLE dbo.MembroReferencia (
        MembroId        INT PRIMARY KEY,
        Nome            NVARCHAR(200) NOT NULL,
        Funcao          NVARCHAR(100) NULL,
        CongregacaoId   INT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        Status          NVARCHAR(20) NOT NULL DEFAULT 'ATIVO',
        DataNascimento  DATE NULL,
        DataAdmissao    DATE NULL,
        DizimistaFiel   BIT NULL,
        CriadoEm        DATETIME2 DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Orgaos') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Orgaos (
        OrgaoId                 INT IDENTITY PRIMARY KEY,
        Sigla                   NVARCHAR(30) NOT NULL,
        Nome                    NVARCHAR(200) NOT NULL,
        QuorumMinimoPct         DECIMAL(5,2) NULL,
        QuorumDeliberativoPct   DECIMAL(5,2) NULL,
        FaltasParaPerdaAssento  INT NULL DEFAULT 3
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Mandatos') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Mandatos (
        MandatoId       INT IDENTITY PRIMARY KEY,
        OrgaoId         INT NOT NULL REFERENCES dbo.Orgaos(OrgaoId),
        DuracaoTipo     NVARCHAR(30) NOT NULL,
        Blindado        BIT DEFAULT 0
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Assentos') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Assentos (
        AssentoId           INT IDENTITY PRIMARY KEY,
        OrgaoId             INT NOT NULL REFERENCES dbo.Orgaos(OrgaoId),
        MembroId            INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        TipoAssento         NVARCHAR(30) NOT NULL,
        CargoOuFuncao       NVARCHAR(100) NULL,
        DataInicio          DATE NOT NULL,
        DataFim             DATE NULL,
        MotivoEncerramento  NVARCHAR(200) NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Sessoes') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Sessoes (
        SessaoId            INT IDENTITY PRIMARY KEY,
        OrgaoId             INT NOT NULL REFERENCES dbo.Orgaos(OrgaoId),
        Descricao           NVARCHAR(200) NULL,
        DataSessao          DATE NOT NULL,
        TipoSessao          NVARCHAR(30) NOT NULL DEFAULT 'ORDINARIA',
        Status              NVARCHAR(20) NOT NULL DEFAULT 'ABERTA',
        SenhaAcesso         NVARCHAR(50) NULL,
        QuorumAtingido      BIT NULL,
        VinculadaSessaoId   INT NULL REFERENCES dbo.Sessoes(SessaoId)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Presencas') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Presencas (
        PresencaId              INT IDENTITY PRIMARY KEY,
        SessaoId                INT NOT NULL REFERENCES dbo.Sessoes(SessaoId),
        MembroId                INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Presente                BIT NOT NULL,
        FaltaJustificada        BIT DEFAULT 0,
        MotivoJustificativa     NVARCHAR(300) NULL,
        JustificativaPendente   NVARCHAR(300) NULL,
        FaltaDupla              BIT DEFAULT 0
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.ProcessosDisciplinares') AND type = N'U')
BEGIN
    CREATE TABLE dbo.ProcessosDisciplinares (
        ProcessoId          INT IDENTITY PRIMARY KEY,
        OrgaoResponsavelId  INT NOT NULL REFERENCES dbo.Orgaos(OrgaoId),
        MembroId            INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DataAbertura        DATE NOT NULL,
        Status              NVARCHAR(30) NOT NULL,
        Sigiloso            BIT DEFAULT 1,
        DataConclusao       DATE NULL,
        Resultado           NVARCHAR(30) NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Matriculas_AFM') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Matriculas_AFM (
        MatriculaId             INT IDENTITY PRIMARY KEY,
        MembroId                INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        NivelAtual              NVARCHAR(30) NOT NULL,
        StatusMatricula         NVARCHAR(20) NOT NULL DEFAULT 'ATIVA',
        DataUltimaAvaliacao     DATE NULL,
        CertificadoHabilitacao  BIT DEFAULT 0
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Documentos') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Documentos (
        DocumentoId     INT IDENTITY PRIMARY KEY,
        Tipo            NVARCHAR(50) NOT NULL,
        OrgaoId         INT NULL REFERENCES dbo.Orgaos(OrgaoId),
        ReferenciaId    INT NULL,
        UrlBlob         NVARCHAR(500) NOT NULL,
        CriadoEm        DATETIME2 DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.AuditLog') AND type = N'U')
BEGIN
    CREATE TABLE dbo.AuditLog (
        AuditId         BIGINT IDENTITY PRIMARY KEY,
        Tabela          NVARCHAR(50) NOT NULL,
        RegistroId      INT NOT NULL,
        Acao            NVARCHAR(20) NOT NULL,
        UsuarioId       INT NULL,
        DataHora        DATETIME2 DEFAULT SYSUTCDATETIME(),
        DadosAntes      NVARCHAR(MAX) NULL,
        DadosDepois     NVARCHAR(MAX) NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Lideranca') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Lideranca (
        LiderancaId     INT IDENTITY PRIMARY KEY,
        MembroId        INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Tipo            NVARCHAR(50) NOT NULL,
        Escopo          NVARCHAR(500) NOT NULL,
        Permissoes      NVARCHAR(300) NULL,
        SenhaHash       NVARCHAR(200) NULL,
        CriadoEm        DATETIME2 DEFAULT SYSUTCDATETIME(),
        AtivoAte        DATE NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Consagracoes') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Consagracoes (
        ConsagracaoId       UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
        MembroId            INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CargoAtual          NVARCHAR(100) NULL,
        Assunto             NVARCHAR(100) NOT NULL,
        ProponenteMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Status              NVARCHAR(30) NOT NULL DEFAULT 'PROTOCOLADO',
        DataProtocolo       DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
        DataConclusao       DATE NULL
    );
END
GO

-- ---------- Órgãos oficiais (Art. 13) ----------
INSERT INTO dbo.Orgaos (Sigla, Nome, QuorumMinimoPct, QuorumDeliberativoPct, FaltasParaPerdaAssento)
SELECT v.Sigla, v.Nome, v.QuorumMinimoPct, v.QuorumDeliberativoPct, v.FaltasParaPerdaAssento
FROM (VALUES
    ('ASSEMBLEIA_GERAL', 'Assembleia Geral', NULL, NULL, NULL),
    ('CLI', 'Câmara de Liderança Institucional', NULL, NULL, 3),
    ('DIRETORIA_EXECUTIVA', 'Diretoria Executiva', NULL, NULL, NULL),
    ('CEI', 'Conselho de Ética e Integridade', NULL, NULL, NULL),
    ('CONSELHO_FISCAL', 'Conselho Fiscal', NULL, NULL, NULL)
) AS v(Sigla, Nome, QuorumMinimoPct, QuorumDeliberativoPct, FaltasParaPerdaAssento)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Orgaos o WHERE o.Sigla = v.Sigla);
GO

-- ---------- Governança escalonada (Art. 104-A/B/C) ----------
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Areas') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Areas (
        AreaId      INT IDENTITY PRIMARY KEY,
        Nome        NVARCHAR(150) NOT NULL,
        Ativa       BIT NOT NULL DEFAULT 1,
        AtivadaEm   DATE NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Regioes') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Regioes (
        RegiaoId    INT IDENTITY PRIMARY KEY,
        Nome        NVARCHAR(150) NOT NULL,
        Subsede     BIT NOT NULL DEFAULT 0,
        Ativa       BIT NOT NULL DEFAULT 0
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Quadrantes') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Quadrantes (
        QuadranteId INT IDENTITY PRIMARY KEY,
        Nome        NVARCHAR(150) NOT NULL,
        Ativo       BIT NOT NULL DEFAULT 0
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Distritos') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Distritos (
        DistritoId  INT IDENTITY PRIMARY KEY,
        Nome        NVARCHAR(150) NOT NULL,
        Ativo       BIT NOT NULL DEFAULT 0
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Congregacoes') AND name = N'AreaId')
    ALTER TABLE dbo.Congregacoes ADD AreaId INT NULL REFERENCES dbo.Areas(AreaId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.VinculoCongregacaoArea') AND type = N'U')
BEGIN
    CREATE TABLE dbo.VinculoCongregacaoArea (
        VinculoId       INT IDENTITY PRIMARY KEY,
        CongregacaoId   INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        AreaId          INT NOT NULL REFERENCES dbo.Areas(AreaId),
        DataInicio      DATE NOT NULL,
        DataFim         DATE NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.ExtensoesTenda') AND type = N'U')
BEGIN
    CREATE TABLE dbo.ExtensoesTenda (
        ExtensaoId          INT IDENTITY PRIMARY KEY,
        Nome                NVARCHAR(150) NOT NULL,
        CongregacaoMaeId    INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        Ativa               BIT NOT NULL DEFAULT 1
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.OrgaosLocais') AND type = N'U')
BEGIN
    CREATE TABLE dbo.OrgaosLocais (
        OrgaoLocalId    INT IDENTITY PRIMARY KEY,
        Sigla           NVARCHAR(30) NOT NULL,
        Nome            NVARCHAR(200) NOT NULL,
        Nivel           INT NOT NULL,
        ReferenciaId    INT NULL,
        Ativo           BIT NOT NULL DEFAULT 1
    );
END
GO

-- ---------- Situação do membro + departamento + escada ministerial ----------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MembroReferencia') AND name = N'SituacaoMembro')
    ALTER TABLE dbo.MembroReferencia ADD SituacaoMembro NVARCHAR(30) NOT NULL DEFAULT 'EM_COMUNHAO';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MembroReferencia') AND name = N'DepartamentoId')
    ALTER TABLE dbo.MembroReferencia ADD DepartamentoId INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MembroReferencia') AND name = N'CargoMinisterial')
    ALTER TABLE dbo.MembroReferencia ADD CargoMinisterial NVARCHAR(30) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.Departamentos') AND type = N'U')
BEGIN
    CREATE TABLE dbo.Departamentos (
        DepartamentoId  INT IDENTITY PRIMARY KEY,
        Sigla           NVARCHAR(30) NOT NULL,
        Nome            NVARCHAR(150) NOT NULL,
        Numero          INT NULL,
        Ativo           BIT NOT NULL DEFAULT 1
    );
END
GO

INSERT INTO dbo.Departamentos (Sigla, Nome, Numero)
SELECT v.Sigla, v.Nome, v.Numero
FROM (VALUES
    ('UCADESPA',  'União de Crianças',           1),
    ('UMADESPA',  'União de Mocidade',           2),
    ('USADESPA',  'União de Senhoras',           3),
    ('UHADESPA',  'União de Homens',             4),
    ('SEMIADESPA','Missões',                     5),
    ('ACAO_DA_FE','Ação Social',                 6),
    ('EBD',       'Escola Bíblica Dominical',    7),
    ('FAMILIA',   'Ministério de Família',       8)
) AS v(Sigla, Nome, Numero)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Departamentos d WHERE d.Sigla = v.Sigla);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_MembroReferencia_Departamento')
    ALTER TABLE dbo.MembroReferencia ADD CONSTRAINT FK_MembroReferencia_Departamento
        FOREIGN KEY (DepartamentoId) REFERENCES dbo.Departamentos(DepartamentoId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Matriculas_AFM') AND name = N'NivelEscolaridade')
    ALTER TABLE dbo.Matriculas_AFM ADD NivelEscolaridade NVARCHAR(30) NULL;
GO

-- ---------- Catálogos configuráveis ----------
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.SituacoesMembro') AND type = N'U')
BEGIN
    CREATE TABLE dbo.SituacoesMembro (
        SituacaoId  INT IDENTITY PRIMARY KEY,
        Sigla       NVARCHAR(30) NOT NULL,
        Nome        NVARCHAR(100) NOT NULL,
        Ativa       BIT NOT NULL DEFAULT 1
    );
END
GO

INSERT INTO dbo.SituacoesMembro (Sigla, Nome)
SELECT v.Sigla, v.Nome FROM (VALUES
    ('CONGREGADO','Congregado'),
    ('EM_COMUNHAO','Membro em Comunhão'),
    ('SEM_COMUNHAO','Membro sem Comunhão')
) AS v(Sigla, Nome)
WHERE NOT EXISTS (SELECT 1 FROM dbo.SituacoesMembro s WHERE s.Sigla = v.Sigla);
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.CargosMinisteriais') AND type = N'U')
BEGIN
    CREATE TABLE dbo.CargosMinisteriais (
        CargoId INT IDENTITY PRIMARY KEY,
        Sigla   NVARCHAR(30) NOT NULL,
        Nome    NVARCHAR(100) NOT NULL,
        Ordem   INT NULL,
        Ativo   BIT NOT NULL DEFAULT 1
    );
END
GO

INSERT INTO dbo.CargosMinisteriais (Sigla, Nome, Ordem)
SELECT v.Sigla, v.Nome, v.Ordem FROM (VALUES
    ('MEMBRO','Membro',0),
    ('AUXILIAR','Auxiliar',1),
    ('MISSIONARIO','Missionário(a)',2),
    ('DIACONO','Diácono',3),
    ('PRESBITERO','Presbítero',4),
    ('EVANGELISTA','Evangelista',5),
    ('PASTOR','Pastor',6)
) AS v(Sigla, Nome, Ordem)
WHERE NOT EXISTS (SELECT 1 FROM dbo.CargosMinisteriais c WHERE c.Sigla = v.Sigla);
GO

-- ---------- Processo disciplinar com término automático ----------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ProcessosDisciplinares') AND name = N'DiasSancao')
    ALTER TABLE dbo.ProcessosDisciplinares ADD DiasSancao INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ProcessosDisciplinares') AND name = N'DataTerminoPrevisao')
    ALTER TABLE dbo.ProcessosDisciplinares ADD DataTerminoPrevisao DATE NULL;
GO
