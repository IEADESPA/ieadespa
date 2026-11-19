#!/bin/bash
# conferir-deploy.sh — espera o deploy do sistema (fluxo "Governanca - CI/CD") de um commit e diz o resultado FINAL,
# já contando as repetições automáticas do firewall do banco (.github/workflows/sistema-repetir-deploy.yml).
# Sai com código 0 se publicou, 1 se o deploy terminou em falha, 2 se não achou deploy para o commit.
# Criado em 18/11/2026: três deploys da main falharam e foram dados como certos porque só o fim do comando foi lido.
#
# Uso: bash tools/conferir-deploy.sh [commit]      (sem argumento: o HEAD)
# Agentes: rodar em segundo plano e LER a última linha ("DEPLOY OK" ou "DEPLOY FALHOU").
set -u
SHA=$(git rev-parse "${1:-HEAD}")
FLUXO="Governanca - CI/CD"
ID=""
for _ in $(seq 1 30); do
  ID=$(gh run list --workflow "$FLUXO" --commit "$SHA" --limit 1 --json databaseId --jq '.[0].databaseId // empty')
  [ -n "$ID" ] && break
  sleep 10
done
if [ -z "$ID" ]; then
  echo "SEM DEPLOY: nenhum deploy do sistema para ${SHA:0:7} (o commit mexeu só em site/?)."
  exit 2
fi
while true; do
  gh run watch "$ID" --interval 30 > /dev/null 2>&1
  read -r CONCLUSAO TENTATIVA <<< "$(gh run view "$ID" --json conclusion,attempt --jq '"\(.conclusion) \(.attempt)"')"
  if [ "$CONCLUSAO" = "success" ]; then
    echo "DEPLOY OK: run $ID, tentativa $TENTATIVA, commit ${SHA:0:7}."
    exit 0
  fi
  if [ "$TENTATIVA" -lt 3 ]; then
    # dá tempo ao fluxo de repetição; se ele repetir, a run volta para a fila e o laço espera de novo
    sleep 120
    if [ "$(gh run view "$ID" --json status --jq .status)" != "completed" ]; then
      continue
    fi
  fi
  echo "DEPLOY FALHOU: run $ID, tentativa $TENTATIVA, conclusão '$CONCLUSAO', commit ${SHA:0:7}. AVISAR O RESPONSÁVEL."
  gh run view "$ID" --log-failed 2>/dev/null | grep -E "##\[error\]|Falha|falhou" | tail -5
  exit 1
done
