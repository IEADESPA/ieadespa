# Prova da tela da v9.5 (Mapa territorial)

Mesmo molde de `tools/front-missoes` (leia o README de lá): sem navegador, sem tocar na API de verdade nem no banco.
Rodar da pasta `tools/front-territorio`:

| Comando | O que prova |
| --- | --- |
| `node roteiro.js` | A pílula Território da aba Expansão e o endereço em linhas contra o front de verdade (`modulos/expansao.js`, `modulos/territorio.js` e `modulos/endereco.js`) em DOM simulado, com as respostas **reais** do servidor (`contrato-real.json`) e texto de ataque (`<img src=x onerror=...>`) em todo campo de texto. |
| `MUTAR=1 node roteiro.js` | O mesmo, e depois a prova inteira de novo com cada mutação dos três módulos: cada uma precisa ser acusada (a que deixa a tela esperando para sempre conta como acusada depois de 60 s). |

O `contrato-real.json` é gravado pelo roteiro do banco local, com os handlers e o banco de verdade:
`E2E_CONTRATO=1 BASE=cenario-territorio bash rodar.sh roteiro e2e-78-territorio.js` (em `tools/e2e-localdb`, depois de `bash rodar.sh preparar-territorio`).

O que a prova cobre: os ganchos (a pílula, os módulos no `index.html` e na casca do aparelho, a página do mapa fora da casca, a política de segurança própria da
página do mapa com sandbox e o sistema sem nenhum endereço do Google); o mapa em lista e desenho (o resumo, um círculo por bairro com ponto, as tabelas por bairro e
por unidade, nenhum nome de membro, o "Pedir Extensão aqui" só no bairro descoberto, a fila com o Cadastrar); o mapa do Google (a moldura com sandbox sem a mesma
origem, a escolha guardada no aparelho, só a moldura-mãe conversa, a chave enviada uma vez, só pontos e números, o erro do Google voltando à lista, sem a chave o
Google desligado); a simulação (a situação, as regras por extenso, o atalho só onde o servidor permite, sem critério ativo não aponta); os bairros do nível geral
(editar, o clique no mapa e o link colado preenchendo o ponto, o pino exato antes do centro da tela, o link curto, a versão lida, juntar e desativar com a
pergunta); os critérios e o raio (o Dirigente só lê; o sim/não sem valor; editar e apagar com a versão e a pergunta); os pontos das Extensões; o endereço em linhas
no Meus Dados (o endereço antigo numa linha, o bairro da lista travando a cidade e a UF, o bairro escrito, o desativado "fora da lista"); o cartão de Meus Dados;
a saída, a desmontagem da moldura fora da pílula e a troca de login no meio de uma leitura.
