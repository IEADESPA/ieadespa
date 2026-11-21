#!/bin/bash
# conferir-bancada.sh — confere a PORTA da bancada neste repositório (a bancada em si mora no repositório privado
# IEADESPA/bancada, baixado em C:\MCP\bancada; desde 21/11/2026 nada do kit é copiado para cá):
#   1. a porta (.claude/continuidade: INSTALAR.cmd, porta.sh e LEIA-ME.md) é igual ao modelo C:\MCP\bancada\porta;
#   2. não sobrou cópia velha do kit em .claude/continuidade nem habilidades copiadas (.claude/skills, .agents/skills);
#   3. o .claude/settings.json liga a porta (gancho SessionStart com .claude/continuidade/porta.sh).
# Rodar depois de mudar a porta na bancada (e copiá-la para cá). Sem a bancada neste computador, o item 1 avisa.
#
# Uso: bash tools/conferir-bancada.sh      (sai com 0 se tudo confere, 1 se não)
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1
BANCADA="${BANCADA_BASE:-C:/MCP}"
BANCADA="${BANCADA//\\//}/bancada"
ERROS=0

# 1. A porta contra o modelo (ignora só o fim de linha do Windows).
if [ ! -d "$BANCADA/porta" ]; then
  echo "Sem a bancada neste computador ($BANCADA): dois cliques em .claude\\continuidade\\INSTALAR.cmd."
  ERROS=1
else
  for arquivo in INSTALAR.cmd porta.sh LEIA-ME.md; do
    if ! diff -q <(tr -d '\r' < "$BANCADA/porta/$arquivo") <(tr -d '\r' < ".claude/continuidade/$arquivo" 2>/dev/null) > /dev/null; then
      echo "A porta está diferente do modelo: .claude/continuidade/$arquivo (copie de $BANCADA/porta/$arquivo)."
      ERROS=1
    fi
  done
fi

# 2. Nada de cópia velha do kit nem de habilidades copiadas.
for velho in instalar-memoria.ps1 aviso-inicio.mjs bancada.json iniciar-memoria.mjs regras-globais.md ajustar-config.mjs; do
  if [ -e ".claude/continuidade/$velho" ]; then
    echo "Cópia velha do kit: .claude/continuidade/$velho (a bancada é a fonte; apague daqui)."
    ERROS=1
  fi
done
for pasta in .claude/skills .agents/skills; do
  if [ -d "$pasta" ]; then
    echo "Habilidades copiadas em $pasta: elas vêm da bancada (junções em ~/.claude/skills); apague daqui."
    ERROS=1
  fi
done

# 3. O gancho da porta no .claude/settings.json.
if ! node -e '
  const s = JSON.parse(require("fs").readFileSync(".claude/settings.json", "utf8"));
  const ganchos = JSON.stringify(s.hooks?.SessionStart ?? []);
  process.exit(ganchos.includes("continuidade/porta.sh") ? 0 : 1);
'; then
  echo "O .claude/settings.json não liga a porta (gancho SessionStart com .claude/continuidade/porta.sh)."
  ERROS=1
fi

if [ "$ERROS" -eq 0 ]; then
  echo "BANCADA OK: a porta é igual ao modelo da bancada, sem cópia velha do kit, e o gancho está ligado."
else
  echo "BANCADA COM DIFERENÇA: veja acima."
  exit 1
fi
