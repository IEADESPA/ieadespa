# vD.2 — dividir o `app/script.js` em módulos (ferramentas)

Scripts usados na vD.2 (07/10/2026) para tirar um bloco contíguo do `app/script.js` e
transformá-lo num arquivo de `app/modulos/`, **sem mudar uma linha de código**. Um módulo é um
script clássico que o `index.html` carrega depois do `script.js` (mesmo escopo global) e que
registra as suas ações no próprio fim (`registrarAcoes` mescla). As regras que protegem a
divisão estão em `api/shared/__tests__/frontCsp.test.js` (um registro por módulo, nomes de nível
superior sem repetição entre arquivos, `index.html` com exatamente os módulos da pasta em ordem
alfabética, casca do service worker com todos).

## Receita (um módulo por commit)

```bash
# 1. medir o bloco: tamanho, instruções soltas e nomes citados fora dele
node tools/modularizar/bloco-refs.js - "// ---- INÍCIO DO BLOCO" "// ---- CABEÇALHO DO BLOCO SEGUINTE"
# 2. extrair (bloco vai até a linha ANTES do marcador de fim) + registro de ações no módulo
node tools/modularizar/extrair-modulo.js <nome> "// ---- INÍCIO" "// ---- FIM"
node tools/modularizar/registro-sem-reflow.js <nome>     # mantém as linhas originais do registrarAcoes do script.js
# 3. (se o bloco tinha funções de uso geral) devolvê-las ao núcleo
node tools/modularizar/mover-funcoes.js <nome> "Título da seção" funcaoA funcaoB
# 4. ligar: <script> no index.html, casca + versão do service worker, versão esperada no teste
node tools/modularizar/ligar-modulo.js <nome> v<N+1>
# 5. provar
node --check app/script.js app/modulos/<nome>.js app/service-worker.js
cd api && npx jest shared/__tests__/frontCsp.test.js shared/__tests__/frontEscape.test.js \
  shared/__tests__/frontTipoDosArgumentos.test.js shared/__tests__/eventosDespachante.test.js
```

Depois: subir no `homolog` (o fluxo de testes de tela roda lá e compara com a linha de base),
abrir a tela de verdade na homologação com a massa fictícia, e só então levar o ramo da mudança
para a `main` (nunca mesclar o `homolog` na `main` — ver `HOMOLOGACAO.md`).

Cuidados que apareceram na prática:

- Marcadores: os cabeçalhos `// ---- X ----` do `script.js`. Depois de extrair um bloco, o
  marcador de fim do bloco anterior pode ter sumido — conferir com `grep -n '^// ---- '`.
- Instruções soltas de nível superior (`window.addEventListener(...)`,
  `document.addEventListener("DOMContentLoaded", ...)`) vão junto e passam a executar no
  carregamento do módulo, depois das do `script.js`. Até agora (EBD, financeiro) não importou.
- Nome do arquivo ≠ nome de arquivo da raiz (`eventos.js` é o despachante da CSP; o módulo
  chama-se `eventos-congressos.js`).
- O `script.js` no disco tem CRLF; os scripts preservam as quebras das linhas movidas e o git
  normaliza no commit.
