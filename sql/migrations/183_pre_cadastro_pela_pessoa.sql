-- ============================================================
-- Migração 183 — A PESSOA COMPLETA O PRÓPRIO CADASTRO PELO E-MAIL (FASE 10, v10.1b, as sobras de Membros, 19/11/2026)
--
-- O desenho aprovado da esteira de cadastros (rodada 10, opção 1: o quadro por quem completa) tem a coluna "Falta dado: a pessoa completa": quando o pré-cadastro
-- chegou com o e-mail mas faltando um dado que só a própria pessoa sabe (o CPF, o nascimento, o sexo, o estado civil), a secretaria pede a ela; o sistema manda
-- um e-mail com um link que vale 7 dias e uma vez só; ela completa numa página pública (sem entrar no sistema) e o pré-cadastro passa de novo pela fila (entra
-- sozinho se ficou completo e não é parecido com ninguém).
--
-- O que muda aqui (PreCadastros):
--  - PedidoPessoaEm / PedidoPessoaPor: quando e quem pediu;
--  - PedidoPessoaTokenHash: o resumo (SHA-256) do código do link — o código em si nunca fica guardado;
--  - PedidoPessoaExpiraEm: o fim da validade do link (7 dias);
--  - PedidoPessoaRespondidoEm: quando a pessoa completou (o link deixa de valer na mesma hora).
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.PreCadastros') AND name = N'PedidoPessoaEm')
    ALTER TABLE dbo.PreCadastros ADD PedidoPessoaEm DATETIME2(0) NULL, PedidoPessoaPor INT NULL, PedidoPessoaTokenHash CHAR(64) NULL,
        PedidoPessoaExpiraEm DATETIME2(0) NULL, PedidoPessoaRespondidoEm DATETIME2(0) NULL;
GO

-- o link procura o pré-cadastro pelo resumo do código (um só por código)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_PreCadastros_PedidoPessoaToken' AND object_id = OBJECT_ID(N'dbo.PreCadastros'))
    CREATE UNIQUE INDEX UX_PreCadastros_PedidoPessoaToken ON dbo.PreCadastros (PedidoPessoaTokenHash) WHERE PedidoPessoaTokenHash IS NOT NULL;
GO
