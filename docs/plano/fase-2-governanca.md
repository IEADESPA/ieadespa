# FASE 2 — Governança (órgãos e deliberações)

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

## v2.0 — Submenu por órgão na aba Reuniões (pré-requisito de navegação)

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

## v2.1 — Assembleia Geral (sessão e quórum)

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

## v2.2 — Assembleia Geral (pautas especiais)

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

## v2.3 — CLI (composição e sessões)

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

## v2.4 — CLI (Comissões Permanentes)

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

## v2.5 — Diretoria Executiva

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

## v2.6 — Conselho Fiscal

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

## v2.7 — Órgãos de Apoio, Departamentos e Congregações

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

## v2.8 — Enquetes e Tramitação de Projetos/Pareceres

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

## v2.9 — Documentos e Alerta de Registro

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

## v2.10/v2.11 — descontinuadas como versões próprias

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
