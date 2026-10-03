-- ============================================================
-- Migração 134 — Abandono: quem abriu, a notificação final do Digital (fecho dos itens em aberto, 03/10/2026)
--
-- (1) Regra dos dois olhos: a tabela não guardava QUEM abriu o procedimento, então a mesma pessoa podia abrir e homologar a perda de membresia.
--     AbertoPor passa a ser gravado ao abrir; a homologação exige pessoa DIFERENTE. Procedimentos antigos ficam com AbertoPor nulo (não se sabe quem abriu,
--     e não se inventa): seguem como estão.
-- (2) Notificação final do Abandono Digital (Estatuto Art. 12 §2º: "incluída uma notificação final que reabra prazo de 15 dias"; Art. 11 §3º, II: o prazo
--     conta "da notificação ou da publicação do edital"). Antes a data da notificação do procedimento era a da ÚLTIMA tentativa de contato — que podia ter
--     acontecido semanas antes, e o procedimento já nascia com a defesa vencida. Agora abrir o procedimento Digital REGISTRA a notificação final (uma
--     tentativa de contato no canal escolhido, com a data do dia) e o prazo conta dela. TentativaNotificacaoFinalId aponta essa tentativa.
--
-- Só colunas novas e anuláveis: nada é apagado nem reescrito. Idempotente (reexecuta a cada deploy).
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ProcedimentosAbandono') AND name = N'AbertoPor')
    ALTER TABLE dbo.ProcedimentosAbandono ADD AbertoPor INT NULL CONSTRAINT FK_ProcedimentosAbandono_AbertoPor REFERENCES dbo.MembroReferencia(MembroId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ProcedimentosAbandono') AND name = N'TentativaNotificacaoFinalId')
    ALTER TABLE dbo.ProcedimentosAbandono ADD TentativaNotificacaoFinalId INT NULL CONSTRAINT FK_ProcedimentosAbandono_NotificacaoFinal REFERENCES dbo.TentativasContatoAbandono(TentativaId);
GO
