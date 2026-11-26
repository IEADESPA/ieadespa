# Propostas de tela (FASE 10): fontes da página de desenho

As páginas de propostas que o responsável abre, compara e escolhe são Artifacts do claude.ai, só da organização. Esta
pasta guarda os **fontes da rodada atual**, para qualquer pessoa da dupla gerar e publicar a próxima sem depender de uma
pasta temporária de um computador.

Tudo aqui é **público**: só nomes e números de mentira, nenhum dado de membro, nenhuma senha.

## O que tem aqui

| Arquivo | O que é |
| --- | --- |
| `propostas-r32/index.html` | A página da **rodada 32** (Módulo 3, Estrutura e Territórios, o começo), 145 KB, só com a 32. Gerada; não editar à mão. Ajustada às respostas dele às 8 perguntas e publicada numa página nova (24/11/2026) |
| `r32-base.js` | A casca do módulo (verde), quem está vendo e os dados de mentira comuns da 32 |
| `r32-painel.js`, `r32-ficha.js`, `r32-cultos.js`, `r32-posse.js`, `r32-mapa.js` | As 5 telas da 32: o painel do que está desatualizado, a ficha da congregação (e a da área), os cultos e os pontos de culto, a diretoria com o termo de posse e o mapa |
| `r32-lista.js` | A explicação da rodada (`EXPLICA_R32`), a de cada tela (com os "Para conferir") e a lista que junta as telas |
| `montar-r32.js`, `conferir-r32.js` | Montam a 32 a partir da página da 31 (tiram a lista da 31: a poda leva o código que só ela usava) e conferem cada desenho (só no claro, cada nível, notebook e celular). A procura das palavras proibidas tem duas listas: a antiga (do Financeiro) na 31 e o resto da página; a do Módulo 3 nos fontes da 32, que libera "culto" e barra o vocabulário do Regimento (Extensão da Tenda, parecer, região, quadrante e distrito, menos "Distrito Sede") |
| `propostas-r31/index.html` | A página da **rodada 31** (Membros, a saída e a volta), 155 KB, só com a 31. Gerada; não editar à mão. Publicada na página nova (24/11/2026) |
| `propostas-r30/index.html` | A página da rodada 30, a publicada (versão 12): a **base** de que a 31 parte. Não muda |
| `r31-carta.js` | As telas da 31 da carta: a carta em PDF (A4) com o histórico e a página que o QR abre (antes e depois do apagamento) |
| `r31-telas.js` | As outras telas da 31: o pedido com a cidade, o abandono com a Câmara de liderança e a volta sem os cargos |
| `r31-lista.js` | A explicação da rodada (`EXPLICA_R31`), a de cada tela (com os "Para conferir") e a lista que junta as telas |
| `montar-r31.js` | Monta a 31 a partir da base da 30, numa página só dela (tira as listas da 28, da 29 e da 30), tira o modo escuro, tira o código sem uso e procura as palavras que não existem na Igreja |
| `conferir-r31.js` | Confere cada desenho (só no claro, cada nível, notebook e celular) |
| `montar-r30.js`, `conferir-r30.js`, `r30-telas.js`, `r30-lista.js` | Os fontes da rodada 30, para consulta (as telas já estão dentro da base) |
| `propostas-r29/index.html`, `r29-saida.js`, `r29-mais.js`, `r29-lista.js` | A rodada 29, para consulta (a 31 ainda usa código da 29, que já vem dentro da base da 30) |

**Uma página por rodada** (regra de 24/11/2026, a partir da 32): publicar no mesmo endereço exige ler inteiras a
versão no ar e a página nova (na 32, uns 200 mil tokens), e isso não coube num agente. Por isso, cada rodada nasce numa
página nova, só com ela, e as anteriores ficam como estão, cada uma com o seu banco de escolhas. No alto, os links das
anteriores: "Já aprovados (rodada 31)", a 58VZ…; "Já aprovados (rodadas 19 a 30)", a KMeb…; e "Já aprovados (rodadas 2
a 18)", a G1gj…. A cada rodada nova, o montador põe mais um link no alto (o da página da rodada anterior). O montador
troca a lista da rodada anterior pela da nova, e a poda tira o código sem uso: a 32 ficou com 145 KB.

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

- **A página da rodada 32**: `https://claude.ai/artifact/HYtYxyM4ysGnxhxnWiCk5o` ("Propostas de tela · rodada 32"),
  publicada em 24/11/2026 (versão 1, id 1795545257-e9bf), com o banco (`db`) das escolhas.
- **As páginas das rodadas anteriores**, nunca mais republicadas, cada uma com o seu banco: a
  `58VZXcgVGNdrUxoVZRp2c6` (rodada 31, ids `r31-*` e `geral-r31`), a `KMebnrdoWfAhcz9yeRgjFz` (rodadas 19 a 30, ids
  `r30-*` e `geral-r30` e anteriores) e a `G1gj9hzSbdcqAZYcFjmJ1j` (rodadas 2 a 18).
- **A próxima rodada vai para uma página nova** (sem `url`, com as capacidades `{"db":{}}`): como não há versão no ar
  para ler, basta ler a página nova inteira antes de publicar (a ferramenta exige ler o que publica). Depois, grave e
  apague um documento de teste na coleção `escolhas`, para provar que o banco funciona.
- Ajustar a mesma rodada depois de publicada (antes de ele comentar): aí sim é o mesmo endereço, lendo a versão no ar.
- **Nunca republicar enquanto o responsável está comentando:** as observações dele ficam no navegador e se perdem.
  A chave do `localStorage` (`propostas-r15`) não muda entre as rodadas.
- Ler as escolhas dele: `ArtifactData`, coleção `escolhas` da página da rodada (na 32, ids `r32-*` e `geral-r32`).

## A próxima rodada

1. Copie `montar-r32.js` para `montar-r33.js`: a base passa a ser `propostas-r32/index.html` (a publicada), a lista da
   32 sai (a linha `TELAS.unshift(...TELAS_R32...)` é trocada pelos fontes da 33), os nomes `r32` viram `r33` e entra
   no alto o link da página da 32 (HYtY…), antes dos outros.
2. As telas novas em `r33-*.js` e a explicação em `r33-lista.js`: só no claro, cada nível, celular com a barra do
   telefone. Quando ele se confunde com muitas opções, uma versão única bem explicada.
3. `node montar-r33.js` e um `conferir-r33.js` (cópia do da 32), os dois com zero problema. Confira também que não
   sobrou nada da 32 na página (`TELAS_R32`, `geral-r32`).
4. Publique numa página nova, só com a 33, e registre: commit dos fontes e esta seção com o endereço novo.
5. Uma página por rodada, sem teto de tamanho a vigiar: a 32 tem 145 KB, e só a página nova é lida antes de publicar.
6. O conferidor não mede transbordo: meça no Edge (o `medir.js` da pasta de fotos da rodada, só no claro) e olhe as
   fotos do pior caso (a mensagem de erro, o seletor aberto, o celular com o formulário), sem fotografar tudo.

Para as fotos de conferência no Windows: o Edge sem janela, sempre com `--disable-gpu` e com um `--user-data-dir` próprio
(com o Edge do dia a dia aberto, sem ele a foto não sai). A foto aparece um instante depois de o comando voltar. A página
de foto precisa do `* { box-sizing: border-box; }` da página de verdade; sem ele, o menu passa do tamanho e parece cortado.
