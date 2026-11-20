#!/bin/bash
# conferir-habilidades.sh — confere que as habilidades do Claude Code (.claude/skills) e as do Codex (.agents/skills)
# são as mesmas, arquivo por arquivo. Cada ferramenta só procura na própria pasta, por isso a cópia fica nas duas
# (atalho simbólico dá problema no Windows). Rodar depois de acrescentar ou atualizar uma habilidade.
#
# Uso: bash tools/conferir-habilidades.sh      (sai com 0 se iguais, 1 se diferentes)
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1
if diff -rq .claude/skills .agents/skills; then
  echo "HABILIDADES IGUAIS: $(ls .claude/skills | wc -l) pastas em .claude/skills e .agents/skills."
else
  echo "HABILIDADES DIFERENTES: copie a pasta alterada para as duas (cp -r) e rode de novo."
  exit 1
fi
