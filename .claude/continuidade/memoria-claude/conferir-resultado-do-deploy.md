---
name: conferir-resultado-do-deploy
description: "18/11 três deploys da main falharam (firewall do SQL contra o IP do runner) e eu não vi, porque li só o fim do comando; sempre ler a conclusão do run"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-18T19:51:32.221Z
---

Em 18/11/2026, três deploys seguidos da main falharam no passo "Executar Migrações SQL". O banco `srv-app-sql` recusou o
IP do runner do GitHub (100.62.x.x). Entre os três estava a correção do `motivoSaida` autorizada para a produção. Eu
rodei `gh run watch ...; echo saida=$?`, a notificação disse "exit code 0" (o do `echo`) e eu dei o deploy como certo.

**Why:** a regra 1 do CLAUDE.md manda conferir o deploy e informar o resultado. Correção que ele acha que está no ar e não
está é pior do que avisar que falhou.

**How to apply:**
- Depois de `gh run watch`, ler `gh run view <id> --json conclusion`, ou deixar o comando falhar com `--exit-status` sem
  um `echo` engolindo o código de saída.
- Falha de firewall do runner: rodar de novo UMA vez (`gh run rerun <id> --failed`), sem mexer no firewall sem perguntar.
- Se falhar de novo, avisar o responsável.
