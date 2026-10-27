# FASE 7 — Saúde, Eventos e Comunicação

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

## Resumo em prosa do andamento da fase 7 e da fase D (movido do README em 15/10/2026)

*Texto que estava no “Estado atual” do README, guardado aqui sem alterações. É uma fotografia de 08/10/2026: a situação de hoje de cada versão está no [índice do plano](INDICE.md).*

- **Em andamento — FASE 7:** v7.1 (PSC), v7.2 (Calendário oficial), v7.3 (Canais oficiais), v7.4
  (Eventos e congressos), v7.5 (Escalas e voluntariado), v7.6 (Setores Técnicos e Termo de Vistoria) v7.7 (Ministério com menores, Lei 14.811/2024) e v7.8 (Incidentes de proteção de crianças, ECA Art. 13: relógio de 24 horas para o Conselho Tutelar, relato protegido, afastamento cautelar, canal de ajuda sem login) entregues e no ar. Os pontos que a revisão da v7.5 apontou (IP
  medido no Azure, idade para aderir, anonimização do IP, Meus Dados, avisos em ciclo, escopo de departamento e o
  primeiro passo da CSP) foram fechados na própria versão — inclusive o **acesso do membro por matrícula + PIN**, a
  exigência de sessão em todas as rotas de autoatendimento (que antes tratavam a matrícula como a própria pessoa) e o
  **Termo do menor aceito pelo responsável legal**. Uma revisão independente do acesso por PIN achou outras brechas
  (sessão de PIN valendo como liderança, troca de senha sem a senha atual, escopo de congregação ausente na ficha de
  pessoa, voto de enquete com a matrícula do corpo, entre outras): todas corrigidas e presas por teste. Em seguida o
  **escopo hierárquico passou a valer em todas as rotas** (dirigente → só a congregação; pastor de área → as da área; e
  assim até o nível geral, que vê tudo), os catálogos só são lidos com login e só o nível geral os altera, e cada
  documento ganhou a marca de quem pode vê-lo. Depois, o **fecho dos itens em aberto** (03/10/2026): sessão que se
  derruba na hora (toda rota entra por `api/shared/entrada.js`), delegação por permissão, índices únicos no banco, aceite
  de mediação só por ato da parte, abandono com dois olhos, remessa com as mesmas conferências do pagamento comum e
  estorno de cessão. Só a chave site↔sistema nos dois portais do Azure depende de gente; os limites que continuam estão
  no plano da fase 7. A CSP forte (04/10/2026) está feita. **Antes da 🔒 Trava 7-A entra a FASE D** (06/10/2026, 8ª
  rodada): retrofit de robustez e operação (prova automática de toda tela, front em módulos, homologação, segundo fator,
  alerta de queda, celular do membro), com custo escrito por versão pra decisão do responsável. Em 07/10/2026 a prova
  de tela roda no CI (vD.1, também em janela de celular pro membro), o `script.js` virou núcleo + 23 módulos (vD.2),
  a homologação migra, se semeia e varre as suas rotas sozinha (vD.3), a agenda chega ao site sem acordar o banco
  (vD.5) e o menu do celular virou gaveta (vD.6). A Trava D-A foi fechada no mesmo dia. Em 08/10/2026: site na raiz
  `ieadespa.org.br` (vD.7), segredos trocados e rotação escrita (vD.5/vD.8) e **chave de acesso** no login da liderança
  (vD.4: passkey ou código por e-mail, confirmação reforçada nos quatro atos, provada com autenticador virtual no CI).
  Resta o que depende do responsável (ensaio de restauração, Search Console, teste de carga) e a 🔒 Trava D-B.

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
    precisa definir quando anonimizar. *(Resolvido na Trava 7-C: política própria "Calendário — justificativa de
    ausência na Santa Ceia", padrão de 2 anos depois da Ceia, ajustável na tela; a rotina diária apaga o texto e
    fica que a ausência foi justificada.)*

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
    (dado sensível, tratado como prova de diligência — ROPA, categoria `CANAIS`). *(Resolvido na Trava 7-C: a
    ocorrência encerrada perde a descrição, o link, a observação e quem avisou 5 anos depois de encerrada, e o
    administrador que saiu perde o nome 5 anos depois — políticas próprias, ajustáveis, aplicadas pela rotina diária.)*
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
    descarte ainda não existe** (prazo a definir pela CLI/Encarregado). *(Resolvido na Trava 7-C: política
    "Eventos — contato do convidado externo", padrão de 1 ano depois do último evento dele — o mesmo nome ou o
    mesmo contato num evento mais novo seguram —, ajustável na tela e aplicada pela rotina diária.)*
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
    voluntário dessas regras. *(Resolvido na Trava 7-C, **só aviso, por decisão de 23/10/2026**: o fornecedor pessoa
    física se liga à matrícula do membro (`Fornecedores.MembroId`, migração 155) e, ao lançar a saída, o tesoureiro lê e
    confirma os avisos — voluntário ativo, pagamento habitual, cachê/comissão —, que ficam registrados na saída. O sistema
    não impede.)* O Art. 135 §4º
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
        segurança. **Limite que continua:** algumas ações só são recusadas pelo servidor,
        que mostra o motivo. *(Os 870 atributos de evento em linha, que eram o outro limite,
        viraram delegação na CSP forte de 04/10/2026 — ver abaixo.)*
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
        Nada disso valida regra do servidor. *(Desde 07/10/2026 a FASE D cobre essa lacuna: a
        prova de módulo abre cada tela na homologação com login fictício e a API de verdade —
        `tools/modularizar/prova-modulo.js`, fluxo "Sistema - prova em navegador" — e a Trava
        7-A a repetiu nas seis telas da FASE 7.)*
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

- [x] **Fechada em 08/10/2026** (depois da Trava D-B) — auditoria de v7.1 a v7.5:
  1. *Código novo roda de ponta a ponta no ambiente real?* **Sim.** As cinco versões estão na produção desde setembro
     e início de outubro (todas as migrações da FASE 7 aplicadas; a produção está na 141), e desde a FASE D cada
     deploy prova isso sozinho: a homologação (PR #21) migra, semeia e varre as rotas a cada push, e a produção varre
     as suas depois de cada merge — 205 rotas sem sessão, entre elas as da FASE 7 (`psc`, `calendario`,
     `agenda-publica`, `canais`, `eventos-gestao`, `escalas`, `voluntariado`, `habilitacao-voluntarios`): 0 rota
     404, 0 rota 5xx (corrida 37786339310). O agendador interno de avisos (PSC, calendário, canais, escalas) é
     chamado pelo fluxo das 7h (`rotinas-diarias.yml`), que avisa por e-mail quando falha.
  2. *Toda tela abre e mostra dado de verdade?* **Sim.** Rodada **completa** dos testes de tela na `main`
     (corrida 37808504793, completa: 4.762 ações iguais no desktop e 625 na janela de celular, 0 divergência, 0 violação de CSP, 0 falha do equipamento). E as seis telas da FASE 7 abertas na homologação com login fictício (pastor de área 900007) e a
     API de verdade respondendo 200, pelo fluxo "Sistema - prova em navegador": PSC 34/34 (corrida 37800877628), Calendário 34/34 (37800884676), Canais 35/35 (37801464691), Eventos e congressos 34/34 (37800898348), Escalas 37/37 (37803832918, escolhendo a congregação e abrindo as equipes) e Voluntariado 35/35 (37801473091, sub-aba Minhas Escalas do Meu Painel) — cada uma com a aba aberta, a API do módulo respondendo 200, zero erro de JavaScript e zero violação de CSP.
  3. *README e código narram a mesma coisa?* **Sim.** O README (estado atual, tabela das fases e tabelas do banco
     por versão) descreve v7.1 a v7.5 como entregues e aponta para este plano; duas notas de "limite que continua"
     deste plano estavam vencidas e foram corrigidas nesta trava (os 870 atributos de evento em linha viraram
     delegação na CSP forte; os módulos inteiros passaram a ser abertos pela prova de módulo da FASE D).
  4. *O que ficou para trás foi corrigido, não só anotado?* **Sim.** Os 35 itens de v7.1 a v7.5 estão riscados;
     o "fecho dos itens em aberto" de 03/10/2026 tratou a lista (a–m) e a revisão do acesso por PIN; a FASE D
     (06–08/10) trouxe o que a v7.5 deixou como limite de operação: prova de tela em cada push, front em módulos,
     homologação de verdade, segundo fator, alerta de queda. **Limites que continuam, ditos com honestidade** (não
     são pendências de código): o leiaute CNAB nunca foi homologado com um banco real (depende de integrar); os
     protocolos de ouvidoria já emitidos continuam curtos; a regra dos dois olhos do abandono depende de duas pessoas
     do nível geral; `style-src` mantém `'unsafe-inline'` (projeto à parte — registrado como item da FASE 10, v10.7,
     na Trava 7-C).
  5. *Deploy real aconteceu?* **Sim.** Produção conferida hoje depois do merge da vD.4 (script com a segunda etapa,
     casca do service worker v29, varredura verde); a agenda pública segue chegando ao site sem acordar o banco.
     Fechada esta trava, a FASE 7 segue para a v7.6.

## v7.6 — Setores Técnicos (voluntariado profissional) *(gap da varredura)*

Distinto da escala de rodízio comum acima — são 20 áreas de voluntariado
especializado (Reg. Art. 48-52): Jurídico, Engenharia, Saúde, TI, Comunicação,
Assistência Social Técnica, Contabilidade, Gastronomia, Segurança, Música/
Sonoplastia, Transporte, Meio Ambiente, Capelania, Empreendedorismo, Cultura,
História/Acervo, RP/Cerimonial, Libras, Beleza/Estética, Educação/Pedagogia.

- [x] Catálogo de Setores Técnicos + Termo de Adesão específico (Reg. Art. 49).
      *(Os 20 setores do Art. 52 semeados com o título do próprio inciso, quem serve em cada
      um (candidatura ou indicação → aprovação → Termo → ativo) e o Termo de Adesão do setor,
      com versão, hash e as formas de prova da v7.5.)*
- [x] Prerrogativas de intervenção cautelar (ex: interditar templo com risco elétrico,
      remover post oficial). *(Art. 50: a interdição — Engenharia e Segurança — e o pedido de
      remoção de postagem — Comunicação —, com aviso na hora, ratificação ou revogação pela
      Diretoria Executiva e o ato registrado para sempre.)*
- [x] Verificação de antecedentes criminais/cíveis (Reg. Art. 133 §5º) na investidura
      em cargo de liderança/confiança ou trabalho com menores — "Termo de Vistoria"
      com data, hash do documento apresentado, parecer e assinatura do responsável.
      *(O Termo de Vistoria do §5º, IV, "c": só o hash da certidão é guardado, nunca o
      documento; acesso só da Diretoria Executiva e do Conselho de Ética. **A Lei 14.811/2024
      pede bem mais** — validade de 180 dias, bloqueio de escala, treinamento: isso é a v7.7,
      que usa este termo como base — ver "O que fica para a v7.7", abaixo.)*

  Entrega: migração 142 (`sql/migrations/142_setores_tecnicos.sql`), `shared/setoresTecnicos.js` e
  `shared/vistoriaAntecedentes.js` (a regra, **pura**), `shared/setoresTecnicosDb.js` e
  `shared/vistoriaAntecedentesDb.js` (banco), as Functions novas `GestaoSetoresTecnicos`
  (`/api/setores-tecnicos/...`, 9 leituras e 17 ações) e `GestaoVistoriasAntecedentes`
  (`/api/vistorias-antecedentes/...`, 5 leituras e 3 ações), o módulo de tela
  `app/modulos/setores-tecnicos.js` (a aba **Setores Técnicos**, a aba **Vistoria de
  Antecedentes** e a sub-aba **Meu Painel → Setores Técnicos**), dez regras no motor de avisos
  da vB.2, duas entradas no ROPA, o bloco de Meus Dados (LGPD) e a retenção do IP. Tocam o que já
  existia: `NotificacoesAgendador` (retenção), `notificacaoDetectores`, `MeusDadosLGPD`,
  `shared/ropa.js` e o seed da homologação.

  **Os 20 setores (Art. 48 a 52).** São do âmbito **geral** ("vedada a sua fragmentação em
  diretórios locais"): a tabela não tem congregação, e a congregação da pessoa é só de onde
  ela vem. **Onde não há profissionais, não há setor** (Art. 48 §2º): um setor sem ninguém
  servindo aparece como "sem profissionais", não como instalado; o catálogo diz **quantos**
  servem, nunca quem. O nome de cada setor é o título que o Regimento dá ao inciso (um teste
  confere a migração contra o texto do Regimento). Cada setor tem marcas: **exige registro no
  conselho de classe** (Engenharia, Saúde, Assistência Social — "credenciados" — e
  Contabilidade), **pode interditar** (Engenharia e Segurança Patrimonial: o Art. 50, I diz
  "Engenharia e Segurança") e **pode pedir remoção de postagem** (Comunicação). A gestão cria,
  edita, desativa e reativa setores (a configurabilidade total do projeto: se o estatuto
  criar um 21º setor, ele entra sem mexer em código).

  **O vínculo e o Termo (Art. 49 §2º).** `CANDIDATO → AGUARDANDO_TERMO → ATIVO → ENCERRADO`.
  A pessoa se candidata (ou a administração a indica); ninguém aprova a própria candidatura;
  só o vínculo **ATIVO**, com o Termo aceito, dá os poderes do setor. Serve quem é membro
  ativo em comunhão, **maior de 18 anos e com data de nascimento no cadastro**; o setor que
  exige registro só recebe quem informa a sigla do conselho e o número. O Termo é o texto
  geral do voluntariado profissional (**sem honorários** — Art. 49 —, a **responsabilidade
  técnica** do profissional que assina projeto ou laudo — Art. 49 §1º —, autonomia, ciência
  dos antecedentes e da imagem, registro do aceite) mais as **cláusulas próprias do setor**:
  os limites da consultoria no Jurídico (Art. 51), a interdição em Engenharia e Segurança
  (Art. 50, I) e o pedido de remoção na Comunicação (Art. 50, II). O **hash cobre o texto
  composto**, e o aceite guarda também a **lista das cláusulas próprias** que a pessoa viu: se
  as marcas do catálogo mudarem depois, a conferência refaz o texto exato (um teste prova). As
  provas são as da v7.5 menos a Lista de Ouro (que existe para regularizar membros antigos): o
  **aceite digital** (IP, cabeçalhos, instante; sem IP público identificável é recusado), a
  **ficha** e o **e-mail/WhatsApp**, estas duas registradas pela gestão com a referência de
  onde o documento está (**em setor com poder, quem indicou ou aprovou a pessoa não registra a
  ficha dela**: outra pessoa da administração confere). O aceite digital leva o **hash do texto
  que a tela mostrou**: se o catálogo mudou entre abrir e aceitar, o servidor recusa e a pessoa
  lê de novo — ninguém aceita um texto que não leu. A adesão **não se altera nem se apaga** (gatilho no banco), salvo a
  anonimização do IP; o vínculo ativo e a prova nascem **na mesma transação** (nunca um sem o
  outro: provado com oito aceites simultâneos). A pessoa **sai quando quiser** (Art. 133 §7º) e a
  gestão pode encerrar (o desligamento exige motivo); depois de encerrado, voltar é um vínculo
  novo — o histórico fica.

  **O poder vem do Termo aceito, não só do catálogo.** Emite o ato quem serve ATIVO **e cujo
  Termo aceito trouxe a cláusula do poder** (interdição ou remoção): ligar a marca de poder num
  setor que já tem gente servindo não dá poder a ninguém — elas aceitaram um Termo sem aquela
  cláusula — e o servidor recusa a edição enquanto houver vínculo vivo; o caminho é encerrar e
  indicar de novo, com o Termo novo. **Tetos de contenção:** cada pessoa tem no máximo **5
  vínculos vigentes** (candidato, aguardando ou ativo) e **3 candidaturas por dia**.

  **Interdição cautelar e pedido de remoção (Art. 50).** Quem serve **ATIVO** num setor com o
  poder emite o ato, em nome do setor e com o **registro profissional** que tinha na hora (o
  Art. 49 §1º: quem assina assume a responsabilidade). A interdição vale **desde a emissão** e
  segue até ser levantada; a Diretoria Executiva a **ratifica** ou **revoga** (revogar exige
  motivo); quem emitiu a **levanta** quando o risco foi sanado (com a observação), e a
  Diretoria também. **Ninguém ratifica nem revoga o próprio ato**, mesmo sendo da Diretoria; quem
  saiu do setor perde o poder de levantar. O pedido de remoção de postagem leva o endereço
  (só `http`/`https`), o motivo (erro grosseiro, direito autoral, doutrina/imagem) e,
  se a rede é um canal cadastrado (v7.3), o canal: é **atendido** por quem cuida da rede, pelo líder
  da congregação (liderança territorial com a permissão `pessoas`, sem restrição de
  departamento), pela gestão ou pela Diretoria — nunca por quem pediu —, **cancelado** por
  quem pediu ou **revogado** pela Diretoria. O identificador do canal (telefone, e-mail, link de
  grupo) **só aparece** a quem administra aquele canal, à gestão e à Diretoria; os demais veem
  a plataforma e o nome. **Contenção do poder:** no máximo **3 atos por
  dia** e **5 em aberto** por pessoa (a emissão é serializada no banco, então 8 pedidos
  simultâneos deixam passar exatamente 3), o mesmo local ou o mesmo link em aberto não se
  repete, e todo texto digitado é recusado se tiver `<` ou `>`. **Avisos** (obrigatórios: o
  destinatário não os desliga): a interdição vai **na hora** à Diretoria, à secretaria dos
  setores, aos líderes da congregação (dirigente, pastor de área e assim até o geral — o líder de
  departamento não) e ao próprio emitente (a confirmação de que o ato saiu em seu nome); o
  aviso **não leva a justificativa técnica**; os avisos de ato saem em lotes e **não esperam a
  entrega dos e-mails** (um provedor lento não segura o ato). A interdição sem ratificação é **cobrada todo
  dia** (depois de `SETOR_INTERDICAO_LEMBRETE_DIAS`, padrão 1) e o pedido de remoção sem
  atendimento também (`SETOR_REMOCAO_LEMBRETE_DIAS`), pelo mesmo motor da vB.2; se ninguém tem a
  permissão de ratificar, o próprio ato avisa quem o emitiu e a cobrança cai para a gestão.

  **O Termo de Vistoria (Art. 133 §5º).** A Diretoria (ou o Conselho de Ética) **solicita**
  as certidões (a pessoa é avisada; no máximo dois avisos em 24 horas) e, ao conferir,
  **lavra o termo**: a data da verificação, o **hash** de cada certidão (SHA-256 calculado **no
  aparelho de quem confere**: o arquivo nunca sobe; o banco nem tem coluna onde guardá-lo), o
  parecer, o destino do original (devolvido ou descartado — a Igreja não guarda cópia, IV, "b") e
  o Diretor que assinou. Os motivos são os do §5º (investidura, mudança de função, suspeita
  fundada, solicitação da Diretoria); o resultado é sem restrição, com restrição ou **recusa**
  (que o Regimento trata como impedimento ou afastamento preventivo). **Ninguém assina a
  própria vistoria**, o termo **não se altera nem se apaga** (gatilho; para corrigir, lavra-se
  outro) e **lavrar pede a confirmação reforçada da vD.4** (chave de acesso ou código por
  e-mail, até 10 minutos). Acesso **exclusivo**: a permissão `vistoria_antecedentes`, no nível
  geral, em **sessão de liderança** (PIN e código nunca valem). A tela mostra **quem exerce
  liderança e ainda não tem termo** (a checagem da investidura é obrigatória, II, "a") e um
  aviso mensal cobra a Diretoria (só quem tem a permissão **no nível geral** o recebe). O aviso à
  pessoa diz o que levar e que não fica cópia, mas **não diz por que** a Diretoria pergunta.
  **Termo lavrado por engano** (matrícula errada) não se apaga: a Diretoria o **anula** por um
  registro à parte, só de acréscimo, com o motivo, quem anulou e a confirmação reforçada (quem pode lavrar pode anular: a Diretoria e o Conselho de Ética); o termo
  continua lá, marcado como anulado, e deixa de contar como a vistoria da pessoa (ela volta a
  "quem falta"). Ninguém anula o termo feito sobre si. A tela mostra o **nome da pessoa** da
  matrícula antes de lavrar, solicitar e anular, para não errar de pessoa, e avisa que o parecer
  não deve citar quem denunciou nem terceiros (o termo é imutável). A auditoria guarda só quem
  agiu, qual termo e a contagem de certidões — nunca o parecer, o resultado, o hash, a função nem o motivo.

  **Permissões.** Três, novas: `setores_tecnicos` (catálogo, vínculos, Termo e a visão de todos
  os atos), `setores_ratificacao` (a Diretoria decide) e `vistoria_antecedentes`. A migração
  concede as três a **Presidente e Secretário Geral** (a Diretoria Executiva, como a 120 já fez com
  `escalas`) e **alarga `Papeis.Permissoes` para 1.000 caracteres** — a coluna nasceu com 300 ou 500
  e um UPDATE que estourasse derrubaria o deploy. O Conselho de Ética recebe `vistoria_antecedentes`
  em Permissões. As três exigem **o nível geral numa mesma concessão e sessão de liderança**; a
  aba só aparece para o nível geral (`ABAS_SO_DO_GERAL`). Sem permissão nenhuma, qualquer login faz o
  que é da própria pessoa: candidatar-se, aceitar o Termo, sair e, se serve com o poder, emitir.

  **A tela.** *Setores Técnicos* (gestão): os 20 setores (quantos servem, situação, marcas;
  criar, editar, desativar), os vínculos (aprovar, recusar, registrar a ficha ou a mensagem, ver e
  **imprimir** o texto do Termo, encerrar, **indicar alguém**) e os atos cautelares com os botões
  que o próprio ato diz que a pessoa pode usar. *Vistoria de Antecedentes*: quem falta, os termos
  lavrados, **lavrar** (com o botão de escolher o arquivo e o hash calculado na hora, ou o hash
  colado), solicitar as certidões e **anular** um termo lavrado por engano. *Meu Painel → Setores Técnicos* (qualquer login, inclusive PIN):
  a situação, a candidatura, o Termo para ler e aceitar, sair, os formulários de interdição e de
  pedido de remoção (só para quem serve com o poder), os atos que emiti e, para o líder, os atos
  da congregação dele. Tudo escapado na saída; a certidão é só arquivo escolhido no navegador.

  **Auditoria e integridade.** `SETOR_CRIADO/EDITADO/DESATIVADO/REATIVADO`, `SETOR_CANDIDATURA`,
  `SETOR_INDICACAO`, `SETOR_CANDIDATURA_APROVADA/RECUSADA`, `SETOR_VINCULO_ENCERRADO`,
  `SETOR_ADESAO_REGISTRADA`, `INTERDICAO_EMITIDA`, `INTERDICAO_RATIFICADA`, `ATO_REVOGADO`,
  `INTERDICAO_LEVANTADA`, `REMOCAO_POSTAGEM_SOLICITADA/ATENDIDA/CANCELADA`, `VISTORIA_SOLICITADA`,
  `VISTORIA_LAVRADA`, `VISTORIA_ANULADA` e `IP_ANONIMIZADO`. O banco garante: um vínculo vigente por pessoa e setor; ATIVO só
  com `AtivadoEm`; uma adesão por vínculo e cada forma só com a sua prova; adesão, ato e termo
  imutáveis (gatilhos; a anulação do termo também, e é uma só por termo); ato encerrado definitivo; motivo e status coerentes com o tipo; revogação
  com motivo; fechamento com quem, quando e observação; hash da certidão em minúsculas (compara em
  binário); termo sem auto-assinatura e sem original na recusa.

  **Retenção (LGPD).** O vínculo, o Termo (forma, data, versão, hash) e os atos ficam **sem prazo
  final**: são prova. O **IP e os cabeçalhos** do aceite digital são anonimizados **5 anos depois
  que o vínculo termina** (o mesmo `VOLUNTARIADO_IP_RETENCAO_DIAS`; rotina diária; o gatilho só
  admite essa troca). O termo de vistoria é o arquivo interno que o Regimento manda guardar e só
  tem hash. Dois blocos no ROPA e em **Meus Dados**: a pessoa recebe, a pedido, os vínculos, o
  Termo (com o IP, que é dela), os atos que emitiu e os termos de vistoria feitos sobre ela
  (com o parecer, os hashes e a data da anulação, se houve; sem o nome de quem assinou).

  **Decisões que o Regimento não fecha (cada uma é uma linha, a CLI pode reverter).**
  - **Segurança Patrimonial também interdita.** O Art. 50, I fala "Engenharia e Segurança"; as duas
    marcas estão no catálogo (uma linha cada) e a CLI pode tirar a de Segurança.
  - **A interdição vale na hora e não caduca sozinha.** O Regimento pede "ratificação" sem prazo; uma
    interdição por risco de vida não pode perder o efeito porque a Diretoria demorou, então ela segue
    até ser decidida ou levantada — e a Diretoria é **cobrada todo dia**.
  - **O sistema não cancela culto nem escala sozinho.** A interdição é um ato formal com aviso e
    ratificação; quem decide cancelar o culto do dia é o dirigente, avisado na hora. (A integração com a
    agenda e as escalas, se a CLI quiser, é uma decisão à parte.)
  - **Quem emite com PIN.** O voluntário profissional entra por matrícula e PIN de 4 números (a
    decisão do responsável desde a v7.5), e é com ele que o ato é emitido. As contenções são o vínculo
    com Termo aceito, os tetos, a ratificação pela Diretoria, o aviso ao próprio emitente e a trilha.
  - **O líder que atende o pedido de remoção** é a liderança de nível territorial (congregação, área
    ou geral) com a permissão `pessoas` e sem restrição de departamento, cujo escopo alcança a
    congregação (a migração não tem o conceito de "dirigente"): o tesoureiro e o líder de
    departamento não atendem.
  - **O texto do Termo do setor é um rascunho aprovado pelo responsável sem parecer de advogado** (a
    Igreja não tem). Trocar o texto cria outra versão e outro hash, sem invalidar quem aderiu.
  - **A Diretoria Executiva = Presidente e Secretário Geral** nas permissões iniciais; o Conselho de
    Ética recebe a de vistoria por Permissões.
  - **Lavrar e anular o termo pedem a confirmação reforçada da vD.4**, como os quatro atos de peso daquela fase.
  - **Termo errado se anula, não se apaga** (LGPD art. 18, III): o registro fica, marcado, e deixa de contar.
  - **O poder de emitir só vale com a cláusula no Termo que a pessoa aceitou** (acima): a marca no catálogo sozinha não basta.
  - **O setor só serve quem tem 18 anos ou mais** (a mesma leitura conservadora da v7.5).

  **O que fica para a v7.7 (e por quê).** O Termo de Vistoria aqui feito é a base: a v7.7 liga a vistoria
  à esteira de habilitação (v5.7), dá **validade de 180 dias**, bloqueia a escala e acrescenta o que a Lei
  14.811/2024 exige de quem serve com menores. Também fica para lá o **dever de auto-denúncia** do voluntário
  que passa a responder a inquérito ou processo (Art. 133 §5º, V): é do mesmo assunto, e o Termo de Adesão
  já o informa à pessoa. Não fica nada da v7.6 em aberto.

## v7.7 — Habilitação para Ministério com Menores *(7ª rodada — OBRIGAÇÃO LEGAL VIGENTE)*

> **Este é o achado mais grave de toda a 7ª rodada.** A **Lei 14.811/2024**
> inseriu o **art. 59-A no ECA** e está em vigor desde **12/01/2024**, sem
> vacatio. **Correção da Trava 7-C (23/10/2026):** o texto antigo dizia que toda
> entidade com crianças está obrigada; a lei é mais estreita. O **caput** alcança a
> instituição que **recebe recurso público**; o **parágrafo único**, os
> "**estabelecimentos educacionais e similares**", que devem manter fichas e
> certidões de antecedentes de **todos os colaboradores**. A EBD pode ser tida
> como "similar", mas não há obrigação inequívoca para a Igreja como tal. Por
> isso a Igreja **adota a exigência por cautela** e pelo **Regimento, Art. 133
> §5º** (com a atualização semestral, inclusive para voluntários); a base legal
> no ROPA é o Art. 7º, II onde a lei alcança e o Art. 7º, IX (legítimo interesse
> na proteção), sem afirmar obrigação legal em todos os casos.

*(Numeração: as versões v7.7 e v7.8 existiam como lacuna no documento — o
roadmap pulava de v7.6 para v7.9 sem nota. A lacuna foi preenchida com o tema
que mais fazia falta. Em 15/10/2026 a v7.9 foi movida, na íntegra, para a v8.1 da fase 8: a numeração da fase 7 segue na v7.10.)*

- [x] **Habilitação para Ministério Infantojuvenil** por voluntário: ficha
      cadastral + certidão de antecedentes (federal/PF e estadual/TJ) anexada,
      com `data_emissao` e **validade automática de 180 dias**.
      *(A esteira da v5.7 passou a usar a verificação real: o passo "Antecedentes" só fecha
      com um Termo de Vistoria da v7.6 válido — as **duas** certidões criminais, sem restrição,
      emitidas há no máximo 180 dias; a certidão não é guardada, só o hash e a data de emissão
      que a v7.6 já guarda. A validade é **calculada na leitura**: vale até o 180º dia contado da
      EMISSÃO, inclusive; vence a mais antiga das duas. A ficha cadastral é reconfirmada a cada
      semestre pela própria pessoa, em Meu Painel, ou pela Secretaria.)*
- [x] **Bloqueio de escala por habilitação vencida** — não é alerta: quem está
      com certidão vencida sai automaticamente das escalas de ministério com
      menores e não pode ser escalado. Alertas em D-60/D-30/D-15 antes de vencer
      (a renovação leva dias para sair; avisar no dia do vencimento é inútil).
      *(O portão vale em **todos** os caminhos que colocam alguém numa escala de equipe marcada
      "contato com menores": aceitar, confirmar, trocar (e aprovar a troca), auto-escalar,
      convite em cadeia, entrar num grupo de rodízio e gerar o rodízio. Quem perde a habilitação
      sai das escalas futuras **na hora** (marcar inapto, ligar a marca da equipe, declarar uma
      auto-denúncia) e, para o que vence com o tempo, na rotina diária, que roda ANTES dos avisos.
      A escada 60/30/15 avisa a pessoa, o líder da equipe e a secretaria; quem entra tarde só
      recebe o último degrau e a renovação reabre a escada.)*
- [x] **Treinamento obrigatório de proteção** com validade e renovação periódica
      (padrão internacional: 2 a 3 anos), também bloqueante — conecta com a
      trilha de formação (v6.9). *(MinistrySafe; Church of England safeguarding)*
      *(Quando há requisito BLOQUEIA no contexto `HABILITACAO_TREINAMENTO` da trilha, a situação
      vem da trilha (vigente/vencendo valem; vencida bloqueia); sem requisito, a atestação da
      esteira vale 2 anos (`HABILITACAO_TREINAMENTO_DIAS`, em Catálogos → Prazos).)*
- [x] **Regra dos dois adultos** (*two-adult rule*) validada na escala: nenhuma
      sala com menores publica escala com **um adulto sozinho**, e a proporção
      adulto/criança mínima por faixa etária é verificada antes de publicar.
      *(Church Answers; padrão consolidado em seguradoras de igrejas nos EUA)*
      *(Publicar **recusa** a sala sem dois adultos habilitados, ou fora da proporção
      (berçário 3, maternal 5, infantil 8, juniores 10, adolescentes 12 crianças por adulto,
      todos ajustáveis em Prazos), ou sem a faixa etária da equipe, ou sem as crianças previstas
      que o líder informa por serviço. O adolescente serve como auxiliar e **não conta** como adulto.
      O rodízio de equipe com menores nasce sempre como rascunho, para a publicação passar
      pelo portão. A rotina diária avisa o líder da sala que ficou com menos de dois adultos nos
      próximos 7 dias.)*
- [x] **Regra dos 6 meses** de frequência antes de servir com menores (v5.7) —
      calculada, não digitada. *(Da `DataAdmissao`, com o fim de mês tratado: 31/ago + 6 meses
      = 28/fev. Sem a data, não se presume.)*
- [x] **Política de comunicação eletrônica com menores**: vedada mensagem privada
      1:1 entre adulto e menor; canais de grupo exigem segundo adulto e
      responsável com acesso. Aceite da política registrado por voluntário
      (conecta com a Regra das 24 Horas, v7.3).
      *(Texto versionado com hash (`POLITICA_VERSAO`), aceito digitalmente com o hash do texto que a
      tela mostrou, o IP e o instante (ou em ficha assinada, registrada pela Secretaria); sem o
      aceite da versão vigente a pessoa não serve com menores. O sistema **não tem mensagem
      privada**: a vedação 1:1 é o compromisso aceito, e a Regra das 24 Horas da v7.3 trata o
      conteúdo impróprio em canal oficial. Todo canal que inclui menores exige **dois
      administradores adultos habilitados com o Termo de Dever de Moderação aceito e um responsável
      com acesso**: o canal que não cumpre fica IRREGULAR e é cobrado todo mês; ligar a marca
      num canal que já tem administradores, encerrar o segundo administrador e designar quem
      não está habilitado são recusados.)*
- [x] **Consentimento específico e destacado do responsável** (LGPD Art. 14) para
      dados de menor — uso de imagem, alergia/condição de saúde para o crachá —
      versionado e revogável.
      *(Dois consentimentos separados, cada um com texto próprio, versão e hash: **imagem** e
      **saúde no crachá**. Quem concede é o responsável cadastrado pela Secretaria (digital, com IP,
      ou em ficha registrada por OUTRA pessoa); qualquer responsável ativo revoga, e revogar a imagem
      **apaga o arquivo da foto**. Vale enquanto quem autorizou continua responsável ativo e o
      menor tem menos de 18 anos. A foto de menor deixa de depender do consentimento do próprio menor
      (que não vale): só o do responsável destrava. Revogar a foto de qualquer membro passou a apagar
      o arquivo, como o ROPA já dizia. **O dado de alergia e o crachá ainda não existem no sistema**:
      chegam com o check-in infantil da v7.10, que só consulta este consentimento.)*
- [x] **Painel de conformidade por congregação**: quantos voluntários aptos,
      quantos vencendo, quantos bloqueados — o Dirigente precisa ver isso antes
      de o problema existir, e a Secretaria Geral precisa ver o campo inteiro.
      *(Aba **Ministério com Menores**: o painel da congregação para quem habilita e o do campo
      inteiro para a Secretaria Geral, com o resumo, o status de cada voluntário e o próximo
      vencimento. O que é reservado à Diretoria — restrição na vistoria, comunicação em análise,
      cadastro nacional, fora de comunhão — a gestão da congregação vê só como "pendência com a
      Diretoria", **inclusive nas contagens e na situação das certidões** (o ensaio no banco achou os
      dois vazamentos).)*
- [x] Adapter preparado (sem depender dele) para o futuro cadastro nacional de
      condenados por crimes contra menores — hoje ainda é projeto de lei, não
      obrigação vigente; o campo fica pronto sem criar dependência.
      *(`shared/cadastroNacionalMenores.js`: interface do provedor, tabela de consultas só de
      acréscimo e o efeito na aptidão ("consta" bloqueia; "indisponível" nunca bloqueia). Sem
      provedor registrado não faz nada, e nenhuma rota ou rotina o chama.)*
- [x] **Dever de auto-denúncia** do voluntário que passa a responder a inquérito ou
      processo criminal (Regimento Art. 133 §5º, V — a omissão é falta grave): canal de
      aviso à Diretoria e ligação com a vistoria. *(Veio da v7.6, que entregou o Termo de
      Vistoria — `VistoriasAntecedentes`, com `ComVulneraveis` e `ultimaVistoria()` prontos
      para esta versão usar.)*
      *(Em Meu Painel, a pessoa comunica **só o tipo e a data da ciência** — nenhum texto livre, nenhum
      número de processo; a Diretoria Executiva e o Conselho de Ética são avisados na hora e
      cobrados todo dia até decidir. Por cautela, e sem ser punição, o contato dela com menores fica
      suspenso e ela sai das escalas futuras com menores até a decisão: **manter** (volta
      imediatamente, se a habilitação está em dia) ou **afastar preventivamente** (que outra pessoa
      da Diretoria pode levantar depois, uma única vez). Decidir e liberar pedem a confirmação
      reforçada; ninguém decide sobre a própria comunicação; a auditoria não leva nem o tipo.)*

  Entrega: migração 143 (`sql/migrations/143_ministerio_menores.sql`), `shared/ministerioMenores.js`
  (a regra, **pura**), `shared/ministerioMenoresDb.js` (banco), `shared/menoresConsentimento.js` e
  `menoresConsentimentoDb.js` (consentimento do responsável), `shared/cadastroNacionalMenores.js`, as
  Functions novas `GestaoMinisterioMenores` (`/api/ministerio-menores/...`, 6 leituras e 8 ações) e
  `GestaoConsentimentoMenor` (`/api/consentimento-menor/...`, 3 leituras e 3 ações), as rotas novas
  `escalas/criancas-previstas` e `canais/responsavel-acesso`, o portão nas escalas, nos convites, nas
  trocas, nos grupos e no rodízio, a retirada automática, onze regras no motor de avisos da vB.2,
  a retenção do IP e os blocos de Meus Dados, ROPA e RIPD. Tocam o que já existia: `escalas.js`,
  `voluntariadoDb.js`, `habilitacaoVoluntarios.js` (os antecedentes deixam de ser carimbo manual),
  `GestaoEscalas`, `GestaoHabilitacaoVoluntarios` (a elegibilidade passa a trazer a aptidão),
  `canais.js`/`canaisDb.js`, `consentimentoFoto.js`, `MinhaFoto`, `UploadFotoMembro`,
  `GestaoConsentimentoLGPD`, `NotificacoesAgendador` e `notificacaoDetectores`.

  **Quem está apto** (`avaliarAptidao`, calculado na leitura, nunca digitado): em plena comunhão;
  com data de nascimento; sem comunicação à Diretoria em análise e sem "consta" no cadastro nacional;
  habilitação da esteira concluída, em dia e não marcada inapta; **as duas certidões criminais**
  do último Termo de Vistoria (não anulado) sem restrição e com menos de 180 dias; treinamento de
  proteção em dia; ficha confirmada nos últimos 180 dias; política da versão vigente aceita; 6 meses
  de comunhão. Cada falta vira um bloqueio com mensagem em português simples e o que fazer. O menor de
  18 anos não tem certidão de antecedentes (ato infracional corre em segredo de justiça): serve só
  como auxiliar, nunca conta como adulto e ainda precisa de tudo o mais.

  **Decisões que a Lei e o Regimento não fecham (cada uma é uma linha; a CLI pode reverter).**
  - **A validade da certidão conta da emissão** (a Lei fala em "atualização semestral"): 180 dias,
    configurável. Vale até o último dia, inclusive.
  - **As duas certidões criminais (federal e estadual) são exigidas**; a de distribuição cível é
    informativa. A vistoria que decide é a última não anulada: uma vistoria mais nova incompleta
    não é completada por uma antiga.
  - **A marca `ComVulneraveis` da vistoria não decide a aptidão** (senão uma vistoria recente de
    investidura, completa, seria recusada só pela marca): decidem as certidões.
  - **Treinamento sem trilha configurada vale 2 anos**, atestado por quem habilita.
  - **Quem comunica a auto-denúncia fica suspenso do contato com menores por cautela** até a
    decisão — padrão de políticas de proteção de crianças; a mensagem diz que não é punição.
  - **O líder só vê o motivo curto; o colega que pede uma troca não vê motivo nenhum**; a pessoa
    vê tudo o que lhe diz respeito.
  - **A regra de canais vale para qualquer canal que inclui menores** (não só grupos): mais
    rigorosa, e a CLI pode restringir a grupos numa condição de `pendenciasDeMenores`.
  - **Rodízio com menores nasce rascunho**: a quantidade de crianças é por serviço e só existe
    depois dele.
  - **Os prazos configuráveis só podem encurtar**: certidão e ficha têm teto de 180 dias, treinamento
    de 3 anos, e o mínimo de adultos na sala é 2 (configurar 365 dias ou 1 adulto não afrouxa a regra).
  - **Em sala com menores, adulto só troca com adulto** (o adolescente apto é auxiliar e não conta como
    adulto): senão a troca esvaziaria a sala dos dois adultos que a regra exige.
  - **Sala sem nenhum voluntário não publica** (zero adultos também é falta).
  - **Ninguém reabilita a si mesmo** e **desligar a marca de menores de uma equipe** (que derruba todo o
    portão) pede a confirmação reforçada, como a decisão da auto-denúncia; ligar é livre.
  - **Canal que inclui menores não é divulgado no site**, e a indicação do "responsável com acesso" tem uma
    mensagem de recusa só (não existe / não está ativo / não é adulto), para não virar consulta de cadastro.
  - **A rotina diária não dá verde quando falha o que protege criança**: a retirada das escalas ou um
    detector do ministério com menores que falha faz a resposta virar 500 (o job do GitHub fica vermelho);
    um detector de outro assunto que falha só é registrado. Vistoria lavrada com restrição ou recusa, ou
    termo anulado, tira a pessoa das escalas com menores **na hora**, sem esperar a rotina.
  - **Foto de menor só fica com a autorização vigente do responsável**: a faxina diária (e o ato que tira o
    responsável) apaga a foto de menor de 18 anos sem essa autorização — inclusive a enviada antes da v7.7
    com o consentimento do próprio menor, que não vale. O adulto que desmarca só o telefone/e-mail continua
    com a foto (decisão antiga, travada em teste).
  - **A gestão não distingue as pendências reservadas, nem pelos detalhes**: restrição nos antecedentes,
    comunicação em análise, cadastro nacional e fora de comunhão aparecem como a **mesma linha** ("pendência
    reservada: procurar a Diretoria"), sem datas de certidão e sem "próximo vencimento"; a legenda do painel
    não dá exemplo da causa. A Diretoria vê o detalhe.
  - **A Diretoria sabe que o motivo que escreve será lido pela pessoa** (Meus Dados, direito de acesso da
    LGPD): o formulário de decidir e de levantar o afastamento diz isso.
  - **A Secretaria não registra o consentimento de foto de menor de 18 anos** (a rota recusa e a tela não
    oferece o botão): quem autoriza é o responsável; registrar o da própria pessoa seria "sucesso" sem efeito.
  - **A tela diz "a lei e o Regimento pedem"** e não só "a lei": a Lei 14.811/2024 não fala em treinamento,
    política de comunicação nem 6 meses de comunhão; isso é Regimento e regra do sistema. O número de crianças
    por adulto aparece como **padrão** (a Igreja pode mudá-lo em Catálogos → Prazos).
  - **Risco aceito: as ações da própria pessoa valem em sessão de PIN** (aceitar a política, confirmar a
    ficha, comunicar a auto-denúncia), pela decisão de 02/10/2026 de acesso do membro por PIN. Ninguém
    ganha poder com isso: a aptidão continua dependendo de certidões lançadas pela Diretoria, treinamento
    atestado e esteira; e a auto-denúncia só **restringe** (suspensão cautelar). As decisões da Diretoria
    (decidir/liberar) exigem sessão de liderança com a confirmação reforçada.

  **O que fica para a v7.10 (e por quê).** O **dado** de alergia ou condição de saúde e o **crachá**
  do check-in infantil: hoje não existem no sistema (o consentimento de saúde já pode ser dado e
  revogado, e a v7.10 precisa apagar o dado ao revogar). Também fica lá a autorização do responsável
  para quem **não é membro** (criança só de EBD ou de apresentação): o consentimento desta versão é
  do menor que é membro, com responsável cadastrado. Não fica nada da v7.7 em aberto.

## v7.8 — Incidentes, notificação obrigatória e escuta protegida *(7ª rodada — OBRIGAÇÃO LEGAL)*

Fluxo **deliberadamente separado da disciplina eclesiástica** (FASE 3) e da
Ouvidoria (v3.7). Não é a mesma coisa: processo disciplinar apura falta contra a
igreja; aqui o dever é **externo e legal** — comunicar ao Estado. Tratar suspeita
de maus-tratos como assunto interno é exatamente o erro que gerou as maiores
crises institucionais em denominações no mundo inteiro.

- [x] **Notificação obrigatória ao Conselho Tutelar** diante de **suspeita** (não
      exige certeza, não cabe à igreja investigar): ECA **Art. 13** e **Art. 70-B,
      parágrafo único** (quem cuida de criança por ministério responde pelo retardamento
      ou pela omissão). *(Correção da Trava 7-C: o texto antigo citava a multa do Art. 245,
      que alcança o médico, o professor e o responsável por estabelecimento de saúde ou de
      ensino fundamental, pré-escola ou creche — não a Igreja como tal.)* Fluxo com **SLA curto (24h)**, relógio regressivo visível ao
      Dirigente e à Secretaria Geral, campos de órgão notificado (Conselho
      Tutelar/MP/Polícia), protocolo e anexo do ofício.
      *(Registrar uma suspeita de violência abre o relógio de **24 horas** contados do instante em
      que a Igreja ficou sabendo (padrão: agora; quem registra pode informar "soubemos há N horas", até
      30 dias). O prazo é **calculado na leitura** — vence mesmo que nenhuma rotina rode — e a fila mostra
      o relógio regressivo (verde, amarelo abaixo de 12 h, vermelho abaixo de 4 h, "vencido há…"). O
      aviso do incidente novo sai **na hora** (Diretoria, Comitê e o Dirigente DA congregação; nunca o
      envolvido), e uma rotina **horária** (7h às 22h de Brasília) avisa com 12 h, com 4 h e, vencido, a
      cada 6 h (no máximo 5 avisos de vencido por caso; depois disso o **resumo diário das 7h** assume e
      lembra a Diretoria e o Comitê todo dia enquanto o caso estiver vencido ou sem comprovante). Cada comunicação
      registra órgão (Conselho Tutelar, Ministério Público, Polícia, Disque 100, outro), forma (ofício,
      pessoalmente, telefone, e-mail, sistema do órgão), data e hora, **protocolo do órgão**, onde o
      comprovante está guardado e se foi **dentro do prazo**; o ofício pode ser anexado ao incidente.
      Comunicar fora do prazo vale, mas fica marcado e entra no relatório. O protocolo e o lugar do comprovante
      precisam **ter sentido** (pelo menos 4 letras ou números: "-", "n/a" ou "0000" não valem, porque uma
      comunicação vazia pararia o relógio para sempre), e um **anexo de prova nunca se apaga**.)*
- [x] **Encerramento bloqueado sem comprovante da comunicação externa** — o caso
      não fecha no sistema enquanto não houver prova de que o Estado foi avisado.
      *(A suspeita de violência só encerra com pelo menos uma comunicação **com comprovante** (protocolo
      do órgão, lugar onde o papel está guardado ou arquivo anexado) **e** a decisão do Comitê sobre o
      afastamento de cada envolvido que é membro; e só como "encaminhado às autoridades": a apuração não é
      da Igreja. Uma suspeita **nunca é rebaixada** (só se sobe de nível). Quebra de política e
      quase-acidente encerram com a providência tomada.)*
- [x] **Escuta protegida** (Lei 13.431/2017): a igreja **acolhe e encaminha, não
      inquire**. O formulário não tem campo de "inquirição"; exibe o roteiro
      correto (acolher → registrar o relato espontâneo, na íntegra e sem
      interpretação → encaminhar) e restringe a leitura do relato a papéis
      específicos. Repetir a entrevista é revitimizar — e o sistema tem que
      ajudar a não fazer isso.
      *(O formulário só tem fatos (quando, onde, o que aconteceu), quem contou e o **relato como foi
      contado**, e mostra o roteiro "acolher / registrar como foi dito / encaminhar" e o "**não faça**"
      (perguntas para "tirar a verdade", chamar o apontado, avisar a família dele, contar a terceiros). O
      relato fica em **tabela à parte, só de acréscimo**, **um por incidente** (a conversa não se repete;
      informação nova e espontânea entra como **adendo**, no máximo 5), e só é lido pela liderança de
      proteção, com a **confirmação reforçada** (chave de acesso ou código por e-mail) — **cada leitura
      fica registrada** (quem e quando, nunca o conteúdo) e a Diretoria vê quem leu.)*
- [x] **Afastamento cautelar automático** do envolvido de toda escala com menores
      no momento do registro — medida protetiva, **não** punição antecipada, e
      registrada como tal (a v2.6/`MedidasCautelares` já tem o mecanismo).
      *(Entra na **mesma aptidão da v7.7** como bloqueio reservado `INCIDENTE_EM_APURACAO`: vale em
      todos os caminhos de escala, convite, troca, rodízio e designação de administrador de canal com
      menores, e o envolvido sai das escalas futuras **na hora** do registro. É **calculado**: envolvido
      (membro) de suspeita de violência cuja **última decisão** do Comitê não é "levantado"; sem decisão,
      continua (o sistema não rebaixa sozinho) e, passados 3 dias, o Comitê é cobrado toda semana. Ninguém
      decide sobre o próprio afastamento. Para a gestão da congregação vira "pendência com a Diretoria"; para
      a **própria pessoa** o texto, o código e o rótulo são genéricos ("por cautela, o seu contato com
      crianças está suspenso, por decisão da Diretoria; isso não é uma condenação") — nada diz que é um
      incidente. Reaproveitei o mecanismo da v7.7 e não o de `MedidasCautelares` (que é patrimonial, Art. 45).)*
- [x] Registro de incidentes em três níveis: quase-acidente, quebra de política e
      alegação — porque o padrão internacional mostra que o que antecede o caso
      grave é a sequência de pequenas quebras que ninguém registrou.
      *(Qualquer pessoa logada, inclusive por PIN, registra; quem registra vê só a situação do que
      registrou ("em andamento"/"encerrado"). A **rotina de padrões** olha os últimos 90 dias: três
      registros de quase-acidente ou quebra na **mesma equipe** ou na **mesma pessoa** avisam a Diretoria
      e o Comitê (e a tela de Padrões lista). Só a suspeita de violência afasta alguém; a quebra de política
      não. O nível pode **subir** (a tela de reclassificar), e então o relógio de 24 horas começa naquele
      instante.)*
- [x] Comitê de revisão com participação **não-clerical** e relatório anual de
      conformidade por congregação. *(Praesidium; Royal Commission — 10 Child
      Safe Standards; Dallas Charter/USCCB)*
      *(O **Comitê de Proteção** é o papel de mesmo nome no cadastro de lideranças (nível geral, com a
      permissão `protecao_menores`): quem é cadastrado nesse papel é do Comitê. A composição é
      **calculada**: pelo menos **3 membros** e **pelo menos um que não seja do clero** (o cargo vem do
      cadastro — Pastor, Evangelista, Presbítero, Diácono e Missionário são clero —, nunca é digitado);
      incompleto, a Diretoria é avisada toda semana. O **relatório anual** (nível geral) traz, por
      congregação e no total: incidentes por nível, suspeitas comunicadas **dentro do prazo** e fora/sem
      comunicação, tempo médio até comunicar, afastamentos ativos, a composição do Comitê e a habilitação
      dos voluntários — só números, nenhum nome nem relato — e imprime.)*
- [x] Canal de denúncia acessível também à criança/adolescente, em linguagem
      adequada — a Ouvidoria (v3.7) hoje é desenhada para adulto.
      *(**"Preciso de ajuda"**: tela sem login (a criança pode não ter conta), em linguagem simples, com os
      telefones **100** (Disque Direitos Humanos, de graça, 24 h) e **190** sempre visíveis, só **um campo
      de texto** obrigatório (nenhuma pergunta de "prova"), "quem está escrevendo" e "como falar com você"
      opcionais, e a igreja opcional. O pedido vira **suspeita de violência** com o relógio de 24 horas e
      avisa **só o nível geral** (Diretoria e Comitê): a congregação escolhida é palpite de quem escreveu, e o
      Dirigente dela pode ser justamente a pessoa de quem se fala, então ele nem vê o pedido. **Não guarda IP
      nem cabeçalhos** (o limite por origem é em memória, em hash truncado); contra inundação há 5 pedidos por
      hora por origem e, no total, 15 por hora e 60 por dia — no teto, ou em erro, a resposta **sempre** traz a
      orientação do 100 e do 190. Se o pedido não tem conteúdo de proteção (teste, engano), a Diretoria o
      **arquiva como "sem conteúdo de proteção"**, com o motivo, e o resto do nível geral é avisado.)*

### Contrato (rotas)

`GestaoProtecaoMenores` (`/api/protecao-menores/{acao}`): de **qualquer pessoa logada** — `catalogos`,
`meus`, `registrar`; da **gestão** (permissão `protecao_menores`, sessão de liderança; o Dirigente só
enxerga a sua congregação) — `incidentes`, `incidente`, `relato` (confirmação reforçada), `comunicacao`,
`adendo`, `reclassificar`; do **nível geral** (Diretoria e Comitê) — `cautelar-decidir`, `encerrar` e
`vincular-envolvido` (liga ao cadastro a pessoa que foi registrada só pelo nome; confirmação reforçada),
`padroes`, `comite`, `relatorio-anual`. `ProtecaoAjuda` (`POST /api/protecao-ajuda`,
sem login). `ProtecaoVerificador` (`POST /api/protecao-verificador-interno`, por segredo; chamada de hora em
hora pelo workflow `rotinas-protecao.yml`). Anexos do incidente: `/api/anexos` com a tabela `IncidentesProtecao`.

### Decisões que a Lei e o Regimento não fecham (cada uma é uma linha; a CLI pode reverter)

- **Quem é "envolvido" nunca vê o incidente** (conflito de interesse): para ele a lista não o mostra, o
  detalhe, o relato e os anexos respondem como "não existe". Vale também para a Diretoria: se o Presidente é o
  envolvido, os outros membros da Diretoria e do Comitê tratam.
- **O afastamento cautelar só vem de suspeita de violência** (não de quebra de política ou quase-acidente) e
  só para envolvido que é membro; para quem não é do cadastro (um visitante, alguém de fora) o sistema não
  tem como afastar e a decisão fica com a Diretoria fora dele — o caso encerra sem decisão de afastamento.
- **A tela da própria pessoa afastada não diz o motivo**: a apuração é das autoridades e avisá-la do que
  consta contra ela, antes disso, pode atrapalhar. Ela é avisada da retirada da escala (texto genérico) e,
  se o Comitê levantar o afastamento, do levantamento.
- **O prazo de 24 horas conta da ciência**, não do fato: quem registra pode recuar a ciência (até 30 dias),
  e o caso já nasce vencido se for o caso (aparece no relatório).
- **Registrar não é livre de limite**: 10 registros por dia por pessoa, 3 suspeitas por dia (contra uso de
  má-fé; um relato verdadeiro nunca chega perto). Quem passa do limite lê para ligar para o 100 ou para o 190
  ou falar com o Dirigente. Quem registrou fica registrado (o dono do registro está na tabela).
- **O relato nunca vai para aviso, auditoria, relatório nem log**; a auditoria das ações sensíveis não leva o
  número do caso, quem agiu nem o nível (o elo fica nas tabelas, que têm acesso restrito). A trilha lida por
  quem tem a permissão "auditoria" não consegue ligar uma pessoa a um incidente.
- **Retenção de 20 anos do encerramento** (registro de apuração de crime contra criança: o prazo corre a partir
  dos 18 anos da vítima); a CLI pode ajustar em Catálogos. Nada se apaga (gatilhos no banco).
- **A rotina horária roda das 7h às 22h de Brasília** e **só abre o banco se há prazo correndo**: o banco é
  serverless e só pausa se ficar uma hora sem uso; uma chamada por hora o dia todo o manteria ligado (R$ 65 a 86
  por dia contra R$ 6 a 7 pausado). Por isso a rotina pergunta antes a uma marca guardada no Storage ("há
  suspeita aberta, sem comunicação, dentro da janela de avisos?") e, se não há, responde sem tocar no banco; a
  marca é refeita por toda mudança e pela rodada diária. Sem marca, ou com o Storage fora do ar, na dúvida ela
  olha o banco. Ela cuida só do aviso do incidente novo e do relógio; padrão de quebras, Comitê incompleto,
  afastamento sem decisão e o resumo diário são da rodada das 7h. De madrugada o aviso do incidente novo continua
  saindo na hora do registro e o relógio é calculado na leitura: só o lembrete espera. Um aviso cujo e-mail não
  saiu é reenviado a cada rodada (até 48 horas depois).
- **Os avisos que protegem criança não se desligam**: as regras da proteção e do ministério com menores são
  obrigatórias; a tela de regras recusa desligar o aviso ou o e-mail (só o título pode ser ajustado).
- **Quem manteve o afastamento não o levanta sozinho**: o levantamento tem de vir de outra pessoa do nível geral
  (dois olhares sobre a decisão mais delicada). A pessoa afastada é avisada do levantamento com título neutro.
- **Quem registra não fica sabendo o efeito**: a resposta não diz quantas escalas foram desmarcadas nem a
  quantas pessoas o aviso chegou (isso revelaria se a pessoa apontada servia em alguma escala). Se a matrícula
  informada não existe, o registro vira "só o nome", sem dizer isso a quem registrou; a Diretoria confere e
  vincula. Os padrões e o painel da v7.7 não mostram a pessoa para ela mesma.
- **A criança só lê "a liderança foi avisada" quando isso é verdade**: o pedido de ajuda sem login devolve só
  um sim/não (`avisada`, nunca a contagem) e o texto muda — se ninguém pôde ser avisado (sem destinatário, regra
  desligada, e-mail fora), ela lê para **ligar agora para o 100 ou o 190**. O 100 e o 190 aparecem nas duas versões.
- **A tela revisada por quem não a construiu** (revisão adversarial independente: 5 achados médios e 12 baixos, nenhum
  crítico; vazamento do relato, XSS e CSP estavam sãos). O que mudou: os dados do caso saem da tela ao sair da aba
  (respostas atrasadas não repovoam a fila nem religam o relógio); na tela da criança, um novo toque em "Enviar" não
  apaga a confirmação com o número do pedido e o texto digitado durante o envio não se perde; o registro **repetido**
  de uma suspeita mostra o prazo de 24 horas, o "não faça" e o 100/190 (o servidor devolve se exige comunicação); a
  ficha de uma suspeita aberta traz o "não faça" para quem comunica; "Vincular" some quando a pessoa do cadastro já está
  vinculada; o formulário da comunicação usa o relógio do **servidor**; o modal de anexos fecha ao trocar de login;
  "pedido sem conteúdo de proteção" é sempre a **última** opção de encerramento (nunca a primeira nem a escolhida de
  partida); foco de teclado nos formulários, impressão do relatório sem página em branco e sem o relato; as chamadas
  entre arquivos da tela não derrubam a navegação nem o logout se o módulo faltar na casca; o texto do aviso de
  "Comitê incompleto" e o da aba dizem o mesmo (o Comitê se cadastra pelo papel "Comitê de Proteção", em Permissões).
- **O Dirigente comunica, o Comitê encerra**: registrar a comunicação, o adendo e a reclassificação são da
  gestão (inclusive o Dirigente da congregação, que é quem está perto e tem as 24 horas); decidir o afastamento
  e encerrar o caso são do nível geral.
- **A proteção cobre as escalas e os canais**; a sala de aula da EBD e outras funções com criança que não
  passam pelas escalas continuam fora do portão do sistema (como já era na v7.7): o afastamento ali é
  decisão da Diretoria sobre o cadastro do professor. *(A turma da EBD ganhou o portão na Trava 7-B. Resolvido na
  Trava 7-C, por decisão de 23/10/2026: **departamentos e liderança** — eventos ficaram fora. Quem ocupa departamento ou
  cargo marcado "com crianças" e não está apto aparece para a Diretoria e a Proteção do nível geral, sem sair do cargo.)*

### O que NÃO é desta versão (e por quê)

A **escuta da criança em si** (depoimento especial, Lei 13.431 arts. 7º a 12) é das autoridades — a Igreja
não faz e o sistema não oferece. Notificação **automática** ao Conselho Tutelar por integração também não
existe: cada cidade tem um canal (ofício, telefone, sistema próprio) e o dever é do dirigente; o sistema
**cobra e prova** (o relógio, o protocolo, o comprovante), não protocola por ele.

## v7.9 — Movida para a v8.1 (fase 8), na íntegra

Por decisão do responsável (15/10/2026), esta versão **não é construída na fase 7**: o texto completo (os três itens, a nota sobre as sessões da CLI
integradas com a AFM e a taxonomia de justificativas) foi copiado **sem alterações** para a [v8.1 da fase 8](fase-8-ministerial-afm.md), que passa a ser
uma versão grande: o módulo da AFM **e** a contagem de faltas da CLI (Art. 27), construídos juntos. A próxima versão a construir na fase 7 é a **v7.10**.

## v7.10 — Check-in infantil com cadeia de custódia *(7ª rodada)*

Peça operacional que sustenta na prática a v7.7: sem controle de entrega e
retirada, a política de proteção é só documento.

- [x] Check-in por família com **etiqueta de segurança**: código aleatório por
      criança, impresso na etiqueta e no recibo do responsável, **obrigatório na
      retirada** — quem não tem o código não retira, ainda que seja conhecido.
      *(Só o HMAC do código é guardado; 5 erros travam a criança, com a tentativa reservada no banco antes de
      conferir; segunda via com dois adultos.)*
- [x] Lista de **pessoas autorizadas a retirar** por criança e alerta de retirada divergente. *(Texto emendado:
      a custódia se apoia no cadastro de responsáveis da Secretaria, `VoluntariadoResponsaveis`, e não no vínculo
      familiar de autoatendimento — ver o contrato. A divergente só sai com o código e a aprovação da liderança.)*
- [x] Alergia/condição de saúde impressa na etiqueta (com o consentimento da
      v7.7) e contagem de lotação por sala em tempo real — a proporção
      adulto/criança deixa de ser estimativa.
- [x] Registro de horário e de **quem entregou e quem retirou** — é a prova
      auditável que protege a igreja e a família. *(Histórico só de acréscimo, com gatilho no banco; 5 anos.)*
- [x] Bloqueio de voluntário sem habilitação vigente (v7.7) na sala, no ato do
      check-in. *(Planning Center Check-Ins; FellowshipOne; ChurchSuite)* *(A aptidão é reavaliada a cada ato; e,
      desde a Trava 7-B, quem perde a aptidão com a sala aberta tem a presença encerrada e a liderança é avisada.)*
- [x] **Integração com o Portal do Membro (vB.5)**: "meus filhos" no autoatendimento é o responsável cadastrado
      consultando o histórico de check-in/check-out dos próprios filhos pelo celular — nunca fazendo o check-in ele
      mesmo (isso continua sendo ação de voluntário na sala, com a etiqueta física). Sub-aba nova em "Meu Painel".
- [x] **Portão da EBD** (o "próximo degrau" que a v7.8 deixou registrado): a turma da EBD marcada como
      "com menores" só aceita professor **apto** (a aptidão da v7.7) e perde, na rotina diária, o professor que
      deixou de ser apto. *(Desde a Trava 7-B, o professor da turma marcada também precisa ser adulto e apto a
      cada ato, e entra no painel e nos avisos de renovação.)*

  **Prova (20/10/2026).** Servidor: jest do `api` inteiro verde; no SQL Server de verdade (LocalDB, handlers
  reais) e2e-18 (setup e garantias da 145) 241, e2e-19 (fluxos) 413, e2e-20 (segurança) 246, e2e-21 (corridas
  com vários processos) 49 e e2e-22 (revisão) 189 verificações, 0 falhas. Tela: `tools/front-checkin` 1.488
  verificações, 0 falhas, e a prova de mutação completa (648 mutações; ver a Trava 7-B). Entrega: migração 145
  (`sql/migrations/145_checkin_infantil.sql`), `shared/checkinInfantil.js` (a regra, pura),
  `shared/checkinInfantilDb.js`, a Function `GestaoCheckinInfantil` (`/api/checkin-infantil/<ação>`), o módulo
  `app/modulos/checkin-infantil.js` (aba Check-in infantil e sub-aba de Meu Painel), a marca "com menores" da
  turma da EBD e a rota `POST /api/ebd-turmas/turmas/menores`.

### Contrato da v7.10 (decisões tomadas antes de construir)

Escrito em 15/10/2026, depois de ler o que a v7.7 e a v7.8 deixaram prontos. Cada linha é uma decisão que a lei e o
Regimento não fecham; a CLI pode revertê-la. Nada disto está construído ainda: os itens acima só viram `[x]` com a
prova (jest, banco real, tela, homologação).

**A sala e quem opera.** A *sala* do check-in é a mesma da v7.7: o par **(serviço da escala, equipe marcada "contato
com menores")**, com a faixa etária que a equipe já tem. Opera a sala quem está **escalado** nela (aceito ou
confirmado) naquele serviço e **apto hoje**, e a aptidão é reavaliada a **cada ato** (não só ao entrar); também opera o
líder da equipe, se for apto. A sessão pode ser a de PIN (voluntário comum não tem senha administrativa): o que protege a
criança é o código e a conferência do servidor, não o tipo de login. Atos de **gestão** (aprovar retirada divergente, ver
o relatório do dia, cadastrar autorizados e saúde a partir de ficha) exigem sessão de **liderança** com a permissão
`habilitacao_voluntarios` no escopo da congregação. A janela do check-in é do serviço: de **60 minutos antes** até **5
horas depois** do horário (ajustáveis em Prazos); fora dela a sala não abre.

**A criança.** É **membro** (menor de 18 anos cadastrado) ou **visitante** (nome, data de nascimento e quem a trouxe, só
para esta visita). Visitante não ganha cadastro de membro (mesmo princípio da chamada da EBD). A idade fora da faixa da
sala **avisa**, não impede. Uma família faz o check-in de até 6 crianças de uma vez.

**Quem é o responsável: o cadastro da Secretaria, não o vínculo familiar.** O plano original dizia "reaproveita
`VinculosFamiliares` e `ResponsavelLegal`", mas a v7.7 criou o cadastro de responsáveis (`VoluntariadoResponsaveis`:
pai, mãe, tutor, com o documento conferido pela Secretaria) e é nele que o consentimento já se apoia. O vínculo familiar
é de **autoatendimento** (qualquer membro pode declarar parentesco), então **não vale para custódia**: quem se diz
"responsável legal" sozinho não vê histórico nem retira criança. Criança membro sem responsável cadastrado faz o
check-in como **membro**, com a pessoa que traz registrada na hora (nome, parentesco e documento conferido) e o selo
"Sem responsável cadastrado" na tela, que sugere à Secretaria o cadastro *(texto emendado em 19/10/2026: o plano
dizia "como visitante"; a construção ficou assim para a criança não perder o vínculo com a lista de autorizados e o
histórico que o responsável vai ter depois do cadastro)*.

**O código.** Um **código aleatório por criança, por visita**: 6 caracteres sem os parecidos (sem 0/O, 1/I/L), gerado no
servidor, impresso na **etiqueta da criança** e no **recibo do responsável**. O servidor guarda só o **HMAC** do código
(com segredo do servidor, atado ao registro); o texto do código **nunca** é gravado, registrado em log nem enviado à
auditoria, e só sai uma vez, na resposta do check-in. A retirada é por criança: o voluntário escolhe a criança na tela e
digita o código; **5 erros** travam aquela criança (só a gestão destrava, ou a segunda via). Sem código não se retira,
**ainda que a pessoa seja conhecida** (é a regra do plano). Perdeu a etiqueta e o recibo? **Segunda via**: um voluntário
confere o documento de quem pede (precisa estar entre os autorizados) e **outro adulto presente na sala confirma** em até
10 minutos (dois olhares); o código antigo morre e o ato fica no histórico.

**Quem pode retirar.** Os **responsáveis cadastrados** da criança (sempre), **mais** a lista de autorizados que o
responsável faz (nome, parentesco, até 8 por criança, com validade opcional, revogável) e quem **trouxe** a criança nesta
visita (mais até 3 nomes que o responsável indicar no check-in). Retirada por quem **não está nessa lista** é
**divergente**: precisa do código **e** da aprovação de um gestor (sessão de liderança), que vê o motivo e o telefone do
responsável para confirmar; o sistema **avisa os responsáveis** na hora (aviso obrigatório) e o líder; sem aprovação a
criança **não sai**. Quem não tem código e não está na lista não retira criança nenhuma: chama-se o responsável.

**Lotação em tempo real e as regras da v7.7 valendo na porta.** Adultos da sala = voluntários que **entraram** (registro
de entrada e de saída), **maiores de 18 anos e aptos agora**; o adolescente serve como auxiliar e não conta. O check-in é
**recusado** se há menos de 2 adultos presentes, se a criança a mais passaria da proporção da faixa (o mesmo padrão
ajustável da v7.7) ou se a equipe não tem faixa; o voluntário **não pode sair** se deixaria menos de 2 adultos com
criança na sala; a sala só **encerra** com a sala vazia. A tela da sala atualiza sozinha a cada poucos segundos.

**Saúde (alergia e condição).** O dado é **do responsável**: ele (Meu Painel) ou a Secretaria (ficha assinada) o grava, e
**só se há consentimento vigente** de saúde da v7.7. Sai na etiqueta (⚠) só com esse consentimento; **revogar o
consentimento apaga o dado** (e as cópias nos registros de check-in) na mesma operação, e a rotina diária apaga o de quem
perdeu o consentimento por outro motivo (responsável desativado, criança fez 18 anos). Para o **visitante** não há
consentimento guardado: o responsável presente informa e concorda no balcão (texto e versão registrados), e o dado vale
só para aquela visita.

**Registro e prova.** Cada ato (check-in, entrada e saída de voluntário, erro de código, retirada, divergência pedida,
aprovada ou negada, segunda via, encerramento) é uma linha de **histórico só de acréscimo** (gatilho no banco impede
alterar ou apagar), com quem fez, o horário do **servidor** e o código do ato. A auditoria geral do sistema recebe só
ids e códigos: nunca nome de criança, código de retirada, saúde nem texto livre. O responsável vê, em Meu Painel, **só o
histórico das próprias crianças** (data, sala, quem trouxe, quem retirou, horários), nunca de outras, nunca o nome do
voluntário, nunca o código.

**Guarda e LGPD (art. 14).** Os registros de custódia ficam **5 anos** (política de retenção própria, ajustável); o
telefone de quem trouxe um visitante é apagado em **90 dias** e o dado de saúde do visitante, junto com o registro, no
mesmo prazo; depois do prazo geral o registro é anonimizado, não apagado (a contagem de presença sobrevive). ROPA e RIPD
ganham a atividade "Check-in infantil" (criança, saúde e custódia são dado sensível de menor).

**Avisos.** Obrigatórios (o destinatário não desliga): *retirada divergente* (responsáveis, líder e gestão da
congregação), *criança sem retirada registrada* (a rotina diária da manhã seguinte avisa a gestão se alguma criança
ficou "na sala" depois do fim do serviço), *segunda via emitida* (responsáveis) e, desde 20/10/2026, *criança entregue
ou retirada por um terceiro* (responsáveis cadastrados; ver as emendas abaixo).

**Portão da EBD.** A turma ganha a marca "com menores" (começa **desmarcada**, para nada mudar de uma hora para outra) e
o nome que parece infantil ("Crianças", "Juniores"...) gera o mesmo alerta que a equipe sem marca já gera. Com a marca,
**cadastrar** professor exige aptidão, e a rotina diária tira da turma o professor que deixou de ser apto (e avisa o
líder e a gestão), como já faz com as escalas.

**Fora desta versão (por decisão):** QR no celular do responsável, impressora térmica com integração direta (imprime-se
pelo navegador, em etiqueta ou papel comum) e modo sem internet — o código em papel já é a prova que a retirada exige.

### Emendas ao contrato (19/10/2026) — depois da revisão adversarial independente

Duas revisões independentes (uma só da tela, outra só do servidor; leitura do código e reproduções) acharam **22 e 32
problemas, nenhum crítico**. O que o código resolve foi corrigido, cada correção com teste que falha no código antigo.
O que o contrato precisou mudar:

- **Encerramento da sala (antes só prometido).** A sala **não é mais "só encerra com a sala vazia"** quando alguém
  esquece de registrar a retirada de uma criança: sem saída, o registro ficava "na sala" para sempre (a janela
  fecha, ninguém reentra, o código antigo se perdeu e o check-in da semana seguinte era recusado). Agora a
  **liderança** (`habilitacao_voluntarios` no escopo, confirmação reforçada) dá a **baixa administrativa** pela ação
  `encerrar-sala`: só vale com a janela do serviço fechada (ou o serviço não publicado, ou sem criança), exige um
  **motivo** de 5 a 300 caracteres, baixa em lote as crianças que ficaram (situação `RETIRADA`, tipo `BAIXA_ADM`, sem
  código e sem retirante; quem deu a baixa e o motivo ficam gravados), cancela a segunda via pendente, faz sair os
  voluntários presentes e registra eventos imutáveis (`BAIXA_ADMINISTRATIVA` por criança e `SALA_ENCERRADA`). Repetir
  não faz nada. A lista de salas da liderança mostra também as de **dias anteriores** que ainda têm criança sem
  retirada, marcadas "Dia anterior". O aviso diário "criança sem retirada" manda a liderança para esse botão.
- **Autorizados dependem de responsável ativo.** A pessoa que o responsável autorizou só vale enquanto **quem a
  cadastrou continuar sendo responsável ativo** da criança; as que a Secretaria registrou por **ficha assinada** valem
  até serem revogadas ou vencerem. Ao revogar um responsável, as autorizações dele são revogadas de vez e a gestão
  recebe um aviso obrigatório (sem nome de criança).
- **O relatório do dia é ato de gestão** (já estava no contrato; o servidor o entregava também ao voluntário da
  sala — corrigido: 403 para quem opera, 404 fora do escopo).
- **O voluntário não vê a aptidão dos colegas.** A tela da sala mostra só quem **conta na proporção**; o motivo de
  alguém não estar apto (incidente em apuração, cadastro nacional, autodenúncia) continua reservado, como na v7.7 e
  na v7.8, e a gestão só vê o que a v7.7 já mostrava a ela.
- **Retirada divergente** ganha um campo **opcional de motivo** (até 300 caracteres) que o gestor vê no cartão; o
  motivo da **decisão** da gestão fica em outro campo.
- **Aviso obrigatório que não consegue sair não cala.** Se ninguém pôde ser avisado (regra inativa, lista vazia,
  erro), o ato vale e a resposta ao voluntário diz que **ninguém foi avisado e é preciso ligar para a liderança**;
  nenhum erro de aviso derruba um ato já gravado (a segunda via perdia o código novo quando isso acontecia).
- **Segunda via:** o segundo adulto passa a ver **quem pede e o documento conferido** (antes só "confirme"); a
  etiqueta nova mostra a hora de **entrada original** e "2ª via emitida às …".
- **Etiquetas e recibos:** cada entrada é um lote; só os lotes **ainda não impressos** vão ao papel (os códigos de
  uma família nunca saem no papel da seguinte) e depois de imprimir a tela pergunta **se saíram na impressora**
  (cancelar o diálogo não conta como impresso; a classe de impressão fica até a resposta, para o celular que
  desenha a prévia depois).
- **Consentimento de saúde do visitante:** quando o texto de autorização muda, a tela **redesenha o texto novo**
  antes de o responsável poder concordar de novo (antes o "concordo" ia sobre um texto que ele não leu).
- **LGPD (retenção):** além do registro, ficam anonimizados o motivo da divergência, o motivo da baixa, o nome e a
  matrícula da pessoa da segunda via e as **autorizações revogadas ou vencidas há mais de 5 anos**. Registro ainda
  aberto não se anonimiza (sai pela baixa administrativa). O responsável deixa de ver o histórico de quem já fez 18
  anos. A busca de criança ignora acento.
- **Desempenho:** prazos e parâmetros de proporção ficam em cache de 15 segundos por processo (a sala consultava a
  configuração ~30 vezes a cada 8 segundos no banco de 5 DTU); nenhum dado de custódia entra em cache. A tela dá
  tempo-limite de 20 segundos a cada pedido e avisa quando os dados da sala estão velhos.
- **Sem solução nesta versão (registrado):** gravar a revogação do consentimento e apagar a saúde na **mesma**
  transação (a leitura confere a vigência na hora e a rotina diária apaga: prova no e2e-21); o detector de
  "divergência pendente há muito tempo"; fechar `TRUNCATE`/`DISABLE TRIGGER` nas tabelas do check-in (só se resolve
  tirando essa permissão do usuário do banco: decisão de operação); a cadeia de hash da auditoria geral que pode
  bifurcar com gravações simultâneas (anterior a esta versão e do sistema todo); busca de criança por GET leva
  pedaço do nome no endereço (o Application Insights o registra). *(Atualizado na Trava 7-C: o detector da
  divergência parada, a busca por POST e a cadeia de hash da auditoria foram **resolvidos na Trava 7-B**. Seguem
  registrados a revogação na mesma transação e o usuário de banco sem `TRUNCATE`/`DISABLE TRIGGER`, avaliados na 7-C.)*
- **Aviso ao responsável quando um terceiro traz ou retira a criança (decidido pela liderança em 20/10/2026).** Quem
  trouxe a criança sem ser responsável cadastrado (nome digitado no balcão) ganha direito de retirar só com o código;
  agora os **responsáveis cadastrados** recebem, na hora, um aviso obrigatório em dois momentos: na **entrega**
  (`CHECKIN_TERCEIRO_ENTREGA`) e na **retirada** feita por esse terceiro ou pelo indicado só para a visita por ele
  (`CHECKIN_TERCEIRO_RETIRADA`). O texto nomeia o terceiro e o **primeiro** nome da criança (nunca documento, telefone
  nem saúde); irmãos com os mesmos responsáveis recebem um aviso só. Não avisa quando quem trouxe é responsável
  cadastrado, nem quando quem retira é da lista fixa (feita por um responsável ou com a ficha); criança visitante e
  criança sem responsável cadastrado não têm a quem avisar (sem alarme). A retirada de quem **não está na lista**
  continua com o aviso próprio (divergente). Se o aviso não sair, o ato vale (já está gravado) e a resposta ao voluntário
  traz `semAviso` e manda ligar para a família.
- **Decidido NÃO fazer (responsável da Igreja, 21/10/2026):** a retirada comum com **dois olhares** (o código da
  etiqueta já protege e a fila do fim do culto ficaria lenta) e deixar o voluntário **reentrar na sala depois da
  janela** só para retirar (a sala já aceita retirada até 5 horas depois; passou disso, a baixa administrativa).

## 🔒 Trava de Revisão 7-B — antes de avançar para a v7.11

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3).
Audita v7.7 a v7.10 pelas 5 perguntas do checklist — **atenção máxima**: a
v7.7 (habilitação para ministério com menores, Lei 14.811/2024) e a v7.8
(notificação obrigatória de suspeita de maus-tratos, ECA Arts. 13 e 70-B)
tratam de obrigação legal já vigente, com responsabilização pela omissão, e de dado de
criança. Um bug de tela aqui não é só inconveniente — pode significar
voluntário sem antecedente verificado atuando com menor, ou suspeita não
notificada. Testar cada fluxo manualmente, não só confiar no "parece certo".

- [x] **Fechada em 20/10/2026** — auditoria de v7.7, v7.8 e v7.10 (a v7.9 foi para a v8.1). Duas revisões
  independentes, só de leitura: uma das costuras ENTRE as versões (quem não está apto chega à criança por algum
  caminho?) e outra da lei, do plano e do README. **Nenhum achado crítico; 2 altos, 14 médios e 11 baixos, todos
  corrigidos com teste que falha no código de antes** (migrações 146 e 147; os textos da 145 ajustados antes de ela
  ir para a produção). O que mudou:
  - **Aviso que só foi para o sino não conta (alto).** O aviso obrigatório contava como entregue ao entrar no sino
    do app, que a mãe pode nunca abrir. Agora só conta quem foi alcançado **fora do app** (e-mail aceito ou push);
    sem isso, a resposta ao voluntário ou à liderança manda ligar. Push ligado nas regras do check-in; o reenvio do
    e-mail que falhou vale também para as regras obrigatórias do check-in, de menores e da EBD.
  - **Liderança afastada fora do check-in (alto).** Quem tem pendência reservada à Diretoria (afastamento cautelar
    da v7.8, comunicação em análise, cadastro nacional, restrição, fora de comunhão) não vê a sala nem age como
    gestão. Incluir autorizado "por ficha" pede a confirmação reforçada, e **toda** inclusão avisa os responsáveis.
  - **Quem perde a aptidão com a sala aberta sai da sala.** A presença é encerrada e o líder e a gestão recebem o
    aviso obrigatório "uma pessoa da equipe precisa sair da sala agora", dizendo se a sala ficou abaixo dos dois
    adultos. O portão da EBD confere, a cada ato, que o professor da turma marcada é adulto e apto; esse professor
    entra no painel e nos avisos de renovação.
  - **Proteção.** O texto da lei foi corrigido: comunicar ao Conselho Tutelar **imediatamente** (ECA arts. 13 e
    70-B; Lei 14.344/2022, arts. 23 e 26); 24 horas é o prazo máximo interno. O caso fica só com a Diretoria e o
    Comitê quando quem registra marca que a pessoa envolvida é da liderança local, ou quando algum envolvido não
    tem matrícula: o Dirigente apontado só pelo nome não recebe nem lê o próprio caso. A retirada das escalas que
    falha depois de um afastamento aparece como alerta.
  - **LGPD.** A exclusão do titular apaga a saúde da criança e as cópias, e revoga os consentimentos e as
    autorizações de retirada, na mesma transação; o registro de custódia fica pelos 5 anos. A saúde copiada do
    cadastro só aparece na sala e na segunda via com o consentimento vigente. A saúde do visitante só vai na
    etiqueta com a concordância do pai, da mãe ou do tutor(a). A busca de criança vai por POST, para o nome não
    ficar no endereço.
  - **Outros.** Lembrete único à liderança da divergência parada há 20 minutos; a baixa administrativa avisa o
    responsável; o aviso "sem retirada" olha 90 dias e cai na gestão geral; a criança membro registrada como
    visitante é recusada; a trilha de auditoria lê o topo da cadeia com trava (a cadeia não bifurca mais com
    gravações simultâneas).

  As 5 perguntas:
  1. *Código novo roda de ponta a ponta no ambiente real?* **Sim.** Banco SQL Server de verdade, recriado do zero
     com todas as migrações (até a 147) e os handlers reais. As 19 baterias passaram com 0 falhas:
     - v7.6: e2e-2 a 6 (117, 307, 136, 120 e 19 verificações);
     - v7.7: e2e-8 a 12 (187, 221, 24, 107 e 43);
     - v7.8: e2e-14 a 17 (146, 163, 20 e 51);
     - v7.10: e2e-18 a 22 (241, 413, 246, 49 e 189).

     Na homologação, a migração e a varredura de rotas passaram (corrida 39461418301).
  2. *Toda tela abre e mostra dado de verdade?* **Sim.** Na homologação:
     - teste de tela completo: 1.052 ações iguais no computador e 142 no celular, 0 divergência e 0 violação de CSP
       (corrida 39461406618);
     - prova em navegador de verdade, com login e a API real respondendo 200: check-in no Meu Painel (39462933544)
       e na aba da liderança (39463828848), proteção (39463333614) e ministério com menores (39463549945).

     Provas da tela: `tools/front-checkin` (1.488 verificações e a prova de mutação com 648 mutações),
     `tools/front-protecao` (808) e `tools/front-menores` (322).
  3. *README e código narram a mesma coisa?* **Sim.** O README perdeu a lista velha de tabelas que "ainda não
     existem" (EBD, eventos e proteção já existem) e ganhou a v7.10 e as migrações 146 e 147. ROPA e RIPD descrevem
     com exatidão o prazo imediato, a revogação da saúde e a exclusão LGPD. Os itens da v7.10 foram reescritos (a
     custódia usa o cadastro de responsáveis da Secretaria, não o vínculo familiar).
  4. *O que ficou para trás foi corrigido, não só anotado?* **Sim, o que o código resolve.** A revogação da saúde
     não é a mesma transação, mas a leitura não mostra o dado e a rotina diária o apaga. O detector de divergência
     parada e a busca por POST foram feitos, e a cadeia da auditoria foi corrigida. **Decidido NÃO fazer** (o
     responsável da Igreja, 21/10/2026: "deixa como está"; saem dos planos):
     - dois olhares na retirada comum;
     - deixar o voluntário reentrar na sala depois da janela só para retirar;
     - tratar como divergente a retirada por quem está com afastamento cautelar (o afastamento é cautela, não
       decisão de juiz: a Igreja não impede um pai de buscar o filho; se for o caso, o Comitê conversa com a família);
     - exigir o membro que não é do clero nas decisões do Comitê;
     - devolver o caso ao Dirigente depois de vincular a matrícula do envolvido (fica com a Diretoria e o Comitê).

     **Ação humana (não é código):** marcar as turmas da EBD "com menores" e cadastrar o Comitê de Proteção.

     A lista de responsáveis de uma criança continua visível ao voluntário apto da sala: é como ele escolhe quem
     trouxe.
  5. *Deploy real aconteceu?* **Sim.** Merge `e5acfdc` na `main` em 20/10/2026 (reverter: `git revert -m 1 e5acfdc`).
     A produção aplicou as migrações 145, 146 e 147 e passou na varredura de rotas (corrida 39482372783). O teste de
     tela da produção deu 1.052 ações iguais no computador e 142 no celular, sem divergência e sem violação de CSP
     (corrida 39482372666). As rotas novas respondem 401 sem login (`/api/checkin-infantil/*` e
     `ebd-turmas/turmas/menores`) e a casca do aplicativo está na v34. Fechada esta trava, a FASE 7 segue para a v7.11.

## v7.11 — Cuidado pastoral: filas com responsável, prazo e sigilo *(7ª rodada)*

Hoje o sistema registra o que **aconteceu** (disciplina, abandono, carta). Não
registra o que alguém **precisa fazer por alguém** — e é justamente aí que as
pessoas se perdem sem que ninguém perceba a tempo.

- [x] **Fila de acompanhamento com dono e SLA**: visitante, novo convertido,
      membro afastado, pedido de visita, pedido de oração, pós-internação.
      Cada item tem responsável nomeado e prazo; vencido, escala pela hierarquia
      territorial que já existe (Dirigente → Pastor de Área → Região).
      *(Rock RMS Connections; MinistryPlatform Care Cases; CCB process queues)*
      *(Os seis tipos, com prazo ajustável em Catálogos — o visitante em **48 horas**, a Busca Ativa do Regimento Art. 128 §5º. O item nasce com o
      Dirigente como responsável (ou no degrau de cima, se não há Dirigente ou se é ele a pessoa acompanhada); a liderança troca o responsável,
      que pode ser qualquer membro adulto da congregação e o trabalha pelo Meu Painel, mesmo por PIN. Vencido, sobe Congregação → Área
      (Pastor de Área) → Região (papel novo **Superintendente Regional**) → nível geral, pulando o degrau sem ninguém; quem estava embaixo continua
      trabalhando. Toda visita registra quem foi junto (Art. 85 §3º, "nunca a sós"). Quem muda de congregação some da antiga na hora e o item
      passa para a nova na rotina das 7h.)*
- [x] **Detecção de afastamento por desvio do próprio padrão** — não regra fixa
      global ("faltou 3 cultos"), e sim comparação com o histórico **daquela
      pessoa**: quem vinha 4x por mês e caiu para 1 é sinal; quem sempre veio 1x
      não é. Abre item na fila antes de virar caso de abandono (v1.5).
      *(CDM+ Missing Analysis)*
      *(A taxa de presença dos ~6 meses de base contra a das últimas 6 semanas, com o que o sistema registra: a chamada da EBD (com o "ausente") e
      as reuniões encerradas — o sistema não tem presença no culto por pessoa, e a tela diz isso. Sinal quando havia costume (50% ou mais) e a
      queda é de 60% ou mais; no máximo 5 por congregação por dia; o item diz o porquê em números e nunca abre abandono sozinho.)*
- [x] **Notas pastorais com nível de confidencialidade** (pública / liderança
      local / somente pastor), log de acesso auditável e **versão anonimizada
      automática** para boletim de oração ("um irmão da congregação X"). Dado de
      saúde e aconselhamento é dado sensível — vazamento aqui destrói confiança e
      gera passivo. *(CareNote; Notebird; TouchPoint)*
      *(Equipe / Liderança local / Somente pastor (só quem tem o cargo de Pastor no cadastro; abrir pede a confirmação reforçada). A nota não se
      edita e a correção nunca abre o sigilo; o texto só sai ao abrir e cada abertura fica registrada; a pessoa nunca vê as notas sobre ela (em Meus
      Dados, só quantas). Saem 30 dias depois do desligamento (Art. 132 §2º, II) e na exclusão LGPD. O boletim leva uma linha **gerada pelo
      assunto e pela congregação** ("Alguém da Congregação Vila Nova pede oração pela saúde."), nunca o texto, e recusa nome e diagnóstico.)*
- [x] Pedidos de oração com moderação antes de publicar e **sinalização de risco**
      (menção a autolesão/violência) escalando imediatamente para o pastor, fora
      da fila normal.
      *(Nada vai ao boletim sem moderação. Com sinal de risco, o pedido sai da moderação comum, vira acompanhamento urgente de 24 horas e o aviso
      obrigatório (e-mail e celular) vai na hora a toda a liderança do território — ou só ao nível geral, se o texto cita a liderança; quem pediu
      lê o 188, o 190, o 180 e o 100, e só lê "a liderança foi avisada" se o aviso saiu de fato. O pedido de socorro nunca é recusado pelo limite
      do dia nem por já haver outro pedido aberto; desmarcar um alarme falso é da Área para cima, com motivo e confirmação reforçada.)*

### Contrato da v7.11 (decisões tomadas antes de construir)

Escrito em 21/10/2026, depois de ler o que o sistema já tem. Cada linha é uma decisão que o Regimento não fecha; a CLI
pode revertê-la. Os itens acima só viram `[x]` com a prova (jest, banco real, tela, homologação).

**O que o sistema já sabe (e o que não sabe).** Não existe tabela de visitante, de pedido de visita, de pedido de oração
nem de nota pastoral; o que existe é o **abandono** (v1.5), que é manual (alguém marca "sem comunhão" e a data). E o
sistema **não registra presença nos cultos** por pessoa: a única frequência semanal por pessoa é a **chamada da EBD**
(com o "ausente" gravado) e, mais espaçada, a das **reuniões** encerradas (assembleia, CLI, órgãos locais). A detecção de
afastamento usa só isso, e a tela diz isso com todas as letras: quem não está numa turma da EBD nem num órgão **não é
medido** (o detector não inventa falta de quem ele não vê). O motor de Fluxos (vB.3) tem a escada
Congregação → Área → Região, mas não tem dono nomeado nem sigilo: a fila tem a sua própria tabela e reaproveita só a ideia.

**Quem trabalha a fila.** Permissão nova `cuidado_pastoral` (sessão de liderança), dada ao Presidente, ao Secretário Geral,
ao Dirigente de Congregação e ao Pastor de Área, e papel novo **Superintendente Regional** (nível Região; Regimento: "a
presidência regional é exercida pelo Superintendente Regional"). Cada um vê a fila **do seu território** (o Dirigente, a
congregação; o Pastor de Área, as congregações da área; o Superintendente, as da região; o nível geral, tudo). O
**responsável nomeado** pode ser qualquer membro ativo e maior de idade da congregação (um diácono, um presbítero, uma irmã
do círculo de oração) ou alguém da liderança que alcança a congregação; ele vê **só os itens dele**, em Meu Painel, mesmo
entrando por PIN, com o nome e o contato da pessoa, o motivo e o histórico — nunca as notas restritas.

**A pessoa acompanhada nunca vê o item nem as notas sobre ela**, mesmo que seja da liderança (o Dirigente que caiu na
detecção não vê o próprio item: quem vê é a Área para cima). Ela vê, em Meu Painel, **só os pedidos que ela mesma fez**
(visita, oração), com a situação.

**Os tipos e os prazos (ajustáveis em Catálogos → Prazos).** Visitante: **48 horas** (Regimento Art. 128 §5º, II, b: "Busca
Ativa em até 48 horas"); novo convertido: 7 dias; membro afastado: 14 dias; pedido de visita: 7 dias; pedido de oração com
pedido de contato: 3 dias; pós-internação: 3 dias. O item nasce com o **Dirigente** da congregação como responsável (se o
Dirigente não for a própria pessoa acompanhada); a liderança troca o responsável quando quiser, e quem é nomeado recebe o
aviso. Visitante e novo convertido entram pelo nome e o contato (não ganham cadastro de membro, como na chamada da EBD).

**(Trava 7-C) O Superintendente Regional.** O Regimento (Art. 104 §1º) diz que ele é, automaticamente, o Pastor Titular da Área-Polo; o sistema
só o conhece cadastrado na Liderança da Região (papel "Superintendente Regional"). Sem o cadastro, a escada pula a Região: o painel do nível
geral (Cuidado pastoral → Painel) agora lista "região sem Superintendente Regional cadastrado". **Ação humana:** cadastrar o Superintendente de
cada região.

**A escada do prazo vencido.** A rotina diária das 7h (a mesma das outras; o banco não fica ligado à toa) olha os itens
abertos com o prazo vencido e **sobe um degrau**: Congregação → Área → Região → nível geral. O degrau sem ninguém com a
permissão (uma região sem Superintendente cadastrado) é **pulado** — o item nunca fica sem quem receba. Quem está no
degrau novo recebe o aviso e o item ganha um prazo novo de 3 dias; quem estava embaixo **continua vendo e trabalhando** o
item (subir é chamar ajuda, não tirar do Dirigente). No nível geral, vencido de novo, o aviso se repete no máximo 5 vezes.
O prazo é calculado na leitura (a fila mostra "vence em…" / "vencido há…" mesmo sem a rotina). Adiar o prazo é da
liderança, com motivo, até 30 dias, e fica no histórico.

**O trabalho no item.** Registrar contato (ligação, mensagem, visita no lar, visita no hospital, conversa no culto, outro;
se conseguiu falar; observação curta), concluir com um desfecho (integrado, segue acompanhado pela liderança, não
localizado, não quis contato, encaminhado, outro) e cancelar (duplicado ou engano, com motivo). **Toda visita presencial
registra quem foi junto**: o Regimento (Art. 85 §3º, I) proíbe o obreiro a sós com uma mulher que não é a esposa, e o
cadastro não guarda o sexo — a regra vale para toda visita. O histórico é **só de acréscimo** (gatilho no banco).
Concluir um "membro afastado" como "não localizado" ou "não quis contato" mostra o caminho do abandono (v1.5), que segue
manual: a fila **não** abre procedimento de abandono sozinha.

**A detecção de afastamento (pelo padrão da própria pessoa).** Para cada membro ativo, a rotina junta as oportunidades
que o sistema conhece (aula da EBD da turma dele, com presença ou ausência; reunião encerrada em que ele era esperado) e
compara a **taxa de presença** de dois períodos: os ~6 meses de base e as **últimas 6 semanas**. Vira sinal quando a base
tem pelo menos 6 oportunidades com presença de **50% ou mais** (havia costume), as 6 semanas têm pelo menos 3
oportunidades e a taxa caiu **60% ou mais** (ex.: quem vinha 9 de 10 domingos e veio 1 de 6). Quem sempre veio pouco (1
domingo por mês = 25%) nunca é sinal. Fica de fora quem já está "sem comunhão", com abandono aberto, com item de
afastamento aberto ou encerrado há menos de 90 dias. No máximo 5 itens novos por congregação por dia (os de maior queda
primeiro), para a fila não amanhecer entupida. O item diz o porquê em números ("EBD e reuniões: antes 9 de 10; nas
últimas 6 semanas 1 de 6") e nunca vira abandono por conta própria. Os parâmetros (6 semanas, 50%, 60%) ficam em
Catálogos → Prazos.

**Notas pastorais com três níveis.** *Equipe* (a "pública" do plano: a liderança e o responsável de um item aberto da
pessoa), *Liderança local* (só a liderança com a permissão no território, nunca o responsável voluntário) e *Somente
pastor* (só quem escreveu e quem, na liderança que alcança a pessoa, tem o cargo de **Pastor** no cadastro; abrir pede a
confirmação reforçada). A nota é sobre um membro (ou, para o visitante, sobre o item) e **não se edita**: corrige-se com
outra nota que aponta a anterior. A lista mostra só o que a pessoa pode ler (as notas que ela não pode ler não aparecem,
nem a contagem); o texto só sai ao **abrir**, e **cada abertura fica registrada** (quem e quando, nunca o conteúdo); quem
escreveu e o nível geral veem quem leu. Nenhum aviso, auditoria ou log leva o texto. **Regimento Art. 132 §2º, II:** as
anotações pastorais são eliminadas na saída do membro — a rotina diária apaga as notas de quem saiu (carta, abandono,
desligamento) há mais de 30 dias ("regra dos 30 dias") e a exclusão LGPD as apaga na hora. A Diretoria não lê nota de
nível "somente pastor" por ser Diretoria: só se tiver o cargo de Pastor. Em Meus Dados, a própria pessoa vê **quantas**
notas existem sobre ela e de quando, não o texto (o mesmo critério da v7.5 para texto escrito por outros sobre a pessoa;
o texto pode ser pedido ao Encarregado).

**Pedidos de oração, moderação e o boletim.** O membro pede pelo Meu Painel (por ele ou por outra pessoa), escolhe o
assunto (saúde, família, trabalho, luto, vida espiritual, gratidão, outro), escreve o pedido e diz se ele **pode ir ao
boletim sem nome** ou é **só para a liderança**, e se quer que alguém da liderança fale com ele (aí nasce um item da
fila). A liderança também registra o pedido recebido em mãos. **Nada vai ao boletim sem moderação**. O boletim **nunca
leva o texto do pedido**: leva uma linha anonimizada gerada pelo assunto e pela congregação ("Alguém da Congregação Vila
Nova pede oração pela saúde."), que o moderador pode reescrever (até 200 caracteres) — e a reescrita que contém o nome de
quem pediu é recusada. A linha aprovada fica 14 dias no boletim, que a liderança imprime e que o membro vê no Meu Painel
(só as linhas da própria congregação). O mural de oração do **site** é outro lugar (Directus, moderado pela Diretoria); o
confidencial e o com sinal de risco que chegam por ele entram na fila desde a v7.11.1 (abaixo).

**Sinal de risco, fora da fila normal.** Todo texto livre que um membro manda (pedido de oração, pedido de visita) passa
por uma lista de expressões de **autolesão** (ex.: "quero morrer", "me matar", "me cortar") e de **violência** (ex.: "ele
me bate", "abuso", "ameaça de morte", "medida protetiva"); a lista ignora acento e maiúscula e prefere errar para mais. Com
sinal, o pedido **não entra na moderação comum**: vira item **urgente** (prazo de 24 horas) e o aviso obrigatório sai
**na hora** (e-mail e push) para o Dirigente, o Pastor de Área, o Superintendente e o nível geral — o aviso diz só "um
pedido com sinal de risco chegou na congregação X", nunca o texto. Quem pediu lê, na hora, os telefones **188** (CVV, de
graça, 24 h), **190**, **180** (Central de Atendimento à Mulher) e **100**; e só lê "a liderança foi avisada" se o aviso
saiu do app de verdade (a regra da Trava 7-B). Se o texto fala de **criança** junto com violência, o aviso manda registrar
na Proteção de crianças (v7.8). A liderança pode **marcar** risco num pedido que a lista não pegou (mesmo aviso) e
**desmarcar** um alarme falso, com motivo (o pedido volta para a moderação comum); nada disso apaga o registro.

**Avisos.** *Você é o responsável* (na hora, a quem é nomeado por outra pessoa); *resumo do dia* (às 7h, a cada
responsável com item novo, vencendo em 24 horas ou vencido); *subiu de degrau* (às 7h, a quem está no degrau novo);
*pedidos esperando moderação* (às 7h, à liderança da congregação); *sinal de risco* (na hora, obrigatório, não se
desliga). Nenhum leva nota nem texto de pedido; o do responsável leva o **primeiro** nome da pessoa acompanhada (ele precisa
saber quem procurar) e nunca o tipo (ver as emendas).

**Guarda e LGPD.** Os itens encerrados ficam 5 anos e depois perdem a identificação (nome, contato, motivo e observações
do visitante e do membro; a contagem sobrevive); o pedido de oração perde o texto em 1 ano (5 anos se teve sinal de
risco, como prova de que a Igreja agiu); as notas seguem a regra dos 30 dias acima. ROPA e RIPD ganham "Cuidado pastoral"
(a RIPD de "nota pastoral", que estava "N/A — entra quando o módulo existir", passa a valer). A auditoria guarda só ids e
códigos: nunca texto de nota, de pedido, nem a categoria de risco.

**Fora desta versão (por decisão):** lembrete de hora em hora (o prazo mais curto é de 24 horas para o risco, e esse aviso
sai na hora). **Decidido NÃO fazer (responsável da Igreja, 21/10/2026):** registrar a presença de cada pessoa nos cultos — o
trabalho de catalogar quem vai a cada culto não compensa; o detector de afastamento fica com a EBD e as reuniões. **Decidido
fazer (21/10/2026), logo depois desta versão:** ligar o mural de oração do site à fila — o pedido confidencial ou com sinal de
risco que chega pelo site entra no cuidado pastoral (com o aviso na hora, no risco), e quem escreve vê o 188 e o 190 na própria
página.

### Emendas ao contrato (21/10/2026) — depois da revisão adversarial independente do servidor

Uma revisão independente (só leitura do código e reproduções no banco local) achou **2 críticos, 7 altos, 6 médios e 8
baixos**. Tudo foi corrigido, com teste que falha no código de antes (jest e o roteiro `e2e-27` no SQL Server local). O
que o contrato precisou mudar:

- **A lista de risco pegava pouco (crítico).** Só a forma "me bate"; "ele bate em mim", "abusa da minha filha", "eu me
  mato", "não quero viver", "quero sumir", "tomei veneno", "me deu um soco" passavam. A lista foi ampliada (verbos sem o
  pronome, terceira pessoa, abuso de criança, envenenamento) e o teste traz as frases de um lado e de outro.
- **O pedido de socorro nunca é recusado (crítico).** Com sinal de risco, o pedido passa do limite do dia e, se a pessoa
  já tem um pedido de visita aberto, **esse** vira urgente (antes: "você já tem um pedido", e nenhum aviso). O pedido de
  visita com risco também vai para a aba do risco (onde a liderança lê o texto e pode desmarcar o alarme falso).
- **Violência que cita a liderança fica só com o nível geral.** Se o texto fala de violência e cita alguém da igreja (o
  pastor, o dirigente, um obreiro, o professor da EBD) ou o nome de alguém da liderança do território, o caso nasce **no
  nível geral, sem responsável**, o aviso vai só à Diretoria e quem foi citado pelo nome não recebe nada; o Dirigente e a
  Área não veem o pedido nem o item.
- **Desmarcar o risco e cancelar um acompanhamento urgente são da Área para cima** (dois olhares; o Dirigente pode ser o
  citado). O urgente que sobe de degrau continua com 24 horas a cada degrau.
- **Quem muda de congregação some da antiga na hora** (Regimento Art. 132 §1º, II): o item, as notas e os pedidos dele
  deixam de aparecer para a congregação antiga no mesmo instante; na rotina da manhã o item aberto **passa** para a
  congregação nova (o mesmo tipo e urgência, o Dirigente de lá como responsável, com aviso). Antes, a rotina só fechava o
  item, e até lá o Dirigente antigo lia as notas que o novo escrevia.
- **Licença não é saída.** A regra dos 30 dias vale só para quem foi **desligado do rol com data de saída** (carta,
  abandono, desligamento); a licença de candidatura e outras situações não apagam notas nem encerram itens.
- **O responsável voluntário só vê o item aberto**; o encerrado fica em Meu Painel só como lembrança (tipo, primeiro nome,
  desfecho). O contato da pessoa só aparece com o item aberto.
- **O item nunca fica sem quem receba.** Sem Dirigente, ou quando o Dirigente é a própria pessoa acompanhada, o item nasce
  no degrau de cima que tem gente, que é avisado na hora.
- **A fila é territorial de verdade.** O filtro do território vai **no banco**, antes do limite de 400 (antes, numa igreja
  grande a fila do Dirigente podia vir vazia); a concessão de **Extensão** e a de **Departamento** não operam a fila (quem
  cuida da Extensão é o Dirigente da congregação-mãe); o painel não conta o item sobre quem olha.
- **Notas.** A correção nunca rebaixa o sigilo (a de "equipe" não corrige a "somente pastor") e não revela a nota que a
  pessoa não lê; quem escreveu lê a própria nota **enquanto alcança a pessoa**; o nível geral vê **quem** leu qualquer nota
  (sem ler o texto, se não for pastor); a nota sobre quem não é do cadastro sai 1 ano depois que o item encerra.
- **Boletim.** Aprovar só o que espera moderação (o que já foi publicado pode ser **tirado** do boletim, não reescrito);
  a linha recusa também nome de duas letras ("Zé"), nome partido por caractere invisível e diagnóstico ("câncer", "UTI").
  Todo texto livre recusa caractere de controle ou invisível.
- **Meus Dados e Meus pedidos** não mostram o texto do pedido que teve sinal de risco (num celular da família, "meu marido me
  bate" reaparecendo é perigo; o texto sai pelo Encarregado) e contam só os acompanhamentos **já encerrados**.
- **A sonda do cadastro foi fechada:** nomear como responsável alguém de fora do território responde sempre "Pessoa não
  encontrada".
- **Anonimização sem sobra:** some também quem criou o item (o próprio titular, no pedido dele) e quem agiu no histórico.
- **Banco:** a marca de purga das notas é ligada, usada e desligada num **lote só** (com TRY/CATCH: nunca volta ao pool
  ligada); uma rodada de purga por vez (a corrida no banco real dava deadlock); o item aberto é conferido antes de gravar,
  com trava de faixa (não pelo erro do índice único dentro da transação); o vínculo pedido↔item é único só para o item
  aberto; índices novos para a fila, o painel e a detecção no banco de 5 DTU; o lembrete no topo é limitado a 5 no banco.
- **Texto do contrato corrigido:** o aviso "você é o responsável" leva o **primeiro nome** e nunca o tipo (pós-internação
  diria a doença num e-mail); a auditoria tem o código do ato (marcado/desmarcado), nunca o tipo do risco.

### v7.11.1 — o mural de oração do site entra no cuidado pastoral (22/10/2026)

Decidido pelo responsável em 21/10/2026 ("mais compensativo" que a presença no culto, que não se fará).

- [x] **O envio do mural passa pelo servidor do site** (`site/api/EnviarPedidoMural`, `/api/enviar-pedido-mural`): antes o
      navegador gravava direto no Directus. A Function grava o pedido em `mural_oracao` (aguardando moderação, como sempre)
      e avisa o sistema, servidor a servidor, com a chave combinada `CHAVE_SITE_SISTEMA`. Limite de 10 envios por IP em 5
      minutos, campo-isca contra robô, autorização (LGPD) obrigatória, texto até 500 e nome até 80 letras.
- [x] **O sistema confere o sinal de risco** (`/api/cuidado-pastoral-site`, a mesma lista de expressões do cuidado
      pastoral). O pedido comum **nem abre o banco** do sistema (segue só no site). O **confidencial** e o **com risco**
      entram em `PedidosOracao` com origem `SITE`, **sem congregação** (o site não sabe), **só para o nível geral**, nunca
      boletim. Com risco, o aviso obrigatório sai **na hora** ao nível geral (Presidente e Secretário Geral), sem o texto.
      A rota **falha fechada**: sem a chave configurada no sistema ninguém entra (401). O mesmo texto reenviado em 10
      minutos é o mesmo pedido; teto de 30 pedidos por hora (60 com risco) contra inundação.
- [x] **Com risco, o pedido nunca vai ao mural público:** o site o marca como confidencial no Directus (a moderação não
      tem "Aprovar" para confidencial), e quem escreveu vê na hora, em destaque, o **190** e o **188** (CVV). O 188 e o
      190 aparecem também, discretos, embaixo do formulário, sempre.
- [x] **Se o sistema não responder**, o pedido fica no Directus como antes (ninguém perde o que escreveu).
- [x] **Na tela do cuidado pastoral** (só o nível geral vê): selo "Veio do mural de oração do site"; não vai ao boletim,
      não abre acompanhamento (não há congregação nem contato); dá para marcar como lido e marcar o sinal de risco (avisa
      o nível geral de novo). Os confidenciais do site que esperam leitura entram no aviso das 7h ao nível geral.
- [x] **Banco (migração 149):** `Origem` (`SISTEMA`/`SITE`) e `SiteItemId`; `CongregacaoId` aceita vazio **só** no pedido do
      site (CHECK); a origem e o número do item do site não mudam depois (gatilho); a guarda (1 ano; 5 com risco) vale
      igual.
- [x] **Provas:** jest (rota, recebimento, tela), roteiro da tela 660/0, `site/scripts/testes/mural-unidade.cjs` (envio do
      site, sem rede) e `e2e-28` no SQL Server local (41/41, inclusive a migração aplicada duas vezes). Um defeito achado na
      prova: a marcação à mão de risco num pedido do site usava a mesma referência de aviso do aviso automático (pedido 5
      marcado = 51 = pedido 51 com risco) e calaria o aviso do outro; agora cada um tem a sua (o teste falha no código antigo).
- [ ] **Depois de uma semana no ar:** tirar do Directus a permissão pública de **criar** em `mural_oracao` (hoje ainda
      aberta, para quem estiver com a página antiga no cache do navegador).

## v7.12 — Comunicação: consentimento granular e envio segmentado *(7ª rodada)*

A vB.2 constrói o motor de notificação. Esta versão trata da parte jurídica e da
segmentação — no Brasil, WhatsApp sem opt-in registrado é risco de LGPD e de
bloqueio pela própria Meta.

**Decisões do responsável da Igreja (22/10/2026):** **sem WhatsApp e sem SMS** nesta versão (são pagos por mensagem;
mantém a decisão de 14/09 da vB.2) — o consentimento já nasce com esses canais previstos, para ligar depois sem refazer
nada; e **nenhum grupo de envio escolhido pelo dízimo** ("dizimistas inativos" saiu do plano: ninguém recebe ou deixa de
receber mensagem pelo que dá).

- [x] **Consentimento por canal E por categoria** (e-mail e celular × convocação oficial, eventos, devocional,
      financeiro), com origem, data, o **texto exato aceito** (versão e impressão digital do texto) e o endereço de quem
      aceitou. O membro pode sair de "eventos" e continuar recebendo **convocação oficial**, que é obrigação estatutária
      de comunicação, não marketing.
- [x] **Saída com um toque** e bloqueio de envio sem consentimento vigente. Sem WhatsApp/SMS não há palavra-chave a
      receber: o equivalente é o link "não quero mais receber" em todo e-mail que não é convocação, com registro (o
      cabeçalho de descadastro de um clique ficou de fora: o serviço de e-mail do Azure não garante aceitá-lo, e um
      cabeçalho recusado pararia todos os e-mails).
- [x] Modelos de mensagem **versionados e aprovados**: só se envia um modelo aprovado; o aprovado não se edita (corrigir
      é criar a versão seguinte).
- [x] **Segmentação dinâmica por consulta viva**, não lista estática: território (congregação, área, região), cargo
      ministerial, departamento, liderança ativa, professores de EBD, formação vencida ou vencendo, voluntário com
      habilitação vencendo e os elegíveis de uma sessão da Assembleia. A lista é calculada na hora do envio.
- [x] Registro de entrega/leitura e relatório de alcance — saber se a convocação oficial de fato chegou é questão de
      validade do ato, não de curiosidade.

### Entrega (22/10/2026)

Migração 150; `shared/comunicacao.js` (regra pura), `shared/comunicacaoDb.js`, `shared/comunicacaoFilaMarca.js`; rotas `GestaoComunicacao` (`/api/comunicacao/<ação>`),
`ComunicacaoSair` (o link do e-mail, sem login) e `ComunicacaoFila` (a rotina de 15 em 15 minutos, `rotinas-comunicacao.yml`); a rodada das 7h aplica a retenção e
regrava a marca da fila, mas não manda a fila (texto alinhado ao código na Trava 7-C). Janela real da fila (Trava 7-C): das 6h às 22h45 de Brasília a fila
inteira; das 23h às 5h45 só o aviso de crise, abrindo o banco só se a marca do Storage disser que há crise na fila. Tela: Meu Painel → Comunicações e a aba Comunicados (`app/modulos/comunicacao.js`), a página `sair.html`, casca v37. A exclusão LGPD passou a apagar
também as preferências de aviso e os aparelhos inscritos (antes ficavam); Meus Dados mostra o histórico do consentimento; ROPA ("Comunicação com os membros") e RIPD
("Comunicação com os membros") novos.

**Provas:** jest (regra pura, marca da fila, rotas, exclusão LGPD, varredura de rotas), `e2e-29` no SQL Server local (98 verificações: esquema,
consentimento, ficha, modelos, grupo, fila com as cotas e a prioridade da convocação, 429, tempo esgotado e erro no meio que devolvem à fila, cancelamento,
convocação, saída, retenção e LGPD), `e2e-30` (corridas e escala: seis rodadas da fila juntas nunca mandam o mesmo e-mail duas vezes e respeitam o teto da hora;
sem a trava da rodada o teste falha com 22 e-mails num teto de 12; um envio a ~4.900 pessoas grava em blocos; mais de 5.000 é recusado) e a prova da tela
`tools/front-comunicacao` (417 verificações; 26 falham na tela de antes das correções). Defeitos achados nas provas: o SQL Server recusa `OUTPUT` sem `INTO`
numa tabela com gatilho (a fila não andava) e a recusa "o texto mudou" perdia o sinal que manda a tela recarregar; a prova da tela achou 5 na tela (aba que dizia
"sem acesso" quando o catálogo não carregava, pílula do nível geral que ficava para o login seguinte, grupo apagado ao guardar outro, "Enviar" religado sem
contagem, motivo apagado na releitura).

**Revisão adversarial independente (22/10/2026), 2 altos, 11 médios e 15 baixos, todos corrigidos:** o direito a voto filtra antes do corte de 5.000 (antes a
convocação podia sair incompleta sem aviso); a ficha em papel é só do nível geral, com a referência da ficha e a confirmação reforçada, e não vence o que a pessoa
marcou depois da data dela; a convocação passa na frente na fila; o 429 do e-mail volta na hora (o SDK repetia esperando minutos); o tempo é conferido a cada
mensagem e o que não foi tentado volta à fila; a rodada das 7h só faz a retenção; o envio grava em blocos; o teto da hora soma os avisos do sistema (padrão 60);
"direito a voto" só para o nível geral (cruza com a disciplina); a retenção e a exclusão alcançam o aviso do sininho; quem não tem data de nascimento fica fora
(salvo na convocação) e o menor não autoriza sozinho; aprovar confere a impressão digital do texto lido; a marca da fila não volta atrás (versão e ETag); e os
baixos (chaves herdadas, território em texto, saída de quem foi excluído, a prova da convocação guardada na exclusão, cancelado que não é "o mesmo",
"mostrando 500 de N", celular que falha × sem aparelho, Meus Dados completo, mensagem das regras, `$` no nome, data inexistente, limite de mudanças e de
contagens, base legal editada que a migração não sobrescreve, ficha de quem não tem congregação, e-mail fora do log).

**Depende de gente (fora do código):** pedir ao suporte do Azure o aumento do limite de e-mail (hoje 100 por hora; o pedido é de graça e leva até 72 horas) quando os
comunicados passarem de algumas centenas de pessoas; depois, subir `COMUNICACAO_EMAILS_POR_HORA` em Catálogos → Prazos.

### Contrato (22/10/2026)

**Canais e categorias.** Canais externos: **e-mail** e **celular** (o aviso do aplicativo instalado); WhatsApp e SMS
existem no banco, sem envio. O **sininho** do sistema não é canal externo: todo comunicado aparece lá para quem está no
grupo. Categorias: **Convocação oficial** (assembleias e reuniões estatutárias), **Eventos**, **Devocional** e
**Financeiro** (prestação de contas e campanhas).

**Consentimento.** É **pedido, não presumido**: sem um "sim" registrado, o e-mail e o celular daquela categoria não
recebem (o sininho recebe). O membro marca em **Meu Painel → Comunicações**, lendo o texto exato de cada categoria; a
Secretaria pode registrar o "sim" ou o "não" que a pessoa deu numa **ficha em papel** (com a data da ficha). Cada
mudança é uma linha nova (o histórico não se apaga). A **convocação oficial** vai por todo canal que a pessoa tiver,
com ou sem consentimento, e nunca tem o link de saída; isso está escrito na tela.

**Modelos.** Título (até 150) e texto (até 2.000), com dois campos que o sistema preenche: `{{primeiro_nome}}` e
`{{congregacao}}`; nada de HTML. Criar e aprovar modelos é do nível geral (o modelo é a voz da Igreja); a convocação
oficial só sai pelo nível geral.

**Grupos.** A liderança com a permissão nova **comunicacao** monta o grupo pelos critérios acima e vê **quantas pessoas**
ele tem antes de enviar (e quantas de cada canal receberão); o grupo é sempre cortado pelo território de quem envia.
Ficam de fora: quem não está ativo, menores de 18 anos (o comunicado ao menor vai pelos responsáveis, fora desta
versão) e quem pediu a exclusão dos dados. Grupos podem ser guardados com nome para reusar; a lista é refeita a cada
envio.

**Fila e limite do e-mail.** O serviço de e-mail do Azure manda, no domínio da Igreja, **30 por minuto e 100 por hora**
(o aumento é pedido de graça ao suporte e leva até 72 horas). Por isso: sininho e celular saem **na hora**; os e-mails
vão por uma **fila** que manda uma parte a cada 15 minutos (o número por rodada é ajustável em Catálogos → Prazos). A
rotina só abre o banco quando há fila (uma marca guardada no Storage, como a da proteção). Um e-mail nunca é mandado
duas vezes: o que travar no meio vira "falhou", não é repetido sozinho.

**Entrega e leitura.** Por pessoa e por canal: aceito pelo serviço, falhou, sem consentimento, sem e-mail, sem aparelho,
cancelado. Leitura = abriu no sininho; na convocação oficial, a pessoa ainda pode tocar **"Recebi a convocação"** (a
ciência fica registrada). Não há "pixel" de leitura no e-mail (privacidade). O **relatório** do envio mostra os números e,
na convocação, a lista de quem **não foi alcançado** por canal nenhum nem leu, para a Secretaria procurar por telefone.

**Guarda e LGPD.** O registro de entrega perde o nome em 1 ano (5 anos na convocação oficial, prova do ato); o
histórico de consentimento fica enquanto a pessoa estiver no cadastro e sai na exclusão LGPD (que também passa a apagar
as preferências de aviso e os aparelhos inscritos). Meus Dados mostra os consentimentos e os comunicados recebidos.
ROPA e RIPD ganham "Comunicação com os membros".

## v7.13 — Eventos, inscrições e congressos *(7ª rodada — expande v7.4)*

**Decisões do responsável da Igreja (22/10/2026).** (1) **Tudo no site**, ampliando o que já existe (inscrição, faixas, cupom,
vagas, QR, crachá): um seminário em novembro é o maior uso, as inscrições abrem em 1 a 2 semanas e não se aceita o risco de
mudar de lugar agora; levar inscrições e camisetas para o sistema fica para a **Fase 10** (integração total, com o site virando
só conteúdo). (2) **Pagamento:** continua manual, mas a pessoa **informa o pagamento** e a equipe confere no extrato e confirma;
"cada inscrição vira uma conta a receber" está **errado** (não se faz). O **Pix online pela conta da Igreja no banco Cora** foi
aprovado pelo Presidente (cerca de R$ 1 a 2 por Pix e R$ 50 por mês), mas fica **parado** até a análise de segurança que o
responsável está fazendo (DNSSEC no domínio, cuidado com o CPF que a Cora exige, valor mínimo de R$ 5). (3) **Hospedagem e
transporte por congregação: fora** — no campo todos vão juntos; só faria sentido num evento fora ou numa convenção recebida
(Fase 10).

- [x] **Lotes de inscrição** (preço, vagas e público): cada faixa de valor do evento ganha, opcionais, a data em que deixa de
      valer ("1º lote até 05/11") e o número de vagas daquele lote; o público é o próprio rótulo ("Membro", "Visitante",
      "Jovem"). Lote vencido ou esgotado não aparece para escolher; o esgotado só é recusado DENTRO da trava de vagas (a mesma
      senha do livro do evento), com o aviso "escolha o lote seguinte" — o limite geral de vagas continua mandando para a lista
      de espera, sem recusar ninguém.
- [x] **Informar o pagamento:** na página da inscrição (código + telefone) e em **Minha Conta → Meus eventos**, a pessoa diz
      a data, o meio (Pix, transferência, dinheiro, outro), o valor e o nome de quem pagou; o mesmo para o pedido de camiseta.
      Não precisa mandar comprovante: a equipe confere no extrato. No painel do evento aparece o filtro "Pagamento informado,
      a conferir".
- [x] **Confirmar com nome e hora:** marcar "pago" (e desmarcar) passa a guardar quem confirmou e quando; **cortesia ou
      isenção** só com o motivo e o nome de quem autorizou (a inscrição de cortesia sai da conta de "a receber" e do filtro
      "não pagos"). O total recebido do evento continua indo, à mão, para o caixa do evento no sistema (v7.4).
- [x] **Credenciamento por sala ou ala:** cada local de credenciamento do evento pode ter capacidade; a tela de check-in
      mostra quantas pessoas entraram em cada local e avisa ao passar da capacidade; cada entrada fica registrada (quem, em
      que local, a que horas, por qual equipe) — a mesma pessoa pode entrar em mais de um local. **Relatório de ausentes**
      (quem se inscreveu e não veio), por lote e por tipo, para imprimir — insumo para dimensionar o próximo evento.
- [x] **Crachá configurável:** cada inscrição tem um **tipo de participante** (Participante, Preletor, Equipe, Imprensa,
      Convidado — o organizador muda), e o evento escolhe o que vai no crachá: nome, tipo, igreja/congregação (da resposta a
      uma pergunta do evento), cidade, e o **QR do credenciamento** (o mesmo código do check-in, para entrar mais rápido).
- [x] **Aviso contra golpe** (pedido do responsável, 22/10/2026) em toda tela do site que fala de pagamento: a Igreja não entra
      em contato com ninguém pedindo pagamento ou Pix; pague só pelos dados mostrados no site e, se receber um pedido assim,
      avise a Secretaria. O pagamento continua só informado até a v10.8.

### Entrega da v7.13 (22/10/2026)

No site (Directus + `site/api`): `lotes.js` (o lote é contado dentro da trava de vagas, lido depois da última senha; a escolha do lote é
obrigatória quando o evento tem lotes), `InformarPagamento` (código + telefone, conta ou telefone do pedido; nunca marca pago),
`PainelInscricao` (pago, cortesia e tipo com quem e quando tirados do token; "registro divergente" quando alguém muda direto no
Directus), a coleção `evento_entradas` (uma entrada por pessoa, local e dia), o relatório de ausentes, o crachá com tipo, igreja,
cidade e QR (só a resposta original da inscrição) e o aviso contra golpe em 5 telas. Esquema aplicado em produção pelo script
repetível `site/scripts/directus-eventos-v713-esquema.mjs` (simulado antes; a segunda rodada não criou nada; nenhuma permissão
pública nova). Provas: testes de unidade (lotes 77, pagamento 135, credenciamento 46, esquema 17), bateria na réplica local do
Directus (49, com 40 inscrições ao mesmo tempo num lote de 10: entram exatamente 10) e a bateria do site em homologação e produção.
Revisão adversarial independente: 1 alto (inscrição sem lote pulava o preço), 4 médios e 13 baixos, todos corrigidos, cada um com
teste que falha no código de antes. Limite da licença do Directus: não dá para fechar o campo "pago" campo a campo nem separar por
evento; o painel mostra o registro divergente e o registro de atividade do Directus é a prova.

**Fora desta versão (por decisão):** pagamento online (Pix Cora: v10.8, depois da segurança do domínio da v10.7); hospedagem e transporte
(v10.6); levar as inscrições para o sistema (v10.6).

## v7.14 — Identidade Visual Anual *(gap da varredura normativa)*

O Art. 159 descreve um processo participativo com calendário rígido, critério de
originalidade e consequência financeira — nada disso tem onde existir hoje.

**Decisões do responsável da Igreja (22/10/2026).** (1) A lista dos temas já usados desde 2006 **não existe** no sistema: a
versão traz a tela "Temas já usados" e a Secretaria cadastra (até lá, a triagem confere à mão). (2) **Vota todo membro apto e
em comunhão, pelo Meu Painel** (matrícula e PIN; quem não tem acesso vota com a ajuda da Secretaria). (3) **Pedidos de
uniforme: fora** — a camiseta do ano já é pedida e tratada na aba Camisetas do site (o membro ou um responsável pede; o
Dirigente avisa e entrega); o item "pedido do Dirigente vira conta a pagar" não se faz.

**Decisão de 23/10/2026: não há prazo de 1º/11.** O processo deste ano (identidade de 2027) está sendo feito **fora do
sistema**; o primeiro ciclo no sistema será o de **novembro de 2027 (identidade de 2028)**. O ciclo do ano é **aberto pela
Diretoria** quando ela quiser (até 15/11 daquele ano): o sistema não cria ciclo sozinho e não mostra etapa de um ciclo que não
foi aberto. O tema de 2027, escolhido fora, a Secretaria cadastra em "Temas já usados".

- [x] **Calendário do processo** (Art. 159 §1º): sugestões de 01 a 15/nov → triagem de 16 a 21/nov → votação de 22 a 30/nov
      → arte em dezembro (até 3 cores da Diretoria e concurso de arte dos membros) → escolha final até 31/12 por maioria
      simples dos presentes (no culto; o sistema registra o resultado). Cada etapa abre e fecha sozinha pela data de Brasília
      (calculada na hora, sem depender de rotina).
- [x] **Antiduplicidade desde 2006**: a tela "Temas já usados" (ano e tema; o tema escolhido de cada ano entra sozinho). Na
      sugestão, o tema igual a um já usado (sem diferença de acento, maiúscula ou pontuação) é recusado na hora, e o parecido
      fica marcado para a triagem — a validação acontece antes da votação, nunca depois da arte pronta.
- [x] **Sugestões e triagem**: cada membro apto manda até 3 sugestões (frase curta, até 80 letras) e pode retirar a sua até o
      dia 15; na triagem, a Diretoria aprova como finalista (pode ajustar a redação, guardando a original) ou descarta com o
      critério do inciso I (curto e memorável, amplo e abrangente, originalidade).
- [x] **Votação reaproveitando o módulo de Enquetes** (v2.8): no dia 22 os finalistas viram uma enquete de toda a membresia
      apta, votada em **Meu Painel** (uma vez por pessoa); no fim do dia 30 ela fecha sozinha e o resultado é apurado.
- [x] **Arte e escolha final**: a Diretoria registra até 3 cores; membros mandam a arte (imagem) baseada nas cores; a
      Diretoria registra a escolha final do culto (arte + cor, data, votos), que vira a Identidade Visual oficial do ano
      seguinte e entra na lista de temas já usados.

**Fora desta versão (por decisão):** pedidos de uniforme (já são feitos na aba Camisetas do site).

### Entrega da v7.14 (23/10/2026, no ramo; a homologar)

Migração 151 (só acréscimo): `IdentidadeCiclos`, `IdentidadeTemasUsados`, `IdentidadeSugestoes`, `IdentidadeCores`, `IdentidadeArtes`,
`IdentidadeResultados`, `Enquetes.DataFechamentoPrevista`, a permissão `identidade_visual` (Presidente e Secretário Geral; o servidor
exige o nível Geral — Art. 126-Q, II), 4 avisos à Diretoria (triagem começou, votação aberta ou que não abriu, apuração, fase da
arte; nenhum aos membros) e a retenção (1 ano depois do fim do ciclo, a sugestão e a arte perdem o nome e a imagem não escolhida
sai). Gatilhos: o ciclo só anda para a frente; no máximo 3 sugestões e 3 artes ativas por pessoa; texto único no ciclo; a cédula
congela quando a votação nasce; o resultado e o tema do processo não se editam; a cor em que já há arte não muda.
`shared/identidadeVisual.js` (regra pura: as etapas pela data de Brasília, o texto normalizado, igual e parecido, cores, imagem,
apuração), `shared/identidadeVisualDb.js`, rota `/api/identidade-visual/<ação>`, módulo `app/modulos/identidade-visual.js` (Meu
Painel → Identidade Visual e a aba Identidade Visual, no módulo Vida Eclesiástica) e Meu Painel → **Votações** (enquetes.js).

As Enquetes ganharam: a data de fechamento (lida na hora, conferida no próprio INSERT do voto pela hora do banco e encerrada pela
rotina diária), o voto que confere o público só da pessoa (antes relia o cadastro inteiro a cada voto), o segundo voto simultâneo
que vira "já respondeu" (antes, erro 500) e a votação do tema que não se encerra à mão.

Decisões tomadas na construção (o Regimento não fecha; ajustáveis):

- o primeiro ciclo que se abre no sistema é o da identidade de **2028** (o banco também recusa ano anterior);
- a votação abre sozinha no dia 22 só com **pelo menos 2 finalistas** (no máximo 10) **e a triagem completa**; com sugestão ainda
  sem decisão, a Diretoria é avisada todo dia e abre pelo botão, que pergunta "há N sem decisão, abrir assim mesmo?" (até o dia 30);
- **menos de 2 finalistas**: a partir do dia 22 (ou depois do dia 30 sem votação), a Diretoria pode definir o tema sem votação, com
  o motivo e a confirmação reforçada (fica registrado quem e por quê);
- **empate ou nenhum voto**: a Diretoria define o tema entre os mais votados **pela contagem gravada na apuração**, com o motivo;
- a triagem vê **só o texto** da sugestão (nunca quem mandou); as artes mostram o autor à Diretoria (para falar com quem desenhou);
- até **3 artes** ativas por pessoa (PNG ou JPEG, até 5 MB); a imagem é guardada **sem os metadados** (localização GPS, data,
  aparelho, textos embutidos); o membro retira a sua arte **até 24/12** e nunca depois do resultado; as cores podem ser registradas
  desde a triagem e não mudam depois que chega a primeira arte (acrescentar até 3 ainda pode); a Diretoria pode tirar do concurso a
  arte ilegível, com o motivo;
- o resultado do culto pode ser registrado depois de 31/12 (o culto pode ser a vigília), mas a data do culto tem de ser de dezembro;
  se a arte escolhida não veio pelo sistema, a Diretoria manda a imagem no próprio registro; registrado, não se edita;
- o tema só aceita letras do alfabeto latino (com acento), números e pontuação — texto com letra de outro alfabeto (que imita a
  latina e burlaria a recusa do igual) é recusado com mensagem clara; o limite de 80 conta como o banco (um emoji conta 2);
- os atos do membro (sugerir, retirar, mandar e retirar arte) ficam na auditoria **sem o nome e sem o número do registro**;
- confirmação reforçada (a chave do aparelho ou o código) em: abrir e cancelar ciclo, excluir tema usado, corrigir tema, abrir
  votação, tema sem votação, desempate, cores, recusar arte, resultado e qualquer decisão da triagem sobre finalista;
- "Temas já usados" aceita de 2006 ao ano que vem; o tema escolhido pelo processo entra sozinho e não se edita;
- exclusão LGPD: as sugestões e as artes perdem o nome; a sugestão que não foi finalista perde também o texto; a imagem não escolhida
  sai **quando o ciclo encerra** (até lá ela ainda pode ser a escolhida); ficam as contagens, os finalistas e a identidade escolhida.

Provas: jest 5.859 (141 arquivos; novos: a regra pura 52, a rota 22, as enquetes que fecham sozinhas 25); ponta a ponta no LocalDB `e2e-31`
(205: esquema e gatilhos, a porta, o ciclo de 2028 inteiro com o relógio da regra em novembro e dezembro de 2027, o ciclo de 2029 com
votação sem finalistas, botão, empate e desempate, LGPD, Meus Dados, retenção e lixo em cada campo) e `e2e-32` (21, corridas com
vários processos: 6 sugestões da mesma pessoa entram 3, o mesmo tema por 6 pessoas entra 1, uma enquete só com 4 acessos no dia 22,
4 votos da mesma pessoa viram 1, uma apuração só, no máximo 3 artes, um resultado só); prova de mutação no servidor (o igual que não
recusa, o voto duplicado que dava 500 e a apuração antes da meia-noite: cada uma acusada); `e2e-24`, `e2e-28`, `e2e-29` e `e2e-30`
seguem verdes. Tela `tools/front-identidade` (632 verificações; 3 defeitos da tela achados e corrigidos; prova de mutação 115: 107
acusadas, 8 equivalentes, nenhuma escapou) e as telas de antes (cuidado 870, comunicação 417, check-in 1.488, proteção 808,
menores 322) sem falha.

**Revisão adversarial independente (23/10/2026, sobre o commit 8b59841): 22 itens + 1 teste instável, todos corrigidos.** O membro
some da auditoria dos próprios atos (sugestão e arte, sem nome e sem número do registro); a enquete com fechamento marcado é
encerrada de verdade na primeira leitura depois da hora (resultado gravado, não só o rótulo; a ata também); o voto lê a enquete com
trava dentro do próprio INSERT e o encerramento marca ENCERRADA antes de contar (seguro com READ_COMMITTED_SNAPSHOT, o padrão do
Azure), e a apuração decide pela hora do banco; o "parecido/igual a tema já usado" é recalculado na triagem; letras de outro
alfabeto recusadas; emoji medido como o banco; confirmação reforçada nos atos da lista acima; a arte não some (retirada até 24/12,
LGPD só apaga a imagem quando o ciclo encerra); metadados (GPS etc.) tirados de PNG e JPEG sem dependência nova; ciclo só a partir de
2028 (também no CHECK); a votação não abre sozinha com sugestão sem decisão; tema sem votação e resultado com a imagem da Diretoria;
voto de várias perguntas numa transação e sem reler todas as respostas; o fechamento automático audita como o manual; cancelar ×
sugerir na mesma trava do ciclo; o login da tela igual ao do voto; desempate pela contagem gravada; o ajuste da redação não se perde;
só o erro do gatilho das cores vira aquela mensagem; na rotina diária, a falha da identidade não pula o passo da agenda pública, o
fechamento das enquetes é passo próprio e a retenção que apaga imagens vem depois dos avisos, com orçamento de tempo; o teste do PIN
ficou determinístico. Provas: jest **5.881** (143 arquivos), e 32 testes falham com os fontes de 8b59841; `e2e-31` **241**,
`e2e-32` **23** e o novo `e2e-39` **9** (READ_COMMITTED_SNAPSHOT ligado no próprio teste: o voto que estava sendo gravado entra na
contagem, máximo de 3 e tema único) — com o código antigo o `e2e-39` falha e as reversões dirigidas dos itens 4, 7, 11, 20 e 21
falham no `e2e-31`; os itens 17 e 18 são provados por corrida (não determinísticos contra o código antigo; o 18 já era coberto pela
trava da aplicação); `e2e-23` a `e2e-30` seguem verdes. Tela: 815 verificações (38 falhas com o módulo de antes), mutação 139:
131 acusadas, 8 equivalentes, nenhuma escapou; telas de antes sem falha. Falta: a homologação (migração 151 no Azure SQL, rotas
401, a tela no navegador) e a produção.

## v7.15 — Gestão de crise e porta-voz único *(gap da varredura normativa)*

Base: Regimento Art. 161-B — em crise institucional, escândalo na mídia, acidente grave ou evento de repercussão pública
negativa, vale a Política de Porta-Voz Único: só o Pastor Presidente, ou um profissional de comunicação designado formalmente
por ele, fala em nome da IEADESPA (§ 1º); qualquer outro diretor, pastor, advogado ou membro fica proibido de dar nota,
entrevista ou opinião ligando o assunto à Igreja durante a crise (§ 2º). Trabalhada em paralelo com a v7.14 (por pedido do
responsável, 23/10/2026: as duas não têm nada em comum).

- [x] **Sinalizador institucional de "crise ativa"** (Art. 161-B §§1º-2º) com
      designação formal do Porta-Voz Único e aviso automático a **todos** os
      líderes sobre a vedação de manifestação individual enquanto durar o regime.
- [x] Registro de manifestações autorizadas e centralização das demandas de
      imprensa — quem falou o quê, quando e com autorização de quem.
- [x] Plano de emergência por congregação (evacuação, contatos), **registro de
      simulados** (data, participantes) e checklist de vistoria predial —
      conecta com AVCB (v4.24) e seguros (v4.16). *(Trava 7-C: as duas versões estão documentadas em
      `docs/pesquisa/mercado-e-norma-2026.md` — "v4.16 — Seguros institucionais" e "v4.24 — Obras, licenciamento e
      inauguração" —, não no plano da fase 4; o código está nas migrações 066_seguros_institucionais e 074.)*
      *(Brotherhood Mutual — violence response plan e disaster plan)*
- [x] Equipe de segurança por congregação com composição registrada.

### Contrato (23/10/2026)

**Crise.** Quem abre e encerra o regime de crise no sistema é o nível geral com a permissão nova `crise_gestao` (Presidente e
Secretário Geral), com a confirmação reforçada, registrando quem ordenou (o Presidente), o motivo em poucas palavras, o
alcance (todo o Campo) e o **Porta-Voz Único**: o próprio Presidente ou o profissional designado (nome, contato e o ato da
designação). Só uma crise ativa por vez; o histórico não se apaga. Ao abrir, **todos os líderes ativos** recebem na hora,
pelo sininho e pelo celular, o aviso obrigatório da vedação do § 2º (quem é o porta-voz, a quem encaminhar a imprensa) — o
e-mail vai pela fila da v7.12 (o serviço do Azure aceita 100 por hora), nunca disparado de uma vez. Ao encerrar, o aviso de
fim também sai. Enquanto a crise está ativa, a tela de toda a liderança mostra a faixa "Crise ativa — porta-voz único:
fulano".

**Manifestações e imprensa.** Registro das manifestações autorizadas (data e hora, canal — nota, entrevista, rede social,
coletiva —, quem falou, resumo, link ou documento, quem autorizou) e das demandas de imprensa recebidas (veículo, contato,
pedido, prazo, situação — recebida, respondida pelo porta-voz, recusada — e a resposta). Qualquer líder registra uma demanda
que chegou a ele (é assim que encaminha); só o porta-voz e o nível geral respondem e registram manifestação. Nada se edita
depois de registrado (correção = nova linha); o histórico fica.

**Segurança da congregação.** Com a permissão nova `seguranca_congregacao` (Dirigente, Pastor de Área e o nível geral, cada
um no seu território):

- **Plano de emergência** da congregação: rotas de evacuação e pontos de encontro (texto), contatos (Bombeiros 193, SAMU 192,
  Polícia 190, mais os da congregação), responsáveis; revisão anual (aviso quando vence).
- **Simulados**: data, tipo (evacuação, incêndio, primeiros socorros, violência), participantes (número), duração, o que
  correu bem e o que melhorar, quem registrou; aviso quando a congregação passa de 1 ano sem simulado.
- **Vistoria predial**: checklist periódico (extintores na validade, saídas desobstruídas, iluminação de emergência, quadro
  elétrico, acessibilidade…) com o resultado de cada item e as pendências; mostra a validade do **AVCB** (v4.24,
  `ImoveisSituacaoFiscal`) e se há **seguro vigente** (v4.16, `ApolicesSeguro`), avisando o que está vencido; aviso quando a
  vistoria passa de 6 meses.
- **Equipe de segurança**: membros adultos da congregação com a função (coordenação, brigada, primeiros socorros, portaria,
  estacionamento), desde e até quando; sai sozinho de quem deixa a congregação ou é desligado.

### Entrega (23/10/2026)

Migração 152 (só acréscimos; reaplicada duas vezes no banco local): `CriseRegimes` (um regime ativo por vez, garantido por índice único filtrado no
banco), `CriseHistorico`, `CriseManifestacoes`, `CriseDemandasImprensa`, `CriseDemandaRespostas`, `SegurancaPlanos`, `SegurancaSimulados`, `SegurancaVistorias`,
`SegurancaVistoriaItens` e `SegurancaEquipe`, com gatilhos que só deixam acrescentar (correção é linha nova; simulado e vistoria errados são anulados, uma vez, com o
motivo); as permissões `crise_gestao` (Presidente e Secretário Geral) e `seguranca_congregacao` (Dirigente, Pastor de Área e o nível geral); os prazos da segurança em
Catálogos → Prazos (plano 365 dias, simulado 365, vistoria 180); os avisos do sininho (`SEGURANCA_*` e o pedido da imprensa `CRISE_DEMANDA_IMPRENSA`); a retenção (o
contato do jornalista sai em 5 anos; o nome de quem saiu da equipe, em 5 anos ou na exclusão LGPD); o ROPA ("Crise e segurança"). Código: `shared/criseSeguranca.js`
(regra pura), `shared/criseSegurancaDb.js`, rota `GestaoCriseSeguranca` (`/api/crise/<ação>`), a rotina diária dentro de `NotificacoesAgendador` (a equipe de quem saiu e
a retenção), Meus Dados e a exclusão LGPD. Tela: a faixa "Crise ativa — porta-voz único: fulano" no alto de toda tela da liderança e a aba **Crise e segurança**
(`app/modulos/crise-seguranca.js`), aberta a toda sessão de liderança; casca v39.

**Decisões tomadas na construção (o contrato não fechava):**

- **O aviso da crise é um comunicado do sistema.** Uma categoria nova na comunicação da v7.12, `CRISE`, marcada como do sistema: não aparece na tela de modelos, nas
  preferências nem na prévia; não se reenvia, não se arquiva nem se cancela pela tela de comunicados. Abrir, trocar o porta-voz e encerrar gravam, na MESMA transação do
  ato, o modelo já aprovado, o envio, as entregas e o sininho (regra `COMUNICADO`, obrigatória); o celular sai em paralelo dentro da resposta do ato (emenda da
  revisão independente, abaixo; o que não couber sai pela fila de 15 minutos, também de madrugada desde a Trava 7-C); o e-mail
  vai pela fila (passa na frente da convocação oficial e respeita o teto da hora). Ela se comporta como a convocação oficial: sem consentimento e sem link de saída,
  ciência "Li o aviso", lista de não alcançados no relatório, 5 anos de registro e fica na exclusão LGPD (prova do aviso). O aviso velho que ainda estava na fila é
  cancelado quando o porta-voz muda ou a crise acaba (o novo vai a todos). Botão "Continuar o aviso agora" para mais uma rodada.
- **O motivo nunca vai no aviso nem na faixa** — fica só com o nível geral (o aviso diz quem fala, o contato e a vedação do § 2º).
- **(Trava 7-C) O que o regime no sistema é.** O Art. 161-B diz que a política se ativa automaticamente diante da crise: a proibição de falar vale
  ANTES do registro, e o regime no sistema é a **formalização** (quem ordenou, o porta-voz, o aviso, o histórico). O aviso vai à **liderança**; a
  vedação do § 2º vale para **todo membro**, e a tela da crise lembra que, para avisar os membros, usa-se Comunicados (v7.12). O rodapé do
  aviso diz "por decisão da Igreja, com base no Art. 161-B" (o artigo não manda avisar a liderança: é decisão da Igreja). O teto de e-mails do
  aviso é lido da configuração (`COMUNICACAO_CRISE_EMAILS_POR_HORA`), não fixo no texto.
- **(Trava 7-C) Sem RIPD próprio da v7.15:** o RIPD é para dado sensível ou de criança em escala, ou tratamento cujo vazamento expõe a pessoa a
  dano grave; a crise guarda dado comum (quem fala pela Igreja, o contato do jornalista, a equipe de segurança), e o aviso é um comunicado do
  sistema já coberto pelo RIPD "Comunicação com os membros". O critério ficou escrito no topo de `api/shared/ripd.js`.
- **Trocar o porta-voz também avisa toda a liderança** (é a quem encaminhar a imprensa) e pede a confirmação reforçada, como abrir e encerrar.
- **Quem ordenou é o Presidente cadastrado na Liderança**: sem Presidente ativo, o regime não abre. O profissional designado pode não ser membro (sem matrícula); se
  tiver matrícula, o nome vem do cadastro e ele, numa sessão de liderança, registra manifestação e responde a imprensa enquanto for o porta-voz.
- **Todo líder ativo recebe o aviso**, inclusive quem não tem data de nascimento no cadastro (como a convocação); no encerramento, também quem recebeu o aviso e deixou a
  liderança no meio.
- **O pedido da imprensa fora de crise também se centraliza** (vai à Presidência); na crise, ao porta-voz. O pedido chega na hora (sininho e celular) a quem tem
  `crise_gestao` no nível geral e ao porta-voz.
- **Os avisos da segurança vão só ao sininho** do Dirigente e do Pastor de Área (um por regra, por pessoa, juntando as congregações; repete uma vez por mês e quando mais
  uma congregação entra na lista). Sem e-mail de partida: o e-mail direto do motor passaria dos 100 por hora do Azure num mês com muitas congregações atrasadas. O nível
  geral acompanha pelo painel. "Nunca registrado" conta como vencido.
- **AVCB e seguro** vêm dos imóveis da congregação no patrimônio (`BensPatrimoniais` tipo IMOVEL + `ImoveisSituacaoFiscal` + `ApolicesSeguro`); avisa o vencido (seguro só
  quando houve apólice e ela venceu: o Regimento só exige seguro do Templo Sede). Imóvel sem congregação (Sede/Matriz) não entra no painel de nenhuma congregação.
- **A equipe é só de adultos** com data de nascimento no cadastro; a saída automática (quem mudou de congregação, foi desligado ou chegou ao "até") roda às 7h, e a tela já
  mostra "saiu da congregação" antes disso.

**Provas:** jest (regra pura 27, migração 11, rota 13; a suíte inteira verde), `e2e-33` no SQL Server local (182 verificações) e `e2e-34` (corridas, 20), `e2e-29` e
`e2e-30` (v7.12) verdes sobre a base nova, a prova da tela `tools/front-crise` (212 verificações; 20 mutações, 20 acusadas) e as provas de tela da v7.7, v7.8, v7.10, v7.11
e v7.12 verdes. Mutações no servidor (guardas desfeitas uma a uma) acusadas pelos testes. Defeito achado pelo `e2e-33`: a resposta da imprensa gravava e devolvia 500
(variável fora do escopo depois da transação) — corrigido.

**Revisão adversarial independente (23/10/2026): 1 alto, 6 médios e 9 baixos, todos corrigidos**, cada um com teste que falha no código revisado (`0591414`):

- **(alto) "Celular na hora" não acontecia:** o celular saía um a um (0,2 a 0,4 s cada), ~6 s por rodada — com 400 líderes, o último receberia em horas. Agora o celular do
  aviso sai em paralelo (lotes de 25, cada aviso com prazo), com orçamento próprio dentro da resposta (~15 s), e a rotina de 15 minutos manda primeiro o celular do aviso,
  também em paralelo. A resposta diz a verdade ("Celular: X de N aparelhos avisados agora; os outros saem pela fila"). Prova: 420 líderes de mentira, todos avisados em no
  máximo duas rodadas, a abertura respondendo em menos de 38 s.
- **(médio) E-mail:** não sai para quem já foi alcançado (leu no sininho, deu ciência ou recebeu no celular: situação `ALCANCADO`); o aviso tem teto próprio por hora
  (`COMUNICACAO_CRISE_EMAILS_POR_HORA`, 30) e, com convocação oficial na fila, leva no máximo metade da rodada. Na troca do porta-voz o aviso novo vai a todos, mas o
  e-mail dele só sai para quem não foi alcançado pelo aviso novo.
- **(médio)** O porta-voz vê e responde só os pedidos da crise ativa (os de fora, com o contato do jornalista, ficam com o nível geral) e corrige só no alcance da lista.
- **(médio)** AVCB não informado e congregação sem imóvel no patrimônio também avisam.
- **(médio)** O aviso do pedido da imprensa tem teto: 10 por destinatário em 24 horas, e o celular só no 1º pedido de cada líder na hora.
- **(médio/baixo)** A tela espera 40 s nos três atos (o servidor fecha a resposta antes de ~38 s).
- **(baixos)** Datas da abertura e da revisão do plano no dia de Brasília; o encerramento relê o porta-voz dentro da trava; a manifestação e a resposta conferem o
  porta-voz dentro da trava, e na crise encerrada só se registra o que foi dito até o encerramento; sem o botão "Cancelar" no aviso de crise; o celular com um texto curto
  próprio (quem fala e o contato; na troca, o novo porta-voz); a segurança exclui a concessão de departamento, e os avisos da segurança e da imprensa ignoram quem está
  inativo ou teve a exclusão LGPD e incluem quem recebeu o papel por delegação; "registrar a saída" não estica o "até" já passado e a pendência de vistoria anterior
  continua contando até ser resolvida; o Presidente é avisado quando outra pessoa abre, troca o porta-voz ou encerra em nome dele; a migração alarga
  `Papeis.Permissoes` para 2000 antes de acrescentar, se preciso (e para com a explicação se nem assim couber).

## 🔒 Trava de Revisão 7-C — antes de encerrar a FASE 7 e avançar para a FASE 8

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3).
Audita v7.11 a v7.15 pelas 5 perguntas do checklist, e faz uma varredura
final na FASE 7 **inteira** antes de fechar — com atenção redobrada, de
novo, nos fluxos de proteção de menores (v7.7/v7.8/v7.10) e no consentimento
de comunicação granular (v7.12): são os pontos da fase com maior exposição
legal, e é aqui que qualquer regressão neles precisa ser pega antes de
seguir pra Ministerial.

- [ ] **Em andamento (23/10/2026)** — revisão de lei, plano e README, no ramo `trava-7c` (migração 153; `e2e-35` a `e2e-37`):
  - **Base legal (LGPD Art. 11, II).** Não existe a hipótese "organização religiosa": o vínculo de membro é exercício regular de direitos da
    associação religiosa (alínea "d"; Código Civil arts. 44, 53 a 61; CF art. 5º, VI); a disciplina, "d" com o CC art. 57; o financeiro,
    "a" (CTN art. 14, III) e "d"; os incidentes, "a" (ECA arts. 13 e 70-B; Lei 14.344/2022) e "e"; o cuidado pastoral, "d", "e" e o
    Art. 11, I, sem o legítimo interesse (que não serve para dado sensível). O ECA 59-A é adotado por cautela (o caput alcança quem recebe
    recurso público; o parágrafo único, estabelecimentos educacionais e similares). A multa do ECA 245 saiu dos textos que a aplicavam à Igreja.
    O mural do site entrou no ROPA e no RIPD. A migração 153 corrige o texto das políticas só onde ele ainda é o original.
  - **Migrações que regravavam a política a cada deploy** (117, 142, 143, 144, 145, 148) agora só escrevem na linha recém-criada.
  - **Retenções da v7.2, v7.3 e v7.4 resolvidas** pela rotina diária, com prazo padrão ajustável: justificativa de ausência na Ceia (2 anos),
    ocorrência de canal encerrada e administrador que saiu (5 anos), contato do convidado externo (1 ano depois do último evento dele).
  - **Fila de comunicados 24 h:** de madrugada só o aviso de crise; o comunicado comum espera as 6h.
  - **Superintendente Regional:** o painel do nível geral avisa a região sem o cadastro (a escada a pula). Ação humana: cadastrar.
  - **Site:** a política de privacidade e o formulário do mural contam a cópia para o sistema, a lista de risco e o aviso à Diretoria.
  - **Decisões do responsável (23/10/2026), no ramo `trava-7c-decisoes` (migração 155; `e2e-43` a `e2e-46`):**
    - **Dinheiro do voluntário: só aviso** (Regimento Art. 133 §4º, Art. 135 §2º e §3º; Lei 9.608/98). O fornecedor pessoa física pode
      se ligar à matrícula de um membro do território (`Fornecedores.MembroId`: só pessoa física, uma matrícula por fornecedor). Ao lançar a
      saída, três avisos: a pessoa é voluntária (termo vigente ou equipe de escala ativa); pagamentos à mesma pessoa física em 3 semanas
      diferentes em 60 dias (prazos `TESOURARIA_HABITUAL_PAGAMENTOS` e `_JANELA_DIAS`, ajustáveis; o prebendado fica fora); cachê ou
      comissão na descrição, para voluntário. Sem a confirmação nada é gravado; com ela, a saída e os avisos entram juntos
      (`SaidaAvisosVoluntario`, que não se edita) e aparecem a quem aprova e paga. Resumo do mês para a Tesouraria geral pela rotina
      diária (`TESOURARIA_VOLUNTARIO_PAGO`). Meus Dados mostra o cadastro de fornecedor e os avisos.
    - **Funções com criança fora das escalas: departamentos e liderança** (eventos fora). A marca "tem contato com crianças" em
      `Departamentos` e `Papeis` (a União de Crianças nasce marcada); marcar é do nível geral (departamento: `pessoas`; cargo:
      `permissoes`), com a confirmação reforçada. Quem ocupa e não está apto aparece num painel (a Diretoria lê o motivo; a
      Proteção do nível geral, "pendência com a Diretoria") e num aviso obrigatório (`MENORES_FUNCAO_SEM_APTIDAO`), uma vez por
      pessoa e função a cada mês, nunca à própria pessoa e sem o motivo. A nomeação avisa e não impede: a decisão é humana.
