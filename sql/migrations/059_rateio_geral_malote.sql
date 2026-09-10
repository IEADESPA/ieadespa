-- ============================================================
-- Migração 059 — v4.10 (fundação): Rateio Geral — segunda camada de
-- rateio, sobre os 60% que já chegaram como repasse da Tesouraria Local
-- (v4.1.3). Até aqui, os 60% ficavam integralmente disponíveis como
-- "Centro de Custo Geral" assim que liberados. Agora, antes de virar
-- Tesouro Geral gastável, esse repasse precisa passar por um "malote":
-- um controle interno que acumula os repasses liberados de TODAS as
-- congregações — cada uma reportando em ritmo próprio (semanal, mensal,
-- às vezes atrasada em vários meses) — e só divide esse acumulado em
-- Convenção / Prebenda Pastoral / Fundo PDQ / Tesouro Geral quando a
-- Tesouraria Geral fecha o Rateio Geral do mês (mesmo espírito do
-- fechamento local, um nível acima).
--
-- A regra de ouro pedida explicitamente: "o que já foi rateado não pode
-- misturar com o que ainda não foi" — é exatamente o que a UNIQUE em
-- RateioGeralItens.FechamentoId garante: um FechamentoTesouraria
-- (repasse já liberado de uma congregação) só pode entrar em UM Rateio
-- Geral, nunca dois, banco de dados impede fisicamente a duplicidade.
--
-- O Fundo de Execução Estratégica do PDQ (v4.8, Art. 27) e agora
-- Convenção/Prebenda Pastoral passam a ser tratados igualmente, como
-- "destinos" percentuais configuráveis do mesmo Rateio Geral — antes o
-- PDQ calculava sua fatia direto sobre o repasse bruto, sem coordenação
-- com essas outras fatias; unificar evita que duas fatias concorrentes
-- reivindiquem dinheiro da mesma "caixa única" (v4.1.3) sem controle.
-- ============================================================

-- Configurável (mesmo motor de catálogo genérico já usado em
-- CategoriasSaida/AlcadasAprovacao) — nunca hardcoded. Percentuais
-- concretos informados: Convenção 10%, Prebenda Pastoral 30%. O Fundo
-- PDQ (10%, já existente desde v4.8) migra pra cá. "O que é do
-- presidente" e "dízimo do pastor" citados como itens a entender a
-- partir deste malote NÃO viraram destinos com percentual próprio nesta
-- entrega — nenhum percentual concreto foi informado pra eles; ficam como
-- possível destino futuro, bastando cadastrar uma nova linha aqui.
IF OBJECT_ID(N'dbo.RateioGeralDestinos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RateioGeralDestinos (
        DestinoId   INT IDENTITY PRIMARY KEY,
        Codigo      NVARCHAR(30) NOT NULL UNIQUE,
        Nome        NVARCHAR(150) NOT NULL,
        Percentual  DECIMAL(5,2) NOT NULL,
        Ativo       BIT NOT NULL DEFAULT 1
    );
    INSERT INTO dbo.RateioGeralDestinos (Codigo, Nome, Percentual) VALUES
        ('CONVENCAO', 'Fundo Convencional (Convenção)', 10.00),
        ('PREBENDA_PASTORAL', 'Prebenda Pastoral', 30.00),
        ('PDQ', 'Fundo de Execução Estratégica (PDQ)', 10.00);
END
GO

-- Cada fechamento mensal do Rateio Geral — imutável depois de fechado
-- (mesmo princípio de FechamentosTesouraria, v4.1: erro se corrige com
-- lançamento de ajuste auditado, nunca reescrevendo o fechamento).
IF OBJECT_ID(N'dbo.RateiosGerais', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RateiosGerais (
        RateioGeralId      INT IDENTITY PRIMARY KEY,
        MesReferencia      CHAR(7) NOT NULL,
        TotalBase          DECIMAL(12,2) NOT NULL,
        ValorTesouroGeral  DECIMAL(12,2) NOT NULL,
        TotalItens         INT NOT NULL,
        FechadoPor         INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        FechadoEm          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Quanto coube pra cada destino NESTE rateio — guarda o percentual
-- vigente na época (se o percentual mudar depois, os rateios já fechados
-- não mudam retroativamente).
IF OBJECT_ID(N'dbo.RateioGeralValores', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RateioGeralValores (
        RateioGeralValorId INT IDENTITY PRIMARY KEY,
        RateioGeralId      INT NOT NULL REFERENCES dbo.RateiosGerais(RateioGeralId),
        DestinoCodigo      NVARCHAR(30) NOT NULL,
        DestinoNome        NVARCHAR(150) NOT NULL,
        Percentual         DECIMAL(5,2) NOT NULL,
        Valor              DECIMAL(12,2) NOT NULL
    );
END
GO

-- O "malote" propriamente dito: qual repasse (FechamentoTesouraria) de
-- qual congregação entrou em qual Rateio Geral. UNIQUE em FechamentoId é
-- a trava física contra misturar o que já foi rateado com o que não foi.
IF OBJECT_ID(N'dbo.RateioGeralItens', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RateioGeralItens (
        RateioGeralItemId        INT IDENTITY PRIMARY KEY,
        RateioGeralId            INT NOT NULL REFERENCES dbo.RateiosGerais(RateioGeralId),
        FechamentoId             INT NOT NULL UNIQUE REFERENCES dbo.FechamentosTesouraria(FechamentoId),
        CongregacaoId            INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        MesReferenciaCongregacao CHAR(7) NOT NULL,
        Valor                    DECIMAL(12,2) NOT NULL
    );
END
GO

-- Contas contábeis e categorias de saída próprias — Prebenda Pastoral
-- (Reg. Art. 134, natureza alimentar) e contribuição à Convenção passam
-- a ser pagas como Saídas normais (v4.5), cada uma com seu próprio
-- Centro de Custo (mesmo princípio de LOCAL/GERAL/PDQ).
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '5.1.3')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '5.1.3', 'Prebenda Pastoral', 'DESPESA', ContaId FROM dbo.PlanoContas WHERE Codigo = '5.1';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '5.2.3')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '5.2.3', 'Contribuição ao Fundo Convencional', 'DESPESA', ContaId FROM dbo.PlanoContas WHERE Codigo = '5.2';
GO

IF NOT EXISTS (SELECT 1 FROM dbo.CategoriasSaida WHERE Codigo = 'PREBENDA_PASTORAL')
    INSERT INTO dbo.CategoriasSaida (Codigo, Nome, CentroCusto, TipoFundo, ClassificacaoFuncional, ContaContabilId)
    SELECT 'PREBENDA_PASTORAL', 'Prebenda Pastoral', 'PREBENDA_PASTORAL', 'LIVRE', 'ATIVIDADES_FIM', ContaId FROM dbo.PlanoContas WHERE Codigo = '5.1.3';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.CategoriasSaida WHERE Codigo = 'CONVENCAO')
    INSERT INTO dbo.CategoriasSaida (Codigo, Nome, CentroCusto, TipoFundo, ClassificacaoFuncional, ContaContabilId)
    SELECT 'CONVENCAO', 'Contribuição ao Fundo Convencional', 'CONVENCAO', 'LIVRE', 'ADMINISTRATIVA', ContaId FROM dbo.PlanoContas WHERE Codigo = '5.2.3';
GO
