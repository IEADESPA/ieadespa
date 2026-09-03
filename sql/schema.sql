-- ============================================================
-- Schema: Governança IEADESPA (complemento ao sistema de membros)
-- Banco alvo: Azure SQL Database
-- ============================================================

-- Catálogos geridos (evita "Templo Central" x "Sede" digitados de formas
-- diferentes para o mesmo lugar — cadastro fechado, selecionado por lista).
CREATE TABLE Congregacoes (
    CongregacaoId       INT IDENTITY PRIMARY KEY,
    Nome                NVARCHAR(150) NOT NULL,
    Ativa               BIT NOT NULL DEFAULT 1
);

CREATE TABLE Funcoes (
    FuncaoId            INT IDENTITY PRIMARY KEY,
    Nome                NVARCHAR(100) NOT NULL,
    Ativa               BIT NOT NULL DEFAULT 1
);

-- Referência mínima ao sistema de membros já existente.
-- Não duplica ficha completa: só o necessário para vincular a um órgão.
CREATE TABLE MembroReferencia (
    MembroId            INT PRIMARY KEY,           -- = matrícula do sistema atual (tb_Membros)
    Nome                NVARCHAR(200) NOT NULL,
    Funcao              NVARCHAR(100) NULL,        -- valor vindo do catálogo Funcoes (por nome)
    CongregacaoId       INT NULL REFERENCES Congregacoes(CongregacaoId),
    Status                NVARCHAR(20) NOT NULL DEFAULT 'ATIVO', -- ATIVO / LICENÇA / INATIVO / DESLIGADO
    DataNascimento      DATE NULL,                 -- para capacidade eleitoral (Art. 23, §§1º/2º)
    DataAdmissao        DATE NULL,                 -- Período de Integração de 90 dias (Art. 6º §2º) e Interstício de Fidelidade de 1 ano (Art. 23 §2º, I)
    DataBatismo         DATE NULL,                 -- batismo nas águas (Art. 6º §1º, I)
    FormaAdmissao       NVARCHAR(30) NULL,         -- BATISMO / CARTA_MUDANCA / RECONCILIACAO / ACLAMACAO (Art. 6º §1º)
    Origem              NVARCHAR(150) NULL,        -- procedência geral da admissão
    IgrejaAnterior      NVARCHAR(150) NULL,        -- igreja anterior (Carta de Mudança)
    DataRitoRecebimento DATE NULL,                 -- rito público de recebimento (Reg. Art. 130)
    NomeLidoRito        NVARCHAR(200) NULL,        -- leitura do nome no rito (Reg. Art. 130, II)
    MinistranteRito     NVARCHAR(150) NULL,        -- Pastor/Dirigente que apresentou e orou (Reg. Art. 130, II)
    DataSaida           DATE NULL,                 -- data da saída (Registro Histórico Mínimo — Reg. Art. 132 §2º II)
    MotivoSaida         NVARCHAR(200) NULL,        -- motivo da saída (Registro Histórico Mínimo)
    DizimistaFiel       BIT NULL,                  -- elegibilidade p/ Diretoria e Conselho Fiscal (Art. 23 §2º, I)
    CriadoEm            DATETIME2 DEFAULT SYSUTCDATETIME()
);
-- Capacidade eleitoral (quem vota / quem pode ser votado) é CALCULADA a partir dos campos acima
-- pelas regras do Art. 23 — ver api/shared/estatuto.js. Não existe coluna de "elegível": a
-- classificação "opera-se automaticamente" (Art. 7º §1º), nunca é uma marcação manual.

CREATE TABLE Orgaos (
    OrgaoId             INT IDENTITY PRIMARY KEY,
    Sigla               NVARCHAR(30) NOT NULL,     -- ASSEMBLEIA_GERAL, CLI, DIRETORIA_EXECUTIVA, CEI, CONSELHO_FISCAL
    Nome                NVARCHAR(200) NOT NULL,
    QuorumMinimoPct     DECIMAL(5,2) NULL,          -- ex: 10.00 (instalação)
    QuorumDeliberativoPct DECIMAL(5,2) NULL,        -- ex: 20.00 (deliberação)
    FaltasParaPerdaAssento INT NULL DEFAULT 3
);

CREATE TABLE Mandatos (
    MandatoId           INT IDENTITY PRIMARY KEY,
    OrgaoId              INT NOT NULL REFERENCES Orgaos(OrgaoId),
    DuracaoTipo          NVARCHAR(30) NOT NULL,     -- 'INDETERMINADO','1_ANO','3_ANOS'
    Blindado              BIT DEFAULT 0             -- ex: CEI, só sai por 2/3 CLI
);

CREATE TABLE Assentos (
    AssentoId            INT IDENTITY PRIMARY KEY,
    OrgaoId               INT NOT NULL REFERENCES Orgaos(OrgaoId),
    MembroId              INT NOT NULL REFERENCES MembroReferencia(MembroId),
    TipoAssento           NVARCHAR(30) NOT NULL,    -- 'ORDENACAO' ou 'FUNCAO'
    CargoOuFuncao         NVARCHAR(100) NULL,       -- ex: '1º Tesoureiro'
    DataInicio            DATE NOT NULL,
    DataFim                DATE NULL,               -- NULL = ativo
    MotivoEncerramento     NVARCHAR(200) NULL        -- 'FALTAS','FIM_MANDATO','DISCIPLINA'
);

CREATE TABLE Sessoes (
    SessaoId              INT IDENTITY PRIMARY KEY,
    OrgaoId                INT NOT NULL REFERENCES Orgaos(OrgaoId),
    Descricao                NVARCHAR(200) NULL,       -- ex: "Reunião Administrativa de Agosto"
    DataSessao              DATE NOT NULL,
    TipoSessao               NVARCHAR(30) NOT NULL DEFAULT 'ORDINARIA',
    Status                   NVARCHAR(20) NOT NULL DEFAULT 'ABERTA', -- 'ABERTA','ENCERRADA'
    SenhaAcesso               NVARCHAR(50) NULL,        -- senha da portaria (check-in)
    QuorumAtingido            BIT NULL,
    VinculadaSessaoId         INT NULL REFERENCES Sessoes(SessaoId) -- p/ sessões conjuntas no futuro
);

CREATE TABLE Presencas (
    PresencaId             INT IDENTITY PRIMARY KEY,
    SessaoId                INT NOT NULL REFERENCES Sessoes(SessaoId),
    MembroId                 INT NOT NULL REFERENCES MembroReferencia(MembroId),
    Presente                  BIT NOT NULL,
    FaltaJustificada           BIT DEFAULT 0,
    MotivoJustificativa        NVARCHAR(300) NULL,  -- preenchido quando a Secretaria justifica a falta
    JustificativaPendente      NVARCHAR(300) NULL,  -- pedido do próprio obreiro, aguardando a Secretaria aprovar/rejeitar
    FaltaDupla                 BIT DEFAULT 0        -- regra AFM + CLI na mesma data
);

CREATE TABLE ProcessosDisciplinares (
    ProcessoId               INT IDENTITY PRIMARY KEY,
    OrgaoResponsavelId        INT NOT NULL REFERENCES Orgaos(OrgaoId), -- CEI, geralmente
    MembroId                   INT NOT NULL REFERENCES MembroReferencia(MembroId),
    DataAbertura                 DATE NOT NULL,
    Status                        NVARCHAR(30) NOT NULL, -- 'EM_ANDAMENTO','AFASTAMENTO_CAUTELAR','JULGADO'
    Sigiloso                      BIT DEFAULT 1,
    DataConclusao                 DATE NULL,
    Resultado                     NVARCHAR(30) NULL       -- 'ARQUIVADO','SANCAO','EXCLUSAO'
);

CREATE TABLE Matriculas_AFM (
    MatriculaId               INT IDENTITY PRIMARY KEY,
    MembroId                   INT NOT NULL REFERENCES MembroReferencia(MembroId),
    NivelAtual                  NVARCHAR(30) NOT NULL, -- 'AUXILIAR','MISSIONARIO','DIACONO','PRESBITERO'
    StatusMatricula               NVARCHAR(20) NOT NULL DEFAULT 'ATIVA', -- 'ATIVA','INATIVA'
    DataUltimaAvaliacao            DATE NULL,
    CertificadoHabilitacao          BIT DEFAULT 0
);

CREATE TABLE Documentos (
    DocumentoId                INT IDENTITY PRIMARY KEY,
    Tipo                         NVARCHAR(50) NOT NULL,  -- 'ATA','MEMORANDO','PARECER','TERMO_POSSE'
    OrgaoId                       INT NULL REFERENCES Orgaos(OrgaoId),
    ReferenciaId                  INT NULL,               -- ex: SessaoId ou ProcessoId
    UrlBlob                       NVARCHAR(500) NOT NULL, -- caminho no Azure Blob Storage
    CriadoEm                       DATETIME2 DEFAULT SYSUTCDATETIME()
);

-- Trilha de auditoria imutável — recomendada na conversa anterior
CREATE TABLE AuditLog (
    AuditId                     BIGINT IDENTITY PRIMARY KEY,
    Tabela                       NVARCHAR(50) NOT NULL,
    RegistroId                   INT NOT NULL,
    Acao                         NVARCHAR(20) NOT NULL,   -- 'INSERT','UPDATE','DELETE'
    UsuarioId                    INT NULL,
    DataHora                     DATETIME2 DEFAULT SYSUTCDATETIME(),
    DadosAntes                   NVARCHAR(MAX) NULL,
    DadosDepois                  NVARCHAR(MAX) NULL
);

-- Gestão de Liderança por escopo (adaptado de tb_Lideranca do sistema atual)
-- Ter liderança é o que dá login no painel da Secretaria (ver api/shared/auth.js).
CREATE TABLE Lideranca (
    LiderancaId             INT IDENTITY PRIMARY KEY,
    MembroId                 INT NOT NULL REFERENCES MembroReferencia(MembroId),
    Tipo                       NVARCHAR(50) NOT NULL,   -- cargo/título livre, só exibição — não controla acesso
    Escopo                     NVARCHAR(500) NOT NULL,  -- nomes de Congregacoes separados por vírgula, ou 'TODAS'
    Permissoes                 NVARCHAR(300) NULL,      -- chaves separadas por vírgula: reunioes,pessoas,permissoes,consagracoes
    SenhaHash                  NVARCHAR(200) NULL,      -- hash (scrypt) da senha de acesso à Secretaria
    CriadoEm                   DATETIME2 DEFAULT SYSUTCDATETIME(),
    AtivoAte                   DATE NULL
);

-- Esteira de Consagrações / Processos Ministeriais
-- (adaptado de tb_Consagracoes; conceitualmente é o "Veto Doutrinário/AFM + CEI + CLI" do Estatuto)
CREATE TABLE Consagracoes (
    ConsagracaoId              UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    MembroId                    INT NOT NULL REFERENCES MembroReferencia(MembroId),
    CargoAtual                   NVARCHAR(100) NULL,
    Assunto                       NVARCHAR(100) NOT NULL,  -- 'Integração','Consagração a Presbítero', etc.
    ProponenteMembroId            INT NULL REFERENCES MembroReferencia(MembroId),
    Status                         NVARCHAR(30) NOT NULL DEFAULT 'PROTOCOLADO',
    -- Fluxo: PROTOCOLADO -> EM_ANALISE_CONSELHO -> AGUARDANDO_PLENARIO -> CONCLUIDO / REPROVADO
    DataProtocolo                   DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
    DataConclusao                    DATE NULL
);

-- ============================================================
-- Realidade jurídica: Estatuto 2026 é OFICIAL (documento registrado, fornecido em
-- 29/08/2026) e substitui o Estatuto 2021. Os 6 órgãos abaixo vêm do Art. 13.
-- Órgãos de Apoio e Execução (Art. 13, VI / Art. 47 — Departamentos, Secretarias
-- Adjuntas) NÃO entram aqui: o próprio Estatuto diz que não têm poder deliberativo
-- nem quórum (Art. 13 §2º) — viram um catálogo simples (tipo Funcoes) quando for a vez.
--
-- QuorumMinimoPct/QuorumDeliberativoPct NÃO são usados por Assembleia Geral e CLI —
-- o Estatuto usa estágios de convocação (maioria absoluta -> qualquer número 30 min
-- depois), calculados em api/shared/estatuto.js, não em percentual fixo de coluna.
-- Diretoria Executiva/CEI/Conselho Fiscal ainda não têm rito de sessão construído
-- (ver README) — a linha existe só para permitir Assentos desde já.
-- ============================================================
INSERT INTO Orgaos (Sigla, Nome, QuorumMinimoPct, QuorumDeliberativoPct, FaltasParaPerdaAssento)
VALUES
    ('ASSEMBLEIA_GERAL', 'Assembleia Geral', NULL, NULL, NULL),
    ('CLI', 'Câmara de Liderança Institucional', NULL, NULL, 3),
    ('DIRETORIA_EXECUTIVA', 'Diretoria Executiva', NULL, NULL, NULL),
    ('CEI', 'Conselho de Ética e Integridade', NULL, NULL, NULL),
    ('CONSELHO_FISCAL', 'Conselho Fiscal', NULL, NULL, NULL);

-- ============================================================
-- Regimento Interno 2026 — Governança Escalonada (Art. 104-A/B/C)
-- Níveis: Extensão da Tenda(0) > Congregação(1) > Área(2) >
--         Região/Subsede(3) > Quadrante(4) > Distrito(5) > Sede Geral(6)
-- ============================================================
CREATE TABLE Areas (
    AreaId      INT IDENTITY PRIMARY KEY,
    Nome        NVARCHAR(150) NOT NULL,
    Ativa       BIT NOT NULL DEFAULT 1,
    AtivadaEm   DATE NULL            -- gatilho: >= 3 congregações
);

CREATE TABLE Regioes (
    RegiaoId    INT IDENTITY PRIMARY KEY,
    Nome        NVARCHAR(150) NOT NULL,
    Subsede     BIT NOT NULL DEFAULT 0,
    Ativa       BIT NOT NULL DEFAULT 0  -- gatilho: >= 3 áreas
);

CREATE TABLE Quadrantes (
    QuadranteId INT IDENTITY PRIMARY KEY,
    Nome        NVARCHAR(150) NOT NULL,
    Ativo       BIT NOT NULL DEFAULT 0  -- latente; ativa por Resolução da CLI
);

CREATE TABLE Distritos (
    DistritoId  INT IDENTITY PRIMARY KEY,
    Nome        NVARCHAR(150) NOT NULL,
    Ativo       BIT NOT NULL DEFAULT 0
);

-- Congregação passa a pertencer a uma Área (nível 2)
ALTER TABLE Congregacoes ADD AreaId INT NULL REFERENCES Areas(AreaId);

-- Histórico de mudança de área (relatório antigo preserva a área da época)
CREATE TABLE VinculoCongregacaoArea (
    VinculoId     INT IDENTITY PRIMARY KEY,
    CongregacaoId INT NOT NULL REFERENCES Congregacoes(CongregacaoId),
    AreaId        INT NOT NULL REFERENCES Areas(AreaId),
    DataInicio    DATE NOT NULL,
    DataFim       DATE NULL
);

CREATE TABLE ExtensoesTenda (
    ExtensaoId       INT IDENTITY PRIMARY KEY,
    Nome             NVARCHAR(150) NOT NULL,
    CongregacaoMaeId INT NOT NULL REFERENCES Congregacoes(CongregacaoId),
    Ativa            BIT NOT NULL DEFAULT 1
);

-- Juntas/conselhos de gestão por nível (Órgãos de Apoio e Execução)
CREATE TABLE OrgaosLocais (
    OrgaoLocalId INT IDENTITY PRIMARY KEY,
    Sigla        NVARCHAR(30) NOT NULL,   -- JAI, JEA, CRA, TER, CEQ, DISTRITO
    Nome         NVARCHAR(200) NOT NULL,
    Nivel        INT NOT NULL,            -- 1..5
    ReferenciaId INT NULL,                -- AreaId/RegiaoId/... conforme o nível
    Ativo        BIT NOT NULL DEFAULT 1
);

-- ============================================================
-- Situação do membro + afiliação a departamento + escada ministerial
-- (Regimento Art. 71, 130-133-B)
-- ============================================================
ALTER TABLE MembroReferencia ADD
    SituacaoMembro    NVARCHAR(30) NOT NULL DEFAULT 'EM_COMUNHAO', -- EM_COMUNHAO / SEM_COMUNHAO / CONGREGADO / NOVO_CONVERTIDO
    DepartamentoId    INT NULL,           -- afiliação (Departamentos)
    CargoMinisterial  NVARCHAR(30) NULL;  -- AUXILIAR / MISSIONARIO / DIACONO / PRESBITERO / EVANGELISTA / PASTOR

CREATE TABLE Departamentos (
    DepartamentoId INT IDENTITY PRIMARY KEY,
    Sigla          NVARCHAR(30) NOT NULL,
    Nome           NVARCHAR(150) NOT NULL,
    Numero         INT NULL,              -- 01..08
    Ativo          BIT NOT NULL DEFAULT 1
);

INSERT INTO Departamentos (Sigla, Nome, Numero) VALUES
    ('UCADESPA',  'União de Crianças',            1),
    ('UMADESPA',  'União de Mocidade',            2),
    ('USADESPA',  'União de Senhoras',            3),
    ('UHADESPA',  'União de Homens',              4),
    ('SEMIADESPA','Missões',                       5),
    ('ACAO_DA_FE','Ação Social',                   6),
    ('EBD',       'Escola Bíblica Dominical',      7),
    ('FAMILIA',   'Ministério de Família',         8);

ALTER TABLE MembroReferencia ADD CONSTRAINT FK_MembroReferencia_Departamento
    FOREIGN KEY (DepartamentoId) REFERENCES Departamentos(DepartamentoId);

-- AFM (Regimento Art. 66-72): amplia Matriculas_AFM existente.
-- CertificadoHabilitacao já existe = CHM (Certificado de Habilitação Ministerial).
ALTER TABLE Matriculas_AFM ADD
    NivelEscolaridade NVARCHAR(30) NULL;  -- BASICO / MEDIO / AVANCADO / BACHAREL

-- ============================================================
-- Configurabilidade total: catálogos configuráveis (CRUD + auditoria)
-- ============================================================
CREATE TABLE SituacoesMembro (
    SituacaoId INT IDENTITY PRIMARY KEY,
    Sigla      NVARCHAR(30) NOT NULL,
    Nome       NVARCHAR(100) NOT NULL,
    Ativa      BIT NOT NULL DEFAULT 1
);
INSERT INTO SituacoesMembro (Sigla, Nome) VALUES
    ('CONGREGADO','Congregado'),
    ('EM_COMUNHAO','Membro em Comunhão'),
    ('SEM_COMUNHAO','Membro sem Comunhão');

CREATE TABLE StatusMembro (
    StatusId INT IDENTITY PRIMARY KEY,
    Sigla    NVARCHAR(30) NOT NULL,
    Nome     NVARCHAR(100) NOT NULL,
    Ativa    BIT NOT NULL DEFAULT 1
);
INSERT INTO StatusMembro (Sigla, Nome) VALUES
    ('ATIVO','ATIVO'),
    ('LICENÇA','LICENÇA'),
    ('INATIVO','INATIVO'),
    ('DESLIGADO','DESLIGADO'),
    ('FALECIDO','Falecido'); -- v1.5 (migração 019)

CREATE TABLE CargosMinisteriais (
    CargoId INT IDENTITY PRIMARY KEY,
    Sigla   NVARCHAR(30) NOT NULL,
    Nome    NVARCHAR(100) NOT NULL,
    Ordem   INT NULL,           -- escada ministerial (Art. 71)
    Ativo   BIT NOT NULL DEFAULT 1
);
INSERT INTO CargosMinisteriais (Sigla, Nome, Ordem) VALUES
    ('MEMBRO','Membro',0),
    ('AUXILIAR','Auxiliar',1),
    ('MISSIONARIO','Missionário(a)',2),
    ('DIACONO','Diácono',3),
    ('PRESBITERO','Presbítero',4),
    ('EVANGELISTA','Evangelista',5),
    ('PASTOR','Pastor',6);

-- A situação e o cargo do membro referenciam os catálogos acima (valores configuráveis).
-- As 4 categorias de membresia (Congregado / Membro em Comunhão / Capacidade Eleitoral
-- Ativa / Membro Elegível) são CALCULADAS em api/shared/estatuto.js a partir de:
--   SituacaoMembro + DataNascimento + DataAdmissao + DizimistaFiel + ProcessosDisciplinares.

-- Processo disciplinar com término automático:
--   ao registrar a sanção, informa-se DiasSancao; DataTerminoPrevisao = DataAbertura + DiasSancao.
--   Enquanto houver processo ATIVO, o membro tem voto/ser votado suspensos; ao vencer o prazo,
--   sai da disciplina automaticamente (SituacaoMembro volta a EM_COMUNHAO).
ALTER TABLE ProcessosDisciplinares ADD
    DiasSancao          INT NULL,
    DataTerminoPrevisao DATE NULL;

-- ============================================================
-- Perfil do membro (v0.2): dados de contato (LGPD, coleta mínima) +
-- catálogo de Prazos citados no Estatuto/Regimento.
-- ============================================================
ALTER TABLE MembroReferencia ADD
    Telefone  NVARCHAR(20)  NULL,
    Email     NVARCHAR(150) NULL,
    Endereco  NVARCHAR(300) NULL;

-- Vínculo do membro com a Extensão da Tenda (nível 0), quando aplicável —
-- fecha a lacuna que impedia "EXTENSAO" de virar um escopo de acesso real
-- (ver api/shared/escopo.js e api/GestaoLideranca/index.js).
ALTER TABLE MembroReferencia ADD ExtensaoId INT NULL REFERENCES ExtensoesTenda(ExtensaoId);

CREATE TABLE Prazos (
    PrazoId INT IDENTITY PRIMARY KEY,
    Sigla   NVARCHAR(40) NOT NULL,
    Nome    NVARCHAR(150) NOT NULL,
    Dias    INT NOT NULL,
    Ativo   BIT NOT NULL DEFAULT 1
);
INSERT INTO Prazos (Sigla, Nome, Dias) VALUES
    ('INTEGRACAO',            'Período de Integração (Art. 6º §2º)',                          90),
    ('INTERSTICIO_FIDELIDADE','Interstício de Fidelidade p/ Diretoria/CF (Art. 23 §2º, I)',   365),
    ('CARTA_RECOMENDACAO',    'Validade da Carta de Recomendação (Reg. Art. 131)',             30),
    ('DEFESA_PREVIA',         'Prazo de defesa prévia no processo disciplinar (Reg. Art. 101)', 5),
    ('PARECER_COMISSAO',      'Parecer de comissão da CLI (Regimento)',                         15),
    ('RECURSO_ASSEMBLEIA',    'Recurso à Assembleia contra perda de membresia (Art. 11)',       30),
    ('ABANDONO_MATERIAL',     'Abandono Eclesiástico Material (Art. 11)',                       90),
    ('ABANDONO_DIGITAL',      'Abandono Eclesiástico Digital/incomunicável (Art. 11)',          90);

-- ============================================================
-- Processo Disciplinar (núcleo mínimo, v0.2) — catálogo de infrações/penalidades
-- e status intermediário AFASTAMENTO_CAUTELAR ficam para v3.3/v3.4/v3.2.
-- ============================================================
ALTER TABLE ProcessosDisciplinares ADD Motivo NVARCHAR(500) NULL;

-- ============================================================
-- Vínculo Familiar (núcleo mínimo, v0.2) — cálculo de grau de parentesco por
-- travessia (shared/parentesco.js) nasce em v2.6/v3.1, quando tiver consumidor.
-- ============================================================
CREATE TABLE TiposVinculoFamiliar (
    TipoVinculoId  INT IDENTITY PRIMARY KEY,
    Codigo         NVARCHAR(30) NOT NULL,
    RotuloDireto   NVARCHAR(100) NOT NULL,
    RotuloInverso  NVARCHAR(100) NULL,
    Simetrico      BIT NOT NULL DEFAULT 0,
    Ativo          BIT NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX UQ_TiposVinculoFamiliar_Codigo ON TiposVinculoFamiliar(Codigo);
INSERT INTO TiposVinculoFamiliar (Codigo, RotuloDireto, RotuloInverso, Simetrico) VALUES
    ('CONJUGE',         'Cônjuge de',              NULL,               1),
    ('PAI_FILHO',       'Pai/Mãe de',              'Filho(a) de',      0),
    ('IRMAO',           'Irmão/Irmã de',           NULL,               1),
    ('SOGRO_GENRO_NORA','Sogro/Sogra de',          'Genro/Nora de',    0);

CREATE TABLE VinculosFamiliares (
    VinculoId        INT IDENTITY PRIMARY KEY,
    MembroId         INT NOT NULL REFERENCES MembroReferencia(MembroId),
    MembroParenteId  INT NOT NULL REFERENCES MembroReferencia(MembroId),
    TipoVinculoId    INT NOT NULL REFERENCES TiposVinculoFamiliar(TipoVinculoId),
    CriadoEm         DATETIME2 DEFAULT SYSUTCDATETIME(),
    CriadoPor        INT NULL REFERENCES MembroReferencia(MembroId),
    CONSTRAINT CK_VinculosFamiliares_NaoAutoVinculo CHECK (MembroId <> MembroParenteId)
);
CREATE UNIQUE INDEX UQ_VinculosFamiliares_Par ON VinculosFamiliares(MembroId, MembroParenteId, TipoVinculoId);

-- ============================================================
-- Cartas de Trânsito (v1.4 — Regimento Art. 130/131/132)
-- ============================================================
CREATE TABLE CartasTransito (
    CartaId            INT IDENTITY PRIMARY KEY,
    MembroId           INT NOT NULL REFERENCES MembroReferencia(MembroId),
    Tipo               NVARCHAR(30) NOT NULL,          -- RECOMENDACAO / MUDANCA / ATESTADO_SUPLETIVO
    Status             NVARCHAR(30) NOT NULL DEFAULT 'SOLICITADA',
    Destino            NVARCHAR(150) NULL,
    MotivoSaida        NVARCHAR(200) NULL,
    DeclaracaoCiencia  NVARCHAR(500) NULL,
    DataSolicitacao    DATETIME2 DEFAULT SYSUTCDATETIME(),
    DataConfirmacao    DATETIME2 NULL,
    DataEmissao        DATE NULL,
    DataValidade       DATE NULL,
    SolicitadoPor      INT NULL REFERENCES MembroReferencia(MembroId),
    EmitidoPor         INT NULL REFERENCES MembroReferencia(MembroId),
    CriadoEm           DATETIME2 DEFAULT SYSUTCDATETIME()
);

-- Estado Civil (v1.4 — modelo impresso da Carta de Trânsito, migração 018)
ALTER TABLE MembroReferencia ADD
    EstadoCivil NVARCHAR(20) NULL; -- SOLTEIRO / CASADO / VIUVO / DIVORCIADO / UNIAO_ESTAVEL

-- ============================================================
-- Perda de Membresia (v1.5 — Regimento Art. 11, migração 019)
-- ============================================================
ALTER TABLE MembroReferencia ADD
    DataAfastamento DATE NULL; -- lançada manualmente pela Secretaria (início do Abandono Material)

CREATE TABLE ProcedimentosAbandono (
    ProcedimentoId    INT IDENTITY PRIMARY KEY,
    MembroId          INT NOT NULL REFERENCES MembroReferencia(MembroId),
    Status            NVARCHAR(30) NOT NULL DEFAULT 'NOTIFICADO', -- NOTIFICADO / HOMOLOGADO / ARQUIVADO
    DataNotificacao   DATE NOT NULL,
    DataEdital        DATE NULL,
    PrazoDias         INT NOT NULL DEFAULT 15,
    DataHomologacao   DATE NULL,
    HomologadoPor     INT NULL REFERENCES MembroReferencia(MembroId),
    RecursoInterposto BIT NOT NULL DEFAULT 0,
    DataRecurso       DATE NULL,
    ResultadoRecurso  NVARCHAR(30) NULL,                          -- PENDENTE / MANTIDO / REVERTIDO
    CriadoEm          DATETIME2 DEFAULT SYSUTCDATETIME(),
    Tipo              NVARCHAR(20) NOT NULL DEFAULT 'MATERIAL'     -- MATERIAL / DIGITAL (migração 020)
);

-- ============================================================
-- Abandono Eclesiástico Digital (v1.5 — Estatuto Art. 11 V e Art. 12, migração 020)
-- ============================================================
CREATE TABLE CanaisOficiaisComunicacao (
    CanalId INT IDENTITY PRIMARY KEY,
    Sigla   NVARCHAR(30) NOT NULL,
    Nome    NVARCHAR(150) NOT NULL,
    Ativo   BIT NOT NULL DEFAULT 1
);
INSERT INTO CanaisOficiaisComunicacao (Sigla, Nome) VALUES
    ('WHATSAPP_INSTITUCIONAL', 'WhatsApp institucional da Secretaria'),
    ('EMAIL_OFICIAL', 'E-mail oficial da IEADESPA'),
    ('SISTEMA', 'Sistema/Meu Painel');

CREATE TABLE TentativasContatoAbandono (
    TentativaId   INT IDENTITY PRIMARY KEY,
    MembroId      INT NOT NULL REFERENCES MembroReferencia(MembroId),
    CanalId       INT NOT NULL REFERENCES CanaisOficiaisComunicacao(CanalId),
    DataTentativa DATE NOT NULL,
    Observacao    NVARCHAR(300) NULL,
    RegistradoPor INT NULL REFERENCES MembroReferencia(MembroId),
    CriadoEm      DATETIME2 DEFAULT SYSUTCDATETIME()
);

-- ============================================================
-- Auditoria e trilha de dados (v0.3) — Encarregado de Dados (papel), trilha de
-- consentimento LGPD (append-only por tipo de dado) e solicitações do titular
-- (Art. 18 LGPD: acesso, exclusão, retificação, portabilidade). Catálogo
-- `PoliticasRetencao` é informativo, no mesmo espírito de `Prazos` (v0.1) —
-- não roda expurgo automático.
-- ============================================================
INSERT INTO Funcionalidades (Chave, Nome) VALUES ('protecaodedados', 'Proteção de Dados (LGPD)');
INSERT INTO Papeis (Nome, Nivel, Permissoes) VALUES ('Encarregado de Dados', 'GLOBAL', 'auditoria,protecaodedados');

CREATE TABLE ConsentimentosLGPD (
    ConsentimentoId INT IDENTITY PRIMARY KEY,
    MembroId        INT NOT NULL REFERENCES MembroReferencia(MembroId),
    Tipo            NVARCHAR(40) NOT NULL DEFAULT 'DADOS_CONTATO',
    Concedido       BIT NOT NULL,
    BaseLegal       NVARCHAR(40) NOT NULL DEFAULT 'CONSENTIMENTO',
    Observacao      NVARCHAR(300) NULL,
    RegistradoPor   INT NULL REFERENCES MembroReferencia(MembroId),
    DataRegistro    DATETIME2 DEFAULT SYSUTCDATETIME()
);

CREATE TABLE SolicitacoesTitularLGPD (
    SolicitacaoId   INT IDENTITY PRIMARY KEY,
    MembroId        INT NOT NULL REFERENCES MembroReferencia(MembroId),
    Tipo            NVARCHAR(30) NOT NULL,     -- ACESSO / EXCLUSAO / RETIFICACAO / PORTABILIDADE
    Descricao       NVARCHAR(500) NULL,
    Status          NVARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
    DataSolicitacao DATETIME2 DEFAULT SYSUTCDATETIME(),
    DataResposta    DATETIME2 NULL,
    RespostaTexto   NVARCHAR(500) NULL,
    AtendidoPor     INT NULL REFERENCES MembroReferencia(MembroId)
);

CREATE TABLE PoliticasRetencao (
    PoliticaId   INT IDENTITY PRIMARY KEY,
    Categoria    NVARCHAR(60) NOT NULL,
    BaseLegal    NVARCHAR(300) NOT NULL,
    DiasRetencao INT NULL,
    Ativo        BIT NOT NULL DEFAULT 1
);
