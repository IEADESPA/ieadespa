---
name: nao-perguntar-o-que-ele-controla
description: "23/11 ele se irritou com perguntas sobre um caso que ele mesmo impede na operação (cadastro antes da importação); a trava simples basta, sem fila nem tela"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 39ca0e9d-d42f-4251-ac4b-a380acd0e7c4
  modified: 2026-11-23T17:39:12.079Z
---

Em 23/11/2026, o construtor devolveu 4 perguntas sobre a trava das matrículas. Duas tratavam do que fazer com quem se
cadastrasse antes da importação: a fila de espera e o aceite depois. A resposta dele: "Não tem lógica, cara.
Ninguém vai ser cadastrado antes da importação… Eu só vou liberar depois de importar." Ele controla a ordem na
operação, então o caso nunca acontece.

**Why:** perguntar sobre cenário que ele mesmo impede gasta o tempo e os créditos dele, e soa como se não tivéssemos
entendido a regra.

**How to apply:**
- Antes de levar uma pergunta, ver se a regra dele já impede o caso na prática ("só libero depois de X"). Se impede, a
  resposta é a trava simples: o servidor recusa com uma mensagem curta, sem fila, sem tela nova e sem fluxo de exceção.
- Continua valendo perguntar ANTES de desenhar o que muda a tela de verdade ([[perguntar-antes-de-desenhar]]); o
  filtro é só para o caso que não vai acontecer.
- Filtrar também a lista de perguntas que os agentes devolvem: decidir sozinho o que a regra dele já responde e levar
  só o que falta, poucas de cada vez, com a sugestão primeiro ([[responsavel-leigo-sem-advogado]]).
