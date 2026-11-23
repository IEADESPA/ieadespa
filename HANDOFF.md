# Passagem de bastão — ieadespa

Em uso por: Mateus desde 23/11/2026 08:48

> Uma pessoa por vez. Antes de começar: `git pull` e leia a linha acima. Se estiver em uso por outra pessoa, não
> comece. Ao começar: troque pela sua (nome e data), commit e push. Ao parar: a passagem completa, a linha volta a
> "Livre", commit e push (regra 4 do `CLAUDE.md`). Este arquivo é público: nada de senha, chave, token nem dado pessoal.

Atualizado em 23/11/2026 15:10 (Claude, sessão principal).

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

**Agentes trabalhando agora (desde 23/11 15:05), 2 ao mesmo tempo.** As perguntas dos dois foram respondidas por ele
às 16h (plano da fase: "A tela de importar os membros", item da trava, e "Rodada 28", respostas antes da r29):

- **construtor**, construindo a trava das matrículas (item 1.1 abaixo), já com a `main` no ramo (`fb2c8a5`). É a trava
  simples: sem importação `CONCLUIDA`, nenhuma ficha nova por caminho nenhum, e a importação com zero pessoas é
  recusada. Ele mescla no homolog e **para**. Ele (o responsável) vê o estado travado; só depois o agente faz a
  importação de mentira para mostrar o liberado. Worktree `C:/tmp/ieadespa-svelte`, ramo `v10-membros-svelte`. Diário:
  `C:/tmp/ieadespa-membros/DIARIO-trava.md`.
- **desenhista**, desenhando e publicando a rodada 29, a movimentação refeita. Worktree `C:/tmp/ieadespa-desenho-r29`,
  ramo `desenho-r29`. As 10 perguntas do módulo 3 estão prontas em
  `C:/tmp/ieadespa-desenho-r29-fotos/duvidas-modulo3.md`, para levar a ele quando Membros fechar, poucas de cada vez.
  Diário: `C:/tmp/ieadespa-desenho-r29-fotos/DIARIO.md`.

Se a conversa cair, confira os diários e o `git log` dos dois ramos antes de mandar de novo.

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

- **A ordem na produção (regra dele, 23/11): a importação real vem antes de qualquer matrícula nova.** Falta a trava
  no código: nada gera matrícula antes da importação concluída, em todos os pontos que chamam `proximaMatricula`
  (`api/shared/preCadastroDb.js` e os 3 de `api/GestaoPessoas/index.js`). Sem ela, Membros não vai à produção.
- **Decisão dele, quando quiser:** pôr no CI o `tools/raio-x/varrer-padroes.js`, corrigido para enxergar `executar(`.
  Assim as regras de SQL 1 (consulta dentro de laço) e 3 (índice) viram aviso automático.
- **Membros na homologação:** falta o OK final dele para a produção. A importação só vai à produção com "completar o
  arrolamento" pronto.
- **O teste de telas do CI falhou no homolog `f774121`** (o 1b do Financeiro escondeu o menu antigo). Provável remédio:
  atualizar a base `tools/csp-e2e/base/commit.txt`, como foi feito no Membros; conferir antes.
- **Carteirinhas:** a do obreiro só a Secretaria Geral imprime; o QR de quem saiu mostra só o nome; testar a impressora
  de PVC; a foto de conferência dos ajustes na homologação.
- **Bancada, decisões dele:** a 2.2.2 do servidor de memória, quando sair (prevista para 25/11), conferir antes de
  qualquer troca (a 2.2.1 já foi conferida e recusada); a cláusula 5.2 do `LICENSE`; a porta do construtor (`C:\tmp\ieadespa-bancada\pronto\APLICAR.md`). O login do Claude neste
  computador vence até 24/11.
- **Risco não provado:** juntar fichas usa `DISABLE TRIGGER`, que precisa de ALTER no Azure.
- **Worktrees:** `C:/tmp/ieadespa-svelte` tem junções `api/node_modules` e `site/node_modules`: apagar com `rmdir`
  sem `/s` antes de remover o worktree. Os do desenho (`C:/tmp/ieadespa-desenho-r27` e `-r28`) já podem sair; o ramo
  `v10-membros-importador-wip` também.
- **Diários** (só neste computador): `C:\tmp\ieadespa-financeiro\DIARIO.md`, `C:\tmp\ieadespa-membros\` (DIARIO,
  DIARIO-importador, DIARIO-banco-lento) e os das rodadas em `C:/tmp/ieadespa-desenho-r27-fotos/` e `-r28-fotos/`.

## 4. Próximo passo exato

**A rodada 28 foi conferida por ele em 23/11** (plano da fase, seção "Rodada 28: o que ele aprovou"). Ordem nova dele:
**2 agentes ao mesmo tempo, o desenhista e o construtor**. O revisor confere antes da produção, no lugar do construtor,
nunca como terceiro agente. A varredura de defeitos de segurança espera ("questões secundárias").

**Toda missão do construtor começa trazendo a `main` para o ramo:** as regras de SQL do `api/CLAUDE.md` (seção "Banco
(SQL Server)") ainda não estão nos ramos de Membros nem do Financeiro.

1. **Construtor, Membros** (worktree `C:/tmp/ieadespa-svelte`, ramo `v10-membros-svelte`), em missões curtas, com commit,
   homologação e DEPLOY OK a cada uma:
   1. **A trava das matrículas:** nada gera matrícula nova antes de a importação do sistema pago terminar, e ela libera
      sozinha no fim da importação. Os pontos: o aceite em `api/shared/preCadastroDb.js` e os 3 de
      `api/GestaoPessoas/index.js` que chamam `proximaMatricula`. **Cuidado:** `api/shared/importacaoMembrosDb.js`
      (~linha 333) também chama `proximaMatricula`, para as linhas sem número. A trava vai nos chamadores, nunca dentro
      de `proximaMatricula`, senão barra a própria importação. A ficha que chega no meio fica na fila sem número, e a
      tela explica.
   2. **Completar o arrolamento** (r28): a congregação, **a área e a Geral** completam e editam (conferir o
      `escopoRotas`).
   3. **A família** (r28) e **as listas inteligentes** (r28; **exportar PDF ou planilha, só a Geral**).
   4. **O revisor** confere a importação (homolog `b34284c`; `703c76b` a `68bce84`), a trava e o arrolamento.
   5. **A ida de Membros à produção:** o construtor escreve o plano (as migrações, a permissão ALTER para juntar
      fichas, a importação real e depois a liberação das matrículas, como desfazer) e **para**. Só com o sim dele, depois
      de ver na homologação.
   6. **Depois, o Financeiro:** o teste de telas do CI; `bd694cf` e `4c06d58` para a homologação; as abas Folhas e
      Livro; o lote da gráfica (r27); a chegada do lote e o fechamento do mês (r28).
2. **Desenhista, rodada 29:** (1) a **movimentação refeita** pelas regras novas dele: o membro sai sozinho pelo
   aplicativo, com a carta em PDF; ninguém confirma; os cargos ficam vagos; a secretaria só no "não sabe usar" e no
   abandono; o apagamento a partir de 30 dias; o que fica para sempre. (2) O **levantamento das dúvidas do módulo 3**
   (Estrutura e Territórios), para perguntar a ele **antes** de desenhar. Publicar na página leve KMeb…: ele já
   terminou de comentar a 28.
