-- ============================================================
-- Migração 153 — Trava de Revisão 7-C (23/10/2026)
--
--   1) A base legal das políticas de retenção, corrigida (LGPD Art. 11, II: não existe a hipótese "organização religiosa"; o vínculo de membro é exercício regular
--      de direitos, alínea "d"; o legítimo interesse do Art. 7º, IX não serve para dado sensível; a multa do ECA Art. 245 não alcança a Igreja como tal).
--      Cada texto só troca se ainda for EXATAMENTE o original da migração que o criou: o que o Encarregado editou na tela fica como está.
--   2) As retenções que estavam só "anotadas" desde a v7.2, v7.3 e v7.4 ganham política própria (prazo padrão ajustável na tela) e o esquema que a rotina diária usa:
--      - a justificativa de ausência do dirigente na Santa Ceia Geral (pode citar saúde) sai 2 anos depois da Ceia (fica que a ausência foi justificada);
--      - a ocorrência de canal ENCERRADA perde a descrição, o link, a observação da advertência e quem avisou 5 anos depois (o gatilho do relógio só aceita isso com a
--        marca de sessão 'canais_purga'); quem deixou de administrar um canal perde o nome 5 anos depois;
--      - o contato do convidado externo sai 1 ano depois do último evento dele.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

-- ---- 1) Base legal corrigida (só onde o texto ainda é o original) ----

UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'LGPD Art. 11, II, "d" — exercício regular de direitos da associação religiosa com os seus membros (Código Civil arts. 53 a 61; Estatuto); mantidos enquanto durar o vínculo de membresia.'
WHERE Categoria = N'Dados Cadastrais Básicos'
  AND BaseLegal = N'LGPD Art. 16, I — cumprimento de obrigação legal/regulatória do Estatuto; mantidos enquanto durar o vínculo de membresia.';
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'LGPD Art. 11, II, "d" — exercício regular de direitos, inclusive em processo administrativo interno (Código Civil art. 57): histórico disciplinar e reincidência (Regimento Art. 77); retenção indeterminada.'
WHERE Categoria = N'Processo Disciplinar'
  AND BaseLegal = N'LGPD Art. 16, II — exercício regular de direitos (histórico disciplinar/reincidência, Regimento Art. 77); retenção indeterminada.';
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'LGPD Art. 11, II, "d" — exercício regular de direitos da associação com os seus membros: prova da formação exigida pelos fluxos (consagração, liderança, escala), verificável pelo código impresso; sem prazo enquanto o certificado valer. A verificação pública mostra só o papel.'
WHERE Categoria = N'Formação e certificados (trilhas)'
  AND BaseLegal = N'LGPD Art. 11, II, "a" e Art. 7º, IX — prova da formação exigida pelos fluxos (consagração, liderança, escala) e verificável por terceiros pelo código impresso; retenção indeterminada enquanto o certificado puder ser apresentado. A verificação pública mostra só o que está impresso no papel.';
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Incidente, relato, comunicação ao Conselho Tutelar e decisões (ECA arts. 13 e 70-B; Lei 14.344/2022; Lei 13.431/2017; LGPD arts. 11, II, a e e, e 14): 20 anos do encerramento, porque a apuração corre a partir dos 18 anos da vítima. Acesso restrito; cada leitura do relato fica registrada.'
WHERE Categoria = N'Incidentes de proteção de crianças e adolescentes'
  AND BaseLegal = N'Incidente, relato espontâneo, comunicação ao Conselho Tutelar e decisões (ECA arts. 13 e 245; Lei 13.431/2017; LGPD arts. 11 e 14): guardados por 20 anos do encerramento, porque o prazo para a apuração corre a partir dos 18 anos da vítima. Acesso restrito, com registro de cada leitura do relato.';
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Fila de acompanhamento (Regimento Arts. 85 e 128 §5º; LGPD art. 11, II, d e e): o item encerrado guarda-se 5 anos como registro do cuidado e depois perde o nome, o contato, o motivo e as observações; a contagem fica.'
WHERE Categoria = N'Cuidado pastoral — acompanhamentos'
  AND BaseLegal = N'Fila de acompanhamento (Regimento Art. 128 §5º; LGPD arts. 7º, IX e 11): o item encerrado guarda-se 5 anos como registro do cuidado e depois perde o nome, o contato, o motivo e as observações; a contagem fica.';
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Pedido de oração, também o do mural do site (LGPD art. 11, I: a própria pessoa pede; dado sensível de convicção religiosa e saúde): o texto sai em 1 ano; o assunto e as datas ficam para a contagem. O boletim nunca leva o texto.'
WHERE Categoria = N'Cuidado pastoral — pedidos de oração'
  AND BaseLegal = N'Pedido de oração (LGPD art. 11, dado sensível de convicção religiosa e saúde): o texto sai em 1 ano; o assunto e as datas ficam para a contagem. O boletim nunca leva o texto.';
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Comunicados aos membros (LGPD art. 11, I — consentimento por canal e categoria — e 11, II, d): quem recebeu, por qual canal e se leu; depois de 1 ano o registro perde o nome e o aviso do sininho sai (a contagem fica). O histórico de consentimento sai na exclusão LGPD.'
WHERE Categoria = N'Comunicação — registro de entrega'
  AND BaseLegal = N'Comunicados aos membros (LGPD arts. 7º, I e IX, e 11, II, a): quem recebeu, por qual canal e se leu; depois de 1 ano o registro perde o nome e o aviso do sininho sai (a contagem do envio fica). O histórico de consentimento fica enquanto a pessoa estiver no cadastro e sai na exclusão LGPD.';
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Registro institucional dos canais (Estatuto Art. 12) e prova de diligência na moderação (Regimento Art. 160 §1º, II). A ocorrência encerrada e o administrador que saiu perdem a identificação em 5 anos, pela rotina diária (políticas "Canais — ...").'
WHERE Categoria = N'Canais de comunicação e ocorrências de moderação'
  AND BaseLegal = N'Registro institucional dos canais (Estatuto Art. 12) e prova de diligência na moderação (Regimento Art. 160 §1º, II). Guarda matrículas de quem relatou, administra e removeu. 5 anos, por margem sobre a prescrição da reparação civil; sem descarte automático por ora.';
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Caixa do evento: registro financeiro, 5 anos (CTN art. 173; Reg. Art. 152). Convidado externo: prova do Protocolo de Convidados (Reg. Art. 111-A); o contato sai 1 ano depois do último evento dele, pela rotina diária (política "Eventos — contato do convidado externo").'
WHERE Categoria = N'Eventos, convidados externos e caixa flutuante'
  AND BaseLegal = N'Caixa do evento: registro financeiro, 5 anos (CTN art. 173; Reg. Art. 152). Convidado externo: prova do Protocolo de Convidados (Reg. Art. 111-A); o contato é dado de terceiro e não é necessário após o evento. Sem descarte automático por ora.';
GO

-- ---- 2) As políticas novas (prazo padrão; o Encarregado ajusta na tela) ----

IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Calendário — justificativa de ausência na Santa Ceia')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao) VALUES (N'Calendário — justificativa de ausência na Santa Ceia', N'x', 730);
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Canais — ocorrência de moderação encerrada')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao) VALUES (N'Canais — ocorrência de moderação encerrada', N'x', 1825);
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Canais — administrador que deixou a função')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao) VALUES (N'Canais — administrador que deixou a função', N'x', 1825);
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Eventos — contato do convidado externo')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao) VALUES (N'Eventos — contato do convidado externo', N'x', 365);
GO
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Regimento Art. 154-A; LGPD art. 11, II, d: a justificativa de ausência do dirigente na Santa Ceia Geral (pode citar saúde) é apagada pela rotina diária 2 anos depois da Ceia; fica só que a ausência foi justificada.'
WHERE Categoria = N'Calendário — justificativa de ausência na Santa Ceia' AND BaseLegal = N'x';
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Prova de diligência (Regimento Art. 160 §1º, II; CC art. 206, §3º, V): 5 anos depois de encerrada (removida ou improcedente), a descrição, o link, a observação da advertência e quem avisou saem; ficam canal, categoria, datas e desfecho.'
WHERE Categoria = N'Canais — ocorrência de moderação encerrada' AND BaseLegal = N'x';
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Regimento Art. 160 §1º: quem administrou um canal oficial fica no registro 5 anos depois de deixar a função; depois o nome e o motivo da saída saem (ficam o papel, as datas e a versão do termo aceito).'
WHERE Categoria = N'Canais — administrador que deixou a função' AND BaseLegal = N'x';
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'LGPD arts. 7º, IX e 16: o contato do convidado externo serve para organizar o evento; 1 ano depois do último evento dele (mesmo nome ou mesmo contato) é apagado. Ficam o nome e o protocolo (Regimento Art. 111-A).'
WHERE Categoria = N'Eventos — contato do convidado externo' AND BaseLegal = N'x';
GO

-- ---- 3) Calendário: a marca de quando a justificativa saiu ----

IF COL_LENGTH(N'dbo.CalendarioPresencasDirigente', N'JustificativaApagadaEm') IS NULL
    ALTER TABLE dbo.CalendarioPresencasDirigente ADD JustificativaApagadaEm DATETIME2 NULL;
GO

-- ---- 4) Convidado externo: a marca de quando o contato saiu ----

IF COL_LENGTH(N'dbo.EventoConvidados', N'ContatoApagadoEm') IS NULL
    ALTER TABLE dbo.EventoConvidados ADD ContatoApagadoEm DATETIME2 NULL;
GO

-- ---- 5) Ocorrência de canal: quem avisou passa a aceitar vazio (só na anonimização) ----

IF COL_LENGTH(N'dbo.CanalOcorrencias', N'AnonimizadaEm') IS NULL
    ALTER TABLE dbo.CanalOcorrencias ADD AnonimizadaEm DATETIME2 NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.CanalOcorrencias') AND name = N'RelatadaPorMembroId' AND is_nullable = 0)
    ALTER TABLE dbo.CanalOcorrencias ALTER COLUMN RelatadaPorMembroId INT NULL;
GO
-- vazio só na anonimização, e só a ocorrência encerrada se anonimiza
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_CanalOcorrencias_Anonimizada')
    ALTER TABLE dbo.CanalOcorrencias ADD CONSTRAINT CK_CanalOcorrencias_Anonimizada
        CHECK ((RelatadaPorMembroId IS NOT NULL OR AnonimizadaEm IS NOT NULL) AND (AnonimizadaEm IS NULL OR Status <> 'ABERTA'));
GO
-- O gatilho do relógio: continua barrando mudar hora, prazo, canal, categoria, quem avisou e a descrição; a única exceção é a anonimização da retenção (marca de sessão
-- 'canais_purga', a descrição e quem avisou saem juntos e a data da anonimização entra). Também barra pôr de volta quem avisou (antes um NULL passava pela comparação).
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_CanalOcorrencias_RelogioImutavel ON dbo.CanalOcorrencias AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @purga BIT = CASE WHEN ISNULL(CAST(SESSION_CONTEXT(N''canais_purga'') AS INT), 0) = 1 THEN 1 ELSE 0 END;
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.OcorrenciaId = i.OcorrenciaId
               WHERE i.RelatadaEm <> d.RelatadaEm OR i.PrazoRemocaoEm <> d.PrazoRemocaoEm OR i.CanalId <> d.CanalId OR i.Categoria <> d.Categoria
                  OR (d.AnonimizadaEm IS NOT NULL AND (i.AnonimizadaEm IS NULL OR i.AnonimizadaEm <> d.AnonimizadaEm))
                  OR ((i.Descricao <> d.Descricao OR ISNULL(i.RelatadaPorMembroId, -1) <> ISNULL(d.RelatadaPorMembroId, -1))
                      AND NOT (@purga = 1 AND d.AnonimizadaEm IS NULL AND i.AnonimizadaEm IS NOT NULL AND i.RelatadaPorMembroId IS NULL)))
    BEGIN
        RAISERROR(N''O aviso da ocorrência (hora, prazo, canal, categoria, autor e descrição) é imutável (Regimento Art. 160, §1º, II); só a retenção o anonimiza.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 6) Administrador de canal: o nome sai 5 anos depois de deixar a função ----
-- Os dois índices da coluna precisam sair para mudar a nulidade; voltam logo abaixo, iguais.

IF COL_LENGTH(N'dbo.CanalAdministradores', N'AnonimizadoEm') IS NULL
    ALTER TABLE dbo.CanalAdministradores ADD AnonimizadoEm DATETIME2 NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.CanalAdministradores') AND name = N'MembroId' AND is_nullable = 0)
BEGIN
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CanalAdministradores_Ativo' AND object_id = OBJECT_ID(N'dbo.CanalAdministradores'))
        DROP INDEX UX_CanalAdministradores_Ativo ON dbo.CanalAdministradores;
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CanalAdministradores_Membro' AND object_id = OBJECT_ID(N'dbo.CanalAdministradores'))
        DROP INDEX IX_CanalAdministradores_Membro ON dbo.CanalAdministradores;
    ALTER TABLE dbo.CanalAdministradores ALTER COLUMN MembroId INT NULL;
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CanalAdministradores_Ativo' AND object_id = OBJECT_ID(N'dbo.CanalAdministradores'))
    CREATE UNIQUE INDEX UX_CanalAdministradores_Ativo ON dbo.CanalAdministradores (CanalId, MembroId) WHERE EncerradoEm IS NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CanalAdministradores_Membro' AND object_id = OBJECT_ID(N'dbo.CanalAdministradores'))
    CREATE INDEX IX_CanalAdministradores_Membro ON dbo.CanalAdministradores (MembroId) INCLUDE (CanalId) WHERE EncerradoEm IS NULL;
GO
-- vazio só depois de encerrado e anonimizado
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_CanalAdministradores_Anonimizado')
    ALTER TABLE dbo.CanalAdministradores ADD CONSTRAINT CK_CanalAdministradores_Anonimizado
        CHECK (MembroId IS NOT NULL OR (AnonimizadoEm IS NOT NULL AND EncerradoEm IS NOT NULL));
GO
