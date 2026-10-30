-- ============================================================
-- Migração 162 — v8.6: Educação continuada (a reciclagem anual e o exame bienal da AFM). Desenho em docs/plano/fase-8-ministerial-afm.md.
--
-- Base legal: Regimento Art. 68 §3º (o Curso de Reciclagem e Prática Pastoral, anual: frequência mínima e aprovação são critério eliminatório da credencial no
-- exercício seguinte); Art. 70 §3º (o Exame Bienal de Proficiência: reprovado "sob observação" até a repescagem; ausente sem justificativa, suspenso das funções).
--
--   AFMReciclagemEdicoes / AFMReciclagemResultados: a edição de cada ano (data, carga horária, frequência mínima) e o resultado de cada obreiro (horas, resultado).
--   AFMExames / AFMExameResultados: o exame bienal e as repescagens dele, e o resultado de cada pessoa. O sistema não presume ausência: só vale o registrado.
--   NotificacaoRegras: os avisos "antes de vencer" (reciclagem do ano pendente; exame com repescagem devida).
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.AFMReciclagemEdicoes') AND type = N'U')
BEGIN
    CREATE TABLE dbo.AFMReciclagemEdicoes (
        EdicaoId            INT IDENTITY CONSTRAINT PK_AFMReciclagemEdicoes PRIMARY KEY,
        Ano                 INT NOT NULL,
        DataRealizacao      DATE NOT NULL,
        CargaHoraria        DECIMAL(5,1) NOT NULL,
        FrequenciaMinimaPct INT NOT NULL,
        Observacao          NVARCHAR(300) NULL,
        CriadaPor           INT NULL,
        CriadaEm            DATETIME2 NOT NULL CONSTRAINT DF_AFMReciclagemEdicoes_Em DEFAULT SYSUTCDATETIME(),
        AtualizadaPor       INT NULL,
        AtualizadaEm        DATETIME2 NULL,
        CONSTRAINT UQ_AFMReciclagemEdicoes_Ano UNIQUE (Ano),
        CONSTRAINT CK_AFMReciclagemEdicoes_Ano CHECK (Ano BETWEEN 2000 AND 2100 AND YEAR(DataRealizacao) = Ano),
        CONSTRAINT CK_AFMReciclagemEdicoes_Carga CHECK (CargaHoraria > 0 AND CargaHoraria <= 500),
        CONSTRAINT CK_AFMReciclagemEdicoes_Freq CHECK (FrequenciaMinimaPct BETWEEN 1 AND 100)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.AFMReciclagemResultados') AND type = N'U')
BEGIN
    CREATE TABLE dbo.AFMReciclagemResultados (
        EdicaoId        INT NOT NULL REFERENCES dbo.AFMReciclagemEdicoes(EdicaoId),
        MembroId        INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        HorasPresentes  DECIMAL(5,1) NULL,
        Resultado       NVARCHAR(12) NOT NULL,
        RegistradoPor   INT NULL,
        RegistradoEm    DATETIME2 NOT NULL CONSTRAINT DF_AFMReciclagemResultados_Em DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_AFMReciclagemResultados PRIMARY KEY (EdicaoId, MembroId),
        CONSTRAINT CK_AFMReciclagemResultados_Resultado CHECK (Resultado IN (N'APROVADO', N'REPROVADO', N'AUSENTE')),
        CONSTRAINT CK_AFMReciclagemResultados_Horas CHECK (HorasPresentes IS NULL OR (HorasPresentes >= 0 AND HorasPresentes <= 500))
    );
    CREATE INDEX IX_AFMReciclagemResultados_Membro ON dbo.AFMReciclagemResultados (MembroId, EdicaoId);
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.AFMExames') AND type = N'U')
BEGIN
    CREATE TABLE dbo.AFMExames (
        ExameId         INT IDENTITY CONSTRAINT PK_AFMExames PRIMARY KEY,
        Tipo            NVARCHAR(12) NOT NULL,
        DataExame       DATE NOT NULL,
        ExameOrigemId   INT NULL REFERENCES dbo.AFMExames(ExameId),
        Observacao      NVARCHAR(300) NULL,
        CriadoPor       INT NULL,
        CriadoEm        DATETIME2 NOT NULL CONSTRAINT DF_AFMExames_Em DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_AFMExames_Tipo CHECK (Tipo IN (N'BIENAL', N'REPESCAGEM')),
        CONSTRAINT CK_AFMExames_Origem CHECK ((Tipo = N'BIENAL' AND ExameOrigemId IS NULL) OR (Tipo = N'REPESCAGEM' AND ExameOrigemId IS NOT NULL))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_AFMExames_BienalData' AND object_id = OBJECT_ID(N'dbo.AFMExames'))
    CREATE UNIQUE INDEX UX_AFMExames_BienalData ON dbo.AFMExames (DataExame) WHERE Tipo = N'BIENAL';
GO
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.AFMExameResultados') AND type = N'U')
BEGIN
    CREATE TABLE dbo.AFMExameResultados (
        ExameId         INT NOT NULL REFERENCES dbo.AFMExames(ExameId),
        MembroId        INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Resultado       NVARCHAR(20) NOT NULL,
        Justificativa   NVARCHAR(300) NULL,
        RegistradoPor   INT NULL,
        RegistradoEm    DATETIME2 NOT NULL CONSTRAINT DF_AFMExameResultados_Em DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_AFMExameResultados PRIMARY KEY (ExameId, MembroId),
        CONSTRAINT CK_AFMExameResultados_Resultado CHECK (Resultado IN (N'APROVADO', N'REPROVADO', N'AUSENTE_JUSTIFICADO', N'AUSENTE')),
        CONSTRAINT CK_AFMExameResultados_Justificativa CHECK (Resultado <> N'AUSENTE_JUSTIFICADO' OR Justificativa IS NOT NULL)
    );
    CREATE INDEX IX_AFMExameResultados_Membro ON dbo.AFMExameResultados (MembroId, ExameId);
END
GO

-- a justificativa de ausência no exame pode citar saúde: o texto sai depois do prazo (ajustável em Proteção de Dados → Políticas de retenção)
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'AFM — justificativa de ausência no exame')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (N'AFM — justificativa de ausência no exame', N'LGPD art. 6º, III e art. 11: o texto pode citar saúde; sai 2 anos depois do exame (o resultado fica, porque sustenta a situação do obreiro).', 730);
GO

-- os avisos "antes de vencer" (Art. 68 §3º; Art. 70 §3º)
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'AFM_RECICLAGEM_PENDENTE')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'AFM_RECICLAGEM_PENDENTE', N'AFM: a reciclagem do ano ainda não está aprovada — sem ela, a credencial não é renovada em 1º de janeiro', N'REUNIOES', NULL, NULL, 1, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'AFM_EXAME_PENDENTE')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'AFM_EXAME_PENDENTE', N'AFM: exame bienal pendente — repescagem devida (sob observação ou suspenso das funções)', N'REUNIOES', NULL, NULL, 1, 1, 1);
GO
