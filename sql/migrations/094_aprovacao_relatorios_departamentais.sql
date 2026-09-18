-- ============================================================
-- Migração 094 — v5.3: Fluxo de aprovação de Relatórios Departamentais
-- (2 camadas: Área → Geral, + retificação por Presidente/Secretário Geral)
--
-- Pesquisa no próprio Regimento (já digerido neste README, ver FASE 5):
-- Região (CRA+TER) e Quadrante (CEQ) são colegiados representados por
-- DELEGAÇÃO (o Pastor de Área fala por eles, Art. 104-B) — não atores
-- diretos sobre Congregação/Departamento; Distrito é só FASE 9
-- (macroexpansão). Por isso o fluxo real fica em 2 camadas (Área → Geral),
-- exatamente como o protótipo modelou — mas a TRILHA é gravada com o mesmo
-- vocabulário de `Lideranca.EscopoTipo` (CONGREGACAO/AREA/DEPARTAMENTO/
-- GLOBAL, e já reservando REGIAO/QUADRANTE/DISTRITO pro dia em que a FASE 9
-- ativar essas estruturas) — pedido explícito do usuário: "profissional,
-- não genérico", já preparando o caminho sem fabricar poder que o
-- Regimento não sustenta hoje.
--
-- AprovacoesRelatorioDepartamental: trilha estruturada (quem, quando, em
-- que nível, que ação, comentário) — separada do AuditLog genérico, mesmo
-- padrão de SessoesMediacao/CredenciamentosAssembleia (histórico com
-- comentário é dado de domínio, não só log técnico).
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.AprovacoesRelatorioDepartamental', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AprovacoesRelatorioDepartamental (
        AprovacaoId               INT IDENTITY PRIMARY KEY,
        RelatorioDepartamentalId  INT NOT NULL REFERENCES dbo.RelatoriosDepartamentais(RelatorioDepartamentalId),
        NivelAprovador            NVARCHAR(20) NOT NULL,
        -- Mesmo vocabulário de Lideranca.EscopoTipo: CONGREGACAO | AREA |
        -- DEPARTAMENTO (Líder Geral) | GLOBAL — e já reservado pra
        -- REGIAO | QUADRANTE | DISTRITO quando a FASE 9 ativar essas
        -- estruturas (nenhuma migração nova vai precisar mudar esta coluna).
        Acao                      NVARCHAR(30) NOT NULL,
        -- ENVIOU | APROVOU | COMENTOU | CORRIGIU_VALORES | RETIFICOU
        Comentario                NVARCHAR(1000) NULL,
        MembroId                  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm                  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO
