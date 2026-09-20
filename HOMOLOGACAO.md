# 🧪 Ambiente de Homologação, Backup/Restore e Alertas (vB.1)

Executado em 2026-09-13, com acesso real à assinatura Azure (`Azure
subscription 1`, tenant `ieadespa.org.br`, resource group `ieadespa`).
Este documento agora serve de **referência do que existe** e **como
reproduzir/manter** cada peça — não é mais um runbook pendente.

---

## O que foi criado

| Recurso | Nome | Detalhe |
|---|---|---|
| Banco de homologação | `ieadespa-homolog` (servidor `srv-app-sql`, brazilsouth) | Serverless GP_S_Gen5, auto-pause 60min, mesmo schema da produção (74 migrações rodadas) |
| Ambiente de homologação | PR [#1](https://github.com/IEADESPA/ieadespa/pull/1) (branch `homolog`, **não fechar**) | Ambiente de preview grátis do Static Web App (plano Standard já pago), `SQL_CONNECTION_STRING` apontada pro `ieadespa-homolog` em vez do banco de produção. URL: `https://white-grass-048208e0f-1.eastus2.6.azurestaticapps.net` |
| Application Insights | `ieadespa-appinsights` (eastus2) | Connection string configurada como `APPLICATIONINSIGHTS_CONNECTION_STRING` tanto no ambiente de produção (`default`) quanto no de homologação (`1`) |
| Grupo de ação | `ieadespa-alertas` | E-mail: `presidente@ieadespa.org` |
| Regra de alerta | `ieadespa-api-falhas` | Dispara quando `requests/failed` (Application Insights) passa de 5 numa janela de 15 min |

---

## Registro de testes de restore

| Data | Quem/o quê | Resultado |
|---|---|---|
| 2026-09-13 | Sessão Claude Code, restore de `app-db-prod` para `ieadespa-teste-restore` (point-in-time, ~10min atrás) | ✅ Restaurou limpo. Contagem de linhas nas tabelas-chave (`MembroReferencia`, `Congregacoes`, `LancamentosTesouraria`, `SaidasTesouraria`, `Doacoes`, `ReceitasAcessorias`) bateu exatamente com a produção. Banco de teste apagado logo depois (evita cobrança). Levou ~35-40 minutos do pedido de restore até o banco ficar `Online` — planeje esse tempo numa recuperação de desastre real. |

Pra rodar de novo (ex.: auditoria periódica, ou treino de recuperação de
desastre):

```powershell
az sql db show --resource-group ieadespa --server srv-app-sql --name app-db-prod --query earliestRestoreDate

az sql db restore `
  --resource-group ieadespa --server srv-app-sql --name app-db-prod `
  --dest-name ieadespa-teste-restore --time "<TIMESTAMP_ISO_8601>"

# validar (contagem de linhas, abrir o app apontando pra ele) e então:
az sql db delete --resource-group ieadespa --server srv-app-sql --name ieadespa-teste-restore --yes
```

**Registre aqui** (nova linha na tabela acima) toda vez que rodar de novo.

---

## Manutenção do ambiente de homologação

- **Não feche nem dê merge no PR #1** — o ambiente de preview é destruído
  junto. Se isso acontecer sem querer, reabra um PR do branch `homolog`
  (ou de outro) e reconfigure:
  ```powershell
  az staticwebapp environment list --name app-meusite-web --output table
  az staticwebapp appsettings set --name app-meusite-web --resource-group ieadespa `
    --environment-name <NOME_DO_AMBIENTE> `
    --setting-names "SQL_CONNECTION_STRING=<connection string do ieadespa-homolog>"
  ```
- **Massa de dados fictícia**: o `ieadespa-homolog` hoje tem o mesmo
  schema da produção, mas nasceu vazio (só rodou as migrações, não uma
  cópia de dado real — não copiamos dado de membro de propósito). Ainda
  não existe um script de seed com dados fictícios; peça numa próxima
  sessão pra escrever um, cobrindo os casos de teste que a vB.1 pedia
  (`calcularFechamento`, alçadas, etc.) sem depender de dado real.

---

## Custo real observado

Mesma estimativa de antes se confirmou na prática — nada surpreendeu:

| Recurso | Custo |
|---|---|
| Banco de homologação (Serverless, auto-pause) | ~R$ 25-100/mês (varia com uso) |
| Ambiente de preview do SWA (plano Standard já pago) | R$ 0 adicional |
| Application Insights (primeiros 5 GB/mês grátis) | ~R$ 0-15/mês neste volume |
| Alertas (Action Group + regra) | ~R$ 0 (e-mail, baixo volume) |
| Teste de restore (banco temporário, apagado em ~40min) | desprezível |
| **Total recorrente** | **~R$ 25-115/mês** |

---

## Investigação de lentidão e custo (2026-09-20)

Usuário relatou login demorando 10-15s e pediu análise de custo total (teto de
US$150/mês). Investigação com acesso real à assinatura Azure — achados e ações:

### Achado 1 — banco de produção nunca pausava

`az monitor metrics list` no `app-db-prod` mostrou **72/72 horas com dado nas
últimas 72h** — o banco (Serverless, auto-pause configurado pra 60min) nunca
pausou de verdade. Consulta direta ao `sys.dm_exec_sessions` identificou a
causa: conexões internas do próprio Azure (`AutomaticTuningAgent`,
`BackupService`, `MetricsDownloader`, `DmvCollector`) reconectando a cada poucos
minutos, 24h — achado confirmado como comportamento conhecido do Azure
(Automatic Tuning está na lista oficial de recursos que impedem auto-pause).

**Ação**: Automatic Tuning desligado a nível de servidor (`srv-app-sql`,
`forceLastGoodPlan`/`createIndex`/`dropIndex`/`maintainIndex` → `Off`). Recurso
só de performance, sem relação com segurança/LGPD (Auditoria e Threat
Detection já estavam desligados antes, confirmado, não afetados). Reversível a
qualquer momento no Portal Azure. Efeito real (banco voltando a pausar de
madrugada) ainda precisa ser confirmado depois de algumas horas/dias de
observação.

**Custo real (Cost Management API, mês corrente até 19/09, projetado):**

| Recurso | Projeção mensal |
|---|---|
| Banco de produção (`app-db-prod`) | ≈ US$ 118 |
| Banco de homologação | ≈ US$ 4 |
| Site institucional + Directus | ≈ US$ 3 |
| Site principal (SWA + API) | ≈ US$ 3 |
| **Total (antes desta investigação)** | **≈ US$ 128 de US$ 150** |

### Achado 2 — cold start de 15-30s é do modo "Managed Functions", não do código

O site usa o modo **Managed Functions** do Azure Static Web Apps
(`api_location: "api"` no workflow) — modo com cold start **documentado pela
Microsoft em 15-30s**, sem configuração pra mitigar. Confirmado com medição real
(3,6-8,8s em vários testes ao vivo).

**Ação**: criada Function App separada `func-ieadespa-api` (Flex Consumption, 1
instância sempre pronta ["Always Ready"], Brazil South — mesma região do SQL),
modelo "Bring Your Own Functions". Testada em **homologação** (ambiente PR #1):
login e mais 5 módulos diferentes, 0,6-0,9s via proxy do site / 0,2-0,4s direto
na Function App — contra vários segundos do modo anterior. Custo estimado: ≈
US$ 10/mês (dentro do orçamento).

Removido `api_location` do workflow de produção
(`.github/workflows/azure-static-web-apps-white-grass-048208e0f.yml`, 20/09
03:55 UTC) e deployado limpo. Ligação do backend novo em produção falhou —
Azure recusa com `Cannot link backend with a preexisting Azure Static Web
Apps configuration` mesmo depois da limpeza — bug conhecido, sem solução
documentada (issue aberta em `Azure/static-web-apps#1197` e `#1540`, sem
resposta da Microsoft).

**Incidente real (correção do registro anterior)**: logo após remover
`api_location`, produção testada ao vivo respondia 200 normalmente — mas isso
era o runtime antigo do Managed Functions ainda quente/residual, não uma
confirmação de que continuaria funcionando. Sem `api_location` no deploy E sem
backend novo linkado, produção ficou **sem nenhuma API funcionando por ~14h**
(`api/auth/login` → 500 "Backend call failure", achado só ao retomar a
sessão às 18:04 UTC). Restaurado imediatamente: `api_location: "api"` de volta
no workflow (commit `f2d5844`, deploy 18:10 UTC), produção confirmada saudável
de novo em minutos. Lição registrada: **nunca remover a configuração antiga
antes de confirmar que a nova está realmente linkada e servindo tráfego** —
o passo devia ter sido feito na ordem inversa (link primeiro, remoção depois),
ou com um período de monitoramento ativo entre os dois, não deixado
"pendente" sem alguém observando. Ambiente de homologação continua ligado à
Function App nova (prova de conceito ainda válida); produção segue no modo
antigo (mais lento, mas funcional) até o bug do Azure ser contornado.

**2ª tentativa (20/09, mesma sessão, a pedido do usuário) — mesmo resultado,
mais evidência de que é do lado do Azure**: achado real antes de tentar de
novo: a doc oficial da Microsoft (`functions-bring-your-own`) exige
`api_location: ""` (string vazia) pra desligar Managed Functions de verdade —
a 1ª tentativa tinha REMOVIDO a linha inteira, o que não é a mesma coisa.
Corrigido (commit `b628116`, deploy 18:44-18:48 UTC), testado — mesmo assim o
link falhou com o **mesmo erro exato** (`Cannot link backend with a
preexisting Azure Static Web Apps configuration`). Produção ficou sem API de
novo (`api/auth/login` → 500) entre ~18:48 e ~20:51 UTC (**quase 2h** — mais
longo do que deveria, o teste de saúde não foi repetido com frequência
suficiente depois do deploy). Revertido de novo (commit `772a8b7`, deploy
20:51-20:56 UTC), produção confirmada saudável.

**Conclusão desta 2ª tentativa**: usando a configuração EXATA que a
documentação oficial da Microsoft pede pra esse cenário, o Azure recusou com
o mesmo erro — isso descarta erro de configuração deste lado como causa. É
comportamento da própria plataforma Azure Static Web Apps nesta conta/nesta
combinação específica de recursos, consistente com as issues abertas e sem
resposta (`Azure/static-web-apps#1197`, `#1540`). **Não tentar de novo contra
produção sem um caminho genuinamente diferente** (ex: abrir chamado oficial
de suporte Azure citando as issues, ou recriar o Static Web App do zero já
com o backend linkado antes de qualquer deploy — ambos fora do escopo de
"tentar de novo" simples). Cada tentativa tem custo real: a 1ª deixou
produção ~14h fora do ar, a 2ª ~2h.

Ambiente de homologação continua ligado à Function App nova e funcionando —
prova de conceito válida, só não é possível replicar em produção por ora.

**Deploy do código da API mudou**: agora é `func azure functionapp publish
func-ieadespa-api` (de dentro de `api/`), não mais o workflow de CI/CD — hoje
isso só afeta `func-ieadespa-api` diretamente (não usado por produção).
