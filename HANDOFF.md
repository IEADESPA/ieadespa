# Passagem de bastão — ieadespa

Em uso por: Mateus desde 22/11/2026 15:45

> Uma pessoa por vez. Antes de começar: `git pull` e leia a linha acima. Se estiver em uso por outra pessoa, não
> comece. Ao começar: troque pela sua (nome e data), commit e push. Ao parar: a passagem completa, a linha volta a
> "Livre", commit e push (regra 4 do `CLAUDE.md`). Este arquivo é público: nada de senha, chave, token nem dado pessoal.

Atualizado em 22/11/2026, tarde (Claude, sessão principal): as perguntas respondidas e três agentes em paralelo.

## 1. Concluído

- **Produção (main):** só documentação e a porta da bancada nesta semana (último `fbe9373`, DEPLOY OK). Nada de
  Membros nem de Financeiro foi à produção.
- **Desenho do Financeiro: APROVADO** (rodadas 20 a 26; página leve KMeb…, versão 8; fontes em `design/propostas/`).
  A regra do saldo de cada congregação na Geral está no plano (`docs/plano/fase-10-experiencia-design-performance.md`,
  seções "Rodada 25" e "Rodada 26"). A página antiga G1gj… é só arquivo: nunca republicar.
- **Membros (ramo `v10-membros-svelte`, worktree `C:/tmp/ieadespa-svelte`):** refeito em Svelte, com as Carteirinhas e
  o "Quero me cadastrar". As 4 pendências de segurança e consistência do cadastro estão FEITAS e na homologação
  (`2e4200c`, `a70f5c2`; homolog `810540f`, DEPLOY OK).
- **Financeiro (ramo `v10-financeiro-svelte`, worktree `C:/tmp/ieadespa-financeiro/obra`, criado do Membros):**
  - o plano da construção, `docs/plano/financeiro-construcao.md` (no ramo, `f0f2188`): inventário, tabelas `Fin*`
    (migrações 200 a 208), rotas `/api/financeiro`, 13 incrementos e as perguntas de regra;
  - o **incremento 1a** (`ae96eae`): migração 200 e a rota dos blocos de recibo, com teste (jest 15/15) e o e2e-200 no
    LocalDB (76/76). Ainda SEM tela e fora da homologação.
- **Bancada:** matriz única no repositório privado `IEADESPA/bancada` (`C:\MCP\bancada`); aqui só a porta. O asaf já
  tem a porta. O compartilhamento entre os dois computadores foi testado e deu certo (21/11).

## 2. Arquivos alterados (ainda não registrados no Git)

- Nenhum. O importador dos membros, que estava pela metade, foi guardado no ramo próprio
  **`v10-membros-importador-wip`** (`fc24cd6`, enviado): `api/shared/importacaoMembros.js`,
  `sql/migrations/185_importacao_membros.sql` e pequenos acréscimos em `auditoria.js` e `preCadastro.js`. **Sem teste,
  sem tela: não mesclar** no `v10-membros-svelte` nem no `homolog` antes de terminar e provar.

## 3. Pendências e erros conhecidos

- **As perguntas do cadastro pelo site e as do Financeiro foram RESPONDIDAS em 22/11** (plano, seção "As respostas de
  22/11/2026 (antes da rodada 27)"). A tela de importação, o fechamento do mês, os saldos de abertura e o "receber o
  repasse" simplificado estão sendo desenhados na rodada 27.
- **Carteirinhas:** a do obreiro só a Secretaria Geral imprime; o QR de quem saiu mostra só o nome; testar a impressora
  de PVC; a foto de conferência dos ajustes na homologação.
- **Membros na homologação:** falta o OK final dele para ir à produção.
- **Bancada, decisões dele:** conferir o servidor de memória 2.2.1 antes de subir (a aprovada é a 2.1.1); a cláusula
  5.2 do `LICENSE`; a porta do construtor na próxima vez que ele for aberto
  (`C:\tmp\ieadespa-bancada\pronto\APLICAR.md`). O login do Claude neste computador vence até 24/11.
- **Risco não provado:** juntar fichas usa `DISABLE TRIGGER`, que precisa de ALTER no Azure.
- **Worktrees:** `C:/tmp/ieadespa-svelte` tem junções `api/node_modules` e `site/node_modules`: apagar com `rmdir`
  sem `/s` antes de remover o worktree.
- **Diários dos agentes** (só neste computador): `C:\tmp\ieadespa-financeiro\DIARIO.md`,
  `C:\tmp\ieadespa-membros\DIARIO.md` e `C:\tmp\ieadespa-membros\DIARIO-importador.md`.

## 4. Próximo passo exato

**Em andamento (22/11, tarde): TRÊS agentes em paralelo**, cada um no seu ramo e worktree:

1. **Desenho, rodada 27** (ramo `desenho-r27`, worktree `C:/tmp/ieadespa-desenho-r27`; diário
   `C:/tmp/ieadespa-desenho-r27-fotos/DIARIO.md`): receber o repasse e dar o recibo (simples), o fechamento do mês com o
   voto de cada conselheiro, os saldos de abertura e importar os membros. Publica na página leve KMeb…; a sessão
   principal mescla o ramo na `main` depois de conferir.
2. **Financeiro** (`v10-financeiro-svelte`, worktree `C:/tmp/ieadespa-financeiro/obra`; diário
   `C:\tmp\ieadespa-financeiro\DIARIO.md`): o **incremento 1b está na homologação** (a tela dos blocos de recibo, bloco
   pela 1ª folha; ramo `3b53669`, homolog `f774121`, DEPLOY OK). Agora: o teste de telas do CI, as diferenças da casca
   (barra lateral, cabeçalho da Geral, último grupo do menu cortado no notebook) e o incremento 2 (abas Folhas e
   Livro). O formulário "Cadastrar lote da gráfica" não tinha desenho: foi pedido na rodada 27.
3. **Membros** (`v10-membros-svelte`, worktree `C:/tmp/ieadespa-svelte`; diários em `C:\tmp\ieadespa-membros\`): o
   "Quero me cadastrar" com o banco lento indo para a secretaria; depois o servidor do importador (do ramo
   `v10-membros-importador-wip`), sem a tela.

Depois: ele confere a rodada 27; em seguida a rodada 28 (Membros: a família como unidade, as listas inteligentes e o
assistente de movimentação) e o módulo 3 (Estrutura e Territórios).
