-- ============================================================
-- Migração 189 — as saídas do rol com a carta nova (FASE 10, Membros, missão B: a saída com a carta, rodadas 29 e 31, 26/11/2026)
--
-- As regras dele (docs/plano/fase-10-experiencia-design-performance.md, rodadas 29 e 31):
--  - o membro sai sozinho, pelo aplicativo, na hora, seja qual for o cargo; ninguém confirma. A secretaria pede por quem não sabe usar o aplicativo (fica
--    registrado quem pediu e quando, e a pessoa recebe o aviso). Os filhos menores saem junto, cada um com a sua carta;
--  - a carta é individual, vale 30 dias e confere pelo QR (a impressão digital guardada no dia e o protocolo) ou pelo código curto do rodapé (K7P-4M2);
--  - 30 dias depois da saída, a carta vence e os dados dela se apagam; com 1 ano, o resto da ficha. Fica para sempre: o nome, a matrícula, o nascimento, a
--    data da saída e os dízimos e ofertas.
--
-- O que nasce aqui: a tabela dbo.SaidasDoRol, uma linha por pessoa que sai (o filho menor tem a linha dele, ligada à de quem pediu).
--  - Fica FORA da CartasTransito de propósito (D2): o "processar" antigo das cartas (GestaoCartas) nunca vê as saídas novas. A porta antiga da carta de
--    mudança (SolicitarCarta) continua aberta até a nova entrar (D6). O nome não é "Saidas": essa palavra já é o pagamento do Financeiro (GestaoSaidas).
--  - Conteudo: a fotografia da carta (JSON), tirada na saída ANTES da vacância (que zera a função e encerra os cargos): o histórico inteiro (a página do QR)
--    e a seleção curta (o papel), para a carta sair sempre igual nos 30 dias. Apagada aos 30 dias com o destino (ConteudoApagadoEm).
--  - Sal e ImpressaoDigital: sha256 do sal (16 bytes aleatórios, guardados em hex minúsculo) com o conteúdo canônico (shared/saidaMembro.js); o QR leva o
--    começo dela. Ficam para sempre: depois do apagamento, a página do QR ainda diz se a carta é a verdadeira, sem os dados. O sal faz a impressão não
--    ser o hash dos dados apagados.
--  - CodigoCurto: o código do rodapé (6 símbolos sem I, O, 0 e 1), único. Protocolo: CARTA-AAAA-NNNN, a mesma sequência das cartas antigas, único.
--  - EtapaApagamento: 0 nada; 1 a dos 30 dias (cargos, escalas, contatos e família); 2 a de 1 ano (o resto da ficha). VoltouEm: a volta (r31-volta) para o
--    apagamento da ficha de quem voltou; a carta vence do mesmo jeito.
--  - Uma saída aberta por pessoa (UX_SaidasDoRol_Aberta, filtrado em VoltouEm IS NULL): o clique duplo ou dois pedidos ao mesmo tempo não criam duas.
--  - Os índices das telas e da rotina diária (regra 3 do Banco, api/CLAUDE.md): a lista da congregação (CongregacaoId, DiaSaida), a da Geral das cartas
--    pedidas pela secretaria, a da pessoa (MembroId, DiaSaida), a do filho que saiu junto e as duas da rotina (a carta viva e a etapa do apagamento).
-- Índice filtrado exige ANSI_NULLS e QUOTED_IDENTIFIER ligados na sessão que grava a tabela: é o padrão do driver da API (mssql/tedious) e do executor de
-- migrações; só a API grava aqui. A migração os liga explicitamente.
--
-- Idempotente: cria a tabela só se ela não existe, e cada índice só se ele não existe. Não altera nem apaga linha nenhuma de outra tabela.
-- Faixa de migrações: Membros até a 199 (o Financeiro a partir da 200).
-- ============================================================

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID(N'dbo.SaidasDoRol', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SaidasDoRol (
        SaidaId             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SaidasDoRol PRIMARY KEY,
        MembroId            INT NOT NULL CONSTRAINT FK_SaidasDoRol_Membro REFERENCES dbo.MembroReferencia(MembroId),
        CongregacaoId       INT NULL CONSTRAINT FK_SaidasDoRol_Congregacao REFERENCES dbo.Congregacoes(CongregacaoId),
        SaiuEm              DATETIME2(0) NOT NULL CONSTRAINT DF_SaidasDoRol_SaiuEm DEFAULT SYSUTCDATETIME(),
        DiaSaida            DATE NOT NULL,
        PedidoComo          NVARCHAR(12) NOT NULL CONSTRAINT CK_SaidasDoRol_PedidoComo CHECK (PedidoComo IN (N'PROPRIO', N'RESPONSAVEL', N'SECRETARIA')),
        PedidoPorMembroId   INT NOT NULL CONSTRAINT FK_SaidasDoRol_PedidoPor REFERENCES dbo.MembroReferencia(MembroId),
        JuntoComSaidaId     INT NULL CONSTRAINT FK_SaidasDoRol_JuntoCom REFERENCES dbo.SaidasDoRol(SaidaId),
        AvisoPorEmail       BIT NULL,
        DestinoCidade       NVARCHAR(80) NULL,
        Protocolo           NVARCHAR(30) NOT NULL,
        CodigoCurto         CHAR(6) NOT NULL,
        Sal                 CHAR(32) NOT NULL,
        ImpressaoDigital    CHAR(64) NOT NULL,
        Conteudo            NVARCHAR(MAX) NULL,
        ConteudoApagadoEm   DATETIME2(0) NULL,
        EtapaApagamento     TINYINT NOT NULL CONSTRAINT DF_SaidasDoRol_Etapa DEFAULT 0,
        Etapa1Em            DATETIME2(0) NULL,
        Etapa2Em            DATETIME2(0) NULL,
        VoltouEm            DATE NULL,
        -- quem pede por si é a própria pessoa; o filho que sai junto aponta a saída de quem pediu
        CONSTRAINT CK_SaidasDoRol_Proprio CHECK (PedidoComo <> N'PROPRIO' OR PedidoPorMembroId = MembroId),
        CONSTRAINT CK_SaidasDoRol_Responsavel CHECK (PedidoComo <> N'RESPONSAVEL' OR JuntoComSaidaId IS NOT NULL),
        -- a carta: viva (o conteúdo em JSON) ou apagada (sem conteúdo nem destino, com a data)
        CONSTRAINT CK_SaidasDoRol_Conteudo CHECK ((Conteudo IS NOT NULL AND ConteudoApagadoEm IS NULL AND ISJSON(Conteudo) = 1)
                                               OR (Conteudo IS NULL AND ConteudoApagadoEm IS NOT NULL AND DestinoCidade IS NULL)),
        CONSTRAINT CK_SaidasDoRol_Etapa CHECK (EtapaApagamento IN (0, 1, 2) AND (EtapaApagamento = 0 OR Etapa1Em IS NOT NULL)
                                            AND (EtapaApagamento < 2 OR Etapa2Em IS NOT NULL)),
        CONSTRAINT CK_SaidasDoRol_Codigo CHECK (CodigoCurto NOT LIKE N'%[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]%' COLLATE Latin1_General_BIN2),
        CONSTRAINT CK_SaidasDoRol_Impressao CHECK (ImpressaoDigital NOT LIKE N'%[^0123456789abcdef]%' COLLATE Latin1_General_BIN2
                                                AND Sal NOT LIKE N'%[^0123456789abcdef]%' COLLATE Latin1_General_BIN2),
        CONSTRAINT CK_SaidasDoRol_Volta CHECK (VoltouEm IS NULL OR VoltouEm >= DiaSaida)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SaidasDoRol_Protocolo' AND object_id = OBJECT_ID(N'dbo.SaidasDoRol'))
    CREATE UNIQUE INDEX UX_SaidasDoRol_Protocolo ON dbo.SaidasDoRol (Protocolo);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SaidasDoRol_CodigoCurto' AND object_id = OBJECT_ID(N'dbo.SaidasDoRol'))
    CREATE UNIQUE INDEX UX_SaidasDoRol_CodigoCurto ON dbo.SaidasDoRol (CodigoCurto);
GO
-- uma saída aberta por pessoa (quem voltou pode sair de novo)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SaidasDoRol_Aberta' AND object_id = OBJECT_ID(N'dbo.SaidasDoRol'))
    CREATE UNIQUE INDEX UX_SaidasDoRol_Aberta ON dbo.SaidasDoRol (MembroId) WHERE VoltouEm IS NULL;
GO
-- as saídas da pessoa (a volta e as "Minhas cartas")
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SaidasDoRol_Membro' AND object_id = OBJECT_ID(N'dbo.SaidasDoRol'))
    CREATE INDEX IX_SaidasDoRol_Membro ON dbo.SaidasDoRol (MembroId, DiaSaida);
GO
-- a lista das saídas da congregação (a secretaria local e a da área)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SaidasDoRol_Congregacao' AND object_id = OBJECT_ID(N'dbo.SaidasDoRol'))
    CREATE INDEX IX_SaidasDoRol_Congregacao ON dbo.SaidasDoRol (CongregacaoId, DiaSaida) INCLUDE (MembroId, PedidoComo);
GO
-- a Geral: as cartas pedidas pela secretaria, por mês
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SaidasDoRol_PedidasSecretaria' AND object_id = OBJECT_ID(N'dbo.SaidasDoRol'))
    CREATE INDEX IX_SaidasDoRol_PedidasSecretaria ON dbo.SaidasDoRol (DiaSaida) INCLUDE (MembroId, CongregacaoId, PedidoPorMembroId, AvisoPorEmail)
        WHERE PedidoComo = N'SECRETARIA';
GO
-- os filhos que saíram junto
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SaidasDoRol_JuntoCom' AND object_id = OBJECT_ID(N'dbo.SaidasDoRol'))
    CREATE INDEX IX_SaidasDoRol_JuntoCom ON dbo.SaidasDoRol (JuntoComSaidaId) WHERE JuntoComSaidaId IS NOT NULL;
GO
-- a rotina diária: as cartas ainda vivas (vencem no 31º dia) e as fichas com etapa de apagamento por fazer (só de quem não voltou)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SaidasDoRol_CartaViva' AND object_id = OBJECT_ID(N'dbo.SaidasDoRol'))
    CREATE INDEX IX_SaidasDoRol_CartaViva ON dbo.SaidasDoRol (DiaSaida) WHERE ConteudoApagadoEm IS NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SaidasDoRol_Etapa' AND object_id = OBJECT_ID(N'dbo.SaidasDoRol'))
    CREATE INDEX IX_SaidasDoRol_Etapa ON dbo.SaidasDoRol (EtapaApagamento, DiaSaida) INCLUDE (MembroId) WHERE VoltouEm IS NULL AND EtapaApagamento < 2;
GO
