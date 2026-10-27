# Sistema de Governança IEADESPA (Sistema Integrado Único)

> ## ⚠️ REGRAS OBRIGATÓRIAS DE TRABALHO
>
> 1. **Toda alteração vai para a nuvem — OBRIGATÓRIO.** Terminou qualquer mudança (código,
>    docs, configuração)? Faça **commit + `git push origin main` na mesma hora**, sem esperar
>    pedido. O responsável **não consegue ver nada localmente: só enxerga o que está na
>    nuvem (GitHub)**. Alteração que não foi enviada é alteração que não existe.
>    - Commit estreito: só os arquivos da tarefa, com `git add` explícito (nunca `git add -A`).
>    - Depois do push, conferir o deploy (`gh run watch`) e avisar o resultado.
>    - Se o push for bloqueado, **parar e avisar** — nunca deixar a alteração só na máquina.
> 2. **Senha e segredo nunca em texto puro no repositório** (este repositório é público) —
>    nem em código, nem em `.claude/settings*.json`, nem dentro de comando aprovado. Só no
>    fluxo criptografado SOPS + Age do [`SECRETS.md`](SECRETS.md): descriptografa, edita,
>    recriptografa e só então sobe.

<!-- caixas separadas -->

> **Licença:** este repositório é público só pra fins de transparência e consulta —
> **não é software livre/open source**. Uso, cópia, modificação ou reaproveitamento
> (comercial ou não) exigem autorização prévia e expressa da IEADESPA. Ver [`LICENSE`](LICENSE).

<!-- caixas separadas -->

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
`relatorios-departamentos` (Fase 5 — Relatórios). Os dois protótipos de referência
(só o fonte, versão enxuta) estão na raiz: [`chamada-ebd/`](chamada-ebd/) e
[`relatorios-departamentos/`](relatorios-departamentos/) — ver [`REFERENCIAS.md`](REFERENCIAS.md).
Versões de Node, Astro e bibliotecas, e o motivo de cada uma que ficou para trás: [`docs/PLATAFORMAS.md`](docs/PLATAFORMAS.md).

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
| --- | --- | --- | --- |
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
| --- | --- | --- |
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
- O deploy roda **todas** as migrações, em ordem, num passo único (`api/scripts/executar-migracoes.js`): a migração nova
  entra só com o arquivo em `sql/migrations/`, sem mexer no workflow. Como TODAS rodam a cada push, nenhuma pode regravar
  o que a tela edita (Trava 7-C: o texto de uma política de retenção só entra na linha recém-criada, com `N'x'`).

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
- **Meu Painel também fatiado** (refatoração de navegação feita durante a FASE 4 —
  ver nota de numeração no fim desta seção): "Meu Perfil" parou de acumular
  tudo numa página só — virou 4 sub-abas (Perfil = resumo/dashboard; Meus
  Dados Cadastrais = editar telefone/e-mail/endereço + trocar senha +
  solicitar correção; Vínculos Familiares; Minhas Contribuições), mais LGPD
  e Cartas que já existiam. Mesmo princípio de sempre: mais fatiado, mais
  fácil de navegar conforme cresce.
- **Órgãos territoriais escopados por pessoa** (mesma refatoração, correção de um
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
- **Órgãos Centrais e Órgãos Regionais como módulos separados** (mesma
  refatoração;
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

> **Nota de numeração.** As refatorações de navegação acima aconteceram durante a FASE 4, mas não são sub-versões da
> v4.2: não recebem número de versão de módulo de negócio. O texto completo da nota está no fim de
> [fase-4-financeiro-e-patrimonio.md](docs/plano/fase-4-financeiro-e-patrimonio.md).

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

**O histórico completo — checklist, decisões, limites e verificação de cada versão — mora em
[`docs/plano/`](docs/plano/INDICE.md), um arquivo por fase.** Este README guarda só o que vale
para sempre (regras, arquitetura, modelo de dados, referência técnica) e **precisa ficar pequeno**.
Procurando uma versão pelo número (`v6.5`, `vB.2`…)? O [índice do plano](docs/plano/INDICE.md)
diz em que arquivo ela está e em que pé ela anda.

### Estado atual

- **Concluídas:** FASES 0 a 7 e as FASES B (consolidação da base) e C (integração com o site), salvo uns
  poucos itens adiados de propósito, que o índice marca como 🟡.
- **FASE 7 encerrada em 27/10/2026:** v7.1 a v7.8 e v7.10 a v7.15 no ar (PSC, Calendário oficial, Canais oficiais, Eventos e
  congressos, Escalas e voluntariado, Setores Técnicos, Ministério com menores, Incidentes de proteção de crianças, Check-in
  infantil, Cuidado pastoral com o mural de oração do site, Comunicados com consentimento por canal e categoria, Eventos no site com lotes, pagamento informado, credenciamento por sala e crachá, Identidade visual anual, Gestão de crise com porta-voz único e segurança das congregações). As 🔒 Travas 7-A (08/10), 7-B (20/10) e 7-C (27/10/2026) estão fechadas;
  a antiga v7.9 (faltas na CLI) foi fundida à v8.1 da fase 8 em 15/10/2026. **Próxima: FASE 8 (Ministerial).** O histórico está em duas partes:
  [parte 1](docs/plano/fase-7-saude-eventos-e-comunicacao.md) (com o resumo em prosa) e [parte 2](docs/plano/fase-7-parte-2-menores-cuidado-e-crise.md).
- **FASE D (retrofit de robustez e operação):** vD.1 a vD.8 feitas e Trava D-B fechada (06 a 08/10/2026): prova de
  tela no CI, front em módulos, homologação, chave de acesso (passkey) e site na raiz `ieadespa.org.br`. Ficam só
  decisões do responsável (ensaio de restauração, Search Console, teste de carga).
- **Planejadas:** FASES 8 (a próxima) a 12. Candidatos pra depois (implantação por congregação, pequenos grupos, Secretaria da
  Família) estão na [8ª rodada](docs/pesquisa/oitava-rodada-2026.md), sem versão, aguardando decisão.

### Fases

| Fase | Tema | Situação | Histórico |
| --- | --- | --- | --- |
| 0 | Fundamentos | concluída | [fase-0-fundamentos](docs/plano/fase-0-fundamentos.md) |
| 1 | Membresia (ciclo de vida do membro) | concluída | [fase-1-membresia](docs/plano/fase-1-membresia.md) |
| 2 | Governança (órgãos e deliberações) | concluída | [fase-2-governanca](docs/plano/fase-2-governanca.md) |
| 3 | Disciplina e ética | concluída | [fase-3-disciplina-e-etica](docs/plano/fase-3-disciplina-e-etica.md) |
| 4 | Financeiro e patrimônio | concluída | [fase-4-financeiro-e-patrimonio](docs/plano/fase-4-financeiro-e-patrimonio.md) |
| B | Consolidação da base (retrofit das fases 0 a 3) | concluída | [fase-b-consolidacao-da-base](docs/plano/fase-b-consolidacao-da-base.md) |
| C | Integração com o site institucional | concluída | [fase-c-integracao-com-o-site](docs/plano/fase-c-integracao-com-o-site.md) |
| 5 | Departamentos e relatórios | concluída | [fase-5-departamentos-e-relatorios](docs/plano/fase-5-departamentos-e-relatorios.md) |
| 6 | EBD (Escola Bíblica Dominical) | concluída | [fase-6-ebd](docs/plano/fase-6-ebd.md) |
| 7 | Saúde, eventos e comunicação | concluída em 27/10/2026 (v7.1 a v7.8 e v7.10 a v7.15; Travas 7-A, 7-B e 7-C; a antiga v7.9 foi fundida à v8.1 na fase 8) | [parte 1](docs/plano/fase-7-saude-eventos-e-comunicacao.md) e [parte 2](docs/plano/fase-7-parte-2-menores-cuidado-e-crise.md) |
| D | Robustez, operação, celular e domínio raiz (retrofit das fases 0 a 7, antes da Trava 7-A) | vD.1–vD.8 feitas e Trava D-B fechada (06–08/10/2026); ficam só decisões do responsável | [fase-d-robustez-e-operacao](docs/plano/fase-d-robustez-e-operacao.md) |
| 8 | Ministerial (AFM) | planejada | [fase-8-ministerial-afm](docs/plano/fase-8-ministerial-afm.md) |
| 9 | Entidades vinculadas e expansão | planejada | [fase-9-entidades-vinculadas](docs/plano/fase-9-entidades-vinculadas.md) |
| 10 | Experiência, design e performance | planejada | [fase-10-experiencia-design-performance](docs/plano/fase-10-experiencia-design-performance.md) |
| 11 | Sistema campal (multi-campo) | planejada | [fase-11-sistema-campal](docs/plano/fase-11-sistema-campal.md) |
| 12 | Inteligência, indicadores e benchmarking | planejada | [fase-12-inteligencia-e-indicadores](docs/plano/fase-12-inteligencia-e-indicadores.md) |

Pesquisa que embasa o plano (mercado e norma legal): [`docs/pesquisa/mercado-e-norma-2026.md`](docs/pesquisa/mercado-e-norma-2026.md),
a [7ª rodada](docs/pesquisa/setima-rodada-2026.md), que expandiu as fases 5 a 11, e a [8ª rodada](docs/pesquisa/oitava-rodada-2026.md), que leu o sistema pronto e originou a FASE D.

### Como registrar uma entrega (o README não é diário)

1. **O checklist, as decisões, os limites e a verificação da versão vão no arquivo da fase**
   (`docs/plano/fase-N-….md`), nunca neste README.
2. Rode `node docs/gerar-indice.js` e commite o `INDICE.md` junto: o índice é gerado, não se edita à mão.
3. **Neste README só mudam duas coisas:** a linha da fase na tabela acima, quando a *situação* dela mudar
   (e o "Estado atual"), e a lista de tabelas da seção 4, quando uma migração cria tabela.
4. Rode o `markdownlint-cli2` (com MD013 desligado) em `README.md` e em `docs/**/*.md` antes de commitar.
5. Arquivo de fase com mais de ~2.000 linhas: divida por bloco de versões e atualize a lista `FASES` do gerador.
6. Meta de tamanho deste README: **abaixo de 600 linhas**.

### Convenção a partir da v4.10 — Travas de Revisão

> **Pedido do usuário, motivado por dois bugs reais desta mesma sessão.** A
> migração 051 travou **todo** deploy por 3 dias sem que ninguém percebesse
> (uma FK esquecida antes de um `DROP COLUMN`), e um único `id` de botão
> escrito diferente do que o JavaScript gerava derrubou o painel Financeiro
> **inteiro**. Nenhum dos dois era um erro de lógica de negócio — eram
> pequenos descuidos que passaram batido por não existir um ponto formal de
> "parar e olhar pra trás". Como este roadmap vai atravessar várias sessões
> e possivelmente **modelos de IA diferentes, com capacidades diferentes de
> atenção a detalhe**, esse tipo de descuido tende a se repetir e a
> acumular — uma bola de neve de dívida técnica silenciosa.

A partir da v4.10 (inclusive), toda fase ganha pontos de parada obrigatórios
chamados **Trava de Revisão**. Não são versão de negócio — não têm
checklist de feature nova. São um checkpoint cujo único trabalho é auditar
tudo que foi entregue desde a trava anterior (ou desde o início da fase, na
primeira) e **corrigir o que passou batido antes de seguir em frente**.

**Quantidade por fase**: no mínimo **2** — uma aproximadamente na metade da
fase, outra ao final. Fases maiores ou com versões mais críticas (dinheiro
real, dado de menor, obrigação legal com multa) ganham **3 ou 4**, espaçadas
conforme o tamanho da fase — nunca menos que 2. FASE 4, a partir daqui, e
FASE 7, por concentrarem risco financeiro e legal, ganham 3 cada; FASE B, por
ser tão extensa quanto as duas juntas, também ganha 3.

**Nome, nunca número de versão**: uma trava não usa a numeração `vX.Y` das
versões de negócio — mesmo motivo que fez a FASE B virar "FASE B" em vez de
"FASE 4.5", pra nunca colidir com uma versão existente ou futura. Convenção:
`🔒 Trava de Revisão {fase}-{letra}` (ex: `4-A`, `4-B`, `4-C`; `B-A`, `B-B`...).

**As mesmas 5 perguntas, sempre** (tiradas direto do que quebrou nesta sessão):

1. **Todo código novo desde a trava anterior roda de ponta a ponta contra o
   ambiente real?** Toda migração SQL aplica sem erro contra o schema de
   produção — não "parece idempotente", **testar de verdade**; toda rota
   nova responde; front-end e back-end usam exatamente os mesmos nomes de
   rota e parâmetro (a causa exata da migração 051).
2. **Toda tela nova abre e mostra dado de verdade?** Clicar em cada botão e
   sub-aba criados desde a última trava, um por um — não só o primeiro da
   lista. Todo `id` de botão/`div` bate com o que o JavaScript gera; nenhum
   `getElementById` retorna `null` (a causa exata do bug do Financeiro).
   Desde a vD.1 (07/10/2026) a resposta vem **da máquina**: a rodada completa
   dos testes de tela (`Sistema - testes de tela`, `workflow_dispatch` com
   `completo=sim`) tem de dar zero divergência e zero violação de CSP, e a trava
   cita o número da corrida; clicar à mão continua valendo só pra tela nova.
3. **README e código continuam narrando a mesma coisa?** Nenhuma versão
   marcada `[x]` sem o endpoint/tabela/tela existir de verdade; nenhuma
   referência cruzada (`vX.Y`) apontando pra versão que não existe mais.
4. **O que ficou pra trás foi de fato corrigido, não só anotado?** Bug
   conhecido, gambiarra, "depois eu arrumo" — a trava é o lugar de voltar e
   corrigir, nunca de empurrar de novo pra frente.
5. **Deploy real, de ponta a ponta, aconteceu?** Não "o código compila":
   commit, push, CI executando as migrações reais contra o Azure SQL, e
   deploy confirmado no ar (mesmo processo de monitoramento já em uso nesta
   sessão — `gh run watch` até o resultado final).

Uma trava só fecha (`[x]`) com as 5 perguntas respondidas "sim" **e** o
deploy confirmado. Enquanto uma trava estiver aberta, não se avança pra
próxima versão de negócio — é o próprio mecanismo que evita a bola de neve,
funcionando igual não importa qual modelo de IA esteja conduzindo a sessão.

## 4. Modelo de dados (referência)

> **Corrigido na 7ª rodada de pesquisa/varredura.** Esta seção estava
> desatualizada e — pior — *ficcional*: listava tabelas que nunca chegaram a
> existir (`LancamentosFinanceiros`, `Tesourarias`, `Repasses`,
> `InventarioPatrimonial`, `NIFAlertas`, `Pautas`, `Votos`, `VinculoFamiliar`)
> misturadas com nomes reais, e omitia as **95 tabelas** de fato criadas nas
> 59 migrações. O que está abaixo é o estado real do banco, conferido contra
> `sql/migrations/`. **Regra nova:** toda migração que cria tabela atualiza esta
> seção no mesmo commit — documentação que mente é pior que documentação que falta.

**Já existem (310 tabelas, migrações 001 a 155 — contagem dos `CREATE TABLE` distintos em 23/10/2026; a lista agrupa por tema):**

- **Núcleo e identidade:** `MembroReferencia`, `Congregacoes`, `Funcoes`, `Orgaos`,
  `Mandatos`, `Assentos`, `Sessoes`, `Presencas`, `Lideranca`, `Consagracoes`,
  `Matriculas_AFM`, `Documentos`, `AuditLog`.
- **Hierarquia territorial:** `Areas`, `Regioes`, `Quadrantes`, `Distritos`,
  `ExtensoesTenda`, `VinculoCongregacaoArea`, `OrgaosLocais`.
- **Catálogos de membresia:** `SituacoesMembro`, `StatusMembro`, `CargosMinisteriais`,
  `Departamentos`, `TiposConsagracao`, `Prazos`, `TiposVinculoFamiliar`,
  `CanaisOficiaisComunicacao`.
- **Ciclo de vida do membro:** `CartasTransito`, `ProcedimentosAbandono`,
  `TentativasContatoAbandono`, `MarcosMembro`, `Casamentos`, `LicencasCandidatura`,
  `VinculosFamiliares`, `SolicitacoesEdicaoPessoa`, `SolicitacoesEdicaoCampos`.
- **Acesso e permissões:** `Papeis`, `Funcionalidades`.
- **LGPD:** `ConsentimentosLGPD`, `SolicitacoesTitularLGPD`, `PoliticasRetencao`,
  `TermosAssinados`.
- **Governança e deliberação:** `Enquetes`, `PerguntasEnquete`, `OpcoesEnquete`,
  `RespostasEnquete`, `VotosEnquete`, `PublicoEnqueteCustom`, `Projetos`,
  `PareceresComissao`, `ComissaoMembros`.
- **Disciplina e ética:** `ProcessosDisciplinares`, `TiposInfracao`, `ProcessoInfracoes`,
  `TiposPenalidade`, `MedidasCautelares`, `DenunciasOuvidoria`.
- **Tesouraria (entradas):** `Dizimistas`, `LancamentosTesouraria`,
  `FechamentosTesouraria`, `ConciliacoesTesouraria`, `CategoriasEntrada`,
  `ContasAReceber`.
- **Contabilidade:** `PlanoContas`, `NotasExplicativas`.
- **Campanhas e sorteios:** `Campanhas`, `CampanhaMetas`, `Sorteios`, `SorteioPremios`.
- **Saídas (contas a pagar):** `CategoriasSaida`, `Fornecedores`, `SaidasTesouraria`,
  `SaidaAprovacoes`, `SaidaCotacoes`, `AlcadasAprovacao`, `ParametrosSaida`,
  `FundosFixosCaixa`, `FundoFixoMovimentos`.
- **Bancário:** `DadosBancariosInstituicao`, `RemessasBancarias`, `RemessaItens`.
- **Orçamento e PDQ:** `OrcamentosAnuais`, `OrcamentoLinhas`, `PdqPlanos`, `PdqEixos`,
  `PdqMetas`, `PdqProjetos`, `PdqRemanejamentos`, `PdqFundoSuspensoes`.
- **Rateio Geral (malote dos 60%):** `RateioGeralDestinos`, `RateiosGerais`,
  `RateioGeralValores`, `RateioGeralItens`.
- **Saúde congregacional (PSC, v7.1):** `PscSinaisVitais`, `PscCriterios`,
  `PscParametros`, `PscAvaliacoes`, `PscRespostas`, `PscReclassificacoes` — e as colunas
  `Congregacoes.Categoria` (`CONGREGACAO` | `EXTENSAO_TENDA`) e
  `Congregacoes.TutelaCongregacaoMaeId`.
- **Calendário oficial (v7.2):** `CalendarioTiposEvento`, `CalendarioTiposCompativeis`,
  `CalendarioAnos`, `CalendarioEventos`, `CalendarioEventoAreas`, `AgendaLiturgicaRegras`,
  `CalendarioPresencasDirigente`.
- **Canais e comunicação (v7.3):** `CanaisOficiaisComunicacao` (existe desde a migração 020;
  na 115 ganhou plataforma, categoria, tema, identificador, vínculo institucional, escopo,
  custódia da senha e vigência) e as novas `CanalAdministradores`, `CanalTrocasCredencial`,
  `CanalLiderancaSnapshot`, `CanalOcorrencias`, `CanalConferencias`, `CongregacaoTransmissao`.
- **Eventos e congressos (v7.4):** `EventoOrganizadores`, `EventoConvidados`, `EventoCaixas`,
  `EventoCaixaLancamentos`, `EventoCaixaDestinos`.
- **Escalas e voluntariado (v7.5):** `EscalasRodizios`, `EscalasRodizioGrupos`, `EscalasRodizioGrupoMembros`,
  `VoluntariadoAdesoes` (com a cadeia de cabeçalhos do aceite e, para menor de 18 anos, o nome e o vínculo do
  responsável que assinou), `VoluntariadoRatificacoes`. A migração 117 também acrescenta `Natureza` a
  `EscalasEquipes`, `RodizioId` e `RodizioGrupoId` a `EscalasServicos`, e o efeito sobre as escalas e a
  reintegração a `VoluntariosDesligamentos`. As equipes, os serviços e as alocações são das migrações 098 e 099.
  A migração 118 traz `MembroPins` (o PIN de 4 números do membro, só como hash) e `AcessoTentativas` (o contador de erros e
  o bloqueio, por pessoa e canal); a 119, `VoluntariadoResponsaveis` (o responsável legal de cada menor, conferido pela
  Secretaria) e a adesão `CLICK_RESP`, dada pelo responsável; a 120 concede `escalas` e `habilitacao_voluntarios` aos
  papéis Presidente e Secretário Geral; a 121, a coluna `Visibilidade` de `Documentos` (público, membros ou liderança); a 122, a rede de segurança do nível geral.
  O fecho (03/10/2026) trouxe as migrações 123 a 139: sessões revogáveis, índices únicos que só nascem sem repetição
  (o deploy avisa), `AceitesMediacao`, abandono com "quem abriu", divergência de remessa e estorno de cessão.
- **Setores Técnicos e vistoria (v7.6, migração 142):** `SetoresTecnicos` (os 20 do Art. 52), `...Membros` (o vínculo), `...Adesoes`
  (o Termo, com hash e IP), `...Intervencoes` (interdição e pedido de remoção), `VistoriasAntecedentes`, `VistoriasDocumentos` (só o
  hash da certidão) e `VistoriasAnulacoes`. Permissões novas, só da Diretoria: `setores_tecnicos`, `setores_ratificacao`, `vistoria_antecedentes`.
- **Ministério com menores (v7.7, migração 143):** `MinisterioMenoresPoliticaAceites`, `...Consentimentos` (do responsável, LGPD art. 14), `...AutoDenuncias`,
  `...Retiradas`, `...Salas`, `...CadastroNacional`; a validade das certidões (180 dias) é calculada pela data de emissão do Termo de Vistoria, nunca gravada.
- **Incidentes de proteção (v7.8, migração 144):** `IncidentesProtecao`, `IncidenteEnvolvidos`, `IncidenteRelatos` (um relato por incidente, só de acréscimo), `IncidenteLeituras`, `IncidenteComunicacoes`,
  `IncidenteDecisoesCautelares`, `IncidenteReclassificacoes` (gatilhos: nada se apaga; o nível só sobe). O prazo de 24 horas é calculado na leitura; o afastamento cautelar é um bloqueio reservado
  da aptidão da v7.7; permissão `protecao_menores` e papel "Comitê de Proteção". Rotina horária (`rotinas-protecao.yml`) que só abre o banco se há prazo correndo.
- **Check-in infantil e portão da EBD (v7.10, migração 145; Trava 7-B, migrações 146 e 147):** `CheckinInfantilRegistros` (custódia: só o HMAC do código), `...Eventos` (só de acréscimo), `...Voluntarios`, `...Autorizados`,
  `...AutorizadosVisita`, `...Saude` (com o consentimento SAUDE_CRACHA), `...SegundasVias`; `EbdTurmas.ContatoComMenores`. Rota `/api/checkin-infantil/<ação>`; retenção de 5 anos.
- **Cuidado pastoral (v7.11, migração 148):** `CuidadoItens` (fila com responsável, prazo e degrau da escada), `CuidadoEventos`, `NotasPastorais` (três níveis de sigilo; não se editam), `NotasPastoraisLeituras`, `PedidosOracao`
  (moderação, boletim sem nome, sinal de risco); permissão `cuidado_pastoral` e papel "Superintendente Regional". Rota `/api/cuidado-pastoral/<ação>`; a rotina das 7h detecta afastamento e sobe a escada. v7.11.1 (migração 149): o confidencial e o com risco do mural do site entram por `/api/cuidado-pastoral-site` (chave do site), só no nível geral.
- **Comunicação (v7.12, migração 150):** `ComunicacaoConsentimentos` (canal × categoria, com a impressão digital do texto aceito; não se edita), `ComunicacaoModelos` (o aprovado não se edita), `ComunicacaoAudiencias`, `ComunicacaoEnvios` e `ComunicacaoEntregas` (por pessoa e canal; ciência da convocação); permissão `comunicacao`. Rotas `/api/comunicacao/<ação>`, `/api/comunicacao-sair` (link do e-mail, sem login) e a fila `/api/comunicacao-fila-interna` (a cada 15 minutos). Sem WhatsApp/SMS e sem grupo pelo dízimo (decisões de 22/10/2026).
- **Identidade visual anual (v7.14, migração 151):** `IdentidadeCiclos` (um por ano, aberto pela Diretoria; as etapas do Art. 159 são calculadas pela data de Brasília), `IdentidadeTemasUsados` (desde 2006; o do processo não se edita), `IdentidadeSugestoes` (até 3 por pessoa, texto único no ciclo, triagem com a redação original guardada), `IdentidadeCores`, `IdentidadeArtes` (imagem no Storage privado) e `IdentidadeResultados` (não se edita); `Enquetes.DataFechamentoPrevista` (a enquete que fecha sozinha; a votação do tema é uma Enquete votada em Meu Painel → Votações). Permissão `identidade_visual` (só o nível Geral). Rota `/api/identidade-visual/<ação>`.
- **Crise e segurança (v7.15, migração 152):** `CriseRegimes` (um regime ativo por vez, índice único filtrado; o Porta-Voz Único do Art. 161-B), `CriseHistorico`, `CriseManifestacoes`, `CriseDemandasImprensa` e `CriseDemandaRespostas` (só acrescentam: correção é linha nova), `SegurancaPlanos` (em versões), `SegurancaSimulados`, `SegurancaVistorias` + `SegurancaVistoriaItens` e `SegurancaEquipe`; permissões `crise_gestao` e `seguranca_congregacao`. O aviso da crise é um comunicado do sistema (categoria `CRISE`) pela fila da v7.12. Rota `/api/crise/<ação>`.
- **Trava 7-C (migração 153):** base legal das políticas corrigida (só onde o texto é o original); as retenções da v7.2 a v7.4 (`JustificativaApagadaEm`, `ContatoApagadoEm`, `CanalOcorrencias.AnonimizadaEm` e `CanalAdministradores.AnonimizadoEm`, com quem avisou e o administrador aceitando vazio só na anonimização). A fila de comunicados passa 24 h: de madrugada (23h às 5h45) só o aviso de crise, e o banco só abre se a marca do Storage disser que há crise na fila. A 154 junta as costuras; a 155, as decisões de 23/10/2026: `Fornecedores.MembroId` e `SaidaAvisosVoluntario` (o dinheiro do voluntário só avisa: o tesoureiro confirma e fica registrado) e `Departamentos`/`Papeis.ContatoComMenores` (quem ocupa departamento ou cargo com crianças sem aptidão aparece à Diretoria e à Proteção; ninguém sai do cargo sozinho).

**Ainda não existem** (projeção das fases futuras, nomes sujeitos a mudança): missões
(`CamposMissionarios`, `RelatoriosCampo`) e obrigações fiscais (`ObrigacoesAcessorias`). EBD, departamentos, eventos e proteção de menores já existem (acima).

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

```bash
npm install -g azure-functions-core-tools@4
npm install -g @azure/static-web-apps-cli
cd api && npm install && func start
swa start app --api-location api
```

Deploy: repositório no GitHub → Static Web App no Portal Azure (CI/CD automático a cada
`git push`). Azure SQL Database em tier **Serverless com auto-pause** (evitar custo).

### 6.5 Estrutura de pastas

```text
governanca-ieadespa/
├── sql/schema.sql          Schema do banco (Azure SQL)
├── api/                    Azure Functions (Node.js)
│   ├── shared/mockDb.js    Estado mock compartilhado
│   ├── shared/auth.js      Hash de senha, sessão e permissões
│   ├── shared/auditoria.js Auditoria reutilizada
│   └── <Function>/         Uma pasta por rota
└── app/                    Front estático (index.html, style.css, eventos.js, script.js)
    ├── modulos/            30 módulos por tema (vD.2 em diante); o script.js é só o núcleo (login, navegação, ajudantes)
    └── documentos/         Estatuto e Regimento Interno (cópia servida como estático)
```

### 6.6 Módulos adaptados do Google Apps Script

| Function | Rota | Equivalente atual |
| --- | --- | --- |
| ~~`RegistrarAuditoria`~~ | ~~`POST /api/auditoria`~~ | removida: nenhuma tela a usava, e deixava qualquer pessoa escrever na trilha de auditoria; só o servidor grava nela |
| `ListarAuditoria` | `GET /api/auditoria` | aba `tb_Auditoria` |
| `RadarDisciplinar` | `GET /api/radar-disciplinar` | `abrirPainelRisco()` |
| `GestaoLideranca` | `GET/POST/DELETE /api/lideranca` | `gerenciarLiderancaApp()` |
| `ListarConsagracoes` | `GET /api/consagracoes` | `listarConsagracoesAdminApp()` |
| `CriarConsagracao` | `POST /api/consagracoes` | `enviarPropostaConsagracaoApp()` |
| `EvoluirConsagracao` | `POST /api/consagracoes/{id}/evoluir` | `evoluirConsagracaoApp()` |

### 6.7 PWA (instalar como app)

Feito na vB.5: `app/manifest.json`, ícones em `app/icones/` e `app/service-worker.js` (cache só do shell
estático; dado real sempre de `/api/*`; a chamada da EBD funciona offline — v6.10). Histórico no
[plano da FASE B](docs/plano/fase-b-consolidacao-da-base.md#vb5--portal-do-membro-pwa-e-autoatendimento-de-verdade).

Todas seguem o padrão: lógica real comentada (SQL) + resposta mock ativa para testar
localmente. `shared/auditoria.js` é reutilizado pelas outras Functions.
