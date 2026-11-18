# Habilidades de design para o Claude: pesquisa

Pesquisa feita em 18/11/2026 (Claude). Foi só pesquisa: nada foi instalado, baixado ou
executado, e nenhum repositório foi alterado. As estrelas e as datas de última alteração
foram conferidas no GitHub nesse mesmo dia. No sistema, só foram LIDOS três pontos
(`app/index.html`, `app/style.css` e `app/staticwebapp.config.json` do ramo `v10-casca`)
para a recomendação ficar presa à realidade.

## (a) Leitura em 2 minutos

**O que é uma "habilidade".** É uma receita escrita (um arquivo `SKILL.md`) que o Claude lê
quando o assunto aparece, como o roteiro que se entrega a um obreiro novo antes do culto.
Algumas vêm sozinhas (só texto). Outras vêm dentro de um "plugin", que pode trazer também
programas que rodam no computador: ganchos automáticos, servidores, robôs de navegador.
Texto só orienta. Programa age. O risco mora no programa.

**O que existe.**

- **Da Anthropic (oficiais):** a habilidade `frontend-design` (desenho com personalidade:
  tipografia, cores, movimento com moderação, acessibilidade e textos) e o plugin `design`
  (crítica de tela, textos de interface, acessibilidade). São só texto, licença Apache 2.0.
- **Da comunidade (muito populares, de 50 mil a 150 mil estrelas):** Impeccable, UI UX Pro
  Max, Taste Skill, Hallmark, as habilidades de animação do Emil Kowalski, as regras de
  interface da Vercel, interface-design e outras. Várias trazem programas, ganchos que rodam
  sozinhos e fontes do Google, e quase todas partem de React/Tailwind ou de página de
  propaganda, não de um sistema de gestão em JavaScript puro.

**O que recomendo (se você autorizar), em 3 passos:**

1. **Instalar a `frontend-design` oficial.** Só texto, sem programa, da Anthropic.
2. **Criar a NOSSA habilidade, "desenho-ieadespa",** com as suas regras: ouro e marinho, fonte
   servida de dentro, CSP, celular primeiro, nada preso embaixo, sem rolagem, 3 a 5 opções em
   claro e escuro. É a que mais rende, porque ensina ao Claude o que nenhuma habilidade pronta
   sabe. A ferramenta oficial para criar habilidades (`skill-creator`) já está disponível aqui.
3. **Copiar para dentro dela, depois de ler linha por linha, as melhores receitas de texto da
   comunidade:** movimento e toque (Emil Kowalski) e a lista de conferência de interface da
   Vercel. Copiar o texto, fixado numa versão, em vez de instalar o pacote: assim nada muda
   sozinho depois.

**O que NÃO recomendo:**

- **Taste Skill, Hallmark e UI UX Pro Max:** trazem programas e/ou ganchos automáticos, puxam
  fontes do Google e fotos de fora e partem de Tailwind ou de página de propaganda. Brigam com
  a sua CSP e com a regra "nada carregado de fora".
- **Impeccable instalado inteiro:** o conteúdo é muito bom, mas o pacote traz um programa que
  baixa um "motor", ganchos e um modo "ao vivo" que, segundo o próprio manual, roda o
  Claude/Codex com as aprovações desligadas. No máximo, ler e aproveitar trechos do texto.
- **web-artifacts-builder** (é React), **stitch-skills** (exige o Google Stitch) e
  **AccessLint** (roda programas da internet sempre na última versão, sem fixar).
- **Instalar "listas awesome" em bloco:** são catálogos, não selo de qualidade.

**O que dá mais resultado e quase não custa (não é habilidade, é técnica):**

- **Trocar a fonte.** Hoje o sistema usa a Inter, puxada do Google (`app/index.html`, linhas
  11 a 13). A `frontend-design` manda fugir das fontes batidas de sempre, e o detector do
  Impeccable cita literalmente "Inter em tudo" como sinal de desenho genérico. Uma fonte com
  personalidade, servida de dentro, muda a cara do sistema inteiro de uma vez.
- **Respeitar "movimento reduzido"** (a pessoa que pediu ao celular menos animação). Hoje o
  `app/style.css` não tem essa regra.
- **Transições curtas** (0,1 a 0,25 segundo) no toque e no mouse, **entradas suaves sem
  JavaScript** (`@starting-style`) e **troca de tela deslizando** ("view transitions"). Tudo
  CSS ou JavaScript puro servido de dentro: **custo de nuvem zero.**

**Segurança em uma frase:** habilidade de terceiro é programa de terceiro. Numa varredura da
Snyk (05/02/2026) com 3.984 habilidades públicas, 13,4 % tinham falha crítica e 76 eram
maliciosas de propósito (roubo de senha, porta dos fundos, instrução escondida). A
Anthropic orienta usar só as próprias ou as dela e auditar tudo das outras.

## (b) Tabela das habilidades e repositórios

Legenda. **Serve?** = Sim / Em parte / Não, para o nosso caso (JavaScript puro, CSP estrita,
muito celular, sites em Astro). **Risco:** Baixo = só texto; Médio = traz programa que roda só
quando chamado, ou busca instrução na internet; Alto = programa ou gancho que roda sozinho, ou
baixa coisas sem versão fixa.

Estrela não é garantia: dá para inflar, e várias destas passaram de 100 mil em poucos meses.
Conta mais quem mantém, o que tem dentro e se roda programa.

### Oficiais (Anthropic)

| Nome e link | O que faz | Quem mantém / atividade | Licença | Serve? | Risco |
| --- | --- | --- | --- | --- | --- |
| [frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) (no [anthropics/skills](https://github.com/anthropics/skills)); o mesmo texto vem como [plugin](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/frontend-design) | Faz o Claude escolher uma direção visual a partir do assunto (a igreja, não "um app qualquer"), montar um conjunto pequeno de cores e tipos, fugir dos clichês de IA, usar movimento com moderação e cuidar de foco, movimento reduzido, contraste e textos | Anthropic (autores Prithvi Rajasekaran e Alexander Bricken); repositório com 197 mil estrelas, alterado em 16/11/2026 | Apache 2.0 | **Sim**: não depende de React e não manda carregar nada de fora | **Baixo**: só texto, sem programa, sem `allowed-tools` |
| Plugin [design](https://github.com/anthropics/knowledge-work-plugins/tree/main/design) (catálogo knowledge-work-plugins) | Comandos `/critique` (crítica de tela), `/ux-copy` (textos de botão, erro, tela vazia), `/accessibility` (WCAG 2.1 AA), `/design-system`, `/handoff` | Anthropic; 36,5 mil estrelas; alterado em 18/11/2026 | Apache 2.0 | **Em parte**: textos e acessibilidade servem; o resto é para equipe de design com Figma | **Baixo a médio**: só texto, mas o pacote liga 9 conectores na internet (Slack, Figma, Linear, Asana, Atlassian, Notion, Intercom, Agenda e Gmail) que pedem login; não rodam sozinhos, mas poluem |
| [theme-factory](https://github.com/anthropics/skills/tree/main/skills/theme-factory) e [brand-guidelines](https://github.com/anthropics/skills/tree/main/skills/brand-guidelines) | 10 temas prontos de cor e fonte; aplicar uma marca (a da Anthropic) | Anthropic | Apache 2.0 (por pasta) | **Não direto**; servem de **modelo** para a nossa habilidade de marca | Baixo |
| [web-artifacts-builder](https://github.com/anthropics/skills/tree/main/skills/web-artifacts-builder) | Monta páginas em React + Tailwind + shadcn e junta tudo num arquivo só | Anthropic | Apache 2.0 | **Não**: é React; os scripts instalam pacotes da internet; o arquivo único com tudo embutido fere a CSP | Médio |
| [webapp-testing](https://github.com/anthropics/skills/tree/main/skills/webapp-testing) | Testes de tela com Playwright em Python | Anthropic | Apache 2.0 | **Não precisa**: o sistema já tem o seu equipamento de teste de tela | Médio (scripts) |

### Comunidade: design, movimento e textos

| Nome e link | O que faz | Quem mantém / atividade | Licença | Serve? | Risco |
| --- | --- | --- | --- | --- | --- |
| [Emil Kowalski: skills](https://github.com/emilkowalski/skills) | 20 habilidades de animação e toque: criar, revisar e remover animação, coreografar vários elementos, gestos, "parecer app de verdade no celular" | Emil Kowalski (trabalhou na Vercel e na Linear, autor do Sonner); 57,9 mil estrelas; alterado em 15/11/2026 | MIT | **Sim, o texto**: é CSS em primeiro lugar (só `transform`/`opacity`, menos de 300 ms, ease-out, hover só com mouse, movimento reduzido). Os trechos de React/Motion são opcionais e devem ser cortados | **Baixo**: só texto (há um arquivo `.pl` vazio na raiz) |
| [interface-design](https://github.com/Dammyjay93/interface-design) | Desenho de PAINÉIS e sistemas (não de site de propaganda): escala de tipos, cores por papel, densidade, modo escuro, movimento; guarda as decisões em `.interface-design/system.md` | Dammyjay93; 6 mil estrelas; última alteração em 20/06/2026 (menos ativo) | MIT | **Em parte**: ideias boas para o sistema; os exemplos puxam para React/Tailwind | Baixo (só texto; sugere gerar imagem se houver ferramenta para isso) |
| [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines) e a habilidade [web-design-guidelines](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines) | Lista de conferência de interface: hover, foco e clique; animação; alvos de toque (44 px no celular); formulários; desempenho; modo escuro | Vercel; a lista tem 1,2 mil estrelas (alterada em 05/10/2026); o pacote, 34,5 mil (12/11/2026) | MIT | **Sim, a lista** (quase toda independe de framework) | **Médio** na forma de habilidade: ela **baixa as regras da internet a cada uso** (do ramo `main`), então o que roda pode mudar depois de revisado. Melhor copiar a lista e fixar |
| [Impeccable](https://github.com/pbakaus/impeccable) | "Vocabulário de design": 24 comandos (`polish`, `animate`, `typeset`, `colorize`, `clarify`, `audit`, `critique`...) e um detector de 62 "vícios de IA" | Paul Bakaus; 112,7 mil estrelas; alterado hoje (18/11/2026); versão 4.9.2; nasceu da `frontend-design` oficial | Apache 2.0 | **Em parte**: o texto é ótimo e não exige framework; o pacote não serve | **Alto**: a pasta da habilidade traz o programa `impeccable`/`impeccable.cmd`, que baixa um motor para `~/.impeccable/bin`; há ganchos que conferem cada edição, extensões e um modo "ao vivo" que roda o Claude/Codex sem aprovações |
| [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Banco pesquisável: 192 paletas, 74 pares de fontes, 130 regras de experiência do usuário, dezenas de estilos | nextlevelbuilder; 151,2 mil estrelas; alterado em 18/11/2026; tem versão paga | MIT | **Pouco**: o padrão é HTML + Tailwind; gera links do Google Fonts; "JavaScript puro" não é opção própria | Médio (script Python local; a página diz que não acessa a internet) |
| [Taste Skill](https://github.com/Leonxlnx/taste-skill) | Direção de arte, imagens de referência e conferência no navegador para fugir da "cara de IA" | Leonxlnx; 118,2 mil estrelas; alterado em 08/11/2026 | MIT | **Não** | **Alto**: scripts em Node, Chrome sem janela, **gancho "Stop" que roda sozinho** ao fim de cada resposta, Google Fonts e fotos do Unsplash |
| [Hallmark](https://github.com/Nutlope/hallmark) | Criar, redesenhar e auditar páginas com 50 "temas" contra a cara de IA | Together AI (conta Nutlope); 57,3 mil estrelas; alterado em 11/11/2026 | MIT | **Não** para o sistema (feito para páginas de apresentação) | **Alto**: scripts em Node, Puppeteer + Chrome, instalador de gancho de edição |
| [designer-skills](https://github.com/Owl-Listener/designer-skills) | 273 habilidades em 33 plugins (pesquisa, sistema de design, interface, interação, textos...) | MC Dean; 3,4 mil estrelas; alterado em 05/09/2026 | MIT | **Pouco**: volume enorme, pensado para designer profissional | Médio (tem pasta de scripts sem descrição) |

### Comunidade: qualidade, acessibilidade e Astro

| Nome e link | O que faz | Quem mantém / atividade | Licença | Serve? | Risco |
| --- | --- | --- | --- | --- | --- |
| [web-quality-skills](https://github.com/addyosmani/web-quality-skills) | Desempenho, Core Web Vitals, acessibilidade (WCAG 2.2), SEO e boas práticas, com base no Lighthouse | Addy Osmani (projeto declarado "não oficial"); 3,1 mil estrelas; alterado em 24/08/2026 | MIT | **Sim**, sobretudo nos **sites em Astro** (cita Astro e HTML puro) | Baixo (sem scripts listados; o Chrome DevTools é opcional) |
| [AccessLint](https://github.com/AccessLint/skills) | 5 habilidades de acessibilidade com robô de navegador e servidor MCP | AccessLint; 122 estrelas; alterado em 25/08/2026 | MIT (segundo a página; o GitHub não reconhece o arquivo) | Em parte | **Alto**: roda `npx @accesslint/...@latest` (sempre a última versão) e abre o Chrome sozinho |
| [stitch-skills](https://github.com/google-labs-code/stitch-skills) | Fluxo de desenho do Google Stitch e arquivos DESIGN.md | Google Labs (declarado "não é produto oficial do Google"); 10,3 mil estrelas | Apache 2.0 | **Não**: exige o servidor do Stitch | — |
| [astro-developer](https://github.com/withastro/astro/tree/main/.agents/skills) | Guia para quem programa o PRÓPRIO Astro | Equipe do Astro | — | **Não**: é para os mantenedores do Astro, não para quem faz site com ele | — |
| [Servidor de documentação do Astro](https://docs.astro.build/en/guides/build-with-ai/) (MCP, não é habilidade) | O Claude consulta a documentação atual do Astro | Equipe do Astro; gratuito e hospedado por eles | código aberto | **Sim**, para os sites | Baixo (só leitura de documentação; nada roda no seu computador) |

### Listas ("awesome"): para procurar, não para instalar

| Lista | Tamanho / atividade | Licença |
| --- | --- | --- |
| [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) | 79,8 mil estrelas | Apache 2.0 |
| [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | 37,3 mil estrelas; mais de 1.000 habilidades de equipes oficiais (Vercel, Microsoft, Cloudflare, Google...) e da comunidade | MIT |
| [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) | 15,9 mil estrelas; selo "atualizado em fev/2026"; traz aviso de segurança | não informada |

## Segurança de instalar habilidades de terceiros

### O que pode dar errado

1. **Programa dentro da habilidade** (pastas `scripts/`, `bin/`): roda com os seus poderes de
   usuário. Pode ler qualquer arquivo do notebook, inclusive `local.settings.json` e as
   credenciais do Azure, e mandar para fora.
2. **Ganchos ("hooks") e "monitores":** rodam sozinhos a cada edição ou ao fim de cada
   resposta. A documentação oficial avisa que eles rodam **fora** das regras de permissão e da
   caixa de areia do Claude Code.
3. **Instrução escondida:** texto em base64, caracteres invisíveis, "ignore as instruções
   anteriores". Cerca de 91 % das habilidades maliciosas da pesquisa da Snyk usavam isso.
4. **Instrução buscada na internet na hora:** o que você revisou hoje não é o que roda amanhã
   (cerca de 21 % das maliciosas). A `web-design-guidelines` da Vercel faz isso: não é
   maliciosa, mas usa o mesmo mecanismo.
5. **Dependência sem versão fixa:** `npx pacote@latest` executa o que estiver publicado naquele
   minuto.
6. **Atualização automática:** no catálogo oficial da Anthropic, os plugins se atualizam
   sozinhos; nos de terceiros, a atualização vem desligada (bom). Os arquivos que você revisou
   podem mudar no disco.
7. **`allowed-tools`:** uma habilidade pode se dar permissão de rodar comandos sem perguntar.
   Revisar esse campo antes de abrir no Claude Code um repositório de outra pessoa.
8. **Conflito com as regras da casa, mesmo sem maldade:** a habilidade manda usar Google
   Fonts, CDN, `<script>` dentro do HTML, Tailwind, React (o Next.js é banido aqui), e o Claude
   obedece. Esse é o risco mais provável no nosso caso.
9. **Gasto de cota:** cada habilidade instalada ocupa cerca de 100 tokens em toda conversa, e
   o corpo, até uns 5 mil quando acionada. Dezenas de habilidades instaladas é cota gasta à toa.

Para ser justo: a maior parte das 76 maliciosas da Snyk veio de um catálogo aberto (ClawHub),
não dos repositórios de design desta tabela. Mas o mecanismo é o mesmo.

### Como avaliar antes (roteiro de 10 minutos)

1. **Preferência:** as nossas, depois as da Anthropic, depois empresa conhecida, por último
   pessoa física. A documentação da Anthropic diz: use habilidades "only from trusted sources:
   those you created yourself or obtained from Anthropic".
2. **Abrir no GitHub e listar TUDO:** `SKILL.md`, `references/`, `scripts/`, `bin/`,
   `hooks/hooks.json`, `.mcp.json`, `package.json`. Tem programa: desconfiar. Tem gancho:
   recusar, ou ler cada linha.
3. **Ler o `SKILL.md` inteiro** procurando endereços de internet, `curl`, `npx`,
   `pip install`, base64, pedidos para ler arquivos de senha, "ignore", "não conte ao usuário".
4. **Conferir `allowed-tools`** no topo do arquivo.
5. **Fixar a versão:** copiar o texto para `.claude/skills/<nome>/` anotando o commit de
   origem; ou registrar o catálogo numa versão marcada (`/plugin marketplace add
   dono/repositorio#v1.2.0`) e manter a atualização automática desligada nos de terceiros.
6. **Antes de instalar um plugin**, ler o quadro "Will install" do `/plugin`; depois de
   instalar, conferir com `claude plugin details <nome>`.
7. **Na dúvida, não instalar.** Para remover: `claude plugin uninstall <nome>` e apagar a pasta
   `~/.claude/plugins/cache/<catalogo>/<plugin>/` (senão os arquivos ficam 14 dias).
8. **Trava extra opcional:** `"disableSkillShellExecution": true` nas configurações impede que
   habilidades rodem comandos embutidos.
9. O instalador `npx skills` (da Vercel) manda dados de uso por padrão (desliga com
   `DISABLE_TELEMETRY=1`). Mais um motivo para copiar à mão o texto já lido.

## (c) Recomendação em ordem e como aplicar sem quebrar as regras

Nada abaixo foi feito. Cada passo depende do seu "pode".

### Passo 1: `frontend-design` oficial (5 minutos, risco baixo)

- **Como:** no Claude Code, `/plugin install frontend-design@claude-plugins-official` e
  escolher "Install for you" (vale para todos os seus repositórios neste notebook). O catálogo
  oficial já vem registrado.
- **Alternativa mais "travada":** copiar o `SKILL.md` e o `LICENSE.txt` para
  `.claude/skills/frontend-design/` do repositório, anotando o commit de origem. Vantagem: não
  muda sozinho e vai para o Git. O repositório é público, mas o texto é Apache 2.0: pode,
  desde que a licença vá junto.
- **Atenção:** ela pede "uma ou duas fontes bem diferentes" e "um momento marcante". Quem
  decide a direção continua sendo você, pelas 3 a 5 opções em claro e escuro.

### Passo 2: a nossa habilidade "desenho-ieadespa" (1 a 2 horas, risco zero)

Arquivo `.claude/skills/desenho-ieadespa/SKILL.md` no repositório (vai para o Git). Conteúdo
sugerido, tirado das suas decisões já registradas:

- **Marca:** ouro `#FFB800` sempre com texto marinho por cima (sobre branco não serve para
  texto); marinho `#0A2342`; branco; uma cor por módulo; tudo em claro e escuro, usando o
  atributo `data-tema` que a casca já usa (`app/modulos/casca.js`).
- **Tipografia:** fonte servida de `app/` (nunca Google Fonts nem CDN); escala de tamanhos
  fixa; números alinhados (`font-variant-numeric: tabular-nums`) em valores e tabelas.
- **CSP:** nada de `<script>` dentro do HTML, nada de `onclick=""`, nada de biblioteca de
  fora; JavaScript no arquivo do módulo do tema (`app/modulos`); estilos no `.css`; não usar
  `setAttribute("style", ...)` nem `style.cssText` (a CSP bloqueia quando ficar estrita).
- **Celular primeiro:** 390 × 844 e 360 × 740; notebook 1280 × 800; alvos de toque com pelo
  menos 44 px; efeito de passar o mouse só em aparelho com mouse.
- **Nada preso embaixo** (abas no alto) e **sem rolagem**: cada tela cabe numa tela; muita
  coisa vira aba ou submódulo.
- **Movimento:** 0,1 a 0,25 segundo, só `transform` e `opacity`, saída suave (ease-out),
  nunca `transition: all`; sempre com a versão de movimento reduzido.
- **Textos:** português simples; verbo no botão ("Salvar cadastro", não "OK"); a mensagem de
  erro diz o que aconteceu e o que fazer.
- **Processo:** 3 a 5 opções, claro e escuro; nada vai à produção sem a sua aprovação
  (FASE 10); passar no teste de tela e na conferência da CSP.
- **Anexos** (arquivos ao lado, copiados e fixados): movimento (Emil Kowalski, MIT) e lista de
  conferência (Vercel, MIT).

Ferramenta: o `skill-creator` oficial, que já está disponível nesta instalação.

### Passo 3: copiar receitas de texto, fixadas (30 minutos, risco baixo)

- **Emil Kowalski:** `emil-design-eng`, `review-animations` e `mobile-native`, só o texto,
  cortando as partes de React/Expo. Licença MIT: manter o aviso de autoria.
- **Vercel:** a lista Web Interface Guidelines como anexo da nossa habilidade, em vez da
  habilidade que baixa as regras a cada uso.
- **Impeccable (opcional):** ler e aproveitar ideias dos textos `animate`, `typeset`,
  `clarify` e `polish` (Apache 2.0), sem o programa.

### Passo 4 (opcional): plugin `design` oficial

Só se você quiser os comandos `/ux-copy` e `/accessibility` prontos. Saber que ele traz os 9
conectores que pedem login.

### Passo 5: sites em Astro

`web-quality-skills` (só o texto, copiado) e o servidor de documentação do Astro. Detalhes na
parte (d).

### Como aplicar sem quebrar as regras do sistema

- **A CSP de hoje** (`app/staticwebapp.config.json`, lida em 18/11/2026): `script-src 'self'`
  está estrita, o que é ótimo. Mas `style-src` ainda aceita `'unsafe-inline'` e
  `https://fonts.googleapis.com`, e `font-src` aceita `https://fonts.gstatic.com`, por causa da
  Inter do Google. Servindo a fonte de dentro, dá para tirar esses dois endereços. Isso é uma
  mudança separada, com a sua aprovação e passando pelo equipamento `tools/csp-e2e`.
- **Fonte nova = arquivo novo no cache do aplicativo:** incluir os arquivos da fonte na lista
  do service worker (a "casca") e subir a versão dela, senão o celular fica com a antiga.
- **Mesmo caminho de sempre:** cada mudança visual passa pelo teste de tela (base aprovada),
  pelo celular 360 × 740 com 0 px de rolagem lateral e pela conferência da CSP (0 violação).
- **Primeira aplicação sugerida:** um "pacote de acabamento" pequeno e fácil de desfazer
  (fonte + movimento reduzido + resposta ao toque + entradas suaves), primeiro na homologação,
  com 3 opções de fonte para você escolher.

### Técnicas que deixam a interface moderna sem pesar

| Técnica | O que o membro sente | Funciona em | CSP | Custo |
| --- | --- | --- | --- | --- |
| Transição curta em `transform`/`opacity` | O botão "responde" ao toque | Todos | Só CSS | Zero |
| Hover só com mouse; `:active` encolhe 3 %; `:focus-visible` (já existe no `style.css`) | No celular, nada fica "grudado" depois do toque; no teclado, sabe onde está | Todos | Só CSS | Zero |
| `@starting-style` + `allow-discrete` | Avisos, menus e janelas entram suaves, sem JavaScript | Todos os atuais (Baseline 2024) | Só CSS | Zero |
| View Transitions na mesma página (`document.startViewTransition`) | Trocar de aba ou de tela "desliza" em vez de piscar | Todos os principais desde 14/10/2025 | JS no arquivo do módulo | Zero |
| View Transitions entre páginas (`@view-transition { navigation: auto; }`) | Nos sites, a página seguinte entra suave | Chrome/Edge e Safari; Firefox parcial (em andamento no Interop 2026) | Só CSS | Zero |
| Modo escuro com `color-scheme` + `light-dark()` | Escuro de verdade, inclusive barras e campos do próprio navegador | Todos os atuais (Baseline 2024) | Só CSS | Zero |
| `prefers-reduced-motion` | Quem pediu menos animação no celular não sente tontura | Todos desde 2020 | Só CSS | Zero (**falta hoje**) |
| Animação ligada à rolagem (`animation-timeline`) | Nos sites, elementos surgem conforme a pessoa desce | Chrome 115+, Safari 26+, Firefox 159+ | Só CSS | Zero; **só nos sites** (o sistema não tem rolagem) |
| Foco nunca escondido (WCAG 2.2, critério 2.4.11, nível AA) | Barra fixa não cobre o campo em que a pessoa está | Todos | Só CSS (`scroll-padding`) | Zero; combina com "nada preso embaixo" |
| Alvos de toque grandes | Acertar o botão de primeira, até com o dedo grosso | Todos | Só CSS | Zero (mínimo de 24 px pela WCAG 2.5.8; 44 px no celular) |
| Fonte servida de dentro (woff2, `font-display: swap`, só os pesos usados) | Abre mais rápido e o aparelho não avisa o Google a cada visita | Todos | Permite apertar a CSP | Algumas dezenas de KB, guardadas no aparelho |

Não recomendo bibliotecas de animação (GSAP, Motion, Lottie): o CSS de hoje faz o que
precisamos. Se um dia precisar, servir de dentro. Efeitos "futuristas" como vidro fosco
(`backdrop-filter`) pesam em celular barato: no máximo em um lugar (o cabeçalho), nunca em
lista.

Exemplos (para o Claude seguir; nada disso foi aplicado):

```css
/* 1. Movimento reduzido: vale para o sistema inteiro */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* 2. Toque e mouse */
.botao { transition: transform 0.12s ease-out, background-color 0.15s ease-out; }
.botao:active { transform: scale(0.97); }
@media (hover: hover) and (pointer: fine) {
  .botao:hover { background-color: var(--cor-botao-hover); }
}

/* 3. Entrada suave sem JavaScript */
.aviso {
  transition: opacity 0.2s ease-out, transform 0.2s ease-out, display 0.2s allow-discrete;
}
@starting-style {
  .aviso { opacity: 0; transform: translateY(8px); }
}

/* 4. Claro e escuro com o atributo que a casca já usa */
:root { color-scheme: light; }
:root[data-tema="escuro"] { color-scheme: dark; }
:root {
  --fundo: light-dark(#FFFFFF, #061629);
  --texto: light-dark(#0A2342, #F2F4F7);
  --destaque: #FFB800; /* sempre com texto marinho por cima */
}

/* 5. Fonte servida de dentro (exemplo de nome; a escolha é sua) */
@font-face {
  font-family: "Atkinson Hyperlegible Next";
  src: url("/fontes/atkinson-hyperlegible-next.woff2") format("woff2");
  font-weight: 200 800;
  font-display: swap;
}

/* 6. Sites em Astro: transição entre páginas sem JavaScript */
@view-transition { navigation: auto; }
```

```js
// 7. Troca de tela deslizando, em JavaScript puro, no arquivo do módulo
function trocarTela(mudar) {
  const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!document.startViewTransition || reduzir) { mudar(); return; }
  document.startViewTransition(mudar);
}
```

**Três caminhos de fonte para você escolher** (todas de licença livre, servidas de dentro):

1. **Atkinson Hyperlegible Next** (Braille Institute, 2025): feita para leitura fácil em
   qualquer idade e com pouca visão. Boa para a igreja inteira.
2. **Títulos com ar tecnológico** (por exemplo, Space Grotesk ou Sora) + Atkinson no texto:
   é o caminho mais "futurista" sem perder a leitura.
3. **Mudança mínima:** manter a Inter só no texto, servida de dentro, e trocar só a fonte dos
   títulos.

## (d) Como isso vale para os outros repositórios

- **Onde instalar:** plugin no escopo "usuário" vale em todos os repositórios deste notebook.
  Habilidade em `.claude/skills/` vale só naquele repositório e vai junto no Git. Repositório
  público = texto público: nunca pôr senha, chave ou dado pessoal ali.
- **O que é geral e o que é da casa:** a `frontend-design` e as regras de movimento e
  acessibilidade valem para tudo. A "desenho-ieadespa" vale também para os sites (mesma
  marca), com um anexo próprio para Astro.
- **Sites em Astro:**
  - O Astro 6 tem CSP própria e estável (`security.csp`), que põe uma etiqueta `<meta>` com as
    impressões digitais de cada script e estilo. Três limites que a documentação dá: **não
    funciona com o `<ClientRouter />`** (as transições do próprio Astro), não funciona no
    `astro dev` (testar com `build` + `preview`) e script ou estilo de fora só entra com a
    impressão digital informada à mão. Por isso, nos sites, transição entre páginas com o CSS
    nativo (exemplo 6), não com o `ClientRouter`.
  - Servidor de documentação oficial do Astro, gratuito:
    `claude mcp add --transport http astro-docs https://mcp.docs.astro.build/mcp`.
  - `web-quality-skills` para Lighthouse e Core Web Vitals: site leve aguenta melhor os picos
    dos eventos.
  - A animação ligada à rolagem pode entrar nos sites como enfeite opcional.
- **Outros sistemas:** a mesma receita. `frontend-design` no usuário; uma habilidade de regras
  da casa em cada repositório.
- **Codex:** o formato `SKILL.md` é um padrão aberto (Agent Skills). Segundo a documentação da
  OpenAI, o Codex lê habilidades em `.agents/skills/` do repositório e em `~/.agents/skills`
  do usuário (uma página antiga da própria OpenAI cita `~/.codex/skills`, então convém
  conferir na primeira vez). Uma cópia ali, ou o `AGENTS.md` apontando para a nossa, faz as
  mesmas regras valerem quando você alterna entre Claude e Codex.
- **Passagem de bastão:** quando você decidir quais habilidades entram, registrar a decisão na
  memória do projeto e no `HANDOFF.md`, como manda a regra global.

## Fontes

Anthropic e documentação oficial:

- [anthropics/skills](https://github.com/anthropics/skills) e a [frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design)
- [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) (pasta `plugins/frontend-design`)
- [anthropics/knowledge-work-plugins: plugin design](https://github.com/anthropics/knowledge-work-plugins/tree/main/design)
- [Agent Skills: visão geral e "Security considerations"](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- [Claude Code: Skills](https://code.claude.com/docs/en/skills)
- [Claude Code: instalar e gerenciar plugins](https://code.claude.com/docs/en/discover-plugins)
- [Claude Code: segurança e confiança em plugins](https://code.claude.com/docs/en/plugins/security.md)
- [Claude Code: criar um catálogo de plugins](https://code.claude.com/docs/en/plugin-marketplaces)
- [Cookbook "Prompting for frontend aesthetics"](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics)

Comunidade:

- [pbakaus/impeccable](https://github.com/pbakaus/impeccable) e [impeccable.style](https://impeccable.style/)
- [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
- [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill)
- [Nutlope/hallmark](https://github.com/Nutlope/hallmark)
- [emilkowalski/skills](https://github.com/emilkowalski/skills)
- [Dammyjay93/interface-design](https://github.com/Dammyjay93/interface-design)
- [Owl-Listener/designer-skills](https://github.com/Owl-Listener/designer-skills)
- [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills), [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) e [vercel-labs/skills](https://github.com/vercel-labs/skills)
- [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills)
- [AccessLint/skills](https://github.com/AccessLint/skills)
- [google-labs-code/stitch-skills](https://github.com/google-labs-code/stitch-skills)
- [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills), [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills), [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills)
- [Snyk: top skills de UI/UX](https://snyk.io/articles/top-claude-skills-ui-ux-engineers/) e [guia de 24 skills de design](https://pasqualepillitteri.it/en/news/576/claude-code-skills-design-uiux) (só para levantar nomes; os números foram reconferidos no GitHub)

Segurança:

- [Snyk ToxicSkills (05/02/2026)](https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub/)
- [Red Hat: ameaças e controles em Agent Skills](https://developers.redhat.com/articles/2026/03/10/agent-skills-explore-security-threats-and-controls)

Técnica:

- [MDN: @starting-style](https://developer.mozilla.org/en-US/docs/Web/CSS/@starting-style)
- [MDN: light-dark()](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark)
- [MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- [MDN: CSP style-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src)
- [web.dev: View Transitions na mesma página viram Baseline](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available)
- [Chrome: View Transitions entre páginas](https://developer.chrome.com/docs/web-platform/view-transitions/cross-document) e [caniuse](https://caniuse.com/cross-document-view-transitions)
- [caniuse: animation-timeline](https://caniuse.com/mdn-css_properties_animation-timeline)
- [web.dev: Interop 2026](https://web.dev/blog/interop-2026)
- [W3C: WCAG 2.2, Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
- [Astro: View Transitions](https://docs.astro.build/en/guides/view-transitions/), [referência de configuração (security.csp)](https://docs.astro.build/en/reference/configuration-reference/) e [Build with AI](https://docs.astro.build/en/guides/build-with-ai/)
- [OpenAI Codex: Agent Skills](https://developers.openai.com/codex/skills)
- [Atkinson Hyperlegible Next (ficha da fonte, licença OFL)](https://fontsource.org/fonts/atkinson-hyperlegible-next/about)
