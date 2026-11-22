# Passagem de bastão — ieadespa

Em uso por: Mateus desde 22/11/2026 15:45

> Uma pessoa por vez. Antes de começar: `git pull` e leia a linha acima. Se estiver em uso por outra pessoa, não
> comece. Ao começar: troque pela sua (nome e data), commit e push. Ao parar: a passagem completa, a linha volta a
> "Livre", commit e push (regra 4 do `CLAUDE.md`). Este arquivo é público: nada de senha, chave, token nem dado pessoal.

Atualizado em 21/11/2026, fim do expediente (Claude, sessão principal). Ele mandou parar tudo: os dois agentes foram
parados e o que estava pela metade foi guardado no GitHub.

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

- **Perguntas para ele, do cadastro pelo site (agente de Membros):**
  1. com o banco lento (mais de 2,7 s), a resposta demora 6 s: aumentar o tempo ou deixar a secretaria fazer o aceite;
  2. a espera fixa de 3 s está boa (recomendação: manter);
  3. o novo aviso "Carregando o texto da autorização…";
  4. o mesmo envio repetido com dados diferentes devolve o resultado do primeiro.
- **Perguntas de regra do Financeiro** (plano do ramo, seção 6): o número do bloco pela primeira folha; o conferir do
  repasse (opção 2 da r24 sem a aba "Espécie e digital"); "marcada em novembro" na tela de lançar; o fechamento do mês
  pelo Conselho Fiscal e o saldo de abertura, que não têm tela desenhada.
- **O importador:** não existe tela aprovada de importação. Precisa de desenho e do OK dele antes de construir a tela.
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

## 4. Próximo passo exato (quando ele mandar continuar)

Dois agentes em paralelo, cada um no seu ramo (memória `desenho-em-paralelo-a-construcao`):

1. **Financeiro, incremento 1b:** a tela dos blocos de recibo (r17-blocos, opção 1) no `v10-financeiro-svelte`, seguindo
   o fim do diário do Financeiro: a 2ª entrada no `front/vite.config.ts` (cuidado com o CSS único `membros.css`),
   `front/src/financeiro.ts` e `front/src/financeiro/`, a ligação na casca, os pares aprovado × construído (as fotos do
   aprovado já estão em `C:\tmp\ieadespa-financeiro\pares\`) e, aí sim, a homologação (`git fetch`, esperar deploy em
   curso, mesclar no `homolog`, `bash tools/conferir-deploy.sh`).
2. **Membros, o importador:** retomar do ramo `v10-membros-importador-wip` (diário do importador), terminar o servidor
   com teste e e2e no LocalDB; a tela só depois de desenhada e aprovada.
3. Levar a ele as perguntas da seção 3 (cadastro e regras do Financeiro) antes dos incrementos que dependem delas.
