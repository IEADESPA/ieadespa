---
name: azure-duas-contas-config-dir
description: Azure CLI desta máquina tem duas contas (igreja × outra associação); neste repositório usar AZURE_CONFIG_DIR=~/.azure-ieadespa
metadata:
  node_type: memory
  type: project
  originSessionId: da91e9b0-03ac-4d66-b670-429112727baa
  modified: 2026-10-06T13:17:49.758Z
---

A máquina tem duas contas do Azure: a da igreja (tenant `ieadespa.org.br`, usuário `ieadespa@ieadespa.org.br`, grupo de recursos `ieadespa`) e a de outra associação (ASAF, grupo `Associacao-RG`), usada por outro repositório em sessões paralelas. O login padrão do `az` é compartilhado e o último `az login` derruba o outro.

**Why:** em 06/10/2026 o `az` caía na conta da ASAF e o grupo `ieadespa` "não existia"; o responsável pediu que as leituras (custo, métricas) funcionassem sem atrapalhar a outra sessão.

**How to apply:** antes de qualquer `az` neste repositório, `export AZURE_CONFIG_DIR="$HOME/.azure-ieadespa"` (Git Bash). Se expirar, `az login --use-device-code --tenant ieadespa.org.br` em segundo plano, mostrar o código ao responsável e esperar. Mudança em produção só em modo manual. A API de custos (`az rest` em Microsoft.CostManagement/query) limita a ~1 consulta por minuto (429). Procedimento também registrado em `HOMOLOGACAO.md` ("Duas contas do Azure nesta máquina"). Ver [[testar-sql-na-homologacao]] e [[azure-swa-fatos-medidos]].
