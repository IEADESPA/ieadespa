-- ============================================================
-- Migração 104 — v6.4: Motor de conquistas e gamificação
--
-- Diferente do resto da FASE 6, este motor NÃO nasce preso à EBD — é
-- module-agnostic desde a primeira migração (mesmo espírito de
-- `shared/estatuto.js`/`shared/parentesco.js`: escrito uma vez,
-- reaproveitado por módulos futuros). A EBD é o primeiro consumidor real,
-- não o único — ver seeds no fim deste arquivo.
--
-- Seis tabelas:
--
-- 1) ConquistaTiposEvento — registro de "tipo de evento-gatilho"
--    (EBD_PRESENCA hoje; REUNIAO_PRESENCA/ESCALA_SERVICO/CONTRIBUICAO no
--    futuro). Adicionar um tipo novo é CADASTRAR UMA LINHA aqui, nunca
--    alterar o motor (`shared/conquistas.js`) — é essa tabela que faz o
--    "sem alteração de código pra adicionar um tipo novo" do checklist
--    virar realidade, e não só uma promessa em comentário.
--
-- 2) ConquistasEventos — o log de ocorrências (uma linha por evento
--    lançado: "este Membro teve uma ocorrência deste TipoEvento, com este
--    Payload, nesta data"). É a ÚNICA fonte de verdade que o motor lê pra
--    avaliar regras — nenhuma regra consulta tabela de outro módulo
--    diretamente (ex: EbdChamadas), pra o motor continuar 100%
--    desacoplado do que gerou o evento. Quem gera o evento (hoje,
--    shared/ebdChamada.js e shared/ebdAtividades.js) decide o que vai no
--    Payload.
--
-- 3) CatalogoConquistas — nome/ícone/descrição/oculta-até-desbloquear +
--    `PreRequisitoConquistaId` (auto-referência): "progressão em cadeia"
--    (item 1) é implementada como uma corrente linear (cada conquista tem
--    NO MÁXIMO um pré-requisito direto) — suficiente para o pedido
--    ("progressão em cadeia, não catálogo plano") sem introduzir uma
--    tabela N:N de pré-requisitos múltiplos, que nada no pedido exige.
--
-- 4) RegrasConquista — o "tipo de regra genérico" do item 1: cada linha
--    referencia UM ConquistaId + UM TipoEvento + um TipoRegra (dos 5
--    fixos: contagem_evento/sequencia/combinacao_exata/marco_unico/
--    periodo_perfeito) + `ConfigJson` (os parâmetros específicos daquele
--    tipo — ver `shared/conquistas.js` para a forma exata de cada um).
--    Uma conquista pode ter mais de uma regra ativa (OR — qualquer regra
--    satisfeita desbloqueia; ver decisão documentada no shared).
--
-- 5) ConquistasDesbloqueadas — por `MembroId` (não "Aluno" — é a mesma
--    pessoa de `MembroReferencia` em todo o resto do sistema, item 2).
--    `UNIQUE (ConquistaId, MembroId)` — desbloqueio é um evento único por
--    pessoa, nunca duplicado.
--
-- 6) ScoreConfig — pesos por TipoEvento (item 3), com `EscopoTipo`/
--    `EscopoId` opcionais (mesmo formato de escopo territorial usado em
--    `Lideranca`/`shared/escopo.js`) pra permitir peso diferente por
--    Campo/Área/Região sem herdar a granularidade fina de "por
--    congregação" — linha com Escopo NULL é o peso padrão geral.
--
-- Nenhum timerTrigger: o motor é avaliado NA LEITURA/NO LANÇAMENTO DO
-- EVENTO (shared/conquistas.js::registrarEventoEAvaliar), nunca em job
-- agendado — mesmo princípio de "calculado, nunca job" já usado em
-- shared/habilitacaoVoluntarios.js (v5.7) e nas Cartas de Trânsito (v017).
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.ConquistaTiposEvento', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ConquistaTiposEvento (
        TipoEvento          NVARCHAR(40) NOT NULL PRIMARY KEY,
        Descricao           NVARCHAR(200) NULL,
        ModuloOrigem        NVARCHAR(40) NULL,   -- ex: 'EBD' — só informativo/agrupamento na tela admin
        Ativo               BIT NOT NULL DEFAULT 1,
        CriadoEm            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.ConquistasEventos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ConquistasEventos (
        EventoId            BIGINT IDENTITY PRIMARY KEY,
        MembroId            INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        TipoEvento          NVARCHAR(40) NOT NULL REFERENCES dbo.ConquistaTiposEvento(TipoEvento),
        PayloadJson         NVARCHAR(MAX) NULL,
        OcorridoEm          DATE NOT NULL,
        CriadoEm            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_ConquistasEventos_Membro_Tipo ON dbo.ConquistasEventos (MembroId, TipoEvento, OcorridoEm);
END
GO

IF OBJECT_ID(N'dbo.CatalogoConquistas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CatalogoConquistas (
        ConquistaId             INT IDENTITY PRIMARY KEY,
        Nome                    NVARCHAR(150) NOT NULL,
        Icone                   NVARCHAR(20) NULL,      -- emoji/atalho de ícone, mesmo padrão leve do resto do front
        Descricao               NVARCHAR(400) NULL,
        Oculta                  BIT NOT NULL DEFAULT 0, -- some do catálogo público até ser desbloqueada
        PreRequisitoConquistaId INT NULL REFERENCES dbo.CatalogoConquistas(ConquistaId),
        PontosBonus             INT NOT NULL DEFAULT 0, -- soma no Score ao desbloquear (item 3)
        Ativa                   BIT NOT NULL DEFAULT 1,
        CriadoPorMembroId       INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm                DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        AtualizadoEm            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.RegrasConquista', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RegrasConquista (
        RegraId             INT IDENTITY PRIMARY KEY,
        ConquistaId         INT NOT NULL REFERENCES dbo.CatalogoConquistas(ConquistaId),
        TipoRegra           NVARCHAR(20) NOT NULL CHECK (TipoRegra IN
                                ('contagem_evento', 'sequencia', 'combinacao_exata', 'marco_unico', 'periodo_perfeito')),
        TipoEvento          NVARCHAR(40) NOT NULL REFERENCES dbo.ConquistaTiposEvento(TipoEvento),
        ConfigJson          NVARCHAR(MAX) NOT NULL,   -- parâmetros específicos do TipoRegra — ver shared/conquistas.js
        Ativa               BIT NOT NULL DEFAULT 1,
        CriadoEm            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.ConquistasDesbloqueadas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ConquistasDesbloqueadas (
        DesbloqueioId       INT IDENTITY PRIMARY KEY,
        ConquistaId         INT NOT NULL REFERENCES dbo.CatalogoConquistas(ConquistaId),
        MembroId            INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegraId             INT NULL REFERENCES dbo.RegrasConquista(RegraId), -- qual regra disparou (auditoria/depuração)
        DesbloqueadoEm      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_ConquistasDesbloqueadas_Conquista_Membro UNIQUE (ConquistaId, MembroId)
    );
END
GO

IF OBJECT_ID(N'dbo.ScoreConfig', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ScoreConfig (
        ScoreConfigId       INT IDENTITY PRIMARY KEY,
        TipoEvento          NVARCHAR(40) NOT NULL REFERENCES dbo.ConquistaTiposEvento(TipoEvento),
        Peso                DECIMAL(10,2) NOT NULL DEFAULT 1,
        EscopoTipo          NVARCHAR(20) NULL,   -- NULL = peso padrão geral; ou CONGREGACAO/AREA/REGIAO/QUADRANTE/DISTRITO (mesmo vocabulário de shared/escopo.js)
        EscopoId            INT NULL,
        CriadoEm            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_ScoreConfig_Tipo_Escopo UNIQUE (TipoEvento, EscopoTipo, EscopoId)
    );
END
GO

-- ============================================================
-- Seeds — item 5 (primeiro consumidor real: EBD)
-- ============================================================

-- Tipos de evento: EBD_PRESENCA é o evento-gatilho de chamada (lançado tanto
-- em PRESENTE quanto em AUSENTE — periodo_perfeito precisa ver as faltas pra
-- provar que não houve nenhuma). EBD_ATIVIDADE_RESPOSTA é o segundo tipo
-- registrado agora (dado, não alteração de motor) para dar suporte ao sinal
-- de "gabarito de atividade" do v6.3 sem forçar esse sinal dentro do mesmo
-- payload de presença. REUNIAO_PRESENCA/ESCALA_SERVICO/CONTRIBUICAO ficam
-- de fora de propósito (item 6 — só registrados como intenção futura).
IF NOT EXISTS (SELECT 1 FROM dbo.ConquistaTiposEvento WHERE TipoEvento = 'EBD_PRESENCA')
    INSERT INTO dbo.ConquistaTiposEvento (TipoEvento, Descricao, ModuloOrigem) VALUES
    ('EBD_PRESENCA', 'Lançamento de presença/ausência na Escola Bíblica Dominical', 'EBD');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.ConquistaTiposEvento WHERE TipoEvento = 'EBD_ATIVIDADE_RESPOSTA')
    INSERT INTO dbo.ConquistaTiposEvento (TipoEvento, Descricao, ModuloOrigem) VALUES
    ('EBD_ATIVIDADE_RESPOSTA', 'Resposta de aluno a uma questão de atividade da EBD', 'EBD');
GO

-- Catálogo (item 5): 4 conquistas reais, em cadeia (Primeira Presença ->
-- Sequência de 4 domingos -> Trimestre Perfeito) + uma independente
-- (Gabarito Nota Máxima). "Sequência" e "Trimestre Perfeito" ficam ocultas
-- até desbloqueio (só a Primeira Presença e o Gabarito são visíveis desde
-- o início — dão o "gancho" inicial pro aluno; as demais são surpresa).
IF NOT EXISTS (SELECT 1 FROM dbo.CatalogoConquistas WHERE Nome = 'Primeira Presença')
    INSERT INTO dbo.CatalogoConquistas (Nome, Icone, Descricao, Oculta, PontosBonus) VALUES
    ('Primeira Presença', '🌱', 'Compareceu pela primeira vez a uma aula da EBD.', 0, 5);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.CatalogoConquistas WHERE Nome = 'Sequência de Ouro')
    INSERT INTO dbo.CatalogoConquistas (Nome, Icone, Descricao, Oculta, PreRequisitoConquistaId, PontosBonus) VALUES
    ('Sequência de Ouro', '🔥', 'Presente em 4 domingos seguidos na EBD.', 1,
     (SELECT ConquistaId FROM dbo.CatalogoConquistas WHERE Nome = 'Primeira Presença'), 15);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.CatalogoConquistas WHERE Nome = 'Trimestre Perfeito')
    INSERT INTO dbo.CatalogoConquistas (Nome, Icone, Descricao, Oculta, PreRequisitoConquistaId, PontosBonus) VALUES
    ('Trimestre Perfeito', '🏆', 'Nenhuma falta registrada em um trimestre inteiro de EBD.', 1,
     (SELECT ConquistaId FROM dbo.CatalogoConquistas WHERE Nome = 'Sequência de Ouro'), 40);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.CatalogoConquistas WHERE Nome = 'Gabarito Nota Máxima')
    INSERT INTO dbo.CatalogoConquistas (Nome, Icone, Descricao, Oculta, PontosBonus) VALUES
    ('Gabarito Nota Máxima', '🎯', 'Acertou 100% de uma atividade da EBD.', 0, 10);
GO

-- Regras (item 1 — 4 dos 5 tipos genéricos, todos referenciando EBD_*):
-- marco_unico (Primeira Presença), sequencia (Sequência de Ouro),
-- periodo_perfeito (Trimestre Perfeito) e combinacao_exata (Gabarito Nota
-- Máxima — "% de acerto == 100" no mesmo evento de resposta). contagem_evento
-- fica coberto pelos testes unitários do motor (genérico, não precisa de
-- seed próprio pra provar que funciona) — nada no pedido exige uma 5ª
-- conquista só pra usar o 5º tipo.
IF NOT EXISTS (SELECT 1 FROM dbo.RegrasConquista r JOIN dbo.CatalogoConquistas c ON c.ConquistaId = r.ConquistaId WHERE c.Nome = 'Primeira Presença')
    INSERT INTO dbo.RegrasConquista (ConquistaId, TipoRegra, TipoEvento, ConfigJson)
    SELECT ConquistaId, 'marco_unico', 'EBD_PRESENCA', N'{"filtro":{"status":"PRESENTE"}}'
    FROM dbo.CatalogoConquistas WHERE Nome = 'Primeira Presença';
GO

IF NOT EXISTS (SELECT 1 FROM dbo.RegrasConquista r JOIN dbo.CatalogoConquistas c ON c.ConquistaId = r.ConquistaId WHERE c.Nome = 'Sequência de Ouro')
    INSERT INTO dbo.RegrasConquista (ConquistaId, TipoRegra, TipoEvento, ConfigJson)
    SELECT ConquistaId, 'sequencia', 'EBD_PRESENCA', N'{"filtro":{"status":"PRESENTE"},"minimoConsecutivas":4}'
    FROM dbo.CatalogoConquistas WHERE Nome = 'Sequência de Ouro';
GO

IF NOT EXISTS (SELECT 1 FROM dbo.RegrasConquista r JOIN dbo.CatalogoConquistas c ON c.ConquistaId = r.ConquistaId WHERE c.Nome = 'Trimestre Perfeito')
    INSERT INTO dbo.RegrasConquista (ConquistaId, TipoRegra, TipoEvento, ConfigJson)
    SELECT ConquistaId, 'periodo_perfeito', 'EBD_PRESENCA', N'{"filtroFalha":{"status":"AUSENTE"},"minimoOcorrenciasNoPeriodo":10,"diasPeriodo":90}'
    FROM dbo.CatalogoConquistas WHERE Nome = 'Trimestre Perfeito';
GO

IF NOT EXISTS (SELECT 1 FROM dbo.RegrasConquista r JOIN dbo.CatalogoConquistas c ON c.ConquistaId = r.ConquistaId WHERE c.Nome = 'Gabarito Nota Máxima')
    INSERT INTO dbo.RegrasConquista (ConquistaId, TipoRegra, TipoEvento, ConfigJson)
    SELECT ConquistaId, 'combinacao_exata', 'EBD_ATIVIDADE_RESPOSTA', N'{"camposEsperados":{"percentual":100}}'
    FROM dbo.CatalogoConquistas WHERE Nome = 'Gabarito Nota Máxima';
GO

-- Pesos padrão de Score (item 3) — cada presença lançada (PRESENTE) vale 1
-- ponto de frequência; cada resposta de atividade correta soma 0.5 (mérito
-- pedagógico pesa metade da frequência, decisão deliberada: comparecer é a
-- base do modelo EBD, o resto é reforço). Sem EscopoTipo/EscopoId = peso
-- padrão geral; Campos específicos podem sobrescrever depois pela tela
-- admin, sem migração nova.
IF NOT EXISTS (SELECT 1 FROM dbo.ScoreConfig WHERE TipoEvento = 'EBD_PRESENCA' AND EscopoTipo IS NULL AND EscopoId IS NULL)
    INSERT INTO dbo.ScoreConfig (TipoEvento, Peso, EscopoTipo, EscopoId) VALUES ('EBD_PRESENCA', 1.00, NULL, NULL);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.ScoreConfig WHERE TipoEvento = 'EBD_ATIVIDADE_RESPOSTA' AND EscopoTipo IS NULL AND EscopoId IS NULL)
    INSERT INTO dbo.ScoreConfig (TipoEvento, Peso, EscopoTipo, EscopoId) VALUES ('EBD_ATIVIDADE_RESPOSTA', 0.50, NULL, NULL);
GO
