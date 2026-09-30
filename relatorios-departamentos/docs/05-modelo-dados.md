# 05. Modelo de Dados Conceitual

> Modelo preliminar, em nível de entidades e relacionamentos — não é ainda um schema
> físico de banco de dados.

## Entidades principais

- **Campo** — id, nome
- **Area** — id, nome, campo_id, (futuro: `regiao_id`, opcional/nulo por enquanto)
- **Congregacao** — id, nome, endereço
- **VinculoCongregacaoArea** — id, congregacao_id, area_id, **data_inicio**, data_fim
  (nulo = vigente). Existe para preservar o histórico quando uma congregação muda de
  área: um relatório antigo continua "pertencendo" à área que valia na época do envio.
- **Departamento** (instância na congregação) — id, congregacao_id, tipo_departamento_id
  — **toda congregação tem uma instância de cada um dos 8 tipos**, sempre.
- **TipoDepartamento** (catálogo, hoje fixo em 8) — id, nome, sigla (ex. "UCADESPA"),
  numero (01–08), rotulo_papel_local (ex.: "Líder Local" ou "Superintendente Local" no
  caso do EBD)
- **SchemaRelatorio** (por TipoDepartamento, versionado) — define os campos do
  formulário daquele departamento e o perfil de rateio vigente
- **CampoFormulario** — id, schema_relatorio_id, nome_campo, tipo_dado (inteiro, moeda,
  percentual…), grupo (`contagem` | `acoes` | `eventos` | `integracao` | `financeiro`),
  **comportamento** (`estado` — pré-preenche com o valor do último relatório enviado —
  ou `fluxo` — sempre começa zerado), obrigatório (sim/não), ordem de exibição
  - Os grupos **`eventos`** e **`integracao`** usam sempre o mesmo conjunto fixo de
    campos (Local/Área/Geral; Conversão/Reconciliação/De Outra Igreja) — na prática,
    podem ser modelados como uma estrutura compartilhada referenciada por todo
    SchemaRelatorio, em vez de recriada por tipo.
- **PerfilRateio** (por SchemaRelatorio) — id, tipo (`integral_geral` |
  `integral_local` | `mensalidade_fixa` | `percentual` | `variavel_manual`),
  valor/percentual, **modo_entrada** (`bruto_calculado` — o sistema calcula a divisão
  a partir do valor bruto informado — ou `liquido_manual` — quem preenche já informa o
  valor líquido pós-rateio, sem o sistema recalcular; confirmado que alguns
  departamentos com rateio percentual, ex. FAMÍLIA, preenchem assim para simplificar),
  suporte_secretaria_geral_habilitado (booleano, **facultativo por departamento** —
  confirmado que a maioria não usa), valor_suporte_secretaria_geral (quando habilitado)
- **RelatorioMensal** — id, departamento_id, mes_referencia, ano_referencia,
  usuario_criacao_id, status (`rascunho` | `enviado` | `aprovado_area` |
  `aprovado_geral` | `retificado`), data_envio, schema_relatorio_id (versão usada),
  flag `atrasado`
- **ValorCampoRelatorio** — id, relatorio_mensal_id, campo_formulario_id, valor
- **ContribuinteMensalidade** — id, relatorio_mensal_id, nome, valor — lista nominal de
  quem contribuiu com mensalidade naquele mês (alimenta o total de Mensalidades)
- **HistoricoEdicao** (log de auditoria, obrigatório) — id, relatorio_mensal_id,
  usuario_id, campo_alterado, valor_anterior, valor_novo, timestamp, papel_no_momento
  (ex.: "Líder Geral corrigindo")
- **TesourariaDepartamento** — id, tipo_departamento_id, mes_referencia, ano_referencia,
  saldo_transportado, movimentacao_geral_mes, investido_local, entrada_geral,
  suporte_secretaria_geral, saldo_mes — o "livro-caixa" central do departamento,
  alimentado pela soma dos RelatorioMensal daquele mês + lançamentos manuais de despesa
- **DespesaTesouraria** — id, tesouraria_departamento_id, descricao, valor
- **Usuario** — id, nome, **matricula** (nº do rol de membros — usado como login),
  senha_hash, ativo
- **PerfilAcesso** — id, nome (Líder Local, Dirigente da Congregação, Líder de Área,
  Pastor de Área, Líder Geral, Secretário Geral, Presidente)
- **VinculoUsuarioPerfil** — id, usuario_id, perfil_id, escopo — o escopo depende do
  perfil: `departamento_id` (Líder Local/Líder de Área/Líder Geral, sempre associado
  também a um `tipo_departamento_id` quando o escopo é de área ou geral),
  `congregacao_id` (Dirigente), `area_id` (Pastor de Área), ou nenhum (Presidente/
  Secretário Geral). Um usuário pode ter **múltiplos vínculos simultâneos** (confirmado
  — acúmulo de papéis é comum na prática).

## Diagrama conceitual (simplificado)

```
Campo 1───* Area 1───* VinculoCongregacaoArea *───1 Congregacao 1───* Departamento *───1 TipoDepartamento
                                                                          │                    │
                                                                          │                    1
                                                                          │                    │
                                                                          *                    *
                                                                RelatorioMensal ──* SchemaRelatorio ──* CampoFormulario
                                                                    │      │                              │
                                                                    │      *                               │
                                                                    │  ContribuinteMensalidade              │
                                                                    *                                       │
                                                             ValorCampoRelatorio ───────────────────────────┘
                                                                    │
                                                                    * (soma mensal)
                                                          TesourariaDepartamento *───1 TipoDepartamento
                                                                    │
                                                                    *
                                                            DespesaTesouraria

Usuario 1───* VinculoUsuarioPerfil *───1 PerfilAcesso
Usuario 1───* HistoricoEdicao (auditoria)
```

## Decisões de design confirmadas

- **Versionamento de schema**: se as regras de rateio ou os campos de um departamento
  mudam no meio do ano, relatórios antigos continuam usando a versão vigente na época.
- **Formulário dinâmico e pré-preenchido**: campos de "estado" (ex.: nº de membros)
  vêm pré-preenchidos com o valor do último relatório enviado, editáveis se algo mudou;
  campos de "fluxo" (ex.: nº de cultos no mês) sempre começam zerados.
- **Sem upload de anexo/comprovante** — decisão explícita, não é uma lacuna a
  preencher.
- **Rastreabilidade obrigatória**: toda edição feita por um Dirigente, Líder de Área
  (comentário), Líder Geral (correção) ou Presidente/Secretário (retificação) precisa
  ficar registrada em `HistoricoEdicao`, com quem, o quê e quando.
- **Duas camadas financeiras**: o relatório mensal por congregação calcula o rateio
  linha a linha (local/geral); a `TesourariaDepartamento` é o livro-caixa agregado do
  departamento em nível de campo, com saldo que transporta de mês a mês e despesas
  lançadas manualmente pelo Líder Geral.
- **Login por matrícula, cadastro manual**: `Usuario.matricula` reproduz o número do
  rol de membros de um sistema de gestão de membros **separado e não integrável** —
  não há sincronização automática. O Secretário(a) Geral cadastra cada usuário
  manualmente, consultando a matrícula no sistema de membros.
- **Secretário(a) Geral é sempre a mesma pessoa/entidade central**, em qualquer nível
  do relatório (inclusive local) — não existe um "secretário local" separado; a
  presença dela no relatório de congregação é um controle antifraude proposital (ver
  [03-perfis-acesso.md](03-perfis-acesso.md)).
- **Suporte para Secretaria Geral é facultativo por departamento** — não é calculado
  por fórmula; é uma opção configurada (ou não) no `PerfilRateio` de cada
  departamento.
