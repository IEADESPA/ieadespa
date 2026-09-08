# Sistema de Governança IEADESPA (Sistema Integrado Único)

> **Licença:** este repositório é público só pra fins de transparência e consulta —
> **não é software livre/open source**. Uso, cópia, modificação ou reaproveitamento
> (comercial ou não) exigem autorização prévia e expressa da IEADESPA. Ver [`LICENSE`](LICENSE).

> **Realidade jurídica:** Estatuto 2026 (oficial) + Regimento Interno 2026 (entregue).
> O Regimento regulamenta o Estatuto e adiciona: Governança Escalonada em 6 níveis
> (Extensão da Tenda → Congregação → Área → Região/Subsede → Quadrante → Distrito →
> Sede Geral), JAI, JEA, CRA, TER, CEQ, Comissões Permanentes, NIF, Setores Técnicos,
> AFM, PSC, Código Penal Eclesiástico e Processo Disciplinar. Vale o que o Regimento
> descreve (a numeração de artigos difere do Estatuto).

Este repositório é um **sistema auxiliar de membros + governança + EBD + relatórios**.
O diferencial (onde a maioria dos sistemas de membros falha) são os **processos
administrativos eclesiásticos**: cada igreja tem gestão própria, então tudo aqui nasce
configurável e orientado a processo. Os 3 repositórios viram um sistema único:
`governanca-ieadespa` (núcleo) + `chamada-ebd` (Fase 6 — EBD) +
`relatorios-departamentos` (Fase 5 — Relatórios).

## 1. Decisões de arquitetura (fechadas)

1. **Tudo no Azure.** Azure Static Web Apps (front estático) + Azure Functions plano
   Consumo (backend Node.js) + Azure SQL Database serverless ou Azure Database for
   PostgreSQL Burstable. Nenhum outro provedor.
2. **Sem Next.js.** O `chamada-ebd` será descartado e reescrito na stack acima
   (bug de cookies/navegação + padronização).
3. **LGPD.** Dados sensíveis (menores, saúde/PSC, disciplina/CEI, situação de
   comunhão): coleta mínima, Encarregado de Dados, auditoria, sigilo disciplinar,
   criptografia, retenção e direitos do titular.
4. **Identidade única por matrícula** (importada do sistema de gestão de membros;
   cadastro manual, sem integração automática).
5. **Hierarquia única** para governança, EBD e relatórios.
6. **Configurabilidade total** (seção 2.1).
7. **Navegação por módulos** (seção 2.6) — o app não é uma lista plana de
   abas; é um "portal de serviços" (padrão tipo Desenvolve Cidade): um
   Painel Principal com cards, cada card levando a um módulo com sua
   própria navegação.

## 2. Fundamentos permanentes (valem para todas as fases)

### 2.1 Configurabilidade total

Nada é fixo em código: **Campos, Áreas, Níveis, Congregações, Departamentos, órgãos,
papéis, situações de membro, cargos ministeriais e prazos** são catálogos/entidades
configuráveis (criar, renomear, inativar, reordenar, mover). Toda alteração fica
registrada no `AuditLog` (quem mudou o quê e quando).

### 2.2 Hierarquia única (Governança Escalonada — Regimento Art. 104-A/B/C)

| Nível | Unidade | Órgão | Ativação |
|---|---|---|---|
| 0 | Extensão da Tenda | (Congregação-Mãe) | livre |
| 1 | Congregação | JAI | base |
| 2 | Área | JEA | ≥ 3 congregações |
| 3 | Região/Subsede | CRA + TER | ≥ 3 áreas |
| 4 | Quadrante | CEQ | latente (CLI) |
| 5 | Distrito | Pastor Distrital | macroexpansão |
| 6 | Sede Geral | Diretoria + CLI | sempre ativa |

### 2.3 Identidade e membro

`MembroReferencia` = identidade única (matrícula). Situação configurável
(CONGREGADO / EM_COMUNHAO / SEM_COMUNHAO + LICENÇA/INATIVO/DESLIGADO/FALECIDO).
Categorias **calculadas** (Estatuto Art. 7º), transição automática:

| Categoria | Requisito | Direito |
|---|---|---|
| Congregado | sem batismo | nenhum (fora do rol) |
| Membro em Comunhão | batizado, ≥12 anos | direitos espirituais |
| Capacidade Eleitoral Ativa | +18 + 90 dias + livre de disciplina | votar |
| Membro Elegível | Ativa + Art. 23 §2º | ser votado |

- **Elegibilidade (Art. 23):** votar = comunhão + ≥18 + 90 dias + livre de disciplina;
  ser votado = +1 ano + dizimista fiel (Diretoria/CF), ≥18 (Lideranças/CEI), ≥16 (local).
- **Disciplina automática:** registra o processo + dias de sanção; ao vencer o prazo o
  membro sai da disciplina sozinho (voto/ser votado ficam suspensos durante a sanção).
- **Departamento de afiliação + cargo ministerial:** configuráveis no cadastro.

### 2.4 Banco de dados, migrações e deploy (regras permanentes)

O Azure SQL é a **fonte de verdade**. Mesmo os dados de demonstração/seed são
tratados como **dados reais**: nenhuma atualização pode apagá-los, recriá-los ou
"sumir" com eles.

**Migrações (obrigatório):**
- Toda mudança de schema (criar/alterar tabela, coluna, constraint, seed) entra em
  `sql/migrations/NNN_descricao.sql`, **sempre idempotente** (use `IF NOT EXISTS` /
  `IF EXISTS`). **Nunca** `DROP TABLE`/`DROP COLUMN` sem etapa de transição explícita e aprovada.
- `sql/schema.sql` é só referência/leitura; **não** é o que roda no deploy.
- O workflow (`.github/workflows/azure-static-web-apps-*.yml`) roda cada migração com um
  step próprio do `azure/sql-action` (ele espera um arquivo, não uma pasta) — **ao criar
  uma migração nova, é obrigatório adicionar o step dela no workflow**, na ordem certa,
  antes do "Build And Deploy". Migração sem step no workflow nunca chega a rodar no Azure
  SQL de verdade, mesmo já estando commitada.

**Código ↔ banco em sincronia:**
- Antes de subir uma versão, o schema precisa refletir a lógica atual do app.
  Não suba código que dependa de tabela/coluna que não existe no banco.
- As rotas usam `api/shared/db.js` e `SQL_CONNECTION_STRING`; nunca hardcode de
  credenciais e nunca caia no mock em produção.

**Segurança dos dados:**
- `api/local.settings.json` fica no `.gitignore` (nunca versionar senhas/segredos).
- Produção usa Application Settings (`SQL_CONNECTION_STRING`, `AUTH_SECRET`) +
  Secrets do GitHub (`AZURE_SQL_CONNECTION_STRING`) — nunca valores no repositório.
- Toda ação relevante grava no `AuditLog` (via `shared/auditoria.js`).

### 2.5 Motor de Sessões (Reuniões) — único e órgão-agnóstico

Existe **uma só engine de sessão/presença** (`Sessoes` + `Presencas`, Functions
`AbrirReuniao`/`EncerrarReuniao`/`ListarReunioes`/`RegistrarPresenca`), reaproveitada
por **qualquer órgão** — não existe (nem deve existir) uma Function/tabela de reunião
por órgão. A aba única **Reuniões** do painel escolhe o órgão (puxado de `Orgaos`) e
abre a sessão nele; a Portaria (`/api/presenca`) resolve sozinha, pela senha digitada,
qual sessão aberta é essa.

**Prioridade em vez de trava global:** até a v0.3, só podia existir 1 sessão `ABERTA`
no banco inteiro, de qualquer órgão — o que ia travar assim que a Fase 2 trouxesse CLI,
Diretoria e Conselho Fiscal com reunião própria. A regra agora é: a **Assembleia Geral
é exclusiva** (órgão soberano — Regimento Art. 104 e segs.: enquanto ela está aberta,
nenhuma outra reunião abre, e ela não abre se já houver outra em andamento); os
**demais órgãos travam por sobreposição real de pessoas**, não por "mesmo órgão" —
calculado a partir de `shared/universo.js` (o mesmo motor que decide quem falta quando
a reunião encerra), comparando o universo do órgão que está abrindo contra o de cada
sessão já aberta. Motivo: a CLI tem composição mista (Regimento Art. 15 — Diretoria +
Conselho Fiscal + CEI + Dirigentes entram por Assento) e comparecimento obrigatório
(Art. 27 — faltas consecutivas tiram o assento), então abrir CLI e Diretoria ao mesmo
horário faria quem está nas duas levar falta automática numa delas só por causa da
agenda, não por ausência de verdade. Nenhuma tabela de prioridade configurada à mão —
a trava nasce sozinha de quem está cadastrado em cada órgão, e cobre qualquer
composição futura. Ver `api/AbrirReuniao`.

**`Assentos`** é quem sabe "quem pertence a qual órgão" além da regra genérica ATIVO
(`shared/universo.js`): cadeira por Ordenação (Pastor/Evangelista/Presbítero, calculado
a partir de `CargoMinisterial`) ou por Função (Diretoria, Conselho Fiscal, CEI,
Dirigente de Congregação — cadastrado). Até a v0.3 a tabela existia e já era **lida**
pela CLI, mas nada a **escrevia** — por isso a composição mista da CLI (Art. 15) só
funcionava pela metade. CRUD em `GestaoAssentos`, embutido na aba **Órgãos** (mesma
permissão, `pessoas`); assim que um órgão sem regra própria (Diretoria, CEI, Conselho
Fiscal) ganha sua primeira cadeira cadastrada, `universo.js` passa a usar essa
composição real em vez do padrão genérico "todo mundo ATIVO" — o que também é o que
faz o cálculo de conflito de reunião do parágrafo acima funcionar direito pra eles. O
card "Meus Órgãos" do Meu Painel (`MinhaFrequencia`) lê daqui — fica vazio até alguém
cadastrar a primeira cadeira.

**Sem cadastro duplicado:** quem já tem cadeira em Diretoria, Conselho Fiscal ou CEI
entra na composição da CLI **automaticamente** por causa do cargo — não precisa
cadastrar a mesma pessoa de novo direto na CLI. Cadeira direto na CLI só faz sentido
pra quem não tem órgão próprio (Dirigente de Congregação, Líder Geral). E o mais
importante: `Assentos` só existe pra cargo **eletivo/nomeado** de posse individual
(Diretoria = 10 pessoas fixas — Art. 29; Conselho Fiscal = 6 — Art. 43; CEI = 9 —
Art. 88; 1 Dirigente por Congregação) — nunca pra Assembleia (universo 100%
calculado pela capacidade eleitoral, zero cadeira manual) nem pra "Membro"/"Auxiliar"
comum (calculado pelo Cargo Ministerial no próprio cadastro da pessoa, também zero
cadeira manual). Não é retrabalho de cadastrar dúzias/centenas de pessoas — é só a
minoria em posto eletivo específico.

**Cadeira com prazo (mandato):** cargo eletivo/nomeado (Tesoureiro, Secretário,
Conselheiro Fiscal...) tem tempo determinado, diferente de Ordenação (que não vence).
Ao criar a cadeira, dá pra informar `duracaoMeses` — `DataTerminoPrevisao` é calculada
na hora (migração 014); igual ao prazo da sanção disciplinar (v0.2), o vencimento é
**lido, não fechado sozinho**: a cadeira some do universo do órgão (e do card "Meus
Órgãos") assim que a data passa, mas continua listada com o badge "Mandato vencido"
até alguém confirmar/renovar/encerrar formalmente — nunca perde o histórico de quem
já ocupou. A tabela `Mandatos` (duração padrão por órgão) existe no schema desde a
migração 001 mas segue sem CRUD/uso — por ora a duração é informada cadeira a cadeira,
igual ao padrão "valor sugerido" do catálogo `Prazos`.

**Check-in com mais de uma reunião aberta:** desde que órgãos diferentes podem ter
sessão simultânea, `RegistrarPresenca` não pode mais pegar "a" sessão aberta — ele
filtra pela senha digitada, valida universo e presença já registrada, e só pergunta
qual reunião (`precisaEscolher`) no caso raro de duas sessões concorrentes usarem a
mesma senha e a pessoa ser elegível pras duas.

Escopo territorial (`OrgaosLocais` — JAI/JEA/CRA/TER/CEQ/Distrito) **não** passa por
essa engine ainda: `Sessoes.OrgaoId` só referencia `Orgaos` (os 6 órgãos únicos do
Art. 13), não `OrgaosLocais`. Reunião de junta local fica pra quando houver um
consumidor real (nenhuma fase do roteiro pede isso ainda).


### 2.6 Navegação por módulos (padrão "portal de serviços")

O painel não é mais uma barra lateral com uma lista plana crescente de abas.
É um portal (referência explícita do usuário: o portal municipal
"Desenvolve Cidade" — Painel Principal com cards de serviço, cada um
abrindo um mini-sistema à parte com nav própria, mesmo login por trás).

- **Meu Painel é o único item sempre fixo** ("Painel Principal"/home). Nele,
  logo no topo do perfil, fica a grade de cards (`montarGradeModulos()`,
  `app/script.js`).
- Cada módulo é descrito uma vez no objeto `MODULOS` (`app/script.js`):
  `{ titulo, icone, abaEntrada, abas: [...] }`. Um card só aparece se a
  pessoa tiver permissão em pelo menos uma aba daquele módulo
  (`podeAcessarModulo`).
- Clicar num card (`entrarModulo(chave)`) troca a barra lateral **inteira**
  pela navegação daquele módulo só (`.grupo-modulo` correspondente) — o
  resto some — com um botão fixo "← Painel Principal" (`sairDoModulo()`)
  pra voltar. Cada módulo reaproveita exatamente as mesmas abas e as mesmas
  permissões já existentes; nenhuma tela nova nasce só por causa da
  modularização em si.
- **Fracionar ao máximo é intencional** (pedido explícito, 2026): o antigo
  módulo único "Secretaria/Governança" foi dividido em `membresia`,
  `territorio`, `eclesiastica`, `disciplina`, `conformidade` e `acesso`
  (mais `financeiro`, à parte desde a v4.1) — quanto mais fino o módulo,
  mais fácil no futuro dar acesso a alguém só naquele pedaço específico
  (ex: um secretário de departamento, um pastor de área) sem precisar da
  permissão ampla "Pessoas" nem sobrecarregar a tela de Permissões com uma
  lista enorme de opções que não se aplicam a ele.
- **Fatiamento pendente, de propósito não feito ainda:** a aba "Catálogos"
  hoje mistura Departamentos com Congregações/Áreas/Regiões/Distritos num
  único lugar (por isso ainda mora dentro do módulo `territorio`). Separar
  isso em telas dedicadas por assunto é o que vai permitir um card
  "Departamentos" (pro secretário departamental) e um card "Territórios"
  (pro pastor de área), cada um só com o que é dele — não fica esquecido,
  é o próximo passo real de fatiamento quando alguém precisar de fato desse
  acesso mais fino.
- **Preparado pra crescer:** um novo sistema inteiro (ex: EBD/`chamada-ebd`,
  fundamentos permanentes item 5) vira só mais uma entrada em `MODULOS`,
  com sua própria nav interna e — quando fizer sentido pelo tamanho —
  possivelmente sua própria barra lateral com itens que mudam conforme o
  papel da pessoa ali dentro (ex: Professor vê "Alunos"/"Aulas", aluno vê
  outra coisa), sem mexer em nada dos módulos já existentes.
- **Configuração é sempre do próprio módulo, nunca centralizada** (decisão
  explícita, 2026): não existe (e não vai existir) um painel único de
  "Configurações" dentro de Administração de Acesso reunindo parâmetros de
  todo o sistema. Cada módulo é dono da própria configuração — o Financeiro
  já segue esse padrão (`GestaoParametrosTesouraria`, sub-aba "Parâmetros"
  dentro dele mesmo, não em outro lugar). Quando um módulo Departamentos
  existir de verdade, o cadastro/config de departamento mora dentro dele;
  outros módulos que precisarem desse dado só o consultam via API, sem
  duplicar. "Administração de Acesso" continua só cuidando de Papéis/
  Escopos/Permissões (o que já é hoje).
- **Meu Painel também fatiado** (v4.2.2): "Meu Perfil" parou de acumular
  tudo numa página só — virou 4 sub-abas (Perfil = resumo/dashboard; Meus
  Dados Cadastrais = editar telefone/e-mail/endereço + trocar senha +
  solicitar correção; Vínculos Familiares; Minhas Contribuições), mais LGPD
  e Cartas que já existiam. Mesmo princípio de sempre: mais fatiado, mais
  fácil de navegar conforme cresce.
- **Órgãos territoriais escopados por pessoa** (v4.2.2, correção de um
  problema de escala achado em teste real): o submenu de Reuniões usava
  `GET /api/catalogos/orgaosLocais`, que devolve TODA JAI/JEA/TER/... do
  sistema inteiro sem filtrar por quem está logado — um Pastor de Área via
  a lista inteira da denominação em vez de só as próprias ~4 congregações,
  e o problema só cresce conforme mais congregações existirem. Criado
  `MeusOrgaosLocais` (`api/MeusOrgaosLocais`), que filtra usando o mesmo
  motor de escopo de sempre (`Lideranca.EscopoTipo/EscopoId` →
  `escopo.resolverEscopoCongregacoes`) — cada pessoa só vê os órgãos
  territoriais dentro do próprio escopo; se sobrar só um, a seleção
  automática de sempre já leva direto pra ele.
- **Órgãos Centrais e Órgãos Regionais como módulos separados** (v4.2.3,
  pedido explícito: "separar de uma vez por todas" — uma pessoa pode
  pertencer a vários órgãos subindo a hierarquia até a Sede, cada nível com
  gente diferente, então "escolher o órgão" merecia sua própria porta de
  entrada em vez de ficar dentro de "Reuniões"). Os dois módulos abrem o
  mesmo conteúdo de sempre (`#abaReunioes`, `selecionarOrgaoReunioes`) — só
  muda por onde se chega e qual lista aparece: Órgãos Centrais usa
  `GET /api/orgaos` (Assembleia/CLI/Diretoria/Conselho Fiscal/CEI, únicos na
  denominação); Órgãos Regionais usa `GET /api/meus-orgaos-locais`
  (territoriais, já escopados por pessoa — item acima). Nenhuma lógica de
  reunião foi reescrita, só o ponto de entrada.

### 2.7 Segregação de funções (princípio financeiro, formalizado por pesquisa de mercado)

Quem **cria/lança** um registro financeiro nunca pode ser a mesma pessoa
que **aprova/libera** o mesmo registro. Não é uma ideia nova neste
sistema — é como Tesouraria já funciona desde a v4.1.3 (o Tesoureiro
Local lança, só a Tesouraria Geral confere e libera o saldo) — mas uma
pesquisa de mercado (FASE 4) confirmou que essa é a proteção nº1 contra
fraude financeira em organizações sem fins lucrativos, então vira
princípio nomeado e citável, a ser aplicado em toda peça financeira nova
(Fornecedores, Contas a Pagar — v4.5): quem cadastra ou edita um
Fornecedor nunca aprova pagamento a ele; quem registra uma Saída nunca
aprova a própria Saída.

## 3. Plano de versões (mega sistema, fase a fase)

Cada fase agrupa versões; cada versão é um conjunto de processos com checklist `- [ ]`.
A ordem segue o ciclo: fundamentos → membro → governança → disciplina → financeiro →
departamentos → EBD → saúde/comunicação → ministerial → expansão.

### FASE 0 — Fundamentos

#### v0.1 — Base configurável

- [x] ✅ Painel único (um só acesso; módulos visíveis por permissão).
- [x] ✅ `api/shared/estatuto.js` (idade, interstício, capacidade eleitoral, quórum 2 estágios).
- [x] ✅ `MembroReferencia` com DataNascimento / DataAdmissao / DizimistaFiel.
- [x] ✅ Catálogo real de `Orgaos` (6 órgãos do Art. 13).
- [x] Catálogos configuráveis com CRUD + auditoria (Campos, Áreas, Níveis, Congregações,
      Departamentos, órgãos, papéis, situações, cargos ministeriais, prazos).
      — ✅ feitos via `GestaoCatalogos`: Congregações, Departamentos, Situações, Papéis,
      Funcionalidades, Áreas, Regiões, Quadrantes, Distritos, Extensões, Tipos de Proposta
      (Consagrações), Órgãos Locais, **Cargos Ministeriais** e **Prazos** (migração 008 — antes
      só existiam como tabela, sem CRUD; `CargosMinisteriais` já alimenta o cadastro de pessoas).
      **Importante:** `Prazos` NÃO alimenta os cálculos automáticos de categoria/elegibilidade
      (Art. 7º/23º) — esses continuam fixos em `api/shared/estatuto.js` de propósito ("regra
      jurídica vira função, não dado editável por tela"), pra ninguém mudar sem querer um número
      com peso jurídico. `Prazos` serve como valor padrão *sugerido* para o processo disciplinar
      (v0.2, item pendente "Processo disciplinar com término automático") — lá sim o prazo pode
      ser reduzido caso a caso pela Câmara/Conselho, desde que fique registrado no `AuditLog`
      com justificativa (decisão confirmada em conversa, ainda não implementada). ✅
      `GestaoCatalogos` e `GetOrgaos` agora gravam em `AuditLog` (criação, atualização e
      exclusão, com dados de antes/depois) — cobre automaticamente qualquer catálogo novo
      adicionado ao mapa `CATALOGOS` no futuro.
- [x] Hierarquia de 6 níveis no banco (`Areas`, `Regioes`, `Quadrantes`, `Distritos`,
      `ExtensoesTenda`, `VinculoCongregacaoArea`, `OrgaosLocais`).
      — ✅ tabelas existem com o vínculo pai-filho completo (migração 004) e já são usadas de
      verdade no escopo de acesso (`shared/escopo.js`). ✅ `OrgaosLocais` (JAI/JEA/CRA/TER/CEQ/
      Distrito) agora tem CRUD via `GestaoCatalogos` e seed automático da JAI
      de cada congregação (migração 007 — único nível com ativação "base"). JEA/CRA/TER/CEQ/
      Distrito continuam sem seed automático: dependem de regra de contagem (≥3 congregações,
      ≥3 áreas etc.) — isso é escopo da **FASE 9** (Expansão), não da v0.1; cadastro manual
      disponível enquanto isso. **Reorganização (v0.3):** a tela de `OrgaosLocais` saiu da
      aba Estrutura e foi pra aba **Órgãos** — é órgão também, só escalonado por nível
      territorial (1 por Congregação/Área/Região/Quadrante/Distrito) em vez de único como
      Assembleia/CLI/Diretoria/CEI/Conselho Fiscal; ficar junto com os outros órgãos deixa
      isso mais claro do que estar "escondido" dentro da hierarquia territorial. A aba
      Estrutura, sem `OrgaosLocais`, passou a listar os catálogos territoriais na ordem dos
      níveis (0 a 5: Extensão → Congregação → Área → Região → Quadrante → Distrito).
- [x] ✅ Permissões estruturadas (papel × funcionalidade × escopo campo/área/congregação).
      Feito para Global/Distrito/Quadrante/Região/Área/Congregação/**Extensão da Tenda**
      (migração 009 — `MembroReferencia.ExtensaoId`; escopo `EXTENSAO` resolvido em
      `shared/escopo.js` e restrito de verdade em `GestaoPessoas`, que filtra pela Extensão
      exata, não só pela Congregação-Mãe).
      **Mandato com prazo + concessão em lote:** `Lideranca.AtivoAte` (já existia desde a
      migração 001, usado só pela Medida Cautelar do v2.6) passa a representar também fim
      de mandato normal — `POST /api/lideranca` ganha `duracaoMeses` opcional (mesmo padrão
      de `duracaoMeses`/`DataTerminoPrevisao` de `Assentos`), calculando `AtivoAte` = hoje +
      N meses; sem duracaoMeses, não mexe (não pode apagar sem querer uma suspensão em
      andamento). Vencimento é calculado na leitura, igual o resto do sistema. Novo
      `POST /api/lideranca/lote` concede o mesmo papel a várias matrículas de uma vez com
      senha inicial única (cada um troca depois): no escopo Congregação, resolve a
      congregação de cada pessoa automaticamente por `MembroReferencia.CongregacaoId` se
      não vier um escopo fixo — pensado pro caso real de cadastrar vários Secretários
      Locais (um por congregação) numa tacada só, sem crescer artificialmente o trabalho
      manual conforme mais igrejas entram no sistema.
      **Correção:** `composicaoCLI` (`shared/universo.js`) não filtrava `AtivoAte` na
      Lideranca — um Dirigente/Líder Geral com mandato vencido continuava aparecendo na
      composição da CLI mesmo já sem conseguir logar; corrigido.
- [x] ✅ Documentos de Governança (Estatuto 2026 + Regimento Interno 2026) publicados em
      `app/documentos/` e acessíveis a qualquer usuário logado pela aba **Documentos**.

#### v0.2 — Perfil do membro (base da identidade)

- [x] `MembroReferencia` completo: matrícula importada, SituacaoMembro, DepartamentoId,
      CargoMinisterial, dados de contato (LGPD).
      — ✅ `CargoMinisterial` (já existia na tabela desde a migração 001) agora tem catálogo
      configurável (`CargosMinisteriais`, via `GestaoCatalogos`) e está exposto no cadastro
      (`GestaoPessoas`) e na tela (seletor + coluna na lista). ✅ Departamento de afiliação
      (`DepartamentoId`) ganhou seletor no formulário (antes só existia na API). ✅ Dados de
      contato — Telefone, E-mail, Endereço — novos (migração 008), com coleta mínima: só
      quem tem a permissão `pessoas` visualiza/edita; dados sensíveis (saúde, menores) ficam
      para a v1.7, e o fluxo formal de consentimento/retenção LGPD é a v0.3.
      **Correção (v0.3, migração 013):** existia uma duplicação real com a antiga aba
      **Funções** (`MembroReferencia.Funcao`, texto livre) — e pior, `shared/universo.js`
      calculava a composição "por Ordenação" da CLI (Art. 15) lendo `Funcao`, não
      `CargoMinisterial`, então quem só preenchia o catálogo novo ficava fora do quórum
      da CLI. `CargoMinisterial` (catálogo fechado, com escada) virou a única fonte de
      verdade: aba Funções saiu do painel, `universo.js` corrigido, `EvoluirConsagracao`
      passa a atualizar `CargoMinisterial` (via `TiposConsagracao.CargoMinisterialResultante`,
      configurável) além do `Funcao` histórico, e a migração faz backfill dos dados
      antigos. `Funcao` continua na tabela (nunca apagar dado real) só como texto
      descritivo, gerido automaticamente pela esteira de Consagrações.
- [x] Categorias de membresia calculadas (4 categorias do Art. 7º).
      — já resolvido em `api/shared/estatuto.js` (`calcularCapacidadeEleitoral`): Congregado /
      Membro em Comunhão / Capacidade Eleitoral Ativa / Membro Elegível, sempre calculado a
      partir de SituacaoMembro + idade + dias desde a admissão + dizimista fiel — nunca marcação
      manual (Art. 7º §1º).
- [x] Elegibilidade calculada (votar / ser votado) + badge na lista de pessoas.
      — já resolvido: `badgeCategoria()` no front colore a categoria calculada por pessoa na
      lista, com filtro por categoria na busca.
- [x] Processo disciplinar — **núcleo mínimo**: abrir processo (membro + motivo em
      texto livre + órgão responsável), julgar (Resultado: ARQUIVADO/SANCAO/EXCLUSAO +
      DiasSancao ou prazo indeterminado), ajustar prazo caso a caso com justificativa
      auditada, suspensão automática de voto/ser votado (`estaSobDisciplina()` deixa de
      ser stub), término automático calculado na leitura (sem job/timer), e vacância
      automática de `Assentos` só no caso inequívoco de `EXCLUSAO` (Regimento: exclusão
      sempre implica perda de tudo; os demais níveis de pena exigem o catálogo de
      penalidades para saber se há perda de mandato — isso é v3.4). Badge de categoria
      mascarado por permissão (quem só tem `pessoas` não vê o efeito da disciplina; quem
      tem `disciplina` vê). **Diluído para não virar uma "montanha" só nesta versão —
      fica explicitamente para depois (ver v3.2/v3.3/v3.4, que já existiam no roadmap e
      constroem em cima deste núcleo):** catálogo de Tipos de Infração (Art. 96-99),
      catálogo de Tipos de Penalidade (Art. 95 §2º) e a vacância automática de Assentos
      por nível de pena, esteira com `AFASTAMENTO_CAUTELAR` como status intermediário,
      citação formal, defesa prévia com testemunhas, revelia, recurso, Segredo de
      Justiça, jurisdição dupla CEI+CIADSETA, Rito de Retorno/AFM (Art. 77). O catálogo
      `Prazos` (v0.1) segue como valor sugerido opcional na tela, nunca fonte fixa.
- [x] Vínculo familiar — **núcleo mínimo**: tabela de relacionamento entre duas pessoas
      (`VinculosFamiliares`, direcional, 1 linha por par) + catálogo configurável de
      tipos (`TiposVinculoFamiliar`: Cônjuge, Pai/Mãe-Filho, Irmão, Sogro/Genro/Nora —
      esse último cadastrável direto, já que ainda não há motor de dedução por travessia)
      + seção de cadastro dentro da tela de uma Pessoa. **Diluído:** o helper de cálculo
      de grau de parentesco (grafo/BFS entre duas pessoas) e a Function de consulta só
      nascem quando tiverem um consumidor de verdade — v2.6 (vedação de nepotismo no
      Conselho Fiscal, Art. 43 §3º) e v3.1 (vedação de nepotismo na posse do
      CEI, Estatuto Art. 38 §2º) — construídos em cima da tabela que esta
      versão já deixa pronta.

#### v0.3 — Auditoria e trilha de dados

- [x] `AuditLog` em toda alteração (quem mudou o quê e quando, dados antes/depois).
      — ✅ fechadas as últimas lacunas: `RegistrarPresenca`, `SolicitarJustificativa` e
      `TrocarSenha` (nunca grava a senha/hash, só o fato da troca) agora auditam;
      `ListarAuditoria` tinha um buraco real (endpoint sem checagem de permissão nenhuma)
      — agora exige a permissão `auditoria` e devolve o nome de quem fez a ação. Nova aba
      **Auditoria** no painel (mesma permissão) lista a trilha com filtro por tabela/usuário.
- [x] Consentimento LGPD + retenção + direito de acesso/exclusão do titular.
      — ✅ `ConsentimentosLGPD` (trilha append-only por tipo de dado — hoje só
      `DADOS_CONTATO`, pronta pra v1.7 dados sensíveis) com toggle no "Meu Painel".
      `SolicitacoesTitularLGPD` cobre os 4 direitos do Art. 18 (acesso/exclusão/
      retificação/portabilidade): o titular abre o pedido pelo próprio painel
      (`MinhasSolicitacoesLGPD`) e acompanha o status. Direito de acesso/portabilidade
      via `MeusDadosLGPD` (pacote único com cadastro, liderança, assentos, processos
      disciplinares, vínculos familiares e consentimentos — audita o próprio acesso).
      Direito de exclusão via `ExecutarExclusaoLGPD`: **não é DELETE de verdade** (o
      Regimento depende do MembroId em Assentos/Processos/Consagrações, e a seção 2.4
      já veda apagar dados reais) — anonimiza telefone/e-mail/endereço (dados coletados
      por consentimento) com base legal em obrigação legal/exercício regular de
      direitos (LGPD Art. 16) para o que fica. Catálogo `PoliticasRetencao` (mesmo
      espírito do `Prazos` da v0.1: referência informativa, sem expurgo automático).
- [x] Encarregado de Dados (papel no sistema).
      — ✅ nova permissão `protecaodedados` + papel pronto "Encarregado de Dados"
      (`auditoria,protecaodedados`) via `GestaoCatalogos`/`Papeis`, sem mudança de
      código (o sistema de permissões já era 100% orientado a dado). Nova aba
      **Proteção de Dados**: lista as solicitações do titular (responder/negar/
      executar exclusão) e o catálogo de Políticas de Retenção.

### FASE 1 — Membresia (ciclo de vida do membro)

#### v1.1 — Admissão de membros (Art. 6º)

- [x] Registro de admissão por: batismo, carta de mudança, reconciliação, aclamação.
      — ✅ migração 015 + `GestaoPessoas`: `FormaAdmissao` (lista fixa do Art. 6º §1º)
      no cadastro e na coluna "Forma Admissão" da listagem.
- [x] Campos: data de admissão/batismo, forma de admissão, origem (igreja anterior).
      — ✅ `DataAdmissao` (já existia), `DataBatismo`, `Origem` e `IgrejaAnterior`.
- [x] Rito público de recebimento (leitura do nome, apresentação à igreja).
      — ✅ `DataRitoRecebimento`, `NomeLidoRito` e `MinistranteRito` (Reg. Art. 130).

#### v1.2 — Período de Integração (90 dias)

- [x] Marcação automática do início do Período de Integração (90 dias, Art. 6º §2º).
      — ✅ `shared/estatuto.js` calcula `emPeriodoIntegracao` / `diasRestantesIntegracao`
      e a lista de Pessoas mostra o aviso "⏳ Xd p/ votar" ao lado da categoria.
- [x] Restrições automáticas durante a integração: sem votar/ser votado.
      — ✅ `capacidadeAtiva` exige ≥90 dias (votar) e as elegibilidades passivas partem
      dela. Obs.: a trava de "sem cargo" durante a integração ainda NÃO está implementada
      (fica para a v1.6/v8, que já tratam cargo/escada).
- [x] Alerta de fim de integração (transição automática para Capacidade Eleitoral Ativa).
      — ✅ o batismo já torna a pessoa "Membro em Comunhão" de imediato (Art. 7º II); os
      90 dias de integração apenas liberam o voto/ser votado (Art. 6º §2º/§3º). Vencido o
      prazo, o aviso "⏳ Xd p/ votar" some e a categoria passa a "Capacidade Eleitoral Ativa".

#### v1.3 — Categorias e elegibilidade (Art. 7º e 23)

- [x] Cálculo automático das 4 categorias (Congregado / Comunhão / Ativa / Elegível).
      — ✅ `shared/estatuto.js` (`calcularCapacidadeEleitoral`) + `badgeCategoria()`.
- [x] Elegibilidade ativa (votar): ≥18 + 90 dias + livre de disciplina.
- [x] Elegibilidade passiva (ser votado): +1 ano + dizimista (Diretoria/CF); ≥18 (Lideranças/CEI); ≥16 (local).
- [x] Atualização cadastral pela Secretaria (sem novo ato de admissão).
      — ✅ já é o fluxo normal da tela de Pessoas (não gera novo ato de admissão).

#### v1.4 — Trânsito eclesiástico e cartas (Regimento Art. 131)

- [x] Carta de Recomendação (validade 30 dias, prorrogação por visto).
      — ✅ auto-atendimento no Meu Painel, emitida na hora (sem intermediação da
      Secretaria — mesmo racional das demais cartas de autoatendimento), uma por vez
      enquanto a anterior não vencer, + modelo imprimível (salvar como PDF no navegador).
- [x] Carta de Mudança (desligamento) — solicitação própria + "declaração de ciência"
      digital (Reg. Art. 131 §3º, II) + minimização automática sob demanda após 30 dias
      (Reg. Art. 132 §2º: mantém matrícula/nome/data de admissão/batismo) + cancelamento
      por readmissão ("o relógio zera"). Migração 017 + `SolicitarCarta`/`GestaoCartas`.
- [x] Modelo impresso da carta (cabeçalho, tipo, situação em comunhão/paz/observação,
      função, cargo, estado civil, cartão de membro nº, validade) — baseado no modelo
      físico em uso nas congregações. Migração 018 (`EstadoCivil` em `MembroReferencia`)
      + `imprimirCarta()` em `app/script.js`.
- [x] Recebimento de carta de outra igreja — não é um fluxo à parte: já é a Admissão por
      Carta da v1.1 (`FormaAdmissao = CARTA_MUDANCA`, com `IgrejaAnterior`/`Origem`
      preenchidos). Data de admissão/batismo do membro independe de ele ter trazido ou
      não a carta física.
- [x] Atestado de Trânsito Supletivo (Reg. Art. 131 §2º, III) — como o próprio membro já
      solicita direto pelo sistema, sai emitido na hora (`SolicitarCarta`, tipo
      `ATESTADO_SUPLETIVO`), sem depender do CEI ou de a igreja de origem ter a carta.
- [x] Competência de emissão — não se aplica ao autoatendimento: como é o próprio membro
      quem pede, direto no sistema, não há Dirigente/Secretário/Mesa Diretora a
      intermediar (mesmo racional já usado na Carta de Mudança). A tela de Secretaria
      (`GestaoCartas`) continua disponível como canal alternativo de emissão manual.

#### v1.5 — Perda de membresia (Art. 11)

- [x] Registro de causas: falecimento, desligamento, carta de mudança, exclusão, abandono
      material/digital — catálogo fechado (`CAUSAS_SAIDA` em `GestaoPessoas`, mesmo
      padrão de `FORMAS_ADMISSAO`) + novo status `FALECIDO` (`StatusMembro`). Migração 019.
- [x] Abandono Eclesiástico Material (90 dias sem comunhão, `DataAfastamento` lançada
      manualmente pela Secretaria na ficha da Pessoa) + Radar de Abandono
      (`RadarAbandono`) + procedimento sumário de constatação: notificação (registro
      datado, sem e-mail/SMS) → 15 dias de prazo de defesa → homologação pela CLI
      (`AbrirProcedimentoAbandono`/`EvoluirProcedimentoAbandono`).
- [x] Abandono Eclesiástico Digital (Art. 11, V e Art. 12) — catálogo de Canais Oficiais
      de Comunicação (`canaisOficiais`, vedado canal pessoal de dirigente/obreiro) +
      registro de Tentativas de Contato (`TentativasContatoAbandono`, Art. 12 §2º: pelo
      menos 2 tentativas por canais distintos, sob pena de nulidade) + Radar próprio
      (`RadarAbandonoDigital`). Os 90 dias contam da 1ª tentativa registrada. Reaproveita
      o mesmo procedimento sumário do Material (`ProcedimentosAbandono.Tipo`). Migração 020.
- [x] Recurso à Assembleia (30 dias, sem efeito suspensivo) — registrado no procedimento
      de abandono (`acao: 'RECURSO'`); a perda já vale desde a homologação, e o resultado
      real da Assembleia é lançado manualmente depois (não integra com o módulo de
      votação ainda).
- [x] Vacância automática de cargos/funções/assentos ao perder a membresia —
      `shared/vacancia.js` generaliza o fechamento de Assentos que só existia isolado na
      exclusão disciplinar, estendendo também para Liderança e Cargo
      Ministerial/Departamento, reaproveitado pelos 3 fluxos de saída (exclusão
      disciplinar, Carta de Mudança, desligamento manual/edição de Pessoa) e pelo
      procedimento de abandono.

#### v1.6 — Situação e status do membro

- [x] Situação (`EM_COMUNHAO`/`SEM_COMUNHAO`/`CONGREGADO`) e Status
      (`ATIVO`/`LICENÇA`/`INATIVO`/`DESLIGADO`/`FALECIDO`) já são catálogos configuráveis
      (migrações 016/019, via `GestaoCatalogos`). `GestaoPessoas` passou a validar
      `situacaoMembro` contra o catálogo (antes era texto livre, sem checagem nenhuma).
      A transição automática ligada à duração exata de uma sanção disciplinar (voltar
      sozinho a Em Comunhão quando a sanção vence) fica para uma versão futura de
      Disciplina — é um mecanismo de suspender-e-restaurar mais complexo, fora do
      recorte desta fase.
- [x] Suspensão de direitos durante disciplina/Sem Comunhão — antes só a Assembleia
      Geral filtrava (`shared/universo.js`); agora **todos os órgãos** (CLI, Diretoria,
      Conselho Fiscal, CEI, demais) tiram automaticamente da lista de presença/quórum
      quem está Sem Comunhão ou sob processo disciplinar ativo. Não fecha
      Assento/Liderança (isso é `shared/vacancia.js`, reservado a saída definitiva) — é
      um filtro de leitura: a pessoa reaparece sozinha assim que a Situação volta.
      Congregado ganhou trilha própria: `AbrirProcessoDisciplinar` rejeita abrir
      processo contra um Congregado.
- [x] Histórico completo do membro — Linha do Tempo na ficha da Pessoa
      (`HistoricoMembro`), agregando por leitura o que já existe (admissão,
      consagrações, cartas, disciplina/abandono mascarados por sigilo) + tabela nova
      `MarcosMembro` para eventos sem outro lugar no sistema (conversão,
      ministério/igreja anterior, batismo no Espírito Santo). Corrigir um marco já
      lançado exige justificativa e é restrito ao primeiro uso real de `Papeis.Nivel`
      no código — `auth.exigirNivelGlobal` — e gera um novo registro de Auditoria (a
      Auditoria em si nunca é editável/apagável). Migração 021.

#### v1.7 — Cadastro ampliado (dados sensíveis/LGPD)

- [x] Dados pessoais: contato/endereço/estado civil já existiam (v0.2/v1.4). **Foto**
      (opcional) é novidade — diferente do padrão de Telefone/E-mail/Endereço (onde o
      consentimento é só registro paralelo), a Foto exige **consentimento concedido
      como trava real**: `UploadFotoMembro` rejeita o upload sem um registro
      `ConsentimentosLGPD.Tipo='FOTO'` concedido. Armazenada em Azure Blob Storage
      (`shared/storage.js`), não em base64 na tabela — pensando em escala (centenas/
      milhares de membros). **Profissão ficou fora do escopo** (decisão do usuário:
      sem necessidade real hoje — o que não é necessário, não se coleta).
- [x] Dados de menores — ampliado de "12-17" pro recorte real, **0-17** (crianças
      também são congregados de fato). Reaproveita `VinculosFamiliares` (sem tabela
      nova): ganhou o flag `ResponsavelLegal`. `menorDeIdade` é calculado a partir da
      Data de Nascimento (`estatuto.idadeEm`), nunca marcação manual — mesmo espírito
      do resto de `estatuto.js`.
- [x] **"Dados de saúde (PSC)" saiu do escopo** — achado da pesquisa: PSC é o
      Programa de Saúde Congregacional (Regimento Art. 127-129), uma avaliação
      institucional da *congregação* (já roteirizada à parte na FASE 7/v7.1,
      `PSCAvaliacoes`/`SinaisVitais`), não dado de saúde individual. O Regimento só
      cita "diagnósticos de saúde" numa cláusula genérica de sigilo, sem mandar
      coletar nada — sem base normativa para criar um cadastro de saúde de pessoa.
- [x] Vínculos: departamento(s)/congregação/cargo/função — **sem mudança de código**.
      Os 4 Departamentos (crianças/jovens/senhoras/homens) são categorias
      demográficas, 1 por pessoa por natureza (confirmado com o usuário). O "plural"
      do roadmap era sobre ministérios de serviço (louvor, mídia, missões etc.), que
      já têm solução pronta: qualquer um com permissão `"pessoas"` cria um Órgão novo
      (`GetOrgaos`) e uma pessoa já pode ter Assento em vários Órgãos ao mesmo tempo
      (`Assentos` já é N:N).

#### v1.8 — Importação e exportação

- [x] Importação de planilha Excel (matrícula + nome + situação — parsing 100% no
      navegador via SheetJS, com tela de revisão de duplicatas por matrícula exata
      e por similaridade de nome ≥90%, decisão linha a linha pelo operador).
- [x] Function `ImportarPessoas` (rota `pessoas/importar`).
- [x] Botão "Baixar modelo" (.xlsx de exemplo gerado no navegador).
- [x] Filtros novos na lista de Pessoas: Congregação e Situação (client-side).
- [x] Exportação de rol de membros com seleção de colunas (checkboxes), 100% no
      navegador, a partir da lista já filtrada (busca + categoria + congregação +
      situação).

#### v1.9 — Registros especiais do membro

*(Gap identificado em varredura Estatuto/Regimento completa)*

- [x] Registro de Casamentos ministrados pela igreja (Reg. Art. 83): celebrante,
      modalidade, data de habilitação civil (validade de 90 dias, vedado celebrar
      nos últimos 5 dias — avisa, não bloqueia, por ser registro histórico),
      confirmação de registro em cartório — hoje só o batismo tinha rastro
      (`DataBatismo`); cônjuge por matrícula (se membro) ou nome livre.
- [x] Licença Eclesiástica automática por candidatura política (Reg. Art. 157 §2º):
      obreiro candidato entra em licença 90 dias antes do pleito, perde o púlpito
      (Assentos/Liderança/Cargo encerrados via `shared/vacancia.js`); Diretoria
      decide o retorno pós-eleição — status específico `LICENCA_CANDIDATURA`,
      distinto do `LICENÇA` genérico já existente em `StatusMembro` (v1.6).
- [x] "Meus Dados" (LGPD, autoatendimento): trava real de consentimento (mesmo
      padrão da Foto, v1.7) — o consentimento `DADOS_CONTATO` foi generalizado
      pra cobrir "dados sensíveis" em geral, não só contato, e passou a travar
      a visualização completa. Exibição reescrita: nada de `JSON.stringify` cru,
      cartões com rótulos em português e datas formatadas.
- [x] Submenu em "Meu Painel" (pré-requisito de UX): dividido em 3 sub-abas na
      barra lateral (Meu Perfil / Meus Dados (LGPD) / Cartas de Trânsito) —
      mecanismo (`.submenu-aba`/`.btn-subaba`) genérico, pronto pra reaproveitar
      em Órgãos quando crescer do mesmo jeito.

#### v1.10 — Reforma da aba Pessoas + autoatendimento de Foto

A aba Pessoas foi a primeira construída (FASE 0) e nunca tinha recebido o mesmo
tratamento de navegação de "Meu Painel" (v1.9): abrir "Pessoas" mostrava de cara
um formulário de ~25 campos antes da lista, e cada linha tinha 5 botões soltos
(Editar/Histórico/Foto/Casamentos/Licença) numa tabela larga que quebrava até em
notebook. Padrão de UI adotado — **master-detail** (lista enxuta + visão de
detalhe) — confirmado como prática consolidada de mercado.

- [x] Submenu lateral com 2 sub-abas: **Cadastrar Pessoa** (formulário em branco)
      e **Buscar Pessoas** (filtros + import/export, v1.8 + lista enxuta —
      Matrícula/Nome/Congregação/Status/Situação, uma única ação "Ver Perfil").
- [x] **Perfil da Pessoa** (aberto a partir de "Ver Perfil"): abas horizontais —
      Dados (leitura formatada, reaproveita `linhaLgpd`/`formatarValorLgpd` da
      v1.9), Editar, Histórico, Foto, Casamentos, Licença Candidatura, Vínculos
      Familiares — consolida os 5 botões soltos que existiam antes. "Desligar"
      vira ação fixa no cabeçalho do Perfil, fora das abas.
- [x] Autoatendimento de Foto (`api/MinhaFoto`, novo): até aqui só a Secretaria
      conseguia subir a foto do membro (`UploadFotoMembro`, permissão `"pessoas"`)
      — o próprio membro não tinha onde ver/trocar a própria foto pelo Meu
      Painel. Novo bloco em "Meus Dados (LGPD)", mesma trava real de
      consentimento (`ConsentimentosLGPD` Tipo='FOTO') que já existia do lado
      Secretaria.
#### v1.11 — Autoedição de dados + Fila de Aprovações

Fecha o item que tinha ficado documentado (não implementado) na v1.10, seguindo
a classificação de campos definida em conversa com o usuário: só vale pedir o
dado que a Secretaria realmente usa pra algo. Quatro categorias:

- **Nunca editável** (dado único, corrige só em caso de erro registrado):
  Matrícula, Nome. *(CPF entraria aqui também, se um dia o sistema passar a
  coletar — hoje não coleta.)*
- **Controlado só pelos fluxos formais do sistema** (não é campo de formulário
  livre): Status/Situação (Disciplina/Perda de Membresia/Licença por
  Candidatura), Cargo Ministerial/Função (só via Consagrações).
- **Membro edita direto, sem aprovação** — implementado agora:
- [x] Telefone/E-mail/Endereço/Estado Civil (`api/AtualizarMeusDados`) — bloco
      "✏️ Atualizar meus dados" no Meu Painel (Meu Perfil).
- [x] Vínculos Familiares (`api/MeusVinculosFamiliares`, novo) — mesma validação
      de `GestaoVinculosFamiliares` extraída pra `shared/vinculosFamiliares.js`
      e reaproveitada pelos dois; o membro cadastra os próprios parentes.
- **Membro sugere, Secretaria aprova antes de valer** (campos que entram em
  cálculo/registro formal — `shared/estatuto.js` usa Data de Nascimento/
  Admissão pra capacidade eleitoral): Data de Nascimento, Data de Admissão,
  Data de Batismo, Forma de Admissão, Origem, Igreja Anterior, Data/Nome/
  Ministrante do Rito de Recebimento (fixo em código,
  `shared/camposEdicaoPessoa.js`) — implementado agora:
- [x] `api/SolicitarEdicaoPessoa` (novo): o membro propõe (Meu Painel → Meu
      Perfil → "📨 Solicitar correção de dados"), guarda valor atual + valor
      proposto por campo (`SolicitacoesEdicaoPessoa`/`SolicitacoesEdicaoCampos`,
      migração 024).
- [x] **Fila de Aprovações** (`api/GestaoFilaAprovacoes`, novo submenu em
      Pessoas): cada campo é aprovado ou rejeitado separadamente, ou tudo de
      uma vez ("Aprovar tudo") — só o que for aprovado muda em
      `MembroReferencia`; cada decisão gera um registro próprio na Auditoria
      (`registrarAuditoria`, append-only, sem mudar isso).
- [x] Filtro por data (De/Até) na aba Auditoria — o backend (`ListarAuditoria`)
      já aceitava, só faltava o campo em tela.

### FASE 2 — Governança (órgãos e deliberações)

#### v2.0 — Submenu por órgão na aba Reuniões (pré-requisito de navegação)

**Bloqueante**: precisava ser feito antes de qualquer conteúdo de órgão desta
fase (v2.1 em diante) — do contrário cada órgão novo (CLI, Diretoria, Conselho
Fiscal, CEI) ia se acumular na mesma tela genérica de "Reuniões", piorando
exatamente o problema que o submenu de "Meu Painel" (v1.9) já resolveu ali.
Mesma lógica, aplicada agora à aba Reuniões.

**Escopo confirmado**: só os 5 órgãos estatutários já cadastrados (tabela
`Orgaos`, seed da migração 001 — `ASSEMBLEIA_GERAL`, `CLI`,
`DIRETORIA_EXECUTIVA`, `CEI`, `CONSELHO_FISCAL`). A escala de órgãos locais/
regionais/de área (potencialmente centenas, um por Congregação/Área/Região) fica
**fora** deste item — incerta, registrada como pergunta em aberto pra outra hora,
não é compromisso.

**Decisão de arquitetura (importante pra qualquer módulo futuro por órgão)**: a
tabela `Orgaos` já tem CRUD completo (`api/GetOrgaos`, aba "Órgãos" da Secretaria
— Editar/Excluir de verdade). Ou seja, o submenu **não podia** ser 5 blocos
fixos no HTML — se alguém editasse ou excluísse um órgão ali, o submenu de
Reuniões ficaria desatualizado ou quebrado. Por isso o submenu é **gerado
inteiramente em runtime** a partir de `GET /api/orgaos` (`montarSubmenuReunioes`,
chamado toda vez que a aba Reuniões é aberta) — nenhuma sigla, nome ou
quantidade de órgão fica hardcoded em lugar nenhum do front-end. Um único bloco
de conteúdo (`abaReunioes`) é reaproveitado e reconfigurado por
`selecionarOrgaoReunioes(orgaoId)` a cada troca de órgão no submenu, em vez de 5
sub-abas duplicadas — mais simples de manter e já serve de modelo pros módulos
por órgão das próximas versões (v2.3+ Composição/Atas/Deliberações): mesmo
padrão de submenu dinâmico, conteúdo próprio de cada tela.

100% front-end — `GET /api/reunioes?orgaoId=` e `POST /api/reunioes/abrir` já
aceitavam `orgaoId`, nenhuma mudança de backend nem de migração foi necessária.

- [x] Sidebar: submenu (`.submenu-aba`/`.btn-subaba`, mesmo mecanismo do v1.9)
      embaixo do botão "Reuniões", com um botão por órgão — montado em runtime,
      não fixo.
- [x] `app/index.html`: `abaReunioes` com um único formulário "Abrir Reunião" e
      uma única lista de reuniões, ambos escopados ao órgão do submenu via
      `<input type="hidden" id="reuniaoOrgao">` (sem `<select>` de órgão, sem o
      filtro `reunioesFiltroOrgao`, que deixou de existir). `blocoFrequencia`
      continua único e compartilhado.
- [x] O bloco de Elegíveis da Assembleia Geral (lista) passa a ficar dentro de
      `#blocoElegiveisAssembleia`, mostrado só quando o órgão selecionado tem
      `sigla === "ASSEMBLEIA_GERAL"`. A importação por planilha que existia aqui
      foi **removida no v2.2**: duplicava o mesmo upsert de matrícula+nome que
      "Importar Pessoas" (aba Pessoas, `api/ImportarPessoas`) já faz — dois
      lugares divergentes pra cadastrar a mesma gente. Só sobrou a listagem
      (calculada, `GET /api/assembleia/elegiveis`); pra incluir/atualizar gente
      em lote, usa-se exclusivamente a aba Pessoas.
- [x] `app/script.js`: `montarSubmenuReunioes()` busca `GET /api/orgaos` e gera um
      `.btn-subaba` por órgão; `selecionarOrgaoReunioes(orgaoId)` troca o órgão em
      foco (nome no título, visibilidade do bloco de Elegíveis, estado `.ativo`
      dos botões) e recarrega a lista — uma implementação só, reaproveitada por
      qualquer quantidade de órgãos que existir na tabela no momento.

#### v2.1 — Assembleia Geral (sessão e quórum)

- [x] ✅ Motor de sessão + quórum de instalação em 2 estágios (Art. 21).
      — ✅ v0.3: motor virou órgão-agnóstico de verdade (aba única **Reuniões**, com
      prioridade por escopo em vez de trava global — Assembleia exclusiva, demais
      órgãos só travam contra si mesmos) e ganhou a gestão de `Assentos` (cadeira
      institucional) que faltava pra composição mista da CLI funcionar. Ver seção 2.5.
- [x] Lista de votantes calculada (capacidade ativa — Art. 23 §1º) — já era
      calculada, nunca marcada: `GET /api/assembleia/elegiveis`
      (`GestaoElegiveisAssembleia`), exibida em "Elegíveis Atuais". Nunca é
      marcação manual (Art. 7º §1º) — recalculada a cada leitura a partir de
      idade/admissão/dízimo/disciplina (`shared/estatuto.js`).
- [x] Registro de presença (check-in por matrícula) + acesso restrito (Art. 22) —
      `RegistrarPresenca` só aceita check-in de quem está no `universoDoOrgao`
      (capacidade ativa + livre de disciplina), então quem não tem direito
      simplesmente não consegue registrar presença.
- [x] Classificação AGO (dezembro) / AGE (a qualquer tempo) (Art. 17) + Convocação
      por Edital com prazos (10/5/15 dias — Art. 20) — v2.1: `Sessoes` ganhou
      `DataConvocacao`/`DataPrevista`/`Pauta`/`MeiosDivulgacao` (migração 025) e
      um novo status `CONVOCADA`, anterior a `ABERTA`. `shared/estatuto.js` ganhou
      `validarConvocacaoAssembleia` (AGO só em dezembro; prazo mínimo por tipo —
      `PRAZOS_CONVOCACAO_DIAS`). Fluxo em 2 passos, só pra Assembleia Geral (os
      outros 4 órgãos continuam abrindo reunião na hora, sem essa exigência):
      **Convocar** (`api/ConvocarAssembleia`, `POST /api/assembleia/convocar`,
      já com antecedência) → **Iniciar** (`api/AbrirReuniao` aceita `sessaoId`
      de uma convocação pendente em vez de `descricao`, só libera quando
      `hoje >= DataPrevista`). Front-end: bloco "📋 Convocar Assembleia" +
      "Convocações Pendentes" (com contagem regressiva), visível só quando o
      órgão selecionado no submenu de Reuniões é a Assembleia Geral.
- [x] Editar/Cancelar convocação pendente — enquanto `Status='CONVOCADA'` (antes
      de Iniciada), dá pra corrigir tipo/data/pauta/meios/senha ou cancelar de
      vez (`POST`/`DELETE /api/assembleia/convocar/{sessaoId}`). Depois de
      Iniciada (`ABERTA`) não mexe mais aqui — vira reunião de verdade, com o
      "Encerrar" de sempre (inalterado, `EncerrarReuniao`) aparecendo assim que
      abre, igual a antes.
- **Convocação Independente da Presidência (1/5 dos membros, CLI, CF ou CEI —
      Art. 20 §3º/§4º): decidido deixar FORA do sistema, de propósito.** É um
      recurso raro, usado só quando a Presidência se recusa ou fica omissa —
      cenário que normalmente já implica crise/conflito interno, onde não dá
      pra contar com todo mundo tendo acesso ao sistema no mesmo dia. Nesse
      caso a lista de adesão (assinaturas) é feita em papel, fora do sistema;
      o sistema só entra depois, se for preciso contestar a contagem de
      quórum/votantes contra o que já está calculado aqui. Construir isso no
      sistema também multiplicaria opções de convocação sem necessidade real —
      as pautas que justificariam uma AGE especial já têm órgão próprio pra
      tratar (CLI, Conselho Fiscal, CEI); só compensa convocar Assembleia
      quando for competência privativa dela mesma (Art. 18 — ver v2.2).

#### v2.2 — Assembleia Geral (pautas especiais)

- [x] Competências privativas (Art. 18): eleger, destituir, reformar, aprovar contas,
      autorizar alienação, homologar Pastor Presidente, ratificar CLI — quem convoca
      escolhe as **matérias** (`shared/estatuto.js`, `MATERIAS_PRIVATIVAS_ASSEMBLEIA`),
      não mais o tipo/prazo/quórum direto: `derivarClassificacaoAssembleia` calcula
      `tipoSessao`/`quorumTipo`/prazo mínimo a partir delas — fecha a brecha de
      convocar "AGE Especial" pra assunto que não é competência privativa de
      verdade (os outros órgãos já têm alçada pra tudo o mais).
- [x] Quórum de reforma estatutária/destituição (Art. 21 II: 1/3 em 2ª convocação +
      reconvocação em 15 dias) — `estatuto.avaliarQuorumReformaDestituicao`, aplicado
      quando `quorumTipo='REFORMA_DESTITUICAO'`. Reconvocação (Art. 21, II, "c") via
      `VinculadaSessaoId` (migração 001, só passou a ser usado agora), permitida uma
      única vez, botão "🔁 Reconvocar" na tela de frequência de uma sessão ENCERRADA
      sem quórum. Reforma do Núcleo Fundamental (Art. 70/71) é a mesma matéria com a
      flag `reformaNucleoFundamental`, e usa `quorumTipo='REFORMA_DIFICULTADA'`
      (90% dos presentes) — só informativo, já que o sistema não tem recurso de
      votação em lugar nenhum (não há como "verificar" o resultado, só calcular
      quantos votos favoráveis 90% representa).
- [x] Controle de acesso: vedado a estranhos, suspensos e em transferência (Reg.
      Art. 142) — "estranhos"/suspensos já eram cobertos (`universoDoOrgao` só
      inclui quem tem capacidade eleitoral ativa). Faltava quem já tem Carta de
      Mudança **emitida** mas ainda não recebido em outra igreja (Art. 142, III):
      `shared/universo.js` (`membrosComCartaMudancaEmitida`) exclui esses membros
      da lista de votantes e do check-in, reaproveitado também por
      `GestaoElegiveisAssembleia` (que tinha sua própria query, divergente até aqui).

#### v2.3 — CLI (composição e sessões)

- [x] Composição mista (Art. 15): ordenação (Pastores, Evangelistas, Presbíteros) +
      função (Diretoria, CF, CEI, Dirigentes) — a lógica (`shared/universo.js`,
      `composicaoCLI`) já existia desde o v0.3 (usada só pro cálculo de quórum);
      v2.3 deu a ela uma tela própria, dentro do submenu CLI da aba Reuniões
      (mesmo lugar que a Assembleia já usa) — `GET /api/cli/composicao`
      (`api/ComposicaoCLI`) mostra como cada um entra (Ordenação/Função, e se
      Função foi herdada de Diretoria/Conselho Fiscal/CEI), sempre real, nunca
      mascarado (mesmo princípio de Elegíveis da Assembleia).
- [x] Assentos da CLI (cadeira cativa + por função) — reaproveita
      `api/GestaoAssentos` (já genérico, nenhuma mudança de backend), só com
      front-end próprio restrito às 2 cadeiras que se abrem DIRETO na CLI
      (Art. 15 §1º, II, "d"/"e" — Dirigente de Congregação, Líder Geral de
      Departamento/Secretaria — um `<select>` fechado, não texto livre);
      titulares de Diretoria/Conselho Fiscal/CEI continuam cadastrados nos
      órgãos deles (aba Órgãos, campo livre, inalterado) e entram na CLI por
      herança automática, sem duplicar cadastro.
- [x] Sessão mensal com quórum 2 estágios (Art. 24) — já rodava desde o v0.3
      (`estatuto.avaliarQuorumInstalacao`, `ORGAOS_COM_QUORUM_DOIS_ESTAGIOS`
      inclui CLI); "último domingo do mês" não é validado como trava (não tem
      convocação formal pra CLI como a Assembleia tem — abre na hora), fica
      como calendário/rotina, não bloqueio de sistema.
**Descartado de propósito, permanentemente** (conversado com o usuário — não é
"depois", é fora do sistema pra sempre): Deliberações por maioria simples
(Art. 25), Ratificação Posterior (Art. 19), Voto de Minerva/veto presidencial
(Art. 25 §§1º/2º) e Sigilo Corporativo (Art. 26). Motivo: numa reunião real,
as decisões são tomadas informalmente ("levantem a mão", "unanimidade", "maioria
e pronto") — não tem como o sistema registrar isso com fidelidade sem alguém
digitar voto a voto depois, e ninguém vai abrir o site no meio de uma reunião de
igreja pra fazer esse lançamento. Mesmo racional já usado pra descartar a
Convocação Independente da Presidência (v2.1). Fica só no Regimento/prática,
sem tentativa de espelhar no sistema.

**Comparecimento obrigatório: 3 faltas consecutivas = exclusão automática
(Art. 27) — movido pra logo antes da FASE 8**, ver `v7.9` abaixo. Motivo:
Art. 69 do Regimento diz que a cada 3 meses o domingo da reunião da CLI vira
"Sessão da AFM" em vez de reunião comum — contar faltas certo exige saber
quais sessões da CLI também são sessões da AFM, e a AFM é o módulo inteiro da
FASE 8. Decidido (conversado com o usuário) implementar isso **junto** com a
AFM, não antes — construir a contagem de faltas agora ficaria errado assim
que a AFM nascer, e teria que ser refeito.
      **Nota (v0.3):** conversa com o usuário levantou que existe (ou vai existir) um
      órgão "Academia" que se alterna com a CLI a cada 3 meses pra treinar
      Presbíteros/Evangelistas/Pastores, e as faltas dos dois deveriam **somar** pro
      mesmo contador de 3 (são "órgãos de fusão" pra esse fim, mesmo com calendário
      diferente — não é conflito de horário, é o mesmo Art. 27 valendo pros dois).
      Não dá pra implementar isso ainda: nem a Academia existe como órgão, nem o
      contador de 3 faltas em si existe (é esse item aqui, ainda `[ ]`). Quando
      ambos nascerem, essa soma entre órgãos "fundidos" precisa entrar no desenho.
- [ ] Verificação de perda de assento por faltas.

#### v2.4 — CLI (Comissões Permanentes)

Das 5 comissões do Regimento (Art. 19-23), 3 já dão pra fazer com o que o
sistema já tem — as outras 2 dependem de peça que ainda não existe.

- [x] **CFO** — Comissão de Finanças e Orçamento (Art. 20): calculada
      automaticamente (titulares do Conselho Fiscal + 1º/2º Tesoureiro da
      Diretoria, via `Assentos` — `shared/comissoes.js`, `composicaoCFO`),
      sem cadastro manual.
- [x] **CEP** — Comissão de Ética Parlamentar e Decoro (Art. 21): calculada
      automaticamente (membros do CEI, via `Assentos` —
      `composicaoCEP`), sem cadastro manual.
- [x] **CCJ** — Comissão de Constituição, Justiça e Redação (Art. 19): única
      com cadastro manual de verdade (eleita pelo Plenário, não deriva de
      nenhum outro dado) — tabela `ComissaoMembros` (migração 028), máximo 3
      membros ativos, `api/GestaoComissoes` (`POST /api/comissoes/ccj`,
      `.../encerrar`). Tela dentro do submenu CLI de Reuniões, junto de
      Composição/Assentos (mesmo "tudo da CLI na tela dela" do v2.3).
CDER (Art. 22), CME (Art. 23) e o Parecer das comissões em 15 dias (Art.
24-25 do Regimento) **não ficam aqui** — cada um já está registrado como item
próprio no lugar onde nasce de verdade: CDER em `v8.1` (precisa do Reitor da
AFM), CME em `v9.2` (precisa do cargo "Secretário de Missões") e o Parecer
das comissões em `v2.8` (precisa do modelo `Pautas`, que nasce ali). Não é
pra voltar em v2.4 pra conferir — quando chegar a hora dessas versões, o item
já está lá. **v2.4 está fechado** com isso.

#### v2.5 — Diretoria Executiva

- [x] Composição (Art. 29): os 10 cargos (Presidente, 4 Vice-Presidentes, 3
      Secretários, 2 Tesoureiros) são fixos — `shared/diretoria.js`
      (`CARGOS_DIRETORIA`), 1 titular ativo por cargo, validado em
      `api/GestaoAssentos`. Tela própria dentro do submenu Diretoria Executiva
      de Reuniões, mesmo padrão "tudo do órgão na tela dele" do v2.3/v2.4.
- [x] Mandato 2 anos (Art. 30): reaproveita `Assentos.duracaoMeses` (já
      calculava `DataTerminoPrevisao` na leitura desde o v0.3) — formulário
      da Diretoria já vem com 24 meses padrão, posse em qualquer data que a
      Secretaria informar.
- [x] Incompatibilidade Diretoria/Conselho Fiscal/CEI (Art. 38 §3º, II — "é
      vedado o acúmulo de cargos entre" os 3): `validarIncompatibilidadeExecutiva`,
      chamada em `GestaoAssentos` sempre que o órgão alvo for um desses 3 —
      bloqueia a criação do assento, com mensagem citando o artigo.
- [x] Vacância/sucessão presidencial (Art. 32): calculada
      (`calcularSucessaoPresidencial`) — quando o Assento do Presidente é
      encerrado, acha o Vice-Presidente ativo de menor ordem (1º→4º) ou, sem
      nenhum, o membro mais antigo do CEI; conta os prazos do Art. 32 §2º/§3º
      (90 dias indicação CIADSETA + 30 dias AGE) a partir da data de
      encerramento — mesmo princípio de prazo calculado na leitura já usado
      em Abandono/Disciplina/Cartas. `GET /api/diretoria/sucessao`
      (`api/SucessaoPresidencial`), só leitura — o sistema não convoca nada
      sozinho, só avisa.
- **Fora de escopo por natureza, não "adiado"** (conversado com o usuário):
  - Assinatura Conjunta (Art. 31) — acontece no banco/no papel; o sistema não
    tem como verificar quem assinou o quê de verdade.
  - Atribuições do Presidente/Secretários/Tesoureiros (Art. 33/35/36) — é
    texto descritivo do que cada cargo faz na vida real, não uma
    funcionalidade — fica só como referência no Estatuto, não vira código.
- [x] Livre nomeação/exoneração de cargos não eletivos (Art. 37) — já coberta
      por `Assentos` (criar/encerrar) + permissão `GLOBAL` já existentes;
      nada novo construído aqui.

#### v2.6 — Conselho Fiscal

- [x] Assentos: 3 titulares + 3 suplentes, mandato = Diretoria (Art. 43) —
      `shared/diretoria.js` generalizado (`CARGOS_CONSELHO_FISCAL`,
      `CATALOGOS_CARGOS_POR_ORGAO`), mesmo padrão "1 titular por cargo fixo"
      da Diretoria (v2.5), validado em `api/GestaoAssentos`. Incompatibilidade
      com Diretoria/CEI (Art. 38 §3º, II) já cobria `CONSELHO_FISCAL` desde o
      v2.5, nada novo ali. Tela própria dentro do submenu Conselho Fiscal de
      Reuniões.
- [x] Sessão mensal (Art. 46) — já funciona pelo motor genérico de Reuniões
      desde o v2.0; "preferencialmente no terceiro domingo" não virou trava
      de dia (mesmo raciocínio já usado pra CLI, Art. 24) — não é obrigatório
      ser exatamente esse dia, então não bloqueia.
- [x] Vedação de nepotismo (Art. 43 §3º, I — parentesco até 2º grau) —
      **`shared/parentesco.js` nasceu aqui**, como estava planejado desde o
      v0.2 ("não faz sentido construir antes de ter um primeiro consumidor
      real"): BFS profundidade 2 sobre `VinculosFamiliares` (que só tem 4
      tipos, todos já até 2º grau — cobre também combinações derivadas, tipo
      avô/neto ou cunhado). Validado em `GestaoAssentos` contra a Diretoria
      Executiva ativa. **Limitação documentada**: a vedação também cita
      "Tesoureiros de Departamentos", mas esse cargo não é rastreado em
      lugar nenhum do sistema hoje — só a parte da Diretoria é verificável.
- [x] Medidas cautelares de proteção patrimonial (Art. 45) — só a parte que o
      sistema controla de verdade: registra a decisão (sempre) e **executa**
      a suspensão do próprio acesso ao sistema (`api/GestaoMedidasCautelares`,
      migração 029) — reaproveita `Lideranca.AtivoAte`, coluna que já existia
      desde a migração 001 mas nunca era checada em lugar nenhum (`api/
      LoginSecretaria` corrigido). Contas bancárias e chaves físicas (§1º, I
      e III) ficam só como registro histórico da decisão, não uma ação
      automática — o sistema não tem como mexer em banco nem em fechadura.
      Prazo de 30 dias pro relatório de auditoria (§2º) calculado na leitura,
      mesmo padrão de Abandono/Cartas/Disciplina.
      **Trava de segurança (achada pelo usuário, corrigida)**: "suspender
      acesso ao sistema" nunca pode tirar a última pessoa com a permissão
      `"permissoes"` — senão ninguém mais consegue gerenciar acesso/senha de
      ninguém depois, nem desfazer a própria medida. Mesma trava aplicada em
      `api/GestaoLideranca` (remover liderança), gap que já existia antes do
      v2.6 e foi corrigido junto.
- Fiscalização contábil (Reg. Art. 145: balancetes, talões, parecer mensal,
  ata própria) **não fica aqui** — depende de dados financeiros que ainda não
  existem (FASE 4); vira item de verdade em `v4.1` (Tesouraria), não
  pendência solta.

#### v2.7 — Órgãos de Apoio, Departamentos e Congregações

- [x] Dirigente de Congregação como Assento tipo FUNCAO ligado à CLI.
      **Sem cadastro manual**: em vez de um Assento próprio, `composicaoCLI`
      (`api/shared/universo.js`) calcula direto de `Lideranca` (join
      `Papeis.Nivel = 'CONGREGACAO'`) — a Secretaria já mantém quem é
      dirigente de cada congregação pra dar acesso de login a ela; a CLI só
      lê essa mesma fonte. Escala sozinho de 30 pra 80 congregações sem
      recadastro nenhum, e reflete troca de dirigente na hora (calculado na
      leitura, mesmo padrão do resto do sistema). "Líder Geral de
      Departamento/Secretaria" (mesmo comentário do código) continua
      dependendo de Assento manual — só resolve quando o item abaixo existir.
- [x] Catálogo de Departamentos Gerais e Secretarias Adjuntas (Art. 47).
      Resolvido com **coluna `Tipo`** no catálogo existente (migração 030),
      não uma tabela nova: `UCADESPA/UMADESPA/USADESPA/UHADESPA` = `DEPARTAMENTO`
      (por faixa etária/gênero), `EBD/FAMILIA/SEMIADESPA/ACAO_DA_FE` =
      `SECRETARIA_ADJUNTA` (transversal). Aparece agrupado em dois `<optgroup>`
      no cadastro de pessoa e como campo `select` na tela de Catálogos
      (`GestaoCatalogos`, CRUD genérico — nenhum handler novo).
      **Líder Geral de Departamento/Secretaria**: novo papel (`Papeis.Nivel =
      'DEPARTAMENTO'`) concedido pela mesma tela de Permissões já usada pra
      todo o resto da Governança Escalonada desde o v0.1 (Global/Distrito/
      Quadrante/Região/Área/Congregação/Extensão — linha 223 deste README) —
      só acrescenta `DEPARTAMENTO` como mais um escopo válido
      (`ESCOPO_TIPOS_VALIDOS`/`ESCOPO_NIVEIS`), não cria mecanismo paralelo.
      Ganha assento automático na CLI pelo mesmo caminho do Dirigente de
      Congregação (v2.7 item 1): `composicaoCLI` (`shared/universo.js`) lê
      direto da `Lideranca` por `Papeis.Nivel`, sem Assento manual — resolve
      de vez a pendência "Líder Geral" citada desde os v2.5/v2.6. Contato do
      Líder Geral já está coberto pelo Telefone/E-mail do cadastro de pessoa
      (migração 008), nenhum campo novo precisou ser criado.
      **Fora de escopo, por decisão deliberada:** ministérios internos
      (louvor, adoração, coreografias, grupos de teatro, serviço voluntário
      etc.) não são modelados — são todos atividades derivadas de um dos 8
      Departamentos/Secretarias acima, não entidades de governança próprias.
- [x] Pastores de Área e Áreas Estratégicas (Art. 48). **Já coberto pela
      infraestrutura existente, sem código novo**: "Áreas Estratégicas" do
      Art. 48 é a própria `Areas` (Nível 2 da Governança Escalonada, já
      cadastrada desde o v0.1); "Pastor de Área" já é um Papel
      (`Nivel = 'AREA'`) desde a migração 002, concedido pela mesma tela de
      Permissões de sempre. **Importante — não generaliza pros níveis
      acima**: conferido no Regimento (Art. 104-B e seguintes) que Região
      (Nível 3) é geridas por um colegiado (CRA + TER), não por um "Pastor de
      Região" — o próprio Regimento diz que "Dirigentes de congregação comum
      não têm assento no CRA, sendo representados pelos seus Pastores de
      Área". Quadrante (Nível 4) é presidido por um Vice-Presidente dentro do
      CEQ, também colegiado, e ainda "nível de ativação futura". Essas
      estruturas (CRA/TER/CEQ) não existem no sistema — ficam pra FASE 9
      (Expansão), não são Art. 48 e não usam o padrão "Pastor de X". Também
      confirmado que Pastor de Área **não** ganha assento automático na CLI —
      o Art. 15 §1º, II é uma lista fechada que não o inclui (diferente de
      Dirigente de Congregação/Líder Geral, itens 1 e 2 acima).
- [x] Termo de Compromisso de Gestão do Dirigente (Art. 57). Implementado
      como bloqueio real de acesso, não um registro decorativo — mesmo
      espírito do consentimento de LGPD (`GestaoConsentimentoLGPD`, do "Meu
      Painel"), mas travando de fato: `shared/termos.js` cataloga os termos
      (texto + versão); `TermosAssinados` (migração 031) grava quem assinou
      qual versão de qual termo. `auth.exigirLogin` — ponto único já usado por
      `exigirPermissao`/`exigirAlgumaPermissao`/`exigirNivelGlobal`, ou seja,
      toda rota protegida do sistema — barra com 403 se sobrar termo
      pendente; `GestaoTermos` (rota `termos/{tipo?}`) usa
      `exigirLoginIgnorandoTermos` de propósito, pra não travar a própria
      assinatura, e devolve um token novo já sem o pendente ao assinar.
      **Dois termos, não um só** (ampliado a pedido do usuário na mesma
      conversa): "Termo de Compromisso de Gestão e Fidelidade Doutrinária"
      (Art. 57 do Estatuto) só pra quem tem papel `Nivel = 'CONGREGACAO'`
      (Dirigente); "Termo de Confidencialidade e Sigilo de Dados" (Regimento
      Art. 132 + Lei 13.709/18) pra **todo mundo** que loga na Secretaria,
      citando a infração disciplinar já catalogada ("Violação de Dados,
      Sigilo e Uso Indevido de Imagem"). `VersaoTermo` existe justamente pra
      permitir editar o texto manualmente depois (o usuário pediu isso): mudar
      a versão em `shared/termos.js` faz quem já assinou a antiga voltar a
      ficar pendente, sem apagar o histórico de assinaturas anteriores (prova
      documental, Art. 57 §2º).
- [ ] ~~Autonomia de arrecadação/gasto dos departamentos (Art. 49)~~ — não dá
      pra construir sem aba Financeira. Movido de verdade pra `v5.4`
      (Tesouraria central por departamento), que já é sobre isso e já vem
      depois de FASE 4 (Financeiro) e de v5.2 (Relatórios departamentais) —
      **v2.7 está fechado** com isso.

#### v2.8 — Enquetes e Tramitação de Projetos/Pareceres

**Reformulado por completo** — o escopo original ("Pautas/Votos", eleição
formal de Diretoria/Conselho Fiscal com apuração ao vivo) esbarrava no mesmo
problema já resolvido no v2.3 pro CLI: deliberações de plenário (Art. 25,
maioria simples) foram **descartadas permanentemente** ali porque "numa
reunião real as decisões são tomadas informalmente... ninguém vai abrir o
site no meio de uma reunião pra fazer esse lançamento". Investigação +
conversa com o usuário levaram a um formato diferente, que evita esse
problema:

- [x] **Enquetes** (`Enquetes`/`PerguntasEnquete`/`OpcoesEnquete`/
      `PublicoEnqueteCustom`/`RespostasEnquete`, migração 034 — substitui a
      032 original, que era só 1 pergunta por enquete; ver nota abaixo;
      `api/GestaoEnquetes`; `shared/enquetes.js`): pra pautas que nascem e se
      resolvem **fora** de uma sessão formal (ex: escolha do Tema do Ano,
      votação de camiseta de festa, inscrição de seminário). **Formulário
      com várias perguntas** (tipo Google Forms) — uma Enquete pode ter N
      Perguntas, cada uma com seu próprio tipo (Opções ou Texto livre);
      responder é atômico: manda as respostas de todas as perguntas numa
      chamada só, nada é gravado se faltar alguma. **Visibilidade** (Pública
      — aparece quem respondeu o quê, tipo lista de inscrição; ou Secreta —
      só contagem agregada + quem participou, nunca o quê cada um escolheu,
      pra evitar retaliação) e **público** (todos os membros ativos,
      reaproveitando `universoDoOrgao`, ou uma lista customizada de
      matrículas) continuam no nível do formulário, não da pergunta. 1
      resposta por pergunta por pessoa (`UNIQUE` em `RespostasEnquete`);
      `MembroId` sempre é gravado internamente (antifraude), mesmo nas
      secretas — só a API de leitura nunca expõe o vínculo resposta↔pessoa
      nesse caso. **Nota da migração 034**: dropou e recriou as tabelas da
      032 (criadas minutos antes, sem dado real de igreja ainda) pra ir
      direto pro modelo de 2 níveis, em vez de migração incremental de nada.
- [x] **Vinculante**: mesma engine, com uma flag extra pra quando a eleição/
      reforma da Assembleia (Art. 18) for realmente contestada — o usuário
      foi claro que isso não é o padrão ("quando todo mundo já sabe o
      resultado, abrir o site é perda de tempo, não tem prova maior que o
      olho de quem tá lá presente"), só entra em jogo no cenário polêmico.
      Só faz sentido pra formulário de **exatamente 1 pergunta**, tipo
      Opções — validado na criação. `QuorumTipo` (Maioria simples / Dois
      terços / 90% — Art. 71, Núcleo Fundamental) + `avaliarAprovacaoEnquete`
      (`shared/estatuto.js`) calcula `ResultadoAprovado` de verdade ao
      encerrar — diferente de `avaliarQuorumReformaDificultada` (v2.2), que
      era só informativo porque nada registrava voto por pessoa; agora
      registra.
- [x] **Tramitação de Projetos e Parecer das Comissões** (Regimento, Art.
      24-25 — vinha adiada do v2.4): etapa que antecede uma Enquete
      vinculante. `Projetos`/`PareceresComissao` (migração 033;
      `api/GestaoProjetos`): todo projeto protocolado já nasce despachado pra
      CCJ + a comissão temática escolhida (CFO ou CEP), que têm 15 dias
      (calculado na leitura, mesmo padrão de `ProcessosDisciplinares`) pra
      emitir parecer — reaproveita `shared/comissoes.js` pra validar que só
      quem é da comissão certa emite o parecer dela. Regime de urgência (Art.
      24 §2º, 2/3 do Plenário) é só **registro** do que já foi decidido
      fisicamente — mesmo racional do "descartado" no v2.3, o sistema não
      verifica votos de plenário ao vivo.
- **"Derrubada de veto presidencial" (item do escopo original) não existe —
  corrigido na varredura**: o Regimento (Art. 25, Parágrafo Único) diz
  explicitamente que o veto do Pastor Presidente sobre resolução da CLI **é
  definitivo, sem mecanismo de derrubada**. Não há o que construir; a matéria
  vetada só pode ser reapresentada com nova redação (novo `Projeto`, mesmo
  modelo acima) ou submetida à Assembleia Geral quando for competência dela.
- **Eleição completa de Diretoria Executiva/Conselho Fiscal e fluxo de
  candidatura** (`elegivelDiretoriaConselhoFiscal`/`elegivelCEIouDepartamentos`,
  já calculados desde o v0.1) usam a mesma Enquete vinculante acima quando
  precisar — não é um modelo `Pautas`/`Votos` à parte; não há item adicional
  de código aqui.
- **Compatibilidade futura, não construída agora**: a mesma engine de
  Enquetes (tipo Texto livre, público Lista customizada) já serve de base
  pras entrevistas personalizadas de Consagração citadas pelo usuário nesta
  conversa — registrado aqui pra quando chegar a hora, sem precisar
  redesenhar.

#### v2.9 — Documentos e Alerta de Registro

**Reformulado a pedido do usuário** — cortou o que não faz sentido construir
e manteve só o que é real:

- [x] **Function de Documentos** (`api/GestaoDocumentos`, tabela `Documentos`
      já existia desde a migração 001, nunca tinha endpoint): catálogo de
      **referências** a arquivos que já existem (ata já assinada fora do
      sistema, termo escaneado, memorando, parecer) — nunca edita conteúdo.
      Upload vai pro Azure Blob Storage, container `documentos-institucionais`
      (privado + URL assinada de 1h — mesmo padrão de `shared/storage.js` já
      usado pra foto de membro desde o v1.7, agora generalizado pra qualquer
      container sem mudar o comportamento da foto). Tipos: Ata, Termo de
      Posse, Memorando, Parecer, Regimento (alteração), Outro.
- [x] **Alerta de prazo de registro em cartório** (Art. 75: 30 dias pro
      Secretário lavrar+entregar a ata, 45 dias pro Presidente protocolar) —
      parte do mesmo endpoint: quando o Documento é `Tipo=ATA` e o
      `ReferenciaId` aponta pra uma `Sessao` real, calcula na leitura
      (`estatuto.diasDesde`, mesmo padrão de `ProcessosDisciplinares`) e
      acende aviso visual quando vencido.
- **Geração de Ata (PDF) — descartada permanentemente.** Mesmo racional já
  usado pra descartar deliberação de plenário da CLI (v2.3) e derrubada de
  veto (v2.8): não existe editor de texto no sistema, e montar um mecanismo
  de assinatura eletrônica de verdade (nível ICP-Brasil/GOV.BR) seria peso
  desnecessário pro caso de uso. O fluxo real já resolve sozinho: o
  Secretário escreve a ata fora do sistema (Word), exporta PDF, assina no
  ITI/GOV.BR, e só DEPOIS sobe o arquivo pronto pelo item acima.
- **Registro do Regimento no RTD (Art. 161) — não é isso que o sistema faz.**
  O registro em si é um ato cartorial externo, fora do alcance de qualquer
  software. O que o sistema faz é catalogar cada alteração/versão do
  Regimento como mais um Documento (`Tipo=REGIMENTO`) — reaproveita o item
  acima, não é feature nova, e não finge fazer um registro que não faz.
- **Motor de Termos/modelos — não é mais gap, já foi construído no v2.7**
  (Termo de Compromisso de Gestão + Termo de Confidencialidade,
  `shared/termos.js`, bloqueio real via `auth.exigirLogin`). Falta só
  **Termo de Posse (Art. 117, Regimento)**: tem texto oficial fixo
  ("transcrição obrigatória") com CPF do Dirigente e CNPJ da Igreja, que o
  sistema não guarda (decisão deliberada de não duplicar dado sensível — ver
  v0.1/v1.7). Diferente dos outros dois termos (aceite digital simples), esse
  exige assinatura física de verdade. **Usuário decidiu deixar de fora por
  enquanto** — sem gerar modelo nenhum pra isso agora; quando for retomado,
  o caminho natural é gerar um rascunho com os campos que o sistema sabe
  (nome, congregação, data) e o resto preenchido à mão, e o PDF assinado
  sobe depois pelo item Documentos acima (`Tipo=TERMO_POSSE`).

#### v2.10/v2.11 — descontinuadas como versões próprias

**v2.10 "Transição de gestão" e v2.11 "Correspondência oficial e ciclo
normativo" saíram do roadmap como versões separadas** — eram itens de uma
varredura automática do texto legal (marcados *"gap da varredura"*, nunca
foram pedido do usuário), e a análise mostrou que **tudo que é real neles já
é coberto pelo catálogo de Documentos (v2.9)**, sem precisar de tabela,
endpoint ou tela nova:

- [x] Art. 42 (Comitê de Recepção e Consulta Pastoral): só acontece em
      vacância presidencial rara, é uma entrevista + parecer subjetivo — não
      tem o que computar. O parecer final vira só mais um Documento
      (`Tipo=PARECER_COMPATIBILIDADE`).
- [x] Art. 42-A §1º (Relatório de Transição): inventário de bens, senhas,
      obras em andamento — é um documento entregue na troca de liderança,
      vira `Tipo=RELATORIO_TRANSICAO`.
- [x] Ofícios/Representações à Convenção: os prazos que isso deveria
      controlar (Art. 18 §II, Art. 32 §§2-3, Art. 75 §4) **já estavam
      calculados** desde o v2.5 (`calcularSucessaoPresidencial`) e o v2.9
      (prazo de cartório) — o ofício em si vira `Tipo=OFICIO`.
- [x] Art. 162-B (ciclo de revisão do Regimento a cada 4 anos): o resultado
      da revisão também é só um Documento (`Tipo=REGIMENTO`, já existia).
      Usuário decidiu **não** construir lembrete automático pra esse ciclo —
      a Secretaria confere manualmente quando for a hora.
- Art. 42-A §2º (Mentoria de Liderança via AFM) e a condução do próprio
  Comitê de Recepção (entrevista) **ficam fora do sistema por natureza** —
  são processos pastorais/institucionais, não dado nem tela.

Os 3 novos tipos (`PARECER_COMPATIBILIDADE`, `RELATORIO_TRANSICAO`,
`OFICIO`) foram só mais 3 opções no dropdown que já existe em Arquivos —
zero código de back-end novo.

### FASE 3 — Disciplina e Ética

#### v3.1 — CEI (Corte Suprema Eclesiástica)

O CEI já existia como Órgão cadastrado (usado desde o v2.5 em incompatibilidade
e composição da CLI) — faltava a tela própria e o catálogo de cargos que o
eleva ao papel de Corte Suprema do Regimento.

- [x] Composição: 7 titulares + 2 suplentes (Reg. Art. 88 §1º) —
      `CARGOS_CEI` em `shared/diretoria.js`, mesmo padrão "1 titular por
      cargo fixo" do Conselho Fiscal, tela própria dentro do submenu Reuniões.
- [x] Requisitos (Art. 88 §2º) — **checagem informativa**, não trava a
      criação do assento: `shared/estatuto.js::avaliarElegibilidadeCEI` +
      `shared/cei.js` (busca os dados) + endpoint
      `GET /api/elegibilidade-cei/{membroId}`. Calculado de dado real, nunca
      cadastro manual: Oficial Superior = `MembroReferencia.CargoMinisterial`
      IN (PASTOR, EVANGELISTA); Presbítero 5+ anos = tempo desde a
      `Consagracoes` concluída "a Presbítero"; formação teológica avançada =
      `Matriculas_AFM` (nível AVANÇADO/BACHAREL + Certificado de Habilitação);
      reputação ilibada = sem `ProcessosDisciplinares` com sanção/exclusão
      nos últimos 10 anos. **Formação secular em Direito não é rastreada em
      lugar nenhum do sistema** — vira aviso ("confirme manualmente"), não
      reprovação automática; por isso o botão "Checar elegibilidade" só
      orienta o Pastor Presidente na indicação (Art. 89 §1º), quem decide
      continua sendo ele.
- [x] Mandato 2 anos (Art. 89 §3º) — reaproveita `Assentos.duracaoMeses`
      (mecanismo já existente desde o v2.5/v2.6), campo pré-preenchido com
      `24` na tela.
- [x] Incompatibilidade com Diretoria/Conselho Fiscal (Art. 38 §3º, II) — já
      funcionava genericamente desde o v2.5 (`ORGAOS_INCOMPATIVEIS` já
      incluía CEI); nada de novo aqui.
- [x] Vedação de nepotismo até 2º grau com a Diretoria Executiva na hora da
      posse (Estatuto Art. 38 §2º — mesma regra do Conselho Fiscal, Art. 43
      §3º, I) — `GestaoAssentos` estendido de `orgaoSigla ===
      "CONSELHO_FISCAL"` para incluir `"CEI"`, reaproveitando
      `shared/parentesco.js::existeParentescoAte2Grau` sem mudar a função.
- **Descartado**: indicação pelo Pastor Presidente + sabatina/homologação
  pela CLI e destituição por 2/3 (Art. 89) — não tem como colocar no sistema
  "o Presidente indicou e foi sabatinado pela CLI"; se o Assento existe no
  sistema é porque isso já aconteceu fora dele. Não é um evento verificável
  nem registrável de forma útil — fica de fora.
- **Descartado/fora de escopo, com nota**: incompatibilidade com Mesa
  Diretora/Vice de Quadrante/Superintendente Regional (Art. 90 §1º) — esses
  cargos não são rastreados em lugar nenhum do sistema (só Diretoria
  Executiva/Conselho Fiscal/CEI existem como Órgãos com Assento). Impedimento
  por parentesco até 3º grau (Art. 91) **não é a mesma coisa** que a vedação
  de posse acima: é uma recusa/suspeição *por caso* (o réu ser parente do
  conselheiro que vai relatar aquele processo específico), e o sistema ainda
  não tem designação de relator de processo disciplinar para pendurar essa
  checagem — fica pro v3.2 (Processo disciplinar), se fizer sentido lá.
  Segredo de Justiça Eclesiástica (Art. 92, rito fechado sem gravação):
  decisão do usuário — não dá para modelar isso no sistema; o sigilo
  estrutural que já existe (`ProcessosDisciplinares.Sigiloso`, default 1)
  é tudo que cabe aqui.

#### v3.2 — Processo disciplinar (abertura, citação, defesa) + catálogo de infrações

O núcleo (`AbrirProcessoDisciplinar`, `EvoluirProcessoDisciplinar`,
`ProcessosDisciplinares`) já existia desde a v0.2, com `Motivo` em texto
livre. Esta versão sobrepõe o rito do Regimento (Art. 100-103) e — puxado
para frente do v3.3, por pedido direto do usuário ("a pessoa tem que dizer
o que a pessoa infringiu, uma ou mais opções") — o catálogo estruturado de
infrações (Art. 96-99), que substitui o texto livre isolado.

- [x] Catálogo `TiposInfracao` (Art. 96-99, as 52 infrações dos 4 artigos,
      migração `036_processo_disciplinar_rito.sql`) via `GestaoCatalogos`
      (que ganhou permissão configurável por catálogo — `permissao:
      "disciplina"` neste, os demais continuam em `pessoas`, sem mudança de
      comportamento). Abertura de processo agora exige `infracoesIds`
      (1 ou mais, tabela `ProcessoInfracoes`) — `motivo` vira detalhamento
      complementar opcional, não mais o único campo.
      **Aviso sobre reforma do Regimento**: o texto das infrações não muda,
      mas a estrutura (itens em letra viram artigo numerado) está sendo
      reformulada — o sistema não detecta isso sozinho (o Regimento é um
      `.txt` estático), então a tela do catálogo traz um aviso fixo pedindo
      revisão manual da coluna `ReferenciaRegimento` quando a nova numeração
      sair. Sem lembrete automático — não tem como o sistema saber quando
      o texto novo é publicado.
- [x] Abertura de processo (partes + infrações) — "denúncia" formal e
      designação de "partes" no sentido processual completo não são
      rastreadas (só quem abre e contra quem); relator, sim, é designado.
- [x] Designação de relator (`DESIGNAR_RELATOR`) — suspeição por parentesco
      até 3º grau (Art. 91) ou mesma congregação é **só aviso**, não
      bloqueia (é discricionário do órgão julgador, mesmo padrão informativo
      da elegibilidade do CEI, v3.1). `shared/parentesco.js::
      existeParentescoAte2Grau` ganhou parâmetro opcional de profundidade
      (default 2, usado aqui com 3) — as 2 chamadas existentes (Conselho
      Fiscal, CEI) continuam em 2º grau, sem mudança de comportamento.
- [x] Citação por WhatsApp ou Carta Registrada (Reg. Art. 101) — só
      registro (`DataCitacao`/`CanalCitacao`); o envio real acontece fora do
      sistema. Testemunhas (até 3) não são rastreadas — texto livre, se
      necessário, cabe no detalhamento do caso.
- [x] Prazo de defesa prévia: 5 dias corridos a partir da citação
      (`estatuto.js::avaliarPrazoDefesa`, calculado na leitura). Revelia
      (`emRevelia`) = prazo vencido sem `REGISTRAR_DEFESA` — exibida como
      badge, o julgamento com presunção dos fatos continua sendo decisão de
      quem julga, não automática.
- [x] Defensor eclesiástico ou advogado constituído (Art. 102) —
      `DESIGNAR_DEFENSOR`, texto livre (`DefensorNome`), já que pode ser
      alguém não cadastrado no sistema (advogado externo).
- [x] Esteira ganha o status intermediário `AFASTAMENTO_CAUTELAR`
      (`AFASTAR`, Art. 100) — `JULGAR` já aceitava qualquer status ≠
      `JULGADO`, então passou a funcionar a partir desse estado sem
      qualquer mudança de lógica.

#### v3.3 — Código Penal Eclesiástico (graduação e infrações financeiras)

O catálogo `TiposInfracao` em si já foi construído no v3.2 (puxado para
frente) — esta versão só termina de qualificá-lo.

- [x] Graduação de infrações: `TiposInfracao` ganhou a coluna `Gravidade`
      (LEVE/MEDIA/GRAVE/GRAVISSIMA, migração
      `037_infracoes_gravidade.sql`), preenchida a partir do texto do
      próprio Regimento (chapéu de cada artigo: Art. 97 e 98 são
      "infrações de natureza gravíssima" por inteiro; Art. 96 tem piso
      GRAVE, com GRAVISSIMA nos incisos que citam Exclusão Sumária/crime
      hediondo; Art. 99 é "advertência, suspensão ou destituição", piso
      mais baixo). Editável depois pela tela de catálogo (permissão
      `disciplina`) — é dado de referência, não fórmula fixa. Exibida como
      badge na abertura de processo (por infração) e na listagem (a mais
      grave entre as citadas no processo).
- [x] Infrações de intervenção (Reg. Art. 144): as 4 hipóteses ("gatos" de
      energia/água, atraso de repasse, despesas pessoais, ausência de nota
      fiscal) entraram no mesmo catálogo `TiposInfracao` (`ART144-*`), com
      gravidade GRAVE nas 3 primeiras e MEDIA na última — mesmo molde, sem
      tabela nova.

#### v3.4 — Julgamento e sanções

- [x] Catálogo `TiposPenalidade` (Art. 95 §2º: Advertência / Suspensão Temporária /
      Disciplina Rigorosa / Exclusão), via `GestaoCatalogos` (migração
      `038_penalidades_reintegracao.sql`). JULGAR com resultado SANCAO agora exige
      escolher a penalidade (EXCLUSAO resolve a sua sozinha, pelo `Codigo`).
- [x] Vacância automática de `Assentos`/`Lideranca`/Cargo Ministerial por nível de
      pena (`shared/vacancia.js::encerrarVinculos`) — antes só disparava em EXCLUSAO;
      agora também dispara quando a penalidade escolhida é Disciplina Rigorosa (Art.
      95 §2º, III — perda definitiva de mandato). Advertência e Suspensão Temporária
      não tocam em Assentos.
- [x] Suspensão automática de voto/ser votado/cargos durante sanção — já em v0.2
      (`estaSobDisciplina()`, mascarado por permissão), **refinado** em
      `shared/disciplina.js`: Advertência nunca suspende (Art. 95 §2º, I — não impede
      Ceia); Disciplina Rigorosa fica suspenso indefinidamente até a Prova de
      Reintegração ser aprovada, ignorando `DataTerminoPrevisao` (Art. 77 — sem prazo
      fixo); demais casos continuam pela data.
  - **Bug corrigido junto** (achado durante a investigação, não pedido original):
    `CONDICAO_SQL_ATIVO` não incluía `Status = 'AFASTAMENTO_CAUTELAR'` (status que o
    v3.2 introduziu) — alguém afastado cautelarmente continuava contando como
    capacidade eleitoral ativa. Corrigido.
- [x] Término automático da sanção (dias) → retorno à comunhão — já em v0.2 (calculado
      na leitura, sem job/timer).
- [x] Sigilo do processo com efeito funcional real — nova permissão `cei` (seedada
      nas mesmas 2 roles globais que já tinham `disciplina` desde o início). Quem não
      tem `cei` e não é o relator designado do processo só vê que ele existe (nome,
      órgão, situação, prazos); motivo, infrações, relator e defensor somem da
      listagem (`shared/disciplinar.js::redigirSeSigiloso`), substituídos só pela
      contagem de infrações.
- [x] Julgamento pelo CEI (jurisdição dupla para ministros, Art. 103 §1º, II): CIADSETA
      é a Convenção Estadual, entidade **externa**, sem representação nenhuma no
      sistema — não tem como processar/homologar nada dela aqui. Vira só um aviso
      informativo (`envolveMinistro`, calculado de `CargoMinisterial`) exibido na
      listagem quando o réu é Pastor/Evangelista, mesmo padrão já usado pra outras
      referências à CIADSETA (v3.1, sucessão presidencial v1.5).

#### v3.5 — Reabilitação e retorno (Art. 77 Regimento)

- [x] Prova de Reintegração Ética (Art. 77 §2º) — nova ação
      `REGISTRAR_PROVA_REINTEGRACAO` (Aprovado/Reprovado), só cabível para quem foi
      julgado com Disciplina Rigorosa (a única penalidade sem prazo fixo de dias —
      Suspensão Temporária já retoma sozinha quando os dias terminam). Enquanto não
      aprovada, a pessoa fica marcada `emCarenciaAdministrativa` (badge na tela) e
      continua sob disciplina (ver v3.4).
- [x] Carência administrativa após o fim da pena — **reaproveita o mecanismo de 90
      dias de integração já existente desde o v1.2** (`DIAS_INTEGRACAO`,
      `estatuto.js`): não precisou de código novo. O "retorno" de função em si (dar de
      volta Cargo Ministerial/Assento) continua sendo recadastro manual normal — o
      sistema não guarda snapshot do cargo anterior pra restaurar sozinho
      (`vacancia.js` só zera).
- [x] Histórico disciplinar no perfil do membro — já existia parcialmente desde o v1.6
      (`api/HistoricoMembro`, evento `DISCIPLINA_CONCLUSAO`, atrás da mesma permissão
      `disciplina`); só faltava a granularidade — agora mostra também a penalidade e
      os dias de sanção.

#### v3.6 — Escada territorial de instâncias (JAI/JEA/TER)

`OrgaosLocais` (v0.1) era só um catálogo solto — nenhuma tabela referenciava
(`ProcessosDisciplinares.OrgaoResponsavelId` só apontava pros 5 órgãos
centrais). Escopo definido pelo usuário: não dá pra construir processo/tela
pra cada um dos ~9 órgãos territoriais do Regimento (composição, quórum,
agenda, malote de contas...) sem reaproveitar nada do que já existe — então
esta versão focou só na peça que reaproveita 100% do motor de Processo
Disciplinar (v3.2-v3.5): a escada **disciplinar** territorial.

- [x] Corrigido o nome do JAI semeado na migração 007 (estava "Junta
      Administrativa da Igreja" — o Regimento, Art. 105, chama de **Junta de
      Articulação Institucional**).
- [x] `ProcessosDisciplinares` aceita órgão territorial (`OrgaoLocalId`,
      `OrgaosLocais`) como alternativa aos 5 órgãos centrais (exatamente 1
      dos dois preenchido) — abrir processo numa JAI/JEA/TER específica.
- [x] **JAI** (Art. 108): só pode julgar Arquivado/Advertência/Suspensão
      Temporária até 90 dias — tentar Exclusão/Disciplina Rigorosa é
      bloqueado, orientando recurso.
- [x] **JEA** (Art. 122-123): mesma trava de competência que a JAI (não
      pode finalizar Exclusão/Disciplina Rigorosa — precisa encaminhar).
- [x] **Recurso JAI→JEA / JEA→TER** (Art. 108 §3º/123, prazo de 5 dias
      corridos da conclusão, calculado na leitura): nova ação `RECORRER` —
      cria um processo **novo** na instância superior (nunca reabre o
      original), copiando as mesmas infrações; original vira `EM_RECURSO`.
- [x] **TER** (Art. 126-C): 3ª e última instância territorial, pode votar
      Exclusão/Disciplina Rigorosa, mas só produz efeito (vacância de
      Assentos/Liderança/Cargo Ministerial) após **homologação do CEI**
      (Art. 94, II) — nova ação `HOMOLOGAR_EXCLUSAO`, exige a permissão
      `cei` (v3.4). Até homologar, fica com badge "Aguardando homologação".
- [x] **Criação automática dos órgãos territoriais** — o usuário corrigiu o
      método logo depois de ver a v3.6: não é pra cadastrar `OrgaosLocais`
      manualmente, é pra CRIAR SOZINHO junto com a unidade territorial.
      `api/GestaoCatalogos/index.js::criarOrgaosAutomaticos` dispara ao
      criar uma Área, Região, Quadrante ou Distrito (via `POST /api/catalogos/
      {areas,regioes,quadrantes,distritos}`) e já insere os órgãos daquele
      nível vinculados por `Nivel+ReferenciaId`: Área → JEA + JUC; Região →
      CRA + TER + CRAF; Quadrante → CEQ + CAQ; Distrito → CDE (Congregação →
      JAI já funcionava assim desde a migração 007). Migração
      `040_orgaos_locais_automaticos.sql` faz o backfill de quem já existia
      antes dessa mudança. Cadastro manual do catálogo `orgaosLocais`
      continua existindo, mas só serve pra ajustar Nome/Ativo depois —
      nunca mais pra criar o vínculo em si.
- [x] **Quem é membro de cada órgão territorial + Reuniões territoriais** —
      reaproveita 100% o mecanismo Papel+Escopo (`Lideranca`) que já dava
      acesso a Dirigente de Congregação/Pastor de Área. Migração
      `041_orgaos_territoriais_papeis_reunioes.sql` seeda Papéis novos
      (Membro da JAI/JEA/JUC/CRA/TER/CRAF/CEQ/CAQ/CDE, `Nivel` = o
      `EscopoTipo` esperado). `shared/escopo.js` ganhou
      `membroAutorizadoNoOrgaoLocal` (sobe a cadeia territorial —
      Congregação→Área→Região→Quadrante→Distrito — e autoriza quem tem
      Lideranca `GLOBAL` ou de qualquer nível ancestral: um Pastor de Área
      autoriza tanto a JEA/JUC da própria Área quanto a JAI de qualquer
      Congregação dela) e `resolverOrgao` (generaliza
      `shared/disciplinar.js::validarOrgaoProcesso`, agora reaproveitado
      por Reuniões também). Fecha um buraco de segurança real: antes,
      qualquer um com a permissão `disciplina` podia julgar/agir em
      QUALQUER JAI/JEA/TER, mesmo sem vínculo algum com aquele território —
      agora `AbrirProcessoDisciplinar`/`EvoluirProcessoDisciplinar`
      (exceto `HOMOLOGAR_EXCLUSAO`, que é gate do CEI) e
      `AbrirReuniao`/`EncerrarReuniao` exigem esse vínculo quando o órgão é
      territorial.
      `Sessoes` ganhou `OrgaoLocalId` (mesmo padrão dual de
      `ProcessosDisciplinares`) — `AbrirReuniao`/`EncerrarReuniao`/
      `ListarReunioes`/`RegistrarPresenca`/`ListarFrequencia` generalizados.
      **Achado durante a implementação**: `shared/universo.js::universoDoOrgao`
      tinha um fallback perigoso pra território — sem `Assento` cadastrado
      (que nunca existe pra `OrgaosLocais`, já que `Assentos` só referencia
      `Orgaos`), caía pra "todo mundo ATIVO do sistema inteiro". Corrigido
      pra um fallback **escopado** (reaproveita
      `resolverEscopoCongregacoes`) — reunião de uma JAI pequena só computa
      falta pra quem é daquela congregação, nunca da denominação inteira.
- **Descartado, por decisão do usuário e falta de reaproveitamento de
  código**: competência administrativa/estratégica de JEA/CRA/CEQ/CDE
  (calendários, orçamento, planejamento territorial — gestão de rotina que
  já acontece fora do sistema); auditoria financeira JUC/CRAF (malote de
  contas, Selo de Regularidade Trimestral — feature à parte, sem
  reaproveitamento, só faz sentido com uma aba financeira territorial de
  verdade); ativação automática por CONTAGEM (Art. 104-C — ex: só ativar
  Área ao atingir 3 congregações) — diferente da criação automática acima,
  aqui os órgãos nascem junto com a unidade territorial, não por atingir um
  número mínimo; permanece descartado, sem reaproveitamento de código.

#### v3.7 — Ouvidoria Eclesiástica

- [x] Canal permanente de denúncias/sugestões (Art. 104 caput) — nova tabela
      `DenunciasOuvidoria` + aba própria (`abaOuvidoria`), aberta a
      **qualquer pessoa logada** (não exige nenhuma permissão específica
      pra abrir denúncia, "acessível a toda a membresia"). Tipos: Infração
      Ética/Assédio/Desvio Financeiro/Abuso de Autoridade/Sugestão.
- [x] Anonimato técnico de verdade (Art. 104 §2º) — quando `anonima=true`,
      `DenuncianteMembroId` **nunca é gravado** (nem passado pra
      auditoria) — não é mascarado na leitura como o sigilo do processo
      disciplinar, o dado simplesmente não existe no banco.
- [x] Protocolo de acompanhamento — gerado na abertura
      (`shared/ouvidoria.js::gerarProtocolo`, sequencial + sufixo
      aleatório), devolvido só naquele momento; consulta pública **sem
      login** (`GET /api/ouvidoria-protocolo/{protocolo}`, só devolve
      status/tipo/data, nunca relato ou identidade) — é a única forma de
      um denunciante anônimo acompanhar depois.
- [x] Vinculada ao NIF (nome atual do Conselho Fiscal, Art. 53 — mesma
      sigla `CONSELHO_FISCAL` já existente, sem sigla nova) + CEI — nova
      permissão `ouvidoria` pra quem opera o canal (papel de Ouvidor
      designado, Art. 104 §6º admite oficial interno ou empresa externa,
      por isso não é automático por Assento).
- [x] Restrição de acesso quando a Diretoria é parte denunciada (Art. 104
      §8º) — `shared/ouvidoria.js::redigirDenuncias` **remove a linha
      inteira** da listagem (não só redige campo) quando quem está vendo
      também tem Assento ativo na Diretoria Executiva e o denunciado
      também tem.
- [x] Encaminhamento pra Processo Disciplinar formal — ação
      `ENCAMINHAR_PROCESSO` reaproveita `shared/disciplinar.js::criarProcessoDisciplinar`
      (extraída de `AbrirProcessoDisciplinar` pra não duplicar validação),
      incluindo a mesma checagem de vínculo territorial (v3.6.2) quando o
      destino é uma JAI/JEA/TER.
- [x] Anonimização pós-conclusão (Art. 104 §9º) — ação `ANONIMIZAR`, exige
      a permissão `protecaodedados` (Encarregado de Dados, mesmo papel do
      LGPD já existente), só permitida em denúncia `ARQUIVADA`/`CONCLUIDA`
      — apaga `Relato`/`DenuncianteMembroId`, mantém tipo/datas/vínculo
      com o processo (rastro estatístico).
- **Descartado — são regras jurídicas, não mecanismo de código**: proteção
  legal contra retaliação (§4º) e infração gravíssima por quebra de sigilo
  (§5º) — o sistema não tem como "proteger" alguém de retaliação social/
  eclesiástica; estabilidade do Ouvidor durante apuração contra a Diretoria
  (§6º/§7º) — não há como o sistema impedir uma destituição real feita
  fora dele; gestão externa terceirizada (§3º) — sem integração com
  plataforma/auditoria externa.

### FASE 4 — Financeiro e Patrimônio

#### v4.1 — Tesouraria Local e Repasses (Entradas)

Digitaliza o "bloco de dízimo" físico + a folha de fechamento mensal
impressa hoje (planilha Excel): lançamentos de dízimo/oferta por
congregação com Termo nº gerado pelo servidor (nunca digitado à mão),
comprovante obrigatório em PIX, fechamento mensal com o rateio do
**Art. 118 sempre calculado na leitura** (40% retenção local / 60% repasse
à Tesouraria Geral, deduzindo antes aluguel e lote — validado batendo com
um relatório real de congregação), registro do repasse com comprovante, e
relatório em duas versões (completa, e versão "mural" sem os valores por
dizimista — mesmo padrão de redação condicional usado em Ouvidoria/
Disciplina). Perfis de acesso territoriais completos desde já — Tesoureiro
Local/Área/Região/Quadrante/Distrito/Geral, todos usando o mesmo motor
Papel×Escopo×Permissão já existente (nenhuma tela nova de "dar acesso":
são só mais Papéis na tela de Lideranca de sempre) — cada um enxerga
automaticamente as congregações do seu território, com consolidado e
drill-down. Módulo com entrada própria e destacada no painel (não misturado
na lista comum de abas), por lidar com dinheiro real — mesmo login/sessão
do resto do sistema.

- [x] Cadastro de dizimistas por congregação (`Dizimistas`) — substitui a
      planilha; aceita nome avulso pra quem não é dizimista cadastrado.
- [x] Lançamentos de entrada (`LancamentosTesouraria`) com Termo nº
      sequencial e contínuo por congregação, tipo (Dízimo/Oferta), forma de
      pagamento (Dinheiro/PIX/Misto — ver v4.1.1), travados assim que o mês
      fecha.
- [x] Fechamento mensal (`FechamentosTesouraria`): Total Recebido − Aluguel
      − Lote = Total Final, rateado pelo percentual de retenção local
      (Art. 118, editável por congregação em `GestaoParametrosTesouraria` —
      hoje 40/60, mas não hardcoded caso a Assembleia mude a regra).
      Imutável após criado (correção via novo lançamento auditado, não
      reescrita de histórico).
- [x] Registro do repasse à Tesouraria Geral com comprovante opcional.
- [x] Relatório completo (uso interno) e relatório "mural" (sem os valores
      por dizimista, pra afixar publicamente).
- [x] Perfis territoriais de acesso (Tesoureiro Local/Área/Região/
      Quadrante/Distrito — Geral já existia) + visão consolidada com
      drill-down por congregação dentro do escopo de cada um.

##### v4.1.1 — Flexibilidade real (a partir do processo físico de verdade)

Ajustes feitos a partir de como o bloco de dízimo funciona na prática, pra
não travar o Tesoureiro em situações reais que a v4.1 ainda não previa:

- [x] Comprovante de PIX/Misto agora é opcional na hora do lançamento —
      pode chegar depois (`PUT /tesouraria-lancamentos/{id}` anexa), fica
      marcado como "comprovante pendente" até lá. Antes exigia na hora, o
      que travava o fluxo quando a pessoa manda o comprovante só depois.
- [x] Pagamento misto (parte em dinheiro, parte em PIX no mesmo
      lançamento) — `FormaPagamento = 'MISTO'` + `ValorPix` (o restante do
      valor é considerado dinheiro).
- [x] Cancelamento nunca mais é exclusão — vira um cancelamento motivado
      que preserva o Termo nº e aparece no relatório como "CANCELADO —
      motivo", igual à folha arrancada do bloco físico (a numeração nunca
      pode simplesmente sumir, senão não bate com o talão original).
- [x] Transparência no "Meu Painel": quem é dizimista vinculado a um
      cadastro de membro vê o próprio histórico de contribuições
      (`MeusLancamentosTesouraria`, mesmo padrão de autoatendimento por
      matrícula de `MeusDadosLGPD`/`MinhaFoto` — pedido explícito do
      usuário por transparência).
- [x] Confirmado (já funcionava desde a v4.1, sem precisar de mudança):
      dizimista não precisa ser membro cadastrado — `Dizimistas.MembroId`
      é opcional, e o lançamento aceita nome avulso pra quem nunca foi
      cadastrado (visitante, cônjuge não-membro etc.) — "só crentes podem
      dizimar" não é "só membros podem dizimar".

##### v4.1.2 — Visualização e conciliação (feedback de uso real)

O v4.1/v4.1.1 tratava bem o *registro* da entrada, mas faltava a parte de
*acompanhamento* — a reação direta ao usar na prática foi "está muito cru".
Três lacunas concretas corrigidas:

- [x] **Lista de Dizimistas do Mês** (`RelatorioDizimistasMes`, sub-aba
      própria) — antes só existia a lista de LANÇAMENTOS (por termo); agora
      existe a lista de PESSOAS, cruzando o cadastro de dizimistas com quem
      já contribuiu no mês e quem ainda não (mais os avulsos que
      contribuíram sem estar cadastrados).
- [x] **Status de contabilização visível** — o dado já existia (um
      lançamento só entra num Fechamento quando o mês fecha), só não
      aparecia na tela. Agora toda linha mostra "Contabilizado" ou
      "Pendente de fechamento" claramente.
- [x] **Conciliação de PIX em lote** (`ConciliarPixTesouraria`,
      `ConciliacoesTesouraria`) — exigir 1 comprovante por PIX travava a
      agilidade real: agora dá pra marcar vários PIX/Misto pendentes e
      anexar UM extrato bancário só cobrindo a soma, em vez de abrir recibo
      por recibo. Continua podendo anexar comprovante individual quando faz
      mais sentido (não substitui, complementa).
- [x] **Forma do repasse à Tesouraria Geral** (`FechamentosTesouraria.FormaRepasse`)
      — o próprio repasse de 60% pode ser em PIX, depósito ou dinheiro
      entregue em mãos; antes só registrava que o repasse aconteceu, não
      como.

**Descartado desta versão (não é esquecimento — vira v4.1.3, depende dos
dados destas versões já existirem):** saldo virtual por órgão/departamento
(Reg. Art. 133-C — fase seguinte trata só Tesouraria Geral + Congregações,
não departamentos como UMADESPA/EBD), lançamentos de **saída**, conciliação
bancária mensal *do total do caixa* (a conciliação desta versão é só de
PIX, ver acima), teto de acumulação de caixa local de 10 salários-mínimos
com recolhimento automático do excedente (Reg. Art. 119), fiscalização
contábil formal do Conselho Fiscal (Reg. Art. 145). Também fica para depois
(precisa de meses de dados reais primeiro): recálculo automático de
`MembroReferencia.DizimistaFiel` a partir do histórico de lançamentos, em
vez do bit editado manualmente hoje.

##### v4.1.3 — Centro de Custo (caixa único de verdade)

Correção de modelo a partir de como a tesouraria funciona hoje de fato
(confirmado com o usuário): existe **uma única conta bancária** pra toda a
denominação — qualquer congregação deposita direto nela, não existe "a
congregação manda 60% pra Geral" como movimentação bancária real (o
dinheiro já está todo no mesmo lugar desde o depósito). O que existe é a
Tesouraria Geral conferindo o fechamento e **liberando** o saldo virtual
de 40% (Centro de Custo Local) pra congregação poder gastar.

- [x] `RegistrarRepasseTesouraria` agora exige nível **GLOBAL**
      (`auth.exigirNivelGlobal`-equivalente) — antes qualquer um com
      `financeiro` no escopo da própria congregação podia "se autoliberar",
      o que não faz sentido nesse modelo (quem confere e libera é sempre a
      Geral, nunca o próprio local).
- [x] Linguagem da UI corrigida pra refletir a direção certa: "Registrar
      repasse" virou "Tesouraria Geral: conferir e liberar"; status
      `REPASSADO`/`FECHADO` aparecem como "Saldo liberado" / "Aguardando
      liberação da Tesouraria Geral".
- [x] `ListarFechamentosTesouraria` ganhou os agregados de Centro de Custo:
      `centroCustoGeral` (liberado vs. pendente de conferência) e
      `porCongregacao` (saldo liberado vs. pendente de liberação por
      congregação) — visão na sub-aba Consolidado.
- **Decisão explícita — não fazer ainda:** quando um dia existirem contas
  bancárias por congregação (Regimento Art. 140 — CNPJ de filial), a
  liberação vira movimentação real entre contas e o endpoint muda; até lá
  é liberação de saldo dentro do caixa único, sem transferência de verdade.
- **Auditoria formal do Conselho Fiscal adiada de propósito** (decisão
  explícita — não compensa investir agora): a conferência da Geral hoje é
  simples (conferir e liberar); o fluxo completo de auditoria financeira
  (aceitar/rejeitar relatório, parecer formal) só faz sentido depois do
  módulo financeiro completo, incluindo **saídas** — fica pra mais adiante,
  junto com Fiscalização do Conselho Fiscal (Art. 145).

##### v4.1.4 — Categorias de Entrada (revertida e substituída pela v4.1.5)

Tentativa inicial: um `Tipo = 'OUTRA'` genérico com aprovação individual da
Geral. **Corrigido a partir de feedback direto do usuário** — ver v4.1.5.

##### v4.1.5 — Categorias de Entrada nomeadas (correção de rumo)

Não existe "outras entradas" genérica — pedido explícito, com justificativa
de compliance: um balde sem categoria nomeada é exatamente o tipo de
rubrica que esconde lavagem de dinheiro. A congregação tem várias fontes
de entrada reais e nomeadas (dízimo, oferta, entrada de departamento,
oferta de culto de departamento, secretaria, revista, congresso...) — cada
uma precisa ser uma categoria com nome próprio, não um "outros".

- [x] `CategoriasEntrada` — catálogo configurável (via `GestaoCatalogos`,
      mesmo padrão de Departamentos/Congregações — dá pra cadastrar mais
      categorias em Catálogos, sem mexer em código). `LancamentosTesouraria.Tipo`
      passa a ser o `Codigo` de uma categoria em vez de um enum fixo no
      código. Seed inicial: Dízimo, Oferta, Entrada de Departamento, Oferta
      de Culto do Departamento, Entrada de Secretaria, Entrada de Revista,
      Entrada de Congresso.
- [x] Todas as categorias passam pelo **mesmo fluxo** (lançamento →
      fechamento mensal → rateio 40/60 → liberação da Geral) — **sem**
      aprovação individual extra por categoria; a supervisão é o fechamento
      + liberação de sempre (v4.1.3), que já olha o mês inteiro.
- [x] `Descricao` (nota livre) fica disponível pra **qualquer** categoria,
      não só uma — e pelo menos um entre dizimista/nome avulso/descrição é
      sempre obrigatório (nunca existe uma entrada sem procedência
      identificada, é exatamente esse buraco que gera risco de compliance).
- **Revertido desta versão:** `Tipo='OUTRA'`, `StatusAprovacao`,
  `AprovarEntradaTesouraria` (removido) — não fazem mais sentido com a
  categorização nomeada.
- **Fechamentos mensais já são "automáticos"** por design desde a v4.1: o
  rateio 40/60 (Centro de Custo Local/Geral) é sempre **calculado a partir
  dos lançamentos**, nunca digitado — não existe "lançar de novo" o
  resultado de um fechamento.
- **Fora do escopo desta versão, registrado pra não esquecer:** um módulo
  de "contas a receber" (registrar um boleto/valor esperado antes de
  receber de fato) foi mencionado como ideia de pesquisa, mas não é uma
  entrada de dinheiro real — vira, se fizer sentido, uma peça própria
  depois que o essencial de entradas estiver maduro. Centro de Custo por
  Área/Região também não existe hoje (essas unidades não guardam dinheiro
  próprio, são coordenação) — só Local e Geral, como já é; Distrito pode
  vir a ter um centro de custo próprio no futuro, mas isso é história pra
  mais adiante.

##### v4.1.6 — Navegação por sub-módulos (pedido explícito)

Financeiro parou de abrir direto num formulário de "cadastrar dízimo" —
quem clica precisa entender logo de cara o que está procurando. Nova
sub-aba "Visão Geral" (`SUBMODULOS_FINANCEIRO`, `app/script.js`) vira a
porta de entrada: uma grade de cards, um por sub-módulo financeiro do
roadmap (README, FASE 4) — "Entradas" já funciona (leva pro que já existe
desde v4.1); os demais (Saídas, Orçamento, Patrimônio, Doações Online,
Auditoria) aparecem visíveis, mas marcados "Em breve" e desabilitados —
mostra o caminho sem fingir que já foi construído. Crescer aqui, quando
cada peça do roadmap for implementada, é só marcar `pronto: true` no
array — mesmo espírito do objeto `MODULOS` do painel principal (seção
2.6), um nível mais fundo.

### Referência de pesquisa (mercado + norma legal, 2026)

Pedido explícito do usuário: pesquisar sem se limitar a fontes
brasileiras ("não tenha dor de pesquisar") como sistemas financeiros de
verdade — ERP de grandes empresas, os melhores softwares de contabilidade
pra igreja/terceiro setor, e a norma contábil brasileira que rege
entidades sem fins lucrativos — organizam entradas, saídas, rateio e
auditoria, e usar isso pra reescrever o plano da FASE 4 inteiro numa
sequência única, sem duplicação, em ordem de dependência ("o que fazer
ponto a ponto pra não ter erro"). O que segue nesta seção é o resultado
dessa mesclagem: tudo que já vinha do Regimento + tudo que a pesquisa
trouxe, keyword por keyword — incluindo uma quarta rodada que respondeu
diretamente "isso é tudo, ou tem mais?": sim, tinha mais, duas peças
voltadas ao doador (doação online/recorrente, campanhas com meta) e duas
peças de projeção/patrimônio (fluxo de caixa projetado, depreciação de
ativo fixo) que plataformas de ponta como Pushpay/Tithe.ly e ERPs como
MIP/Nonprofit+ têm e que não estavam aqui ainda. Uma quinta rodada
respondeu "eu quero o pico, não porte médio": o que separa um ERP de
porte médio de um sistema de nível corporativo/bancário de verdade —
ancoragem externa da trilha de auditoria (à prova até de um administrador
com controle total do próprio sistema), monitoramento contínuo de
controles em vez de auditoria por amostragem, revisão periódica de
acessos, o princípio dos quatro olhos de verdade (dois aprovadores
independentes, não só hierarquia), orçamento contínuo (rolling forecast)
e gestão de investimentos/tesouraria avançada.

**Conclusão da pesquisa:** a arquitetura já construída em v4.1-v4.1.5
(Centro de Custo Local/Geral + Categorias de Entrada) segue exatamente o
padrão de **fund accounting simplificado** — não precisa reconstruir a
base. O que faltava pra "competir" com um sistema financeiro de verdade
é completar o outro lado da mesma moeda (Saídas), dar ao doador uma
experiência de ponta (doação online/recorrente), e formalizar o que já
existe em cima de normas e controles reconhecidos:

| Achado | Fonte | Onde entra no plano |
|---|---|---|
| Fund Accounting (fundo restrito/livre) | NetSuite, GivingArc, AlignMint, ChurchTrac, Aplos, Sage | v4.2 |
| Chart of Accounts (Plano de Contas) | NetSuite, Priority, Codejig | v4.2 |
| ITG 2002 (CFC, Res. 1.409/12) — **norma legal brasileira obrigatória** | CFC, CRCSC | v4.2, v4.9 |
| Cost allocation methods (valida o rateio 40/60 já existente) | BPM, CFO Selections, Onetribe | já implementado (v4.1) |
| Doação online/recorrente (Pushpay, Tithe.ly) — **descartada** (sem gateway de pagamento); redesenhada como autolançamento + confirmação do Tesoureiro | Pushpay, Tithe.ly | v4.3 |
| Campanhas de arrecadação com meta (pledge campaigns) | Tithe.ly | v4.4 |
| Accounts Payable + segregação de funções (maker-checker) | Ramp, ApprovalMax, Settle, PBMares, Council of Nonprofits | v4.5, seção 2.7 |
| Vendor Master Data (Cadastro de Fornecedores) | NetSuite, Eftsure, Corpay, Xelix | v4.5 |
| Fundo Fixo de Caixa (petty cash) | Aplos, Harvard Financial Policy | v4.5 |
| Accounts Receivable (Contas a Receber) | conceito geral de ERP | v4.6 |
| CNAB 240/400 (Febraban) — remessa bancária em lote | Febraban, Banco do Brasil, Sicredi | v4.7 |
| Orçado vs. Realizado + Empenho + Fluxo de Caixa Projetado | PLANERGY, Bill.com, AlignMint, Grain Ledger, Blackbaud, Aplos | v4.8 |
| Demonstrações ITG 2002 | CFC | v4.9 |
| Depreciação de ativo fixo | MIP, Nonprofit+, Nonprofit Accounting Basics | v4.11 |
| Hash chain / trilha de auditoria inviolável | pesquisa técnica geral (tamper-evident logs) | v4.12 |
| COSO Internal Control Framework (lente de revisão, não vira versão) | COSO.org, Diligent, Pathlock, Cherry Bekaert | v4.12 |
| KPIs de saúde financeira (meses de reserva, aplicação em atividades-fim, liquidez) | Sage, JMCO, Warren Averett, GivingArc | v4.12 |
| Open Finance Brasil (conciliação automática) | TecnoSpeed, Pluggy, Openi, Paytime | v4.13 |
| COAF/PLD-FT (Lei 9.613/98) — comunicação de operação suspeita, **obrigação legal** | AtlasGov, CFC, Compliance Brazil, VAAS | v4.12 |
| Ancoragem externa de timestamp (RFC 3161) — trilha inviolável até contra admin do próprio sistema | pesquisa técnica (blockchain anchoring) | v4.12 |
| Continuous Controls Monitoring (SOX 404) — controle monitorado o tempo todo, não só por amostragem | CloudEagle, Pathlock, Exabeam | v4.12 |
| Revisão periódica de acessos (access recertification) | TechPrescient, Pathlock | v4.12 |
| Princípio dos Quatro Olhos (dual control) — dois aprovadores independentes, não hierarquia | AICO, Hyperbots, SAP Community | v4.12 |
| Rolling forecast (orçamento contínuo, driver-based) | Cube, Prophix, Vena | v4.8 |
| Treasury Management System — gestão de investimentos, liquidez com margem de confiança | Gartner, Trovata, GTreasury | v4.14 |

#### v4.2 — Plano de Contas e Fundo Restrito/Livre

Fundação contábil que todas as versões seguintes dependem — precisa
existir antes do Orçamento (v4.8) e das Demonstrações (v4.9).

- [x] Registro de mapas de dízimos/ofertas por congregação, com numeração
      sequencial de "talão" — entregue em v4.1 (`LancamentosTesouraria`,
      Termo nº), já que não fazia sentido separar do fechamento/rateio.
- [x] **Plano de Contas** (`PlanoContas`) — catálogo hierárquico
      configurável (auto-referenciado, mesmo motor genérico de catálogo já
      usado em Congregações/Áreas — `pai.origem` apontando pra si mesmo)
      por trás de `CategoriasEntrada` (`CategoriasSaida` entra em v4.5) —
      semeado com uma estrutura mínima real (Ativo/Passivo/Patrimônio
      Líquido/Receita/Despesa, com sub-níveis) já compatível com as
      demonstrações da ITG 2002 (v4.9), não uma lista de categorias
      soltas. Tela própria dentro de Financeiro → Plano de Contas (não na
      aba genérica de Catálogos — é configuração exclusiva do módulo).
- [x] `CategoriasEntrada.TipoFundo` (`RESTRITO` | `LIVRE`) — fund
      accounting: Revista/Congresso já nascem `RESTRITO` (finalidade
      específica); Dízimo/Oferta/Departamento/Secretaria são `LIVRE`. A
      Saída (v4.5) correspondente só vai liberar gasto na mesma
      finalidade quando a entrada de origem for restrita.
- [x] **Correção de bug**: a tela de "Categorias de Entrada" nunca tinha
      sido de fato construída no front-end (v4.1.5 só criou o catálogo no
      backend) — o aviso "cadastre em Catálogos" no formulário de
      lançamento apontava pra um lugar que não existia. Corrigido junto.
- **Descartado (decisão explícita, 2026):** conferência/auditoria in loco
  pelo 2º Tesoureiro (Art. 36 §2º/41 II) — a visita física comparando o
  mapa físico com o dinheiro entregue deixa de fazer sentido com a
  conferência digital da Geral (v4.1.3); o 2º Tesoureiro participa dessa
  conferência pelo próprio sistema, não presa a uma tarefa manual
  separada.

#### v4.3 — Autolançamento do Dizimista com Confirmação do Tesoureiro

Pergunta direta do usuário ("tem mais coisa que pode ser feita?") levou à
proposta original de doação via PIX/cartão direto pelo Meu Painel — **mas
o próprio usuário barrou essa ideia**: a igreja não vai instalar/operar um
sistema de gerenciamento de pagamentos (gateway). Redesenhada em cima de
como o processo físico já funciona hoje: o bloco de dízimo é numerado
(Termo nº), e essa numeração é a prova que o dizimista guarda — mesmo que
alguém apague o registro no sistema (por mais que haja auditoria), a folha
física continua existindo enquanto a pessoa a guardar. O objetivo desta
versão é dar ao dizimista o equivalente digital dessa prova, sem nunca
processar pagamento nenhum:

- [x] **Autolançamento** (`AutolancamentoTesouraria`, rota pública por
      matrícula, mesmo padrão de auto-atendimento de
      `MeusLancamentosTesouraria`/`MeusDadosLGPD`) — o dizimista REGISTRA
      que já deu um dízimo/oferta (dinheiro ou PIX, fora do sistema; o
      sistema não processa nada) escolhendo categoria, valor, forma e mês.
      Nasce com `Origem='AUTOLANCAMENTO'`, `StatusConfirmacao='PENDENTE'`
      e **sem** Termo nº (`TermoNumero` agora é `NULL`-ável).
- [x] **Confirmação do Tesoureiro Local** (`ConfirmarAutolancamentoTesouraria`)
      — o Tesoureiro só confirma depois de efetivamente ver o
      dinheiro/PIX cair. **O Termo nº só é gerado nesse instante**
      (`shared/tesouraria.js::proximoNumeroTermo`), nunca no
      autolançamento em si — assim nenhum número de termo fica "furado"
      por algo que a pessoa disse que deu mas nunca chegou a ser
      confirmado. Rejeitar registra `MotivoRejeicaoConfirmacao` sem gerar
      termo.
- [x] **Comprovante = o próprio registro confirmado, sem gerar arquivo
      separado** (ajuste pedido explicitamente pelo usuário): uma vez
      `CONFIRMADO`, o lançamento aparece em Minhas Contribuições e o
      `DELETE` de `GestaoLancamentosTesouraria` passa a recusar
      permanentemente cancelá-lo — é o equivalente digital da folhinha do
      bloco físico, que nunca desaparece enquanto existir. Lançamentos de
      origem `TESOUREIRO` (digitados direto pelo Tesoureiro) continuam
      com o cancelamento-com-motivo de sempre (v4.1.1), sem mudança.
- [x] `FecharMesTesouraria` passa a exigir toda pendência de autolançamento
      resolvida (confirmada ou rejeitada) antes de fechar o mês, e soma
      só o que está `StatusConfirmacao='CONFIRMADO'` — dinheiro que
      ninguém confirmou ter recebido não entra no rateio 40/60.
- **Descartado (decisão explícita do usuário, 2026):** doação via PIX/
  cartão processada pelo próprio sistema e doação recorrente agendada —
  isso exigiria integrar um gateway de pagamento, o que a igreja decidiu
  não fazer. O Comprovante Anual de Contribuições (documento anual para
  uso do dizimista, calculado na leitura a partir do histórico já
  confirmado) segue como ideia válida e pode voltar como uma versão
  futura, sem depender de gateway nenhum.

#### v4.4 — Campanhas de Arrecadação com Meta e Sorteios

Pedido explícito do usuário: campanhas com meta personalizada por
congregação (ex: Congregação A meta R$1.000, Congregação B meta R$500,
visão geral da meta total somando todas) — e sorteios (números da sorte)
como parte da mesma funcionalidade, totalmente integrados.

- [x] **Campanhas** (`Campanhas`) com objetivo declarado e prazo.
- [x] **Meta personalizada por congregação** (`CampanhaMetas`, ex:
      Congregação A R$1.000, Congregação B R$500) — a meta geral e o total
      arrecadado (por congregação e no total) são **calculados na leitura**
      a partir das metas cadastradas e dos `LancamentosTesouraria`
      vinculados via `CampanhaId`, nunca digitados à mão. Progresso exibido
      com barra visual, tanto no total geral quanto no detalhe por
      congregação.
- [x] Toda campanha nasce com fundo **RESTRITO** — categoria de entrada
      própria (`CategoriasEntrada.Codigo = 'CAMPANHA'`, ligada à conta
      contábil 4.2.3, mesmo princípio de Revista/Congresso, v4.2) — o
      dinheiro arrecadado só poderá ser gasto na finalidade da campanha
      quando as Saídas (v4.5) existirem.
- [x] Contribuição de campanha pode vir por lançamento comum do Tesoureiro
      ou por autolançamento do dizimista (v4.3) — ambos aceitam
      `campanhaId` opcional, validando que a campanha existe e está ATIVA.
- [x] Encerrar/cancelar uma campanha é mudança de `Status`, nunca exclusão
      (mesmo princípio de v4.1.1) — quem já contribuiu continua com o
      registro preservado.
- **Adiado pra quando fizer sentido:** divulgação do progresso em versão
  "mural" (redação condicional sem expor quem doou quanto) — pode
  reaproveitar o mesmo padrão já usado no relatório de tesouraria (v4.1),
  mas não foi pedido agora; a visão de progresso hoje vive dentro de
  Financeiro → Campanhas.

##### v4.4.1 — Sorteio vira derivado da campanha, não um Tipo dela (correção de rumo)

Feedback direto do usuário depois de ver o v4.4 inicial: os cupons de um
sorteio são **físicos**, confeccionados numa gráfica, e vendidos pra
**qualquer pessoa** (não só membro/dizimista cadastrado no sistema) — não
fazia sentido o sistema controlar um número individual de cupom nem fazer
o "sorteio" sozinho (`VenderNumeroSorteio`/`SortearCampanha`, removidos).
Redesenhado como o usuário descreveu: o sorteio é um **derivado** de uma
campanha (uma campanha pode ter zero, um ou vários sorteios ligados a
ela) — o que diferencia um sorteio de uma arrecadação comum são os
**prêmios**, não a existência de um número controlado pelo sistema.

- [x] `Sorteios` — tabela própria, `CampanhaId` como pai (não mais
      `Campanhas.Tipo`), com nome, descrição, preço do cupom (só
      informativo, não gera lançamento individual), data prevista e
      status (`ATIVO` | `REALIZADO` | `CANCELADO`).
- [x] `SorteioPremios` — um ou mais prêmios por sorteio (1º prêmio, 2º
      prêmio...), cada um com o nome de quem ganhou preenchido **depois**
      que o sorteio físico acontece (gráfica/evento, fora do sistema) —
      é dado histórico registrado manualmente, não calculado.
- [x] O dinheiro arrecadado com a venda dos cupons continua entrando pela
      Tesouraria normal (lançamento com o `CampanhaId` da campanha-mãe,
      valor em lote conforme a prestação de contas de quem vendeu),
      sem vínculo a um comprador ou número individual.
- [x] Criar sorteio e registrar prêmio/ganhador é restrito a nível Global
      (mesmo princípio de `GestaoCampanhas`).
- **Removido do v4.4 inicial**: `CampanhaSorteioNumeros` (pool de números
  controlado pelo sistema), `VenderNumeroSorteio` e `SortearCampanha`
  (sorteio automático) — não fazem sentido pra cupom físico vendido ao
  público em geral.

#### v4.5 — Saídas: Contas a Pagar

Escopo grande demais pra uma entrega só (pedido explícito do usuário: dividir
em duas partes de três itens cada, "senão fica muito grande e pode deixar de
fazer algo que teria que ser feito"). v4.5 inteira já entregue, em duas
rodadas: primeira parte — a fundação (categorias, fornecedores, e o fluxo
completo de solicitação → aprovação → pagamento com os dois controles que já
não podiam esperar: segregação de funções e saldo nunca negativo); segunda
parte — os três controles complementares (duplicidade, 3 cotações, Fundo
Fixo de Caixa).

##### Primeira parte (entregue)

- [x] `CategoriasSaida` — catálogo espelhado de `CategoriasEntrada` (mesmo
      motor genérico de catálogo, tela dentro de Financeiro → Plano de
      Contas → Categorias de Saída), cada categoria marcada com o Centro
      de Custo que autoriza o gasto (`LOCAL` de uma congregação, ou
      `GERAL` consolidado, v4.1.3) e um `TipoFundo` (`LIVRE`|`RESTRITO`,
      espelha v4.2) — categoria restrita **exige** vincular a Saída a uma
      Campanha (v4.4) de origem e trava o gasto no que ela já arrecadou
      de fato (`shared/tesouraria.js::saldoRestanteCampanha`) — fecha o
      ciclo prometido em v4.2 ("a Saída correspondente só libera gasto na
      mesma finalidade").
- [x] `Fornecedores` — cadastro próprio (CNPJ/CPF, dados bancários),
      pré-requisito pra pagar qualquer um (`GestaoFornecedores`).
      Verificação de CPF/CNPJ duplicado (bloqueia) e nome parecido
      (avisa, não bloqueia). **Mudança de dados bancários desconfirma
      automaticamente** (`DadosBancariosConfirmados=0`) e trava qualquer
      pagamento a esse fornecedor até **outra pessoa** confirmar
      (`ConfirmarDadosBancariosFornecedor` — quem alterou nunca pode
      confirmar a própria alteração) — é o vetor de fraude nº1 segundo a
      pesquisa (trocar a chave PIX de um fornecedor real pra desviar um
      pagamento já aprovado).
- [x] Fluxo completo em `GestaoSaidas` (`SaidasTesouraria`): Solicitação
      (documentação obrigatória — nota fiscal/recibo, Reg. Art. 120 §2º,
      exigida desde a solicitação, não só no pagamento) → **aprovação por
      alçada de valor** (`AlcadasAprovacao`, configurável — quanto maior
      o valor da faixa, mais aprovadores distintos e de nível territorial
      mais alto exigidos; ranking de amplitude territorial novo em
      `shared/auth.js::nivelAtingeMinimo`, não existia nenhuma comparação
      de nível antes, só igualdade exata) → pagamento (comprovante
      obrigatório) → registro permanente. **Segregação de funções**
      (princípio 2.7): quem solicita nunca aprova/rejeita a própria
      solicitação — checado no próprio endpoint. **Saldo do Centro de
      Custo nunca fica negativo**: o pagamento é bloqueado se faltar
      saldo liberado (`shared/tesouraria.js::saldoCentroCusto`), não uma
      marcação manual. Cancelamento nunca é exclusão (mesmo princípio de
      v4.1.1) — mas uma Saída já paga não pode mais ser cancelada.

##### Segunda parte (entregue)

- [x] **Verificação de pagamento duplicado** — mesmo fornecedor + mesmo
      valor + janela de 7 dias, status ainda ativo. **Calculado na
      leitura** (`possivelDuplicidade`, subquery correlacionada no
      próprio `GestaoSaidas`), nunca uma marcação manual — vira um alerta
      visível pra quem aprova (lista e detalhe), nunca bloqueio
      automático (pode ser uma parcela legítima repetida, ex: aluguel
      mensal).
- [x] **3 cotações obrigatórias acima de um valor de referência** (Reg.
      Art. 62) — valor configurável (`ParametrosSaida`, tela em
      Financeiro → Saídas, nunca hardcoded); acima dele, a solicitação
      não entra no sistema sem 3 cotações anexadas (fornecedor, valor e
      documento de cada uma).
- [x] **Fundo Fixo de Caixa** (petty cash) por congregação
      (`FundosFixosCaixa`/`FundoFixoMovimentos`) — teto de valor e
      custodiante responsável definidos por quem tem nível Global; uso do
      dia a dia (despesa miúda ou reposição) feito pelo custodiante local,
      sem precisar da alçada cheia de uma Saída normal. Saldo sempre
      **calculado na leitura** (reposições menos despesas,
      `shared/tesouraria.js::saldoFundoFixo`) — despesa nunca deixa o
      saldo negativo, reposição nunca deixa passar do teto. Documento
      (recibo/comprovante) obrigatório em todo movimento.

#### v4.6 — Contas a Receber

- [ ] Registro de valor **esperado, ainda não recebido** (ex: acordo de
      parcelamento, boleto emitido pra terceiro) — Status Previsto/
      Recebido/Vencido, sem contar no Centro de Custo até virar um
      `LancamentoTesouraria` de verdade (não duplica, só antecipa a
      visibilidade).
- [ ] Alerta de vencimento — mesmo princípio "calculado na leitura" de
      sempre (dias até o vencimento, nunca marcação manual de "atrasado").

#### v4.7 — Remessa Bancária (CNAB 240/400)

- [ ] Geração de arquivo de remessa bancária (padrão Febraban CNAB 240)
      pra pagar vários fornecedores/prebendas (v4.10) de uma vez só — sobe
      um arquivo no banco em vez de PIX/TED um por um.
- [ ] Leitura do arquivo de retorno do banco (quais pagamentos foram
      processados, quais falharam) — atualiza status automaticamente.

#### v4.8 — Orçamento Anual, PDQ, Empenho e Fluxo de Caixa Projetado

- [ ] Orçamento Anual e Balanço Patrimonial consolidado (1º Tesoureiro —
      Art. 36 §1º), estruturado a partir do Plano de Contas (v4.2).
- [ ] **Orçado vs. Realizado** por categoria/Centro de Custo — comparativo
      automático contra `CategoriasEntrada`/`CategoriasSaida` já
      existentes, pra virar decisão, não só relatório.
- [ ] **Empenho** (encumbrance) — reservar o valor no orçamento no
      momento em que o compromisso é assumido (contrato/pedido aprovado
      em v4.5), antes do pagamento sair de fato.
- [ ] **Fluxo de Caixa Projetado** — estimativa do saldo futuro do Centro
      de Custo, calculada a partir do histórico de entradas (sazonalidade
      de dízimo/campanhas) + saídas recorrentes conhecidas + empenhos já
      assumidos — ajuda a decidir o timing de uma campanha (v4.4) ou de
      uma compra grande, em vez de descobrir o aperto de caixa depois que
      já aconteceu.
- [ ] **Orçamento contínuo (rolling forecast)** — pesquisa de mercado
      (nível "pico", não porte médio): em vez de um orçamento anual fixo
      revisado só uma vez por ano, o sistema reprojeta os próximos 12
      meses todo mês, ajustando pelo realizado — o mesmo espírito
      "calculado na leitura" de sempre, aplicado à projeção, não só ao
      histórico. *(Cube, Prophix, Vena — FP&A driver-based rolling
      forecast)*
- [ ] Planejamento estratégico PDQ com metas e 3 eixos (Regimento, Art. 26-29).
- [ ] Fundo de Execução Estratégica: dotação obrigatória de 10% da arrecadação
      líquida (Art. 27), com suspensão excepcional pelo Pastor Presidente.
- [ ] Remanejamento de até 20% + cláusula de barreira acima disso (CLI) — Art. 28.
- [ ] Comissão de Acompanhamento de Projetos / PMO Eclesiástico (Art. 30):
      monitora cronograma físico/financeiro do PDQ, reporta trimestralmente à
      CLI — natural que nasça junto com o PDQ, é o mesmo dado.
- [ ] Relatório de Progresso do PDQ na AGO (Art. 29) + Relatório de
      Justificativa Técnica quando as metas não forem cumpridas (sem virar
      infração disciplinar — Art. 29 §1º).

#### v4.9 — Demonstrações Contábeis (ITG 2002)

- [ ] Demonstrações exigidas por lei pra entidades sem finalidade de
      lucros (CFC, Resolução 1.409/12 — ITG 2002), geradas a partir do
      Plano de Contas (v4.2): Balanço Patrimonial, Demonstração do
      Resultado do Período, Mutações do Patrimônio Líquido, Fluxo de
      Caixa, Notas Explicativas.
- [ ] Regime de **competência** nas demonstrações formais (reconhece
      quando o fato ocorre, não só quando o dinheiro entra/sai) — o
      registro do dia a dia (`LancamentosTesouraria`) continua em regime
      de caixa (é assim que o Tesoureiro Local vive); a conversão pra
      competência acontece na geração das demonstrações, não reescrevendo
      o lançamento original.
- [ ] Classificação funcional de despesas (atividades-fim vs.
      administrativa) — alimenta o Índice de Aplicação em Atividades-Fim
      (v4.12).

#### v4.10 — Prebenda e sustento pastoral

- [ ] Prebenda (natureza alimentar, sem vínculo CLT) — Reg. Art. 134,
      tratada como categoria de Saída (v4.5) com regras próprias.
- [ ] Retenções tributárias/previdenciárias obrigatórias.
- [ ] Vedação à "pejotização" do ministério.
- [ ] Pagamento em lote de prebendas via remessa bancária (v4.7).

#### v4.11 — Patrimônio, Alçadas e Depreciação

- [ ] Inventário físico anual de bens (dezembro) — Reg. Art. 63.
- [ ] Teto de Alçada Patrimonial (acima → Assembleia; abaixo → CLI) —
      reaproveita o mesmo motor de alçada por valor construído em Saídas
      (v4.5), não um mecanismo novo.
- [ ] Blindagem patrimonial: assinatura conjunta, quarentena de 12 meses.
- [ ] Registro de escrituras, títulos, alvarás, veículos, contratos (2º/3º Secretários).
- [ ] **Depreciação de ativo fixo** (método linear, padrão pra entidades
      sem fins lucrativos) — cada bem do inventário ganha vida útil e
      valor residual; a depreciação mensal calculada na leitura alimenta
      o Balanço Patrimonial (v4.9), nunca lançada à mão.
- [ ] Casa Pastoral como ativo com regra de ocupação (Reg. Art. 115): uso exclusivo do
      Dirigente titular, vedada cessão a terceiros, destituição automática por uso
      irregular/"gato" de luz-água *(gap da varredura)*.

#### v4.12 — Auditoria, Compliance e Indicadores (nível enterprise/"pico")

Versão que reúne tudo que é *revisão* do que as versões anteriores já
produziram — não cria dado novo, olha pro que já existe com mais rigor.
**COSO Internal Control Framework** (5 componentes: Ambiente de Controle,
Avaliação de Riscos, Atividades de Controle, Informação e Comunicação,
Monitoramento) serve de checklist pra confirmar que a FASE 4 está
completa: Ambiente de Controle (segregação de funções, 2.7) e Atividades
de Controle (alçada, 3 cotações, trilha de auditoria) já vêm de v4.5;
falta o resto, formalizado aqui. **Quinta rodada de pesquisa** (pedido
explícito — "eu quero o pico, não porte médio"): o que separa um ERP de
porte médio de um sistema de nível corporativo/bancário de verdade não é
ter os controles — é ter esses 4 refinamentos que a maioria nem das
grandes empresas implementa direito:

- [ ] **Trilha de Auditoria Inviolável com Ancoragem Externa** —
      `AuditLog.HashRegistro`: hash (SHA-256) calculado sobre os dados do
      próprio registro + o hash do registro anterior da mesma tabela
      (como já previsto); **nível pico**: periodicamente, o hash mais
      recente da corrente é ancorado fora do sistema (carimbo de tempo
      RFC 3161 de uma autoridade externa, ou publicação do hash num
      registro público) — isso prova a integridade até contra um cenário
      em que alguém tivesse controle total do servidor e do banco (o
      hash interno sozinho não protegeria contra isso; a ancoragem
      externa sim). É o tipo de controle que nem todo ERP caro tem.
      *(pesquisa técnica — RFC 3161, blockchain anchoring, tamper-evident
      audit trails)*
- [ ] **Monitoramento Contínuo de Controles (Continuous Controls
      Monitoring)** — em vez de auditoria por amostragem periódica (só no
      fechamento do mês), verificações automáticas rodando o tempo todo:
      todo pagamento fora do padrão histórico, toda tentativa de ação
      fora do escopo, todo Fornecedor com dado bancário alterado recém
      gera alerta na hora, não só quando alguém for auditar depois. É
      exatamente o padrão que reguladores financeiros internacionais
      (PCAOB/SEC, via SOX 404) cobram de empresas auditadas — controle
      continuamente monitorado, não só testado uma vez por ano.
      *(CloudEagle, Pathlock, Exabeam — SOX 404 continuous controls
      monitoring)*
- [ ] **Revisão Periódica de Acessos (Access Recertification)** — a
      segregação de funções (2.7) garante quem pode fazer o quê no
      momento em que o acesso é concedido; nível pico exige also
      **reconfirmar periodicamente** (ex: trimestral) que cada Tesoureiro/
      pessoa com permissão `financeiro` ainda precisa daquele acesso —
      CLI/Conselho Fiscal recertifica, ou o acesso expira automaticamente.
      Evita o problema real mais comum em auditorias grandes: gente que
      trocou de função mas nunca teve o acesso antigo revogado.
      *(TechPrescient, Pathlock — SOX user access review)*
- [ ] **Princípio dos Quatro Olhos, de verdade (dual control)** — diferente
      da alçada por valor (v4.5, onde um aprovador de cargo mais alto já
      resolve): acima de um valor crítico de referência, exige **duas
      pessoas independentes** aprovando (não um substituindo o outro por
      hierarquia) — o padrão usado por bancos/tesourarias corporativas
      pros pagamentos de maior risco. *(AICO, Hyperbots, SAP Community —
      four-eyes principle / dual control)*
- [ ] NIF (Núcleo de Inteligência Financeira) — análise de risco e alertas
      (Avaliação de Riscos do COSO, formalizada).
- [ ] **Comunicação de Operações Suspeitas (COS)** — pesquisa de mercado
      (Lei 9.613/1998): comunicar operação suspeita de lavagem de
      dinheiro/financiamento ao terrorismo ao COAF é obrigação legal, não
      boa prática, com prazo de 24h. O NIF (linha acima) é, na prática, o
      "COAF interno" da igreja — ganha um fluxo de sinalização (valor
      atípico, fracionamento pra fugir de alçada, fornecedor sem histórico
      recebendo valor alto) que, se confirmado, vira o registro formal que
      subsidia a comunicação externa. *(AtlasGov, CFC, Compliance Brazil,
      VAAS — COAF/PLD-FT)*
- [ ] Auditoria em 3 níveis (interna, NIF, externa).
- [ ] Parecer mensal do Conselho Fiscal (aprova/rejeita contas) — depende
      de Entradas+Saídas maduras (v4.1-v4.5); adiado de propósito até aqui
      (decisão explícita, v4.1.3) porque não compensava investir em
      auditoria sem o outro lado da moeda (Saídas) existir.
- [ ] Bloqueio de repasses/liberação por falta de prestação de contas.
- [ ] Prazo fatal de prestação de contas — dia 1º útil do mês, tolerância até dia 5,
      "Ata de Pendência" automática por falta de comprovante de água/luz (Reg. Art. 120)
      *(gap da varredura)*.
- [ ] **Painel de Indicadores Financeiros** — Meses de Reserva de Caixa
      (Centro de Custo Geral ÷ média de saídas mensais, referência do
      Fundo de Reserva Art. 64, meta de 3 meses); Índice de Aplicação em
      Atividades-Fim (% do gasto em programas vs. administrativo, via
      classificação funcional da ITG 2002, v4.9 — referência de mercado:
      70-80% saudável); Índice de Liquidez — painel pro CLI/Diretoria/
      Conselho Fiscal, calculado na leitura, nunca digitado à mão.

#### v4.13 — Conciliação Bancária Automática (Open Finance Brasil)

- [ ] Integração via Open Finance (API regulada pelo Banco Central) pra
      importar o extrato real da conta bancária única (v4.1.3) direto no
      sistema — substitui a conciliação manual/em lote (v4.1.2) por
      cruzamento automático contra o extrato de verdade. Viável desde já
      (conta única), não precisa esperar contas bancárias por congregação.
- [ ] Alerta só do que não bate (divergência real) — não precisa mais
      conferir lançamento por lançamento contra recibo.

#### v4.14 — Gestão de Investimentos e Tesouraria Avançada (nível enterprise/"pico")

Peça que faltava pra fechar o nível "pico": o Regimento já prevê Política
de Investimentos (Art. 64, Fundo de Reserva — 0,2% das entradas líquidas,
autorização da CLI) e o Painel de Indicadores (v4.12) já cobra "Meses de
Reserva", mas não existia onde **gerir de fato** onde esse dinheiro está
aplicado.

- [ ] Registro de aplicações financeiras (CDB, poupança, fundos) do Fundo
      de Reserva — instituição, valor aplicado, taxa/prazo, liquidez
      (quando pode ser resgatado), rentabilidade acumulada.
- [ ] **Gestão de Portfólio de Investimentos** — visão consolidada de
      onde está aplicada a reserva, com o mesmo princípio "calculado na
      leitura" (rentabilidade e prazos vêm do registro, nunca digitados
      à mão no relatório).
- [ ] **Previsão de Liquidez com margem de confiança** — evolução do
      Fluxo de Caixa Projetado (v4.8): em vez de um número único, uma
      faixa (otimista/conservador) baseada na variação histórica real das
      entradas — decisão de resgatar uma aplicação antecipadamente fica
      mais informada. *(Gartner, Trovata, GTreasury — treasury management
      systems, liquidity forecasting)*
- **Fora do escopo — não se aplica hoje:** cash pooling / conta
  centralizadora entre múltiplas contas bancárias — só faz sentido quando
  existirem contas por congregação (Art. 140, ver nota da v4.1.3); hoje é
  uma conta só, não tem o que agrupar.

#### v4.15 — Repasses institucionais

- [ ] Repasses obrigatórios de congregações/departamentos para a Matriz —
      mesma engine de Entradas/Saídas (v4.1-v4.5), aplicada à relação
      hierárquica Distrito → Sede.
- [ ] Dízimo institucional de 10% (Distrito) para a Sede Geral.
- [ ] Alerta de atraso de repasse (infração de intervenção).

#### v4.16 — Seguros institucionais *(gap da varredura)*

- [ ] Apólice obrigatória para Templo Sede e grandes eventos (Reg. Art. 65-A):
      cobertura mínima incêndio/danos elétricos/RC.
- [ ] Seguro de Responsabilidade Civil para administradores (Reg. Art. 42-A).
- [ ] Registro de apólices, vigências e coberturas.

#### v4.17 — Anexo de Parâmetros Monetários *(gap da varredura)*

- [ ] Catálogo de valores monetários fixos (tetos, taxas, valores de referência) com
      correção automática a cada 12 meses por IPCA/salário-mínimo (Reg. Art. 65) —
      mesmo espírito do catálogo `Prazos` já existente (v0.1), só que para dinheiro.
- [ ] "Anexo Único" mantido pela Secretaria Geral, com número/data da Resolução
      Normativa da CLI que fixou/atualizou cada valor (Reg. Art. 162-C §§1-2).

#### v4.18 — Cessão de templo a terceiros *(gap da varredura)*

- [ ] Autorização de cessão do templo para casamentos/eventos de terceiros (Reg. Art.
      156) — não é conflito de agenda (já resolvido em v7.2), é processo de
      autorização + cobrança (via Contas a Receber, v4.6) + responsabilização civil.
- [ ] Taxa de Zeladoria (ressarcimento de custos, não aluguel).
- [ ] Termo de Responsabilidade por danos + aprovação prévia de lista musical.

### FASE 5 — Departamentos e Relatórios

#### v5.1 — Catálogo de departamentos

- [ ] 8 tipos fixos (UCADESPA, UMADESPA, USADESPA, UHADESPA, SEMIADESPA, Ação da Fé, EBD, Família).
- [ ] Cadastro de novos tipos de departamento (futuro).
- [ ] Vínculo departamento × congregação (toda congregação tem os 8).

#### v5.2 — Relatórios departamentais (formulário dinâmico)

- [ ] `SchemaRelatorio` versionado por tipo de departamento.
- [ ] `CamposFormulario` com grupo (contagem/ações/eventos/integração/financeiro) e
      comportamento (estado = pré-preenche; fluxo = zera).
- [ ] Blocos compartilhados Eventos e Integração (estrutura reutilizável).
- [ ] Lista nominal de contribuintes (mensalidade).

#### v5.3 — Fluxo de aprovação (2 camadas)

- [ ] Preenchimento pelo Líder Local / Dirigente (última edição vale).
- [ ] Aprovação de Área (Líder de Área/Pastor de Área) — não edita valores, só aprova/comenta.
- [ ] Aprovação Geral (Líder Geral) — pode corrigir valores; aprovação definitiva.
- [ ] Retificação só pelo Presidente/Secretário Geral após fechado.
- [ ] Nenhum relatório é aprovado automaticamente.

#### v5.4 — Tesouraria central por departamento

- [ ] `TesourariasDepartamento` (livro-caixa central) + `Despesas`.
- [ ] `PerfisRateio` configuráveis (integral/percentual/mensalidade/variável).
- [ ] Rateio local/geral linha a linha.
- [ ] Saldo transportado mês a mês.
- [ ] **Autonomia de arrecadação/gasto dos departamentos** (Estatuto, Art. 49)
      — vinha adiada de `v2.7` (item 5): Departamentos/Áreas/Congregações
      podem gerir recursos internos ("caixas de departamento") pra custear
      suas próprias atividades, com a vedação expressa do Art. 49, I (nenhum
      órgão de apoio, Pastor de Área ou Dirigente pode contrair dívida,
      assinar contrato ou assumir obrigação jurídica em nome da IEADESPA sem
      autorização por escrito do Pastor Presidente e do 1º Secretário). Só
      faz sentido depois que `TesourariasDepartamento`/`Despesas` (acima)
      existirem de verdade — não tem como controlar autonomia de caixa sem
      caixa.

#### v5.5 — Integração automática EBD + 4 departamentos

- [ ] EBD alimenta o depto 07 (presenças, matriculados, visitantes, bíblias, revistas, ofertas).
- [ ] UCADESPA/UMADESPA/USADESPA/UHADESPA puxam afiliados + situação de comunhão.
### FASE 6 — EBD (Escola Bíblica Dominical)

Reescrever a EBD dentro do sistema (Functions + front estático), sem Next.js.

#### v6.1 — Hierarquia e cadastros da EBD

- [ ] Turmas + TurmaProfessor (Campo → Área → Congregação → Turma).
- [ ] Aluno como vínculo de `MembroReferencia` (matrícula única).
- [ ] Visão agrupada por Área → Congregação (busca).

#### v6.2 — Chamada e presença

- [ ] Lição aberta/fechada por congregação.
- [ ] Lançamento de chamada por turma + presenças/ausências/visitantes.
- [ ] Percentuais de presença/ausência calculados.

#### v6.3 — Lições e atividades

- [ ] Lições (abrir/fechar) por congregação.
- [ ] Atividades (5 tipos de pergunta: múltipla escolha, V/F, ordenar, completar, correspondência).
- [ ] Respostas dos alunos + gabarito.

#### v6.4 — Conquistas e gamificação

- [ ] Conquistas (primeira presença, sequência, fidelidade, gabaritos, trimestre perfeito).
- [ ] Conquistas ocultas/encadeadas + ScoreConfig.

#### v6.5 — Certificados

- [ ] Emissão de certificados + página imprimível.

#### v6.6 — Revistas e pedidos

- [ ] Catálogo de revistas + pedidos por congregação.
- [ ] Consolidação + aprovação + pagamentos (pendente/aprovado).

#### v6.7 — Financeiro da EBD

- [ ] Ofertas + lançamentos manuais por congregação.
- [ ] Integração com a tesouraria central (FASE 4).

### FASE 7 — Saúde, Eventos e Comunicação

#### v7.1 — PSC (Programa de Saúde Congregacional)

- [ ] Avaliação anual obrigatória por congregação (Reg. Art. 127-129).
- [ ] 5 Sinais Vitais: financeira, estrutura física, espiritual, evangelismo, reprodução.
- [ ] "Escada Bloqueada" (nível superior exige nível anterior completo).
- [ ] Classificação: Em Desenvolvimento (N1-3) / Referência (N4-5).
- [ ] Rebaixamento compulsório: 2 anos reprovado no N1 → vira Extensão da Tenda.
- [ ] Perda de autonomia (caixa recolhido, diretoria dissolvida) no rebaixamento.

#### v7.2 — Calendário oficial e agenda unificada

- [ ] Agenda Litúrgica Oficial (Reg. Art. 79) + Calendário Oficial anual.
- [ ] Conflito de datas: nível superior cancela/absorve o inferior.
- [ ] Fluxo de aprovação do calendário (planejamento → CLI).

#### v7.3 — Canais oficiais e comunicação

- [ ] Registro de Canais Oficiais de Comunicação (Art. 12 Estatuto).
- [ ] Grupos oficiais + grupos focados (política, bazar, teologia, geracional).
- [ ] Blindagem digital: vedação de política no púlpito (Lei 9.504/97).

#### v7.4 — Eventos e congressos

- [ ] Cadastro de eventos (local/área/geral) + inscrições.
- [ ] Congresso Unificado de Departamentos.

#### v7.5 — Escalas e voluntariado

- [ ] Escala de rodízio voluntário (limpeza, portaria, louvor).
- [ ] Termo de Adesão ao Serviço Voluntário (Lei 9.608/98).
- [ ] Remoção da escala por perda de confiança (sem vínculo trabalhista).

#### v7.6 — Setores Técnicos (voluntariado profissional) *(gap da varredura)*

Distinto da escala de rodízio comum acima — são 20 áreas de voluntariado
especializado (Reg. Art. 48-52): Jurídico, Engenharia, Saúde, TI, Comunicação,
Assistência Social Técnica, Contabilidade, Gastronomia, Segurança, Música/
Sonoplastia, Transporte, Meio Ambiente, Capelania, Empreendedorismo, Cultura,
História/Acervo, RP/Cerimonial, Libras, Beleza/Estética, Educação/Pedagogia.

- [ ] Catálogo de Setores Técnicos + Termo de Adesão específico (Reg. Art. 49).
- [ ] Prerrogativas de intervenção cautelar (ex: interditar templo com risco elétrico,
      remover post oficial).
- [ ] Verificação de antecedentes criminais/cíveis (Reg. Art. 133 §5º) na investidura
      em cargo de liderança/confiança ou trabalho com menores — "Termo de Vistoria"
      com data, hash do documento apresentado, parecer e assinatura do responsável.

#### v7.9 — CLI: comparecimento obrigatório e perda de assento por faltas (Art. 27)

Movido de v2.3 de propósito — ver nota lá. Constrói **junto** com v8.1 (AFM),
não antes: precisa primeiro saber marcar uma sessão da CLI como "integrada com
AFM" (Art. 69) pra não contar errado a cada 3 meses.

- [ ] 3 faltas consecutivas sem justificativa aceita nas reuniões da CLI
      (excluindo as integradas com AFM) = perda automática do assento (Art. 27
      §1º) — calculado a partir de `Presencas`, igual mandato vencido de
      Assento (nunca marcação manual). Quem entra por Ordenação (Pastor/
      Evangelista/Presbítero) precisa de um jeito de sair da composição da CLI
      sem perder o `CargoMinisterial` (são coisas diferentes: perder assento
      na Câmara ≠ deixar de ser Pastor); quem entra por Função já sai
      naturalmente encerrando o Assento (mecanismo já existe).
- [ ] Art. 27 §2º: se a exclusão for de quem está na CLI por cargo eletivo da
      Diretoria Executiva ou Conselho Fiscal, a CLI aprecia e, sendo o caso,
      convoca AGE de destituição em até 30 dias (matéria "Destituição", já
      existente desde v2.2) — o sistema só aponta pro fluxo existente, não
      automatiza a convocação.

### FASE 8 — Ministerial (AFM)

#### v8.1 — AFM (Academia de Formação Ministerial)

- [ ] Cadastro de Reitor + Corpo Docente.
- [ ] Matrícula obrigatória de oficiais (Auxiliares→Pastores/Missionários).
- [ ] Matrícula Ativa × Inativa (desmatriculado perde licença de oficiar).
- [ ] Níveis de escolaridade: Básico, Médio, Avançado, Bacharel Livre.
- [ ] **CDER** — Comissão de Doutrina e Educação Religiosa (Regimento, Art. 22):
      Reitor da AFM + 2 mestres de teologia da CLI. Vinha adiada de v2.4
      (Comissões Permanentes) porque dependia do Reitor, que nasce aqui —
      construir junto com o cadastro de Reitor deste item, reaproveitando
      `shared/comissoes.js` (mesmo padrão de CFO/CEP: calculada quando dá).

#### v8.2 — Escada ministerial e ascensão

- [ ] Escada: Membro → Auxiliar → Missionário → Diácono → Presbítero → Evangelista → Pastor.
- [ ] Interstícios e requisitos por cargo (idade, tempo, escolaridade, batismo no Espírito).
- [ ] Veto técnico da AFM (CHM) + soberania presidencial.

#### v8.3 — Consagração e documentação

- [ ] Esteira de consagrações (PROTOCOLADO → EM_ANALISE → AGUARDANDO_PLENARIO → CONCLUÍDO).
- [ ] Consagração coletiva (Comissão de Unção) + diplomação.
- [ ] Documentação: CHM (Certificado de Habilitação Ministerial).

#### v8.4 — Credencial digital com QR Code

- [ ] Identidade Eclesiástica digital (Art. 76 Regimento).
- [ ] Validação de status Ativo/Inativo via QR Code em tempo real.
- [ ] Emissão centralizada na Secretaria Geral (anti-fraude).

### FASE 9 — Entidades Vinculadas e Expansão

#### v9.1 — Entidades vinculadas

- [ ] Cadastro de entidades (hospitais, escolas, ONGs com CNPJ próprio — Art. 64-68).
- [ ] Vínculo com a IEADESPA e controle de participação.

#### v9.2 — Expansão (Extensões e novas congregações)

- [ ] Abertura de Extensão da Tenda (nível 0) por congregação-mãe.
- [ ] Emancipação de Extensão → Congregação (CLI).
- [ ] **CME** — Comissão de Missões e Expansão Estratégica (Regimento, Art.
      23): Secretário de Missões + Pastores de Área. Vinha adiada de v2.4
      (Comissões Permanentes) porque dependia do cargo "Secretário de
      Missões", que precisa nascer aqui (Pastor de Área já existe — só falta
      esse cargo). Reaproveita `shared/comissoes.js`, mesmo padrão de CFO/CEP.

#### v9.3 — Distrito e macroexpansão

- [ ] Ativação de Distrito (nível 5) com autonomia financeira + dízimo institucional 10%.
- [ ] Blindagem contra desvinculação (intervenção imediata).

### FASE 10 — Experiência, Design e Performance

Pacote à parte, pra depois de todo o resto do sistema estar pronto — faz mais sentido
investir em polimento visual/performance quando as telas já estiverem todas
construídas, em vez de redesenhar no meio do caminho. Avaliado nesta fase: adotar um
motor tipo **Astro** — descartado (Astro é pra sites majoritariamente estáticos com
ilhas pontuais de interatividade; este sistema é um painel CRUD dinâmico o tempo
todo — trocar de motor seria reescrever a aplicação sem ganho real). O caminho é
melhorar o que já existe (HTML/CSS/JS puro), não trocar de arquitetura.

#### v10.1 — Redesign visual

- [ ] Trocar os emojis do menu lateral e dos botões por uma biblioteca de ícones de
      verdade (ex: Lucide/Feather via CDN) — hoje são 13 abas com emoji puro
      (⚖️🏛️👤👥 etc.), o que passa impressão datada/amadora.
- [ ] Revisão de paleta, tipografia e espaçamento (`app/style.css`) inspirada em
      painéis institucionais modernos — sem framework novo, é refinamento de CSS.

#### v10.2 — Performance e cache (com análise de custo/benefício)

- [ ] Hoje cada troca de aba sempre rebusca tudo do zero, sem cache no navegador —
      por isso a lentidão varia (não é a tela que é "mal feita", é a consulta por
      trás que pesa mais em algumas abas, ex: Congregações). Introduzir cache leve
      no front só pro que realmente não muda a cada clique.
- [ ] **Decisão em aberto**: cache tem que ser dosado — não é "cachear tudo". Definir
      o que entra (catálogos que raramente mudam) e o que fica de fora (listas que
      mudam com frequência), pra não virar um cache pesado/desatualizado.
- [ ] Revisar pontualmente as consultas mais pesadas no backend (ex: Congregações).

#### v10.3 — Responsividade mobile

- [ ] Tabelas hoje cortam no celular sem rolagem horizontal (funcionam no notebook,
      não no telefone) — adicionar `overflow-x: auto` nos contêineres de tabela e
      revisar o layout geral em telas pequenas.

### FASE 11 — Sistema Campal (multi-campo)

**Especulativa/opcional** — registrada aqui só como opção de futuro distante, depois
de tudo o mais estar pronto e rodando de verdade no nosso campo. Pode não vir a ser
construída — depende da demanda real de outros campos da Convenção, não é um
compromisso.

**Contexto:** hoje o sistema é feito sob medida pra um único campo (SETA em
Parauapebas). O Estatuto e o Regimento Interno, porém, são o padrão normativo comum a
todos os campos vinculados à Convenção — e muitos campos menores não têm estrutura
nem pra manter uma planilha organizada, quanto mais adotar um sistema como este do
jeito que está hoje (construído em cima de um `MembroId`/matrícula e um conjunto de
tabelas pensados pra um campo só).

**Perguntas em aberto pra quando (e se) isso for desenhado de verdade** — de
propósito sem resposta ainda, é cedo pra decidir:
- [ ] Modelo de isolamento entre campos: cada campo com seu próprio banco/instância,
      ou um banco único com todo registro amarrado a um `CampoId`? Tem implicação
      direta em custo, complexidade de deploy e naturalmente em segurança (um campo
      nunca pode ver dado de outro).
- [ ] Portabilidade de matrícula entre campos: hoje a Carta de Trânsito (v1.4) resolve
      transferência *dentro* do mesmo campo — mudar de campo (ex: "mudou de cidade")
      é outra categoria de problema: precisa decidir se a matrícula viaja com a
      pessoa, se é reemitida no campo novo, e o que acontece com o histórico
      (disciplina, cartas, consagrações) que ficou no campo de origem.
- [ ] Modelo de acesso/administração: existe um nível "Convenção" que enxerga todos os
      campos (KPIs agregados, comparação entre campos), ou cada campo administra o
      seu isoladamente, sem visão central nenhuma?
- [ ] Migração/adoção para campos sem nenhum dado digitalizado hoje (só papel ou
      planilha solta, se tanto) — que caminho de importação inicial faz sentido pra
      quem está começando do zero.

## 4. Modelo de dados (referência)

- **Núcleo:** `Congregacoes`, `Funcoes`, `MembroReferencia`, `Orgaos`, `Mandatos`,
  `Assentos`, `Sessoes`, `Presencas`, `ProcessosDisciplinares`, `Matriculas_AFM`,
  `Documentos`, `AuditLog`, `Lideranca`, `Consagracoes`.
- **Hierarquia:** `Areas`, `Regioes`, `Quadrantes`, `Distritos`, `ExtensoesTenda`,
  `VinculoCongregacaoArea`, `OrgaosLocais`.
- **Membro:** `SituacoesMembro`, `CargosMinisteriais`, `Departamentos` + colunas em
  `MembroReferencia` (SituacaoMembro, DepartamentoId, CargoMinisterial, VinculoFamiliar).
- **Governança:** `Pautas`, `Votos`, `Documentos`, `VinculoFamiliar`.
- **Financeiro:** `LancamentosFinanceiros`, `Tesourarias`, `Orcamentos`, `Repasses`,
  `InventarioPatrimonial`, `NIFAlertas`.
- **EBD:** `Turmas`, `TurmaProfessor`, `Licoes`, `Chamadas`, `PresencasAluno`,
  `Atividades`, `Perguntas`, `Alternativas`, `Respostas`, `Conquistas`, `Certificados`,
  `Revistas`, `PedidosRevista`, `PedidoRevistaItem`, `PagamentoRevista`, `ScoreConfig`.
- **Relatórios:** `TiposDepartamento`, `Departamentos`, `SchemasRelatorio`,
  `CamposFormulario`, `PerfisRateio`, `RelatoriosMensais`, `ValoresCampoRelatorio`,
  `ContribuintesMensalidade`, `TesourariasDepartamento`, `DespesasTesouraria`.
- **Saúde/Comunicação:** `PSCAvaliacoes`, `SinaisVitais`, `Eventos`, `CalendarioOficial`,
  `CanaisOficiais`, `EscalasVoluntariado`.

## 5. Migração dos subsistemas (passo a passo)

1. Congelar `chamada-ebd` e `relatorios-departamentos` como especificação (sem commits).
2. Reformar identidade/hierarquia no núcleo (FASE 0).
3. Reescrever EBD em Functions + front estático (FASE 6).
4. Implementar Relatórios já dentro do núcleo (FASE 5).
5. Ligar integração automática EBD + 4 deptos (v5.5).
6. Expandir para Governança Escalonada + AFM + Disciplinar (FASE 2/3/8).

## 6. Referência técnica

### 6.1 Design

Paleta institucional: **azul marinho** (`#0B2545`) como primária e **ouro velho**
(`#C9A227`) como destaque — tokens em `app/style.css`. Fonte **Inter** (Google Fonts,
fallback para fonte do sistema). Sem `alert()`/`confirm()`/`prompt()`: mensagens via
toast e confirmações/pedidos de texto via modal (`mostrarToast`, `confirmarAcao`,
`pedirTexto` em `app/script.js`).

### 6.2 Painel único / autenticação

Um só acesso (matrícula + senha, tela "Acessar meu Painel"):
- **Só matrícula** (sem senha): abre só a aba **Meu Painel** (perfil, frequência,
  histórico, justificativa).
- **Matrícula + senha**: se houver registro em `Lideranca`, libera as abas conforme as
  permissões (`reunioes`, `assembleia`, `pessoas`, `permissoes`, `consagracoes`), além
  do Meu Painel sempre visível.
- Seed local (`api/shared/mockDb.js`): matrícula `3`, senha `1234`, todas as permissões.

### 6.3 Persistência local

Enquanto não há Azure SQL conectado, tudo é salvo em `api/data/mockdb.json` (não
versionado). Reiniciar o `func start` não apaga dados; apagar o arquivo zera para a
semente. Não é banco de verdade (sem transação/backup) — só para desenvolvimento.

### 6.4 Como rodar / deploy Azure

```
npm install -g azure-functions-core-tools@4
npm install -g @azure/static-web-apps-cli
cd api && npm install && func start
swa start app --api-location api
```

Deploy: repositório no GitHub → Static Web App no Portal Azure (CI/CD automático a cada
`git push`). Azure SQL Database em tier **Serverless com auto-pause** (evitar custo).

### 6.5 Estrutura de pastas

```
governanca-ieadespa/
├── sql/schema.sql          Schema do banco (Azure SQL)
├── api/                    Azure Functions (Node.js)
│   ├── shared/mockDb.js    Estado mock compartilhado
│   ├── shared/auth.js      Hash de senha, sessão e permissões
│   ├── shared/auditoria.js Auditoria reutilizada
│   └── <Function>/         Uma pasta por rota
└── app/                    Front estático (index.html, style.css, script.js)
    └── documentos/         Estatuto e Regimento Interno (cópia servida como estático)
```

### 6.6 Módulos adaptados do Google Apps Script

| Function | Rota | Equivalente atual |
|---|---|---|
| `RegistrarAuditoria` | `POST /api/auditoria` | `logAuditoria()` |
| `ListarAuditoria` | `GET /api/auditoria` | aba `tb_Auditoria` |
| `RadarDisciplinar` | `GET /api/radar-disciplinar` | `abrirPainelRisco()` |
| `GestaoLideranca` | `GET/POST/DELETE /api/lideranca` | `gerenciarLiderancaApp()` |
| `ListarConsagracoes` | `GET /api/consagracoes` | `listarConsagracoesAdminApp()` |
| `CriarConsagracao` | `POST /api/consagracoes` | `enviarPropostaConsagracaoApp()` |
| `EvoluirConsagracao` | `POST /api/consagracoes/{id}/evoluir` | `evoluirConsagracaoApp()` |

### 6.7 Ideia futura: PWA (instalar como app)

Ainda não implementado — fica registrado para uma versão posterior. A ideia é
adicionar um `manifest.json` (nome, ícones, cor do tema) em `app/` e referenciá-lo
no `<head>` do `index.html`, além de um Service Worker básico — isso permite
"Instalar app" no navegador (celular ou notebook), com ícone próprio fora do
navegador. Pode vir em fases: primeiro só o manifest (instalável, sem cache
offline), depois um Service Worker cacheando o shell estático (`app/`) para uso
com internet instável.

Todas seguem o padrão: lógica real comentada (SQL) + resposta mock ativa para testar
localmente. `shared/auditoria.js` é reutilizado pelas outras Functions.