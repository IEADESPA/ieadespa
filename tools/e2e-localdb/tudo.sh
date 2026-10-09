#!/bin/bash
# tudo.sh — a bateria inteira (v7.6 e v7.7), cada grupo de roteiros sobre a sua base restaurada. Rode `bash rodar.sh preparar` antes se o esquema mudou.
AQUI="$(cd "$(dirname "$0")" && pwd)"
cd "$AQUI"
export LINHAS=${LINHAS:-40}
bash rodar.sh roteiro e2e-3-atos.js e2e-5-seguranca.js
bash rodar.sh roteiro e2e-2-vinculos.js
bash rodar.sh roteiro e2e-4-vistoria.js
bash rodar.sh roteiro e2e-6-corridas.js
BASE=cenario-menores bash rodar.sh roteiro e2e-8-menores.js
BASE=cenario-menores bash rodar.sh roteiro e2e-9-menores-seguranca.js
BASE=cenario-menores bash rodar.sh roteiro e2e-10-menores-corridas.js
echo TUDO-PRONTO
