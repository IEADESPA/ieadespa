# Prova da tela do Ministério com Menores (v7.7)

Três equipamentos, sem tocar na API de verdade nem no banco. Rodar da pasta `tools/front-menores`:

| Comando | O que prova |
| --- | --- |
| `node -e "require('./roteiro').rodar().then(r => console.log(r.total + ' verificações, ' + r.falhas.length + ' falhas', r.falhas))"` | A tela contra o front de verdade em DOM simulado, com a API simulada nos formatos reais do servidor (montados pelas próprias funções de `api/shared`) e texto de ataque em todo campo: aceite com hash e `politicaMudou`, `termoMudou`, confirmação reforçada (428), auto-denúncia, painel mascarado × Diretoria, salas de escala, foto de menor, Meus Dados, troca de login, duplo clique, rede caída. |
| `node mutacoes.js` | Desfaz, uma a uma, as proteções da tela (escape, hash, 428, confirmações, permissões, máscara); cada mutação TEM de ser acusada pelo roteiro. Se o código da tela mudar de forma, ajuste a âncora da mutação. |
| `node navegador.js` | A tela no Edge headless com a CSP final do projeto, a 390 px e a 1280 px: sem violação de CSP, nada executado, sem rolagem lateral. Usa o `puppeteer-core` de `tools/csp-e2e` (rode `npm ci` lá antes). Capturas na pasta temporária do sistema. |

Resultado de referência (09/10/2026, depois da revisão independente da tela): roteiro 293 verificações, 0 falhas; 71 mutações, 71 acusadas; Edge 14 medições por largura, 0 violações.
