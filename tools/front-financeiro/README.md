# front-financeiro — a prova das telas do Financeiro novo (Svelte)

O `navegador.js` abre a casca de `app/` e o build de verdade de `app/svelte` no Edge sem tela, com a CSP final, como a
Tesouraria Geral, a área e a congregação, no notebook (1280 px) e no celular (390 px). As rotas
`/api/financeiro/blocos/*` respondem com dados de mentira nos formatos reais (`api/shared/finBlocosDb.js`) e cada pedido
fica gravado: o roteiro confere o que a tela mostra **e** o que ela manda ao servidor. O resto da casca usa a API simulada
do equipamento da CSP (`tools/csp-e2e`: `servidor.js`, `instrumento.js`, `modelo-respostas.json`).

Em cada página: nenhum erro de script, nenhuma violação de CSP, nenhuma rolagem para o lado e nenhum texto do servidor
virando código (há texto de ataque nos nomes e nas observações).

## O que prova (incremento 2, 23/11/2026)

- **Folhas do bloco** (r17-blocos-folhas, opção 1): as 50 folhas com o destino de cada uma; clicar numa folha livre leva
  o número ao formulário ("70.090 · 40ª"); sem "o que aconteceu" ou sem a observação nada é mandado; o registro manda
  `{folha, oQueAconteceu, observacao}` e lê de novo o mesmo bloco; a recusa do servidor aparece e a escolha continua; o
  seletor do bloco (Geral e área; a congregação não tem); o bloco devolvido não aceita exceção; a extraviada se distingue;
  no celular as 30 primeiras com destino viram uma linha.
- **Livro de entrada e saída** (r17-blocos-livro, opção 1): as linhas do livro como o desenho escreve, as páginas de 5
  (3 no celular); "Registrar entrada" com o rastreio que vem sozinho pela folha digitada (só os algarismos), quem recebe é
  quem está entrando, quem devolveu (do cadastro, quem levou sem cadastro ou outra pessoa escrita); a devolução vai pela
  **primeira** folha do bloco, não pela digitada; o bloco ainda na Geral e o já devolvido não se registram; "Registrar
  saída" ainda sem formulário aprovado; a área e a congregação veem o aviso e os blocos agora, sem formulário.

## Rodar

Pelo PowerShell (pelo Bash o Edge sem tela não abre no notebook do responsável). O `puppeteer-core` vem de
`tools/csp-e2e/node_modules` (`npm ci` lá) ou da pasta indicada em `PUPPETEER_CORE`:

```powershell
cd front; npm run build; cd ..
$env:PUPPETEER_CORE = "<pasta>\tools\csp-e2e\node_modules\puppeteer-core"   # se o worktree não tiver o npm ci do csp-e2e
node tools/front-financeiro/navegador.js            # tudo; SO=folhas ou SO=livro roda uma parte; LISTA=1 mostra cada caso
```

O navegador abre sempre com `--disable-gpu` e um perfil próprio em pasta temporária. Resultado de referência (23/11/2026):
o build de antes do incremento 2 dá 49/134 (as duas abas eram "em construção"); o de agora, todos os casos.
