# Passagem de bastão — ieadespa

Em uso por: Mateus desde 23/11/2026 08:48

> Uma pessoa por vez. Antes de começar: `git pull` e leia a linha acima. Se estiver em uso por outra pessoa, não
> comece. Ao começar: troque pela sua (nome e data), commit e push. Ao parar: a passagem completa, a linha volta a
> "Livre", commit e push (regra 4 do `CLAUDE.md`). Este arquivo é público: nada de senha, chave, token nem dado pessoal.

Atualizado em 23/11/2026 10:45 (Claude, sessão principal).

**Em andamento, só leitura (pedido dele de 23/11, antes de recarregar a janela):** dois agentes de pesquisa. Um confere
se a versão 2.2.1 do servidor de memória pode trocar a 2.1.1 (detalhe em
`C:\tmp\ieadespa-bancada\conferencia-servidor-memoria-2.2.1.md`). O outro procura habilidades oficiais e confiáveis
para a bancada (detalhe em `C:\tmp\ieadespa-bancada\pesquisa-habilidades-23-11.md`). Nada se instala sem o sim dele.
Recarregar a janela só depois que os dois terminarem (a recarga mata os agentes). Se pararem no meio, relançar com os
mesmos arquivos.

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
    pulados, a família, as listas, a saída e a volta, completar o arrolamento. **Esperando ele conferir.** Pergunta
    aberta, marcada "Para conferir": no "pediu para sair" (sem carta), o documento é obrigatório?
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
- **Membros na homologação:** falta o OK final dele para a produção. A importação só vai à produção com "completar o
  arrolamento" pronto.
- **O teste de telas do CI falhou no homolog `f774121`** (o 1b do Financeiro escondeu o menu antigo). Provável remédio:
  atualizar a base `tools/csp-e2e/base/commit.txt`, como foi feito no Membros; conferir antes.
- **Carteirinhas:** a do obreiro só a Secretaria Geral imprime; o QR de quem saiu mostra só o nome; testar a impressora
  de PVC; a foto de conferência dos ajustes na homologação.
- **Bancada, decisões dele:** o servidor de memória 2.2.1 (a aprovada é a 2.1.1; nunca instalar sozinho); a cláusula
  5.2 do `LICENSE`; a porta do construtor (`C:\tmp\ieadespa-bancada\pronto\APLICAR.md`). O login do Claude neste
  computador vence até 24/11.
- **Risco não provado:** juntar fichas usa `DISABLE TRIGGER`, que precisa de ALTER no Azure.
- **Worktrees:** `C:/tmp/ieadespa-svelte` tem junções `api/node_modules` e `site/node_modules`: apagar com `rmdir`
  sem `/s` antes de remover o worktree. Os do desenho (`C:/tmp/ieadespa-desenho-r27` e `-r28`) já podem sair; o ramo
  `v10-membros-importador-wip` também.
- **Diários** (só neste computador): `C:\tmp\ieadespa-financeiro\DIARIO.md`, `C:\tmp\ieadespa-membros\` (DIARIO,
  DIARIO-importador, DIARIO-banco-lento) e os das rodadas em `C:/tmp/ieadespa-desenho-r27-fotos/` e `-r28-fotos/`.

## 4. Próximo passo exato

Antes: ele recarrega a janela do VS Code ("Recarregar Janela") e roda `/clear`. A conversa nova já tem o conselheiro
Fable e os agentes `construtor`, `desenhista` e `revisor`.

Três agentes, cada um no seu ramo e worktree:

1. **Revisor:** confere a importação de Membros (homolog `b34284c`; commits `703c76b` a `68bce84`): `importarLote` em
   `api/shared/importacaoMembrosDb.js`, `classificar`/`criarPrevia`, o laço dos lotes e o 428 em `Importar.svelte`, e
   `PassoArquivo`.
2. **Construtor, Membros primeiro:** a trava "nada gera matrícula antes da importação" (seção 3), conferida pelo
   revisor, para a homologação. **Depois alterna para o Financeiro:** o teste de telas do CI; `bd694cf` e `4c06d58`
   para a homologação; a tela das abas Folhas e Livro; o formulário do lote da gráfica (aprovado na 27).
3. **Desenhista:** espera a conferência dele da rodada 28 (ler as escolhas `r28-*` na página KMeb…); depois, o módulo
   3 (Estrutura e Territórios).

E a varredura de defeitos, lote 1, como fluxo com o `revisor` (avisar a ele em uma linha antes).
