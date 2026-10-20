# Prova da tela do Ministério com Menores (v7.7)

Três equipamentos, sem tocar na API de verdade nem no banco. Rodar da pasta `tools/front-menores`:

| Comando | O que prova |
| --- | --- |
| `node -e "require('./roteiro').rodar().then(r => console.log(r.total + ' verificações, ' + r.falhas.length + ' falhas', r.falhas))"` | A tela contra o front de verdade em DOM simulado, com a API simulada nos formatos reais do servidor (montados pelas próprias funções de `api/shared`) e texto de ataque em todo campo: aceite com hash e `politicaMudou`, `termoMudou`, confirmação reforçada (428), auto-denúncia, painel mascarado × Diretoria, salas de escala, foto de menor, Meus Dados, troca de login, duplo clique, rede caída. |
| `node mutacoes.js` | Desfaz, uma a uma, as proteções da tela (escape, hash, 428, confirmações, permissões, máscara); cada mutação TEM de ser acusada pelo roteiro. Se o código da tela mudar de forma, ajuste a âncora da mutação. |
| `node navegador.js` | A tela no Edge headless com a CSP final do projeto, a 390 px e a 1280 px: sem violação de CSP, nada executado, sem rolagem lateral. Usa o `puppeteer-core` de `tools/csp-e2e` (rode `npm ci` lá antes). Capturas na pasta temporária do sistema. |

Trava 7-B (20/10/2026): os cenários `7B:` provam o professor de turma da EBD marcada "com menores" no painel (`turmas` por pessoa, inclusive quem não está em equipe), em Meu Painel (`minhaSituacao.turmas`: quem só é professor não lê mais "não está em nenhuma equipe") e em Meus Dados (retirada com `origem: "TURMA_EBD"`, sem "escala(s) desmarcada(s)"). O `dom.js` ganhou `insertBefore` (a pergunta da liderança da tela de proteção é inserida pelo módulo). Rodar só as mutações dela: `node mutacoes.js 7B`. Resultado: roteiro 322 verificações, 0 falhas; 10 mutações `7B`, 10 acusadas (8 novas e 2 âncoras do `escalas.js` refeitas).

Resultado de referência (09/10/2026, depois da revisão independente da tela): roteiro 293 verificações, 0 falhas; 71 mutações, 71 acusadas; Edge 14 medições por largura, 0 violações.
