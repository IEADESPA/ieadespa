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
| Ambiente de homologação | PR [#21](https://github.com/IEADESPA/ieadespa/pull/21) (branch `homolog`, **não fechar nem mesclar**; substituiu o #1 em 07/10/2026) | Ambiente de preview grátis do Static Web App (plano Standard já pago), `SQL_CONNECTION_STRING` apontada pro `ieadespa-homolog` em vez do banco de produção. URL: `https://white-grass-048208e0f-21.eastus2.6.azurestaticapps.net` (o número depois do nome é o do PR: era `-1` no PR antigo) |
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

- **Não feche nem dê merge no PR da homologação** (hoje o #21) — o ambiente de
  preview é destruído junto. O #1 foi fechado **pelo próprio GitHub** em
  07/10/2026: a `main` recebeu um merge do `homolog`, a ponta do ramo passou a
  estar na `main`, o PR virou "mesclado" e o ambiente sumiu. Regra desde então:
  a `main` recebe o **ramo da mudança**, nunca o `homolog`; o `homolog` recebe a
  `main` por merge (`git checkout homolog && git merge main && git push`); e o
  arquivo `RAMO-HOMOLOG.txt` existe só no `homolog`. Se acontecer de novo,
  reabra um PR do branch `homolog` (ou de outro) e reconfigure:

  ```powershell
  az staticwebapp environment list --name app-meusite-web --output table
  az staticwebapp appsettings set --name app-meusite-web --resource-group ieadespa `
    --environment-name <NOME_DO_AMBIENTE> `
    --setting-names "SQL_CONNECTION_STRING=<connection string do ieadespa-homolog>"
  ```

- **Massa de dados fictícia** (vD.3, 07/10/2026): o `ieadespa-homolog` tem o mesmo
  schema da produção (o PR #1 migra **ele**, não a produção, desde 06/10) e recebe a
  massa fictícia de `api/scripts/semear-homologacao.js` logo depois das migrações, a
  cada montagem do PR: 1 área, 3 congregações "Fictícia - Alfa/Beta/Gama", 60 pessoas
  (matrículas 900001 a 900060), 20 dizimistas e lideranças com senha padrão do script
  (dirigente e tesoureiro de cada congregação = 1º e 2º adulto dela; pastor de área =
  3º adulto da Alfa, matrícula 900007; **secretário geral** — o único login de nível
  geral, 4º adulto da Alfa, matrícula 900013, sem e-mail como o pastor — desde a v7.6,
  porque as abas Setores Técnicos e Vistoria de Antecedentes só existem para o nível
  geral; e, desde a v7.7, com as permissões das escalas e da habilitação). A Alfa tem
  ainda um **Ministério Infantil fictício** (equipe com contato com menores) com cinco
  voluntários, cada um numa situação — dois em dia, um com a certidão vencida, um sem o
  treinamento e um sem a política aceita —, para abrir o painel de conformidade. Nunca copiamos dado de membro real; o script se recusa a rodar
  fora de um banco com "homolog" no nome.

## Massa grande (v10.1, 11 e 12/11/2026)

Uma igreja grande inteira, inventada, para o raio-x rodar sobre volume de verdade e
para "entrar como" cada papel: `api/scripts/semear-homologacao-grande.js`. **Não**
roda sozinho no fluxo do PR (o semeador pequeno continua lá); roda-se à mão, uma vez.

```bash
# na homologação (a conexão do ieadespa-homolog; a trava recusa qualquer outro banco)
cd api && SQL_CONNECTION_STRING="<conexão do ieadespa-homolog>" node scripts/semear-homologacao-grande.js
# prova no LocalDB do equipamento (tools/e2e-localdb), nunca no Azure
cd tools/e2e-localdb && E2E_LOCALDB=1 node -r ./shim-mssql.js ../../api/scripts/semear-homologacao-grande.js
```

- **Uma história, não ruído:** cada congregação cresce, fica estável ou cai no seu
  ritmo (admissões, saídas, ofertas e dízimos acompanham), dezembro forte (13º),
  janeiro e julho fracos, e ~5% das pessoas se afastam aos poucos — presença na EBD,
  dízimo e escala minguando, ainda ativas no cadastro (o padrão do alerta de evasão
  da v10.12).
- **O que cria** (semente e data-base padrão; cada item é uma etapa de
  `--etapas=`): `territorio` — 2 cidades, 3 Regiões, 9 Áreas, 45 Congregações
  (com a Sede), 2 Quadrantes, 1 Distrito (a região metropolitana na capital), 10
  Extensões, 48 Bairros e os órgãos automáticos; `membros` — 5.047 pessoas em
  famílias (4.563 vínculos), com situação, batismo, admissão, endereço e cargo pela
  escada; `lideranca` — 104 logins e os assentos da Diretoria e do Conselho Fiscal;
  `reunioes` — 36 reuniões da CLI e 473 da JAI, com 4.428 presenças; `financeiro` —
  36 meses: 68.709 lançamentos, 1.620 fechamentos (o Distrito do repasse gravado desde
  o decreto), 1.620 conciliações PIX, 8.118 saídas; `prestacoes` — 1.579 prestações
  de contas (224 com Ata de Pendência, 41 meses faltando); `distritos` — o decreto
  da CLI, 19 meses de Dízimo Institucional e o balanço de 2025 (devolvido e aprovado
  pelo Conselho Fiscal); `relatorios` — 5.146 relatórios de departamento em 18 meses
  (1.021 atrasados, 380 faltando, rascunhos parados), com valores e trilha de
  aprovação; `psc` — a avaliação do exercício de cada congregação (nível calculado
  por `shared/psc.js`); `ebd` — um ano de aulas (325 turmas, 2.449 alunos, 131.609
  chamadas); `escalas` — 30 domingos (158 equipes, 10.694 convites).
- **Logins de teste** (a senha do semeador pequeno, ou `SEED_SENHA`; sem e-mail,
  entram só com a senha): Presidente 700001, Secretário Geral 700002, Tesouraria
  Geral 700003, Superintendentes Regionais 700011 a 700013, Pastores de Área 700021
  a 700029, Pastor Distrital 700031, Tesoureiro de Distrito 700032, Vice-Presidentes
  de Quadrante 700035 e 700036, Dirigente da congregação *k* = 700100 + *k* e
  Tesoureiro Local = 700200 + *k* (*k* = 1 é a Sede). No primeiro acesso cada um
  assina os termos, como qualquer liderança.
- **Refazível:** rodar de novo só completa o que falta (nada duplica);
  `--apagar` tira só o que o gerador cria — matrículas 700000 a 799999, nomes
  terminados em " (Fictícia)"/" (Fictício)", CNPJ `99.999.999/…` — e os rastros do
  login dessas matrículas, numa transação. Se o app foi usado com essas pessoas fora
  das peças fictícias (um casamento, um aluno noutra congregação...), recusa inteiro e
  diz a tabela; o `AuditLog` fica.
- **Opções:** `--contar`, `--etapas=...`, `--semente=N` (a mesma semente gera a
  mesma massa), `--data-base=AAAA-MM-DD` (padrão 2026-11-08; para atualizar a data,
  `--apagar` e rodar de novo), `--membros=N`, `--meses=N` (padrão 36),
  `--ebd-domingos=N` (padrão 52).
- **Medido no LocalDB:** criar tudo ~3,5 min; rodar por cima ~8 s; `--apagar`
  ~2,5 min (quase tudo na remoção das pessoas, que confere ~400 chaves
  estrangeiras). No banco serverless da homologação conte alguns minutos a mais.
- **Segunda leva (12/11/2026, por ordem do responsável: tudo entra):** `calendario`
  — 4 anos do calendário oficial (1.297 eventos com o ciclo da CLI e da Ceia,
  presenças dos dirigentes, organizadores, convidados e 128 caixas de evento; nada
  vai ao site); `cuidado` — 313 pedidos de oração (com o mural do site), 654 itens
  da fila, 2.473 eventos, 224 notas pastorais. A massa usa a categoria
  `OFERTA_CULTO_DEPARTAMENTO` quando a coluna já tem 30 letras (migração 172).
- **O que fica para sempre (o banco proíbe apagar):** itens e eventos do cuidado
  pastoral, os pedidos de oração, a segurança das congregações (planos, simulados,
  vistorias e itens, equipe), os Setores Técnicos (vínculos e adesões) e as adesões
  ao Termo do Voluntário. O `--apagar` não falha por eles: deixa essas linhas e as
  peças fictícias de que dependem (cerca de 1.600 pessoas, as congregações, Áreas,
  Regiões, Quadrantes, o Distrito, os Bairros e as Extensões), e o ano do
  calendário em planejamento que a massa criou. Rodar de novo recria o resto por
  cima, sem duplicar.
- **Parte 2 (mesmo dia):** `missoes` — 6 campos, 8 envios em todas as etapas, sustento
  com reajuste e o mês gerado no Contas a Pagar; `expansao` — 6 pedidos (uma
  Extensão e uma congregação criadas pela CLI); `entidades` — as Assembleias Gerais
  de março e 5 entidades vinculadas com dirigentes, prestações e uma intervenção;
  `ministerio` — 8.817 marcos, 2.015 credenciais, 856 matrículas da AFM, seminário
  (12 disciplinas, 24 turmas, 2.068 notas), o exame bienal e 25 consagrações. A
  reciclagem anual não entra: uma edição do ano passado deixaria pendentes também os
  oficiais reais da homologação.
  A AFM conta só a matrícula com nível de escolaridade: a matrícula AUTOMÁTICA que o
  app cria sozinho nasce sem ele, e a massa a completa pelo cargo (era o "0
  matrículas" do log da parte 2: elas já existiam, sem nível).
- **Parte 3:** `seguranca` — plano de segurança das 45 congregações (73 versões),
  49 simulados, 39 vistorias com os 10 itens, 173 na equipe, o templo como imóvel
  com AVCB (vigente, a vencer ou vencido) e parte com seguro; 34 profissionais nos
  Setores Técnicos (25 com a adesão por ficha); `consentimentos` — só dos membros
  (700300 em diante; os logins de liderança de teste continuam pedindo os termos no
  primeiro acesso): 2.886 de LGPD, 2.910 de comunicação por e-mail (ficha de papel)
  e 936 adesões ao Termo do Voluntário de quem serve nas escalas.
- **Parte 4:** `enquetes` — 6 votações (contas de cada exercício e a reforma da
  Sede nas Assembleias Gerais, com o resultado apurado como o app apura; duas
  consultas aos membros, uma aberta) e ~5.900 respostas; `campanhas` — a campanha
  ativa com metas e ofertas no mês aberto e uma encerrada, ~110 doações (recibo
  `REC-FICT-…`, fora da numeração `DOA-ano` do app), contas a receber previstas e
  canceladas, ~47 cessões de templo (a autorizada com taxa nasce com a conta a
  receber e a receita acessória) e os orçamentos de 2025 e 2026 (o realizado do
  ano anterior com acréscimo).
- **Parte 5:** `comunicacao` — 6 modelos (aprovados, um arquivado, um rascunho) e 13
  envios **já terminados** (um cancelado) com ~16.600 entregas em situação final
  por canal, calculada como o app calcula. Nada é enviado: nenhum envio na fila,
  nenhuma entrega pendente (a fila que roda junto de um envio feito na tela não acha
  nada da massa) e nada no sininho de verdade (`Notificacoes`). `conquistas` — cada
  presença ou falta da EBD vira o evento do app (~127 mil) e as conquistas são
  reavaliadas domingo a domingo pelas funções do próprio motor (~5.650
  desbloqueios: Primeira Presença, Sequência de Ouro, Trimestre Perfeito). Com as
  partes 3 a 5, criar tudo no LocalDB passou a ~5 min (as conquistas levam ~2 min).
- **Ainda fora (próxima leva):** proteção e incidentes, crise e porta-voz, ministério
  com menores e check-in infantil, identidade visual — em todos eles o banco tem
  gatilho que impede apagar quase toda tabela, então cada linha fictícia ficaria
  para sempre (decidir antes quanto entra); e prebenda (o cadastro exige CPF único:
  só entra com CPF de dígito verificador impossível, nunca inventado ao acaso). A
  conciliação do PIX já vem com o financeiro; a conciliação bancária (extrato)
  ainda não.
  Turmas da EBD e equipes das escalas nascem sem a marca "com menores", como na
  tela. E-mails só em `@example.org` (domínio reservado) e telefones com DDD (00).
- **Permissões:** a massa não mexe em papel. `ebd_gestao` e `escalas` não vêm nos
  papéis das migrações; na homologação o semeador pequeno as acrescenta.

## O que a homologação prova — e o que não prova (vD.3, 07/10/2026)

**Prova, a cada push no `homolog`:**

- que o **código do commit** sobe no Azure de verdade (front e API publicados pelo
  mesmo fluxo da produção) e que **toda rota responde** — a varredura de rotas
  (`api/scripts/varrer-rotas.js`, passo do fluxo) chama as 200+ Functions sem
  sessão e acusa 404 do Static Web App ou 5xx (módulo que não carregou), e
  confere que o `index.html` publicado carrega todos os módulos do repositório;
- que o **esquema do banco** é o do commit (migrações rodam no `ieadespa-homolog`)
  e que há **massa fictícia** para abrir as telas (seed idempotente);
- que **toda tela se comporta como a linha de base** (teste de tela da vD.1 roda
  no `homolog` antes da `main`: 962 ações no modo rápido, zero divergência);
- que uma tela escolhida **abre com a API real e a massa fictícia** quando se
  roda `tools/modularizar/prova-modulo.js` contra o endereço (login dos fictícios).

**Não prova:**

- **configuração de ambiente**: o preview nasce com uma CÓPIA das configurações
  de produção (inclusive a conexão SQL, apontada à mão para o `ieadespa-homolog`
  em 07/10 — conferir sempre que o ambiente for recriado) e **compartilha** o
  Directus, o ACS (e-mail) e o Storage de produção: um teste que dispara e-mail
  ou publica no site faz isso de verdade;
- **desempenho e custo**: o banco de homologação é menor e dorme; tempo de
  resposta e consumo de DTU/segundos não valem para a produção;
- **o domínio**: cabeçalhos e CSP são conferidos no host do preview, não em
  `app.ieadespa.org.br` (mesmo Static Web App, mesmas regras — mas a prova
  final em produção continua sendo a varredura pós-deploy da `main`);
- **dado real**: não há membro real na homologação, de propósito — regras que
  dependem de volume (relatórios, fechamentos de mês) só são vistas de verdade
  em produção.

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
≈ R$ 5,25 por vCore-hora medido).

**Desenho definitivo (vD.5, 07/10/2026):** a versão da agenda pública fica guardada **fora do banco**, num
blob privado do Storage (`shared/agendaPublicaVersao.js`). O próprio sistema a regrava quando alguém mexe no
calendário, nos canais ou nos eventos (o banco já estava acordado para a mudança) e a rotina diária das 7h a
regrava por garantia. `GET /api/agenda-publica/versao` responde pelo blob, sem abrir o banco — por isso o
sincronizador voltou a rodar **a cada 15 minutos** com zero despertar: evento publicado aparece no site em
até ~15 min e o banco pausa como deve. Sem token pessoal do GitHub. Conferir uns dias depois se o banco
voltou a pausar (`az monitor metrics list ... --metric app_cpu_billed`).

**Regra que fica:** qualquer rotina agendada que chame a API do sistema acorda o banco por 60 minutos. Antes
de criar um agendamento novo, somar as janelas: o custo é por despertar, não por chamada.

## Homologação do site institucional (desde 06/10/2026)

O site não tinha ambiente de homologação: toda mudança ia direto para `www.ieadespa.org.br`. Agora:

| Peça | O que é |
| --- | --- |
| **Um pull request por mudança** (branch `site/<tema>` → PR → merge) | A montagem do PR cria o ambiente de pré-visualização `<nº do PR>` do Static Web App `site-institucional` (grátis no plano Standard): `https://salmon-bay-0efd06d0f-<nº>.eastus2.3.azurestaticapps.net`. Ele **herda as configurações da produção** e é destruído quando o PR fecha. *Lição de 06/10:* um PR "permanente" (tipo o #1 do sistema) não serve para o site — qualquer merge dos commits dele o marca como mesclado e o ambiente some (aconteceu com o PR #18). |
| CORS do Directus | O painel administrativo chama o Directus pelo navegador; `CORS_ORIGIN` só tem a produção, então **o painel só é testado na produção** (teste de ponta a ponta com massa descartável, `scratchpad/painel-e2e.js`); a API pública é testada na pré-visualização. |
| Testes automáticos | `.github/workflows/site-testes.yml` roda `site/scripts/testes/` (camisetas e eventos) depois de cada montagem: contra a pré-visualização de qualquer PR aberto, contra a produção quando é na `main`. Resultado no resumo do run. |
| Teste do painel (à mão) | `scratchpad/painel-e2e.js` (Edge sem janela, puppeteer-core): login, filtros, exportação, troca de lote e renovação da sessão, com massa descartável. Precisa de um usuário do Directus com o papel Semi-administrador; o `teste-painel@ieadespa.org.br` criado em 06/10 deve ser **apagado** quando não for mais usado. |

**Directus**: não há cópia de homologação (custo). Os testes gravam no Directus de produção itens descartáveis
(`slug` `teste-…`, título `TESTE …`), ignorados pela versão do conteúdo e apagados no fim de cada bateria.

**Achado de 06/10 (sessão do painel)**: o login dos painéis usava o modo "cookie" do Directus, mas o Directus está
em outro domínio (`azurewebsites.net`) e o navegador não manda esse cookie entre sites — a renovação silenciosa
nunca funcionou, e aos 15 minutos toda gravação falhava. Agora o login é em modo "json" e o painel renova pelo
token de renovação (`site/src/lib/painelAuth.ts`), provado no teste: gravação com token vencido continua funcionando.

## Directus sob pico (medido em 06/10/2026)

Durante o incidente das camisetas (vB.17) e na blindagem que se seguiu (vD.8), medições reais:

| O quê | Resultado |
| --- | --- |
| Directus, 1 gravação isolada | 128 ms |
| Directus, 12 gravações ao mesmo tempo | 2,3 s no total — **grava uma de cada vez** (fila) |
| Directus, 12 leituras ao mesmo tempo | 0,67 s — leituras não enfileiram |
| CPU do App Service do Directus (plano `ASP-rgportaligreja-8bf6`, **B1**, 1 núcleo) com 6 gravações em paralelo | **88–98 %** |
| CPU do PostgreSQL (`ieadespa-directus-db`, B1ms) na mesma hora | 8 % |
| Limitador do Directus (`RATE_LIMITER_POINTS`) | era **25/s por IP**; subido para **150** em 06/10 — todo o site chega de poucos IPs das Functions, e 25/s derrubava pedidos em pico (erro lido como "sem lote") |
| API do site (`status-camiseta`, cache 20 s), 40 conexões | ~200 req/s, 157 ms de mediana, zero erro |
| API do site (`criar-pedido-camiseta`), 12 conexões, 36 pedidos | 36/36 gravados, ~1,5 pedidos/s, espera de ~8 s por pedido na fila |

Conclusão: o gargalo de gravação é a **CPU do Directus** (plano B1), não o banco nem as Functions. Capacidade
atual ≈ 100 pedidos por minuto (o pico de 06/10 foi 17 por minuto). Opções com custo estão na vD.8.

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

## Chave de acesso (vD.4) na homologação

- A semeadura **zera as chaves de acesso** das matrículas fictícias (900001–900060) e apaga os desafios pendentes a cada
  deploy do `homolog`: a prova sempre parte do zero. O pastor fictício (900007) fica **sem e-mail** de propósito, para
  entrar com aviso quando não tem chave.
- Prova de ponta a ponta com **autenticador virtual** (o Chrome cria e usa uma chave de verdade, sem aparelho):
  fluxo `Sistema - prova em navegador` → roteiro `chave-acesso` (sob demanda; `--ref` do ramo em prova). Em 08/10/2026:
  13/13. Se duas rodadas correrem juntas, a segunda encontra a chave da primeira e falha no passo 1 — uma por vez, ou
  republicar o `homolog` entre elas.
