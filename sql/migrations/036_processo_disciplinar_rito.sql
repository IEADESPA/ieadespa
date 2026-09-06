-- ============================================================
-- Migração 036 — v3.2: Processo Disciplinar ganha o rito (Art. 100-103) e o
-- catálogo estruturado de infrações (Art. 96-99), substituindo o texto livre
-- isolado do núcleo v0.2.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ProcessosDisciplinares') AND name = N'RelatorMembroId')
    ALTER TABLE dbo.ProcessosDisciplinares ADD RelatorMembroId INT NULL REFERENCES dbo.MembroReferencia(MembroId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ProcessosDisciplinares') AND name = N'DataCitacao')
    ALTER TABLE dbo.ProcessosDisciplinares ADD DataCitacao DATE NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ProcessosDisciplinares') AND name = N'CanalCitacao')
    ALTER TABLE dbo.ProcessosDisciplinares ADD CanalCitacao NVARCHAR(30) NULL; -- WHATSAPP | CARTA_REGISTRADA
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ProcessosDisciplinares') AND name = N'DefesaProtocolada')
    ALTER TABLE dbo.ProcessosDisciplinares ADD DefesaProtocolada BIT NOT NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ProcessosDisciplinares') AND name = N'DataDefesa')
    ALTER TABLE dbo.ProcessosDisciplinares ADD DataDefesa DATE NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ProcessosDisciplinares') AND name = N'DefensorNome')
    ALTER TABLE dbo.ProcessosDisciplinares ADD DefensorNome NVARCHAR(200) NULL;
GO

-- Catálogo de infrações (Art. 96-99) — mesmo molde Id+Codigo+Nome+Ativo dos
-- demais catálogos configuráveis (TiposConsagracao, Prazos etc.). Só o título
-- curto de cada inciso entra aqui — o detalhamento bíblico/legal completo já
-- está em app/documentos/regimento-interno.txt, servido à parte.
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.TiposInfracao') AND type = N'U')
BEGIN
    CREATE TABLE dbo.TiposInfracao (
        InfracaoId          INT IDENTITY PRIMARY KEY,
        Codigo               NVARCHAR(30) NOT NULL UNIQUE,
        Nome                  NVARCHAR(200) NOT NULL,
        ReferenciaRegimento    NVARCHAR(40) NULL,
        Ativo                  BIT NOT NULL DEFAULT 1
    );
END
GO

-- Processo cita 1+ infrações do catálogo.
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.ProcessoInfracoes') AND type = N'U')
BEGIN
    CREATE TABLE dbo.ProcessoInfracoes (
        ProcessoId  INT NOT NULL REFERENCES dbo.ProcessosDisciplinares(ProcessoId),
        InfracaoId  INT NOT NULL REFERENCES dbo.TiposInfracao(InfracaoId),
        PRIMARY KEY (ProcessoId, InfracaoId)
    );
END
GO

-- Seed único: só roda se o catálogo ainda estiver vazio (não reinsere se
-- alguém já desativou/editou registros manualmente).
IF NOT EXISTS (SELECT 1 FROM dbo.TiposInfracao)
BEGIN
    INSERT INTO dbo.TiposInfracao (Codigo, Nome, ReferenciaRegimento) VALUES
    -- Art. 96 — Infrações de Natureza Moral, Sexual e de Costumes
    ('ART96-I',    'Adultério e Infidelidade Conjugal',                       'Art. 96, I'),
    ('ART96-II',   'Fornicação (Relação Pré-Conjugal)',                       'Art. 96, II'),
    ('ART96-III',  'Prática Homossexual e Ideologia de Gênero',               'Art. 96, III'),
    ('ART96-IV',   'União Estável Não Regularizada (Amasiamento)',            'Art. 96, IV'),
    ('ART96-V',    'Divórcio Não-Bíblico e Novo Casamento Irregular',         'Art. 96, V'),
    ('ART96-VI',   'Vícios e Substâncias Tóxicas',                            'Art. 96, VI'),
    ('ART96-VII',  'Violência Doméstica e Familiar',                          'Art. 96, VII'),
    ('ART96-VIII', 'Crimes Sexuais Hediondos (Pedofilia e Estupro)',          'Art. 96, VIII'),
    ('ART96-IX',   'Consumo de Pornografia e Lascívia',                       'Art. 96, IX'),
    ('ART96-X',    'Aborto Provocado e Atentado à Vida',                      'Art. 96, X'),
    ('ART96-XI',   'Quebra de Padrão, Vestimentas e Aparência',               'Art. 96, XI'),
    ('ART96-XII',  'Jogos de Azar e Má Conduta Social',                       'Art. 96, XII'),
    -- Art. 97 — Infrações Administrativas, Financeiras e Patrimoniais
    ('ART97-I',    'Apropriação Indébita (Desvio de Posse)',                  'Art. 97, I'),
    ('ART97-II',   'Peculato-Desvio (Uso Indevido de Recursos)',              'Art. 97, II'),
    ('ART97-III',  'Estelionato Eclesiástico (Golpes e Fraudes)',             'Art. 97, III'),
    ('ART97-IV',   'Furto Qualificado pelo Abuso de Confiança',               'Art. 97, IV'),
    ('ART97-V',    'Falsidade Ideológica e Documental (Notas Frias)',         'Art. 97, V'),
    ('ART97-VI',   'Gestão Temerária (Irresponsabilidade Administrativa)',    'Art. 97, VI'),
    ('ART97-VII',  'Lavagem de Dinheiro (Ocultação de Bens)',                 'Art. 97, VII'),
    ('ART97-VIII', 'Sonegação Fiscal e Previdenciária (Caixa 2)',             'Art. 97, VIII'),
    ('ART97-IX',   'Supressão de Documento (Queima de Arquivo)',              'Art. 97, IX'),
    ('ART97-X',    'Corrupção Passiva Privada e "Rachadinha"',                'Art. 97, X'),
    ('ART97-XI',   'Conflito de Interesses e Nepotismo',                     'Art. 97, XI'),
    ('ART97-XII',  'Dano Qualificado ao Patrimônio (Vandalismo)',             'Art. 97, XII'),
    ('ART97-XIII', 'Exercício Arbitrário das Próprias Razões',               'Art. 97, XIII'),
    ('ART97-XIV',  'Usura e Agiotagem',                                      'Art. 97, XIV'),
    ('ART97-XV',   'Invasão de Dispositivo Informático (Crimes Cibernéticos)','Art. 97, XV'),
    ('ART97-XVI',  'Calúnia Financeira e Litigância de Má-Fé',               'Art. 97, XVI'),
    -- Art. 98 — Infrações Ideológicas, Heréticas e Vínculos com Sociedades Secretas
    ('ART98-I',    'Vínculo com a Maçonaria e Sociedades Secretas',           'Art. 98, I'),
    ('ART98-II',   'Heresia e Falsas Doutrinas',                             'Art. 98, II'),
    ('ART98-III',  'Ecumenismo Antibíblico e Sincretismo',                   'Art. 98, III'),
    ('ART98-IV',   'Apostasia (Abandono da Fé)',                             'Art. 98, IV'),
    ('ART98-V',    'Feitiçaria, Ocultismo e Idolatria',                      'Art. 98, V'),
    ('ART98-VI',   'Teologia Liberal e Progressista (Evangelho Social)',     'Art. 98, VI'),
    ('ART98-VII',  'Ministério Paralelo e Facção',                          'Art. 98, VII'),
    ('ART98-VIII', 'Simonia e Comércio da Fé',                               'Art. 98, VIII'),
    -- Art. 99 — Infrações Administrativas, Políticas e de Relacionamento Interpessoal
    ('ART99-I',    'Insubordinação e Motim',                                'Art. 99, I'),
    ('ART99-II',   'Desídia Administrativa (Negligência)',                   'Art. 99, II'),
    ('ART99-III',  'Abandono de Cargo ou Função',                           'Art. 99, III'),
    ('ART99-IV',   'Inadimplência de Liderança (Regra dos 3 Meses)',        'Art. 99, IV'),
    ('ART99-V',    'Campanha Político-Partidária no Templo',                'Art. 99, V'),
    ('ART99-VI',   'Tentativa de Perpetuação no Cargo (Feudalismo)',        'Art. 99, VI'),
    ('ART99-VII',  'Racismo e Injúria Racial',                              'Art. 99, VII'),
    ('ART99-VIII', 'Assédio Moral e Abuso de Autoridade',                   'Art. 99, VIII'),
    ('ART99-IX',   'Calúnia, Difamação e Injúria',                         'Art. 99, IX'),
    ('ART99-X',    'Exposição Negativa em Mídias Sociais',                  'Art. 99, X'),
    ('ART99-XI',   'Violação de Símbolos Institucionais',                   'Art. 99, XI'),
    ('ART99-XII',  'Falso Testemunho e Obstrução',                         'Art. 99, XII'),
    ('ART99-XIII', 'Abandono de Dever Associativo (Ausência em AGO)',       'Art. 99, XIII'),
    ('ART99-XIV',  'Dupla Militância (Infidelidade Institucional)',         'Art. 99, XIV'),
    ('ART99-XV',   'Práticas Bioéticas Vedadas',                            'Art. 99, XV'),
    ('ART99-XVI',  'Violação de Dados, Sigilo e Uso Indevido de Imagem (LGPD)', 'Art. 99, XVI');
END
GO
