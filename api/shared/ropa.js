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
    baseLegal: "LGPD Art. 11, II, \"a\" — organização religiosa, dado de pessoa com vínculo regular (dispensa consentimento)",
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
    baseLegal: "LGPD Art. 11, II, \"a\"/\"c\" — obrigação legal/exercício regular de direitos da organização religiosa",
    tabelasEnvolvidas: ["ProcessosDisciplinares", "ProcessoInfracoes", "MedidasCautelares"],
    retencao: "Indeterminada (PoliticasRetencao — histórico disciplinar/reincidência, Regimento Art. 77)"
  },
  {
    chave: "FINANCEIRO",
    finalidade: "Gestão financeira, dízimos/ofertas e prestação de contas",
    titulares: "Dizimistas (membros e avulsos)",
    categoriasDados: ["Nome, valor, forma de pagamento"],
    baseLegal: "LGPD Art. 11, II, \"a\" — obrigação estatutária de prestação de contas",
    tabelasEnvolvidas: ["Dizimistas", "LancamentosTesouraria"],
    retencao: "Indeterminada — exigência de prestação de contas contínua (Estatuto Art. 36)"
  },
  {
    chave: "COMUNICACAO",
    finalidade: "Notificação institucional (prazo vencendo, pendência, aviso operacional) — NUNCA marketing",
    titulares: "Membros com Lideranca (destinatários de notificação)",
    categoriasDados: ["E-mail, inscrição push"],
    baseLegal: "LGPD Art. 11, II, \"a\" — comunicação inerente ao exercício da função/vínculo, com opt-out por categoria (NotificacaoPreferencias, vB.2)",
    tabelasEnvolvidas: ["Notificacoes", "PushInscricoesMembro"],
    retencao: "Notificação: indeterminada enquanto não arquivada. Inscrição push: até o dispositivo revogar/desinstalar."
  },
  {
    chave: "VINCULO_FAMILIAR_MENOR",
    finalidade: "Registro de vínculo familiar e identificação de responsável legal de menor",
    titulares: "Membros menores de idade e seus responsáveis",
    categoriasDados: ["Vínculo de parentesco", "Flag de responsável legal"],
    baseLegal: "LGPD Art. 11, II, \"a\" + Art. 14 (melhor interesse da criança)",
    tabelasEnvolvidas: ["VinculosFamiliares"],
    retencao: "Enquanto durar o vínculo familiar/de membresia"
  },
  {
    chave: "EBD",
    finalidade: "Escola Bíblica Dominical: turmas, chamada, caderneta, atividades, alerta de ausência ao professor (FASE 6)",
    titulares: "Alunos (membros e não-membros, inclusive crianças), professores e visitantes da EBD",
    categoriasDados: ["Identificação (nome)", "Presença por domingo", "Respostas de atividade", "Não-membro: contato, nascimento, responsável (menor)", "Visitante: nome e contato"],
    baseLegal: "LGPD Art. 11, II, \"a\" — organização religiosa (membros); Art. 7º, IX e Art. 14 (legítimo interesse/melhor interesse da criança, com responsável) para não-membros e visitantes",
    tabelasEnvolvidas: ["EbdAlunos", "EbdChamadas", "EbdRespostasAlunos", "EbdCadernetas"],
    retencao: "Presença e matrícula de membro: enquanto durar o vínculo. Visitante: nome/contato anonimizados após 12 meses; aluno não-membro: anonimizado 24 meses após encerrar a matrícula (rotina diária — PoliticasRetencao). O Encarregado anonimiza antes, a pedido (Proteção de Dados → EBD)."
  },
  {
    chave: "FORMACAO",
    finalidade: "Trilhas de formação, conclusão de módulos e certificado verificável usado como requisito (v6.5/v6.9)",
    titulares: "Membros em formação",
    categoriasDados: ["Matrícula e progresso em trilha", "Certificado (titular, título, validade, código de verificação)"],
    baseLegal: "LGPD Art. 11, II, \"a\" — organização religiosa; Art. 7º, IX — prova da formação exigida pelos fluxos (consagração, liderança, escala)",
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
    baseLegal: "LGPD Art. 7º, IX — legítimo interesse da instituição em organizar a programação; Art. 11, II, \"a\" — organização religiosa, para a justificativa de ausência (que pode ser dado de saúde, visível só à Secretaria e à CLI). O que vai ao site público é só título, data, local e congregação — nenhum nome de pessoa.",
    tabelasEnvolvidas: ["CalendarioEventos", "CalendarioPresencasDirigente"],
    retencao: "Calendário: indeterminada — o histórico de anos homologados sustenta o Direito Adquirido Temporal (PoliticasRetencao). Presença na Ceia Geral e justificativa: também sem prazo de descarte por ora (a política da categoria não separa a justificativa) — a CLI deve definir quando anonimizar o texto livre."
  },
  {
    chave: "CANAIS",
    finalidade: "Relação de Canais Oficiais de Comunicação, administradores com Termo de Dever de Moderação, ocorrências de conteúdo irregular (Regra das 24 Horas) e conformidade da transmissão dos cultos (Estatuto Art. 12; Regimento Art. 157 §5º, 160 e 160-A) — v7.3",
    titulares: "Administradores e operadores de canais; membros que avisam conteúdo irregular; membros citados na descrição de uma ocorrência; quem sai de uma liderança (pendência de troca de senha)",
    categoriasDados: ["Matrícula de quem administra, avisou, removeu o conteúdo e decidiu", "Aceite do Termo de Dever de Moderação (versão, hash do texto e hora)", "Descrição livre do conteúdo irregular (pode citar nome de membro e revelar opinião política) e link de evidência", "Contato institucional dos canais (número, e-mail, perfil) — nunca contato pessoal, a validação recusa", "Nenhuma senha: o sistema guarda só quem custodia e a data da última troca"],
    baseLegal: "LGPD Art. 7º, IX — legítimo interesse da instituição em moderar os próprios canais e provar diligência (Marco Civil da Internet; Regimento Art. 160, §1º). A descrição de uma ocorrência pode revelar opinião política (dado sensível): Art. 11, II, \"d\" — exercício regular de direitos, em especial a prova de diligência. Quem avisou não é revelado ao administrador do canal.",
    tabelasEnvolvidas: ["CanaisOficiaisComunicacao", "CanalAdministradores", "CanalOcorrencias", "CanalTrocasCredencial", "CanalConferencias", "CongregacaoTransmissao"],
    retencao: "Ocorrências e administradores: 5 anos, por margem sobre a prescrição da reparação civil (PoliticasRetencao); a rotina automática de descarte ainda não existe e o prazo é decisão da CLI/Encarregado. Registro dos canais, conferências e transmissão: enquanto o canal existir; o desativado mantém o histórico (prova das tentativas de contato do Abandono Digital)."
  },
  {
    chave: "EVENTOS",
    finalidade: "Governança do evento: organizadores, Protocolo de Convidados externos (parecer do Conselho de Ética e Nada Consta da Presidência) e Caixa Flutuante de Eventos com prestação de contas (Regimento Art. 53-E §2º, 111, 111-A e 152) — v7.4",
    titulares: "Convidados externos (preletores e cantores, terceiros à Igreja), organizadores e tesoureiros do evento, e quem decide os convites",
    categoriasDados: ["Nome, ministério ou igreja de origem e contato do convidado externo (dado de terceiro)", "Declaração sobre a reputação do convidado e os pareceres sobre ele (alinhamento doutrinário pode revelar convicção religiosa)", "Autorização do convidado para divulgar o nome", "Matrícula de quem organiza, lança, encerra e confere o caixa", "Lançamentos financeiros do evento (valor, categoria, comprovante) — sem dado de doador individual"],
    baseLegal: "LGPD Art. 7º, IX — legítimo interesse da instituição em proteger o púlpito e prestar contas (Regimento Art. 111-A e 152); Art. 7º, I — consentimento do convidado para divulgar o nome no site; o parecer sobre alinhamento doutrinário trata convicção religiosa (dado sensível): Art. 11, II, \"d\" — exercício regular de direitos, limitado à Ética, à Presidência e à organização do evento. O contato do convidado nunca vai ao site.",
    tabelasEnvolvidas: ["EventoOrganizadores", "EventoConvidados", "EventoCaixas", "EventoCaixaLancamentos", "EventoCaixaDestinos"],
    retencao: "Caixa e prestação de contas: 5 anos (guarda fiscal, CTN art. 173; PoliticasRetencao). Convidado externo: o registro do protocolo fica como prova, mas o contato é desnecessário depois do evento e a rotina automática de descarte AINDA NÃO existe — o prazo é decisão da CLI/Encarregado, que pode anonimizar antes, a pedido do convidado."
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
    baseLegal: "LGPD Art. 7º, II — obrigação legal (ECA art. 59-A, incluído pela Lei 14.811/2024, para quem atua com crianças e adolescentes); Art. 7º, IX — legítimo interesse em proteger o rebanho (Regimento Art. 133 §5º). O consentimento prévio de todo voluntário consta do Termo de Adesão (§5º, III). Acesso restrito à Diretoria Executiva e ao Conselho de Ética (§5º, IV, a).",
    tabelasEnvolvidas: ["VistoriasAntecedentes", "VistoriasDocumentos", "VistoriasAnulacoes"],
    retencao: "O Termo de Vistoria é arquivo interno obrigatório da Igreja (Art. 133 §5º, IV, c) e não se altera nem se apaga (gatilho no banco); por conter só o hash, é dado mínimo. O Regimento manda arquivar e não fixa prazo: o termo fica sem prazo final de descarte; o termo lavrado por engano é ANULADO por registro à parte (não se apaga). O titular recebe o termo, a pedido, em Meus Dados."
  },
  {
    chave: "CONSENTIMENTO_MENOR",
    finalidade: "Registrar o consentimento específico e em destaque do responsável legal para tratar a imagem do menor (foto no cadastro, no crachá e em materiais internos) e a alergia ou condição de saúde que ele escolha informar para o crachá do check-in infantil — versionado e revogável (LGPD Art. 14, § 1º, e Art. 11, I) — v7.7",
    titulares: "Crianças e adolescentes (menores de 18 anos) e os responsáveis legais que autorizam (pai, mãe, tutor ou outro responsável legal cadastrado pela Secretaria com o documento conferido), e quem registra a ficha assinada",
    categoriasDados: ["Matrícula do menor e do responsável, a finalidade (imagem ou saúde no crachá), se autorizou ou revogou, a forma (autorização digital ou ficha assinada) e quando", "Versão e hash do texto que o responsável viu e aceitou (a prova do que foi autorizado)", "Autorização digital: o ENDEREÇO IP e a cadeia dos cabeçalhos de origem da conexão do RESPONSÁVEL, a data e a hora", "Ficha assinada: a referência de onde está o documento (número, pasta ou arquivo) e a matrícula de quem a registrou na Secretaria", "Esta tabela guarda só o CONSENTIMENTO, nunca o dado de saúde (o dado — alergia, condição médica — só chega com o check-in infantil, v7.10); a foto fica no Blob Storage e é apagada na revogação"],
    baseLegal: "LGPD Art. 14, § 1º — consentimento específico e em destaque de ao menos um dos pais ou do responsável legal, para dado de criança e de adolescente; Art. 11, I — consentimento específico e destacado do responsável, para o dado sensível de saúde; Art. 8º, § 5º — revogável a qualquer momento. É opcional e NÃO condiciona a participação do menor em nenhuma atividade. O IP do aceite é registro da prova (Regimento Art. 133 § 8º, II), informado ao responsável no próprio texto.",
    tabelasEnvolvidas: ["MinisterioMenoresConsentimentos", "VoluntariadoResponsaveis"],
    retencao: "Cada concessão e cada revogação é uma linha de acréscimo, sem prazo final: é a prova do consentimento e não se altera nem se apaga (gatilho no banco). IP e cabeçalhos do aceite digital: anonimizados 5 anos depois do registro (parâmetro VOLUNTARIADO_IP_RETENCAO_DIAS; rotina diária; LGPD Art. 16). Revogar a imagem apaga o arquivo da foto na hora (shared/storage.js::excluirFoto). A autorização deixa de valer sozinha quando quem a deu deixa de ser responsável cadastrado do menor ou quando o menor completa 18 anos (calculado na leitura). O titular e o responsável recebem tudo isto, a pedido, em Meus Dados."
  },
  {
    chave: "MINISTERIO_COM_MENORES",
    finalidade: "Cumprir a Lei 14.811/2024 (art. 59-A do ECA): conferir, a cada escala, convite, troca e publicação, se quem serve com crianças e adolescentes está habilitado hoje (certidões de antecedentes em dia, treinamento de proteção, ficha confirmada, política de comunicação aceita e 6 meses de comunhão), garantir dois adultos habilitados e a proporção por faixa etária em cada sala, e retirar da escala quem deixou de estar habilitado.",
    titulares: "Voluntários que servem (ou pretendem servir) com crianças e adolescentes; líderes de equipe e a secretaria que habilita; a Diretoria Executiva e o Conselho de Ética, que conferem as certidões",
    categoriasDados: ["Matrícula, equipes com menores onde serve e escalas futuras", "Aceite da política de comunicação com menores: versão, hash do texto, forma, IP e cabeçalhos da conexão, data e hora (ou a referência da ficha assinada)", "Data da última confirmação da ficha cadastral", "Retiradas automáticas da escala: equipe, quantas escalas, data e os códigos dos motivos (nunca texto livre)", "Consulta ao cadastro nacional de condenados por crimes contra menores (só se um dia existir): fonte, resultado e data", "Número de crianças previstas por sala e serviço (dado do serviço, sem identificar criança)"],
    baseLegal: "LGPD Art. 7º, II — obrigação legal (ECA art. 59-A, incluído pela Lei 14.811/2024: entidades que atuam com crianças e adolescentes devem exigir e manter atualizados ficha cadastral e certidão de antecedentes de colaboradores e voluntários, com atualização semestral); Art. 7º, IX — legítimo interesse na proteção de crianças e adolescentes; Art. 14 — melhor interesse da criança.",
    tabelasEnvolvidas: ["MinisterioMenoresPoliticaAceites", "MinisterioMenoresSalas", "MinisterioMenoresRetiradas", "MinisterioMenoresCadastroNacional", "VoluntariosHabilitacao"],
    retencao: "O aceite da política e a retirada da escala são prova do dever cumprido: ficam enquanto a pessoa servir, sem prazo final, e não se alteram nem se apagam (gatilho no banco). IP e cabeçalhos do aceite: anonimizados 5 anos depois, na rotina diária (LGPD art. 16). A validade das certidões é CALCULADA na leitura pela data de emissão guardada no Termo de Vistoria (180 dias): nada disso vira dado novo. A retirada da escala diz só os códigos dos motivos, e quem gere a congregação vê apenas 'pendência com a Diretoria' quando o motivo é reservado."
  },
  {
    chave: "AUTO_DENUNCIA",
    finalidade: "Receber o aviso do voluntário ou da liderança que passa a responder a inquérito ou processo criminal (Regimento Art. 133 §5º, V — a omissão é falta grave), avisar a Diretoria Executiva na hora, suspender por cautela o contato dele com menores até a decisão e registrar a decisão da Diretoria (manter ou afastar preventivamente) e, depois, a liberação do afastamento.",
    titulares: "Voluntários e lideranças que comunicam; a Diretoria Executiva e o Conselho de Ética, que decidem",
    categoriasDados: ["Matrícula, o tipo (inquérito policial, processo criminal ou outro procedimento criminal) e a data em que a pessoa soube — nenhum texto livre, nenhum número de processo", "A decisão da Diretoria, quem decidiu, quando e o motivo curto (sem nomes de terceiros)", "A liberação do afastamento, se houve"],
    baseLegal: "LGPD Art. 7º, II — obrigação legal (ECA art. 59-A, Lei 14.811/2024: proteção de crianças e adolescentes); Art. 7º, IX — legítimo interesse (Regimento Art. 133 §5º, V); Art. 14 — melhor interesse da criança. É dado sobre processo criminal: o acesso é restrito à Diretoria Executiva e ao Conselho de Ética, a auditoria não leva o tipo nem a data, e o aviso não leva o conteúdo.",
    tabelasEnvolvidas: ["MinisterioMenoresAutoDenuncias"],
    retencao: "A comunicação e a decisão são registro documental (gatilho no banco: não se apagam nem se alteram; a decisão entra uma vez e a liberação, uma vez): guardadas enquanto a pessoa servir e por 5 anos depois, como prova do dever cumprido. A pessoa vê tudo isso em Meus Dados."
  },
  {
    chave: "INCIDENTES_DE_PROTECAO",
    finalidade: "Registrar incidentes de proteção de crianças e adolescentes em três níveis (quase-acidente, quebra de política e suspeita ou relato de violência), cumprir o dever de comunicar a suspeita ao Conselho Tutelar em até 24 horas (ECA Art. 13), guardar o relato espontâneo exatamente como foi contado (Lei 13.431/2017: acolher e encaminhar, sem inquirir), afastar por cautela o envolvido do contato com menores até a decisão do Comitê de Proteção e produzir o relatório anual de conformidade — v7.8",
    titulares: "Crianças e adolescentes que contam ou de quem se suspeita que sofreram violência; quem registra; a pessoa apontada como envolvida; a liderança de proteção (Diretoria, Comitê e Dirigente) que comunica e decide",
    categoriasDados: ["Nível, data, local e descrição factual do incidente; congregação e equipe; protocolo interno", "O RELATO ESPONTÂNEO da criança ou de quem a ouviu (dado sensível de criança): tabela à parte, só de acréscimo, e cada leitura é registrada (quem e quando, nunca o conteúdo)", "Quem relatou (a criança, o responsável, um voluntário ou outra pessoa) e, no canal de ajuda sem login, o contato que a pessoa quiser deixar (nenhum IP é guardado)", "A pessoa envolvida (matrícula ou nome) e as decisões do Comitê sobre o afastamento cautelar, com quem decidiu e o motivo curto", "A comunicação ao órgão de proteção: órgão, forma, data e hora, protocolo do órgão, onde o comprovante está guardado e se foi no prazo", "Reclassificações do nível e encerramento com a providência"],
    baseLegal: "LGPD Art. 7º, II — obrigação legal (ECA Art. 13: comunicar ao Conselho Tutelar a suspeita ou confirmação de maus-tratos; Art. 245: multa pela omissão); Art. 11, II, a e e — tutela da saúde e proteção da vida e da incolumidade física; Art. 14 — melhor interesse da criança. O acesso é restrito à liderança de proteção (permissão protecao_menores, sessão de liderança); o relato exige a confirmação reforçada; quem é envolvido nunca vê o incidente; a auditoria não leva o nível, o envolvido nem o conteúdo, e os avisos (que saem por e-mail) não levam nome nem relato.",
    tabelasEnvolvidas: ["IncidentesProtecao", "IncidenteEnvolvidos", "IncidenteDecisoesCautelares", "IncidenteRelatos", "IncidenteLeituras", "IncidenteComunicacoes", "IncidenteReclassificacoes"],
    retencao: "O incidente e seus registros são documentais: não se alteram nem se apagam (gatilhos no banco). Guardados por 20 anos do encerramento (PoliticasRetencao 'Incidentes de proteção de crianças e adolescentes'), porque o prazo de apuração do crime corre a partir dos 18 anos da vítima. O titular que é a pessoa apontada exerce o direito de acesso por pedido ao Encarregado, que avalia caso a caso para não comprometer a apuração das autoridades (LGPD Art. 18, § 4º e Art. 4º, III, d, por analogia: segurança pública e investigação); o afastamento cautelar é mostrado a ela em Meu Painel, sem o motivo."
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
