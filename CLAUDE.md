# IEADESPA — regras obrigatórias (leia antes de qualquer tarefa)

Repositório **público**. Contexto completo no [`README.md`](README.md); segredos em
[`SECRETS.md`](SECRETS.md). **Mapa do sistema** (leia antes de abrir arquivos): o `CLAUDE.md` curto de cada pasta
(`api/`, `app/`, `front/`, `site/`, `tools/`) e o estado da fase em [`docs/plano/RESUMO-fase-10.md`](docs/plano/RESUMO-fase-10.md).

## 1. Toda alteração vai para a nuvem — OBRIGATÓRIO

O responsável **não vê nada localmente, só o que está no GitHub**. Terminou uma mudança
(código, docs, configuração)? **Commit + `git push origin main` na mesma hora**, sem esperar
pedido.

- Commit estreito: só os arquivos da tarefa, `git add` explícito (nunca `git add -A`).
- Depois do push, conferir o deploy com `bash tools/conferir-deploy.sh` e informar o resultado. Vale a última linha,
  "DEPLOY OK" ou "DEPLOY FALHOU", nunca só o fim do comando. A recusa do firewall do banco é repetida sozinha até a 3ª
  tentativa; se ainda falhar, avisar o responsável.
- Se o push for bloqueado, **parar e avisar** — nunca deixar a alteração só na máquina.

## 2. Senha e segredo nunca em texto puro

Nem em código, nem em `.claude/settings*.json`, nem dentro de comando aprovado/executado.
Segredo só no fluxo criptografado SOPS + Age (ver `SECRETS.md`). Ao mostrar o conteúdo de
arquivo de segredo (`local.settings.json`, `.env*`), **mascare todos os valores**, não só um.

## 3. Referências

`chamada-ebd/` e `relatorios-departamentos/` (raiz) guardam protótipos antigos só para
consulta de ideias (ver `REFERENCIAS.md`): não copiar código (Next.js é banido aqui) e não
adicionar `.env`, `*.db`, `node_modules` nem `.rar` lá. A cópia pesada aninhada
(`chamada-ebd/chamada-ebd/`) é só local e ignorada — nunca versionar.

## 4. Uma pessoa por vez: a linha "Em uso por" do `HANDOFF.md`

Desde 25/11/2026 o estado do trabalho mora na **bancada privada**, em `C:\MCP\bancada\projetos\ieadespa\`: o
`HANDOFF.md` (com a linha "Em uso por"), a memória do projeto (`memoria.jsonl`, o servidor `memoria-projeto`) e a
memória do Claude (`memoria-claude/`). O `HANDOFF.md` da raiz é só o aviso curto que aponta para lá; nunca volte a pôr
estado, memória nem relatório neste repositório público.

- **Antes de começar:** o aviso de início puxa a bancada e mostra a linha "Em uso por". Em uso por outra pessoa? Não
  comece. Livre? Ponha o seu nome e a data/hora no `HANDOFF.md` da bancada e registre.
- **Ao parar:** a passagem completa (memória e `HANDOFF.md` da bancada), a linha volta a "Livre" e registre.
- **Registrar** é commit e push só da pasta do projeto, na bancada (os comandos estão nas regras globais:
  `git -C C:/MCP/bancada add -- projetos/ieadespa`, commit, `pull --rebase --autostash`, push).
- **A bancada** (instalador, aviso de início, servidor de memória, habilidades, regras globais e a lista `bancada.json`)
  mora no repositório privado `IEADESPA/bancada`, baixado em `C:\MCP\bancada`; aqui fica só a **porta**
  (`.claude/continuidade/`: `INSTALAR.cmd`, `porta.sh`, `LEIA-ME.md`). Melhoria da bancada, só lá, com push.
- **Computador novo** (a porta avisa no começo da conversa): ofereça rodar `.claude\continuidade\INSTALAR.cmd` (dois
  cliques), que baixa a bancada e chama o instalador. Só com a licença da pessoa: primeiro `-SoTestar`, mostre o que
  mudaria e, com o sim, `-Sim`.

## 5. Economia de créditos (vale para qualquer pessoa ou agente)

O modelo fica no melhor, e o esforço vai por agente, por decisão do responsável (24/11/2026). A equipe tem 3 papéis
ao mesmo tempo:

- construtor no "x alto": constrói o aprovado e, como corretor, corrige o que o revisor de fora acha;
- desenhista no "alto";
- revisor (Fable) só no portão: uma passada por ramo antes da homologação e outra antes da produção. O revisor de
  fora revisa a `main` e confere de novo cada correção do corretor; o esforço dele sai do teste num pedaço real;
- a conversa principal no "alto".

Não se baixa a qualidade de quem constrói, revisa ou caça defeitos. Economiza-se no jeito de trabalhar (medido com
`tools/medir-creditos/`, 20/11/2026):

- Tarefa longa vai para um agente **novo**, com um resumo escrito; nunca um "fork", que herda a conversa inteira
  (~22% do gasto medido).
- Missões curtas, de uns 30 minutos, com commit a cada uma.
- O relatório do agente tem no máximo 25 a 30 linhas; o detalhe vai num arquivo.
- A página de propostas fica leve (menos de ~400 KB); as rodadas antigas ficam na página de arquivo.
- Poucas fotos de tela, só as necessárias para conferir.
- Antes de abrir arquivo grande, consulte o mapa do sistema (o `CLAUDE.md` de cada pasta e `docs/plano/RESUMO-fase-10.md`).
- O saldo se vê com `/usage`. A compactação da conversa começa mais cedo (`autoCompactWindow` 400000, oferecida pelo
  instalador).
