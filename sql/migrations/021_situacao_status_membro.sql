-- ============================================================
-- Migração 021 — Situação e Status do Membro (v1.6).
--
-- Cobre a Linha do Tempo do Membro: além dos eventos já estruturados (admissão,
-- consagrações, cartas, disciplina, abandono — lidos por agregação, sem duplicar
-- dado), cria um lugar pra marcos que hoje não existem em nenhuma tabela:
-- conversão, ministério/igreja anterior, batismo no Espírito Santo. Corrigir um
-- marco já lançado exige justificativa e é restrito a papel de nível GLOBAL
-- (Papeis.Nivel, existente desde a migração 002) — a correção gera um novo
-- registro de Auditoria, nunca apaga/altera o que já estava lá.
--
-- A extensão do filtro de comunhão/disciplina pra todos os órgãos (shared/universo.js)
-- e a validação de Situação/bloqueio de processo disciplinar contra Congregado são
-- só código — não precisam de mudança de schema.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.MarcosMembro') AND type = N'U')
BEGIN
    CREATE TABLE dbo.MarcosMembro (
        MarcoId         INT IDENTITY PRIMARY KEY,
        MembroId        INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Tipo            NVARCHAR(30) NOT NULL, -- CONVERSAO / MINISTERIO_ANTERIOR / BATISMO_ESPIRITO_SANTO / OUTRO
        Descricao       NVARCHAR(500) NOT NULL,
        DataMarco       DATE NULL,
        DataAproximada  BIT NOT NULL DEFAULT 0,
        Justificativa   NVARCHAR(300) NULL,
        CriadoPor       INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AtualizadoPor   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm        DATETIME2 DEFAULT SYSUTCDATETIME(),
        AtualizadoEm    DATETIME2 NULL
    );
END
GO
