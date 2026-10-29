# Prova da tela da v8.5 (Trilha de discipulado)

Mesmo molde de `tools/front-escada` (leia o README de lá): sem navegador, sem tocar na API de verdade nem no banco.
Rodar da pasta `tools/front-discipulado`:

| Comando | O que prova |
| --- | --- |
| `node roteiro.js` | A tela contra o front de verdade em DOM simulado, com as respostas **reais** do servidor (`contrato-real.json`) e texto de ataque (`<img src=x onerror=...>`) em todo campo de texto que vem dele. |
| `MUTAR=1 node roteiro.js` | O mesmo, e depois a prova inteira de novo com cada mutação do módulo: cada uma precisa ser acusada. |

O `contrato-real.json` é gravado pelo roteiro do banco local, com os handlers e o banco de verdade:
`E2E_CONTRATO=1 BASE=cenario-escada bash rodar.sh roteiro e2e-62-discipulado.js` (em `tools/e2e-localdb`).

O que a prova cobre: o funil do território e a lista de quem parou (a liderança local não vê nem pede o catálogo); o catálogo do nível geral (o formulário
da etapa conforme a fonte, o duplo clique que envia uma vez, o tipo de marco com o código travado na edição); a caminhada no perfil (a resposta de outra
pessoa não sobrescreve) e a minha (com o convite para quem não começou); os tipos do formulário de marco vindos do catálogo (sem o "só do nível geral" para
a liderança local; o tipo desativado fora dele); o batismo antes do curso (o Discipulado Pós-Batismal); a saída da sessão com tudo carregado; a resposta
atrasada do login anterior e o "Atualizar" duas vezes (vale o último). Seis mutações acusadas.
