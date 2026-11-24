# Propostas de tela (FASE 10): fontes da página de desenho

As páginas de propostas que o responsável abre, compara e escolhe são Artifacts do claude.ai, só da organização. Esta
pasta guarda os **fontes da rodada atual**, para qualquer pessoa da dupla gerar e publicar a próxima sem depender de uma
pasta temporária de um computador.

Tudo aqui é **público**: só nomes e números de mentira, nenhum dado de membro, nenhuma senha.

## O que tem aqui

| Arquivo | O que é |
| --- | --- |
| `propostas-r31/index.html` | A página da **rodada 31** (Membros, a saída e a volta), 279 KB. Gerada; não editar à mão. Ainda não publicada |
| `propostas-r30/index.html` | A página da rodada 30, a publicada (versão 12): a **base** de que a 31 parte. Não muda |
| `r31-carta.js` | As telas da 31 da carta: a carta em PDF (A4) com o histórico e a página que o QR abre (antes e depois do apagamento) |
| `r31-telas.js` | As outras telas da 31: o pedido com a cidade, o abandono com a Câmara de liderança e a volta sem os cargos |
| `r31-lista.js` | A explicação da rodada (`EXPLICA_R31`), a de cada tela (com os "Para conferir") e a lista que junta as telas |
| `montar-r31.js` | Monta a 31 a partir da base da 30, tira o modo escuro da página, tira o código sem uso e procura as palavras que não existem na Igreja |
| `conferir-r31.js` | Confere cada desenho (só no claro, cada nível, notebook e celular) |
| `montar-r30.js`, `conferir-r30.js`, `r30-telas.js`, `r30-lista.js` | Os fontes da rodada 30, para consulta (as telas já estão dentro da base) |
| `propostas-r29/index.html`, `r29-saida.js`, `r29-mais.js`, `r29-lista.js` | A rodada 29, para consulta: podem sair quando a 31 for publicada (o Git guarda) |

Na página da 31, a 28 saiu (a lista das telas; o código que a 29 e a 30 ainda usam ficou), e a poda tirou o resto sem
uso: a página caiu de 350 KB para 279 KB. A 30 e a 29 ficam recolhidas embaixo da 31.

**Sem modo escuro nas propostas** (decisão dele de 24/11/2026, a partir da 31): a espera estava longa demais (a 30 teve
352 desenhos para 5 telas). A página não tem mais os botões Claro e Escuro (nem o "Trocar claro/escuro" da tela cheia)
e sempre abre no claro; o conferidor e as fotos são só do claro. Continuam obrigatórios os três níveis (Geral, área e
congregação, e o membro onde fizer sentido) e o notebook e o celular com a barra do telefone. O sistema construído
continua com o claro e o escuro: só a proposta deixa de mostrar o escuro.

Ficaram de fora, de propósito: as fotos, as cópias grandes antigas (`propostas-r2-antes-*.html`), os JSON de escolhas e
as auditorias. As escolhas do responsável ficam no banco da própria página (coleção `escolhas`), não no Git.

## Gerar e conferir

Na pasta `design/propostas`, com o Node.js:

```bash
node montar-r31.js     # grava propostas-r31/index.html; no fim, "palavras proibidas fora disso: 0"
node conferir-r31.js   # no fim, "com problema 0"
```

O `montar-r31.js` usa o TypeScript (do projeto ou o global do npm).

O "Para conferir" (um detalhe que o desenhista decidiu e o responsável ainda confere) fica **na explicação** de cada tela,
nunca dentro do desenho: o que está no desenho é o que o construtor faz.

## Publicar

- **A página leve** (rodadas 19 em diante): `https://claude.ai/artifact/KMebnrdoWfAhcz9yeRgjFz`. Peça ao Claude para
  publicar `design/propostas/propostas-r31/index.html` **nesse endereço** (o mesmo `url`, sem criar outro). A página já
  declara o banco (`db`) das escolhas; na republicação, não mexa nas capacidades. A 30 foi publicada em 24/11/2026
  (versão 12 da página leve, id 1795523649-c0c5), com o `db` mantido. A 31 está pronta, esperando ele terminar de
  comentar a 30.
- **A página antiga** (`G1gj9hzSbdcqAZYcFjmJ1j`) é o arquivo das rodadas 2 a 18: nunca mais republicar.
- Para publicar no mesmo endereço, a pessoa precisa ser **editora** da página (o responsável dá o papel no botão Share).
- **Nunca republicar enquanto o responsável está comentando:** as observações dele ficam no navegador e se perdem.
  A chave do `localStorage` (`propostas-r15`) não muda entre as rodadas.
- Ler as escolhas dele: `ArtifactData`, coleção `escolhas` da página leve (ids `r31-*` e `geral-r31`; os da 30, `r30-*` e
  `geral-r30`).
- **Antes de publicar, a ferramenta exige ler a versão no ar inteira** (a 30 tem cerca de 350 KB, a 31 cerca de 280 KB; leia em blocos de ~100
  linhas, porque a ferramenta corta acima de 25 mil tokens). Faça isso num agente novo,
  para não pesar a conversa principal. A única diferença esperada é a casca que a plataforma põe em volta da página
  (o `<!doctype>` na 1ª linha e o fechamento no fim).

## A próxima rodada

1. Copie `montar-r31.js` para `montar-r32.js`: a base passa a ser `propostas-r31/index.html` (depois de publicada), e os
   nomes `r31` viram `r32` (o arquivo explica cada troca; a rodada que sai da página passa a ser a 29). As trocas do
   modo escuro (o bloco "5b") saem do montador da 32, porque a base da 31 já vem sem os botões.
2. As telas novas em `r32-telas.js` (e, se precisar, em mais arquivos) e a explicação em `r32-lista.js`: só no claro,
   cada nível, celular com a barra do telefone. Quando ele se confunde com muitas opções, uma versão única bem
   explicada.
3. `node montar-r32.js` e um `conferir-r32.js` (cópia do da 31), os dois com zero problema.
4. Publique no mesmo endereço e registre: commit dos fontes da 32. A pasta da 30 pode sair quando a 32 entrar, porque o
   Git guarda o histórico.
5. A página leve deve ficar abaixo de ~400 KB: a 31 tem 279 KB.
6. O conferidor não mede transbordo: meça no Edge (o `medir.js` da pasta de fotos da rodada, só no claro) e olhe as
   fotos do pior caso (a mensagem de erro, o seletor aberto, o celular com o formulário), sem fotografar tudo.

Para as fotos de conferência no Windows: o Edge sem janela, sempre com `--disable-gpu` e com um `--user-data-dir` próprio
(com o Edge do dia a dia aberto, sem ele a foto não sai). A foto aparece um instante depois de o comando voltar. A página
de foto precisa do `* { box-sizing: border-box; }` da página de verdade; sem ele, o menu passa do tamanho e parece cortado.
