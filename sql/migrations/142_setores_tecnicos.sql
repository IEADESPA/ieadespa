-- ============================================================
-- Migração 142 — v7.6: Setores Técnicos (voluntariado profissional)
-- (Regimento Art. 48 a 52 e Art. 133 §5º; Lei 9.608/1998; Lei 14.811/2024 na parte de antecedentes).
--
-- Três assuntos, nenhum refaz o que as versões anteriores já fazem:
--   1) CATÁLOGO DOS 20 SETORES (Art. 52) + QUEM SERVE NELES + TERMO DE ADESÃO ESPECÍFICO (Art. 49 §2º). Os setores são do âmbito GERAL
--      ("vedada a sua fragmentação em diretórios locais"): a tabela não tem congregação. O vínculo da pessoa com um setor passa por
--      CANDIDATO -> AGUARDANDO_TERMO -> ATIVO -> ENCERRADO; só o vínculo ATIVO (com o Termo aceito) dá os poderes do setor. O Termo é uma prova
--      própria, uma por vínculo, no mesmo desenho da adesão da v7.5 (VoluntariadoAdesoes): versão e hash do texto, IP/data/hora, ficha ou mensagem.
--   2) PODER DE POLÍCIA TÉCNICA (Art. 50): a interdição cautelar de templo ou estrutura (setores de Engenharia e de Segurança) e o pedido de
--      remoção de postagem em rede oficial (setor de Comunicação). É um ATO formal: quem emitiu, de qual setor, onde, por quê, com a justificativa
--      técnica; a Diretoria Executiva ratifica ou revoga (Art. 50 I: "comunicando o ato à Diretoria Executiva para ratificação"); o ato nunca se apaga.
--   3) TERMO DE VISTORIA DE ANTECEDENTES (Art. 133 §5º, IV, "c"): data da verificação, hash da certidão apresentada, parecer e assinatura do Diretor
--      que a conferiu. O sistema NÃO guarda a certidão (só o hash — "vedação de arquivo morto", IV, "b"); o acesso é só da Diretoria Executiva ou do
--      Conselho de Ética (permissão própria). O registro não se altera nem se apaga.
-- Três permissões novas, dez regras de aviso e dois parâmetros. Idempotente: seguro para reexecutar sem apagar dados.
-- Cada DDL em batch próprio (GO); gatilho por EXEC (CREATE TRIGGER exige batch próprio).
-- ============================================================

-- ---- 1) Catálogo dos Setores Técnicos (Art. 52) ----

IF OBJECT_ID(N'dbo.SetoresTecnicos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SetoresTecnicos (
        SetorId               INT IDENTITY PRIMARY KEY,
        Codigo                NVARCHAR(30) NOT NULL CONSTRAINT UQ_SetoresTecnicos_Codigo UNIQUE,
        Inciso                NVARCHAR(6) NULL,                                   -- o inciso do Art. 52 (I a XX)
        Nome                  NVARCHAR(100) NOT NULL,
        Competencia           NVARCHAR(600) NOT NULL,
        Profissoes            NVARCHAR(200) NULL,                                 -- quem forma o setor ("advogados e bacharéis")
        ConselhoClasse        NVARCHAR(60) NULL,                                  -- conselho de classe típico (OAB, CREA/CAU...)
        ExigeRegistro         BIT NOT NULL CONSTRAINT DF_SetoresTecnicos_ExigeReg DEFAULT 0,       -- o registro no conselho é condição para servir
        PodeInterditar        BIT NOT NULL CONSTRAINT DF_SetoresTecnicos_Interditar DEFAULT 0,      -- Art. 50, I
        PodeSolicitarRemocao  BIT NOT NULL CONSTRAINT DF_SetoresTecnicos_Remocao DEFAULT 0,         -- Art. 50, II
        Ativo                 BIT NOT NULL CONSTRAINT DF_SetoresTecnicos_Ativo DEFAULT 1,
        Ordem                 INT NOT NULL CONSTRAINT DF_SetoresTecnicos_Ordem DEFAULT 0,
        CriadoEm              DATETIME2 NOT NULL CONSTRAINT DF_SetoresTecnicos_Em DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Os 20 setores do Art. 52. Cada um entra se o código ainda não existe (reexecutar não repõe o que a Secretaria renomeou ou desativou).
IF NOT EXISTS (SELECT 1 FROM dbo.SetoresTecnicos WHERE Codigo = N'JURIDICO')
    INSERT INTO dbo.SetoresTecnicos (Codigo, Inciso, Nome, Competencia, Profissoes, ConselhoClasse, ExigeRegistro, PodeInterditar, PodeSolicitarRemocao, Ordem)
    VALUES (N'JURIDICO', N'I', N'Setor Jurídico', N'Defesa judicial da Instituição, consultoria preventiva à Diretoria Executiva e regularização fundiária do patrimônio imobiliário. Atua na proteção da Instituição e nos projetos oficiais: não atende demandas pessoais, fora do projeto vigente ou dúvidas corriqueiras que a Secretaria não triou (Art. 51).', N'Advogados e bacharéis em Direito', N'OAB', 0, 0, 0, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.SetoresTecnicos WHERE Codigo = N'ENGENHARIA')
    INSERT INTO dbo.SetoresTecnicos (Codigo, Inciso, Nome, Competencia, Profissoes, ConselhoClasse, ExigeRegistro, PodeInterditar, PodeSolicitarRemocao, Ordem)
    VALUES (N'ENGENHARIA', N'II', N'Setor de Engenharia, Arquitetura e Obras', N'Projetos arquitetônicos, fiscalização técnica de construções, emissão de laudos de segurança e aprovação de plantas junto aos órgãos municipais. Pode interditar templo ou estrutura com risco de desabamento ou de falha elétrica grave (Art. 50, I).', N'Engenheiros, arquitetos e técnicos de obras', N'CREA / CAU', 1, 1, 0, 2);
IF NOT EXISTS (SELECT 1 FROM dbo.SetoresTecnicos WHERE Codigo = N'SAUDE')
    INSERT INTO dbo.SetoresTecnicos (Codigo, Inciso, Nome, Competencia, Profissoes, ConselhoClasse, ExigeRegistro, PodeInterditar, PodeSolicitarRemocao, Ordem)
    VALUES (N'SAUDE', N'III', N'Setor de Saúde e Bem-Estar', N'Prevenção, primeiros socorros em grandes eventos e palestras de saúde pública e mental.', N'Médicos, enfermeiros e psicólogos', N'CRM / COREN / CRP', 1, 0, 0, 3);
IF NOT EXISTS (SELECT 1 FROM dbo.SetoresTecnicos WHERE Codigo = N'EDUCACAO')
    INSERT INTO dbo.SetoresTecnicos (Codigo, Inciso, Nome, Competencia, Profissoes, ConselhoClasse, ExigeRegistro, PodeInterditar, PodeSolicitarRemocao, Ordem)
    VALUES (N'EDUCACAO', N'IV', N'Setor de Educação e Pedagogia', N'Criação de cursos profissionalizantes, alfabetização de adultos e suporte pedagógico para a qualificação secular dos membros.', N'Pedagogos e professores', NULL, 0, 0, 0, 4);
IF NOT EXISTS (SELECT 1 FROM dbo.SetoresTecnicos WHERE Codigo = N'TI')
    INSERT INTO dbo.SetoresTecnicos (Codigo, Inciso, Nome, Competencia, Profissoes, ConselhoClasse, ExigeRegistro, PodeInterditar, PodeSolicitarRemocao, Ordem)
    VALUES (N'TI', N'V', N'Setor de Tecnologia da Informação e Inovação', N'Infraestrutura de redes, servidores, desenvolvimento de softwares de gestão e segurança cibernética da Igreja.', N'Profissionais de tecnologia da informação', NULL, 0, 0, 0, 5);
IF NOT EXISTS (SELECT 1 FROM dbo.SetoresTecnicos WHERE Codigo = N'COMUNICACAO')
    INSERT INTO dbo.SetoresTecnicos (Codigo, Inciso, Nome, Competencia, Profissoes, ConselhoClasse, ExigeRegistro, PodeInterditar, PodeSolicitarRemocao, Ordem)
    VALUES (N'COMUNICACAO', N'VI', N'Setor de Comunicação, Mídia e Marketing', N'Guardião da marca institucional: gestão das redes sociais oficiais, assessoria de imprensa e produção de conteúdo audiovisual de alto padrão. Pode solicitar a remoção imediata de postagem das redes oficiais das congregações com erro grosseiro, violação de direito autoral ou ofensa à doutrina e à imagem da Igreja (Art. 50, II).', N'Jornalistas, publicitários e profissionais de mídia', NULL, 0, 0, 1, 6);
IF NOT EXISTS (SELECT 1 FROM dbo.SetoresTecnicos WHERE Codigo = N'ASSISTENCIA_SOCIAL')
    INSERT INTO dbo.SetoresTecnicos (Codigo, Inciso, Nome, Competencia, Profissoes, ConselhoClasse, ExigeRegistro, PodeInterditar, PodeSolicitarRemocao, Ordem)
    VALUES (N'ASSISTENCIA_SOCIAL', N'VII', N'Setor de Assistência Social Técnica', N'Elaboração de projetos sociais captáveis e triagem técnica de beneficiários, distinguindo-se da simples doação de alimentos.', N'Assistentes Sociais credenciados', N'CRESS', 1, 0, 0, 7);
IF NOT EXISTS (SELECT 1 FROM dbo.SetoresTecnicos WHERE Codigo = N'CONTABILIDADE')
    INSERT INTO dbo.SetoresTecnicos (Codigo, Inciso, Nome, Competencia, Profissoes, ConselhoClasse, ExigeRegistro, PodeInterditar, PodeSolicitarRemocao, Ordem)
    VALUES (N'CONTABILIDADE', N'VIII', N'Setor de Contabilidade e Finanças', N'Escrituração contábil oficial, cumprimento de obrigações fiscais e auditoria técnica interna.', N'Contadores', N'CRC', 1, 0, 0, 8);
IF NOT EXISTS (SELECT 1 FROM dbo.SetoresTecnicos WHERE Codigo = N'GASTRONOMIA')
    INSERT INTO dbo.SetoresTecnicos (Codigo, Inciso, Nome, Competencia, Profissoes, ConselhoClasse, ExigeRegistro, PodeInterditar, PodeSolicitarRemocao, Ordem)
    VALUES (N'GASTRONOMIA', N'IX', N'Setor de Gastronomia e Eventos', N'Gestão das cozinhas industriais da Igreja em festividades: padrões de higiene, cardápio nutricional e economia de insumos.', N'Cozinheiros, nutricionistas e profissionais de eventos', NULL, 0, 0, 0, 9);
IF NOT EXISTS (SELECT 1 FROM dbo.SetoresTecnicos WHERE Codigo = N'BELEZA')
    INSERT INTO dbo.SetoresTecnicos (Codigo, Inciso, Nome, Competencia, Profissoes, ConselhoClasse, ExigeRegistro, PodeInterditar, PodeSolicitarRemocao, Ordem)
    VALUES (N'BELEZA', N'X', N'Setor de Beleza e Estética', N'Atuação em ações sociais, com serviços de corte, cabelo e cuidados pessoais à comunidade carente em eventos de evangelismo.', N'Cabeleireiros, esteticistas e barbeiros', NULL, 0, 0, 0, 10);
IF NOT EXISTS (SELECT 1 FROM dbo.SetoresTecnicos WHERE Codigo = N'SEGURANCA')
    INSERT INTO dbo.SetoresTecnicos (Codigo, Inciso, Nome, Competencia, Profissoes, ConselhoClasse, ExigeRegistro, PodeInterditar, PodeSolicitarRemocao, Ordem)
    VALUES (N'SEGURANCA', N'XI', N'Setor de Segurança Patrimonial e Ordem', N'Planos de evacuação, treinamento das equipes de portaria e coordenação da segurança física em grandes concentrações de público. Pode interditar templo ou estrutura em situação de risco iminente (Art. 50, I: "Engenharia e Segurança").', N'Profissionais de segurança e de prevenção de incêndio', NULL, 0, 1, 0, 11);
IF NOT EXISTS (SELECT 1 FROM dbo.SetoresTecnicos WHERE Codigo = N'MUSICA_SOM')
    INSERT INTO dbo.SetoresTecnicos (Codigo, Inciso, Nome, Competencia, Profissoes, ConselhoClasse, ExigeRegistro, PodeInterditar, PodeSolicitarRemocao, Ordem)
    VALUES (N'MUSICA_SOM', N'XII', N'Setor de Música e Sonoplastia Técnica', N'Qualidade técnica do som e formação de operadores de áudio, distinguindo-se da liderança de louvor.', N'Músicos, engenheiros de som e técnicos de áudio', NULL, 0, 0, 0, 12);
IF NOT EXISTS (SELECT 1 FROM dbo.SetoresTecnicos WHERE Codigo = N'TRANSPORTE')
    INSERT INTO dbo.SetoresTecnicos (Codigo, Inciso, Nome, Competencia, Profissoes, ConselhoClasse, ExigeRegistro, PodeInterditar, PodeSolicitarRemocao, Ordem)
    VALUES (N'TRANSPORTE', N'XIII', N'Setor de Transporte e Logística', N'Gestão da frota de veículos da Igreja, escalas de motoristas, manutenção preventiva e logística de transporte para eventos externos.', N'Motoristas, mecânicos e profissionais de logística', NULL, 0, 0, 0, 13);
IF NOT EXISTS (SELECT 1 FROM dbo.SetoresTecnicos WHERE Codigo = N'MEIO_AMBIENTE')
    INSERT INTO dbo.SetoresTecnicos (Codigo, Inciso, Nome, Competencia, Profissoes, ConselhoClasse, ExigeRegistro, PodeInterditar, PodeSolicitarRemocao, Ordem)
    VALUES (N'MEIO_AMBIENTE', N'XIV', N'Setor de Meio Ambiente e Sustentabilidade', N'Projetos de eficiência energética, gestão de resíduos e adequação ambiental dos templos.', N'Engenheiros ambientais, biólogos e técnicos ambientais', NULL, 0, 0, 0, 14);
IF NOT EXISTS (SELECT 1 FROM dbo.SetoresTecnicos WHERE Codigo = N'CAPELANIA')
    INSERT INTO dbo.SetoresTecnicos (Codigo, Inciso, Nome, Competencia, Profissoes, ConselhoClasse, ExigeRegistro, PodeInterditar, PodeSolicitarRemocao, Ordem)
    VALUES (N'CAPELANIA', N'XV', N'Setor de Capelania', N'Coordenação do acesso e da visitação técnica e espiritual a ambientes restritos (hospitais, presídios, escolas e quartéis), mediante credenciamento específico.', N'Capelães e obreiros credenciados', NULL, 0, 0, 0, 15);
IF NOT EXISTS (SELECT 1 FROM dbo.SetoresTecnicos WHERE Codigo = N'EMPREENDEDORISMO')
    INSERT INTO dbo.SetoresTecnicos (Codigo, Inciso, Nome, Competencia, Profissoes, ConselhoClasse, ExigeRegistro, PodeInterditar, PodeSolicitarRemocao, Ordem)
    VALUES (N'EMPREENDEDORISMO', N'XVI', N'Setor de Empreendedorismo e Negócios', N'Feiras de negócios, networking entre membros empresários e cursos de gestão financeira pessoal e familiar.', N'Empresários e profissionais de gestão', NULL, 0, 0, 0, 16);
IF NOT EXISTS (SELECT 1 FROM dbo.SetoresTecnicos WHERE Codigo = N'CULTURA_ARTES')
    INSERT INTO dbo.SetoresTecnicos (Codigo, Inciso, Nome, Competencia, Profissoes, ConselhoClasse, ExigeRegistro, PodeInterditar, PodeSolicitarRemocao, Ordem)
    VALUES (N'CULTURA_ARTES', N'XVII', N'Setor de Cultura e Artes', N'Fomento às expressões artísticas (teatro, dança e corais), zelando pela qualidade técnica e pela mensagem cristã das apresentações.', N'Artistas, diretores e coreógrafos', NULL, 0, 0, 0, 17);
IF NOT EXISTS (SELECT 1 FROM dbo.SetoresTecnicos WHERE Codigo = N'HISTORIA_ACERVO')
    INSERT INTO dbo.SetoresTecnicos (Codigo, Inciso, Nome, Competencia, Profissoes, ConselhoClasse, ExigeRegistro, PodeInterditar, PodeSolicitarRemocao, Ordem)
    VALUES (N'HISTORIA_ACERVO', N'XVIII', N'Setor de História e Acervo', N'Museologia, catalogação de documentos históricos, fotos e preservação da memória institucional da IEADESPA.', N'Historiadores, museólogos e arquivistas', NULL, 0, 0, 0, 18);
IF NOT EXISTS (SELECT 1 FROM dbo.SetoresTecnicos WHERE Codigo = N'RP_CERIMONIAL')
    INSERT INTO dbo.SetoresTecnicos (Codigo, Inciso, Nome, Competencia, Profissoes, ConselhoClasse, ExigeRegistro, PodeInterditar, PodeSolicitarRemocao, Ordem)
    VALUES (N'RP_CERIMONIAL', N'XIX', N'Setor de Relações Públicas e Cerimonial', N'Protocolo oficial em solenidades, recepção de autoridades políticas e eclesiásticas e etiqueta institucional.', N'Profissionais de relações públicas e cerimonial', NULL, 0, 0, 0, 19);
IF NOT EXISTS (SELECT 1 FROM dbo.SetoresTecnicos WHERE Codigo = N'LIBRAS')
    INSERT INTO dbo.SetoresTecnicos (Codigo, Inciso, Nome, Competencia, Profissoes, ConselhoClasse, ExigeRegistro, PodeInterditar, PodeSolicitarRemocao, Ordem)
    VALUES (N'LIBRAS', N'XX', N'Setor de Interpretação e Libras', N'Acessibilidade comunicacional nos cultos e eventos oficiais para a comunidade surda, por intérpretes qualificados.', N'Intérpretes e tradutores de Libras', NULL, 0, 0, 0, 20);
GO

-- ---- 2) Quem serve em cada setor ----

IF OBJECT_ID(N'dbo.SetoresTecnicosMembros', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SetoresTecnicosMembros (
        VinculoId             INT IDENTITY PRIMARY KEY,
        SetorId               INT NOT NULL REFERENCES dbo.SetoresTecnicos(SetorId),
        MembroId              INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Status                NVARCHAR(16) NOT NULL CONSTRAINT CK_SetoresMembros_Status CHECK (Status IN ('CANDIDATO','AGUARDANDO_TERMO','ATIVO','ENCERRADO')),
        Origem                NVARCHAR(12) NOT NULL CONSTRAINT CK_SetoresMembros_Origem CHECK (Origem IN ('CANDIDATURA','INDICACAO')),
        Formacao              NVARCHAR(150) NOT NULL,                                          -- formação acadêmica ou técnica (Art. 48)
        ConselhoSigla         NVARCHAR(20) NULL,                                               -- registro no conselho de classe (Art. 49 §1º)
        RegistroNumero        NVARCHAR(30) NULL,
        CriadoPorMembroId     INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CriadoEm              DATETIME2 NOT NULL CONSTRAINT DF_SetoresMembros_Em DEFAULT SYSUTCDATETIME(),
        AprovadoPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AprovadoEm            DATETIME2 NULL,
        AtivadoEm             DATETIME2 NULL,                                                  -- o Termo foi aceito: daqui em diante vale o que o setor pode
        EncerradoEm           DATETIME2 NULL,
        EncerradoPorMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        MotivoEncerramento    NVARCHAR(16) NULL CONSTRAINT CK_SetoresMembros_Motivo CHECK (MotivoEncerramento IS NULL OR MotivoEncerramento IN ('SAIDA_PROPRIA','DESLIGAMENTO','MUDANCA','RECUSADO','OUTRO')),
        ObsEncerramento       NVARCHAR(300) NULL,
        CONSTRAINT CK_SetoresMembros_Registro CHECK ((ConselhoSigla IS NULL AND RegistroNumero IS NULL) OR (ConselhoSigla IS NOT NULL AND RegistroNumero IS NOT NULL)),
        CONSTRAINT CK_SetoresMembros_Encerrado CHECK ((Status = 'ENCERRADO' AND EncerradoEm IS NOT NULL AND MotivoEncerramento IS NOT NULL) OR (Status <> 'ENCERRADO' AND EncerradoEm IS NULL AND MotivoEncerramento IS NULL)),
        CONSTRAINT CK_SetoresMembros_Ativo CHECK (Status <> 'ATIVO' OR AtivadoEm IS NOT NULL)
    );
END
GO
-- Um vínculo vigente por pessoa e setor; depois de encerrado, voltar é um vínculo novo (o histórico fica).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SetoresMembros_Vigente' AND object_id = OBJECT_ID(N'dbo.SetoresTecnicosMembros'))
    CREATE UNIQUE INDEX UX_SetoresMembros_Vigente ON dbo.SetoresTecnicosMembros (SetorId, MembroId) WHERE Status <> 'ENCERRADO';
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SetoresMembros_Membro' AND object_id = OBJECT_ID(N'dbo.SetoresTecnicosMembros'))
    CREATE INDEX IX_SetoresMembros_Membro ON dbo.SetoresTecnicosMembros (MembroId, Status);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SetoresMembros_Setor' AND object_id = OBJECT_ID(N'dbo.SetoresTecnicosMembros'))
    CREATE INDEX IX_SetoresMembros_Setor ON dbo.SetoresTecnicosMembros (SetorId, Status);
GO
-- O vínculo não se apaga, quem é e onde serve não mudam, e um vínculo encerrado não volta à vida (voltar é um vínculo novo).
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_SetoresMembros_Protegido ON dbo.SetoresTecnicosMembros AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted) AND NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        RAISERROR(N''O vínculo com o Setor Técnico é registro histórico: não se apaga (encerre o vínculo).'', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.VinculoId = i.VinculoId
               WHERE i.SetorId <> d.SetorId OR i.MembroId <> d.MembroId OR i.Origem <> d.Origem OR i.CriadoPorMembroId <> d.CriadoPorMembroId OR i.CriadoEm <> d.CriadoEm
                  OR (d.Status = ''ENCERRADO'' AND i.Status <> ''ENCERRADO''))
    BEGIN
        RAISERROR(N''O vínculo com o Setor Técnico não muda de pessoa nem de setor, e um vínculo encerrado não é reaberto (crie um vínculo novo).'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 3) Termo de Adesão específico do Setor Técnico (Art. 49 §2º; Lei 9.608/98, art. 2º) ----
-- Uma prova por vínculo. As formas são as da adesão geral da v7.5 menos a Lista de Ouro (que existe para regularizar membros antigos, e aqui o
-- vínculo nasce com o Termo). O texto aceito é o do setor: o hash cobre o texto geral e o que é específico dele (ver shared/setoresTecnicos.js).

IF OBJECT_ID(N'dbo.SetoresTecnicosAdesoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SetoresTecnicosAdesoes (
        AdesaoId               INT IDENTITY PRIMARY KEY,
        VinculoId              INT NOT NULL REFERENCES dbo.SetoresTecnicosMembros(VinculoId),
        MembroId               INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        SetorId                INT NOT NULL REFERENCES dbo.SetoresTecnicos(SetorId),
        Forma                  NVARCHAR(12) NOT NULL CONSTRAINT CK_SetoresAdesoes_Forma CHECK (Forma IN ('CLICKWRAP','FICHA_FISICA','MENSAGERIA')),
        TermoVersao            INT NULL,
        TermoHash              NVARCHAR(64) NULL,
        TermoEspecificos       NVARCHAR(120) NULL,                                    -- quais cláusulas próprias do setor o texto aceito trazia (o hash cobre-as): a conferência refaz o texto exato
        DataAceite             DATE NOT NULL,
        AceitoEm               DATETIME2 NULL,
        EnderecoIp             NVARCHAR(45) NULL,
        CadeiaCabecalhos       NVARCHAR(400) NULL,
        CanalMensageria        NVARCHAR(8) NULL CONSTRAINT CK_SetoresAdesoes_Canal CHECK (CanalMensageria IS NULL OR CanalMensageria IN ('EMAIL','WHATSAPP')),
        Referencia             NVARCHAR(200) NULL,
        RegistradoPorMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RegistradoEm           DATETIME2 NOT NULL CONSTRAINT DF_SetoresAdesoes_Em DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_SetoresAdesoes_Vinculo UNIQUE (VinculoId),
        CONSTRAINT CK_SetoresAdesoes_Click CHECK (Forma <> 'CLICKWRAP' OR (TermoVersao IS NOT NULL AND TermoHash IS NOT NULL AND AceitoEm IS NOT NULL AND EnderecoIp IS NOT NULL AND RegistradoPorMembroId IS NULL)),
        CONSTRAINT CK_SetoresAdesoes_Ficha CHECK (Forma <> 'FICHA_FISICA' OR (Referencia IS NOT NULL AND RegistradoPorMembroId IS NOT NULL)),
        CONSTRAINT CK_SetoresAdesoes_Msg CHECK (Forma <> 'MENSAGERIA' OR (CanalMensageria IS NOT NULL AND Referencia IS NOT NULL AND RegistradoPorMembroId IS NOT NULL))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SetoresAdesoes_Membro' AND object_id = OBJECT_ID(N'dbo.SetoresTecnicosAdesoes'))
    CREATE INDEX IX_SetoresAdesoes_Membro ON dbo.SetoresTecnicosAdesoes (MembroId);
GO
-- Prova documental: não se apaga nem se altera. Única exceção: depois do prazo de retenção, o IP do aceite digital vira 'anonimizado' e a cadeia de
-- cabeçalhos vira NULL (LGPD art. 16). Mesmo desenho do gatilho da adesão geral (TR_VoluntariadoAdesoes_Imutavel).
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_SetoresAdesoes_Imutavel ON dbo.SetoresTecnicosAdesoes AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF (EXISTS (SELECT 1 FROM deleted) AND NOT EXISTS (SELECT 1 FROM inserted)) OR EXISTS (
        SELECT 1 FROM inserted i JOIN deleted d ON d.AdesaoId = i.AdesaoId
        WHERE i.VinculoId <> d.VinculoId OR i.MembroId <> d.MembroId OR i.SetorId <> d.SetorId OR i.Forma <> d.Forma
           OR ISNULL(i.TermoVersao, -1) <> ISNULL(d.TermoVersao, -1) OR ISNULL(i.TermoHash, N'''') <> ISNULL(d.TermoHash, N'''') OR ISNULL(i.TermoEspecificos, N'''') <> ISNULL(d.TermoEspecificos, N'''')
           OR i.DataAceite <> d.DataAceite OR ISNULL(i.AceitoEm, ''19000101'') <> ISNULL(d.AceitoEm, ''19000101'')
           OR ISNULL(i.CanalMensageria, N'''') <> ISNULL(d.CanalMensageria, N'''') OR ISNULL(i.Referencia, N'''') <> ISNULL(d.Referencia, N'''')
           OR ISNULL(i.RegistradoPorMembroId, -1) <> ISNULL(d.RegistradoPorMembroId, -1) OR i.RegistradoEm <> d.RegistradoEm
           OR (ISNULL(i.EnderecoIp, N'''') <> ISNULL(d.EnderecoIp, N'''') AND NOT (i.EnderecoIp = N''anonimizado'' AND d.EnderecoIp IS NOT NULL))
           OR (ISNULL(i.CadeiaCabecalhos, N'''') <> ISNULL(d.CadeiaCabecalhos, N'''') AND i.CadeiaCabecalhos IS NOT NULL))
    BEGIN
        RAISERROR(N''A adesão ao Termo do Setor Técnico é prova documental: não se apaga e só admite a anonimização do IP depois do prazo de retenção (Lei 9.608/98, art. 2º; Regimento Art. 49 §2º; LGPD art. 16).'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 4) Poder de polícia técnica (Art. 50) ----
-- Um só registro para os dois atos. INTERDICAO: EMITIDA -> RATIFICADA | REVOGADA; EMITIDA ou RATIFICADA -> LEVANTADA (o risco foi sanado).
-- REMOCAO_POSTAGEM: EMITIDA -> ATENDIDA | CANCELADA (o emitente desistiu) | REVOGADA (a Diretoria desfez o pedido). O ato nunca se apaga.

IF OBJECT_ID(N'dbo.SetoresTecnicosIntervencoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SetoresTecnicosIntervencoes (
        IntervencaoId         INT IDENTITY PRIMARY KEY,
        Tipo                  NVARCHAR(16) NOT NULL CONSTRAINT CK_SetoresInterv_Tipo CHECK (Tipo IN ('INTERDICAO','REMOCAO_POSTAGEM')),
        SetorId               INT NOT NULL REFERENCES dbo.SetoresTecnicos(SetorId),
        VinculoId             INT NOT NULL REFERENCES dbo.SetoresTecnicosMembros(VinculoId),
        EmitidaPorMembroId    INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        CongregacaoId         INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        CanalId               INT NULL REFERENCES dbo.CanaisOficiaisComunicacao(CanalId),
        Motivo                NVARCHAR(24) NOT NULL,
        Objeto                NVARCHAR(150) NULL,                                       -- a estrutura interditada ou o perfil/rede da postagem
        Referencia            NVARCHAR(300) NULL,                                       -- nº do laudo/ART (interdição) ou endereço da postagem (remoção)
        Descricao             NVARCHAR(1000) NOT NULL,                                  -- a justificativa técnica
        RegistroProfissional  NVARCHAR(60) NULL,                                        -- o registro de quem emitiu, como estava no momento (Art. 49 §1º)
        Status                NVARCHAR(12) NOT NULL CONSTRAINT CK_SetoresInterv_Status CHECK (Status IN ('EMITIDA','RATIFICADA','REVOGADA','LEVANTADA','ATENDIDA','CANCELADA')),
        EmitidaEm             DATETIME2 NOT NULL CONSTRAINT DF_SetoresInterv_Em DEFAULT SYSUTCDATETIME(),
        DecididaPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),     -- a Diretoria: ratificou ou revogou
        DecididaEm            DATETIME2 NULL,
        DecisaoObs            NVARCHAR(300) NULL,
        FechadaPorMembroId    INT NULL REFERENCES dbo.MembroReferencia(MembroId),     -- levantou, atendeu ou cancelou
        FechadaEm             DATETIME2 NULL,
        FechamentoObs         NVARCHAR(300) NULL,
        CONSTRAINT CK_SetoresInterv_Motivo CHECK (
            (Tipo = 'INTERDICAO' AND Motivo IN ('RISCO_DESABAMENTO','FALHA_ELETRICA_GRAVE'))
         OR (Tipo = 'REMOCAO_POSTAGEM' AND Motivo IN ('ERRO_GROSSEIRO','DIREITO_AUTORAL','DOUTRINA_IMAGEM'))),
        CONSTRAINT CK_SetoresInterv_StatusDoTipo CHECK (
            (Tipo = 'INTERDICAO' AND Status IN ('EMITIDA','RATIFICADA','REVOGADA','LEVANTADA'))
         OR (Tipo = 'REMOCAO_POSTAGEM' AND Status IN ('EMITIDA','REVOGADA','ATENDIDA','CANCELADA'))),
        CONSTRAINT CK_SetoresInterv_Canal CHECK (CanalId IS NULL OR Tipo = 'REMOCAO_POSTAGEM'),
        CONSTRAINT CK_SetoresInterv_Decisao CHECK (
            (Status IN ('RATIFICADA','REVOGADA') AND DecididaPorMembroId IS NOT NULL AND DecididaEm IS NOT NULL)
         OR (Status = 'EMITIDA' AND DecididaPorMembroId IS NULL AND DecididaEm IS NULL)
         OR Status IN ('LEVANTADA','ATENDIDA','CANCELADA')),
        CONSTRAINT CK_SetoresInterv_Revogacao CHECK (Status <> 'REVOGADA' OR DecisaoObs IS NOT NULL),
        CONSTRAINT CK_SetoresInterv_Fechamento CHECK (
            (Status IN ('LEVANTADA','ATENDIDA','CANCELADA') AND FechadaPorMembroId IS NOT NULL AND FechadaEm IS NOT NULL AND FechamentoObs IS NOT NULL)
         OR (Status IN ('EMITIDA','RATIFICADA','REVOGADA') AND FechadaPorMembroId IS NULL AND FechadaEm IS NULL AND FechamentoObs IS NULL))
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SetoresInterv_Status' AND object_id = OBJECT_ID(N'dbo.SetoresTecnicosIntervencoes'))
    CREATE INDEX IX_SetoresInterv_Status ON dbo.SetoresTecnicosIntervencoes (Status, Tipo) INCLUDE (CongregacaoId, EmitidaEm);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SetoresInterv_Congregacao' AND object_id = OBJECT_ID(N'dbo.SetoresTecnicosIntervencoes'))
    CREATE INDEX IX_SetoresInterv_Congregacao ON dbo.SetoresTecnicosIntervencoes (CongregacaoId, Status);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SetoresInterv_Emitente' AND object_id = OBJECT_ID(N'dbo.SetoresTecnicosIntervencoes'))
    CREATE INDEX IX_SetoresInterv_Emitente ON dbo.SetoresTecnicosIntervencoes (EmitidaPorMembroId, EmitidaEm);
GO
-- O ato é documento: não se apaga, o que foi dito e por quem não muda, e um ato já encerrado (revogado, levantado, atendido, cancelado) é definitivo.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_SetoresInterv_Protegido ON dbo.SetoresTecnicosIntervencoes AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted) AND NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        RAISERROR(N''O ato cautelar do Setor Técnico é documento: não se apaga (Regimento Art. 50).'', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.IntervencaoId = i.IntervencaoId
               WHERE i.Tipo <> d.Tipo OR i.SetorId <> d.SetorId OR i.VinculoId <> d.VinculoId OR i.EmitidaPorMembroId <> d.EmitidaPorMembroId OR i.CongregacaoId <> d.CongregacaoId
                  OR ISNULL(i.CanalId, -1) <> ISNULL(d.CanalId, -1) OR i.Motivo <> d.Motivo OR ISNULL(i.Objeto, N'''') <> ISNULL(d.Objeto, N'''')
                  OR ISNULL(i.Referencia, N'''') <> ISNULL(d.Referencia, N'''') OR i.Descricao <> d.Descricao OR ISNULL(i.RegistroProfissional, N'''') <> ISNULL(d.RegistroProfissional, N'''')
                  OR i.EmitidaEm <> d.EmitidaEm
                  OR (d.Status IN (''REVOGADA'',''LEVANTADA'',''ATENDIDA'',''CANCELADA'') AND i.Status <> d.Status))
    BEGIN
        RAISERROR(N''O ato cautelar do Setor Técnico não pode ser reescrito, e um ato encerrado é definitivo (Regimento Art. 50).'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 5) Termo de Vistoria de antecedentes (Regimento Art. 133 §5º, IV, "c") ----
-- A certidão em si NÃO é guardada: o sistema recebe só o hash de cada certidão apresentada (calculado no aparelho de quem confere). O documento
-- original é devolvido ao membro ou descartado, e o registro diz qual dos dois. Acesso exclusivo da Diretoria Executiva e do Conselho de Ética.

IF OBJECT_ID(N'dbo.VistoriasAntecedentes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.VistoriasAntecedentes (
        VistoriaId           INT IDENTITY PRIMARY KEY,
        MembroId             INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Motivo               NVARCHAR(24) NOT NULL CONSTRAINT CK_Vistorias_Motivo CHECK (Motivo IN ('INVESTIDURA','MUDANCA_FUNCAO','SUSPEITA_FUNDADA','SOLICITACAO_DIRETORIA')),
        Funcao               NVARCHAR(150) NOT NULL,                                       -- o cargo ou a função em jogo
        ComVulneraveis       BIT NOT NULL CONSTRAINT DF_Vistorias_Vuln DEFAULT 0,          -- a função envolve crianças, adolescentes ou outros vulneráveis (a v7.7 usa)
        DataVerificacao      DATE NOT NULL,
        Resultado            NVARCHAR(14) NOT NULL CONSTRAINT CK_Vistorias_Resultado CHECK (Resultado IN ('SEM_RESTRICAO','COM_RESTRICAO','RECUSA')),
        Parecer              NVARCHAR(1000) NOT NULL,
        DestinoOriginal      NVARCHAR(10) NULL CONSTRAINT CK_Vistorias_Destino CHECK (DestinoOriginal IS NULL OR DestinoOriginal IN ('DEVOLVIDO','DESCARTADO')),
        AssinadaPorMembroId  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AssinadaEm           DATETIME2 NOT NULL CONSTRAINT DF_Vistorias_Em DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_Vistorias_Original CHECK ((Resultado = 'RECUSA' AND DestinoOriginal IS NULL) OR (Resultado <> 'RECUSA' AND DestinoOriginal IS NOT NULL)),
        CONSTRAINT CK_Vistorias_NaoAutoassina CHECK (AssinadaPorMembroId <> MembroId)
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Vistorias_Membro' AND object_id = OBJECT_ID(N'dbo.VistoriasAntecedentes'))
    CREATE INDEX IX_Vistorias_Membro ON dbo.VistoriasAntecedentes (MembroId, VistoriaId DESC);
GO

IF OBJECT_ID(N'dbo.VistoriasDocumentos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.VistoriasDocumentos (
        DocumentoId   INT IDENTITY PRIMARY KEY,
        VistoriaId    INT NOT NULL REFERENCES dbo.VistoriasAntecedentes(VistoriaId),
        Tipo          NVARCHAR(30) NOT NULL CONSTRAINT CK_VistoriasDoc_Tipo CHECK (Tipo IN ('ANTECEDENTES_FEDERAL','ANTECEDENTES_ESTADUAL','DISTRIBUICAO_CIVEL','OUTRO')),
        HashSha256    NVARCHAR(64) NOT NULL,
        DataEmissao   DATE NOT NULL,
        -- SHA-256 em minúsculas e hexadecimal (a comparação binária impede maiúsculas, que a ordenação do banco aceitaria).
        CONSTRAINT CK_VistoriasDoc_Hash CHECK (LEN(HashSha256) = 64 AND HashSha256 COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^0-9a-f]%')
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_VistoriasDoc_Vistoria' AND object_id = OBJECT_ID(N'dbo.VistoriasDocumentos'))
    CREATE INDEX IX_VistoriasDoc_Vistoria ON dbo.VistoriasDocumentos (VistoriaId);
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_Vistorias_Imutavel ON dbo.VistoriasAntecedentes AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted) OR EXISTS (SELECT 1 FROM inserted)
    BEGIN
        RAISERROR(N''O Termo de Vistoria é registro documental assinado: não se altera nem se apaga (Regimento Art. 133 §5º, IV, "c"). Para corrigir, lavre outro termo.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_VistoriasDoc_Imutavel ON dbo.VistoriasDocumentos AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted) OR EXISTS (SELECT 1 FROM inserted)
    BEGIN
        RAISERROR(N''O hash da certidão faz parte do Termo de Vistoria: não se altera nem se apaga (Regimento Art. 133 §5º, IV, "c").'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- Anulação: o termo lavrado por engano (matrícula errada) não se apaga nem se altera, mas pode ser ANULADO por um registro à parte, só de acréscimo (LGPD art. 18, III).
-- Um termo anulado deixa de contar como vistoria da pessoa (quem falta, última vistoria), e a anulação também não se apaga nem se altera.
IF OBJECT_ID(N'dbo.VistoriasAnulacoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.VistoriasAnulacoes (
        AnulacaoId          INT IDENTITY PRIMARY KEY,
        VistoriaId          INT NOT NULL CONSTRAINT UQ_VistoriasAnulacoes_Vistoria UNIQUE REFERENCES dbo.VistoriasAntecedentes(VistoriaId),
        Motivo              NVARCHAR(300) NOT NULL,
        AnuladaPorMembroId  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AnuladaEm           DATETIME2 NOT NULL CONSTRAINT DF_VistoriasAnulacoes_Em DEFAULT SYSUTCDATETIME()
    );
END
GO
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_VistoriasAnulacoes_Imutavel ON dbo.VistoriasAnulacoes AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted) OR EXISTS (SELECT 1 FROM inserted)
    BEGIN
        RAISERROR(N''A anulação de um Termo de Vistoria é registro documental: não se altera nem se apaga.'', 16, 1);
        ROLLBACK TRANSACTION;
    END
END');
GO

-- ---- 6) Permissões (nenhuma concedida por padrão fora da Diretoria Executiva) ----

IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'setores_tecnicos')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('setores_tecnicos', N'Setores Técnicos — Secretaria Geral: catálogo, vínculos, Termo e atos cautelares');
IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'setores_ratificacao')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('setores_ratificacao', N'Setores Técnicos — Diretoria: ratificar ou revogar interdições e pedidos de remoção');
IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'vistoria_antecedentes')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('vistoria_antecedentes', N'Vistoria de antecedentes — Diretoria e Conselho de Ética: Termo de Vistoria');
GO

-- A lista de permissões de um papel é uma string separada por vírgula. A coluna nasceu com 300 ou 500 caracteres conforme a migração que a criou; com
-- as permissões que vieram depois ela pode ficar apertada, e um UPDATE que estoura derrubaria a migração (e o deploy). Alarga uma vez, para 1000.
IF (SELECT CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Papeis' AND COLUMN_NAME = 'Permissoes') BETWEEN 1 AND 999
    ALTER TABLE dbo.Papeis ALTER COLUMN Permissoes NVARCHAR(1000) NULL;
GO

-- Decisão do desenho (mesma da migração 120): a Diretoria Executiva, aqui, são os dois papéis de nível GLOBAL que administram a igreja inteira —
-- Presidente e Secretário Geral. Concessão aditiva e idempotente. Quem mais precisar (Conselho de Ética, por exemplo) recebe em Permissões.
UPDATE dbo.Papeis
SET Permissoes = CASE WHEN ISNULL(Permissoes, '') = '' THEN 'setores_tecnicos' ELSE Permissoes + ',setores_tecnicos' END
WHERE Nome IN ('Presidente', 'Secretário Geral') AND (',' + ISNULL(Permissoes, '') + ',') NOT LIKE '%,setores_tecnicos,%';
GO
UPDATE dbo.Papeis
SET Permissoes = CASE WHEN ISNULL(Permissoes, '') = '' THEN 'setores_ratificacao' ELSE Permissoes + ',setores_ratificacao' END
WHERE Nome IN ('Presidente', 'Secretário Geral') AND (',' + ISNULL(Permissoes, '') + ',') NOT LIKE '%,setores_ratificacao,%';
GO
UPDATE dbo.Papeis
SET Permissoes = CASE WHEN ISNULL(Permissoes, '') = '' THEN 'vistoria_antecedentes' ELSE Permissoes + ',vistoria_antecedentes' END
WHERE Nome IN ('Presidente', 'Secretário Geral') AND (',' + ISNULL(Permissoes, '') + ',') NOT LIKE '%,vistoria_antecedentes,%';
GO

-- ---- 7) Prazos, avisos e retenção ----

IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'SETOR_INTERDICAO_LEMBRETE_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('SETOR_INTERDICAO_LEMBRETE_DIAS', N'Setores Técnicos — dias depois da emissão em que a interdição ainda sem ratificação passa a ser cobrada da Diretoria todo dia (Reg. Art. 50, I)', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.Prazos WHERE Sigla = 'SETOR_REMOCAO_LEMBRETE_DIAS')
    INSERT INTO dbo.Prazos (Sigla, Nome, Dias) VALUES ('SETOR_REMOCAO_LEMBRETE_DIAS', N'Setores Técnicos — dias depois do pedido em que a remoção de postagem ainda não atendida é cobrada todo dia (Reg. Art. 50, II: remoção imediata)', 1);
GO

-- Os avisos do ato cautelar são de segurança e de imagem da Igreja: não podem ser desligados pelo destinatário (Obrigatoria = 1).
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'SETOR_INDICADO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'SETOR_INDICADO', N'Você foi indicado para um Setor Técnico: aceite o Termo de Adesão', N'SETORES', NULL, NULL, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'SETOR_CANDIDATURA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'SETOR_CANDIDATURA', N'Um membro quer servir num Setor Técnico', N'SETORES', N'setores_tecnicos', NULL, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'SETOR_INTERDICAO')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'SETOR_INTERDICAO', N'Interdição cautelar de templo ou estrutura (Setor Técnico)', N'SETORES', N'setores_ratificacao', NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'SETOR_INTERDICAO_DECIDIDA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'SETOR_INTERDICAO_DECIDIDA', N'Decisão sobre a interdição cautelar', N'SETORES', NULL, NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'SETOR_INTERDICAO_PENDENTE')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'SETOR_INTERDICAO_PENDENTE', N'Interdição cautelar ainda sem ratificação da Diretoria', N'SETORES', N'setores_ratificacao', NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'SETOR_REMOCAO_SOLICITADA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'SETOR_REMOCAO_SOLICITADA', N'Pedido de remoção imediata de postagem em rede oficial (Setor Técnico)', N'SETORES', N'setores_ratificacao', NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'SETOR_REMOCAO_PENDENTE')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'SETOR_REMOCAO_PENDENTE', N'Pedido de remoção de postagem ainda não atendido', N'SETORES', N'setores_ratificacao', NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'SETOR_REMOCAO_DECIDIDA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'SETOR_REMOCAO_DECIDIDA', N'Atualização do pedido de remoção de postagem', N'SETORES', NULL, NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'VISTORIA_SOLICITADA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria)
    VALUES (N'VISTORIA_SOLICITADA', N'A Diretoria Executiva solicita certidões de antecedentes', N'SETORES', NULL, NULL, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'VISTORIA_PENDENTES')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'VISTORIA_PENDENTES', N'Lideranças em exercício sem Termo de Vistoria de antecedentes', N'SETORES', N'vistoria_antecedentes', NULL, 1);
GO

-- Retenção. O vínculo, o Termo (forma, data, versão, hash) e o ato cautelar são prova e ficam sem prazo final; o IP do aceite digital é anonimizado
-- 5 anos depois que o vínculo termina (o mesmo prazo VOLUNTARIADO_IP_RETENCAO_DIAS da adesão geral). O Termo de Vistoria é arquivo interno obrigatório
-- da Igreja (Art. 133 §5º, IV, "c") e guarda só o hash da certidão: dado mínimo, sem prazo de descarte enquanto a pessoa servir.
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Setores Técnicos: vínculo, Termo de Adesão e atos cautelares')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (N'Setores Técnicos: vínculo, Termo de Adesão e atos cautelares', N'x', 1825);
IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Termo de Vistoria de antecedentes')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (N'Termo de Vistoria de antecedentes', N'x', 1825);
GO
-- (O texto é reaplicado a cada deploy: assim a redação corrigida chega a quem já tinha a linha.)
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Vínculo, Termo de Adesão (Lei 9.608/98 art. 2º; Reg. Art. 49 §2º) e atos cautelares (Art. 50): prova guardada sem prazo final. IP e cabeçalhos do aceite digital: anonimizados 5 anos após o fim do vínculo (CF art. 7º XXIX; LGPD art. 16).'
WHERE Categoria = N'Setores Técnicos: vínculo, Termo de Adesão e atos cautelares';
UPDATE dbo.PoliticasRetencao
SET BaseLegal = N'Termo de Vistoria: arquivo interno obrigatório da Igreja (Reg. Art. 133 §5º, IV, "c"; Lei 14.811/2024). Só o hash da certidão é guardado, nunca o documento; acesso restrito à Diretoria Executiva e ao Conselho de Ética.'
WHERE Categoria = N'Termo de Vistoria de antecedentes';
GO
