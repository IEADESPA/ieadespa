# FASE 10 — Experiência, Design e Performance

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

Pacote à parte, pra depois de todo o resto do sistema estar pronto — faz mais sentido
investir em polimento visual/performance quando as telas já estiverem todas
construídas, em vez de redesenhar no meio do caminho. Avaliado nesta fase: adotar um
motor tipo **Astro** — descartado (Astro é pra sites majoritariamente estáticos com
ilhas pontuais de interatividade; este sistema é um painel CRUD dinâmico o tempo
todo — trocar de motor seria reescrever a aplicação sem ganho real). O caminho é
melhorar o que já existe (HTML/CSS/JS puro), não trocar de arquitetura.

> **Escopo revisto (19/09) — pedido explícito do usuário, 2ª rodada.** Primeira
> revisão (mesma data, mais cedo) já tinha ampliado v10.1 de "refinamento" pra 4
> versões — o usuário considerou ainda raso ("fichinha") e pediu pesquisa real de
> mercado, não achismo interno. Feita agora (19/09): números concretos abaixo vêm de
> 3 fontes — (1) **padrões de dashboard 2026 de Linear/Stripe/Grafana/Vercel**
> (sidebar 256px, faixa de 4-6 cards de indicador, grid de 12 colunas, estados
> obrigatórios de carregando/vazio/erro); (2) **shadcn/ui**, o design system mais
> citado do mercado pra sidebar de painel (estrutura Header/Content agrupado por
> seção/Footer fixos, item de menu com altura/raio/estado-ativo padronizados,
> variáveis de tema light/dark); (3) **regras de tipografia de dashboard enterprise**
> (escala de 7 níveis por proporção matemática ~1.125-1.2, peso/contraste por nível).
> Mais a referência setorial já usada em v5.6/v5.7 — **ChurchSuite** e **Planning
> Center** — como parâmetro de "isso é o que profissionaliza visualmente um sistema
> de gestão eclesiástica". Nenhuma dessas fontes manda trocar de arquitetura (todas
> são só HTML/CSS/JS por trás) — a decisão da abertura desta fase (não trocar de
> motor) continua de pé; o que muda é que agora **cada item abaixo tem número, não
> adjetivo**.

## v10.1 — Fundamentos do sistema de design (tokens, tipografia, ícones)

- [ ] Ícones de verdade (Lucide/Feather via CDN) no lugar de todo emoji cru — sidebar
      (13 módulos), botões de ação, badges de status, cabeçalhos de painel.
- [ ] Escala tipográfica de **7 níveis**, proporção ~1.125-1.2 (fonte: regras de
      tipografia enterprise SaaS): H1 24-32px/peso 600 (título de página), H2
      18-20px/600 (título de seção), H3 15-16px/500 (rótulo de card/painel), Corpo
      14px/400, Legenda 12px/400, e **dado em destaque** (KPI/valor financeiro) maior
      que o rótulo ao lado + peso 600+. Fonte da interface continua Inter (já
      instalada — é exatamente a família humanista que essas regras recomendam,
      classe "IBM Plex Sans/DM Sans/Figtree/Sora"); valor numérico em tabela
      financeira ganha fonte monoespaçada (ex: JetBrains Mono via CDN) só pro número,
      pra alinhar caractere a caractere. Contraste mínimo 4.5:1 corpo / 3:1 texto
      grande (mesma régua WCAG AA que vB.10 já aplica — não muda, só passa a valer
      pra cada nível novo da escala).
- [ ] Paleta expandida com cor de identidade por área/fase (ex: Financeiro, EBD,
      Disciplinar, Governança cada um com um tom de destaque próprio, sem perder o
      marinho/dourado institucional como base) — objetivo é dar orientação visual
      imediata de "em que parte do sistema eu estou", não só o rótulo de texto.
- [ ] Escala de espaçamento em grid de 8px declarada em `:root` (`--esp-1: 4px` ...
      `--esp-6: 48px`, por exemplo — grid de 8px é o padrão que sustenta o gutter de
      24px do item de grid abaixo) e substituição gradual dos valores soltos hoje
      espalhados pelo CSS (8/10/12/14/16/18/20/22/26px sem escala).

## v10.1.1 — Redesenho da navegação e da grade de módulos

- [ ] Sidebar reestruturada no padrão shadcn/ui — hoje é uma lista plana de botões;
      vira: cabeçalho fixo, corpo rolável **agrupado por seção com rótulo** (ex.
      "Governança", "Financeiro", "EBD" em vez de 13+ botões soltos em sequência
      histórica de implementação), rodapé fixo (usuário logado) — mesma composição
      Header/Content-agrupado/Footer do componente de referência.
  - Item de menu: 36px de altura, 12px de padding horizontal, 8px de raio.
  - Estado ativo: fundo a 8% de opacidade da cor primária + borda esquerda de 3px —
    no lugar do preenchimento sólido dourado atual (`.btn-aba.ativo`), mais sóbrio e
    mais parecido com o que o mercado já validou em produção.
  - Largura expandida 230px → **256px** (padrão de mercado), colapsada mantém 64px.
- [ ] `.card-modulo`/`.grade-modulos` (portal de serviços, v4.2) ganha identidade
      visual por módulo (cor/ícone coerentes com o token de área da v10.1), não só
      ícone+texto genérico repetido 13+ vezes.
- [ ] Cabeçalho de página consistente (título + contexto/breadcrumb + ação principal
      da tela) — hoje cada aba monta `.cabecalho-secretaria` do zero, sem padrão de
      onde fica o quê.

## v10.1.2 — Redesenho dos componentes recorrentes

- [ ] **Faixa de indicadores** (KPI) em painéis de resumo (Meu Painel, resumos de
      módulo) — hoje `.resumo-stats`/`.stat-tile` já existe mas sem padrão de
      mercado: vira 4-6 cards no máximo, 200-280px cada (`grid-template-columns:
      repeat(auto-fill, minmax(200px, 1fr))`), número principal em 28-32px alto
      contraste, comparação (ex. "vs. mês anterior") em 14px cor secundária, no
      máximo 1 elemento visual de apoio por card (sparkline ou seta de tendência,
      nunca os dois).
- [ ] Conteúdo principal migra pra **grid de 12 colunas**, gutter 24px: tabela cheia
      = `grid-column: 1 / -1`, layout de 2 colunas = `span 7` + `span 5`, 3 cards
      iguais = `span 4` cada — no lugar do empilhamento vertical solto de hoje.
- [ ] Tabela (`.tabela-frequencia`, reaproveitada em ~175 tabelas geradas em
      `app/script.js`) revisada: altura de linha 48-52px (visão confortável) ou
      36-40px (visão densa, por preferência de tela), cabeçalho fixo (`position:
      sticky`, fundo sólido, `z-index` acima do conteúdo), alinhamento por tipo de
      dado (texto à esquerda, número à direita, badge de status centralizado) —
      hoje tudo alinha à esquerda igual, número incluso.
- [ ] **3 estados obrigatórios em qualquer lista/tabela** (hoje só existe o estado
      "com dado" e "vazio" tratados de forma ad-hoc): carregando (skeleton — bloco
      cinza pulsante do tamanho da linha real, não spinner central bloqueando a
      tela), vazio (frase + ação sugerida, nunca só uma tabela sem linha nenhuma) e
      erro (por componente/painel, nunca a tela inteira em branco).
- [ ] Formulário padrão (rótulo, campo, erro inline, ajuda contextual) com hierarquia
      visual clara entre campo obrigatório/opcional/calculado — hoje um campo
      `readonly` calculado (ex: v5.5) parece visualmente igual a um campo digitável.
- [ ] Card de detalhe/seção (`.cartao-perfil`, `.resumo-stats`/`.stat-tile`, etc.)
      unificado num único padrão reaproveitável, no lugar de cada módulo inventar o
      próprio card.
- [ ] Badge de status (`.badge-status`, `.tag-pendente`) com paleta e forma
      consistentes em qualquer módulo que tenha estado (RASCUNHO/PENDENTE/APROVADO/
      etc. — hoje cada módulo novo tende a reinventar a própria cor de status).

## v10.1.3 — Aplicação módulo a módulo (varredura completa)

- [ ] Passar os tokens/componentes da v10.1-v10.1.2 por **todas** as telas já
      construídas (FASE 0 a 9), fase a fase, documentando aqui o antes/depois —
      não um redesenho "geral" solto, e sim uma varredura rastreável tela por tela,
      mesmo espírito de qualquer Trava de Revisão deste README (nada fica "meio
      migrado" sem registro de onde parou).
- [ ] Auditoria final: nenhuma tela nova (FASE 11 em diante, se vier antes desta
      trava fechar) pode nascer fora do sistema de design novo — checagem cruzada
      igual às Travas de Revisão já fazem pra código/dado.

## v10.2 — Performance e cache (com análise de custo/benefício)

- [ ] Hoje cada troca de aba sempre rebusca tudo do zero, sem cache no navegador —
      por isso a lentidão varia (não é a tela que é "mal feita", é a consulta por
      trás que pesa mais em algumas abas, ex: Congregações). Introduzir cache leve
      no front só pro que realmente não muda a cada clique.
- [ ] **Decisão em aberto**: cache tem que ser dosado — não é "cachear tudo". Definir
      o que entra (catálogos que raramente mudam) e o que fica de fora (listas que
      mudam com frequência), pra não virar um cache pesado/desatualizado.
- [ ] Revisar pontualmente as consultas mais pesadas no backend (ex: Congregações).

> **Adiantado fora de ordem (19-20/09)**: a queixa real de login levando
> 10-15s não podia esperar a FASE 10 — investigação completa (com acesso real
> à assinatura Azure) e ações tomadas documentadas em `HOMOLOGACAO.md` §
> "Investigação de lentidão e custo": Auto-Tuning do SQL desligado (causa real
> do banco nunca pausar), e migração de "Managed Functions" (cold start
> documentado de 15-30s) pra "Bring Your Own Functions" com Flex Consumption —
> validada em homologação, **produção pendente** por um bug conhecido do
> Azure (issue aberta, sem solução). Este item da v10.2 (cache de front,
> revisão de consultas) continua de pé — o achado acima foi infraestrutura,
> não isso aqui.

## v10.3 — Responsividade mobile

- [ ] Tabelas hoje cortam no celular sem rolagem horizontal (funcionam no notebook,
      não no telefone) — adicionar `overflow-x: auto` nos contêineres de tabela e
      revisar o layout geral em telas pequenas.

## 🔒 Trava de Revisão 10-A — antes de avançar para a v10.4

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3).
Audita v10.1 a v10.3 (incluindo v10.1.1-v10.1.3) pelas 5 perguntas do checklist.

## v10.4 — Modularização do front-end *(7ª rodada — dívida técnica real)*

> **Entregue na vD.2 (07/10/2026), antes da FASE 7 terminar** — ver
> [`fase-d-robustez-e-operacao.md`](fase-d-robustez-e-operacao.md), seção vD.2: o
> `script.js` (21.711 linhas) virou um núcleo de ~1.550 linhas mais 23 módulos em
> `app/modulos/`, com prova de equivalência ação por ação. O que a vD.2 deixou de
> propósito para depois, e continua aqui como item aberto: carregar sob demanda,
> `index.html` por módulo e as funções reaproveitáveis.

Achado da varredura de código: `app/script.js` tem **7.898 linhas em arquivo
único** e `app/index.html`, 2.215. Todo módulo novo das fases 5-11 vai empilhar
ali. Não é questão de estética — é que a partir de certo ponto o arquivo fica
arriscado de editar: uma chave a menos derruba o painel inteiro, e o navegador
carrega tudo a cada acesso.

- [ ] Quebrar `script.js` por módulo (membresia, governança, disciplina,
      financeiro, EBD...), carregados sob demanda — sem trocar de framework
      (decisão da FASE 10 continua valendo: melhorar o que existe, não reescrever).
- [ ] Mesmo tratamento no `index.html`: o markup de cada módulo em arquivo
      próprio, montado na navegação.
- [ ] Padronizar o que já se repete de fato no código (tabela com filtro,
      formulário mestre-detalhe, badge de status) em funções reaproveitáveis —
      hoje cada módulo reescreve a sua versão.
- [ ] **Fazer isso antes da FASE 5**, não depois: é mais barato modularizar 8 mil
      linhas do que 20 mil.

## v10.5 — Impressão institucional e exportação padronizada *(7ª rodada)*

- [ ] Todo relatório do sistema com versão impressa padronizada (cabeçalho
      institucional, identificação de quem emitiu, data/hora e protocolo da vB.4)
      — hoje cada tela resolve do seu jeito, e documento de igreja circula
      impresso.
- [ ] Exportação em planilha padronizada em todos os módulos (hoje só Pessoas
      tem, v1.8), sempre respeitando o escopo de quem exporta e registrando a
      exportação (vB.8).

## 🔒 Trava de Revisão 10-B — antes de encerrar a FASE 10

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3).
Audita v10.4 e v10.5 pelas 5 perguntas do checklist, e faz uma varredura
final na FASE 10 inteira — v10.4 é modularização do próprio `script.js`
(hoje um arquivo único de milhares de linhas), então o próprio risco de
regressão desta versão é o motivo de existir a trava: dividir o arquivo sem
quebrar nenhuma tela das fases 0-9 exige justamente o item 2 do checklist
(clicar em cada tela, uma por uma) feito por inteiro, não por amostragem.

**Nota sobre a FASE 11**: ela é especulativa/opcional (ver abertura da fase)
e não tem roadmap de versões comprometido — por isso não recebe Trava de
Revisão. Se um dia for desenhada de verdade, ganha as suas próprias travas
na mesma hora em que ganhar suas próprias versões `v11.X`.
