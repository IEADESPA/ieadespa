# Prova da tela da v9.2 (Expansão)

Mesmo molde de `tools/front-entidades` (leia o README de lá): sem navegador, sem tocar na API de verdade nem no banco.
Rodar da pasta `tools/front-expansao`:

| Comando | O que prova |
| --- | --- |
| `node roteiro.js` | A tela contra o front de verdade em DOM simulado, com as respostas **reais** do servidor (`contrato-real.json`) e texto de ataque (`<img src=x onerror=...>`) em todo campo de texto que vem dele. |
| `MUTAR=1 node roteiro.js` | O mesmo, e depois a prova inteira de novo com cada mutação do módulo: cada uma precisa ser acusada. |

O `contrato-real.json` é gravado pelo roteiro do banco local, com o handler e o banco de verdade:
`E2E_CONTRATO=1 BASE=cenario-expansao bash rodar.sh roteiro e2e-71-expansao.js` (em `tools/e2e-localdb`, depois de `bash rodar.sh preparar-expansao`).

O que a prova cobre: a aba com a permissão (também para o Dirigente, de nível local, que não recebe "nova congregação" nem as reuniões da CLI); o painel (o parecer
vencido, a CME); o pedido novo (cada tipo mostra só os campos dele e nunca manda o campo escondido); a ficha com os botões que o servidor diz que a pessoa pode
usar; a decisão da CLI (só as reuniões a partir do pedido e do parecer, a urgência só sem o parecer e como verdadeiro/falso, a confirmação com a consequência da
emancipação); o parecer da CME; a recusa dentro do formulário; o duplo clique (um pedido só); a troca de ficha durante a gravação; as Extensões (as ativas e todas,
a troca do Encarregado, o histórico); o cartão de Meus Dados; a saída da sessão e a troca de login (a resposta atrasada não pinta).

Resultado (v9.2, 04/11/2026): 69 verificações, 0 falhas; 18 mutações, 18 acusadas.
