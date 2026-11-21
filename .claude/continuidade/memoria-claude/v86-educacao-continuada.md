---
name: v86-educacao-continuada
description: "v8.6 educação continuada EM PRODUÇÃO desde 30/10/2026 (revert -m 1 3b6ab7a); migração 162, casca v48; decisões que ele pode mudar; armadilhas; próxima = v8.7"
metadata:
  node_type: memory
  type: project
  originSessionId: 28922282-7bd5-4337-97ac-354437859a13
  modified: 2026-10-30T13:48:33.065Z
---

v8.6 (Educação continuada, Regimento Art. 68 §3º e 70 §3º) EM PRODUÇÃO desde 30/10/2026: merge `3b6ab7a` (desfazer = `git revert -m 1 3b6ab7a`), registro "Como ficou a v8.6" em docs/plano/fase-8-ministerial-afm.md. Teste de tela da homologação 41068846668 sem divergência (base aprovada em 41066251721). Provas: jest 6.204, e2e-64 57, e2e-65 11, fase 8 + cuidado verdes, tela 65 (16 mutações). A ligação trilhas × disciplinas passou para a v8.7 (item na lista dela). Próxima = v8.7.

**Desenho:** reciclagem anual por edição (AFMReciclagemEdicoes/Resultados): sem APROVADO (com frequência mínima) na edição do ano anterior = credencial não renovada (não oficia; QR INATIVO); reposição = corrigir o resultado. Exame bienal (AFMExames/Resultados): REPROVADO = sob observação (oficia, não sobe), AUSENTE = suspenso, AUSENTE_JUSTIFICADO = deve repescagem (escada só AVISO). Sanção só cai com APROVADO, atravessa bienais. "Obreiro desde" = primeiro dia como oficial SEM interrupção (inicioNoMinisterio: promoção não zera). Regra única via afm.licencaLiturgica({educacao}).

**Decisões por interpretação (ele pode mudar):** sob observação não suspende mas trava a escada; exame vale para obreiros + Câmara (não-obreiro só registra); reposição = corrigir a mesma edição; ausência justificada não trava promoção; justificativa apagada em 2 anos (PoliticasRetencao 'AFM — justificativa de ausência no exame'); trilhas↔disciplinas da AFM ficam para a v8.7.

**Why:** retomar sem refazer. **How to apply:** armadilhas — a preparar-pastoral aplica 156–162 ANTES do setup e2e-23, então o setup agora abre a linha de cargo dos oficiais que cria (o e2e-51 falhava desde a v8.5); `E2E_CONTRATO=1` em outro roteiro (e2e-51) regrava o contrato de OUTRA tela (front-escada) — rodar só no roteiro certo; registro em lote vai em lotes de 100 (servidor recusa >500). Ver [[v85-trilha-discipulado]] e [[trava-8a]].
