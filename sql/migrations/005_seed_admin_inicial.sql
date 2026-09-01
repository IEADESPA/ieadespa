-- ============================================================
-- Migração 005 — Seed do primeiro acesso administrativo
-- (Presidente + Secretário Geral, ambos com permissão GLOBAL/total).
--
-- Só roda se a tabela Lideranca estiver VAZIA — ou seja, só cria o
-- PRIMEIRO acesso do sistema, uma única vez. Se já existir qualquer
-- liderança cadastrada (mesmo que não seja esta), o bloco inteiro é
-- pulado — nunca sobrescreve dado real que já esteja no banco.
--
-- Senhas gravadas como hash scrypt salgado (mesmo formato e mesma
-- função de api/shared/auth.js:hashSenha) — nunca texto puro. Troque
-- a senha pela tela de Permissões assim que conseguir logar a
-- primeira vez.
-- ============================================================

-- Papel "Presidente" (GLOBAL, mesma amplitude de permissões do Secretário Geral).
IF NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = 'Presidente')
BEGIN
    INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes)
    VALUES ('Presidente', 'GLOBAL', 'reunioes,assembleia,cli,pessoas,permissoes,consagracoes,estrutura,catalogos,financeiro,relatorios,auditoria,disciplina');
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Lideranca)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.MembroReferencia WHERE MembroId = 1)
        INSERT INTO dbo.MembroReferencia (MembroId, Nome, Status, SituacaoMembro)
        VALUES (1, 'Mariano Fernandes Moreira', 'ATIVO', 'EM_COMUNHAO');

    IF NOT EXISTS (SELECT 1 FROM dbo.MembroReferencia WHERE MembroId = 2)
        INSERT INTO dbo.MembroReferencia (MembroId, Nome, Status, SituacaoMembro)
        VALUES (2, 'Mateus Henrique de Oliveira Moreira', 'ATIVO', 'EM_COMUNHAO');

    INSERT INTO dbo.Lideranca (MembroId, PapelId, EscopoTipo, EscopoId, SenhaHash)
    SELECT 1, PapelId, 'GLOBAL', NULL, '3c70cb7fcecc9a32b43d0549182f150e:d05c584d7e07adc03b56ad30ac24601ca91e4fcb152c36c90e0dd27d1cffb6de997f992fa5ff35f4736402626622ef1d60989a5ff8a0603896d1d68409e0117e'
    FROM dbo.Papeis WHERE Nome = 'Presidente';

    INSERT INTO dbo.Lideranca (MembroId, PapelId, EscopoTipo, EscopoId, SenhaHash)
    SELECT 2, PapelId, 'GLOBAL', NULL, '6c8ed108e92268cef6bbe444ce3ba215:56f0cd018ceeb4ad1c04f18c5a415533aa48fbdc8901eb56aa547933b93ef0c955cf534d9af76554f4f8c9eeb7839dc015b3f3df875b1f6b8bdbb75bb47d6ed7'
    FROM dbo.Papeis WHERE Nome = 'Secretário Geral';
END
GO
