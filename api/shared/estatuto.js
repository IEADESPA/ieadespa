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
      motivo: "dados incompletos (falta data de nascimento e/ou data de admissão)"
    };
  }

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
    motivo: null
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

module.exports = {
  idadeEm,
  diasDesde,
  estaSobDisciplina,
  calcularCapacidadeEleitoral,
  regraQuorumInstalacao,
  avaliarQuorumInstalacao
};
