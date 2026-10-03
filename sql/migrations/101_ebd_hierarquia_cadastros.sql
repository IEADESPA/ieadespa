-- ============================================================
-- Migração 101 — v6.1: EBD — Hierarquia e cadastros
--
-- Abre a FASE 6 (Escola Bíblica Dominical), reescrita do zero em
-- Functions + front estático (ver README, preambulo da FASE 6 — existe um
-- protótipo `chamada-ebd` em Next.js, banido neste projeto; nenhuma linha
-- de código de lá foi copiada, só ideias de desenho foram avaliadas).
--
-- Decisões de arquitetura (avaliadas e documentadas, não puladas):
--
-- 1) "Turma" aqui é um conceito NOVO e não tem nenhuma relação com
--    `TurmasBatismo` (migração 086, esteira de discipulado pré-batismo) —
--    nomes parecidos, domínios diferentes; nenhuma FK entre as duas.
--
-- 2) Hierarquia territorial: uma Turma pertence a UMA Congregação
--    (`EbdTurmas.CongregacaoId`), igual a todo o resto do sistema desde a
--    migração 001. "Área" não precisa de coluna própria aqui — já é
--    alcançável subindo `Congregacoes.AreaId` (migração 001), exatamente
--    a mesma cadeia que `shared/escopo.js::QUERY_POR_TIPO.AREA` já usa. A
--    visão agrupada por Área→Congregação (item 3 do v6.1) faz esse JOIN
--    na leitura, sem duplicar a hierarquia numa tabela paralela.
--
-- 3) Professor: N:N entre Turma e MembroReferencia (uma turma pode ter
--    mais de um professor; um professor pode lecionar em mais de uma
--    turma — comum em congregações pequenas). Desligar um professor da
--    turma NUNCA apaga a linha (auditoria/histórico) — só marca
--    `Ativo = 0`, mesmo padrão de `EscalasEquipeMembros` (v5.6) e
--    `VoluntariosDesligamentos` (v5.7).
--
-- 4) Aluno NÃO é um cadastro de pessoa paralelo — é só um VÍNCULO entre
--    `MembroReferencia` (o mesmo cadastro usado por batismo, escalas,
--    habilitação de voluntários etc. desde a v0.2/v1.1) e uma Turma, com
--    uma matrícula própria da EBD. Cada Membro só pode ter UM vínculo de
--    Aluno (`UQ_EbdAlunos_Membro`) — a "matrícula" (`Matricula`, string)
--    é atribuída UMA VEZ, na primeira matrícula, e persiste através de
--    eventuais trocas de turma (`TurmaId` pode mudar depois; a matrícula,
--    não). A unicidade é garantida em dois níveis (defesa em profundidade,
--    mesmo padrão do resto do sistema): a sequência atômica de
--    `shared/protocolo.js::gerarProtocolo` (MERGE...HOLDLOCK, já usada por
--    Ouvidoria/Disciplina/Projetos — sem reinventar geração de número
--    sequencial) gera o valor, e `UNIQUE (Matricula)` no schema barra
--    qualquer duplicidade remanescente sob concorrência.
--
-- 5) Permissão: EBD (a real, de turma/professor/aluno) é um módulo NOVO,
--    sem nenhuma relação com o Departamento cadastral "EBD" (Sigla='EBD',
--    tipicamente DepartamentoId=7) usado pelos Relatórios Departamentais
--    desde a v5.2/v5.5/v5.8 (`RelatoriosDepartamentais` etc.) — são dados
--    de naturezas diferentes (um é o relatório mensal que o departamento
--    envia pra Secretaria; o outro é o cadastro real de turma/professor/
--    aluno que só nasce agora, na FASE 6). Permissão própria
--    "ebd_gestao", NUNCA concedida automaticamente a nenhum papel (mesmo
--    padrão de "habilitacao_voluntarios"/v5.7 e "assistencia_social"/v5.9)
--    — cabe à Diretoria conceder a quem administra a EBD de fato
--    (coordenador/secretário da EBD), sem herdar de "pessoas" ou de
--    "tesouraria_departamental" (que já existe pro financeiro do
--    departamento, não pro cadastro pedagógico).
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.EbdTurmas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EbdTurmas (
        TurmaId             INT IDENTITY PRIMARY KEY,
        CongregacaoId       INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        Nome                NVARCHAR(150) NOT NULL,
        FaixaEtaria         NVARCHAR(50) NULL,
        Ativa               BIT NOT NULL DEFAULT 1,
        CriadoPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        AtualizadoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_EbdTurmas_Congregacao_Nome UNIQUE (CongregacaoId, Nome)
    );
END
GO

IF OBJECT_ID(N'dbo.EbdTurmaProfessores', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EbdTurmaProfessores (
        TurmaProfessorId    INT IDENTITY PRIMARY KEY,
        TurmaId             INT NOT NULL REFERENCES dbo.EbdTurmas(TurmaId),
        MembroId            INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Principal           BIT NOT NULL DEFAULT 0,
        Ativo               BIT NOT NULL DEFAULT 1,
        DesignadoPorMembroId INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DesignadoEm         DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        EncerradoEm         DATETIME2 NULL,
        CONSTRAINT UQ_EbdTurmaProfessores_Turma_Membro UNIQUE (TurmaId, MembroId)
    );
END
GO

IF OBJECT_ID(N'dbo.EbdAlunos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EbdAlunos (
        AlunoId             INT IDENTITY PRIMARY KEY,
        MembroId            INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        TurmaId             INT NOT NULL REFERENCES dbo.EbdTurmas(TurmaId),
        Matricula           NVARCHAR(20) NOT NULL,
        Ativo               BIT NOT NULL DEFAULT 1,
        MatriculadoEm       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        EncerradoEm         DATETIME2 NULL,
        CriadoPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AtualizadoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_EbdAlunos_Membro UNIQUE (MembroId),
        CONSTRAINT UQ_EbdAlunos_Matricula UNIQUE (Matricula)
    );
END
GO

-- ---- Permissão nova (nunca concedida automaticamente a papel nenhum —
-- mesmo achado repetido desde a migração 093) ----
IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'ebd_gestao')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('ebd_gestao', 'EBD — Turmas, Professores e Alunos');
GO
