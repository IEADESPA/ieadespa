# Propostas de tela (FASE 10): fontes da página de desenho

As páginas de propostas que o responsável abre, compara e escolhe são Artifacts do claude.ai, só da organização. Esta
pasta guarda os **fontes da rodada atual**, para qualquer pessoa da dupla gerar e publicar a próxima sem depender de uma
pasta temporária de um computador.

Tudo aqui é **público**: só nomes e números de mentira, nenhum dado de membro, nenhuma senha.

## O que tem aqui

| Arquivo | O que é |
| --- | --- |
| `propostas-r26/index.html` | A página da **rodada 26** (Financeiro), 213 KB. Gerada; não editar à mão |
| `propostas-r25/index.html` | A página da rodada 25, a publicada antes: a **base** de que a 26 parte. Não muda |
| `r26-telas.js` | As telas novas da 26: a folha do mural sem o quadro do fim e “Quanto cada congregação tem na Geral” |
| `r26-lista.js` | A explicação da rodada (`EXPLICA_R26`) e a lista que junta as telas na página |
| `montar-r26.js` | Monta a 26 a partir da base da 25, tira o código sem uso e procura as palavras que não existem na Igreja |
| `conferir-r26.js` | Confere cada desenho (claro e escuro, cada nível, notebook e celular) |
| `r25-telas.js`, `r25-lista.js` | As telas da rodada 25, para consulta (já estão dentro da base; a 26 usa parte delas) |

A rodada 24 e o montador da 25 saíram em 21/11/2026, quando a 26 entrou: estão no histórico do Git.

Ficaram de fora, de propósito: as fotos, as cópias grandes antigas (`propostas-r2-antes-*.html`), os JSON de escolhas e
as auditorias. As escolhas do responsável ficam no banco da própria página (coleção `escolhas`), não no Git.

## Gerar e conferir

Na pasta `design/propostas`, com o Node.js:

```bash
node montar-r26.js     # grava propostas-r26/index.html; no fim, "palavras proibidas fora disso: 0"
node conferir-r26.js   # no fim, "com problema 0"
```

O `montar-r26.js` usa o TypeScript (do projeto ou o global do npm).

## Publicar

- **A página leve** (rodadas 19 em diante): `https://claude.ai/artifact/KMebnrdoWfAhcz9yeRgjFz`. Peça ao Claude para
  publicar `design/propostas/propostas-r26/index.html` **nesse endereço** (o mesmo `url`, sem criar outro). A página já
  declara o banco (`db`) das escolhas; na republicação, não mexa nas capacidades.
- **A página antiga** (`G1gj9hzSbdcqAZYcFjmJ1j`) é o arquivo das rodadas 2 a 18: nunca mais republicar.
- Para publicar no mesmo endereço, a pessoa precisa ser **editora** da página (o responsável dá o papel no botão Share).
- **Nunca republicar enquanto o responsável está comentando:** as observações dele ficam no navegador e se perdem.
  A chave do `localStorage` (`propostas-r15`) não muda entre as rodadas.
- Ler as escolhas dele: `ArtifactData`, coleção `escolhas` da página leve (ids `r26-*` e `geral-r26`).
- **Antes de publicar, a ferramenta exige ler a versão no ar inteira** (a 25 tem cerca de 300 KB). Faça isso num agente novo,
  para não pesar a conversa principal. A única diferença esperada é a casca que a plataforma põe em volta da página
  (o `<!doctype>` na 1ª linha e o fechamento no fim).

## A próxima rodada

1. Copie `montar-r26.js` para `montar-r27.js`: a base passa a ser `propostas-r26/index.html`, e os nomes `r26` viram
   `r27` (o arquivo explica cada troca).
2. As telas novas em `r27-telas.js` e a explicação em `r27-lista.js`: claro e escuro, cada nível, celular com a barra do
   telefone. Quando ele se confunde com muitas opções, uma versão única bem explicada.
3. `node montar-r27.js` e um `conferir-r27.js` (cópia do da 26), os dois com zero problema.
4. Publique no mesmo endereço e registre: commit dos fontes da 27. A pasta da 25 pode sair quando a 27 entrar, porque o
   Git guarda o histórico.
