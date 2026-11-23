# Passagem de bastão — ieadespa

Em uso por: Mateus desde 23/11/2026 16:50

> Uma pessoa por vez. Antes de começar: `git pull` e leia a linha acima. Se estiver em uso por outra pessoa, não
> comece. Ao começar: troque pela sua (nome e data), commit e push. Ao parar: a passagem completa, a linha volta a
> "Livre", commit e push (regra 4 do `CLAUDE.md`). Este arquivo é público: nada de senha, chave, token nem dado pessoal.

Atualizado em 23/11/2026 20:40 (Claude, sessão principal).

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

**4 agentes trabalhando desde as 19h10 de 23/11** (ordem nova dele: 4 ao mesmo tempo). Às 19h54 a atualização do
Windows reiniciou o notebook; os agentes foram retomados às 20h05, sem perda. Se a conversa cair, confira os diários
antes de mandar de novo:

1. **revisor de fora: PRONTO** na bancada (`C:\MCP\bancada\revisor-sdk\`, commits até `904edfa`, 90/90 testes),
   genérico para todos os repositórios. **Esperando a chave dele:** no Console, conferir sem cartão e sem recarga
   automática; criar uma chave de API comum (`sk-ant-api…`); dois cliques em `GUARDAR-CHAVE.cmd`, colar e Enter (fica
   cifrada em `C:\MCP\segredos\revisor-api.age`). Depois, o Claude roda `node C:/MCP/bancada/revisor-sdk/revisar.mjs
   --prova` (só vale "PROVA PASSOU"), e a 1ª rodada real é com `--proximo`, lendo o `gastos.csv`. Fable 5.2 em tudo,
   sem cartão, teto de US$ 16 por pedaço, as regras do projeto no pedido (o `settingSources: []` não lê CLAUDE.md).
   Os relatórios vão para o repositório privado da bancada (decisão dele). Diário:
   `C:/tmp/ieadespa-bancada/DIARIO-revisor-sdk.md`.
2. **construtor:** o e2e-51 FEITO (`58dcd0d`) e o servidor do arrolamento FEITO (`20681e8`, jest 6842 verdes,
   e2e-98 92/92); agora a tela (o Painel com o 4º grupo e a tela Completar), os pares e a homologação. Diário:
   `C:/tmp/ieadespa-membros/DIARIO-arrolamento.md`.
3. **revisor: TERMINOU** a importação e a trava (até `58dcd0d`): **ainda não vai à produção.** A trava está completa e
   nenhum defeito de segurança foi provado (jest 6.783 verdes; e2e 96, 97, 51, 85, 90, 93 e 95 verdes). O que falta,
   na fila do construtor depois do arrolamento:
   - **bloqueia:** a importação nunca rodou inteira num banco Azure de verdade. Falta o ensaio na homologação com ~5
     mil linhas de mentira, medindo o tempo de cada lote, depois do "vi" dele sobre a trava;
   - **importante:** uma aspa sem fechar no arquivo faz pessoas sumirem da prévia sem aviso
     (`api/shared/importacaoMembros.js`, `lerCsv`);
   - a importação presa em IMPORTANDO se um lote falhar sempre (precisa poder retomar); o texto do site com "sistema
     pago" (o visitante passa a ler "O cadastro pelo site abre em breve…"); o item do menu cortado a 1280 px;
   - **esperando ele:** o prazo de guarda da prévia abandonada e da lista dos que ficaram de fora (LGPD).
   Relatório local `C:/tmp/ieadespa-membros/REVISAO-importacao-trava.md` (fora do Git). O worktree
   `C:/tmp/ieadespa-revisao` fica para a revisão do arrolamento (só a diferença desde `58dcd0d`).
4. **construtor do Financeiro** (desde as 20h15): a tela do incremento 2 (as abas Folhas e Livro, r17 op. 1) só no
   ramo `v10-financeiro-svelte` (worktree `C:/tmp/ieadespa-financeiro/obra`), **sem mesclar no homolog** (o Membros vai
   primeiro). Diário: `C:/tmp/ieadespa-financeiro/DIARIO.md`.

**O teste de telas do CI: causa achada e corrigida** (diagnóstico em `C:/tmp/ieadespa-ci-telas-DIAGNOSTICO.md`). A base
do homolog estava velha (`ae7f2e3`), depois de duas mudanças de tela de propósito (o 1b do Financeiro e a entrada da
importação). Correção `f36ccf4`, direto no homolog (base = `b34284c`), no padrão do `e5fe087`. A rodada `45285926023`
refaz a base (1h20 a 1h40); até ela acabar, nenhum push no homolog que mexa em `app/`. **Regra:** depois de toda
mesclagem que muda tela no homolog, conferir as divergências e atualizar a base, direto no homolog.

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
