---
name: v92-expansao-wip
description: "v9.2 Expansão — EM PRODUÇÃO desde 04/11/2026 (revert -m 1 c98a250), migração 166, casca v52; decisões que ele pode mudar; ação humana: papel Secretário de Missões; próxima = v9.3"
metadata:
  node_type: memory
  type: project
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-04T16:54:13.426Z
---

A v9.2 (Expansão: Extensões da Tenda, emancipação e nova congregação; Estatuto Art. 5º §5º, Regimento Art. 23, 24 e 109-A) está **EM PRODUÇÃO desde 04/11/2026**.

**Onde está:**
- merge `c98a250` na main (desfazer: `git revert -m 1 c98a250`); docs `ae2bb1e` ("Como ficou a v9.2" no plano da fase 9, README);
- teste de tela da homologação: execução 41855454625, 0 divergência e 0 violação de CSP; base `commit.txt` = 490adc1.

**Provas:**
- jest 6.296;
- e2e-71 172 e e2e-72 20/21 (`bash rodar.sh preparar-expansao`);
- tela `tools/front-expansao` 79 (25 mutações);
- duas revisões independentes tratadas.

**Ação humana (dele):** dar em Liderança o papel "Secretário de Missões" a quem lidera a SEMIADESPA; dar o acesso de Dirigente às congregações nascidas de emancipação.

**Decisões por interpretação (ele pode mudar):**
- a abertura de Extensão vai direto à CLI, sem a CME (o Art. 23 fala em congregações e emancipações);
- a abertura e a troca do Encarregado são só do Dirigente da Mãe ou do nível geral; a emancipação pode ser pedida também pelo Pastor de Área;
- a nova congregação é pedida só pelo nível geral;
- o Secretário de Missões age só pela CME, não por congregação;
- na emancipação passam só os membros (desligado e falecido ficam); o dízimo vai junto; a matrícula na EBD da Mãe e os cargos locais na Mãe não mudam sozinhos;
- o acesso de escopo da Extensão termina; todas as sessões caem;
- a numeração de abertura das congregações (Estatuto Art. 5º §2º) não está no sistema;
- o cadastro de Congregações e Extensões continua servindo para registrar as que já existem.

**Armadilhas:**
- `python -` com heredoc no Bash quebrou com aspas e barra invertida: grave o script num arquivo pelo Write e rode `python arquivo.py`.
- O ambiente da prova da tela não tem `avisarResultado`; use `mostrarToast`.
- O nome em `Funcionalidades` tem limite de 100 caracteres (a migração falha).

**Próxima:** v9.3 (Distrito e macroexpansão).

Ver [[v91-entidades-vinculadas-wip]].
