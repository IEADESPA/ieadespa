# Prova da tela da v8.6 (Educação continuada)

Mesmo molde de `tools/front-escada` (leia o README de lá): sem navegador, sem tocar na API de verdade nem no banco.
Rodar da pasta `tools/front-educacao`:

| Comando | O que prova |
| --- | --- |
| `node roteiro.js` | A tela contra o front de verdade em DOM simulado, com as respostas **reais** do servidor (`contrato-real.json`) e texto de ataque (`<img src=x onerror=...>`) em todo campo de texto que vem dele. |
| `MUTAR=1 node roteiro.js` | O mesmo, e depois a prova inteira de novo com cada mutação do módulo: cada uma precisa ser acusada. |

O `contrato-real.json` é gravado pelo roteiro do banco local, com os handlers e o banco de verdade:
`E2E_CONTRATO=1 BASE=cenario-escada bash rodar.sh roteiro e2e-64-educacao-continuada.js` (em `tools/e2e-localdb`).

O que a prova cobre: o painel da Academia (quem está pendente e o motivo, quem ainda não foi aprovado na reciclagem do ano, as edições com o mínimo de
horas, a repescagem que só escolhe um exame bienal); registrar a reciclagem (o duplo clique que envia uma vez) e o exame (a origem só na repescagem); lançar os
resultados da reciclagem (só os obreiros, o que já está gravado vem preenchido, sem mudança nada vai ao servidor, só as linhas mexidas vão, a linha recusada
volta com o que foi digitado e o nome e o motivo aparecem também perto do botão, a própria linha travada, o foco na tabela aberta, dois cliques em "Lançar
resultados", o ano inteiro em lotes de 100 com a vez segurada) e do exame (os obreiros e a Câmara, a justificativa como texto); a minha (com a pendência; sem
repetir as trilhas; quem não é obreiro e não tem nada não vê o bloco) e a do perfil (com a trilha e o link do certificado; a resposta da pessoa anterior não
sobrescreve); a saída da sessão com tudo carregado e o que foi digitado nos formulários; a resposta atrasada do login anterior e dois pedidos do painel (vale o
último). Fora do módulo, confere no texto o "sob observação" da credencial no Meu Painel e a seção da Academia que fecha na saída. Dezesseis mutações acusadas.
