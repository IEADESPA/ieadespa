# Propostas de tela (FASE 10): fontes da página de desenho

As páginas de propostas que o responsável abre, compara e escolhe são Artifacts do claude.ai, só da organização. Esta
pasta guarda os **fontes da rodada atual**, para qualquer pessoa da dupla gerar e publicar a próxima sem depender de uma
pasta temporária de um computador.

Tudo aqui é **público**: só nomes e números de mentira, nenhum dado de membro, nenhuma senha.

## O que tem aqui

| Arquivo | O que é |
| --- | --- |
| `propostas-r32/index.html` | A página da **rodada 32** (Módulo 3, Estrutura e Territórios, o começo), 220 KB, com a 31 recolhida embaixo. Gerada; não editar à mão. Pronta em 24/11/2026, ajustada às respostas dele às 8 perguntas (24/11/2026), ainda **não publicada** |
| `r32-base.js` | A casca do módulo (verde), quem está vendo e os dados de mentira comuns da 32 |
| `r32-painel.js`, `r32-ficha.js`, `r32-cultos.js`, `r32-posse.js`, `r32-mapa.js` | As 5 telas da 32: o painel do que está desatualizado, a ficha da congregação (e a da área), os cultos e os pontos de culto, a diretoria com o termo de posse e o mapa |
| `r32-lista.js` | A explicação da rodada (`EXPLICA_R32`), a de cada tela (com os "Para conferir") e a lista que junta as telas |
| `montar-r32.js`, `conferir-r32.js` | Montam a 32 a partir da página da 31 e conferem cada desenho (só no claro, cada nível, notebook e celular). A procura das palavras proibidas tem duas listas: a antiga (do Financeiro) na 31 e o resto da página; a do Módulo 3 nos fontes da 32, que libera "culto" e barra o vocabulário do Regimento (Extensão da Tenda, parecer, região, quadrante e distrito, menos "Distrito Sede") |
| `propostas-r31/index.html` | A página da **rodada 31** (Membros, a saída e a volta), 155 KB, só com a 31. Gerada; não editar à mão. Publicada na página nova (24/11/2026) |
| `propostas-r30/index.html` | A página da rodada 30, a publicada (versão 12): a **base** de que a 31 parte. Não muda |
| `r31-carta.js` | As telas da 31 da carta: a carta em PDF (A4) com o histórico e a página que o QR abre (antes e depois do apagamento) |
| `r31-telas.js` | As outras telas da 31: o pedido com a cidade, o abandono com a Câmara de liderança e a volta sem os cargos |
| `r31-lista.js` | A explicação da rodada (`EXPLICA_R31`), a de cada tela (com os "Para conferir") e a lista que junta as telas |
| `montar-r31.js` | Monta a 31 a partir da base da 30, numa página só dela (tira as listas da 28, da 29 e da 30), tira o modo escuro, tira o código sem uso e procura as palavras que não existem na Igreja |
| `conferir-r31.js` | Confere cada desenho (só no claro, cada nível, notebook e celular) |
| `montar-r30.js`, `conferir-r30.js`, `r30-telas.js`, `r30-lista.js` | Os fontes da rodada 30, para consulta (as telas já estão dentro da base) |
| `propostas-r29/index.html`, `r29-saida.js`, `r29-mais.js`, `r29-lista.js` | A rodada 29, para consulta (a 31 ainda usa código da 29, que já vem dentro da base da 30) |

**A página nova a partir da 31** (24/11/2026): a página leve KMeb… ficou pesada demais para republicar (publicar no mesmo
endereço exige ler a versão no ar inteira e o arquivo novo, uns 340 mil tokens). Como já tinha acontecido com a G1gj…, ela
virou arquivo, e a 31 nasceu numa página nova, só com ela. O montador tira as listas da 28, da 29 e da 30 (o código que a
31 usa fica) e a poda tira o resto sem uso: a página caiu de 350 KB para 155 KB. No alto, dois links: "Já aprovados
(rodadas 19 a 30)", a KMeb…, e "Já aprovados (rodadas 2 a 18)", a G1gj….

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
node montar-r32.js     # grava propostas-r32/index.html; no fim, as duas contagens de palavras proibidas em 0
node conferir-r32.js   # no fim, "com problema 0"
```

O `montar-r31.js` usa o TypeScript (do projeto ou o global do npm).

O "Para conferir" (um detalhe que o desenhista decidiu e o responsável ainda confere) fica **na explicação** de cada tela,
nunca dentro do desenho: o que está no desenho é o que o construtor faz.

## Publicar

- **A página atual** (rodadas 31 em diante): `https://claude.ai/artifact/58VZXcgVGNdrUxoVZRp2c6` ("Propostas de tela").
  A 31 foi publicada nela em 24/11/2026 (versão 1, id 1795533424-59ff), com o banco (`db`) das escolhas. Para a próxima
  rodada, peça ao Claude para publicar a página nova **nesse endereço** (o mesmo `url`, sem criar outro) e não mexer nas
  capacidades.
- **As páginas de arquivo**, nunca mais republicadas: a `KMebnrdoWfAhcz9yeRgjFz` (rodadas 19 a 30, com as escolhas delas
  no banco dela) e a `G1gj9hzSbdcqAZYcFjmJ1j` (rodadas 2 a 18).
- Para publicar no mesmo endereço, a pessoa precisa ser **editora** da página (o responsável dá o papel no botão Share).
- **Nunca republicar enquanto o responsável está comentando:** as observações dele ficam no navegador e se perdem.
  A chave do `localStorage` (`propostas-r15`) não muda entre as rodadas.
- Ler as escolhas dele: `ArtifactData`, coleção `escolhas` da página atual (ids `r31-*` e `geral-r31`). As da 30 e das
  anteriores ficam no banco da KMeb… (`r30-*` e `geral-r30`).
- **Antes de publicar, a ferramenta exige ler a versão no ar inteira** (a 31 tem 155 KB; leia em blocos de ~150
  linhas, porque a ferramenta corta acima de 25 mil tokens). Faça isso num agente novo,
  para não pesar a conversa principal. A única diferença esperada é a casca que a plataforma põe em volta da página
  (o `<!doctype>` na 1ª linha e o fechamento no fim).

## A próxima rodada

1. Copie `montar-r31.js` para `montar-r32.js`: a base passa a ser `propostas-r31/index.html` (a publicada), e os
   nomes `r31` viram `r32`. Saem do montador da 32 os cortes da 28, 29 e 30 e as trocas do modo escuro (o bloco "5b"),
   porque a base da 31 já vem sem eles; os dois links do alto ficam. Se a 31 ficar recolhida embaixo da 32, a página vai
   crescer: mantenha-a abaixo de ~250 KB, para quem publica conseguir ler a versão no ar e o arquivo novo.
2. As telas novas em `r32-telas.js` (e, se precisar, em mais arquivos) e a explicação em `r32-lista.js`: só no claro,
   cada nível, celular com a barra do telefone. Quando ele se confunde com muitas opções, uma versão única bem
   explicada.
3. `node montar-r32.js` e um `conferir-r32.js` (cópia do da 31), os dois com zero problema.
4. Publique no mesmo endereço e registre: commit dos fontes da 32. A pasta da 30 pode sair quando a 32 entrar, porque o
   Git guarda o histórico.
5. A página deve ficar abaixo de ~250 KB: a 31 tem 155 KB.
6. O conferidor não mede transbordo: meça no Edge (o `medir.js` da pasta de fotos da rodada, só no claro) e olhe as
   fotos do pior caso (a mensagem de erro, o seletor aberto, o celular com o formulário), sem fotografar tudo.

Para as fotos de conferência no Windows: o Edge sem janela, sempre com `--disable-gpu` e com um `--user-data-dir` próprio
(com o Edge do dia a dia aberto, sem ele a foto não sai). A foto aparece um instante depois de o comando voltar. A página
de foto precisa do `* { box-sizing: border-box; }` da página de verdade; sem ele, o menu passa do tamanho e parece cortado.
