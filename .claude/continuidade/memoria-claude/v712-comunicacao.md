---
name: v712-comunicacao
description: "v7.12 Comunicação — EM PRODUÇÃO desde 22/10/2026 (merge bd348fd, migração 150); decisões dele (sem WhatsApp/SMS, sem grupo por dízimo), limites do e-mail do Azure, provas e armadilhas"
metadata:
  node_type: memory
  type: project
  originSessionId: a96b641f-4af0-4399-a180-c1aca450260c
  modified: 2026-10-22T16:08:11.481Z
---

**EM PRODUÇÃO desde 22/10/2026** (merge `bd348fd`; reverter = `git revert -m 1 bd348fd`; a 150 só cria tabelas/permissão/prazos/regra COMUNICADO). Ramo `v7-12-comunicacao` (worktree C:/tmp/v712-wt).

Decisões do responsável (22/10/2026): **sem WhatsApp e sem SMS** (pagos por mensagem; canais previstos no banco); **nenhum grupo pelo dízimo** (não reabrir).

O que é: consentimento canal (e-mail, celular) × categoria (eventos, devocional, financeiro) pedido, não presumido, com hash do texto; convocação oficial vai a todos e só o nível geral envia; modelos só o nível geral escreve/aprova (aprovar confere o hash do texto lido); ficha em papel só nível geral, com referência e 428, não vence o que a pessoa marcou depois; grupo vivo cortado pelo território, sem menor, sem quem não tem data de nascimento (salvo convocação), sem excluído LGPD; "direito a voto" só nível geral; link "não quero mais receber" sem login (sair.html; GET só lê). Fila: sininho na hora; celular e e-mail pela fila (rotinas-comunicacao.yml a cada 15 min das 6h às 22h45, marca no Storage com seq+ETag para não abrir o banco à toa); convocação passa na frente.

**Limite do e-mail do Azure (domínio próprio): 30/min e 100/h**, somando códigos e avisos. Prazos COMUNICACAO_EMAILS_POR_RODADA (20) e _POR_HORA (60). Aumento é pedido de graça ao suporte (até 72 h) — ação humana dele quando os comunicados passarem de algumas centenas.

Provas: jest 5.757+; e2e-29 (98) e e2e-30 (14, corridas e escala 4.900) no LocalDB; tela tools/front-comunicacao (417); revisão adversarial (2 altos/11 médios/15 baixos) toda corrigida; teste de tela: base aprovada b1c2219 (só acréscimos).

Armadilhas: SQL Server recusa `OUTPUT` sem `INTO` em tabela com gatilho; o SDK do ACS repete 429 esperando minutos (cliente próprio com maxRetries 0); e2e com critérios iguais em 10 min cai na regra "mesmo envio" e o teste não testa nada (prova de mutação pegou); a fila com sobras de testes anteriores mascarou a prioridade; teste de tela com base nova redescobre o plano e estoura 60 min na 1ª vez (rerun reaproveita o plano). Ver [[v7111-mural-do-site-wip]].
