# Instruções para agentes (Codex e outros)

Antes de qualquer tarefa neste repositório:

1. Leia o [`CLAUDE.md`](CLAUDE.md): as regras obrigatórias (toda alteração vai para o GitHub na hora, segredo nunca em
   texto puro, protótipos antigos só para consulta).
2. Dê `git pull` e leia o [`HANDOFF.md`](HANDOFF.md) da raiz: o estado do trabalho e o próximo passo exato. Ele vai para
   o Git desde 20/11/2026, para quem entra continuar do mesmo ponto. **Uma pessoa por vez:** se a linha "Em uso por", no
   alto, tiver o nome de outra pessoa, não comece. Se estiver "Livre", ponha o seu nome e a data/hora, commit e push.
   Ao parar, faça a passagem completa, volte a linha para "Livre", commit e push (regra 4 do `CLAUDE.md`).
3. Rode o aviso de início da bancada: `node C:/MCP/bancada/aviso-inicio.mjs` (o Claude Code roda sozinho; o Codex, não).
   Ele atualiza a bancada e mostra a linha "Em uso por", o `git pull` que falta e o que o computador tem de diferente
   da bancada. Conte à pessoa o que ele avisar.
4. Consulte o servidor MCP `memoria-projeto` (`search_nodes`), se estiver configurado neste computador: os fatos duráveis
   do projeto (arquitetura, regras de negócio, decisões do responsável, pendências). O servidor usa a memória
   versionada em [`.claude/continuidade/memoria/`](.claude/continuidade/memoria/).
5. Confira `git status` e o ramo atual.

**A bancada** (instalador, aviso de início, servidor de memória, habilidades, regras globais e a lista `bancada.json`)
mora no repositório privado `IEADESPA/bancada`, baixado em `C:\MCP\bancada`; aqui fica só a **porta**, em
[`.claude/continuidade/`](.claude/continuidade/LEIA-ME.md). **Computador novo** (sem `C:\MCP\bancada`): abra a pasta
`.claude\continuidade` e dê **dois cliques em `INSTALAR.cmd`**; ele baixa a bancada (o login do GitHub abre no
navegador) e pergunta antes de mudar qualquer configuração. O agente pode rodar pela pessoa, **depois de pedir
licença**: primeiro `INSTALAR.cmd -SoTestar` (só mostra o que faria), mostra a lista e, com a licença,
`INSTALAR.cmd -Sim`. Para a memória no Codex, o `~/.codex/config.toml` aponta o servidor para a bancada (o trecho está
no `C:\MCP\bancada\LEIA-ME.md`).

O repositório é **público**: no `HANDOFF.md` e na memória, nada de senha, chave, token, CPF, endereço nem dado pessoal.

**Economia de créditos:** siga a seção 5 do [`CLAUDE.md`](CLAUDE.md) (agente novo com resumo em vez de fork, missões
curtas, relatório curto, mapa do sistema antes de arquivo grande); o esforço e o modelo continuam no máximo.

O contexto completo do sistema está no [`README.md`](README.md) e nos planos em [`docs/plano/`](docs/plano/).
Tudo em português do Brasil.
