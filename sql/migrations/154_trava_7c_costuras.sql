-- ============================================================
-- Migração 154 — Trava de Revisão 7-C (costuras entre v7.8, v7.11, v7.12 e v7.15). 23/10/2026.
--
--   1) A regra de aviso CUIDADO_RISCO_CRIANCA: o pedido de oração com sinal de risco SOBRE criança (ou feito por um menor) avisa quem cuida da Proteção de crianças no nível
--      geral, com o prazo do Conselho Tutelar e o caminho para registrar o incidente (o sistema não abre o incidente sozinho). Obrigatória (o e-mail que não sair é reenviado).
--   2) SegurancaEquipe: o motivo de saída AFASTADO — a rotina diária tira da equipe de segurança quem passou a ter pendência reservada à Diretoria (afastamento cautelar,
--      comunicação em análise, cadastro nacional, restrição) ou ficou fora de comunhão. O CHECK é ampliado sem tirar nenhum valor.
--   3) SegurancaPlanos: os CONTATOS LOCAIS e os RESPONSÁVEIS (texto livre com nomes e telefones) das versões SUBSTITUÍDAS do plano de emergência perdem o texto 5 anos depois
--      (política ajustável em PoliticasRetencao). A versão vigente nunca muda; a revisão continua sendo uma versão nova. O gatilho aceita só essa mudança, só com a marca de
--      sessão 'seguranca_purga' (posta e retirada no mesmo lote, com TRY/CATCH: o molde da 148 e da 152), e só numa versão que já tem outra mais nova.
--   4) ComunicacaoConsentimentos: o endereço IP do consentimento é anonimizado 5 anos depois que o consentimento deixou de valer (outra escolha o substituiu) ou que a pessoa
--      saiu do rol — a mesma regra do IP dos aceites das v7.5 a v7.7 (prazo VOLUNTARIADO_IP_RETENCAO_DIAS). O gatilho aceita só essa mudança, com a marca 'comunicacao_purga'.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

-- ---- 1) O aviso à Proteção de crianças ----
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CUIDADO_RISCO_CRIANCA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria)
    VALUES (N'CUIDADO_RISCO_CRIANCA', N'Proteção: pedido de oração com sinal de risco sobre criança — comunique o Conselho Tutelar', N'CUIDADO', NULL, NULL, 1, 1, 1);
GO

-- ---- 2) A saída da equipe de segurança por AFASTADO ----
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_SegurancaEquipe_Motivo' AND definition NOT LIKE N'%AFASTADO%')
    ALTER TABLE dbo.SegurancaEquipe DROP CONSTRAINT CK_SegurancaEquipe_Motivo;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_SegurancaEquipe_Motivo')
    ALTER TABLE dbo.SegurancaEquipe ADD CONSTRAINT CK_SegurancaEquipe_Motivo CHECK (MotivoEncerramento IS NULL OR MotivoEncerramento IN (N'MANUAL', N'SAIU_DA_CONGREGACAO',
        N'DESLIGADO', N'PRAZO', N'EXCLUSAO_LGPD', N'AFASTADO'));
GO

-- ---- 3) Os contatos e responsáveis das versões antigas do plano de emergência ----
IF COL_LENGTH(N'dbo.SegurancaPlanos', N'AnonimizadoEm') IS NULL
    ALTER TABLE dbo.SegurancaPlanos ADD AnonimizadoEm DATETIME2 NULL;
GO
-- A versão do plano não se edita nem se apaga. A única mudança aceita: a retenção (marca 'seguranca_purga') apagar os contatos locais e trocar os responsáveis pelo texto neutro
-- numa versão que JÁ FOI SUBSTITUÍDA por outra mais nova, uma vez (o carimbo AnonimizadoEm nasce e não muda mais).
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_SegurancaPlanos_Imutavel ON dbo.SegurancaPlanos AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        IF EXISTS (SELECT 1 FROM deleted)
        BEGIN
            RAISERROR(N''A versão do plano de emergência não se edita nem se apaga: a revisão é uma versão nova.'', 16, 1);
            ROLLBACK TRANSACTION;
        END
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.PlanoId = i.PlanoId
        WHERE ISNULL(CAST(SESSION_CONTEXT(N''seguranca_purga'') AS INT), 0) <> 1
           OR d.AnonimizadoEm IS NOT NULL OR i.AnonimizadoEm IS NULL
           OR i.ContatosLocais IS NOT NULL OR i.Responsaveis <> N''(anonimizado)''
           OR i.CongregacaoId <> d.CongregacaoId OR i.Versao <> d.Versao OR i.RotasEvacuacao <> d.RotasEvacuacao OR i.PontosEncontro <> d.PontosEncontro
           OR i.RegistradoPorMembroId <> d.RegistradoPorMembroId OR i.RevisadoEm <> d.RevisadoEm
           OR NOT EXISTS (SELECT 1 FROM dbo.SegurancaPlanos x WHERE x.CongregacaoId = i.CongregacaoId AND x.Versao > i.Versao))
    BEGIN
        RAISERROR(N''A versão do plano de emergência não se edita nem se apaga: a revisão é uma versão nova.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Plano de emergência — contatos das versões antigas')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (N'Plano de emergência — contatos das versões antigas', N'LGPD art. 7º, IX: os contatos locais e os responsáveis escritos no plano de emergência servem enquanto a versão vale; 5 anos depois de substituída, a versão antiga perde esses textos (as rotas e os pontos de encontro ficam).', 1825);
GO

-- ---- 4) O endereço IP do consentimento de comunicação ----
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_ComunicacaoConsentimentos_Imutavel ON dbo.ComunicacaoConsentimentos AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM inserted)
    BEGIN
        -- a única mudança aceita: a retenção (marca comunicacao_purga) trocar o IP por "anonimizado"; nada mais muda
        IF ISNULL(CAST(SESSION_CONTEXT(N''comunicacao_purga'') AS INT), 0) <> 1
           OR EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.ConsentimentoId = i.ConsentimentoId
              WHERE ISNULL(i.EnderecoIp, N'''') <> N''anonimizado'' OR d.EnderecoIp IS NULL
                 OR i.MembroId <> d.MembroId OR i.Canal <> d.Canal OR i.Categoria <> d.Categoria OR i.Concedido <> d.Concedido OR i.Origem <> d.Origem
                 OR i.TextoVersao <> d.TextoVersao OR i.TextoHash <> d.TextoHash OR ISNULL(i.DataFicha, ''19000101'') <> ISNULL(d.DataFicha, ''19000101'')
                 OR ISNULL(i.FichaReferencia, N'''') <> ISNULL(d.FichaReferencia, N'''') OR ISNULL(i.RegistradoPorMembroId, -1) <> ISNULL(d.RegistradoPorMembroId, -1)
                 OR ISNULL(i.EnvioId, -1) <> ISNULL(d.EnvioId, -1) OR i.CriadoEm <> d.CriadoEm)
        BEGIN
            RAISERROR(N''O consentimento não se edita: cada mudança é uma linha nova.'', 16, 1);
            ROLLBACK TRANSACTION;
        END
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM deleted) AND ISNULL(CAST(SESSION_CONTEXT(N''comunicacao_purga'') AS INT), 0) <> 1
    BEGIN
        RAISERROR(N''O histórico de consentimento só sai pela exclusão LGPD.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO
