-- ============================================================
-- Migração 111 — v6.10: EBD — Sala de aula assistida e material
--
-- Fecha a FASE 6. Quatro peças, todas em cima do que a FASE 6 já tem:
--
-- 1) CHAMADA OFFLINE (EbdChamadas). O professor marca a chamada no celular
--    sem sinal; o aparelho guarda numa fila e envia quando a conexão volta
--    (POST /api/ebd-chamada/sincronizar). Presença de aluno já tem chave
--    natural (LicaoId, AlunoId) — reenviar a mesma marcação não duplica.
--    Visitante não tem: cada visita é uma linha nova. Para o reenvio da fila
--    (rede que cai no meio da resposta) não criar o mesmo visitante duas
--    vezes, a linha ganha `ChaveCliente` (gerada no aparelho), com índice
--    único FILTRADO (`WHERE ChaveCliente IS NOT NULL`) — a mesma lição da
--    Trava 6-A: UNIQUE comum no SQL Server trata NULL como igual a NULL, e
--    toda linha lançada online tem ChaveCliente NULL.
--    `MarcadoOfflineEm` guarda a hora em que o professor marcou no aparelho
--    (não a hora em que chegou ao servidor) — é o que decide conflito com
--    uma correção feita no servidor depois.
--
-- 2) PLANO DE AULA E MATERIAL (EbdPlanosAula, EbdPlanoMateriais). Publicado
--    pelo Superintendente, visível ao professor no mesmo lugar da chamada.
--    NÃO usa EbdLicoes: a lição nasce por congregação quando alguém abre a
--    chamada, e o plano precisa existir ANTES do domingo — e, na prática da
--    revista CPAD, é o mesmo para o campo inteiro. Por isso o plano é por
--    DATA, com alcance opcional: CongregacaoId NULL = todas as congregações
--    (exige escopo global para criar), FaixaEtaria NULL = todas as classes.
--    Material é LINK (https), não upload: a revista e os vídeos já moram em
--    algum lugar (site da CPAD, Drive, YouTube) — guardar arquivo aqui seria
--    custo de armazenamento sem ganho.
--
-- 3) ALERTA DE AUSÊNCIA (EbdAlertasAusencia). O detector da vB.2
--    (EBD_ALUNO_AUSENTE) acha quem não vem há N domingos seguidos e avisa os
--    PROFESSORES ATIVOS DA TURMA (não quem tem uma permissão — por isso
--    PermissaoAlvo NULL). Cada sequência de faltas vira uma linha aqui, com
--    chave (AlunoId, LicaoInicioId): é essa linha que dá à notificação uma
--    chave de deduplicação estável — a mesma sequência avisa uma vez só, e
--    uma nova sequência (o aluno voltou e sumiu de novo) avisa de novo.
--    N vem do catálogo de Prazos (sigla EBD_AUSENCIA_DOMINGOS, editável pela
--    tela de Catálogos), padrão 3. ATENÇÃO: nesta linha de Prazos a coluna
--    `Dias` guarda um número de DOMINGOS, não de dias — está escrito no nome.
--
-- 4) PEDIDO DE REVISTAS PELA MATRÍCULA (EbdPedidosRevistas). O pedido passa
--    a guardar a FOTO de quantos alunos ativos e professores ativos a turma
--    tinha quando o pedido foi criado — calculada no servidor, nunca
--    digitada —, para o consolidado mostrar "pedido x matrícula real".
--
-- Permissão: nenhuma nova — reaproveita "ebd_gestao" (migração 101) e o
-- professor ativo da turma (EbdTurmaProfessores), como o resto da FASE 6.
--
-- Idempotente: seguro para reexecutar. Cada ALTER em batch próprio (GO).
-- ============================================================

-- ---- 1) Chamada offline ----

IF COL_LENGTH('dbo.EbdChamadas', 'ChaveCliente') IS NULL
    ALTER TABLE dbo.EbdChamadas ADD ChaveCliente NVARCHAR(64) NULL;
GO

IF COL_LENGTH('dbo.EbdChamadas', 'MarcadoOfflineEm') IS NULL
    ALTER TABLE dbo.EbdChamadas ADD MarcadoOfflineEm DATETIME2 NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_EbdChamadas_ChaveCliente' AND object_id = OBJECT_ID('dbo.EbdChamadas'))
    CREATE UNIQUE INDEX UX_EbdChamadas_ChaveCliente ON dbo.EbdChamadas (ChaveCliente) WHERE ChaveCliente IS NOT NULL;
GO

-- ---- 2) Plano de aula e material ----

IF OBJECT_ID(N'dbo.EbdPlanosAula', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EbdPlanosAula (
        PlanoId             INT IDENTITY PRIMARY KEY,
        Data                DATE NOT NULL,                      -- o domingo a que o plano se refere
        CongregacaoId       INT NULL REFERENCES dbo.Congregacoes(CongregacaoId),  -- NULL = campo inteiro
        FaixaEtaria         NVARCHAR(60) NULL,                  -- NULL = todas as classes
        Titulo              NVARCHAR(200) NOT NULL,
        Referencia          NVARCHAR(200) NULL,                 -- texto áureo / leitura bíblica
        Objetivo            NVARCHAR(1000) NULL,
        Roteiro             NVARCHAR(MAX) NULL,
        Status              NVARCHAR(10) NOT NULL DEFAULT 'RASCUNHO'
                                CONSTRAINT CK_EbdPlanosAula_Status CHECK (Status IN ('RASCUNHO', 'PUBLICADO')),
        PublicadoEm         DATETIME2 NULL,
        PublicadoPorMembroId INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        AtualizadoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        Ativo               BIT NOT NULL DEFAULT 1
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_EbdPlanosAula_Data' AND object_id = OBJECT_ID('dbo.EbdPlanosAula'))
    CREATE INDEX IX_EbdPlanosAula_Data ON dbo.EbdPlanosAula (Data, CongregacaoId) WHERE Ativo = 1;
GO

IF OBJECT_ID(N'dbo.EbdPlanoMateriais', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EbdPlanoMateriais (
        MaterialId          INT IDENTITY PRIMARY KEY,
        PlanoId             INT NOT NULL REFERENCES dbo.EbdPlanosAula(PlanoId),
        Titulo              NVARCHAR(200) NOT NULL,
        Url                 NVARCHAR(500) NOT NULL,
        Ordem               INT NOT NULL DEFAULT 0,
        Ativo               BIT NOT NULL DEFAULT 1,
        CriadoPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_EbdPlanoMateriais_Url CHECK (Url LIKE 'https://%')
    );
END
GO

-- ---- 3) Alerta de ausência ----

IF OBJECT_ID(N'dbo.EbdAlertasAusencia', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EbdAlertasAusencia (
        AlertaId            INT IDENTITY PRIMARY KEY,
        AlunoId             INT NOT NULL REFERENCES dbo.EbdAlunos(AlunoId),
        TurmaId             INT NOT NULL REFERENCES dbo.EbdTurmas(TurmaId),
        LicaoInicioId       INT NOT NULL REFERENCES dbo.EbdLicoes(LicaoId),  -- 1ª falta da sequência
        DomingosAusente     INT NOT NULL,                                    -- tamanho da sequência na última rodada
        DetectadoEm         DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        AtualizadoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_EbdAlertasAusencia_Sequencia UNIQUE (AlunoId, LicaoInicioId)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'EBD_AUSENCIA_DOMINGOS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias)
    VALUES ('EBD_AUSENCIA_DOMINGOS', N'EBD — alertar o professor após N DOMINGOS seguidos de ausência (número de domingos, não de dias)', 3);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'EBD_ALUNO_AUSENTE')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'EBD_ALUNO_AUSENTE', N'Aluno da EBD ausente há vários domingos', N'EBD', NULL, NULL, 1);
GO

-- ---- 4) Pedido de revistas pela matrícula ----

IF COL_LENGTH('dbo.EbdPedidosRevistas', 'MatriculadosNoPedido') IS NULL
    ALTER TABLE dbo.EbdPedidosRevistas ADD MatriculadosNoPedido INT NULL;
GO

IF COL_LENGTH('dbo.EbdPedidosRevistas', 'ProfessoresNoPedido') IS NULL
    ALTER TABLE dbo.EbdPedidosRevistas ADD ProfessoresNoPedido INT NULL;
GO
