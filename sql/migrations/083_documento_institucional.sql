-- ============================================================
-- Migração 083 — Documento institucional: geração, assinatura e arquivo (vB.6)
--
-- CartasTransito.Protocolo: reaproveita o gerador atômico da vB.4
-- (shared/protocolo.js, tipo 'CARTA') — gerado sob demanda na primeira vez
-- que a carta é baixada em PDF, nunca antes (carta que nunca foi baixada
-- não "gasta" número).
--
-- TermosAssinados.HashConteudo: trilha de integridade (Art. 132/LGPD) — hash
-- SHA-256 do TEXTO do termo no momento da assinatura. Sem isso, se o texto
-- do catálogo (shared/termos.js) mudasse sem bump de VersaoTermo, não
-- haveria como detectar a divergência depois. Coluna nasce NULL pros
-- termos já assinados antes desta versão (não há como recalcular hash de
-- um texto que não foi capturado no momento — aceitável, é reforço daqui
-- pra frente, não retroativo).
--
-- Documentos.Categoria / AnexosGenericos.Categoria: link (por nome, contra
-- PoliticasRetencao.Categoria — por isso a UNIQUE nova) que dá a
-- PoliticasRetencao (v0.1, hoje só catálogo informativo) uma referência
-- real de quais documentos ela se aplica, sem rodar expurgo automático
-- (decisão da v0.1 continua de pé — isso é só "calculado na leitura",
-- igual o prazo de lavratura/cartório que GestaoDocumentos já calcula pra
-- Atas).
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.CartasTransito') AND name = N'Protocolo')
    ALTER TABLE dbo.CartasTransito ADD Protocolo NVARCHAR(30) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.TermosAssinados') AND name = N'HashConteudo')
    ALTER TABLE dbo.TermosAssinados ADD HashConteudo NVARCHAR(64) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.PoliticasRetencao') AND name = N'UQ_PoliticasRetencao_Categoria')
    ALTER TABLE dbo.PoliticasRetencao ADD CONSTRAINT UQ_PoliticasRetencao_Categoria UNIQUE (Categoria);
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Documentos') AND name = N'Categoria')
    ALTER TABLE dbo.Documentos ADD Categoria NVARCHAR(60) NULL REFERENCES dbo.PoliticasRetencao(Categoria);
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.AnexosGenericos') AND name = N'Categoria')
    ALTER TABLE dbo.AnexosGenericos ADD Categoria NVARCHAR(60) NULL REFERENCES dbo.PoliticasRetencao(Categoria);
GO

-- "Atas e Registros de Sessão/Presença" já existe no catálogo (migração 012)
-- e é exatamente o que Documentos.Tipo = 'ATA' representa — categoriza
-- retroativamente as Atas já registradas, sem esperar edição manual.
UPDATE dbo.Documentos SET Categoria = N'Atas e Registros de Sessão/Presença' WHERE Tipo = 'ATA' AND Categoria IS NULL;
GO
