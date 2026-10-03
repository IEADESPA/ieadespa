-- ============================================================
-- Migração 088 — Credenciamento de Assembleia (vB.13, retrofit da v2.1)
--
-- Reg. Art. 142-143 descreve um controle de porta mais fino que a v2.1
-- (RegistrarPresenca, auto-atendimento por senha) não modela: hoje uma
-- recusa na porta simplesmente não deixa rastro no sistema — o que é ruim
-- justamente quando alguém contesta depois ("eu estava lá e não me
-- deixaram entrar"). Esta migração cria a trilha que faltava.
--
-- CredenciamentosAssembleia: cada tentativa de credenciamento OPERADA PELA
-- MESA (não o auto-atendimento de RegistrarPresenca, que continua existindo
-- do jeito que está) — credenciado ou recusado, com o artigo que recusou
-- (Art. 142, I/II/III), quem operou e quando. "Impedido" nunca é uma
-- marcação manual: shared/credenciamento.js CALCULA o motivo a partir do
-- que já existe (shared/universo.js, shared/disciplina.js, shared/estatuto.js).
--
-- RelatoriosCredenciamento: 1 por sessão (Robert's Rules — Credentials
-- Report), gerado sob demanda e CONGELADO (mesmo padrão de Protocolo em
-- CartaPdf/ApresentacaoCriancaPdf) — não recalcula a cada leitura, pra não
-- deixar mudança posterior (ex: carta de mudança emitida depois) reescrever
-- retroativamente a base sobre a qual o quórum de instalação foi fixado.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.CredenciamentosAssembleia', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CredenciamentosAssembleia (
        CredenciamentoId  INT IDENTITY PRIMARY KEY,
        SessaoId          INT NOT NULL REFERENCES dbo.Sessoes(SessaoId),
        MembroId          INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Resultado         NVARCHAR(20) NOT NULL,  -- CREDENCIADO | RECUSADO
        MotivoArtigo      NVARCHAR(20) NULL,       -- ex: "Art. 142, III" — só quando RECUSADO
        MotivoDetalhe     NVARCHAR(300) NULL,
        OperadoPor        INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.RelatoriosCredenciamento', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RelatoriosCredenciamento (
        RelatorioId        INT IDENTITY PRIMARY KEY,
        SessaoId           INT NOT NULL REFERENCES dbo.Sessoes(SessaoId),
        TotalCredenciados  INT NOT NULL,
        TotalImpedidos     INT NOT NULL,
        GeradoPor          INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        GeradoEm           DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_RelatoriosCredenciamento_Sessao UNIQUE (SessaoId)
    );
END
GO
