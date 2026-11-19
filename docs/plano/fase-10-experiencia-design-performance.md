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
5. **Toda tela vem também no celular** (12/11/2026): a maioria da liderança local e de área só usa o telefone; só da Região para cima e a
   Secretaria costumam ter notebook. Cada opção é mostrada no notebook e no celular, e o que fica feio no celular (tabela larga, escadinha de
   níveis, abas no alto) não passa.
6. **Da rodada 4 em diante, quem aprova é o responsável junto com o Presidente** (12/11/2026): os dois veem as propostas juntos e respondem
   juntos, para que a decisão já saia de quem está acima e não precise ser refeita depois.
7. **A ordem do trabalho** (13/11/2026): primeiro **as telas principais** (as que valem para o sistema inteiro: entrada, início, menu,
   avisos, busca, cores, perfil, peças padrão); fechadas elas, **um módulo por vez**, cada tela do módulo. Misturar dois ou três módulos na
   mesma rodada fica ruim de avaliar.

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
- [x] **Segunda leva da massa — tudo entra** (feita em 12/11/2026, partes 1 a 6, todas na homologação: calendário de 4 anos com 1.297
      eventos, cuidado pastoral, missões, expansão, entidades, ministério, segurança e vistorias, consentimentos dos membros, enquetes,
      campanhas, doações e cessões, comunicação sem nenhum envio, conquistas, menores e check-in infantil, proteção, crises encerradas,
      temas antigos da identidade visual, prebenda com CPF impossível de propósito e 6 meses de extrato bancário; o ciclo da identidade de
      2028 não entra porque o app só o abre no ano anterior). Decisão do responsável, 12/11/2026: "é um banco de homologação, é tudo fictício; enche o
      sistema, muita coisa mesmo, o mais aleatório possível"): calendário e eventos com inscrições, vistorias de segurança, cuidado pastoral,
      termos e consentimentos dos membros fictícios, missões, expansão, entidades vinculadas, consagração, credencial, AFM e seminário,
      discipulado, comunicação, proteção, governança e o que mais houver tela. O que o banco proíbe apagar (vistoria, o ciclo do calendário)
      fica na homologação para sempre, documentado; o `--apagar` continua tirando todo o resto sem falhar no meio.
- [x] **Sempre igual e refazível:** a mesma semente gera a mesma massa; um comando apaga tudo e gera de novo; o deploy da homologação mantém
      a massa (não refaz a cada vez). Rodar de novo só completa o que falta; `--apagar` tira só o que tem a marca de fictício (matrículas
      700000 a 799999, nomes "(Fictícia)"). O deploy do ramo `homolog` roda o gerador depois do semeador pequeno.
- [x] **Entrar como cada papel** (Secretaria, Tesouraria Geral, Dirigente, Tesoureiro local, Pastor de Área, Presidente, membro), com
      logins de teste — para o responsável testar como um usuário de verdade; isso existe **só** na homologação. Presidente 700001,
      Secretário Geral 700002, Tesouraria Geral 700003, Superintendentes 700011–700013, Pastores de Área 700021–700029, Pastor Distrital
      700031, Dirigente da congregação k = 700100 + k e Tesoureiro Local = 700200 + k (k = 1 é a Sede).
**Defeitos do sistema achados pela massa (12/11/2026):**

- [x] **Oferta de Culto do Departamento** não podia ser lançada — o código dela (`OFERTA_CULTO_DEPARTAMENTO`, 25 letras) não cabia no campo
      `LancamentosTesouraria.Tipo` (20). Corrigido pela migração 172 (o campo com 30 letras), aprovada pelo responsável; **em produção desde
      12/11/2026** (prova: e2e-81).
- [x] **Número do recibo de doação** repetido: era a contagem do ano + 1, sem trava; dois registros ao mesmo tempo (ou um buraco na
      sequência) davam o mesmo número e erro 500. Agora nasce numa transação com a faixa do ano travada e é o maior do ano + 1. Aprovado pelo
      responsável e pelo Presidente; **em produção desde 12/11/2026** (prova: e2e-82, com corrida de 6 processos).
- [x] **Apuração das votações vinculantes** (o mais grave): a opção mais votada — fosse o Sim ou o Não — "aprovava". Regra decidida pelo
      responsável e pelo Presidente: a votação tem **tipo** — **proposta** (a Secretaria marca qual opção aprova, qual rejeita e qual é voto em
      branco, que não conta; aprovada quando quem aprova atinge o quórum sobre os válidos) ou **escolha** (nomes ou opções: ganha a mais
      votada, mesmo com 30%; empate fica para a mesa). Migração 173 (prova: e2e-83 e os testes de regras; na homologação, a massa de 5.047
      pessoas). Aprovada pelo responsável em 13/11/2026 pela explicação, sem abrir a homologação; **em produção desde 13/11/2026** (merge
      4fdb47e, casca v59; reverter = `git revert -m 1 4fdb47e`).
- [ ] **Conciliação bancária: nenhum pagamento bate com o extrato** (achado na parte 6 da massa, 12/11/2026). O lado do sistema guarda a
      saída com valor negativo, mas a comparação (`casarLancamentos`, `api/shared/conciliação.js`) usa o valor do banco sem sinal: a
      diferença nunca dá zero e cada pagamento vira duas divergências ("só no sistema" e "só no banco"). Correção: comparar com o sinal (o
      extrato já traz entrada positiva e pagamento negativo), o que também impede uma entrada de "bater" com um pagamento do mesmo valor.
      Mexe na produção: espera o "pode corrigir" do responsável.
- A "matrícula da AFM sem nível" **não é defeito**: a tela da AFM já mostra essas pessoas com o nível "a informar", conta quantas são e tem o
  filtro "Sem nível" para a Secretaria completar (conferido no código em 12/11/2026).
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

## v10.1a a v10.1e — Gestão de membros: o primeiro módulo *(trazida da FASE 11 em 13/11/2026)*

**Decisão do responsável (13/11/2026):** fechadas as telas principais, o trabalho segue **um módulo por vez**, e o primeiro é a **gestão de
membros**. Ela estava na FASE 11, mas mexe nas mesmas telas que a FASE 10 está desenhando (Meu Perfil, cadastrar pessoa, Minha vida na
igreja, a carteirinha): desenhar agora e refazer depois seria trabalho em dobro. E o sistema já guarda quase tudo da pessoa — faltava
praticamente o **CPF** (para a credencial e as formalidades).

**A meta, nas palavras dele:** fazer **o melhor sistema de gestão de membros que existe**, feito para a Assembleia de Deus, com a
**escalabilidade** que o sistema pago não tem — do geral, que vê os membros do campo inteiro e filtra, até a área, que vê só os dela —, e
em que o membro tenha **na mão tudo o que a Igreja precisa, sem papel**.

**O sistema pago (o que ele contou, 13/11/2026):** é uma gestão de igrejas genérica. A Igreja usa de verdade a **membresia** (o cadastro,
a carteirinha e o histórico do membro). Ele tem também patrimônio, visita e ajuda pastoral, pequenos grupos (não serve: a Igreja trabalha
com departamentos, não com células), escalas de voluntários (nunca usado; vão começar já no sistema novo) e um financeiro que é bom para a
congregação sozinha mas se perde no nível do campo. É pago por mês: quanto antes sair, menos mensalidades; ele estima ainda uns 6 meses com
o pago por causa do financeiro, que também está vindo para cá.

- [x] **v10.1a — Pesquisa e levantamento:** as referências (os melhores sistemas de membros, no Brasil e fora, e o que uma Assembleia de
      Deus precisa: cartas de mudança e de recomendação, batismo, consagração, disciplina, desligamento) e o inventário do que o nosso sistema
      já guarda e já faz com a pessoa. Só entra o que a Igreja usa (ex.: **RG não entra**); o que é reaproveitado por vários módulos fica num
      lugar só. **Feita em 13/11/2026:** [docs/pesquisa/gestao-de-membros-2026.md](../pesquisa/gestao-de-membros-2026.md) (as referências, o
      rol de membros da AD, a LGPD do CPF, o inventário e a lista por prioridade para a v10.1b a v10.1e), com as 7 decisões abaixo.
- [ ] **v10.1b — A ficha do membro completa:** o **CPF**, com os cuidados da LGPD (mascarado na tela, inteiro só para quem precisa,
      conferido pelo dígito, um por pessoa, com a trilha de quem viu e de quem mudou), os campos que faltarem e o **histórico do membro na
      Igreja** numa linha do tempo (admissão, batismo, transferências, cargos, disciplina, desligamento, falecimento).
- [ ] **v10.1c — A escala dos níveis:** o geral vê o campo inteiro e filtra; o distrito, o quadrante, a região, a área e a congregação veem
      só os seus — a mesma regra de escopo do resto do sistema, com a busca do alto e os filtros aprovados na rodada 6. *(O filtro no banco
      e a lista em páginas no servidor já estão em produção desde 13/11; falta a tela usar as páginas, que vem com o desenho da v10.1d.)*
- [ ] **v10.1d — As telas do módulo**, com 3 opções cada, no notebook e no celular: a lista (tabela no notebook, cartões no celular), a ficha
      da pessoa, o cadastro em etapas, a edição em duas colunas, **Meu Perfil** (os quatro cartões, ajustados com ele), **Minha vida na
      igreja**, a **carteirinha digital do membro** (com o QR para conferir, como a credencial dos ministros da v8.4) e as movimentações
      (transferência, desligamento, falecimento). **Rodada 8 publicada em 13/11/2026** na página de propostas: 8 telas com 3 opções cada
      (primeira tela do módulo, lista com filtros e nível, ficha, cadastro em 5 etapas, edição, mudança de congregação com as regras da
      decisão 3, juntar fichas e carteirinha com a filiação), notebook e celular, claro e escuro. Meu Perfil espera as observações que
      ele vai mandar; Minha vida na igreja ficou com a opção 2 da rodada 7. **Reprovada por ele no mesmo dia** ("não vi a
      escalabilidade") e **refeita**: cada tela com "Quem está vendo" — secretaria local, da área, a Geral e o membro comum —, com os
      números, a lista (colunas, filtros e grupos por nível) e o "Precisa de você" com "só o que eu preciso resolver"; as rodadas
      passaram a ficar em ordem crescente (a nova embaixo); e toda prévia de celular mostra a barra do próprio telefone (voltar,
      início, janelas), com a tela "A parte de baixo do celular" (3 opções) para ele escolher a regra que vale para o sistema todo.
      Esperando a escolha dele e do Presidente.
- **Rodada 8 respondida (ele, 13/11/2026) — "muita coisa tem que melhorar; achei fraco em várias etapas".** O que ficou e o que
  muda na rodada 9:
  - **Celular (regra do sistema todo):** opção 2 — o menu vira abas no alto, logo abaixo do título; **nada preso embaixo**. As
    telas finais de celular já aprovadas (início, módulo) que usam a barra de baixo terão de ser refeitas assim.
  - **Primeira tela do módulo:** opção 3 (a busca no centro), virando um **Painel executivo**: mais 2 ou 3 gráficos
    quantitativos e qualitativos à direita, que mudam com o nível — ou um submódulo "Painel executivo" como o principal. Gostou
    do "Precisa de você" compacto, com "só o que eu preciso resolver", sem ocupar meia tela.
  - **Lista:** opção 1 (filtros numa linha), com poucos filtros (a busca do alto, Ctrl K, já procura tudo) e a escolha de quantos
    nomes por página (20, 40…), pensando na tela do celular. Pediu explicação da diferença entre a busca da lista e o Ctrl K.
  - **Ficha da pessoa:** opção 3 (a vida na Igreja em destaque), mas **nenhuma convenceu** — quer a **ficha 360**: a foto
    grande; as datas que faltam (conversão — mesmo em outra igreja —, batismo nas águas, batismo no Espírito Santo, consagrações);
    situação, direito a voto na assembleia, disciplinas, cargos e funções; um **submenu da própria ficha** (no alto ou à
    direita) com o menu principal recolhido como no celular; a **linha do tempo obrigatória**, vista por todos — inclusive pelo
    próprio membro, por inteiro.
  - **O membro vê tudo o que é dele:** sem "pedir acesso" aos próprios dados; em "Minha vida na igreja", um submenu com a vida
    inteira dele na Igreja.
  - **Cadastro:** opção 3 (com a prévia da ficha), e mais: o **pré-cadastro** feito por quem está com a pessoa (o professor da
    EBD, o líder do departamento, um link no site "quero me cadastrar") ou pela própria pessoa, que cai numa **fila de
    cadastros**; a secretaria local confere, completa e aceita, e a **matrícula nasce automática** no aceite — com a escala
    (local, área, geral).
  - **Edição:** opção 3 (campo a campo, com quem mudou — auditoria). Há campos que a secretaria não muda (ex.: o nome) e campos
    que o **próprio membro** muda (contato, endereço, o que estiver vazio); no resto, ele **sugere a alteração** e a secretaria
    (local, área ou geral) aplica.
  - **Mudança de congregação:** opção 1, e as 3 telas são as **etapas de um fluxo só** (pedir, aceitar, acompanhar). O nome é
    **transferência**: o membro pede a transferência, não uma "carta de mudança".
  - **Juntar fichas:** opção 3 (só o que é diferente); fica **sempre a matrícula mais antiga**; o número que sobra **vai para o
    próximo cadastro novo** (decisão dele, 13/11: juntando a 15 e a 500, com a 600 já existindo, fica a 15 e a 500 é dada ao
    próximo cadastro, sem buraco na numeração); e **alerta antes da assembleia geral**: não abrir com cadastro repetido ou errado
    pendente.
  - **Carteirinha: reprovada** (marcou a 1 só para seguir). São duas: a **física** (papel e PVC), com um **editor do modelo**
    no módulo e só o que não muda (nome, nascimento, foto, matrícula, pai e mãe) e o QR **sem validade** apontando para uma
    página que confere; e a **digital**, com o que muda (congregação, cargo e função — obreiro, pastor, missionário —, situação).
    O cargo tem de aparecer. **A impressão da física fica bloqueada** enquanto a ficha tiver pendência de cadastro (ficha
    repetida, número a acertar): nunca sai carteirinha física com o número de duas pessoas (decisão dele, 13/11).
- **Rodada 9 respondida (ele, 13–14/11/2026)** — o que ficou e o que vai para a rodada 10:
  - **Menu principal recolhível em todas as telas** (como no celular, abre pelo ☰), para o conteúdo ficar grande.
  - **Painel executivo:** opção 2 (números no alto e 3 gráficos), sem submódulo próprio. Falta: **gráficos personalizáveis** por
    quem vê (ex.: só os batizados no Espírito Santo, para campanha), um gráfico grande e outros menores, e uma **barra de avisos
    só do módulo**, separada do sino geral.
  - **Lista:** opção 1 (confortável, 20 por página) — aprovada.
  - **Ficha 360:** gostou das abas no alto, mas, como a ficha tem muitas partes e vai crescer, **no notebook o submenu fica à
    direita** (cresce para baixo, nunca arrastar para o lado); no celular, as abas no alto.
  - **Minha vida (o membro):** opção 1, com o submenu "Minha ficha" **à direita**, o menu principal recolhido e a **linha do
    tempo primeiro**.
  - **Fila de cadastros:** opção 2 (quadro por etapa), com o pré-cadastro só com o **essencial para não duplicar** (nome, CPF,
    e-mail para criar a senha; telefone talvez); pelo site, a pessoa escolhe também a congregação e o departamento; a secretaria
    local completa, a área e a Geral acompanham; e **aceite automático** quando o mínimo obrigatório estiver completo — só fica
    na fila o que tiver pendência.
  - **Pré-cadastro:** opção 1 (uma tela só), também no notebook, e numa **página do site** cujos cadastros caem na mesma esteira
    do sistema.
  - **Sugestões de alteração:** as três juntas, como um fluxo — o membro vê **o que pode mudar** (opção 3); o que ele pode
    mudar sozinho, muda direto na ficha (opção 2); o resto vira sugestão, e a secretaria confere na **caixa de sugestões**
    (opção 1).
  - **Carteirinha física:** opção 3 (arrastar os campos), com muito mais personalização: **vários modelos** (ex.: congregado,
    membro), frente e verso, tamanho do cartão, logo, cabeçalho, textos, área de assinatura, posição e tamanho do QR e das
    letras, paleta de cores e **arte de fundo em alta resolução** enviada pela secretaria. Editar só no notebook; o celular só vê.
  - **Carteirinha digital:** opção 3 (tela cheia), caprichando no celular — quais informações vão nela e a **página que o QR
    abre**.
- **Rodada 10 respondida (ele, 14/11/2026):**
  - **Aprovadas as versões finais** da ficha 360 (submenu à direita no notebook, abas no celular), de Minha vida (linha do tempo
    primeiro, "Minha ficha" à direita) e do fluxo das sugestões.
  - **Painel executivo:** no notebook, os avisos do módulo numa coluna à direita (opção 2); no celular, numa faixa no alto
    (opção 1); os gráficos com filtros livres e muitas possibilidades de gráfico.
  - **Fila de cadastros:** notebook = quadro por quem completa (opção 1); celular = a esteira com os números (opção 2).
  - **"Quero me cadastrar" no site:** opção 1 (formulário ao lado do convite), no notebook e no celular. **Não pede o
    departamento:** ele sai do nascimento, do sexo e do estado civil (os campos podem mudar depois).
  - **Editor da carteirinha física:** juntar — a tela inicial é a opção 2 (os modelos em cima e as carteirinhas embaixo, sem
    editar ali; o botão "Editar" abre o editor); o editor é a opção 1 (ferramentas dos dois lados) com as camadas da opção 3: à
    esquerda os menus da carteirinha, à direita o submenu de personalização. Tudo em **alta resolução** do começo ao fim (o
    logo e os fundos já entram em alta; nada de reabrir PNG e salvar de novo, que perde qualidade).
  - **Carteirinha digital:** o "selo vivo" (opção 3) é bom para quem confere; a carteirinha em si pode ser a clássica, com um
    desenho melhor. **Regra do QR (ele):** cada pessoa tem **um QR só, que nunca vence nem muda** — o mesmo na física e na digital,
    funcionando 10 anos depois; o que muda é **o que a página mostra** ao ler (membro, em disciplina, não é mais da Igreja). A
    digital mostra mais (função, situação) do que a física (só o que não muda). Ele quer conversar mais sobre a conferência.
- **Rodada 11 respondida (ele, 14/11/2026) — tudo aprovado, sem observação:** tela inicial das carteirinhas = modelos em
  cartões grandes (opção 1); editor = ícones à esquerda, como nos editores de imagem (opção 2); carteirinha digital = o cartão em
  cima e os dados embaixo (opção 2); página do QR = topo colorido e anel vivo na foto (opção 2). **O desenho do módulo de
  membros está fechado** (falta só o Meu Perfil, que espera as observações dele) e ele liberou a construção do que aprovou.
- **A ordem da construção (14/11/2026)** — cada passo vai primeiro para a **homologação** (ramo `homolog`, com a massa de 5.047
  pessoas); ele vê, aprova, e só então entra na produção:
  1. **A ficha por dentro (sem tela nova ainda):** CPF (único, conferido pelo dígito, mascarado, leitura registrada), filiação
     (mãe e pai), escolaridade e a **matrícula gerada pelo sistema** (reaproveitando primeiro os números liberados ao juntar
     fichas) — migração 174. **Feito em 14/11/2026 no ramo `v10-membros`** (commits 4b76f0f e 8d95a49; ainda fora da
     homologação e da produção): `MembroReferencia` ganhou `Cpf` (11 dígitos, índice único que aceita vazio), `NomeMae`,
     `NomePai` e `Escolaridade` (lista fixa); `CpfLeituras` registra quem viu o CPF inteiro de quem; `MatriculasLivres` guarda os
     números que sobram ao juntar fichas. Regras em `api/shared/fichaMembro.js`. Na lista, na busca e na resposta do cadastro o
     CPF sai **só mascarado** (feito no próprio SQL); procurar pelo CPF inteiro acha a pessoa (no escopo); o inteiro só pela
     Secretaria Geral (`GET /api/pessoas/{matrícula}?ver=cpf`, com a leitura registrada) e pela própria pessoa (Meus Dados e o
     dossiê LGPD); trocar ou apagar um CPF já gravado, só a Geral; CPF de outra pessoa é recusado (a matrícula da outra só para a
     Geral); a trilha guarda o CPF mascarado; a saída por carta e a exclusão LGPD apagam CPF, filiação e escolaridade. A
     matrícula é gerada **só com o pedido explícito** (`gerarMatricula: true`): o menor número livre que ninguém usa, senão a
     maior + 1, à prova de corrida. Sem tela nova (vem no passo 7). Prova: jest 6.437/6.437 (20 testes novos); roteiro novo
     e2e-85 51/51 no LocalDB (migração duas vezes, índice único, máscara procurada em toda resposta, busca, quem troca,
     leitura registrada, corrida de 6 cadastros sem repetir matrícula e de 4 com o mesmo CPF, reaproveitamento dos números
     livres, lixo); e 28 roteiros que usam o cadastro de pessoas, Meus Dados, a minimização e a exclusão LGPD, todos verdes.
  2. **A linha do tempo completa:** somar cargos, casamento, apresentação, batismo, transferência, credencial, licença,
     readmissão e falecimento; todos veem (no escopo), o membro vê a sua por inteiro; a disciplina só para quem pode.
     **Feito em 17/11/2026 no ramo `v10-membros`** (commits 45e2ead e f4f7ba6; ainda fora da homologação e da produção):
     - **O que soma:** a regra e a leitura estão em `api/shared/linhaDoTempo.js`, numa ida só ao banco (todos os SELECTs no
       mesmo lote). Entram a ficha (entrada, readmissão, rito, saída, falecimento), o batismo da turma (com o local e os
       oficiantes, sem repetir a data da ficha), os marcos (conversão, batismo no Espírito Santo, ministério anterior, curso de
       discipulado), a consagração, os cargos que não vieram dela, o casamento (aparece também na linha do cônjuge), a
       apresentação dos filhos, as cartas, as vias da credencial e a licença para candidatura.
     - **A vida espiritual fica à vista:** conversão, batismo nas águas (onde, por quem, ou em outra igreja) e batismo no
       Espírito Santo. A procedência também.
     - **A ordem:** do mais recente para o mais antigo; o que não tem data fica no fim.
     - **Duas rotas novas:**
       - `GET /api/pessoas/{matrícula}/linha-do-tempo`, para a secretaria, no escopo; fora dele, a mesma resposta de "não
         encontrada";
       - `GET /api/minha-linha-do-tempo/{matrícula}`, para a própria pessoa, que vê a sua inteira.
       - As duas têm páginas de 50 (no máximo 200). O `/historico` antigo continua igual para a tela de hoje.
     - **Disciplina e abandono:** só quem tem a permissão "disciplina" no escopo **dela** vê o processo, o motivo de uma
       saída ou de um recolhimento de credencial e a "readmissão depois de exclusão" (a exclusão recusada pela CEI não conta).
       Esses dados nem são lidos para quem não pode. A própria pessoa não os vê por esta rota.
     - **Nunca aparece:** CPF, contato nem o código do QR.
     - **Sem tela nova:** as telas vêm no passo 7.
     - **Prova:**
       - jest 6.458 de 6.458, com 19 testes novos;
       - o roteiro novo e2e-86 no LocalDB, 59 de 59: todas as fontes; a escala (geral, área, local dentro e fora); a
         disciplina em outro escopo; a própria pessoa e a de outra; o segredo procurado em toda resposta; a paginação; e a
         rota antiga igual.
     - **Achado para decidir:** a rota antiga `/historico`, a da tela de hoje, mostra o motivo de uma saída disciplinar
       (exclusão, abandono) a quem não tem a permissão "disciplina". A rota nova não mostra; a antiga sai quando as telas
       novas chegarem (passo 7).
  3. **A transferência como fluxo** (pedir, aceitar, acompanhar), com as regras da decisão 3; a congregação da ficha só muda
     por ela. **Feito em 17/11/2026 no ramo `v10-membros`** (`bd2349c`, depois de trazer a `main` em `9135278`; migração
     176), ainda fora da homologação e da produção:
     - **Quem pede:** a secretaria da congregação de origem, a própria pessoa ou a Secretaria Geral. A área **acompanha**
       (vê os pedidos das suas congregações), mas não pede nem decide.
     - **Quando entra na hora:** pedido pela Geral, ou dentro da mesma área. Entre áreas, a secretaria do destino (ou a
       Geral, a qualquer hora) aceita ou recusa, com motivo; a origem recebe o aviso e lê o motivo. Pedido parado há mais de
       7 dias aparece para a Geral numa caixa própria.
     - **A ficha:** só muda se a pessoa ainda estiver na origem; o dízimo ativo vai junto para a tesouraria do destino; quem
       estava numa Extensão da Tenda sai dela. Um pedido em andamento por pessoa. A trilha guarda quem pediu, quem
       decidiu e quando, e a transferência concluída entra na linha do tempo.
     - **O cadastro não troca mais a congregação** de quem já tem uma (nem a Geral: para ela a transferência já é na hora);
       a ficha sem congregação recebe a primeira pelo cadastro.
     - **Rotas:** `/api/transferencias` (as caixas "chegando", "saindo", "concluídos" e "paradas", filtradas no banco;
       acompanhar; pedir; aceitar; recusar; cancelar) e `/api/minha-transferencia/{matrícula}` (a pessoa pede a sua, vê os
       seus pedidos sem os nomes de quem decidiu e cancela o que ela mesma pediu). Sem tela nova (passo 7).
     - **Prova:** jest 6.511 de 6.511 (18 testes novos); o roteiro e2e-89 no LocalDB, 77 de 77 (os casos de cada regra, o
       escopo, a Extensão, o cadastro, a linha do tempo, as corridas com vários processos e o lixo nos campos); a regressão
       dos roteiros que passam pelo cadastro e pela linha do tempo, toda verde.
     - **Decisões tomadas pelo caminho seguro (ele pode mudar):** a área não pede (a decisão 3 diz "a origem ou o próprio
       membro"); congregação sem área conta como "outra área" (o destino aceita); a liderança da pessoa na congregação de
       origem não é encerrada sozinha pela transferência.
  4. **A fila de cadastros e o pré-cadastro** (no sistema e na página do site), com o aceite automático. **Cadastro repetido
     que chega pelo site (decisão dele, 17/11/2026, corrigida no mesmo dia):** o formulário público do site **deixa enviar** (o
     site não confere nada, para não revelar quem já é da Igreja); quando o pedido chega na fila, o sistema identifica a
     repetição (mesmo CPF, ou nome e nascimento parecidos), **não aprova** e manda para **correção junto com o cadastro mais
     antigo** — a Secretaria Geral ou a local ajustam. **Feito em 17/11/2026 no ramo `v10-membros`** (`73a4e9b`; migração
     177), ainda fora da homologação e da produção:
     - **Quem lança:** a secretaria (permissão de pessoas na congregação), o professor ativo da EBD da congregação, a
       liderança da congregação e a própria pessoa pelo site ("Quero me cadastrar"). Só o essencial: nome, CPF, e-mail,
       telefone (opcional), nascimento, sexo e estado civil; pelo site, também a congregação. O departamento não é pedido.
       O consentimento fica registrado (a base legal e a versão do texto); quem lança pelo sistema confirma que a pessoa
       concordou.
     - **A fila:** completo e sem pendência **entra sozinho** — a ficha nova como congregado, com a matrícula gerada (o número
       liberado primeiro, senão a maior + 1). Fica na fila só o que tem pendência: campo faltando, menor de 18 anos (a
       secretaria confirma o consentimento do responsável), nome e nascimento parecidos com outra ficha (a secretaria confere
       que não é a mesma pessoa) ou CPF repetido (vai para **correção** junto com o cadastro mais antigo). A secretaria local
       completa, aceita ou descarta (com motivo); a área acompanha; a Geral acompanha e também resolve. Fora do escopo,
       "não existe".
     - **CPF repetido no cadastro pelo sistema:** a rota de conferência (`/api/cadastro/conferir`, 40 por minuto por pessoa)
       devolve a ficha quando ela é do escopo de quem cadastra; fora dele, só "este CPF já tem cadastro; o caso foi enviado à
       Secretaria Geral", e o caso fica numa lista só da Geral (`/api/cadastro/casos`), que dá por resolvido com uma nota. O
       cadastro de hoje (`GestaoPessoas`) já segue essa regra.
     - **O site nunca revela quem já é da Igreja:** a resposta de um envio válido é sempre a mesma, e também o **tempo** da
       resposta (um mínimo de 1,5 s). Falha fechada sem a chave combinada com o site; limites de 60 por minuto por origem, 3
       por hora por visitante e 200 por hora no total. O professor ou líder que lançou vê só "na fila da secretaria" e os
       campos que faltam, nunca o motivo da repetição.
     - **Rotas:** `/api/pre-cadastros` (lançar; a fila em caixas; os meus; completar, aceitar, descartar),
       `/api/pre-cadastro-site` e `/api/cadastro/{conferir|casos|resolver-caso}`. Sem tela nova (passo 7).
     - **Prova:** jest 6.548 de 6.548 (33 testes novos); o roteiro e2e-90 no LocalDB, 79 de 79 (o líder e o site, o aceite
       automático com a matrícula reaproveitada, a pendência e o completar/aceitar, o CPF repetido dentro e fora do escopo,
       o caso da Geral, a resposta igual do site, os limites, o escopo por nível, as corridas com vários processos, o lixo nos
       campos e a 177 duas vezes); a regressão (e2e-84, 85, 86 e 89), toda verde.
     - **Decisões tomadas pelo caminho seguro (ele pode mudar):** a pessoa nova entra como **congregado**; o **departamento
       não é posto sozinho** (o sistema ainda não tem a regra de faixa de idade; definir com ele); menor de 18 anos sempre
       passa pela secretaria; só a Geral troca a congregação de um pré-cadastro; o e-mail vai para a ficha (a pessoa entra
       depois pelo "Primeiro acesso"). **Riscos que ficam:** como o site aceita sozinho, alguém pode criar ficha com dados
       inventados (o limite de 200 por hora segura o volume; a secretaria vê os aceitos na caixa própria); e quem tem a
       permissão de pessoas fica sabendo, pela conferência, que um CPF já tem cadastro em algum lugar (é a regra pedida; o
       limite por pessoa e o caso aberto para a Geral deixam rastro).
  5. **A edição campo a campo** (com quem mudou, lendo o `AuditLog`), o que o membro muda sozinho e as sugestões. **Feito em
     18/11/2026 no ramo `v10-membros`** (`1faf0ad`; migração 178), ainda fora da homologação e da produção:
     - **A secretaria muda um campo por vez** (`/api/pessoas/{matrícula}/ficha/campo`): cada campo grava sozinho, numa
       transação com a ficha travada, e fica na trilha quem mudou, o quê e quando. O CPF, o e-mail e o telefone vão para a
       trilha **mascarados**. Se a ficha mudou desde que a tela abriu, a gravação é recusada ("mudou enquanto você editava") e
       nada é sobrescrito. Trocar o e-mail avisa o endereço antigo.
     - **As travas por papel:** o **nome**, só a Geral (decisão dele); o **CPF já gravado**, só a Geral (vazio, qualquer
       secretaria preenche; o CPF de outra ficha não grava, pela regra do passo 4); ninguém muda o próprio nascimento, sexo,
       estado civil ou admissão; com **processo de cargo** em andamento, nascimento, admissão e estado civil só a Geral; com
       exclusão julgada, a admissão nova (readmissão) só a Geral. O cargo segue pela consagração, a congregação pela
       transferência e a situação pelo desligamento (a rota diz o caminho certo). A tela recebe, campo por campo, se quem vê
       pode mudar e por quê (`/ficha/campos`), e a tabela "quem muda o quê" de cada papel.
     - **O histórico da ficha** (`/ficha/alteracoes`, em páginas): lido da trilha, do mais novo para o mais antigo, com quem
       mudou. Nunca leva o CPF, o e-mail ou o telefone inteiros, nem das linhas antigas da trilha; o motivo de uma saída
       disciplinar só para quem tem "disciplina".
     - **O membro** (Meus Dados): vê o que é dele e o modo de cada campo; **muda sozinho** o contato, o endereço e o que
       estiver **vazio** (nascimento, sexo, estado civil, escolaridade, CPF, nome da mãe e do pai); o resto ele **sugere**
       (o nome, o que já está preenchido, a admissão, o batismo, o rito e a procedência). Uma sugestão pendente por campo. Ele
       lê a resposta (o motivo da recusa), sem saber quem decidiu. O CPF dele que já está noutra ficha não grava e o caso vai
       à Secretaria Geral (pode ser ficha em dobro).
     - **A caixa de sugestões** (a fila de aprovações de antes, reaproveitada): a **secretaria local** aplica as da sua
       congregação; a **área acompanha** (vê, não aplica nem recusa); a **Geral aplica tudo**. Recusar exige o **motivo**.
       As travas da ficha valem também ao aplicar (ex.: o nome e o CPF gravado só a Geral). Se a ficha mudou depois do
       pedido, a sugestão não é aplicada por cima. O CPF sai mascarado na caixa de quem não é a Geral, e, decidido o pedido,
       não fica inteiro guardado nele. Ninguém decide o próprio pedido. Também há a caixa das já decididas.
     - **Sem tela nova** (passo 7). A tela de hoje continua funcionando, com duas diferenças: recusar na fila agora pede o
       motivo, e o estado civil já preenchido não muda mais direto em Meus Dados (vira sugestão).
     - **Prova:** jest 6.590 de 6.590 (32 testes novos e os da fila reescritos); o roteiro e2e-91 no LocalDB, 93 de 93 e 94 de 94 com o RCSI (a trilha e o
       CPF mascarado, as travas por papel, o membro mudando e sugerindo, a caixa por nível, aplicar e recusar com motivo, o
       histórico, fora do escopo = não existe, a 178 duas vezes, o lixo nos campos e as corridas com vários processos: duas
       mudanças no mesmo campo, sugestão aplicada × membro salvando, aplicar × recusar, dois pedidos do mesmo campo,
       secretaria × membro no mesmo campo vazio), também com o READ_COMMITTED_SNAPSHOT do Azure; a regressão (e2e-78, 79,
       84, 85, 86, 89 e 90), toda verde; revisão adversarial feita (achados corrigidos: a conferência do CPF só depois das
       travas, a mensagem da readmissão sem revelar a exclusão, o CPF minimizado no pedido decidido, o caso da Geral para o
       CPF repetido do membro, o índice da trilha filtrado para não mexer na corrente de hashes).
     - **Decisões tomadas pelo caminho seguro (ele pode mudar):** a **área edita** a ficha como a secretaria local, mas na
       caixa só acompanha; a concessão presa a uma **Extensão** edita quem está nela, mas não aplica sugestão (a mesma regra da
       transferência); o **"vazio, o membro muda sozinho"** vale para os dados pessoais, e os atos da igreja (admissão, forma,
       batismo, rito, procedência) são sempre sugestão; com processo de cargo, até o vazio que conta para a escada vai como
       sugestão; Meus Dados é **tudo ou nada** (um campo recusado não grava os outros). **Riscos que ficam:** o cadastro
       completo antigo (`GestaoPessoas`) ainda grava a ficha inteira de uma vez, então aberto ao mesmo tempo que uma edição
       campo a campo pode desfazê-la — some quando a tela nova (passo 7) trocar o cadastro completo pela edição campo a campo.
  6. **Juntar fichas** (mexe em 241 tabelas), o número liberado indo para o próximo cadastro, o bloqueio da impressão e o
     alerta antes da assembleia.
  7. **As telas novas** do módulo — dentro da casca nova aprovada (menu principal recolhível; no celular, o menu em abas no
     alto e nada preso embaixo) —, o painel executivo com os gráficos personalizáveis e os avisos do módulo. **Na tela de
     cadastro do sistema (decisão dele, 17/11/2026):** enquanto a secretaria digita o nome, o nascimento e o CPF, uma **barra de
     avisos** confere se a pessoa já existe. CPF que já está em outra ficha **não deixa concluir**: "este CPF já está em outra
     matrícula — clique aqui para ir para lá", que leva à ficha **se ela for da mesma congregação ou da mesma área** de quem
     cadastra (no escopo); fora disso, quem cadastra não mexe nem cadastra, e o caso vai para a **Secretaria Geral** conferir e
     corrigir. Nome e nascimento parecidos também avisam, como possível repetição. Precisa de uma **rota de conferência** que
     respeite o escopo e não revele dado de fora (para fora do escopo, só "já existe; enviado para a Secretaria Geral").
     - **Passo 7a, as telas do que já estava pronto (18/11/2026), em três incrementos, no ramo `v10-membros` e na homologação
       (merges `a145d8d` e `8069028`) — NÃO vai à produção sem ele ver e aprovar:**
       - **Incremento 1** (`07a08da` o servidor, `45fe24d` as telas, `aa68ece` um achado da revisão):
         - **o painel executivo** é a entrada do módulo:
           - os números no alto (em comunhão, congregados, sem comunhão, os novos do mês pela forma de entrada); cada um
             abre a lista já filtrada;
           - o **gráfico grande que cada um ajusta**: o que mostrar, agrupar por quê, em quantidade ou porcentagem (a
             escolha fica guardada no aparelho);
           - as entradas e saídas dos últimos 6 meses e "como está o cadastro" (cada barra abre quem falta);
           - os **avisos só de Membros** ("só o que eu preciso resolver" ou tudo): no notebook numa coluna à direita, no
             celular numa faixa no alto;
           - a área e a Geral escolhem uma congregação;
           - tudo é contado no banco, dentro do escopo, numa ida só e sem o nome de ninguém (`GET /api/pessoas?resumo=1`,
             `api/shared/painelMembros.js`);
         - **a lista**: 20 por página pedidas ao servidor e os filtros numa linha (nome, matrícula ou CPF; congregação;
           situação; departamento; o que falta; no rol ou quem saiu). A lista **inteira** do escopo não é mais baixada ao
           entrar em Pessoas;
         - **a ficha 360**:
           - no notebook o menu principal recolhe e o submenu da ficha fica à direita; no celular, as partes em pílulas;
           - o resumo traz a linha do tempo, a vida espiritual e os dados pessoais;
           - o CPF aparece mascarado; o "Mostrar" é só da Secretaria Geral, com a leitura registrada;
           - os dados pessoais mudam **campo a campo**, e cada trava diz o porquê; "quem pode mudar cada dado";
           - as alterações (quem mudou o quê), com nomes no lugar dos códigos;
           - as partes antigas (família, casamentos, foto...) foram trazidas para dentro da ficha;
           - o Ctrl K abre a pessoa direto na ficha.
       - **Incremento 2** (`f94edc0`):
         - **o cadastro em etapas**, com a prévia "como a ficha vai ficar" e a **barra de avisos** que confere nome,
           nascimento e CPF:
           - CPF que já está noutra ficha não deixa concluir;
           - se a outra ficha está no escopo, o aviso leva até ela; fora do escopo, "já tem cadastro; o caso foi para a
             Secretaria Geral";
           - o formulário completo de antes fica embaixo, aberto só quando pedido;
         - **a fila de cadastros**: no notebook, o quadro por quem completa; no celular, os números e as pendências. O
           pedido aberto mostra o que falta e quem completa, completar e aceitar, as confirmações e descartar com o motivo.
           A Geral vê e resolve os casos de CPF repetido fora do escopo;
         - **o pré-cadastro rápido** numa tela só, com "os que eu lancei".
       - **Incremento 3** (`4e5161c`):
         - **as mudanças de congregação**:
           - o pedido sai do botão "Transferência" da ficha;
           - as caixas: chegando, saindo, concluídos e as paradas da Geral;
           - aceitar, ou recusar com o motivo; cancelar;
           - acompanhar passo a passo;
         - **a caixa de sugestões nova**: antes → depois, aplicar ou recusar com o motivo; o que é só da Geral aparece
           travado;
         - **a minha ficha em "Minha vida na igreja"**:
           - a linha do tempo primeiro e "Minha ficha" à direita;
           - o membro muda o que é dele e sugere o resto;
           - "o que eu posso mudar";
           - as minhas transferências e as minhas sugestões, com a resposta.
       - **Prova:**
         - jest: 6.606 de 6.606 antes dos incrementos 2 e 3; depois, os testes da tela (frontCsp e frontEscape) 93 de 93 e
           os do painel 17 de 17;
         - o roteiro novo e2e-92 no LocalDB, 73 de 73 (cada número do painel contra o banco, o escopo, a congregação
           escolhida, os filtros novos, a matrícula exata, o lixo);
         - a regressão dos passos 1 a 5 toda verde: e2e-84 47, e2e-85 51, e2e-86 59, e2e-87 14, e2e-89 77, e2e-90 79 e
           e2e-91 93;
         - 184 telas no Edge sem janela (Secretaria Geral, secretaria local e membro; notebook e celular; claro e escuro):
           nenhum texto ilegível ou fraco, nada estourando de lado, nenhum erro de script nem violação de CSP;
         - as fotos "desenho aprovado × construído" no rascunho da sessão;
         - o teste de telas da homologação acusou, no incremento 1, só as diferenças esperadas (os botões novos, o Pessoas
           abrindo no painel, a ficha 360 no lugar do perfil antigo). A base foi aprovada só no ramo (`a0a9bc4`);
         - revisão adversarial feita, com dois achados corrigidos:
           - o motivo da saída disciplinar saía no cabeçalho para quem tinha "disciplina" em outra congregação;
           - a ficha procurava a pessoa pela busca de texto, que para matrícula curta podia não achá-la; agora é
             `?matricula=N`, exato.
       - **Fica para depois:** o endereço no cadastro em etapas (hoje vai pelo cadastro completo, na ficha); o formulário
         público do site; e trocar de vez o cadastro completo antigo pela edição campo a campo, que tira o risco do passo 5.
     - **Passo 6, o servidor (18/11/2026, ramo `v10-membros`, `6e833fd`):** juntar fichas (`/api/fichas-repetidas`; migração
       179), o alerta da assembleia e da votação geral, a carteirinha física bloqueada com pendência e o número que sobra indo
       para o próximo cadastro. Provas: e2e-93 117/117 (também com o READ_COMMITTED_SNAPSHOT) e a prova de mutação 10/10. Risco
       que só a homologação prova: a junção desliga os gatilhos imutáveis dentro da transação (`DISABLE TRIGGER`), o que pede a
       permissão ALTER do login do sistema no Azure.
     - **Passo 7b — Membros refeito do zero em Svelte + TypeScript (19/11/2026, ramo `v10-membros-svelte` até `a178d9a`; na
       homologação nos merges `84fe461`, `4222547`, `8930ee7` e `acef2cb`) — NÃO vai à produção sem ele ver e aprovar:**
       - **Por quê:** em 18/11 ele reprovou as telas do passo 7a ("quase igual ao que estava antes"): o perfil antigo reembalado,
         emojis, funções antigas no menu, anotação do desenho virando texto. Decisão dele (19/11): as telas de Membros **refeitas
         do zero em TypeScript + Svelte**, como um teste de verdade na homologação; o servidor e o banco ficam como estão; se der
         certo, o resto do sistema segue em Svelte. Ele exige ver que fica **mais leve e mais rápido** que o JavaScript de hoje.
       - **A base (pronta para os próximos módulos):**
         - `front/`: Vite 8.3.5, Svelte 5.57.3, TypeScript 6.0.3, svelte-check 4.7.8 e @sveltejs/vite-plugin-svelte 7.3.1,
           versões fixadas; `npm run check` (svelte-check e tsc) sem erro nem aviso;
         - **a saída do build é versionada** em `app/svelte` (o deploy do Azure não roda o build: um build quebrado nunca derruba
           o deploy da main nem o da homologação). O carimbo `app/svelte/carimbo.json` guarda o resumo do código-fonte e de cada
           arquivo gerado, e o teste `frontSvelteCarimbo.test.js` (que roda no deploy, antes da migração) para tudo se o fonte
           mudou sem build novo, se um arquivo foi mexido à mão ou se aparecer `eval`, `new Function` ou endereço de fora;
         - **sob demanda:** a casca (`modulos/casca.js`, `abrirMembrosSvelte` e `abrirMinhaVidaSvelte`) só baixa
           `app/svelte/membros.js` quando a pessoa entra em Membros ou abre a Minha vida; cada tela é um pedaço baixado na
           primeira vez (a lista e a ficha logo depois do painel); o membro na Minha vida não baixa as telas da secretaria;
         - **a ponte** (`front/src/comum/ponte.ts`): tudo o que as telas usam da casca passa por um objeto só (o fetch
           autenticado, a sessão, os ícones de traço — as MESMAS formas do `iconeSvg()` —, os avisos, o caminho do topo, o menu
           recolhido), conferido quando chega;
         - **as peças comuns** (`front/src/comum`): cabeçalho, cartão, chip, escolha em chips (no lugar do select nativo),
           opções, etapas, pílulas, menu do módulo com o trilho, linha do tempo, campo, aviso, estados (carregando, vazio, erro)
           e "em construção";
         - a CSP continua `'self'` (sem script em linha); o service worker subiu para v65 (as telas Svelte ficam fora da
           instalação e são guardadas quando baixadas).
       - **As telas, igual ao desenho aprovado** (fotos "aprovado × construído" de cada uma, por nível, aparelho e tema):
         o módulo se chama **Membros**, com o menu em 4 grupos (Painéis; Membros; Movimentações; Cuidados com o cadastro) e o
         trilho de ícones; o conteúdo direto no fundo; nenhum emoji; títulos sem a barra azul; o painel executivo; a lista; a
         ficha 360 (o menu "Nesta ficha" com as 9 partes, o conteúdo antigo redistribuído nelas, a edição campo a campo com o
         lápis, o ✓ e o ✕ e "quem mudou o quê"); o cadastro em etapas; a esteira de cadastros; o cadastro rápido; as
         transferências (pedir, a caixa e acompanhar); a caixa de sugestões com a trilha das 4 etapas; as fichas repetidas e
         juntar (só o que é diferente); e a Minha vida (a linha do tempo primeiro, "Minha ficha" à direita com o menu completo).
         No celular, uma fileira só de pílulas (Painel, Pessoas, Fila com o número, Transferências), as telas de dentro com o ←
         e nada preso embaixo.
       - **Servidor (com teste):** a lista ordenada pelo cabeçalho e a Área de cada pessoa (`?ordem=&direcao=`, lista fechada;
         e2e-92 79/79 com a tentativa de injeção); a situação e a congregação na minha linha do tempo.
       - **Saíram da casca:** as telas do passo 7a em JavaScript (`modulos/membros.js`, `membros-cadastro.js`,
         `membros-movimento.js` e o estilo delas). Do menu de Membros saíram as funções antigas (Importar e exportar,
         Credenciais, Discipulado, Cartas, Perda de Membresia); o **Cuidado Pastoral** ganhou o cartão dele.
       - **Em construção (aparece assim na tela, nunca a tela velha):** Desligamentos; Carteirinhas (passo 8); "Serve em algum
         ministério?" no cadastro; o anexo do documento na sugestão do membro; a coluna "a pessoa completa por e-mail" da esteira.
       - **Peso e velocidade, medidos no Edge sem janela** (rede de celular 4G lento: 150 ms e 1,6 Mbit/s; processador 4×
         mais lento; cache vazio; arquivos comprimidos como o Azure manda; mediana de 5 rodadas, a secretaria local):

         | | JavaScript de hoje (homologação) | Svelte |
         | --- | --- | --- |
         | Abrir o sistema | 1.158 KB | 1.119 KB |
         | Entrar em Membros (painel) | 0 KB (já veio ao abrir) | 54 KB |
         | Painel pronto | 1,11 s | 1,11 s |
         | Lista pronta | 0,67 s | 0,39 s |
         | Ficha 360 pronta | 1,27 s | 0,24 s |

         O JavaScript de Membros de hoje (61 KB) é baixado por todo mundo ao abrir o sistema, mesmo por quem nunca entra em
         Membros; em Svelte, só quem entra baixa (54 KB, já com o painel, a lista e a ficha; cada outra tela, de 1 a 6 KB, na primeira vez que abre).
       - **Provas:** jest 6.645/6.645; e2e no LocalDB (base `cenario-179`): 84 47/47, 85 51/51, 86 59/59, 89 77/77, 90 79/79,
         91 93/93, 92 79/79, 93 117/117; as telas no Edge sem janela em todos os níveis, aparelhos e temas sem erro de script,
         sem violação de CSP, sem estouro de lado e sem emoji; revisão com o caçador de falhas silenciosas, a análise dos tipos e
         o `/code-review`, com os achados corrigidos (cada parte com o seu erro e o "Tentar de novo"; nada enviado duas vezes;
         respostas velhas descartadas; a saída da sessão limpa o rascunho com CPF; o pedido da própria pessoa aparece como dela).
       - **Escolhas pelo caminho seguro (ele pode mudar):** no celular as pílulas da rodada 12 no lugar das abas sublinhadas; o
         cadastro rápido com o desenho da rodada 9 e os campos que a regra escrita pede (CPF e e-mail opcionais, que fazem a
         pessoa entrar sozinha; o celular opcional); o departamento sugerido pela idade (até 11 Crianças, 12–17 Adolescentes,
         solteiro até 35 Jovens, o resto Senhoras ou Varões), que a secretaria pode trocar; o menu recolhido (trilho) nas telas
         em que o desenho o mostra (painel, ficha, esteira, sugestões e Minha vida); a página "Transferências" com o nome do menu
         novo; a Minha vida com o desenho no alto e, embaixo, os compromissos e "o que é meu" da casca.
       - **Na homologação de verdade** (a API e o banco `ieadespa-homolog`, a massa fictícia): os deploys com "DEPLOY OK"; a
         Secretaria Geral de teste (900013) e o pastor de área de teste (900007, no celular) entraram em Membros e passaram
         pelo painel, a lista, a ficha, a esteira, as transferências, as sugestões, as repetidas e o cadastro sem erro de script
         nem recusa de CSP (o único 404 é o `favicon.ico` da casca, que já existia). O que se viu lá e foi corrigido: os números
         do painel mostravam 0 enquanto o servidor respondia (agora o esqueleto), a barra azul que a casca põe no primeiro
         título das telas antigas aparecia num subtítulo da ficha, e o nome comprido dos departamentos ("União de Senhoras").
         O teste de telas acusou o esperado (o cartão do módulo virou "Membros", as telas antigas de Pessoas e do 7a saíram,
         1 botão a mais em toda tela, o ← do celular; 0 violação de CSP) e a base foi aprovada **só no `homolog`** (`8eca237`).
         Ainda não provado lá: juntar fichas de verdade (o `DISABLE TRIGGER` pede a permissão ALTER no Azure).
       - **Achado consertado de passagem:** o `style.css` da homologação tinha perdido o começo de um comentário (no merge de
         `59dcdac`), e o navegador jogava fora as variáveis do `:root` da casca.
  8. **As carteirinhas:** o editor da física, a digital e a página do QR (o QR fixo da pessoa, que nunca vence).
  9. **A migração única do sistema pago** (v10.1e).
- **A casca nova na homologação (17/11/2026), em incrementos — ramo `v10-casca`, NÃO vai à produção sem ele ver e aprovar:**
  - **Incremento 1** (commit `eb9b600`, mesclado no `homolog` em `262b59d`): a **entrada como primeira tela** (com sessão aberta
    vai direto ao Início; a Portaria fica no link "Registrar presença numa reunião"; sair volta à entrada; a foto da Igreja entra
    quando eles mandarem), as **cores da Igreja** (marinho e o ouro com texto marinho no botão principal), o **claro/escuro** no
    topo (lembrado no aparelho; sem escolha, segue o aparelho), o **Início** ("Graça e paz", "Para você hoje", "Meu trabalho"
    com os cartões na cor de cada parte), o menu do Início em grupos (Minha vida na igreja, Meu trabalho, Meu Perfil) e, no
    **celular, as abas em pílulas no alto** (o membro sem "Trabalho") e nada preso embaixo. A primeira tela de cada módulo e o
    submódulo não mudaram. Prova: jest 6.426/6.426 e a prova no navegador (entrada, Início, celular, claro e escuro, todos os
    módulos abrindo). Casca do aplicativo v60.
  - **Incremento 2** (commit `31d8c2b`): os **avisos** (o sino e a pílula "Avisos") num painel do lado, com "Só o que eu
    preciso resolver" ligado (os fluxos que estão com a pessoa + os não lidos), o quadro de filtros por assunto recolhido; e a
    **busca do alto** num painel do lado com o campo no alto (Ctrl K abre, Enter abre o primeiro, Esc fecha), presa ao módulo
    em que a pessoa está, com "Procurar em todo o sistema".
  - **Incremento 3** (commit `c6a043e`): **Minha vida na igreja** (os próximos compromissos — as escalas e a agenda oficial —
    e os atalhos do que é da pessoa; no celular, a pílula "Minha vida") e o **Meu Perfil** (os quatro cartões: meus dados,
    segurança, aparelhos de confiança e preferências — aparência, tamanho da letra, avisos no celular).
  - Os três na homologação (`a959e3e`), com o equipamento do teste de telas entrando pela entrada nova (`8feba1a`) e a base
    do teste de telas aprovada **só dentro do ramo** (`84aab1e`): as divergências eram as esperadas da casca nova, sem
    violação de CSP nem erro de script novo. Provas: jest 6.426/6.426, frontCsp/frontEscape 93/93 e as três provas no Edge
    sem janela (entrada e Início; avisos e busca; Meu Perfil e Minha vida), no notebook e no celular, claro e escuro.
  - **Ele não aprovou os três (17/11/2026):** só a moldura e o Início estavam novos; dentro dos módulos, a cara antiga.
  - **Incremento 4** (commit `e1bf760`; a main trazida em `a55535c`; a base do teste de telas só no ramo em `b37088e`;
    na homologação em `bb43c8a` e `6408347`, 18/11/2026): o **visual novo em todas as telas que já existem**, sem mudar o
    conteúdo nem o fluxo — cada tela num cartão, campos e botões no padrão novo (o principal em ouro com texto marinho),
    tabelas com o cabeçalho discreto e os números à direita, abas internas em pílulas, avisos e janelas no padrão novo e o
    **modo escuro em tudo**; dentro de cada módulo, o **menu na cor do módulo** com o cabeçalho (o nome do módulo e o nível
    de quem está vendo) e o "Menu principal" no alto. Casca do aplicativo v61.
    - **Legibilidade medida** no Edge sem janela, como Secretaria Geral, em 560 telas (todos os módulos, abas, subabas e
      pílulas; notebook e celular; claro e escuro): textos ilegíveis **322 → 0**, textos fracos **302 → 0**, nada estourando
      de lado, 0 violação de CSP.
    - **Teste de telas:** as divergências foram só as esperadas da aparência (o "Menu principal" e o cabeçalho do módulo no
      lugar do "Início"/"Painel Principal" dentro dos módulos, os títulos das colunas sem maiúsculas); nenhum erro de script
      nem pedido novo. Revisão independente feita (só `textContent`, nenhuma lógica mudada, nada preso embaixo no celular).
    - Jest 6.448/6.448 com a main trazida. **Esperando ele ver a homologação e aprovar** a casca inteira.
  - **Reprovada por ele em 18/11/2026** ("você não fez nada"): a casca dos incrementos 1 a 4 era a tela antiga repintada, não o desenho
    aprovado — emojis no lugar dos ícones, o menu da esquerda longo, o Início sem as pendências de cada módulo, a página rolando inteira e
    a barra do topo sem o caminho. Os testes mediam erro de script, contraste e CSP, não se a tela era igual à aprovada.
  - **Conformidade com o desenho aprovado** (18/11/2026; ramo `v10-casca` `4c1666c`, casca v63; na homologação em `570ef2e`, junto com
    as telas de Membros). Primeiro a auditoria: cada tela da casca fotografada no Edge sem janela, com dados de mentira, ao lado do
    desenho aprovado (notebook e celular, claro e escuro; a Geral, o líder local e o membro). Depois a correção:
    - **Feito igual ao desenho:**
      - os **ícones de traço** do desenho no lugar dos emojis no menu, nos cartões, na barra do topo e no cabeçalho do módulo (desenhados
        dentro do sistema, sem biblioteca de fora);
      - o **menu principal limpo** (Início, Meu trabalho só para quem tem cargo, Minha vida na igreja, Meu Perfil e a pessoa no pé);
        as telas que ficavam no menu longo abrem pelos cartões de Minha vida, Meu trabalho e Meu Perfil;
      - dentro do módulo, o "‹ Menu principal", o cabeçalho colorido, o menu na cor do módulo e os **grupos que abrem e fecham com a
        setinha** (o sistema lembra o que estava fechado);
      - as **duas colunas independentes**: o menu e o conteúdo rolam cada um sozinho, sem espaço branco;
      - a **barra do topo** de 64 px com o **caminho** (ex.: Financeiro › Lançamentos), a busca, o claro/escuro e o sino, e a faixa na cor
        do módulo logo abaixo;
      - o **menu recolhível** (só os ícones) pelo ☰, lembrado no aparelho;
      - o **Início**: "Para você hoje" (as 3 primeiras tarefas e avisos) e, em "Meu trabalho", cada módulo com **as 2 principais
        pendências** e o número ("4 pendências") ou "Em dia"; quadrados para quem cuida de muitos módulos, retângulos para quem cuida de
        poucos; o membro vê "Minha vida na igreja" no lugar;
      - **Meu Perfil** (os quatro cartões com os dados mascarados, a segurança, os aparelhos com "Sair deste aparelho", as preferências e
        "Sair do sistema"; no celular, os quadrados de 2 em 2) e **Minha vida** (os próximos compromissos e "O que é meu");
      - no **celular**: a barra de 56 px (☰, título, lupa e sino), as pílulas no alto, **nada preso embaixo** (medido em todas as telas) e o
        menu numa gaveta.
    - **De onde vêm as pendências do Início:** dos avisos que o sistema já calcula (a categoria diz o módulo) e das tarefas dos fluxos (a
      permissão da etapa diz o módulo). **Módulos sem nenhuma regra de aviso** mostram só a linha do que há neles, sem número inventado:
      Órgãos Centrais, Órgãos Regionais, Departamentos e Relatórios (não há aviso de relatório atrasado), Assistência Social, Conquistas,
      Saúde Congregacional, Setores Técnicos, Conformidade e Acesso.
    - **Ficou diferente de propósito (dizer a ele):** o número de avisos no sino (o desenho tem um ponto); o "?" da ajuda dentro dos módulos
      (as telas antigas dependem dela); o link "Registrar presença numa reunião" na entrada (a presença ainda não foi para o Calendário); o
      Início da Geral com os 24 módulos de hoje (o desenho tem 12: a reorganização é da v10.6).
    - **Aprovado e ainda não construído:** a entrada pela chave do aparelho e o "confiar neste aparelho" (precisam do servidor, v10.2); a foto
      da Igreja na entrada (eles mandam); os filtros dos avisos por situação e lugar, que crescem com o nível; os filtros da tela na busca; a
      primeira tela de Departamentos (cartões com a barra de quantas congregações enviaram) e o submódulo de cada departamento com as funções
      dele; o formulário e a lista padrão fora de Membros; a escolha da cor de cada parte (as ~30 famílias com reserva); o Financeiro das
      rodadas 13 a 17.
    - **Só a moldura nova, com o conteúdo antigo** (o módulo ainda não teve rodada de desenho): todos os módulos menos Membros.
    - **Provas:** jest do front 96/96; 104 telas da casca no Edge (entrada, Início dos três papéis,
      avisos, busca, módulos, Meu Perfil, Minha vida, Meu trabalho, menu recolhido, gaveta) sem erro de script, sem violação de CSP, sem
      rolagem de lado e sem nada preso embaixo; as telas de Membros na casca nova, 92 telas, 0 ilegível. Os pares aprovado × antes × depois
      ficam no rascunho da sessão (`conformidade/pares` e `conformidade/pares-membros`).
  - **Etapa 2 da casca: as letras e os efeitos** (pedida e aprovada por ele em 18/11/2026; ramo `v10-casca` `d0a6289` e `8c6e647`, casca
    v64; na homologação, esperando ele escolher a fonte):
    - **As letras servidas de dentro do sistema:** os arquivos ficam em `app/fontes` (woff2, com a licença SIL OFL 1.1 de cada família ao
      lado); o Google Fonts saiu do `index.html` e da CSP (`font-src 'self'`), e um teste confere isso. A fonte padrão continua a de hoje
      (Inter) até ele escolher.
    - **As 3 opções** (todas com os números do mesmo tamanho, medido, e os acentos do português):
      - **Atkinson Hyperlegible Next** (do Braille Institute): feita para quem enxerga pouco; o I maiúsculo, o l minúsculo e o 1 têm formas
        diferentes, e o O e o 0 também. Ajuda os irmãos mais velhos e quem lê no celular ao sol.
      - **Source Sans 3** (da Adobe): a clássica de sistema e de tabela; mais estreita, cabe mais coluna sem cortar (bom para o Financeiro);
        sóbria e institucional.
      - **Plus Jakarta Sans:** moderna e acolhedora, de cantos suaves; deixa o sistema com cara de novo sem perder a leitura.
    - **Para ele escolher vendo o sistema de verdade:** na homologação, em Meu Perfil › Preferências (onde ficou o tamanho da letra, o antigo
      Aa+), a linha **"Fonte (teste)"** com as 3 opções e a de hoje; a escolha fica no aparelho. Na produção a linha não aparece.
    - **Os efeitos** (só CSS, custo de nuvem zero; entre 0,12 e 0,24 s; só deslocamento e transparência; nunca "transition: all"):
      - o que se aperta **afunda um pouco** (botões, cartões, pílulas e itens do menu);
      - o **painel do lado** (avisos), a **janela de confirmar** e os **avisos que somem sozinhos** entram suaves; a busca do Ctrl K abre sem
        animação (é usada o dia todo);
      - a **troca de tela desliza** (o conteúdo entra da direita); ao entrar num módulo, o menu ganha a cor do módulo num esmaecer próprio — o
        "momento marcante"; navegador sem suporte troca direto;
      - o cartão do módulo sobe 2 px ao passar o mouse, **só em aparelho com mouse**;
      - com **"movimento reduzido"** ligado no aparelho, nada desliza nem cresce: só um esmaecer curto nos painéis.
    - **Achado e corrigido junto:** com a Inter carregada de verdade, o título "Órgãos Locais (JAI/JEA/JUC/...)" estourava 3 px de lado no
      celular; os títulos das telas antigas agora quebram a palavra comprida.
    - **Provas:** jest do front 97/97 (o teste novo das letras); as telas da casca em cada uma das 4 fontes, notebook e celular, claro e escuro
      (200 telas), sem erro; os efeitos provados no Edge com e sem movimento reduzido (o clique no cartão entra no módulo pela troca de tela,
      o painel desliza só sem o movimento reduzido); a prova de todos os módulos, abas e subabas na homologação mesclada (294 telas, notebook claro e celular escuro): 0 ilegível, 0 estouro, 0 CSP; os erros de script são só os 5 de antes, da API de mentira (Imunidade, Discipulado, Educação continuada, Seminário, Tipos de entidade).
- **Regra para toda tela de módulo daqui em diante (ele, 13/11/2026):** nada é aprovado sem mostrar a escala em pelo menos três
  níveis — local, área e geral (região, quadrante e distrito ainda não existem na prática) — e o membro comum quando fizer sentido;
  e, no celular, nada colado nos botões do telefone.
- [ ] **v10.1e — A migração única do sistema pago** (no lugar da importação periódica da v10.10): a exportação completa, a conferência campo
      a campo, um tempo com os dois rodando juntos e o desligamento da parte de membros do pago, com o responsável conferindo. **LGPD:** a
      planilha vai direto ao sistema, nunca por conversa ou e-mail; para montar a tela basta o cabeçalho com os nomes das colunas.

**As 7 decisões da pesquisa (o responsável, 13/11/2026):**

1. **Quem vê o CPF inteiro:** ninguém em lista, busca, exportação ou PDF — ali ele sai sempre **mascarado** (e nenhum dado sensível sai
   inteiro). Pode-se **procurar** uma pessoa pelo CPF, mas o resultado mostra o CPF mascarado. Inteiro, só em dois lugares: a **Secretaria
   Geral**, ao abrir os dados pessoais da pessoa, e a **própria pessoa**, em Meus Dados. A secretaria local e os demais veem mascarado.
2. **Campos novos:** entram a **filiação** (nome da mãe **e** do pai, que vai também para a credencial física e a digital) e a
   **escolaridade**. **Naturalidade não entra.** A **profissão** só existe para quem está inscrito num dos 20 **Setores Técnicos** e aparece
   só nesse módulo, não nos dados pessoais.
3. **Mudança de congregação:** quem pede é a **origem** (a secretaria da congregação de onde a pessoa sai) ou o próprio membro; o membro não
   precisa aceitar. Pedido pelo **geral**: aceito na hora. **Mesma área**: aceito na hora. **Áreas diferentes**, pedido pela origem local
   ou pelo membro: a **secretaria de destino** (ou o geral) aceita ou recusa.
4. **Livro do rol em PDF: não.** O sistema não gera PDF com dados de membros (papel com dado pessoal vira problema em processo). Só o geral,
   se for estritamente necessário, e com tudo bem mascarado.
5. **Juntar fichas repetidas: sim.** A secretaria escolhe, campo a campo, o que fica. Pode começar já. Na migração, os 2 cadastros que
   existem hoje (as duas pessoas da fase de teste) saem e os membros entram da matrícula 3 em diante — a princípio, não é preocupação.
6. **Carteirinha na carteira do celular (Google/Apple): não** — custo e risco que não compensam.
7. **Mais de um departamento por pessoa: não.** O **departamento** é por **faixa etária** e é ele que conta as pessoas nos relatórios: uma
   pessoa, um departamento. **Secretarias e ministérios ficam separados** dos departamentos: uma mulher de 30 anos é do departamento de
   Senhoras e pode servir no Ministério Infantil (um ministério), sem deixar de contar só uma vez.

**Adiantado em 13/11/2026 (aprovado por ele, em produção — commit 0118594):** a lista de pessoas passou a ser filtrada **no banco** pelo
escopo de quem está logado (o dirigente recebe só a sua congregação; antes o servidor lia o campo inteiro e escondia na memória), com a
lista em páginas pronta no servidor para a tela nova (v10.1d); e o **"Cadastrar Pessoa" que ficava em branco** — o formulário agora aparece
na hora, cada lista carrega por conta própria, e salvar/editar esperam a lista de congregações (antes, editar com as listas chegando podia
gravar a pessoa na congregação errada).

### Membros em Svelte: aprovado no visual por ele (19/11/2026), e o que falta para a produção

**Ele, depois de entrar como Presidente:** "ficou bom, gostei, bem rápido mesmo". A prioridade dele, depois da rodada 19
do Financeiro, é **terminar Membros de fato e levar à produção**. Com Membros e Financeiro no sistema, a Igreja sai do
sistema pago e o dinheiro economizado vai para outros projetos.

O que falta, nesta ordem:

1. **O seletor de congregação aprovado no Financeiro** (rodada 18, opção 3: a área primeiro e depois a congregação, com a
   procura). Hoje Membros ainda mostra a lista inteira de congregações. Ele vira peça comum e entra também em Membros,
   na versão final da rodada 19.
2. **Carteirinhas** (passo 8, desenho aprovado nas rodadas 9 a 11).
3. **Desligamentos.**
4. **As sobras:**
   - "Serve em algum ministério?";
   - o anexo da sugestão;
   - "a pessoa completa por e-mail";
   - o formulário "Quero me cadastrar" do site;
   - as ações das abas antigas do perfil (casamento, vínculo, foto, licença), refeitas dentro da ficha.
5. **O importador do sistema pago** (passo 9).

**Rodada de desenho de Membros, aprovada por ele em 19/11/2026,** para logo depois que ele fechar a rodada 19 do Financeiro
(um módulo por vez no desenho). O objetivo é Membros ter a mesma robustez do Financeiro.

- **A família como unidade.** Hoje os vínculos são de dois em dois.
  - Como ele quer, a partir do que vê no sistema pago: cadastra-se a pessoa e, na família dela, a esposa e os filhos.
  - O endereço vale para a família toda: preenchido num, vai para os outros.
  - Toda a família numa tela só.
- **Listas inteligentes:** um filtro forte e personalizável.
  - Exemplo: "jovens de 18 a 29 anos da área 3, sem batismo no Espírito Santo".
  - Salvar a lista e, com ela, fazer ações em lote: mandar um comunicado, pôr uma etiqueta, exportar só o permitido.
- **A movimentação em assistente: desligamento, falecimento e readmissão.** Hoje se edita a ficha; o assistente pergunta
  passo a passo:
  - o que aconteceu (pediu para sair, faleceu, voltou);
  - a data e o documento ou a ata;
  - o que o sistema faz sozinho: deixar os cargos vagos, recolher a carteirinha, tirar das escalas, parar os
    comunicados e registrar na linha do tempo.
  - É o item "Desligamentos" do menu, que hoje está "em construção".
6. **A ida à produção:**
   - as migrações 174 a 179;
   - a permissão ALTER para juntar fichas;
   - a importação real;
   - a troca do sistema pago.

## Financeiro (módulo 2): o desenho aprovado e o que a Igreja vive hoje

O desenho do Financeiro foi aprovado nas rodadas 13 a 17: a última respondida por ele em 18/11/2026, com a opção final em
todas as telas. A construção vem logo depois de Membros, já em TypeScript + Svelte (decisão dele de 19/11/2026: as telas
são refeitas do zero; o servidor e o banco ficam). Nenhuma tela vai à produção sem ele ver e aprovar na homologação.

### O núcleo: o que a Igreja vive hoje (ele, 19/11/2026)

"Hoje a maior deficiência nossa é a gestão disso": as entradas, os repasses, o rateio, as saídas e o tesouro. O resto do
Financeiro (orçamento, PDQ, patrimônio, imunidade...) vem do Regimento Interno e ainda não existe na prática; está aprovado
como desenhado e nasce na implantação. Por isso a construção começa por este núcleo, nesta ordem:

1. **Entradas: o lançamento de dízimos e ofertas em planilha, como já desenhado.**
   - **Os blocos e as folhas vêm numerados sozinhos e seguem de um mês para o outro.** Exemplo: em novembro a
     congregação usou 10 folhas; em dezembro continua da folha 11 em diante, até acabar o bloco e começar o novo.
   - **O dizimista é procurado no cadastro de membros;** se não for achado, digita-se o nome.
2. **Repasses: como a Igreja recebe o dinheiro das congregações.**
   - **O sistema guarda até onde já recebeu.** Exemplo: recebeu até o dia 10. No dia 11, ao voltar àquela congregação,
     continua dali: o repasse do dia 11 ao dia 20, depois o do dia 21 ao dia 30, que encerra o mês. Também há o repasse
     mensal de uma vez.
   - **Os valores semanais, quinzenais e mensais são calculados sozinhos** e ficam salvos.
3. **Fechamento e a folha impressa.**
   - No fim do mês (dia 30), quem trouxe o dinheiro leva a folha impressa.
   - **A folha tem o lugar da assinatura,** pelo menos a do Tesoureiro Geral, e um **QR que confere a validade** numa
     página do sistema. Assim não ficam relatórios falsos nos murais das igrejas. É a mesma ideia do QR da credencial:
     a página mostra se o documento existe e é aquele.
4. **Rateio para os centros de custo.** Aprovado na rodada 17: "agora sim, do jeito que eu queria".
   - Depois dos repasses vem o rateio. Ele pode ser feito a qualquer dia e juntar repasses de várias congregações (ex.:
     no dia 12, o rateio dos repasses 1, 3 e 4).
   - **Os percentuais certos dos 60% da Geral** (ele, 19/11/2026: os da rodada 17 e da 18 estavam "erradíssimos"):
     - **Presidente: 30%**;
     - **Tesouro Geral: 60%**;
     - **Convenção (o fundo convencional): 10%**;
     - **o dízimo do pastor:** dos 30% do Presidente, 10% vão também para a Convenção. A Convenção recebe os seus 10%
       mais 10% dos 30% do Presidente.
     - **Não existem hoje** reserva, PDQ (plano diretor) nem Missões no rateio. Missões tem caixa próprio, na Secretaria de
       Missões. Se um dia o Regimento criar reserva ou PDQ, eles saem dos 60% do Tesouro Geral.
     - A pergunta antiga "60% + 10% = 70%?" deixou de existir.
     - Os percentuais ficam nos parâmetros, editáveis pela Geral, com estes valores de partida.
   - Os 40% da congregação vão para a aba de repasses ao local.
   - **Pedido dele de 19/11: o rateio mais automático, "um rateio mesmo top".** Quando o repasse é conferido, a divisão
     pelos centros de custo sai sozinha, pelos percentuais dos parâmetros. A contabilidade interna e o fechamento do mês
     ficam como aprovados.
   - **Não existe "desfazer" nem "reabrir" o rateio.** Ele: "nunca reabrimos um rateio em todos esses anos". Um erro de
     cálculo ou de digitação se corrige com um ESTORNO, um lançamento de correção com o motivo, que fica na trilha e é
     feito pela Tesouraria Geral. O botão "Desfazer (só hoje)" da rodada 18 sai na construção.
   - **As entradas mais amigáveis:** é o ponto que ele mais quer melhorar.
5. **Saídas a partir de cada centro de custo.** Exemplo: no dia 15 o Presidente recebe R$ 5.000; lança-se a saída daquele
   centro de custo. Em todo momento se sabe o que cada centro de custo tem.
6. **A página do Tesouro é atualizada pelos rateios gerais.**
7. **A folha do mural** (o comentário dele na rodada 17 vale mais que o acerto anterior):
   - **Cada linha:** o número do bloco, o número da folha (o recibo) e o nome do dizimista, sem valor.
   - **Página em retrato,** cerca de 47 nomes por folha; passou disso, segue numa segunda folha.
   - **O "total arrecadado" é só dos dízimos e ofertas** da aba de lançamentos. As outras entradas ficam no relatório do
     sistema, não no mural.
   - **As ofertas dos cultos de departamentos e secretarias NÃO entram no 60/40** (ele, 19/11). A maioria dos cultos é
     desses. Cada departamento e secretaria tem o seu centro de custo, e Missões tem caixa próprio. No 60/40 entram só
     os dízimos e a oferta do culto da congregação.
   - **As assinaturas da folha do mural** (ele, 19/11), três e obrigatórias:
     - o **Tesoureiro Geral**, que recebe e fecha o relatório;
     - o **tesoureiro local**;
     - o **dirigente da congregação**.
     - O **Presidente não assina**, nem como opção.
   - **Do total saem os compromissos da congregação** (ex.: o aluguel, a parcela de um lote). O que sobra é dividido: 60%
     para a Geral, 40% para o local. Exemplo dele: arrecadou 1.000, o aluguel foi 900, sobraram 100, que viram 60 e 40.
   - **O relatório nunca fica negativo.** Se o aluguel (2.000) passa do arrecadado (1.000), desconta-se só até zerar.
   - **O "retido na congregação"** (corrigido por ele na rodada 18, 19/11/2026). A regra é o dinheiro ir para a Geral e a
     Geral pagar o local. Na prática, o que a pessoa NÃO traz em espécie fica retido na congregação e sai dos 40% do
     local.
     - Exemplo dele: eram R$ 5.000; ela trouxe só os R$ 3.000 da Geral (60%); os R$ 2.000 ficaram lá, e a Geral "nem viu
       a cor".
     - O sistema registra só o que de fato chegou: "tem que ser sincero".
     - A linha "Retido na congregação" mostra esse valor; não é sempre zero.
   - **O repasse, como ele trabalha** (rodada 18):
     - hoje é o envelope (congregação, data e valor), e o dinheiro fica nele até o rateio;
     - no sistema, a congregação faz um **pré-repasse**, sem validade até a Tesouraria Geral conferir com o dinheiro na
       mão; a Geral também pode fazer o pré-repasse;
     - a tela de Repasses abre na **lista das congregações com pré-repasse**;
     - no detalhe:
       - escolhe-se até que **dia e hora** se fecha;
       - escolhe-se **quem trouxe**;
       - confere-se o **banco (Pix)** e a **espécie**;
       - o que não veio fica retido.
   - **O caixa único da Tesouraria Geral** (ideia dele e do Presidente):
     - funciona como o caixa de supermercado: abre e fecha; recebe a espécie e o Pix de todas as congregações; dá o
       **recibo** a quem trouxe;
     - o envelope acaba, e quem separa é o rateio automático.
     - O recibo é a "folha do recebimento", aprovada na opção 3 da rodada 18, somada ao detalhamento da opção 1, numa via só.
   - **A folha do mural, versão final** (rodada 18):
     - a folha 1 cabe 50 nomes, e mais 3 se precisar;
     - cada bloco novo começa numa folha nova;
     - as contas do mês, as 3 assinaturas e o QR ficam juntos e inteiros na última folha (normalmente são 2 folhas; com
       muitos nomes, 3).
   - **Confirmado por ele (19/11/2026): só o que é fixo da congregação sai antes da divisão,** numa linha só chamada
     **"Despesas congregacionais"**, no lugar de várias linhas soltas. Dentro dela vai o que for:
     - o **aluguel**;
     - a **parcela de lote**;
     - a **obra liberada pelo Presidente**. Na congregação em construção, quando a Geral não tem como ajudar, o
       Presidente libera que ela fique com o que arrecada (às vezes 100%) até um valor autorizado. Exemplo dele: rende
       1.000, mas pode ficar com até 2.000 para ajudar a construir.
     - **Quem cadastra (ele, 19/11): a própria congregação,** com autonomia. A Tesouraria Geral aceita ou não e paga quando
       a congregação comunica. O Presidente não precisa saber, a não ser acima de um valor (um parâmetro; "nunca foi
       alcançado"). Exemplo dele: um produto de limpeza de R$ 50 é cadastrado pelo local, aceito pela Tesouraria Geral
       e lançado como despesa. A obra continua sendo liberada só pelo Presidente.
     - Ela entra sozinha no relatório do mês. A soma desconta até zerar, nunca deixando o relatório negativo.
     - **Com repasses por período** (ele, 19/11): a despesa vai consumindo os repasses na ordem até ser coberta. Exemplo:
       uma despesa de R$ 1.000. O 1º repasse, de R$ 500, vai todo para ela: nada para a Geral nem para o local, e não há
       rateio. O 2º, de R$ 600, completa os R$ 500 que faltavam, e os R$ 100 que sobram vão para o rateio normal. Do 3º
       em diante, rateio normal.
     - **De onde vem o dinheiro da obra** (ele, 19/11; entendimento a confirmar na construção):
       - se vem dos dízimos e ofertas da congregação (a obra liberada), fica travado lá: não entra no rateio e não volta;
       - se é uma despesa comum da congregação, sai dos 40% dela;
       - se a Geral paga, é uma despesa da Geral e também não volta.
       - Em nenhum caso a Geral "devolve" a obra à congregação.

**Regras que valem para todo o núcleo:**

- **Três níveis que crescem:** congregação, área e Geral. A Geral vê o todo e escolhe a congregação; a congregação vê só o
  que é dela; a área, as suas. A troca de congregação tem de ser amigável, num painel, nunca um select perdido.
- **A Igreja é uma só, não um conjunto de congregações isoladas.** Era o defeito que ele mais apontou no sistema antigo.
  - **Fornecedores, contas bancárias e centros de custo são da Igreja inteira.** Um fornecedor cadastrado numa congregação
    aparece para as outras.
  - **A conta geral da Igreja pode ser escolhida** como destino de um recurso de qualquer congregação.
  - O escopo limita quem VÊ e quem LANÇA, não o cadastro comum.
- **A Sede Administrativa é diferente da Congregação Sede** (rodada 16), em todos os módulos.
  - A Sede Administrativa é a Secretaria e as contas gerais.
  - A Congregação Sede é uma congregação como as outras, com membros e custos.

### As decisões de desenho das rodadas 13 a 17 (resumo)

- **Regras gerais:**
  - um painel executivo para cada grupo de submódulos;
  - nada de rolagem; listas grandes em páginas;
  - pílulas no celular;
  - o menu "por tipo de trabalho", com um "Resumo" no alto de cada grupo.
- **Lançamento:** planilha + linha. A folha arrancada ou cancelada vai junto, obrigatória, na planilha.
- **Blocos:**
  - a lista com filtros e páginas de 40 (são ~200 blocos por ano);
  - as folhas: o formulário primeiro e os quadradinhos maiores; ninguém digita número de bloco nem de folha;
  - o livro de entrada e saída do bloco: a área é só intermediária, e o lote da gráfica soma as 50 folhas sozinho.
- **Saídas (pagamentos):**
  - os bloquinhos em colunas e o "novo pagamento": única vez, parcelado ou recorrente; boleto, Pix ou dinheiro;
  - o local requer, e a Geral (Presidente + Tesoureiro Geral) aprova e paga;
  - a nota fiscal o local anexa depois.
- **Fornecedores:** o cadastro completo: como se paga, a saída padrão e os genéricos.
- **Tipos de entrada e saída:** o catálogo pronto (~200).
- **Contas a receber:** em colunas; o termo é gerado pelo sistema.
- **Conciliação:** feita pela Geral, em duas telas: o extrato e o resultado; as diferenças em cartões. O que não bate vira
  lançamento ali mesmo.
- **Fechamento:**
  - só o Conselho Fiscal fecha o mês; a Geral pode travar os lançamentos durante a auditoria; a congregação MANDA para
    conferência;
  - os dízimos e ofertas fecham separados;
  - há prazo para as despesas: o que chega atrasado cai no mês seguinte, com advertência.
- **Relatórios:**
  - o relatório do mural, separado do relatório do sistema, que é completo, com gráfico e sem nome de dizimista;
  - gráficos ajustáveis numa tela própria;
  - o consolidado com o mês a mês das áreas;
  - as demonstrações com gráficos pequenos.
- **Tesouro:** "para onde vai cada real", como submódulo de Relatórios.
- **Investimentos:** vale o valor líquido para resgate informado pelo banco; o rendimento só como projeção.
- **Dizimistas:**
  - o valor do dízimo fica mascarado para todos, com "mostrar" registrado;
  - a visão é anual;
  - o dizimista fiel é calculado: pelo menos 10 meses no ano.
- **Repasses:**
  - tabela no notebook e cartões no celular;
  - repasse semanal, quinzenal e mensal; o tesoureiro lança e a Geral confere;
  - os percentuais ficam nos parâmetros;
  - o distrito fica bloqueado.
- **Rateio:** é a contabilidade interna pelos fundos; não fecha o mês.
- **Prebenda:** só o Presidente, em percentual do rateio: **30%**, corrigido por ele em 19/11 (antes estava 35%).
- **Campanhas:** em três etapas, mais a "nova campanha".
- **Orçamento e PDQ:** em cartões, com o PDQ numa aba própria.
- **Plano de contas:** a lista e o item aberto.
- **Parâmetros:** em abas, com tudo do Regimento.
- **Prazos:** o aviso à Geral pelo menos 15 dias antes.
- **Imunidade, patrimônio, frota, imóveis, obras, seguros e parâmetros monetários:** em cartões, sem mudança.
- **Receitas acessórias e cessões:** como aprovado.
- **A pergunta "60% + 10%: cobrar logo 70%?"** deixou de existir (ele, 19/11).
- **Tela nova a desenhar na próxima rodada do Financeiro (ele, 19/11): "O que o contador precisa".** É a entrega do mês ao
  contador, com os lançamentos prontos e no formato da norma das entidades sem fins lucrativos (ITG 2002), sem redigitar.
  - **Sobre o dinheiro em espécie:** ele decidiu que não há regra para diminuir. O dinheiro em papel continua existindo, e
    o sistema só facilita o Pix quando houver.

## v10.2 — A porta de entrada (a página inicial e o login)

**Escolha dele na primeira rodada de propostas (11/11/2026):** no **celular, a Opção A**; no **notebook, a Opção B**, com o **logo da
Igreja** e uma **foto** (a foto, ele manda). A Opção C saiu (simples demais). O desenho final ainda passa pelas regras de aprovação.

**Rodada 2 (12/11/2026, na página clicável):** no notebook, aprovada a **"Foto na tela inteira"** (a foto cobre a tela, escurecida; boas-vindas
à esquerda e o formulário num cartão à direita). No celular, aprovada a **"Campos já abertos"** (botão da digital e, logo abaixo, matrícula e
senha num cartão), **com uma foto por trás**. As fotos têm dois formatos: **deitada no notebook e em pé (retrato) no celular**.

**Rodada 3 (12/11/2026):** no celular, a foto fica **no alto e se desfaz** na cor de fundo, com o degradê **indo até o fim** da tela e a foto
**um pouco desfocada** (fica bonita e, leve, carrega mais rápido que uma foto nítida).

**Rodada 4 (12/11/2026, ele e o Presidente):** aprovada a de **desfoque leve, com a foto mais visível**, com um ajuste: a linha onde o
degradê termina desce até a altura do botão "Entrar". Com isso, a entrada do celular está aprovada.

**Rodada 5 (12/11/2026):** confirmado — o degradê termina **na altura do "Entrar"**. Entrada do celular **aprovada**.

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
- [ ] **Cor própria de cada parte do sistema** (rodada 4, 12/11/2026): cada módulo e cada departamento tem a sua cor, que toma o menu, o
      cabeçalho, os botões e as barras; a paleta tem pelo menos 50 cores em famílias, com tons claros e escuros, e uma cor escolhida fica
      **reservada** (não se repete em outra parte).
- [ ] **Acessibilidade e contraste das cores** (pedido do responsável e do Presidente, 12/11/2026): toda cor da paleta conferida em fundo
      claro e escuro pela régua WCAG AA (texto 4,5:1, peças 3:1); a cor que não passa num dos modos ganha o tom certo para aquele modo.
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

**Rodada 3 (12/11/2026) — escolhas e as misturas que ele pediu:**

- **Início por papel:** aprovado o **menu da esquerda com "Meu trabalho" e "Minha vida na igreja"** (o item "Meu trabalho" aparece quando a
  pessoa recebe um cargo; "Minha vida na igreja" — carteirinha, escalas, contribuições — é de todos, inclusive do Presidente). Os
  cartões dos módulos de quem cuida de muitos (Região para cima, Geral) ficaram pequenos demais: voltam a ser **quadrados maiores, como os
  "cartões coloridos" aprovados, com um resumo do que há em cada módulo**; o líder local e o de área, com poucos módulos, ficam com
  retângulos. As abas no alto do Início saíram (feias no celular); no celular, o menu da esquerda se esconde num botão.
- **Avisos:** aprovado **"só o que subiu até você"** (cada nível cobra o de baixo; o Secretário Geral não é cobrado pelos 320 relatórios,
  só pelo que chega à esfera dele), **junto com o sino** do alto: o sino abre os avisos de qualquer página (sem voltar ao Início), com
  filtros, e vale para todos — o membro recebe ali os avisos dele. Hoje o sino só liga a notificação do navegador; passa a ser a central
  dos avisos.
- **Menu do submódulo:** aprovado o **cabeçalho colorido do departamento** junto com as **funções em grupos**, e os grupos **abrem e
  fecham com a setinha** (lista suspensa: só aparece o que a pessoa abriu, sem poluir). A **cor do departamento toma o painel inteiro** para
  a pessoa saber onde está, com uma **paleta de mais de 20 cores** para escolher a de cada departamento e módulo. Os departamentos vão
  ganhar funções: módulos de hoje podem entrar na aba do departamento (ex.: a Assistência Social).
- **Andar pelos níveis:** aprovado **"quem precisa de atenção primeiro"** (comparar por Área, Região, Quadrante ou Distrito, do pior para o
  melhor), com um **botão de busca (lupa)** e um **botão de filtros** para ir direto ao que se quer. A trilha de níveis e a árvore saíram
  (a escadinha fica feia até no notebook; a tabela vira um horror no celular).
- **Próxima rodada:** as misturas acima, cada uma ainda em 3 a 5 opções, **sempre no notebook e no celular**.

**Rodada 4 (12/11/2026, ele junto com o Presidente) — aprovado, com os ajustes:**

- **Início:** os cartões dos módulos em "Meu trabalho" mostram **as 2 principais pendências** daquele módulo e, quando há mais, só o número
  ("9 pendências"). Os cartões com números grandes só fazem sentido com gráficos: ficam para o **painel executivo** dos indicadores
  (v10.11 e v10.12).
- **Avisos:** aprovado o **painel do lado** (no celular, a tela inteira), só com o que a pessoa precisa resolver e **filtros melhores**. A
  linha "como chegou até você" (congregações, áreas, regiões, você) **sai**.
- **Cor de cada parte do sistema:** aprovado o **menu todo na cor** — e vale para todos os módulos do sistema, não só os departamentos: cada
  parte tem a sua cor e a pessoa sabe onde está. O contraste e a acessibilidade dessas cores ganham um trabalho próprio na v10.3.
- **Paleta:** aprovada **por família**, mas **24 cores é pouco**: pelo menos umas **50**, com **tons mais claros e mais escuros** em cada
  família, e **reserva de cor** — a cor de um departamento ou módulo não se repete em nenhuma outra parte do sistema.
- **Níveis:** aprovados a **lupa e os filtros como botões** (bom e enxuto no celular); a lupa deixa **digitar** o nome da congregação,
  área ou região, e os **filtros aumentam** (são poucos).

**Rodada 5 (12/11/2026, ele e o Presidente):**

- **Avisos:** aprovado o **quadro de filtros aberto** (situação, assunto, onde), com o botão **"só o que eu preciso resolver"**. Os filtros
  **crescem com o nível**: o líder local e o de área veem poucos (só a congregação ou a área deles); da região ao geral, mais.
- **Busca:** **não haverá uma segunda lupa** dentro das telas. A busca é a do alto (a de "Ctrl K", que já existe), melhorada: procura
  tudo (pessoa, congregação, área, região, módulo) e ganha **filtros conforme a tela** em que a pessoa está.
- **Rodada 6 (12/11/2026):** **avisos** com o **quadro de filtros recolhido** ("Filtros ▾" mostrando só os ligados); a **busca do alto**
  abre num **painel do lado**, com **os mesmos filtros dos avisos**; dentro de um módulo, a busca já vem **presa àquele módulo** (ex.: no
  Ministério Infantil, procura os relatórios das congregações A, B ou C) e o **Enter** escolhe o resultado. A **paleta** ficou mal
  apresentada no notebook (duas colunas de 15, nomes cortados): o certo é **uma coluna só, de cima a baixo, com rolagem**, o botão que
  troca claro/escuro, a **sugestão dentro da própria lista** (a família sugerida no lugar dela, marcada) e um filtro **"só as famílias
  disponíveis"**.
- **Rodada 7 (13/11/2026) — as telas principais fechadas:** aprovadas na versão final a **entrada** (notebook e celular), o **início**,
  os **avisos** e a **busca do alto**. A **primeira tela de módulo** e a **tela do submódulo** ficam aprovadas **só para Departamentos e
  Secretarias** (o menu da esquerda na cor vale para todos; o conteúdo da direita de cada módulo é visto módulo a módulo, porque cada um tem
  as suas particularidades — Finanças e Membros podem ser bem diferentes). **Cores:** "só as disponíveis, a sugerida no topo" (a busca
  pelo nome saiu: a lista é curta e a pessoa erraria o nome). **Formulário:** **em etapas** para cadastrar; **em duas colunas** para
  editar. **Lista:** **tabela no notebook**, **cartões no celular**. **Meu Perfil:** os **quatro cartões** (a ajustar com ele: o perfil é
  parte da gestão de membros). **Minha vida na igreja:** **os próximos compromissos** ao lado do que é da pessoa.
- **Cores:** aprovada **uma família por linha**, com **umas 30 famílias**; cada cor tem a sua **versão para o modo escuro** (o roxo não
  pode virar outra cor no escuro); e a **regra de escolha**: usar uma família ainda livre antes de repetir uma família já usada (o segundo
  tom de uma família só quando todas as famílias estiverem em uso).

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
- [ ] **Rodada 5 (12/11/2026, ele e o Presidente):** aprovada a **planilha** para quando há muitos lançamentos e a **linha de lançar**
      (o valor em letra grande, as opções em botões) para os lançamentos pontuais, principalmente no celular — **a pessoa escolhe o
      jeito**. O jeito "por culto, em dois blocos" (dízimos de um lado, ofertas do outro) saiu: é tudo junto.
- [ ] **O número do Termo (o talão de dízimo) ajustável** (rodada 5): o talão da Igreja já passa de 50.000; a numeração do sistema
      tem de poder **começar do número que a congregação já usa** (o próximo Termo nº, ajustável por quem cuida da tesouraria, com a trilha)
      — hoje começa em 1 e não há onde mexer. O número aparece também no celular.
- [ ] **O bloco de dízimo de papel no sistema** (rodada 6, 12/11/2026 — explicado pelo responsável; desenhar com ele e o Presidente, em
      conversa, quando chegar o módulo Finanças). Aprovado o **quadro de configuração da tesouraria**. Como o bloco funciona hoje:
  - o bloco tem 50 folhas, cada uma em **duas vias com o mesmo número**: uma é arrancada e entregue como recibo a quem deu, a outra fica no
    bloco. A congregação recebe o bloco e **registra a numeração inteira dele no sistema**;
  - casos que o sistema precisa tratar: **folha arrancada** (as duas vias somem: marca vermelha, de desconfiança), **folha cancelada** (erro
    de preenchimento: o número é anotado como cancelado), **datas fora de ordem** (a folha 10 é de outubro e a 11 de setembro), e escolher
    **quais folhas** vão para um culto ou dia (ex.: 1 a 10);
  - **o dízimo que entra pelo sistema** (pelo banco ou pelo próprio dizimista) fica como **lançamento pendente de folha**, com alerta: não
    se apaga; o tesoureiro acha depois a folha e anota nela o número desse lançamento;
  - o bloco **sempre existe** (não há "acabou o papel"); e quem dá pode **não ser da Igreja**: o nome se escreve à mão (o nome avulso).
- [ ] **Saldo de abertura** (pedido do responsável, 12/11/2026): para começar a usar o financeiro, lançar o saldo anterior de cada caixa,
      que pode ser **negativo** (hoje há saldo negativo). A conciliação já casa entrada negativa com débito (correção de 12/11/2026); falta
      o lançamento do saldo anterior em si.
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
- [ ] **Autorizadas por ele em 18/11/2026 ("faça essas correções"), primeiro na homologação:** as correções **4** e **6** do
      raio-x de velocidade ([`docs/pesquisa/raio-x-velocidade-2026.md`](../pesquisa/raio-x-velocidade-2026.md)).
  - **4. O aplicativo baixa só o que usa:**
    - medido em 18/11: na entrada vêm 46 arquivos, 3,6 MB (1 MB comprimido), com a biblioteca do Excel (929 KB) e os 23
      módulos;
    - num celular comum simulado: 5,7 s na primeira abertura e 3,2 s nas seguintes;
    - a correção: a planilha só ao importar ou exportar, e cada módulo só quando a pessoa entra nele.
  - **6. Juntar os pedidos de cada tela:** de 7 a 9 para 1 ou 2.
  - Ordem: depois do passo 6 dos membros (juntar fichas) e das sobras do 7a, antes das carteirinhas.

## Varredura de segurança e de defeitos do que já existe (plano de 18/11/2026)

Pedido dele: as revisões novas não valem só para o código que vem; o sistema já feito tem de passar por elas. É um plano para
quando houver espaço na cota ("hoje não vai dar certo"), alternando com a construção.

O tamanho medido em 18/11: cerca de 127 mil linhas de JavaScript (88 mil no servidor, 40 mil nas telas) e 234 rotas.

**As ferramentas:** foram instaladas em 18/11, com o OK dele, para todos os repositórios do notebook.

- `claude-security`: varredura de segurança com cada achado conferido antes de ser relatado.
- O agente `silent-failure-hunter` do `pr-review-toolkit`: os erros engolidos, que viram tela em branco ou travamento sem
  aviso.
- `/code-review`: a lógica.

**Os lotes, do mais perigoso para o menos** (estimativa de horas de agente):

| Lote | O que cobre | Tamanho | Conferir | Corrigir (hipótese) |
| --- | --- | --- | --- | --- |
| 1 | Entrada e acesso: login, PIN, chave do aparelho, sessões, escopo e permissões | ~8 mil | 2 a 3 h | 3 a 6 h |
| 2 | O que funciona sem login: site, QR, inscrições, mural, webhooks | ~5 mil | 2 h | 2 a 4 h |
| 3 | Dinheiro: tesouraria, lançamentos, recibos, campanhas | ~10 mil | 2 a 3 h | 3 a 6 h |
| 4 | Dados pessoais (LGPD): ficha, CPF, menores, saúde, disciplina, cuidado | ~15 mil | 3 a 4 h | 4 a 8 h |
| 5 | O resto do servidor, em 3 partes | ~60 mil | 6 a 9 h | 6 a 10 h |
| 6 | As telas, em 2 partes: falhas silenciosas, travamentos e o código que ninguém usa mais | ~40 mil | 4 a 6 h | 6 a 10 h |

**Como cada lote anda:**

- As três ferramentas passam pelo código.
- Ele recebe só os achados conferidos, em português simples: o que é, o risco e um exemplo.
- Ele diz "pode corrigir", e a correção vai com teste e prova.
- **Gravíssima** (alguém sem login lê dados de membros ou mexe em dinheiro): para tudo, ele é avisado na hora e a
  correção sai no mesmo dia.
- **Grave:** de 1 a 3 h cada.
- **Média e leve:** de 30 min a 1 h cada, num pacote por lote.

**Prazo:** de 2 a 3 semanas alternando com a construção (1 a 2 lotes por dia, presos à cota de 5 horas), ou cerca de 1
semana e meia se fosse a única tarefa. O lote 1 serve de régua: depois dele o prazo é recalculado com o tempo real.

### Como a varredura vai rodar: pedaços de 30 minutos (pedido dele, 19/11/2026)

A ideia dele: em vez de poucos agentes trabalhando horas, vários agentes, cada um com no máximo 30 minutos de trabalho. Se
a cota acabar no meio, perdem-se no máximo 30 minutos, nunca um lote inteiro.

- **Os 6 lotes viram cerca de 26 pedaços de 30 minutos,** cada um com 4 a 6 mil linhas de código:
  - **Lote 1, entrada e acesso:** 2 pedaços. O login e o PIN; a chave do aparelho, as sessões, o escopo e as permissões.
  - **Lote 2, sem login:** 2 pedaços. As rotas públicas do sistema; o site, o QR e as inscrições.
  - **Lote 3, dinheiro:** 3 pedaços. Os lançamentos e as saídas; os repasses, o rateio e a prebenda; os recibos e as
    campanhas.
  - **Lote 4, dados pessoais:** 4 pedaços. A ficha e o CPF; menores e saúde; disciplina e cuidado; as rotinas da LGPD.
  - **Lote 5, o resto do servidor:** cerca de 11 pedaços, um por grupo de módulos.
  - **Lote 6, as telas:** só as que NÃO serão refeitas em Svelte, cerca de 4 pedaços. As telas que vão ser refeitas não se
    revisam: a tela nova já passa pelas três revisões ao ser construída.
- **Cada pedaço, sempre do mesmo jeito:**
  1. Um agente pega UM pedaço, olha a hora no início e para aos 25 minutos.
  2. Ele passa as três lentes:
     - segurança: o `claude-security` no esforço adequado ao tamanho;
     - erros escondidos: o `silent-failure-hunter`;
     - lógica: o `/code-review`.
  3. Antes de terminar, ele grava os achados num arquivo do pedaço e no `memoria-projeto`.
- **A conferência dos achados é outro pedaço de 30 minutos,** feito por outro agente que tenta derrubar cada achado. Só o
  que resiste vai para ele.
- **As correções também são em pedaços,** um achado grave ou um pacote de leves por pedaço, sempre com teste e prova.
- **A agenda:** de 2 a 4 pedaços por dia, um de cada vez ou dois ao mesmo tempo, encaixados entre os trabalhos de
  construção. São cerca de 13 a 18 horas de agente no total, ao longo de 2 a 3 semanas.
- **O que ele recebe:**
  - um resumo por semana, em português simples: o que é, o risco, um exemplo e o "pode corrigir?";
  - uma gravíssima, na hora.
- **Quando começa:** quando ele disser que está viável. Até lá, a prioridade é a rodada 19 do Financeiro e terminar
  Membros para a produção.

## v10.10 — Importação periódica do cadastro de membros (o sistema que a Igreja paga)

**Substituída em 13/11/2026 pela migração única da v10.1e:** com a gestão de membros vindo para a FASE 10, não vale construir uma
importação que se repete a cada tantos dias só para jogá-la fora depois. O que estava escrito abaixo fica de registro.

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
