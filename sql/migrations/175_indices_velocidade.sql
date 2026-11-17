-- ============================================================
-- Migração 175 — índices das tabelas grandes (FASE 10, raio-x de velocidade, 17/11/2026; aprovado pelo responsável: "pode começar")
--
-- O raio-x (docs/pesquisa/raio-x-velocidade-2026.md) mediu as rotas com a massa grande (68.763 lançamentos, 8.351 saídas, 5.113 pessoas) e achou as tabelas de
-- dinheiro SEM nenhum índice de busca: toda consulta lia a tabela inteira. No SQL Server a chave estrangeira não cria índice sozinha. Estes índices servem aos
-- filtros e junções reais das rotas (a congregação e o mês dos lançamentos; a congregação e a situação das saídas; a conferência de duplicidade das saídas, que
-- comparava cada saída com todas as outras; os totais das campanhas; a conciliação e o fechamento; os relatórios dos departamentos; o extrato do banco; a lista
-- de pessoas por congregação e por nome).
--
-- Só cria índice (nada de dado nem de regra muda). Idempotente (cada um só se ainda não existe). Sem índice filtrado (WHERE): um índice filtrado exige as opções
-- de sessão ANSI em toda gravação, e um cliente com QUOTED_IDENTIFIER desligado passaria a falhar ao gravar. A 175 não depende da 174 (ramo v10-membros): o
-- executor (api/scripts/executar-migracoes.js) roda todas as migrações em ordem a cada deploy, e cada uma é idempotente.
-- ============================================================

-- Lançamentos da tesouraria: a tela pede congregação + mês; os totais por campanha e o "confirmado no período" dos relatórios
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_LancamentosTesouraria_Congregacao_Mes' AND object_id = OBJECT_ID(N'dbo.LancamentosTesouraria'))
    CREATE INDEX IX_LancamentosTesouraria_Congregacao_Mes ON dbo.LancamentosTesouraria (CongregacaoId, MesReferencia) INCLUDE (Status, StatusConfirmacao, Valor);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_LancamentosTesouraria_Campanha' AND object_id = OBJECT_ID(N'dbo.LancamentosTesouraria'))
    CREATE INDEX IX_LancamentosTesouraria_Campanha ON dbo.LancamentosTesouraria (CampanhaId, CongregacaoId) INCLUDE (Status, StatusConfirmacao, Valor);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_LancamentosTesouraria_CriadoEm' AND object_id = OBJECT_ID(N'dbo.LancamentosTesouraria'))
    CREATE INDEX IX_LancamentosTesouraria_CriadoEm ON dbo.LancamentosTesouraria (CriadoEm) INCLUDE (Status, StatusConfirmacao, Valor, CongregacaoId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_LancamentosTesouraria_Fechamento' AND object_id = OBJECT_ID(N'dbo.LancamentosTesouraria'))
    CREATE INDEX IX_LancamentosTesouraria_Fechamento ON dbo.LancamentosTesouraria (FechamentoId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_LancamentosTesouraria_Conciliacao' AND object_id = OBJECT_ID(N'dbo.LancamentosTesouraria'))
    CREATE INDEX IX_LancamentosTesouraria_Conciliacao ON dbo.LancamentosTesouraria (ConciliacaoId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_LancamentosTesouraria_Dizimista' AND object_id = OBJECT_ID(N'dbo.LancamentosTesouraria'))
    CREATE INDEX IX_LancamentosTesouraria_Dizimista ON dbo.LancamentosTesouraria (DizimistaId);
GO

-- Saídas: a lista por congregação e situação; a conferência de duplicidade (mesmo fornecedor, mesmo valor, até 7 dias); os pagos no período
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SaidasTesouraria_Congregacao_Status' AND object_id = OBJECT_ID(N'dbo.SaidasTesouraria'))
    CREATE INDEX IX_SaidasTesouraria_Congregacao_Status ON dbo.SaidasTesouraria (CongregacaoId, Status) INCLUDE (SolicitadoEm);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SaidasTesouraria_Fornecedor_Valor' AND object_id = OBJECT_ID(N'dbo.SaidasTesouraria'))
    CREATE INDEX IX_SaidasTesouraria_Fornecedor_Valor ON dbo.SaidasTesouraria (FornecedorId, Valor) INCLUDE (Status, SolicitadoEm);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SaidasTesouraria_Status_PagoEm' AND object_id = OBJECT_ID(N'dbo.SaidasTesouraria'))
    CREATE INDEX IX_SaidasTesouraria_Status_PagoEm ON dbo.SaidasTesouraria (Status, PagoEm) INCLUDE (Valor);
GO

-- Pessoas: a lista por congregação (o escopo no banco desde 13/11) e a ordem/busca por nome
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MembroReferencia_Congregacao_Status' AND object_id = OBJECT_ID(N'dbo.MembroReferencia'))
    CREATE INDEX IX_MembroReferencia_Congregacao_Status ON dbo.MembroReferencia (CongregacaoId, Status) INCLUDE (SituacaoMembro);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MembroReferencia_Nome' AND object_id = OBJECT_ID(N'dbo.MembroReferencia'))
    CREATE INDEX IX_MembroReferencia_Nome ON dbo.MembroReferencia (Nome);
GO

-- Relatórios dos departamentos: as aprovações de cada relatório (13.790 linhas na massa, sem índice)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AprovacoesRelatorioDepartamental_Relatorio' AND object_id = OBJECT_ID(N'dbo.AprovacoesRelatorioDepartamental'))
    CREATE INDEX IX_AprovacoesRelatorioDepartamental_Relatorio ON dbo.AprovacoesRelatorioDepartamental (RelatorioDepartamentalId);
GO

-- Conciliação: as linhas de cada extrato do banco
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ExtratoLinhas_Extrato' AND object_id = OBJECT_ID(N'dbo.ExtratoLinhas'))
    CREATE INDEX IX_ExtratoLinhas_Extrato ON dbo.ExtratoLinhas (ExtratoId);
GO
