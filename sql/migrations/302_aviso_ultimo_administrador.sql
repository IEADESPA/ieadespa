-- ============================================================
-- Migração 302 — o aviso à Geral quando a última pessoa que administra os acessos confirma a Carta de Mudança.
--
-- Regra do responsável ("A movimentação", 23/11/2026): o membro sai sozinho, pelo aplicativo, na hora, seja qual for o cargo; ninguém
-- confirma por ele e não se prende membro. Decisão de 25/11/2026: se quem confirma a carta é a última pessoa com a permissão
-- "permissoes" ativa, a confirmação vale do mesmo jeito, e a Geral (quem tem "pessoas" no nível geral) é avisada NA CONFIRMAÇÃO,
-- enquanto ainda há tempo de conceder a permissão a outra pessoa (api/SolicitarCarta e shared/travaPermissoes.js). A regra não tem
-- detector na rodada horária (shared/notificacaoMotor.js a deixa inerte): o aviso nasce na hora da confirmação.
--
-- Obrigatória (não respeita o "não quero e-mail desta categoria"): é o aviso de que a igreja pode ficar sem quem administre os acessos.
-- Número 302: acima das faixas em construção (Membros até a 187, Financeiro até a 203) e depois da 300 e da 301 deste ramo.
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'ACESSO_ULTIMO_ADMIN_SAINDO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'ACESSO_ULTIMO_ADMIN_SAINDO', N'A última pessoa que administra os acessos confirmou a Carta de Mudança', N'ADMINISTRACAO', N'pessoas', N'GLOBAL', 1, 1, 1);
GO
