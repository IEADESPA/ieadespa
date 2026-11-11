# FASE 11 — Criador de sites próprio (no lugar do Directus)

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

**Redefinida em 11/11/2026 com o responsável.** Esta fase era o "Sistema Campal (multi-campo)", que **saiu do plano** na mesma data — não
haverá sistema campal. No lugar dela entra o **criador de sites**, que antes era uma "visão de longo prazo" registrada no fim da antiga
FASE 12 (19/10/2026). Vem **depois da FASE 10** e deve demorar, porque fica muito mais ligado ao sistema: na FASE 10 (v10.13) o que é "vivo"
no site já terá passado para o sistema, e o site terá ficado só com páginas de conteúdo.

## O objetivo

Hoje o site (estático + Functions + Directus/PostgreSQL) e o sistema de gestão (Azure SQL) são dois conjuntos de dados separados, ligados
por APIs. O fim desta fase é a **integração total**: um conjunto de dados só, e a Igreja editando as páginas do site **dentro do próprio
sistema**, com um editor próprio, sem o Directus.

## O que já ajuda e não se perde

- As regras de negócio estão nas Functions (`site/api`, `api`), não no Directus; a trava de vagas e de cupom (`vagasEvento.js`) e o limite
  de pedidos (`limiteLote.js`) já são lógica nossa sobre o banco.
- O site é estático e lê o conteúdo por uma camada fina (`site/src/lib/directus.ts`): trocar a fonte do conteúdo é trocar essa camada.
- O painel de conteúdo (`/painel-conteudo/`, 15/10/2026) já edita notícias, mensagens, FAQ, programação, ministérios, história, galeria,
  depoimentos e mural sem o responsável abrir o Directus — é o rascunho do editor.

## A desenhar quando a fase começar (sem versões comprometidas ainda)

- [ ] O editor de páginas dentro do sistema (blocos de texto, imagem, galeria, agenda, mapa), com rascunho, prévia e publicação, e as
      permissões por papel (quem escreve, quem aprova).
- [ ] As imagens e os arquivos no armazenamento do sistema, com o tratamento que o site já faz (tamanhos, formato moderno, sem metadados).
- [ ] O site montado a partir do conteúdo do sistema (a camada `directus.ts` lendo do sistema), com a remontagem automática que já existe
      (sem token novo).
- [ ] A migração de todo o conteúdo do Directus com conferência (contagens antes e depois), ensaio na homologação e plano de volta; só então
      o Directus e o PostgreSQL são desligados (e o custo deles sai da conta).
- [ ] Travas de Revisão próprias assim que as versões `v11.X` forem desenhadas.

Decisão do responsável (19/10/2026, mantida): **não é prioridade** antes da FASE 10; a capacidade do site segue pelo caminho atual até lá.
