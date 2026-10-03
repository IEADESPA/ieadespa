-- ============================================================
-- Migração 119 — Termo do menor aceito pelo responsável legal (fecho da v7.5)
--
-- Menor de 18 anos não adere sozinho (Código Civil, arts. 3º e 4º). A adesão dele é dada pelo RESPONSÁVEL LEGAL:
--   * a Secretaria cadastra quem é o responsável (pai, mãe, tutor...) depois de conferir o documento     -> VoluntariadoResponsaveis
--   * o responsável entra com a própria matrícula + PIN, lê a "Autorização do Responsável" e marca a caixa  -> adesão de forma CLICK_RESP
--     (com a matrícula do responsável, o IP, a data e a hora dele, e a versão e o hash do texto)
-- A adesão dada pelo responsável vale enquanto a pessoa é menor. Ao completar 18 anos ela precisa dar a própria: por isso a regra "uma adesão por pessoa"
-- vira "uma adesão por pessoa e por FASE" (a do responsável e a dela mesma), e a mais recente é a que vale.
--
-- Idempotente: seguro para reexecutar sem apagar dados. Cada DDL em batch próprio (GO); gatilhos por EXEC.
-- ============================================================

-- ---- 1) Quem é o responsável legal de cada menor (cadastrado e conferido pela Secretaria) ----

IF OBJECT_ID(N'dbo.VoluntariadoResponsaveis', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.VoluntariadoResponsaveis (
        ResponsavelId          INT IDENTITY PRIMARY KEY,
        MenorMembroId          INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ResponsavelMembroId    INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Vinculo                NVARCHAR(18) NOT NULL CONSTRAINT CK_VolResp_Vinculo CHECK (Vinculo IN ('PAI','MAE','TUTOR','RESPONSAVEL_LEGAL')),
        Documento              NVARCHAR(200) NOT NULL,                 -- o que a Secretaria conferiu: certidão de nascimento, RG, termo de tutela...
        RegistradoPorMembroId  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm           DATETIME2 NOT NULL CONSTRAINT DF_VolResp_Em DEFAULT SYSUTCDATETIME(),
        RevogadoEm             DATETIME2 NULL,
        RevogadoPorMembroId    INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CONSTRAINT CK_VolResp_Pessoas CHECK (MenorMembroId <> ResponsavelMembroId),
        CONSTRAINT CK_VolResp_Revogacao CHECK ((RevogadoEm IS NULL AND RevogadoPorMembroId IS NULL) OR (RevogadoEm IS NOT NULL AND RevogadoPorMembroId IS NOT NULL))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_VolResp_Ativo' AND object_id = OBJECT_ID(N'dbo.VoluntariadoResponsaveis'))
    CREATE UNIQUE INDEX UX_VolResp_Ativo ON dbo.VoluntariadoResponsaveis (MenorMembroId, ResponsavelMembroId) WHERE RevogadoEm IS NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_VolResp_Responsavel' AND object_id = OBJECT_ID(N'dbo.VoluntariadoResponsaveis'))
    CREATE INDEX IX_VolResp_Responsavel ON dbo.VoluntariadoResponsaveis (ResponsavelMembroId) WHERE RevogadoEm IS NULL;
GO
-- O cadastro do responsável é prova: não se apaga e a única mudança admitida é revogar (uma vez).
IF OBJECT_ID(N'dbo.TR_VoluntariadoResponsaveis_Imutavel', N'TR') IS NULL
    EXEC(N'CREATE TRIGGER dbo.TR_VoluntariadoResponsaveis_Imutavel ON dbo.VoluntariadoResponsaveis AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF (EXISTS (SELECT 1 FROM deleted) AND NOT EXISTS (SELECT 1 FROM inserted)) OR EXISTS (
        SELECT 1 FROM inserted i JOIN deleted d ON d.ResponsavelId = i.ResponsavelId
        WHERE i.MenorMembroId <> d.MenorMembroId OR i.ResponsavelMembroId <> d.ResponsavelMembroId OR i.Vinculo <> d.Vinculo OR i.Documento <> d.Documento
           OR i.RegistradoPorMembroId <> d.RegistradoPorMembroId OR i.RegistradoEm <> d.RegistradoEm
           OR (d.RevogadoEm IS NOT NULL AND (ISNULL(i.RevogadoEm, ''19000101'') <> d.RevogadoEm OR ISNULL(i.RevogadoPorMembroId, -1) <> ISNULL(d.RevogadoPorMembroId, -1))))
    BEGIN
        RAISERROR(N''O cadastro do responsável legal é prova documental: não se apaga e só admite a revogação.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 2) A adesão dada pelo responsável: nova forma e a matrícula dele ----

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.VoluntariadoAdesoes') AND name = N'ResponsavelMembroId')
    ALTER TABLE dbo.VoluntariadoAdesoes ADD ResponsavelMembroId INT NULL REFERENCES dbo.MembroReferencia(MembroId);
GO
-- Cada troca é feita em duas etapas, em batches separados: (1) remove a versão ANTIGA (a que ainda não conhece CLICK_RESP); (2) cria a nova se ela não existir. Assim,
-- se a criação falhar, a execução seguinte (o deploy roda todas as migrações) a recria, em vez de deixar a tabela sem a regra.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_VoluntariadoAdesoes_Forma' AND parent_object_id = OBJECT_ID(N'dbo.VoluntariadoAdesoes') AND definition NOT LIKE N'%CLICK_RESP%')
    ALTER TABLE dbo.VoluntariadoAdesoes DROP CONSTRAINT CK_VoluntariadoAdesoes_Forma;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_VoluntariadoAdesoes_Forma' AND parent_object_id = OBJECT_ID(N'dbo.VoluntariadoAdesoes'))
    ALTER TABLE dbo.VoluntariadoAdesoes ADD CONSTRAINT CK_VoluntariadoAdesoes_Forma CHECK (Forma IN ('CLICKWRAP','CLICK_RESP','FICHA_FISICA','MENSAGERIA','LISTA_OURO'));
GO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_VoluntariadoAdesoes_Texto' AND parent_object_id = OBJECT_ID(N'dbo.VoluntariadoAdesoes') AND definition NOT LIKE N'%CLICK_RESP%')
    ALTER TABLE dbo.VoluntariadoAdesoes DROP CONSTRAINT CK_VoluntariadoAdesoes_Texto;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_VoluntariadoAdesoes_Texto' AND parent_object_id = OBJECT_ID(N'dbo.VoluntariadoAdesoes'))
    ALTER TABLE dbo.VoluntariadoAdesoes ADD CONSTRAINT CK_VoluntariadoAdesoes_Texto CHECK (Forma NOT IN ('CLICKWRAP','CLICK_RESP','LISTA_OURO') OR (TermoVersao IS NOT NULL AND TermoHash IS NOT NULL));
GO
-- Aceite digital da própria pessoa (CLICKWRAP): IP e instante, sem registrador, sem responsável.
-- Aceite digital do responsável (CLICK_RESP): IP e instante, a matrícula, o nome e o vínculo do responsável, sem registrador.
-- A matrícula do responsável só existe nesta forma.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_VoluntariadoAdesoes_Click' AND parent_object_id = OBJECT_ID(N'dbo.VoluntariadoAdesoes') AND definition NOT LIKE N'%CLICK_RESP%')
    ALTER TABLE dbo.VoluntariadoAdesoes DROP CONSTRAINT CK_VoluntariadoAdesoes_Click;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_VoluntariadoAdesoes_Click' AND parent_object_id = OBJECT_ID(N'dbo.VoluntariadoAdesoes'))
    ALTER TABLE dbo.VoluntariadoAdesoes ADD CONSTRAINT CK_VoluntariadoAdesoes_Click CHECK (
        (Forma <> 'CLICKWRAP' OR (AceitoEm IS NOT NULL AND EnderecoIp IS NOT NULL AND RegistradoPorMembroId IS NULL AND ResponsavelNome IS NULL))
        AND (Forma <> 'CLICK_RESP' OR (AceitoEm IS NOT NULL AND EnderecoIp IS NOT NULL AND RegistradoPorMembroId IS NULL
                                       AND ResponsavelMembroId IS NOT NULL AND ResponsavelNome IS NOT NULL AND ResponsavelVinculo IS NOT NULL))
        AND (ResponsavelMembroId IS NULL OR Forma = 'CLICK_RESP'));
GO

-- ---- 3) Uma adesão por pessoa e por FASE: a dada pelo responsável (M) e a dada pela própria pessoa (A) ----

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.VoluntariadoAdesoes') AND name = N'FaseAdesao')
    ALTER TABLE dbo.VoluntariadoAdesoes ADD FaseAdesao AS (CASE WHEN ResponsavelNome IS NOT NULL THEN CAST(N'M' AS NCHAR(1)) ELSE CAST(N'A' AS NCHAR(1)) END) PERSISTED;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_VoluntariadoAdesoes_Membro_Fase' AND object_id = OBJECT_ID(N'dbo.VoluntariadoAdesoes'))
    CREATE UNIQUE INDEX UX_VoluntariadoAdesoes_Membro_Fase ON dbo.VoluntariadoAdesoes (MembroId, FaseAdesao);
GO
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'UQ_VoluntariadoAdesoes_Membro' AND parent_object_id = OBJECT_ID(N'dbo.VoluntariadoAdesoes'))
    ALTER TABLE dbo.VoluntariadoAdesoes DROP CONSTRAINT UQ_VoluntariadoAdesoes_Membro;
GO

-- ---- 4) O gatilho da adesão passa a proteger também a matrícula do responsável ----
-- Igual ao da migração 117 (a prova não se apaga nem se altera; a ÚNICA exceção é anonimizar o IP e apagar a cadeia depois do prazo), mais a matrícula do responsável.

EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_VoluntariadoAdesoes_Imutavel ON dbo.VoluntariadoAdesoes AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    -- DELETE = há linhas em deleted e nenhuma em inserted. (Um UPDATE que não alcança linha nenhuma também dispara o gatilho, com as duas vazias: não é violação.)
    IF (EXISTS (SELECT 1 FROM deleted) AND NOT EXISTS (SELECT 1 FROM inserted)) OR EXISTS (
        SELECT 1 FROM inserted i JOIN deleted d ON d.AdesaoId = i.AdesaoId
        WHERE i.MembroId <> d.MembroId OR i.Forma <> d.Forma
           OR ISNULL(i.TermoVersao, -1) <> ISNULL(d.TermoVersao, -1) OR ISNULL(i.TermoHash, N'''') <> ISNULL(d.TermoHash, N'''')
           OR i.DataAceite <> d.DataAceite OR ISNULL(i.AceitoEm, ''19000101'') <> ISNULL(d.AceitoEm, ''19000101'')
           OR ISNULL(i.CanalMensageria, N'''') <> ISNULL(d.CanalMensageria, N'''') OR ISNULL(i.Referencia, N'''') <> ISNULL(d.Referencia, N'''')
           OR ISNULL(i.RatificacaoId, -1) <> ISNULL(d.RatificacaoId, -1) OR i.ConvalidaPeriodoAnterior <> d.ConvalidaPeriodoAnterior
           OR ISNULL(i.RegistradoPorMembroId, -1) <> ISNULL(d.RegistradoPorMembroId, -1) OR i.RegistradoEm <> d.RegistradoEm
           OR ISNULL(i.ResponsavelNome, N'''') <> ISNULL(d.ResponsavelNome, N'''') OR ISNULL(i.ResponsavelVinculo, N'''') <> ISNULL(d.ResponsavelVinculo, N'''')
           OR ISNULL(i.ResponsavelMembroId, -1) <> ISNULL(d.ResponsavelMembroId, -1)
           OR (ISNULL(i.EnderecoIp, N'''') <> ISNULL(d.EnderecoIp, N'''') AND NOT (i.EnderecoIp = N''anonimizado'' AND d.EnderecoIp IS NOT NULL))
           OR (ISNULL(i.CadeiaCabecalhos, N'''') <> ISNULL(d.CadeiaCabecalhos, N'''') AND i.CadeiaCabecalhos IS NOT NULL))
    BEGIN
        RAISERROR(N''A adesão ao Termo de Voluntariado é prova documental: não se apaga e só admite a anonimização do IP depois do prazo de retenção (Lei 9.608/98, art. 2º; Regimento Art. 133 §8º; LGPD art. 16).'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO
