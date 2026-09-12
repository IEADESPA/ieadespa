-- ============================================================
-- Migração 072 — v4.22: Doações, Integridade e PLD-FT.
-- Lei 9.613/1998 (PLD-FT) e GAFI Recomendação 8 tratam organizações sem
-- fins lucrativos como setor de risco — o ponto sensível é a movimentação
-- EM ESPÉCIE. Lei 12.846/2013 (alcança associações/fundações) + Decreto
-- 11.129/2022: programa de integridade com código de conduta, due
-- diligence de fornecedor e declaração de conflito de interesses por
-- dirigente, renovada por mandato.
-- ============================================================

-- Limite de valor a partir do qual a identificação do doador é obrigatória
-- — entra no catálogo de valores monetários (v4.17), corrigível junto com
-- os demais tetos/parâmetros, nunca hardcoded no código da Function.
INSERT INTO dbo.ValoresMonetarios (Sigla, Nome, Valor, Indexador, Unidade, DataUltimaCorrecao)
SELECT v.Sigla, v.Nome, v.Valor, v.Indexador, v.Unidade, CAST(SYSUTCDATETIME() AS DATE) FROM (VALUES
    ('LIMITE_IDENTIFICACAO_DOADOR', 'Limite p/ identificação obrigatória do doador (v4.22, PLD-FT)', 2000.00, 'IPCA', 'R$')
) AS v(Sigla, Nome, Valor, Indexador, Unidade)
WHERE NOT EXISTS (SELECT 1 FROM dbo.ValoresMonetarios vm WHERE vm.Sigla = v.Sigla);
GO

-- Doações — cada uma já nasce com o recibo numerado (protocolo local por
-- enquanto: DOA-{ano}-{sequencial}; será substituído pelo protocolo único
-- da vB.4 quando essa fase existir, sem quebrar o número já emitido).
-- Doador (nome + CPF/CNPJ) só é obrigatório acima do limite do catálogo.
IF OBJECT_ID(N'dbo.Doacoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Doacoes (
        DoacaoId          INT IDENTITY PRIMARY KEY,
        CongregacaoId     INT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        Valor             DECIMAL(12,2) NOT NULL,
        FormaPagamento    NVARCHAR(20) NOT NULL, -- ESPECIE | PIX | TRANSFERENCIA | CHEQUE | OUTROS
        DataRecebimento   DATE NOT NULL,
        DoadorNome        NVARCHAR(200) NULL,
        DoadorCpfCnpj     NVARCHAR(20) NULL,
        NumeroRecibo      NVARCHAR(50) NOT NULL UNIQUE,
        RegistradoPor     INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- NifSinalizacoes (v4.12) ganha um vínculo opcional com Doacoes — o NIF
-- passa a receber sinalização automática de doação atípica/fracionada,
-- não só de saídas/fornecedores.
IF COL_LENGTH('dbo.NifSinalizacoes', 'DoacaoId') IS NULL
BEGIN
    ALTER TABLE dbo.NifSinalizacoes ADD DoacaoId INT NULL REFERENCES dbo.Doacoes(DoacaoId);
END
GO

-- Políticas institucionais aprovadas em ata (política de doações, código
-- de conduta do programa de integridade). Documento único reaproveitável
-- por tipo — cada aceite de membro (CodigoCondutaAceites) referencia a
-- versão vigente no momento do aceite.
IF OBJECT_ID(N'dbo.PoliticasInstitucionais', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PoliticasInstitucionais (
        PoliticaId       INT IDENTITY PRIMARY KEY,
        Tipo             NVARCHAR(30) NOT NULL, -- DOACOES | CODIGO_CONDUTA
        Titulo           NVARCHAR(200) NOT NULL,
        DocumentoUrl     NVARCHAR(500) NULL,
        AtaReferencia    NVARCHAR(200) NOT NULL, -- número/data da ata que aprovou (obrigatório — "aprovada em ata")
        DataAprovacao    DATE NOT NULL,
        Vigente          BIT NOT NULL DEFAULT 1,
        RegistradoPor    INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm         DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Aceite individual do Código de Conduta — canal de denúncia declarado
-- formalmente como a Ouvidoria já existente (v3.7), sem duplicar mecanismo.
IF OBJECT_ID(N'dbo.CodigoCondutaAceites', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CodigoCondutaAceites (
        AceiteId       INT IDENTITY PRIMARY KEY,
        MembroId       INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        PoliticaId     INT NOT NULL REFERENCES dbo.PoliticasInstitucionais(PoliticaId),
        DataAceite     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_Aceite_Membro_Politica UNIQUE (MembroId, PoliticaId)
    );
END
GO

-- Due diligence de fornecedor (v4.5) antes do cadastro virar apto a
-- pagamento — 1:1 com Fornecedores.
IF OBJECT_ID(N'dbo.FornecedoresDueDiligence', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FornecedoresDueDiligence (
        DueDiligenceId   INT IDENTITY PRIMARY KEY,
        FornecedorId     INT NOT NULL UNIQUE REFERENCES dbo.Fornecedores(FornecedorId),
        Status           NVARCHAR(20) NOT NULL DEFAULT 'PENDENTE', -- PENDENTE | APROVADO | REPROVADO
        Observacao       NVARCHAR(500) NULL,
        RealizadoPor     INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DataRealizacao   DATETIME2 NULL,
        RegistradoPor    INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm         DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Declaração de conflito de interesses por dirigente, renovada a cada
-- mandato (MandatoReferencia, ex: '2026-2028') — uma por dirigente/mandato.
IF OBJECT_ID(N'dbo.DeclaracoesConflitoInteresse', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DeclaracoesConflitoInteresse (
        DeclaracaoId       INT IDENTITY PRIMARY KEY,
        MembroId           INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        MandatoReferencia  NVARCHAR(20) NOT NULL,
        TemConflito        BIT NOT NULL DEFAULT 0,
        DescricaoConflito  NVARCHAR(500) NULL,
        DataDeclaracao     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        RegistradoPor      INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CONSTRAINT UQ_Declaracao_Membro_Mandato UNIQUE (MembroId, MandatoReferencia)
    );
END
GO
