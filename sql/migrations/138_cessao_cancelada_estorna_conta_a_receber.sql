-- ============================================================
-- Migração 138 — Cancelar cessão de templo estorna a conta a receber (e a receita acessória que nasceu junto).
--
-- Ao AUTORIZAR uma cessão onerosa nascem uma Conta a Receber (ContasAReceber, Tipo CESSAO_TEMPLO) e uma Receita Acessória (ReceitasAcessorias, Tipo CESSAO_SALAO, com
-- CessaoTemploId). Até aqui o cancelamento da cessão deixava as duas vivas: a conta seguia somando em "a receber" e na competência (balanço e DRP) como se a taxa ainda fosse
-- chegar. Agora a rota GestaoCessoesTemplo cancela a conta (status CANCELADO, que já existia) e esta migração dá à Receita Acessória o mesmo cancelamento: CanceladaEm,
-- CanceladaPor e MotivoCancelamento (a receita NÃO é apagada: continua visível, marcada como cancelada, e some dos totais do relatório origem x destino).
--
-- Regularização do passado, só do que é certo ser lixo: conta a receber AINDA PREVISTA (nada foi recebido) de cessão que já está CANCELADA vira CANCELADA; a receita acessória
-- dessa cessão é marcada cancelada se a conta NÃO foi recebida. Conta RECEBIDA nunca é tocada (o dinheiro entrou; a devolução é um ato financeiro à parte). Nenhuma linha é
-- apagada; a trilha fica em MotivoCancelamento (e CanceladoEm). Qualquer erro vira AVISO e a migração segue: nunca derruba o deploy. Idempotente: seguro para reexecutar.
-- ============================================================

IF COL_LENGTH(N'dbo.ReceitasAcessorias', N'CanceladaEm') IS NULL
    ALTER TABLE dbo.ReceitasAcessorias ADD CanceladaEm DATETIME2 NULL;
GO

IF COL_LENGTH(N'dbo.ReceitasAcessorias', N'CanceladaPor') IS NULL
    ALTER TABLE dbo.ReceitasAcessorias ADD CanceladaPor INT NULL CONSTRAINT FK_ReceitasAcessorias_CanceladaPor REFERENCES dbo.MembroReferencia(MembroId);
GO

IF COL_LENGTH(N'dbo.ReceitasAcessorias', N'MotivoCancelamento') IS NULL
    ALTER TABLE dbo.ReceitasAcessorias ADD MotivoCancelamento NVARCHAR(300) NULL;
GO

-- Regularização histórica (cessões já canceladas antes desta correção). Duas instruções na ordem certa: primeiro a conta, depois a receita (que depende de a conta não ser RECEBIDA).
BEGIN TRY
    DECLARE @contas INT, @receitas INT;

    UPDATE cr SET Status = N'CANCELADO', MotivoCancelamento = N'Cessão cancelada (regularizado automaticamente pela migração 138)', CanceladoEm = SYSUTCDATETIME()
    FROM dbo.ContasAReceber cr JOIN dbo.CessoesTemplo c ON c.ContaReceberId = cr.ContaReceberId
    WHERE c.Status = N'CANCELADA' AND cr.Status = N'PREVISTO';
    SET @contas = @@ROWCOUNT;

    UPDATE ra SET CanceladaEm = SYSUTCDATETIME(), MotivoCancelamento = N'Cessão cancelada (regularizado automaticamente pela migração 138)'
    FROM dbo.ReceitasAcessorias ra JOIN dbo.CessoesTemplo c ON c.CessaoId = ra.CessaoTemploId
    WHERE c.Status = N'CANCELADA' AND ra.CanceladaEm IS NULL
      AND NOT EXISTS (SELECT 1 FROM dbo.ContasAReceber x WHERE x.ContaReceberId = c.ContaReceberId AND x.Status = N'RECEBIDO');
    SET @receitas = @@ROWCOUNT;

    IF @contas > 0 OR @receitas > 0
        PRINT N'migração 138: ' + CAST(@contas AS NVARCHAR(12)) + N' conta(s) a receber e ' + CAST(@receitas AS NVARCHAR(12)) + N' receita(s) acessória(s) de cessões já canceladas foram canceladas.';
END TRY
BEGIN CATCH
    PRINT N'AVISO migração 138: a regularização das cessões já canceladas NÃO foi feita — ' + ERROR_MESSAGE();
END CATCH
GO
