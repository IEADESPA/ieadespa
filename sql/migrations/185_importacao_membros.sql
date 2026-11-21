-- ============================================================
-- Migração 185 — a IMPORTAÇÃO dos membros do sistema pago (FASE 10, v10.1e, passo 9 de Membros, 21/11/2026)
--
-- Decisões do responsável (18/11/2026, memória do projeto "Gestão de membros (v10.1)"):
--  - o arquivo do sistema pago: CSV com ';', cabeçalho MATRÍCULA;NOME;IGREJA;SEXO;NASCIMENTO;ESTADO CIVIL;E-MAIL;CELULAR;MÃE;PAI;CPF; a IGREJA vem como
--    "IEADESPA - <congregação>"; "IEADESPA - GERAL" é um cadastro errado (o da matrícula 0) e entra SEM congregação;
--  - o ARROLAMENTO (situação, cargo, data e forma de entrada) NÃO vem agora: cada importado entra com a pendência "completar o arrolamento" e SEM voto nem os
--    direitos que dependem da situação, até completar (as secretarias completam no dia a dia);
--  - o importador aceita COLUNAS EXTRAS (reconhece pelo nome, ignora as desconhecidas e mostra quais ignorou);
--  - a matrícula do sistema pago é mantida; CPF repetido e ficha que já existe não duplicam (o que o sistema já tem: as pendências REPETIDA e NUMERO da
--    migração 179 e o "juntar fichas").
--
-- O que nasce aqui:
--  1. A situação "Arrolamento a completar" (ARROLAMENTO) no catálogo SituacoesMembro: é a situação de quem entrou pela importação e ainda não teve o
--     arrolamento completado. UMA FONTE SÓ: a pendência de arrolamento É esta situação (some sozinha quando a secretaria informa a situação de verdade);
--     o tipo ARROLAMENTO de FichasPendencias (179) fica sem uso. As regras de direito (shared/situacaoMembro.js) tratam ARROLAMENTO como quem não está em
--     comunhão: não vota, não é votado, não entra em órgão, comissão, setor técnico nem ministério com menores.
--  2. ImportacoesMembros: cada importação (a prévia, a confirmação, o andamento em lotes e o fim), com o resumo SEM dado pessoal. Uma importação em andamento
--     por vez (índice único filtrado).
--  3. ImportacoesMembrosLinhas: cada linha do arquivo já lida e conferida (o que vai acontecer com ela e por quê). Os dados pessoais ficam aqui só enquanto a
--     importação não termina: no fim (ou ao descartar) saem; fica o número da linha, a matrícula, o nome e os motivos (a lista de problemas para baixar).
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

INSERT INTO dbo.SituacoesMembro (Sigla, Nome)
SELECT N'ARROLAMENTO', N'Arrolamento a completar'
WHERE NOT EXISTS (SELECT 1 FROM dbo.SituacoesMembro WHERE Sigla = N'ARROLAMENTO');
GO

IF OBJECT_ID(N'dbo.ImportacoesMembros', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ImportacoesMembros (
        ImportacaoId    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ImportacoesMembros PRIMARY KEY,
        Situacao        NVARCHAR(12) NOT NULL CONSTRAINT DF_ImportacoesMembros_Situacao DEFAULT N'PREVIA',
        NomeArquivo     NVARCHAR(200) NULL,
        HashArquivo     CHAR(64) NOT NULL,             -- SHA-256 do texto (o mesmo arquivo de novo é reconhecido)
        CriadaEm        DATETIME2(0) NOT NULL CONSTRAINT DF_ImportacoesMembros_CriadaEm DEFAULT SYSUTCDATETIME(),
        CriadaPor       INT NOT NULL,
        ConfirmadaEm    DATETIME2(0) NULL,
        ConfirmadaPor   INT NULL,
        ConcluidaEm     DATETIME2(0) NULL,
        DescartadaEm    DATETIME2(0) NULL,
        Resumo          NVARCHAR(MAX) NULL,            -- JSON: contagens, colunas reconhecidas e ignoradas, avisos gerais (sem dado pessoal)
        CONSTRAINT CK_ImportacoesMembros_Situacao CHECK (Situacao IS NOT NULL AND Situacao IN (N'PREVIA', N'IMPORTANDO', N'CONCLUIDA', N'DESCARTADA')),
        CONSTRAINT CK_ImportacoesMembros_Datas CHECK ((Situacao = N'PREVIA' AND ConfirmadaEm IS NULL AND ConcluidaEm IS NULL AND DescartadaEm IS NULL)
            OR (Situacao = N'IMPORTANDO' AND ConfirmadaEm IS NOT NULL AND ConcluidaEm IS NULL AND DescartadaEm IS NULL)
            OR (Situacao = N'CONCLUIDA' AND ConfirmadaEm IS NOT NULL AND ConcluidaEm IS NOT NULL AND DescartadaEm IS NULL)
            OR (Situacao = N'DESCARTADA' AND ConcluidaEm IS NULL AND DescartadaEm IS NOT NULL))
    );
END
GO
-- Uma importação em andamento por vez (duas ao mesmo tempo disputariam as mesmas matrículas)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ImportacoesMembros_Andamento' AND object_id = OBJECT_ID(N'dbo.ImportacoesMembros'))
    CREATE UNIQUE INDEX UX_ImportacoesMembros_Andamento ON dbo.ImportacoesMembros (Situacao) WHERE Situacao = N'IMPORTANDO';
GO

IF OBJECT_ID(N'dbo.ImportacoesMembrosLinhas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ImportacoesMembrosLinhas (
        ImportacaoId        INT NOT NULL CONSTRAINT FK_ImportacoesMembrosLinhas_Importacao REFERENCES dbo.ImportacoesMembros(ImportacaoId),
        Linha               INT NOT NULL,              -- o número da linha no arquivo (o cabeçalho é a 1)
        Acao                NVARCHAR(10) NOT NULL,     -- NOVA (entra) | EXISTE (já está no sistema ou repetida no arquivo: não entra de novo) | PROBLEMA (não entra)
        Estado              NVARCHAR(10) NOT NULL CONSTRAINT DF_ImportacoesMembrosLinhas_Estado DEFAULT N'PENDENTE',  -- PENDENTE | IMPORTADA | PULADA | FORA
        MatriculaArquivo    NVARCHAR(20) NULL,         -- como veio no arquivo ("0", vazio, "12a"...)
        Matricula           INT NULL,                  -- a matrícula do arquivo, quando serve
        NumeroNovo          BIT NOT NULL CONSTRAINT DF_ImportacoesMembrosLinhas_NumeroNovo DEFAULT 0,  -- a do arquivo não serve: o sistema dá a próxima (pendência NUMERO)
        MatriculaFinal      INT NULL,                  -- a matrícula com que a ficha nasceu
        MembroExistente     INT NULL,                  -- EXISTE: a ficha que já existe (a mesma matrícula e a mesma pessoa)
        CpfIgualLinha       INT NULL,                  -- o mesmo CPF numa linha anterior do arquivo (essa fica com o CPF; esta entra sem e as duas viram "possível repetida")
        CpfIgualMembro      INT NULL,                  -- o mesmo CPF numa ficha que já existe (idem)
        Problemas           NVARCHAR(300) NULL,        -- códigos, separados por vírgula (shared/importacaoMembros.js)
        Avisos              NVARCHAR(300) NULL,
        Nome                NVARCHAR(200) NULL,
        IgrejaArquivo       NVARCHAR(150) NULL,
        CongregacaoId       INT NULL,
        Sexo                NCHAR(1) NULL,
        DataNascimento      DATE NULL,
        EstadoCivil         NVARCHAR(20) NULL,
        Email               NVARCHAR(150) NULL,
        Telefone            NVARCHAR(20) NULL,
        NomeMae             NVARCHAR(150) NULL,
        NomePai             NVARCHAR(150) NULL,
        Cpf                 CHAR(11) NULL,
        DataAdmissao        DATE NULL,
        FormaAdmissao       NVARCHAR(30) NULL,
        DataBatismo         DATE NULL,
        Escolaridade        NVARCHAR(30) NULL,
        CONSTRAINT PK_ImportacoesMembrosLinhas PRIMARY KEY (ImportacaoId, Linha),
        CONSTRAINT CK_ImportacoesMembrosLinhas_Acao CHECK (Acao IS NOT NULL AND Acao IN (N'NOVA', N'EXISTE', N'PROBLEMA')),
        CONSTRAINT CK_ImportacoesMembrosLinhas_Estado CHECK (Estado IS NOT NULL AND Estado IN (N'PENDENTE', N'IMPORTADA', N'PULADA', N'FORA')),
        CONSTRAINT CK_ImportacoesMembrosLinhas_Matricula CHECK (Matricula IS NULL OR Matricula > 0),
        CONSTRAINT CK_ImportacoesMembrosLinhas_Final CHECK ((Estado = N'IMPORTADA' AND MatriculaFinal IS NOT NULL) OR (Estado <> N'IMPORTADA' AND MatriculaFinal IS NULL)),
        CONSTRAINT CK_ImportacoesMembrosLinhas_Cpf CHECK (Cpf IS NULL OR (LEN(Cpf) = 11 AND Cpf NOT LIKE '%[^0-9]%')),
        CONSTRAINT CK_ImportacoesMembrosLinhas_Sexo CHECK (Sexo IS NULL OR Sexo IN (N'M', N'F'))
    );
END
GO
-- O que cada lote lê: as linhas pendentes da importação, na ordem do arquivo
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ImportacoesMembrosLinhas_Pendentes' AND object_id = OBJECT_ID(N'dbo.ImportacoesMembrosLinhas'))
    CREATE INDEX IX_ImportacoesMembrosLinhas_Pendentes ON dbo.ImportacoesMembrosLinhas (ImportacaoId, Estado, NumeroNovo, Linha);
GO
-- De qual importação veio cada ficha (a ficha 360 e a conferência depois)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ImportacoesMembrosLinhas_Final' AND object_id = OBJECT_ID(N'dbo.ImportacoesMembrosLinhas'))
    CREATE INDEX IX_ImportacoesMembrosLinhas_Final ON dbo.ImportacoesMembrosLinhas (MatriculaFinal) WHERE MatriculaFinal IS NOT NULL;
GO
