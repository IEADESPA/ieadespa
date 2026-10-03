-- ============================================================
-- Migração 132 — Mediação e Arbitragem: o aceite só nasce de ATO DA PARTE (fecho dos itens em aberto, 03/10/2026)
--
-- Antes, "Registrar Acordo" e "Registrar Compromisso Arbitral" gravavam em TermosAssinados um aceite em nome de cada parte — sem que a parte fizesse nada
-- (quem clicava era o mediador ou a Câmara). Isso é aceite fabricado (Lei 9.307/1996, art. 4º §2º e art. 9º: a convenção de arbitragem precisa da vontade
-- expressa da parte; o acordo de mediação, Lei 13.140/2015, art. 20, é assinado pelas partes).
--
-- Agora:
--   * o mediador/a Câmara PROPÕE o texto (acordo) e a Câmara abre o compromisso (texto fixo com o assunto) — colunas *Proposto* abaixo;
--   * cada parte decide (ACEITE ou RECUSA) por um de dois caminhos, gravados em AceitesMediacao:
--       PROPRIO           — a própria parte, entrando com a sessão dela (matrícula + PIN), confirma o hash do texto que leu;
--       PRESENCIAL_ANEXO  — o mediador/árbitro do caso ou a Câmara registra a decisão tomada em papel, e só com o documento assinado anexado (o arquivo vai
--                           para o armazenamento, com o hash SHA-256 dele), a data da assinatura, quem registrou e quando;
--   * o acordo só se considera firmado (Status MEDIACAO_ACORDO) quando AS DUAS partes têm aceite válido do MESMO texto; o compromisso, idem
--     (CompromissoFirmadoEm). Recusa também fica registrada. Nada é gravado "por padrão" nem inferido.
--   * os aceites antigos (gravados sem ato da parte) NÃO são apagados nem reescritos: ganham uma linha LEGADO_NAO_VERIFICADO aqui, apontando o
--     TermoAssinadoId de sempre, e a tela os mostra como "registrado antes da verificação por ato da parte". Os casos e os status existentes ficam como estão.
--
-- AceitesMediacao é prova: o gatilho recusa alterar ou apagar. Idempotente (reexecuta a cada deploy); só colunas novas anuláveis.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MediacoesArbitragens') AND name = N'AcordoTextoProposto')
    ALTER TABLE dbo.MediacoesArbitragens ADD AcordoTextoProposto NVARCHAR(2000) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MediacoesArbitragens') AND name = N'AcordoHashProposto')
    ALTER TABLE dbo.MediacoesArbitragens ADD AcordoHashProposto NVARCHAR(64) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MediacoesArbitragens') AND name = N'AcordoPropostoEm')
    ALTER TABLE dbo.MediacoesArbitragens ADD AcordoPropostoEm DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MediacoesArbitragens') AND name = N'AcordoPropostoPor')
    ALTER TABLE dbo.MediacoesArbitragens ADD AcordoPropostoPor INT NULL CONSTRAINT FK_Mediacoes_AcordoPropostoPor REFERENCES dbo.MembroReferencia(MembroId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MediacoesArbitragens') AND name = N'AcordoSaidaPropostaId')
    ALTER TABLE dbo.MediacoesArbitragens ADD AcordoSaidaPropostaId INT NULL CONSTRAINT FK_Mediacoes_AcordoSaida REFERENCES dbo.SaidasTesouraria(SaidaId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MediacoesArbitragens') AND name = N'CompromissoTextoProposto')
    ALTER TABLE dbo.MediacoesArbitragens ADD CompromissoTextoProposto NVARCHAR(2000) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MediacoesArbitragens') AND name = N'CompromissoHashProposto')
    ALTER TABLE dbo.MediacoesArbitragens ADD CompromissoHashProposto NVARCHAR(64) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MediacoesArbitragens') AND name = N'CompromissoPropostoEm')
    ALTER TABLE dbo.MediacoesArbitragens ADD CompromissoPropostoEm DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MediacoesArbitragens') AND name = N'CompromissoPropostoPor')
    ALTER TABLE dbo.MediacoesArbitragens ADD CompromissoPropostoPor INT NULL CONSTRAINT FK_Mediacoes_CompromissoPropostoPor REFERENCES dbo.MembroReferencia(MembroId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.MediacoesArbitragens') AND name = N'CompromissoFirmadoEm')
    ALTER TABLE dbo.MediacoesArbitragens ADD CompromissoFirmadoEm DATETIME2 NULL;
GO

IF OBJECT_ID(N'dbo.AceitesMediacao', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AceitesMediacao (
        AceiteMediacaoId          INT IDENTITY PRIMARY KEY,
        MediacaoId                INT NOT NULL REFERENCES dbo.MediacoesArbitragens(MediacaoId),
        Instrumento               NVARCHAR(12) NOT NULL CONSTRAINT CK_AceitesMediacao_Instrumento CHECK (Instrumento IN ('ACORDO','COMPROMISSO')),
        Parte                     NCHAR(1) NOT NULL CONSTRAINT CK_AceitesMediacao_Parte CHECK (Parte IN (N'A', N'B')),
        ParteMembroId             INT NULL REFERENCES dbo.MembroReferencia(MembroId),      -- a parte, quando é membro (parte descrita — congregação, departamento — fica nula)
        Decisao                   NVARCHAR(8) NOT NULL CONSTRAINT CK_AceitesMediacao_Decisao CHECK (Decisao IN ('ACEITE','RECUSA')),
        Canal                     NVARCHAR(24) NOT NULL CONSTRAINT CK_AceitesMediacao_CanalValor CHECK (Canal IN ('PROPRIO','PRESENCIAL_ANEXO','LEGADO_NAO_VERIFICADO')),
        HashTexto                 NVARCHAR(64) NULL,                                       -- o texto que esta decisão alcança (o proposto naquele momento)
        TermoAssinadoId           INT NULL REFERENCES dbo.TermosAssinados(TermoAssinadoId),
        RegistradoPorMembroId     INT NULL REFERENCES dbo.MembroReferencia(MembroId),      -- PROPRIO: a própria parte; PRESENCIAL_ANEXO: quem registrou; LEGADO: nulo (não se sabe)
        RegistradoEm              DATETIME2 NOT NULL CONSTRAINT DF_AceitesMediacao_Em DEFAULT SYSUTCDATETIME(),
        DataAssinaturaPresencial  DATE NULL,
        AnexoUrl                  NVARCHAR(500) NULL,
        AnexoHash                 NVARCHAR(64) NULL,
        AnexoNome                 NVARCHAR(255) NULL,
        AnexoMime                 NVARCHAR(100) NULL,
        Observacao                NVARCHAR(500) NULL,
        -- Cada canal com o que o prova. PROPRIO: quem registrou É a parte. PRESENCIAL_ANEXO: documento anexado, data da assinatura, e quem registrou NÃO é a parte.
        -- LEGADO_NAO_VERIFICADO: só a marca dos aceites antigos (sempre "aceite", nunca com registrador).
        CONSTRAINT CK_AceitesMediacao_Canal CHECK (
               (Canal = 'PROPRIO' AND ParteMembroId IS NOT NULL AND RegistradoPorMembroId = ParteMembroId AND HashTexto IS NOT NULL AND AnexoUrl IS NULL)
            OR (Canal = 'PRESENCIAL_ANEXO' AND RegistradoPorMembroId IS NOT NULL AND (ParteMembroId IS NULL OR RegistradoPorMembroId <> ParteMembroId)
                AND HashTexto IS NOT NULL AND AnexoUrl IS NOT NULL AND AnexoHash IS NOT NULL AND DataAssinaturaPresencial IS NOT NULL)
            OR (Canal = 'LEGADO_NAO_VERIFICADO' AND Decisao = 'ACEITE' AND RegistradoPorMembroId IS NULL))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AceitesMediacao_Caso' AND object_id = OBJECT_ID(N'dbo.AceitesMediacao'))
    CREATE INDEX IX_AceitesMediacao_Caso ON dbo.AceitesMediacao (MediacaoId, Instrumento, Parte, AceiteMediacaoId);
GO
-- Prova: não se altera nem se apaga.
IF OBJECT_ID(N'dbo.TR_AceitesMediacao_Imutavel', N'TR') IS NULL
    EXEC(N'CREATE TRIGGER dbo.TR_AceitesMediacao_Imutavel ON dbo.AceitesMediacao AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
    BEGIN
        RAISERROR(N''A decisão da parte na mediação/arbitragem é prova: não se altera nem se apaga (uma nova decisão é registrada em outra linha).'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- Os aceites antigos: marcados, nunca reescritos. Uma linha por (caso, instrumento, parte, termo) que ainda não tenha a marca.
INSERT INTO dbo.AceitesMediacao (MediacaoId, Instrumento, Parte, ParteMembroId, Decisao, Canal, TermoAssinadoId, RegistradoEm, Observacao)
SELECT x.MediacaoId, x.Instrumento, x.Parte, x.ParteMembroId, 'ACEITE', 'LEGADO_NAO_VERIFICADO', x.TermoAssinadoId, ISNULL(t.DataAssinatura, SYSUTCDATETIME()),
       N'Registrado antes da verificação por ato da parte (gravado pelo sistema quando o mediador/a Câmara registrou o ato).'
FROM (
    SELECT MediacaoId, N'ACORDO' AS Instrumento, N'A' AS Parte, ParteAId AS ParteMembroId, TermoAcordoParteAAssinadoId AS TermoAssinadoId FROM dbo.MediacoesArbitragens WHERE TermoAcordoParteAAssinadoId IS NOT NULL
    UNION ALL SELECT MediacaoId, N'ACORDO', N'B', ParteBId, TermoAcordoParteBAssinadoId FROM dbo.MediacoesArbitragens WHERE TermoAcordoParteBAssinadoId IS NOT NULL
    UNION ALL SELECT MediacaoId, N'COMPROMISSO', N'A', ParteAId, CompromissoArbitralParteAAssinadoId FROM dbo.MediacoesArbitragens WHERE CompromissoArbitralParteAAssinadoId IS NOT NULL
    UNION ALL SELECT MediacaoId, N'COMPROMISSO', N'B', ParteBId, CompromissoArbitralParteBAssinadoId FROM dbo.MediacoesArbitragens WHERE CompromissoArbitralParteBAssinadoId IS NOT NULL
) x
LEFT JOIN dbo.TermosAssinados t ON t.TermoAssinadoId = x.TermoAssinadoId
WHERE NOT EXISTS (SELECT 1 FROM dbo.AceitesMediacao a WHERE a.MediacaoId = x.MediacaoId AND a.Instrumento = x.Instrumento AND a.Parte = x.Parte
                    AND a.Canal = 'LEGADO_NAO_VERIFICADO' AND a.TermoAssinadoId = x.TermoAssinadoId);
GO

-- O aviso à parte de que há um texto esperando a decisão dela (Meu Painel → Minhas Tarefas).
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'MEDIACAO_DECISAO_PENDENTE')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'MEDIACAO_DECISAO_PENDENTE', N'Mediação/arbitragem: um texto aguarda a sua decisão', N'MEDIACAO', NULL, NULL, 1);
GO
