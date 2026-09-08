-- ============================================================
-- Migração 052 — v4.5 (primeira parte, 1/2): Saídas — Contas a Pagar.
-- Espelha a arquitetura de Entradas (v4.1-v4.4): catálogo próprio de
-- categorias, cadastro de fornecedores com proteção reforçada contra
-- fraude em dados bancários (vetor de fraude nº1 segundo a pesquisa de
-- mercado), e o fluxo completo de solicitação → aprovação por alçada de
-- valor → pagamento → comprovante, com segregação de funções (quem
-- solicita nunca aprova a própria solicitação) e saldo do Centro de
-- Custo (Local/Geral, v4.1.3) nunca ficando negativo.
-- ============================================================

IF OBJECT_ID(N'dbo.CategoriasSaida', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CategoriasSaida (
        CategoriaId      INT IDENTITY PRIMARY KEY,
        Codigo           NVARCHAR(30) NOT NULL UNIQUE,
        Nome             NVARCHAR(150) NOT NULL,
        CentroCusto      NVARCHAR(20) NOT NULL DEFAULT 'LOCAL', -- LOCAL | GERAL — de qual saldo (v4.1.3) esta despesa debita
        TipoFundo        NVARCHAR(20) NOT NULL DEFAULT 'LIVRE', -- RESTRITO | LIVRE — espelha CategoriasEntrada (v4.2)
        ContaContabilId  INT NULL REFERENCES dbo.PlanoContas(ContaId),
        Ativa            BIT NOT NULL DEFAULT 1
    );
END
GO

-- Seed mínimo (compatível com a estrutura ITG 2002 já semeada em v4.2:
-- 5.1 Despesas com Atividades-Fim / 5.2 Despesas Administrativas).
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '5.1.1')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '5.1.1', 'Despesas com Culto e Eventos', 'DESPESA', ContaId FROM dbo.PlanoContas WHERE Codigo = '5.1';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '5.2.1')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '5.2.1', 'Despesas com Manutenção e Utilidades (Aluguel, Água, Luz)', 'DESPESA', ContaId FROM dbo.PlanoContas WHERE Codigo = '5.2';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '5.2.2')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '5.2.2', 'Despesas Administrativas Gerais', 'DESPESA', ContaId FROM dbo.PlanoContas WHERE Codigo = '5.2';
GO

IF NOT EXISTS (SELECT 1 FROM dbo.CategoriasSaida WHERE Codigo = 'MANUTENCAO')
    INSERT INTO dbo.CategoriasSaida (Codigo, Nome, CentroCusto, TipoFundo, ContaContabilId)
    SELECT 'MANUTENCAO', 'Manutenção e Utilidades (Aluguel, Água, Luz)', 'LOCAL', 'LIVRE', ContaId FROM dbo.PlanoContas WHERE Codigo = '5.2.1';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.CategoriasSaida WHERE Codigo = 'CULTO_EVENTO')
    INSERT INTO dbo.CategoriasSaida (Codigo, Nome, CentroCusto, TipoFundo, ContaContabilId)
    SELECT 'CULTO_EVENTO', 'Culto e Eventos', 'LOCAL', 'LIVRE', ContaId FROM dbo.PlanoContas WHERE Codigo = '5.1.1';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.CategoriasSaida WHERE Codigo = 'ADMINISTRATIVA')
    INSERT INTO dbo.CategoriasSaida (Codigo, Nome, CentroCusto, TipoFundo, ContaContabilId)
    SELECT 'ADMINISTRATIVA', 'Despesa Administrativa Geral', 'GERAL', 'LIVRE', ContaId FROM dbo.PlanoContas WHERE Codigo = '5.2.2';
GO

-- Fornecedores — pré-requisito pra pagar qualquer um. Mudança de dados
-- bancários trava o próximo pagamento até CONFIRMAÇÃO de outra pessoa
-- (segregação de funções — quem mudou nunca confirma a própria mudança).
IF OBJECT_ID(N'dbo.Fornecedores', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Fornecedores (
        FornecedorId              INT IDENTITY PRIMARY KEY,
        Nome                      NVARCHAR(200) NOT NULL,
        CpfCnpj                   VARCHAR(18) NOT NULL UNIQUE,
        Tipo                      NVARCHAR(2) NOT NULL, -- PF | PJ
        Telefone                  NVARCHAR(20) NULL,
        Email                     NVARCHAR(200) NULL,
        Banco                     NVARCHAR(100) NULL,
        Agencia                   NVARCHAR(20) NULL,
        Conta                     NVARCHAR(30) NULL,
        TipoConta                 NVARCHAR(20) NULL, -- CORRENTE | POUPANCA
        ChavePix                  NVARCHAR(200) NULL,
        DadosBancariosConfirmados BIT NOT NULL DEFAULT 1,
        DadosBancariosAlteradoPor INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DadosBancariosAlteradoEm  DATETIME2 NULL,
        ConfirmadoPor             INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ConfirmadoEm              DATETIME2 NULL,
        Ativo                     BIT NOT NULL DEFAULT 1,
        CriadoPor                 INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm                  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Alçada de valor: quanto maior o valor da Saída, mais aprovadores
-- distintos (e de nível territorial mais alto) são exigidos antes de
-- liberar o pagamento. Configurável (mesmo motor genérico de catálogo já
-- usado em Categorias/Plano de Contas), não hardcoded.
IF OBJECT_ID(N'dbo.AlcadasAprovacao', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AlcadasAprovacao (
        AlcadaId              INT IDENTITY PRIMARY KEY,
        ValorMinimo           DECIMAL(10,2) NOT NULL,
        NivelMinimoAprovador  NVARCHAR(20) NOT NULL, -- CONGREGACAO | AREA | REGIAO | QUADRANTE | DISTRITO | GLOBAL
        QuantidadeAprovadores INT NOT NULL DEFAULT 1,
        CONSTRAINT UQ_Alcada_ValorMinimo UNIQUE (ValorMinimo)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.AlcadasAprovacao)
BEGIN
    INSERT INTO dbo.AlcadasAprovacao (ValorMinimo, NivelMinimoAprovador, QuantidadeAprovadores) VALUES
        (0.00,     'CONGREGACAO', 1),
        (1000.00,  'AREA',        1),
        (5000.00,  'DISTRITO',    2),
        (20000.00, 'GLOBAL',      2);
END
GO

-- Saídas propriamente ditas — espelha LancamentosTesouraria (Termo nº não
-- se aplica aqui; o "comprovante" de uma Saída é a nota fiscal + o
-- comprovante de pagamento, ambos anexados).
IF OBJECT_ID(N'dbo.SaidasTesouraria', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SaidasTesouraria (
        SaidaId                INT IDENTITY PRIMARY KEY,
        CongregacaoId          INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        FornecedorId           INT NOT NULL REFERENCES dbo.Fornecedores(FornecedorId),
        Tipo                   NVARCHAR(30) NOT NULL, -- Codigo de CategoriasSaida
        Descricao              NVARCHAR(300) NOT NULL,
        Valor                  DECIMAL(10,2) NOT NULL,
        CampanhaId             INT NULL REFERENCES dbo.Campanhas(CampanhaId), -- se o gasto sai de um fundo restrito de campanha
        DocumentoFiscalUrl     NVARCHAR(500) NOT NULL, -- nota fiscal/recibo, obrigatório desde a solicitação (Reg. Art. 120 §2º)
        ComprovantePagamentoUrl NVARCHAR(500) NULL,     -- anexado só no pagamento
        Status                 NVARCHAR(20) NOT NULL DEFAULT 'PENDENTE', -- PENDENTE | APROVADA | REJEITADA | PAGA | CANCELADA
        SolicitadoPor          INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        SolicitadoEm           DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        MotivoRejeicao         NVARCHAR(300) NULL,
        PagoPor                INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        PagoEm                 DATETIME2 NULL,
        MotivoCancelamento     NVARCHAR(300) NULL,
        CanceladoPor           INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CanceladoEm            DATETIME2 NULL
    );
END
GO

-- Cada linha é UMA aprovação distinta — a Saída só vira APROVADA quando o
-- número de linhas bater a quantidade exigida pela alçada da faixa de
-- valor correspondente. Segregação de funções: SolicitadoPor nunca pode
-- aprovar a própria Saída (checado no endpoint, não aqui).
IF OBJECT_ID(N'dbo.SaidaAprovacoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SaidaAprovacoes (
        SaidaAprovacaoId INT IDENTITY PRIMARY KEY,
        SaidaId          INT NOT NULL REFERENCES dbo.SaidasTesouraria(SaidaId),
        AprovadoPor      INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AprovadoEm       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_SaidaAprovacao_Pessoa UNIQUE (SaidaId, AprovadoPor)
    );
END
GO
