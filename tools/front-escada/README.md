# Prova da tela da v8.2 (Escada ministerial)

Mesmo molde de `tools/front-cuidado` (leia o README de lá): sem navegador, sem tocar na API de verdade nem no banco.
Rodar da pasta `tools/front-escada`:

| Comando | O que prova |
| --- | --- |
| `node roteiro.js` | A tela contra o front de verdade em DOM simulado, com as respostas **reais** do servidor (`contrato-real.json`) e texto de ataque (`<img src=x onerror=...>`) em todo campo de texto que vem dele. |

O `contrato-real.json` é gravado pelo roteiro do banco local, com os handlers e o banco de verdade:
`E2E_CONTRATO=1 BASE=cenario-escada bash rodar.sh roteiro e2e-51-escada-fluxos.js` (em `tools/e2e-localdb`). Mudou o formato de
uma resposta no servidor? Grave de novo antes de rodar a prova da tela.

Cobre: a modalidade da consagração por nível (nomeação do Presidente e outra convenção só no geral; o campo do ato), o botão
"Conferir requisitos" (o pedido, a lista com o artigo, a lista que some quando a matrícula muda e a resposta atrasada descartada),
o protocolo travado e o feito (duplo clique, o formulário que volta à indicação), a esteira (destino, modalidade, veto sem
"Avançar", o avanço travado com a lista), a Academia (CHM, nivelamento, candidatos, filtros, conceder e revogar o CHM, a seção
"Escada e veto", o veto e a matrícula de candidato; o que some fora do nível geral), o cadastro (sexo e "no cargo desde"; cargo,
data e dízimo travados fora do nível geral; a data só vai quando muda) e a data pura de Meus Dados sem o dia a menos.

Resultado de 28/10/2026: 75 verificações, 0 falhas (com o que a revisão independente da tela pediu: saída da sessão, troca de cargo
mantendo a data, cargo fora do catálogo, geral só em outra permissão, avanço travado com o nome, clique durante pedido em andamento). Duas mutações (tirar o escape do rótulo do requisito; deixar a nomeação do
Presidente selecionável fora do nível geral) foram acusadas pelo roteiro.
