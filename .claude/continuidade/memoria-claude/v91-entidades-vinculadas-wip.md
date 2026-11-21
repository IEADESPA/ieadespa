---
name: v91-entidades-vinculadas-wip
description: "v9.1 Entidades vinculadas — EM PRODUÇÃO desde 04/11/2026 (revert -m 1 8f5063a), migração 165, casca v51; decisões que ele pode mudar; próxima = v9.2"
metadata:
  node_type: memory
  type: project
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-04T13:25:06.443Z
---

A v9.1 (Entidades vinculadas, Estatuto Art. 64–68; Reg. Art. 47-A e 153) está **EM PRODUÇÃO desde 04/11/2026**.

**Reverter:** `git revert -m 1 8f5063a`.

**O que foi entregue:**
- migração 165
- casca do service worker v51
- rota `/api/entidades-vinculadas/<ação>` (só o nível geral com a permissão `entidades_vinculadas`)
- card "Entidades Vinculadas" no portal

O "Como ficou" está em `docs/plano/fase-9-entidades-vinculadas.md` (commit `c5efe7e`).

**Provas:**
- jest 6.267
- e2e-69 160 e e2e-70 11/12 (`bash rodar.sh preparar-entidades`)
- tela `tools/front-entidades` 70 (16 mutações)
- duas revisões independentes
- teste de tela da homologação 41825543147: 0 divergência
- base do teste de tela aprovada em `7be3b82`

**Decisões por interpretação (ele pode mudar):**
- o nepotismo é conferido contra a Diretoria Executiva;
- a decretação sem urgência só do 6º dia em diante;
- a correção da caducidade até 10 dias, com a ata;
- depois de intervenção recusada ou caducada, sem urgência;
- a periodicidade fica fixa depois do 1º período;
- a destituição vai à Assembleia (Art. 18, VII, c);
- a verificação do Conselho Fiscal anda com a prestação do ano;
- só o Presidente com a cadeira decreta e encerra;
- a prestação é anual, com 120 dias para entregar.

**Ação humana:** nenhuma obrigatória. As entidades reais são cadastradas quando houver (ver [[nao-cobrar-cadastros-de-pessoas]]).

**Armadilha:** o shell come a barra invertida até dentro de `node -e` com aspas simples. Regex e `\n` em texto só pela ferramenta Edit/Write. Aconteceu 3 vezes nesta versão.

Ver [[trava-8b]] e [[verificacao-e2e-localdb]].
