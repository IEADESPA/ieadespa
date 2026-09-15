-- ============================================================
-- Migração 084 — LGPD: base legal corrigida e retenção que executa (vB.8)
--
-- "Dados de Ex-Membro (pós-Carta de Mudança)": a minimização de 30 dias
-- (Reg. Art. 132 §2º) já existia desde a v1.5/vC.3 (api/GestaoCartas,
-- ação "processar"), mas o número 30 estava hardcoded no código
-- (DIAS_MINIMIZACAO), sem nenhuma relação com PoliticasRetencao — que,
-- apesar de existir desde a v0.1, nunca EXECUTAVA nada de verdade (só
-- catálogo informativo, ver migração 012). Esta linha faz a política
-- passar a comandar o número de verdade (shared/minimizacaoLgpd.js lê
-- DiasRetencao daqui, com 30 como fallback se a política for desativada
-- por engano) — primeira política do catálogo que efetivamente aciona um
-- expurgo/minimização real, sempre preservando o Registro Histórico
-- Mínimo (nunca apaga o que o Regimento exige manter: nome, matrícula,
-- datas centrais, motivo/data de saída).
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Dados de Ex-Membro (pós-Carta de Mudança)')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (
        N'Dados de Ex-Membro (pós-Carta de Mudança)',
        N'Regimento Interno, Art. 132 §2º — minimização de dados operacionais 30 dias após a confirmação da Carta de Mudança; Registro Histórico Mínimo preservado por obrigação legal (LGPD Art. 16, I).',
        30
    );
GO
