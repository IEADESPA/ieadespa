-- ============================================================
-- Migração 205 — FASE 10, Financeiro (módulo 2), o portão da parte 2 (26/11/2026, I2): o histórico da folha mostra o papel de quem marcou e de
-- quem desfez NA HORA do ato, e não o de hoje.
--
-- Até a 203, o histórico (shared/finBlocosDb.js, historicoDaFolha) lia o papel da liderança atual da pessoa: se a tesoureira de Vila Nova
-- passasse para a Central, as marcas antigas dela viravam "tesoureira da Central"; e quem desfez aparecia sempre como "Tesouraria Geral", por
-- suposição. Daqui em diante, o papel vai gravado com a linha do histórico, como o histórico o escreve ("tesoureira de Vila Nova", "tesoureiro
-- da Área 2", "Tesouraria Geral"):
-- 1. FinFolhas.PapelNaHora: o papel de quem marcou a folha, na hora (a sessão da Tesouraria Geral grava "Tesouraria Geral"; a da congregação
--    ou da área, o papel da liderança da pessoa lá). Sem liderança, fica vazio.
-- 2. FinFolhasDesfeitas.PapelNaHora (a cópia do de FinFolhas, quando a exceção sai de lá inteira) e FinFolhasDesfeitas.DesfeitaPapel (o de
--    quem desfez: só a Tesouraria Geral desfaz).
-- As linhas de antes ficam vazias: o histórico mostra só o nome, nunca um papel suposto. NVARCHAR(260): o nome do papel (100) com " de " e o
-- nome da congregação ou da área (150).
--
-- O número: a 204 é do incremento 3 (o lançamento de dízimos e ofertas), ainda no ramo; esta é a 205. Os centros de custo (dezembro, outro ramo)
-- tomam o número livre seguinte. As migrações rodam todas, em ordem, a cada deploy (api/scripts/executar-migracoes.js): a 205 antes da 204 não
-- muda nada, porque uma não depende da outra.
--
-- Idempotente: cada coluna só nasce se não existir; nenhum DROP; nenhum dado muda.
-- ============================================================

IF COL_LENGTH(N'dbo.FinFolhas', N'PapelNaHora') IS NULL
    ALTER TABLE dbo.FinFolhas ADD PapelNaHora NVARCHAR(260) NULL;
GO
IF COL_LENGTH(N'dbo.FinFolhasDesfeitas', N'PapelNaHora') IS NULL
    ALTER TABLE dbo.FinFolhasDesfeitas ADD PapelNaHora NVARCHAR(260) NULL;
GO
IF COL_LENGTH(N'dbo.FinFolhasDesfeitas', N'DesfeitaPapel') IS NULL
    ALTER TABLE dbo.FinFolhasDesfeitas ADD DesfeitaPapel NVARCHAR(260) NULL;
GO
