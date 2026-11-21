---
name: testar-sql-na-homologacao
description: "Como exercitar SQL/rotas das Functions com segurança neste projeto (banco ieadespa-homolog), porque o local.settings.json aponta para produção"
metadata:
  node_type: memory
  type: reference
  originSessionId: 36edf0f4-eb01-49ee-92ef-b50648e3316e
  modified: 2026-10-01T12:35:46.808Z
---

O `api/local.settings.json` tem `SQL_CONNECTION_STRING` apontando para **produção** (`app-db-prod`, servidor `srv-app-sql.database.windows.net`). Testes unitários (`npx jest` em `api/`) só cobrem lógica pura — o SQL das funções de banco e as constraints das migrações nunca rodam neles.

Para exercitar SQL de verdade sem tocar em produção: o mesmo servidor tem o banco de homologação **`ieadespa-homolog`** (vazio de dado real, ver `HOMOLOGACAO.md`). O login da string local alcança esse banco trocando só o `Initial Catalog` — foi assim em 30/09/2026 (v6.8). Receita que funcionou:

- Script descartável na pasta scratchpad (nunca versionar): lê o `local.settings.json` dentro do Node, troca o nome do banco, **trava** se o banco conectado não for `ieadespa-homolog`, e nunca imprime segredo.
- Aplicar migrações: definir `process.env.SQL_CONNECTION_STRING` (homolog) e dar `require` em `api/scripts/executar-migracoes.js`. Idempotente; a homolog estava atrasada (sem as tabelas EBD) até ser migrada.
- Rodar os módulos reais de `api/shared/` e os handlers reais (`require("api/GestaoX/index.js")`) com `context = { bindingData: { acao }, log }` e `req = { method, query, body, headers: { "x-auth-token": token } }`; o token se assina com `auth.reassinarSessao({ membroId, permissoes, escopoCongregacoes })` depois de definir `process.env.AUTH_SECRET` com um segredo só do teste.
- A homolog não tem Congregações/Áreas: o script cria as suas (nomes com sufixo da execução) e apaga no fim. `AuditLog` é append-only e fica. Membros fictícios podem ficar presos por FK em `ConquistasDesbloqueadas`/`ConquistasEventos` — apagar essas linhas antes.
- Front: extrair funções de `app/script.js` por casamento de chaves e rodar em `vm` com `document.getElementById` simulado e `fetchProtegido` devolvendo o JSON exato da API (pega `undefined`, XSS, corpo de requisição errado).

Armadilhas que já custaram tempo (v6.8/v6.9):

- `MembroReferencia.MembroId` **não é IDENTITY**: o roteiro calcula `MAX(MembroId)+1` e insere o id. `Papeis` exige `Nivel`; `Congregacoes`/`Areas` só `Nome`.
- Arquivos do repositório (testes, `script.js`) têm quebra de linha **CRLF** no disco: substituição de texto multilinha via `node -e` não casa — usar a ferramenta Edit, que lida com isso (o `README.md` é LF).
- Não usar `python3 - <<EOF || node -e ...` em Bash: travou 2 min e virou tarefa em segundo plano. Script longo → escrever em arquivo no scratchpad e rodar com `node arquivo.js`; heredoc longo com aspas também quebra o shell.
- `sleep` em primeiro plano é bloqueado no Bash; não há como esperar deploy com sleep — `gh run watch` já espera.
- Limpeza da homologação: membros fictícios ficam presos por FK (`ConquistasDesbloqueadas`, `CertificadosEmitidos.EmitidoPorMembroId`...) — varrer as FKs de `MembroReferencia` (menos `Audit*`) em 2-3 passadas antes de apagar, e apagar membros ANTES de congregações/áreas.
- O shell Bash desta máquina **come `\\`** (vira `\`) até dentro de aspas simples e heredoc: regex como `\\s` em `node -e` ou `cat <<'EOF'` sai `s`. Script ou edição com barra invertida → escrever com a ferramenta Write/Edit, nunca pelo shell (custou um bug silencioso na Trava 6-B).
- A auditoria é fail-soft: falha de `registrarAuditoria` só aparece como `[AUDITORIA] falha ao gravar` no console. Contar essas linhas na saída do roteiro da homologação — foi assim que a Trava 6-B achou `RegistroId` nulo em toda linha nova da EBD (a coluna é NOT NULL).
- Migrar a homologação: rodar `api/scripts/executar-migracoes.js` via `spawnSync` com o `env` já trocado para o homolog e filtrar a saída (só nomes de arquivo e resultado).
- Verificação pós-deploy em produção: só leitura e sem sessão (`curl` → 401 nas rotas protegidas; nunca 404) — `{*acao}` chamado sem segmento nenhum não é confiável, por isso as rotas novas têm sempre um nome de ação.

**Plano B quando a homologação recusa o IP (aconteceu em 01/10/2026, v7.1; IP dinâmico, a regra de firewall de 30/09 não valia mais):** há **SQL Server 2019 LocalDB** instalado (`sqllocaldb`). Receita que funcionou, tudo no scratchpad, nada no repo:

- `sqllocaldb create psc7` + `start psc7`; banco criado e **todas as migrações aplicadas por PowerShell** (`System.Data.SqlClient`, `Server=(localdb)\psc7`, dividindo o arquivo em batches por linha só com `GO`). As 113 migrações passam sem ajuste. A instância **morre sozinha** de vez em quando ("Running" mas sem conexão): `sqllocaldb stop psc7 -k` e `start` resolvem.
- O driver Node não conecta no LocalDB: `msnodesqlv8` não tem binário para Node 22 e exige compilar. Solução: um **shim do módulo `mssql`** (`Module._load` devolvendo um objeto com `connect/Request/Transaction/tipos`) que fala por stdin/stdout com um `.ps1` mantendo uma conexão .NET aberta. Assim os **handlers reais** (`require("api/GestaoX/index.js")`) e o SQL real rodam. Pegadinhas do `.ps1`: `$dict.BaseObject` em `Dictionary` vira busca de chave (usar `$v.psobject.BaseObject`); `JavaScriptSerializer` quebra com valores embrulhados em PSObject (serializar à mão); depois de **qualquer** erro de SQL reciclar a conexão (`Close`/`Open`), senão o próximo comando falha com "já existe um DataReader aberto".
- Não precisa de limpeza: o banco é descartável; só reiniciar o parâmetro que o roteiro mexeu se for rodar de novo.

Limites: o `az` logado na máquina fica em **outra assinatura** (vê só `Associacao-RG`, não o grupo `ieadespa`) — não dá para listar bancos nem mexer em firewall por ele; não trocar de conta sem pedir. Não abrir regra de firewall sem perguntar.

Por que importa: a Trava 6-A (README) achou que metade das ações da EBD nunca tinha funcionado em produção mesmo com todos os testes verdes; verificar rota ao vivo (`401` sem sessão, não `404`) + SQL na homolog evita repetir.
