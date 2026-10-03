-- ============================================================
-- Migração 113 — v7.1: PSC (Programa de Saúde Congregacional)
--
-- Abre a FASE 7. Regimento Art. 127-129: avaliação ANUAL obrigatória de cada
-- congregação, pela "Escada Bloqueada", em 5 Sinais Vitais. Peças:
--
-- 1) CATÁLOGO (PscSinaisVitais, PscCriterios). Os 5 Sinais Vitais e os 57
--    critérios do Art. 128 (§§1º a 5º) são SEMEADOS daqui, mas ficam no
--    banco como catálogo editável (configurabilidade total, seção 2.1 do
--    README): se a CLI mudar um requisito, muda-se a linha, não o código.
--
-- 2) AVALIAÇÃO (PscAvaliacoes, PscRespostas). Uma avaliação por congregação
--    e exercício (ano civil) — UNIQUE (CongregacaoId, Ano). Ao ser aberta,
--    ela COPIA os critérios vigentes para PscRespostas (código, texto, nível):
--    mudar o catálogo depois nunca reescreve uma avaliação já feita. A
--    situação (RASCUNHO -> ENVIADA -> VALIDADA -> HOMOLOGADA) é uma esteira
--    de quatro etapas feitas por pessoas diferentes (segregação de funções,
--    seção 2.7). O nível NUNCA é digitado: é calculado das respostas pela
--    Escada Bloqueada (shared/psc.js) e só é CONGELADO (NivelFinal,
--    Classificacao, ResultadoSinaisJson) na homologação.
--
-- 3) RECLASSIFICAÇÃO COMPULSÓRIA (PscReclassificacoes, Art. 129 §§2º-3º).
--    Reprovada no Nível 1 por N exercícios consecutivos HOMOLOGADOS (N em
--    PscParametros, padrão 2) -> o sistema abre uma PROPOSTA; quem decide é
--    a CLI (psc_homologacao): decreta ou arquiva. O decreto não apaga
--    ninguém: a congregação vira Categoria 'EXTENSAO_TENDA' sob a tutela de
--    uma Congregação-Mãe, o caixa local é recolhido (retenção local = 0, a
--    anterior fica guardada para o restabelecimento), a diretoria local tem o
--    mandato encerrado e um encarregado é nomeado. É reversível:
--    "restabelecer" devolve a categoria quando a unidade prova que se
--    sustenta de novo.
--
-- 4) PARÂMETROS (PscParametros, linha única): primeiro exercício obrigatório,
--    prazo de envio (dias depois de 31/12) e quantos exercícios seguidos
--    reprovados disparam a reclassificação.
--
-- 5) Permissões novas `psc_gestao` (preencher, enviar e validar no escopo) e
--    `psc_homologacao` (homologar, decidir a reclassificação, mexer no
--    catálogo e nos parâmetros — escopo global) — nunca concedidas a papel
--    nenhum, mesmo padrão de ebd_gestao/trilhas_gestao — e quatro regras no
--    motor de notificações (vB.2).
--
-- Idempotente: seguro para reexecutar sem apagar dados. Cada ALTER em batch
-- próprio (GO): uma coluna recém-criada não pode ser referenciada no mesmo
-- batch em que nasce.
-- ============================================================

-- ---- 1) Congregacoes: categoria e tutela (efeito do rebaixamento) ----

IF COL_LENGTH('dbo.Congregacoes', 'Categoria') IS NULL
    ALTER TABLE dbo.Congregacoes ADD Categoria NVARCHAR(20) NOT NULL
        CONSTRAINT DF_Congregacoes_Categoria DEFAULT 'CONGREGACAO'
        CONSTRAINT CK_Congregacoes_Categoria CHECK (Categoria IN ('CONGREGACAO', 'EXTENSAO_TENDA'));
GO

IF COL_LENGTH('dbo.Congregacoes', 'TutelaCongregacaoMaeId') IS NULL
    ALTER TABLE dbo.Congregacoes ADD TutelaCongregacaoMaeId INT NULL
        CONSTRAINT FK_Congregacoes_TutelaMae REFERENCES dbo.Congregacoes(CongregacaoId);
GO

-- ---- 2) Catálogo: Sinais Vitais e critérios ----

IF OBJECT_ID(N'dbo.PscSinaisVitais', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PscSinaisVitais (
        SinalId     INT IDENTITY PRIMARY KEY,
        Codigo      NVARCHAR(30) NOT NULL CONSTRAINT UQ_PscSinaisVitais_Codigo UNIQUE,
        Nome        NVARCHAR(150) NOT NULL,
        Descricao   NVARCHAR(500) NULL,
        ArtigoRef   NVARCHAR(60) NULL,
        Ordem       INT NOT NULL CONSTRAINT DF_PscSinaisVitais_Ordem DEFAULT 0,
        Ativo       BIT NOT NULL CONSTRAINT DF_PscSinaisVitais_Ativo DEFAULT 1
    );
END
GO

INSERT INTO dbo.PscSinaisVitais (Codigo, Nome, Descricao, ArtigoRef, Ordem)
SELECT v.Codigo, v.Nome, v.Descricao, v.ArtigoRef, v.Ordem FROM (VALUES
    (N'FINANCEIRO', N'Saúde financeira, solvência e mordomia',
        N'Saúde contábil, disciplina orçamentária e capacidade de honrar compromissos, gerar riqueza para o Reino e manter a integridade fiscal.', N'Art. 128 §1º', 1),
    (N'ESTRUTURA', N'Estrutura física e zelo patrimonial',
        N'Dignidade, segurança, estética e funcionalidade do templo, que deve ser referência de organização no bairro.', N'Art. 128 §2º', 2),
    (N'ENSINO', N'Ensino, doutrina e formação',
        N'Regularidade, qualidade pedagógica e ortodoxia do ensino bíblico ministrado.', N'Art. 128 §3º', 3),
    (N'FREQUENCIA', N'Frequência, retenção e capital humano',
        N'Assiduidade da liderança, retenção de membros, vitalidade dos departamentos e poder de atração de novas almas.', N'Art. 128 §4º', 4),
    (N'EXPANSAO', N'Expansão, missionalidade e frutos',
        N'Eficácia no cumprimento da atividade-fim, organização do acolhimento e capacidade reprodutiva.', N'Art. 128 §5º', 5)
) AS v(Codigo, Nome, Descricao, ArtigoRef, Ordem)
WHERE NOT EXISTS (SELECT 1 FROM dbo.PscSinaisVitais s WHERE s.Codigo = v.Codigo);
GO

IF OBJECT_ID(N'dbo.PscCriterios', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PscCriterios (
        CriterioId      INT IDENTITY PRIMARY KEY,
        SinalId         INT NOT NULL REFERENCES dbo.PscSinaisVitais(SinalId),
        Nivel           TINYINT NOT NULL CONSTRAINT CK_PscCriterios_Nivel CHECK (Nivel BETWEEN 1 AND 5),
        Codigo          NVARCHAR(20) NOT NULL,                  -- ex.: 1.2.b = sinal 1, nível 2, alínea b
        Texto           NVARCHAR(600) NOT NULL,
        Orientacao      NVARCHAR(500) NULL,                     -- o "bloqueio" que o Regimento descreve, quando houver
        ArtigoRef       NVARCHAR(60) NULL,
        FonteAutomatica NVARCHAR(30) NULL,                      -- chave da apuração assistida (shared/pscApuracao.js)
        Ordem           INT NOT NULL CONSTRAINT DF_PscCriterios_Ordem DEFAULT 0,
        Ativo           BIT NOT NULL CONSTRAINT DF_PscCriterios_Ativo DEFAULT 1,
        CriadoEm        DATETIME2 NOT NULL CONSTRAINT DF_PscCriterios_CriadoEm DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_PscCriterios_Sinal_Codigo UNIQUE (SinalId, Codigo)
    );
END
GO

-- Semente: Art. 128 §§1º a 5º do Regimento Interno 2026, uma linha por alínea.
-- A orientação é o texto de "Bloqueio"/"Critério de Reprovação" do próprio artigo.
INSERT INTO dbo.PscCriterios (SinalId, Nivel, Codigo, Texto, Orientacao, ArtigoRef, FonteAutomatica, Ordem)
SELECT s.SinalId, v.Nivel, v.Codigo, v.Texto, v.Orientacao, v.ArtigoRef, v.Fonte, v.Ordem
FROM (VALUES
    -- Sinal 1 — Financeiro (§1º)
    (N'FINANCEIRO', 1, N'1.1.a', N'Arrecadação própria suficiente para quitar, rigorosamente em dia, 100% das despesas de custeio.', NULL, N'Art. 128 §1º, I', NULL, 1),
    (N'FINANCEIRO', 1, N'1.1.b', N'Nos últimos 12 meses não precisou de aporte financeiro emergencial da Sede para pagar contas básicas e não pratica "pedalada fiscal".', N'Estará sumariamente reprovada no Nível 1 a congregação que precisou do aporte emergencial da Sede ou que pratica a "pedalada fiscal" (§1º, I, a).', N'Art. 128 §1º, I, a', NULL, 2),
    (N'FINANCEIRO', 2, N'1.2.a', N'Repasses obrigatórios: recolhimento integral e pontual das porcentagens estatutárias, sem retenção indébita de valores que não pertencem à congregação local.', NULL, N'Art. 128 §1º, II, a', N'REPASSES', 1),
    (N'FINANCEIRO', 2, N'1.2.b', N'Prestação de contas: balancetes mensais perfeitos, instruídos com todas as notas fiscais e comprovantes idôneos, sem erros de soma, rasuras ou "vales" não justificados.', NULL, N'Art. 128 §1º, II, b', N'PRESTACAO_CONTAS', 2),
    (N'FINANCEIRO', 3, N'1.3.a', N'Caixa pequeno: Fundo de Reserva Local com saldo real disponível para custear emergências imediatas, sem burocracia.', NULL, N'Art. 128 §1º, III, a', NULL, 1),
    (N'FINANCEIRO', 3, N'1.3.b', N'Manutenção preventiva: faz pequenas pinturas e consertos periódicos sem campanhas extras ou "vaquinhas" constrangedoras com os membros.', NULL, N'Art. 128 §1º, III, b', NULL, 2),
    (N'FINANCEIRO', 4, N'1.4.a', N'Autofinanciamento de eventos: custeia 100% das festividades anuais com recursos próprios gerados pelo departamento ou pelo caixa local.', NULL, N'Art. 128 §1º, IV, a', NULL, 1),
    (N'FINANCEIRO', 4, N'1.4.b', N'Compra de ativo fixo: bens duráveis adquiridos preferencialmente à vista, sem a cultura de carnês e juros que comprometem o futuro.', NULL, N'Art. 128 §1º, IV, b', NULL, 2),
    (N'FINANCEIRO', 5, N'1.5.a', N'Sustento ministerial: arrecadação que sustenta integralmente a prebenda de um Obreiro de Tempo Integral, Missionário ou Seminarista, com todos os encargos.', NULL, N'Art. 128 §1º, V, a', NULL, 1),
    (N'FINANCEIRO', 5, N'1.5.b', N'Investimento em expansão: financia integralmente a abertura de uma nova Extensão da Tenda ou Congregação Filha, sem tocar no caixa da Sede.', NULL, N'Art. 128 §1º, V, b', NULL, 2),

    -- Sinal 2 — Estrutura física (§2º)
    (N'ESTRUTURA', 1, N'2.1.a', N'Instalações elétricas seguras: ausência total de "gambiarras", fios expostos ou quadros de energia sem proteção.', N'Se o templo apresenta risco elétrico ou insalubridade sanitária, está reprovado no Nível 1, sendo irrelevante a posse de equipamentos de luxo (§2º, I, d).', N'Art. 128 §2º, I, a', NULL, 1),
    (N'ESTRUTURA', 1, N'2.1.b', N'Estanqueidade: telhado íntegro, sem goteiras ou infiltrações ativas que danifiquem o patrimônio ou incomodem o culto.', NULL, N'Art. 128 §2º, I, b', NULL, 2),
    (N'ESTRUTURA', 1, N'2.1.c', N'Sanidade: banheiros com portas, descargas e torneiras em pleno funcionamento, com limpeza impecável antes de todas as reuniões.', N'Risco sanitário reprova no Nível 1 (§2º, I, d).', N'Art. 128 §2º, I, c', NULL, 3),
    (N'ESTRUTURA', 2, N'2.2.a', N'Pintura e fachada: paredes internas e externas pintadas nas cores oficiais da instituição, em bom estado de conservação.', NULL, N'Art. 128 §2º, II, a', NULL, 1),
    (N'ESTRUTURA', 2, N'2.2.b', N'Iluminação litúrgica que garanta a leitura bíblica sem esforço visual por parte dos membros.', NULL, N'Art. 128 §2º, II, b', NULL, 2),
    (N'ESTRUTURA', 2, N'2.2.c', N'Placa de identificação frontal legível e iluminada, conforme o layout padrão da Convenção.', NULL, N'Art. 128 §2º, II, c', NULL, 3),
    (N'ESTRUTURA', 3, N'2.3.a', N'Mobiliário: assentos em bom estado, sem rasgos, ferrugem ou instabilidade.', NULL, N'Art. 128 §2º, III, a', NULL, 1),
    (N'ESTRUTURA', 3, N'2.3.b', N'Revestimento: piso totalmente revestido, eliminando o cimento grosso ou "vermelhão".', NULL, N'Art. 128 §2º, III, b', NULL, 2),
    (N'ESTRUTURA', 3, N'2.3.c', N'Sonorização regulada, que permite a inteligibilidade da voz do pregador sem chiados, distorções ou microfonias constantes.', NULL, N'Art. 128 §2º, III, c', NULL, 3),
    (N'ESTRUTURA', 4, N'2.4.a', N'Climatização: templo 100% climatizado ou com sistema de exaustão mecânica profissional.', NULL, N'Art. 128 §2º, IV, a', NULL, 1),
    (N'ESTRUTURA', 4, N'2.4.b', N'Forro e acabamento: teto com forro completo.', NULL, N'Art. 128 §2º, IV, b', NULL, 2),
    (N'ESTRUTURA', 4, N'2.4.c', N'Audiovisual: equipamentos multimídia fixos e instalados para projeção de hinos e versículos.', NULL, N'Art. 128 §2º, IV, c', NULL, 3),
    (N'ESTRUTURA', 5, N'2.5.a', N'Acessibilidade universal: rampas de acesso conforme a ABNT NBR 9050 e banheiros adaptados para PNE.', NULL, N'Art. 128 §2º, V, a', NULL, 1),
    (N'ESTRUTURA', 5, N'2.5.b', N'Espaços pedagógicos: salas de Escola Bíblica separadas, com divisórias acústicas e mobília escolar adequada.', NULL, N'Art. 128 §2º, V, b', NULL, 2),
    (N'ESTRUTURA', 5, N'2.5.c', N'Acústica profissional: tratamento acústico nas paredes e no teto que garanta qualidade de estúdio.', NULL, N'Art. 128 §2º, V, c', NULL, 3),
    (N'ESTRUTURA', 5, N'2.5.d', N'Estacionamento organizado, berçário/fraldário e copa equipada.', NULL, N'Art. 128 §2º, V, d', NULL, 4),

    -- Sinal 3 — Ensino (§3º)
    (N'ENSINO', 1, N'3.1.a', N'Regularidade: a EBD funciona em todos os domingos do ano civil, exceto feriados nacionais ou eventos magnos da IEADESPA, sem cancelamentos por motivos fúteis.', N'Se a EBD funciona "dia sim, dia não", a congregação está reprovada no Nível 1 (§3º, I, c).', N'Art. 128 §3º, I, a', N'EBD_LICOES', 1),
    (N'ENSINO', 1, N'3.1.b', N'Registro: Diários de Classe atualizados, com controle de frequência de alunos e professores.', NULL, N'Art. 128 §3º, I, b', N'EBD_DIARIO', 2),
    (N'ENSINO', 2, N'3.2.a', N'Segmentação etária: classes separadas fisicamente por faixa etária, vedada a prática permanente do "aulão geral".', NULL, N'Art. 128 §3º, II, a', NULL, 1),
    (N'ENSINO', 2, N'3.2.b', N'Material oficial: uso exclusivo de revistas e currículos adotados pela IEADESPA/CPAD ou aprovados pelo Conselho de Doutrina.', NULL, N'Art. 128 §3º, II, b', NULL, 2),
    (N'ENSINO', 3, N'3.3.a', N'Certificação: 100% dos professores de EBD e pregadores locais escalados regularmente têm o certificado do Curso Básico de Teologia ou da AFM da Igreja.', NULL, N'Art. 128 §3º, III, a', NULL, 1),
    (N'ENSINO', 3, N'3.3.b', N'Homilética e hermenêutica: a liderança comprova que os obreiros manejam bem a palavra da verdade, sem vícios de linguagem ou erros crassos de interpretação bíblica.', NULL, N'Art. 128 §3º, III, b', NULL, 2),
    (N'ENSINO', 4, N'3.4.a', N'Classe de Novos Convertidos em funcionamento ativo, com currículo próprio de fundamentos da fé.', NULL, N'Art. 128 §3º, IV, a', NULL, 1),
    (N'ENSINO', 4, N'3.4.b', N'Ciclo de batismo: os batismos são fruto da conclusão do ciclo de ensino, e não de adesão espontânea sem preparo.', NULL, N'Art. 128 §3º, IV, b', NULL, 2),
    (N'ENSINO', 5, N'3.5.a', N'Núcleo Teológico: sedia um Núcleo Teológico Avançado ou Curso de Aperfeiçoamento de Obreiros.', NULL, N'Art. 128 §3º, V, a', NULL, 1),
    (N'ENSINO', 5, N'3.5.b', N'Acervo bibliográfico: disponibiliza biblioteca ativa ou acervo digital para consulta dos membros.', NULL, N'Art. 128 §3º, V, b', NULL, 2),
    (N'ENSINO', 5, N'3.5.c', N'Cultos de Doutrina: realiza Cultos de Ensino com distribuição de material de apoio (esboços impressos ou digitais) e profundidade exegética.', NULL, N'Art. 128 §3º, V, c', NULL, 3),

    -- Sinal 4 — Frequência, retenção e capital humano (§4º)
    (N'FREQUENCIA', 1, N'4.1.a', N'Frequência da Diretoria Local e dos Obreiros Oficiais superior a 90% nos cultos oficiais de Doutrina, Santa Ceia e Escola Dominical, salvo motivo de força maior.', N'Liderança ausente ou que chega constantemente atrasada reprova no Nível 1: não há autoridade espiritual sem convivência (§4º, I, c).', N'Art. 128 §4º, I, a', NULL, 1),
    (N'FREQUENCIA', 1, N'4.1.b', N'Presentismo: não há "Liderança de Gabinete" — o dirigente ou coordenador participa dos cultos com o povo, não apenas dá ordens.', NULL, N'Art. 128 §4º, I, b', NULL, 2),
    (N'FREQUENCIA', 2, N'4.2.a', N'Termômetro da Santa Ceia: a média de frequência na Santa Ceia se mantém estável ou crescente em relação ao exercício anterior.', NULL, N'Art. 128 §4º, II, a', NULL, 1),
    (N'FREQUENCIA', 2, N'4.2.b', N'Controle de evasão: ausência de êxodo significativo de membros para outras denominações ou para o mundo, por falta de cuidado pastoral ou conflitos internos não resolvidos.', NULL, N'Art. 128 §4º, II, b', NULL, 2),
    (N'FREQUENCIA', 3, N'4.3.a', N'Quórum próprio: os departamentos têm quórum para realizar seus cultos e escalas de louvor com seus próprios integrantes, sem depender de outros grupos.', NULL, N'Art. 128 §4º, III, a', NULL, 1),
    (N'FREQUENCIA', 3, N'4.3.b', N'Escalas completas: porteiros, recepcionistas e músicos locais em pleno funcionamento, sem importar obreiros da Sede para "tapar buracos" em dias de festa.', NULL, N'Art. 128 §4º, III, b', NULL, 2),
    (N'FREQUENCIA', 4, N'4.4.a', N'Presença comprovada de visitantes não-crentes em, no mínimo, 80% dos cultos de domingo à noite.', NULL, N'Art. 128 §4º, IV, a', NULL, 1),
    (N'FREQUENCIA', 4, N'4.4.b', N'Conversão real: o crescimento numérico é misto, não dependendo apenas de "transferência de crentes".', NULL, N'Art. 128 §4º, IV, b', NULL, 2),
    (N'FREQUENCIA', 5, N'4.5.a', N'O "bom problema": a lotação do templo atinge regularmente 100% da capacidade sentada nos cultos de domingo.', NULL, N'Art. 128 §4º, V, a', NULL, 1),
    (N'FREQUENCIA', 5, N'4.5.b', N'Estratégia de expansão: instituiu o "Culto Duplo" ou iniciou projeto de ampliação urgente da nave/galeria.', NULL, N'Art. 128 §4º, V, b', NULL, 2),

    -- Sinal 5 — Expansão, missionalidade e frutos (§5º)
    (N'EXPANSAO', 1, N'5.1.a', N'Fidelidade à agenda: grade de cultos semanais cumprida rigorosamente, sem cancelamento por "chuva", "frio", "feriado" ou "previsão de baixo quórum".', N'A congregação que fecha as portas por conveniência climática ou social é considerada "inoperante" e reprovada no Nível 1 (§5º, I, c).', N'Art. 128 §5º, I, a', NULL, 1),
    (N'EXPANSAO', 1, N'5.1.b', N'Respeito à liturgia: o culto acontece com a mesma excelência, tenha duas ou duzentas pessoas presentes.', NULL, N'Art. 128 §5º, I, b', NULL, 2),
    (N'EXPANSAO', 2, N'5.2.a', N'Equipe de recepção uniformizada, treinada e ativa na porta em todos os cultos oficiais.', NULL, N'Art. 128 §5º, II, a', NULL, 1),
    (N'EXPANSAO', 2, N'5.2.b', N'Protocolo de retenção: cadastro de 100% dos visitantes em ficha própria e "Busca Ativa" executada em até 48 horas.', NULL, N'Art. 128 §5º, II, b', NULL, 2),
    (N'EXPANSAO', 3, N'5.3.a', N'Índice de batismo: ao final do exercício, batismos nas águas equivalentes a, no mínimo, 10% do rol de membros atual.', NULL, N'Art. 128 §5º, III, a', N'BATISMOS', 1),
    (N'EXPANSAO', 3, N'5.3.b', N'Origem do fruto: os novos membros são fruto de evangelismo local, e não apenas de recepção de Cartas de Mudança.', NULL, N'Art. 128 §5º, III, b', NULL, 2),
    (N'EXPANSAO', 4, N'5.4.a', N'Ocupação do bairro: Cultos nos Lares, Círculos de Oração nas ruas ou Pequenos Grupos, de forma sistemática, cobrindo geograficamente a área de atuação.', NULL, N'Art. 128 §5º, IV, a', NULL, 1),
    (N'EXPANSAO', 4, N'5.4.b', N'Evangelismo de impacto: cruzadas, ações sociais ou evangelismo de rua realizados periodicamente, marcando a presença da igreja na comunidade.', NULL, N'Art. 128 §5º, IV, b', NULL, 2),
    (N'EXPANSAO', 5, N'5.5.a', N'Abertura de filial: gerou, financiou e inaugurou pelo menos uma nova Extensão da Tenda em bairro vizinho ou zona rural no último período.', NULL, N'Art. 128 §5º, V, a', NULL, 1),
    (N'EXPANSAO', 5, N'5.5.b', N'Envio de obreiros formados na casa para dirigir a nova obra, arcando com o aluguel e a estrutura inicial até a "filha" andar com as próprias pernas.', NULL, N'Art. 128 §5º, V, b', NULL, 2)
) AS v(SinalCodigo, Nivel, Codigo, Texto, Orientacao, ArtigoRef, Fonte, Ordem)
JOIN dbo.PscSinaisVitais s ON s.Codigo = v.SinalCodigo
WHERE NOT EXISTS (SELECT 1 FROM dbo.PscCriterios c WHERE c.SinalId = s.SinalId AND c.Codigo = v.Codigo);
GO

-- ---- 3) Parâmetros (linha única) ----

IF OBJECT_ID(N'dbo.PscParametros', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PscParametros (
        ParametroId                 INT NOT NULL CONSTRAINT PK_PscParametros PRIMARY KEY CONSTRAINT CK_PscParametros_Unico CHECK (ParametroId = 1),
        PrimeiroExercicio           SMALLINT NOT NULL CONSTRAINT DF_PscParametros_Primeiro DEFAULT 2026 CONSTRAINT CK_PscParametros_Primeiro CHECK (PrimeiroExercicio BETWEEN 2000 AND 2200),
        PrazoEnvioDias              INT NOT NULL CONSTRAINT DF_PscParametros_Prazo DEFAULT 90 CONSTRAINT CK_PscParametros_Prazo CHECK (PrazoEnvioDias BETWEEN 0 AND 365),
        ExerciciosParaReclassificacao TINYINT NOT NULL CONSTRAINT DF_PscParametros_Exercicios DEFAULT 2 CONSTRAINT CK_PscParametros_Exercicios CHECK (ExerciciosParaReclassificacao BETWEEN 1 AND 10),
        AtualizadoPorMembroId       INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AtualizadoEm                DATETIME2 NOT NULL CONSTRAINT DF_PscParametros_AtualizadoEm DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.PscParametros WHERE ParametroId = 1)
    INSERT INTO dbo.PscParametros (ParametroId) VALUES (1);
GO

-- ---- 4) Avaliação anual por congregação ----

IF OBJECT_ID(N'dbo.PscAvaliacoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PscAvaliacoes (
        AvaliacaoId             INT IDENTITY PRIMARY KEY,
        CongregacaoId           INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        Ano                     SMALLINT NOT NULL CONSTRAINT CK_PscAvaliacoes_Ano CHECK (Ano BETWEEN 2000 AND 2200),
        Status                  NVARCHAR(12) NOT NULL CONSTRAINT DF_PscAvaliacoes_Status DEFAULT 'RASCUNHO'
                                    CONSTRAINT CK_PscAvaliacoes_Status CHECK (Status IN ('RASCUNHO', 'ENVIADA', 'VALIDADA', 'HOMOLOGADA')),
        AbertaPorMembroId       INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        AbertaEm                DATETIME2 NOT NULL CONSTRAINT DF_PscAvaliacoes_AbertaEm DEFAULT SYSUTCDATETIME(),
        EnviadaPorMembroId      INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        EnviadaEm               DATETIME2 NULL,
        ValidadaPorMembroId     INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        ValidadaEm              DATETIME2 NULL,
        ParecerValidacao        NVARCHAR(1000) NULL,
        HomologadaPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        HomologadaEm            DATETIME2 NULL,
        ResolucaoReferencia     NVARCHAR(150) NULL,
        DevolvidaPorMembroId    INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DevolvidaEm             DATETIME2 NULL,
        MotivoDevolucao         NVARCHAR(500) NULL,
        -- Resultado OFICIAL, congelado na homologação (antes disso é só calculado na leitura).
        NivelFinal              TINYINT NULL CONSTRAINT CK_PscAvaliacoes_NivelFinal CHECK (NivelFinal BETWEEN 0 AND 5),
        ReprovadaNivel1         BIT NULL,
        Classificacao           NVARCHAR(20) NULL CONSTRAINT CK_PscAvaliacoes_Classificacao CHECK (Classificacao IN ('REPROVADA', 'EM_DESENVOLVIMENTO', 'REFERENCIA')),
        ResultadoSinaisJson     NVARCHAR(MAX) NULL,
        -- Quantas vezes foi ENVIADA: entra na chave dos avisos (devolvida e reenviada é um fato novo, não o mesmo aviso).
        Ciclo                   INT NOT NULL CONSTRAINT DF_PscAvaliacoes_Ciclo DEFAULT 0,
        -- Sobe a cada gravação de respostas: o envio confere a versão que leu e não passa por cima de uma resposta que mudou no meio.
        Versao                  INT NOT NULL CONSTRAINT DF_PscAvaliacoes_Versao DEFAULT 0,
        AtualizadaEm            DATETIME2 NOT NULL CONSTRAINT DF_PscAvaliacoes_AtualizadaEm DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_PscAvaliacoes_Congregacao_Ano UNIQUE (CongregacaoId, Ano)
    );
END
GO

IF OBJECT_ID(N'dbo.PscRespostas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PscRespostas (
        RespostaId              INT IDENTITY PRIMARY KEY,
        AvaliacaoId             INT NOT NULL REFERENCES dbo.PscAvaliacoes(AvaliacaoId),
        CriterioId              INT NOT NULL REFERENCES dbo.PscCriterios(CriterioId),
        -- Foto do critério no dia em que a avaliação foi aberta.
        SinalId                 INT NOT NULL REFERENCES dbo.PscSinaisVitais(SinalId),
        Nivel                   TINYINT NOT NULL,
        Codigo                  NVARCHAR(20) NOT NULL,
        Texto                   NVARCHAR(600) NOT NULL,
        Orientacao              NVARCHAR(500) NULL,
        Situacao                NVARCHAR(14) NOT NULL CONSTRAINT DF_PscRespostas_Situacao DEFAULT 'PENDENTE'
                                    CONSTRAINT CK_PscRespostas_Situacao CHECK (Situacao IN ('PENDENTE', 'ATENDIDO', 'NAO_ATENDIDO')),
        Observacao              NVARCHAR(500) NULL,
        EvidenciaUrl            NVARCHAR(500) NULL CONSTRAINT CK_PscRespostas_Evidencia CHECK (EvidenciaUrl IS NULL OR EvidenciaUrl LIKE 'https://%'),
        -- Apuração assistida: o que o próprio sistema enxerga. Sugestão, nunca resposta.
        SugestaoSituacao        NVARCHAR(12) NULL CONSTRAINT CK_PscRespostas_Sugestao CHECK (SugestaoSituacao IN ('CONFERE', 'NAO_CONFERE', 'SEM_DADOS')),
        SugestaoSistema         NVARCHAR(500) NULL,
        SugestaoEm              DATETIME2 NULL,
        RespondidaPorMembroId   INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RespondidaEm            DATETIME2 NULL,
        CONSTRAINT UQ_PscRespostas_Avaliacao_Criterio UNIQUE (AvaliacaoId, CriterioId)
    );
END
GO

-- ---- 5) Reclassificação compulsória (Art. 129 §§2º-3º) ----

IF OBJECT_ID(N'dbo.PscReclassificacoes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PscReclassificacoes (
        ReclassificacaoId       INT IDENTITY PRIMARY KEY,
        CongregacaoId           INT NOT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        Status                  NVARCHAR(12) NOT NULL CONSTRAINT DF_PscReclassificacoes_Status DEFAULT 'PROPOSTA'
                                    CONSTRAINT CK_PscReclassificacoes_Status CHECK (Status IN ('PROPOSTA', 'DECRETADA', 'ARQUIVADA', 'REVERTIDA')),
        ExerciciosConsecutivos  TINYINT NOT NULL,
        AnoInicial              SMALLINT NOT NULL,
        AnoFinal                SMALLINT NOT NULL,
        AvaliacaoGatilhoId      INT NOT NULL REFERENCES dbo.PscAvaliacoes(AvaliacaoId),
        PropostaEm             DATETIME2 NOT NULL CONSTRAINT DF_PscReclassificacoes_PropostaEm DEFAULT SYSUTCDATETIME(),
        DecididaPorMembroId     INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        DecididaEm              DATETIME2 NULL,
        ResolucaoReferencia     NVARCHAR(150) NULL,
        MotivoArquivamento      NVARCHAR(500) NULL,
        -- Efeitos do decreto (para auditar e para restabelecer).
        CongregacaoMaeId        INT NULL REFERENCES dbo.Congregacoes(CongregacaoId),
        EncarregadoMembroId     INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        PercentualRetencaoAnterior DECIMAL(5,2) NULL,
        SaldoLocalNoDecreto     DECIMAL(12,2) NULL,
        LiderancasEncerradas    INT NULL,
        RestabelecidaPorMembroId INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        RestabelecidaEm         DATETIME2 NULL,
        ResolucaoRestabelecimento NVARCHAR(150) NULL,
        MotivoRestabelecimento  NVARCHAR(500) NULL
    );
END
GO

-- Uma proposta/decreto em aberto por congregação. Índice ÚNICO FILTRADO (a
-- lição da Trava 6-A): sem o filtro, as linhas já arquivadas ou revertidas
-- impediriam uma nova reclassificação no futuro.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_PscReclassificacoes_Aberta' AND object_id = OBJECT_ID('dbo.PscReclassificacoes'))
    CREATE UNIQUE INDEX UX_PscReclassificacoes_Aberta ON dbo.PscReclassificacoes (CongregacaoId) WHERE Status IN ('PROPOSTA', 'DECRETADA');
GO

-- ---- 6) Permissões, notificações e retenção ----

IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'psc_gestao')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('psc_gestao', N'PSC — Autoavaliação, envio e validação das congregações');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Funcionalidades WHERE Chave = 'psc_homologacao')
    INSERT INTO dbo.Funcionalidades (Chave, Nome) VALUES ('psc_homologacao', N'PSC — Homologação, reclassificação, catálogo e parâmetros');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'PSC_AVALIACAO_PENDENTE')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'PSC_AVALIACAO_PENDENTE', N'Avaliação do PSC pendente', N'PSC', N'psc_gestao', NULL, 1);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'PSC_PARA_VALIDAR')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'PSC_PARA_VALIDAR', N'Avaliação do PSC aguardando validação', N'PSC', N'psc_gestao', NULL, 1);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'PSC_PARA_HOMOLOGAR')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'PSC_PARA_HOMOLOGAR', N'Avaliação do PSC aguardando homologação', N'PSC', N'psc_homologacao', NULL, 1);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.NotificacaoRegras WHERE Chave = N'PSC_RECLASSIFICACAO_PROPOSTA')
    INSERT INTO dbo.NotificacaoRegras (Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail)
    VALUES (N'PSC_RECLASSIFICACAO_PROPOSTA', N'Reclassificação compulsória aguardando decisão', N'PSC', N'psc_homologacao', NULL, 1);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Avaliação de Saúde Congregacional (PSC)')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (
        N'Avaliação de Saúde Congregacional (PSC)',
        N'Registro institucional da congregação (Regimento Art. 127-129), sem dado pessoal de membro além de quem preencheu, validou e homologou. Retenção indeterminada: o histórico de exercícios é o que sustenta uma reclassificação compulsória.',
        NULL
    );
GO
