# Prova da tela da v8.7 (o Seminário como sistema acadêmico)

Mesmo molde de `tools/front-escada` (leia o README de lá): sem navegador, sem tocar na API de verdade nem no banco.
Rodar da pasta `tools/front-seminario`:

| Comando | O que prova |
| --- | --- |
| `node roteiro.js` | A tela contra o front de verdade em DOM simulado, com as respostas **reais** do servidor (`contrato-real.json`) e texto de ataque (`<img src=x onerror=...>`) em todo campo de texto que vem dele. |
| `MUTAR=1 node roteiro.js` | O mesmo, e depois a prova inteira de novo com cada mutação do módulo: cada uma precisa ser acusada. |

O `contrato-real.json` é gravado pelo roteiro do banco local, com os handlers e o banco de verdade:
`E2E_CONTRATO=1 BASE=cenario-escada bash rodar.sh roteiro e2e-66-seminario.js` (em `tools/e2e-localdb`).

O que a prova cobre: o painel da seção Seminário (as turmas, só as disciplinas ativas e os docentes em exercício para abrir turma, o aviso do Art. 70 §2º, quem
está pronto para concluir); abrir turma (o duplo clique envia uma vez); a turma encerrada (notas travadas, só "Reabrir", que pede o motivo) e a aberta (só as notas
mexidas vão ao servidor, com a vírgula como foi digitada; a recusa com o nome e o motivo, e a linha mantém o que foi digitado; inscrever pela lista de matrículas;
encerrar só depois de confirmar; a própria nota travada; 250 notas em lotes de 100 com a vez segurada); o currículo (editar a disciplina: sem mudar de curso, sem
ela mesma nos pré-requisitos, os dela marcados; salvar; a regra do curso); a ficha do aluno (a matrícula só com números, o parecer, os atos do curso concluído, sem
declaração do concluído, o aproveitamento com todos os campos, a Academia emitindo o histórico e baixando o PDF); exigir uma disciplina num fluxo; a minha (sem os
atos da Academia, a própria pessoa emite o seu documento, quem nunca estudou nem lecionou não vê o bloco) e a do docente (lança e encerra a própria turma, sem
inscrever, cancelar nem reabrir); o perfil (sem emitir documento de ninguém; a resposta da pessoa anterior não sobrescreve); a saída com tudo carregado e o que foi
digitado; a resposta atrasada do login anterior e dois pedidos do painel. Fora do módulo, confere no texto o nível pelo histórico na lista da Academia e os
ganchos da saída, de Minha Formação e do perfil. O DOM simulado (`tools/front-menores/dom.js`) ganhou o `select` de escolha múltipla (`selectedOptions`).
