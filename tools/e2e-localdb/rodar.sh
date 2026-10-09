#!/bin/bash
# Equipamento de verificação ponta a ponta contra um SQL Server LocalDB (ver README.md desta pasta).
#   bash rodar.sh preparar            recria o banco do zero, aplica TODAS as migrações pelo executor do deploy (~15 min), roda o setup do cenário e salva a base "cenario"
#   bash rodar.sh roteiro e2e-3-atos.js [e2e-5-seguranca.js ...]    restaura a base "cenario" (segundos) e roda os roteiros em sequência, no MESMO banco
AQUI="$(cd "$(dirname "$0")" && pwd)"
API="$AQUI/../../api"
PS="powershell.exe -NoProfile -ExecutionPolicy Bypass -File"
case "$1" in
  preparar)
    $PS "$AQUI/recriar-banco.ps1" | tail -1
    (cd "$API" && SQL_CONNECTION_STRING=x node -r "$AQUI/shim-mssql.js" scripts/executar-migracoes.js 2>&1 | grep -E "^✅|^❌|AVISO" | tail -5)
    (cd "$AQUI" && node -r ./shim-mssql.js e2e-1-setup.js 2>&1 | tail -8)
    $PS "$AQUI/bases.ps1" salvar cenario
    ;;
  roteiro)
    shift
    cd "$AQUI"
    $PS bases.ps1 restaurar cenario | tail -1
    for s in "$@"; do echo "################ $s"; node -r ./shim-mssql.js "$s" 2>&1 | tail -${LINHAS:-60}; done
    ;;
  *) echo "uso: bash rodar.sh preparar | roteiro <script.js>..."; exit 2 ;;
esac
