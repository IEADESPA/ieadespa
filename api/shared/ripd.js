// shared/ripd.js (vB.8 — RIPD: Relatório de Impacto à Proteção de Dados)
// Só entra aqui tratamento que É de alto risco E que EXISTE de verdade no
// sistema hoje — nada fabricado. O texto original da vB.8 citava "foto,
// dado de menor, nota pastoral, dado de saúde em evento" como exemplos de
// tratamento de risco; dos quatro, hoje só dois têm tabela/tratamento real
// (Foto, Dado de Menor) — os outros dois (nota pastoral, dado de saúde em
// evento) não têm NENHUM módulo no sistema ainda, então entram como
// "N/A hoje" em vez de um RIPD inventado sobre algo que não existe.
const RIPDS = [
  {
    chave: "FOTO",
    tratamento: "Foto do membro (identificação visual)",
    riscoIdentificado: "Imagem é dado que, combinado com nome/matrícula, identifica a pessoa com alta confiança; vazamento do Blob Storage exporia rosto + vínculo religioso (dado potencialmente sensível por associação).",
    medidasMitigacao: [
      "Container privado (sem acesso público direto — shared/storage.js)",
      "URL servida sempre via link assinado (SAS) de validade curta (1 hora)",
      "Consentimento real e revogável (ConsentimentosLGPD) — revogação exclui o arquivo, não só desativa a exibição (a revogação do FOTO apaga o blob e zera a referência no cadastro)",
      "Menor de 18 anos: o upload só passa com o consentimento de IMAGEM do responsável legal (MinisterioMenoresConsentimentos, v7.7); o consentimento genérico da própria criança ou adolescente não destrava a foto",
      "Nome do blob não é sequencial adivinhável fora do padrão membro-{id}, mas o container inteiro é privado, então isso é defesa em profundidade, não a única barreira"
    ],
    riscoResidual: "Baixo — mitigado pelas 3 camadas acima (privacidade do container + SAS temporário + consentimento revogável)."
  },
  {
    chave: "DADO_DE_MENOR",
    tratamento: "Cadastro de membro menor de idade + identificação do responsável legal",
    riscoIdentificado: "Dado de criança/adolescente exige cuidado reforçado (Art. 14) — exposição indevida do vínculo familiar ou dos dados de contato do responsável é o principal risco.",
    medidasMitigacao: [
      "Sem coluna dedicada de 'é menor' exposta publicamente — condição derivada de DataNascimento, calculada na leitura (estatuto.js::idadeEm)",
      "Vínculo com responsável legal (VinculosFamiliares.ResponsavelLegal) só é visível a quem tem permissão 'pessoas'",
      "Autoatendimento (MeusDadosLGPD) já exibe o vínculo pro próprio titular/responsável, nunca a terceiro",
      "v7.7 — consentimento parental ESPECÍFICO e em destaque (LGPD Art. 14, § 1º), separado do consentimento genérico: um para a imagem e outro para a saúde no crachá, cada um com texto próprio, versão e hash do texto que o responsável viu (tabela MinisterioMenoresConsentimentos, rota GestaoConsentimentoMenor)",
      "O aceite é do responsável legal cadastrado pela Secretaria com o documento conferido (VoluntariadoResponsaveis): digital, com IP, data e hora, ou ficha assinada registrada por OUTRA pessoa da Secretaria (quem registra nunca é o próprio responsável)",
      "Revogável a qualquer momento por qualquer responsável ativo, de graça: revogar a imagem apaga o arquivo da foto; a trilha é de acréscimo (cada concessão e revogação é uma linha, imutável por gatilho) e o IP é anonimizado depois da retenção",
      "A autorização só vale enquanto quem a deu ainda é responsável ativo do menor e o menor tem menos de 18 anos (calculado na leitura); idade desconhecida não se presume",
      "É opcional: o consentimento nunca condiciona a participação do menor em atividade nenhuma (o texto diz isso e o sistema não trava serviço por causa dele)"
    ],
    riscoResidual: "Baixo a médio — o consentimento parental específico e revogável passou a existir (v7.7) e o acesso ao dado segue restrito. O que resta: a dependência do cadastro correto do responsável legal (a Secretaria confere o documento) e da data de nascimento no cadastro; e as fotos de menores enviadas antes da v7.7, que seguem guardadas até a Secretaria regularizar com o responsável (o sistema não as apaga sozinho)."
  },
  {
    chave: "ANTECEDENTES_E_AUTO_DENUNCIA",
    tratamento: "Antecedentes criminais de quem serve com menores (certidões conferidas pela Diretoria, só o hash e a data de emissão guardados), a comunicação voluntária de inquérito ou processo (Regimento Art. 133 §5º, V) e o bloqueio automático da escala por habilitação vencida (v7.7).",
    riscoIdentificado: "Dado sobre processo criminal é altamente sensível na prática: exposição indevida a líderes, colegas ou ao próprio grupo gera constrangimento, perseguição e discriminação; e um bloqueio errado afasta quem não devia ser afastado.",
    medidasMitigacao: [
      "O documento da certidão NUNCA entra no sistema: só o hash SHA-256 e a data de emissão, calculado no aparelho de quem confere (Termo de Vistoria, v7.6)",
      "Acesso restrito: a vistoria e a fila de comunicações são da Diretoria Executiva e do Conselho de Ética (permissão vistoria_antecedentes, nível geral, sessão de liderança); decidir e liberar pedem a confirmação reforçada (vD.4)",
      "A gestão da congregação enxerga só 'pendência com a Diretoria' quando o motivo é reservado (restrição, comunicação em análise, cadastro nacional, fora de comunhão) — na lista, na situação das certidões e até nas contagens do resumo",
      "A comunicação do voluntário guarda só o tipo e a data da ciência: sem texto livre e sem número de processo; a auditoria não leva nem isso",
      "Os avisos de retirada da escala, vaga aberta e decisão NÃO citam o motivo; o aviso à pessoa diz que não é punição nem processo disciplinar",
      "A suspensão do contato com menores durante a análise é cautelar e vale só para o ministério com menores (nunca para os outros serviços); o afastamento é decidido por pessoa diferente do interessado e pode ser levantado, uma vez, também por outra pessoa da Diretoria",
      "Menor de 18 anos não tem certidão de antecedentes (ato infracional corre em segredo de justiça): serve só como auxiliar, nunca conta como adulto da sala",
      "A pessoa vê tudo o que a Igreja guarda sobre ela em Meus Dados (LGPD art. 18)"
    ],
    riscoResidual: "Médio — o dado é sensível por natureza e depende do bom uso da Diretoria. Mitigado pelo acesso restrito, pela máscara na gestão local, pela falta de texto livre e pela trilha imutável; o que resta é o risco humano de vazamento por quem tem acesso legítimo, que se trata com o termo de confidencialidade da Diretoria."
  },
  {
    chave: "INCIDENTES_DE_PROTECAO",
    tratamento: "Registro de incidentes de proteção de crianças e adolescentes, do relato espontâneo, da comunicação imediata ao Conselho Tutelar (prazo máximo interno de 24 horas), do afastamento cautelar do envolvido e do relatório anual do Comitê de Proteção (v7.8).",
    riscoIdentificado: "Dado de criança sobre violência é o mais sensível que a Igreja guarda: vazamento revitimiza e expõe; uma acusação falsa ou errada afasta e marca uma pessoa inocente; e a omissão da comunicação tem multa e, pior, deixa a criança desprotegida.",
    medidasMitigacao: [
      "A Igreja COMUNICA, não investiga: não há campo de pergunta nem de inquirição; o formulário mostra o roteiro (acolher, registrar como foi dito, encaminhar) e o que NÃO fazer",
      "O relato fica em tabela à parte, só de acréscimo (gatilho no banco); um relato por incidente (repetir a escuta machuca de novo); só a liderança de proteção lê, com a confirmação reforçada (vD.4), e cada leitura fica registrada",
      "Quem é envolvido nunca vê o incidente: para ele não existe; o Dirigente só enxerga a sua congregação, e o caso fica só com a Diretoria e o Comitê quando quem registra diz que a pessoa envolvida é da liderança local ou quando algum envolvido não tem matrícula (o Dirigente apontado só pelo nome não recebe nem lê o próprio caso)",
      "Os avisos (e-mail sai do sistema) não levam nome de criança, nome do envolvido nem conteúdo; a auditoria não leva o nível do incidente, quem registrou nem o número do caso das suspeitas de violência",
      "A lei manda comunicar ao Conselho Tutelar imediatamente; o prazo MÁXIMO interno de 24 horas é calculado na leitura (vence mesmo sem rotina) e uma rotina de hora em hora avisa em 12 h, 4 h e vencido; o caso de suspeita de violência só encerra com comunicação COM comprovante e a decisão do Comitê sobre o afastamento; uma suspeita nunca é rebaixada",
      "O afastamento cautelar é medida protetiva, não punição: a mensagem à pessoa não diz o motivo, ela só volta pela decisão do Comitê e o sistema não rebaixa sozinho; ninguém decide sobre o próprio afastamento",
      "O canal de ajuda sem login não guarda IP nem cabeçalhos e responde sempre com os telefones 100 e 190; tem limite por origem e teto por hora contra inundação",
      "O Comitê de Proteção precisa de pelo menos 3 pessoas e uma que não seja do clero (calculado do cadastro, não digitado); sem isso a Diretoria é avisada toda semana"
    ],
    riscoResidual: "Médio — o dado é sensível por natureza e depende do bom uso de quem tem acesso legítimo; um registro de má-fé pode afastar alguém por cautela (mitigado: o registrante fica registrado, há teto diário por pessoa, o Comitê revisa e levanta o afastamento). Risco humano residual de vazamento por quem lê o relato, tratado por treinamento do Comitê e pelo registro de cada leitura."
  },
  {
    chave: "NOTA_PASTORAL",
    tratamento: "Cuidado pastoral (v7.11): notas pastorais em três níveis de sigilo (equipe, liderança local, somente pastor), a fila de acompanhamento (visitante, novo convertido, membro afastado, pedido de visita, pedido de oração, pós-internação) com a detecção de afastamento pela frequência da própria pessoa, e os pedidos de oração com moderação e sinal de risco.",
    riscoIdentificado: "Aconselhamento, saúde, família e vida espiritual são o dado mais íntimo que a Igreja guarda: uma nota lida por quem não devia, um pedido de oração publicado com o nome, ou a própria pessoa descobrindo o que se escreve sobre ela antes de a liderança conversar com ela destroem a confiança e geram passivo; e um pedido de socorro (autolesão, violência) que espera a moderação comum pode custar uma vida.",
    medidasMitigacao: [
      "Três níveis de sigilo decididos por quem escreve; a nota \"somente pastor\" só é lida por quem escreveu e por quem, na liderança que alcança a pessoa, tem o cargo de Pastor no cadastro (a Diretoria não lê por ser Diretoria), e abrir pede a confirmação reforçada (vD.4)",
      "A lista mostra só as notas que a pessoa pode ler (as outras não aparecem, nem a contagem); o texto só sai ao abrir, e cada abertura fica registrada (quem e quando, nunca o conteúdo); quem escreveu e o nível geral veem quem leu",
      "A nota não se edita (gatilho no banco): a correção é outra nota; quem deixa de alcançar a pessoa (ela mudou de congregação, o item fechou) deixa de ler, inclusive o que escreveu (Regimento Art. 132 §1º, II)",
      "A pessoa acompanhada nunca vê o item nem as notas sobre ela, mesmo sendo da liderança; em Meus Dados ela vê quantas notas e acompanhamentos existem e de quando, e o texto pode ser pedido ao Encarregado",
      "O boletim de oração nunca leva o texto do pedido: leva uma linha gerada pelo assunto e pela congregação, conferida pelo moderador, e a reescrita com o nome de quem pediu é recusada",
      "Os textos que os membros mandam passam pela lista de sinais de autolesão e de violência; com sinal, o aviso obrigatório sai na hora a toda a liderança do território (sem o texto) e quem pediu lê os telefones 188, 190, 180 e 100; desmarcar um alarme falso pede motivo e a confirmação reforçada",
      "Nenhum aviso (o e-mail sai do sistema), auditoria ou log leva texto de nota ou de pedido; o aviso ao responsável leva só o primeiro nome de quem acompanhar",
      "Regimento Art. 132 §2º, II: as notas de quem saiu são apagadas em 30 dias; a exclusão LGPD as apaga na hora; os itens encerrados perdem a identificação em 5 anos e o pedido de oração perde o texto em 1 ano (5 com sinal de risco)"
    ],
    riscoResidual: "Médio — o dado é sensível por natureza e depende do bom uso de quem tem acesso legítimo; o detector de afastamento só vê a EBD e as reuniões (quem não está nelas não é medido) e a lista de sinais de risco não pega tudo (a liderança pode marcar o risco à mão). O vazamento por quem lê é tratado pelo registro de cada abertura e pela orientação à liderança."
  },
  {
    chave: "COMUNICACAO_COM_MEMBROS",
    tratamento: "Comunicados da Igreja a grupos de membros (v7.12): consentimento por canal (e-mail, celular) e categoria (eventos, devocional, financeiro), grupo calculado pelos critérios (território, cargo, departamento, liderança, EBD, formação, voluntariado, direito a voto), modelos aprovados, registro de entrega e leitura, e a convocação oficial, que chega a todos.",
    riscoIdentificado: "Ser membro de uma igreja é dado de convicção religiosa (LGPD Art. 11): um e-mail que sai para quem não pediu, um grupo montado errado (por exemplo, pelo que a pessoa dá) ou um relatório com nomes e telefones lido por quem não devia expõem a pessoa; e a convocação que não chega a quem tem direito a voto ameaça a validade da assembleia.",
    medidasMitigacao: [
      "Consentimento pedido, não presumido: sem um \"sim\" registrado (com a versão e a impressão digital do texto lido e o endereço de quem marcou) o e-mail e o celular daquela categoria não recebem; o consentimento é conferido de novo na hora de mandar cada mensagem",
      "Sair é um toque: em Meu Painel ou no link de cada e-mail (sem login, assinado por pessoa e categoria; abrir o link só lê, o botão grava); a convocação oficial não tem saída e diz por quê",
      "Nenhum grupo pelo dízimo (decisão do responsável, 22/10/2026); menores de 18 anos e quem pediu a exclusão ficam sempre fora; o grupo é cortado pelo território de quem envia; a prévia mostra só números, nunca nomes",
      "Só se envia modelo aprovado pelo nível geral (o aprovado não se edita); a convocação oficial só sai pelo nível geral; enviar e aprovar pedem a confirmação reforçada (vD.4)",
      "O e-mail sai por uma fila que respeita o limite do serviço e nunca manda a mesma mensagem duas vezes (a entrega é tomada antes de mandar; a que travar vira \"falhou\")",
      "O relatório é de quem enviou e do nível geral; o telefone de quem a convocação não alcançou só o nível geral vê; não há rastreio de abertura do e-mail",
      "Consentimento e entrega não se alteram (gatilhos no banco); a entrega perde o nome em 1 ano (5 na convocação); a exclusão LGPD apaga o consentimento, as preferências e os aparelhos e anonimiza as entregas"
    ],
    riscoResidual: "Baixo — o maior risco é humano (um modelo aprovado com texto inadequado, um grupo largo demais); mitigado pela aprovação no nível geral, pela prévia com o número de pessoas antes de enviar e pelo cancelamento do que ainda está na fila."
  },
  {
    chave: "CHECKIN_INFANTIL",
    tratamento: "Check-in infantil com cadeia de custódia (v7.10): registro de quem entregou e quem retirou cada criança, código de retirada, lista de pessoas autorizadas, retirada divergente, segunda via e presença dos voluntários na sala.",
    riscoIdentificado: "Quem sabe onde a criança está e a quem ela pode ser entregue tem poder sobre ela: um código vazado, uma lista de autorizados lida por quem não devia, ou uma retirada indevida por pessoa de fora é o pior desfecho possível; e o histórico (quem trouxe, quando, em qual sala) expõe a rotina da família.",
    medidasMitigacao: [
      "O código de retirada é gerado no servidor, guardado só como HMAC (atado ao registro e à geração do código) e nunca aparece em log, auditoria nem no histórico; só sai uma vez, na resposta do check-in ou da segunda via, e a tela o apaga ao fechar",
      "Cada tentativa de código é reservada no banco ANTES de ser conferida: o limite de 5 erros vale mesmo com mil requisições em paralelo; ao errar, a criança trava e só a liderança destrava",
      "Sem código não se retira, ainda que a pessoa seja conhecida; quem perdeu o código pede a segunda via, que exige documento conferido e a confirmação de OUTRO adulto da sala (dois olhares), e o código antigo morre",
      "Quem não está na lista de autorizados só sai com o código E a aprovação da liderança (confirmação reforçada), com aviso imediato aos responsáveis; quem pediu não decide",
      "A custódia se apoia no cadastro de responsáveis da Secretaria (documento conferido), nunca no vínculo familiar de autoatendimento",
      "Só opera a sala quem está escalado nela, é adulto e apto hoje (a aptidão da v7.7 é recalculada a cada ato) e entrou na sala; a regra dos dois adultos e a proporção valem na porta, com a lotação lida dentro de uma transação com trava",
      "O registro de custódia e o histórico de atos não se apagam nem se alteram (gatilhos no banco); a auditoria geral recebe só ids e códigos: nunca nome de criança, código, saúde nem texto livre",
      "O responsável vê só o histórico das próprias crianças (data, sala, quem trouxe, quem retirou), nunca o código, nunca o nome do voluntário, nunca a saúde dos outros; quem fez 18 anos sai do histórico do responsável",
      "A criança que ficou na sala sem retirada registrada é regularizada pela liderança (baixa administrativa, com motivo, só depois que o check-in da sala fecha, com confirmação reforçada e evento imutável): não vira retirada de ninguém e o responsável a vê como \"encerrada pela liderança\"",
      "Quando a criança é entregue ou retirada por um TERCEIRO (quem trouxe sem ser responsável cadastrado, ou o indicado só para a visita por essa pessoa), os responsáveis cadastrados recebem na hora um aviso obrigatório com o nome do terceiro e o primeiro nome da criança (nunca documento, telefone nem saúde); se o aviso não sair, a resposta ao voluntário manda ligar para a família",
      "A autorização de retirada feita por um responsável deixa de valer quando ele deixa de ser responsável cadastrado (a liderança é avisada); o relatório do dia da sala é só da liderança; o voluntário não vê a aptidão dos colegas",
      "A criança visitante não ganha cadastro: nome e nascimento ficam só no registro da visita, o telefone de quem a trouxe é apagado em 90 dias e o registro é anonimizado em 5 anos"
    ],
    riscoResidual: "Médio — o risco humano permanece: um responsável que entrega o código a quem não devia, ou um voluntário que vê o código na etiqueta de uma criança (a etiqueta fica no peito dela). Mitigado pela retirada divergente com a liderança (a pessoa que pega o código ainda precisa ser aprovada se não estiver na lista), pelo aviso na hora aos responsáveis e pelo registro de tudo."
  },
  {
    chave: "DADO_DE_SAUDE_EM_EVENTO",
    tratamento: "Alergia ou condição de saúde da criança, informada pelo responsável para constar no crachá do check-in infantil (v7.10): dado sensível de criança (LGPD Art. 11, I; Art. 14).",
    riscoIdentificado: "Dado de saúde de criança é sensível por natureza; impresso num crachá no peito dela, qualquer pessoa o lê; guardado depois do consentimento, vira dado sem finalidade; e um erro de transcrição pode ser tão perigoso quanto a falta do aviso.",
    medidasMitigacao: [
      "Só com o consentimento específico e em destaque do responsável (finalidade SAUDE_CRACHA, texto versionado com hash): sem consentimento vigente o dado nem é gravado e não sai na etiqueta",
      "Revogar o consentimento apaga o dado e as cópias nos registros de check-in logo em seguida; se esse apagar falhar, a tela da sala e a etiqueta da segunda via já não mostram a saúde (a leitura confere o consentimento na hora) e a rotina diária apaga o que ficou, inclusive de quem perdeu o consentimento por outro caminho (responsável desativado, criança que fez 18 anos); a exclusão LGPD do titular apaga a saúde e revoga os consentimentos na mesma transação",
      "Quem informa é o responsável (Meu Painel) ou a Secretaria com a ficha assinada (a referência é obrigatória); o texto é livre só até 400 caracteres e sem marcação, e nunca vai para a auditoria",
      "O dado informado no balcão para criança visitante vale só para aquela visita e é apagado em 90 dias",
      "O que sai na etiqueta é só o texto que o responsável escolheu; a equipe da sala o lê, a liderança também, mais ninguém; o responsável pode apagá-lo quando quiser",
      "O texto do consentimento diz o que é impresso, quem vê, por quanto tempo, que é opcional e como revogar; participar do ministério nunca depende dele"
    ],
    riscoResidual: "Médio — o crachá é visível a quem estiver perto da criança (o texto da autorização avisa); o dado só é tão bom quanto o que o responsável escreve. Mitigado pela escolha do próprio responsável sobre o que informar e pela revogação que apaga de verdade."
  }
];

module.exports = { RIPDS };
