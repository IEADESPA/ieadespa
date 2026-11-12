-- ============================================================
-- Migração 173 — a votação vinculante sabe o que aprova (FASE 10, 12/11/2026)
--
-- Defeito achado pela massa da homologação: a apuração olhava só a opção MAIS VOTADA, qualquer que fosse; se o "Não" ganhasse com folga, a votação ficava
-- "Aprovado" (e a minuta da ata também). Regra decidida pelo responsável e pelo Presidente (12/11/2026), com dois tipos de votação vinculante:
--  - PROPOSTA (aprovar ou rejeitar uma proposta): cada opção tem um papel — APROVA, REJEITA ou BRANCO (o voto em branco não conta). Aprovada quando os votos
--    que aprovam atingem o quórum (QuorumTipo) sobre os votos válidos (aprova + rejeita);
--  - ESCOLHA (escolher entre nomes ou opções: o 2º tesoureiro, o tema do ano): ganha a mais votada, sem precisar de maioria; empate fica para a mesa decidir.
--    Na escolha, ResultadoAprovado = 1 quer dizer "houve uma escolhida" (OpcaoVencedoraId) e 0, empate (ResultadoEmpate = 1).
--
-- As vinculantes que já existem: o papel de cada opção sai do texto (Sim/Aprovo → aprova; Não/Contra → rejeita; Em branco/Abstenção/Nulo → em branco, sem
-- diferenciar acento nem maiúscula); com exatamente uma que aprova, ao menos uma que rejeita e nenhuma outra, é PROPOSTA; senão, ESCOLHA. O resultado das já
-- encerradas NÃO é mudado aqui (foi apurado e talvez usado): a migração só avisa quantas são, para alguém conferir. Idempotente.
-- ============================================================

IF COL_LENGTH('dbo.Enquetes', 'TipoApuracao') IS NULL
    ALTER TABLE dbo.Enquetes ADD TipoApuracao NVARCHAR(20) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Enquetes_TipoApuracao')
    ALTER TABLE dbo.Enquetes ADD CONSTRAINT CK_Enquetes_TipoApuracao CHECK (TipoApuracao IS NULL OR TipoApuracao IN (N'PROPOSTA', N'ESCOLHA'));
GO
IF COL_LENGTH('dbo.Enquetes', 'OpcaoVencedoraId') IS NULL
    ALTER TABLE dbo.Enquetes ADD OpcaoVencedoraId INT NULL;
GO
IF COL_LENGTH('dbo.Enquetes', 'ResultadoEmpate') IS NULL
    ALTER TABLE dbo.Enquetes ADD ResultadoEmpate BIT NULL;
GO
-- Quando a votação foi apurada pela regra nova (as antigas ficam sem: é assim que o aviso abaixo as acha)
IF COL_LENGTH('dbo.Enquetes', 'ApuradaEm') IS NULL
    ALTER TABLE dbo.Enquetes ADD ApuradaEm DATETIME2 NULL;
GO
IF COL_LENGTH('dbo.OpcoesEnquete', 'Papel') IS NULL
    ALTER TABLE dbo.OpcoesEnquete ADD Papel NVARCHAR(10) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_OpcoesEnquete_Papel')
    ALTER TABLE dbo.OpcoesEnquete ADD CONSTRAINT CK_OpcoesEnquete_Papel CHECK (Papel IS NULL OR Papel IN (N'APROVA', N'REJEITA', N'BRANCO'));
GO

-- O papel de cada opção das vinculantes antigas, pelo texto (sem acento, sem maiúscula, sem espaço nas pontas)
UPDATE o SET Papel = CASE
    WHEN t.txt IN (N'sim', N'aprovo', N'aprova', N'aprovado', N'aprovada', N'a favor', N'favoravel') THEN N'APROVA'
    WHEN t.txt IN (N'nao', N'rejeito', N'rejeita', N'rejeitado', N'rejeitada', N'contra', N'contrario') THEN N'REJEITA'
    WHEN t.txt IN (N'em branco', N'branco', N'abstencao', N'me abstenho', N'nulo', N'voto em branco') THEN N'BRANCO'
  END
FROM dbo.OpcoesEnquete o
JOIN dbo.PerguntasEnquete p ON p.PerguntaId = o.PerguntaId
JOIN dbo.Enquetes e ON e.EnqueteId = p.EnqueteId
CROSS APPLY (SELECT LOWER(LTRIM(RTRIM(o.Texto))) COLLATE Latin1_General_CI_AI AS txt) t
WHERE e.Vinculante = 1 AND e.TipoApuracao IS NULL AND o.Papel IS NULL;
GO

UPDATE e SET TipoApuracao = CASE WHEN c.aprova = 1 AND c.rejeita >= 1 AND c.sem = 0 THEN N'PROPOSTA' ELSE N'ESCOLHA' END
FROM dbo.Enquetes e
CROSS APPLY (
    SELECT SUM(CASE WHEN o.Papel = N'APROVA' THEN 1 ELSE 0 END) AS aprova,
           SUM(CASE WHEN o.Papel = N'REJEITA' THEN 1 ELSE 0 END) AS rejeita,
           SUM(CASE WHEN o.Papel IS NULL THEN 1 ELSE 0 END) AS sem
    FROM dbo.OpcoesEnquete o JOIN dbo.PerguntasEnquete p ON p.PerguntaId = o.PerguntaId
    WHERE p.EnqueteId = e.EnqueteId
) c
WHERE e.Vinculante = 1 AND e.TipoApuracao IS NULL;
GO

-- Na escolha o papel não vale: volta a vazio
UPDATE o SET Papel = NULL
FROM dbo.OpcoesEnquete o
JOIN dbo.PerguntasEnquete p ON p.PerguntaId = o.PerguntaId
JOIN dbo.Enquetes e ON e.EnqueteId = p.EnqueteId
WHERE e.TipoApuracao = N'ESCOLHA' AND o.Papel IS NOT NULL;
GO

DECLARE @antigas INT = (SELECT COUNT(*) FROM dbo.Enquetes WHERE Vinculante = 1 AND Status = N'ENCERRADA' AND ResultadoAprovado IS NOT NULL AND ApuradaEm IS NULL);
IF @antigas > 0
    PRINT CONCAT('AVISO migração 173: ', @antigas, ' votação(ões) vinculante(s) já encerrada(s) foram apuradas pela regra antiga (a opção mais votada, qualquer que fosse). O resultado delas não foi mudado: confira cada uma.');
GO
