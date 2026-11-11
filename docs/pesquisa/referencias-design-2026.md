# Pesquisa de referências de design: redesenho da interface do IEADESPA

Data: 11/11/2026. Objetivo: orientar o desenho das telas novas (HTML/CSS/JS puro, sem framework).
Fontes: sistemas de gestão de igreja (Planning Center, Breeze, Tithe.ly, ChurchSuite), painéis de
referência (Stripe, Linear, Vercel, GitHub), sistemas de design (Carbon, Fluent 2, shadcn/ui,
Material 3, GOV.UK, MOJ, Radix, Atlassian), pesquisas de UX (Nielsen Norman Group, Baymard) e guias
de chave de acesso (Passkey Central/FIDO, Google, web.dev, passkeys.dev).

**Limitação:** os sistemas brasileiros (inChurch, InPeace, Prover) só publicam material comercial;
nenhum manual de tela foi achado. Por isso as referências concretas vêm dos estrangeiros e dos
sistemas de design. As páginas de ajuda do ChurchSuite, do Tithe.ly e do Breeze recusaram a leitura
direta (erro 403) e foram lidas pelos resumos da busca.

## Leitura em 1 minuto (as 8 decisões)

1. **Entrada:** o endereço principal abre o login (ou o Início, se a sessão vale). A chave de acesso
   aparece no próprio preenchimento automático do navegador. O código por e-mail só aparece em
   aparelho novo ou na recuperação. "Registrar presença" ganha endereço próprio.
2. **Tela:** grade fixa com barra lateral (256 px) e conteúdo, cada um com a **sua** rolagem. O
   menu muda conforme o contexto (no Início, os módulos; dentro de um módulo, os submódulos dele).
   Os grupos abrem e fecham com setinha. No topo ficam o caminho e a busca `Ctrl+K`.
3. **Início:** "Para fazer hoje" primeiro, depois 3 a 5 cartões de indicador do papel, depois os
   atalhos.
4. **Lançamento:** lote com padrões no cabeçalho e uma tabela de campos operada só pelo teclado.
   O nome se completa sozinho e dá para cadastrar sem sair da tabela. O total e a diferença para o
   caixa contado aparecem na hora, e cada linha é validada sozinha.
5. **Data:** um campo de texto com máscara `dd/mm/aaaa`, botão de calendário, "Hoje" e o dia da
   semana por extenso embaixo.
6. **Tabelas:** barra com busca e filtros em "chips", ordenação no cabeçalho, cabeçalho fixo e linha
   que vira cartão no celular. Os estados vazio, carregando e erro são desenhados (não ficam em
   branco).
7. **Formulários:** uma coluna, seções com título, rótulo curto e ajuda num "?" que abre por toque.
   O artigo do estatuto vai para dentro do "?", nunca para o rótulo.
8. **Celular:** gaveta para o menu completo, barra inferior com 4 ou 5 destinos e alvos de toque de
   44 px ou mais.

---

## 1. Página de entrada e login sem atrito

### (a) Padrão recomendado (parte 1)

- **O endereço raiz abre o login, ou o Início se a sessão é válida.** "Registrar presença" passa a
  ter endereço próprio (ex.: `/presenca`), aberto por QR code na porta da igreja e por um link
  discreto abaixo do botão Entrar. Nunca é a primeira tela.
- **Um campo só, com a chave de acesso pelo preenchimento automático.** O campo "E-mail ou
  matrícula" leva `autocomplete="username webauthn"`. Ao carregar a página, o sistema testa
  `PublicKeyCredential.isConditionalMediationAvailable()` e chama
  `navigator.credentials.get({ mediation: "conditional", ... })`. A chave aparece na lista do
  próprio navegador: um toque e a digital/PIN, e a pessoa entrou. Se o navegador não suporta,
  aparece o botão "Entrar com chave de acesso" como alternativa.
- **Aparelho confiável dispensa o código.** Depois do primeiro login, a pergunta é "Este aparelho é
  só seu?". Com **Sim**, o aparelho fica confiável por, por exemplo, 90 dias, renovados a cada uso,
  com sessão longa e deslizante. Com **Não**, a sessão acaba quando o navegador fecha. A confirmação
  forte fica só para os atos sensíveis (o step-up que já existe).
- **O código por e-mail aparece só em 3 casos:** aparelho novo sem chave, recuperação (perdeu o
  celular) e criação da primeira chave. São 6 dígitos num campo com
  `autocomplete="one-time-code"` e `inputmode="numeric"`, com validade curta e "Reenviar" com
  contagem regressiva.
- **Logo após entrar pelo código, o sistema oferece criar a chave:** uma tela, um botão "Criar chave
  de acesso neste aparelho" e a saída "Agora não". Depois, a confirmação "Chave criada".
- **Uma página "Segurança" na conta** lista as chaves com o nome do provedor (Gerenciador de Senhas
  do Google, iCloud, Windows Hello) e o último uso. Lista também os aparelhos confiáveis, cada um com
  "Remover", e tem o botão "Sair de todos os aparelhos".

### (b) Quem faz assim (parte 1)

- **Passkey Central (FIDO Alliance):** nos testes, o preenchimento automático deu a maior taxa de
  sucesso. O botão dedicado costuma passar despercebido e fica como plano B, junto com o código
  por e-mail. <https://www.passkeycentral.org/design-guidelines/required-patterns/sign-in-with-a-passkey>
  (diretrizes gerais: <https://fidoalliance.org/ux-guidelines-for-passkey-creation-and-sign-ins/>)
- **Google (jornadas da passkey):** convida a criar a chave depois do login, depois da recuperação e
  depois de uma reautenticação. Limita as opções de entrada às mais usadas e sempre mantém uma
  alternativa (código). <https://developers.google.com/identity/passkeys/ux/user-journeys>, e sobre a
  forma de falar com o usuário:
  <https://developers.google.com/identity/passkeys/ux/communicating-passkeys>
- **GitHub:** pede o código por e-mail só quando o aparelho não é reconhecido, e não pede quando a
  pessoa entra com passkey.
  <https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/verifying-new-devices-when-signing-in>
- **Microsoft Entra:** a pergunta "Continuar conectado?" vem depois do login e grava um cookie
  persistente. <https://learn.microsoft.com/en-us/entra/fundamentals/how-to-manage-stay-signed-in-prompt>
  A parte técnica do campo com `webauthn` está em <https://passkeys.dev/docs/use-cases/bootstrapping/>
  e em <https://web.dev/articles/passkey-form-autofill>. A lista de verificação de implantação está
  em <https://web.dev/articles/passkey-checklist>.

### (c) Armadilhas (parte 1)

- **Pedir código a cada login:** cansa e ensina a pessoa a digitar código em qualquer tela, o que
  facilita o golpe (phishing).
- **Mostrar o erro técnico do navegador** (`NotAllowedError`). O certo é traduzir: "Você cancelou ou
  o tempo acabou. Tente de novo ou receba um código por e-mail."
- **Não rearmar o pedido automático** depois que a pessoa cancela ou usa o botão: a sugestão some da
  lista do navegador.
- **Confiar no aparelho para sempre e sem lista para revogar.** O mesmo vale para "lembrar" o
  computador compartilhado da secretaria sem perguntar.
- **Navegador que apaga os cookies todo dia nunca vira aparelho confiável** (o GitHub avisa isso).
  Explicar isso na ajuda.
- **Vários métodos de entrada com o mesmo peso visual.** O Google recomenda poucas opções. Também
  convém usar sempre o mesmo termo ("chave de acesso") e ligá-lo a algo conhecido ("a mesma digital
  ou PIN que desbloqueia o celular").

---

## 2. Estrutura da tela (barra lateral, menu por contexto, topo, busca)

### (a) Padrão recomendado (parte 2)

- **Casca em grade com rolagens independentes.** No `body`: `display:grid;
  grid-template-columns: 256px 1fr; grid-template-rows: 56px 1fr; height:100dvh; overflow:hidden`.
  A lateral e a área de conteúdo levam **cada uma** `overflow-y:auto; overscroll-behavior:contain`.
  O topo da lateral (marca + nome do módulo) e o rodapé (pessoa, Sair) ficam fixos, e só a lista de
  itens rola. Isso acaba com o espaço branco atual.
- **Menu por contexto com no máximo 2 níveis.** No Início aparecem "Início", "Minhas tarefas" e os
  módulos (Secretaria, Tesouraria, EBD, Escalas, Eventos, Governança...), umas 8 a 10 linhas. Dentro
  de um módulo, a lateral troca para "‹ Todos os módulos", o nome do módulo (com a cor da área) e os
  submódulos agrupados.
- **Grupos com setinha.** O cabeçalho do grupo **não é link**: é um `<button aria-expanded>` (ou
  `<details><summary>`) com uma seta que gira 90°. O grupo da página atual abre sozinho, e o estado
  aberto/fechado fica guardado no navegador (localStorage). O item ativo leva
  `aria-current="page"`, fundo suave e uma barra de 3 a 4 px à esquerda (dourado sobre marinho). Cada
  item tem 36 a 40 px de altura, rótulo alinhado à esquerda começando pela palavra-chave e ícone
  opcional. Nenhum item fica só com ícone.
- **Barra do topo de 56 px** com, nesta ordem: botão de menu (só no celular ou com zoom), o caminho,
  o campo "Buscar…  Ctrl K", os avisos e a foto da pessoa. O caminho mostra a hierarquia, não o
  histórico: "Início › Tesouraria › Lançamentos › Lote de 08/11/2026". O último trecho não é link, e
  no celular só aparece "‹ Lançamentos".
- **Paleta de comandos (`Ctrl+K` e também `/`).** É um `<dialog>` centrado de uns 640 px, com o campo
  no alto e os resultados agrupados (Pessoas, Páginas, Ações). As setas ↑↓ andam, Enter abre e Esc
  fecha. Vazia, mostra "Recentes" e as ações comuns. Sem resultado, mostra "Nenhum resultado para
  'x'" com uma sugestão. Só lista o que o papel da pessoa pode abrir, e mostra a tecla de atalho ao
  lado de cada ação. `?` abre a lista de atalhos, como no Stripe.
- **Recolher a lateral com `Ctrl+B`** é opcional, útil nas telas largas (o lançamento em grade).

### (b) Quem faz assim (parte 2)

- **NN/g, navegação vertical:** a lateral pode ter muitos itens, mas cada um precisa de rótulo
  ("left-aligned, keyword-frontloaded labels (not just icons)"). Os menos usados vão para o fim, e
  nada de esconder o menu no desktop. <https://www.nngroup.com/articles/vertical-nav/>
- **Carbon (IBM), painel esquerdo:** 256 px, links de 32 px, borda de 4 px no item selecionado,
  `<nav aria-label>` e `aria-current="page"`. Em tela pequena ou zoom de ~175%, o painel vai para
  trás do botão de menu. <https://carbondesignsystem.com/components/UI-shell-left-panel/usage/>
- **Fluent 2 (Microsoft), Nav:** no máximo 2 níveis. As categorias funcionam como sanfona e não são
  links, e as mais importantes vêm primeiro.
  <https://fluent2.microsoft.design/components/web/react/core/nav/usage>
- **shadcn/ui, Sidebar:** cabeçalho e rodapé fixos, só o conteúdo rola. Grupos recolhíveis,
  submenus, `Ctrl+B`, 16rem de largura, e no celular vira gaveta.
  <https://ui.shadcn.com/docs/components/sidebar> Paleta de comandos com grupos e estado vazio:
  <https://ui.shadcn.com/docs/components/command>
- **Linear e GitHub.** O Linear deixa reordenar ou ocultar itens e lembra quais seções foram
  recolhidas: <https://linear.app/changelog/2024-12-18-personalized-sidebar>. O GitHub tem caminho e
  paleta em `Ctrl+K`:
  <https://github.blog/changelog/2023-10-17-redesigned-navigation-now-available-to-all-users/>.
  O caminho segue as 11 regras da NN/g: <https://www.nngroup.com/articles/breadcrumbs/>

### (c) Armadilhas (parte 2)

- **Lateral dentro do fluxo da página**, rolando junto com o conteúdo. É o defeito atual.
- **26 itens soltos sem grupo**, ou o contrário: 3 níveis de grupos.
- **Cabeçalho de grupo que também é link:** o clique abre uma página em vez de expandir o grupo.
- **Menu só de ícones para usuário leigo.** Também é erro repetir o mesmo menu no topo e na lateral.
- **`Ctrl+K` é atalho do próprio navegador.** O sistema precisa chamar `preventDefault()` e oferecer
  `/` também. Os atalhos de uma letra ficam desligados enquanto o foco está num campo de texto.
- **Caminho que imita o botão Voltar** (histórico) em vez de mostrar a hierarquia.

---

## 3. Início / painel por papel

### (a) Padrão recomendado (parte 3)

- **Ordem fixa, de cima para baixo:** primeiro **"Para fazer hoje"**, pendências com verbo e botão
  ("3 lotes de domingo sem conferir → Conferir"). Depois **3 a 5 cartões de indicador**, os
  **atalhos** das 3 ou 4 ações mais usadas do papel e, por último, os avisos.
- **Um modelo pronto por papel:** Tesouraria, Secretaria, Superintendente da EBD, Dirigente de
  congregação, Presidência e Membro. A pessoa pode esconder ou reordenar os cartões, mas o modelo
  padrão já serve sem mexer em nada.
- **Anatomia do cartão:** rótulo curto (14 px) e número grande (28 a 32 px, algarismos de largura
  igual). Uma linha de contexto ("de 40 congregações", "+8% sobre outubro") e o período escrito
  ("novembro/2026"). **O cartão inteiro leva à lista filtrada** que gerou o número. Cartão com
  pendência ganha um marcador visível.
- **Grade responsiva:** `grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap:16px`. O
  mais importante fica primeiro, porque a atenção cai da esquerda para a direita. No celular, uma
  coluna, com as pendências no topo.
- **Cada cartão carrega sozinho**, com o esqueleto do próprio cartão. Um cartão com erro mostra
  "Não carregou. Tentar de novo" e não derruba os outros.
- **Sem pendências, o painel diz "Tudo em dia"**, um estado vazio positivo em vez de uma caixa em
  branco.

### (b) Quem faz assim (parte 3)

- **Planning Center Home:** separa widgets informativos de widgets "a fazer", marcados com uma
  setinha que quer dizer "tem algo para você". Começou com 20 widgets configuráveis.
  <https://www.planningcenter.com/blog/introducing-planning-center-home>
- **ChurchSuite:** o painel é a primeira tela depois do login. Cada pessoa adiciona e ordena widgets
  ligados ao seu papel, e só aparecem os dos módulos e permissões que ela tem.
  <https://support.churchsuite.com/article/54-the-churchsuite-dashboard> e
  <https://churchsuite.com/blog/2021-06-09-introducing-dashboard-widgets>
- **Stripe Dashboard:** o Início reúne análises e avisos importantes (disputas, verificações), com
  "Adicionar/Editar" widgets. A seção "Atalhos" junta páginas fixadas e recentes.
  <https://docs.stripe.com/dashboard/basics>

### (c) Armadilhas (parte 3)

- **Painel igual para todos**, ou número sem período e sem comparação.
- **Gráfico decorativo que não leva a nenhuma ação.**
- **Mais de 5 cartões** na primeira dobra.
- **Cartão com indicador que o papel não pode abrir** (o link leva a "sem permissão").
- **Cartão que soma dados da igreja inteira** quando o escopo do papel é uma congregação ou um
  distrito. Isso precisa respeitar o escopo hierárquico que já existe.

---

## 4. Lançamento em lista tipo planilha (dízimos e ofertas)

### (a) Padrão recomendado (parte 4)

- **Lote com padrões no cabeçalho.** Acima da tabela ficam a data do culto, a congregação, o tipo
  padrão (Dízimo/Oferta), a forma padrão (Dinheiro/Pix) e o **total contado** (o que o caixa físico
  deu). Cada linha nova herda os padrões, e só se digita o que muda.
- **A tabela é um `<table>` com um `<input>` por célula**, na ordem natural do Tab. Colunas: nº |
  Membro | Tipo | Forma | Valor | Observação | situação. As teclas:

  | Tecla | O que faz |
  | --- | --- |
  | Tab / Shift+Tab | próxima / célula anterior |
  | Enter na última célula | cria a linha seguinte e põe o foco em Membro |
  | ↑ / ↓ | mesma coluna, na linha de cima ou de baixo |
  | Esc | desfaz o que foi digitado na célula |
  | Ctrl+Delete | apaga a linha, com "Desfazer" por 5 s |
  | Ctrl+S | salva o rascunho |

  A legenda das teclas fica no rodapé da tabela.
- **O nome se completa sozinho.** A partir de 2 letras, ou do número de matrícula, a lista mostra
  nome + congregação + matrícula, para distinguir homônimos. ↑↓ e Enter escolhem. A última opção é
  sempre **"+ Cadastrar 'Fulano de Tal'"**: abre um painel lateral pequeno (nome, congregação,
  telefone opcional), salva e devolve o foco ao Valor da mesma linha, sem sair da tabela. Há também
  uma linha de "Oferta avulsa / anônimo", sem membro.
- **Valor:** `inputmode="decimal"`. Aceita "50", "50,5" e "1.234,56"; ao sair do campo vira
  "R$ 1.234,56", alinhado à direita, com algarismos de largura igual.
- **Total na hora.** Um rodapé fixo mostra o número de linhas, a soma por tipo, o total geral e a
  **diferença para o total contado** ("Confere" em verde, "Faltam R$ 20,00" em vermelho). O lote só
  se fecha com diferença zero ou com uma justificativa.
- **Validação por linha, sem travar a digitação.** A linha com problema ganha um ícone na primeira
  coluna, a célula ganha borda vermelha, e a mensagem aparece quando a célula recebe foco. Acima do
  botão "Fechar lote" fica o resumo "2 linhas com problema — ir para a primeira". O rascunho se salva
  sozinho: o lote fica "em andamento" até ser fechado, e depois de fechado só se corrige por edição
  auditada. Colar linhas copiadas do Excel ou Sheets é um extra útil.

### (b) Quem faz assim (parte 4)

- **Planning Center Giving:** lotes com padrões (fundo, data, forma de pagamento). Busca o doador por
  nome, e-mail ou telefone, cria a pessoa na hora quando não acha, e o lote só vale depois de
  "Commit". <https://help.planningcenter.com/en/138386-batches.html> Atalhos que aparecem ao segurar
  Ctrl (próxima doação, dividir entre fundos, pular para um campo):
  <https://help.planningcenter.com/en/144361-use-keyboard-shortcuts-in-giving.html>
- **Breeze, Add Contributions:** se o nome não existe, a lista oferece "+ Person Not Found - Click to
  Add" e cadastra no próprio fluxo. <https://support.breezechms.com/hc/en-us/articles/1500004698582>
- **Tithe.ly, Admin Batch Giving:** o formulário de lote inteiro funciona pelo Tab, sem mouse.
  <https://support.tithe.ly/hc/en-us/articles/31350269148695>
- **Convenções de teclado de planilha:** a W3C (APG Grid) define Enter/F2 para editar e Esc para
  desfazer: <https://www.w3.org/WAI/ARIA/apg/patterns/grid/>. O AG Grid documenta Tab salvando e
  avançando, e Enter descendo depois de editar:
  <https://www.ag-grid.com/javascript-data-grid/cell-editing-start-stop/>.

### (c) Armadilhas (parte 4)

- **Formulário comprido para cada lançamento** (o atual), ou um modal por linha.
- **Autocompletar que exige mouse**, ou que troca a escolha sozinho quando o campo perde o foco.
- **Enter que envia o formulário inteiro.**
- **`type="number"` para dinheiro:** rejeita a vírgula, e a rodinha do mouse muda o valor sem a
  pessoa ver.
- **Total que só aparece depois de salvar.** Também é erro perder linhas quando a internet cai; a
  saída é o rascunho salvo linha a linha.
- **Montar `role="grid"` com navegação por setas sem seguir todo o padrão da W3C.** Uma tabela com
  campos nativos é mais simples e mais acessível.
- **Tabela de lançamento no celular.** No celular, a saída é um "lançamento rápido", um por vez num
  cartão, mantendo o mesmo total ao vivo.

---

## 5. Campo de data fácil

### (a) Padrão recomendado (parte 5)

- **Um campo de texto com máscara `dd/mm/aaaa`** (`inputmode="numeric"`, `maxlength="10"`). As
  barras entram sozinhas, e o Backspace apaga a barra junto com o número, sem travar. O campo aceita
  colar ou digitar "08/11/2026", "8/11/26", "08-11-2026" e "08112026": os separadores variam e o zero
  à esquerda é opcional.
- **Botão de calendário** (ícone de 40×40 px) colado ao campo. O calendário abre no mês da data
  digitada (ou no de hoje), com o dia de hoje marcado e escrito "Hoje". As setas mudam o dia,
  PageUp/PageDown mudam o mês, Enter escolhe e Esc fecha devolvendo o foco ao campo. As datas
  impossíveis ficam esmaecidas e riscadas.
- **Atalhos:** um botão "Hoje" ao lado do campo e, nas telas de culto, também "Último domingo".
  Digitar "h" preenche com hoje.
- **Confirmação por extenso logo abaixo:** "domingo, 8 de novembro de 2026". O dia da semana importa
  para culto e EBD.
- **Dica com exemplo acima do campo:** "Ex.: 27/03/2026". Um dia acima de 12 e um mês abaixo de 10
  deixam claro qual parte é o dia e qual é o mês.
- **Nascimento e outras datas antigas** usam o mesmo campo, mas **sem** calendário, com limite
  plausível (de 1900 até hoje). O erro diz o que corrigir ("O mês vai de 01 a 12") e marca só a parte
  errada.

### (b) Quem faz assim (parte 5)

- **GOV.UK (governo britânico):** usa calendário só para datas próximas, sempre com opção de digitar.
  O exemplo da dica deixa clara a ordem (dia ≥ 13). <https://design-system.service.gov.uk/patterns/dates/>
  O componente de data diz: "Never automatically tab users between the fields of the date input".
  <https://design-system.service.gov.uk/components/date-input/>
- **MOJ (Ministério da Justiça britânico):** campo de texto + calendário que abre no dia de hoje,
  feito para datas que a pessoa consulta; não serve para datas de cor (nascimento).
  <https://design-patterns.service.justice.gov.uk/components/date-picker>
- **NN/g:** sempre deixar digitar, aceitar vários separadores, rotular o "hoje" e usar calendário
  para datas próximas e intervalos. <https://www.nngroup.com/articles/date-input/>
- **Material 3 / Android:** calendário com um botão que alterna para o modo de digitação.
  <https://developer.android.com/develop/ui/compose/components/datepickers>

### (c) Armadilhas (parte 5)

- **`<input type="date">` cru:** o formato segue o idioma do navegador (num navegador em inglês vira
  mm/dd/aaaa), a aparência muda de aparelho para aparelho e não há lugar para o "Hoje".
- **Calendário como única forma de preencher**, ou três listas suspensas de dia, mês e ano.
- **Pular de campo sozinho**, ou uma máscara que briga com o Backspace e com o colar. O projeto já
  teve esse defeito com regex.
- **Placeholder "dd/mm/aaaa" como único rótulo.**
- **Aceitar 31/02 calado**, ou converter fuso e a data mudar um dia. A data deve ser guardada pura,
  AAAA-MM-DD, sem hora.

---

## 6. Tabelas modernas e estados vazio / carregando / erro

### (a) Padrão recomendado (parte 6)

- **Barra de ferramentas acima da tabela:** busca que filtra enquanto se digita (espera de ~250 ms),
  filtros em "chips" removíveis ("Congregação: Sede ×") com "Limpar filtros", a contagem ("128
  membros") e Exportar. Filtros, ordem e página ficam na URL, então o botão Voltar e o link
  compartilhado funcionam.
- **Ordenação clicando no cabeçalho** (seta ↑/↓ e `aria-sort`), sobre o conjunto inteiro e não só a
  página. **Cabeçalho fixo** (`position:sticky; top:0`) e, quando há rolagem lateral, **primeira
  coluna fixa**. Números à direita com algarismos de largura igual, texto à esquerda.
- **Linhas de 40 a 48 px**, com divisória leve e destaque ao passar o mouse. A linha inteira abre o
  detalhe. Ficam visíveis 1 ou 2 ações por linha, e o resto vai para o menu "⋯". Ao marcar caixas,
  aparece uma barra de ações em massa. A paginação mostra "1–25 de 128" e deixa escolher 25, 50 ou
  100 por página.
- **Situação como etiqueta humana:** "Em comunhão", com cor **e** texto, nunca `EM_COMUNHAO`. O
  dicionário de código para rótulo fica num único lugar do front.
- **No celular (abaixo de ~640 px) cada linha vira um cartão:** o nome como título, 2 ou 3 dados
  principais, a etiqueta de situação e o toque abrindo o detalhe. Os filtros vão para um painel que
  sobe de baixo ("Filtrar (2)"). Relatórios de comparar números continuam como tabela, com rolagem
  lateral e a primeira coluna fixa.
- **Estados desenhados:**
  - **Carregando:** nada abaixo de 1 s; de 1 a 10 s, esqueleto de 5 a 8 linhas (ou um spinner no
    componente); acima de 10 s, barra de progresso.
  - **Vazio no primeiro uso:** uma linha de explicação e um botão ("Nenhuma turma ainda. Cadastrar
    turma").
  - **Vazio por filtro:** "Nenhum resultado para 'Silva' na Sede", com "Limpar filtros".
  - **Erro:** uma frase humana, "Tentar de novo" e "Detalhes técnicos" recolhido.

### (b) Quem faz assim (parte 6)

- **NN/g, tabelas de dados:** cabeçalho e primeira coluna fixos, filtros visíveis com indicação de
  que estão ligados, ações em massa por caixa de seleção e edição em painel lateral em vez de modal.
  <https://www.nngroup.com/articles/data-tables/> Para o celular, cabeçalho travado, primeira coluna
  fixa e sinal claro de rolagem lateral: <https://www.nngroup.com/articles/mobile-tables/>
- **Carbon, Data table:** barra de ferramentas com busca e filtros, ações em massa ao selecionar
  linhas e cabeçalho fixo. <https://carbondesignsystem.com/components/data-table/usage/>
- **shadcn/ui, Data table:** busca, ordenação, colunas visíveis e paginação.
  <https://ui.shadcn.com/docs/components/data-table>
- **NN/g, estados:** o vazio diz o que está acontecendo, ensina e oferece o próximo passo, e nunca
  aparece "não há itens" enquanto ainda carrega.
  <https://www.nngroup.com/articles/empty-state-interface-design/> Os limites de tempo do esqueleto
  estão em <https://www.nngroup.com/articles/skeleton-screens/>.

### (c) Armadilhas (parte 6)

- **Tabela larga espremida no celular**, ou rolagem lateral sem nenhum sinal de que existe.
- **Filtro ligado sem indicação**, ou ordenação que só vale para a página atual.
- **Esqueleto eterno**, sem prazo e sem mensagem de erro.
- **Erro com código técnico, SQL ou pilha de chamadas** na tela.
- **Ações que só aparecem com o mouse por cima**: não existem no toque.
- **Editar num modal que esconde a lista** que a pessoa usava de referência.

---

## 7. Formulários longos

### (a) Padrão recomendado (parte 7)

- **Uma coluna, com no máximo ~640 px de largura** e o rótulo curto **acima** do campo. Campos
  curtos e relacionados podem dividir a linha (Cidade | UF | CEP).
- **Seções com título** (`<fieldset><legend>`): "Dados pessoais", "Contato", "Vida eclesiástica",
  "Documentos". A forma depende do uso:
  - **Fichas editadas com frequência** (membro): página única, com o índice das seções fixo ao lado e
    uma barra de ações fixa no rodapé ("Salvar" e "Cancelar").
  - **Fluxos raros e longos** (consagração, inscrição): **etapas**, um assunto por tela, terminando
    em "Revisar antes de enviar".
  - **Processos de vários dias:** lista de tarefas com situação ("Concluído", "Falta fazer").
- **Ajuda em 3 níveis:**
  1. O rótulo, curto e em português comum.
  2. Uma dica visível abaixo dele, só quando há uma regra que a pessoa precisa seguir (formato,
     limite).
  3. Um botão **"?"** ao lado do rótulo, que abre um balão **por clique ou toque** (não ao passar o
     mouse), com o porquê e a base no Regimento ("Regimento, Art. 27").

  O artigo do estatuto nunca entra no rótulo.
- **Campo opcional escrito "(opcional)"**, sem asterisco. Até 5 opções viram botões de rádio
  visíveis; com mais, lista ou autocompletar.
- **Erros:** a validação acontece ao enviar, e campo a campo só depois da primeira tentativa. No topo
  aparece um resumo ("Há 2 problemas") com links para os campos, e embaixo de cada campo a mensagem
  diz como corrigir. O que foi digitado continua lá, e o foco vai para o resumo.
- **Rascunho automático** nos formulários longos, com o aviso "Salvo às 14:32".

### (b) Quem faz assim (parte 7)

- **NN/g, formulários:** uma coluna, rótulo acima, poucos campos opcionais e marcados, erro
  específico que guarda o que foi digitado, e nada de botão "Limpar".
  <https://www.nngroup.com/articles/web-form-design/>
- **GOV.UK:** "(optional)" no lugar do asterisco e uma coisa por página nos fluxos guiados.
  <https://design-system.service.gov.uk/patterns/question-pages/> Também tem resumo de erros com
  links, <https://design-system.service.gov.uk/patterns/validation/>, e lista de tarefas para
  processos longos, <https://design-system.service.gov.uk/patterns/complete-multiple-tasks/>.
- **NN/g, dicas (tooltips):** servem para explicar um campo pouco conhecido. A regra que a pessoa
  precisa cumprir não pode ficar escondida nelas. <https://www.nngroup.com/articles/tooltip-guidelines/>
- **Baymard:** ajuda sempre visível nas telas de digitação e em recursos pouco usados; ajuda sob
  demanda ("O que é isto?") no que a maioria já entende. <https://baymard.com/blog/inline-help>

### (c) Armadilhas (parte 7)

- **Placeholder no lugar do rótulo**, ou asterisco vermelho sem legenda.
- **Duas colunas de campos:** a pessoa pula campos sem perceber.
- **"?" que só abre com o mouse**, ou uma regra obrigatória escondida dentro do "?".
- **Botão "Limpar".**
- **Erro aparecendo a cada tecla**, antes de a pessoa terminar de digitar.
- **Perder tudo quando a sessão expira.** A saída é rascunho mais reautenticação sem recarregar a
  página.
- **Códigos técnicos nas opções das listas.**

---

## 8. Celular

### (a) Padrão recomendado (parte 8)

- **Abaixo de ~1024 px (ou com zoom de ~175%) a lateral vira gaveta.** Entra pela esquerda com 288 px
  (no máximo ~85% da tela) sobre um fundo escurecido. Fecha com toque fora, Esc ou ao navegar; o foco
  fica preso dentro dela e volta ao botão de menu ao fechar.
- **Barra inferior com 4 ou 5 destinos** (ícone + rótulo), com 56 a 64 px de altura mais
  `env(safe-area-inset-bottom)`. Os destinos: Início · Buscar · a ação principal do papel ("Lançar"
  ou "Presença") · Avisos · Menu (abre a gaveta completa).
- **Alvos de toque de 44×44 px ou mais**, com pelo menos 8 px entre eles. O mínimo do WCAG AA é
  24 px; Apple recomenda 44 pt e Google, 48 dp.
- **Campos:** fonte de 16 px nos campos (o iPhone não dá zoom sozinho), `inputmode` certo (`decimal`
  para valor, `numeric` para código e data, `tel`, `email`) e `autocomplete` nos dados pessoais. O
  botão principal do formulário fica fixo no rodapé.
- **Conteúdo:** tabelas viram cartões, tudo em uma coluna. O título fica curto, com "‹ Lançamentos"
  para subir um nível. Nada depende de passar o mouse, e deslizar a linha é só atalho (sempre há
  botão).
- **Tela e teclado:** usar `100dvh` em vez de `100vh` e esconder a barra inferior quando o teclado
  abre, para ela não cobrir o campo.

### (b) Quem faz assim (parte 8)

- **Material / Android:** barra inferior com 3 a 5 destinos, gaveta para mais que isso e trilho
  lateral nas telas médias.
  <https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns>
- **Vercel (jan/2026):** lateral redimensionável no computador e barra inferior flutuante no celular,
  feita para usar com uma mão. <https://vercel.com/changelog/new-dashboard-navigation-available>
- **NN/g, menu hambúrguer:** esconder a navegação principal corta quase pela metade a chance de a
  pessoa achar as coisas. Os destinos principais precisam ficar à vista.
  <https://www.nngroup.com/articles/hamburger-menus/>
- **WCAG 2.5.8 (alvo mínimo) e MDN (`inputmode`):**
  <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html> e
  <https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/inputmode>. A shadcn/ui
  Sidebar vira gaveta (18rem) no celular: <https://ui.shadcn.com/docs/components/sidebar>

### (c) Armadilhas (parte 8)

- **Só o hambúrguer com os 26 itens** dentro.
- **Barra inferior com 6 ou mais itens**, ou só com ícones.
- **Botões pequenos e colados uns nos outros.**
- **Tabela com rolagem lateral sem aviso.**
- **Modal maior que a tela**, ou elemento fixo cobrindo o campo quando o teclado abre.
- **Ação que só existe ao passar o mouse.**

---

## Paleta e tipografia

### Tipografia

- **Família:** a pilha do sistema (`system-ui, "Segoe UI", Roboto, Arial, sans-serif`) não baixa
  nada e combina com a CSP atual. A alternativa é **uma** família hospedada no próprio site (ex.:
  Inter em woff2 só com o alfabeto latino, pesos 400/600/700). Valores e colunas de números levam
  `font-variant-numeric: tabular-nums`.
- **Escala** (base 16 px, razão ~1,2), compatível com a do Material 3 (Body 16/14/12, Title 16/22,
  Headline 24):

  | Papel | Tamanho / altura da linha | Uso |
  | --- | --- | --- |
  | legenda | 12 / 16 | contadores, carimbos de hora (pouco uso) |
  | pequeno | 14 / 20 | tabelas, rótulos, itens do menu, texto secundário |
  | corpo | 16 / 24 | texto, campos, botões |
  | subtítulo | 18 / 26 | título de cartão e de seção |
  | título | 24 / 32 | título da página |
  | destaque | 32 / 40 | número do cartão de indicador |

- **Pesos:** 400 no texto, 600 nos rótulos e títulos, 700 só no número do indicador. Texto corrido
  com no máximo `max-width: 65ch`, e nada de CAIXA ALTA em rótulo longo.

### Espaçamento (grade de 8 px, com meio passo de 4)

- **Tokens:** 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64. No Atlassian, a unidade base `space.100` é 8 px.
- **Alturas:** campo e botão com 40 px no computador e 44 a 48 px no toque; linha de tabela com 40
  (compacta) ou 48 (padrão); item do menu com 36 a 40; topo com 56; lateral com 256 de largura.
- **Cartões:** padding de 16 a 24, 16 entre cartões e 32 entre seções. Raio de 8 px nos cartões e de
  6 px nos campos.

### Contraste (WCAG 2.2 AA), medido nos tokens atuais de `app/style.css`

As regras: texto normal precisa de **4,5:1** ou mais; texto grande (24 px, ou 18,7 px em negrito)
de 3:1; borda de campo, ícone que informa e anel de foco também de **3:1**. Os valores abaixo foram
calculados com a fórmula do WCAG.

| Par (texto sobre fundo) | Razão | Resultado | Ação |
| --- | --- | --- | --- |
| marinho `#0B2545` sobre branco | 15,39 | passa | manter |
| dourado `#C9A227` sobre branco | 2,42 | **falha** | nunca usar como texto ou ícone sobre fundo claro |
| dourado `#C9A227` sobre marinho | 6,36 | passa | uso certo do dourado |
| texto-suave `#6B7280` sobre fundo `#F5F6F8` | 4,47 | **falha** (por pouco) | trocar por `#5F6673` (5,34) |
| sucesso `#1F8A4C` sobre branco | 4,38 | **falha** | trocar por `#166534` (7,13; 6,29 sobre `#E6F4EC`) |
| dourado-texto `#8f6f1f` sobre `#FBF3DD` | 4,25 | **falha** | trocar por `#7A5C12` (5,63) |
| borda `#E2E5EA` sobre branco | 1,26 | só divisória | borda de campo `#868F9E` (3,26) |
| erro `#C0392B` sobre branco / sobre `#FDECEA` | 5,44 / 4,76 | passa | manter |

### Cor por área, sem perder o marinho e o dourado

- **Marinho = estrutura:** lateral, topo, botão principal e links. **Dourado = acento
  institucional:** marca, barra do item ativo na lateral, anel de foco sobre marinho e filetes.
  Os botões ficam marinho em **todas** as áreas, para o sistema parecer um só.
- **Cada área ganha um acento**, usado só no ícone do módulo, num filete de 4 px no topo do cabeçalho
  do módulo, no nome do módulo no caminho e nos gráficos daquela área. Contraste medido sobre
  branco:

  | Área | Cor | Contraste |
  | --- | --- | --- |
  | Secretaria / Membros | azul `#1D4ED8` | 6,70 |
  | Tesouraria | verde-petróleo `#0F766E` | 5,47 (4,91 sobre `#E6F6F4`) |
  | EBD / Ensino | violeta `#6D28D9` | 7,10 |
  | Escalas e Eventos | magenta `#A21CAF` | 6,32 |
  | Governança / Ministério | o próprio marinho + dourado | 15,39 |

- **Cores de estado reservadas** (nunca usadas como cor de área): sucesso `#166534`, alerta `#B45309`
  (5,02), erro `#C0392B`. Informação usa marinho.
- **Quatro tons por cor**, em variáveis CSS, seguindo a lógica da escala de 12 passos do Radix
  (passo 3 fundo suave, 7 borda, 9 sólido, 11 texto): `--area-fundo`, `--area-borda`, `--area-forte`
  e `--area-texto`. A área ativa entra por `data-area="tesouraria"` no `<main>`.
- **Nunca informar só pela cor:** etiqueta sempre com texto, e módulo sempre com ícone + nome
  (WCAG 1.4.1).
- **Referências:** o Planning Center tem uma cor por produto (People, Giving, Services, Check-Ins) no
  seu sistema de design, <https://planningcenter.github.io/tapestry-react/colors>. A escala do Radix
  está em <https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale>, o
  espaçamento do Atlassian em <https://atlassian.design/foundations/spacing> e a escala de tipos do
  Material 3 em <https://m3.material.io/styles/typography/type-scale-tokens>. Os critérios de
  contraste do WCAG estão em <https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html> e
  <https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html>.
