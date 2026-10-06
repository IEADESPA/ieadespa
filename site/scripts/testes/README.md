# Testes do site contra um ambiente de verdade

Baterias que exercitam a API pública do site (camisetas e inscrições) **num site publicado**, com
dados de teste criados e apagados na hora. Nasceram no incidente de 06/10/2026 (vB.17/vD.8): a
regra que fica é que nada sobe para a produção sem passar por elas.

| Script | O que prova |
| --- | --- |
| `camisetas.js` | status, pedido, chave do telefone, duplicado, "Meus pedidos" (rápido e antigo), retirada e andamento, prazo e `ativo`, lote único |
| `eventos.js` | status com vagas, inscrição, cupom, lista de espera, grupo, faixa, limite por telefone, encerramento e prazo |

## Onde rodam

- **Automático** (`.github/workflows/site-testes.yml`): depois de cada montagem do site, contra o
  endereço que acabou de ser publicado — a **pré-visualização** do branch `homolog-site` (PR de
  homologação, não fechar) ou a **produção** (`main`).
- **À mão**, de qualquer máquina com acesso ao Directus:

```bash
export SITE_URL=https://www.ieadespa.org.br   # ou o endereço da pré-visualização
export DIRECTUS_URL=... DIRECTUS_ADMIN_TOKEN=... TELEFONE_CHAVE_SEGREDO=...   # dos segredos, nunca em texto no repositório
node site/scripts/testes/camisetas.js
node site/scripts/testes/eventos.js
```

## Regras

- Dados de teste têm `slug` começando com `teste-` (camisetas) ou título começando com `TESTE`
  (eventos): a versão do conteúdo (`conteudo-versao.mjs`) ignora esses itens, então o teste não
  remonta o site; e tudo é apagado no `finally`, mesmo quando uma verificação falha.
- A API guarda a campanha/evento em cache por 10 s e o status por 20 s: depois de mudar prazo ou
  `ativo` no Directus, as baterias esperam esse tempo antes de conferir.
- Não há Directus de homologação (custo); os testes gravam no Directus de produção, só em itens de
  teste descartáveis.
