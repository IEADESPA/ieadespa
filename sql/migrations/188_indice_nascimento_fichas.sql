-- ============================================================
-- Migração 188 — o índice do nascimento das fichas (FASE 10, Membros; missão C, o ensaio da importação no tamanho real, 26/11/2026)
--
-- O que o ensaio achou: a prévia da importação do sistema pago procura as fichas com o mesmo nome e nascimento de cada linha do arquivo
-- (MembroReferencia junto com a lista do arquivo, em JSON, pela DataNascimento e pelo nome comparável). Sem índice na DataNascimento, o plano depende
-- de quantas fichas o banco tem: com poucas (81, como a produção antes da importação grande), o banco lê a lista inteira do arquivo de novo para CADA
-- ficha (no ensaio de 6 mil linhas: 1.472.427 páginas e 2 s no computador, numa consulta só; no Basic, bem mais); com algumas centenas (381 ou mais),
-- ele muda sozinho de plano (18 mil páginas). A homologação, com mais de 5 mil fichas, nunca mostraria o caso da produção.
-- Com o índice, o plano é o mesmo em qualquer tamanho: a lista é lida uma vez e cada linha busca as fichas do mesmo nascimento (cerca de 30 mil
-- páginas, 43 a 53 ms, com 81 e com 5 mil fichas). A tela Fichas repetidas e o alerta da assembleia juntam as fichas pelo mesmo par e também usam.
--
-- O que nasce aqui: IX_MembroReferencia_DataNascimento (DataNascimento), com o Nome junto (INCLUDE), para a comparação do nome não voltar à tabela.
-- A regra 3 do Banco (api/CLAUDE.md): índice em toda coluna filtrada ou juntada.
-- Idempotente: seguro para reexecutar sem apagar dados.
-- Faixa de migrações: Membros até a 199 (o Financeiro a partir da 200).
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MembroReferencia_DataNascimento' AND object_id = OBJECT_ID(N'dbo.MembroReferencia'))
    CREATE INDEX IX_MembroReferencia_DataNascimento ON dbo.MembroReferencia (DataNascimento) INCLUDE (Nome);
GO
