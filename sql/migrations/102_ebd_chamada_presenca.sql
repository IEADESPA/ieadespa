-- ============================================================
-- Migração 102 — v6.2: EBD — Chamada e presença
--
-- Continua a FASE 6 (aberta na migração 101/v6.1). Duas tabelas novas:
--
-- 1) EbdLicoes — "lição aberta/fechada por congregação" (item 1 do v6.2).
--    Decisão deliberada de escopo: esta é a versão MÍNIMA da Lição — só o
--    suficiente pra abrir/fechar a janela de lançamento de chamada
--    (congregação, data, status). A v6.3 ("Lições e atividades", ainda não
--    construída) é quem vai anexar conteúdo pedagógico de verdade
--    (atividades, 5 tipos de pergunta, respostas/gabarito) — o item
--    "Lições (abrir/fechar) por congregação" que aparece de novo no
--    checklist do v6.3 é o mesmo registro aqui, não uma tabela paralela.
--    Propositalmente NÃO tem nenhuma coluna de conteúdo (título, texto,
--    referência bíblica etc.) — a v6.3 estende esta mesma tabela
--    (`EbdLicoes`) com tabelas próprias que referenciam `LicaoId` (ex:
--    `EbdLicaoAtividades`), sem precisar recriar ou migrar dado nenhum do
--    que é criado agora. Mesmo princípio de "construir a base genérica uma
--    vez, sem prever demais" já usado por `shared/protocolo.js` (usado por
--    Ouvidoria/Disciplina/Projetos/EBD) e por `Funcionalidades` (permissões
--    livres desde a migração 001).
--
--    UNIQUE (CongregacaoId, Data): uma congregação tem NO MÁXIMO uma lição
--    por data (normalmente um domingo) — todas as turmas daquela
--    congregação lançam chamada contra a MESMA lição do dia; é a Turma
--    (via EbdChamadas.TurmaId) que diferencia quem foi chamado em qual
--    sala, não a Lição.
--
-- 2) EbdChamadas — "lançamento de chamada por turma" + presenças/
--    ausências/visitantes (item 2) e base dos "percentuais calculados"
--    (item 3, ver shared/ebdChamada.js::calcularPercentuais — nunca
--    digitado, sempre derivado das linhas desta tabela, mesmo princípio
--    de "calculado, nunca digitado" do resto do sistema desde a v5.5.1/
--    v5.6/v5.7).
--
--    Uma linha por (Lição, Aluno) — `AlunoId` aponta pra `EbdAlunos`
--    (matrícula já existente, v6.1). Visitante NÃO é forçado a ganhar uma
--    matrícula falsa em `EbdAlunos` só pra caber no esquema: `AlunoId`
--    fica NULL e o registro carrega `VisitanteNome`/`VisitanteContato`
--    direto na própria linha — um visitante é, por definição, alguém que
--    ainda não tem vínculo de Aluno; inventar uma matrícula pra ele
--    quebraria a garantia de "matrícula única por Membro" da migração 101.
--    `UNIQUE (LicaoId, AlunoId)` garante "um registro por Aluno por
--    Lição" (item testado em shared/ebdChamada.js) — no SQL Server, NULL
--    é tratado como valor distinto numa UNIQUE, então múltiplas linhas de
--    visitante (AlunoId NULL) na mesma Lição continuam permitidas, cada
--    visita sua própria linha, como deveria ser.
--
--    CHECK garante consistência mínima direto no schema (defesa em
--    profundidade, mesma postura do resto do sistema): PRESENTE/AUSENTE
--    sempre tem AlunoId e nunca tem dados de visitante; VISITANTE nunca
--    tem AlunoId e sempre tem nome.
--
-- Permissão: reaproveita "ebd_gestao" (migração 101) para administração
-- (abrir/fechar lição, ver relatório geral), MAS lançar chamada de uma
-- turma específica não exige essa permissão ampla — um professor
-- designado (EbdTurmaProfessores, Ativo=1) pode lançar chamada só da(s)
-- turma(s) em que está ativo, sem precisar que a Diretoria conceda
-- "ebd_gestao" pra cada professor. Essa checagem (permissão OU vínculo de
-- professor ativo na turma) é feita em GestaoEbdChamada, reaproveitando
-- EbdTurmaProfessores que já existe — nenhuma tabela ou coluna de
-- permissão nova aqui.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.EbdLicoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EbdLicoes (
        LicaoId             INT IDENTITY PRIMARY KEY,
        CongregacaoId       INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        Data                DATE NOT NULL,
        Status              NVARCHAR(10) NOT NULL DEFAULT 'ABERTA' CHECK (Status IN ('ABERTA', 'FECHADA')),
        AbertaPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AbertaEm            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        FechadaPorMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        FechadaEm           DATETIME2 NULL,
        AtualizadoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_EbdLicoes_Congregacao_Data UNIQUE (CongregacaoId, Data)
    );
END
GO

IF OBJECT_ID(N'dbo.EbdChamadas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EbdChamadas (
        ChamadaId           INT IDENTITY PRIMARY KEY,
        LicaoId             INT NOT NULL REFERENCES dbo.EbdLicoes(LicaoId),
        TurmaId             INT NOT NULL REFERENCES dbo.EbdTurmas(TurmaId),
        AlunoId             INT NULL REFERENCES dbo.EbdAlunos(AlunoId),
        VisitanteNome       NVARCHAR(150) NULL,
        VisitanteContato    NVARCHAR(150) NULL,
        Status              NVARCHAR(10) NOT NULL CHECK (Status IN ('PRESENTE', 'AUSENTE', 'VISITANTE')),
        RegistradoPorMembroId INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        AtualizadoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_EbdChamadas_Licao_Aluno UNIQUE (LicaoId, AlunoId),
        CONSTRAINT CK_EbdChamadas_Consistencia CHECK (
            (Status IN ('PRESENTE', 'AUSENTE') AND AlunoId IS NOT NULL AND VisitanteNome IS NULL)
            OR
            (Status = 'VISITANTE' AND AlunoId IS NULL AND VisitanteNome IS NOT NULL)
        )
    );
END
GO
