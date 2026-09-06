// shared/estatuto.js
// Regras do Estatuto IEADESPA 2026 (oficial, registrado) centralizadas aqui — assim "18 anos",
// "90 dias de integração", "maioria absoluta" etc. não ficam espalhadas pelas Functions. Regra
// jurídica vira função, não dado editável por tela (mesmo espírito de mockDb.universoDoOrgao).

// Interpreta "YYYY-MM-DD" como data local (meio-dia), evitando erro de 1 dia por fuso.
function parseData(data) {
  if (!data) return null;
  const [ano, mes, dia] = String(data).slice(0, 10).split("-").map(Number);
  if (!ano || !mes || !dia) return null;
  return new Date(ano, mes - 1, dia, 12, 0, 0);
}

function idadeEm(dataNascimento, hoje) {
  if (!dataNascimento) return null;
  const nascimento = parseData(dataNascimento);
  if (!nascimento) return null;
  const agora = hoje ? new Date(hoje) : new Date();
  let idade = agora.getFullYear() - nascimento.getFullYear();
  const aniversarioAindaNaoChegou =
    agora.getMonth() < nascimento.getMonth() ||
    (agora.getMonth() === nascimento.getMonth() && agora.getDate() < nascimento.getDate());
  if (aniversarioAindaNaoChegou) idade--;
  return idade;
}

function diasDesde(data, hoje) {
  if (!data) return null;
  const inicio = parseData(data);
  if (!inicio) return null;
  const agora = hoje ? new Date(hoje) : new Date();
  const diffMs = agora.getTime() - inicio.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// Art. 40/41 — jurisdição disciplinar. `estatuto.js` continua síncrono e sem acesso a
// banco (é chamado dentro de .map()/.filter() síncronos em vários lugares) — quem busca
// o dado real é o chamador (shared/disciplina.js, numa query em lote), que anexa
// `processoDisciplinarAtivo` ao objeto `membro` antes de chamar calcularCapacidadeEleitoral.
// Se o chamador não anexar o flag (ex: alguém sem a permissão "disciplina" vendo a lista
// de Pessoas — mascaramento intencional), o membro aparece como livre de disciplina.
function estaSobDisciplina(membro) {
  return membro.processoDisciplinarAtivo === true;
}

// Art. 7º, 8º e 23º — categorias de membresia e capacidade eleitoral. A transição entre
// categorias "opera-se automaticamente" (Art. 7º §1º) a partir de dados objetivos — nunca é
// marcação manual. Quando falta dado, NUNCA assume elegibilidade (mesmo espírito do Art. 23
// §3º, que anula voto obtido por brecha de prazo/dado).
function calcularCapacidadeEleitoral(membro, hoje) {
  const emComunhao =
    membro.situacaoMembro === "EM_COMUNHAO" ||
    (membro.situacaoMembro == null && membro.status === "ATIVO");
  const idade = idadeEm(membro.dataNascimento, hoje);
  const diasAdmissao = diasDesde(membro.dataAdmissao, hoje);

  if (idade === null || diasAdmissao === null) {
    return {
      emComunhao,
      categoria: membro.situacaoMembro === "CONGREGADO" ? "Congregado" : "Dados incompletos",
      capacidadeAtiva: false,
      elegivelDiretoriaConselhoFiscal: false,
      elegivelCEIouDepartamentos: false,
      elegivelFuncaoAuxiliar: emComunhao && idade !== null && idade >= 16,
      motivo: "dados incompletos (falta data de nascimento e/ou data de admissão)",
      emPeriodoIntegracao: false,
      diasIntegracao: null,
      diasRestantesIntegracao: null
    };
  }

  // v1.2 — Período de Integração e Zelo Institucional (Art. 6º §2º): 90 dias a partir
  // da admissão/recepção. Durante esse prazo o membro não vota nem é votado (restrições
  // aplicadas logo abaixo via capacidadeAtiva) — a integração é um estado CALCULADO e
  // exibido, nunca uma marcação manual (mesmo princípio do Art. 7º §1º).
  const DIAS_INTEGRACAO = 90;
  const emPeriodoIntegracao =
    emComunhao && diasAdmissao >= 0 && diasAdmissao < DIAS_INTEGRACAO;
  const diasIntegracao = diasAdmissao;
  const diasRestantesIntegracao = emPeriodoIntegracao ? DIAS_INTEGRACAO - diasAdmissao : null;

  // Art. 23 §1º — Capacidade Ativa: direito de votar.
  const capacidadeAtiva =
    emComunhao && idade >= 18 && diasAdmissao >= 90 && !estaSobDisciplina(membro);

  // Art. 23 §2º, I — Diretoria Executiva e Conselho Fiscal (cargos eletivos).
  const elegivelDiretoriaConselhoFiscal =
    capacidadeAtiva && diasAdmissao >= 365 && membro.dizimistaFiel === true;

  // Art. 23 §2º, II — CEI e Lideranças Gerais de Departamentos/Secretarias (não eletivos, mas
  // com assento na CLI) — só exige 18+ e capacidade civil, já coberto por capacidadeAtiva.
  const elegivelCEIouDepartamentos = capacidadeAtiva;

  // Art. 23 §2º, III — funções auxiliares/locais: 16+ e em dia com obrigações eclesiásticas.
  // Simplificação: o detalhamento fino de "em dia" fica para o Regimento Interno.
  const elegivelFuncaoAuxiliar = emComunhao && idade >= 16;

  let categoria;
  if (membro.situacaoMembro === "CONGREGADO") categoria = "Congregado";
  else if (!emComunhao) categoria = "Sem comunhão";
  else if (elegivelDiretoriaConselhoFiscal) categoria = "Membro Elegível";
  else if (capacidadeAtiva) categoria = "Capacidade Eleitoral Ativa";
  else categoria = "Membro em Comunhão";

  return {
    emComunhao,
    categoria,
    capacidadeAtiva,
    elegivelDiretoriaConselhoFiscal,
    elegivelCEIouDepartamentos,
    elegivelFuncaoAuxiliar,
    emPeriodoIntegracao,
    diasIntegracao,
    diasRestantesIntegracao,
    motivo: null
  };
}

// Art. 88 §2º (Regimento) — requisitos do CEI/Corte Suprema Eclesiástica.
// A formação em Direito não é rastreada em lugar nenhum do sistema (só o AFM
// é), então a checagem sai INFORMATIVA (orienta a indicação do Presidente,
// Art. 89 §1º), nunca bloqueia sozinha a criação do Assento — mesmo espírito
// do RegimeUrgencia em Projetos (v2.8): registrado, não travado, quando a
// verificação plena não é possível.
function avaliarElegibilidadeCEI(dados) {
  const {
    cargoMinisterial,
    anosDesdeConsagracaoPresbitero,
    afmAvancadoComCertificado,
    disciplinaRigorosaUltimos10Anos
  } = dados || {};

  const oficialSuperior = cargoMinisterial === "PASTOR" || cargoMinisterial === "EVANGELISTA";
  const presbiteroComTempo =
    cargoMinisterial === "PRESBITERO" &&
    anosDesdeConsagracaoPresbitero !== null && anosDesdeConsagracaoPresbitero !== undefined &&
    anosDesdeConsagracaoPresbitero >= 5;
  const cargoElegivel = oficialSuperior || presbiteroComTempo;

  const formacaoVerificavelOk = afmAvancadoComCertificado === true;
  const motivoFormacao = formacaoVerificavelOk
    ? null
    : "Sem AFM avançado + Certificado de Habilitação Ministerial registrado — confirme manualmente se a pessoa possui formação secular em Direito (não verificável pelo sistema).";

  const reputacaoIlibada = !disciplinaRigorosaUltimos10Anos;

  return {
    cargoElegivel,
    motivoCargo: cargoElegivel
      ? null
      : "Não atende Art. 88 §2º, I: precisa ser Oficial Superior (Evangelista/Pastor) ou Presbítero com 5+ anos ininterruptos de ministério ativo.",
    formacaoVerificavelOk,
    motivoFormacao,
    reputacaoIlibada,
    motivoReputacao: reputacaoIlibada ? null : "Possui processo disciplinar com sanção/exclusão nos últimos 10 anos (Art. 88 §2º, III).",
    elegivelInformativo: cargoElegivel && reputacaoIlibada
  };
}

// Art. 21 (Assembleia Geral, matérias gerais/AGO) e Art. 24 (CLI) compartilham o mesmo formato
// de instalação em 2 estágios: 1ª convocação = maioria absoluta; 2ª convocação, 30 minutos
// depois = qualquer número de presentes. Fora do escopo aqui: quórum de reforma estatutária/
// destituição (Art. 21, II — 3 estágios com reconvocação em 15 dias) e as maiorias qualificadas
// de matérias especiais (dissolução, venda de imóvel, Núcleo Fundamental — Art. 3º, 58º, 71º).
const ORGAOS_COM_QUORUM_DOIS_ESTAGIOS = ["ASSEMBLEIA_GERAL", "CLI"];

function regraQuorumInstalacao(orgaoSigla) {
  if (!ORGAOS_COM_QUORUM_DOIS_ESTAGIOS.includes(orgaoSigla)) return null;
  return {
    minutosEntreConvocacoes: 30,
    descricao:
      "1ª convocação: maioria absoluta (mais da metade) dos membros. " +
      "2ª convocação, 30 minutos depois: instala com qualquer número de presentes."
  };
}

// Avalia se a 1ª convocação bateu maioria absoluta. Não automatiza a passagem de tempo entre
// convocações (isso fica a critério de quem preside a sessão) — só informa a regra e o estado.
function avaliarQuorumInstalacao(orgaoSigla, totalPresentes, totalUniverso) {
  const regra = regraQuorumInstalacao(orgaoSigla);
  if (!regra) return null;
  const maioriaAbsolutaNecessaria = Math.floor(totalUniverso / 2) + 1;
  const maioriaAbsolutaAtingida = totalUniverso > 0 && totalPresentes >= maioriaAbsolutaNecessaria;
  return {
    maioriaAbsolutaNecessaria,
    maioriaAbsolutaAtingida,
    mensagem: maioriaAbsolutaAtingida
      ? "Quórum de maioria absoluta atingido em 1ª convocação."
      : `Não atingiu maioria absoluta (${maioriaAbsolutaNecessaria} de ${totalUniverso}) — instala em 2ª convocação, 30 minutos depois, com qualquer número de presentes.`
  };
}

// Art. 11 — Abandono Eclesiástico Material: 90 dias sem comunhão a partir da data em
// que a Secretaria constata o afastamento (lançamento manual — não há como inferir
// isso automaticamente sem um registro de presença/contato mais amplo do que existe
// hoje). Só conta enquanto o membro estiver marcado SEM_COMUNHAO; se ele voltar a
// comparecer, quem zera `dataAfastamento` é a própria edição da Pessoa.
const DIAS_ABANDONO_MATERIAL = 90;
const DIAS_PRAZO_DEFESA_ABANDONO = 15; // prazo do procedimento sumário de constatação
const DIAS_RECURSO_ASSEMBLEIA = 30;    // recurso à Assembleia, sem efeito suspensivo

function diasEmAfastamento(membro, hoje) {
  if (membro.situacaoMembro !== "SEM_COMUNHAO" || !membro.dataAfastamento) return null;
  return diasDesde(membro.dataAfastamento, hoje);
}

function elegivelAbandonoMaterial(membro, hoje) {
  const dias = diasEmAfastamento(membro, hoje);
  return dias !== null && dias >= DIAS_ABANDONO_MATERIAL;
}

// Art. 12 §2º — Abandono Eclesiástico Digital: pressupõe pelo menos 2 tentativas de
// contato por canais distintos, contadas a partir de quando o membro se tornou
// incomunicável. Os 90 dias (Art. 11, V) contam da 1ª tentativa registrada — a
// contagem em si depende do histórico de tentativas (tabela TentativasContatoAbandono),
// por isso vive em shared/abandonoDigital.js (precisa de banco), não aqui.
const MIN_TENTATIVAS_CONTATO_DIGITAL = 2;
const DIAS_ABANDONO_DIGITAL = 90;

// Art. 17 (classificação AGO/AGE) e Art. 20 §2º (prazos mínimos de antecedência
// do Edital de Convocação). Regra jurídica vira função, não dado editável por
// tela — mesmo espírito de regraQuorumInstalacao logo acima.
const PRAZOS_CONVOCACAO_DIAS = { AGO: 10, AGE_GERAL: 5, AGE_ESPECIAL: 15 };

function validarConvocacaoAssembleia({ tipoSessao, dataPrevista, hoje, prazoMinimoDias: prazoForcado }) {
  if (!PRAZOS_CONVOCACAO_DIAS[tipoSessao]) {
    return { valido: false, mensagem: `Tipo de sessão inválido. Use um de: ${Object.keys(PRAZOS_CONVOCACAO_DIAS).join(", ")}.` };
  }
  const prevista = parseData(dataPrevista);
  if (!prevista) {
    return { valido: false, mensagem: "Informe uma data prevista válida." };
  }

  // Art. 17, I — AGO é anual e obrigatoriamente em dezembro.
  if (tipoSessao === "AGO" && prevista.getMonth() !== 11) {
    return { valido: false, mensagem: "A Assembleia Geral Ordinária (AGO) só pode ser realizada em dezembro (Art. 17, I)." };
  }

  const agora = hoje ? parseData(hoje) || new Date(hoje) : new Date();
  const diffDias = Math.floor((prevista.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24));
  // prazoForcado vem de derivarClassificacaoAssembleia quando alguma matéria selecionada
  // exige o prazo especial de 15 dias (Art. 20 §2º, III) mesmo em cima de uma AGO/AGE_GERAL.
  const prazoMinimoDias = prazoForcado != null ? prazoForcado : PRAZOS_CONVOCACAO_DIAS[tipoSessao];
  if (diffDias < prazoMinimoDias) {
    return {
      valido: false,
      prazoMinimoDias,
      mensagem: `Antecedência mínima do Edital é de ${prazoMinimoDias} dias (Art. 20, §2º) — a data prevista precisa ser daqui a pelo menos ${prazoMinimoDias} dias.`
    };
  }

  return { valido: true, mensagem: null, prazoMinimoDias };
}

// Art. 18 — competências privativas da Assembleia Geral. Cada matéria carrega
// DUAS regras independentes (o Estatuto trata prazo e quórum em artigos
// diferentes, com critérios diferentes — não dá pra derivar um do outro):
// - prazoEspecial: exige os 15 dias do Art. 20 §2º, III (reforma estatutária,
//   destituição OU ELEIÇÃO — os 3 citados nominalmente ali).
// - quorumTipo: GERAL (Art. 21, I — inclui eleição, contas e ratificação de
//   atos, 2 estágios) ou REFORMA_DESTITUICAO (Art. 21, II — só reforma
//   estatutária e destituição, 3 estágios com reconvocação).
// Convocar a Assembleia exige escolher pelo menos 1 matéria daqui — não dá
// pra convocar "pra qualquer assunto": ou é competência privativa de verdade,
// ou não compensa convocar a Assembleia (os outros órgãos já têm alçada).
const MATERIAS_PRIVATIVAS_ASSEMBLEIA = {
  ELEICAO_DIRETORIA_CONSELHO_FISCAL: { rotulo: "Eleger a Diretoria Executiva e o Conselho Fiscal (Art. 18, I)", prazoEspecial: true, quorumTipo: "GERAL" },
  DESTITUICAO: { rotulo: "Destituir administrador, conselheiro ou ocupante de cargo/função (Art. 18, II)", prazoEspecial: true, quorumTipo: "REFORMA_DESTITUICAO" },
  REFORMA_ESTATUTARIA: { rotulo: "Reformar o Estatuto (Art. 18, III)", prazoEspecial: true, quorumTipo: "REFORMA_DESTITUICAO" },
  APROVACAO_CONTAS: { rotulo: "Aprovar contas e balanço patrimonial (Art. 18, IV)", prazoEspecial: false, quorumTipo: "GERAL" },
  ALIENACAO_IMOVEL: { rotulo: "Autorizar alienação/oneração de imóvel acima do Teto de Alçada (Art. 18, V)", prazoEspecial: false, quorumTipo: "GERAL" },
  HOMOLOGACAO_PASTOR_PRESIDENTE: { rotulo: "Homologar e eleger o Pastor Presidente (Art. 18, VI)", prazoEspecial: true, quorumTipo: "GERAL" },
  RATIFICACAO_CLI: { rotulo: "Ratificar/retificar deliberação da CLI (Art. 18, VII)", prazoEspecial: false, quorumTipo: "GERAL" }
};

// Reforma do Núcleo Fundamental (Art. 70/71 — nome da igreja, vínculo com o
// SETA) não é matéria própria: é um agravante de REFORMA_ESTATUTARIA que troca
// o quórum de 3 estágios pelo Rito de Reforma Dificultada (90% dos presentes).
function derivarClassificacaoAssembleia({ materias, reformaNucleoFundamental, ehAnual }) {
  const codigos = Array.isArray(materias) ? materias : [];
  if (codigos.length === 0) {
    return { valido: false, mensagem: "Selecione ao menos uma matéria (competência privativa, Art. 18) pra convocar a Assembleia." };
  }
  const invalida = codigos.find(c => !MATERIAS_PRIVATIVAS_ASSEMBLEIA[c]);
  if (invalida) {
    return { valido: false, mensagem: `Matéria inválida: ${invalida}.` };
  }
  if (reformaNucleoFundamental && !codigos.includes("REFORMA_ESTATUTARIA")) {
    return { valido: false, mensagem: "\"Envolve o Núcleo Fundamental\" só se aplica junto com \"Reformar o Estatuto\" (Art. 70/71)." };
  }

  const exigePrazoEspecial = codigos.some(c => MATERIAS_PRIVATIVAS_ASSEMBLEIA[c].prazoEspecial);
  const exigeReformaDestituicao = codigos.some(c => MATERIAS_PRIVATIVAS_ASSEMBLEIA[c].quorumTipo === "REFORMA_DESTITUICAO");

  const quorumTipo = reformaNucleoFundamental ? "REFORMA_DIFICULTADA" : (exigeReformaDestituicao ? "REFORMA_DESTITUICAO" : "GERAL");
  const tipoSessao = ehAnual ? "AGO" : (exigePrazoEspecial ? "AGE_ESPECIAL" : "AGE_GERAL");
  // AGO respeita seu próprio mínimo de 10 dias, mas se a pauta também exige o
  // prazo especial de 15 (Art. 20 §2º, III), esse maior prevalece mesmo em AGO.
  const prazoMinimoDias = exigePrazoEspecial ? 15 : PRAZOS_CONVOCACAO_DIAS[tipoSessao];

  return { valido: true, tipoSessao, quorumTipo, prazoMinimoDias };
}

// Art. 21, II — reforma estatutária e destituição de administradores: 3
// estágios (não os 2 de matéria geral). Mesmo espírito de avaliarQuorumInstalacao:
// não automatiza a passagem de tempo entre convocações (quem preside decide isso
// ao vivo) — só informa os 2 patamares (maioria absoluta / 1/3) de uma vez, pra
// quem estiver conduzindo a sessão ler e decidir. `ehReconvocacao` (a própria
// sessão tem VinculadaSessaoId) já dispensa os dois patamares — Art. 21, II, "c"
// instala com qualquer número de presentes.
function avaliarQuorumReformaDestituicao(totalPresentes, totalUniverso, ehReconvocacao) {
  if (ehReconvocacao) {
    return {
      quorumAtingido: totalPresentes > 0,
      mensagem: "Reconvocação (Art. 21, II, \"c\"): instala com qualquer número de presentes."
    };
  }

  const maioriaAbsolutaNecessaria = Math.floor(totalUniverso / 2) + 1;
  const umTercoNecessario = Math.ceil(totalUniverso / 3);
  const maioriaAtingida = totalUniverso > 0 && totalPresentes >= maioriaAbsolutaNecessaria;
  if (maioriaAtingida) {
    return {
      quorumAtingido: true, maioriaAbsolutaNecessaria,
      mensagem: "Quórum de maioria absoluta atingido em 1ª convocação (reforma/destituição)."
    };
  }

  const umTercoAtingido = totalUniverso > 0 && totalPresentes >= umTercoNecessario;
  return {
    quorumAtingido: umTercoAtingido, maioriaAbsolutaNecessaria, umTercoNecessario,
    mensagem: umTercoAtingido
      ? `Não atingiu maioria absoluta (${maioriaAbsolutaNecessaria} de ${totalUniverso}), mas atingiu 1/3 (${umTercoNecessario}) — válido em 2ª convocação, 30 minutos depois.`
      : `Não atingiu maioria absoluta nem 1/3 (${umTercoNecessario} de ${totalUniverso} necessários em 2ª convocação) — só resta reconvocar, com antecedência mínima de 15 dias (Art. 21, II, "c"), uma única vez.`
  };
}

// Art. 71 §1º — Rito de Reforma Dificultada (Núcleo Fundamental). O sistema não
// tem recurso de votação em lugar nenhum (nada regista "sim"/"não" por pessoa),
// então isso é só informativo: quantos votos favoráveis equivalem a 90% dos
// presentes. Unanimidade prévia da CLI e homologação da Convenção são
// pré/pós-requisitos fora do alcance deste sistema.
function avaliarQuorumReformaDificultada(totalPresentes) {
  const votosNecessarios = Math.ceil(totalPresentes * 0.9);
  return {
    votosNecessarios,
    totalPresentes,
    mensagem: `Rito de Reforma Dificultada (Art. 71 §1º): exige aprovação de ${votosNecessarios} de ${totalPresentes} presentes (90%), ` +
      `além de unanimidade prévia da CLI e homologação formal da CIADSETA-PARÁ — registre essas duas por fora, o sistema não as acompanha.`
  };
}

// v2.8 — Enquetes: diferente de avaliarQuorumReformaDificultada acima (que
// era só informativo, porque nada registrava voto por pessoa), Enquetes
// vinculantes REALMENTE contam voto individual (VotosEnquete), então dá pra
// calcular aprovação de verdade. Calculado sobre quem efetivamente votou
// (totalVotos), não sobre o universo elegível total — mesmo princípio de
// "quórum de aprovação" de uma deliberação (quem se absteve/não votou não
// entra no denominador).
const QUORUM_APROVACAO_ENQUETE = { MAIORIA_SIMPLES: 0.5, DOIS_TERCOS: 2 / 3, NOVENTA_POR_CENTO: 0.9 };
function avaliarAprovacaoEnquete(totalVotos, votosOpcaoMaisVotada, quorumTipo) {
  const fracaoNecessaria = QUORUM_APROVACAO_ENQUETE[quorumTipo];
  if (fracaoNecessaria === undefined) {
    return { aprovado: false, mensagem: `QuorumTipo desconhecido: ${quorumTipo}.` };
  }
  if (totalVotos === 0) {
    return { aprovado: false, mensagem: "Nenhum voto registrado — não há como apurar." };
  }
  const aprovado = quorumTipo === "MAIORIA_SIMPLES"
    ? votosOpcaoMaisVotada > totalVotos / 2
    : votosOpcaoMaisVotada >= Math.ceil(totalVotos * fracaoNecessaria);
  return {
    aprovado, totalVotos, votosOpcaoMaisVotada,
    mensagem: aprovado
      ? `Aprovado: ${votosOpcaoMaisVotada} de ${totalVotos} votos (${quorumTipo}).`
      : `Não aprovado: ${votosOpcaoMaisVotada} de ${totalVotos} votos não atinge ${quorumTipo}.`
  };
}

module.exports = {
  idadeEm,
  diasDesde,
  estaSobDisciplina,
  calcularCapacidadeEleitoral,
  regraQuorumInstalacao,
  avaliarQuorumInstalacao,
  DIAS_ABANDONO_MATERIAL,
  DIAS_PRAZO_DEFESA_ABANDONO,
  DIAS_RECURSO_ASSEMBLEIA,
  diasEmAfastamento,
  elegivelAbandonoMaterial,
  MIN_TENTATIVAS_CONTATO_DIGITAL,
  DIAS_ABANDONO_DIGITAL,
  PRAZOS_CONVOCACAO_DIAS,
  validarConvocacaoAssembleia,
  MATERIAS_PRIVATIVAS_ASSEMBLEIA,
  derivarClassificacaoAssembleia,
  avaliarQuorumReformaDestituicao,
  avaliarQuorumReformaDificultada,
  avaliarAprovacaoEnquete,
  avaliarElegibilidadeCEI
};
