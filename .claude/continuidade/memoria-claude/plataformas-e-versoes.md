---
name: plataformas-e-versoes
description: Estado das versões (Node 22 nas Functions do SWA, TypeScript 6, pdfkit 0.20, libs de navegador servidas de dentro) e a rotina de atualizar com comparação antes/depois; o que ficou para trás e por quê
metadata:
  node_type: memory
  type: project
  originSessionId: b78b5f11-8f29-43b6-a1a1-18ef263a2c3b
  modified: 2026-10-05T11:57:28.272Z
---

Em 03/10/2026 o responsável trocou a CSP forte por "atualizar tudo até a última versão possível" (não gosta de coisa desatualizada). Referência completa: `docs/PLATAFORMAS.md`.

Fatos que não se deduzem do código: o Azure Static Web Apps só aceita **Node 20 e 22** nas Functions gerenciadas (22 já é o que roda; fixado em `apiRuntime: node:22` nos dois `staticwebapp.config.json`); o CI testa em 22; Node 24 só com Function App próprio. TypeScript fica em **6** (o `@astrojs/check` não aceita 7); `@types/node` fica em 22.x de propósito. `npm audit` do site: sobra só `http-cache-semantics` (sem correção, só na montagem). O `xlsx` do npm parou na 0.18.5 (vulnerável): a 0.20.x só sai do cdn.sheetjs.com e está copiada em `app/vendor/`; `qrcode-generator`, `jsQR` em `site/public/vendor/` (`.gitattributes` mantém byte a byte). Functions v3 (`function.json`) está "em manutenção", não descontinuada.

Feito em 03–04/10/2026 (responsável em modo manual de aprovação; em modo automático o controle de permissões do Claude Code bloqueia mudança em produção/Azure): Directus 12.3.1→**12.4.1** (só a etiqueta da imagem; o Directus aplicou 2 migrações internas, então voltar exige restaurar o banco), TLS 1.2 no armazenamento antigo, `age` 1.3.2, `gh` 2.102.0; Function App antigo `func-ieadespa-api` + armazenamento + plano + monitoramento **apagados** (ver [[urls-producao-e-homologacao]]). PostgreSQL já em 18.6. **Git 2.56.0 instalado em 05/10/2026** (o `winget` ainda não tinha; instalador do GitHub oficial com SHA-256 e assinatura conferidos, silencioso, sem reiniciar; o Bash da sessão continuou funcionando). Dependabot #12/#15 fechados (já estavam na main); só o #1 segue aberto. **TypeScript 7 não serve ainda**: testado numa cópia, o site monta, mas `astro check` recusa o 7.0 ("use o 6"); o suporte vem no 7.1+ por `@astrojs/ts-content-mapper` (experimental 0.2.0).

Bug de fuso achado junto: as Functions/CI rodam em **UTC**; das 21h à meia-noite de Brasília o servidor já é "amanhã". `estatuto.diasDesde/idadeEm` sem "hoje" agora usam `hojeBrasilia()`. **Todo teste que monta "hoje" deve usar `hojeBrasilia()`** e a suíte deve ser rodada também com `TZ=UTC` (o CI falhou duas vezes nessa janela).

**Why:** supply chain (CDN de terceiros injeta código na tela de doação/administração) e CVEs conhecidos.

**How to apply:** a cada versão maior, comparar saída antiga × nova no que o sistema faz (PDF: pdfjs + canvas pixel a pixel; planilha: ler/escrever; QR: matriz e `createImgTag` iguais), depois `homolog` (PR #1) → varredura de rotas → `main`. Ainda por levantar (exige o login do responsável por código no Azure): versão do **Directus**, do **PostgreSQL** do Directus, SKUs. Ver [[azure-swa-fatos-medidos]] e [[nada-em-aberto]].

**Dependabot (15/10/2026):** os PRs do Dependabot NÃO conseguem publicar a pré-visualização (o deploy do Azure precisa de segredo e o job "Build and Deploy" falha neles), então não adianta esperar o verde. Rotina que funcionou: juntar os PRs num ramo próprio a partir da `main`, `npm install pkg@versão-exata` no `site/` (o `package.json` fica igual ao do Dependabot), `astro check` + build antes/depois + comparar as páginas HTML sem o sufixo de hash de `/_astro/` (comparador em scratchpad; deu 126 idênticas), `painel-unidade.cjs` e `markdown-seguro.mjs`, abrir PR, deixar a pré-visualização e "Site - testes contra o site publicado" rodarem, mesclar `--no-ff` e fechar os do Dependabot com comentário. Feito no PR #37 (união 1cbd4a4; reverter = `git revert -m 1 1cbd4a4`): astro 7.3.8, @astrojs/mdx 8.0.3, markdown-remark 7.3.2, vite 8.3.4, marked 18.1.0, `actions/upload-artifact` v7 (os dois usos são pasta + nome fixo; v7 só acrescentou envio direto de arquivo único). Lock perdeu esbuild/js-yaml/argparse (nenhum uso direto). Prettier acusa ~125 arquivos já antes (não faz parte do CI).
