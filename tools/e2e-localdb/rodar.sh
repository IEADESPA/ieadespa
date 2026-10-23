#!/bin/bash
# Equipamento de verificação ponta a ponta contra um SQL Server LocalDB (ver README.md desta pasta).
#   bash rodar.sh preparar            recria o banco do zero, aplica TODAS as migrações pelo executor do deploy, roda o setup do cenário (e2e-1) e salva a base "cenario";
#                                     depois roda o setup da v7.7 (e2e-7) por cima e salva a base "cenario-menores"; e o da v7.8 (e2e-13) por cima e salva "cenario-protecao"
#   bash rodar.sh roteiro e2e-3-atos.js [e2e-5-seguranca.js ...]    restaura a base "cenario" (segundos) e roda os roteiros em sequência, no MESMO banco
#   BASE=cenario-menores bash rodar.sh roteiro e2e-8-menores.js ...  o mesmo, a partir da base da v7.7 (e2e-8 a e2e-12)
#   BASE=cenario-protecao bash rodar.sh roteiro e2e-14-protecao.js ...  o mesmo, a partir da base da v7.8 (e2e-14 a e2e-17)
#   bash rodar.sh preparar-pastoral   (v7.11) as migrações 145 a 150 sobre a base da v7.8 + o setup e2e-23; depois BASE=cenario-pastoral para e2e-24 a e2e-30
#   bash rodar.sh preparar-crise      (v7.15) a migração 152 (duas vezes) sobre a base cenario-pastoral; depois BASE=cenario-crise para e2e-33 e e2e-34
#   bash rodar.sh preparar-trava7c    (Trava 7-C) as migrações 153 e 154 (duas vezes) sobre a cenario-crise; depois BASE=cenario-trava7c para e2e-36, 37 e 40 a 42
#                                     (o e2e-35 roda sobre a cenario-crise: ele mesmo aplica a 153)
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
    # v7.10: a partir da base "cenario-protecao" (v7.8), aplica as migrações 145 a 147 (segundos), salva "protecao-145", roda o setup do check-in (e2e-18) e salva "cenario-checkin"
    cd "$AQUI"
    $PS bases.ps1 restaurar cenario-protecao | tail -1
    for m in 145 146 147; do node -r ./shim-mssql.js aplicar-migracao.js $m 2>&1 | tail -2; done   # (146 e 147: Trava 7-B)
    $PS bases.ps1 salvar protecao-145 | tail -1
    SAIDA="$(mktemp)"
    node -r ./shim-mssql.js e2e-18-checkin-setup.js > "$SAIDA" 2>&1; ESTADO=$?
    tail -${LINHAS:-12} "$SAIDA"; rm -f "$SAIDA"
    if [ "$ESTADO" -eq 0 ]; then $PS bases.ps1 salvar cenario-checkin | tail -1; else echo "O SETUP FALHOU: a base cenario-checkin NÃO foi salva."; exit 1; fi
    ;;
  preparar-pastoral)
    # v7.11: a partir da base "cenario-protecao" (v7.8), aplica as migrações 145 a 148 (a 148 duas vezes: prova a idempotência), salva "pastoral-148", roda o setup do cuidado
    # pastoral (e2e-23) e salva "cenario-pastoral"
    cd "$AQUI"
    $PS bases.ps1 restaurar cenario-protecao | tail -1
    for m in 145 146 147; do node -r ./shim-mssql.js aplicar-migracao.js $m 2>&1 | tail -2; done
    node -r ./shim-mssql.js aplicar-migracao.js 148 2 2>&1 | tail -2
    $PS bases.ps1 salvar pastoral-148 | tail -1
    # v7.11.1: o mural do site (149), também duas vezes
    node -r ./shim-mssql.js aplicar-migracao.js 149 2 2>&1 | tail -2
    # v7.12: a comunicação (150), também duas vezes
    node -r ./shim-mssql.js aplicar-migracao.js 150 2 2>&1 | tail -2
    SAIDA="$(mktemp)"
    node -r ./shim-mssql.js e2e-23-cuidado-setup.js > "$SAIDA" 2>&1; ESTADO=$?
    tail -${LINHAS:-12} "$SAIDA"; rm -f "$SAIDA"
    if [ "$ESTADO" -eq 0 ]; then $PS bases.ps1 salvar cenario-pastoral | tail -1; else echo "O SETUP FALHOU: a base cenario-pastoral NÃO foi salva."; exit 1; fi
    ;;
  preparar-crise)
    # v7.15: a partir da base "cenario-pastoral" (v7.11 a v7.12), aplica a migração 152 duas vezes (prova a idempotência) e salva "cenario-crise" (e2e-33 e e2e-34).
    # Rode `bash rodar.sh preparar-pastoral` antes, se a base cenario-pastoral não existe.
    cd "$AQUI"
    $PS bases.ps1 restaurar cenario-pastoral | tail -1
    node -r ./shim-mssql.js aplicar-migracao.js 152 2 2>&1 | tail -2
    $PS bases.ps1 salvar cenario-crise | tail -1
    ;;
  preparar-trava7c)
    # Trava 7-C: a partir da base "cenario-crise", aplica as migrações 153 e 154 duas vezes (prova a idempotência) e salva "cenario-trava7c" (e2e-36, e2e-37 e e2e-40 a e2e-42).
    # O e2e-35 roda sobre a "cenario-crise" (ele mesmo aplica a 153, para ver o antes e o depois).
    cd "$AQUI"
    $PS bases.ps1 restaurar cenario-crise | tail -1
    node -r ./shim-mssql.js aplicar-migracao.js 153 2 2>&1 | tail -2
    # e a 154 (costuras), também duas vezes: uma base só para a Trava 7-C, como no deploy
    node -r ./shim-mssql.js aplicar-migracao.js 154 2 2>&1 | tail -2
    $PS bases.ps1 salvar cenario-trava7c | tail -1
    ;;
  roteiro)
    shift
    cd "$AQUI"
    $PS bases.ps1 restaurar "${BASE:-cenario}" | tail -1
    for s in "$@"; do echo "################ $s"; node -r ./shim-mssql.js "$s" 2>&1 | tail -${LINHAS:-60}; done
    ;;
  *) echo "uso: bash rodar.sh preparar | roteiro <script.js>..."; exit 2 ;;
esac
