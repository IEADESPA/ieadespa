# Propostas de tela (FASE 10): fontes da página de desenho

As páginas de propostas que o responsável abre, compara e escolhe são Artifacts do claude.ai, só da organização. Esta
pasta guarda os **fontes da rodada atual**, para qualquer pessoa da dupla gerar e publicar a próxima sem depender de uma
pasta temporária de um computador.

Tudo aqui é **público**: só nomes e números de mentira, nenhum dado de membro, nenhuma senha.

## O que tem aqui

| Arquivo | O que é |
| --- | --- |
| `propostas-r27/index.html` | A página da **rodada 27** (Financeiro e Membros), 246 KB. Gerada; não editar à mão |
| `propostas-r26/index.html` | A página da rodada 26, a publicada antes: a **base** de que a 27 parte. Não muda |
| `r27-telas.js` | As telas novas da 27: receber o repasse, o fechamento pelo Conselho Fiscal, os saldos de abertura, importar os membros e o lote da gráfica |
| `r27-lista.js` | A explicação da rodada (`EXPLICA_R27`) e a lista que junta as telas na página |
| `montar-r27.js` | Monta a 27 a partir da base da 26, tira o código sem uso e procura as palavras que não existem na Igreja |
| `conferir-r27.js` | Confere cada desenho (claro e escuro, cada nível, notebook e celular) |
| `r26-telas.js`, `r26-lista.js` | As telas da rodada 26, para consulta (já estão dentro da base; a 27 usa parte delas) |

A rodada 25 e o montador da 26 saíram em 22/11/2026, quando a 27 entrou: estão no histórico do Git.

Ficaram de fora, de propósito: as fotos, as cópias grandes antigas (`propostas-r2-antes-*.html`), os JSON de escolhas e
as auditorias. As escolhas do responsável ficam no banco da própria página (coleção `escolhas`), não no Git.

## Gerar e conferir

Na pasta `design/propostas`, com o Node.js:

```bash
node montar-r27.js     # grava propostas-r27/index.html; no fim, "palavras proibidas fora disso: 0"
node conferir-r27.js   # no fim, "com problema 0"
```

O `montar-r27.js` usa o TypeScript (do projeto ou o global do npm).

## Publicar

- **A página leve** (rodadas 19 em diante): `https://claude.ai/artifact/KMebnrdoWfAhcz9yeRgjFz`. Peça ao Claude para
  publicar `design/propostas/propostas-r27/index.html` **nesse endereço** (o mesmo `url`, sem criar outro). A página já
  declara o banco (`db`) das escolhas; na republicação, não mexa nas capacidades.
- **A página antiga** (`G1gj9hzSbdcqAZYcFjmJ1j`) é o arquivo das rodadas 2 a 18: nunca mais republicar.
- Para publicar no mesmo endereço, a pessoa precisa ser **editora** da página (o responsável dá o papel no botão Share).
- **Nunca republicar enquanto o responsável está comentando:** as observações dele ficam no navegador e se perdem.
  A chave do `localStorage` (`propostas-r15`) não muda entre as rodadas.
- Ler as escolhas dele: `ArtifactData`, coleção `escolhas` da página leve (ids `r27-*` e `geral-r27`).
- **Antes de publicar, a ferramenta exige ler a versão no ar inteira** (a 26 tem cerca de 215 KB). Faça isso num agente novo,
  para não pesar a conversa principal. A única diferença esperada é a casca que a plataforma põe em volta da página
  (o `<!doctype>` na 1ª linha e o fechamento no fim).

## A próxima rodada

1. Copie `montar-r27.js` para `montar-r28.js`: a base passa a ser `propostas-r27/index.html`, e os nomes `r27` viram
   `r28` (o arquivo explica cada troca; a rodada que sai da página passa a ser a 25).
2. As telas novas em `r28-telas.js` e a explicação em `r28-lista.js`: claro e escuro, cada nível, celular com a barra do
   telefone. Quando ele se confunde com muitas opções, uma versão única bem explicada.
3. `node montar-r28.js` e um `conferir-r28.js` (cópia do da 27), os dois com zero problema.
4. Publique no mesmo endereço e registre: commit dos fontes da 28. A pasta da 26 pode sair quando a 28 entrar, porque o
   Git guarda o histórico.

Para as fotos de conferência no Windows: o Edge sem janela, sempre com `--disable-gpu` e com um `--user-data-dir` próprio
(com o Edge do dia a dia aberto, sem ele a foto não sai). A foto aparece um instante depois de o comando voltar.
