-- ============================================================
-- Migração 081 — Protocolo institucional único + anexos genéricos (vB.4)
--
-- Protocolos: sequência atômica por Tipo+Ano (MERGE ... HOLDLOCK, sem
-- condição de corrida) — substitui o padrão `SELECT COUNT(*) ... WHERE
-- Protocolo LIKE prefixo%` que `shared/ouvidoria.js` e `GestaoProjetos`
-- reinventavam cada um do seu jeito (e que tinha corrida real: duas
-- requisições simultâneas podiam calcular o mesmo COUNT e gerar protocolo
-- duplicado). Mesma tabela serve qualquer tipo novo (`DISC-2026-0001`, por
-- exemplo) sem migração adicional — só chamar
-- `shared/protocolo.js::gerarProtocolo(pool, 'DISC')`.
--
-- AnexosGenericos: qualquer registro de qualquer módulo aceita documento
-- sem precisar de uma coluna/tela própria — controle de acesso vem do mapa
-- declarativo `shared/anexos.js::TABELA_PERMISSOES` (mesma ideia de
-- catálogo declarativo das vB.2/vB.3), nunca hardcoded por módulo.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.Protocolos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Protocolos (
        Tipo          NVARCHAR(10) NOT NULL,
        Ano           INT NOT NULL,
        UltimoNumero  INT NOT NULL DEFAULT 0,
        CONSTRAINT PK_Protocolos PRIMARY KEY (Tipo, Ano)
    );
END
GO

IF OBJECT_ID(N'dbo.AnexosGenericos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AnexosGenericos (
        AnexoId            INT IDENTITY PRIMARY KEY,
        Tabela              NVARCHAR(60) NOT NULL,        -- ex: 'Projetos', 'Fornecedores' — precisa estar em TABELA_PERMISSOES
        RegistroId           INT NOT NULL,
        NomeArquivo          NVARCHAR(255) NOT NULL,
        Url                  NVARCHAR(500) NOT NULL,       -- URL crua do blob (sem SAS — assinada só na leitura, igual Documentos/Fotos)
        MimeType             NVARCHAR(100) NOT NULL,
        EnviadoPorMembroId    INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm             DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_AnexosGenericos_Registro ON dbo.AnexosGenericos (Tabela, RegistroId);
END
GO
