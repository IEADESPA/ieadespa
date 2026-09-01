-- ============================================================
-- Migração 014 — Cadeiras (Assentos) com prazo automático.
--
-- Cargo eletivo/nomeado (Tesoureiro, Secretário, Conselheiro Fiscal...) tem
-- mandato com tempo determinado — mesmo raciocínio já usado no Processo
-- Disciplinar (v0.2): a Secretaria informa a duração ao criar a cadeira, o
-- vencimento é CALCULADO NA LEITURA (sem job/timer), nunca fechado sozinho —
-- só marca "Mandato vencido" pra alguém confirmar/renovar, mas já para de
-- contar pro universo do órgão (shared/universo.js) assim que vence.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Assentos') AND name = N'DataTerminoPrevisao')
    ALTER TABLE dbo.Assentos ADD DataTerminoPrevisao DATE NULL;
GO
