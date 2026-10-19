#!/bin/bash
# Equipamento de verificação ponta a ponta contra um SQL Server LocalDB (ver README.md desta pasta).
#   bash rodar.sh preparar            recria o banco do zero, aplica TODAS as migrações pelo executor do deploy, roda o setup do cenário (e2e-1) e salva a base "cenario";
#                                     depois roda o setup da v7.7 (e2e-7) por cima e salva a base "cenario-menores"; e o da v7.8 (e2e-13) por cima e salva "cenario-protecao"
#   bash rodar.sh roteiro e2e-3-atos.js [e2e-5-seguranca.js ...]    restaura a base "cenario" (segundos) e roda os roteiros em sequência, no MESMO banco
#   BASE=cenario-menores bash rodar.sh roteiro e2e-8-menores.js ...  o mesmo, a partir da base da v7.7 (e2e-8 a e2e-12)
#   BASE=cenario-protecao bash rodar.sh roteiro e2e-14-protecao.js ...  o mesmo, a partir da base da v7.8 (e2e-14 a e2e-17)
AQUI="$(cd "$(dirname "$0")" && pwd)"
API="$AQUI/../../api"
PS="powershell.exe -NoProfile -ExecutionPolicy Bypass -File"
case "$1" in
  preparar)
    $PS "$AQUI/recriar-banco.ps1" | tail -1
    (cd "$API" && SQL_CONNECTION_STRING=x node -r "$AQUI/shim-mssql.js" scripts/executar-migracoes.js 2>&1 | grep -E "^✅|^❌|AVISO" | tail -5)
    (cd "$AQUI" && node -r ./shim-mssql.js e2e-1-setup.js 2>&1 | tail -8)
    $PS "$AQUI/bases.ps1" salvar cenario
    (cd "$AQUI" && node -r ./shim-mssql.js e2e-7-setup.js 2>&1 | tail -${LINHAS:-12})
    $PS "$AQUI/bases.ps1" salvar cenario-menores
    (cd "$AQUI" && node -r ./shim-mssql.js e2e-13-protecao-setup.js 2>&1 | tail -${LINHAS:-12})
    $PS "$AQUI/bases.ps1" salvar cenario-protecao
    ;;
  preparar-checkin)
    # v7.10: a partir da base "cenario-protecao" (v7.8), aplica só a migração 145 (segundos), salva "protecao-145", roda o setup do check-in (e2e-18) e salva "cenario-checkin"
    cd "$AQUI"
    $PS bases.ps1 restaurar cenario-protecao | tail -1
    node -r ./shim-mssql.js aplicar-migracao.js 145 2>&1 | tail -2
    $PS bases.ps1 salvar protecao-145 | tail -1
    SAIDA="$(mktemp)"
    node -r ./shim-mssql.js e2e-18-checkin-setup.js > "$SAIDA" 2>&1; ESTADO=$?
    tail -${LINHAS:-12} "$SAIDA"; rm -f "$SAIDA"
    if [ "$ESTADO" -eq 0 ]; then $PS bases.ps1 salvar cenario-checkin | tail -1; else echo "O SETUP FALHOU: a base cenario-checkin NÃO foi salva."; exit 1; fi
    ;;
  roteiro)
    shift
    cd "$AQUI"
    $PS bases.ps1 restaurar "${BASE:-cenario}" | tail -1
    for s in "$@"; do echo "################ $s"; node -r ./shim-mssql.js "$s" 2>&1 | tail -${LINHAS:-60}; done
    ;;
  *) echo "uso: bash rodar.sh preparar | roteiro <script.js>..."; exit 2 ;;
esac
