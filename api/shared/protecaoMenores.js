// shared/protecaoMenores.js (v7.8 — Incidentes, notificação obrigatória e escuta protegida)
//
// ECA, Art. 13 (suspeita ou confirmação de maus-tratos deve ser comunicada ao Conselho Tutelar) e Art. 245 (multa de 3 a 20 salários de referência pela omissão, dobrada na
// reincidência); Lei 13.431/2017 (escuta protegida: quem acolhe NÃO inquire, registra o relato espontâneo e encaminha); Regimento Art. 133 §5º (afastamento cautelar).
//
// Este módulo é a REGRA, pura (sem banco): níveis do incidente, o relógio das 24 horas, o que fecha um caso, a composição do Comitê, os padrões de pequenas quebras e o
// que cada aviso diz. O banco (shared/protecaoDb.js) só reúne os fatos e grava o que aqui se decide.
//
// Princípios: (1) a Igreja COMUNICA, não investiga — a lista de campos não tem "interrogatório"; (2) o relógio é calculado na leitura (o prazo vence mesmo que a rotina
// não rode); (3) nenhum aviso (e-mail sai do sistema) leva nome de criança, nome do envolvido nem o conteúdo do relato; (4) nada é apagado: o incidente só acumula registros.
const vol = require("./voluntariado");
const cal = require("./calendario");
const { inteiroPositivo } = require("./setoresTecnicos");

// ---------------------------------------------------------------
// Vocabulário
// ---------------------------------------------------------------

const HORAS_PRAZO = 24;                     // ECA Art. 13 + decisão do plano: SLA curto de 24 horas da ciência da suspeita
const MS_HORA = 3600000;
const LIMITE_ATENCAO_HORAS = 12;            // a partir daqui o relógio fica amarelo
const LIMITE_CRITICO_HORAS = 4;             // e daqui vermelho
const VENCIDO_REPETE_HORAS = 6;             // vencido: o aviso se repete a cada 6 horas até a comunicação ser registrada
const VENCIDO_AVISOS_MAXIMO = 5;            // 0, 6, 12, 18 e 24 horas depois do prazo; daí em diante, só o resumo diário à Diretoria
const JANELA_PADRAO_DIAS = 90;              // "a sequência de pequenas quebras": olha os últimos 90 dias
const PADRAO_MINIMO = 3;                    // três registros da mesma equipe ou da mesma pessoa
const MAX_CIENCIA_ATRAS_HORAS = 24 * 30;    // "soubemos há..." até 30 dias atrás (acima disso é erro de digitação)
const MAX_TEXTO_DESCRICAO = 1000;
const MAX_TEXTO_RELATO = 4000;
const MAX_PROVIDENCIA = 500;
const MAX_OBSERVACAO = 300;
const COMITE_MINIMO = 3;

const NIVEIS = {
  QUASE_ACIDENTE: { rotulo: "Quase-acidente", ordem: 1, descricao: "Algo que podia ter dado errado com uma criança ou adolescente, mas não deu (ex.: criança saiu da sala sem ser vista e foi achada logo)." },
  QUEBRA_POLITICA: { rotulo: "Quebra de política de proteção", ordem: 2, descricao: "Alguém descumpriu uma regra de proteção (ex.: adulto a sós com uma criança, uso do celular para falar com menor fora do combinado)." },
  ALEGACAO: { rotulo: "Suspeita ou relato de violência", ordem: 3, descricao: "Uma criança ou adolescente contou, ou alguém suspeita, que sofreu maus-tratos, abuso ou violência. A lei manda comunicar ao Conselho Tutelar em até 24 horas." }
};
const CODIGOS_NIVEL = Object.keys(NIVEIS);
const NIVEL_EXIGE_COMUNICACAO = { QUASE_ACIDENTE: false, QUEBRA_POLITICA: false, ALEGACAO: true };

const ORGAOS = {
  CONSELHO_TUTELAR: "Conselho Tutelar",
  MINISTERIO_PUBLICO: "Ministério Público",
  POLICIA: "Polícia (delegacia)",
  DISQUE_100: "Disque 100 (Disque Direitos Humanos)",
  OUTRO: "Outro órgão de proteção"
};
const FORMAS_COMUNICACAO = {
  OFICIO: "Ofício protocolado",
  PRESENCIAL: "Pessoalmente no órgão",
  TELEFONE: "Telefone",
  EMAIL: "E-mail",
  SISTEMA_ONLINE: "Sistema online do órgão"
};
const QUEM_RELATOU = {
  PROPRIA_CRIANCA: "A própria criança ou adolescente",
  RESPONSAVEL: "O pai, a mãe ou o responsável",
  VOLUNTARIO: "Um voluntário ou líder que presenciou ou ouviu",
  OUTRA_PESSOA: "Outra pessoa"
};
const ORIGENS = { MEMBRO: "Registrado por um membro", CANAL_AJUDA: "Canal de ajuda (sem login)" };
const RESULTADOS_ENCERRAMENTO = {
  SEM_CONTEUDO_DE_PROTECAO: "Pedido sem conteúdo de proteção (só para o canal de ajuda sem login: teste, engano ou texto sem relato de violência)",
  ENCAMINHADO_AUTORIDADE: "Encaminhado às autoridades (a apuração é delas)",
  MEDIDA_INTERNA: "Medida interna tomada (para quase-acidente e quebra de política)",
  SEM_CONTINUIDADE: "Sem continuidade: nada mais a fazer pela Igreja"
};
const DECISOES_CAUTELAR = {
  MANTIDO_AFASTADO: "Afastamento mantido: o contato com menores segue suspenso",
  LIBERADO: "Afastamento levantado: a pessoa pode voltar, se a habilitação estiver em dia"
};
// Quem tem cargo ministerial consagrado conta como clérigo; o cadastro decide (nunca é digitado na tela do Comitê).
const CARGOS_CLERICAIS = ["PASTOR", "EVANGELISTA", "PRESBITERO", "DIACONO", "MISSIONARIO"];

// Orientação à criança e ao adolescente (a tela pública usa exatamente isto): linguagem simples, sem juridiquês.
const CONTATOS_DE_AJUDA = [
  { nome: "Disque 100", numero: "100", descricao: "Gratuito, 24 horas, todos os dias. Para contar que uma criança ou adolescente está sofrendo violência." },
  { nome: "Polícia", numero: "190", descricao: "Se existe perigo agora." },
  { nome: "Conselho Tutelar", numero: null, descricao: "Existe um em cada cidade. Pergunte na prefeitura ou procure o mais perto de você." }
];
const ROTEIRO_ESCUTA = [
  { passo: "1. Acolher", texto: "Ouça com calma, sem espanto e sem pressa. Diga: \"Obrigado por me contar. Você não tem culpa.\" Não prometa guardar segredo: diga que vai pedir ajuda a quem pode proteger." },
  { passo: "2. Registrar o que foi dito", texto: "Escreva o relato com as palavras da própria criança, do jeito que ela falou, sem corrigir e sem interpretar. Registre só o que ela contou de livre vontade." },
  { passo: "3. Encaminhar", texto: "A Igreja não investiga. O sistema avisa a liderança e o prazo de 24 horas para comunicar ao Conselho Tutelar começa a contar. Quem apura são as autoridades." }
];
const NAO_FACA = [
  "Não faça perguntas para \"tirar a verdade\" (ex.: \"Tem certeza?\", \"Quem fez isso?\", \"Como foi exatamente?\"). Repetir a conversa machuca de novo.",
  "Não chame a pessoa apontada para \"esclarecer\" nem avise a família dela.",
  "Não conte a outras pessoas além de quem o sistema avisa.",
  "Não tente resolver sozinho, nem espere para ter certeza: a lei manda comunicar a SUSPEITA."
];

// ---------------------------------------------------------------
// Pequenos auxiliares
// ---------------------------------------------------------------

const limpar = (v) => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const temMarca = (s) => /[<>]/.test(s);
const tem = (obj, chave) => Object.prototype.hasOwnProperty.call(obj, chave);
const paraIso = (v) => {
  if (v == null || v === "") return null;
  const s = v instanceof Date ? (Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10)) : String(v).slice(0, 10);
  return cal.dataIsoValida(s) ? s : null;
};
function somarDiasIso(iso, dias) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}
function diasEntreIso(deIso, ateIso) {
  const [a1, m1, d1] = deIso.split("-").map(Number);
  const [a2, m2, d2] = ateIso.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}
const comoData = (v) => (v instanceof Date ? v : typeof v === "string" || typeof v === "number" ? new Date(v) : null);
const instanteValido = (v) => { const d = comoData(v); return d && !Number.isNaN(d.getTime()) ? d : null; };
const idPositivo = (v) => inteiroPositivo(v);

// ---------------------------------------------------------------
// O relógio das 24 horas
// ---------------------------------------------------------------

function prazoNotificacao(conhecidoEm) {
  const d = instanteValido(conhecidoEm);
  return d ? new Date(d.getTime() + HORAS_PRAZO * MS_HORA) : null;
}

// { restanteMs, horasRestantes, vencido, faixa: NORMAL|ATENCAO|CRITICO|VENCIDO, texto }
function relogio(prazoEm, agora = new Date()) {
  const p = instanteValido(prazoEm), a = instanteValido(agora);
  if (!p || !a) return { restanteMs: null, horasRestantes: null, vencido: false, faixa: "NORMAL", texto: "" };
  const restanteMs = p.getTime() - a.getTime();
  const vencido = restanteMs <= 0;
  const abs = Math.abs(restanteMs);
  const h = Math.floor(abs / MS_HORA), m = Math.floor((abs % MS_HORA) / 60000);
  const faixa = vencido ? "VENCIDO" : restanteMs <= LIMITE_CRITICO_HORAS * MS_HORA ? "CRITICO" : restanteMs <= LIMITE_ATENCAO_HORAS * MS_HORA ? "ATENCAO" : "NORMAL";
  const dur = h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
  return { restanteMs, horasRestantes: Math.floor(restanteMs / MS_HORA), vencido, faixa, texto: vencido ? `vencido há ${dur}` : `faltam ${dur}` };
}

// A etapa de aviso em que o incidente está AGORA (cada uma dispara um aviso só; o vencido se repete de 6 em 6 horas): null = ainda cedo.
function etapaDeAviso(prazoEm, agora = new Date()) {
  const r = relogio(prazoEm, agora);
  if (r.restanteMs == null) return null;
  if (r.vencido) {
    const n = Math.floor(Math.abs(r.restanteMs) / (VENCIDO_REPETE_HORAS * MS_HORA));
    return n >= VENCIDO_AVISOS_MAXIMO ? null : { codigo: `VENCIDO_${n}`, bloco: 3 + n };
  }
  if (r.restanteMs <= LIMITE_CRITICO_HORAS * MS_HORA) return { codigo: "QUATRO_HORAS", bloco: 2 };
  if (r.restanteMs <= LIMITE_ATENCAO_HORAS * MS_HORA) return { codigo: "DOZE_HORAS", bloco: 1 };
  return null;
}
// Referência INT do aviso: um por incidente × etapa (dedupe do motor de notificações).
function referenciaDoAviso(incidenteId, bloco) {
  return (Number(incidenteId) % 100000) * 1000 + Math.min(Number(bloco), 999);
}

// ---------------------------------------------------------------
// Validação do registro de um incidente
// ---------------------------------------------------------------

// d = { nivel, dataOcorrencia, congregacaoId, equipeId?, onde?, descricao, envolvidoMembroId?, envolvidoNome?, relatadoPor?, relato?, conhecidoHaHoras? }
function validarIncidente(d, { hoje, agora = new Date(), origem = "MEMBRO" } = {}) {
  const dados = d && typeof d === "object" && !Array.isArray(d) ? d : {};
  const nivel = limpar(dados.nivel);
  if (!tem(NIVEIS, nivel)) return { valido: false, mensagem: "Escolha o que aconteceu: quase-acidente, quebra de política ou suspeita/relato de violência." };
  const dataOcorrencia = paraIso(dados.dataOcorrencia);
  if (!dataOcorrencia) return { valido: false, mensagem: "Informe a data em que aconteceu (AAAA-MM-DD)." };
  if (hoje && dataOcorrencia > hoje) return { valido: false, mensagem: "A data em que aconteceu não pode estar no futuro." };
  if (hoje && diasEntreIso(dataOcorrencia, hoje) > 365 * 20) return { valido: false, mensagem: "A data em que aconteceu está longe demais: confira o ano." };
  const congregacaoId = idPositivo(dados.congregacaoId);
  if (!congregacaoId) return { valido: false, mensagem: "Escolha a congregação onde aconteceu." };
  let equipeId = null;
  if (dados.equipeId != null && dados.equipeId !== "") { equipeId = idPositivo(dados.equipeId); if (!equipeId) return { valido: false, mensagem: "A equipe informada não é válida." }; }
  const onde = limpar(dados.onde);
  if (onde.length > 150 || temMarca(onde)) return { valido: false, mensagem: "Onde aconteceu: até 150 caracteres, sem < ou >." };
  const descricao = limpar(dados.descricao);
  if (descricao.length < 10 || descricao.length > MAX_TEXTO_DESCRICAO || temMarca(descricao)) return { valido: false, mensagem: `Descreva o que aconteceu em poucas palavras (de 10 a ${MAX_TEXTO_DESCRICAO} caracteres, sem < ou >). Escreva só fatos, sem opinião.` };

  let envolvidoMembroId = null;
  if (dados.envolvidoMembroId != null && dados.envolvidoMembroId !== "") { envolvidoMembroId = idPositivo(dados.envolvidoMembroId); if (!envolvidoMembroId) return { valido: false, mensagem: "A matrícula da pessoa envolvida não é válida." }; }
  const envolvidoNome = limpar(dados.envolvidoNome);
  if (envolvidoNome.length > 150 || temMarca(envolvidoNome)) return { valido: false, mensagem: "Nome da pessoa envolvida: até 150 caracteres, sem < ou >." };

  const exige = NIVEL_EXIGE_COMUNICACAO[nivel];
  let relatadoPor = null, relato = null;
  if (exige) {
    relatadoPor = limpar(dados.relatadoPor);
    if (!tem(QUEM_RELATOU, relatadoPor)) return { valido: false, mensagem: "Informe quem contou ou percebeu o fato (a criança, o responsável, um voluntário ou outra pessoa)." };
    relato = limpar(dados.relato);
    if (relato.length < 10 || relato.length > MAX_TEXTO_RELATO || temMarca(relato)) return { valido: false, mensagem: `Registre o relato do jeito que foi contado, sem corrigir nem interpretar (de 10 a ${MAX_TEXTO_RELATO} caracteres, sem < ou >).` };
  } else {
    // quase-acidente e quebra de política: o relato é opcional; se vier, vale com o mesmo limite
    relato = limpar(dados.relato);
    if (relato) { if (relato.length > MAX_TEXTO_RELATO || temMarca(relato)) return { valido: false, mensagem: `O relato aceita até ${MAX_TEXTO_RELATO} caracteres, sem < ou >.` }; } else relato = null;
    relatadoPor = limpar(dados.relatadoPor) || null;
    if (relatadoPor && !tem(QUEM_RELATOU, relatadoPor)) return { valido: false, mensagem: "Quem contou o fato não é uma opção válida." };
  }

  let horas = 0;
  if (dados.conhecidoHaHoras != null && dados.conhecidoHaHoras !== "") {
    const n = Number(dados.conhecidoHaHoras);
    if (!Number.isFinite(n) || n < 0 || n > MAX_CIENCIA_ATRAS_HORAS || Math.floor(n) !== n) return { valido: false, mensagem: `"Soubemos há quantas horas" precisa ser um número inteiro de 0 a ${MAX_CIENCIA_ATRAS_HORAS}.` };
    horas = n;
  }
  const a = instanteValido(agora) || new Date();
  const conhecidoEm = new Date(a.getTime() - horas * MS_HORA);
  return {
    valido: true,
    dados: { nivel, dataOcorrencia, congregacaoId, equipeId, onde: onde || null, descricao, envolvidoMembroId, envolvidoNome: envolvidoNome || null, relatadoPor, relato, origem, conhecidoEm, exigeComunicacao: exige }
  };
}

// O canal de ajuda (sem login): a criança conta o que quiser; só o texto é obrigatório. NÃO há campo de pergunta: ninguém precisa "provar" nada.
function validarPedidoDeAjuda(d, { hoje, agora = new Date() } = {}) {
  const dados = d && typeof d === "object" && !Array.isArray(d) ? d : {};
  const texto = limpar(dados.texto);
  if (texto.length < 10 || texto.length > MAX_TEXTO_RELATO || temMarca(texto)) return { valido: false, mensagem: `Escreva o que você quer contar, com as suas palavras (de 10 a ${MAX_TEXTO_RELATO} letras, sem < ou >).` };
  let congregacaoId = null;
  if (dados.congregacaoId != null && dados.congregacaoId !== "") { congregacaoId = idPositivo(dados.congregacaoId); if (!congregacaoId) return { valido: false, mensagem: "A igreja escolhida não é válida." }; }
  const contato = limpar(dados.contato);
  if (contato.length > 150 || temMarca(contato)) return { valido: false, mensagem: "Como falar com você: até 150 caracteres, sem < ou >." };
  const quemSou = limpar(dados.quemSou);
  if (quemSou && !["CRIANCA_ADOLESCENTE", "RESPONSAVEL", "OUTRA_PESSOA"].includes(quemSou)) return { valido: false, mensagem: "Quem é você: escolha uma das opções." };
  return { valido: true, dados: { texto, congregacaoId, contato: contato || null, quemSou: quemSou || null, conhecidoEm: instanteValido(agora) || new Date(), dataOcorrencia: hoje || null } };
}

// ---------------------------------------------------------------
// Comunicação externa (ofício, protocolo, ligação) e encerramento
// ---------------------------------------------------------------

// d = { orgao, forma, comunicadoEm, protocoloExterno?, referenciaArquivo?, observacao? }
function validarComunicacaoExterna(d, { agora = new Date(), conhecidoEm } = {}) {
  const dados = d && typeof d === "object" && !Array.isArray(d) ? d : {};
  const orgao = limpar(dados.orgao);
  if (!tem(ORGAOS, orgao)) return { valido: false, mensagem: "Escolha o órgão que foi avisado (Conselho Tutelar, Ministério Público, Polícia...)." };
  const forma = limpar(dados.forma);
  if (!tem(FORMAS_COMUNICACAO, forma)) return { valido: false, mensagem: "Escolha como o órgão foi avisado (ofício, pessoalmente, telefone...)." };
  const quando = instanteValido(dados.comunicadoEm);
  if (!quando) return { valido: false, mensagem: "Informe a data e a hora em que o órgão foi avisado." };
  const a = instanteValido(agora) || new Date();
  if (quando.getTime() > a.getTime() + 5 * 60000) return { valido: false, mensagem: "A hora em que o órgão foi avisado não pode estar no futuro." };
  const ciencia = instanteValido(conhecidoEm);
  if (ciencia && quando.getTime() < ciencia.getTime() - 60000) return { valido: false, mensagem: "A comunicação não pode ser anterior ao momento em que a Igreja ficou sabendo." };
  const protocoloExterno = limpar(dados.protocoloExterno);
  if (protocoloExterno.length > 60 || temMarca(protocoloExterno)) return { valido: false, mensagem: "O número de protocolo do órgão aceita até 60 caracteres, sem < ou >." };
  if (protocoloExterno && !valorSignificativo(protocoloExterno)) return { valido: false, mensagem: "O número de protocolo parece incompleto: informe o número que o órgão deu (pelo menos 4 letras ou números), ou deixe em branco e diga onde o comprovante está guardado." };
  const referenciaArquivo = limpar(dados.referenciaArquivo);
  if (referenciaArquivo.length > 200 || temMarca(referenciaArquivo)) return { valido: false, mensagem: "Onde o comprovante está guardado: até 200 caracteres, sem < ou >." };
  if (referenciaArquivo && !valorSignificativo(referenciaArquivo)) return { valido: false, mensagem: "Diga com clareza onde o comprovante está guardado (por exemplo: \"Pasta 4, ofício 12/2026, secretaria da sede\")." };
  const observacao = limpar(dados.observacao);
  if (observacao.length > MAX_OBSERVACAO || temMarca(observacao)) return { valido: false, mensagem: `A observação aceita até ${MAX_OBSERVACAO} caracteres, sem < ou >.` };
  return { valido: true, dados: { orgao, forma, comunicadoEm: quando, protocoloExterno: protocoloExterno || null, referenciaArquivo: referenciaArquivo || null, observacao: observacao || null } };
}

// Um texto que pode valer como prova: pelo menos 4 letras ou números, e nunca "n/a", "sem protocolo", "teste", "0000", "xxxx" ou "1234".
const SEM_SENTIDO = /^(n\/?a|na|nada|nenhum|nenhuma|teste|test|tbd|pendente|sem|sem protocolo|sem numero|sem número|nao tem|não tem|nao sei|não sei|1234\d*|abcd\w*)$/i;
function valorSignificativo(s) {
  const t = limpar(s);
  const so = t.replace(/[^0-9A-Za-zÀ-ÿ]/g, "");
  if (so.length < 4 || /^(.)\1+$/.test(so) || SEM_SENTIDO.test(t) || SEM_SENTIDO.test(so)) return false;
  return true;
}
// A comunicação tem comprovante? Protocolo do órgão, lugar onde o papel está guardado ou arquivo anexado ao incidente.
const temComprovante = (c) => !!(c && (valorSignificativo(c.protocoloExterno) || valorSignificativo(c.referenciaArquivo) || c.temAnexo));
const foraDoPrazo = (comunicadoEm, prazoEm) => { const c = instanteValido(comunicadoEm), p = instanteValido(prazoEm); return !!(c && p && c.getTime() > p.getTime()); };

// i = { nivel, status }; comunicacoes = [{ protocoloExterno, referenciaArquivo, temAnexo }]; envolvidos = [{ membroId, nivelAlegacao, decisao }]
// (o afastamento cautelar é do envolvido que é membro, num incidente de suspeita de violência; o Comitê precisa ter decidido sobre ele — manter ou levantar — para o caso fechar)
function podeEncerrar(i, comunicacoes = [], envolvidos = []) {
  const motivos = [];
  if (!i || i.status === "ENCERRADO") return { ok: false, motivos: ["Este incidente já foi encerrado."] };
  if (i.semConteudo) {
    if ((envolvidos || []).some((e) => e.membroId)) motivos.push("Há uma pessoa do cadastro vinculada como envolvida: não é um pedido 'sem conteúdo de proteção'. Siga o caminho normal (comunicar, decidir sobre o afastamento e encaminhar).");
    return { ok: motivos.length === 0, motivos };
  }
  if (NIVEL_EXIGE_COMUNICACAO[i.nivel]) {
    if (!comunicacoes.length) motivos.push("Falta registrar a comunicação ao Conselho Tutelar (ou a outro órgão de proteção): a lei exige comunicar a suspeita.");
    else if (!comunicacoes.some(temComprovante)) motivos.push("A comunicação foi registrada, mas falta o comprovante: o número de protocolo do órgão, onde o papel está guardado ou o arquivo anexado.");
  }
  const semDecisao = (envolvidos || []).filter((e) => e.membroId && e.nivelAlegacao && !e.decisao);
  if (semDecisao.length) motivos.push("Falta o Comitê decidir sobre o afastamento cautelar da pessoa envolvida (manter ou levantar).");
  return { ok: motivos.length === 0, motivos };
}

// d = { resultado, providencia }
function validarEncerramento(d, { nivel, origem } = {}) {
  const dados = d && typeof d === "object" && !Array.isArray(d) ? d : {};
  const resultado = limpar(dados.resultado);
  if (!tem(RESULTADOS_ENCERRAMENTO, resultado)) return { valido: false, mensagem: "Escolha como o caso termina para a Igreja." };
  if (resultado === "SEM_CONTEUDO_DE_PROTECAO") {
    if (origem !== "CANAL_AJUDA" || nivel !== "ALEGACAO") return { valido: false, mensagem: "\"Sem conteúdo de proteção\" só vale para um pedido do canal de ajuda sem login (teste, engano ou texto sem relato de violência). Uma suspeita registrada por um membro termina encaminhada às autoridades." };
    const motivo = limpar(dados.providencia);
    if (motivo.length < 10 || motivo.length > MAX_PROVIDENCIA || temMarca(motivo)) return { valido: false, mensagem: `Explique por que o pedido não tem conteúdo de proteção (de 10 a ${MAX_PROVIDENCIA} caracteres, sem < ou >), sem citar nomes de crianças.` };
    return { valido: true, dados: { resultado, providencia: motivo } };
  }
  if (NIVEL_EXIGE_COMUNICACAO[nivel] && resultado !== "ENCAMINHADO_AUTORIDADE") return { valido: false, mensagem: "Uma suspeita ou relato de violência só termina como \"encaminhado às autoridades\": a apuração não é da Igreja." };
  if (!NIVEL_EXIGE_COMUNICACAO[nivel] && resultado === "ENCAMINHADO_AUTORIDADE") return { valido: false, mensagem: "Para quase-acidente e quebra de política, escolha \"medida interna tomada\" ou \"sem continuidade\". Se virou uma suspeita de violência, reclassifique o incidente." };
  const providencia = limpar(dados.providencia);
  if (providencia.length < 10 || providencia.length > MAX_PROVIDENCIA || temMarca(providencia)) return { valido: false, mensagem: `Escreva o que foi feito (de 10 a ${MAX_PROVIDENCIA} caracteres, sem < ou >), sem citar nomes de crianças.` };
  return { valido: true, dados: { resultado, providencia } };
}

// Só se sobe de nível (nunca se rebaixa uma alegação: a Igreja não decide que "não era nada"). Quem sobe passa a ter o relógio de 24 horas.
function validarReclassificacao(d, { nivelAtual, agora = new Date() } = {}) {
  const dados = d && typeof d === "object" && !Array.isArray(d) ? d : {};
  const novo = limpar(dados.nivelNovo);
  if (!tem(NIVEIS, novo)) return { valido: false, mensagem: "Escolha o novo nível do incidente." };
  if (!tem(NIVEIS, nivelAtual) || NIVEIS[novo].ordem <= NIVEIS[nivelAtual].ordem) return { valido: false, mensagem: "Só é possível aumentar a gravidade do incidente. Uma suspeita de violência nunca é rebaixada." };
  const motivo = limpar(dados.motivo);
  if (motivo.length < 10 || motivo.length > MAX_OBSERVACAO || temMarca(motivo)) return { valido: false, mensagem: `Explique por que o incidente é mais grave (de 10 a ${MAX_OBSERVACAO} caracteres, sem < ou >).` };
  let relatadoPor = null, relato = null;
  if (NIVEL_EXIGE_COMUNICACAO[novo]) {
    relatadoPor = limpar(dados.relatadoPor);
    if (!tem(QUEM_RELATOU, relatadoPor)) return { valido: false, mensagem: "Informe quem contou ou percebeu o fato." };
    relato = limpar(dados.relato);
    if (relato.length < 10 || relato.length > MAX_TEXTO_RELATO || temMarca(relato)) return { valido: false, mensagem: `Registre o relato do jeito que foi contado (de 10 a ${MAX_TEXTO_RELATO} caracteres, sem < ou >).` };
  }
  return { valido: true, dados: { nivelNovo: novo, motivo, relatadoPor, relato, conhecidoEm: instanteValido(agora) || new Date() } };
}

// ---------------------------------------------------------------
// Afastamento cautelar do envolvido
// ---------------------------------------------------------------

function validarDecisaoCautelar(d, { atorId, membroId } = {}) {
  const dados = d && typeof d === "object" && !Array.isArray(d) ? d : {};
  if (idPositivo(atorId) && idPositivo(atorId) === idPositivo(membroId)) return { valido: false, mensagem: "Ninguém decide sobre o próprio afastamento." };
  const decisao = limpar(dados.decisao);
  if (!tem(DECISOES_CAUTELAR, decisao)) return { valido: false, mensagem: "Escolha a decisão: manter ou levantar o afastamento." };
  const observacao = limpar(dados.observacao);
  if (observacao.length < 10 || observacao.length > MAX_OBSERVACAO || temMarca(observacao)) return { valido: false, mensagem: `Registre o motivo da decisão (de 10 a ${MAX_OBSERVACAO} caracteres, sem < ou >), sem citar nomes de crianças.` };
  return { valido: true, dados: { decisao, observacao } };
}

// ---------------------------------------------------------------
// O padrão de pequenas quebras
// ---------------------------------------------------------------

// eventos = [{ incidenteId, nivel, equipeId, envolvidoMembroId, data:'AAAA-MM-DD' }] (quase-acidente e quebra de política). Devolve os padrões que passam do limite.
function padraoDeQuebras(eventos, { hoje, janelaDias = JANELA_PADRAO_DIAS, minimo = PADRAO_MINIMO } = {}) {
  const grupos = new Map();
  const soma = (tipo, id, ev) => {
    const chave = `${tipo}:${id}`;
    if (!grupos.has(chave)) grupos.set(chave, { tipo, id, incidentes: new Set() });
    grupos.get(chave).incidentes.add(ev.incidenteId);
  };
  for (const ev of eventos || []) {
    if (!ev || !["QUASE_ACIDENTE", "QUEBRA_POLITICA"].includes(ev.nivel)) continue;
    const data = paraIso(ev.data);
    if (!data || !hoje || diasEntreIso(data, hoje) > janelaDias || diasEntreIso(data, hoje) < 0) continue;
    if (idPositivo(ev.equipeId)) soma("EQUIPE", Number(ev.equipeId), ev);
    if (idPositivo(ev.envolvidoMembroId)) soma("PESSOA", Number(ev.envolvidoMembroId), ev);
  }
  return [...grupos.values()].filter((g) => g.incidentes.size >= minimo).map((g) => ({ tipo: g.tipo, id: g.id, total: g.incidentes.size, incidentes: [...g.incidentes].sort((a, b) => a - b) }))
    .sort((a, b) => b.total - a.total || a.id - b.id);
}
// Referência do aviso do padrão: o mesmo padrão não avisa de novo enquanto o total não cresce.
function referenciaDoPadrao(tipo, id, total) {
  return (tipo === "EQUIPE" ? 1 : 2) * 100000000 + (Number(id) % 1000000) * 100 + Math.min(Number(total), 99);
}

// ---------------------------------------------------------------
// O Comitê de Proteção
// ---------------------------------------------------------------

const ehClerigo = (cargoMinisterial) => CARGOS_CLERICAIS.includes(String(cargoMinisterial || "").toUpperCase());

// O Comitê são as pessoas que ocupam o papel "Comitê de Proteção" (cadastro de lideranças); o cargo ministerial vem do cadastro: nunca é digitado aqui.
// membros = [{ membroId, cargoMinisterial, ativo }] → { total, clericos, leigos, ok, problemas[] }
function avaliarComposicao(membros) {
  const ativos = (membros || []).filter((m) => m && m.ativo !== false);
  const clericos = ativos.filter((m) => ehClerigo(m.cargoMinisterial)).length;
  const leigos = ativos.length - clericos;
  const problemas = [];
  if (ativos.length < COMITE_MINIMO) problemas.push(`O Comitê precisa de pelo menos ${COMITE_MINIMO} membros (hoje há ${ativos.length}).`);
  if (leigos < 1) problemas.push("O Comitê precisa de pelo menos uma pessoa que não seja do clero (leigo): a revisão não pode ser só de ministros.");
  return { total: ativos.length, clericos, leigos, ok: problemas.length === 0, problemas };
}

// ---------------------------------------------------------------
// Textos dos avisos (nenhum leva nome de criança, nome do envolvido ou conteúdo do relato)
// ---------------------------------------------------------------

function formatarPrazo(prazoEm) {
  const d = instanteValido(prazoEm);
  if (!d) return "";
  // sempre no fuso de Brasília (UTC-3, sem horário de verão)
  const b = new Date(d.getTime() - 3 * MS_HORA);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(b.getUTCDate())}/${p(b.getUTCMonth() + 1)} às ${p(b.getUTCHours())}h${p(b.getUTCMinutes())}`;
}
function textoIncidenteNovo({ nivel, prazoEm }) {
  if (NIVEL_EXIGE_COMUNICACAO[nivel]) return `Foi registrada uma suspeita ou relato de violência contra criança ou adolescente. A lei manda comunicar ao Conselho Tutelar em até 24 horas: o prazo termina em ${formatarPrazo(prazoEm)}. Abra Proteção de Crianças → Incidentes, comunique o órgão e registre o protocolo.`;
  return `Foi registrado um incidente de proteção (${NIVEIS[nivel] ? NIVEIS[nivel].rotulo.toLowerCase() : "incidente"}). Abra Proteção de Crianças → Incidentes para conferir e tomar a providência.`;
}
function textoPrazo({ etapa, prazoEm }) {
  if (etapa === "DOZE_HORAS") return `Atenção: há uma suspeita de violência contra criança ou adolescente ainda SEM comunicação ao Conselho Tutelar. Restam menos de 12 horas (prazo: ${formatarPrazo(prazoEm)}). Abra Proteção de Crianças → Incidentes.`;
  if (etapa === "QUATRO_HORAS") return `URGENTE: restam menos de 4 horas para comunicar ao Conselho Tutelar uma suspeita de violência contra criança ou adolescente (prazo: ${formatarPrazo(prazoEm)}). A omissão tem multa prevista no ECA. Abra Proteção de Crianças → Incidentes agora.`;
  return `PRAZO VENCIDO: a comunicação ao Conselho Tutelar de uma suspeita de violência contra criança ou adolescente não foi registrada (o prazo terminou em ${formatarPrazo(prazoEm)}). Comunique agora e registre o protocolo em Proteção de Crianças → Incidentes.`;
}
function textoPadrao({ tipo, total }) {
  return `Há ${total} registros de quase-acidente ou quebra de política nos últimos ${JANELA_PADRAO_DIAS} dias na mesma ${tipo === "EQUIPE" ? "equipe" : "pessoa"}. Pequenas quebras repetidas costumam anteceder um caso grave: o Comitê deve conferir. Abra Proteção de Crianças → Padrões.`;
}
function textoComiteIncompleto({ problemas }) {
  return `O Comitê de Proteção está incompleto: ${(problemas || []).join(" ")} Cadastre os membros em Proteção de Crianças → Comitê.`.slice(0, 1000);
}
function textoCautelarSemDecisao({ dias }) {
  return `Há uma pessoa afastada por cautela do contato com menores sem decisão do Comitê há ${dias} dia(s). O afastamento não é punição, mas não pode ficar sem revisão. Abra Proteção de Crianças → Incidentes.`;
}
function textoResumoDiario({ vencidas, semComprovante }) {
  const partes = [];
  if (vencidas) partes.push(`${vencidas} suspeita(s) de violência com o prazo de 24 horas VENCIDO e sem comunicação ao Conselho Tutelar`);
  if (semComprovante) partes.push(`${semComprovante} caso(s) com a comunicação registrada há mais de 24 horas mas SEM comprovante (protocolo do órgão, onde o papel está guardado ou arquivo)`);
  return `Pendências da proteção de crianças: ${partes.join("; ")}. Abra Proteção de Crianças → Incidentes e resolva hoje.`.slice(0, 1000);
}
function textoArquivadoSemConteudo() {
  return "Um pedido do canal de ajuda sem login foi arquivado como \"sem conteúdo de proteção\" por um membro da Diretoria ou do Comitê. Todos do Comitê podem conferir em Proteção de Crianças → Incidentes (encerrados).";
}
function textoRetiradaCautelar({ equipes, nEscalas }) {
  const lista = (equipes || []).slice(0, 5).join(", ");
  return `Por cautela, você saiu de ${nEscalas} escala(s) com crianças e adolescentes (${lista}), por decisão da Diretoria Executiva. Isso não é uma condenação. A Diretoria entrará em contato com você.`.slice(0, 1000);
}
function textoCautelarPessoa() {
  return "Por cautela, o seu contato com crianças e adolescentes está suspenso, por decisão da Diretoria Executiva. Isso não é uma condenação. A Diretoria entrará em contato com você.";
}
function textoCautelarLevantada() {
  return "A Diretoria Executiva levantou a suspensão cautelar do seu contato com crianças e adolescentes. Você só volta às escalas com menores se a sua habilitação estiver em dia (certidões, treinamento, ficha e política).";
}
function textoConfirmacaoDeAjuda() {
  return "Recebemos o que você contou. Obrigado por confiar. Pessoas preparadas da liderança da Igreja foram avisadas. Você não tem culpa de nada. Se existe perigo agora, ligue 190. Para falar com alguém a qualquer hora, ligue 100 (de graça).";
}

module.exports = {
  HORAS_PRAZO, LIMITE_ATENCAO_HORAS, LIMITE_CRITICO_HORAS, VENCIDO_REPETE_HORAS, JANELA_PADRAO_DIAS, PADRAO_MINIMO, COMITE_MINIMO, MAX_TEXTO_DESCRICAO, MAX_TEXTO_RELATO, MAX_OBSERVACAO, MAX_PROVIDENCIA,
  NIVEIS, CODIGOS_NIVEL, NIVEL_EXIGE_COMUNICACAO, ORGAOS, FORMAS_COMUNICACAO, QUEM_RELATOU, ORIGENS, RESULTADOS_ENCERRAMENTO, DECISOES_CAUTELAR, CARGOS_CLERICAIS,
  CONTATOS_DE_AJUDA, ROTEIRO_ESCUTA, NAO_FACA,
  paraIso, somarDiasIso, diasEntreIso, instanteValido,
  prazoNotificacao, relogio, etapaDeAviso, referenciaDoAviso,
  validarIncidente, validarPedidoDeAjuda, validarComunicacaoExterna, temComprovante, foraDoPrazo, podeEncerrar, validarEncerramento, validarReclassificacao, validarDecisaoCautelar,
  padraoDeQuebras, referenciaDoPadrao, ehClerigo, avaliarComposicao,
  formatarPrazo, textoIncidenteNovo, textoPrazo, textoPadrao, textoComiteIncompleto, textoCautelarSemDecisao, textoCautelarPessoa, textoCautelarLevantada, textoConfirmacaoDeAjuda, textoResumoDiario, textoArquivadoSemConteudo, textoRetiradaCautelar, valorSignificativo, VENCIDO_AVISOS_MAXIMO
};
