#!/bin/bash
# tudo.sh — a bateria inteira (v7.6, v7.7, v7.8, v7.10, v7.11, v7.11.1, v7.12, v7.14 e v7.15), cada grupo de roteiros sobre a sua base restaurada. Rode `bash rodar.sh preparar` antes se o esquema mudou.
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
BASE=cenario-menores bash rodar.sh roteiro e2e-11-consentimento-canais.js
BASE=cenario-menores bash rodar.sh roteiro e2e-12-revisao-lote2.js
BASE=cenario-protecao bash rodar.sh roteiro e2e-14-protecao.js
BASE=cenario-protecao bash rodar.sh roteiro e2e-15-protecao-seguranca.js
BASE=cenario-protecao bash rodar.sh roteiro e2e-16-protecao-corridas.js
BASE=cenario-protecao bash rodar.sh roteiro e2e-17-protecao-revisao.js
bash rodar.sh preparar-checkin
BASE=cenario-checkin bash rodar.sh roteiro e2e-19-checkin-fluxos.js
BASE=cenario-checkin bash rodar.sh roteiro e2e-20-checkin-seguranca.js
BASE=cenario-checkin bash rodar.sh roteiro e2e-21-checkin-corridas.js
BASE=cenario-checkin bash rodar.sh roteiro e2e-22-checkin-revisao.js
BASE=cenario-checkin bash rodar.sh roteiro e2e-38-trava7c-saude-revogacao.js
bash rodar.sh preparar-pastoral
BASE=cenario-pastoral bash rodar.sh roteiro e2e-24-cuidado-fluxos.js
BASE=cenario-pastoral bash rodar.sh roteiro e2e-25-cuidado-seguranca.js
BASE=cenario-pastoral bash rodar.sh roteiro e2e-26-cuidado-corridas.js
BASE=cenario-pastoral bash rodar.sh roteiro e2e-27-cuidado-revisao.js
BASE=cenario-pastoral bash rodar.sh roteiro e2e-28-mural-site.js
BASE=cenario-pastoral bash rodar.sh roteiro e2e-29-comunicacao.js
BASE=cenario-pastoral bash rodar.sh roteiro e2e-30-comunicacao-corridas.js
BASE=cenario-pastoral bash rodar.sh roteiro e2e-31-identidade.js
BASE=cenario-pastoral bash rodar.sh roteiro e2e-32-identidade-corridas.js
BASE=cenario-pastoral bash rodar.sh roteiro e2e-39-identidade-rcsi.js
bash rodar.sh preparar-crise
BASE=cenario-crise bash rodar.sh roteiro e2e-33-crise.js
BASE=cenario-crise bash rodar.sh roteiro e2e-34-crise-corridas.js
BASE=cenario-crise bash rodar.sh roteiro e2e-35-trava7c-politicas.js
bash rodar.sh preparar-trava7c
BASE=cenario-trava7c bash rodar.sh roteiro e2e-36-trava7c-retencao.js
BASE=cenario-trava7c bash rodar.sh roteiro e2e-37-trava7c-madrugada.js
BASE=cenario-trava7c bash rodar.sh roteiro e2e-40-trava7c-cuidado.js
BASE=cenario-trava7c bash rodar.sh roteiro e2e-41-trava7c-crise-comunicacao.js
BASE=cenario-trava7c bash rodar.sh roteiro e2e-42-trava7c-corridas.js
# Trava 7-C, as decisões de 23/10/2026 (migração 155): o dinheiro do voluntário só avisa; funções com menores em departamentos e liderança
BASE=cenario-trava7c bash rodar.sh roteiro e2e-43-trava7c-voluntario-pagamento.js
BASE=cenario-trava7c bash rodar.sh roteiro e2e-44-trava7c-funcoes-menores.js
BASE=cenario-trava7c bash rodar.sh roteiro e2e-45-trava7c-decisoes-seguranca.js
BASE=cenario-trava7c bash rodar.sh roteiro e2e-46-trava7c-decisoes-corridas.js
# v8.1 a v8.4 (migrações 156 a 159): a "cenario-afm" é só o degrau; todo roteiro roda sobre a "cenario-escada", o esquema completo como no deploy
# (desde a v8.3 o código da AFM lê as colunas do CHM da 158 — Trava 8-A)
bash rodar.sh preparar-afm
bash rodar.sh preparar-escada
BASE=cenario-escada bash rodar.sh roteiro e2e-47-afm-fluxos.js
BASE=cenario-escada bash rodar.sh roteiro e2e-48-afm-seguranca.js
BASE=cenario-escada bash rodar.sh roteiro e2e-49-afm-corridas.js
BASE=cenario-escada bash rodar.sh roteiro e2e-50-afm-revisao.js
# v8.2 (Escada ministerial, migração 157): cada roteiro sobre a base sozinho
BASE=cenario-escada bash rodar.sh roteiro e2e-51-escada-fluxos.js
BASE=cenario-escada bash rodar.sh roteiro e2e-52-escada-seguranca.js
BASE=cenario-escada bash rodar.sh roteiro e2e-53-escada-corridas.js
BASE=cenario-escada bash rodar.sh roteiro e2e-54-escada-revisao.js
# v8.3 (Consagração e documentação, migração 158 — a "preparar-escada" já a aplica): cada roteiro sobre a base sozinho
BASE=cenario-escada bash rodar.sh roteiro e2e-55-consagracao-fluxos.js
BASE=cenario-escada bash rodar.sh roteiro e2e-56-consagracao-seguranca.js
BASE=cenario-escada bash rodar.sh roteiro e2e-57-consagracao-corridas.js
BASE=cenario-escada bash rodar.sh roteiro e2e-58-consagracao-revisao.js
# v8.4 (Credencial digital, migração 159 — a "preparar-escada" já a aplica)
BASE=cenario-escada bash rodar.sh roteiro e2e-59-credencial.js
BASE=cenario-escada bash rodar.sh roteiro e2e-60-credencial-corridas.js
# Trava 8-A (migração 160 — a "preparar-escada" já a aplica)
BASE=cenario-escada bash rodar.sh roteiro e2e-61-trava8a.js
echo TUDO-PRONTO
