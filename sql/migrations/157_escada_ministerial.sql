-- ============================================================
-- Migração 157 — v8.2: Escada ministerial e ascensão.
--
-- Base legal: Regimento Art. 66 §§3º–5º, 67, 71 a 74 e 131 §4º, II; Estatuto Art. 23. Desenho em docs/plano/fase-8-ministerial-afm.md.
--
--   1) MembroReferencia.Sexo (M/F): Missionária é a patente máxima para obreiras (Art. 71, III). Sem o dado, ninguém sobe acima de Missionário(a).
--   2) CargosMinisteriaisHistorico: de quando a quando cada pessoa ocupou cada cargo e por onde chegou — é daqui que sai o interstício (Art. 72). Uma linha aberta por
--      pessoa. Quem já tem cargo ganha a linha aberta agora, com a data da consagração concluída quando ela existe; sem ela, a data fica em branco (a Secretaria informa).
--   3) Consagracoes: o cargo de destino (retrato do tipo no protocolo), a modalidade (indicação, nomeação direta do Pastor Presidente — Art. 66 §4º —, ministro de outra
--      convenção — Art. 71), a referência do ato ou a convenção de origem, o retrato dos requisitos conferidos e o veto técnico da AFM (Art. 66 §3º, 67 §2º). Um processo
--      em andamento por pessoa com cargo de destino.
--   4) Matriculas_AFM: a data e quem concedeu o CHM (Art. 67; o campo CertificadoHabilitacao já existia) e a origem 'CANDIDATO' (o membro que vai a Auxiliar precisa estar
--      cursando o Básico — Art. 72, I, b).
--   5) Os tipos de consagração que faltavam na escada (Auxiliar, Missionário(a), Pastor), com o cargo resultante.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

-- ---- 1) Sexo ----
IF COL_LENGTH(N'dbo.MembroReferencia', N'Sexo') IS NULL
    ALTER TABLE dbo.MembroReferencia ADD Sexo NCHAR(1) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_MembroReferencia_Sexo')
    ALTER TABLE dbo.MembroReferencia ADD CONSTRAINT CK_MembroReferencia_Sexo CHECK (Sexo IS NULL OR Sexo IN (N'M', N'F'));
GO

-- ---- 2) Histórico de cargos ----
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.CargosMinisteriaisHistorico') AND type = N'U')
BEGIN
    CREATE TABLE dbo.CargosMinisteriaisHistorico (
        HistoricoId     INT IDENTITY PRIMARY KEY,
        MembroId        INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Cargo           NVARCHAR(30) NOT NULL,
        Desde           DATE NULL,            -- em branco = a data de entrada no cargo não é conhecida (linha herdada de antes da v8.2)
        Ate             DATE NULL,            -- em branco = é o cargo atual
        Origem          NVARCHAR(24) NOT NULL,
        ConsagracaoId   UNIQUEIDENTIFIER NULL REFERENCES dbo.Consagracoes(ConsagracaoId),
        Observacao      NVARCHAR(300) NULL,
        CriadoPor       INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm        DATETIME2 NOT NULL CONSTRAINT DF_CargosHist_CriadoEm DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_CargosHist_Origem CHECK (Origem IS NOT NULL AND Origem IN (N'CONSAGRACAO', N'NOMEACAO_PRESIDENCIAL', N'OUTRA_CONVENCAO', N'CADASTRO', N'LEGADO')),
        CONSTRAINT CK_CargosHist_Periodo CHECK (Ate IS NULL OR Desde IS NULL OR Ate >= Desde)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CargosHist_Aberto' AND object_id = OBJECT_ID(N'dbo.CargosMinisteriaisHistorico'))
    CREATE UNIQUE INDEX UX_CargosHist_Aberto ON dbo.CargosMinisteriaisHistorico (MembroId) WHERE Ate IS NULL;
GO
-- Quem já tem cargo de oficial ganha a linha aberta, com a data da consagração concluída a esse cargo quando ela existe.
INSERT INTO dbo.CargosMinisteriaisHistorico (MembroId, Cargo, Desde, Origem, Observacao)
SELECT m.MembroId, m.CargoMinisterial,
       (SELECT MAX(c.DataConclusao) FROM dbo.Consagracoes c JOIN dbo.TiposConsagracao t ON t.Nome = c.Assunto
        WHERE c.MembroId = m.MembroId AND c.Status = N'CONCLUIDO' AND t.CargoMinisterialResultante = m.CargoMinisterial),
       N'LEGADO', N'Cargo que a pessoa já tinha quando a v8.2 entrou no ar.'
FROM dbo.MembroReferencia m
WHERE m.CargoMinisterial IN (N'AUXILIAR', N'MISSIONARIO', N'DIACONO', N'PRESBITERO', N'EVANGELISTA', N'PASTOR')
  AND NOT EXISTS (SELECT 1 FROM dbo.CargosMinisteriaisHistorico h WHERE h.MembroId = m.MembroId AND h.Ate IS NULL);
GO

-- ---- 3) Consagrações: destino, modalidade, requisitos e veto ----
IF COL_LENGTH(N'dbo.Consagracoes', N'CargoAlvo') IS NULL
    ALTER TABLE dbo.Consagracoes ADD CargoAlvo NVARCHAR(30) NULL;
GO
IF COL_LENGTH(N'dbo.Consagracoes', N'Modalidade') IS NULL
    ALTER TABLE dbo.Consagracoes ADD Modalidade NVARCHAR(24) NOT NULL CONSTRAINT DF_Consagracoes_Modalidade DEFAULT N'INDICACAO';
GO
IF COL_LENGTH(N'dbo.Consagracoes', N'AtoReferencia') IS NULL
    ALTER TABLE dbo.Consagracoes ADD AtoReferencia NVARCHAR(200) NULL;   -- nomeação do Presidente: o ato; outra convenção: a igreja/convenção de origem
GO
IF COL_LENGTH(N'dbo.Consagracoes', N'RequisitosRetrato') IS NULL
    ALTER TABLE dbo.Consagracoes ADD RequisitosRetrato NVARCHAR(4000) NULL;
GO
IF COL_LENGTH(N'dbo.Consagracoes', N'VetoAFMEm') IS NULL
    ALTER TABLE dbo.Consagracoes ADD VetoAFMEm DATETIME2 NULL, VetoAFMPor INT NULL REFERENCES dbo.MembroReferencia(MembroId), VetoAFMMotivo NVARCHAR(500) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Consagracoes_Modalidade')
    ALTER TABLE dbo.Consagracoes ADD CONSTRAINT CK_Consagracoes_Modalidade CHECK (
        Modalidade IS NOT NULL AND Modalidade IN (N'INDICACAO', N'NOMEACAO_PRESIDENCIAL', N'OUTRA_CONVENCAO')
        AND (Modalidade = N'INDICACAO' OR LEN(LTRIM(RTRIM(ISNULL(AtoReferencia, N'')))) > 0));
GO
-- O veto é da AFM sobre uma INDICAÇÃO (Art. 66 §4º: não alcança a nomeação direta do Presidente) e encerra o processo.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Consagracoes_Veto')
    ALTER TABLE dbo.Consagracoes ADD CONSTRAINT CK_Consagracoes_Veto CHECK (
        VetoAFMEm IS NULL OR (Modalidade = N'INDICACAO' AND Status = N'REPROVADO' AND VetoAFMPor IS NOT NULL AND LEN(LTRIM(RTRIM(ISNULL(VetoAFMMotivo, N'')))) > 0));
GO
-- Um processo em andamento por pessoa quando há cargo de destino (dois processos ao mesmo tempo dariam dois cargos).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Consagracoes_EmAndamento' AND object_id = OBJECT_ID(N'dbo.Consagracoes'))
    CREATE UNIQUE INDEX UX_Consagracoes_EmAndamento ON dbo.Consagracoes (MembroId)
    WHERE CargoAlvo IS NOT NULL AND Status IN (N'PROTOCOLADO', N'EM_ANALISE_CONSELHO', N'AGUARDANDO_PLENARIO');
GO

-- ---- 4) AFM: CHM e candidatos ----
IF COL_LENGTH(N'dbo.Matriculas_AFM', N'CHMEm') IS NULL
    ALTER TABLE dbo.Matriculas_AFM ADD CHMEm DATE NULL, CHMPor INT NULL REFERENCES dbo.MembroReferencia(MembroId);
GO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Matriculas_AFM_Origem'
           AND definition NOT LIKE N'%CANDIDATO%')
    ALTER TABLE dbo.Matriculas_AFM DROP CONSTRAINT CK_Matriculas_AFM_Origem;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Matriculas_AFM_Origem')
    ALTER TABLE dbo.Matriculas_AFM ADD CONSTRAINT CK_Matriculas_AFM_Origem CHECK (Origem IS NOT NULL AND Origem IN (N'AUTOMATICA', N'REMATRICULA', N'LEGADO', N'CANDIDATO'));
GO

-- ---- 5) Os tipos que faltavam na escada ----
INSERT INTO dbo.TiposConsagracao (Nome, CargoMinisterialResultante)
SELECT v.Nome, v.Cargo FROM (VALUES
    (N'Consagração a Auxiliar', N'AUXILIAR'),
    (N'Consagração a Missionário(a)', N'MISSIONARIO'),
    (N'Consagração a Pastor', N'PASTOR')
) AS v(Nome, Cargo)
WHERE NOT EXISTS (SELECT 1 FROM dbo.TiposConsagracao t WHERE t.Nome = v.Nome);
GO
