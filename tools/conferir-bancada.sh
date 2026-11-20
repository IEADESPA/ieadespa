#!/bin/bash
# conferir-bancada.sh — confere que a bancada está inteira e igual nos três lugares:
#   1. as habilidades do Claude Code (.claude/skills) e as do Codex (.agents/skills) são as mesmas, arquivo por arquivo
#      (cada ferramenta só procura na própria pasta; atalho simbólico dá problema no Windows);
#   2. a lista .claude/continuidade/bancada.json (que o instalador lê) tem exatamente essas habilidades;
#   3. os plugins da lista são os mesmos que o .claude/settings.json liga.
# Rodar depois de acrescentar ou atualizar um plugin ou uma habilidade.
#
# Uso: bash tools/conferir-bancada.sh      (sai com 0 se tudo confere, 1 se não)
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1
ERROS=0
if ! diff -rq .claude/skills .agents/skills; then
  echo "As pastas de habilidades são diferentes: copie a pasta alterada para as duas (cp -r)."
  ERROS=1
fi
node - <<'JS' || ERROS=1
const fs = require("fs");
const bancada = JSON.parse(fs.readFileSync(".claude/continuidade/bancada.json", "utf8"));
const projeto = JSON.parse(fs.readFileSync(".claude/settings.json", "utf8"));
const diferenca = (a, b) => a.filter((x) => !b.includes(x));
const pastas = fs.readdirSync(".claude/skills").filter((n) => fs.statSync(".claude/skills/" + n).isDirectory());
const listadas = bancada.habilidades.map((h) => h.nome);
const ligados = Object.keys(projeto.enabledPlugins || {}).filter((k) => projeto.enabledPlugins[k] === true);
const plugins = bancada.plugins.map((p) => p.id);
const problemas = [
  ...diferenca(listadas, pastas).map((n) => `habilidade na lista sem pasta em .claude/skills: ${n}`),
  ...diferenca(pastas, listadas).map((n) => `pasta em .claude/skills fora da lista bancada.json: ${n}`),
  ...pastas.filter((n) => !fs.existsSync(`.claude/skills/${n}/SKILL.md`)).map((n) => `habilidade sem SKILL.md: ${n}`),
  ...diferenca(plugins, ligados).map((p) => `plugin na lista que o .claude/settings.json não liga: ${p}`),
  ...diferenca(ligados, plugins).map((p) => `plugin ligado no .claude/settings.json fora da lista bancada.json: ${p}`),
];
problemas.forEach((p) => console.log(p));
if (problemas.length) process.exit(1);
console.log(`Lista confere: ${plugins.length} plugins e ${listadas.length} habilidades.`);
JS
if [ "$ERROS" -eq 0 ]; then
  echo "BANCADA OK: habilidades iguais em .claude/skills e .agents/skills; lista e settings.json conferem."
else
  echo "BANCADA COM DIFERENÇA: veja acima."
  exit 1
fi
