-- ============================================================
-- Migração 075 — Congregações: endereço, bairro, cidade, mapa (vC.2)
-- Estende Congregacoes com os campos que hoje só existem soltos na
-- coleção "congregacoes" do Directus (site institucional), pra virar
-- fonte única de dado. Só entra aqui o que não existe em lugar nenhum
-- do sistema hoje e não dá pra calcular a partir de outra tabela —
-- endereço/bairro/cidade/estado/coordenadas não têm de onde vir a não
-- ser digitados uma vez e mantidos aqui.
--
-- NomePastor NÃO entra como coluna: quem dirige uma congregação hoje já
-- é 100% calculável em Lideranca (PapelId -> Papeis.Nome = 'Dirigente de
-- Congregação', EscopoTipo = 'CONGREGACAO', EscopoId = CongregacaoId,
-- respeitando AtivoAte), exatamente como api/shared/universo.js já faz
-- pra montar a composição da CLI. Guardar o nome aqui de novo duplicaria
-- dado e ia dessincronizar assim que alguém trocasse de dirigente sem
-- lembrar de atualizar os dois lugares — ver GestaoCongregacoes (calcula
-- na leitura, nunca por marcação manual).
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Congregacoes') AND name = N'Slug')
    ALTER TABLE dbo.Congregacoes ADD Slug NVARCHAR(150) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Congregacoes') AND name = N'Endereco')
    ALTER TABLE dbo.Congregacoes ADD Endereco NVARCHAR(300) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Congregacoes') AND name = N'Bairro')
    ALTER TABLE dbo.Congregacoes ADD Bairro NVARCHAR(150) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Congregacoes') AND name = N'Cidade')
    ALTER TABLE dbo.Congregacoes ADD Cidade NVARCHAR(150) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Congregacoes') AND name = N'Estado')
    ALTER TABLE dbo.Congregacoes ADD Estado NVARCHAR(2) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Congregacoes') AND name = N'Horarios')
    ALTER TABLE dbo.Congregacoes ADD Horarios NVARCHAR(500) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Congregacoes') AND name = N'MapsUrl')
    ALTER TABLE dbo.Congregacoes ADD MapsUrl NVARCHAR(500) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Congregacoes') AND name = N'Lat')
    ALTER TABLE dbo.Congregacoes ADD Lat DECIMAL(9,6) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Congregacoes') AND name = N'Lng')
    ALTER TABLE dbo.Congregacoes ADD Lng DECIMAL(9,6) NULL;
GO
