---
name: site-remonta-sozinho-sem-token
description: "Site estático remontado por polling (site-conteudo-sync.yml, 15 min, hash do conteúdo do Directus) — sem token pessoal do GitHub; Flow do Directus desativado; GITHUB_TOKEN não grava variável (403), memória no cache"
metadata:
  node_type: memory
  type: project
  originSessionId: da91e9b0-03ac-4d66-b670-429112727baa
  modified: 2026-10-06T19:41:30.464Z
---

Desde 06/10/2026 o site é remontado por `.github/workflows/site-conteudo-sync.yml`: a cada 15 min, `site/scripts/conteudo-versao.mjs` faz um hash do conteúdo inteiro de 20 coleções do Directus (segredo `DIRECTUS_ADMIN_TOKEN` do GitHub) e, se mudou, dispara `gh workflow run` do build do site e dos avisos de conteúdo, com o `GITHUB_TOKEN` do robô. Memória da última versão: cache do Actions (`conteudo-versao-<hash>`). O Flow do Directus "Publicar site (avisar GitHub)" está **desativado** (token pessoal venceu, 401). A agenda do sistema segue por `site-agenda-sync.yml` 3×/dia (cada chamada à API do sistema acorda o Azure SQL por 60 min).

**Why:** o responsável não quer criar tokens na tela do GitHub (inglês, não acha o que precisa); tokens pessoais vencem em silêncio; de 01 a 06/10 nenhuma edição do Directus chegou ao site sozinha.

**How to apply:** nunca propor token pessoal/PAT como solução; usar o robô do repositório (schedule + `gh workflow run`) e cache/arquivo como memória. `GITHUB_TOKEN` não grava variáveis do repositório (`gh variable set` → 403). A maioria das coleções do Directus não tem `date_updated`: detectar mudança só por hash do conteúdo. Para a agenda do sistema sem acordar o banco, a ideia registrada na vD.5 é o sistema gravar a versão num blob público e o fluxo ler o blob. Ver [[camisetas-site-regras-na-api]].

**vD.5 (07/10/2026) — agenda do sistema → site sem acordar o banco:** `GET /api/agenda-publica/versao` responde por um blob privado do Storage (`shared/agendaPublicaVersao.js`, container `cache-publico`, um blob por banco: `versao-app-db-prod.json` × `versao-ieadespa-homolog.json`), regravado pelo gancho da entrada única a cada mudança 2xx em GestaoCalendario/GestaoCanais/GestaoEventos e pela rotina das 7h (`POST agenda-publica/atualizar-versao` com x-cron-secret). O `site-agenda-sync.yml` voltou a rodar a cada 15 min. Provado na homolog: 1ª leitura "banco", 2ª "guardada"; POST sem segredo 401; `calendario/anos/abrir` regravou o blob (campo `em`). Conferir em uns dias se o banco pausa (`app_cpu_billed`).

**ATUALIZAÇÃO 17/10/2026 — o "15 min" não se cumpria (a Marcha ativada não aparecia em 20+ min):** o GitHub atrasa/derruba parte dos disparos agendados. Medido: com `*/15` o intervalo REAL do `site-conteudo-sync.yml` foi de 10 a 54 min (mediana 19, máx 54); um fluxo `*/5` ficou em mediana 10, máx 40. Correção (push direto, 542c81e): DOIS cron defasados de 5 em 5 min (`1-59/5` e `3-59/5`, fora dos minutos redondos), cada linha é um disparo próprio. Espera esperada = espera do tique (mediana ~5 min, pior caso ~15–30) + montagem (~4 min). **Atalho imediato** quando ele reclamar de página que não aparece: `gh workflow run "Site institucional - CI/CD" --ref main` (monta já com o Directus de agora) e conferir com `curl -s -o /dev/null -w "%{http_code}" <página>`. Sem PAT não há como o painel disparar a montagem sozinho (decisão dele, não propor); a saída "sem remontagem" seria página de campanha dinâmica (não feita).
