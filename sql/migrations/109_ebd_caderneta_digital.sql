-- ============================================================
-- Migração 109 — v6.8: EBD — Caderneta digital no padrão CPAD
--
-- Três peças, todas em cima do que a FASE 6 já construiu (v6.1-v6.7):
--
-- 1) ALUNO NÃO-MEMBRO (EbdAlunos). Até aqui o aluno era SEMPRE um vínculo
--    de MembroReferencia (migração 101, decisão 4) — o que exclui
--    exatamente quem a EBD mais quer alcançar (visitante frequente,
--    criança de família não congregada). Agora `MembroId` pode ser NULL e a
--    própria linha carrega o mínimo de identificação (nome, contato,
--    nascimento, responsável). Um CHECK garante que a linha é OU membro OU
--    não-membro, nunca os dois e nunca nenhum (mesma defesa em profundidade
--    do CK_EbdChamadas_Consistencia da migração 102).
--
--    ARMADILHA JÁ CONHECIDA (Trava 6-A, migração 108): no SQL Server uma
--    UNIQUE comum trata NULL como IGUAL a NULL — com MembroId anulável, a
--    UNIQUE (MembroId) aceitaria um único aluno não-membro em todo o banco.
--    Por isso a constraint é trocada por um índice único FILTRADO
--    (`WHERE MembroId IS NOT NULL`): a regra "um vínculo de aluno por
--    membro" continua valendo, e cada não-membro é a sua própria linha.
--    A matrícula (`Matricula`, UNIQUE) segue sendo a chave humana de todos.
--
-- 2) CADERNETA (EbdCadernetas) — o que a caderneta física da CPAD tem e a
--    chamada (v6.2) não tem: Bíblias e Revistas trazidas, por classe, por
--    domingo. Uma linha por (Lição, Turma). Presentes/ausentes/visitantes
--    NÃO são colunas digitadas — continuam derivados de EbdChamadas
--    ("calculado, nunca digitado", princípio da FASE 6). Duas exceções
--    controladas:
--      * `MatriculadosRegistrado`: foto do número de matriculados no dia em
--        que a caderneta foi salva. Sem isso, o histórico mudaria
--        retroativamente a cada aluno que sai ou é transferido (a turma
--        de um aluno é sobrescrita na transferência, sem histórico).
--      * `Origem = 'IMPORTADA'`: caderneta antiga de papel/planilha, que só
--        tem totais (sem linha por aluno). Nela, presentes/ausentes/
--        visitantes/oferta vêm das colunas *Importado/Importada. O CHECK
--        impede misturar: SISTEMA nunca carrega número importado.
--    A OFERTA do domingo de origem SISTEMA continua sendo a da v6.7
--    (EbdOfertas, por Lição/Congregação) — um único lugar para o dinheiro,
--    sem segundo número digitado por classe que pudesse divergir.
--
-- 3) FECHAMENTO TRIMESTRAL (EbdFechamentosTrimestrais) — a "foto" do
--    trimestre de uma congregação, congelada em JSON (`Snapshot`). É o que
--    alimenta o Relatório do Superintendente: depois de fechado, o número
--    não muda quando um aluno é transferido ou uma lição é corrigida
--    (refazer é uma ação explícita e auditada, que incrementa `Versao`).
--    Gerado à mão ("Fechar trimestre") ou pela rotina diária
--    (`Origem = 'AUTOMATICO'`, api/EbdFechamentoAutomatico).
--
-- Permissão: reaproveita "ebd_gestao" (migração 101) — nenhuma permissão
-- nova. O professor da própria turma só registra Bíblias/Revistas da sua
-- classe (mesma granularidade da chamada, v6.2).
--
-- Idempotente: seguro para reexecutar sem apagar dados. Cada ALTER em
-- batch próprio (GO): uma coluna recém-criada não pode ser referenciada no
-- mesmo batch em que nasce.
-- ============================================================

-- ---- 1) Aluno não-membro ----

IF COL_LENGTH('dbo.EbdAlunos', 'NomeNaoMembro') IS NULL
    ALTER TABLE dbo.EbdAlunos ADD NomeNaoMembro NVARCHAR(150) NULL;
GO

IF COL_LENGTH('dbo.EbdAlunos', 'ContatoNaoMembro') IS NULL
    ALTER TABLE dbo.EbdAlunos ADD ContatoNaoMembro NVARCHAR(150) NULL;
GO

IF COL_LENGTH('dbo.EbdAlunos', 'DataNascimento') IS NULL
    ALTER TABLE dbo.EbdAlunos ADD DataNascimento DATE NULL;
GO

IF COL_LENGTH('dbo.EbdAlunos', 'ResponsavelNome') IS NULL
    ALTER TABLE dbo.EbdAlunos ADD ResponsavelNome NVARCHAR(150) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.key_constraints
           WHERE name = 'UQ_EbdAlunos_Membro' AND parent_object_id = OBJECT_ID('dbo.EbdAlunos'))
    ALTER TABLE dbo.EbdAlunos DROP CONSTRAINT UQ_EbdAlunos_Membro;
GO

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.EbdAlunos') AND name = 'MembroId' AND is_nullable = 0)
    ALTER TABLE dbo.EbdAlunos ALTER COLUMN MembroId INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'UX_EbdAlunos_Membro' AND object_id = OBJECT_ID('dbo.EbdAlunos'))
    CREATE UNIQUE INDEX UX_EbdAlunos_Membro
        ON dbo.EbdAlunos (MembroId)
        WHERE MembroId IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = 'CK_EbdAlunos_Identidade' AND parent_object_id = OBJECT_ID('dbo.EbdAlunos'))
    ALTER TABLE dbo.EbdAlunos ADD CONSTRAINT CK_EbdAlunos_Identidade CHECK (
        (MembroId IS NOT NULL AND NomeNaoMembro IS NULL)
        OR
        (MembroId IS NULL AND NomeNaoMembro IS NOT NULL)
    );
GO

-- ---- 2) Caderneta (uma linha por Lição × Turma) ----

IF OBJECT_ID(N'dbo.EbdCadernetas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EbdCadernetas (
        CadernetaId             INT IDENTITY PRIMARY KEY,
        LicaoId                 INT NOT NULL REFERENCES dbo.EbdLicoes(LicaoId),
        TurmaId                 INT NOT NULL REFERENCES dbo.EbdTurmas(TurmaId),
        Biblias                 INT NULL CONSTRAINT CK_EbdCadernetas_Biblias CHECK (Biblias >= 0),   -- NULL = não informado (diferente de 0)
        Revistas                INT NULL CONSTRAINT CK_EbdCadernetas_Revistas CHECK (Revistas >= 0), -- NULL = não informado (diferente de 0)
        Observacao              NVARCHAR(500) NULL,
        Origem                  NVARCHAR(10) NOT NULL CONSTRAINT DF_EbdCadernetas_Origem DEFAULT 'SISTEMA'
                                    CONSTRAINT CK_EbdCadernetas_OrigemValor CHECK (Origem IN ('SISTEMA', 'IMPORTADA')),
        MatriculadosRegistrado  INT NULL CONSTRAINT CK_EbdCadernetas_Matriculados CHECK (MatriculadosRegistrado >= 0),
        PresentesImportado      INT NULL CONSTRAINT CK_EbdCadernetas_PresentesImp CHECK (PresentesImportado >= 0),
        AusentesImportado       INT NULL CONSTRAINT CK_EbdCadernetas_AusentesImp CHECK (AusentesImportado >= 0),
        VisitantesImportado     INT NULL CONSTRAINT CK_EbdCadernetas_VisitantesImp CHECK (VisitantesImportado >= 0),
        OfertaImportada         DECIMAL(14,2) NULL CONSTRAINT CK_EbdCadernetas_OfertaImp CHECK (OfertaImportada >= 0),
        RegistradoPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm            DATETIME2 NOT NULL CONSTRAINT DF_EbdCadernetas_RegistradoEm DEFAULT SYSUTCDATETIME(),
        AtualizadoEm            DATETIME2 NOT NULL CONSTRAINT DF_EbdCadernetas_AtualizadoEm DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_EbdCadernetas_Licao_Turma UNIQUE (LicaoId, TurmaId),
        CONSTRAINT CK_EbdCadernetas_Consistencia CHECK (
            (Origem = 'SISTEMA'
                AND PresentesImportado IS NULL AND AusentesImportado IS NULL
                AND VisitantesImportado IS NULL AND OfertaImportada IS NULL)
            OR
            (Origem = 'IMPORTADA'
                AND MatriculadosRegistrado IS NOT NULL AND PresentesImportado IS NOT NULL
                AND AusentesImportado IS NOT NULL AND VisitantesImportado IS NOT NULL)
        )
    );
END
GO

-- ---- 3) Fechamento trimestral (foto congelada do trimestre da congregação) ----

IF OBJECT_ID(N'dbo.EbdFechamentosTrimestrais', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EbdFechamentosTrimestrais (
        FechamentoId            INT IDENTITY PRIMARY KEY,
        CongregacaoId           INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        Trimestre               NVARCHAR(10) NOT NULL,           -- formato 'AAAA-T1'..'AAAA-T4', o mesmo das revistas (v6.6)
        Origem                  NVARCHAR(10) NOT NULL CONSTRAINT CK_EbdFechamentos_Origem CHECK (Origem IN ('MANUAL', 'AUTOMATICO')),
        Snapshot                NVARCHAR(MAX) NOT NULL CONSTRAINT CK_EbdFechamentos_Snapshot CHECK (ISJSON(Snapshot) = 1),
        LicoesAbertas           INT NOT NULL CONSTRAINT DF_EbdFechamentos_LicoesAbertas DEFAULT 0,
        Versao                  INT NOT NULL CONSTRAINT DF_EbdFechamentos_Versao DEFAULT 1,
        FechadoPorMembroId      INT NULL REFERENCES dbo.MembroReferencia(MembroId),  -- NULL = rotina automática
        FechadoEm               DATETIME2 NOT NULL CONSTRAINT DF_EbdFechamentos_FechadoEm DEFAULT SYSUTCDATETIME(),
        RefeitoPorMembroId      INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RefeitoEm               DATETIME2 NULL,
        CONSTRAINT UQ_EbdFechamentos_Congregacao_Trimestre UNIQUE (CongregacaoId, Trimestre)
    );
END
GO
