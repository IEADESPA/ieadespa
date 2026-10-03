# FASE 6 — EBD (Escola Bíblica Dominical)

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

Reescrever a EBD dentro do sistema (Functions + front estático), sem Next.js.

> **Fonte de ideias, não de código**: existe um protótipo `chamada-ebd`,
> completo e funcional, construído em **Next.js — linguagem/framework
> banida neste projeto** (bug real de cookies do navegador forçando aba
> anônima pra testar, decisão tomada nesta mesma sessão). Nenhuma linha de
> código de lá é copiada — v6.1-v6.10 abaixo são reescritos do zero em
> Functions + front estático, como já valia antes desta nota. Mas o
> *desenho* de várias peças (papéis 100% customizáveis por `ordem`, matriz
> de permissão papel×funcionalidade editável em runtime, motor de
> conquistas por catálogo configurável) é bom o bastante pra informar os
> itens abaixo — em especial v6.4, redesenhada como motor genérico por
> pedido explícito do usuário.

## v6.1 — Hierarquia e cadastros da EBD

- [x] Turmas + TurmaProfessor (Campo → Área → Congregação → Turma).
- [x] Aluno como vínculo de `MembroReferencia` (matrícula única).
- [x] Visão agrupada por Área → Congregação (busca).

  Abre a FASE 6 do zero, em Functions + front estático — nenhuma linha do
  protótipo `chamada-ebd` (Next.js, banido) foi copiada. Migração 101
  (`sql/migrations/101_ebd_hierarquia_cadastros.sql`) cria três tabelas:
  `EbdTurmas` (pertence a uma Congregação — Área/Região/Quadrante/Distrito
  continuam alcançáveis subindo `Congregacoes.AreaId`, exatamente a mesma
  cadeia que `shared/escopo.js::QUERY_POR_TIPO` já usa; nenhuma coluna
  territorial nova), `EbdTurmaProfessores` (N:N Turma×`MembroReferencia`,
  desligar nunca apaga a linha — só `Ativo = 0`, mesmo padrão de
  `EscalasEquipeMembros`/v5.6) e `EbdAlunos`. "Turma" aqui não tem nenhuma
  relação com `TurmasBatismo` (migração 086, esteira de discipulado) —
  nomes parecidos, domínios diferentes.

  Aluno **não é um cadastro de pessoa novo**: é um vínculo de
  `MembroReferencia` — o mesmo cadastro usado por batismo, escalas e
  habilitação de voluntários desde a v0.2/v1.1 — com `UNIQUE (MembroId)`
  em `EbdAlunos`, então cada membro só pode ter um vínculo de aluno na
  vida. A matrícula (`Matricula`, formato `EBD-ANO-NNNNNN`) é atribuída
  **uma única vez**, na primeira matrícula, e persiste através de uma
  eventual transferência de turma depois (`shared/
  ebdTurmas.js::transferirAluno` muda só `TurmaId`, nunca a matrícula).
  Unicidade em dois níveis, mesma defesa em profundidade do resto do
  sistema: o valor é gerado por `shared/protocolo.js::gerarProtocolo`
  (sequência atômica `MERGE ... HOLDLOCK`, já usada por Ouvidoria/
  Disciplina/Projetos — sem reinventar contador nem arriscar duas
  requisições simultâneas saírem com o mesmo número) e `UNIQUE (Matricula)`
  barra qualquer duplicidade remanescente no schema. `podeMatricularAluno`
  recusa nova matrícula pra quem já tem uma, orientando a usar
  transferência de turma em vez disso — testado nos dois casos (membro
  sem vínculo e membro já matriculado).

  Visão agrupada por Área → Congregação (item 3) é
  `shared/ebdTurmas.js::listarTurmasParaVisaoAgrupada` +
  `agruparPorAreaCongregacao` (função pura, testável sem banco) — o escopo
  de quem pode ver o quê **não é recalculado aqui**: reaproveita
  `usuario.escopoCongregacoes`, já resolvido no login por
  `shared/escopo.js::resolverEscopoCongregacoes` (mesmo valor que todo o
  resto do sistema usa em `auth.estaNoEscopo`), filtrando a query por
  `Congregacoes.Nome IN (...)` quando não é `"TODAS"`. A busca
  (`filtrarBuscaAgrupada`, também pura) casa por nome de turma OU nome de
  congregação, aplicada sobre o resultado já agrupado — sem outra query.

  Permissão nova `ebd_gestao` (migração 101), **nunca concedida
  automaticamente a nenhum papel** — mesmo padrão de
  `habilitacao_voluntarios`/v5.7 e `assistencia_social`/v5.9 — cabe à
  Diretoria conceder a quem administra a EBD de fato. Decisão explícita:
  não reaproveitar nenhuma permissão departamental existente
  (`tesouraria_departamental`), porque aquela é do financeiro do
  Departamento "EBD" cadastral (`Departamentos.Sigla = 'EBD'`, usado pelos
  Relatórios Departamentais desde a v5.2/v5.5/v5.8) — um cadastro
  totalmente diferente do que nasce agora (turma/professor/aluno reais).
  As duas coisas só vão se encontrar na futura v6.7 (Financeiro da EBD).

  `api/GestaoEbdTurmas` (`GET/POST /api/ebd-turmas/{turmas|professores|
  professores/encerrar|alunos|alunos/transferir|aluno|visao-agrupada}`),
  toda rota atrás de `auth.exigirPermissao(req, context, "ebd_gestao")` +
  checagem de escopo por congregação (`podeAcessarCongregacao`/
  `podeAcessarTurma`), mesmo padrão de defesa em profundidade do resto do
  sistema. Frontend: novo módulo "EBD" na barra lateral
  (`grupoModuloEbd`/aba `ebd`), com cadastro de turma, designação/remoção
  de professor, matrícula/transferência de aluno e a visão agrupada com
  busca ao vivo.

  Testado com `npx jest` (368 testes, 17 novos em
  `api/shared/__tests__/ebdTurmas.test.js`: `validarNovaTurma`,
  `podeDesignarProfessor` nos três casos — sem vínculo, vínculo encerrado
  reativável, vínculo já ativo —, `podeMatricularAluno` nos dois casos,
  `formatarMatricula` no formato exato com zero-padding,
  `agruparPorAreaCongregacao` com múltiplas congregações por área e
  congregação sem Área definida, e `filtrarBuscaAgrupada` por turma, por
  congregação, sem correspondência e case-insensitive) e `node --check`
  em todos os arquivos novos/alterados.

## v6.2 — Chamada e presença

- [x] Lição aberta/fechada por congregação.
- [x] Lançamento de chamada por turma + presenças/ausências/visitantes.
- [x] Percentuais de presença/ausência calculados.

  Continua a FASE 6 em cima do v6.1. Migração 102
  (`sql/migrations/102_ebd_chamada_presenca.sql`) cria duas tabelas:
  `EbdLicoes` e `EbdChamadas`. `EbdLicoes` (item 1) é a versão
  **intencionalmente mínima** da Lição — só `CongregacaoId`, `Data` e
  `Status` (`ABERTA`/`FECHADA`), sem nenhuma coluna de conteúdo (título,
  texto, referência bíblica). O item "Lições (abrir/fechar) por
  congregação" reaparece no checklist do v6.3 (construído logo depois) de
  propósito: é o **mesmo registro** — a v6.3 vai estender esta mesma
  `EbdLicoes` com tabelas de conteúdo próprias referenciando `LicaoId`
  (atividades, 5 tipos de pergunta, respostas/gabarito), sem recriar ou
  migrar nada do que nasce agora. `UNIQUE (CongregacaoId, Data)` garante
  uma lição por congregação por data — todas as turmas da congregação
  lançam chamada contra a mesma lição do dia; quem diferencia sala é
  `EbdChamadas.TurmaId`, não a Lição.

  `EbdChamadas` (itens 2 e 3) grava uma linha por (Lição, Aluno) — visitante
  **não ganha matrícula falsa** em `EbdAlunos` só para caber no esquema
  (isso quebraria a garantia de "matrícula única por Membro" da migração
  101): `AlunoId` fica `NULL` e a própria linha carrega `VisitanteNome`/
  `VisitanteContato`. `UNIQUE (LicaoId, AlunoId)` garante um registro por
  aluno por lição. *(Corrigido na Trava 6-A: a premissa original — "no SQL
  Server, `NULL` é tratado como distinto numa UNIQUE" — estava errada; a
  UNIQUE aceitava um único visitante por lição. A migração 108 trocou a
  constraint por um índice único filtrado `WHERE AlunoId IS NOT NULL`, e só
  agora cada visita é de fato a sua própria linha.)* `shared/ebdChamada.js::decidirAcaoRegistroPresenca`
  decide entre criar ou atualizar (upsert) quando o mesmo aluno é chamado
  de novo na mesma lição — corrigir uma marcação errada é rotina, então
  o upsert é sempre permitido (diferente de `podeDesignarProfessor`/v6.1,
  que recusa duplicar vínculo ativo). Um `CHECK` na migração garante a
  mesma regra no schema: `PRESENTE`/`AUSENTE` sempre com `AlunoId` e nunca
  com dado de visitante; `VISITANTE` nunca com `AlunoId` e sempre com nome.

  Percentuais (item 3) são sempre derivados das linhas de `EbdChamadas` —
  `shared/ebdChamada.js::calcularPercentuais`/`resumirChamada` (funções
  puras) — nunca um campo digitado, mesmo princípio de "calculado, nunca
  digitado" já usado na v5.5.1/v5.6/v5.7. O denominador é
  `presentes + ausentes` (o universo de alunos da turma já chamados);
  visitante é contado à parte, sem entrar no percentual da turma, porque
  não é aluno matriculado nela.

  Permissão — decisão explícita, diferente da v6.1: abrir/fechar/reabrir
  Lição continua atrás de `ebd_gestao` (administração da EBD). Mas
  **lançar chamada de uma turma não exige `ebd_gestao`**: um professor
  ativo daquela turma (`EbdTurmaProfessores`, mesma tabela da v6.1) pode
  lançar a própria chamada sem a permissão ampla — do contrário, cada um
  dos dezenas de professores de sala precisaria que a Diretoria concedesse
  gestão completa da EBD só para fazer chamada da própria turma, o que não
  se sustenta operacionalmente. Quem tem `ebd_gestao` continua podendo
  lançar chamada de qualquer turma dentro do próprio escopo territorial
  (cobre licença/ausência do professor titular). Essa checagem
  (`podeLancarChamadaDaTurma`, em `api/GestaoEbdChamada/index.js`) só
  reaproveita a tabela `EbdTurmaProfessores` que já existia — nenhuma
  tabela ou coluna de permissão nova.

  `api/GestaoEbdChamada` (`GET/POST /api/ebd-chamada/{licao|licao/abrir|
  licao/fechar|licao/reabrir|licoes|roster|presenca|visitante|resumo}`).
  Frontend: seção "Chamada e presença" adicionada à aba EBD
  (`app/index.html`/`app/script.js`) — abrir lição do dia por congregação,
  carregar o roster de uma turma com o status já lançado, marcar presente/
  ausente por aluno, lançar visitante e ver o resumo com os percentuais
  calculados ao vivo.

  Testado com `npx jest` (389 testes, 21 novos em
  `api/shared/__tests__/ebdChamada.test.js`: `podeLancarChamada` nos três
  casos — sem lição, lição fechada, lição aberta —, `podeFecharLicao`/
  `podeReabrirLicao`, `validarLancamentoPresenca` cobrindo aluno com dado
  de visitante colado, visitante com `alunoId`, e os casos válidos de cada
  status, `decidirAcaoRegistroPresenca` (criar vs. atualizar),
  `calcularPercentuais` (turma sem lançamento, percentual exato e com
  arredondamento de uma casa decimal) e `resumirChamada` agregando uma
  lista de registros) e `node --check` em todos os arquivos novos/
  alterados.

## v6.3 — Lições e atividades

- [x] Lições (abrir/fechar) por congregação.
- [x] Atividades (5 tipos de pergunta: múltipla escolha, V/F, ordenar, completar, correspondência).
- [x] Respostas dos alunos + gabarito.

  Continua a FASE 6 em cima da v6.2 (`EbdLicoes`/`EbdChamadas`). Migração
  103 (`sql/migrations/103_ebd_licoes_atividades.sql`) faz exatamente o que
  a v6.2 anunciou de propósito: estende a MESMA `EbdLicoes` (`ALTER TABLE`
  guardado por `IF NOT EXISTS` em `sys.columns`, idempotente) com `Titulo`,
  `Referencia` e `Conteudo`, todos `NULL` — o item "Lições (abrir/fechar)
  por congregação" reaparece aqui porque é o MESMO registro da v6.2, não
  uma tabela nova; abrir/fechar continua sendo só a janela de chamada.
  Em cima disso, três tabelas novas: `EbdAtividades` (uma Atividade por
  Lição, `UNIQUE (LicaoId)`, idempotente ao criar — `criarOuBuscarAtividade`
  devolve a existente em vez de duplicar) e `EbdAtividadeQuestoes` (N
  questões por Atividade, `Tipo` restrito por `CHECK` aos 5 valores do
  checklist, `OpcoesJson`/`GabaritoJson` guardando a forma específica de
  cada tipo — documentada por extenso no preâmbulo de
  `api/shared/ebdAtividades.js`).

  Os 5 tipos e como cada um é corrigido (`shared/ebdAtividades.js::
  corrigirQuestao`, dispatcher único): **múltipla escolha** compara o
  índice escolhido com o índice do gabarito; **V/F** compara booleano
  estrito (resposta ausente/não booleana é sempre errada, nunca lança
  erro); **ordenar** compara a lista de itens do aluno com o gabarito
  posição a posição (mesmo conjunto de itens, ordem estrita — trocar dois
  itens de lugar já reprova); **correspondência** guarda os pares
  (`{id, esquerda, direita}`) autorados como o próprio gabarito e o aluno
  responde com `{esquerdaId, direitaId}` por par — a correção
  (`corrigirCorrespondencia`) é tudo-ou-nada: cada par precisa aparecer uma
  única vez com `esquerdaId === direitaId`, cobrindo pareamento cruzado, id
  duplicado, id desconhecido e resposta incompleta. **Completar** é o único
  tipo de texto livre — decisão deliberada: o gabarito é uma LISTA de
  variantes aceitas (não uma string única) e a comparação usa
  `normalizarTexto` (sem acento, minúsculo, espaços colapsados) contra essa
  lista — reduz falso-negativo de digitação/acentuação sem virar um
  julgamento livre de sentido. Por isso o resultado automático de
  COMPLETAR nunca é tratado como definitivo: toda resposta (de qualquer
  tipo, não só completar) pode ser corrigida manualmente depois
  (`corrigirRespostaManual`). *(Precisão da Trava 6-A: a auto-correção
  grava certo/errado na hora pra todo tipo válido — o "⏳ pendente" da tela
  só aparece pra tipo desconhecido; a revisão humana é a correção manual,
  não um estado de espera.)* As respostas ficam numa terceira tabela,
  `EbdRespostasAlunos`.

  Resposta do aluno é sempre lançada por quem já lança a chamada — o Aluno
  (v6.1) não tem login próprio no sistema — com upsert por
  `UNIQUE (QuestaoId, AlunoId)` (mesmo espírito de `EbdChamadas`/v6.2:
  corrigir um lançamento errado é rotina) e auto-correção imediata contra
  o gabarito da questão. `calcularNotaAtividade` (pura) agrega os
  resultados de uma atividade com tipos mistos em
  `{totalQuestoes, respondidas, corretas, pendentes, percentual}` —
  não-respondida conta como errada no percentual (nota de prova real),
  mas `pendentes` distingue "errou" de "ainda não foi corrigida" na tela.

  Permissão — mesma granularidade de `podeLancarChamadaDaTurma`/v6.2:
  gerenciar o CONTEÚDO da lição/atividade (que é compartilhado por todas as
  turmas da congregação, como a própria lição) exige `ebd_gestao` no escopo
  OU ser professor ativo em QUALQUER turma daquela congregação
  (`ehProfessorAtivoDaCongregacao`, em `api/GestaoEbdAtividades/index.js`);
  já lançar/corrigir a RESPOSTA de um aluno específico exige ser professor
  ativo NA TURMA daquele aluno (ou `ebd_gestao`) — mesma granularidade de
  turma da chamada. Decisão deliberada, documentada na migração 103: a
  Atividade NÃO fica bloqueada quando a Lição está `FECHADA` — diferente da
  chamada, cujo lançamento realmente para quando a lição fecha — porque
  responder/revisar/corrigir a atividade depois (dever de casa) faz
  sentido continuar mesmo com a chamada daquele domingo já encerrada.

  `api/GestaoEbdAtividades` (`GET/POST /api/ebd-atividades/{licao/conteudo|
  atividade|questao|resposta|resposta/corrigir|respostas|resumo}`).
  Frontend: seção "Lições e atividades" adicionada à aba EBD
  (`app/index.html`/`app/script.js`) — editar título/referência/conteúdo da
  lição, criar a atividade e adicionar questão por tipo (com texto de ajuda
  por tipo sobre o formato de opções/gabarito), lançar/corrigir resposta
  por aluno com o status calculado ao vivo, e ver o resumo de acertos por
  aluno de uma turma inteira.

  Testado com `npx jest` (428 testes, 39 novos em
  `api/shared/__tests__/ebdAtividades.test.js`: as 5 regras de
  `corrigirQuestao` cobrindo caso certo/errado/ausente de cada tipo
  (incluindo `corrigirCorrespondencia` com pareamento cruzado, id
  duplicado, id desconhecido e resposta incompleta, e `corrigirCompletar`
  com variante aceita, variante sem acento, maiúscula/minúscula e resposta
  vazia), `validarQuestao` nos 5 tipos e `calcularNotaAtividade` agregando
  uma atividade de tipos mistos com pendente e não respondida) e
  `node --check` em todos os arquivos novos/alterados.

## v6.4 — Motor de conquistas e gamificação *(desenhado como genérico desde o início, pedido explícito)*

Diferente do resto da FASE 6, esta versão **não nasce presa à EBD**: o motor
de regras/catálogo/pontuação é construído module-agnostic desde a primeira
migração, com a EBD como **primeiro consumidor real**, não o único. A
decisão evita o retrabalho de generalizar depois — mesmo princípio já usado
em `shared/estatuto.js`/`shared/parentesco.js`, escritos uma vez e
reaproveitados por meia dúzia de módulos diferentes ao longo da FASE B.

- [x] `CatalogoConquistas` (nome, ícone, descrição, `oculta` até desbloquear,
      `préRequisitos` — progressão em cadeia, não catálogo plano) e
      `RegrasConquista` com um **tipo de regra genérico** (não hardcoded por
      módulo): `contagem_evento` (ex: nº de presenças), `sequencia` (ex: N
      domingos seguidos), `combinacao_exata` (ex: gabaritou + presente +
      trouxe bíblia no mesmo evento), `marco_unico` (ex: primeira presença),
      `periodo_perfeito` (ex: trimestre sem falta) — cada regra referencia um
      **tipo de evento** (`EBD_PRESENCA`, e no futuro
      `REUNIAO_PRESENCA`/`ESCALA_SERVICO`/`CONTRIBUICAO`, sem alterar o motor
      pra adicionar um tipo novo, só cadastrar).
- [x] `ConquistasDesbloqueadas` por `MembroId` (não por "Aluno" — é a mesma
      pessoa em `MembroReferencia` de todo o resto do sistema), motor
      avaliado **na leitura/no lançamento do evento-gatilho**, nunca em job
      manual.
- [x] `ScoreConfig` (pesos por tipo de evento, configurável por Campo) +
      pontuação unificada por pessoa, usada tanto no painel individual
      quanto num ranking por escopo (turma/congregação/área).
- [x] Painel Admin (`/conquistas` — mesmo espírito do `chamada-ebd`) pra
      criar/editar catálogo e regras sem alteração de código.
- [x] **Primeiro consumidor: EBD** — presença semanal, sequência, gabarito de
      atividade, trimestre perfeito (v6.2/v6.3) viram `RegrasConquista` reais,
      não um caso especial do motor.
- [x] **Consumidores futuros, só registrados como intenção** (não
      implementados agora — cada um vira um item pontual numa versão futura
      quando chegar a vez, só cadastrando regra nova): frequência em
      Reuniões, confirmação de Escala de Serviço (v5.6), fidelidade de
      Contribuição. Generalizar o motor agora custa pouco a mais; forçar
      esses consumidores a existir agora custaria reabrir versões fechadas.

Migração 104 (`sql/migrations/104_conquistas_motor.sql`) cria as 6 tabelas
genéricas — `ConquistaTiposEvento` (registro de tipo de evento, a peça que
faz "cadastrar, não codificar" ser verdade), `ConquistasEventos` (log de
ocorrências, ÚNICA fonte que o motor lê), `CatalogoConquistas`,
`RegrasConquista`, `ConquistasDesbloqueadas` e `ScoreConfig` — e semeia o
primeiro consumidor real: os tipos `EBD_PRESENCA`/`EBD_ATIVIDADE_RESPOSTA` e
4 conquistas reais (`Primeira Presença` → `Sequência de Ouro` → `Trimestre
Perfeito`, em cadeia de pré-requisito, mais `Gabarito Nota Máxima`,
independente). `api/shared/conquistas.js` é o motor: os 5 avaliadores de
regra (`avaliarContagemEvento`, `avaliarSequencia`, `avaliarCombinacaoExata`,
`avaliarMarcoUnico`, `avaliarPeriodoPerfeito`) são funções puras que recebem
o histórico de eventos do Membro (já filtrado por `TipoEvento`) e a
`ConfigJson` da regra, e devolvem `true`/`false` sem tocar banco —
`sequencia` calcula a maior corrida de datas espaçadas por `intervaloDias`
(7 por padrão, "N domingos seguidos"); `periodo_perfeito` exige um mínimo de
ocorrências dentro da janela (prova de que "houve expediente" — sem isso,
ausência total de dado passaria por "perfeito") e zero eventos que combinem
com `filtroFalha`; `combinacao_exata` exige que TODOS os campos de
`camposEsperados` estejam no payload do MESMO evento (nunca a soma de dois
eventos parciais). Pré-requisito é uma corrente linear
(`PreRequisitoConquistaId`, auto-referência) — só elegível se o pré-requisito
já estiver desbloqueado para aquele Membro. `oculta` controla só a
visibilidade na listagem (`visivelNoCatalogo`); a conquista continua sendo
avaliada normalmente por baixo. `avaliarConquistasParaMembro` é o núcleo:
exclui do cálculo qualquer `ConquistaId` já presente em
`ConquistasDesbloqueadas` ANTES de rodar qualquer regra (uma conquista
desbloqueada nunca é reavaliada em lançamentos futuros) e roda em passadas
sucessivas até estabilizar, porque desbloquear uma conquista pode liberar
imediatamente a próxima da cadeia no mesmo instante. `registrarEventoEAvaliar`
é o entry point único que os módulos consumidores chamam — grava o evento e
avalia na mesma chamada, nunca em job (zero `timerTrigger`, mesmo princípio
de `calcularStatusHabilitacao`/v5.7 e das Cartas de Trânsito/v017:
"calculado, nunca marcação/job manual"). Pontuação (`calcularScoreMembro`)
soma peso por `TipoEvento` (`ScoreConfig`, com override territorial resolvido
por `shared/escopo.js::ancestraisTerritoriais`, do nível mais amplo pro mais
específico) mais o bônus fixo de cada conquista desbloqueada — um evento só
soma se seu payload não marcar `contaParaScore:false` (convenção genérica,
sem nome de campo específico de EBD: é assim que `shared/ebdChamada.js`
loga uma AUSENTE como evento, pra `periodo_perfeito` enxergar a falta, sem
inflar o placar de quem faltou). Ranking (`listarRanking`/`ordenarRanking`)
reaproveita `shared/escopo.js::resolverEscopoCongregacoes` pros escopos
territoriais e resolve "TURMA" à parte (não é nível de `Lideranca`); empate
é desfeito por (1) mais conquistas desbloqueadas, (2) quem chegou primeiro
(desbloqueio mais antigo), (3) `MembroId` crescente — nunca "aleatório" entre
execuções. `api/GestaoConquistas/index.js` expõe tudo por HTTP: administrar
catálogo/regras/tipos de evento exige a permissão própria
`conquistas_gestao` (nunca concedida por padrão, mesmo padrão de
`ebd_gestao`/v6.1); consultar o próprio painel (`GET /conquistas/painel`) e o
ranking (`GET /conquistas/ranking`) fica aberto a qualquer usuário logado —
ver o painel de OUTRO Membro exige a permissão de gestão (mesmo espírito de
"admin gerencia, todo mundo vê o seu" da Habilitação de Voluntários/v5.7).
No front, o painel pessoal e o ranking geral vivem em "Meu Painel → Minhas
Conquistas" (`app/index.html`/`app/script.js`), e a administração do
catálogo numa aba própria "Conquistas" (`conquistas_gestao`). O hook com o
primeiro consumidor fica em `shared/ebdChamada.js::registrarPresencaAluno`
(loga `EBD_PRESENCA` a cada presença/ausência lançada — visitante fica de
fora, não tem `MembroId`) e em `shared/ebdAtividades.js::registrarRespostaAluno`
(loga `EBD_ATIVIDADE_RESPOSTA` com o percentual corrente da atividade a cada
resposta lançada/corrigida — a regra `combinacao_exata` de "Gabarito Nota
Máxima" dispara quando esse percentual chega a 100), os dois fail-soft (uma
falha do motor de conquistas nunca derruba o lançamento de presença/resposta
em si, mesmo espírito de `registrarAuditoria`). 36 testes novos em
`api/shared/__tests__/conquistas.test.js` (464 no total, eram 428) cobrem os
5 avaliadores de regra isoladamente, a cadeia de pré-requisito, a
visibilidade oculta/desbloqueada, `calcularScoreMembro` e os 3 níveis de
desempate do ranking.

## v6.5 — Certificados

- [x] Emissão de certificados + página imprimível.

  Continua a FASE 6 com a versão mais simples do capítulo — nenhum motor novo,
  só um CRUD + o par "PDF de verdade + página imprimível" já consagrado por
  CartasTransito/vB.6 e ApresentacoesCrianca/vB.12. Migração 105
  (`sql/migrations/105_ebd_certificados.sql`) cria uma única tabela,
  `CertificadosEmitidos` (MembroId, Título, Descrição/motivo livre,
  `ConquistaId` nullable, EmitidoPorMembroId, Protocolo, DataEmissao).

  Decisão de projeto (o item do checklist é uma linha só, sem dizer "pra
  quem" nem "certificado de quê"): "emissão de certificados" foi desenhada
  **genérica**, não amarrada só à EBD — quem emite (`shared/certificados.js
  ::emitirCertificado`) escolhe uma matrícula + um título/motivo livre (ex:
  "Conclusão do Curso de Obreiros", "Participação no Seminário X"), e
  `ConquistaId` é um vínculo **opcional** de conveniência com o motor de
  conquistas do v6.4 (`CatalogoConquistas`) — pré-liga o certificado a uma
  conquista que a pessoa já desbloqueou (ex: "Trimestre Perfeito"), sem
  nunca exigir esse vínculo. Mesma razão de `shared/protocolo.js`/
  `shared/estatuto.js` serem primitivas reaproveitáveis por módulos que
  ainda nem existem: um certificado por qualquer outro motivo, de um futuro
  módulo fora da EBD, usa a mesma tabela sem qualquer mudança de schema —
  ao mesmo tempo, nenhum motor de template genérico foi construído (isso
  seria over-engineering pra um item de checklist de uma linha).

  Diferente de CartasTransito, não há lifecycle de rascunho
  (SOLICITADA/CONFIRMADA/EMITIDA): emitir um certificado **já é** o evento
  real, então o protocolo institucional único (`shared/protocolo.js`, tipo
  `CERT`) é gerado no próprio INSERT, dentro de `emitirCertificado` — nunca
  sob demanda no primeiro PDF, porque aqui não existe "ainda não é de
  verdade" antes disso.

  Duas Functions, mesmo naming das duas emissões de PDF anteriores:
  `GestaoCertificados` (`POST /api/certificados/emitir` e
  `GET /api/certificados?membroId=`) e `CertificadoPdf`
  (`GET /api/certificados/{id}/pdf?matricula=`, mesmo modelo de
  autoatendimento do `CartaPdf` — só a própria matrícula baixa o próprio
  PDF; **desde a Trava 6-B exige login**: o titular, ou gestão que alcança o
  titular — ver a trava). Permissão de emissão: **`ebd_gestao`** (v6.1) — a mesma que já fecha
  turmas/chamada/lições da FASE 6, porque emitir certificado não é
  autoatendimento (a pessoa não emite pra si mesma); consultar/baixar/
  imprimir os próprios certificados continua aberto à própria matrícula,
  mesmo espírito self-service do resto do sistema.

  Frontend: `app/index.html` ganha a seção "🎓 Certificados" dentro da aba
  EBD (emitir, buscar por matrícula, listar) e `app/script.js` traz o
  mesmo par de funções de sempre — `baixarPdfCertificado`/
  `imprimirCertificado` + `renderizarImpressaoCertificado` (janela própria,
  `window.print()`), no mesmo espírito de `baixarPdfCarta`/`imprimirCarta`.

  12 testes novos em `api/shared/__tests__/certificados.test.js` (476 no
  total, eram 464) cobrem `validarEmissaoCertificado` (matrícula e título
  obrigatórios, título até 150 caracteres, descrição/conquista opcionais),
  `podeAcessarCertificado` (autoatendimento vs. `ebd_gestao`) e
  `mapearCertificado` (com e sem o vínculo opcional de conquista).

## v6.6 — Revistas e pedidos

- [x] Catálogo de revistas + pedidos por congregação.
- [x] Consolidação + aprovação + pagamentos (pendente/aprovado).

  Migração 106 (`sql/migrations/106_ebd_revistas_pedidos.sql`) cria três
  tabelas: `EbdCatalogoRevistas` (edições estilo CPAD, por faixa etária e
  trimestre), `EbdPedidosRevistas` e `EbdPedidosRevistasItens`
  (quantidade por revista dentro de um pedido). Lógica pura em
  `shared/ebdRevistas.js`, rota em `api/GestaoEbdRevistas`
  (`/api/ebd-revistas/...`).

  **Chamada de projeto documentada na migração**: o pedido vive na
  **Turma** (`EbdPedidosRevistas.TurmaId`), não direto na Congregação,
  mesmo o texto do checklist dizendo "por congregação". Motivo: a v6.8
  (construída depois) amarra "revista/trimestre vigente" à classe —
  é a Turma quem sabe qual edição e quantas unidades precisa, não a
  congregação como agregado cego. A visão "por congregação" do checklist
  não foi abandonada: ela é a **consolidação** (item 2), que agrupa os
  pedidos de todas as Turmas daquela Congregação na leitura
  (`listarPedidosParaConsolidado` + `consolidarPedidosPorAreaCongregacao`),
  sem nenhuma coluna redundante — mesmo princípio de "Área não precisa de
  coluna própria" que a migração 101 já usava (sobe
  `EbdTurmas.CongregacaoId` → `Congregacoes.AreaId`).

  Preço é **travado no pedido**: cada linha de `EbdPedidosRevistasItens`
  grava `PrecoUnitarioRegistrado`, cópia do preço do catálogo no momento
  do pedido — se o preço da edição mudar depois no catálogo, pedidos já
  feitos não mudam de valor retroativamente (mesmo problema que
  `shared/protocolo.js`/matrícula já resolvia: gerado uma vez, nunca
  recalculado). `ValorTotal` nunca é uma coluna própria: é sempre
  `SUM(Quantidade × PrecoUnitarioRegistrado)`, calculado na leitura
  (`calcularValorTotalPedido`) — mesmo princípio de "calculado, nunca
  digitado" do resto da FASE 6.

  A máquina de estados é deliberadamente mínima, só o par que o checklist
  pede: `Status` (`PENDENTE`/`APROVADO`, aprovação do pedido em si) e
  `StatusPagamento` (`PENDENTE`/`APROVADO`, independente do primeiro —
  um pedido pode estar aprovado e ainda não pago). `podeAprovarPedido`
  recusa aprovar duas vezes e recusa aprovar um pedido sem nenhum item
  (mesma guarda de `shared/escalas.js::decidirTroca`);
  `podeRegistrarPagamento` exige `Status = APROVADO` antes de aceitar
  pagamento (não se paga o que ainda não foi aceito) e recusa registrar
  pagamento duas vezes. **`StatusPagamento` aqui é só uma marcação** — não
  gera lançamento financeiro, não cria linha de ledger e não integra com
  `TesourariasDepartamento` (v5.4): isso é trabalho explícito da v6.7
  (Financeiro da EBD, construída logo depois), que move dinheiro de
  verdade. v6.6 só responde "este pedido já foi pago ou não".

  Permissão: reaproveita **"ebd_gestao"** (v6.1), sem permissão nova.
  Administrar o catálogo, aprovar pedido e marcar pagamento sempre exigem
  "ebd_gestao" (dentro do escopo territorial de quem decide — nunca o
  professor que fez o pedido aprova o próprio pedido). Criar/editar os
  itens do pedido de uma Turma específica (enquanto `PENDENTE`) também é
  liberado ao **professor ATIVO daquela Turma** (`EbdTurmaProfessores`,
  v6.1) sem precisar da permissão ampla — mesma granularidade que
  `GestaoEbdAtividades::ehProfessorAtivoDaTurma` (v6.3) já usa pra
  conteúdo de lição/resposta de aluno. O catálogo em si não é territorial
  (uma edição vale pra qualquer congregação), então só listar exige login;
  cadastrar/alterar exige "ebd_gestao".

  24 testes novos em `api/shared/__tests__/ebdRevistas.test.js` (500 no
  total, eram 476) cobrem validação de catálogo/itens (trimestre no
  formato `AAAA-T1`..`T4`, preço não-negativo, revista repetida no mesmo
  pedido), `calcularValorTotalPedido` (sempre a partir do preço travado no
  item, nunca do catálogo vigente), a máquina de estados pendente→aprovado
  do pedido e do pagamento (incluindo as guardas contra aprovar duas
  vezes, aprovar pedido vazio e pagar antes de aprovar) e a consolidação
  Área → Congregação → Pedidos (com soma de valor em cada nível).

## v6.7 — Financeiro da EBD

- [x] Ofertas + lançamentos manuais por congregação — dia a dia, aqui na
      FASE 6, perto de onde o trabalho acontece.
- [x] Exporta o consolidado do mês pra `TesourariasDepartamento` (v5.4,
      depto EBD) — **não** integra direto com a FASE 4: quem concilia com o
      Centro de Custo geral é a v5.4, mesmo caminho dos outros 7
      departamentos (ver princípio "relatório não é trabalho" na v5.5). A
      EBD só chega lá com o financeiro do mês já pronto, em vez de digitado
      do zero.

  Implementado: migração 107 (`EbdOfertas` + `EbdLancamentosFinanceiros`) +
  `shared/ebdFinanceiro.js` (lógica pura — validação, `calcularTotalOfertas`,
  `calcularTotalLancamentos`, `calcularConsolidadoMensal` — + as funções finas
  de banco) + `GestaoEbdFinanceiro` (rotas `GET/POST /api/ebd-financeiro/oferta`,
  `GET/POST/DELETE /api/ebd-financeiro/lancamentos`, `GET
  /api/ebd-financeiro/consolidado`). Oferta é ancorada em `EbdLicoes` (v6.2,
  já o "domingo" natural da FASE 6 — no máximo uma por lição); lançamento
  manual é solto por Congregação+Data (ENTRADA/SAÍDA + descrição livre),
  cobrindo o que não é a oferta do culto em si.

  **Item 2 nunca escreve em `TesourariasDepartamento`** — o consolidado do
  mês (ofertas + lançamentos líquidos) só alimenta, como VALOR DE PARTIDA, o
  campo `ofertas` (FINANCEIRO/FLUXO, migração 092) do relatório
  departamental do depto EBD, no momento em que o rascunho do mês nasce
  (`GestaoRelatoriosDepartamentais::POST`, hook em `shared/ebdFinanceiro.js::
  buscarValorPrePreenchimentoOfertas`); quem concilia esse número com o
  Centro de Custo geral da FASE 4 continua sendo exclusivamente a v5.4
  (`congelarRateio`), pelo mesmo caminho que os outros 7 departamentos usam
  — nenhuma linha nova nesse pipeline.

  **Pré-preenchimento, não trava**: deliberadamente DIFERENTE do mecanismo
  `CAMPOS_AUTOMATICOS_AFILIACAO` da v5.5 (congregados/membrosEmComunhao/
  membrosSemComunhao), que é ESTADO e fica travado — recalculado a cada
  leitura, com `gravarValores` recusando persistir qualquer valor enviado
  pra ele. O campo `ofertas` é FLUXO, e a própria v5.5 já previa que o
  Superintendente Local "só confirma ou ajusta" o valor medido pela FASE 6 —
  por isso o valor do ledger só é copiado UMA VEZ, na criação do rascunho,
  pelo mesmo caminho de inserção dos campos ESTADO normais; depois disso
  segue 100% editável por PUT, sem nenhum bloqueio novo em `gravarValores`.
  Um teste dedicado (`shared/__tests__/ebdFinanceiro.test.js`) confirma que
  `ofertas` nunca aparece em `CAMPOS_AUTOMATICOS_AFILIACAO` — o único mapa
  que o guard de `gravarValores` consulta — então nunca é bloqueado como os
  3 campos automáticos da v5.5.

  **Permissão conservadora**: diferente de v6.2/v6.6 (que liberam o
  professor da própria turma), toda ação financeira aqui exige sempre
  "ebd_gestao" dentro do escopo territorial da Congregação — dinheiro de
  oferta é decisão de nível Congregação (Superintendente Local), não de
  turma, mesmo espírito cauteloso da v5.9 (Assistência Social) com dado
  sensível: quando o dado pede mais cuidado, o sistema erra pro lado de
  restringir mais, não menos.

  Frontend: painel "💰 Financeiro" na aba EBD (`app/index.html`/
  `app/script.js`) — registrar/ajustar oferta por lição, lançar/excluir
  lançamento manual por congregação+mês, e ver o consolidado do mês (o
  mesmo número que vira sugestão no relatório departamental).

  27 testes novos em `shared/__tests__/ebdFinanceiro.test.js` (validação de
  oferta/lançamento, `calcularConsolidadoMensal`, o hook de
  pré-preenchimento só disparando pro depto EBD, e a confirmação de que o
  campo continua gravável) — suíte completa em 527/527 (38 suítes; era
  500/37 depois da v6.6).

## 🔒 Trava de Revisão 6-A — antes de avançar para a v6.8

- [x] Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da
      seção 3). Auditadas v6.1 a v6.7 pelas 5 perguntas do checklist
      (26/09); as duas conferências que ficaram pendentes foram feitas em
      30/09 (ver item 5). **A trava que mais achou coisa até aqui**: o módulo EBD
      passou em todos os testes e em todo deploy, mas metade das ações
      nunca tinha funcionado em produção. Correções no commit `908c895` +
      migração 108.

  **1. Todo código novo roda de ponta a ponta contra o ambiente real?**
  **Não era verdade — achado crítico, corrigido.** Toda Function da EBD
  declarava a rota `xxx/{acao?}`, e `{acao?}` casa **um** segmento só:
  as 11 ações de dois segmentos que o front chama (`ebd-chamada/licao/
  abrir|fechar|reabrir`, `ebd-turmas/professores/encerrar`, `ebd-turmas/
  alunos/transferir`, `ebd-atividades/licao/conteudo`, `ebd-atividades/
  resposta/corrigir`, `ebd-revistas/pedidos/itens|aprovar|pagamento`)
  davam 404 antes de chegar no código. Sem abrir lição, a chamada inteira
  (v6.2), as atividades (v6.3), a oferta (v6.7) e o motor de conquistas
  (v6.4, que só recebe evento da chamada/atividade) ficaram sem uso real
  desde que nasceram. Mesmo defeito em `assistencia-social` (v5.9,
  `cadastro/encerrar`, `profissionais/descredenciar`) — passou pela Trava
  5-B porque ela só conferiu `401` sem sessão na rota raiz. Corrigido com
  catch-all `{*acao}` nas 6 Functions. **Lição pra próximas travas: testar
  cada rota de ação, não só a raiz.** Migrações 101-107 conferidas
  aplicando contra o Azure SQL em cada deploy desde a v6.1 (idempotência
  testada de verdade, várias vezes); 108 aplicada no run `36267898600`.
  Suíte: 533 testes (eram 527; 6 novos em `conquistas.test.js`).

  **2. Toda tela nova abre e mostra dado de verdade?** Checagem
  sistemática: 1606 `getElementById` literais contra 1228 ids + 70
  prefixos dinâmicos — só os 2 falsos positivos de sempre (`caixaSino`,
  `permissaoEscopoTodas`); todo handler inline aponta pra função global.
  Achados de tela, corrigidos: (a) **o professor não tinha tela** — o
  backend deixa o professor ativo lançar chamada/resposta/pedido da própria
  turma sem `ebd_gestao` desde a v6.2, mas a aba EBD só abria com
  `ebd_gestao`; agora abre em **modo professor** (`GET /api/ebd-turmas/
  minhas-turmas`, `temPermissaoDaAba`), mostrando só as próprias turmas,
  chamada, atividades e pedido de revistas — e `GET licao`/`licao/conteudo`/
  `atividade` passaram a aceitar o professor da congregação, senão quem
  entra por código de acesso (vB.5, escopo vazio) nunca achava a lição;
  (b) o campo "Id do aluno" não aparecia em tabela nenhuma — coluna Id nas
  tabelas de alunos, roster e resumo; (c) datas de coluna `DATE` (lição,
  lançamento financeiro) apareciam um dia antes (meia-noite UTC em UTC-3);
  (d) re-salvar uma resposta de texto punha aspas literais e ela virava
  errada.

  **3. README e código continuam narrando a mesma coisa?** Divergências
  corrigidas no código: a UNIQUE `(LicaoId, AlunoId)` de `EbdChamadas`
  aceitava **um único visitante por lição** (o texto da v6.2 dizia que o
  SQL Server trata `NULL` como distinto numa UNIQUE — não trata; migração
  108 troca por índice filtrado); `conquistas_gestao` nunca foi semeada em
  `Funcionalidades`, então não tinha como ser concedida pela tela de
  Permissões (108 semeia, sem conceder a papel nenhum); **"Sequência de
  Ouro" e "Trimestre Perfeito" nunca desbloqueariam** — `paraDataLocal`
  não lia o `Date` que o mssql devolve de coluna `DATE`, e os testes só
  passavam string (teste novo com `Date`); a correção manual de resposta
  não disparava o motor, apesar de a v6.4 prometer "lançada/corrigida";
  o catálogo aberto a qualquer login devolvia as conquistas `oculta`; o
  certificado aceitava vínculo com conquista não desbloqueada; editar um
  pedido pendente repreçava tudo pelo catálogo do momento. Corrigidas no
  texto: v6.2 (visitante), v6.3 ("três tabelas", o "⏳ pendente"), v6.5
  ("Continua a FASE 6"), notas "ainda não construída" vencidas. Números de
  teste de v6.1-v6.7 (17/21/39/36/12/24/27; totais 368→527) conferem
  exatamente com o código. **Fica registrado, não corrigido, por
  decisão**: `ScoreConfig` não tem tela (só SQL) e a tela de Conquistas só
  cria — não edita — catálogo/regra (as rotas `catalogo/atualizar` e
  `regra/desativar` existem); o override territorial de pesos não é usado
  pelo painel nem pelo ranking.

  **4. O que ficou pra trás foi de fato corrigido, não só anotado?**
  Nenhum `TODO`/`FIXME`/gambiarra no diff da FASE 6. Corrigidos nesta
  trava: IDOR em `resposta/corrigir` (conferia permissão contra o
  `alunoId` informado, sem checar que a resposta era dele);
  `alunos/transferir` só conferia o escopo da turma de destino (agora a de
  origem também); pedido de revista deixava cabeçalho órfão quando uma
  revista era inválida (a UNIQUE `(TurmaId, Trimestre)` passava a barrar a
  recriação); o pré-preenchimento de ofertas no relatório departamental
  (v6.7) não era fail-soft; **eventos de conquista acumulavam** — corrigir
  AUSENTE→PRESENTE deixava a falta antiga bloqueando "Trimestre Perfeito"
  e cada re-salvamento somava pontos: `ConquistasEventos.ChaveOrigem`
  (108) torna o evento substituível por fato gerador (`licao:N`,
  `atividade:N`), sem nome de módulo no motor. Fora da FASE 6, achado na
  checagem de CI: **o agendador de notificações (vB.2) falhava quase todo
  dia desde 16/09** (`curl` exit 22 em ~45s, o limite das Functions
  gerenciadas; o job de fluxos, 30min depois e já aquecido, sempre
  passava) — `rotinas-diarias.yml` agora aquece API e banco antes, sem
  repetir a chamada (`criarNotificacao` é consulta-depois-insere, sem
  índice único: retry paralelo duplicaria aviso). **Decisão do usuário
  (26/09)**: o ranking de conquistas continua aberto a qualquer login,
  listando os nomes de todos os alunos (inclusive menores) — intencional,
  pelo engajamento. `CertificadoPdf` anônimo com id + matrícula segue o
  mesmo modelo já aceito do `CartaPdf`.

  **5. Deploy real, de ponta a ponta, aconteceu?** Sim — `gh run list`
  confirma `success` nos 7 commits de v6.1 a v6.7 (`3e607e3`, `888f98f`,
  `7025bb5`, `bdc1919`, `7ddacd1`, `fec10d1`, `3e5b7f0`) e no das correções
  (`908c895`, run `36267898600`: 533 testes, migração 108 em 5 batches,
  "Deployment Complete"). **Pendências fechadas em 30/09**: (a) conferência
  ao vivo das rotas de ação de dois segmentos contra
  `app.ieadespa.org.br`, sem sessão — `ebd-chamada/licao/abrir`,
  `ebd-turmas/professores/encerrar`, `ebd-turmas/alunos/transferir`,
  `ebd-atividades/licao/conteudo`, `ebd-atividades/resposta/corrigir`,
  `ebd-revistas/pedidos/aprovar`, `assistencia-social/cadastro/encerrar` e
  `assistencia-social/profissionais/descredenciar` respondem todas `401`
  (antes da correção eram `404`); (b) o agendador aquecido rodou com
  `success` nos dois jobs em 4 dias seguidos (27, 28, 29 e 30/09 — runs
  `36311923403`/`36313184116` no primeiro).

## v6.8 — Caderneta digital no padrão que a EBD já usa *(7ª rodada)*

Achado de adoção, não de funcionalidade: o secretário de EBD da Assembleia já
preenche há décadas uma caderneta com campos padronizados (CPAD). Reproduzir
**exatamente esses campos** elimina resistência — a pessoa reconhece a tela — e
dá, pela primeira vez, série histórica comparável entre congregações.

- [x] Classe por faixa etária com professor e revista/trimestre vigente —
      espelhando a caderneta física: **matriculados, presentes, ausentes,
      visitantes, Bíblias, revistas e oferta** por domingo.
- [x] Fechamento trimestral automático + **Relatório do Superintendente**
      consolidado por congregação/Área (hoje somado à mão).
- [x] Aluno não-membro (visitante frequente, criança de família não congregada)
      sem forçar matrícula de membresia — hoje o aluno é vínculo de
      `MembroReferencia`, o que exclui exatamente quem a EBD mais quer alcançar.
- [x] Migração/importação das cadernetas antigas em planilha, se houver.
      *(referência: eScriptura, Domus EBD, CPAD Escola Dominical)*

  Implementado em cima de tudo que a FASE 6 já tinha, sem duplicar dado:
  migração 109 (`sql/migrations/109_ebd_caderneta_digital.sql`),
  `shared/ebdCaderneta.js` (lógica pura + banco), `GestaoEbdCaderneta`
  (`/api/ebd-caderneta/...`), `EbdFechamentoAutomatico` (rotina diária) e,
  no `shared/ebdTurmas.js`/`GestaoEbdTurmas`, o aluno não-membro. Frontend:
  seção "📒 Caderneta digital (v6.8)" no fim da aba EBD e três formulários
  novos na matrícula (não-membro, vincular/encerrar, transferir por Id).

  **Caderneta do domingo (item 1).** `EbdCadernetas` tem uma linha por
  (Lição × Turma). **Presentes, ausentes e visitantes não são digitados**:
  continuam derivados da chamada (`EbdChamadas`, v6.2), o mesmo princípio de
  "calculado, nunca digitado" do resto da FASE 6. O que a chamada não tem e a
  caderneta de papel tem — **Bíblias e Revistas trazidas** — é a única coisa
  lançada aqui, e em branco quer dizer "não informado" (`NULL`), nunca 0: a
  caderneta de papel em branco não prova que ninguém trouxe Bíblia.
  `ausentes = matriculados − presentes`, a definição do papel (quem não
  está presente está ausente); a linha também devolve `ausentesMarcados` e
  `semChamada`, pra o secretário ver quantos alunos ainda faltam marcar. Só
  entram nos totais as classes que lançaram alguma coisa (chamada ou
  caderneta) — uma classe que não se reuniu não puxa a média de presença pra
  baixo. A linha é montada num lugar só (`montarLinhaCaderneta`), então a
  tela do dia, o relatório e o fechamento nunca discordam, e traz alertas
  (alunos sem chamada, mais presentes que matriculados, Bíblias ou revistas
  acima do total de frequentes).

  **Matriculados tem foto, porque a turma do aluno é sobrescrita na
  transferência** (sem histórico): sem a foto, o passado mudaria a cada
  aluno que sai. `MatriculadosRegistrado` é gravado ao salvar a caderneta da
  classe e de novo ao **fechar a lição** (`fecharLicao` chama
  `congelarMatriculadosDaLicao`, fail-soft — uma falha ali nunca impede
  fechar a lição). Reabrir e salvar de novo regrava a foto.

  **Decisão: a oferta não é por classe.** A caderneta de papel tem oferta por
  classe, mas o dinheiro da EBD já tem um lugar só, `EbdOfertas` por lição
  (v6.7); um segundo número digitado por classe poderia divergir dele. Então
  a oferta aparece no domingo inteiro (`ofertaRegistrada`), vinda da v6.7, e
  soma no relatório. A exceção é a caderneta **importada** (item 4), que
  carrega a oferta do papel como histórico.

  **Revista/trimestre vigente:** trimestres civis (`AAAA-T1` = jan-mar ...
  `T4` = out-dez, o mesmo formato do catálogo da v6.6), calculados pela data
  da lição. A revista mostrada é a que a turma **pediu** naquele trimestre
  (`EbdPedidosRevistas`, v6.6); sem pedido, sugere as edições do catálogo da
  mesma faixa etária (marcado "sugestão"); sem nada, mostra só o trimestre.

  **Fechamento trimestral e Relatório do Superintendente (item 2).**
  `EbdFechamentosTrimestrais` guarda a **foto congelada** (JSON) do trimestre
  de uma congregação, `UNIQUE (CongregacaoId, Trimestre)`. Depois de fechado,
  o número não muda quando um aluno é transferido ou uma lição é corrigida;
  `fechamento/refazer` é uma ação explícita, auditada, que incrementa
  `Versao`. Fechar à mão só é possível depois que o trimestre termina (antes
  disso existe o relatório parcial). O fechamento **automático** é a rotina
  diária `EbdFechamentoAutomatico` (`POST /api/ebd-fechamento-interno`, segredo
  `x-cron-secret`, `shared/cronAuth.js` — timerTrigger continua banido no
  modelo gerenciado) chamada por um job novo de `rotinas-diarias.yml` às 11h00
  UTC (8h em Brasília, 30 min depois do último, pelo mesmo motivo dos outros):
  fecha os **2 trimestres mais recentes já encerrados há mais de 7 dias**
  (carência pro último domingo ser lançado) das congregações que têm lição e
  ainda não têm fechamento. **Nunca refaz** um fechamento existente; uma
  congregação com problema não impede as outras; o que ficou em aberto é
  registrado (`LicoesAbertas`) e aparece como aviso. É idempotente: se uma
  rodada estourar o tempo das Functions, a de amanhã continua.

  O relatório (`GET /api/ebd-caderneta/relatorio?trimestre=`) é
  **Área → Congregação → Turma**, dentro do escopo territorial de quem
  consulta (`usuario.escopoCongregacoes`). Congregação com fechamento usa a
  foto (`fonte: FECHAMENTO`); sem fechamento, calcula ao vivo
  (`fonte: AO_VIVO`) e o relatório fica marcado "parcial" enquanto o
  trimestre não terminou. As contas: por turma, médias por domingo lançado e
  percentual de presença = Σ presentes ÷ Σ matriculados (não média de
  médias); na congregação, "domingos" é o número de lições distintas; área e
  total geral somam os filhos. A oferta da congregação é `EbdOfertas` do
  trimestre mais a oferta importada.

  **Aluno não-membro (item 3).** A migração 109 torna `EbdAlunos.MembroId`
  anulável e dá à própria matrícula o mínimo de identificação (nome, contato,
  nascimento, responsável). Um `CHECK` garante que a linha é **ou membro ou
  não-membro**, nunca os dois nem nenhum. **Armadilha já conhecida e evitada:**
  no SQL Server uma `UNIQUE` comum trata `NULL` como igual a `NULL` — com
  `MembroId` anulável, a `UQ_EbdAlunos_Membro` aceitaria um único não-membro
  no banco inteiro (o mesmo erro que a Trava 6-A achou em `EbdChamadas`).
  Virou índice único **filtrado** (`WHERE MembroId IS NOT NULL`).

  A matrícula sai pela mesma sequência atômica de sempre (`EBD-ANO-NNNNNN`,
  `gerarProtocolo`). Regras (`validarAlunoNaoMembro`): nome com pelo menos 3
  caracteres; **menor de 18 anos — pela data de nascimento informada — exige o
  nome do responsável** (LGPD, Art. 14); data futura ou improvável é
  recusada; o mesmo nome (sem distinguir acento/maiúscula) na mesma turma é
  recusado. A trilha de auditoria — encadeada por hash, que não pode ser
  corrigida depois — guarda só os ids, **nunca nome, contato ou nascimento**.
  Quando o não-membro vira membro, `alunos/vincular-membro` liga a **mesma
  matrícula** (e todo o histórico de chamada) ao cadastro do membro e apaga os
  dados soltos da matrícula; nunca dá pra ter duas matrículas no mesmo membro.

  O não-membro aparece na chamada, nas atividades e na caderneta como qualquer
  aluno. Não pontua em conquistas (não tem `MembroId`, a mesma regra do
  visitante) e não entra no ranking por turma. **Achado ao construir:** não
  existia nenhuma forma de desativar um aluno, então o número de matriculados
  só cresceria e a caderneta nunca bateria com a realidade. Entraram
  `alunos/encerrar` (marca `Ativo = 0`, nada é apagado) e a reativação:
  transferir uma matrícula encerrada a reativa na turma de destino (é assim
  que quem saiu e voltou reaparece, já que a matrícula é única por membro).
  A transferência também passou a aceitar `alunoId`, o único jeito de achar um
  não-membro.

  **Importação das cadernetas antigas (item 4, "se houver").**
  `POST /api/ebd-caderneta/importar` lê CSV (ou linhas em JSON) com as colunas
  `Igreja`, `Domingo`, `Classe`, `Matriculados`, `Presentes` (obrigatórias) e
  `Ausentes`, `Visitantes`, `Bíblias`, `Revistas`, `Oferta` (opcionais); o
  cabeçalho aceita apelidos, sem acento nem maiúscula; detecta `;`, `,` ou
  tabulação; datas `AAAA-MM-DD` ou `DD/MM/AAAA`; oferta em formato brasileiro
  (`1.234,56`). **Simular é o padrão** — gravar exige `simular: false`
  explícito — e é **tudo ou nada**: qualquer linha com erro e nada entra;
  quando entra, é numa transação. Congregação e turma são achadas pelo nome e
  a turma **precisa já existir** (não cria turma sozinho); o escopo de quem
  importa é conferido por linha. Cria a lição como `FECHADA` se não existir.
  **Não sobrepõe dado do sistema:** recusa turma que já tem chamada ou
  caderneta do sistema naquela data, e oferta quando a lição já tem oferta da
  v6.7 (evita contar dinheiro em dobro); reimportar substitui uma caderneta
  que já era importada. Cadernetas importadas (`Origem = 'IMPORTADA'`) só têm
  totais, sem linha por aluno, e não são editáveis pela tela. O front lê o
  arquivo em UTF-8 e cai pra Windows-1252 se não for UTF-8 válido (o Excel em
  português salva assim; sem isso "Bíblias" e nomes de igreja chegariam
  quebrados). **Limite assumido:** o mecanismo foi entregue sem ter visto uma
  planilha real da igreja — se a disposição de colunas for outra, o ajuste é
  a tabela de apelidos `ALIAS_COLUNAS` em `shared/ebdCaderneta.js`.

  **Permissão:** nenhuma nova — reaproveita `ebd_gestao` (v6.1). Salvar
  Bíblias/Revistas de uma classe e ver a linha dela exige `ebd_gestao` (no
  escopo) **ou ser professor ativo daquela turma**, a mesma granularidade da
  chamada (v6.2); a caderneta do domingo inteiro, o relatório, o fechamento e
  a importação exigem `ebd_gestao` dentro do escopo territorial.

  Testado com `npx jest`: 61 testes novos (49 em
  `shared/__tests__/ebdCaderneta.test.js` — trimestres, linha da caderneta,
  consolidado, regras do fechamento, CSV —, 12 em
  `ebdTurmasNaoMembro.test.js` — não-membro, menor de idade, nome repetido,
  vínculo a membro) — suíte completa em 594/594 (40 suítes; era 533/38).
  `node --check` em todos os `.js` novos e alterados; no front, todo
  `getElementById` literal do código novo (112) tem id no HTML e todo
  `onclick` da aba EBD (40) aponta pra função que existe.

  **Verificado contra banco de verdade (30/09).** Os testes unitários só
  cobrem a lógica pura; o SQL, as constraints e as rotas foram exercitados
  por um roteiro descartável (**não versionado**: lê credenciais locais) que
  rodou os módulos e os handlers reais das Functions contra o banco de
  homologação `ieadespa-homolog`, com dados fictícios removidos no fim.
  Resultado: as 109 migrações aplicam do zero num banco vazio (a 109 em 10
  batches) e **98 verificações passaram** — CHECK e índice único filtrado da
  109, caderneta derivada da chamada, congelamento de matriculados ao fechar a
  lição, não-membro (matrícula, criança sem responsável recusada, nome
  repetido, vínculo a membro, encerrar/reativar), relatório com escopo
  restrito e vazio, fechamento manual/refazer/automático (inclusive
  idempotência e a carência de 7 dias), importação (tudo ou nada, conflitos,
  reimportação) e as permissões das rotas (professor da turma, gestor de
  outro escopo, sem sessão). As funções de renderização do front rodaram num
  DOM simulado com o JSON exato da API: 24 verificações, incluindo o escape de
  HTML. Em produção: a 109 foi aplicada pelo deploy do commit `60bb0ab` e as 11
  rotas novas respondem `401` sem sessão (nenhuma `404`).

  **Registrado, não construído, por decisão:**

  - Exclusão LGPD do aluno não-membro: o fluxo de exclusão do titular
    (`ExecutarExclusaoLGPD` — o texto original citava `ExcluirDados`, que é
    outra coisa: o reset de dados fictícios) não cobre `EbdAlunos`; fica para a
    Trava 6-B, junto da política de retenção. **Resolvido na Trava 6-B.**
  - O texto digitado por gente passa por `escaparHtmlEbd` nas telas novas e
    nas duas células de nome que a v6.8 tocou (alunos da turma e roster da
    chamada); o resto da aba EBD ainda monta HTML sem escapar (nome de
    visitante, de turma etc.) — limpeza geral para a Trava 6-B. **Resolvido na
    Trava 6-B.**
  - Matriculados de lições fechadas **antes** da v6.8 não têm foto: usam o
    número atual de alunos ativos até alguém reabrir e salvar a caderneta
    (ou até o trimestre ser fechado, que congela o resultado).

## v6.9 — Trilhas de formação e certificação verificável *(7ª rodada)*

- [x] **Trilha por papel** (professor de EBD, diácono, tesoureiro local,
      dirigente, secretário): módulos, pré-requisitos, progresso individual.
- [x] Conclusão de trilha como **pré-requisito verificado** nos fluxos que já
      existem — consagração (v8.3), nomeação de liderança (v0.1), habilitação de
      voluntário (v5.7). Deixa de ser "a gente sabe que fulano fez o curso".
- [x] Certificado com **QR de verificação pública** — qualquer pessoa confere a
      autenticidade sem login, mesmo mecanismo da credencial ministerial (v8.4).
- [x] Educação continuada com validade: certificado vence, e o vencimento
      aparece como pendência (não bloqueia culto, mas bloqueia escala onde a
      norma exigir). *(referência: Lifeway Ministry Grid, RightNow Media, Rock RMS LMS)*
- [x] **Integração com a Esteira de Batismo (vB.11)**: o item IV da aptidão
      (Art. 80 §2º, conclusão do Curso de Discipulado) hoje é uma atestação
      MANUAL (`CandidatosBatismo.DiscipuladoConcluidoManual`, marcada por
      quem administra o processo, sem verificação própria) — quando esta
      versão existir, `shared/batismo.js::calcularAptidaoBatismo` troca essa
      leitura por conclusão real de trilha, sem tocar no resto do fluxo.

  Implementado: migração 110 (`sql/migrations/110_trilhas_formacao.sql`),
  `shared/trilhas.js` (lógica pura + banco), `GestaoTrilhas`
  (`/api/trilhas/...`), evolução de `shared/certificados.js` (o certificado da
  v6.5 ganhou código, validade, selo e revogação), `VerificarCertificado`
  (rota **pública**), `CertificadoQr` e QR no PDF, e os encaixes em seis
  fluxos. Frontend: aba "Formação" (módulo novo), "Minha Formação" no Meu
  Painel, a página pública `app/verificar.html` e as telas de certificado da
  EBD estendidas (código, situação, revogar, QR na impressão).

  **O que é (e o que não é) uma trilha.** `Trilhas` → `TrilhaModulos`, com
  pré-requisito entre módulos (da mesma trilha e de ordem menor — sem ciclo
  por construção) e entre trilhas ("Dirigente" exige "Discipulado"; ciclo
  direto ou indireto é recusado). O papel (`PapelAlvo`) é só um rótulo.
  **A migração não semeia nenhuma trilha nem módulo**: o conteúdo curricular
  é decisão da igreja, e inventar um currículo de diácono ou de tesoureiro
  aqui seria chutar. A entrega é a máquina, vazia e pronta.

  **Progresso é sempre calculado, nunca digitado.** `calcularProgresso`
  deriva de módulos, pré-requisitos e conclusões: cada módulo é `CONCLUIDO`,
  `DISPONIVEL` ou `BLOQUEADO` (dizendo qual módulo falta); módulo opcional
  não conclui a trilha; módulo desativado sai do cálculo e deixa de travar
  quem dependia dele; trilha sem módulo obrigatório não aceita matrícula.
  Quem registra a conclusão de um módulo é quem tem a permissão (não existe
  autoinscrição nem prova online — isso seria um LMS, e a v8.7 já trata o
  seminário como sistema acadêmico). Ao concluir o **último módulo
  obrigatório**, a matrícula se conclui **sozinha** (status, data, validade
  calculada a partir da trilha) e o certificado é emitido, com a carga
  horária e os módulos na descrição. A matrícula não é única por pessoa e
  trilha (há renovação); única é a **em andamento** — índice filtrado, a
  mesma lição da Trava 6-A.

  **Validade e situação (itens 4 e 5 do checklist de educação continuada).**
  `Trilhas.ValidadeMeses` (vazio = não vence) e `AvisoDias` (padrão 60). A
  situação — `EM_ANDAMENTO`, `VIGENTE`, `VENCENDO`, `VENCIDA`, `REVOGADA`,
  `CANCELADA` — é **calculada na leitura**, sem job, como a habilitação de
  voluntário (v5.7). No próprio dia da validade o certificado ainda vale; no
  dia seguinte vence; 31/jan + 1 mês dá 28/fev (teto do mês). Vencendo
  **cumpre o requisito, mas avisa**; vencida, revogada ou cancelada **não
  cumpre**. Quem renova abre nova matrícula (só dá se a anterior não estiver
  vigente): vale a melhor matrícula da trilha, e a antiga sai das pendências.
  O vencimento aparece como pendência em três lugares: a lista
  "Pendências de validade" (por escopo territorial), o aviso em "Minha
  Formação" e uma notificação do motor da vB.2 (regra `FORMACAO_VENCENDO`, um
  detector e uma linha de dado): o aviso "vence em N dias" e o "venceu" são
  fatos distintos — o segundo usa o id da matrícula **negativo** como chave de
  deduplicação, já que a deduplicação de `criarNotificacao` deixa passar um
  aviso por chave.

  **Requisitos: onde a formação é exigida (itens 2 e 4).** `TrilhaRequisitos`
  diz "esta trilha, vigente, é exigida neste contexto", com modo `BLOQUEIA`
  (impede) ou `ALERTA` (só avisa — "não bloqueia culto, mas bloqueia escala
  onde a norma exigir"). **Nasce vazio: enquanto ninguém configurar, nenhum
  fluxo muda** — e isso foi conferido fluxo a fluxo (cada um passa sem
  requisito e só então passa a exigir). Seis contextos, um quadro só em vez
  de uma coluna nova em cada tabela:

  | Contexto | Alvo | Onde é aplicado |
  | --- | --- | --- |
  | `CONSAGRACAO` | nome do tipo (o "Assunto") | `CriarConsagracao` e **cada** `AVANCAR` de `EvoluirConsagracao` |
  | `LIDERANCA` | Id do papel | nomeação, troca de papel e renovação de mandato (individual e em lote) |
  | `HABILITACAO_TREINAMENTO` | — | etapa TREINAMENTO da habilitação de voluntário (v5.7) |
  | `BATISMO_DISCIPULADO` | — | item IV da aptidão de batismo (vB.11) |
  | `ESCALA_EQUIPE` | Id da equipe | sugestão do auto-escalador, convite em cadeia e troca |
  | `EBD_PROFESSOR` | — | designação de professor de turma |

  Decisões finas: (1) a consagração é **reavaliada a cada avanço**, não só no
  protocolo — um certificado que vence ou é revogado no meio do processo
  trava a etapa seguinte (`REPROVAR` nunca é bloqueado); a esteira v8.3 ainda
  não existe, então o encaixe é na esteira atual (`CriarConsagracao`/
  `EvoluirConsagracao`), e a v8.3 só precisa chamar o mesmo
  `avaliarRequisitos`. (2) Na liderança, só trocar a **senha** de quem já tem
  o mesmo papel **não** reavalia a formação: redefinir senha não pode ficar
  preso a um certificado vencido. (3) No batismo, com trilha configurada a
  atestação manual deixa de valer **e** a rota que a grava passa a recusar
  (ninguém marca algo que o cálculo ignora); sem trilha, segue manual, dito
  no retorno. (4) Requisito **não é retroativo**: quem já leciona, já é líder
  ou já está na escala não é removido — a regra vale para a próxima
  designação, nomeação ou avanço. (5) Escala: quem não cumpre requisito
  `BLOQUEIA` sai da sugestão e do convite em cadeia; em modo `ALERTA` ninguém
  sai.

  **Certificado verificável (item 3).** O certificado é o **mesmo** da v6.5
  (`CertificadosEmitidos`, migração 110 só acrescenta colunas): o manual da
  EBD também passa a ter código, e os já emitidos ganharam um na migração
  (hexadecimal de 16 caracteres, sem selo — a verificação os marca
  `SEM_SELO`). O **código** (16 caracteres de um alfabeto sem I, O, 0 e 1,
  ~80 bits) é um segredo portador: quem tem o código confere sem login;
  ninguém lista nem adivinha certificados. O **selo de integridade** é um
  hash de código, titular, título, data e validade, recalculado a cada
  verificação: se alguém alterar a validade ou o titular direto no banco, a
  verificação acusa `INTEGRIDADE_FALHOU` **sem exibir nenhum dado do
  registro**. A **revogação** (anti-fraude/erro de emissão; exige motivo)
  mantém o certificado baixável, mas o PDF leva a tarja "REVOGADO" e a
  verificação diz `REVOGADO`; revogar também tira o valor da formação como
  requisito. `ebd_gestao` ou `trilhas_gestao` revogam.

  **Verificação pública** (`GET /api/verificacao-certificado/{codigo}` e a
  página `verificar.html`, que o QR abre): responde `VALIDO`, `VENCIDO`,
  `REVOGADO`, `INTEGRIDADE_FALHOU` ou `NAO_ENCONTRADO`. **Privacidade:** só o
  que já está impresso no certificado (nome, título, protocolo, datas) — nunca
  matrícula, congregação, quem emitiu nem o motivo da revogação. "Não
  encontrado" e "código de formato inválido" respondem o mesmo 404 (a rota
  não serve de oráculo de formato); sem cache e sem indexação. A página é
  autônoma (não carrega o app, sem cookie nem armazenamento local, e só usa
  `textContent`), e o service worker **não a intercepta** — senão a URL, que
  carrega o código, ficaria guardada no cache de um aparelho compartilhado.
  **O mecanismo é definido aqui para a credencial ministerial (v8.4)
  reaproveitar**: o texto do README falava em "mesmo mecanismo da v8.4", mas
  a v8.4 ainda não existe, então foi esta versão que o criou (código, selo,
  `certificadoQr.js` e a rota pública).

  **QR:** matriz calculada pela biblioteca `qrcode` (MIT — nova dependência
  de `api/`; só o cálculo, nada de PNG) e desenhada em **vetor**, no PDF
  (pdfkit) e em SVG para a impressão do navegador (`CertificadoQr`, mesmo
  modelo de autoatendimento do PDF: só a própria matrícula — desde a Trava 6-B,
  com login). O QR carrega apenas a URL pública com o código.

  **Permissões.** `trilhas_gestao` (nova, nunca concedida a papel nenhum). Em
  duas camadas: **catálogo e requisitos** mudam a regra da igreja inteira e
  exigem **escopo global** (um secretário local com a permissão não cria
  requisito que trava a consagração de todo mundo); **matricular, registrar
  conclusão, cancelar, reemitir certificado e ver a formação de alguém** exigem
  só que a pessoa esteja no escopo de quem age (membro sem congregação só por
  escopo global). Ler o catálogo e a **própria** formação é aberto a qualquer
  login.

  Testado com `npx jest`: 62 testes novos (39 em `trilhas.test.js` — catálogo,
  pré-requisitos sem ciclo, progresso, validade, situação, requisitos —, 20 em
  `certificadosVerificaveis.test.js` — código, selo, verificação pública,
  revogação, QR — e 3 no `batismo.test.js`, que também teve os testes antigos
  ajustados: a aptidão agora consulta os requisitos de trilha) — suíte
  completa em 656/656 (42 suítes; era 594/40).

  **Verificado contra banco de verdade (30/09).** Mesmo método da v6.8 (roteiro
  descartável, não versionado, contra `ieadespa-homolog`, dados fictícios
  removidos no fim): a migração 110 aplica em 21 batches e **153 verificações
  passaram** — backfill dos certificados antigos pelo próprio arquivo da
  migração; catálogo e pré-requisitos (inclusive ciclo e escopo global);
  matrícula, conclusão e emissão automática; **duas requisições simultâneas
  para o último módulo geram exatamente 1 conclusão e 1 certificado** (e nenhum
  erro 500); reparo de matrícula concluída sem certificado; verificação pública
  em todos os estados, incluindo o selo quebrado por adulteração direta na
  tabela; revogação no meio de uma consagração; vencendo → vencida → renovação
  (inclusive com o pré-requisito revogado e refeito); pendências e detector de
  notificação; e **cada um dos seis encaixes, com e sem requisito** (o "sem"
  prova que nada muda). As funções de renderização do front rodaram num DOM
  simulado com o JSON da API, junto com a página pública: 59 verificações,
  incluindo o escape de HTML. **Em produção:** a 110 foi aplicada pelo deploy
  do commit `61b8394`; `verificar.html` responde 200; a verificação pública
  responde o mesmo 404 (`NAO_ENCONTRADO`, `Cache-Control: no-store`,
  `X-Robots-Tag: noindex`) para código inexistente e de formato inválido — a
  consulta à coluna nova sem erro confirma a migração —; as 10 rotas
  protegidas testadas sem sessão respondem `401` (nenhuma `404`) e a rota do
  QR existe.

  **Registrado, não construído, por decisão:**

  - Conteúdo curricular: nenhuma trilha é semeada (ver acima).
  - Não há upload de comprovante nem nota por módulo: a conclusão é um registro
    de quem tem permissão. A v8.7 trata o lado acadêmico.
  - A rota pública não tem limite de taxa (não existe utilitário no `api/`, e
    estado em memória não serve em Functions com várias instâncias); o código de
    ~80 bits torna a enumeração inviável. Para revisar na Trava 6-B, junto com o
    custo de consultas anônimas ao banco. **Na Trava 6-B:** limite por origem,
    por instância (30/min).
  - A validade operacional mora na matrícula; o selo protege o que a
    verificação pública mostra. Quem tem escrita direta no banco pode mexer na
    matrícula — o mesmo que já vale para o resto do sistema.
  - A notificação de vencimento vai para quem tem `trilhas_gestao`, sem filtro
    territorial (como os demais detectores da vB.2); o filtro por escopo está na
    tela de pendências.
  - O nome do titular aparece a quem tiver o código (é o que está impresso no
    papel); retenção e anonimização de certificados entram na Trava 6-B. **Na
    Trava 6-B:** retenção indeterminada, registrada em PoliticasRetencao e no
    ROPA.

## v6.10 — Sala de aula assistida e material *(7ª rodada)*

- [x] Chamada pelo celular do professor, offline-first (a sala de EBD muitas
      vezes não tem sinal) — sincroniza quando volta a conexão.
- [x] Plano de aula e material de apoio por lição, publicado pelo
      Superintendente e visível ao professor no mesmo lugar da chamada.
- [x] Alerta de aluno ausente há N domingos direto pro professor — a evasão na
      EBD é o primeiro sinal de afastamento (conecta com v7.11).
- [x] Pedido de revistas calculado a partir da matrícula real por classe
      (v6.6 prevê o pedido; aqui ele deixa de ser chute do superintendente).

  Fecha a FASE 6 em cima do que ela já tinha: migração 111
  (`sql/migrations/111_ebd_sala_assistida.sql`), `shared/ebdSalaAula.js`
  (lógica pura + banco), a Function nova `GestaoEbdSalaAula`
  (`/api/ebd-sala/...`), duas ações novas em `GestaoEbdChamada`
  (`offline/pacote` e `sincronizar`), uma em `GestaoEbdRevistas`
  (`pedidos/sugestao`), o detector `EBD_ALUNO_AUSENTE` no motor da vB.2 e, no
  front, a seção "📴 Sala de aula (v6.10)" da aba EBD e uma **tela própria de
  chamada offline**.

  **Chamada offline (item 1).** Com internet (em casa, na véspera), o professor
  baixa a turma para o aparelho; o pacote tem **só o id e o nome** de cada aluno
  ativo — nunca matrícula, contato ou nascimento —, a lição do dia se já existir
  (com o que já foi marcado) e os planos publicados. No domingo, a tela "📴
  Chamada da EBD" abre **sem login e sem rede**: a sessão do painel fica no
  `sessionStorage` e morre quando o celular fecha o app, então o pacote e a fila
  de marcações moram no `localStorage` daquele aparelho, e a tela aparece como
  link na Portaria e no login sempre que houver turma baixada. Cada toque em
  ✅/❌ grava na fila (remarcar o mesmo aluno substitui); visitante entra com uma
  chave gerada no aparelho. O envio (`POST /api/ebd-chamada/sincronizar`, um lote
  por turma e domingo) acontece sozinho quando a conexão volta e há sessão, ao
  entrar no painel, ou no botão "Enviar agora". A fila **nunca se apaga
  sozinha**: um item só sai quando o servidor confirma — e só se não tiver sido
  remarcado durante o envio. Pacote sem pendência some depois de 30 dias (nome
  de criança não fica guardado sem uso), e há um botão para apagar tudo do
  aparelho.

  As regras do servidor, todas em `shared/ebdSalaAula.js`: a data não pode ser
  futura nem ter mais de 30 dias (atraso maior vai pela tela normal); "hoje" é o
  de Brasília (as Functions rodam em UTC). **Sem lição naquele domingo, a
  sincronização abre a lição** — quem marcou é professor ativo da turma (ou
  gestor no escopo, a mesma permissão de lançar chamada da v6.2), e abrir a lição
  só existe para permitir a chamada; a auditoria registra a origem
  (`SINCRONIZACAO_OFFLINE`). **Lição fechada** devolve o lote inteiro (409) e ele
  fica guardado até alguém reabrir. **Conflito:** se a presença no servidor foi
  marcada *depois* da marcação do aparelho e diz outra coisa, vale o servidor —
  um celular que ficou dias sem rede não desfaz a correção de quem administra; a
  pessoa vê o aviso. A "hora" do servidor é a da marcação no aparelho
  (`EbdChamadas.MarcadoOfflineEm`) quando a linha veio de outro celular, senão a
  da última alteração; um lançamento online zera `MarcadoOfflineEm`. O relógio
  adiantado do aparelho é limitado ao "agora" do servidor. Reenviar o mesmo lote
  não duplica: a presença tem chave natural (lição, aluno) e o visitante tem
  `ChaveCliente`, com **índice único filtrado** (a mesma armadilha do `NULL` que
  a Trava 6-A achou). Dois envios simultâneos da mesma fila (rede que cai e
  volta) terminam com uma lição, um visitante e nenhum erro 500. Item ruim
  (aluno que saiu da turma, status inválido) é recusado sozinho, com o motivo,
  sem derrubar o resto. Cada presença passa pelo mesmo `registrarPresencaAluno`
  da v6.2 (auditoria e motor de conquistas incluídos), e o lote ganha uma linha
  de resumo na auditoria, só com contagens.

  O service worker continua sem cachear `/api/` (a chamada offline não passa por
  ele); ele mudou em dois pontos: o cache virou `v2`, e só uma navegação cai no
  `index.html` quando não há rede — antes, um script de CDN sem cache recebia o
  HTML no lugar.

  **Plano de aula e material (item 2).** `EbdPlanosAula` + `EbdPlanoMateriais`.
  **Não usa `EbdLicoes`:** a lição nasce por congregação quando alguém abre a
  chamada, e o plano precisa existir antes do domingo — e, na revista CPAD, é o
  mesmo para o campo inteiro. Por isso o plano é **por data**, com alcance:
  congregação (vazia = **campo inteiro**, que exige escopo global para criar,
  editar ou publicar — o mesmo critério do catálogo de trilhas da v6.9) e faixa
  etária (vazia = todas as classes; comparada sem acento nem maiúscula, como a
  "revista vigente" da v6.8). Rascunho → publicado; o professor vê **só o
  publicado** que se aplica à turma, o mais específico primeiro (congregação +
  faixa > congregação > faixa > campo), na própria seção da chamada e dentro da
  tela offline (o pacote leva o plano). Data, alcance e faixa não mudam depois de
  criado — mudar o alcance é criar outro plano, e isso fecha o atalho de
  "editar" um plano local para virar do campo. **Material é link `https`**
  (revista, vídeo, slides), conferido no servidor e por um `CHECK` no banco —
  `javascript:`, `data:` e `http` em claro nunca entram; o front só monta o link
  se ele começar com `https://`. Sem upload: o material já mora em algum lugar,
  e guardar arquivo aqui seria custo de armazenamento sem ganho.

  **Alerta de ausência (item 3).** "Ausente" segue a definição da caderneta
  (v6.8): num domingo em que a turma teve chamada, quem não está presente está
  ausente — marcado ausente ou nem marcado. Conta-se do domingo mais recente para
  trás até a última presença; domingos antes da entrada do aluno na turma não
  contam (a referência é a data mais recente entre a matrícula e a última
  alteração dela — a transferência não guarda histórico, e isso evita acusar
  falta de quem acabou de chegar; o custo, no pior caso, é atrasar o alerta). N
  vem do catálogo de Prazos (sigla `EBD_AUSENCIA_DOMINGOS`, padrão **3**,
  editável na tela de Catálogos — nessa linha a coluna "Dias" guarda domingos,
  dito no próprio nome). Duas saídas: a lista "⚠️ Alunos ausentes" na aba EBD
  (professor da turma ou gestor no escopo) e o aviso no sino. O motor da vB.2
  ganhou uma coisa só: **um fato pode trazer os próprios destinatários** — o
  aviso vai para os **professores ativos daquela turma**, não para quem tem uma
  permissão (`PermissaoAlvo` NULL; turma sem professor não gera aviso, só aparece
  na lista). A chave da notificação é a **sequência de faltas**
  (`EbdAlertasAusencia`, única por aluno e primeira falta): a mesma sequência
  avisa uma vez, por mais que a rotina diária rode; se o aluno volta e some de
  novo, avisa de novo. Aluno não-membro entra no alerta como qualquer aluno.

  **Pedido de revistas pela matrícula (item 4).** "💡 Calcular pela matrícula"
  (`GET /api/ebd-revistas/pedidos/sugestao`) parte dos **alunos ativos e
  professores ativos** da turma e das revistas ativas do catálogo do trimestre
  na **mesma faixa etária** da turma: edição do aluno = nº de alunos; edição do
  professor (nome com "mestre" ou "professor(a)" — o catálogo não tem coluna para
  isso) = nº de professores; sem edição do professor, o professor entra na conta
  da do aluno. Preenche os itens, que continuam editáveis, e avisa o que não
  fecha (turma sem faixa etária, nenhuma revista da faixa, mais de uma edição,
  turma sem aluno ativo). O pedido passa a guardar a **foto da matrícula** no
  momento em que é criado (`MatriculadosNoPedido`, `ProfessoresNoPedido` —
  calculados no servidor, nunca vindos do cliente), e a lista da turma e o
  consolidado mostram "pedido x matrícula" (ex.: "25 revistas para 20 na
  matrícula (+5)"). Pedido anterior à v6.10 aparece como "sem foto da matrícula".

  **Permissão:** nenhuma nova — `ebd_gestao` (v6.1) e o professor ativo da turma,
  como o resto da FASE 6.

  Testado com `npx jest`: 35 testes novos (26 em `ebdSalaAula.test.js` — lote
  offline, conflito, plano, link seguro, alcance, sequência de ausências —, 7 em
  `ebdRevistas.test.js` — sugestão pela matrícula — e 2 em
  `notificacaoMotorDestinatarios.test.js` — destinatários por fato) — suíte
  completa em 691/691 (44 suítes; era 656/42). `node --check` em todos os `.js`
  novos e alterados; no front, os 39 `getElementById` literais do código novo
  têm id no HTML e todo handler inline aponta para função que existe.

  **Verificado contra banco de verdade (30/09).** Mesmo método da v6.8/v6.9
  (roteiro descartável, não versionado, contra `ieadespa-homolog`, dados
  fictícios removidos no fim): a 111 aplica em 11 batches e **82 verificações
  passaram** — pacote offline (só id e nome, `no-store`, permissões);
  sincronização abrindo a lição, reenvio sem duplicar, conflito com correção
  online (e a marcação mais nova vencendo), aluno encerrado recusado sozinho,
  data futura/velha, turma alheia, sem sessão, lição fechada (409 sem gravar
  nada) e **dois envios simultâneos** (1 lição, 1 visitante, nenhum 500); índice
  único filtrado e `CHECK` de https no banco; plano de aula com alcance, escopo
  global, publicação, ordem, material e exclusão; ausência (sequência, N lido de
  Prazos, detector com destinatário = professor, **uma notificação** mesmo com o
  motor rodando duas vezes, gestor sem o aviso, presença zerando a sequência);
  sugestão e foto da matrícula no pedido e no consolidado. As funções do front
  rodaram com o `script.js` inteiro num DOM simulado: **36 verificações** —
  tela offline sem login, fila (remarcar substitui; nada sai sem confirmação;
  409 e 401 mantêm; remarcação durante o envio não se perde), descarte, pacote
  vencido, escape de HTML em todo nome e título, link `javascript:` recusado.

  **Achado ao verificar, corrigido na Trava 6-B:** a auditoria de uma presença
  **nova** nunca foi gravada desde a v6.2 — o código passava `RegistroId` nulo, a
  coluna não aceita, e a falha é engolida de propósito (auditoria é fail-soft).

  **Registrado, não construído, por decisão:**

  - Enviar a fila exige sessão: quem marcou sem login precisa entrar no painel
    (matrícula + código ou senha) para a chamada chegar. Não existe "token de
    longa duração só para a chamada" — seria uma credencial a mais guardada no
    aparelho.
  - A tela offline mostra o plano guardado com a turma; um link de material
    precisa de internet para abrir.
  - O alerta de ausência vai para o sino (e por e-mail, como as outras regras);
    push fica desligado nesta regra (`CanalPush` padrão 0), porque a mensagem
    tem o nome do aluno e apareceria na tela bloqueada.

## 🔒 Trava de Revisão 6-B — antes de encerrar a FASE 6 e avançar para a FASE 7

- [x] Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da
      seção 3). Auditadas v6.8 a v6.10 pelas 5 perguntas do checklist
      (30/09), com varredura final na FASE 6 inteira. A v6.10 ainda não
      existia quando a trava foi chamada; como o texto da trava manda auditar
      v6.8 a v6.10, ela foi construída antes (commit `a462011`). Correções no
      commit `bc913cd` + migração 112.

  **1. Todo código novo roda de ponta a ponta contra o ambiente real?** Sim,
  com um achado que nenhum teste pegava: **a auditoria de toda linha NOVA da
  EBD nunca foi gravada.** `registrarPresencaAluno` (v6.2),
  `registrarRespostaAluno` (v6.3), o salvar da caderneta e o fechamento
  trimestral (v6.8) passavam `RegistroId` nulo quando a linha era nova (a
  importação passava nulo sempre). A coluna não aceita nulo, e a auditoria
  engole a falha de propósito (é fail-soft). Ninguém percebeu porque a
  operação em si dava certo. Apareceu na verificação da v6.10 contra a
  homologação: 11 falhas de auditoria por rodada. Corrigido com `OUTPUT
  INSERTED` (lote usa `0`, a convenção de `ImportarPessoas`). Na rodada
  seguinte foram zero. As 112 migrações reaplicam na homologação sem erro
  (idempotência testada de novo); a 111 e a 112 foram aplicadas em produção.
  As **106 rotas de ação** das 10 Functions da FASE 6, mais PDF, QR e a rotina
  diária, foram testadas uma a uma em produção, sem sessão: todas `401`,
  nenhuma `404` (é a lição da 6-A: testar cada ação, não só a raiz). Suíte
  completa: 703/703 (45 suítes). Achado da varredura: **todo "hoje" da FASE 6
  era o dia do servidor**, que roda em UTC. Das 21h à meia-noite de Brasília o
  sistema já estava no dia seguinte, com estes efeitos:
  - um certificado que vale "até hoje" aparecia vencido 3 horas antes;
  - a idade do aluno menor virava na véspera;
  - a carência do fechamento andava um dia.

  Agora tudo passa por `shared/dataBrasilia.js`.

  **2. Toda tela nova abre e mostra dado de verdade?** Checagem sistemática:
  os 1736 `getElementById` literais (1114 ids distintos) foram conferidos
  contra os 1257 ids do HTML, os 68 criados pelo JS e os 72 prefixos
  dinâmicos. Só apareceram os 2 falsos positivos de sempre (`caixaSino`,
  `permissaoEscopoTodas`), e todo handler inline aponta para função global. No
  DOM simulado com o `script.js` inteiro rodaram 36 verificações da v6.10 e 8
  da trava. **Achado de tela: XSS armazenado em 47 pontos**, todos corrigidos
  com `escaparHtmlEbd`:
  - 21 mensagens do servidor que voltavam para o `innerHTML`, algumas
    repetindo o nome digitado;
  - 26 campos digitados: congregação nos `<select>`, turma, faixa etária,
    professor, título e enunciado de atividade (texto do professor rodando na
    tela do gestor), revista, área/congregação/turma do consolidado e da visão
    agrupada, e a descrição do lançamento financeiro;
  - e as **Conquistas**: ícone, nome e descrição aparecem em "Minhas
    Conquistas" para **todo membro**, além do ranking, dos tipos de evento e
    das regras.

  **3. README e código continuam narrando a mesma coisa?** Divergências
  corrigidas no código:
  - **Certificado.** A v6.9 diz que "ninguém lista nem adivinha
    certificados", mas o PDF e o QR eram anônimos, guardados só por
    `certificadoId` + matrícula — dois números sequenciais. O PDF traz o
    código de verificação, então dava para enumerar códigos. A 6-A tinha
    aceitado o modelo do `CartaPdf` antes de o certificado carregar um código
    secreto. Agora PDF e QR **exigem login**: o titular baixa o próprio, e a
    gestão só o de quem está no seu escopo. No front, o PDF vem por
    `fetchProtegido` e o QR entra como `data:` URL, porque um `<img>` não manda
    o token.
  - **`GestaoCertificados` não conferia escopo.** Um gestor local emitia,
    listava e **revogava** certificado de qualquer membro da igreja.
    Revogar tira a formação como requisito e trava consagração, liderança e
    escala em outra congregação. Agora o titular precisa estar no escopo
    (`certificados.gestorAlcancaMembro`).
  - **Requisito de consagração** comparava o alvo com `===`. Um requisito
    "Consagração a Diácono" não valia para "consagração a diácono", e o
    assunto pode ser texto livre: o `BLOQUEIA` simplesmente não se aplicava.
    A comparação passou a ignorar maiúscula, acento e espaço repetido.
  - **Validade da trilha** contava do dia do registro. Um módulo lançado com
    data retroativa ganhava meses de certificado. Agora a validade conta da
    data do último módulo obrigatório.
  - **Importação de caderneta antiga** sobre uma lição **aberta** criava uma
    caderneta IMPORTADA que escondia a chamada lançada depois. Agora é
    recusada, e o trimestre já fechado gera aviso para refazer o fechamento.

  Corrigido só no texto:
  - a v6.8 chamava de "fluxo de exclusão" o `ExcluirDados`, que é o reset de
    dados fictícios (o fluxo do titular é `ExecutarExclusaoLGPD`);
  - na v6.5 e na v6.9, PDF e QR agora dizem "com login";
  - os itens deixados "para a Trava 6-B" na v6.8 e na v6.9 estão marcados como
    resolvidos.

  Números de teste de v6.8 a v6.10 (61/62/35; totais 594 → 656 → 691)
  conferem com o código. As referências cruzadas da v6.10 (v6.6, v6.8, vB.2,
  v7.11) apontam para seções que existem.

  **4. O que ficou pra trás foi de fato corrigido, não só anotado?**
  Nenhum `TODO`/`FIXME` na FASE 6. As quatro pendências que a v6.8 e a v6.9
  deixaram para esta trava foram resolvidas:
  - **LGPD de quem não é membro.** Aluno não-membro e visitante não têm
    matrícula de membro, então não abrem solicitação pelo portal. Três peças
    resolvem:
    - o Encarregado (`protecaodedados`, nunca `ebd_gestao`) busca por nome e
      anonimiza, em "Proteção de Dados → EBD", pelas rotas
      `ebd-turmas/lgpd/*` de `shared/ebdLgpd.js`;
    - a rotina diária da EBD anonimiza sozinha o visitante com mais de 12
      meses e o não-membro com matrícula encerrada há mais de 24;
    - a regra está em `PoliticasRetencao` (migração 112) e no ROPA (entradas
      `EBD` e `FORMACAO`).

    Anonimizar não apaga a linha, e a contagem da chamada e da caderneta
    continua batendo. A auditoria guarda só ids.
  - **Escape geral da aba EBD:** feito (pergunta 2).
  - **Limite de taxa na verificação pública:** limite por origem, por
    instância das Functions (30 por minuto), com o IP guardado só como hash.
    Ao vivo, a 31ª verificação seguida recebe `429` com `Retry-After`. Um
    limite global de verdade exige borda paga (Front Door/WAF) e fica
    registrado como decisão.
  - **Retenção de certificados:** indeterminada enquanto o certificado puder
    ser apresentado (é prova de formação exigida pelos fluxos), registrada com
    a razão no catálogo.

  Outros achados, também corrigidos:
  - **A vacância** (Carta de Mudança, desligamento, abandono, disciplina,
    licença de candidatura) não tocava a EBD: quem saía continuava professor
    ativo. Agora lecionar sai junto com as outras funções. A matrícula de
    aluno só se encerra quando a pessoa deixa a igreja: disciplina e licença
    de candidatura tiram o mandato, não o direito de estudar.
  - **`ExecutarExclusaoLGPD`** gravava na auditoria encadeada o telefone, o
    e-mail e o endereço "de antes", ou seja, guardava para sempre exatamente o
    que a exclusão apagou. Agora registra só quais campos estavam preenchidos.
  - **O nome do visitante** ia para a auditoria (v6.2). Agora vão só ids.
  - **Dois "vincular a membro" simultâneos** davam erro 500 no índice único.
    Agora um passa e o outro recebe uma recusa clara.

  **Verificado contra a homologação:** 47 verificações das correções, sem
  falha, com o mesmo método das versões (roteiro descartável, dados fictícios
  removidos no fim). O roteiro da v6.10 também foi reexecutado: 82 de 82.

  **Fica registrado, não corrigido, por decisão:**
  - Matriculados de lições fechadas antes da v6.8 seguem sem foto, como a
    v6.8 descreve.
  - Vincular um não-membro a um membro não exige o membro no escopo de quem
    vincula, igual à matrícula: membro de outra congregação pode estudar na
    EBD daqui.
  - Na caderneta, escopo vazio continua sendo "não vê nada", o lado
    restritivo, coerente com `auth.estaNoEscopo` para lista vazia.

  **Fora da FASE 6, achado na varredura e levado ao responsável:**
  - `ExcluirDados` (`POST /api/dados/excluir`, permissão `permissoes`) é o
    reset de dados fictícios da época do mock. Nenhuma tela o chama, e com
    dado real ele faria `DELETE` de verdade, por categoria. A categoria
    "pessoas" hoje falha por chave estrangeira e desfaz tudo; outras
    categorias, como reuniões, apagam tabelas inteiras.
  - O `CartaPdf` (vB.6) continua anônimo com id + matrícula. Ele não carrega
    código de verificação, mas é o mesmo padrão que esta trava fechou no
    certificado.

  **5. Deploy real, de ponta a ponta, aconteceu?** Sim, nos dois commits
  (cada um terminou com "Deployment Complete"):

  | Commit | Run | Testes | Migração |
  | --- | --- | --- | --- |
  | v6.10 (`a462011`) | `36797959217` | 691 | 111, em 11 batches |
  | correções (`bc913cd`) | `36800434890` | 703 | 112, em 3 batches |

  Conferido ao vivo, sem sessão:
  - as 106 rotas de ação da FASE 6 respondem `401`;
  - `verificar.html` responde 200;
  - a verificação pública responde 404 com `no-store`/`noindex`, e `429` na
    31ª chamada seguida;
  - o service worker `v2` está no ar.

  **FASE 6 encerrada.** v6.1 a v6.10 foram entregues e auditadas em 2 travas
  (6-A e 6-B), com deploy real confirmado em cada uma. Avança para a FASE 7.
