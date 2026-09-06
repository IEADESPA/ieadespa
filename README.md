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
      Conselho Fiscal, Art. 43 §3º) e v3.1 (impedimento de conselheiro do CEI, Art. 91) —
      construídos em cima da tabela que esta versão já deixa pronta.

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

- [ ] Assentos: 3 titulares + 3 suplentes, mandato = Diretoria (Art. 43).
- [ ] Sessão mensal (3º domingo) reaproveitando o motor de sessão (Art. 46).
- [ ] Vedação de nepotismo na eleição (Art. 43 §3º, parentesco até 2º grau) — usa a
      tabela `VinculosFamiliares` (v0.2); é aqui que nasce `shared/parentesco.js`
      (grafo/BFS pra calcular caminho entre duas pessoas) e a Function de consulta —
      não faz sentido construir esse motor antes de ter um primeiro consumidor real.
- [ ] Medidas cautelares de proteção patrimonial (Art. 45).
- [ ] Fiscalização contábil (Reg. Art. 145): balancetes, talões, parecer mensal, ata própria.

#### v2.7 — Órgãos de Apoio, Departamentos e Congregações

- [ ] Dirigente de Congregação como Assento tipo FUNCAO ligado à CLI.
- [ ] Catálogo de Departamentos Gerais e Secretarias Adjuntas (Art. 47).
      **Nota (v0.3):** os 8 `Departamentos` seedados na v0.1 são todos demográficos
      (UCADESPA/UMADESPA/USADESPA/UHADESPA por faixa etária/gênero, EBD, Família) —
      mas `SEMIADESPA` (Missões) e `ACAO_DA_FE` (Ação Social) são conceitualmente
      **transversais** (atravessam todas as idades, não um grupo específico), mais
      parecidos com a "Secretaria Adjunta" do Art. 47 do que com um Departamento.
      Fica registrado aqui pra quando esta versão desenhar `Departamentos` vs.
      `SecretariasAdjuntas`: decidir se é uma coluna `Tipo` no catálogo existente
      ou uma tabela nova — e se `SEMIADESPA`/`ACAO_DA_FE` migram de categoria.
- [ ] Pastores de Área e Áreas Estratégicas (Art. 48).
- [ ] Termo de Compromisso de Gestão do Dirigente (Art. 57).
- [ ] Autonomia de arrecadação/gasto dos departamentos (Art. 49).

#### v2.8 — Votação e Eleições

- [ ] Modelo de dados: `Pautas` (SessaoId, Descricao, Tipo) + `Votos` (PautaId, MembroId, Escolha).
- [ ] Apuração com quórum de aprovação (maioria simples / supermaiorias).
- [ ] Fluxo de candidatura usando `elegivelDiretoriaConselhoFiscal` / `elegivelCEIouDepartamentos`.
- [ ] Eleição completa de Diretoria Executiva e Conselho Fiscal.
- [ ] Pautas de reforma estatutária / destituição com rito de 3 estágios.
- [ ] **Tramitação de Projetos e Parecer das Comissões** (Regimento, Art. 24-25 —
      vinha adiada de v2.4): etapa que antecede a `Pauta` acima, não é item
      solto — todo projeto protocolado é despachado pra CCJ e pra comissão
      temática (`shared/comissoes.js`), que têm 15 dias pra emitir parecer
      (favorável/contrário/regime de urgência 2/3); só depois disso o projeto
      vira uma `Pauta` apta a entrar em votação. Modelo: `Projetos` (protocolo,
      autor, texto, status) + `PareceresComissao` (ProjetoId, Sigla, parecer,
      data, prazo calculado na leitura — mesmo padrão de `ProcessosDisciplinares`).
      Derrubada/manutenção de veto presidencial sobre resolução aprovada
      também nasce aqui, depois da apuração.

#### v2.9 — Documentos, Atas e Registro

- [ ] Function de Documentos (registrar referência/URL de blob, tipo, órgão).
- [ ] Geração de Ata (PDF) a partir de uma Sessão encerrada.
- [ ] Alerta de prazo de registro em cartório (Art. 75: 30 dias ata, 45 dias protocolo).
- [ ] Registro do Regimento no RTD (Art. 161) para conservação.
- [ ] Motor de Termos/modelos com preenchimento e assinatura eletrônica *(gap da
      varredura)*: hoje cada termo formal exigido pelo Regimento (Posse do Dirigente
      — Art. 117, Compromisso de Gestão — Art. 57, Adesão ao Voluntariado, etc.) não
      tem gerador — só a referência de blob genérica acima.

#### v2.10 — Transição de gestão *(gap da varredura)*

- [ ] Comitê de Recepção e Consulta Pastoral (Reg. Art. 42): entrevista de indicados
      da Convenção em vacância presidencial.
- [ ] Relatório de Transição obrigatório (Reg. Art. 42-A): inventário de bens, senhas
      bancárias/sistemas, obras em andamento, pendências jurídicas — ao fim de
      mandato ou transferência de liderança.

#### v2.11 — Correspondência oficial e ciclo normativo *(gap da varredura)*

- [ ] Ofícios/Representações formais à Convenção (CIADSETA) com protocolo, data de
      envio e prazo de resposta — hoje prazos que decidem sucessão presidencial
      (Art. 18 §II: 90 dias; Art. 32 §§2-3: 90 dias; Art. 75 §4: 15 dias) não têm
      onde ser controlados.
- [ ] Ciclo de revisão do Regimento a cada 4 anos, no 1º ano de gestão, por Comissão
      de Revisão designada pela CLI (Reg. Art. 162-B).

### FASE 3 — Disciplina e Ética

#### v3.1 — CEI (Corte Suprema Eclesiástica)

- [ ] Composição: 7 titulares + 2 suplentes (Reg. Art. 88).
- [ ] Requisitos: Oficial Superior (Evangelista/Pastor) ou Presbítero 5+ anos + formação
      teológica AFM ou Direito + reputação ilibada (10 anos).
- [ ] Indicação pelo Pastor Presidente + sabatina/homologação pela CLI (Art. 89).
- [ ] Mandato 2 anos + destituição só por 2/3 da CLI (estabilidade).
- [ ] Incompatibilidade: vedado acúmulo com Mesa Diretora/Vice de Quadrante/Superintendente (Art. 90).
- [ ] Impedimento/suspeição: parente (3º grau, via `shared/parentesco.js` — v2.6), mesma
      congregação, inimizade/amizade íntima (Art. 91).
- [ ] Segredo de Justiça Eclesiástica (Art. 92): rito fechado, sem gravação.

#### v3.2 — Processo disciplinar (abertura, citação, defesa)

- [ ] Abertura de processo (denúncia, partes, relator) — o núcleo (`AbrirProcessoDisciplinar`,
      `EvoluirProcessoDisciplinar`, `ProcessosDisciplinares`) já existe desde a v0.2;
      aqui entra a instrução formal por cima disso.
- [ ] Citação por WhatsApp (riscos azuis) ou Carta Registrada/testemunhas (Reg. Art. 101).
- [ ] Prazo de defesa prévia: 5 dias corridos + até 3 testemunhas.
- [ ] Revelia: julgamento à revelia com presunção dos fatos (se houver prova mínima).
- [ ] Defensor eclesiástico ou advogado constituído (Art. 102).
- [ ] Esteira ganha o status intermediário `AFASTAMENTO_CAUTELAR` (a v0.2 só tem
      EM_ANDAMENTO → JULGADO direto).

#### v3.3 — Código Penal Eclesiástico (infrações)

- [ ] Graduação de infrações: leves, médias, graves e gravíssimas.
- [ ] Catálogo `TiposInfracao` (Art. 96-99 do Regimento, ~50 incisos — conduta, doutrina,
      financeiro, sigilo, rebelião), via `GestaoCatalogos`, substituindo o campo de
      motivo em texto livre da v0.2. Nesse ponto vale ampliar `GestaoCatalogos` pra
      aceitar permissão configurável por catálogo (hoje só aceita a permissão fixa
      `pessoas`), pra restringir esse catálogo à permissão `disciplina`.
- [ ] Infrações de intervenção (Reg. Art. 144): gatos de energia/água, atraso de repasse,
      despesas pessoais, ausência de notas fiscais.

#### v3.4 — Julgamento e sanções

- [ ] Julgamento pelo CEI (jurisdição dupla para ministros: CEI + CIADSETA).
- [ ] Catálogo `TiposPenalidade` (Art. 95 §2º: Advertência / Suspensão Temporária /
      Disciplina Rigorosa / Exclusão), via `GestaoCatalogos` — substitui o Resultado
      genérico (ARQUIVADO/SANCAO/EXCLUSAO) da v0.2 por um nível de pena explícito.
- [ ] Vacância automática de `Assentos` por nível de pena (Disciplina Rigorosa/Exclusão
      = perda de mandato; Suspensão Temporária = afastamento sem perder o mandato) — a
      v0.2 só fecha `Assentos` automaticamente no caso inequívoco de EXCLUSAO.
- [x] Suspensão automática de voto/ser votado/cargos durante sanção — já em v0.2
      (`estaSobDisciplina()`, mascarado por permissão).
- [x] Término automático da sanção (dias) → retorno à comunhão — já em v0.2 (calculado
      na leitura, sem job/timer).
- [ ] Sigilo do processo com efeito funcional real (hoje, v0.2, `Sigiloso` é só metadado
      informativo — quem tem a permissão `disciplina` vê tudo) + permissão `cei`.

#### v3.5 — Reabilitação e retorno (Art. 77 Regimento)

- [ ] Carência administrativa após o fim da pena.
- [ ] Prova de Reintegração Ética pela AFM (aprovação reativa credencial).
- [ ] Histórico disciplinar no perfil do membro.

#### v3.6 — Escada territorial de instâncias (JAI/JEA/TER/CEQ/CDE) *(maior gap da varredura)*

`OrgaosLocais` (v0.1) hoje só cataloga esses níveis como nomes/hierarquia — nenhuma
das competências abaixo tem processo ou tela ainda:
- [ ] JAI (Reg. Art. 108): 1ª instância disciplinar local — advertência/suspensão de
      cargo local até 90 dias; recurso em 5 dias à JEA. Intervenção do Geral (Art. 108-A).
- [ ] JEA (Reg. Art. 122-123): 2ª instância — recursos contra a JAI + processa
      originariamente infrações de Obreiros Oficiais (Diáconos/Presbíteros) da Área.
- [ ] JUC (Reg. Art. 124-A): auditoria intermediária de Área (balancetes, notas fiscais).
- [ ] CRA/TER/CRAF (Reg. Art. 126-B/C/D): CRA é executivo regional; **TER é 3ª
      instância disciplinar**, único órgão regional que pode votar Exclusão/
      Destituição (com homologação do CEI); CRAF é o braço fiscal regional (Selo de
      Regularidade Trimestral, bloqueio de Área inadimplente).
- [ ] CEQ/CAQ (Reg. Art. 126-H/I): colegiado estratégico de Quadrante + câmara de
      arbitragem para conflito entre lideranças regionais.
- [ ] CDE (Reg. Art. 126-L/M/N): conselho eclesiástico distrital — autonomia quase
      total (processos/balanços não sobem à Sede, só consolidado anual + dízimo
      institucional 10%, já previsto na v9.3).

#### v3.7 — Ouvidoria Eclesiástica *(gap da varredura)*

- [ ] Canal permanente, sigiloso e opcionalmente anônimo de denúncias (Reg. Art. 104),
      vinculado ao NIF/CEI e independente da Diretoria.
- [ ] Proteção formal ao denunciante + estabilidade do ouvidor durante apuração.
- [ ] Regras próprias de LGPD: acesso restrito, anonimização pós-processo.

### FASE 4 — Financeiro e Patrimônio

#### v4.1 — Tesouraria e Caixa Único

- [ ] Caixa único da igreja (conta bancária única) com saldo virtual por órgão/departamento
      (Reg. Art. 133-C).
- [ ] Lançamentos de entrada/saída com categoria e comprovante.
- [ ] Conciliação bancária mensal.
- [ ] Teto de acumulação de caixa local = 10 salários-mínimos, com recolhimento
      automático do excedente (Reg. Art. 119) *(gap da varredura)*.

#### v4.2 — Ofertas, dízimos e arrecadação

- [ ] Registro de mapas de dízimos/ofertas por congregação (2º Tesoureiro — Art. 36 §2º).
- [ ] Controle de recebimento/conferência/auditoria dos relatórios financeiros.
- [ ] Recibos e numeração sequencial de talões.

#### v4.3 — Orçamento anual e PDQ

- [ ] Orçamento Anual e Balanço Patrimonial consolidado (1º Tesoureiro — Art. 36 §1º).
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

#### v4.4 — Prebenda e sustento pastoral

- [ ] Prebenda (natureza alimentar, sem vínculo CLT) — Reg. Art. 134.
- [ ] Retenções tributárias/previdenciárias obrigatórias.
- [ ] Vedação à "pejotização" do ministério.

#### v4.5 — Patrimônio e alçadas

- [ ] Inventário físico anual de bens (dezembro) — Reg. Art. 63.
- [ ] Teto de Alçada Patrimonial (acima → Assembleia; abaixo → CLI).
- [ ] Blindagem patrimonial: assinatura conjunta, quarentena de 12 meses.
- [ ] Registro de escrituras, títulos, alvarás, veículos, contratos (2º/3º Secretários).
- [ ] Casa Pastoral como ativo com regra de ocupação (Reg. Art. 115): uso exclusivo do
      Dirigente titular, vedada cessão a terceiros, destituição automática por uso
      irregular/"gato" de luz-água *(gap da varredura)*.

#### v4.6 — NIF e Compliance

- [ ] NIF (Núcleo de Inteligência Financeira) — análise de risco e alertas.
- [ ] Compliance de compras (3 cotações, fornecedores) e transparência ativa.
- [ ] Vedação de despesas sem nota fiscal.

#### v4.7 — Auditoria e prestação de contas

- [ ] Auditoria em 3 níveis (interna, NIF, externa).
- [ ] Parecer mensal do Conselho Fiscal (aprova/rejeita contas).
- [ ] Bloqueio de repasses por falta de prestação de contas.
- [ ] Prazo fatal de prestação de contas — dia 1º útil do mês, tolerância até dia 5,
      "Ata de Pendência" automática por falta de comprovante de água/luz (Reg. Art. 120)
      *(gap da varredura)*.

#### v4.8 — Repasses e dízimo institucional

- [ ] Repasses obrigatórios de congregações/departamentos para a Matriz.
- [ ] Dízimo institucional de 10% (Distrito) para a Sede Geral.
- [ ] Alerta de atraso de repasse (infração de intervenção).

#### v4.9 — Seguros institucionais *(gap da varredura)*

- [ ] Apólice obrigatória para Templo Sede e grandes eventos (Reg. Art. 65-A):
      cobertura mínima incêndio/danos elétricos/RC.
- [ ] Seguro de Responsabilidade Civil para administradores (Reg. Art. 42-A).
- [ ] Registro de apólices, vigências e coberturas.

#### v4.10 — Anexo de Parâmetros Monetários *(gap da varredura)*

- [ ] Catálogo de valores monetários fixos (tetos, taxas, valores de referência) com
      correção automática a cada 12 meses por IPCA/salário-mínimo (Reg. Art. 65) —
      mesmo espírito do catálogo `Prazos` já existente (v0.1), só que para dinheiro.
- [ ] "Anexo Único" mantido pela Secretaria Geral, com número/data da Resolução
      Normativa da CLI que fixou/atualizou cada valor (Reg. Art. 162-C §§1-2).

#### v4.11 — Cessão de templo a terceiros *(gap da varredura)*

- [ ] Autorização de cessão do templo para casamentos/eventos de terceiros (Reg. Art.
      156) — não é conflito de agenda (já resolvido em v7.2), é processo de
      autorização + cobrança + responsabilização civil.
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