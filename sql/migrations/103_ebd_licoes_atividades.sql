-- ============================================================
-- Migração 103 — v6.3: EBD — Lições e atividades
--
-- Continua a FASE 6 em cima da v6.2 (migração 102). Três peças:
--
-- 1) Conteúdo da Lição — a v6.2 criou `EbdLicoes` deliberadamente MÍNIMA
--    (congregação/data/aberta-fechada), documentando de propósito que a
--    v6.3 estenderia a MESMA tabela (nunca uma paralela). É o que este
--    ALTER TABLE faz: `Titulo`, `Referencia` (referência bíblica) e
--    `Conteudo` (texto da lição), todos NULL — uma lição continua podendo
--    existir só como marcador de abertura/fechamento de chamada (v6.2), o
--    conteúdo é opcional por cima disso.
--
-- 2) EbdAtividades / EbdAtividadeQuestoes — uma Atividade por Lição
--    (`UNIQUE (LicaoId)` — "cada Lição pode ter uma Atividade", não várias
--    atividades concorrentes por lição) com N questões, cada uma de um dos
--    5 tipos do checklist do v6.3: MULTIPLA_ESCOLHA, VF, ORDENAR,
--    COMPLETAR, CORRESPONDENCIA. `OpcoesJson`/`GabaritoJson` guardam a
--    forma específica de cada tipo (documentada em
--    `shared/ebdAtividades.js`, que é quem monta/valida/corrige essas
--    estruturas) — schema genérico o bastante pra não precisar de uma
--    tabela por tipo de questão, mesmo espírito de `RegrasConquista`
--    (motor genérico por tipo) já desenhado para o v6.4.
--
-- 3) EbdRespostasAlunos — resposta de UM aluno pra UMA questão
--    (`UNIQUE (QuestaoId, AlunoId)`, upsert — mesmo padrão de
--    "um registro por aluno por lição" da v6.2/`EbdChamadas`, corrigir uma
--    resposta lançada errada é rotina). `Correta` é `BIT NULL`:
--    `NULL` = ainda não corrigida, `0`/`1` = resultado (auto-corrigido no
--    lançamento pelas 5 regras de `shared/ebdAtividades.js::corrigirQuestao`
--    — MULTIPLA_ESCOLHA/VF/ORDENAR/CORRESPONDENCIA comparam contra o
--    gabarito estruturado; COMPLETAR usa correspondência normalizada
--    (sem acento/maiúscula/espaço duplicado) contra uma LISTA de variantes
--    aceitas no gabarito — ver preâmbulo do shared pra a decisão completa)
--    e sempre pode ser SOBRESCRITA manualmente por quem gerencia a
--    atividade (`CorrigidoPorMembroId`/`CorrigidoEm`), pois nenhuma
--    correção automática de texto livre é 100% confiável.
--
--    Decisão de escopo: como neste sistema o Aluno (EbdAlunos/v6.1) NÃO
--    tem login próprio — é a Turma/Professor quem lança dados em nome do
--    aluno, mesmo modelo já usado pela chamada (v6.2, `EbdChamadas`) — é o
--    professor (ou quem tem `ebd_gestao`) que registra a resposta do aluno,
--    não o próprio aluno logando e respondendo. Ver
--    `api/GestaoEbdAtividades/index.js` para o detalhe de permissão.
--
--    Decisão deliberada: NÃO existe trava de "Lição fechada" bloqueando
--    a Atividade (autoria de questão ou lançamento de resposta) — diferente
--    da chamada (v6.2), onde fechar a lição impede novo lançamento de
--    presença. Aqui, fechar a lição só encerra a JANELA DE CHAMADA
--    daquele domingo; revisão/estudo da atividade (responder, corrigir,
--    reforçar depois) faz sentido continuar mesmo com a lição já fechada
--    — é dever de casa, não frequência.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.EbdLicoes') AND name = 'Titulo')
    ALTER TABLE dbo.EbdLicoes ADD Titulo NVARCHAR(200) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.EbdLicoes') AND name = 'Referencia')
    ALTER TABLE dbo.EbdLicoes ADD Referencia NVARCHAR(200) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.EbdLicoes') AND name = 'Conteudo')
    ALTER TABLE dbo.EbdLicoes ADD Conteudo NVARCHAR(MAX) NULL;
GO

IF OBJECT_ID(N'dbo.EbdAtividades', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EbdAtividades (
        AtividadeId         INT IDENTITY PRIMARY KEY,
        LicaoId             INT NOT NULL REFERENCES dbo.EbdLicoes(LicaoId),
        Titulo              NVARCHAR(200) NULL,
        CriadoPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        AtualizadoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_EbdAtividades_Licao UNIQUE (LicaoId)
    );
END
GO

IF OBJECT_ID(N'dbo.EbdAtividadeQuestoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EbdAtividadeQuestoes (
        QuestaoId           INT IDENTITY PRIMARY KEY,
        AtividadeId         INT NOT NULL REFERENCES dbo.EbdAtividades(AtividadeId),
        Tipo                NVARCHAR(20) NOT NULL CHECK (Tipo IN ('MULTIPLA_ESCOLHA', 'VF', 'ORDENAR', 'COMPLETAR', 'CORRESPONDENCIA')),
        Enunciado           NVARCHAR(MAX) NOT NULL,
        OpcoesJson          NVARCHAR(MAX) NULL,
        GabaritoJson        NVARCHAR(MAX) NOT NULL,
        Ordem               INT NOT NULL DEFAULT 0,
        CriadoPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.EbdRespostasAlunos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EbdRespostasAlunos (
        RespostaId          INT IDENTITY PRIMARY KEY,
        QuestaoId           INT NOT NULL REFERENCES dbo.EbdAtividadeQuestoes(QuestaoId),
        AlunoId             INT NOT NULL REFERENCES dbo.EbdAlunos(AlunoId),
        RespostaJson        NVARCHAR(MAX) NOT NULL,
        Correta             BIT NULL,
        RegistradoPorMembroId INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CorrigidoPorMembroId INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CorrigidoEm         DATETIME2 NULL,
        AtualizadoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_EbdRespostasAlunos_Questao_Aluno UNIQUE (QuestaoId, AlunoId)
    );
END
GO
