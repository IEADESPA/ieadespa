---
name: v7111-mural-do-site-wip
description: "v7.11.1 mural de oração do site → cuidado pastoral; EM PRODUÇÃO desde 22/10/2026 (merge 810dacc, migração 149); falta só tirar a permissão pública de criar em mural_oracao ~29/10"
metadata:
  node_type: memory
  type: project
  originSessionId: a96b641f-4af0-4399-a180-c1aca450260c
  modified: 2026-10-22T12:24:32.882Z
---

**EM PRODUÇÃO desde 22/10/2026** (merge `810dacc`; reverter = `git revert -m 1 810dacc`; a 149 só acrescenta colunas/CHECK e troca o gatilho). Parado em 21/10 a pedido dele ("encerrar agora") e retomado em 22/10 ("pode continuar o serviço").

Como funciona: site/api/EnviarPedidoMural grava no Directus (token admin) e chama app.ieadespa.org.br/api/cuidado-pastoral-site com x-site-key = CHAVE_SITE_SISTEMA (rota FALHA FECHADA). O sistema só guarda confidencial ou com risco (Origem SITE, sem congregação, só nível geral); com risco avisa Presidente/Secretário Geral na hora e o site marca o item como confidencial + mostra 190/188.

Provas: jest 5.710; e2e-23..28 no LocalDB (e2e-28 41/41); site/scripts/testes/mural-unidade.cjs; roteiro da tela 870/0 junto com as verificações da prova de mutação; homologação (149 no Azure SQL, rota 401); produção verificada (rota 401 sem chave, SW v36, /api/enviar-pedido-mural 400 com corpo vazio, página com 188/190).

Defeito achado na prova: aviso da marcação à mão (pedido×10+vez) colidia com o aviso automático de outro pedido na mesma ReferenciaTabela → agora "PedidosOracaoSiteMarcado".

NÃO provado ponta a ponta com a chave real (exigiria um pedido de verdade: o com risco dispara aviso real ao Presidente; o pedido do sistema não se apaga). Sugerido ao responsável enviar um pedido confidencial de teste pelo site e ver em Cuidado pastoral → Pedidos.

Pendente com data: ~29/10/2026 tirar do Directus a permissão pública de CRIAR em mural_oracao (navegadores com a página antiga em cache). Prova de mutação da tela do cuidado: ramo v7-11-2-prova-mutacao-cuidado (worktree C:/tmp/mutacao-wt), rodada completa com log em C:/tmp/cuidado-mutacoes-completa.log. Depois: v7.12. Ver [[v711-cuidado-pastoral]].
