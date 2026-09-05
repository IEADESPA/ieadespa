-- ============================================================
-- Migração 024 — Solicitações de Edição de Pessoa (v1.11).
--
-- Fecha o item documentado na v1.10: fluxo de autoedição com aprovação. Alguns
-- campos (Telefone/E-mail/Endereço/Estado Civil/Vínculos Familiares) o membro já
-- edita direto, sem passar por aqui — essas tabelas só existem pros campos que
-- entram em cálculo/registro formal (Data de Nascimento, Data de Admissão, Data
-- de Batismo, Forma de Admissão, Origem, Igreja Anterior, dados do Rito de
-- Recebimento), onde um erro tem consequência real e a Secretaria precisa
-- decidir campo a campo antes de valer.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.SolicitacoesEdicaoPessoa') AND type = N'U')
BEGIN
    CREATE TABLE dbo.SolicitacoesEdicaoPessoa (
        SolicitacaoId    INT IDENTITY PRIMARY KEY,
        MembroId         INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DataSolicitacao  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        Status           NVARCHAR(20) NOT NULL DEFAULT 'PENDENTE' -- PENDENTE / CONCLUIDA
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.SolicitacoesEdicaoCampos') AND type = N'U')
BEGIN
    CREATE TABLE dbo.SolicitacoesEdicaoCampos (
        CampoId          INT IDENTITY PRIMARY KEY,
        SolicitacaoId    INT NOT NULL REFERENCES dbo.SolicitacoesEdicaoPessoa(SolicitacaoId),
        NomeCampo        NVARCHAR(50) NOT NULL,   -- ex: 'dataNascimento' (fixo em código, não catálogo)
        ValorAnterior    NVARCHAR(300) NULL,
        ValorProposto    NVARCHAR(300) NOT NULL,
        Status           NVARCHAR(20) NOT NULL DEFAULT 'PENDENTE', -- PENDENTE / APROVADO / REJEITADO
        DecididoPor      INT NULL,
        DataDecisao      DATETIME2 NULL
    );
END
GO
