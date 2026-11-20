---
name: urls-producao-e-homologacao
description: "Site = https://ieadespa.org.br (sem www desde 08/10/2026; www→301); Produção do sistema = app.ieadespa.org.br; homologação do sistema = preview do PR #21 (white-grass-...-21...), branch homolog; o PR #1 foi fechado sozinho pelo GitHub em 07/10/2026 quando a main recebeu um merge do homolog — nunca mesclar o homolog na main"
metadata:
  node_type: memory
  type: reference
  originSessionId: b78b5f11-8f29-43b6-a1a1-18ef263a2c3b
  modified: 2026-10-07T14:18:59.881Z
---

- **Produção:** `https://app.ieadespa.org.br` (API em `/api/...`; agenda pública em `/api/agenda-publica/tudo`; o front em `/`).
- **Homologação do sistema (preview do PR #21, branch `homolog`):** `https://white-grass-048208e0f-21.eastus2.6.azurestaticapps.net` — banco `ieadespa-homolog`, migrado e semeado pelo próprio fluxo do PR a cada push no `homolog` (desde 06-07/10/2026; massa fictícia: matrículas 900001-900060, senha dos líderes em `SEED_SENHA`, padrão do script). **Não** recebe os deploys de `main`.
- **Fluxo:** `git checkout homolog && git merge main && git push origin homolog` (traz a main para a homolog). Para levar uma mudança provada à produção, mesclar na `main` o **ramo da mudança** — **nunca `git merge homolog` na main**: o GitHub fecha o PR como "mesclado" assim que a ponta do `homolog` entra na `main`, e o fluxo apaga o ambiente (aconteceu com o PR #1 em 07/10/2026, ao mesclar o merge da gaveta vD.6; o PR #21 o substituiu). O arquivo `RAMO-HOMOLOG.txt` existe só no `homolog` e explica isso.
- O teste de tela (`sistema-testes-tela.yml`) roda em push no `homolog` também (fila por ramo): a prova de uma mudança de `app/**` sai lá antes da `main`.

**Pegadinha de 04/10/2026:** a homologação tinha um backend ligado (`func-ieadespa-api`, Function App antigo) e a API dela era esse aplicativo, não o código do PR — rota nova dava 404 ali. Ligação desfeita e aplicativo apagado; o PR publica a API do projeto também no preview. Sinal de alerta se voltar: `az staticwebapp backends show -n app-meusite-web -g ieadespa --environment-name 21` com 1 item. "Backend call failure" 500 no primeiro acesso após deploy = aquecimento.

**Why:** na v7.5 testei rotas novas na homologação, tudo deu 404, e quase concluí que o deploy falhou; em 03/10 conferi "na homologação" um código que ela nem rodava; em 07/10 o ambiente sumiu por um merge na direção errada.

**How to apply:** depois de um deploy de `main`, verificar em `app.ieadespa.org.br` (rotas protegidas 401 sem sessão; `curl -s https://app.ieadespa.org.br/script.js | grep -c "<marcador>"` confirma o front novo). Antes de usar a homologação, `gh pr view 21 --json state` tem de dizer OPEN. Ver [[testar-sql-na-homologacao]] e [[azure-swa-fatos-medidos]].
