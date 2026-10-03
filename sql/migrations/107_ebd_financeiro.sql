-- ============================================================
-- Migração 107 — v6.7: EBD — Financeiro (ofertas + lançamentos manuais)
--
-- Fecha o loop aberto lá na v5.5 (ver README, item 2 do checklist da
-- v5.5): "o dia a dia (ofertas lançadas por congregação) mora na FASE 6
-- [...]; o consolidado do mês exporta pra TesourariasDepartamento (v5.4,
-- depto EBD)". Duas tabelas novas, nenhuma mexida em TesourariasDepartamento
-- ou RelatoriosDepartamentais (migrações 092/095) — este módulo só
-- ALIMENTA o campo `ofertas` (FINANCEIRO/FLUXO, mensal — ver migração 092)
-- que já existe no schema do departamento EBD; quem concilia com o Centro
-- de Custo geral da FASE 4 continua sendo exclusivamente a v5.4
-- (congelarRateio em GestaoRelatoriosDepartamentais), sem mudança alguma
-- nesse caminho.
--
-- Decisões de arquitetura (avaliadas e documentadas, não puladas):
--
-- 1) EbdOfertas — a oferta do culto de EBD é ancorada em EbdLicoes
--    (migração 102: uma linha por Congregação+Data, já o "domingo" natural
--    da EBD, usado por chamada/presença desde a v6.2). UNIQUE(LicaoId):
--    no máximo uma oferta por lição — reaproveita a mesma unidade de
--    tempo que o resto da FASE 6 já usa, em vez de inventar uma segunda
--    tabela de "domingos" paralela.
--
-- 2) EbdLancamentosFinanceiros — nem toda movimentação do financeiro da
--    EBD é a oferta do culto (ex: compra avulsa de material, uma doação
--    extra) — por isso um lançamento manual, solto por Congregação+Data,
--    com Tipo ENTRADA/SAIDA + descrição livre. Não amarra a EbdLicoes de
--    propósito: uma despesa de material pode acontecer num dia sem aula
--    (ex: compra feita numa segunda-feira).
--
-- 3) Consolidado mensal (ofertas + entradas − saídas) é SEMPRE calculado
--    na leitura (shared/ebdFinanceiro.js::calcularConsolidadoMensal) —
--    nunca uma coluna própria que possa divergir da soma das linhas,
--    mesmo princípio de "calculado, nunca digitado" já usado em
--    calcularValorTotalPedido (v6.6) e somarValoresSemanais (v5.2).
--
-- 4) Pré-preenchimento, não trava — o valor consolidado do mês vira
--    SUGESTÃO INICIAL do campo `ofertas` do relatório departamental (v5.2)
--    só no momento em que o rascunho do mês é criado
--    (GestaoRelatoriosDepartamentais::POST, shared/ebdFinanceiro.js::
--    buscarValorPrePreenchimentoOfertas) — DIFERENTE do mecanismo
--    CAMPOS_AUTOMATICOS_AFILIACAO da v5.5 (congregados/membrosEmComunhao/
--    membrosSemComunhao), que é ESTADO e fica travado, recalculado a cada
--    leitura. Aqui o campo é FLUXO e seu texto de origem (v5.5) é
--    explícito: "o Líder Local/Superintendente só confirma ou ajusta" —
--    ou seja, precisa continuar editável por PUT normal depois de aberto
--    o rascunho, exatamente como os outros campos FLUXO sempre foram.
--    Nenhuma tabela nova precisa saber disso — é comportamento do backend
--    (ver GestaoRelatoriosDepartamentais/index.js).
--
-- 5) Permissão — CONSERVADORA por ser dado financeiro (mesmo espírito da
--    v5.9/Assistência Social com dado sensível: quando o dado pede mais
--    cuidado, o sistema erra pro lado de restringir mais, não menos).
--    Diferente de v6.2 (chamada — professor da turma) e v6.6 (pedido de
--    revista — professor da turma), lançar oferta/lançamento manual exige
--    SEMPRE "ebd_gestao" (dentro do escopo territorial da Congregação) —
--    nunca o professor de turma, ainda que ele dê aula naquela
--    Congregação. Dinheiro de oferta é nível de Congregação (Superintendente
--    Local), não de turma.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.EbdOfertas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EbdOfertas (
        OfertaId              INT IDENTITY PRIMARY KEY,
        LicaoId               INT NOT NULL REFERENCES dbo.EbdLicoes(LicaoId),
        Valor                 DECIMAL(14,2) NOT NULL CONSTRAINT CK_EbdOfertas_Valor CHECK (Valor >= 0),
        RegistradoPorMembroId INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        AtualizadoEm          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_EbdOfertas_Licao UNIQUE (LicaoId)
    );
END
GO

IF OBJECT_ID(N'dbo.EbdLancamentosFinanceiros', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EbdLancamentosFinanceiros (
        LancamentoId          INT IDENTITY PRIMARY KEY,
        CongregacaoId         INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        Data                  DATE NOT NULL,
        Tipo                  NVARCHAR(10) NOT NULL CONSTRAINT CK_EbdLancamentosFinanceiros_Tipo CHECK (Tipo IN ('ENTRADA','SAIDA')),
        Descricao             NVARCHAR(300) NOT NULL,
        Valor                 DECIMAL(14,2) NOT NULL CONSTRAINT CK_EbdLancamentosFinanceiros_Valor CHECK (Valor > 0),
        RegistradoPorMembroId INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        AtualizadoEm          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_EbdLancamentosFinanceiros_Congregacao_Data' AND object_id = OBJECT_ID(N'dbo.EbdLancamentosFinanceiros'))
    CREATE INDEX IX_EbdLancamentosFinanceiros_Congregacao_Data ON dbo.EbdLancamentosFinanceiros (CongregacaoId, Data);
GO

-- Permissão reaproveitada: "ebd_gestao" já existe desde a migração 101 —
-- nenhuma Funcionalidade nova é criada aqui (mesmo padrão de v6.2/v6.3/
-- v6.5/v6.6, que também só reaproveitam).
