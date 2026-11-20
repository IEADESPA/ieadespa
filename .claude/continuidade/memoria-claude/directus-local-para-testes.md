---
name: directus-local-para-testes
description: Réplica LOCAL do Directus de produção (v12.4.1 + PostgreSQL 17 real) em C:/tmp/directus-local para provar concorrência e telas sem tocar produção; como subir, limites da licença e o emulador swa-local
metadata:
  type: reference
---

Montado em 16/10/2026 por subagente, para o limite de pedidos ([[site-gestor-camisetas-venda-balcao]]). Pasta `C:/tmp/directus-local` (fora do repositório). Subir: `cmd //c "C:\tmp\directus-local\iniciar.cmd"` com `run_in_background`; pronto quando `GET http://127.0.0.1:8055/server/ping` = pong (~14 s); parar: `parar.cmd`. O token de admin e a senha da interface são LOCAIS e descartáveis: ficam só na pasta da réplica, neste computador (nunca no Git). Quem montar a sua réplica cria os seus. Node 22 só para o Directus (o padrão da máquina é v26). Só 25 das 35 coleções (licença Core limita a 25): para acrescentar coleção é preciso apagar uma local sem relação (apaguei `mural_oracao`). A função "Gestor de Camisetas" foi replicada de produção por leitura (28 de 29 permissões; falta o envio de imagem) e existe um "Editor de contatos" vazio, para as baterias `balcao.cjs`/`limite.cjs`. Índices compostos criados à mão em produção não aparecem na réplica.

**How to apply:** teste de concorrência/tela novo → subir esta réplica + `node site/scripts/testes/swa-local.cjs 4400 --ip-aleatorio` (com DIRECTUS_URL/TOKEN locais) e rodar as baterias com `SITE_URL=http://127.0.0.1:4400`. Para provar página pública em Edge, a produção hoje não tem campanha ativa (nenhuma página /camiseta/ no dist): criar uma campanha `teste-…` ativa, reconstruir e apagar (script `build-com-campanha-teste.js` do scratchpad). Em Edge, o Directus de produção embutido nas páginas é redirecionado ao local por interceptação de requisição.
