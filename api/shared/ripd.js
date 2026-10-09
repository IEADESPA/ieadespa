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
    tratamento: "Registro de incidentes de proteção de crianças e adolescentes, do relato espontâneo, da comunicação ao Conselho Tutelar em 24 horas, do afastamento cautelar do envolvido e do relatório anual do Comitê de Proteção (v7.8).",
    riscoIdentificado: "Dado de criança sobre violência é o mais sensível que a Igreja guarda: vazamento revitimiza e expõe; uma acusação falsa ou errada afasta e marca uma pessoa inocente; e a omissão da comunicação tem multa e, pior, deixa a criança desprotegida.",
    medidasMitigacao: [
      "A Igreja COMUNICA, não investiga: não há campo de pergunta nem de inquirição; o formulário mostra o roteiro (acolher, registrar como foi dito, encaminhar) e o que NÃO fazer",
      "O relato fica em tabela à parte, só de acréscimo (gatilho no banco); um relato por incidente (repetir a escuta machuca de novo); só a liderança de proteção lê, com a confirmação reforçada (vD.4), e cada leitura fica registrada",
      "Quem é envolvido nunca vê o incidente: para ele não existe; o Dirigente só enxerga a sua congregação",
      "Os avisos (e-mail sai do sistema) não levam nome de criança, nome do envolvido nem conteúdo; a auditoria não leva o nível do incidente, quem registrou nem o número do caso das suspeitas de violência",
      "O prazo de 24 horas é calculado na leitura (vence mesmo sem rotina) e uma rotina de hora em hora avisa em 12 h, 4 h e vencido; o caso de suspeita de violência só encerra com comunicação COM comprovante e a decisão do Comitê sobre o afastamento; uma suspeita nunca é rebaixada",
      "O afastamento cautelar é medida protetiva, não punição: a mensagem à pessoa não diz o motivo, ela só volta pela decisão do Comitê e o sistema não rebaixa sozinho; ninguém decide sobre o próprio afastamento",
      "O canal de ajuda sem login não guarda IP nem cabeçalhos e responde sempre com os telefones 100 e 190; tem limite por origem e teto por hora contra inundação",
      "O Comitê de Proteção precisa de pelo menos 3 pessoas e uma que não seja do clero (calculado do cadastro, não digitado); sem isso a Diretoria é avisada toda semana"
    ],
    riscoResidual: "Médio — o dado é sensível por natureza e depende do bom uso de quem tem acesso legítimo; um registro de má-fé pode afastar alguém por cautela (mitigado: o registrante fica registrado, há teto diário por pessoa, o Comitê revisa e levanta o afastamento). Risco humano residual de vazamento por quem lê o relato, tratado por treinamento do Comitê e pelo registro de cada leitura."
  },
  {
    chave: "NOTA_PASTORAL",
    tratamento: "N/A hoje — não existe tabela/tela de 'nota pastoral' no sistema.",
    riscoIdentificado: null, medidasMitigacao: [], riscoResidual: "N/A — sem tratamento real, sem RIPD a fazer. Entra quando o módulo existir."
  },
  {
    chave: "DADO_DE_SAUDE_EM_EVENTO",
    tratamento: "N/A hoje — ainda sem dado de saúde: não existe cadastro de alergia ou condição médica em evento ou check-in. O consentimento já existe (v7.7, finalidade SAUDE_CRACHA, específico e em destaque, LGPD Art. 11, I); o dado chega com o check-in infantil da v7.10.",
    riscoIdentificado: null, medidasMitigacao: [], riscoResidual: "N/A — sem tratamento real do dado, sem RIPD a fazer. Quando a v7.10 trouxer o dado de saúde, este item vira um RIPD de verdade (o consentimento do responsável já é pré-requisito e a revogação deve apagar o dado)."
  }
];

module.exports = { RIPDS };
