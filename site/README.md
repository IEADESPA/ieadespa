# Site institucional — IEADESPA

Site oficial da **Igreja Evangélica Assembleia de Deus Ministério do Seta em Parauapebas/PA**
(IEADESPA), construído com [Astro](https://astro.build/) e Tailwind CSS 4. O site em si é
estático (gerado em build), mas o conteúdo (mensagens, eventos, congregações, galeria, relatórios
etc.) vem de um [Directus](https://directus.io/) — um CMS auto-hospedado com banco de dados
próprio, onde qualquer pessoa da igreja edita com login por e-mail e senha, sem precisar de conta
no GitHub nem entender de código.

Este documento é uma referência do que o site **é hoje**, organizada por área. Não é mais um diário
de desenvolvimento — o histórico de decisões, pesquisas e testes de cada funcionalidade continua
disponível no histórico de commits do Git, se um dia for preciso relembrar o "porquê" por trás de
algo.

## Arquitetura em duas partes

- **O site público** (`www.ieadespa.org.br`) — este repositório, hospedado no Azure Static Web
  Apps. A cada `git push`, ou a cada publicação/edição/exclusão de conteúdo no Directus, o GitHub
  Actions gera uma nova versão estática e publica em 1-2 minutos (ver
  [Infraestrutura Azure](#infraestrutura-azure)).
- **Uma camada de API própria** (`api/`, Azure Functions, hospedada dentro do mesmo Static Web
  App) — cobre tudo que o site estático sozinho não consegue fazer com segurança: conferir
  telefone/código com hash de verdade, enviar e-mail transacional, impedir voto duplicado em
  enquete, etc. Ver [Segurança, privacidade e decisões de arquitetura](#segurança-privacidade-e-decisões-de-arquitetura).
- **O painel administrativo** (Directus) — um App Service + banco PostgreSQL separados no Azure,
  em `https://ieadespa-directus-gae4hfarf4a4ffcf.brazilsouth-01.azurewebsites.net/admin`. É onde o
  conteúdo é editado. Trocar o domínio ou mexer no Static Web App não afeta o Directus, e
  vice-versa.

## Requisitos e como rodar

- Node.js `22.12.0` ou mais recente, npm

```bash
npm install
npm run dev
```

Gerar a versão de produção e pré-visualizar o resultado (busca o conteúdo do Directus em tempo de
build, então precisa de conexão com a internet):

```bash
npm run build
npm run preview
```

`npm run preview` (e `astro dev`) **não aplicam** `public/staticwebapp.config.json` (CSP,
cabeçalhos de cache, permissões de geolocalização/câmera) nem rodam a API (`api/`) junto — para
testar isso de verdade é preciso o emulador oficial (`@azure/static-web-apps-cli`) ou testar contra
o próprio ambiente de produção depois do deploy. Isso importa porque algumas funcionalidades
(mapas, geolocalização, VLibras, o WebSocket do mural de oração) só funcionam sob o CSP real, e
chaves de API restritas por domínio recusam `localhost` — ver
[Limitações de teste local](#limitações-de-teste-local).

## Conteúdo — coleções do Directus

Todo o conteúdo abaixo é editado no [painel do Directus](#painel-administrativo-directus), nunca
em arquivo deste repositório. O site busca os dados de lá em tempo de build (ou, nos poucos casos
que precisam disso, em tempo real pelo navegador de quem visita), através de
[src/lib/directus.ts](./src/lib/directus.ts) e das Functions em [api/](./api/) (uma pasta por
função — modelo clássico do Azure Functions, ver vC.5 em `docs/plano/fase-c-integracao-com-o-site.md`).

### Conteúdo institucional (leitura pública liberada)

| Coleção | Onde aparece |
| --- | --- |
| `mensagens` | `/mensagem/<slug>/`, `/mensagens/`, `/temas/`, `/pregadores/`, home |
| `noticias` | `/noticia/<slug>/`, `/noticias/` |
| `relatorios` | `/transparencia/` |
| `ministerios` + `orgao_categorias` + `orgao_membros` | `/orgaos/`, `/orgao/<slug>/` |
| `eventos` + `sessoes_evento` + `perguntas_evento` (leitura) | `/eventos/`, `/evento/<slug>/` |
| `galeria` | `/galeria/` |
| `congregacoes` | `/congregacoes/`, `/congregacao/<slug>/` |
| `historia` + `historia_files` | `/historia/` |
| `depoimentos` (só `aprovado=true`) | `/depoimentos/`, teaser em `/sobre/` |
| `faq` | `/duvidas-frequentes/` |
| `visitantes` | `/visitante/` |
| `programacao` | Programação semanal de cultos (home, `/visitante/`) |
| `enquetes` (pergunta/opções — nunca o voto em si) | `/enquetes/` |

Rascunhos (`draft: true`) são filtrados no próprio código do site
([src/lib/posts.ts](./src/lib/posts.ts)), não no Directus — limitação do plano gratuito ("Core"),
que não permite filtro condicional em permissão.

### Coleções com dado sensível ou fluxo protegido

Nunca têm leitura pública sem filtro, e a maioria não tem leitura pública nenhuma — o acesso passa
por uma Azure Function (ver [api/](./api/)), que confere identidade
com o token de administrador do Directus por trás, sem nunca expor esse token nem o dado bruto a
quem não deveria vê-lo.

| Coleção | Guarda | Como é protegida |
| --- | --- | --- |
| `inscricoes_eventos` | Nome, telefone (hash), código, presença, pagamento | Leitura pública mínima (`id`/`evento`/`aguardando_vaga`/`presente`, só para contadores); só eventos dos últimos 90 dias; nome/código exigem check-in autenticado ou a Function `VerificarInscricao/index.js` (código **e** telefone) |
| `respostas_inscricao` | Resposta a pergunta customizada de um evento | Só cria publicamente |
| `cupons_desconto` | Código de desconto, limite de usos | Leitura pública por código; atualização pública só do contador de usos |
| `camiseta_grupos` | Campanha de camiseta/uniforme (nome, valor, prazo) | Leitura pública |
| `camiseta_lotes` | Janela de compra (número, aberto/fechado) de um grupo | Sem leitura/escrita pública — só a equipe (painel) e a Function de criação de pedido |
| `camiseta_lote_itens` | Estoque extra + custo por tamanho/modelo de um lote | Sem leitura/escrita pública |
| `camiseta_pedidos` | Nome, telefone (hash), e-mail opcional, valor pago | Sem criação pública direta — só via `CriarPedidoCamiseta/index.js`; leitura pública só do campo `id`; consulta por telefone via `ConsultarPedidosCamiseta/index.js` |
| `camiseta_itens_pedido` | Item do carrinho (tamanho/modelo/quantidade) | Sem criação pública direta — só via `CriarPedidoCamiseta/index.js` |
| `perguntas_camiseta` | Pergunta customizada de uma campanha | Leitura pública |
| `respostas_pedido_camiseta` | Resposta de um pedido a uma pergunta | Sem criação pública direta — só via `CriarPedidoCamiseta/index.js` |
| `mural_oracao` | Pedido de oração, nome opcional, confidencial | Leitura pública só do que é `aprovado=true`, não confidencial e dos últimos 90 dias; contador `orando_count` só é escrito pela Function `OrarMural/index.js` |
| `contato_mensagens` | Formulário de contato (inclui LGPD/pedido de oração) | Só cria publicamente, nunca lida |
| `push_subscriptions` | Inscrição de notificação push | Só cria publicamente; edição usa o próprio endpoint como "senha de posse" |
| `pageviews` | Caminho da página + domínio de origem + data (sem IP, sem cookie) | Só cria publicamente |
| `contas` | E-mail da "Minha Conta" | Sem leitura/escrita pública — só via Functions da Minha Conta |
| `contas_codigos` | Código de login de 6 dígitos (hash SHA-256) | Sem leitura/escrita pública |
| `enquete_votos` | Voto (enquete + opção + e-mail) | Sem leitura/escrita pública — só via `ConsultarEnquete/index.js`/`VotarEnquete/index.js` |

O que continua fixo no código (não muda com frequência, editado no VS Code): dados institucionais
fixos (nome, endereço, horários, CNPJ, redes sociais) em
[src/config/site.ts](./src/config/site.ts); temas de mensagem em
[src/config/categories.ts](./src/config/categories.ts).

## Páginas do site

**Institucional**: `/`, `/sobre/`, `/historia/`, `/crencas/`, `/kids/`, `/ao-vivo/`, `/orgaos/` +
`/orgao/<slug>/`, `/congregacoes/` + `/congregacao/<slug>/`, `/transparencia/`,
`/duvidas-frequentes/`, `/mensagens/` + `/mensagem/<slug>/` + `/temas/` + `/tema/<tema>/` +
`/pregadores/` + `/pregador/<nome>/`, `/noticias/` + `/noticia/<slug>/`, `/galeria/`,
`/depoimentos/`, `/doacoes/`, `/visitante/`, `/privacidade/`, `/contato/`, `/busca/`.

**Eventos**: `/eventos/` (agenda + mapa do mês), `/eventos/exportar/` (PDF), `/evento/<slug>/`
(inscrição), `/cancelar-inscricao/<slug>/`, `/certificado/<slug>/`, `/checkin/<slug>/` (equipe,
autenticado), `/cracha/<slug>/`, `/pesquisa/<slug>/`, `/qrcode/<slug>/`,
`/verificar-certificado/<slug>/`.

**Camisetas e uniformes**: `/camisetas/`, `/camiseta/<slug>/`, `/meus-pedidos-camiseta/`,
`/painel-camisetas/` (gestão, autenticado).

**Comunidade e conta**: `/mural-de-oracao/`, `/enquetes/`, `/minha-conta/`.

**Painel de equipe**: `/painel-eventos/` (gestão de eventos, autenticado), `/painel-conteudo/`
(notícias, mensagens, FAQ, programação, galeria, ministérios, história, páginas fixas, relatórios de transparência e, para a Diretoria, a moderação de depoimentos e do mural, autenticado — ver [Painel de conteúdo](#painel-de-conteúdo)),
`/painel/<local>/` (telão "hoje na igreja", sem autenticação — pensado para um aparelho fixo na recepção).

**Sistema**: `/404`, `robots.txt`, `sitemap.xml`, `rss.xml`, `/busca` (índice JSON),
`/ieadespa.vcf`, `/programacao-semanal.png`, `/api/versiculo-imagem` (imagem dinâmica do
versículo do dia, para compartilhar).

## Funcionalidades por área

### Eventos

O módulo de eventos passou por três formatos até chegar no atual (a "Tentativa nº 1", com controle
financeiro por pessoa dentro do site, foi construída, testada e depois **abandonada** — comparado
com uma plataforma de eventos de verdade, a conclusão foi que só interessa um total geral por
evento, lançado manualmente no sistema de gestão de membros; e-mail nunca é armazenado por padrão).
O modelo atual:

- **Evento semanal (culto)** — coleção `programacao` do Directus (a agenda litúrgica do sistema
  de governança, v7.2, está pronta para assumir quando a CLI conferir; ver abaixo), sem inscrição.
- **Evento simples** — coleção `eventos`, sem inscrição: data, horário de término, local (texto
  livre ou puxado automaticamente de uma `congregacao` vinculada), responsável. Arquivamento
  automático diário (Flow do Directus, 3h da manhã) some eventos passados da lista principal sem
  apagá-los — necessário desde que a agenda passou de ~100 eventos cadastrados.
- **Evento com inscrição, perguntas 100% customizadas** — sem nenhum campo fixo além de nome e
  telefone. Cada evento define suas próprias perguntas (`perguntas_evento`: texto curto/longo,
  seleção única/múltipla, número, data), respondidas em `respostas_inscricao`. Recursos por cima
  disso: vagas limite e prazo de inscrição automáticos, lista de espera com promoção automática ao
  cancelar, aprovação manual opcional (`pendente_aprovacao`), cupom de desconto, inscrição em grupo,
  faixas de valor, e-mail de confirmação opcional (Azure Communication Services).
- **Check-in sem exigir login de quem está na porta** — código curto de 6 caracteres (sem
  caracteres ambíguos) gerado na inscrição; `/checkin/<slug>/` (a tela usada pela equipe) exige
  login real do Directus; o autoatendimento (`/qrcode/<slug>/`) e o crachá/certificado usam
  código+telefone, nunca login.
- **Certificado e crachá** — PDF gerado no navegador (`jsPDF`), só para quem confirmou presença;
  `/verificar-certificado/<slug>/` permite que um terceiro confira a autenticidade só pelo código,
  sem precisar do telefone.
- **Pesquisa de satisfação pós-evento** — mesma verificação código+telefone, só depois de
  `presente: true`.
- **Exportação em PDF da agenda** (`/eventos/exportar/`) — agrupável por mês ou responsável, com
  mapa por evento quando há local confirmado.
- **Notificação push** — aviso geral de eventos chegando (com preferência por responsável) e
  lembrete individual de quem se inscreveu, via Service Worker + VAPID.
- **Mapas** — ver [Mapas (Google Maps Platform)](#mapas-google-maps-platform).

**Calendário oficial e agenda litúrgica (v7.2).** A grade semanal de cultos e os eventos
especiais do calendário oficial nascem no sistema de governança e chegam ao site em tempo de
build, por `GET https://app.ieadespa.org.br/api/agenda-publica/tudo` (sem login; ver
[src/lib/agendaOficial.ts](./src/lib/agendaOficial.ts)). A grade (`liturgia`) tem código pronto para
substituir a coleção `programacao` do Directus, mas está **desligada** (`USAR_GRADE_DO_SISTEMA` em
[src/lib/programacao.ts](./src/lib/programacao.ts)) até a CLI conferir a agenda litúrgica do
sistema: hoje a grade pública continua a do Directus. Os eventos oficiais são mesclados à lista do Directus em
`/eventos/`, `/eventos.ics` e na busca (`mesclarEventos`): o **Directus segue dono dos eventos com
inscrição/página própria** (`/evento/<slug>/`), mas quando o calendário oficial aponta o mesmo
`slugSite`, data e hora passam a ser as oficiais; os demais eventos oficiais aparecem sem página
própria, com uma etiqueta do tipo. Se o sistema não responder, o build **não quebra**: o site sai
com o que o Directus tem. O build publica `/agenda-versao.json` (hash do que foi mostrado) e o
workflow `.github/workflows/site-agenda-sync.yml` compara com `/api/agenda-publica/versao` a cada
20 minutos, disparando um novo deploy só quando a versão muda. Para testar o build contra um
servidor falso, defina `SISTEMA_API_URL`.

**Convidados dos eventos (v7.4).** Cada evento oficial pode trazer `convidados` (preletores,
cantores, bandas), mostrados como "Participação: ..." na lista e no `.ics` e como bloco
"Participações especiais" em `/evento/<slug>/`. Pelo Protocolo de Convidados (Regimento, Art. 111 e
111-A), o sistema só envia quem já foi autorizado (parecer do Conselho de Ética e Nada Consta da
Presidência, quando exigidos) e consentiu a divulgação do nome. As sessões e palestrantes do evento
continuam sendo do Directus.

**Canais oficiais (v7.3).** A página `/canais-oficiais/` (link no rodapé, em Institucional) lista os
canais de comunicação instituídos em nome da igreja (Estatuto, Art. 12). Os dados vêm do mesmo
`GET /api/agenda-publica/tudo` do calendário (campo `canais`), em tempo de build e com a mesma
`versao`: quando um canal é marcado ou desmarcado como público no sistema, o sincronizador
reconstrói o site. A lista mostra **só os canais marcados como públicos** no sistema; sem nenhum, a
página explica que a relação está sendo organizada e aponta a Secretaria, e se a API estiver fora
do ar no build ela avisa que não foi possível carregar a lista (o build nunca quebra). O `link` de
cada canal só é aceito se começar com `https://`, `mailto:` ou `tel:`, e nada vindo da API entra
como HTML.

### Camisetas e uniformes

Arquitetura em carrinho, com atribuição por congregação e alocação de pagamento parcial:

- **`camiseta_grupos`** — a campanha (ex. "Camiseta do aniversário 2026"), com preço de venda e
  prazo.
- **Camiseta gratuita** — deixar "Valor de venda" em branco (e nenhum tamanho com preço próprio)
  já torna a campanha inteira grátis; o site mostra "Grátis" explicitamente (cards de
  `/camisetas/`, página da campanha, "Meus pedidos") em vez de simplesmente omitir o preço.
- **Preço por tamanho (Fase 27)** — `camiseta_grupos.precos_tamanho` (JSON opcional,
  `{"M": 20, "G": 40}`) permite um preço diferente por tamanho dentro da mesma campanha; tamanho
  sem entrada aí usa "Valor de venda" como padrão (ou é grátis, se nem isso estiver definido).
  Editado no painel (`/painel-camisetas/grupo/`) ao lado de cada tamanho já digitado no campo CSV.
  Como o preço deixou de ser único por campanha, a alocação de pagamento parcial (`/painel-
  camisetas/grupo/pedidos/`, `/meus-pedidos-camiseta/`, "Minha conta") passou a caminhar em
  dinheiro item a item (preço de cada item consumindo o valor pago, em ordem de criação), não mais
  em "peças equivalentes" a um preço único.
- **Limite de 1 peça por pessoa (Fase 27)** — `camiseta_grupos.limite_uma_por_pessoa` (opcional,
  desligado por padrão) trava o carrinho num só item de quantidade 1 no formulário público, e a
  Function `CriarPedidoCamiseta/index.js` recusa (`409`) um segundo pedido da mesma campanha vindo
  do mesmo telefone ou e-mail — mesma técnica de comparação por hash de `VerificarInscricao`
  (telefone nunca é comparado por igualdade direta, sempre com `conferirHash`, já que o hash usa
  salt aleatório). Por causa disso, o telefone passou a viajar em texto puro até essa Function (não
  mais pré-hashado no navegador via `/api/telefone-hash`) — mesmo padrão que `VerificarInscricao`/
  `ConsultarPedidosCamiseta` já usavam, só que agora também na criação do pedido.
- **`camiseta_lotes`** — janela de compra real (número sequencial + status aberto/fechado),
  seguindo o mesmo modelo já usado há anos na planilha de camisetas da tesouraria: todo pedido
  novo cai sozinho no lote que estiver aberto no momento; quando a equipe fecha o lote
  (`/painel-camisetas/grupo/pedidos/`), o próximo pedido já cria o lote seguinte sozinho, sem
  nenhuma ação manual de agrupar pedido a lote.
- **`camiseta_lote_itens`** — por tamanho/modelo, dentro de um lote: quanto o sistema já
  consolidou de pedido (calculado, não editável enquanto o lote está aberto), quanto de estoque
  extra a equipe decidiu comprar a mais, e o custo/peça pago à malharia naquele lote — o total a
  encomendar é a soma dos dois primeiros.
- **Números travados no momento de fechar o lote**: "Vendido/Arrecadado/Pago à malharia/Saldo" (e
  o "pedido pelo sistema" de cada tamanho/modelo) são recalculados ao vivo só enquanto o lote está
  **aberto**. Ao fechar, esses valores são gravados como um retrato fixo
  (`camiseta_lotes.total_vendido/total_arrecadado/total_pago_malharia/saldo`,
  `camiseta_lote_itens.pedido_congelado`) e nunca mais recalculados — editar ou excluir um pedido
  daquele lote depois não muda o valor já reportado/pago, porque esse dinheiro já saiu de verdade.
  Decisão do usuário, depois de mostrar a planilha real da tesouraria: os PDFs de lotes fechados
  antigos (`LOTE 1.pdf`, `LOTE 2.pdf`...) são retratos, não fórmulas, exatamente por isso.
- **`camiseta_pedidos`** + **`camiseta_itens_pedido`** — um pedido é um carrinho (várias
  linhas de tamanho/modelo/quantidade), com pagamento parcial alocado item a item, em ordem de
  criação. Venda avulsa (sem congregação, sem lote — mesmo "AVULSO" da planilha) também é
  suportada.
- **Criação do pedido é toda feita numa Function** (`api/CriarPedidoCamiseta/index.js`,
  rota `/api/criar-pedido-camiseta`) — não existe mais permissão pública de criar
  `camiseta_pedidos`/`camiseta_itens_pedido`/`respostas_pedido_camiseta` direto no Directus. A
  Function decide sozinha em qual lote o pedido cai (encontra o aberto, ou cria o próximo número
  se não houver nenhum), evitando tanto expor essa lógica no navegador quanto duas pessoas criarem
  o "lote 1" ao mesmo tempo.
- **Consulta pública** (`/meus-pedidos-camiseta/`) — só por telefone, sem código, por decisão
  explícita de simplicidade.
- **Painel de gestão** (`/painel-camisetas/`) — CRUD de campanha, abas por lote (todos os
  lotes/lote N/avulso), fechamento de lote, consolidado editável, venda de balcão (abaixo),
  controle de retirada.
- **Venda de balcão e a função "Gestor de Camisetas" (13/10/2026, pedido do responsável)** — quem
  cuida das camisetas lança, pelo painel (`/painel-camisetas/grupo/pedidos/` → "+ Registrar venda"),
  a venda para quem está na sua frente, muitas vezes sem telefone nem e-mail: nome (obrigatório),
  telefone e e-mail se houver, congregação, itens (tamanho/modelo/quantidade), valor já pago e o
  **lote** — o que está aberto (padrão; nasce o próximo se nenhum estiver), outro lote escolhido ou
  **Avulso** (peça de estoque, sem lote; é a antiga "venda avulsa"). Vale com a campanha aberta ou
  fechada para o público (a regra de prazo é do formulário público). Passa pela Function
  `api/RegistrarVendaBalcao/` (`POST /api/registrar-venda-balcao`), não direto pelo navegador,
  porque o telefone precisa virar hash (scrypt), chave de busca (HMAC) e número cifrado — o segredo
  dessas contas só existe no servidor; com isso a pessoa acha a venda em "Meus pedidos" pelo
  telefone e o painel abre o WhatsApp dela. **A função não usa o token de administrador:** grava com
  o token do próprio gestor (`x-painel-token`), então quem o Directus não deixaria criar pedido não
  cria por aqui. Avisa e pede confirmação (409) quando já existe pedido com o mesmo telefone ou
  e-mail na campanha e quando o lote escolhido já está fechado (a encomenda dele já foi feita; a
  peça ficaria fora dela). Regra pura em `api/src/lib/vendaBalcao.js`; bateria
  `scripts/testes/balcao.cjs`. **Função no Directus:** "Gestor de Camisetas" (política própria, sem
  acesso ao painel do Directus): lê/cria/edita campanha e cria/lê/edita/apaga pedido, item de pedido,
  lote, estoque do lote, pergunta e resposta — **não apaga campanha** e **não enxerga mais nada** do
  site (notícias, eventos, inscrições, contas dão 403). Para dar a função a alguém: Directus →
  Usuários → criar o usuário com a função "Gestor de Camisetas" e entrar em
  `/painel-camisetas/entrar/`.
- **Tirar reserva, reenviar aviso e aviso em massa seletivo (15/10/2026, pedido do responsável)** — a
  reserva de uma camiseta é a marca "Separado" do pedido (`separado`/`separado_em`). Até aqui só havia
  "Marcar como separado"; quem não vinha buscar não tinha como perder a reserva, e "Retiradas = 0" não
  resolve (é a quantidade já levada). Agora, no cartão do pedido (`/painel-camisetas/grupo/pedidos/`):
  **"Tirar reserva"** (com confirmação) volta o pedido a "ainda não separado" **sem apagá-lo e sem mexer em
  "Retiradas", valor pago ou lote**, e não manda e-mail; some quando a pessoa já levou tudo. **"Reenviar
  aviso"** manda de novo o e-mail de "pode retirar" ao e-mail do pedido (aparece para quem está separado ou
  quando a retirada foi liberada para o grupo) e atualiza o carimbo "avisado em"; a falha do envio é
  avisada e não carimba. No **aviso em massa** (campanha → "E-mail de retirada"): caixa **"só quem está
  separado"** e filtro **"só do lote"**; em modo seletivo **não libera a retirada para todos** (isso é do
  envio a todos), e a contagem do "Conferir" segue o filtro (`somenteSeparados`, `loteId` em
  `api/AvisarRetiradaCamisetas`). **O aviso individual (`api/EnviarAvisoRetiradaCamiseta`) foi fechado em 15/10/2026**: antes era uma porta
  pública que mandava e-mail para o endereço e com o texto que a chamada trouxesse (o login só protegia o botão,
  não a porta; o código é aberto no GitHub). Agora exige o token do painel (`x-painel-token`), lê o pedido no
  Directus **com o token da própria pessoa** e recebe só o `pedidoId`: destinatário, itens, local, assunto e
  texto vêm do pedido e da campanha, nunca da chamada; só envia se o pedido tem e-mail, não é avulso e está
  separado (ou a retirada foi liberada ao grupo). O robô de avisos de conteúdo novo
  (`scripts/send-content-notifications.mjs`) também passou a ignorar itens com slug "teste-…". A função do
  aviso em massa agora **erra de forma explícita (502)** quando uma consulta
  ao Directus falha, em vez de contar zero e o painel dizer "Pronto: 0". Bateria `scripts/testes/reserva.cjs`
  (só simula, nunca envia e-mail).
- **Filtros de separação, separação em massa e campanha grátis (15/10/2026, pedido do responsável durante a
  entrega da Marcha para Jesus)** — o chip "Com peça a retirar" misturava quem já tinha a peça separada e
  quem não. Agora os chips são: Todos · Devendo · Pago parcial · Pago · **Falta retirar (todos)** ·
  **Separados (aguardando)** · **Não separados** · Já retirado tudo, **cada um com a contagem** do que está na
  tela (menos o próprio chip), e uma linha de resumo "Separados aguardando · Não separados · Já retirado
  tudo". **Separação em massa** (barra abaixo dos filtros): "Marcar como separado" e "Tirar a reserva" valem só
  para o que está na tela (filtros e aba do lote incluídos), ficam de fora os já separados, quem já levou tudo e
  as vendas avulsas, e há o campo **"os primeiros N"** (os pedidos mais antigos primeiro) para separar só quanto
  chegou de peças. Confirma mostrando quantos e quais (#a até #b); acima de 100 pedidos, ou sem nenhum filtro
  ligado, exige digitar SEPARAR/TIRAR; grava em lotes de 100; **não manda e-mail** (depois, na campanha, o aviso
  "só quem está separado"); **"Desfazer a última ação em massa"** devolve cada pedido ao estado de antes. Em
  **campanha grátis** (nenhum tamanho tem preço) somem os chips e cartões de dinheiro e o campo "Pago: R$" dos
  cartões — só reaparece, com um aviso, num pedido que já tenha valor lançado, para poder zerar (em 15/10/2026 a
  Marcha tinha 74 pedidos com R$ 1,00 "pago" que ninguém arrecadou; o Directus não guardou quem nem quando;
  foram zerados, com cópia do estado anterior).
- **Excluir os pedidos que ninguém veio buscar (16/10/2026, pedido do responsável: na Marcha para Jesus mais de
  300 pessoas não pegaram a camiseta e a peça precisa passar para o próximo)** — fica na página da **campanha**, na aba
  **"Excluir"** (a última, a mais escondida, junto de "Excluir a campanha inteira"); a tela de pedidos **não tem mais o
  botão**, para ninguém apertar sem querer (foi o responsável quem pediu a mudança no mesmo dia). O bloco **"Excluir os
  pedidos que ninguém veio buscar"** tem as escolhas de **lote**, **tamanho** e **modelo** e o campo **"só os primeiros
  N"**, mostra o resumo, a lista do que seria excluído e o botão "Excluir os pedidos (N)". A lista é lida ao abrir a aba
  (e em "Atualizar a lista"), sempre do Directus, e só entra pedido **não separado
  e em que ninguém levou nenhuma peça**: ficam de fora os separados, as vendas avulsas, quem já levou tudo **e quem
  levou só parte** (apagar apagaria a prova do que a pessoa recebeu). **A conta da malharia não muda nos lotes
  fechados**: o lote fechado guarda os números congelados no fechamento (`total_vendido`, `total_arrecadado`,
  `total_pago_malharia`, `saldo` e, por tamanho, `pedido_congelado`) e nunca os recalcula; no lote **aberto** a conta é ao
  vivo e diminui, e a confirmação avisa com destaque quantos pedidos estão em cada caso. Passos: (1) confirma dizendo
  quantos, do #a ao #b, as peças por tamanho e o que acontece com a malharia; (2) pede para **digitar EXCLUIR** (sempre,
  mesmo com poucos pedidos); (3) relê os pedidos no Directus e, se alguém separou ou deu retirada no meio, **não apaga
  nada**; (4) **baixa um arquivo de cópia** (`pedidos-excluidos-<campanha>-<data>.json`, com todas as colunas, itens e
  respostas e os mesmos números); (5) apaga em lotes de 100 (o banco apaga itens e respostas em cascata); (6) aparece
  **"Desfazer a exclusão"**, que recria tudo com os **mesmos números** (só a data de criação passa a ser a da
  restauração, porque o Directus a preenche sozinho; a mensagem do desfazer fica na tela depois de a lista recarregar).
  Fechou a página? Restaura-se pelo arquivo:
  `DIRECTUS_URL=… DIRECTUS_ADMIN_TOKEN=… node site/scripts/restaurar-pedidos.mjs arquivo.json` (use `--conferir` para só
  ver; recusa restaurar o que já existe, para nunca duplicar). Regra pura em `src/lib/exclusaoEmMassa.ts` e a parte com
  rede (relê, baixa a cópia, apaga, desfaz) em `src/lib/exclusaoEmMassaAcao.ts`; provas:
  `scripts/testes/exclusao-unidade.cjs` (143, sem rede, com um Directus de mentira rodando o fluxo inteiro),
  `scripts/testes/exclusao.cjs` (31, contra o Directus; roda no CI) e a prova no Edge com a página real, na aba
  "Excluir" (59 verificações, campanha descartável: inclui que a tela de pedidos não tem mais o botão e que os números
  travados do lote fechado não mudam).
- **Limite de pedidos (16/10/2026, pedido do responsável: na Marcha são 140 camisetas e a 141ª tem de ser recusada)** — na aba **Dados**
  da campanha: **"Limite de pedidos"** (total, todos os tamanhos) e **"Limite por tamanho"**; em branco = sem limite. Vale para as peças dos
  **lotes abertos** da campanha (site e balcão, pagas ou não; pedido apagado libera a vaga na hora; venda avulsa e lote fechado não contam; ao
  fechar o lote o próximo começa do zero). A página pública mostra **"esgotado"** (o formulário some e volta sozinho se liberar vaga) e o tamanho
  esgotado fica desabilitado. **Como nunca passa do número**: o Directus não tem transação entre chamadas, então cada pedido grava, na MESMA
  transação, uma "senha" no livro `camiseta_controle` (chave única `campanha:n`, n = último + 1), depois de ler o último número e SÓ ENTÃO a
  soma das peças; se outro pedido pegou a mesma senha o banco recusa e se lê tudo de novo (`api/src/lib/limiteLote.js`, o raciocínio está no
  cabeçalho do arquivo). **Estabilidade** (o Directus B1 grava ~1,5 pedido/s): o hash do telefone é assíncrono e só calculado depois das
  recusas; os pedidos de uma campanha entram numa fila de um por vez por instância e quem não daria tempo recebe 503 "tente de novo" na hora;
  a instância lembra por 3 s o último número e as peças (pula 2 leituras por pedido; a idade conta desde a última leitura real); o lote é criado
  uma vez só por instância. Gestor: adicionar/editar item ou mover pedido que passa do limite **avisa e pede confirmação** (não bloqueia); o
  "Desfazer exclusão" não restaura o que não cabe. Esquema (2 campos na campanha + a coleção do livro, repetível, só acrescenta):
  `site/scripts/directus-limite-esquema.mjs`. Provas: `limite-unidade.cjs` (130, com 7 mutações que têm de reprovar), `limite-carga.cjs` (Directus
  real, 1 a 8 instâncias em processos separados), `limite.cjs` (HTTP, roda no CI) e o emulador `swa-local.cjs` (site + API contra um Directus de
  teste, sem tocar a produção).
- **Vagas e cupom das inscrições em evento (16/10/2026)** — medido no Directus local: com 20 vagas e 40 inscrições ao mesmo tempo, as 40 saíam
  **confirmadas** ("conta os confirmados, depois grava", sem trava), e o limite de usos do cupom tinha a mesma falha (lia `usos` e gravava
  `usos + n`). Agora, quando o evento tem limite de vagas (sem aprovação) ou o cupom tem limite de usos, a inscrição grava na MESMA transação uma
  senha no livro `evento_controle` (chave única `evento:n`, n = última + 1; ler a última senha, SÓ ENTÃO contar confirmados e usos; se outra
  inscrição pegou a senha o banco recusa e a leitura é refeita) — a mesma técnica do limite de pedidos das camisetas, em `api/src/lib/vagasEvento.js`
  (o raciocínio está no cabeçalho). Diferente do pedido de camiseta, **ninguém é recusado por falta de vaga**: quem não cabe entra na lista de
  espera, e o cupom esgotado só deixa de dar desconto. O limite do cupom passa a ser a **contagem das inscrições com o código**; o campo `usos` é só o
  número que o painel mostra. Evento sem limite e cupom sem limite seguem direto, sem trava. Estabilidade: fila de uma inscrição por vez por evento e
  instância (503 "tente de novo" na hora quando não daria tempo), hash do telefone assíncrono depois das recusas baratas, memória de 3 s da senha e
  das contagens, leitura do evento uma vez só por instância; falha do Directus ao ler o evento agora é 503, não "evento não encontrado". Sem o esquema
  aplicado a função grava do jeito antigo (e avisa no log), nunca deixa de aceitar inscrição. Esquema (a coleção do livro + 1 campo na inscrição,
  repetível, só acrescenta): `site/scripts/directus-vagas-esquema.mjs` — **aplicar no Directus ANTES de publicar o código**. Provas:
  `vagas-evento-unidade.cjs` (sem rede; inclui o teste do teste: sem a chave única, ou contando antes de ler a senha, a corrida estoura),
  `inscricao-carga.cjs` (Directus real local, 1 a 8 instâncias em processos separados; 120 inscrições para 40 vagas, com cupom e com grupos: sempre
  exato) e `inscricao-vagas.cjs` (HTTP, roda no CI).
- **PDF da malharia só com o resultado final (15/10/2026)** — o "Exportar PDF" do lote (o que vai para a malharia)
  trazia pedido pelo sistema, estoque extra e total: conta interna da igreja. Agora tem **duas colunas, Tamanho e
  Quantidade** (a quantidade final = pedidos + estoque extra), na ordem dos tamanhos da campanha, sem linha de
  quantidade zero, com a linha "Total de peças"; quando a campanha tem mais de um modelo, o modelo vai junto do
  tamanho ("M - Baby look"). A tela do consolidado continua com a conta completa. Regra pura em
  `src/lib/pdfMalharia.ts`.
- **Markdown das páginas públicas passa por um filtro (15/10/2026)** — as oito páginas que mostram texto escrito no
  Directus (notícia, mensagem, evento, órgão/ministério, história, sobre, crenças, visitante) chamavam o `marked`
  direto e jogavam o HTML na página; a política de segurança do site aceita script em linha, então quem edita um
  texto poderia publicar script. Agora usam `src/lib/markdownSeguro.ts`: HTML escrito à mão no texto vira texto
  visível (nunca marcação) e link/imagem só com endereço http(s), mailto/tel (só link), relativo ou âncora. Nos 39
  textos que o site tem hoje a saída é **idêntica** (conferido também comparando as 33 páginas montadas antes e
  depois: 0 diferenças). Quem precisar de quebra de linha usa dois espaços no fim da linha, não `<br>`. Teste à mão:
  `scripts/testes/markdown-seguro.mjs` (precisa do `marked` instalado; só lê o Directus).
- **Painel de pedidos no celular (13/10/2026)** — a barra de busca fica presa no alto durante a
  rolagem e os filtros ficam **recolhidos** atrás do botão "Filtros" (com um selo com quantos estão
  ligados); uma linha "Filtrando por: Tamanho GG" com o botão "Limpar" fica sempre à vista, para
  ninguém procurar um nome sem saber que um filtro esconde o pedido; um botão "Buscar pedido" no
  topo leva direto à busca. No computador nada muda. Também: a sessão do painel renova sem corrida
  (o token de renovação do Directus vale uma vez; duas renovações juntas mandavam a pessoa ao login,
  perdendo o que digitava) e a queda do tempo real nunca leva ao login.
- **Perguntas personalizadas por campanha** (`perguntas_camiseta`/`respostas_pedido_camiseta`) —
  espelha o mesmo sistema de eventos: cada campanha pode pedir campos extras no formulário público
  (ex. bairro, forma de retirada), com os mesmos 6 tipos de pergunta (texto curto/longo, seleção
  única/múltipla, número, data), geridos na página de edição da campanha em
  `/painel-camisetas/grupo/`.
- **Congregação é opcional de duas formas**: a pessoa sempre pode deixar em branco, e a campanha
  inteira pode desligar a pergunta (`pedir_congregacao`, no formulário de edição) para casos onde
  vincular a uma única congregação não faz sentido — ex. uma marcha que reúne várias igrejas da
  cidade, onde faz mais sentido perguntar bairro (via pergunta personalizada) do que congregação.
- **Inativação**: não existe um botão "excluir" separado de "inativar" — os dois mecanismos já
  cobrem os dois casos. Desmarcar "Ativo" tira a campanha do ar imediatamente (some da listagem
  pública e para de aceitar pedido nesse instante). "Pedidos até" faz o mesmo automaticamente
  quando a data passa — sem precisar de ação manual — mas os pedidos já feitos continuam existindo
  e geríveis no painel; nada é apagado por expirar.
- **Painel de pedidos com os mesmos filtros de eventos**: busca por nome, chips (Todos/Devendo/
  Pago/Com peça a retirar/Já retirado tudo) e um filtro por resposta de uma pergunta personalizada
  de seleção (ex. filtrar só quem respondeu "Zona Norte"). Sem exportação de dado pessoal
  (nome/telefone) para Excel/CSV, de propósito — mesmo motivo já documentado para eventos: manter
  dado pessoal só dentro do painel controlado, não solto circulando em arquivo. A exportação em PDF
  da Fase 28 (abaixo) foge dessa regra de propósito — é só contagem agregada por tamanho/modelo,
  sem nome nem telefone de ninguém.
- **Editar item de um pedido já feito** (`/painel-camisetas/grupo/pedidos/`) — trocar tamanho/
  modelo/quantidade, remover uma linha ou adicionar uma nova a um pedido existente, em vez de só
  poder excluir o pedido inteiro. Trava de segurança: só libera editar/remover um item enquanto
  `quantidade_retirada` daquele item for 0 (pra não apagar o registro de uma peça que a pessoa já
  pegou). Funciona igual com o lote aberto ou fechado — "Vendido/Arrecadado/Pago à malharia" de um
  lote fechado vêm de um retrato congelado (ver acima), nunca recalculado a partir dos pedidos
  atuais, então editar aqui corrige só o que a pessoa deve/tem a retirar dali pra frente, sem mudar
  nenhum número já travado do lote.
- **Separação e aviso de retirada (Fase 28)** — `camiseta_pedidos.separado`/`separado_em`: a
  equipe marca um pedido como "separado" quando a peça chega da malharia e é reservada pra aquela
  pessoa (botão no painel de pedidos, não se aplica a venda avulsa — essa já sai na hora). Quem
  deixou e-mail recebe um aviso automático (`api/EnviarAvisoRetiradaCamiseta/`, melhor esforço,
  mesmo padrão do resto do e-mail transacional do site via ACS) com a lista de itens e o local de
  retirada; texto do e-mail é customizável por campanha (aba "E-mail de retirada" na edição da
  campanha — assunto e um parágrafo, texto simples, nunca HTML livre). O painel também mostra
  "Separado há N dia(s), aguardando retirada" pra quem não veio buscar ainda, e o status "✅ Pronto
  pra retirar!" aparece em `/meus-pedidos-camiseta/` e "Minha conta" mesmo pra quem não deixou
  e-mail.
- **Abas na edição da campanha (Fase 28)** — `/painel-camisetas/grupo/` deixou de ser um formulário
  único e comprido: agora tem 4 abas (Dados da campanha, Perguntas personalizadas, E-mail de
  retirada, Excluir), mesmo padrão de abas já usado em `/painel-eventos/evento/` (`.tab-bar`/
  `.tab-btn`, JS de toggle idêntico).
- **Exportar PDF do consolidado (Fase 28)** — botão "Exportar PDF" no painel de um lote, gera um
  PDF (tamanho/modelo/pedido pelo sistema/estoque extra/total a encomendar) pra mandar pra
  malharia, a partir dos mesmos dados já calculados na tela (sem consulta nova) — mesma técnica
  manual de desenho de tabela em `jsPDF` (sem lib de tabela) já usada em `/eventos/exportar/` e no
  relatório de encerramento de evento.
- **Dashboard consolidado e relatório em PDF, por campanha (Fase 29, reposicionado na Fase 31)** —
  aba "Consolidado" em `grupo/index.astro` (não em `/painel-camisetas/`, que ficou só a listagem —
  a primeira versão somava todas as campanhas juntas numa página só, decisão do usuário de reverter
  por achar confuso): vendido/arrecadado/pago à malharia/saldo, peças pedidas/separadas aguardando
  retirada/já retiradas **desta campanha**, mesma lógica de congelado-se-fechado/ao-vivo-se-aberto
  de `grupo/pedidos.astro`, um nível acima (soma os lotes da campanha, não só um). Dois gráficos de
  barra (`site/src/lib/graficos.ts`, `graficoBarrasSvg`/`desenharGraficoBarrasPDF` — o mesmo
  utilitário genérico já usado no histórico de eventos, não específico de pergunta de pesquisa):
  "Peças por tamanho" e "Peças por situação" (retiradas/aguardando retirada/ainda não separadas) —
  só essas duas, porque são frações de um todo (o rótulo do gráfico mostra `total · percentual%`,
  que só faz sentido pra valores que somam 100% entre si; dinheiro fica só em cards de número).
  Botão "Exportar relatório PDF" gera a mesma coisa em PDF — só números agregados desta campanha,
  sem nome nem telefone de ninguém, mesmo critério do PDF de lote.
- **Sincronização em tempo real no painel (Fase 30, ampliada na Fase 31)** — antes, cada navegador
  só via o que a própria pessoa fazia; se duas pessoas da equipe mexessem em pedidos/campanhas ao
  mesmo tempo em abas diferentes, cada uma ficava com a tela desatualizada até recarregar. Primeira
  conexão realtime **autenticada** deste projeto (o mural de oração já usava `WebSocket` nativo
  contra `wss://<directus>/websocket`, mas numa coleção pública, sem autenticação — protocolo de
  auth confirmado na [documentação oficial do Directus](https://directus.io/docs/guides/realtime/authentication):
  `{type: "auth", access_token}` logo após abrir a conexão, reconecta com token renovado quando o
  servidor fecha por token expirado; precisou de `WEBSOCKETS_ENABLED=true` nas Application Settings
  do App Service do Directus — desligado por padrão em instalação própria, nunca tinha sido ligado
  antes, então o "tempo real" do mural de oração nunca funcionou de verdade até esse dia). Em
  `grupo/pedidos.astro`, qualquer mudança relevante (`camiseta_pedidos`/`itens_pedido`/`lotes`/
  `lote_itens` desta campanha) recarrega e re-renderiza sozinho — decisão deliberada de recarregar
  tudo em vez de mesclar evento por evento no estado local, mais simples e confiável pro volume de
  dados de uma igreja; com trava pra não fechar por baixo da pessoa um item que ela esteja editando
  e ainda não salvou (adia até ela terminar). Em `grupo/index.astro` — página que é o formulário
  inteiro o tempo todo — as coleções que afetam campo de formulário (`camiseta_grupos`/
  `perguntas_camiseta`) só mostram um aviso "Esta campanha foi alterada por outra pessoa" (a pessoa
  decide quando recarregar, não arrisca apagar o que não foi salvo); as que só alimentam a aba
  "Consolidado" (só leitura, Fase 31) recalculam e re-renderizam sozinhas, sem aviso — não há o que
  perder ali. Em `/painel-camisetas/` (só listagem desde a Fase 31), sem edição em andamento pra
  proteger, recarrega direto.
- **Achado real (Fase 32): editar camiseta/evento/FAQ/depoimento/enquete nunca disparava rebuild
  automático do site** — o Flow do Directus que avisa o GitHub pra publicar (`Publicar site
  (avisar GitHub)`, `event`, escopo `items.create/update/delete`) tem uma lista fixa de coleções
  observadas. `camiseta_grupos`/`perguntas_camiseta` nunca estiveram nela desde que camisetas foi
  construído (Fase 22) — foi assim que a imagem da Fase 31 ficou "presa": salva no Directus,
  visível no painel, mas nunca chegava ao site público sem um `git push` manual. Auditando o resto
  do site à procura do mesmo padrão (qualquer coleção lida em tempo de build — frontmatter de
  `.astro`, não dentro de `<script>` — mas fora da lista do Flow), achou também
  `perguntas_evento`/`faq`/`depoimentos`/`enquetes` com o mesmo problema. Todas as seis
  adicionadas de uma vez; a lista completa hoje é: `mensagens`, `relatorios`, `ministerios`,
  `eventos`, `galeria`, `orgao_membros`, `orgao_categorias`, `configuracoes`, `noticias`,
  `historia`, `programacao`, `visitantes`, `sessoes_evento`, `camiseta_grupos`,
  `perguntas_camiseta`, `perguntas_evento`, `faq`, `depoimentos`, `enquetes`. Confirmado
  funcionando de ponta a ponta: um toque de teste em `camiseta_grupos` disparou o
  `repository_dispatch` e o deploy sozinho, sem nenhum `git push`.
- **Imagem de compartilhamento por campanha (Fase 31, corrigida na Fase 32)** —
  `camiseta_grupos.imagem` (mesmo tipo de campo que `eventos.cover`, upload pela aba "Imagem" na
  edição da campanha) aparece na prévia quando o link de `/camiseta/<slug>/` é compartilhado
  (WhatsApp, redes sociais), no lugar da logo genérica do site — e também **visível na própria
  página pública** (Fase 32; a Fase 31 só tinha resolvido a meta tag invisível de prévia, não a
  imagem em si na tela). Se a campanha estiver vinculada a um evento, mostra as duas imagens (a da
  campanha e a do evento) lado a lado na página — a prévia de link (que só tem espaço pra uma)
  continua com prioridade pro evento.

### Painel de conteúdo

Uma página feita para o **celular**, no lugar do Directus "cru", para a equipe escrever e editar o que
aparece no site **sem precisar abrir o Directus**: notícias, mensagens (pregações e estudos), perguntas
frequentes, programação semanal, galeria de fotos, ministérios, a história da igreja, os textos fixos
de "Sobre" e "Crenças" e os **relatórios de transparência** (PDF) — e, só para a Diretoria, a **moderação**
do que o público envia pelo site (depoimentos e pedidos do mural de oração). Endereços:
`/painel-conteudo/` (início, com os cartões agrupados em quatro seções — "Moderação", "Notícias e
mensagens", "Páginas e informações" e "Institucional" — e uma frase embaixo de cada cartão; só aparece o
que o perfil consegue ler), `/painel-conteudo/entrar/` (login),
`/painel-conteudo/lista/?tipo=…` (lista com busca pelo título), `/painel-conteudo/editar/?tipo=…&id=…`
(formulário; sem `id` cria um item novo) e `/painel-conteudo/moderar/?tipo=depoimentos|mural_oracao`
(moderação, descrita mais abaixo). Como os outros painéis, entra com a **própria conta do
Directus** (tokens em `sessionStorage`, chaves `painel_conteudo_token` e `painel_conteudo_token_refresh`)
e **toda leitura e gravação vai ao Directus com o token da pessoa**: quem decide o que cada um pode
fazer é o Directus; a tela só mostra o que ele permite (um 403 vira "Seu perfil não pode … aqui").
A moderação e os relatórios são **só da Diretoria** (funções "Semi-administrador" e "Administrator"): o
"Editor de notícias" não tem essas coleções (403) e não vê os cartões.

| Tipo (`?tipo=`) | Coleção | Aparece em | Rascunho | Ordem manual (▲/▼) |
| --- | --- | --- | --- | --- |
| `noticias` | `noticias` | `/noticias/` | sim (`draft`) + aviso no navegador | não (a data decide) |
| `mensagens` | `mensagens` | `/mensagens/` | sim (`draft`) + aviso no navegador | não (a data decide) |
| `faq` | `faq` | `/duvidas-frequentes/` | sim (`draft`), **sem** aviso | dentro de cada categoria |
| `programacao` | `programacao` | `/` e `/contato/` | não | dentro de cada dia da semana |
| `galeria` | `galeria` | `/galeria/` | não | dentro de cada álbum |
| `ministerios` | `ministerios` | `/orgaos/` e `/orgao/<slug>/` | não | dentro de cada tipo de órgão |
| `historia` | `historia` (+ `historia_files`) | `/historia/` | não | uma fila só |
| `relatorios` | `relatorios` | `/transparencia/` | não | não (a data decide) |
| `configuracoes` | `configuracoes` (item único) | `/`, `/sobre/`, `/crencas/` | não | não |

- **Quem usa** (funções do Directus): "Editor de notícias" cobre notícias, mensagens, FAQ, programação,
  galeria, ministérios e história (incluindo as fotos extras, `historia_files`), envia imagem (só
  JPEG, PNG, WebP e GIF, sem apagar arquivo) e **lê** `orgao_membros`/`orgao_categorias`.
  "Semi-administrador" e "Administrator" editam as páginas fixas (`configuracoes`) — **só** eles; o
  Editor de notícias recebe 403 e o cartão nem aparece. Atenção: a função "Semi-administrador"
  **ainda não tem** permissão em `faq`, `historia_files`, `orgao_categorias` e `orgao_membros`
  (conferido com `/permissions/me`): ela não vê o cartão de FAQ; na história, o campo de fotos extras vira
  um aviso ("Seu perfil não pode ver nem mudar estas fotos aqui") em vez de fingir que não há fotos; e,
  em ministérios, o "Tipo de órgão" não carrega a lista. Dar essas permissões é decisão do responsável
  (no Directus), não do código. O que é confidencial — `mural_oracao`, `contas`, `contas_codigos`,
  inscrições, pedidos de camiseta, `push_subscriptions`, `contato_mensagens`, relatórios, depoimentos —
  o Editor de notícias **não alcança** (403); a bateria `site/scripts/testes/conteudo.cjs` confere isso
  (inclusive pelo mapa `/permissions/me`, sem gravar nada), o envio só de imagem e as cinco páginas, a
  cada montagem (passo "Painel de conteúdo" do `site-testes.yml`). **Só a Diretoria** ("Semi-administrador"
  e "Administrator") lê, grava e apaga `depoimentos`, `mural_oracao` e `relatorios` e envia **imagem e
  PDF** (`directus_files:create` aceita JPEG, PNG, WebP, GIF e PDF; o Editor de notícias, só as imagens).
- **Com rascunho × sem rascunho**: tipos com `draft` (notícias, mensagens, FAQ) têm "Salvar rascunho" e
  "Publicar" (depois, "Salvar alterações" e "Voltar para rascunho"); nada de agendamento (o site só esconde
  o rascunho, não olha a data — por isso o campo se chama "Data exibida"). Publicar notícia/mensagem com
  `notificacao_enviada = false` **notifica gente de verdade** (o robô `scripts/send-content-notifications.mjs`
  marca o campo, que é **somente leitura** na tela); a confirmação diz isso. **Os demais tipos não têm
  rascunho: o que for salvo vai ao ar na próxima montagem do site** (até uns 20 minutos; montagem
  automática a cada 15 min). Por isso o formulário tem um botão só, **"Salvar — aparece no site em até uns
  20 minutos"**, a lista não mostra "Publicado/Rascunho", e **excluir** continua exigindo digitar EXCLUIR.
- **Ordem manual** (`ordem: { campo: "sort", agruparPor }`): a lista mostra **▲ e ▼** em cada item. Um
  toque troca o valor de `sort` com o do vizinho **visível do mesmo grupo** — um único `PATCH` em lote
  (`PATCH /items/<coleção>` com `[{ id, sort }, { id, sort }]`, tudo ou nada) — e a lista já mostra a nova
  ordem, avisa o leitor de tela e mantém o foco na seta. Se algum item do grupo não tem `sort` ou há
  valores repetidos, o grupo é renumerado 1, 2, 3… (só vão os que mudam). Item **novo** entra no fim do
  grupo (`maior sort + 1`, perguntado ao Directus na hora de salvar); item que **muda de grupo** (ex.:
  pergunta que troca de categoria) também vai para o fim do grupo novo. O campo `sort` nunca aparece no
  formulário. Funções puras testadas em `site/scripts/testes/painel-unidade.cjs`: `calcularTroca`,
  `montarGrupos`, `proximaOrdem`, `consultaMaiorOrdem`.
- **Item único** (`unico: true`, hoje `configuracoes`): não existe lista; o cartão abre direto o formulário
  (`editar/?tipo=configuracoes`, sem `id`), lê e grava no endereço do singleton (`/items/configuracoes`),
  manda só o campo que mudou, e não tem "novo" nem "excluir". As páginas "Sobre" e "Crenças" são Markdown:
  **cada título (`##`) vira uma seção** da página (ver `quebrarEmSecoes` em `src/lib/markdown.ts`).
  A bateria nunca grava nessa coleção — e confere o texto antes e depois.
- **Várias fotos** (campo `tipo: "imagens"`, hoje `historia.fotos` via `historia_files`): "Adicionar
  fotos" aceita várias de uma vez, mostra miniaturas com ◀ ▶ (ordem) e "Remover" (tira só a ligação; o
  arquivo continua no Directus). Ao salvar manda a diferença no formato do Directus
  (`{ create: […], update: […], delete: […] }` — `diferencaFotos`) e relê as linhas novas para não duplicar
  nada na gravação seguinte. Se o perfil não pode ler a tabela de ligação, o campo vira um aviso e as
  fotos ficam intactas.
- **Perguntas frequentes**: "Grupo da pergunta" tem as mesmas oito opções do campo `categoria` do Directus
  e de `CATEGORY_ORDER` em `src/lib/faq.ts` (nova categoria = Directus + este arquivo + `faq.ts`). A resposta
  é texto simples (o site a mostra sem formatação). **Galeria**: a "Descrição da foto" (`alt`) é
  **obrigatória** e a tela explica por quê: é o que o leitor de tela lê para quem é cego ou tem baixa
  visão; o campo "Álbum" sugere os álbuns que já existem (para não escrever o mesmo nome de dois jeitos);
  sem álbum a foto vai para "Outras fotos". **Programação**: o dia é obrigatório e começa em branco (escolha
  consciente); "Qual domingo do mês" só vale para "Domingo à noite". **Ministérios**: o endereço (slug) é
  único e vira `/orgao/<slug>/`; o tipo vem de `orgao_categorias`; excluir um ministério que ainda tem
  membros ou notícias ligadas é recusado pelo Directus e a tela explica.
- **Relatórios de transparência** (`relatorios`, só Diretoria): título, período (a etiqueta ao lado do título
  na página), data (só ordena: o mais recente primeiro), resumo (opcional) e o **arquivo PDF** — todos
  obrigatórios menos o resumo, conferidos no navegador. Sem rascunho: o que for salvo aparece em
  `/transparencia/` na próxima montagem (o botão diz isso). A lista traz **"Abrir PDF"** em cada item e o
  link "Ver a página “Transparência” no site". A página pública só lista relatório que tem arquivo.
- **Envio de PDF** (campo `tipo: "arquivo"`, com `regraArquivo: REGRA_PDF`): "Escolher arquivo" abre o
  seletor do aparelho. **Antes de enviar** o navegador confere, com frase em português (e sem mandar nada
  ao servidor quando recusa): só **PDF** (tipo `application/pdf`; aparelho que não informa o tipo vale pela
  extensão `.pdf`; Word e Excel pedem "Salvar como PDF"), arquivo **não vazio**, no máximo **25 MB**
  ("O arquivo tem 26 MB e o limite é 25 MB…") e **conteúdo de PDF de verdade** (começa com `%PDF-`; um
  arquivo só renomeado para `.pdf` é barrado). Enviado, o campo mostra **nome, tamanho** (lidos do Directus)
  e o link **"Abrir / baixar"**; **"Trocar arquivo"** envia outro e avisa que o anterior **continua
  guardado no Directus**, só sem ligação com o relatório (o painel nunca apaga arquivo). Qualquer pessoa
  baixa o PDF direto de `/assets/<id>` (a leitura pública de `directus_files` já existe): a tela avisa que
  **não se deve enviar nada sigiloso** (CPF, endereço, dados de membros). Funções puras testadas:
  `validarArquivoPorRegra`, `tamanhoLegivel`, `confereAssinatura`.
- **Moderação** (`/painel-conteudo/moderar/?tipo=depoimentos` ou `mural_oracao`, só Diretoria): na página
  inicial, a seção **"Moderação"** (a primeira) tem um cartão para cada assunto com a contagem do que espera
  decisão ("3 aguardando", "2 aguardando · 1 confidencial"; o cartão some para quem não lê a coleção). A
  tela tem **abas** — "Aguardando" (`aprovado = falso`, e no mural `confidencial` diferente de verdade),
  "Publicados" (`aprovado = verdadeiro`) e, só no mural, "🔒 Confidenciais (só a equipe pastoral)" ("Só a
  Diretoria vê esta aba") — com a contagem em cada uma, e `?aba=` no endereço. Os filtros tratam campo vazio
  como "não" e as três abas juntas cobrem todos os itens, sem sobrepor (conferido pelo teste de unidade e,
  com o Directus de verdade, pela bateria). Cada item é um cartão com nome (ou "Anônimo"), data e hora
  locais, o **texto inteiro** (sempre `textContent`, com as quebras de linha; HTML escrito pela pessoa não
  executa), a miniatura da foto (depoimentos), o selo "Consentimento LGPD: sim/não" e, no mural, "🙏 N
  orando" (só leitura: o contador é da Function `OrarMural`). Do mais novo para o mais antigo, 20 por vez
  ("Mostrar mais"). **Ações**: **Aprovar** (grava só `{ aprovado: true }`), **Tirar do ar** (só
  `{ aprovado: false }`; um toque, sem confirmação, por ser o caminho seguro) e **Excluir** (digitar
  EXCLUIR). **Regras da tela**: depoimento **sem consentimento LGPD não se aprova** (botão desligado, com o
  motivo escrito ao lado; o mesmo vale para pedido do mural, porque o formulário público exige a caixa);
  pedido **confidencial não tem Aprovar** — só o rótulo "Confidencial: só a equipe pastoral lê; nunca é
  publicado" e Excluir (a confirmação pede que se exclua só depois do atendimento pastoral); aprovar um
  depoimento avisa que ele aparece "na próxima montagem (em até uns 20 minutos)", e aprovar um pedido do
  mural avisa que ele aparece **IMEDIATAMENTE** no mural público (o mural é em tempo real), por **90
  dias** — por isso o item publicado mostra "No mural público até dd/mm/aaaa" ou "Já saiu do mural público
  (passou de 90 dias)". Antes de aprovar, a tela **lê o item de novo** e aplica as regras ao que está no
  Directus agora (se virou confidencial ou perdeu o consentimento com a tela aberta, recusa e atualiza).
  Depois de cada ação a lista e as contagens se atualizam **sem recarregar a página**; botões travados
  desde o primeiro toque (nada de clique duplo); erro (servidor, rede, 403) mostra a frase e **não mexe
  em nada**; a mensagem de resultado recebe o foco (leitor de tela). Excluir um depoimento **não apaga a
  foto** (o painel não apaga arquivos). Regras e textos em
  [`src/lib/painelModeracao.ts`](./src/lib/painelModeracao.ts) (`TIPOS_MODERACAO`; tipo novo = um objeto
  novo ali).
- **"Ver no site"**: cada tipo declara as páginas públicas que o mostram (`paginasPublicas`); a lista e o
  formulário trazem os links "Ver a página “…” no site ↗" com o aviso de que o site mostra a mudança em
  até uns 20 minutos (só para o que já está no ar).
- **O que a tela cuida**: endereço (slug) gerado do título enquanto a pessoa não o edita (aviso quando
  mudá-lo quebra links de um item no ar e mensagem clara se já existir); texto em Markdown com barra
  (negrito, itálico, título, lista, citação, link, imagem por endereço ou enviada do aparelho) e **prévia
  ao vivo sanitizada** (lista de tags e atributos permitidos; `on…`, `style`, `script`, `iframe` e
  `javascript:` somem); imagem com envio direto ao Directus (JPEG/PNG/WebP/GIF, até 8 MB); campos
  obrigatórios conferidos no navegador com frase em português; salvar manda só o que mudou; aviso de
  alterações não salvas; clique duplo não duplica; a sessão que acaba **não apaga o texto** (aparece
  "Entrar de novo", que abre outra aba); **Excluir** fica numa zona de perigo e só vale digitando
  EXCLUIR.
- **Acrescentar um tipo novo**: um objeto novo em `TIPOS_CONTEUDO`, em
  [`src/lib/painelConteudo.ts`](./src/lib/painelConteudo.ts) — coleção, `titulos`, `grupo` (seção da página
  inicial), `paginasPublicas`, campo do título, `rascunho` (omita para "vai direto ao site"), `ordem`
  (ordem manual e agrupamento), `unico`, `camposMeta` (o que aparece embaixo do título na lista),
  `urlPublica` e a lista de campos em seções (`text`, `textarea`, `markdown`, `select`, `boolean`, `date`,
  `datetime`, `image`, `imagens`, `arquivo`, `m2o`, `number`, `url`, `slug`, `readonly`) — **mais a permissão da função no
  Directus**. As páginas não mudam e o cartão aparece sozinho para quem puder ler a coleção. O desenho dos
  campos fica em `src/lib/painelConteudoCampos.ts`. Atenção ao tipo real do campo de data no Directus:
  `date` (só dia) ou `dateTime` (`datetime`, que converte entre o horário local da tela e o ISO gravado).
  Tipo sem rascunho é público no instante em que se grava: **nunca teste gravando de verdade nele**.
- **Testes**: `site/scripts/testes/painel-unidade.cjs` (sem rede: datas, endereço, validação, ordem,
  fotos, envio de arquivo, configuração dos nove tipos e a moderação — filtros das abas, regras de
  aprovação, textos de confirmação, cartões da página inicial —; `node scripts/testes/painel-unidade.cjs`
  dentro de `site/`); `conteudo.cjs` (CI, Directus de verdade: só itens de teste em rascunho, nada gravado
  onde não pode; com um usuário "Semi-administrador" confere leitura, abas da moderação, envio de PDF e
  que o PDF é baixado por qualquer pessoa); e, fora do repositório, uma prova no navegador (Edge) com as
  gravações dos tipos sem rascunho interceptadas. **Regra para qualquer teste da moderação: o mural é
  público e em tempo real, então NUNCA se grava `aprovado: true` de verdade** (nem em depoimentos);
  itens de teste nascem `aprovado: false`, com texto começando por "TESTE", e são apagados no fim; em
  `relatorios` não se grava nada de verdade (vai ao site na montagem seguinte).

### Comunidade: mural de oração, enquetes e Minha Conta

- **Mural de oração** (`/mural-de-oracao/`) — pedido público com moderação, opção de anônimo e de
  confidencial (nunca aparece publicado), consentimento LGPD explícito (dado sobre convicção
  religiosa é categoria especial), honeypot anti-spam, tempo real via WebSocket do Directus. O
  contador "orando por você" é incrementado exclusivamente pela Function `OrarMural/index.js` — sempre
  +1 a partir do valor real gravado no servidor, nunca um valor vindo do navegador (ver
  [Segurança](#segurança-privacidade-e-decisões-de-arquitetura) sobre o bug que isso corrigiu).
- **Enquetes** (`/enquetes/`) — opinião pública com voto único por conta: resultado só aparece
  depois de votar (ou quando a enquete encerra), e um voto por e-mail por enquete é garantido pela
  Function `VotarEnquete/index.js`, nunca por `localStorage` sozinho (facilmente burlável).
- **Minha Conta** (`/minha-conta/`) — login sem senha (e-mail + código de 6 dígitos enviado por
  e-mail), reunindo num só lugar as inscrições em evento e os pedidos de camiseta feitos com aquele
  e-mail. Sessão é um token assinado (HMAC, `CONTA_TOKEN_SECRET`), guardado em `localStorage`, sem
  tabela de sessão no banco. **Totalmente independente do Directus e do "Portal do Membro"**
  externo (`app.ieadespa.org.br`, sistema de gestão de membros/governança) — ver
  [Backlog](#backlog--ideias-registradas-para-o-futuro) sobre a fase "SSO" registrada para o
  futuro.

### Mapas (Google Maps Platform)

Regra central, que evita mostrar localização errada: **um pino só aparece para uma localização com
perfil de verdade confirmado no Google Maps** (`google_maps_place_query`) — nunca a partir de
geocodificação automática de um endereço em texto, que já provou (em teste real) apontar pra rua ou
cidade errada por homônimo. Onde há mapa hoje:

- `/contato/` e o mapa das congregações — Maps JavaScript API, com marcador e InfoWindow.
- Rota traçada até a Sede (`/contato/`) — Directions API na tela, mais um link que abre a mesma
  rota no app real do Google Maps (`origin`/`destination` preenchidos).
- Foto de fachada — Street View Static API, comparada por data com uma foto manual cadastrada no
  Directus (usa sempre a mais recente das duas).
- Evento com local próprio — link do Google Maps colado pelo organizador (não geocodificado);
  coordenada extraída do link com prioridade `!3d!4d` (pino exato) > `@lat,lng` (centro de tela,
  menos preciso) > `q=lat,lng`.
- Mapa único de eventos do mês (`/eventos/`) e PDF de exportação — agrega eventos com local próprio
  ou com congregação de perfil confirmado.
- "Qual congregação está mais perto de você" (`/congregacoes/`) — geolocalização do navegador +
  distância em linha reta (Haversine), sem usar API paga; hoje só a Sede tem perfil confirmado, mas
  qualquer congregação entra sozinha assim que a liderança dela confirmar o perfil.

Avaliado e **descartado**: Aerial View (sem cobertura no Brasil, testado direto na API); Air
Quality/Pollen/Solar/Roads/Time Zone/Weather (sem aplicação real para um site institucional).

### Acessibilidade, PWA, performance e SEO

- **Acessibilidade**: modo de leitura fácil ("A+", fonte maior/mais contraste), VLibras (tradução
  de texto para Libras, site inteiro), idioma declarado nos PDFs gerados, `aria-live` nas
  atualizações dinâmicas, navegação por teclado completa nas abas de busca, contraste conferido com
  `axe-core` (0 violações nas páginas auditadas).
- **PWA**: instalável (manifest, ícone maskable, 2 atalhos), Service Worker com cache deliberadamente
  pequeno (3 páginas essenciais — cache grande é o erro clássico de PWA mal feita), check-in
  funciona offline.
- **Performance**: `srcset` responsivo (3 larguras) nas capas de conteúdo, `fetchpriority="high"`
  nelas, `Cache-Control` de longo prazo para assets com hash de conteúdo, `preconnect`/
  `dns-prefetch` para o Directus.
- **Imagens do Directus servidas pelo próprio site**: depois do `astro build`,
  `scripts/localizar-imagens.mjs` (encadeado em `npm run build`, que é o que o Static Web Apps
  roda) varre o HTML montado atrás de `https://<Directus>/assets/<id>?...`, baixa cada imagem
  distinta uma vez (4 ao mesmo tempo, 30 s, 2 tentativas, só se a resposta for `image/*`), grava em
  `dist/media/<hash do conteúdo>.<ext>` e troca a URL por `/media/...` (`og:image`,
  `twitter:image` e o JSON-LD pela URL absoluta do site). Assim nenhum visitante pede imagem ao
  Directus (1 núcleo, de 0,3 a 1,4 s de CPU cada). Se um download falha, a resposta não é imagem
  (SVG fica de fora de propósito: aberto direto no nosso domínio executaria script) ou o total passa
  de 120 MB, aquela ocorrência fica com a URL do Directus e o resumo avisa — a montagem nunca falha
  por isso. `/media/*` tem `Cache-Control` de 1 ano (`immutable`; o nome muda com o conteúdo) em
  `public/staticwebapp.config.json`. As telas do painel, que desenham a imagem no navegador,
  continuam no Directus. Prova sem rede: `scripts/testes/imagens-locais-unidade.cjs`.
- **SEO**: `sitemap.xml`, `rss.xml`, dados estruturados (`VideoObject`, `FAQPage`), busca rápida
  (Ctrl/Cmd+K, 10 tipos de conteúdo), atalho de vídeo com miniatura estática ("facade" do YouTube,
  sem carregar o player até o clique).
- **Analytics próprio, sem cookie**: contador de visitas (`pageviews`, só caminho + origem + data)
  com dashboard nativo no Directus Insights; notificação push de conteúdo novo como alternativa a
  newsletter por e-mail.

### E-mail transacional

Azure Communication Services (Email), domínio `ieadespa.org.br` verificado, remetente
`DoNotReply@ieadespa.org.br`. Usado para: confirmação de inscrição em evento (opcional, melhor
esforço — nunca bloqueia a inscrição em si) e código de login da Minha Conta. Custo aproximado:
US$ 0,25 por 1000 e-mails.

## Painel administrativo (Directus)

Quem não mexe em código publica conteúdo pelo painel visual do Directus, sem precisar do VS Code
nem de conta no GitHub — só um login de e-mail e senha criado para cada pessoa.

- **Acesso**: `https://ieadespa-directus-gae4hfarf4a4ffcf.brazilsouth-01.azurewebsites.net/admin`
- **Perfis (roles) hoje**: Administrator, Semi-administrador (tudo exceto
  Configurações/Fluxos/Webhooks/Usuários/tokens), Editor de eventos, Editor de notícias (notícias, mensagens, FAQ, programação, galeria, ministérios e história, pelo
  [painel de conteúdo](#painel-de-conteúdo); envia só imagens), Editor de
  contatos, Gestor de Camisetas (só as coleções de camiseta, sem apagar campanha) — cada um limitado ao próprio escopo (testado: acesso fora do escopo dá 403).
- **Mídia**: fotos e PDFs enviados no Directus vão direto para o Azure Blob Storage, não para o
  repositório do GitHub.
- **Limitações do plano gratuito ("Core")**: sem filtro condicional em permissão (força
  filtragem no código do site em alguns casos, ex. rascunho de mensagem); limite de **3 contas de
  usuário** — para mais colaboradores, aplicar para o
  [Open Innovation Grant](https://directus.com/pricing) (gratuito para organizações com menos de
  US$ 5 milhões de receita anual e menos de 50 funcionários).
- **Painéis internos de equipe** (fora do Directus): `/painel-eventos/` (gestão de eventos) e
  `/painel-camisetas/` (gestão de camisetas) — autenticam contra a própria conta do Directus (sem
  senha nova nem sistema de login próprio); como os dois usam o mesmo cookie httpOnly, entrar num
  dá acesso ao outro sem digitar senha de novo.

## Segurança, privacidade e decisões de arquitetura

Fatos que valem a pena lembrar antes de mexer em qualquer coisa relacionada — cada um existe por um
motivo concreto, não por acaso:

- **Telefone é sempre hash (`scrypt`), nunca texto puro**, guardado **para sempre por design**
  (decisão explícita: é a chave que permite emitir segunda via de certificado anos depois — reter
  um hash não tem o mesmo risco que reter o dado real, já que não dá para reverter). Comparação
  sempre em tempo constante (`crypto.timingSafeEqual`), para não vazar informação pelo tempo de
  resposta.
- **Certificado/crachá/pesquisa exigem código E telefone combinados**, nunca só o código sozinho —
  corrigido depois de um vazamento real onde o código sozinho bastava para puxar o certificado de
  qualquer pessoa.
- **`inscricoes_eventos` só é pública (leitura/atualização) para eventos dos últimos 90 dias** (ou
  sem data) — mitigação de um vazamento real onde a permissão pública sem filtro nenhum expunha
  `id`/`nome`/`código`/`presença`/`pagamento` de todos os inscritos de todos os eventos desde
  sempre (telefone nunca esteve entre os campos expostos). Trade-off aceito conscientemente:
  check-in/crachá/certificado de um evento param de funcionar 90 dias depois dele.
- **O rate limiter nativo do Directus está confirmadamente sem efeito** (bug conhecido do próprio
  Directus, [issue #23067](https://github.com/directus/directus/issues/23067), fechada como "not
  planned") — 100% das tentativas de login passam, mesmo configurado corretamente. O limitador que
  funciona de verdade é o das Azure Functions (`api/src/lib/rateLimit.js`, 20 tentativas/5min/IP,
  em memória — melhor esforço, zera se a instância reiniciar), mas só protege os endpoints das
  próprias Functions, nunca o `/auth/login` do Directus em si.
- **Directus não permite filtrar por campo `type: hash`**, e o sandbox de Flows (`Run Script`) não
  tem `crypto`/`fetch`/`require`/`Buffer` — por isso qualquer verificação de hash de verdade roda
  numa Azure Function (`api/`), nunca dentro do Directus.
- **`ON DELETE CASCADE` precisa ser definido na criação da relação, nunca depois via PATCH** — um
  PATCH posterior destrói a FK silenciosamente (achado real, corrigido em `historia_files` e
  aplicado desde então em todas as relações de camiseta).
- **CSP (`public/staticwebapp.config.json`) — só se aplica de verdade com o emulador oficial
  (`@azure/static-web-apps-cli`) ou em produção, nunca com `astro preview`.** Gotchas conhecidos:
  o mural de oração precisa de `wss://` (não só `https://`) em `connect-src`; VLibras precisa de
  `vlibras.gov.br` **e** `cdn.jsdelivr.net` (redirect real); Google Maps precisa de
  `maps.googleapis.com`/`maps.gstatic.com`/`*.googleapis.com`/`*.ggpht.com`/
  `fonts.googleapis.com`/`fonts.gstatic.com`; `Permissions-Policy` precisa de
  `geolocation=(self)` (não `geolocation=()`) para a rota traçada funcionar.
- **Slug é opcional em `eventos`, `congregacoes` e `ministerios`** — qualquer rota dinâmica baseada
  nessas coleções precisa filtrar itens sem slug antes de gerar página (`getStaticPaths`), senão o
  build quebra.
- **Duas chaves de API do Google Maps, de propósito**: uma restrita por domínio HTTP referrer (Maps
  JS/Embed/Street View/Directions, usadas no navegador), outra sem restrição (Geocoding/Places
  server-side) — o Google recusa chave restrita por referrer nesses dois endpoints REST.

### Limitações de teste local

CORS do Directus (liberado só para o domínio de produção) e chaves de API restritas por domínio
recusam `localhost` — algumas funcionalidades só podem ser verificadas de ponta a ponta depois do
deploy, contra o domínio real. O fluxo de teste adotado neste projeto é: build → commit → push →
aguardar o deploy → testar contra produção (com dados descartáveis, sempre apagados depois).

### LGPD e retenção

`/privacidade/` documenta, coleção por coleção, finalidade/base legal/prazo de retenção/quem
acessa. Consentimento específico (Art. 11 — dado sobre convicção religiosa é categoria especial) é
exigido e **guardado como prova** (`consentimento_lgpd: true`), não só pedido na tela — o ônus da
prova do consentimento é do controlador (Art. 8º, §2º). Canal de exercício de direitos:
`/contato/?assunto=lgpd`.

**Direito de exclusão (Art. 18) apesar do telefone estar em hash**: o hash não impede a exclusão —
`/painel-eventos/lgpd/` (equipe autenticada, nunca público) usa a mesma técnica de
`VerificarInscricao/index.js`/`CancelarInscricao/index.js` (comparar o telefone digitado contra cada hash
guardado, sem nunca reverter nenhum) pra localizar e apagar tudo ligado a um telefone — inscrições
em evento e pedidos de camiseta, com tudo em cascata debaixo deles (respostas, itens). Uso
esperado: o pedido chega pelo canal de contato, a equipe confirma identidade por fora, e só então
usa essa tela. Promove a lista de espera de cada evento afetado, mesmo critério do cancelamento
normal.

## Infraestrutura Azure

- **Deploy automático em dois gatilhos**: `git push`, ou qualquer criação/edição/exclusão de item
  nas coleções públicas do Directus (um Flow chama `repository_dispatch` no GitHub via
  `GITHUB_DISPATCH_TOKEN`). Os dois disparam o mesmo workflow do GitHub Actions, que builda e
  publica no Azure Static Web Apps.
- **Blob Storage**: mídia do Directus (driver `azure`), contêiner `imagens` com CORS e leitura
  pública liberados; soft delete de blob/container (7 dias) e versionamento ativados.
- **Backup do PostgreSQL**: retenção de 35 dias, restauração já testada de ponta a ponta contra um
  servidor descartável.
- **Acesso Azure**: nunca por login pessoal — um service principal escopado só aos recursos do
  Directus (App Service + PostgreSQL + Storage Account), nunca à assinatura inteira. Credenciais e
  nomes exatos de recurso ficam só em `.env.local` (fora do Git, nunca neste README).
- **Segredos usados pelo GitHub Actions / Application Settings** (nomes, não valores):
  `DIRECTUS_ADMIN_TOKEN`, `VAPID_PRIVATE_KEY`, `ACS_CONNECTION_STRING`, `ACS_REMETENTE`,
  `CONTA_TOKEN_SECRET`, `DIRECTUS_URL`.
- **Branch `main` protegido** (não pode ser apagado nem receber force-push); push direto sem PR
  continua permitido enquanto só uma pessoa mexe no código.

## Pendências reais conhecidas

Itens que continuam genuinamente em aberto, não resolvidos em nenhuma fase já construída:

- Preencher os nomes reais de vice-presidente/secretário(a)/tesoureiro(a) da diretoria (hoje "A
  definir" em `orgao_membros`).
- Fotos reais de culto/comunidade (hero da home, Sobre, Ministérios) — hoje um gradiente CSS
  ocupa o lugar da foto na home.
- Vídeo de boas-vindas institucional.
- Bios de membros de órgão ainda sem preencher ("Biografia a ser adicionada.").
- Ligar o botão "Portal do Membro" a mais do que um link simples (ver Backlog, fase SSO).
- Confirmar perfil no Google Maps para as demais congregações (hoje só a Sede tem) — depende de
  conversa com cada liderança local, fora do escopo de código.
- Testar de ponta a ponta o envio real de e-mail de confirmação/lembrete de evento em produção com
  um caso real (a lógica já foi validada, mas não com um envio de verdade acompanhado).
- Aplicar para o Open Innovation Grant do Directus antes de precisar de uma 4ª conta de usuário.

## Backlog — ideias registradas para o futuro

Sem compromisso de construir — avaliar e priorizar quando fizer sentido.

- **SSO — acesso único integrado com o Portal do Membro**: registrada pelo usuário em 2026-09-11,
  explicitamente **para não tratar agora**. Ideia: unificar o login da Minha Conta deste site com o
  do "Portal do Membro" (`app.ieadespa.org.br`, sistema de gestão de membros/governança que o
  usuário mantém à parte) — quem já tem conta lá usaria o mesmo login; cadastro novo por e-mail
  passaria a nascer a partir do site. Só retomar depois que o usuário terminar de desenvolver esse
  outro sistema, e só a pedido dele — ver decisão de independência registrada mais acima.
- **Newsletter/e-mail em massa** — motivo antigo (limite de 300 contatos do plano grátis do Brevo)
  não se aplica mais desde que o ACS Email (Fase 21) existe, mas falta desenhar: coleção de
  inscritos, descadastro de um clique, e decidir o quê/quando notificar.
- **Nome de exibição do remetente dos e-mails automáticos** — hoje aparece como `DoNotReply`
  genérico; configurável só manualmente no Portal Azure ("MailFrom addresses"), não por código.
- **Player de áudio persistente (mini-player)** entre páginas — sem áudio/vídeo de mensagem
  cadastrado ainda para justificar.
- **QR code em cartazes físicos**, apontando para a página do evento.
- **Lista de chamada impressa** — avaliar se ainda faz sentido com o check-in digital já
  funcionando.
- **Múltiplos portões/dispositivos de check-in simultâneos** — avaliado, não construído por não
  valer a pena para o porte da igreja.
- **Trocar a chave Pix de exemplo** — já usa o CNPJ real centralizado em `siteConfig`; confirmar
  que é a chave definitiva antes de considerar isso encerrado.

## Ideias descartadas

Avaliadas e recusadas por decisão explícita — registradas só para não serem propostas de novo sem
necessidade.

- **Unificar toda a tecnologia de mapa numa só** (só Leaflet, ou só Google embed) — faria
  congregações sem perfil confirmado perderem o mapa que já funciona por endereço em texto.
- **Subpágina por ano de mandato de órgão** — substituída por uma linha do tempo na própria página
  do órgão, sem limite de crescimento.
- **"Servir/seja voluntário"** — não se aplica a uma igreja tradicional como esta; áreas sensíveis
  exigem processo de confiança prévio, não formulário público.
- **"Ao vivo agora" automático** — fluxo manual é ruim durante o evento, checagem por API tem
  limite diário que não compensa para transmissões raras.
- **Aniversariantes do mês** — exigiria coletar data de nascimento; dado sensível demais para o
  benefício.
- **Escala de trabalho/voluntários, Batismo/Casamento/Dedicação, diretório de membros, EBD
  completa, reserva de espaço, painel financeiro interno** — todos pertencem ao sistema de gestão
  de membros que o usuário mantém à parte; o site não deve depender de conectar a outro sistema
  externo (eventos são a exceção histórica, por não serem cobertos em nenhum lugar).
- **Kit de imprensa formal** — sem demanda real de terceiros para esse porte de igreja.
- **Devocional diário / plano de leitura bíblica próprio** — produção contínua indefinida (maior
  risco de abandono) ou mercado já resolve de graça em escala inatingível.
- **Multilíngue (PT/EN/ES)** — sem público recorrente que justifique; tradutor do navegador cobre
  o caso raro.
- **Exportar lista de inscritos (CSV/Excel)** — pior para segurança do que manter dentro do painel
  controlado.
- **Link rápido de WhatsApp por inscrito** — recurso novo do WhatsApp (esconder número) torna essa
  função arriscada de manter.
- **Newsletter via Brevo/Resend/Mailjet** — exige clique manual acima de 300 contatos ou controle
  próprio de descadastro; não valeu a pena.
- **Comunidade/pequenos grupos, agendamento de visita pastoral** — a igreja não tem esse processo
  formalizado; se vier a ter, pertence ao sistema de governança, nunca ao site público.
- **Podcast separado, vagas de trabalho no site, chatbot de FAQ automatizado** — necessidade já
  coberta de outra forma, ou custo/risco não justificado pelo volume.
- **Aerial View, Air Quality, Pollen, Solar, Roads, Time Zone, Weather (Google Maps Platform)** —
  sem cobertura no Brasil ou sem aplicação real para um site institucional de igreja.

## Licença

Uso restrito — ver [LICENSE](./LICENSE). O código é público apenas para fins de transparência e
consulta; não é software de código aberto, não permite uso comercial e qualquer reaproveitamento
por terceiros depende de autorização prévia da IEADESPA.
