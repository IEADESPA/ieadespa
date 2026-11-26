-- ============================================================
-- Migração 177 — O PRÉ-CADASTRO e a FILA DE CADASTROS (FASE 10, v10.1b passo 4, 17/11/2026)
--
-- Decisões do responsável (rodadas 9 e 10 da gestão de membros; correções de 17/11/2026 sobre o CPF repetido):
--  - o pré-cadastro é feito por quem está com a pessoa (professor da EBD, liderança da congregação, a secretaria) ou pela PRÓPRIA pessoa no site ("Quero me
--    cadastrar"), só com o ESSENCIAL para não duplicar: nome, CPF, e-mail (para criar a senha), telefone (opcional), nascimento, sexo e estado civil; pelo site a
--    pessoa escolhe a congregação. O departamento NÃO é pedido (sai da idade, do sexo e do estado civil).
--  - a FILA (esteira): quem chega com o mínimo obrigatório completo e SEM pendência ENTRA SOZINHO (aceite automático, com a matrícula gerada — primeiro um número
--    de MatriculasLivres); na fila fica SÓ quem tem pendência; a secretaria LOCAL completa e aceita; a área e a Geral acompanham.
--  - CPF REPETIDO: no cadastro pelo sistema, a conferência ao digitar não deixa concluir; fora do escopo de quem cadastra, o caso vai à Secretaria Geral
--    (CasosCadastroGeral), sem revelar a outra ficha. No pré-cadastro (do site ou de um líder), a repetição é vista na fila: não aprova e vai para CORREÇÃO junto
--    com o cadastro mais antigo.
--
-- PreCadastros.Situacao: PENDENTE (falta algo ou há aviso a conferir) | CORRECAO (CPF que já existe numa ficha ou noutro pré-cadastro aberto) | ACEITO | DESCARTADO.
-- Origem: SITE | LIDER | SECRETARIA. Pendencias: códigos separados por vírgula (shared/preCadastro.js). Idempotente.
-- ============================================================

IF OBJECT_ID(N'dbo.PreCadastros', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PreCadastros (
        PreCadastroId          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PreCadastros PRIMARY KEY,
        Origem                 NVARCHAR(12) NOT NULL,
        CriadoPor              INT NULL,                 -- quem lançou (líder/secretaria); NULL quando veio do site
        CongregacaoId          INT NULL CONSTRAINT FK_PreCadastros_Congregacao REFERENCES dbo.Congregacoes(CongregacaoId),
        Nome                   NVARCHAR(200) NOT NULL,
        Cpf                    CHAR(11) NULL,
        Email                  NVARCHAR(150) NULL,
        Telefone               NVARCHAR(20) NULL,
        DataNascimento         DATE NULL,
        Sexo                   NCHAR(1) NULL,
        EstadoCivil            NVARCHAR(20) NULL,
        Situacao               NVARCHAR(12) NOT NULL CONSTRAINT DF_PreCadastros_Situacao DEFAULT N'PENDENTE',
        Pendencias             NVARCHAR(300) NULL,
        MembroIdResultado      INT NULL CONSTRAINT FK_PreCadastros_Resultado REFERENCES dbo.MembroReferencia(MembroId),
        MembroIdRepetido       INT NULL CONSTRAINT FK_PreCadastros_Repetido REFERENCES dbo.MembroReferencia(MembroId),
        PreCadastroRepetidoId  INT NULL,
        ResponsavelConfirmado  BIT NOT NULL CONSTRAINT DF_PreCadastros_Responsavel DEFAULT 0,   -- menor de idade: a secretaria confirmou o consentimento do responsável
        RepeticaoConferida     BIT NOT NULL CONSTRAINT DF_PreCadastros_Repeticao DEFAULT 0,     -- nome e nascimento parecidos: a secretaria conferiu que NÃO é a mesma pessoa
        Versao                 ROWVERSION NOT NULL,                                               -- a gravação concorrente (completar × aceite automático) confere a versão lida
        ConsentimentoVersao    NVARCHAR(20) NULL,
        ConsentimentoBase      NVARCHAR(30) NULL,
        ConsentimentoEm        DATETIME2(0) NULL,
        OrigemHash             CHAR(16) NULL,            -- hash truncado de quem enviou pelo site (nunca o IP em claro), para o limite
        CriadoEm               DATETIME2(0) NOT NULL CONSTRAINT DF_PreCadastros_CriadoEm DEFAULT SYSUTCDATETIME(),
        AtualizadoEm           DATETIME2(0) NOT NULL CONSTRAINT DF_PreCadastros_AtualizadoEm DEFAULT SYSUTCDATETIME(),
        DecididoEm             DATETIME2(0) NULL,
        DecididoPor            INT NULL,
        DecididoComo           NVARCHAR(12) NULL,        -- AUTOMATICO | LOCAL | GERAL
        MotivoDescarte         NVARCHAR(300) NULL,
        CONSTRAINT CK_PreCadastros_Origem CHECK (Origem IN (N'SITE', N'LIDER', N'SECRETARIA')),
        CONSTRAINT CK_PreCadastros_Situacao CHECK (Situacao IN (N'PENDENTE', N'CORRECAO', N'ACEITO', N'DESCARTADO')),
        CONSTRAINT CK_PreCadastros_Cpf CHECK (Cpf IS NULL OR (LEN(Cpf) = 11 AND Cpf NOT LIKE '%[^0-9]%')),
        CONSTRAINT CK_PreCadastros_Sexo CHECK (Sexo IS NULL OR Sexo IN (N'M', N'F')),
        CONSTRAINT CK_PreCadastros_Aceito CHECK ((Situacao = N'ACEITO' AND MembroIdResultado IS NOT NULL) OR (Situacao <> N'ACEITO' AND MembroIdResultado IS NULL)),
        CONSTRAINT CK_PreCadastros_Correcao CHECK (Situacao <> N'CORRECAO' OR MembroIdRepetido IS NOT NULL OR PreCadastroRepetidoId IS NOT NULL)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PreCadastros_Fila' AND object_id = OBJECT_ID(N'dbo.PreCadastros'))
    CREATE INDEX IX_PreCadastros_Fila ON dbo.PreCadastros (Situacao, CongregacaoId) INCLUDE (CriadoEm);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PreCadastros_Cpf' AND object_id = OBJECT_ID(N'dbo.PreCadastros'))
    CREATE INDEX IX_PreCadastros_Cpf ON dbo.PreCadastros (Cpf) INCLUDE (Situacao) WHERE Cpf IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PreCadastros_Site' AND object_id = OBJECT_ID(N'dbo.PreCadastros'))
    CREATE INDEX IX_PreCadastros_Site ON dbo.PreCadastros (Origem, CriadoEm) INCLUDE (OrigemHash);
GO

-- Os casos que vão à Secretaria Geral: o CPF digitado no cadastro já está numa ficha FORA do escopo de quem cadastrava (quem cadastra não vê nada da outra ficha),
-- ou um pré-cadastro repetiu o CPF de uma ficha de outra congregação. A Geral confere e corrige (junta as fichas, transfere, ou corrige o CPF digitado errado).
-- NomeInformado/NascimentoInformado = o que quem cadastrava digitou (a Geral precisa disso para resolver); o CPF não é guardado aqui (a ficha existente já o tem).
IF OBJECT_ID(N'dbo.CasosCadastroGeral', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CasosCadastroGeral (
        CasoId                 INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CasosCadastroGeral PRIMARY KEY,
        Tipo                   NVARCHAR(30) NOT NULL,
        MembroIdExistente      INT NOT NULL CONSTRAINT FK_CasosCadastro_Existente REFERENCES dbo.MembroReferencia(MembroId),
        CongregacaoQuePediuId  INT NULL CONSTRAINT FK_CasosCadastro_Congregacao REFERENCES dbo.Congregacoes(CongregacaoId),
        PedidoPor              INT NULL,
        PreCadastroId          INT NULL CONSTRAINT FK_CasosCadastro_PreCadastro REFERENCES dbo.PreCadastros(PreCadastroId),
        NomeInformado          NVARCHAR(200) NULL,
        NascimentoInformado    DATE NULL,
        Situacao               NVARCHAR(12) NOT NULL CONSTRAINT DF_CasosCadastro_Situacao DEFAULT N'ABERTO',
        CriadoEm               DATETIME2(0) NOT NULL CONSTRAINT DF_CasosCadastro_CriadoEm DEFAULT SYSUTCDATETIME(),
        ResolvidoEm            DATETIME2(0) NULL,
        ResolvidoPor           INT NULL,
        Nota                   NVARCHAR(500) NULL,
        CONSTRAINT CK_CasosCadastro_Tipo CHECK (Tipo IN (N'CPF_FORA_DO_ESCOPO', N'PRECADASTRO_REPETIDO')),
        CONSTRAINT CK_CasosCadastro_Situacao CHECK (Situacao IN (N'ABERTO', N'RESOLVIDO'))
    );
END
GO
-- Um caso ABERTO por ficha existente e congregação que pediu (digitar o mesmo CPF de novo não cria outro caso)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CasosCadastro_Aberto' AND object_id = OBJECT_ID(N'dbo.CasosCadastroGeral'))
    CREATE UNIQUE INDEX UX_CasosCadastro_Aberto ON dbo.CasosCadastroGeral (MembroIdExistente, Tipo, CongregacaoQuePediuId) WHERE Situacao = N'ABERTO';
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CasosCadastro_Situacao' AND object_id = OBJECT_ID(N'dbo.CasosCadastroGeral'))
    CREATE INDEX IX_CasosCadastro_Situacao ON dbo.CasosCadastroGeral (Situacao, CriadoEm);
GO
