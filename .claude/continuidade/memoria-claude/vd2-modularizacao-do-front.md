---
name: vd2-modularizacao-do-front
description: "vD.2 (07/10/2026): app/script.js dividido em núcleo (~1.550 linhas) + 23 módulos em app/modulos/ (scripts clássicos, mesmo escopo); como foi provado, como continuar (tools/modularizar), o que ficou para depois (carregar sob demanda)"
metadata:
  node_type: memory
  type: project
  originSessionId: da91e9b0-03ac-4d66-b670-429112727baa
  modified: 2026-10-07T15:44:56.253Z
---

Em 07/10/2026 o `app/script.js` (21.711 linhas) virou um **núcleo** (~1.550 linhas: login, sessão, navegação, Painel único, termos, busca, sino, tarefas, sessões, portaria, anexos, PWA, ajudantes de tela, `registrarAcoes`) + **23 módulos** em `app/modulos/*.js` (financeiro 3.748, ebd 2.366, calendario 1.736, pessoas 1.643, canais 1.459, eventos-congressos 1.125, projetos-assembleia, psc, voluntariado, catalogos-estrutura, disciplina, meu-painel, relatorios-departamentos, ouvidoria, escalas, permissoes, meus-dados, consagracoes, arquivos, assistencia, doacoes, reunioes, enquetes). Cada módulo é um script clássico que o `index.html` carrega DEPOIS do `script.js`, em ordem alfabética, com o seu próprio `registrarAcoes({...})` no fim; o service worker tem todos na casca e a versão do cache sobe a cada módulo (v6 → v28).

**Regras que o teste `frontCsp.test.js` passou a exigir:** um `registrarAcoes` por módulo; união dos registros = ações usadas; nome de nível superior repetido entre `script.js`, `eventos.js` e módulos acusa (achou `lerArquivoComoBase64` declarado 2× no original); `index.html` carrega exatamente os módulos da pasta, em ordem alfabética; casca do SW com todos. `frontEscape` e `frontTipoDosArgumentos` varrem a junção. `tools/csp-e2e/fontes.js` dá a ordem dos arquivos ao equipamento de tela.

**Como continuar / repetir:** `tools/modularizar/` (bloco-refs → extrair-modulo → registro-sem-reflow → [mover-funcoes] → ligar-modulo → jest; README com a receita) e `prova-modulo.js` (prova em navegador, rodar de dentro de `tools/csp-e2e`). Fluxo: ramo stacked por módulo (um commit por módulo), lote sobe no `homolog` (teste de tela roda lá e compara com a base `tools/csp-e2e/base/commit.txt`), prova em navegador na homologação com o pastor fictício 900007 (tem psc_gestao, calendario_secretaria, canais_gestao, eventos_gestao, ebd_gestao) ou dirigente 900001/tesoureiro 900004, e só então o ramo da mudança vai para a `main` (nunca mesclar o homolog).

**Ficou para depois (aberto na vD.2 e na v10.4):** carregar sob demanda (exige que o despachante só conheça ações de módulos carregados), `index.html` por módulo, funções reaproveitáveis. Linha de base dos testes de tela continua sendo o commit da gaveta (7d1ecec): mudança intencional de tela exige atualizar `tools/csp-e2e/base/commit.txt`.

**Why:** 20 mil linhas num arquivo era o maior risco de edição do front; a divisão sem mudar código, provada ação por ação, é o que torna seguro mexer em qualquer tela.

**How to apply:** ao editar uma tela, procurar a função em `app/modulos/<tema>.js` (não mais no `script.js`); ação nova de um módulo entra no `registrarAcoes` DO MÓDULO; função de uso geral vai para o núcleo; nunca repetir nome de nível superior entre arquivos. Ver [[csp-forte-em-andamento]] e [[urls-producao-e-homologacao]].

**Trava D-A fechada em 07/10/2026:** rodada completa 37653097551 (4.737 ações iguais, 0 divergência, 0 CSP) + aba de 22/23 módulos aberta na homologação com API real; vD.3 varredura de rotas (api/scripts/varrer-rotas.js) roda no fluxo do SWA a cada deploy (produção e preview). Próximo da FASE D sem depender do responsável: itens abertos da vD.2 (sob demanda), vD.6 celular no CI; o resto (vD.4, vD.5 ensaio, vD.7, vD.8 segredos) depende dele.

**Prova de módulo no runner (08/10/2026):** `gh workflow run sistema-prova-navegador.yml --ref <ramo> -f roteiro=modulo -f base=<url> -f argumentos="--modulo X --funcoes <ação REGISTRADA em registrarAcoes> --matricula 900007 --aba btnAbaX --api api/x [--alvo '#abaX'] [--clicar '#btnSubMeupainelMinhasescalas']"`. Armadilhas: (1) `argumentos` entra SEM aspas no shell do runner → um `#` solto vira comentário e engole o resto da linha (até o `| tee`): seletores sempre entre aspas simples dentro do valor; (2) `--funcoes` confere ações registradas no despachante, não funções soltas (`volCarregarMinhasEscalasAcao` falha; `volAderirTermoAcao` passa); (3) o pastor fictício 900007 é o único sem e-mail (login sem 2ª etapa) e precisa ter a permissão do módulo no seed (ganhou `escalas` em 08/10); (4) `prova-modulo.js` lê `NAVEGADOR`/`EDGE` do ambiente; `--clicar <seletor>` abre sub-aba. Seis telas da FASE 7 provadas 34–35/35 em 08/10/2026 (Trava 7-A).
