# Propostas de tela (FASE 10): fontes da página de desenho

As páginas de propostas que o responsável abre, compara e escolhe são Artifacts do claude.ai, só da organização. Esta
pasta guarda os **fontes da rodada atual**, para qualquer pessoa da dupla gerar e publicar a próxima sem depender de uma
pasta temporária de um computador.

Tudo aqui é **público**: só nomes e números de mentira, nenhum dado de membro, nenhuma senha.

## O que tem aqui

| Arquivo | O que é |
| --- | --- |
| `propostas-r28/index.html` | A página da **rodada 28** (Financeiro e Membros), 343 KB. Gerada; não editar à mão |
| `propostas-r27/index.html` | A página da rodada 27, a publicada antes: a **base** de que a 28 parte. Não muda |
| `r28-telas.js` | As telas novas da 28 no Financeiro: a auditoria ao vivo e o fechamento do mês, a chegada do lote com os números pulados |
| `r28-membros.js` | As telas novas da 28 em Membros: a família, as listas, a saída e a volta, completar o arrolamento |
| `r28-lista.js` | A explicação da rodada (`EXPLICA_R28`) e a lista que junta as telas na página |
| `montar-r28.js` | Monta a 28 a partir da base da 27, tira o código sem uso e procura as palavras que não existem na Igreja |
| `conferir-r28.js` | Confere cada desenho (claro e escuro, cada nível, notebook e celular) |
| `r27-telas.js`, `r27-lista.js` | As telas da rodada 27, para consulta (já estão dentro da base; a 28 usa parte delas) |

A rodada 26 e o montador da 27 saíram em 23/11/2026, quando a 28 entrou: estão no histórico do Git. Na página, a 25 saiu; a
27 e a 26 ficam recolhidas embaixo da 28.

Ficaram de fora, de propósito: as fotos, as cópias grandes antigas (`propostas-r2-antes-*.html`), os JSON de escolhas e
as auditorias. As escolhas do responsável ficam no banco da própria página (coleção `escolhas`), não no Git.

## Gerar e conferir

Na pasta `design/propostas`, com o Node.js:

```bash
node montar-r28.js     # grava propostas-r28/index.html; no fim, "palavras proibidas fora disso: 0"
node conferir-r28.js   # no fim, "com problema 0"
```

O `montar-r28.js` usa o TypeScript (do projeto ou o global do npm).

## Publicar

- **A página leve** (rodadas 19 em diante): `https://claude.ai/artifact/KMebnrdoWfAhcz9yeRgjFz`. Peça ao Claude para
  publicar `design/propostas/propostas-r28/index.html` **nesse endereço** (o mesmo `url`, sem criar outro). A página já
  declara o banco (`db`) das escolhas; na republicação, não mexa nas capacidades.
- **A página antiga** (`G1gj9hzSbdcqAZYcFjmJ1j`) é o arquivo das rodadas 2 a 18: nunca mais republicar.
- Para publicar no mesmo endereço, a pessoa precisa ser **editora** da página (o responsável dá o papel no botão Share).
- **Nunca republicar enquanto o responsável está comentando:** as observações dele ficam no navegador e se perdem.
  A chave do `localStorage` (`propostas-r15`) não muda entre as rodadas.
- Ler as escolhas dele: `ArtifactData`, coleção `escolhas` da página leve (ids `r28-*` e `geral-r28`).
- **Antes de publicar, a ferramenta exige ler a versão no ar inteira** (a 27 tem cerca de 246 KB). Faça isso num agente novo,
  para não pesar a conversa principal. A única diferença esperada é a casca que a plataforma põe em volta da página
  (o `<!doctype>` na 1ª linha e o fechamento no fim).

## A próxima rodada

1. Copie `montar-r28.js` para `montar-r29.js`: a base passa a ser `propostas-r28/index.html`, e os nomes `r28` viram
   `r29` (o arquivo explica cada troca; a rodada que sai da página passa a ser a 26).
2. As telas novas em `r29-telas.js` (e, se precisar, num segundo arquivo, como o `r28-membros.js`) e a explicação em
   `r29-lista.js`: claro e escuro, cada nível, celular com a barra do telefone. Quando ele se confunde com muitas opções,
   uma versão única bem explicada.
3. `node montar-r29.js` e um `conferir-r29.js` (cópia do da 28), os dois com zero problema.
4. Publique no mesmo endereço e registre: commit dos fontes da 29. A pasta da 27 pode sair quando a 29 entrar, porque o
   Git guarda o histórico.
5. A página leve deve ficar abaixo de ~400 KB: a 28 tem 343 KB. Se a 29 passar, a 26 (a mais antiga recolhida) sai também.

Para as fotos de conferência no Windows: o Edge sem janela, sempre com `--disable-gpu` e com um `--user-data-dir` próprio
(com o Edge do dia a dia aberto, sem ele a foto não sai). A foto aparece um instante depois de o comando voltar.
