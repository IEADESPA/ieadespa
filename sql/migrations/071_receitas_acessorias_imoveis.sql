-- ============================================================
-- Migração 071 — v4.21: Receitas acessórias e imóveis.
-- Súmula Vinculante 52 / RE 578.562: a imunidade do imóvel alugado ou
-- cedido a terceiros só se mantém SE o valor arrecadado for aplicado
-- nas finalidades essenciais — e o ônus da prova é da igreja. Toda
-- receita acessória (bazar, estacionamento, cessão de salão, cantina de
-- evento) nasce com o destino já declarado (AplicacaoFinalisticaDescricao),
-- nunca só como entrada de caixa solta.
-- Além disso, o patrimônio (v4.11, BensPatrimoniais Tipo = IMOVEL) só
-- registra escritura/título — não a situação de imunidade tributária do
-- imóvel em si (IPTU/ITBI), que tem processo, vigência e renovação
-- próprios na prefeitura.
-- ============================================================

-- Receita acessória, sempre com vínculo obrigatório a uma aplicação
-- finalística (Súmula Vinculante 52). Pode nascer solta (bazar,
-- estacionamento) ou automaticamente a partir de uma Cessão de Templo
-- onerosa (v4.18) — CessaoTemploId amarra as duas.
IF OBJECT_ID(N'dbo.ReceitasAcessorias', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ReceitasAcessorias (
        ReceitaAcessoriaId            INT IDENTITY PRIMARY KEY,
        CongregacaoId                 INT NULL REFERENCES dbo.Congregacoes(CongregacaoId), -- NULL = Sede/Matriz
        Tipo                          NVARCHAR(30) NOT NULL, -- BAZAR | ESTACIONAMENTO | CESSAO_SALAO | CANTINA_EVENTO | OUTROS
        BemId                         INT NULL REFERENCES dbo.BensPatrimoniais(BemId), -- imóvel de origem, quando houver
        CessaoTemploId                INT NULL REFERENCES dbo.CessoesTemplo(CessaoId), -- nasce sozinha quando a cessão (v4.18) é onerosa
        EventoDescricao               NVARCHAR(300) NULL,
        Valor                         DECIMAL(12,2) NOT NULL,
        DataRecebimento               DATE NOT NULL,
        AplicacaoFinalisticaDescricao NVARCHAR(500) NOT NULL, -- obrigatório: pra onde o valor é/foi aplicado nas atividades essenciais
        SaidaId                       INT NULL REFERENCES dbo.SaidasTesouraria(SaidaId), -- comprovação formal, quando a aplicação já virou Saída lançada
        RegistradoPor                 INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm                      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Situação de imunidade tributária por imóvel (IPTU/ITBI) — 1:1 com
-- BensPatrimoniais (Tipo = IMOVEL). Vigência e alerta de renovação
-- calculados na leitura, mesmo espírito das apólices de seguro (v4.16).
IF OBJECT_ID(N'dbo.ImoveisSituacaoFiscal', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ImoveisSituacaoFiscal (
        ImovelSituacaoFiscalId  INT IDENTITY PRIMARY KEY,
        BemId                   INT NOT NULL UNIQUE REFERENCES dbo.BensPatrimoniais(BemId),
        IptuStatus              NVARCHAR(20) NOT NULL DEFAULT 'EM_ANALISE', -- ISENTO | EM_ANALISE | NEGADO
        IptuNumeroProcesso      NVARCHAR(50) NULL,
        IptuVigenciaInicio      DATE NULL,
        IptuVigenciaFim         DATE NULL,
        ItbiStatus              NVARCHAR(20) NOT NULL DEFAULT 'NAO_APLICAVEL', -- ISENTO | EM_ANALISE | NEGADO | NAO_APLICAVEL
        ItbiNumeroProcesso      NVARCHAR(50) NULL,
        ItbiDataReconhecimento  DATE NULL,
        RegistradoPor           INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm                DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        AtualizadoEm            DATETIME2 NULL
    );
END
GO
