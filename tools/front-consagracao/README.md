# Prova da tela da v8.3 (Consagração e documentação)

Mesmo molde de `tools/front-escada` (leia o README de lá): sem navegador, sem tocar na API de verdade nem no banco.
Rodar da pasta `tools/front-consagracao`:

| Comando | O que prova |
| --- | --- |
| `node roteiro.js` | A tela contra o front de verdade em DOM simulado, com as respostas **reais** do servidor (`contrato-real.json`) e texto de ataque (`<img src=x onerror=...>`) em todo campo de texto que vem dele. |
| `MUTAR=1 node roteiro.js` | O mesmo, e depois a prova inteira de novo com cada mutação do módulo: cada uma precisa ser acusada. |

O `contrato-real.json` é gravado pelo roteiro do banco local, com os handlers e o banco de verdade:
`E2E_CONTRATO=1 BASE=cenario-escada bash rodar.sh roteiro e2e-55-consagracao-fluxos.js` (em `tools/e2e-localdb`). O link assinado da foto
não é gravado. Mudou o formato de uma resposta no servidor? Grave de novo antes de rodar a prova da tela.

Cobre: quem vê o quê na aba Consagrações (só o CEI vê só os pareceres; o Dirigente local vê a esteira com "Documentos" e nada mais; as
cerimônias só no nível geral); a esteira (o que falta no dossiê, quem homologa, a taxa com centavos, os encerrados — INAPTO, ausente,
consagrado com o diploma —, "Enviar ao CEI" com confirmação); a homologação em lote (nada marcado, sem ato nem reunião, recusa com o
motivo de cada um, duplo clique, a reunião da CLI); a taxa (o que já foi pago, vírgula, remover); o parecer do CEI (sabatina, histórico
de ruptura que abre o escrutínio, divorciado com o escrutínio já aberto, Pastor não casado, INAPTO com confirmação, recusa, a lista da
escada na seção do CEI, duplo clique); a cerimônia (criar, comissão, casal e diplomação no roteiro, presença marcada só para quem está
em dia, a pergunta que diz quantos perdem o ano, a lista inteira — presentes e ausentes —, o resultado com os diplomas, incluir, retirar,
diplomas recusados, cancelar com motivo, editar); o CHM com o certificado na Academia; os processos em Meus Dados; a saída da sessão.

Resultado de 28/10/2026: 98 verificações, 0 falhas (com o que a revisão independente da tela pediu: o ato vai para a cerimônia que
estava na tela no clique, a presença desmarcada sobrevive ao redesenho, o resultado de cada pessoa depois do registro, a fila do CEI que
chega depois da saída é descartada, o aviso para o CEI fora do nível geral, a lista da escada perto do painel da homologação). Três mutações (tirar o escape do destino do candidato na cerimônia; mandar só os
presentes, sem a lista de ausentes; mostrar as cerimônias a quem não é do nível geral) foram acusadas.

O navegador simulado (`tools/front-menores/dom.js`) passou a aceitar `el.hidden = true/false`, como o navegador de verdade; as outras
provas de tela continuam passando.
