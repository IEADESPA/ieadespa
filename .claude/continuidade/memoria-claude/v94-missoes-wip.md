---
name: v94-missoes-wip
description: "v9.4 Missões — EM PRODUÇÃO desde 06/11/2026 (revert -m 1 a052c5e), migração 169, casca v55; decisões que ele pode mudar; armadilha da base do teste de tela; próxima = v9.5"
metadata:
  node_type: memory
  type: project
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-06T15:20:31.257Z
---

EM PRODUÇÃO desde 06/11/2026: merge `a052c5e` (desfazer = `git revert -m 1 a052c5e`), docs 2ecf807. Migração 169, casca do service worker v55, rota `/api/missoes/<ação>`, pílula Missões na aba Expansão. "Como ficou" no plano da fase 9 (docs/plano/fase-9-entidades-vinculadas.md).

Provas: jest 6.348; bateria inteira do banco local e2e-1 a e2e-77 verde (e2e-76 203, e2e-77 19/20 RCSI); tela tools/front-missoes 114 com 39 mutações; teste de tela homologação 42220757930 e produção 42229580970 com 0 divergência e 0 CSP.

Decisões por interpretação (ele pode mudar): "Mesa Diretora" (Art. 134 §6º, I) = concordância do Presidente sozinho; frente local sem CME/CLI; outra cidade do PA pela CME+CLI; pagar PJ = convênio externo; sustento do Tesouro Geral ou caixa local da mantenedora (não da tesouraria da SEMIADESPA); zona rural adjacente = Parauapebas + 6 municípios vizinhos (lista fechada); licença de candidatura para o sustento sem encerrar; relatório vence dia 10; Tesoureiro sem `missoes` (só prévia e geração pelo financeiro geral). Ação humana: Líder Geral da SEMIADESPA só entra com a permissão `missoes` (papel Secretário de Missões).

**Armadilha:** versão que acrescenta HTML estático (pílula/seção escondida) faz o teste de tela da homologação divergir em TODAS as ações (contagem de nós). Conferir que só a contagem mudou, gravar o head do ramo em `tools/csp-e2e/base/commit.txt`, commitar no ramo, mesclar de novo na homologação e rodar outra vez (tem de dar 0 divergência) antes da main.

Próxima = v9.5 (Mapa territorial). Ver [[v93-distritos-wip]], [[trava-9a]] e [[empurrar-ramo-durante-o-servico]].
