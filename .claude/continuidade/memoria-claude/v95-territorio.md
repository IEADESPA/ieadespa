---
name: v95-territorio
description: "v9.5 Mapa territorial — EM PRODUÇÃO desde 11/11/2026 (revert -m 1 0d16ee7), migração 170, casca v56; decisões dele; chave do Maps gravada em 11/11; a FASE 9 fechou com a Trava 9-B (ver trava-9b)"
metadata:
  node_type: memory
  type: project
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-11T12:35:07.189Z
---

**EM PRODUÇÃO desde 11/11/2026:** merge `0d16ee7` (desfazer: `git revert -m 1 0d16ee7`), docs `bb1edba`. Deploy 43019675987: migração 170 aplicada, `/api/territorio/mapa` 401 sem login, casca app-shell-v56, CSP da página do mapa com sandbox. Teste de tela em produção 43019675966 (base 3595b01). Parada de 09/11 a 10/11 para os eventos do site ([[site-eventos-novembro]]); retomada em 10/11.

O que tem: migração 170, rota `/api/territorio`, pílula Território na aba Expansão, endereço em linhas (`app/modulos/endereco.js`), página do mapa do Google à parte (`app/mapa-territorial.*`, iframe sandbox sem allow-same-origin + CSP própria da rota em app/staticwebapp.config.json). A tela só aceita chave com forma de chave (o teste de tela usa "Chave A" de mentira).

Decisões DELE (06/11): endereço com todas as linhas (não só bairro); Google Maps com a opção "lista e desenho" escolhida na hora; critérios de emancipação numa tabela que ele monta. Por interpretação (ele pode mudar): localização pelo bairro (ponto central), linha reta, raio 3 km, régua média semeada uma vez, só membros (congregado/novo convertido fora), dízimo médio só com ≥3 dizimistas, unidade sem ponto → bairro "a conferir".

**Chave do Maps: GRAVADA em 11/11/2026** (prod e env 21) com a MESMA chave do site, lida do site/src/config/site.ts direto para o az (ele aprovou o comando; o valor nunca apareceu). A chave do site NÃO tem restrição por endereço e já tem a Maps JavaScript API — nada mudou no Google Cloud (detalhe em SECRETS.md).

Armadilhas: a bateria do LocalDB rodou sobre bases velhas (sem 169/170) e acusou "Invalid object name 'Bairros'" — desde 61cd0c8 a `tudo.sh` roda `rodar.sh preparar` sozinha (~2 min); a sobra rara do e2e-79 juntava no bairro B que a corrida às vezes desativa (defeito do roteiro, corrigido). A bateria inteira leva ~1h50 e ele reclamou ("2 horas para entrar em produção"); ele escolheu a bateria rápida por versão e a completa só nas Travas ([[bateria-rapida-por-versao]]). CHECK de UF com LIKE '[A-Z]' sob CI aceita minúscula → COLLATE Latin1_General_BIN; o DOM simulado não tem Element.querySelector; o simulador acusa toda tag <svg> como ataque; "300" aparece em "3000". Ver [[v94-missoes-wip]] e [[empurrar-ramo-durante-o-servico]].
