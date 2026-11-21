---
name: trava-9b
description: "Trava 9-B — FECHADA e EM PRODUÇÃO 11/11/2026 (revert -m 1 86a105f), migração 171, casca v57; FASE 9 ENCERRADA, próxima FASE 10; v9.6 fora do plano; decisões dele e armadilhas"
metadata:
  node_type: memory
  type: project
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-11T16:49:03.984Z
---

**EM PRODUÇÃO desde 11/11/2026** (merge `86a105f`; reverter = `git revert -m 1 86a105f`; docs `698c5f5`). Migração 171 (`CamposMissionarios.Versao`; `EnvioSustentoValores.CliSessaoId`/`CliEm`), casca v57, `e2e-80` (48), base do teste de tela `5661670`.

- **FASE 9 ENCERRADA.** Próxima: FASE 10 (docs/plano/fase-10-experiencia-design-performance.md). A v9.6 (CEBAS/MROSC) saiu do plano por decisão dele ("se não melhora o financeiro, deixa quieto") — o que um convênio exigiria está anotado no plano.
- **Achados corrigidos:** vacância soltava meses suspensos/impedidos (alto); todo sustento passa pela CLI (Estatuto Art. 58 §4º) e o aumento cita a reunião; congregado fora (régua `membroEmComunhao` em estatuto.js); mantenedora não muda com sustento do caixa dela; tutela impede na prévia; versão do campo; conflito de interesse do próprio missionário; Meus Dados completo; CME só-CME; permissão `missoes` para gerir; 428 na decisão da CLI; fracionamento falso; afastamento do missionário; contagem da Extensão; artigos da vacância; ROPA 11, II, "d".
- **Decisões que ele pode mudar:** listadas no fim da seção da Trava 9-B em docs/plano/fase-9-entidades-vinculadas.md (inclui sustento a outro país × Art. 58 §3º e o CRA, Art. 126-B, II, "a").
- **Decisão dele (11/11/2026, merge 508bc42):** sustento para fora do país pode, só muito bem fundamentado — pedido/aumento Transcultural com sustento exige texto de 300+ caracteres (por que fora, quem mais sustenta, por que o valor). Chave do Maps gravada (ver [[v95-territorio]]).

Armadilhas: mudar a regra das etapas (cli sem cme) quebrou a conferência de "convênio externo" (agora exige cme E cli); rodar e2e-76 e e2e-77 na MESMA chamada do rodar.sh polui as contagens (rodar separado); e2e-31 fechava a votação no mesmo tique do último voto (relógio do Windows ~15 ms) — WAITFOR 50 ms; mutação antiga do front com trecho alterado aparece como "trecho achado 0 vez(es)" (SO_MUTACAO roda só uma). Ver [[trava-9a]] e [[bateria-rapida-por-versao]].
