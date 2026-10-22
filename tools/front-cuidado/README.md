# Prova da tela da v7.11 (Cuidado pastoral)

Mesmo molde de `tools/front-protecao` e `tools/front-menores` (leia o README de lá): sem
navegador, sem tocar na API de verdade nem no banco. Rodar da pasta `tools/front-cuidado`:

| Comando | O que prova |
| --- | --- |
| `node roteiro.js` | A tela contra o front de verdade em DOM simulado e o servidor imitado (abaixo), com texto de ataque (`<img src=x onerror=...>`) em todo campo que vem dele. Um argumento filtra os cenários: `node roteiro.js Notas`. |
| `node mutacoes.js` | Prova de mutação: desfaz, uma a uma, as garantias da tela (escape, validação, limpeza ao sair, respostas atrasadas, duplo clique, 403/404/409/428/429, telefones de ajuda) e exige que o roteiro acuse cada uma. Um processo por mutação, com teto de memória e de tempo (o notebook já caiu com um mutante sem fim). `--conferir` só confere as âncoras; um argumento filtra pelo nome. |
| `node navegador.js` | A tela no Edge de verdade (sem tela, sempre com `--disable-gpu`), com a CSP final, a 390 e a 1280 px: sem rolagem lateral, sem violação de CSP nem erro no console, alvos de toque com 44 px. |

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

Revisão independente da tela (21/10/2026, 12 itens): o cenário "Revisão da tela" e os ajustes nos
cenários de pedidos, prazo de 20 s e revisão do servidor trazem uma verificação por item que
falhava no código de antes (conferido rodando o roteiro novo contra o módulo, o `style.css` e o
`script.js` de antes: 44 falhas) e passa no de agora: roteiro 657 verificações, 0 falhas.

Prova de mutação de 22/10/2026 (com o mural do site da v7.11.1): 606 mutações, 584 acusadas, 0 escaparam, 22 equivalentes conhecidas (o motivo de cada uma está em `mutacoes.js`); roteiro com 870 verificações.
