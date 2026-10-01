# FASE B — Consolidação da Base

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

Parte 1 do plano da FASE B — retrofit das Fases 0 a 3.

> **Sobre o nome.** O pedido foi *"criar depois da fase quatro e antes da cinco
> uma fase, digamos, quatro ponto cinco"*. O nome "FASE 4.5" colidiria de frente
> com a **v4.5** (Saídas: Contas a Pagar), que já foi entregue e está referenciada
> em dezenas de pontos do código e deste documento — "v4.5.1" seria ambíguo com
> "primeira parte da v4.5". Por isso: **FASE B** (de *Base*), posicionada
> fisicamente aqui, entre a FASE 4 e a FASE 5. Faz o que foi pedido: volta nas
> fases 0-3 — que foram concluídas, mas não esgotadas — e constrói o que ficou
> faltando, além do que só agora se percebeu que falta.

A fase tem duas metades. **vB.1 a vB.10** são infraestrutura pura — não entregam
módulo de negócio novo, entregam a **base que todas as outras fases vão usar**
(fazer as fases 5-11 sem isso significa repetir 7 vezes o mesmo trabalho: cada
módulo inventando sua própria notificação, seu próprio fluxo de aprovação, seu
próprio relatório). **vB.11 a vB.16** são o retrofit propriamente dito: conteúdo
de negócio que pertence às fases 0-3, mas que só pode entrar aqui — essas fases
já foram entregues e fechadas, então gaps descobertos depois (varredura
normativa, 7ª rodada) não voltam pra dentro delas, entram como versão nova da
FASE B, sempre citando de qual fase/versão original é o retrofit.

## vB.1 — Rede de segurança técnica (o sistema não tem nenhuma)

Achado da varredura de código: 113 endpoints, 95 tabelas, ~10 mil linhas de
front — e **zero testes**. Um sistema que movimenta o dinheiro real de uma
denominação inteira, com regras como "o repasse já rateado não pode entrar em
outro rateio", depende hoje de conferência manual pra saber se continua correto
depois de cada mudança.

- [x] **Testes automatizados das regras de dinheiro primeiro** (não cobertura
      total — as regras que, se quebrarem, perdem dinheiro de verdade):
      Jest (`api/package.json` — `npm test`), 32 testes em
      `api/shared/__tests__/`: `calcularFechamento` (rateio 40/60, dedução de
      aluguel/lote antes do rateio, percentual configurável), `saldoCentroCusto`
      (LOCAL/GERAL/destinos do Rateio Geral), `saldoRestanteCampanha`,
      `projetarFluxoCaixa` (empenho só pesa no 1º mês projetado), e as
      demonstrações da v4.9 (Balanço: Ativo − Passivo = PL sempre residual;
      DRP soma Doações/Receitas Acessórias corrigidas na Trava 4-C; Fluxo de
      Caixa). Mock de `pool`/`sql` sem banco real (`__tests__/testUtils.js`) —
      testa a composição da lógica em JS, não a cláusula SQL em si (isso pede
      um banco de homologação de verdade, item pendente abaixo). Rodado no CI
      **antes** da migração/deploy (o pipeline para se uma regra de dinheiro
      quebrar, antes de mexer no banco de produção).
      **Não coberto ainda** (fica pra quando existir ambiente de
      homologação): o malote do Rateio Geral (constraint no banco, não em
      JS) e a segregação de funções da alçada de aprovação (checada inline
      em `GestaoSaidas`/`GestaoLancamentosTesouraria`, precisa de Function
      real rodando) — são testes de integração, não unitários.
- [x] **Testes de regra estatutária** — `api/shared/__tests__/estatuto.test.js`:
      capacidade eleitoral (Art. 23 — maioridade, 90 dias de admissão, 365
      dias + dizimista fiel pra cargo eletivo, disciplina ativa derruba
      capacidade, dado incompleto nunca assume elegibilidade), Período de
      Integração (Art. 6º §2º), quórum de 2 estágios (maioria absoluta =
      `floor(universo/2)+1`, nunca metade exata) e Abandono Material (Art. 11).
- [x] Ambiente de homologação separado do de produção — banco
      `ieadespa-homolog` (Azure SQL Serverless, mesmo schema da produção via
      as 74 migrações) + ambiente de preview do Static Web App (PR #1,
      **permanece aberto de propósito** — ver `HOMOLOGACAO.md`) apontado
      pra ele. Ainda sem massa de dados fictícia própria (nasceu vazio,
      só com o schema) — script de seed fica pra uma próxima sessão.
- [x] Rotina de backup/restore **testada de verdade** — restore real de
      `app-db-prod` pra um banco temporário em 2026-09-13, contagem de
      linhas conferida contra a produção (bateu exato), banco de teste
      apagado depois. Registro completo, e o comando pronto pra repetir o
      teste, em `HOMOLOGACAO.md`.
- [x] Observabilidade mínima: Application Insights (`ieadespa-appinsights`)
      configurado em produção e homologação + regra de alerta
      (`ieadespa-api-falhas`) disparando e-mail quando `requests/failed`
      passa de 5 em 15 minutos.

  Executado em 2026-09-13 com acesso real à assinatura Azure (a outra
  máquina, que tinha a credencial, autenticou via `az login
  --use-device-code`). Custo mensal recorrente observado na prática: ~R$
  25-115/mês, dominado pelo banco de homologação — bateu com a estimativa
  prévia. Detalhes de cada recurso criado, como reproduzir o teste de
  restore e como manter o ambiente de homologação (não fechar o PR #1!)
  estão em [`HOMOLOGACAO.md`](../../HOMOLOGACAO.md).

Parte 2 do plano da FASE B — continuação, da vB.2 em diante.

> A FASE C (acima) foi intercalada aqui de propósito, entre vB.1 e vB.2 —
> ver a nota "Sobre o nome e a posição" na abertura dela. vB.2 em diante
> continua sendo FASE B (infraestrutura, vB.1-vB.10; retrofit das Fases 0-3,
> vB.11-vB.17), não conteúdo da FASE C.

## vB.2 — Motor de notificações (hoje o sistema é 100% mudo)

O princípio "calculado na leitura, nunca marcação manual" resolveu a correção do
dado — mas criou um efeito colateral: **a informação certa existe e ninguém é
avisado**. Carta de recomendação vencendo, mandato de assento expirando, meta do
PDQ com prazo estourando, repasse parado no malote, prestação de contas atrasada,
certidão de voluntário vencida — tudo isso o sistema *sabe* e não conta a ninguém.

**Decisão explícita (14/09): sem WhatsApp Business API nesta versão** — é API
paga por conversa/mensagem, sem orçamento aprovado. O motor não fica bloqueado
por isso: canal é campo da regra (`NotificacaoRegras.CanalEmail`), não parte do
desenho da tabela — ligar WhatsApp no futuro é acrescentar uma coluna/canal
novo e reaproveitar o mesmo destinatário/regra, não redesenhar nada.

- [x] Migração 079 (`Notificacoes` + `NotificacaoRegras` + `NotificacaoPreferencias`):
      tabela única de notificação por destinatário (`Lida`/`Arquivada` calculados,
      nunca duas telas por módulo), catálogo declarativo de regras (evento/prazo →
      público-alvo por permissão+nível → canal) e opt-out por categoria (não por
      regra individual — ninguém quer configurar regra por regra).
- [x] `api/shared/notificacoes.js` (motor genérico: resolve destinatário por
      permissão/nível reaproveitando o mesmo padrão Lideranca+Papeis de
      `shared/universo.js`/`LoginSecretaria`; `criarNotificacao` é idempotente
      por `RegraChave + destinatário + referência` — rodar a avaliação de novo
      sobre o mesmo fato gerador nunca duplica) + `api/shared/notificacaoDetectores.js`
      (3 regras semeadas, reaproveitando a MESMA leitura que já existia nos
      "alertas" de cada módulo, sem duplicar a regra de negócio: apólice de
      seguro vencendo/vencida — v4.16 —, prestação de contas atrasada — v4.12
      Reg. Art. 120 —, repasse institucional parado — v4.15). Regra nova =
      1 linha em `NotificacaoRegras` + 1 detector, o motor em si não muda.
- [x] `api/Notificacoes` (central de avisos do usuário logado — nunca mostra
      notificação de matrícula alheia): listar (abertas/arquivadas/todas),
      contagem pro badge do sino, marcar lida/arquivar/desarquivar uma a uma
      ou todas de uma vez, e `GET .../digest` (agrupado por categoria — o
      Tesoureiro Geral não precisa rolar 40 linhas soltas pra saber que tem 3
      pendências em FINANCEIRO). `api/GestaoNotificacaoRegras` (nível Global)
      edita o catálogo (ativar/desativar regra, ligar/desligar canal de
      e-mail, editar título).
- [x] `api/shared/notificacaoEmail.js` (canal real: Azure Communication
      Email, mesmo SDK/padrão já usado em `site/api/EnviarConfirmacaoInscricao`
      — best-effort, uma falha de envio nunca derruba a notificação, que já
      existe na central independente do e-mail ter saído). Consentimento por
      canal e categoria: `NotificacaoPreferencias` é opt-out (ativo por
      padrão, cada membro desliga por categoria em `PUT
      /api/notificacoes/preferencias`); regra com `Obrigatoria = 1` ignoraria
      esse opt-out (nenhuma das 3 regras semeadas é obrigatória — o modelo
      completo de consentimento por canal×categoria, com base legal e
      keyword de saída, é a v7.12, quando WhatsApp entrar de verdade).
- [x] `api/NotificacoesAgendador` roda a avaliação sozinho todo dia;
      `api/AvaliarNotificacoes` (POST, nível Global) força uma rodada
      manual sem esperar o horário — usado pra testar sem esperar 24h.
      **Correção real (Trava B-A, 15/09): não é mais `timerTrigger`.**
      Azure Static Web Apps (modelo gerenciado, decisão vC.5) só aceita
      `httpTrigger` nas Functions internas — a primeira tentativa de deploy
      desta versão (e da vB.3) quebrou o build inteiro (`invalid trigger of
      type 'timerTrigger'`), achado só na trava porque vB.2-vB.5 nunca
      tinham sido enviadas (push) antes disso. Virou `httpTrigger` protegido
      por segredo (`api/shared/cronAuth.js`, cabeçalho `x-cron-secret` contra
      `CRON_SECRET`), acionado às 10h UTC por
      `.github/workflows/rotinas-diarias.yml` — mesmo padrão de
      `site-event-notifications.yml`.
- [x] Sino no cabeçalho persistente do painel (`.cabecalho-secretaria`, fora
      de qualquer aba — aparece em todo módulo, não só numa tela): badge com
      não lidas, dropdown com a lista, marcar lida ao abrir, arquivar por
      item, "marcar todas como lidas". Só aparece pra quem tem sessão de
      Secretaria (`authToken`) — quem entra só com matrícula pro check-in
      não é destinatário de nada aqui.
- [x] Testado localmente de ponta a ponta antes de commitar: `npx jest`
      (suíte inteira, 38 testes incluindo os 6 novos de idempotência/opt-out
      do motor) e `node --check` nos 8 arquivos novos de `api/` e em
      `app/script.js` — sem erro de sintaxe/require.
- [x] `ACS_CONNECTION_STRING`/`ACS_REMETENTE` provisionados (14/09): o
      recurso `servicos` (Azure Communication Services) já existia — mesmo
      usado pelo site institucional (`site/api/EnviarConfirmacaoInscricao`) —
      e o domínio `ieadespa.org.br` já estava verificado (`servicos-1`,
      DKIM/SPF/Domain "Verified"). Configurado como App Setting de produção
      do `app-meusite-web` (`az staticwebapp appsettings set`, valor nunca
      exibido) e recriptografado no par local de segredos
      (`api/local.settings.enc.json`) — canal de e-mail pronto pra produção,
      não só código.
- [x] Tela de administração do catálogo (14/09): seção "Regras de
      notificação" dentro da aba Permissões (`app/index.html`/`script.js`) —
      mesma restrição de nível Global, mesmo tipo de decisão ("quem recebe o
      quê do sistema"), por isso não virou aba própria. Toggle direto de
      ativa/e-mail por regra e edição do título exibido no sino, sem precisar
      chamar a API na mão.

## vB.3 — Motor de workflow genérico (parar de recodar o mesmo fluxo)

Hoje cada fluxo de aprovação foi escrito à mão: fila de aprovações de edição
cadastral (v1.11), tramitação de projeto e parecer (v2.8), processo disciplinar
(v3.2-v3.4), procedimento de abandono (v1.5), solicitação de pagamento com alçada
(v4.5), remanejamento do PDQ (v4.8), confirmação de autolançamento (v4.3). São
sete implementações do mesmo conceito — o oitavo módulo vai escrever a oitava.

- [x] Migração 080 (`TiposFluxo` + `FluxoEtapas` + `FluxoInstancias` +
      `FluxoHistorico`): motor único — tipo de fluxo → etapas → responsável
      por etapa (`ResponsavelPermissao` + `ResponsavelNivelMinimo`, mesmo
      padrão declarativo de `NotificacaoRegras` — vB.2) → prazo/SLA
      (`PrazoDias`) → ação de saída. Catálogo nasce **vazio de propósito**
      (ver último item).
- [x] `api/shared/workflow.js`: `iniciarFluxo` (idempotente por
      `TipoFluxo+ReferenciaTabela+ReferenciaId` — um módulo pode chamar de
      novo sem medo de abrir instância duplicada), `avancarEtapa`
      (aprovar avança etapa ou conclui na última; rejeitar/devolver são
      terminais), e `resolverResponsaveisEtapa` reaproveitando a MESMA
      hierarquia territorial de `shared/escopo.js`
      (`ancestraisTerritoriais`) em vez de inventar uma segunda — nível
      territorial sem ancestral resolvido (ex: congregação sem Área)
      retorna ninguém, nunca "todo mundo" (modo seguro).
- [x] Escalonamento automático (14 testes cobrindo `nivelEfetivo`/
      `proximoNivel`): `api/FluxosEscalonador` sobe a instância pro próximo
      nível territorial acima
      (Congregação→Área→Região→Quadrante→Distrito→Global) quando o SLA da
      etapa estoura, reabre um novo prazo no nível escalonado, e **avisa o
      novo responsável pela mesma central de notificações** (vB.2,
      `FLUXO_ESCALONADO`) — integração entre os dois motores, não uma
      segunda caixa de entrada. Já em GLOBAL não escalona mais (fica
      "atrasado" mesmo, não gira em círculo). **Mesma correção real da
      Trava B-A que o `api/NotificacoesAgendador` da vB.2**: era
      `timerTrigger` (não suportado pelo modelo gerenciado do Azure Static
      Web Apps), virou `httpTrigger` às 10h30 UTC por
      `.github/workflows/rotinas-diarias.yml`, mesmo segredo
      `api/shared/cronAuth.js`.
- [x] `api/Fluxos` — painel único "o que está comigo"/"o que está atrasado"
      (`GET /api/fluxos?filtro=comigo|atrasados`): junta toda
      `FluxoInstancias` aberta com a MESMA resolução de responsável usada
      pra autorizar a ação (nunca duas regras diferentes pra "ver" e pra
      "poder agir"). `PUT /api/fluxos/{id}` confere de novo que quem está
      agindo é responsável pela etapa atual antes de aprovar/rejeitar/devolver
      — nunca confia só em estar logado. Sub-aba "Minhas Tarefas" dentro de
      Meu Painel (`app/`) — só aparece funcional pra quem logou com senha
      (sem Lideranca, ninguém é "responsável" por etapa nenhuma).
- [x] `api/GestaoFluxoTipos` (nível Global) — cadastra tipo de fluxo + suas
      etapas de uma vez (o desenho do fluxo é a própria ordem das etapas,
      não faz sentido editar avulso com instância já rodando) e
      ativa/desativa o tipo inteiro.
- [x] **Sem migrar os 7 fluxos existentes** (decisão mantida) — nenhum tipo
      de fluxo foi semeado na migração 080 de propósito: o catálogo começa
      vazio, sem tela de administração ainda (não tem o que gerenciar até o
      primeiro consumidor real existir), e passa a valer quando o primeiro
      módulo das fases 5-11 chamar `iniciarFluxo`. Testado de ponta a ponta
      com `npx jest` (14 testes novos: idempotência de `iniciarFluxo`,
      transições de `avancarEtapa`, escalada territorial nunca pular nível
      nem girar em círculo) e `node --check` nos arquivos novos.

## vB.4 — Busca global, protocolo único e anexos

- [x] **Protocolo institucional único** (migração 081,
      `api/shared/protocolo.js::gerarProtocolo`/`proximoNumero`): sequência
      atômica por Tipo+Ano (`MERGE ... WITH (HOLDLOCK)`) — substitui de vez
      o padrão `SELECT COUNT(*) ... WHERE Protocolo LIKE prefixo%` que
      `shared/ouvidoria.js` e `GestaoProjetos` reinventavam cada um do seu
      jeito, e que tinha **corrida real**: duas requisições simultâneas
      podiam calcular o mesmo `COUNT` e gerar protocolo duplicado.
      `GestaoProjetos` adotou a máscara nova (`PROJ-2026-0001`, protocolos
      antigos no formato `2026/003` continuam gravados como estão — só os
      novos mudam). A Ouvidoria (Art. 104) manteve o formato visível
      (`OUV-2026-00001-xxxx`, sufixo aleatório contra enumeração — sigilo do
      denunciante) e só trocou a **fonte** do sequencial pra corrigir a
      corrida, sem mudar nada que o denunciante já tenha guardado. `Termo
      nº` da tesouraria (`shared/tesouraria.js`) fica de fora de propósito —
      é numeração contínua por congregação (talão físico), semântica
      diferente de protocolo por tipo/ano.
- [x] **Anexos genéricos** (migração 081, `AnexosGenericos` +
      `api/shared/anexos.js`): catálogo declarativo de qual(is) permissão(ões)
      controla(m) anexo de cada tabela (`Projetos`, `Fornecedores`,
      `ProcedimentosAbandono`, `DenunciasOuvidoria`) — sem entrada no mapa,
      a API recusa (modo seguro). Reaproveita o Blob Storage privado +
      link assinado que já existia (`shared/storage.js::salvarDocumento`/
      `urlDocumentoComSas`, v2.9), não inventa um segundo mecanismo de
      arquivo. `abrirModalAnexos(tabela, registroId, titulo)` no `app/` dá
      upload/lista/exclusão pra qualquer tela com 1 linha — já ligado na
      tela de Fornecedores como prova real (não só uma função pronta sem
      uso). **Processos Disciplinares ficam de fora de propósito** (Art. 45,
      sigiloso — anexo genérico aumentaria risco de exposição sem
      necessidade real).
- [x] Busca global no topo do painel (`api/BuscaGlobal`, campo no
      `.cabecalho-secretaria`): Pessoa, Fornecedor, Lançamento (por Termo
      nº), Projeto e Documento (anexo genérico) — cada fonte só entra se o
      usuário tiver a permissão daquela tela, e Pessoa/Lançamento respeitam
      o escopo territorial (`auth.estaNoEscopo`, mesmo padrão de
      `GestaoPessoas`) — nunca "todo mundo" só porque bateu o texto.
      **Processos Disciplinares e Procedimentos de Abandono ficam de fora**
      (mesmo motivo dos anexos: sigilo, Art. 45). Clicar num resultado abre
      a aba correspondente — não afunila ainda até a linha exata dentro da
      aba (ex: Projeto abre "Reuniões", não já com o órgão CLI
      selecionado); isso é ganho futuro, não bloqueia o valor de achar "em
      qual aba" o dado mora.
- [x] Testado com `npx jest` (56 testes, incluindo 5 novos de `proximoNumero`/
      `gerarProtocolo`/formato preservado da Ouvidoria) e `node --check` em
      todos os arquivos novos e alterados.

## vB.5 — Portal do membro (PWA) e autoatendimento de verdade

"Meu Painel" já existe, mas é uma aba dentro do sistema administrativo. O membro
comum não entra num painel de secretaria — ele entra no celular.

- [x] **Login simplificado pro membro comum** (migração 082,
      `api/shared/codigoAcesso.js`, `SolicitarCodigoAcessoMembro` +
      `ConfirmarCodigoAcessoMembro`): código de 6 dígitos por e-mail, mesmo
      padrão da "Minha Conta" do site (Fase 26) — só que aqui o destinatário
      é sempre uma matrícula real de `MembroReferencia`, não uma conta
      solta. Fecha de caminho um problema que já existia: antes,
      "autoatendimento" era só digitar um número de matrícula (qualquer
      um que soubesse o número de outra pessoa "era" ela); agora tem uma
      opção verificada de verdade, com sessão real (`shared/auth.js::
      criarSessao`, `permissoes: []` — rotas administrativas continuam
      batendo 403 sozinhas). Resposta sempre genérica
      ("se a matrícula existir e tiver e-mail...") pra não vazar quem tem
      conta só de tentar matrícula em sequência.
- [x] **PWA instalável** (`app/manifest.json` + `app/service-worker.js`):
      ícones reais reaproveitados do site (`site/public/favicon-192.png`,
      `logo.png`, `maskable-icon.png` — mesma identidade visual, não um
      ícone inventado). Cache do app-shell (HTML/JS/CSS) com
      network-first-com-fallback — abre mesmo offline/conexão ruim; nunca
      cacheia `/api/*` de propósito (dado real precisa falhar de verdade
      sem rede, não devolver informação velha). Botão "Instalar app no
      celular" (`beforeinstallprompt`) na aba Meu Perfil.
- [x] **Notificação push** (migração 082, `PushInscricoesMembro` +
      `CanalPush` em `NotificacaoRegras`): terceiro canal do motor de
      notificações (vB.2), ao lado do e-mail — WhatsApp continua fora
      (decisão da vB.2, custo de API paga; push web é gratuito). Par de
      chaves VAPID gerado e já configurado como App Setting de produção do
      `app-meusite-web`. `shared/notificacaoMotor.js::enviarCanaisNotificacao`
      centraliza a decisão de canal num único lugar, usado tanto por
      `avaliarRegras` (vB.2) quanto por `escalonarSLAsVencidos` (vB.3) —
      **achado real ao integrar**: o escalonamento de fluxo criava a
      notificação na central mas nunca disparava e-mail nenhum (gap deixado
      na vB.3, corrigido aqui de passagem). Inscrição morta (404/410 —
      desinstalou o app) é removida sozinha na próxima tentativa de envio.
- [ ] **Self-service ampliado — integração encaminhada pra cada fase de
      origem, não fabricada aqui.** As duas peças que **já existem** (Minhas
      Contribuições, v4.1.1; Cartas de Trânsito, vC.3) continuam funcionando,
      sem mudança. As demais não têm módulo de negócio por trás ainda —
      **cada uma recebeu um item de integração registrado na própria versão
      de origem**, pra não ficar esquecida e não precisar de portal novo
      quando chegar a vez:
      - **Minhas escalas** → item registrado na **v5.6** (auto-escalador,
        FASE 5) e na **v7.5** (grade básica, FASE 7).
      - **Inscrições em eventos** → item registrado na **v7.4**/v7.13 (FASE 7)
        — o motor continua sendo do site (decisão vC.2, não duplicar), o
        portal só linka pra ele usando a mesma sessão.
      - **Meus filhos (check-in)** → item registrado na **v7.10** (FASE 7,
        check-in infantil) — autoatendimento é só consulta pro responsável
        legal, o check-in físico continua sendo ação de voluntário.
      - **Minha trilha de discipulado** → não existe módulo nenhum ainda em
        fase nenhuma; registrado como pendência aberta no fim da **FASE 12**
        (última fase do roadmap comprometido hoje), pra a futura fase de
        discipulado nascer já sabendo que precisa disso.
      Em todos os quatro, a infraestrutura desta versão (login simplificado,
      PWA, push) já está pronta — quando a fase de origem chegar, é só ligar
      a tela em "Meu Painel", não é preciso outra versão de portal.
- [x] Testado com `npx jest` (72 testes, incluindo 16 novos: código de
      acesso, canal push, dispatcher único de canais) e `node --check` em
      todos os arquivos novos e alterados.

## 🔒 Trava de Revisão B-A — antes de avançar para a vB.6

- [x] Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da
      seção 3). Auditadas vB.1 a vB.5 pelas 5 perguntas do checklist (15/09).

  **1. Todo código novo roda de ponta a ponta contra o ambiente real?**
  Sim, depois de um achado real (ver pergunta 5). `npx jest` (72 testes,
  suíte inteira) e `node --check` em todos os arquivos `.js` de `api/` e
  `app/` sem erro. Migrações 079-082 idempotentes (`IF NOT EXISTS`/
  `IF OBJECT_ID`) e confirmadas rodando contra o Azure SQL de produção pelo
  CI. Toda rota nova de vB.2-vB.5 conferida rota a rota entre
  `function.json` (back-end) e as chamadas `fetch` de `app/script.js`
  (front-end) — nenhuma divergência de nome.

  **2. Toda tela nova abre e mostra dado de verdade?** Checagem sistemática
  (todo `getElementById(...)` de `app/script.js` contra todo `id="..."`
  existente, estático e gerado dinamicamente) achou só 2 candidatos em 762:
  `caixaSino` (tem fallback por classe `.caixa-sino`, não é bug) e
  `permissaoEscopoTodas` (id inexistente, sem fallback) — investigado e é
  código órfão do **commit inicial do projeto** (função `onChangeEscopoTodas`
  nunca chamada em lugar nenhum), fora do escopo desta trava (não é
  vB.1-vB.5) e sem efeito em produção por nunca ser executado. Nenhum bug
  do tipo "Financeiro" (Trava 4-A) encontrado no código novo.

  **3. README e código continuam narrando a mesma coisa?** Auditoria
  cruzada de vB.1 a vB.5: todas as tabelas citadas (`Notificacoes`,
  `NotificacaoRegras`, `NotificacaoPreferencias`, `TiposFluxo`,
  `FluxoEtapas`, `FluxoInstancias`, `FluxoHistorico`, `AnexosGenericos`,
  `PushInscricoesMembro`, `CartasTransito.ManterAcessoSite`) existem nas
  migrações 079-082 como descrito; todos os módulos de API/front citados
  existem e fazem o que o texto diz; todas as referências cruzadas
  (`v4.16`, `v4.12`, `v4.15`, `v7.12`, `v5.6`, `v7.4`, `v7.5`, `v7.10`,
  `v2.9`) apontam pra seções que existem de verdade. **Uma referência
  morta corrigida**: vB.1 citava `HOMOLOG_BRANCH.md` (nunca existiu) em vez
  de `HOMOLOGACAO.md`.

  **4. O que ficou pra trás foi de fato corrigido, não só anotado?**
  **Achado real e corrigido nesta trava**: `api/NotificacoesAgendador`
  (vB.2) e `api/FluxosEscalonador` (vB.3) foram escritos como
  `timerTrigger` — o Azure Static Web Apps, no modelo gerenciado usado por
  este projeto (decisão vC.5), só aceita `httpTrigger` nas Functions
  internas, e quebrava o build inteiro (`invalid trigger of type
  'timerTrigger'`). Só apareceu agora porque vB.2-vB.5 nunca tinham sido
  enviadas (push) antes desta trava — ver pergunta 5. Corrigido: as duas
  viraram `httpTrigger` protegidas por segredo (`api/shared/cronAuth.js`,
  novo) e acionadas por `.github/workflows/rotinas-diarias.yml` (mesmo
  padrão de `site-event-notifications.yml`), `CRON_SECRET` provisionado
  como App Setting de produção e como GitHub Secret. Nenhum outro
  `timerTrigger`/TODO/gambiarra encontrado no código novo.

  **5. Deploy real, de ponta a ponta, aconteceu?** **Achado real, a
  principal desta trava**: a branch local estava **9 commits à frente de
  `origin/main`** — vB.2, vB.3, vB.4 e vB.5 inteiras (`git push` nunca
  tinha sido feito) nunca passaram por CI nem chegaram perto de produção,
  apesar de marcadas `[x]`. Corrigido: `git push`, CI rodou os testes e as
  migrações 079-082 contra o Azure SQL de produção — a primeira rodada
  falhou no passo "Build And Deploy" pelo motivo da pergunta 4; corrigido,
  commitado, `git push` de novo, CI verde de ponta a ponta (run
  `34977871859`, confirmado com `gh run watch`). Testado ao vivo em
  produção depois do deploy, não só "CI verde": `POST
  /api/notificacoes-agendador-interno` e `POST
  /api/fluxos-escalonador-interno` devolvem `401` sem o segredo e `200`
  com o segredo certo; `gh workflow list` confirma
  `Rotinas diárias (notificações e escalonamento)` registrado e ativo;
  `https://app.ieadespa.org.br/` continua no ar (200) sem regressão.

## vB.6 — Documento institucional: geração, assinatura e arquivo

- [x] **Geração de PDF no servidor** (`api/shared/pdfInstitucional.js`,
      `pdfkit` — sem dependência nova pesada, puro JS): cabeçalho/rodapé
      institucional padrão (nome oficial, protocolo, emitido em, data/hora —
      mesmo padrão que o v10.5 já previa pra relatório impresso, essa é a
      implementação de referência). Ligado de verdade num documento real
      que o sistema já emite, não só a lib pronta sem uso: `api/CartaPdf`
      (`GET /api/cartas/{id}/pdf?matricula=...`) reproduz **exatamente** o
      mesmo conteúdo que `renderizarImpressaoCarta` já imprime via
      `window.print()` — só que gerado no servidor, sai igual em qualquer
      máquina. Reaproveita o protocolo institucional único da vB.4
      (`gerarProtocolo(pool, "CARTA")`, migração 083 — `CartasTransito.
      Protocolo`), gerado sob demanda na 1ª vez que a carta é baixada em
      PDF, nunca antes (rascunho nunca "gasta" número).
- [x] **Minuta de ata pré-preenchida — não a ata final** (`api/MinutaAta`,
      `.docx` real via `docx`): presença, ausência (com justificativa),
      quórum e resultado de votação (Enquetes vinculadas à sessão) exportados
      prontos, com espaço em branco pra "Deliberação" o Secretário preencher
      — a decisão da v2.9 de nunca gerar a ata final continua de pé, só
      elimina a redigitação do que já está no banco. **Achado real ao
      construir**: `Sessoes.QuorumAtingido` (coluna do schema desde a FASE 0)
      **nunca foi escrito por nenhum código** — nem `EncerrarReuniao` nem
      nenhuma outra Function grava nela; é coluna morta. A minuta não
      confia nela: recalcula quórum de verdade a partir de `Presencas` +
      `shared/universo.js::universoDoOrgao` + `shared/estatuto.js`
      (`avaliarQuorumInstalacao` pra ASSEMBLEIA_GERAL/CLI,
      `avaliarQuorumReformaDestituicao` quando a sessão está marcada como
      reforma de núcleo fundamental) — e só afirma um veredito formal
      "atingido: sim/não" onde a regra estatutária é conhecida; pros demais
      órgãos, mostra só os números crus (presentes/universo), sem inventar
      threshold que a lei não define pra eles.
- [x] **Assinatura eletrônica interna com trilha** (migração 083,
      `TermosAssinados.HashConteudo`): hash SHA-256 do texto do termo
      gravado no momento da assinatura (`api/GestaoTermos`, reaproveitando
      `shared/auditoria.js::sha256` — sem lib nova). `api/
      VerificarTermoAssinado` (`shared/assinaturaInterna.js`, lógica pura
      testada à parte) recomputa o hash do texto ATUAL do catálogo e
      compara — pega duas coisas que uma trilha sem hash nunca pegaria:
      catálogo mudou o texto sem trocar `VersaoTermo` (inconsistência real)
      ou a versão assinada já foi substituída. Assinaturas de antes desta
      versão ficam `SEM_HASH_ANTIGO` (não dá pra recalcular hash de texto
      que não foi capturado — reforço daqui pra frente, não retroativo).
      Continua **nunca** substituindo assinatura de ata com fé pública
      (ICP-Brasil/GOV.BR) — é só pra termos/aceites internos
      (voluntariado, políticas, aceite do Estatuto na vB.11). Sem tela
      própria ainda (API pronta, uso hoje é auditoria/suporte — não existe
      nenhuma lista de "meus termos assinados" no `app/` pra pendurar um
      botão "Verificar", então não forcei um).
- [x] **Arquivo institucional com tabela de temporalidade** (migração 083):
      `PoliticasRetencao` (v0.1) tinha **zero código consumindo ela** até
      aqui — nenhum CRUD, nenhuma tela, as 5 linhas seed da migração 012
      eram as únicas possíveis desde sempre. `api/GestaoPoliticasRetencao`
      (nível Global) dá CRUD de verdade; `Documentos.Categoria` e
      `AnexosGenericos.Categoria` (FK por nome, `UNIQUE` nova em
      `PoliticasRetencao.Categoria`) linkam documento real → política, com
      `shared/retencao.js::calcularStatusRetencao` computando
      VIGENTE/VENCIDO/INDETERMINADO **na leitura** — nunca expurgo
      automático (decisão da v0.1 continua de pé, mesmo espírito do prazo
      de lavratura/cartório que `GestaoDocumentos` já calculava só pra
      Ata). Migração já categoriza retroativamente toda Ata existente
      (`Tipo = 'ATA'` → categoria "Atas e Registros de Sessão/Presença",
      a mesma que a v0.1 já previa pra isso). Tela de administração das
      políticas na aba Arquivos/Documentos; seletor de categoria no
      formulário de Documentos — **`AnexosGenericos` ficou só com suporte
      de API** (campo `categoria` aceito, `statusRetencao` calculado), sem
      seletor no modal de anexos ainda (seletor de Documentos já prova o
      mecanismo ponta a ponta; duplicar pro modal genérico é ganho
      marginal agora).
- [x] Testado com `npx jest` (80 testes, incluindo 8 novos: integridade de
      assinatura interna e status de retenção) e `node --check` em todos os
      arquivos novos/alterados. O PDF (`shared/pdfInstitucional.js`) e o
      `.docx` (`MinutaAta`) foram conferidos à parte, fora do jest: geração
      real de ponta a ponta com dado de exemplo, arquivo salvo em disco e
      assinatura de bytes verificada (`%PDF` / `PK`, respectivamente) —
      prova que os dois formatos saem válidos, não só que o código não
      lança exceção.

## vB.7 — Painel inicial por perfil (dashboard)

- [x] `api/shared/painelBlocos.js` + `api/PainelInicial` (`GET
      /api/painel-inicial`): **zero cálculo novo, só reunião** — igual o
      texto original desta versão já pedia. Blocos "sempre meus" (contagem
      de notificações não lidas — vB.2 — e minhas tarefas atrasadas —
      `shared/workflow.js::listarFluxosDoUsuario`, vB.3) mais 3 blocos
      baseados em detector (Seguros vencendo, Prestação de contas atrasada,
      Repasse parado no malote — os mesmos 3 de `shared/
      notificacaoDetectores.js`, vB.2). **A regra de "quem vê o quê" é a
      MESMA `NotificacaoRegras.PermissaoAlvo`/`NivelAlvo` que decide quem
      recebe a notificação equivalente** — o painel de alguém mostra
      exatamente os blocos das notificações que ela receberia, sem uma
      segunda regra de visibilidade inventada só pro dashboard. Isso já
      entrega o "cada perfil vê o que importa pra ele" do texto original
      (Dirigente/Pastor de Área não têm nenhuma regra hoje com
      `PermissaoAlvo` diferente de `financeiro`+`GLOBAL`, então não veem
      os 3 blocos de detector — quando um detector novo for registrado
      pra outro perfil, aparece aqui automaticamente, sem tocar no painel).
- [x] Bloco de UI (`app/`, sub-aba "Meu Perfil") só aparece quando há algo
      com valor > 0 — nunca mostra fileira de zeros. Clicar num bloco
      navega pra tela de origem (`irParaBlocoPainel`) — mesma limitação
      honesta já registrada na busca global (vB.4): abre a aba/sub-aba
      certa, não afunila até a linha exata.
- [x] Testado com `npx jest` (83 testes, incluindo 3 novos: visibilidade
      de bloco por regra ativa/permissão/nível) e `node --check`.

## vB.8 — LGPD: corrigir a base legal e fechar as lacunas

Achado da pesquisa jurídica: o sistema pede **consentimento** para tratar dados de
membro, mas a LGPD (Art. 11, II, "a") **dispensa o consentimento** justamente para
organização religiosa tratar dado de pessoa com vínculo regular. Usar base legal
errada é um problema real: cria obrigação que a lei não impõe (e que trava o
sistema quando a pessoa não consente) e desprotege o que a lei de fato exige —
**a vedação de compartilhamento com terceiros**, que hoje não tem trava nenhuma.

- [x] **Revisada a base legal por finalidade — achado real corrigido**: o
      direito de acesso do titular (`MeusDadosLGPD`, LGPD Art. 18) estava
      **travado atrás de um consentimento** desde a v1.9 — "conceda o
      consentimento antes de ver seus próprios dados", inclusive dados
      básicos (nome, datas). Base legal errada de propósito duplo: o
      direito de acesso NUNCA depende de consentimento, e o dado básico de
      membresia em si é Art. 11, II, "a" (organização religiosa, vínculo
      regular — dispensa consentimento). Corrigido: `MeusDadosLGPD` não
      checa mais nenhum consentimento pra devolver o cadastro; o checkbox
      único que existia (`ConsentimentosLGPD.Tipo='DADOS_CONTATO'`) voltou
      a significar só o que sempre devia — uso de foto/telefone/e-mail pra
      contato (`GestaoConsentimentoLGPD`, `app/index.html`, rótulo
      reescrito). Nada foi liberado além do necessário: Foto continua
      exigindo consentimento de verdade.
- [x] **Bloqueio técnico de compartilhamento externo — achado real**: a
      exportação do rol de membros (v1.8) era **100% client-side**, sem
      nenhuma chamada ao servidor — zero trilha de auditoria possível,
      porque nenhum código de back-end rodava. `api/ExportarPessoas` (`POST
      /api/pessoas/exportar`) vira porta de entrada obrigatória antes de
      gerar a planilha: registra em `AuditLog` quem exportou, quantas
      linhas e quais colunas, e **recusa** (403) exportar em massa
      telefone/e-mail/endereço/data de nascimento pra quem não é nível
      Global — o modal (`app/`) já nem oferece essas colunas pra quem não
      tem o nível (defesa em profundidade: cliente não oferece, servidor
      recusa de novo se tentarem direto).
- [x] **ROPA + RIPD — não existia nada disso, catálogo novo**
      (`api/shared/ropa.js`, `api/shared/ripd.js`, `api/GestaoRopa`,
      permissão `protecaodedados`): curado à mão por atividade de
      tratamento real (Membresia, Foto, Disciplina, Financeiro,
      Comunicação, Vínculo Familiar/Menor, Auditoria) — a única parte
      automática é a contagem real de registros por tabela (nunca
      desatualiza sozinho sem alguém perceber). RIPD cobre só os
      tratamentos de risco que **existem de verdade** hoje (Foto, Dado de
      Menor) — Nota Pastoral e Dado de Saúde em Evento entram como "N/A
      hoje" (sem tabela, sem sistema — nada fabricado), com nota de que a
      v7.10 (check-in infantil) já prevê o segundo.
- [x] **Retenção que executa — primeira política do catálogo a acionar
      minimização de verdade** (migração 084, `shared/minimizacaoLgpd.js`):
      a minimização de 30 dias pós-Carta de Mudança (Reg. Art. 132 §2º) já
      existia desde a v1.5, mas o prazo estava **hardcoded no código**, sem
      nenhuma relação com `PoliticasRetencao` (que, desde a v0.1, nunca
      executava nada — só catálogo informativo). Extraída a lógica de
      `GestaoCartas` pra um módulo reaproveitável; o prazo agora vem da
      política nova "Dados de Ex-Membro (pós-Carta de Mudança)" (30 dias,
      com o mesmo fallback de 30 se a política for desativada por engano —
      nunca destrava um prazo maior sozinho). Mesma regra de ouro de
      sempre: zera dado operacional (contato, cargo, vínculo territorial),
      preserva o Registro Histórico Mínimo (nome, matrícula, datas,
      motivo/data de saída) — nunca apaga o que o Regimento exige manter.
- [x] **Achado real fora do escopo original, corrigido de passagem**: a aba
      Proteção de Dados já tinha uma **segunda tela** editando
      `PoliticasRetencao` — o catálogo genérico de `GestaoCatalogos`,
      aberto a qualquer um com a permissão "pessoas" (não nível Global).
      Duas telas, duas permissões diferentes, para a mesma tabela sensível
      — removida a entrada de `GestaoCatalogos` (front e back), a aba
      Proteção de Dados passou a chamar a mesma tela nível-Global da vB.6
      (`carregarPoliticasRetencao`, agora parametrizada por container).
- [x] Testado com `npx jest` (88 testes, incluindo 5 novos: minimização
      lê a política real e nunca destrava prazo maior sozinha, contagem
      real do ROPA) e `node --check` em todos os arquivos alterados.

## vB.9 — Acesso: delegação, sessão e revisão periódica

- [x] **Delegação temporária** (migração 085, `DelegacoesAcesso`,
      `api/shared/delegacoes.js`, `api/GestaoDelegacoes`): "vou viajar, o 2º
      Secretário responde por mim" **sem emprestar senha** — o delegado
      continua entrando com a PRÓPRIA matrícula; a sessão dele só passa a
      somar (nunca substituir) a permissão+escopo do papel delegado, por um
      prazo obrigatório. Resolve o problema de raiz sem inventar um segundo
      campo de auditoria "agindo como X": toda ação continua com o
      `usuarioId` real de quem clicou (nunca mais "a pessoa errada"), porque
      o delegado nunca precisa da identidade de outra pessoa pra agir.
      Delegar só o próprio papel (`Lideranca` verificada por dono), nunca o
      de terceiro. Tela "Segurança" em Meu Painel.
- [x] **Corrigido o achado da v4.5** (`LoginSecretaria`) — **achado real,
      pior do que o README descrevia**: não só o critério de escolha entre
      papéis múltiplos era indefinido (sem `ORDER BY`/`TOP 1`, o SQL Server
      devolvia em ordem arbitrária), como isso podia **travar o login por
      completo** se a linha sorteada não tivesse `SenhaHash` preenchido.
      Corrigido: confere a senha contra TODAS as linhas de `Lideranca` da
      matrícula, e entre as que baterem, escolhe a de **maior amplitude
      territorial** (`RANKING_NIVEL`, agora exportado de `shared/auth.js` —
      antes só uso interno da alçada de valor da v4.5).
- [x] **Revisão periódica generalizada** (`shared/compliance.js`) — a
      recertificação de acessos (v4.12) só cobria a permissão `financeiro`,
      hardcoded. **Achado real ao generalizar**: o `EXISTS` que evitava
      pendência duplicada checava só `MembroId`, nunca `Permissao` — alguém
      com 2 permissões distintas só recebia recertificação pendente pra
      uma delas. Corrigido: 1 pendência por (membro, permissão), todas as
      permissões de todos os papéis. **"Expira" ganhou efeito real pela
      primeira vez**: antes, `Status = 'EXPIRADA'` só existia num painel de
      compliance, sem tocar em nada — agora `LoginSecretaria` remove da
      sessão nova qualquer permissão cuja recertificação mais recente esteja
      expirada, até alguém confirmar de novo.
- [x] **Trilha de sessão** (migração 085, `SessoesAtivas`) — dispositivo
      (User-Agent) e data de criação de cada login, tela "Minhas Sessões"
      com botão "Encerrar". **Limitação real, documentada, não escondida**:
      o modelo de autenticação (`shared/auth.js`) é *stateless* de
      propósito — token HMAC validado sem tocar o banco, usado hoje por
      **~140 Functions** (`auth.exigirLogin`/`exigirPermissao`/etc.), todas
      chamando de forma síncrona, sem `await`. Fazer "encerrar sessão"
      bloquear a próxima requisição de verdade exigiria tornar
      `exigirLogin` assíncrono e re-tocar as ~140 chamadas — risco
      desproporcional pra esta versão, sem forma de testar de ponta a ponta
      contra produção real neste momento. Escopo consciente: `criarSessao`/
      `encerrarSessao` (só 3-4 pontos de chamada) viraram assíncronas e
      passaram a gravar/marcar `SessoesAtivas`; "encerrar" marca a trilha e
      tira da lista de sessões ativas, mas o token em si só perde validade
      de verdade quando expira sozinho (12h, já curto). Entra como trabalho
      futuro dedicado, não fabricado aqui.
- [x] Testado com `npx jest` (104 testes, incluindo 16 novos: sessão grava/
      marca a linha certa, delegação nunca aceita papel alheio/prazo
      passado, recertificação por permissão não duplica nem falta) e
      `node --check` em todos os arquivos alterados.

## vB.10 — Acessibilidade, inclusão e primeiro uso

- [x] **Acessibilidade real (WCAG 2.1 AA) — achados reais corrigidos**:
      `--cor-secundaria`/`--cor-secundaria-hover` (dourado) nunca tinham sido
      auditados como cor de TEXTO — `.btn-aba-destaque` usava
      `--cor-secundaria-hover` (`#A6851E`) como `color` num fundo quase
      branco, ~3:1 de contraste (reprova 4.5:1 da AA). Corrigido com um
      token novo (`--cor-secundaria-texto: #8f6f1f`) — mesmo valor que o
      site institucional já usa pro mesmo problema (`site/src/lib/
      certificado.ts`), consistência de marca entre os dois. Foco de
      teclado: inputs tinham `outline: none` com só troca de cor de borda
      como substituto (sutil demais) — ganhou anel visível
      (`box-shadow`) + regra `:focus-visible` genérica **igual ao padrão já
      testado do site institucional** (`site/src/styles/global.css` —
      `outline: 2px solid var(--accent)`, mesma cor/medida, não uma segunda
      convenção inventada aqui: achado corrigido depois que o usuário
      perguntou se o site tinha sido reaproveitado como base — só a cor já
      tinha sido, o anel de foco não). Os 3 pontos que geram `.card-modulo`
      (cards de módulo, clicáveis por `onclick` num `<div>`) não eram
      operáveis por teclado — sem `tabindex`, Tab nunca parava neles;
      ganharam `tabindex="0" role="button"` + `Enter`/`Espaço` via
      `ativarComTeclado()`. **Modo de leitura fácil** (`html[data-readable=
      "true"]`) — mesmo mecanismo do site (fonte base 16px→20px, mais
      espaçamento entre linhas, foco mais grosso, tudo escalando junto
      porque o CSS já usa `rem`), com botão "Aa+" no cabeçalho e preferência
      em `localStorage` — endereça direto "há membros idosos" do texto
      original desta versão, que a primeira rodada tinha deixado de fora.
      Tamanho de fonte de base já estava majoritariamente em `rem` (38
      ocorrências contra 3 em `px`) — não mexido, já estava OK.
      Leitor de tela/Libras: fora do escopo desta rodada (auditoria de
      `aria-*`/rótulos é maior que cabe aqui — ver nota abaixo).
- [x] **Ajuda contextual e primeiro uso** — não existia nada disso (3
      `title=` isolados no sistema inteiro). Botão "❓" fixo no cabeçalho
      (mesmo padrão do sino/busca — sempre visível, qualquer aba) mostra uma
      dica específica da tela atual (`AJUDA_POR_ABA`, cobertura parcial de
      propósito — cresce 1 entrada por vez, nunca aparece vazio: sem entrada
      própria, cai num texto genérico). Banner de primeiro acesso (some
      sozinho depois de fechado, via `localStorage`) explica o layout geral
      (menu por permissão, sino, busca, ajuda) pra quem nunca usou o
      sistema.
- [x] **Mensagens de erro em linguagem de secretaria — achado real, escala
      maior que o esperado**: 68 arquivos (104 ocorrências) usavam
      `{ erro: "..." }` como corpo de resposta de erro — formato
      **incompatível** com o que o front-end lê (`data.mensagem`/
      `data.sucesso`, usado por `avisarResultado`/`mostrarToast` em toda
      parte). Na prática, quem batesse numa dessas rotas (majoritariamente
      o fallback de "método/rota não suportado", mas também validações 400
      reais) via um toast **vazio/undefined** em vez da mensagem certa que
      já tinha sido escrita — não era falta de mensagem boa, era mensagem
      boa que nunca chegava a aparecer. Corrigido em massa (mesma chave
      renomeada, texto preservado, verificado com `node --check` nos 67
      arquivos + suíte inteira). Além disso: **rede de segurança global**
      nova no front-end (`app/script.js`) — falha de rede em
      `fetchProtegido` (sem internet, servidor fora do ar) e qualquer
      promessa rejeitada sem tratamento local (`window.addEventListener
      ("unhandledrejection", ...)`) agora mostram um toast em linguagem de
      secretaria ("Algo deu errado... avise a equipe técnica") em vez de o
      botão simplesmente não fazer nada. De propósito **sem** um
      `window.onerror` genérico — pegaria erro de script de terceiro (CDN)
      e confundiria mais do que ajudaria.
- [x] Testado com `npx jest` (104 testes, sem regressão — a mudança de
      formato de erro é mecânica, verificada com `node --check` nos 67
      arquivos alterados, não com teste novo) e `node --check` em
      `app/script.js`.

## 🔒 Trava de Revisão B-B — antes de avançar para a vB.11

- [x] Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da
      seção 3). Auditadas vB.6 a vB.10 pelas 5 perguntas do checklist
      (15/09). Marca também a fronteira dentro da própria FASE B:
      vB.1-vB.10 são infraestrutura pura (não têm módulo de negócio pra
      "usar" na prática ainda); vB.11 em diante são retrofit de negócio das
      fases 0-3.

  **1. Todo código novo roda de ponta a ponta contra o ambiente real?**
  Sim — `npx jest` (104 testes, suíte inteira) e `node --check` em todo
  `.js` de `api/`/`app/`/`site/` sem erro. Migrações 083-085 idempotentes
  (`IF NOT EXISTS`) e as 6 rodadas de CI (vB.6 a vB.10 + o commit de
  correção) confirmadas em `success`, migrações reais rodando contra o
  Azure SQL de produção a cada uma — nenhuma repetiu o achado da Trava B-A
  (`grep` confirma **zero** `timerTrigger` em todo `api/`, só
  `httpTrigger`). Toda rota nova conferida rota a rota entre
  `function.json` e as chamadas `fetch` de `app/script.js` (`cartas/.../
  pdf`, `pessoas/exportar`, `delegacoes`, `politicas-retencao`, `lgpd/
  ropa`, `termos`, `termos-conducao`, `lgpd/meus-dados`, `reunioes/.../
  minuta`, `painel-inicial`, `minhas-sessoes`) — nenhuma divergência.
  `shared/pdfInstitucional.js` testado de novo agora, isolado: gera PDF
  real (`%PDF`, 2010 bytes), não só "não lança exceção".

  **2. Toda tela nova abre e mostra dado de verdade?** Checagem sistemática
  de `getElementById` (779 chamadas) contra todo `id` existente (989,
  estático + gerado dinamicamente) — mesmos 2 falsos positivos já
  investigados na Trava B-A (`caixaSino` com fallback por classe,
  `permissaoEscopoTodas` órfão do commit inicial, fora do escopo de
  vB.1-vB.10), **nenhum bug novo**.

  **3. README e código continuam narrando a mesma coisa?** Auditoria
  cruzada de vB.6 a vB.10: todos os 18 módulos de API citados existem e
  fazem o que o texto descreve; migrações 083-085 batem campo a campo;
  todas as referências cruzadas (`v10.5`, `v2.9`, `v1.9`, `v1.8`, `v4.12`,
  `v4.5`, `v0.1`, `v7.10`) apontam pra seções reais. Atenção especial às 3
  limitações conscientes documentadas (não bugs escondidos) — todas batem
  com o código: `VerificarTermoAssinado` (vB.6) não tem nenhuma chamada em
  `app/` (sem tela mesmo, como o texto diz); `Sessoes.QuorumAtingido`
  (vB.6) tem **zero** ocorrências de escrita em todo `api/` (coluna morta
  confirmada); `exigirLogin`/`exigirPermissao` (vB.9,
  `api/shared/auth.js`) continuam síncronas e nunca consultam
  `SessoesAtivas` (token só expira sozinho, como o texto assume).

  **4. O que ficou pra trás foi de fato corrigido, não só anotado?** Nenhum
  `TODO`/`FIXME`/gambiarra novo encontrado no diff de vB.6-vB.10. O achado
  da Trava B-A (timerTrigger) não se repetiu — toda função nova já nasceu
  `httpTrigger`. Mass-fix de mensagens de erro da vB.10 (67 arquivos)
  conferido: só sobram `{ erro: ... }` em `shared/mockDb.js` (helper de
  teste, não resposta HTTP) e em `shared/cronAuth.js` (rota
  serviço-a-serviço da Trava B-A, sem toast de usuário — não precisa do
  formato `mensagem`), nenhum esquecido por engano.

  **5. Deploy real, de ponta a ponta, aconteceu?** Sim, sem achado desta
  vez — diferente da Trava B-A, a branch já estava sincronizada com
  `origin/main` no início desta trava (aprendizado aplicado: cada versão
  de vB.6 a vB.10 foi enviada e implantada na hora, não acumulada).
  `gh run list` confirma `success` nos 6 commits (`4c5aba4` vB.6,
  `c0fa50a` vB.7, `3b4170d` vB.8, `e82b6b6` vB.9, `fa3d0be`+`3a09699`
  vB.10). Testado ao vivo agora: `https://app.ieadespa.org.br/` no ar
  (200), `GET /api/painel-inicial` sem sessão devolve `401` (rota nova
  protegida corretamente, sem regressão).

## vB.11 — Esteira de Batismo *(retrofit da FASE 1, gap da varredura normativa)*

> **O Regimento cita este sistema nominalmente.** O Art. 80 §2º, V condiciona a
> aptidão ao batismo ao preenchimento de "formulário eletrônico com caixa de
> aceite do Estatuto e do Regimento" no **"Sistema Oficial de Gestão da
> IEADESPA"**. De todos os dispositivos varridos, este é o único que não apenas
> pode ser atendido pelo sistema — ele **exige** que o sistema exista. E é
> justamente a peça que nunca foi construída: hoje o batismo só aparece como
> `DataBatismo` preenchida **depois**, sem nenhum processo antes.

A FASE 1 tratou admissão (v1.1), integração (v1.2), categorias (v1.3), trânsito
(v1.4) e perda (v1.5) — mas o **ato que produz o membro** ficou de fora. Fica
aqui na FASE B, e não dentro da FASE 1 já entregue, porque a FASE 1 está
fechada — é retrofit, não reabertura.

- [x] **Turma de batismo** (migração 086, `TurmasBatismo`+`OficiantesBatismo`,
      `api/GestaoTurmasBatismo`, permissão `consagracoes`): data, local,
      autorização da Mesa, oficiantes. **Calendário semestral (maio/outubro,
      §3º I) e vedação de rio/represa (§3º II-III) validados no servidor**
      (`shared/batismo.js::mesValidoParaTurma`/`localPermitido`), não só
      documentados — `POST` recusa qualquer outro mês ou `TipoLocal` fora
      de `TEMPLO`/`OUTRO_APROVADO`.
- [x] **Checklist de aptidão calculado, não digitado** (Art. 80 §2º,
      `shared/batismo.js::calcularAptidaoBatismo`, recalculado a cada
      leitura, nunca um bit salvo): (I) idade mínima 12 anos via
      `estatuto.js::idadeEm`; (II) certidão de casamento civil — só exigida
      de quem está `EstadoCivil = 'UNIAO_ESTAVEL'`, cruzando com
      `Casamentos.Modalidade`/`RegistradoCartorio` (v1.9); (III) parecer de
      vida pregressa (`FAVORAVEL`/`DESFAVORAVEL`, registrado por quem
      administra o processo); (IV) conclusão do Curso de Discipulado —
      **atestação manual até a v6.9 existir de verdade** (trilha de
      formação como entidade real), documentado no próprio retorno da API
      e registrado como pendência na v6.9 — não fabricado aqui. *(v6.9:
      entregue — quando uma trilha é configurada como requisito
      `BATISMO_DISCIPULADO`, o item é verificado pela conclusão real e a
      atestação manual deixa de valer; sem trilha configurada, continua
      manual, dito no retorno. Ver v6.9.)*
- [x] **Aceite eletrônico do Estatuto e do Regimento** (§2º, V,
      `shared/batismo.js::registrarAceiteEstatuto`): reaproveita a MESMA
      tabela/trilha de hash de `TermosAssinados` (vB.6) — texto fixo,
      versão, `HashConteudo` — mas **fora** do catálogo `shared/termos.js`
      de propósito: aquele catálogo gate-ia login de Lideranca
      (`exigirLogin`→`termosPendentes`), e aceite de membresia não pode
      virar pendência de acesso administrativo pra quem não tem nada a ver
      com isso.
- [x] **Efetivação automática** (`shared/batismo.js::efetivarTurma`,
      chamada quando a turma vira `REALIZADA`): todo candidato `APROVADO`
      daquela turma vira `SituacaoMembro = 'EM_COMUNHAO'` (Art. 7º, II — a
      mesma regra que `estatuto.js` já usa em capacidade eleitoral),
      `DataBatismo`/`FormaAdmissao='BATISMO'` preenchidos pelo próprio
      fluxo — nenhuma digitação posterior. Realizar exige autorização da
      Mesa já registrada (Art. 80 §1º), senão recusa com mensagem clara.
- [x] Candidato reprovado **nunca recomeça o cadastro** — a `UNIQUE
      (MembroId)` em `CandidatosBatismo` é 1 linha por matrícula pra
      sempre; reprovar só zera `TurmaId` e volta `Status` a
      `AGUARDANDO_TURMA`, motivo registrado, pronto pra entrar na turma
      seguinte. Turma cancelada devolve os `APROVADO` dela pra fila do
      mesmo jeito.
- [x] Testado com `npx jest` (116 testes, incluindo 12 novos: os 4 itens de
      aptidão isolados, as duas vedações do §3º, efetivação só dos
      aprovados) e `node --check` em todos os arquivos novos.

## vB.12 — Apresentação de Crianças *(retrofit da FASE 1, gap da varredura normativa)*

Mesmo lugar de Casamentos na FASE 1 original (é o outro rito de família
previsto pelo Regimento, e a v1.9 base já cobre Casamentos) — mas a FASE 1 já
está fechada, então o ato entra aqui como retrofit, não como reabertura.

- [x] **Registro de Apresentação de Crianças** (Reg. Art. 82): oficiante, pais,
      modalidade **solene ou reservada**, com **aptidão calculada**:
      impedimento por união estável sem certidão ou por disciplina em curso dos
      pais (§2º, I), preferência de **até 90 dias de vida** e **vedação acima
      de 1 ano completo** (§3º, I-II). Ato reservado **não gera certificado**
      (§2º, II, "b") — a regra fica no sistema, não na lembrança de quem emite.

  Implementado: `sql/migrations/087_apresentacao_criancas.sql` cria
  `ApresentacoesCrianca` — a criança normalmente NÃO é `MembroReferencia`
  (é recém-nascida), então **não** reaproveita `VinculosFamiliares` (lá os
  dois lados são `NOT NULL REFERENCES MembroReferencia`); tabela própria com
  `MembroIdPai`/`MembroIdMae` opcionais (ao menos um exigido por `CHECK`),
  mesmo padrão "membro OU nome livre" que `Casamentos` já usa pro cônjuge —
  aqui simplificado pra FK opcional porque não há um "nome livre" de pai/mãe
  sem matrícula fazendo sentido pro caso comum (retrofit: cobre o caso real,
  não documenta hipótese que não ocorre).

  `shared/apresentacaoCriancas.js` — aptidão **calculada na leitura**
  (nunca marcação manual, mesmo princípio de `shared/batismo.js`):
  reaproveita `shared/disciplina.js::membrosSobDisciplina()` (disciplina em
  curso) e `shared/batismo.js::possuiCasamentoCivilRegistrado()` (união
  estável sem certidão) — nenhuma lógica duplicada, ambas já existiam prontas
  de v3.4/vB.11. Idade usa `estatuto.js::idadeEm()` (vedação de 1 ano
  completo, bloqueante) e `estatuto.js::diasDesde()` (janela preferencial de
  90 dias, só aviso — não bloqueia, mesmo padrão não-bloqueante de
  `GestaoCasamentos::avisoJanelaHabilitacao()`).

  `GestaoApresentacaoCriancas` (GET/POST/DELETE `/api/apresentacoes-crianca`)
  — permissão `"pessoas"`, mesmo esqueleto de `GestaoCasamentos`; o POST
  recalcula a aptidão e **recusa registrar** apresentação já vedada por
  idade ou impedimento dos pais, mesmo que só a Secretaria esteja lançando
  (a regra não depende de quem opera lembrar dela). `ApresentacaoCriancaPdf`
  (GET `/api/apresentacoes-crianca/{id}/pdf`) emite o certificado — **recusa
  na 1ª linha se a modalidade for RESERVADA** (§2º, II "b" checado em
  código, não só documentado), protocolo institucional gerado sob demanda
  (mesmo padrão de `CartaPdf`, nunca antes da 1ª emissão).

  Frontend: nova aba "👶 Apresentação de Filhos" no Perfil da Pessoa, ao
  lado de "💍 Casamentos" (mesmo lugar do rito de família irmão) — como não
  existe campo de sexo/gênero em `MembroReferencia` pra inferir automatico
  se o perfil aberto é o pai ou a mãe, a Secretaria escolhe explicitamente
  ("Este perfil é o pai/a mãe") e informa a matrícula do outro, se for
  membro.

  Testado com `npx jest` (127 testes, incluindo 11 novos: modalidade/
  certificado, os 4 cenários de impedimento dos pais — nenhum, disciplina,
  união estável sem/com certidão — e os 4 cenários de aptidão por idade/
  janela preferencial) e `node --check` em todos os arquivos novos.

## vB.13 — Credenciamento de Assembleia *(retrofit da v2.1, Reg. Art. 142-143)*

A v2.1 base já tem `RegistrarPresenca` barrando quem não está no
`universoDoOrgao`, o que resolve o caso central — mas essa versão está
fechada, então o refinamento fica aqui. O Regimento Art. 142-143 descreve um
**controle de porta** mais fino, que o sistema ainda não modela, e que na
prática é feito por uma pessoa conferindo lista impressa na entrada:

- [x] **Lista de impedidos, calculada e com motivo legível.** Art. 142-143
      arrola quem não entra: não-membro, membro sob disciplina em curso, e
      **quem já teve carta de mudança expedida** (deixou de pertencer àquela
      congregação, mesmo que ainda não tenha sido recebido na nova). O último
      caso é o que mais escapa hoje, porque a carta de mudança é um evento que
      o sistema já registra (v1.x) mas que não entra na conta de elegibilidade.
      Continua o princípio de sempre: **não existe marcação "impedido"** — o
      endpoint devolve, pra cada nome recusado, *qual* artigo o recusou, para a
      mesa poder responder ao interessado na hora sem abrir o processo dele.
- [x] **Mesa de credenciamento com trilha.** Registrar quem operou o
      credenciamento, o horário de cada check-in e as recusas (com motivo) —
      hoje a recusa simplesmente não deixa rastro, o que é ruim justamente no
      caso em que alguém contesta depois ("eu estava lá e não me deixaram
      entrar"). É o que a literatura de governança deliberativa chama de
      *credentials report*: em Robert's Rules of Order (11ª/12ª ed., EUA, a
      referência procedimental mais usada no mundo para assembleias), a
      **Credentials Committee** apresenta ao plenário, antes de qualquer
      votação, o número de credenciados — e é **esse relatório aprovado**, não
      a lista de presença bruta, que fixa a base de cálculo do quórum.
      Aqui o equivalente é: o sistema emite o *relatório de credenciamento*
      no momento da instalação, e ele congela a base sobre a qual as maiorias
      dos Art. 21 e 23 §1º são calculadas.
- [x] **Procuração / representação — decidir explicitamente que não existe.**
      Vale registrar por escrito no próprio sistema (mensagem na tela de
      credenciamento) que voto por procuração não é admitido, porque é a
      dúvida número um em assembleia de associação. Base: o voto em assembleia
      associativa é personalíssimo salvo previsão estatutária expressa
      (CC art. 59 e o regime de deliberação dos arts. 44-61), e o Estatuto
      aqui não prevê. Sem isso escrito, a mesa improvisa caso a caso.

  Implementado: `sql/migrations/088_credenciamento_assembleia.sql` cria
  `CredenciamentosAssembleia` (cada tentativa operada pela mesa —
  credenciado ou recusado, com o artigo, quem operou e quando — o
  `RegistrarPresenca` de auto-atendimento da v2.1 continua existindo do
  jeito que está, sem alteração) e `RelatoriosCredenciamento` (1 por
  sessão, `UNIQUE(SessaoId)`).

  `shared/credenciamento.js` — motivo **sempre calculado**, nunca marcado
  à mão: reaproveita `shared/disciplina.js::membrosSobDisciplina()`,
  `shared/universo.js::membrosComCartaMudancaEmitida()` e
  `shared/estatuto.js::calcularCapacidadeEleitoral()` — as mesmas três
  peças que `universoDoOrgao` já compõe pro ramo `ASSEMBLEIA_GERAL`,
  sem duplicar regra nenhuma. Prioridade do motivo: carta de mudança
  (Art. 142, III) > disciplina em curso (Art. 142, II) > capacidade
  eleitoral geral/período de integração (Art. 142, I). Por isso o
  credenciamento formal fica restrito a sessões da Assembleia Geral —
  essas regras não fazem sentido pra CLI/reuniões territoriais, que têm
  universo próprio; fora da Assembleia, `RegistrarPresenca` já resolve.

  `GestaoCredenciamento` (GET/POST `/api/credenciamento/{sessaoId}` e
  POST `/{sessaoId}/relatorio`) — autenticado (`exigirAlgumaPermissao`,
  não anônimo como `RegistrarPresenca`, porque a trilha só vale alguma
  coisa se a mesa estiver identificada): lista impedidos calculados,
  credencia/recusa uma matrícula com trilha completa em
  `CredenciamentosAssembleia` + `registrarAuditoria`, e credenciamento
  bem-sucedido também insere em `Presencas` (evitando duplicar se a
  pessoa já tinha feito auto-atendimento). O relatório é gerado **uma vez
  e congelado** — mesmo padrão do protocolo de `CartaPdf`/
  `ApresentacaoCriancaPdf` — pra uma carta de mudança emitida DEPOIS da
  instalação não reescrever retroativamente a base já fixada.

  **Limitação documentada, não escondida**: o relatório congelado guarda
  `TotalCredenciados`/`TotalImpedidos` como registro formal (Robert's
  Rules), mas `MinutaAta` continua recalculando o quórum ao vivo via
  `universoDoOrgao` + `Presencas` (como já fazia desde a vB.6) — o
  relatório desta versão não substitui esse cálculo, só formaliza a
  contagem de entrada na porta. Fazer o quórum de instalação *ler* o
  relatório congelado em vez de recalcular é um acoplamento maior entre
  os dois fluxos que ficou fora do escopo desta versão, pra não arriscar
  o cálculo de quórum já em produção por uma tabela nova.

  Frontend: botão "🪪 Credenciamento" na lista de Reuniões (só aparece pra
  sessões com `orgaoSigla === "ASSEMBLEIA_GERAL"`), abrindo um painel com
  o aviso de não-admissão de procuração, a lista de impedidos calculados,
  o formulário de credenciamento pela mesa (com a trilha visível) e o
  botão de gerar/ver o relatório congelado.

  Testado com `npx jest` (134 testes, incluindo 7 novos: prioridade dos 3
  motivos de impedimento, listagem de impedidos filtrando corretamente
  quem está apto, e o relatório gerando na 1ª chamada e devolvendo
  congelado na 2ª) e `node --check` em todos os arquivos novos.

## vB.14 — Conselho Consultivo Técnico e Colégio de Dirigentes *(retrofit da v2.7, Reg. Art. 31 e Art. 151 §2º)*

A v2.7 base fechou tratando departamentos e autonomia financeira
(→ v5.4) — decisão que continua correta e não é revista aqui. Mas a
varredura normativa encontrou **dois órgãos de apoio que o Regimento cria e
que o sistema simplesmente não tem** — não é refinamento do que existe, é
órgão faltando no cadastro, então entra como item novo da FASE B:

- [x] **Conselho Consultivo Técnico (Reg. Art. 31)** — 3 a 5 membros, com a
      função de emitir **Parecer de Viabilidade** antes de ato de alto impacto
      patrimonial (aquisição/alienação de imóvel de alto valor, contratação de
      empréstimo). Duas coisas o tornam diferente dos órgãos já cadastrados:
      1. **Vedação de parentesco com a Diretoria Executiva** — o sistema já sabe
         validar isso: `shared/estatuto.js` já tem a checagem de parentesco
         usada na elegibilidade do Conselho Fiscal. É reaproveitar, não criar.
      2. **O parecer é pré-condição de um ato financeiro**, então ele precisa
         *travar* alguma coisa pra valer. O gancho natural já existe: a FASE 4
         tem o fluxo de aprovação de Saída/Empenho (v4.5/v4.8) — acima de um
         limite parametrizável, a Saída fica bloqueada enquanto não houver
         Parecer de Viabilidade vinculado. Sem esse travamento, vira mais um
         documento decorativo (o mesmo erro que a v2.9 evitou com as atas).
      Referência externa que confirma o desenho: o padrão internacional de
      *conflict of interest policy* para entidades religiosas — a **ECFA**
      (Evangelical Council for Financial Accountability, EUA) exige, no seu
      Standard 6, que transações com partes relacionadas sejam aprovadas por
      maioria de membros **desinteressados**, e o IRS Form 990 (Schedule L /
      Part VI) pergunta expressamente se a entidade mantém política escrita de
      conflito de interesses. No Brasil, o mesmo princípio aparece no Código
      das Melhores Práticas do **IBGC** (independência do conselho e abstenção
      do conselheiro em matéria de interesse próprio). O Art. 31 é a versão
      eclesiástica disso — e é exatamente o tipo de regra que só funciona se
      quem está impedido for calculado, não declarado.
- [x] **Colégio de Dirigentes Congregacionais (Reg. Art. 151 §2º)** — instância
      consultiva que reúne os Dirigentes de Congregação. Já temos todo o
      insumo: `Lideranca` sabe quem é Dirigente de cada congregação, e o motor
      de Reuniões é órgão-agnóstico desde a v0.3. O que falta é a sigla de
      órgão + a regra de composição **automática** (entra/sai conforme a
      pessoa assume ou deixa a congregação), em vez de uma lista de Assentos
      mantida à mão — mesma lógica de composição calculada já usada na CLI.
      Por ser consultivo, não vota deliberação vinculante: produz
      recomendação, que tramita como Parecer pela v2.8 já existente.
- [x] **Efeito colateral bom:** com esses dois cadastrados, o painel de órgãos
      passa a refletir o organograma **completo** do Regimento. Hoje ele
      reflete só a parte que foi implementada, o que dá a falsa impressão de
      que o resto não existe institucionalmente.

  Implementado: `sql/migrations/089_conselho_consultivo_colegio_dirigentes.sql`
  semeia os dois órgãos em `Orgaos` (mesmo padrão idempotente do seed
  original, Art. 13) e cria `ParametrosParecerViabilidade` (1 linha, mesmo
  padrão de `ParametrosSaida`) e `PareceresViabilidadeAlienacao`.

  **Conselho Consultivo Técnico**: reaproveita `GestaoAssentos` sem criar
  API nova — `shared/diretoria.js` ganhou `CARGOS_CONSELHO_CONSULTIVO`
  (5 vagas nomeadas, mesmo padrão de Diretoria/Conselho Fiscal/CEI) e a
  vedação de parentesco até 2º grau com a Diretoria Executiva
  (`shared/parentesco.js::existeParentescoAte2Grau`, zero alteração na
  função) passou a valer pra esse órgão também — generalizei o `if
  (["CONSELHO_FISCAL","CEI"].includes(...))` hard-coded de
  `GestaoAssentos` pra um mapa (`ARTIGOS_VEDACAO_PARENTESCO_DIRETORIA`)
  que já nasce com os 3 órgãos, em vez de duplicar o bloco.

  **Colégio de Dirigentes Congregacionais**: composição 100% calculada,
  sem Assento manual — `shared/universo.js::composicaoColegioDirigentes()`
  (nova, mesmo padrão da `porLiderancaEscopo` que a CLI já usa) reúne
  `Lideranca` com `Papeis.Nivel IN ('AREA','CONGREGACAO')`, ou seja
  Pastores de Área e Dirigentes de Congregação, e um novo branch em
  `universoDoOrgao` (`sigla === "COLEGIO_DIRIGENTES"`) devolve essa
  composição pro motor de Reuniões (RegistrarPresenca, MinutaAta,
  credenciamento) — assim que alguém assume/deixa o papel na Lideranca, o
  universo do órgão já reflete, sem recadastro. **Limitação documentada**:
  a "recomendação tramitando como Parecer pela v2.8" citada no item
  original não foi ligada ao `PareceresComissao` real, porque aquela
  tabela é FK'd a `Projetos` (matéria legislativa) e não tem gancho
  genérico pra outro tipo de origem — a varredura confirmou isso antes de
  eu inventar uma ponte que não existe. Na prática, a recomendação do
  Colégio de Dirigentes tramita pelo mesmo motor de Reuniões/Minuta de Ata
  que qualquer órgão consultivo já usa (Pauta + seção de Deliberação em
  branco pro Secretário preencher) — o que falta, se algum dia for preciso
  formalizar mais, é meta de uma versão futura, não fabricado aqui.

  **Parecer de Viabilidade (Art. 31)**: o único ato de alto impacto
  patrimonial que o sistema já modela de verdade é alienação de bem
  (`GestaoAlienacoesBens`, v4.11) — "aquisição de imóvel" e "contratação
  de empréstimo" **não têm módulo nenhum no sistema hoje** (varredura
  confirmou zero ocorrência em todo o código): documentado aqui como gap
  real, não fabricado. `shared/parecerViabilidade.js` trava exatamente
  onde o ato é real: `GestaoAlienacoesBens` ganhou a ação
  `PARECER_VIABILIDADE` (só quem tem assento ativo no Conselho Consultivo
  Técnico pode emitir) e a ação `AUTORIZAR` passou a exigir, acima do
  valor configurável em `ParametrosParecerViabilidade` (padrão R$
  50.000,00), um parecer `FAVORAVEL` já vinculado à proposta — sem isso,
  a autorização fica bloqueada com a mensagem citando o Art. 31, mesmo
  padrão de bloqueio-com-mensagem já usado pra suspensão do PDQ e saldo
  insuficiente no mesmo arquivo.

  Frontend: o painel de Órgãos e o submenu central de Reuniões já listam
  os dois órgãos automaticamente (`GET /api/orgaos` genérico, zero
  alteração de tela); a tela de Assentos genérica (matrícula + órgão +
  cargo em texto livre) já aceita o Conselho Consultivo Técnico sem UI
  dedicada nova (mesmo caminho que outros órgãos menos usados já
  percorrem). Adicionado: botão "📋 Parecer de Viabilidade (Art. 31)" na
  lista de Alienações de Bens, visível enquanto a proposta está
  `PROPOSTA`.

  Testado com `npx jest` (141 testes, incluindo 7 novos de
  `shared/parecerViabilidade.js`) e `node --check` em todos os arquivos
  novos/alterados.

## vB.15 — Consolidação Normativa e Texto Mestre *(retrofit da v2.9, Reg. Art. 162 §§2º-4º e Art. 162-B)*

Este é, provavelmente, o gap mais silencioso de todo o sistema. O Regimento
**manda** manter um Texto Mestre consolidado e impõe prazo (Art. 162 §§2º-4º
e Art. 162-B); hoje o sistema guarda "alterações do Regimento" como
documentos soltos (`Tipo=REGIMENTO`, catalogados pela v2.9 base, que
continua correta no que já entrega), o que significa que, para saber a regra
vigente hoje, alguém precisa ler a versão original **mais** todas as atas de
alteração posteriores, em ordem — exatamente o problema que a consolidação
existe para eliminar. E o sistema inteiro (v1.x elegibilidade, v3.x prazos
disciplinares, v4.x percentuais) é construído em cima de artigos que podem
ter mudado.

- [x] **Texto Mestre com vigência (versão consolidada).** Cada alteração
      aprovada gera uma nova versão consolidada do Regimento, com data de
      início de vigência e ponteiro para a ata que a produziu. Não é editor de
      texto (a v2.9 base já descartou isso, e com razão): é **versionamento do
      arquivo** + a ficha de vigência ao redor dele. A consulta que precisa
      existir é "qual era o texto vigente na data X" — sem ela, um processo
      disciplinar de 2024 julgado hoje corre o risco de ser medido por regra
      de 2026, o que é retroatividade pura.
- [x] **Alerta de prazo de 48h** (Art. 162 §2º: Texto Mestre atualizado em
      48 horas após o registro da ata de alteração). Reaproveita tal e qual o
      mecanismo de alerta de cartório que já está na v2.9 base
      (`estatuto.diasDesde`, calculado na leitura) — é o mesmo padrão, outro
      prazo. Custo de implementação quase zero; o valor é que o prazo deixa de
      depender de alguém lembrar.
- [x] **Nota de vigência automática e regra dos 30%** (Art. 162 §§3º-4º):
      alteração que atinge mais de 30% do texto exige registro integral, não
      apenas averbação da alteração. O sistema não mede diff de texto jurídico
      com confiança suficiente pra decidir isso sozinho — mas **pode** alertar:
      registrar quantos artigos foram tocados em relação ao total e acender o
      aviso quando passar do limiar, deixando a decisão com o Secretário. É
      assistência técnica, não automação cega (mesmo critério da v4.x para
      classificações fiscais).
- [x] **Revisão sistêmica quadrienal (Art. 162-B).** A cada 4 anos há revisão
      obrigatória do arcabouço normativo. Vira um item de calendário
      institucional com antecedência (mesmo motor da v7.2), não um lembrete
      manual — é justamente o tipo de prazo longo que ninguém lembra sem
      sistema.

  Implementado: `sql/migrations/090_texto_mestre_consolidado.sql` cria
  `TextoMestreVersoes` (arquivo PDF consolidado + vigência + ponteiro
  opcional pra `Documentos.DocumentoId` — a varredura confirmou que **não
  existe tabela de ata assinada**: o PDF final de uma ata já vive em
  `Documentos` com `Tipo='ATA'`, então o ponteiro aponta pra lá, não pra
  `Sessoes` diretamente) e `ParametrosTextoMestre` (1 linha, baseline da
  revisão quadrienal — semeada com `NULL` de propósito: nenhuma data
  histórica foi inventada, a Secretaria define a real na primeira vez que
  usar a tela).

  `shared/textoMestre.js`: `versaoVigenteEm(pool, data)` responde
  literalmente "qual era o texto vigente nesta data" (não soma
  alterações). O prazo de 48h (Art. 162 §2º) reaproveita o **mesmo
  padrão** de `estatuto.diasDesde` que já dá o alerta de cartório em
  `GestaoDocumentos` — com uma ressalva documentada, não escondida: o
  sistema só tem granularidade de dia em todo o resto (`DIAS_LAVRATURA`,
  `DIAS_CARTORIO`), então 48h vira `DIAS_PRAZO_ATUALIZACAO = 2`, a
  aproximação mais fiel dentro do padrão existente, não uma hora exata.
  O gatilho do prazo é o catálogo `Tipo=REGIMENTO` que a v2.9 **já** usa
  pra guardar alterações — não um tipo novo: qualquer Documento desses
  ainda sem `TextoMestreVersoes` apontando pra ele, há mais de 2 dias, é
  pendência. A regra dos 30% (`avaliarLimiar30Porcento`) é só alerta —
  nunca decide sozinha registro integral x averbação — porque **não
  existe tabela de artigo/texto estruturado** em lugar nenhum do sistema
  (confirmado por varredura: zero `ArtigoNumero`/`TextoArtigo`); o
  Secretário informa `totalArtigos`/`artigosTocados` na hora de registrar
  a versão, mesmo espírito de "assistência técnica, não automação cega"
  já usado nas classificações fiscais da FASE 4.

  **Limitação documentada, não fabricada**: a revisão sistêmica quadrienal
  (Art. 162-B) cita "mesmo motor da v7.2", mas a varredura confirmou que a
  v7.2 (Calendário Oficial) **ainda não foi construída** — todos os itens
  daquela versão continuam `[ ]`. Em vez de fabricar uma integração com um
  motor que não existe, `situacaoRevisaoQuadrienal` é um alerta mínimo e
  autônomo (mesmo padrão `diasDesde`, com uma antecedência de 180 dias/~6
  meses como horizonte de planejamento) — quando a v7.2 existir de
  verdade, essa checagem vira só mais um item nela, sem redesenho.

  `GestaoTextoMestre` (GET público — o Regimento vigente não é sigiloso,
  mesmo padrão de `GestaoDocumentos`; POST/PUT exigem
  `["reunioes","assembleia","cli"]`, e definir a baseline da revisão
  quadrienal exige nível Global): painel único devolvendo vigente-hoje-ou-
  na-data-pedida, pendências de 48h, situação da revisão quadrienal e o
  histórico de versões.

  Frontend: painel "📖 Texto Mestre Consolidado" na aba Arquivos, logo
  abaixo da lista de Documentos — versão vigente com link direto,
  pendências de 48h em destaque, aviso da revisão quadrienal e formulário
  de registro de nova versão (data de vigência + PDF + contagem opcional
  de artigos tocados).

  Testado com `npx jest` (152 testes, incluindo 11 novos de
  `shared/textoMestre.js`) e `node --check` em todos os arquivos novos.
- **Referências que confirmam o desenho.** No Brasil, a LC 95/1998 (com a
  LC 107/2001) trata de técnica legislativa e **consolidação** — o conceito de
  manter texto consolidado em vez de obrigar o leitor a somar alterações é
  exatamente o do seu art. 13-14; o Decreto 9.191/2017 aplica isso no
  Executivo federal. Fora do Brasil, o padrão maduro é *point-in-time law*:
  o **legislation.gov.uk** (Reino Unido) publica cada lei em versão "as
  amended" com data de vigência e permite consultar o texto tal como estava em
  qualquer data passada; nos EUA, o **eCFR** faz o mesmo para regulamentos
  federais. No direito canônico católico há séculos se usa o *textus
  consolidatus* pela mesma razão. O que o Art. 162 pede não é uma
  excentricidade regimental — é a prática consolidada de quem administra
  normas que mudam.

## vB.16 — Mediação e Arbitragem Eclesiástica *(retrofit/complemento da FASE 3, Reg. Art. 161-A)*

A FASE 3 inteira foi construída em cima de uma premissa: conflito interno vira
**processo disciplinar**. Isso está certo para falta ética/doutrinária, mas a
varredura normativa mostrou que o Regimento prevê uma via que o sistema não
tem — e que atende um tipo de conflito **diferente**: disputa patrimonial ou
administrativa entre partes (congregação × sede, dirigente × departamento,
obreiro × igreja sobre valores). Aí não há "réu" nem sanção; há duas partes
querendo uma decisão. Hoje esse caso ou é forçado dentro do processo
disciplinar (que o distorce, porque cria acusado onde não há acusação) ou sai
do sistema e vai direto pro Judiciário. A FASE 3 está fechada, então essa via
entra como módulo novo da FASE B, não como reabertura dela.

- [x] **Câmara de Mediação — a etapa que resolve a maioria dos casos.**
      Instauração por qualquer das partes, indicação de mediador da lista
      cadastrada (com impedimento calculado: parentesco, vínculo com a
      congregação envolvida, participação prévia no caso), sessões com registro
      de comparecimento e **termo de acordo** ao final. O acordo é o produto:
      registrado, assinado (reaproveita `TermosAssinados` da v2.7) e, quando
      envolve valor, vinculado à Saída/Receita correspondente na FASE 4 — senão
      vira papel sem efeito. Prazo de encerramento com alerta calculado, mesmo
      padrão dos prazos disciplinares.
- [x] **Arbitragem — só quando a mediação falha.** Painel de árbitros,
      compromisso arbitral assinado pelas partes, sentença arbitral registrada.
      A sequência importa e deve ser **travada pelo sistema**: não se abre
      arbitragem sem mediação encerrada sem acordo. É o desenho do próprio
      Art. 161-A e também o da lei.
- [x] **Cláusula compromissória no ciclo de vida do membro/dirigente.** Para a
      via ser realmente obrigatória, a adesão precisa existir **antes** do
      conflito. O gancho natural é o Termo de Compromisso de Gestão (v2.7) e o
      aceite do Estatuto na esteira de batismo (vB.11) — é ali que a cláusula
      é aceita e fica provada com data e versão. Sem isso, "via obrigatória" é
      só uma frase no Regimento.
- [x] **Encaminhamento cruzado com a FASE 3 existente.** Se, durante a
      mediação, aparecer fato que configure infração ética, o caso **bifurca**:
      segue a mediação patrimonial e abre processo disciplinar separado
      (reaproveita `shared/disciplinar.js::criarProcessoDisciplinar`, mesma
      ponte que a Ouvidoria v3.7 já usa). São coisas distintas e devem correr
      distintas — misturar as duas é o erro que se quer evitar.
- [x] **Interface com a Ouvidoria (v3.7).** A Ouvidoria hoje só sabe encaminhar
      pra processo disciplinar. Ganha uma segunda saída: `ENCAMINHAR_MEDIACAO`,
      para o relato que é conflito, não denúncia.

  Implementado: `sql/migrations/091_mediacao_arbitragem.sql` cria
  `CatalogoMediadoresArbitros` (entra no CRUD genérico de
  `GestaoCatalogos`, permissão dedicada `"mediacao"` — nova
  `Funcionalidades`, mesmo padrão de `"ouvidoria"`), `MediacoesArbitragens`
  (1 linha por caso, `Status` como máquina de estados —
  `MEDIACAO_EM_CURSO → MEDIACAO_ACORDO | MEDIACAO_SEM_ACORDO →
  ARBITRAGEM_EM_CURSO → ARBITRAGEM_SENTENCA`) e `SessoesMediacao`
  (comparecimento por sessão). `DenunciasOuvidoria` ganhou
  `MediacaoArbitragemId`, mesmo padrão de `ProcessoDisciplinarId` já
  existente.

  `shared/mediacaoArbitragem.js`: `calcularImpedimento()` verifica, nessa
  ordem, se o candidato é uma das próprias partes, parentesco até 2º grau
  (`shared/parentesco.js::existeParentescoAte2Grau`, zero alteração —
  mesma função já usada por Conselho Fiscal/CEI), vínculo com a mesma
  congregação de uma das partes, e participação prévia como
  mediador/árbitro em OUTRO caso envolvendo qualquer uma das mesmas
  partes — os quatro cálculos que o Art. 161-A pede, nenhum deles uma
  marcação manual. `avaliarPrazoEncerramento` seguiu o **mesmo padrão**
  de `avaliarPrazoDefesa` (disciplinar) — com uma decisão documentada, não
  escondida: como o Regimento (no trecho disponível) não enuncia um número
  fixo de dias para a mediação encerrar, o prazo é **parametrizado por
  quem instaura o caso**, e só o cálculo do alerta é fixo; não fabriquei
  um prazo legal que não estava no texto.

  Cláusula compromissória (`registrarAceiteClausulaCompromissoria`) usa a
  mesma mecânica de hash/trilha de `TermosAssinados` que
  `shared/batismo.js::registrarAceiteEstatuto` já usa — `TipoTermo`
  deliberadamente **fora** do catálogo de `shared/termos.js` (confirmado
  por varredura: aquele catálogo *gate-ia login* de quem se enquadra no
  `aplicaA`; a cláusula compromissória não pode virar pendência de login
  de ninguém). Os dois ganchos reais do ciclo de vida: `GestaoTermos`
  registra a cláusula automaticamente ao assinar `COMPROMISSO_DIRIGENTE`
  (Art. 57), e `GestaoCandidatosBatismo` registra ao aceitar o
  Estatuto/Regimento na esteira de batismo (vB.11, Art. 80 §2º, V) — os
  exatos dois pontos que o item pedia, sem tela nova.

  `GestaoMediacoesArbitragens` (GET/POST/PUT `/api/mediacoes`) —
  instaurar é `exigirLogin` (qualquer parte pode abrir, mesmo espírito de
  "toda a membresia" da Ouvidoria); operar o caso exige `"mediacao"`. A
  trava real está em `DESIGNAR_ARBITRO`: recusa se `Status !==
  'MEDIACAO_SEM_ACORDO'`, então não existe caminho de API pra pular a
  mediação. `REGISTRAR_SENTENCA` faz upload do PDF (mesmo
  `shared/storage.js` de todo o resto) e cita a Lei 9.307/1996 art. 18/31
  na própria mensagem de confirmação (produz efeitos de sentença judicial,
  sem homologação). `BIFURCAR_DISCIPLINAR` chama
  `criarProcessoDisciplinar` e grava `ProcessoDisciplinarBifurcadoId` —
  **sem** alterar o `Status` da mediação, porque as duas vias correm em
  paralelo, não uma substitui a outra.

  **Limitação documentada**: o vínculo "acordo → Saída/Receita
  correspondente" ficou como um FK simples opcional
  (`MediacoesArbitragens.SaidaVinculadaId → SaidasTesouraria`), informado
  por quem registra o acordo — a varredura confirmou que `SaidasTesouraria`
  não tem um padrão genérico de origem (`OrigemTipo`/`OrigemId`, que
  existe em `RepassesInstitucionais`) prontos pra reaproveitar sem
  alterar uma tabela financeira central tocada por todo o resto do
  sistema; um FK direto e opcional resolve o caso real sem esse risco.

  `GestaoOuvidoria` ganhou a ação `ENCAMINHAR_MEDIACAO` (mesma permissão
  `"ouvidoria"` de `ENCAMINHAR_PROCESSO`, sem caso especial) — denunciante
  (se não anônimo) vira Parte A, denunciado vira Parte B.

  Frontend: nova aba "🤝 Mediação e Arbitragem" no módulo Disciplina &
  Ética (ao lado de Ouvidoria), com instauração, lista de casos com prazo
  calculado, e painel de detalhe com as ações de cada etapa (mediador,
  sessões, acordo/sem acordo, árbitro, compromisso arbitral, sentença,
  bifurcação); botão "Encaminhar p/ Mediação" na Ouvidoria.

  Testado com `npx jest` (162 testes, incluindo 10 novos de
  `shared/mediacaoArbitragem.js`: os 4 cenários de impedimento em ordem
  de prioridade, prazo vencido/não vencido, e os 3 tipos de termo
  assinado) e `node --check` em todos os arquivos novos/alterados.

**Base jurídica e referências.** No Brasil a arbitragem é regida pela
**Lei 9.307/1996** (alterada pela Lei 13.129/2015): a sentença arbitral produz
os mesmos efeitos de sentença judicial e **não depende de homologação**
(art. 18, art. 31), e é título executivo judicial (CPC art. 515, VII) — ou
seja, é via real, não simbólica, desde que limitada a **direitos patrimoniais
disponíveis** (art. 1º), que é exatamente o recorte do Art. 161-A. A mediação
tem lei própria, **Lei 13.140/2015**, e o CPC art. 3º §§2º-3º impõe ao Estado
o estímulo à autocomposição. Duas cautelas que o sistema deve refletir no
texto das telas: matéria de direito indisponível (trabalhista subordinada,
questão de família, crime) **não** é arbitrável, e cláusula compromissória em
relação de consumo ou de adesão tem restrição (Lei 9.307 art. 4º §2º;
CDC art. 51, VII) — por isso a adesão deve ser aceite expresso e datado, não
presumida.

Fora do Brasil, esse é um campo maduro e a IEADESPA não está inventando nada:
nos EUA, a **Peacemaker Ministries** publica há décadas as *Rules of Procedure
for Christian Conciliation*, um regulamento completo de mediação/arbitragem
cristã cujos laudos são rotineiramente executados pelas cortes estaduais sob o
*Federal Arbitration Act*; a jurisprudência americana, desde **Watson v. Jones**
(1871) e **Serbian Eastern Orthodox Diocese v. Milivojevich** (1976), aplica a
*ecclesiastical abstention doctrine* — o Judiciário se recusa a rever decisão
interna de igreja em matéria de governança, o que torna a instância interna
**a** instância. No Reino Unido, tribunais religiosos operam como arbitragem
sob o *Arbitration Act 1996*. O fundamento teológico do instituto é
1 Coríntios 6:1-8 e Mateus 18:15-17 (resolver entre irmãos antes de recorrer a
tribunal externo) — o Art. 161-A é a tradução regimental disso.

**Por que vale a pena construir:** dos módulos desta fase, é o que tem a maior
razão entre valor institucional e esforço técnico. Reaproveita quase tudo que
já existe (motor de prazos, impedimento calculado, termos assinados, ponte com
disciplinar, ponte com financeiro) e cobre o único tipo de conflito que hoje
não tem lugar nenhum no sistema.

## vB.17 — Camisetas como Campanha real *(retrofit da v4.4, integração com o site)*

**Trabalhado fora de ordem, junto com a FASE C (2026-09-14)** — o módulo de
camisetas do site institucional **já funciona de verdade** (lançamento real
previsto pra semana seguinte a esta versão, só adiado pela própria
integração) — não é mais dado fictício, como uma varredura de código
anterior tinha registrado. Hoje `camiseta_grupos`/`camiseta_lotes`/
`camiseta_pedidos` vivem só no Directus do site, com `congregacao` apontando
pra cópia própria do Directus (`pedir_congregacao`, opcional) — a mesma
duplicação de fundo que a vC.2 resolve pra congregação em geral, só que
aplicada a uma campanha de arrecadação específica (v4.4, `GestaoCampanhas`
— dinheiro real vendendo produto físico).

- [x] Quando `congregacao` for informada num pedido de camiseta, gravar o
      `CongregacaoId` real (API unificada da vC.2) em vez da relação
      Directus-Directus solta que existe hoje.

  Verificado: **já entregue** dentro do próprio commit da vC.2
  (`2c47af2`, 13/09), junto com a mesma correção aplicada a Eventos —
  fica registrado aqui porque a vC.2 não tinha marcado essa parte
  específica do roadmap de camisetas. `site/src/pages/camiseta/[slug].astro`
  já busca as opções do dropdown via `fetchCongregacoesPublicas()`
  (sistema, não Directus) e grava `congregacaoId` real no pedido;
  `site/api/CriarPedidoCamiseta` repassa esse valor pro Directus como
  `camiseta_pedidos.congregacao` (campo simples, sem relação — a relação
  Postgres foi removida de verdade, conforme já fechado na própria vC.2);
  `painel-camisetas/grupo/pedidos.astro` (client-side, evita CORS) resolve
  o id pro nome via o mesmo mapa `{id: nome}` embutido em build time que
  `eventos/exportar.astro` já usava. Conferido: `git log` mostra as duas
  únicas alterações nesses arquivos vindas exatamente desse commit, nada
  pendente.
- [ ] Avaliar, com a vC.2 já no ar, se o valor arrecadado (`valor_pago` no
      Directus) deve virar uma `Campanha`/`ContasAReceber` real aqui (visível
      no Financeiro, v4.4/v4.6) ou se continua só no Directus por enquanto —
      decisão a tomar com o volume real de vendas em mãos, não antes.

  **Continua em aberto de propósito.** O próprio item já diz qual é o
  critério pra decidir — volume real de vendas — e esse critério ainda
  não foi atingido: o lançamento real do módulo de camisetas do site
  estava previsto pra semana seguinte à redação deste item (2026-09-14),
  ou seja, por volta de 21/09; hoje (2026-09-17) ainda é antes disso. Não
  existe hoje nenhum endpoint público que exponha volume agregado de
  vendas (`ConsultarPedidosCamiseta` só devolve pedidos batendo com um
  hash de telefone específico, de propósito — Fase 22, decisão explícita
  de não expor nada além disso sem o telefone de quem pediu), então
  forçar essa decisão agora seria decidir sem o dado que o próprio item
  exige. Fica registrado como pendência real, não fabricado nem
  silenciosamente fechado.
- [x] Perguntas personalizadas por campanha de camiseta (`perguntas_camiseta`)
      continuam no Directus — são só formulário, sem overlap com nenhuma
      entidade daqui.

  Confirmado: nenhuma entidade do sistema de governança modela pergunta
  de formulário — `perguntas_camiseta`/`respostas_pedido_camiseta`
  seguem exclusivamente no Directus, sem overlap. Decisão de manter como
  está, reafirmada, não uma tarefa pendente.

## 🔒 Trava de Revisão B-C — antes de encerrar a FASE B e avançar para a FASE 5

- [x] Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da
      seção 3). Auditadas vB.11 a vB.17 pelas 5 perguntas do checklist
      (17/09), mais varredura final na FASE B **inteira** (vB.1 a vB.17)
      antes de fechar a fase. Fecha a FASE B: a partir daqui a FASE 5 pode
      começar.

  **1. Todo código novo roda de ponta a ponta contra o ambiente real?**
  Sim — `npx jest` dentro de `api/` (o config vive lá, não na raiz): **24
  suítes, 162 testes, todos passando**, batendo exatamente com o número que
  o próprio texto de vB.16 já citava. `node --check` sem erro em todos os
  arquivos novos/alterados (`shared/batismo.js`, `apresentacaoCriancas.js`,
  `credenciamento.js`, `parecerViabilidade.js`, `textoMestre.js`,
  `mediacaoArbitragem.js`, e as 7 rotas `GestaoTurmasBatismo`,
  `GestaoCandidatosBatismo`, `GestaoApresentacaoCriancas`,
  `ApresentacaoCriancaPdf`, `GestaoCredenciamento`,
  `GestaoMediacoesArbitragens`, `GestaoTextoMestre`). Migrações 086-091
  confirmadas idempotentes de verdade (`IF OBJECT_ID(...) IS NULL` antes de
  `CREATE TABLE`, guarda equivalente antes de `ALTER TABLE`/seed), não só
  "parecem". As 7 rotas conferidas nome-a-nome e parâmetro-a-parâmetro entre
  `function.json` e os `fetch` de `app/script.js` — nenhuma divergência.
  vB.17 (Camisetas) reconferido no **código de hoje**, não só no commit
  citado: `site/src/pages/camiseta/[slug].astro`,
  `site/api/CriarPedidoCamiseta/index.js` e
  `painel-camisetas/grupo/pedidos.astro` gravam e resolvem `CongregacaoId`
  real, exatamente como o texto descreve — única nuance registrada, não uma
  divergência: `CriarPedidoCamiseta` foi movido de modelo de função
  (`site/api/src/functions/...` → `site/api/CriarPedidoCamiseta/index.js`)
  pelo commit `bf134ae` (vC.5, "nenhuma regra de negócio mudou", conferido
  no código: a lógica de `congregacao` é a mesma).

  **2. Toda tela nova abre e mostra dado de verdade?** As 5 telas novas do
  período (aba "👶 Apresentação de Filhos", botão "🪪 Credenciamento", aba
  "🤝 Mediação e Arbitragem", painel "📖 Texto Mestre Consolidado", botão
  "📋 Parecer de Viabilidade") auditadas `id` a `id` entre
  `getElementById`/`querySelector` e o HTML real — nenhum órfão, nenhum
  repeat do bug do painel Financeiro que originou esta convenção.

  **3. README e código continuam narrando a mesma coisa?** Toda tabela,
  arquivo e função citados em vB.11-vB.17 existem exatamente como descrito
  (`shared/estatuto.js::idadeEm/diasDesde`,
  `shared/parentesco.js::existeParentescoAte2Grau`,
  `shared/diretoria.js::CARGOS_CONSELHO_CONSULTIVO`/
  `ARTIGOS_VEDACAO_PARENTESCO_DIRETORIA`,
  `shared/universo.js::composicaoColegioDirigentes`/
  `membrosComCartaMudancaEmitida`,
  `shared/disciplina.js::membrosSobDisciplina`). Todas as referências
  cruzadas (`v1.9`, `v6.9`, `vB.6`, `v2.7`, `v2.9`, `v2.1`, `v4.5`, `v4.8`,
  `v4.11`, `v3.7`, `v7.2`, `v2.8`, `v0.3`, `v3.4`, `v4.1.3`, `v4.10`,
  `v7.5`) apontam pra seções reais. As limitações "documentadas, não
  escondidas" seguem verdadeiras hoje: v7.2 inteira ainda `[ ]`;
  `PareceresComissao` segue FK só a `Projetos`; `SaidasTesouraria` segue
  sem `OrigemTipo`/`OrigemId` genérico (só `RepassesInstitucionais` tem);
  ata continua vivendo em `Documentos` (`Tipo='ATA'`), sem tabela própria;
  `ArtigoNumero`/`TextoArtigo` seguem em **zero** ocorrências em todo o
  código. Confirmado também que a vC.2 (pré-condição de vB.17) está de
  fato fechada — Travas C-A e C-B ambas `[x]`, migração de dado conferida
  linha a linha — e que os 3 arquivos de camiseta não têm mais nenhum
  resquício de relação Directus-Directus antiga em paralelo.

  **4. O que ficou pra trás foi de fato corrigido, não só anotado?**
  Nenhum `TODO`/`FIXME`/`HACK` não documentado encontrado em nenhum arquivo
  novo/alterado de vB.11 a vB.17 (os únicos matches de busca eram a palavra
  portuguesa "todo/todos", falso positivo). As limitações reais que existem
  (discipulado atestado manualmente até v6.9, prazo de mediação
  parametrizado, vínculo acordo→Saída como FK opcional, decisão de
  campanha de camiseta em vB.17) já estavam documentadas no próprio texto,
  não escondidas.

  **Pontes de infraestrutura (Esteira de Batismo e Mediação/Arbitragem)
  confirmadas reais, não só no texto**: `shared/batismo.js::
  registrarAceiteEstatuto` e `shared/mediacaoArbitragem.js::
  registrarAceiteClausulaCompromissoria` fazem `INSERT` real em
  `TermosAssinados` (hash SHA-256 do texto, não simulação); os dois pontos
  do ciclo de vida citados pelo texto (`GestaoTermos` ao assinar
  `COMPROMISSO_DIRIGENTE`, `GestaoCandidatosBatismo` ao aceitar o
  Estatuto/Regimento) chamam essa função de verdade. A ponte com a FASE 3
  (`criarProcessoDisciplinar`, bifurcação) também é real e compartilhada
  com a Ouvidoria (v3.7). O texto de vB.16 não afirma integração direta com
  o motor de notificação (só alerta de prazo calculado na leitura, mesmo
  padrão dos prazos disciplinares) — não há contradição a corrigir aí.

  **5. Deploy real, de ponta a ponta, aconteceu?** Sim. `gh run list`
  confirma `success` no workflow "Governança - CI/CD" para os 7 commits de
  vB.11 a vB.17 (`7cbf1de`, `4e16051`, `1b96fd2`, `3cc2a15`, `68943f9`,
  `920d569`, `43b030b`). Branch local sincronizada de verdade com
  `origin/main` (mesmo commit em ambos, não só "parece"). Testado ao vivo:
  `https://app.ieadespa.org.br/` responde `200`.

  **Observação operacional à parte (fora do escopo de vB.11-vB.17, não
  bloqueia esta trava)**: o workflow agendado "Rotinas diárias
  (notificações e escalonamento)" falhou 2 vezes recentes (16/09 e 17/09,
  job de avaliação de regras de notificação da vB.2, exit code 22) — já
  rastreado em issue `.github#6`, registrado aqui só pra não passar batido
  numa trava futura.

  **Varredura final da FASE B inteira (vB.1 a vB.17):** todos os 17
  cabeçalhos existem; de toda a fase, só 2 itens seguem `- [ ]`, e os dois
  com justificativa explícita ao lado (não esquecimento): vB.5
  (self-service ampliado, encaminhado nomeadamente pra v5.6/v7.4/v7.13/
  v7.10/fim da FASE 12) e vB.17 (decisão de campanha de camiseta virar
  `Campanha`/`ContasAReceber`, em aberto de propósito até haver volume real
  de vendas). Nenhum `[x]` fabricado, nenhuma referência cruzada quebrada.
