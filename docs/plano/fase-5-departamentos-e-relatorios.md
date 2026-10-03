# FASE 5 — Departamentos e Relatórios

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

<!-- caixas separadas -->

> **Fonte desta fase**: protótipo conceitual `relatorios-departamentos` (React/
> Vite, sem backend, **liberado pra consulta e reaproveitamento de ideias e
> código**), com 6 documentos de levantamento (docs/01 a 07) construídos em
> cima de **planilhas reais em PDF dos 8 departamentos** (algumas preenchidas
> com dados de exemplo de janeiro/2026). Não é uma spec fabricada — os campos,
> métodos de rateio e regras de perfil abaixo vêm direto da operação real.
> O protótipo foi desenhado como sistema **standalone** (própria estrutura
> Campo→Área→Congregação, próprio login por matrícula manualmente cadastrada,
> porque "o sistema de gestão de membros não é integrável") — aqui **não
> vale**: a IEADESPA-mega já TEM essa estrutura, login e cadastro de membros
> prontos desde a FASE 0/1, então essa parte do protótipo não se aproveita,
> só a modelagem de departamento/relatório/rateio em cima dela.

**Por que os 8 ficam juntos numa fase só, apesar de serem tão diferentes**:
o Regimento pede um retrato eclesiástico **consolidado da congregação**
(total de cultos, de membros, de eventos, de conversões daquele mês) — e
esse número só existe somando os 8 relatórios. É por isso que Eventos e
Integração (idênticos nos 8) e o motor de rateio/aprovação são **um só**
(v5.1-v5.4): fragmentar isso em 8 fases separadas duplicaria a mesma
engrenagem 8 vezes sem ganhar nada. Mas cada um também tem peculiaridade
real que o motor genérico não cobre por completo — Missões
(discipulado/literatura) e principalmente **Ação da Fé** (que já hoje rastreia
18 itens de cesta básica item a item — dá praticamente pra virar um módulo de
**assistência social de verdade**: cadastro de famílias atendidas, controle de
estoque, histórico de entregas) têm identidade própria o bastante pra, no
futuro, ganharem uma fase dedicada — o mesmo caminho que a EBD já percorreu
(relatório mensal genérico aqui na v5.2/v5.5, sistema exclusivo na FASE 6).
Essas fases futuras ficam **reservadas, não fabricadas agora** — entram
quando o relatório mensal genérico já estiver rodando e mostrar, com dado
real, que vale o investimento (mesmo critério já usado pra não abrir a v7.2
antes da hora, ver limitação documentada da vB.15).

**Três módulos dentro do motor único, não três fases**: o catálogo (v5.1) já
distingue `Tipo='DEPARTAMENTO'` (UCADESPA/UMADESPA/USADESPA/UHADESPA — por
faixa etária/gênero) de `Tipo='SECRETARIA_ADJUNTA'` (SEMIADESPA/AÇÃO DA
FÉ/FAMÍLIA — transversais; EBD sai desse grupo porque já tem a FASE 6
própria) — essa distinção que a v2.7 já fez vira o corte de **menu**
("Departamentos" / "Secretarias"), não um corte de banco de dados novo: é o
mesmo `SchemaRelatorio`/`RelatorioDepartamental`, só filtrado por `Tipo` na
tela. O terceiro módulo, **Consolidado de Campo** (agregação por
congregação→área→campo, ver v5.5.1), é novo e não existia no rascunho
original desta fase.

**Financeiro exclusivo, nunca misturado com a FASE 4**: o dinheiro que cada
departamento/secretaria arrecada e gasta (v5.4) roda numa tela e permissão
**própria dos líderes/tesoureiros locais e de área daquele departamento** —
nunca dentro do módulo Financeiro geral (FASE 4), mesmo o valor "pra o geral"
acabando, na prática, dentro da conta bancária única da igreja. A ponte entre
os dois mundos é exatamente o que a v4.1.3 já resolveu pro Centro de Custo: o
saldo de verdade é um só (`shared/tesouraria.js::saldoCentroCusto`), o
Conselho Fiscal/Tesoureiro Geral sempre tem a última palavra e enxerga tudo
pra auditoria — mas a **operação do dia a dia** (lançar despesa, ver saldo do
próprio departamento) é exclusiva de quem responde por aquele departamento,
sem aparecer misturada nas telas do Financeiro geral.

## v5.1 — Catálogo de departamentos

- [x] 8 tipos fixos (UCADESPA, UMADESPA, USADESPA, UHADESPA, SEMIADESPA, Ação da Fé, EBD, Família).
- [x] Cadastro de novos tipos de departamento (futuro).
- [x] Vínculo departamento × congregação (toda congregação tem os 8).

  **Confirmado: já entregue pela v2.7 + `GestaoCatalogos`, nenhum código
  novo necessário.** A varredura contra o protótipo mostrou que o "Fase 0"
  dele (catálogo fixo de 8 tipos + permitir cadastrar novos) já é exatamente
  o que a v2.7 (migração 030) e o `GestaoCatalogos` genérico resolvem aqui:
  `Departamentos` já tem os 8 (`Tipo='DEPARTAMENTO'` para
  UCADESPA/UMADESPA/USADESPA/UHADESPA, `Tipo='SECRETARIA_ADJUNTA'` para
  EBD/FAMILIA/SEMIADESPA/ACAO_DA_FE) e já aceita `numero`/`sigla`/`nome`/
  `tipo`/`ativo` via CRUD genérico (`api/GestaoCatalogos/index.js:22-25`) —
  cadastrar um 9º tipo já funciona hoje, sem alteração de código.
  "Vínculo departamento × congregação (toda congregação tem os 8)" **não**
  vira uma tabela de junção: nenhuma linha física por congregação é criada
  (evitaria 40 congregações × 8 = 320 linhas sem informação própria) — o
  vínculo é **implícito por convenção** e só passa a existir de fato quando
  a v5.2 criar o primeiro `RelatorioDepartamental` daquela congregação+tipo;
  mesmo espírito de "calculado, não cadastrado" já usado em toda a FASE B.

## v5.2 — Relatórios departamentais (formulário dinâmico)

Campos por departamento levantados das planilhas reais (ver protótipo,
`docs/04-departamentos-secretarias.md`) — cada um com bloco de **contagem**
e **ações** próprios, mas **Eventos** (Local/Área/Geral) e **Integração**
(Conversão/Reconciliação/De Outra Igreja) **idênticos nos 8**, e por isso
modelados como estrutura compartilhada, não repetida por tipo:

| Nº | Depto | Contagem (resumo) | Financeiro |
| --- | --- | --- | --- |
| 01 | UCADESPA | Congregados, Visitantes | Mensalidades, Ofertas, Campanhas, Outros |
| 02 | UMADESPA | Em Comunhão, Sem Comunhão, Congregados | idem |
| 03 | USADESPA | idem + Matriculadas/Não Matriculada | idem |
| 04 | UHADESPA | idem + Matriculados/Não Matriculado | idem |
| 05 | SEMIADESPA | Bíblias/Folhetos distribuídos, Discipulado I/II | Mensalidades (lista nominal extensa), Ofertas, Campanhas |
| 06 | Ação da Fé | Cestas, KG por item (18 itens rastreados: arroz, feijão, óleo...) | Contribuições, Ofertas, Campanha |
| 07 | EBD | Presentes/Ausentes/Visitantes, Bíblias, Revistas, **granularidade semanal (1º-5º domingo)** | só Ofertas (sem mensalidade/campanha) |
| 08 | Família | Famílias Crentes/Não Crentes/Único Membro | Mensalidades, Ofertas, Campanhas, Outros |

- [x] `SchemaRelatorio` versionado por `TipoDepartamento` (`DepartamentoId`
      do catálogo v5.1) — muda de campo/rateio no meio do ano sem afetar
      relatórios já enviados (mesmo princípio de versão vigente já usado no
      Texto Mestre, vB.15).
- [x] `CamposFormulario` com grupo (`contagem`/`acoes`/`eventos`/
      `integracao`/`financeiro`) e comportamento: `estado` = pré-preenche
      com o valor do último relatório enviado daquela congregação+depto
      (o líder só corrige o que mudou, tipo IR pré-preenchido); `fluxo` =
      sempre começa zerado (é específico do mês).
- [x] Blocos **Eventos** e **Integração** como estrutura compartilhada
      (mesmo schema pros 8 tipos) — a consolidação campal soma através de
      todos os departamentos, então não pode ser recriada por tipo.
- [x] EBD ganha uma sub-estrutura própria: aba semanal (1º ao 5º domingo)
      com os mesmos campos, que soma no total do mês — único departamento
      com essa granularidade; rótulo do papel local é "Superintendente
      Local" em vez de "Líder Local" (mesma permissão, rótulo diferente,
      guardado no `TipoDepartamento`).
- [x] Lista nominal de contribuintes de mensalidade (nome + valor), alimenta
      o total de Mensalidades do bloco financeiro.
- [x] **Decisão de integração**: `Lideranca` ganha uma coluna nova,
      **`DepartamentoId` (nullable)**, ortogonal ao `EscopoTipo`/`EscopoId`
      territorial já existente — quando `NULL`, o papel enxerga todos os
      departamentos daquele escopo (é assim que Dirigente de Congregação e
      Pastor de Área já funcionam, sem mudança); quando preenchido, restringe
      o papel a um departamento só. Resolve, com **uma coluna aditiva**, os
      3 papéis que o protótipo modela e que não existem ainda: **Líder Local**
      (`EscopoTipo=CONGREGACAO` + `DepartamentoId`), **Líder de Área do
      departamento** (`EscopoTipo=AREA` + `DepartamentoId`) e reaproveita
      **Líder Geral** já criado na v2.7 (`EscopoTipo='DEPARTAMENTO'`, campo
      inteiro) sem alterá-lo.

  Implementado: `sql/migrations/092_relatorios_departamentais.sql` cria
  `SchemasRelatorioDepartamental` (vigência por `DataVigenciaInicio`/`Fim`,
  mesmo padrão de versão vigente da vB.15), `CamposFormularioDepartamental`
  (grupo/comportamento/tipoDado, `PermiteSemanal` **por campo**, não por
  schema — "o schema tem modo semanal" nunca é digitado à parte, é sempre
  `campos.some(c => c.permiteSemanal)`, calculado em
  `shared/relatoriosDepartamentais.js::buscarSchemaVigente`),
  `RelatoriosDepartamentais` (Eventos/Integração como colunas fixas, não
  linhas por schema — literalmente a mesma estrutura para os 8),
  `ValoresCampoRelatorioDepartamental` (EAV só pros campos que variam por
  depto; `NumeroDomingo` nullable resolve semanal x mensal na mesma tabela)
  e `ContribuintesMensalidadeDepartamental`. Seed dos 8 departamentos
  transcrito campo a campo do protótipo (`docs/04-departamentos-secretarias.md`),
  incluindo os 18 itens de cesta da Ação da Fé.

  **"Total do Local" (bloco Financeiro), confirmado pelo usuário e
  implementado**: é a soma de tudo que a congregação arrecadou naquele mês
  pro departamento (Mensalidades + Ofertas + Contribuições + Campanhas +
  Outros — nomes variam por departamento, grupo é sempre `FINANCEIRO`) — a
  base sobre a qual o rateio (v5.4) vai calcular o repasse local/geral.
  `calcularValorTotalFinanceiro` soma todo campo `FINANCEIRO` do schema, sem
  lista fixa de nomes (funciona igual pra Ação da Fé, que usa
  `contribuicoes`/`campanha` no singular, em vez de
  `mensalidades`/`campanhas`) — exposto no detalhe do relatório
  (`valorTotalFinanceiro`) e na tela, logo abaixo do bloco Financeiro.
  Os outros totais calculados no código continuam sendo identidades
  aritméticas do nome do próprio campo: soma das 5 semanas da EBD, e
  `calcularIndicadoresEbd` (Total de Presença = Presentes + Visitantes; %
  Presença/Ausência sobre Matriculados).

  `shared/relatoriosDepartamentais.js`: `buscarSchemaVigente`,
  `buscarValoresParaPrePreencher` (só campos `ESTADO`, do relatório anterior
  mais recente da mesma congregação+depto), `calcularTotalIntegracao`,
  `somarValoresSemanais`, `calcularIndicadoresEbd`. `api/GestaoRelatoriosDepartamentais`
  (`GET`/`POST`/`PUT` `relatorios-departamentais/{id?}/{acao?}`) — escopo
  duplo em toda rota: `auth.estaNoEscopo` (territorial, já existente) **e**
  `auth.podeDepartamento` (novo — `usuario.departamentoId` nulo enxerga
  todos, preenchido restringe a um só). `POST` sem `id` é get-or-create
  idempotente (mesmo padrão de `gerarOuObterRelatorioCredenciamento`, vB.13);
  `PUT` só aceita edição enquanto `Status = 'RASCUNHO'` — o resto da máquina
  de estados (`ENVIADO`/`APROVADO_ÁREA`/`APROVADO_GERAL`/`RETIFICADO`) é
  escopo da v5.3, não fabricado aqui.

  `LoginSecretaria` passou a incluir `Lideranca.DepartamentoId` na sessão
  (`usuario.departamentoId`). **Limitação documentada, herdada do próprio
  desenho de sessão já existente**: como o login escolhe **1 vínculo de
  Lideranca** por amplitude territorial (`RANKING_NIVEL`, vB.9) quando há
  mais de um, alguém que seja Líder Local de 2 departamentos na mesma
  congregação só loga com um deles por vez — mesma regra de sempre, agora só
  mais visível porque multi-vínculo por departamento tende a ser comum.
  Redesenhar sessão pra múltiplos vínculos simultâneos fica fora do escopo
  desta versão.

  Frontend: novo módulo "🗂️ Departamentos e Relatórios" (aba
  `relatoriosdepto`, permissão `relatorios_departamentais`) — seleciona
  congregação/departamento/mês/ano, abre o formulário dinâmico (grupos
  Contagem/Ações/Financeiro gerados a partir do schema, Eventos/Integração
  fixos, semanal só nos campos EBD marcados, lista de contribuintes só
  aparece se o schema tiver campo `mensalidades`) e salva o rascunho.

  Testado com `npx jest` (179 testes, incluindo 17 novos de
  `shared/relatoriosDepartamentais.js`: soma de Integração, soma e
  indicadores semanais da EBD, filtro de pré-preenchimento por
  `ESTADO`, `permiteSemanal` calculado a partir dos campos, e
  `calcularValorTotalFinanceiro` somando só o grupo FINANCEIRO — inclusive
  com nomes de campo diferentes por departamento (Ação da Fé)) e
  `node --check` em todos os arquivos novos/alterados.

  **Verificado ao vivo em produção** (login real, matrícula 1/Presidente):
  catálogo de departamentos bate 100% com o seed da 092 (IDs 1-8, siglas e
  `Tipo` exatos). Achado real: a permissão `relatorios_departamentais`
  **não estava concedida a ninguém** ainda — mesmo padrão de toda permissão
  nova (nunca é automática). `sql/migrations/093_permissao_relatorios_departamentais.sql`
  concede a Presidente/Secretário Geral (GLOBAL), aditivo na string CSV de
  `Papeis.Permissoes`, idempotente. Efeito só no próximo login (o token já
  emitido continua com a permissão antiga até expirar/relogar — mesmo
  comportamento de qualquer mudança de permissão no sistema).

## v5.3 — Fluxo de aprovação (2 camadas)

> **Por que só 2 camadas, e não uma por nível territorial**: pesquisa
> dedicada no Regimento (pedido explícito do usuário, que lembrou que
> Região/Quadrante/Distrito nem existiam quando a v5.1-v5.2 foram desenhadas)
> confirmou que Região (CRA+TER) e Quadrante (CEQ) são **colegiados
> representados por delegação** — o próprio Regimento diz que "Dirigentes
> de congregação comum não têm assento no CRA, sendo representados pelos
> seus Pastores de Área" (Art. 104-B, já citado na v2.7) — ou seja, quem age
> por eles hoje já é o Pastor de Área (nível 2), não um agente próprio da
> Região agindo direto sobre a congregação/departamento. Distrito é só
> FASE 9 (macroexpansão). Nenhum texto do Regimento sustenta hoje um ator
> de Região/Quadrante/Distrito aprovando ou travando relatório
> departamental — só consolidação/soma agregada (v5.5.1/v5.8), que é papel
> de leitura, não de aprovação.

- [x] Preenchimento pelo Líder Local **ou** Dirigente da Congregação
      (Dirigente pode sobrepor qualquer departamento da própria congregação)
      — se os dois editarem antes do envio, **a última edição é a que
      segue** pra revisão (sem mesclar).
- [x] Aprovação de Área (Líder de Área do depto, ou Pastor de Área que vê
      todos) — **só aprova ou comenta, nunca edita valor**; aprovar bloqueia
      edição do Líder Local (`status = 'aprovado_area'`).
- [x] Aprovação Geral (Líder Geral do depto) — **pode corrigir valores
      diretamente** (não existe upload de comprovante no sistema — decisão
      deliberada do protótipo, confirmada aqui também — então é o Líder
      Geral quem bate o relatório contra o caixa real e ajusta); aprovação
      **definitiva e superior** à de Área (`status = 'aprovado_geral'`).
- [x] Retificação só pelo Presidente/Secretário Geral após `aprovado_geral`
      — única forma de alterar um relatório já fechado.
- [x] Envio fora do prazo é permitido, mas marca `atrasado`; cabe ao Líder
      Geral decidir se entra no fechamento do mês de referência ou rola pro
      seguinte — campos `estado` não duplicam (só substituem), campos
      `fluxo` somam no período em que forem de fato integrados.
- [x] Trilha estruturada obrigatória em toda ação (quem, o quê, quando, com
      que nível) — **pedido explícito do usuário: "profissional, não
      genérico"** — `AprovacoesRelatorioDepartamental` (migração 094), não
      só o `AuditLog` genérico (mesmo padrão de `SessoesMediacao`/
      `CredenciamentosAssembleia`: histórico com comentário é dado de
      domínio). `NivelAprovador` usa o mesmo vocabulário de
      `Lideranca.EscopoTipo` e já reserva `REGIAO`/`QUADRANTE`/`DISTRITO`
      pra quando a FASE 9 os ativar — plugam aqui sem redesenho.
- [x] Nenhum relatório é aprovado automaticamente.

  Implementado: `sql/migrations/094_aprovacao_relatorios_departamentais.sql`
  cria `AprovacoesRelatorioDepartamental`. `shared/relatoriosDepartamentais.js`
  ganhou a máquina de estados pura (`resolverTransicao`, testável sem banco)
  e `nivelAutorizadoParaAcao` (mapa nível→ações permitidas — `GLOBAL` sempre
  pode tudo, docs do protótipo: "Presidente/Secretário Geral têm a última
  palavra"), mais `calcularPrazoEnvio`/`relatorioEstaAtrasado` ("até o mês
  seguinte", docs/06 do protótipo). `api/GestaoRelatoriosDepartamentais`
  ganhou `POST /{id}/{acao}` (`enviar`/`aprovar-area`/`comentar`/`corrigir`/
  `aprovar-geral`/`retificar`) — cada ação confere escopo (território +
  departamento) **e** nível, calcula a transição, grava valor (quando a
  ação é `corrigir`/`retificar`) e a trilha, tudo em sequência.

  **Bug real encontrado e corrigido nesta versão** (latente desde a v2.7,
  só exposto agora que o Líder Geral precisa agir sobre relatórios de
  qualquer congregação do campo): `shared/escopo.js::resolverEscopoCongregacoes`
  não tratava `EscopoTipo='DEPARTAMENTO'` (Líder Geral) — caía no `if
  (!query) return []`, ou seja, resolvia pra **zero congregações** em vez
  de campo inteiro. Passava despercebido porque o único uso do papel até
  aqui (assento na CLI) lê `Lideranca` direto, nunca passa por esse
  resolver. Corrigido: `DEPARTAMENTO` resolve como `GLOBAL` (`'TODAS'`).
  Também corrigido em `LoginSecretaria`: o Líder Geral guarda o
  departamento em `EscopoId` (mecanismo da v2.7), não na coluna
  `DepartamentoId` nova (mecanismo da v5.2) — a sessão agora resolve os
  dois casos.

  Frontend: painel "Fluxo de Aprovação" com botões condicionados a
  `authNivel` + status (nunca a única defesa — o backend sempre reconfere),
  trilha visível em tabela, campos ficam `readonly` fora da janela de quem
  pode editar naquele status.

  **Verificação em produção**: só até onde dá sem escrever dado fictício —
  respeitando o combinado (visualizar, nunca editar em produção), não criei
  nenhum relatório de teste passando pelos 5 status. Verificado por: 199
  testes unitários (`npx jest`, 1 falha pré-existente e não relacionada em
  `credenciamento.test.js`, dependente do relógio, confirmada com
  `git stash` — reportada, não corrigida aqui), `node --check` em todos os
  arquivos, e deploy real com CI verde (migração 094 rodando contra o Azure
  SQL de produção).

## v5.4 — Tesouraria central por departamento

- [x] `TesourariasDepartamento` (livro-caixa central, 1 por depto/mês):
      saldo transportado do mês anterior, movimentação geral do mês (soma
      do "para o geral" de todos os relatórios aprovados), investido local,
      entrada geral, **suporte para Secretaria Geral** (dedução extra
      **facultativa por departamento** — a maioria não usa, ex. SEMIADESPA
      usa — não é fórmula, é opção configurada no perfil de rateio), +
      `DespesasTesouraria` (lançamentos livres do Líder Geral) → saldo do mês.
- [x] `PerfisRateio` por `SchemaRelatorio`, com **5 métodos reais**
      confirmados nas planilhas (não 4 — o rascunho anterior citava só
      integral/percentual/mensalidade/variável): **integral geral** (100%
      sobe), **integral local** (100% fica — caso do EBD hoje), **taxa fixa
      de mensalidade** (ex. USADESPA), **percentual** (ex. 40% geral na
      Família) e **variável/manual** (decidido lançamento a lançamento, ex.
      UHADESPA — não é inconsistência de dado, é o método daquele depto).
      Cada perfil registra também o **modo de entrada**: `bruto_calculado`
      (sistema divide o valor informado) ou `líquido_manual` (quem preenche
      já lança só a parte que sobe, sem o sistema recalcular — confirmado em
      departamentos que usam percentual, pra simplificar o preenchimento).
- [x] Rateio local/geral calculado linha a linha no relatório mensal
      (camada 1), consolidado na tesouraria do depto (camada 2) — duas
      camadas financeiras, não uma.
- [x] Saldo transportado mês a mês.
- [x] **Autonomia de arrecadação/gasto dos departamentos** (Estatuto, Art. 49)
      — vinha adiada de `v2.7` (item 5): Departamentos/Áreas/Congregações
      podem gerir recursos internos ("caixas de departamento") pra custear
      suas próprias atividades, com a vedação expressa do Art. 49, I (nenhum
      órgão de apoio, Pastor de Área ou Dirigente pode contrair dívida,
      assinar contrato ou assumir obrigação jurídica em nome da IEADESPA sem
      autorização por escrito do Pastor Presidente e do 1º Secretário). Só
      faz sentido depois que `TesourariasDepartamento`/`Despesas` (acima)
      existirem de verdade — não tem como controlar autonomia de caixa sem
      caixa.
- [x] **Saldo virtual individualizado dentro da conta única** (Reg. Art. 133-C
      §1º) — mesmo **princípio** de Centro de Custo já provado na v4.1.3/v4.10
      (saldo = liberado − pago, sempre calculado); **não** reaproveita a
      função literal `shared/tesouraria.js::saldoCentroCusto` — ver correção
      de rumo documentada abaixo.
- [x] **Bloqueio automático por balancete não entregue** (Reg. Art. 133-C §2º):
      *"a não apresentação do balancete mensal bloqueia imediatamente a liberação
      de novos recursos"*. É bloqueio, não alerta — e é calculado na leitura
      (o mês anterior fechou sem balancete → a liberação trava sozinha), nunca
      marcação manual de alguém "lembrar de bloquear". Conecta com a v4.12
      (bloqueio de repasse por falta de prestação de contas): é a mesma regra,
      um nível abaixo.
- [x] Despesa vinculada à finalidade específica do grupo (Reg. Art. 152, I-II) —
      dinheiro de departamento não custeia atividade de outro (garantido por
      desenho: não existe mecanismo nenhum de mover dinheiro entre
      `TesourariasDepartamento` de departamentos diferentes).

  **Correção de rumo em duas rodadas, documentada não escondida.**

  **Rodada 1** (primeira versão desta seção): prometia reaproveitar
  `shared/tesouraria.js::saldoCentroCusto` literalmente — incompatível com
  a decisão de "financeiro exclusivo" da abertura da FASE 5, porque aquela
  função opera sobre os livros da FASE 4. Reaproveitado o princípio, não a
  função, em tabelas próprias.

  **Rodada 2** (achado do usuário, verificado com pesquisa dedicada em duas
  partes): tabelas próprias e exclusivas resolvem "quem preenche o
  relatório", mas criam um problema real de **auditabilidade** — existe
  **uma única conta bancária real**; dinheiro "para local"/"para geral" de
  departamento nunca sai fisicamente dela, então precisa aparecer no
  consolidado que o Conselho Fiscal audita, mesmo com o lançamento do dia a
  dia continuando exclusivo. Duas pontes construídas, uma para cada lado:

  - **Lado LOCAL (por congregação)**: pesquisa confirmou que o Financeiro
    geral já tem um "Tesouro Local" **funcional e auditado** (papel
    "Tesoureiro Local", `GestaoSaidas`/`SaidasTesouraria`/`CategoriasSaida`
    — alçada de aprovação por valor, segregação de funções, "quatro olhos"
    acima de valor crítico, trava real de saldo). Reinventar um motor mais
    fraco só pro departamento seria pior proteção pro mesmo dinheiro real.
    `sql/migrations/097_ponte_financeira_departamental.sql` cria 8
    categorias novas (`CentroCusto = 'DEPTO_<SIGLA>'`, `TipoFundo =
    'RESTRITO'`) e `shared/tesouraria.js::saldoCentroCusto` aprende a somar
    o saldo desses Centros de Custo a partir de
    `RelatoriosDepartamentais.ValorParaLocal` (não de `FechamentosTesouraria`,
    que é a fonte do dízimo/oferta geral, não de departamento).
    `GestaoSaidas` passa a aceitar também a permissão `tesouraria_departamental`
    (`shared/tesouraria.js::podeOperarCentroCusto`): quem só tem essa
    permissão (não `financeiro`) só opera a categoria do próprio
    departamento — mesmo motor, escopo mais estreito.
  - **Lado GERAL (campo inteiro)**: **não** vira saldo comum do Tesouro
    Geral compartilhado — é dinheiro discricionário do próprio departamento
    (Estatuto Art. 49, autonomia de gestão); misturar no Tesouro Geral
    tiraria essa autonomia e daria a qualquer Tesoureiro Geral o poder de
    gastá-lo por uma Saída comum. Também **não** é `RepassesInstitucionais`
    (v4.15) — aquela tabela é o dízimo institucional de 10% (Art. 126-N),
    um tributo diferente; usá-la aqui misturaria dois conceitos financeiros
    distintos (achado confirmado lendo o código: nem o repasse de
    Departamento/Distrito daquele mecanismo credita em saldo real hoje —
    lacuna pré-existente da v4.15, não desta versão, registrada mas não
    corrigida aqui). Continua em `TesourariasDepartamento`/
    `DespesasTesourariaDepartamento` (já existente) — mas agora **visível
    no mesmo relatório que a Tesouraria Geral já usa**
    (`RelatorioSituacaoTesouro`, v4.10): nova seção "Departamentos e
    Secretarias" com saldo local consolidado (calculado ao vivo) e saldo
    geral do último balancete fechado, sem precisar abrir 8 telas.
  - **Rateio agora CONGELA na aprovação geral/retificação**
    (`RelatoriosDepartamentais.ValorParaGeral/ValorParaLocal`, mesma
    migração 097): antes era só calculado ao vivo — mudar o perfil de
    rateio depois mudaria retroativamente relatórios já aprovados, o mesmo
    tipo de bug que a versão vigente do Texto Mestre (vB.15) já existe pra
    evitar.

  Implementado: `sql/migrations/095_tesouraria_rateio_departamental.sql`
  cria `PerfisRateioDepartamental` (1 por `SchemaRelatorioId`),
  `ParametrosTesourariaDepartamento` (limite de despesa sem autorização,
  Art. 49), `TesourariasDepartamento` e `DespesasTesourariaDepartamento`.
  Seed dos perfis: **4 métodos confirmados na planilha real** (EBD=Integral
  Local, USADESPA=Mensalidade Fixa, FAMÍLIA=Percentual 40% líquido,
  UHADESPA=Variável Manual) + SEMIADESPA com suporte confirmado (R$150) mas
  método base ainda não; **UCADESPA/UMADESPA/AÇÃO DA FÉ nascem com
  `Confirmado = 0`** — sem a planilha física de cada um em mãos, não dá pra
  garantir o método real, fica marcado pra quem administra confirmar
  (decisão documentada, não fabricada).

  `shared/tesourariaDepartamental.js::calcularRateio` — os 5 métodos, sem
  duplicar fórmula (PERCENTUAL e MENSALIDADE_FIXA usam o mesmo cálculo);
  `paraLocal` vem `null` (não 0) quando o modo é `líquido_manual` — reportar
  zero seria fabricar um número que ninguém mediu.
  `RelatoriosDepartamentais.ValorManualParaGeral` (coluna nova) guarda a
  decisão do VARIAVEL_MANUAL lançamento a lançamento — o "para local" sai
  sempre por subtração do Valor Total, nunca os dois digitados separado.
  `balanceteBloqueado` só bloqueia quando o departamento já tinha atividade
  antes/no mês anterior e esse mês não foi fechado — departamento sem
  nenhuma atividade prévia não tem o que "não entregar". `fecharMes`
  (`api/GestaoTesourariaDepartamental`) segue o mesmo padrão "gerar e
  congelar" da `RelatoriosCredenciamento` (vB.13): reexecutar devolve o
  fechamento já existente, nunca recalcula; também recusa fechar fora de
  ordem (mês anterior sem fechamento).

  Art. 49: `DespesasTesourariaDepartamento.AutorizadoPor` é obrigatório
  acima do `LimiteDespesaSemAutorizacao` (padrão R$ 1.000, configurável por
  depto) — a API confere que quem autorizou tem de fato um Papel `Nivel =
  'GLOBAL'` (Pastor Presidente/1º Secretário), não aceita qualquer matrícula.

  Permissão nova `tesouraria_departamental` (Funcionalidade dedicada, não
  reaproveita `relatorios_departamentais`): visualização pode ser concedida
  a qualquer nível (inclusive Líder Local/Área, se quem administra decidir
  — pedido do usuário: "exclusivo pros líderes e tesoureiros locais e de
  área"); lançar despesa e fechar mês exigem nível `DEPARTAMENTO`/`GLOBAL`;
  configurar o perfil de rateio exige `GLOBAL` (docs do protótipo: é sempre
  o Secretário Geral quem configura, a pedido do Líder Geral — nem o
  próprio Líder Geral edita direto).

  Frontend: painel "💰 Tesouraria do Departamento" na mesma aba de
  Relatórios — resumo do mês (aberto, calculado ao vivo, ou fechado,
  congelado), lista/lançamento de despesas, botão de fechar mês, e edição
  do perfil de rateio (só GLOBAL). No relatório mensal (v5.2/v5.3), o
  rateio calculado aparece junto ao Valor Total — com campo editável pra
  "quanto vai pro Geral" nos departamentos VARIAVEL_MANUAL.

  Testado com `npx jest` (230 testes, incluindo 22 de
  `shared/tesourariaDepartamental.js` — os 5 métodos de rateio, Art. 49
  (precisaAutorizacao), cálculo de saldo, bloqueio de balancete nos 4
  cenários — e mais 5 novos em `shared/tesouraria.js` da rodada 2:
  `saldoCentroCusto` com Centro de Custo `DEPTO_*`, `centroCustoDepartamental`,
  e `podeOperarCentroCusto` nos 3 cenários de permissão) e `node --check`
  em todos os arquivos novos/alterados.

  **Verificado ao vivo em produção** (mesmo login já usado nas verificações
  anteriores): catálogo de departamentos e CI confirmados; achado repetido
  da v5.2 — a permissão `tesouraria_departamental` também não nascia
  concedida a ninguém. `sql/migrations/096_permissao_tesouraria_departamental.sql`
  concede a Presidente/Secretário Geral, mesmo padrão aditivo da 093.

  **Rugosidade de UX conhecida, não escondida**: quem só tem
  `tesouraria_departamental` agora acessa a aba Financeiro → Saídas (pra
  gastar o saldo Local do próprio departamento), mas o formulário ainda
  lista todas as categorias de Saída do sistema (o backend recusa
  corretamente qualquer categoria que não seja a do próprio departamento,
  então não há brecha de segurança) — filtrar a lista de categorias no
  front pra mostrar só a do departamento fica como polimento futuro, não
  fabricado como "pronto" aqui.

## v5.5 — Integração automática EBD + 4 departamentos

**Princípio (vale pra esta versão e pra qualquer fase de trabalho dedicada
que vier depois, não só EBD): relatório não é trabalho.** A FASE 5 é **sempre**
a camada de relato/consolidação mensal — existe pra todos os 8, sempre.
Quando um departamento ganha uma **fase de trabalho** própria (dia a dia,
operacional — hoje só a EBD tem, na FASE 6; amanhã pode ser Ação da Fé com
seu módulo de assistência social, reservado mas não construído), essa fase
não substitui o relatório da v5.2 nem duplica lançamento nela — ela
**exporta** o consolidado do período pro relatório, que o Líder
Local/Superintendente só **confirma ou ajusta** (nunca digita do zero o que
o sistema de trabalho já mediu de verdade). O que a fase de trabalho **não**
consegue quantificar (ex: uma ação qualitativa, um evento que não tem
contador automático) continua sendo preenchido manualmente no relatório,
porque é isso que o relatório é: onde se registra o que existe, venha de
onde vier.

- [ ] EBD alimenta o depto 07 (presenças, matriculados, visitantes, bíblias,
      revistas, ofertas) a partir da FASE 6 (`chamada-ebd`) quando ela
      existir, pré-preenchendo o relatório do mês pro Superintendente Local
      confirmar/ajustar — nunca digitado do zero enquanto a FASE 6 já mediu.
      Até a FASE 6 existir, o campo 07 recebe lançamento manual como os
      outros 7 (é o relatório funcionando sem a fase de trabalho por trás,
      não um bloqueio).
- [x] Financeiro da EBD (v6.7) segue o mesmo princípio: o dia a dia (ofertas
      lançadas por congregação) mora na FASE 6, perto de onde o trabalho
      acontece; o consolidado do mês **exporta** pra `TesourariasDepartamento`
      (v5.4, depto EBD) — é a v5.4, não a v6.7, quem concilia com o Centro de
      Custo geral da FASE 4, exatamente pelo mesmo caminho que os outros 7
      departamentos usam.

  Implementado na v6.7 (`shared/ebdFinanceiro.js`): o consolidado do ledger
  vira valor de PARTIDA ainda editável do campo `ofertas`, sem nenhuma
  escrita direta em `TesourariasDepartamento`, exatamente como este item
  previa.
- [x] UCADESPA/UMADESPA/USADESPA/UHADESPA puxam afiliados + situação de
      comunhão direto de `MembroReferencia.DepartamentoId`/`SituacaoMembro`
      — pré-preenche o bloco de contagem (`estado`) sem o líder local
      recontar manualmente.

  Implementado: `shared/relatoriosDepartamentais.js::contagemAfiliadosDepartamento`
  conta, ao vivo, `MembroReferencia` ativo por `DepartamentoId`+`CongregacaoId`,
  agrupado por `SituacaoMembro` (mesmo catálogo `SituacoesMembro` usado em
  todo o resto do sistema: `CONGREGADO`/`EM_COMUNHAO`/`SEM_COMUNHAO`) —
  mapeado 1:1 pros campos `congregados`/`membrosEmComunhao`/`membrosSemComunhao`
  já seedados na v5.2. Vale só pros 4 departamentos **Tipo='DEPARTAMENTO'**
  (faixa etária/gênero) — as 4 secretarias (`SECRETARIA_ADJUNTA`) nunca
  ganham esse tratamento, mesmo se por acaso usassem um nome de campo
  coincidente (Família conta famílias, não membros individuais; não faz
  sentido lá).

  **Vai além de "pré-preenche"**: esses 3 campos nunca são gravados como
  digitados, nem no rascunho — são recalculados a cada leitura
  (`GestaoRelatoriosDepartamentais::montarDetalheRelatorio`), e o backend
  recusa persistir qualquer valor enviado pra eles
  (`gravarValores`, defesa em profundidade — o front já manda o campo
  `readonly`). Isso elimina de vez a divergência entre o que o líder local
  reconta à mão e o cadastro real (pedido explícito do usuário: "pra não
  ficar editando, pra não ter erro de dados"). Consequência: também não
  herdam do relatório do mês anterior (`camposParaPrePreencher` os exclui
  mesmo sendo `ESTADO`) — não tem por quê, o valor de agora é sempre o
  valor certo.

  Frontend: os 3 campos aparecem com rótulo "(calculado do cadastro de
  membros)" e input sempre `readonly`, em qualquer status do relatório.

  Testado com `npx jest` (236 testes, incluindo 6 novos: contagem com
  situação ausente zerando corretamente, `aplicarContagemAutomatica` nunca
  inventando um campo que o schema não tem, `automatico=true` só em
  Tipo='DEPARTAMENTO', e exclusão do pré-preenchimento) e `node --check`.

### v5.5.1 — Consolidado de Campo *(módulo novo, pedido do usuário)*

O relatório mensal (v5.2/v5.3) responde "como foi o mês do UCADESPA na
Congregação X"; falta a pergunta inversa, que é a que o Pastor Presidente e
o Presidente do Campo realmente fazem: "como está a Congregação X (ou a
Área Y, ou o Campo inteiro) neste mês, olhando os 8 departamentos juntos?" —
exatamente o "bater a situação eclesiástica da congregação" que justifica os
8 estarem na mesma fase.

- [x] Painel consolidado por **congregação**: os 8 relatórios do mês lado a
      lado, com os blocos Eventos/Integração **somados** entre departamentos
      (não só listados) — é o número que o Regimento pede pra retrato
      eclesiástico da congregação.
- [x] Consolidado por **área** (soma de todas as congregações da área) e por
      **campo** (soma de todas as áreas) — mesma agregação, granularidade
      maior; mesmo princípio de `resolverEscopoCongregacoes`
      (`shared/escopo.js`), adaptado pra devolver `CongregacaoId` (não nome)
      porque a agregação aqui é numérica, não territorial-por-nome.
- [x] Indicador de pendência: quais departamentos daquela congregação ainda
      não enviaram o relatório do mês corrente (calculado, não marcado à
      mão) — sem isso o consolidado mentiria por omissão num mês incompleto.
- [x] Comparativo mês a mês / ano a ano por congregação e por departamento
      (série histórica), com os dados já estruturados por `CampoFormulario`
      desde a v5.2 — nenhuma migração de dado histórico solto pra fazer.

  Implementado: `shared/consolidadoDepartamental.js` — `resolverCongregacoesDoNivel`
  (congregação/área/campo), `agregarConsolidado` (cruza TODAS as
  congregações do escopo × os 8 departamentos, mesmo quando não há
  relatório: aparece como pendência, nunca como zero silencioso) e
  `historicoConsolidado` (últimos N meses, só relatórios `ENVIADO` ou além
  — números ainda em rascunho não entram na série histórica). Pendência é
  calculada (`relatorioEstaPendente`): sem relatório ou ainda `RASCUNHO`
  conta como pendente, mesmo critério do resto do sistema
  ("calculado, nunca marcado à mão").

  `api/GestaoConsolidadoDepartamental` (`GET /consolidado-departamentos?nivel=congregacao|area|campo&id=&mes=&ano=&historico=N`)
  — escopo conferido de verdade: nível `campo` exige `escopoCongregacoes ===
  'TODAS'` (Presidente/Secretário Geral); `congregacao`/`area` conferem que
  **toda** congregação do escopo pedido está dentro do que o usuário
  enxerga, nunca uma amostra "quase toda". Toda lista de IDs vira `IN
  (@id0,@id1,...)` parametrizado — nunca concatenação de string na query,
  mesmo vindo de uma consulta interna já confiável.

  Frontend: painel "📊 Consolidado de Campo" na mesma aba de Relatórios —
  seletor de nível (congregação/área/campo), retrato eclesiástico do mês
  (totais somados entre departamentos), tabela por departamento com
  enviados/pendentes, lista de pendências nominal, e histórico dos últimos
  12 meses.

  Testado com `npx jest` (249 testes, incluindo 13 novos de
  `shared/consolidadoDepartamental.js`: pendência calculada certa nos 2
  casos — sem relatório e `RASCUNHO` —, soma só dos não-pendentes, soma
  ENTRE departamentos diferentes no total geral, e o histórico em ordem
  cronológica) e `node --check` em todos os arquivos novos.

## 🔒 Trava de Revisão 5-A — antes de avançar para a v5.6

- [x] Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da
      seção 3). Auditadas v5.1 a v5.5 (+v5.5.1) pelas 5 perguntas do
      checklist (17/09).

  **1. Todo código novo roda de ponta a ponta contra o ambiente real?**
  Sim — `npx jest` (249 testes, suíte inteira) e `node --check` em todo
  `.js` de `api/`/`app/` sem erro. Migrações 092-097 idempotentes e
  confirmadas rodando contra o Azure SQL de produção (`gh run view --log`
  mostra as 6 nos passos "Executar Migrações SQL" dos runs que fecharam
  v5.2/v5.3/v5.4). Zero `timerTrigger` em todo `api/` (achado da Trava B-A
  não voltou). Toda rota nova (`relatorios-departamentais`,
  `tesouraria-departamental`, `consolidado-departamentos`) conferida entre
  `function.json` e as chamadas `fetch` de `app/script.js` — nenhuma
  divergência.

  **2. Toda tela nova abre e mostra dado de verdade?** Checagem sistemática
  de `getElementById` (872 chamadas) contra todo `id` existente (1093) —
  mesmos 2 falsos positivos já investigados nas travas anteriores
  (`caixaSino`, `permissaoEscopoTodas`, ambos fora do escopo da FASE 5),
  **nenhum bug novo**.

  **3. README e código continuam narrando a mesma coisa?** Auditoria
  cruzada da FASE 5 inteira: as 3 correções de rumo documentadas
  (bug de `resolverEscopoCongregacoes` não tratando `EscopoTipo=
  'DEPARTAMENTO'`, a ponte `saldoCentroCusto`↔`RelatoriosDepartamentais.
  ValorParaLocal`, e os 3 campos calculados que `gravarValores` recusa
  persistir) existem de verdade no código, não só no texto. Referências
  cruzadas (`v2.7`, `v4.1.3`, `v4.10`, `v4.12`, `v4.15`, `vB.9`, `vB.13`,
  `vB.15`, `vB.16`, `v7.2`, `v7.5`) apontam pra seções reais. Os 2 itens
  `[ ]` da v5.5 (EBD alimentando o depto 07 e financeiro via v6.7, ambos
  dependentes da FASE 6 que ainda não existe) não têm nenhum código
  fingindo tê-los implementado.

  **4. O que ficou pra trás foi de fato corrigido, não só anotado?** Nenhum
  `TODO`/`FIXME`/gambiarra novo no diff da FASE 5. **Achado real, mas já
  resolvido antes desta trava**: o próprio push da v5.3 falhou o CI **duas
  vezes seguidas** (`4d84616`, `3bea57a`) no passo de testes — não chegou a
  rodar a migração 094 nem fazer deploy nessas duas tentativas. Causa: um
  teste flaky em `credenciamento.test.js` dependente do relógio, que por
  trás escondia um **bug de raiz real** (`estatuto.js::diasDesde` dava -1
  pra "hoje" antes do meio-dia local) — corrigido no commit seguinte
  (`c8fa9fb`), e só aí o CI ficou verde e a migração 094 rodou contra
  produção de verdade (confirmado no log do run). O README de v5.3 já
  registrava a falha do teste como conhecida; esta trava confirma que a
  causa raiz foi corrigida, não só a sintoma silenciada, e que nenhuma
  versão seguinte (v5.4/v5.5) ficou represada atrás disso.

  **5. Deploy real, de ponta a ponta, aconteceu?** Sim. Todos os 11
  commits de v5.1 a v5.5.1 estão em `origin/main`; `gh run list` confirma
  `success` em 9 deles e as 2 falhas isoladas da pergunta 4 (ambas sem
  chegar a mexer no banco, e corrigidas antes de v5.4 começar). Testado ao
  vivo agora: `https://app.ieadespa.org.br/` no ar (200);
  `/api/relatorios-departamentais`, `/api/tesouraria-departamental` e
  `/api/consolidado-departamentos` devolvem `401` sem sessão (rotas novas
  protegidas, sem regressão).

## v5.6 — Escalas de serviço com auto-escalador *(7ª rodada)*

A v7.5 já prevê "escala de rodízio voluntário". A pesquisa de mercado mostrou que
o que transforma escala em ferramenta útil não é a grade — é o que acontece
**quando alguém não pode**: hoje, em qualquer congregação, isso vira corrente de
WhatsApp e o secretário refazendo tudo na mão.

- [x] **Indisponibilidade declarada pelo voluntário** (viagem, trabalho, período)
      — a escala nunca sugere quem já se declarou indisponível.
- [x] **Troca entre voluntários** pedida pelo próprio voluntário, com aprovação do
      líder da equipe — tira o secretário do meio da negociação.
- [x] Auto-escalador por "quem serviu por último" + frequência preferida
      ("uma vez por mês"), detectando **conflito entre equipes** (a mesma pessoa
      escalada em louvor e recepção no mesmo culto).
- [x] Convite em cadeia: recusou, o sistema convida o próximo automaticamente.
- [x] Publicação da escala e confirmação de recebimento — quem não confirmou
      até X dias vira pendência do líder.
      *(referência: Planning Center Services; ChurchSuite Rotas)*
- [x] **Integração com o Portal do Membro (vB.5)**: quando esta versão existir,
      "aceitar/recusar/trocar com outro voluntário" vira sub-aba de
      autoatendimento dentro de "Meu Painel" (mesmo padrão de Minhas
      Contribuições/Cartas de Trânsito), com push/e-mail do motor de
      notificações (vB.2) avisando convite em cadeia e pendência de
      confirmação. A vB.5 já deixou a infraestrutura (login simplificado,
      PWA, push) pronta pra isso sem precisar de versão nova — só ligar aqui.

  Implementado: `shared/escalas.js` — toda a lógica de decisão é pura (sem
  tocar banco), pra ser testável sem Azure SQL: `estaIndisponivelNaData`
  (indisponibilidade declarada exclui de verdade), `ordenarCandidatosElegiveis`
  ("quem serviu por último" + `FrequenciaPreferidaDias`, nunca-serviu vem
  antes de quem já serviu), `temConflitoEntreEquipes` (mesma pessoa ativa —
  CONVIDADO/ACEITO/CONFIRMADO — em outra equipe no mesmo `ServicoId`),
  `autoEscalarServico` (monta a fila de convite em cadeia inteira por
  equipe, não só o escolhido, já descontando quem outra equipe ocupou no
  mesmo processo), `proximoConviteAposRecusa` (avança a cadeia pulando quem
  já recusou), `listarPendenciasConfirmacao` (quem não confirmou até
  `PrazoConfirmacaoDias` depois de `PublicadaEm`) e `validarTroca` (recusa
  troca que criaria indisponibilidade ou conflito entre equipes). As
  funções de banco (`criarEquipe`, `criarServico`, `gravarAlocacao`,
  `decidirTroca` etc.) são finas de propósito — só orquestram o que a
  lógica pura já decidiu.

  Migração `098_escalas_servico.sql` — `EscalasEquipes`, `EscalasEquipeMembros`
  (com `FrequenciaPreferidaDias`), `EscalasServicos` (RASCUNHO/PUBLICADA/
  CANCELADA), `EscalasAlocacoes` (CONVIDADO/ACEITO/RECUSADO/CONFIRMADO/
  CANCELADA), `EscalasIndisponibilidades` e `EscalasTrocas`, mais 2 regras
  novas em `NotificacaoRegras` (`ESCALA_CONVITE_CADEIA`,
  `ESCALA_CONFIRMACAO_PENDENTE`).

  **Decisão de arquitetura, avaliada e documentada** (não pulada): o motor
  genérico de workflow (`shared/workflow.js`, vB.3) resolve responsável por
  permissão + nível territorial (Congregação..Global); aprovação de troca
  de escala é resolvida pelo **líder da equipe**, uma pessoa concreta
  amarrada à `EscalasEquipes.LiderMembroId`, não a um nível territorial —
  forçar isso no motor genérico exigiria inventar um "nível" fictício por
  equipe, pior que não reusar. `EscalasTrocas` tem seu próprio Status
  (PENDENTE/APROVADA/RECUSADA); a parte do princípio "não recodar o mesmo
  fluxo" que de fato se aplica foi reusada: convite em cadeia e pendência
  de confirmação passam pelo mesmo `shared/notificacaoMotor.js`
  (vB.2) que todo o resto do sistema usa.

  `api/GestaoEscalas` (`/api/escalas/{acao}`) — `equipes` (GET/POST),
  `equipes-membros` (GET/POST), `servicos`/`servicos-detalhe` (GET/POST),
  `auto-escalar` e `publicar` (POST, só quem tem a permissão `escalas` e
  está dentro do escopo territorial da congregação — mesmo
  `auth.estaNoEscopo` de sempre), `responder`/`confirmar`/`indisponibilidade`
  (o próprio voluntário, dono do registro), `trocas`/`trocas-aprovar`
  (líder da equipe ou quem tem `escalas` — "nível mais alto cobre o de
  baixo", mesmo princípio de `shared/escopo.js`), `pendencias-confirmacao`
  e `minhas-alocacoes` (o hook do Portal do Membro). Recusar um convite já
  dispara a cadeia **na hora** (não espera a rodada diária do avaliador de
  notificações): calcula o próximo elegível, grava o novo CONVIDADO e chama
  `enviarCanaisNotificacao` direto — e-mail/push imediato. A pendência de
  confirmação (quem não confirmou em X dias) tem 2 caminhos: em tempo real
  na tela do líder (`pendencias-confirmacao`) e, pra quem não abre a tela,
  a rodada diária do `NotificacoesAgendador` via o detector novo
  `shared/notificacaoDetectores.js::detectarConfirmacaoEscalaPendente`.

  Frontend: módulo "Escalas de Serviço" (`app/index.html`/`app/script.js`)
  com telas de Equipes (criar equipe, incluir voluntário + frequência
  preferida), Serviços (criar, rodar o auto-escalador, publicar, ver
  alocações), fila de Trocas Pendentes e Pendências de Confirmação (visão
  do líder). Hook do Portal do Membro (vB.5): sub-aba "Minhas Escalas" em
  "Meu Painel" (mesmo padrão de Minhas Contribuições/Cartas de Trânsito) —
  aceitar/recusar convite, confirmar recebimento, pedir troca e declarar
  indisponibilidade, sem abrir o painel administrativo. Curso corrigido em
  relação ao plano original: a integração vB.5 não esperou "quando esta
  versão existir" — a infraestrutura de autoatendimento já estava pronta,
  então o hook foi ligado nesta mesma versão, como o próprio item já
  antecipava.

  Testado com `npx jest` (273 testes, incluindo 24 novos de
  `shared/escalas.js`: indisponibilidade excluindo candidato mesmo sendo o
  mais elegível por frequência, ordenação certa entre "nunca serviu" e
  "serviu há mais tempo", conflito entre equipes detectado e **não**
  disparando por engano em alocação RECUSADA/CANCELADA de outra equipe,
  auto-escalador evitando escalar a mesma pessoa 2x no mesmo serviço
  mesmo quando ela seria a mais elegível pras duas equipes, fila de
  convite em cadeia completa — não só o escolhido —, avanço da cadeia
  pulando quem já recusou antes, pendência de confirmação calculada certa
  nas bordas do prazo, e validação de troca recusando indisponibilidade e
  conflito) e `node --check` em todos os arquivos novos/alterados.

## v5.7 — Triagem e habilitação de voluntários *(7ª rodada — pré-requisito da FASE 7)*

Hoje o voluntariado é "assinar o termo da Lei 9.608/98 e entrar na escala"
(v7.5). O padrão internacional de proteção institucional é uma **esteira
sequencial** — e ela é pré-requisito de tudo que envolve menores (v7.7).

- [x] Esteira de habilitação com etapas obrigatórias **sequenciais** (não dá pra
      pular): ficha de inscrição → referências internas → entrevista registrada →
      antecedentes (v7.7) → treinamento (v7.7) → termo assinado → **apto**.
      Status por voluntário: apto / pendente / inapto / vencido.
      *(MinistrySafe 5-Part Safety System; Praesidium Safety Equation)*
- [x] **Regra dos 6 meses**: tempo mínimo de membresia/frequência antes de servir
      em ministério com menores — calculado a partir da data de admissão ou de
      recebimento da carta, nunca digitado. *(Adventist Risk Management)*
- [x] Cadastro de equipes/ministérios de serviço por congregação, com papéis
      marcados como **"contato com menores"** — é essa marcação que dispara todas
      as exigências reforçadas da v7.7.
- [x] Desligamento de voluntário com motivo e registro — inclusive "remoção da
      escala por perda de confiança" (v7.5), sem virar sanção disciplinar.

  Migração 099 (`sql/migrations/099_habilitacao_voluntarios.sql`) cria
  `VoluntariosHabilitacao` (uma esteira por `MembroId`, reaproveitada entre
  ciclos — mesmo padrão de `CandidatosBatismo`, v086) e
  `VoluntariosDesligamentos`, e reaproveita `EscalasEquipes` (v5.6) com um
  `ALTER` (`ContatoComMenores BIT`) em vez de recriar um cadastro paralelo de
  equipes/ministérios — a marcação fica no nível da equipe (ex: "Ministério
  Infantil"), não por papel individual dentro dela.

  Toda a lógica de decisão é pura em `shared/habilitacaoVoluntarios.js`
  (mesmo formato de `shared/escalas.js`, v5.6): `podeConcluirEtapa` é o
  núcleo da esteira sequencial (recusa carimbar uma etapa se qualquer
  anterior ainda estiver em aberto, e recusa recarimbar uma já concluída);
  `calcularStatusHabilitacao` nunca lê um status digitado — deriva sempre
  de quais etapas estão carimbadas, de `InaptoEm` (marcação explícita,
  terminal) e de `AptoValidoAte` comparado com "agora", mesmo espírito de
  "vencimento calculado na leitura" que a v017 (Cartas de Trânsito) já usa
  (não é job/timer); `atendeRegraSeisMeses` soma 6 meses a
  `MembroReferencia.DataAdmissao` — **nenhuma coluna nova foi criada** pra
  isso, porque `DataAdmissao` já é, desde a v1.1 (migração 015), "a data da
  ÚLTIMA recepção" (batismo OU carta de mudança, zerada a cada
  saída/retorno), exatamente o dado que o pedido descreve; e
  `podeServirComMenores` é o hook de leitura que a v7.7 vai chamar depois
  (recebe a habilitação, a `DataAdmissao` e a flag `ContatoComMenores` da
  equipe, e só exige apto + 6 meses quando a equipe está marcada).

  Duas decisões de projeto documentadas na própria migração por não terem
  definição explícita no pedido: (1) as etapas Antecedentes e Treinamento
  entram na esteira e bloqueiam a sequência como qualquer outra, mas —
  igual à v086 tratou "conclusão do Discipulado" como atestação manual até
  a v6.9 existir — aqui são carimbadas por atestação manual de quem
  administra, até a v7.7 substituir isso por upload de certidão com
  validade real *(v6.9: o Treinamento já pode ser verificado por trilha —
  requisito `HABILITACAO_TREINAMENTO`; Antecedentes segue manual até a
  v7.7)*; (2) "vencido" precisava de uma janela que o pedido não
  define — adotados **24 meses** de validade do "apto" a partir da
  conclusão da esteira, no meio do intervalo de 2 a 3 anos que a própria
  v7.7 cita como padrão internacional pra treinamento de proteção
  (MinistrySafe; Church of England safeguarding).

  `api/GestaoHabilitacaoVoluntarios` (`/api/habilitacao-voluntarios/{acao}`)
  — `equipes-flag` (GET/POST, marca/lista `ContatoComMenores` por equipe),
  `lista`/`detalhe` (esteiras da congregação, sempre com status
  recalculado), `iniciar` (abre ou reaproveita a esteira de um voluntário),
  `concluir-etapa` (valida a sequência antes de gravar), `marcar-inapto`/
  `reabilitar`, `elegibilidade-menores` (o endpoint que expõe
  `podeServirComMenores` pronto pra a v7.7 consumir), `desligamento`/
  `desligamentos` e `minha-habilitacao` (autoatendimento). Permissão
  própria `habilitacao_voluntarios` (não reaproveita `escalas`: quem
  administra a grade nem sempre é quem toca referência/entrevista/
  desligamento) — como toda permissão nova do sistema, não concedida a
  nenhum papel automaticamente. Desligamento (`shared/
  habilitacaoVoluntarios.js::registrarDesligamento`) é registro de RH puro
  — motivo + `TipoMotivo` (incluindo `PERDA_CONFIANCA`), sem nenhuma FK ou
  referência ao processo disciplinar (FASE 3/CEI); quando marcado
  "remover da escala", só desativa a linha em
  `EscalasEquipeMembros` (v5.6), lido mas não reescrito.

  Frontend: módulo "Habilitação de Voluntários" (`app/index.html`/
  `app/script.js`) com a marcação de equipes por congregação, a esteira
  por voluntário (status calculado, próxima etapa em destaque, marcar
  inapto/reabilitar) e o formulário de desligamento. Sub-aba "Minha
  Habilitação" em "Meu Painel" (mesmo padrão de "Minhas Escalas"), só
  leitura — quem preenche cada etapa é o painel administrativo, não o
  próprio voluntário.

  Testado com `npx jest` (305 testes, 32 novos em
  `shared/habilitacaoVoluntarios.test.js`: a esteira inteira sendo
  permitida etapa a etapa na ordem certa, toda tentativa de pular etapa
  recusada com a mensagem certa, recarimbar etapa já concluída recusado,
  status calculado nos 4 casos — pendente/apto/inapto/vencido — incluindo
  inapto prevalecendo sobre esteira completa, validade de 24 meses,
  Regra dos 6 meses no limite exato (inclusive) e sem data de admissão
  nenhuma, `podeServirComMenores` nos casos de equipe sem a marcação/
  pendente/apto sem 6 meses/apto e elegível/vencido/inapto, e validação de
  desligamento) e `node --check` em todos os arquivos novos/alterados.

## v5.8 — Relatório departamental: consolidação e série histórica *(7ª rodada)*

A v5.2/v5.3 monta e aprova o relatório. Falta o que se faz **com ele depois**.

- [x] Consolidação automática por Área/Região/Quadrante/Distrito e Campo — hoje o
      Líder Geral somaria relatório por relatório na mão.
- [x] Série histórica por campo do formulário (o mesmo campo, mês a mês, ano a
      ano) — é isso que permite ver tendência, não só o número do mês.
- [x] Comparativo entre congregações do mesmo porte (alimenta a FASE 12).
- [x] Reabertura de relatório fechado só pelo Presidente/Secretário Geral, com
      justificativa auditada (a v5.3 já prevê a retificação — falta a trilha).

  A v5.5.1 já resolvia Congregação/Área/Campo (`shared/
  consolidadoDepartamental.js::resolverCongregacoesDoNivel`) — faltava
  literalmente Região e Quadrante/Distrito, que existem no schema desde a
  migração 004 como hierarquia de vínculo pai (Areas→RegiaoId,
  Regioes→QuadranteId, Quadrantes→DistritoId), não como colunas soltas em
  `Congregacoes`. `resolverCongregacoesDoNivel` ganhou os 3 subselects que
  descem essa cadeia — literalmente os mesmos já usados em `shared/
  escopo.js::QUERY_POR_TIPO` pra resolver escopo de sessão, só devolvendo
  `CongregacaoId` em vez de `Nome` (agregação é por id). Nenhuma migração
  nova: a hierarquia territorial já existia inteira, só não tinha os 3
  últimos níveis plugados no consolidado. `GestaoConsolidadoDepartamental`
  aceita `nivel=regiao|quadrante|distrito` sem gate extra — o mesmo laço de
  conferência de escopo que já existia pra `area` (cada congregação
  resolvida precisa estar dentro do que o usuário enxerga) cobre os 3 níveis
  novos de graça; só `nivel=campo` continua restrito a quem enxerga
  `TODAS` (GLOBAL).

  Série histórica por campo é **diferente** de `historicoConsolidado`
  (v5.5.1, que soma totais agregados mês a mês): `serieHistoricaCampo`
  segue UM `NomeCampo` de UM departamento através dos meses, somando
  `ValoresCampoRelatorioDepartamental.Valor` sem filtrar `NumeroDomingo` — a
  mesma query cobre campo mensal (uma linha só) e campo semanal da EBD
  (soma das linhas por domingo), sem duplicar lógica de soma semanal que já
  existe em `rd.somarValoresSemanais`. Exige `departamentoId` porque
  `NomeCampo` não é chave global (`ofertas`/`outros`/`casasVisitadas` se
  repetem em vários schemas com sentido próprio em cada um — juntar sem o
  departamento junto somaria coisas diferentes). "Ano a ano" (mesmo mês em
  anos diferentes) é só um recorte da mesma série
  (`filtrarMesmoMesCalendario`), não uma segunda query. Rota:
  `GET /api/consolidado-departamentos?...&campo=nomeCampo&departamentoId=&historicoCampo=N`.

  Comparativo por porte: "porte" não existia como cadastro em lugar nenhum
  do sistema (nenhuma planilha do protótipo definia faixa) — em vez de abrir
  uma tela de classificação manual sem lastro normativo nenhum, `porte` é
  **derivado ao vivo** da contagem de membros ativos
  (`MembroReferencia.Status = 'ATIVO'`, a mesma fonte que os 4 departamentos
  de faixa etária já usam desde a v5.5) via `classificarPorte`. Limiares
  (PEQUENA < 100, MEDIA < 300, GRANDE ≥ 300) são **julgamento documentado**,
  sem referência normativa pra faixa "certa" — redondos e ajustáveis em
  `LIMITES_PORTE` sem migração, se a Diretoria calibrar diferente depois.
  `compararPorPorte` cruza contagem de membros + totais do mês (todos os 8
  departamentos somados) por congregação do escopo pedido,
  `agruparPorPorte` (função pura, testável sem banco) agrupa em
  PEQUENA/MEDIA/GRANDE com a média de cada campo dentro do grupo — a régua
  de comparação que a v12.2 (Benchmarking) vai consumir depois; a v5.8 monta
  o dado agrupado, a v12.2 decide como expor isso ao Dirigente (percentil,
  não ranking nominal — julgamento que já está escrito na v12.2 e que a
  v5.8 não antecipa). Rota: `...&porte=1` devolve `porPorte` no mesmo
  payload do consolidado.

  Reabertura (`REABRIR`, `shared/relatoriosDepartamentais.js`) é uma ação
  nova no MESMO motor de estados da v5.3 (`NIVEIS_POR_ACAO`/
  `TRANSICOES_POR_ACAO`), não um mecanismo paralelo — e é **diferente** de
  Retificar, que continua exatamente como estava: Retificar corrige o valor
  SEM reabrir o fluxo (o relatório permanece `RETIFICADO`, usado quando o
  ajuste já é definitivo); Reabrir devolve o relatório de `APROVADO_GERAL`/
  `RETIFICADO` pra `ENVIADO`, reentrando no funil de aprovação inteiro
  (Área → Geral) do zero — usado quando o relatório precisa ser reexaminado
  de verdade. Só `GLOBAL` autoriza (mesmo vocabulário do resto do sistema
  pra "Presidente/Secretário Geral" — `auth.js::exigirNivelGlobal`,
  `GestaoTesourariaDepartamental`, `GestaoEscalas`), e é a única ação do
  fluxo com **justificativa obrigatória**
  (`justificativaValida` — mesmo padrão sem mínimo de tamanho arbitrário de
  `habilitacaoVoluntarios.js::validarDesligamento`); as demais ações
  continuam com comentário opcional. A "trilha" que faltava não é uma
  tabela nova: reaproveita `AprovacoesRelatorioDepartamental` (v5.3, já lida
  como "trilha" no detalhe do relatório) — a justificativa vira o
  `comentario` daquela ação — E entra explícita em `dadosDepois` do
  `AuditLog` (`shared/auditoria.js::registrarAuditoria`, cadeia com hash
  desde a v4.12), como campo próprio em vez de escondida dentro de um texto
  livre. Reabrir também zera `ValorParaGeral`/`ValorParaLocal` (congelados
  desde a v5.4) — o relatório volta a ser prévia ao vivo até passar de novo
  por Aprovar Geral/Retificar, que recongela com o perfil de rateio vigente
  na nova aprovação.

  `api/GestaoConsolidadoDepartamental` (mesma rota da v5.5.1, `GET
  /api/consolidado-departamentos`) ganhou os parâmetros `campo`/
  `departamentoId`/`historicoCampo` e `porte`; `api/
  GestaoRelatoriosDepartamentais` ganhou a ação `reabrir` em `POST
  /api/relatorios-departamentais/{id}/reabrir` (corpo `{justificativa}`).
  Frontend: a aba "Consolidado de Campo" ganhou os níveis Região/Quadrante/
  Distrito no mesmo seletor, mais dois blocos novos ("Série histórica por
  campo" e "Comparativo por porte"); a tela do relatório departamental
  ganhou o botão "↩️ Reabrir relatório" ao lado de "🔓 Retificar", com
  `prompt()` pra justificativa (recusa client-side se vazia, backend recusa
  de novo — defesa em profundidade, mesmo padrão do resto do sistema).

  Testado com `npx jest` (327 testes, 22 novos: `resolverCongregacoesDoNivel`
  pros 3 níveis territoriais novos, `classificarPorte` nos limiares exatos e
  em valor ausente/inválido, `agruparPorPorte` com médias corretas por
  grupo e lista vazia, `compararPorPorte` cruzando totais+membros e o caso
  de congregação sem nenhum membro ativo cadastrado, `serieHistoricaCampo`
  em ordem cronológica e validação de parâmetros obrigatórios,
  `filtrarMesmoMesCalendario` recortando só o mês pedido através dos anos,
  a máquina de estados de `REABRIR` nas transições permitidas/recusadas, e
  `justificativaValida` nos casos vazio/espaço/texto válido) e `node
  --check` em todos os arquivos novos/alterados.

## v5.9 — Assistência Social (Ação da Fé) *(gap da varredura normativa)*

O Regimento condiciona a ação social a cadastro e triagem técnica — e isso não
tinha nenhuma versão. É também o módulo com o dado mais sensível do sistema
inteiro (situação socioeconômica de família assistida).

- [x] **Cadastro socioeconômico do beneficiário** — o Art. 46 exige que os
      programas assistenciais aconteçam *"sempre mediante cadastro
      socioeconômico"*. Dado sensível: acesso restrito por papel, base legal
      registrada (vB.8) e retenção própria.
- [x] **Triagem e parecer técnico por Assistente Social credenciado** (Art. 52,
      VII) — o parecer é do profissional, registrado e assinado, não uma decisão
      informal de quem está no balcão.
- [x] Registro de entregas/benefícios concedidos (cesta, auxílio, medicamento),
      com histórico por família e controle de recorrência.
- [x] Isenção de taxa de cessão de templo quando o uso é ação social
      (Art. 156 §3º, III) — conecta com a v4.18/v4.21.
- [x] Prestação de contas do programa social, separada do caixa comum — insumo
      direto pra eventual CEBAS/parceria pública (v9.6).

  `AssistenciaSocialFamilias` + `AssistenciaSocialCadastros` +
  `AssistenciaSocialProfissionais` + `AssistenciaSocialPareceres` +
  `AssistenciaSocialEntregas` (migração 100) + `shared/assistenciaSocial.js` +
  `GestaoAssistenciaSocial` (rota `assistencia-social/{acao?}`), atrás de
  uma permissão própria `assistencia_social` — nunca concedida por padrão a
  papel nenhum, mesmo achado repetido desde a v5.2/v5.4/v5.7.

  **"Família" não existia como conceito no sistema** — `VinculosFamiliares`
  (v2.6) é um grafo de parentesco entre MEMBROS, e o público típico da ação
  social não é membro. Em vez de forçar cadastro de membresia só pra
  registrar um beneficiário, nasceu uma unidade mínima nova
  (`AssistenciaSocialFamilias`: responsável, CPF, contato, endereço, com
  `MembroId` opcional) — julgamento documentado na própria migração, não
  herdado de nenhuma tabela existente.

  **LGPD (vB.8) integrado de verdade, não decorativo**: como o titular
  tipicamente não tem vínculo de membresia, o Art. 11, II, "a" (que cobre
  `MembroReferencia`) não se aplica — a base legal correta, registrada na
  própria linha do cadastro (mesmo vocabulário de `ConsentimentosLGPD` desde
  a migração 012: CONSENTIMENTO/OBRIGACAO_LEGAL/LEGITIMO_INTERESSE/
  EXECUCAO_ESTATUTO), é o Art. 7º, I — por isso `ConsentimentoObtidoEm` é
  `NOT NULL`: sem consentimento, o cadastro não nasce. Retenção própria
  cadastrada em `PoliticasRetencao` ("Cadastro Socioeconômico (Assistência
  Social)", 1.825 dias — mesmo horizonte da prestação de contas do Art. 36),
  separada da retenção de ex-membro (vB.8/migração 084, outro titular, outro
  prazo).

  **Parecer nunca é decisão informal de balcão**: `AssistenciaSocialProfissionais`
  credencia o Assistente Social pelo registro no CRESS (restrito a nível
  Global, Diretoria); `podeAssinarParecer` é o portão único que
  `GestaoAssistenciaSocial` chama antes de gravar qualquer parecer —
  recusa se o `membroId` informado não tiver linha ativa na tabela de
  credenciamento, e o parecer fica preso ao `ProfissionalId` (nunca a um
  usuário genérico).

  **Recorrência calculada na leitura, nunca digitada** — mesmo espírito de
  "status sempre derivado" já usado nas Cartas de Trânsito (v017) e na
  esteira de habilitação (v5.7): `avaliarRecorrenciaFamilia` conta meses
  consecutivos com entrega do mesmo tipo de benefício e sinaliza (padrão: 3
  meses seguidos) sem bloquear nada — decisão de acompanhar o caso continua
  sendo humana.

  **Isenção de cessão de templo (Art. 156 §3º, III)** reaproveita a MESMA
  flag `IsencaoTaxa` que a v4.18 já tinha (migração 068) — não nasceu tabela
  paralela. `CessoesTemplo` ganhou por `ALTER` `FinalidadeAcaoSocial`,
  `MotivoIsencaoSocial` e `AssistenciaSocialFamiliaId` (migração 100);
  `validarIsencaoSocial` (chamada em `GestaoCessoesTemplo`) recusa marcar
  finalidade de ação social sem isenção marcada, e recusa a isenção social
  sem motivo escrito — nunca isenta "de graça".

  **Prestação de contas separada do caixa comum** não fabricou um segundo
  livro-caixa: a v5.4 (migração 095) já isolava a tesouraria por
  departamento do caixa geral, e "Ação da Fé" já é um dos 8 departamentos
  com essa tesouraria própria. `relatorioPrestacaoContas` só agrega
  `TesourariasDepartamento`/`DespesasTesourariaDepartamento` (filtradas por
  `Departamentos.Sigla = 'ACAO_DA_FE'`) com `AssistenciaSocialEntregas` do
  mês — dado já formatado pra uma futura v9.6 (CEBAS) consumir, sem
  construir o módulo em si.

  Auditoria de tudo via `registrarAuditoria` (mesmo padrão de v5.7/vB.8):
  cadastro aberto/encerrado, credenciamento/descredenciamento de
  profissional, parecer registrado, entrega registrada. Front-end: painel
  "Assistência Social" (módulo próprio na sidebar, `app/index.html` +
  `app/script.js`) só aparece pra quem tem a permissão `assistencia_social`
  — mesmo mecanismo client-side de todo o resto do sistema (o array
  `authPermissoes` vem assinado do backend no login; o servidor recusa de
  novo se a rota for chamada direto sem a permissão).

  Testado com `npx jest` (351 testes, 24 novos:
  `mesesConsecutivosComEntrega`/`avaliarRecorrenciaFamilia` com streak
  contínuo, streak quebrado por mês faltando, tipos de benefício
  independentes e limite customizado; `podeAssinarParecer` recusando
  profissional inexistente/inativo e aceitando ativo; `validarParecer`,
  `validarCadastroSocioeconomico` (consentimento ausente, núcleo inválido,
  base legal fora do catálogo), `validarIsencaoSocial` nos 4 cenários do
  Art. 156 §3º III, e `validarEntrega`) e `node --check` em todos os
  arquivos novos/alterados.

## 🔒 Trava de Revisão 5-B — antes de encerrar a FASE 5 e avançar para a FASE 6

- [x] Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da
      seção 3). Auditadas v5.6 a v5.9 pelas 5 perguntas do checklist
      (19/09), com varredura final na FASE 5 inteira antes de fechar.

  **1. Todo código novo roda de ponta a ponta contra o ambiente real?**
  Sim — `npx jest` (351 testes, suíte inteira) e `node --check` em todo
  `.js` de `api/`/`app/` sem erro. Migrações 098-100 idempotentes e
  confirmadas rodando contra o Azure SQL de produção (`gh run view --log`
  do run que fechou v5.9). Zero `timerTrigger` em todo `api/`. Toda rota
  nova (`escalas`, `habilitacao-voluntarios`, `assistencia-social`, e as
  extensões de `relatorios-departamentais`/`consolidado-departamentos`)
  conferida entre `function.json` e `app/script.js` — nenhuma divergência.

  **2. Toda tela nova abre e mostra dado de verdade?** Checagem sistemática
  de `getElementById` (933 chamadas) contra todo `id` existente (1183) —
  mesmos 2 falsos positivos já conhecidos (`caixaSino`,
  `permissaoEscopoTodas`, fora do escopo da FASE 5), **nenhum bug novo**.

  **3. README e código continuam narrando a mesma coisa?** Auditoria
  cruzada de v5.6 a v5.9: todas as tabelas das migrações 098-100 batem
  campo a campo; `temConflitoEntreEquipes` (v5.6) só considera
  CONVIDADO/ACEITO/CONFIRMADO como conflito; `atendeRegraSeisMeses` (v5.7)
  usa `MembroReferencia.DataAdmissao` sem coluna nova, validade de 24
  meses confirmada; `REABRIR` (v5.8) é ação distinta de `RETIFICAR` na
  máquina de estados e zera `ValorParaGeral`/`ValorParaLocal`;
  `ConsentimentoObtidoEm NOT NULL` (v5.9) confirmado na migração 100, e
  `podeAssinarParecer` recusa profissional sem credenciamento ativo.
  Nenhuma das 3 permissões novas (`escalas`, `habilitacao_voluntarios`,
  `assistencia_social`) tem migração de concessão automática — como o
  texto promete. Referências cruzadas conferidas (`vB.2`, `vB.5`, `v5.3`,
  `v5.4`, `v5.5.1`, `v7.5`, `v7.7`, `v9.6`, `v12.2`, migração 004) apontam
  pra seções/migrações reais.

  **4. O que ficou pra trás foi de fato corrigido, não só anotado?** Nenhum
  `TODO`/`FIXME`/gambiarra novo no diff de v5.6-v5.9. **Varredura final da
  FASE 5 inteira** (pedida explicitamente pelo texto desta trava):
  confirmada a integração v5.4↔FASE 4/FASE B ainda de pé depois de 4
  versões por cima dela — `shared/tesouraria.js::saldoCentroCusto` continua
  somando Centro de Custo `DEPTO_*` a partir de
  `RelatoriosDepartamentais.ValorParaLocal`, `GestaoSaidas` continua
  chamando `podeOperarCentroCusto` em toda leitura/escrita, e a migração
  096 (permissão `tesouraria_departamental`) continua concedida a
  Presidente/Secretário Geral em produção — nada quebrou silenciosamente.

  **5. Deploy real, de ponta a ponta, aconteceu?** Sim — `gh run list`
  confirma `success` nos 4 commits de v5.6 a v5.9 (`f996283`, `3092f2c`,
  `8313732`, `a2e8ff2`), nenhuma repetição do problema de CI da v5.3.
  Testado ao vivo agora: `https://app.ieadespa.org.br/` no ar (200);
  `/api/escalas`, `/api/habilitacao-voluntarios` e
  `/api/assistencia-social` devolvem `401` sem sessão.

  **FASE 5 encerrada.** v5.1 a v5.9 (+v5.5.1) entregues, auditadas em 2
  travas (5-A e 5-B), com deploy real confirmado em cada uma. Avança pra
  FASE 6.
