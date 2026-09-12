-- ============================================================
-- Migração 060 — v4.10 (segunda parte / rodada de fechamento):
-- Prebenda e sustento pastoral — os 7 itens que faltavam depois da
-- fundação do malote (Rateio Geral, migração 059).
--
-- O que já existia (059): a categoria PREBENDA_PASTORAL e o Centro de
-- Custo PREBENDA_PASTORAL alimentado pelo Rateio Geral (30%). O que
-- faltava era o ciclo de verdade do sustento pastoral, com a blindagem
-- jurídica que sustenta que a prebenda NÃO é contraprestação por
-- trabalho (Lei 8.212/91 art. 22 §§13-14; Lei 13.137/2015; Lei
-- 14.647/2023 — CLT, inexistência de vínculo entre entidade religiosa
-- e seus ministros). Os 7 itens:
--   1) Cadastro do prebendado + geração recorrente mensal.
--   2) Ato de designação ministerial + valor fixado em deliberação de
--      órgão colegiado, com a ata vinculada ao registro.
--   3) Alerta de risco de descaracterização de vínculo (jornada,
--      subordinação, controle de horário).
--   4) Retenções tributárias corretas: sem cota patronal (20%), o
--      ministro é contribuinte individual; a prebenda é tributável pelo
--      IRPF com retenção na fonte.
--   5) Vedação à "pejotização" do ministério (bloqueio de PJ).
--   6) Pagamento em lote via remessa bancária (v4.7).
--   7) Auxílios e ajudas de custo distintos da prebenda, cada um com
--      sua natureza fiscal.
-- ============================================================

-- Tabela progressiva mensal do IRRF (configurável, nunca hardcoded) —
-- base de cálculo, alíquota e parcela a deduzir. Tabela vigente de
-- 02/2024 (mesma usada nas retenções mensais de rendimento).
IF OBJECT_ID(N'dbo.FaixasIrrf', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FaixasIrrf (
        FaixaId         INT IDENTITY PRIMARY KEY,
        FaixaMinimo     DECIMAL(10,2) NOT NULL,
        Aliquota        DECIMAL(5,2) NOT NULL,
        ParcelaDeduzir  DECIMAL(10,2) NOT NULL,
        Ativo           BIT NOT NULL DEFAULT 1
    );
    INSERT INTO dbo.FaixasIrrf (FaixaMinimo, Aliquota, ParcelaDeduzir) VALUES
        (0.00,     0.00,  0.00),
        (2259.21,  7.50,  169.44),
        (2826.66, 15.00,  381.44),
        (3751.06, 22.50,  662.77),
        (4664.69, 27.50,  896.00);
END
GO

-- Ato de designação ministerial — o instrumento que sustenta
-- juridicamente a natureza não-trabalhista da prebenda. O valor NÃO é
-- auto-atribuído: vem de deliberação de órgão colegiado (Reg. Art. 134
-- §5º), com a ata vinculada ao registro.
IF OBJECT_ID(N'dbo.AtosDesignacao', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AtosDesignacao (
        AtoDesignacaoId   INT IDENTITY PRIMARY KEY,
        NumeroAto         NVARCHAR(30) NOT NULL,
        OrgaoColegiado    NVARCHAR(150) NOT NULL,
        DataDeliberacao   DATE NOT NULL,
        ValorMensal       DECIMAL(10,2) NOT NULL,
        MembroId          INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AtaUrl            NVARCHAR(500) NOT NULL,
        CriadoPor         INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Cadastro do prebendado (dados do pastor + valor mensal de referência).
-- Por opção de governança (Reg. Art. 134 §6º), o recebimento de prebenda
-- é restrito ao Pastor Presidente — mas o cadastro fica aberto ao modelo
-- de dados pra não travar a instituição se a regra for alterada.
IF OBJECT_ID(N'dbo.Prebendados', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Prebendados (
        PrebendadoId      INT IDENTITY PRIMARY KEY,
        MembroId          INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        FornecedorId      INT NOT NULL REFERENCES dbo.Fornecedores(FornecedorId),
        Cpf               VARCHAR(14) NOT NULL UNIQUE,
        ValorMensalReferencia DECIMAL(10,2) NOT NULL,
        DataInicio        DATE NOT NULL,
        DataFim           DATE NULL,
        Status            NVARCHAR(20) NOT NULL DEFAULT 'ATIVO', -- ATIVO | SUSPENSO | ENCERRADO
        AtoDesignacaoId   INT NULL REFERENCES dbo.AtosDesignacao(AtoDesignacaoId),
        Observacao        NVARCHAR(300) NULL,
        CriadoPor         INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Geração recorrente mensal da prebenda. Cada linha é UMA prebenda de UM
-- mês; o valor líquido (bruto - IRRF) é o que sai como Saída (v4.5) e
-- entra na remessa bancária (v4.7). O IRRF retido fica registrado aqui
-- pra compor o Informe Anual de Rendimentos (v4.19).
IF OBJECT_ID(N'dbo.PrebendaGeracoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PrebendaGeracoes (
        PrebendaGeracaoId INT IDENTITY PRIMARY KEY,
        MesReferencia     CHAR(7) NOT NULL,
        PrebendadoId      INT NOT NULL REFERENCES dbo.Prebendados(PrebendadoId),
        ValorBruto        DECIMAL(10,2) NOT NULL,
        IrrfRetido        DECIMAL(10,2) NOT NULL,
        ValorLiquido      DECIMAL(10,2) NOT NULL,
        SaidaId           INT NULL REFERENCES dbo.SaidasTesouraria(SaidaId),
        Status            NVARCHAR(20) NOT NULL DEFAULT 'GERADA', -- GERADA | PAGA | CANCELADA
        AlertaRisco       NVARCHAR(500) NULL,
        GeradaPor         INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        GeradaEm          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_PrebendaGeracao_MesPessoa UNIQUE (MesReferencia, PrebendadoId)
    );
END
GO

-- Registro de elementos de risco de descaracterização de vínculo: se o
-- sistema registrar jornada, subordinação ou controle de horário de um
-- ministro, ele próprio avisa (esses são exatamente os elementos que a
-- Justiça do Trabalho usa pra reconhecer vínculo empregatício).
IF OBJECT_ID(N'dbo.PrebendaRiscosVinculo', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PrebendaRiscosVinculo (
        RiscoVinculoId INT IDENTITY PRIMARY KEY,
        PrebendadoId   INT NOT NULL REFERENCES dbo.Prebendados(PrebendadoId),
        TipoRisco      NVARCHAR(20) NOT NULL, -- JORNADA | SUBORDINACAO | CONTROLE_HORARIO
        Descricao      NVARCHAR(300) NOT NULL,
        Status         NVARCHAR(20) NOT NULL DEFAULT 'ATIVO', -- ATIVO | RESOLVIDO
        RegistradoPor  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        ResolvidoEm    DATETIME2 NULL
    );
END
GO

-- Auxílios e ajudas de custo DISTINTOS da prebenda (moradia, transporte,
-- saúde), cada um com sua natureza fiscal — hoje cairiam todos na mesma
-- rubrica. São benefícios não-salariais (Reg. Art. 134 §4º).
IF OBJECT_ID(N'dbo.AuxiliosAjudaCusto', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuxiliosAjudaCusto (
        AuxilioId       INT IDENTITY PRIMARY KEY,
        PrebendadoId    INT NOT NULL REFERENCES dbo.Prebendados(PrebendadoId),
        Tipo            NVARCHAR(20) NOT NULL, -- MORADIA | TRANSPORTE | SAUDE | OUTROS
        NaturezaFiscal  NVARCHAR(20) NOT NULL, -- INDENIZATORIA | ISENTA | TRIBUTAVEL_IRPF
        ValorMensal     DECIMAL(10,2) NOT NULL,
        Status          NVARCHAR(20) NOT NULL DEFAULT 'ATIVO', -- ATIVO | ENCERRADO
        Observacao      NVARCHAR(300) NULL,
        CriadoPor       INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Conta contábil e categorias próprias pros auxílios (cada categoria de
-- Saída tem Centro de Custo GERAL — despesa da Igreja com o sustento do
-- ministério — e natureza fiscal distinta, não misturada com a prebenda).
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '5.1.4')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '5.1.4', 'Auxílios e Ajudas de Custo Pastoral', 'DESPESA', ContaId FROM dbo.PlanoContas WHERE Codigo = '5.1';
GO

IF NOT EXISTS (SELECT 1 FROM dbo.CategoriasSaida WHERE Codigo = 'AUXILIO_MORADIA')
    INSERT INTO dbo.CategoriasSaida (Codigo, Nome, CentroCusto, TipoFundo, ClassificacaoFuncional, ContaContabilId)
    SELECT 'AUXILIO_MORADIA', 'Auxílio Moradia (Habitação Pastoral)', 'GERAL', 'LIVRE', 'ATIVIDADES_FIM', ContaId FROM dbo.PlanoContas WHERE Codigo = '5.1.4';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.CategoriasSaida WHERE Codigo = 'AUXILIO_TRANSPORTE')
    INSERT INTO dbo.CategoriasSaida (Codigo, Nome, CentroCusto, TipoFundo, ClassificacaoFuncional, ContaContabilId)
    SELECT 'AUXILIO_TRANSPORTE', 'Auxílio Transporte (Instrumento de Trabalho)', 'GERAL', 'LIVRE', 'ATIVIDADES_FIM', ContaId FROM dbo.PlanoContas WHERE Codigo = '5.1.4';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.CategoriasSaida WHERE Codigo = 'AUXILIO_SAUDE')
    INSERT INTO dbo.CategoriasSaida (Codigo, Nome, CentroCusto, TipoFundo, ClassificacaoFuncional, ContaContabilId)
    SELECT 'AUXILIO_SAUDE', 'Assistência Saúde (Ministro e Dependentes)', 'GERAL', 'LIVRE', 'ATIVIDADES_FIM', ContaId FROM dbo.PlanoContas WHERE Codigo = '5.1.4';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.CategoriasSaida WHERE Codigo = 'AUXILIO_OUTROS')
    INSERT INTO dbo.CategoriasSaida (Codigo, Nome, CentroCusto, TipoFundo, ClassificacaoFuncional, ContaContabilId)
    SELECT 'AUXILIO_OUTROS', 'Outros Auxílios e Ajudas de Custo', 'GERAL', 'LIVRE', 'ATIVIDADES_FIM', ContaId FROM dbo.PlanoContas WHERE Codigo = '5.1.4';
GO

