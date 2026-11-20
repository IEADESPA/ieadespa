# Medir o gasto de créditos (só leitura)

Dois scripts que leem as conversas que o Claude Code guarda neste computador (`~/.claude/projects/<projeto>/`, um
`.jsonl` por conversa e por agente) e somam onde o gasto está. **Só leem:** não gravam nada e não mandam nada para
fora (usam apenas `node:fs`, `node:path` e `node:os`). Medidos em 20/11/2026: foi daqui que saíram as regras da seção
"Economia de créditos" do `CLAUDE.md` da raiz.

| Script | O que mostra |
| --- | --- |
| `medir-uso.mjs` | Os tokens da conversa principal e dos agentes (entrada, cache, saída, fotos) e as 10 conversas mais pesadas |
| `medir-origem-contexto.mjs` | De onde vem o contexto relido a cada pedido: leitura de `.js`, de `.html`, terminal, fotos, relatórios de agentes, raciocínio |

## Como rodar

Na raiz do repositório (o script acha sozinho a pasta das conversas deste projeto):

```bash
node tools/medir-creditos/medir-uso.mjs                                # os últimos 7 dias
node tools/medir-creditos/medir-uso.mjs - 2026-11-13T00:00:00Z         # desde uma data
node tools/medir-creditos/medir-origem-contexto.mjs - 2026-11-20T00:00:00Z
node tools/medir-creditos/medir-origem-contexto.mjs - 2026-11-20T00:00:00Z sem-raciocinio
```

O primeiro argumento é a pasta das conversas (`-` = a deste repositório). Conversas longas deixam o segundo script
lento (minutos). Os números são estimativas para comparar as partes, não a conta da assinatura: o saldo de verdade é o
`/usage` do Claude Code.
