# 🧪 Ambiente de Homologação, Backup/Restore e Alertas (vB.1)

Rode isto na máquina que **já tem acesso à conta Azure** (`az login`
funcionando). Esta sessão não tem esse acesso — por isso o runbook, não a
execução direta.

---

## 0. Descobrir os recursos existentes

```powershell
az login
az account show --output table

# Achar o Static Web App de produção e o servidor SQL
az staticwebapp list --output table
az sql server list --output table
az sql db list --resource-group <RG> --server <SQL_SERVER> --output table
```

Anote: `<RG>` (resource group), `<SQL_SERVER>` (nome do servidor, sem
`.database.windows.net`), `<SQL_DB_PRODUCAO>` (nome do banco), `<REGIAO>`
(location do resource group, ex: `brazilsouth`).

---

## 1. Ambiente de homologação — o jeito barato (recomendado)

O Azure Static Web Apps **já cria de graça** um ambiente de preview pra
cada Pull Request (é por isso que o workflow atual dispara em
`pull_request`) — mesmo domínio, sem custo de hospedagem extra. Em vez de
criar um 2º Static Web App do zero, é só apontar esse ambiente de preview
pra um banco de homologação separado:

```powershell
# 1a) Banco de homologação — Serverless com auto-pause (custo só quando ativo)
az sql db create `
  --resource-group <RG> `
  --server <SQL_SERVER> `
  --name ieadespa-homolog `
  --edition GeneralPurpose `
  --compute-model Serverless `
  --family Gen5 `
  --capacity 1 `
  --auto-pause-delay 60 `
  --backup-storage-redundancy Local

# 1b) Rodar as migrações contra o banco de homologação (mesmo runner do CI)
$env:SQL_CONNECTION_STRING = "<connection string do ieadespa-homolog>"
cd api
node scripts/executar-migracoes.js

# 1c) Popular com massa de dados fictícia — NUNCA copiar dado real de membro.
#     Ainda não existe um script de seed pronto no repo; se quiser, peço
#     numa próxima sessão pra escrever um (INSERT de congregações,
#     membros e lançamentos fictícios cobrindo os casos de teste).

# 1d) Apontar o ambiente de preview do SWA pra esse banco (NÃO mexe no de produção)
az staticwebapp appsettings set `
  --name <NOME_DO_STATIC_WEB_APP> `
  --resource-group <RG> `
  --environment-name preview `
  --setting-names SQL_CONNECTION_STRING="<connection string do ieadespa-homolog>"
```

A partir daí, toda PR aberta no GitHub já sobe testando contra o banco de
homologação, não o de produção — sem 2º Static Web App, sem custo de
hospedagem extra.

---

## 2. Backup/restore testado de verdade

Backup automático do Azure SQL já existe (incluso, sem custo extra); o
que falta é **provar que restaura**:

```powershell
# 2a) Ver a partir de quando dá pra restaurar (point-in-time restore)
az sql db show --resource-group <RG> --server <SQL_SERVER> --name <SQL_DB_PRODUCAO> --query earliestRestoreDate

# 2b) Restaurar pra um banco TEMPORÁRIO (nunca sobrescreve o de produção)
az sql db restore `
  --resource-group <RG> `
  --server <SQL_SERVER> `
  --name <SQL_DB_PRODUCAO> `
  --dest-name ieadespa-teste-restore `
  --time "<TIMESTAMP_ISO_8601>"

# 2c) Conectar no ieadespa-teste-restore e conferir: contagem de linhas nas
#     tabelas principais (MembroReferencia, LancamentosTesouraria,
#     SaidasTesouraria) bate com o esperado, dado abre sem erro.

# 2d) Apagar o banco de teste depois de validar (evita cobrar por ele à toa)
az sql db delete --resource-group <RG> --server <SQL_SERVER> --name ieadespa-teste-restore --yes
```

**Depois de rodar, registre aqui** (edite este arquivo e commit): data do
teste, quem rodou, e o resultado (restaurou limpo? quanto tempo levou?).
Isso é o "procedimento escrito de recuperação de desastre" que falta —
sem esse registro, o item continua em aberto mesmo que o comando tenha
rodado uma vez.

> **Registro de testes de restore:**
> - _(nenhum teste registrado ainda)_

---

## 3. Observabilidade mínima (Application Insights + alerta)

```powershell
# 3a) Criar o Application Insights (se ainda não existir um)
az monitor app-insights component create `
  --app ieadespa-appinsights `
  --location <REGIAO> `
  --resource-group <RG> `
  --application-type web

# 3b) Pegar a connection string e configurar como Application Setting da API
az monitor app-insights component show --app ieadespa-appinsights --resource-group <RG> --query connectionString -o tsv
az staticwebapp appsettings set `
  --name <NOME_DO_STATIC_WEB_APP> `
  --resource-group <RG> `
  --setting-names APPLICATIONINSIGHTS_CONNECTION_STRING="<connection string>"

# 3c) Grupo de ação (quem recebe o alerta)
az monitor action-group create `
  --name ieadespa-alertas `
  --resource-group <RG> `
  --short-name ieadespaAlert `
  --action email admin <EMAIL_DO_RESPONSAVEL>

# 3d) Regra de alerta: Functions começando a falhar
az monitor metrics alert create `
  --name "ieadespa-function-failures" `
  --resource-group <RG> `
  --scopes <RESOURCE_ID_DA_FUNCTION_APP> `
  --condition "count FunctionExecutionCount where ResultCode != 200 > 5" `
  --description "Alerta quando Functions começam a falhar" `
  --action ieadespa-alertas
```

`host.json` já tem `applicationInsights.samplingSettings` configurado —
só falta o Application Insights existir de verdade e a connection string
estar nas Application Settings pra ele começar a receber log.

---

## Custo estimado (recorrente, mensal)

| Recurso | Custo estimado |
|---|---|
| Banco de homologação (Serverless, auto-pause) | R$ 25–100/mês |
| Ambiente de preview do SWA (já existe, grátis) | R$ 0 |
| Application Insights (primeiros 5 GB/mês grátis) | ~R$ 0–15/mês neste volume |
| Alertas (Action Group + regra) | ~R$ 0 (e-mail, baixo volume) |
| Teste de restore (transitório, banco apagado depois) | desprezível |
| **Total** | **~R$ 30–100/mês** |
