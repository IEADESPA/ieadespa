-- ============================================================
-- Migração 202 — FASE 10, Financeiro (módulo 2), a revisão de 24/11/2026 (m2): o banco confere a quem a SaidaId aponta e a faixa contra o
-- bloco.
--
-- Até a 201, só o código conferia (shared/finBlocosDb.js). Um INSERT direto (a semeadura, o lançamento do incremento 3, uma correção à mão)
-- passava com a entrada fechando outra entrada, a entrada ou a folha com a saída de OUTRO bloco, e a saída com folhas que não são do bloco
-- (a faixa 1 a 5 no bloco 1.401). Daqui em diante:
-- 1. A SaidaId da entrada, da folha e da exceção desfeita aponta sempre para uma SAÍDA do MESMO bloco: a chave estrangeira composta
--    (SaidaId, BlocoId, SaidaTipo) → FinLivroBlocos (RegistroId, BlocoId, Tipo), com SaidaTipo = 'SAIDA' fixo (coluna calculada e gravada).
--    Na linha sem SaidaId (a saída, o cadastro, a chegada), a chave não confere nada: basta uma coluna nula.
-- 2. A faixa da saída e da entrada parcial fica dentro do bloco e vai até a última folha dele (as duas sempre vão até o fim: o bloco inteiro,
--    as folhas que voltaram livres, ou a faixa que voltou livre). FinLivroBlocos.BlocoPrimeiraFolha guarda a primeira folha do bloco; a chave
--    estrangeira (BlocoId, BlocoPrimeiraFolha, UltimaFolha) → FinBlocos (BlocoId, PrimeiraFolha, UltimaFolha) obriga a primeira e a última do
--    bloco de verdade, e o CHECK obriga a faixa a começar dentro do bloco e a coluna a vir junto com a faixa. O código grava a coluna na
--    entrega e na devolução parcial; o acerto abaixo preenche as linhas de antes.
-- Chaves, e não gatilho: as gravações usam INSERT ... OUTPUT INSERTED sem INTO, que o SQL Server não aceita em tabela com gatilho.
-- Continua só no código: a folha (FinFolhas.Folha) dentro do bloco, e a primeira em branco da parcial dentro da entrega que ela fecha.
--
-- Idempotente: cada objeto só nasce se não existir; nenhum DROP; o acerto só toca o que ainda está vazio.
-- ============================================================

-- ---- 1. a SaidaId aponta para uma SAÍDA do mesmo bloco ----

IF COL_LENGTH(N'dbo.FinLivroBlocos', N'SaidaTipo') IS NULL
    ALTER TABLE dbo.FinLivroBlocos ADD SaidaTipo AS CAST(N'SAIDA' AS NVARCHAR(10)) PERSISTED;
GO
IF COL_LENGTH(N'dbo.FinFolhas', N'SaidaTipo') IS NULL
    ALTER TABLE dbo.FinFolhas ADD SaidaTipo AS CAST(N'SAIDA' AS NVARCHAR(10)) PERSISTED;
GO
IF COL_LENGTH(N'dbo.FinFolhasDesfeitas', N'SaidaTipo') IS NULL
    ALTER TABLE dbo.FinFolhasDesfeitas ADD SaidaTipo AS CAST(N'SAIDA' AS NVARCHAR(10)) PERSISTED;
GO
-- o alvo das chaves compostas (a chave primária já é única; o índice só existe para a chave estrangeira poder apontar para as três colunas)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_FinLivroBlocos_SaidaDoBloco' AND object_id = OBJECT_ID(N'dbo.FinLivroBlocos'))
    CREATE UNIQUE INDEX UX_FinLivroBlocos_SaidaDoBloco ON dbo.FinLivroBlocos (RegistroId, BlocoId, Tipo);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_FinLivroBlocos_SaidaDoBloco' AND parent_object_id = OBJECT_ID(N'dbo.FinLivroBlocos'))
    ALTER TABLE dbo.FinLivroBlocos WITH CHECK ADD CONSTRAINT FK_FinLivroBlocos_SaidaDoBloco
        FOREIGN KEY (SaidaId, BlocoId, SaidaTipo) REFERENCES dbo.FinLivroBlocos (RegistroId, BlocoId, Tipo);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_FinFolhas_SaidaDoBloco' AND parent_object_id = OBJECT_ID(N'dbo.FinFolhas'))
    ALTER TABLE dbo.FinFolhas WITH CHECK ADD CONSTRAINT FK_FinFolhas_SaidaDoBloco
        FOREIGN KEY (SaidaId, BlocoId, SaidaTipo) REFERENCES dbo.FinLivroBlocos (RegistroId, BlocoId, Tipo);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_FinFolhasDesfeitas_SaidaDoBloco' AND parent_object_id = OBJECT_ID(N'dbo.FinFolhasDesfeitas'))
    ALTER TABLE dbo.FinFolhasDesfeitas WITH CHECK ADD CONSTRAINT FK_FinFolhasDesfeitas_SaidaDoBloco
        FOREIGN KEY (SaidaId, BlocoId, SaidaTipo) REFERENCES dbo.FinLivroBlocos (RegistroId, BlocoId, Tipo);
GO

-- ---- 2. a faixa da saída e da entrada parcial dentro do bloco ----

IF COL_LENGTH(N'dbo.FinLivroBlocos', N'BlocoPrimeiraFolha') IS NULL
    ALTER TABLE dbo.FinLivroBlocos ADD BlocoPrimeiraFolha INT NULL;
GO
-- o acerto das linhas de antes (a saída e a entrada parcial que já têm a faixa); só o que ainda está vazio
UPDATE l SET l.BlocoPrimeiraFolha = b.PrimeiraFolha
FROM dbo.FinLivroBlocos l
JOIN dbo.FinBlocos b ON b.BlocoId = l.BlocoId
WHERE l.PrimeiraFolha IS NOT NULL AND l.BlocoPrimeiraFolha IS NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_FinBlocos_Faixa' AND object_id = OBJECT_ID(N'dbo.FinBlocos'))
    CREATE UNIQUE INDEX UX_FinBlocos_Faixa ON dbo.FinBlocos (BlocoId, PrimeiraFolha, UltimaFolha);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_FinLivroBlocos_FaixaDoBloco' AND parent_object_id = OBJECT_ID(N'dbo.FinLivroBlocos'))
    ALTER TABLE dbo.FinLivroBlocos WITH CHECK ADD CONSTRAINT FK_FinLivroBlocos_FaixaDoBloco
        FOREIGN KEY (BlocoId, BlocoPrimeiraFolha, UltimaFolha) REFERENCES dbo.FinBlocos (BlocoId, PrimeiraFolha, UltimaFolha);
GO
-- o IS NOT NULL de cada ponta é de propósito: no CHECK, a comparação com NULL não reprova a linha
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_FinLivroBlocos_FaixaNoBloco' AND parent_object_id = OBJECT_ID(N'dbo.FinLivroBlocos'))
    ALTER TABLE dbo.FinLivroBlocos WITH CHECK ADD CONSTRAINT CK_FinLivroBlocos_FaixaNoBloco
        CHECK ((PrimeiraFolha IS NULL AND BlocoPrimeiraFolha IS NULL)
               OR (PrimeiraFolha IS NOT NULL AND BlocoPrimeiraFolha IS NOT NULL AND PrimeiraFolha >= BlocoPrimeiraFolha));
GO
