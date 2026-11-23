# Passagem de bastão — ieadespa

Em uso por: Mateus desde 23/11/2026 08:48

> Uma pessoa por vez. Antes de começar: `git pull` e leia a linha acima. Se estiver em uso por outra pessoa, não
> comece. Ao começar: troque pela sua (nome e data), commit e push. Ao parar: a passagem completa, a linha volta a
> "Livre", commit e push (regra 4 do `CLAUDE.md`). Este arquivo é público: nada de senha, chave, token nem dado pessoal.

Atualizado em 23/11/2026, manhã (Claude, sessão principal).

**Em andamento (23/11):** ele decidiu adotar o conselheiro (o Fable aconselhando o Opus; em TESTE só neste
computador), os agentes padrão e os ganchos de proteção na bancada, e **3 agentes ao mesmo tempo** neste projeto (um
desenha, um constrói, um revisa; memórias `conselheiro-e-padrao-alto` e `desenho-em-paralelo-a-construcao`). Agentes
rodando agora:

- **Bancada:** os agentes padrão (construtor, desenhista, revisor no Fable) e os ganchos de proteção, em
  `C:\MCP\bancada`; só o `-SoTestar` (o `-Sim` espera o sim dele). Diário
  `C:\tmp\ieadespa-bancada\DIARIO-agentes-e-ganchos.md`.
- **Desenho, rodada 28** (ramo `desenho-r28`, worktree `C:/tmp/ieadespa-desenho-r28`; diário em
  `C:/tmp/ieadespa-desenho-r28-fotos/`).
- **Construção, Membros:** a tela de importar os membros e o pulo das matrículas que já existem (`v10-membros-svelte`).
- Quando os agentes padrão estiverem instalados, o **revisor** substitui o agente da bancada como 3º.

O resto deste arquivo é o estado da parada de 22/11, ainda válido.

## 1. Concluído

- **Produção (main):** só documentação e desenho. Nada de Membros nem de Financeiro foi à produção.
- **Desenho:**
  - Financeiro: núcleo aprovado nas rodadas 20 a 26.
  - **Rodada 27 conferida (22/11):** aprovadas receber o repasse e dar o recibo, os saldos de abertura, importar os
    membros e cadastrar lote da gráfica. O fechamento do mês volta na 28.
  - Página leve KMeb… na versão 9 (a 27); fontes em `design/propostas/`. A página antiga G1gj… é só arquivo.
  - **As regras da rodada 28 foram todas respondidas por ele** antes de desenhar: plano
    `docs/plano/fase-10-experiencia-design-performance.md`, seções "Rodada 27: o que ele aprovou e o fechamento refeito"
    e "As regras da rodada 28 (Membros), respondidas antes de desenhar".
- **Membros** (ramo `v10-membros-svelte`, `3e65794`; worktree `C:/tmp/ieadespa-svelte`), na homologação:
  - as 4 pendências do "Quero me cadastrar" (homolog `810540f`);
  - o banco lento: a resposta nunca passa de 3 s, a secretaria aceita depois, e "envie de novo" quando nem a gravação
    cabe (homolog `7d5ebbf`, DEPLOY OK; aprovado por ele);
  - o **servidor** do importador do sistema pago, migração 185 e a rota `api/importacao-membros` (homolog `708f50f`,
    DEPLOY OK). O ramo `v10-membros-importador-wip` já foi trazido e pode ser apagado.
- **Financeiro** (ramo `v10-financeiro-svelte`; worktree `C:/tmp/ieadespa-financeiro/obra`):
  - o plano da construção `docs/plano/financeiro-construcao.md` (no ramo);
  - o **incremento 1b na homologação** (a tela dos blocos de recibo, o número do bloco pela 1ª folha; homolog
    `f774121`, DEPLOY OK);
  - **só no ramo, fora da homologação:** `bd694cf`, a casca igual ao desenho (barra de 280 px, o cabeçalho numa linha e o
    último grupo do menu à vista no notebook); e `4c06d58`, o **servidor** do incremento 2 (as folhas do bloco, a
    exceção da folha, o livro, o rastreio e a devolução). A tela do incremento 2 não foi feita.

## 2. Arquivos alterados (ainda não registrados no Git)

- Nenhum. Os três worktrees estavam limpos e enviados quando os agentes pararam. A rodada 28 não chegou a ser começada
  (nenhum arquivo).

## 3. Pendências e erros conhecidos

- **O teste de telas do CI falhou no homolog `f774121`** (o 1b do Financeiro escondeu o menu antigo). Provável remédio:
  atualizar a base `tools/csp-e2e/base/commit.txt`, como foi feito no Membros; conferir antes.
- **Carteirinhas:** a do obreiro só a Secretaria Geral imprime; o QR de quem saiu mostra só o nome; testar a impressora
  de PVC; a foto de conferência dos ajustes na homologação.
- **Membros na homologação:** falta o OK final dele para ir à produção. A importação só vai à produção com "completar o
  arrolamento" pronto (sem ele a pendência não se resolve).
- **Bancada, decisões dele:** conferir o servidor de memória 2.2.1 antes de subir (a aprovada é a 2.1.1); a cláusula
  5.2 do `LICENSE`; a porta do construtor (`C:\tmp\ieadespa-bancada\pronto\APLICAR.md`). O login do Claude neste
  computador vence até 24/11.
- **Risco não provado:** juntar fichas usa `DISABLE TRIGGER`, que precisa de ALTER no Azure.
- **Worktrees:** `C:/tmp/ieadespa-svelte` tem junções `api/node_modules` e `site/node_modules`: apagar com `rmdir`
  sem `/s` antes de remover o worktree. O da rodada 27 (`C:/tmp/ieadespa-desenho-r27`) já pode sair.
- **Diários** (só neste computador): `C:\tmp\ieadespa-financeiro\DIARIO.md`, `C:\tmp\ieadespa-membros\` (DIARIO,
  DIARIO-importador, DIARIO-banco-lento), `C:/tmp/ieadespa-desenho-r27-fotos/DIARIO.md` e o levantamento da 28 em
  `C:/tmp/ieadespa-r28-duvidas.md`.

## 4. Próximo passo exato (quando ele mandar continuar)

Três agentes em paralelo, cada um no seu ramo e worktree (memória `desenho-em-paralelo-a-construcao`):

1. **Desenho, rodada 28** (worktree novo `C:/tmp/ieadespa-desenho-r28`, ramo `desenho-r28`, a partir da `main`), pelas
   regras já respondidas no plano: a auditoria ao vivo e o fechamento do mês; a chegada do lote com os números pulados;
   a família com "mora junto"; as listas inteligentes; o assistente de movimentação (saída e volta); completar o
   arrolamento e o grupo novo do painel. Publicar na página leve KMeb… (ele já conferiu a 27).
2. **Membros:** a importação pula a matrícula que já existe (a 1 e a 2); a **tela** "Importar os membros", igual à
   r27 aprovada; homologação.
3. **Financeiro:** o teste de telas do CI; a casca (`bd694cf`) e o servidor do incremento 2 (`4c06d58`) para a
   homologação; a tela das abas Folhas e Livro; depois o formulário do lote da gráfica (aprovado na 27).

Depois da 28: o módulo 3 (Estrutura e Territórios).
