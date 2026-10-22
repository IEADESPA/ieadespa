# Prova da tela da v7.12 (Comunicação)

Mesmo molde de `tools/front-cuidado` e `tools/front-menores` (leia o README de lá): sem
navegador, sem tocar na API de verdade nem no banco. Rodar da pasta `tools/front-comunicacao`:

| Comando | O que prova |
| --- | --- |
| `node roteiro.js` | A tela contra o front de verdade em DOM simulado e o servidor imitado (abaixo), com texto de ataque (`<img src=x onerror=...>`) em todo texto que vem dele. Um argumento filtra os cenários: `node roteiro.js Modelos`. |
| `COM_MODULO=<arquivo> node roteiro.js` | O mesmo roteiro contra outra cópia de `app/modulos/comunicacao.js` (ex.: a de antes de uma correção, para ver a verificação falhar). `COM_SAIR` faz o mesmo com o `sair.js`. |

Cobre: Meu Painel → Comunicações (as 4 categorias; a convocação sem caixa, "obrigação do
Estatuto"; o texto exato em "Ler a autorização"; salvar só o que mudou com a impressão digital
que o servidor deu; "Nada mudou"; o 422 do texto que mudou relê e o motivo fica escrito; 429;
avisos sem e-mail e sem aparelho; comunicados com o texto preenchido; "Recebi a convocação" só
na convocação sem ciência, o POST e o duplo clique); a aba da liderança (sem acesso, falha ao
abrir que não é "sem acesso", as pílulas Modelos e Ficha só do nível geral e que não ficam para
a próxima pessoa; Enviar: só modelos aprovados, o texto do modelo, os critérios do grupo
exatamente como `validarCriterios` do servidor aceita, a caixa da Assembleia Geral só do geral,
"Enviar" só depois de uma contagem válida e invalidado por qualquer mudança, os sem data de
nascimento, o 429 da contagem, a confirmação com a contagem, o 428 com uma nova tentativa, o
repetido, o fator recusado, a contagem velha; grupos guardados: usar, guardar e apagar sem
perder o que está montado; Envios: lista, relatório com contagens, leitura, ciência e quem não
foi alcançado (link `tel:` só com dígitos, lista cortada "Mostrando N de M"), 404 neutro,
cancelar; Modelos: rascunho novo, editar, "Corrigir (versão nova)" com a chave, aprovar com a
impressão digital, 409 relê, 428, arquivar e apagar; Ficha em papel: validação, referência da
ficha, 428, 422 e 404); a saída da sessão, a troca de login, a saída da aba e da sub-aba;
respostas atrasadas; o prazo de 20 s; 401 e 403; console e armazenamento limpos; e a página do
link do e-mail (`sair.html` + `sair.js`: link incompleto, inválido, válido só lê, o botão grava
`{t}`, já saiu, 429, rede caída, resposta que não é JSON).

## Como é montado

- `ambiente.js` carrega o `index.html` de verdade, o `eventos.js`, o módulo inteiro e as funções
  reais do `script.js`, do `meus-dados.js` e do `calendario.js` (fetchProtegido, confirmarAcao,
  limparSessao, a navegação entre abas e sub-abas), extraídas pela árvore do JavaScript.
  Temporizadores observáveis (o prazo de 20 s é disparado pelo roteiro); console e armazenamento
  anotados; rádio exclusivo como no navegador. `criarAmbienteSair` monta o `sair.html` com o
  `sair.js` de verdade, o endereço `?t=` e um fetch imitado.
- `fixtures.js` é o servidor imitado, com estado, escrito à mão nas formas de
  `api/GestaoComunicacao/index.js` e `api/shared/comunicacaoDb.js` (mesmos códigos 400, 403,
  404, 409, 422, 428 e 429). As regras que decidem o que a tela manda são as de verdade:
  `validarCriterios`, `validarModelo`, `validarTexto`, `descreverCriterios`
  (`api/shared/comunicacao.js`) e `validarMudancas` (`api/shared/comunicacaoDb.js`).
- `contratoComOServidor()` confere, contra o código do servidor, as ações que a tela chama, os
  campos que ela lê e a confirmação reforçada em aprovar, enviar e ficha.

Resultado de 22/10/2026: roteiro 417 verificações, 0 falhas. Contra o módulo de antes das
correções desta rodada (`COM_MODULO`): 26 falhas, uma por correção ou mudança do servidor.
A prova em navegador e a prova de mutação completa não foram feitas nesta rodada.
