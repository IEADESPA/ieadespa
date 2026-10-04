# CSP forte — em andamento (parado em 04/10/2026)

**Estado em uma frase:** a conversão do front está pronta e passa em todos os testes automáticos, mas **ainda não foi comparada, num navegador de
verdade, com a versão antiga, e não foi publicada**. Tudo isto está na ramificação `csp-forte` (não vai para a produção enquanto não for
unida à `main`). A `main` e a produção estão como estavam.

## O que é e por que dá trabalho

A política forte (`script-src 'self'`, sem `'unsafe-inline'`) diz ao navegador "só execute código que veio dos meus arquivos". O front tinha
**880 pontos com código escrito dentro do HTML** (`onclick="abrir(12)"`: 469 em `app/index.html` e 411 em textos montados no `app/script.js`).
Cada um precisava virar um mecanismo central. O defeito típico de uma conversão incompleta é silencioso: o botão deixa de responder.

## O que já está feito (nesta ramificação)

- **`app/eventos.js`:** um despachante único. O HTML só diz o nome da ação (`data-on-click="salvarPessoa"`, argumentos em
  `data-args-click='[12,"G"]'`, `data-prevent`, `data-stop`). Só roda ações **registradas** numa lista fechada no fim do `script.js`
  (`registrarAcoes`, 688 ações); nome fora da lista não faz nada. Imita o evento em linha: sobe do filho para o pai, para no `data-stop`,
  erro numa ação não derruba as outras, e a ordem com os "clicar fora fecha" foi preservada.
- **Conversão:** 469 → 0 no `index.html` e 408 → 0 no `script.js` (467 + 400 por máquina, 10 à mão; os casos especiais estão na nota do commit).
  Nomes de função dinâmicos só vêm de texto fixo do código, nunca de dado.
- **Página pública `verificar.html`:** o script e o estilo saíram de dentro dela (`verificar.js`, `verificar.css`).
- **Service worker:** cache `v4`, com `/eventos.js` na casca (o `index.html` e o `script.js` novos só funcionam com ele).
- **Testes permanentes:** `api/shared/__tests__/frontCsp.test.js` (reprova qualquer atributo de evento em linha, `javascript:`, `<script>` em
  linha, `eval`/`new Function`, ação não registrada, nome de ação vindo de dado; 20 mutações provadas) e `eventosDespachante.test.js`.
- **Suíte inteira:** 96 arquivos, 4550 testes verdes, com o relógio do servidor local e em UTC. Também passaram os roteiros em jsdom e um de
  cliques no front real (agente A).

## O que falta, na ordem

1. **Equipamento de teste em navegador real (`tools/csp-e2e/`, escrito pelo agente B, parado no meio de uma edição).** Aperta todos os controles
   de todas as telas, na versão antiga (extraída de `HEAD` da `main`) e na nova (com a política estrita ligada), com uma API simulada, e
   compara o que cada clique faz. A sintaxe dos arquivos está íntegra, mas **rode primeiro o autoteste com a cópia estragada**
   (`node criar-mutante.js`, depois a comparação contra `mutante/app --nova-sem-csp`) e a **rodada dupla da original contra ela mesma** (prova de
   estabilidade) antes de confiar. Instalação e comandos: `tools/csp-e2e/README.md` (precisa de `npm install` na pasta; usa o Edge instalado).
2. **Rodar a comparação original × nova** e corrigir toda divergência apontada.
3. **Primeira publicação:** unir a ramificação à `main` **sem mudar o cabeçalho**, passando antes pela homologação (que desde 04/10/2026 roda a
   API do projeto de verdade). O sistema segue com a política antiga; o responsável usa por alguns minutos.
4. **Segunda publicação:** trocar a política em `app/staticwebapp.config.json` pela estrita (abaixo). Se algo falhar, voltar a linha antiga
   desfaz tudo. Depois, o responsável testa de novo.
5. Registrar o resultado no plano da fase 7 e na memória, e tirar `tools/csp-e2e/` ou mantê-lo, conforme valer a pena.

## A política que será ligada (conferida contra o que o front usa)

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob: https://ieadespaarmazenamento.blob.core.windows.net; connect-src 'self'; worker-src 'self'; manifest-src 'self';
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
```

`style-src` mantém `'unsafe-inline'` de propósito: o front tem 931 atributos `style="..."` no HTML e 355 em textos do `script.js`, e as duas janelas de
impressão escrevem um `<style>` em linha. Injeção de estilo não executa código; trocar isso é um projeto à parte. As fotos vêm de links assinados
do armazenamento do Azure (`img-src`); os documentos abrem por `<a target=_blank>` (navegação, não depende de `img-src`); `fetch` só vai para `/api`.

## Como retomar

```sh
git checkout csp-forte          # a ramificação (a main não tem estas mudanças)
cd tools/csp-e2e && npm install # puppeteer-core; usa o Edge já instalado
```

Não esqueça: o equipamento compara a **original** (`git archive HEAD app`, da `main`) com a **nova** (o `app/` desta ramificação).
