---
name: trava-9a
description: "Trava de Revisão 9-A (v9.1–v9.3) FECHADA e EM PRODUÇÃO em 05/11/2026 — revert, migração 168, casca v54, decisões dele, armadilhas da bateria"
metadata:
  node_type: memory
  type: project
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-05T17:07:03.514Z
---

Trava 9-A fechada em 05/11/2026; merge na main 75e5be0 (reverter = `git revert -m 1 75e5be0`), migração 168 (só retenção das 3 políticas da FASE 9 para NULL), casca v54. Registro completo em docs/plano/fase-9-entidades-vinculadas.md. Próxima = v9.4 (Missões). Segue [[v93-distritos-wip]].

Decisões por interpretação que ele pode mudar: análise do NIF/verificação do CF da entidade feita por UM conselheiro que registra a decisão do colegiado; Filtro Máximo e dispensa de balancetes (126-M I/II) não implementados até existir Distrito; desativação/emancipação encerram acessos não eletivos sem Assembleia; Secretário de Missões cadastrado pela Secretaria; destino da extinção da entidade e Art. 18 VII "b"/59 §2º fora do sistema; mudança de território durante fechamento aceita; defeitos de texto da norma (Art. 104-B VI × 126-O; Estatuto Art. 61 II).

**Why:** registro para não reabrir o que ele já aceitou e saber como desfazer.

**How to apply:**
- Papel novo criado copiando as permissões do Pastor de Área muda as contagens de roteiros antigos (e2e-23 cuidado_pastoral, e2e-33 seguranca_congregacao) — o preparo da base falha e os roteiros seguintes rodam sobre base velha. Após corrigir, dá para rodar a bateria só a partir da linha do tudo.sh que quebrou (script temporário com `tail -n +N`).
- e2e-71 roda sobre cenario-distritos (precisa da 167), não sobre cenario-expansao.
- Teste de tela: job "celular" pode falhar sem rodar ("WS endpoint" em 30 s) — é o equipamento; `gh run rerun --failed`.
