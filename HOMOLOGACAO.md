# 🧪 Ambiente de Homologação, Backup/Restore e Alertas (vB.1)

Executado em 2026-09-13, com acesso real à assinatura Azure (`Azure
subscription 1`, tenant `ieadespa.org.br`, resource group `ieadespa`).
Este documento agora serve de **referência do que existe** e **como
reproduzir/manter** cada peça — não é mais um runbook pendente.

---

## O que foi criado

| Recurso | Nome | Detalhe |
| --- | --- | --- |
| Banco de homologação | `ieadespa-homolog` (servidor `srv-app-sql`, brazilsouth) | Serverless GP_S_Gen5, auto-pause 60min, mesmo schema da produção (74 migrações rodadas) |
| Ambiente de homologação | PR [#1](https://github.com/IEADESPA/ieadespa/pull/1) (branch `homolog`, **não fechar**) | Ambiente de preview grátis do Static Web App (plano Standard já pago), `SQL_CONNECTION_STRING` apontada pro `ieadespa-homolog` em vez do banco de produção. URL: `https://white-grass-048208e0f-1.eastus2.6.azurestaticapps.net` |
| Application Insights | `ieadespa-appinsights` (eastus2) | Connection string configurada como `APPLICATIONINSIGHTS_CONNECTION_STRING` tanto no ambiente de produção (`default`) quanto no de homologação (`1`) |
| Grupo de ação | `ieadespa-alertas` | E-mail: `presidente@ieadespa.org` |
| Regra de alerta | `ieadespa-api-falhas` | Dispara quando `requests/failed` (Application Insights) passa de 5 numa janela de 15 min |

---

## Registro de testes de restore

| Data | Quem/o quê | Resultado |
| --- | --- | --- |
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
| --- | --- |
| Banco de homologação (Serverless, auto-pause) | ~R$ 25-100/mês (varia com uso) |
| Ambiente de preview do SWA (plano Standard já pago) | R$ 0 adicional |
| Application Insights (primeiros 5 GB/mês grátis) | ~R$ 0-15/mês neste volume |
| Alertas (Action Group + regra) | ~R$ 0 (e-mail, baixo volume) |
| Teste de restore (banco temporário, apagado em ~40min) | desprezível |
| **Total recorrente** | **~R$ 25-115/mês** |

## Custo real medido em 06/10/2026 e a causa do salto de outubro

Lido pela API de custos (Cost Management, valores em reais, antes de impostos) com login na conta da
igreja — ver "Duas contas do Azure nesta máquina", abaixo.

| Recurso | Setembro (mês cheio) | 1 a 6 de outubro |
| --- | --- | --- |
| Banco de produção (`app-db-prod`) | R$ 550,09 | **R$ 388,86** |
| Function App antigo (`func-ieadespa-api`, apagado em 04/10) | R$ 48,52 | R$ 13,52 |
| Banco de homologação (`ieadespa-homolog`) | R$ 36,66 | R$ 32,23 |
| Plano do App Service do Directus (`asp-rgportaligreja-8bf6`) | R$ 36,50 | R$ 13,15 |
| Static Web Apps (sistema + site) | R$ 19,45 | — |
| **Total** | **R$ 692,18 (≈ US$ 128)** | **R$ 447,81 em 6 dias** |

**Por dia, o banco de produção:** R$ 6,40 a 6,70 nos dias parados do fim de setembro (24 a 29/09, pausa
funcionando desde o desligamento do Automatic Tuning em 20/09); **R$ 55 a 86 por dia de 1 a 5/10**. A
métrica `app_cpu_billed` mostra o banco cobrado **24 de 24 horas desde 02/10** (29/09: 0 horas), e 4 a 17
conexões por hora de madrugada.

**Causa:** o fluxo `site-agenda-sync.yml` (criado em 01/10 com a v7.2) rodava **a cada 20 minutos, dia e
noite**, e cada execução chama `/api/agenda-publica/versao`, que consulta o banco. Com uma chamada a cada
20 minutos, o banco nunca fica os 60 minutos parado que a pausa automática exige — e passa a cobrar o mínimo
(0,5 vCore) o tempo todo. Projeção se nada mudasse: **≈ R$ 2.000 a 2.400 por mês só de banco**, quase três
vezes o teto de US$ 150.

**Correção (06/10/2026):** o fluxo passou a rodar 3 vezes por dia (7h45 junto com as rotinas diárias, 13h e
19h, horário de Brasília). Custo esperado de cada despertar do banco: ≈ R$ 2,60 (60 min a 0,5 vCore, a
≈ R$ 5,25 por vCore-hora medido). A versão sem custo nenhum — o sistema dispara o fluxo só quando a agenda
muda — está na vD.5 do plano (precisa de um token do GitHub guardado como segredo). Conferir aqui, uns dias
depois, se o banco voltou a pausar (`az monitor metrics list ... --metric app_cpu_billed`).

**Regra que fica:** qualquer rotina agendada que chame a API do sistema acorda o banco por 60 minutos. Antes
de criar um agendamento novo, somar as janelas: o custo é por despertar, não por chamada.

## Duas contas do Azure nesta máquina

Esta máquina tem duas contas do Azure: a da **igreja** (tenant `ieadespa.org.br`, usuário
`ieadespa@ieadespa.org.br`, assinatura "Azure subscription 1" com o grupo `ieadespa`) e a de **outra
associação**, usada por outro repositório. O Azure CLI guarda um login só por pasta de configuração, então o
último `az login` de uma sessão derruba o da outra. Solução adotada em 06/10/2026: este repositório usa uma
pasta própria.

```bash
export AZURE_CONFIG_DIR="$HOME/.azure-ieadespa"   # Git Bash; no PowerShell: $env:AZURE_CONFIG_DIR = "$HOME\.azure-ieadespa"
az account show                                    # deve mostrar ieadespa@ieadespa.org.br
# se expirar: az login --use-device-code --tenant ieadespa.org.br  (o código aparece no terminal, confirma-se no navegador)
```

Sem essa variável, o `az` cai na conta da outra associação e o grupo `ieadespa` "não existe".

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
| --- | --- |
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

Ambiente de homologação continuava ligado à Function App nova e funcionando —
prova de conceito válida, só não era possível replicar em produção.

> **Atualização de 04/10/2026 — a experiência foi encerrada e o aplicativo
> removido.** O responsável confirmou que a ideia (pagar ≈ US$ 10/mês para o
> servidor deixar de levar ~30 s para acordar) foi abandonada depois dos
> problemas acima. Conferido antes de apagar: o aplicativo recebeu só 13
> chamadas em 30 dias (todas de teste, a última em 01/10), nenhum site,
> fluxo ou configuração apontava para ele, e o armazenamento dele tinha só
> arquivos internos do próprio aplicativo. Foram apagados `func-ieadespa-api`,
> o armazenamento `ieadespaapifunc01`, o plano `ASP-ieadespa-c292` e o
> monitoramento `func-ieadespa-api`, e a ligação (backend) do ambiente de
> homologação foi desfeita. **Consequência:** a API da homologação
> **estava sendo atendida por esse aplicativo antigo (código de 20/09)**, não
> pela API do projeto — por isso rotas novas davam 404/comportamento antigo
> ali, e as conferências feitas na homologação até 03/10/2026 não provavam o
> código novo (a produção, conferida logo após cada deploy, é que provou).
> Desde 04/10/2026 o PR #1 volta a publicar a API do projeto (`api/`)
> também na homologação, e o código vale o que está em `homolog`. O deploy
> pelo `func azure functionapp publish` descrito antes **não existe mais**.
> O cold start de ~30 s do modo "Managed Functions" continua.
