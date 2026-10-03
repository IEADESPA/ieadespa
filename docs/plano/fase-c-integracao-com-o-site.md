# FASE C — Integração com o Site Institucional

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

<!-- caixas separadas -->

> **Sobre o nome e a posição.** O pedido original foi criar uma fase de
> integração "antes da FASE 5" — nunca "FASE 4.6" ou similar, pra não colidir
> com nenhuma `vX.Y` existente. **Atualizado em 2026-09-14**: a fase inteira
> foi **antecipada pra cá**, fisicamente antes da vB.2, por decisão do
> usuário — Camisetas e Eventos no site **já funcionam de verdade** (não são
> mais dado fictício; o lançamento real estava previsto pra semana que vem,
> só adiado por causa desta própria integração). Não faz sentido trabalhar
> vB.2 (notificações) antes de terminar de organizar o que já está pronto pra
> ir ao ar.
>
> **O que esta fase resolve.** O site institucional
> (`github.com/IEADESPA/site`) é um repositório separado — Astro (site
> estático) + Directus (CMS com Postgres próprio) + uma API própria em
> Azure Functions — hoje sem nenhum vínculo de dado com este sistema. Achado
> concreto: `Congregacoes` aqui é um catálogo mínimo de governança
> (`CongregacaoId`, `Nome`, `Ativa`); o site tem sua própria coleção
> `congregacoes` no Directus, com perfil público completo (endereço, pastor,
> horário, mapa, foto) e **nenhum vínculo** com o `CongregacaoId` daqui —
> criar/renomear/desativar uma congregação hoje exige lembrar de fazer isso
> duas vezes, em dois sistemas que não se conhecem. Essa é a única
> duplicação de dado real confirmada até agora.
>
> **Distribuição do conteúdo — não fica tudo espremido aqui.** Só o que é
> genuinamente "mesclagem de repositório/infraestrutura" mora nesta FASE C
> (vC.1-vC.5 abaixo). Conteúdo de negócio que já tem uma fase própria no
> roadmap foi movido pra lá, mesmo trabalhando nele agora, fora da ordem
> numérica — mesma lógica que já vale pra esta fase inteira existir fora de
> ordem:
>
> - **Eventos** → integrado dentro da v7.4 (FASE 7, "Eventos e congressos"),
>   não aqui.
> - **Camisetas** → é uma Campanha de arrecadação (v4.4) vendendo um produto
>   físico — FASE 4 já fechou, então o retrofit entra como vB.17 (abaixo,
>   fim do bloco de retrofit da FASE B), não aqui.
> - **Minha Conta** (vC.3, abaixo) fica aqui porque não é módulo de negócio
>   de nenhuma fase — é login alternativo do site, sem equivalente em
>   nenhuma fase existente.

## vC.1 — Repositório único

- [x] Trazer `github.com/IEADESPA/site` para dentro deste repositório via
      `git subtree add --prefix=site <url> main` (preserva o histórico
      inteiro do site, não copia/cola arquivo) — feito em 2026-09-13,
      histórico completo (214 commits) confirmado em `site/`.
- [x] Dois pipelines de CI continuam existindo (build Astro do site, deploy
      Functions/SQL deste sistema) — monorepo não significa um deploy só.
      **Achado real corrigido**: os workflows do site (deploy + 2 avisos por
      e-mail/push) tinham ficado em `site/.github/workflows/`, invisíveis pro
      GitHub (só lê `.github/workflows/` da raiz) — mortos desde a fusão.
      Movidos pra raiz (`azure-static-web-apps-salmon-bay-*.yml`,
      `site-content-notifications.yml`, `site-event-notifications.yml`),
      caminhos corrigidos (`app_location: /site`, `api_location: site/api`),
      cada um com filtro `paths` pra só disparar quando a parte dele muda.
      `dependabot.yml` do site também movido pra raiz, mesma razão.
- [x] Decisão explícita por coleção do Directus: o que é puramente editorial
      (`mensagens`, `noticias`, `galeria`, `depoimentos`, `faq`, `historia`)
      **continua no Directus, sem mudança** — só o que representa uma entidade
      que também existe aqui (congregação, e no futuro evento/pessoa) migra.
- [x] Segredos do site no mesmo esquema SOPS/Age deste repositório
      (`site/api/local.settings.enc.json`, `site/secrets.env`) — chaves das
      duas máquinas liberadas no `.sops.yaml` (**um só, na raiz, desde
      14/09** — ver item de integração mais abaixo). `.gitattributes` novo
      força LF nesses arquivos (achado: CRLF de checkout Windows quebrava
      o parser do SOPS).
- [x] 4 secrets que faltavam no GitHub deste repositório (só existiam no
      `IEADESPA/site`) provisionados sem exibir valor: token de deploy da
      Static Web App do site, `ACS_CONNECTION_STRING`, `DIRECTUS_ADMIN_TOKEN`,
      e um `VAPID_PRIVATE_KEY` **novo** (o antigo não existia em nenhum
      arquivo criptografado nem era recuperável de um GitHub Secret —
      write-only por design; gerado par novo, chave pública trocada nos 6
      lugares onde estava fixa no código, efeito colateral aceito: quem já
      tinha se inscrito pra push precisa visitar o site de novo).
- [x] **Integração de verdade, não só código no mesmo repositório (14/09).**
      Achado real reportado pelo usuário: `site/` ainda tinha arquivo
      duplicado do que já existe na raiz, e lixo de template genérico sem
      nenhuma relação com a IEADESPA — sintoma de subtree "colado", não
      "integrado". Levantamento arquivo por arquivo e limpeza:
      - `site/LICENSE` (idêntico byte a byte ao da raiz) e `site/.sops.yaml`
        (a regra da raiz já cobria os 3 pares de segredo do repositório
        inteiro pelo mesmo sufixo de nome de arquivo, mesmas chaves — não
        precisava de um segundo arquivo) removidos; `SECRETS.md` da raiz
        passa a documentar os 3 pares (antes só 2 — faltava
        `site/secrets.env`/`site/.env.local`, que só estava em
        `site/CRIPTOGRAFIA.md`, também removido).
      - `site/CHANGELOG.md`, `site/CUSTOMIZATION.md`, `site/preview.webp`,
        `site/wrangler.jsonc`: sobras do tema Astro genérico ("Monograph")
        usado como base do site — changelog/guia do tema, não do projeto;
        screenshot de marketing; config de deploy Cloudflare nunca usada
        (o site sempre foi Azure Static Web Apps). Removidos.
      - `site/.github/scripts/*.mjs` (os scripts dos avisos por push/
        e-mail) movidos pra `site/scripts/` — um `.github` fora da raiz do
        repositório não tem nenhum significado especial pro GitHub, só
        confundia (parecia configuração do GitHub, mas eram só scripts
        Node comuns). Os dois workflows da raiz que apontavam pro caminho
        antigo, atualizados.
      - Testado antes de commitar: `sops -d` funcionando nos 3 pares de
        segredo usando só o `.sops.yaml` da raiz (de dentro de `site/` e
        de dentro da raiz); `npm run build` do site (119 páginas) sem
        erro; um dos workflows de aviso disparado manualmente de verdade
        (`workflow_dispatch`) pra confirmar o caminho novo dos scripts em
        produção, não só localmente.
- [x] **Decisão (13/09): `github.com/IEADESPA/site` congela a partir de
      agora** — nada mais é commitado/pushado pra lá; todo trabalho (site
      e sistema) passa a acontecer só neste repositório. O repositório
      antigo **não é apagado** (fica só desatualizado, como referência
      histórica), diferente da coleção do Directus (essa sim foi apagada,
      ver vC.2 abaixo). Confirmado que nenhuma automação ainda escrevia
      nele: sem workflow de subtree-push daqui pra lá, sem webhook
      configurado no repositório antigo (`gh api repos/IEADESPA/site/hooks`
      devolveu lista vazia). **Achado real ao checar isso**: o Flow do
      Directus que avisa o GitHub pra reconstruir o site
      ("Publicar site (avisar GitHub)") ainda mandava o aviso pro
      repositório antigo (`api.github.com/repos/IEADESPA/site/dispatches`)
      — ou seja, publicar conteúdo no Directus não estava disparando build
      nenhum sozinho, só funcionava até aqui porque os rebuilds recentes
      foram todos disparados manualmente. Corrigido
      (`PATCH /operations/{id}`, URL agora aponta pra
      `IEADESPA/ieadespa`) e testado de verdade: editei um registro de
      `historia` no Directus e o workflow `Site institucional - CI/CD`
      disparou sozinho no monorepo (`repository_dispatch`), sem eu
      acionar nada — confirmado no ar depois.

## vC.2 — Congregações como fonte única (primeiro dado realmente compartilhado)

**Correção de rota (13/09):** a primeira redação desta versão previa
`NomePastor` como coluna gravável em `Congregacoes` — errado. Quem dirige uma
congregação hoje **já** é 100% calculável em `Lideranca` (papel "Dirigente de
Congregação", escopo `CONGREGACAO`, mandato via `AtivoAte`), exatamente como
`api/shared/universo.js` já faz pra montar a composição da CLI. Gravar o nome
de novo aqui duplicaria dado e dessincronizaria no primeiro dia em que
alguém trocasse de dirigente — mesmo princípio de "calculado na leitura,
nunca marcação manual" já usado em todo o resto do sistema. Também ficou
claro, ao investigar, que **não existia tela de verdade** pra congregação
(só nome + ativa/inativa) — o gap real era maior que "adicionar campos numa
migração", por isso essa versão virou a construção de uma tela própria.

- [x] Migração idempotente (`sql/migrations/075_congregacoes_endereco_mapa.sql`)
      estendendo `Congregacoes` só com os campos que não existem em nenhum
      outro lugar do sistema e não dá pra calcular: `Slug`, `Endereco`,
      `Bairro`, `Cidade`, `Estado`, `Horarios`, `MapsUrl`, `Lat`, `Lng`.
      `NomePastor` propositalmente **não** entra como coluna (ver acima).
- [x] `api/GestaoCatalogos` (catálogo `congregacoes` — é quem já cria o órgão
      JAI automático de toda congregação nova) passa a aceitar/devolver esses
      campos, mais `dirigenteAtual` calculado por um hook `enriquecer` (junta
      `Lideranca` + `Papeis` + `MembroReferencia`, nunca gravado).
- [x] `api/GestaoCongregacoes` virou somente leitura (`GET`, devolve os
      mesmos campos + `dirigenteAtual`) — quem cria/edita/exclui é sempre
      `GestaoCatalogos`, pra não duplicar caminho de escrita.
- [x] `api/CongregacoesPublico` (novo, `authLevel: anonymous`): só os campos
      públicos (sem dado pessoal do dirigente), `Ativa = 1`, com busca por
      `slug` — é o que o site vai consumir no lugar do Directus.
- [x] Tela própria em `app/index.html`/`app/script.js` (aba Estrutura,
      "Congregações — Nível 1"): formulário completo (endereço, bairro,
      cidade, UF, horários, link do Maps, lat/lng) + tabela com dirigente
      atual exibido (somente leitura) — substituiu o editor genérico de
      catálogo (que só tinha nome) e um bloco de funções JS órfãs que nunca
      chegou a ser ligado a nenhum HTML.
- [x] Migração 076 (`sql/migrations/076_congregacoes_campos_restantes_do_site.sql`):
      mais 3 campos que só apareceram ao desenhar a migração de dado de
      verdade — `Cep`, `NotaEndereco`, `GoogleMapsPlaceQuery` (perfil
      confirmado no Google Maps, usado pelo recurso "qual está mais perto de
      você"). `historia` (texto editorial) e o par endereço antigo/novo (por
      causa de uma troca de CEP já ocorrida) ficaram de fora de propósito —
      são artefato do site, não dado estrutural; nenhuma congregação real
      tinha `historia` preenchida, então nada se perdeu.
- [x] Site troca a busca de `congregacoes` no Directus por
      `site/src/lib/congregacoes.ts` → `GET /api/congregacoes-publico`
      (`congregacoes.astro`, `congregacao/[slug].astro`) — chamada em build
      time do Astro (SSG, sem adapter), então não existe questão de CORS.
      Mapa (Leaflet + Google Maps Platform) e o design da página não
      mudaram, só a origem do dado.
- [x] Descoberta real ao migrar: o sistema só tinha **2** congregações
      cadastradas (Sede e Gênesis) contra **41** reais no Directus. Migração
      de dado feita e conferida linha a linha (script one-off, não versionado
      — resultado é o que importa): as 39 que faltavam foram criadas no
      sistema (mesma numeração do site, "3 - Águas Vivas" a "42 - Bom
      Pastor"), cada uma com o órgão JAI automático, e o endereço da
      "2 - Gênesis" foi atualizado. `api/CongregacoesPublico` tira o prefixo
      numérico administrativo (`"11 - Nova Jerusalém"` → `"Nova Jerusalém"`)
      antes de expor ao público — achado em produção logo depois do deploy,
      corrigido no mesmo dia. Confirmado nas duas pontas: `GET
      /api/congregacoes-publico` em produção e as páginas reais em
      `www.ieadespa.org.br/congregacoes/` e `/congregacao/{slug}/`.
**Prova real de que o site lê do sistema, não do Directus (13/09):** dúvida
legítima — até aqui só tinha a palavra de quem implementou. Teste feito ao
vivo, em produção, na congregação "Bom Pastor" (`/congregacao/bom-pastor/`):
gravei uma frase-marca só no campo do **sistema** (`NotaEndereco`) e uma
frase-marca *diferente* só no **Directus** (`address_note`, mesmo registro).
Reconstruí o site e conferi a página pública: só a marca do sistema
apareceu — a do Directus foi ignorada por completo. Prova, não promessa.
As duas marcas foram removidas depois do teste (nenhuma ficou visível pro
público). **Como repetir esse teste você mesmo, a qualquer momento, sem
precisar de mim:**

1. Abra a tela "Congregações — Nível 1" no sistema (aba Estrutura) e mude
   algo visível de uma congregação (ex: o campo de horários).
2. Peça pra reconstruir o site (ou espere a próxima publicação/push) e
   confira a página pública daquela congregação — se a mudança aparecer lá,
   é prova de que o site está lendo do sistema.
3. Se um dia isso parar de bater (mudar no sistema e o site não refletir,
   ou mudar em algum lugar do Directus e o site refletir), é sinal de
   regressão — volte a este trecho do README pra saber o que reconferir.
**Correção de critério (13/09):** "esperar um tempo em produção" não era o
critério certo — era mascarar uma dependência real ainda não resolvida.
Levantamento completo (pedido explícito) achou que **Eventos** e
**Camisetas** ainda tinham campo relacional (FK) apontando pra
`congregacoes` no Directus — apagar a coleção àquela altura quebraria as
duas, que são reais e estavam perto do lançamento. Dado real checado antes
de mexer: **0** eventos e **0** pedidos de camiseta tinham esse campo
preenchido hoje, então nenhuma migração de dado foi necessária — só trocar
de onde vêm as opções/nomes:

- [x] Migração 077 (`FundacaoAno`) — último campo achado, usado só por
      `/transparencia/` (gráfico de crescimento), vazio em todas as 41
      congregações reais também.
- [x] `search.ts`, `sobre.astro`, `transparencia.astro`,
      `camiseta/[slug].astro`, `painel-eventos/evento/index.astro`,
      `eventos.astro`, `evento/[slug].astro` — todos trocados pra
      `fetchCongregacoesPublicas()` (build time, sem CORS).
- [x] `eventos/exportar.astro` e `painel-camisetas/grupo/pedidos.astro` são
      client-side (rodam no navegador de quem usa o painel) — chamar o
      sistema direto dali bateria em CORS (confirmado com teste real, sem
      `Access-Control-Allow-Origin` na resposta). Resolvido com a mesma
      técnica que `exportar.astro` já usava pras coordenadas do mapa: nome
      da congregação resolvido em build time e embutido na página como
      `{id: nome}` — o navegador só consulta esse mapa, nunca chama o
      sistema.
- [x] Relação (chave estrangeira) removida de verdade no Directus
      (`DELETE /relations/eventos/congregacao` e
      `/relations/camiseta_pedidos/congregacao`) — confirmado depois que
      não sobrou nenhuma relação apontando pra `congregacoes`
      (`GET /relations`, filtrado). Site conferido no ar sem regressão
      (`/eventos/`, `/painel-eventos/evento/`) depois da mudança.
- [x] **Coleção `congregacoes` do Directus apagada (13/09).** Checagem
      final antes de apagar: nenhum campo do site, nenhuma relação, nenhum
      dashboard/panel dependia mais dela — só sobrou um Flow (o que avisa o
      GitHub pra reconstruir o site) listando `congregacoes` entre as
      coleções observadas; removida essa entrada primeiro
      (`PATCH /flows/{id}`), depois `DELETE /collections/congregacoes`
      (HTTP 204). Confirmado depois: `GET /items/congregacoes` no Directus
      devolve 403/"não existe", e o site inteiro continua no ar (200) em
      `/congregacoes/`, `/congregacao/genesis/`, `/eventos/`, `/`. vC.2
      encerrada de verdade — nenhum dado de congregação mora mais fora
      deste sistema.
- [x] **Achado real depois de "encerrada" (14/09, reportado pelo usuário
      revisando): a Sede continuava duplicada.** A congregação "Sede" no
      sistema estava com todo campo de endereço vazio, enquanto o endereço
      de verdade (incluindo o perfil confirmado do Google Maps, "Igreja
      AD/SETA Parauapebas - Templo Central") continuava só no singleton
      `Configuracoes` do Directus — exatamente a duplicação que essa versão
      inteira existe pra eliminar, só que essa instância específica passou
      despercebida no primeiro fechamento. Corrigido: dado migrado pra
      congregação "sede" do sistema (mesmos campos de qualquer outra
      congregação); `fetchConfiguracoes()` (`site/src/lib/directus.ts`)
      passa a sobrescrever os campos de endereço/mapa com o que vem de lá
      antes de devolver — um único ponto central corrige todo mundo que já
      chamava `enderecoCompleto()`/`mapsHref()` (contato, doações,
      privacidade, vCard, página inicial, visitante, busca, evento), sem
      precisar editar cada um. Efeito colateral evitado: como "sede" ganhou
      slug no sistema, ela sairia duplicada em `/congregacoes/` (card
      próprio + card genérico) e geraria uma `/congregacao/sede/` redundante
      com `/contato/` — as três excluídas explicitamente. Conferido em
      produção: endereço batendo em `/contato/`, `/congregacao/sede/`
      devolve 404 (não existe mesmo), só 1 card da Sede em `/congregacoes/`.
      **Fechamento simétrico confirmado pelo usuário (14/09):** os 9 campos
      de endereço/mapa (`address_line`, `address_neighborhood`,
      `address_city`, `address_state`, `address_zip`, `maps_url`, `lat`,
      `lng`, `google_maps_place_query`) apagados de vez de `Configuracoes`
      no Directus (`DELETE /fields/configuracoes/...`, 9x HTTP 204).
      `site/src/lib/directus.ts` dividido em `ConfiguracoesDirectus` (só o
      que ainda vem de lá: tagline, telefone, fotos) + `Configuracoes`
      (formato final que os callers já esperavam, endereço/mapa sempre
      vindo da congregação "sede" do sistema, sem fallback pro Directus —
      não tem mais o quê). Conferido em produção: endereço batendo em
      `/contato/`, exatamente 42 cards em `/congregacoes/` (Sede + 41
      congregações, nenhum duplicado). Nenhum dado de endereço mora fora
      deste sistema — nem da Sede, nem de nenhuma congregação.

## vC.3 — Minha Conta: trava real contra identidade duplicada

**Correção de rota (14/09):** a redação original previa checar
telefone/CPF na criação da conta — não bate com a implementação real:
"Minha Conta" só pede e-mail (nunca telefone, nunca CPF), e
`MembroReferencia` nem tem coluna de CPF (só existe numa tabela bem
diferente, de prebenda pastoral). Investigação levou a duas perguntas
reais, discutidas com o usuário — cada identidade transita pro outro
lado num momento diferente da vida da pessoa, e nenhuma pode duplicar:

**Sentido 1 — visitante que cria conta no site e depois vira membro de
verdade (14/09, implementado).**

- [x] `api/VerificarContaMembro` (novo, anônimo): dado um e-mail, devolve só
      um booleano (`ehMembroAtivo`) — nunca nome/matrícula/telefone, mesmo
      padrão de privacidade de `CongregacoesPublico`. Existe só pra checar
      "esse e-mail já é de alguém", nunca pra confirmar de quem é.
- [x] `site/api/solicitarCodigoConta.js`: antes de criar uma conta NOVA
      (quem já tem conta continua igual, mesmo tendo virado membro depois —
      reaproveitamento intacto), chama essa rota; se o e-mail já é de um
      membro ativo, recusa (HTTP 409) e orienta a usar o acesso de membro.
      Servidor pra servidor (Azure Function chamando Azure Function), sem
      questão de CORS. Se a chamada falhar (sistema fora do ar), não
      bloqueia — disponibilidade do site não pode depender do sistema
      interno estar de pé.
- [x] `site/src/pages/minha-conta.astro`: mostra a mensagem de recusa que
      vem do backend, em vez do erro genérico de sempre.
- [x] `api/HistoricoSiteMembro` (novo, autenticado, permissão "pessoas"):
      dado uma matrícula, busca o e-mail no sistema e, se existir, consulta
      no Directus (inscrições em eventos + pedidos de camiseta) o que
      aquela pessoa já fez no site — nunca funde as duas contas, só mostra
      lado a lado. Sem e-mail cadastrado, ou consulta indisponível, avisa
      em vez de dar erro.
- [x] Perfil da pessoa (`app/`, aba "Dados") ganha uma seção "Site
      institucional" carregando esse histórico.
- [x] `DIRECTUS_URL`/`DIRECTUS_ADMIN_TOKEN` (já configurados na v. anterior
      desta versão) reaproveitados aqui — mesma ponte, dois usos.

**Sentido 2 — membro que perde a membresia mas quer continuar com acesso
ao site.** As duas transições são a mesma decisão, tomada em momentos
diferentes: hoje isso acontece via **Carta de Mudança** (Reg. Art. 131
§3º, II) — confirmada, corre um prazo de 30 dias até a minimização (Reg.
Art. 132 §2º), que zera o e-mail do membro em `MembroReferencia`. Sem
alternativa, isso cortaria de vez qualquer acesso que a pessoa já tivesse
(ou viesse a ter) à "Minha Conta" do site — mesmo o e-mail sendo dela por
direito. **Implementado (14/09):**

- [x] Migração 078: `CartasTransito.ManterAcessoSite` (booleano).
- [x] `api/SolicitarCarta`: na confirmação da Carta de Mudança, o próprio
      membro escolhe (`manterAcessoSite`) se quer manter o acesso. Se sim,
      **antes** da minimização rodar, `api/shared/directusContas.js`
      garante uma conta no site pra aquele e-mail — só o e-mail (dado
      essencial da conta), nunca nome/matrícula/telefone. As duas contas
      nunca se fundem: a do site continua sendo só e-mail + código, igual
      pra qualquer visitante, sem nenhum vínculo de volta pra matrícula
      (a pessoa perde o acesso de membro, mas não perde o acesso ao site).
      Se não escolher manter, fica exatamente como já era (dados só
      minimizados).
- [x] `app/`: as duas telas que confirmam Carta de Mudança
      (`solicitarCarta`, `confirmarCartaPendente`) ganham essa pergunta.
      `api/GestaoCartas` (listagem administrativa) e `api/SolicitarCarta`
      (GET, lista as próprias cartas) devolvem `manterAcessoSite`.
- [x] Testado de ponta a ponta: `garantirContaSite()` chamado com um
      e-mail de teste, conferido que só grava `{email}` (nada de nome) no
      Directus, conta de teste removida depois.
- [x] `DIRECTUS_URL`/`DIRECTUS_ADMIN_TOKEN` configurados como app setting
      da Static Web App de governança (`app-meusite-web`) — primeira vez
      que este lado chama o Directus do site (antes só o inverso existia).

## vC.4 — Reaproveitamento de ativos de front-end do site

Levantamento real (14/09) do que existe hoje nos dois lados, não uma lista
genérica de "boas práticas" — cada item abaixo aponta o arquivo de origem e
o gatilho concreto pra reaproveitar quando o módulo correspondente chegar
no `app/`.

- [x] **Mapas.** `site/src/components/MapaCongregacoes.astro` (Leaflet, via
      CDN, sem chave paga — só desenha marcador/popup a partir de
      `{name, lat, lng, href}`) já consome exatamente os campos que a vC.2
      colocou em toda congregação (`Lat`, `Lng`, `MapsUrl`). Hoje o `app/`
      **não tem nenhuma integração de mapa** apesar de já guardar essas
      coordenadas — gatilho concreto: quando a Estrutura ganhar uma visão
      territorial (mapa de congregações por Área/Região, por exemplo),
      reaproveitar esse mesmo padrão (array de pontos + Leaflet via CDN,
      já que `app/` é HTML/JS puro, sem bundler — os mesmos `<script>`/
      `<link>` do CDN que o site já usa, só que soltos na página em vez de
      importados). `site/src/lib/streetview.ts` (Street View Static API,
      chave restrita por domínio, resolve cobertura + imagem) e
      `googleMapsLink.ts` (resolve link curto do Maps em coordenada) são
      reaproveitáveis do mesmo jeito, se um dia o cadastro de congregação
      ganhar preview de fachada.
- [x] **Geração de PDF no navegador.** `site/src/lib/certificado.ts` e
      `cracha.ts` (jsPDF) desenham documentos com marca própria — mesma
      paleta ouro/marinho/cinza do site, `pdf.ts` garante metadado mínimo
      de acessibilidade (`doc.setLanguage("pt-BR")`) em todos. O `app/`
      **não gera PDF nenhum hoje** — os documentos que precisam ser
      entregues (Carta de Trânsito, por exemplo) usam `window.print()` de
      HTML estilizado (`imprimirCarta`/`imprimirMinhaCarta` em
      `app/script.js`), não um arquivo baixável de verdade. Gatilho
      concreto: quando existir a necessidade real de um documento
      baixável (não só imprimível na hora) — certificado de consagração,
      crachá de evento interno, a própria Carta de Trânsito em PDF —
      reaproveitar a mesma paleta/estrutura em vez de inventar um layout
      novo. jsPDF é uma dependência pequena (~200KB), dá pra carregar via
      CDN no `app/` do mesmo jeito que os outros scripts de terceiro já
      carregados lá.
- [x] **Tokens de design.** Achado real ao comparar: os dois lados **já
      convergiram sozinhos, sem nenhuma fonte compartilhada**, pro mesmo
      par de cores (azul-marinho + dourado) — coincidência de identidade
      visual, não coordenação:
      | | `site/src/styles/global.css` | `app/style.css` |
      |---|---|---|
      | Primária (marinho) | `--primary: #0f1f3d` | `--cor-primaria: #0B2545` |
      | Destaque (dourado) | `--accent: #8f6f1f` (ajustado pra 4.71:1 WCAG AA) | `--cor-secundaria: #C9A227` |

  Não faz sentido fundir os dois arquivos (frameworks diferentes de
  propósito — Tailwind v4 `@theme` no site, classes escritas à mão no
  `app/`, e a vC.5 já trata a normalização técnica dos dois lados
  separadamente). O valor real de documentar isso aqui: da próxima vez
  que QUALQUER um dos dois lados mudar a cor de marca, esta tabela é o
  lembrete de atualizar o outro lado também — sem ela, alguém teria
  que tirar a cor de uma captura de tela pra manter os dois em sintonia.

## vC.5 — Um único modelo, dois Function Apps (normalização técnica)

**Título corrigido (14/09)** depois de fechar esta versão: a ambição
original era "um único Function App, um único modelo" — só a segunda
metade era alcançável (ver checklist abaixo, a Azure não permite duas
Static Web Apps compartilharem um Function App em nenhum modelo). Achado
real que deu início a essa versão: `api/` usa o modelo clássico do Azure
Functions (pasta por função + `function.json`); `site/api` usava o modelo
v4 (`app.http(...)` registrado inline, `"main"` no `package.json`
apontando um glob) — dois modelos diferentes, sem confirmação de que
conviviam no mesmo Function App.

- [x] **Reescritas as 15 funções (14/09)** de `site/api/src/functions/*.js`
      (modelo v4) pro modelo clássico — uma pasta por função dentro de
      `site/api/` (`SolicitarCodigoConta/`, `ConfirmarCodigoConta/`, etc.),
      cada uma com `function.json` + `index.js`, mesmo padrão de `api/`.
      Regra mecânica aplicada em todas: `request.json()` → `req.body`,
      `request.query.get(x)` → `req.query.x`, `request.headers.get(x)` →
      leitura sem diferenciar maiúscula/minúscula (`ipDoPedido`, em
      `src/lib/rateLimit.js`, ajustado pra isso), `return { jsonBody }` →
      `context.res = { body }`, `context.error(...)` →
      `context.log.error(...)`. Único caso especial: `VersiculoImagem`
      devolve um PNG binário — `context.res.isRaw = true` com o `Buffer`
      direto em `body` funcionou de primeira, testado e confirmado (PNG
      1080×1920 válido, gerado localmente). `@azure/functions` e o campo
      `"main"` (glob) removidos do `package.json` — não fazem sentido no
      modelo clássico. **Testado de ponta a ponta localmente** (`func
      start`) antes de mexer em produção: as 15 rotas registradas
      corretamente, chamada real ao Directus funcionando
      (`VerificarInscricao`), validação de parâmetros ausentes (400),
      imagem binária (PNG de verdade, não corrompida) — só depois disso
      o código foi commitado.
- [x] **Resolvido sem precisar testar em homologação (14/09) — é uma
      limitação documentada da própria plataforma, não uma dúvida de
      tentativa e erro.** `az staticwebapp backends link --help` (Azure
      CLI oficial) documenta: *"Only one backend is available to a single
      static web app. If a backend was previously linked to another
      static Web App, the auth configuration must first be removed from
      the backend before linking to a different Static Web App."* — ou
      seja, mesmo no modelo "Bring your own Functions" (Function App
      próprio, dedicado), um único Function App só pode estar vinculado a
      **uma** Static Web App de cada vez; vincular à segunda exigiria
      desvincular da primeira. E o modelo hoje em uso (`api_location` no
      próprio `azure-static-web-apps-deploy@v1`) é o modelo **gerenciado**
      — cria uma Function App interna dedicada a cada Static Web App por
      natureza, sem opção de compartilhamento nenhuma. **Conclusão
      definitiva: as duas Static Web Apps (`app-meusite-web`,
      `site-institucional`) não podem, em nenhum dos dois modelos,
      compartilhar um único Function App.** `site/api` continua existindo
      como *deploy target* próprio — não é mais uma dúvida em aberto, é a
      arquitetura correta e permanente. vC.5 encerra aqui: o modelo já
      está unificado (mesma técnica clássica dos dois lados, primeiro
      item desta versão); só a *infraestrutura de deploy* continua sendo
      duas Function Apps, por limitação real da plataforma, não por
      escolha.

### 🔒 Trava de Revisão C-A — meio da fase, fecha vC.1–vC.2

- [x] Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da
      seção 3). Auditadas vC.1 e vC.2 pelos três critérios específicos desta
      trava (14/09).

  **1. O `git subtree` trouxe o histórico real?** Sim — `git log --oneline
  6e76452^2` (segundo pai do merge de importação) devolve 214 commits reais
  do `IEADESPA/site` (de `feat: FASE C (vC.1)...` até o commit mais antigo do
  site), não um `git log` vazio a partir do commit de importação.

  **2. O site em produção continua no ar sem regressão?** Sim — testado ao
  vivo: `/`, `/congregacoes/`, `/congregacao/genesis/`, `/eventos/` e
  `/contato/` devolvem HTTP 200; `/congregacao/sede/` devolve HTTP 404 de
  propósito (rota excluída explicitamente na vC.2, pra não duplicar com
  `/contato/`).

  **3. A coleção `congregacoes` do Directus só foi aposentada depois da
  migração conferida linha a linha?** Sim — a vC.2 documenta a migração das
  39 congregações que faltavam (2 → 41 reais), conferida uma a uma, e só
  depois disso (e depois de zerar as FKs de Eventos/Camisetas) a coleção foi
  apagada (`DELETE /collections/congregacoes`, confirmado 403 no Directus e
  200 no site). O achado tardio da Sede duplicada (14/09) também já foi
  fechado antes desta trava, com o mesmo padrão de conferência.

### 🔒 Trava de Revisão C-B — fim da fase, antes de retomar a FASE B (vB.2 em diante)

- [x] Ponto de parada obrigatório. Auditados os quatro critérios desta trava
      (14/09).

  **1. vC.3 e vC.4 foram concluídos (não silenciosamente esquecidos)?** Sim —
  todos os itens de vC.3 (dois sentidos: visitante→membro e membro→Carta de
  Mudança) e vC.4 (mapas, PDF, tokens de design) estão marcados `[x]` com
  evidência de teste ponta a ponta descrita em cada um.

  **2. vC.5 realmente eliminou a dualidade de modelo (não só documentou a
  incerteza)?** Sim — conferido no código, não só no texto: as 15 pastas de
  `site/api/` (`SolicitarCodigoConta/`, `ConfirmarCodigoConta/`, etc.) têm
  `function.json` no modelo clássico; `site/api/package.json` não tem mais
  `"main"` (glob) nem dependência de `@azure/functions`; `site/api/src/`
  restante só tem `lib/` (utilitários), nenhuma function v4 sobrando. A
  limitação de infraestrutura (duas Function Apps) continua documentada como
  permanente, não como pendência.

  **3. A integração de Eventos (v7.4) e Camisetas (vB.17) está coerente entre
  README e código?** Sim — os dois blocos descrevem o mesmo ponto de
  integração pendente (`congregacao` gravando `CongregacaoId` real via a API
  da vC.2, em vez da relação Directus-Directus solta) e ambos marcam esse
  item como `[ ]` em aberto, não como concluído — conferido que nenhum dos
  dois lados afirma algo que o outro contradiz, e que nenhum item já feito
  ficou marcado como pendente por engano.
