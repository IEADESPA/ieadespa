# 07. Arquitetura Técnica

## Restrição orçamentária — o fator mais importante da arquitetura

A instituição tem acesso ao **programa Azure para organizações sem fins lucrativos**:
um crédito anual (não mensal) concedido para uso ao longo de 12 meses. Dividido pelos
12 meses, esse crédito equivale, em média, a **cerca de US$ 110/mês** — mas é um saldo
único para o ano inteiro, não uma cota que se renova mês a mês: gastar tudo logo nos
primeiros meses deixa o resto do ano sem crédito. Por isso, a decisão da instituição é
**consumir de forma conservadora, mirando bem abaixo da média (~US$ 30/mês)**, para
manter margem de segurança ao longo de todo o ano e não correr o risco de o sistema
ficar sem crédito antes do fim do período. A equipe **não tem programador próprio** —
por isso este projeto está sendo desenhado com apoio externo, o que reforça a
importância de uma arquitetura barata de operar (pouco espaço para retrabalho depois de
implementado).

Ou seja: o teto técnico real (~US$ 110/mês em média) é mais folgado do que a meta
operacional (~US$ 30/mês) que vamos usar como referência de design — a meta é
propositalmente conservadora, para deixar folga de reserva.

## Escala esperada

- ~40 congregações.
- ~9 pessoas com algum tipo de acesso por congregação (líderes locais dos 8
  departamentos + dirigente) → ~360 usuários cadastrados.
- **Planejar para ~500 usuários** com acesso ao sistema.
- O uso real tende a ser **concentrado em picos** (perto do prazo mensal de envio de
  cada departamento), não uma carga constante — o que favorece uma arquitetura paga por
  uso (serverless) em vez de servidores sempre ligados.

## Stack recomendada (ajustada ao orçamento)

| Camada | Escolha recomendada | Por quê |
|---|---|---|
| Frontend | **React + TypeScript**, hospedado em **Azure Static Web Apps (camada gratuita)** | Hospedagem de frontend estático é gratuita no Azure até um limite generoso de banda; não consome o crédito de US$ 30 |
| Backend | **Node.js + TypeScript em Azure Functions (plano de Consumo)** | Cobra por execução, não por servidor ligado 24/7 — como o uso é concentrado em picos mensais, isso é muito mais barato que um App Service sempre ativo. Tem uma cota mensal gratuita generosa |
| Banco de dados | **A definir entre Azure SQL Database (camada *serverless*, com auto-pausa) ou Azure Database for PostgreSQL Flexible Server (nível *Burstable*)** | Ambos cabem, em tese, dentro de ~US$ 30/mês para este volume de dados, mas os preços mudam com frequência — **precisa ser validado no momento da implantação**, comparando o custo real de cada opção com o crédito disponível, antes de decidir |
| ORM | **Prisma** (compatível com ambas as opções de banco acima) | Migrations versionadas, produtivo para o modelo de "formulário configurável" |
| Autenticação | **Login próprio (matrícula + senha)**, sem Microsoft Entra ID para usuários finais | Confirmado: licenciar Microsoft 365 para ~500 pessoas é inviável financeiramente |
| Armazenamento de anexos | **Não se aplica** — decisão confirmada de não ter upload de comprovantes no sistema |
| CI/CD | GitHub Actions com deploy para Azure Static Web Apps + Azure Functions | Ambos têm integração de deploy simples e gratuita a partir do GitHub |

> A recomendação de Node.js/TypeScript + PostgreSQL do desenho original **ainda se
> aplica** — o que muda aqui é o **modelo de hospedagem** (serverless/consumo em vez de
> servidor sempre ligado), para caber no orçamento.

## Princípios de arquitetura para caber no orçamento

1. **Nada de servidor "sempre ligado"** por padrão — Functions em plano de Consumo e
   banco com auto-pausa (ou nível gratuito/burstable) sempre que possível.
2. **Configuração via variáveis de ambiente** desde o início — nunca hardcoded — para
   trocar de ambiente local → Azure sem alterar código.
3. **Monitorar o consumo desde o primeiro deploy**: configurar alertas de orçamento no
   Azure (ex.: aviso em 80% do limite de US$ 30) para não haver surpresa de custo.
4. **Sem armazenamento de arquivos** (Blob Storage) — não é necessário, dado que não há
   upload de anexos.
5. **Logs estruturados**, mas com retenção curta/plano gratuito do Application Insights,
   para não gerar custo de armazenamento de telemetria.
6. **Migrations de banco versionadas** (via Prisma), reproduzíveis em qualquer ambiente.

## Estrutura de pastas sugerida (quando iniciarmos a implementação)

```
/backend         → API (Azure Functions, Node.js/TypeScript)
/frontend         → SPA (React), publicada via Azure Static Web Apps
/docs              → esta documentação conceitual
/infra             → scripts/IaC (Bicep) para provisionar os recursos Azure descritos acima
```

## Em aberto

- [ ] Levantar, no momento da implementação, o custo real e atualizado de Azure SQL
      Database serverless vs. Azure Database for PostgreSQL Flexible Server Burstable
      para o volume esperado, e escolher com base nisso.

## Resolvido

- Programa e valor do crédito Azure: nonprofit, anual, média de ~US$ 110/mês — meta de
  design conservadora fixada em ~US$ 30/mês (ver acima).
- Quem gerencia a assinatura Azure: o(a) Secretário(a) Geral / equipe própria da
  instituição.
