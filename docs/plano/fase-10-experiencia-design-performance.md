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
      (transferência, desligamento, falecimento).
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
