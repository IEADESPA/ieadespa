# Passagem de bastão — ieadespa

Em uso por: **Mateus** desde 20/11/2026 17:19

> Uma pessoa por vez. Antes de começar: `git pull` e leia a linha acima. Se estiver em uso por outra pessoa, não
> comece. Ao começar: troque pela sua (nome e data), commit e push. Ao parar: a passagem completa, a linha volta a
> "Livre", commit e push (regra 4 do `CLAUDE.md`). Este arquivo é público: nada de senha, chave, token nem dado pessoal.

Atualizado em 20/11/2026 (Claude, agente de construção de Membros). Agente em andamento no `v10-membros-svelte`
(worktree `C:/tmp/ieadespa-svelte`): sobras 1 a 5 FEITAS (ramo até `b5f12f8`) e NA HOMOLOGAÇÃO: homolog `ae7f2e3` DEPLOY OK,
`feb7dc6` (site), base do teste de telas `e5fe087` só no homolog (DEPLOY OK; a execução 44806909775 que a
confirma ainda rodava às 17h30 de 20/11: conferir). Prévia do site:
`https://salmon-bay-0efd06d0f-21.eastus2.3.azurestaticapps.net/quero-me-cadastrar/`. Pares em
`scratchpad/svelte-membros/pares-site/`. Próximo: o importador (passo 9), NÃO começado (cota).

## 1. Concluído

- **Produção (main):**
  - `motivoSaida` fora da lista de pessoas (`d0831d7`);
  - a rede de segurança do deploy: `tools/conferir-deploy.sh` e `.github/workflows/sistema-repetir-deploy.yml`. A regra
    1 do `CLAUDE.md` usa o script, e já repetiu sozinha um deploy recusado pelo firewall;
  - plano: a seção "Financeiro (módulo 2)" com "A realidade do dinheiro, que vale mais que o Regimento", o que falta em
    Membros e a varredura em pedaços de 30 minutos (main até `610cbc2`, todos com DEPLOY OK).
- **Homologação** (preview do PR #21):
  - a casca refeita igual ao desenho, com as fontes e os efeitos;
  - **Membros REFEITO DO ZERO em Svelte + TypeScript.** Ele aprovou o visual: "ficou bom, bem rápido". O gráfico do
    painel foi corrigido;
  - **as Carteirinhas** (homolog `0533b88`).
  - Ramo `v10-membros-svelte`, worktree `C:/tmp/ieadespa-svelte`.
- **Desenho:**
  - **A página antiga** (G1gj9hzSbdcqAZYcFjmJ1j) é o ARQUIVO das rodadas 2 a 18. Nunca mais republicar.
  - **A página leve** (KMebnrdoWfAhcz9yeRgjFz) tem a **rodada 20 publicada** (Financeiro, 12 telas). A rodada 19 foi
    reprovada por causa do "culto": ver a memória `realidade-financeira-nao-o-regimento`.

## 2. Arquivos alterados (ainda não registrados no Git)

- **Fontes do desenho:** os da rodada atual (21) estão no Git, em `design/propostas/` (20/11). O resto (rodadas antigas,
  escolhas, auditorias e scripts de Membros) continua só na cópia `C:/tmp/ieadespa-desenho-fontes/` deste computador.

- Nenhum. O incremento 5 ("Quero me cadastrar" do site) está no `v10-membros-svelte` `37c25a4`, testado (e2e-95 56/56, jest
  6.683). O worktree `C:/tmp/ieadespa-svelte` ganhou também a junção `site/node_modules` (apagar com `rmdir` sem `/s`).

## 3. Pendências e erros conhecidos

- **Respostas dele pendentes:**
  - **Rodada 20, as 5 dúvidas:**
    1. a espécie da congregação vai para a conta dela ou direto para a geral;
    2. o retido fica em dinheiro ou é depositado;
    3. o Pix dos membros cai direto na geral;
    4. as receitas passam de R$ 4,8 milhões (a ECD);
    5. mostrar "atrasada".
    - E as escolhas dele na página leve: ler com ArtifactData (url KMeb…, coleção "escolhas", ids `r20-*`, `geral-r20`).
  - **Carteirinhas:**
    1. a do obreiro, só a Secretaria Geral imprime;
    2. o QR de quem saiu mostra só o nome;
    3. testar a impressora de PVC.
  - **Membros na homologação:** o OK final dele.
  - **Antigas:** a fonte (Fonte teste), o alerta do Azure para R$ 450, as fotos da Igreja e as 3 decisões do passo 3.
- **Ajustes das carteirinhas** (cor marinho com brilho, respiro do QR, cadeado só da local): já feitos no `24d782c` e no
  homolog `319b547`; falta só a foto de conferência na homologação.
- **Pendências das revisões do "Quero me cadastrar"** (do passo 4): 4 itens, 2 de segurança e 2 de consistência, a
  corrigir ANTES da produção. O detalhe técnico fica fora do repositório público (é público): pergunte ao responsável.
- **Decisão dele:** e-mail com a matrícula depois do cadastro pelo site (o desenho prometia; revelaria quem não tem ficha).
- **Risco não provado:** juntar fichas usa `DISABLE TRIGGER`, que precisa de ALTER no Azure.
- **O worktree `C:/tmp/ieadespa-svelte`** tem uma junção `api/node_modules`: apagar com `rmdir` sem `/s` antes de
  remover o worktree.

## 3b. 20/11/2026, tarde (sessão principal)

- **Rodada 24 PUBLICADA** (20/11, noite) na página leve KMeb… (versão 6, 378 KB). Ela substitui a 23, que saiu sem
  resposta dele; a 22 e a 21 seguem recolhidas, e a 21 foi aprovada. A 24 refaz 3 telas com a regra DEFINITIVA das
  folhas de outro mês (plano, `7688b5c`, DEPLOY OK):
  - **Lançar**, em 02/12: dezembro começa na 70.161, a 1ª "mês posterior". A 70.163 e a 70.164 vêm sozinhas com a
    tarja, e só existem "Este mês" e "Mês posterior";
  - **Folha do mural** contínua: novembro da 70.063 à 70.164, dezembro a partir da 70.161;
  - **Conferir o repasse:** o adiantado de dezembro (R$ 530) "espera dezembro".
  - Conferida foto a foto na sessão principal.
  - Fontes em `C:/tmp/ieadespa-desenho-fontes/` (r24-*.js, montar-r24.js, propostas-r24/).
  - Respostas na página: ArtifactData, coleção "escolhas", ids `r24-*` e `geral-r24`.
- **Varredura do Financeiro antes da construção: RESPONDIDA por ele** (20/11, noite). Está no plano, na seção "A
  varredura antes da construção". Em resumo:
  - começa em janeiro de 2027, só com os saldos de abertura;
  - o mês anterior recebe até a congregação mandar o relatório;
  - departamentos e Missões ficam fora da 1ª entrega;
  - só espécie e Pix;
  - extrato da Cora em arquivo;
  - o dizimista vê os próprios dízimos;
  - o contador recebe por planilha (ITG 2002), sem ECD;
  - a reabertura do mês só com o voto do Conselho Fiscal e a autorização do Ministério.
- **Falta dele:** aprovar a rodada 24. Em 20/11 ainda não havia nenhum `r24-*` na coleção "escolhas".
- **Decisões dele de 20/11** (memória `colaboracao-publica-e-creditos`):
  - o esforço SEMPRE no máximo;
  - `autoCompactWindow` = 400000, já aplicado em `~/.claude/settings.json`;
  - o plugin Nonprofits fica;
  - a colaboração no repositório PÚBLICO, só com o que é seguro;
  - a senha do ASAF apagada do settings.
- **Em andamento:** o agente de Membros (acabamentos e carteirinhas) e a pesquisa 2 dos economizadores (graphify,
  claude-mem, RTK...).
- **A colaboração no repositório público: MONTADA em 20/11** (commits `87caeb9` a `94c3771` e o do kit): as habilidades
  em `.claude/skills` e `.agents/skills`, o `.claude/settings.json` com os 5 plugins, este `HANDOFF.md` com a linha
  "Em uso por", a memória do projeto e a do Claude versionadas (revisadas, sem dado pessoal), os fontes do desenho, o
  mapa do sistema (`CLAUDE.md` por pasta e `docs/plano/RESUMO-fase-10.md`) e o kit novo (`.claude/continuidade`, com
  o `INSTALAR.cmd` de dois cliques e a lista `bancada.json`).
  - **Neste computador (20–21/11):** checkout principal na `main`; o instalador rodou com o sim dele (servidor 2.1.1,
    cópia do kit e `autoMemoryDirectory`), valendo a partir da próxima conversa. Até recarregar a janela, a sessão
    principal grava em `C:\MCP\memorias\ieadespa.jsonl`: exportar de novo para o repositório na troca.
  - **Aviso de início de toda conversa: NO AR** (`10d7ac9`, aprovado por ele): gancho SessionStart que só lê e mostra
    a linha "Em uso por", o `git pull` que falta e o que o computador tem de diferente do kit.
  - **Matriz única da bancada: NÃO aprovada** ("muito nebuloso"). Em 21/11 ele pediu a explicação detalhada (repositório
    pequeno privado, garantia de puxar sempre o mais novo, versões do servidor, conflito de repositório dentro de
    repositório). Explicação dada na conversa; NÃO construir antes do sim dele. Fato medido: as cópias do kit no `asaf`
    e no `construtor de igreja` já estão velhas (17–18/11, sem `bancada.json` nem aviso).
  - Enxugar o MEMORY.md só depois do OK dele.

## 4. Próximo passo exato (quando ele mandar continuar)

1. **Membros:** retomar os acabamentos no `v10-membros-svelte`, a partir do WIP `fd7862c` (o "Quero me cadastrar"), com
   os ajustes das carteirinhas, em incrementos de 30 minutos. Depois: o seletor de congregação final, o importador
   (passo 9) e a ida à produção.
2. **Financeiro:** ler as escolhas dele na rodada 23 (e as 2 respostas acima). Aprovada, começar a CONSTRUÇÃO do núcleo
   em Svelte: entradas, repasse, caixa, recibo, rateio, tesouro e mural. Dúvida de regra se pergunta ANTES.
3. **Desenho:** depois do Financeiro, a rodada de Membros (família como unidade, listas inteligentes, assistente de
   desligamento).
4. **A varredura de defeitos em pedaços de 30 minutos:** só quando ele disser que é viável.
