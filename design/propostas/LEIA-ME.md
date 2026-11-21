# Propostas de tela (FASE 10): fontes da página de desenho

As páginas de propostas que o responsável abre, compara e escolhe são Artifacts do claude.ai, só da organização. Esta
pasta guarda os **fontes da rodada atual**, para qualquer pessoa da dupla gerar e publicar a próxima sem depender de uma
pasta temporária de um computador.

Tudo aqui é **público**: só nomes e números de mentira, nenhum dado de membro, nenhuma senha.

## O que tem aqui

| Arquivo | O que é |
| --- | --- |
| `propostas-r25/index.html` | A página da **rodada 25** (Financeiro), 282 KB. Gerada; não editar à mão |
| `propostas-r24/index.html` | A página da rodada 24, a publicada antes: a **base** de que a 25 parte. Não muda |
| `r25-telas.js` | As telas novas da 25: a folha do mural acertada e “Quanto cada congregação tem” |
| `r25-lista.js` | A explicação da rodada (`EXPLICA_R25`) e a lista que junta as telas na página |
| `montar-r25.js` | Monta a 25 a partir da base da 24, tira o código sem uso e procura as palavras que não existem na Igreja |
| `conferir-r25.js` | Confere cada desenho (claro e escuro, cada nível, notebook e celular) |
| `r24-telas.js`, `r24-lista.js` | As telas da rodada 24, para consulta (já estão dentro da base) |

Ficaram de fora, de propósito: as fotos, as cópias grandes antigas (`propostas-r2-antes-*.html`), os JSON de escolhas e
as auditorias. As escolhas do responsável ficam no banco da própria página (coleção `escolhas`), não no Git.

## Gerar e conferir

Na pasta `design/propostas`, com o Node.js:

```bash
node montar-r25.js     # grava propostas-r25/index.html; no fim, "palavras proibidas fora disso: 0"
node conferir-r25.js   # no fim, "com problema 0"
```

Rodar o `montar-r25.js` sobre estes fontes refaz a página da rodada 25 byte a byte (conferido em 21/11/2026). Ele usa o
TypeScript (do projeto ou o global do npm).

## Publicar

- **A página leve** (rodadas 19 em diante): `https://claude.ai/artifact/KMebnrdoWfAhcz9yeRgjFz`. Peça ao Claude para
  publicar `design/propostas/propostas-r25/index.html` **nesse endereço** (o mesmo `url`, sem criar outro). A página já
  declara o banco (`db`) das escolhas; na republicação, não mexa nas capacidades.
- **A página antiga** (`G1gj9hzSbdcqAZYcFjmJ1j`) é o arquivo das rodadas 2 a 18: nunca mais republicar.
- Para publicar no mesmo endereço, a pessoa precisa ser **editora** da página (o responsável dá o papel no botão Share).
- **Nunca republicar enquanto o responsável está comentando:** as observações dele ficam no navegador e se perdem.
  A chave do `localStorage` (`propostas-r15`) não muda entre as rodadas.
- Ler as escolhas dele: `ArtifactData`, coleção `escolhas` da página leve (ids `r25-*` e `geral-r25`).
- **Antes de publicar, a ferramenta exige ler a versão no ar inteira** (cerca de 380 KB). Faça isso num agente novo,
  para não pesar a conversa principal. A única diferença esperada é a casca que a plataforma põe em volta da página
  (o `<!doctype>` na 1ª linha e o fechamento no fim).

## A próxima rodada

1. Copie `montar-r25.js` para `montar-r26.js`: a base passa a ser `propostas-r25/index.html`, e os nomes `r25` viram
   `r26` (o arquivo explica cada troca).
2. As telas novas em `r26-telas.js` e a explicação em `r26-lista.js`: claro e escuro, cada nível, celular com a barra do
   telefone. Quando ele se confunde com muitas opções, uma versão única bem explicada.
3. `node montar-r26.js` e um `conferir-r26.js` (cópia do da 25), os dois com zero problema.
4. Publique no mesmo endereço e registre: commit dos fontes da 26. A pasta da 24 pode sair quando a 26 entrar, porque o
   Git guarda o histórico.
