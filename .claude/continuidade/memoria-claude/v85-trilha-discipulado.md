---
name: v85-trilha-discipulado
description: "v8.5 trilha de discipulado PARADA a pedido em 29/10/2026 — branch v8.5 (eead990) na homologação, falta o teste de tela de confirmação e o merge na main; migração 161; casca v47; decisões que ele pode mudar"
metadata:
  node_type: memory
  type: project
  originSessionId: 28922282-7bd5-4337-97ac-354437859a13
  modified: 2026-10-29T20:55:36.577Z
---

v8.5 (Trilha de discipulado) EM PRODUÇÃO desde 30/10/2026: merge `2e2ea5d` (desfazer = `git revert -m 1 2e2ea5d`), registro "Como ficou a v8.5" em docs/plano/fase-8-ministerial-afm.md. Migração 161, casca v47, rota /api/discipulado/*, módulo app/modulos/discipulado.js. Teste de tela da homologação 40953092973 sem divergência. Próxima = v8.6 (educação continuada; já tem os itens do Art. 68 §3º e 70 §3º).

**Provas já feitas:** jest 6.186; e2e-62 66, e2e-63 10 (corridas em processos), cuidado e2e-24..28 verdes; tela tools/front-discipulado 52 (6 mutações). Duas revisões independentes tratadas (índice único por etapa removido — travava a exclusão LGPD; funil/parados só da liderança territorial, sem Extensão/Departamento; trilha começa na conversão; acompanhamento mede o passo anterior ao próximo; curso também pela esteira de batismo; teto 20/dia). O teste de tela da homologação (40943177680) achou o "Corrigir marco" quebrando com catálogo de outro formato — corrigido.

**Decisões por interpretação (ele pode mudar):** trilha começa na conversão (rol antigo sem conversão lançada fora do funil); parado = 90 dias; acompanhamento só se o passo anterior foi nos últimos 180 dias; 20 itens novos por congregação por dia; Extensão/Departamento não veem funil; tipos do sistema não se desativam; curso vale por marco, trilha da AFM ou discipulado atestado na esteira.

**Why:** retomar sem refazer. **How to apply:** ferramenta — `preparar-pastoral` agora aplica 156–161 (base do cuidado com o esquema inteiro; e2e-23 confere 11 prazos); corridas sempre em processos separados (o shim tem uma conexão). Ver [[trava-8a]].
