-- ============================================================
-- Migração 146 — Trava 7-B (20/10/2026): proteção de crianças, achados da revisão
-- (ECA Arts. 13, 70-B parágrafo único e 245; Lei 14.344/2022, arts. 23 e 26)
--
--   1) "A pessoa envolvida é da liderança desta congregação": a marca que quem registra o incidente pode dar. Marcada — ou com o envolvido registrado sem matrícula
--      válida (só o nome, ou uma matrícula que não existe), o que o sistema calcula das linhas de IncidenteEnvolvidos — o caso fica SÓ com o nível geral (Diretoria e
--      Comitê): o Dirigente local não recebe o aviso, não vê a fila nem lê o relato (shared/protecaoDb.js, somenteNivelGeral). Antes, a exclusão do envolvido era só
--      pela matrícula, e o Dirigente apontado só pelo nome lia o próprio caso. A marca só pode ser LIGADA: desligá-la depois devolveria o caso a quem é apontado.
--   2) O título do aviso do relógio: a lei não dá prazo de horas, manda comunicar imediatamente; as 24 horas são o prazo máximo interno da Igreja.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

-- ---- 1) A marca "envolvido da liderança local" ----

IF COL_LENGTH(N'dbo.IncidentesProtecao', N'EnvolvidoDaLideranca') IS NULL
    ALTER TABLE dbo.IncidentesProtecao ADD EnvolvidoDaLideranca BIT NOT NULL CONSTRAINT DF_IncidentesProtecao_Lideranca DEFAULT 0;
GO

-- Gatilho à parte (o TR_IncidentesProtecao_Protegido da migração 144 segue como está): a marca não volta de 1 para 0.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_IncidentesProtecao_LiderancaSoLiga ON dbo.IncidentesProtecao AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.IncidenteId = i.IncidenteId WHERE d.EnvolvidoDaLideranca = 1 AND i.EnvolvidoDaLideranca = 0)
    BEGIN
        RAISERROR(N''A marca "a pessoa envolvida é da liderança desta congregação" não se desfaz: o caso segue só com a Diretoria e o Comitê.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 2) O título do aviso do relógio ----

UPDATE dbo.NotificacaoRegras SET Titulo = N'Proteção: comunicar o Conselho Tutelar imediatamente (prazo máximo da Igreja: 24 horas)'
WHERE Chave = N'PROTECAO_PRAZO_24H' AND Titulo <> N'Proteção: comunicar o Conselho Tutelar imediatamente (prazo máximo da Igreja: 24 horas)';
GO
