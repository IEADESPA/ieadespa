-- ============================================================
-- Migração 174 — a ficha do membro por dentro: CPF, filiação, escolaridade e a matrícula gerada pelo sistema (FASE 10, v10.1b, 14/11/2026)
--
-- Decisões do responsável (13/11/2026, plano da fase 10, "As 7 decisões"):
--  - CPF: um campo só, na ficha da pessoa; um por pessoa (índice único que aceita vazio); na tela sempre mascarado; inteiro só para a Secretaria Geral (com a
--    leitura registrada em CpfLeituras) e para a própria pessoa (Meus Dados). A conferência dos dígitos é feita pela API (shared/fichaMembro.js); aqui o banco
--    só garante 11 dígitos.
--  - Filiação: nome da mãe e do pai (vão também para a credencial física e a digital). Escolaridade: lista fixa. Naturalidade e RG não entram.
--  - Juntar fichas repetidas: fica a matrícula mais antiga e o número que sobra vai para o PRÓXIMO cadastro novo (MatriculasLivres). A matrícula da pessoa nova
--    passa a ser gerada pelo sistema: primeiro o menor número livre, senão a maior + 1.
--
-- Idempotente. Só acrescenta: nenhum dado existente muda.
-- ============================================================

IF COL_LENGTH('dbo.MembroReferencia', 'Cpf') IS NULL
    ALTER TABLE dbo.MembroReferencia ADD Cpf CHAR(11) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_MembroReferencia_Cpf')
    ALTER TABLE dbo.MembroReferencia ADD CONSTRAINT CK_MembroReferencia_Cpf CHECK (Cpf IS NULL OR (LEN(Cpf) = 11 AND Cpf NOT LIKE '%[^0-9]%'));
GO
-- Um CPF por pessoa: o índice único só olha quem tem CPF (vazio pode repetir)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_MembroReferencia_Cpf' AND object_id = OBJECT_ID(N'dbo.MembroReferencia'))
    CREATE UNIQUE INDEX UX_MembroReferencia_Cpf ON dbo.MembroReferencia (Cpf) WHERE Cpf IS NOT NULL;
GO

IF COL_LENGTH('dbo.MembroReferencia', 'NomeMae') IS NULL
    ALTER TABLE dbo.MembroReferencia ADD NomeMae NVARCHAR(150) NULL;
GO
IF COL_LENGTH('dbo.MembroReferencia', 'NomePai') IS NULL
    ALTER TABLE dbo.MembroReferencia ADD NomePai NVARCHAR(150) NULL;
GO
IF COL_LENGTH('dbo.MembroReferencia', 'Escolaridade') IS NULL
    ALTER TABLE dbo.MembroReferencia ADD Escolaridade NVARCHAR(30) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_MembroReferencia_Escolaridade')
    ALTER TABLE dbo.MembroReferencia ADD CONSTRAINT CK_MembroReferencia_Escolaridade CHECK (Escolaridade IS NULL OR Escolaridade IN (
        N'FUNDAMENTAL_INCOMPLETO', N'FUNDAMENTAL_COMPLETO', N'MEDIO_INCOMPLETO', N'MEDIO_COMPLETO', N'SUPERIOR_INCOMPLETO', N'SUPERIOR_COMPLETO', N'POS_GRADUACAO'));
GO

-- Quem leu o CPF inteiro de quem (a Secretaria Geral, no "Mostrar" da ficha). A trilha imutável (AuditLog) recebe a mesma leitura; esta tabela é a consulta rápida.
-- LidoPor sem chave estrangeira, como o usuário da trilha (a leitura não some se a ficha de quem leu for juntada ou minimizada).
IF OBJECT_ID(N'dbo.CpfLeituras', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CpfLeituras (
        LeituraId   INT IDENTITY PRIMARY KEY,
        MembroId    INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        LidoPor     INT NOT NULL,
        LidoEm      DATETIME2(0) NOT NULL CONSTRAINT DF_CpfLeituras_LidoEm DEFAULT SYSUTCDATETIME(),
        Onde        NVARCHAR(60) NOT NULL
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CpfLeituras_Membro' AND object_id = OBJECT_ID(N'dbo.CpfLeituras'))
    CREATE INDEX IX_CpfLeituras_Membro ON dbo.CpfLeituras (MembroId, LeituraId DESC);
GO

-- Os números de matrícula liberados ao juntar duas fichas da mesma pessoa: o próximo cadastro novo usa o menor deles (decisão do responsável, 13/11/2026).
IF OBJECT_ID(N'dbo.MatriculasLivres', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MatriculasLivres (
        MembroId    INT NOT NULL PRIMARY KEY,
        LiberadaEm  DATETIME2(0) NOT NULL CONSTRAINT DF_MatriculasLivres_LiberadaEm DEFAULT SYSUTCDATETIME(),
        JuntadaCom  INT NULL,
        CONSTRAINT CK_MatriculasLivres_Numero CHECK (MembroId > 0)
    );
END
GO
