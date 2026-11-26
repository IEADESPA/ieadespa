-- ============================================================
-- Migração 184 — O "QUERO ME CADASTRAR" DO SITE: A CHAVE DO ENVIO (FASE 10, v10.1b, as sobras de Membros, 21/11/2026)
--
-- Achado da revisão de 20/11/2026: quando o site desiste de esperar o sistema (prazo esgotado) e a pessoa envia de novo, o
-- sistema pode ter gravado o primeiro envio e grava o segundo também: dois pré-cadastros da mesma pessoa.
--
-- O que muda aqui (PreCadastros):
--  - EnvioId: o identificador de UM envio do formulário, gerado pela página do site (32 letras hexadecimais, ao acaso). O mesmo
--    envio repetido traz o mesmo identificador; o sistema devolve o mesmo resultado sem gravar de novo. Não é segredo nem dado
--    pessoal (é só um número ao acaso); os pré-cadastros lançados pelo líder ou pela secretaria ficam sem ele (NULL);
--  - o índice único filtrado UX_PreCadastros_Envio: a última trava (dois envios iguais ao mesmo tempo nunca viram dois).
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.PreCadastros') AND name = N'EnvioId')
    ALTER TABLE dbo.PreCadastros ADD EnvioId CHAR(32) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PreCadastros_Envio' AND parent_object_id = OBJECT_ID(N'dbo.PreCadastros'))
    ALTER TABLE dbo.PreCadastros ADD CONSTRAINT CK_PreCadastros_Envio CHECK (EnvioId IS NULL OR (LEN(EnvioId) = 32 AND EnvioId NOT LIKE '%[^0-9a-f]%'));
GO

-- o mesmo envio é um pré-cadastro só
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_PreCadastros_Envio' AND object_id = OBJECT_ID(N'dbo.PreCadastros'))
    CREATE UNIQUE INDEX UX_PreCadastros_Envio ON dbo.PreCadastros (EnvioId) WHERE EnvioId IS NOT NULL;
GO
