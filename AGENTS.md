# Instruções para agentes (Codex e outros)

Antes de qualquer tarefa neste repositório:

1. Leia o [`CLAUDE.md`](CLAUDE.md): as regras obrigatórias (toda alteração vai para o GitHub na hora, segredo nunca em
   texto puro, protótipos antigos só para consulta).
2. Dê `git pull` e leia o [`HANDOFF.md`](HANDOFF.md) da raiz: o estado do trabalho e o próximo passo exato. Ele vai para
   o Git desde 20/11/2026, para quem entra continuar do mesmo ponto. **Uma pessoa por vez:** se a linha "Em uso por", no
   alto, tiver o nome de outra pessoa, não comece. Se estiver "Livre", ponha o seu nome e a data/hora, commit e push.
   Ao parar, faça a passagem completa, volte a linha para "Livre", commit e push (regra 4 do `CLAUDE.md`).
3. Consulte o servidor MCP `memoria-projeto` (`search_nodes`), se estiver configurado neste computador: os fatos duráveis
   do projeto (arquitetura, regras de negócio, decisões do responsável, pendências). Com o kit, o servidor usa a memória
   versionada em [`.claude/continuidade/memoria/`](.claude/continuidade/memoria/).
4. Confira `git status` e o ramo atual.

**Computador novo** (sem o `memoria-projeto` ou sem os plugins da bancada): para instalar, abra a pasta
`.claude\continuidade` e dê **dois cliques em `INSTALAR.cmd`**; ele pergunta antes de mudar qualquer configuração. O
agente pode rodar o instalador pela pessoa, **depois de pedir licença**: primeiro `INSTALAR.cmd -SoTestar` (só mostra o
que faria), mostra a lista e, com a licença, `INSTALAR.cmd -Sim`. Detalhes no
[`.claude/continuidade/LEIA-ME.md`](.claude/continuidade/LEIA-ME.md); a lista da bancada em
[`bancada.json`](.claude/continuidade/bancada.json).

O repositório é **público**: no `HANDOFF.md` e na memória, nada de senha, chave, token, CPF, endereço nem dado pessoal.

**Economia de créditos:** siga a seção 5 do [`CLAUDE.md`](CLAUDE.md) (agente novo com resumo em vez de fork, missões
curtas, relatório curto, mapa do sistema antes de arquivo grande); o esforço e o modelo continuam no máximo.

O contexto completo do sistema está no [`README.md`](README.md) e nos planos em [`docs/plano/`](docs/plano/).
Tudo em português do Brasil.
