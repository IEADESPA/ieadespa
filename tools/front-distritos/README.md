# Prova da tela da v9.3 (Distritos)

Mesmo molde de `tools/front-expansao` (leia o README de lá): sem navegador, sem tocar na API de verdade nem no banco.
Rodar da pasta `tools/front-distritos`:

| Comando | O que prova |
| --- | --- |
| `node roteiro.js` | A pílula Distritos da aba Expansão contra o front de verdade (`modulos/expansao.js` e `modulos/distritos.js`) em DOM simulado, com as respostas **reais** do servidor (`contrato-real.json`) e texto de ataque (`<img src=x onerror=...>`) em todo campo de texto e nos rótulos dos catálogos. |
| `MUTAR=1 node roteiro.js` | O mesmo, e depois a prova inteira de novo com cada mutação dos dois módulos: cada uma precisa ser acusada (a que deixa a tela esperando para sempre conta como acusada depois de 60 s). |

O `contrato-real.json` é gravado pelo roteiro do banco local, com os handlers e o banco de verdade:
`E2E_CONTRATO=1 BASE=cenario-distritos bash rodar.sh roteiro e2e-73-distritos.js` (em `tools/e2e-localdb`, depois de `bash rodar.sh preparar-distritos`).

O que a prova cobre: as pílulas pela permissão (com as duas, só com `distritos` — abre direto nos Distritos e não pede nada da Expansão —, só com `expansao`); a
lista com os sinais; a ficha (o decreto, o território, o CDE, o mês a mês, o caixa, os balanços, as intervenções, os períodos) com os botões que o servidor diz
que a pessoa pode usar; o decreto (o gatilho b conferido antes da pergunta, a população em branco não vai, a pergunta com a consequência); a intervenção (a
matrícula conferida, as medidas como verdadeiro/falso); o encerramento com o duplo clique e o segundo envio durante a gravação; o balanço (só os anos que o
servidor oferece, a recusa dentro do formulário); a análise do NIF (devolver exige o motivo; quem não é do NIF não vê); a troca de ficha durante a gravação; o
cartão de Meus Dados; a saída da sessão e a troca de login (a resposta atrasada não pinta); a confirmação reforçada (428) que troca o bilhete no meio do ato
(o resultado aparece); o Distrito legado (o repasse continua com a Sede até o decreto); o próprio balanço sem a análise; as reuniões relidas ao voltar; a ficha
que não relê depois de gravar (o resultado num aviso); o Distrito sem território avisado antes da confirmação.

Resultado (v9.3, 04/11/2026, depois das duas revisões independentes): 72 verificações, 0 falhas; 32 mutações, 32 acusadas.
