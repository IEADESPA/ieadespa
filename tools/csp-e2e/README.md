# csp-e2e — verificação diferencial em navegador de verdade

Prova que a versão NOVA do front (eventos por delegação em `eventos.js` + CSP estrita) se comporta igual à ORIGINAL.
Usa o Edge já instalado (headless, via puppeteer-core), sem internet e sem banco: a API é simulada.

## Como rodar

```sh
cd <scratchpad>/csp-e2e
# a original (HEAD) já está extraída em original/app; para refazer, sem mexer no repositório:
#   git -C "c:/sistemas vs code/ieadespa" archive HEAD app | tar -x -C original

# comparar ORIGINAL × NOVA (a nova roda com a CSP estrita); reaproveita o plano e a 1ª rodada da original:
node rodar.js --original original/app --nova "c:/sistemas vs code/ieadespa/app"
# o mesmo, só uma ação por manipulador distinto (cerca de 1/3 do tempo):
node rodar.js --original original/app --nova "c:/sistemas vs code/ieadespa/app" --rapido
# rodada dupla da original contra ela mesma (prova de estabilidade):
node rodar.js --original original/app --estabilidade
```

Opções: `--workers 12` `--navegadores 3` `--perfis anonimo,geral,membro` `--redescobrir` (refaz o plano)
`--so geral:12,geral:40 [--v]` (repete só essas ações e mostra o detalhe) `--sem-especiais` `--saida <pasta>` `--porta 47811`
`--nova-sem-csp` (só para o autoteste com a cópia estragada: `node criar-mutante.js` e `--nova mutante/app --nova-sem-csp`).
Só as peças especiais: `node so-especiais.js --original original/app --nova <pasta>`.
Cobertura dos atributos `on*` da original: `node cobertura.js planos/<plano>.json -v`.

Saída: `resultados/relatorio.txt` (resumo + cada divergência com a identidade do controle e o caminho até ele),
`resultados/nova-transcritos.json`. Código de saída 0 = tudo igual, zero violação de CSP e peças especiais conferidas.

## Peças

- `servidor.js` — serve a pasta (com a CSP final, se pedido); `/api/*` simulada, registrada por ação (método, rota, corpo normalizado).
  Login: `5` + `senha-simulada-geral` = líder GERAL com todas as permissões; `20` + PIN `1234` = membro. Qualquer outro par é recusado.
- `modelo.js` — lê o script.js ORIGINAL: campos que o front lê (listas, objetos, números) e os textos comparados por tela/rota.
  As rotas sem resposta própria recebem um registro "universal" com 5 linhas montado com esse modelo (idêntico nas duas versões).
- `instrumento.js` — injetado antes da página: relógio parado em 04/10/2026, sorteio fixo, sem service worker; substitui `window.open`,
  diálogos, downloads, área de transferência, notificação; registra CSP, erros, avisos, mutações; espera a tela acalmar; localiza e aciona controles.
- `cobertor.js` — cada ação abre aba limpa, entra, refaz o caminho até o controle e grava o passo final.
- `rodar.js` — descobre o PLANO na original (em largura: todo controle visível com `on*`/`data-on-*`/`data-stop`/`data-prevent` vira ação;
  até 5 por manipulador), roda o plano nas versões e compara (`comparar.js`). `especiais.js` — planilha .xlsx real, rol, carta, certificado, verificar.html.

Identidade de um controle: tag + rótulo (id, ou aria-label/title, ou texto) + ordem entre iguais; o caminho é a sequência dessas identidades.
Tolerâncias: chamadas de API, avisos e diálogos comparados como conjunto (ordem de pedidos paralelos não conta); porta trocada por ORIGEM;
exceção síncrona no manipulador vale igual vinda do atributo (erro da janela) ou do despachante (console.error "[eventos] erro na ação").
