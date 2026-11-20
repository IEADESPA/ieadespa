# Propostas de tela (FASE 10): fontes da página de desenho

As páginas de propostas que o responsável abre, compara e escolhe são Artifacts do claude.ai, só da organização. Esta
pasta guarda os **fontes da rodada atual**, para qualquer pessoa da dupla gerar e publicar a próxima sem depender de uma
pasta temporária de um computador.

Tudo aqui é **público**: só nomes e números de mentira, nenhum dado de membro, nenhuma senha.

## O que tem aqui

| Arquivo | O que é |
| --- | --- |
| `propostas-r21/index.html` | A página publicada da **rodada 21** (Financeiro), 387 KB. Gerada; não editar à mão |
| `propostas-r20/index.html` | A página da rodada 20: a **base** de que a 21 parte. Não muda |
| `r21-telas.js`, `r21b-telas.js` | As telas novas da 21 (`TELAS_R21`, com as opções de cada uma) |
| `r21-lista.js` | A explicação da rodada (`EXPLICA_R21`) e a lista que junta as telas na página |
| `montar-r21.js` | Monta a 21 a partir da base da 20 e procura as palavras que não existem na Igreja |
| `conferir-r21.js` | Confere cada desenho (claro e escuro, cada nível, notebook e celular) |
| `r20-telas.js`, `r20-lista.js` | As telas da rodada 20, para consulta (já estão dentro da base) |

Ficaram de fora, de propósito: as fotos, as cópias grandes antigas (`propostas-r2-antes-*.html`), os JSON de escolhas e
as auditorias. As escolhas do responsável ficam no banco da própria página (coleção `escolhas`), não no Git.

## Gerar e conferir

Na pasta `design/propostas`, com o Node.js:

```bash
node montar-r21.js     # grava propostas-r21/index.html; no fim, "palavras proibidas fora disso: 0"
node conferir-r21.js   # no fim, "com problema 0"
```

Rodar o `montar-r21.js` sobre estes fontes refaz a página da rodada 21 byte a byte (conferido em 20/11/2026).

## Publicar

- **A página leve** (rodadas 19 em diante): `https://claude.ai/artifact/KMebnrdoWfAhcz9yeRgjFz`. Peça ao Claude para
  publicar `design/propostas/propostas-r21/index.html` **nesse endereço** (o mesmo `url`, sem criar outro). A página já
  declara o banco (`db`) das escolhas; na republicação, não mexa nas capacidades.
- **A página antiga** (`G1gj9hzSbdcqAZYcFjmJ1j`) é o arquivo das rodadas 2 a 18: nunca mais republicar.
- Para publicar no mesmo endereço, a pessoa precisa ser **editora** da página (o responsável dá o papel no botão Share).
- **Nunca republicar enquanto o responsável está comentando:** as observações dele ficam no navegador e se perdem.
  A chave do `localStorage` (`propostas-r15`) não muda entre as rodadas.
- Ler as escolhas dele: `ArtifactData`, coleção `escolhas` da página leve (ids `r21-*` e `geral-r21`).

## A próxima rodada

1. Copie `montar-r21.js` para `montar-r22.js`: a base passa a ser `propostas-r21/index.html`, e os nomes `r21` viram
   `r22` (o arquivo explica cada troca).
2. As telas novas em `r22-telas.js` (mínimo de 3 opções por tela, claro e escuro, cada nível, celular com a barra do
   telefone) e a explicação em `r22-lista.js`.
3. `node montar-r22.js` e um `conferir-r22.js` (cópia do da 21), os dois com zero problema.
4. Publique no mesmo endereço e registre: commit dos fontes da 22. A pasta da 20 pode sair quando a 22 entrar, porque o
   Git guarda o histórico.
