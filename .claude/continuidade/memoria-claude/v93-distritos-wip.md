---
name: v93-distritos-wip
description: "v9.3 Distrito — EM PRODUÇÃO desde 05/11/2026 (revert -m 1 8434bea), migração 167, casca v53; desenho ajustado (Liderança só pelo Presidente, Distrito gravado no fechamento, caixa do Distrito); decisões que ele pode mudar; próxima = Trava 9-A"
metadata:
  node_type: memory
  type: project
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-05T12:04:45.177Z
---

A v9.3 (Distrito e macroexpansão; Regimento Art. 6-A, 53-D, 126-K a 126-P) está **EM PRODUÇÃO desde 05/11/2026**:
- merge `8434bea` (desfazer: `git revert -m 1 8434bea`), docs `819b18b`;
- migração 167, casca v53;
- teste de tela da homologação 41901967482: 0 divergência, 0 CSP;
- o "Como ficou" está no plano da fase 9.

**Mudanças sobre o desenho (todas no "Como ficou"):**
- o Pastor Distrital e o Interventor recebem o acesso em Liderança, e só o Presidente dá, troca ou tira (os papéis não se renomeiam);
- o Distrito do repasse fica gravado no fechamento (`FechamentosTesouraria.RepasseDistritoId`, no FecharMesTesouraria);
- o período legado não tem efeito no dinheiro até o decreto;
- o caixa do Distrito aparece na ficha e na situação do Tesouro (conta única);
- o mês só exige as congregações que já fechavam a tesouraria, e "falta fechamento" é separado de "retenção";
- o Interventor com outro cargo é recusado, e durante a intervenção todo acesso no território exige o Presidente.

**Corrigido junto, já em produção:** a tela que ficava muda depois da confirmação reforçada (428 troca o bilhete). Agora o dono é conferido por matrícula e tipo de sessão (`dstDono`/`expDono`/`entDono`). Vale para a decisão da Expansão e para a intervenção das Entidades. Também o `Array.from(el.options)`.

**Decisões por interpretação (ele pode mudar):**
- o Dízimo Institucional = 10% da soma do Total Final dos fechamentos do território;
- o mês financeiro começa no registro do decreto e volta para a Sede no mês da desativação;
- o balanço vai ao NIF até 31/03;
- a intervenção destitui o escopo do Distrito, os Vices e os Superintendentes do território;
- as medidas (contas, procuração, Justiça) só ficam registradas;
- a Tesouraria Geral continua liberando os 40%;
- o CDE não cria unidades sozinho.

**Aceito:**
- o NIF precisa receber `distritos` em Permissões;
- o Vice em exercício não é tratado como Presidente;
- a Secretaria renova o mandato vigente do Pastor Distrital;
- as corridas do Presidente em Liderança não são tratadas.

**Provas:**
- jest 6.318;
- e2e-73 146 e e2e-74 16/17;
- tela 72 (32 mutações);
- Expansão 79 e Entidades 70 de novo.

**Armadilha:** o e2e-71 na base `cenario-expansao` falha sem a 167 (o Meus Dados lê os Distritos). Rodar sobre `cenario-distritos`.

Ver [[v92-expansao-wip]].
