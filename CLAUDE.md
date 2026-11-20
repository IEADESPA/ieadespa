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

O `HANDOFF.md` (estado do trabalho) e a memória do projeto (`.claude/continuidade/memoria/`) vão para o Git, na `main`,
para o colega continuar do mesmo ponto. São públicos: nada de senha, chave, token, CPF, endereço nem dado pessoal real.

- **Antes de começar:** `git pull` e leia a linha "Em uso por" no alto do `HANDOFF.md`. Em uso por outra pessoa? Não
  comece. Livre? Ponha o seu nome e a data/hora, commit e push.
- **Ao parar:** a passagem completa (memória e `HANDOFF.md`), a linha volta a "Livre", commit e push.
- **Computador novo** (sem o `memoria-projeto` no `/mcp` ou sem os plugins da bancada): ofereça rodar o instalador
  (`.claude\continuidade\INSTALAR.cmd`, dois cliques). Só com a licença da pessoa: primeiro `-SoTestar`, mostre o que
  mudaria e, com o sim, `-Sim`. A lista da bancada é `.claude/continuidade/bancada.json`.

## 5. Economia de créditos (vale para qualquer pessoa ou agente)

O esforço e o modelo ficam no **MÁXIMO**, por decisão do responsável: não se economiza baixando a qualidade. Economiza-se
no jeito de trabalhar (medido com `tools/medir-creditos/`, 20/11/2026):

- Tarefa longa vai para um agente **novo**, com um resumo escrito; nunca um "fork", que herda a conversa inteira
  (~22% do gasto medido).
- Missões curtas, de uns 30 minutos, com commit a cada uma.
- O relatório do agente tem no máximo 25 a 30 linhas; o detalhe vai num arquivo.
- A página de propostas fica leve (menos de ~400 KB); as rodadas antigas ficam na página de arquivo.
- Poucas fotos de tela, só as necessárias para conferir.
- Antes de abrir arquivo grande, consulte o mapa do sistema (o `CLAUDE.md` de cada pasta e `docs/plano/RESUMO-fase-10.md`).
- O saldo se vê com `/usage`. A compactação da conversa começa mais cedo (`autoCompactWindow` 400000, oferecida pelo
  instalador).
