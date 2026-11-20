---
name: v83-consagracao-documentacao
description: "v8.3 consagração e documentação EM PRODUÇÃO desde 28/10/2026 (revert -m 1 83994c8), migração 158, SW v44; decisões que ele pode mudar, armadilhas e provas"
metadata:
  node_type: memory
  type: project
  originSessionId: 28922282-7bd5-4337-97ac-354437859a13
  modified: 2026-10-28T18:03:01.667Z
---

v8.3 (consagração e documentação) EM PRODUÇÃO desde 28/10/2026: merge 83994c8, desfazer = `git revert -m 1 83994c8`. Migração 158, casca SW v44, rotas /api/esteira-consagracao/<ação> e /api/cerimonias-consagracao/<ação>. Próxima = v8.4 (credencial digital com QR, Art. 76).

Esteira de cargo: PROTOCOLADO (foto + 1 documento) → "Enviar ao CEI" → parecer do CEI (`cei` geral) → homologação (ato do Presidente p/ Auxiliar–Diácono; reunião da CLI encerrada p/ Presbítero–Pastor) → HOMOLOGADO → cerimônia (taxa até 45 dias antes; comissão ≥4 pastores; lista inteira presentes+ausentes) → CONCLUIDO + diploma. Integração/Reintegração seguem a esteira antiga.

**Decisões por interpretação (ele pode mudar):** "Conselho" = CEI; parecer vale também p/ nomeação e outra convenção; Pastor não casado só com motivo do CEI; taxa fora do prazo espera a próxima cerimônia (não perde o ano); ausente perde no ano civil e o registro não se desfaz; diploma impresso antes com código reservado; CHM usado é revogado; caixa da taxa segue com a tesouraria; Meus Dados mostra só resultado e data do parecer; taxa pela tela só a Secretaria.

**Why:** contexto para v8.4 e para não reabrir o decidido.

**How to apply:** armadilhas — heredoc do shell come `\\` e quebra com `'''` (scripts python SEMPRE via Write); o shim do LocalDB não tem transaction.request() (usar escadaDb.naTransacao); leitura de outra conexão dentro da transação espera a própria trava (formação conferida antes); DOM simulado ganhou setter de `.hidden` e no navegador real `.barra-lista` (flex) vence `[hidden]` (regra `#abaConsagracoes [hidden]`); valores em reais com `centavosExatos` (75.40*100); e2e precisa `UseDevelopmentStorage=true` p/ a foto. Provas: e2e-55..58, tools/front-consagracao (contrato com E2E_CONTRATO=1). Ver [[v82-escada-ministerial]], [[nao-cobrar-cadastros-de-pessoas]].
