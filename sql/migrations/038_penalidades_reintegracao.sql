-- ============================================================
-- Migração 038 — v3.4/v3.5: Catálogo de Penalidades (Art. 95 §2º) e
-- Prova de Reintegração Ética (Art. 77) sobre o Processo Disciplinar.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.TiposPenalidade') AND type = N'U')
BEGIN
    CREATE TABLE dbo.TiposPenalidade (
        PenalidadeId        INT IDENTITY PRIMARY KEY,
        Codigo               NVARCHAR(30) NOT NULL UNIQUE,
        Nome                  NVARCHAR(100) NOT NULL,
        ReferenciaRegimento    NVARCHAR(40) NULL,
        Ativo                  BIT NOT NULL DEFAULT 1
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.TiposPenalidade)
BEGIN
    INSERT INTO dbo.TiposPenalidade (Codigo, Nome, ReferenciaRegimento) VALUES
    ('ADVERTENCIA',          'Advertência',           'Art. 95 §2º, I'),
    ('SUSPENSAO_TEMPORARIA', 'Suspensão Temporária',  'Art. 95 §2º, II'),
    ('DISCIPLINA_RIGOROSA',  'Disciplina Rigorosa',   'Art. 95 §2º, III'),
    ('EXCLUSAO',             'Exclusão',              'Art. 95 §2º, IV');
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ProcessosDisciplinares') AND name = N'PenalidadeId')
    ALTER TABLE dbo.ProcessosDisciplinares ADD PenalidadeId INT NULL REFERENCES dbo.TiposPenalidade(PenalidadeId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ProcessosDisciplinares') AND name = N'DataProvaReintegracao')
    ALTER TABLE dbo.ProcessosDisciplinares ADD DataProvaReintegracao DATE NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ProcessosDisciplinares') AND name = N'ResultadoProvaReintegracao')
    ALTER TABLE dbo.ProcessosDisciplinares ADD ResultadoProvaReintegracao NVARCHAR(20) NULL; -- APROVADO | REPROVADO
GO

-- Permissão "cei" — sigilo do processo com efeito funcional real (v3.4).
IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'cei')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('cei', 'CEI — Sigilo Pleno de Processos');
GO

-- Mesmas 2 roles globais que já tinham "disciplina" desde o início (migração
-- 002/005) ganham "cei" também, pelo mesmo critério — guard idempotente via
-- CSV-contains (',' + Permissoes + ',' NOT LIKE '%,cei,%').
UPDATE dbo.Papeis
SET Permissoes = Permissoes + ',cei'
WHERE Nome IN ('Presidente', 'Secretário Geral')
  AND (',' + Permissoes + ',') NOT LIKE '%,cei,%';
GO
