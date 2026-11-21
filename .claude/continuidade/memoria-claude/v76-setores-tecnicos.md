---
name: v76-setores-tecnicos
description: "v7.6 Setores Técnicos + Termo de Vistoria — EM PRODUÇÃO desde 09/10/2026 (migração 142): decisões que o Regimento não fecha, o que a revisão adversarial achou, como reverter e o que ficou para a v7.7"
metadata:
  node_type: memory
  type: project
  originSessionId: dccbed28-b381-4d4e-99d0-06df344d741a
  modified: 2026-10-09T11:53:58.788Z
---

v7.6 pedida pelo responsável em 08/10/2026 ("faça a versão 7.6 Setores Técnicos"). Contrato e decisões estão em `docs/plano/fase-7-saude-eventos-e-comunicacao.md` (seção v7.6) — aqui só o que não se deduz do código.

**Estado: EM PRODUÇÃO desde 09/10/2026.** Ramo `v7-6-setores-tecnicos` mesclado na `main` com commit de união 3eda3ef (`--no-ff`). **Reverter de uma vez:** `git revert -m 1 3eda3ef` (a migração 142 é só de acréscimo e idempotente; não precisa desfazê-la). Conferido em produção: deploy verde com "Executar Migrações SQL" e a varredura de rotas; 12 rotas novas dão 401 sem sessão (nunca 404/5xx); `modulos/setores-tecnicos.js` 200; casca do service worker v30. O PR #21 (homologação) segue OPEN — a união foi do ramo, nunca do `homolog` ([[urls-producao-e-homologacao]]). Base do teste de tela aprovada em `tools/csp-e2e/base/commit.txt` = 3f5f5f0.

**Entregue:** os 3 itens do plano. O item 3 (verificação de antecedentes) virou o **Termo de Vistoria** (Art. 133 §5º): só o hash SHA-256 da certidão, calculado no navegador, nunca o arquivo. Validade de 180 dias, bloqueio de escala, treinamento da Lei 14.811/2024 e o dever de auto-denúncia (§5º, V) ficam na **v7.7**, que usa este termo como base.

**Decisões minhas (cada uma é uma linha, reversível pela CLI):** Segurança Patrimonial também interdita; interdição vale na hora e não caduca sozinha (a Diretoria é cobrada todo dia); o sistema não cancela culto sozinho; emissão por PIN com contenções (tetos 3 atos/dia e 5 em aberto, 5 vínculos vigentes, 3 candidaturas/dia); Diretoria = Presidente + Secretário Geral; texto do Termo sem parecer de advogado (como a [[responsavel-leigo-sem-advogado]]); só o Termo aceito **com a cláusula** dá o poder de emitir.

**Por que a revisão adversarial valeu (achados reais, nenhum visto pelos testes de unidade):** poder desamarrado do Termo aceito; auditoria vazando parecer, motivo e identificador do canal; "atender" aberto a qualquer liderança (virou: território + permissão `pessoas` + sem departamento); spam de candidatar/sair; e-mails aguardados dentro da transação (`aguardarEntrega:false` + envio em lotes); tetos com corrida (`sp_getapplock` por emitente); edição parcial do setor desarmando marcas; quem indicou/aprovou registrava a ficha em setor com poder; termo de vistoria sem como corrigir (virou a anulação, tabela `VistoriasAnulacoes`, só de acréscimo); aceite sem provar qual texto foi lido (`termoHash`, 422 com `termoMudou:true`).

**Como foi provada (modelo para a próxima):** 4.766 testes de unidade; e2e no LocalDB psc7 (117+307+136+120+19, ferramenta em `tools/e2e-localdb/`); deploy da homologação; 3 provas em navegador real no runner (`sistema-prova-navegador.yml`, roteiro `modulo`: Meu Painel com 900007 `--clicar '#btnSubMeupainelSetores'`; abas Setores e Vistoria com 900013) — **liste em `--funcoes` só as ações registradas** (carregadores internos chamados pelo código dão "4/6" falso); teste de tela vD.1 com a base nova aprovada num 2º commit cujo `app/` é igual ao da base.

**How to apply:** para a próxima versão com migração e tela, repetir o trio — backend + e2e real ([[verificacao-e2e-localdb]]), subagente só do front com mutação dos seus próprios testes, e **dois revisores independentes de leitura** (backend e front) que não vêem a minha conclusão. Cada revisão achou coisa que eu e os testes não víamos. Ao mudar uma regra no servidor, os roteiros e2e antigos quebram por expectativa defasada (não por defeito): reler cada ✗ antes de "consertar o servidor" (duas vezes o teste é que estava errado: cadeia `x-forwarded-for` com penúltimo público; número de 11 dígitos aceito como motivo).
