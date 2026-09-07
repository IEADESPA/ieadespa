-- ============================================================
-- Migração 048 — v4.2: Plano de Contas e Fundo Restrito/Livre. Fundação
-- contábil de que todas as próximas versões da FASE 4 dependem (Saídas,
-- Orçamento, Demonstrações ITG 2002) — hierarquia de contas contábeis
-- (Ativo/Passivo/Patrimônio Líquido/Receita/Despesa) por trás das
-- categorias de entrada já existentes (v4.1.5).
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.PlanoContas') AND type = N'U')
BEGIN
    CREATE TABLE dbo.PlanoContas (
        ContaId     INT IDENTITY PRIMARY KEY,
        Codigo      NVARCHAR(20) NOT NULL UNIQUE,
        Nome        NVARCHAR(200) NOT NULL,
        Tipo        NVARCHAR(20) NOT NULL, -- ATIVO | PASSIVO | PATRIMONIO_LIQUIDO | RECEITA | DESPESA
        ContaPaiId  INT NULL REFERENCES dbo.PlanoContas(ContaId),
        Ativa       BIT NOT NULL DEFAULT 1
    );
END
GO

-- Semente inicial (estrutura mínima real, compatível com o que a ITG 2002
-- vai exigir nas demonstrações — v4.9): cada INSERT busca o Id do pai pelo
-- Código, pra não depender de IDENTITY previsível.
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '1')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId) VALUES ('1', 'Ativo', 'ATIVO', NULL);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '1.1')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '1.1', 'Ativo Circulante', 'ATIVO', ContaId FROM dbo.PlanoContas WHERE Codigo = '1';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '1.1.1')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '1.1.1', 'Caixa e Equivalentes de Caixa', 'ATIVO', ContaId FROM dbo.PlanoContas WHERE Codigo = '1.1';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '1.2')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '1.2', 'Ativo Não Circulante', 'ATIVO', ContaId FROM dbo.PlanoContas WHERE Codigo = '1';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '1.2.1')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '1.2.1', 'Imobilizado', 'ATIVO', ContaId FROM dbo.PlanoContas WHERE Codigo = '1.2';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '2')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId) VALUES ('2', 'Passivo', 'PASSIVO', NULL);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '2.1')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '2.1', 'Passivo Circulante', 'PASSIVO', ContaId FROM dbo.PlanoContas WHERE Codigo = '2';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '3')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId) VALUES ('3', 'Patrimônio Líquido', 'PATRIMONIO_LIQUIDO', NULL);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '3.1')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '3.1', 'Patrimônio Social', 'PATRIMONIO_LIQUIDO', ContaId FROM dbo.PlanoContas WHERE Codigo = '3';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '4')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId) VALUES ('4', 'Receitas', 'RECEITA', NULL);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '4.1')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '4.1', 'Receitas Sem Restrição', 'RECEITA', ContaId FROM dbo.PlanoContas WHERE Codigo = '4';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '4.1.1')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '4.1.1', 'Dízimos', 'RECEITA', ContaId FROM dbo.PlanoContas WHERE Codigo = '4.1';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '4.1.2')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '4.1.2', 'Ofertas', 'RECEITA', ContaId FROM dbo.PlanoContas WHERE Codigo = '4.1';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '4.1.3')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '4.1.3', 'Entrada de Departamento', 'RECEITA', ContaId FROM dbo.PlanoContas WHERE Codigo = '4.1';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '4.1.4')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '4.1.4', 'Oferta de Culto do Departamento', 'RECEITA', ContaId FROM dbo.PlanoContas WHERE Codigo = '4.1';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '4.1.5')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '4.1.5', 'Entrada de Secretaria', 'RECEITA', ContaId FROM dbo.PlanoContas WHERE Codigo = '4.1';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '4.2')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '4.2', 'Receitas Com Restrição', 'RECEITA', ContaId FROM dbo.PlanoContas WHERE Codigo = '4';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '4.2.1')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '4.2.1', 'Entrada de Revista', 'RECEITA', ContaId FROM dbo.PlanoContas WHERE Codigo = '4.2';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '4.2.2')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '4.2.2', 'Entrada de Congresso', 'RECEITA', ContaId FROM dbo.PlanoContas WHERE Codigo = '4.2';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '5')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId) VALUES ('5', 'Despesas', 'DESPESA', NULL);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '5.1')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '5.1', 'Despesas com Atividades-Fim', 'DESPESA', ContaId FROM dbo.PlanoContas WHERE Codigo = '5';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '5.2')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '5.2', 'Despesas Administrativas', 'DESPESA', ContaId FROM dbo.PlanoContas WHERE Codigo = '5';
GO

-- Fund accounting (v4.1.5 -> v4.2): cada categoria de entrada ganha um
-- fundo (RESTRITO só pode ser gasto na própria finalidade quando as
-- Saídas existirem, v4.5) e um vínculo com o Plano de Contas.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.CategoriasEntrada') AND name = N'TipoFundo')
    ALTER TABLE dbo.CategoriasEntrada ADD TipoFundo NVARCHAR(20) NOT NULL DEFAULT 'LIVRE'; -- RESTRITO | LIVRE
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.CategoriasEntrada') AND name = N'ContaContabilId')
    ALTER TABLE dbo.CategoriasEntrada ADD ContaContabilId INT NULL REFERENCES dbo.PlanoContas(ContaId);
GO

-- Vincula as categorias já semeadas (v4.1.5) às contas contábeis
-- correspondentes e marca Revista/Congresso como Fundo Restrito (dinheiro
-- de finalidade específica) — só roda uma vez (WHERE ContaContabilId IS
-- NULL), nunca sobrescreve um vínculo já ajustado manualmente depois.
UPDATE ce SET ce.ContaContabilId = pc.ContaId
FROM dbo.CategoriasEntrada ce
JOIN dbo.PlanoContas pc ON pc.Codigo = CASE ce.Codigo
    WHEN 'DIZIMO' THEN '4.1.1' WHEN 'OFERTA' THEN '4.1.2' WHEN 'DEPARTAMENTO' THEN '4.1.3'
    WHEN 'OFERTA_CULTO_DEPARTAMENTO' THEN '4.1.4' WHEN 'SECRETARIA' THEN '4.1.5'
    WHEN 'REVISTA' THEN '4.2.1' WHEN 'CONGRESSO' THEN '4.2.2' END
WHERE ce.ContaContabilId IS NULL;
GO
UPDATE dbo.CategoriasEntrada SET TipoFundo = 'RESTRITO' WHERE Codigo IN ('REVISTA', 'CONGRESSO') AND TipoFundo = 'LIVRE';
GO
