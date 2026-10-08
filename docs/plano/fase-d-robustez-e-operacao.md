# FASE D — Robustez, operação e celular (retrofit das fases 0 a 7)

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

**Onde entra:** entre a v7.5 e a 🔒 Trava de Revisão 7-A da FASE 7 — a trava 7-A só abre depois que a FASE D fechar.
Mesmo motivo da FASE B (inserida entre a 4 e a 5): não é tema de negócio novo, é **consertar e reforçar o que já está
construído antes de empilhar mais cinco fases em cima**. Letra, não número, pra nunca colidir com versão existente.

**De onde veio:** da [8ª rodada de pesquisa](../pesquisa/oitava-rodada-2026.md) (06/10/2026), que respondeu à pergunta
"o que separa o sistema de hoje do melhor que ele pode ser?". A resposta não foi "falta função": o sistema já cobre o
Estatuto e o Regimento com mais detalhe do que qualquer produto de mercado comparado nas rodadas anteriores. O que
separa é **robustez**: um front-end de 21.690 linhas num arquivo só, nenhuma prova automática de que cada tela abre,
homologação com banco atrasado, liderança sem segundo fator, ninguém avisado quando o sistema cai, e o membro usando
pelo celular telas desenhadas pro notebook.

**Como ler o custo de cada versão** (o responsável decide por esforço + risco): *Esforço* em sessões de trabalho
(baixo = 1, médio = 2 a 4, alto = 5 ou mais); *Risco* = chance de quebrar o que já funciona; *Depende de você* = o que só
o responsável pode fazer (criar segredo, aprovar custo no Azure, decidir entre duas opções).

**Ordem obrigatória:** vD.1 antes da vD.2 (a prova automática é o que torna a modularização segura); o resto é livre.

**O site institucional não entra nesta fase.** A FASE D mexe só no sistema (`app/`, `api/`, `tools/`, `docs/` e o
fluxo de CI do sistema). O site (`site/`) tem aplicativo, fluxo de deploy e banco (Directus) próprios: um commit que
não toca `site/` não publica o site, e o pedido de camiseta (`site/api/CriarPedidoCamiseta`) fala só com o Directus,
nunca com a API do sistema. **Janela de congelamento do site: até 17/10/2026** (camisetas do evento municipal em
pedido): nenhum commit em `site/`, nenhum deploy manual do site e nada da vD.5 que mude como o site é montado. A
sincronização da agenda (3 vezes por dia) continua, porque é ela que publica o conteúdo novo do Directus — mesmo
código do site, só conteúdo. A única chamada do site à API do sistema em tempo real é a pergunta "este e-mail é de
membro?" da Minha Conta (`site/api/SolicitarCodigoConta`); um deploy do sistema troca a API sem derrubá-la, e essa
tela não participa do pedido de camiseta.

## vD.1 — Toda tela abre, provado por máquina (teste de interface no CI)

Hoje a pergunta 2 de toda Trava de Revisão ("toda tela nova abre e mostra dado de verdade?") é respondida clicando à
mão, uma por uma. Com cerca de 190 rotas e centenas de sub-abas, a mão não alcança — e o bug que motivou as travas (um
`id` de botão diferente do que o JavaScript gera derrubou o Financeiro inteiro) é exatamente o tipo que uma máquina pega
em segundos. O equipamento já existe: `tools/csp-e2e` descobre sozinho todo controle da tela (880 pontos de evento),
aciona cada um com a API simulada e comparou 4.782 ações sem divergência quando a CSP forte entrou (04/10/2026). Falta
só torná-lo **permanente**.

- [x] Rodada do `tools/csp-e2e` no CI — *feita em 07/10 como fluxo próprio* (`sistema-testes-tela.yml`, a cada push na
      `main` que toque `app/` ou o equipamento, e à mão com a rodada completa), no Chrome do runner (o equipamento
      aceita `NAVEGADOR=<caminho>`; sem ele acha Edge/Chrome sozinho). Primeira rodada (07/10): plano descoberto com
      **4.737 ações** em 3 perfis, modo rápido **962 ações, 105 telas distintas, 581 rotas de API**, resultado
      **962 iguais, 0 divergência, 0 violação de CSP**. Não bloqueia o deploy (roda em paralelo): a descoberta do plano
      de uma base nova leva ~30 min; com o plano em cache, a rodada leva ~7 min.
- [x] Linha de base: `tools/csp-e2e/base/commit.txt` guarda o commit aprovado; o CI extrai o `app/` dele (`git
      archive`), reaproveita o plano pelo cache do Actions (chave = commit da base) e compara com a versão atual.
      Mudança de tela intencional = atualizar o commit da base no mesmo push (fica visível no diff).
- [x] Tempo: ~7 min com o plano em cache (modo `--rapido`); rodada completa só por `workflow_dispatch`
      (`completo=sim`) e nas travas.
- [x] As Travas de Revisão passam a citar o resultado desta rodada como resposta à pergunta 2 — clicar à mão continua
      valendo pra tela nova, mas deixa de ser a única prova. (Vale a partir da Trava D-A.) *Feito em 07/10/2026: a
      pergunta 2 do checklist do README passou a exigir a rodada completa e o número da corrida; a Trava D-A já cita.*

*Esforço:* médio. *Risco:* baixo (não toca o sistema, só o CI). *Depende de você:* nada.

## vD.2 — Front-end em módulos (v10.4 trazida pra frente)

A v10.4 dizia, com 7.898 linhas: "fazer isso **antes** da FASE 5, não depois: é mais barato modularizar 8 mil linhas do
que 20 mil". Não foi feito. Hoje `app/script.js` tem **21.690 linhas** e `app/index.html` **5.481** — e as FASES 8 a 12
vão empilhar mais. Cada edição num arquivo desse tamanho é um risco de derrubar o painel inteiro, e o navegador baixa
tudo (inclusive o Financeiro) pra um membro que só quer ver a própria escala. O que mudou desde a v10.4 e torna isso
seguro agora: a vD.1 prova equivalência ação por ação, igual provou a CSP (4.782 ações idênticas).

- [x] `app/script.js` dividido por tema, um arquivo por tema em `app/modulos/` (23 módulos, tabela abaixo); o núcleo
      (login, sessão, navegação, Painel único, termos, busca, sino, tarefas, sessões, módulos, portaria, anexos, PWA,
      ajudantes de tela e o registro de ações) ficou em ~1.550 linhas. *Feito em 07/10/2026 — método e provas abaixo.*
- *Cancelados pelo responsável em 07/10/2026:* "carregar cada módulo sob demanda" e "`index.html` por módulo". Motivo
  medido depois da divisão: o núcleo chama funções e variáveis dos módulos em dezenas de pontos, e cada um teria de
  virar "carrega, espera, chama" — trabalho e risco reais para ganhar só o tempo de ler ~1,3 MB de JavaScript uma vez
  por sessão (0,2-0,4 s num celular simples; o service worker já guarda os arquivos). Todos os módulos continuam
  carregando sempre, como antes.
- [x] Prova de equivalência pela vD.1 **antes e depois de cada módulo extraído** (um módulo por commit): zero
      divergência nas ações, zero violação de CSP, nenhum `id` perdido. O `eventos.js` (despachante com lista fechada)
      continua único — a lista fechada passa a ser montada pelos módulos carregados. *Feito em 07/10/2026: um commit
      por módulo; a prova rodou no `homolog` por lote (1, 1, 1, 2, 7 e 11 módulos — 962 ações iguais em todos) e de
      novo na `main` a cada merge; cada lote abriu as telas de verdade na homologação (`tools/modularizar/prova-modulo.js`).*
- [ ] O que se repete de verdade (tabela com filtro, formulário mestre-detalhe, badge de status) vira função
      reaproveitável no núcleo — só o que já se repete, sem redesenho visual (isso é v10.1).
- [x] A v10.4 é marcada como entregue aqui (nota lá apontando pra cá), sem duplicar. *Feito em 07/10/2026 (nota no
      plano da FASE 10; o que a vD.2 deixou para depois continua lá como item aberto).*

*Esforço:* alto. *Risco:* médio, mitigado pela vD.1 (sem a vD.1 feita, **não começar**). *Depende de você:* nada.

*Preparação feita em 07/10/2026:* a vD.1 está no ar (a prova de equivalência existe) e o
[mapa do `script.js`](vD2-mapa-script.md) foi gerado: 21.711 linhas, 1.307 funções, 244 declarações e 19
instruções soltas de nível superior; onze temas reconhecíveis (calendário, EBD, canais, relatórios, eventos, PSC,
voluntariado, PDQ, CEI, escalas, LGPD) somam ~11 mil linhas e são os primeiros arquivos a extrair. O mapa lista
também as ferramentas que leem `script.js` e precisam acompanhar a divisão. A extração em si fica para uma sessão
dedicada, um módulo por commit, com a rodada completa dos testes de tela antes e depois.

*Piloto feito em 07/10/2026 — o primeiro módulo, o método e a rede de proteção:*

- **`app/modulos/psc.js`**: a Saúde Congregacional (PSC) saiu do `script.js` (886 linhas, 61 funções, 17 declarações,
  25 ações) **sem mudar uma linha de código**: é um script clássico que o `index.html` carrega depois do `script.js`
  (mesmo escopo global, por isso as funções continuam se chamando pelo nome) e registra as suas ações no próprio fim do
  arquivo (`registrarAcoes` mescla). O `script.js` ficou com 20.818 linhas; o service worker guarda o módulo na casca
  (cache v6).
- **Prova:** os testes de tela (vD.1) rodaram na homologação contra a base de antes da divisão: **962 ações iguais,
  0 divergência, 0 violação de CSP** (o fluxo passou a rodar também em push no `homolog`, com fila por ramo — a prova
  sai antes da `main`); os 4 testes do front no `jest` (111 casos, 6 mutações novas); e a tela aberta de verdade na
  homologação, com a API real, pelo pastor de área fictício (ver `docs/plano/capturas/vD.2/`).
- **Rede de proteção para os próximos módulos** (`frontCsp.test.js`): cada módulo tem exatamente um `registrarAcoes`;
  a união dos registros é o que a tela usa; nome de nível superior repetido entre `script.js`, `eventos.js` e módulos
  acusa (scripts clássicos dividem o escopo: função repetida esconde a outra em silêncio, `const` repetido faz o
  navegador recusar o arquivo inteiro); o `index.html` carrega exatamente os módulos da pasta, na ordem; a casca do
  service worker tem todos. `frontEscape` e `frontTipoDosArgumentos` varrem a junção (mensagem aponta
  arquivo:linha). `tools/csp-e2e/fontes.js` dá ao equipamento a ordem dos arquivos lida do `index.html` (pasta sem
  módulos = texto idêntico ao `script.js`: a chave do plano da base não muda).
- **Como extrair o próximo:** escolher um tema contíguo no mapa; mover o bloco para `app/modulos/<tema>.js` e os
  nomes dele do `registrarAcoes` do `script.js` para o do módulo; `index.html` (`<script>`), service worker (casca e
  versão), `tools/csp-e2e/remoto.js`; `npx jest` do front; subir no `homolog` e esperar o teste de tela e a conferência
  na homologação; só então a `main`, pelo ramo da mudança (nunca mesclar o `homolog`, ver `HOMOLOGACAO.md`).
- **Decisão:** carregar sob demanda fica para depois de dividir tudo. O ganho de manutenção (arquivos menores, diff
  legível, um tema por commit) vem da divisão; o carregamento sob demanda exige que o despachante conheça só ações de
  módulos já carregados e muda o `eventos.js`, com risco próprio — fase separada, com a mesma prova.

*Divisão completa, 07/10/2026 — 23 módulos, um commit por módulo, com as ferramentas em `tools/modularizar/`:*

| Módulo (`app/modulos/`) | Linhas | Funções | Ações |
| --- | ---: | ---: | ---: |
| `arquivos.js` (arquivos, texto mestre, retenção) | 257 | 11 | 7 |
| `assistencia.js` | 242 | 12 | 9 |
| `calendario.js` | 1.736 | 140 | 51 |
| `canais.js` | 1.459 | 104 | 46 |
| `catalogos-estrutura.js` (CRUD genérico, congregações) | 700 | 36 | 17 |
| `consagracoes.js` (+ esteira de batismo) | 283 | 16 | 11 |
| `disciplina.js` (+ abandono) | 655 | 33 | 16 |
| `doacoes.js` | 224 | 12 | 8 |
| `ebd.js` (+ conquistas) | 2.366 | 147 | 101 |
| `enquetes.js` | 192 | 12 | 8 |
| `escalas.js` (+ habilitação de voluntários) | 476 | 30 | 22 |
| `eventos-congressos.js` | 1.125 | 91 | 32 |
| `financeiro.js` (tesouraria a dizimistas do mês) | 3.748 | 197 | 129 |
| `meu-painel.js` (frequência, LGPD, solicitações) | 645 | 32 | 18 |
| `meus-dados.js` (foto, dados, vínculos, edição) | 321 | 14 | 8 |
| `ouvidoria.js` (+ mediação) | 480 | 28 | 20 |
| `permissoes.js` (+ regras de notificação) | 326 | 18 | 12 |
| `pessoas.js` (cadastro a fila de aprovações) | 1.643 | 67 | 34 |
| `projetos-assembleia.js` (projetos, credenciamento, elegíveis) | 943 | 47 | 31 |
| `psc.js` | 899 | 61 | 25 |
| `relatorios-departamentos.js` | 634 | 28 | 16 |
| `reunioes.js` | 195 | 12 | 5 |
| `voluntariado.js` | 797 | 68 | 25 |
| **núcleo `script.js`** | **1.551** | **90** | — |

O que a divisão achou de graça: o `script.js` original declarava `lerArquivoComoBase64` **duas vezes** (a segunda
vencia em silêncio); ficou uma só, no núcleo, com o texto da que valia. Seis ajudantes de uso geral que moravam na
EBD (`escaparHtmlEbd`, `argsAttr`, `urlSegura`, `formatarDataEbd`, `formatarMoedaEbd`, `numeroDoCampo`) foram
devolvidos ao núcleo. Cada lote subiu primeiro no `homolog` (teste de tela: 962 ações iguais, 0 divergência, 0
violação de CSP em todos os lotes) e abriu a tela de verdade na homologação antes de ir para a `main`; a v10.4 do
plano aponta para cá.

## vD.3 — Homologação igual à produção

Descoberta de 03-04/10/2026 (`docs/PLATAFORMAS.md`): o banco `ieadespa-homolog` está com o esquema **atrasado** (o
fluxo do PR migra o banco de produção, não o de homologação — por isso a lista de documentos dá 500 lá), e a homologação
passou semanas ligada ao Function App antigo sem rodar o código novo. Ou seja: "testado na homologação" não provava nada.
E desde 13/09/2026 a `HOMOLOGACAO.md` pede um seed de dados fictícios que nunca foi escrito.

- [x] Passo de migração do banco de homologação no fluxo do PR #1 (`homolog`), com a conexão dela guardada como
      segredo do GitHub (`AZURE_SQL_CONNECTION_STRING_HOMOLOG`) — mesmo `scripts/executar-migracoes.js`, mesma ordem.
      *Feito na noite de 06/10:* o fluxo escolhe o banco pelo branch do PR (`homolog…` → homologação; `main` →
      produção); a conexão veio do ambiente 1 do próprio Static Web App. O `homolog` recebeu a `main` e o PR #1
      migrou o `ieadespa-homolog` (antes com esquema atrasado): `/api/documentos`, que dava 500 lá, responde 200.
- [x] Seed fictício reproduzível (`api/scripts/semear-homologacao.js`) — *feito em 07/10:* 1 área, 3 congregações,
      60 pessoas (matrículas 900001 a 900060, 1 em 5 menor), 20 dizimistas e lideranças com senha (dirigente e
      tesoureiro de cada congregação, pastor de área; papéis criados se faltarem); tudo marcado "Fictícia"/"fict-",
      idempotente, e o script **se recusa** a rodar se o banco da conexão não tiver "homolog" no nome. Roda sozinho no
      fluxo do PR de homologação logo depois das migrações. Tesouraria, EBD e escalas fictícias ficam para serem
      geradas pelas próprias telas (as regras de termo, categoria e fechamento são do app).
- [x] Varredura de rotas rodando contra a homologação depois de cada deploy dela — o passo 4 da rotina de atualização
      de plataformas passa a ter prova. *Feito em 07/10/2026 (`api/scripts/varrer-rotas.js`, passo do fluxo do Static
      Web App): as 203 Functions são chamadas sem sessão no endereço recém-publicado (preview do PR da homologação, ou a
      produção depois do push na `main`); 404 do Static Web App ou 5xx persistente derruba o fluxo; o `index.html`
      publicado tem de carregar todos os módulos do repositório. Espera a propagação (3 respostas 200 seguidas de
      `/api/saude` e `/`) e repete 3 vezes antes de acusar.*
- [x] `HOMOLOGACAO.md` atualizada: o que a homologação prova e o que não prova, sem ambiguidade. *Feito em 07/10/2026
      (seção própria).*

*Esforço:* baixo. *Risco:* nenhum pra produção. *Depende de você:* criar o segredo no GitHub (ou autorizar o `gh secret
set` em modo manual) — o valor sai do portal do Azure, nunca de texto puro no repositório (regra 2 do `CLAUDE.md`).

## 🔒 Trava de Revisão D-A — antes de avançar para a vD.4

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3 do README). Audita vD.1 a vD.3 pelas 5
perguntas do checklist. Atenção especial à vD.2: a pergunta 2 (toda tela abre) tem que ser respondida pela rodada
completa da vD.1 (não só o modo rápido) **e** por um clique manual em cada módulo extraído.

- [x] **Fechada em 07/10/2026** — auditoria de vD.1, vD.2 e vD.3:
  1. *Código novo roda de ponta a ponta no ambiente real?* **Sim.** Cada push migrou e semeou a homologação pelo
     fluxo do PR #21 e migrou a produção pelo push na `main`; a varredura de rotas (vD.3) chamou as 203 Functions sem
     sessão na produção e no preview recém-publicado — 0 rota 404, 0 rota 5xx, 23 módulos do front conferidos
     (corridas 37652972449, 37652991368, 37653338304 e 37653351263). Front e back usam os mesmos nomes de rota: é
     o que a varredura e o teste de tela conferem a cada deploy.
  2. *Toda tela abre e mostra dado de verdade?* **Sim.** Rodada **completa** dos testes de tela na `main` depois
     da divisão: corrida 37653097551 — **4.737 ações iguais à linha de base, 0 divergência, 0 violação de CSP,
     0 falha do equipamento** (2.107 s). E o clique em cada módulo extraído, na homologação, com login dos fictícios
     e a API real (`tools/modularizar/prova-modulo.js`): 22 dos 23 módulos tiveram a sua aba aberta e a API
     respondendo 200 (psc, voluntariado, eventos-congressos, canais, calendario, ebd — Turmas, Trilhas e
     Conquistas —, financeiro, disciplina, escalas — Escalas e Habilitação —, pessoas, ouvidoria, reunioes,
     projetos-assembleia, enquetes, arquivos, consagracoes, relatorios-departamentos, assistencia,
     catalogos-estrutura — Estrutura —, meu-painel, meus-dados, doacoes); `permissoes` (e a sub-aba Catálogos) só
     abrem para o nível geral, que a massa fictícia não tem: ficou provado pelo perfil "geral" do teste de tela
     (API simulada) e pela conferência de escopo/registro do módulo publicado. Zero erro de JavaScript em todas.
  3. *README e código narram a mesma coisa?* **Sim.** README (estado atual, árvore, checklist das travas), este
     plano (vD.1, vD.2 com a tabela dos módulos, vD.3), a nota na v10.4, `HOMOLOGACAO.md` (PR #21, regra de merge,
     o que a homologação prova) e `tools/modularizar/README.md` foram atualizados no mesmo dia; o mapa antigo do
     `script.js` está marcado como "de antes da divisão".
  4. *O que ficou para trás foi corrigido, não só anotado?* **Sim, o que o código resolve.** A função declarada
     duas vezes (`lerArquivoComoBase64`) ficou uma só; os ajudantes de uso geral voltaram ao núcleo; o PR da
     homologação fechado pelo GitHub foi substituído (PR #21) com a regra escrita; o ambiente novo, que nasceu
     apontado ao banco de produção, foi apontado ao `ieadespa-homolog`; o teste do site que ficava vermelho ao
     mesclar um PR passou a fazer checkout pelo commit. **Feito com o responsável em modo manual, na mesma tarde:**
     os três ambientes de preview órfãos apagados (sistema `18`; site `1` e `18`) e os dois segredos da vD.8
     trocados. **Fica para o responsável:** escolher o segundo fator (vD.4), a raiz do domínio (vD.7, depois de
     17/10) e o ensaio de restauração (vD.5). O que a vD.2 deixou **por decisão** para uma fase própria (carregar sob
     demanda, `index.html` por módulo, funções reaproveitáveis) continua como item aberto da vD.2 e não bloqueia a
     trava.
  5. *Deploy real aconteceu?* **Sim.** Cada lote de módulos subiu primeiro no `homolog` (teste de tela + telas
     reais) e depois na `main`; a produção foi conferida depois de cada merge (`script.js` publicado com 1.551
     linhas, 23 módulos no `index.html`, service worker na casca v28, varredura de rotas verde).

## vD.4 — Segundo fator para quem aprova dinheiro e concede acesso

Hoje a liderança entra só com matrícula + senha. Quem tem nível geral aprova saída, gera remessa bancária (dinheiro de
todas as congregações), concede permissão e vê dado de disciplina e de menor. Senha vazada (reuso em outro site,
telefone perdido com a senha salva) = tudo isso nas mãos de quem achou. A infraestrutura do segundo fator **já existe**:
o membro recebe código de 6 dígitos por e-mail (`shared/codigoAcesso.js`, vB.5) pelo mesmo serviço de e-mail do Azure.

**Decisão do responsável (07/10/2026):** o segundo fator é a **chave de acesso** (*passkey*, padrão WebAuthn/FIDO2 —
o mesmo que o Gmail, a Microsoft e os bancos usam): a pessoa cadastra o próprio celular ou notebook como aparelho
confiável e, a cada entrada, confirma com a digital, o rosto ou a senha do aparelho; não decora nada, não digita código
e a chave fica guardada no aparelho por tempo indeterminado. O **código por e-mail** fica como reserva (aparelho
perdido, primeiro cadastro). Aplicativo autenticador (TOTP) **descartado** — item removido.

- [ ] **Segundo fator no login de liderança** (quem tem registro em `Lideranca`): depois da senha certa, o sistema
      pede a chave de acesso do aparelho (`navigator.credentials.get`); quem ainda não tem chave recebe o código de 6
      dígitos no e-mail do cadastro (10 minutos, 5 tentativas), como o membro já recebe hoje. Quem não tem nem chave
      nem e-mail **não fica trancado**: entra com aviso e é levado a cadastrar. Membro comum (PIN) **não muda** — o PIN
      já é um fator próprio e o que ele alcança é só o dele.
- [ ] **Cadastro e gestão da chave** em "Meus Dados → Segurança", ao lado de "Minhas Sessões" (vB.9): cadastrar este
      aparelho (apelido, data, último uso), cadastrar mais de um (celular e notebook), remover. A chave pública fica
      no banco (`ChavesAcesso`); a privada nunca sai do aparelho.
- [ ] **Confirmação reforçada ("step-up") em quatro atos**: aprovar saída acima do valor dos quatro olhos
      (`ParametrosCompliance`), gerar remessa bancária, conceder/retirar permissão ou cargo
      (`GestaoLideranca`/`GestaoDelegacoes`) e executar exclusão LGPD — a chave (ou o código) é pedida de novo na hora
      se a última confirmação tiver mais de 10 minutos; o ato fica na auditoria com o fator usado.
- [ ] Tela de administração (nível geral): quem tem chave cadastrada, quem não tem, último uso; remover as chaves de
      quem perdeu o aparelho (dois olhos, mesmo princípio da migração 122). A reserva por e-mail garante que o
      Presidente e o Secretário Geral **não ficam trancados fora**.
- [ ] Prova: testes de unidade do fluxo (bilhete do login, desafio de uso único, código de reserva) e prova em
      navegador na homologação com um autenticador virtual (o navegador cria e usa uma chave de verdade, sem
      aparelho físico), além da rodada de tela de sempre.

**Ponto de parada — 07/10/2026, fim de tarde (pedido do responsável):** a vD.4 está **escrita, testada e publicada na
homologação**, ainda **não** na produção. O código fica no ramo `vd4-chaves` (GitHub) e no `homolog` (PR #21); a
migração 140 já rodou no banco de homologação; 4.605 testes verdes; a rodada local de tela mostrou só as telas novas. O
que falta para ir à `main`: (1) a prova em navegador na homologação com autenticador virtual (roteiro pronto:
`prova-chave-homolog.js` — entra sem chave, cadastra, sai, entra pela chave, confirmação reforçada, remove); (2) a rodada de
tela da homologação com a nova linha de base (corrida em curso); (3) `git merge vd4-chaves` na `main`, push, conferir a
produção e marcar os itens acima. Nada do que está na produção depende disso.

*Esforço:* médio. *Risco:* baixo no código; a chave de acesso é a opção mais simples para quem usa (nada a decorar).
*Custo:* zero (biblioteca MIT `@simplewebauthn`, servida de dentro do site; e-mail já contratado). *Depende de você:*
nada mais — decidido.

## vD.5 — Operação: saber que caiu antes de alguém reclamar, e entrar sem esperar

Hoje existe **um** alerta (`ieadespa-api-falhas`: mais de 5 falhas em 15 minutos). Se o sistema sair do ar num domingo
de manhã (hora da chamada da EBD), ninguém é avisado — só quem tentar usar. O login leva de 10 a 30 segundos no primeiro
acesso do dia (partida a frio das Functions + banco serverless pausado), e a tentativa de resolver por infraestrutura
(20/09) esbarrou num defeito do Azure sem solução. A restauração do banco foi ensaiada **uma vez** (13/09/2026) e os
segredos (`AUTH_SECRET`, `CRON_SECRET`) nunca foram trocados.

- [x] **Teste de disponibilidade** a cada 5 minutos numa rota **que não toca o banco** — *feito na noite de 06/10,
      sem Azure e sem custo:* rota nova `GET /api/saude` (só `ok` + hora; registrada como pública no teste
      `rotasAnonimas`) e o fluxo `sistema-disponibilidade.yml` (GitHub Actions, `*/5`), que chama a rota e a página
      inicial do site e, na **primeira** falha de uma sequência, manda e-mail pela conta ACS do site para
      `presidente@ieadespa.org`; quando volta, manda "voltou". Efeito colateral útil: mantém as Functions quentes
      (some a partida a frio de 15-30 s) **sem acordar o banco**.
- [x] **Decisão separada, com número** — *decidido pelo responsável em 07/10/2026: NÃO manter acordado; o banco
      continua dormindo quando ninguém usa e acordando no primeiro acesso (os segundos de retomada são o preço de
      pagar só o uso). Item encerrado.* O raciocínio: manter o banco acordado em horário de uso (6h às 23h) tira os segundos de
      retomada do serverless no primeiro login do dia, mas o banco passa a cobrar o mínimo (0,5 vCore) o tempo todo nesse
      horário — medir no portal o custo de um mês com e sem, e só então decidir. A opção gratuita (um `curl` por GitHub
      Actions a cada 15 minutos em horário de uso, como o aquecimento que `rotinas-diarias.yml` já faz às 7h) fica
      documentada como alternativa. *O número (07/10/2026, com o preço medido em 06/10 — ≈ R$ 5,25 por vCore-hora
      no mínimo de 0,5 vCore):* banco acordado das 6h às 23h = 17 h × 0,5 vCore × R$ 5,25 × 30 dias ≈ R$ 1.340 por
      mês, o dobro do teto inteiro (US$ 120 ≈ R$ 650). Hoje, com a vD.5, o banco só acorda quando alguém usa o
      sistema ou nas rotinas das 7h: de 6-7 reais por dia pausado até ≈ R$ 2,60 por despertar. A recomendação é
      **não** manter acordado; os segundos de retomada no primeiro acesso do dia são o preço de pagar só o uso.*
- [x] **Anexos com rede de segurança**: exclusão suave (soft delete) e versionamento de blob na conta
      `ieadespaarmazenamento` (anexos da vB.4, fotos, documentos) — *feito em 06/10:* a exclusão suave já existia
      com 7 dias; agora 30 dias, com versionamento de blob e exclusão suave de contêiner (30 dias) ligados.
      Custo: só o espaço das versões (centavos neste volume).
- [ ] *(adiado pelo responsável em 07/10/2026 para outra rodada — nada é apagado nem desligado no ensaio: restaura-se
      a cópia de segurança numa cópia temporária e separada do banco, mede-se o tempo e apaga-se a cópia)*
      **Ensaio semestral de restauração** (banco + anexos) registrado na tabela da `HOMOLOGACAO.md`, com o tempo
      medido — e um lembrete pelo motor de notificações (vB.2) 30 dias antes de vencer, pra Secretaria Geral.
- [x] **Rotação de segredos com procedimento escrito** no `SECRETS.md`: `AUTH_SECRET` (derruba todas as sessões —
      avisar antes), `CRON_SECRET`, `CHAVE_SITE_SISTEMA` e as chaves `age` do SOPS; periodicidade anual ou a qualquer
      suspeita; checklist de 6 passos que qualquer sessão futura consegue seguir. *Feito em 08/10/2026: seção 10 do
      `SECRETS.md`, um quadro por segredo (onde vive, o que a troca derruba, como conferir) e o checklist; a troca de
      07/10 (token do Directus e chave do telefone) é o exemplo já executado.*
- [x] Alerta quando a rotina diária (`rotinas-diarias.yml`) falhar — *feito em 07/10:* job `avisar-falha` manda
      e-mail (ACS) para `presidente@ieadespa.org` sempre que uma das três rotinas falhar, com o link da execução;
      antes o GitHub só avisava quem fez o último commit.
- [x] **Sincronização da agenda do site sem acordar o banco à toa** (achado de 06/10/2026, `HOMOLOGACAO.md`):
      `site-agenda-sync.yml` rodava a cada 20 min e por isso o banco de produção nunca pausava (R$ 65-86 por dia
      contra R$ 6-7 pausado). Já reduzido a 3 vezes por dia. Desenho definitivo **sem token pessoal** (o responsável
      não quer operar a tela de tokens do GitHub): o sistema, ao homologar evento ou mudar a grade litúrgica, grava
      a versão da agenda num arquivo público e barato fora do banco (um blob no Storage); o fluxo do GitHub passa
      a ler esse arquivo a cada 15 min (como o `site-conteudo-sync.yml` já faz com o Directus) e só chama a API
      do sistema quando ele mudou. Zero despertar à toa, zero token. *Feito em 07/10/2026, com um ajuste no
      desenho: a versão fica num blob privado e `GET /api/agenda-publica/versao` responde por ele sem abrir o banco
      (a rota continua a mesma, o fluxo só voltou a rodar a cada 15 min); o sistema regrava o blob a cada mudança
      em calendário/canais/eventos (gancho na entrada única, `shared/agendaPublicaVersao.js`) e a rotina diária das
      7h regrava por garantia (`POST agenda-publica/atualizar-versao` com o segredo das rotinas).*
- [x] **Orçamento com alerta no Azure** (Cost Management budget): aviso por e-mail ao passar de 50 %, 80 % e 100 % de
      US$ 150 no mês — o salto de outubro só foi visto porque alguém perguntou. Custo zero. *Feito em 06/10/2026 e
      conferido em 08/10: orçamento `ieadespa-teto-mensal`, R$ 650 por mês (o teto passou a US$ 120), avisos em 50 %,
      80 % e 100 % (real e previsto) para o grupo de ação `ieadespa-alertas` → `presidente@ieadespa.org`.*

*Esforço:* baixo. *Risco:* nenhum pro código. *Depende de você:* tudo que é no Azure roda em **modo manual** (o modo
automático bloqueia mudança em produção, como em 03/10/2026) e a decisão de custo do banco acordado é sua.

## vD.6 — Celular de verdade pro membro (parte da v10.3 trazida pra frente)

O membro entra pelo celular (matrícula + PIN, PWA instalável) — e encontra telas desenhadas pro notebook. A classe
`.rolagem-tabela` (rolagem lateral) existe e está em 129 tabelas do `index.html`, mas das **213 tabelas que o
`script.js` gera**, só 23 a usam: no telefone, a maioria corta a última coluna sem aviso. A v10.3 previa só isso, no fim
do roteiro; o membro já usa hoje.

- [x] Toda tabela rola de lado no telefone — *feito em 06/10 sem tocar em markup:* regra de CSS só até 640 px
      (`.tabela-frequencia` vira bloco rolável e as células não quebram linha); no notebook nada muda. A função
      única de montar tabela fica para a vD.2.
- [x] As telas do membro revisadas em **360 px** — *feito em 07/10, na homologação, com um membro fictício entrando
      de verdade (PIN provisório gerado pela dirigente fictícia, PIN criado, Meu Painel):* o problema real era a
      **barra lateral fixa de 230 px**, que deixava ~130 px para o conteúdo (texto quebrando palavra por palavra,
      sino e ajuda fora da tela). Agora, até 640 px, a barra vira **gaveta** (fechada por padrão, ☰ no cabeçalho,
      fecha ao escolher uma aba ou tocar fora) e o cabeçalho quebra linha. Medido tela a tela (Perfil, Dados,
      Vínculos, Contribuições, LGPD, Cartas, Escalas, Eventos, Segurança): **0 px de rolagem lateral** em todas;
      tabelas rolam dentro de si. Capturas em `docs/plano/capturas/vD.6/`.
- [x] Os mesmos testes da vD.1 rodando também em janela de celular (360×740) pro perfil **membro** — regressão de
      layout vira erro de CI, não reclamação. (Depende de o equipamento aceitar viewport por perfil.) *Feito em
      07/10/2026: `rodar.js --celular` abre o navegador em 360×740 e o retrato de cada ação passa a trazer a rolagem
      lateral da página em px (0 numa tela que cabe), comparada como campo próprio; o fluxo de testes de tela ganhou
      um segundo trabalho (`celular`) com o perfil membro e plano próprio. Primeira rodada local: 615 ações
      descobertas no celular, 127 no modo rápido, 127 iguais à base, 0 divergência, 0 violação de CSP, rolagem lateral
      0 px em todas as telas do membro — o mesmo que a revisão manual da vD.6 tinha visto.*
- [x] *(decisão registrada: nada a fazer agora)* O que é só da liderança (Financeiro, Disciplina, Catálogos) fica como está até a v10.3/v10.1.3 — não é o que o
      membro usa, e redesenhar tudo agora é a FASE 10.

*Esforço:* baixo a médio. *Risco:* baixo. *Depende de você:* nada.

## vD.7 — Domínio raiz: o site passa a ser `ieadespa.org.br`, e `www` vira só redirecionamento

Pedido do responsável (06/10/2026): trabalhar no domínio raiz, sem `www`. A ideia inicial era copiar a zona DNS da
Microsoft para outro provedor pra conseguir o raiz. **Conferido no Azure e no DNS: não precisa mover nada.** A zona
`ieadespa.org.br` mora no DNS do Microsoft 365 (`ns1-4.bdm.microsoftonline.com`); o raiz **já aponta** pro site
(registro A `20.36.155.75`) e **já está cadastrado e validado** como domínio do Static Web App `site-institucional`
(status `Ready`), ao lado de `www.ieadespa.org.br`. Hoje o raiz responde `301` mandando pra `www` só porque o `www`
está marcado como domínio padrão no Azure. Ou seja: o trabalho é inverter o padrão e trocar o nome em meia dúzia de
lugares, não migrar DNS. Mover a zona pra fora da Microsoft não ajuda em nada aqui e ainda cria risco de e-mail
(os registros MX/SPF/DKIM do Microsoft 365 vivem nessa mesma zona).

- [x] *Feito em 08/10/2026 (o responsável antecipou: até segunda-feira o site pode mudar à vontade), em modo manual, pela
      linha de comando e não pelo portal:* a API do Azure aceita `PUT …/staticSites/site-institucional/customDomains/<domínio>`
      com `{"properties":{"isDefault":…}}` sem revalidar o domínio (PATCH não existe) — primeiro `www` com `isDefault:false`,
      depois o raiz com `true`. Resultado imediato: raiz `200`, `www` → `301` para o raiz, certificado válido, DNS intocado.
      **Só depois de 17/10/2026** (fim dos pedidos de camiseta) e num horário de pouco acesso: no portal do Azure,
      `Custom domains` do `site-institucional`, marcar `ieadespa.org.br` como **default** — o `www` passa a
      redirecionar `301` pro raiz, sem tocar DNS, sem indisponibilidade (modo manual).
- [x] *Feito em 08/10/2026 (PR #22, 17 ocorrências, mesclado logo depois da troca do padrão):* No site: `siteUrl` em `site/src/config/site.ts` (hoje `https://www.ieadespa.org.br`) vira o raiz — é a origem
      do `<link rel="canonical">`, do sitemap, dos links do certificado (`site/src/lib/certificado.ts`) e da
      programação (`site/src/lib/programacao.ts`). Os três fluxos do GitHub que leem o site (`site-agenda-sync.yml`,
      `site-content-notifications.yml`, `site-event-notifications.yml`) trocam `SITE_URL` junto, no mesmo commit.
- [x] *Conferido em 08/10/2026: varredura das 36 coleções do Directus — nenhum texto cita `www.ieadespa.org.br`.*
      Directus: configurações e textos que citam `www` (links de e-mail, páginas de camiseta, QR já impresso)
      revisados; QR e link já distribuídos continuam funcionando pelo redirecionamento — por isso o `www` **nunca**
      é removido do Azure nem do DNS.
- [ ] Google Search Console: propriedade do raiz e mudança de endereço; verificar depois que `www` → raiz responde
      `301` e que o certificado TLS do raiz (gerido pelo Azure) está válido.
- [x] Sistema (`app.ieadespa.org.br`) **não muda**: é subdomínio próprio, com o seu Static Web App. *(Confirmado em
      08/10/2026: só o site trocou de endereço.)*

*Esforço:* baixo (1 sessão). *Risco:* baixo — tudo reversível desmarcando o padrão. *Depende de você:* a janela
(depois de 17/10) e a mudança no portal em modo manual. *Custo:* R$ 0.

## vD.8 — Blindagem de camisetas e eventos do site para pico *(emergência de 06/10/2026)*

Pedido do responsável no dia do incidente (ver vB.17): *"blindar camisetas e eventos; o sistema tem que aguentar
um pico de pelo menos 5 mil pessoas; se tirar o ativo, para; a data é a segunda forma; isso nunca mais pode
acontecer"*. Feito e conferido em produção no mesmo dia. **O que travou no pico** (1.083 pedidos em 4 horas,
picos de 17 por minuto): (1) cada pedido e cada "Meus pedidos" baixava **todos** os pedidos e rodava scrypt
(50 ms) em cada um — 39 s por consulta medidos; (2) o limitador do Directus (25 chamadas/s por IP, e todo o
site chega de poucos IPs) devolvia erro, que a rota lia como "sem lote" e criava lotes; (3) a campanha
desativada continuava aceitando pedido, porque a regra de aberto/fechado só existia na página estática.

- [x] **Chave de busca do telefone** (`telefone_chave`, HMAC-SHA256 com segredo `TELEFONE_CHAVE_SEGREDO` só do
      servidor, campo indexado em `camiseta_pedidos` e `inscricoes_eventos`): achar "este telefone já pediu?"
      e "Meus pedidos" virou um filtro de igualdade (~0,5 s), não uma varredura. Pedido antigo (sem chave) é
      achado por telefone + nome (poucos candidatos, scrypt só neles) e reindexado na hora.
- [x] **Aberto/fechado mora na API** (`janela.js`): `ativo` manda acima de tudo; `pedidos_ate`/`inscricoes_ate`
      é o último dia **inclusive, em Brasília** (antes a página fechava um dia antes, em UTC). Rotas
      `status-camiseta/{id}` e `status-inscricao/{id}` (cache 20 s): a página pergunta ao abrir e esconde o
      formulário na hora; um `403` da gravação também esconde. Não depende mais de remontar o site.
- [x] **Pedido de camiseta em 3 idas ao Directus** (eram 7): campanha em cache 10 s, duplicado e lote aberto
      em paralelo, pedido + itens + respostas numa gravação só (criação aninhada). Lote nunca nasce de erro de
      consulta; corrida de dois lotes resolvida pelo menor id.
- [x] **Inscrição em evento inteira no servidor** (`criar-inscricao`): prazo, vagas (mesmo critério do painel),
      lista de espera, aprovação, grupo só se permitido, faixa de valor validada, cupom conferido e contado
      no servidor, no máximo 10 inscrições por telefone por evento, todas as pessoas do grupo numa gravação.
      **Permissões públicas de escrita removidas do Directus** (criar inscrição e resposta; alterar usos do
      cupom) — antes qualquer pessoa podia chamar isso à mão.
- [x] **"Meus pedidos" mostra a retirada** (local, mensagem e data de separado): 1 em cada 4 pedidos de 06/10
      não tinha e-mail, e a página é o que a pessoa abre com o telefone.
- [x] **WhatsApp a partir do painel (07/10/2026):** o responsável quer falar com quem pediu, e 3 em 4 pedidos
      não têm e-mail. Até aqui o telefone existia só como hash e chave de busca — nenhum dos dois volta ao
      número, então o sistema **não tinha como** mandar nada. Decisão (do responsável, ao pedir a mensagem):
      o número completo passa a ser guardado **cifrado** (AES-256-GCM, chave derivada do segredo do servidor;
      quem lê o Directus vê só o cifrado) nos pedidos e inscrições novos, e um pedido antigo ganha o cifrado
      no momento em que é achado em "Meus pedidos" (único instante em que o número está em mãos). No painel,
      cada pedido tem o botão **WhatsApp**: a API do site (`telefone-pedido/{id}`) só devolve o número a quem
      está logado no painel (prova: o token da pessoa precisa enxergar o pedido no Directus) e o navegador
      abre o WhatsApp com a mensagem pronta (texto de retirada da campanha, itens e local). Sem API paga de
      mensagens: é o link oficial `wa.me`, a pessoa da equipe aperta "enviar". Pedidos de antes de 07/10 sem
      consulta em "Meus pedidos" respondem "telefone não guardado". A lista de campanhas do painel ganhou o
      atalho "Pedidos, lotes, filtros e planilha Excel".
- [x] **Directus:** limitador por IP de 25 para 150 chamadas/s; histórico de revisões (`accountability`)
      reduzido a "activity" em pedidos, itens, respostas e inscrições.
- [x] Lotes do incidente juntados no lote 1 (1.083 pedidos) e os cinco lotes criados por engano apagados —
      nenhum pedido apagado (ordem do responsável).
- [x] **Provas em produção (06/10):** 17/17 verificações de camisetas e 16/16 de eventos, com grupos e evento
      de teste criados e apagados; carga de 36 pedidos com 12 conexões: 36/36 gravados, sem erro, 2,6 pedidos/s (mediana 3,4 s de espera, máximo 7,6 s); status a
      40 conexões: ~200 req/s, 157 ms de mediana, zero erro.
- [x] **Homologação do site, de graça** (noite de 06/10): branch `homolog-site` + PR #18 (não fechar) =
      ambiente de pré-visualização do Static Web App (`salmon-bay-0efd06d0f-18.eastus2.3.azurestaticapps.net`)
      com as mesmas configurações da produção. As baterias de teste entraram no repositório
      (`site/scripts/testes/`, ver o README de lá) e o fluxo `site-testes.yml` as roda sozinho depois de cada
      montagem do site: contra a pré-visualização quando o push é no `homolog-site`, contra a produção quando
      é na `main`. Não há Directus de homologação (custo): os testes gravam itens descartáveis ("teste-…",
      ignorados pela versão do conteúdo) no Directus de produção e apagam tudo no fim.
- [x] **Módulo de camisetas, pedido do responsável (noite de 06/10):** "Meus pedidos" com o andamento
      (recebido → encomendado à malharia quando o lote fecha → chegou e separado → retirado) e o que falta
      pagar; painel com filtros combináveis como no Excel (tamanho, modelo, separado, e-mail, congregação,
      lote, situação de pagamento, busca por nome/e-mail/número, pergunta) com contagem de peças por tamanho ×
      modelo do filtro atual; **exportação em Excel** (uma linha por item, aba de resumo por tamanho, uma
      coluna por pergunta; SheetJS servido de dentro); **troca de lote** direto no cartão do pedido, com os
      números dos lotes fechados envolvidos (vendido, arrecadado, saldo) recalculados — o pago à malharia e
      o "pedido pelo sistema" congelado não mudam; e a sessão do painel que **se renova sozinha** (token
      vencido em 15 min era a "desconectar e entrar de novo").

**O limite que ficou, medido:** o Directus grava **um de cada vez** — plano B1 (1 núcleo) foi a 88-98 % de CPU
com 6 gravações em paralelo, PostgreSQL a 8 %. Capacidade medida depois de todas as otimizações: ~2,6 pedidos por
segundo (≈ 150 por minuto; o pico de 06/10 foi 17 por minuto). Acima disso ninguém recebe erro: espera na fila
(12 pedidos ao mesmo tempo = 3 a 8 s cada). Para mais que isso, duas opções, à decisão do responsável:

- **Decisão do responsável (06/10/2026): nenhum gasto novo agora.** A capacidade atual (≈ 150 pedidos por
  minuto, 9 vezes o pico de 06/10) é suficiente; o que segue fica registrado como opção, não como pendência:
  - *Plano do Directus B1 → B2 ou P0v3* (≈ +US$ 13 a 60/mês): descartado por custo.
  - *API do site num Function App próprio em Brazil South*, **sem** instância sempre pronta (Flex Consumption
    paga por uso: perto de zero neste volume): corta os ~150 ms de cada ida ao Directus e a partida a frio de
    15-30 s. Só vale tentar **depois de 17/10** (site congelado) e só porque pode ser de graça; se o Azure
    recusar a ligação (mesmo defeito de 20/09 no sistema), apaga-se e nada é cobrado. O gargalo de gravação
    (CPU do Directus) não muda com isso.
- [ ] **Teste de carga maior, de vários lugares** (GitHub Actions, IPs diferentes), depois da decisão acima —
      o teste de hoje saiu de uma máquina só e esbarra no próprio limite por IP da API (40 em 5 min).
- [x] **Painel de camisetas:** o token do Directus vence em 15 min e o painel não renovava (é a "desconectar e
      entrar de novo" de 06/10) — feito na noite de 06/10 (`fetchComSessao` em `painelAuth.ts`: num 401
      renova pelo cookie e repete; aplicado nas três telas do painel de camisetas).
- [x] **Aviso de retirada em massa (08/10/2026, pedido do responsável — PR #23):** com 1.083 pedidos (805 com e-mail,
      278 sem) avisar um por um não dá. O painel do grupo ganhou "As camisetas chegaram — liberar a retirada para
      todos" (a página "Meus pedidos" passa a dizer "Chegou! Pode vir buscar" para TODO pedido do grupo, pelo telefone,
      mesmo antes de separar) e "Enviar aviso a todos" (e-mail de "pode retirar" a quem tem e-mail e ainda não foi
      avisado, em lotes de 40, com progresso; `simular` só conta). Campos novos no Directus
      (`camiseta_grupos.retirada_liberada`, `camiseta_pedidos.aviso_retirada_em`); rota `avisar-retirada-camisetas` só
      com sessão do painel. Limite honesto: os 278 sem e-mail só veem pelo site (o telefone deles é só hash desde 06/10 —
      o número não é recuperável): avisar também pelos canais da igreja.
- [x] **Trocar dois segredos (depende de você — modo manual):** *feito em 07/10/2026 à tarde, em modo manual:
      contagem antes (1.083 pedidos: 7 com a chave velha do telefone, nenhum com telefone cifrado — a cifra é de hoje e o
      lote estava fechado); as 7 chaves foram zeradas (recalculam na próxima consulta), os valores novos entraram nos
      dois Static Web Apps, no Directus (token do usuário administrador), nos segredos do GitHub e nos arquivos
      cifrados do repositório; os três ambientes de preview órfãos (sistema `18`; site `1` e `18`) foram apagados no
      mesmo ato. Roteiro reutilizável: gerar → contar → rechavear → trocar-azure → trocar-directus → trocar-github →
      concluir → conferir, sem imprimir valor nenhum.* Histórico: na noite de 06/10, uma mensagem de erro do
      Azure imprimiu no registro da sessão o token de administrador do Directus e a chave do telefone. A
      troca automática foi bloqueada pelo controle de permissões (gravação em cofre de segredos). Passos, já
      prontos: gerar os dois valores novos; `PATCH /users/{id}` no Directus com o token novo; gravar os dois
      nas configurações do site no Azure (produção e ambientes 1 e 18); `gh secret set` dos dois no GitHub;
      atualizar `site/secrets.env` (SOPS); zerar `telefone_chave` em `camiseta_pedidos` e
      `inscricoes_eventos` (são recalculadas na próxima gravação/consulta). Até lá, o risco é só o registro
      local da sessão nesta máquina.
- [x] **Directus → site sem token pessoal** (06/10/2026): o Flow "Publicar site (avisar GitHub)" usava um
      token pessoal do GitHub que venceu em silêncio (401; última remontagem automática em 01/10 — de 01 a
      06/10 nenhuma edição no Directus chegou ao site sozinha). O responsável não quis criar outro token na
      tela do GitHub. Substituído por `site-conteudo-sync.yml`: a cada 15 min calcula a versão do conteúdo
      (`site/scripts/conteudo-versao.mjs`: contagem e última alteração de 20 coleções, com o segredo do
      Directus que os avisos já usam) e, se mudou, manda montar o site e disparar os avisos de conteúdo novo
      com o token do próprio robô do repositório (`gh workflow run`), que não vence. Memória da última
      versão remontada no cache do Actions (chave `conteudo-versao-<hash>`; o robô não pode gravar variável
      do repositório, 403). Não toca na API do sistema (não acorda o banco). Provado em 06/10: a versão
      muda ao criar, editar e apagar um item e volta ao valor original; 1ª rodada remontou e guardou, 2ª
      rodada "sem mudança". O Flow do Directus ficou desativado, com a explicação na descrição dele.

## 🔒 Trava de Revisão D-B — antes de encerrar a FASE D e voltar à Trava 7-A

Ponto de parada obrigatório. Audita vD.4 a vD.8 pelas 5 perguntas, e faz a varredura final da FASE D inteira. Atenção
especial à vD.4: um segundo fator mal feito tranca o Presidente fora do sistema ou, pior, deixa um atalho que o anula —
testar o caminho de recuperação de verdade, com uma conta de teste, antes de ligar pra todo mundo. Fechada esta trava,
abre-se a 🔒 Trava 7-A e a FASE 7 segue pra v7.6.
