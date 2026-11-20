# app/ — a tela do sistema (o que o navegador baixa)

Front estático publicado no Static Web App (`app_location: /app`), com a API de `api/`. Produção:
`app.ieadespa.org.br`. Instalável como aplicativo (PWA). Este mapa não é servido: a rota `/CLAUDE.md` dá 404.

## Peças principais

- `index.html` + `style.css` + `script.js`: o **núcleo** (login, navegação, ajudantes como `mostrarToast`), em JS puro.
- `modulos/` (~41 arquivos, um por tema: `pessoas.js`, `financeiro.js`, `ebd.js`...): carregados no mesmo escopo do
  núcleo; cada um registra as próprias ações (`registrarAcoes`). Função nova vai no módulo do tema, não no `script.js`.
  `modulos/casca.js` (ramo `v10-membros-svelte` e homologação) é a casca nova, com o menu.
- `svelte/` (ramo `v10-membros-svelte`, ainda não na `main`): a **saída do build** das telas novas, gerada de `front/`.
  Não editar à mão: o carimbo `svelte/carimbo.json` prova que bate com o fonte.
- `vendor/`: bibliotecas de terceiros servidas de dentro (SheetJS, qrcode-generator, jsQR), byte a byte (`-text`).
- `service-worker.js` (cache do aplicativo; a versão sobe a cada mudança de casca), `manifest.json`, `icones/`.
- Páginas autônomas: `credencial.*`, `verificar.*`, `sair.*`, `mapa-territorial.*` (Google Maps, CSP própria).
- `staticwebapp.config.json`: rotas e cabeçalhos, inclusive a **CSP** (vale este, não o da raiz).

## Regras

- **CSP forte:** nada de `<script>` dentro do HTML, `onclick=` nem `eval`; só arquivos `'self'`. Estilo novo em
  classe, não em `style="..."`.
- Texto que vem do servidor entra sempre escapado (nunca `innerHTML` com dado do usuário).
- **FASE 10:** nenhuma tela vai à produção sem o responsável ver e aprovar (homologação ou artefato); construir
  exatamente o desenho aprovado (`design/propostas`).
- Português na tela, sem códigos (`EM_PARECER` vira "Aguardando o parecer"), sem emojis no lugar de ícones.

## Testes

- A prova de cada tela fica em `tools/front-<tema>/` (roteiro em DOM simulado, mutações, navegador com a CSP).
- O teste de telas completo (notebook e celular) roda no CI: `.github/workflows/sistema-testes-tela.yml`.
- Navegador local sempre com `--disable-gpu` (o notebook do responsável reinicia com a GPU).
