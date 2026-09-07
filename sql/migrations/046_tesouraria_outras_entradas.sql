-- ============================================================
-- Migração 046 — v4.1.4: além de Dízimo/Oferta, a congregação pode ter
-- outras fontes de entrada (bazar, venda de campanha, evento etc.) — pedido
-- explícito, com exemplo real ("venda de canjica"). Diferente de Dízimo/
-- Oferta (que só passam pelo crivo mensal do Fechamento+liberação), toda
-- entrada do tipo OUTRA precisa de aprovação individual da Tesouraria
-- Geral ANTES de contar no fechamento — é dinheiro fora do fluxo regular,
-- então o controle é mais apertado, não mais frouxo.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.LancamentosTesouraria') AND name = N'Descricao')
    ALTER TABLE dbo.LancamentosTesouraria ADD Descricao NVARCHAR(300) NULL; -- obrigatório quando Tipo = 'OUTRA'
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.LancamentosTesouraria') AND name = N'StatusAprovacao')
    ALTER TABLE dbo.LancamentosTesouraria ADD StatusAprovacao NVARCHAR(20) NOT NULL DEFAULT 'NAO_APLICAVEL'; -- NAO_APLICAVEL | PENDENTE | APROVADO | REJEITADO
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.LancamentosTesouraria') AND name = N'AprovadoPor')
    ALTER TABLE dbo.LancamentosTesouraria ADD AprovadoPor INT NULL REFERENCES dbo.MembroReferencia(MembroId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.LancamentosTesouraria') AND name = N'AprovadoEm')
    ALTER TABLE dbo.LancamentosTesouraria ADD AprovadoEm DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.LancamentosTesouraria') AND name = N'MotivoRejeicao')
    ALTER TABLE dbo.LancamentosTesouraria ADD MotivoRejeicao NVARCHAR(300) NULL;
GO
