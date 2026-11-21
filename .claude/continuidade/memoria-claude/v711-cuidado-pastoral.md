---
name: v711-cuidado-pastoral
description: "v7.11 Cuidado pastoral (fila com responsável/prazo/escada, detecção de afastamento, notas com sigilo, pedidos de oração com risco) — ramo v7-11-cuidado-pastoral, migração 148; decisões de 21/10/2026 (presença no culto CANCELADA; ligar o mural de oração do site DEPOIS da v7.11)"
metadata:
  node_type: memory
  type: project
  originSessionId: a96b641f-4af0-4399-a180-c1aca450260c
  modified: 2026-10-21T17:37:57.227Z
---

**EM PRODUÇÃO desde 21/10/2026** (merge `990974d` na main; **reverter = `git revert -m 1 990974d`**; a migração 148 é só de acréscimo). A primeira rotina das 7h em produção roda em 22/10 (a detecção pode abrir até 5 itens por congregação com os dados reais da EBD). A prova de mutação da tela (tools/front-cuidado/mutacoes.js) ainda rodava no deploy: conferir o relatório e commitar as verificações que ela acrescentar. Construída em 21/10/2026 no ramo `v7-11-cuidado-pastoral` (worktree da homologação em `C:/tmp/homolog-v711`). Migração 148; `shared/cuidadoPastoral.js` (regra pura), `shared/cuidadoPastoralDb.js`, rota `GestaoCuidadoPastoral` (`/api/cuidado-pastoral/<ação>`), módulo `app/modulos/cuidado-pastoral.js` (aba da liderança + sub-aba Cuidado do Meu Painel), SW v35. Rotina dentro de NotificacoesAgendador (7h): passar o item de quem mudou de congregação, detectar, subir a escada, apagar notas de quem foi DESLIGADO há 30 dias, retenção.

**Decisões do responsável (21/10/2026):** presença no culto por pessoa = **decidido NÃO fazer** (catalogar quem vai a cada culto não compensa; o detector fica com EBD + reuniões; não reabrir). Mural de oração do site = **fazer logo depois da v7.11** (pedido confidencial ou com sinal de risco do site entra na fila, no nível geral, com aviso na hora; 188/190 na própria página; recomendação: o sistema lê o Directus a cada 5 min com o token que já tem, sem chave nova; só abre o banco quando chega pedido confidencial/risco).

**Provas:** jest 5.699; e2e no LocalDB (`bash rodar.sh preparar-pastoral`; e2e-23 103, e2e-24 181, e2e-25 70, e2e-26 19, e2e-27 46); tela `tools/front-cuidado` 657 (44 falham no código antigo); duas revisões adversariais independentes (servidor: 2 críticos/7 altos/6 médios/8 baixos; tela: 1 alto/3 médios/8 baixos) todas aplicadas; homologação: migração 148 no Azure SQL, rotas 401, provas em navegador no runner (39626387049 liderança 900013, 39626407466 Meu Painel 900007), teste de tela 1.064+144 iguais com a base `tools/csp-e2e/base/commit.txt` = e748b3a.

**Armadilhas desta rodada:** `SUM(CASE WHEN EXISTS …)` o SQL Server recusa (tabela derivada); erro de chave única DENTRO de transação é frágil (a ponte do LocalDB recicla a conexão e desfaz tudo) — conferir antes com `UPDLOCK, HOLDLOCK`; duas purgas simultâneas davam deadlock (trava `sp_getapplock`); a marca `SESSION_CONTEXT('cuidado_purga')` vai num lote só com TRY/CATCH; o nome de teste "E2E" coincidia com o da congregação e a checagem do boletim recusava a própria linha; `prova-modulo.js` em sub-aba: `--aba meupainel --clicar [id=btnSub…]`.
