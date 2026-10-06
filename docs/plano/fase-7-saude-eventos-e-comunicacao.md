# FASE 7 — Saúde, Eventos e Comunicação

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

## v7.1 — PSC (Programa de Saúde Congregacional)

- [x] Avaliação anual obrigatória por congregação (Reg. Art. 127-129).
- [x] 5 Sinais Vitais: financeiro, estrutura física, ensino/doutrina,
      frequência/capital humano e expansão/missionalidade — os nomes do
      Art. 128 (o rótulo antigo deste item, "espiritual, evangelismo,
      reprodução", não era o do Regimento).
- [x] "Escada Bloqueada" (nível superior exige nível anterior completo).
- [x] Classificação: Em Desenvolvimento (N1-3) / Referência (N4-5).
- [x] Rebaixamento compulsório: 2 anos reprovado no N1 → vira Extensão da
      Tenda (o sistema **propõe**, a CLI **decreta** — ver abaixo).
- [x] Perda de autonomia (caixa recolhido, diretoria dissolvida) no rebaixamento.

  Abre a FASE 7 com: migração 113 (`sql/migrations/113_psc_saude_congregacional.sql`),
  `shared/psc.js` (a Escada Bloqueada, a esteira e a reclassificação),
  `shared/pscApuracao.js` (sugestões a partir de dados que o sistema já tem), a
  Function nova `GestaoPsc` (`/api/psc/...`, 21 ações), quatro regras no motor
  de notificações da vB.2, duas travas no caixa local (`GestaoSaidas` e
  `GestaoParametrosTesouraria`), a entrada `PSC` no ROPA e, no front, o módulo
  "🩺 Saúde Congregacional (PSC)".

  **Catálogo (item 2).** Os 5 Sinais Vitais e as **57 alíneas** do Art. 128
  (§§1º a 5º, uma linha por alínea) são **semeados** pela migração, mas moram no
  banco (`PscSinaisVitais`, `PscCriterios`) como catálogo editável — a CLI cria,
  reescreve e desativa critério sem tocar em código (configurabilidade total,
  seção 2.1). O "Bloqueio" que o Regimento descreve ("risco elétrico reprova no
  Nível 1") fica na coluna `Orientacao` da alínea correspondente. Ao ser aberta,
  cada avaliação **copia** os critérios vigentes para `PscRespostas` (código,
  texto, orientação): mudar o catálogo depois vale só para as próximas, nunca
  reescreve uma avaliação já feita.

  **A Escada Bloqueada (itens 3 e 4).** O nível **nunca é digitado**; é calculado
  das respostas (funções puras em `shared/psc.js`). Em cada Sinal, do degrau 1 ao
  5: todas as alíneas atendidas = **completo** e sobe; uma alínea não atendida =
  **reprovado** e a escada para ali; alínea ainda sem resposta = **em aberto**.
  Os degraus acima do primeiro que parou ficam **bloqueados** e **não precisam
  ser respondidos** (não valem nada enquanto o de baixo não for vencido; ao
  vencê-lo, o seguinte destrava). Um degrau cheio acima de um reprovado não conta.
  Três leituras do Regimento que ele não resolve sozinho, registradas como
  decisão:
  - **Nível da congregação = o do Sinal mais fraco.** O Art. 128 define o nível
    de cada Sinal, mas não diz como juntar os cinco; como a escada é "integral e
    cumulativa", vale a leitura mais estrita. Muda numa linha
    (`consolidarSinais`) se a CLI quiser outra regra.
  - **Reprovada no Nível 1 = qualquer Sinal** com alínea do Nível 1 não atendida
    (cada Sinal tem o seu "Bloqueio" no Nível 1: §1º, I, a; §2º, I, d; §3º, I,
    c; §4º, I, c; §5º, I, c).
  - **Classificação** (Art. 129 §1º): nível 1 a 3 = Congregação em
    Desenvolvimento; 4 e 5 = Congregação de Referência. Reprovada no Nível 1 não
    é nenhuma das duas.

  **Esteira e segregação de funções (item 1).** Uma avaliação por congregação e
  por exercício (ano civil), em quatro etapas feitas por pessoas diferentes
  (seção 2.7): `RASCUNHO` → `ENVIADA` (quem preencheu) → `VALIDADA` (outra
  pessoa, no escopo — tipicamente o Pastor de Área; **quem enviou não valida**)
  → `HOMOLOGADA` (a CLI diploma o exercício; **quem enviou ou validou não
  homologa**). A segregação vale também para **quem respondeu alguma alínea** (o
  preparador, ainda que outra pessoa tenha clicado em Enviar, não valida nem
  homologa) e **nega** quando a sessão não identifica quem age: nunca falha
  aberta. Devolver volta a rascunho com o motivo (gestão devolve a enviada; só a
  CLI devolve a validada). A CLI pode **reabrir** uma homologada com motivo —
  e o resultado oficial é desfeito —, salvo se o exercício sustenta uma
  reclassificação em andamento. Só na homologação o resultado é **congelado**
  (`NivelFinal`, `Classificacao`, `ResultadoSinaisJson`). O envio confere a
  `Versao` das respostas que leu — se alguém gravou uma resposta no meio, ele não
  passa por cima — e `Ciclo` conta os envios (entra na chave dos avisos, ver
  abaixo). Duas permissões novas,
  nunca concedidas por padrão: **`psc_gestao`** (abrir, responder, enviar,
  validar, no escopo) e **`psc_homologacao`** (homologar, decidir a
  reclassificação, mexer no catálogo e nos parâmetros — **escopo global**, porque
  vale para a igreja inteira). Ler (painel, avaliações) exige uma das duas.
  Evidência de uma alínea é **link `https://`** (conferido no servidor e por um
  `CHECK` no banco), como o material da EBD: guardar o arquivo aqui seria custo
  sem ganho.

  **Exercício e prazo.** O exercício é o ano civil. O PSC vale a partir do
  primeiro exercício obrigatório (**2026**, parâmetro) e não se abre exercício
  futuro. O envio vence **90 dias depois de 31/12** (parâmetro, 31/03): o painel
  mostra `em andamento`, `no prazo` ou `atrasado` — e `não se aplica` antes do
  primeiro exercício e para a unidade já rebaixada a Extensão da Tenda, que não
  tem avaliação a entregar (o painel concorda com os avisos). Prazo vencido
  **alerta, não bloqueia** (a norma torna a avaliação obrigatória, não fatal).

  **Apuração assistida.** Ao abrir a avaliação, as alíneas ligadas a uma fonte
  (`FonteAutomatica`) recebem uma **sugestão**: `CONFERE`, `NAO_CONFERE` (com os
  números) ou `SEM_DADOS`. Cinco fontes: repasses (1.2.a — fechamentos da
  tesouraria com repasse confirmado), prestação de contas (1.2.b — meses
  `COMPLETA`) — ambos só nos meses **já exigíveis**, com **um mês de folga**
  (o fechamento de setembro acontece em outubro; sem isso a sugestão ficaria
  vermelha todo começo de mês para quem está em dia) —, lições da EBD (3.1.a —
  lições **de domingo** × domingos que já passaram; a aula de hoje e a extra de
  sábado não entram na conta), diário da EBD (3.1.b — lições fechadas) e batismos
  (5.3.a — batizados no ano ÷ rol ativo em comunhão, mínimo 10% pela razão
  exata: 9,95% não arredonda para 10%). **Sugestão nunca é resposta**: não conta
  para a escada e o texto sempre diz o que o sistema **não** enxerga (a qualidade
  da nota fiscal, o feriado que justificava o domingo sem aula, se o batizado é
  fruto local ou de Carta de Mudança). Dá para atualizá-las enquanto é rascunho.

  **Reclassificação compulsória (itens 5 e 6, Art. 129 §§2º-3º).** Ao homologar
  um exercício reprovado no Nível 1, o sistema procura uma janela de **N
  exercícios seguidos** (parâmetro, padrão 2), todos **homologados** e todos
  reprovados no Nível 1 — consecutivos de verdade (um ano sem avaliação quebra a
  sequência) e mesmo se o ano anterior for homologado depois. Achou: abre uma
  **PROPOSTA** (`PscReclassificacoes`, uma em aberto por congregação — índice
  único filtrado) e avisa a CLI. **O sistema não rebaixa sozinho** — decisão: o
  texto diz que a unidade "perde automaticamente" o título, mas os efeitos
  (caixa, diretoria) são pesados demais para dispararem sem uma pessoa conferir
  a proposta; a CLI já homologou as duas reprovações, então decidir é um passo
  curto. A CLI então:
  - **decreta** (resolução + encarregado + Congregação-Mãe opcional, vazio = tutela
    da Sede): a congregação passa a `Categoria = 'EXTENSAO_TENDA'` (os membros
    **não** são movidos), a retenção local vai a **0%** (o caixa é recolhido; o
    percentual anterior fica guardado), `GestaoSaidas` passa a barrar despesa nova
    no centro de custo **local e departamental** dela e `GestaoParametrosTesouraria`
    trava a retenção, `GestaoMovimentosFundoFixo` não deixa mexer no Fundo Fixo da
    unidade, **todos os mandatos locais** (`Lideranca` com escopo
    daquela congregação) são encerrados — o encarregado tem de ser membro **ativo e
    em comunhão** e não pode ser alguém da diretoria dissolvida — e o **saldo
    local a recolher** é calculado e
    registrado (não digitado). Tudo numa transação;
  - **arquiva** a proposta, com o motivo (a congregação segue como está);
  - **restabelece** a autonomia depois — e só com uma avaliação **homologada, de
    exercício posterior**, sem reprovação no Nível 1 ("até que a unidade
    recupere os indicadores mínimos", §3º, II). Categoria, tutela e retenção
    (a anterior) voltam; **a diretoria não volta sozinha** (nova nomeação ou
    eleição em Permissões).

  **Avisos (vB.2).** `PSC_AVALIACAO_PENDENTE` (exercício encerrado, prazo vencido,
  sem envio) e `PSC_PARA_VALIDAR` vão só a quem tem `psc_gestao` **e** alcança a
  congregação (cada fato traz os destinatários, recurso da v6.10 — o motor, sozinho,
  avisaria o Pastor de uma Área sobre a congregação de outra); `PSC_PARA_HOMOLOGAR`
  e `PSC_RECLASSIFICACAO_PROPOSTA` vão a quem tem `psc_homologacao`. A chave
  de deduplicação do pendente é congregação × 10000 + ano (um aviso por
  exercício); a de "para validar" e "para homologar" leva o **ciclo** (avaliação ×
  100 + nº de envios), porque devolvida e reenviada é um fato novo — com o id
  puro, a deduplicação do motor engoliria o segundo aviso. Cada detector resolve
  os destinatários de uma congregação uma vez por rodada, e olha no máximo os 5
  últimos exercícios.

  Testado com `npx jest`: **65 testes novos** em `psc.test.js` (escada,
  consolidação, prazo, esteira e segregação nos dois sentidos, entradas, gatilho
  da reclassificação com ano faltando e homologação fora de ordem, decreto,
  escopo e limite empurrados para o SQL, apuração) — suíte completa em
  **768/768** (46 suítes; era 703/45). Antes do commit passou por uma revisão
  independente (`/code-review`, nível alto) que achou 15 pontos, todos tratados:
  os que mudam o comportamento estão descritos acima (segregação do preparador e
  fail-closed, ciclo do aviso, versão no envio, Fundo Fixo, encarregado, prazo
  fora do PSC, domingos, folga de um mês, razão exata, `ativo` booleano de
  verdade, escopo e limite no SQL, sugestão só em rascunho).

  **Verificado contra banco de verdade (01/10).** A homologação do Azure
  (`ieadespa-homolog`) recusou o IP desta máquina (firewall), e não abri regra por
  conta própria; a verificação rodou num **SQL Server 2019 (LocalDB)** com as 113
  migrações aplicadas do zero e a 113 reaplicada (idempotente; 5 sinais, 57
  critérios, 4 regras, 2 permissões). Os **handlers reais** (`GestaoPsc`,
  `GestaoSaidas`, `GestaoParametrosTesouraria`) e o SQL real rodaram por uma ponte
  descartável, **sobre um banco recriado do zero** (migrações 001 a 113):
  **197 verificações passaram**, entre elas permissão e escopo
  (401/403 em cada ação), a escada destravando, as quatro etapas com a
  segregação nos dois sentidos, devolver/reabrir, o congelamento do resultado, a
  proposta aberta só no 2º exercício seguido (e não no 1º), o decreto com todos os
  efeitos (categoria, retenção 0, três mandatos encerrados e nenhum de outra
  congregação, saldo de R$ 300 a recolher) e as travas do caixa, o arquivamento,
  o restabelecimento (recusado sem avaliação posterior, aceito com ela), o
  catálogo editável com a foto das avaliações já abertas, os detectores com
  destinatário por escopo e **zero falha de auditoria** (a lição da Trava 6-B:
  `RegistroId` nunca nulo). A primeira execução em Azure SQL de verdade é a do
  passo de migração do CI.

  **A tela (módulo "🩺 Saúde Congregacional (PSC)").** Painel do exercício (chips,
  tabela por congregação com status, prazo, os 5 Sinais, resultado, reprovações
  seguidas "X de N" e as ações), a avaliação com a **escada desenhada degrau a
  degrau** (✅ completo, ❌ reprovado, 🟡 em aberto, 🔒 bloqueado — alínea de degrau
  bloqueado aparece esmaecida e sem campo), a sugestão do sistema ao lado de cada
  alínea, resposta com observação e link de evidência, salvar só o que mudou (em
  lotes de 200), os botões de cada etapa conforme o estado e a permissão, as
  reclassificações com decretar/arquivar/restabelecer, o histórico da congregação
  e o catálogo/parâmetros (a CLI cria, edita e desativa critério). Todo texto do
  servidor passa por `escaparHtmlEbd`; evidência só vira link se for `https://`.
  Conferido com o `script.js` inteiro num DOM simulado: **24.740 verificações**,
  110 atribuições de `innerHTML` varridas, 4.974 handlers `on*` apontando para
  função que existe, nome com `<img onerror>` só aparece escapado e
  `javascript:` é recusado, corpos de requisição batendo com o contrato. **O
  layout em si (CSS) não foi visto num navegador** — vale abrir a aba uma vez em
  produção.

  **Em produção (01/10).** Commit `089d336`, run `36865623244`: testes 768/768,
  **migração 113 executada no Azure SQL em 19 batches** (a primeira execução em
  Azure SQL de verdade; a 113 levou ~6 s — o passo inteiro leva ~2,5 min porque
  reexecuta, idempotentes, as 113 migrações) e deploy concluído. Conferido ao vivo, sem
  sessão: as **21 ações de `/api/psc/*` respondem `401`** (nenhuma `404`, a lição da
  Trava 6-A) e a página servida já traz a aba `abaPsc`.

  **Registrado, não construído, por decisão:**

  - A unidade rebaixada continua uma linha de `Congregacoes`, com os membros nela
    (`Categoria = 'EXTENSAO_TENDA'`); não vira linha de `ExtensoesTenda` nem tem o
    rol transferido para a Congregação-Mãe. Mover pessoas é irreversível demais
    para um efeito automático de decreto.
  - O saldo local que já existe no momento do decreto **não é transferido**: o
    sistema o calcula e o registra, e a Tesouraria Geral o recolhe pelo fluxo
    financeiro de sempre.
  - Quem tinha sessão aberta continua com ela até o token expirar (12h) — a mesma
    limitação, deliberada, da vB.9 e das medidas cautelares.
  - O site institucional (`CongregacoesPublico`) não distingue a categoria: a
    unidade rebaixada continua listada como congregação até a FASE C ser revisitada.
  - Não há ranking nem comparativo entre congregações (Art. 129 fala de "níveis
    reais de eficiência" para direcionar investimentos): a FASE 12 (indicadores)
    é onde isso entra, em cima do que a homologação já congela.

## v7.2 — Calendário oficial e agenda unificada

- [x] Agenda Litúrgica Oficial (Reg. Art. 79) + Calendário Oficial anual.
- [x] Conflito de datas: nível superior cancela/absorve o inferior.
- [x] Fluxo de aprovação do calendário (planejamento → CLI).

**Expandido pela varredura normativa (7ª rodada).** O Art. 154 não descreve
"evitar conflito de datas": descreve um **algoritmo de agendamento completo**,
com prazo fatal, critério de desempate e hipótese de indeferimento. Do jeito que
estava, a versão cobria talvez um quinto do que a norma manda.

- [x] **Prazo fatal de 15 de janeiro** para propostas de evento (Art. 154 §2º, I),
      com alerta antecipado — depois disso, entra só por exceção.
- [x] **5 níveis de precedência** (Art. 154 §1º): o nível superior prevalece
      automaticamente; o inferior é remarcado ou absorvido, sem negociação manual.
- [x] **Direito Adquirido Temporal** (Art. 154 §2º, IV) — empate entre eventos do
      mesmo nível resolve por **ordem de chegada da proposta**, o que exige
      carimbo de data/hora imutável em cada proposta. É o mecanismo que evita a
      disputa política ("marquei primeiro").
- [x] **Trava de simultaneidade por Área** (Art. 154 §3º, II): vedadas duas festas
      de Nível 4 na mesma Área no mesmo fim de semana — validação automática.
- [x] **Bloqueio total de campo** nas datas dos 2 Congressos Unificados (§4º) e
      status próprio de **"indeferido por Esgotamento de Pauta"** — o sistema
      precisa saber dizer "não cabe mais", com fundamento.
- [x] Homologação pela CLI na primeira reunião do ano (§2º, III), gerando o
      Calendário Oficial publicado.
- [x] **Ciclo Mensal de Governança gerado automaticamente** (Art. 154-A): as
      sessões ordinárias do ano já nascem na agenda — Conselho Fiscal/NIF no 3º
      domingo (14h-17h), CEI na semana anterior à Câmara, CLI no último domingo
      (14h-17h). Hoje cada secretário marca na mão, e esquecer é quebrar quórum.
- [x] **Santa Ceia** (Art. 81 §1º): Ceia Local no último domingo do mês; **Ceia
      Geral em maio e outubro com fechamento obrigatório de todas as
      congregações** — nessas datas o sistema bloqueia agendamento local
      concorrente. Ausência injustificada de Dirigente na Ceia Geral é fato
      registrável (Art. 81 §1º, III, "b").
- [x] Convocação de AGE da CLI com antecedência mínima de **48 horas**
      (Art. 147 §2º) — validada no ato da convocação, não conferida depois.

  Entrega: migração 114 (`sql/migrations/114_calendario_oficial.sql`),
  `shared/calendario.js` (o motor, **puro**: nenhuma consulta ao banco),
  `shared/calendarioDb.js` (leitura, gravação e decisões), duas Functions novas —
  `GestaoCalendario` (`/api/calendario/...`, 25 ações com login) e `AgendaPublica`
  (`/api/agenda-publica/...`, 4 rotas **anônimas** só de leitura, para o site) —,
  cinco regras no motor de notificações da vB.2, a entrada `CALENDARIO` no ROPA e
  a política de retenção da categoria.

  **O que o sistema decide sozinho e o que depende de gente.** A hierarquia
  **não é negociada**: dois eventos que disputam o mesmo dia têm um vencedor
  calculado (nível, depois o carimbo de chegada), e o perdedor recebe o motivo e o
  caminho para remarcar. Mas a **consolidação** (aplicar a hierarquia ao ano
  inteiro depois do 15/jan) é uma ação da Secretaria, e a **homologação** é da
  CLI, com número da ata. O sistema avisa quem precisa agir e quando
  (`CALENDARIO_PARA_CONSOLIDAR`, `CALENDARIO_PARA_HOMOLOGAR`); não age no lugar.

  **Os cinco níveis e o catálogo de tipos.** `CalendarioTiposEvento` semeia **25
  tipos**, cada um com o nível do Art. 154 §1º (nove deles de Nível 1: os dois
  Congressos Unificados, Santa Ceia Local e Geral, CLI ordinária e extraordinária,
  Assembleia Geral, Batismo e agenda externa estratégica), onde
  pode acontecer (campo, Áreas, congregação), se é festividade (entra na trava de
  Área), se fecha as congregações, a antecedência mínima e se aparece no site. A
  CLI cria, edita e desativa tipo pelo sistema (`tipos`, `tipos/atualizar`) sem
  mexer em código; desativar não afeta o que já foi proposto (o evento guarda a
  foto do nível).

  **Quem propõe o quê (três permissões, nunca concedidas por padrão).**
  `calendario_proposta` (líderes gerais, supervisores de Área, dirigentes e
  coordenadores propõem **dentro do próprio escopo**, Níveis 2 a 5; o dirigente
  de uma congregação só propõe para ela, o pastor de Área para a Área **inteira**
  dele — não para parte dela nem para outra), `calendario_secretaria` (gera o
  ciclo, consolida, defere e indefere, propõe o Nível 1, registra presença na
  Ceia Geral) e `calendario_homologacao` (homologa, decide em caráter excepcional,
  altera a agenda litúrgica e o catálogo — **escopo global**, porque vale para a
  igreja toda). Qualquer login **lê** a agenda; a pauta de propostas (com quem
  propôs e por quê foi indeferido) só aparece a quem tem permissão e dentro do
  escopo.

  **O algoritmo (Art. 154).** Avaliar uma proposta contra o que já está no
  calendário dá um de três veredictos (`avaliarProposta`): **LIVRE**,
  **RECUSADA** (perde para algo que já tem a data) ou **ABSORVE** (é de Nível 1 e
  leva o dia). Regras, na ordem em que o motor aplica:
  - **Território.** Um evento ocupa o campo todo, algumas Áreas ou uma congregação;
    só há choque entre eventos cujos territórios se sobrepõem.
  - **Nível 1 manda no dia.** Santa Ceia e Congressos **bloqueiam o campo
    inteiro** naquela data: nenhum evento de nível inferior cabe, e o que já
    estava marcado é **absorvido**. A Santa Ceia Geral (maio/outubro) e os
    Congressos **fecham todas as congregações**: nesses dias a grade litúrgica
    aparece absorvida e as congregações, fechadas.
  - **Nível menor cede ao maior**, mesmo tendo chegado antes (um Culto de Ensino
    local perde a data para uma Cruzada Geral).
  - **Mesmo nível: quem chegou primeiro.** O carimbo `PropostaEm` é gravado pelo
    servidor e **imutável no banco** (gatilho que recusa o `UPDATE`); a remarcação
    **herda o carimbo** do pedido original, para quem perdeu a data não perder
    também a fila.
  - **Trava de Área.** Duas festividades de Nível 4 na mesma Área no mesmo fim de
    semana não são aceitas; quem chegou depois cai com o motivo `TRAVA_AREA`.
    Áreas diferentes podem fazer festa no mesmo fim de semana.
  - **Direito Adquirido só cede ao Nível 1 e à decisão da CLI.** Um evento
    **homologado** não é derrubado por outro de nível alto: só um Nível 1 o
    absorve, ou a CLI, em caráter excepcional, com motivo e resolução
    (`eventos/absorver`). O absorvido pode ser remarcado e leva o carimbo
    original.
  - **Esgotamento de Pauta** (Art. 154): proposta **fora do prazo** que não
    encontra data livre é indeferida sem direito a recurso e **não se remarca** —
    a tela nem oferece o botão. Mesmo assim o sistema sugere datas livres futuras
    para uma proposta nova.

  **Linha do tempo de um ano.** `PLANEJAMENTO` (a Secretaria abre o ano, prazo
  15/jan; gera o ciclo mensal: **48 eventos** — Ceia, CLI, NIF e CEI × 12) →
  propostas até 15/jan, todas `PROPOSTO`, sem decisão (a ordem de chegada só vale
  na consolidação, então ninguém é prejudicado por clicar às 8h ou às 22h) →
  `CONSOLIDADO` (a Secretaria aplica a hierarquia; os indeferidos são avisados) →
  `HOMOLOGADO` (a CLI, com a ata, depois de vencido o prazo; tudo o que estava
  deferido vira **Direito Adquirido**). Depois da homologação, cada proposta é
  decidida **na hora** (não há mais consolidação): cabe e entra `HOMOLOGADO`, ou
  não cabe e é indeferida. A consolidação é **idempotente** (rodar de novo não
  muda nada) e a homologação **exige o prazo vencido**.

  **Ciclo mensal e Santa Ceia (Art. 154-A, 81).** `gerar-ciclo` cria, sem
  duplicar, as sessões ordinárias do ano: Santa Ceia Local no último domingo de
  cada mês (Nível 1), Santa Ceia Geral nos últimos domingos de **maio e outubro**,
  reunião da CLI no último domingo, do Conselho Fiscal/NIF no 3º domingo e da CEI
  na semana anterior à Câmara. Cada uma nasce com chave de regra única
  (`RegraChave`, índice filtrado), então regenerar não cria repetição. A **Ceia
  Geral** tem um registro próprio da **presença do dirigente** de cada
  congregação (presente / ausente justificado / ausente injustificado, com
  justificativa e uma linha por congregação); a ausência injustificada é gravada
  como fato e a tela lembra que ela segue para apuração disciplinar
  (Art. 81 §1º, III, "b") — o sistema **não pune**, só registra. Não se registra
  presença em Ceia que ainda não aconteceu.

  **AGE da CLI com 48 horas (Art. 147 §2º).** O tipo "Reunião da CLI
  extraordinária" exige data, **hora de início** e antecedência de 48 horas no
  momento da convocação; menos que isso é recusado com a explicação.

  **Agenda Litúrgica (Art. 79).** A grade fixa da igreja (21 regras semeadas:
  EBD, cultos, círculos de oração, UMADESPA etc.) mora no banco como **regra
  recorrente** (`AgendaLiturgicaRegras`: dia da semana, ocorrência, escopo Sede /
  congregações / todas, horário) e é projetada nas datas pelo motor. Mexer nela
  exige a permissão de homologação **e a resolução da CLI** (Art. 79, parágrafo
  único) — a resolução é gravada na auditoria. No dia de um Nível 1, a grade é
  mostrada como **absorvida** e as congregações aparecem como fechadas.

  **Agenda unificada.** `GET agenda` junta, numa linha do tempo, as camadas
  **OFICIAL** (o calendário), **LITURGIA** (a grade) e **SESSAO** (reuniões
  internas já agendadas no sistema, só para quem tem permissão de vê-las), com
  filtro por congregação e janela de até um ano. A Santa Ceia da grade litúrgica
  não duplica a Ceia oficial: aparece como "coberta" por ela. Quem não tem
  nenhuma permissão do calendário vê só o que está **homologado**.

  **O que vai para o site.** `AgendaPublica` (`tudo`, `eventos`, `liturgia`,
  `versao`) é **anônima**, só `GET`, com limite de 60 requisições por minuto por
  origem e cache de 60 segundos. Só sai o que está `HOMOLOGADO`, é de tipo
  público e não é reunião interna: **a CLI, o NIF e a CEI nunca vão ao site**, e o
  pacote não carrega proponente, ata, motivo nem nenhum nome de pessoa — só
  título, data, hora, local, congregação e nível (o roteiro ponta a ponta confere
  a lista de chaves devolvidas). O nome da congregação sai sem o prefixo numérico
  administrativo. A grade litúrgica vai no formato da coleção `programacao` que o
  site já usa (sem as "noites livres"), para ele não precisar de outro leitor. O
  pacote leva uma `versao` (hash de 16 caracteres) que muda quando qualquer coisa
  pública muda; é com ela que o site decide se precisa reconstruir.

  **Como o evento chega ao site (e quanto demora).** O site é estático (Astro):
  lê `GET /api/agenda-publica/tudo` **uma vez por build** (`site/src/lib/agendaOficial.ts`,
  três tentativas, 60 s cada; erro 404 ou outro 4xx não é repetido), sem login e
  sem CORS. Se o sistema estiver fora do ar, o build **não quebra**: o site sai com
  o que o Directus tem e publica `agenda-versao.json` como `"indisponivel"`.
  - **Eventos.** Entram na lista de `/eventos/`, no `eventos.ics` (UID estável
    `agenda-<id>@ieadespa.org.br`), na busca e nos lembretes push de véspera. Se o
    evento oficial aponta (`slugSite`) um evento do Directus **que tem página ou
    inscrição**, o Directus continua dono da página e da inscrição e o oficial
    passa a mandar na **data, data final e hora** (na lista, na página do evento e
    no `.ics` dele); hora oficial vazia não apaga a do Directus. Sem
    correspondência, nasce um item `agenda-<id>` sem página própria, com a etiqueta
    do tipo.
  - **Grade de cultos: o site continua com a do Directus, de propósito.** O código
    para a programação semanal (home, contato, visitante e a imagem
    `programacao-semanal.png`) vir da agenda litúrgica do sistema está pronto, mas
    **desligado** (`USAR_GRADE_DO_SISTEMA = false` em `site/src/lib/programacao.ts`).
    Comparei a grade que o site publica hoje com a que a migração 114 semeou a
    partir do Art. 79 e elas **diferem** (títulos, o rodízio de domingo à noite — o
    2º domingo é "SEMIADESPA Local" no site e "Culto de Missões" no sistema — e
    linhas que só existem no sistema, como "Congregações fechadas"). Trocar a grade
    pública sem a igreja confirmar seria mudar informação ao público por conta própria.
    Quando a CLI conferir e ajustar a agenda litúrgica no sistema, basta virar a chave
    para `true`; com a agenda indisponível ou vazia, cai no Directus.
  - **Sincronização.** Um workflow agendado (`.github/workflows/site-agenda-sync.yml`,
    a cada 20 minutos) compara a `versao` do sistema com a que o site publicado
    diz estar mostrando (`/agenda-versao.json`) e, **só se forem diferentes**,
    dispara o deploy do site (`workflow_dispatch`, que o `GITHUB_TOKEN` pode
    acionar). Então um evento homologado ou uma mudança na grade aparece no site em
    **até ~20 minutos** (mais o tempo do build, ~5 min), sem ninguém mexer no site.
    Salvaguardas: não dispara com deploy na fila ou em andamento; não dispara se o
    último deploy falhou há menos de 60 min; e, se o site está publicado sem agenda
    (`indisponivel`), espera 45 min do último deploy, para uma API instável não
    gerar um build a cada 20 minutos. O GitHub pode atrasar execuções agendadas e
    desliga agendamentos de repositório público sem atividade por 60 dias; o
    disparo manual (`gh workflow run site-agenda-sync.yml`) sempre funciona.
  - **Limites.** Eventos do Directus que duplicam o que está no calendário oficial
    **aparecem duas vezes** até o Directus aposentá-los ou o sistema preencher o
    `slugSite` (não há heurística de título e data de propósito). A coleção
    `eventos` do Directus continua sendo o dono de eventos **com inscrição**.
    O script de lembretes já ignorava `avisar_eventos` (quem desativou só esse
    aviso ainda recebe); com os eventos oficiais o volume sobe.

  **A tela (módulo "📅 Calendário Oficial").** Aba nova no menu, mais uma
  subaba **"Agenda"** em Meu Painel (para qualquer login, mostrando só o
  **homologado**). A aba tem sete seções, e cada uma só aparece a quem tem direito:
  - **Agenda** (todos): mês em grade, com as três camadas juntas (oficial, grade
    litúrgica, sessões), o dia selecionado em detalhe, o que foi absorvido
    riscado e as congregações fechadas sinalizadas; cores por nível.
  - **Propor data** (`calendario_proposta`): o formulário **confere sozinho** a
    data enquanto se digita (espera 600 ms), mostra o veredito sem gravar e, se
    não cabe, oferece datas livres clicáveis; tipo de Nível 1 não aparece para
    quem só pode propor. Remarcar um indeferido abre o mesmo formulário já
    ligado ao pedido original (e portanto ao carimbo).
  - **Pauta e detalhe** (quem tem alguma permissão): a lista e a ficha do evento
    com o motivo, quem prevaleceu e **só as ações que cabem** àquele usuário
    (editar, cancelar, remarcar, deferir, indeferir, absorver).
  - **Anos** (Secretaria e CLI): abrir o ano, gerar o ciclo, consolidar (mostra os
    indeferidos, clicáveis) e homologar com a ata (só a CLI).
  - **Liturgia e tipos** (só a CLI): a grade e o catálogo, com a resolução
    obrigatória.
  - **Ceia Geral** (só a Secretaria): presença do dirigente por congregação.
  - **Site** (Secretaria e CLI): se a versão publicada no site já é a do sistema.

  A tela **não decide nada**: monta o que o servidor devolve e manda o que a
  pessoa fez; toda regra (nível, escopo, 48 h, prazo) é do servidor, e os botões
  só espelham as permissões.

  **Avisos (motor da vB.2).** Cinco regras, todas com destinatário certo:
  `CALENDARIO_PRAZO_PROPOSTAS` (30 dias antes do 15/jan) e
  `CALENDARIO_PRAZO_URGENTE` (7 dias) avisam **só quem pode propor e ainda não
  propôs naquele ano**; `CALENDARIO_PROPOSTA_RECUSADA` avisa **só o proponente**
  de uma proposta indeferida ou absorvida, lembrando que a remarcação mantém o
  carimbo; `CALENDARIO_PARA_CONSOLIDAR` (prazo vencido com proposta pendente) vai
  à Secretaria; `CALENDARIO_PARA_HOMOLOGAR` (ano consolidado) vai à CLI.

  **Auditoria e integridade.** Toda decisão é gravada (`ANO_ABERTO`,
  `CICLO_GERADO`, `ANO_CONSOLIDADO`, `ANO_HOMOLOGADO`, `EVENTO_PROPOSTO`,
  `EVENTO_DEFERIDO`, `EVENTO_INDEFERIDO`, `EVENTO_CANCELADO`,
  `EVENTO_ATUALIZADO`, `EVENTO_ABSORVIDO_NIVEL_1`, `EVENTO_ABSORVIDO_CLI`,
  `PRESENCA_DIRIGENTE_REGISTRADA`, mudanças da grade e do catálogo). O banco
  garante o que o código promete: carimbo imutável (gatilho), `CHECK` de término
  não anterior ao início, chave de regra única e a presença única por congregação
  e evento.

  **Verificação.** 86 testes novos (motor puro, regras de escopo e catálogo, camada
  de banco com doubles); a suíte da API foi de 768 para **854**. Além deles, um
  roteiro ponta a ponta de **205 verificações** rodou os handlers reais contra um
  SQL Server 2019 recém-criado (migrações 001 a 114): acesso e escopo, ano 2027
  inteiro (proposta → consolidação → remarcação), ano corrente com Esgotamento de
  Pauta, homologação, absorção pelo Nível 1 e pela CLI, Ceia Geral, grade
  litúrgica, catálogo, detectores de aviso, gatilho do carimbo, índice único,
  limite da rota pública e todas as ações de auditoria, sem nenhuma falha de
  gravação da trilha. Esse roteiro achou um defeito que os testes unitários não
  viam: a resposta da consolidação sobrescrevia a contagem de indeferidos pela
  lista deles; hoje são dois campos (`indeferidos` e `listaIndeferidos`). Os
  formatos reais das respostas foram capturados dos handlers e conferidos contra
  tudo o que a tela lê (nenhuma propriedade a mais, nenhuma a menos).

  A **tela** foi exercitada em DOM simulado (14.448 verificações: todas as seções e
  combinações de permissão, os corpos enviados ao servidor, e texto de ataque
  `<img onerror>` em quase todos os campos, sem nenhuma injeção de HTML), com
  conferência de ids e handlers e uma renderização em navegador (Edge sem
  interface) com API simulada; o teste da PSC segue passando (24.740). O **site**
  foi construído de ponta a ponta contra um servidor falso (119 páginas; uma só
  chamada à API por build; `astro check` sem erros) nos caminhos feliz, de
  servidor fora do ar, de erro 500 e de grade vazia, e o script de lembretes e o
  sincronizador foram rodados com dublês. **Não foi feita** validação visual
  com dados reais em produção, só depois do deploy.

  **Em produção (verificado em 01/10/2026).** O deploy do sistema passou com os
  testes e a migração 114 aplicada no Azure (a grade litúrgica semeada já sai em
  `/api/agenda-publica/liturgia`). As 9 rotas `GET /api/calendario/*` testadas
  respondem `401` sem sessão; `/api/agenda-publica/versao` responde `200` (e `POST`
  nela, `404`). O primeiro deploy do site rodou **antes** da API existir e
  publicou `agenda-versao.json` como `indisponivel`, como previsto; o segundo, já
  com a API no ar, publicou a mesma versão do sistema, e uma execução manual do
  sincronizador terminou sem reconstruir nada. No mesmo push uma execução
  duplicada do deploy do site falhou numa corrida de upload ao mesmo ambiente do
  Azure; a outra publicou normalmente. **Nenhum evento está homologado em
  produção ainda**, então `eventos` público vem vazio até a Secretaria abrir 2027,
  gerar o ciclo, consolidar e a CLI homologar.

  **Decisões que o Regimento não fecha (a CLI pode reverter, cada uma é uma
  linha).**
  - **Ceia Geral = último domingo de maio e de outubro.** O Art. 81 diz "maio e
    outubro" sem dizer o domingo; adotei o mesmo da Ceia Local.
  - **NIF/Conselho Fiscal como Nível 2, na Sede**; a **CEI, por padrão, na
    quinta-feira** da semana que antecede o último domingo, 19h30. O Art. 154-A dá
    a semana, não o dia; a Secretaria pode mover.
  - **Reuniões internas (CLI, NIF, CEI) são privadas por padrão**: ocupam a
    agenda interna, mas não vão ao site.
  - **Direito Adquirido só cede ao Nível 1 e à decisão da CLI** (acima).
  - **A justificativa de ausência na Ceia Geral é texto livre e pode citar
    saúde.** Fica visível só à Secretaria e à CLI, mas a política de retenção da
    categoria não separa esse campo e o prazo de descarte está em aberto: a CLI
    precisa definir quando anonimizar.

## v7.3 — Canais oficiais e comunicação

- [x] Registro de Canais Oficiais de Comunicação (Art. 12 Estatuto).
- [x] Grupos oficiais + grupos focados (política, bazar, teologia, geracional).
- [x] Blindagem digital (Regimento Art. 157, §5º; Lei 9.504/97) — a parte **digital**; ver a
      nota sobre o púlpito abaixo.

**Expandido pela varredura normativa (7ª rodada).** O Art. 160 transforma
administração de canal em **responsabilidade jurídica solidária** da Igreja — o
registro do canal, sozinho, não cobre nada disso.

- [x] **Regra das 24 Horas** (Art. 160 §1º, I-II): conteúdo irregular não removido
      em 24h torna a Igreja **corresponsável**. O sistema registra a denúncia
      interna do conteúdo, dispara o relógio, notifica o administrador responsável
      e guarda a prova da remoção — é a diferença entre responder "removemos em
      3 horas, aqui está o registro" e não ter o que dizer.
- [x] **Administrador formal por canal**, com termo de dever de moderação aceito —
      hoje "quem administra o grupo" é conhecimento informal.
- [x] **Senhas pertencem à Secretaria Geral** (Art. 160 §4º, I): troca obrigatória
      e registrada na sucessão de liderança. Quando um Dirigente é substituído
      (fluxo que já existe em `Assentos`/`Lideranca`), o sistema gera a pendência
      de troca de senha dos canais daquela congregação.
- [x] Mapeamento de **canais por congregação** (quem não tem canal próprio) e da
      **"Área Cega"** (§2º, II) **como o Regimento a define**: a zona do templo sem
      filmagem. *(O texto anterior desta linha dizia "Área Cega = congregação sem
      canal registrado"; o Art. 160 §2º, II diz outra coisa, e a v7.3 implementa o
      que a norma diz. A lacuna de canal por congregação ficou como indicador
      próprio, "sem canal".)*
- [x] Grupos satélites (Art. 160-A) e proteção de menores em canais (§5º) — o
      registro de grupo focado, a marca "inclui crianças e adolescentes" e a categoria
      de ocorrência de exposição de menores estão prontos; a vedação de mensagem
      privada de adulto para menor é estrutural e continua na v7.7.

  Entrega: migração 115 (`sql/migrations/115_canais_comunicacao.sql`),
  `shared/canais.js` (a regra, **pura**), `shared/canaisDb.js` (leitura, gravação e
  decisões), a Function nova `GestaoCanais` (`/api/canais/...`, 30 ações), a rota
  pública `/api/agenda-publica/canais`, seis regras no motor de notificações da
  vB.2, gancho no `GestaoLideranca`, a entrada `CANAIS` no ROPA e a política de
  retenção da categoria.

  **O registro (Estatuto Art. 12).** A relação de canais já existia como um
  catálogo mínimo (`CanaisOficiaisComunicacao`: sigla, nome, ativo — migração 020,
  usado nas tentativas de contato do Abandono Digital). A v7.3 **evolui essa mesma
  tabela** (a chave `CanalId` e as tentativas já gravadas ficam intactas) e tira a
  edição do catálogo genérico, que só exigia a permissão "pessoas" e contornaria
  tudo abaixo. Para registrar um canal:
  - **Conta pessoal nunca é canal oficial.** O registro exige o **vínculo
    institucional** (CNPJ, marca ou estrutura da IEADESPA) e a **declaração
    expressa** de que a conta ou o número não é de titularidade pessoal — gravados
    com **quem declarou e quando**. Além da declaração, o sistema **confere**: número
    de telefone ou e-mail que consta como contato pessoal de qualquer membro é
    recusado (comparação ignora máscara, `+55` e o 9 extra), e a mensagem cita só a
    matrícula. Perfil de rede social e endereço não têm contato pessoal para
    comparar: ali vale a declaração e o julgamento da Secretaria (limite
    declarado).
  - **Identificador por plataforma.** Número, e-mail, `@perfil` e endereço `https://`
    são validados e normalizados (YouTube só aceita endereço do YouTube etc.). Em
    **grupo de WhatsApp registra-se o NOME**, nunca o link de convite (o link deixa
    qualquer pessoa entrar e o repositório e o site são públicos). Dois canais
    ativos não repetem o identificador na mesma plataforma (índice único).
  - **Categorias:** canal institucional, **grupo oficial** (Art. 160 §1º) e **grupo
    focado** (§6º e Art. 160-A) com o tema obrigatório — cidadania e política;
    empreendedorismo, bazar e classificados; teológico e debates; geracional; outro.
    (Os "grupos satélites" do Art. 160-A são os focados de política e de
    classificados.) **Escopo:** campo, Área, congregação ou departamento. Quem tem
    `canais_gestao` com escopo local só registra e mantém canal da própria
    congregação; canal do campo, de uma Área inteira ou de departamento exige
    escopo global.
  - **Os três canais antigos** (WhatsApp, e-mail e Sistema) viram institucionais do
    campo todo, **sem identificador de propósito**: aparecem como "cadastro
    incompleto" até a Secretaria preencher e declarar a titularidade.
  - Canal **desativado mantém o histórico** (data de vigência e motivo); não se
    desativa canal com ocorrência aberta.

  **Administrador formal e Termo de Dever de Moderação (Art. 160 §1º, I).** A
  Secretaria designa administradores e operadores da conta; só pode ser designado
  membro **ativo e maior de 18 anos** (quando há data de nascimento) — decisão
  minha, porque o administrador responde solidariamente. A designação só vale de
  fato quando a **própria pessoa** aceita o termo: nove compromissos tirados do
  Regimento (poder de polícia, remoção em até 24 horas, vedações, termo de uso na
  descrição, senha da Secretaria, postura da conta, proteção de crianças, LGPD). O
  aceite grava a **versão e o hash do texto** que a pessoa viu; se o texto mudar, a
  versão sobe e todos aceitam de novo (um teste fixa o hash para ninguém alterar o
  texto sem subir a versão). Canal sem nenhum administrador com o termo vigente
  aceito fica **irregular**. O voluntário entra com o código de acesso do membro
  (sem `Lideranca`) e consegue aceitar o termo e agir nos seus canais.

  **Regra das 24 Horas (Art. 160 §1º, II e §5º).** Qualquer membro logado avisa
  conteúdo irregular (limite de 10 avisos por pessoa por hora). Tipos:
  ofensivo/calúnia, pornográfico, fake news/corrente, **propaganda política ou
  eleitoral**, debate político-partidário, propaganda comercial, exposição de
  criança ou adolescente, vídeo/live de manifestação espiritual alheia, **rede
  institucional que seguiu ou curtiu perfil político** (§5º, II) e outro. O aviso
  grava a hora e o prazo (**+24 h**) numa só instrução, com **gatilho que impede
  qualquer alteração** da hora, do prazo, do canal, da categoria, do autor e da
  descrição. Os administradores do canal recebem aviso **na hora** (não esperam a
  rodada diária); as categorias graves — pornografia, exposição de menor,
  propaganda política e neutralidade da rede — e o canal **sem administrador** avisam
  também a gestão. O administrador recebe a **orientação passo a passo**, com a
  frase do Art. 160 §6º, IV ("leve este assunto para o Grupo Focado específico") e o
  tema do grupo focado para onde mandar o membro, e registra a **advertência**
  quando a norma a manda (propaganda política: Art. 157 §5º, I). **A prova da
  remoção** é o que a Igreja mostra se for cobrada: texto (≥ 10 caracteres),
  link opcional e hora da remoção (que o administrador pode informar se removeu
  antes de registrar, nunca antes do aviso nem no futuro; o sistema guarda
  também a hora do registro). O resultado diz se foi **dentro ou fora do prazo** e
  em quantas horas. Passadas as 24 horas sem remoção, a ocorrência fica **VENCIDA**
  ("a Igreja está corresponsável"), o canal fica irregular e a rodada diária avisa
  administradores e gestão. **Quem avisou não é revelado ao administrador** (evita
  retaliação); a gestão e a própria pessoa veem. Só a gestão declara uma ocorrência
  **improcedente**, com motivo — para o administrador não encerrar o relógio por
  conta própria.

  **Senhas e acessos (Art. 160 §4º, I).** O sistema **nunca guarda senha**: guarda se
  a custódia é da Secretaria Geral, a data da última troca e as pendências. Uma
  **pendência de troca** nasce quando (a) quem estava na liderança sai, (b) um
  administrador ou operador é encerrado, (c) a Secretaria registra suspeita de
  invasão ou troca de rotina. O prazo é de **2 dias** (parâmetro
  `CANAIS_TROCA_CREDENCIAL_DIAS`); a ação pedida depende do canal (trocar a senha e
  desconectar dispositivos; ou, em grupo, rever os administradores e retirar quem
  saiu). Resolver uma troca encerra de uma vez todas as abertas do mesmo canal e
  registra a data; o campo de observação avisa para **nunca escrever a senha**. A
  **sucessão** é detectada comparando quem lidera cada congregação (Dirigente de
  Congregação), Área (Pastor de Área) e departamento (Líder Geral) com o último
  estado conhecido, por isso **pega a troca por qualquer caminho** — concessão ou
  remoção pelo `GestaoLideranca`, fim de mandato, medida cautelar, ajuste direto
  no banco. Só a **saída** de alguém abre a pendência (quem entra não tira o
  acesso de ninguém), nos canais daquele escopo **e** nos canais em que a pessoa
  era administradora. A verificação roda a cada concessão ou remoção de liderança pelo
  `GestaoLideranca`, a cada leitura do painel (cobertura e trocas) e na rodada diária. **Limite:** a primeira execução só registra o estado
  atual; saídas anteriores a ela não geram pendência retroativa.

  **Conferência de conformidade.** Cada canal tem seus itens: termo de uso na
  descrição (grupo oficial), Aviso de Atenção (grupo focado), neutralidade política
  e postura do operador (redes sociais — não seguir nem curtir candidatos, não
  discutir nos comentários, não postar selfie: Art. 157 §5º, II e Art. 160 §4º, II),
  custódia da senha e proteção de crianças (quando o canal as inclui). Todos os
  itens aplicáveis precisam ser respondidos; um "não" torna a conferência
  **irregular** (com observação obrigatória) e o canal fica marcado até uma
  conferência conforme. O prazo entre conferências é de **180 dias** (parâmetro
  `CANAIS_CONFERENCIA_DIAS`). A situação do canal resume tudo: **regular**,
  **atenção** ou **irregular**, com a lista de pendências (sem administrador, termo
  pendente, sem custódia, troca vencida, ocorrência vencida, conferência vencida ou
  irregular, cadastro incompleto).

  **Transmissão dos cultos e Área Cega (Art. 160 §2º).** Por congregação: se
  transmite; a data em que a **placa de aviso** ("Este local está sendo filmado e
  transmitido ao vivo") foi instalada nos acessos — o consentimento tácito do
  frequentador depende dela (§2º, I); e a **Área Cega** (últimas fileiras ou galeria
  lateral, sem filmagem), definida com descrição ou justificada ("a estrutura
  física não permite", como o próprio Regimento prevê). Quem transmite sem placa ou
  sem Área Cega fica **pendente**; quem não transmite, "não se aplica". O painel de
  cobertura mostra também as congregações **sem nenhum canal próprio**.

  **Abandono Digital (Estatuto Art. 11, V e Art. 12 §2º).** O registro de tentativa
  de contato passou a aceitar **só contato individual por canal institucional ativo**
  (e-mail, telefone ou WhatsApp institucional, o próprio sistema). Grupo, grupo focado
  e rede social **não contam** como tentativa de contato — antes qualquer linha do
  catálogo servia. O canal legado sem plataforma continua valendo, para não
  quebrar o que existe; desativar um canal não apaga as tentativas já registradas.

  **O que vai para o site.** O membro precisa poder conferir o que é oficial — e a
  caracterização do Abandono Digital depende de os canais serem conhecidos. A rota
  pública `/api/agenda-publica/canais` (e o campo `canais` de `/tudo`) devolve **só
  canal ativo, completo e marcado como público**; grupo focado **nunca** vai, e o
  pacote não carrega administrador, senha, custódia, ocorrência, declaração nem
  conferência (o roteiro ponta a ponta confere a lista de chaves). A `versao` do
  site passou a cobrir os canais, então publicar ou despublicar um canal faz o
  sincronizador reconstruir o site.

  **A tela (módulo "📣 Canais e Comunicação").** Menu novo, só para quem tem
  `canais_gestao`, com cinco seções:
  - **Painel:** treze contadores (vermelho para ocorrência vencida e canal sem
    administrador, âmbar para pendências), os canais com pendência e as
    congregações sem canal próprio, cada uma com atalho para registrar o canal.
  - **Canais:** tabela com filtros e o formulário guiado — o rótulo e o exemplo do
    identificador mudam com a plataforma, o tema só aparece para grupo focado, o
    seletor muda com o escopo, a **declaração de titularidade institucional é
    obrigatória** e o aviso "em grupo, guarde o NOME, nunca o link de convite" fica
    fixo. A recusa do servidor (conta pessoal, identificador repetido) aparece tal
    qual e o formulário não é limpo. O detalhe mostra as pendências, os
    administradores (quem aceitou o termo e quando), a conferência (Sim/Não por item)
    e os botões de copiar o **modelo de Termo de Uso** (grupo oficial) e o **Aviso de
    Atenção** (grupo focado). Canal legado aparece como "cadastro incompleto", com o
    atalho "completar cadastro".
  - **Ocorrências:** cartões com a **contagem regressiva** das 24 horas (no prazo,
    urgente, VENCIDA em vermelho com "a Igreja está corresponsável", removida no
    prazo ou fora dele, improcedente), que se atualiza sozinha a cada 30 segundos;
    detalhe com a orientação passo a passo, o grupo focado sugerido, a frase pronta
    para copiar e as ações que cabem ao usuário.
  - **Senhas e acessos:** o aviso "nunca escreva a senha aqui" em destaque no topo e
    em cada formulário; as pendências de troca (vencida, quem saiu, o que fazer), a
    resolução, a pendência manual e o botão "Conferir sucessões".
  - **Transmissão e Área Cega:** tabela por congregação e o formulário do Art. 160 §2º.

  **Meu Painel → Canais** (qualquer login): em "Meus canais", o texto completo do
  Termo de Dever de Moderação e o botão "Li e aceito" — **só depois do aceite** aparecem
  as ocorrências abertas do canal (nunca quem avisou), com a contagem regressiva, a
  orientação e o registro de remoção e de advertência; em "Avisar conteúdo irregular",
  o formulário (o 429 de excesso de avisos aparece em destaque); em "Meus avisos", o
  acompanhamento do que a pessoa avisou. **Telas que já existiam:** a edição de canais
  saiu do menu Catálogos, e o registro de tentativa de contato do Abandono Digital
  passou a listar só os canais que valem (com o identificador ao lado e o lembrete de
  que grupo e rede social não contam).

  **No site.** Página nova `/canais-oficiais/` (link no rodapé, em Institucional),
  gerada no build a partir do campo `canais` do mesmo pacote público, agrupada em
  todo o campo, por Área, por departamento e por congregação. O texto diz o que o
  Art. 12 diz: canal oficial é o instituído e mantido em nome da IEADESPA, e contas,
  números e perfis **pessoais** de pastores, diretores, obreiros ou dirigentes não
  são canais oficiais — sem afirmar que a lista pública seja a lista exclusiva, porque
  nem todo canal oficial é marcado como público. O link de cada canal só vira botão
  se for `https://`, `mailto:` ou `tel:`; qualquer outro vira texto. Com a lista vazia
  (é o caso hoje: nenhum canal foi marcado como público) a página fala que a
  relação está sendo organizada e leva à página de contato; com o sistema fora do
  ar no build, mostra um aviso discreto e o build não quebra.

  **Avisos (motor da vB.2).** Seis regras: `CANAIS_OCORRENCIA_NOVA` (na hora, ao
  administrador do canal e, nas graves, à gestão — não tem detector porque sai no
  ato de avisar), `CANAIS_OCORRENCIA_VENCIDA`, `CANAIS_TERMO_PENDENTE` (ao próprio
  designado, na hora da designação; a rodada diária só repete se a versão do termo
  subir), `CANAIS_TROCA_CREDENCIAL` (à gestão,
  na abertura e de novo quando o prazo vence), `CANAIS_SEM_ADMINISTRADOR` e
  `CANAIS_CONFERENCIA_VENCIDA` (à gestão: o primeiro no máximo uma vez por mês e o
  segundo uma vez por semestre, por canal).

  **Permissão.** Uma só, `canais_gestao` (nunca concedida por padrão): Secretaria
  Geral e Comunicação. Sem permissão nenhuma, qualquer login avisa conteúdo e
  quem administra um canal aceita o termo, vê as ocorrências do próprio canal e
  registra a remoção.

  **Auditoria e integridade.** Todas as decisões são gravadas (`CANAL_REGISTRADO`,
  `CANAL_ATUALIZADO`, `CANAL_DESATIVADO`, `CANAL_REATIVADO`, `ADMIN_DESIGNADO`,
  `ADMIN_ENCERRADO`, `TERMO_ACEITO`, `OCORRENCIA_ABERTA`, `OCORRENCIA_REMOVIDA`,
  `OCORRENCIA_IMPROCEDENTE`, `OCORRENCIA_ADVERTENCIA`, `TROCA_CREDENCIAL_GERADA`,
  `TROCA_CREDENCIAL_RESOLVIDA`, `LIDERANCA_SUCESSAO_DETECTADA`, `CANAL_CONFERIDO`,
  `TRANSMISSAO_REGISTRADA`). O banco garante o que o código promete: relógio da
  ocorrência imutável (gatilho), plataforma, categoria, tema, vínculo e escopo
  válidos (`CHECK`), identificador único entre canais ativos, um administrador
  ativo por canal e pessoa, e o aceite do termo só com versão, hash e hora.

  **Verificação.** 85 testes novos (regra pura e camada de banco com pool simulado);
  a suíte da API foi de 854 para **939**. Um roteiro ponta a ponta de **211
  verificações** rodou os handlers reais contra um SQL Server 2019 recém-criado
  (migrações 001 a 115), incluindo a sucessão pelo `GestaoLideranca` real, o relógio
  de 24 horas com o gatilho, o Abandono Digital pelo handler real e a rota pública.
  Ele achou um defeito que nenhum teste unitário via: o `CHECK` do tema do grupo
  focado deixava passar um grupo **sem** tema, porque `NULL IN (...)` é
  "desconhecido" e um `CHECK` aceita desconhecido — corrigido na migração. Ao
  escrever os testes apareceu também um temporizador que a v7.2 deixava solto no
  status da sincronização com o site (o aviso "Jest did not exit"), agora limpo.
  A tela foi exercitada em DOM simulado (8.030 verificações, com texto de ataque em
  quase todo campo e sem nenhuma injeção de HTML), com conferência de ids e de
  handlers e renderização no Edge sem interface; o formato real das respostas foi
  capturado dos handlers e comparado com tudo o que a tela lê. O site foi construído
  contra um servidor falso nos modos com canais, sem canais, resposta antiga e erro
  500, e contra a produção.

  **Em produção (verificado em 01/10/2026).** O deploy do sistema passou com os testes
  e a migração 115 aplicada no Azure. As 12 rotas `GET` e o `POST` testados em
  `/api/canais/*` respondem `401` sem sessão; `/api/catalogos/canaisOficiais`
  responde `404` (a edição saiu do catálogo); `/api/agenda-publica/canais` responde
  `200` com a lista **vazia** — nenhum canal foi marcado como público ainda. O primeiro
  deploy do site rodou antes da API nova existir e ficou na versão anterior; um
  disparo manual do deploy do site (o sincronizador o faria em até 20 minutos)
  igualou as versões (`2ede5dad7ed05d97` nos dois lados), e a página
  `/canais-oficiais/` está no ar, com a mensagem de relação em organização e o link
  no rodapé. **Nenhum canal foi cadastrado em produção:** os três canais antigos
  aparecem como "cadastro incompleto", e a Secretaria precisa receber a permissão
  `canais_gestao` (em Permissões) para registrar os canais de verdade.

  **A blindagem digital e o púlpito.** O Art. 157 trata de duas coisas: o **púlpito**
  (§§1º a 4º — santinhos, discurso eleitoreiro, comício disfarçado, licença do
  obreiro candidato, sanção ao dirigente) e o **digital** (§5º — grupos oficiais e
  redes institucionais). A v7.3 cobre o **digital**: a categoria de ocorrência
  "propaganda política", a orientação e a advertência obrigatória, a categoria
  "rede institucional seguiu ou curtiu perfil político" e o item de neutralidade da
  conferência. O **púlpito** é conduta presencial: o sistema só entra com a Licença
  de Candidatura que já existe (v2) e com o Processo Ético, e **não tem como ver o
  que se diz do púlpito**.

  **Decisões que o Regimento não fecha (a CLI pode reverter, cada uma é uma
  linha).**
  - **24 horas é o prazo duro**, embora o texto do §1º, II diga "no menor tempo
    possível" (as 24 horas estão no título da regra). Constante
    `PRAZO_REMOCAO_HORAS`.
  - **Administrador: ativo e maior de 18 anos.** O Regimento não fixa idade.
  - **Quem avisou fica oculto ao administrador**; o Regimento não trata disso.
  - **Saída de administrador sempre abre troca de senha**, mesmo que a pessoa nunca
    tenha tido a senha — melhor sobrar uma pendência do que faltar.
  - **Grupo focado nunca vai ao site** e **link de convite nunca é guardado**.
  - **Ocorrências e administradores: 5 anos de retenção**, sem rotina automática de
    descarte por ora. A descrição livre da ocorrência pode revelar opinião política
    (dado sensível, tratado como prova de diligência — ROPA, categoria `CANAIS`).
  - **Aviso de "prazo vencido" sai na rodada diária**: o aviso do prazo no ato é
    imediato, mas a escalada de uma ocorrência vencida pode chegar até 24 horas
    depois; o painel mostra a situação ao vivo.
  - **O que o sistema não faz:** não remove conteúdo do WhatsApp ou do Instagram,
    não prova que a conta é mesmo da Igreja (confia na declaração e na conferência
    de contato pessoal) e não impede um administrador de trocar a senha por conta
    própria — só registra, cobra e prova.

## v7.4 — Eventos e congressos

- [x] Cadastro de eventos (local/área/geral) + inscrições. *(O cadastro é o do
      Calendário Oficial, v7.2; as inscrições seguem no site, como decidido abaixo.
      A v7.4 acrescenta a governança do evento.)*
- [x] Congresso Unificado de Departamentos. *(Já era evento de Nível 1 com bloqueio
      total do campo desde a v7.2; a v7.4 dá a ele — e a qualquer evento geral ou de
      Área — organizadores, convidados externos com o Protocolo de Convidados e o
      Caixa Flutuante. Programação, inscrição, lotação por sala, QR e hospedagem por
      congregação ficam com o site e com a v7.13.)*

**Integração com o site institucional (trabalhada fora de ordem, junto com a
FASE C, 2026-09-14)** — o site já tem um sistema de eventos público próprio
e maduro (inscrição, lista de espera, check-in, certificado), rodando no
Directus, **já funcionando de verdade** (não é mais dado fictício). Decisão
tomada: manter os dois motores **propositalmente distintos** — evento
público com inscrição (site) não é a mesma coisa que reunião interna de
quórum de órgão (`AbrirReuniao`/`RegistrarPresenca`/`ListarFrequencia`,
FASE 0), e forçar os dois a serem uma coisa só distorceria ambos. O único
ponto real de integração:

- [x] `eventos.congregacao` (Directus) passa a apontar pro `CongregacaoId`
      real, via a API unificada de Congregações (vC.2, FASE C) — em vez da
      relação Directus-Directus solta que existe hoje. *(Já estava feito na FASE
      C: `evento/[slug].astro` resolve o campo contra `fetchCongregacoesPublicas()`.
      Os dados do próprio Directus não dá para conferir daqui.)*
- [x] Site continua sendo dono do cadastro de evento/inscrição/certificado —
      este sistema não duplica isso, só compartilha a fonte de congregação.
- [x] **Integração com o Portal do Membro (vB.5)**: "minhas inscrições em
      eventos" no PWA não duplica o motor do site (decisão acima continua
      de pé) — o portal só **linka** a área de eventos do site (Directus) em
      "Meu Painel → Eventos". *(Limite: o sistema não passa a sessão do membro ao
      site. O site identifica a pessoa pelo telefone e pelo código, no fluxo dele;
      levar a sessão para lá exigiria um desenho de autenticação entre dois domínios
      que não foi feito.)* Ver também v7.13, que expande esta versão na 7ª rodada.

  Entrega: migração 116 (`sql/migrations/116_eventos_congressos.sql`),
  `shared/eventos.js` (a regra, **pura**), `shared/eventosDb.js` (leitura, gravação e
  decisões), a Function nova `GestaoEventos` (`/api/eventos-gestao/...`, 22 ações),
  convidados no pacote público do site, seis regras no motor de notificações da
  vB.2, a entrada `EVENTOS` no ROPA e a política de retenção da categoria.

  **O que o Regimento exige e o site não tem.** Além da data (que é do
  Calendário), um evento geral ou de Área tem dois pontos de governança que
  nenhum módulo cobria: **quem pode ir ao púlpito** (Art. 111 e 111-A) e **para onde vai o
  dinheiro arrecadado** (Art. 53-E, §2º). Esta versão cobre os dois, no dossiê do
  evento, sem tocar na inscrição, na lista de espera, no check-in, no
  certificado nem na programação do evento com página, que o Directus mantém.

  **Organizadores.** O **proponente** do evento no Calendário é o **responsável
  implícito**; a Secretaria (no escopo) ou o responsável designam mais gente com um
  de três papéis: *responsável* (tudo), *organizador* (convidados) e *tesoureiro*
  (caixa). Assim o voluntário que organiza um congresso age no que é dele **sem
  ganhar uma permissão geral** — a Secretaria (`eventos_gestao`) vê todos os
  eventos, mas **não opera o caixa** se não for tesoureiro dele (segregação). O
  designado é avisado na hora.

  **Protocolo de Convidados (Art. 111, parágrafo único e Art. 111-A).** O
  organizador registra o convidado externo (preletor, cantor, banda ou grupo) e
  **declara se a liderança conhece a reputação dele**, sim ou não, sem valor
  padrão. Ao enviar o convite à análise, o sistema calcula o que ele exige:
  - **Conselho de Ética** — quando a reputação é **desconhecida**. A consulta exige
    **10 dias de antecedência** do evento (parâmetro `EVENTO_ETICA_ANTECEDENCIA_DIAS`):
    com menos, o envio é **recusado**, com a explicação (exatamente 10 dias ainda
    vale). Reputação conhecida não depende da antecedência.
  - **Nada Consta da Presidência** — nos eventos **gerais** (Níveis 1 e 2, os das
    Lideranças Gerais, Art. 111-A, §1º).
  - Se nada é exigido (evento de Área ou local com convidado de reputação
    conhecida), o convite é **autorizado na hora** — a responsabilidade pelo púlpito é
    do Dirigente ou do Supervisor (Art. 111).
  O convite só vira **AUTORIZADO** quando **todo** parecer exigido é favorável; uma
  decisão contrária **veta na hora**, mesmo faltando a outra; o Nada Consta
  não substitui o parecer da Ética. Parecer contrário e Nada Consta negado exigem
  o **motivo**, que fica registrado e é enviado à organização. **Quem convidou,
  quem enviou ou quem organiza o evento não decide sobre o próprio convidado.**
  Só o autorizado se **oficializa**, e **só o oficializado, cujo convidado autorizou
  divulgar o nome, aparece no site** (Art. 111-A, §2º: "somente após o Nada Consta o
  convite poderá ser oficializado e divulgado"). O próprio banco impede um convidado
  de ser AUTORIZADO sem os pareceres que a regra exigiu. A Ética e a Presidência
  têm uma **fila** com os convites que aguardam a decisão delas, com a contagem de
  dias até o evento; o aviso chega na hora e a rodada diária cobra o que segue sem
  decisão quando o evento está a 5 dias ou menos.

  **Caixa Flutuante de Eventos (Art. 53-E, §2º e §3º; Art. 152).** As Áreas e
  Regiões não podem manter caixa permanente: o evento tem um **caixa temporário**,
  liquidado no custeio, e o saldo positivo é **recolhido à Sede ou convertido em
  benfeitoria**, nunca guardado. O sistema:
  - só abre o caixa de evento de **Área, Região ou Geral**, já deferido ou homologado
    (o evento de uma congregação usa a tesouraria dela), e **exige a declaração** de
    que nenhuma conta bancária foi aberta para o evento nem haverá conta paralela em
    nome da Igreja ou de associação (§3º: infração gravíssima) — gravada com quem
    declarou e quando;
  - registra **entradas** (oferta voluntária, campanha, cantina e vendas, outra) e
    **saídas** (estrutura, alimentação, transporte, hospedagem, material, som e
    mídia, oferta a convidado, outra); **toda saída exige comprovante** (Art. 152,
    I) — também no banco; lançamento errado é **cancelado com motivo**, continua
    visível e sai da conta; a conta é feita em **centavos inteiros**;
  - no **encerramento**, o saldo positivo precisa de **destino por inteiro** — os destinos
    (recolhido à Sede ou benfeitoria, cada um com valor, data e comprovante)
    somam **exatamente** o saldo, sem sobra nem falta; saldo negativo exige a
    **justificativa do déficit**; saldo zero só se confirma. O prazo é de **15 dias**
    depois do fim do evento (parâmetro `EVENTO_CAIXA_ENCERRAR_DIAS`) e, vencido,
    a organização e a Tesouraria são avisadas;
  - depois de encerrado, **nem o banco aceita lançamento ou alteração** (gatilho);
  - a **Tesouraria Geral** (permissão `financeiro` com escopo global) **confere** o
    caixa ou o **devolve** para correção com motivo (volta a aberto, os destinos
    são refeitos e um novo aviso sai). **Quem encerrou não confere**: outra pessoa da
    Tesouraria precisa fazê-lo.

  **O painel e os congressos.** A Secretaria vê, por ano, os eventos gerais, de Área
  e regionais (os Congressos Unificados destacados) com o que falta em cada um:
  sem organizador, convidados em análise, caixa fora do prazo, caixa aguardando
  conferência.

  **A tela (módulo "🎪 Eventos e Congressos").** Menu novo para quem tem uma das três
  permissões de eventos **ou** `financeiro` (a Tesouraria Geral, que só enxerga a
  pílula "Caixas para conferir"), com:
  - **Painel** (Secretaria): por ano, sete indicadores e a lista de eventos gerais, de
    Área e regionais, com o selo **"Congresso Unificado"** e o que falta em cada um;
  - **Dossiê do evento** — o mesmo componente aparece no painel, em Meu Painel, na fila e
    nos caixas: cabeçalho (com o link para a página do evento no site, quando há
    `slugSite`), organizadores, convidados e caixa. O formulário de convidado faz a
    **pergunta obrigatória, sem resposta marcada**: "a liderança conhece a reputação
    deste convidado?"; a recusa dos 10 dias aparece tal qual o servidor a escreve;
  - **Fila de análise** (Ética e Presidência): cada convite com o contato, o evento, a
    contagem de dias e o formulário de decisão (motivo obrigatório quando contrária),
    com o aviso fixo de que quem convidou ou organiza não decide;
  - **Caixas para conferir** (Tesouraria): conferir ou devolver, e o caixa de quem
    encerrou não oferece "conferir".
  O **caixa** na tela: abrir exige a caixa de seleção da declaração do Art. 53-E §3º;
  saída sem comprovante é barrada antes de enviar; o encerramento mostra ao vivo
  "destinado R$ X de R$ Y" e só habilita o envio quando a soma bate **centavo a
  centavo**; saldo negativo pede a justificativa; lançamento cancelado fica riscado,
  com o motivo.
  **Meu Painel → Eventos** (qualquer login) lista os eventos que a pessoa organiza,
  abre o dossiê e traz o cartão fixo "Eventos e inscrições", com os links do site
  (`/eventos/` e `/minha-conta/`) e o aviso de que inscrição, lista de espera,
  check-in e certificado ficam lá. Na ficha do **Calendário** (Pauta e detalhe), os
  eventos de Nível 1 a 3 ou de Área/Campo ganharam o botão "Abrir dossiê do evento".

  **No site.** Os convidados já autorizados, oficializados e com divulgação consentida
  passam a aparecer: na linha "Participação: …" do cartão do evento oficial (até 4
  nomes e "+N"), no bloco "Participações especiais" da página do evento do Directus
  casado por `slugSite` (as sessões do Directus não são tocadas), na descrição do
  `.ics` e na busca. O site **só exibe o que a API manda**: a regra (Art. 111-A) é
  do sistema. O contato do convidado nunca vai ao site; cancelar o convite tira o
  nome e muda a `versao`, e o sincronizador reconstrói o site.

  **Avisos (motor da vB.2).** Seis regras. Saem **na hora**, no ato:
  `EVENTOS_ORGANIZADOR_DESIGNADO`, `EVENTOS_CONVIDADO_PARA_ANALISE` (à Ética e à
  Presidência, conforme o que o convite exige), `EVENTOS_CONVIDADO_DECIDIDO` (à
  organização) e `EVENTOS_CAIXA_PARA_CONFERIR` (à Tesouraria). Na rodada diária:
  `EVENTOS_CONVIDADO_ATRASADO` (cobra o órgão que falta quando o evento está a 5 dias
  ou menos) e `EVENTOS_CAIXA_ENCERRAR` (caixa fora do prazo).

  **Permissões.** Três novas, nunca concedidas por padrão: `eventos_gestao`
  (Secretaria), `eventos_etica` (Conselho de Ética) e `eventos_presidencia`
  (Presidência) — as duas últimas só valem com escopo global, porque decidem para a
  igreja inteira. A conferência do caixa usa a `financeiro` que já existe. Quem só
  organiza um evento não precisa de permissão nenhuma.

  **Auditoria e integridade.** `ORGANIZADOR_DESIGNADO`, `ORGANIZADOR_ENCERRADO`,
  `CONVIDADO_REGISTRADO`, `CONVIDADO_ATUALIZADO`, `CONVIDADO_SUBMETIDO`,
  `CONVIDADO_PARECER_ETICA`, `CONVIDADO_NADA_CONSTA`, `CONVIDADO_OFICIALIZADO`,
  `CONVIDADO_CANCELADO`, `CAIXA_ABERTO`, `CAIXA_LANCAMENTO`,
  `CAIXA_LANCAMENTO_CANCELADO`, `CAIXA_ENCERRADO`, `CAIXA_DEVOLVIDO` e
  `CAIXA_CONFERIDO`. O banco garante: convidado só AUTORIZADO com os pareceres
  exigidos, veto só com decisão contrária, oficialização só de autorizado; saída
  com comprovante, categoria coerente com o tipo, valor positivo; destino com
  comprovante; caixa encerrado imutável; conferido só com quem e quando; um
  organizador ativo por pessoa e evento.

  **Verificação.** 63 testes novos (regra pura e camada de banco com pool simulado); a
  suíte da API foi de 939 para **1002**. Um roteiro ponta a ponta de **167
  verificações** rodou os handlers reais contra um SQL Server 2019, com eventos reais
  do calendário: papéis do proponente, do organizador e do tesoureiro, o Protocolo de
  Convidados inteiro (10 dias a exatamente 10 e a 9, os dois órgãos, veto, ordem
  inversa, segregação de funções), a rota pública, o caixa do lançamento à conferência
  (com devolução e segunda conferência), o déficit, o prazo e o gatilho que fecha o
  caixa. Ele achou um defeito que nenhum teste unitário veria: o SQL Server **recusa
  `OUTPUT` sem `INTO` em tabela que tem gatilho** — o do caixa encerrado — e o
  lançamento falhava; corrigido com uma variável de tabela. A tela passou por DOM
  simulado (14.821 verificações, com texto de ataque em todo campo de texto), conferência
  de ids e de handlers, renderização no Edge sem interface e comparação do formato real
  das respostas com tudo o que ela lê; o site foi construído contra um servidor falso com
  e sem convidados, com resposta antiga, com erro 500 e com texto malicioso, e contra a
  produção.

  **Em produção (verificado em 01/10/2026).** O deploy do sistema passou com os testes
  e a migração 116 aplicada no Azure. As 7 rotas `GET` e as 2 `POST` testadas em
  `/api/eventos-gestao/*` respondem `401` sem sessão. `/api/agenda-publica/tudo` já
  devolve o campo `convidados` em cada evento; como ainda não há evento público
  homologado, a `versao` não mudou (`2ede5dad7ed05d97`, igual no sistema e no site) e
  nenhuma reconstrução do site foi necessária. **Nada foi cadastrado em produção:** a
  Secretaria, o Conselho de Ética e a Presidência precisam receber as permissões
  `eventos_gestao`, `eventos_etica` e `eventos_presidencia` (em Permissões) antes de o
  protocolo funcionar de ponta a ponta.

  **Decisões que o Regimento não fecha (a CLI pode reverter, cada uma é uma
  linha).**
  - **Nada Consta nos Níveis 1 e 2.** O Art. 111-A fala nos "Congressos das
    Lideranças Gerais"; adotei os eventos gerais (`NIVEL_MAXIMO_NADA_CONSTA`). Nos
    Níveis 3 a 5 vale só a consulta à Ética, quando a reputação é desconhecida.
  - **Sem exceção aos 10 dias.** O Regimento diz "obrigatória"; o envio é recusado.
  - **A reputação "conhecida" é declaração do organizador.** O sistema não a
    verifica: quem declarou fica gravado e auditado. Um organizador que declarar
    "conhecida" a todo convidado dispensa a Ética — a Presidência continua decidindo
    nos eventos gerais.
  - **Déficit é permitido, com justificativa.** O Regimento silencia sobre quem
    cobre; o sistema só registra e deixa a Tesouraria conferir.
  - **O caixa do evento não gera lançamento contábil nem "Saída" (v4.5)**, e o
    recolhimento à Sede informa o comprovante mas **não concilia com o extrato**. A
    cantina do evento entra no caixa do evento; a receita acessória da v4.21 segue para
    bazar, estacionamento e cessão de salão (não há lançamento automático entre as
    duas).
  - **Retenção:** caixa e prestação de contas, 5 anos; o contato do convidado é
    dado de terceiro, desnecessário depois do evento, e **a rotina automática de
    descarte ainda não existe** (prazo a definir pela CLI/Encarregado).
  - **Limites:** o Directus pode listar preletores nas sessões de um evento sem passar
    por este protocolo — o sistema só controla o que ele mesmo publica; e o
    Conselho Fiscal (NIF), que audita a prestação de contas (Art. 152, I), não tem
    papel próprio aqui: quem confere é a Tesouraria Geral.

## v7.5 — Escalas e voluntariado

- [x] Escala de rodízio voluntário (limpeza, portaria, louvor). *(Rodízio por
      grupos que se alternam, com geração das datas, prévia e a trava de
      habitualidade — Art. 135 §1º. A grade em si, o auto-escalador, as trocas e o
      convite em cadeia já eram da v5.6 e não foram refeitos.)*
- [x] Termo de Adesão ao Serviço Voluntário (Lei 9.608/98). *(Texto versionado com
      hash, aceite digital com IP, data e hora, ficha física, e-mail/WhatsApp e a
      ratificação coletiva "Lista de Ouro" — Art. 133 §8º. A etapa "termo assinado"
      da esteira da v5.7 deixou de ser um carimbo manual.)*
- [x] Remoção da escala por perda de confiança (sem vínculo trabalhista).
      *(Efeito imediato, aviso ao voluntário e ao líder, reintegração, sem ligação com
      a disciplina — Art. 133-D.)*
- [x] **Self-service "Minhas Escalas" (vB.5)** — ver o item de integração já
      registrado na v5.6 (auto-escalador), que é quem cobre
      aceitar/recusar/trocar de verdade. *(A v5.6 já entregou aceitar, recusar,
      confirmar, trocar e declarar indisponibilidade; a v7.5 acrescenta o Termo de
      Adesão, os rodízios do voluntário, o afastamento que libera as escalas já
      marcadas e a tela do líder da equipe.)*

  Entrega: migração 117 (`sql/migrations/117_escalas_voluntariado.sql`),
  `shared/voluntariado.js` (a regra, **pura**), `shared/voluntariadoDb.js` (leitura,
  gravação e decisões), a Function nova `GestaoVoluntariado` (`/api/voluntariado/...`,
  24 ações), cinco regras no motor de notificações da vB.2, a entrada `VOLUNTARIADO` no
  ROPA e a política de retenção da categoria. Tocam as telas e rotas que já existiam:
  `GestaoEscalas` (v5.6), `GestaoHabilitacaoVoluntarios` (v5.7), `shared/escalas.js` e
  `shared/habilitacaoVoluntarios.js`.

  **O que a v5.6 e a v5.7 já faziam, e o que faltava.** Já existiam: equipes, serviços,
  alocações, auto-escalador por "quem serviu por último", convite em cadeia, trocas
  aprovadas pelo líder, indisponibilidade e confirmação (v5.6); e a esteira de
  habilitação, a regra dos 6 meses e o registro de desligamento (v5.7). Faltava o que o
  Regimento pede além disso: **revezamento por grupos** para a tarefa braçal
  (Art. 135), **prova do aceite** do Termo (Art. 133 §8º) — a esteira só tinha um
  carimbo de quem administra —, **efeito real** na remoção da escala (a marca "remover
  da escala" só desativava a pessoa na equipe, sem tocar nas escalas já marcadas e, sem
  o id da equipe, não fazia nada) e o **afastamento** que de fato libera quem já estava
  escalado (Art. 133 §7º, II).

  **Natureza da equipe.** Cada equipe ganhou uma natureza: liturgia e louvor,
  zeladoria e limpeza, portaria/recepção/segurança, cantina e cozinha, ou outra. As
  três do meio (**zeladoria, portaria e cozinha**) são as de serviço braçal e repetitivo,
  onde o Regimento exige o revezamento e a "habitualidade" vira passivo trabalhista. As
  equipes que já existiam ficam como "outra": nada é reclassificado sozinho.

  **Rodízio voluntário (Art. 135 §1º).** Um rodízio é de uma equipe, num dia da semana e
  hora, a cada 1 a 4 semanas, com uma **data de partida** que cai nesse dia. Tem
  **grupos** (de 2 a 12); cada voluntário está **em um grupo só** do rodízio — "grupos
  distintos se alternam" — e quem entra num grupo vira membro ativo da equipe, sem perder
  a frequência preferida que já tinha. **Um rodízio de um grupo só não gera nada**: o
  sistema recusa e explica. O grupo de cada data sai de uma **conta** (quantas voltas
  completas desde a data de partida, módulo o número de grupos), não de um ponteiro
  guardado: gerar de novo, cancelar uma data ou pular um mês **não desalinha** o
  revezamento. **Gerar** cria os serviços das próximas 1 a 26 semanas (padrão 8) — como
  **rascunho**, ou já publicados avisando cada convidado —, cada um ligado ao rodízio e
  ao grupo, e convida os membros do grupo da vez. Quem **declarou indisponibilidade**
  naquela data, perdeu a formação que a equipe exige (v6.9) ou não está mais ativo na
  equipe **não é convidado** e aparece numa lista de "vagas sem cobertura", com o motivo.
  Gerar duas vezes o mesmo período **não duplica** (o banco também impede dois serviços
  ativos do mesmo rodízio na mesma data; um serviço cancelado libera a data). Há
  **prévia** sem gravar nada e **cancelar os futuros em rascunho** para ajustar os grupos
  e gerar de novo. O auto-escalador **não mexe** em serviço de rodízio. **Quem recusa uma
  escala de rodízio não dispara o convite em cadeia** (que traria alguém de outro grupo):
  o líder é avisado da vaga e decide.

  **Trava de habitualidade (Art. 135 §1º, II).** Em equipe de zeladoria, portaria ou
  cozinha, quem está nas **últimas 3 escalas seguidas** é apontado (o limite é o parâmetro
  `ESCALA_HABITUALIDADE_SEQUENCIA`). A janela vai de 90 dias atrás a 30 dias à frente,
  para pegar o padrão antes de ele se repetir mais uma vez. Quem folgou na última escala
  está revezando e não aparece; recusar ou ser cancelado quebra a sequência. A tela diz se
  a equipe já tem rodízio ("confira os grupos") ou não ("crie um rodízio"), e a rodada
  diária avisa o líder e quem administra escalas, **uma vez por equipe e por mês** enquanto
  a situação durar. As equipes de louvor (liturgia) **não são vigiadas**: o Art. 135 trata
  da conservação do patrimônio e da arrecadação, e o ministério de louvor é contínuo por
  natureza.

  **Termo de Adesão (Art. 133 §8º; Lei 9.608/98, arts. 1º a 3º).** O texto (oito itens,
  cada um citando o dispositivo) está no código, com **versão e hash**: natureza gratuita e
  sem vínculo, objeto, autonomia e direito de recusa (§7º), despesas só com Ordem de
  Serviço prévia (§4º), sem cachê nem comissão (§3º e Art. 135 §3º), remoção da escala como
  única consequência (Art. 133-D), ciência de antecedentes e imagem (§§5º e 6º) e a
  informação de que o IP, a data e a hora são guardados. A frase de aceite é a do
  Regimento: "Li, aceito as normas estatutárias e concordo com o regime de trabalho
  voluntário". São **quatro formas de prova**, cada uma com o que a caracteriza — e o
  banco recusa a forma sem a sua prova:
  - **Aceite digital** (a própria pessoa, em Meu Painel → Minha Habilitação): guarda
    versão, **hash do texto**, **IP**, instante exato e data de Brasília. **Sem IP
    público identificável o aceite é recusado** (o Regimento o exige), com a orientação
    de procurar a Secretaria. O IP é validado com o analisador do próprio Node e só vale
    endereço **público** (loopback, rede privada, link-local, reservado e de documentação
    não provam de onde veio a conexão); o cabeçalho do Azure (`x-azure-clientip`) tem
    precedência sobre `x-client-ip` e `x-forwarded-for`. Como o `x-forwarded-for` pode
    ter sido **escrito pelo cliente**, o aceite guarda **também a cadeia inteira dos
    cabeçalhos de origem** (coluna `CadeiaCabecalhos`, limpa e cortada em 400 caracteres):
    a prova não depende de o primeiro valor ser honesto. O IP não aparece para o
    voluntário, **nem para a Secretaria, nem na trilha de auditoria** (que é imutável e
    não deve replicar dado pessoal): fica só na tabela da adesão.
  - **Ficha física** (cláusula de voluntariado na Ficha de Membro, §8º, I) e
    **e-mail/WhatsApp** com resposta positiva (§8º, II, "c"): a Secretaria registra a data
    da assinatura/resposta e **onde o documento ou a conversa está arquivado**. A prova é
    esse documento; o sistema não guarda texto nenhum.
  - **Lista de Ouro** (§8º, III): a Secretaria, com escopo geral para assembleia e reunião
    de obreiros, ou da congregação para escala de serviço, registra a ratificação. O
    sistema entrega a **frase que precisa estar no cabeçalho da lista** (com versão e
    hash), exige que quem registra **confirme que o cabeçalho a trouxe** e dá adesão a
    cada signatário: a presença da sessão, quem aceitou ou confirmou a escala (quem
    recusou não assina) e matrículas avulsas. Quem já aderira não é sobrescrito, e
    repetir a lista é inofensivo. A adesão guarda a data da lista e a marca de
    **convalidação do período anterior** (efeito sanador, §8º, III, "b"). Como a adesão é
    **irreversível**, a ratificação tem travas: **a data da lista é a da própria sessão ou
    da própria escala** (não se carimba uma data passada qualquer), **nunca anterior à Lei
    9.608/98** (18/02/1998); a origem "Assembleia Geral" só vale para sessão do órgão
    Assembleia Geral; e **cada matrícula avulsa precisa estar no escopo de quem registra**
    — uma só fora dele recusa o pedido inteiro, sem gravar nada. Quem não tem escopo geral
    só vê, na lista de ratificações, as que ele mesmo registrou.
  Há **uma adesão por pessoa**. A prova **não se altera nem se apaga** (gatilho no banco,
  também para o registro da ratificação). A **etapa "termo" da esteira** (v5.7) só fecha
  se a adesão existe. A tela da Secretaria mostra, por congregação, quem serve em equipe
  e **ainda não aderiu** (primeiro na lista) e a rodada diária avisa quem cuida da
  habilitação, uma vez por congregação e por mês.

  **Remoção da escala e reintegração (Art. 133-D).** "Irmão, você não está mais na escala
  a partir de hoje": quem **lidera a equipe** (sem precisar de permissão nenhuma) ou
  quem administra escalas ou a habilitação (no escopo) remove um voluntário de uma
  equipe ou, sem indicar a equipe, de todas as que alcança. **Na hora**: a pessoa sai da
  equipe e dos grupos de rodízio dela, as **escalas futuras são canceladas** (o que já
  aconteceu fica), as trocas pendentes que dependiam delas são recusadas, o voluntário é
  avisado ("a partir de hoje", sem desconto, multa ou penalidade, **sem o motivo** no
  texto) e o líder é avisado das vagas. O motivo e o tipo (perda de confiança, mudança,
  indisponibilidade, saída da igreja, outro) ficam na ficha de RH, **sem nenhuma ligação
  com a disciplina** — nem chave estrangeira; o texto livre do motivo **não vai para a
  trilha de auditoria** (que é imutável): ali ficam só o tipo e o tamanho do texto. Ninguém
  remove a si mesmo. Quem foi removido **não volta por outra porta** (nem por "adicionar à
  equipe" da v5.6, nem por um grupo de rodízio, nem por troca de escala): só pela
  **reintegração**. O **líder só reintegra o que ele mesmo registrou** — não desfaz a
  decisão da gestão nem a de outro líder —, **ninguém se reintegra** e a gestão (no escopo)
  reintegra qualquer um; a reintegração devolve a pessoa à equipe e avisa, mas **não
  restaura as escalas canceladas**. O **líder removido da própria equipe perde os poderes
  de líder dela** (remover, reintegrar, aprovar troca, ver a equipe) até ser reintegrado:
  a remoção não troca o líder cadastrado, então o sistema não o trata como líder enquanto
  houver remoção aberta. As recusas de remoção **não citam nome** nem distinguem "não
  existe" de "não é da equipe", para o líder (que não tem permissão nenhuma) não varrer
  matrículas atrás de nomes. Duas remoções simultâneas do mesmo voluntário viram uma só
  (a desativação na equipe é a porta de entrada dentro da transação). A mesma função
  atende o botão "remover da escala" do formulário de desligamento da v5.7, que agora
  **pede confirmação**.

  **Direito de recusa e afastamento (Art. 133 §7º).** Recusar escala não tem consequência
  alguma: o auto-escalador ordena só por quem serviu há mais tempo, e **não existe coluna
  de falta, multa ou penalidade** nas alocações. Ao declarar um período de indisponibilidade
  (afastamento temporário), a pessoa vê antes **quais escalas dela caem naquele
  período** e escolhe liberá-las: elas são canceladas sem penalidade, o líder é avisado
  da vaga e as trocas pendentes que dependiam delas caem; as de fora do período e as que
  **já aconteceram** não são tocadas.

  **A tela.**
  - **Escalas de Serviço**: coluna "Natureza" nas equipes (com a etiqueta de revezamento
    obrigatório); seção **Rodízios voluntários** (equipes operacionais ainda sem rodízio,
    formulário de novo rodízio, cartões com grupos, voluntários, próximas datas, prévia,
    geração, cancelamento dos futuros e desativação); **Trava de habitualidade**;
    **Remoções da escala**, com o formulário e a reintegração. O serviço de rodízio vem
    com etiqueta e sem o botão do auto-escalador.
  - **Habilitação de Voluntários**: **situação do Termo** por congregação, formulário de
    ficha/mensagem e a **Ratificação coletiva** com a frase do cabeçalho copiável.
  - **Meu Painel → Minha Habilitação**: o cartão do Termo, com a caixa de aceite; **Minhas
    Escalas**: faixa se ainda não aderiu, "Meus rodízios" (grupo e próximas datas), o
    aviso de que recusar é um direito, o afastamento que pergunta se libera as escalas e,
    para quem lidera equipe, **"Equipes que eu lidero"** com remover e reintegrar.

  **Avisos (motor da vB.2).** Cinco regras. Saem **na hora**: `ESCALA_ALTERACAO_PARTICIPACAO`
  (ao voluntário removido ou reintegrado), `ESCALA_VAGA_ABERTA` (ao líder: remoção,
  recusa em rodízio ou afastamento) e `ESCALA_RODIZIO_ESCALADO` (aos convidados de um
  rodízio publicado). Na rodada diária: `ESCALA_HABITUALIDADE` e
  `VOLUNTARIADO_TERMO_PENDENTE`. Nenhuma permissão nova: valem `escalas` e
  `habilitacao_voluntarios`, que já existiam e **não vêm concedidas a papel nenhum**.

  **Auditoria e integridade.** `ADESAO_REGISTRADA`, `RATIFICACAO_REGISTRADA`,
  `NATUREZA_DEFINIDA`, `RODIZIO_CRIADO`, `RODIZIO_GERADO`, `RODIZIO_FUTUROS_CANCELADOS`,
  `RODIZIO_DESATIVADO`, `RODIZIO_REATIVADO`, `GRUPO_CRIADO`, `GRUPO_DESATIVADO`,
  `MEMBRO_ENTROU_NO_GRUPO`, `MEMBRO_SAIU_DO_GRUPO`, `REMOCAO_DA_ESCALA`,
  `REINTEGRADO_NA_ESCALA` e `AFASTAMENTO_ESCALAS_LIBERADAS`. O banco garante: cada forma de
  adesão só com a prova dela, uma adesão por pessoa, adesão e ratificação imutáveis, um
  grupo só por pessoa e rodízio, nome de grupo ativo único, um serviço ativo por data e
  rodízio e a natureza dentro do catálogo.

  **Verificação.** 189 testes novos (regra pura, camada de banco com pool simulado, os
  handlers com valores em texto como o HTTP entrega e o escape do e-mail); a suíte da API
  foi de 1002 para **1191**. Um roteiro ponta a ponta de **237 verificações**
  rodou os três handlers reais contra um SQL Server 2019 recriado do zero com as 117
  migrações: o aceite digital (inclusive sem IP, com porta no IP e repetido), os
  gatilhos e os CHECK de cada forma, a ficha e a mensagem, o rodízio de ponta a ponta
  (grupos, indisponibilidade, geração, idempotência, índice único, publicação, recusa,
  cancelamento e nova geração), a habitualidade (incluindo o limite configurável), a
  remoção, a reintegração e a volta por outras portas, o afastamento com troca dentro e
  fora do período, a Lista de Ouro por assembleia e por escala, a etapa do termo na
  esteira, os dois avisos periódicos, a auditoria (sem o IP), o ROPA contra as tabelas
  reais e a migração rodada de novo sobre o banco já migrado. A tela passou por DOM
  simulado (127 verificações, com texto de ataque em todo campo do servidor), conferência
  de ids e handlers e checagem de fim de linha. A revisão achou, além do que era da
  versão: **`lista`, `detalhe` e `elegibilidade-menores` da v5.7 só olhavam o escopo** —
  qualquer pessoa logada com escopo na congregação (ou, na elegibilidade, qualquer login)
  via o estado da habilitação dos voluntários; passam a exigir a permissão
  `habilitacao_voluntarios`. E as telas de escala mostravam a hora do serviço 3 horas
  antes do que foi marcada (a hora é "de parede", guardada como se fosse UTC); corrigido
  nas telas de escala.

  **Revisão de segurança (02/10/2026).** Depois da entrega, a versão passou por três
  verificações independentes do que os testes funcionais cobrem: **(1)** uma bateria de
  **177 verificações de ataque** contra o SQL Server — a matriz de autorização (gestor de
  outra congregação, líder de outra equipe, membro comum, permissão trocada, em todas as
  ações novas e nas rotas antigas), injeção de SQL e de HTML em cada campo de texto,
  entradas malformadas (nulo, vazio, negativo, decimal, lista, objeto, 5.000 caracteres,
  datas do ano 1 ao 9999) e a prova de que uma recusa por falta de permissão responde
  igual para o objeto que existe e para o que não existe; **(2)** **20 verificações de
  corrida** com vários processos acessando ao mesmo tempo, cada um com a sua conexão: 8
  aceites do mesmo voluntário, 6 gerações do mesmo rodízio, 5 remoções e 5 reintegrações
  simultâneas, a mesma pessoa entrando em dois grupos, 4 ratificações da mesma lista e a
  geração do rodízio ao mesmo tempo que a remoção de um dos voluntários; **(3)** uma
  **revisão adversarial independente do código**, feita por outro agente só de leitura. O
  que apareceu, e foi corrigido (commits `fbe4516`, `afe5b53` e `a5153d7`):
  - **XSS armazenado (alta).** O painel de notificações e o e-mail escreviam a mensagem
    **sem escapar**; um gestor com `escalas` podia dar a um rodízio um nome com HTML, pôr o
    Presidente num grupo e gerar o rodízio publicando — o script rodaria no navegador dele
    e levaria o token de sessão. Corrigido **na saída** (painel, busca global e e-mail
    escapam), com **teste que falha sem a correção**, e na entrada (nomes de rodízio,
    grupo e equipe não aceitam `<` nem `>`). Também passam a exigir o escopo o
    voluntário que o gestor põe num grupo e as matrículas avulsas de uma ratificação.
  - **Escopo das escalas (v5.6).** `escalas` valia em **qualquer congregação** (incluir
    voluntário em equipe alheia, aprovar troca, ver pendências). Agora só na congregação
    que o escopo alcança. Na habilitação (v5.7), o desligamento, a leitura de
    desligamentos, a marca "contato com menores" e a elegibilidade também respeitam o
    escopo.
  - **Ratificação (média-alta).** Matrícula avulsa de qualquer congregação e data passada
    qualquer viravam adesões **irreversíveis**; ver as travas acima.
  - **Líder removido** voltava a se reintegrar e o líder desfazia a decisão da gestão; ver
    "Remoção da escala e reintegração".
  - **Trocas de escala** furavam a remoção e podiam **ressuscitar** uma alocação cancelada;
    agora o destino precisa ser da equipe, ativo nela e não removido, a escala de origem
    precisa estar ativa, e a recusa não revela a agenda de terceiros.
  - **Corridas:** remoção em duplicata (registros de RH e avisos repetidos) e a remoção que
    perdia para uma geração simultânea (o removido recebia convite); `cancelar-futuros`
    podia desfazer uma publicação feita ao mesmo tempo. Recusar a mesma escala duas vezes
    reenviava o convite em cadeia.
  - **Entrada:** id que não é inteiro positivo, texto maior que a coluna ou campo que não é
    texto viravam erro 500 em toda a área; agora 400 na entrada, com limites de tamanho e
    tetos (150 voluntários por grupo, 50 rodízios ativos por congregação, 100 voluntários ao
    criar um grupo).
  - **LGPD:** o texto livre do motivo e da observação ia para a auditoria imutável; agora só
    o tipo e o tamanho. A recusa de adesão repetida deixou de devolver o IP.
  - **Um erro meu, pego e corrigido na hora:** a primeira correção (`fbe4516`) trazia o
    regex `/^d+$/` no lugar de `/^\d+$/` na habilitação e **recusava todo id em texto**
    (`?congregacaoId=1`, como o HTTP entrega) — os testes passavam números e não viram.
    Ficou no ar cerca de 8 minutos; o conserto (`afe5b53`) veio com um teste que chama os
    handlers com valores em texto (falha com o erro, passa sem ele).
  Verificado também em produção, sem alterar nada: um token assinado com o **segredo
  padrão** do repositório é recusado (401), então a produção usa um segredo próprio. Depois
  do último deploy (02/10/2026; testes e migração com a coluna nova no Azure): 18 rotas
  testadas (as de `/api/voluntariado/*`, `lista` e `desligamentos` da habilitação, `equipes`
  e `trocas` das escalas) respondem `401` sem sessão, o `script.js` servido traz o escape
  do painel de notificações e a confirmação do desligamento, e a agenda pública não mudou
  (`versao` `2ede5dad7ed05d97`).

  **Em produção (verificado em 01/10/2026).** O deploy do sistema passou com os testes e a
  migração 117 aplicada no Azure. As 9 rotas `GET` e as 6 `POST` testadas em
  `/api/voluntariado/*`, mais `lista` e `elegibilidade-menores` da habilitação, respondem
  `401` sem sessão; o `script.js` servido já traz o bloco novo; a agenda pública não mudou
  (`versao` `2ede5dad7ed05d97`) e o site não foi tocado. **Nada foi cadastrado em
  produção:** para usar, a Secretaria precisa receber as permissões `escalas` e
  `habilitacao_voluntarios` (em Permissões) — as duas continuam sem concessão a papel
  algum; as equipes existentes seguem como "outra" até alguém definir a natureza de
  zeladoria, portaria e cozinha; e ninguém aderiu ao Termo ainda (os voluntários aderem em
  Meu Painel, ou a Secretaria registra a ficha ou a Lista de Ouro).

  **Decisões que o Regimento não fecha (a CLI pode reverter, cada uma é uma linha).**
  - **O texto do Termo é um rascunho jurídico.** Foi redigido a partir do Art. 133 e da Lei
    9.608/98 (arts. 1º a 3º); **convém um parecer jurídico antes de pô-lo em uso** — o
    aceite grava o hash e a versão, então trocar o texto cria a versão 2 sem invalidar quem
    já aderiu.
  - **A cessão de imagem, voz e propriedade intelectual (§6º) não é aceita dentro do
    Termo**: o Termo só dá **ciência** dela. Embutir um consentimento específico num
    termo de outra finalidade o tornaria frágil (LGPD); o aceite do uso de imagem segue o
    módulo de consentimento.
  - **Uma adesão por pessoa e qualquer versão vale.** Texto novo vale para quem adere
    depois; não há campanha de reaceite.
  - **Habitualidade: 3 escalas seguidas, só em zeladoria, portaria e cozinha.** O número é
    parâmetro (`ESCALA_HABITUALIDADE_SEQUENCIA`); o Regimento não fixa um.
  - **"Voluntário", para a cobertura do Termo, é quem está ativo em equipe de escalas.** Quem
    coopera sem estar numa equipe não aparece nem recebe aviso; a Lista de Ouro e o aceite
    em Meu Painel os alcançam.
  - **Lista de Ouro:** o sistema não vê o papel; **quem registra atesta o cabeçalho**. Para
    assembleia e reunião de obreiros os signatários vêm da presença lançada no sistema
    (ou de matrículas avulsas) e o registro é só da gestão com escopo geral.
  - **A reintegração não restaura escalas canceladas** e a pessoa precisa ser recolocada
    no grupo do rodízio.
  - **O motivo da remoção fica na ficha de RH e com o líder da equipe**, nunca no aviso ao
    voluntário.
  - **Fora desta versão**, por serem questões do financeiro e não da escala: o reembolso só
    com Ordem de Serviço escrita prévia (Art. 133 §4º), a vedação da "diarista disfarçada" —
    pagar valor fixo a uma pessoa só para limpar (Art. 135 §2º) —, a proibição de cachê a
    membro (§3º) e a de comissão em cantina e bazar (Art. 135 §3º). O Termo informa o
    voluntário dessas regras, mas **nada no sistema as impede ainda**; o Art. 135 §4º
    (higiene e proteção do voluntário na cozinha) também fica como orientação.
  - **Retenção:** a **adesão** (data, versão, hash, forma) é a prova da Lei 9.608/98 e **não
    tem prazo final**. O **IP e os cabeçalhos do aceite digital** são dado pessoal que só
    serve para provar a adesão numa eventual reclamação trabalhista; passados **5 anos do
    último serviço** (a prescrição trabalhista, CF art. 7º, XXIX, é de 5 anos na vigência do
    vínculo e 2 depois dele) eles deixaram de ser necessários e são **anonimizados** (LGPD
    art. 16) — ver "Pontos que a revisão deixou abertos", abaixo. Escalas e rodízios ficam
    como prova do revezamento. O motivo da indisponibilidade é texto livre e pode revelar
    saúde: a tela orienta a não detalhar.
  - **Pontos que a revisão deixou abertos — todos fechados em 02/10/2026** (nada disto vai
    para a Trava 7-A):
    - **IP do aceite: medido no ar, e a escolha mudou.** Um endpoint de diagnóstico
      temporário (commit `113a8cb`, apagado em seguida) mostrou como o Static Web Apps
      entrega os cabeçalhos: o `x-forwarded-for` chega como `<o que o cliente escreveu>, <IP
      real>:<porta>, <IP do proxy>:<porta>` — o Azure **acrescenta à direita** —, e o
      `x-azure-clientip` e o `x-client-ip` chegam **exatamente como o cliente os escreveu**
      (não são filtrados). A regra anterior preferia justamente o `x-azure-clientip`, que
      qualquer um forja. Agora o IP é o **penúltimo** valor do `x-forwarded-for`
      (`shared/origemConexao.js`; uma entrada só vale ela mesma, que é o pedido direto à
      Function); endereço privado, reservado, de documentação ou malformado é recusado; e o
      sistema **nunca procura outro valor na lista** (varrer pegaria um forjado). A cadeia
      inteira segue guardada com o aceite, para o diagnóstico poder ser refeito. A mesma regra
      passou a alimentar a trava de tentativas anônimas (`limiteTaxa.js`), que usava o
      primeiro valor e podia ser contornada trocando-o a cada pedido. **Fora deste
      repositório:** o site público (`site/api/src/lib/rateLimit.js`) ainda usa o primeiro
      valor; é outro Static Web Apps e precisa da sua própria medição antes de mudar.
    - **Idade para aderir (Código Civil, arts. 3º e 4º).** Menor de 18 anos **não adere pelo
      aceite digital** — nem o cadastro sem data de nascimento (não se presume maioridade). A
      adesão dele é dada pelo **responsável legal**, de duas maneiras: **no sistema** (o
      responsável cadastrado pela Secretaria aceita a "Autorização do Responsável" — ver
      "Termo do menor aceito pelo responsável", abaixo) ou pela **ficha (ou a mensagem)
      assinada pelo responsável**, registrada pela Secretaria com o **nome e o vínculo de
      quem assinou** (pai, mãe, tutor ou outro responsável legal), obrigatórios para o menor e
      conferidos também pelo banco (`CHECK`). Na Lista de Ouro, quem o cadastro mostra como
      menor fica de fora e a tela diz quantos. A cobertura do Termo marca "menor de 18" e se
      há responsável cadastrado; a data de nascimento não sai em resposta nenhuma. **O
      Regimento e a Lei 9.608/98 não tratam a idade: esta é a leitura conservadora e convém
      parecer jurídico** (a regra é a constante `MAIORIDADE`; o jovem de 16 a 17 anos poderia
      aderir assistido, se a CLI assim decidir).
    - **Meus Dados (LGPD): só sob pedido do titular.** Nada do voluntariado é exportado por
      rotina. Quando a pessoa pede, o pacote traz a adesão (forma, data, IP e cabeçalhos,
      responsável), as equipes, os grupos de rodízio, os serviços, as indisponibilidades e as
      remoções (tipo e datas); ficam de fora o **texto escrito por outras pessoas** (o motivo
      da remoção) e **quem registrou** cada ato, com o aviso de que se pedem ao Encarregado
      de Dados. A revisão achou que **a rota não exigia sessão** (bastava saber o número da
      matrícula); agora exige sessão e só devolve a matrícula da própria sessão, mesmo para a
      Secretaria; termos pendentes não bloqueiam, porque o direito de acesso não depende de
      assinar nada.
    - **Anonimização do IP vencido (a "regra dos 5 anos").** Rotina diária
      (`NotificacoesAgendador`, sem falhar a rodada de avisos) troca o IP por `anonimizado` e
      apaga os cabeçalhos da adesão digital que tem **mais de N dias e cuja pessoa não serve
      mais**: sem equipe ativa e sem serviço nos últimos N dias. N é o parâmetro
      `VOLUNTARIADO_IP_RETENCAO_DIAS` (padrão **1.825**; valor inválido cai no padrão, para um
      erro de digitação nunca anonimizar todo mundo). O gatilho da adesão (`CREATE OR ALTER`,
      reaplicado a cada deploy) continua recusando apagar e alterar qualquer coisa, e passou
      a admitir **só** essa troca: o IP vira `anonimizado` (e só onde havia IP) e a cadeia vira
      nula. Cada rodada que anonimiza grava **uma** linha de auditoria (lote, sem usuário, só a
      contagem e o prazo). O ROPA declara o prazo.
    - **Avisos em ciclo.** Remover e reintegrar a mesma pessoa em sequência mandava 2 a 3
      avisos por volta. Agora o voluntário recebe **no máximo 4 avisos de alteração de
      participação em 24 horas**; o fato segue registrado na ficha de RH e na auditoria, só o
      aviso para (`limiteDia` em `notificarAgora`). O aviso do rodízio publicado sai em lotes
      de 8 em paralelo, em vez de um e-mail por vez.
    - **Escopo `DEPARTAMENTO`: é o desenho, sem alteração.** O departamento e a Secretaria
      alcançam todas as congregações; os avisos de habitualidade e de termo pendente chegarem
      a quem tem esse escopo em qualquer congregação **é o comportamento pretendido**. Fica
      registrado para não ser reaberto como defeito.
    - **Content-Security-Policy: primeiro passo feito, o resto é decisão à parte.** Em
      `app/staticwebapp.config.json` entram `frame-ancestors 'none'` (ninguém embute o sistema
      em outro site, o que impede o clique disfarçado), `object-src 'none'`, `base-uri 'self'`
      e `form-action 'self'`, mais `X-Frame-Options: DENY`. Não quebram nada: o sistema não usa
      iframe, `<base>` nem formulário para fora. **Atenção ao lugar do arquivo:** o deploy
      publica a pasta `app` (`app_location`), então o `staticwebapp.config.json` da **raiz do
      repositório não é lido pelo Azure** — as suas regras de `routes` e de `404` nunca
      valeram (medido: um caminho inexistente responde 404, e não a reescrita para
      `index.html` que o arquivo descreve). Por isso a configuração nova mora em `app/` e
      traz **só** os cabeçalhos, sem ativar de repente aquelas regras antigas. O `nosniff` e
      a política de referência já vêm do próprio Azure (`Referrer-Policy: same-origin`, mais
      estrita do que a que se pensou em pôr). O que **não** entra é a restrição de
      `script-src`, que é a que de fato
      barraria um XSS: o sistema tem **861 atributos de evento em linha** (`onclick=` e
      semelhantes: 466 em `index.html` e 395 em `script.js`), que a política estrita
      bloquearia. Trocá-los por ouvintes de evento é uma reforma da tela inteira, sem ganho
      funcional, e **não é item de Trava**: é um projeto próprio, a decidir quando valer o
      custo. Uma CSP intermediária (limitar de onde a tela carrega script, fonte e imagem e
      para onde ela envia dados, mantendo os atributos em linha) é possível e barraria o
      envio de dados a site de terceiros, mas pede um período de teste em modo "só relatar"
      com um coletor de relatórios, para não derrubar a tela por esquecer uma origem.
    - **Acesso do membro por PIN (migração 118).** O "Meu Painel" do membro comum **abria só
      com a matrícula**, sem senha e sem sessão — e a matrícula é um número em sequência. Agora
      todo membro entra com **matrícula + PIN de 4 números** que ele mesmo cria, confirmando o
      código de 6 dígitos enviado ao e-mail cadastrado (ou, quem não tem e-mail, com um **PIN
      provisório** que a Secretaria gera na ficha da pessoa, entrega pessoalmente, vale 7 dias e
      é trocado ao entrar). Quatro dígitos são poucos (10 mil combinações), então a segurança
      está em outras travas: a tentativa de PIN é **reservada no banco antes de conferir** (14
      chutes ao mesmo tempo de 14 origens: só 5 são contados), **5 erros bloqueiam 15 minutos e
      o bloqueio cresce** (1 h, 4 h, 24 h); PIN fácil não é aceito (`0000`, `1234`, `1212`, um
      ano, a data de nascimento ou o final da matrícula da própria pessoa); o PIN fica só como
      hash com sal e com o segredo do sistema (um vazamento só do banco não o revela); a
      resposta de falha é **uma só** para matrícula inexistente, sem PIN, PIN errado e pessoa
      bloqueada; a sessão do PIN é de **membro, sem permissão nenhuma** (quem tem acesso
      administrativo continua entrando com a senha). O código do e-mail passou a **queimar no
      quinto erro** e a ter uma mensagem de falha única; o **login da liderança**, que não tinha
      limite de tentativas, ganhou o bloqueio (10 erros) e a mesma mensagem única. "Esqueci o
      PIN" não tranca ninguém: o código do e-mail (ou o PIN provisório) cria outro. O PIN nunca
      vai para a auditoria, o log ou o e-mail. Risco que sobra, dito sem rodeio: um PIN de 4
      dígitos protege dado pessoal do próprio membro, não dá a um atacante com muitos
      endereços e paciência a mesma garantia de uma senha longa — por isso ele **não abre
      nenhuma função administrativa**.
    - **Rotas de autoatendimento: todas exigem sessão.** As rotas "meus dados" de v1.x
      tratavam a matrícula da URL como a própria pessoa, sem conferir nada. Agora exigem a
      sessão e só valem para a matrícula da sessão (`auth.exigirTitular`): `MeusDadosLGPD`,
      `AtualizarMeusDados`, `MinhaFoto`, `MeusVinculosFamiliares`, `SolicitarEdicaoPessoa`,
      `MinhasSolicitacoesLGPD`, `MinhaFrequencia`, `SolicitarJustificativa`, `SolicitarCarta`,
      `MeusLancamentosTesouraria` e `AutolancamentoTesouraria`. Duas — o consentimento LGPD e o
      PDF da carta — a Secretaria também usa na ficha da pessoa, e aceitam o titular **ou** a
      permissão `pessoas` com a congregação da pessoa no escopo
      (`shared/titular.js`); o registro do consentimento passou a gravar **quem está na sessão**
      (antes vinha do corpo). `RadarDisciplinar`, que listava sem login nome e faltas de todos os
      membros em risco, agora exige `disciplina` e o escopo. `RegistrarAuditoria`, que deixava
      qualquer um escrever na trilha de auditoria, foi **removida** (nenhuma tela a usava; só o
      servidor grava a trilha). A recusa é a mesma exista ou não a matrícula, e matrícula só vale
      na forma canônica (`020`, `0x14` e `1e1` não são matrículas). Continuam abertas **de
      propósito**, por serem a porta de entrada ou dado público: a agenda pública, a lista de
      congregações, a consulta de protocolo da Ouvidoria, a verificação de certificado, o
      pedido e a confirmação do código, a entrada por PIN, o login da liderança e o registro de
      presença com a senha da reunião.
    - **Termo do menor aceito pelo responsável (migração 119).** O responsável legal adere
      **pelo menor, no sistema**: a Secretaria (permissão `habilitacao_voluntarios`, congregação
      do menor no escopo) cadastra quem é o responsável — pai, mãe, tutor ou outro, **depois de
      conferir um documento** (certidão de nascimento, RG, termo de tutela), que fica
      descrito no cadastro — e o responsável entra com a **própria matrícula e PIN**, lê a
      "Autorização do Responsável" e marca a caixa. Fica uma adesão de forma `CLICK_RESP` no
      nome do menor, com a **matrícula, o IP, a data e a hora do responsável**, o vínculo
      cadastrado e a versão e o hash do texto. Só o responsável **ativo** daquele menor aceita;
      o menor precisa ter menos de 18 anos e o responsável, 18 ou mais; até 4 responsáveis por
      menor; revogar o cadastro não apaga a adesão já dada (a Secretaria, se a família retirou
      a autorização, remove o menor das escalas). O cadastro do responsável é prova: o banco
      recusa apagar ou alterar (só admite revogar), e o IP do aceite é **dado do responsável**:
      o menor não o recebe no Meus Dados, o responsável sim. **A adesão dada pelo responsável
      vale enquanto a pessoa é menor**: ao completar 18 anos ela precisa confirmar a própria
      — por isso "uma adesão por pessoa" virou "uma por pessoa **e por fase**" (a do
      responsável e a dela; a mais recente é a que vale), a tela mostra "renovar", a cobertura
      e o aviso de termo pendente passam a incluí-la e a Lista de Ouro a trata como quem ainda
      não aderiu. O **texto** (oito cláusulas: identificação do responsável, adesão nos termos
      da Lei 9.608/98, atividades próprias da idade e nunca noturnas, perigosas ou que
      atrapalhem a escola, supervisão por adulto, liberdade de recusar e de revogar, dados
      do menor no melhor interesse dele, validade até os 18 anos e o registro do IP) foi
      **aprovado pelo responsável pelo projeto em 02/10/2026**. A igreja não tem advogado: o
      texto não passou por parecer jurídico, e qualquer ajuste futuro é pedido por ele. O ponto
      que um parecer olharia primeiro é a leitura do trabalho do adolescente (Constituição art.
      7º, XXXIII; ECA arts. 60 a 69) aplicada ao serviço voluntário religioso.
    - **Decisões do responsável pelo projeto (02/10/2026), registradas para não serem
      reabertas como defeito.** (1) **Os dois papéis Global nascem com as permissões
      `escalas` e `habilitacao_voluntarios`** (Presidente e Secretário Geral): a migração 120 as
      concede, no mesmo molde das 093 e 096 (aditiva, idempotente). Consequência a conhecer:
      quem tem a permissão recebe os avisos automáticos dela, e papel Global recebe os de
      **todas** as congregações (termo de adesão pendente, escala sem confirmação, equipe sem
      revezamento); cada regra de aviso se desliga na tela de regras de notificação. Como a
      migração reexecuta a cada deploy, retirar uma dessas permissões desses dois papéis pela
      tela de Permissões seria desfeito no deploy seguinte. Um papel Global criado no futuro
      **não** herda as permissões sozinho. (2) **Acesso por PIN aceito como está**: quem esquece
      o PIN recupera pelo código do e-mail ou pelo PIN provisório que a Secretaria entrega, e
      o bloqueio por tentativas é o preço de ter bloqueio. (3) **CSP forte** (`script-src`
      estrito, acima): o responsável pediu para tratar **depois** das correções de escopo
      descritas abaixo; o levantamento de custo está mais abaixo. (4) **O escopo é hierárquico
      e vale em toda rota**: dirigente de uma congregação só vê as pessoas dela; o pastor de
      área, as da área (várias congregações); e assim sobe até o nível geral, que vê tudo.
      "Se não tem permissão, nem aparece": as telas só do nível geral somem para os demais.
      (5) **Cada documento diz para quem é** (público, membros ou liderança). (6) **Chave
      combinada entre o site e o sistema** na pergunta "este e-mail é de membro ativo?".
      (7) **O segredo de sessão nunca cai num valor público.** (8) **O texto do Termo do menor
      está aprovado** (ver acima).
    - **Revisão independente do acesso por PIN (02/10/2026).** Um revisor adversarial leu o
      código novo, sem ter escrito nada dele, e achou brechas que os testes do próprio fecho
      não enxergavam. Todas foram corrigidas **antes** do deploy:
      - **A sessão de PIN ou de código não vale como "liderança".** Quem tem cargo mas entrou
        pelo PIN podia trocar a senha da liderança, ver "o que está comigo" nos fluxos e
        delegar o papel. Agora isso só vale com a sessão aberta pela **senha administrativa**
        (marca `via: SENHA` no token; `auth.exigirSessaoDeLideranca`). Token emitido antes da
        marca (12 h no máximo) vale como liderança só se carrega o nível do papel.
      - **Trocar a senha pede a senha atual** e conta nas mesmas tentativas do login (10 erros
        bloqueiam): o token sozinho não basta para virar dono da conta.
      - **A sessão do PIN provisório só serve para criar o PIN definitivo**: em qualquer outra
        rota recebe 403 "crie o seu PIN", e trocar o PIN não renova as 12 horas da sessão.
      - **Código do e-mail:** o contador de erros passou a ser **por pessoa** (10), no máximo 5
        códigos por hora e um código novo invalida o anterior; antes cada código novo dava 5
        chutes novos.
      - **Um dia sem erro apaga o histórico** de tentativas (quem erra de vez em quando não
        escala para o bloqueio de 24 h); o primeiro bloqueio não grava a trilha imutável,
        do segundo em diante sim.
      - **Papéis e funcionalidades** (que definem o que todos os cargos podem) passaram a exigir
        a permissão `permissoes`, e não a de cadastro de pessoas.
      - **Ficha de pessoa (`GestaoPessoas`)**: o escopo da congregação só era conferido ao
        listar. Agora também ao **criar, alterar e desligar** (vale para o alvo e para o
        destino). Trocar o e-mail — que é por onde chega o código de acesso — grava na trilha
        só a forma mascarada e **avisa o endereço antigo**.
      - **Enquetes**: o voto vem da matrícula da **sessão** (corpo com outra matrícula é
        recusado), a opção precisa ser da pergunta, corpo malformado é recusado e a lista exige
        sessão. A lista de **documentos** e a de **projetos** também passaram a exigir sessão.
      - **Termo do menor**: quem cadastra o responsável não pode ser ele mesmo, e o responsável
        precisa estar no escopo de quem cadastra (fora dele a resposta é a mesma de "não
        existe", para o cadastro não servir de sonda de matrículas).
      - **Portas anônimas** com contenção por origem: presença (120 por minuto) e verificação
        de conta (20 por minuto).
      - **Varredura permanente**: um teste percorre o `function.json` de **toda** rota e falha
        se uma rota fora da lista de públicas aprovadas devolver sucesso sem sessão. Rota nova
        pública por desenho entra na lista, com o motivo; esquecimento passa a quebrar o teste.
        (Foi essa a lição: a rota de enquetes escapou da busca anterior por "handler sem login"
        porque tinha login em outras ações.)
    - **Escopo territorial em todas as rotas (02/10/2026).** Uma varredura de **todas** as
      rotas que exigem permissão achou **111** que nunca conferiam o escopo (mais um grupo de
      rotas que só pedem login e decidem por dentro). Nove auditorias independentes leram o
      código de cada uma, e cada correção foi feita e testada pelo auditor do seu grupo.
      **A regra:** o escopo vem do login (a hierarquia congregação → área → região → quadrante
      → distrito já é resolvida ali; `shared/escopo.js`) e há três tipos de dado.
      - **Pessoa** (ficha, disciplina, LGPD, marcos, cartas...): vale a congregação da pessoa;
        lista filtrada; registro único e escrita conferem alvo **e** destino; fora do escopo a
        resposta é **a mesma de "não existe"** (a rota não serve de sonda de quem tem cadastro).
      - **Congregação** (obra, veículo, cessão, turma...): vale a congregação do registro; o
        que é da Sede só o nível geral alcança.
      - **Institucional** (parâmetros, investimentos, plano estratégico, órgãos centrais,
        auditoria, relatórios consolidados, catálogos...): só o **nível geral**.
      - **"Geral" = papel Global E escopo de todas as congregações.** Os dois, porque o nível
        vem do papel e o escopo vem da liderança, que são cadastrados em separado: um papel
        Global com escopo de uma congregação, um papel local com escopo "todas" por esquecimento,
        o Líder Geral de Departamento e quem age por delegação **não** são o nível geral
        (`shared/escopoRotas.js`: `ehGeral`, `exigirGeral`, `pessoaAlcancavel`...).
      - **Falha fechada:** sessão sem a lista de congregações não alcança nada (`estaNoEscopo`),
        e escopo territorial **sem a unidade** ("Área" sem dizer qual) resolve para nenhuma
        congregação. Antes valiam como "todas": um pastor de área cadastrado sem a área enxergava
        a igreja inteira.
      - **Quem concede cargo** (`GestaoLideranca`): só o nível geral; o escopo tem de caber no
        papel (nunca mais largo), exigir a unidade e a unidade tem de existir; a tela de
        Permissões sinaliza linhas antigas incoerentes e papéis Global com escopo limitado. A
        migração 122 é a **rede de segurança**: só se não existir NENHUMA liderança ativa de
        papel Global, escopo Global e permissão de conceder cargos, os cadastros ativos do
        Presidente e do Secretário Geral voltam ao escopo Global (não reativa suspenso nem toca
        em outro papel); existindo ao menos uma pessoa assim, não faz nada. Não deu para medir
        o cadastro real: a produção só aceita conexão de endereços liberados.
      - **Catálogos:** só o nível geral escreve; para ler é preciso estar logado, e os internos
        (papéis, plano de contas, alçadas, mediadores, infrações) pedem também a permissão da
        área. **Documentos:** coluna `Visibilidade` (migração 121; os existentes ficam
        "membros"); sem login só os públicos, e só o geral publica; quem registra respeita o
        escopo. **Rota de exclusão em massa de dados (`ExcluirDados`) removida**, com a seção
        da tela.
      - **O que o tesoureiro local passou a não ver ou não fazer:** dados bancários e CPF de
        fornecedores (só nome e situação), a confirmação desses dados, orçamentos, notas
        explicativas, saldo do Fundo PDQ, remessas e rateio, prebendas, prestações, seguros,
        investimentos, escrita no plano estratégico e as despesas de centro de custo da igreja
        inteira (geral, PDQ, convenção, prebenda). Fornecedor cadastrado com dado bancário passa
        a **nascer pendente** de confirmação da administração geral (antes nascia confirmado).
      - **Verificação:** suíte da API de 1947 para **4037** testes (82 arquivos), com cada
        conferência de escopo **quebrada de propósito** (cerca de 900 mutações entre os grupos;
        sobreviventes eram testes fracos, reforçados, ou equivalentes). O SQL novo foi analisado
        no SQL Server (176 textos; achou `AS dataBase`, palavra reservada, que derrubaria o
        "processar cartas") e uma varredura de fumaça chamou **3243** combinações de rota ×
        ação × papel sem nenhum erro de SQL. No banco real: roteiro da hierarquia completa (login
        verdadeiro de dirigente, pastor de área, região, quadrante, distrito e geral) com **221**
        verificações, e os roteiros anteriores seguem verdes (238, 81, 179, 20, 162, 14).
    - **Fecho dos itens em aberto (03/10/2026).** O responsável determinou que nada ficasse
      em aberto antes da CSP forte. Cada item da lista anterior (a–m) foi tratado:
      - **(a) Delegação soma o escopo a todas as permissões — FECHADO.** O crachá passou a
        carregar `concessoes`: uma por cargo próprio e uma por delegação ativa, cada uma com
        suas permissões, nível e escopo, e com data de validade (`ate`). `exigirPermissao`,
        `exigirAlgumaPermissao`, `exigirNivelGlobal` e `exigirGeral` devolvem uma **visão**
        montada só com as concessões vigentes que têm a permissão pedida; `ehGeral` e a
        conferência de escopo da pessoa decidem concessão por concessão. Uma delegação
        Global de "financeiro" não amplia mais o "pessoas" do cargo local, e a delegação que
        venceu deixa de valer **no mesmo dia**, não quando o crachá expira. Rotas que aceitam
        duas permissões diferentes usam a união das concessões dessas duas.
      - **(b) Sessão não revogável — FECHADO.** Toda rota HTTP passa a entrar por
        `api/shared/entrada.js` (`"scriptFile": "../shared/entrada.js"` em cada
        `function.json`; um teste falha se uma rota nova não usar). Antes do handler, a
        entrada relê do banco (no máximo a cada 3 s) o conjunto das sessões encerradas
        (`SessoesAtivas.Encerrada`) e `getSessao` o consulta, sem tornar nada assíncrono. Sair,
        trocar a senha (as outras sessões caem), cargo alterado ou removido (inclusive as
        sessões de quem recebeu delegação dele), delegação cancelada, medida cautelar,
        vacância, saída do rol, PIN redefinido pela Secretaria, renomear congregação ou
        mudar a hierarquia/permissões de um papel passam a derrubar o acesso em segundos em
        qualquer instância, e na hora na que encerrou. Sem lista confiável (banco fora há
        mais de 60 s) a resposta é 503 (falha fechado). Nova ação do nível geral "Derrubar
        acessos desta pessoa agora". Crachá sem `sid` (só em teste) não é revogável. Migração
        123 (índices).
      - **(c) Escopo compara nome de congregação — FECHADO.** Criar ou renomear congregação
        com nome já existente (sem diferenciar maiúscula, acento nem espaço nas pontas) dá
        409; o mesmo para extensão dentro da mesma congregação-mãe; índice único no banco
        (migração 130) quando não há homônima hoje; renomear derruba todas as sessões.
      - **(d) Índices únicos como defesa em profundidade — FECHADO.** Migrações 124 (uma
        linha de liderança por pessoa), 127 a 129, 130 e 139: sigla de órgão, órgão
        territorial por unidade, cargo ocupado, membro de comissão, credenciamento, presença,
        item de remessa em aberto, número de remessa, geração de prebenda (a 060 já tinha;
        a 129 só garante), nome e endereço de congregação e as chaves de cadastro (sigla de
        cargo, de departamento, nome de papel...). Cada índice só nasce **se não houver
        repetição hoje**; havendo, a migração não falha nem mexe em linha: o deploy imprime
        um AVISO só com a contagem (o log é público) e o índice entra sozinho no deploy
        seguinte, depois da limpeza (consulta de conferência no cabeçalho da migração). A
        violação vira 409 com frase clara, nunca 500; o fechamento da reunião e a presença
        na portaria toleram a corrida. O executor das migrações agora mostra os avisos no
        log e como anotação do GitHub Actions.
      - **(e) `DadosBancariosConfirmados DEFAULT 1` — FECHADO.** Migração 131 troca o padrão
        para 0 (e o de `PerfisRateioDepartamental.Confirmado`), sem tocar nas linhas
        existentes; um teste confere que todo INSERT do repositório informa a coluna.
      - **(f) Mediação — FECHADO.** O mediador ou a Câmara só **propõem** o texto do acordo
        ou do compromisso arbitral; cada parte aceita ou recusa com a **própria sessão**
        (Meu Painel → Minhas Tarefas) ou o mediador/árbitro/Câmara registra a decisão em
        papel **com o documento assinado anexado** (arquivo, hash, data da assinatura, quem
        registrou e quando; quem é parte não registra). Acordo e compromisso só valem com as
        duas partes aceitando o **mesmo texto** (hash); recusa fica registrada; texto novo
        invalida decisões do antigo. Tabela `AceitesMediacao` imutável (gatilho e `CHECK` por
        canal). Aceites antigos ganham a marca `LEGADO_NAO_VERIFICADO` e a tela os mostra como
        "registrado antes da verificação por ato da parte". **A sentença arbitral só é
        registrada com o compromisso firmado pelas duas partes** (sem convenção de
        arbitragem a sentença seria nula, Lei 9.307/1996); caso antigo em curso propõe o
        compromisso de novo. Migração 132.
      - **(g) Abandono — FECHADO.** A homologação é **uma transação só**, com releitura
        travada; **quem abriu o procedimento não o homologa** (regra dos dois olhos,
        `AbertoPor`; a recusa diz quem pode); no tipo Digital, abrir o procedimento **é** a
        notificação final e os 15 dias contam do último marco entre notificação, abertura e
        edital (leitura que protege o membro; Estatuto Art. 12 §2º e Art. 11 §3º, II); edital
        com data futura é recusado. Migração 134. **Erro real achado:** o driver do SQL Server
        entrega coluna DATE como objeto `Date`, e `estatuto.diasDesde` só entendia texto — a
        homologação de abandono respondia sempre "prazo não venceu", o Abandono Digital nunca
        ficava elegível e o prazo de recurso nunca vencia. `estatuto.parseData` passou a
        aceitar `Date` (coluna DATE vale como o dia do banco) e `idadeEm` deixou de errar um
        ano no dia exato do aniversário quando "hoje" vinha em texto.
      - **(h) Remessa não repete as conferências do pagamento comum — FECHADO.** Pagar na
        mão, gerar remessa e confirmar o retorno usam a **mesma** conferência
        (`shared/conferenciaPagamento.js`): saída aprovada, fornecedor **ativo** (vazio conta
        como ativo) com dados bancários confirmados, Fundo PDQ, tutela, saldo do centro de
        custo (descontando o reservado em remessas sem retorno e o que o banco já pagou e
        está a tratar) e campanha. A geração deixa de fora as saídas barradas e lista cada
        uma com todos os motivos. No retorno, ocorrência "00" que deixou de passar, **valor
        pago diferente, ausente ou ilegível** (comparado em centavos inteiros) ou item que o
        arquivo não menciona vira **DIVERGENTE**: o banco já pagou, nada é lançado como pago e a
        Tesouraria Geral trata (reconhecer o pagamento ou encerrar, com justificativa
        auditada). Tudo em transação, sob a trava `PagamentoSaida`. Toda mudança de situação
        da saída (aprovar, rejeitar, pagar, cancelar) leva o estado esperado no `WHERE` e
        confere as linhas afetadas; havia um erro real: aprovar depois de cancelar
        ressuscitava a saída. Formato de comprovante inválido deixou de marcar a saída como
        paga sem comprovante. Migrações 135, 137 e 139. **Limite que continua:** o layout
        CNAB é o deste gerador (número do documento e valor pago em posições próprias,
        constantes `OFFSET_*` em `cnab240.js`) e **nunca foi homologado com um banco real**;
        ao integrar, conferir as posições na especificação do banco, senão todo item vira
        divergência (falha fechada, com explicação).
      - **(i) Cancelar cessão não estorna a conta a receber — FECHADO.** Cancelar é uma
        transação: conta prevista vira cancelada (motivo, quem, quando) e a receita acessória
        fica marcada cancelada; conta já **recebida** bloqueia o cancelamento com o passo a
        passo (cancelar o lançamento enquanto o mês está aberto, devolver o valor, cancelar
        a cessão). Confirmar e cancelar conta a receber travam a mesma linha (dois cliques
        geravam dois lançamentos). Toda soma de contas a receber ignora as canceladas (um
        teste varre o código). Migrações 138 (regulariza contas fantasma de cessões já
        canceladas; nunca toca conta recebida) e 139.
      - **(j) Texto de campo na tela sem proteção — FECHADO.** Um analisador que lê o código
        como árvore do JavaScript (segue variáveis, retornos, parâmetros e listas, e sabe se
        o valor vai para texto, atributo, evento ou endereço) achou **910** pontos sem a
        proteção certa (800 em texto, 54 em atributo, 35 em evento, 21 em endereço; 36 eram
        mensagens da API) e hoje acha **zero**. Todo dado que entra numa tela passa pela
        proteção do lugar onde entra: texto, `escaparHtmlEbd`; botão ou evento em linha,
        `argJs` (testado com `'`, `"`, `\`, `</script>`, quebra de linha e `${}`); link,
        `urlSegura` (barra `javascript:`, `vbscript:` e `data:text`, inclusive com tabulação
        no meio). O teste permanente `frontEscape.test.js` lê `app/script.js` e
        `app/index.html` a cada mudança e **falha se surgir um ponto novo sem proteção**
        (exceções só por regra, justificadas: ids, números, constantes do código; prova por
        mutação). A tela passou a esconder o que é só da administração geral (o login devolve
        `geral` com a mesma regra das rotas; o servidor continua recusando) e, quando o
        servidor recusa (sem permissão, conflito ou falha), mostra o motivo no lugar do painel,
        nunca "nenhum item" nem tela em branco (175 telas). Verificação: jsdom com o front
        verdadeiro (379 cargas de tela com resposta hostil, nenhuma tag ou `javascript:`
        injetado; 401/403/500 sem erro não tratado no console) e o front de produção aberto
        num navegador de verdade, sem erro de JavaScript nem violação de política de
        segurança. **Limite que continua:** os 870 atributos de evento em linha seguem
        existindo (é o trabalho da CSP forte); algumas ações só são recusadas pelo servidor,
        que mostra o motivo.
      - **(k) PIN errado 5 vezes bloqueia a conta por 15 minutos — ACEITO** pelo responsável
        (decisão, não pendência).
      - **(l) Revogar o cadastro do responsável não anulava a adesão — FECHADO.** A adesão
        dada pelo responsável continua gravada e imutável (é prova), mas **só vale enquanto
        o menor tem ao menos um responsável ativo**: derivado na leitura, vale na
        cobertura, no aviso de termo pendente, na Lista de Ouro, na habilitação e na escala
        (o menor sem adesão que valha não entra no auto-escalador, não aceita nem confirma,
        e as escalas futuras já marcadas ficam **sinalizadas**, não removidas). Cadastrar
        outro responsável não restabelece sozinho: só uma nova adesão. A ficha em papel
        assinada por responsável não é atingida. Migração 133.
      - **(m) Chave combinada entre o site e o sistema — FECHADO (03/10/2026).** O mesmo valor
        aleatório foi gravado em `CHAVE_SITE_SISTEMA` nos **dois** aplicativos do Azure (site
        primeiro, sistema depois; procedimento em `SECRETS.md`, seção 9), com a conferência de
        que nenhuma configuração antiga mudou. Medido em produção: a pergunta "este e-mail é
        de membro ativo?" sem a chave responde 401, com chave errada 401 e com a chave certa
        200. (**Segredo de sessão:** medido em produção, um crachá assinado com o valor
        público é recusado; o código nem tem mais esse valor padrão.)
      - **Também nesta rodada:** o limite de tentativas do **site** usava o primeiro valor
        do `x-forwarded-for` (forjável; medido em produção: 25 chamadas com IP inventado
        passaram pelo limite de 20); passou a usar o penúltimo, como no sistema. A **ouvidoria
        anônima** tinha protocolo sequencial e adivinhável: protocolo novo é aleatório (16
        símbolos sem ambiguidade, ~79 bits), a consulta tem limite por origem e responde
        igual para "inválido" e "não existe". Cadastro de liderança: uma linha por pessoa
        garantida no banco, e conceder em dobro responde com frase clara.
      - **Riscos e limites que continuam, ditos com honestidade:** (1) os protocolos de
        ouvidoria **já emitidos** continuam com 16 bits aleatórios (não dá para reemitir o
        que já foi entregue); o limite por origem só desacelera. (2) A regra dos dois olhos
        do abandono depende de haver duas pessoas do nível geral que homologam (hoje, o
        Presidente e o Secretário Geral): se uma abriu e a outra está ausente, o caso espera.
        (3) Menores hoje escalados **sem** adesão vigente passam a não aceitar nem confirmar
        escala: avisar a Secretaria. (4) As migrações de índice podem imprimir AVISOS no
        primeiro deploy se houver repetição em produção (nenhum dado é alterado). (5)
        `RECONHECER_PAGAMENTO` de item com valor diferente deixa a saída paga pelo valor
        da solicitação (a diferença se corrige por lançamento de ajuste). (6) Dois
        pedidos que se cruzam entre conta a receber e cessão podem, em tese, travar um ao
        outro (o SQL Server derruba um e a pessoa tenta de novo).
    - **Levantamento de custo da CSP forte (02/10/2026).** Dinheiro: nenhum (é um cabeçalho
      de configuração, sem cobrança no Azure). O custo é de **trabalho e risco**: a tela tem
      **870 atributos de evento em linha** (470 em `index.html`, 400 em `script.js`), dos quais
      **354 são montados em texto com valor interpolado** (`onclick="abrir(${id})"`) dentro de
      cerca de 760 pontos que gravam HTML. A política estrita (`script-src` sem
      `'unsafe-inline'`) barra todos eles, então cada um precisa virar um ouvinte de evento, e
      os 354 dinâmicos não se convertem por substituição automática (o valor interpolado vira
      atributo `data-*` lido por um ouvinte único, tela por tela). O defeito típico de uma
      conversão incompleta é silencioso: o botão deixa de responder e o erro só aparece no
      console do navegador. Ganho: uma segunda linha de defesa caso exista algum ponto de XSS —
      e os pontos conhecidos já foram fechados e testados com texto de ataque em todo campo. O
      que já está no ar (`frame-ancestors`, `object-src`, `base-uri`, `form-action`) cobre o
      clique disfarçado e o formulário desviado.
    - **CSP forte (04/10/2026) — FEITA.** O cabeçalho do sistema (`app/staticwebapp.config.json`)
      passou a ser: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'
      https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self'
      data: blob: https://ieadespaarmazenamento.blob.core.windows.net; connect-src 'self';
      worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action
      'self'; frame-ancestors 'none'; upgrade-insecure-requests`. Sem `'unsafe-inline'` nem
      `'unsafe-eval'` nos scripts: o navegador recusa qualquer código escrito dentro do HTML, então
      um texto malicioso que chegasse à tela não vira código.
      - **Como foi feito.** Os **880** pontos com código escrito dentro do HTML (469 em
        `index.html`, 411 em textos montados no `script.js`) viraram `data-on-click="acao"` e afins,
        com os argumentos em JSON (`data-args-click`), tratados por um despachante único
        (`app/eventos.js`) que só chama as **688 ações registradas** em `registrarAcoes` no fim do
        `script.js` (nome fora da lista não faz nada; **nunca** `window[nome]`). Ele imita o evento
        em linha: sobe do filho para o pai, `data-stop`, `data-prevent`, erro isolado por ação, e a
        ordem com os "clicar fora fecha" foi preservada. `verificar.html` (página pública) perdeu o
        script e o estilo de dentro (`verificar.js`, `verificar.css`); o service worker foi para o
        cache v4. Um número lido de um campo continua número (`Number(...)`).
      - **Testes que ficam.** `frontCsp.test.js` (reprova evento em linha, `javascript:`,
        `<script>` em linha, `eval`, `new Function`, ação não registrada ou com nome vindo de dado;
        20 mutações provadas), `eventosDespachante.test.js`, `frontTipoDosArgumentos.test.js` (uma
        variável lida de um campo não vai crua para os argumentos) e o `frontEscape.test.js`
        ajustado. Suíte: 97 arquivos, 4553 testes, no fuso local e em UTC.
      - **Verificação em navegador de verdade** (`tools/csp-e2e`, Edge sem tela, API simulada;
        `README.md` lá): 4782 ações (cada controle de cada tela, com formulários e campos
        preenchidos, em 3 perfis), versão antiga × nova com a política estrita ligada na nova:
        **4780 idênticas**; as 2 restantes são ruído de tempo (idênticas quando repetidas
        isoladas). **Zero violações** da política, e as 10 peças especiais (importar e exportar
        planilha, carta, certificado com QR, verificação pública) iguais. O equipamento acusou os
        4 defeitos plantados numa cópia estragada, e duas rodadas da versão antiga contra ela
        mesma deram 4782 de 4782 iguais. Contra a **homologação do Azure** (cabeçalhos reais, API
        simulada dentro do navegador): 971 de 971 e depois 4780 de 4782, zero violações. Achou **1
        defeito real da conversão** (um número lido de um campo chegava como texto no "Remover
        professor" da EBD); a busca por escrito achou mais 2 iguais (fechar mês e repasse da
        tesouraria); os três foram corrigidos.
      - **Prova complementar, estática** (`tools/csp-e2e/equivalencia-estatica.js`): compara o
        texto original e o convertido de cada um dos **867** pontos (ação, quantidade e conteúdo
        de cada argumento, `prevent` e `stop`), sem depender de dados simulados; cobre também os
        168 modelos de botão que a simulação não alcançou. Resultado: **todos equivalentes** (857
        por regra, 10 conferidos à mão: condicionais de texto virando valor e o marcador `this`).
      - **Publicação em dois degraus** (conversão com a política antiga, depois o cabeçalho
        estrito), cada um conferido no endereço real; a homologação já tinha passado pelas duas
        coisas juntas. Em produção: degrau 1 e degrau 2 com 971 de 971 ações idênticas na
        passada rápida (em navegador real, API simulada dentro do navegador), zero violações, 10 de 10
        peças especiais, a política estrita entregue em **todos** os arquivos, e as 45 verificações
        da API intactas. Com a política estrita ligada em produção, a **passada completa deu 4782
        de 4782 ações idênticas**, zero violações (na página e no console do service worker v5).
        Para desfazer o degrau 2: `git revert -m 1 <commit de união>` (volta a política
        antiga e a conversão continua valendo).
      - **Achado só visível dentro do service worker.** Com a política estrita, o `connect-src 'self'`
        vale **também para o service worker**: o `fetch()` dele para as fontes do Google era
        recusado e a página perdia a fonte (a página não vê essa recusa, só o console do service
        worker, então nenhuma medição de página a pegou). O service worker agora só trata pedidos
        do próprio endereço (cache v5); os de fora o navegador atende direto, sob as regras da
        página. `tools/csp-e2e/sw-csp.js` mede isso; o teste permanente cobre a regra.
      - **Limites que continuam, ditos com honestidade.** `style-src` mantém `'unsafe-inline'` de
        propósito: o front tem 931 atributos `style="..."` no HTML e 355 em textos do `script.js`,
        e as janelas de impressão escrevem um `<style>`; injeção de estilo não executa código, e
        trocar isso é um projeto à parte. Botão novo exige registrar a ação em `registrarAcoes` (o
        teste avisa). A simulação não monta módulos inteiros (canais, eventos, voluntariado, parte
        do PSC e do calendário): para esses vale a prova estática e os testes, não a execução.
        Nada disso valida regra do servidor.
    - **Verificação do fecho.** A suíte da API foi de 1191 para **1947** testes (67 arquivos;
      357 deles são a varredura de rotas), e cada correção da revisão foi **quebrada de
      propósito** para provar que o teste falha sem ela (17 mutações, nenhuma sobrevive; duas
      delas expuseram teste fraco, que foi refeito). Contra um SQL Server 2019 recriado do zero
      (**120** migrações): o roteiro da v7.5 (**238**), o roteiro do fecho (**81**: o IP com
      cabeçalhos forjados do jeito que o Azure entrega, a idade no dia exato dos 18 anos, a
      ficha do menor, os `CHECK` e o gatilho com cada tentativa de alterar ou apagar, a
      anonimização com os sete casos de quem mantém e de quem perde o IP, Meus Dados de
      titular, de terceiro e sem sessão, e o ciclo de remoções), a bateria de ataque (**179**),
      as corridas (**20**), o roteiro do acesso por PIN e do Termo do menor (**162**, incluindo
      a rodada da revisão contra o banco de verdade: decaimento de 24 h, contador do código,
      troca de senha, sessão de PIN × liderança, escopo e enquetes) e as corridas do acesso
      (**14**: 14 chutes de PIN ao mesmo tempo, 6 criações simultâneas do primeiro PIN, 8
      códigos certos ao mesmo tempo e mãe e pai autorizando o mesmo menor juntos). A migração
      também foi aplicada **por cima** do banco que já tinha a versão anterior da 117 e
      reaplicada em ordem, como o deploy faz; a migração 120 teve verificação própria (cargo
      com lista vazia, cargo que já tinha uma das duas, cargo de nome parecido que não pode ser
      tocado, rodar três vezes sem duplicar). A tela passou por DOM simulado (menor sem caixa
      de aceite, responsável escapado, token em Meus Dados, bloco de voluntariado com texto de
      ataque, campo de senha atual). Achados do próprio fecho: a validação de id dos handlers de
      voluntariado aceitava `0x10`, `1e1`, `true` e `[5]` (agora só inteiro positivo ou texto de
      dígitos, dentro do INT do SQL, com teste que falha sem a correção); o gatilho tratava um
      `UPDATE` que não alcança linha alguma como se fosse um `DELETE`; e um roteiro meu refazia
      a migração 117 sozinho e devolvia o gatilho antigo por cima do da 119 — em produção o
      deploy reaplica **todas** em ordem, então a 119 vence, e o roteiro passou a reaplicar
      117, 118 e 119 e a conferir o gatilho final.
  - **Limites:** o rodízio não se liga à agenda litúrgica (v7.2) — é semanal por dia e
    hora; o serviço manual (sem rodízio) segue como na v5.6; a tela de escalas continua
    mostrando matrícula, e não nome, nas alocações do detalhe do serviço.

> **Aqui entra a [FASE D — Robustez, operação e celular](fase-d-robustez-e-operacao.md)** (06/10/2026, 8ª rodada):
> retrofit do que já está construído (prova automática de que toda tela abre, front-end em módulos, homologação igual
> à produção, segundo fator pra liderança, operação e celular do membro), com arquivo e travas próprias, no mesmo
> padrão da FASE B. A Trava 7-A só abre depois da Trava D-B.

## 🔒 Trava de Revisão 7-A — antes de avançar para a v7.6

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3).
Audita v7.1 a v7.5 pelas 5 perguntas do checklist — depois de fechada a FASE D.

## v7.6 — Setores Técnicos (voluntariado profissional) *(gap da varredura)*

Distinto da escala de rodízio comum acima — são 20 áreas de voluntariado
especializado (Reg. Art. 48-52): Jurídico, Engenharia, Saúde, TI, Comunicação,
Assistência Social Técnica, Contabilidade, Gastronomia, Segurança, Música/
Sonoplastia, Transporte, Meio Ambiente, Capelania, Empreendedorismo, Cultura,
História/Acervo, RP/Cerimonial, Libras, Beleza/Estética, Educação/Pedagogia.

- [ ] Catálogo de Setores Técnicos + Termo de Adesão específico (Reg. Art. 49).
- [ ] Prerrogativas de intervenção cautelar (ex: interditar templo com risco elétrico,
      remover post oficial).
- [ ] Verificação de antecedentes criminais/cíveis (Reg. Art. 133 §5º) na investidura
      em cargo de liderança/confiança ou trabalho com menores — "Termo de Vistoria"
      com data, hash do documento apresentado, parecer e assinatura do responsável.
      **Atenção:** este item era a única menção a antecedentes no roadmap inteiro e
      está *incompleto diante da lei* — a Lei 14.811/2024 exige bem mais do que
      verificar na investidura. Ver v7.7, que substitui e amplia este item.

## v7.7 — Habilitação para Ministério com Menores *(7ª rodada — OBRIGAÇÃO LEGAL VIGENTE)*

> **Este é o achado mais grave de toda a 7ª rodada.** A **Lei 14.811/2024**
> inseriu o **art. 59-A no ECA** e está em vigor desde **12/01/2024**, sem
> vacatio: entidades públicas e privadas que desenvolvem atividades com crianças
> e adolescentes devem **exigir e manter atualizada** ficha cadastral e
> **certidão de antecedentes criminais de todos os colaboradores, incluindo
> voluntários**, com **atualização semestral**. Igreja com EBD infantil, coral de
> crianças, departamento infantil e eventos com menores está inteiramente dentro
> do alcance. O sistema hoje não tem nada disso — e a exposição não é teórica:
> é responsabilização institucional e pessoal dos dirigentes.

*(Numeração: as versões v7.7 e v7.8 existiam como lacuna no documento — o
roadmap pulava de v7.6 para v7.9 sem nota. A lacuna foi preenchida com o tema
que mais fazia falta.)*

- [ ] **Habilitação para Ministério Infantojuvenil** por voluntário: ficha
      cadastral + certidão de antecedentes (federal/PF e estadual/TJ) anexada,
      com `data_emissao` e **validade automática de 180 dias**.
- [ ] **Bloqueio de escala por habilitação vencida** — não é alerta: quem está
      com certidão vencida sai automaticamente das escalas de ministério com
      menores e não pode ser escalado. Alertas em D-60/D-30/D-15 antes de vencer
      (a renovação leva dias para sair; avisar no dia do vencimento é inútil).
- [ ] **Treinamento obrigatório de proteção** com validade e renovação periódica
      (padrão internacional: 2 a 3 anos), também bloqueante — conecta com a
      trilha de formação (v6.9). *(MinistrySafe; Church of England safeguarding)*
- [ ] **Regra dos dois adultos** (*two-adult rule*) validada na escala: nenhuma
      sala com menores publica escala com **um adulto sozinho**, e a proporção
      adulto/criança mínima por faixa etária é verificada antes de publicar.
      *(Church Answers; padrão consolidado em seguradoras de igrejas nos EUA)*
- [ ] **Regra dos 6 meses** de frequência antes de servir com menores (v5.7) —
      calculada, não digitada.
- [ ] **Política de comunicação eletrônica com menores**: vedada mensagem privada
      1:1 entre adulto e menor; canais de grupo exigem segundo adulto e
      responsável com acesso. Aceite da política registrado por voluntário
      (conecta com a Regra das 24 Horas, v7.3).
- [ ] **Consentimento específico e destacado do responsável** (LGPD Art. 14) para
      dados de menor — uso de imagem, alergia/condição de saúde para o crachá —
      versionado e revogável.
- [ ] **Painel de conformidade por congregação**: quantos voluntários aptos,
      quantos vencendo, quantos bloqueados — o Dirigente precisa ver isso antes
      de o problema existir, e a Secretaria Geral precisa ver o campo inteiro.
- [ ] Adapter preparado (sem depender dele) para o futuro cadastro nacional de
      condenados por crimes contra menores — hoje ainda é projeto de lei, não
      obrigação vigente; o campo fica pronto sem criar dependência.

## v7.8 — Incidentes, notificação obrigatória e escuta protegida *(7ª rodada — OBRIGAÇÃO LEGAL)*

Fluxo **deliberadamente separado da disciplina eclesiástica** (FASE 3) e da
Ouvidoria (v3.7). Não é a mesma coisa: processo disciplinar apura falta contra a
igreja; aqui o dever é **externo e legal** — comunicar ao Estado. Tratar suspeita
de maus-tratos como assunto interno é exatamente o erro que gerou as maiores
crises institucionais em denominações no mundo inteiro.

- [ ] **Notificação obrigatória ao Conselho Tutelar** diante de **suspeita** (não
      exige certeza, não cabe à igreja investigar): ECA **Art. 13**, com **multa
      de 3 a 20 salários de referência pela omissão, dobrada na reincidência**
      (ECA Art. 245). Fluxo com **SLA curto (24h)**, relógio regressivo visível ao
      Dirigente e à Secretaria Geral, campos de órgão notificado (Conselho
      Tutelar/MP/Polícia), protocolo e anexo do ofício.
- [ ] **Encerramento bloqueado sem comprovante da comunicação externa** — o caso
      não fecha no sistema enquanto não houver prova de que o Estado foi avisado.
- [ ] **Escuta protegida** (Lei 13.431/2017): a igreja **acolhe e encaminha, não
      inquire**. O formulário não tem campo de "inquirição"; exibe o roteiro
      correto (acolher → registrar o relato espontâneo, na íntegra e sem
      interpretação → encaminhar) e restringe a leitura do relato a papéis
      específicos. Repetir a entrevista é revitimizar — e o sistema tem que
      ajudar a não fazer isso.
- [ ] **Afastamento cautelar automático** do envolvido de toda escala com menores
      no momento do registro — medida protetiva, **não** punição antecipada, e
      registrada como tal (a v2.6/`MedidasCautelares` já tem o mecanismo).
- [ ] Registro de incidentes em três níveis: quase-acidente, quebra de política e
      alegação — porque o padrão internacional mostra que o que antecede o caso
      grave é a sequência de pequenas quebras que ninguém registrou.
- [ ] Comitê de revisão com participação **não-clerical** e relatório anual de
      conformidade por congregação. *(Praesidium; Royal Commission — 10 Child
      Safe Standards; Dallas Charter/USCCB)*
- [ ] Canal de denúncia acessível também à criança/adolescente, em linguagem
      adequada — a Ouvidoria (v3.7) hoje é desenhada para adulto.

## v7.9 — CLI: comparecimento obrigatório e perda de assento por faltas (Art. 27)

Movido de v2.3 de propósito — ver nota lá. Constrói **junto** com v8.1 (AFM),
não antes: precisa primeiro saber marcar uma sessão da CLI como "integrada com
AFM" (Art. 69) pra não contar errado a cada 3 meses.

- [ ] 3 faltas consecutivas sem justificativa aceita nas reuniões da CLI
      (excluindo as integradas com AFM) = perda automática do assento (Art. 27
      §1º) — calculado a partir de `Presencas`, igual mandato vencido de
      Assento (nunca marcação manual). Quem entra por Ordenação (Pastor/
      Evangelista/Presbítero) precisa de um jeito de sair da composição da CLI
      sem perder o `CargoMinisterial` (são coisas diferentes: perder assento
      na Câmara ≠ deixar de ser Pastor); quem entra por Função já sai
      naturalmente encerrando o Assento (mecanismo já existe).
- [ ] Art. 27 §2º: se a exclusão for de quem está na CLI por cargo eletivo da
      Diretoria Executiva ou Conselho Fiscal, a CLI aprecia e, sendo o caso,
      convoca AGE de destituição em até 30 dias (matéria "Destituição", já
      existente desde v2.2) — o sistema só aponta pro fluxo existente, não
      automatiza a convocação.
- [ ] **Taxonomia fechada de justificativa de falta** (Art. 149 §2º, gap da
      varredura): só fator externo justifica — **escala ou evento de departamento
      não é justificativa válida**. Catálogo com os motivos vedados bloqueados na
      própria tela, não conferidos depois por alguém que talvez não conheça o §2º.

## v7.10 — Check-in infantil com cadeia de custódia *(7ª rodada)*

Peça operacional que sustenta na prática a v7.7: sem controle de entrega e
retirada, a política de proteção é só documento.

- [ ] Check-in por família com **etiqueta de segurança**: código aleatório por
      criança, impresso na etiqueta e no recibo do responsável, **obrigatório na
      retirada** — quem não tem o código não retira, ainda que seja conhecido.
- [ ] Lista de **pessoas autorizadas a retirar** por criança (reaproveita
      `VinculosFamiliares` e o flag `ResponsavelLegal`, v1.7 — já existe) e alerta
      de retirada divergente.
- [ ] Alergia/condição de saúde impressa na etiqueta (com o consentimento da
      v7.7) e contagem de lotação por sala em tempo real — a proporção
      adulto/criança deixa de ser estimativa.
- [ ] Registro de horário e de **quem entregou e quem retirou** — é a prova
      auditável que protege a igreja e a família.
- [ ] Bloqueio de voluntário sem habilitação vigente (v7.7) na sala, no ato do
      check-in. *(Planning Center Check-Ins; FellowshipOne; ChurchSuite)*
- [ ] **Integração com o Portal do Membro (vB.5)**: "meus filhos" no
      autoatendimento é o pai/responsável legal (`VinculosFamiliares`,
      `ResponsavelLegal`) consultando o histórico de check-in/check-out dos
      próprios filhos pelo celular — nunca fazendo o check-in ele mesmo (isso
      continua sendo ação de voluntário na sala, com a etiqueta física). Sub-aba
      nova em "Meu Painel", mesma infraestrutura de login/PWA da vB.5.

## 🔒 Trava de Revisão 7-B — antes de avançar para a v7.11

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3).
Audita v7.7 a v7.10 pelas 5 perguntas do checklist — **atenção máxima**: a
v7.7 (habilitação para ministério com menores, Lei 14.811/2024) e a v7.8
(notificação obrigatória de suspeita de maus-tratos, ECA Art. 13/245)
tratam de obrigação legal já vigente, com multa por omissão, e de dado de
criança. Um bug de tela aqui não é só inconveniente — pode significar
voluntário sem antecedente verificado atuando com menor, ou suspeita não
notificada. Testar cada fluxo manualmente, não só confiar no "parece certo".

## v7.11 — Cuidado pastoral: filas com responsável, prazo e sigilo *(7ª rodada)*

Hoje o sistema registra o que **aconteceu** (disciplina, abandono, carta). Não
registra o que alguém **precisa fazer por alguém** — e é justamente aí que as
pessoas se perdem sem que ninguém perceba a tempo.

- [ ] **Fila de acompanhamento com dono e SLA**: visitante, novo convertido,
      membro afastado, pedido de visita, pedido de oração, pós-internação.
      Cada item tem responsável nomeado e prazo; vencido, escala pela hierarquia
      territorial que já existe (Dirigente → Pastor de Área → Região).
      *(Rock RMS Connections; MinistryPlatform Care Cases; CCB process queues)*
- [ ] **Detecção de afastamento por desvio do próprio padrão** — não regra fixa
      global ("faltou 3 cultos"), e sim comparação com o histórico **daquela
      pessoa**: quem vinha 4x por mês e caiu para 1 é sinal; quem sempre veio 1x
      não é. Abre item na fila antes de virar caso de abandono (v1.5).
      *(CDM+ Missing Analysis)*
- [ ] **Notas pastorais com nível de confidencialidade** (pública / liderança
      local / somente pastor), log de acesso auditável e **versão anonimizada
      automática** para boletim de oração ("um irmão da congregação X"). Dado de
      saúde e aconselhamento é dado sensível — vazamento aqui destrói confiança e
      gera passivo. *(CareNote; Notebird; TouchPoint)*
- [ ] Pedidos de oração com moderação antes de publicar e **sinalização de risco**
      (menção a autolesão/violência) escalando imediatamente para o pastor, fora
      da fila normal.

## v7.12 — Comunicação: consentimento granular e envio segmentado *(7ª rodada)*

A vB.2 constrói o motor de notificação. Esta versão trata da parte jurídica e da
segmentação — no Brasil, WhatsApp sem opt-in registrado é risco de LGPD e de
bloqueio pela própria Meta.

- [ ] **Consentimento por canal E por categoria** (WhatsApp/SMS/e-mail/push ×
      convocação oficial/evento/devocional/financeiro), com origem, data, e o
      **texto exato aceito**. O detalhe que importa: o membro pode sair de
      "eventos" e continuar recebendo **convocação oficial de assembleia** — que
      é obrigação estatutária de comunicação, não marketing.
- [ ] Opt-out automático por palavra-chave (SAIR/STOP) com log, e bloqueio de
      envio sem consentimento vigente.
- [ ] Templates versionados e aprovados (exigência da API oficial do WhatsApp
      Business). *(Meta/WhatsApp Business API; Infobip; SocialHub)*
- [ ] **Segmentação dinâmica por consulta viva**, não lista estática: "diáconos do
      Setor 3", "professores de EBD com trilha vencida", "dizimistas inativos há
      90 dias", "voluntários com certidão vencendo em 30 dias". Cada módulo novo
      vira audiência sem ninguém montar lista na mão.
- [ ] Registro de entrega/leitura e relatório de alcance — saber se a convocação
      oficial de fato chegou é questão de validade do ato, não de curiosidade.

## v7.13 — Eventos, inscrições e congressos *(7ª rodada — expande v7.4)*

- [ ] Lotes de inscrição (preço, vagas, público-alvo), com pagamento conciliado
      no financeiro que já existe (v4.6 Contas a Receber).
- [ ] **Credenciamento por QR** no dia, com contagem de lotação por sala/ala e
      relatório de no-show — insumo real para dimensionar o próximo evento.
- [ ] Crachá com campos configuráveis por tipo de participante.
- [ ] Para congressos denominacionais: **blocos de hospedagem e transporte por
      congregação**, com lista de embarque gerada do mesmo cadastro — hoje isso é
      planilha paralela por congregação, refeita todo ano.
- [ ] Isenção/cortesia registrada com quem autorizou (conecta com v4.21: evento
      com receita é receita acessória e precisa de destinação finalística).
      *(Tithely Events; ChMeetings)*

## v7.14 — Identidade Visual Anual *(gap da varredura normativa)*

O Art. 159 descreve um processo participativo com calendário rígido, critério de
originalidade e consequência financeira — nada disso tem onde existir hoje.

- [ ] **Calendário do processo** (Art. 159 §1º): sugestões de 01 a 15/nov →
      triagem de 16 a 21/nov → votação de 22 a 30/nov → arte em dezembro (3
      cores) → escolha final até 31/12 por maioria simples. Cada etapa com
      abertura e fechamento automáticos.
- [ ] **Antiduplicidade desde 2006**: vedado repetir tema já usado — exige o
      histórico completo cadastrado, e a validação acontece na triagem, não
      depois da arte pronta.
- [ ] Coleta de sugestões e votação reaproveitando o módulo de **Enquetes**
      (v2.8), que já existe e já resolve público-alvo e apuração.
- [ ] **Pedido de uniforme do Dirigente = compromisso financeiro irrevogável da
      congregação** (§7º): o pedido vira automaticamente conta a pagar da
      congregação (v4.5), com fornecedor único (§2º, vedada produção local).
      É a regra que mais gera conflito hoje — e ela fica explícita na tela do
      pedido, antes de confirmar.

## v7.15 — Gestão de crise e porta-voz único *(gap da varredura normativa)*

- [ ] **Sinalizador institucional de "crise ativa"** (Art. 161-B §§1º-2º) com
      designação formal do Porta-Voz Único e aviso automático a **todos** os
      líderes sobre a vedação de manifestação individual enquanto durar o regime.
- [ ] Registro de manifestações autorizadas e centralização das demandas de
      imprensa — quem falou o quê, quando e com autorização de quem.
- [ ] Plano de emergência por congregação (evacuação, contatos), **registro de
      simulados** (data, participantes) e checklist de vistoria predial —
      conecta com AVCB (v4.24) e seguros (v4.16).
      *(Brotherhood Mutual — violence response plan e disaster plan)*
- [ ] Equipe de segurança por congregação com composição registrada.

## 🔒 Trava de Revisão 7-C — antes de encerrar a FASE 7 e avançar para a FASE 8

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3).
Audita v7.11 a v7.15 pelas 5 perguntas do checklist, e faz uma varredura
final na FASE 7 **inteira** antes de fechar — com atenção redobrada, de
novo, nos fluxos de proteção de menores (v7.7/v7.8/v7.10) e no consentimento
de comunicação granular (v7.12): são os pontos da fase com maior exposição
legal, e é aqui que qualquer regressão neles precisa ser pega antes de
seguir pra Ministerial.
