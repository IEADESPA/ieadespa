# Propostas de tela (FASE 10): fontes da página de desenho

As páginas de propostas que o responsável abre, compara e escolhe são Artifacts do claude.ai, só da organização. Esta
pasta guarda os **fontes da rodada atual**, para qualquer pessoa da dupla gerar e publicar a próxima sem depender de uma
pasta temporária de um computador.

Tudo aqui é **público**: só nomes e números de mentira, nenhum dado de membro, nenhuma senha.

## O que tem aqui

| Arquivo | O que é |
| --- | --- |
| `propostas-r30/index.html` | A página da **rodada 30** (Financeiro, blocos de recibo), 350 KB. Gerada; não editar à mão |
| `propostas-r29/index.html` | A página da rodada 29, a publicada antes: a **base** de que a 30 parte. Não muda |
| `r30-telas.js` | As telas da 30: registrar saída, a devolução completa ou parcial, as cores da folha e o seletor, desfazer, as listas vazias |
| `r30-lista.js` | A explicação da rodada (`EXPLICA_R30`), a de cada passo e a lista que junta as telas na página |
| `montar-r30.js` | Monta a 30 a partir da base da 29, tira o código sem uso e procura as palavras que não existem na Igreja |
| `conferir-r30.js` | Confere cada desenho (claro e escuro, cada nível, notebook e celular) |
| `r29-saida.js`, `r29-mais.js`, `r29-lista.js` | As telas da rodada 29, para consulta (já estão dentro da base) |

A rodada 28 (a página e os fontes) e o montador e o conferidor da 29 saíram em 24/11/2026, quando a 30 entrou: estão no
histórico do Git. Na página, a 27 saiu (a página caiu de 387 KB para 289 KB antes da 30); a 29 e a 28 ficam recolhidas
embaixo da 30.

Ficaram de fora, de propósito: as fotos, as cópias grandes antigas (`propostas-r2-antes-*.html`), os JSON de escolhas e
as auditorias. As escolhas do responsável ficam no banco da própria página (coleção `escolhas`), não no Git.

## Gerar e conferir

Na pasta `design/propostas`, com o Node.js:

```bash
node montar-r30.js     # grava propostas-r30/index.html; no fim, "palavras proibidas fora disso: 0"
node conferir-r30.js   # no fim, "com problema 0"
```

O `montar-r30.js` usa o TypeScript (do projeto ou o global do npm).

O "Para conferir" (um detalhe que o desenhista decidiu e o responsável ainda confere) fica **na explicação** de cada tela,
nunca dentro do desenho: o que está no desenho é o que o construtor faz.

## Publicar

- **A página leve** (rodadas 19 em diante): `https://claude.ai/artifact/KMebnrdoWfAhcz9yeRgjFz`. Peça ao Claude para
  publicar `design/propostas/propostas-r30/index.html` **nesse endereço** (o mesmo `url`, sem criar outro). A página já
  declara o banco (`db`) das escolhas; na republicação, não mexa nas capacidades. A 30 foi publicada em 24/11/2026
  (versão 12 da página leve, id 1795523649-c0c5), com o `db` mantido.
- **A página antiga** (`G1gj9hzSbdcqAZYcFjmJ1j`) é o arquivo das rodadas 2 a 18: nunca mais republicar.
- Para publicar no mesmo endereço, a pessoa precisa ser **editora** da página (o responsável dá o papel no botão Share).
- **Nunca republicar enquanto o responsável está comentando:** as observações dele ficam no navegador e se perdem.
  A chave do `localStorage` (`propostas-r15`) não muda entre as rodadas.
- Ler as escolhas dele: `ArtifactData`, coleção `escolhas` da página leve (ids `r30-*` e `geral-r30`).
- **Antes de publicar, a ferramenta exige ler a versão no ar inteira** (a 30 tem cerca de 350 KB; leia em blocos de ~100
  linhas, porque a ferramenta corta acima de 25 mil tokens). Faça isso num agente novo,
  para não pesar a conversa principal. A única diferença esperada é a casca que a plataforma põe em volta da página
  (o `<!doctype>` na 1ª linha e o fechamento no fim).

## A próxima rodada

1. Copie `montar-r30.js` para `montar-r31.js`: a base passa a ser `propostas-r30/index.html`, e os nomes `r30` viram
   `r31` (o arquivo explica cada troca; a rodada que sai da página passa a ser a 28).
2. As telas novas em `r31-telas.js` (e, se precisar, num segundo arquivo) e a explicação em `r31-lista.js`: claro e
   escuro, cada nível, celular com a barra do telefone. Quando ele se confunde com muitas opções, uma versão única bem
   explicada.
3. `node montar-r31.js` e um `conferir-r31.js` (cópia do da 30), os dois com zero problema.
4. Publique no mesmo endereço e registre: commit dos fontes da 31. A pasta da 29 pode sair quando a 31 entrar, porque o
   Git guarda o histórico.
5. A página leve deve ficar abaixo de ~400 KB: a 30 tem 350 KB. Se a 31 passar, a 28 (a mais antiga recolhida) sai também.
6. O conferidor não mede transbordo: meça no Edge (o `medir.js` da pasta de fotos da rodada) e olhe as fotos do pior caso
   (a mensagem de erro, o seletor aberto, o celular com o formulário).

Para as fotos de conferência no Windows: o Edge sem janela, sempre com `--disable-gpu` e com um `--user-data-dir` próprio
(com o Edge do dia a dia aberto, sem ele a foto não sai). A foto aparece um instante depois de o comando voltar. A página
de foto precisa do `* { box-sizing: border-box; }` da página de verdade; sem ele, o menu passa do tamanho e parece cortado.
