---
name: azure-swa-fatos-medidos
description: "Fatos do Azure Static Web Apps medidos em produção (cabeçalhos de IP, qual staticwebapp.config.json vale, cabeçalhos padrão)"
metadata:
  node_type: memory
  type: reference
  originSessionId: b78b5f11-8f29-43b6-a1a1-18ef263a2c3b
  modified: 2026-10-03T17:30:34.627Z
---

Medido em 02/10/2026 em app.ieadespa.org.br:

- **IP do cliente:** `x-forwarded-for` chega como `<o que o cliente escreveu>, <IP real>:<porta>, <IP do proxy>:<porta>`
  (o Azure acrescenta à direita) → IP real = **penúltimo**. `x-azure-clientip` e `x-client-ip` chegam como o cliente
  os escreveu (forjáveis); `client-ip` é o salto imediato. Implementado em `api/shared/origemConexao.js`.
  O site público (`site/api/src/lib/rateLimit.js`) ainda usa o PRIMEIRO valor do XFF (forjável) — outro SWA, medir antes de mudar.
- **Config do SWA:** o deploy publica `app_location: /app`; o `staticwebapp.config.json` da **raiz do repositório
  é inerte** (suas regras de `routes` e `404 → /index.html` nunca valeram; caminho inexistente dá 404). Cabeçalhos
  novos vão em `app/staticwebapp.config.json` (só `globalHeaders`, para não ativar de surpresa as regras antigas).
- **Cabeçalhos que o Azure já põe:** HSTS, `Referrer-Policy: same-origin`, `X-Content-Type-Options: nosniff`,
  `X-XSS-Protection`. CSP em produção hoje: só `frame-ancestors/object-src/base-uri/form-action` (+ `X-Frame-Options`);
  `script-src` estrito exigiria tirar ~861 atributos `on*=` em linha (466 em `index.html`, 395 em `script.js`).
- **Segmento numérico da URL chega como NÚMERO** em `context.bindingData` (`/comissoes/1` → `1`, não `"1"`). Código que
  chama `.toUpperCase()`/`.trim()` no valor dá 500 em produção e passa em teste que só usa texto — foi o caso de
  `GestaoComissoes` (02/10/2026). Use `String(v)` ou `auth.idDeRota(v)` (aceita número e texto); a varredura
  `rotasAnonimas.test.js` agora testa os dois formatos.
- **Rota pública com "token opcional" quebrou só em produção (02/10/2026):** `GET /api/documentos` sem NENHUM cabeçalho
  meu respondia 401 porque `auth.extrairToken` achou um token e o handler tratou como tentativa de login; nos testes (que
  só mandam `x-auth-token` quando querem) passava. Inferência (não vi o cabeçalho): o Azure entrega um `Authorization`
  próprio à Function. Depois de só considerar o `x-auth-token` da aplicação (ou uma sessão nossa válida) como tentativa de
  login, a rota passou a dar 200. Regra: em rota que aceita visitante, nunca derivar "tentou entrar" de `extrairToken` sozinho.
- **`scriptFile: "../shared/entrada.js"` funciona no Azure SWA** (medido na homologação e em produção em 03/10/2026; o host aceita
  caminho fora da pasta da função e entrega `context.executionContext.functionDirectory`). O CI roda em **Linux**: caminho com
  barra invertida não é separador lá (um teste com `C:\...` falhou só no CI) — ler o nome da pasta separando por `/` e `\`.
- **Fluxo da homologação (PR #21 desde 07/10/2026 — o #1 fechou sozinho ao mesclar o homolog na main; branch `homolog`):** o workflow do PR roda `npm test` → **migrações no banco de PRODUÇÃO**
  (mesmo segredo) → deploy do preview, que usa o banco `ieadespa-homolog` (NÃO migrado por ele: o preview roda código novo com
  esquema antigo, ex.: `GET /api/documentos` dá 500 lá por falta da coluna da 121). Serve para validar o host/roteamento
  (401 sem sessão em ~600 rotas), não o SQL. Para publicar nela sem perder o commit marcador `HOMOLOG_BRANCH.md` e sem force:
  `git worktree add -B stage-homolog <dir> origin/homolog`, `git merge main`, `git push origin stage-homolog:homolog`.
  O primeiro acesso depois de um deploy pode dar 500 "Backend call failure" por aquecimento; repetir.
- **Acesso ao Azure da igreja a partir desta máquina (03/10/2026):** o `az` logado aqui é de OUTRA organização (só vê `Associacao-RG`). A
  credencial de serviço de `site/secrets.env` autentica mas **não enxerga a assinatura** (aponta para `rg-portal-igreja`: obsoleta);
  o classificador de permissões do Claude Code bloqueia ler credencial guardada em modo automático — com o responsável em modo
  manual funcionou. O caminho que funcionou: perfil isolado (`AZURE_CONFIG_DIR`) + `az login --use-device-code --tenant ieadespa.org.br`
  (ele digita o código em login.microsoft.com/device). Apps: `site-institucional` (site, salmon-bay) e `app-meusite-web` (sistema,
  white-grass), grupo `ieadespa`. `az staticwebapp appsettings set` JUNTA (não substitui). `CHAVE_SITE_SISTEMA` foi gravada nos dois
  em 03/10/2026 e testada (401 sem chave, 200 com). Detalhe em SECRETS.md §9. Scripts `.ps1` só em ASCII (PS 5.1 lê UTF-8 sem BOM como
  ANSI) e `$ErrorActionPreference='Continue'` (aviso do az no stderr derruba com 'Stop').
- Edge sem tela serve para checar violação de CSP: `msedge --headless=new --enable-logging=stderr --v=0 --dump-dom <url>`.

**Why:** evita refazer medições e evita repetir o erro de achar que o arquivo da raiz vale.

- **Ambiente de preview novo (07/10/2026, PR #21):** nasce com uma CÓPIA das configurações de produção (os NOMES das chaves do `appsettings list --environment-name 21` eram os mesmos do `default`), inclusive `SQL_CONNECTION_STRING` → a API da homologação falava com o banco de PRODUÇÃO até eu apontar para o `ieadespa-homolog`. Jeito seguro: script no scratchpad que lê a string do próprio ambiente (`python.exe -IBm azure.cli` do CLI, sem shell), troca só `Initial Catalog=`, grava com `-o none` e imprime apenas o nome do banco. Conferir SEMPRE depois de recriar o ambiente. Apagar um ambiente órfão (`environment delete`) é negado no modo automático; em modo manual (07/10/2026 à tarde) o responsável aprovou e os três órfãos (sistema `18`; site `1` e `18`) foram apagados. Regra: depois de fechar um PR, conferir `az staticwebapp environment list` nos DOIS Static Web Apps.
- **Dois deploys seguidos no mesmo preview** (14:13 e 14:15): por uns 10 min o host respondia 404 e 200 ao acaso para `script.js`, `manifest.json` e `modulos/psc.js` (propagação da CDN). Antes de qualquer prova em navegador no preview, esperar ~12 respostas 200 seguidas dos 3 arquivos.

- **Domínio padrão do Static Web App pela linha de comando (08/10/2026):** não há PATCH; `az rest --method put` em `…/staticSites/<app>/customDomains/<domínio>?api-version=2024-04-01` com `{"properties":{"isDefault":true|false}}` muda só o padrão, sem revalidar (o ARM recusa dois padrões: primeiro tirar o antigo com false, depois pôr o novo com true). Feito no `site-institucional`: raiz `ieadespa.org.br` virou o padrão, `www` → 301. Nunca remover o `www` (QR/links impressos).
