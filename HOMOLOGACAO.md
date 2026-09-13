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
