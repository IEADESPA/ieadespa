---
name: visao-futura-integracao-total
description: Visão de longo prazo do responsável (19/10/2026) — dia distante em que tudo seria integrado e a igreja teria o próprio sistema de criação de sites, sem Directus; NÃO é prioridade agora
metadata:
  type: project
---

Ao ouvir a opção "tirar o Directus do caminho quente das gravações" (D, em [[capacidade-mil-pessoas]]), ele entendeu como o passo para a **integração total entre todos os bancos de dados** e para a igreja ter **o próprio sistema de criação de sites** (no lugar do Directus) — "bem distante mesmo", **não está pensando nisso agora**.

**Why:** hoje o site (Directus + PostgreSQL) e o sistema de gestão (Azure SQL) são bancos separados; ele enxerga um futuro com tudo integrado e sem depender de CMS de terceiros.

**How to apply:** não propor nem começar migração do Directus agora; manter a evolução dentro do desenho atual (site estático + Functions + Directus + SQL do sistema). A opção D que descrevi é MENOR que essa visão (só as gravações de pedido/inscrição iriam direto ao PostgreSQL, o Directus continuaria como painel de conteúdo) — se voltar ao assunto, deixar clara essa diferença. A decisão de capacidade (A observar × B dobrar o servidor, +~R$ 80/mês) ficou em A por enquanto: observar o próximo evento grande.

**Atualização (11/11/2026):** a visão virou plano — o criador de sites é a **FASE 12** (docs/plano/fase-12-criador-de-sites.md), a última, depois das FASES 10 e 11; antes disso, a v10.14 já leva o que é "vivo" do site (inscrições, camisetas, mural, enquetes, Minha Conta) para o sistema, só sem evento aberto. Ver [[roteiro-fases-10-11-12]].
