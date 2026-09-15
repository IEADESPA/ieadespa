-- ============================================================
-- Migração 086 — Esteira de Batismo (vB.11, retrofit da FASE 1)
--
-- Regimento Art. 80 cita este sistema NOMINALMENTE ("Sistema Oficial de
-- Gestão da IEADESPA") — é o único dispositivo que não só pode ser
-- atendido pelo sistema, ele EXIGE que o sistema exista (§2º, V: aceite
-- eletrônico do Estatuto/Regimento). Hoje o batismo só existe como
-- `MembroReferencia.DataBatismo` preenchida depois, sem processo nenhum
-- antes — esta migração cria esse processo.
--
-- TurmasBatismo: ato centralizado no Campo (§1º), semestral (maio/outubro,
-- §3º I), com vedação de rio/represa (§3º II-III) validada em código
-- (shared/batismo.js), não só documentada.
--
-- CandidatosBatismo: 1 linha por matrícula, reaproveitada entre ciclos
-- (reprovado não recomeça o cadastro — só volta pra fila, TurmaId zera e
-- Status volta a AGUARDANDO_TURMA). Aptidão (Art. 80 §2º) é CALCULADA na
-- leitura a partir de dado que já existe (idade, EstadoCivil+Casamentos) —
-- só o item IV (conclusão do Curso de Discipulado) fica como atestação
-- MANUAL até a v6.9 (trilha de formação como entidade real) existir de
-- verdade; documentado no próprio campo, não escondido.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.TurmasBatismo', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TurmasBatismo (
        TurmaId           INT IDENTITY PRIMARY KEY,
        DataBatismo        DATE NOT NULL,
        Local              NVARCHAR(200) NOT NULL,
        TipoLocal          NVARCHAR(30) NOT NULL,  -- TEMPLO | OUTRO_APROVADO — nunca RIO/REPRESA (Art. 80 §3º II-III, validado em código)
        AutorizacaoMesa    BIT NOT NULL DEFAULT 0,
        CongregacaoId      INT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        Status             NVARCHAR(20) NOT NULL DEFAULT 'ABERTA', -- ABERTA | REALIZADA | CANCELADA
        CriadoPor          INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm           DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.OficiantesBatismo', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.OficiantesBatismo (
        TurmaId   INT NOT NULL REFERENCES dbo.TurmasBatismo(TurmaId),
        MembroId  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CONSTRAINT PK_OficiantesBatismo PRIMARY KEY (TurmaId, MembroId)
    );
END
GO

IF OBJECT_ID(N'dbo.CandidatosBatismo', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CandidatosBatismo (
        CandidatoId                 INT IDENTITY PRIMARY KEY,
        MembroId                     INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        TurmaId                      INT NULL REFERENCES dbo.TurmasBatismo(TurmaId),
        Status                       NVARCHAR(20) NOT NULL DEFAULT 'AGUARDANDO_TURMA', -- AGUARDANDO_TURMA | APROVADO | REPROVADO | BATIZADO
        ParecerVidaPregressa          NVARCHAR(20) NULL,   -- FAVORAVEL | DESFAVORAVEL (Art. 80 §2º, III)
        ParecerObservacao             NVARCHAR(500) NULL,
        ParecerPor                    INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DiscipuladoConcluidoManual    BIT NOT NULL DEFAULT 0, -- atestação manual até a v6.9 existir (trilha de formação real)
        MotivoReprovacao              NVARCHAR(300) NULL,
        AceiteTermoAssinadoId         INT NULL REFERENCES dbo.TermosAssinados(TermoAssinadoId), -- Art. 80 §2º, V
        DataInscricao                 DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_CandidatosBatismo_Membro UNIQUE (MembroId)
    );
END
GO
