-- ============================================================
-- Migração 161 — v8.5: Trilha de discipulado como entidade de primeira classe. Desenho em docs/plano/fase-8-ministerial-afm.md.
--
-- Base legal: Regimento Art. 70 §4º e §5º (Curso de Discipulado da AFM; Discipulado Pós-Batismal no batismo de urgência); Art. 80, IV (o curso antes do batismo);
-- Art. 128 (classe de novos convertidos e Busca Ativa); Art. 132 §2º, II (na saída, os registros de conversão são eliminados).
--
--   TiposMarco: o catálogo dos marcos do perfil (antes, uma lista fixa no código): único ou repetível, só do nível geral, ativo.
--   EtapasDiscipulado + EtapasDiscipuladoPreRequisitos: a trilha, em ordem, com a FONTE de cada etapa (um marco, o batismo nas águas do cadastro, uma trilha de
--   formação concluída ou o primeiro serviço voluntário). Os pré-requisitos são informativos.
--   CuidadoItens: o tipo "DISCIPULADO" (o próximo passo vira acompanhamento), a origem "DISCIPULADO", o desfecho "PASSO_DADO" e a etapa do item.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.TiposMarco') AND type = N'U')
BEGIN
    CREATE TABLE dbo.TiposMarco (
        Codigo          NVARCHAR(30) NOT NULL CONSTRAINT PK_TiposMarco PRIMARY KEY,
        Nome            NVARCHAR(80) NOT NULL,
        Descricao       NVARCHAR(300) NULL,
        Unico           BIT NOT NULL CONSTRAINT DF_TiposMarco_Unico DEFAULT 0,
        SoNivelGeral    BIT NOT NULL CONSTRAINT DF_TiposMarco_SoGeral DEFAULT 0,
        Sistema         BIT NOT NULL CONSTRAINT DF_TiposMarco_Sistema DEFAULT 0,   -- os do sistema não se apagam nem mudam de código
        Ativo           BIT NOT NULL CONSTRAINT DF_TiposMarco_Ativo DEFAULT 1,
        CriadoEm        DATETIME2 NOT NULL CONSTRAINT DF_TiposMarco_CriadoEm DEFAULT SYSUTCDATETIME(),
        AtualizadoEm    DATETIME2 NULL,
        AtualizadoPor   INT NULL,
        CONSTRAINT CK_TiposMarco_Codigo CHECK (Codigo NOT LIKE N'%[^A-Z0-9_]%' AND LEN(Codigo) >= 3),
        CONSTRAINT UQ_TiposMarco_Nome UNIQUE (Nome)
    );
END
GO
-- os quatro de antes (o código de hoje) e os dois da trilha
IF NOT EXISTS (SELECT 1 FROM dbo.TiposMarco WHERE Codigo = N'CONVERSAO')
    INSERT INTO dbo.TiposMarco (Codigo, Nome, Descricao, Unico, SoNivelGeral, Sistema) VALUES (N'CONVERSAO', N'Conversão', N'O dia em que a pessoa aceitou a Jesus.', 1, 0, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.TiposMarco WHERE Codigo = N'MINISTERIO_ANTERIOR')
    INSERT INTO dbo.TiposMarco (Codigo, Nome, Descricao, Unico, SoNivelGeral, Sistema) VALUES (N'MINISTERIO_ANTERIOR', N'Ministério/Igreja anterior', N'Onde a pessoa serviu antes de chegar.', 0, 0, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.TiposMarco WHERE Codigo = N'BATISMO_ESPIRITO_SANTO')
    INSERT INTO dbo.TiposMarco (Codigo, Nome, Descricao, Unico, SoNivelGeral, Sistema) VALUES (N'BATISMO_ESPIRITO_SANTO', N'Batismo no Espírito Santo', N'Requisito da escada a partir de Diácono (Regimento Art. 72, III, a): só o nível geral lança.', 1, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.TiposMarco WHERE Codigo = N'OUTRO')
    INSERT INTO dbo.TiposMarco (Codigo, Nome, Descricao, Unico, SoNivelGeral, Sistema) VALUES (N'OUTRO', N'Outro', NULL, 0, 0, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.TiposMarco WHERE Codigo = N'CURSO_DISCIPULADO')
    INSERT INTO dbo.TiposMarco (Codigo, Nome, Descricao, Unico, SoNivelGeral, Sistema) VALUES (N'CURSO_DISCIPULADO', N'Curso de Discipulado', N'Curso de Discipulado para Novos Convertidos, conduzido pela AFM (Regimento Art. 70 §4º; Art. 80, IV).', 1, 0, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.TiposMarco WHERE Codigo = N'PARTICIPACAO_DEPARTAMENTO')
    INSERT INTO dbo.TiposMarco (Codigo, Nome, Descricao, Unico, SoNivelGeral, Sistema) VALUES (N'PARTICIPACAO_DEPARTAMENTO', N'Primeira participação em departamento', N'A primeira vez que a pessoa participou de um departamento.', 1, 0, 1);
GO

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.EtapasDiscipulado') AND type = N'U')
BEGIN
    CREATE TABLE dbo.EtapasDiscipulado (
        EtapaId             INT IDENTITY CONSTRAINT PK_EtapasDiscipulado PRIMARY KEY,
        Chave               NVARCHAR(30) NOT NULL,
        Nome                NVARCHAR(80) NOT NULL,
        Descricao           NVARCHAR(300) NULL,
        Ordem               INT NOT NULL,
        Fonte               NVARCHAR(20) NOT NULL,
        TipoMarco           NVARCHAR(30) NULL REFERENCES dbo.TiposMarco(Codigo),
        TrilhaId            INT NULL REFERENCES dbo.Trilhas(TrilhaId),
        GeraAcompanhamento  BIT NOT NULL CONSTRAINT DF_EtapasDiscipulado_Gera DEFAULT 1,
        Ativa               BIT NOT NULL CONSTRAINT DF_EtapasDiscipulado_Ativa DEFAULT 1,
        AtualizadoEm        DATETIME2 NULL,
        AtualizadoPor       INT NULL,
        CONSTRAINT UQ_EtapasDiscipulado_Chave UNIQUE (Chave),
        CONSTRAINT CK_EtapasDiscipulado_Fonte CHECK (Fonte IN (N'MARCO', N'BATISMO_AGUAS', N'TRILHA', N'SERVICO_VOLUNTARIO')),
        CONSTRAINT CK_EtapasDiscipulado_Marco CHECK (Fonte <> N'MARCO' OR TipoMarco IS NOT NULL),
        CONSTRAINT CK_EtapasDiscipulado_Trilha CHECK (Fonte <> N'TRILHA' OR TrilhaId IS NOT NULL),
        CONSTRAINT CK_EtapasDiscipulado_Ordem CHECK (Ordem BETWEEN 1 AND 99)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.EtapasDiscipuladoPreRequisitos') AND type = N'U')
BEGIN
    CREATE TABLE dbo.EtapasDiscipuladoPreRequisitos (
        EtapaId         INT NOT NULL REFERENCES dbo.EtapasDiscipulado(EtapaId),
        PreRequisitoId  INT NOT NULL REFERENCES dbo.EtapasDiscipulado(EtapaId),
        CONSTRAINT PK_EtapasDiscipuladoPreReq PRIMARY KEY (EtapaId, PreRequisitoId),
        CONSTRAINT CK_EtapasDiscipuladoPreReq CHECK (EtapaId <> PreRequisitoId)
    );
END
GO
-- a trilha inicial (só quando a tabela está vazia: o que o nível geral mudar depois não é refeito no próximo deploy)
IF NOT EXISTS (SELECT 1 FROM dbo.EtapasDiscipulado)
BEGIN
    INSERT INTO dbo.EtapasDiscipulado (Chave, Nome, Descricao, Ordem, Fonte, TipoMarco, GeraAcompanhamento) VALUES
      (N'CONVERSAO', N'Conversão', N'Aceitou a Jesus.', 1, N'MARCO', N'CONVERSAO', 0),
      (N'CURSO_DISCIPULADO', N'Curso de Discipulado', N'Curso de Discipulado para Novos Convertidos (AFM — Art. 70 §4º); no batismo de urgência, o Discipulado Pós-Batismal (§ 5º).', 2, N'MARCO', N'CURSO_DISCIPULADO', 1),
      (N'BATISMO_AGUAS', N'Batismo nas águas', N'A data do batismo no cadastro (a esteira de batismo a grava).', 3, N'BATISMO_AGUAS', NULL, 1),
      (N'BATISMO_ESPIRITO', N'Batismo no Espírito Santo', NULL, 4, N'MARCO', N'BATISMO_ESPIRITO_SANTO', 0),
      (N'DEPARTAMENTO', N'Primeira participação em departamento', NULL, 5, N'MARCO', N'PARTICIPACAO_DEPARTAMENTO', 1),
      (N'SERVICO_VOLUNTARIO', N'Primeiro serviço voluntário', N'A primeira escala aceita ou confirmada, já realizada.', 6, N'SERVICO_VOLUNTARIO', NULL, 1);
    INSERT INTO dbo.EtapasDiscipuladoPreRequisitos (EtapaId, PreRequisitoId)
    SELECT e.EtapaId, p.EtapaId FROM dbo.EtapasDiscipulado e JOIN dbo.EtapasDiscipulado p
      ON (e.Chave = N'CURSO_DISCIPULADO' AND p.Chave = N'CONVERSAO') OR (e.Chave = N'BATISMO_AGUAS' AND p.Chave = N'CURSO_DISCIPULADO');
END
GO

-- CuidadoItens: o tipo, a origem e o desfecho do discipulado, e a etapa do item
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_CuidadoItens_Tipo' AND definition NOT LIKE N'%DISCIPULADO%')
    ALTER TABLE dbo.CuidadoItens DROP CONSTRAINT CK_CuidadoItens_Tipo;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_CuidadoItens_Tipo')
    ALTER TABLE dbo.CuidadoItens ADD CONSTRAINT CK_CuidadoItens_Tipo
        CHECK (Tipo IS NOT NULL AND Tipo IN (N'VISITANTE', N'NOVO_CONVERTIDO', N'AFASTAMENTO', N'PEDIDO_VISITA', N'PEDIDO_ORACAO', N'POS_INTERNACAO', N'DISCIPULADO'));
GO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_CuidadoItens_Origem' AND definition NOT LIKE N'%DISCIPULADO%')
    ALTER TABLE dbo.CuidadoItens DROP CONSTRAINT CK_CuidadoItens_Origem;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_CuidadoItens_Origem')
    ALTER TABLE dbo.CuidadoItens ADD CONSTRAINT CK_CuidadoItens_Origem
        CHECK (Origem IS NOT NULL AND Origem IN (N'LIDERANCA', N'DETECCAO', N'PEDIDO_MEMBRO', N'PEDIDO_ORACAO', N'DISCIPULADO'));
GO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_CuidadoItens_Desfecho' AND definition NOT LIKE N'%PASSO_DADO%')
    ALTER TABLE dbo.CuidadoItens DROP CONSTRAINT CK_CuidadoItens_Desfecho;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_CuidadoItens_Desfecho')
    ALTER TABLE dbo.CuidadoItens ADD CONSTRAINT CK_CuidadoItens_Desfecho
        CHECK (Desfecho IS NULL OR Desfecho IN (N'INTEGRADO', N'ACOMPANHADO', N'NAO_LOCALIZADO', N'RECUSOU_CONTATO', N'ENCAMINHADO', N'OUTRO', N'DUPLICADO', N'ENGANO', N'PASSO_DADO'));
GO
IF COL_LENGTH(N'dbo.CuidadoItens', N'EtapaDiscipuladoId') IS NULL
    ALTER TABLE dbo.CuidadoItens ADD EtapaDiscipuladoId INT NULL CONSTRAINT FK_CuidadoItens_Etapa REFERENCES dbo.EtapasDiscipulado(EtapaId);
GO
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CuidadoItens_UmAbertoPorPessoa' AND object_id = OBJECT_ID(N'dbo.CuidadoItens')
           AND filter_definition NOT LIKE N'%DISCIPULADO%')
    DROP INDEX UX_CuidadoItens_UmAbertoPorPessoa ON dbo.CuidadoItens;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CuidadoItens_UmAbertoPorPessoa' AND object_id = OBJECT_ID(N'dbo.CuidadoItens'))
    CREATE UNIQUE INDEX UX_CuidadoItens_UmAbertoPorPessoa ON dbo.CuidadoItens (Tipo, MembroId)
        WHERE Status = N'ABERTO' AND MembroId IS NOT NULL AND Tipo IN (N'NOVO_CONVERTIDO', N'AFASTAMENTO', N'PEDIDO_VISITA', N'POS_INTERNACAO', N'DISCIPULADO');
GO
-- (revisão independente) sem índice único por pessoa e etapa: a anonimização (exclusão LGPD, retenção) deixa MembroId NULL e o item transferido de congregação repete a
-- etapa — o "um aberto por pessoa" acima segura a duplicata e o "nunca reabre para a mesma etapa" é da rotina. O índice da primeira versão sai das bases de teste.
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_CuidadoItens_UmPorEtapa' AND object_id = OBJECT_ID(N'dbo.CuidadoItens'))
    DROP INDEX UX_CuidadoItens_UmPorEtapa ON dbo.CuidadoItens;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CuidadoItens_Etapa' AND object_id = OBJECT_ID(N'dbo.CuidadoItens'))
    CREATE INDEX IX_CuidadoItens_Etapa ON dbo.CuidadoItens (MembroId, EtapaDiscipuladoId) WHERE EtapaDiscipuladoId IS NOT NULL;
GO
-- o prazo do tipo novo em Catálogos → Prazos (ajustável)
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'CUIDADO_PRAZO_DISCIPULADO_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('CUIDADO_PRAZO_DISCIPULADO_DIAS', N'Cuidado pastoral — dias para acompanhar o próximo passo da trilha de discipulado', 30);
GO
-- os marcos por pessoa e tipo (a trilha e o "único" leem por aqui)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MarcosMembro_Membro_Tipo' AND object_id = OBJECT_ID(N'dbo.MarcosMembro'))
    CREATE INDEX IX_MarcosMembro_Membro_Tipo ON dbo.MarcosMembro (MembroId, Tipo) INCLUDE (DataMarco, CriadoEm);
GO
