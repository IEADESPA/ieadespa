-- ============================================================
-- Migração 073 — v4.23: Frota de veículos.
-- O Regimento trata frota com nível de detalhe que não tinha onde morar
-- no sistema — inclusive transferindo responsabilidade pessoal ao
-- condutor (Art. 155). Veículo é BensPatrimoniais Tipo = VEICULO (v4.11);
-- aqui entra o que é específico de frota, não de patrimônio genérico.
-- ============================================================

-- Categoria de Saída específica de combustível — vira bloqueio real no
-- Contas a Pagar (v4.5), não só aviso (Art. 155 §3º).
IF NOT EXISTS (SELECT 1 FROM dbo.CategoriasSaida WHERE Codigo = 'COMBUSTIVEL')
    INSERT INTO dbo.CategoriasSaida (Codigo, Nome, CentroCusto, TipoFundo, ContaContabilId)
    SELECT 'COMBUSTIVEL', 'Combustível (frota — veículo presidencial)', 'GERAL', 'LIVRE', ContaId FROM dbo.PlanoContas WHERE Codigo = '5.2.2';
GO

-- SaidasTesouraria (v4.5) ganha vínculo opcional com o veículo (BemId) e a
-- confirmação estrutural de que a nota fiscal saiu no CNPJ da Igreja (Art.
-- 155 §3º, I) — sem parsing de PDF, é uma confirmação explícita no
-- formulário, igual a outras confirmações já usadas no sistema (ex.: lista
-- musical aprovada da v4.18).
IF COL_LENGTH('dbo.SaidasTesouraria', 'BemId') IS NULL
BEGIN
    ALTER TABLE dbo.SaidasTesouraria ADD BemId INT NULL REFERENCES dbo.BensPatrimoniais(BemId);
END
GO
IF COL_LENGTH('dbo.SaidasTesouraria', 'NotaFiscalCnpjIgrejaConfirmado') IS NULL
BEGIN
    ALTER TABLE dbo.SaidasTesouraria ADD NotaFiscalCnpjIgrejaConfirmado BIT NULL;
END
GO

-- Dados específicos de frota — 1:1 com BensPatrimoniais (Tipo = VEICULO).
-- Identificação visual é obrigatória (Art. 155 §1º, II) — sem foto, o
-- veículo fica marcado como pendência.
IF OBJECT_ID(N'dbo.VeiculosFrota', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.VeiculosFrota (
        VeiculoFrotaId          INT IDENTITY PRIMARY KEY,
        BemId                   INT NOT NULL UNIQUE REFERENCES dbo.BensPatrimoniais(BemId),
        Placa                   NVARCHAR(10) NOT NULL UNIQUE,
        IdentificacaoVisualUrl  NVARCHAR(500) NULL, -- foto do veículo já identificado (Art. 155 §1º, II)
        EhVeiculoPresidencial   BIT NOT NULL DEFAULT 0, -- único elegível a custeio de combustível (Art. 155 §3º, I)
        LicenciamentoVencimento DATE NULL,
        RegistradoPor           INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm                DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Termo de Autorização de Condução por missão específica (Art. 155 §2º, I)
-- — sem termo ATIVO e CNH vigente na data da missão, o veículo não sai
-- (checado na retirada de chave abaixo).
IF OBJECT_ID(N'dbo.TermosAutorizacaoConducao', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TermosAutorizacaoConducao (
        TermoId           INT IDENTITY PRIMARY KEY,
        BemId             INT NOT NULL REFERENCES dbo.BensPatrimoniais(BemId),
        CondutorMembroId  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CnhNumero         NVARCHAR(30) NOT NULL,
        CnhValidade       DATE NOT NULL,
        MissaoDescricao   NVARCHAR(300) NOT NULL,
        DataInicioMissao  DATE NOT NULL,
        DataFimPrevista   DATE NOT NULL,
        Status            NVARCHAR(20) NOT NULL DEFAULT 'ATIVO', -- ATIVO | ENCERRADO | CANCELADO
        RegistradoPor     INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Livro de retirada de chaves (Art. 155 §2º, II-III): sustenta a
-- transferência de multa/pontos e de franquia/conserto por imprudência ao
-- condutor que retirou o veículo.
IF OBJECT_ID(N'dbo.RetiradasChave', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RetiradasChave (
        RetiradaId                     INT IDENTITY PRIMARY KEY,
        TermoAutorizacaoId             INT NOT NULL REFERENCES dbo.TermosAutorizacaoConducao(TermoId),
        BemId                          INT NOT NULL REFERENCES dbo.BensPatrimoniais(BemId),
        CondutorMembroId               INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DataHoraRetirada               DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        DataHoraDevolucao              DATETIME2 NULL,
        MultaTransferidaCondutor       BIT NOT NULL DEFAULT 1, -- Art. 155 §2º, II
        CustoConsertoImprudenciaValor  DECIMAL(10,2) NULL,     -- Art. 155 §2º, III — franquia/conserto por conta do condutor
        Observacao                     NVARCHAR(300) NULL,
        RegistradoPor                  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm                       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Manutenção preventiva/corretiva por veículo — licenciamento e seguro já
-- vivem em VeiculosFrota.LicenciamentoVencimento e em ApolicesSeguro
-- (v4.16, via BemId), alerta de vencimento calculado na leitura pra todos.
IF OBJECT_ID(N'dbo.ManutencoesVeiculo', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ManutencoesVeiculo (
        ManutencaoId    INT IDENTITY PRIMARY KEY,
        BemId           INT NOT NULL REFERENCES dbo.BensPatrimoniais(BemId),
        TipoManutencao  NVARCHAR(20) NOT NULL, -- PREVENTIVA | CORRETIVA
        DataAgendada    DATE NOT NULL,
        DataRealizada   DATE NULL,
        Descricao       NVARCHAR(300) NOT NULL,
        Valor           DECIMAL(10,2) NULL,
        RegistradoPor   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO
