# Prova da tela da v9.4 (Missões)

Mesmo molde de `tools/front-distritos` (leia o README de lá): sem navegador, sem tocar na API de verdade nem no banco.
Rodar da pasta `tools/front-missoes`:

| Comando | O que prova |
| --- | --- |
| `node roteiro.js` | A pílula Missões da aba Expansão contra o front de verdade (`modulos/expansao.js` e `modulos/missoes.js`) em DOM simulado, com as respostas **reais** do servidor (`contrato-real.json`) e texto de ataque (`<img src=x onerror=...>`) em todo campo de texto e nos rótulos dos catálogos. |
| `MUTAR=1 node roteiro.js` | O mesmo, e depois a prova inteira de novo com cada mutação dos dois módulos: cada uma precisa ser acusada (a que deixa a tela esperando para sempre conta como acusada depois de 60 s). |

O `contrato-real.json` é gravado pelo roteiro do banco local, com os handlers e o banco de verdade:
`E2E_CONTRATO=1 BASE=cenario-missoes bash rodar.sh roteiro e2e-76-missoes.js` (em `tools/e2e-localdb`, depois de `bash rodar.sh preparar-missoes`).

O que a prova cobre: as pílulas pela permissão (com `expansao` e `missoes`; só com `missoes` — o Tesoureiro abre direto em Missões e não pede nada da Expansão —; só
com `expansao`, sem a pílula); o painel com o pago sem relatório; a lista e a ficha do envio com os botões que o servidor diz que a pessoa pode usar (a SEMIADESPA, a
CME sem o documento, o nível geral, o Presidente); o parecer da CME; a decisão da CLI com a urgência; a concordância do Presidente (a recusa exige o motivo); o pedido
de envio (a matrícula, o valor sem ponto de milhar, a fonte, quem recebe, o documento lido só na hora de enviar, o tipo e o tamanho do arquivo); o relatório de campo
(só os períodos em aberto, os números inteiros) e a correção preenchida; o encerramento com a pergunta, o cancelamento e o duplo clique; os campos (editar
preenchido, o catálogo relido); a prévia do sustento (suspenso e impedido com o motivo) e a geração só pela Tesouraria; o mural para imprimir (só o mural na folha
até o fim da impressão); o cartão de Meus Dados; a saída da sessão, a troca de login e a confirmação reforçada (428) que troca o bilhete no meio do ato.
