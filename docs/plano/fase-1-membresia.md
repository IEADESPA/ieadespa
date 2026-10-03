# FASE 1 — Membresia (ciclo de vida do membro)

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

## v1.1 — Admissão de membros (Art. 6º)

- [x] Registro de admissão por: batismo, carta de mudança, reconciliação, aclamação.
      — ✅ migração 015 + `GestaoPessoas`: `FormaAdmissao` (lista fixa do Art. 6º §1º)
      no cadastro e na coluna "Forma Admissão" da listagem.
- [x] Campos: data de admissão/batismo, forma de admissão, origem (igreja anterior).
      — ✅ `DataAdmissao` (já existia), `DataBatismo`, `Origem` e `IgrejaAnterior`.
- [x] Rito público de recebimento (leitura do nome, apresentação à igreja).
      — ✅ `DataRitoRecebimento`, `NomeLidoRito` e `MinistranteRito` (Reg. Art. 130).

## v1.2 — Período de Integração (90 dias)

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

## v1.3 — Categorias e elegibilidade (Art. 7º e 23)

- [x] Cálculo automático das 4 categorias (Congregado / Comunhão / Ativa / Elegível).
      — ✅ `shared/estatuto.js` (`calcularCapacidadeEleitoral`) + `badgeCategoria()`.
- [x] Elegibilidade ativa (votar): ≥18 + 90 dias + livre de disciplina.
- [x] Elegibilidade passiva (ser votado): +1 ano + dizimista (Diretoria/CF); ≥18 (Lideranças/CEI); ≥16 (local).
- [x] Atualização cadastral pela Secretaria (sem novo ato de admissão).
      — ✅ já é o fluxo normal da tela de Pessoas (não gera novo ato de admissão).

## v1.4 — Trânsito eclesiástico e cartas (Regimento Art. 131)

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

## v1.5 — Perda de membresia (Art. 11)

- [x] Registro de causas: falecimento, desligamento, carta de mudança, exclusão, abandono
      material/digital — catálogo fechado (`CAUSAS_SAIDA` em `GestaoPessoas`, mesmo
      padrão de `FORMAS_ADMISSAO`) + novo status `FALECIDO` (`StatusMembro`). Migração 019.
- [x] Abandono Eclesiástico Material (90 dias sem comunhão, `DataAfastamento` lançada
      manualmente pela Secretaria na ficha da Pessoa) + Radar de Abandono
      (`RadarAbandono`) + procedimento sumário de constatação: notificação (registro
      datado, sem e-mail/SMS) → 15 dias de prazo de defesa → homologação pela CLI
      (`AbrirProcedimentoAbandono`/`EvoluirProcedimentoAbandono`).
- [x] Abandono Eclesiástico Digital (Art. 11, V e Art. 12) — relação de Canais Oficiais
      de Comunicação (migração 020; desde a **v7.3** é o registro de canais de
      `/api/canais`, que **valida** a vedação de canal pessoal de dirigente/obreiro em vez de
      deixá-la ao julgamento de quem cadastra) +
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

## v1.6 — Situação e status do membro

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

## v1.7 — Cadastro ampliado (dados sensíveis/LGPD)

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
      `PscAvaliacoes`/`PscSinaisVitais`), não dado de saúde individual. O Regimento só
      cita "diagnósticos de saúde" numa cláusula genérica de sigilo, sem mandar
      coletar nada — sem base normativa para criar um cadastro de saúde de pessoa.
- [x] Vínculos: departamento(s)/congregação/cargo/função — **sem mudança de código**.
      Os 4 Departamentos (crianças/jovens/senhoras/homens) são categorias
      demográficas, 1 por pessoa por natureza (confirmado com o usuário). O "plural"
      do roadmap era sobre ministérios de serviço (louvor, mídia, missões etc.), que
      já têm solução pronta: qualquer um com permissão `"pessoas"` cria um Órgão novo
      (`GetOrgaos`) e uma pessoa já pode ter Assento em vários Órgãos ao mesmo tempo
      (`Assentos` já é N:N).

## v1.8 — Importação e exportação

- [x] Importação de planilha Excel (matrícula + nome + situação — parsing 100% no
      navegador via SheetJS, com tela de revisão de duplicatas por matrícula exata
      e por similaridade de nome ≥90%, decisão linha a linha pelo operador).
- [x] Function `ImportarPessoas` (rota `pessoas/importar`).
- [x] Botão "Baixar modelo" (.xlsx de exemplo gerado no navegador).
- [x] Filtros novos na lista de Pessoas: Congregação e Situação (client-side).
- [x] Exportação de rol de membros com seleção de colunas (checkboxes), 100% no
      navegador, a partir da lista já filtrada (busca + categoria + congregação +
      situação).

## v1.9 — Registros especiais do membro

(Gap identificado em varredura Estatuto/Regimento completa)

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

## v1.10 — Reforma da aba Pessoas + autoatendimento de Foto

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

## v1.11 — Autoedição de dados + Fila de Aprovações

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
