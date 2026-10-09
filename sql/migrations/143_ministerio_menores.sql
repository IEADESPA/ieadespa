-- ============================================================
-- Migração 143 — v7.7: Habilitação para Ministério com Menores
-- (Lei 14.811/2024 — art. 59-A do ECA; Regimento Art. 133 §5º; LGPD art. 14)
--
-- A v5.7 deixou a esteira de habilitação e a marca ContatoComMenores da equipe; a v7.6 deixou o Termo de Vistoria (certidões com hash e data de
-- emissão). Esta migração acrescenta o que falta para a obrigação legal ser CUMPRIDA e não só registrada:
--   1) a faixa etária da equipe e as crianças previstas por serviço (proporção adulto/criança e regra dos dois adultos);
--   2) a atualização semestral da ficha cadastral do voluntário (FichaAtualizadaEm);
--   3) o aceite da política de comunicação eletrônica com menores (versionado, com hash e IP);
--   4) o consentimento específico e destacado do responsável (imagem; saúde para o crachá), versionado e revogável;
--   5) a auto-denúncia de inquérito ou processo criminal (Art. 133 §5º, V) e a decisão da Diretoria;
--   6) o registro das retiradas automáticas da escala (certidão vencida, treinamento vencido...);
--   7) a consulta ao cadastro nacional de condenados (adapter pronto, sem dependência);
--   8) o responsável com acesso ao canal que inclui menores (v7.3);
--   9) prazos configuráveis, avisos e retenção.
--
-- A validade das certidões (180 dias) NÃO é gravada em coluna: é calculada na leitura a partir da data de emissão de cada certidão do Termo de Vistoria
-- (VistoriasDocumentos.DataEmissao), do mesmo jeito que a v5.7 calcula "vencido". Nada aqui depende de job para valer: a escala é bloqueada na hora em
-- que alguém tenta escalar, e a rotina diária só limpa o que já estava escalado.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

-- ---- 1) Faixa etária da equipe e crianças previstas por serviço ----

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.EscalasEquipes') AND name = N'FaixaEtariaMenores')
    ALTER TABLE dbo.EscalasEquipes ADD FaixaEtariaMenores NVARCHAR(12) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_EscalasEquipes_FaixaMenores')
    ALTER TABLE dbo.EscalasEquipes ADD CONSTRAINT CK_EscalasEquipes_FaixaMenores
        CHECK (FaixaEtariaMenores IS NULL OR FaixaEtariaMenores IN ('BERCARIO','MATERNAL','INFANTIL','JUNIORES','ADOLESCENTES'));
GO

-- Quantas crianças a sala espera naquele serviço: a regra da proporção só se confere com esse número. É o líder da equipe quem informa, antes de publicar.
IF OBJECT_ID(N'dbo.MinisterioMenoresSalas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MinisterioMenoresSalas (
        ServicoId            INT NOT NULL REFERENCES dbo.EscalasServicos(ServicoId),
        EquipeId             INT NOT NULL REFERENCES dbo.EscalasEquipes(EquipeId),
        CriancasPrevistas    INT NOT NULL CONSTRAINT CK_MenoresSalas_Criancas CHECK (CriancasPrevistas BETWEEN 0 AND 200),
        DefinidoPorMembroId  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DefinidoEm           DATETIME2 NOT NULL CONSTRAINT DF_MenoresSalas_Em DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_MinisterioMenoresSalas PRIMARY KEY (ServicoId, EquipeId)
    );
END
GO

-- ---- 2) Ficha cadastral atualizada (a Lei pede atualização semestral) ----

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.VoluntariosHabilitacao') AND name = N'FichaAtualizadaEm')
    ALTER TABLE dbo.VoluntariosHabilitacao ADD FichaAtualizadaEm DATETIME2 NULL;
GO

-- ---- 3) Política de comunicação eletrônica com menores: o aceite de cada voluntário ----
-- O texto é versionado em código (shared/ministerioMenores.js) e o hash cobre o texto; aqui fica a prova de que a pessoa o leu. Um aceite por versão.

IF OBJECT_ID(N'dbo.MinisterioMenoresPoliticaAceites', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MinisterioMenoresPoliticaAceites (
        AceiteId               INT IDENTITY PRIMARY KEY,
        MembroId               INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Versao                 INT NOT NULL,
        TextoHash              NVARCHAR(64) NOT NULL,
        Forma                  NVARCHAR(12) NOT NULL CONSTRAINT CK_MenoresPolitica_Forma CHECK (Forma IN ('CLICKWRAP','FICHA_FISICA')),
        AceitoEm               DATETIME2 NOT NULL CONSTRAINT DF_MenoresPolitica_Em DEFAULT SYSUTCDATETIME(),
        EnderecoIp             NVARCHAR(45) NULL,
        CadeiaCabecalhos       NVARCHAR(400) NULL,
        Referencia             NVARCHAR(200) NULL,
        RegistradoPorMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CONSTRAINT UQ_MenoresPolitica_MembroVersao UNIQUE (MembroId, Versao),
        CONSTRAINT CK_MenoresPolitica_Click CHECK (Forma <> 'CLICKWRAP' OR (EnderecoIp IS NOT NULL AND RegistradoPorMembroId IS NULL)),
        CONSTRAINT CK_MenoresPolitica_Ficha CHECK (Forma <> 'FICHA_FISICA' OR (Referencia IS NOT NULL AND RegistradoPorMembroId IS NOT NULL AND RegistradoPorMembroId <> MembroId))
    );
END
GO

-- ---- 4) Consentimento do responsável (LGPD art. 14, §1º): específico, em destaque, versionado e revogável ----
-- Trilha de acréscimo: cada concessão ou revogação é uma linha nova; vale a última de cada (menor, finalidade). Nada se altera nem se apaga, salvo a
-- anonimização do IP depois do prazo de retenção. "SAUDE_CRACHA" fica pronto para o check-in infantil da v7.10 (alergia e condição de saúde no crachá):
-- o dado em si ainda não existe no sistema, mas o consentimento já pode ser dado e revogado.

IF OBJECT_ID(N'dbo.MinisterioMenoresConsentimentos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MinisterioMenoresConsentimentos (
        ConsentimentoId        INT IDENTITY PRIMARY KEY,
        MenorMembroId          INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ResponsavelMembroId    INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Finalidade             NVARCHAR(14) NOT NULL CONSTRAINT CK_MenoresConsent_Finalidade CHECK (Finalidade IN ('IMAGEM','SAUDE_CRACHA')),
        Concedido              BIT NOT NULL,
        TextoVersao            INT NOT NULL,
        TextoHash              NVARCHAR(64) NOT NULL,
        Forma                  NVARCHAR(12) NOT NULL CONSTRAINT CK_MenoresConsent_Forma CHECK (Forma IN ('CLICK_RESP','FICHA_FISICA')),
        RegistradoEm           DATETIME2 NOT NULL CONSTRAINT DF_MenoresConsent_Em DEFAULT SYSUTCDATETIME(),
        EnderecoIp             NVARCHAR(45) NULL,
        CadeiaCabecalhos       NVARCHAR(400) NULL,
        Referencia             NVARCHAR(200) NULL,
        RegistradoPorMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CONSTRAINT CK_MenoresConsent_NaoSiMesmo CHECK (MenorMembroId <> ResponsavelMembroId),
        CONSTRAINT CK_MenoresConsent_Click CHECK (Forma <> 'CLICK_RESP' OR (EnderecoIp IS NOT NULL AND RegistradoPorMembroId IS NULL)),
        CONSTRAINT CK_MenoresConsent_Ficha CHECK (Forma <> 'FICHA_FISICA' OR (Referencia IS NOT NULL AND RegistradoPorMembroId IS NOT NULL AND RegistradoPorMembroId <> ResponsavelMembroId))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MenoresConsent_Menor' AND object_id = OBJECT_ID(N'dbo.MinisterioMenoresConsentimentos'))
    CREATE INDEX IX_MenoresConsent_Menor ON dbo.MinisterioMenoresConsentimentos (MenorMembroId, Finalidade, ConsentimentoId DESC);
GO

-- ---- 5) Auto-denúncia (Regimento Art. 133 §5º, V) ----
-- O voluntário (ou a liderança) que passa a responder a inquérito ou processo criminal comunica a Diretoria. O registro diz SÓ o tipo e a data da ciência:
-- nenhum texto livre (o que se apura é assunto da Diretoria e da Justiça). Enquanto a Diretoria não decide, o contato com menores fica suspenso por
-- cautela (nunca punição); a decisão é uma só e não se altera.

IF OBJECT_ID(N'dbo.MinisterioMenoresAutoDenuncias', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MinisterioMenoresAutoDenuncias (
        AutoDenunciaId       INT IDENTITY PRIMARY KEY,
        MembroId             INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Tipo                 NVARCHAR(20) NOT NULL CONSTRAINT CK_MenoresAutoDen_Tipo CHECK (Tipo IN ('INQUERITO_POLICIAL','PROCESSO_CRIMINAL','OUTRO_PROCEDIMENTO')),
        DataCiencia          DATE NOT NULL,
        DeclaradaEm          DATETIME2 NOT NULL CONSTRAINT DF_MenoresAutoDen_Em DEFAULT SYSUTCDATETIME(),
        Decisao              NVARCHAR(26) NULL CONSTRAINT CK_MenoresAutoDen_Decisao CHECK (Decisao IS NULL OR Decisao IN ('MANTIDO','AFASTADO_PREVENTIVAMENTE')),
        DecididaPorMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DecididaEm           DATETIME2 NULL,
        DecisaoObservacao    NVARCHAR(300) NULL,
        -- O afastamento preventivo pode ser levantado depois, uma única vez, por outra pessoa da Diretoria (quem foi afastado não fica afastado para sempre).
        LiberadoEm           DATETIME2 NULL,
        LiberadoPorMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        LiberacaoObservacao  NVARCHAR(300) NULL,
        CONSTRAINT CK_MenoresAutoDen_DecisaoCompleta CHECK ((Decisao IS NULL AND DecididaPorMembroId IS NULL AND DecididaEm IS NULL AND DecisaoObservacao IS NULL)
                                                         OR (Decisao IS NOT NULL AND DecididaPorMembroId IS NOT NULL AND DecididaEm IS NOT NULL)),
        CONSTRAINT CK_MenoresAutoDen_NaoDecideSi CHECK (DecididaPorMembroId IS NULL OR DecididaPorMembroId <> MembroId),
        CONSTRAINT CK_MenoresAutoDen_Liberacao CHECK ((LiberadoEm IS NULL AND LiberadoPorMembroId IS NULL AND LiberacaoObservacao IS NULL)
                                                   OR (LiberadoEm IS NOT NULL AND LiberadoPorMembroId IS NOT NULL AND Decisao = 'AFASTADO_PREVENTIVAMENTE' AND LiberadoPorMembroId <> MembroId))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MinisterioMenoresAutoDenuncias') AND name = N'LiberadoEm')
BEGIN
    ALTER TABLE dbo.MinisterioMenoresAutoDenuncias ADD LiberadoEm DATETIME2 NULL, LiberadoPorMembroId INT NULL REFERENCES dbo.MembroReferencia(MembroId), LiberacaoObservacao NVARCHAR(300) NULL;
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MenoresAutoDen_Membro' AND object_id = OBJECT_ID(N'dbo.MinisterioMenoresAutoDenuncias'))
    CREATE INDEX IX_MenoresAutoDen_Membro ON dbo.MinisterioMenoresAutoDenuncias (MembroId, AutoDenunciaId DESC);
GO
-- Uma comunicação sem decisão por pessoa: duas declarações ao mesmo tempo não gravam duas (a segunda recebe a mensagem "já comunicou").
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_MenoresAutoDen_SemDecisao' AND object_id = OBJECT_ID(N'dbo.MinisterioMenoresAutoDenuncias'))
    CREATE UNIQUE INDEX UX_MenoresAutoDen_SemDecisao ON dbo.MinisterioMenoresAutoDenuncias (MembroId) WHERE Decisao IS NULL;
GO

-- ---- 6) Retiradas automáticas da escala ----
-- Cada vez que a rotina (ou um ato da Diretoria) tira alguém das escalas futuras de uma equipe com menores, fica o registro: quem, de qual equipe, por quais
-- motivos (códigos, nunca texto livre) e quantas escalas caíram. Só acréscimo.

IF OBJECT_ID(N'dbo.MinisterioMenoresRetiradas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MinisterioMenoresRetiradas (
        RetiradaId           INT IDENTITY PRIMARY KEY,
        MembroId             INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        EquipeId             INT NOT NULL REFERENCES dbo.EscalasEquipes(EquipeId),
        Motivos              NVARCHAR(200) NOT NULL,
        AlocacoesCanceladas  INT NOT NULL CONSTRAINT CK_MenoresRetiradas_N CHECK (AlocacoesCanceladas > 0),
        RetiradoEm           DATETIME2 NOT NULL CONSTRAINT DF_MenoresRetiradas_Em DEFAULT SYSUTCDATETIME()
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MenoresRetiradas_Membro' AND object_id = OBJECT_ID(N'dbo.MinisterioMenoresRetiradas'))
    CREATE INDEX IX_MenoresRetiradas_Membro ON dbo.MinisterioMenoresRetiradas (MembroId, RetiradaId DESC);
GO

-- ---- 7) Cadastro nacional de condenados por crimes contra menores (adapter) ----
-- Hoje é projeto de lei, não obrigação vigente: a tabela e o adapter (shared/cadastroNacionalMenores.js) ficam prontos, sem que nada dependa deles. Se um dia
-- houver consulta oficial e uma linha 'CONSTA' for gravada, o voluntário deixa de ser apto para servir com menores.

IF OBJECT_ID(N'dbo.MinisterioMenoresCadastroNacional', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MinisterioMenoresCadastroNacional (
        ConsultaId             INT IDENTITY PRIMARY KEY,
        MembroId               INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Fonte                  NVARCHAR(40) NOT NULL,
        Resultado              NVARCHAR(12) NOT NULL CONSTRAINT CK_MenoresCadNac_Resultado CHECK (Resultado IN ('NADA_CONSTA','CONSTA','INDISPONIVEL')),
        ConsultadoEm           DATETIME2 NOT NULL CONSTRAINT DF_MenoresCadNac_Em DEFAULT SYSUTCDATETIME(),
        ConsultadoPorMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MenoresCadNac_Membro' AND object_id = OBJECT_ID(N'dbo.MinisterioMenoresCadastroNacional'))
    CREATE INDEX IX_MenoresCadNac_Membro ON dbo.MinisterioMenoresCadastroNacional (MembroId, ConsultaId DESC);
GO

-- ---- 8) Canais com menores: o responsável com acesso ----
-- "Canais de grupo exigem segundo adulto e responsável com acesso" (v7.7). Os dois administradores adultos já são a tabela CanalAdministradores; o
-- responsável (pai, mãe ou tutor de um dos menores, com acesso ao grupo) é um membro adulto indicado aqui.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.CanaisOficiaisComunicacao') AND name = N'ResponsavelAcessoMembroId')
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD ResponsavelAcessoMembroId INT NULL REFERENCES dbo.MembroReferencia(MembroId);
GO

-- ---- 9) Gatilhos: prova documental e acréscimo ----

-- Aceite da política e consentimento do responsável: não se alteram nem se apagam; única exceção, a anonimização do IP depois da retenção (LGPD art. 16).
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_MenoresPolitica_Imutavel ON dbo.MinisterioMenoresPoliticaAceites AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF (EXISTS (SELECT 1 FROM deleted) AND NOT EXISTS (SELECT 1 FROM inserted)) OR EXISTS (
        SELECT 1 FROM inserted i JOIN deleted d ON d.AceiteId = i.AceiteId
        WHERE i.MembroId <> d.MembroId OR i.Versao <> d.Versao OR i.TextoHash <> d.TextoHash OR i.Forma <> d.Forma OR i.AceitoEm <> d.AceitoEm
           OR ISNULL(i.Referencia, N'''') <> ISNULL(d.Referencia, N'''') OR ISNULL(i.RegistradoPorMembroId, -1) <> ISNULL(d.RegistradoPorMembroId, -1)
           OR (ISNULL(i.EnderecoIp, N'''') <> ISNULL(d.EnderecoIp, N'''') AND NOT (i.EnderecoIp = N''anonimizado'' AND d.EnderecoIp IS NOT NULL))
           OR (ISNULL(i.CadeiaCabecalhos, N'''') <> ISNULL(d.CadeiaCabecalhos, N'''') AND i.CadeiaCabecalhos IS NOT NULL))
    BEGIN
        RAISERROR(N''O aceite da política de comunicação com menores é prova documental: não se apaga e só admite a anonimização do IP depois do prazo de retenção.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_MenoresConsent_Imutavel ON dbo.MinisterioMenoresConsentimentos AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF (EXISTS (SELECT 1 FROM deleted) AND NOT EXISTS (SELECT 1 FROM inserted)) OR EXISTS (
        SELECT 1 FROM inserted i JOIN deleted d ON d.ConsentimentoId = i.ConsentimentoId
        WHERE i.MenorMembroId <> d.MenorMembroId OR i.ResponsavelMembroId <> d.ResponsavelMembroId OR i.Finalidade <> d.Finalidade OR i.Concedido <> d.Concedido
           OR i.TextoVersao <> d.TextoVersao OR i.TextoHash <> d.TextoHash OR i.Forma <> d.Forma OR i.RegistradoEm <> d.RegistradoEm
           OR ISNULL(i.Referencia, N'''') <> ISNULL(d.Referencia, N'''') OR ISNULL(i.RegistradoPorMembroId, -1) <> ISNULL(d.RegistradoPorMembroId, -1)
           OR (ISNULL(i.EnderecoIp, N'''') <> ISNULL(d.EnderecoIp, N'''') AND NOT (i.EnderecoIp = N''anonimizado'' AND d.EnderecoIp IS NOT NULL))
           OR (ISNULL(i.CadeiaCabecalhos, N'''') <> ISNULL(d.CadeiaCabecalhos, N'''') AND i.CadeiaCabecalhos IS NOT NULL))
    BEGIN
        RAISERROR(N''O consentimento do responsável é prova documental: não se apaga nem se altera (para mudar, registre uma nova concessão ou revogação); só o IP é anonimizado depois da retenção.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- Auto-denúncia: a declaração não se apaga nem se altera; a decisão da Diretoria entra uma única vez (de nula para preenchida) e, se foi o afastamento
-- preventivo, a liberação também entra uma única vez.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_MenoresAutoDen_Protegido ON dbo.MinisterioMenoresAutoDenuncias AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF (EXISTS (SELECT 1 FROM deleted) AND NOT EXISTS (SELECT 1 FROM inserted)) OR EXISTS (
        SELECT 1 FROM inserted i JOIN deleted d ON d.AutoDenunciaId = i.AutoDenunciaId
        WHERE i.MembroId <> d.MembroId OR i.Tipo <> d.Tipo OR i.DataCiencia <> d.DataCiencia OR i.DeclaradaEm <> d.DeclaradaEm
           OR (d.Decisao IS NOT NULL AND (ISNULL(i.Decisao, N'''') <> ISNULL(d.Decisao, N'''') OR ISNULL(i.DecididaPorMembroId, -1) <> ISNULL(d.DecididaPorMembroId, -1)
                                          OR ISNULL(i.DecididaEm, ''19000101'') <> ISNULL(d.DecididaEm, ''19000101'') OR ISNULL(i.DecisaoObservacao, N'''') <> ISNULL(d.DecisaoObservacao, N'''')))
           OR d.LiberadoEm IS NOT NULL
           OR (d.Decisao IS NULL AND i.LiberadoEm IS NOT NULL)
           OR (ISNULL(d.Decisao, N'''') <> N''AFASTADO_PREVENTIVAMENTE'' AND i.LiberadoEm IS NOT NULL))
    BEGIN
        RAISERROR(N''A auto-denúncia é registro documental: não se apaga nem se altera; a decisão da Diretoria entra uma única vez e só o afastamento preventivo admite uma liberação posterior.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- Retiradas e consultas ao cadastro nacional: só acréscimo.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_MenoresRetiradas_Imutavel ON dbo.MinisterioMenoresRetiradas AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
    BEGIN
        RAISERROR(N''O registro de retirada automática da escala é histórico: não se altera nem se apaga.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_MenoresCadNac_Imutavel ON dbo.MinisterioMenoresCadastroNacional AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
    BEGIN
        RAISERROR(N''A consulta ao cadastro nacional é histórico: não se altera nem se apaga (nova consulta, nova linha).'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 10) Prazos configuráveis (Catálogos → Prazos) ----

IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'HABILITACAO_ANTECEDENTES_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('HABILITACAO_ANTECEDENTES_DIAS', N'Ministério com menores — validade da certidão de antecedentes, contada da emissão (Lei 14.811/2024: atualização semestral)', 180);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'HABILITACAO_TREINAMENTO_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('HABILITACAO_TREINAMENTO_DIAS', N'Ministério com menores — validade do treinamento de proteção quando atestado à mão, sem trilha de formação (padrão internacional: 2 a 3 anos)', 730);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'HABILITACAO_FICHA_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('HABILITACAO_FICHA_DIAS', N'Ministério com menores — validade da confirmação da ficha cadastral do voluntário (atualização semestral)', 180);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'MENORES_ADULTOS_MINIMOS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('MENORES_ADULTOS_MINIMOS', N'Ministério com menores — mínimo de adultos habilitados em cada sala com menores (regra dos dois adultos)', 2);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'MENORES_CRIANCAS_POR_ADULTO_BERCARIO')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('MENORES_CRIANCAS_POR_ADULTO_BERCARIO', N'Ministério com menores — máximo de crianças por adulto no berçário (0 a 2 anos)', 3);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'MENORES_CRIANCAS_POR_ADULTO_MATERNAL')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('MENORES_CRIANCAS_POR_ADULTO_MATERNAL', N'Ministério com menores — máximo de crianças por adulto no maternal (3 a 5 anos)', 5);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'MENORES_CRIANCAS_POR_ADULTO_INFANTIL')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('MENORES_CRIANCAS_POR_ADULTO_INFANTIL', N'Ministério com menores — máximo de crianças por adulto na turma infantil (6 a 9 anos)', 8);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'MENORES_CRIANCAS_POR_ADULTO_JUNIORES')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('MENORES_CRIANCAS_POR_ADULTO_JUNIORES', N'Ministério com menores — máximo de crianças por adulto na turma de juniores (10 a 12 anos)', 10);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'MENORES_CRIANCAS_POR_ADULTO_ADOLESCENTES')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('MENORES_CRIANCAS_POR_ADULTO_ADOLESCENTES', N'Ministério com menores — máximo de adolescentes por adulto (13 a 17 anos)', 12);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'MENORES_SALA_ALERTA_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('MENORES_SALA_ALERTA_DIAS', N'Ministério com menores — quantos dias à frente a rotina confere se alguma sala ficou com menos de dois adultos', 7);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'MENORES_AUTODENUNCIA_LEMBRETE_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('MENORES_AUTODENUNCIA_LEMBRETE_DIAS', N'Auto-denúncia (Reg. Art. 133 §5º, V) — dias depois da declaração em que a decisão pendente passa a ser cobrada da Diretoria todo dia', 1);
GO

-- ---- 11) Avisos (motor da vB.2). Os que protegem criança não podem ser desligados pelo destinatário (Obrigatoria = 1). ----

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'MENORES_VENCE_60')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'MENORES_VENCE_60', N'Ministério com menores: sua habilitação vence em até 60 dias', N'MENORES', NULL, NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'MENORES_VENCE_30')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'MENORES_VENCE_30', N'Ministério com menores: sua habilitação vence em até 30 dias', N'MENORES', NULL, NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'MENORES_VENCE_15')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'MENORES_VENCE_15', N'Ministério com menores: sua habilitação vence em até 15 dias', N'MENORES', NULL, NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'MENORES_RETIRADO_DA_ESCALA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'MENORES_RETIRADO_DA_ESCALA', N'Você saiu das escalas com menores: habilitação a regularizar', N'MENORES', NULL, NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'MENORES_VAGA_ABERTA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'MENORES_VAGA_ABERTA', N'Vaga aberta numa sala com menores: voluntário saiu da escala por habilitação', N'MENORES', NULL, NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'MENORES_SALA_SEM_SEGUNDO_ADULTO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'MENORES_SALA_SEM_SEGUNDO_ADULTO', N'Sala com menores sem dois adultos habilitados nos próximos dias', N'MENORES', NULL, NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'MENORES_VISTORIAS_A_RENOVAR')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'MENORES_VISTORIAS_A_RENOVAR', N'Voluntários com menores precisam de certidões novas', N'MENORES', N'vistoria_antecedentes', NULL, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'MENORES_AUTODENUNCIA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'MENORES_AUTODENUNCIA', N'Auto-denúncia: um voluntário comunicou inquérito ou processo criminal', N'MENORES', N'vistoria_antecedentes', NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'MENORES_AUTODENUNCIA_PENDENTE')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'MENORES_AUTODENUNCIA_PENDENTE', N'Auto-denúncia ainda sem decisão da Diretoria', N'MENORES', N'vistoria_antecedentes', NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'MENORES_AUTODENUNCIA_DECIDIDA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'MENORES_AUTODENUNCIA_DECIDIDA', N'Decisão da Diretoria sobre a sua comunicação', N'MENORES', NULL, NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'MENORES_CANAL_IRREGULAR')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'MENORES_CANAL_IRREGULAR', N'Canal com menores sem dois administradores adultos habilitados ou sem responsável com acesso', N'MENORES', N'canais_gestao', NULL, 1, 1);
GO

-- ---- 12) Retenção (informativa; o que executa é a anonimização do IP, na rotina diária) ----
-- Categoria cabe em 60 caracteres (NVARCHAR(60)); o texto da base legal é reaplicado a cada deploy.

IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Ministério com menores: aceites, consentimentos, retiradas')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (N'Ministério com menores: aceites, consentimentos, retiradas', N'x', 1825);
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Auto-denúncia de inquérito ou processo (Art. 133 §5º, V)')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (N'Auto-denúncia de inquérito ou processo (Art. 133 §5º, V)', N'x', 1825);
GO
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Aceite da política com menores, consentimento do responsável (LGPD art. 14 §1º), retiradas da escala e ficha (ECA art. 59-A; Lei 14.811/2024): prova guardada enquanto a pessoa servir. IP e cabeçalhos do aceite são anonimizados 5 anos depois (LGPD art. 16).'
WHERE Categoria = N'Ministério com menores: aceites, consentimentos, retiradas';
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Comunicação de inquérito ou processo criminal (Reg. Art. 133 §5º, V): só o tipo, a data da ciência e a decisão da Diretoria, sem texto livre. Guardada enquanto a pessoa servir e 5 anos depois; acesso restrito à Diretoria Executiva e ao Conselho de Ética.'
WHERE Categoria = N'Auto-denúncia de inquérito ou processo (Art. 133 §5º, V)';
GO
