-- ============================================================
-- Migração 137 — Remessa bancária: tratamento das divergências do retorno do banco.
--
-- O retorno do banco com ocorrência "00" só vira pagamento regular se a Saída ainda passar nas conferências do pagamento comum (tutela, saldo, Fundo PDQ, dado bancário
-- confirmado...). Quando não passa, o banco JÁ pagou: o fato não se apaga — o item da remessa fica com o status próprio DIVERGENTE (RemessaItens.Status é texto livre, não há
-- CHECK a mudar) e os motivos ficam guardados em JSON para a tela mostrar item por item. Esta migração só acrescenta as colunas do TRATAMENTO que a Tesouraria Geral faz
-- depois (reconhecer o pagamento ou encerrar o item, sempre com justificativa e autor).
--
-- Só acrescenta colunas anuláveis; nunca altera nem apaga linha. Idempotente: seguro para reexecutar.
-- ============================================================

IF COL_LENGTH(N'dbo.RemessaItens', N'MotivosJson') IS NULL
    ALTER TABLE dbo.RemessaItens ADD MotivosJson NVARCHAR(MAX) NULL;       -- [{ codigo, mensagem }] — todos os motivos da divergência
GO

IF COL_LENGTH(N'dbo.RemessaItens', N'TratamentoResolucao') IS NULL
    ALTER TABLE dbo.RemessaItens ADD TratamentoResolucao NVARCHAR(30) NULL; -- RECONHECER_PAGAMENTO | ENCERRAR
GO

IF COL_LENGTH(N'dbo.RemessaItens', N'TratamentoObservacao') IS NULL
    ALTER TABLE dbo.RemessaItens ADD TratamentoObservacao NVARCHAR(300) NULL;
GO

IF COL_LENGTH(N'dbo.RemessaItens', N'TratadoPor') IS NULL
    ALTER TABLE dbo.RemessaItens ADD TratadoPor INT NULL CONSTRAINT FK_RemessaItens_TratadoPor REFERENCES dbo.MembroReferencia(MembroId);
GO

IF COL_LENGTH(N'dbo.RemessaItens', N'TratadoEm') IS NULL
    ALTER TABLE dbo.RemessaItens ADD TratadoEm DATETIME2 NULL;
GO
