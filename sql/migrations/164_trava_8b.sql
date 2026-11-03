-- ============================================================
-- Migração 164 — Trava de Revisão 8-B (fecha a FASE 8). Registro em docs/plano/fase-8-ministerial-afm.md.
--
--   CandidatosBatismo: o batismo de urgência (Regimento Art. 70 §5º — "urgência espiritual, conversão notória ou risco de morte"): o motivo, o detalhe, a data do
--     termo de compromisso do Discipulado Pós-Batismal e quem registrou. Com ele, o curso de discipulado não trava a aptidão; a trilha (v8.5) mostra o pós-batismal.
--   ValoresMonetarios: a taxa de consagração (Art. 75, I, a — "indexação anual"; Art. 65) entra no Anexo de Parâmetros Monetários, corrigido com os demais.
--   AFMDisciplinaRequisitos: a disciplina da AFM só se exige na CONSAGRAÇÃO (nos outros fluxos — batismo, escala, EBD, liderança — quem não é obreiro nem candidato
--     não consegue se matricular na Academia e ficaria travado para sempre).
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF COL_LENGTH(N'dbo.CandidatosBatismo', N'UrgenciaMotivo') IS NULL
    ALTER TABLE dbo.CandidatosBatismo ADD UrgenciaMotivo NVARCHAR(30) NULL, UrgenciaDetalhe NVARCHAR(300) NULL, UrgenciaTermoEm DATE NULL,
        UrgenciaPor INT NULL, UrgenciaRegistradaEm DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_CandidatosBatismo_Urgencia')
    ALTER TABLE dbo.CandidatosBatismo ADD CONSTRAINT CK_CandidatosBatismo_Urgencia CHECK (
        (UrgenciaMotivo IS NULL AND UrgenciaTermoEm IS NULL)
        OR (UrgenciaMotivo IN (N'URGENCIA_ESPIRITUAL', N'CONVERSAO_NOTORIA', N'RISCO_DE_MORTE') AND UrgenciaTermoEm IS NOT NULL AND UrgenciaDetalhe IS NOT NULL));
GO

IF NOT EXISTS (SELECT 1 FROM dbo.ValoresMonetarios WHERE Sigla = N'TAXA_CONSAGRACAO')
    INSERT INTO dbo.ValoresMonetarios (Sigla, Nome, Valor, Indexador, Unidade, DataUltimaCorrecao)
    VALUES (N'TAXA_CONSAGRACAO', N'Taxa de consagração (Regimento, Art. 75, I, a)', 70.00, N'IPCA', N'R$', '2026-01-01');
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_AFMDisciplinaRequisitos_Contexto' AND definition LIKE N'%LIDERANCA%')
   AND NOT EXISTS (SELECT 1 FROM dbo.AFMDisciplinaRequisitos WHERE Contexto <> N'CONSAGRACAO')
    ALTER TABLE dbo.AFMDisciplinaRequisitos DROP CONSTRAINT CK_AFMDisciplinaRequisitos_Contexto;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_AFMDisciplinaRequisitos_Contexto')
    ALTER TABLE dbo.AFMDisciplinaRequisitos ADD CONSTRAINT CK_AFMDisciplinaRequisitos_Contexto CHECK (Contexto = N'CONSAGRACAO');
GO
