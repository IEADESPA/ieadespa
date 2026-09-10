-- ============================================================
-- Migração 055 — v4.7: Remessa Bancária (CNAB 240). Gera um único arquivo
-- pra pagar várias Saídas já APROVADAS de uma vez (sobe no banco em vez
-- de PIX/TED um por um) e lê o arquivo de retorno do banco pra atualizar
-- o status automaticamente. Layout estrutural do padrão FEBRABAN — os
-- campos essenciais (banco/valor/favorecido/número de documento pra
-- casar o retorno) são preenchidos de verdade; como todo CNAB 240 exige
-- homologação prévia com o banco específico contratado (cada banco tem
-- particularidades), este é o ponto de partida técnico, não um arquivo
-- já homologado — nunca hardcoded, os dados bancários da denominação
-- ficam em DadosBancariosInstituicao, editáveis.
-- ============================================================

IF OBJECT_ID(N'dbo.DadosBancariosInstituicao', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DadosBancariosInstituicao (
        InstituicaoId   INT NOT NULL PRIMARY KEY CHECK (InstituicaoId = 1),
        RazaoSocial     NVARCHAR(200) NULL,
        Cnpj            VARCHAR(18) NULL,
        CodigoBanco     VARCHAR(3) NULL,
        NomeBanco       NVARCHAR(100) NULL,
        Agencia         VARCHAR(10) NULL,
        DigitoAgencia   VARCHAR(2) NULL,
        Conta           VARCHAR(20) NULL,
        DigitoConta     VARCHAR(2) NULL,
        CodigoConvenio  VARCHAR(20) NULL
    );
    INSERT INTO dbo.DadosBancariosInstituicao (InstituicaoId) VALUES (1);
END
GO

-- Numeração sequencial e contínua do arquivo — mesmo princípio do Termo
-- nº (nunca reinicia, gerado pelo servidor).
IF OBJECT_ID(N'dbo.RemessasBancarias', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RemessasBancarias (
        RemessaId        INT IDENTITY PRIMARY KEY,
        NumeroSequencial INT NOT NULL,
        ArquivoUrl       NVARCHAR(500) NOT NULL,
        ArquivoRetornoUrl NVARCHAR(500) NULL,
        TotalRegistros   INT NOT NULL,
        ValorTotal       DECIMAL(12,2) NOT NULL,
        Status           NVARCHAR(20) NOT NULL DEFAULT 'GERADA', -- GERADA | PROCESSADA
        GeradoPor        INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm         DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        ProcessadoPor    INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ProcessadoEm     DATETIME2 NULL
    );
END
GO

-- Sem UNIQUE em SaidaId: uma Saída que FALHOU numa remessa pode entrar
-- numa remessa seguinte — a exclusão de quem já está PENDENTE/PROCESSADO
-- é feita na seleção de candidatas (GestaoRemessasBancarias), não aqui.
IF OBJECT_ID(N'dbo.RemessaItens', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RemessaItens (
        RemessaItemId  INT IDENTITY PRIMARY KEY,
        RemessaId      INT NOT NULL REFERENCES dbo.RemessasBancarias(RemessaId),
        SaidaId        INT NOT NULL REFERENCES dbo.SaidasTesouraria(SaidaId),
        Status         NVARCHAR(20) NOT NULL DEFAULT 'PENDENTE', -- PENDENTE | PROCESSADO | FALHOU
        MotivoFalha    NVARCHAR(300) NULL,
        ProcessadoEm   DATETIME2 NULL
    );
END
GO
