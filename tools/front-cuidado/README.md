# Prova da tela da v7.11 (Cuidado pastoral)

Mesmo molde de `tools/front-protecao` e `tools/front-menores` (leia o README de lá): sem
navegador, sem tocar na API de verdade nem no banco. Rodar da pasta `tools/front-cuidado`:

| Comando | O que prova |
| --- | --- |
| `node roteiro.js` | A tela contra o front de verdade em DOM simulado e o servidor imitado (abaixo), com texto de ataque (`<img src=x onerror=...>`) em todo campo que vem dele. Um argumento filtra os cenários: `node roteiro.js Notas`. |

Cobre: a fila da liderança (filtros, urgente primeiro, prazo pintado pela faixa do servidor,
degrau, detecção, "SEM RESPONSÁVEL"); abrir acompanhamento (visitante e membro, busca por POST
sem o nome no endereço, menor escondido da busca do responsável, 409); o detalhe (contato com a
regra da visita a sós, troca de responsável, adiar, concluir com o caminho do abandono, cancelar,
409 relê, 404 neutro); as notas pastorais (lista sem texto, abrir com 428 e a confirmação
reforçada, "quem abriu", escrever e corrigir, texto que some ao fechar, ao trocar de seção, ao
sair da aba e da sessão); o responsável por PIN em Meu Painel (o que ele vê e o que não vê, o
encerrado como lembrança); os pedidos do membro (validação, sinal de risco sem inventar "a
liderança foi avisada", 429, rede caída, telefones sempre à vista); a moderação (publicar, nome e
diagnóstico recusados, lido, tirar do boletim, marcar e desmarcar o risco com 428 e o 403 da
Área, acompanhar, pedido recebido em mãos); boletim (impressão) e painel; troca de login;
respostas atrasadas; duplo clique; o prazo de 20 s; 401, 403 e 500; acessibilidade e o CSS do
celular e da impressão.

## Como é montado

- `ambiente.js` carrega o `index.html` de verdade, o `eventos.js`, o módulo inteiro e as funções
  reais do `script.js`, do `meus-dados.js` e do `calendario.js` (fetchProtegido, confirmarAcao,
  limparSessao, a navegação entre abas, módulos e sub-abas), extraídas pela árvore do JavaScript.
  Relógio, temporizadores e armazenamento do navegador são observáveis; o console da tela é
  anotado.
- `fixtures.js` é o servidor imitado, com estado. Roda o **handler de verdade**
  (`api/GestaoCuidadoPastoral/index.js`), o **auth.js e o escopoRotas.js de verdade** (só o
  `exigirLogin` e o `exigirFatorRecente` são trocados) e a **camada de banco inteira de verdade**
  (`api/shared/cuidadoPastoralDb.js`, com as regras de `api/shared/cuidadoPastoral.js`) contra um
  banco falso que responde a cada consulta dela. Consulta desconhecida é erro alto ("consulta sem
  imitação"), e o último cenário confere que nenhum servidor teve erro interno: se o servidor
  mudar, a prova acusa em vez de passar em falso.
- `contratoComOServidor()` confere por escrito os campos que a tela lê, os que ela manda, as ações
  e os métodos, o 428 e as constantes que a tela espelha (telefones de ajuda e limites).

Resultado de 21/10/2026: roteiro 582 verificações, 0 falhas. A prova em navegador (Edge, 390 e
1280 px) e a prova de mutação não foram feitas nesta rodada.
