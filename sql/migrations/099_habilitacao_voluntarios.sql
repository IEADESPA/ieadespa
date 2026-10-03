-- ============================================================
-- Migração 099 — v5.7: Triagem e habilitação de voluntários
--
-- Hoje o voluntariado é "assinar o termo da Lei 9.608/98 e entrar na
-- escala" (v7.5). Esta migração cria a esteira sequencial que faltava —
-- ficha de inscrição → referências internas → entrevista registrada →
-- antecedentes → treinamento → termo assinado → apto — e é PRÉ-REQUISITO
-- da v7.7 (Habilitação para Ministério com Menores, Lei 14.811/2024):
-- o status APTO e a marcação ContatoComMenores por equipe são as duas
-- peças que a v7.7 vai consumir depois.
--
-- Decisões de arquitetura (avaliadas e documentadas, não puladas):
--
-- 1) Antecedentes e treinamento são etapas da esteira (não dá pra pular
--    direto pro termo), mas a VERIFICAÇÃO de verdade (certidão anexada,
--    validade de 180 dias, trilha de formação) é da v7.7 — igual à
--    v086 (esteira de batismo) tratou "conclusão do Curso de Discipulado"
--    como atestação manual até a v6.9 existir. Aqui EtapaAntecedentesEm
--    e EtapaTreinamentoEm são carimbados por atestação manual de quem
--    administra a esteira; a v7.7 substitui esse carimbo manual por
--    upload/validade real sem mudar o contrato da coluna.
--
-- 2) "Vencido" (um dos 4 status pedidos: apto/pendente/inapto/vencido)
--    precisa de uma janela de validade que o pedido não define. Adotado
--    24 meses de validade do "apto" a partir da conclusão da esteira
--    (AptoDesde + 24 meses = AptoValidoAte) — no meio do intervalo de
--    2 a 3 anos que a própria v7.7 cita como padrão internacional pra
--    treinamento de proteção (MinistrySafe; Church of England
--    safeguarding). Documentado aqui, não escondido no código.
--    Mesmo espírito da v017 (Cartas de Trânsito): vencimento é CALCULADO
--    NA LEITURA (shared/habilitacaoVoluntarios.js::calcularStatusHabilitacao),
--    nunca por job/timer.
--
-- 3) "Regra dos 6 meses" usa MembroReferencia.DataAdmissao — já é, desde
--    a v1.1 (migração 015), "a data da ÚLTIMA recepção" (batismo OU carta
--    de mudança, zerada a cada saída/retorno — Reg. Art. 131 §4º, II).
--    Não foi criada nenhuma coluna nova pra isso: é exatamente o campo
--    que o pedido descreve ("admissão ou recebimento da carta"), calculado,
--    nunca digitado.
--
-- 4) "Equipes/ministérios... com papéis marcados como contato com
--    menores": a v5.6 já modela equipe/ministério de serviço em
--    EscalasEquipes — reaproveitado (ALTER, não uma tabela nova) em vez
--    de recriar um cadastro de equipes paralelo. A marcação fica no nível
--    da equipe (ex: "Ministério Infantil"), não por papel individual
--    dentro dela — mais simples e já é o suficiente pra disparar a v7.7
--    depois (bloqueio de escala por equipe marcada).
--
-- 5) Desligamento de voluntário é registro simples (motivo + tipo),
--    deliberadamente SEM nenhuma referência a processo disciplinar
--    (FASE 3/CEI) — nem FK, nem enum compartilhado. "Perda de confiança"
--    aqui é só um TipoMotivo de RH, nunca vira sanção.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.EscalasEquipes') AND name = N'ContatoComMenores')
    ALTER TABLE dbo.EscalasEquipes ADD ContatoComMenores BIT NOT NULL DEFAULT 0;
GO

IF OBJECT_ID(N'dbo.VoluntariosHabilitacao', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.VoluntariosHabilitacao (
        HabilitacaoId               INT IDENTITY PRIMARY KEY,
        MembroId                    INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CongregacaoId               INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),

        -- Esteira sequencial (v5.7) — cada etapa só pode ser carimbada se a
        -- anterior já estiver carimbada (shared/habilitacaoVoluntarios.js::
        -- podeConcluirEtapa). Antecedentes/Treinamento: ver decisão (1) acima.
        EtapaFichaInscricaoEm       DATETIME2 NULL,
        EtapaReferenciasEm          DATETIME2 NULL,
        EtapaReferenciasObservacao  NVARCHAR(500) NULL,
        EtapaEntrevistaEm           DATETIME2 NULL,
        EtapaEntrevistaEntrevistadorId INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        EtapaEntrevistaObservacao   NVARCHAR(500) NULL,
        EtapaAntecedentesEm         DATETIME2 NULL,          -- placeholder manual até v7.7
        EtapaTreinamentoEm          DATETIME2 NULL,          -- placeholder manual até v7.7
        EtapaTermoAssinadoEm        DATETIME2 NULL,          -- Lei 9.608/98

        -- Status é sempre recalculado na leitura (ver decisão 2); a coluna
        -- serve só pra filtro/listagem sem recalcular linha a linha.
        Status                      NVARCHAR(20) NOT NULL DEFAULT 'PENDENTE', -- PENDENTE/APTO/INAPTO/VENCIDO
        AptoDesde                   DATETIME2 NULL,
        AptoValidoAte               DATE NULL,

        InaptoMotivo                NVARCHAR(300) NULL,
        InaptoRegistradoPorMembroId INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        InaptoEm                    DATETIME2 NULL,

        CriadoPorMembroId           INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm                    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        AtualizadoEm                DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_VoluntariosHabilitacao_Membro UNIQUE (MembroId)
    );
END
GO

IF OBJECT_ID(N'dbo.VoluntariosDesligamentos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.VoluntariosDesligamentos (
        DesligamentoId          INT IDENTITY PRIMARY KEY,
        MembroId                INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        EquipeId                INT NULL REFERENCES dbo.EscalasEquipes(EquipeId),
        -- PERDA_CONFIANCA / MUDANCA / INDISPONIBILIDADE / SAIDA_DA_IGREJA / OUTRO
        -- — nunca "sanção disciplinar" (ver decisão 5): isso é registro de
        -- RH sobre o voluntariado, inteiramente separado do CEI (FASE 3).
        TipoMotivo              NVARCHAR(30) NOT NULL DEFAULT 'OUTRO',
        Motivo                  NVARCHAR(300) NOT NULL,
        RemovidoDaEscala        BIT NOT NULL DEFAULT 0,
        RegistradoPorMembroId   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DesligadoEm             DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO
