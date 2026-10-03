-- ============================================================
-- Migração 095 — v5.4: Tesouraria Central por Departamento + Rateio
--
-- Duas camadas financeiras, como o protótipo (docs/04-05) confirmou:
-- (1) o relatório mensal por congregação (v5.2) já calcula "Valor Total"
-- (soma FINANCEIRO); (2) esta migração fecha a camada 2 — o rateio
-- local/geral desse total, e o livro-caixa do departamento em nível de
-- campo (TesourariasDepartamento), independente da conta bancária real.
--
-- Financeiro EXCLUSIVO do departamento (README FASE 5, decisão do
-- usuário): NÃO integra com SaidasTesouraria/RateioGeralValores da FASE 4
-- — outro livro-caixa, outra tela, outra permissão. A ponte com a conta
-- real fica pro Conselho Fiscal/Tesoureiro Geral auditar por fora, não
-- por dentro do motor. Por isso NÃO reaproveita literalmente
-- `shared/tesouraria.js::saldoCentroCusto` (que é uma função dos livros da
-- FASE 4) — reaproveita o MESMO PRINCÍPIO (saldo = liberado − pago,
-- sempre calculado, nunca digitado), implementado em cima das tabelas
-- próprias abaixo. Ressalva anotada aqui porque a v5.4 do README (escrita
-- antes desta pesquisa) prometia reaproveitar a função literal — registro
-- da correção de rumo, não escondida.
--
-- PerfisRateioDepartamental: 5 métodos reais confirmados nas planilhas
-- (INTEGRAL_GERAL, INTEGRAL_LOCAL — EBD hoje, MENSALIDADE_FIXA — USADESPA,
-- PERCENTUAL — FAMÍLIA 40%, VARIAVEL_MANUAL — UHADESPA). Só esses 4
-- departamentos têm método CONFIRMADO pela planilha real; os outros 4
-- (UCADESPA, UMADESPA, SEMIADESPA, ACAO_DA_FE) nascem com um padrão
-- (INTEGRAL_GERAL) e `Confirmado = 0` — decisão documentada, não
-- fabricada: sem a planilha física de cada um em mãos, não dá pra
-- garantir o método real; fica marcado pra quem administra confirmar.
--
-- TesourariasDepartamento: mesmo padrão de "gerar e congelar" já usado em
-- RelatoriosCredenciamento (vB.13) — 1 linha por depto/mês, criada só no
-- FECHAMENTO explícito do mês (pelo Líder Geral). Bloqueio automático
-- (Reg. Art. 133-C §2º) é calculado na leitura: mês anterior sem linha
-- aqui = balancete não entregue = novos recursos bloqueados.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.PerfisRateioDepartamental', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PerfisRateioDepartamental (
        PerfilRateioId                     INT IDENTITY PRIMARY KEY,
        SchemaRelatorioId                  INT NOT NULL UNIQUE REFERENCES dbo.SchemasRelatorioDepartamental(SchemaRelatorioId),
        Metodo                             NVARCHAR(20) NOT NULL,
        -- INTEGRAL_GERAL | INTEGRAL_LOCAL | MENSALIDADE_FIXA | PERCENTUAL | VARIAVEL_MANUAL
        PercentualGeral                    DECIMAL(5,2) NULL,   -- PERCENTUAL/MENSALIDADE_FIXA
        ModoEntrada                        NVARCHAR(20) NOT NULL DEFAULT 'BRUTO_CALCULADO',
        -- BRUTO_CALCULADO (sistema divide) | LIQUIDO_MANUAL (preenchedor já lança só a parte que sobe)
        SuporteSecretariaGeralHabilitado   BIT NOT NULL DEFAULT 0,
        ValorSuporteSecretariaGeral        DECIMAL(14,2) NULL,
        Confirmado                         BIT NOT NULL DEFAULT 1,  -- 0 = método ainda não confirmado com a planilha real
        AtualizadoEm                       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.ParametrosTesourariaDepartamento', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ParametrosTesourariaDepartamento (
        DepartamentoId               INT NOT NULL PRIMARY KEY REFERENCES dbo.Departamentos(DepartamentoId),
        -- Art. 49, I — acima deste valor, a despesa exige AutorizadoPor
        -- (Pastor Presidente/1º Secretário, nível GLOBAL) por escrito.
        LimiteDespesaSemAutorizacao  DECIMAL(14,2) NOT NULL DEFAULT 1000.00
    );
END
GO

IF OBJECT_ID(N'dbo.TesourariasDepartamento', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TesourariasDepartamento (
        TesourariaId              INT IDENTITY PRIMARY KEY,
        DepartamentoId            INT NOT NULL REFERENCES dbo.Departamentos(DepartamentoId),
        MesReferencia             INT NOT NULL CHECK (MesReferencia BETWEEN 1 AND 12),
        AnoReferencia             INT NOT NULL,
        SaldoTransportado         DECIMAL(14,2) NOT NULL DEFAULT 0,
        MovimentacaoGeralMes      DECIMAL(14,2) NOT NULL DEFAULT 0,
        InvestidoLocal            DECIMAL(14,2) NOT NULL DEFAULT 0,
        SuporteSecretariaGeral    DECIMAL(14,2) NOT NULL DEFAULT 0,
        TotalDespesas             DECIMAL(14,2) NOT NULL DEFAULT 0,
        SaldoMes                  DECIMAL(14,2) NOT NULL DEFAULT 0,
        FechadoPor                INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        FechadoEm                 DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_TesourariasDepartamento UNIQUE (DepartamentoId, MesReferencia, AnoReferencia)
    );
END
GO

-- VARIAVEL_MANUAL (ex: UHADESPA) — a divisão é decidida lançamento a
-- lançamento, então o próprio relatório precisa guardar quanto dessa vez
-- sobe pro geral (o resto vai pra local por subtração, nunca os dois
-- digitados separado — evitaria divergir da soma do Valor Total).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.RelatoriosDepartamentais') AND name = 'ValorManualParaGeral')
    ALTER TABLE dbo.RelatoriosDepartamentais ADD ValorManualParaGeral DECIMAL(14,2) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'tesouraria_departamental')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('tesouraria_departamental', 'Tesouraria Central de Departamentos e Secretarias');
GO

IF OBJECT_ID(N'dbo.DespesasTesourariaDepartamento', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DespesasTesourariaDepartamento (
        DespesaId       INT IDENTITY PRIMARY KEY,
        DepartamentoId  INT NOT NULL REFERENCES dbo.Departamentos(DepartamentoId),
        MesReferencia   INT NOT NULL CHECK (MesReferencia BETWEEN 1 AND 12),
        AnoReferencia   INT NOT NULL,
        Descricao       NVARCHAR(300) NOT NULL,
        Valor           DECIMAL(14,2) NOT NULL,
        AutorizadoPor   INT NULL REFERENCES dbo.MembroReferencia(MembroId), -- Art. 49, I (obrigatório acima do limite)
        LancadoPor      INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Seed dos perfis de rateio — só os 4 métodos confirmados na planilha real
-- (docs/04-departamentos-secretarias.md); os outros 4 departamentos
-- nascem com INTEGRAL_GERAL + Confirmado=0 (ver nota no cabeçalho). Mesmo
-- padrão explícito por sigla já usado na migração 092.
DECLARE @DepId INT, @SchemaId INT;

-- EBD — Integral Local (100% fica na congregação, confirmado no exemplo real)
SELECT @DepId = DepartamentoId FROM dbo.Departamentos WHERE Sigla = 'EBD';
SELECT @SchemaId = SchemaRelatorioId FROM dbo.SchemasRelatorioDepartamental WHERE DepartamentoId = @DepId AND DataVigenciaFim IS NULL;
IF @SchemaId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.PerfisRateioDepartamental WHERE SchemaRelatorioId = @SchemaId)
    INSERT INTO dbo.PerfisRateioDepartamental (SchemaRelatorioId, Metodo, ModoEntrada, Confirmado) VALUES (@SchemaId, 'INTEGRAL_LOCAL', 'BRUTO_CALCULADO', 1);
IF @DepId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.ParametrosTesourariaDepartamento WHERE DepartamentoId = @DepId)
    INSERT INTO dbo.ParametrosTesourariaDepartamento (DepartamentoId) VALUES (@DepId);

-- USADESPA — Taxa fixa de mensalidade
SELECT @DepId = DepartamentoId FROM dbo.Departamentos WHERE Sigla = 'USADESPA';
SELECT @SchemaId = SchemaRelatorioId FROM dbo.SchemasRelatorioDepartamental WHERE DepartamentoId = @DepId AND DataVigenciaFim IS NULL;
IF @SchemaId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.PerfisRateioDepartamental WHERE SchemaRelatorioId = @SchemaId)
    INSERT INTO dbo.PerfisRateioDepartamental (SchemaRelatorioId, Metodo, ModoEntrada, Confirmado) VALUES (@SchemaId, 'MENSALIDADE_FIXA', 'BRUTO_CALCULADO', 1);
IF @DepId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.ParametrosTesourariaDepartamento WHERE DepartamentoId = @DepId)
    INSERT INTO dbo.ParametrosTesourariaDepartamento (DepartamentoId) VALUES (@DepId);

-- FAMILIA — 40% geral, já lançado líquido pelo preenchedor (confirmado no exemplo real)
SELECT @DepId = DepartamentoId FROM dbo.Departamentos WHERE Sigla = 'FAMILIA';
SELECT @SchemaId = SchemaRelatorioId FROM dbo.SchemasRelatorioDepartamental WHERE DepartamentoId = @DepId AND DataVigenciaFim IS NULL;
IF @SchemaId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.PerfisRateioDepartamental WHERE SchemaRelatorioId = @SchemaId)
    INSERT INTO dbo.PerfisRateioDepartamental (SchemaRelatorioId, Metodo, PercentualGeral, ModoEntrada, Confirmado) VALUES (@SchemaId, 'PERCENTUAL', 40.00, 'LIQUIDO_MANUAL', 1);
IF @DepId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.ParametrosTesourariaDepartamento WHERE DepartamentoId = @DepId)
    INSERT INTO dbo.ParametrosTesourariaDepartamento (DepartamentoId) VALUES (@DepId);

-- UHADESPA — Variável/manual, decidido lançamento a lançamento
SELECT @DepId = DepartamentoId FROM dbo.Departamentos WHERE Sigla = 'UHADESPA';
SELECT @SchemaId = SchemaRelatorioId FROM dbo.SchemasRelatorioDepartamental WHERE DepartamentoId = @DepId AND DataVigenciaFim IS NULL;
IF @SchemaId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.PerfisRateioDepartamental WHERE SchemaRelatorioId = @SchemaId)
    INSERT INTO dbo.PerfisRateioDepartamental (SchemaRelatorioId, Metodo, ModoEntrada, Confirmado) VALUES (@SchemaId, 'VARIAVEL_MANUAL', 'BRUTO_CALCULADO', 1);
IF @DepId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.ParametrosTesourariaDepartamento WHERE DepartamentoId = @DepId)
    INSERT INTO dbo.ParametrosTesourariaDepartamento (DepartamentoId) VALUES (@DepId);

-- SEMIADESPA — suporte à Secretaria Geral confirmado (R$150), método base ainda não
SELECT @DepId = DepartamentoId FROM dbo.Departamentos WHERE Sigla = 'SEMIADESPA';
SELECT @SchemaId = SchemaRelatorioId FROM dbo.SchemasRelatorioDepartamental WHERE DepartamentoId = @DepId AND DataVigenciaFim IS NULL;
IF @SchemaId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.PerfisRateioDepartamental WHERE SchemaRelatorioId = @SchemaId)
    INSERT INTO dbo.PerfisRateioDepartamental (SchemaRelatorioId, Metodo, ModoEntrada, SuporteSecretariaGeralHabilitado, ValorSuporteSecretariaGeral, Confirmado)
    VALUES (@SchemaId, 'INTEGRAL_GERAL', 'BRUTO_CALCULADO', 1, 150.00, 0);
IF @DepId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.ParametrosTesourariaDepartamento WHERE DepartamentoId = @DepId)
    INSERT INTO dbo.ParametrosTesourariaDepartamento (DepartamentoId) VALUES (@DepId);

-- UCADESPA, UMADESPA, ACAO_DA_FE — método real ainda não confirmado com a
-- planilha física; nascem com um padrão seguro (Confirmado=0), não fabricado.
SELECT @DepId = DepartamentoId FROM dbo.Departamentos WHERE Sigla = 'UCADESPA';
SELECT @SchemaId = SchemaRelatorioId FROM dbo.SchemasRelatorioDepartamental WHERE DepartamentoId = @DepId AND DataVigenciaFim IS NULL;
IF @SchemaId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.PerfisRateioDepartamental WHERE SchemaRelatorioId = @SchemaId)
    INSERT INTO dbo.PerfisRateioDepartamental (SchemaRelatorioId, Metodo, ModoEntrada, Confirmado) VALUES (@SchemaId, 'INTEGRAL_GERAL', 'BRUTO_CALCULADO', 0);
IF @DepId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.ParametrosTesourariaDepartamento WHERE DepartamentoId = @DepId)
    INSERT INTO dbo.ParametrosTesourariaDepartamento (DepartamentoId) VALUES (@DepId);

SELECT @DepId = DepartamentoId FROM dbo.Departamentos WHERE Sigla = 'UMADESPA';
SELECT @SchemaId = SchemaRelatorioId FROM dbo.SchemasRelatorioDepartamental WHERE DepartamentoId = @DepId AND DataVigenciaFim IS NULL;
IF @SchemaId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.PerfisRateioDepartamental WHERE SchemaRelatorioId = @SchemaId)
    INSERT INTO dbo.PerfisRateioDepartamental (SchemaRelatorioId, Metodo, ModoEntrada, Confirmado) VALUES (@SchemaId, 'INTEGRAL_GERAL', 'BRUTO_CALCULADO', 0);
IF @DepId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.ParametrosTesourariaDepartamento WHERE DepartamentoId = @DepId)
    INSERT INTO dbo.ParametrosTesourariaDepartamento (DepartamentoId) VALUES (@DepId);

SELECT @DepId = DepartamentoId FROM dbo.Departamentos WHERE Sigla = 'ACAO_DA_FE';
SELECT @SchemaId = SchemaRelatorioId FROM dbo.SchemasRelatorioDepartamental WHERE DepartamentoId = @DepId AND DataVigenciaFim IS NULL;
IF @SchemaId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.PerfisRateioDepartamental WHERE SchemaRelatorioId = @SchemaId)
    INSERT INTO dbo.PerfisRateioDepartamental (SchemaRelatorioId, Metodo, ModoEntrada, Confirmado) VALUES (@SchemaId, 'INTEGRAL_GERAL', 'BRUTO_CALCULADO', 0);
IF @DepId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.ParametrosTesourariaDepartamento WHERE DepartamentoId = @DepId)
    INSERT INTO dbo.ParametrosTesourariaDepartamento (DepartamentoId) VALUES (@DepId);
GO
