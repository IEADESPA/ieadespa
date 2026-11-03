-- ============================================================
-- Migração 165 — v9.1: Entidades vinculadas (hospitais, escolas, ONGs e associações com CNPJ próprio). Desenho em docs/plano/fase-9-entidades-vinculadas.md.
--
-- Base legal: Estatuto Art. 64 a 68 (Capítulo XIII), Art. 59, Art. 61, II, Art. 18, VII, "b", e Art. 19, Art. 33, IV, Art. 76 §2º; Regimento Art. 47-A e Art. 153.
--
--   EntidadeTipos / EntidadeTipoFormacoes: o catálogo dos tipos (Hospital, Escola, ONG...) com a natureza e as formações aceitas para o gestor (Reg. Art. 153).
--   EntidadesVinculadas: o cadastro (CNPJ de matriz, único), a aprovação da CLI e a ratificação da Assembleia (criação e extinção), a periodicidade da prestação
--                        de contas e a extinção com o destino do patrimônio (Art. 68).
--   EntidadeDirigentes: quem a IEADESPA põe na direção — indicação do Pastor Presidente e homologação da CLI (Art. 65 §1º); membro ou profissional de fora.
--   EntidadeIntervencoes: apuração, notificação (5 dias), decretação, ratificação da CLI em 15 dias sob pena de caducar (Reg. Art. 47-A), defesa e encerramento.
--   EntidadePrestacoes: a prestação de contas de cada período (Art. 67), a apreciação da CLI e a verificação anual do Conselho Fiscal (Art. 66 §3º).
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.EntidadeTipos') AND type = N'U')
BEGIN
    CREATE TABLE dbo.EntidadeTipos (
        TipoId          INT IDENTITY CONSTRAINT PK_EntidadeTipos PRIMARY KEY,
        Nome            NVARCHAR(80) NOT NULL,
        Natureza        NVARCHAR(20) NOT NULL,
        Ativo           BIT NOT NULL CONSTRAINT DF_EntidadeTipos_Ativo DEFAULT 1,
        CriadoPor       INT NULL,
        CriadoEm        DATETIME2 NOT NULL CONSTRAINT DF_EntidadeTipos_Em DEFAULT SYSUTCDATETIME(),
        AtualizadoPor   INT NULL,
        AtualizadoEm    DATETIME2 NULL,
        CONSTRAINT UQ_EntidadeTipos_Nome UNIQUE (Nome),
        CONSTRAINT CK_EntidadeTipos_Natureza CHECK (Natureza IS NOT NULL AND Natureza IN (N'ASSISTENCIA_SOCIAL', N'SAUDE', N'EDUCACAO', N'OUTRA'))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.EntidadeTipoFormacoes') AND type = N'U')
BEGIN
    CREATE TABLE dbo.EntidadeTipoFormacoes (
        TipoId      INT NOT NULL CONSTRAINT FK_EntidadeTipoFormacoes_Tipo REFERENCES dbo.EntidadeTipos(TipoId),
        Formacao    NVARCHAR(80) NOT NULL,
        CONSTRAINT PK_EntidadeTipoFormacoes PRIMARY KEY (TipoId, Formacao)
    );
END
GO
-- Os tipos do Estatuto (Art. 64 e 68) e o exemplo do Regimento Art. 153. Semeados só se não existirem: o nível geral renomeia, desativa e mexe nas formações.
IF NOT EXISTS (SELECT 1 FROM dbo.EntidadeTipos WHERE Nome = N'Hospital')
    INSERT INTO dbo.EntidadeTipos (Nome, Natureza) VALUES (N'Hospital', N'SAUDE');
IF NOT EXISTS (SELECT 1 FROM dbo.EntidadeTipos WHERE Nome = N'Escola')
    INSERT INTO dbo.EntidadeTipos (Nome, Natureza) VALUES (N'Escola', N'EDUCACAO');
IF NOT EXISTS (SELECT 1 FROM dbo.EntidadeTipos WHERE Nome = N'ONG / Associação de assistência social')
    INSERT INTO dbo.EntidadeTipos (Nome, Natureza) VALUES (N'ONG / Associação de assistência social', N'ASSISTENCIA_SOCIAL');
IF NOT EXISTS (SELECT 1 FROM dbo.EntidadeTipos WHERE Nome = N'Outra entidade')
    INSERT INTO dbo.EntidadeTipos (Nome, Natureza) VALUES (N'Outra entidade', N'OUTRA');
GO
-- As formações só entram quando o tipo acaba de nascer sem nenhuma (rodar de novo não desfaz o que a tela mudou).
IF NOT EXISTS (SELECT 1 FROM dbo.EntidadeTipoFormacoes f JOIN dbo.EntidadeTipos t ON t.TipoId = f.TipoId WHERE t.Nome = N'Hospital')
    AND NOT EXISTS (SELECT 1 FROM dbo.EntidadeTipos WHERE Nome = N'Hospital' AND AtualizadoEm IS NOT NULL)
    INSERT INTO dbo.EntidadeTipoFormacoes (TipoId, Formacao)
    SELECT TipoId, v.F FROM dbo.EntidadeTipos CROSS JOIN (VALUES (N'Gestão hospitalar'), (N'Medicina')) v(F) WHERE Nome = N'Hospital';
IF NOT EXISTS (SELECT 1 FROM dbo.EntidadeTipoFormacoes f JOIN dbo.EntidadeTipos t ON t.TipoId = f.TipoId WHERE t.Nome = N'Escola')
    AND NOT EXISTS (SELECT 1 FROM dbo.EntidadeTipos WHERE Nome = N'Escola' AND AtualizadoEm IS NOT NULL)
    INSERT INTO dbo.EntidadeTipoFormacoes (TipoId, Formacao)
    SELECT TipoId, N'Pedagogia' FROM dbo.EntidadeTipos WHERE Nome = N'Escola';
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.EntidadesVinculadas') AND type = N'U')
BEGIN
    CREATE TABLE dbo.EntidadesVinculadas (
        EntidadeId              INT IDENTITY CONSTRAINT PK_EntidadesVinculadas PRIMARY KEY,
        RazaoSocial             NVARCHAR(150) NOT NULL,
        NomeFantasia            NVARCHAR(100) NULL,
        Cnpj                    CHAR(14) NOT NULL,
        TipoId                  INT NOT NULL CONSTRAINT FK_EntidadesVinculadas_Tipo REFERENCES dbo.EntidadeTipos(TipoId),
        Finalidade              NVARCHAR(500) NOT NULL,
        Municipio               NVARCHAR(80) NULL,
        UF                      CHAR(2) NULL,
        Status                  NVARCHAR(15) NOT NULL CONSTRAINT DF_EntidadesVinculadas_Status DEFAULT N'PROPOSTA',
        CadastradaPor           INT NOT NULL,
        CadastradaEm            DATETIME2 NOT NULL CONSTRAINT DF_EntidadesVinculadas_Em DEFAULT SYSUTCDATETIME(),
        AtualizadaPor           INT NULL,
        AtualizadaEm            DATETIME2 NULL,
        -- a aprovação da CLI (Art. 64, parágrafo único) — ou a recusa
        VinculoSessaoId         INT NULL CONSTRAINT FK_EntidadesVinculadas_VincSessao REFERENCES dbo.Sessoes(SessaoId),
        VinculoEm               DATE NULL,
        VinculoRegistradoPor    INT NULL,
        NaoAprovadaEm           DATE NULL,
        NaoAprovadaMotivo       NVARCHAR(500) NULL,
        -- a ratificação da Assembleia Geral (Art. 18, VII, "b"; Art. 19)
        VinculoAGSessaoId       INT NULL CONSTRAINT FK_EntidadesVinculadas_VincAG REFERENCES dbo.Sessoes(SessaoId),
        VinculoAGResultado      NVARCHAR(15) NULL,
        VinculoAGEm             DATE NULL,
        VinculoAGObs            NVARCHAR(500) NULL,
        -- a prestação de contas (Art. 67)
        Periodicidade           NVARCHAR(10) NOT NULL CONSTRAINT DF_EntidadesVinculadas_Period DEFAULT N'ANUAL',
        PrazoEntregaDias        INT NOT NULL CONSTRAINT DF_EntidadesVinculadas_Prazo DEFAULT 120,
        -- a extinção (Art. 68)
        ExtincaoSessaoId        INT NULL CONSTRAINT FK_EntidadesVinculadas_ExtSessao REFERENCES dbo.Sessoes(SessaoId),
        ExtincaoEm              DATE NULL,
        ExtincaoRegistradaPor   INT NULL,
        DestinoPatrimonio       NVARCHAR(30) NULL,
        DestinatarioNome        NVARCHAR(150) NULL,
        DestinatarioCnpj        CHAR(14) NULL,
        BensComodato            NVARCHAR(1000) NULL,
        ExtincaoAGSessaoId      INT NULL CONSTRAINT FK_EntidadesVinculadas_ExtAG REFERENCES dbo.Sessoes(SessaoId),
        ExtincaoAGResultado     NVARCHAR(15) NULL,
        ExtincaoAGEm            DATE NULL,
        ExtincaoAGObs           NVARCHAR(500) NULL,
        CONSTRAINT UQ_EntidadesVinculadas_Cnpj UNIQUE (Cnpj),
        CONSTRAINT CK_EntidadesVinculadas_Cnpj CHECK (LEN(Cnpj) = 14 AND SUBSTRING(Cnpj, 9, 4) = '0001'),
        CONSTRAINT CK_EntidadesVinculadas_Status CHECK (Status IS NOT NULL AND Status IN (N'PROPOSTA', N'ATIVA', N'NAO_APROVADA', N'DESFEITA', N'EXTINTA')),
        CONSTRAINT CK_EntidadesVinculadas_Period CHECK (Periodicidade IS NOT NULL AND Periodicidade IN (N'ANUAL', N'SEMESTRAL', N'TRIMESTRAL')),
        CONSTRAINT CK_EntidadesVinculadas_Prazo CHECK (PrazoEntregaDias BETWEEN 1 AND 365),
        CONSTRAINT CK_EntidadesVinculadas_AG CHECK (VinculoAGResultado IS NULL OR VinculoAGResultado IN (N'RATIFICADA', N'NAO_RATIFICADA')),
        CONSTRAINT CK_EntidadesVinculadas_ExtAG CHECK (ExtincaoAGResultado IS NULL OR ExtincaoAGResultado IN (N'RATIFICADA', N'NAO_RATIFICADA')),
        CONSTRAINT CK_EntidadesVinculadas_Destino CHECK (DestinoPatrimonio IS NULL OR DestinoPatrimonio IN
            (N'SAUDE_OUTRA_INSTITUICAO', N'SAUDE_MATRIZ_ASSISTENCIAL', N'EDUCACAO_CONGENERE', N'CONGENERE_SEM_FINS')),
        -- ativa e extinta só com a deliberação da CLI registrada; extinta com o destino do patrimônio
        CONSTRAINT CK_EntidadesVinculadas_Vinculo CHECK (Status NOT IN (N'ATIVA', N'DESFEITA', N'EXTINTA') OR (VinculoSessaoId IS NOT NULL AND VinculoEm IS NOT NULL)),
        CONSTRAINT CK_EntidadesVinculadas_Extinta CHECK (Status <> N'EXTINTA' OR (ExtincaoSessaoId IS NOT NULL AND ExtincaoEm IS NOT NULL AND DestinoPatrimonio IS NOT NULL AND DestinatarioNome IS NOT NULL))
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.EntidadeDirigentes') AND type = N'U')
BEGIN
    CREATE TABLE dbo.EntidadeDirigentes (
        DirigenteId             INT IDENTITY CONSTRAINT PK_EntidadeDirigentes PRIMARY KEY,
        EntidadeId              INT NOT NULL CONSTRAINT FK_EntidadeDirigentes_Entidade REFERENCES dbo.EntidadesVinculadas(EntidadeId),
        Funcao                  NVARCHAR(20) NOT NULL,
        FuncaoDescricao         NVARCHAR(80) NULL,
        MembroId                INT NULL CONSTRAINT FK_EntidadeDirigentes_Membro REFERENCES dbo.MembroReferencia(MembroId),
        NomeExterno             NVARCHAR(120) NULL,
        Remunerado              BIT NOT NULL CONSTRAINT DF_EntidadeDirigentes_Rem DEFAULT 0,
        Formacao                NVARCHAR(80) NULL,
        RegistroProfissional    NVARCHAR(40) NULL,
        DeclaracaoParentesco    BIT NOT NULL CONSTRAINT DF_EntidadeDirigentes_Decl DEFAULT 0,
        Status                  NVARCHAR(10) NOT NULL CONSTRAINT DF_EntidadeDirigentes_Status DEFAULT N'INDICADO',
        IndicadoEm              DATE NOT NULL,
        IndicacaoAto            NVARCHAR(200) NOT NULL,
        IndicacaoRegistradaPor  INT NOT NULL,
        RegistradoEm            DATETIME2 NOT NULL CONSTRAINT DF_EntidadeDirigentes_Em DEFAULT SYSUTCDATETIME(),
        HomologacaoSessaoId     INT NULL CONSTRAINT FK_EntidadeDirigentes_Sessao REFERENCES dbo.Sessoes(SessaoId),
        HomologadoEm            DATE NULL,
        HomologacaoRegistradaPor INT NULL,
        MandatoAte              DATE NULL,
        RecusadoEm              DATE NULL,
        EncerradoEm             DATE NULL,
        MotivoEncerramento      NVARCHAR(25) NULL,
        EncerramentoObs         NVARCHAR(500) NULL,
        EncerradoPor            INT NULL,
        IntervencaoId           INT NULL,     -- a intervenção que destituiu (quando o motivo é DESTITUICAO_INTERVENCAO)
        CONSTRAINT CK_EntidadeDirigentes_Funcao CHECK (Funcao IS NOT NULL AND Funcao IN (N'DIRETOR_PRESIDENTE', N'DIRETOR_VICE', N'DIRETOR_ADMIN', N'DIRETOR_FINANCEIRO',
            N'SECRETARIO', N'GESTOR_TECNICO', N'CONSELHEIRO_FISCAL', N'OUTRA')),
        CONSTRAINT CK_EntidadeDirigentes_Pessoa CHECK ((MembroId IS NOT NULL AND NomeExterno IS NULL) OR (MembroId IS NULL AND NomeExterno IS NOT NULL)),
        CONSTRAINT CK_EntidadeDirigentes_Status CHECK (Status IS NOT NULL AND Status IN (N'INDICADO', N'HOMOLOGADO', N'RECUSADO', N'ENCERRADO')),
        CONSTRAINT CK_EntidadeDirigentes_Homolog CHECK (Status <> N'HOMOLOGADO' OR (HomologacaoSessaoId IS NOT NULL AND HomologadoEm IS NOT NULL)),
        CONSTRAINT CK_EntidadeDirigentes_Encerr CHECK (Status <> N'ENCERRADO' OR (EncerradoEm IS NOT NULL AND MotivoEncerramento IS NOT NULL)),
        CONSTRAINT CK_EntidadeDirigentes_Motivo CHECK (MotivoEncerramento IS NULL OR MotivoEncerramento IN (N'EXONERACAO', N'FIM_MANDATO', N'RENUNCIA',
            N'DESTITUICAO_INTERVENCAO', N'EXTINCAO', N'FALECIMENTO', N'OUTRO'))
    );
END
GO
-- um só Diretor-Presidente e um só gestor técnico em aberto (indicado ou homologado) por entidade
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_EntidadeDirigentes_Unico' AND object_id = OBJECT_ID(N'dbo.EntidadeDirigentes'))
    CREATE UNIQUE INDEX UX_EntidadeDirigentes_Unico ON dbo.EntidadeDirigentes (EntidadeId, Funcao)
        WHERE Status IN (N'INDICADO', N'HOMOLOGADO') AND Funcao IN (N'DIRETOR_PRESIDENTE', N'GESTOR_TECNICO');
GO
-- a mesma pessoa (membro) não ocupa duas vezes a mesma função em aberto na mesma entidade
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_EntidadeDirigentes_Membro' AND object_id = OBJECT_ID(N'dbo.EntidadeDirigentes'))
    CREATE UNIQUE INDEX UX_EntidadeDirigentes_Membro ON dbo.EntidadeDirigentes (EntidadeId, MembroId, Funcao)
        WHERE Status IN (N'INDICADO', N'HOMOLOGADO') AND MembroId IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_EntidadeDirigentes_Membro' AND object_id = OBJECT_ID(N'dbo.EntidadeDirigentes'))
    CREATE INDEX IX_EntidadeDirigentes_Membro ON dbo.EntidadeDirigentes (MembroId) WHERE MembroId IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.EntidadeIntervencoes') AND type = N'U')
BEGIN
    CREATE TABLE dbo.EntidadeIntervencoes (
        IntervencaoId           INT IDENTITY CONSTRAINT PK_EntidadeIntervencoes PRIMARY KEY,
        EntidadeId              INT NOT NULL CONSTRAINT FK_EntidadeIntervencoes_Entidade REFERENCES dbo.EntidadesVinculadas(EntidadeId),
        Status                  NVARCHAR(15) NOT NULL CONSTRAINT DF_EntidadeIntervencoes_Status DEFAULT N'APURACAO',
        -- a apuração (Reg. Art. 47-A §1º)
        Motivo                  NVARCHAR(20) NOT NULL,
        Fatos                   NVARCHAR(2000) NOT NULL,
        AbertaEm                DATE NOT NULL,
        AbertaPor               INT NOT NULL,
        -- a notificação e a manifestação do gestor (Estatuto Art. 65 §3º)
        NotificadoEm            DATE NULL,
        NotificacaoForma        NVARCHAR(200) NULL,
        NotificacaoRegistradaPor INT NULL,
        ManifestacaoEm          DATE NULL,
        ManifestacaoResumo      NVARCHAR(1000) NULL,
        -- a decretação (Estatuto Art. 65 §2º; só o Pastor Presidente)
        Urgencia                BIT NOT NULL CONSTRAINT DF_EntidadeIntervencoes_Urg DEFAULT 0,
        UrgenciaJustificativa   NVARCHAR(1000) NULL,
        DecretadaEm             DATE NULL,
        DecretadaPor            INT NULL,
        Fundamentacao           NVARCHAR(2000) NULL,
        InterventorMembroId     INT NULL CONSTRAINT FK_EntidadeIntervencoes_Interventor REFERENCES dbo.MembroReferencia(MembroId),
        InterventorNome         NVARCHAR(120) NULL,
        AfastaDiretoria         BIT NOT NULL CONSTRAINT DF_EntidadeIntervencoes_Afasta DEFAULT 0,
        PrazoRatificacao        DATE NULL,
        -- a ratificação da CLI em 15 dias (Reg. Art. 47-A §2º)
        RatificacaoSessaoId     INT NULL CONSTRAINT FK_EntidadeIntervencoes_Sessao REFERENCES dbo.Sessoes(SessaoId),
        RatificacaoEm           DATE NULL,
        RatificacaoRegistradaPor INT NULL,
        RatificacaoObs          NVARCHAR(500) NULL,
        CaducadaEm              DATE NULL,
        -- a defesa dos diretores destituídos no Conselho de Ética
        DefesaCEIEm             DATE NULL,
        DefesaCEIReferencia     NVARCHAR(200) NULL,
        -- arquivamento da apuração ou encerramento da intervenção
        EncerradaEm             DATE NULL,
        EncerradaPor            INT NULL,
        EncerramentoMotivo      NVARCHAR(1000) NULL,
        CONSTRAINT CK_EntidadeIntervencoes_Status CHECK (Status IS NOT NULL AND Status IN (N'APURACAO', N'ARQUIVADA', N'DECRETADA', N'RATIFICADA', N'NAO_RATIFICADA',
            N'CADUCADA', N'ENCERRADA')),
        CONSTRAINT CK_EntidadeIntervencoes_Motivo CHECK (Motivo IS NOT NULL AND Motivo IN (N'GESTAO_TEMERARIA', N'DESVIO_FINALIDADE', N'INADIMPLENCIA_FISCAL', N'RISCO_IMAGEM')),
        -- decretada (e o que vem depois dela) só com a data, quem decretou, a fundamentação, o interventor e o prazo de 15 dias
        CONSTRAINT CK_EntidadeIntervencoes_Decreto CHECK (Status IN (N'APURACAO', N'ARQUIVADA') OR (DecretadaEm IS NOT NULL AND DecretadaPor IS NOT NULL AND Fundamentacao IS NOT NULL
            AND PrazoRatificacao = DATEADD(DAY, 15, DecretadaEm) AND (InterventorMembroId IS NOT NULL OR InterventorNome IS NOT NULL))),
        -- sem urgência, só depois dos 5 dias da notificação; com urgência, a justificativa
        CONSTRAINT CK_EntidadeIntervencoes_Defesa CHECK (DecretadaEm IS NULL OR (Urgencia = 1 AND UrgenciaJustificativa IS NOT NULL)
            OR (Urgencia = 0 AND NotificadoEm IS NOT NULL AND DecretadaEm >= DATEADD(DAY, 5, NotificadoEm))),
        -- ratificada só por reunião dentro do prazo
        CONSTRAINT CK_EntidadeIntervencoes_Ratif CHECK (Status <> N'RATIFICADA' AND Status <> N'NAO_RATIFICADA'
            OR (RatificacaoSessaoId IS NOT NULL AND RatificacaoEm IS NOT NULL AND RatificacaoEm >= DecretadaEm AND RatificacaoEm <= PrazoRatificacao)),
        CONSTRAINT CK_EntidadeIntervencoes_Caduca CHECK (Status <> N'CADUCADA' OR (CaducadaEm IS NOT NULL AND CaducadaEm > PrazoRatificacao))
    );
END
GO
-- um processo em curso por entidade (apuração aberta, decretada esperando a CLI, ou ratificada em vigor)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_EntidadeIntervencoes_EmCurso' AND object_id = OBJECT_ID(N'dbo.EntidadeIntervencoes'))
    CREATE UNIQUE INDEX UX_EntidadeIntervencoes_EmCurso ON dbo.EntidadeIntervencoes (EntidadeId) WHERE Status IN (N'APURACAO', N'DECRETADA', N'RATIFICADA');
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_EntidadeDirigentes_Intervencao')
    ALTER TABLE dbo.EntidadeDirigentes ADD CONSTRAINT FK_EntidadeDirigentes_Intervencao FOREIGN KEY (IntervencaoId) REFERENCES dbo.EntidadeIntervencoes(IntervencaoId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.EntidadePrestacoes') AND type = N'U')
BEGIN
    CREATE TABLE dbo.EntidadePrestacoes (
        PrestacaoId             INT IDENTITY CONSTRAINT PK_EntidadePrestacoes PRIMARY KEY,
        EntidadeId              INT NOT NULL CONSTRAINT FK_EntidadePrestacoes_Entidade REFERENCES dbo.EntidadesVinculadas(EntidadeId),
        Periodo                 NVARCHAR(7) NOT NULL,     -- 2026, 2026-S1, 2026-T3
        Inicio                  DATE NOT NULL,
        Fim                     DATE NOT NULL,
        EntregueEm              DATE NOT NULL,
        RelatorioAtividades     BIT NOT NULL,
        BalancoAuditado         BIT NOT NULL,
        AuditoriaOrgao          NVARCHAR(150) NULL,
        Observacao              NVARCHAR(1000) NULL,
        RegistradaPor           INT NOT NULL,
        RegistradaEm            DATETIME2 NOT NULL CONSTRAINT DF_EntidadePrestacoes_Em DEFAULT SYSUTCDATETIME(),
        -- a apreciação da CLI (Art. 67)
        ApreciacaoSessaoId      INT NULL CONSTRAINT FK_EntidadePrestacoes_Sessao REFERENCES dbo.Sessoes(SessaoId),
        ApreciadaEm             DATE NULL,
        Resultado               NVARCHAR(25) NULL,
        ApreciacaoObs           NVARCHAR(1000) NULL,
        ApreciacaoRegistradaPor INT NULL,
        -- a verificação anual do Conselho Fiscal (Art. 66 §3º)
        CFVerificadaEm          DATE NULL,
        CFResultado             NVARCHAR(15) NULL,
        CFObs                   NVARCHAR(1000) NULL,
        CFRegistradaPor         INT NULL,
        CONSTRAINT UQ_EntidadePrestacoes_Periodo UNIQUE (EntidadeId, Periodo),
        CONSTRAINT CK_EntidadePrestacoes_Datas CHECK (Fim >= Inicio AND EntregueEm >= Inicio),
        CONSTRAINT CK_EntidadePrestacoes_Result CHECK (Resultado IS NULL OR Resultado IN (N'APROVADA', N'APROVADA_COM_RESSALVAS', N'REPROVADA')),
        CONSTRAINT CK_EntidadePrestacoes_Aprec CHECK ((Resultado IS NULL AND ApreciacaoSessaoId IS NULL AND ApreciadaEm IS NULL)
            OR (Resultado IS NOT NULL AND ApreciacaoSessaoId IS NOT NULL AND ApreciadaEm IS NOT NULL AND ApreciadaEm >= EntregueEm)),
        CONSTRAINT CK_EntidadePrestacoes_CF CHECK ((CFResultado IS NULL AND CFVerificadaEm IS NULL)
            OR (CFResultado IN (N'SEM_CONFUSAO', N'IRREGULARIDADE') AND CFVerificadaEm IS NOT NULL))
    );
END
GO

-- ---- permissão (só o nível geral; vem para o Presidente e o Secretário Geral, como as do Setores Técnicos — migração 142) ----
IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'entidades_vinculadas')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('entidades_vinculadas', N'Entidades Vinculadas — cadastro, dirigentes, intervenção, prestação de contas e extinção');
GO
UPDATE dbo.Papeis
SET Permissoes = CASE WHEN ISNULL(Permissoes, '') = '' THEN 'entidades_vinculadas' ELSE Permissoes + ',entidades_vinculadas' END
WHERE Nome IN ('Presidente', 'Secretário Geral') AND (',' + ISNULL(Permissoes, '') + ',') NOT LIKE '%,entidades_vinculadas,%';
GO

-- ---- prazo padrão da entrega da prestação de contas (a entidade nova nasce com ele; cada entidade tem o seu) ----
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'ENTIDADE_PRESTACAO_PRAZO_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('ENTIDADE_PRESTACAO_PRAZO_DIAS', N'Entidades vinculadas — dias depois do fim do período para entregar a prestação de contas à CLI (Art. 67); padrão das entidades novas', 120);
GO

-- ---- avisos ----
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'ENTIDADE_INTERVENCAO_DECRETADA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'ENTIDADE_INTERVENCAO_DECRETADA', N'Intervenção decretada em entidade vinculada: a CLI tem 15 dias para ratificar', N'ENTIDADES', N'entidades_vinculadas', N'GLOBAL', 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'ENTIDADE_INTERVENCAO_PRAZO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'ENTIDADE_INTERVENCAO_PRAZO', N'Intervenção em entidade vinculada ainda sem a ratificação da CLI', N'ENTIDADES', N'entidades_vinculadas', N'GLOBAL', 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'ENTIDADE_INTERVENCAO_CADUCADA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'ENTIDADE_INTERVENCAO_CADUCADA', N'Intervenção em entidade vinculada perdeu a eficácia (sem ratificação da CLI em 15 dias)', N'ENTIDADES', N'entidades_vinculadas', N'GLOBAL', 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'ENTIDADE_PRESTACAO_ATRASADA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'ENTIDADE_PRESTACAO_ATRASADA', N'Prestação de contas de entidade vinculada em atraso', N'ENTIDADES', N'entidades_vinculadas', N'GLOBAL', 1);
GO

-- ---- retenção: os atos de nomeação, a intervenção e a prestação de contas são prova institucional (Art. 64 a 68) ----
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Entidades vinculadas: dirigentes, intervenções e prestações de contas')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (N'Entidades vinculadas: dirigentes, intervenções e prestações de contas', N'x', 1825);
GO
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Atos de governança das entidades vinculadas (Estatuto Art. 64 a 68; Reg. Art. 47-A e 153): indicação, homologação, intervenção e prestação de contas são prova institucional, guardada sem prazo final. Do profissional de fora só o nome, a formação e o registro.'
WHERE Categoria = N'Entidades vinculadas: dirigentes, intervenções e prestações de contas' AND BaseLegal = N'x';
GO
