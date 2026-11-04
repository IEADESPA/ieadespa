-- ============================================================
-- Migração 167 — v9.3: Distrito e macroexpansão. Desenho em docs/plano/fase-9-entidades-vinculadas.md.
--
-- Base legal: Estatuto Art. 5º §5º; Regimento Art. 6-A, III e IV, Art. 53-D, I, Art. 126-K a 126-N, Art. 126-P e Art. 144, II.
--
--   DistritoPeriodos: cada período em que o Distrito esteve ativo, com o decreto da CLI que o ativou (o gatilho do Art. 126-K §2º) e o que o desativou. O mês
--                     financeiro de início e o de fim (exclusivo) dizem de quem é o repasse das congregações do território: do Distrito, dentro do período; da
--                     Sede, fora dele. Um Distrito já marcado como ativo no cadastro antes desta versão ganha um período "legado" (sem o decreto registrado).
--   DistritoIntervencoes: a intervenção imediata do Pastor Presidente (Art. 126-N, III, e 126-P, II) — uma aberta por Distrito.
--   DistritoBalancos: o Balanço Consolidado anual enviado ao NIF (Art. 126-M, II, e 53-D, I), com as versões (devolvido, reenviado).
--   Papéis novos "Pastor Distrital", "Interventor Distrital" (nível Distrito) e "Vice-Presidente de Quadrante" (nível Quadrante); a permissão "distritos".
--
-- Idempotente: seguro para reexecutar sem apagar dados. Cada ALTER em batch próprio (GO).
-- ============================================================

-- ---- os períodos de atividade do Distrito ----
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.DistritoPeriodos') AND type = N'U')
BEGIN
    CREATE TABLE dbo.DistritoPeriodos (
        PeriodoId               INT IDENTITY CONSTRAINT PK_DistritoPeriodos PRIMARY KEY,
        DistritoId              INT NOT NULL CONSTRAINT FK_DistritoPeriodos_Distrito REFERENCES dbo.Distritos(DistritoId),
        Legado                  BIT NOT NULL CONSTRAINT DF_DistritoPeriodos_Legado DEFAULT 0,
        AtivadoEm               DATE NOT NULL,
        FinanceiroDesdeMes      CHAR(7) NOT NULL,
        AtivacaoSessaoId        INT NULL CONSTRAINT FK_DistritoPeriodos_SessaoAtivacao REFERENCES dbo.Sessoes(SessaoId),
        Gatilho                 NVARCHAR(12) NULL,
        Cidade                  NVARCHAR(150) NULL,
        UF                      CHAR(2) NULL,
        Populacao               INT NULL,
        FontePopulacao          NVARCHAR(200) NULL,
        Fundamentacao           NVARCHAR(2000) NULL,
        AtivacaoRegistradaPor   INT NULL,
        AtivacaoRegistradaEm    DATETIME2 NOT NULL CONSTRAINT DF_DistritoPeriodos_Em DEFAULT SYSUTCDATETIME(),
        DesativadoEm            DATE NULL,
        FinanceiroAteMes        CHAR(7) NULL,
        DesativacaoSessaoId     INT NULL CONSTRAINT FK_DistritoPeriodos_SessaoDesativacao REFERENCES dbo.Sessoes(SessaoId),
        DesativacaoMotivo       NVARCHAR(2000) NULL,
        DesativacaoRegistradaPor INT NULL,
        CONSTRAINT CK_DistritoPeriodos_Meses CHECK (FinanceiroDesdeMes LIKE '[12][0-9][0-9][0-9]-[01][0-9]'
            AND (FinanceiroAteMes IS NULL OR (FinanceiroAteMes LIKE '[12][0-9][0-9][0-9]-[01][0-9]' AND FinanceiroAteMes >= FinanceiroDesdeMes))),
        -- o decreto de ativação: inteiro, ou nenhum (só no período legado); o gatilho (b) exige mais de um milhão de habitantes
        CONSTRAINT CK_DistritoPeriodos_Decreto CHECK (
            (Legado = 1 AND AtivacaoSessaoId IS NULL AND Gatilho IS NULL AND Cidade IS NULL AND UF IS NULL AND Populacao IS NULL AND FontePopulacao IS NULL)
            OR (Legado = 0 AND AtivacaoSessaoId IS NOT NULL AND Gatilho IN (N'METROPOLE', N'MILHAO') AND Cidade IS NOT NULL AND UF IS NOT NULL
                AND Fundamentacao IS NOT NULL AND AtivacaoRegistradaPor IS NOT NULL
                AND (Gatilho <> N'MILHAO' OR (Populacao > 1000000 AND FontePopulacao IS NOT NULL)))),
        -- a desativação: inteira ou ausente, nunca antes da ativação
        CONSTRAINT CK_DistritoPeriodos_Desativacao CHECK (
            (DesativadoEm IS NULL AND FinanceiroAteMes IS NULL AND DesativacaoSessaoId IS NULL AND DesativacaoMotivo IS NULL AND DesativacaoRegistradaPor IS NULL)
            OR (DesativadoEm IS NOT NULL AND FinanceiroAteMes IS NOT NULL AND DesativacaoSessaoId IS NOT NULL AND DesativacaoMotivo IS NOT NULL
                AND DesativacaoRegistradaPor IS NOT NULL AND DesativadoEm >= AtivadoEm))
    );
END
GO
-- um período em aberto por Distrito
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_DistritoPeriodos_Aberto' AND object_id = OBJECT_ID(N'dbo.DistritoPeriodos'))
    CREATE UNIQUE INDEX UX_DistritoPeriodos_Aberto ON dbo.DistritoPeriodos (DistritoId) WHERE DesativadoEm IS NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_DistritoPeriodos_Distrito' AND object_id = OBJECT_ID(N'dbo.DistritoPeriodos'))
    CREATE INDEX IX_DistritoPeriodos_Distrito ON dbo.DistritoPeriodos (DistritoId, FinanceiroDesdeMes);
GO
-- ---- o Distrito de cada fechamento, gravado quando o mês é fechado (revisão de 04/11/2026) ----
-- O repasse do mês é do Distrito quando, NO FECHAMENTO, a congregação está no território dele e o mês cai num período com decreto. Gravar aqui (e não recalcular
-- pelo cadastro de hoje) impede que mudar um Quadrante, uma Região ou uma Área de lugar reescreva meses passados (já rateados pela Sede ou já somados no Dízimo).
IF COL_LENGTH('dbo.FechamentosTesouraria', 'RepasseDistritoId') IS NULL
    ALTER TABLE dbo.FechamentosTesouraria ADD RepasseDistritoId INT NULL CONSTRAINT FK_FechamentosTesouraria_Distrito REFERENCES dbo.Distritos(DistritoId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FechamentosTesouraria_Distrito' AND object_id = OBJECT_ID(N'dbo.FechamentosTesouraria'))
    CREATE INDEX IX_FechamentosTesouraria_Distrito ON dbo.FechamentosTesouraria (RepasseDistritoId, MesReferencia) WHERE RepasseDistritoId IS NOT NULL;
GO
-- o Distrito que o cadastro já marcava como ativo antes desta versão: ganha um período "legado", sem o decreto e SEM efeito no dinheiro (o repasse continua com a
-- Sede) até o nível geral registrar o decreto; o Painel avisa
INSERT INTO dbo.DistritoPeriodos (DistritoId, Legado, AtivadoEm, FinanceiroDesdeMes)
SELECT d.DistritoId, 1, CAST(SYSUTCDATETIME() AS DATE), CONVERT(char(7), SYSUTCDATETIME(), 126)
FROM dbo.Distritos d
WHERE d.Ativo = 1 AND NOT EXISTS (SELECT 1 FROM dbo.DistritoPeriodos p WHERE p.DistritoId = d.DistritoId AND p.DesativadoEm IS NULL);
GO

-- ---- a intervenção imediata (Art. 126-N, III, e 126-P, II) ----
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.DistritoIntervencoes') AND type = N'U')
BEGIN
    CREATE TABLE dbo.DistritoIntervencoes (
        IntervencaoId           INT IDENTITY CONSTRAINT PK_DistritoIntervencoes PRIMARY KEY,
        DistritoId              INT NOT NULL CONSTRAINT FK_DistritoIntervencoes_Distrito REFERENCES dbo.Distritos(DistritoId),
        Motivo                  NVARCHAR(20) NOT NULL,
        Fundamentacao           NVARCHAR(4000) NOT NULL,
        InterventorMembroId     INT NOT NULL CONSTRAINT FK_DistritoIntervencoes_Interventor REFERENCES dbo.MembroReferencia(MembroId),
        MedidaBloqueioContas    BIT NOT NULL CONSTRAINT DF_DistritoIntervencoes_Bloqueio DEFAULT 0,
        MedidaProcuracao        BIT NOT NULL CONSTRAINT DF_DistritoIntervencoes_Procuracao DEFAULT 0,
        MedidaJudicial          BIT NOT NULL CONSTRAINT DF_DistritoIntervencoes_Judicial DEFAULT 0,
        LiderancasDestituidas   INT NOT NULL CONSTRAINT DF_DistritoIntervencoes_Destituidas DEFAULT 0,
        DecretadaEm             DATE NOT NULL,
        DecretadaPor            INT NOT NULL,
        DecretadaRegistradaEm   DATETIME2 NOT NULL CONSTRAINT DF_DistritoIntervencoes_Em DEFAULT SYSUTCDATETIME(),
        EncerradaEm             DATE NULL,
        EncerradaPor            INT NULL,
        Resultado               NVARCHAR(2000) NULL,
        CONSTRAINT CK_DistritoIntervencoes_Motivo CHECK (Motivo IN (N'DESVINCULACAO', N'ESTATUTO_PROPRIO', N'RETENCAO_REPASSE', N'OUTRA')),
        CONSTRAINT CK_DistritoIntervencoes_Encerramento CHECK (
            (EncerradaEm IS NULL AND EncerradaPor IS NULL AND Resultado IS NULL)
            OR (EncerradaEm IS NOT NULL AND EncerradaPor IS NOT NULL AND Resultado IS NOT NULL AND EncerradaEm >= DecretadaEm))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_DistritoIntervencoes_Aberta' AND object_id = OBJECT_ID(N'dbo.DistritoIntervencoes'))
    CREATE UNIQUE INDEX UX_DistritoIntervencoes_Aberta ON dbo.DistritoIntervencoes (DistritoId) WHERE EncerradaEm IS NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_DistritoIntervencoes_Interventor' AND object_id = OBJECT_ID(N'dbo.DistritoIntervencoes'))
    CREATE INDEX IX_DistritoIntervencoes_Interventor ON dbo.DistritoIntervencoes (InterventorMembroId);
GO

-- ---- o Balanço Consolidado anual ao NIF (Art. 126-M, II, e 53-D, I) ----
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.DistritoBalancos') AND type = N'U')
BEGIN
    CREATE TABLE dbo.DistritoBalancos (
        BalancoId           INT IDENTITY CONSTRAINT PK_DistritoBalancos PRIMARY KEY,
        DistritoId          INT NOT NULL CONSTRAINT FK_DistritoBalancos_Distrito REFERENCES dbo.Distritos(DistritoId),
        Ano                 INT NOT NULL,
        Versao              INT NOT NULL,
        Receitas            DECIMAL(14,2) NOT NULL,
        Despesas            DECIMAL(14,2) NOT NULL,
        SaldoFinal          DECIMAL(14,2) NOT NULL,
        Observacoes         NVARCHAR(2000) NULL,
        Status              NVARCHAR(10) NOT NULL,
        EnviadoPor          INT NOT NULL,
        EnviadoEm           DATETIME2 NOT NULL CONSTRAINT DF_DistritoBalancos_Em DEFAULT SYSUTCDATETIME(),
        AnalisadoPor        INT NULL,
        AnalisadoEm         DATETIME2 NULL,
        MotivoDevolucao     NVARCHAR(2000) NULL,
        CONSTRAINT UQ_DistritoBalancos_Versao UNIQUE (DistritoId, Ano, Versao),
        CONSTRAINT CK_DistritoBalancos_Valores CHECK (Ano BETWEEN 2000 AND 2200 AND Versao >= 1 AND Receitas >= 0 AND Despesas >= 0),
        CONSTRAINT CK_DistritoBalancos_Situacao CHECK (
            (Status = N'ENVIADO' AND AnalisadoPor IS NULL AND AnalisadoEm IS NULL AND MotivoDevolucao IS NULL)
            OR (Status = N'APROVADO' AND AnalisadoPor IS NOT NULL AND AnalisadoEm IS NOT NULL AND MotivoDevolucao IS NULL AND AnalisadoPor <> EnviadoPor)
            OR (Status = N'DEVOLVIDO' AND AnalisadoPor IS NOT NULL AND AnalisadoEm IS NOT NULL AND MotivoDevolucao IS NOT NULL AND AnalisadoPor <> EnviadoPor))
    );
END
GO
-- um balanço "vivo" (enviado ou aprovado) por Distrito e ano: o reenvio só depois da devolução
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_DistritoBalancos_Vivo' AND object_id = OBJECT_ID(N'dbo.DistritoBalancos'))
    CREATE UNIQUE INDEX UX_DistritoBalancos_Vivo ON dbo.DistritoBalancos (DistritoId, Ano) WHERE Status IN (N'ENVIADO', N'APROVADO');
GO

-- ---- papéis e permissão ----
-- Tudo num lote só e UMA vez (quando a funcionalidade ainda não existe): os papéis novos nascem com as permissões do Pastor de Área de hoje mais a "distritos"
-- (o Pastor Distrital e o Interventor), ou só "reunioes" (o Vice-Presidente de Quadrante, como o Membro do CEQ); a permissão vai ao Presidente, ao Secretário
-- Geral e ao Tesoureiro de Distrito. Nos deploys seguintes nada se repete: se a administração tirar "distritos" de um papel em Permissões, o deploy não a devolve.
IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'distritos')
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = N'Pastor Distrital')
        INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes)
        SELECT N'Pastor Distrital', 'DISTRITO', ISNULL(MAX(Permissoes), 'reunioes,pessoas')
        FROM dbo.Papeis WHERE Nome = N'Pastor de Área';
    IF NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = N'Interventor Distrital')
        INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes)
        SELECT N'Interventor Distrital', 'DISTRITO', ISNULL(MAX(Permissoes), 'reunioes,pessoas')
        FROM dbo.Papeis WHERE Nome = N'Pastor de Área';
    IF NOT EXISTS (SELECT 1 FROM dbo.Papeis WHERE Nome = N'Vice-Presidente de Quadrante')
        INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes) VALUES (N'Vice-Presidente de Quadrante', 'QUADRANTE', 'reunioes');
    UPDATE dbo.Papeis
    SET Permissoes = CASE WHEN ISNULL(Permissoes, '') = '' THEN 'distritos' ELSE Permissoes + ',distritos' END
    WHERE Nome IN (N'Presidente', N'Secretário Geral', N'Pastor Distrital', N'Interventor Distrital', N'Tesoureiro de Distrito')
      AND (',' + ISNULL(Permissoes, '') + ',') NOT LIKE '%,distritos,%';
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('distritos', N'Distritos — ativação, Dízimo Institucional, balanço ao NIF e intervenção');
END
GO

-- ---- avisos ----
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'DISTRITO_REPASSE_VENCIDO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'DISTRITO_REPASSE_VENCIDO', N'Dízimo Institucional do Distrito vencido sem repasse', N'DISTRITOS', N'distritos', N'GLOBAL', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'DISTRITO_BALANCO_ATRASADO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'DISTRITO_BALANCO_ATRASADO', N'Balanço anual do Distrito não enviado ao NIF no prazo', N'DISTRITOS', N'distritos', N'GLOBAL', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'DISTRITO_BALANCO_ANALISADO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'DISTRITO_BALANCO_ANALISADO', N'O NIF aprovou ou devolveu o balanço anual do Distrito', N'DISTRITOS', NULL, NULL, 1);
GO

-- ---- retenção: os decretos, as intervenções e os balanços são história da instituição ----
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Distritos: decretos, intervenções e balanços')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (N'Distritos: decretos, intervenções e balanços', N'x', 1825);
GO
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Decretos da CLI que ativam e desativam o Distrito, intervenções do Pastor Presidente e balanços anuais ao NIF (Estatuto Art. 5º §5º; Reg. Art. 53-D, 126-K a 126-N e 126-P): história da instituição, guardada sem prazo final. Do Pastor Distrital e do Interventor, só a matrícula e as datas.'
WHERE Categoria = N'Distritos: decretos, intervenções e balanços' AND BaseLegal = N'x';
GO
