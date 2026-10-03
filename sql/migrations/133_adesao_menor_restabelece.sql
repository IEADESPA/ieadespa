-- ============================================================
-- Migração 133 — Termo do menor: a adesão do responsável só VALE com responsável ativo; nova adesão a restabelece (fecho dos itens em aberto, 03/10/2026)
--
-- Em aberto desde a 119: "revogar o cadastro do responsável não anula a adesão já dada". Agora a adesão dada pelo responsável cadastrado (CLICK_RESP)
-- continua gravada e imutável (é prova), mas só vale enquanto o menor tem ao menos um responsável ATIVO: se, depois do aceite, o último responsável ativo
-- foi revogado, ela fica SUSPENSA em todos os cálculos (cobertura, aviso de termo pendente, Lista de Ouro, habilitação e escala). Isso é calculado na
-- LEITURA (shared/adesaoMenor.js) — esta migração não toca em nenhuma adesão.
--
-- O que a migração faz: deixa gravar a NOVA adesão que restabelece a suspensa. A regra "uma adesão por pessoa e por fase" (índice da 119) impedia uma
-- segunda adesão do responsável para o mesmo menor. A nova aponta a que ela restabelece (RestabeleceAdesaoId), e o índice passa a ser por pessoa, fase e
-- "qual ela restabelece" (ChaveRestabelece = RestabeleceAdesaoId, ou 0): continua impossível gravar duas adesões iguais ao mesmo tempo (as duas apontariam
-- a mesma suspensa), e a primeira adesão de cada fase continua única.
--
-- O índice mantém o NOME da 119 (UX_VoluntariadoAdesoes_Membro_Fase): a 119 reexecuta a cada deploy e só o cria "se não existir" — com o mesmo nome, ela
-- não tenta recriar a versão antiga (que falharia quando já houver uma adesão restabelecida). A troca é feita numa transação: ou fica o índice novo, ou o antigo.
-- O gatilho de imutabilidade (o da 119, recriado aqui depois dela) passa a proteger também RestabeleceAdesaoId.
--
-- Idempotente (reexecuta a cada deploy). Coluna nova anulável; nada é apagado nem reescrito.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.VoluntariadoAdesoes') AND name = N'RestabeleceAdesaoId')
    ALTER TABLE dbo.VoluntariadoAdesoes ADD RestabeleceAdesaoId INT NULL CONSTRAINT FK_VoluntariadoAdesoes_Restabelece REFERENCES dbo.VoluntariadoAdesoes(AdesaoId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.VoluntariadoAdesoes') AND name = N'ChaveRestabelece')
    ALTER TABLE dbo.VoluntariadoAdesoes ADD ChaveRestabelece AS (ISNULL(RestabeleceAdesaoId, 0)) PERSISTED;
GO

-- Troca do índice, numa transação: qualquer erro desfaz o DROP também (fica o índice antigo, e a nova adesão de restabelecimento é recusada como
-- "já tem adesão" até a próxima execução). O erro vira AVISO, não derruba o deploy. Só age se o índice ainda não tem ChaveRestabelece.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE i.object_id = OBJECT_ID(N'dbo.VoluntariadoAdesoes') AND i.name = N'UX_VoluntariadoAdesoes_Membro_Fase' AND c.name = N'ChaveRestabelece')
BEGIN
    BEGIN TRY
        BEGIN TRANSACTION;
        IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.VoluntariadoAdesoes') AND name = N'UX_VoluntariadoAdesoes_Membro_Fase')
            DROP INDEX UX_VoluntariadoAdesoes_Membro_Fase ON dbo.VoluntariadoAdesoes;
        CREATE UNIQUE INDEX UX_VoluntariadoAdesoes_Membro_Fase ON dbo.VoluntariadoAdesoes (MembroId, FaseAdesao, ChaveRestabelece);
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        PRINT N'Migração 133: não foi possível trocar o índice UX_VoluntariadoAdesoes_Membro_Fase (fica o anterior; tenta de novo no próximo deploy): ' + ERROR_MESSAGE();
    END CATCH
END
GO

-- O gatilho da 119, mais RestabeleceAdesaoId (a prova não se apaga nem se altera; a ÚNICA exceção continua sendo anonimizar o IP depois do prazo).
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
           OR ISNULL(i.RestabeleceAdesaoId, -1) <> ISNULL(d.RestabeleceAdesaoId, -1)
           OR (ISNULL(i.EnderecoIp, N'''') <> ISNULL(d.EnderecoIp, N'''') AND NOT (i.EnderecoIp = N''anonimizado'' AND d.EnderecoIp IS NOT NULL))
           OR (ISNULL(i.CadeiaCabecalhos, N'''') <> ISNULL(d.CadeiaCabecalhos, N'''') AND i.CadeiaCabecalhos IS NOT NULL))
    BEGIN
        RAISERROR(N''A adesão ao Termo de Voluntariado é prova documental: não se apaga e só admite a anonimização do IP depois do prazo de retenção (Lei 9.608/98, art. 2º; Regimento Art. 133 §8º; LGPD art. 16).'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- A adesão que restabelece só pode apontar uma adesão do MESMO membro (e nunca a si mesma).
IF OBJECT_ID(N'dbo.TR_VoluntariadoAdesoes_Restabelece', N'TR') IS NULL
    EXEC(N'CREATE TRIGGER dbo.TR_VoluntariadoAdesoes_Restabelece ON dbo.VoluntariadoAdesoes AFTER INSERT AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM inserted i LEFT JOIN dbo.VoluntariadoAdesoes o ON o.AdesaoId = i.RestabeleceAdesaoId
               WHERE i.RestabeleceAdesaoId IS NOT NULL AND (o.AdesaoId IS NULL OR o.MembroId <> i.MembroId OR o.AdesaoId = i.AdesaoId))
    BEGIN
        RAISERROR(N''A nova adesão só restabelece uma adesão anterior da mesma pessoa.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO
