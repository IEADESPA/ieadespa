# Prova da tela da v7.15 (Crise e segurança)

Mesmo molde de `tools/front-comunicacao` e `tools/front-cuidado` (leia o README de lá): sem
navegador, sem tocar na API de verdade nem no banco. Rodar da pasta `tools/front-crise`:

| Comando | O que prova |
| --- | --- |
| `node roteiro.js` | A tela contra o front de verdade em DOM simulado e o servidor imitado (abaixo), com texto de ataque (`<img src=x onerror=...>`) em todo texto que vem dele. Um argumento filtra os cenários: `node roteiro.js Imprensa`. |
| `node mutacoes.js [filtro]` | Desfaz, uma a uma, as proteções da tela (escape, prazo, confirmação, 428, troca de login, resposta atrasada, a resposta anterior, os números inteiros, o filtro dos telefones, a faixa que some na saída...); cada mutação TEM de ser acusada pelo roteiro. Âncora que não casa = "INAPLICÁVEL" (também reprovada). |
| `CRS_MODULO=<arquivo> node roteiro.js` | O mesmo roteiro contra outra cópia de `app/modulos/crise-seguranca.js`. |

Cobre: a faixa da crise (sem sessão e PIN não pedem nada; liderança sem crise lê e esconde;
crise ativa mostra o porta-voz e a vedação, nunca o motivo; o porta-voz se reconhece; relida
no máximo a cada 2 minutos ao trocar de tela; some na saída da sessão; a resposta atrasada da
pessoa anterior é descartada; o botão leva à Imprensa); a aba aberta a toda a liderança, com as
pílulas que o servidor libera para cada papel (líder, Dirigente, porta-voz, nível geral) e que
não ficam para a próxima pessoa; a Crise (abrir com a confirmação e o 428 repetido uma vez, o
designado com o ato e a matrícula, encerrar com o resumo, o 409 que relê, continuar o aviso);
as Manifestações (o porta-voz registra, a correção aponta a original, o link só `http(s)`, com
`rel="noopener noreferrer"`); a Imprensa (registrar, corrigir o próprio, responder e recusar
com a resposta anterior, o 409 que relê); a Segurança (painel do território, a congregação
com o AVCB e o seguro, os telefones de emergência só com 3 dígitos, o plano em versões com o
409, o simulado com números inteiros, a vistoria com o checklist inteiro e a pendência só no
item pendente, resolver, anular, a equipe com a busca); Meus Dados; respostas atrasadas, o
prazo de 25 s, a rede caída; console e armazenamento limpos.

## Como é montado

- `ambiente.js` carrega o `index.html` de verdade, o `eventos.js`, o módulo inteiro e as funções
  reais do `script.js`, do `meus-dados.js` e do `calendario.js`, extraídas pela árvore do JavaScript.
- `fixtures.js` é o servidor imitado, com estado, nas formas de `api/GestaoCriseSeguranca/index.js`
  e `api/shared/criseSegurancaDb.js`; as regras que decidem o que a tela manda são as de verdade
  (`api/shared/criseSeguranca.js`). `contratoComOServidor()` confere as ações que a tela chama, a
  confirmação reforçada e os campos que ela lê contra o código do servidor.

Resultado de 23/10/2026 (depois da revisão independente): roteiro 216 verificações, 0 falhas; `node mutacoes.js`: 21 mutações, 21
acusadas. A prova em navegador (Edge com a CSP final) não foi feita nesta rodada.
