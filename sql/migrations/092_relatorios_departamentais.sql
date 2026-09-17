-- ============================================================
-- Migração 092 — v5.2: Relatórios Departamentais (formulário dinâmico)
--
-- Fonte: protótipo conceitual `relatorios-departamentos` (planilhas reais
-- em PDF dos 8 departamentos/secretarias, ver README FASE 5). Cada
-- departamento tem um SchemaRelatorioDepartamental versionado (muda de
-- campo no meio do ano sem afetar relatório já enviado, mesmo princípio da
-- vB.15/Texto Mestre) com CamposFormularioDepartamental próprios — mas
-- Eventos e Integração são IDÊNTICOS nos 8, por isso viram colunas fixas em
-- RelatoriosDepartamentais em vez de linhas repetidas por tipo.
--
-- "Total do Local" (citado no protótipo) fica de fora de propósito: sem a
-- planilha física em mãos pra confirmar a fórmula exata por departamento
-- (quais campos entram na soma), calcular errado seria pior que não
-- calcular — fica como limitação documentada, não fabricada.
--
-- Lideranca.DepartamentoId (nullable, aditiva): quando NULL, o papel
-- enxerga todos os departamentos daquele escopo territorial (Dirigente de
-- Congregação, Pastor de Área — sem mudança de comportamento); quando
-- preenchido, restringe a um departamento só (Líder Local, Líder de Área
-- do departamento — papéis novos que o protótipo modela).
--
-- CamposFormularioDepartamental.PermiteSemanal é POR CAMPO, não por schema:
-- na EBD, Presentes/Ausentes/Visitantes/EBDs Realizadas/Alunos Visitados/
-- Bíblias/Revistas são lançados domingo a domingo e somam no mês (Comport.
-- FLUXO), mas Alunos Matriculados é ESTADO (roster que não "soma" — não faz
-- sentido semanal, então fica de fora). "O schema tem modo semanal" nunca
-- vira coluna própria — é sempre calculado (algum campo com PermiteSemanal
-- = 1), pra nunca destoar do que os campos realmente dizem.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.SchemasRelatorioDepartamental', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SchemasRelatorioDepartamental (
        SchemaRelatorioId    INT IDENTITY PRIMARY KEY,
        DepartamentoId       INT NOT NULL REFERENCES dbo.Departamentos(DepartamentoId),
        DataVigenciaInicio   DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
        DataVigenciaFim      DATE NULL,
        RotuloPapelLocal     NVARCHAR(60) NOT NULL DEFAULT 'Líder Local',
        CriadoEm             DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.CamposFormularioDepartamental', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CamposFormularioDepartamental (
        CampoFormularioId  INT IDENTITY PRIMARY KEY,
        SchemaRelatorioId  INT NOT NULL REFERENCES dbo.SchemasRelatorioDepartamental(SchemaRelatorioId),
        NomeCampo          NVARCHAR(60) NOT NULL,   -- chave usada pelo front (camelCase)
        Rotulo             NVARCHAR(150) NOT NULL,
        Grupo              NVARCHAR(20) NOT NULL,   -- CONTAGEM | ACOES | FINANCEIRO
        Comportamento      NVARCHAR(10) NOT NULL,   -- ESTADO (pré-preenche) | FLUXO (zera)
        TipoDado           NVARCHAR(20) NOT NULL DEFAULT 'INTEIRO', -- INTEIRO | MOEDA
        PermiteSemanal     BIT NOT NULL DEFAULT 0,  -- só campos da EBD lançados domingo a domingo
        Ordem              INT NOT NULL DEFAULT 0,
        CONSTRAINT UQ_CamposFormularioDepartamental UNIQUE (SchemaRelatorioId, NomeCampo)
    );
END
GO

IF OBJECT_ID(N'dbo.RelatoriosDepartamentais', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RelatoriosDepartamentais (
        RelatorioDepartamentalId  INT IDENTITY PRIMARY KEY,
        CongregacaoId             INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        DepartamentoId            INT NOT NULL REFERENCES dbo.Departamentos(DepartamentoId),
        MesReferencia             INT NOT NULL CHECK (MesReferencia BETWEEN 1 AND 12),
        AnoReferencia             INT NOT NULL,
        SchemaRelatorioId         INT NOT NULL REFERENCES dbo.SchemasRelatorioDepartamental(SchemaRelatorioId),
        Status                    NVARCHAR(20) NOT NULL DEFAULT 'RASCUNHO',
        -- RASCUNHO | ENVIADO | APROVADO_AREA | APROVADO_GERAL | RETIFICADO (fluxo real: v5.3)
        Atrasado                  BIT NOT NULL DEFAULT 0,
        -- Bloco Eventos (idêntico nos 8 departamentos — colunas fixas, não repetidas por schema)
        EventosLocal              INT NOT NULL DEFAULT 0,
        EventosArea               INT NOT NULL DEFAULT 0,
        EventosGeral              INT NOT NULL DEFAULT 0,
        -- Bloco Integração (idêntico nos 8 departamentos)
        IntegracaoConversao       INT NOT NULL DEFAULT 0,
        IntegracaoReconciliacao   INT NOT NULL DEFAULT 0,
        IntegracaoDeOutraIgreja   INT NOT NULL DEFAULT 0,
        CriadoPor                 INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DataEnvio                 DATETIME2 NULL,
        CriadoEm                  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        AtualizadoEm              DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_RelatoriosDepartamentais UNIQUE (CongregacaoId, DepartamentoId, MesReferencia, AnoReferencia)
    );
END
GO

IF OBJECT_ID(N'dbo.ValoresCampoRelatorioDepartamental', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ValoresCampoRelatorioDepartamental (
        ValorId                   INT IDENTITY PRIMARY KEY,
        RelatorioDepartamentalId  INT NOT NULL REFERENCES dbo.RelatoriosDepartamentais(RelatorioDepartamentalId),
        CampoFormularioId         INT NOT NULL REFERENCES dbo.CamposFormularioDepartamental(CampoFormularioId),
        NumeroDomingo             INT NULL CHECK (NumeroDomingo BETWEEN 1 AND 5), -- só EBD; NULL = valor mensal
        Valor                     DECIMAL(14,2) NOT NULL DEFAULT 0,
        CONSTRAINT UQ_ValoresCampoRelatorioDepartamental UNIQUE (RelatorioDepartamentalId, CampoFormularioId, NumeroDomingo)
    );
END
GO

IF OBJECT_ID(N'dbo.ContribuintesMensalidadeDepartamental', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ContribuintesMensalidadeDepartamental (
        ContribuinteId            INT IDENTITY PRIMARY KEY,
        RelatorioDepartamentalId  INT NOT NULL REFERENCES dbo.RelatoriosDepartamentais(RelatorioDepartamentalId),
        Nome                      NVARCHAR(150) NOT NULL,
        Valor                     DECIMAL(14,2) NOT NULL,
        Ordem                     INT NOT NULL DEFAULT 0
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Lideranca') AND name = 'DepartamentoId')
    ALTER TABLE dbo.Lideranca ADD DepartamentoId INT NULL REFERENCES dbo.Departamentos(DepartamentoId);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'relatorios_departamentais')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('relatorios_departamentais', 'Relatórios de Departamentos e Secretarias');
GO

-- ============================================================
-- Seed dos 8 SchemaRelatorioDepartamental + CamposFormularioDepartamental,
-- um bloco por departamento, cada um só inserido se aquele DepartamentoId
-- ainda não tiver nenhum schema (idempotente — reexecutar não duplica).
-- ============================================================

DECLARE @DepId INT, @SchemaId INT;

-- 01 — UCADESPA (Crianças)
SELECT @DepId = DepartamentoId FROM dbo.Departamentos WHERE Sigla = 'UCADESPA';
IF @DepId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.SchemasRelatorioDepartamental WHERE DepartamentoId = @DepId)
BEGIN
    INSERT INTO dbo.SchemasRelatorioDepartamental (DepartamentoId) VALUES (@DepId);
    SET @SchemaId = SCOPE_IDENTITY();
    INSERT INTO dbo.CamposFormularioDepartamental (SchemaRelatorioId, NomeCampo, Rotulo, Grupo, Comportamento, TipoDado, Ordem) VALUES
    (@SchemaId, 'congregados', 'Congregados', 'CONTAGEM', 'ESTADO', 'INTEIRO', 1),
    (@SchemaId, 'visitantes', 'Visitantes', 'CONTAGEM', 'FLUXO', 'INTEIRO', 2),
    (@SchemaId, 'casasVisitadas', 'Casas Visitadas', 'ACOES', 'FLUXO', 'INTEIRO', 3),
    (@SchemaId, 'criancasEvangelizadas', 'Crianças Evangelizadas', 'ACOES', 'FLUXO', 'INTEIRO', 4),
    (@SchemaId, 'oracoesNormais', 'Orações Normais', 'ACOES', 'FLUXO', 'INTEIRO', 5),
    (@SchemaId, 'extras', 'Extras', 'ACOES', 'FLUXO', 'INTEIRO', 6),
    (@SchemaId, 'mensalidades', 'Mensalidades', 'FINANCEIRO', 'FLUXO', 'MOEDA', 7),
    (@SchemaId, 'ofertas', 'Ofertas', 'FINANCEIRO', 'FLUXO', 'MOEDA', 8),
    (@SchemaId, 'campanhas', 'Campanhas', 'FINANCEIRO', 'FLUXO', 'MOEDA', 9),
    (@SchemaId, 'outros', 'Outros', 'FINANCEIRO', 'FLUXO', 'MOEDA', 10);
END

-- 02 — UMADESPA (Mocidade)
SELECT @DepId = DepartamentoId FROM dbo.Departamentos WHERE Sigla = 'UMADESPA';
IF @DepId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.SchemasRelatorioDepartamental WHERE DepartamentoId = @DepId)
BEGIN
    INSERT INTO dbo.SchemasRelatorioDepartamental (DepartamentoId) VALUES (@DepId);
    SET @SchemaId = SCOPE_IDENTITY();
    INSERT INTO dbo.CamposFormularioDepartamental (SchemaRelatorioId, NomeCampo, Rotulo, Grupo, Comportamento, TipoDado, Ordem) VALUES
    (@SchemaId, 'membrosEmComunhao', 'Membros em Comunhão', 'CONTAGEM', 'ESTADO', 'INTEIRO', 1),
    (@SchemaId, 'membrosSemComunhao', 'Membros sem Comunhão', 'CONTAGEM', 'ESTADO', 'INTEIRO', 2),
    (@SchemaId, 'congregados', 'Congregados', 'CONTAGEM', 'ESTADO', 'INTEIRO', 3),
    (@SchemaId, 'casasVisitadas', 'Casas Visitadas', 'ACOES', 'FLUXO', 'INTEIRO', 4),
    (@SchemaId, 'jovensEvangelizados', 'Jovens Evangelizados', 'ACOES', 'FLUXO', 'INTEIRO', 5),
    (@SchemaId, 'oracoesNormais', 'Orações Normais', 'ACOES', 'FLUXO', 'INTEIRO', 6),
    (@SchemaId, 'extras', 'Extras', 'ACOES', 'FLUXO', 'INTEIRO', 7),
    (@SchemaId, 'mensalidades', 'Mensalidades', 'FINANCEIRO', 'FLUXO', 'MOEDA', 8),
    (@SchemaId, 'ofertas', 'Ofertas', 'FINANCEIRO', 'FLUXO', 'MOEDA', 9),
    (@SchemaId, 'campanhas', 'Campanhas', 'FINANCEIRO', 'FLUXO', 'MOEDA', 10),
    (@SchemaId, 'outros', 'Outros', 'FINANCEIRO', 'FLUXO', 'MOEDA', 11);
END

-- 03 — USADESPA (Senhoras)
SELECT @DepId = DepartamentoId FROM dbo.Departamentos WHERE Sigla = 'USADESPA';
IF @DepId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.SchemasRelatorioDepartamental WHERE DepartamentoId = @DepId)
BEGIN
    INSERT INTO dbo.SchemasRelatorioDepartamental (DepartamentoId) VALUES (@DepId);
    SET @SchemaId = SCOPE_IDENTITY();
    INSERT INTO dbo.CamposFormularioDepartamental (SchemaRelatorioId, NomeCampo, Rotulo, Grupo, Comportamento, TipoDado, Ordem) VALUES
    (@SchemaId, 'membrosEmComunhao', 'Membros em Comunhão', 'CONTAGEM', 'ESTADO', 'INTEIRO', 1),
    (@SchemaId, 'membrosSemComunhao', 'Membros sem Comunhão', 'CONTAGEM', 'ESTADO', 'INTEIRO', 2),
    (@SchemaId, 'congregados', 'Congregados', 'CONTAGEM', 'ESTADO', 'INTEIRO', 3),
    (@SchemaId, 'matriculadas', 'Matriculadas', 'CONTAGEM', 'ESTADO', 'INTEIRO', 4),
    (@SchemaId, 'naoMatriculada', 'Não Matriculada', 'CONTAGEM', 'ESTADO', 'INTEIRO', 5),
    (@SchemaId, 'casasVisitadas', 'Casas Visitadas', 'ACOES', 'FLUXO', 'INTEIRO', 6),
    (@SchemaId, 'tardeDeLouvor', 'Tarde de Louvor', 'ACOES', 'FLUXO', 'INTEIRO', 7),
    (@SchemaId, 'oracoesNormais', 'Orações Normais', 'ACOES', 'FLUXO', 'INTEIRO', 8),
    (@SchemaId, 'extras', 'Extras', 'ACOES', 'FLUXO', 'INTEIRO', 9),
    (@SchemaId, 'mensalidades', 'Mensalidades', 'FINANCEIRO', 'FLUXO', 'MOEDA', 10),
    (@SchemaId, 'ofertas', 'Ofertas', 'FINANCEIRO', 'FLUXO', 'MOEDA', 11),
    (@SchemaId, 'campanhas', 'Campanhas', 'FINANCEIRO', 'FLUXO', 'MOEDA', 12),
    (@SchemaId, 'outros', 'Outros', 'FINANCEIRO', 'FLUXO', 'MOEDA', 13);
END

-- 04 — UHADESPA (Homens)
SELECT @DepId = DepartamentoId FROM dbo.Departamentos WHERE Sigla = 'UHADESPA';
IF @DepId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.SchemasRelatorioDepartamental WHERE DepartamentoId = @DepId)
BEGIN
    INSERT INTO dbo.SchemasRelatorioDepartamental (DepartamentoId) VALUES (@DepId);
    SET @SchemaId = SCOPE_IDENTITY();
    INSERT INTO dbo.CamposFormularioDepartamental (SchemaRelatorioId, NomeCampo, Rotulo, Grupo, Comportamento, TipoDado, Ordem) VALUES
    (@SchemaId, 'membrosEmComunhao', 'Membros em Comunhão', 'CONTAGEM', 'ESTADO', 'INTEIRO', 1),
    (@SchemaId, 'membrosSemComunhao', 'Membros sem Comunhão', 'CONTAGEM', 'ESTADO', 'INTEIRO', 2),
    (@SchemaId, 'congregados', 'Congregados', 'CONTAGEM', 'ESTADO', 'INTEIRO', 3),
    (@SchemaId, 'matriculados', 'Matriculados', 'CONTAGEM', 'ESTADO', 'INTEIRO', 4),
    (@SchemaId, 'naoMatriculado', 'Não Matriculado', 'CONTAGEM', 'ESTADO', 'INTEIRO', 5),
    (@SchemaId, 'casasVisitadas', 'Casas Visitadas', 'ACOES', 'FLUXO', 'INTEIRO', 6),
    (@SchemaId, 'tardeDeLouvor', 'Tarde de Louvor', 'ACOES', 'FLUXO', 'INTEIRO', 7),
    (@SchemaId, 'oracoesNormais', 'Orações Normais', 'ACOES', 'FLUXO', 'INTEIRO', 8),
    (@SchemaId, 'extras', 'Extras', 'ACOES', 'FLUXO', 'INTEIRO', 9),
    (@SchemaId, 'mensalidades', 'Mensalidades', 'FINANCEIRO', 'FLUXO', 'MOEDA', 10),
    (@SchemaId, 'ofertas', 'Ofertas', 'FINANCEIRO', 'FLUXO', 'MOEDA', 11),
    (@SchemaId, 'campanhas', 'Campanhas', 'FINANCEIRO', 'FLUXO', 'MOEDA', 12),
    (@SchemaId, 'outros', 'Outros', 'FINANCEIRO', 'FLUXO', 'MOEDA', 13);
END

-- 05 — SEMIADESPA (Missões)
SELECT @DepId = DepartamentoId FROM dbo.Departamentos WHERE Sigla = 'SEMIADESPA';
IF @DepId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.SchemasRelatorioDepartamental WHERE DepartamentoId = @DepId)
BEGIN
    INSERT INTO dbo.SchemasRelatorioDepartamental (DepartamentoId) VALUES (@DepId);
    SET @SchemaId = SCOPE_IDENTITY();
    INSERT INTO dbo.CamposFormularioDepartamental (SchemaRelatorioId, NomeCampo, Rotulo, Grupo, Comportamento, TipoDado, Ordem) VALUES
    (@SchemaId, 'bibliasDistribuidas', 'Bíblias Distribuídas', 'CONTAGEM', 'FLUXO', 'INTEIRO', 1),
    (@SchemaId, 'folhetosDistribuidos', 'Folhetos Distribuídos', 'CONTAGEM', 'FLUXO', 'INTEIRO', 2),
    (@SchemaId, 'outrasLiteraturas', 'Outras Literaturas', 'CONTAGEM', 'FLUXO', 'INTEIRO', 3),
    (@SchemaId, 'pessoasDiscipuladoI', 'Pessoas no Discipulado I', 'CONTAGEM', 'ESTADO', 'INTEIRO', 4),
    (@SchemaId, 'pessoasDiscipuladoII', 'Pessoas no Discipulado II', 'CONTAGEM', 'ESTADO', 'INTEIRO', 5),
    (@SchemaId, 'casasVisitadas', 'Casas Visitadas', 'ACOES', 'FLUXO', 'INTEIRO', 6),
    (@SchemaId, 'pessoasEvangelizadas', 'Número de Pessoas Evangelizadas', 'ACOES', 'FLUXO', 'INTEIRO', 7),
    (@SchemaId, 'numeroEvangelismos', 'Número de Evangelismos', 'ACOES', 'FLUXO', 'INTEIRO', 8),
    (@SchemaId, 'cultosEvangelisticos', 'Cultos Evangelísticos', 'ACOES', 'FLUXO', 'INTEIRO', 9),
    (@SchemaId, 'mensalidades', 'Mensalidades', 'FINANCEIRO', 'FLUXO', 'MOEDA', 10),
    (@SchemaId, 'ofertas', 'Ofertas', 'FINANCEIRO', 'FLUXO', 'MOEDA', 11),
    (@SchemaId, 'campanhas', 'Campanhas', 'FINANCEIRO', 'FLUXO', 'MOEDA', 12),
    (@SchemaId, 'outros', 'Outros', 'FINANCEIRO', 'FLUXO', 'MOEDA', 13);
END

-- 06 — AÇÃO DA FÉ (Ação Social) — 18 itens rastreados individualmente (KG/qtd)
SELECT @DepId = DepartamentoId FROM dbo.Departamentos WHERE Sigla = 'ACAO_DA_FE';
IF @DepId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.SchemasRelatorioDepartamental WHERE DepartamentoId = @DepId)
BEGIN
    INSERT INTO dbo.SchemasRelatorioDepartamental (DepartamentoId) VALUES (@DepId);
    SET @SchemaId = SCOPE_IDENTITY();
    INSERT INTO dbo.CamposFormularioDepartamental (SchemaRelatorioId, NomeCampo, Rotulo, Grupo, Comportamento, TipoDado, Ordem) VALUES
    (@SchemaId, 'cestas', 'Cestas', 'CONTAGEM', 'FLUXO', 'INTEIRO', 1),
    (@SchemaId, 'pesoDaCesta', 'Peso da Cesta (KG)', 'CONTAGEM', 'FLUXO', 'INTEIRO', 2),
    (@SchemaId, 'entradaDeAlimentos', 'Entrada de Alimentos (KG)', 'CONTAGEM', 'FLUXO', 'INTEIRO', 3),
    (@SchemaId, 'saidaDeAlimentos', 'Saída de Alimentos (KG)', 'CONTAGEM', 'FLUXO', 'INTEIRO', 4),
    (@SchemaId, 'itemArroz', 'Arroz (KG)', 'CONTAGEM', 'FLUXO', 'INTEIRO', 5),
    (@SchemaId, 'itemFeijao', 'Feijão (KG)', 'CONTAGEM', 'FLUXO', 'INTEIRO', 6),
    (@SchemaId, 'itemOleo', 'Óleo (KG)', 'CONTAGEM', 'FLUXO', 'INTEIRO', 7),
    (@SchemaId, 'itemAcucar', 'Açúcar (KG)', 'CONTAGEM', 'FLUXO', 'INTEIRO', 8),
    (@SchemaId, 'itemSal', 'Sal (KG)', 'CONTAGEM', 'FLUXO', 'INTEIRO', 9),
    (@SchemaId, 'itemCafe', 'Café (KG)', 'CONTAGEM', 'FLUXO', 'INTEIRO', 10),
    (@SchemaId, 'itemMacarrao', 'Macarrão (KG)', 'CONTAGEM', 'FLUXO', 'INTEIRO', 11),
    (@SchemaId, 'itemExtratoTomate', 'Extrato de Tomate (KG)', 'CONTAGEM', 'FLUXO', 'INTEIRO', 12),
    (@SchemaId, 'itemSardinha', 'Sardinha (KG)', 'CONTAGEM', 'FLUXO', 'INTEIRO', 13),
    (@SchemaId, 'itemFlocao', 'Flocão (KG)', 'CONTAGEM', 'FLUXO', 'INTEIRO', 14),
    (@SchemaId, 'itemFarinha', 'Farinha (KG)', 'CONTAGEM', 'FLUXO', 'INTEIRO', 15),
    (@SchemaId, 'itemBiscoito', 'Biscoito (KG)', 'CONTAGEM', 'FLUXO', 'INTEIRO', 16),
    (@SchemaId, 'itemPapelHigienico', 'Papel Higiênico', 'CONTAGEM', 'FLUXO', 'INTEIRO', 17),
    (@SchemaId, 'itemSabaoEmPo', 'Sabão em Pó', 'CONTAGEM', 'FLUXO', 'INTEIRO', 18),
    (@SchemaId, 'itemCremeDental', 'Creme Dental', 'CONTAGEM', 'FLUXO', 'INTEIRO', 19),
    (@SchemaId, 'itemSabonete', 'Sabonete', 'CONTAGEM', 'FLUXO', 'INTEIRO', 20),
    (@SchemaId, 'itemBarraDeSabao', 'Barra de Sabão', 'CONTAGEM', 'FLUXO', 'INTEIRO', 21),
    (@SchemaId, 'itemBuchaDeAluminio', 'Bucha de Alumínio', 'CONTAGEM', 'FLUXO', 'INTEIRO', 22),
    (@SchemaId, 'itemOutrosCesta', 'Outros (item da cesta)', 'CONTAGEM', 'FLUXO', 'INTEIRO', 23),
    (@SchemaId, 'contribuicoes', 'Contribuições', 'FINANCEIRO', 'FLUXO', 'MOEDA', 24),
    (@SchemaId, 'ofertas', 'Ofertas', 'FINANCEIRO', 'FLUXO', 'MOEDA', 25),
    (@SchemaId, 'campanha', 'Campanha', 'FINANCEIRO', 'FLUXO', 'MOEDA', 26),
    (@SchemaId, 'outros', 'Outros', 'FINANCEIRO', 'FLUXO', 'MOEDA', 27);
END

-- 07 — EBD (Escola Bíblica Dominical) — único com granularidade semanal
SELECT @DepId = DepartamentoId FROM dbo.Departamentos WHERE Sigla = 'EBD';
IF @DepId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.SchemasRelatorioDepartamental WHERE DepartamentoId = @DepId)
BEGIN
    INSERT INTO dbo.SchemasRelatorioDepartamental (DepartamentoId, RotuloPapelLocal)
    VALUES (@DepId, 'Superintendente Local');
    SET @SchemaId = SCOPE_IDENTITY();
    -- PermiteSemanal = 1 só nos campos de fato lançados domingo a domingo
    -- (o mês soma as semanas); Alunos Matriculados é roster (ESTADO, não
    -- soma) e Ofertas fica mensal — os dois ficam de fora do modo semanal.
    INSERT INTO dbo.CamposFormularioDepartamental (SchemaRelatorioId, NomeCampo, Rotulo, Grupo, Comportamento, TipoDado, PermiteSemanal, Ordem) VALUES
    (@SchemaId, 'alunosMatriculados', 'Alunos Matriculados', 'CONTAGEM', 'ESTADO', 'INTEIRO', 0, 1),
    (@SchemaId, 'alunosPresentes', 'Alunos Presentes', 'CONTAGEM', 'FLUXO', 'INTEIRO', 1, 2),
    (@SchemaId, 'alunosAusentes', 'Alunos Ausentes', 'CONTAGEM', 'FLUXO', 'INTEIRO', 1, 3),
    (@SchemaId, 'visitantes', 'Visitantes', 'CONTAGEM', 'FLUXO', 'INTEIRO', 1, 4),
    (@SchemaId, 'ebdsRealizadas', 'EBDs Realizadas', 'CONTAGEM', 'FLUXO', 'INTEIRO', 1, 5),
    (@SchemaId, 'alunosVisitados', 'Alunos Visitados', 'CONTAGEM', 'FLUXO', 'INTEIRO', 1, 6),
    (@SchemaId, 'biblias', 'Bíblias', 'CONTAGEM', 'FLUXO', 'INTEIRO', 1, 7),
    (@SchemaId, 'revistas', 'Revistas', 'CONTAGEM', 'FLUXO', 'INTEIRO', 1, 8),
    (@SchemaId, 'acaoSocial', 'Social', 'ACOES', 'FLUXO', 'INTEIRO', 1, 9),
    (@SchemaId, 'acaoProEbd', 'Ação Pró EBD', 'ACOES', 'FLUXO', 'INTEIRO', 1, 10),
    (@SchemaId, 'acaoProIgreja', 'Ação Pró Igreja', 'ACOES', 'FLUXO', 'INTEIRO', 1, 11),
    (@SchemaId, 'ofertas', 'Ofertas', 'FINANCEIRO', 'FLUXO', 'MOEDA', 0, 12);
END

-- 08 — FAMÍLIA
SELECT @DepId = DepartamentoId FROM dbo.Departamentos WHERE Sigla = 'FAMILIA';
IF @DepId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.SchemasRelatorioDepartamental WHERE DepartamentoId = @DepId)
BEGIN
    INSERT INTO dbo.SchemasRelatorioDepartamental (DepartamentoId) VALUES (@DepId);
    SET @SchemaId = SCOPE_IDENTITY();
    INSERT INTO dbo.CamposFormularioDepartamental (SchemaRelatorioId, NomeCampo, Rotulo, Grupo, Comportamento, TipoDado, Ordem) VALUES
    (@SchemaId, 'familiasCrentes', 'Famílias Crentes', 'CONTAGEM', 'ESTADO', 'INTEIRO', 1),
    (@SchemaId, 'familiasComMembrosNaoCrentes', 'Famílias com Membros Não Crentes', 'CONTAGEM', 'ESTADO', 'INTEIRO', 2),
    (@SchemaId, 'familiasComUnicoMembro', 'Famílias com Único Membro', 'CONTAGEM', 'ESTADO', 'INTEIRO', 3),
    (@SchemaId, 'menoresComPaisNaoCrentes', 'Menores de 18 com Pais Não Crentes', 'CONTAGEM', 'ESTADO', 'INTEIRO', 4),
    (@SchemaId, 'casaisComConjugeNaoCrente', 'Casais com Esposo ou Esposa Não Crente', 'CONTAGEM', 'ESTADO', 'INTEIRO', 5),
    (@SchemaId, 'casasVisitadas', 'Casas Visitadas', 'ACOES', 'FLUXO', 'INTEIRO', 6),
    (@SchemaId, 'familiasQueMudaram', 'Famílias que Mudaram', 'ACOES', 'FLUXO', 'INTEIRO', 7),
    (@SchemaId, 'familiasAssistidas', 'Famílias/Casais Assistidos', 'ACOES', 'FLUXO', 'INTEIRO', 8),
    (@SchemaId, 'familiasIntegradas', 'Famílias/Casais Integrados', 'ACOES', 'FLUXO', 'INTEIRO', 9),
    (@SchemaId, 'mensalidades', 'Mensalidades', 'FINANCEIRO', 'FLUXO', 'MOEDA', 10),
    (@SchemaId, 'ofertas', 'Ofertas', 'FINANCEIRO', 'FLUXO', 'MOEDA', 11),
    (@SchemaId, 'campanhas', 'Campanhas', 'FINANCEIRO', 'FLUXO', 'MOEDA', 12),
    (@SchemaId, 'outros', 'Outros', 'FINANCEIRO', 'FLUXO', 'MOEDA', 13);
END
GO
