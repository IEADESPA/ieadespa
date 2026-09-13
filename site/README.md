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
  [Integração com Azure](#integração-com-azure)).
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
[src/lib/directus.ts](./src/lib/directus.ts) e das Functions em [api/src/functions/](./api/src/functions/).

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
por uma Azure Function (ver [api/src/functions/](./api/src/functions/)), que confere identidade
com o token de administrador do Directus por trás, sem nunca expor esse token nem o dado bruto a
quem não deveria vê-lo.

| Coleção | Guarda | Como é protegida |
| --- | --- | --- |
| `inscricoes_eventos` | Nome, telefone (hash), código, presença, pagamento | Leitura pública mínima (`id`/`evento`/`aguardando_vaga`/`presente`, só para contadores); só eventos dos últimos 90 dias; nome/código exigem check-in autenticado ou a Function `verificarInscricao.js` (código **e** telefone) |
| `respostas_inscricao` | Resposta a pergunta customizada de um evento | Só cria publicamente |
| `cupons_desconto` | Código de desconto, limite de usos | Leitura pública por código; atualização pública só do contador de usos |
| `camiseta_grupos` | Campanha de camiseta/uniforme (nome, valor, prazo) | Leitura pública |
| `camiseta_lotes` | Janela de compra (número, aberto/fechado) de um grupo | Sem leitura/escrita pública — só a equipe (painel) e a Function de criação de pedido |
| `camiseta_lote_itens` | Estoque extra + custo por tamanho/modelo de um lote | Sem leitura/escrita pública |
| `camiseta_pedidos` | Nome, telefone (hash), e-mail opcional, valor pago | Sem criação pública direta — só via `criarPedidoCamiseta.js`; leitura pública só do campo `id`; consulta por telefone via `consultarPedidosCamiseta.js` |
| `camiseta_itens_pedido` | Item do carrinho (tamanho/modelo/quantidade) | Sem criação pública direta — só via `criarPedidoCamiseta.js` |
| `perguntas_camiseta` | Pergunta customizada de uma campanha | Leitura pública |
| `respostas_pedido_camiseta` | Resposta de um pedido a uma pergunta | Sem criação pública direta — só via `criarPedidoCamiseta.js` |
| `mural_oracao` | Pedido de oração, nome opcional, confidencial | Leitura pública só do que é `aprovado=true`, não confidencial e dos últimos 90 dias; contador `orando_count` só é escrito pela Function `orarMural.js` |
| `contato_mensagens` | Formulário de contato (inclui LGPD/pedido de oração) | Só cria publicamente, nunca lida |
| `push_subscriptions` | Inscrição de notificação push | Só cria publicamente; edição usa o próprio endpoint como "senha de posse" |
| `pageviews` | Caminho da página + domínio de origem + data (sem IP, sem cookie) | Só cria publicamente |
| `contas` | E-mail da "Minha Conta" | Sem leitura/escrita pública — só via Functions da Minha Conta |
| `contas_codigos` | Código de login de 6 dígitos (hash SHA-256) | Sem leitura/escrita pública |
| `enquete_votos` | Voto (enquete + opção + e-mail) | Sem leitura/escrita pública — só via `consultarEnquete.js`/`votarEnquete.js` |

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

**Painel de equipe**: `/painel-eventos/` (gestão de eventos, autenticado), `/painel/<local>/`
(telão "hoje na igreja", sem autenticação — pensado para um aparelho fixo na recepção).

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

- **Evento semanal (culto)** — coleção `programacao`, sem inscrição.
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

### Camisetas e uniformes

Arquitetura em carrinho, com atribuição por congregação e alocação de pagamento parcial:

- **`camiseta_grupos`** — a campanha (ex. "Camiseta do aniversário 2026"), com preço de venda e
  prazo.
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
- **Criação do pedido é toda feita numa Function** (`api/src/functions/criarPedidoCamiseta.js`,
  rota `/api/criar-pedido-camiseta`) — não existe mais permissão pública de criar
  `camiseta_pedidos`/`camiseta_itens_pedido`/`respostas_pedido_camiseta` direto no Directus. A
  Function decide sozinha em qual lote o pedido cai (encontra o aberto, ou cria o próximo número
  se não houver nenhum), evitando tanto expor essa lógica no navegador quanto duas pessoas criarem
  o "lote 1" ao mesmo tempo.
- **Consulta pública** (`/meus-pedidos-camiseta/`) — só por telefone, sem código, por decisão
  explícita de simplicidade.
- **Painel de gestão** (`/painel-camisetas/`) — CRUD de campanha, abas por lote (todos os
  lotes/lote N/avulso), fechamento de lote, consolidado editável, venda avulsa, controle de
  retirada.
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
  de seleção (ex. filtrar só quem respondeu "Zona Norte"). Sem exportação para Excel/CSV, de
  propósito — mesmo motivo já documentado para eventos: manter dado pessoal só dentro do painel
  controlado, não solto circulando em arquivo.

### Comunidade: mural de oração, enquetes e Minha Conta

- **Mural de oração** (`/mural-de-oracao/`) — pedido público com moderação, opção de anônimo e de
  confidencial (nunca aparece publicado), consentimento LGPD explícito (dado sobre convicção
  religiosa é categoria especial), honeypot anti-spam, tempo real via WebSocket do Directus. O
  contador "orando por você" é incrementado exclusivamente pela Function `orarMural.js` — sempre
  +1 a partir do valor real gravado no servidor, nunca um valor vindo do navegador (ver
  [Segurança](#segurança-privacidade-e-decisões-de-arquitetura) sobre o bug que isso corrigiu).
- **Enquetes** (`/enquetes/`) — opinião pública com voto único por conta: resultado só aparece
  depois de votar (ou quando a enquete encerra), e um voto por e-mail por enquete é garantido pela
  Function `votarEnquete.js`, nunca por `localStorage` sozinho (facilmente burlável).
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
  Configurações/Fluxos/Webhooks/Usuários/tokens), Editor de eventos, Editor de notícias, Editor de
  contatos — cada um limitado ao próprio escopo (testado: acesso fora do escopo dá 403).
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
`verificarInscricao.js`/`cancelarInscricao.js` (comparar o telefone digitado contra cada hash
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
