-- ============================================================
-- Migração 140 — vD.4: segundo fator da liderança por CHAVE DE ACESSO (passkey, WebAuthn/FIDO2).
--
-- Decisão do responsável (07/10/2026): quem tem registro em Lideranca entra com matrícula + senha e, depois, confirma
-- com a chave de acesso do próprio aparelho (celular/notebook: digital, rosto ou senha do aparelho). O código de 6
-- dígitos por e-mail (CodigosAcessoMembro, vB.5) fica como reserva. Aqui só a CHAVE PÚBLICA de cada aparelho é
-- guardada; a privada nunca sai do aparelho.
--
-- DesafiosWebAuthn: cada cadastro/entrada/confirmação começa com um desafio aleatório de uso único, com prazo de
-- 5 minutos — a resposta do aparelho vale para aquele desafio e para nenhum outro (contra repetição).
--
-- Idempotente: seguro para reexecutar.
-- ============================================================
IF OBJECT_ID('dbo.ChavesAcesso', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ChavesAcesso (
    ChaveId        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ChavesAcesso PRIMARY KEY,
    MembroId       INT NOT NULL,
    CredencialId   NVARCHAR(512) NOT NULL,          -- id da credencial (base64url) que o aparelho devolve
    ChavePublica   NVARCHAR(MAX) NOT NULL,          -- chave pública COSE (base64url)
    Contador       BIGINT NOT NULL CONSTRAINT DF_ChavesAcesso_Contador DEFAULT 0,
    Transportes    NVARCHAR(100) NULL,              -- "internal,hybrid" etc. (ajuda o navegador a achar o aparelho)
    Apelido        NVARCHAR(80) NULL,               -- "Celular da Maria", dado pela pessoa
    DispositivoInfo NVARCHAR(300) NULL,             -- User-Agent de quando cadastrou
    CriadoEm       DATETIME2 NOT NULL CONSTRAINT DF_ChavesAcesso_CriadoEm DEFAULT SYSUTCDATETIME(),
    UltimoUsoEm    DATETIME2 NULL,
    Ativa          BIT NOT NULL CONSTRAINT DF_ChavesAcesso_Ativa DEFAULT 1,
    RemovidaEm     DATETIME2 NULL,
    RemovidaPor    INT NULL,                        -- quem removeu (a própria pessoa ou o nível geral)
    CONSTRAINT UQ_ChavesAcesso_Credencial UNIQUE (CredencialId)
  );
  CREATE INDEX IX_ChavesAcesso_Membro ON dbo.ChavesAcesso (MembroId, Ativa);
END;

IF OBJECT_ID('dbo.DesafiosWebAuthn', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.DesafiosWebAuthn (
    DesafioId  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DesafiosWebAuthn PRIMARY KEY,
    MembroId   INT NOT NULL,
    Tipo       NVARCHAR(12) NOT NULL,               -- REGISTRO | LOGIN | CONFIRMAR
    Desafio    NVARCHAR(100) NOT NULL,              -- base64url
    ExpiraEm   DATETIME2 NOT NULL,
    Usado      BIT NOT NULL CONSTRAINT DF_DesafiosWebAuthn_Usado DEFAULT 0,
    CriadoEm   DATETIME2 NOT NULL CONSTRAINT DF_DesafiosWebAuthn_CriadoEm DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_DesafiosWebAuthn_Membro ON dbo.DesafiosWebAuthn (MembroId, Tipo, Usado, CriadoEm DESC);
END;
