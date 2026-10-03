-- ============================================================
-- Migração 124 — Defesa em profundidade no banco: UMA linha de liderança por pessoa.
--
-- A rota GestaoLideranca trata a liderança como "uma linha por pessoa": se a matrícula já tem acesso, ATUALIZA o papel/escopo/senha em vez de criar outra
-- (SELECT antes do INSERT). Dois pedidos simultâneos para uma pessoa ainda sem acesso furam essa checagem e criam DUAS linhas — e o login só carrega um cargo próprio
-- (o mais amplo cuja senha confere), então a segunda linha viraria um acesso que a tela de permissões não mostra como duplicado. Este índice ÚNICO faz o próprio banco
-- recusar a segunda linha (a rota devolve 409 com mensagem amigável).
--
-- Mesma regra de segurança do deploy das migrações 127 a 131:
--   * só é criado se NÃO houver repetição hoje (a migração roda a CADA deploy e nunca pode derrubá-lo);
--   * havendo repetição, não corrige nada à força: só imprime um AVISO com a CONTAGEM (o log do GitHub de repositório público é público: nunca matrícula ou nome) e
--     segue. Depois que a Secretaria geral resolver a duplicata (manter a linha certa e remover a outra), o próximo deploy cria o índice sozinho;
--   * a criação vai em TRY/CATCH: uma repetição que surja entre a conferência e a criação vira aviso, não falha.
-- Nunca apaga nem altera linha alguma. Cargo VENCIDO (AtivoAte no passado) também conta: a rota reaproveita a linha vencida para renovar o mandato, não cria outra.
-- Conferência: SELECT MembroId, COUNT(*) FROM dbo.Lideranca GROUP BY MembroId HAVING COUNT(*) > 1;
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

DECLARE @repetidos INT;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Lideranca_Membro' AND object_id = OBJECT_ID(N'dbo.Lideranca'))
BEGIN
    SELECT @repetidos = COUNT(*) FROM (SELECT 1 AS x FROM dbo.Lideranca GROUP BY MembroId HAVING COUNT(*) > 1) d;
    IF @repetidos > 0
        PRINT N'AVISO migração 124: índice UX_Lideranca_Membro NÃO criado — há ' + CAST(@repetidos AS NVARCHAR(12))
            + N' pessoa(s) com mais de uma linha de liderança em Lideranca. Resolva e o próximo deploy cria o índice sozinho (consulta de conferência no cabeçalho da migração).';
    ELSE
    BEGIN
        BEGIN TRY
            CREATE UNIQUE INDEX UX_Lideranca_Membro ON dbo.Lideranca (MembroId);
        END TRY
        BEGIN CATCH
            PRINT N'AVISO migração 124: índice UX_Lideranca_Membro NÃO criado — ' + ERROR_MESSAGE();
        END CATCH
    END
END
GO
