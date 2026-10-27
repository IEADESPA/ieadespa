# FASE 7 — Saúde, Eventos e Comunicação (parte 2: v7.6 a v7.15 e Trava 7-C)

> Continuação de [`fase-7-saude-eventos-e-comunicacao.md`](fase-7-saude-eventos-e-comunicacao.md), que traz o resumo em
> prosa da fase, as versões v7.1 a v7.5 e a 🔒 Trava 7-A. Dividido em 27/10/2026, ao encerrar a fase, porque o arquivo
> passou de 2.000 linhas. As referências a “seção 2.x” e “seção 4” apontam para o [README](../../README.md); cada versão
> tem seu lugar no [índice do plano](INDICE.md).

**FASE 7 encerrada em 27/10/2026** com a 🔒 Trava 7-C (no fim deste arquivo). A antiga v7.9 (faltas na CLI) foi para a
v8.1 da [fase 8](fase-8-ministerial-afm.md). Próxima: FASE 8 (Ministerial).

## v7.6 — Setores Técnicos (voluntariado profissional) *(gap da varredura)*

Distinto da escala de rodízio comum acima — são 20 áreas de voluntariado
especializado (Reg. Art. 48-52): Jurídico, Engenharia, Saúde, TI, Comunicação,
Assistência Social Técnica, Contabilidade, Gastronomia, Segurança, Música/
Sonoplastia, Transporte, Meio Ambiente, Capelania, Empreendedorismo, Cultura,
História/Acervo, RP/Cerimonial, Libras, Beleza/Estética, Educação/Pedagogia.

- [x] Catálogo de Setores Técnicos + Termo de Adesão específico (Reg. Art. 49).
      *(Os 20 setores do Art. 52 semeados com o título do próprio inciso, quem serve em cada
      um (candidatura ou indicação → aprovação → Termo → ativo) e o Termo de Adesão do setor,
      com versão, hash e as formas de prova da v7.5.)*
- [x] Prerrogativas de intervenção cautelar (ex: interditar templo com risco elétrico,
      remover post oficial). *(Art. 50: a interdição — Engenharia e Segurança — e o pedido de
      remoção de postagem — Comunicação —, com aviso na hora, ratificação ou revogação pela
      Diretoria Executiva e o ato registrado para sempre.)*
- [x] Verificação de antecedentes criminais/cíveis (Reg. Art. 133 §5º) na investidura
      em cargo de liderança/confiança ou trabalho com menores — "Termo de Vistoria"
      com data, hash do documento apresentado, parecer e assinatura do responsável.
      *(O Termo de Vistoria do §5º, IV, "c": só o hash da certidão é guardado, nunca o
      documento; acesso só da Diretoria Executiva e do Conselho de Ética. **A Lei 14.811/2024
      pede bem mais** — validade de 180 dias, bloqueio de escala, treinamento: isso é a v7.7,
      que usa este termo como base — ver "O que fica para a v7.7", abaixo.)*

  Entrega: migração 142 (`sql/migrations/142_setores_tecnicos.sql`), `shared/setoresTecnicos.js` e
  `shared/vistoriaAntecedentes.js` (a regra, **pura**), `shared/setoresTecnicosDb.js` e
  `shared/vistoriaAntecedentesDb.js` (banco), as Functions novas `GestaoSetoresTecnicos`
  (`/api/setores-tecnicos/...`, 9 leituras e 17 ações) e `GestaoVistoriasAntecedentes`
  (`/api/vistorias-antecedentes/...`, 5 leituras e 3 ações), o módulo de tela
  `app/modulos/setores-tecnicos.js` (a aba **Setores Técnicos**, a aba **Vistoria de
  Antecedentes** e a sub-aba **Meu Painel → Setores Técnicos**), dez regras no motor de avisos
  da vB.2, duas entradas no ROPA, o bloco de Meus Dados (LGPD) e a retenção do IP. Tocam o que já
  existia: `NotificacoesAgendador` (retenção), `notificacaoDetectores`, `MeusDadosLGPD`,
  `shared/ropa.js` e o seed da homologação.

  **Os 20 setores (Art. 48 a 52).** São do âmbito **geral** ("vedada a sua fragmentação em
  diretórios locais"): a tabela não tem congregação, e a congregação da pessoa é só de onde
  ela vem. **Onde não há profissionais, não há setor** (Art. 48 §2º): um setor sem ninguém
  servindo aparece como "sem profissionais", não como instalado; o catálogo diz **quantos**
  servem, nunca quem. O nome de cada setor é o título que o Regimento dá ao inciso (um teste
  confere a migração contra o texto do Regimento). Cada setor tem marcas: **exige registro no
  conselho de classe** (Engenharia, Saúde, Assistência Social — "credenciados" — e
  Contabilidade), **pode interditar** (Engenharia e Segurança Patrimonial: o Art. 50, I diz
  "Engenharia e Segurança") e **pode pedir remoção de postagem** (Comunicação). A gestão cria,
  edita, desativa e reativa setores (a configurabilidade total do projeto: se o estatuto
  criar um 21º setor, ele entra sem mexer em código).

  **O vínculo e o Termo (Art. 49 §2º).** `CANDIDATO → AGUARDANDO_TERMO → ATIVO → ENCERRADO`.
  A pessoa se candidata (ou a administração a indica); ninguém aprova a própria candidatura;
  só o vínculo **ATIVO**, com o Termo aceito, dá os poderes do setor. Serve quem é membro
  ativo em comunhão, **maior de 18 anos e com data de nascimento no cadastro**; o setor que
  exige registro só recebe quem informa a sigla do conselho e o número. O Termo é o texto
  geral do voluntariado profissional (**sem honorários** — Art. 49 —, a **responsabilidade
  técnica** do profissional que assina projeto ou laudo — Art. 49 §1º —, autonomia, ciência
  dos antecedentes e da imagem, registro do aceite) mais as **cláusulas próprias do setor**:
  os limites da consultoria no Jurídico (Art. 51), a interdição em Engenharia e Segurança
  (Art. 50, I) e o pedido de remoção na Comunicação (Art. 50, II). O **hash cobre o texto
  composto**, e o aceite guarda também a **lista das cláusulas próprias** que a pessoa viu: se
  as marcas do catálogo mudarem depois, a conferência refaz o texto exato (um teste prova). As
  provas são as da v7.5 menos a Lista de Ouro (que existe para regularizar membros antigos): o
  **aceite digital** (IP, cabeçalhos, instante; sem IP público identificável é recusado), a
  **ficha** e o **e-mail/WhatsApp**, estas duas registradas pela gestão com a referência de
  onde o documento está (**em setor com poder, quem indicou ou aprovou a pessoa não registra a
  ficha dela**: outra pessoa da administração confere). O aceite digital leva o **hash do texto
  que a tela mostrou**: se o catálogo mudou entre abrir e aceitar, o servidor recusa e a pessoa
  lê de novo — ninguém aceita um texto que não leu. A adesão **não se altera nem se apaga** (gatilho no banco), salvo a
  anonimização do IP; o vínculo ativo e a prova nascem **na mesma transação** (nunca um sem o
  outro: provado com oito aceites simultâneos). A pessoa **sai quando quiser** (Art. 133 §7º) e a
  gestão pode encerrar (o desligamento exige motivo); depois de encerrado, voltar é um vínculo
  novo — o histórico fica.

  **O poder vem do Termo aceito, não só do catálogo.** Emite o ato quem serve ATIVO **e cujo
  Termo aceito trouxe a cláusula do poder** (interdição ou remoção): ligar a marca de poder num
  setor que já tem gente servindo não dá poder a ninguém — elas aceitaram um Termo sem aquela
  cláusula — e o servidor recusa a edição enquanto houver vínculo vivo; o caminho é encerrar e
  indicar de novo, com o Termo novo. **Tetos de contenção:** cada pessoa tem no máximo **5
  vínculos vigentes** (candidato, aguardando ou ativo) e **3 candidaturas por dia**.

  **Interdição cautelar e pedido de remoção (Art. 50).** Quem serve **ATIVO** num setor com o
  poder emite o ato, em nome do setor e com o **registro profissional** que tinha na hora (o
  Art. 49 §1º: quem assina assume a responsabilidade). A interdição vale **desde a emissão** e
  segue até ser levantada; a Diretoria Executiva a **ratifica** ou **revoga** (revogar exige
  motivo); quem emitiu a **levanta** quando o risco foi sanado (com a observação), e a
  Diretoria também. **Ninguém ratifica nem revoga o próprio ato**, mesmo sendo da Diretoria; quem
  saiu do setor perde o poder de levantar. O pedido de remoção de postagem leva o endereço
  (só `http`/`https`), o motivo (erro grosseiro, direito autoral, doutrina/imagem) e,
  se a rede é um canal cadastrado (v7.3), o canal: é **atendido** por quem cuida da rede, pelo líder
  da congregação (liderança territorial com a permissão `pessoas`, sem restrição de
  departamento), pela gestão ou pela Diretoria — nunca por quem pediu —, **cancelado** por
  quem pediu ou **revogado** pela Diretoria. O identificador do canal (telefone, e-mail, link de
  grupo) **só aparece** a quem administra aquele canal, à gestão e à Diretoria; os demais veem
  a plataforma e o nome. **Contenção do poder:** no máximo **3 atos por
  dia** e **5 em aberto** por pessoa (a emissão é serializada no banco, então 8 pedidos
  simultâneos deixam passar exatamente 3), o mesmo local ou o mesmo link em aberto não se
  repete, e todo texto digitado é recusado se tiver `<` ou `>`. **Avisos** (obrigatórios: o
  destinatário não os desliga): a interdição vai **na hora** à Diretoria, à secretaria dos
  setores, aos líderes da congregação (dirigente, pastor de área e assim até o geral — o líder de
  departamento não) e ao próprio emitente (a confirmação de que o ato saiu em seu nome); o
  aviso **não leva a justificativa técnica**; os avisos de ato saem em lotes e **não esperam a
  entrega dos e-mails** (um provedor lento não segura o ato). A interdição sem ratificação é **cobrada todo
  dia** (depois de `SETOR_INTERDICAO_LEMBRETE_DIAS`, padrão 1) e o pedido de remoção sem
  atendimento também (`SETOR_REMOCAO_LEMBRETE_DIAS`), pelo mesmo motor da vB.2; se ninguém tem a
  permissão de ratificar, o próprio ato avisa quem o emitiu e a cobrança cai para a gestão.

  **O Termo de Vistoria (Art. 133 §5º).** A Diretoria (ou o Conselho de Ética) **solicita**
  as certidões (a pessoa é avisada; no máximo dois avisos em 24 horas) e, ao conferir,
  **lavra o termo**: a data da verificação, o **hash** de cada certidão (SHA-256 calculado **no
  aparelho de quem confere**: o arquivo nunca sobe; o banco nem tem coluna onde guardá-lo), o
  parecer, o destino do original (devolvido ou descartado — a Igreja não guarda cópia, IV, "b") e
  o Diretor que assinou. Os motivos são os do §5º (investidura, mudança de função, suspeita
  fundada, solicitação da Diretoria); o resultado é sem restrição, com restrição ou **recusa**
  (que o Regimento trata como impedimento ou afastamento preventivo). **Ninguém assina a
  própria vistoria**, o termo **não se altera nem se apaga** (gatilho; para corrigir, lavra-se
  outro) e **lavrar pede a confirmação reforçada da vD.4** (chave de acesso ou código por
  e-mail, até 10 minutos). Acesso **exclusivo**: a permissão `vistoria_antecedentes`, no nível
  geral, em **sessão de liderança** (PIN e código nunca valem). A tela mostra **quem exerce
  liderança e ainda não tem termo** (a checagem da investidura é obrigatória, II, "a") e um
  aviso mensal cobra a Diretoria (só quem tem a permissão **no nível geral** o recebe). O aviso à
  pessoa diz o que levar e que não fica cópia, mas **não diz por que** a Diretoria pergunta.
  **Termo lavrado por engano** (matrícula errada) não se apaga: a Diretoria o **anula** por um
  registro à parte, só de acréscimo, com o motivo, quem anulou e a confirmação reforçada (quem pode lavrar pode anular: a Diretoria e o Conselho de Ética); o termo
  continua lá, marcado como anulado, e deixa de contar como a vistoria da pessoa (ela volta a
  "quem falta"). Ninguém anula o termo feito sobre si. A tela mostra o **nome da pessoa** da
  matrícula antes de lavrar, solicitar e anular, para não errar de pessoa, e avisa que o parecer
  não deve citar quem denunciou nem terceiros (o termo é imutável). A auditoria guarda só quem
  agiu, qual termo e a contagem de certidões — nunca o parecer, o resultado, o hash, a função nem o motivo.

  **Permissões.** Três, novas: `setores_tecnicos` (catálogo, vínculos, Termo e a visão de todos
  os atos), `setores_ratificacao` (a Diretoria decide) e `vistoria_antecedentes`. A migração
  concede as três a **Presidente e Secretário Geral** (a Diretoria Executiva, como a 120 já fez com
  `escalas`) e **alarga `Papeis.Permissoes` para 1.000 caracteres** — a coluna nasceu com 300 ou 500
  e um UPDATE que estourasse derrubaria o deploy. O Conselho de Ética recebe `vistoria_antecedentes`
  em Permissões. As três exigem **o nível geral numa mesma concessão e sessão de liderança**; a
  aba só aparece para o nível geral (`ABAS_SO_DO_GERAL`). Sem permissão nenhuma, qualquer login faz o
  que é da própria pessoa: candidatar-se, aceitar o Termo, sair e, se serve com o poder, emitir.

  **A tela.** *Setores Técnicos* (gestão): os 20 setores (quantos servem, situação, marcas;
  criar, editar, desativar), os vínculos (aprovar, recusar, registrar a ficha ou a mensagem, ver e
  **imprimir** o texto do Termo, encerrar, **indicar alguém**) e os atos cautelares com os botões
  que o próprio ato diz que a pessoa pode usar. *Vistoria de Antecedentes*: quem falta, os termos
  lavrados, **lavrar** (com o botão de escolher o arquivo e o hash calculado na hora, ou o hash
  colado), solicitar as certidões e **anular** um termo lavrado por engano. *Meu Painel → Setores Técnicos* (qualquer login, inclusive PIN):
  a situação, a candidatura, o Termo para ler e aceitar, sair, os formulários de interdição e de
  pedido de remoção (só para quem serve com o poder), os atos que emiti e, para o líder, os atos
  da congregação dele. Tudo escapado na saída; a certidão é só arquivo escolhido no navegador.

  **Auditoria e integridade.** `SETOR_CRIADO/EDITADO/DESATIVADO/REATIVADO`, `SETOR_CANDIDATURA`,
  `SETOR_INDICACAO`, `SETOR_CANDIDATURA_APROVADA/RECUSADA`, `SETOR_VINCULO_ENCERRADO`,
  `SETOR_ADESAO_REGISTRADA`, `INTERDICAO_EMITIDA`, `INTERDICAO_RATIFICADA`, `ATO_REVOGADO`,
  `INTERDICAO_LEVANTADA`, `REMOCAO_POSTAGEM_SOLICITADA/ATENDIDA/CANCELADA`, `VISTORIA_SOLICITADA`,
  `VISTORIA_LAVRADA`, `VISTORIA_ANULADA` e `IP_ANONIMIZADO`. O banco garante: um vínculo vigente por pessoa e setor; ATIVO só
  com `AtivadoEm`; uma adesão por vínculo e cada forma só com a sua prova; adesão, ato e termo
  imutáveis (gatilhos; a anulação do termo também, e é uma só por termo); ato encerrado definitivo; motivo e status coerentes com o tipo; revogação
  com motivo; fechamento com quem, quando e observação; hash da certidão em minúsculas (compara em
  binário); termo sem auto-assinatura e sem original na recusa.

  **Retenção (LGPD).** O vínculo, o Termo (forma, data, versão, hash) e os atos ficam **sem prazo
  final**: são prova. O **IP e os cabeçalhos** do aceite digital são anonimizados **5 anos depois
  que o vínculo termina** (o mesmo `VOLUNTARIADO_IP_RETENCAO_DIAS`; rotina diária; o gatilho só
  admite essa troca). O termo de vistoria é o arquivo interno que o Regimento manda guardar e só
  tem hash. Dois blocos no ROPA e em **Meus Dados**: a pessoa recebe, a pedido, os vínculos, o
  Termo (com o IP, que é dela), os atos que emitiu e os termos de vistoria feitos sobre ela
  (com o parecer, os hashes e a data da anulação, se houve; sem o nome de quem assinou).

  **Decisões que o Regimento não fecha (cada uma é uma linha, a CLI pode reverter).**
  - **Segurança Patrimonial também interdita.** O Art. 50, I fala "Engenharia e Segurança"; as duas
    marcas estão no catálogo (uma linha cada) e a CLI pode tirar a de Segurança.
  - **A interdição vale na hora e não caduca sozinha.** O Regimento pede "ratificação" sem prazo; uma
    interdição por risco de vida não pode perder o efeito porque a Diretoria demorou, então ela segue
    até ser decidida ou levantada — e a Diretoria é **cobrada todo dia**.
  - **O sistema não cancela culto nem escala sozinho.** A interdição é um ato formal com aviso e
    ratificação; quem decide cancelar o culto do dia é o dirigente, avisado na hora. (A integração com a
    agenda e as escalas, se a CLI quiser, é uma decisão à parte.)
  - **Quem emite com PIN.** O voluntário profissional entra por matrícula e PIN de 4 números (a
    decisão do responsável desde a v7.5), e é com ele que o ato é emitido. As contenções são o vínculo
    com Termo aceito, os tetos, a ratificação pela Diretoria, o aviso ao próprio emitente e a trilha.
  - **O líder que atende o pedido de remoção** é a liderança de nível territorial (congregação, área
    ou geral) com a permissão `pessoas` e sem restrição de departamento, cujo escopo alcança a
    congregação (a migração não tem o conceito de "dirigente"): o tesoureiro e o líder de
    departamento não atendem.
  - **O texto do Termo do setor é um rascunho aprovado pelo responsável sem parecer de advogado** (a
    Igreja não tem). Trocar o texto cria outra versão e outro hash, sem invalidar quem aderiu.
  - **A Diretoria Executiva = Presidente e Secretário Geral** nas permissões iniciais; o Conselho de
    Ética recebe a de vistoria por Permissões.
  - **Lavrar e anular o termo pedem a confirmação reforçada da vD.4**, como os quatro atos de peso daquela fase.
  - **Termo errado se anula, não se apaga** (LGPD art. 18, III): o registro fica, marcado, e deixa de contar.
  - **O poder de emitir só vale com a cláusula no Termo que a pessoa aceitou** (acima): a marca no catálogo sozinha não basta.
  - **O setor só serve quem tem 18 anos ou mais** (a mesma leitura conservadora da v7.5).

  **O que fica para a v7.7 (e por quê).** O Termo de Vistoria aqui feito é a base: a v7.7 liga a vistoria
  à esteira de habilitação (v5.7), dá **validade de 180 dias**, bloqueia a escala e acrescenta o que a Lei
  14.811/2024 exige de quem serve com menores. Também fica para lá o **dever de auto-denúncia** do voluntário
  que passa a responder a inquérito ou processo (Art. 133 §5º, V): é do mesmo assunto, e o Termo de Adesão
  já o informa à pessoa. Não fica nada da v7.6 em aberto.

## v7.7 — Habilitação para Ministério com Menores *(7ª rodada — OBRIGAÇÃO LEGAL VIGENTE)*

> **Este é o achado mais grave de toda a 7ª rodada.** A **Lei 14.811/2024**
> inseriu o **art. 59-A no ECA** e está em vigor desde **12/01/2024**, sem
> vacatio. **Correção da Trava 7-C (23/10/2026):** o texto antigo dizia que toda
> entidade com crianças está obrigada; a lei é mais estreita. O **caput** alcança a
> instituição que **recebe recurso público**; o **parágrafo único**, os
> "**estabelecimentos educacionais e similares**", que devem manter fichas e
> certidões de antecedentes de **todos os colaboradores**. A EBD pode ser tida
> como "similar", mas não há obrigação inequívoca para a Igreja como tal. Por
> isso a Igreja **adota a exigência por cautela** e pelo **Regimento, Art. 133
> §5º** (com a atualização semestral, inclusive para voluntários); a base legal
> no ROPA é o Art. 7º, II onde a lei alcança e o Art. 7º, IX (legítimo interesse
> na proteção), sem afirmar obrigação legal em todos os casos.

*(Numeração: as versões v7.7 e v7.8 existiam como lacuna no documento — o
roadmap pulava de v7.6 para v7.9 sem nota. A lacuna foi preenchida com o tema
que mais fazia falta. Em 15/10/2026 a v7.9 foi movida, na íntegra, para a v8.1 da fase 8: a numeração da fase 7 segue na v7.10.)*

- [x] **Habilitação para Ministério Infantojuvenil** por voluntário: ficha
      cadastral + certidão de antecedentes (federal/PF e estadual/TJ) anexada,
      com `data_emissao` e **validade automática de 180 dias**.
      *(A esteira da v5.7 passou a usar a verificação real: o passo "Antecedentes" só fecha
      com um Termo de Vistoria da v7.6 válido — as **duas** certidões criminais, sem restrição,
      emitidas há no máximo 180 dias; a certidão não é guardada, só o hash e a data de emissão
      que a v7.6 já guarda. A validade é **calculada na leitura**: vale até o 180º dia contado da
      EMISSÃO, inclusive; vence a mais antiga das duas. A ficha cadastral é reconfirmada a cada
      semestre pela própria pessoa, em Meu Painel, ou pela Secretaria.)*
- [x] **Bloqueio de escala por habilitação vencida** — não é alerta: quem está
      com certidão vencida sai automaticamente das escalas de ministério com
      menores e não pode ser escalado. Alertas em D-60/D-30/D-15 antes de vencer
      (a renovação leva dias para sair; avisar no dia do vencimento é inútil).
      *(O portão vale em **todos** os caminhos que colocam alguém numa escala de equipe marcada
      "contato com menores": aceitar, confirmar, trocar (e aprovar a troca), auto-escalar,
      convite em cadeia, entrar num grupo de rodízio e gerar o rodízio. Quem perde a habilitação
      sai das escalas futuras **na hora** (marcar inapto, ligar a marca da equipe, declarar uma
      auto-denúncia) e, para o que vence com o tempo, na rotina diária, que roda ANTES dos avisos.
      A escada 60/30/15 avisa a pessoa, o líder da equipe e a secretaria; quem entra tarde só
      recebe o último degrau e a renovação reabre a escada.)*
- [x] **Treinamento obrigatório de proteção** com validade e renovação periódica
      (padrão internacional: 2 a 3 anos), também bloqueante — conecta com a
      trilha de formação (v6.9). *(MinistrySafe; Church of England safeguarding)*
      *(Quando há requisito BLOQUEIA no contexto `HABILITACAO_TREINAMENTO` da trilha, a situação
      vem da trilha (vigente/vencendo valem; vencida bloqueia); sem requisito, a atestação da
      esteira vale 2 anos (`HABILITACAO_TREINAMENTO_DIAS`, em Catálogos → Prazos).)*
- [x] **Regra dos dois adultos** (*two-adult rule*) validada na escala: nenhuma
      sala com menores publica escala com **um adulto sozinho**, e a proporção
      adulto/criança mínima por faixa etária é verificada antes de publicar.
      *(Church Answers; padrão consolidado em seguradoras de igrejas nos EUA)*
      *(Publicar **recusa** a sala sem dois adultos habilitados, ou fora da proporção
      (berçário 3, maternal 5, infantil 8, juniores 10, adolescentes 12 crianças por adulto,
      todos ajustáveis em Prazos), ou sem a faixa etária da equipe, ou sem as crianças previstas
      que o líder informa por serviço. O adolescente serve como auxiliar e **não conta** como adulto.
      O rodízio de equipe com menores nasce sempre como rascunho, para a publicação passar
      pelo portão. A rotina diária avisa o líder da sala que ficou com menos de dois adultos nos
      próximos 7 dias.)*
- [x] **Regra dos 6 meses** de frequência antes de servir com menores (v5.7) —
      calculada, não digitada. *(Da `DataAdmissao`, com o fim de mês tratado: 31/ago + 6 meses
      = 28/fev. Sem a data, não se presume.)*
- [x] **Política de comunicação eletrônica com menores**: vedada mensagem privada
      1:1 entre adulto e menor; canais de grupo exigem segundo adulto e
      responsável com acesso. Aceite da política registrado por voluntário
      (conecta com a Regra das 24 Horas, v7.3).
      *(Texto versionado com hash (`POLITICA_VERSAO`), aceito digitalmente com o hash do texto que a
      tela mostrou, o IP e o instante (ou em ficha assinada, registrada pela Secretaria); sem o
      aceite da versão vigente a pessoa não serve com menores. O sistema **não tem mensagem
      privada**: a vedação 1:1 é o compromisso aceito, e a Regra das 24 Horas da v7.3 trata o
      conteúdo impróprio em canal oficial. Todo canal que inclui menores exige **dois
      administradores adultos habilitados com o Termo de Dever de Moderação aceito e um responsável
      com acesso**: o canal que não cumpre fica IRREGULAR e é cobrado todo mês; ligar a marca
      num canal que já tem administradores, encerrar o segundo administrador e designar quem
      não está habilitado são recusados.)*
- [x] **Consentimento específico e destacado do responsável** (LGPD Art. 14) para
      dados de menor — uso de imagem, alergia/condição de saúde para o crachá —
      versionado e revogável.
      *(Dois consentimentos separados, cada um com texto próprio, versão e hash: **imagem** e
      **saúde no crachá**. Quem concede é o responsável cadastrado pela Secretaria (digital, com IP,
      ou em ficha registrada por OUTRA pessoa); qualquer responsável ativo revoga, e revogar a imagem
      **apaga o arquivo da foto**. Vale enquanto quem autorizou continua responsável ativo e o
      menor tem menos de 18 anos. A foto de menor deixa de depender do consentimento do próprio menor
      (que não vale): só o do responsável destrava. Revogar a foto de qualquer membro passou a apagar
      o arquivo, como o ROPA já dizia. **O dado de alergia e o crachá ainda não existem no sistema**:
      chegam com o check-in infantil da v7.10, que só consulta este consentimento.)*
- [x] **Painel de conformidade por congregação**: quantos voluntários aptos,
      quantos vencendo, quantos bloqueados — o Dirigente precisa ver isso antes
      de o problema existir, e a Secretaria Geral precisa ver o campo inteiro.
      *(Aba **Ministério com Menores**: o painel da congregação para quem habilita e o do campo
      inteiro para a Secretaria Geral, com o resumo, o status de cada voluntário e o próximo
      vencimento. O que é reservado à Diretoria — restrição na vistoria, comunicação em análise,
      cadastro nacional, fora de comunhão — a gestão da congregação vê só como "pendência com a
      Diretoria", **inclusive nas contagens e na situação das certidões** (o ensaio no banco achou os
      dois vazamentos).)*
- [x] Adapter preparado (sem depender dele) para o futuro cadastro nacional de
      condenados por crimes contra menores — hoje ainda é projeto de lei, não
      obrigação vigente; o campo fica pronto sem criar dependência.
      *(`shared/cadastroNacionalMenores.js`: interface do provedor, tabela de consultas só de
      acréscimo e o efeito na aptidão ("consta" bloqueia; "indisponível" nunca bloqueia). Sem
      provedor registrado não faz nada, e nenhuma rota ou rotina o chama.)*
- [x] **Dever de auto-denúncia** do voluntário que passa a responder a inquérito ou
      processo criminal (Regimento Art. 133 §5º, V — a omissão é falta grave): canal de
      aviso à Diretoria e ligação com a vistoria. *(Veio da v7.6, que entregou o Termo de
      Vistoria — `VistoriasAntecedentes`, com `ComVulneraveis` e `ultimaVistoria()` prontos
      para esta versão usar.)*
      *(Em Meu Painel, a pessoa comunica **só o tipo e a data da ciência** — nenhum texto livre, nenhum
      número de processo; a Diretoria Executiva e o Conselho de Ética são avisados na hora e
      cobrados todo dia até decidir. Por cautela, e sem ser punição, o contato dela com menores fica
      suspenso e ela sai das escalas futuras com menores até a decisão: **manter** (volta
      imediatamente, se a habilitação está em dia) ou **afastar preventivamente** (que outra pessoa
      da Diretoria pode levantar depois, uma única vez). Decidir e liberar pedem a confirmação
      reforçada; ninguém decide sobre a própria comunicação; a auditoria não leva nem o tipo.)*

  Entrega: migração 143 (`sql/migrations/143_ministerio_menores.sql`), `shared/ministerioMenores.js`
  (a regra, **pura**), `shared/ministerioMenoresDb.js` (banco), `shared/menoresConsentimento.js` e
  `menoresConsentimentoDb.js` (consentimento do responsável), `shared/cadastroNacionalMenores.js`, as
  Functions novas `GestaoMinisterioMenores` (`/api/ministerio-menores/...`, 6 leituras e 8 ações) e
  `GestaoConsentimentoMenor` (`/api/consentimento-menor/...`, 3 leituras e 3 ações), as rotas novas
  `escalas/criancas-previstas` e `canais/responsavel-acesso`, o portão nas escalas, nos convites, nas
  trocas, nos grupos e no rodízio, a retirada automática, onze regras no motor de avisos da vB.2,
  a retenção do IP e os blocos de Meus Dados, ROPA e RIPD. Tocam o que já existia: `escalas.js`,
  `voluntariadoDb.js`, `habilitacaoVoluntarios.js` (os antecedentes deixam de ser carimbo manual),
  `GestaoEscalas`, `GestaoHabilitacaoVoluntarios` (a elegibilidade passa a trazer a aptidão),
  `canais.js`/`canaisDb.js`, `consentimentoFoto.js`, `MinhaFoto`, `UploadFotoMembro`,
  `GestaoConsentimentoLGPD`, `NotificacoesAgendador` e `notificacaoDetectores`.

  **Quem está apto** (`avaliarAptidao`, calculado na leitura, nunca digitado): em plena comunhão;
  com data de nascimento; sem comunicação à Diretoria em análise e sem "consta" no cadastro nacional;
  habilitação da esteira concluída, em dia e não marcada inapta; **as duas certidões criminais**
  do último Termo de Vistoria (não anulado) sem restrição e com menos de 180 dias; treinamento de
  proteção em dia; ficha confirmada nos últimos 180 dias; política da versão vigente aceita; 6 meses
  de comunhão. Cada falta vira um bloqueio com mensagem em português simples e o que fazer. O menor de
  18 anos não tem certidão de antecedentes (ato infracional corre em segredo de justiça): serve só
  como auxiliar, nunca conta como adulto e ainda precisa de tudo o mais.

  **Decisões que a Lei e o Regimento não fecham (cada uma é uma linha; a CLI pode reverter).**
  - **A validade da certidão conta da emissão** (a Lei fala em "atualização semestral"): 180 dias,
    configurável. Vale até o último dia, inclusive.
  - **As duas certidões criminais (federal e estadual) são exigidas**; a de distribuição cível é
    informativa. A vistoria que decide é a última não anulada: uma vistoria mais nova incompleta
    não é completada por uma antiga.
  - **A marca `ComVulneraveis` da vistoria não decide a aptidão** (senão uma vistoria recente de
    investidura, completa, seria recusada só pela marca): decidem as certidões.
  - **Treinamento sem trilha configurada vale 2 anos**, atestado por quem habilita.
  - **Quem comunica a auto-denúncia fica suspenso do contato com menores por cautela** até a
    decisão — padrão de políticas de proteção de crianças; a mensagem diz que não é punição.
  - **O líder só vê o motivo curto; o colega que pede uma troca não vê motivo nenhum**; a pessoa
    vê tudo o que lhe diz respeito.
  - **A regra de canais vale para qualquer canal que inclui menores** (não só grupos): mais
    rigorosa, e a CLI pode restringir a grupos numa condição de `pendenciasDeMenores`.
  - **Rodízio com menores nasce rascunho**: a quantidade de crianças é por serviço e só existe
    depois dele.
  - **Os prazos configuráveis só podem encurtar**: certidão e ficha têm teto de 180 dias, treinamento
    de 3 anos, e o mínimo de adultos na sala é 2 (configurar 365 dias ou 1 adulto não afrouxa a regra).
  - **Em sala com menores, adulto só troca com adulto** (o adolescente apto é auxiliar e não conta como
    adulto): senão a troca esvaziaria a sala dos dois adultos que a regra exige.
  - **Sala sem nenhum voluntário não publica** (zero adultos também é falta).
  - **Ninguém reabilita a si mesmo** e **desligar a marca de menores de uma equipe** (que derruba todo o
    portão) pede a confirmação reforçada, como a decisão da auto-denúncia; ligar é livre.
  - **Canal que inclui menores não é divulgado no site**, e a indicação do "responsável com acesso" tem uma
    mensagem de recusa só (não existe / não está ativo / não é adulto), para não virar consulta de cadastro.
  - **A rotina diária não dá verde quando falha o que protege criança**: a retirada das escalas ou um
    detector do ministério com menores que falha faz a resposta virar 500 (o job do GitHub fica vermelho);
    um detector de outro assunto que falha só é registrado. Vistoria lavrada com restrição ou recusa, ou
    termo anulado, tira a pessoa das escalas com menores **na hora**, sem esperar a rotina.
  - **Foto de menor só fica com a autorização vigente do responsável**: a faxina diária (e o ato que tira o
    responsável) apaga a foto de menor de 18 anos sem essa autorização — inclusive a enviada antes da v7.7
    com o consentimento do próprio menor, que não vale. O adulto que desmarca só o telefone/e-mail continua
    com a foto (decisão antiga, travada em teste).
  - **A gestão não distingue as pendências reservadas, nem pelos detalhes**: restrição nos antecedentes,
    comunicação em análise, cadastro nacional e fora de comunhão aparecem como a **mesma linha** ("pendência
    reservada: procurar a Diretoria"), sem datas de certidão e sem "próximo vencimento"; a legenda do painel
    não dá exemplo da causa. A Diretoria vê o detalhe.
  - **A Diretoria sabe que o motivo que escreve será lido pela pessoa** (Meus Dados, direito de acesso da
    LGPD): o formulário de decidir e de levantar o afastamento diz isso.
  - **A Secretaria não registra o consentimento de foto de menor de 18 anos** (a rota recusa e a tela não
    oferece o botão): quem autoriza é o responsável; registrar o da própria pessoa seria "sucesso" sem efeito.
  - **A tela diz "a lei e o Regimento pedem"** e não só "a lei": a Lei 14.811/2024 não fala em treinamento,
    política de comunicação nem 6 meses de comunhão; isso é Regimento e regra do sistema. O número de crianças
    por adulto aparece como **padrão** (a Igreja pode mudá-lo em Catálogos → Prazos).
  - **Risco aceito: as ações da própria pessoa valem em sessão de PIN** (aceitar a política, confirmar a
    ficha, comunicar a auto-denúncia), pela decisão de 02/10/2026 de acesso do membro por PIN. Ninguém
    ganha poder com isso: a aptidão continua dependendo de certidões lançadas pela Diretoria, treinamento
    atestado e esteira; e a auto-denúncia só **restringe** (suspensão cautelar). As decisões da Diretoria
    (decidir/liberar) exigem sessão de liderança com a confirmação reforçada.

  **O que fica para a v7.10 (e por quê).** O **dado** de alergia ou condição de saúde e o **crachá**
  do check-in infantil: hoje não existem no sistema (o consentimento de saúde já pode ser dado e
  revogado, e a v7.10 precisa apagar o dado ao revogar). Também fica lá a autorização do responsável
  para quem **não é membro** (criança só de EBD ou de apresentação): o consentimento desta versão é
  do menor que é membro, com responsável cadastrado. Não fica nada da v7.7 em aberto.

## v7.8 — Incidentes, notificação obrigatória e escuta protegida *(7ª rodada — OBRIGAÇÃO LEGAL)*

Fluxo **deliberadamente separado da disciplina eclesiástica** (FASE 3) e da
Ouvidoria (v3.7). Não é a mesma coisa: processo disciplinar apura falta contra a
igreja; aqui o dever é **externo e legal** — comunicar ao Estado. Tratar suspeita
de maus-tratos como assunto interno é exatamente o erro que gerou as maiores
crises institucionais em denominações no mundo inteiro.

- [x] **Notificação obrigatória ao Conselho Tutelar** diante de **suspeita** (não
      exige certeza, não cabe à igreja investigar): ECA **Art. 13** e **Art. 70-B,
      parágrafo único** (quem cuida de criança por ministério responde pelo retardamento
      ou pela omissão). *(Correção da Trava 7-C: o texto antigo citava a multa do Art. 245,
      que alcança o médico, o professor e o responsável por estabelecimento de saúde ou de
      ensino fundamental, pré-escola ou creche — não a Igreja como tal.)* Fluxo com **SLA curto (24h)**, relógio regressivo visível ao
      Dirigente e à Secretaria Geral, campos de órgão notificado (Conselho
      Tutelar/MP/Polícia), protocolo e anexo do ofício.
      *(Registrar uma suspeita de violência abre o relógio de **24 horas** contados do instante em
      que a Igreja ficou sabendo (padrão: agora; quem registra pode informar "soubemos há N horas", até
      30 dias). O prazo é **calculado na leitura** — vence mesmo que nenhuma rotina rode — e a fila mostra
      o relógio regressivo (verde, amarelo abaixo de 12 h, vermelho abaixo de 4 h, "vencido há…"). O
      aviso do incidente novo sai **na hora** (Diretoria, Comitê e o Dirigente DA congregação; nunca o
      envolvido), e uma rotina **horária** (7h às 22h de Brasília) avisa com 12 h, com 4 h e, vencido, a
      cada 6 h (no máximo 5 avisos de vencido por caso; depois disso o **resumo diário das 7h** assume e
      lembra a Diretoria e o Comitê todo dia enquanto o caso estiver vencido ou sem comprovante). Cada comunicação
      registra órgão (Conselho Tutelar, Ministério Público, Polícia, Disque 100, outro), forma (ofício,
      pessoalmente, telefone, e-mail, sistema do órgão), data e hora, **protocolo do órgão**, onde o
      comprovante está guardado e se foi **dentro do prazo**; o ofício pode ser anexado ao incidente.
      Comunicar fora do prazo vale, mas fica marcado e entra no relatório. O protocolo e o lugar do comprovante
      precisam **ter sentido** (pelo menos 4 letras ou números: "-", "n/a" ou "0000" não valem, porque uma
      comunicação vazia pararia o relógio para sempre), e um **anexo de prova nunca se apaga**.)*
- [x] **Encerramento bloqueado sem comprovante da comunicação externa** — o caso
      não fecha no sistema enquanto não houver prova de que o Estado foi avisado.
      *(A suspeita de violência só encerra com pelo menos uma comunicação **com comprovante** (protocolo
      do órgão, lugar onde o papel está guardado ou arquivo anexado) **e** a decisão do Comitê sobre o
      afastamento de cada envolvido que é membro; e só como "encaminhado às autoridades": a apuração não é
      da Igreja. Uma suspeita **nunca é rebaixada** (só se sobe de nível). Quebra de política e
      quase-acidente encerram com a providência tomada.)*
- [x] **Escuta protegida** (Lei 13.431/2017): a igreja **acolhe e encaminha, não
      inquire**. O formulário não tem campo de "inquirição"; exibe o roteiro
      correto (acolher → registrar o relato espontâneo, na íntegra e sem
      interpretação → encaminhar) e restringe a leitura do relato a papéis
      específicos. Repetir a entrevista é revitimizar — e o sistema tem que
      ajudar a não fazer isso.
      *(O formulário só tem fatos (quando, onde, o que aconteceu), quem contou e o **relato como foi
      contado**, e mostra o roteiro "acolher / registrar como foi dito / encaminhar" e o "**não faça**"
      (perguntas para "tirar a verdade", chamar o apontado, avisar a família dele, contar a terceiros). O
      relato fica em **tabela à parte, só de acréscimo**, **um por incidente** (a conversa não se repete;
      informação nova e espontânea entra como **adendo**, no máximo 5), e só é lido pela liderança de
      proteção, com a **confirmação reforçada** (chave de acesso ou código por e-mail) — **cada leitura
      fica registrada** (quem e quando, nunca o conteúdo) e a Diretoria vê quem leu.)*
- [x] **Afastamento cautelar automático** do envolvido de toda escala com menores
      no momento do registro — medida protetiva, **não** punição antecipada, e
      registrada como tal (a v2.6/`MedidasCautelares` já tem o mecanismo).
      *(Entra na **mesma aptidão da v7.7** como bloqueio reservado `INCIDENTE_EM_APURACAO`: vale em
      todos os caminhos de escala, convite, troca, rodízio e designação de administrador de canal com
      menores, e o envolvido sai das escalas futuras **na hora** do registro. É **calculado**: envolvido
      (membro) de suspeita de violência cuja **última decisão** do Comitê não é "levantado"; sem decisão,
      continua (o sistema não rebaixa sozinho) e, passados 3 dias, o Comitê é cobrado toda semana. Ninguém
      decide sobre o próprio afastamento. Para a gestão da congregação vira "pendência com a Diretoria"; para
      a **própria pessoa** o texto, o código e o rótulo são genéricos ("por cautela, o seu contato com
      crianças está suspenso, por decisão da Diretoria; isso não é uma condenação") — nada diz que é um
      incidente. Reaproveitei o mecanismo da v7.7 e não o de `MedidasCautelares` (que é patrimonial, Art. 45).)*
- [x] Registro de incidentes em três níveis: quase-acidente, quebra de política e
      alegação — porque o padrão internacional mostra que o que antecede o caso
      grave é a sequência de pequenas quebras que ninguém registrou.
      *(Qualquer pessoa logada, inclusive por PIN, registra; quem registra vê só a situação do que
      registrou ("em andamento"/"encerrado"). A **rotina de padrões** olha os últimos 90 dias: três
      registros de quase-acidente ou quebra na **mesma equipe** ou na **mesma pessoa** avisam a Diretoria
      e o Comitê (e a tela de Padrões lista). Só a suspeita de violência afasta alguém; a quebra de política
      não. O nível pode **subir** (a tela de reclassificar), e então o relógio de 24 horas começa naquele
      instante.)*
- [x] Comitê de revisão com participação **não-clerical** e relatório anual de
      conformidade por congregação. *(Praesidium; Royal Commission — 10 Child
      Safe Standards; Dallas Charter/USCCB)*
      *(O **Comitê de Proteção** é o papel de mesmo nome no cadastro de lideranças (nível geral, com a
      permissão `protecao_menores`): quem é cadastrado nesse papel é do Comitê. A composição é
      **calculada**: pelo menos **3 membros** e **pelo menos um que não seja do clero** (o cargo vem do
      cadastro — Pastor, Evangelista, Presbítero, Diácono e Missionário são clero —, nunca é digitado);
      incompleto, a Diretoria é avisada toda semana. O **relatório anual** (nível geral) traz, por
      congregação e no total: incidentes por nível, suspeitas comunicadas **dentro do prazo** e fora/sem
      comunicação, tempo médio até comunicar, afastamentos ativos, a composição do Comitê e a habilitação
      dos voluntários — só números, nenhum nome nem relato — e imprime.)*
- [x] Canal de denúncia acessível também à criança/adolescente, em linguagem
      adequada — a Ouvidoria (v3.7) hoje é desenhada para adulto.
      *(**"Preciso de ajuda"**: tela sem login (a criança pode não ter conta), em linguagem simples, com os
      telefones **100** (Disque Direitos Humanos, de graça, 24 h) e **190** sempre visíveis, só **um campo
      de texto** obrigatório (nenhuma pergunta de "prova"), "quem está escrevendo" e "como falar com você"
      opcionais, e a igreja opcional. O pedido vira **suspeita de violência** com o relógio de 24 horas e
      avisa **só o nível geral** (Diretoria e Comitê): a congregação escolhida é palpite de quem escreveu, e o
      Dirigente dela pode ser justamente a pessoa de quem se fala, então ele nem vê o pedido. **Não guarda IP
      nem cabeçalhos** (o limite por origem é em memória, em hash truncado); contra inundação há 5 pedidos por
      hora por origem e, no total, 15 por hora e 60 por dia — no teto, ou em erro, a resposta **sempre** traz a
      orientação do 100 e do 190. Se o pedido não tem conteúdo de proteção (teste, engano), a Diretoria o
      **arquiva como "sem conteúdo de proteção"**, com o motivo, e o resto do nível geral é avisado.)*

### Contrato (rotas)

`GestaoProtecaoMenores` (`/api/protecao-menores/{acao}`): de **qualquer pessoa logada** — `catalogos`,
`meus`, `registrar`; da **gestão** (permissão `protecao_menores`, sessão de liderança; o Dirigente só
enxerga a sua congregação) — `incidentes`, `incidente`, `relato` (confirmação reforçada), `comunicacao`,
`adendo`, `reclassificar`; do **nível geral** (Diretoria e Comitê) — `cautelar-decidir`, `encerrar` e
`vincular-envolvido` (liga ao cadastro a pessoa que foi registrada só pelo nome; confirmação reforçada),
`padroes`, `comite`, `relatorio-anual`. `ProtecaoAjuda` (`POST /api/protecao-ajuda`,
sem login). `ProtecaoVerificador` (`POST /api/protecao-verificador-interno`, por segredo; chamada de hora em
hora pelo workflow `rotinas-protecao.yml`). Anexos do incidente: `/api/anexos` com a tabela `IncidentesProtecao`.

### Decisões que a Lei e o Regimento não fecham (cada uma é uma linha; a CLI pode reverter)

- **Quem é "envolvido" nunca vê o incidente** (conflito de interesse): para ele a lista não o mostra, o
  detalhe, o relato e os anexos respondem como "não existe". Vale também para a Diretoria: se o Presidente é o
  envolvido, os outros membros da Diretoria e do Comitê tratam.
- **O afastamento cautelar só vem de suspeita de violência** (não de quebra de política ou quase-acidente) e
  só para envolvido que é membro; para quem não é do cadastro (um visitante, alguém de fora) o sistema não
  tem como afastar e a decisão fica com a Diretoria fora dele — o caso encerra sem decisão de afastamento.
- **A tela da própria pessoa afastada não diz o motivo**: a apuração é das autoridades e avisá-la do que
  consta contra ela, antes disso, pode atrapalhar. Ela é avisada da retirada da escala (texto genérico) e,
  se o Comitê levantar o afastamento, do levantamento.
- **O prazo de 24 horas conta da ciência**, não do fato: quem registra pode recuar a ciência (até 30 dias),
  e o caso já nasce vencido se for o caso (aparece no relatório).
- **Registrar não é livre de limite**: 10 registros por dia por pessoa, 3 suspeitas por dia (contra uso de
  má-fé; um relato verdadeiro nunca chega perto). Quem passa do limite lê para ligar para o 100 ou para o 190
  ou falar com o Dirigente. Quem registrou fica registrado (o dono do registro está na tabela).
- **O relato nunca vai para aviso, auditoria, relatório nem log**; a auditoria das ações sensíveis não leva o
  número do caso, quem agiu nem o nível (o elo fica nas tabelas, que têm acesso restrito). A trilha lida por
  quem tem a permissão "auditoria" não consegue ligar uma pessoa a um incidente.
- **Retenção de 20 anos do encerramento** (registro de apuração de crime contra criança: o prazo corre a partir
  dos 18 anos da vítima); a CLI pode ajustar em Catálogos. Nada se apaga (gatilhos no banco).
- **A rotina horária roda das 7h às 22h de Brasília** e **só abre o banco se há prazo correndo**: o banco é
  serverless e só pausa se ficar uma hora sem uso; uma chamada por hora o dia todo o manteria ligado (R$ 65 a 86
  por dia contra R$ 6 a 7 pausado). Por isso a rotina pergunta antes a uma marca guardada no Storage ("há
  suspeita aberta, sem comunicação, dentro da janela de avisos?") e, se não há, responde sem tocar no banco; a
  marca é refeita por toda mudança e pela rodada diária. Sem marca, ou com o Storage fora do ar, na dúvida ela
  olha o banco. Ela cuida só do aviso do incidente novo e do relógio; padrão de quebras, Comitê incompleto,
  afastamento sem decisão e o resumo diário são da rodada das 7h. De madrugada o aviso do incidente novo continua
  saindo na hora do registro e o relógio é calculado na leitura: só o lembrete espera. Um aviso cujo e-mail não
  saiu é reenviado a cada rodada (até 48 horas depois).
- **Os avisos que protegem criança não se desligam**: as regras da proteção e do ministério com menores são
  obrigatórias; a tela de regras recusa desligar o aviso ou o e-mail (só o título pode ser ajustado).
- **Quem manteve o afastamento não o levanta sozinho**: o levantamento tem de vir de outra pessoa do nível geral
  (dois olhares sobre a decisão mais delicada). A pessoa afastada é avisada do levantamento com título neutro.
- **Quem registra não fica sabendo o efeito**: a resposta não diz quantas escalas foram desmarcadas nem a
  quantas pessoas o aviso chegou (isso revelaria se a pessoa apontada servia em alguma escala). Se a matrícula
  informada não existe, o registro vira "só o nome", sem dizer isso a quem registrou; a Diretoria confere e
  vincula. Os padrões e o painel da v7.7 não mostram a pessoa para ela mesma.
- **A criança só lê "a liderança foi avisada" quando isso é verdade**: o pedido de ajuda sem login devolve só
  um sim/não (`avisada`, nunca a contagem) e o texto muda — se ninguém pôde ser avisado (sem destinatário, regra
  desligada, e-mail fora), ela lê para **ligar agora para o 100 ou o 190**. O 100 e o 190 aparecem nas duas versões.
- **A tela revisada por quem não a construiu** (revisão adversarial independente: 5 achados médios e 12 baixos, nenhum
  crítico; vazamento do relato, XSS e CSP estavam sãos). O que mudou: os dados do caso saem da tela ao sair da aba
  (respostas atrasadas não repovoam a fila nem religam o relógio); na tela da criança, um novo toque em "Enviar" não
  apaga a confirmação com o número do pedido e o texto digitado durante o envio não se perde; o registro **repetido**
  de uma suspeita mostra o prazo de 24 horas, o "não faça" e o 100/190 (o servidor devolve se exige comunicação); a
  ficha de uma suspeita aberta traz o "não faça" para quem comunica; "Vincular" some quando a pessoa do cadastro já está
  vinculada; o formulário da comunicação usa o relógio do **servidor**; o modal de anexos fecha ao trocar de login;
  "pedido sem conteúdo de proteção" é sempre a **última** opção de encerramento (nunca a primeira nem a escolhida de
  partida); foco de teclado nos formulários, impressão do relatório sem página em branco e sem o relato; as chamadas
  entre arquivos da tela não derrubam a navegação nem o logout se o módulo faltar na casca; o texto do aviso de
  "Comitê incompleto" e o da aba dizem o mesmo (o Comitê se cadastra pelo papel "Comitê de Proteção", em Permissões).
- **O Dirigente comunica, o Comitê encerra**: registrar a comunicação, o adendo e a reclassificação são da
  gestão (inclusive o Dirigente da congregação, que é quem está perto e tem as 24 horas); decidir o afastamento
  e encerrar o caso são do nível geral.
- **A proteção cobre as escalas e os canais**; a sala de aula da EBD e outras funções com criança que não
  passam pelas escalas continuam fora do portão do sistema (como já era na v7.7): o afastamento ali é
  decisão da Diretoria sobre o cadastro do professor. *(A turma da EBD ganhou o portão na Trava 7-B. Resolvido na
  Trava 7-C, por decisão de 23/10/2026: **departamentos e liderança** — eventos ficaram fora. Quem ocupa departamento ou
  cargo marcado "com crianças" e não está apto aparece para a Diretoria e a Proteção do nível geral, sem sair do cargo.)*

### O que NÃO é desta versão (e por quê)

A **escuta da criança em si** (depoimento especial, Lei 13.431 arts. 7º a 12) é das autoridades — a Igreja
não faz e o sistema não oferece. Notificação **automática** ao Conselho Tutelar por integração também não
existe: cada cidade tem um canal (ofício, telefone, sistema próprio) e o dever é do dirigente; o sistema
**cobra e prova** (o relógio, o protocolo, o comprovante), não protocola por ele.

## v7.9 — Movida para a v8.1 (fase 8), na íntegra

Por decisão do responsável (15/10/2026), esta versão **não é construída na fase 7**: o texto completo (os três itens, a nota sobre as sessões da CLI
integradas com a AFM e a taxonomia de justificativas) foi copiado **sem alterações** para a [v8.1 da fase 8](fase-8-ministerial-afm.md), que passa a ser
uma versão grande: o módulo da AFM **e** a contagem de faltas da CLI (Art. 27), construídos juntos. A próxima versão a construir na fase 7 é a **v7.10**.

## v7.10 — Check-in infantil com cadeia de custódia *(7ª rodada)*

Peça operacional que sustenta na prática a v7.7: sem controle de entrega e
retirada, a política de proteção é só documento.

- [x] Check-in por família com **etiqueta de segurança**: código aleatório por
      criança, impresso na etiqueta e no recibo do responsável, **obrigatório na
      retirada** — quem não tem o código não retira, ainda que seja conhecido.
      *(Só o HMAC do código é guardado; 5 erros travam a criança, com a tentativa reservada no banco antes de
      conferir; segunda via com dois adultos.)*
- [x] Lista de **pessoas autorizadas a retirar** por criança e alerta de retirada divergente. *(Texto emendado:
      a custódia se apoia no cadastro de responsáveis da Secretaria, `VoluntariadoResponsaveis`, e não no vínculo
      familiar de autoatendimento — ver o contrato. A divergente só sai com o código e a aprovação da liderança.)*
- [x] Alergia/condição de saúde impressa na etiqueta (com o consentimento da
      v7.7) e contagem de lotação por sala em tempo real — a proporção
      adulto/criança deixa de ser estimativa.
- [x] Registro de horário e de **quem entregou e quem retirou** — é a prova
      auditável que protege a igreja e a família. *(Histórico só de acréscimo, com gatilho no banco; 5 anos.)*
- [x] Bloqueio de voluntário sem habilitação vigente (v7.7) na sala, no ato do
      check-in. *(Planning Center Check-Ins; FellowshipOne; ChurchSuite)* *(A aptidão é reavaliada a cada ato; e,
      desde a Trava 7-B, quem perde a aptidão com a sala aberta tem a presença encerrada e a liderança é avisada.)*
- [x] **Integração com o Portal do Membro (vB.5)**: "meus filhos" no autoatendimento é o responsável cadastrado
      consultando o histórico de check-in/check-out dos próprios filhos pelo celular — nunca fazendo o check-in ele
      mesmo (isso continua sendo ação de voluntário na sala, com a etiqueta física). Sub-aba nova em "Meu Painel".
- [x] **Portão da EBD** (o "próximo degrau" que a v7.8 deixou registrado): a turma da EBD marcada como
      "com menores" só aceita professor **apto** (a aptidão da v7.7) e perde, na rotina diária, o professor que
      deixou de ser apto. *(Desde a Trava 7-B, o professor da turma marcada também precisa ser adulto e apto a
      cada ato, e entra no painel e nos avisos de renovação.)*

  **Prova (20/10/2026).** Servidor: jest do `api` inteiro verde; no SQL Server de verdade (LocalDB, handlers
  reais) e2e-18 (setup e garantias da 145) 241, e2e-19 (fluxos) 413, e2e-20 (segurança) 246, e2e-21 (corridas
  com vários processos) 49 e e2e-22 (revisão) 189 verificações, 0 falhas. Tela: `tools/front-checkin` 1.488
  verificações, 0 falhas, e a prova de mutação completa (648 mutações; ver a Trava 7-B). Entrega: migração 145
  (`sql/migrations/145_checkin_infantil.sql`), `shared/checkinInfantil.js` (a regra, pura),
  `shared/checkinInfantilDb.js`, a Function `GestaoCheckinInfantil` (`/api/checkin-infantil/<ação>`), o módulo
  `app/modulos/checkin-infantil.js` (aba Check-in infantil e sub-aba de Meu Painel), a marca "com menores" da
  turma da EBD e a rota `POST /api/ebd-turmas/turmas/menores`.

### Contrato da v7.10 (decisões tomadas antes de construir)

Escrito em 15/10/2026, depois de ler o que a v7.7 e a v7.8 deixaram prontos. Cada linha é uma decisão que a lei e o
Regimento não fecham; a CLI pode revertê-la. Nada disto está construído ainda: os itens acima só viram `[x]` com a
prova (jest, banco real, tela, homologação).

**A sala e quem opera.** A *sala* do check-in é a mesma da v7.7: o par **(serviço da escala, equipe marcada "contato
com menores")**, com a faixa etária que a equipe já tem. Opera a sala quem está **escalado** nela (aceito ou
confirmado) naquele serviço e **apto hoje**, e a aptidão é reavaliada a **cada ato** (não só ao entrar); também opera o
líder da equipe, se for apto. A sessão pode ser a de PIN (voluntário comum não tem senha administrativa): o que protege a
criança é o código e a conferência do servidor, não o tipo de login. Atos de **gestão** (aprovar retirada divergente, ver
o relatório do dia, cadastrar autorizados e saúde a partir de ficha) exigem sessão de **liderança** com a permissão
`habilitacao_voluntarios` no escopo da congregação. A janela do check-in é do serviço: de **60 minutos antes** até **5
horas depois** do horário (ajustáveis em Prazos); fora dela a sala não abre.

**A criança.** É **membro** (menor de 18 anos cadastrado) ou **visitante** (nome, data de nascimento e quem a trouxe, só
para esta visita). Visitante não ganha cadastro de membro (mesmo princípio da chamada da EBD). A idade fora da faixa da
sala **avisa**, não impede. Uma família faz o check-in de até 6 crianças de uma vez.

**Quem é o responsável: o cadastro da Secretaria, não o vínculo familiar.** O plano original dizia "reaproveita
`VinculosFamiliares` e `ResponsavelLegal`", mas a v7.7 criou o cadastro de responsáveis (`VoluntariadoResponsaveis`:
pai, mãe, tutor, com o documento conferido pela Secretaria) e é nele que o consentimento já se apoia. O vínculo familiar
é de **autoatendimento** (qualquer membro pode declarar parentesco), então **não vale para custódia**: quem se diz
"responsável legal" sozinho não vê histórico nem retira criança. Criança membro sem responsável cadastrado faz o
check-in como **membro**, com a pessoa que traz registrada na hora (nome, parentesco e documento conferido) e o selo
"Sem responsável cadastrado" na tela, que sugere à Secretaria o cadastro *(texto emendado em 19/10/2026: o plano
dizia "como visitante"; a construção ficou assim para a criança não perder o vínculo com a lista de autorizados e o
histórico que o responsável vai ter depois do cadastro)*.

**O código.** Um **código aleatório por criança, por visita**: 6 caracteres sem os parecidos (sem 0/O, 1/I/L), gerado no
servidor, impresso na **etiqueta da criança** e no **recibo do responsável**. O servidor guarda só o **HMAC** do código
(com segredo do servidor, atado ao registro); o texto do código **nunca** é gravado, registrado em log nem enviado à
auditoria, e só sai uma vez, na resposta do check-in. A retirada é por criança: o voluntário escolhe a criança na tela e
digita o código; **5 erros** travam aquela criança (só a gestão destrava, ou a segunda via). Sem código não se retira,
**ainda que a pessoa seja conhecida** (é a regra do plano). Perdeu a etiqueta e o recibo? **Segunda via**: um voluntário
confere o documento de quem pede (precisa estar entre os autorizados) e **outro adulto presente na sala confirma** em até
10 minutos (dois olhares); o código antigo morre e o ato fica no histórico.

**Quem pode retirar.** Os **responsáveis cadastrados** da criança (sempre), **mais** a lista de autorizados que o
responsável faz (nome, parentesco, até 8 por criança, com validade opcional, revogável) e quem **trouxe** a criança nesta
visita (mais até 3 nomes que o responsável indicar no check-in). Retirada por quem **não está nessa lista** é
**divergente**: precisa do código **e** da aprovação de um gestor (sessão de liderança), que vê o motivo e o telefone do
responsável para confirmar; o sistema **avisa os responsáveis** na hora (aviso obrigatório) e o líder; sem aprovação a
criança **não sai**. Quem não tem código e não está na lista não retira criança nenhuma: chama-se o responsável.

**Lotação em tempo real e as regras da v7.7 valendo na porta.** Adultos da sala = voluntários que **entraram** (registro
de entrada e de saída), **maiores de 18 anos e aptos agora**; o adolescente serve como auxiliar e não conta. O check-in é
**recusado** se há menos de 2 adultos presentes, se a criança a mais passaria da proporção da faixa (o mesmo padrão
ajustável da v7.7) ou se a equipe não tem faixa; o voluntário **não pode sair** se deixaria menos de 2 adultos com
criança na sala; a sala só **encerra** com a sala vazia. A tela da sala atualiza sozinha a cada poucos segundos.

**Saúde (alergia e condição).** O dado é **do responsável**: ele (Meu Painel) ou a Secretaria (ficha assinada) o grava, e
**só se há consentimento vigente** de saúde da v7.7. Sai na etiqueta (⚠) só com esse consentimento; **revogar o
consentimento apaga o dado** (e as cópias nos registros de check-in) na mesma operação, e a rotina diária apaga o de quem
perdeu o consentimento por outro motivo (responsável desativado, criança fez 18 anos). Para o **visitante** não há
consentimento guardado: o responsável presente informa e concorda no balcão (texto e versão registrados), e o dado vale
só para aquela visita.

**Registro e prova.** Cada ato (check-in, entrada e saída de voluntário, erro de código, retirada, divergência pedida,
aprovada ou negada, segunda via, encerramento) é uma linha de **histórico só de acréscimo** (gatilho no banco impede
alterar ou apagar), com quem fez, o horário do **servidor** e o código do ato. A auditoria geral do sistema recebe só
ids e códigos: nunca nome de criança, código de retirada, saúde nem texto livre. O responsável vê, em Meu Painel, **só o
histórico das próprias crianças** (data, sala, quem trouxe, quem retirou, horários), nunca de outras, nunca o nome do
voluntário, nunca o código.

**Guarda e LGPD (art. 14).** Os registros de custódia ficam **5 anos** (política de retenção própria, ajustável); o
telefone de quem trouxe um visitante é apagado em **90 dias** e o dado de saúde do visitante, junto com o registro, no
mesmo prazo; depois do prazo geral o registro é anonimizado, não apagado (a contagem de presença sobrevive). ROPA e RIPD
ganham a atividade "Check-in infantil" (criança, saúde e custódia são dado sensível de menor).

**Avisos.** Obrigatórios (o destinatário não desliga): *retirada divergente* (responsáveis, líder e gestão da
congregação), *criança sem retirada registrada* (a rotina diária da manhã seguinte avisa a gestão se alguma criança
ficou "na sala" depois do fim do serviço), *segunda via emitida* (responsáveis) e, desde 20/10/2026, *criança entregue
ou retirada por um terceiro* (responsáveis cadastrados; ver as emendas abaixo).

**Portão da EBD.** A turma ganha a marca "com menores" (começa **desmarcada**, para nada mudar de uma hora para outra) e
o nome que parece infantil ("Crianças", "Juniores"...) gera o mesmo alerta que a equipe sem marca já gera. Com a marca,
**cadastrar** professor exige aptidão, e a rotina diária tira da turma o professor que deixou de ser apto (e avisa o
líder e a gestão), como já faz com as escalas.

**Fora desta versão (por decisão):** QR no celular do responsável, impressora térmica com integração direta (imprime-se
pelo navegador, em etiqueta ou papel comum) e modo sem internet — o código em papel já é a prova que a retirada exige.

### Emendas ao contrato (19/10/2026) — depois da revisão adversarial independente

Duas revisões independentes (uma só da tela, outra só do servidor; leitura do código e reproduções) acharam **22 e 32
problemas, nenhum crítico**. O que o código resolve foi corrigido, cada correção com teste que falha no código antigo.
O que o contrato precisou mudar:

- **Encerramento da sala (antes só prometido).** A sala **não é mais "só encerra com a sala vazia"** quando alguém
  esquece de registrar a retirada de uma criança: sem saída, o registro ficava "na sala" para sempre (a janela
  fecha, ninguém reentra, o código antigo se perdeu e o check-in da semana seguinte era recusado). Agora a
  **liderança** (`habilitacao_voluntarios` no escopo, confirmação reforçada) dá a **baixa administrativa** pela ação
  `encerrar-sala`: só vale com a janela do serviço fechada (ou o serviço não publicado, ou sem criança), exige um
  **motivo** de 5 a 300 caracteres, baixa em lote as crianças que ficaram (situação `RETIRADA`, tipo `BAIXA_ADM`, sem
  código e sem retirante; quem deu a baixa e o motivo ficam gravados), cancela a segunda via pendente, faz sair os
  voluntários presentes e registra eventos imutáveis (`BAIXA_ADMINISTRATIVA` por criança e `SALA_ENCERRADA`). Repetir
  não faz nada. A lista de salas da liderança mostra também as de **dias anteriores** que ainda têm criança sem
  retirada, marcadas "Dia anterior". O aviso diário "criança sem retirada" manda a liderança para esse botão.
- **Autorizados dependem de responsável ativo.** A pessoa que o responsável autorizou só vale enquanto **quem a
  cadastrou continuar sendo responsável ativo** da criança; as que a Secretaria registrou por **ficha assinada** valem
  até serem revogadas ou vencerem. Ao revogar um responsável, as autorizações dele são revogadas de vez e a gestão
  recebe um aviso obrigatório (sem nome de criança).
- **O relatório do dia é ato de gestão** (já estava no contrato; o servidor o entregava também ao voluntário da
  sala — corrigido: 403 para quem opera, 404 fora do escopo).
- **O voluntário não vê a aptidão dos colegas.** A tela da sala mostra só quem **conta na proporção**; o motivo de
  alguém não estar apto (incidente em apuração, cadastro nacional, autodenúncia) continua reservado, como na v7.7 e
  na v7.8, e a gestão só vê o que a v7.7 já mostrava a ela.
- **Retirada divergente** ganha um campo **opcional de motivo** (até 300 caracteres) que o gestor vê no cartão; o
  motivo da **decisão** da gestão fica em outro campo.
- **Aviso obrigatório que não consegue sair não cala.** Se ninguém pôde ser avisado (regra inativa, lista vazia,
  erro), o ato vale e a resposta ao voluntário diz que **ninguém foi avisado e é preciso ligar para a liderança**;
  nenhum erro de aviso derruba um ato já gravado (a segunda via perdia o código novo quando isso acontecia).
- **Segunda via:** o segundo adulto passa a ver **quem pede e o documento conferido** (antes só "confirme"); a
  etiqueta nova mostra a hora de **entrada original** e "2ª via emitida às …".
- **Etiquetas e recibos:** cada entrada é um lote; só os lotes **ainda não impressos** vão ao papel (os códigos de
  uma família nunca saem no papel da seguinte) e depois de imprimir a tela pergunta **se saíram na impressora**
  (cancelar o diálogo não conta como impresso; a classe de impressão fica até a resposta, para o celular que
  desenha a prévia depois).
- **Consentimento de saúde do visitante:** quando o texto de autorização muda, a tela **redesenha o texto novo**
  antes de o responsável poder concordar de novo (antes o "concordo" ia sobre um texto que ele não leu).
- **LGPD (retenção):** além do registro, ficam anonimizados o motivo da divergência, o motivo da baixa, o nome e a
  matrícula da pessoa da segunda via e as **autorizações revogadas ou vencidas há mais de 5 anos**. Registro ainda
  aberto não se anonimiza (sai pela baixa administrativa). O responsável deixa de ver o histórico de quem já fez 18
  anos. A busca de criança ignora acento.
- **Desempenho:** prazos e parâmetros de proporção ficam em cache de 15 segundos por processo (a sala consultava a
  configuração ~30 vezes a cada 8 segundos no banco de 5 DTU); nenhum dado de custódia entra em cache. A tela dá
  tempo-limite de 20 segundos a cada pedido e avisa quando os dados da sala estão velhos.
- **Sem solução nesta versão (registrado):** gravar a revogação do consentimento e apagar a saúde na **mesma**
  transação (a leitura confere a vigência na hora e a rotina diária apaga: prova no e2e-21); o detector de
  "divergência pendente há muito tempo"; fechar `TRUNCATE`/`DISABLE TRIGGER` nas tabelas do check-in (só se resolve
  tirando essa permissão do usuário do banco: decisão de operação); a cadeia de hash da auditoria geral que pode
  bifurcar com gravações simultâneas (anterior a esta versão e do sistema todo); busca de criança por GET leva
  pedaço do nome no endereço (o Application Insights o registra). *(Atualizado na Trava 7-C: o detector da
  divergência parada, a busca por POST e a cadeia de hash da auditoria foram **resolvidos na Trava 7-B**. Seguem
  registrados a revogação na mesma transação — **resolvida na 7-C** (`e2e-38`) — e o usuário de banco sem `TRUNCATE`/`DISABLE TRIGGER`, avaliado na 7-C.)*
- **Aviso ao responsável quando um terceiro traz ou retira a criança (decidido pela liderança em 20/10/2026).** Quem
  trouxe a criança sem ser responsável cadastrado (nome digitado no balcão) ganha direito de retirar só com o código;
  agora os **responsáveis cadastrados** recebem, na hora, um aviso obrigatório em dois momentos: na **entrega**
  (`CHECKIN_TERCEIRO_ENTREGA`) e na **retirada** feita por esse terceiro ou pelo indicado só para a visita por ele
  (`CHECKIN_TERCEIRO_RETIRADA`). O texto nomeia o terceiro e o **primeiro** nome da criança (nunca documento, telefone
  nem saúde); irmãos com os mesmos responsáveis recebem um aviso só. Não avisa quando quem trouxe é responsável
  cadastrado, nem quando quem retira é da lista fixa (feita por um responsável ou com a ficha); criança visitante e
  criança sem responsável cadastrado não têm a quem avisar (sem alarme). A retirada de quem **não está na lista**
  continua com o aviso próprio (divergente). Se o aviso não sair, o ato vale (já está gravado) e a resposta ao voluntário
  traz `semAviso` e manda ligar para a família.
- **Decidido NÃO fazer (responsável da Igreja, 21/10/2026):** a retirada comum com **dois olhares** (o código da
  etiqueta já protege e a fila do fim do culto ficaria lenta) e deixar o voluntário **reentrar na sala depois da
  janela** só para retirar (a sala já aceita retirada até 5 horas depois; passou disso, a baixa administrativa).

## 🔒 Trava de Revisão 7-B — antes de avançar para a v7.11

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3).
Audita v7.7 a v7.10 pelas 5 perguntas do checklist — **atenção máxima**: a
v7.7 (habilitação para ministério com menores, Lei 14.811/2024) e a v7.8
(notificação obrigatória de suspeita de maus-tratos, ECA Arts. 13 e 70-B)
tratam de obrigação legal já vigente, com responsabilização pela omissão, e de dado de
criança. Um bug de tela aqui não é só inconveniente — pode significar
voluntário sem antecedente verificado atuando com menor, ou suspeita não
notificada. Testar cada fluxo manualmente, não só confiar no "parece certo".

- [x] **Fechada em 20/10/2026** — auditoria de v7.7, v7.8 e v7.10 (a v7.9 foi para a v8.1). Duas revisões
  independentes, só de leitura: uma das costuras ENTRE as versões (quem não está apto chega à criança por algum
  caminho?) e outra da lei, do plano e do README. **Nenhum achado crítico; 2 altos, 14 médios e 11 baixos, todos
  corrigidos com teste que falha no código de antes** (migrações 146 e 147; os textos da 145 ajustados antes de ela
  ir para a produção). O que mudou:
  - **Aviso que só foi para o sino não conta (alto).** O aviso obrigatório contava como entregue ao entrar no sino
    do app, que a mãe pode nunca abrir. Agora só conta quem foi alcançado **fora do app** (e-mail aceito ou push);
    sem isso, a resposta ao voluntário ou à liderança manda ligar. Push ligado nas regras do check-in; o reenvio do
    e-mail que falhou vale também para as regras obrigatórias do check-in, de menores e da EBD.
  - **Liderança afastada fora do check-in (alto).** Quem tem pendência reservada à Diretoria (afastamento cautelar
    da v7.8, comunicação em análise, cadastro nacional, restrição, fora de comunhão) não vê a sala nem age como
    gestão. Incluir autorizado "por ficha" pede a confirmação reforçada, e **toda** inclusão avisa os responsáveis.
  - **Quem perde a aptidão com a sala aberta sai da sala.** A presença é encerrada e o líder e a gestão recebem o
    aviso obrigatório "uma pessoa da equipe precisa sair da sala agora", dizendo se a sala ficou abaixo dos dois
    adultos. O portão da EBD confere, a cada ato, que o professor da turma marcada é adulto e apto; esse professor
    entra no painel e nos avisos de renovação.
  - **Proteção.** O texto da lei foi corrigido: comunicar ao Conselho Tutelar **imediatamente** (ECA arts. 13 e
    70-B; Lei 14.344/2022, arts. 23 e 26); 24 horas é o prazo máximo interno. O caso fica só com a Diretoria e o
    Comitê quando quem registra marca que a pessoa envolvida é da liderança local, ou quando algum envolvido não
    tem matrícula: o Dirigente apontado só pelo nome não recebe nem lê o próprio caso. A retirada das escalas que
    falha depois de um afastamento aparece como alerta.
  - **LGPD.** A exclusão do titular apaga a saúde da criança e as cópias, e revoga os consentimentos e as
    autorizações de retirada, na mesma transação; o registro de custódia fica pelos 5 anos. A saúde copiada do
    cadastro só aparece na sala e na segunda via com o consentimento vigente. A saúde do visitante só vai na
    etiqueta com a concordância do pai, da mãe ou do tutor(a). A busca de criança vai por POST, para o nome não
    ficar no endereço.
  - **Outros.** Lembrete único à liderança da divergência parada há 20 minutos; a baixa administrativa avisa o
    responsável; o aviso "sem retirada" olha 90 dias e cai na gestão geral; a criança membro registrada como
    visitante é recusada; a trilha de auditoria lê o topo da cadeia com trava (a cadeia não bifurca mais com
    gravações simultâneas).

  As 5 perguntas:
  1. *Código novo roda de ponta a ponta no ambiente real?* **Sim.** Banco SQL Server de verdade, recriado do zero
     com todas as migrações (até a 147) e os handlers reais. As 19 baterias passaram com 0 falhas:
     - v7.6: e2e-2 a 6 (117, 307, 136, 120 e 19 verificações);
     - v7.7: e2e-8 a 12 (187, 221, 24, 107 e 43);
     - v7.8: e2e-14 a 17 (146, 163, 20 e 51);
     - v7.10: e2e-18 a 22 (241, 413, 246, 49 e 189).

     Na homologação, a migração e a varredura de rotas passaram (corrida 39461418301).
  2. *Toda tela abre e mostra dado de verdade?* **Sim.** Na homologação:
     - teste de tela completo: 1.052 ações iguais no computador e 142 no celular, 0 divergência e 0 violação de CSP
       (corrida 39461406618);
     - prova em navegador de verdade, com login e a API real respondendo 200: check-in no Meu Painel (39462933544)
       e na aba da liderança (39463828848), proteção (39463333614) e ministério com menores (39463549945).

     Provas da tela: `tools/front-checkin` (1.488 verificações e a prova de mutação com 648 mutações),
     `tools/front-protecao` (808) e `tools/front-menores` (322).
  3. *README e código narram a mesma coisa?* **Sim.** O README perdeu a lista velha de tabelas que "ainda não
     existem" (EBD, eventos e proteção já existem) e ganhou a v7.10 e as migrações 146 e 147. ROPA e RIPD descrevem
     com exatidão o prazo imediato, a revogação da saúde e a exclusão LGPD. Os itens da v7.10 foram reescritos (a
     custódia usa o cadastro de responsáveis da Secretaria, não o vínculo familiar).
  4. *O que ficou para trás foi corrigido, não só anotado?* **Sim, o que o código resolve.** A revogação da saúde
     não é a mesma transação, mas a leitura não mostra o dado e a rotina diária o apaga *(resolvido na Trava 7-C: a
     revogação e o apagar da saúde e das cópias correm na MESMA transação, sob a trava da saúde da criança — a mesma da
     gravação da saúde, do check-in e da exclusão LGPD; prova no `e2e-38`)*. O detector de divergência
     parada e a busca por POST foram feitos, e a cadeia da auditoria foi corrigida. **Decidido NÃO fazer** (o
     responsável da Igreja, 21/10/2026: "deixa como está"; saem dos planos):
     - dois olhares na retirada comum;
     - deixar o voluntário reentrar na sala depois da janela só para retirar;
     - tratar como divergente a retirada por quem está com afastamento cautelar (o afastamento é cautela, não
       decisão de juiz: a Igreja não impede um pai de buscar o filho; se for o caso, o Comitê conversa com a família);
     - exigir o membro que não é do clero nas decisões do Comitê;
     - devolver o caso ao Dirigente depois de vincular a matrícula do envolvido (fica com a Diretoria e o Comitê).

     **Ação humana (não é código):** marcar as turmas da EBD "com menores" e cadastrar o Comitê de Proteção.

     A lista de responsáveis de uma criança continua visível ao voluntário apto da sala: é como ele escolhe quem
     trouxe.
  5. *Deploy real aconteceu?* **Sim.** Merge `e5acfdc` na `main` em 20/10/2026 (reverter: `git revert -m 1 e5acfdc`).
     A produção aplicou as migrações 145, 146 e 147 e passou na varredura de rotas (corrida 39482372783). O teste de
     tela da produção deu 1.052 ações iguais no computador e 142 no celular, sem divergência e sem violação de CSP
     (corrida 39482372666). As rotas novas respondem 401 sem login (`/api/checkin-infantil/*` e
     `ebd-turmas/turmas/menores`) e a casca do aplicativo está na v34. Fechada esta trava, a FASE 7 segue para a v7.11.

## v7.11 — Cuidado pastoral: filas com responsável, prazo e sigilo *(7ª rodada)*

Hoje o sistema registra o que **aconteceu** (disciplina, abandono, carta). Não
registra o que alguém **precisa fazer por alguém** — e é justamente aí que as
pessoas se perdem sem que ninguém perceba a tempo.

- [x] **Fila de acompanhamento com dono e SLA**: visitante, novo convertido,
      membro afastado, pedido de visita, pedido de oração, pós-internação.
      Cada item tem responsável nomeado e prazo; vencido, escala pela hierarquia
      territorial que já existe (Dirigente → Pastor de Área → Região).
      *(Rock RMS Connections; MinistryPlatform Care Cases; CCB process queues)*
      *(Os seis tipos, com prazo ajustável em Catálogos — o visitante em **48 horas**, a Busca Ativa do Regimento Art. 128 §5º. O item nasce com o
      Dirigente como responsável (ou no degrau de cima, se não há Dirigente ou se é ele a pessoa acompanhada); a liderança troca o responsável,
      que pode ser qualquer membro adulto da congregação e o trabalha pelo Meu Painel, mesmo por PIN. Vencido, sobe Congregação → Área
      (Pastor de Área) → Região (papel novo **Superintendente Regional**) → nível geral, pulando o degrau sem ninguém; quem estava embaixo continua
      trabalhando. Toda visita registra quem foi junto (Art. 85 §3º, "nunca a sós"). Quem muda de congregação some da antiga na hora e o item
      passa para a nova na rotina das 7h.)*
- [x] **Detecção de afastamento por desvio do próprio padrão** — não regra fixa
      global ("faltou 3 cultos"), e sim comparação com o histórico **daquela
      pessoa**: quem vinha 4x por mês e caiu para 1 é sinal; quem sempre veio 1x
      não é. Abre item na fila antes de virar caso de abandono (v1.5).
      *(CDM+ Missing Analysis)*
      *(A taxa de presença dos ~6 meses de base contra a das últimas 6 semanas, com o que o sistema registra: a chamada da EBD (com o "ausente") e
      as reuniões encerradas — o sistema não tem presença no culto por pessoa, e a tela diz isso. Sinal quando havia costume (50% ou mais) e a
      queda é de 60% ou mais; no máximo 5 por congregação por dia; o item diz o porquê em números e nunca abre abandono sozinho.)*
- [x] **Notas pastorais com nível de confidencialidade** (pública / liderança
      local / somente pastor), log de acesso auditável e **versão anonimizada
      automática** para boletim de oração ("um irmão da congregação X"). Dado de
      saúde e aconselhamento é dado sensível — vazamento aqui destrói confiança e
      gera passivo. *(CareNote; Notebird; TouchPoint)*
      *(Equipe / Liderança local / Somente pastor (só quem tem o cargo de Pastor no cadastro; abrir pede a confirmação reforçada). A nota não se
      edita e a correção nunca abre o sigilo; o texto só sai ao abrir e cada abertura fica registrada; a pessoa nunca vê as notas sobre ela (em Meus
      Dados, só quantas). Saem 30 dias depois do desligamento (Art. 132 §2º, II) e na exclusão LGPD. O boletim leva uma linha **gerada pelo
      assunto e pela congregação** ("Alguém da Congregação Vila Nova pede oração pela saúde."), nunca o texto, e recusa nome e diagnóstico.)*
- [x] Pedidos de oração com moderação antes de publicar e **sinalização de risco**
      (menção a autolesão/violência) escalando imediatamente para o pastor, fora
      da fila normal.
      *(Nada vai ao boletim sem moderação. Com sinal de risco, o pedido sai da moderação comum, vira acompanhamento urgente de 24 horas e o aviso
      obrigatório (e-mail e celular) vai na hora a toda a liderança do território — ou só ao nível geral, se o texto cita a liderança; quem pediu
      lê o 188, o 190, o 180 e o 100, e só lê "a liderança foi avisada" se o aviso saiu de fato. O pedido de socorro nunca é recusado pelo limite
      do dia nem por já haver outro pedido aberto; desmarcar um alarme falso é da Área para cima, com motivo e confirmação reforçada.)*

### Contrato da v7.11 (decisões tomadas antes de construir)

Escrito em 21/10/2026, depois de ler o que o sistema já tem. Cada linha é uma decisão que o Regimento não fecha; a CLI
pode revertê-la. Os itens acima só viram `[x]` com a prova (jest, banco real, tela, homologação).

**O que o sistema já sabe (e o que não sabe).** Não existe tabela de visitante, de pedido de visita, de pedido de oração
nem de nota pastoral; o que existe é o **abandono** (v1.5), que é manual (alguém marca "sem comunhão" e a data). E o
sistema **não registra presença nos cultos** por pessoa: a única frequência semanal por pessoa é a **chamada da EBD**
(com o "ausente" gravado) e, mais espaçada, a das **reuniões** encerradas (assembleia, CLI, órgãos locais). A detecção de
afastamento usa só isso, e a tela diz isso com todas as letras: quem não está numa turma da EBD nem num órgão **não é
medido** (o detector não inventa falta de quem ele não vê). O motor de Fluxos (vB.3) tem a escada
Congregação → Área → Região, mas não tem dono nomeado nem sigilo: a fila tem a sua própria tabela e reaproveita só a ideia.

**Quem trabalha a fila.** Permissão nova `cuidado_pastoral` (sessão de liderança), dada ao Presidente, ao Secretário Geral,
ao Dirigente de Congregação e ao Pastor de Área, e papel novo **Superintendente Regional** (nível Região; Regimento: "a
presidência regional é exercida pelo Superintendente Regional"). Cada um vê a fila **do seu território** (o Dirigente, a
congregação; o Pastor de Área, as congregações da área; o Superintendente, as da região; o nível geral, tudo). O
**responsável nomeado** pode ser qualquer membro ativo e maior de idade da congregação (um diácono, um presbítero, uma irmã
do círculo de oração) ou alguém da liderança que alcança a congregação; ele vê **só os itens dele**, em Meu Painel, mesmo
entrando por PIN, com o nome e o contato da pessoa, o motivo e o histórico — nunca as notas restritas.

**A pessoa acompanhada nunca vê o item nem as notas sobre ela**, mesmo que seja da liderança (o Dirigente que caiu na
detecção não vê o próprio item: quem vê é a Área para cima). Ela vê, em Meu Painel, **só os pedidos que ela mesma fez**
(visita, oração), com a situação.

**Os tipos e os prazos (ajustáveis em Catálogos → Prazos).** Visitante: **48 horas** (Regimento Art. 128 §5º, II, b: "Busca
Ativa em até 48 horas"); novo convertido: 7 dias; membro afastado: 14 dias; pedido de visita: 7 dias; pedido de oração com
pedido de contato: 3 dias; pós-internação: 3 dias. O item nasce com o **Dirigente** da congregação como responsável (se o
Dirigente não for a própria pessoa acompanhada); a liderança troca o responsável quando quiser, e quem é nomeado recebe o
aviso. Visitante e novo convertido entram pelo nome e o contato (não ganham cadastro de membro, como na chamada da EBD).

**(Trava 7-C) O Superintendente Regional.** O Regimento (Art. 104 §1º) diz que ele é, automaticamente, o Pastor Titular da Área-Polo; o sistema
só o conhece cadastrado na Liderança da Região (papel "Superintendente Regional"). Sem o cadastro, a escada pula a Região: o painel do nível
geral (Cuidado pastoral → Painel) agora lista "região sem Superintendente Regional cadastrado". **Ação humana:** cadastrar o Superintendente de
cada região.

**A escada do prazo vencido.** A rotina diária das 7h (a mesma das outras; o banco não fica ligado à toa) olha os itens
abertos com o prazo vencido e **sobe um degrau**: Congregação → Área → Região → nível geral. O degrau sem ninguém com a
permissão (uma região sem Superintendente cadastrado) é **pulado** — o item nunca fica sem quem receba. Quem está no
degrau novo recebe o aviso e o item ganha um prazo novo de 3 dias; quem estava embaixo **continua vendo e trabalhando** o
item (subir é chamar ajuda, não tirar do Dirigente). No nível geral, vencido de novo, o aviso se repete no máximo 5 vezes.
O prazo é calculado na leitura (a fila mostra "vence em…" / "vencido há…" mesmo sem a rotina). Adiar o prazo é da
liderança, com motivo, até 30 dias, e fica no histórico.

**O trabalho no item.** Registrar contato (ligação, mensagem, visita no lar, visita no hospital, conversa no culto, outro;
se conseguiu falar; observação curta), concluir com um desfecho (integrado, segue acompanhado pela liderança, não
localizado, não quis contato, encaminhado, outro) e cancelar (duplicado ou engano, com motivo). **Toda visita presencial
registra quem foi junto**: o Regimento (Art. 85 §3º, I) proíbe o obreiro a sós com uma mulher que não é a esposa, e o
cadastro não guarda o sexo — a regra vale para toda visita. O histórico é **só de acréscimo** (gatilho no banco).
Concluir um "membro afastado" como "não localizado" ou "não quis contato" mostra o caminho do abandono (v1.5), que segue
manual: a fila **não** abre procedimento de abandono sozinha.

**A detecção de afastamento (pelo padrão da própria pessoa).** Para cada membro ativo, a rotina junta as oportunidades
que o sistema conhece (aula da EBD da turma dele, com presença ou ausência; reunião encerrada em que ele era esperado) e
compara a **taxa de presença** de dois períodos: os ~6 meses de base e as **últimas 6 semanas**. Vira sinal quando a base
tem pelo menos 6 oportunidades com presença de **50% ou mais** (havia costume), as 6 semanas têm pelo menos 3
oportunidades e a taxa caiu **60% ou mais** (ex.: quem vinha 9 de 10 domingos e veio 1 de 6). Quem sempre veio pouco (1
domingo por mês = 25%) nunca é sinal. Fica de fora quem já está "sem comunhão", com abandono aberto, com item de
afastamento aberto ou encerrado há menos de 90 dias. No máximo 5 itens novos por congregação por dia (os de maior queda
primeiro), para a fila não amanhecer entupida. O item diz o porquê em números ("EBD e reuniões: antes 9 de 10; nas
últimas 6 semanas 1 de 6") e nunca vira abandono por conta própria. Os parâmetros (6 semanas, 50%, 60%) ficam em
Catálogos → Prazos.

**Notas pastorais com três níveis.** *Equipe* (a "pública" do plano: a liderança e o responsável de um item aberto da
pessoa), *Liderança local* (só a liderança com a permissão no território, nunca o responsável voluntário) e *Somente
pastor* (só quem escreveu e quem, na liderança que alcança a pessoa, tem o cargo de **Pastor** no cadastro; abrir pede a
confirmação reforçada). A nota é sobre um membro (ou, para o visitante, sobre o item) e **não se edita**: corrige-se com
outra nota que aponta a anterior. A lista mostra só o que a pessoa pode ler (as notas que ela não pode ler não aparecem,
nem a contagem); o texto só sai ao **abrir**, e **cada abertura fica registrada** (quem e quando, nunca o conteúdo); quem
escreveu e o nível geral veem quem leu. Nenhum aviso, auditoria ou log leva o texto. **Regimento Art. 132 §2º, II:** as
anotações pastorais são eliminadas na saída do membro — a rotina diária apaga as notas de quem saiu (carta, abandono,
desligamento) há mais de 30 dias ("regra dos 30 dias") e a exclusão LGPD as apaga na hora. A Diretoria não lê nota de
nível "somente pastor" por ser Diretoria: só se tiver o cargo de Pastor. Em Meus Dados, a própria pessoa vê **quantas**
notas existem sobre ela e de quando, não o texto (o mesmo critério da v7.5 para texto escrito por outros sobre a pessoa;
o texto pode ser pedido ao Encarregado).

**Pedidos de oração, moderação e o boletim.** O membro pede pelo Meu Painel (por ele ou por outra pessoa), escolhe o
assunto (saúde, família, trabalho, luto, vida espiritual, gratidão, outro), escreve o pedido e diz se ele **pode ir ao
boletim sem nome** ou é **só para a liderança**, e se quer que alguém da liderança fale com ele (aí nasce um item da
fila). A liderança também registra o pedido recebido em mãos. **Nada vai ao boletim sem moderação**. O boletim **nunca
leva o texto do pedido**: leva uma linha anonimizada gerada pelo assunto e pela congregação ("Alguém da Congregação Vila
Nova pede oração pela saúde."), que o moderador pode reescrever (até 200 caracteres) — e a reescrita que contém o nome de
quem pediu é recusada. A linha aprovada fica 14 dias no boletim, que a liderança imprime e que o membro vê no Meu Painel
(só as linhas da própria congregação). O mural de oração do **site** é outro lugar (Directus, moderado pela Diretoria); o
confidencial e o com sinal de risco que chegam por ele entram na fila desde a v7.11.1 (abaixo).

**Sinal de risco, fora da fila normal.** Todo texto livre que um membro manda (pedido de oração, pedido de visita) passa
por uma lista de expressões de **autolesão** (ex.: "quero morrer", "me matar", "me cortar") e de **violência** (ex.: "ele
me bate", "abuso", "ameaça de morte", "medida protetiva"); a lista ignora acento e maiúscula e prefere errar para mais. Com
sinal, o pedido **não entra na moderação comum**: vira item **urgente** (prazo de 24 horas) e o aviso obrigatório sai
**na hora** (e-mail e push) para o Dirigente, o Pastor de Área, o Superintendente e o nível geral — o aviso diz só "um
pedido com sinal de risco chegou na congregação X", nunca o texto. Quem pediu lê, na hora, os telefones **188** (CVV, de
graça, 24 h), **190**, **180** (Central de Atendimento à Mulher) e **100**; e só lê "a liderança foi avisada" se o aviso
saiu do app de verdade (a regra da Trava 7-B). Se o texto fala de **criança** junto com violência, o aviso manda registrar
na Proteção de crianças (v7.8). A liderança pode **marcar** risco num pedido que a lista não pegou (mesmo aviso) e
**desmarcar** um alarme falso, com motivo (o pedido volta para a moderação comum); nada disso apaga o registro.

**Avisos.** *Você é o responsável* (na hora, a quem é nomeado por outra pessoa); *resumo do dia* (às 7h, a cada
responsável com item novo, vencendo em 24 horas ou vencido); *subiu de degrau* (às 7h, a quem está no degrau novo);
*pedidos esperando moderação* (às 7h, à liderança da congregação); *sinal de risco* (na hora, obrigatório, não se
desliga). Nenhum leva nota nem texto de pedido; o do responsável leva o **primeiro** nome da pessoa acompanhada (ele precisa
saber quem procurar) e nunca o tipo (ver as emendas).

**Guarda e LGPD.** Os itens encerrados ficam 5 anos e depois perdem a identificação (nome, contato, motivo e observações
do visitante e do membro; a contagem sobrevive); o pedido de oração perde o texto em 1 ano (5 anos se teve sinal de
risco, como prova de que a Igreja agiu); as notas seguem a regra dos 30 dias acima. ROPA e RIPD ganham "Cuidado pastoral"
(a RIPD de "nota pastoral", que estava "N/A — entra quando o módulo existir", passa a valer). A auditoria guarda só ids e
códigos: nunca texto de nota, de pedido, nem a categoria de risco.

**Fora desta versão (por decisão):** lembrete de hora em hora (o prazo mais curto é de 24 horas para o risco, e esse aviso
sai na hora). **Decidido NÃO fazer (responsável da Igreja, 21/10/2026):** registrar a presença de cada pessoa nos cultos — o
trabalho de catalogar quem vai a cada culto não compensa; o detector de afastamento fica com a EBD e as reuniões. **Decidido
fazer (21/10/2026), logo depois desta versão:** ligar o mural de oração do site à fila — o pedido confidencial ou com sinal de
risco que chega pelo site entra no cuidado pastoral (com o aviso na hora, no risco), e quem escreve vê o 188 e o 190 na própria
página.

### Emendas ao contrato (21/10/2026) — depois da revisão adversarial independente do servidor

Uma revisão independente (só leitura do código e reproduções no banco local) achou **2 críticos, 7 altos, 6 médios e 8
baixos**. Tudo foi corrigido, com teste que falha no código de antes (jest e o roteiro `e2e-27` no SQL Server local). O
que o contrato precisou mudar:

- **A lista de risco pegava pouco (crítico).** Só a forma "me bate"; "ele bate em mim", "abusa da minha filha", "eu me
  mato", "não quero viver", "quero sumir", "tomei veneno", "me deu um soco" passavam. A lista foi ampliada (verbos sem o
  pronome, terceira pessoa, abuso de criança, envenenamento) e o teste traz as frases de um lado e de outro.
- **O pedido de socorro nunca é recusado (crítico).** Com sinal de risco, o pedido passa do limite do dia e, se a pessoa
  já tem um pedido de visita aberto, **esse** vira urgente (antes: "você já tem um pedido", e nenhum aviso). O pedido de
  visita com risco também vai para a aba do risco (onde a liderança lê o texto e pode desmarcar o alarme falso).
- **Violência que cita a liderança fica só com o nível geral.** Se o texto fala de violência e cita alguém da igreja (o
  pastor, o dirigente, um obreiro, o professor da EBD) ou o nome de alguém da liderança do território, o caso nasce **no
  nível geral, sem responsável**, o aviso vai só à Diretoria e quem foi citado pelo nome não recebe nada; o Dirigente e a
  Área não veem o pedido nem o item.
- **Desmarcar o risco e cancelar um acompanhamento urgente são da Área para cima** (dois olhares; o Dirigente pode ser o
  citado). O urgente que sobe de degrau continua com 24 horas a cada degrau.
- **Quem muda de congregação some da antiga na hora** (Regimento Art. 132 §1º, II): o item, as notas e os pedidos dele
  deixam de aparecer para a congregação antiga no mesmo instante; na rotina da manhã o item aberto **passa** para a
  congregação nova (o mesmo tipo e urgência, o Dirigente de lá como responsável, com aviso). Antes, a rotina só fechava o
  item, e até lá o Dirigente antigo lia as notas que o novo escrevia.
- **Licença não é saída.** A regra dos 30 dias vale só para quem foi **desligado do rol com data de saída** (carta,
  abandono, desligamento); a licença de candidatura e outras situações não apagam notas nem encerram itens.
- **O responsável voluntário só vê o item aberto**; o encerrado fica em Meu Painel só como lembrança (tipo, primeiro nome,
  desfecho). O contato da pessoa só aparece com o item aberto.
- **O item nunca fica sem quem receba.** Sem Dirigente, ou quando o Dirigente é a própria pessoa acompanhada, o item nasce
  no degrau de cima que tem gente, que é avisado na hora.
- **A fila é territorial de verdade.** O filtro do território vai **no banco**, antes do limite de 400 (antes, numa igreja
  grande a fila do Dirigente podia vir vazia); a concessão de **Extensão** e a de **Departamento** não operam a fila (quem
  cuida da Extensão é o Dirigente da congregação-mãe); o painel não conta o item sobre quem olha.
- **Notas.** A correção nunca rebaixa o sigilo (a de "equipe" não corrige a "somente pastor") e não revela a nota que a
  pessoa não lê; quem escreveu lê a própria nota **enquanto alcança a pessoa**; o nível geral vê **quem** leu qualquer nota
  (sem ler o texto, se não for pastor); a nota sobre quem não é do cadastro sai 1 ano depois que o item encerra.
- **Boletim.** Aprovar só o que espera moderação (o que já foi publicado pode ser **tirado** do boletim, não reescrito);
  a linha recusa também nome de duas letras ("Zé"), nome partido por caractere invisível e diagnóstico ("câncer", "UTI").
  Todo texto livre recusa caractere de controle ou invisível.
- **Meus Dados e Meus pedidos** não mostram o texto do pedido que teve sinal de risco (num celular da família, "meu marido me
  bate" reaparecendo é perigo; o texto sai pelo Encarregado) e contam só os acompanhamentos **já encerrados**.
- **A sonda do cadastro foi fechada:** nomear como responsável alguém de fora do território responde sempre "Pessoa não
  encontrada".
- **Anonimização sem sobra:** some também quem criou o item (o próprio titular, no pedido dele) e quem agiu no histórico.
- **Banco:** a marca de purga das notas é ligada, usada e desligada num **lote só** (com TRY/CATCH: nunca volta ao pool
  ligada); uma rodada de purga por vez (a corrida no banco real dava deadlock); o item aberto é conferido antes de gravar,
  com trava de faixa (não pelo erro do índice único dentro da transação); o vínculo pedido↔item é único só para o item
  aberto; índices novos para a fila, o painel e a detecção no banco de 5 DTU; o lembrete no topo é limitado a 5 no banco.
- **Texto do contrato corrigido:** o aviso "você é o responsável" leva o **primeiro nome** e nunca o tipo (pós-internação
  diria a doença num e-mail); a auditoria tem o código do ato (marcado/desmarcado), nunca o tipo do risco.

### v7.11.1 — o mural de oração do site entra no cuidado pastoral (22/10/2026)

Decidido pelo responsável em 21/10/2026 ("mais compensativo" que a presença no culto, que não se fará).

- [x] **O envio do mural passa pelo servidor do site** (`site/api/EnviarPedidoMural`, `/api/enviar-pedido-mural`): antes o
      navegador gravava direto no Directus. A Function grava o pedido em `mural_oracao` (aguardando moderação, como sempre)
      e avisa o sistema, servidor a servidor, com a chave combinada `CHAVE_SITE_SISTEMA`. Limite de 10 envios por IP em 5
      minutos, campo-isca contra robô, autorização (LGPD) obrigatória, texto até 500 e nome até 80 letras.
- [x] **O sistema confere o sinal de risco** (`/api/cuidado-pastoral-site`, a mesma lista de expressões do cuidado
      pastoral). O pedido comum **nem abre o banco** do sistema (segue só no site). O **confidencial** e o **com risco**
      entram em `PedidosOracao` com origem `SITE`, **sem congregação** (o site não sabe), **só para o nível geral**, nunca
      boletim. Com risco, o aviso obrigatório sai **na hora** ao nível geral (Presidente e Secretário Geral), sem o texto.
      A rota **falha fechada**: sem a chave configurada no sistema ninguém entra (401). O mesmo texto reenviado em 10
      minutos é o mesmo pedido; teto de 30 pedidos por hora (60 com risco) contra inundação.
- [x] **Com risco, o pedido nunca vai ao mural público:** o site o marca como confidencial no Directus (a moderação não
      tem "Aprovar" para confidencial), e quem escreveu vê na hora, em destaque, o **190** e o **188** (CVV). O 188 e o
      190 aparecem também, discretos, embaixo do formulário, sempre.
- [x] **Se o sistema não responder**, o pedido fica no Directus como antes (ninguém perde o que escreveu).
- [x] **Na tela do cuidado pastoral** (só o nível geral vê): selo "Veio do mural de oração do site"; não vai ao boletim,
      não abre acompanhamento (não há congregação nem contato); dá para marcar como lido e marcar o sinal de risco (avisa
      o nível geral de novo). Os confidenciais do site que esperam leitura entram no aviso das 7h ao nível geral.
- [x] **Banco (migração 149):** `Origem` (`SISTEMA`/`SITE`) e `SiteItemId`; `CongregacaoId` aceita vazio **só** no pedido do
      site (CHECK); a origem e o número do item do site não mudam depois (gatilho); a guarda (1 ano; 5 com risco) vale
      igual.
- [x] **Provas:** jest (rota, recebimento, tela), roteiro da tela 660/0, `site/scripts/testes/mural-unidade.cjs` (envio do
      site, sem rede) e `e2e-28` no SQL Server local (41/41, inclusive a migração aplicada duas vezes). Um defeito achado na
      prova: a marcação à mão de risco num pedido do site usava a mesma referência de aviso do aviso automático (pedido 5
      marcado = 51 = pedido 51 com risco) e calaria o aviso do outro; agora cada um tem a sua (o teste falha no código antigo).
- [ ] **Depois de uma semana no ar:** tirar do Directus a permissão pública de **criar** em `mural_oracao` (hoje ainda
      aberta, para quem estiver com a página antiga no cache do navegador).

## v7.12 — Comunicação: consentimento granular e envio segmentado *(7ª rodada)*

A vB.2 constrói o motor de notificação. Esta versão trata da parte jurídica e da
segmentação — no Brasil, WhatsApp sem opt-in registrado é risco de LGPD e de
bloqueio pela própria Meta.

**Decisões do responsável da Igreja (22/10/2026):** **sem WhatsApp e sem SMS** nesta versão (são pagos por mensagem;
mantém a decisão de 14/09 da vB.2) — o consentimento já nasce com esses canais previstos, para ligar depois sem refazer
nada; e **nenhum grupo de envio escolhido pelo dízimo** ("dizimistas inativos" saiu do plano: ninguém recebe ou deixa de
receber mensagem pelo que dá).

- [x] **Consentimento por canal E por categoria** (e-mail e celular × convocação oficial, eventos, devocional,
      financeiro), com origem, data, o **texto exato aceito** (versão e impressão digital do texto) e o endereço de quem
      aceitou. O membro pode sair de "eventos" e continuar recebendo **convocação oficial**, que é obrigação estatutária
      de comunicação, não marketing.
- [x] **Saída com um toque** e bloqueio de envio sem consentimento vigente. Sem WhatsApp/SMS não há palavra-chave a
      receber: o equivalente é o link "não quero mais receber" em todo e-mail que não é convocação, com registro (o
      cabeçalho de descadastro de um clique ficou de fora: o serviço de e-mail do Azure não garante aceitá-lo, e um
      cabeçalho recusado pararia todos os e-mails).
- [x] Modelos de mensagem **versionados e aprovados**: só se envia um modelo aprovado; o aprovado não se edita (corrigir
      é criar a versão seguinte).
- [x] **Segmentação dinâmica por consulta viva**, não lista estática: território (congregação, área, região), cargo
      ministerial, departamento, liderança ativa, professores de EBD, formação vencida ou vencendo, voluntário com
      habilitação vencendo e os elegíveis de uma sessão da Assembleia. A lista é calculada na hora do envio.
- [x] Registro de entrega/leitura e relatório de alcance — saber se a convocação oficial de fato chegou é questão de
      validade do ato, não de curiosidade.

### Entrega (22/10/2026)

Migração 150; `shared/comunicacao.js` (regra pura), `shared/comunicacaoDb.js`, `shared/comunicacaoFilaMarca.js`; rotas `GestaoComunicacao` (`/api/comunicacao/<ação>`),
`ComunicacaoSair` (o link do e-mail, sem login) e `ComunicacaoFila` (a rotina de 15 em 15 minutos, `rotinas-comunicacao.yml`); a rodada das 7h aplica a retenção e
regrava a marca da fila, mas não manda a fila (texto alinhado ao código na Trava 7-C). Janela real da fila (Trava 7-C): das 6h às 22h45 de Brasília a fila
inteira; das 23h às 5h45 só o aviso de crise, abrindo o banco só se a marca do Storage disser que há crise na fila. Tela: Meu Painel → Comunicações e a aba Comunicados (`app/modulos/comunicacao.js`), a página `sair.html`, casca v37. A exclusão LGPD passou a apagar
também as preferências de aviso e os aparelhos inscritos (antes ficavam); Meus Dados mostra o histórico do consentimento; ROPA ("Comunicação com os membros") e RIPD
("Comunicação com os membros") novos.

**Provas:** jest (regra pura, marca da fila, rotas, exclusão LGPD, varredura de rotas), `e2e-29` no SQL Server local (98 verificações: esquema,
consentimento, ficha, modelos, grupo, fila com as cotas e a prioridade da convocação, 429, tempo esgotado e erro no meio que devolvem à fila, cancelamento,
convocação, saída, retenção e LGPD), `e2e-30` (corridas e escala: seis rodadas da fila juntas nunca mandam o mesmo e-mail duas vezes e respeitam o teto da hora;
sem a trava da rodada o teste falha com 22 e-mails num teto de 12; um envio a ~4.900 pessoas grava em blocos; mais de 5.000 é recusado) e a prova da tela
`tools/front-comunicacao` (417 verificações; 26 falham na tela de antes das correções). Defeitos achados nas provas: o SQL Server recusa `OUTPUT` sem `INTO`
numa tabela com gatilho (a fila não andava) e a recusa "o texto mudou" perdia o sinal que manda a tela recarregar; a prova da tela achou 5 na tela (aba que dizia
"sem acesso" quando o catálogo não carregava, pílula do nível geral que ficava para o login seguinte, grupo apagado ao guardar outro, "Enviar" religado sem
contagem, motivo apagado na releitura).

**Revisão adversarial independente (22/10/2026), 2 altos, 11 médios e 15 baixos, todos corrigidos:** o direito a voto filtra antes do corte de 5.000 (antes a
convocação podia sair incompleta sem aviso); a ficha em papel é só do nível geral, com a referência da ficha e a confirmação reforçada, e não vence o que a pessoa
marcou depois da data dela; a convocação passa na frente na fila; o 429 do e-mail volta na hora (o SDK repetia esperando minutos); o tempo é conferido a cada
mensagem e o que não foi tentado volta à fila; a rodada das 7h só faz a retenção; o envio grava em blocos; o teto da hora soma os avisos do sistema (padrão 60);
"direito a voto" só para o nível geral (cruza com a disciplina); a retenção e a exclusão alcançam o aviso do sininho; quem não tem data de nascimento fica fora
(salvo na convocação) e o menor não autoriza sozinho; aprovar confere a impressão digital do texto lido; a marca da fila não volta atrás (versão e ETag); e os
baixos (chaves herdadas, território em texto, saída de quem foi excluído, a prova da convocação guardada na exclusão, cancelado que não é "o mesmo",
"mostrando 500 de N", celular que falha × sem aparelho, Meus Dados completo, mensagem das regras, `$` no nome, data inexistente, limite de mudanças e de
contagens, base legal editada que a migração não sobrescreve, ficha de quem não tem congregação, e-mail fora do log).

**Depende de gente (fora do código):** pedir ao suporte do Azure o aumento do limite de e-mail (hoje 100 por hora; o pedido é de graça e leva até 72 horas) quando os
comunicados passarem de algumas centenas de pessoas; depois, subir `COMUNICACAO_EMAILS_POR_HORA` em Catálogos → Prazos.

### Contrato (22/10/2026)

**Canais e categorias.** Canais externos: **e-mail** e **celular** (o aviso do aplicativo instalado); WhatsApp e SMS
existem no banco, sem envio. O **sininho** do sistema não é canal externo: todo comunicado aparece lá para quem está no
grupo. Categorias: **Convocação oficial** (assembleias e reuniões estatutárias), **Eventos**, **Devocional** e
**Financeiro** (prestação de contas e campanhas).

**Consentimento.** É **pedido, não presumido**: sem um "sim" registrado, o e-mail e o celular daquela categoria não
recebem (o sininho recebe). O membro marca em **Meu Painel → Comunicações**, lendo o texto exato de cada categoria; a
Secretaria pode registrar o "sim" ou o "não" que a pessoa deu numa **ficha em papel** (com a data da ficha). Cada
mudança é uma linha nova (o histórico não se apaga). A **convocação oficial** vai por todo canal que a pessoa tiver,
com ou sem consentimento, e nunca tem o link de saída; isso está escrito na tela.

**Modelos.** Título (até 150) e texto (até 2.000), com dois campos que o sistema preenche: `{{primeiro_nome}}` e
`{{congregacao}}`; nada de HTML. Criar e aprovar modelos é do nível geral (o modelo é a voz da Igreja); a convocação
oficial só sai pelo nível geral.

**Grupos.** A liderança com a permissão nova **comunicacao** monta o grupo pelos critérios acima e vê **quantas pessoas**
ele tem antes de enviar (e quantas de cada canal receberão); o grupo é sempre cortado pelo território de quem envia.
Ficam de fora: quem não está ativo, menores de 18 anos (o comunicado ao menor vai pelos responsáveis, fora desta
versão) e quem pediu a exclusão dos dados. Grupos podem ser guardados com nome para reusar; a lista é refeita a cada
envio.

**Fila e limite do e-mail.** O serviço de e-mail do Azure manda, no domínio da Igreja, **30 por minuto e 100 por hora**
(o aumento é pedido de graça ao suporte e leva até 72 horas). Por isso: sininho e celular saem **na hora**; os e-mails
vão por uma **fila** que manda uma parte a cada 15 minutos (o número por rodada é ajustável em Catálogos → Prazos). A
rotina só abre o banco quando há fila (uma marca guardada no Storage, como a da proteção). Um e-mail nunca é mandado
duas vezes: o que travar no meio vira "falhou", não é repetido sozinho.

**Entrega e leitura.** Por pessoa e por canal: aceito pelo serviço, falhou, sem consentimento, sem e-mail, sem aparelho,
cancelado. Leitura = abriu no sininho; na convocação oficial, a pessoa ainda pode tocar **"Recebi a convocação"** (a
ciência fica registrada). Não há "pixel" de leitura no e-mail (privacidade). O **relatório** do envio mostra os números e,
na convocação, a lista de quem **não foi alcançado** por canal nenhum nem leu, para a Secretaria procurar por telefone.

**Guarda e LGPD.** O registro de entrega perde o nome em 1 ano (5 anos na convocação oficial, prova do ato); o
histórico de consentimento fica enquanto a pessoa estiver no cadastro e sai na exclusão LGPD (que também passa a apagar
as preferências de aviso e os aparelhos inscritos). Meus Dados mostra os consentimentos e os comunicados recebidos.
ROPA e RIPD ganham "Comunicação com os membros".

## v7.13 — Eventos, inscrições e congressos *(7ª rodada — expande v7.4)*

**Decisões do responsável da Igreja (22/10/2026).** (1) **Tudo no site**, ampliando o que já existe (inscrição, faixas, cupom,
vagas, QR, crachá): um seminário em novembro é o maior uso, as inscrições abrem em 1 a 2 semanas e não se aceita o risco de
mudar de lugar agora; levar inscrições e camisetas para o sistema fica para a **Fase 10** (integração total, com o site virando
só conteúdo). (2) **Pagamento:** continua manual, mas a pessoa **informa o pagamento** e a equipe confere no extrato e confirma;
"cada inscrição vira uma conta a receber" está **errado** (não se faz). O **Pix online pela conta da Igreja no banco Cora** foi
aprovado pelo Presidente (cerca de R$ 1 a 2 por Pix e R$ 50 por mês), mas fica **parado** até a análise de segurança que o
responsável está fazendo (DNSSEC no domínio, cuidado com o CPF que a Cora exige, valor mínimo de R$ 5). (3) **Hospedagem e
transporte por congregação: fora** — no campo todos vão juntos; só faria sentido num evento fora ou numa convenção recebida
(Fase 10).

- [x] **Lotes de inscrição** (preço, vagas e público): cada faixa de valor do evento ganha, opcionais, a data em que deixa de
      valer ("1º lote até 05/11") e o número de vagas daquele lote; o público é o próprio rótulo ("Membro", "Visitante",
      "Jovem"). Lote vencido ou esgotado não aparece para escolher; o esgotado só é recusado DENTRO da trava de vagas (a mesma
      senha do livro do evento), com o aviso "escolha o lote seguinte" — o limite geral de vagas continua mandando para a lista
      de espera, sem recusar ninguém.
- [x] **Informar o pagamento:** na página da inscrição (código + telefone) e em **Minha Conta → Meus eventos**, a pessoa diz
      a data, o meio (Pix, transferência, dinheiro, outro), o valor e o nome de quem pagou; o mesmo para o pedido de camiseta.
      Não precisa mandar comprovante: a equipe confere no extrato. No painel do evento aparece o filtro "Pagamento informado,
      a conferir".
- [x] **Confirmar com nome e hora:** marcar "pago" (e desmarcar) passa a guardar quem confirmou e quando; **cortesia ou
      isenção** só com o motivo e o nome de quem autorizou (a inscrição de cortesia sai da conta de "a receber" e do filtro
      "não pagos"). O total recebido do evento continua indo, à mão, para o caixa do evento no sistema (v7.4).
- [x] **Credenciamento por sala ou ala:** cada local de credenciamento do evento pode ter capacidade; a tela de check-in
      mostra quantas pessoas entraram em cada local e avisa ao passar da capacidade; cada entrada fica registrada (quem, em
      que local, a que horas, por qual equipe) — a mesma pessoa pode entrar em mais de um local. **Relatório de ausentes**
      (quem se inscreveu e não veio), por lote e por tipo, para imprimir — insumo para dimensionar o próximo evento.
- [x] **Crachá configurável:** cada inscrição tem um **tipo de participante** (Participante, Preletor, Equipe, Imprensa,
      Convidado — o organizador muda), e o evento escolhe o que vai no crachá: nome, tipo, igreja/congregação (da resposta a
      uma pergunta do evento), cidade, e o **QR do credenciamento** (o mesmo código do check-in, para entrar mais rápido).
- [x] **Aviso contra golpe** (pedido do responsável, 22/10/2026) em toda tela do site que fala de pagamento: a Igreja não entra
      em contato com ninguém pedindo pagamento ou Pix; pague só pelos dados mostrados no site e, se receber um pedido assim,
      avise a Secretaria. O pagamento continua só informado até a v10.8.

### Entrega da v7.13 (22/10/2026)

No site (Directus + `site/api`): `lotes.js` (o lote é contado dentro da trava de vagas, lido depois da última senha; a escolha do lote é
obrigatória quando o evento tem lotes), `InformarPagamento` (código + telefone, conta ou telefone do pedido; nunca marca pago),
`PainelInscricao` (pago, cortesia e tipo com quem e quando tirados do token; "registro divergente" quando alguém muda direto no
Directus), a coleção `evento_entradas` (uma entrada por pessoa, local e dia), o relatório de ausentes, o crachá com tipo, igreja,
cidade e QR (só a resposta original da inscrição) e o aviso contra golpe em 5 telas. Esquema aplicado em produção pelo script
repetível `site/scripts/directus-eventos-v713-esquema.mjs` (simulado antes; a segunda rodada não criou nada; nenhuma permissão
pública nova). Provas: testes de unidade (lotes 77, pagamento 135, credenciamento 46, esquema 17), bateria na réplica local do
Directus (49, com 40 inscrições ao mesmo tempo num lote de 10: entram exatamente 10) e a bateria do site em homologação e produção.
Revisão adversarial independente: 1 alto (inscrição sem lote pulava o preço), 4 médios e 13 baixos, todos corrigidos, cada um com
teste que falha no código de antes. Limite da licença do Directus: não dá para fechar o campo "pago" campo a campo nem separar por
evento; o painel mostra o registro divergente e o registro de atividade do Directus é a prova.

**Fora desta versão (por decisão):** pagamento online (Pix Cora: v10.8, depois da segurança do domínio da v10.7); hospedagem e transporte
(v10.6); levar as inscrições para o sistema (v10.6).

## v7.14 — Identidade Visual Anual *(gap da varredura normativa)*

O Art. 159 descreve um processo participativo com calendário rígido, critério de
originalidade e consequência financeira — nada disso tem onde existir hoje.

**Decisões do responsável da Igreja (22/10/2026).** (1) A lista dos temas já usados desde 2006 **não existe** no sistema: a
versão traz a tela "Temas já usados" e a Secretaria cadastra (até lá, a triagem confere à mão). (2) **Vota todo membro apto e
em comunhão, pelo Meu Painel** (matrícula e PIN; quem não tem acesso vota com a ajuda da Secretaria). (3) **Pedidos de
uniforme: fora** — a camiseta do ano já é pedida e tratada na aba Camisetas do site (o membro ou um responsável pede; o
Dirigente avisa e entrega); o item "pedido do Dirigente vira conta a pagar" não se faz.

**Decisão de 23/10/2026: não há prazo de 1º/11.** O processo deste ano (identidade de 2027) está sendo feito **fora do
sistema**; o primeiro ciclo no sistema será o de **novembro de 2027 (identidade de 2028)**. O ciclo do ano é **aberto pela
Diretoria** quando ela quiser (até 15/11 daquele ano): o sistema não cria ciclo sozinho e não mostra etapa de um ciclo que não
foi aberto. O tema de 2027, escolhido fora, a Secretaria cadastra em "Temas já usados".

- [x] **Calendário do processo** (Art. 159 §1º): sugestões de 01 a 15/nov → triagem de 16 a 21/nov → votação de 22 a 30/nov
      → arte em dezembro (até 3 cores da Diretoria e concurso de arte dos membros) → escolha final até 31/12 por maioria
      simples dos presentes (no culto; o sistema registra o resultado). Cada etapa abre e fecha sozinha pela data de Brasília
      (calculada na hora, sem depender de rotina).
- [x] **Antiduplicidade desde 2006**: a tela "Temas já usados" (ano e tema; o tema escolhido de cada ano entra sozinho). Na
      sugestão, o tema igual a um já usado (sem diferença de acento, maiúscula ou pontuação) é recusado na hora, e o parecido
      fica marcado para a triagem — a validação acontece antes da votação, nunca depois da arte pronta.
- [x] **Sugestões e triagem**: cada membro apto manda até 3 sugestões (frase curta, até 80 letras) e pode retirar a sua até o
      dia 15; na triagem, a Diretoria aprova como finalista (pode ajustar a redação, guardando a original) ou descarta com o
      critério do inciso I (curto e memorável, amplo e abrangente, originalidade).
- [x] **Votação reaproveitando o módulo de Enquetes** (v2.8): no dia 22 os finalistas viram uma enquete de toda a membresia
      apta, votada em **Meu Painel** (uma vez por pessoa); no fim do dia 30 ela fecha sozinha e o resultado é apurado.
- [x] **Arte e escolha final**: a Diretoria registra até 3 cores; membros mandam a arte (imagem) baseada nas cores; a
      Diretoria registra a escolha final do culto (arte + cor, data, votos), que vira a Identidade Visual oficial do ano
      seguinte e entra na lista de temas já usados.

**Fora desta versão (por decisão):** pedidos de uniforme (já são feitos na aba Camisetas do site).

### Entrega da v7.14 (23/10/2026; em produção desde 27/10/2026)

Migração 151 (só acréscimo): `IdentidadeCiclos`, `IdentidadeTemasUsados`, `IdentidadeSugestoes`, `IdentidadeCores`, `IdentidadeArtes`,
`IdentidadeResultados`, `Enquetes.DataFechamentoPrevista`, a permissão `identidade_visual` (Presidente e Secretário Geral; o servidor
exige o nível Geral — Art. 126-Q, II), 4 avisos à Diretoria (triagem começou, votação aberta ou que não abriu, apuração, fase da
arte; nenhum aos membros) e a retenção (1 ano depois do fim do ciclo, a sugestão e a arte perdem o nome e a imagem não escolhida
sai). Gatilhos: o ciclo só anda para a frente; no máximo 3 sugestões e 3 artes ativas por pessoa; texto único no ciclo; a cédula
congela quando a votação nasce; o resultado e o tema do processo não se editam; a cor em que já há arte não muda.
`shared/identidadeVisual.js` (regra pura: as etapas pela data de Brasília, o texto normalizado, igual e parecido, cores, imagem,
apuração), `shared/identidadeVisualDb.js`, rota `/api/identidade-visual/<ação>`, módulo `app/modulos/identidade-visual.js` (Meu
Painel → Identidade Visual e a aba Identidade Visual, no módulo Vida Eclesiástica) e Meu Painel → **Votações** (enquetes.js).

As Enquetes ganharam: a data de fechamento (lida na hora, conferida no próprio INSERT do voto pela hora do banco e encerrada pela
rotina diária), o voto que confere o público só da pessoa (antes relia o cadastro inteiro a cada voto), o segundo voto simultâneo
que vira "já respondeu" (antes, erro 500) e a votação do tema que não se encerra à mão.

Decisões tomadas na construção (o Regimento não fecha; ajustáveis):

- o primeiro ciclo que se abre no sistema é o da identidade de **2028** (o banco também recusa ano anterior);
- a votação abre sozinha no dia 22 só com **pelo menos 2 finalistas** (no máximo 10) **e a triagem completa**; com sugestão ainda
  sem decisão, a Diretoria é avisada todo dia e abre pelo botão, que pergunta "há N sem decisão, abrir assim mesmo?" (até o dia 30);
- **menos de 2 finalistas**: a partir do dia 22 (ou depois do dia 30 sem votação), a Diretoria pode definir o tema sem votação, com
  o motivo e a confirmação reforçada (fica registrado quem e por quê);
- **empate ou nenhum voto**: a Diretoria define o tema entre os mais votados **pela contagem gravada na apuração**, com o motivo;
- a triagem vê **só o texto** da sugestão (nunca quem mandou); as artes mostram o autor à Diretoria (para falar com quem desenhou);
- até **3 artes** ativas por pessoa (PNG ou JPEG, até 5 MB); a imagem é guardada **sem os metadados** (localização GPS, data,
  aparelho, textos embutidos); o membro retira a sua arte **até 24/12** e nunca depois do resultado; as cores podem ser registradas
  desde a triagem e não mudam depois que chega a primeira arte (acrescentar até 3 ainda pode); a Diretoria pode tirar do concurso a
  arte ilegível, com o motivo;
- o resultado do culto pode ser registrado depois de 31/12 (o culto pode ser a vigília), mas a data do culto tem de ser de dezembro;
  se a arte escolhida não veio pelo sistema, a Diretoria manda a imagem no próprio registro; registrado, não se edita;
- o tema só aceita letras do alfabeto latino (com acento), números e pontuação — texto com letra de outro alfabeto (que imita a
  latina e burlaria a recusa do igual) é recusado com mensagem clara; o limite de 80 conta como o banco (um emoji conta 2);
- os atos do membro (sugerir, retirar, mandar e retirar arte) ficam na auditoria **sem o nome e sem o número do registro**;
- confirmação reforçada (a chave do aparelho ou o código) em: abrir e cancelar ciclo, excluir tema usado, corrigir tema, abrir
  votação, tema sem votação, desempate, cores, recusar arte, resultado e qualquer decisão da triagem sobre finalista;
- "Temas já usados" aceita de 2006 ao ano que vem; o tema escolhido pelo processo entra sozinho e não se edita;
- exclusão LGPD: as sugestões e as artes perdem o nome; a sugestão que não foi finalista perde também o texto; a imagem não escolhida
  sai **quando o ciclo encerra** (até lá ela ainda pode ser a escolhida); ficam as contagens, os finalistas e a identidade escolhida.

Provas: jest 5.859 (141 arquivos; novos: a regra pura 52, a rota 22, as enquetes que fecham sozinhas 25); ponta a ponta no LocalDB `e2e-31`
(205: esquema e gatilhos, a porta, o ciclo de 2028 inteiro com o relógio da regra em novembro e dezembro de 2027, o ciclo de 2029 com
votação sem finalistas, botão, empate e desempate, LGPD, Meus Dados, retenção e lixo em cada campo) e `e2e-32` (21, corridas com
vários processos: 6 sugestões da mesma pessoa entram 3, o mesmo tema por 6 pessoas entra 1, uma enquete só com 4 acessos no dia 22,
4 votos da mesma pessoa viram 1, uma apuração só, no máximo 3 artes, um resultado só); prova de mutação no servidor (o igual que não
recusa, o voto duplicado que dava 500 e a apuração antes da meia-noite: cada uma acusada); `e2e-24`, `e2e-28`, `e2e-29` e `e2e-30`
seguem verdes. Tela `tools/front-identidade` (632 verificações; 3 defeitos da tela achados e corrigidos; prova de mutação 115: 107
acusadas, 8 equivalentes, nenhuma escapou) e as telas de antes (cuidado 870, comunicação 417, check-in 1.488, proteção 808,
menores 322) sem falha.

**Revisão adversarial independente (23/10/2026, sobre o commit 8b59841): 22 itens + 1 teste instável, todos corrigidos.** O membro
some da auditoria dos próprios atos (sugestão e arte, sem nome e sem número do registro); a enquete com fechamento marcado é
encerrada de verdade na primeira leitura depois da hora (resultado gravado, não só o rótulo; a ata também); o voto lê a enquete com
trava dentro do próprio INSERT e o encerramento marca ENCERRADA antes de contar (seguro com READ_COMMITTED_SNAPSHOT, o padrão do
Azure), e a apuração decide pela hora do banco; o "parecido/igual a tema já usado" é recalculado na triagem; letras de outro
alfabeto recusadas; emoji medido como o banco; confirmação reforçada nos atos da lista acima; a arte não some (retirada até 24/12,
LGPD só apaga a imagem quando o ciclo encerra); metadados (GPS etc.) tirados de PNG e JPEG sem dependência nova; ciclo só a partir de
2028 (também no CHECK); a votação não abre sozinha com sugestão sem decisão; tema sem votação e resultado com a imagem da Diretoria;
voto de várias perguntas numa transação e sem reler todas as respostas; o fechamento automático audita como o manual; cancelar ×
sugerir na mesma trava do ciclo; o login da tela igual ao do voto; desempate pela contagem gravada; o ajuste da redação não se perde;
só o erro do gatilho das cores vira aquela mensagem; na rotina diária, a falha da identidade não pula o passo da agenda pública, o
fechamento das enquetes é passo próprio e a retenção que apaga imagens vem depois dos avisos, com orçamento de tempo; o teste do PIN
ficou determinístico. Provas: jest **5.881** (143 arquivos), e 32 testes falham com os fontes de 8b59841; `e2e-31` **241**,
`e2e-32` **23** e o novo `e2e-39` **9** (READ_COMMITTED_SNAPSHOT ligado no próprio teste: o voto que estava sendo gravado entra na
contagem, máximo de 3 e tema único) — com o código antigo o `e2e-39` falha e as reversões dirigidas dos itens 4, 7, 11, 20 e 21
falham no `e2e-31`; os itens 17 e 18 são provados por corrida (não determinísticos contra o código antigo; o 18 já era coberto pela
trava da aplicação); `e2e-23` a `e2e-30` seguem verdes. Tela: 815 verificações (38 falhas com o módulo de antes), mutação 139:
131 acusadas, 8 equivalentes, nenhuma escapou; telas de antes sem falha.

**No ar.** Juntada à v7.15 no ramo (casca v40; a `e2e-33` da v7.14 virou `e2e-39`), com a bateria e2e inteira refeita do zero e as
sete provas de tela verdes. Homologação: migração 151 aplicada, rotas 401, teste de tela 1.085 ações iguais no computador e 151 no
celular, sem divergência (base aprovada em `d18db55`: só acréscimos — Votações e Identidade Visual no Meu Painel). Produção em
27/10/2026 (merge `1604e66`; reverter = `git revert -m 1 1604e66`): migração 151 aplicada, `/api/identidade-visual/*` 401 sem login,
casca v40.

## v7.15 — Gestão de crise e porta-voz único *(gap da varredura normativa)*

Base: Regimento Art. 161-B — em crise institucional, escândalo na mídia, acidente grave ou evento de repercussão pública
negativa, vale a Política de Porta-Voz Único: só o Pastor Presidente, ou um profissional de comunicação designado formalmente
por ele, fala em nome da IEADESPA (§ 1º); qualquer outro diretor, pastor, advogado ou membro fica proibido de dar nota,
entrevista ou opinião ligando o assunto à Igreja durante a crise (§ 2º). Trabalhada em paralelo com a v7.14 (por pedido do
responsável, 23/10/2026: as duas não têm nada em comum).

- [x] **Sinalizador institucional de "crise ativa"** (Art. 161-B §§1º-2º) com
      designação formal do Porta-Voz Único e aviso automático a **todos** os
      líderes sobre a vedação de manifestação individual enquanto durar o regime.
- [x] Registro de manifestações autorizadas e centralização das demandas de
      imprensa — quem falou o quê, quando e com autorização de quem.
- [x] Plano de emergência por congregação (evacuação, contatos), **registro de
      simulados** (data, participantes) e checklist de vistoria predial —
      conecta com AVCB (v4.24) e seguros (v4.16). *(Trava 7-C: as duas versões estão documentadas em
      `docs/pesquisa/mercado-e-norma-2026.md` — "v4.16 — Seguros institucionais" e "v4.24 — Obras, licenciamento e
      inauguração" —, não no plano da fase 4; o código está nas migrações 066_seguros_institucionais e 074.)*
      *(Brotherhood Mutual — violence response plan e disaster plan)*
- [x] Equipe de segurança por congregação com composição registrada.

### Contrato (23/10/2026)

**Crise.** Quem abre e encerra o regime de crise no sistema é o nível geral com a permissão nova `crise_gestao` (Presidente e
Secretário Geral), com a confirmação reforçada, registrando quem ordenou (o Presidente), o motivo em poucas palavras, o
alcance (todo o Campo) e o **Porta-Voz Único**: o próprio Presidente ou o profissional designado (nome, contato e o ato da
designação). Só uma crise ativa por vez; o histórico não se apaga. Ao abrir, **todos os líderes ativos** recebem na hora,
pelo sininho e pelo celular, o aviso obrigatório da vedação do § 2º (quem é o porta-voz, a quem encaminhar a imprensa) — o
e-mail vai pela fila da v7.12 (o serviço do Azure aceita 100 por hora), nunca disparado de uma vez. Ao encerrar, o aviso de
fim também sai. Enquanto a crise está ativa, a tela de toda a liderança mostra a faixa "Crise ativa — porta-voz único:
fulano".

**Manifestações e imprensa.** Registro das manifestações autorizadas (data e hora, canal — nota, entrevista, rede social,
coletiva —, quem falou, resumo, link ou documento, quem autorizou) e das demandas de imprensa recebidas (veículo, contato,
pedido, prazo, situação — recebida, respondida pelo porta-voz, recusada — e a resposta). Qualquer líder registra uma demanda
que chegou a ele (é assim que encaminha); só o porta-voz e o nível geral respondem e registram manifestação. Nada se edita
depois de registrado (correção = nova linha); o histórico fica.

**Segurança da congregação.** Com a permissão nova `seguranca_congregacao` (Dirigente, Pastor de Área e o nível geral, cada
um no seu território):

- **Plano de emergência** da congregação: rotas de evacuação e pontos de encontro (texto), contatos (Bombeiros 193, SAMU 192,
  Polícia 190, mais os da congregação), responsáveis; revisão anual (aviso quando vence).
- **Simulados**: data, tipo (evacuação, incêndio, primeiros socorros, violência), participantes (número), duração, o que
  correu bem e o que melhorar, quem registrou; aviso quando a congregação passa de 1 ano sem simulado.
- **Vistoria predial**: checklist periódico (extintores na validade, saídas desobstruídas, iluminação de emergência, quadro
  elétrico, acessibilidade…) com o resultado de cada item e as pendências; mostra a validade do **AVCB** (v4.24,
  `ImoveisSituacaoFiscal`) e se há **seguro vigente** (v4.16, `ApolicesSeguro`), avisando o que está vencido; aviso quando a
  vistoria passa de 6 meses.
- **Equipe de segurança**: membros adultos da congregação com a função (coordenação, brigada, primeiros socorros, portaria,
  estacionamento), desde e até quando; sai sozinho de quem deixa a congregação ou é desligado.

### Entrega (23/10/2026)

Migração 152 (só acréscimos; reaplicada duas vezes no banco local): `CriseRegimes` (um regime ativo por vez, garantido por índice único filtrado no
banco), `CriseHistorico`, `CriseManifestacoes`, `CriseDemandasImprensa`, `CriseDemandaRespostas`, `SegurancaPlanos`, `SegurancaSimulados`, `SegurancaVistorias`,
`SegurancaVistoriaItens` e `SegurancaEquipe`, com gatilhos que só deixam acrescentar (correção é linha nova; simulado e vistoria errados são anulados, uma vez, com o
motivo); as permissões `crise_gestao` (Presidente e Secretário Geral) e `seguranca_congregacao` (Dirigente, Pastor de Área e o nível geral); os prazos da segurança em
Catálogos → Prazos (plano 365 dias, simulado 365, vistoria 180); os avisos do sininho (`SEGURANCA_*` e o pedido da imprensa `CRISE_DEMANDA_IMPRENSA`); a retenção (o
contato do jornalista sai em 5 anos; o nome de quem saiu da equipe, em 5 anos ou na exclusão LGPD); o ROPA ("Crise e segurança"). Código: `shared/criseSeguranca.js`
(regra pura), `shared/criseSegurancaDb.js`, rota `GestaoCriseSeguranca` (`/api/crise/<ação>`), a rotina diária dentro de `NotificacoesAgendador` (a equipe de quem saiu e
a retenção), Meus Dados e a exclusão LGPD. Tela: a faixa "Crise ativa — porta-voz único: fulano" no alto de toda tela da liderança e a aba **Crise e segurança**
(`app/modulos/crise-seguranca.js`), aberta a toda sessão de liderança; casca v39.

**Decisões tomadas na construção (o contrato não fechava):**

- **O aviso da crise é um comunicado do sistema.** Uma categoria nova na comunicação da v7.12, `CRISE`, marcada como do sistema: não aparece na tela de modelos, nas
  preferências nem na prévia; não se reenvia, não se arquiva nem se cancela pela tela de comunicados. Abrir, trocar o porta-voz e encerrar gravam, na MESMA transação do
  ato, o modelo já aprovado, o envio, as entregas e o sininho (regra `COMUNICADO`, obrigatória); o celular sai em paralelo dentro da resposta do ato (emenda da
  revisão independente, abaixo; o que não couber sai pela fila de 15 minutos, também de madrugada desde a Trava 7-C); o e-mail
  vai pela fila (passa na frente da convocação oficial e respeita o teto da hora). Ela se comporta como a convocação oficial: sem consentimento e sem link de saída,
  ciência "Li o aviso", lista de não alcançados no relatório, 5 anos de registro e fica na exclusão LGPD (prova do aviso). O aviso velho que ainda estava na fila é
  cancelado quando o porta-voz muda ou a crise acaba (o novo vai a todos). Botão "Continuar o aviso agora" para mais uma rodada.
- **O motivo nunca vai no aviso nem na faixa** — fica só com o nível geral (o aviso diz quem fala, o contato e a vedação do § 2º).
- **(Trava 7-C) O que o regime no sistema é.** O Art. 161-B diz que a política se ativa automaticamente diante da crise: a proibição de falar vale
  ANTES do registro, e o regime no sistema é a **formalização** (quem ordenou, o porta-voz, o aviso, o histórico). O aviso vai à **liderança**; a
  vedação do § 2º vale para **todo membro**, e a tela da crise lembra que, para avisar os membros, usa-se Comunicados (v7.12). O rodapé do
  aviso diz "por decisão da Igreja, com base no Art. 161-B" (o artigo não manda avisar a liderança: é decisão da Igreja). O teto de e-mails do
  aviso é lido da configuração (`COMUNICACAO_CRISE_EMAILS_POR_HORA`), não fixo no texto.
- **(Trava 7-C) Sem RIPD próprio da v7.15:** o RIPD é para dado sensível ou de criança em escala, ou tratamento cujo vazamento expõe a pessoa a
  dano grave; a crise guarda dado comum (quem fala pela Igreja, o contato do jornalista, a equipe de segurança), e o aviso é um comunicado do
  sistema já coberto pelo RIPD "Comunicação com os membros". O critério ficou escrito no topo de `api/shared/ripd.js`.
- **Trocar o porta-voz também avisa toda a liderança** (é a quem encaminhar a imprensa) e pede a confirmação reforçada, como abrir e encerrar.
- **Quem ordenou é o Presidente cadastrado na Liderança**: sem Presidente ativo, o regime não abre. O profissional designado pode não ser membro (sem matrícula); se
  tiver matrícula, o nome vem do cadastro e ele, numa sessão de liderança, registra manifestação e responde a imprensa enquanto for o porta-voz.
- **Todo líder ativo recebe o aviso**, inclusive quem não tem data de nascimento no cadastro (como a convocação); no encerramento, também quem recebeu o aviso e deixou a
  liderança no meio.
- **O pedido da imprensa fora de crise também se centraliza** (vai à Presidência); na crise, ao porta-voz. O pedido chega na hora (sininho e celular) a quem tem
  `crise_gestao` no nível geral e ao porta-voz.
- **Os avisos da segurança vão só ao sininho** do Dirigente e do Pastor de Área (um por regra, por pessoa, juntando as congregações; repete uma vez por mês e quando mais
  uma congregação entra na lista). Sem e-mail de partida: o e-mail direto do motor passaria dos 100 por hora do Azure num mês com muitas congregações atrasadas. O nível
  geral acompanha pelo painel. "Nunca registrado" conta como vencido.
- **AVCB e seguro** vêm dos imóveis da congregação no patrimônio (`BensPatrimoniais` tipo IMOVEL + `ImoveisSituacaoFiscal` + `ApolicesSeguro`); avisa o vencido (seguro só
  quando houve apólice e ela venceu: o Regimento só exige seguro do Templo Sede). Imóvel sem congregação (Sede/Matriz) não entra no painel de nenhuma congregação.
- **A equipe é só de adultos** com data de nascimento no cadastro; a saída automática (quem mudou de congregação, foi desligado ou chegou ao "até") roda às 7h, e a tela já
  mostra "saiu da congregação" antes disso.

**Provas:** jest (regra pura 27, migração 11, rota 13; a suíte inteira verde), `e2e-33` no SQL Server local (182 verificações) e `e2e-34` (corridas, 20), `e2e-29` e
`e2e-30` (v7.12) verdes sobre a base nova, a prova da tela `tools/front-crise` (212 verificações; 20 mutações, 20 acusadas) e as provas de tela da v7.7, v7.8, v7.10, v7.11
e v7.12 verdes. Mutações no servidor (guardas desfeitas uma a uma) acusadas pelos testes. Defeito achado pelo `e2e-33`: a resposta da imprensa gravava e devolvia 500
(variável fora do escopo depois da transação) — corrigido.

**Revisão adversarial independente (23/10/2026): 1 alto, 6 médios e 9 baixos, todos corrigidos**, cada um com teste que falha no código revisado (`0591414`):

- **(alto) "Celular na hora" não acontecia:** o celular saía um a um (0,2 a 0,4 s cada), ~6 s por rodada — com 400 líderes, o último receberia em horas. Agora o celular do
  aviso sai em paralelo (lotes de 25, cada aviso com prazo), com orçamento próprio dentro da resposta (~15 s), e a rotina de 15 minutos manda primeiro o celular do aviso,
  também em paralelo. A resposta diz a verdade ("Celular: X de N aparelhos avisados agora; os outros saem pela fila"). Prova: 420 líderes de mentira, todos avisados em no
  máximo duas rodadas, a abertura respondendo em menos de 38 s.
- **(médio) E-mail:** não sai para quem já foi alcançado (leu no sininho, deu ciência ou recebeu no celular: situação `ALCANCADO`); o aviso tem teto próprio por hora
  (`COMUNICACAO_CRISE_EMAILS_POR_HORA`, 30) e, com convocação oficial na fila, leva no máximo metade da rodada. Na troca do porta-voz o aviso novo vai a todos, mas o
  e-mail dele só sai para quem não foi alcançado pelo aviso novo.
- **(médio)** O porta-voz vê e responde só os pedidos da crise ativa (os de fora, com o contato do jornalista, ficam com o nível geral) e corrige só no alcance da lista.
- **(médio)** AVCB não informado e congregação sem imóvel no patrimônio também avisam.
- **(médio)** O aviso do pedido da imprensa tem teto: 10 por destinatário em 24 horas, e o celular só no 1º pedido de cada líder na hora.
- **(médio/baixo)** A tela espera 40 s nos três atos (o servidor fecha a resposta antes de ~38 s).
- **(baixos)** Datas da abertura e da revisão do plano no dia de Brasília; o encerramento relê o porta-voz dentro da trava; a manifestação e a resposta conferem o
  porta-voz dentro da trava, e na crise encerrada só se registra o que foi dito até o encerramento; sem o botão "Cancelar" no aviso de crise; o celular com um texto curto
  próprio (quem fala e o contato; na troca, o novo porta-voz); a segurança exclui a concessão de departamento, e os avisos da segurança e da imprensa ignoram quem está
  inativo ou teve a exclusão LGPD e incluem quem recebeu o papel por delegação; "registrar a saída" não estica o "até" já passado e a pendência de vistoria anterior
  continua contando até ser resolvida; o Presidente é avisado quando outra pessoa abre, troca o porta-voz ou encerra em nome dele; a migração alarga
  `Papeis.Permissoes` para 2000 antes de acrescentar, se preciso (e para com a explicação se nem assim couber).

## 🔒 Trava de Revisão 7-C — antes de encerrar a FASE 7 e avançar para a FASE 8

Ponto de parada obrigatório (ver "Travas de Revisão" na abertura da seção 3).
Audita v7.11 a v7.15 pelas 5 perguntas do checklist, e faz uma varredura
final na FASE 7 **inteira** antes de fechar — com atenção redobrada, de
novo, nos fluxos de proteção de menores (v7.7/v7.8/v7.10) e no consentimento
de comunicação granular (v7.12): são os pontos da fase com maior exposição
legal, e é aqui que qualquer regressão neles precisa ser pega antes de
seguir pra Ministerial.

- [x] **Fechada em 27/10/2026** — auditoria de v7.11 a v7.15 e varredura final da fase. Duas revisões independentes, só de leitura
  (23/10/2026): uma das costuras ENTRE as versões, com atenção a menores (v7.7/v7.8/v7.10) e ao consentimento (v7.12), e outra da lei,
  do plano e do README. **Nenhum achado crítico; 5 altos, 19 médios e 25 baixos, todos corrigidos com teste que falha no código de
  antes** (migrações 153, 154 e 155; `e2e-35` a `e2e-46`, sem o 39, que é da v7.14; casca v41). Em produção desde 27/10/2026 (merge
  `3a609b8`; reverter = `git revert -m 1 3a609b8`). O que mudou:
  - **A regra da 7-B chegou ao cuidado pastoral (alto).** Liderança com pendência reservada à Diretoria (afastamento cautelar,
    comunicação em análise, fora de comunhão…) não vê item, nota, pedido nem a busca de criança ou adolescente, não recebe item de
    menor (sobe ao degrau de cima) e deixa de ser responsável pelos que tinha, na decisão da Diretoria e na rotina diária.
  - **Risco sobre criança só ao nível geral (alto).** O pedido de oração com sinal de risco sobre criança, ou feito por menor, fica
    só com o nível geral, sem quem tem pendência ou é envolvido de incidente aberto; a Proteção de crianças do nível geral recebe o
    aviso, sem o texto, com o prazo do Conselho Tutelar.
  - **Mural do site com o banco pausado (alto).** O sistema decide o pedido comum sem abrir o banco e responde antes de esperar e-mail
    e celular; no site, sem resposta, o pedido vira confidencial e fica marcado para reenvio (`mural_oracao.sistema_pendente`, criado
    no Directus de produção em 27/10/2026); o que o sistema guardou perde texto e nome no Directus.
  - **Base legal da LGPD (dois altos).** O Art. 11, II não tem a hipótese "organização religiosa": o vínculo de membro passou à
    alínea "d" (exercício regular de direitos da associação; Código Civil arts. 44, 53 a 61; CF art. 5º, VI); disciplina, "d" com o
    CC art. 57; financeiro, "a" (CTN art. 14, III) e "d"; incidentes, "a" (ECA arts. 13 e 70-B; Lei 14.344/2022) e "e"; cuidado
    pastoral, "d", "e" e o Art. 11, I, sem o legítimo interesse (que não serve para dado sensível). O ECA 59-A é adotado por cautela
    (Regimento Art. 133 §5º); a multa do ECA 245 saiu dos textos que a aplicavam à Igreja. O mural do site entrou no ROPA e no RIPD.
    A 153 troca o texto das políticas só onde ele ainda é o original, e as migrações antigas (117, 142, 143, 144, 145, 148) não
    regravam mais, a cada deploy, a base legal editada pelo Encarregado.
  - **Avisos e e-mail.** O e-mail do motor sai sem novas tentativas e sem esperar a entrega, no mesmo teto por hora da comunicação;
    as retenções e o apagamento da saúde rodam antes dos avisos. A fila de comunicados passa a rodar 24 horas, mas de madrugada só
    com o aviso de crise (o comunicado comum espera as 6h). O aviso e o fim da crise não vão a quem foi suspenso, à delegação vencida
    nem ao menor; a equipe de segurança recusa e tira quem tem pendência ou está fora de comunhão.
  - **LGPD e retenção.** A exclusão guarda a prova de leitura antes de apagar o sininho e solta os itens de que o titular era
    responsável; Meus Dados exporta tudo, sem corte; o IP do consentimento, os contatos das versões antigas do plano de emergência e
    as anotações da v7.2 (justificativa da Ceia, 2 anos), v7.3 (ocorrência e administrador de canal, 5 anos) e v7.4 (contato do
    convidado, 1 ano depois do último evento dele) ganharam prazo ajustável na rotina diária.
  - **Saúde do check-in (v7.10).** Revogar o consentimento de saúde grava a revogação e apaga a saúde e as cópias na MESMA transação,
    sob uma trava por criança que a gravação da saúde, o check-in (depois da trava da sala) e a exclusão LGPD também pegam, sempre
    antes de tocar em tabela. A leitura que confere o consentimento e a rotina diária ficam como rede. Prova: `e2e-38` (inclusive com
    o apagar falhando e corridas em vários processos).
  - **Decisões do responsável da Igreja (23/10/2026)** (migração 155; `e2e-43` a `e2e-46`):
    - **Dinheiro do voluntário: só aviso** (Regimento Art. 133 §4º, Art. 135 §2º e §3º; Lei 9.608/98). O fornecedor pessoa física pode
      se ligar à matrícula de um membro do território (`Fornecedores.MembroId`: só pessoa física, uma matrícula por fornecedor). Ao lançar a
      saída, três avisos: a pessoa é voluntária (termo vigente ou equipe de escala ativa); pagamentos à mesma pessoa física em 3 semanas
      diferentes em 60 dias (prazos `TESOURARIA_HABITUAL_PAGAMENTOS` e `_JANELA_DIAS`, ajustáveis; o prebendado fica fora); cachê ou
      comissão na descrição, para voluntário. Sem a confirmação nada é gravado; com ela, a saída e os avisos entram juntos
      (`SaidaAvisosVoluntario`, que não se edita) e aparecem a quem aprova e paga. Resumo do mês para a Tesouraria geral pela rotina
      diária (`TESOURARIA_VOLUNTARIO_PAGO`). Meus Dados mostra o cadastro de fornecedor e os avisos.
    - **Funções com criança fora das escalas: departamentos e liderança** (eventos fora). A marca "tem contato com crianças" em
      `Departamentos` e `Papeis` (a União de Crianças nasce marcada); marcar é do nível geral (departamento: `pessoas`; cargo:
      `permissoes`), com a confirmação reforçada. Quem ocupa e não está apto aparece num painel (a Diretoria lê o motivo; a
      Proteção do nível geral, "pendência com a Diretoria") e num aviso obrigatório (`MENORES_FUNCAO_SEM_APTIDAO`), uma vez por
      pessoa e função a cada mês, nunca à própria pessoa e sem o motivo. A nomeação avisa e não impede: a decisão é humana.
    - **Para a Fase 10:** o comunicado ao menor pelos responsáveis e o usuário de banco só de dados para o aplicativo (v10.7).
  - **Outros.** Região sem Superintendente Regional aparece no painel geral (a escada a pula; ação humana: cadastrar); tetos diários
    contados dentro da trava; delegação de quem foi suspenso cancelada; textos da v7.15 com o teto da crise lido da configuração;
    a política de privacidade e o formulário do mural do site contam a cópia para o sistema, a lista de risco e o aviso à Diretoria.

  As 5 perguntas:
  1. *Código novo roda de ponta a ponta no ambiente real?* **Sim.** Banco SQL Server de verdade recriado do zero com todas as
     migrações (até a 155) e os handlers reais: as 46 baterias passaram com 0 falhas (inclusive as novas `e2e-35` 54, `e2e-36` 32,
     `e2e-37` 22, `e2e-38` 30, `e2e-40` 60, `e2e-41` 52, `e2e-42` 6, `e2e-43` 55, `e2e-44` 54, `e2e-45` 42 e `e2e-46` 14, várias com
     corridas em vários processos e o modo de leitura do Azure). jest: 6.041 testes. Na homologação e na produção, as migrações 153 a
     155 passaram e as rotas novas respondem 401 sem login.
  2. *Toda tela abre e mostra dado de verdade?* **Sim.** Provas da tela sem falha: identidade 815, crise 217, comunicação 420,
     cuidado 882, check-in 1.488, proteção 808 e menores 394. Teste de tela da homologação, rápido: 1.088 ações iguais no computador
     e 151 no celular; **completo** (27/10/2026): 5.363 iguais no computador e 735 no celular, 0 divergência e 0 violação de CSP (10
     e 5 inconclusivas por falha do próprio equipamento). O limite do teste do computador subiu de 60 para 90 minutos: o completo
     roda as 5.373 ações em ~48 min e a repescagem estourava os 60.
  3. *README e código narram a mesma coisa?* **Sim.** O README perdeu a pendência já fechada da chave site↔sistema e o passo velho
     das migrações; números de tabelas e módulos atualizados; o plano da v7.10, v7.12 e v7.15 alinhado ao código; v4.16 e v4.24
     apontam para a pesquisa; o `style-src 'unsafe-inline'` foi para a v10.7. ROPA e RIPD cobrem o mural do site, o dinheiro do
     voluntário e as funções com menores; o aviso de privacidade do site conta o que a v7.11.1 faz com o pedido.
  4. *O que ficou para trás foi corrigido, não só anotado?* **Sim, o que o código resolve.** Decidido pelo responsável: os dois
     itens que foram para a Fase 10. **Ação humana (não é código):** cadastrar o Superintendente de cada região, o Comitê de Proteção
     e marcar as turmas da EBD "com menores"; por volta de 29/10, tirar a permissão pública de criar em `mural_oracao` (v7.11.1).
     Fica como limite aceito: a saída de outros módulos (prebenda, auxílios) não passa pelo aviso do voluntário; a delegação
     temporária de um cargo não conta como ocupar a função com menores; o visitante e o aluno não-membro da EBD seguem no
     legítimo interesse (Art. 7º, IX), porque o sistema guarda deles só nome e contato e os anonimiza em 12 e 24 meses.
  5. *Deploy real aconteceu?* **Sim.** Em 27/10/2026 (merge `3a609b8`): o deploy do sistema e o do site passaram, as migrações 153,
     154 e 155 aparecem no log da produção, `/api/ministerio-menores/funcoes`, `/api/identidade-visual/ciclos` e `/api/crise`
     respondem 401 sem login e a casca do service worker é a v41. Teste de tela da produção: 1.088 ações iguais no computador e 151 no celular, 0 divergência e 0 violação de CSP.
