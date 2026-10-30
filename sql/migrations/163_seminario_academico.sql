-- ============================================================
-- Migração 163 — v8.7: o Seminário como sistema acadêmico (a AFM com histórico escolar). Desenho em docs/plano/fase-8-ministerial-afm.md.
--
-- Base legal: Regimento Art. 66 e 68 (a AFM ensina e habilita; o Reitor e o Corpo Docente), Art. 70 §2º (Liderança, Administração Eclesiástica e Compliance
-- Estatutário no currículo) e Art. 72 (os quatro níveis; "matriculado e cursando"; o certificado de conclusão do Avançado ou do Bacharel para Evangelista e Pastor).
--
--   AFMCursos: os quatro níveis do Art. 72 (criados aqui; não se criam outros), com a nota e a frequência mínimas.
--   AFMDisciplinas / AFMDisciplinaPreRequisitos: o currículo de cada curso (a Academia cadastra; nada é semeado) e os pré-requisitos (sem ciclo — o servidor confere).
--   AFMCursoMatriculas: a matrícula da pessoa no curso (cursando, concluído com o diploma, cancelado).
--   AFMTurmas / AFMTurmaAlunos: a oferta da disciplina com o docente e a regra congelada; a inscrição, a nota, as horas e o resultado.
--   AFMAproveitamentos: a disciplina cursada fora, com o parecer de quem decidiu.
--   AFMDisciplinaRequisitos: o requisito de formação (v6.9) que exige uma disciplina, ao lado do que exige uma trilha (TrilhaRequisitos).
--   AFMDocumentosAcademicos: a fotografia do histórico escolar emitido (o conteúdo do dia; o nome vem do cadastro na hora de imprimir).
--   CertificadosEmitidos.Natureza: + DIPLOMA_AFM, HISTORICO, DECLARACAO.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.AFMCursos') AND type = N'U')
BEGIN
    CREATE TABLE dbo.AFMCursos (
        CursoId             INT IDENTITY CONSTRAINT PK_AFMCursos PRIMARY KEY,
        Nivel               NVARCHAR(10) NOT NULL,
        Nome                NVARCHAR(150) NOT NULL,
        NotaMinima          DECIMAL(4,2) NOT NULL CONSTRAINT DF_AFMCursos_Nota DEFAULT 7,
        FrequenciaMinimaPct INT NOT NULL CONSTRAINT DF_AFMCursos_Freq DEFAULT 75,
        AtualizadoPor       INT NULL,
        AtualizadoEm        DATETIME2 NULL,
        CONSTRAINT UQ_AFMCursos_Nivel UNIQUE (Nivel),
        CONSTRAINT CK_AFMCursos_Nivel CHECK (Nivel IN (N'BASICO', N'MEDIO', N'AVANCADO', N'BACHAREL')),
        CONSTRAINT CK_AFMCursos_Nota CHECK (NotaMinima >= 0 AND NotaMinima <= 10),
        CONSTRAINT CK_AFMCursos_Freq CHECK (FrequenciaMinimaPct BETWEEN 1 AND 100)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM dbo.AFMCursos WHERE Nivel = N'BASICO')   INSERT INTO dbo.AFMCursos (Nivel, Nome) VALUES (N'BASICO', N'Nível Básico em Teologia');
IF NOT EXISTS (SELECT 1 FROM dbo.AFMCursos WHERE Nivel = N'MEDIO')    INSERT INTO dbo.AFMCursos (Nivel, Nome) VALUES (N'MEDIO', N'Nível Médio em Teologia');
IF NOT EXISTS (SELECT 1 FROM dbo.AFMCursos WHERE Nivel = N'AVANCADO') INSERT INTO dbo.AFMCursos (Nivel, Nome) VALUES (N'AVANCADO', N'Nível Avançado em Teologia');
IF NOT EXISTS (SELECT 1 FROM dbo.AFMCursos WHERE Nivel = N'BACHAREL') INSERT INTO dbo.AFMCursos (Nivel, Nome) VALUES (N'BACHAREL', N'Bacharel Livre em Teologia');
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.AFMDisciplinas') AND type = N'U')
BEGIN
    CREATE TABLE dbo.AFMDisciplinas (
        DisciplinaId    INT IDENTITY CONSTRAINT PK_AFMDisciplinas PRIMARY KEY,
        CursoId         INT NOT NULL CONSTRAINT FK_AFMDisciplinas_Curso REFERENCES dbo.AFMCursos(CursoId),
        Nome            NVARCHAR(150) NOT NULL,
        Area            NVARCHAR(14) NOT NULL,
        CargaHoraria    DECIMAL(5,1) NOT NULL,
        Obrigatoria     BIT NOT NULL CONSTRAINT DF_AFMDisciplinas_Obrig DEFAULT 1,
        Ativa           BIT NOT NULL CONSTRAINT DF_AFMDisciplinas_Ativa DEFAULT 1,
        Ementa          NVARCHAR(600) NULL,
        CriadaPor       INT NULL,
        CriadaEm        DATETIME2 NOT NULL CONSTRAINT DF_AFMDisciplinas_Em DEFAULT SYSUTCDATETIME(),
        AtualizadaPor   INT NULL,
        AtualizadaEm    DATETIME2 NULL,
        CONSTRAINT UQ_AFMDisciplinas_Nome UNIQUE (CursoId, Nome),
        CONSTRAINT CK_AFMDisciplinas_Area CHECK (Area IN (N'TEOLOGIA', N'LITURGIA', N'LIDERANCA', N'ADMINISTRACAO', N'COMPLIANCE', N'OUTRA')),
        CONSTRAINT CK_AFMDisciplinas_Carga CHECK (CargaHoraria > 0 AND CargaHoraria <= 500)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.AFMDisciplinaPreRequisitos') AND type = N'U')
BEGIN
    CREATE TABLE dbo.AFMDisciplinaPreRequisitos (
        DisciplinaId    INT NOT NULL CONSTRAINT FK_AFMDisciplinaPreReq_Disc REFERENCES dbo.AFMDisciplinas(DisciplinaId),
        PreRequisitoId  INT NOT NULL CONSTRAINT FK_AFMDisciplinaPreReq_Pre REFERENCES dbo.AFMDisciplinas(DisciplinaId),
        CONSTRAINT PK_AFMDisciplinaPreRequisitos PRIMARY KEY (DisciplinaId, PreRequisitoId),
        CONSTRAINT CK_AFMDisciplinaPreRequisitos_Proprio CHECK (DisciplinaId <> PreRequisitoId)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.AFMCursoMatriculas') AND type = N'U')
BEGIN
    CREATE TABLE dbo.AFMCursoMatriculas (
        CursoMatriculaId     INT IDENTITY CONSTRAINT PK_AFMCursoMatriculas PRIMARY KEY,
        CursoId              INT NOT NULL CONSTRAINT FK_AFMCursoMatriculas_Curso REFERENCES dbo.AFMCursos(CursoId),
        MembroId             INT NOT NULL CONSTRAINT FK_AFMCursoMatriculas_Membro REFERENCES dbo.MembroReferencia(MembroId),
        Situacao             NVARCHAR(10) NOT NULL CONSTRAINT DF_AFMCursoMatriculas_Sit DEFAULT N'CURSANDO',
        DataInicio           DATE NOT NULL,
        DataConclusao        DATE NULL,
        DiplomaCertificadoId INT NULL CONSTRAINT FK_AFMCursoMatriculas_Diploma REFERENCES dbo.CertificadosEmitidos(CertificadoId),
        CanceladaEm          DATE NULL,
        MotivoCancelamento   NVARCHAR(300) NULL,
        CriadaPor            INT NULL,
        CriadaEm             DATETIME2 NOT NULL CONSTRAINT DF_AFMCursoMatriculas_Em DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_AFMCursoMatriculas_Sit CHECK (Situacao IN (N'CURSANDO', N'CONCLUIDO', N'CANCELADA')),
        CONSTRAINT CK_AFMCursoMatriculas_Conclusao CHECK ((Situacao = N'CONCLUIDO' AND DataConclusao IS NOT NULL) OR (Situacao <> N'CONCLUIDO' AND DataConclusao IS NULL)),
        CONSTRAINT CK_AFMCursoMatriculas_Cancelada CHECK ((Situacao = N'CANCELADA' AND CanceladaEm IS NOT NULL AND MotivoCancelamento IS NOT NULL) OR (Situacao <> N'CANCELADA' AND CanceladaEm IS NULL))
    );
END
GO
-- uma matrícula viva (cursando ou concluída) por pessoa e curso
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_AFMCursoMatriculas_Viva' AND object_id = OBJECT_ID(N'dbo.AFMCursoMatriculas'))
    CREATE UNIQUE INDEX UX_AFMCursoMatriculas_Viva ON dbo.AFMCursoMatriculas (MembroId, CursoId) WHERE Situacao <> N'CANCELADA';
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.AFMTurmas') AND type = N'U')
BEGIN
    CREATE TABLE dbo.AFMTurmas (
        TurmaId             INT IDENTITY CONSTRAINT PK_AFMTurmas PRIMARY KEY,
        DisciplinaId        INT NOT NULL CONSTRAINT FK_AFMTurmas_Disciplina REFERENCES dbo.AFMDisciplinas(DisciplinaId),
        DocenteMembroId     INT NOT NULL CONSTRAINT FK_AFMTurmas_Docente REFERENCES dbo.MembroReferencia(MembroId),
        DataInicio          DATE NOT NULL,
        DataFim             DATE NOT NULL,
        Local               NVARCHAR(150) NULL,
        CargaHoraria        DECIMAL(5,1) NOT NULL,
        NotaMinima          DECIMAL(4,2) NOT NULL,
        FrequenciaMinimaPct INT NOT NULL,
        Situacao            NVARCHAR(10) NOT NULL CONSTRAINT DF_AFMTurmas_Sit DEFAULT N'ABERTA',
        EncerradaEm         DATE NULL,
        EncerradaPor        INT NULL,
        PrimeiroEncerramentoEm DATE NULL,   -- nunca volta a NULL: a turma que já foi encerrada uma vez é histórico (não se exclui; a inscrição com nota não se cancela)
        CriadaPor           INT NULL,
        CriadaEm            DATETIME2 NOT NULL CONSTRAINT DF_AFMTurmas_Em DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_AFMTurmas_Sit CHECK (Situacao IN (N'ABERTA', N'ENCERRADA')),
        CONSTRAINT CK_AFMTurmas_Encerrada CHECK ((Situacao = N'ENCERRADA' AND EncerradaEm IS NOT NULL) OR (Situacao = N'ABERTA' AND EncerradaEm IS NULL)),
        CONSTRAINT CK_AFMTurmas_Datas CHECK (DataFim >= DataInicio),
        CONSTRAINT CK_AFMTurmas_Regra CHECK (CargaHoraria > 0 AND CargaHoraria <= 500 AND NotaMinima >= 0 AND NotaMinima <= 10 AND FrequenciaMinimaPct BETWEEN 1 AND 100)
    );
    CREATE INDEX IX_AFMTurmas_Disciplina ON dbo.AFMTurmas (DisciplinaId, Situacao);
    CREATE INDEX IX_AFMTurmas_Docente ON dbo.AFMTurmas (DocenteMembroId, Situacao);
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.AFMTurmaAlunos') AND type = N'U')
BEGIN
    CREATE TABLE dbo.AFMTurmaAlunos (
        TurmaId             INT NOT NULL CONSTRAINT FK_AFMTurmaAlunos_Turma REFERENCES dbo.AFMTurmas(TurmaId),
        MembroId            INT NOT NULL CONSTRAINT FK_AFMTurmaAlunos_Membro REFERENCES dbo.MembroReferencia(MembroId),
        Situacao            NVARCHAR(10) NOT NULL CONSTRAINT DF_AFMTurmaAlunos_Sit DEFAULT N'INSCRITO',
        Nota                DECIMAL(4,2) NULL,
        HorasPresentes      DECIMAL(5,1) NULL,
        Resultado           NVARCHAR(16) NULL,
        LancadoPor          INT NULL,
        LancadoEm           DATETIME2 NULL,
        InscritoPor         INT NULL,
        InscritoEm          DATETIME2 NOT NULL CONSTRAINT DF_AFMTurmaAlunos_Em DEFAULT SYSUTCDATETIME(),
        CanceladoEm         DATETIME2 NULL,
        MotivoCancelamento  NVARCHAR(300) NULL,
        CONSTRAINT PK_AFMTurmaAlunos PRIMARY KEY (TurmaId, MembroId),
        CONSTRAINT CK_AFMTurmaAlunos_Sit CHECK (Situacao IN (N'INSCRITO', N'CANCELADO')),
        CONSTRAINT CK_AFMTurmaAlunos_Resultado CHECK (Resultado IS NULL OR Resultado IN (N'APROVADO', N'REPROVADO_NOTA', N'REPROVADO_FREQ')),
        CONSTRAINT CK_AFMTurmaAlunos_Nota CHECK (Nota IS NULL OR (Nota >= 0 AND Nota <= 10)),
        CONSTRAINT CK_AFMTurmaAlunos_Horas CHECK (HorasPresentes IS NULL OR (HorasPresentes >= 0 AND HorasPresentes <= 500)),
        CONSTRAINT CK_AFMTurmaAlunos_Lancado CHECK ((Resultado IS NULL AND Nota IS NULL AND HorasPresentes IS NULL) OR (Resultado IS NOT NULL AND Nota IS NOT NULL AND HorasPresentes IS NOT NULL)),
        CONSTRAINT CK_AFMTurmaAlunos_Cancelado CHECK ((Situacao = N'CANCELADO' AND CanceladoEm IS NOT NULL AND MotivoCancelamento IS NOT NULL AND Resultado IS NULL) OR (Situacao = N'INSCRITO' AND CanceladoEm IS NULL))
    );
    CREATE INDEX IX_AFMTurmaAlunos_Membro ON dbo.AFMTurmaAlunos (MembroId, TurmaId) INCLUDE (Situacao, Resultado);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.AFMAproveitamentos') AND type = N'U')
BEGIN
    CREATE TABLE dbo.AFMAproveitamentos (
        AproveitamentoId    INT IDENTITY CONSTRAINT PK_AFMAproveitamentos PRIMARY KEY,
        MembroId            INT NOT NULL CONSTRAINT FK_AFMAproveitamentos_Membro REFERENCES dbo.MembroReferencia(MembroId),
        DisciplinaId        INT NOT NULL CONSTRAINT FK_AFMAproveitamentos_Disciplina REFERENCES dbo.AFMDisciplinas(DisciplinaId),
        Instituicao         NVARCHAR(150) NOT NULL,
        DisciplinaOrigem    NVARCHAR(150) NOT NULL,
        CargaHorariaOrigem  DECIMAL(5,1) NOT NULL,
        AnoOrigem           INT NOT NULL,
        NotaOrigem          NVARCHAR(20) NULL,
        Decisao             NVARCHAR(10) NOT NULL,
        Parecer             NVARCHAR(600) NOT NULL,
        PareceristaMembroId INT NOT NULL CONSTRAINT FK_AFMAproveitamentos_Parecerista REFERENCES dbo.MembroReferencia(MembroId),
        DataParecer         DATE NOT NULL,
        RegistradoPor       INT NULL,
        RegistradoEm        DATETIME2 NOT NULL CONSTRAINT DF_AFMAproveitamentos_Em DEFAULT SYSUTCDATETIME(),
        AnuladoEm           DATETIME2 NULL,
        AnuladoPor          INT NULL,
        MotivoAnulacao      NVARCHAR(300) NULL,
        CONSTRAINT CK_AFMAproveitamentos_Decisao CHECK (Decisao IN (N'DEFERIDO', N'INDEFERIDO')),
        CONSTRAINT CK_AFMAproveitamentos_Carga CHECK (CargaHorariaOrigem > 0 AND CargaHorariaOrigem <= 2000),
        CONSTRAINT CK_AFMAproveitamentos_Ano CHECK (AnoOrigem BETWEEN 1950 AND 2100),
        CONSTRAINT CK_AFMAproveitamentos_Parecerista CHECK (PareceristaMembroId <> MembroId),
        CONSTRAINT CK_AFMAproveitamentos_Anulado CHECK ((AnuladoEm IS NULL AND MotivoAnulacao IS NULL) OR (AnuladoEm IS NOT NULL AND MotivoAnulacao IS NOT NULL))
    );
    CREATE INDEX IX_AFMAproveitamentos_Membro ON dbo.AFMAproveitamentos (MembroId, DisciplinaId);
END
GO
-- um deferimento valendo por pessoa e disciplina
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_AFMAproveitamentos_Deferido' AND object_id = OBJECT_ID(N'dbo.AFMAproveitamentos'))
    CREATE UNIQUE INDEX UX_AFMAproveitamentos_Deferido ON dbo.AFMAproveitamentos (MembroId, DisciplinaId) WHERE Decisao = N'DEFERIDO' AND AnuladoEm IS NULL;
GO

-- o requisito de formação (v6.9) que exige uma disciplina da AFM — os mesmos contextos do TrilhaRequisitos
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.AFMDisciplinaRequisitos') AND type = N'U')
BEGIN
    CREATE TABLE dbo.AFMDisciplinaRequisitos (
        RequisitoId     INT IDENTITY CONSTRAINT PK_AFMDisciplinaRequisitos PRIMARY KEY,
        Contexto        NVARCHAR(30) NOT NULL,
        AlvoChave       NVARCHAR(100) NOT NULL CONSTRAINT DF_AFMDisciplinaRequisitos_Alvo DEFAULT N'',
        DisciplinaId    INT NOT NULL CONSTRAINT FK_AFMDisciplinaRequisitos_Disciplina REFERENCES dbo.AFMDisciplinas(DisciplinaId),
        Modo            NVARCHAR(10) NOT NULL CONSTRAINT DF_AFMDisciplinaRequisitos_Modo DEFAULT N'BLOQUEIA',
        Ativo           BIT NOT NULL CONSTRAINT DF_AFMDisciplinaRequisitos_Ativo DEFAULT 1,
        CriadoPor       INT NULL,
        CriadoEm        DATETIME2 NOT NULL CONSTRAINT DF_AFMDisciplinaRequisitos_Em DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_AFMDisciplinaRequisitos UNIQUE (Contexto, AlvoChave, DisciplinaId),
        -- sem HABILITACAO_TREINAMENTO: o treinamento do voluntariado (e a aptidão do ministério com menores, que o reavalia) segue só pelas trilhas
        CONSTRAINT CK_AFMDisciplinaRequisitos_Contexto CHECK (Contexto IN (N'CONSAGRACAO', N'LIDERANCA', N'BATISMO_DISCIPULADO', N'ESCALA_EQUIPE', N'EBD_PROFESSOR')),
        CONSTRAINT CK_AFMDisciplinaRequisitos_Modo CHECK (Modo IN (N'BLOQUEIA', N'ALERTA'))
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.AFMDocumentosAcademicos') AND type = N'U')
BEGIN
    CREATE TABLE dbo.AFMDocumentosAcademicos (
        CertificadoId       INT NOT NULL CONSTRAINT PK_AFMDocumentosAcademicos PRIMARY KEY CONSTRAINT FK_AFMDocumentosAcademicos_Cert REFERENCES dbo.CertificadosEmitidos(CertificadoId),
        CursoMatriculaId    INT NULL CONSTRAINT FK_AFMDocumentosAcademicos_Matricula REFERENCES dbo.AFMCursoMatriculas(CursoMatriculaId),
        Conteudo            NVARCHAR(MAX) NOT NULL,
        ConteudoHash        NVARCHAR(64) NULL   -- sha256 da fotografia: o começo dele vai no título (coberto pelo selo do certificado) e a verificação pública confere
    );
END
GO
-- (revisão, 30/10/2026) as colunas e a regra acrescentadas depois da primeira aplicação na base de teste
IF COL_LENGTH(N'dbo.AFMTurmas', N'PrimeiroEncerramentoEm') IS NULL
    ALTER TABLE dbo.AFMTurmas ADD PrimeiroEncerramentoEm DATE NULL;
GO
IF COL_LENGTH(N'dbo.AFMDocumentosAcademicos', N'ConteudoHash') IS NULL
    ALTER TABLE dbo.AFMDocumentosAcademicos ADD ConteudoHash NVARCHAR(64) NULL;
GO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_AFMDisciplinaRequisitos_Contexto' AND definition LIKE N'%HABILITACAO%')
    ALTER TABLE dbo.AFMDisciplinaRequisitos DROP CONSTRAINT CK_AFMDisciplinaRequisitos_Contexto;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_AFMDisciplinaRequisitos_Contexto')
    ALTER TABLE dbo.AFMDisciplinaRequisitos ADD CONSTRAINT CK_AFMDisciplinaRequisitos_Contexto
        CHECK (Contexto IN (N'CONSAGRACAO', N'LIDERANCA', N'BATISMO_DISCIPULADO', N'ESCALA_EQUIPE', N'EBD_PROFESSOR'));
GO

-- os documentos acadêmicos na mesma tabela verificável do CHM e do diploma de consagração (v8.3)
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_CertificadosEmitidos_Natureza'
           AND definition NOT LIKE N'%DIPLOMA_AFM%')
    ALTER TABLE dbo.CertificadosEmitidos DROP CONSTRAINT CK_CertificadosEmitidos_Natureza;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_CertificadosEmitidos_Natureza')
    ALTER TABLE dbo.CertificadosEmitidos ADD CONSTRAINT CK_CertificadosEmitidos_Natureza
        CHECK (Natureza IS NULL OR Natureza IN (N'CHM', N'DIPLOMA', N'DIPLOMA_AFM', N'HISTORICO', N'DECLARACAO'));
GO
