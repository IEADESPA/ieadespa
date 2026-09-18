-- ============================================================
-- Migração 097 — v5.4 (correção): ponte real entre o dinheiro de
-- departamento e o saldo consolidado que o Conselho Fiscal audita.
--
-- Achado do usuário, confirmado por pesquisa em duas partes:
-- 1. O rateio (v5.4/094) era só calculado AO VIVO — se o perfil de rateio
--    mudasse depois, relatórios antigos "mudariam de valor" retroativamente.
--    Corrigido: `RelatoriosDepartamentais.ValorParaGeral/ValorParaLocal`
--    CONGELAM no momento da aprovação geral (mesmo princípio de "gerar e
--    congelar" já usado em RelatoriosCredenciamento/TesourariasDepartamento).
-- 2. O "para geral" do departamento é dinheiro discricionário DO PRÓPRIO
--    departamento (Estatuto Art. 49 — autonomia de gestão), não dinheiro
--    que se funde no caixa geral compartilhado da igreja (que qualquer
--    Tesoureiro Geral gasta por Saída comum) — por isso NÃO credita em
--    `RateiosGerais`/`saldoCentroCusto('GERAL')` (misturaria autonomia do
--    departamento com o caixa geral de todo mundo) e NÃO usa
--    `RepassesInstitucionais` (v4.15 — aquilo é o dízimo institucional de
--    10%, Art. 126-N, um tributo diferente). Continua em
--    `TesourariasDepartamento`/`DespesasTesourariaDepartamento` (já
--    existente, com trava do Art. 49), mas agora **visível no mesmo
--    relatório consolidado que a Tesouraria Geral já usa**
--    (`RelatorioSituacaoTesouro`, v4.10) — auditável junto com o resto,
--    sem precisar abrir uma tela por departamento.
-- 3. O "para local" (o que fica retido na congregação) também precisa de
--    onde ser gasto com a MESMA seriedade que qualquer despesa da igreja —
--    reaproveita o motor já existente e testado (`GestaoSaidas`/
--    `SaidasTesouraria`/`CategoriasSaida`, alçada de aprovação, segregação
--    de função, "quatro olhos", trava de saldo), não um motor mais fraco
--    e paralelo. Categorias novas com `CentroCusto = 'DEPTO_<SIGLA>'` —
--    `shared/tesouraria.js::saldoCentroCusto` aprende a somar o saldo
--    liberado a partir de `RelatoriosDepartamentais.ValorParaLocal` em vez
--    de `FechamentosTesouraria` (fonte errada pra esse dinheiro).
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.RelatoriosDepartamentais') AND name = 'ValorParaGeral')
    ALTER TABLE dbo.RelatoriosDepartamentais ADD ValorParaGeral DECIMAL(14,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.RelatoriosDepartamentais') AND name = 'ValorParaLocal')
    ALTER TABLE dbo.RelatoriosDepartamentais ADD ValorParaLocal DECIMAL(14,2) NULL;
GO

-- 8 categorias de Saída — uma por departamento, pro dinheiro "para local"
-- ser gasto pelo motor já auditado de Saídas/Contas a Pagar. TipoFundo
-- RESTRITO (Reg. Art. 152, I-II — dinheiro de departamento não custeia
-- atividade de outro; aqui é reforçado pelo próprio Centro de Custo
-- exclusivo daquele departamento, não por uma trava adicional de "tipo de
-- fundo" que já existia pra outros fins).
INSERT INTO dbo.CategoriasSaida (Codigo, Nome, CentroCusto, TipoFundo)
SELECT CONCAT('DEPTO_', d.Sigla), CONCAT('Despesa Local — ', d.Nome), CONCAT('DEPTO_', d.Sigla), 'RESTRITO'
FROM dbo.Departamentos d
WHERE NOT EXISTS (SELECT 1 FROM dbo.CategoriasSaida cs WHERE cs.Codigo = CONCAT('DEPTO_', d.Sigla));
GO
