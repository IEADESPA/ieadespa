# FASE 3 — Disciplina e Ética

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](INDICE.md).

## v3.1 — CEI (Corte Suprema Eclesiástica)

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

## v3.2 — Processo disciplinar (abertura, citação, defesa) + catálogo de infrações

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

## v3.3 — Código Penal Eclesiástico (graduação e infrações financeiras)

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

## v3.4 — Julgamento e sanções

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

## v3.5 — Reabilitação e retorno (Art. 77 Regimento)

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

## v3.6 — Escada territorial de instâncias (JAI/JEA/TER)

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

## v3.7 — Ouvidoria Eclesiástica

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
