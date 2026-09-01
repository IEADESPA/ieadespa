-- ============================================================
-- Migração 015 — Admissão de membros (v1.1 — Estatuto Art. 6º / Regimento Art. 130).
--
-- O ciclo de vida do membro começa na admissão. O `MembroReferencia.DataAdmissao`
-- já existe desde o schema inicial (e é a data da ÚLTIMA recepção — Reg. Art. 131
-- §4º, II: "o relógio zera" a cada saída/retorno). Aqui entram os demais campos
-- exigidos pela v1.1:
--   - DataBatismo          : batismo nas águas (Art. 6º §1º, I).
--   - FormaAdmissao        : BATISMO / CARTA_MUDANCA / RECONCILIACAO / ACLAMACAO
--                            (lista fixa do Art. 6º §1º — regra jurídica, não catálogo).
--   - Origem               : procedência geral da admissão (evangelismo, retorno, etc.).
--   - IgrejaAnterior       : nome da igreja anterior (para Carta de Mudança).
--   - DataRitoRecebimento  : data do rito público e solene (Reg. Art. 130).
--   - NomeLidoRito         : nome como foi lido no ato ("leitura do nome" — Reg. Art. 130, II).
--   - MinistranteRito      : Pastor/Dirigente que apresentou à igreja e orou (Reg. Art. 130, II).
--
-- Todas as colunas são NULL: não podem quebrar membros já cadastrados antes desta
-- versão (dado histórico) e não alimentam cálculo de elegibilidade (Art. 7º/23º —
-- esse continua vindo de DataAdmissao/DataNascimento/DizimistaFiel).
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MembroReferencia') AND name = N'DataBatismo')
    ALTER TABLE dbo.MembroReferencia ADD DataBatismo DATE NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MembroReferencia') AND name = N'FormaAdmissao')
    ALTER TABLE dbo.MembroReferencia ADD FormaAdmissao NVARCHAR(30) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MembroReferencia') AND name = N'Origem')
    ALTER TABLE dbo.MembroReferencia ADD Origem NVARCHAR(150) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MembroReferencia') AND name = N'IgrejaAnterior')
    ALTER TABLE dbo.MembroReferencia ADD IgrejaAnterior NVARCHAR(150) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MembroReferencia') AND name = N'DataRitoRecebimento')
    ALTER TABLE dbo.MembroReferencia ADD DataRitoRecebimento DATE NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MembroReferencia') AND name = N'NomeLidoRito')
    ALTER TABLE dbo.MembroReferencia ADD NomeLidoRito NVARCHAR(200) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MembroReferencia') AND name = N'MinistranteRito')
    ALTER TABLE dbo.MembroReferencia ADD MinistranteRito NVARCHAR(150) NULL;
GO
