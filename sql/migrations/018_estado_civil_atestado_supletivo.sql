-- ============================================================
-- Migração 018 — Estado Civil (modelo de Carta de Trânsito) e
-- Atestado de Trânsito Supletivo por autoatendimento (v1.4).
--
-- A Carta de Recomendação/Mudança impressa (GestaoCartas) passa a trazer o
-- Estado Civil do membro, como no modelo em uso pelas congregações
-- (Reg. Art. 131). Campo simples, editável na ficha da Pessoa — não é regra
-- jurídica (não entra em shared/estatuto.js).
--
-- O Atestado de Trânsito Supletivo (Reg. Art. 131 §2º, III, emitido pelo CEI
-- em caso de recusa da igreja de origem) passa a poder ser solicitado pelo
-- próprio membro em autoatendimento (SolicitarCarta) e é emitido de forma
-- automática/imediata: como o pedido já parte do próprio membro pelo sistema,
-- não há "competência de emissão" a intermediar (Dirigente/Secretário/CEI) —
-- mesmo espírito de desburocratização já aplicado à Carta de Mudança.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MembroReferencia') AND name = N'EstadoCivil')
    ALTER TABLE dbo.MembroReferencia ADD EstadoCivil NVARCHAR(20) NULL; -- SOLTEIRO / CASADO / VIUVO / DIVORCIADO / UNIAO_ESTAVEL
GO
