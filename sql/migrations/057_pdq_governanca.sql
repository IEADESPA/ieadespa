-- ============================================================
-- Migração 057 — v4.8 (segunda parte): Governança do PDQ (Planejamento
-- Diretor Quadrienal, Regimento Art. 26-30). Plano com 3 eixos
-- estratégicos, metas por eixo, projetos por meta (cronograma físico/
-- financeiro), Fundo de Execução Estratégica (dotação de 10% da
-- arrecadação líquida da Geral, com suspensão excepcional pelo Pastor
-- Presidente — verificado contra o Assento de verdade na Diretoria
-- Executiva, não uma permissão genérica) e remanejamento com cláusula de
-- barreira (acima de 20% exige homologação da CLI, Art. 28).
-- ============================================================

IF OBJECT_ID(N'dbo.PdqPlanos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PdqPlanos (
        PlanoId    INT IDENTITY PRIMARY KEY,
        AnoInicio  INT NOT NULL,
        AnoFim     INT NOT NULL,
        Titulo     NVARCHAR(200) NOT NULL,
        Status     NVARCHAR(20) NOT NULL DEFAULT 'EM_ELABORACAO', -- EM_ELABORACAO | VIGENTE | ENCERRADO
        CriadoPor  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_PdqPlano_Periodo UNIQUE (AnoInicio, AnoFim)
    );
END
GO

-- Sempre exatamente 3 (Art. 26-29) — validado no endpoint, não aqui.
IF OBJECT_ID(N'dbo.PdqEixos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PdqEixos (
        EixoId     INT IDENTITY PRIMARY KEY,
        PlanoId    INT NOT NULL REFERENCES dbo.PdqPlanos(PlanoId),
        Nome       NVARCHAR(200) NOT NULL,
        Descricao  NVARCHAR(500) NULL
    );
END
GO

-- Status "NAO_CUMPRIDA" exige JustificativaTecnica preenchida (Art. 29 §1º
-- — vira relatório de justificativa técnica, nunca infração disciplinar
-- automática).
IF OBJECT_ID(N'dbo.PdqMetas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PdqMetas (
        MetaId               INT IDENTITY PRIMARY KEY,
        EixoId               INT NOT NULL REFERENCES dbo.PdqEixos(EixoId),
        Descricao            NVARCHAR(300) NOT NULL,
        Indicador            NVARCHAR(300) NULL,
        PrazoAno             INT NOT NULL,
        Status               NVARCHAR(20) NOT NULL DEFAULT 'EM_ANDAMENTO', -- EM_ANDAMENTO | CUMPRIDA | NAO_CUMPRIDA
        JustificativaTecnica NVARCHAR(1000) NULL
    );
END
GO

-- Projeto concreto que executa uma meta — cronograma físico (datas) e
-- financeiro (orçamento previsto); status de atraso é CALCULADO NA
-- LEITURA (hoje > CronogramaFim e ainda não concluído), nunca marcado à
-- mão.
IF OBJECT_ID(N'dbo.PdqProjetos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PdqProjetos (
        ProjetoId          INT IDENTITY PRIMARY KEY,
        MetaId             INT NOT NULL REFERENCES dbo.PdqMetas(MetaId),
        Nome               NVARCHAR(200) NOT NULL,
        Descricao          NVARCHAR(500) NULL,
        OrcamentoPrevisto  DECIMAL(12,2) NOT NULL,
        CronogramaInicio   DATE NOT NULL,
        CronogramaFim      DATE NOT NULL,
        ResponsavelMembroId INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Status             NVARCHAR(20) NOT NULL DEFAULT 'PLANEJADO', -- PLANEJADO | EM_EXECUCAO | CONCLUIDO | CANCELADO
        CriadoPor          INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm           DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Remanejamento entre projetos — até 20% do orçamento do projeto de
-- origem é aprovado automaticamente; acima disso fica PENDENTE_CLI até
-- homologação (cláusula de barreira, Art. 28).
IF OBJECT_ID(N'dbo.PdqRemanejamentos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PdqRemanejamentos (
        RemanejamentoId  INT IDENTITY PRIMARY KEY,
        ProjetoOrigemId  INT NOT NULL REFERENCES dbo.PdqProjetos(ProjetoId),
        ProjetoDestinoId INT NOT NULL REFERENCES dbo.PdqProjetos(ProjetoId),
        Valor            DECIMAL(12,2) NOT NULL,
        PercentualOrigem DECIMAL(5,2) NOT NULL,
        Status           NVARCHAR(20) NOT NULL DEFAULT 'APROVADO_AUTOMATICO', -- APROVADO_AUTOMATICO | PENDENTE_CLI | HOMOLOGADO | REJEITADO
        SolicitadoPor    INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        SolicitadoEm     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        HomologadoPor    INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        HomologadoEm     DATETIME2 NULL,
        MotivoRejeicao   NVARCHAR(300) NULL
    );
END
GO

-- Fundo de Execução Estratégica não tem saldo próprio gravado — é 10% da
-- arrecadação líquida da Geral (shared/tesouraria.js::saldoCentroCusto
-- estendido pro centroCusto 'PDQ'), sempre calculado na leitura. Esta
-- tabela só guarda o registro de suspensão/reativação excepcional.
IF OBJECT_ID(N'dbo.PdqFundoSuspensoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PdqFundoSuspensoes (
        SuspensaoId       INT IDENTITY PRIMARY KEY,
        MotivoSuspensao   NVARCHAR(300) NOT NULL,
        SuspensoPor       INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        SuspensoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        MotivoReativacao  NVARCHAR(300) NULL,
        ReativadoPor      INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ReativadoEm       DATETIME2 NULL
    );
END
GO

-- Conta contábil e categoria de saída próprias pro Fundo de Execução
-- Estratégica (CentroCusto = 'PDQ', terceiro valor além de LOCAL/GERAL —
-- shared/tesouraria.js::saldoCentroCusto trata esse caso à parte).
IF NOT EXISTS (SELECT 1 FROM dbo.PlanoContas WHERE Codigo = '5.1.2')
    INSERT INTO dbo.PlanoContas (Codigo, Nome, Tipo, ContaPaiId)
    SELECT '5.1.2', 'Execução do Planejamento Estratégico (PDQ)', 'DESPESA', ContaId FROM dbo.PlanoContas WHERE Codigo = '5.1';
GO
-- TipoFundo fica LIVRE de propósito: 'RESTRITO' aqui significa "vinculado
-- a uma Campanha" (v4.2/v4.4), que não é o caso do PDQ — a restrição do
-- Fundo de Execução Estratégica é outra (CentroCusto = 'PDQ', dotação de
-- 10% e suspensão excepcional), tratada à parte em shared/tesouraria.js.
IF NOT EXISTS (SELECT 1 FROM dbo.CategoriasSaida WHERE Codigo = 'EXECUCAO_PDQ')
    INSERT INTO dbo.CategoriasSaida (Codigo, Nome, CentroCusto, TipoFundo, ContaContabilId)
    SELECT 'EXECUCAO_PDQ', 'Execução do Planejamento Estratégico (PDQ)', 'PDQ', 'LIVRE', ContaId FROM dbo.PlanoContas WHERE Codigo = '5.1.2';
GO
