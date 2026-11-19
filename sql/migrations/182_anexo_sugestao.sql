-- ============================================================
-- Migração 182 — O ANEXO DA SUGESTÃO (FASE 10, v10.1b, as sobras de Membros, 19/11/2026)
--
-- O desenho aprovado do fluxo das sugestões (rodada 10, 3º passo) deixa o membro anexar a foto do documento que prova a mudança (a certidão de casamento, o
-- batismo noutra igreja...). A secretaria vê o documento na caixa de sugestões, antes de aplicar ou recusar.
--
-- O que muda aqui:
--  - SolicitacoesEdicaoPessoa ganha AnexoNome (o nome do arquivo no armazenamento privado, "sug-...") e AnexoTipo (image/jpeg, image/png, image/webp ou
--    application/pdf). Minimização: quando a sugestão termina de ser decidida, o arquivo sai do armazenamento e as duas colunas voltam a NULL (a decisão
--    fica registrada; o documento já cumpriu o papel dele).
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.SolicitacoesEdicaoPessoa') AND name = N'AnexoNome')
    ALTER TABLE dbo.SolicitacoesEdicaoPessoa ADD AnexoNome NVARCHAR(400) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.SolicitacoesEdicaoPessoa') AND name = N'AnexoTipo')
    ALTER TABLE dbo.SolicitacoesEdicaoPessoa ADD AnexoTipo NVARCHAR(40) NULL;
GO
