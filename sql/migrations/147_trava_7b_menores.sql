-- ============================================================
-- Migração 147 — Trava de Revisão 7-B: ministério com menores, portão da EBD e saída da sala do check-in
--
-- Achados da revisão da Trava 7-B (20/10/2026) que pedem banco:
--   1) a regra MENORES_VISTORIAS_A_RENOVAR nasceu na 143 sem Obrigatoria (o plano da v7.7 diz que os avisos do ministério com menores não se desligam).
--      Era a única regra MENORES_* da 143 sem a marca; as do check-in (145) já nasceram obrigatórias;
--   2) o aviso novo CHECKIN_SAIDA_OBRIGATORIA: quando quem está na sala do check-in deixa de ser apto (rotina diária, rotina horária da proteção ou ato da
--      Diretoria/Comitê), o sistema encerra a presença na sala e avisa, na hora, o líder da equipe e a gestão da congregação ("uma pessoa da equipe precisa sair
--      da sala agora"), sem o motivo e sem nome de criança. Obrigatória (o destinatário não desliga), por e-mail e, onde a coluna existe (082), por push.
--
-- Nada de tabela nova: a presença e o evento VOLUNTARIO_SAIU já existem na 145.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

-- ---- 1) O aviso mensal das certidões a renovar passa a ser obrigatório ----

UPDATE dbo.NotificacaoRegras SET Obrigatoria = 1 WHERE Chave = N'MENORES_VISTORIAS_A_RENOVAR' AND Obrigatoria = 0;
GO

-- ---- 2) A saída obrigatória da sala do check-in ----

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CHECKIN_SAIDA_OBRIGATORIA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'CHECKIN_SAIDA_OBRIGATORIA', N'Check-in infantil: uma pessoa da equipe precisa sair da sala agora', N'MENORES', NULL, NULL, 1, 1);
GO
-- (lote separado: a coluna CanalPush é da migração 082; num banco sem ela, o UPDATE nem compila — por isso vai por EXEC dentro do IF)
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.NotificacaoRegras') AND name = N'CanalPush')
    EXEC(N'UPDATE dbo.NotificacaoRegras SET CanalPush = 1 WHERE Chave = N''CHECKIN_SAIDA_OBRIGATORIA'' AND CanalPush = 0;');
GO
-- quem já tinha a regra (reaplicação) continua com ela obrigatória e com e-mail
UPDATE dbo.NotificacaoRegras SET Obrigatoria = 1, CanalEmail = 1 WHERE Chave = N'CHECKIN_SAIDA_OBRIGATORIA' AND (Obrigatoria = 0 OR CanalEmail = 0);
GO
