# Passagem de bastão — ieadespa

Em uso por: Livre

> Uma pessoa por vez. Antes de começar: `git pull` e leia a linha acima. Se estiver em uso por outra pessoa, não
> comece. Ao começar: troque pela sua (nome e data), commit e push. Ao parar: a passagem completa, a linha volta a
> "Livre", commit e push (regra 4 do `CLAUDE.md`). Este arquivo é público: nada de senha, chave, token nem dado pessoal.

Atualizado em 24/11/2026 17:10 (Claude, sessão principal).

**O revisor de fora (decisão dele, 23/11, à tarde):**

- Os créditos mensais de API dos assinantes já foram resgatados por ele. São cerca de US$ 120 por mês, do plano Team de
  organização sem fins lucrativos. A página oficial diz que **não valem no Claude Code** ("Claude Code: No"), mas valem
  no **Agent SDK**. O crédito vence todo mês e não acumula. Sem cartão na organização do Console, nada é cobrado:
  acabou, para.
- **A decisão dele:**
  - um programa na **bancada** (`C:\MCP\bancada\revisor-sdk\`) roda o revisor com esses créditos, ao mesmo tempo em que
    a assinatura trabalha;
  - o primeiro serviço é **a varredura do sistema inteiro**;
  - **os relatórios ficam só na bancada**, que é privada. No repositório público vai só "lote N, K achados".
  - Se der certo, a assinatura fica só com o desenhista e o construtor.
- **A ordem:** (1) ele cria a chave no Console, sem cartão e sem recarga automática; (2) o programa mínimo e uma prova
  minúscula, para ver se o saldo de "Promotional credits" desce, se o Fable está liberado e se não há recusa; (3) só
  então o lote 1 da varredura, que serve de régua.

**Bancada, 23/11 (com o sim dele, FEITO):** `a17890c` e `76f02a8` enviados e instalados neste computador (`-Sim`):

- as habilidades `svelte-core-bestpractices`, `supabase-postgres-best-practices` (só Postgres) e
  `test-driven-development` (o `construtor` escreve o teste antes);
- 3 de LGPD adaptadas, com os documentos em `C:\MCP\bancada\lgpd\<repositório>\` (privada, nunca no repositório);
- o plugin `pyright-lsp` com o `pyright@1.1.414`;
- o caminho do Codex consertado (cópia em `C:\MCP\copias-antigas\2026-11-23-1154\`);
- a 2.2.1 do servidor de memória conferida e calada: fica a 2.1.1 até conferir a 2.2.2.

O banco do ieadespa **fica no SQL Server** (memória `banco-sql-server-fica`).

**O estudo das regras de SQL (23/11), só leitura:** deu **ganho médio**. As 9 regras estão no `api/CLAUDE.md`, na seção
"Banco (SQL Server)", e não viraram habilidade. O detalhe está em `C:\tmp\ieadespa-bancada\estudo-regras-sql.md`. Os
achados vão para o **lote 1 da varredura**, e estão também na memória do projeto, "FASE 10":

- o `db.js` sem nova tentativa e sem pool configurado;
- a tela de votar da assembleia, com consultas por pessoa;
- o sininho;
- a prévia do juntar fichas;
- o painel de distritos;
- 342 chaves estrangeiras sem índice.

**ESTADO EM 24/11 À NOITE (o dia encerrou; nenhum agente trabalhando)** — o próximo passo de cada frente:

- **Membros, volta 5: PRONTA** no ramo `v10-membros-svelte` (até `2a0f3fb`; worktree `C:/tmp/ieadespa-svelte`;
  diário `C:/tmp/ieadespa-membros/DIARIO-arrolamento.md`). Jest 6.991 verdes; e2e 36 e 96 a 102 verdes.
  - **Amanhã:** (1) levar a ele as perguntas abertas do diário (o cargo administrativo no arrolamento dá acesso? de
    qual lista? o batismo e a carta sem data; o congregado nas listas escolhidas à mão e nos órgãos; os textos novos
    sem desenho aprovado: o bloco "As linhas que faltaram", o aviso do prazo e o "Descartar a importação"); (2) com as
    respostas, o portão; (3) a mescla no homolog (o homolog tem até `f7045ab`).
- **Financeiro, telas da r30** (ramo `v10-financeiro-svelte`; worktree `C:/tmp/ieadespa-financeiro/obra`; diário
  `C:/tmp/ieadespa-financeiro/DIARIO.md`, parte 4): parado no meio, a pedido dele; o ponto exato está no diário. A
  folha inexistente já está no servidor (`06e1fd8`). **Amanhã:** continuar, depois o portão e o homolog.
- **Acesso, parte 2** (ramo `v10-acesso-ajustes-2`, `c7095fa`): o portão APROVOU para a produção. **Amanhã:** o revisor
  de fora confere os 2 pedaços (~US$ 30; hoje bateu no limite do dia) e, com o OK dele, sobe num commit só, com
  mensagem neutra, e o ramo remoto é apagado. O detalhe fica só na bancada privada.
- **Desenhista:** a **r32 (Módulo 3, o começo)** está PUBLICADA em <https://claude.ai/artifact/HYtYxyM4ysGnxhxnWiCk5o>,
  **esperando ele conferir**. Uma página nova por rodada; o banco é por página.
- **A bancada privada guarda agora o estado de cada projeto** (`C:\MCP\bancada\projetos\<repo>\`). O comep já foi
  migrado pela outra máquina. **O ieadespa migra amanhã, no começo e com os agentes parados:**
  `node C:/MCP/bancada/migrar-estado.mjs "C:\sistemas vs code\ieadespa"` (só mostra) e, com o sim dele, `--sim`.
  Depois: os comandos que ele mostra (a bancada primeiro), o `CLAUDE.md` §4 e o `AGENTS.md` no mesmo commit, e
  "Recarregar Janela".
- **Revisor de fora:** limite do dia atingido (US$ 85,68 deste computador; o teto de hoje era US$ 96). A fila: a
  infraestrutura, os menores, os módulos e o site por último. O teste do esforço (1 pedaço real no x alto contra o
  máximo) continua pendente.

A trava do LocalDB: livre.

**Decisão dele (24/11): um 2º computador com um assento Team Premium.** Pela página oficial, cada assento Premium
põe US$ 100 e cada Standard US$ 20 num **saldo único da organização**, com teto de US$ 500 por mês, e toda chave da
organização gasta desse saldo. Mudar repositórios para outro computador não cria saldo à parte. O revisor de fora
ganha uma configuração por computador (`config.local.json`, fora do Git), com os projetos de cada um e a parte do
saldo que cabe a cada um. Dois computadores nunca rodam o mesmo projeto.

**As pendências dele (24/11, 14h):** conferir a r31 na página nova; dois cliques em `C:/MCP/bancada/revisor-sdk/LIGAR-AGENDA.cmd` para ligar a agenda do revisor de fora. Antes: (1) a chave do revisor de fora: **FEITA**; (2) ver a trava: **FEITA** (ele viu a foto do
travado; a trava foi conferida pelo agente); (3) conferir a rodada 29: **FEITA** (24/11: as 7 telas aprovadas, com
ajustes; estão no plano da fase 10, em "As respostas dele à rodada 29", e foram para o desenhista da r30).

**A prova do Code Review Graph (24/11, com o sim dele): NÃO ADOTAR.** Foram 5 defeitos plantados numa cópia,
rodando 2 vezes com o mapa e 2 vezes sem. A média sem o mapa foi US$ 3,78 e com o mapa US$ 3,87, dentro do ruído; os
15% a menos não apareceram. Achou 4, 4, 4 e 5 dos 5, sem alarme falso, e o modelo quase não usou o mapa. Gastou US$
15,31, que o agente do revisor lança na conta do ciclo (~US$ 39,50 de US$ 200). O RTK não deixa ligar só o filtro de
testes, e o Headroom fica de fora. **Conclusão: nenhum dos 8 economizadores entra.** A cópia foi apagada. Relatório:
`C:/tmp/ieadespa-bancada/prova-crg/RELATORIO.md`.

**Decisões dele (23/11, 22h40):**

- **A importação de mentira na homologação fica para o ÚLTIMO PASSO**, antes da produção de Membros. O sistema de
  proteção do Claude barrou mandá-la sem o sim explícito dele. Quando chegar a hora, pedir o "pode" de novo.
- **O PLANO NOVO do revisor de fora** (aprovado por ele às 23h50, depois da medição; substitui o "só quando
  mandarem"):
  1. primeiro o código novo da FASE 10 (os ramos do Membros e do Financeiro) e, depois, cada coisa nova que o
     construtor terminar;
  2. pedaços com metade do tamanho;
  3. o Agendador do Windows liga o revisor de 4 em 4 horas, no máximo 30 minutos por vez;
  4. o crédito espalhado pelos dias do mês.
  O código antigo, o asaf e o comep ficam depois. Os 3 olhares e o máximo continuam.

O que cada frente fazia (para retomar):

1. **revisor de fora: FUNCIONANDO** (bancada até `a4fd8b3`, 105/105 testes). A chave fica num **workspace próprio**
   (`revisor-de-fora`), porque a chave pessoal sem workspace dá 400. Os plugins e as habilidades embutidas do Claude
   Code ficam desligados. O bloco comum é o mesmo nas 3 lentes, que largam em escalonado.
   - **A medição de 23/11:** uma lente completa custa ~US$ 6,27, e um pedaço inteiro ~US$ 22 a 25 (~5 por mês). A 1ª
     rodada, antes do conserto, gastou US$ 11,49 sem terminar. Gasto do ciclo: ~US$ 24.
   - **No pedaço do login apareceram 5 achados graves, ainda não conferidos.** O detalhe está só na bancada privada
     (`relatorios/ieadespa/2026-11-23-lote1-login-pin-medicao.md`), nunca aqui.
   - Listas de pedaços: 159 no total (ieadespa 74, asaf 55, comep 30), a recortar pela metade.
   - **Um agente monta o plano novo** (diferença dos ramos, `--agendado`, `LIGAR-AGENDA.cmd`, crédito por dia,
     `--conferir-relatorio`). Depois, o Claude liga a agenda e confere os 5 graves do login.
   - Em outro computador, o programa chega pela bancada, mas a chave não; só este computador roda.
   Diário: `C:/tmp/ieadespa-bancada/DIARIO-revisor-sdk.md`.
2. **construtor do Membros:** o arrolamento está **na homologação** (servidor `20681e8`, tela `2ce12bc` e `90d3122`;
   homolog `a8d03c3`, base do teste de telas `11c51ff`). Já corrigiu da revisão a aspa sem fechar (`923dd5f`), a saída
   do IMPORTANDO (`07d592d`) e o texto do site (`4741cd3`; homolog `259a737`). Agora: o menu cortado a 1280 px e a
   guarda dos dados (respostas dele: a prévia não confirmada se apaga em 7 dias, com o botão "Descartar"; a lista dos
   de fora fica 90 dias). Diário: `C:/tmp/ieadespa-membros/DIARIO-arrolamento.md`.
3. **revisor do arrolamento** (desde as 21h20): confere `58dcd0d..4741cd3` (o arrolamento e as correções) no worktree
   `C:/tmp/ieadespa-revisao` (destacado em `4741cd3`). Relatório local `C:/tmp/ieadespa-membros/REVISAO-arrolamento.md`.
4. **construtor do Financeiro** (desde as 21h20): as correções da revisão (índices, `XACT_ABORT`, os menores) e as
   regras dele de 23/11 no servidor (a devolução só de bloco cheio; desfazer a exceção da folha com motivo, só a
   Tesouraria Geral). **Sem mesclar no homolog** até o revisor conferir a tela do incremento 2 (`f722716`) e as
   correções. Diário: `C:/tmp/ieadespa-financeiro/DIARIO.md`.
5. **desenhista** (desde as 21h20): prepara a **rodada 30, sem publicar** até ele conferir a 29 (Financeiro: o
   formulário "Registrar saída", a cor da folha extraviada, o seletor de bloco no celular, os textos sem desenho, a
   recusa do bloco com folha em branco e o "Desfazer" da exceção). Worktree `C:/tmp/ieadespa-desenho-r30`, ramo
   `desenho-r30`; diário `C:/tmp/ieadespa-desenho-r30-fotos/DIARIO.md`.

**As revisões de 23/11 à noite** (relatórios locais, fora do Git):

- **Importação e trava** (até `58dcd0d`; `C:/tmp/ieadespa-membros/REVISAO-importacao-trava.md`): **ainda não vai à
  produção.** A trava está completa e nenhum defeito de segurança foi provado. Bloqueia: o ensaio da importação inteira
  na homologação (~5 mil linhas de mentira, medindo o lote), depois do "vi" dele. As outras correções estão no item 2.
- **Financeiro até `4c06d58`** (`C:/tmp/ieadespa-financeiro/REVISAO-1a-a-inc2.md`): `bd694cf` e `4c06d58` **podem ir à
  homologação**. O 1b **não vai à produção** antes da troca de janeiro de 2027 (ele esconderia as telas antigas). Na
  mesclagem do `bd694cf`, refazer o build (nunca mesclar `app/svelte` à mão) e atualizar a base do teste de telas.

**O teste de telas do CI está resolvido:** a base do homolog estava velha. `f36ccf4` (base `b34284c`) passou verde, e o
construtor já atualizou a base depois do arrolamento (`11c51ff`). **Regra:** depois de toda mesclagem que muda tela no
homolog, conferir as divergências e atualizar a base, direto no homolog.

Terminados: o **desenhista** publicou a rodada 29 (versão 11; DEPLOY OK em `15067a6`). A **pesquisa dos 8
economizadores** (o PDF dele) concluiu que nenhum vale instalar agora: rendem no máximo uns 2% sem perder qualidade, e os
que rendem mais trocam a leitura do código por resumos. Talvez mais tarde, só com teste de 5 defeitos plantados: o Code
Review Graph no revisor de fora e o RTK. Detalhe em `C:/tmp/ieadespa-bancada/pesquisa-economizadores-2.md`.

O estado de quando os agentes da tarde foram parados (cota acabando), sem nada pela metade no Git:

- **construtor:** só trouxe a `main` para o ramo (`3f8a1a5`, enviado). "Completar o arrolamento" e o ajuste do e2e-51
  NÃO começaram. Pode haver um rascunho em `C:/tmp/ieadespa-membros/aprovado-arrolamento.js` (fora do Git).
- **desenhista:** a rodada 29 ficou **PRONTA, mas NÃO publicada**. As fontes estão na `main` (`e1dc866` e `cb9ac39`):
  18 telas, 387 KB, conferência com 0 problema. A página KMeb… continua na versão 10. Diário:
  `C:/tmp/ieadespa-desenho-r29-fotos/DIARIO.md`.

**O módulo 3 já tem as respostas dele** (23/11, plano da fase, seção "Módulo 3 (Estrutura e Territórios): as respostas
dele antes do desenho"). O desenho espera Membros fechar. A regra nova de acesso vale também para Membros: o cargo
vence em 31/12 e, vencido, a pessoa perde o acesso.

## 1. Concluído

- **Produção (main):** só documentação e desenho. Nada de Membros nem de Financeiro foi à produção.
- **O padrão alto (23/11; memórias `conselheiro-e-padrao-alto` e `desenho-em-paralelo-a-construcao`):**
  - o conselheiro (`/advisor fable`) funciona no VS Code, sem créditos à parte no plano dele;
  - a bancada `ef666e8` instalada neste computador: os agentes `construtor` e `desenhista` (Opus) e `revisor` (Fable,
    só lê), e o gancho de proteção. Segredo mascarado: `node C:/MCP/bancada/mascarar.mjs <arquivo>`;
  - 3 agentes ao mesmo tempo (desenha, constrói, revisa) e, como exceção autorizada, fluxos com muitos agentes nas
    Travas e quando ajudar;
  - o plano novo da varredura de defeitos, aprovado por ele (plano da fase, seção "O jeito novo").
- **Desenho:**
  - Financeiro: núcleo aprovado nas rodadas 20 a 27.
  - **Rodada 28 PUBLICADA** (página leve KMeb…, versão 10; fontes na `main`, `06c308b` e `dc73367`; diário
    `C:/tmp/ieadespa-desenho-r28-fotos/DIARIO.md`): a auditoria ao vivo e o fechamento do mês, o lote com os números
    pulados, a família, as listas, a saída e a volta, completar o arrolamento. **Conferida por ele em 23/11** (ver o
    item 4). A pergunta do "pediu para sair" ficou respondida pelas regras novas (plano, "Rodada 28: o que ele
    aprovou").
- **Membros** (ramo `v10-membros-svelte`, `68bce84`; worktree `C:/tmp/ieadespa-svelte`), na homologação:
  - o "Quero me cadastrar" (as 4 pendências) e o banco lento (aprovado por ele);
  - o servidor do importador (migração 185, rota `api/importacao-membros`);
  - **a tela "Importar os membros do sistema pago"** (r27), só para a Secretaria Geral, e a importação deixando de fora
    a matrícula que já existe (a 1 e a 2): commits `703c76b` a `68bce84`, homolog `b34284c`, DEPLOY OK, 96/96 no teste
    completo. As respostas dele de 23/11 estão no plano, seção "A tela de importar os membros: as respostas dele".
- **Financeiro** (ramo `v10-financeiro-svelte`; worktree `C:/tmp/ieadespa-financeiro/obra`):
  - o incremento 1b na homologação (homolog `f774121`);
  - **só no ramo, fora da homologação:** `bd694cf` (a casca igual ao desenho) e `4c06d58` (o servidor do incremento
    2: as folhas, a exceção da folha, o livro, o rastreio e a devolução). A tela do incremento 2 não foi feita.

## 2. Arquivos alterados (ainda não registrados no Git)

- Nenhum. A `main` e os worktrees estão limpos e enviados.

## 3. Pendências e erros conhecidos

- **A ordem na produção (regra dele, 23/11): a importação real vem antes de qualquer matrícula nova.** A trava está
  feita e na homologação (item 4, 1.1). Ele ainda precisa vê-la.
- **O teste de telas do CI:** a causa foi achada e corrigida em `f36ccf4` (veja o alto). Falta só a rodada
  `45285926023` terminar verde. Quando o Membros for para a main, a base da main (os ramos carregam `0707967`) precisa
  ser ajustada.
- **Decisão dele, quando quiser:** pôr no CI o `tools/raio-x/varrer-padroes.js`, corrigido para enxergar `executar(`.
  Assim as regras de SQL 1 (consulta dentro de laço) e 3 (índice) viram aviso automático.
- **Membros na homologação:** falta o OK final dele para a produção. A importação só vai à produção com "completar o
  arrolamento" pronto.
- **Carteirinhas:** a do obreiro só a Secretaria Geral imprime; o QR de quem saiu mostra só o nome; testar a impressora
  de PVC; a foto de conferência dos ajustes na homologação.
- **Bancada, decisões dele:** a 2.2.2 do servidor de memória, quando sair (prevista para 25/11), conferir antes de
  qualquer troca (a 2.2.1 já foi conferida e recusada); a cláusula 5.2 do `LICENSE`; a porta do construtor (`C:\tmp\ieadespa-bancada\pronto\APLICAR.md`). O login do Claude neste
  computador vence até 24/11.
- **Risco não provado:** juntar fichas usa `DISABLE TRIGGER`, que precisa de ALTER no Azure.
- **Worktrees:** `C:/tmp/ieadespa-svelte` e `C:/tmp/ieadespa-revisao` têm junções `api/node_modules` e
  `site/node_modules`: apagar com `rmdir` sem `/s` antes de remover o worktree. Os do desenho (`C:/tmp/ieadespa-desenho-r27` e `-r28`) já podem sair; o ramo
  `v10-membros-importador-wip` também.
- **Diários** (só neste computador): `C:\tmp\ieadespa-financeiro\DIARIO.md`, `C:\tmp\ieadespa-membros\` (DIARIO,
  DIARIO-importador, DIARIO-banco-lento) e os das rodadas em `C:/tmp/ieadespa-desenho-r27-fotos/` e `-r28-fotos/`.

## 4. Próximo passo exato

**Ao voltar, nesta ordem:**

1. **A rodada 29 está PUBLICADA** (23/11 à noite; versão 11 da página <https://claude.ai/artifact/KMebnrdoWfAhcz9yeRgjFz>,
   387 KB). O banco da página ficou intacto: as 6 escolhas da r28 continuam lá. **Esperando ele conferir.** As escolhas
   dele vão para a coleção `escolhas`, com os ids `r29-*` e `geral-r29`.
2. **Ele vê a trava travada na homologação:** matrícula de teste 900007 › Membros › Fila de cadastros › Cadastro rápido
   › "Enviar para a secretaria" mostra a recusa. Depois do "vi", um agente faz a importação de mentira até o fim (o
   e2e-97 tem a planilha de mentira) para ele ver o liberado.
3. **Construtor:** o e2e-51 e completar o arrolamento (item 1.2), com o resumo da missão parada (o passo 0 já está feito).

**A rodada 28 foi conferida por ele em 23/11** (plano da fase, seção "Rodada 28: o que ele aprovou"). Ordem dele em
vigor (23/11 à noite): **4 agentes ao mesmo tempo** (veja o bloco do alto). A varredura de defeitos de segurança fica
com o revisor de fora, pelos créditos de API, não pela assinatura.

**Toda missão do construtor começa trazendo a `main` para o ramo:** as regras de SQL do `api/CLAUDE.md` (seção "Banco
(SQL Server)") ainda não estão nos ramos de Membros nem do Financeiro.

1. **Construtor, Membros** (worktree `C:/tmp/ieadespa-svelte`, ramo `v10-membros-svelte`), em missões curtas, com commit,
   homologação e DEPLOY OK a cada uma:
   1. **A trava das matrículas: FEITA** (23/11; `54ae870`, `c0e6638`, `0eac89b`; homolog `937c942`, DEPLOY OK; diário
      `C:/tmp/ieadespa-membros/DIARIO-trava.md`).
      - Sem importação `CONCLUIDA`, toda ficha nova é recusada com a mensagem "As matrículas novas só começam depois da
        importação do sistema pago.", e a importação de zero pessoas também.
      - A trava fica em `matriculasLiberadas(rq)`, em `api/shared/matriculaNova.js`, nos chamadores.
      - **Falta:** ele ver o estado travado na homologação. Depois do "vi", um agente faz a importação de mentira até o
        fim, para ele ver o liberado.
      - O e2e-51 (linha 192) espera 403 e agora recebe 409. Ajustar na próxima missão.
   2. **Completar o arrolamento** (r28): a congregação, **a área e a Geral** completam e editam (conferir o
      `escopoRotas`).
   3. **A família** (r28) e **as listas inteligentes** (r28; **exportar PDF ou planilha, só a Geral**).
   4. **O revisor** confere a importação (homolog `b34284c`; `703c76b` a `68bce84`), a trava e o arrolamento.
   5. **A ida de Membros à produção:** o construtor escreve o plano (as migrações, a permissão ALTER para juntar
      fichas, a importação real e depois a liberação das matrículas, como desfazer) e **para**. Só com o sim dele, depois
      de ver na homologação.
   6. **Depois, o Financeiro:** o teste de telas do CI; `bd694cf` e `4c06d58` para a homologação; as abas Folhas e
      Livro; o lote da gráfica (r27); a chegada do lote e o fechamento do mês (r28).
2. **Desenhista:**
   - a rodada 29 está pronta (publicar: veja o passo 1 acima);
   - as dúvidas do módulo 3 já foram respondidas por ele;
   - quando ele conferir a 29, os acertos vão para a 30. O desenho do módulo 3 só começa quando Membros fechar.
   - **Para a construção da movimentação**, o código muda, não só a tela: sair na hora, cargos vagos na hora e o
     apagamento aos poucos e sozinho. Plano, "Rodada 28", item "Para a construção".
