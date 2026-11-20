---
name: v84-credencial-digital
description: "v8.4 credencial digital EM PRODUÇÃO desde 29/10/2026 (revert -m 1 ab26201), migração 159, SW v45; decisões que ele pode mudar; próxima = Trava 8-A"
metadata:
  node_type: memory
  type: project
  originSessionId: 28922282-7bd5-4337-97ac-354437859a13
  modified: 2026-10-29T12:25:13.189Z
---

v8.4 (credencial digital com QR, Regimento Art. 76) EM PRODUÇÃO desde 29/10/2026: merge ab26201, desfazer = `git revert -m 1 ab26201`. Migração 159 (CredenciaisEclesiasticas), SW app-shell-v45, rotas /api/credenciais/<ação> e a pública /api/verificacao-credencial/{código}, página app/credencial.html (fora do cache do aparelho). Próxima = Trava de Revisão 8-A (audita v8.1 a v8.4).

**Decisões por interpretação (ele pode mudar):** processo só aberto não aparece no QR (só sanção ou afastamento cautelar suspendem o obreiro); recurso não suspende a pena; licença = membro ativo, obreiro sem licença p/ oficiar; lote só adultos que nunca tiveram (60 por clique), menor pela emissão individual; recolhimento na exclusão homologada, desligamento e abandono, Disciplina Rigorosa só inativa; suspensão temporária volta a habilitado ao terminar (Art. 77 hoje só aplicado à Rigorosa); página pública mostra nome, categoria, congregação e a via.

**Why:** contexto para a Trava 8-A e para não reabrir o decidido. **How to apply:** armadilhas — a disciplina não muda o cadastro (Status/Situação): ler o processo (MARCAS_DISCIPLINA em credencialDb); heredoc do shell quebra scripts python (sempre Write); `.btn-subaba`/`.barra-lista` vencem `[hidden]` (usar style.display); resposta do simulador de tela não tem text() nem addEventListener em elemento. Provas: e2e-59 (68) e e2e-60 (9), tools/front-credencial (42). Ver [[v83-consagracao-documentacao]].
