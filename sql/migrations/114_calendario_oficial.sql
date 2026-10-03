-- ============================================================
-- Migração 114 — v7.2: Calendário Oficial e Agenda Unificada
--
-- Regimento Art. 79 (Agenda Litúrgica Oficial), 81 (Santa Ceia), 147 (CLI),
-- 154 (Soberania do Calendário, precedência hierárquica) e 154-A (Ciclo Mensal
-- de Governança). Peças:
--
-- 1) TIPOS DE EVENTO (CalendarioTiposEvento): o catálogo do Art. 154 §1º, com o
--    NÍVEL de prevalência de cada tipo (1 Estratégico-Institucional ... 5 Social
--    e Privado), onde cada um pode acontecer (campo, áreas, congregação), se
--    fecha as congregações, se conta como "festividade" na trava de simultaneidade
--    por Área e a antecedência mínima de convocação (CLI extraordinária: 48 h).
--    Semeado do Regimento, editável (configurabilidade total, seção 2.1).
--
-- 2) ANO DO CALENDÁRIO (CalendarioAnos): PLANEJAMENTO -> CONSOLIDADO -> HOMOLOGADO,
--    com o prazo de propostas (15/jan, Art. 154 §2º, I) e a ata da CLI que
--    transforma o rascunho em Documento Oficial (§2º, III).
--
-- 3) EVENTOS (CalendarioEventos): a proposta, a decisão e a homologação num lugar
--    só. `PropostaEm` é o carimbo do "Direito Adquirido Temporal" (§2º, IV): serve
--    de desempate entre eventos do mesmo nível e é IMUTÁVEL — um gatilho recusa
--    qualquer UPDATE nele. Evento de regra (Ceia, CLI, NIF, CEI do ciclo mensal)
--    nasce com `RegraChave` única (índice filtrado, a lição da Trava 6-A): gerar o
--    ciclo duas vezes não duplica, e um evento cancelado não ressuscita.
--
-- 4) AGENDA LITÚRGICA (AgendaLiturgicaRegras): a grade semanal do Art. 79 como
--    REGRAS (dia, escopo Sede/Congregações, ocorrência no mês), não como
--    datas — o site passa a ler daqui, em vez da coleção `programacao` do Directus.
--
-- 5) PRESENÇA DE DIRIGENTE na Ceia Geral (Art. 81 §1º, III, "b"): o fato
--    registrável que pode ensejar apuração ética.
--
-- 6) Permissões `calendario_proposta`, `calendario_secretaria` e
--    `calendario_homologacao` (nunca concedidas a papel nenhum, mesmo padrão de
--    psc_gestao/trilhas_gestao) e cinco regras no motor de notificações (vB.2).
--
-- Idempotente: seguro para reexecutar sem apagar dados. Cada ALTER em batch
-- próprio (GO); o gatilho é criado por EXEC (CREATE TRIGGER exige batch próprio).
-- ============================================================

-- ---- 1) Tipos de evento ----

IF OBJECT_ID(N'dbo.CalendarioTiposEvento', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CalendarioTiposEvento (
        TipoId                  INT IDENTITY PRIMARY KEY,
        Codigo                  NVARCHAR(50) NOT NULL CONSTRAINT UQ_CalendarioTiposEvento_Codigo UNIQUE,
        Nome                    NVARCHAR(150) NOT NULL,
        Nivel                   TINYINT NOT NULL CONSTRAINT CK_CalendarioTiposEvento_Nivel CHECK (Nivel BETWEEN 1 AND 5),
        AbrangenciasPermitidas  NVARCHAR(40) NOT NULL CONSTRAINT DF_CalendarioTiposEvento_Abr DEFAULT 'CONGREGACAO',   -- lista: CAMPO,AREAS,CONGREGACAO
        FechaCongregacoes       BIT NOT NULL CONSTRAINT DF_CalendarioTiposEvento_Fecha DEFAULT 0,       -- Ceia Geral e Congressos: portões fechados
        Festividade             BIT NOT NULL CONSTRAINT DF_CalendarioTiposEvento_Festa DEFAULT 0,       -- entra na trava "duas festividades Nível 4 na mesma Área no mesmo fim de semana"
        PublicoNoSite           BIT NOT NULL CONSTRAINT DF_CalendarioTiposEvento_Publico DEFAULT 0,     -- padrão do tipo; cada evento pode divergir
        AntecedenciaMinimaHoras INT NULL CONSTRAINT CK_CalendarioTiposEvento_Antec CHECK (AntecedenciaMinimaHoras > 0),   -- CLI extraordinária: 48h (Art. 147 §2º)
        RegistraPresencaDirigente BIT NOT NULL CONSTRAINT DF_CalendarioTiposEvento_Presenca DEFAULT 0,  -- Ceia Geral (Art. 81 §1º, III, "b")
        ArtigoRef               NVARCHAR(80) NULL,
        Ordem                   INT NOT NULL CONSTRAINT DF_CalendarioTiposEvento_Ordem DEFAULT 0,
        Ativo                   BIT NOT NULL CONSTRAINT DF_CalendarioTiposEvento_Ativo DEFAULT 1
    );
END
GO

INSERT INTO dbo.CalendarioTiposEvento (Codigo, Nome, Nivel, AbrangenciasPermitidas, FechaCongregacoes, Festividade, PublicoNoSite, AntecedenciaMinimaHoras, RegistraPresencaDirigente, ArtigoRef, Ordem)
SELECT v.Codigo, v.Nome, v.Nivel, v.Abr, v.Fecha, v.Festa, v.Publico, v.Antec, v.Presenca, v.Art, v.Ordem FROM (VALUES
    -- Nível 1 — Estratégico-Institucional: nenhuma outra atividade pode ocorrer no Campo
    (N'SANTA_CEIA_LOCAL',        N'Santa Ceia — Ceia Local (último domingo do mês)',                1, N'CAMPO', 0, 0, 1, NULL, 0, N'Art. 81 §1º, I; Art. 154 §1º, I, a', 10),
    (N'SANTA_CEIA_GERAL',        N'Santa Ceia Geral (maio e outubro) — congregações fechadas',      1, N'CAMPO', 1, 0, 1, NULL, 1, N'Art. 81 §1º, II-III; Art. 154 §1º, I, a', 11),
    (N'BATISMO',                 N'Batismo nas Águas',                                              1, N'CAMPO', 0, 0, 1, NULL, 0, N'Art. 80 §3º; Art. 154 §1º, I, a', 12),
    (N'ASSEMBLEIA_GERAL',        N'Assembleia Geral',                                               1, N'CAMPO', 0, 0, 0, NULL, 0, N'Art. 154 §1º, I, b', 13),
    (N'REUNIAO_CLI',             N'Reunião ordinária da CLI (último domingo, 14h-17h)',             1, N'CAMPO', 0, 0, 0, NULL, 0, N'Art. 154-A, IV; Art. 154 §1º, I, b', 14),
    (N'REUNIAO_CLI_EXTRAORDINARIA', N'Reunião extraordinária da CLI (convocação com 48 h)',         1, N'CAMPO', 0, 0, 0, 48,   0, N'Art. 147 §2º', 15),
    (N'CONGRESSO_UNIFICADO_DEPARTAMENTOS', N'Congresso Unificado de Departamentos',                 1, N'CAMPO', 1, 0, 1, NULL, 0, N'Art. 154 §1º, I, c, 1; §4º', 16),
    (N'CONGRESSO_UNIFICADO_SECRETARIAS',   N'Congresso Unificado de Secretarias',                   1, N'CAMPO', 1, 0, 1, NULL, 0, N'Art. 154 §1º, I, c, 2; §4º', 17),
    (N'AGENDA_EXTERNA_ESTRATEGICA', N'Agenda externa estratégica (Cidade / Convenção Estadual)',    1, N'CAMPO', 0, 0, 1, NULL, 0, N'Art. 154 §1º, I, d', 18),
    -- Nível 2 — Geral-Focalizado
    (N'CRUZADA_GERAL',           N'Cruzada geral regionalizada',                                    2, N'CAMPO,AREAS', 0, 0, 1, NULL, 0, N'Art. 154 §1º, II, a', 20),
    (N'CAPACITACAO_LIDERANCA',   N'Capacitação de liderança',                                       2, N'CAMPO,AREAS', 0, 0, 0, NULL, 0, N'Art. 154 §1º, II, b', 21),
    (N'VIGILIA_GERAL',           N'Vigília geral de oração',                                        2, N'CAMPO,AREAS', 0, 0, 1, NULL, 0, N'Art. 154 §1º, II, c', 22),
    (N'REUNIAO_ORGAO_MENSAL',    N'Reunião ordinária de órgão (ciclo mensal de governança)',        2, N'CONGREGACAO', 0, 0, 0, NULL, 0, N'Art. 154-A, I-II', 23),
    -- Nível 3 — Regional-Intermediário
    (N'CRUZADA_AREA',            N'Cruzada de Área / Setor',                                        3, N'AREAS', 0, 0, 1, NULL, 0, N'Art. 154 §1º, III, b, 1', 30),
    (N'PRE_CONGRESSO_REGIONAL',  N'Pré-Congresso regional',                                         3, N'AREAS', 0, 0, 1, NULL, 0, N'Art. 154 §1º, III, b, 2', 31),
    (N'INTERCAMBIO_PULPITO',     N'Intercâmbio de púlpito',                                         3, N'AREAS', 0, 0, 1, NULL, 0, N'Art. 154 §1º, III, b, 3', 32),
    (N'REUNIAO_ADMINISTRATIVA_AREA', N'Reunião administrativa de Área',                             3, N'AREAS', 0, 0, 0, NULL, 0, N'Art. 154 §1º, III, b, 4', 33),
    -- Nível 4 — Local-Operacional
    (N'ANIVERSARIO_CONGREGACAO', N'Aniversário da Congregação',                                     4, N'CONGREGACAO', 0, 1, 1, NULL, 0, N'Art. 154 §1º, IV, a, 1', 40),
    (N'ANIVERSARIO_CONJUNTO_LOCAL', N'Aniversário de conjunto local',                               4, N'CONGREGACAO', 0, 1, 1, NULL, 0, N'Art. 154 §1º, IV, a, 2', 41),
    (N'CAMPANHA_ORACAO',         N'Campanha de oração / Cerco de Jericó',                           4, N'CONGREGACAO', 0, 0, 1, NULL, 0, N'Art. 154 §1º, IV, a, 3', 42),
    (N'CULTO_ENSINO_FAMILIA',    N'Culto de ensino / de família',                                   4, N'CONGREGACAO', 0, 0, 1, NULL, 0, N'Art. 154 §1º, IV, a, 4', 43),
    -- Nível 5 — Social e Privado: os primeiros a cair em choque de agenda
    (N'CASAMENTO_BODAS',         N'Casamento / bodas (uso do templo por terceiros)',                5, N'CONGREGACAO', 0, 0, 0, NULL, 0, N'Art. 154 §1º, V, a, 1', 50),
    (N'ANIVERSARIO_15_ANOS',     N'Aniversário de 15 anos (uso do templo por terceiros)',           5, N'CONGREGACAO', 0, 0, 0, NULL, 0, N'Art. 154 §1º, V, a, 2', 51),
    (N'FORMATURA',               N'Formatura (uso do templo por terceiros)',                        5, N'CONGREGACAO', 0, 0, 0, NULL, 0, N'Art. 154 §1º, V, a, 3', 52),
    (N'VELORIO',                 N'Velório (salvo excepcionalidade humanitária)',                   5, N'CONGREGACAO', 0, 0, 0, NULL, 0, N'Art. 154 §1º, V, a, 4', 53)
) AS v(Codigo, Nome, Nivel, Abr, Fecha, Festa, Publico, Antec, Presenca, Art, Ordem)
WHERE NOT EXISTS (SELECT 1 FROM dbo.CalendarioTiposEvento t WHERE t.Codigo = v.Codigo);
GO

-- Pares de tipos Nível 1 que se complementam no MESMO dia por desenho do Regimento
-- (Art. 81 §1º, I, b: a CLI se reúne à tarde e a Ceia é à noite).
IF OBJECT_ID(N'dbo.CalendarioTiposCompativeis', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CalendarioTiposCompativeis (
        TipoId          INT NOT NULL REFERENCES dbo.CalendarioTiposEvento(TipoId),
        CompativelId    INT NOT NULL REFERENCES dbo.CalendarioTiposEvento(TipoId),
        CONSTRAINT PK_CalendarioTiposCompativeis PRIMARY KEY (TipoId, CompativelId),
        CONSTRAINT CK_CalendarioTiposCompativeis_Distintos CHECK (TipoId <> CompativelId)
    );
END
GO

INSERT INTO dbo.CalendarioTiposCompativeis (TipoId, CompativelId)
SELECT a.TipoId, b.TipoId FROM (VALUES
    (N'REUNIAO_CLI', N'SANTA_CEIA_LOCAL'), (N'SANTA_CEIA_LOCAL', N'REUNIAO_CLI'),
    (N'REUNIAO_CLI', N'SANTA_CEIA_GERAL'), (N'SANTA_CEIA_GERAL', N'REUNIAO_CLI')
) AS p(De, Para)
JOIN dbo.CalendarioTiposEvento a ON a.Codigo = p.De
JOIN dbo.CalendarioTiposEvento b ON b.Codigo = p.Para
WHERE NOT EXISTS (SELECT 1 FROM dbo.CalendarioTiposCompativeis x WHERE x.TipoId = a.TipoId AND x.CompativelId = b.TipoId);
GO

-- ---- 2) Ano do calendário ----

IF OBJECT_ID(N'dbo.CalendarioAnos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CalendarioAnos (
        Ano                     SMALLINT NOT NULL CONSTRAINT PK_CalendarioAnos PRIMARY KEY CONSTRAINT CK_CalendarioAnos_Ano CHECK (Ano BETWEEN 2000 AND 2200),
        Status                  NVARCHAR(12) NOT NULL CONSTRAINT DF_CalendarioAnos_Status DEFAULT 'PLANEJAMENTO'
                                    CONSTRAINT CK_CalendarioAnos_Status CHECK (Status IN ('PLANEJAMENTO', 'CONSOLIDADO', 'HOMOLOGADO')),
        PrazoPropostas          DATE NOT NULL,                                      -- 15/jan do ano (Art. 154 §2º, I)
        CicloGeradoEm           DATETIME2 NULL,
        ConsolidadoPorMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ConsolidadoEm           DATETIME2 NULL,
        HomologadoPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        HomologadoEm            DATETIME2 NULL,
        AtaReferencia           NVARCHAR(150) NULL,                                 -- a ata da CLI que o transformou em Documento Oficial
        CriadoEm                DATETIME2 NOT NULL CONSTRAINT DF_CalendarioAnos_CriadoEm DEFAULT SYSUTCDATETIME()
    );
END
GO

-- ---- 3) Eventos ----

IF OBJECT_ID(N'dbo.CalendarioEventos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CalendarioEventos (
        EventoId                INT IDENTITY PRIMARY KEY,
        Ano                     SMALLINT NOT NULL REFERENCES dbo.CalendarioAnos(Ano),
        TipoId                  INT NOT NULL REFERENCES dbo.CalendarioTiposEvento(TipoId),
        Nivel                   TINYINT NOT NULL CONSTRAINT CK_CalendarioEventos_Nivel CHECK (Nivel BETWEEN 1 AND 5),   -- foto do nível do tipo no dia da proposta
        Titulo                  NVARCHAR(200) NOT NULL,
        Descricao               NVARCHAR(1000) NULL,
        DataInicio              DATE NOT NULL,
        DataFim                 DATE NOT NULL,
        HoraInicio              TIME(0) NULL,
        HoraFim                 TIME(0) NULL,
        Abrangencia             NVARCHAR(12) NOT NULL CONSTRAINT CK_CalendarioEventos_Abrangencia CHECK (Abrangencia IN ('CAMPO', 'AREAS', 'CONGREGACAO')),
        CongregacaoId           INT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        Local                   NVARCHAR(200) NULL,
        OrgaoId                 INT NULL REFERENCES dbo.Orgaos(OrgaoId),
        DepartamentoId          INT NULL REFERENCES dbo.Departamentos(DepartamentoId),
        Origem                  NVARCHAR(10) NOT NULL CONSTRAINT DF_CalendarioEventos_Origem DEFAULT 'PROPOSTA'
                                    CONSTRAINT CK_CalendarioEventos_Origem CHECK (Origem IN ('PROPOSTA', 'REGRA')),
        RegraChave              NVARCHAR(60) NULL,
        Status                  NVARCHAR(12) NOT NULL CONSTRAINT DF_CalendarioEventos_Status DEFAULT 'PROPOSTO'
                                    CONSTRAINT CK_CalendarioEventos_Status CHECK (Status IN ('PROPOSTO', 'DEFERIDO', 'HOMOLOGADO', 'INDEFERIDO', 'ABSORVIDO', 'CANCELADO')),
        Tardia                  BIT NOT NULL CONSTRAINT DF_CalendarioEventos_Tardia DEFAULT 0,                    -- chegou depois do prazo de 15/jan
        RemarcacaoDeEventoId    INT NULL REFERENCES dbo.CalendarioEventos(EventoId),
        MotivoIndeferimento     NVARCHAR(30) NULL CONSTRAINT CK_CalendarioEventos_Motivo CHECK (MotivoIndeferimento IN
                                    ('CONFLITO_HIERARQUIA', 'DIREITO_ADQUIRIDO', 'TRAVA_AREA', 'ESGOTAMENTO_PAUTA', 'ABSORVIDO_NIVEL_1', 'DECISAO_SECRETARIA', 'DECISAO_CLI')),
        DetalheDecisao          NVARCHAR(600) NULL,
        PrevalecidoPorEventoId  INT NULL REFERENCES dbo.CalendarioEventos(EventoId),
        PropostoPorMembroId     INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        PropostaEm              DATETIME2(3) NOT NULL CONSTRAINT DF_CalendarioEventos_PropostaEm DEFAULT SYSUTCDATETIME(),   -- IMUTÁVEL (gatilho abaixo)
        DecididoPorMembroId     INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DecididoEm              DATETIME2 NULL,
        HomologadoEm            DATETIME2 NULL,
        CanceladoPorMembroId    INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CanceladoEm             DATETIME2 NULL,
        MotivoCancelamento      NVARCHAR(500) NULL,
        SlugSite                NVARCHAR(150) NULL,                                 -- evento com inscrição/página no site (Directus)
        PublicoNoSite           BIT NOT NULL CONSTRAINT DF_CalendarioEventos_Publico DEFAULT 0,
        AtualizadoEm            DATETIME2 NOT NULL CONSTRAINT DF_CalendarioEventos_AtualizadoEm DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_CalendarioEventos_Datas CHECK (DataFim >= DataInicio),
        CONSTRAINT CK_CalendarioEventos_Horas CHECK (HoraFim IS NULL OR HoraInicio IS NULL OR HoraFim > HoraInicio)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_CalendarioEventos_RegraChave' AND object_id = OBJECT_ID('dbo.CalendarioEventos'))
    CREATE UNIQUE INDEX UX_CalendarioEventos_RegraChave ON dbo.CalendarioEventos (RegraChave) WHERE RegraChave IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CalendarioEventos_Ano_Data' AND object_id = OBJECT_ID('dbo.CalendarioEventos'))
    CREATE INDEX IX_CalendarioEventos_Ano_Data ON dbo.CalendarioEventos (Ano, DataInicio, DataFim) INCLUDE (Status, Nivel);
GO

-- O carimbo da proposta é a prova do "Direito Adquirido Temporal": nenhum UPDATE o altera.
IF OBJECT_ID(N'dbo.TR_CalendarioEventos_PropostaImutavel', N'TR') IS NULL
    EXEC(N'CREATE TRIGGER dbo.TR_CalendarioEventos_PropostaImutavel ON dbo.CalendarioEventos AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF UPDATE(PropostaEm) AND EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.EventoId = i.EventoId WHERE i.PropostaEm <> d.PropostaEm)
    BEGIN
        RAISERROR(N''A data/hora da proposta é imutável (Direito Adquirido Temporal, Regimento Art. 154 §2º, IV).'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

IF OBJECT_ID(N'dbo.CalendarioEventoAreas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CalendarioEventoAreas (
        EventoId    INT NOT NULL REFERENCES dbo.CalendarioEventos(EventoId),
        AreaId      INT NOT NULL REFERENCES dbo.Areas(AreaId),
        CONSTRAINT PK_CalendarioEventoAreas PRIMARY KEY (EventoId, AreaId)
    );
END
GO

-- ---- 4) Agenda litúrgica oficial (Art. 79) ----

IF OBJECT_ID(N'dbo.AgendaLiturgicaRegras', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AgendaLiturgicaRegras (
        RegraId             INT IDENTITY PRIMARY KEY,
        Dia                 NVARCHAR(20) NOT NULL CONSTRAINT CK_AgendaLiturgicaRegras_Dia CHECK (Dia IN
                                ('segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo_manha', 'domingo_noite')),
        Escopo              NVARCHAR(14) NOT NULL CONSTRAINT CK_AgendaLiturgicaRegras_Escopo CHECK (Escopo IN ('SEDE', 'CONGREGACOES', 'TODAS')),
        Ocorrencia          NVARCHAR(10) NULL CONSTRAINT CK_AgendaLiturgicaRegras_Ocorrencia CHECK (Ocorrencia IN ('1', '2', '3', '4_se_5', 'ultimo')),   -- NULL = toda semana
        Titulo              NVARCHAR(200) NOT NULL,
        HoraInicio          NVARCHAR(5) NULL CONSTRAINT CK_AgendaLiturgicaRegras_Hora CHECK (HoraInicio IS NULL OR HoraInicio LIKE '[0-2][0-9]:[0-5][0-9]'),
        Tipo                NVARCHAR(14) NOT NULL CONSTRAINT DF_AgendaLiturgicaRegras_Tipo DEFAULT 'CULTO'
                                CONSTRAINT CK_AgendaLiturgicaRegras_Tipo CHECK (Tipo IN ('CULTO', 'EBD', 'DESCANSO', 'FECHADA', 'NOITE_LIVRE', 'CEIA')),
        DepartamentoSigla   NVARCHAR(30) NULL,
        ArtigoRef           NVARCHAR(60) NULL,
        ResolucaoReferencia NVARCHAR(150) NULL,         -- a autorização da CLI para a mudança (Art. 79, parágrafo único)
        Ordem               INT NOT NULL CONSTRAINT DF_AgendaLiturgicaRegras_Ordem DEFAULT 0,
        Ativo               BIT NOT NULL CONSTRAINT DF_AgendaLiturgicaRegras_Ativo DEFAULT 1,
        AtualizadoEm        DATETIME2 NOT NULL CONSTRAINT DF_AgendaLiturgicaRegras_AtualizadoEm DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Semente: Art. 79 do Regimento Interno 2026. Sem horário inventado — o Regimento
-- não fixa hora de culto (só a reunião da CLI, 14h-17h); a CLI preenche.
IF NOT EXISTS (SELECT 1 FROM dbo.AgendaLiturgicaRegras)
INSERT INTO dbo.AgendaLiturgicaRegras (Dia, Escopo, Ocorrencia, Titulo, Tipo, DepartamentoSigla, ArtigoRef, Ordem)
VALUES
    ('segunda',       'TODAS',        NULL,     N'Descanso pastoral e ministerial (sem cultos oficiais)',                        'DESCANSO',    NULL,         N'Art. 79, I, a', 1),
    ('terca',         'SEDE',         NULL,     N'Culto de Doutrina Geral',                                                       'CULTO',       NULL,         N'Art. 79, I, b', 2),
    ('terca',         'CONGREGACOES', NULL,     N'Congregações fechadas — membresia e obreiros vão à Sede ou acompanham o ensino geral', 'FECHADA', NULL,       N'Art. 79, I, b', 3),
    ('quarta',        'SEDE',         NULL,     N'Noite livre',                                                                   'NOITE_LIVRE', NULL,         N'Art. 79, I, c', 4),
    ('quarta',        'CONGREGACOES', NULL,     N'Culto sob direção da USADESPA Local',                                           'CULTO',       'USADESPA',   N'Art. 79, I, c', 5),
    ('quarta',        'CONGREGACOES', 'ultimo', N'Culto sob direção da UHADESPA (última quarta-feira do mês, onde houver o departamento)', 'CULTO', 'UHADESPA', N'Art. 79, I, c, 3', 6),
    ('quinta',        'SEDE',         NULL,     N'Culto sob direção da USADESPA Local',                                           'CULTO',       'USADESPA',   N'Art. 79, I, d', 7),
    ('quinta',        'SEDE',         'ultimo', N'Culto sob direção da UHADESPA (última quinta-feira do mês)',                    'CULTO',       'UHADESPA',   N'Art. 79, I, d, 3', 8),
    ('quinta',        'CONGREGACOES', NULL,     N'Noite livre',                                                                   'NOITE_LIVRE', NULL,         N'Art. 79, I, d', 9),
    ('sexta',         'SEDE',         NULL,     N'Noite livre',                                                                   'NOITE_LIVRE', NULL,         N'Art. 79, I, e', 10),
    ('sexta',         'CONGREGACOES', NULL,     N'Culto de Doutrina Local',                                                       'CULTO',       NULL,         N'Art. 79, I, e', 11),
    ('sabado',        'TODAS',        NULL,     N'Culto da UMADESPA (todo o campo, simultaneamente)',                             'CULTO',       'UMADESPA',   N'Art. 79, I, f', 12),
    ('domingo_manha', 'TODAS',        NULL,     N'Escola Bíblica Dominical (todo o campo, simultaneamente)',                      'EBD',         NULL,         N'Art. 79, I, g', 13),
    ('domingo_noite', 'SEDE',         '1',      N'Culto da Ação da Fé',                                                           'CULTO',       'ACAO_DA_FE', N'Art. 79, II, a', 14),
    ('domingo_noite', 'CONGREGACOES', '1',      N'Culto de Missões',                                                              'CULTO',       'SEMIADESPA', N'Art. 79, II, a', 15),
    ('domingo_noite', 'SEDE',         '2',      N'Culto de Missões',                                                              'CULTO',       'SEMIADESPA', N'Art. 79, II, b', 16),
    ('domingo_noite', 'CONGREGACOES', '2',      N'Culto da Ação da Fé',                                                           'CULTO',       'ACAO_DA_FE', N'Art. 79, II, b', 17),
    ('domingo_noite', 'TODAS',        '3',      N'Culto da Família (simultâneo na Sede e em todas as filiais)',                   'CULTO',       NULL,         N'Art. 79, II, c', 18),
    ('domingo_noite', 'SEDE',         '4_se_5', N'Culto Fraternal Local',                                                         'CULTO',       NULL,         N'Art. 79, II, d', 19),
    ('domingo_noite', 'CONGREGACOES', '4_se_5', N'Culto de Tema Livre',                                                           'CULTO',       NULL,         N'Art. 79, II, d', 20),
    ('domingo_noite', 'TODAS',        'ultimo', N'Santa Ceia do Senhor, à noite (a reunião da CLI é à tarde, das 14h às 17h)',    'CEIA',        NULL,         N'Art. 79, III; Art. 81 §1º', 21);
GO

-- ---- 5) Presença do dirigente na Ceia Geral ----

IF OBJECT_ID(N'dbo.CalendarioPresencasDirigente', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CalendarioPresencasDirigente (
        PresencaId          INT IDENTITY PRIMARY KEY,
        EventoId            INT NOT NULL REFERENCES dbo.CalendarioEventos(EventoId),
        CongregacaoId       INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        Situacao            NVARCHAR(24) NOT NULL CONSTRAINT CK_CalendarioPresencasDirigente_Situacao CHECK (Situacao IN ('PRESENTE', 'AUSENTE_JUSTIFICADA', 'AUSENTE_INJUSTIFICADA')),
        Justificativa       NVARCHAR(500) NULL,
        RegistradoPorMembroId INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm        DATETIME2 NOT NULL CONSTRAINT DF_CalendarioPresencasDirigente_Em DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_CalendarioPresencasDirigente UNIQUE (EventoId, CongregacaoId)
    );
END
GO

-- ---- 6) Permissões e avisos ----

IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'calendario_proposta')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('calendario_proposta', N'Calendário — propor datas de eventos no escopo (líderes, supervisores, dirigentes, coordenadores)');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'calendario_secretaria')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('calendario_secretaria', N'Calendário — Secretaria Geral: ciclo mensal, consolidação, deferimento e eventos de Nível 1');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'calendario_homologacao')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('calendario_homologacao', N'Calendário — CLI: homologação do ano, agenda litúrgica, tipos e decisões excepcionais');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CALENDARIO_PRAZO_PROPOSTAS')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'CALENDARIO_PRAZO_PROPOSTAS', N'Prazo das propostas do calendário se aproxima (15 de janeiro)', N'CALENDARIO', N'calendario_proposta', NULL, 1);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CALENDARIO_PRAZO_URGENTE')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'CALENDARIO_PRAZO_URGENTE', N'Faltam poucos dias para o prazo das propostas do calendário', N'CALENDARIO', N'calendario_proposta', NULL, 1);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CALENDARIO_PROPOSTA_RECUSADA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'CALENDARIO_PROPOSTA_RECUSADA', N'Sua proposta de data não foi aceita', N'CALENDARIO', NULL, NULL, 1);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CALENDARIO_PARA_CONSOLIDAR')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'CALENDARIO_PARA_CONSOLIDAR', N'Prazo das propostas encerrado — o calendário aguarda a consolidação', N'CALENDARIO', N'calendario_secretaria', NULL, 1);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CALENDARIO_PARA_HOMOLOGAR')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'CALENDARIO_PARA_HOMOLOGAR', N'Calendário consolidado aguardando a homologação da CLI', N'CALENDARIO', N'calendario_homologacao', NULL, 1);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Calendário oficial e agenda litúrgica')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (
        N'Calendário oficial e agenda litúrgica',
        N'Registro institucional (Regimento Art. 79 e 154), publicado no site; sem dado pessoal além de quem propôs e decidiu. Retenção indeterminada: o carimbo de cada proposta é a prova do Direito Adquirido Temporal.',
        NULL
    );
GO
