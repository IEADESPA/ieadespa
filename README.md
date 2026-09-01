# Sistema de Governança IEADESPA (Sistema Integrado Único)

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
- [ ] Catálogos configuráveis com CRUD + auditoria (Campos, Áreas, Níveis, Congregações,
      Departamentos, órgãos, papéis, situações, cargos ministeriais, prazos).
      — ✅ feitos via `GestaoCatalogos`: Congregações, Departamentos, Situações, Papéis,
      Funcionalidades, Áreas, Regiões, Quadrantes, Distritos, Extensões, Tipos de Proposta
      (Consagrações), Órgãos Locais. Faltam: **Cargos Ministeriais** e **Prazos** (ainda sem
      catálogo/CRUD). ✅ `GestaoCatalogos` e `GetOrgaos` agora gravam em `AuditLog` (criação,
      atualização e exclusão, com dados de antes/depois) — cobre automaticamente qualquer
      catálogo novo adicionado ao mapa `CATALOGOS` no futuro.
- [ ] Hierarquia de 6 níveis no banco (`Areas`, `Regioes`, `Quadrantes`, `Distritos`,
      `ExtensoesTenda`, `VinculoCongregacaoArea`, `OrgaosLocais`).
      — ✅ tabelas existem com o vínculo pai-filho completo (migração 004) e já são usadas de
      verdade no escopo de acesso (`shared/escopo.js`). ✅ `OrgaosLocais` (JAI/JEA/CRA/TER/CEQ/
      Distrito) agora tem CRUD via `GestaoCatalogos` (aba Estrutura) e seed automático da JAI
      de cada congregação (migração 007 — único nível com ativação "base"). JEA/CRA/TER/CEQ/
      Distrito continuam sem seed automático: dependem de regra de contagem (≥3 congregações,
      ≥3 áreas etc., FASE 9) ainda não implementada — cadastro manual disponível enquanto isso.
- [x] ✅ Permissões estruturadas (papel × funcionalidade × escopo campo/área/congregação).
      Feito para Global/Distrito/Quadrante/Região/Área/Congregação; falta só Extensão da
      Tenda (o cadastro de pessoas ainda não tem vínculo direto com `ExtensoesTenda`).
- [x] ✅ Documentos de Governança (Estatuto 2026 + Regimento Interno 2026) publicados em
      `app/documentos/` e acessíveis a qualquer usuário logado pela aba **Documentos**.

#### v0.2 — Perfil do membro (base da identidade)

- [ ] `MembroReferencia` completo: matrícula importada, SituacaoMembro, DepartamentoId,
      CargoMinisterial, dados de contato (LGPD).
- [ ] Categorias de membresia calculadas (4 categorias do Art. 7º).
- [ ] Elegibilidade calculada (votar / ser votado) + badge na lista de pessoas.
- [ ] Processo disciplinar com término automático (dias de sanção).
- [ ] Vínculo familiar (cônjuge, filhos) — base para vedação de nepotismo.

#### v0.3 — Auditoria e trilha de dados

- [ ] `AuditLog` em toda alteração (quem mudou o quê e quando, dados antes/depois).
- [ ] Consentimento LGPD + retenção + direito de acesso/exclusão do titular.
- [ ] Encarregado de Dados (papel no sistema).

### FASE 1 — Membresia (ciclo de vida do membro)

#### v1.1 — Admissão de membros (Art. 6º)

- [ ] Registro de admissão por: batismo, carta de mudança, reconciliação, aclamação.
- [ ] Campos: data de admissão/batismo, forma de admissão, origem (igreja anterior).
- [ ] Rito público de recebimento (leitura do nome, apresentação à igreja).

#### v1.2 — Período de Integração (90 dias)

- [ ] Marcação automática do início do Período de Integração (90 dias, Art. 6º §2º).
- [ ] Restrições automáticas durante a integração: sem votar/ser votado, sem cargo.
- [ ] Alerta de fim de integração (transição automática para Membro em Comunhão).

#### v1.3 — Categorias e elegibilidade (Art. 7º e 23)

- [ ] Cálculo automático das 4 categorias (Congregado / Comunhão / Ativa / Elegível).
- [ ] Elegibilidade ativa (votar): ≥18 + 90 dias + livre de disciplina.
- [ ] Elegibilidade passiva (ser votado): +1 ano + dizimista (Diretoria/CF); ≥18 (Lideranças/CEI); ≥16 (local).
- [ ] Atualização cadastral pela Secretaria (sem novo ato de admissão).

#### v1.4 — Trânsito eclesiástico e cartas (Regimento Art. 131)

- [ ] Carta de Recomendação (validade 30 dias, prorrogação por visto).
- [ ] Carta de Mudança (transferência) + recebimento de carta de outra igreja.
- [ ] Atestado de Trânsito Supletivo (emitido pelo CEI em caso de recusa).
- [ ] Competência de emissão: Dirigente + Secretário Local (vedada à Mesa Diretora).

#### v1.5 — Perda de membresia (Art. 11)

- [ ] Registro de causas: falecimento, desligamento, carta de mudança, exclusão.
- [ ] Abandono Eclesiástico Material (90 dias sem comunhão) e Digital (90 dias incomunicável).
- [ ] Procedimento sumário de constatação: notificação, edital, prazo 15 dias, homologação CLI.
- [ ] Recurso à Assembleia (30 dias, sem efeito suspensivo).
- [ ] Vacância automática de cargos/funções/assentos ao perder a membresia.

#### v1.6 — Situação e status do membro

- [ ] Transição de situação (EM_COMUNHAO / SEM_COMUNHAO / CONGREGADO) + status
      administrativo (ATIVO/LICENÇA/INATIVO/DESLIGADO/FALECIDO).
- [ ] Suspensão de direitos durante disciplina (voto/ser votado/cargos).
- [ ] Histórico completo do membro (linha do tempo de situações).

#### v1.7 — Cadastro ampliado (dados sensíveis/LGPD)

- [ ] Dados pessoais: contato, endereço, estado civil, profissão, foto (opcional).
- [ ] Dados de menores (12–17 anos) com responsável legal.
- [ ] Dados de saúde (PSC) com sigilo reforçado.
- [ ] Vínculos: departamento(s), congregação, cargo ministerial, função.

#### v1.8 — Importação e exportação

- [ ] Importação de planilha Excel (matrícula + nome + situação + dados básicos).
- [ ] Function `ImportarPessoas` (rota pessoas/importar).
- [ ] Exportação de rol de membros (filtros por congregação/área/situação/categoria).
### FASE 2 — Governança (órgãos e deliberações)

#### v2.1 — Assembleia Geral (sessão e quórum)

- [ ] ✅ Motor de sessão + quórum de instalação em 2 estágios (Art. 21).
- [ ] Classificação AGO (dezembro) / AGE (a qualquer tempo) (Art. 17).
- [ ] Lista de votantes calculada (capacidade ativa — Art. 23 §1º).
- [ ] Registro de presença (check-in por matrícula) + acesso restrito (Art. 22).
- [ ] Convocação por Edital com prazos (10/5/15 dias — Art. 20).
- [ ] Convocação independente da Presidência (1/5 dos membros, CLI, CF ou CEI).

#### v2.2 — Assembleia Geral (pautas especiais)

- [ ] Quórum de reforma estatutária/destituição (Art. 21 II: 1/3 em 2ª convocação + reconvocação).
- [ ] Competências privativas (Art. 18): eleger, destituir, reformar, aprovar contas,
      autorizar alienação, homologar Pastor Presidente, ratificar CLI.
- [ ] Regime de Ratificação Posterior (Art. 19) + dissenso formalizado (1/5).
- [ ] Controle de acesso: vedado a estranhos, suspensos e em transferência (Reg. Art. 142).

#### v2.3 — CLI (composição e sessões)

- [ ] Composição mista (Art. 15): ordenação (Pastores, Evangelistas, Presbíteros) +
      função (Diretoria, CF, CEI, Dirigentes).
- [ ] Assentos da CLI (cadeira cativa + por função).
- [ ] Sessão mensal (último domingo) com quórum 2 estágios (Art. 24).
- [ ] Deliberações por maioria simples + impedimento de voto (Art. 25).
- [ ] Voto de Minerva + poder de veto presidencial.
- [ ] Sigilo corporativo (Art. 26) + comunicado administrativo pós-sessão.
- [ ] Comparecimento obrigatório: 3 faltas = exclusão automática (Art. 27).
- [ ] Verificação de perda de assento por faltas.

#### v2.4 — CLI (comissões e planejamento)

- [ ] Comissões Permanentes: CCJ + comissões temáticas (Regimento).
- [ ] Parecer das comissões em 15 dias (regime de urgência 2/3).
- [ ] Planejamento estratégico PDQ (aprovação, remanejamento 20%, cláusula de barreira).

#### v2.5 — Diretoria Executiva

- [ ] Composição (Art. 29): Presidente, 4 Vice-Presidentes, 3 Secretários, 2 Tesoureiros.
- [ ] Mandato 2 anos (Art. 30): eleição na AGO de dezembro, posse 1º/jan.
- [ ] Assinatura conjunta (Art. 31): financeiro (Presidente + 1º Tesoureiro) e
      administrativo (Presidente + 1º Secretário).
- [ ] Vacância/sucessão presidencial (Art. 32): 1º→4º Vice, depois CEI.
- [ ] Atribuições do Presidente (Art. 33), Secretários (Art. 35), Tesoureiros (Art. 36).
- [ ] Livre nomeação/exoneração de cargos não eletivos (Art. 37).

#### v2.6 — Conselho Fiscal

- [ ] Assentos: 3 titulares + 3 suplentes, mandato = Diretoria (Art. 43).
- [ ] Sessão mensal (3º domingo) reaproveitando o motor de sessão (Art. 46).
- [ ] Vedação de nepotismo na eleição (Art. 43 §3º) — usar vínculo familiar.
- [ ] Medidas cautelares de proteção patrimonial (Art. 45).
- [ ] Fiscalização contábil (Reg. Art. 145): balancetes, talões, parecer mensal, ata própria.

#### v2.7 — Órgãos de Apoio, Departamentos e Congregações

- [ ] Dirigente de Congregação como Assento tipo FUNCAO ligado à CLI.
- [ ] Catálogo de Departamentos Gerais e Secretarias Adjuntas (Art. 47).
- [ ] Pastores de Área e Áreas Estratégicas (Art. 48).
- [ ] Termo de Compromisso de Gestão do Dirigente (Art. 57).
- [ ] Autonomia de arrecadação/gasto dos departamentos (Art. 49).

#### v2.8 — Votação e Eleições

- [ ] Modelo de dados: `Pautas` (SessaoId, Descricao, Tipo) + `Votos` (PautaId, MembroId, Escolha).
- [ ] Apuração com quórum de aprovação (maioria simples / supermaiorias).
- [ ] Fluxo de candidatura usando `elegivelDiretoriaConselhoFiscal` / `elegivelCEIouDepartamentos`.
- [ ] Eleição completa de Diretoria Executiva e Conselho Fiscal.
- [ ] Pautas de reforma estatutária / destituição com rito de 3 estágios.

#### v2.9 — Documentos, Atas e Registro

- [ ] Function de Documentos (registrar referência/URL de blob, tipo, órgão).
- [ ] Geração de Ata (PDF) a partir de uma Sessão encerrada.
- [ ] Alerta de prazo de registro em cartório (Art. 75: 30 dias ata, 45 dias protocolo).
- [ ] Registro do Regimento no RTD (Art. 161) para conservação.

### FASE 3 — Disciplina e Ética

#### v3.1 — CEI (Corte Suprema Eclesiástica)

- [ ] Composição: 7 titulares + 2 suplentes (Reg. Art. 88).
- [ ] Requisitos: Oficial Superior (Evangelista/Pastor) ou Presbítero 5+ anos + formação
      teológica AFM ou Direito + reputação ilibada (10 anos).
- [ ] Indicação pelo Pastor Presidente + sabatina/homologação pela CLI (Art. 89).
- [ ] Mandato 2 anos + destituição só por 2/3 da CLI (estabilidade).
- [ ] Incompatibilidade: vedado acúmulo com Mesa Diretora/Vice de Quadrante/Superintendente (Art. 90).
- [ ] Impedimento/suspeição: parente (3º grau), mesma congregação, inimizade/amizade íntima (Art. 91).
- [ ] Segredo de Justiça Eclesiástica (Art. 92): rito fechado, sem gravação.

#### v3.2 — Processo disciplinar (abertura, citação, defesa)

- [ ] Abertura de processo (denúncia, partes, relator).
- [ ] Citação por WhatsApp (riscos azuis) ou Carta Registrada/testemunhas (Reg. Art. 101).
- [ ] Prazo de defesa prévia: 5 dias corridos + até 3 testemunhas.
- [ ] Revelia: julgamento à revelia com presunção dos fatos (se houver prova mínima).
- [ ] Defensor eclesiástico ou advogado constituído (Art. 102).
- [ ] Esteira: EM_ANDAMENTO → AFASTAMENTO_CAUTELAR → JULGADO.

#### v3.3 — Código Penal Eclesiástico (infrações)

- [ ] Graduação de infrações: leves, médias, graves e gravíssimas.
- [ ] Catálogo de infrações do Regimento (conduta, doutrina, financeiro, sigilo, rebelião).
- [ ] Infrações de intervenção (Reg. Art. 144): gatos de energia/água, atraso de repasse,
      despesas pessoais, ausência de notas fiscais.

#### v3.4 — Julgamento e sanções

- [ ] Julgamento pelo CEI (jurisdição dupla para ministros: CEI + CIADSETA).
- [ ] Sanções: advertência, afastamento, suspensão de comunhão, exclusão (Ultima Ratio).
- [ ] Suspensão automática de voto/ser votado/cargos durante sanção.
- [ ] Término automático da sanção (dias) → retorno à comunhão.
- [ ] Sigilo do processo + permissão `cei`.

#### v3.5 — Reabilitação e retorno (Art. 77 Regimento)

- [ ] Carência administrativa após o fim da pena.
- [ ] Prova de Reintegração Ética pela AFM (aprovação reativa credencial).
- [ ] Histórico disciplinar no perfil do membro.
### FASE 4 — Financeiro e Patrimônio

#### v4.1 — Tesouraria e Caixa Único

- [ ] Caixa único da igreja (conta bancária única) com saldo virtual por órgão/departamento
      (Reg. Art. 133-C).
- [ ] Lançamentos de entrada/saída com categoria e comprovante.
- [ ] Conciliação bancária mensal.

#### v4.2 — Ofertas, dízimos e arrecadação

- [ ] Registro de mapas de dízimos/ofertas por congregação (2º Tesoureiro — Art. 36 §2º).
- [ ] Controle de recebimento/conferência/auditoria dos relatórios financeiros.
- [ ] Recibos e numeração sequencial de talões.

#### v4.3 — Orçamento anual e PDQ

- [ ] Orçamento Anual e Balanço Patrimonial consolidado (1º Tesoureiro — Art. 36 §1º).
- [ ] Planejamento estratégico PDQ com metas e 3 eixos.
- [ ] Remanejamento de até 20% + cláusula de barreira (CLI).

#### v4.4 — Prebenda e sustento pastoral

- [ ] Prebenda (natureza alimentar, sem vínculo CLT) — Reg. Art. 134.
- [ ] Retenções tributárias/previdenciárias obrigatórias.
- [ ] Vedação à "pejotização" do ministério.

#### v4.5 — Patrimônio e alçadas

- [ ] Inventário físico anual de bens (dezembro) — Reg. Art. 63.
- [ ] Teto de Alçada Patrimonial (acima → Assembleia; abaixo → CLI).
- [ ] Blindagem patrimonial: assinatura conjunta, quarentena de 12 meses.
- [ ] Registro de escrituras, títulos, alvarás, veículos, contratos (2º/3º Secretários).

#### v4.6 — NIF e Compliance

- [ ] NIF (Núcleo de Inteligência Financeira) — análise de risco e alertas.
- [ ] Compliance de compras (3 cotações, fornecedores) e transparência ativa.
- [ ] Vedação de despesas sem nota fiscal.

#### v4.7 — Auditoria e prestação de contas

- [ ] Auditoria em 3 níveis (interna, NIF, externa).
- [ ] Parecer mensal do Conselho Fiscal (aprova/rejeita contas).
- [ ] Bloqueio de repasses por falta de prestação de contas.

#### v4.8 — Repasses e dízimo institucional

- [ ] Repasses obrigatórios de congregações/departamentos para a Matriz.
- [ ] Dízimo institucional de 10% (Distrito) para a Sede Geral.
- [ ] Alerta de atraso de repasse (infração de intervenção).

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

### FASE 8 — Ministerial (AFM)

#### v8.1 — AFM (Academia de Formação Ministerial)

- [ ] Cadastro de Reitor + Corpo Docente.
- [ ] Matrícula obrigatória de oficiais (Auxiliares→Pastores/Missionários).
- [ ] Matrícula Ativa × Inativa (desmatriculado perde licença de oficiar).
- [ ] Níveis de escolaridade: Básico, Médio, Avançado, Bacharel Livre.

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

#### v9.3 — Distrito e macroexpansão

- [ ] Ativação de Distrito (nível 5) com autonomia financeira + dízimo institucional 10%.
- [ ] Blindagem contra desvinculação (intervenção imediata).

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