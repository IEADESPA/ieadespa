-- ============================================================
-- Migração 156 — v8.1: AFM (Academia de Formação Ministerial) e CLI: comparecimento e perda de assento (a antiga v7.9).
--
-- Base legal: Estatuto Art. 15 §1º e Art. 27; Regimento Art. 22, 56 §2º, 66 a 70, 72 e 149. Desenho em docs/plano/fase-8-ministerial-afm.md.
--
--   1) Sessoes.ContaFaltasCLI: a reunião da CLI que conta para as 3 faltas (Ordinária e Sessão Magna da AFM). Nasce 0 em todas as reuniões antigas: só contam as abertas
--      depois da v8.1 (ninguém é excluído por uma regra que ainda não estava no sistema). TipoSessao ganha o valor 'MAGNA_AFM' (a Sessão Magna, Art. 69).
--   2) Presencas: EsperadoCLI/EsperadoAFM (a pessoa era esperada pela CLI e/ou pela Academia NAQUELE dia — quem virou Presbítero depois não herda falta da época de Diácono),
--      MotivoCodigo/PendenteCodigo (o catálogo fechado do Art. 149 §2º; os vedados nem entram no banco) e ComprovanteConferido (Art. 69 §2º, I).
--   3) Matriculas_AFM (já existia, sem uso além da elegibilidade do CEI): ganha a origem (automática ou rematrícula), a data, o "concluído" do nível e a aprovação na reciclagem.
--      Uma matrícula automática por pessoa (índice único filtrado). Todo oficial atual é matriculado aqui (Art. 66 §2º: a matrícula é obrigatória).
--   4) AFMDesmatriculas: a matrícula que ficou inativa (3 Sessões Magnas seguidas sem justificativa — apurado pelo sistema — ou reprovação técnica registrada pela AFM).
--      Uma vigente por matrícula; anular (justificativa aceita depois) guarda quem/quando/por quê. Não se apaga (gatilho).
--   5) CLIExclusoesFaltas: a exclusão da CLI por 3 faltas seguidas (apurada pelo sistema), com as 3 reuniões, por onde a pessoa entrava e as providências; comunicação à CLI e
--      readmissão (Art. 149 §1º). Uma vigente por pessoa. Não se apaga (gatilho).
--   6) AFMCorpoDocente: Reitor (um por vez; mandato até 31/12; homologação técnica da CLI) e docentes, com a titulação.
--   7) ComissaoMembros.Qualificacao: a titulação dos 2 mestres de teologia da CDER (Art. 22).
--   8) A permissão "afm" (Presidente, Secretário Geral e o papel novo "Reitor da AFM"), as regras de aviso e a retenção.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

-- ---- 1) A reunião da CLI que conta falta ----
IF COL_LENGTH(N'dbo.Sessoes', N'ContaFaltasCLI') IS NULL
    ALTER TABLE dbo.Sessoes ADD ContaFaltasCLI BIT NOT NULL CONSTRAINT DF_Sessoes_ContaFaltasCLI DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Sessoes_ContaFaltasCLI' AND object_id = OBJECT_ID(N'dbo.Sessoes'))
    CREATE INDEX IX_Sessoes_ContaFaltasCLI ON dbo.Sessoes (DataSessao, SessaoId) INCLUDE (TipoSessao, Status) WHERE ContaFaltasCLI = 1;
GO
-- A reunião aberta ou encerrada por engano (ou duas no mesmo dia) pode ser marcada pelo nível geral como "não conta falta", com o motivo: a apuração é refeita na hora.
IF COL_LENGTH(N'dbo.Sessoes', N'NaoContaMotivo') IS NULL
    ALTER TABLE dbo.Sessoes ADD NaoContaMotivo NVARCHAR(300) NULL, NaoContaPor INT NULL, NaoContaEm DATETIME2 NULL;
GO

-- ---- 2) Presenças: quem era esperado e o motivo do catálogo ----
IF COL_LENGTH(N'dbo.Presencas', N'EsperadoCLI') IS NULL
    ALTER TABLE dbo.Presencas ADD EsperadoCLI BIT NULL;
GO
IF COL_LENGTH(N'dbo.Presencas', N'EsperadoAFM') IS NULL
    ALTER TABLE dbo.Presencas ADD EsperadoAFM BIT NULL;
GO
IF COL_LENGTH(N'dbo.Presencas', N'MotivoCodigo') IS NULL
    ALTER TABLE dbo.Presencas ADD MotivoCodigo NVARCHAR(30) NULL;
GO
IF COL_LENGTH(N'dbo.Presencas', N'PendenteCodigo') IS NULL
    ALTER TABLE dbo.Presencas ADD PendenteCodigo NVARCHAR(30) NULL;
GO
IF COL_LENGTH(N'dbo.Presencas', N'ComprovanteConferido') IS NULL
    ALTER TABLE dbo.Presencas ADD ComprovanteConferido BIT NULL;
GO
-- Os vedados do Art. 149 §2º, II nunca entram: só o catálogo aceito (nulo = reunião de outro órgão, ou falta sem justificativa).
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Presencas_MotivoCodigo')
    ALTER TABLE dbo.Presencas ADD CONSTRAINT CK_Presencas_MotivoCodigo
        CHECK (MotivoCodigo IS NULL OR MotivoCodigo IN (N'SAUDE', N'VIAGEM_PROFISSIONAL', N'LUTO', N'EMERGENCIA_FAMILIAR', N'OUTRO_EXTERNO'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Presencas_PendenteCodigo')
    ALTER TABLE dbo.Presencas ADD CONSTRAINT CK_Presencas_PendenteCodigo
        CHECK (PendenteCodigo IS NULL OR PendenteCodigo IN (N'SAUDE', N'VIAGEM_PROFISSIONAL', N'LUTO', N'EMERGENCIA_FAMILIAR', N'OUTRO_EXTERNO'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Presencas_Membro_Sessao' AND object_id = OBJECT_ID(N'dbo.Presencas'))
    CREATE INDEX IX_Presencas_Membro_Sessao ON dbo.Presencas (MembroId, SessaoId) INCLUDE (Presente, FaltaJustificada, EsperadoCLI, EsperadoAFM);
GO

-- ---- 3) Matrícula na AFM ----
IF COL_LENGTH(N'dbo.Matriculas_AFM', N'Origem') IS NULL
    ALTER TABLE dbo.Matriculas_AFM ADD Origem NVARCHAR(12) NULL;
GO
IF COL_LENGTH(N'dbo.Matriculas_AFM', N'DataMatricula') IS NULL
    ALTER TABLE dbo.Matriculas_AFM ADD DataMatricula DATE NULL;
GO
IF COL_LENGTH(N'dbo.Matriculas_AFM', N'NivelConcluido') IS NULL
    ALTER TABLE dbo.Matriculas_AFM ADD NivelConcluido BIT NOT NULL CONSTRAINT DF_Matriculas_AFM_NivelConcluido DEFAULT 0;
GO
IF COL_LENGTH(N'dbo.Matriculas_AFM', N'ReciclagemAprovadaEm') IS NULL
    ALTER TABLE dbo.Matriculas_AFM ADD ReciclagemAprovadaEm DATE NULL;
GO
-- A rematrícula recomeça a contagem: só contam as Sessões Magnas criadas DEPOIS dela (a de maior id no momento do ato). Pela ordem das reuniões e não pela data: no mesmo dia
-- da rematrícula, as Magnas antigas não voltam a contar.
IF COL_LENGTH(N'dbo.Matriculas_AFM', N'ContagemAposSessaoId') IS NULL
    ALTER TABLE dbo.Matriculas_AFM ADD ContagemAposSessaoId INT NULL;
GO
IF COL_LENGTH(N'dbo.Matriculas_AFM', N'Observacao') IS NULL
    ALTER TABLE dbo.Matriculas_AFM ADD Observacao NVARCHAR(300) NULL;
GO
IF COL_LENGTH(N'dbo.Matriculas_AFM', N'CriadoPor') IS NULL
    ALTER TABLE dbo.Matriculas_AFM ADD CriadoPor INT NULL;
GO
IF COL_LENGTH(N'dbo.Matriculas_AFM', N'CriadoEm') IS NULL
    ALTER TABLE dbo.Matriculas_AFM ADD CriadoEm DATETIME2 NOT NULL CONSTRAINT DF_Matriculas_AFM_CriadoEm DEFAULT SYSUTCDATETIME();
GO
-- NivelAtual (o cargo na época, texto antigo do esquema inicial) deixa de ser obrigatório: o cargo de verdade é MembroReferencia.CargoMinisterial.
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Matriculas_AFM') AND name = N'NivelAtual' AND is_nullable = 0)
    ALTER TABLE dbo.Matriculas_AFM ALTER COLUMN NivelAtual NVARCHAR(30) NULL;
GO
UPDATE dbo.Matriculas_AFM SET Origem = N'AUTOMATICA' WHERE Origem IS NULL AND MatriculaId = (SELECT MIN(a2.MatriculaId) FROM dbo.Matriculas_AFM a2 WHERE a2.MembroId = dbo.Matriculas_AFM.MembroId);
-- linhas antigas além da primeira (do esquema inicial, sem uso): "LEGADO", sem inventar aprovação em reciclagem que não houve
UPDATE dbo.Matriculas_AFM SET Origem = N'LEGADO', Observacao = ISNULL(Observacao, N'Linha anterior à v8.1 (sem origem registrada).') WHERE Origem IS NULL;
UPDATE dbo.Matriculas_AFM SET StatusMatricula = N'ATIVA' WHERE StatusMatricula IS NULL OR StatusMatricula NOT IN (N'ATIVA', N'INATIVA');
UPDATE dbo.Matriculas_AFM SET NivelEscolaridade = NULL WHERE NivelEscolaridade IS NOT NULL AND NivelEscolaridade NOT IN (N'BASICO', N'MEDIO', N'AVANCADO', N'BACHAREL');
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Matriculas_AFM_Origem')
    ALTER TABLE dbo.Matriculas_AFM ADD CONSTRAINT CK_Matriculas_AFM_Origem CHECK (Origem IS NOT NULL AND Origem IN (N'AUTOMATICA', N'REMATRICULA', N'LEGADO'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Matriculas_AFM_Status')
    ALTER TABLE dbo.Matriculas_AFM ADD CONSTRAINT CK_Matriculas_AFM_Status CHECK (StatusMatricula IS NOT NULL AND StatusMatricula IN (N'ATIVA', N'INATIVA'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Matriculas_AFM_Nivel')
    ALTER TABLE dbo.Matriculas_AFM ADD CONSTRAINT CK_Matriculas_AFM_Nivel CHECK (NivelEscolaridade IS NULL OR NivelEscolaridade IN (N'BASICO', N'MEDIO', N'AVANCADO', N'BACHAREL'));
GO
-- A rematrícula só existe com a aprovação na reciclagem (Art. 69 §3º).
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Matriculas_AFM_Reciclagem')
    ALTER TABLE dbo.Matriculas_AFM ADD CONSTRAINT CK_Matriculas_AFM_Reciclagem CHECK (Origem <> N'REMATRICULA' OR (ReciclagemAprovadaEm IS NOT NULL AND ContagemAposSessaoId IS NOT NULL));
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Matriculas_AFM_Automatica' AND object_id = OBJECT_ID(N'dbo.Matriculas_AFM'))
    CREATE UNIQUE INDEX UX_Matriculas_AFM_Automatica ON dbo.Matriculas_AFM (MembroId) WHERE Origem = N'AUTOMATICA';
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Matriculas_AFM_Membro' AND object_id = OBJECT_ID(N'dbo.Matriculas_AFM'))
    CREATE INDEX IX_Matriculas_AFM_Membro ON dbo.Matriculas_AFM (MembroId, MatriculaId DESC) INCLUDE (StatusMatricula, NivelEscolaridade, NivelConcluido, Origem, DataMatricula);
GO
-- Todo oficial atual é matriculado (Art. 66 §2º). Quem virar oficial depois é matriculado pelo próprio sistema (shared/afmDb.js, garantirMatriculas).
INSERT INTO dbo.Matriculas_AFM (MembroId, NivelAtual, StatusMatricula, Origem, DataMatricula)
SELECT m.MembroId, m.CargoMinisterial, N'ATIVA', N'AUTOMATICA', CAST(SYSUTCDATETIME() AS DATE)
FROM dbo.MembroReferencia m
WHERE m.Status = N'ATIVO'
  AND m.CargoMinisterial IN (N'AUXILIAR', N'MISSIONARIO', N'DIACONO', N'PRESBITERO', N'EVANGELISTA', N'PASTOR')
  AND NOT EXISTS (SELECT 1 FROM dbo.Matriculas_AFM a WHERE a.MembroId = m.MembroId);
GO

-- ---- 4) Desmatrícula ----
IF OBJECT_ID(N'dbo.AFMDesmatriculas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AFMDesmatriculas (
        DesmatriculaId     INT IDENTITY PRIMARY KEY,
        MatriculaId        INT NOT NULL CONSTRAINT FK_AFMDesmatriculas_Matricula REFERENCES dbo.Matriculas_AFM(MatriculaId),
        MembroId           INT NOT NULL CONSTRAINT FK_AFMDesmatriculas_Membro REFERENCES dbo.MembroReferencia(MembroId),
        Motivo             NVARCHAR(12) NOT NULL CONSTRAINT CK_AFMDesmatriculas_Motivo CHECK (Motivo IS NOT NULL AND Motivo IN (N'FALTAS', N'REPROVACAO')),
        DataDesmatricula   DATE NOT NULL,
        SessoesGatilho     NVARCHAR(60) NULL,          -- FALTAS: as 3 Sessões Magnas (ids), na ordem
        Detalhe            NVARCHAR(500) NULL,         -- REPROVACAO: qual avaliação
        RegistradoPor      INT NULL,                   -- nulo = apurado pelo sistema
        RegistradoEm       DATETIME2 NOT NULL CONSTRAINT DF_AFMDesmatriculas_Em DEFAULT SYSUTCDATETIME(),
        AnuladaEm          DATETIME2 NULL,
        AnuladaPor         INT NULL,                   -- nulo = anulada pelo sistema (justificativa aceita depois)
        MotivoAnulacao     NVARCHAR(300) NULL,
        CONSTRAINT CK_AFMDesmatriculas_Gatilho CHECK (Motivo <> N'FALTAS' OR SessoesGatilho IS NOT NULL),
        CONSTRAINT CK_AFMDesmatriculas_Reprovacao CHECK (Motivo <> N'REPROVACAO' OR (Detalhe IS NOT NULL AND RegistradoPor IS NOT NULL)),
        CONSTRAINT CK_AFMDesmatriculas_Anulacao CHECK ((AnuladaEm IS NULL AND MotivoAnulacao IS NULL) OR (AnuladaEm IS NOT NULL AND MotivoAnulacao IS NOT NULL))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_AFMDesmatriculas_Vigente' AND object_id = OBJECT_ID(N'dbo.AFMDesmatriculas'))
    CREATE UNIQUE INDEX UX_AFMDesmatriculas_Vigente ON dbo.AFMDesmatriculas (MatriculaId) WHERE AnuladaEm IS NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AFMDesmatriculas_Membro' AND object_id = OBJECT_ID(N'dbo.AFMDesmatriculas'))
    CREATE INDEX IX_AFMDesmatriculas_Membro ON dbo.AFMDesmatriculas (MembroId, DesmatriculaId DESC);
GO
-- Não se apaga e só se mexe para ANULAR uma vez (nada mais muda).
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_AFMDesmatriculas_Protegida ON dbo.AFMDesmatriculas AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) AND EXISTS (SELECT 1 FROM deleted)
    BEGIN
        RAISERROR(N''A desmatrícula não se apaga: anule-a, com o motivo.'', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.DesmatriculaId = i.DesmatriculaId
               WHERE d.AnuladaEm IS NOT NULL
                  OR i.MatriculaId <> d.MatriculaId OR i.MembroId <> d.MembroId OR i.Motivo <> d.Motivo OR i.DataDesmatricula <> d.DataDesmatricula
                  OR ISNULL(i.SessoesGatilho, N'''') <> ISNULL(d.SessoesGatilho, N'''') OR ISNULL(i.Detalhe, N'''') <> ISNULL(d.Detalhe, N'''')
                  OR ISNULL(i.RegistradoPor, -1) <> ISNULL(d.RegistradoPor, -1) OR i.RegistradoEm <> d.RegistradoEm)
    BEGIN
        RAISERROR(N''A desmatrícula só muda para ser anulada, uma vez.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 5) Exclusão da CLI por faltas ----
IF OBJECT_ID(N'dbo.CLIExclusoesFaltas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CLIExclusoesFaltas (
        ExclusaoId         INT IDENTITY PRIMARY KEY,
        MembroId           INT NOT NULL CONSTRAINT FK_CLIExclusoesFaltas_Membro REFERENCES dbo.MembroReferencia(MembroId),
        DataExclusao       DATE NOT NULL,              -- a data da 3ª reunião
        SessoesGatilho     NVARCHAR(60) NOT NULL,      -- as 3 reuniões (ids), na ordem
        ComoEntrava        NVARCHAR(4000) NULL,        -- retrato, em JSON, dos caminhos pelos quais a pessoa compunha a CLI no dia da apuração
        RegistradoEm       DATETIME2 NOT NULL CONSTRAINT DF_CLIExclusoesFaltas_Em DEFAULT SYSUTCDATETIME(),
        ComunicadaCLIEm    DATE NULL,                  -- Estatuto Art. 27 §2º: a Secretaria Geral comunica à CLI
        ComunicadaPor      INT NULL,
        ReadmitidaEm       DATE NULL,                  -- Regimento Art. 149 §1º
        ReadmissaoAto      NVARCHAR(300) NULL,
        ReadmitidaPor      INT NULL,
        ContagemAposSessaoId INT NULL,                 -- a readmissão recomeça a contagem: só contam as reuniões criadas DEPOIS dela (a de maior id no momento do ato)
        AnuladaEm          DATETIME2 NULL,
        AnuladaPor         INT NULL,                   -- nulo = anulada pelo sistema (justificativa aceita depois)
        MotivoAnulacao     NVARCHAR(300) NULL,
        CONSTRAINT CK_CLIExclusoesFaltas_Readmissao CHECK ((ReadmitidaEm IS NULL AND ReadmissaoAto IS NULL AND ReadmitidaPor IS NULL AND ContagemAposSessaoId IS NULL)
                                                         OR (ReadmitidaEm IS NOT NULL AND ReadmissaoAto IS NOT NULL AND ReadmitidaPor IS NOT NULL AND ContagemAposSessaoId IS NOT NULL)),
        CONSTRAINT CK_CLIExclusoesFaltas_Comunicada CHECK ((ComunicadaCLIEm IS NULL AND ComunicadaPor IS NULL) OR (ComunicadaCLIEm IS NOT NULL AND ComunicadaPor IS NOT NULL)),
        CONSTRAINT CK_CLIExclusoesFaltas_Anulacao CHECK ((AnuladaEm IS NULL AND MotivoAnulacao IS NULL) OR (AnuladaEm IS NOT NULL AND MotivoAnulacao IS NOT NULL)),
        CONSTRAINT CK_CLIExclusoesFaltas_UmFim CHECK (ReadmitidaEm IS NULL OR AnuladaEm IS NULL),
        CONSTRAINT CK_CLIExclusoesFaltas_Datas CHECK (ReadmitidaEm IS NULL OR ReadmitidaEm >= DataExclusao)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CLIExclusoesFaltas_Vigente' AND object_id = OBJECT_ID(N'dbo.CLIExclusoesFaltas'))
    CREATE UNIQUE INDEX UX_CLIExclusoesFaltas_Vigente ON dbo.CLIExclusoesFaltas (MembroId) WHERE ReadmitidaEm IS NULL AND AnuladaEm IS NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CLIExclusoesFaltas_Membro' AND object_id = OBJECT_ID(N'dbo.CLIExclusoesFaltas'))
    CREATE INDEX IX_CLIExclusoesFaltas_Membro ON dbo.CLIExclusoesFaltas (MembroId, ExclusaoId DESC);
GO
-- Não se apaga; cada passo (comunicar, readmitir, anular) só é escrito uma vez e o fato apurado nunca muda.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_CLIExclusoesFaltas_Protegida ON dbo.CLIExclusoesFaltas AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) AND EXISTS (SELECT 1 FROM deleted)
    BEGIN
        RAISERROR(N''A exclusão por faltas não se apaga: anule-a ou registre a readmissão.'', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.ExclusaoId = i.ExclusaoId
               WHERE i.MembroId <> d.MembroId OR i.DataExclusao <> d.DataExclusao OR i.SessoesGatilho <> d.SessoesGatilho
                  OR ISNULL(i.ComoEntrava, N'''') <> ISNULL(d.ComoEntrava, N'''') OR i.RegistradoEm <> d.RegistradoEm
                  OR (d.ComunicadaCLIEm IS NOT NULL AND (i.ComunicadaCLIEm IS NULL OR i.ComunicadaCLIEm <> d.ComunicadaCLIEm OR i.ComunicadaPor <> d.ComunicadaPor))
                  OR (d.ReadmitidaEm IS NOT NULL AND (i.ReadmitidaEm IS NULL OR i.ReadmitidaEm <> d.ReadmitidaEm OR i.ReadmissaoAto <> d.ReadmissaoAto OR i.ReadmitidaPor <> d.ReadmitidaPor
                                                      OR i.ContagemAposSessaoId <> d.ContagemAposSessaoId))
                  OR (d.AnuladaEm IS NOT NULL AND (i.AnuladaEm IS NULL OR i.AnuladaEm <> d.AnuladaEm OR i.MotivoAnulacao <> d.MotivoAnulacao OR ISNULL(i.AnuladaPor, -1) <> ISNULL(d.AnuladaPor, -1))))
    BEGIN
        RAISERROR(N''A exclusão por faltas só recebe cada passo uma vez (comunicação, readmissão ou anulação); o fato apurado não muda.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 6) Reitor e corpo docente ----
IF OBJECT_ID(N'dbo.AFMCorpoDocente', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AFMCorpoDocente (
        CorpoDocenteId     INT IDENTITY PRIMARY KEY,
        MembroId           INT NOT NULL CONSTRAINT FK_AFMCorpoDocente_Membro REFERENCES dbo.MembroReferencia(MembroId),
        Papel              NVARCHAR(8) NOT NULL CONSTRAINT CK_AFMCorpoDocente_Papel CHECK (Papel IS NOT NULL AND Papel IN (N'REITOR', N'DOCENTE')),
        Titulacao          NVARCHAR(150) NULL,
        DataInicio         DATE NOT NULL,
        MandatoAte         DATE NULL,                  -- Reitor: 31/12 do ano (Art. 68 §1º)
        HomologadoCLIEm    DATE NULL,                  -- Reitor: homologação técnica da CLI
        HomologacaoAto     NVARCHAR(300) NULL,
        DataFim            DATE NULL,
        MotivoFim          NVARCHAR(200) NULL,
        CriadoPor          INT NULL,
        CriadoEm           DATETIME2 NOT NULL CONSTRAINT DF_AFMCorpoDocente_Em DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_AFMCorpoDocente_Mandato CHECK (Papel <> N'REITOR' OR MandatoAte IS NOT NULL),
        CONSTRAINT CK_AFMCorpoDocente_Homologacao CHECK ((HomologadoCLIEm IS NULL AND HomologacaoAto IS NULL) OR (HomologadoCLIEm IS NOT NULL AND HomologacaoAto IS NOT NULL)),
        CONSTRAINT CK_AFMCorpoDocente_Fim CHECK ((DataFim IS NULL AND MotivoFim IS NULL) OR (DataFim IS NOT NULL AND MotivoFim IS NOT NULL)),
        CONSTRAINT CK_AFMCorpoDocente_Datas CHECK ((DataFim IS NULL OR DataFim >= DataInicio) AND (MandatoAte IS NULL OR MandatoAte >= DataInicio))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_AFMCorpoDocente_UmReitor' AND object_id = OBJECT_ID(N'dbo.AFMCorpoDocente'))
    CREATE UNIQUE INDEX UX_AFMCorpoDocente_UmReitor ON dbo.AFMCorpoDocente (Papel) WHERE Papel = N'REITOR' AND DataFim IS NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_AFMCorpoDocente_Ativo' AND object_id = OBJECT_ID(N'dbo.AFMCorpoDocente'))
    CREATE UNIQUE INDEX UX_AFMCorpoDocente_Ativo ON dbo.AFMCorpoDocente (MembroId, Papel) WHERE DataFim IS NULL;
GO

-- ---- 7) CDER: a titulação dos 2 mestres de teologia ----
IF COL_LENGTH(N'dbo.ComissaoMembros', N'Qualificacao') IS NULL
    ALTER TABLE dbo.ComissaoMembros ADD Qualificacao NVARCHAR(150) NULL;
GO

-- ---- 8) Permissão, avisos e retenção ----
IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'afm')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('afm', N'Academia (AFM) — matrículas, Reitor, docentes e Sessões Magnas');
GO
UPDATE dbo.Papeis
SET Permissoes = CASE WHEN ISNULL(Permissoes, '') = '' THEN 'afm' ELSE Permissoes + ',afm' END
WHERE Nome IN (N'Presidente', N'Secretário Geral') AND (',' + ISNULL(Permissoes, '') + ',') NOT LIKE '%,afm,%';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = N'Reitor da AFM')
    INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes) VALUES (N'Reitor da AFM', 'GLOBAL', 'afm');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CLI_FALTAS_ALERTA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'CLI_FALTAS_ALERTA', N'CLI: você está com 2 faltas seguidas — mais uma e perde a cadeira', N'REUNIOES', NULL, NULL, 1, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CLI_EXCLUSAO_FALTAS')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'CLI_EXCLUSAO_FALTAS', N'CLI: exclusão por 3 faltas seguidas', N'REUNIOES', NULL, NULL, 1, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'AFM_FALTAS_ALERTA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'AFM_FALTAS_ALERTA', N'AFM: você está com 2 Sessões Magnas seguidas sem justificativa — mais uma e a matrícula fica inativa', N'REUNIOES', NULL, NULL, 1, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'AFM_DESMATRICULA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'AFM_DESMATRICULA', N'AFM: matrícula inativa — obreiro sem licença para oficiar', N'REUNIOES', NULL, NULL, 1, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'AFM_REITORIA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'AFM_REITORIA', N'AFM: a Reitoria precisa de providência (mandato vencendo, vencido ou sem homologação da CLI)', N'REUNIOES', N'afm', NULL, 1, 0, 0);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'AFM — matrículas, desmatrículas e corpo docente')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (N'AFM — matrículas, desmatrículas e corpo docente', N'LGPD art. 7º, II e IX e art. 11, II, d: histórico de habilitação ministerial exigido pelo Regimento (Art. 66 a 72); a exclusão LGPD anonimiza o cadastro e o histórico fica sem identificação.', 3650);
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'CLI — detalhe da justificativa de falta')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (N'CLI — detalhe da justificativa de falta', N'LGPD art. 6º, III e art. 11: o texto escrito pode citar saúde; sai 2 anos depois da reunião (o código do catálogo fica, porque sustenta a contagem das faltas).', 730);
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'CLI — exclusões por faltas')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (N'CLI — exclusões por faltas', N'LGPD art. 7º, II e IX: registro de ato de governança exigido pelo Estatuto (Art. 27) e pelo Regimento (Art. 149); a exclusão LGPD anonimiza o cadastro e o registro fica sem identificação.', 3650);
GO
