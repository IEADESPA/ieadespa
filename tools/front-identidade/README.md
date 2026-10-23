# Prova da tela da v7.14 (Identidade Visual)

Mesmo molde de `tools/front-comunicacao` e `tools/front-cuidado` (leia o README de lá): sem
navegador, sem tocar na API de verdade nem no banco. Rodar da pasta `tools/front-identidade`:

| Comando | O que prova |
| --- | --- |
| `node roteiro.js` | A tela contra o front de verdade em DOM simulado e o servidor imitado (abaixo), com texto de ataque (`<img src=x onerror=...>`) em todo texto que vem dele. Um argumento filtra os cenários: `node roteiro.js Diretoria`. |
| `IDV_MODULO=<arquivo> node roteiro.js` | O mesmo roteiro contra outra cópia de `app/modulos/identidade-visual.js` (ex.: a de antes de uma correção, para ver a verificação falhar). `ENQ_MODULO` faz o mesmo com o `enquetes.js`. |
| `node mutacoes.js` | Prova de mutação: desfaz, uma a uma, as garantias da tela e exige que o roteiro acuse cada uma. Um processo por mutação, com teto de memória e de tempo. `--conferir` só confere as âncoras; `--listar` lista; um argumento filtra pelo nome. |

Cobre: Meu Painel → Identidade Visual em cada etapa (sem ciclo: o ano que vem e a identidade
vigente, nenhuma etapa; aguardando; sugestões: vazio recusado na tela, 422 mostrado tal qual com
o texto no campo, 201 limpa e relê, limite de 3, "Retirar" com confirmação, 404 neutro, 429,
duplo clique; quem não é apto não vê formulário nem cédula; triagem: tudo "em análise" antes da
votação; votação: não abriu, cédula, nada marcado, confirmação com o tema, o POST
`{respostas:[{perguntaId, opcaoId}]}` só da opção marcada, já votou, recusa do servidor, duplo
clique, encerrada com a contagem; arte: só cor conferida `#RRGGBB` entra no estilo, arquivo que
falta, tipo errado, mais de 5 MB e vazio recusados antes de qualquer pedido, o PNG em base64 que
passa nas regras do servidor, "Ver" só pela `urlSegura` (endereço `javascript:` e `data:` viram
`#`), retirar, recusada com o motivo, máximo de 3, sem cores; encerrado com o resultado e a imagem
escolhida); códigos desconhecidos do servidor (etapa, situação, apuração, ocasião) como texto;
Meu Painel → Votações (lista, já respondida, opções e texto livre, resposta que falta, o POST,
recusa, lista vazia, duplo clique, saída da sub-aba, troca de login com o voto no meio, prazo de
20 s); a aba da Diretoria (sem acesso e sem as pílulas, sem a permissão, PIN, não geral, falha ao
abrir; abrir e cancelar o ciclo, pílulas dos ciclos, o motivo de não abrir, 404; triagem sem
nomes, finalista com ajuste e o 428 com uma nova tentativa, fator recusado, descarte com
critério, voltar para a triagem, 422, duplo clique; abrir a votação com 428 e 422, 409 da triagem
depois da votação; desempate só entre os empatados; cores em maiúsculas, apagar, 422 depois da
primeira arte; artes com autor, "Ver", tirar do concurso com motivo; o resultado do culto com os
campos obrigatórios, 428 e 201; Temas já usados: manual editável, processo só leitura,
cadastrar, corrigir, apagar); o "Fecha sozinha em" do formulário de enquete (vai no corpo, limpa
depois, aparece na lista na hora de Brasília); a saída da sessão, a troca de login, a saída da
aba e da sub-aba; respostas atrasadas; o prazo de 20 s; 401 e 403; console e armazenamento limpos.

## Como é montado

- `ambiente.js` carrega o `index.html` de verdade, o `eventos.js`, o `identidade-visual.js` e o
  `enquetes.js` inteiros e as funções reais do `script.js`, do `meus-dados.js` e do
  `calendario.js` (fetchProtegido, confirmarAcao, urlSegura, jsonDaTela, limparSessao, a
  navegação entre abas e sub-abas), extraídas pela árvore do JavaScript. Temporizadores
  observáveis (o prazo de 20 s é disparado pelo roteiro); console e armazenamento anotados; rádio
  exclusivo como no navegador; `arquivo()` imita o arquivo escolhido no `<input type="file">`.
- `fixtures.js` é o servidor imitado, com estado, nas formas de
  `api/GestaoIdentidadeVisual/index.js`, `api/shared/identidadeVisualDb.js` e
  `api/GestaoEnquetes/index.js` (mesmos códigos 400, 403, 404, 409, 422, 428 e 429). As regras são
  as de verdade (`api/shared/identidadeVisual.js`: calendário, etapa, validarTema, validarCor,
  validarResultado, conferirTemasUsados, conferirImagem, apurar...). As listas LEITURAS, ESCRITAS
  e EXIGE_GESTAO e os atos com confirmação reforçada são lidos do handler.
- `contratoComOServidor()` confere, contra o código do servidor, as ações que a tela chama (todas
  as 6 leituras e as 15 escritas), os campos que ela lê, o 428 exatamente em abrir-votacao,
  desempate, resultado e finalista da triagem, e o voto e Meu Painel → Votações no GestaoEnquetes.

Resultado de 23/10/2026: roteiro 632 verificações, 0 falhas. Contra os módulos de antes das
correções desta rodada (`IDV_MODULO`/`ENQ_MODULO`): 4 falhas, uma por defeito corrigido
(as pílulas da Diretoria à vista para quem não tem acesso; em Votações, a resposta de um voto
que chegava depois da troca de login aparecia para a próxima pessoa, e a lista e o voto não
tinham o prazo de 20 s). Prova de mutação: 115 mutações, 107 acusadas, 8 equivalentes
conhecidas (rótulos da própria tela, a cor já conferida, a data já formatada, o código da
ocasião já filtrado), nenhuma escapou — a primeira rodada deixou escapar 5 (a imagem atrasada
depois da troca de pessoa, sair da sessão com Meu Painel aberto e três textos sem texto de
ataque no servidor imitado), e o roteiro ganhou as verificações que as acusam. A prova em
navegador não foi feita nesta rodada.
