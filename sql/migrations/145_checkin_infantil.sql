-- ============================================================
-- Migração 145 — v7.10: Check-in infantil com cadeia de custódia
-- (ECA art. 70 e 70-A — prevenção; art. 59-A (Lei 14.811/2024); LGPD art. 14 e art. 11 — dado de saúde de criança)
--
-- A v7.7 tornou obrigatória a habilitação de quem serve com menores e a regra dos dois adultos na ESCALA; a v7.8 deu à Igreja o relógio das 24 horas para o
-- Conselho Tutelar. Faltava a peça do dia a dia: quem entregou a criança, quem a retirou, a que horas, com que código. Esta migração acrescenta:
--   1) o registro de cada criança em cada visita (membro ou visitante), com o HMAC do código de retirada — o código em si nunca é gravado;
--   2) o histórico de acréscimo de cada ato (check-in, erro de código, retirada, divergência, segunda via, entrada e saída de voluntário);
--   3) a presença dos voluntários na sala (os adultos reais, não os previstos na escala);
--   4) a lista de autorizados a retirar, feita pelo responsável (além dos responsáveis cadastrados pela Secretaria, que já valem);
--   5) a alergia e a condição de saúde da criança membro (só com o consentimento de saúde da v7.7; revogar apaga);
--   6) a segunda via do código (dois olhares: quem pede e outro adulto da sala que confirma);
--   7) prazos, avisos obrigatórios e retenção;
--   8) a marca "com menores" da turma da EBD (o portão que a v7.8 deixou registrado para esta versão) e o registro da retirada automática de professor.
--
-- A sala é a mesma da v7.7: o par (serviço da escala, equipe com a marca "contato com menores"). Nada aqui altera o que já existe, salvo as colunas novas, que
-- começam desligadas/vazias: a turma da EBD só passa a exigir aptidão do professor quando alguém marcá-la.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

-- ---- 1) O registro de cada criança em cada visita ----
-- Uma linha por criança por check-in. A criança é membro (MenorMembroId) OU visitante (nome e nascimento, só para esta visita). Quem trouxe é um membro
-- (em geral o responsável cadastrado) OU uma pessoa de nome livre, com o tipo do documento conferido (nunca o número). O código de retirada fica só como HMAC.

IF OBJECT_ID(N'dbo.CheckinInfantilRegistros', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CheckinInfantilRegistros (
        RegistroId              INT IDENTITY PRIMARY KEY,
        ServicoId               INT NOT NULL REFERENCES dbo.EscalasServicos(ServicoId),
        EquipeId                INT NOT NULL REFERENCES dbo.EscalasEquipes(EquipeId),
        CongregacaoId           INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        MenorMembroId           INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        VisitanteNome           NVARCHAR(150) NULL,
        VisitanteNascimento     DATE NULL,
        IdadeAnos               INT NOT NULL CONSTRAINT CK_CheckinReg_Idade CHECK (IdadeAnos BETWEEN 0 AND 17),
        FaixaSala               NVARCHAR(12) NOT NULL CONSTRAINT CK_CheckinReg_Faixa CHECK (FaixaSala IN ('BERCARIO','MATERNAL','INFANTIL','JUNIORES','ADOLESCENTES')),
        IdadeForaDaFaixa        BIT NOT NULL CONSTRAINT DF_CheckinReg_Fora DEFAULT 0,
        TrouxeMembroId          INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        TrouxeNome              NVARCHAR(150) NULL,
        TrouxeParentesco        NVARCHAR(20) NULL,
        TrouxeContato           NVARCHAR(30) NULL,
        TrouxeDocumento         NVARCHAR(10) NULL CONSTRAINT CK_CheckinReg_TrouxeDoc CHECK (TrouxeDocumento IS NULL OR TrouxeDocumento IN ('RG','CNH','CPF','CERTIDAO','OUTRO')),
        SaudeTexto              NVARCHAR(400) NULL,
        SaudeOrigem             NVARCHAR(10) NULL CONSTRAINT CK_CheckinReg_SaudeOrigem CHECK (SaudeOrigem IS NULL OR SaudeOrigem IN ('CADASTRO','BALCAO')),
        SaudeTextoVersao        INT NULL,
        SaudeTextoHash          NVARCHAR(64) NULL,
        CodigoHash              NVARCHAR(64) NOT NULL,
        CodigoGeracao           INT NOT NULL CONSTRAINT DF_CheckinReg_Geracao DEFAULT 1,
        Tentativas              INT NOT NULL CONSTRAINT DF_CheckinReg_Tent DEFAULT 0,
        Travado                 BIT NOT NULL CONSTRAINT DF_CheckinReg_Travado DEFAULT 0,
        Situacao                NVARCHAR(18) NOT NULL CONSTRAINT DF_CheckinReg_Sit DEFAULT 'NA_SALA' CONSTRAINT CK_CheckinReg_Sit CHECK (Situacao IN ('NA_SALA','RETIRADA_PENDENTE','RETIRADA')),
        EntregueEm              DATETIME2 NOT NULL CONSTRAINT DF_CheckinReg_Em DEFAULT SYSUTCDATETIME(),
        EntreguePorMembroId     INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RetiradoEm              DATETIME2 NULL,
        RetiradoTipo            NVARCHAR(12) NULL CONSTRAINT CK_CheckinReg_RetTipo CHECK (RetiradoTipo IS NULL OR RetiradoTipo IN ('RESPONSAVEL','AUTORIZADO','TROUXE','OUTRO')),
        RetiradoMembroId        INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RetiradoNome            NVARCHAR(150) NULL,
        RetiradoParentesco      NVARCHAR(20) NULL,
        RetiradoDocumento       NVARCHAR(10) NULL CONSTRAINT CK_CheckinReg_RetDoc CHECK (RetiradoDocumento IS NULL OR RetiradoDocumento IN ('RG','CNH','CPF','CERTIDAO','OUTRO')),
        RetiradoPorOperadorId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Divergente              BIT NOT NULL CONSTRAINT DF_CheckinReg_Diverg DEFAULT 0,
        DivergenciaPedidaEm     DATETIME2 NULL,
        DivergenciaDecididaPorId INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DivergenciaDecididaEm   DATETIME2 NULL,
        DivergenciaMotivo       NVARCHAR(300) NULL,
        AnonimizadoEm           DATETIME2 NULL,
        CONSTRAINT CK_CheckinReg_Crianca CHECK (AnonimizadoEm IS NOT NULL
            OR (MenorMembroId IS NOT NULL AND VisitanteNome IS NULL AND VisitanteNascimento IS NULL)
            OR (MenorMembroId IS NULL AND VisitanteNome IS NOT NULL AND VisitanteNascimento IS NOT NULL)),
        CONSTRAINT CK_CheckinReg_Trouxe CHECK (AnonimizadoEm IS NOT NULL OR TrouxeMembroId IS NOT NULL OR (TrouxeNome IS NOT NULL AND TrouxeDocumento IS NOT NULL)),
        CONSTRAINT CK_CheckinReg_Saude CHECK ((SaudeTexto IS NULL AND SaudeOrigem IS NULL AND SaudeTextoVersao IS NULL AND SaudeTextoHash IS NULL)
            OR (SaudeTexto IS NOT NULL AND SaudeOrigem IS NOT NULL AND SaudeOrigem = 'CADASTRO')
            OR (SaudeTexto IS NOT NULL AND SaudeOrigem IS NOT NULL AND SaudeOrigem = 'BALCAO' AND SaudeTextoVersao IS NOT NULL AND SaudeTextoHash IS NOT NULL)),
        CONSTRAINT CK_CheckinReg_Estado CHECK (
               (Situacao = 'NA_SALA' AND RetiradoEm IS NULL AND RetiradoTipo IS NULL AND Divergente = 0)
            OR (Situacao = 'RETIRADA_PENDENTE' AND RetiradoEm IS NULL AND RetiradoTipo IS NOT NULL AND Divergente = 1 AND DivergenciaPedidaEm IS NOT NULL)
            OR (Situacao = 'RETIRADA' AND RetiradoEm IS NOT NULL AND RetiradoTipo IS NOT NULL AND RetiradoPorOperadorId IS NOT NULL
                AND (RetiradoMembroId IS NOT NULL OR RetiradoNome IS NOT NULL OR AnonimizadoEm IS NOT NULL)
                AND (Divergente = 0 OR (DivergenciaDecididaPorId IS NOT NULL AND DivergenciaDecididaEm IS NOT NULL)))),
        CONSTRAINT CK_CheckinReg_Tentativas CHECK (Tentativas >= 0)
    );
END
GO
-- A criança só está em UMA sala por vez (enquanto não foi retirada). Visitante não tem matrícula: a conferência dele é por nome e nascimento NO SERVIÇO (índice logo abaixo).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CheckinReg_MenorEmSala' AND object_id = OBJECT_ID(N'dbo.CheckinInfantilRegistros'))
    CREATE UNIQUE INDEX UX_CheckinReg_MenorEmSala ON dbo.CheckinInfantilRegistros (MenorMembroId) WHERE MenorMembroId IS NOT NULL AND Situacao <> 'RETIRADA';
GO
-- Achado na prova no banco real: sem este índice o MESMO visitante (nome e nascimento) podia fazer check-in duas vezes no mesmo serviço, ganhando dois códigos, dois registros e uma
-- contagem dobrada na proporção da sala; só um dos dois registros seria retirado e o outro ficaria "na sala" para sempre (e acionaria o aviso de criança sem retirada). Vale entre as salas
-- do serviço, e a corrida entre dois voluntários de salas diferentes também cai aqui (a trava da sala é por sala). O índice usa a ordenação do banco (sem diferenciar maiúscula de minúscula).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CheckinReg_VisitanteEmSala' AND object_id = OBJECT_ID(N'dbo.CheckinInfantilRegistros'))
    CREATE UNIQUE INDEX UX_CheckinReg_VisitanteEmSala ON dbo.CheckinInfantilRegistros (ServicoId, VisitanteNome, VisitanteNascimento) WHERE MenorMembroId IS NULL AND Situacao <> 'RETIRADA';
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CheckinReg_Sala' AND object_id = OBJECT_ID(N'dbo.CheckinInfantilRegistros'))
    CREATE INDEX IX_CheckinReg_Sala ON dbo.CheckinInfantilRegistros (ServicoId, EquipeId, Situacao);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CheckinReg_Menor' AND object_id = OBJECT_ID(N'dbo.CheckinInfantilRegistros'))
    CREATE INDEX IX_CheckinReg_Menor ON dbo.CheckinInfantilRegistros (MenorMembroId, RegistroId DESC) WHERE MenorMembroId IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CheckinReg_Pendentes' AND object_id = OBJECT_ID(N'dbo.CheckinInfantilRegistros'))
    CREATE INDEX IX_CheckinReg_Pendentes ON dbo.CheckinInfantilRegistros (CongregacaoId, Situacao) WHERE Situacao <> 'RETIRADA';
GO

-- Achado na prova no banco real: num CHECK, "desconhecido" PASSA. Com SaudeOrigem nulo, "SaudeOrigem = 'CADASTRO'" é desconhecido e deixava gravar texto de saúde sem origem (sem dizer
-- se veio do cadastro ou do balcão, e sem o hash do texto autorizado). O texto novo exige a origem; quem já aplicou o antigo recebe o novo (idempotente: sem o texto antigo, nada acontece).
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_CheckinReg_Saude' AND parent_object_id = OBJECT_ID(N'dbo.CheckinInfantilRegistros') AND definition NOT LIKE N'%SaudeOrigem] IS NOT NULL%')
BEGIN
    ALTER TABLE dbo.CheckinInfantilRegistros DROP CONSTRAINT CK_CheckinReg_Saude;
    ALTER TABLE dbo.CheckinInfantilRegistros ADD CONSTRAINT CK_CheckinReg_Saude CHECK ((SaudeTexto IS NULL AND SaudeOrigem IS NULL AND SaudeTextoVersao IS NULL AND SaudeTextoHash IS NULL)
        OR (SaudeTexto IS NOT NULL AND SaudeOrigem IS NOT NULL AND SaudeOrigem = 'CADASTRO')
        OR (SaudeTexto IS NOT NULL AND SaudeOrigem IS NOT NULL AND SaudeOrigem = 'BALCAO' AND SaudeTextoVersao IS NOT NULL AND SaudeTextoHash IS NOT NULL));
END
GO

-- O registro é prova de custódia: não se apaga, e o que prova (quando, quem entregou, quem retirou, de qual sala) não se altera. Os campos pessoais podem ser
-- anonimizados e o dado de saúde pode ser apagado (revogação do consentimento, retenção), e só. "Quem entregou" e "quem retirou" incluem o NOME em texto livre, o
-- documento conferido e a matrícula de quem trouxe a criança: só a anonimização (que preenche AnonimizadoEm no mesmo comando) os apaga; reescrever, nunca.
-- A anonimização também TIRA as três matrículas (da criança, de quem trouxe e de quem retirou): achado na prova no banco real, o registro "anonimizado" de uma criança membro continuava
-- ligado às pessoas pelos números de matrícula, o que é pseudonimizar e não anonimizar (os CHECK de baixo já aceitavam o nulo quando AnonimizadoEm está preenchido; faltava o gatilho
-- deixar e a rotina de retenção fazer). Trocar uma matrícula por OUTRA, ou pôr uma onde não havia, continua proibido.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_CheckinRegistros_Protegido ON dbo.CheckinInfantilRegistros AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    -- Achado na prova no banco real: o gatilho dispara TAMBÉM quando o UPDATE não alcança nenhuma linha (inserted e deleted vazios). Tratar "inserted vazio" como "DELETE" derrubava
    -- com "não se apaga" todo UPDATE que não casava com linha alguma — e é exatamente o que a retirada, a conferência do código, o destravar, a segunda via, o apagar da saúde e a rotina
    -- diária de retenção fazem quando perdem a corrida ou não há nada a mudar (viravam erro 500 em vez de "o registro mudou", e a retenção falhava todo dia). Só é DELETE se há linha em deleted.
    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        IF EXISTS (SELECT 1 FROM deleted)
        BEGIN
            RAISERROR(N''O registro de check-in infantil é prova de custódia: não se apaga.'', 16, 1);
            ROLLBACK TRANSACTION;
        END
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.RegistroId = i.RegistroId
        WHERE i.ServicoId <> d.ServicoId OR i.EquipeId <> d.EquipeId OR i.CongregacaoId <> d.CongregacaoId
           OR (ISNULL(i.MenorMembroId, -1) <> ISNULL(d.MenorMembroId, -1) AND NOT (i.AnonimizadoEm IS NOT NULL AND i.MenorMembroId IS NULL))
           OR i.EntregueEm <> d.EntregueEm OR i.EntreguePorMembroId <> d.EntreguePorMembroId OR i.IdadeAnos <> d.IdadeAnos OR i.FaixaSala <> d.FaixaSala
           OR (d.Situacao = N''RETIRADA'' AND (i.Situacao <> N''RETIRADA'' OR i.RetiradoEm <> d.RetiradoEm OR i.RetiradoTipo <> d.RetiradoTipo OR ISNULL(i.RetiradoPorOperadorId, -1) <> ISNULL(d.RetiradoPorOperadorId, -1)
                OR (ISNULL(i.RetiradoMembroId, -1) <> ISNULL(d.RetiradoMembroId, -1) AND NOT (i.AnonimizadoEm IS NOT NULL AND i.RetiradoMembroId IS NULL)) OR i.Divergente <> d.Divergente))
           OR (ISNULL(i.TrouxeMembroId, -1) <> ISNULL(d.TrouxeMembroId, -1) AND NOT (i.AnonimizadoEm IS NOT NULL AND i.TrouxeMembroId IS NULL)) OR ISNULL(i.TrouxeDocumento, N'''') <> ISNULL(d.TrouxeDocumento, N'''') OR ISNULL(i.TrouxeParentesco, N'''') <> ISNULL(d.TrouxeParentesco, N'''')
           OR (i.AnonimizadoEm IS NULL AND (ISNULL(i.VisitanteNome, N'''') <> ISNULL(d.VisitanteNome, N'''') OR ISNULL(i.VisitanteNascimento, ''19000101'') <> ISNULL(d.VisitanteNascimento, ''19000101'')
                OR ISNULL(i.TrouxeNome, N'''') <> ISNULL(d.TrouxeNome, N'''')))
           OR (d.Situacao = N''RETIRADA'' AND i.AnonimizadoEm IS NULL AND (ISNULL(i.RetiradoNome, N'''') <> ISNULL(d.RetiradoNome, N'''') OR ISNULL(i.RetiradoParentesco, N'''') <> ISNULL(d.RetiradoParentesco, N'''')
                OR ISNULL(i.RetiradoDocumento, N'''') <> ISNULL(d.RetiradoDocumento, N'''')))
           OR (d.AnonimizadoEm IS NOT NULL AND ISNULL(i.AnonimizadoEm, ''19000101'') <> d.AnonimizadoEm))
    BEGIN
        RAISERROR(N''O registro de check-in infantil é prova de custódia: o que prova quando, quem entregou, quem retirou e de qual sala não se altera.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 2) O histórico de acréscimo ----
-- Cada ato é uma linha. O histórico não leva nome, código, saúde nem texto livre: só quem fez, quando e um código curto do que aconteceu (e números como "tentativa 3").

IF OBJECT_ID(N'dbo.CheckinInfantilEventos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CheckinInfantilEventos (
        EventoId        BIGINT IDENTITY PRIMARY KEY,
        RegistroId      INT NULL REFERENCES dbo.CheckinInfantilRegistros(RegistroId),
        ServicoId       INT NOT NULL REFERENCES dbo.EscalasServicos(ServicoId),
        EquipeId        INT NOT NULL REFERENCES dbo.EscalasEquipes(EquipeId),
        Tipo            NVARCHAR(32) NOT NULL CONSTRAINT CK_CheckinEv_Tipo CHECK (Tipo IN
                        ('CHECKIN','CODIGO_ERRADO','CRIANCA_TRAVADA','CRIANCA_DESTRAVADA','RETIRADA','RETIRADA_DIVERGENTE_PEDIDA','RETIRADA_DIVERGENTE_APROVADA','RETIRADA_DIVERGENTE_NEGADA',
                         'SEGUNDA_VIA_PEDIDA','SEGUNDA_VIA_EMITIDA','VOLUNTARIO_ENTROU','VOLUNTARIO_SAIU','SALA_RECUSOU_CHECKIN')),
        AtorMembroId    INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Em              DATETIME2 NOT NULL CONSTRAINT DF_CheckinEv_Em DEFAULT SYSUTCDATETIME(),
        Detalhe         NVARCHAR(100) NULL
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CheckinEv_Registro' AND object_id = OBJECT_ID(N'dbo.CheckinInfantilEventos'))
    CREATE INDEX IX_CheckinEv_Registro ON dbo.CheckinInfantilEventos (RegistroId, EventoId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CheckinEv_Sala' AND object_id = OBJECT_ID(N'dbo.CheckinInfantilEventos'))
    CREATE INDEX IX_CheckinEv_Sala ON dbo.CheckinInfantilEventos (ServicoId, EquipeId, EventoId);
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_CheckinEventos_Imutavel ON dbo.CheckinInfantilEventos AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
    BEGIN
        RAISERROR(N''O histórico do check-in infantil é registro de custódia: não se altera nem se apaga.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 3) A presença dos voluntários na sala ----
-- Quem está na sala agora (SaiuEm nulo). Só entra quem está escalado nela e é apto (conferido no servidor); a contagem de adultos da proporção vem daqui.

IF OBJECT_ID(N'dbo.CheckinInfantilVoluntarios', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CheckinInfantilVoluntarios (
        PresencaId      INT IDENTITY PRIMARY KEY,
        ServicoId       INT NOT NULL REFERENCES dbo.EscalasServicos(ServicoId),
        EquipeId        INT NOT NULL REFERENCES dbo.EscalasEquipes(EquipeId),
        MembroId        INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        EntrouEm        DATETIME2 NOT NULL CONSTRAINT DF_CheckinVol_Entrou DEFAULT SYSUTCDATETIME(),
        SaiuEm          DATETIME2 NULL,
        CONSTRAINT CK_CheckinVol_Saida CHECK (SaiuEm IS NULL OR SaiuEm >= EntrouEm)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CheckinVol_Presente' AND object_id = OBJECT_ID(N'dbo.CheckinInfantilVoluntarios'))
    CREATE UNIQUE INDEX UX_CheckinVol_Presente ON dbo.CheckinInfantilVoluntarios (ServicoId, EquipeId, MembroId) WHERE SaiuEm IS NULL;
GO
-- Uma pessoa só está num lugar: o mesmo voluntário não está presente em duas salas do mesmo serviço (o líder de duas equipes, por exemplo, não conta como adulto das duas).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CheckinVol_UmaSala' AND object_id = OBJECT_ID(N'dbo.CheckinInfantilVoluntarios'))
    CREATE UNIQUE INDEX UX_CheckinVol_UmaSala ON dbo.CheckinInfantilVoluntarios (ServicoId, MembroId) WHERE SaiuEm IS NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CheckinVol_Sala' AND object_id = OBJECT_ID(N'dbo.CheckinInfantilVoluntarios'))
    CREATE INDEX IX_CheckinVol_Sala ON dbo.CheckinInfantilVoluntarios (ServicoId, EquipeId, SaiuEm);
GO

-- ---- 4) Autorizados a retirar (a lista que o responsável faz) ----
-- Os responsáveis cadastrados pela Secretaria (VoluntariadoResponsaveis) sempre podem retirar e não entram aqui. Esta lista é dos OUTROS: avó, tio, padrinho, o vizinho
-- que busca todo domingo. Quem a faz é um responsável ativo (Meu Painel) ou a Secretaria, com a ficha assinada. Revogar é preencher RevogadoEm (nada se apaga).

IF OBJECT_ID(N'dbo.CheckinInfantilAutorizados', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CheckinInfantilAutorizados (
        AutorizadoId            INT IDENTITY PRIMARY KEY,
        MenorMembroId           INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AutorizadoMembroId      INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Nome                    NVARCHAR(150) NOT NULL,
        Parentesco              NVARCHAR(20) NOT NULL,
        ValidoAte               DATE NULL,
        Forma                   NVARCHAR(12) NOT NULL CONSTRAINT CK_CheckinAut_Forma CHECK (Forma IN ('RESPONSAVEL','FICHA_FISICA')),
        Referencia              NVARCHAR(200) NULL,
        RegistradoPorMembroId   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm            DATETIME2 NOT NULL CONSTRAINT DF_CheckinAut_Em DEFAULT SYSUTCDATETIME(),
        RevogadoEm              DATETIME2 NULL,
        RevogadoPorMembroId     INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CONSTRAINT CK_CheckinAut_Ficha CHECK (Forma <> 'FICHA_FISICA' OR Referencia IS NOT NULL),
        CONSTRAINT CK_CheckinAut_Revogacao CHECK ((RevogadoEm IS NULL AND RevogadoPorMembroId IS NULL) OR (RevogadoEm IS NOT NULL AND RevogadoPorMembroId IS NOT NULL)),
        CONSTRAINT CK_CheckinAut_NaoSiMesmo CHECK (AutorizadoMembroId IS NULL OR AutorizadoMembroId <> MenorMembroId)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CheckinAut_Menor' AND object_id = OBJECT_ID(N'dbo.CheckinInfantilAutorizados'))
    CREATE INDEX IX_CheckinAut_Menor ON dbo.CheckinInfantilAutorizados (MenorMembroId, RevogadoEm);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CheckinAut_MembroAtivo' AND object_id = OBJECT_ID(N'dbo.CheckinInfantilAutorizados'))
    CREATE UNIQUE INDEX UX_CheckinAut_MembroAtivo ON dbo.CheckinInfantilAutorizados (MenorMembroId, AutorizadoMembroId) WHERE RevogadoEm IS NULL AND AutorizadoMembroId IS NOT NULL;
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_CheckinAutorizados_SemApagar ON dbo.CheckinInfantilAutorizados AFTER DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
    BEGIN
        RAISERROR(N''A lista de autorizados a retirar é histórico: revoga-se, não se apaga.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 4b) Autorizados só desta visita ----
-- No check-in o responsável pode indicar até 3 pessoas que também podem retirar a criança NESTA visita (a avó que vem buscar hoje). Vale para um registro só;
-- quem precisa valer sempre entra na lista do item 4 (criança membro). Para o visitante, é a única forma de ter mais gente autorizada.

IF OBJECT_ID(N'dbo.CheckinInfantilAutorizadosVisita', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CheckinInfantilAutorizadosVisita (
        AutorizadoVisitaId  INT IDENTITY PRIMARY KEY,
        RegistroId          INT NOT NULL REFERENCES dbo.CheckinInfantilRegistros(RegistroId),
        Nome                NVARCHAR(150) NULL,
        Parentesco          NVARCHAR(20) NOT NULL
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CheckinAutVisita_Registro' AND object_id = OBJECT_ID(N'dbo.CheckinInfantilAutorizadosVisita'))
    CREATE INDEX IX_CheckinAutVisita_Registro ON dbo.CheckinInfantilAutorizadosVisita (RegistroId);
GO

-- ---- 5) Saúde da criança membro (alergia e condição de saúde) ----
-- Uma linha por criança, escrita pelo responsável (Meu Painel) ou pela Secretaria (ficha assinada), e só enquanto vale o consentimento de saúde da v7.7
-- (MinisterioMenoresConsentimentos, finalidade SAUDE_CRACHA). Revogar o consentimento apaga esta linha e as cópias nos registros, na mesma operação.

IF OBJECT_ID(N'dbo.CheckinInfantilSaude', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CheckinInfantilSaude (
        MenorMembroId           INT NOT NULL PRIMARY KEY REFERENCES dbo.MembroReferencia(MembroId),
        Texto                   NVARCHAR(400) NOT NULL,
        Forma                   NVARCHAR(12) NOT NULL CONSTRAINT CK_CheckinSaude_Forma CHECK (Forma IN ('RESPONSAVEL','FICHA_FISICA')),
        Referencia              NVARCHAR(200) NULL,
        RegistradoPorMembroId   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AtualizadoEm            DATETIME2 NOT NULL CONSTRAINT DF_CheckinSaude_Em DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_CheckinSaude_Ficha CHECK (Forma <> 'FICHA_FISICA' OR Referencia IS NOT NULL),
        CONSTRAINT CK_CheckinSaude_Texto CHECK (LEN(LTRIM(RTRIM(Texto))) >= 2)
    );
END
GO

-- ---- 6) Segunda via do código (dois olhares) ----
-- Quem perdeu a etiqueta e o recibo pede a segunda via; um voluntário confere o documento e OUTRO adulto da sala confirma (até 10 minutos). O código antigo morre.

IF OBJECT_ID(N'dbo.CheckinInfantilSegundasVias', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CheckinInfantilSegundasVias (
        ViaId                   INT IDENTITY PRIMARY KEY,
        RegistroId              INT NOT NULL REFERENCES dbo.CheckinInfantilRegistros(RegistroId),
        PedidaPorMembroId       INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        PedidaEm                DATETIME2 NOT NULL CONSTRAINT DF_CheckinVia_Em DEFAULT SYSUTCDATETIME(),
        PessoaTipo              NVARCHAR(12) NOT NULL CONSTRAINT CK_CheckinVia_Tipo CHECK (PessoaTipo IN ('RESPONSAVEL','AUTORIZADO','TROUXE')),
        PessoaMembroId          INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        PessoaNome              NVARCHAR(150) NULL,
        Documento               NVARCHAR(10) NOT NULL CONSTRAINT CK_CheckinVia_Doc CHECK (Documento IN ('RG','CNH','CPF','CERTIDAO','OUTRO')),
        ConfirmadaPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ConfirmadaEm            DATETIME2 NULL,
        CanceladaEm             DATETIME2 NULL,
        CONSTRAINT CK_CheckinVia_Dois CHECK (ConfirmadaPorMembroId IS NULL OR ConfirmadaPorMembroId <> PedidaPorMembroId),
        CONSTRAINT CK_CheckinVia_Conf CHECK ((ConfirmadaPorMembroId IS NULL AND ConfirmadaEm IS NULL) OR (ConfirmadaPorMembroId IS NOT NULL AND ConfirmadaEm IS NOT NULL)),
        CONSTRAINT CK_CheckinVia_Cancel CHECK (CanceladaEm IS NULL OR ConfirmadaEm IS NULL)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CheckinVia_Pendente' AND object_id = OBJECT_ID(N'dbo.CheckinInfantilSegundasVias'))
    CREATE UNIQUE INDEX UX_CheckinVia_Pendente ON dbo.CheckinInfantilSegundasVias (RegistroId) WHERE ConfirmadaEm IS NULL AND CanceladaEm IS NULL;
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_CheckinVias_SemApagar ON dbo.CheckinInfantilSegundasVias AFTER DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
    BEGIN
        RAISERROR(N''O pedido de segunda via é registro de custódia: não se apaga.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 7) Prazos configuráveis (Catálogos → Prazos) ----
-- A sigla cabe em 40 caracteres. Minutos, horas e tentativas usam a mesma coluna de números inteiros.

IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'CHECKIN_ABRE_MINUTOS_ANTES')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('CHECKIN_ABRE_MINUTOS_ANTES', N'Check-in infantil — quantos MINUTOS antes do horário do serviço a sala passa a aceitar crianças', 60);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'CHECKIN_FECHA_HORAS_DEPOIS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('CHECKIN_FECHA_HORAS_DEPOIS', N'Check-in infantil — até quantas HORAS depois do horário do serviço a sala aceita novas crianças', 5);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'CHECKIN_TENTATIVAS_CODIGO')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('CHECKIN_TENTATIVAS_CODIGO', N'Check-in infantil — erros do código de retirada que travam a criança (no máximo 5)', 5);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'CHECKIN_VISITANTE_CONTATO_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('CHECKIN_VISITANTE_CONTATO_DIAS', N'Check-in infantil — dias até apagar o telefone de quem trouxe um visitante e o dado de saúde informado no balcão', 90);
GO

-- ---- 8) Avisos (motor da vB.2). Os que protegem criança não podem ser desligados pelo destinatário (Obrigatoria = 1). ----

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CHECKIN_RETIRADA_DIVERGENTE')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'CHECKIN_RETIRADA_DIVERGENTE', N'Check-in infantil: alguém que não está na lista pediu para retirar uma criança', N'MENORES', NULL, NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CHECKIN_SEGUNDA_VIA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'CHECKIN_SEGUNDA_VIA', N'Check-in infantil: foi emitida a segunda via do código de retirada da sua criança', N'MENORES', NULL, NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CHECKIN_SEM_RETIRADA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'CHECKIN_SEM_RETIRADA', N'Check-in infantil: criança sem retirada registrada depois do serviço', N'MENORES', NULL, NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'EBD_PROFESSOR_RETIRADO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'EBD_PROFESSOR_RETIRADO', N'EBD: professor saiu de turma com menores por falta de habilitação', N'MENORES', NULL, NULL, 1, 1);
GO

-- ---- 9) Retenção ----
-- O registro de custódia guarda-se 5 anos. A rotina diária apaga o telefone de visitante e o dado de saúde do balcão no prazo curto e anonimiza o resto depois.

IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Check-in infantil (entrega e retirada de crianças)')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (N'Check-in infantil (entrega e retirada de crianças)', N'x', 1825);
GO
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Entrega e retirada de crianças, código (só o HMAC), autorizados e saúde (ECA arts. 70 e 70-A; LGPD arts. 11 e 14): 5 anos como prova de custódia; telefone de visitante e saúde do balcão saem em 90 dias; a saúde cadastrada é apagada ao revogar o consentimento; depois, anonimiza.'
WHERE Categoria = N'Check-in infantil (entrega e retirada de crianças)';
GO

-- ---- 10) Portão da EBD: a turma "com menores" ----
-- A marca começa DESLIGADA (nada muda sozinho). Ligada, só professor apto entra na turma e a rotina diária tira quem deixou de ser apto. A retirada fica no mesmo
-- registro das equipes de escala (MinisterioMenoresRetiradas): a linha é de uma equipe OU de uma turma da EBD.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.EbdTurmas') AND name = N'ContatoComMenores')
    ALTER TABLE dbo.EbdTurmas ADD ContatoComMenores BIT NOT NULL CONSTRAINT DF_EbdTurmas_Menores DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MinisterioMenoresRetiradas') AND name = N'TurmaId')
    ALTER TABLE dbo.MinisterioMenoresRetiradas ADD TurmaId INT NULL REFERENCES dbo.EbdTurmas(TurmaId);
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MinisterioMenoresRetiradas') AND name = N'EquipeId' AND is_nullable = 0)
    ALTER TABLE dbo.MinisterioMenoresRetiradas ALTER COLUMN EquipeId INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_MenoresRetiradas_Origem')
    ALTER TABLE dbo.MinisterioMenoresRetiradas ADD CONSTRAINT CK_MenoresRetiradas_Origem CHECK ((EquipeId IS NOT NULL AND TurmaId IS NULL) OR (EquipeId IS NULL AND TurmaId IS NOT NULL));
GO
