// shared/setoresTecnicos.js (v7.6 — Setores Técnicos, voluntariado profissional)
//
// Regra pura, sem banco (a parte com banco está em shared/setoresTecnicosDb.js). Regimento Art. 48 a 52 e Art. 133; Lei 9.608/1998.
//
//  1) OS SETORES (Art. 52): vinte, do âmbito GERAL ("vedada a sua fragmentação em diretórios locais"). Onde não há profissionais não há setor (Art. 48 §2º):
//     um setor sem ninguém servindo aparece como "sem profissionais", não como setor instalado.
//  2) O VÍNCULO da pessoa com o setor: CANDIDATO -> AGUARDANDO_TERMO -> ATIVO -> ENCERRADO. Só o vínculo ATIVO, com o Termo aceito, dá os poderes do setor.
//  3) O TERMO DE ADESÃO ESPECÍFICO (Art. 49 §2º): o texto geral do voluntariado profissional (sem remuneração, responsabilidade técnica, autonomia) mais o
//     que é próprio do setor (a interdição, o pedido de remoção, os limites da consultoria jurídica). Versão e hash cobrem o texto exato que a pessoa viu.
//  4) O PODER DE POLÍCIA TÉCNICA (Art. 50): a interdição cautelar (Engenharia e Segurança) e o pedido de remoção de postagem (Comunicação), com a
//     ratificação ou revogação pela Diretoria Executiva.
const crypto = require("crypto");
const cal = require("./calendario");
const vol = require("./voluntariado");

// Só texto e número viram texto: lista e objeto não (String({}) daria "[object Object]", que passaria como formação ou laudo).
const limpar = (v) => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const sha256 = (txt) => crypto.createHash("sha256").update(txt).digest("hex");
const inteiroPositivo = vol.inteiroPositivo;
const temMarca = (s) => /[<>]/.test(s);

// ---------------------------------------------------------------
// Rótulos e catálogos
// ---------------------------------------------------------------

const STATUS_VINCULO = {
  CANDIDATO: "Candidatura aguardando análise",
  AGUARDANDO_TERMO: "Aguardando o aceite do Termo de Adesão",
  ATIVO: "Ativo",
  ENCERRADO: "Encerrado"
};
const ORIGENS_VINCULO = { CANDIDATURA: "A própria pessoa se candidatou", INDICACAO: "Indicado pela administração" };
const MOTIVOS_ENCERRAMENTO = {
  SAIDA_PROPRIA: "A pessoa pediu para sair",
  DESLIGAMENTO: "Desligamento pela administração",
  MUDANCA: "Mudança de área ou de cidade",
  RECUSADO: "Candidatura não aceita",
  OUTRO: "Outro motivo"
};

const TIPOS_ATO = { INTERDICAO: "Interdição cautelar", REMOCAO_POSTAGEM: "Remoção de postagem" };
const MOTIVOS_INTERDICAO = { RISCO_DESABAMENTO: "Risco de desabamento", FALHA_ELETRICA_GRAVE: "Falha elétrica grave" };
const MOTIVOS_REMOCAO = {
  ERRO_GROSSEIRO: "Erro grosseiro",
  DIREITO_AUTORAL: "Violação de direitos autorais",
  DOUTRINA_IMAGEM: "Ofensa à doutrina ou à imagem institucional da Igreja"
};
const STATUS_ATO = {
  EMITIDA: "Emitida (aguarda a Diretoria)",
  RATIFICADA: "Ratificada pela Diretoria",
  REVOGADA: "Revogada pela Diretoria",
  LEVANTADA: "Levantada (risco sanado)",
  ATENDIDA: "Atendida (postagem removida)",
  CANCELADA: "Cancelada por quem emitiu"
};
// Quem ainda produz efeito (a interdição em vigor) ou ainda pede providência (o pedido de remoção não atendido).
const STATUS_ATO_ABERTOS = ["EMITIDA", "RATIFICADA"];
// De onde para onde cada tipo de ato pode ir. A trava final é o banco (gatilho e CHECK); isto é o que a tela e a rota consultam.
const TRANSICOES = {
  INTERDICAO: { EMITIDA: ["RATIFICADA", "REVOGADA", "LEVANTADA"], RATIFICADA: ["LEVANTADA"] },
  REMOCAO_POSTAGEM: { EMITIDA: ["ATENDIDA", "CANCELADA", "REVOGADA"] }
};
const transicaoPermitida = (tipo, de, para) => !!(TRANSICOES[tipo] && TRANSICOES[tipo][de] && TRANSICOES[tipo][de].includes(para));

// Contenção do poder de interditar: um emitente não abre mais que isto sem a Diretoria decidir, nem emite em rajada.
const MAX_ATOS_ABERTOS_POR_EMITENTE = 5;
const MAX_ATOS_POR_DIA = 3;
const MAX_VINCULOS_VIGENTES_POR_PESSOA = 5;
const MAX_CANDIDATURAS_POR_DIA = 3;
const LEMBRETE_DIAS_PADRAO = 1;
const IP_RETENCAO_DIAS_PADRAO = vol.IP_RETENCAO_DIAS_PADRAO;
const LIMITE_LISTA = 300;

// ---------------------------------------------------------------
// Termo de Adesão ao Serviço Voluntário — Setor Técnico (Art. 49 §2º)
// ---------------------------------------------------------------
// O texto é um RASCUNHO JURÍDICO aprovado pelo responsável pelo projeto sem parecer de advogado (a Igreja não tem). Trocar o texto cria outra versão e outro
// hash, sem invalidar quem já aderiu. O hash cobre o texto geral e o específico do setor: quem aceita o do Jurídico não "aceitou" o da Engenharia.

const TERMO_SETOR_VERSAO = 1;
const TERMO_SETOR_TITULO = "Termo de Adesão ao Serviço Voluntário — Setor Técnico";
const TERMO_SETOR_ITENS = [
  {
    codigo: "NATUREZA", base: "Lei 9.608/1998, art. 1º e 2º; Regimento Art. 48 e Art. 49 §2º",
    texto: "Presto serviço ao Setor Técnico por vontade própria e por motivação religiosa. Entre mim e a IEADESPA não existe, nem passará a existir, vínculo de emprego nem obrigação trabalhista, previdenciária ou afim. O Setor é uma câmara de comunhão profissional e de inteligência, não um órgão de execução diária de culto."
  },
  {
    codigo: "SEM_HONORARIOS", base: "Regimento Art. 49, caput, e Art. 133 §§3º e 4º",
    texto: "É vedado pagar salário ou honorário aos membros dos Setores Técnicos: o meu serviço é devocional. Não recebo remuneração, honorário, comissão, cachê nem vantagem pelo trabalho no Setor. O transporte, a alimentação e o vestuário do dia a dia são por minha conta; só há ressarcimento em Missão Oficial Extraordinária, com Ordem de Serviço escrita ANTES da despesa."
  },
  {
    codigo: "ABRANGENCIA", base: "Regimento Art. 48 §2º e Art. 52",
    texto: "O Setor existe em âmbito geral, assessorando a Presidência e a Comissão de Liderança Interna, e não se fragmenta em diretórios locais. Sirvo onde houver necessidade de profissionais da minha área, sem que isso crie cargo, mandato ou direito a remuneração."
  },
  {
    codigo: "RESPONSABILIDADE_TECNICA", base: "Regimento Art. 49 §1º",
    texto: "Se eu assinar projeto, laudo ou parecer para a Igreja, assumo a Responsabilidade Técnica perante o meu conselho de classe (por meio da ART, RRT, TRT ou documento equivalente da minha profissão), e a IEADESPA fica isenta de culpa por erro técnico ou imperícia profissional meus."
  },
  {
    codigo: "AUTONOMIA", base: "Regimento Art. 133 §7º",
    texto: "Não cumpro expediente nem controle de jornada. Posso recusar uma demanda, justificar uma ausência, pedir afastamento temporário ou deixar o Setor quando quiser, sem penalidade trabalhista, sujeitando-me apenas à disciplina eclesiástica e à fidelidade ministerial."
  },
  {
    codigo: "CIENCIA", base: "Regimento Art. 133 §§5º e 6º",
    texto: "Estou ciente de que a Diretoria pode pedir certidões de antecedentes e que o resultado é analisado só pela Diretoria Executiva ou pelo Conselho de Ética, de que devo avisar a liderança se passar a responder a inquérito ou processo criminal, e de que as regras sobre uso de imagem, voz e propriedade intelectual estão no Art. 133 §6º do Regimento."
  }
];
const TERMO_SETOR_ITEM_REGISTRO = {
  codigo: "REGISTRO", base: "Regimento Art. 133 §8º, II",
  texto: "Entendo que marcar a caixa de aceite vale como assinatura eletrônica e que a Igreja guarda o IP, a data e a hora do meu aceite para fins de auditoria."
};
const TERMO_SETOR_ITEM_INTERDICAO = {
  codigo: "INTERDICAO", base: "Regimento Art. 50, I",
  texto: "Sei que este Setor pode interditar, na hora, templo ou estrutura com risco de desabamento ou de falha elétrica grave, comunicando o ato à Diretoria Executiva para ratificação, porque a segurança da vida prevalece sobre a agenda eclesiástica. Se eu emitir uma interdição, farei de boa-fé, só diante de risco iminente, registrando no sistema a justificativa técnica; sei que a Diretoria pode ratificá-la ou revogá-la, e que o ato fica registrado com o meu nome e o meu registro profissional."
};
const TERMO_SETOR_ITEM_REMOCAO = {
  codigo: "REMOCAO_POSTAGEM", base: "Regimento Art. 50, II",
  texto: "Sei que este Setor pode solicitar a remoção imediata de postagem nas redes sociais oficiais das congregações que tenha erro grosseiro, viole direito autoral ou fira a doutrina e a imagem institucional da Igreja. É um pedido, não uma ordem: faço-o de boa-fé, com o endereço da postagem e a justificativa, sabendo que a Diretoria pode revogá-lo e que o ato fica registrado com o meu nome."
};
const TERMO_SETOR_ITEM_JURIDICO = {
  codigo: "LIMITES_JURIDICOS", base: "Regimento Art. 51",
  texto: "Atuo na proteção da Instituição e nos projetos oficiais. Não atendo, em nome do Setor, assuntos pessoais ou particulares de dirigentes e membros, demandas da congregação que fujam do projeto vigente, nem dúvidas corriqueiras que a Secretaria da Igreja não tenha triado antes."
};
const TERMO_SETOR_ACEITE = "Li, aceito as normas estatutárias e concordo com o regime de trabalho voluntário do Setor Técnico";

// As cláusulas PRÓPRIAS do setor (além do texto geral), na ordem em que entram no Termo: os limites da consultoria jurídica, a interdição e o pedido de remoção.
// `setor`: { codigo, podeInterditar, podeSolicitarRemocao } — as marcas do catálogo escolhem. Quem aceita guarda esta lista junto do hash, para a conferência
// refazer o texto EXATO que a pessoa viu mesmo que as marcas do catálogo mudem depois.
const ESPECIFICOS_CONHECIDOS = { LIMITES_JURIDICOS: TERMO_SETOR_ITEM_JURIDICO, INTERDICAO: TERMO_SETOR_ITEM_INTERDICAO, REMOCAO_POSTAGEM: TERMO_SETOR_ITEM_REMOCAO };
function especificosDoSetor(setor) {
  const s = setor || {}, lista = [];
  if (s.codigo === "JURIDICO") lista.push("LIMITES_JURIDICOS");
  if (s.podeInterditar) lista.push("INTERDICAO");
  if (s.podeSolicitarRemocao) lista.push("REMOCAO_POSTAGEM");
  return lista;
}

// O Termo que a pessoa lê e aceita. `especificos` (opcional): a lista guardada num aceite antigo; sem ela vale a do catálogo de hoje. O hash cobre o texto composto.
function termoDoSetor(setor, especificos = null) {
  const s = setor || {};
  const codigos = (Array.isArray(especificos) ? especificos : especificosDoSetor(s)).filter(c => ESPECIFICOS_CONHECIDOS[c]);
  const itens = TERMO_SETOR_ITENS.map(i => ({ ...i }));
  for (const c of codigos) itens.push({ ...ESPECIFICOS_CONHECIDOS[c] });
  itens.push({ ...TERMO_SETOR_ITEM_REGISTRO });
  const hash = sha256(JSON.stringify({ v: TERMO_SETOR_VERSAO, t: TERMO_SETOR_TITULO, s: s.codigo || null, i: itens, a: TERMO_SETOR_ACEITE }));
  return { versao: TERMO_SETOR_VERSAO, titulo: TERMO_SETOR_TITULO, setor: { codigo: s.codigo || null, nome: s.nome || null }, itens, aceite: TERMO_SETOR_ACEITE, hash, especificos: codigos };
}

const textoDosEspecificos = (lista) => (Array.isArray(lista) ? lista : []).join(",");
const listaDosEspecificos = (texto) => (texto ? String(texto).split(",").filter(Boolean) : []);

// A adesão guarda o hash do texto aceito e a lista das cláusulas próprias do setor. Só a versão vigente do texto geral pode ser conferida contra o código; as
// anteriores ficam como "versão anterior" (o hash prova o texto da época). Ficha e mensagem não têm texto aqui: a prova é o documento arquivado.
function avaliarIntegridadeAdesao({ forma, termoVersao, termoHash, termoEspecificos }, setor) {
  if (forma === "FICHA_FISICA" || forma === "MENSAGERIA") return { status: "DOCUMENTO_EXTERNO", mensagem: "A prova é o documento arquivado, apontado na referência (não há texto guardado no sistema)." };
  if (!termoHash) return { status: "SEM_HASH", mensagem: "Adesão sem hash do texto." };
  const vigente = termoDoSetor(setor, listaDosEspecificos(termoEspecificos));
  if (Number(termoVersao) !== vigente.versao) return { status: "VERSAO_ANTERIOR", mensagem: `Aceitou a versão ${termoVersao} do texto; a vigente é a ${vigente.versao}. O hash guardado prova o texto da época.` };
  if (termoHash !== vigente.hash) return { status: "DIVERGENTE", mensagem: "O texto da versão vigente mudou sem trocar o número da versão: avise a equipe técnica." };
  return { status: "OK", mensagem: "Íntegra: o texto aceito é o da versão vigente." };
}

// ---------------------------------------------------------------
// Catálogo (Art. 52)
// ---------------------------------------------------------------

// A edição que não mandou um campo MANTÉM o valor atual (antes, mandar só nome e competência desarmava as marcas e a ordem em silêncio). `atual`: o setor como o banco o tem.
function mesclarEdicaoDoSetor(atual, dados = {}) {
  const base = { nome: atual.nome, competencia: atual.competencia, profissoes: atual.profissoes, conselhoClasse: atual.conselhoClasse, inciso: atual.inciso, exigeRegistro: atual.exigeRegistro, podeInterditar: atual.podeInterditar, podeSolicitarRemocao: atual.podeSolicitarRemocao, ordem: atual.ordem };
  const novo = { ...base };
  for (const [k, v] of Object.entries(dados || {})) if (k in base && v !== undefined) novo[k] = v;
  return novo;
}

// "Setor de Engenharia, Arquitetura e Obras" -> "SETOR_DE_ENGENHARIA_ARQUITETURA_E". Sem acento, em maiúsculas, só letras, números e sublinhado.
function gerarCodigoSetor(nome) {
  const base = limpar(nome).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30).replace(/_+$/g, "");
  return base.length >= 3 ? base : null;
}

function validarSetor(d = {}) {
  const nome = limpar(d.nome);
  if (nome.length < 3 || nome.length > 100 || temMarca(nome)) return { valido: false, mensagem: "Dê um nome ao setor (de 3 a 100 caracteres, sem < ou >)." };
  const competencia = limpar(d.competencia);
  if (competencia.length < 10 || competencia.length > 600 || temMarca(competencia)) return { valido: false, mensagem: "Descreva a competência do setor (de 10 a 600 caracteres, sem < ou >)." };
  const profissoes = limpar(d.profissoes) || null;
  if (profissoes && (profissoes.length > 200 || temMarca(profissoes))) return { valido: false, mensagem: "As profissões aceitam até 200 caracteres, sem < ou >." };
  const conselhoClasse = limpar(d.conselhoClasse) || null;
  if (conselhoClasse && (conselhoClasse.length > 60 || temMarca(conselhoClasse))) return { valido: false, mensagem: "O conselho de classe aceita até 60 caracteres, sem < ou >." };
  const inciso = limpar(d.inciso).toUpperCase() || null;
  if (inciso && !/^[IVXL]{1,6}$/.test(inciso)) return { valido: false, mensagem: "O inciso do Art. 52 se escreve em algarismos romanos (por exemplo XXI)." };
  for (const campo of ["exigeRegistro", "podeInterditar", "podeSolicitarRemocao"]) {
    if (d[campo] != null && typeof d[campo] !== "boolean") return { valido: false, mensagem: `${campo} deve ser verdadeiro ou falso.` };
  }
  let ordem = 0;
  if (d.ordem != null && d.ordem !== "") {
    ordem = Number(d.ordem);
    if (!Number.isInteger(ordem) || ordem < 0 || ordem > 999) return { valido: false, mensagem: "A ordem é um número de 0 a 999." };
  }
  return { valido: true, dados: { nome, competencia, profissoes, conselhoClasse, inciso, exigeRegistro: d.exigeRegistro === true, podeInterditar: d.podeInterditar === true, podeSolicitarRemocao: d.podeSolicitarRemocao === true, ordem } };
}

// ---------------------------------------------------------------
// Vínculo: formação, registro no conselho, candidatura e indicação
// ---------------------------------------------------------------

function validarFormacao(texto) {
  const f = limpar(texto);
  if (f.length < 3 || f.length > 150 || temMarca(f)) return { valido: false, mensagem: "Informe a formação acadêmica ou técnica (de 3 a 150 caracteres, sem < ou >), por exemplo: Engenheira civil, UFPA." };
  return { valido: true, formacao: f };
}

// O registro no conselho de classe: sigla e número, juntos ou nenhum. `exige`: o setor só aceita quem tem registro.
function validarRegistroProfissional({ conselhoSigla, registroNumero } = {}, { exige = false, conselhoClasse = null } = {}) {
  const sigla = limpar(conselhoSigla).toUpperCase(), numero = limpar(registroNumero).toUpperCase();
  if (!sigla && !numero) {
    return exige ? { valido: false, mensagem: `Este setor exige o registro no conselho de classe${conselhoClasse ? ` (${conselhoClasse})` : ""}: informe a sigla do conselho e o número.` } : { valido: true, conselhoSigla: null, registroNumero: null };
  }
  if (!sigla || !numero) return { valido: false, mensagem: "Informe a sigla do conselho e o número do registro, juntos (ou deixe os dois em branco)." };
  if (!/^[A-Z0-9/ -]{2,20}$/.test(sigla)) return { valido: false, mensagem: "A sigla do conselho tem de 2 a 20 caracteres (letras, números, / ou -), por exemplo CREA-PA." };
  if (!/^[A-Z0-9./-]{1,30}$/.test(numero)) return { valido: false, mensagem: "O número do registro tem de 1 a 30 caracteres (letras, números, ponto, barra ou hífen)." };
  return { valido: true, conselhoSigla: sigla, registroNumero: numero };
}

const rotuloRegistro = (sigla, numero) => (sigla && numero ? `${sigla} ${numero}` : null);

// A condição da pessoa para servir: membro ativo, em comunhão, maior de idade e com data de nascimento no cadastro. `membro`: { Status, SituacaoMembro, idade }.
function condicaoParaServir(membro) {
  if (!membro) return { pode: false, mensagem: "Pessoa não encontrada." };
  if (membro.Status !== "ATIVO" || membro.SituacaoMembro === "SEM_COMUNHAO") return { pode: false, mensagem: "O Setor Técnico é formado por membros em plena comunhão (Art. 48)." };
  if (membro.idade == null) return { pode: false, mensagem: "O cadastro não tem a data de nascimento: complete o cadastro com a Secretaria antes de servir num Setor Técnico." };
  if (membro.idade < vol.MAIORIDADE) return { pode: false, mensagem: "O Setor Técnico é de profissionais maiores de 18 anos." };
  return { pode: true };
}

function validarCandidatura(d = {}, { setor }) {
  const setorId = inteiroPositivo(d.setorId);
  if (!setorId) return { valido: false, mensagem: "Escolha o setor." };
  const f = validarFormacao(d.formacao);
  if (!f.valido) return f;
  const r = validarRegistroProfissional(d, { exige: !!(setor && setor.exigeRegistro), conselhoClasse: setor && setor.conselhoClasse });
  if (!r.valido) return r;
  return { valido: true, dados: { setorId, formacao: f.formacao, conselhoSigla: r.conselhoSigla, registroNumero: r.registroNumero } };
}

function validarIndicacao(d = {}, { setor }) {
  const membroId = inteiroPositivo(d.membroId);
  if (!membroId) return { valido: false, mensagem: "Informe a matrícula de quem será indicado." };
  const c = validarCandidatura(d, { setor });
  if (!c.valido) return c;
  return { valido: true, dados: { ...c.dados, membroId } };
}

function validarEncerramento(d = {}, { atorId, membroId }) {
  const tipo = limpar(d.tipoMotivo).toUpperCase() || "DESLIGAMENTO";
  if (!MOTIVOS_ENCERRAMENTO[tipo] || tipo === "RECUSADO") return { valido: false, mensagem: `Tipo de motivo inválido. Use um de: ${Object.keys(MOTIVOS_ENCERRAMENTO).filter(c => c !== "RECUSADO").join(", ")}.` };
  const obs = limpar(d.observacao);
  if (obs.length > 300 || temMarca(obs)) return { valido: false, mensagem: "A observação aceita até 300 caracteres, sem < ou >." };
  if (tipo === "DESLIGAMENTO" && obs.length < 5) return { valido: false, mensagem: "Registre o motivo do desligamento (de 5 a 300 caracteres)." };
  if (tipo !== "SAIDA_PROPRIA" && inteiroPositivo(membroId) === inteiroPositivo(atorId)) return { valido: false, mensagem: "Ninguém desliga a si mesmo: para sair, use o botão de sair do setor." };
  return { valido: true, dados: { tipoMotivo: tipo, observacao: obs || null } };
}

// Termo registrado pela Secretaria (ficha assinada ou e-mail/WhatsApp com resposta positiva). Só maiores de idade servem: sem responsável.
function validarRegistroTermo(d = {}, { hoje }) {
  return vol.validarRegistroAdesao(d, { hoje, idade: vol.MAIORIDADE });
}

// ---------------------------------------------------------------
// Atos cautelares (Art. 50)
// ---------------------------------------------------------------

// Só http e https, sem espaço, aspas nem sinais de tag; guarda o texto como foi dado.
function enderecoDaPostagem(texto) {
  const t = limpar(texto);
  if (t.length < 8 || t.length > 300 || /[\s<>"'`\\]/.test(t)) return null;
  try {
    const u = new URL(t);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".") ? t : null;
  } catch { return null; }
}

function textoLivre(valor, { min = 0, max, obrigatorio = false }) {
  const t = limpar(valor);
  if (!t) return obrigatorio ? null : "";
  if (t.length < min || t.length > max || temMarca(t)) return null;
  return t;
}

function validarInterdicao(d = {}) {
  const congregacaoId = inteiroPositivo(d.congregacaoId);
  if (!congregacaoId) return { valido: false, mensagem: "Escolha a congregação do templo ou da estrutura." };
  const motivo = limpar(d.motivo).toUpperCase();
  if (!MOTIVOS_INTERDICAO[motivo]) return { valido: false, mensagem: `Motivo inválido. A interdição cautelar vale para ${Object.values(MOTIVOS_INTERDICAO).join(" ou ").toLowerCase()} (Art. 50, I).` };
  const objeto = textoLivre(d.objeto, { min: 3, max: 150, obrigatorio: true });
  if (!objeto) return { valido: false, mensagem: "Diga o que foi interditado (de 3 a 150 caracteres, sem < ou >), por exemplo: Templo principal — cobertura da nave." };
  const descricao = textoLivre(d.descricao, { min: 30, max: 1000, obrigatorio: true });
  if (!descricao) return { valido: false, mensagem: "Registre a justificativa técnica (de 30 a 1000 caracteres, sem < ou >): o que foi visto e por que há risco iminente." };
  const referencia = textoLivre(d.referencia, { max: 300 });
  if (referencia == null) return { valido: false, mensagem: "O número do laudo ou da ART aceita até 300 caracteres, sem < ou >." };
  return { valido: true, dados: { congregacaoId, motivo, objeto, descricao, referencia: referencia || null } };
}

function validarPedidoRemocao(d = {}) {
  const congregacaoId = inteiroPositivo(d.congregacaoId);
  if (!congregacaoId) return { valido: false, mensagem: "Escolha a congregação dona da rede social." };
  let canalId = null;
  if (d.canalId != null && d.canalId !== "") {
    canalId = inteiroPositivo(d.canalId);
    if (!canalId) return { valido: false, mensagem: "canalId inválido." };
  }
  const motivo = limpar(d.motivo).toUpperCase();
  if (!MOTIVOS_REMOCAO[motivo]) return { valido: false, mensagem: `Motivo inválido. Use um de: ${Object.values(MOTIVOS_REMOCAO).join("; ")} (Art. 50, II).` };
  const objeto = textoLivre(d.objeto, { min: 3, max: 150, obrigatorio: !canalId });
  if (objeto == null || (!canalId && !objeto)) return { valido: false, mensagem: "Diga em que rede e perfil está a postagem (de 3 a 150 caracteres, sem < ou >), por exemplo: Instagram @congregacao." };
  const endereco = enderecoDaPostagem(d.referencia);
  if (!endereco) return { valido: false, mensagem: "Informe o endereço (link) da postagem, começando por https:// — sem espaços." };
  const descricao = textoLivre(d.descricao, { min: 20, max: 1000, obrigatorio: true });
  if (!descricao) return { valido: false, mensagem: "Registre a justificativa (de 20 a 1000 caracteres, sem < ou >): qual é o erro, a violação ou a ofensa." };
  return { valido: true, dados: { congregacaoId, canalId, motivo, objeto: objeto || null, referencia: endereco, descricao } };
}

// Ratificar ou revogar (a Diretoria Executiva). Só a interdição se ratifica; os dois atos se revogam, e revogar exige motivo.
function validarDecisao(d = {}, { tipo }) {
  const decisao = limpar(d.decisao).toUpperCase();
  if (!["RATIFICAR", "REVOGAR"].includes(decisao)) return { valido: false, mensagem: "Escolha ratificar ou revogar." };
  if (decisao === "RATIFICAR" && tipo !== "INTERDICAO") return { valido: false, mensagem: "O pedido de remoção de postagem não é ratificado: ele é atendido ou revogado." };
  const obs = textoLivre(d.observacao, { min: decisao === "REVOGAR" ? 10 : 0, max: 300, obrigatorio: decisao === "REVOGAR" });
  if (obs == null) return { valido: false, mensagem: decisao === "REVOGAR" ? "Registre o motivo da revogação (de 10 a 300 caracteres, sem < ou >)." : "A observação aceita até 300 caracteres, sem < ou >." };
  return { valido: true, dados: { decisao, para: decisao === "RATIFICAR" ? "RATIFICADA" : "REVOGADA", observacao: obs || null } };
}

// Encerrar o ato: levantar a interdição, dar o pedido por atendido ou cancelá-lo.
const ACOES_FECHAMENTO = { LEVANTAR: { para: "LEVANTADA", tipo: "INTERDICAO", min: 10 }, ATENDER: { para: "ATENDIDA", tipo: "REMOCAO_POSTAGEM", min: 0 }, CANCELAR: { para: "CANCELADA", tipo: "REMOCAO_POSTAGEM", min: 10 } };
function validarFechamento(d = {}, { acao }) {
  const a = ACOES_FECHAMENTO[acao];
  if (!a) return { valido: false, mensagem: "Ação inválida." };
  const obs = textoLivre(d.observacao, { min: a.min, max: 300, obrigatorio: a.min > 0 });
  if (obs == null) return { valido: false, mensagem: a.min > 0 ? `Registre a observação (de ${a.min} a 300 caracteres, sem < ou >).` : "A observação aceita até 300 caracteres, sem < ou >." };
  const padrao = acao === "ATENDER" ? "Atendido: a postagem foi removida." : null;
  return { valido: true, dados: { para: a.para, tipo: a.tipo, observacao: obs || padrao } };
}

// O setor tem o poder de emitir este tipo de ato? (A pessoa também precisa ser vínculo ATIVO nele: isso é da camada de banco.)
function setorPodeEmitir(setor, tipo) {
  if (!setor || setor.ativo === false) return false;
  return tipo === "INTERDICAO" ? !!setor.podeInterditar : tipo === "REMOCAO_POSTAGEM" ? !!setor.podeSolicitarRemocao : false;
}

// Quem pode fazer o quê com um ato, em um lugar só (a tela mostra os botões e a rota confere com a MESMA função).
//  ato:    { tipo, status, setorId, emitidaPorMembroId, congregacaoNome, canalId }
//  acesso: { membroId, diretoria (permissão setores_ratificacao no nível geral), gestao (setores_tecnicos no nível geral),
//            lider(nomeDaCongregacao) -> bool (sessão de liderança cujo escopo alcança a congregação),
//            setoresAtivos: Set de setorId em que a pessoa tem vínculo ATIVO, canaisAdministrados: Set de canalId que ela administra }
//  Ninguém ratifica nem revoga o próprio ato (segregação: quem emite não decide). A Diretoria desfaz uma ratificação levantando a interdição.
function podeAgirNoAto(ato, acao, acesso) {
  if (!ato || !acesso) return false;
  const proprio = Number(ato.emitidaPorMembroId) === Number(acesso.membroId);
  const emAberto = ato.status === "EMITIDA";
  switch (acao) {
    case "RATIFICAR": return ato.tipo === "INTERDICAO" && emAberto && !!acesso.diretoria && !proprio;
    case "REVOGAR": return emAberto && !!acesso.diretoria && !proprio;
    case "LEVANTAR": return ato.tipo === "INTERDICAO" && STATUS_ATO_ABERTOS.includes(ato.status) && (!!acesso.diretoria || (proprio && !!acesso.setoresAtivos && acesso.setoresAtivos.has(Number(ato.setorId))));
    case "ATENDER": return ato.tipo === "REMOCAO_POSTAGEM" && emAberto && !proprio && (!!acesso.diretoria || !!acesso.gestao
      || (ato.canalId != null && !!acesso.canaisAdministrados && acesso.canaisAdministrados.has(Number(ato.canalId)))
      || (typeof acesso.lider === "function" && !!acesso.lider(ato.congregacaoNome)));
    case "CANCELAR": return ato.tipo === "REMOCAO_POSTAGEM" && emAberto && proprio;
    default: return false;
  }
}
const ACOES_DO_ATO = ["RATIFICAR", "REVOGAR", "LEVANTAR", "ATENDER", "CANCELAR"];

// ---------------------------------------------------------------
// Textos dos avisos
// ---------------------------------------------------------------

const dataBr = (iso) => cal.formatarDataBr(String(iso).slice(0, 10));

function textoVinculoIndicado({ setorNome }) {
  return `Você foi indicado(a) para servir no ${setorNome}. Para começar, leia e aceite o Termo de Adesão em Meu Painel → Setores Técnicos (Regimento Art. 49 §2º): sem o aceite, o vínculo não é ativado. Servir é voluntário e gratuito, e você pode recusar ou sair quando quiser.`;
}

// Quem se candidatou e foi aprovado não foi "indicado": o aviso diz o que aconteceu de fato.
function textoCandidaturaAprovada({ setorNome }) {
  return `A sua candidatura ao ${setorNome} foi aprovada. Para começar, leia e aceite o Termo de Adesão em Meu Painel → Setores Técnicos (Regimento Art. 49 §2º): sem o aceite, o vínculo não é ativado. Servir é voluntário e gratuito, e você pode sair quando quiser.`;
}

function textoCandidatura({ nome, setorNome }) {
  return `${nome} se candidatou ao ${setorNome}. Analise em Setores Técnicos → Vínculos: aprovar abre o Termo de Adesão para a pessoa aceitar.`;
}

function textoInterdicaoEmitida({ setorNome, emitenteNome, registro, congregacaoNome, objeto, motivo, hoje }) {
  const quem = registro ? `${emitenteNome} (${registro})` : emitenteNome;
  return `${setorNome}: ${quem} INTERDITOU, em caráter cautelar, ${objeto} da congregação ${congregacaoNome} — ${MOTIVOS_INTERDICAO[motivo].toLowerCase()} — em ${dataBr(hoje)}. Pelo Art. 50, I, o ato vale desde já e a Diretoria Executiva deve ratificá-lo ou revogá-lo (Setores Técnicos → Atos cautelares). A segurança da vida prevalece sobre a agenda: avalie os cultos e eventos previstos no local.`;
}

function textoInterdicaoDecidida({ decisao, setorNome, congregacaoNome, objeto, observacao }) {
  const o = observacao ? ` Observação: ${observacao}` : "";
  if (decisao === "RATIFICADA") return `A Diretoria Executiva RATIFICOU a interdição de ${objeto} da congregação ${congregacaoNome} (${setorNome}). A interdição segue em vigor até o risco ser sanado e o Setor levantá-la.${o}`;
  if (decisao === "REVOGADA") return `A Diretoria Executiva REVOGOU a interdição de ${objeto} da congregação ${congregacaoNome} (${setorNome}): ela deixa de valer.${o}`;
  return `A interdição de ${objeto} da congregação ${congregacaoNome} (${setorNome}) foi LEVANTADA: o risco foi sanado.${o}`;
}

function textoInterdicaoPendente({ setorNome, congregacaoNome, objeto, emitidaEm, dias }) {
  return `A interdição de ${objeto} da congregação ${congregacaoNome} (${setorNome}), emitida em ${dataBr(emitidaEm)}, está há ${dias} dia(s) sem ratificação nem revogação. Decida em Setores Técnicos → Atos cautelares.`;
}

function textoPedidoRemocao({ setorNome, emitenteNome, congregacaoNome, objeto, motivo, hoje }) {
  return `${setorNome}: ${emitenteNome} pede a REMOÇÃO IMEDIATA de uma postagem${objeto ? ` (${objeto})` : ""} nas redes oficiais da congregação ${congregacaoNome} — ${MOTIVOS_REMOCAO[motivo].toLowerCase()} — em ${dataBr(hoje)} (Art. 50, II). Veja o endereço da postagem em Setores Técnicos → Atos cautelares; depois de removida, marque o pedido como atendido.`;
}

function textoRemocaoPendente({ setorNome, congregacaoNome, emitidaEm, dias }) {
  return `O pedido de remoção de postagem de ${setorNome} para a congregação ${congregacaoNome}, de ${dataBr(emitidaEm)}, segue sem ser atendido há ${dias} dia(s). O Regimento pede remoção imediata (Art. 50, II): remova a postagem ou, se discordar, a Diretoria pode revogar o pedido.`;
}

function textoRemocaoDecidida({ para, setorNome, congregacaoNome, observacao }) {
  const o = observacao ? ` Observação: ${observacao}` : "";
  if (para === "REVOGADA") return `A Diretoria Executiva REVOGOU o pedido de remoção de postagem de ${setorNome} para a congregação ${congregacaoNome}: não é preciso remover.${o}`;
  if (para === "CANCELADA") return `${setorNome} CANCELOU o pedido de remoção de postagem para a congregação ${congregacaoNome}: não é mais preciso remover.${o}`;
  return `O pedido de remoção de postagem de ${setorNome} para a congregação ${congregacaoNome} foi dado como ATENDIDO.${o}`;
}

module.exports = {
  STATUS_VINCULO, ORIGENS_VINCULO, MOTIVOS_ENCERRAMENTO, TIPOS_ATO, MOTIVOS_INTERDICAO, MOTIVOS_REMOCAO, STATUS_ATO, STATUS_ATO_ABERTOS, TRANSICOES, transicaoPermitida,
  MAX_ATOS_ABERTOS_POR_EMITENTE, MAX_ATOS_POR_DIA, MAX_VINCULOS_VIGENTES_POR_PESSOA, MAX_CANDIDATURAS_POR_DIA, LEMBRETE_DIAS_PADRAO, IP_RETENCAO_DIAS_PADRAO, LIMITE_LISTA,
  TERMO_SETOR_VERSAO, TERMO_SETOR_TITULO, TERMO_SETOR_ITENS, TERMO_SETOR_ITEM_REGISTRO, TERMO_SETOR_ITEM_INTERDICAO, TERMO_SETOR_ITEM_REMOCAO, TERMO_SETOR_ITEM_JURIDICO, TERMO_SETOR_ACEITE,
  especificosDoSetor, termoDoSetor, textoDosEspecificos, listaDosEspecificos, avaliarIntegridadeAdesao,
  gerarCodigoSetor, validarSetor, validarFormacao, validarRegistroProfissional, rotuloRegistro, condicaoParaServir, validarCandidatura, validarIndicacao, validarEncerramento, validarRegistroTermo,
  enderecoDaPostagem, validarInterdicao, validarPedidoRemocao, validarDecisao, ACOES_FECHAMENTO, validarFechamento, setorPodeEmitir, podeAgirNoAto, ACOES_DO_ATO,
  textoVinculoIndicado, textoCandidaturaAprovada, mesclarEdicaoDoSetor, textoCandidatura, textoInterdicaoEmitida, textoInterdicaoDecidida, textoInterdicaoPendente, textoPedidoRemocao, textoRemocaoPendente, textoRemocaoDecidida,
  inteiroPositivo, sha256
};
