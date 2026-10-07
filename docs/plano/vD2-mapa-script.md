# vD.2 — mapa do `app/script.js` de ANTES da divisão (gerado em 2026-10-07 de manhã; a divisão em 23 módulos está na vD.2 do plano da FASE D)

Total: **21711 linhas**, **1307 funções** de nível superior, **244 declarações** (const/let/var) de nível superior e **19 instruções** soltas que executam no carregamento.

## Temas (prefixo do nome da função) — candidatos a arquivo

| Tema | Funções | Linhas |
| --- | ---: | ---: |
| `carregar` | 155 | 3316 |
| `calendario` | 162 | 1822 |
| `ebd` | 107 | 1425 |
| `canais` | 102 | 1256 |
| `relatorios-dept` | 58 | 1207 |
| `eventos` | 87 | 963 |
| `salvar` | 42 | 957 |
| `psc` | 62 | 787 |
| `voluntariado` | 70 | 730 |
| `abrir` | 21 | 492 |
| `registrar` | 31 | 456 |
| `renderizar` | 11 | 410 |
| `pdq` | 20 | 308 |
| `cei` | 14 | 297 |
| `escalas` | 19 | 278 |
| `criar` | 12 | 244 |
| `pedir` | 8 | 243 |
| `lgpd` | 8 | 166 |
| `mostrar` | 9 | 161 |
| `alternar` | 22 | 153 |
| `enviar` | 5 | 132 |
| `solicitar` | 4 | 120 |
| `confirmar` | 7 | 118 |
| `editar` | 8 | 106 |
| `adicionar` | 6 | 99 |
| `montar` | 11 | 96 |
| `ouvidoria` | 8 | 82 |
| `preparar` | 2 | 76 |
| `badge` | 12 | 72 |
| `cancelar` | 7 | 72 |
| `aplicar` | 5 | 69 |
| `encerrar` | 7 | 68 |
| `sincronizar` | 1 | 65 |
| `ver` | 1 | 63 |
| `gerar` | 4 | 60 |
| `baixar` | 4 | 60 |
| `excluir` | 7 | 58 |
| `acesso-membro` | 4 | 58 |
| `render` | 2 | 57 |
| `atualizar` | 6 | 54 |

## Acoplamento entre temas (quantas funções de A chamam funções de B)

| De → para | Chamadas |
| --- | ---: |
| carregar → fetch | 150 |
| carregar → ebd | 140 |
| carregar → json | 112 |
| ebd → fetch | 69 |
| carregar → args | 66 |
| mostrar → carregar | 66 |
| ebd → mostrar | 51 |
| cei → carregar | 48 |
| calendario → ebd | 44 |
| salvar → fetch | 41 |
| salvar → carregar | 40 |
| relatorios-dept → fetch | 39 |
| eventos → calendario | 32 |
| registrar → fetch | 27 |
| salvar → avisar | 27 |
| relatorios-dept → ebd | 24 |
| registrar → carregar | 24 |
| calendario → mostrar | 22 |
| canais → ebd | 21 |
| relatorios-dept → json | 20 |
| voluntariado → mostrar | 20 |
| calendario → args | 19 |
| calendario → voluntariado | 19 |
| ebd → json | 19 |
| eventos → ebd | 19 |

## Instruções de nível superior que executam no carregamento (ordem importa ao dividir)

- linha 74: document.addEventListener("click", (ev) => {
- linha 103: window.addEventListener("unhandledrejection", (evento) => {
- linha 161: window.addEventListener("beforeinstallprompt", (ev) => {
- linha 195: document.addEventListener("DOMContentLoaded", () => {
- linha 246: document.addEventListener("DOMContentLoaded", registrarServiceWorker);
- linha 379: document.addEventListener("DOMContentLoaded", marcarSessaoGeralNaPagina);
- linha 778: document.addEventListener("click", (ev) => {
- linha 1012: document.addEventListener("click", (ev) => {
- linha 3525: window._alienacaoParecerAtual = null;
- linha 5428: document.addEventListener("DOMContentLoaded", () => {
- linha 6708: window._convocacaoEditandoId = null;
- linha 6923: window._sessaoCredenciamentoAtual = null;
- linha 8250: window._membroHistoricoAtual = null;
- linha 9274: document.addEventListener("DOMContentLoaded", () => {
- linha 9285: document.addEventListener("DOMContentLoaded", () => {
- linha 13938: window.addEventListener("online", () => {
- linha 13942: window.addEventListener("offline", () => {
- linha 13945: document.addEventListener("DOMContentLoaded", () => {
- linha 21581: registrarAcoes({

## Funções sem nenhuma chamada interna (só a partir do HTML/registro)

575 de 1307 funções não são chamadas por nenhuma outra função do arquivo (entram só pelo HTML via `registrarAcoes`).

## O que o mapa diz sobre como dividir

- Os nomes das funções começam por **verbo** (`carregar…`, `salvar…`, `abrir…`), não por módulo — o prefixo não
  serve de critério. O que serve é a **aba que a função toca** (`"abaX"`/`"subX"` no corpo) e, quando não toca
  nenhuma, o tema reconhecido no nome (`calendario`, `ebd`, `canais`, `relatorios-dept`, `eventos`, `psc`,
  `voluntariado`, `pdq`, `cei`, `escalas`, `lgpd`): esses onze temas já somam cerca de **11 mil linhas** (metade
  do arquivo) e são os candidatos naturais a arquivo próprio, carregado só ao entrar no módulo.
- As **19 instruções soltas** de nível superior (executam no carregamento) e as **244 declarações** de nível
  superior precisam ficar no núcleo (ou antes de quem as usa): numa divisão em vários `<script>` clássicos, a
  ordem dos arquivos tem que ser a ordem original — função declarada depois não pode ser chamada por código solto
  de antes.
- Boa parte das funções (as "só externas") só entra pelo HTML via `registrarAcoes`: o registro precisa passar a
  ser por arquivo (cada módulo registra as suas ações ao carregar), e o `eventos.js` já suporta isso.
- Ferramentas que leem `app/script.js` e precisam acompanhar a divisão: `tools/csp-e2e/modelo.js` (modelo da
  API), `cobertura.js`, `equivalencia-estatica.js`, a chave do plano em `rodar.js`, o `service-worker.js`
  (lista do shell) e os testes `frontCsp`, `frontEscape` e `frontTipoDosArgumentos`.
- Prova de equivalência: a rodada completa do `sistema-testes-tela.yml` (4.737 ações) antes e depois de cada
  módulo extraído, exatamente como a vD.1 prevê.

Gerado por um script de análise (parser do Babel sobre o `script.js`); refazer quando o arquivo mudar muito.
