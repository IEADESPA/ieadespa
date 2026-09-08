-- ============================================================
-- Migração 049 — v4.3: Autolançamento do Dizimista com Confirmação do
-- Tesoureiro. Nada de gateway de pagamento (decisão explícita do usuário
-- — a igreja não vai processar PIX/cartão) — o dizimista só REGISTRA que
-- deu, o Tesoureiro Local CONFIRMA que recebeu (viu o dinheiro/PIX cair)
-- antes de contar. O Termo nº só é atribuído na confirmação, nunca no
-- autolançamento — assim nenhum número fica "furado" por algo que a
-- pessoa disse que deu mas nunca foi de fato confirmado.
-- Uma vez confirmado, o registro é o "comprovante" do dizimista (visível
-- em Minhas Contribuições) e fica protegido contra cancelamento pra
-- sempre — é a prova que a pessoa guarda, equivalente digital da
-- folhinha do bloco físico que nunca desaparece enquanto ela a guardar.
-- ============================================================

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.LancamentosTesouraria') AND name = N'TermoNumero' AND is_nullable = 0)
    ALTER TABLE dbo.LancamentosTesouraria ALTER COLUMN TermoNumero INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.LancamentosTesouraria') AND name = N'Origem')
    ALTER TABLE dbo.LancamentosTesouraria ADD Origem NVARCHAR(20) NOT NULL DEFAULT 'TESOUREIRO'; -- TESOUREIRO | AUTOLANCAMENTO
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.LancamentosTesouraria') AND name = N'StatusConfirmacao')
    ALTER TABLE dbo.LancamentosTesouraria ADD StatusConfirmacao NVARCHAR(20) NOT NULL DEFAULT 'CONFIRMADO'; -- PENDENTE | CONFIRMADO | REJEITADO
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.LancamentosTesouraria') AND name = N'ConfirmadoPor')
    ALTER TABLE dbo.LancamentosTesouraria ADD ConfirmadoPor INT NULL REFERENCES dbo.MembroReferencia(MembroId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.LancamentosTesouraria') AND name = N'ConfirmadoEm')
    ALTER TABLE dbo.LancamentosTesouraria ADD ConfirmadoEm DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.LancamentosTesouraria') AND name = N'MotivoRejeicaoConfirmacao')
    ALTER TABLE dbo.LancamentosTesouraria ADD MotivoRejeicaoConfirmacao NVARCHAR(300) NULL;
GO
