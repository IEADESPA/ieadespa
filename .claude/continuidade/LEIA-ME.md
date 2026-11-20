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
| Bancada | `.claude/continuidade/bancada.json` | A lista de TUDO o que a bancada usa: plugins, habilidades e programas |
| Habilidades | `.claude/skills/` (Claude Code) e `.agents/skills/` (Codex), iguais | As 6 de desenho, com a licença de cada uma |
| Plugins | `.claude/settings.json` | Liga os 5 plugins oficiais do projeto (instalar é com o kit) |
| Desenho | `design/propostas/` | Os fontes da página de propostas da rodada atual |

**A bancada inteira** (`bancada.json`):

- **5 plugins oficiais:** `claude-security`, `pr-review-toolkit`, `typescript-lsp`, `microsoft-docs` e
  `claude-md-management` (catálogo `anthropic-plugin-directory`).
- **6 habilidades:** `frontend-design`, `emil-design-eng`, `mobile-native`, `review-animations`,
  `diretrizes-interface-web` e `guias-web-modernas`.
- **Da conta da organização no claude.ai:** o plugin **Claude for Nonprofits** (`claude-for-nonprofits@synced`) fica
  ligado. Ele não vem do repositório: chega sozinho a quem faz o login com a conta da organização.
- **Programa:** o `typescript-language-server`, que o plugin `typescript-lsp` usa.
- **Configuração pessoal:** `autoCompactWindow` = 400000 (economia de créditos), oferecida pelo instalador.

Para **acrescentar** depois: o plugin numa linha da lista `plugins` e no `enabledPlugins` do `.claude/settings.json`;
a habilidade na pasta `.claude/skills/<nome>` e na `.agents/skills/<nome>` (com `LICENSE` e `ORIGEM.md`) e numa linha
da lista `habilidades`. Confira com `bash tools/conferir-bancada.sh`. Quem rodar o instalador de novo recebe o novo.

## Uma vez por computador

Quem vai usar é o **Presidente**, que já tem acesso ao repositório `IEADESPA/ieadespa` no GitHub e às chaves dos
segredos. Para outra pessoa, o responsável dá antes a escrita no repositório, o papel de **editor** nas páginas de
propostas (Artifacts da organização, botão Share) e a chave `age` dos segredos (passos do [`SECRETS.md`](../../SECRETS.md)).

1. **Programas:** Git, Node.js 22 ou mais novo (`winget install OpenJS.NodeJS.LTS`), VS Code com a extensão do Claude
   Code e o login com a **conta da organização**.
2. **Clonar** e abrir a pasta no VS Code, aceitando o aviso de confiança da pasta:

   ```powershell
   git clone https://github.com/IEADESPA/ieadespa.git
   ```

3. **Instalar com dois cliques:** abra a pasta `.claude\continuidade` do repositório (no Explorador de Arquivos) e dê
   **dois cliques em `INSTALAR.cmd`**. Uma janela abre, mostra cada passo e **pergunta antes de mudar qualquer
   configuração** sua (responda S ou N). Ele libera o PowerShell só para ele mesmo; a política do computador não muda.
   - **Ou peça ao Claude:** ao abrir o repositório, o Claude pode rodar o instalador por você. Ele roda primeiro em modo
     de teste (`INSTALAR.cmd -SoTestar`, que só mostra o que faria), mostra a lista, **pede a sua licença** e só então
     roda com `-Sim`.
4. **Conferir:** `Ctrl+Shift+P` → "Recarregar Janela". Numa conversa nova do Claude: `/mcp` mostra `memoria-projeto`
   conectado, `/plugins` mostra os plugins da bancada e `/memory` mostra a pasta da memória automática.

## O que o instalador faz (cada mudança com pergunta)

1. **O servidor de memória** (`@modelcontextprotocol/server-memory` 2.1.1, licença MIT) em `C:\MCP`, com versão fixa,
   mais o programa de partida (`iniciar-memoria.mjs`) e uma cópia do kit em `C:\MCP\continuidade`.
2. **O registro** do servidor `memoria-projeto` no Claude Code, uma vez para todos os projetos. Neste repositório ele
   usa a **memória versionada** (`.claude/continuidade/memoria/`); num repositório sem ela, a pessoal, em
   `C:\MCP\memorias`. Num worktree, vale a pasta principal do repositório.
3. **Os plugins** da `bancada.json` que ainda faltam, com o comando oficial
   (`claude plugin install <nome>@anthropic-plugin-directory --scope project`), e confere os que vêm da conta.
4. **As habilidades:** confere que as da lista estão nas duas pastas e avisa se uma habilidade pessoal
   (`~/.claude/skills`) com o mesmo nome é diferente (a pessoal ganharia da do projeto). Nunca apaga nada.
5. **Os programas** dos plugins (`npm install -g typescript-language-server typescript`).
6. **A memória automática do Claude:** oferece gravar no `.claude/settings.local.json` (pessoal, fora do Git) o ajuste
   oficial `autoMemoryDirectory` com o caminho da pasta `memoria-claude` deste clone (o valor tem de ser absoluto ou
   começar com `~/`). Antes, lista as notas da sua memória pessoal que são diferentes da versionada, para você juntar.
7. **As configurações pessoais da bancada** (`configuracoesPessoais` da `bancada.json`), em `~/.claude/settings.json`:
   hoje, `autoCompactWindow` = 400000, que resume a conversa mais cedo (economia de créditos). As outras regras de
   economia estão na seção 5 do `CLAUDE.md` da raiz; para medir, `tools/medir-creditos/`.
8. **As regras globais** (`~/.claude/CLAUDE.md`), só se você ainda não tiver; se tiver, não mexe.

Rodar de novo não estraga nada: o que já está certo é pulado. Pelo PowerShell, o mesmo instalador:
`powershell -ExecutionPolicy Bypass -File .\.claude\continuidade\instalar-memoria.ps1` (com `-SoTestar` ou `-Sim`).

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
- `bash tools/conferir-bancada.sh` confere que as duas pastas de habilidades estão iguais e batem com a `bancada.json`.

Versão do kit: 20/11/2026.
