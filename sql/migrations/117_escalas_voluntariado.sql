-- ============================================================
-- Migração 117 — v7.5: Escalas e voluntariado
-- (Regimento Art. 133 §§ 4, 7 e 8, Art. 133-D e Art. 135; Lei 9.608/1998).
--
-- A v5.6 (escalas, auto-escalador, convite em cadeia, trocas) e a v5.7 (esteira de habilitação) já existem e
-- NÃO são refeitas aqui. Esta migração acrescenta o que o Regimento exige e elas não tinham:
--   1) RODÍZIO VOLUNTÁRIO (Art. 135 §1º): grupos distintos se alternam numa mesma tarefa, para que ninguém a faça de
--      forma contínua e habitual. O rodízio guarda dia, hora, intervalo e uma data-âncora; o grupo de cada data sai
--      da conta (semanas desde a âncora), sem ponteiro que possa se perder. Cada serviço gerado lembra o rodízio e o
--      grupo, e o banco impede dois serviços ativos do mesmo rodízio na mesma data. A natureza da equipe
--      (zeladoria, portaria, cozinha...) diz onde o revezamento é obrigatório e a trava de habitualidade vigia.
--   2) TERMO DE ADESÃO (Art. 133 §8º; Lei 9.608/98, art. 2º): o aceite digital (clickwrap) com IP, data e hora, a
--      cláusula na Ficha de Membro, a confirmação por e-mail/WhatsApp e a RATIFICAÇÃO COLETIVA ("Lista de Ouro") deixam
--      de ser um carimbo manual e viram prova guardada, com versão e hash do texto. A prova não se altera nem se apaga.
--   3) REMOÇÃO DA ESCALA (Art. 133-D): a sanção do voluntário faltoso é só sair da escala — sem multa, desconto ou
--      suspensão trabalhista, e sem processo disciplinar. Ganha efeito imediato (cancela as escalas futuras, avisa o
--      voluntário e o líder) e a possibilidade de reintegrar.
-- Cinco regras de aviso. Nenhuma permissão nova: usa "escalas" e "habilitacao_voluntarios", já existentes.
--
-- Idempotente: seguro para reexecutar sem apagar dados. Cada DDL em batch próprio (GO); gatilho por EXEC.
-- ============================================================

-- ---- 1) Natureza da equipe ----

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.EscalasEquipes') AND name = N'Natureza')
    ALTER TABLE dbo.EscalasEquipes ADD Natureza NVARCHAR(10) NOT NULL CONSTRAINT DF_EscalasEquipes_Natureza DEFAULT 'OUTRA';
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_EscalasEquipes_Natureza')
    ALTER TABLE dbo.EscalasEquipes ADD CONSTRAINT CK_EscalasEquipes_Natureza CHECK (Natureza IN ('LITURGIA','ZELADORIA','PORTARIA','COZINHA','OUTRA'));
GO

-- ---- 2) Rodízio voluntário (Art. 135 §1º) ----

IF OBJECT_ID(N'dbo.EscalasRodizios', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EscalasRodizios (
        RodizioId          INT IDENTITY PRIMARY KEY,
        CongregacaoId      INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        EquipeId           INT NOT NULL REFERENCES dbo.EscalasEquipes(EquipeId),
        Nome               NVARCHAR(100) NOT NULL,
        DiaSemana          TINYINT NOT NULL CONSTRAINT CK_EscalasRodizios_Dia CHECK (DiaSemana BETWEEN 0 AND 6),     -- 0 = domingo
        Hora               NVARCHAR(5) NOT NULL CONSTRAINT CK_EscalasRodizios_Hora CHECK (Hora LIKE '[0-2][0-9]:[0-5][0-9]'),
        IntervaloSemanas   TINYINT NOT NULL CONSTRAINT DF_EscalasRodizios_Int DEFAULT 1 CONSTRAINT CK_EscalasRodizios_Int CHECK (IntervaloSemanas BETWEEN 1 AND 4),
        DataAncora         DATE NOT NULL,                                                                            -- primeira data do 1º grupo; cai no DiaSemana
        Ativo              BIT NOT NULL CONSTRAINT DF_EscalasRodizios_Ativo DEFAULT 1,
        GeradoAte          DATE NULL,
        CriadoPorMembroId  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm           DATETIME2 NOT NULL CONSTRAINT DF_EscalasRodizios_Em DEFAULT SYSUTCDATETIME()
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_EscalasRodizios_Congregacao' AND object_id = OBJECT_ID(N'dbo.EscalasRodizios'))
    CREATE INDEX IX_EscalasRodizios_Congregacao ON dbo.EscalasRodizios (CongregacaoId, Ativo);
GO

IF OBJECT_ID(N'dbo.EscalasRodizioGrupos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EscalasRodizioGrupos (
        GrupoId     INT IDENTITY PRIMARY KEY,
        RodizioId   INT NOT NULL REFERENCES dbo.EscalasRodizios(RodizioId),
        Nome        NVARCHAR(60) NOT NULL,
        Ordem       INT NOT NULL,                                       -- posição na sequência do revezamento
        Ativo       BIT NOT NULL CONSTRAINT DF_EscalasRodizioGrupos_Ativo DEFAULT 1,
        CriadoEm    DATETIME2 NOT NULL CONSTRAINT DF_EscalasRodizioGrupos_Em DEFAULT SYSUTCDATETIME()
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_EscalasRodizioGrupos_Nome' AND object_id = OBJECT_ID(N'dbo.EscalasRodizioGrupos'))
    CREATE UNIQUE INDEX UX_EscalasRodizioGrupos_Nome ON dbo.EscalasRodizioGrupos (RodizioId, Nome) WHERE Ativo = 1;
GO

IF OBJECT_ID(N'dbo.EscalasRodizioGrupoMembros', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EscalasRodizioGrupoMembros (
        GrupoMembroId  INT IDENTITY PRIMARY KEY,
        GrupoId        INT NOT NULL REFERENCES dbo.EscalasRodizioGrupos(GrupoId),
        RodizioId      INT NOT NULL REFERENCES dbo.EscalasRodizios(RodizioId),     -- repetido de propósito: sustenta a regra "um grupo só por rodízio"
        MembroId       INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        EntrouEm       DATETIME2 NOT NULL CONSTRAINT DF_EscalasRodizioGM_Em DEFAULT SYSUTCDATETIME(),
        SaiuEm         DATETIME2 NULL
    );
END
GO
-- Grupos distintos se alternam: a mesma pessoa não está em dois grupos do mesmo rodízio.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_EscalasRodizioGM_UmGrupo' AND object_id = OBJECT_ID(N'dbo.EscalasRodizioGrupoMembros'))
    CREATE UNIQUE INDEX UX_EscalasRodizioGM_UmGrupo ON dbo.EscalasRodizioGrupoMembros (RodizioId, MembroId) WHERE SaiuEm IS NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_EscalasRodizioGM_Grupo' AND object_id = OBJECT_ID(N'dbo.EscalasRodizioGrupoMembros'))
    CREATE INDEX IX_EscalasRodizioGM_Grupo ON dbo.EscalasRodizioGrupoMembros (GrupoId) INCLUDE (MembroId) WHERE SaiuEm IS NULL;
GO

-- O serviço gerado pelo rodízio lembra de onde veio (e o auto-escalador não mexe nele).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.EscalasServicos') AND name = N'RodizioId')
    ALTER TABLE dbo.EscalasServicos ADD RodizioId INT NULL REFERENCES dbo.EscalasRodizios(RodizioId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.EscalasServicos') AND name = N'RodizioGrupoId')
    ALTER TABLE dbo.EscalasServicos ADD RodizioGrupoId INT NULL REFERENCES dbo.EscalasRodizioGrupos(GrupoId);
GO
-- Gerar duas vezes o mesmo período não duplica; um serviço cancelado libera a data.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_EscalasServicos_Rodizio' AND object_id = OBJECT_ID(N'dbo.EscalasServicos'))
    CREATE UNIQUE INDEX UX_EscalasServicos_Rodizio ON dbo.EscalasServicos (RodizioId, DataHora) WHERE RodizioId IS NOT NULL AND Status <> 'CANCELADA';
GO

-- ---- 3) Termo de Adesão ao Serviço Voluntário (Art. 133 §8º; Lei 9.608/98, art. 2º) ----

IF OBJECT_ID(N'dbo.VoluntariadoRatificacoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.VoluntariadoRatificacoes (
        RatificacaoId          INT IDENTITY PRIMARY KEY,
        Origem                 NVARCHAR(16) NOT NULL CONSTRAINT CK_VoluntariadoRat_Origem CHECK (Origem IN ('ASSEMBLEIA_GERAL','REUNIAO_OBREIROS','ESCALA_SERVICO')),
        SessaoId               INT NULL REFERENCES dbo.Sessoes(SessaoId),
        ServicoId              INT NULL REFERENCES dbo.EscalasServicos(ServicoId),
        Descricao              NVARCHAR(200) NOT NULL,
        DataLista              DATE NOT NULL,
        -- Art. 133 §8º, III, "a": a lista só vale se o CABEÇALHO trouxer a menção expressa à ratificação; quem registra atesta isso.
        CabecalhoConfirmadoEm  DATETIME2 NOT NULL,
        TextoVersao            INT NOT NULL,
        TextoHash              NVARCHAR(64) NOT NULL,
        TotalSignatarios       INT NOT NULL,
        NovasAdesoes           INT NOT NULL,
        RegistradoPorMembroId  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm           DATETIME2 NOT NULL CONSTRAINT DF_VoluntariadoRat_Em DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_VoluntariadoRat_Referencia CHECK (
            (Origem = 'ESCALA_SERVICO' AND ServicoId IS NOT NULL AND SessaoId IS NULL)
         OR (Origem <> 'ESCALA_SERVICO' AND SessaoId IS NOT NULL AND ServicoId IS NULL))
    );
END
GO

IF OBJECT_ID(N'dbo.VoluntariadoAdesoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.VoluntariadoAdesoes (
        AdesaoId                 INT IDENTITY PRIMARY KEY,
        MembroId                 INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Forma                    NVARCHAR(12) NOT NULL CONSTRAINT CK_VoluntariadoAdesoes_Forma CHECK (Forma IN ('CLICKWRAP','FICHA_FISICA','MENSAGERIA','LISTA_OURO')),
        -- Versão e hash do texto que a pessoa aceitou NO SISTEMA (o Termo, no aceite digital; o texto da ratificação, na Lista de Ouro).
        -- Na ficha física e na mensagem, o texto é o do documento arquivado fora daqui: a prova é a Referencia, e estas duas ficam nulas.
        TermoVersao              INT NULL,
        TermoHash                NVARCHAR(64) NULL,
        DataAceite               DATE NOT NULL,
        AceitoEm                 DATETIME2 NULL,                         -- instante exato, só no aceite digital
        EnderecoIp               NVARCHAR(45) NULL,                      -- registro de conexão do aceite digital (Art. 133 §8º, II, "b")
        CanalMensageria          NVARCHAR(8) NULL CONSTRAINT CK_VoluntariadoAdesoes_Canal CHECK (CanalMensageria IS NULL OR CanalMensageria IN ('EMAIL','WHATSAPP')),
        Referencia               NVARCHAR(200) NULL,                     -- ficha nº, onde a conversa foi arquivada...
        RatificacaoId            INT NULL REFERENCES dbo.VoluntariadoRatificacoes(RatificacaoId),
        ConvalidaPeriodoAnterior BIT NOT NULL CONSTRAINT DF_VoluntariadoAdesoes_Conv DEFAULT 0,      -- efeito sanador da Lista de Ouro (§8º, III, "b")
        RegistradoPorMembroId    INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm             DATETIME2 NOT NULL CONSTRAINT DF_VoluntariadoAdesoes_Em DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_VoluntariadoAdesoes_Membro UNIQUE (MembroId),
        -- Cada forma só vale com a prova que a caracteriza. Forma e demais colunas são NOT NULL/testadas com IS NOT NULL: sem "desconhecido" que escape do CHECK.
        CONSTRAINT CK_VoluntariadoAdesoes_Texto CHECK (Forma NOT IN ('CLICKWRAP','LISTA_OURO') OR (TermoVersao IS NOT NULL AND TermoHash IS NOT NULL)),
        CONSTRAINT CK_VoluntariadoAdesoes_Click CHECK (Forma <> 'CLICKWRAP' OR (AceitoEm IS NOT NULL AND EnderecoIp IS NOT NULL AND RegistradoPorMembroId IS NULL)),
        CONSTRAINT CK_VoluntariadoAdesoes_Ficha CHECK (Forma <> 'FICHA_FISICA' OR (Referencia IS NOT NULL AND RegistradoPorMembroId IS NOT NULL)),
        CONSTRAINT CK_VoluntariadoAdesoes_Msg   CHECK (Forma <> 'MENSAGERIA' OR (CanalMensageria IS NOT NULL AND Referencia IS NOT NULL AND RegistradoPorMembroId IS NOT NULL)),
        CONSTRAINT CK_VoluntariadoAdesoes_Lista CHECK (Forma <> 'LISTA_OURO' OR (RatificacaoId IS NOT NULL AND ConvalidaPeriodoAnterior = 1 AND RegistradoPorMembroId IS NOT NULL))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_VoluntariadoAdesoes_Ratificacao' AND object_id = OBJECT_ID(N'dbo.VoluntariadoAdesoes'))
    CREATE INDEX IX_VoluntariadoAdesoes_Ratificacao ON dbo.VoluntariadoAdesoes (RatificacaoId) WHERE RatificacaoId IS NOT NULL;
GO
-- Os cabeçalhos de origem como chegaram (x-azure-clientip, x-client-ip, x-forwarded-for), guardados com o aceite digital: o x-forwarded-for pode ter sido escrito
-- pelo cliente, e a cadeia inteira permite avaliar depois de onde veio a conexão (Art. 133 §8º, II, "b"). Coluna acrescentada pela revisão de segurança.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.VoluntariadoAdesoes') AND name = N'CadeiaCabecalhos')
    ALTER TABLE dbo.VoluntariadoAdesoes ADD CadeiaCabecalhos NVARCHAR(400) NULL;
GO

-- A prova da adesão não se altera nem se apaga (é o documento da Lei 9.608/98, art. 2º).
IF OBJECT_ID(N'dbo.TR_VoluntariadoAdesoes_Imutavel', N'TR') IS NULL
    EXEC(N'CREATE TRIGGER dbo.TR_VoluntariadoAdesoes_Imutavel ON dbo.VoluntariadoAdesoes AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    RAISERROR(N''A adesão ao Termo de Voluntariado é prova documental: não se altera nem se apaga (Lei 9.608/98, art. 2º; Regimento Art. 133 §8º).'', 16, 1);
    ROLLBACK TRANSACTION;
END');
GO
IF OBJECT_ID(N'dbo.TR_VoluntariadoRatificacoes_Imutavel', N'TR') IS NULL
    EXEC(N'CREATE TRIGGER dbo.TR_VoluntariadoRatificacoes_Imutavel ON dbo.VoluntariadoRatificacoes AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    RAISERROR(N''O registro da ratificação coletiva é prova documental: não se altera nem se apaga (Regimento Art. 133 §8º, III).'', 16, 1);
    ROLLBACK TRANSACTION;
END');
GO

-- ---- 4) Remoção da escala e reintegração (Art. 133-D) ----
-- VoluntariosDesligamentos (v5.7) já é o registro de RH, sem ligação com a disciplina. Ganha o efeito sobre as escalas e a reintegração.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.VoluntariosDesligamentos') AND name = N'AlocacoesCanceladas')
    ALTER TABLE dbo.VoluntariosDesligamentos ADD AlocacoesCanceladas INT NOT NULL CONSTRAINT DF_VolDesl_AlocCanc DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.VoluntariosDesligamentos') AND name = N'ReintegradoEm')
    ALTER TABLE dbo.VoluntariosDesligamentos ADD ReintegradoEm DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.VoluntariosDesligamentos') AND name = N'ReintegradoPorMembroId')
    ALTER TABLE dbo.VoluntariosDesligamentos ADD ReintegradoPorMembroId INT NULL REFERENCES dbo.MembroReferencia(MembroId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.VoluntariosDesligamentos') AND name = N'ReintegracaoObs')
    ALTER TABLE dbo.VoluntariosDesligamentos ADD ReintegracaoObs NVARCHAR(300) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_VoluntariosDesligamentos_Membro' AND object_id = OBJECT_ID(N'dbo.VoluntariosDesligamentos'))
    CREATE INDEX IX_VoluntariosDesligamentos_Membro ON dbo.VoluntariosDesligamentos (MembroId, EquipeId) INCLUDE (RemovidoDaEscala, ReintegradoEm);
GO

-- ---- 5) Prazo, avisos e retenção ----

IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'ESCALA_HABITUALIDADE_SEQUENCIA')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('ESCALA_HABITUALIDADE_SEQUENCIA', N'Escalas — quantas escalas seguidas da mesma equipe operacional acendem o alerta de habitualidade (Reg. Art. 135 §1º, II)', 3);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'ESCALA_ALTERACAO_PARTICIPACAO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'ESCALA_ALTERACAO_PARTICIPACAO', N'Sua participação nas escalas mudou', N'ESCALAS', NULL, NULL, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'ESCALA_VAGA_ABERTA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'ESCALA_VAGA_ABERTA', N'Vaga aberta na escala da sua equipe', N'ESCALAS', NULL, NULL, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'ESCALA_RODIZIO_ESCALADO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'ESCALA_RODIZIO_ESCALADO', N'Você foi escalado em um rodízio de serviço', N'ESCALAS', NULL, NULL, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'ESCALA_HABITUALIDADE')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'ESCALA_HABITUALIDADE', N'Equipe sem revezamento: voluntário servindo escala após escala', N'ESCALAS', N'escalas', NULL, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'VOLUNTARIADO_TERMO_PENDENTE')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'VOLUNTARIADO_TERMO_PENDENTE', N'Voluntários escalados sem Termo de Adesão registrado', N'ESCALAS', N'habilitacao_voluntarios', NULL, 1);
GO

-- Retenção: a adesão é o documento que afasta o vínculo de emprego; a guarda cobre a prescrição trabalhista (CF art. 7º, XXIX: 5 anos,
-- até 2 após o fim do vínculo alegado). O IP do aceite é dado pessoal. O descarte automático AINDA NÃO existe e o prazo é decisão da CLI/Encarregado.
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Voluntariado: adesão, rodízios e remoção da escala')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (
        N'Voluntariado: adesão, rodízios e remoção da escala',
        N'Adesão ao Termo (IP, data e hora): prova da Lei 9.608/98 art. 2º e do Reg. Art. 133 §8º; 5 anos (prescrição trabalhista, CF art. 7º XXIX). Rodízios e escalas: prova do revezamento (Art. 135 §1º). Remoção da escala: registro de RH. Sem descarte automático por ora.',
        1825
    );
GO
