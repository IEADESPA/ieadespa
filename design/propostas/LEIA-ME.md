# Propostas de tela (FASE 10): fontes da página de desenho

As páginas de propostas que o responsável abre, compara e escolhe são Artifacts do claude.ai, só da organização. Esta
pasta guarda os **fontes da rodada atual**, para qualquer pessoa da dupla gerar e publicar a próxima sem depender de uma
pasta temporária de um computador.

Tudo aqui é **público**: só nomes e números de mentira, nenhum dado de membro, nenhuma senha.

## O que tem aqui

| Arquivo | O que é |
| --- | --- |
| `propostas-r35/index.html` | A página da **rodada 35**, a última do Módulo 3 (os perfis de acesso de cada cargo com a passagem, afastar do cargo, o último domingo e a ceia geral, a assinatura reforçada do termo, as áreas e os números com a congregação nova e o ponto de culto novo, mudar de área, fechar ou juntar, e os termos guardados), 202 KB, só com a 35. Gerada; não editar à mão |
| `r35-base.js` | As peças novas da 35 (o menu com “Acessos dos cargos” e “Perfis de acesso”, quem está vendo, a chave de ligar, a etiqueta da situação do acesso, a caixa “não mexe no rol”); o resto vem do código da 32 à 34 que continua na página |
| `r35-perfis.js`, `r35-afastar.js`, `r35-agenda.js`, `r35-assinar.js`, `r35-igrejas.js`, `r35-mudar.js`, `r35-guardados.js` | As 7 telas da 35 (35 perfis, 70 desenhos) |
| `r35-lista.js` | A explicação da rodada (`EXPLICA_R35`, com as 9 perguntas que o plano não responde), a de cada tela (com os “Para conferir”) e a lista que junta as telas |
| `montar-r35.js`, `conferir-r35.js` | Montam a 35 a partir da página da 34 e conferem cada desenho. Nos fontes da 35, “ceia” vale em “Santa Ceia”, “ceia local” e “ceia geral” (as palavras dele). A única exceção da lista do Módulo 3 é o cartão dos níveis dormindo na tela das áreas (vista pela Geral): a frase `R35_DORMINDO_TXT` |
| `propostas-r34/index.html` | A página da **rodada 34** (Módulo 3, os ajustes da 33: os cultos com a agenda personalizada, com culto só da Sede, só das congregações e o tipo de cada domingo; e o termo de posse de todos que trabalham, por cargo, com o Presidente e o Secretário Geral assinando em lote), 159 KB, só com a 34. Gerada; não editar à mão. Publicada numa página nova (25/11/2026) |
| `r34-base.js` | As peças novas da 34 (o menu com os modelos do termo e os termos para assinar, quem está vendo: a Sede, o Presidente, o Secretário Geral e a Débora, e a etiqueta de para quem é o culto); o resto vem do código da 32 e da 33 que continua na página |
| `r34-cultos.js`, `r34-posse.js` | As 2 telas da 34: a agenda personalizada (a semana com para quem é cada culto, os domingos do mês, Vila Nova e a Sede cada uma com a sua agenda, o pedido do tipo de um domingo) e o termo de posse por cargo (o aceite da 1ª secretária, os modelos por cargo, o balcão na congregação, as páginas do Presidente e do Secretário Geral, o PDF com as quatro assinaturas, a área e a página do QR) |
| `r34-lista.js` | A explicação da rodada (`EXPLICA_R34`), a de cada tela (com os “Para conferir”) e a lista que junta as telas |
| `montar-r34.js`, `conferir-r34.js` | Montam a 34 a partir da página da 33 e conferem cada desenho. Nos fontes da 34, “ceia” só vale em “Santa Ceia” (o tipo do 1º domingo); a procura antiga desconta o código do Módulo 3 (os fontes da 32, da 33 e da 34) |
| `propostas-r33/index.html` | A página da **rodada 33** (Módulo 3, os ajustes da 32: os cultos com a agenda padrão da Geral, o termo de posse em três partes com a virada só do executivo, e o mapa com o bairro da ficha), 156 KB, só com a 33. Gerada; não editar à mão. Publicada numa página nova (25/11/2026) |
| `r33-base.js` | As peças novas da 33 (o menu com a agenda padrão e os bairros, a casca do Membros para a ficha) e as que a poda da 32 tirou (a página do QR, a caixa “é verdadeiro”); o resto vem do código da 32 que continua na página |
| `r33-cultos.js`, `r33-posse.js`, `r33-mapa.js` | As 3 telas da 33: a agenda padrão (a Geral monta e responde aos pedidos; a congregação acrescenta e pede), o termo em três partes (o aceite no celular e no balcão, o PDF de duas folhas, a página do QR, a virada pela Geral e a diretoria em janeiro) e o mapa (a lista dos bairros, o bairro na ficha, o alfinete) |
| `r33-lista.js` | A explicação da rodada (`EXPLICA_R33`), a de cada tela (com os “Para conferir”) e a lista que junta as telas |
| `montar-r33.js`, `conferir-r33.js` | Montam a 33 a partir da página da 32 (a poda leva o que só a 32 usava; o que a 33 reaproveita fica) e conferem cada desenho. A procura das palavras proibidas desconta o código do Módulo 3 (os fontes da 32 e da 33) da lista antiga |
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
node montar-r35.js     # grava propostas-r35/index.html; no fim, as duas contagens de palavras proibidas em 0 e "sobrou da 34: nada"
node conferir-r35.js   # no fim, "com problema 0"
```

O `montar-r31.js` usa o TypeScript (do projeto ou o global do npm).

O "Para conferir" (um detalhe que o desenhista decidiu e o responsável ainda confere) fica **na explicação** de cada tela,
nunca dentro do desenho: o que está no desenho é o que o construtor faz.

## Publicar

- **A página da rodada 34**: `https://claude.ai/artifact/6sztidgaZ5r3a46jdZYzfi` ("Propostas de tela · rodada 34"),
  publicada em 25/11/2026 (versão 2, id 1795631022-db04), com o banco (`db`) das escolhas (testado: gravar e apagar).
- **As páginas das rodadas anteriores**, nunca mais republicadas, cada uma com o seu banco: a
  `NF7zseCp4zVWsUEwUzmQDG` (rodada 33, ids `r33-*` e `geral-r33`), a `HYtYxyM4ysGnxhxnWiCk5o` (rodada 32, ids `r32-*` e `geral-r32`), a `58VZXcgVGNdrUxoVZRp2c6` (rodada 31, ids `r31-*` e `geral-r31`), a `KMebnrdoWfAhcz9yeRgjFz` (rodadas 19 a 30, ids
  `r30-*` e `geral-r30` e anteriores) e a `G1gj9hzSbdcqAZYcFjmJ1j` (rodadas 2 a 18).
- **A próxima rodada vai para uma página nova** (sem `url`, com as capacidades `{"db":{}}`): como não há versão no ar
  para ler, basta ler a página nova inteira antes de publicar (a ferramenta exige ler o que publica). Depois, grave e
  apague um documento de teste na coleção `escolhas`, para provar que o banco funciona.
- Ajustar a mesma rodada depois de publicada (antes de ele comentar): aí sim é o mesmo endereço, lendo a versão no ar.
- **Nunca republicar enquanto o responsável está comentando:** as observações dele ficam no navegador e se perdem.
  A chave do `localStorage` (`propostas-r15`) não muda entre as rodadas.
- Ler as escolhas dele: `ArtifactData`, coleção `escolhas` da página da rodada (na 34, ids `r34-*` e `geral-r34`).

## A próxima rodada

1. Copie `montar-r35.js` para `montar-r36.js`: a base passa a ser `propostas-r35/index.html` (a publicada), a lista da
   35 sai (a linha `TELAS.unshift(...TELAS_R35...)` é trocada pelos fontes da 36), os nomes `r35` viram `r36` e entra
   no alto o link da página da 35, antes dos outros. O código da 32 à 35 que a 36 reaproveitar fica na base; o que a
   poda já tirou se copia da página antiga. A 35 fechou a Estrutura: a 36 é do próximo módulo da ordem fixa.
2. As telas novas em `r35-*.js` e a explicação em `r35-lista.js`: só no claro, cada nível, celular com a barra do
   telefone. Quando ele se confunde com muitas opções, uma versão única bem explicada.
3. `node montar-r36.js` e um `conferir-r36.js` (cópia do da 35), os dois com zero problema. Confira também que não
   sobrou nada da 35 na página (`TELAS_R35`, `geral-r35`).
4. Publique numa página nova, só com a 35, e registre: commit dos fontes e esta seção com o endereço novo.
5. Uma página por rodada, sem teto de tamanho a vigiar: a 32 tem 145 KB, e só a página nova é lida antes de publicar.
6. O conferidor não mede transbordo: meça no Edge (o `medir.js` da pasta de fotos da rodada, só no claro) e olhe as
   fotos do pior caso (a mensagem de erro, o seletor aberto, o celular com o formulário), sem fotografar tudo. Na 34, o `medir.js` ganhou a conferência do botão esmagado (a
   altura desenhada menor que a pedida), que o transbordo não pega; na cópia da 34 as barras do padrão se perderam e ela
   nunca casava (consertada na 35, `C:/tmp/ieadespa-desenho-r35-fotos/ferr/medir.js`). O "esmagado" da folha em PDF no
   celular é efeito do `zoom` (608 × 0,8326 = 506), não defeito. O medir pode dar limpo e a foto mostrar corte: quem
   decide é a foto.

Para as fotos de conferência no Windows: o Edge sem janela, sempre com `--disable-gpu` e com um `--user-data-dir` próprio
(com o Edge do dia a dia aberto, sem ele a foto não sai). A foto aparece um instante depois de o comando voltar. A página
de foto precisa do `* { box-sizing: border-box; }` da página de verdade; sem ele, o menu passa do tamanho e parece cortado.
