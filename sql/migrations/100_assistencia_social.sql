-- ============================================================
-- Migração 100 — v5.9: Assistência Social (Ação da Fé)
--
-- O Regimento condiciona a ação social a cadastro (Art. 46 — "sempre
-- mediante cadastro socioeconômico") e a triagem técnica de profissional
-- credenciado (Art. 52, VII) — não existia NENHUMA versão disso até aqui.
-- É também, por confissão do próprio README, o módulo com o dado mais
-- sensível do sistema inteiro (situação socioeconômica de família
-- assistida) — cada decisão abaixo trata isso como restrição real, não
-- só comentário.
--
-- Decisões de arquitetura (avaliadas e documentadas, não puladas):
--
-- 1) "Família"/agregado familiar não tinha NENHUM cadastro próprio no
--    sistema até hoje — VinculosFamiliares (v2.6) é um grafo de parentesco
--    entre MEMBROS, e o público da ação social é majoritariamente NÃO
--    membro (a comunidade ao redor, não só quem já está em
--    MembroReferencia). Em vez de forçar o beneficiário a virar membro só
--    pra ser cadastrado, ou de duplicar o grafo de parentesco pra gente de
--    fora, criada uma unidade mínima nova — AssistenciaSocialFamilias —
--    responsável pelo agregado (nome do responsável, CPF, contato,
--    endereço), com MembroId OPCIONAL (preenchido só quando o responsável
--    também é membro). É o "conceito mínimo de família" pedido no
--    catálogo desta versão — documentado aqui como escolha, não herdado
--    de nenhuma outra tabela.
--
-- 2) O cadastro socioeconômico (AssistenciaSocialCadastros) é o dado
--    sensível de verdade — renda, situação de moradia, composição do
--    núcleo. Base legal gravada NO PRÓPRIO REGISTRO (mesma coluna
--    BaseLegal já usada em ConsentimentosLGPD desde a migração 012, mesmo
--    vocabulário: CONSENTIMENTO/OBRIGACAO_LEGAL/LEGITIMO_INTERESSE/
--    EXECUCAO_ESTATUTO) — não dá pra reaproveitar a TABELA
--    ConsentimentosLGPD porque ela exige MembroId NOT NULL (FK pra
--    MembroReferencia), e o beneficiário majoritário NÃO é membro. Análise
--    de base legal (mesmo espírito investigativo da vB.8, "achado real,
--    não fabricado"): o Art. 11, II, "a" da LGPD (organização religiosa,
--    vínculo regular) NÃO se aplica aqui — o titular tipicamente não tem
--    vínculo de membresia. A base correta, na falta de vínculo, é o Art.
--    7º, I (consentimento específico do titular/responsável familiar) —
--    por isso ConsentimentoObtidoEm é NOT NULL: sem consentimento
--    registrado, o cadastro não pode nascer. Retenção própria (ver
--    PoliticasRetencao abaixo), separada da retenção de ex-membro (vB.8/
--    migração 084) — outro titular, outro prazo, outra justificativa.
--
-- 3) Triagem/parecer técnico (AssistenciaSocialPareceres) é do profissional
--    credenciado, não do balcão — por isso existe uma tabela própria de
--    credenciamento (AssistenciaSocialProfissionais, Ativo + número de
--    registro no Conselho de Classe — CRESS) e o parecer só pode ser
--    gravado com ProfissionalId apontando pra uma linha ATIVA dessa
--    tabela (shared/assistenciaSocial.js::podeAssinarParecer). Mesmo
--    princípio de "elo com pessoa credenciada específica, nunca decisão
--    anônima" que a v5.6 usa pra líder de equipe (EscalasEquipeMembros) e
--    a v5.7 usa pra entrevistador (EtapaEntrevistaEntrevistadorId) — aqui
--    elevado a tabela própria porque "ser Assistente Social" é uma
--    credencial externa (CRESS), não um papel interno do sistema.
--
-- 4) Entregas/benefícios (AssistenciaSocialEntregas) — histórico por
--    família, controle de recorrência calculado NA LEITURA (nunca
--    digitado: shared/assistenciaSocial.js::detectarRecorrencia), mesmo
--    espírito de "vencimento/status sempre calculado" já usado em Cartas
--    de Trânsito (v017) e na esteira de habilitação (v5.7). DespesaId
--    opcional aponta pra DespesasTesourariaDepartamento (v5.4, migração
--    095) do departamento Ação da Fé — só quando a entrega tiver custo
--    lançado no livro-caixa departamental.
--
-- 5) Prestação de contas separada do caixa comum: a v5.4 (migração 095,
--    decisão de arquitetura já registrada lá) já isolou a tesouraria por
--    departamento (TesourariasDepartamento/DespesasTesourariaDepartamento)
--    do caixa geral (SaidasTesouraria) de propósito — e "Ação da Fé" já é
--    um dos 8 departamentos com essa tesouraria própria (Sigla
--    'ACAO_DA_FE', migração 001). Não foi criado um livro-caixa paralelo:
--    o insumo pra v9.6 (CEBAS) é a AGREGAÇÃO de
--    TesourariasDepartamento+DespesasTesourariaDepartamento (filtradas
--    pelo departamento Ação da Fé) com AssistenciaSocialEntregas
--    (shared/assistenciaSocial.js::relatorioPrestacaoContas) — dado
--    formatado pra v9.6 consumir depois, sem fabricar o módulo em si.
--
-- 6) Isenção de taxa de cessão (Art. 156 §3º, III): a v4.18 já tinha
--    CessoesTemplo.IsencaoTaxa (migração 068, comentada lá como "isenção
--    social, §2º III" — mesmo dispositivo do Art. 156, citado em parágrafo
--    diferente pela pesquisa desta versão; tratado aqui como a MESMA
--    flag, não uma segunda). O que faltava era: (a) a isenção social
--    exigir justificativa registrada (MotivoIsencaoSocial NOT NULL
--    quando marcada como ação social — não dá pra isentar "de graça"
--    sem motivo escrito) e (b) o elo opcional com a família assistida
--    (AssistenciaSocialFamiliaId), pra quando o uso do templo for
--    vinculado a um programa/família já cadastrados aqui. Extensão por
--    ALTER na tabela existente — não nasceu tabela nova de cessão.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

-- ---- 1) Unidade mínima de família/agregado familiar (decisão 1) ----
IF OBJECT_ID(N'dbo.AssistenciaSocialFamilias', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AssistenciaSocialFamilias (
        FamiliaId               INT IDENTITY PRIMARY KEY,
        CongregacaoId           INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        ResponsavelNome         NVARCHAR(150) NOT NULL,
        ResponsavelCpf          NVARCHAR(14) NULL,
        ResponsavelContato      NVARCHAR(100) NULL,
        Endereco                NVARCHAR(300) NULL,
        MembroId                INT NULL REFERENCES dbo.MembroReferencia(MembroId), -- opcional: responsável também é membro
        Ativo                   BIT NOT NULL DEFAULT 1,
        CriadoPorMembroId       INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm                DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- ---- 2) Credenciamento do Assistente Social (decisão 3) ----
IF OBJECT_ID(N'dbo.AssistenciaSocialProfissionais', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AssistenciaSocialProfissionais (
        ProfissionalId          INT IDENTITY PRIMARY KEY,
        MembroId                INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        NumeroCredencial        NVARCHAR(30) NOT NULL, -- registro no CRESS
        Ativo                   BIT NOT NULL DEFAULT 1,
        CredenciadoPorMembroId  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId), -- nível Global (Diretoria)
        CredenciadoEm           DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        DescredenciadoEm        DATETIME2 NULL,
        DescredenciadoMotivo    NVARCHAR(300) NULL,
        CONSTRAINT UQ_AssistenciaSocialProfissionais_Membro UNIQUE (MembroId)
    );
END
GO

-- ---- 3) Cadastro socioeconômico — dado sensível (decisão 2) ----
IF OBJECT_ID(N'dbo.AssistenciaSocialCadastros', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AssistenciaSocialCadastros (
        CadastroId              INT IDENTITY PRIMARY KEY,
        FamiliaId               INT NOT NULL REFERENCES dbo.AssistenciaSocialFamilias(FamiliaId),
        QtdPessoasNucleo        INT NOT NULL,
        RendaFamiliarMensal     DECIMAL(12,2) NULL,
        SituacaoMoradia         NVARCHAR(30) NOT NULL DEFAULT 'OUTRO', -- PROPRIA/ALUGADA/CEDIDA/SITUACAO_RISCO/OUTRO
        Observacoes             NVARCHAR(1000) NULL,   -- narrativa sensível — acesso restrito por papel

        -- LGPD (vB.8, decisão 2 acima): base legal registrada NO PRÓPRIO
        -- CADASTRO, mesmo vocabulário de ConsentimentosLGPD (migração 012).
        BaseLegal               NVARCHAR(40) NOT NULL DEFAULT 'CONSENTIMENTO',
        ConsentimentoObtidoEm   DATETIME2 NOT NULL,

        Status                  NVARCHAR(20) NOT NULL DEFAULT 'ATIVO', -- ATIVO/ENCERRADO
        EncerradoMotivo         NVARCHAR(300) NULL,
        EncerradoEm             DATETIME2 NULL,

        RegistradoPorMembroId   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm                DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        AtualizadoEm            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.AssistenciaSocialCadastros') AND name = N'IX_AssistenciaSocialCadastros_Familia')
    CREATE INDEX IX_AssistenciaSocialCadastros_Familia ON dbo.AssistenciaSocialCadastros(FamiliaId);
GO

-- ---- 4) Parecer técnico — do profissional, não do balcão (decisão 3) ----
IF OBJECT_ID(N'dbo.AssistenciaSocialPareceres', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AssistenciaSocialPareceres (
        ParecerId               INT IDENTITY PRIMARY KEY,
        CadastroId              INT NOT NULL REFERENCES dbo.AssistenciaSocialCadastros(CadastroId),
        ProfissionalId          INT NOT NULL REFERENCES dbo.AssistenciaSocialProfissionais(ProfissionalId),
        Resultado               NVARCHAR(30) NOT NULL, -- APROVADO/NEGADO/PENDENTE_DOCUMENTACAO
        Parecer                 NVARCHAR(2000) NOT NULL,
        AssinadoEm              DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME() -- "assinatura" = carimbo do próprio profissional credenciado no ato do POST
    );
END
GO

-- ---- 5) Entregas/benefícios + recorrência (decisão 4) ----
IF OBJECT_ID(N'dbo.AssistenciaSocialEntregas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AssistenciaSocialEntregas (
        EntregaId               INT IDENTITY PRIMARY KEY,
        FamiliaId               INT NOT NULL REFERENCES dbo.AssistenciaSocialFamilias(FamiliaId),
        TipoBeneficio           NVARCHAR(30) NOT NULL, -- CESTA_BASICA/AUXILIO_FINANCEIRO/MEDICAMENTO/OUTRO
        Descricao               NVARCHAR(300) NULL,
        Valor                   DECIMAL(12,2) NULL,
        DataEntrega             DATE NOT NULL,
        DespesaTesourariaDepartamentoId INT NULL REFERENCES dbo.DespesasTesourariaDepartamento(DespesaId), -- opcional: custo lançado no livro-caixa da Ação da Fé (v5.4)
        RegistradoPorMembroId   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm                DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.AssistenciaSocialEntregas') AND name = N'IX_AssistenciaSocialEntregas_Familia')
    CREATE INDEX IX_AssistenciaSocialEntregas_Familia ON dbo.AssistenciaSocialEntregas(FamiliaId, TipoBeneficio, DataEntrega);
GO

-- ---- 6) Isenção de taxa de cessão por ação social (decisão 6, v4.18/v4.21) ----
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.CessoesTemplo') AND name = N'FinalidadeAcaoSocial')
    ALTER TABLE dbo.CessoesTemplo ADD FinalidadeAcaoSocial BIT NOT NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.CessoesTemplo') AND name = N'MotivoIsencaoSocial')
    ALTER TABLE dbo.CessoesTemplo ADD MotivoIsencaoSocial NVARCHAR(300) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.CessoesTemplo') AND name = N'AssistenciaSocialFamiliaId')
    ALTER TABLE dbo.CessoesTemplo ADD AssistenciaSocialFamiliaId INT NULL REFERENCES dbo.AssistenciaSocialFamilias(FamiliaId);
GO

-- ---- Permissão nova (nunca concedida automaticamente a papel nenhum — mesmo achado repetido desde a migração 093) ----
IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'assistencia_social')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('assistencia_social', 'Assistência Social (Ação da Fé)');
GO

-- ---- Retenção própria do cadastro socioeconômico (decisão 2) — separada
-- da retenção de ex-membro (vB.8/migração 084). 1825 dias (5 anos):
-- mesmo horizonte da guarda de documento fiscal/prestação de contas
-- (Estatuto Art. 36 — prestação de contas contínua) que este cadastro
-- alimenta (item 5, prestação de contas do programa social) — não um
-- número arbitrário, é o prazo que a própria prestação de contas já exige
-- alhures no sistema.
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Cadastro Socioeconômico (Assistência Social)')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (
        N'Cadastro Socioeconômico (Assistência Social)',
        N'Regimento Art. 46 (cadastro obrigatório dos programas assistenciais) + LGPD Art. 7º, I (consentimento — titular tipicamente sem vínculo de membresia) + Art. 16, I (retenção pelo prazo de prestação de contas, Estatuto Art. 36).',
        1825
    );
GO
