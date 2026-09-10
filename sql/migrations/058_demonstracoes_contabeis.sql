-- ============================================================
-- Migração 058 — v4.9: Demonstrações Contábeis (ITG 2002, CFC Res.
-- 1.409/12) — Balanço Patrimonial, Demonstração do Resultado do Período,
-- Mutações do Patrimônio Líquido e Fluxo de Caixa são todos CALCULADOS NA
-- LEITURA a partir do Plano de Contas (v4.2) + Tesouraria (v4.1) + Saídas
-- (v4.5) + Contas a Receber (v4.6) — nenhuma tabela nova de "saldo
-- contábil" foi criada de propósito (o Patrimônio Líquido, por definição
-- contábil, sempre fecha o Balanço: Ativo Total menos Passivo Total).
-- O único dado que não dá pra calcular é texto qualitativo humano — daí
-- a única tabela nova aqui, as Notas Explicativas.
-- ============================================================

-- Classificação funcional de despesa (atividades-fim vs administrativa) —
-- usada na Demonstração do Resultado do Período pra separar o que é
-- atividade-fim (culto, evangelismo, PDQ) do que é estrutura
-- administrativa — alimenta o Índice de Aplicação em Atividades-Fim
-- (v4.12, futuro).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.CategoriasSaida') AND name = N'ClassificacaoFuncional')
    ALTER TABLE dbo.CategoriasSaida ADD ClassificacaoFuncional NVARCHAR(20) NOT NULL DEFAULT 'ATIVIDADES_FIM'; -- ATIVIDADES_FIM | ADMINISTRATIVA
GO

UPDATE dbo.CategoriasSaida SET ClassificacaoFuncional = 'ADMINISTRATIVA' WHERE Codigo IN ('MANUTENCAO', 'ADMINISTRATIVA') AND ClassificacaoFuncional = 'ATIVIDADES_FIM';
GO

-- Notas Explicativas — texto qualitativo humano (não calculável), uma
-- entrada por ano de referência das demonstrações.
IF OBJECT_ID(N'dbo.NotasExplicativas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.NotasExplicativas (
        Ano             INT NOT NULL PRIMARY KEY,
        Texto           NVARCHAR(MAX) NULL,
        AtualizadoPor   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AtualizadoEm    DATETIME2 NULL
    );
END
GO
