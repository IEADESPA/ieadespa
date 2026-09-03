-- ============================================================
-- Migração 019 — Perda de Membresia, parte 1 (v1.5 — Regimento Art. 11).
--
-- Cobre: causas de saída (catálogo fechado, validado em GestaoPessoas — não é
-- tabela de catálogo editável por tela, mesmo espírito de FORMAS_ADMISSAO),
-- Abandono Eclesiástico Material (90 dias, data de afastamento lançada
-- manualmente pela Secretaria) e o procedimento sumário de constatação
-- (notificação -> prazo de 15 dias -> homologação da CLI -> perda efetiva),
-- com Recurso à Assembleia (30 dias, registrado, sem efeito suspensivo).
--
-- Fora desta migração (fica para depois): Abandono Digital (falta infra de
-- registro de contato) e envio real de notificação (não há e-mail/SMS no
-- projeto — notificação/edital são só registros datados nesta tabela).
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MembroReferencia') AND name = N'DataAfastamento')
    ALTER TABLE dbo.MembroReferencia ADD DataAfastamento DATE NULL;
GO

-- A migração 016 já previa isso: "inclusão de novos status (ex.: FALECIDO na
-- v1.5/v1.6)". ATIVO/DESLIGADO continuam intocados — são os únicos hardcoded
-- no código (estatuto.js, GestaoPessoas).
IF NOT EXISTS (SELECT 1 FROM dbo.StatusMembro WHERE Sigla = N'FALECIDO')
    INSERT INTO dbo.StatusMembro (Sigla, Nome) VALUES (N'FALECIDO', N'Falecido');
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.ProcedimentosAbandono') AND type = N'U')
BEGIN
    CREATE TABLE dbo.ProcedimentosAbandono (
        ProcedimentoId    INT IDENTITY PRIMARY KEY,
        MembroId          INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Status            NVARCHAR(30) NOT NULL DEFAULT 'NOTIFICADO', -- NOTIFICADO / HOMOLOGADO / ARQUIVADO
        DataNotificacao   DATE NOT NULL,
        DataEdital        DATE NULL,
        PrazoDias         INT NOT NULL DEFAULT 15,
        DataHomologacao   DATE NULL,
        HomologadoPor     INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RecursoInterposto BIT NOT NULL DEFAULT 0,
        DataRecurso       DATE NULL,
        ResultadoRecurso  NVARCHAR(30) NULL,                          -- PENDENTE / MANTIDO / REVERTIDO
        CriadoEm          DATETIME2 DEFAULT SYSUTCDATETIME()
    );
END
GO
