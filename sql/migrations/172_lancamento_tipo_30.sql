-- ============================================================
-- Migração 172 — o lançamento da tesouraria cabe o código de qualquer categoria de entrada (FASE 10, 12/11/2026)
--
-- O código da categoria de entrada tem até 30 letras (CategoriasEntrada.Codigo, ContasAReceber.Tipo e OrcamentoLinhas.CategoriaCodigo são
-- NVARCHAR(30), e as três rotas que gravam o lançamento mandam o tipo como NVarChar(30)), mas LancamentosTesouraria.Tipo nasceu com 20
-- (migração 043, quando só existiam DIZIMO e OFERTA). "OFERTA_CULTO_DEPARTAMENTO" (25 letras, migração 047) não cabia: ninguém conseguia
-- lançar a Oferta de Culto do Departamento, nem confirmar uma conta a receber dessa categoria (o banco recusava por "dado truncado").
-- Achado pela massa grande da homologação; correção aprovada pelo responsável em 12/11/2026.
--
-- Só alarga a coluna: nenhum dado muda, nenhuma regra muda. Idempotente (COL_LENGTH em bytes: NVARCHAR(20) = 40, NVARCHAR(30) = 60).
-- ============================================================

IF COL_LENGTH('dbo.LancamentosTesouraria', 'Tipo') IS NOT NULL
   AND COL_LENGTH('dbo.LancamentosTesouraria', 'Tipo') < 60
BEGIN
    ALTER TABLE dbo.LancamentosTesouraria ALTER COLUMN Tipo NVARCHAR(30) NOT NULL;
    PRINT 'Migração 172: LancamentosTesouraria.Tipo agora aceita até 30 letras.';
END
GO
