-- ============================================================
-- Migração 187 — o prazo da importação parada e a importação do resto (FASE 10, Membros; decisão do responsável de 24/11/2026, G2)
--
-- A decisão dele (24/11/2026, G2, a importação do sistema pago que começou a gravar e parou):
--  - o prazo é de 7 dias, contados do ÚLTIMO LOTE (e não da confirmação); a tela parada mostra "faltam N dias";
--  - vencido o prazo, os dados pessoais das linhas que faltavam se apagam (LGPD) e as matrículas se soltam; o sistema guarda e mostra QUAIS linhas
--    faltaram, só o número da linha e o nome;
--  - com essa lista, a Secretaria Geral pode fazer UMA importação nova só com as linhas que faltaram: a exceção ao "uma vez só", só para o resto daquela
--    importação;
--  - o mesmo prazo vale para a parada sem ninguém importado, que ganha a saída "descartar a importação".
--
-- O que nasce aqui:
--  1. UltimoLoteEm: a hora do último lote gravado. O prazo conta dela (sem nenhum lote gravado, da confirmação).
--  2. RestoDe: a importação do resto aponta para a importação que parou (a original). Uma só concluída por original (índice único filtrado); a rota
--     confere de novo, debaixo da trava da importação, antes de fazer a prévia e de confirmar.
--  3. CK_ImportacoesMembros_Datas: a importação confirmada que não gravou ninguém pode ser DESCARTADA (à mão, ou pela rotina no fim do prazo). Antes, a
--     descartada nunca tinha a data da confirmação; agora pode ter. A regra nova tem outro nome (CK_ImportacoesMembros_Datas2), para reexecutar sem dúvida.
-- Idempotente: seguro para reexecutar sem apagar dados.
-- Faixa de migrações: Membros até a 199 (o Financeiro a partir da 200).
-- ============================================================

IF COL_LENGTH(N'dbo.ImportacoesMembros', N'UltimoLoteEm') IS NULL
    ALTER TABLE dbo.ImportacoesMembros ADD UltimoLoteEm DATETIME2(0) NULL;
GO

IF COL_LENGTH(N'dbo.ImportacoesMembros', N'RestoDe') IS NULL
    ALTER TABLE dbo.ImportacoesMembros ADD RestoDe INT NULL
        CONSTRAINT FK_ImportacoesMembros_RestoDe REFERENCES dbo.ImportacoesMembros (ImportacaoId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_ImportacoesMembros_RestoDe')
    ALTER TABLE dbo.ImportacoesMembros ADD CONSTRAINT CK_ImportacoesMembros_RestoDe CHECK (RestoDe IS NULL OR RestoDe <> ImportacaoId);
GO
-- uma importação do resto concluída por original (o "UMA importação nova" dele)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ImportacoesMembros_Resto' AND object_id = OBJECT_ID(N'dbo.ImportacoesMembros'))
    CREATE UNIQUE INDEX UX_ImportacoesMembros_Resto ON dbo.ImportacoesMembros (RestoDe) WHERE Situacao = N'CONCLUIDA' AND RestoDe IS NOT NULL;
GO
-- a chave estrangeira RestoDe com o seu índice (regra 3 do Banco; menor 5 do portão da volta 5): o único acima é filtrado (só CONCLUIDA) e não serve à
-- conferência da chave nem à procura do resto de uma importação
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ImportacoesMembros_RestoDe' AND object_id = OBJECT_ID(N'dbo.ImportacoesMembros'))
    CREATE INDEX IX_ImportacoesMembros_RestoDe ON dbo.ImportacoesMembros (RestoDe);
GO

-- a confirmada que não gravou ninguém pode ser descartada (com a data da confirmação); o resto da regra das datas é o da 185
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_ImportacoesMembros_Datas' AND parent_object_id = OBJECT_ID(N'dbo.ImportacoesMembros'))
    ALTER TABLE dbo.ImportacoesMembros DROP CONSTRAINT CK_ImportacoesMembros_Datas;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_ImportacoesMembros_Datas2')
    ALTER TABLE dbo.ImportacoesMembros ADD CONSTRAINT CK_ImportacoesMembros_Datas2 CHECK (
        (Situacao = N'PREVIA' AND ConfirmadaEm IS NULL AND ConcluidaEm IS NULL AND DescartadaEm IS NULL)
        OR (Situacao = N'IMPORTANDO' AND ConfirmadaEm IS NOT NULL AND ConcluidaEm IS NULL AND DescartadaEm IS NULL)
        OR (Situacao = N'CONCLUIDA' AND ConfirmadaEm IS NOT NULL AND ConcluidaEm IS NOT NULL AND DescartadaEm IS NULL)
        OR (Situacao = N'DESCARTADA' AND ConcluidaEm IS NULL AND DescartadaEm IS NOT NULL));
GO
