-- ============================================================
-- Migração 080 — Motor de workflow genérico (vB.3)
--
-- Sete fluxos de aprovação já foram escritos à mão no sistema (fila de
-- edição cadastral v1.11, tramitação de projeto/parecer v2.8, processo
-- disciplinar v3.2-v3.4, procedimento de abandono v1.5, pagamento com
-- alçada v4.5, remanejamento do PDQ v4.8, confirmação de autolançamento
-- v4.3) — sete implementações do mesmo conceito (etapa → responsável →
-- prazo → aprovar/rejeitar/devolver). Esta versão generaliza o conceito
-- pros fluxos NOVOS (fases 5-11) — decisão explícita de NÃO migrar os 7
-- fluxos existentes de uma vez só (eles funcionam); por isso o catálogo
-- (TiposFluxo/FluxoEtapas) nasce vazio aqui, populado quando o primeiro
-- módulo novo precisar.
--
-- Responsável de etapa é declarativo (permissão + nível territorial
-- mínimo, igual ao PermissaoAlvo/NivelAlvo de NotificacaoRegras — vB.2),
-- reaproveitando a MESMA hierarquia territorial que já existe em
-- shared/escopo.js (Congregação → Área → Região → Quadrante → Distrito →
-- Global) em vez de inventar uma segunda. NivelMinimo = NULL cai direto
-- pra GLOBAL (ninguém territorial responde).
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.TiposFluxo', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TiposFluxo (
        Chave         NVARCHAR(60) NOT NULL PRIMARY KEY,   -- ex: 'ESCALA_VOLUNTARIO_TROCA' (vB.5, exemplo futuro)
        Nome          NVARCHAR(150) NOT NULL,
        Ativo         BIT NOT NULL DEFAULT 1,
        CriadoEm      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.FluxoEtapas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FluxoEtapas (
        EtapaId              INT IDENTITY PRIMARY KEY,
        TipoFluxo             NVARCHAR(60) NOT NULL REFERENCES dbo.TiposFluxo(Chave),
        Ordem                 INT NOT NULL,                 -- 1, 2, 3... sequência da etapa dentro do tipo
        Nome                  NVARCHAR(150) NOT NULL,       -- ex: "Aprovação do Pastor de Área"
        ResponsavelPermissao  NVARCHAR(60) NOT NULL,        -- chave de Papeis.Permissoes
        ResponsavelNivelMinimo NVARCHAR(20) NULL,           -- CONGREGACAO|AREA|REGIAO|QUADRANTE|DISTRITO|GLOBAL (NULL = GLOBAL)
        PrazoDias             INT NOT NULL DEFAULT 5,       -- SLA da etapa; estourou = candidato a escalonamento
        CONSTRAINT UQ_FluxoEtapa_Ordem UNIQUE (TipoFluxo, Ordem)
    );
END
GO

IF OBJECT_ID(N'dbo.FluxoInstancias', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FluxoInstancias (
        InstanciaId          INT IDENTITY PRIMARY KEY,
        TipoFluxo             NVARCHAR(60) NOT NULL REFERENCES dbo.TiposFluxo(Chave),
        ReferenciaTabela      NVARCHAR(60) NOT NULL,        -- tabela do módulo dono do dado real (ex: 'EscalasVoluntario')
        ReferenciaId          INT NOT NULL,
        CongregacaoId         INT NULL REFERENCES dbo.Congregacoes(CongregacaoId), -- escopo territorial de origem p/ escalonamento; NULL = sempre GLOBAL
        EtapaAtualOrdem       INT NOT NULL DEFAULT 1,
        EscalonadoNivel       NVARCHAR(20) NULL,            -- nível territorial já escalonado (sobe sozinho quando o SLA estoura)
        Status                NVARCHAR(20) NOT NULL DEFAULT 'EM_ANDAMENTO', -- EM_ANDAMENTO | CONCLUIDO | REJEITADO | DEVOLVIDO
        PrazoEtapaEm          DATE NOT NULL,
        SolicitanteMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadaEm              DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        AtualizadaEm          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_FluxoInstancia_Origem UNIQUE (TipoFluxo, ReferenciaTabela, ReferenciaId)
    );
END
GO

IF OBJECT_ID(N'dbo.FluxoHistorico', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FluxoHistorico (
        HistoricoId    INT IDENTITY PRIMARY KEY,
        InstanciaId     INT NOT NULL REFERENCES dbo.FluxoInstancias(InstanciaId),
        EtapaOrdem      INT NOT NULL,
        Acao            NVARCHAR(20) NOT NULL,              -- INICIAR | APROVAR | REJEITAR | DEVOLVER | ESCALONAR
        UsuarioMembroId INT NULL REFERENCES dbo.MembroReferencia(MembroId), -- NULL = ação automática do sistema (ESCALONAR)
        Observacao      NVARCHAR(500) NULL,
        CriadoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Integra com o motor de notificações (vB.2, migração 079): quando um fluxo
-- escalona por SLA estourado, o novo responsável é avisado pela MESMA
-- central de avisos, não uma segunda caixa de entrada. Sem detector próprio
-- em notificacaoDetectores.js de propósito — quem cria esta notificação é
-- sempre shared/workflow.js diretamente (já sabe o destinatário exato), não
-- o avaliador diário; por isso fica inerte se a rodada automática rodar
-- sobre ela (mesma regra de "sem detector = inerte" do motor de vB.2).
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'FLUXO_ESCALONADO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'FLUXO_ESCALONADO', N'Fluxo de aprovação escalonado até você (SLA estourado)', N'WORKFLOW', NULL, NULL, 1);
GO
