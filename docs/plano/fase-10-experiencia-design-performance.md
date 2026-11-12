# FASE 10 — Experiência, Design, Desempenho e Indicadores

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

**Reescrita em 11/11/2026 com o responsável, antes de começar.** A FASE 10 é a que "coloca ordem na casa": o sistema tem as regras
certas (FASES 0 a 9), mas a tela não presta para um ser humano usar — nas palavras dele, hoje dá vergonha de apresentar. Texto quebrado,
termos técnicos, dado que não conversa com o outro, menu que rola junto com o conteúdo (e deixa um espaço branco), lançamento que não parece
planilha, data difícil de pôr, entrada pela tela de frequência e código por e-mail a cada acesso. O teste automático (máquina) consegue usar
a homologação; o objetivo agora é que **o ser humano** goste de usar: moderno, limpo, responsivo, sem travar — "transformar o imprestável em
algo excelente".

**Decisões do responsável (11/11/2026):**

- A antiga FASE 12 (indicadores, comparação entre congregações, alerta de evasão, painel do Presidente) **entra nesta fase, no fim**, depois
  da importação do cadastro de membros (indicador sem dado real não mostra nada).
- Depois desta fase vem a **FASE 11 — cadastro de membros próprio e escuta** (adiantada por ele: sair do sistema de membros pago) e, por
  último, a **FASE 12 — criador de sites**. A antiga FASE 11 (sistema campal) saiu do plano.
- **Sem pressa:** uns dois meses, com calma, para ficar excelente. Nada é empurrado para frente por aperto de prazo.
- O site **não é tocado** até o evento que está no ar terminar (fim de novembro): a passagem do site para o sistema fica para depois.
- Continua de pé a decisão de setembro: **não trocar de motor** (o sistema é um painel de cadastro dinâmico; HTML/CSS/JS próprio, sem
  framework). Melhora-se o que existe.

## O que é "excelente" — as metas desta fase (medidas, não adjetivos)

| Meta | Como se mede |
| --- | --- |
| Entrar no sistema sem código por e-mail a cada vez (chave do aparelho, ou senha num aparelho de confiança) | prova no navegador com o autenticador virtual (como a vD.4) |
| Nenhum código técnico na tela (`EM_PARECER`, sublinhado, sigla de banco) | varredura automática do texto de todas as telas (equipamento `tools/csp-e2e`) |
| Nenhum texto cortado, quebrado no meio ou saindo da caixa; nenhuma rolagem para o lado; nenhum espaço branco sobrando | varredura automática no computador (1366 px) e no celular (360 px) |
| O menu da esquerda e o conteúdo rolam separados | prova no navegador: rolar o conteúdo não mexe no menu, e vice-versa |
| Lançar uma lista (ex.: dízimos do culto) como numa planilha, só com o teclado | prova no navegador: 20 lançamentos seguidos sem tirar a mão do teclado |
| Abrir qualquer tela em até 1 s (com dados reais), gravar em até 2 s | medido na homologação com o cadastro real importado |
| **100 pessoas usando e gravando ao mesmo tempo sem travar** | teste de carga com 100 usuários de teste na homologação, antes da produção |
| Assembleia com 1.000 membros votando | teste com 1.000 votantes de teste na homologação (o "modo assembleia") |
| Zero erro no console e zero violação de segurança (CSP) | o teste de tela de sempre, completo |
| Leitura confortável (contraste, tamanho de letra, teclado) | régua WCAG AA, conferida tela por tela |
| Telas que aguentam a Igreja crescer (muitas áreas, regiões, quadrantes e distritos; centenas de pendências) | conferido na homologação com a massa grande e nas propostas com uma Igreja maior de mentira |
| **Aprovado pelo responsável** | ele viu e aprovou cada tela (3 a 5 opções por tela, claro e escuro) antes de ir ao ar — regras abaixo |

**Como se trabalha nesta fase:** cada versão passa pela homologação; a mudança de tela é de propósito, então o teste de tela ganha uma base
nova a cada etapa (como na Trava 9-B); e, além da máquina, o responsável **vê** as telas e só vai à produção o que ele aprovar.

**Regras de aprovação desta fase (ditadas pelo responsável em 11/11/2026 — valem para a FASE 10 inteira):**

1. **Nada vai para a produção sem ele ver e aprovar — literalmente nada** (tela, cor, texto, comportamento). Ele aprova **vendo**: no
   link da homologação (o Claude manda o link e ele entra) ou na página de propostas (artefato do Claude). Sem o "aprovado" dele, a
   mudança não entra na `main`. As anotações deste plano continuam indo para o GitHub na hora (é por elas que ele acompanha).
2. **Toda tela e toda situação vêm com no mínimo 3 e até 5 opções** (de tela e de cor), sempre em **modo claro e modo escuro**. Vale
   também quando a linha geral já foi escolhida: a tela do módulo, a do submódulo, a do formulário... cada uma com as suas 3 a 5 opções.
3. **Por quê:** "a IA é sempre tendente ao erro". Vendo as opções antes, se houver erro, corrige-se antes de ir ao ar; se houver algo
   melhor, ele traz o melhor para a tela.
4. **A página de propostas tem de ser fácil de ver.** O quadro grande (canvas) da primeira rodada ficou complicado para ele. A próxima
   rodada é **clicável**: escolher a tela, escolher a opção (1 a 5) e ver a prévia daquela opção, claro ou escuro — páginas iniciais de
   verdade para ele clicar, não um quadro solto.

## v10.1 — A homologação de verdade, o raio-x e as referências (a linha de base)

Antes de mudar qualquer coisa, medir o que existe — para saber onde dói e provar depois que melhorou. E medir num lugar que se pareça com a
Igreja de verdade.

**A homologação de verdade (pedido do responsável, 11/11/2026).** A homologação existe (o ambiente do PR #21, com o banco `ieadespa-homolog`
e os mesmos deploys do código), mas a massa fictícia de hoje é pequena demais para testar alguma coisa: 1 área, 3 congregações, 60 pessoas e
20 dizimistas — nenhum lançamento, EBD, evento, escala ou histórico. O responsável quer um sistema de teste **permanente, cheio de dados de
mentira**, onde se testa tudo antes da produção — inclusive ele mesmo, clicando como um usuário.

- [x] **Massa grande de dados fictícios** gerada por um script (nunca dado real; o script se recusa a rodar fora de um banco com "homolog" no
      nome), do tamanho de uma Igreja grande: várias regiões e áreas, ~40 congregações e Extensões, ~5.000 membros com famílias, idades,
      situações e cargos (a escada ministerial inteira), anos de lançamentos de dízimo e oferta, saídas, fechamentos e repasses, turmas e
      chamadas da EBD, escalas, eventos e inscrições, cuidado pastoral, missões, distritos, enquetes — respeitando as regras e os vínculos do
      banco. **Feito em 12/11/2026** (`api/scripts/semear-homologacao-grande.js`, por enquanto só no ramo `homolog`): 45 congregações, 3
      Regiões, 9 Áreas, 2 Quadrantes, 1 Distrito, 10 Extensões, 5.047 pessoas, 36 meses de tesouraria (68.709 lançamentos, 1.620
      fechamentos, 8.126 saídas), prestações de contas, 18 meses de relatórios dos departamentos (5.146), reuniões da CLI e da JAI, PSC de
      2026, um ano de EBD (131.609 chamadas) e escalas. A história tem tendência: 27 congregações crescem, 11 ficam estáveis e 7 caem;
      dezembro forte, janeiro e julho fracos; ~5% das pessoas se afastam aos poucos (o padrão do alerta de evasão da v10.12). Gerada na
      homologação em 13 minutos.
- [ ] **Segunda leva da massa:** missões, expansão, entidades vinculadas, consagração e credencial (esteiras com decisões da CME, da CLI e
      do Presidente). **Não entram, de propósito:** calendário e eventos (o ano é uma linha única, sem marca de fictício, e o gatilho do ciclo
      da CLI impede desfazer), vistorias de segurança (o banco proíbe apagar vistoria), cuidado pastoral (a rotina diária já detecta o
      afastamento a partir da massa; itens e notas não se apagam) e termos e consentimentos (a massa não forja assinatura).
- [x] **Sempre igual e refazível:** a mesma semente gera a mesma massa; um comando apaga tudo e gera de novo; o deploy da homologação mantém
      a massa (não refaz a cada vez). Rodar de novo só completa o que falta; `--apagar` tira só o que tem a marca de fictício (matrículas
      700000 a 799999, nomes "(Fictícia)"). O deploy do ramo `homolog` roda o gerador depois do semeador pequeno.
- [x] **Entrar como cada papel** (Secretaria, Tesouraria Geral, Dirigente, Tesoureiro local, Pastor de Área, Presidente, membro), com
      logins de teste — para o responsável testar como um usuário de verdade; isso existe **só** na homologação. Presidente 700001,
      Secretário Geral 700002, Tesouraria Geral 700003, Superintendentes 700011–700013, Pastores de Área 700021–700029, Pastor Distrital
      700031, Dirigente da congregação k = 700100 + k e Tesoureiro Local = 700200 + k (k = 1 é a Sede).
- [ ] **Defeito achado pela massa (12/11/2026):** a categoria de entrada "Oferta de Culto do Departamento" não pode ser lançada — o código
      dela (`OFERTA_CULTO_DEPARTAMENTO`, 25 letras) não cabe no campo `LancamentosTesouraria.Tipo` (20). Correção: uma migração alargando o
      campo. Mexe na produção: espera o "pode corrigir" do responsável.
- [ ] O custo conferido: o banco da homologação pausa sozinho quando ninguém usa; a massa grande ocupa pouco espaço.

**O raio-x e as referências:**

- [ ] Varredura automática de **todas** as telas (computador e celular), **na homologação com a massa grande** (com volume de Igreja de
      verdade a lentidão aparece; com 60 pessoas, não): tempo para abrir, erros no console, texto cortado ou saindo da
      caixa, rolagem para o lado, espaço branco sobrando, termos técnicos visíveis (códigos com sublinhado, siglas de banco), artigos de
      norma no meio do texto.
- [ ] **Propostas de tela, não fotos soltas** (decisão do responsável, 11/11/2026: "tudo está péssimo; não vou passar 2 horas olhando o
      que já sei que está ruim"): uma página do Claude (artefato) por partes, cada parte com o "antes" e **3 a 5 opções do novo**, para ele
      escolher e aprovar parte por parte. A primeira (parte 1, porta de entrada; parte 2, menu e conteúdo) foi publicada em 11/11/2026;
      as escolhas dele estão na v10.2 e na v10.5. A rodada seguinte segue as **regras de aprovação** do início deste arquivo (3 a 5 opções
      por tela, clicável).
- [x] **Pesquisa de referências** (11/11/2026, em [`docs/pesquisa/referencias-design-2026.md`](../pesquisa/referencias-design-2026.md)): como
      sistemas de gestão modernos (de igreja e de outros ramos) resolvem a entrada, o menu, o lançamento em lista, a data, o painel, as
      tabelas, os formulários e o celular, com o padrão a seguir em cada parte e as fontes; mais o contraste medido das cores de hoje (o
      dourado sobre branco, o texto suave, o verde de sucesso e a borda dos campos não passam) e a proposta de paleta, letras e espaços.
- [ ] Mapa do sistema de hoje: cada aba, pílula, sub-aba e formulário, quem usa (papel) e com que frequência — a base para reorganizar.
- [ ] Relatório com o ranking dos problemas (o que atrapalha mais gente primeiro), registrado aqui.

Já visto em 11/11/2026 — no equipamento de teste (dados de mentira) e na produção, no navegador do responsável, com ele logado (só olhando,
sem gravar nada):

- **Entrada:** `app.ieadespa.org.br` abre a "Frequência Ministerial" (matrícula e senha da reunião); o painel é um link pequeno embaixo.
- **Meu Painel:** 26 itens no menu da esquerda; para ver o fim dele, a página inteira rola, o conteúdo da direita acaba e sobra um espaço
  branco; os cartões dos módulos ficam numa caixa com uma rolagem própria minúscula (duas rolagens brigando na mesma tela).
- **Financeiro › Lançamentos:** um formulário comprido, um campo por linha na largura toda, com "dizimista cadastrado" numa lista e "nome
  avulso" noutro campo; o mês é o campo cru do navegador; a lista dos lançamentos fica **no fim da página**, depois do "Cadastrar dizimista" e
  do "Conciliar PIX em lote" (o arquivo também é o botão cru do navegador).
- **Pessoas:** **defeito** — ao entrar pelo cartão, "Cadastrar Pessoa" mostra só o título e a página em branco; o formulário só aparece
  depois de trocar de aba e voltar. Na busca, a coluna "Situação" mostra o código `EM_COMUNHAO`; no cadastro, o rótulo traz o artigo no meio
  ("Cargo Ministerial (escada — Art. 71; muda pela consagração, só o Geral corrige aqui)"); a data é o campo cru "dd/mm/aaaa"; o menu do
  módulo muda de itens entre uma aba e outra.

## v10.2 — A porta de entrada (a página inicial e o login)

**Escolha dele na primeira rodada de propostas (11/11/2026):** no **celular, a Opção A**; no **notebook, a Opção B**, com o **logo da
Igreja** e uma **foto** (a foto, ele manda). A Opção C saiu (simples demais). O desenho final ainda passa pelas regras de aprovação.

**Rodada 2 (12/11/2026, na página clicável):** no notebook, aprovada a **"Foto na tela inteira"** (a foto cobre a tela, escurecida; boas-vindas
à esquerda e o formulário num cartão à direita). No celular, aprovada a **"Campos já abertos"** (botão da digital e, logo abaixo, matrícula e
senha num cartão), **com uma foto por trás**. As fotos têm dois formatos: **deitada no notebook e em pé (retrato) no celular**.

- [ ] **A página inicial é a entrada no sistema**, não a "Frequência Ministerial". O registro de presença sai da porta: passa a ser feito
      pela reunião ou pelo evento no Calendário (a senha da reunião continua valendo ali, e a contagem de faltas da CLI, Art. 27, continua a
      mesma). O "Preciso de ajuda" (proteção de crianças) **continua na entrada, sem login** — é canal de proteção.
- [ ] **Entrar sem código por e-mail a cada vez:**
  - **chave de acesso do aparelho** (a do celular e a do notebook, com a digital, o rosto ou o PIN do próprio aparelho — já existe desde a
    vD.4) como o caminho principal: um toque e pronto;
  - ou **matrícula (ou e-mail) e senha** num **aparelho de confiança** ("confiar neste aparelho"): o código por e-mail só aparece na
    **primeira vez** em um aparelho novo, ou para recuperar o acesso;
  - a lista dos aparelhos de confiança fica em Meu Perfil › Segurança, com o "sair deste aparelho" e o prazo de validade.
- [ ] Os atos sensíveis (a confirmação reforçada, 428) confirmam com a **chave do aparelho** — sem e-mail; o código por e-mail fica só para
      quem não tem chave.
- [ ] O membro comum entra do mesmo jeito simples (chave do aparelho ou matrícula e senha/PIN), sem código por e-mail no dia a dia.
- [ ] Segurança conferida: aparelho de confiança guardado só como marca aleatória (nunca a senha), com prazo e revogável; tentativa errada
      continua limitada; a prova no navegador com o autenticador virtual cobre o fluxo inteiro.

## v10.3 — Sistema de design (a "identidade" da tela)

- [ ] **Ícones de verdade** (biblioteca servida de dentro do sistema, como as outras) no lugar dos emojis.
- [ ] **Letras:** escala de 7 tamanhos (título de página, de seção, de cartão, corpo, legenda, número em destaque), com peso e contraste
      certos; números de dinheiro alinhados.
- [ ] **Cores:** a base marinho e dourado da Igreja, mais uma cor de apoio por área (Membresia, Financeiro, Ministério, Expansão...) para
      a pessoa saber "onde estou"; cores de estado (ok, atenção, erro, informação) iguais em todo o sistema.
- [ ] **Espaços** numa grade de 8 px, declarados uma vez (`:root`), no lugar dos valores soltos de hoje.
- [ ] **Tema escuro** opcional (a pessoa escolhe; o padrão segue o aparelho).
- [ ] Os estilos escritos dentro do HTML (`style="..."`) viram classes — prepara a v10.15 (CSP sem `'unsafe-inline'`).

## v10.4 — Linguagem limpa

- [ ] **Nada de código na tela:** todo estado aparece em português (`EM_PARECER` → "Aguardando o parecer"), sem sublinhado, sem sigla de
      banco, sem número de versão.
- [ ] **O fundamento vai para o "?":** o artigo do Estatuto ou do Regimento sai do meio do texto e fica num botão de ajuda ao lado do campo
      ou do ato (quem quiser saber, abre; quem não quer, lê limpo). A regra continua sendo aplicada igual.
- [ ] Mensagens de erro e de confirmação humanas: dizem o que aconteceu e o que fazer, sem jargão.
- [ ] Glossário único dos termos da Igreja (Extensão, CLI, CME, AFM...) usado pelo "?".
- [ ] Rótulos e ajudas revistos módulo a módulo, com o mesmo tom.

## v10.5 — Estrutura da tela e navegação (o menu da esquerda e o conteúdo da direita)

Pedido do responsável (11/11/2026): hoje a página inteira rola junto — quem desce pelo menu perde o conteúdo e fica um espaço branco; o menu
tem informação demais; não há submenus.

**Escolha dele na primeira rodada de propostas (11/11/2026):**

- **Opção A (cartões à direita, menu da esquerda limpo) no Menu principal e na primeira tela dos módulos principais.** Quem tem acesso a
  tudo vê todos os módulos; o membro vê **primeiro as pendências dele** e menos módulos.
- **Opção B (menu lateral com os submódulos e setinhas) só quando a pessoa clica num submódulo** — é a tela do trabalho detalhado, com a
  escolha do nível **Local / Área / Geral** (ex.: relatórios dos departamentos, escolhendo congregação ou área).
- A Opção C (três colunas) saiu.
- Cores por módulo à vontade, em modo claro e escuro. As telas do módulo e do submódulo ainda vêm em **3 a 5 opções** cada (regras de
  aprovação).

**Rodada 2 (12/11/2026, na página clicável) — o que ele aprovou e o que mandou refazer:**

- **Início de quem vê tudo:** aprovados os **"Cartões coloridos"** (pendências do dia e os módulos em cartões com a cor de cada um). Ficam
  muito bons para o líder local, que vê poucos módulos.
- **Avisos e pendências não podem crescer sem controle.** Um Líder Geral de departamento tem 40 pendências (uma por congregação); o
  Secretário Geral, 40 × 8 = 320. Uma lista assim polui e não ajuda. É preciso uma central de avisos inteligente (o sino do alto), com o
  número agrupado por assunto e o que é de fato dele separado do que só se acompanha. Vem na próxima rodada, com opções.
- **Início do membro:** aprovado a contragosto ("ficou feio"). Falta mostrar o **encaixe**: a mesma pessoa é membro e, no mês seguinte,
  pode virar líder local de um departamento, e aí ganha módulos. O Presidente e o Secretário também têm carteirinha, escalas e contribuições.
  Não pode parecer que a pessoa tem duas abas com a mesma coisa. Refazer mostrando a mesma pessoa em várias situações (membro, líder local,
  Secretário Geral).
- **Primeira tela do módulo:** aprovados os **"Cartões com barra de progresso"** (quantas das congregações já enviaram, por departamento).
- **Dentro do submódulo:** o conteúdo em cartões foi aprovado ("perfeito para relatório"); o **menu da esquerda foi reprovado**. Ele só
  mostra as funções **daquele** departamento (visão geral, relatórios, equipe, escalas, check-in, proteção, as **finanças do
  departamento**...), nunca os outros departamentos, nem para quem tem acesso a vários: cada departamento tem a sua aba.
- **Princípio para todas as telas: escalabilidade dos níveis.** Os relatórios e as listas têm de continuar claros quando a Igreja crescer:
  Local → Área → Região → Quadrante → Distrito → Geral, com muitas áreas e regiões. Seis botões de área não servem quando forem trinta.
  As propostas mostram uma Igreja maior de mentira para provar isso.

- [ ] **Duas colunas independentes:** o menu da esquerda fica parado, com a própria rolagem; o conteúdo da direita rola sozinho. Rolar um
      não mexe no outro, e nunca sobra espaço branco.
- [ ] **Menu por contexto (limpo):**
  - ao entrar, o menu da esquerda tem só o essencial: o **Menu principal** (Início), o **Meu Perfil** e o nome da pessoa; a escolha do que
    fazer fica à **direita**, nos cartões dos módulos;
  - ao entrar num módulo, o menu da esquerda passa a mostrar **os submódulos daquele módulo** (com o caminho de volta ao Menu principal), e
    a direita mostra os mesmos submódulos como botões — clicou, o painel da direita abre aquele submódulo;
  - submódulos que têm partes abrem com **setinha** (abre e fecha), o item atual fica destacado e o sistema lembra o que estava aberto.
- [ ] Menu recolhível (só os ícones) para ganhar espaço; no celular, o menu vira uma gaveta que abre no botão ☰.
- [ ] **Barra do topo** fixa: título da página, o caminho até ela (ex.: Expansão › Missões › Envios), a busca e o usuário.
- [ ] **Busca rápida** (atalho de teclado): digitar "missões" ou o nome de uma pessoa e ir direto.
- [ ] **Início por papel:** a primeira tela mostra o que aquela pessoa faz (Secretaria, Tesouraria, Dirigente, Pastor de Área, membro), com
      as pendências dela — não uma grade de 40 cartões iguais.

## v10.6 — Organização das informações (módulos, submódulos e páginas)

- [ ] **Reorganização dos módulos** a partir do mapa da v10.1: cada coisa no lugar onde a pessoa procura, com módulos, submódulos e páginas
      — no lugar da ordem histórica em que as telas foram feitas.
- [ ] **Meu Perfil** concentra o que é da própria pessoa (dados cadastrais, credencial, contribuições, escalas, habilitação, formação,
      conquistas, segurança, LGPD...), como submódulos — sai do menu principal.
- [ ] **Página da pessoa:** tudo de um membro num lugar só (cadastro, cargos, disciplina, escada ministerial, EBD, cuidado pastoral, missões,
      contribuição conforme a permissão), com atalhos para cada módulo — resolve o "dado desconectado".
- [ ] **Página da congregação:** membros, liderança, tesouraria, EBD, PSC, Extensões, território, patrimônio — idem.
- [ ] Toda menção a uma pessoa ou congregação vira um link para a página dela, em qualquer tela.
- [ ] Telas grandes demais divididas em subpáginas; telas repetidas juntadas.

## v10.7 — Peças padrão, lançamento rápido e celular

- [ ] **Lançamento em lista, como planilha** (pedido do responsável, ex.: os dízimos do culto): uma grade onde cada linha é um lançamento,
      digitando direto na linha, Enter ou Tab passa para a próxima, o nome do dizimista se completa sozinho (e "novo dizimista" sem sair da
      grade), o total aparece embaixo na hora, e a gravação acontece por linha (com o aviso se uma linha tiver problema) — no lugar do
      formulário de um em um.
- [ ] **Data fácil:** digitar `dd/mm/aaaa` com a máscara pronta, ou escolher num calendário que abre ao lado; "hoje" já vem preenchido
      quando faz sentido.
- [ ] **Tabela padrão:** busca, filtro, ordenar por coluna, paginação, cabeçalho fixo ao rolar, número alinhado à direita; no celular, cada
      linha vira um cartão (nunca rolagem para o lado).
- [ ] **Formulário padrão:** rótulo, campo, erro na hora embaixo do campo, ajuda "?"; obrigatório, opcional e calculado com aparência
      diferente.
- [ ] **Três estados em toda lista:** carregando (esqueleto, sem travar a tela), vazio (frase e ação sugerida) e erro (só naquele bloco).
- [ ] Cartão, faixa de indicadores, etiqueta de estado, aviso, confirmação e janela padronizados — uma peça só, reaproveitada.
- [ ] As funções que se repetem no código viram peças do núcleo (o item que a vD.2 deixou para cá).

## v10.8 — Aplicação tela por tela (a varredura)

- [ ] Passar a entrada, o design, a linguagem, a navegação e as peças por **todas** as telas, módulo a módulo, na ordem do ranking da v10.1.
- [ ] Para cada módulo: as telas aprovadas pelo responsável (3 a 5 opções cada, vistas por ele), a prova de tela sem navegador do módulo atualizada e a base do
      teste de tela aprovada — registrado aqui (nada fica "meio migrado" sem registro de onde parou).
- [ ] Ao fim, as metas da tabela do início conferidas de novo pela varredura da v10.1.

## 🔒 Trava de Revisão 10-A — antes de avançar para a v10.9

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3). Audita v10.1 a v10.8 pelas 5 perguntas do checklist: o teste
de tela completo com a base nova, a varredura de texto e de celular sem nenhum achado e a aprovação do responsável módulo a módulo.

## v10.9 — Desempenho e capacidade (100 pessoas sem travar; assembleia de 1.000)

- [ ] **Medir antes:** as consultas mais pesadas (Query Store do banco), o tempo de cada tela e de cada gravação, com o cadastro real.
- [ ] Índices e consultas revistos onde pesa; uma ida ao banco no lugar de várias; leitura em lote.
- [ ] **Cache dosado** no navegador só do que quase não muda (catálogos, menus), com regra clara de quando renovar — nunca de lista que
      muda a cada clique.
- [ ] Módulos carregados **sob demanda** (o item que a vD.2 deixou para cá): quem só vê a própria escala não baixa o Financeiro.
- [ ] **Teste de carga com 100 usuários** lendo e gravando ao mesmo tempo na homologação; nenhuma gravação perdida, nenhuma trava mútua (as
      corridas do `tools/e2e-localdb` já provam a consistência; aqui se prova o tempo).
- [ ] **Modo assembleia (1.000 votando):** o voto em tempo constante (sem refazer a enquete inteira a cada voto), login sem bloquear o
      servidor, limite por matrícula e não por rede (o Wi-Fi da igreja não pode barrar gente), o banco subindo sozinho no dia da
      convocação e voltando depois — e o teste com 1.000 votantes de teste antes de qualquer assembleia real.
- [ ] O nível do banco decidido com o custo na mão (o teto de R$ 650/mês continua).

## v10.10 — Importação periódica do cadastro de membros (o sistema que a Igreja paga)

Até o cadastro próprio substituir o sistema pago (FASE 11), os dados dos membros chegam por planilha.

- [ ] Tela de importação (só o nível geral): a planilha **do jeito que o sistema pago exporta**; o mapa das colunas é configurado uma vez.
- [ ] Antes de gravar, o sistema mostra o que é **novo**, o que **mudou** (campo a campo) e o que **sumiu** da planilha; nada é apagado
      sozinho; o responsável confirma.
- [ ] A ficha inteira (não só matrícula, nome e situação como a importação da v1.8): endereço em linhas e bairro (v9.5), datas, contatos,
      congregação, cargos.
- [ ] Repetível a cada tantos dias, com histórico de cada importação na auditoria.
- [ ] **LGPD:** a planilha vai direto ao sistema (nunca por conversa ou e-mail); para montar a tela basta o cabeçalho com os nomes das
      colunas, sem nenhuma linha de pessoa.

## v10.11 — Indicadores de saúde e comparação entre congregações *(a antiga v12.1 e v12.2)*

- [ ] **Métricas em proporção, não em número solto** — para comparar uma congregação de 80 membros com uma de 900 de forma justa: % em
      classe de EBD ou grupo, % servindo como voluntário, % que contribuiu ao menos uma vez no trimestre, retenção de visitantes.
- [ ] **Indicador que avisa cedo:** crescimento de voluntários costuma vir antes do crescimento da contribuição.
- [ ] Série por trimestre, com tendência (não a foto de um mês); os 5 Sinais Vitais do PSC (v7.1) com lastro no dado real.
- [ ] **Comparação sem disputa:** o Dirigente vê a própria congregação em detalhe e as outras só como faixa (percentil); o Pastor de Área vê
      as dele pelo nome; comparação por porte, não só por território.

## v10.12 — Alerta de evasão e painel do Presidente *(a antiga v12.3 e v12.4)*

- [ ] **Alerta de quem está se afastando** pelo próprio padrão da pessoa (presença, contribuição, departamento, voluntariado), abrindo item
      no Cuidado Pastoral (v7.11, que já detecta afastamento — aqui ganha os outros sinais). Interno, restrito por papel, nunca ranking de
      membro nem uso disciplinar.
- [ ] **Painel do Presidente, da CLI e da Diretoria:** crescimento, saúde financeira, conformidade e o PDQ num lugar só.
- [ ] **Semáforo por congregação:** balancete, voluntários habilitados, AVCB, prestação de contas e relatório de departamento em dia — uma
      linha por congregação, três cores.
- [ ] Exportação para a prestação de contas anual da Assembleia (Estatuto Art. 36 §1º), com as demonstrações da v4.9.

## v10.13 — Impressão e planilhas padronizadas *(a antiga v10.5)*

- [ ] Todo relatório com versão impressa padronizada (cabeçalho da Igreja, quem emitiu, data e hora, protocolo da vB.4).
- [ ] Exportação em planilha padronizada em todos os módulos, respeitando o escopo de quem exporta e registrando a exportação (vB.8).

## 🔒 Trava de Revisão 10-B — antes de avançar para a v10.14

Audita v10.9 a v10.13 pelas 5 perguntas do checklist: o teste de carga com 100 usuários e o de 1.000 votantes registrados aqui, a
importação conferida (contagens antes e depois) e cada número dos indicadores batendo com o módulo de origem.

## v10.14 — O site vira conteúdo; o que é "vivo" vai para o sistema *(a antiga v10.6; só depois do evento que está no ar)*

Decisão do responsável (22/10/2026): as coisas "vivas" do site (Directus) — inscrições em evento, camisetas e o gestor de camisetas,
mural de oração, enquetes, Minha Conta — passam para o sistema, e o site fica sendo páginas de conteúdo. **Nenhum evento em andamento muda
de casa:** a mudança acontece com o site sem evento aberto.

- [ ] Inscrições em evento (lotes, informar pagamento, confirmação, cortesia, credenciamento por sala, crachá e certificado) no sistema,
      ligadas ao evento do Calendário (v7.2) e ao caixa do evento (v7.4).
- [ ] Camisetas (pedidos, lotes, separação, venda de balcão, limite de pedidos) no sistema.
- [ ] Mural de oração, enquetes e Minha Conta no sistema (o membro entra com o acesso que já tem).
- [ ] **Ensaio completo na homologação** e a migração dos dados do Directus com conferência (contagens antes e depois), com o plano de
      volta pronto; as páginas do site passam a ler do sistema.
- [ ] Hospedagem e transporte de eventos (ônibus, alojamento) com vagas e lista de embarque — só para evento fora da cidade.

## v10.15 — Domínio, DNS e segurança da borda *(a antiga v10.7)*

Medido em 22/10/2026: os dois sites já têm o cadeado obrigatório (HSTS com preload), a CSP e a proteção contra moldura. Faltam DNSSEC, CAA e
DMARC. Decisão do responsável (22/10/2026): **nenhum registro de DNS é mexido antes desta versão**; tudo de uma vez aqui.

- [ ] Comparar e decidir: domínio novo para o e-mail da Microsoft 365 **ou** levar `ieadespa.org.br` inteiro para o Azure DNS recriando os
      registros do e-mail (sem trocar o e-mail de ninguém).
- [ ] Inventário de todos os registros de hoje e a troca num horário calmo, com volta rápida se algo falhar; o e-mail automático do sistema
      (`DoNotReply@ieadespa.org.br`) reconfigurado.
- [ ] Azure DNS com DNSSEC e o DS no Registro.br; CAA; DMARC endurecido em todos os domínios; SPF do `ieadespa.org` com o Google.
- [ ] CSP do site sem script escrito dentro da página; CSP do **sistema** sem `style-src 'unsafe-inline'` (os estilos já viraram classes na
      v10.3 e na v10.8), conferida pela prova do navegador (`tools/csp-e2e`) com 0 violação.
- [ ] Confirmação em duas etapas em todas as contas que mandam no domínio (Registro.br, Microsoft 365, Google, Azure).

## v10.16 — Pagamento online pelo Pix (conta da Igreja no banco Cora) *(a antiga v10.8)*

Aprovado pelo Presidente (cerca de R$ 1 a 2 por Pix e R$ 50 por mês), **depois da v10.15** (com dinheiro real e o CPF de quem paga, a
segurança da borda vem antes). A Cora exige o CPF de quem paga e o valor mínimo de R$ 5.

- [ ] Cobrança Pix (QR e "copia e cola") para a inscrição ou o pedido, com baixa automática pelo aviso do banco (conferido) e conciliação
      no financeiro.
- [ ] CPF pedido só na hora do Pix, guardado protegido e apagado depois de pago (respeitando o estorno).
- [ ] Certificado e chave só no fluxo criptografado (SOPS); testes no ambiente de teste da Cora antes do real.
- [ ] Estorno e cancelamento; o "informar pagamento" continua para quem paga em mãos.

## 🔒 Trava de Revisão 10-C — antes de encerrar a FASE 10

Audita v10.14 a v10.16 pelas 5 perguntas do checklist e faz a varredura final da FASE 10 inteira: as metas da tabela do início medidas de
novo, o teste de tela completo, a bateria inteira do banco e o teste de carga.

## Números antigos desta fase (para quem achar uma citação antiga)

Os planos das fases anteriores e alguns comentários do código citam a numeração de antes de 11/11/2026. Equivalência:

| Número antigo | Agora |
| --- | --- |
| v10.1 (fundamentos do design) | v10.3 |
| v10.1.1 (navegação) | v10.5 |
| v10.1.2 (componentes) | v10.7 |
| v10.1.3 (aplicação módulo a módulo) | v10.8 |
| v10.2 (desempenho e cache) | v10.9 — a parte de infraestrutura e as 5 consultas em paralelo do login foram adiantadas em setembro (`HOMOLOGACAO.md`) |
| v10.3 (celular) | v10.7 — o essencial para o membro foi adiantado na vD.6 |
| v10.4 (modularização do front) | entregue na vD.2 (07/10/2026); o que sobrou (sob demanda, peças reaproveitáveis) está na v10.9 e na v10.7 |
| v10.5 (impressão e exportação) | v10.13 |
| v10.6 (site para o sistema) | v10.14 |
| v10.7 (domínio e DNS) | v10.15 |
| v10.8 (Pix Cora) | v10.16 |
| v12.1 e v12.2 (indicadores e comparação) | v10.11 |
| v12.3 e v12.4 (alerta de evasão e painel executivo) | v10.12 |
