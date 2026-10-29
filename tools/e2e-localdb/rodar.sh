#!/bin/bash
# Equipamento de verificação ponta a ponta contra um SQL Server LocalDB (ver README.md desta pasta).
#   bash rodar.sh preparar            recria o banco do zero, aplica TODAS as migrações pelo executor do deploy, roda o setup do cenário (e2e-1) e salva a base "cenario";
#                                     depois roda o setup da v7.7 (e2e-7) por cima e salva a base "cenario-menores"; e o da v7.8 (e2e-13) por cima e salva "cenario-protecao"
#   bash rodar.sh roteiro e2e-3-atos.js [e2e-5-seguranca.js ...]    restaura a base "cenario" (segundos) e roda os roteiros em sequência, no MESMO banco
#   BASE=cenario-menores bash rodar.sh roteiro e2e-8-menores.js ...  o mesmo, a partir da base da v7.7 (e2e-8 a e2e-12)
#   BASE=cenario-protecao bash rodar.sh roteiro e2e-14-protecao.js ...  o mesmo, a partir da base da v7.8 (e2e-14 a e2e-17)
#   bash rodar.sh preparar-pastoral   (v7.11) as migrações 145 a 155 sobre a base da v7.8 + o setup e2e-23; depois BASE=cenario-pastoral para e2e-24 a e2e-32 e e2e-39
#   bash rodar.sh preparar-crise      (v7.15) a migração 152 (duas vezes) sobre a base cenario-pastoral; depois BASE=cenario-crise para e2e-33 e e2e-34
#   bash rodar.sh preparar-trava7c    (Trava 7-C) as migrações 153, 154 e 155 (duas vezes) sobre a cenario-crise; depois BASE=cenario-trava7c para e2e-36, 37 e 40 a 46
#                                     (o e2e-35 roda sobre a cenario-crise: ele mesmo aplica a 153)
AQUI="$(cd "$(dirname "$0")" && pwd)"
API="$AQUI/../../api"
PS="powershell.exe -NoProfile -ExecutionPolicy Bypass -File"
# A base precisa ter sido restaurada ou salva DE VERDADE: sem a linha "restaurado:"/"salvo:", o roteiro para aqui (Trava 8-A: uma restauração que falhou calada
# deixou a bateria inteira rodar sobre uma base suja e acusar falhas que não eram do código).
# A migração precisa ter sido aplicada DE VERDADE (Trava 8-A: uma 160 que falhou no meio deixou a base salva sem as linhas de retenção).
migrar() {
  local saida
  saida="$(node -r ./shim-mssql.js aplicar-migracao.js "$@" 2>&1)"
  echo "$saida" | tail -2
  if ! echo "$saida" | grep -qE "^aplicada "; then echo "A MIGRAÇÃO $1 NÃO FOI APLICADA — o preparo parou aqui."; exit 1; fi
}
base() {
  local saida
  saida="$($PS "$AQUI/bases.ps1" "$@" 2>&1)"
  echo "$saida" | tail -1
  if ! echo "$saida" | grep -qE "^(restaurado|salvo): "; then echo "A BASE NÃO FICOU PRONTA ($1 $2) — o roteiro parou aqui."; exit 1; fi
}
case "$1" in
  preparar)
    $PS "$AQUI/recriar-banco.ps1" | tail -1
    (cd "$API" && SQL_CONNECTION_STRING=x node -r "$AQUI/shim-mssql.js" scripts/executar-migracoes.js 2>&1 | grep -E "^✅|^❌|AVISO" | tail -5)
    (cd "$AQUI" && node -r ./shim-mssql.js e2e-1-setup.js 2>&1 | tail -8)
    base salvar cenario
    (cd "$AQUI" && node -r ./shim-mssql.js e2e-7-setup.js 2>&1 | tail -${LINHAS:-12})
    base salvar cenario-menores
    (cd "$AQUI" && node -r ./shim-mssql.js e2e-13-protecao-setup.js 2>&1 | tail -${LINHAS:-12})
    base salvar cenario-protecao
    ;;
  preparar-checkin)
    # v7.10: a partir da base "cenario-protecao" (v7.8), aplica as migrações 145 a 147 (segundos), salva "protecao-145", roda o setup do check-in (e2e-18) e salva "cenario-checkin"
    cd "$AQUI"
    base restaurar cenario-protecao
    for m in 145 146 147; do migrar $m; done   # (146 e 147: Trava 7-B)
    base salvar protecao-145
    SAIDA="$(mktemp)"
    node -r ./shim-mssql.js e2e-18-checkin-setup.js > "$SAIDA" 2>&1; ESTADO=$?
    tail -${LINHAS:-12} "$SAIDA"; rm -f "$SAIDA"
    if [ "$ESTADO" -eq 0 ]; then base salvar cenario-checkin; else echo "O SETUP FALHOU: a base cenario-checkin NÃO foi salva."; exit 1; fi
    ;;
  preparar-pastoral)
    # v7.11: a partir da base "cenario-protecao" (v7.8), aplica as migrações 145 a 148 (a 148 duas vezes: prova a idempotência), salva "pastoral-148", roda o setup do cuidado
    # pastoral (e2e-23) e salva "cenario-pastoral"
    cd "$AQUI"
    base restaurar cenario-protecao
    for m in 145 146 147; do migrar $m; done
    migrar 148 2
    base salvar pastoral-148
    # v7.11.1: o mural do site (149), também duas vezes
    migrar 149 2
    # v7.12: a comunicação (150), também duas vezes
    migrar 150 2
    # v7.14: a identidade visual (151), também duas vezes
    migrar 151 2
    # v7.15: a crise (152) também entra aqui: os handlers da rotina diária e da exclusão LGPD já a usam, e os roteiros da v7.11 a v7.14 chamam esses handlers
    migrar 152
    # Trava 7-C: a 153 e a 154 também (a rotina diária e o cuidado pastoral já usam as colunas delas)
    migrar 153
    migrar 154
    # e a 155 (as decisões de 23/10/2026: a rotina diária já usa as regras e as colunas dela)
    migrar 155
    # v8.5: e da 156 à 161 — a rotina diária do cuidado roda a da trilha de discipulado (161) e o Meus Dados lê as colunas da fase 8: o esquema inteiro, como no deploy
    for m in 156 157 158 159 160 161; do migrar $m; done
    SAIDA="$(mktemp)"
    node -r ./shim-mssql.js e2e-23-cuidado-setup.js > "$SAIDA" 2>&1; ESTADO=$?
    tail -${LINHAS:-12} "$SAIDA"; rm -f "$SAIDA"
    if [ "$ESTADO" -eq 0 ]; then base salvar cenario-pastoral; else echo "O SETUP FALHOU: a base cenario-pastoral NÃO foi salva."; exit 1; fi
    ;;
  preparar-crise)
    # v7.15: a partir da base "cenario-pastoral" (v7.11 a v7.12), aplica a migração 152 duas vezes (prova a idempotência) e salva "cenario-crise" (e2e-33 e e2e-34).
    # Rode `bash rodar.sh preparar-pastoral` antes, se a base cenario-pastoral não existe.
    cd "$AQUI"
    base restaurar cenario-pastoral
    migrar 152 2
    base salvar cenario-crise
    ;;
  preparar-trava7c)
    # Trava 7-C: a partir da base "cenario-crise", aplica as migrações 153 e 154 duas vezes (prova a idempotência) e salva "cenario-trava7c" (e2e-36, e2e-37 e e2e-40 a e2e-42).
    # O e2e-35 roda sobre a "cenario-crise" (ele mesmo aplica a 153, para ver o antes e o depois).
    cd "$AQUI"
    base restaurar cenario-crise
    migrar 153 2
    # e a 154 (costuras), também duas vezes: uma base só para a Trava 7-C, como no deploy
    migrar 154 2
    # e a 155 (as decisões: dinheiro do voluntário e funções com menores), também duas vezes
    migrar 155 2
    base salvar cenario-trava7c
    ;;
  preparar-afm)
    # v8.1 (AFM e faltas da CLI): a partir da base "cenario-trava7c", reaplica a 153, a 154 e a 155 (idempotentes: a base fica igual ao deploy) e aplica a 156 duas vezes
    # (prova a idempotência); salva "cenario-afm" — degrau para a "cenario-escada". Desde a v8.3 o código da AFM lê colunas da 158 (CHM): os roteiros e2e-47 a e2e-50
    # rodam sobre a "cenario-escada" (BASE=cenario-escada), o esquema completo como no deploy (Trava 8-A).
    cd "$AQUI"
    base restaurar cenario-trava7c
    for m in 153 154 155; do migrar $m; done
    migrar 156 2
    base salvar cenario-afm
    ;;
  preparar-escada)
    # v8.2 (Escada ministerial): a partir da base "cenario-afm", aplica a 157 duas vezes (prova a idempotência); salva "cenario-escada" (e2e-47 a e2e-60: cada roteiro monta
    # o próprio cenário com lib-escada.js).
    cd "$AQUI"
    base restaurar cenario-afm
    migrar 157 2
    # v8.3 (Consagração e documentação): a 158 também, duas vezes — os roteiros da escada passam pela esteira nova (CEI, homologação, taxa, cerimônia); e2e-55 a e2e-58
    migrar 158 2
    # v8.4 (Credencial digital): a 159 também, duas vezes; e2e-59 e e2e-60
    migrar 159 2
    # Trava 8-A: a 160 também, duas vezes (a recusa do CEI, a CIADSETA, os motivos novos do encerramento, a limpeza única e a retenção); e2e-61
    migrar 160 2
    # v8.5 (Trilha de discipulado): a 161 também, duas vezes; e2e-62 e e2e-63
    migrar 161 2
    base salvar cenario-escada
    ;;
  roteiro)
    shift
    cd "$AQUI"
    base restaurar "${BASE:-cenario}"
    for s in "$@"; do echo "################ $s"; node -r ./shim-mssql.js "$s" 2>&1 | tail -${LINHAS:-60}; done
    ;;
  *) echo "uso: bash rodar.sh preparar | roteiro <script.js>..."; exit 2 ;;
esac
