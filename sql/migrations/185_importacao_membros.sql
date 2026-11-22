-- ============================================================
-- Migração 185 — a IMPORTAÇÃO dos membros do sistema pago (FASE 10, v10.1e, passo 9 de Membros; 21 e 22/11/2026)
--
-- Decisões do responsável (18/11 e 22/11/2026, memória do projeto "Gestão de membros (v10.1)"):
--  - o arquivo do sistema pago: CSV com ';', cabeçalho MATRÍCULA;NOME;IGREJA;SEXO;NASCIMENTO;ESTADO CIVIL;E-MAIL;CELULAR;MÃE;PAI;CPF; a IGREJA vem como
--    "IEADESPA - <congregação>"; "IEADESPA - GERAL" entra SEM congregação;
--  - UMA VEZ SÓ (22/11): só a Secretaria Geral, sem tela de diferenças; o que mudar depois é corrigido à mão no sistema novo;
--  - COLUNAS EXTRAS aceitas (reconhecidas pelo nome; as desconhecidas são ignoradas e mostradas);
--  - matrícula repetida ou zerada: a pessoa entra com a próxima matrícula do sistema e a pendência NUMERO; possível repetida: a pendência REPETIDA;
--  - o ARROLAMENTO (situação, cargo, data e forma de entrada) NÃO vem: cada importado entra com a pendência ARROLAMENTO e SEM voto até completar.
--
-- O que nasce aqui:
--  1. A situação "Arrolamento a completar" (ARROLAMENTO) no catálogo SituacoesMembro: a situação de quem entrou pela importação. Como toda regra de direito
--     do sistema (voto, ser votado, órgãos, comissões...) pede EM_COMUNHAO, quem está em ARROLAMENTO não vota até a secretaria completar. A pendência
--     ARROLAMENTO de FichasPendencias (migração 179) é aberta junto (a fila de pendências e o alerta da assembleia a contam).
--  2. ImportacoesMembros: cada importação (a prévia, a confirmação, o andamento em lotes e o fim), com o resumo SEM dado pessoal. Uma em andamento por vez
--     (índice único filtrado) e, depois de uma confirmada, nenhuma outra (a rota confere, debaixo de uma trava).
--  3. ImportacoesMembrosLinhas: cada linha do arquivo já lida e conferida (o que vai acontecer com ela e por quê). Os dados pessoais ficam aqui só enquanto a
--     importação não termina: no fim (ou ao descartar) saem; fica o número da linha, a matrícula, o nome e os motivos (a lista para conferir).
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
        HashArquivo     CHAR(64) NOT NULL,             -- SHA-256 do texto (para conferir depois qual arquivo entrou)
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
            OR (Situacao = N'DESCARTADA' AND ConfirmadaEm IS NULL AND ConcluidaEm IS NULL AND DescartadaEm IS NOT NULL))
    );
END
GO
-- Uma importação em andamento por vez (duas ao mesmo tempo disputariam as mesmas matrículas)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ImportacoesMembros_Andamento' AND object_id = OBJECT_ID(N'dbo.ImportacoesMembros'))
    CREATE UNIQUE INDEX UX_ImportacoesMembros_Andamento ON dbo.ImportacoesMembros (Situacao) WHERE Situacao = N'IMPORTANDO';
GO
-- Uma prévia aberta por vez (a nova substitui a anterior)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ImportacoesMembros_Previa' AND object_id = OBJECT_ID(N'dbo.ImportacoesMembros'))
    CREATE UNIQUE INDEX UX_ImportacoesMembros_Previa ON dbo.ImportacoesMembros (Situacao) WHERE Situacao = N'PREVIA';
GO

IF OBJECT_ID(N'dbo.ImportacoesMembrosLinhas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ImportacoesMembrosLinhas (
        ImportacaoId        INT NOT NULL CONSTRAINT FK_ImportacoesMembrosLinhas_Importacao REFERENCES dbo.ImportacoesMembros(ImportacaoId),
        Linha               INT NOT NULL,              -- o número da linha no arquivo (o cabeçalho é a 1)
        Acao                NVARCHAR(10) NOT NULL,     -- NOVA (entra) | PROBLEMA (não entra: sem nome, congregação que não existe...)
        Estado              NVARCHAR(10) NOT NULL CONSTRAINT DF_ImportacoesMembrosLinhas_Estado DEFAULT N'PENDENTE',  -- PENDENTE | IMPORTADA | FORA
        MatriculaArquivo    NVARCHAR(20) NULL,         -- como veio no arquivo ("0", vazio, "12a"...)
        Matricula           INT NULL,                  -- a matrícula do arquivo, quando serve
        NumeroNovo          BIT NOT NULL CONSTRAINT DF_ImportacoesMembrosLinhas_NumeroNovo DEFAULT 0,  -- a do arquivo não serve: a próxima do sistema (pendência NUMERO)
        MotivoNumero        NVARCHAR(30) NULL,         -- ZERO | VAZIA | INVALIDA | REPETIDA_NO_ARQUIVO | DE_OUTRA_FICHA
        MatriculaFinal      INT NULL,                  -- a matrícula com que a ficha nasceu
        RepetidaLinha       INT NULL,                  -- possível repetida de uma linha anterior do arquivo (o mesmo CPF, ou a mesma matrícula e a mesma pessoa)
        RepetidaMembro      INT NULL,                  -- possível repetida de uma ficha que já existe (idem)
        Problemas           NVARCHAR(300) NULL,        -- códigos, separados por vírgula (shared/importacaoMembros.js)
        Avisos              NVARCHAR(400) NULL,
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
        CONSTRAINT CK_ImportacoesMembrosLinhas_Acao CHECK (Acao IS NOT NULL AND Acao IN (N'NOVA', N'PROBLEMA')),
        CONSTRAINT CK_ImportacoesMembrosLinhas_Estado CHECK (Estado IS NOT NULL AND Estado IN (N'PENDENTE', N'IMPORTADA', N'FORA')),
        CONSTRAINT CK_ImportacoesMembrosLinhas_Matricula CHECK (Matricula IS NULL OR Matricula > 0),
        CONSTRAINT CK_ImportacoesMembrosLinhas_Final CHECK ((Estado = N'IMPORTADA' AND MatriculaFinal IS NOT NULL) OR (Estado <> N'IMPORTADA' AND MatriculaFinal IS NULL)),
        CONSTRAINT CK_ImportacoesMembrosLinhas_Numero CHECK ((NumeroNovo = 1 AND MotivoNumero IS NOT NULL) OR (NumeroNovo = 0 AND MotivoNumero IS NULL)),
        CONSTRAINT CK_ImportacoesMembrosLinhas_Cpf CHECK (Cpf IS NULL OR (LEN(Cpf) = 11 AND Cpf NOT LIKE '%[^0-9]%')),
        CONSTRAINT CK_ImportacoesMembrosLinhas_Sexo CHECK (Sexo IS NULL OR Sexo IN (N'M', N'F'))
    );
END
GO
-- O que cada lote lê: as linhas pendentes da importação (primeiro as que têm a matrícula do arquivo, depois as de número novo), na ordem do arquivo
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ImportacoesMembrosLinhas_Pendentes' AND object_id = OBJECT_ID(N'dbo.ImportacoesMembrosLinhas'))
    CREATE INDEX IX_ImportacoesMembrosLinhas_Pendentes ON dbo.ImportacoesMembrosLinhas (ImportacaoId, Estado, NumeroNovo, Linha);
GO
-- De qual importação veio cada ficha (a ficha 360 e a conferência depois)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ImportacoesMembrosLinhas_Final' AND object_id = OBJECT_ID(N'dbo.ImportacoesMembrosLinhas'))
    CREATE INDEX IX_ImportacoesMembrosLinhas_Final ON dbo.ImportacoesMembrosLinhas (MatriculaFinal) WHERE MatriculaFinal IS NOT NULL;
GO
