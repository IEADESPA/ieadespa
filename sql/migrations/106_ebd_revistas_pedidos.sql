-- ============================================================
-- Migração 106 — v6.6: EBD — Revistas e pedidos
--
-- Continua a FASE 6 sobre a base de EbdTurmas (v6.1). Três tabelas:
--
-- 1) EbdCatalogoRevistas — o catálogo de revistas/trimestre (estilo CPAD:
--    uma edição por faixa etária, por trimestre). Cadastro simples, sem
--    motor novo; `Ativa` permite descontinuar uma edição antiga sem
--    apagar pedidos históricos que já a referenciam.
--
-- 2) EbdPedidosRevistas — o pedido em si.
--
-- 3) EbdPedidosRevistasItens — linhas de quantidade por revista dentro de
--    um pedido (um pedido pode conter mais de uma revista, ex: a turma
--    pede revista de aluno + revista de professor do mesmo trimestre).
--
-- Decisões de arquitetura (avaliadas e documentadas, não puladas):
--
-- 1) Granularidade do pedido — TURMA, não Congregação (o checklist do
--    v6.6 diz "por congregação", mas a v6.8 (ainda não construída) já
--    amarra explicitamente "revista/trimestre vigente" à CLASSE — cada
--    Turma estuda uma edição específica da sua própria faixa etária, então
--    é a Turma quem sabe quantas revistas precisa, não a congregação como
--    agregado cego. `EbdPedidosRevistas.TurmaId` referencia EbdTurmas
--    (migração 101), que por sua vez pertence a UMA Congregação — a visão
--    "por congregação" do checklist continua existindo, só que como
--    CONSOLIDAÇÃO na leitura (shared/ebdRevistas.js::
--    consolidarPedidosPorAreaCongregacao, agrupando pedidos de todas as
--    Turmas daquela Congregação), nunca como coluna própria redundante —
--    mesmo princípio de "Área não precisa de coluna própria" já usado pela
--    migração 101 (sobe EbdTurmas.CongregacaoId -> Congregacoes.AreaId).
--    UNIQUE (TurmaId, Trimestre): uma Turma tem no máximo um pedido por
--    trimestre (várias revistas dentro dele, via EbdPedidosRevistasItens).
--
-- 2) Preço travado no pedido, não no catálogo — cada linha de
--    EbdPedidosRevistasItens grava `PrecoUnitarioRegistrado`, uma CÓPIA do
--    preço do catálogo no momento do pedido (não uma referência viva).
--    Diferente do resto do sistema, que prefere "calculado, nunca
--    digitado" pra métricas (percentuais, totais de chamada), preço de
--    revista é um valor comercial histórico: se o preço da CPAD mudar no
--    catálogo mês que vem, os pedidos JÁ FEITOS não podem mudar de valor
--    retroativamente (mesmo problema resolvido por
--    shared/protocolo.js/Matricula: gerado uma vez, nunca recalculado).
--    `ValorTotal` do pedido nunca é uma coluna própria — é sempre
--    SUM(Quantidade * PrecoUnitarioRegistrado), calculado na leitura
--    (shared/ebdRevistas.js::calcularValorTotalPedido).
--
-- 3) "Pagamentos (pendente/aprovado)" (item 2 do checklist) é só um FLAG
--    no pedido (`StatusPagamento`) — NÃO é lançamento financeiro, não gera
--    linha de ledger, não integra com `TesourariasDepartamento` (v5.4).
--    Isso é trabalho explícito da v6.7 ("Financeiro da EBD", ainda não
--    construída — ver README): a v6.7 é quem vai mover dinheiro de
--    verdade e exportar o consolidado do mês pra Tesouraria. Aqui,
--    `StatusPagamento` só responde "este pedido já foi pago ou não" pra
--    quem administra a EBD acompanhar — dois campos independentes:
--    `Status` (aprovação do PEDIDO em si: PENDENTE/APROVADO) e
--    `StatusPagamento` (o pagamento dele: PENDENTE/APROVADO), porque um
--    pedido pode estar aprovado e ainda não pago. Pagar antes de aprovar
--    não faz sentido (não se paga o que ainda não foi aceito) — por isso
--    `podeRegistrarPagamento` (shared/ebdRevistas.js) exige Status =
--    'APROVADO' antes de aceitar StatusPagamento = 'APROVADO'.
--
-- 4) Máquina de estados deliberadamente mínima — só PENDENTE -> APROVADO
--    nos dois campos (`Status` e `StatusPagamento`), sem camada de
--    rejeição/2 níveis (diferente do fluxo de 2 camadas de
--    RelatoriosDepartamentais/v5.3): o checklist do v6.6 menciona
--    explicitamente só esse par, e inventar REJEITADO/camada extra sem
--    pedido no checklist seria complexidade que ninguém pediu. Mesmo
--    espírito de shared/escalas.js::decidirTroca (PENDENTE -> decisão
--    única, guarda contra decidir duas vezes).
--
-- 5) Permissão — reaproveita "ebd_gestao" (migração 101), sem permissão
--    nova: administrar catálogo, aprovar pedido e marcar pagamento exigem
--    "ebd_gestao" (dentro do escopo territorial de quem aprova). Só
--    CRIAR/editar o próprio pedido (enquanto PENDENTE) é liberado também
--    pro professor ATIVO daquela Turma (EbdTurmaProfessores, v6.1) sem
--    precisar de "ebd_gestao" — mesmo padrão de granularidade que v6.3
--    já usa pra conteúdo de lição/atividade (ver GestaoEbdAtividades::
--    ehProfessorAtivoDaTurma): quem dá aula naquela turma sabe melhor do
--    que ninguém quantas revistas aquela turma precisa.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.EbdCatalogoRevistas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EbdCatalogoRevistas (
        RevistaId           INT IDENTITY PRIMARY KEY,
        Nome                NVARCHAR(150) NOT NULL,
        FaixaEtaria         NVARCHAR(50) NULL,
        Trimestre           NVARCHAR(10) NOT NULL,           -- formato 'AAAA-T1'..'AAAA-T4'
        PrecoUnitario       DECIMAL(10,2) NOT NULL DEFAULT 0,
        Ativa               BIT NOT NULL DEFAULT 1,
        CriadoPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_EbdCatalogoRevistas_Nome_Trimestre UNIQUE (Nome, Trimestre)
    );
END
GO

IF OBJECT_ID(N'dbo.EbdPedidosRevistas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EbdPedidosRevistas (
        PedidoId                        INT IDENTITY PRIMARY KEY,
        TurmaId                         INT NOT NULL REFERENCES dbo.EbdTurmas(TurmaId),
        Trimestre                       NVARCHAR(10) NOT NULL,
        Status                          NVARCHAR(20) NOT NULL DEFAULT 'PENDENTE'
                                            CONSTRAINT CK_EbdPedidosRevistas_Status CHECK (Status IN ('PENDENTE','APROVADO')),
        StatusPagamento                 NVARCHAR(20) NOT NULL DEFAULT 'PENDENTE'
                                            CONSTRAINT CK_EbdPedidosRevistas_StatusPagamento CHECK (StatusPagamento IN ('PENDENTE','APROVADO')),
        SolicitadoPorMembroId           INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm                        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        AprovadoPorMembroId             INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AprovadoEm                      DATETIME2 NULL,
        PagamentoRegistradoPorMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        PagamentoRegistradoEm           DATETIME2 NULL,
        AtualizadoEm                    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_EbdPedidosRevistas_Turma_Trimestre UNIQUE (TurmaId, Trimestre)
    );
END
GO

IF OBJECT_ID(N'dbo.EbdPedidosRevistasItens', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EbdPedidosRevistasItens (
        ItemId                    INT IDENTITY PRIMARY KEY,
        PedidoId                  INT NOT NULL REFERENCES dbo.EbdPedidosRevistas(PedidoId),
        RevistaId                 INT NOT NULL REFERENCES dbo.EbdCatalogoRevistas(RevistaId),
        Quantidade                INT NOT NULL CONSTRAINT CK_EbdPedidosRevistasItens_Quantidade CHECK (Quantidade > 0),
        PrecoUnitarioRegistrado   DECIMAL(10,2) NOT NULL,    -- cópia do preço do catálogo no momento do pedido (nunca recalculado depois)
        CONSTRAINT UQ_EbdPedidosRevistasItens_Pedido_Revista UNIQUE (PedidoId, RevistaId)
    );
END
GO
