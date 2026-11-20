---
name: trava-7c
description: "Trava de Revisão 7-C FECHADA e EM PRODUÇÃO em 27/10/2026 (merge 3a609b8) — FASE 7 encerrada, próxima é a FASE 8; o que ficou para gente fazer"
metadata:
  node_type: memory
  type: project
  originSessionId: a96b641f-4af0-4399-a180-c1aca450260c
  modified: 2026-10-27T18:36:52.241Z
---

Trava 7-C (auditoria v7.11–v7.15 + varredura da fase 7) **em produção desde 27/10/2026**: merge `3a609b8` (reverter = `git revert -m 1 3a609b8`), migrações 153/154/155, e2e-35..46 (39 é da v7.14), casca do service worker v41. 5 altos, 19 médios, 25 baixos, todos corrigidos. Registro com as 5 perguntas no fim de `docs/plano/fase-7-parte-2-menores-cuidado-e-crise.md`.

**FASE 7 encerrada em 27/10/2026.** O plano da fase foi dividido em parte 1 (`fase-7-saude-eventos-e-comunicacao.md`: resumo, v7.1–v7.5, Trava 7-A) e parte 2 (`fase-7-parte-2-menores-cuidado-e-crise.md`: v7.6–v7.15, Trava 7-C); comentários do código que citam o arquivo antigo com "## v7.15" valem para a parte 2 (a parte 1 tem o ponteiro). Próxima: FASE 8 (v8.1 = AFM + faltas da CLI, a antiga v7.9; ver [[v79-movida-para-v81]]).

**Decisões dele (23/10/2026), não reabrir:** dinheiro do voluntário = só aviso ao tesoureiro (Fornecedores.MembroId); aptidão para funções com criança = departamentos e liderança (aviso, não tira do cargo); comunicado ao menor pelos responsáveis e usuário de banco só de dados → Fase 10 (v10.7).

**Teste de tela completo (`completo=sim`) no computador leva ~48 min**: o limite do job `telas` subiu para 90 min (a repescagem estourava os 60). Campo `mural_oracao.sistema_pendente` criado no Directus de produção em 27/10/2026, com autorização explícita dele.

**Ação humana pendente (não é código):** cadastrar o Superintendente de cada região, o Comitê de Proteção e marcar as turmas da EBD "com menores"; por volta de 29/10/2026 tirar a permissão pública de criar em `mural_oracao` (só com o "pode" dele; ver [[v7111-mural-do-site-wip]]). Ver também [[v714-identidade-visual]] e [[v715-crise-porta-voz]].
