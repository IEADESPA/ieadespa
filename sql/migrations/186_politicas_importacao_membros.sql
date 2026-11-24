-- ============================================================
-- Migração 186 — as políticas de retenção da IMPORTAÇÃO dos membros do sistema pago (FASE 10, Membros; 24/11/2026)
--
-- A guarda dos dados da importação (respostas dele de 23/11/2026): a prévia que não foi confirmada (com CPF, celular, mãe e pai) se apaga sozinha em 7 dias;
-- a lista dos que ficaram de fora (nome e motivo) fica 90 dias depois de a importação terminar. A rotina diária lê o prazo destas duas políticas
-- (api/shared/importacaoMembrosDb.js: POLITICA_PREVIA e POLITICA_FORA; sem a política, 7 e 90) e agora elas aparecem em Proteção de Dados → Políticas de
-- retenção, onde o Encarregado ajusta o prazo. A base legal e as finalidades são decisão da sessão (24/11/2026) a partir da regra dele e da LGPD; o texto
-- ele confirma antes da produção.
--
-- Idempotente: cada política entra só se não existe; o texto da base legal só troca o de partida (N'x'), para nunca regravar o que a tela editou.
-- Faixa de migrações: Membros até a 199 (o Financeiro a partir da 200).
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Membros — prévia da importação que não foi confirmada')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (N'Membros — prévia da importação que não foi confirmada', N'x', 7);
GO
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'LGPD art. 6º, III (necessidade) e art. 16 (eliminação ao fim do tratamento). Finalidade: conferir a planilha antes de gravar.'
WHERE Categoria = N'Membros — prévia da importação que não foi confirmada' AND BaseLegal = N'x';
GO

IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Membros — lista dos que ficaram de fora da importação')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (N'Membros — lista dos que ficaram de fora da importação', N'x', 90);
GO
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'LGPD art. 6º, III (necessidade) e art. 16 (eliminação ao fim do tratamento). Finalidade: a secretaria corrigir os cadastros que não entraram.'
WHERE Categoria = N'Membros — lista dos que ficaram de fora da importação' AND BaseLegal = N'x';
GO
