# Prova da tela da v9.1 (Entidades vinculadas)

Mesmo molde de `tools/front-seminario` (leia o README de lá): sem navegador, sem tocar na API de verdade nem no banco.
Rodar da pasta `tools/front-entidades`:

| Comando | O que prova |
| --- | --- |
| `node roteiro.js` | A tela contra o front de verdade em DOM simulado, com as respostas **reais** do servidor (`contrato-real.json`) e texto de ataque (`<img src=x onerror=...>`) em todo campo de texto que vem dele. |
| `MUTAR=1 node roteiro.js` | O mesmo, e depois a prova inteira de novo com cada mutação do módulo: cada uma precisa ser acusada. |

O `contrato-real.json` é gravado pelo roteiro do banco local, com o handler e o banco de verdade:
`E2E_CONTRATO=1 BASE=cenario-entidades bash rodar.sh roteiro e2e-69-entidades.js` (em `tools/e2e-localdb`, depois de `bash rodar.sh preparar-entidades`).

O que a prova cobre: a aba só com a permissão no nível geral; o painel (o prazo fatal da CLI, a prestação atrasada, quando a decretação fica liberada); a lista e a
ficha (o prazo de 15 dias, a diretoria afastada, os botões de cada etapa, decretar e encerrar só para o Pastor Presidente); a decisão da CLI (as reuniões, o que vai ao
servidor, a ficha relida); o duplo clique (um pedido só); a recusa (o formulário fica com o que foi digitado); decretar com a confirmação e as marcas como
verdadeiro/falso; a entrega da prestação (o período e a entidade fixos); a extinção só com os destinos da natureza (Art. 68); os documentos; os tipos (as formações
uma por linha); o cadastro; o cartão de Meus Dados; a saída da sessão e a troca de login (a resposta atrasada não pinta).

Resultado (v9.1, 03/11/2026, depois das duas revisões independentes): 70 verificações, 0 falhas; 16 mutações, 16 acusadas.
