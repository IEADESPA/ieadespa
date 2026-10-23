-- ============================================================
-- Migração 151 — v7.14: Identidade Visual Anual (Regimento Art. 159 § 1º; Art. 126-Q, II — só o nível Geral define a identidade)
-- (decisões do responsável da Igreja, 22/10/2026: a Secretaria cadastra os temas já usados; vota todo membro apto e em comunhão pelo Meu Painel; pedidos de uniforme FORA
--  — a camiseta do ano já é pedida na aba Camisetas do site. 23/10/2026: o ciclo é ABERTO pela Diretoria quando ela quiser; o processo de 2026 (identidade 2027) é feito fora
--  do sistema e o primeiro ciclo no sistema será o de novembro de 2027, identidade 2028.)
--
--   1) IdentidadeCiclos: um por ano da identidade (AnoAlvo único). As DATAS de cada etapa não ficam no banco: são calculadas na hora a partir do ano (shared/identidadeVisual.js,
--      horário de Brasília). Guarda a enquete da votação (uma por ciclo), a apuração e o tema definido (pela votação ou pelo desempate da Diretoria).
--   2) IdentidadeTemasUsados: "Temas já usados" desde 2006 (ano único). MANUAL = cadastrado pela Secretaria; PROCESSO = entrou sozinho com o resultado de um ciclo (não se edita).
--   3) IdentidadeSugestoes: até 3 ativas por membro e ciclo; o texto normalizado é único no ciclo (fora as retiradas); a triagem guarda o critério do descarte (Art. 159 § 1º,
--      I, a, 1 a 3) e a redação ajustada SEM perder a original. Quando a votação nasce, a cédula congela (gatilho).
--   4) IdentidadeCores (até 3 por ciclo), IdentidadeArtes (a imagem fica no Storage privado; até 3 ativas por membro e ciclo) e IdentidadeResultados (a escolha final do culto:
--      arte + cor, data, votos, ata; não se edita).
--   5) Enquetes.DataFechamentoPrevista: a enquete que fecha sozinha (lida na hora: depois do instante, ninguém mais vota; a rotina diária a encerra de vez).
--   6) a permissão identidade_visual (Presidente e Secretário Geral — o servidor ainda exige o nível Geral), os avisos à Diretoria e a retenção.
-- Nada se apaga: sugestão e arte só perdem o nome (e a sugestão não finalista, o texto) na exclusão LGPD e na retenção; a imagem não escolhida sai do Storage.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

-- ---- 1) Ciclos ----

IF OBJECT_ID(N'dbo.IdentidadeCiclos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.IdentidadeCiclos (
        CicloId                     INT IDENTITY PRIMARY KEY,
        AnoAlvo                     SMALLINT NOT NULL CONSTRAINT UQ_IdentidadeCiclos_Ano UNIQUE,
        AbertoPorMembroId           INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AbertoEm                    DATETIME2 NOT NULL CONSTRAINT DF_IdentidadeCiclos_AbertoEm DEFAULT SYSUTCDATETIME(),
        EnqueteId                   INT NULL REFERENCES dbo.Enquetes(EnqueteId),
        VotacaoCriadaEm             DATETIME2 NULL,
        VotacaoCriadaPorMembroId    INT NULL REFERENCES dbo.MembroReferencia(MembroId),     -- NULL = a votação abriu sozinha (rotina ou primeiro acesso no dia 22)
        Apuracao                    NVARCHAR(10) NULL,
        ApuradoEm                   DATETIME2 NULL,
        VotosTotal                  INT NULL,
        TemaSugestaoId              INT NULL,
        TemaTexto                   NVARCHAR(80) NULL,
        TemaVotos                   INT NULL,
        TemaDefinidoPor             NVARCHAR(10) NULL,
        DesempateMotivo             NVARCHAR(300) NULL,
        DesempatePorMembroId        INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DesempateEm                 DATETIME2 NULL,
        CONSTRAINT CK_IdentidadeCiclos_Votacao CHECK ((EnqueteId IS NULL AND VotacaoCriadaEm IS NULL AND VotacaoCriadaPorMembroId IS NULL) OR (EnqueteId IS NOT NULL AND VotacaoCriadaEm IS NOT NULL)),
        CONSTRAINT CK_IdentidadeCiclos_Tema CHECK ((TemaSugestaoId IS NULL AND TemaTexto IS NULL AND TemaDefinidoPor IS NULL AND TemaVotos IS NULL)
                                                OR (TemaSugestaoId IS NOT NULL AND LEN(TemaTexto) >= 3 AND TemaDefinidoPor IS NOT NULL AND TemaVotos IS NOT NULL AND Apuracao IS NOT NULL))
    );
END
GO
-- As restrições que a revisão de 23/10/2026 mudou ficam FORA do CREATE TABLE: quem já tinha a 151 aplicada (o banco local e a homologação) recebe a versão nova, e a segunda
-- rodada não faz nada. Cada uma é trocada só se a definição gravada for a antiga.
--   - o ano: o primeiro ciclo no sistema é o da identidade de 2028 (o de 2027 foi feito fora do sistema — decisão de 23/10/2026);
--   - a apuração NAO_VOTADA e o tema definido pela DIRETORIA: até 30/11 não houve 2 finalistas (ou a votação não chegou a abrir) — a Diretoria define o tema entre os
--     finalistas, com o motivo, sem enquete; o tema da votação só nasce do VENCEDOR; o do desempate só do EMPATE ou de nenhum voto, sempre com quem decidiu e por quê.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_IdentidadeCiclos_Ano' AND definition LIKE N'%2027%')
    ALTER TABLE dbo.IdentidadeCiclos DROP CONSTRAINT CK_IdentidadeCiclos_Ano;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_IdentidadeCiclos_Ano')
    ALTER TABLE dbo.IdentidadeCiclos ADD CONSTRAINT CK_IdentidadeCiclos_Ano CHECK (AnoAlvo BETWEEN 2028 AND 2200);
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_IdentidadeCiclos_Apuracao' AND definition NOT LIKE N'%NAO_VOTADA%')
    ALTER TABLE dbo.IdentidadeCiclos DROP CONSTRAINT CK_IdentidadeCiclos_Apuracao;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_IdentidadeCiclos_Apuracao')
    ALTER TABLE dbo.IdentidadeCiclos ADD CONSTRAINT CK_IdentidadeCiclos_Apuracao CHECK (Apuracao IS NULL OR Apuracao IN (N'VENCEDOR', N'EMPATE', N'SEM_VOTOS', N'NAO_VOTADA'));
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_IdentidadeCiclos_DefinidoPor' AND definition NOT LIKE N'%DIRETORIA%')
    ALTER TABLE dbo.IdentidadeCiclos DROP CONSTRAINT CK_IdentidadeCiclos_DefinidoPor;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_IdentidadeCiclos_DefinidoPor')
    ALTER TABLE dbo.IdentidadeCiclos ADD CONSTRAINT CK_IdentidadeCiclos_DefinidoPor CHECK (TemaDefinidoPor IS NULL OR TemaDefinidoPor IN (N'VOTACAO', N'DESEMPATE', N'DIRETORIA'));
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_IdentidadeCiclos_Apurado' AND definition NOT LIKE N'%NAO_VOTADA%')
    ALTER TABLE dbo.IdentidadeCiclos DROP CONSTRAINT CK_IdentidadeCiclos_Apurado;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_IdentidadeCiclos_Apurado')
    ALTER TABLE dbo.IdentidadeCiclos ADD CONSTRAINT CK_IdentidadeCiclos_Apurado CHECK ((Apuracao IS NULL AND ApuradoEm IS NULL AND VotosTotal IS NULL)
        OR (Apuracao IN (N'VENCEDOR', N'EMPATE', N'SEM_VOTOS') AND ApuradoEm IS NOT NULL AND VotosTotal IS NOT NULL AND VotosTotal >= 0 AND EnqueteId IS NOT NULL)
        OR (Apuracao = N'NAO_VOTADA' AND ApuradoEm IS NOT NULL AND VotosTotal = 0 AND EnqueteId IS NULL));
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_IdentidadeCiclos_Origem' AND definition NOT LIKE N'%DIRETORIA%')
    ALTER TABLE dbo.IdentidadeCiclos DROP CONSTRAINT CK_IdentidadeCiclos_Origem;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_IdentidadeCiclos_Origem')
    ALTER TABLE dbo.IdentidadeCiclos ADD CONSTRAINT CK_IdentidadeCiclos_Origem CHECK (TemaDefinidoPor IS NULL
        OR (TemaDefinidoPor = N'VOTACAO' AND Apuracao = N'VENCEDOR' AND DesempatePorMembroId IS NULL AND DesempateMotivo IS NULL AND DesempateEm IS NULL)
        OR (TemaDefinidoPor = N'DESEMPATE' AND Apuracao IN (N'EMPATE', N'SEM_VOTOS') AND DesempatePorMembroId IS NOT NULL AND LEN(DesempateMotivo) >= 5 AND DesempateEm IS NOT NULL)
        OR (TemaDefinidoPor = N'DIRETORIA' AND Apuracao = N'NAO_VOTADA' AND DesempatePorMembroId IS NOT NULL AND LEN(DesempateMotivo) >= 5 AND DesempateEm IS NOT NULL));
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_IdentidadeCiclos_Enquete' AND object_id = OBJECT_ID(N'dbo.IdentidadeCiclos'))
    CREATE UNIQUE INDEX UX_IdentidadeCiclos_Enquete ON dbo.IdentidadeCiclos (EnqueteId) WHERE EnqueteId IS NOT NULL;
GO
-- O ciclo anda para a frente: o ano, quem abriu e quando não mudam; a enquete ligada não se troca; a apuração e o tema, uma vez gravados, não mudam.
-- Apagar (cancelar o ciclo aberto por engano) só antes da votação — e as chaves estrangeiras já barram o ciclo que tem sugestão, cor, arte ou tema.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_IdentidadeCiclos_Protegido ON dbo.IdentidadeCiclos AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        IF EXISTS (SELECT 1 FROM deleted WHERE EnqueteId IS NOT NULL)
        BEGIN
            RAISERROR(N''O ciclo que já teve votação não se apaga.'', 16, 1);
            ROLLBACK TRANSACTION;
        END
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.CicloId = i.CicloId
        WHERE i.AnoAlvo <> d.AnoAlvo OR i.AbertoPorMembroId <> d.AbertoPorMembroId OR i.AbertoEm <> d.AbertoEm
           OR (d.EnqueteId IS NOT NULL AND ISNULL(i.EnqueteId, -1) <> d.EnqueteId)
           OR (d.Apuracao IS NOT NULL AND ISNULL(i.EnqueteId, -1) <> ISNULL(d.EnqueteId, -1))
           OR (d.VotacaoCriadaEm IS NOT NULL AND ISNULL(i.VotacaoCriadaEm, ''19000101'') <> d.VotacaoCriadaEm)
           OR (d.Apuracao IS NOT NULL AND (ISNULL(i.Apuracao, N'''') <> d.Apuracao OR ISNULL(i.ApuradoEm, ''19000101'') <> d.ApuradoEm OR ISNULL(i.VotosTotal, -1) <> d.VotosTotal))
           OR (d.TemaSugestaoId IS NOT NULL AND (ISNULL(i.TemaSugestaoId, -1) <> d.TemaSugestaoId OR ISNULL(i.TemaTexto, N'''') <> d.TemaTexto
               OR ISNULL(i.TemaDefinidoPor, N'''') <> d.TemaDefinidoPor OR ISNULL(i.TemaVotos, -1) <> d.TemaVotos)))
    BEGIN
        RAISERROR(N''O ciclo da identidade visual só anda para a frente: a votação, a apuração e o tema não mudam depois de gravados.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 2) Temas já usados ----

IF OBJECT_ID(N'dbo.IdentidadeTemasUsados', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.IdentidadeTemasUsados (
        TemaUsadoId                 INT IDENTITY PRIMARY KEY,
        Ano                         SMALLINT NOT NULL CONSTRAINT UQ_IdentidadeTemasUsados_Ano UNIQUE
                                        CONSTRAINT CK_IdentidadeTemasUsados_Ano CHECK (Ano BETWEEN 2006 AND 2200),
        Tema                        NVARCHAR(150) NOT NULL CONSTRAINT CK_IdentidadeTemasUsados_Tema CHECK (LEN(Tema) >= 3),
        TemaNormalizado             NVARCHAR(150) NOT NULL CONSTRAINT CK_IdentidadeTemasUsados_Normalizado CHECK (LEN(TemaNormalizado) >= 1),
        Origem                      NVARCHAR(9) NOT NULL CONSTRAINT CK_IdentidadeTemasUsados_Origem CHECK (Origem IS NOT NULL AND Origem IN (N'MANUAL', N'PROCESSO')),
        CicloId                     INT NULL REFERENCES dbo.IdentidadeCiclos(CicloId),
        RegistradoPorMembroId       INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm                DATETIME2 NOT NULL CONSTRAINT DF_IdentidadeTemasUsados_RegistradoEm DEFAULT SYSUTCDATETIME(),
        AtualizadoPorMembroId       INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AtualizadoEm                DATETIME2 NULL,
        CONSTRAINT CK_IdentidadeTemasUsados_Ciclo CHECK ((Origem = N'PROCESSO' AND CicloId IS NOT NULL) OR (Origem = N'MANUAL' AND CicloId IS NULL))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_IdentidadeTemasUsados_Normalizado' AND object_id = OBJECT_ID(N'dbo.IdentidadeTemasUsados'))
    CREATE INDEX IX_IdentidadeTemasUsados_Normalizado ON dbo.IdentidadeTemasUsados (TemaNormalizado) INCLUDE (Ano);
GO
-- O tema que entrou pelo processo (o resultado do culto) não se edita nem se apaga; o manual a Secretaria corrige.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_IdentidadeTemasUsados_Processo ON dbo.IdentidadeTemasUsados AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted WHERE Origem = N''PROCESSO'')
    BEGIN
        RAISERROR(N''O tema escolhido pelo processo da identidade visual não se edita nem se apaga.'', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM inserted WHERE Origem = N''PROCESSO'')
    BEGIN
        RAISERROR(N''Um tema cadastrado à mão não vira tema do processo.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 3) Sugestões ----

IF OBJECT_ID(N'dbo.IdentidadeSugestoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.IdentidadeSugestoes (
        SugestaoId                  INT IDENTITY PRIMARY KEY,
        CicloId                     INT NOT NULL REFERENCES dbo.IdentidadeCiclos(CicloId),
        MembroId                    INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Texto                       NVARCHAR(80) NOT NULL CONSTRAINT CK_IdentidadeSugestoes_Texto CHECK (LEN(Texto) >= 3),
        TextoNormalizado            NVARCHAR(100) NOT NULL CONSTRAINT CK_IdentidadeSugestoes_Normalizado CHECK (LEN(TextoNormalizado) >= 1),
        Status                      NVARCHAR(10) NOT NULL CONSTRAINT DF_IdentidadeSugestoes_Status DEFAULT N'ENVIADA'
                                        CONSTRAINT CK_IdentidadeSugestoes_Status CHECK (Status IS NOT NULL AND Status IN (N'ENVIADA', N'RETIRADA', N'FINALISTA', N'DESCARTADA')),
        ParecidoComAno              SMALLINT NULL,          -- marca para a triagem: parecido com o tema já usado deste ano (o texto do tema vai junto, como estava)
        ParecidoComTema             NVARCHAR(150) NULL,
        TextoFinal                  NVARCHAR(80) NULL,      -- a redação ajustada pela Diretoria (Art. 159 § 1º, II, a); a original fica em Texto
        Criterio                    TINYINT NULL CONSTRAINT CK_IdentidadeSugestoes_Criterio CHECK (Criterio IS NULL OR Criterio IN (1, 2, 3)),
        ObservacaoTriagem           NVARCHAR(300) NULL,
        TriadoPorMembroId           INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        TriadoEm                    DATETIME2 NULL,
        OpcaoId                     INT NULL REFERENCES dbo.OpcoesEnquete(OpcaoId),     -- a opção da enquete que é esta finalista
        VotosApurados               INT NULL,                                           -- os votos desta finalista, gravados na apuração (não se recontam depois)
        CriadaEm                    DATETIME2 NOT NULL CONSTRAINT DF_IdentidadeSugestoes_CriadaEm DEFAULT SYSUTCDATETIME(),
        RetiradaEm                  DATETIME2 NULL,
        AnonimizadoEm               DATETIME2 NULL,
        CONSTRAINT CK_IdentidadeSugestoes_Triagem CHECK ((Status IN (N'FINALISTA', N'DESCARTADA') AND TriadoEm IS NOT NULL AND TriadoPorMembroId IS NOT NULL)
                                                      OR (Status IN (N'ENVIADA', N'RETIRADA') AND TriadoEm IS NULL AND TriadoPorMembroId IS NULL AND ObservacaoTriagem IS NULL)),
        CONSTRAINT CK_IdentidadeSugestoes_Descarte CHECK ((Status = N'DESCARTADA' AND Criterio IS NOT NULL) OR (Status <> N'DESCARTADA' AND Criterio IS NULL)),
        CONSTRAINT CK_IdentidadeSugestoes_Ajuste CHECK (TextoFinal IS NULL OR (Status = N'FINALISTA' AND LEN(TextoFinal) >= 3)),
        CONSTRAINT CK_IdentidadeSugestoes_Opcao CHECK (OpcaoId IS NULL OR Status = N'FINALISTA'),
        CONSTRAINT CK_IdentidadeSugestoes_Retirada CHECK ((Status = N'RETIRADA' AND RetiradaEm IS NOT NULL) OR (Status <> N'RETIRADA' AND RetiradaEm IS NULL)),
        CONSTRAINT CK_IdentidadeSugestoes_Anonimo CHECK (MembroId IS NOT NULL OR AnonimizadoEm IS NOT NULL)
    );
END
GO
IF COL_LENGTH(N'dbo.IdentidadeSugestoes', N'VotosApurados') IS NULL
    ALTER TABLE dbo.IdentidadeSugestoes ADD VotosApurados INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_IdentidadeSugestoes_Texto' AND object_id = OBJECT_ID(N'dbo.IdentidadeSugestoes'))
    CREATE UNIQUE INDEX UX_IdentidadeSugestoes_Texto ON dbo.IdentidadeSugestoes (CicloId, TextoNormalizado) WHERE Status IN (N'ENVIADA', N'FINALISTA', N'DESCARTADA');
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_IdentidadeSugestoes_Membro' AND object_id = OBJECT_ID(N'dbo.IdentidadeSugestoes'))
    CREATE INDEX IX_IdentidadeSugestoes_Membro ON dbo.IdentidadeSugestoes (MembroId, CicloId) INCLUDE (Status) WHERE MembroId IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_IdentidadeSugestoes_Ciclo' AND object_id = OBJECT_ID(N'dbo.IdentidadeSugestoes'))
    CREATE INDEX IX_IdentidadeSugestoes_Ciclo ON dbo.IdentidadeSugestoes (CicloId, Status);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_IdentidadeCiclos_TemaSugestao')
    ALTER TABLE dbo.IdentidadeCiclos ADD CONSTRAINT FK_IdentidadeCiclos_TemaSugestao FOREIGN KEY (TemaSugestaoId) REFERENCES dbo.IdentidadeSugestoes(SugestaoId);
GO
-- (a) no máximo 3 sugestões ativas (não retiradas) por membro e ciclo — a guarda do banco, além da do servidor;
-- (b) nada se apaga; o ciclo, a data e a origem não mudam; a retirada não volta; só a ENVIADA se retira; a pessoa só sai na anonimização (e o texto só muda nela);
-- (c) a cédula congela quando a votação nasce: depois disso a decisão da triagem e a redação final não mudam.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_IdentidadeSugestoes_Regras ON dbo.IdentidadeSugestoes AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        IF EXISTS (SELECT 1 FROM deleted)
        BEGIN
            RAISERROR(N''A sugestão não se apaga (pode ser retirada por quem mandou, até o dia 15).'', 16, 1);
            ROLLBACK TRANSACTION;
        END
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM (SELECT DISTINCT CicloId, MembroId FROM inserted WHERE MembroId IS NOT NULL AND Status <> N''RETIRADA'') i
        WHERE (SELECT COUNT(*) FROM dbo.IdentidadeSugestoes s WHERE s.CicloId = i.CicloId AND s.MembroId = i.MembroId AND s.Status <> N''RETIRADA'') > 3)
    BEGIN
        RAISERROR(N''Cada membro manda no máximo 3 sugestões por ano.'', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END
    IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.SugestaoId = i.SugestaoId
        WHERE i.CicloId <> d.CicloId OR i.CriadaEm <> d.CriadaEm
           OR (d.Status = N''RETIRADA'' AND i.Status <> N''RETIRADA'')
           OR (i.Status = N''RETIRADA'' AND d.Status NOT IN (N''ENVIADA'', N''RETIRADA''))
           OR (ISNULL(i.MembroId, -1) <> ISNULL(d.MembroId, -1) AND NOT (i.MembroId IS NULL AND i.AnonimizadoEm IS NOT NULL))
           OR (d.AnonimizadoEm IS NOT NULL AND ISNULL(i.AnonimizadoEm, ''19000101'') <> d.AnonimizadoEm)
           OR ((i.Texto COLLATE Latin1_General_BIN2 <> d.Texto COLLATE Latin1_General_BIN2 OR i.TextoNormalizado <> d.TextoNormalizado) AND NOT (d.AnonimizadoEm IS NULL AND i.AnonimizadoEm IS NOT NULL))
           OR (d.OpcaoId IS NOT NULL AND ISNULL(i.OpcaoId, -1) <> d.OpcaoId)
           OR (d.VotosApurados IS NOT NULL AND ISNULL(i.VotosApurados, -1) <> d.VotosApurados))
    BEGIN
        RAISERROR(N''A sugestão só anda para a frente: o texto original fica, a retirada não volta e a pessoa só sai na anonimização.'', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.SugestaoId = i.SugestaoId JOIN dbo.IdentidadeCiclos c ON c.CicloId = i.CicloId
        WHERE c.EnqueteId IS NOT NULL AND (i.Status <> d.Status OR ISNULL(i.TextoFinal, N'''') COLLATE Latin1_General_BIN2 <> ISNULL(d.TextoFinal, N'''') COLLATE Latin1_General_BIN2
              OR ISNULL(i.Criterio, 0) <> ISNULL(d.Criterio, 0)))
    BEGIN
        RAISERROR(N''A votação já começou: a lista de finalistas não muda mais.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 4) Cores, artes e o resultado ----

IF OBJECT_ID(N'dbo.IdentidadeCores', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.IdentidadeCores (
        CorId                       INT IDENTITY PRIMARY KEY,
        CicloId                     INT NOT NULL REFERENCES dbo.IdentidadeCiclos(CicloId),
        Ordem                       TINYINT NOT NULL CONSTRAINT CK_IdentidadeCores_Ordem CHECK (Ordem BETWEEN 1 AND 3),
        Nome                        NVARCHAR(40) NOT NULL CONSTRAINT CK_IdentidadeCores_Nome CHECK (LEN(Nome) >= 2),
        Hex                         CHAR(7) NOT NULL CONSTRAINT CK_IdentidadeCores_Hex CHECK (Hex COLLATE Latin1_General_BIN2 LIKE '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]'),
        RegistradoPorMembroId       INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm                DATETIME2 NOT NULL CONSTRAINT DF_IdentidadeCores_RegistradoEm DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_IdentidadeCores_Ordem UNIQUE (CicloId, Ordem)
    );
END
GO

IF OBJECT_ID(N'dbo.IdentidadeArtes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.IdentidadeArtes (
        ArteId                      INT IDENTITY PRIMARY KEY,
        CicloId                     INT NOT NULL REFERENCES dbo.IdentidadeCiclos(CicloId),
        MembroId                    INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Titulo                      NVARCHAR(80) NULL,
        Descricao                   NVARCHAR(300) NULL,
        ArquivoUrl                  NVARCHAR(500) NULL,
        TipoConteudo                NVARCHAR(20) NOT NULL CONSTRAINT CK_IdentidadeArtes_Tipo CHECK (TipoConteudo IN (N'image/png', N'image/jpeg')),
        TamanhoBytes                INT NOT NULL CONSTRAINT CK_IdentidadeArtes_Tamanho CHECK (TamanhoBytes BETWEEN 1 AND 5242880),
        Sha256                      CHAR(64) NOT NULL,
        Status                      NVARCHAR(10) NOT NULL CONSTRAINT DF_IdentidadeArtes_Status DEFAULT N'ENVIADA'
                                        CONSTRAINT CK_IdentidadeArtes_Status CHECK (Status IS NOT NULL AND Status IN (N'ENVIADA', N'RETIRADA', N'RECUSADA', N'ESCOLHIDA')),
        MotivoRecusa                NVARCHAR(300) NULL,
        RecusadaPorMembroId         INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RecusadaEm                  DATETIME2 NULL,
        CriadaEm                    DATETIME2 NOT NULL CONSTRAINT DF_IdentidadeArtes_CriadaEm DEFAULT SYSUTCDATETIME(),
        RetiradaEm                  DATETIME2 NULL,
        ImagemApagadaEm             DATETIME2 NULL,
        AnonimizadoEm               DATETIME2 NULL,
        EnviadaPelaDiretoria        BIT NOT NULL CONSTRAINT DF_IdentidadeArtes_Diretoria DEFAULT 0,
        CONSTRAINT CK_IdentidadeArtes_Imagem CHECK ((ArquivoUrl IS NOT NULL AND ImagemApagadaEm IS NULL) OR (ArquivoUrl IS NULL AND ImagemApagadaEm IS NOT NULL)),
        CONSTRAINT CK_IdentidadeArtes_Escolhida CHECK (Status <> N'ESCOLHIDA' OR ArquivoUrl IS NOT NULL),
        CONSTRAINT CK_IdentidadeArtes_Recusa CHECK ((Status = N'RECUSADA' AND RecusadaEm IS NOT NULL AND RecusadaPorMembroId IS NOT NULL AND LEN(MotivoRecusa) >= 3)
                                                 OR (Status <> N'RECUSADA' AND RecusadaEm IS NULL AND RecusadaPorMembroId IS NULL AND MotivoRecusa IS NULL)),
        CONSTRAINT CK_IdentidadeArtes_Retirada CHECK ((Status = N'RETIRADA' AND RetiradaEm IS NOT NULL) OR (Status <> N'RETIRADA' AND RetiradaEm IS NULL)),
        CONSTRAINT CK_IdentidadeArtes_Hash CHECK (LEN(Sha256) = 64),
        CONSTRAINT CK_IdentidadeArtes_Anonimo CHECK (MembroId IS NOT NULL OR AnonimizadoEm IS NOT NULL)
    );
END
GO
IF COL_LENGTH(N'dbo.IdentidadeArtes', N'EnviadaPelaDiretoria') IS NULL
    ALTER TABLE dbo.IdentidadeArtes ADD EnviadaPelaDiretoria BIT NOT NULL CONSTRAINT DF_IdentidadeArtes_Diretoria DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_IdentidadeArtes_Escolhida' AND object_id = OBJECT_ID(N'dbo.IdentidadeArtes'))
    CREATE UNIQUE INDEX UX_IdentidadeArtes_Escolhida ON dbo.IdentidadeArtes (CicloId) WHERE Status = N'ESCOLHIDA';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_IdentidadeArtes_Membro' AND object_id = OBJECT_ID(N'dbo.IdentidadeArtes'))
    CREATE INDEX IX_IdentidadeArtes_Membro ON dbo.IdentidadeArtes (MembroId, CicloId) INCLUDE (Status) WHERE MembroId IS NOT NULL;
GO
-- No máximo 3 artes ativas (enviadas ou a escolhida) por membro e ciclo; nada se apaga; a decisão (retirada, recusada, escolhida) é final; a imagem só sai (vira NULL) com a
-- data em que saiu; a pessoa só sai na anonimização.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_IdentidadeArtes_Regras ON dbo.IdentidadeArtes AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        IF EXISTS (SELECT 1 FROM deleted)
        BEGIN
            RAISERROR(N''A arte não se apaga (pode ser retirada por quem mandou).'', 16, 1);
            ROLLBACK TRANSACTION;
        END
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM (SELECT DISTINCT CicloId, MembroId FROM inserted WHERE MembroId IS NOT NULL AND Status IN (N''ENVIADA'', N''ESCOLHIDA'') AND EnviadaPelaDiretoria = 0) i
        WHERE (SELECT COUNT(*) FROM dbo.IdentidadeArtes a WHERE a.CicloId = i.CicloId AND a.MembroId = i.MembroId AND a.Status IN (N''ENVIADA'', N''ESCOLHIDA'') AND a.EnviadaPelaDiretoria = 0) > 3)
    BEGIN
        RAISERROR(N''Cada membro manda no máximo 3 artes por ano.'', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END
    IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.ArteId = i.ArteId
        WHERE i.CicloId <> d.CicloId OR i.CriadaEm <> d.CriadaEm OR i.Sha256 <> d.Sha256 OR i.TipoConteudo <> d.TipoConteudo OR i.TamanhoBytes <> d.TamanhoBytes
           OR i.EnviadaPelaDiretoria <> d.EnviadaPelaDiretoria
           OR (d.Status <> N''ENVIADA'' AND i.Status <> d.Status)
           OR (d.ArquivoUrl IS NULL AND i.ArquivoUrl IS NOT NULL)
           OR (d.ArquivoUrl IS NOT NULL AND i.ArquivoUrl IS NOT NULL AND i.ArquivoUrl <> d.ArquivoUrl)
           OR (ISNULL(i.MembroId, -1) <> ISNULL(d.MembroId, -1) AND NOT (i.MembroId IS NULL AND i.AnonimizadoEm IS NOT NULL))
           OR (d.AnonimizadoEm IS NOT NULL AND ISNULL(i.AnonimizadoEm, ''19000101'') <> d.AnonimizadoEm))
    BEGIN
        RAISERROR(N''A arte só anda para a frente: a decisão é final e a imagem não volta.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

IF OBJECT_ID(N'dbo.IdentidadeResultados', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.IdentidadeResultados (
        ResultadoId                 INT IDENTITY PRIMARY KEY,
        CicloId                     INT NOT NULL CONSTRAINT UQ_IdentidadeResultados_Ciclo UNIQUE REFERENCES dbo.IdentidadeCiclos(CicloId),
        ArteId                      INT NOT NULL CONSTRAINT UQ_IdentidadeResultados_Arte UNIQUE REFERENCES dbo.IdentidadeArtes(ArteId),
        CorId                       INT NOT NULL REFERENCES dbo.IdentidadeCores(CorId),
        TemaTexto                   NVARCHAR(80) NOT NULL,
        CorNome                     NVARCHAR(40) NOT NULL,
        CorHex                      CHAR(7) NOT NULL,
        DataCulto                   DATE NOT NULL,
        Ocasiao                     NVARCHAR(20) NOT NULL CONSTRAINT CK_IdentidadeResultados_Ocasiao CHECK (Ocasiao IS NOT NULL AND Ocasiao IN (N'CULTO_ADMINISTRATIVO', N'VIGILIA')),
        VotosVencedor               INT NOT NULL CONSTRAINT CK_IdentidadeResultados_Votos CHECK (VotosVencedor >= 1),
        Presentes                   INT NULL,
        Ata                         NVARCHAR(1000) NULL,
        RegistradoPorMembroId       INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm                DATETIME2 NOT NULL CONSTRAINT DF_IdentidadeResultados_RegistradoEm DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_IdentidadeResultados_Presentes CHECK (Presentes IS NULL OR Presentes >= VotosVencedor)
    );
END
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_IdentidadeResultados_Imutavel ON dbo.IdentidadeResultados AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    RAISERROR(N''O resultado da escolha final não se edita nem se apaga: é o registro do que o culto decidiu.'', 16, 1);
    ROLLBACK TRANSACTION;
END');
GO
-- A cor do ciclo com resultado não muda nem sai; a cor em que já há arte (enviada ou escolhida) não muda nem sai (a arte foi feita "baseada nas cores": Art. 159 § 1º, IV, b).
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_IdentidadeCores_Protegida ON dbo.IdentidadeCores AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted d WHERE EXISTS (SELECT 1 FROM dbo.IdentidadeResultados r WHERE r.CicloId = d.CicloId)
                                          OR EXISTS (SELECT 1 FROM dbo.IdentidadeArtes a WHERE a.CicloId = d.CicloId AND a.Status IN (N''ENVIADA'', N''ESCOLHIDA'')))
    BEGIN
        RAISERROR(N''As cores não mudam depois que chegou a primeira arte (ou depois do resultado).'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 5) Enquete que fecha sozinha ----

IF COL_LENGTH(N'dbo.Enquetes', N'DataFechamentoPrevista') IS NULL
    ALTER TABLE dbo.Enquetes ADD DataFechamentoPrevista DATETIME2 NULL;
GO

-- ---- 6) Permissão, avisos e retenção ----

IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'identidade_visual')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('identidade_visual', N'Identidade Visual Anual — temas, triagem, votação, cores e arte (Art. 159)');
UPDATE dbo.Papeis
SET Permissoes = CASE WHEN ISNULL(Permissoes, '') = '' THEN 'identidade_visual' ELSE Permissoes + ',identidade_visual' END
WHERE Nome IN (N'Presidente', N'Secretário Geral') AND (',' + ISNULL(Permissoes, '') + ',') NOT LIKE '%,identidade_visual,%';
GO

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'IDENTIDADE_TRIAGEM')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'IDENTIDADE_TRIAGEM', N'Identidade visual: a triagem das sugestões começou', N'IDENTIDADE', N'identidade_visual', N'GLOBAL', 1, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'IDENTIDADE_VOTACAO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'IDENTIDADE_VOTACAO', N'Identidade visual: a votação do tema', N'IDENTIDADE', N'identidade_visual', N'GLOBAL', 1, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'IDENTIDADE_APURACAO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'IDENTIDADE_APURACAO', N'Identidade visual: a votação do tema terminou', N'IDENTIDADE', N'identidade_visual', N'GLOBAL', 1, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'IDENTIDADE_ARTE')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'IDENTIDADE_ARTE', N'Identidade visual: fase das cores e da arte', N'IDENTIDADE', N'identidade_visual', N'GLOBAL', 1, 0);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Identidade visual — sugestões e artes dos membros')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao) VALUES (N'Identidade visual — sugestões e artes dos membros', N'x', 365);
GO
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Processo participativo da Identidade Visual (Regimento Art. 159; LGPD art. 7º, IX): 1 ano depois do fim do ciclo (31/12) a sugestão e a arte perdem o nome de quem mandou e a imagem não escolhida sai do armazenamento; ficam as contagens, os finalistas e o tema e a arte escolhidos.'
WHERE Categoria = N'Identidade visual — sugestões e artes dos membros' AND BaseLegal = N'x';
GO
