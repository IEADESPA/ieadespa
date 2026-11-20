# Continuidade: trabalhar em dupla do mesmo ponto

Para quem usa o Claude Code (ou o Codex) no repositório da IEADESPA. O objetivo: a segunda pessoa puxa o repositório,
roda o instalador uma vez e continua **exatamente** de onde a outra parou, com a mesma bancada (habilidades, plugins,
regras, memória, passagem de bastão e os fontes do desenho), sem duas linhas do tempo em paralelo.

O repositório é **público**: tudo o que vai para o Git é revisado. Nunca senha, chave, token, CPF, endereço nem dado
pessoal real.

## O que vem com o repositório

| O quê | Onde | Para quê |
| --- | --- | --- |
| Regras do projeto | `CLAUDE.md` (raiz e um curto por pasta), `AGENTS.md` (Codex) | O que vale sempre; o mapa do sistema |
| Passagem de bastão | `HANDOFF.md` (raiz) | O estado do trabalho e o próximo passo exato; a linha "Em uso por" |
| Memória do projeto | `.claude/continuidade/memoria/ieadespa.jsonl` | Os fatos duráveis (servidor `memoria-projeto`) |
| Memória do Claude | `.claude/continuidade/memoria-claude/` | Como trabalhar com o responsável (preferências, correções) |
| Habilidades | `.claude/skills/` (Claude Code) e `.agents/skills/` (Codex), iguais | As 6 de desenho, com a licença de cada uma |
| Plugins | `.claude/settings.json` | Liga os 5 plugins do projeto (instalar é com o kit) |
| Desenho | `design/propostas/` | Os fontes da página de propostas da rodada atual |

## Uma vez por computador (a segunda pessoa)

1. **Acessos** (o responsável dá): escrita no repositório `IEADESPA/ieadespa` do GitHub e o papel de **editor** nas
   páginas de propostas (Artifacts da organização, botão Share).
2. **Programas:** Git, Node.js 22 ou mais novo (`winget install OpenJS.NodeJS.LTS`), VS Code com a extensão do Claude
   Code e o login com a **conta da organização**.
3. **Clonar** e abrir a pasta no VS Code, aceitando o aviso de confiança da pasta:

   ```powershell
   git clone https://github.com/IEADESPA/ieadespa.git
   ```

4. **Rodar o instalador**, no PowerShell, na raiz do repositório. Ele **pergunta antes de cada mudança**; para só ver o
   que faria, acrescente `-Simular`:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\.claude\continuidade\instalar-memoria.ps1
   ```

5. **Conferir:** `Ctrl+Shift+P` → "Recarregar Janela". Numa conversa nova do Claude: `/mcp` mostra `memoria-projeto`
   conectado, `/plugins` mostra os 5 plugins e `/memory` mostra a pasta da memória automática.
6. **Segredos:** a chave `age` própria e o administrador rodando `sops updatekeys` (passos do [`SECRETS.md`](../../SECRETS.md)).

## O que o instalador faz (cada passo com pergunta)

1. **O servidor de memória** (`@modelcontextprotocol/server-memory` 2.1.1, licença MIT) em `C:\MCP`, com versão fixa,
   mais o programa de partida (`iniciar-memoria.mjs`) e uma cópia do kit em `C:\MCP\continuidade`.
2. **O registro** do servidor `memoria-projeto` no Claude Code, uma vez para todos os projetos. Neste repositório ele
   usa a **memória versionada** (`.claude/continuidade/memoria/`); num repositório sem ela, a pessoal, em
   `C:\MCP\memorias`. Num worktree, vale a pasta principal do repositório.
3. **Os plugins** que o `.claude/settings.json` liga e ainda faltam, com o comando oficial
   (`claude plugin install <nome>@anthropic-plugin-directory --scope project`).
4. **O programa do LSP** do TypeScript (`npm install -g typescript-language-server typescript`).
5. **A memória automática do Claude:** oferece gravar no `.claude/settings.local.json` (pessoal, fora do Git) o ajuste
   oficial `autoMemoryDirectory` com o caminho da pasta `memoria-claude` deste clone (o valor tem de ser absoluto ou
   começar com `~/`). Antes, lista as notas da sua memória pessoal que são diferentes da versionada, para você juntar.
6. **As regras globais** (`~/.claude/CLAUDE.md`), só se você ainda não tiver; se tiver, não mexe.
7. **Avisa** se uma habilidade pessoal (`~/.claude/skills`) tem o nome de uma do projeto e é diferente: a pessoal ganha.

Rodar de novo não estraga nada: o que já está certo é pulado.

## Na hora da troca: uma pessoa por vez

No alto do `HANDOFF.md` fica a linha `Em uso por: <nome> desde <dd/mm/aaaa hh:mm>` ou `Em uso por: Livre`.

1. **Antes de começar:** `git pull` e leia a linha. Em uso por outra pessoa? **Não comece**: fale com ela. Livre? Ponha
   o seu nome e a data/hora, commit e push (assim a outra pessoa vê).
2. **Durante:** a cada marco, a memória e o `HANDOFF.md` são atualizados (regras globais); push como sempre.
3. **Ao parar:** a passagem completa (memória e `HANDOFF.md`), a linha volta a "Livre", commit e push.

A passagem de bastão vive na `main`. Por isso o **checkout principal fica na `main`** e o trabalho em ramo vai num
worktree (`git worktree add`). Abra o Claude sempre no checkout principal: é lá que estão a memória versionada e o
`settings.local.json` com o `autoMemoryDirectory`.

## O que fica pessoal (não vai para o Git)

- `.claude/settings.local.json`: as suas permissões e o `autoMemoryDirectory`.
- A chave `age` dos segredos, o `C:\MCP` (o programa e as memórias de outros projetos) e as regras globais.
- O histórico das conversas: cada conta tem o seu. Quem entra começa uma conversa nova, que lê o `HANDOFF.md`.

## Codex

Lê o `AGENTS.md` e as habilidades de `.agents/skills`. Para a memória, acrescente ao `~/.codex/config.toml`:

```toml
[mcp_servers.memoria-projeto]
command = "node"
args = ['C:\MCP\iniciar-memoria.mjs']
```

## Problemas

- `C:\MCP\aberturas.log` mostra cada abertura do servidor: data, pasta, arquivo e se a memória é "versionada" ou
  "pessoal".
- Se o `/mcp` não mostrar `memoria-projeto`, recarregue a janela do VS Code: o Claude só lê a lista de servidores
  quando liga.
- Conflito no `ieadespa.jsonl` depois de um `git pull` quer dizer que duas pessoas trabalharam ao mesmo tempo: junte as
  duas versões das linhas (cada linha é uma entidade) e reforce a regra da linha "Em uso por".
- `bash tools/conferir-habilidades.sh` confere que as duas pastas de habilidades estão iguais.

Versão do kit: 20/11/2026.
