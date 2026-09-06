-- ============================================================
-- Migração 028 — Comissão de Constituição, Justiça e Redação — CCJ (v2.4).
--
-- Das 5 Comissões Permanentes (Regimento, Art. 19-23), só a CCJ precisa de
-- tabela própria: é a única "eleita pelo Plenário" (Art. 19, I) — não dá pra
-- calcular de nenhum outro dado do sistema, ao contrário de:
--   - CFO (Art. 20): titulares do Conselho Fiscal + 1º/2º Tesoureiro — já sai
--     de Assentos, calculado (shared/comissoes.js).
--   - CEP (Art. 21): membros do CEI — idem, já sai de Assentos.
-- CDER (Art. 22, precisa do Reitor da AFM) e CME (Art. 23, precisa do cargo
-- "Secretário de Missões") ficam de fora — dependem de peça que não existe
-- ainda (ver README, v8.1 e FASE 9/v9.2).
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.ComissaoMembros') AND type = N'U')
BEGIN
    CREATE TABLE dbo.ComissaoMembros (
        ComissaoMembroId    INT IDENTITY PRIMARY KEY,
        Sigla               NVARCHAR(20) NOT NULL,   -- só 'CCJ' por enquanto
        MembroId            INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DataInicio          DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
        DataFim             DATE NULL,
        MotivoEncerramento  NVARCHAR(200) NULL,
        CriadoPor           INT NULL
    );
END
GO
