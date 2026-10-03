-- ============================================================
-- Migração 108 — Trava de Revisão 6-A: correções de schema da FASE 6
--
-- 1) EbdChamadas: só cabia UM visitante por lição.
--    A migração 102 declarou UQ_EbdChamadas_Licao_Aluno UNIQUE (LicaoId,
--    AlunoId) supondo que o SQL Server trata NULL como distinto numa
--    UNIQUE — não trata: uma UNIQUE aceita um único NULL por chave. Toda
--    linha de visitante tem AlunoId = NULL, então o segundo visitante da
--    mesma lição (em qualquer turma) estourava violação de chave única.
--    Troca a constraint por um índice único FILTRADO (AlunoId IS NOT NULL):
--    mantém "um registro por aluno por lição" e libera N visitantes.
--
-- 2) Permissão conquistas_gestao nunca entrou em Funcionalidades.
--    A migração 104 criou o motor e a aba "Conquistas", mas não semeou a
--    chave — a tela de Permissões monta os checkboxes a partir desse
--    catálogo, então a permissão não tinha como ser concedida pela UI.
--    Mesmo padrão de ebd_gestao (101): semeada, NUNCA concedida a papel.
--
-- 3) ConquistasEventos.ChaveOrigem — evento substituível por fato gerador.
--    O log da 104 só aceitava inserção: corrigir uma presença (AUSENTE →
--    PRESENTE) deixava a falta antiga no histórico, bloqueando
--    "Trimestre Perfeito" pra sempre, e cada re-salvamento de resposta
--    somava pontos de novo. Com ChaveOrigem (ex: "licao:42"), o mesmo
--    Membro + TipoEvento + chave SUBSTITUI o evento anterior
--    (shared/conquistas.js::registrarEvento). NULL continua sendo log puro
--    de inserção. Sem backfill: até esta trava, abrir lição dava 404
--    (rota sem catch-all), então nenhum evento de presença chegou a existir.
-- ============================================================

IF EXISTS (SELECT 1 FROM sys.key_constraints
           WHERE name = 'UQ_EbdChamadas_Licao_Aluno' AND parent_object_id = OBJECT_ID('dbo.EbdChamadas'))
    ALTER TABLE dbo.EbdChamadas DROP CONSTRAINT UQ_EbdChamadas_Licao_Aluno;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'UX_EbdChamadas_Licao_Aluno' AND object_id = OBJECT_ID('dbo.EbdChamadas'))
    CREATE UNIQUE INDEX UX_EbdChamadas_Licao_Aluno
        ON dbo.EbdChamadas (LicaoId, AlunoId)
        WHERE AlunoId IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'conquistas_gestao')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('conquistas_gestao', N'Conquistas — Catálogo, Regras e Tipos de Evento');
GO

IF COL_LENGTH('dbo.ConquistasEventos', 'ChaveOrigem') IS NULL
    ALTER TABLE dbo.ConquistasEventos ADD ChaveOrigem NVARCHAR(100) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'UX_ConquistasEventos_Origem' AND object_id = OBJECT_ID('dbo.ConquistasEventos'))
    CREATE UNIQUE INDEX UX_ConquistasEventos_Origem
        ON dbo.ConquistasEventos (MembroId, TipoEvento, ChaveOrigem)
        WHERE ChaveOrigem IS NOT NULL;
GO
