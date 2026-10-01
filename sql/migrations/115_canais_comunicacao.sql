-- ============================================================
-- Migração 115 — v7.3: Canais Oficiais e Comunicação
-- (Estatuto Art. 11 V e Art. 12; Regimento Art. 157 §5º, 160 e 160-A).
--
-- A relação de Canais Oficiais (Art. 12 §1º) já existia como um catálogo mínimo
-- (CanaisOficiaisComunicacao: sigla, nome, ativo — migração 020), usado pelas tentativas
-- de contato do Abandono Digital. Aqui ele vira o REGISTRO de verdade, sem mudar a chave
-- (CanalId) nem quebrar as tentativas já gravadas:
--   - plataforma, categoria (institucional / grupo oficial / grupo focado), identificador,
--     vínculo institucional (CNPJ, marca ou estrutura) e a declaração de que NÃO é conta
--     pessoal (Art. 12, caput), escopo (campo, Área, congregação, departamento);
--   - custódia da senha pela Secretaria Geral (Art. 160 §4º, I). O sistema NUNCA guarda
--     a senha: só quem a custodia, a data da última troca e o que está pendente.
-- Tabelas novas: administradores formais com Termo de Dever de Moderação aceito;
-- trocas de credencial pendentes (sucessão de liderança); estado da liderança por escopo
-- (para detectar a saída de um dirigente por qualquer caminho); ocorrências da Regra das
-- 24 Horas (relógio imutável); conferências de conformidade; transmissão dos cultos e
-- Área Cega por congregação (Art. 160 §2º).
-- Permissão nova: canais_gestao (nunca concedida por padrão). Seis regras de aviso.
--
-- Idempotente: seguro para reexecutar sem apagar dados. Cada ALTER em batch próprio (GO);
-- o gatilho é criado por EXEC (CREATE TRIGGER exige batch próprio).
-- ============================================================

-- ---- 1) Registro de canais: novas colunas na tabela existente ----

IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'Plataforma') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD Plataforma NVARCHAR(20) NULL;
GO
IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'Categoria') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD Categoria NVARCHAR(20) NOT NULL CONSTRAINT DF_Canais_Categoria DEFAULT 'INSTITUCIONAL';
GO
IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'TemaFocado') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD TemaFocado NVARCHAR(30) NULL;
GO
IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'Identificador') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD Identificador NVARCHAR(200) NULL;
GO
IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'IdentificadorNormalizado') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD IdentificadorNormalizado NVARCHAR(200) NULL;
GO
IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'VinculoInstitucional') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD VinculoInstitucional NVARCHAR(12) NULL;
GO
IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'DeclaracaoInstitucionalPorMembroId') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD DeclaracaoInstitucionalPorMembroId INT NULL CONSTRAINT FK_Canais_Declarante REFERENCES dbo.MembroReferencia(MembroId);
GO
IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'DeclaracaoInstitucionalEm') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD DeclaracaoInstitucionalEm DATETIME2 NULL;
GO
IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'Escopo') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD Escopo NVARCHAR(14) NOT NULL CONSTRAINT DF_Canais_Escopo DEFAULT 'CAMPO';
GO
IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'CongregacaoId') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD CongregacaoId INT NULL CONSTRAINT FK_Canais_Congregacao REFERENCES dbo.Congregacoes(CongregacaoId);
GO
IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'AreaId') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD AreaId INT NULL CONSTRAINT FK_Canais_Area REFERENCES dbo.Areas(AreaId);
GO
IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'DepartamentoId') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD DepartamentoId INT NULL CONSTRAINT FK_Canais_Departamento REFERENCES dbo.Departamentos(DepartamentoId);
GO
IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'IncluiMenores') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD IncluiMenores BIT NOT NULL CONSTRAINT DF_Canais_Menores DEFAULT 0;
GO
IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'PublicoNoSite') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD PublicoNoSite BIT NOT NULL CONSTRAINT DF_Canais_Publico DEFAULT 0;
GO
IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'Descricao') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD Descricao NVARCHAR(500) NULL;
GO
IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'CustodiaSecretaria') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD CustodiaSecretaria BIT NOT NULL CONSTRAINT DF_Canais_Custodia DEFAULT 0;
GO
IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'UltimaTrocaCredencialEm') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD UltimaTrocaCredencialEm DATE NULL;
GO
IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'UltimaTrocaPorMembroId') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD UltimaTrocaPorMembroId INT NULL CONSTRAINT FK_Canais_UltimaTroca REFERENCES dbo.MembroReferencia(MembroId);
GO
IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'VigenteDesde') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD VigenteDesde DATE NULL;
GO
IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'VigenteAte') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD VigenteAte DATE NULL;
GO
IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'DesativadoMotivo') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD DesativadoMotivo NVARCHAR(300) NULL;
GO
IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'RegistradoPorMembroId') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD RegistradoPorMembroId INT NULL CONSTRAINT FK_Canais_RegistradoPor REFERENCES dbo.MembroReferencia(MembroId);
GO
IF COL_LENGTH(N'dbo.CanaisOficiaisComunicacao', N'RegistradoEm') IS NULL
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD RegistradoEm DATETIME2 NOT NULL CONSTRAINT DF_Canais_RegistradoEm DEFAULT SYSUTCDATETIME();
GO

-- Os três canais semeados em 020 viram canais institucionais do campo todo. Ficam SEM
-- identificador de propósito: a Secretaria completa o cadastro (o painel os marca como pendentes).
UPDATE dbo.CanaisOficiaisComunicacao SET Plataforma = 'WHATSAPP', VinculoInstitucional = 'ESTRUTURA', VigenteDesde = CAST(SYSUTCDATETIME() AS DATE)
WHERE Sigla = N'WHATSAPP_INSTITUCIONAL' AND Plataforma IS NULL;
UPDATE dbo.CanaisOficiaisComunicacao SET Plataforma = 'EMAIL', VinculoInstitucional = 'ESTRUTURA', VigenteDesde = CAST(SYSUTCDATETIME() AS DATE)
WHERE Sigla = N'EMAIL_OFICIAL' AND Plataforma IS NULL;
UPDATE dbo.CanaisOficiaisComunicacao SET Plataforma = 'SISTEMA', VinculoInstitucional = 'ESTRUTURA', Identificador = N'Meu Painel (este sistema)',
       IdentificadorNormalizado = N'meu painel (este sistema)', VigenteDesde = CAST(SYSUTCDATETIME() AS DATE)
WHERE Sigla = N'SISTEMA' AND Plataforma IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Canais_Plataforma')
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD CONSTRAINT CK_Canais_Plataforma
        CHECK (Plataforma IS NULL OR Plataforma IN ('WHATSAPP','WHATSAPP_GRUPO','TELEGRAM','INSTAGRAM','TIKTOK','FACEBOOK','YOUTUBE','EMAIL','TELEFONE','SITE','SISTEMA','OUTRO'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Canais_Categoria')
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD CONSTRAINT CK_Canais_Categoria CHECK (Categoria IN ('INSTITUCIONAL','GRUPO_OFICIAL','GRUPO_FOCADO'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Canais_Tema')
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD CONSTRAINT CK_Canais_Tema
        -- IS NOT NULL explícito: NULL IN (...) é desconhecido e um CHECK aceita desconhecido.
        CHECK ((Categoria = 'GRUPO_FOCADO' AND TemaFocado IS NOT NULL AND TemaFocado IN ('CIDADANIA_POLITICA','EMPREENDEDORISMO_BAZAR','TEOLOGICO_DEBATES','GERACIONAL','OUTRO'))
            OR (Categoria <> 'GRUPO_FOCADO' AND TemaFocado IS NULL));
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Canais_Vinculo')
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD CONSTRAINT CK_Canais_Vinculo CHECK (VinculoInstitucional IS NULL OR VinculoInstitucional IN ('CNPJ','MARCA','ESTRUTURA'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Canais_Escopo')
    ALTER TABLE dbo.CanaisOficiaisComunicacao ADD CONSTRAINT CK_Canais_Escopo
        CHECK ((Escopo = 'CAMPO')
            OR (Escopo = 'AREA' AND AreaId IS NOT NULL)
            OR (Escopo = 'CONGREGACAO' AND CongregacaoId IS NOT NULL)
            OR (Escopo = 'DEPARTAMENTO' AND DepartamentoId IS NOT NULL));
GO

-- Dois canais ativos não podem ter o mesmo identificador na mesma plataforma.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Canais_Identificador' AND object_id = OBJECT_ID(N'dbo.CanaisOficiaisComunicacao'))
    CREATE UNIQUE INDEX UX_Canais_Identificador ON dbo.CanaisOficiaisComunicacao (Plataforma, IdentificadorNormalizado)
        WHERE Ativo = 1 AND Plataforma IS NOT NULL AND IdentificadorNormalizado IS NOT NULL;
GO

-- ---- 2) Administradores formais (Termo de Dever de Moderação) ----

IF OBJECT_ID(N'dbo.CanalAdministradores', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CanalAdministradores (
        AdminId               INT IDENTITY PRIMARY KEY,
        CanalId               INT NOT NULL REFERENCES dbo.CanaisOficiaisComunicacao(CanalId),
        MembroId              INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Papel                 NVARCHAR(14) NOT NULL CONSTRAINT CK_CanalAdministradores_Papel CHECK (Papel IN ('ADMINISTRADOR','OPERADOR')),
        DesignadoPorMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DesignadoEm           DATETIME2 NOT NULL CONSTRAINT DF_CanalAdministradores_Em DEFAULT SYSUTCDATETIME(),
        TermoVersaoAceita     INT NULL,
        TermoHashAceito       NVARCHAR(64) NULL,
        TermoAceitoEm         DATETIME2 NULL,
        EncerradoEm           DATETIME2 NULL,
        EncerradoPorMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        MotivoEncerramento    NVARCHAR(200) NULL,
        CONSTRAINT CK_CanalAdministradores_Termo CHECK ((TermoVersaoAceita IS NULL AND TermoAceitoEm IS NULL AND TermoHashAceito IS NULL)
                                                    OR (TermoVersaoAceita IS NOT NULL AND TermoAceitoEm IS NOT NULL AND TermoHashAceito IS NOT NULL))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CanalAdministradores_Ativo' AND object_id = OBJECT_ID(N'dbo.CanalAdministradores'))
    CREATE UNIQUE INDEX UX_CanalAdministradores_Ativo ON dbo.CanalAdministradores (CanalId, MembroId) WHERE EncerradoEm IS NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CanalAdministradores_Membro' AND object_id = OBJECT_ID(N'dbo.CanalAdministradores'))
    CREATE INDEX IX_CanalAdministradores_Membro ON dbo.CanalAdministradores (MembroId) INCLUDE (CanalId) WHERE EncerradoEm IS NULL;
GO

-- ---- 3) Trocas de credencial pendentes (Art. 160 §4º, I) ----

IF OBJECT_ID(N'dbo.CanalTrocasCredencial', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CanalTrocasCredencial (
        TrocaId               INT IDENTITY PRIMARY KEY,
        CanalId               INT NOT NULL REFERENCES dbo.CanaisOficiaisComunicacao(CanalId),
        Motivo                NVARCHAR(24) NOT NULL CONSTRAINT CK_CanalTrocas_Motivo CHECK (Motivo IN ('SUCESSAO_LIDERANCA','SAIDA_ADMINISTRADOR','SUSPEITA_INVASAO','ROTINA')),
        MembroReferenciaId    INT NULL REFERENCES dbo.MembroReferencia(MembroId),     -- quem saiu (quando for o caso)
        GeradaEm              DATETIME2 NOT NULL CONSTRAINT DF_CanalTrocas_Em DEFAULT SYSUTCDATETIME(),
        PrazoEm               DATE NOT NULL,
        Observacao            NVARCHAR(300) NULL,
        ResolvidaEm           DATETIME2 NULL,
        ResolvidaPorMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ObservacaoResolucao   NVARCHAR(300) NULL
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CanalTrocas_Aberta' AND object_id = OBJECT_ID(N'dbo.CanalTrocasCredencial'))
    CREATE UNIQUE INDEX UX_CanalTrocas_Aberta ON dbo.CanalTrocasCredencial (CanalId, Motivo, MembroReferenciaId) WHERE ResolvidaEm IS NULL;
GO

-- ---- 4) Estado conhecido da liderança por escopo (detecta a saída por qualquer caminho) ----

IF OBJECT_ID(N'dbo.CanalLiderancaSnapshot', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CanalLiderancaSnapshot (
        EscopoTipo      NVARCHAR(14) NOT NULL CONSTRAINT CK_CanalSnapshot_Tipo CHECK (EscopoTipo IN ('CONGREGACAO','AREA','DEPARTAMENTO')),
        EscopoId        INT NOT NULL,
        Assinatura      NVARCHAR(400) NOT NULL CONSTRAINT DF_CanalSnapshot_Ass DEFAULT '',     -- matrículas ordenadas "12,40"
        AtualizadoEm    DATETIME2 NOT NULL CONSTRAINT DF_CanalSnapshot_Em DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_CanalLiderancaSnapshot PRIMARY KEY (EscopoTipo, EscopoId)
    );
END
GO

-- ---- 5) Ocorrências — Regra das 24 Horas (Art. 160 §1º, II) ----

IF OBJECT_ID(N'dbo.CanalOcorrencias', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CanalOcorrencias (
        OcorrenciaId          INT IDENTITY PRIMARY KEY,
        CanalId               INT NOT NULL REFERENCES dbo.CanaisOficiaisComunicacao(CanalId),
        Categoria             NVARCHAR(24) NOT NULL CONSTRAINT CK_CanalOcorrencias_Cat CHECK (Categoria IN
                              ('OFENSIVO','PORNOGRAFICO','FAKE_NEWS','PROPAGANDA_POLITICA','DEBATE_POLITICO','PROPAGANDA_COMERCIAL','EXPOSICAO_MENOR','FILMAGEM_INDEVIDA','NEUTRALIDADE_REDE','OUTRO')),
        Descricao             NVARCHAR(500) NOT NULL,
        LinkEvidencia         NVARCHAR(500) NULL,
        RelatadaPorMembroId   INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RelatadaEm            DATETIME2 NOT NULL CONSTRAINT DF_CanalOcorrencias_Em DEFAULT SYSUTCDATETIME(),
        PrazoRemocaoEm        DATETIME2 NOT NULL,
        Status                NVARCHAR(14) NOT NULL CONSTRAINT DF_CanalOcorrencias_Status DEFAULT 'ABERTA' CONSTRAINT CK_CanalOcorrencias_Status CHECK (Status IN ('ABERTA','REMOVIDA','IMPROCEDENTE')),
        RemovidaEm            DATETIME2 NULL,
        RemocaoRegistradaEm   DATETIME2 NULL,
        RemovidaPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ProvaRemocao          NVARCHAR(500) NULL,
        LinkProva             NVARCHAR(500) NULL,
        AdvertenciaEm         DATETIME2 NULL,
        AdvertenciaPorMembroId INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AdvertenciaObs        NVARCHAR(300) NULL,
        DecididaPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DecididaEm            DATETIME2 NULL,
        MotivoImprocedente    NVARCHAR(300) NULL,
        CONSTRAINT CK_CanalOcorrencias_Remocao CHECK (Status <> 'REMOVIDA' OR (RemovidaEm IS NOT NULL AND ProvaRemocao IS NOT NULL AND RemovidaEm >= RelatadaEm)),
        CONSTRAINT CK_CanalOcorrencias_Improc CHECK (Status <> 'IMPROCEDENTE' OR MotivoImprocedente IS NOT NULL)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CanalOcorrencias_Status' AND object_id = OBJECT_ID(N'dbo.CanalOcorrencias'))
    CREATE INDEX IX_CanalOcorrencias_Status ON dbo.CanalOcorrencias (Status, PrazoRemocaoEm) INCLUDE (CanalId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CanalOcorrencias_Canal' AND object_id = OBJECT_ID(N'dbo.CanalOcorrencias'))
    CREATE INDEX IX_CanalOcorrencias_Canal ON dbo.CanalOcorrencias (CanalId, RelatadaEm DESC);
GO

-- A hora do aviso e o prazo são a prova do relógio: nenhum UPDATE os altera (nem o conteúdo relatado).
IF OBJECT_ID(N'dbo.TR_CanalOcorrencias_RelogioImutavel', N'TR') IS NULL
    EXEC(N'CREATE TRIGGER dbo.TR_CanalOcorrencias_RelogioImutavel ON dbo.CanalOcorrencias AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF (UPDATE(RelatadaEm) OR UPDATE(PrazoRemocaoEm) OR UPDATE(CanalId) OR UPDATE(Categoria) OR UPDATE(RelatadaPorMembroId) OR UPDATE(Descricao))
       AND EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.OcorrenciaId = i.OcorrenciaId
                   WHERE i.RelatadaEm <> d.RelatadaEm OR i.PrazoRemocaoEm <> d.PrazoRemocaoEm OR i.CanalId <> d.CanalId
                      OR i.Categoria <> d.Categoria OR i.RelatadaPorMembroId <> d.RelatadaPorMembroId OR i.Descricao <> d.Descricao)
    BEGIN
        RAISERROR(N''O aviso da ocorrência (hora, prazo, canal, categoria, autor e descrição) é imutável (Regimento Art. 160, §1º, II).'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 6) Conferências de conformidade ----

IF OBJECT_ID(N'dbo.CanalConferencias', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CanalConferencias (
        ConferenciaId         INT IDENTITY PRIMARY KEY,
        CanalId               INT NOT NULL REFERENCES dbo.CanaisOficiaisComunicacao(CanalId),
        ConferidoEm           DATETIME2 NOT NULL CONSTRAINT DF_CanalConferencias_Em DEFAULT SYSUTCDATETIME(),
        ConferidoPorMembroId  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ItensJson             NVARCHAR(MAX) NOT NULL CONSTRAINT CK_CanalConferencias_Json CHECK (ISJSON(ItensJson) = 1),
        Resultado             NVARCHAR(10) NOT NULL CONSTRAINT CK_CanalConferencias_Res CHECK (Resultado IN ('CONFORME','IRREGULAR')),
        Observacao            NVARCHAR(300) NULL
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CanalConferencias_Canal' AND object_id = OBJECT_ID(N'dbo.CanalConferencias'))
    CREATE INDEX IX_CanalConferencias_Canal ON dbo.CanalConferencias (CanalId, ConferidoEm DESC);
GO

-- ---- 7) Transmissão dos cultos e Área Cega (Art. 160 §2º) ----

IF OBJECT_ID(N'dbo.CongregacaoTransmissao', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CongregacaoTransmissao (
        CongregacaoId         INT NOT NULL PRIMARY KEY REFERENCES dbo.Congregacoes(CongregacaoId),
        Transmite             BIT NOT NULL,
        PlacaAvisoInstaladaEm DATE NULL,
        AreaCegaSituacao      NVARCHAR(24) NOT NULL CONSTRAINT DF_CongTransmissao_Area DEFAULT 'PENDENTE'
                              CONSTRAINT CK_CongTransmissao_Area CHECK (AreaCegaSituacao IN ('DEFINIDA','ESTRUTURA_NAO_PERMITE','PENDENTE')),
        AreaCegaDescricao     NVARCHAR(300) NULL,
        ConferidoPorMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ConferidoEm           DATETIME2 NOT NULL CONSTRAINT DF_CongTransmissao_Em DEFAULT SYSUTCDATETIME()
    );
END
GO

-- ---- 8) Permissão, prazos, avisos e retenção ----

IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'canais_gestao')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('canais_gestao', N'Canais — Secretaria Geral/Comunicação: registro, administradores, senhas, ocorrências e transmissão');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'CANAIS_TROCA_CREDENCIAL_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('CANAIS_TROCA_CREDENCIAL_DIAS', N'Canais — prazo (dias) para trocar a senha/acesso após a saída de quem tinha acesso (Reg. Art. 160 §4º, I: "imediatamente")', 2);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'CANAIS_CONFERENCIA_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('CANAIS_CONFERENCIA_DIAS', N'Canais — intervalo (dias) entre as conferências de conformidade de cada canal', 180);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CANAIS_OCORRENCIA_NOVA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'CANAIS_OCORRENCIA_NOVA', N'Conteúdo irregular em canal que você administra: prazo de 24 horas para remover', N'CANAIS', NULL, NULL, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CANAIS_OCORRENCIA_VENCIDA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'CANAIS_OCORRENCIA_VENCIDA', N'Prazo de 24 horas vencido sem a remoção do conteúdo: a Igreja fica corresponsável', N'CANAIS', N'canais_gestao', NULL, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CANAIS_TERMO_PENDENTE')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'CANAIS_TERMO_PENDENTE', N'Você foi designado administrador de um canal oficial: aceite o Termo de Dever de Moderação', N'CANAIS', NULL, NULL, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CANAIS_TROCA_CREDENCIAL')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'CANAIS_TROCA_CREDENCIAL', N'Troca de senha/acesso de canal oficial pendente', N'CANAIS', N'canais_gestao', NULL, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CANAIS_SEM_ADMINISTRADOR')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'CANAIS_SEM_ADMINISTRADOR', N'Canal oficial sem administrador com o Termo de Moderação aceito', N'CANAIS', N'canais_gestao', NULL, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'CANAIS_CONFERENCIA_VENCIDA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'CANAIS_CONFERENCIA_VENCIDA', N'Canal oficial aguardando conferência de conformidade', N'CANAIS', N'canais_gestao', NULL, 1);
GO

-- Retenção: o histórico de ocorrências é a prova de diligência da Igreja diante de uma cobrança
-- (reparação civil prescreve em até 3 anos — CC art. 206, §3º, V). 5 anos é uma margem; a rotina
-- automática de descarte AINDA NÃO existe e o prazo é decisão da CLI/Encarregado.
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Canais de comunicação e ocorrências de moderação')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (
        N'Canais de comunicação e ocorrências de moderação',
        N'Registro institucional dos canais (Estatuto Art. 12) e prova de diligência na moderação (Regimento Art. 160 §1º, II). Guarda matrículas de quem relatou, administra e removeu. 5 anos, por margem sobre a prescrição da reparação civil; sem descarte automático por ora.',
        1825
    );
GO
