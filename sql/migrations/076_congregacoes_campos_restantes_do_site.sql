-- ============================================================
-- Migração 076 — Congregações: últimos campos reais vindos do site (vC.2)
-- A migração 075 trouxe endereço/bairro/cidade/estado/horário/mapa. Ao
-- desenhar a migração de dado de verdade (Directus -> aqui), apareceram
-- mais 3 campos que a coleção "congregacoes" do site guarda e que também
-- não têm de onde vir a não ser digitados: CEP, uma nota curta sobre como
-- chegar/entrar (ex: "entrada pela lateral"), e a string de busca do Google
-- Maps já confirmada (Places) — usada pelo site pra decidir quem entra no
-- recurso "qual está mais perto de você".
--
-- Deliberadamente NÃO entram aqui (ficam só no site/Directus, por serem
-- conteúdo editorial ou artefato histórico de transição, não dado
-- estrutural que o sistema de governança precisa pra operar):
-- - "historia" (texto longo, editorial, sem uso fora do site);
-- - "address_new"/"neighborhood_new" (endereço antigo x novo por causa de
--   uma mudança de CEP already ocorrida) — na migração de dado real, entra
--   só o endereço ATUAL (novo se existir, senão o antigo) em Endereco/
--   Bairro, sem carregar a complexidade da dupla versão pro schema novo;
-- - "sort" (ordem de exibição no site) — lista aqui em ordem alfabética
--   (já é o que CongregacoesPublico faz) é suficiente, não precisa de
--   coluna própria.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Congregacoes') AND name = N'Cep')
    ALTER TABLE dbo.Congregacoes ADD Cep NVARCHAR(10) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Congregacoes') AND name = N'NotaEndereco')
    ALTER TABLE dbo.Congregacoes ADD NotaEndereco NVARCHAR(300) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Congregacoes') AND name = N'GoogleMapsPlaceQuery')
    ALTER TABLE dbo.Congregacoes ADD GoogleMapsPlaceQuery NVARCHAR(300) NULL;
GO
