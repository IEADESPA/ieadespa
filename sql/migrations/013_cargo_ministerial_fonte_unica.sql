-- ============================================================
-- Migração 013 — CargoMinisterial vira a única fonte de verdade da escada
-- ministerial (Art. 71). Corrige um bug real: shared/universo.js calculava a
-- composição "por Ordenação" da CLI (Art. 15) lendo MembroReferencia.Funcao
-- (texto livre, digitado à mão) — quem só preenchia o catálogo novo
-- (CargoMinisterial, com sigla/ordem, v0.1) ficava invisível pro quórum da CLI.
--
-- Funcao continua existindo na tabela (nunca apagar dados reais), mas passa a
-- ser só um texto histórico/descritivo, escrito automaticamente pela esteira
-- de Consagrações (EvoluirConsagracao) — deixa de ser um campo editável na
-- ficha da pessoa (aba Funções sai do painel).
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

-- Liga cada Tipo de Consagração (catálogo configurável) ao Cargo Ministerial
-- que ele produz quando concluído — assim EvoluirConsagracao sabe o que
-- atualizar sem chutar por texto. Fica editável na tela de Catálogos.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.TiposConsagracao') AND name = N'CargoMinisterialResultante')
    ALTER TABLE dbo.TiposConsagracao ADD CargoMinisterialResultante NVARCHAR(30) NULL;
GO

-- Configuração inicial sugerida para os 5 tipos semeados na migração 006
-- (continua editável pela tela de Catálogos depois).
UPDATE dbo.TiposConsagracao SET CargoMinisterialResultante = 'PRESBITERO' WHERE Nome = 'Consagração a Presbítero' AND CargoMinisterialResultante IS NULL;
UPDATE dbo.TiposConsagracao SET CargoMinisterialResultante = 'EVANGELISTA' WHERE Nome = 'Consagração a Evangelista' AND CargoMinisterialResultante IS NULL;
UPDATE dbo.TiposConsagracao SET CargoMinisterialResultante = 'DIACONO' WHERE Nome = 'Separação ao Diaconato' AND CargoMinisterialResultante IS NULL;
GO

-- Backfill de MembroReferencia.CargoMinisterial a partir do que já estava em
-- Funcao (cadastro manual antigo + texto gravado por consagrações concluídas
-- antes desta migração) — só preenche quem ainda está NULL, nunca sobrescreve
-- um CargoMinisterial já definido.
UPDATE dbo.MembroReferencia SET CargoMinisterial = 'PASTOR' WHERE CargoMinisterial IS NULL AND Funcao = 'Pastor';
UPDATE dbo.MembroReferencia SET CargoMinisterial = 'EVANGELISTA' WHERE CargoMinisterial IS NULL AND Funcao = 'Evangelista';
UPDATE dbo.MembroReferencia SET CargoMinisterial = 'PRESBITERO' WHERE CargoMinisterial IS NULL AND Funcao = 'Presbítero';
UPDATE dbo.MembroReferencia SET CargoMinisterial = 'DIACONO' WHERE CargoMinisterial IS NULL AND Funcao = 'Diácono';
UPDATE dbo.MembroReferencia SET CargoMinisterial = 'MISSIONARIO' WHERE CargoMinisterial IS NULL AND Funcao IN ('Missionário', 'Missionária');
UPDATE dbo.MembroReferencia SET CargoMinisterial = 'AUXILIAR' WHERE CargoMinisterial IS NULL AND Funcao = 'Auxiliar';
UPDATE dbo.MembroReferencia SET CargoMinisterial = 'MEMBRO' WHERE CargoMinisterial IS NULL AND Funcao = 'Membro';
-- Texto de consagração concluída (ex: "Consagração a Presbítero") — aproximação por trecho.
UPDATE dbo.MembroReferencia SET CargoMinisterial = 'PRESBITERO' WHERE CargoMinisterial IS NULL AND Funcao LIKE '%Presb%';
UPDATE dbo.MembroReferencia SET CargoMinisterial = 'EVANGELISTA' WHERE CargoMinisterial IS NULL AND Funcao LIKE '%Evangelista%';
UPDATE dbo.MembroReferencia SET CargoMinisterial = 'PASTOR' WHERE CargoMinisterial IS NULL AND Funcao LIKE '%Pastor%';
UPDATE dbo.MembroReferencia SET CargoMinisterial = 'DIACONO' WHERE CargoMinisterial IS NULL AND (Funcao LIKE '%Diácon%' OR Funcao LIKE '%Diacon%');
UPDATE dbo.MembroReferencia SET CargoMinisterial = 'MISSIONARIO' WHERE CargoMinisterial IS NULL AND Funcao LIKE '%Mission%';
UPDATE dbo.MembroReferencia SET CargoMinisterial = 'AUXILIAR' WHERE CargoMinisterial IS NULL AND Funcao LIKE '%Auxiliar%';
GO
