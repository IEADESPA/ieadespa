# Prova da tela da v8.4 (Credencial digital)

Mesmo molde de `tools/front-consagracao` (leia o README de lá): sem navegador, sem tocar na API de verdade nem no banco.
Rodar da pasta `tools/front-credencial`:

| Comando | O que prova |
| --- | --- |
| `node roteiro.js` | Minha Credencial (Meu Painel), a sub-aba Credenciais (Pessoas) e a página pública `credencial.html` contra o código de verdade, com as respostas **reais** do servidor (`contrato-real.json`) e texto de ataque em todo campo de texto. |
| `MUTAR=1 node roteiro.js` | O mesmo, e depois a prova inteira de novo com cada mutação: cada uma precisa ser acusada. |

O `contrato-real.json` é gravado pelo roteiro do banco local, com os handlers e o banco de verdade:
`E2E_CONTRATO=1 BASE=cenario-escada bash rodar.sh roteiro e2e-59-credencial.js` (em `tools/e2e-localdb`). O link assinado da foto não é gravado.

Cobre: o cartão no Meu Painel (nome, categoria, código, sem validade, a situação de agora, o QR pela sessão), o pedido de impressão, a falta de
credencial, a resposta que chega depois da saída; a lista da Secretaria (pedidos de impressão, filtro, nova via e cancelar só nas válidas, emitir
com duplo clique, nova via e cancelar pedindo o motivo, marcar impressa, lote) e a sub-aba que some fora do nível geral; a página pública (consulta
sozinha pelo QR, ativa, obreiro inativo, substituída, cancelada, não encontrada, código incompleto) sempre com o texto do servidor como texto.

Resultado de 28/10/2026: 42 verificações, 0 falhas (com a busca no servidor e a resposta atrasada descartada, pedidos da revisão independente). Três mutações (a página pública usar innerHTML; mostrar a sub-aba fora do nível geral; tirar o
escape do nome no cartão) foram acusadas.
