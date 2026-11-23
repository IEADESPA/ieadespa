# Propostas de tela (FASE 10): fontes da página de desenho

As páginas de propostas que o responsável abre, compara e escolhe são Artifacts do claude.ai, só da organização. Esta
pasta guarda os **fontes da rodada atual**, para qualquer pessoa da dupla gerar e publicar a próxima sem depender de uma
pasta temporária de um computador.

Tudo aqui é **público**: só nomes e números de mentira, nenhum dado de membro, nenhuma senha.

## O que tem aqui

| Arquivo | O que é |
| --- | --- |
| `propostas-r29/index.html` | A página da **rodada 29** (a saída do membro refeita), 387 KB. Gerada; não editar à mão |
| `propostas-r28/index.html` | A página da rodada 28, a publicada antes: a **base** de que a 29 parte. Não muda |
| `r29-saida.js` | As telas da 29: a saída pelo aplicativo, a carta em PDF (e a página do QR), a secretaria pedindo por alguém |
| `r29-mais.js` | As telas da 29: o abandono, os cargos vagos, o que fica guardado e a volta, o falecimento |
| `r29-lista.js` | A explicação da rodada (`EXPLICA_R29`) e a lista que junta as telas na página |
| `montar-r29.js` | Monta a 29 a partir da base da 28, tira o código sem uso e procura as palavras que não existem na Igreja |
| `conferir-r29.js` | Confere cada desenho (claro e escuro, cada nível, notebook e celular) |
| `r28-telas.js`, `r28-membros.js`, `r28-lista.js` | As telas da rodada 28, para consulta (já estão dentro da base; a 29 usa parte delas) |

A rodada 27 (a página e os fontes) e o montador da 28 saíram em 23/11/2026, quando a 29 entrou: estão no histórico do Git.
Na página, a 26 saiu; a 28 e a 27 ficam recolhidas embaixo da 29.

Ficaram de fora, de propósito: as fotos, as cópias grandes antigas (`propostas-r2-antes-*.html`), os JSON de escolhas e
as auditorias. As escolhas do responsável ficam no banco da própria página (coleção `escolhas`), não no Git.

## Gerar e conferir

Na pasta `design/propostas`, com o Node.js:

```bash
node montar-r29.js     # grava propostas-r29/index.html; no fim, "palavras proibidas fora disso: 0"
node conferir-r29.js   # no fim, "com problema 0"
```

O `montar-r29.js` usa o TypeScript (do projeto ou o global do npm).

O "Para conferir" (um detalhe que o desenhista decidiu e o responsável ainda confere) fica **na explicação** de cada tela,
nunca dentro do desenho: o que está no desenho é o que o construtor faz.

## Publicar

- **A página leve** (rodadas 19 em diante): `https://claude.ai/artifact/KMebnrdoWfAhcz9yeRgjFz`. Peça ao Claude para
  publicar `design/propostas/propostas-r29/index.html` **nesse endereço** (o mesmo `url`, sem criar outro). A página já
  declara o banco (`db`) das escolhas; na republicação, não mexa nas capacidades.
- **A página antiga** (`G1gj9hzSbdcqAZYcFjmJ1j`) é o arquivo das rodadas 2 a 18: nunca mais republicar.
- Para publicar no mesmo endereço, a pessoa precisa ser **editora** da página (o responsável dá o papel no botão Share).
- **Nunca republicar enquanto o responsável está comentando:** as observações dele ficam no navegador e se perdem.
  A chave do `localStorage` (`propostas-r15`) não muda entre as rodadas.
- Ler as escolhas dele: `ArtifactData`, coleção `escolhas` da página leve (ids `r29-*` e `geral-r29`).
- **Antes de publicar, a ferramenta exige ler a versão no ar inteira** (a 29 tem cerca de 388 KB; leia em blocos de ~100
  linhas, porque a ferramenta corta acima de 25 mil tokens). Faça isso num agente novo,
  para não pesar a conversa principal. A única diferença esperada é a casca que a plataforma põe em volta da página
  (o `<!doctype>` na 1ª linha e o fechamento no fim).

## A próxima rodada

1. Copie `montar-r29.js` para `montar-r30.js`: a base passa a ser `propostas-r29/index.html`, e os nomes `r29` viram
   `r30` (o arquivo explica cada troca; a rodada que sai da página passa a ser a 27).
2. As telas novas em `r30-telas.js` (e, se precisar, num segundo arquivo, como o `r29-mais.js`) e a explicação em
   `r30-lista.js`: claro e escuro, cada nível, celular com a barra do telefone. Quando ele se confunde com muitas opções,
   uma versão única bem explicada.
3. `node montar-r30.js` e um `conferir-r30.js` (cópia do da 29), os dois com zero problema.
4. Publique no mesmo endereço e registre: commit dos fontes da 30. A pasta da 28 pode sair quando a 30 entrar, porque o
   Git guarda o histórico.
5. A página leve deve ficar abaixo de ~400 KB: a 29 tem 387 KB. Se a 30 passar, a 27 (a mais antiga recolhida) sai também.

Para as fotos de conferência no Windows: o Edge sem janela, sempre com `--disable-gpu` e com um `--user-data-dir` próprio
(com o Edge do dia a dia aberto, sem ele a foto não sai). A foto aparece um instante depois de o comando voltar. A página
de foto precisa do `* { box-sizing: border-box; }` da página de verdade; sem ele, o menu passa do tamanho e parece cortado.
