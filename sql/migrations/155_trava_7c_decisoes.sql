-- ============================================================
-- Migração 155 — Trava de Revisão 7-C: as duas decisões do responsável (23/10/2026).
--
--   DECISÃO 1 — Regras de dinheiro do voluntário (Regimento Art. 133 §4º, Art. 135 §2º e §3º; Lei 9.608/98): SÓ AVISAR, não bloquear.
--     1) Fornecedores.MembroId: o fornecedor pessoa física que é membro fica ligado à matrícula (opcional; nulo se não é membro). Só pessoa física (CHECK) e uma
--        matrícula por fornecedor (índice único filtrado).
--     2) SaidaAvisosVoluntario: os avisos que o tesoureiro LEU e CONFIRMOU ao lançar a saída (voluntário ativo, pagamento habitual, cachê/comissão), com o texto
--        mostrado, quem confirmou e quando. Não se edita nem se apaga (gatilho): é o registro de que o aviso foi dado.
--     3) Prazos: quantos pagamentos à mesma pessoa, em semanas diferentes, e em quantos dias, acendem o aviso de habitualidade (padrão: 3 em 60 dias).
--     4) A regra TESOURARIA_VOLUNTARIO_PAGO: o resumo do mês para a Tesouraria geral (rotina diária; um aviso por mês, só se houver caso).
--
--   DECISÃO 2 — Aptidão para funções com criança fora das escalas: DEPARTAMENTOS E LIDERANÇA (eventos ficaram fora, por decisão).
--     5) Departamentos.ContatoComMenores e Papeis.ContatoComMenores: a marca "tem contato com crianças e adolescentes". Nasce desligada; a União de Crianças
--        (UCADESPA, 0 a 11 anos — Regimento) nasce marcada só no lote que cria a coluna. Marcar e desmarcar é do nível geral, com a confirmação reforçada (na rota).
--     6) A regra MENORES_FUNCAO_SEM_APTIDAO (obrigatória): quem ocupa departamento ou cargo marcado e não está apto aparece para a Diretoria e para a Proteção de
--        crianças do nível geral — uma vez por pessoa e função, repetindo a cada mês enquanto durar. Ninguém sai do cargo sozinho: a decisão é humana.
--
-- Idempotente: seguro para reexecutar sem apagar dados. Nada aqui regrava o que a tela edita.
-- ============================================================

-- ---- 1) O fornecedor pessoa física ligado à matrícula ----
IF COL_LENGTH(N'dbo.Fornecedores', N'MembroId') IS NULL
    ALTER TABLE dbo.Fornecedores ADD MembroId INT NULL CONSTRAINT FK_Fornecedores_Membro REFERENCES dbo.MembroReferencia(MembroId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Fornecedores_MembroSoPF')
    ALTER TABLE dbo.Fornecedores ADD CONSTRAINT CK_Fornecedores_MembroSoPF CHECK (MembroId IS NULL OR Tipo = N'PF');
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Fornecedores_Membro' AND object_id = OBJECT_ID(N'dbo.Fornecedores'))
    CREATE UNIQUE INDEX UX_Fornecedores_Membro ON dbo.Fornecedores(MembroId) WHERE MembroId IS NOT NULL;
GO

-- ---- 2) Os avisos confirmados na saída ----
IF OBJECT_ID(N'dbo.SaidaAvisosVoluntario', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SaidaAvisosVoluntario (
        AvisoId                INT IDENTITY PRIMARY KEY,
        SaidaId                INT NOT NULL CONSTRAINT FK_SaidaAvisosVoluntario_Saida REFERENCES dbo.SaidasTesouraria(SaidaId),
        Codigo                 NVARCHAR(30) NOT NULL CONSTRAINT CK_SaidaAvisosVoluntario_Codigo CHECK (Codigo IS NOT NULL AND Codigo IN (N'VOLUNTARIO_ATIVO', N'HABITUALIDADE', N'CACHE_COMISSAO')),
        Texto                  NVARCHAR(600) NOT NULL,
        ConfirmadoPorMembroId  INT NOT NULL CONSTRAINT FK_SaidaAvisosVoluntario_Membro REFERENCES dbo.MembroReferencia(MembroId),
        ConfirmadoEm           DATETIME2 NOT NULL CONSTRAINT DF_SaidaAvisosVoluntario_Em DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_SaidaAvisosVoluntario UNIQUE (SaidaId, Codigo)
    );
END
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_SaidaAvisosVoluntario_Imutavel ON dbo.SaidaAvisosVoluntario AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
    BEGIN
        RAISERROR(N''O aviso confirmado na saída não se edita nem se apaga: é o registro de que o tesoureiro foi avisado.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 3) Os números do aviso de habitualidade (ajustáveis em Catálogos → Prazos) ----
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = N'TESOURARIA_HABITUAL_PAGAMENTOS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias)
    VALUES (N'TESOURARIA_HABITUAL_PAGAMENTOS', N'Tesouraria — quantos pagamentos à mesma pessoa, em semanas diferentes, acendem o aviso de habitualidade (Reg. Art. 135 §2º)', 3);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = N'TESOURARIA_HABITUAL_JANELA_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias)
    VALUES (N'TESOURARIA_HABITUAL_JANELA_DIAS', N'Tesouraria — em quantos dias se contam os pagamentos à mesma pessoa para o aviso de habitualidade', 60);
GO

-- ---- 4) O resumo do mês para a Tesouraria geral ----
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'TESOURARIA_VOLUNTARIO_PAGO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'TESOURARIA_VOLUNTARIO_PAGO', N'Tesouraria: pagamentos a voluntários e pagamentos habituais à mesma pessoa (resumo do mês)', N'FINANCEIRO', N'financeiro', N'GLOBAL', 1, 0, 0);
GO

-- ---- 5) A marca "tem contato com crianças e adolescentes" em departamentos e cargos ----
-- A União de Crianças nasce marcada SÓ quando a coluna é criada (o EXEC adia a compilação do UPDATE para depois do ALTER): depois disso, a marca é da tela.
IF COL_LENGTH(N'dbo.Departamentos', N'ContatoComMenores') IS NULL
BEGIN
    ALTER TABLE dbo.Departamentos ADD ContatoComMenores BIT NOT NULL CONSTRAINT DF_Departamentos_ContatoComMenores DEFAULT 0;
    EXEC(N'UPDATE dbo.Departamentos SET ContatoComMenores = 1 WHERE Sigla = N''UCADESPA''');
END
GO
IF COL_LENGTH(N'dbo.Papeis', N'ContatoComMenores') IS NULL
    ALTER TABLE dbo.Papeis ADD ContatoComMenores BIT NOT NULL CONSTRAINT DF_Papeis_ContatoComMenores DEFAULT 0;
GO

-- ---- 6) O aviso à Diretoria e à Proteção de crianças do nível geral ----
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'MENORES_FUNCAO_SEM_APTIDAO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'MENORES_FUNCAO_SEM_APTIDAO', N'Ministério com menores: departamento ou cargo com crianças ocupado por quem não está apto para função com menores', N'MENORES', NULL, NULL, 1, 1, 1);
GO
