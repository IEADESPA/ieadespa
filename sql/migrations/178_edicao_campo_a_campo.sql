-- ============================================================
-- Migração 178 — A EDIÇÃO DA FICHA CAMPO A CAMPO e a CAIXA DE SUGESTÕES do membro (FASE 10, v10.1b passo 5, 18/11/2026)
--
-- Decisões do responsável (rodadas 8 e 10 da gestão de membros):
--  - a secretaria muda UM campo por vez e cada mudança fica com quem mudou o quê e quando (lido da trilha, AuditLog; o CPF sempre mascarado);
--  - o membro MUDA SOZINHO o contato, o endereço e o que estiver VAZIO, e SUGERE o resto; a secretaria confere na CAIXA DE SUGESTÕES e APLICA ou RECUSA
--    COM MOTIVO (a pessoa lê o motivo). A secretaria local aplica as da sua congregação; a área e a Geral acompanham; a Geral aplica tudo.
--
-- O que muda no banco (reaproveita as tabelas da 024, SolicitacoesEdicaoPessoa/SolicitacoesEdicaoCampos):
--  - SolicitacoesEdicaoCampos.MotivoDecisao: o motivo da recusa (obrigatório ao recusar, pela API);
--  - índices da caixa (pedidos pendentes por pessoa) e do histórico da ficha (a trilha de uma pessoa, da mais nova para a mais antiga).
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF COL_LENGTH(N'dbo.SolicitacoesEdicaoCampos', N'MotivoDecisao') IS NULL
    ALTER TABLE dbo.SolicitacoesEdicaoCampos ADD MotivoDecisao NVARCHAR(300) NULL;
GO

-- a caixa: os pedidos pendentes (e os campos de cada pedido)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SolicitacoesEdicaoPessoa_Status_Membro' AND object_id = OBJECT_ID(N'dbo.SolicitacoesEdicaoPessoa'))
    CREATE INDEX IX_SolicitacoesEdicaoPessoa_Status_Membro ON dbo.SolicitacoesEdicaoPessoa(Status, MembroId) INCLUDE (DataSolicitacao);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SolicitacoesEdicaoCampos_Solicitacao' AND object_id = OBJECT_ID(N'dbo.SolicitacoesEdicaoCampos'))
    CREATE INDEX IX_SolicitacoesEdicaoCampos_Solicitacao ON dbo.SolicitacoesEdicaoCampos(SolicitacaoId, Status) INCLUDE (NomeCampo);
GO

-- o histórico de alterações da ficha: a trilha de UMA pessoa, sem varrer a trilha inteira. Índice FILTRADO (só as linhas da ficha, Tabela = 'MembroReferencia';
-- a chave AuditId entra sozinha no fim e dá a ordem). Filtrado DE PROPÓSITO: a corrente de hashes (shared/auditoria.js) lê "a última linha da tabela @tabela"
-- com UPDLOCK/HOLDLOCK, por PARÂMETRO — um índice filtrado não serve a essa leitura, então o plano dela não muda (continua no fim da chave primária). Um índice
-- comum que ela pudesse usar travaria a faixa inteira dele e abriria espaço para impasse entre trilhas de tabelas diferentes.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AuditLog_FichaMembro' AND object_id = OBJECT_ID(N'dbo.AuditLog'))
    CREATE INDEX IX_AuditLog_FichaMembro ON dbo.AuditLog(RegistroId) WHERE Tabela = N'MembroReferencia';
GO
