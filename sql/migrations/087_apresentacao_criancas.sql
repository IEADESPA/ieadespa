-- ============================================================
-- Migração 087 — Apresentação de Crianças (vB.12, retrofit da FASE 1)
--
-- Regimento Art. 82 — mesmo lugar de Casamentos na FASE 1 original (é o
-- outro rito de família previsto pelo Regimento), mas a FASE 1 já está
-- fechada, então entra aqui como retrofit, não como reabertura.
--
-- A criança apresentada normalmente NÃO é MembroReferencia (é recém-nascida)
-- — por isso NÃO reaproveita VinculosFamiliares (ambos os lados são NOT NULL
-- REFERENCES MembroReferencia lá). Tabela própria, com os pais como FK
-- opcional pra MembroReferencia (ao menos um deles obrigatório) — mesmo
-- padrão "membro OU nome livre" que Casamentos já usa pro cônjuge.
--
-- Modalidade SOLENE | RESERVADA (Art. 82 §2º, I): reservada nunca gera
-- certificado (§2º, II "b") — a regra fica no sistema (Modalidade decide
-- na leitura, em código), não na lembrança de quem emite.
--
-- Aptidão (impedimento por união estável sem certidão OU disciplina em
-- curso de algum dos pais, preferência de até 90 dias de vida, vedação
-- acima de 1 ano completo) é CALCULADA na leitura (shared/apresentacaoCriancas.js),
-- nunca marcação manual — mesmo princípio de shared/batismo.js.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.ApresentacoesCrianca', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ApresentacoesCrianca (
        ApresentacaoId    INT IDENTITY PRIMARY KEY,
        NomeCrianca        NVARCHAR(200) NOT NULL,
        DataNascimento     DATE NOT NULL,
        MembroIdPai        INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        MembroIdMae        INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Oficiante          NVARCHAR(200) NULL,
        Modalidade         NVARCHAR(20) NOT NULL,  -- SOLENE | RESERVADA (fixo em código, Art. 82 §2º I)
        DataApresentacao   DATE NOT NULL,
        CongregacaoId      INT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        Protocolo          NVARCHAR(30) NULL,  -- só emitido pra SOLENE, sob demanda no 1º PDF (mesmo padrão de CartasTransito.Protocolo) — RESERVADA nunca recebe (Art. 82 §2º, II "b")
        CriadoPor          INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm           DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_ApresentacoesCrianca_AoMenosUmPai CHECK (MembroIdPai IS NOT NULL OR MembroIdMae IS NOT NULL)
    );
END
GO
