-- ============================================================
-- Migração 042 — v3.7: Ouvidoria Eclesiástica (Art. 104). Canal de
-- denúncias/sugestões sigiloso e opcionalmente anônimo, vinculado ao NIF
-- (Conselho Fiscal, mesma sigla já existente) e ao CEI.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.DenunciasOuvidoria') AND type = N'U')
BEGIN
    CREATE TABLE dbo.DenunciasOuvidoria (
        DenunciaId            INT IDENTITY PRIMARY KEY,
        Protocolo              NVARCHAR(30) NOT NULL UNIQUE,
        Tipo                    NVARCHAR(30) NOT NULL,   -- INFRACAO_ETICA | ASSEDIO | DESVIO_FINANCEIRO | ABUSO_AUTORIDADE | SUGESTAO
        Anonima                  BIT NOT NULL DEFAULT 0,
        DenuncianteMembroId       INT NULL REFERENCES dbo.MembroReferencia(MembroId), -- NUNCA gravado se Anonima=1 (Art. 104 §2º)
        DenunciadoMembroId         INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Relato                      NVARCHAR(MAX) NOT NULL,
        DataProtocolo                 DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        Status                         NVARCHAR(30) NOT NULL DEFAULT 'RECEBIDA', -- RECEBIDA|EM_APURACAO|ENCAMINHADA_PROCESSO|ARQUIVADA|CONCLUIDA
        OuvidorMembroId                  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ProcessoDisciplinarId              INT NULL REFERENCES dbo.ProcessosDisciplinares(ProcessoId),
        DataConclusao                        DATETIME2 NULL,
        DadosAnonimizados                     BIT NOT NULL DEFAULT 0
    );
END
GO

-- Permissão nova (mesmo padrão de cei/disciplina/protecaodedados) — quem
-- opera o canal (CEI/NIF, ou um Ouvidor designado, Art. 104 §6º).
IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'ouvidoria')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('ouvidoria', 'Ouvidoria Eclesiástica');
GO
