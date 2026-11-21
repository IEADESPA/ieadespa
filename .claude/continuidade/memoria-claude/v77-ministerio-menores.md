---
name: v77-ministerio-menores
description: "v7.7 Habilitação para Ministério com Menores (Lei 14.811/2024) — EM PRODUÇÃO desde 09/10/2026 (migração 143, merge ceb4255): decisões, armadilhas, como reverter e o que ficou para a v7.10"
metadata:
  node_type: memory
  type: project
  originSessionId: dccbed28-b381-4d4e-99d0-06df344d741a
  modified: 2026-10-09T15:50:15.447Z
---

Pedida pelo responsável em 09/10/2026 ("faça a próxima versão, a 7.7"), logo depois da v7.6 ([[v76-setores-tecnicos]]). Contrato e decisões: `docs/plano/fase-7-saude-eventos-e-comunicacao.md` (seção v7.7).

**Estado: EM PRODUÇÃO desde 09/10/2026.** Ramo `v7-7-ministerio-menores` mesclado na `main` (`--no-ff`, commit de união ceb4255). **Reverter de uma vez:** `git revert -m 1 ceb4255` (a migração 143 é só de acréscimo e idempotente). Conferido em produção: deploy verde com "Executar Migrações SQL" e a varredura de rotas; 9 rotas novas dão 401 sem sessão; `modulos/ministerio-menores.js` 200; casca do service worker v31. PR #21 (homologação) segue OPEN. Base do teste de tela = 30ff360 (`tools/csp-e2e/base/commit.txt`).

**Como foi provada (modelo, igual à v7.6 + novidades):** jest 118 suítes/5.140 testes; e2e no LocalDB (`bash tools/e2e-localdb/tudo.sh`, >10 min, rodar em segundo plano; e2e-7 setup 45, e2e-8 187, e2e-9 221, e2e-10 24, e2e-11 107, e2e-12 43); **dois revisores adversariais independentes** (backend e tela) — o da tela achou 14 defeitos reais que testes e subagente não viam; ferramenta da tela versionada em `tools/front-menores` (roteiro DOM 293 verificações, 71 mutações, Edge com a CSP final); homologação com 2 provas em navegador real (37/37 e 39/39) e teste de tela vD.1 verde com a base nova.

**Armadilhas já pagas (valem para a próxima):** o ensaio no SQL Server real achou defeitos que os testes de unidade não viam (`PoliticasRetencao.BaseLegal` é NVARCHAR(300); vazamento de motivo reservado no resumo/validades do painel — a máscara tem de cobrir contagens, datas e "próximo vencimento"; MERGE sem HOLDLOCK; corrida de declarações exigiu índice único filtrado). Mock de pool com fila (`criarPoolFalso`): uma consulta nova no meio do fluxo consome o resultado da seguinte — faça varreduras DEPOIS de ler o que a resposta devolve. Heredoc com muitas aspas no Bash quebra o parser: crie arquivos pela ferramenta Write. Roteiro e2e que depende de "quem tem escala viva onde" fica frágil: limpe o estado (UPDATE direto). No `argumentos` do workflow de prova em navegador, **nunca use `#` nos seletores** (o shell trata como comentário e corta o `| tee`): use `[id=nome]`. Membros 1 e 2 da semente também são Presidente/Secretário Geral. O adulto que desmarca só telefone/e-mail NÃO perde a foto (decisão antiga travada em teste).

**O que ficou para a v7.10 (por decisão):** o **dado** de alergia/condição de saúde e o crachá do check-in infantil; a autorização do responsável para criança que **não é membro**.
