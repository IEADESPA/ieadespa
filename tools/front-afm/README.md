# Prova da tela da v8.1 (AFM e faltas da CLI)

Mesmo molde de `tools/front-cuidado` (leia o README de lá): sem navegador, sem tocar na API de verdade nem no banco.
Rodar da pasta `tools/front-afm`:

| Comando | O que prova |
| --- | --- |
| `node roteiro.js` | A tela contra o front de verdade em DOM simulado, com as respostas **reais** do servidor (`contrato-real.json`) e texto de ataque (`<img src=x onerror=...>`) em todo campo de texto que vem dele. |

O `contrato-real.json` é gravado pelo roteiro do banco local, com os handlers e o banco de verdade:
`E2E_CONTRATO=1 BASE=cenario-afm bash rodar.sh roteiro e2e-47-afm-fluxos.js` (em `tools/e2e-localdb`). Mudou o formato de
uma resposta no servidor? Grave de novo antes de rodar a prova da tela: assim a tela é conferida contra o que o servidor
realmente devolve, não contra um formato imaginado.

Cobre: a aba Academia (matrículas com filtros, nível, reprovação com confirmação, nova matrícula; Reitor e docentes com e
sem homologação; Sessões Magnas), o que some fora do nível geral, o quadro "Faltas e cadeiras" da CLI (providências com o
prazo da AGE, comunicar, readmitir, inativos da AFM), o tipo da reunião só na CLI, o catálogo da justificativa (os 4
vedados bloqueados, o documento obrigatório na Sessão Magna, "outro fator externo" com detalhe), a justificativa livre
que continua nos outros órgãos, o Meu Painel (situação e pedido pelo catálogo) e a CDER em Comissões.

Resultado de 27/10/2026: 63 verificações, 0 falhas. Duas mutações (tirar o escape do nome nas matrículas; deixar os
vedados selecionáveis) foram acusadas pelo roteiro.
