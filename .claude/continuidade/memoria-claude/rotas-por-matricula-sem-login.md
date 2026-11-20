---
name: rotas-por-matricula-sem-login
description: "Rotas de autoatendimento por matrícula fechadas (02/10/2026) e escopo hierárquico em todas as rotas (ehGeral/exigirGeral); o que segue em aberto e a regra para rota nova"
metadata:
  node_type: memory
  type: project
  originSessionId: b78b5f11-8f29-43b6-a1a1-18ef263a2c3b
  modified: 2026-10-03T17:05:30.867Z
---

**Fechado (02/10/2026), parte 1:** as ~15 rotas do v1.x que tratavam a **matrícula da URL como identidade** (sem checar token)
passaram a exigir sessão e só valer para a matrícula da sessão (`auth.exigirTitular`; dona OU permissão+escopo em
`shared/titular.js` para consentimento LGPD e carta PDF). O membro comum entra com **matrícula + PIN de 4 dígitos**
(`MembroEntrar`/`MembroPin`/`GestaoPinMembro`, migração 118). `RegistrarAuditoria` foi removida. Sessão de PIN/código
(`via` PIN/CODIGO) nunca vale como liderança (`exigirSessaoDeLideranca`); PIN provisório só cria o PIN.

**Fechado (02/10/2026), parte 2 — escopo hierárquico em TODAS as rotas** (decisão do responsável: dirigente só vê a
congregação dele, pastor de área as da área, e assim até o geral, que vê tudo). Base comum: `api/shared/escopoRotas.js`
(`ehGeral` = papel Global **E** escopo "TODAS"; `exigirGeral`; `noEscopoDaPessoa`; `filtrarPorEscopo`;
`congregacaoNoEscopo`; fora do escopo responde igual a "não existe"). `auth.estaNoEscopo` e `shared/escopo.js` falham
FECHADO. Catálogos: escrever só o geral, ler exige login. Documentos têm `Visibilidade` (PUBLICO/MEMBROS/LIDERANCA,
migração 121); sem login só os públicos. Migração 122 = rede de segurança (só age se ninguém for "geral" com `permissoes`).
`VerificarContaMembro` agora pede a chave combinada site↔sistema (`shared/chaveSiteSistema.js`; **falta colar a chave nos
DOIS portais do Azure**). `AUTH_SECRET` ausente: a Function se recusa a subir (`shared/segredoSessao.js`).

**Regra que ficou:** `api/shared/__tests__/rotasAnonimas.test.js` percorre o `function.json` de TODA rota e falha se
uma rota fora da lista de públicas devolver sucesso sem sessão. Rota nova pública por desenho entra nessa lista com o
motivo. Uma rota de enquetes escapou da busca por "handler sem login" porque tinha login em OUTRAS ações — por isso a
varredura é por rota, não por grep. Rota nova com dado de pessoa/congregação: escopo pelo `escopoRotas`, nunca só
`exigirPermissao`.

**Fecho (03/10/2026, no ar):** TODA rota HTTP entra por `api/shared/entrada.js` (`scriptFile` em cada function.json; teste
`entradaUnica.test.js`): relê a lista de sessões encerradas (`SessoesAtivas.Encerrada`) a cada ≤3 s, 503 se não confiável;
`auth.revogarSessoesDoMembro/revogarTodasAsSessoes` nos eventos (cargo, delegação, senha, PIN, vacância, renomear congregação).
O crachá tem `concessoes` (cargo próprio + delegações, com `ate`); `exigirPermissao` etc. devolvem uma VISÃO só com as
concessões da permissão — nunca ler `usuario.permissoes` direto, usar `auth.visaoDaPermissao`. Front: `argJs`/`urlSegura`/
`escaparHtmlEbd` e o teste `frontEscape.test.js` (analisador de árvore) falha se surgir interpolação em HTML sem proteção.
Índices únicos só nascem sem repetição (migrações 124, 127–131, 139; o deploy imprime AVISO com contagem; no 1º deploy não
houve aviso = produção sem repetição). Mediação: aceite só por ato da parte; abandono: dois olhos; remessa/retorno usam
`shared/conferenciaPagamento.js`. Lista completa e limites honestos: docs/plano/fase-7 "Fecho dos itens em aberto".

**Só depende de gente:** colar `CHAVE_SITE_SISTEMA` nos DOIS apps do Azure (SECRETS.md §9); PIN: 5 erros bloqueiam 15 min
(aceito); CNAB nunca homologado com banco real (constantes `OFFSET_*` em `cnab240.js`); protocolos de ouvidoria antigos têm
só 16 bits aleatórios (não dá para reemitir). CSP forte é o próximo (~870 handlers `on*=` em linha; custo = esforço/risco).

**Why:** repositório público + produção no ar; quem enumerasse matrículas lia/editava dado de membros. O responsável
(leigo em programação) pediu "senha de 4 dígitos como banco" e depois o escopo hierárquico em tudo, e deixou o CSP forte
para depois dessas correções.

**How to apply:** ao criar/alterar rota de autoatendimento, usar `exigirTitular`/`exigirSessaoDeLideranca` e rodar a
varredura; 401/403 iguais para matrícula existente e inexistente; trocar `fetch` do front por `fetchProtegido`. Depois de
cada deploy, `scratchpad/verif-producao.js`-style: rotas protegidas 401 sem sessão, nenhuma 5xx. Ver
[[azure-swa-fatos-medidos]] e [[verificacao-e2e-localdb]].
