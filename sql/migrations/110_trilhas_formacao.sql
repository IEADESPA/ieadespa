-- ============================================================
-- Migração 110 — v6.9: Trilhas de formação e certificação verificável
--
-- Cinco peças, todas reaproveitando o que a FASE 6 e as fases anteriores
-- já têm (nenhum cadastro de pessoa novo, nenhuma tabela de certificado
-- paralela):
--
-- 1) TRILHAS (Trilhas -> TrilhaModulos, com pré-requisitos entre módulos e
--    entre trilhas). "Trilha por papel" (professor de EBD, diácono,
--    tesoureiro local, dirigente, secretário) é só o rótulo `PapelAlvo`:
--    o CONTEÚDO curricular é decisão da igreja, por isso a migração não
--    semeia nenhuma trilha nem módulo.
--
-- 2) PROGRESSO INDIVIDUAL (TrilhaMatriculas, TrilhaModuloConclusoes).
--    Uma pessoa pode refazer uma trilha depois que ela vence (educação
--    continuada), então a matrícula NÃO é única por (Trilha, Membro); o que
--    é único é a matrícula EM ANDAMENTO (índice filtrado — a mesma lição da
--    Trava 6-A: UNIQUE comum trata NULL/valores repetidos de outro jeito
--    que a regra de negócio pede). Concluir a última etapa obrigatória
--    conclui a matrícula e emite o certificado sozinho.
--
-- 3) CERTIFICADO VERIFICÁVEL: CertificadosEmitidos (v6.5) ganha código
--    público de verificação, validade, selo de integridade (hash), vínculo
--    com a matrícula da trilha e revogação. É a MESMA tabela do v6.5 — o
--    certificado manual da EBD também passa a ter código (os já emitidos
--    ganham um agora, então ficam verificáveis na próxima vez que o PDF for
--    baixado). O código é um segredo portador (16 caracteres, ~80 bits, nos
--    emitidos daqui pra frente): quem tem o código confere a autenticidade
--    sem login; ninguém lista nem adivinha certificados.
--
-- 4) REQUISITOS (TrilhaRequisitos): "esta trilha, vigente, é exigida neste
--    fluxo". Um quadro só para os seis encaixes — consagração, nomeação de
--    liderança (por papel), etapa de treinamento da habilitação de
--    voluntário (v5.7), item IV do batismo (vB.11), equipe de escala e
--    designação de professor de EBD — em vez de uma coluna nova em cada
--    tabela. Nasce VAZIO: nada muda em
--    nenhum fluxo até alguém configurar. Cada requisito é BLOQUEIA (impede)
--    ou ALERTA (só avisa): "não bloqueia culto, mas bloqueia escala onde a
--    norma exigir".
--
-- 5) Permissão nova `trilhas_gestao` (nunca concedida a papel nenhum,
--    mesmo padrão de ebd_gestao/habilitacao_voluntarios) e uma regra no
--    motor de notificações (vB.2) para certificado vencendo/vencido.
--
-- Idempotente: seguro para reexecutar sem apagar dados. Cada ALTER em batch
-- próprio (GO): uma coluna recém-criada não pode ser referenciada no mesmo
-- batch em que nasce.
-- ============================================================

-- ---- 1) Trilhas e módulos ----

IF OBJECT_ID(N'dbo.Trilhas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Trilhas (
        TrilhaId            INT IDENTITY PRIMARY KEY,
        Nome                NVARCHAR(150) NOT NULL,
        Descricao           NVARCHAR(500) NULL,
        PapelAlvo           NVARCHAR(60) NULL,            -- rótulo livre: PROFESSOR_EBD, DIACONO, TESOUREIRO_LOCAL, DIRIGENTE, SECRETARIO...
        ValidadeMeses       INT NULL CONSTRAINT CK_Trilhas_Validade CHECK (ValidadeMeses > 0),   -- NULL = o certificado não vence
        AvisoDias           INT NOT NULL CONSTRAINT DF_Trilhas_AvisoDias DEFAULT 60 CONSTRAINT CK_Trilhas_Aviso CHECK (AvisoDias >= 0),
        Ativa               BIT NOT NULL CONSTRAINT DF_Trilhas_Ativa DEFAULT 1,
        CriadaPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadaEm            DATETIME2 NOT NULL CONSTRAINT DF_Trilhas_CriadaEm DEFAULT SYSUTCDATETIME(),
        AtualizadaEm        DATETIME2 NOT NULL CONSTRAINT DF_Trilhas_AtualizadaEm DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_Trilhas_Nome UNIQUE (Nome)
    );
END
GO

IF OBJECT_ID(N'dbo.TrilhaModulos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TrilhaModulos (
        ModuloId            INT IDENTITY PRIMARY KEY,
        TrilhaId            INT NOT NULL REFERENCES dbo.Trilhas(TrilhaId),
        Ordem               INT NOT NULL CONSTRAINT CK_TrilhaModulos_Ordem CHECK (Ordem > 0),
        Titulo              NVARCHAR(150) NOT NULL,
        CargaHoraria        DECIMAL(5,1) NOT NULL CONSTRAINT DF_TrilhaModulos_Carga DEFAULT 0 CONSTRAINT CK_TrilhaModulos_Carga CHECK (CargaHoraria >= 0),
        Obrigatorio         BIT NOT NULL CONSTRAINT DF_TrilhaModulos_Obrigatorio DEFAULT 1,
        Ativo               BIT NOT NULL CONSTRAINT DF_TrilhaModulos_Ativo DEFAULT 1,
        CONSTRAINT UQ_TrilhaModulos_Trilha_Titulo UNIQUE (TrilhaId, Titulo)
    );
END
GO

-- Pré-requisito entre módulos da MESMA trilha (a regra "módulo anterior, na
-- mesma trilha, de Ordem menor" é validada em shared/trilhas.js: sem ciclo
-- por construção).
IF OBJECT_ID(N'dbo.TrilhaModuloPreRequisitos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TrilhaModuloPreRequisitos (
        ModuloId                INT NOT NULL REFERENCES dbo.TrilhaModulos(ModuloId),
        PreRequisitoModuloId    INT NOT NULL REFERENCES dbo.TrilhaModulos(ModuloId),
        CONSTRAINT PK_TrilhaModuloPreRequisitos PRIMARY KEY (ModuloId, PreRequisitoModuloId),
        CONSTRAINT CK_TrilhaModuloPreRequisitos_Distintos CHECK (ModuloId <> PreRequisitoModuloId)
    );
END
GO

-- Pré-requisito entre trilhas ("Dirigente" exige "Discipulado"): só se
-- matricula quem tem a trilha exigida vigente. Ciclos são barrados em
-- shared/trilhas.js.
IF OBJECT_ID(N'dbo.TrilhaPreRequisitos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TrilhaPreRequisitos (
        TrilhaId                INT NOT NULL REFERENCES dbo.Trilhas(TrilhaId),
        PreRequisitoTrilhaId    INT NOT NULL REFERENCES dbo.Trilhas(TrilhaId),
        CONSTRAINT PK_TrilhaPreRequisitos PRIMARY KEY (TrilhaId, PreRequisitoTrilhaId),
        CONSTRAINT CK_TrilhaPreRequisitos_Distintas CHECK (TrilhaId <> PreRequisitoTrilhaId)
    );
END
GO

-- ---- 2) Progresso individual ----

IF OBJECT_ID(N'dbo.TrilhaMatriculas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TrilhaMatriculas (
        MatriculaId             INT IDENTITY PRIMARY KEY,
        TrilhaId                INT NOT NULL REFERENCES dbo.Trilhas(TrilhaId),
        MembroId                INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Status                  NVARCHAR(12) NOT NULL CONSTRAINT DF_TrilhaMatriculas_Status DEFAULT 'EM_ANDAMENTO'
                                    CONSTRAINT CK_TrilhaMatriculas_Status CHECK (Status IN ('EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA')),
        IniciadaEm              DATETIME2 NOT NULL CONSTRAINT DF_TrilhaMatriculas_IniciadaEm DEFAULT SYSUTCDATETIME(),
        ConcluidaEm             DATETIME2 NULL,
        ValidoAte               DATE NULL,                     -- preenchido na conclusão, a partir de Trilhas.ValidadeMeses
        CanceladaEm             DATETIME2 NULL,
        MotivoCancelamento      NVARCHAR(300) NULL,
        RegistradaPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AtualizadoEm            DATETIME2 NOT NULL CONSTRAINT DF_TrilhaMatriculas_AtualizadoEm DEFAULT SYSUTCDATETIME()
    );
END
GO

-- No máximo UMA matrícula em andamento por (Trilha, Membro); concluídas e
-- canceladas se acumulam (histórico e renovação).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_TrilhaMatriculas_EmAndamento' AND object_id = OBJECT_ID('dbo.TrilhaMatriculas'))
    CREATE UNIQUE INDEX UX_TrilhaMatriculas_EmAndamento
        ON dbo.TrilhaMatriculas (TrilhaId, MembroId)
        WHERE Status = 'EM_ANDAMENTO';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TrilhaMatriculas_Membro' AND object_id = OBJECT_ID('dbo.TrilhaMatriculas'))
    CREATE INDEX IX_TrilhaMatriculas_Membro ON dbo.TrilhaMatriculas (MembroId, TrilhaId);
GO

IF OBJECT_ID(N'dbo.TrilhaModuloConclusoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TrilhaModuloConclusoes (
        ConclusaoId             INT IDENTITY PRIMARY KEY,
        MatriculaId             INT NOT NULL REFERENCES dbo.TrilhaMatriculas(MatriculaId),
        ModuloId                INT NOT NULL REFERENCES dbo.TrilhaModulos(ModuloId),
        ConcluidoEm             DATE NOT NULL,
        CargaHorariaRegistrada  DECIMAL(5,1) NOT NULL,        -- foto da carga do módulo no dia (o catálogo pode mudar depois)
        Observacao              NVARCHAR(300) NULL,
        RegistradoPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm            DATETIME2 NOT NULL CONSTRAINT DF_TrilhaModuloConclusoes_RegistradoEm DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_TrilhaModuloConclusoes_Matricula_Modulo UNIQUE (MatriculaId, ModuloId)
    );
END
GO

-- ---- 3) Certificado verificável (evolução de CertificadosEmitidos, v6.5) ----

IF COL_LENGTH('dbo.CertificadosEmitidos', 'CodigoVerificacao') IS NULL
    ALTER TABLE dbo.CertificadosEmitidos ADD CodigoVerificacao NVARCHAR(20) NULL;
GO

IF COL_LENGTH('dbo.CertificadosEmitidos', 'ValidoAte') IS NULL
    ALTER TABLE dbo.CertificadosEmitidos ADD ValidoAte DATE NULL;
GO

IF COL_LENGTH('dbo.CertificadosEmitidos', 'TrilhaMatriculaId') IS NULL
    ALTER TABLE dbo.CertificadosEmitidos ADD TrilhaMatriculaId INT NULL REFERENCES dbo.TrilhaMatriculas(MatriculaId);
GO

IF COL_LENGTH('dbo.CertificadosEmitidos', 'RevogadoEm') IS NULL
    ALTER TABLE dbo.CertificadosEmitidos ADD RevogadoEm DATETIME2 NULL;
GO

IF COL_LENGTH('dbo.CertificadosEmitidos', 'RevogadoPorMembroId') IS NULL
    ALTER TABLE dbo.CertificadosEmitidos ADD RevogadoPorMembroId INT NULL REFERENCES dbo.MembroReferencia(MembroId);
GO

IF COL_LENGTH('dbo.CertificadosEmitidos', 'MotivoRevogacao') IS NULL
    ALTER TABLE dbo.CertificadosEmitidos ADD MotivoRevogacao NVARCHAR(300) NULL;
GO

IF COL_LENGTH('dbo.CertificadosEmitidos', 'HashIntegridade') IS NULL
    ALTER TABLE dbo.CertificadosEmitidos ADD HashIntegridade NVARCHAR(64) NULL;
GO

-- Os certificados da v6.5 já emitidos ganham um código (hex de 16 caracteres,
-- aleatório por linha) para poderem ser verificados. Sem selo de integridade
-- (HashIntegridade NULL): a verificação pública informa que foram emitidos
-- antes do selo existir.
UPDATE dbo.CertificadosEmitidos
SET CodigoVerificacao = UPPER(LEFT(REPLACE(CONVERT(VARCHAR(36), NEWID()), '-', ''), 16))
WHERE CodigoVerificacao IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_CertificadosEmitidos_Codigo' AND object_id = OBJECT_ID('dbo.CertificadosEmitidos'))
    CREATE UNIQUE INDEX UX_CertificadosEmitidos_Codigo
        ON dbo.CertificadosEmitidos (CodigoVerificacao)
        WHERE CodigoVerificacao IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CertificadosEmitidos_Matricula' AND object_id = OBJECT_ID('dbo.CertificadosEmitidos'))
    CREATE INDEX IX_CertificadosEmitidos_Matricula ON dbo.CertificadosEmitidos (TrilhaMatriculaId) WHERE TrilhaMatriculaId IS NOT NULL;
GO

-- ---- 4) Requisitos por fluxo (nasce vazio: nada muda até alguém configurar) ----

IF OBJECT_ID(N'dbo.TrilhaRequisitos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TrilhaRequisitos (
        RequisitoId         INT IDENTITY PRIMARY KEY,
        Contexto            NVARCHAR(30) NOT NULL CONSTRAINT CK_TrilhaRequisitos_Contexto
                                CHECK (Contexto IN ('CONSAGRACAO', 'LIDERANCA', 'HABILITACAO_TREINAMENTO', 'BATISMO_DISCIPULADO', 'ESCALA_EQUIPE', 'EBD_PROFESSOR')),
        -- O que, dentro do contexto, exige a trilha: CONSAGRACAO = nome do tipo de
        -- consagração (o "Assunto"), LIDERANCA = PapelId, ESCALA_EQUIPE = EquipeId.
        -- Vazio = vale para o contexto inteiro (HABILITACAO_TREINAMENTO,
        -- BATISMO_DISCIPULADO, EBD_PROFESSOR = designar professor de turma).
        AlvoChave           NVARCHAR(100) NOT NULL CONSTRAINT DF_TrilhaRequisitos_Alvo DEFAULT '',
        TrilhaId            INT NOT NULL REFERENCES dbo.Trilhas(TrilhaId),
        Modo                NVARCHAR(10) NOT NULL CONSTRAINT DF_TrilhaRequisitos_Modo DEFAULT 'BLOQUEIA'
                                CONSTRAINT CK_TrilhaRequisitos_Modo CHECK (Modo IN ('BLOQUEIA', 'ALERTA')),
        Ativo               BIT NOT NULL CONSTRAINT DF_TrilhaRequisitos_Ativo DEFAULT 1,
        CriadoPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm            DATETIME2 NOT NULL CONSTRAINT DF_TrilhaRequisitos_CriadoEm DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_TrilhaRequisitos_Contexto_Alvo_Trilha UNIQUE (Contexto, AlvoChave, TrilhaId)
    );
END
GO

-- ---- 5) Permissão e notificação ----

IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'trilhas_gestao')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('trilhas_gestao', N'Formação — Trilhas, Matrículas, Requisitos e Certificados');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'FORMACAO_VENCENDO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'FORMACAO_VENCENDO', N'Certificado de formação vencendo', N'FORMACAO', N'trilhas_gestao', NULL, 1);
GO
