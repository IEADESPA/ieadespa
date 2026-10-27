// shared/ropa.js (vB.8 — ROPA: Registro de Operações de Tratamento)
// Catálogo curado à mão — não existia NADA disso até aqui (nem tabela, nem
// documento): não dá pra derivar "qual é a finalidade e a base legal de
// cada tratamento" automaticamente do schema, alguém precisa decidir e
// escrever. O que a Function (GestaoRopa) faz de automático é só a parte
// que É derivável: contar quantos registros reais existem em cada tabela
// agora, pra o ROPA nunca ficar "desatualizado sem ninguém perceber" —
// senão vira só mais um documento estático que ninguém confere se ainda
// bate com o sistema.
//
// Cobre os tratamentos de dado pessoal REALMENTE implementados hoje — não
// é uma lista exaustiva de 95+ tabelas, é o registro das atividades de
// tratamento reais (mesmo espírito do "gap real, não fabricado" de toda
// vB.8): crescer este catálogo é 1 entrada nova por vez, quando um módulo
// novo tratar dado pessoal de um jeito que ainda não está aqui.
const REGISTROS_TRATAMENTO = [
  {
    chave: "MEMBRESIA",
    finalidade: "Gestão do vínculo de membresia religiosa (cadastro, categoria, histórico)",
    titulares: "Membros e ex-membros",
    categoriasDados: ["Identificação", "Contato", "Datas eclesiásticas (batismo, admissão)"],
    baseLegal: "LGPD Art. 11, II, \"d\" — exercício regular de direitos da associação religiosa na relação com os seus membros (vínculo associativo regido pelo Estatuto; Código Civil arts. 44, IV e § 1º, e 53 a 61; CF art. 5º, VI). Dispensa consentimento. Ser membro revela convicção religiosa (dado sensível, LGPD Art. 5º, II): por isso a base é a do Art. 11, nunca o legítimo interesse do Art. 7º, IX",
    tabelasEnvolvidas: ["MembroReferencia"],
    retencao: "Enquanto durar o vínculo; minimizado 30 dias após desligamento formal (Reg. Art. 132 §2º — ver PoliticasRetencao)"
  },
  {
    chave: "FOTO",
    finalidade: "Identificação visual (crachá, cadastro com foto)",
    titulares: "Membros",
    categoriasDados: ["Imagem"],
    baseLegal: "LGPD Art. 7º, I — consentimento (ConsentimentosLGPD, Tipo='FOTO'/'DADOS_CONTATO'). Menor de 18 anos: só vale o consentimento específico do responsável legal (LGPD Art. 14, § 1º; MinisterioMenoresConsentimentos, finalidade IMAGEM) — o consentimento genérico da própria criança ou adolescente não basta (v7.7)",
    tabelasEnvolvidas: ["MembroReferencia"],
    retencao: "Enquanto o consentimento não for revogado — revogação (do titular, da Secretaria ou do responsável do menor) exclui o arquivo na hora (shared/storage.js::excluirFoto) e zera a referência no cadastro"
  },
  {
    chave: "DISCIPLINA",
    finalidade: "Processo disciplinar eclesiástico (Regimento, Código Penal Eclesiástico)",
    titulares: "Membros sob processo",
    categoriasDados: ["Motivo, decisão, sanção — sigiloso"],
    baseLegal: "LGPD Art. 11, II, \"d\" — exercício regular de direitos, inclusive em processo administrativo interno (Código Civil art. 57: a exclusão do associado exige justa causa e direito de defesa, na forma do Estatuto)",
    tabelasEnvolvidas: ["ProcessosDisciplinares", "ProcessoInfracoes", "MedidasCautelares"],
    retencao: "Indeterminada (PoliticasRetencao — histórico disciplinar/reincidência, Regimento Art. 77)"
  },
  {
    chave: "FINANCEIRO",
    finalidade: "Gestão financeira, dízimos/ofertas e prestação de contas",
    titulares: "Dizimistas (membros e avulsos)",
    categoriasDados: ["Nome, valor, forma de pagamento"],
    baseLegal: "LGPD Art. 11, II, \"a\" — obrigação legal de escriturar as receitas e despesas da entidade imune (CTN art. 14, III), e \"d\" — exercício regular de direitos (a prestação de contas prevista no Estatuto). O dízimo revela convicção religiosa (dado sensível)",
    tabelasEnvolvidas: ["Dizimistas", "LancamentosTesouraria"],
    retencao: "Indeterminada — exigência de prestação de contas contínua (Estatuto Art. 36)"
  },
  {
    chave: "COMUNICACAO",
    finalidade: "Notificação institucional (prazo vencendo, pendência, aviso operacional) — NUNCA marketing",
    titulares: "Membros com Lideranca (destinatários de notificação)",
    categoriasDados: ["E-mail, inscrição push"],
    baseLegal: "LGPD Art. 11, II, \"d\" — exercício regular de direitos da associação religiosa na relação com os seus membros (o aviso é inerente à função ou ao vínculo regido pelo Estatuto; Código Civil arts. 53 a 61), com opt-out por categoria (NotificacaoPreferencias, vB.2)",
    tabelasEnvolvidas: ["Notificacoes", "PushInscricoesMembro"],
    retencao: "Notificação: indeterminada enquanto não arquivada. Inscrição push: até o dispositivo revogar/desinstalar. A exclusão LGPD apaga as preferências de aviso e os aparelhos inscritos (v7.12)."
  },
  {
    chave: "COMUNICACAO_MEMBROS",
    finalidade: "Comunicados da Igreja aos membros por grupo (convocação oficial, eventos, devocional, financeiro): modelos aprovados, grupo calculado pelos critérios (território, cargo, departamento, liderança, EBD, formação, voluntariado, direito a voto) e registro de entrega e leitura — v7.12. Sem WhatsApp e sem SMS; nenhum grupo pelo dízimo.",
    titulares: "Membros ativos e adultos dos grupos escolhidos pela liderança",
    categoriasDados: ["Consentimento por canal (e-mail, celular) e categoria: sim/não, origem (Meu Painel, ficha em papel, link de saída), versão e impressão digital do texto aceito, data da ficha, endereço de quem marcou", "E-mail e aparelho inscrito (já do cadastro)", "Registro de entrega por pessoa e canal (aceito, falhou, sem consentimento, sem contato, sem aparelho, cancelado), leitura no sininho e ciência da convocação", "Na convocação: nome, congregação e telefone de quem não foi alcançado (só o nível geral vê o telefone)"],
    baseLegal: "LGPD Art. 11, I (e Arts. 7º, I e 8º) — consentimento por canal e categoria para eventos, devocional e financeiro (pedido, não presumido; a saída é um toque no link do e-mail ou em Meu Painel); Art. 11, II, \"d\" — a convocação oficial é exercício regular de direitos da associação religiosa na relação com os seus membros (a convocação regular é condição de validade da assembleia: Código Civil arts. 59 e 60 e o Estatuto) e vai por todo canal que a pessoa tiver, sem link de saída. A convocação só sai pelo nível geral; cada um envia só ao próprio território.",
    tabelasEnvolvidas: ["ComunicacaoConsentimentos", "ComunicacaoModelos", "ComunicacaoAudiencias", "ComunicacaoEnvios", "ComunicacaoEntregas", "Notificacoes"],
    retencao: "O registro de entrega perde o nome em 1 ano (PoliticasRetencao 'Comunicação — registro de entrega'), ou em 5 na convocação oficial (prova do ato); a contagem do envio fica. O histórico de consentimento fica enquanto a pessoa estiver no cadastro e sai na exclusão LGPD. Consentimento e entrega não se alteram (gatilhos no banco). A pessoa vê em Meus Dados o histórico do consentimento e quantos comunicados recebeu. O IP do consentimento é anonimizado 5 anos depois que outra escolha o substituiu ou que a pessoa saiu do rol (prazo VOLUNTARIADO_IP_RETENCAO_DIAS); o consentimento vigente guarda o IP (Trava 7-C)."
  },
  {
    chave: "IDENTIDADE_VISUAL",
    finalidade: "Escolha participativa da Identidade Visual do ano (Regimento Art. 159 § 1º — v7.14): sugestões de tema dos membros, triagem da Diretoria, votação pelo Meu Painel (Enquete), cores e concurso de arte, e o registro da escolha final do culto. A Diretoria abre o ciclo do ano.",
    titulares: "Membros ativos e em comunhão que mandam sugestão, votam ou mandam arte",
    categoriasDados: ["Sugestão de tema (texto curto) com a data e a situação (enviada, retirada, finalista, descartada)", "Voto na enquete (secreto: só a contagem por opção aparece)", "Arte enviada (imagem PNG ou JPEG, título, descrição) com a situação; o nome do autor só a Diretoria vê", "Quem triou, decidiu o empate e registrou o resultado (liderança)"],
    baseLegal: "LGPD Art. 7º, IX e 11, II, a — processo participativo previsto no Regimento (Art. 159), de quem quis participar; a triagem vê só o texto da sugestão, sem o nome de quem mandou.",
    tabelasEnvolvidas: ["IdentidadeCiclos", "IdentidadeSugestoes", "IdentidadeTemasUsados", "IdentidadeCores", "IdentidadeArtes", "IdentidadeResultados", "Enquetes", "RespostasEnquete"],
    retencao: "1 ano depois do fim do ciclo (31/12), a sugestão e a arte perdem o nome e a imagem não escolhida sai do armazenamento (PoliticasRetencao 'Identidade visual — sugestões e artes dos membros'); ficam as contagens, os finalistas e o tema e a arte escolhidos. A exclusão LGPD faz o mesmo na hora (e a sugestão que não foi finalista perde o texto). A pessoa vê em Meus Dados as sugestões e as artes que mandou."
  },
  {
    chave: "VINCULO_FAMILIAR_MENOR",
    finalidade: "Registro de vínculo familiar e identificação de responsável legal de menor",
    titulares: "Membros menores de idade e seus responsáveis",
    categoriasDados: ["Vínculo de parentesco", "Flag de responsável legal"],
    baseLegal: "LGPD Art. 11, II, \"d\" — exercício regular de direitos da associação religiosa na relação com os seus membros (Código Civil arts. 53 a 61; CF art. 5º, VI) + Art. 14 (melhor interesse da criança)",
    tabelasEnvolvidas: ["VinculosFamiliares"],
    retencao: "Enquanto durar o vínculo familiar/de membresia"
  },
  {
    chave: "EBD",
    finalidade: "Escola Bíblica Dominical: turmas, chamada, caderneta, atividades, alerta de ausência ao professor (FASE 6)",
    titulares: "Alunos (membros e não-membros, inclusive crianças), professores e visitantes da EBD",
    categoriasDados: ["Identificação (nome)", "Presença por domingo", "Respostas de atividade", "Não-membro: contato, nascimento, responsável (menor)", "Visitante: nome e contato"],
    baseLegal: "LGPD Art. 11, II, \"d\" — exercício regular de direitos da associação religiosa na relação com os seus membros (membros; Código Civil arts. 53 a 61), + Art. 14 para a criança; Art. 7º, IX e Art. 14 (legítimo interesse/melhor interesse da criança, com responsável) para não-membros e visitantes",
    tabelasEnvolvidas: ["EbdAlunos", "EbdChamadas", "EbdRespostasAlunos", "EbdCadernetas"],
    retencao: "Presença e matrícula de membro: enquanto durar o vínculo. Visitante: nome/contato anonimizados após 12 meses; aluno não-membro: anonimizado 24 meses após encerrar a matrícula (rotina diária — PoliticasRetencao). O Encarregado anonimiza antes, a pedido (Proteção de Dados → EBD)."
  },
  {
    chave: "FORMACAO",
    finalidade: "Trilhas de formação, conclusão de módulos e certificado verificável usado como requisito (v6.5/v6.9)",
    titulares: "Membros em formação",
    categoriasDados: ["Matrícula e progresso em trilha", "Certificado (titular, título, validade, código de verificação)"],
    baseLegal: "LGPD Art. 11, II, \"d\" — exercício regular de direitos da associação religiosa na relação com os seus membros (Código Civil arts. 53 a 61), que inclui provar a formação exigida pelos fluxos (consagração, liderança, escala)",
    tabelasEnvolvidas: ["TrilhaMatriculas", "TrilhaModuloConclusoes", "CertificadosEmitidos"],
    retencao: "Indeterminada enquanto o certificado puder ser verificado (prova de formação); a verificação pública mostra só o que está impresso no certificado"
  },
  {
    chave: "PSC",
    finalidade: "Avaliação anual de saúde de cada congregação (Programa de Saúde Congregacional, Regimento Art. 127-129) e a reclassificação compulsória que dela decorre (v7.1)",
    titulares: "Quem preenche, valida e homologa a avaliação; encarregado nomeado na reclassificação",
    categoriasDados: ["Identificação de quem agiu (matrícula)", "Respostas e evidências (links) sobre a congregação, não sobre pessoas"],
    baseLegal: "LGPD Art. 7º, IX — legítimo interesse da instituição em avaliar suas unidades; sem dado sensível de membro (o PSC é avaliação da congregação, não cadastro de saúde de pessoa)",
    tabelasEnvolvidas: ["PscAvaliacoes", "PscRespostas", "PscReclassificacoes"],
    retencao: "Indeterminada — o histórico dos exercícios é o que sustenta uma reclassificação compulsória (PoliticasRetencao)"
  },
  {
    chave: "CALENDARIO",
    finalidade: "Calendário oficial do campo, agenda litúrgica e presença do dirigente na Santa Ceia Geral (Regimento Art. 79, 81, 147, 154 e 154-A) — v7.2",
    titulares: "Quem propõe e decide as datas (matrícula) e os dirigentes das congregações na Santa Ceia Geral",
    categoriasDados: ["Identificação de quem propôs, deferiu e homologou (matrícula)", "Presença do dirigente da congregação na Ceia Geral: presente, ausente justificado ou injustificado", "Justificativa livre da ausência (pode citar motivo de saúde)"],
    baseLegal: "LGPD Art. 7º, IX — legítimo interesse da instituição em organizar a programação (só quem propôs e decidiu, sem dado sensível); Art. 11, II, \"d\" — exercício regular de direitos da associação religiosa na relação com os seus membros, para a presença do dirigente e a justificativa de ausência (que pode ser dado de saúde, visível só à Secretaria e à CLI). O que vai ao site público é só título, data, local e congregação — nenhum nome de pessoa.",
    tabelasEnvolvidas: ["CalendarioEventos", "CalendarioPresencasDirigente"],
    retencao: "Calendário: indeterminada — o histórico de anos homologados sustenta o Direito Adquirido Temporal (PoliticasRetencao). Presença na Ceia Geral: fica. A justificativa (texto livre, pode citar saúde) é apagada pela rotina diária 2 anos depois da Ceia (PoliticasRetencao 'Calendário — justificativa de ausência na Santa Ceia', ajustável; Trava 7-C) — fica só que a ausência foi justificada."
  },
  {
    chave: "CANAIS",
    finalidade: "Relação de Canais Oficiais de Comunicação, administradores com Termo de Dever de Moderação, ocorrências de conteúdo irregular (Regra das 24 Horas) e conformidade da transmissão dos cultos (Estatuto Art. 12; Regimento Art. 157 §5º, 160 e 160-A) — v7.3",
    titulares: "Administradores e operadores de canais; membros que avisam conteúdo irregular; membros citados na descrição de uma ocorrência; quem sai de uma liderança (pendência de troca de senha)",
    categoriasDados: ["Matrícula de quem administra, avisou, removeu o conteúdo e decidiu", "Aceite do Termo de Dever de Moderação (versão, hash do texto e hora)", "Descrição livre do conteúdo irregular (pode citar nome de membro e revelar opinião política) e link de evidência", "Contato institucional dos canais (número, e-mail, perfil) — nunca contato pessoal, a validação recusa", "Nenhuma senha: o sistema guarda só quem custodia e a data da última troca"],
    baseLegal: "LGPD Art. 7º, IX — legítimo interesse da instituição em moderar os próprios canais e provar diligência (Marco Civil da Internet; Regimento Art. 160, §1º). A descrição de uma ocorrência pode revelar opinião política (dado sensível): Art. 11, II, \"d\" — exercício regular de direitos, em especial a prova de diligência. Quem avisou não é revelado ao administrador do canal.",
    tabelasEnvolvidas: ["CanaisOficiaisComunicacao", "CanalAdministradores", "CanalOcorrencias", "CanalTrocasCredencial", "CanalConferencias", "CongregacaoTransmissao"],
    retencao: "Ocorrências e administradores: 5 anos, por margem sobre a prescrição da reparação civil (CC art. 206, §3º, V). A ocorrência encerrada perde a descrição, o link, a observação da advertência e quem avisou 5 anos depois de encerrada; o administrador que deixou a função perde o nome 5 anos depois (rotina diária; PoliticasRetencao 'Canais — ocorrência de moderação encerrada' e 'Canais — administrador que deixou a função', ajustáveis; Trava 7-C). Registro dos canais, conferências e transmissão: enquanto o canal existir; o desativado mantém o histórico (prova das tentativas de contato do Abandono Digital)."
  },
  {
    chave: "EVENTOS",
    finalidade: "Governança do evento: organizadores, Protocolo de Convidados externos (parecer do Conselho de Ética e Nada Consta da Presidência) e Caixa Flutuante de Eventos com prestação de contas (Regimento Art. 53-E §2º, 111, 111-A e 152) — v7.4",
    titulares: "Convidados externos (preletores e cantores, terceiros à Igreja), organizadores e tesoureiros do evento, e quem decide os convites",
    categoriasDados: ["Nome, ministério ou igreja de origem e contato do convidado externo (dado de terceiro)", "Declaração sobre a reputação do convidado e os pareceres sobre ele (alinhamento doutrinário pode revelar convicção religiosa)", "Autorização do convidado para divulgar o nome", "Matrícula de quem organiza, lança, encerra e confere o caixa", "Lançamentos financeiros do evento (valor, categoria, comprovante) — sem dado de doador individual"],
    baseLegal: "LGPD Art. 7º, IX — legítimo interesse da instituição em proteger o púlpito e prestar contas (Regimento Art. 111-A e 152); Art. 7º, I — consentimento do convidado para divulgar o nome no site; o parecer sobre alinhamento doutrinário trata convicção religiosa (dado sensível): Art. 11, II, \"d\" — exercício regular de direitos, limitado à Ética, à Presidência e à organização do evento. O contato do convidado nunca vai ao site.",
    tabelasEnvolvidas: ["EventoOrganizadores", "EventoConvidados", "EventoCaixas", "EventoCaixaLancamentos", "EventoCaixaDestinos"],
    retencao: "Caixa e prestação de contas: 5 anos (guarda fiscal, CTN art. 173; PoliticasRetencao). Convidado externo: o registro do protocolo (nome, pareceres) fica como prova; o contato é apagado pela rotina diária 1 ano depois do último evento dele — o mesmo nome ou o mesmo contato num evento mais novo seguram (PoliticasRetencao 'Eventos — contato do convidado externo', ajustável; Trava 7-C). O Encarregado pode apagar antes, a pedido do convidado."
  },
  {
    chave: "VOLUNTARIADO",
    finalidade: "Organizar o serviço voluntário: equipes e escalas (v5.6), habilitação do voluntário (v5.7), rodízio por grupos e trava de habitualidade, Termo de Adesão com a prova do aceite (IP, data e hora) e remoção da escala (Regimento Art. 133, 133-D e 135; Lei 9.608/98) — v7.5",
    titulares: "Voluntários (membros e congregados que servem em equipes e escalas), líderes de equipe e quem registra adesões, ratificações e remoções",
    categoriasDados: ["Matrícula, equipes, escalas, convites e respostas (aceitar, recusar, confirmar)", "Períodos de indisponibilidade e o motivo digitado pelo voluntário (texto livre: pode revelar saúde ou viagem — orientar a não detalhar)", "Etapas da habilitação, observações de referências e entrevista", "Adesão ao Termo: forma, versão e hash do texto, data, e, no aceite digital, o ENDEREÇO IP, a cadeia dos cabeçalhos de origem da conexão (x-forwarded-for etc.) e o instante exato (Art. 133 §8º, II, “b”)", "Menor de 18 anos: o responsável legal (matrícula, nome e vínculo, com a descrição do documento que a Secretaria conferiu) e, no aceite digital dele, o ENDEREÇO IP, a cadeia dos cabeçalhos, a data e a hora do ACEITE DO RESPONSÁVEL (dado do responsável, guardado na adesão do menor); a data de nascimento do cadastro só é consultada para conferir a idade, não é copiada", "Ratificação coletiva: lista, data e signatários", "Remoção da escala: motivo registrado pelo dirigente (registro de RH, sem ligação com a disciplina)"],
    baseLegal: "LGPD Art. 7º, V — execução do contrato de adesão (Lei 9.608/98, art. 2º); Art. 7º, II — obrigação legal de formalizar o termo; Art. 7º, IX — legítimo interesse em organizar as escalas, provar o revezamento (Art. 135 §1º) e afastar o vínculo de emprego. O IP do aceite é dado pessoal guardado como prova (Art. 133 §8º, II, “b”), informado ao voluntário no próprio Termo.",
    tabelasEnvolvidas: ["EscalasEquipes", "EscalasEquipeMembros", "EscalasServicos", "EscalasAlocacoes", "EscalasIndisponibilidades", "EscalasRodizios", "EscalasRodizioGrupos", "EscalasRodizioGrupoMembros", "VoluntariosHabilitacao", "VoluntariosDesligamentos", "VoluntariadoAdesoes", "VoluntariadoRatificacoes", "VoluntariadoResponsaveis"],
    retencao: "Adesão ao Termo (forma, data, versão, hash) e cadastro do responsável legal de menor: sem prazo final — são a prova da Lei 9.608/98 e não se alteram nem se apagam (o cadastro do responsável só admite revogação). IP e cabeçalhos do aceite digital (da própria pessoa ou do responsável): anonimizados 5 anos (parâmetro VOLUNTARIADO_IP_RETENCAO_DIAS) depois do último serviço, por rotina diária (CF art. 7º, XXIX — prescrição trabalhista; LGPD art. 16). Escalas e rodízios: histórico que comprova o revezamento (PoliticasRetencao). O titular recebe tudo isto, a pedido, em Meus Dados — o responsável recebe também os aceites que deu."
  },
  {
    chave: "VOLUNTARIO_PAGAMENTO",
    finalidade: "Avisar o tesoureiro, ao lançar uma saída para pessoa física, das regras de dinheiro do voluntário (Regimento Art. 133 §4º — Ordem de Serviço prévia; Art. 135 §2º — a \"diarista disfarçada\", pagamento habitual à mesma pessoa; Art. 135 §3º — cachê e comissão) e guardar que ele leu e confirmou; o resumo do mês vai à Tesouraria geral. O sistema só avisa, não impede (decisão do responsável, 23/10/2026; Trava 7-C)",
    titulares: "Membros que prestam serviço à Igreja como pessoa física (fornecedor ligado à matrícula) e qualquer pessoa física paga (só a contagem dos pagamentos); quem lança e confirma o aviso",
    categoriasDados: ["A matrícula do membro ligada ao cadastro de fornecedor pessoa física (Fornecedores.MembroId; nula se não é membro)", "Se a pessoa é voluntária hoje (calculado na hora pelo Termo de Adesão e pelas equipes de escala: nada novo é gravado sobre ela)", "Os avisos confirmados em cada saída: código, texto mostrado, quem confirmou e quando"],
    baseLegal: "LGPD Art. 11, II, \"a\" — cumprimento de obrigação legal: escriturar as despesas da entidade imune (CTN art. 14, III) e não transformar o serviço voluntário em emprego (Lei 9.608/98, arts. 1º e 2º; CLT arts. 2º e 3º); e \"d\" — exercício regular de direitos da associação, no controle que o Regimento manda (Arts. 133 §4º e 135). Ligar o fornecedor à matrícula revela que a pessoa é membro (dado sensível): por isso a base é a do Art. 11, nunca o legítimo interesse",
    tabelasEnvolvidas: ["Fornecedores", "SaidaAvisosVoluntario"],
    retencao: "A ligação do fornecedor à matrícula fica enquanto o cadastro de fornecedor existir (a tela desfaz: o tesoureiro desliga). Os avisos confirmados acompanham a saída, que é registro fiscal (5 anos ou mais; PoliticasRetencao do financeiro), e não se alteram nem se apagam (gatilho no banco); a exclusão LGPD não apaga registro fiscal. A pessoa vê em Meus Dados o cadastro de fornecedor ligado a ela e os avisos registrados nos pagamentos a ela, com a data."
  },
  {
    chave: "SETORES_TECNICOS",
    finalidade: "Organizar o voluntariado profissional dos 20 Setores Técnicos (vínculo, formação, registro no conselho de classe e Termo de Adesão com a prova do aceite) e registrar os atos de poder de polícia técnica — interdição cautelar de templo e pedido de remoção de postagem — com a ratificação da Diretoria (Regimento Art. 48 a 52; Lei 9.608/98) — v7.6",
    titulares: "Membros que se candidatam ou são indicados a um Setor Técnico, quem os aprova e quem emite, ratifica ou atende os atos cautelares",
    categoriasDados: ["Matrícula, setor, formação acadêmica ou técnica e registro no conselho de classe (sigla e número)", "Situação do vínculo (candidato, aguardando Termo, ativo, encerrado) e o motivo do encerramento", "Termo de Adesão: forma, data, versão, hash do texto, IP e cabeçalhos de origem do aceite digital, ou a referência do documento arquivado", "Atos cautelares: o que foi interditado ou a postagem apontada, a justificativa técnica, o registro profissional de quem emitiu, a decisão da Diretoria"],
    baseLegal: "LGPD Art. 7º, V — execução do contrato de adesão (Lei 9.608/98, art. 2º); Art. 7º, II — obrigação legal de formalizar o termo; Art. 7º, IX — legítimo interesse em provar a gratuidade do serviço (Regimento Art. 49), a responsabilidade técnica (Art. 49 §1º) e a segurança dos templos (Art. 50). O IP do aceite é registro de conexão exigido pelo Regimento Art. 133 §8º, II, b.",
    tabelasEnvolvidas: ["SetoresTecnicos", "SetoresTecnicosMembros", "SetoresTecnicosAdesoes", "SetoresTecnicosIntervencoes"],
    retencao: "Vínculo, Termo (forma, data, versão, hash) e atos cautelares: sem prazo final — são prova e não se apagam (gatilhos no banco). IP e cabeçalhos do aceite digital: anonimizados 5 anos depois que o vínculo termina (parâmetro VOLUNTARIADO_IP_RETENCAO_DIAS; rotina diária; CF art. 7º, XXIX; LGPD art. 16). O titular recebe tudo isto, a pedido, em Meus Dados."
  },
  {
    chave: "VISTORIA_ANTECEDENTES",
    finalidade: "Lavrar o Termo de Vistoria quando a Diretoria confere certidão de antecedentes criminais e de distribuição cível de quem assume liderança ou confiança, muda para área sensível, é alvo de suspeita fundada ou é solicitado pela Diretoria — guardando só o hash da certidão, nunca o documento (Regimento Art. 133 §5º; Lei 14.811/2024) — v7.6",
    titulares: "Membros e congregados vistoriados; a Diretoria Executiva e o Conselho de Ética, que conferem e assinam",
    categoriasDados: ["Matrícula, motivo, função em jogo e se envolve vulneráveis", "Hash SHA-256 de cada certidão conferida, tipo e data de emissão (o documento NÃO é guardado)", "Parecer final e resultado (sem restrição, com restrição ou recusa) — dado sobre antecedentes, tratado com sigilo reforçado", "Quem assinou o termo e quando; o destino do original (devolvido ou descartado)"],
    baseLegal: "LGPD Art. 7º, II — obrigação legal, onde a lei alcança (ECA art. 59-A, incluído pela Lei 14.811/2024: o caput vale para a instituição que recebe recurso público; o parágrafo único, para estabelecimentos educacionais e similares, e a EBD pode ser tida como similar); Art. 7º, IX — legítimo interesse em proteger o rebanho. A Igreja adota a exigência por cautela e pelo Regimento Art. 133 §5º, sem afirmar que a lei a obriga em todos os casos. O consentimento prévio de todo voluntário consta do Termo de Adesão (§5º, III). Acesso restrito à Diretoria Executiva e ao Conselho de Ética (§5º, IV, a).",
    tabelasEnvolvidas: ["VistoriasAntecedentes", "VistoriasDocumentos", "VistoriasAnulacoes"],
    retencao: "O Termo de Vistoria é arquivo interno obrigatório da Igreja (Art. 133 §5º, IV, c) e não se altera nem se apaga (gatilho no banco); por conter só o hash, é dado mínimo. O Regimento manda arquivar e não fixa prazo: o termo fica sem prazo final de descarte; o termo lavrado por engano é ANULADO por registro à parte (não se apaga). O titular recebe o termo, a pedido, em Meus Dados."
  },
  {
    chave: "CONSENTIMENTO_MENOR",
    finalidade: "Registrar o consentimento específico e em destaque do responsável legal para tratar a imagem do menor (foto no cadastro, no crachá e em materiais internos) e a alergia ou condição de saúde que ele escolha informar para o crachá do check-in infantil — versionado e revogável (LGPD Art. 14, § 1º, e Art. 11, I) — v7.7",
    titulares: "Crianças e adolescentes (menores de 18 anos) e os responsáveis legais que autorizam (pai, mãe, tutor ou outro responsável legal cadastrado pela Secretaria com o documento conferido), e quem registra a ficha assinada",
    categoriasDados: ["Matrícula do menor e do responsável, a finalidade (imagem ou saúde no crachá), se autorizou ou revogou, a forma (autorização digital ou ficha assinada) e quando", "Versão e hash do texto que o responsável viu e aceitou (a prova do que foi autorizado)", "Autorização digital: o ENDEREÇO IP e a cadeia dos cabeçalhos de origem da conexão do RESPONSÁVEL, a data e a hora", "Ficha assinada: a referência de onde está o documento (número, pasta ou arquivo) e a matrícula de quem a registrou na Secretaria", "Esta tabela guarda só o CONSENTIMENTO, nunca o dado de saúde (o dado — alergia, condição médica — fica em CheckinInfantilSaude, do check-in infantil da v7.10, e é apagado quando o consentimento é revogado); a foto fica no Blob Storage e é apagada na revogação"],
    baseLegal: "LGPD Art. 14, § 1º — consentimento específico e em destaque de ao menos um dos pais ou do responsável legal, para dado de criança e de adolescente; Art. 11, I — consentimento específico e destacado do responsável, para o dado sensível de saúde; Art. 8º, § 5º — revogável a qualquer momento. É opcional e NÃO condiciona a participação do menor em nenhuma atividade. O IP do aceite é registro da prova (Regimento Art. 133 § 8º, II), informado ao responsável no próprio texto.",
    tabelasEnvolvidas: ["MinisterioMenoresConsentimentos", "VoluntariadoResponsaveis"],
    retencao: "Cada concessão e cada revogação é uma linha de acréscimo, sem prazo final: é a prova do consentimento e não se altera nem se apaga (gatilho no banco). IP e cabeçalhos do aceite digital: anonimizados 5 anos depois do registro (parâmetro VOLUNTARIADO_IP_RETENCAO_DIAS; rotina diária; LGPD Art. 16). Revogar a imagem apaga o arquivo da foto na hora (shared/storage.js::excluirFoto). A autorização deixa de valer sozinha quando quem a deu deixa de ser responsável cadastrado do menor ou quando o menor completa 18 anos (calculado na leitura). O titular e o responsável recebem tudo isto, a pedido, em Meus Dados."
  },
  {
    chave: "MINISTERIO_COM_MENORES",
    finalidade: "Adotar, por cautela e pelo Regimento Art. 133 §5º, a exigência da Lei 14.811/2024 (art. 59-A do ECA): conferir, a cada escala, convite, troca e publicação, se quem serve com crianças e adolescentes está habilitado hoje (certidões de antecedentes em dia, treinamento de proteção, ficha confirmada, política de comunicação aceita e 6 meses de comunhão), garantir dois adultos habilitados e a proporção por faixa etária em cada sala, e retirar da escala quem deixou de estar habilitado.",
    titulares: "Voluntários que servem (ou pretendem servir) com crianças e adolescentes; líderes de equipe e a secretaria que habilita; a Diretoria Executiva e o Conselho de Ética, que conferem as certidões",
    categoriasDados: ["Matrícula, equipes com menores onde serve e escalas futuras", "Aceite da política de comunicação com menores: versão, hash do texto, forma, IP e cabeçalhos da conexão, data e hora (ou a referência da ficha assinada)", "Data da última confirmação da ficha cadastral", "Retiradas automáticas da escala: equipe, quantas escalas, data e os códigos dos motivos (nunca texto livre)", "Consulta ao cadastro nacional de condenados por crimes contra menores (só se um dia existir): fonte, resultado e data", "Número de crianças previstas por sala e serviço (dado do serviço, sem identificar criança)"],
    baseLegal: "LGPD Art. 7º, II — obrigação legal, onde a lei alcança (ECA art. 59-A, incluído pela Lei 14.811/2024: o caput vale para a instituição que recebe recurso público; o parágrafo único manda os estabelecimentos educacionais e similares manter fichas cadastrais e certidões de antecedentes atualizadas de todos os colaboradores, e a EBD pode ser tida como similar); Art. 7º, IX — legítimo interesse na proteção de crianças e adolescentes; Art. 14 — melhor interesse da criança. A Igreja adota a exigência (com atualização semestral) por cautela e pelo Regimento Art. 133 §5º, sem afirmar que a lei a obriga em todos os casos.",
    tabelasEnvolvidas: ["MinisterioMenoresPoliticaAceites", "MinisterioMenoresSalas", "MinisterioMenoresRetiradas", "MinisterioMenoresCadastroNacional", "VoluntariosHabilitacao"],
    retencao: "O aceite da política e a retirada da escala são prova do dever cumprido: ficam enquanto a pessoa servir, sem prazo final, e não se alteram nem se apagam (gatilho no banco). IP e cabeçalhos do aceite: anonimizados 5 anos depois, na rotina diária (LGPD art. 16). A validade das certidões é CALCULADA na leitura pela data de emissão guardada no Termo de Vistoria (180 dias): nada disso vira dado novo. A retirada da escala diz só os códigos dos motivos, e quem gere a congregação vê apenas 'pendência com a Diretoria' quando o motivo é reservado. Departamentos e cargos de liderança marcados com contato com crianças (Departamentos.ContatoComMenores, Papeis.ContatoComMenores; Trava 7-C, decisão de 23/10/2026): quem os ocupa sem aptidão aparece para a Diretoria e para a Proteção de crianças do nível geral, num painel calculado na leitura e num aviso mensal que diz só 'não está apto para função com menores' — nada novo é gravado sobre a pessoa e ninguém sai do cargo sozinho."
  },
  {
    chave: "AUTO_DENUNCIA",
    finalidade: "Receber o aviso do voluntário ou da liderança que passa a responder a inquérito ou processo criminal (Regimento Art. 133 §5º, V — a omissão é falta grave), avisar a Diretoria Executiva na hora, suspender por cautela o contato dele com menores até a decisão e registrar a decisão da Diretoria (manter ou afastar preventivamente) e, depois, a liberação do afastamento.",
    titulares: "Voluntários e lideranças que comunicam; a Diretoria Executiva e o Conselho de Ética, que decidem",
    categoriasDados: ["Matrícula, o tipo (inquérito policial, processo criminal ou outro procedimento criminal) e a data em que a pessoa soube — nenhum texto livre, nenhum número de processo", "A decisão da Diretoria, quem decidiu, quando e o motivo curto (sem nomes de terceiros)", "A liberação do afastamento, se houve"],
    baseLegal: "LGPD Art. 7º, II — obrigação legal, onde a lei alcança (ECA art. 59-A, Lei 14.811/2024: o caput vale para a instituição que recebe recurso público; o parágrafo único, para estabelecimentos educacionais e similares); Art. 7º, IX — legítimo interesse na proteção de crianças e adolescentes (Regimento Art. 133 §5º, V, adotado por cautela); Art. 14 — melhor interesse da criança. É dado sobre processo criminal: o acesso é restrito à Diretoria Executiva e ao Conselho de Ética, a auditoria não leva o tipo nem a data, e o aviso não leva o conteúdo.",
    tabelasEnvolvidas: ["MinisterioMenoresAutoDenuncias"],
    retencao: "A comunicação e a decisão são registro documental (gatilho no banco: não se apagam nem se alteram; a decisão entra uma vez e a liberação, uma vez): guardadas enquanto a pessoa servir e por 5 anos depois, como prova do dever cumprido. A pessoa vê tudo isso em Meus Dados."
  },
  {
    chave: "INCIDENTES_DE_PROTECAO",
    finalidade: "Registrar incidentes de proteção de crianças e adolescentes em três níveis (quase-acidente, quebra de política e suspeita ou relato de violência), cumprir o dever de comunicar a suspeita ao Conselho Tutelar imediatamente (ECA Arts. 13 e 70-B, parágrafo único — quem cuida de criança por ministério responde pelo retardamento; Lei 14.344/2022, arts. 23 e 26), com o prazo MÁXIMO interno de 24 horas, guardar o relato espontâneo exatamente como foi contado (Lei 13.431/2017: acolher e encaminhar, sem inquirir), afastar por cautela o envolvido do contato com menores até a decisão do Comitê de Proteção e produzir o relatório anual de conformidade — v7.8",
    titulares: "Crianças e adolescentes que contam ou de quem se suspeita que sofreram violência; quem registra; a pessoa apontada como envolvida; a liderança de proteção (Diretoria, Comitê e Dirigente) que comunica e decide",
    categoriasDados: ["Nível, data, local e descrição factual do incidente; congregação e equipe; protocolo interno", "O RELATO ESPONTÂNEO da criança ou de quem a ouviu (dado sensível de criança): tabela à parte, só de acréscimo, e cada leitura é registrada (quem e quando, nunca o conteúdo)", "Quem relatou (a criança, o responsável, um voluntário ou outra pessoa) e, no canal de ajuda sem login, o contato que a pessoa quiser deixar (nenhum IP é guardado)", "A pessoa envolvida (matrícula ou nome) e as decisões do Comitê sobre o afastamento cautelar, com quem decidiu e o motivo curto", "A comunicação ao órgão de proteção: órgão, forma, data e hora, protocolo do órgão, onde o comprovante está guardado e se foi no prazo", "Reclassificações do nível e encerramento com a providência"],
    baseLegal: "LGPD Art. 11, II, \"a\" — cumprimento de obrigação legal (ECA arts. 13 e 70-B, parágrafo único: comunicar ao Conselho Tutelar a suspeita ou a confirmação de violência; Lei 14.344/2022, arts. 23 e 26), e \"e\" — proteção da vida e da incolumidade física da criança; Art. 14 — melhor interesse da criança. O acesso é restrito à liderança de proteção (permissão protecao_menores, sessão de liderança); o relato exige a confirmação reforçada; quem é envolvido nunca vê o incidente; a auditoria não leva o nível, o envolvido nem o conteúdo, e os avisos (que saem por e-mail) não levam nome nem relato.",
    tabelasEnvolvidas: ["IncidentesProtecao", "IncidenteEnvolvidos", "IncidenteDecisoesCautelares", "IncidenteRelatos", "IncidenteLeituras", "IncidenteComunicacoes", "IncidenteReclassificacoes"],
    retencao: "O incidente e seus registros são documentais: não se alteram nem se apagam (gatilhos no banco). Guardados por 20 anos do encerramento (PoliticasRetencao 'Incidentes de proteção de crianças e adolescentes'), porque o prazo de apuração do crime corre a partir dos 18 anos da vítima. O titular que é a pessoa apontada exerce o direito de acesso por pedido ao Encarregado, que avalia caso a caso para não comprometer a apuração das autoridades (LGPD Art. 18, § 4º e Art. 4º, III, d, por analogia: segurança pública e investigação); o afastamento cautelar é mostrado a ela em Meu Painel, sem o motivo."
  },
  {
    chave: "CHECKIN_INFANTIL",
    finalidade: "Controlar a entrega e a retirada de crianças e adolescentes nas salas do ministério infantil, provar a quem cada criança foi entregue (código de retirada por criança, lista de pessoas autorizadas, retirada divergente só com a liderança, segunda via com dois adultos), imprimir no crachá a alergia ou condição de saúde que o responsável escolheu informar e conferir a proporção de adultos por criança com quem de fato está na sala — v7.10",
    titulares: "Crianças e adolescentes (membros ou visitantes); os responsáveis legais cadastrados pela Secretaria; as pessoas que o responsável autoriza a retirar; quem traz uma criança visitante; os voluntários que operam a sala",
    categoriasDados: ["Registro de cada criança em cada visita: sala, serviço, idade, quem a entregou e quem a retirou (membro ou nome), horários e quem da equipe atendeu", "Criança visitante: nome e data de nascimento só para a visita; de quem a trouxe: nome, parentesco, tipo do documento conferido (nunca o número) e telefone", "Código de retirada: só o HMAC (o texto do código nunca é guardado, registrado em log nem enviado à auditoria)", "Lista de pessoas autorizadas a retirar: nome, parentesco, validade, quem registrou e a ficha, se houver (a autorização feita por um responsável vale só enquanto ele continua sendo responsável cadastrado)",
      "Baixa administrativa da criança que ficou na sala sem retirada registrada (quem deu a baixa e o motivo escrito pela liderança) e o motivo do pedido de retirada divergente, que o voluntário anota", "ALERGIA OU CONDIÇÃO DE SAÚDE (dado sensível de criança): só com o consentimento específico e em destaque do responsável (finalidade SAUDE_CRACHA); revogar apaga o dado e as cópias", "Histórico de acréscimo dos atos (entrega, erro de código, retirada, divergência, segunda via, entrada e saída de voluntário): quem, quando e um código curto, sem nome de criança nem texto livre", "Presença dos voluntários na sala (entrada e saída)"],
    baseLegal: "LGPD Art. 14 — melhor interesse da criança; Art. 7º, II e IX — dever legal de prevenção e proteção (ECA arts. 70 e 70-B; Lei 14.811/2024) e legítimo interesse na guarda segura; Art. 11, I — consentimento específico e destacado do responsável para o dado de saúde, e II, e — proteção da incolumidade física. A criança só é retirada com o código; quem não está na lista só sai com a aprovação da liderança (confirmação reforçada); o responsável vê só o histórico dos próprios filhos. Quando um terceiro (quem trouxe sem ser responsável cadastrado, ou o indicado só para a visita por essa pessoa) entrega ou retira a criança, o responsável cadastrado recebe um aviso obrigatório com o nome desse terceiro e o primeiro nome da criança (nunca documento, telefone nem saúde): é o responsável legal quem decide quem guarda a criança, e ele precisa saber na hora.",
    tabelasEnvolvidas: ["CheckinInfantilRegistros", "CheckinInfantilEventos", "CheckinInfantilVoluntarios", "CheckinInfantilAutorizados", "CheckinInfantilAutorizadosVisita", "CheckinInfantilSaude", "CheckinInfantilSegundasVias"],
    retencao: "O registro de custódia é guardado por 5 anos (PoliticasRetencao 'Check-in infantil (entrega e retirada de crianças)'), prova de a quem a criança foi entregue; depois é anonimizado (inclusive a baixa administrativa e os textos livres que a liderança e o voluntário escreveram: motivo da decisão, do pedido e da baixa; o nome de quem pediu a segunda via sai junto). As pessoas autorizadas a retirar (nome, matrícula e referência da ficha) perdem a identificação 5 anos depois de revogadas ou vencidas. O telefone de quem trouxe um visitante e o dado de saúde informado no balcão são apagados em 90 dias (rotina diária). A saúde cadastrada e as cópias nos registros são apagadas na MESMA transação que grava a revogação do consentimento (Trava 7-C: se o apagar falhar, a revogação também não fica e a pessoa tenta de novo; a leitura confere o consentimento na hora e a rotina diária segue como rede) e, pela rotina diária, quando o responsável deixa de ser ativo ou a criança faz 18 anos; a exclusão LGPD do titular a apaga na mesma transação e revoga as autorizações de retirada em que ele é o autorizado, mas o registro de custódia (quem trouxe e quem retirou) fica pelos 5 anos. O histórico de atos não se altera nem se apaga (gatilho no banco)."
  },
  {
    chave: "CUIDADO_PASTORAL",
    finalidade: "Cuidar de quem precisa (Regimento Art. 128 §5º — a Busca Ativa do visitante em 48 horas): a fila de acompanhamento com responsável nomeado e prazo (visitante, novo convertido, membro afastado, pedido de visita, pedido de oração, pós-internação), que sobe na hierarquia quando vence (Dirigente → Pastor de Área → Superintendente Regional → nível geral); a detecção de afastamento pela queda da frequência da PRÓPRIA pessoa na EBD e nas reuniões; as notas pastorais com sigilo; e os pedidos de oração com moderação, boletim sem nome e sinal de risco (autolesão, violência) — v7.11",
    titulares: "Membros, visitantes e novos convertidos acompanhados; quem pede oração ou visita; os responsáveis nomeados e a liderança que cuida; quem manda pedido pelo mural de oração do SITE (visitante, nome opcional — v7.11.1; o pedido vem do site da Igreja: Directus → sistema, servidor a servidor, com a chave combinada)",
    categoriasDados: ["Item de acompanhamento: tipo, congregação, a pessoa (matrícula, ou nome e contato de quem não é do cadastro), motivo curto, prazo, degrau, responsável, desfecho", "Histórico de acréscimo: contatos (forma, se conseguiu falar, quem foi junto na visita, observação curta), trocas de responsável, prazos adiados, degraus", "Frequência usada pela detecção (presença e ausência na EBD e nas reuniões encerradas) e o resumo em números que justifica o item", "NOTAS PASTORAIS (dado sensível: aconselhamento, saúde, família, vida espiritual), em três níveis de sigilo, e o registro de cada abertura (quem e quando)", "Pedidos de oração (assunto, texto, se pode ir ao boletim, se quer contato), a linha sem nome do boletim, a moderação e o sinal de risco", "Mural do site (v7.11.1): o texto do pedido CONFIDENCIAL ou com SINAL DE RISCO e o nome, se a pessoa deu, copiados para o sistema (PedidosOracao, origem SITE, só o nível geral vê) com a referência do item no site; o pedido comum não é copiado"],
    baseLegal: "LGPD Art. 11, II, \"d\" — exercício regular de direitos da associação religiosa na relação pastoral com os seus membros (Regimento Arts. 85 e 128), e \"e\" — proteção da vida e da incolumidade física, para o sinal de risco (inclusive o do mural do site); Art. 11, I — consentimento, para o pedido de oração que a própria pessoa manda (no sistema ou no mural do site) e decide se vai ao boletim. O acesso é hierarquizado (Regimento Art. 132 §1º): a liderança vê só o seu território, o responsável só os itens dele e a pessoa acompanhada nunca vê o item nem as notas sobre ela. Liderança com pendência reservada à Diretoria (afastamento cautelar, comunicação em análise, fora de comunhão etc.) não acessa item, nota nem pedido de criança ou adolescente e deixa de ser responsável pelos que tinha; o pedido com sinal de risco sobre criança, ou feito por menor, fica só com o nível geral, e a Proteção de crianças do nível geral recebe o aviso, sem o texto, com o prazo do Conselho Tutelar (Trava 7-C).",
    tabelasEnvolvidas: ["CuidadoItens", "CuidadoEventos", "NotasPastorais", "NotasPastoraisLeituras", "PedidosOracao"],
    retencao: "O item encerrado fica 5 anos e depois perde a identificação (PoliticasRetencao 'Cuidado pastoral — acompanhamentos'); o pedido de oração (também o que veio do mural do site) perde o texto e o nome em 1 ano, ou em 5 se teve sinal de risco; as notas pastorais de quem saiu são apagadas em 30 dias (Regimento Art. 132 §2º, II) e a exclusão LGPD as apaga na hora. O histórico e as notas não se alteram (gatilhos no banco). A pessoa vê em Meus Dados os pedidos que fez e quantas notas e acompanhamentos existem sobre ela. No mural do site: o pedido confidencial ou com risco entregue ao sistema perde o texto e o nome no Directus (fica só a marca); sem resposta do sistema, fica confidencial e marcado para reenvio. O mural não guarda telefone nem conta: a exclusão de um pedido público é feita pela moderação do painel, apagando o item (Trava 7-C)."
  },
  {
    chave: "AFM_FALTAS_CLI",
    finalidade: "Academia de Formação Ministerial e comparecimento obrigatório à CLI (Estatuto Art. 15 §1º e 27; Regimento Art. 22, 66 a 69, 72 e 149) — v8.1: a matrícula obrigatória de todo oficial, o nível de escolaridade, a desmatrícula (3 Sessões Magnas seguidas sem justificativa, ou reprovação técnica) e a licença para oficiar; o Reitor e o corpo docente; a exclusão da CLI por 3 faltas seguidas, a comunicação à CLI e a readmissão; a justificativa de falta pelo catálogo fechado do Art. 149 §2º",
    titulares: "Oficiais do Campo (Auxiliar a Pastor), quem compõe a CLI, o Reitor e os docentes",
    categoriasDados: ["Matrícula: situação, origem, data, nível e se concluiu, aprovação na reciclagem", "Desmatrícula: motivo (faltas ou reprovação), data, as reuniões que a causaram ou a avaliação, anulação", "Exclusão da CLI: data, as 3 reuniões, por onde a pessoa entrava (cargo, cadeira, liderança), comunicação à CLI, readmissão e o ato, anulação", "Reitor e docentes: titulação, datas, mandato, homologação da CLI", "Presença em reunião: se a pessoa era esperada pela CLI e/ou pela Academia; justificativa de falta pelo catálogo (SAÚDE é dado sensível: só o código fica guardado por tempo longo; o detalhe escrito sai em 2 anos)"],
    baseLegal: "LGPD Art. 7º, II e IX e Art. 11, II, \"d\" — exercício regular de direitos da associação religiosa: o Estatuto e o Regimento obrigam a matrícula, a contagem de faltas e a habilitação para oficiar. A exclusão e a desmatrícula por faltas são apuradas pelo sistema a partir das presenças (nunca marcadas à mão) e se desfazem sozinhas quando a falta é justificada; a pessoa é avisada na 2ª falta seguida e vê a própria situação no Meu Painel.",
    tabelasEnvolvidas: ["Matriculas_AFM", "AFMDesmatriculas", "CLIExclusoesFaltas", "AFMCorpoDocente"],
    retencao: "Matrícula, desmatrícula, corpo docente e exclusões da CLI ficam enquanto a pessoa for membro (PoliticasRetencao 'AFM — matrículas, desmatrículas e corpo docente' e 'CLI — exclusões por faltas'; histórico de habilitação e de governança); a desmatrícula e a exclusão não se apagam nem se editam (gatilhos no banco: só se anulam, com motivo). O detalhe escrito da justificativa de falta da CLI sai 2 anos depois da reunião (rotina diária; 'CLI — detalhe da justificativa de falta'); o código do catálogo fica. A pessoa vê tudo isso em Meus Dados."
  },
  {
    chave: "CRISE_SEGURANCA",
    finalidade: "Regime de crise com Porta-Voz Único (Regimento Art. 161-B): quem ordenou, o porta-voz (o Presidente ou o profissional designado, com o ato), o aviso obrigatório a toda a liderança, as manifestações autorizadas e os pedidos da imprensa com a resposta; e a segurança de cada congregação: plano de emergência, simulados, vistoria predial (com o AVCB e o seguro) e equipe de segurança — v7.15",
    titulares: "A liderança ativa (destinatária do aviso; quem registra pedido da imprensa, manifestação ou resposta); o porta-voz designado (pode não ser membro); quem pediu pela imprensa (o contato informado); os membros adultos da equipe de segurança",
    categoriasDados: ["Regime de crise: quem ordenou e quem registrou, motivo, porta-voz (nome, contato, matrícula se for membro, ato da designação), datas", "Aviso da crise: o registro de entrega por pessoa e canal, leitura e ciência (a comunicação da v7.12, categoria CRISE)", "Manifestações: data, canal, quem falou, resumo, link ou documento, quem autorizou, quem registrou", "Pedidos da imprensa: veículo, contato de quem pediu, pedido, prazo, quem registrou; a resposta e quem respondeu", "Equipe de segurança: matrícula, congregação, função, desde e até, motivo da saída", "Plano de emergência (texto: rotas, pontos de encontro, contatos e responsáveis), simulados e vistorias: quem registrou e quem anulou"],
    baseLegal: "LGPD Art. 7º, IX — legítimo interesse da Igreja em proteger a sua imagem e as pessoas nos templos (Regimento Art. 161-B; normas do Corpo de Bombeiros), e Art. 7º, VI — exercício regular de direitos: o histórico do que a Igreja disse, por quem e com autorização de quem, é a prova numa eventual responsabilização (§ 2º). O aviso da crise é obrigatório e vai a toda a liderança, sem link de saída.",
    tabelasEnvolvidas: ["CriseRegimes", "CriseHistorico", "CriseManifestacoes", "CriseDemandasImprensa", "CriseDemandaRespostas", "SegurancaPlanos", "SegurancaSimulados", "SegurancaVistorias", "SegurancaVistoriaItens", "SegurancaEquipe"],
    retencao: "O histórico da crise fica sem prazo e não se edita (gatilhos no banco; correção é linha nova). O contato de quem pediu pela imprensa é apagado 5 anos depois de recebido o pedido (PoliticasRetencao 'Crise — contato do jornalista na demanda de imprensa'). O registro de entrega do aviso da crise fica 5 anos, como a convocação oficial, e fica mesmo depois de uma exclusão LGPD (prova do aviso). Quem sai da congregação ou é desligado sai da equipe de segurança na rotina diária; o nome sai do registro 5 anos depois de sair da equipe, ou na hora pela exclusão LGPD. A pessoa vê em Meus Dados a equipe de segurança, as crises em que foi porta-voz e quantos registros dela existem. Contatos locais e responsáveis (texto livre) das versões substituídas do plano de emergência são anonimizados 5 anos depois da substituição (PoliticasRetencao 'Plano de emergência — contatos das versões antigas', ajustável); a versão vigente permanece. Na exclusão LGPD o nome no texto livre não é localizável com segurança: o Encarregado edita o plano vigente (versão nova, sem o nome) e a antiga cai na retenção. A equipe de segurança perde, na rotina diária, quem tem pendência reservada ou está fora de comunhão (motivo AFASTADO). Meus Dados lista os atos do titular no regime de crise (Trava 7-C)."
  },
  {
    chave: "AUDITORIA",
    finalidade: "Trilha de integridade e compliance (quem fez o quê, quando)",
    titulares: "Quem usa o sistema (Liderança)",
    categoriasDados: ["Ação, usuário, hash da cadeia"],
    baseLegal: "LGPD Art. 16, I — cumprimento de obrigação legal/regulatória (governança)",
    tabelasEnvolvidas: ["AuditLog"],
    retencao: "Indeterminada — trilha imutável (PoliticasRetencao)"
  }
];

// Só a contagem é derivada de verdade (SELECT COUNT(*) por tabela) — o
// resto (finalidade/base legal/retenção) é o julgamento humano que um ROPA
// exige, não algo que o próprio schema "sabe" sozinho.
async function montarRopa(pool, sql) {
  const registros = [];
  for (const registro of REGISTROS_TRATAMENTO) {
    const contagens = {};
    for (const tabela of registro.tabelasEnvolvidas) {
      const resultado = await pool.request().query(`SELECT COUNT(*) AS total FROM ${tabela}`);
      contagens[tabela] = resultado.recordset[0].total;
    }
    registros.push(Object.assign({}, registro, { contagens }));
  }
  return registros;
}

module.exports = { REGISTROS_TRATAMENTO, montarRopa };
