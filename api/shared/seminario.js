// shared/seminario.js (v8.7 — o Seminário como sistema acadêmico) — regra PURA (sem banco): o currículo, a turma, a nota e a frequência, o aproveitamento, a conclusão
// do curso e o requisito de formação que exige uma disciplina. O banco está em shared/seminarioDb.js; o desenho, em docs/plano/fase-8-ministerial-afm.md.
//
// Regimento Art. 72: os quatro níveis (Básico, Médio, Avançado, Bacharel Livre) — "matriculado e cursando" para Auxiliar a Presbítero; o "Certificado de Conclusão" do
// Avançado ou do Bacharel para Evangelista e Pastor. Art. 70 §2º: o currículo abrange "obrigatoriamente módulos de Liderança, Administração Eclesiástica e Compliance
// Estatutário". Notas, turmas e aproveitamento o Regimento não detalha: são regra da Academia, configurável.
const { NIVEIS } = require("./afm");

const AREAS = { TEOLOGIA: "Bíblia e Teologia", LITURGIA: "Liturgia", LIDERANCA: "Liderança", ADMINISTRACAO: "Administração Eclesiástica", COMPLIANCE: "Compliance Estatutário (Regimento)", OUTRA: "Outra" };
const AREAS_GOVERNANCA = ["LIDERANCA", "ADMINISTRACAO", "COMPLIANCE"];   // Art. 70 §2º
const RESULTADOS = { APROVADO: "Aprovado", REPROVADO_NOTA: "Reprovado por nota", REPROVADO_FREQ: "Reprovado por frequência" };
const SITUACOES_CURSO = { CURSANDO: "Cursando", CONCLUIDO: "Concluído", CANCELADA: "Cancelada" };
const DECISOES = { DEFERIDO: "Deferido", INDEFERIDO: "Indeferido" };
const TIPOS_DOCUMENTO = { DECLARACAO: "Declaração de matrícula", HISTORICO: "Histórico escolar" };
const DIAS_DECLARACAO = 30;   // a declaração de matrícula vale 30 dias
const MAX_ID = 2147483647;

const textoLimpo = (v) => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim() : "");
const dataValida = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
// só a forma canônica: o número inteiro ou o texto só de dígitos ("1e3", "0x10", " 7 " não são ids)
const idValido = (v) => {
  if (typeof v === "string" ? !/^[1-9]\d{0,9}$/.test(v) : typeof v !== "number") return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= MAX_ID ? n : null;
};
const somarDias = (iso, dias) => new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);
// número com vírgula ou ponto, até `casas` casas decimais; null se não for um número assim
function numero(v, casas) {
  if (v == null || (typeof v === "string" && !v.trim())) return null;
  const s = String(v).trim().replace(",", ".");
  if (!new RegExp(`^\\d{1,4}(\\.\\d{1,${casas}})?$`).test(s)) return null;
  return Number(s);
}
const horasMinimas = (t) => Math.round(Number(t.cargaHoraria) * Number(t.frequenciaMinimaPct)) / 100;
const rotuloNivel = (nivel) => (NIVEIS[nivel] ? NIVEIS[nivel].rotulo : nivel);

// ---- o currículo ----
function validarCurso(c) {
  const corpo = c && typeof c === "object" ? c : {};
  const cursoId = idValido(corpo.cursoId);
  if (!cursoId) return { valido: false, mensagem: "Escolha o curso." };
  const nome = textoLimpo(corpo.nome);
  if (nome.length < 3 || nome.length > 150) return { valido: false, mensagem: "O nome do curso tem de 3 a 150 caracteres." };
  const nota = numero(corpo.notaMinima, 1);
  if (nota == null || nota > 10) return { valido: false, mensagem: "A nota mínima vai de 0 a 10 (uma casa decimal)." };
  const freq = Number(corpo.frequenciaMinimaPct);
  if (!Number.isInteger(freq) || freq < 1 || freq > 100) return { valido: false, mensagem: "A frequência mínima é um número de 1 a 100 (%)." };
  return { valido: true, curso: { cursoId, nome, notaMinima: nota, frequenciaMinimaPct: freq } };
}

function validarDisciplina(c) {
  const corpo = c && typeof c === "object" ? c : {};
  const disciplinaId = corpo.disciplinaId == null || corpo.disciplinaId === "" ? null : idValido(corpo.disciplinaId);
  if (corpo.disciplinaId != null && corpo.disciplinaId !== "" && !disciplinaId) return { valido: false, mensagem: "Disciplina inválida." };
  const cursoId = idValido(corpo.cursoId);
  if (!cursoId) return { valido: false, mensagem: "Escolha o curso da disciplina." };
  const nome = textoLimpo(corpo.nome);
  if (nome.length < 3 || nome.length > 150) return { valido: false, mensagem: "O nome da disciplina tem de 3 a 150 caracteres." };
  if (!Object.prototype.hasOwnProperty.call(AREAS, corpo.area)) return { valido: false, mensagem: "Escolha a área da disciplina." };
  const carga = numero(corpo.cargaHoraria, 1);
  if (carga == null || carga <= 0 || carga > 500) return { valido: false, mensagem: "Informe a carga horária (em horas, de 0,5 a 500, até uma casa decimal)." };
  if (typeof corpo.obrigatoria !== "boolean") return { valido: false, mensagem: "Diga se a disciplina é obrigatória ou optativa." };
  const ativa = corpo.ativa === undefined ? true : corpo.ativa;
  if (typeof ativa !== "boolean") return { valido: false, mensagem: "Diga se a disciplina está ativa." };
  const ementa = textoLimpo(corpo.ementa);
  if (ementa.length > 600) return { valido: false, mensagem: "A ementa tem no máximo 600 caracteres." };
  const lista = corpo.preRequisitos == null ? [] : corpo.preRequisitos;
  if (!Array.isArray(lista) || lista.length > 20) return { valido: false, mensagem: "Os pré-requisitos são uma lista de até 20 disciplinas." };
  const pre = [];
  for (const p of lista) {
    const id = idValido(p);
    if (!id) return { valido: false, mensagem: "Pré-requisito inválido." };
    if (id === disciplinaId) return { valido: false, mensagem: "A disciplina não é pré-requisito de si mesma." };
    if (!pre.includes(id)) pre.push(id);
  }
  return { valido: true, disciplina: { disciplinaId, cursoId, nome, area: corpo.area, cargaHoraria: carga, obrigatoria: corpo.obrigatoria, ativa, ementa: ementa || null, preRequisitos: pre } };
}

// `arestas`: os pré-requisitos já gravados das OUTRAS disciplinas, [{ disciplinaId, preRequisitoId }]. Ligar `disciplinaId` aos `preRequisitos` cria ciclo se a
// disciplina já é (direta ou indiretamente) pré-requisito de algum deles.
function criariaCiclo(arestas, disciplinaId, preRequisitos) {
  if (!disciplinaId) return false;
  const filhos = new Map();
  for (const a of arestas || []) {
    if (Number(a.disciplinaId) === Number(disciplinaId)) continue;   // as da própria disciplina serão trocadas
    filhos.set(Number(a.disciplinaId), [...(filhos.get(Number(a.disciplinaId)) || []), Number(a.preRequisitoId)]);
  }
  for (const inicio of preRequisitos || []) {
    const pilha = [Number(inicio)];
    const visto = new Set();
    while (pilha.length) {
      const atual = pilha.pop();
      if (atual === Number(disciplinaId)) return true;
      if (visto.has(atual)) continue;
      visto.add(atual);
      pilha.push(...(filhos.get(atual) || []));
    }
  }
  return false;
}

// O curso cujas obrigatórias ATIVAS ainda não cobrem as três áreas do Art. 70 §2º (aviso — não trava).
function lacunasGovernanca(disciplinas) {
  const cobertas = new Set((disciplinas || []).filter((d) => d.obrigatoria && d.ativa).map((d) => d.area));
  return AREAS_GOVERNANCA.filter((a) => !cobertas.has(a)).map((a) => AREAS[a]);
}

// ---- a turma ----
function validarTurma(c, hojeIso) {
  const corpo = c && typeof c === "object" ? c : {};
  const disciplinaId = idValido(corpo.disciplinaId);
  if (!disciplinaId) return { valido: false, mensagem: "Escolha a disciplina da turma." };
  const docenteMembroId = idValido(corpo.docenteMembroId);
  if (!docenteMembroId) return { valido: false, mensagem: "Escolha o docente da turma." };
  if (!dataValida(corpo.dataInicio) || !dataValida(corpo.dataFim)) return { valido: false, mensagem: "Informe o início e o fim da turma (dia/mês/ano)." };
  if (corpo.dataFim < corpo.dataInicio) return { valido: false, mensagem: "O fim da turma vem depois do início." };
  if (corpo.dataInicio < "2020-01-01" || corpo.dataFim > `${Number(String(hojeIso).slice(0, 4)) + 2}-12-31`) return { valido: false, mensagem: "Datas fora do intervalo aceito." };
  const local = textoLimpo(corpo.local);
  if (local.length > 150) return { valido: false, mensagem: "O local tem no máximo 150 caracteres." };
  return { valido: true, turma: { disciplinaId, docenteMembroId, dataInicio: corpo.dataInicio, dataFim: corpo.dataFim, local: local || null } };
}

// A nota e as horas de UM aluno: o resultado sai da regra congelada na turma (nota mínima e frequência mínima sobre a carga horária).
function validarLancamento(c, turma) {
  const corpo = c && typeof c === "object" ? c : {};
  const nota = numero(corpo.nota, 1);
  if (nota == null || nota > 10) return { valido: false, mensagem: "Informe a nota (de 0 a 10, até uma casa decimal)." };
  const horas = numero(corpo.horasPresentes, 1);
  if (horas == null || horas > Number(turma.cargaHoraria)) return { valido: false, mensagem: `Informe as horas presentes (de 0 a ${turma.cargaHoraria}, até uma casa decimal).` };
  const resultado = horas < horasMinimas(turma) ? "REPROVADO_FREQ" : nota < Number(turma.notaMinima) ? "REPROVADO_NOTA" : "APROVADO";
  return { valido: true, lancamento: { nota, horasPresentes: horas, resultado } };
}

// ---- o aproveitamento ----
function validarAproveitamento(c, hojeIso) {
  const corpo = c && typeof c === "object" ? c : {};
  const membroId = idValido(corpo.membroId);
  if (!membroId) return { valido: false, mensagem: "Informe a matrícula do aluno." };
  const disciplinaId = idValido(corpo.disciplinaId);
  if (!disciplinaId) return { valido: false, mensagem: "Escolha a disciplina da Academia que será aproveitada." };
  const instituicao = textoLimpo(corpo.instituicao);
  if (instituicao.length < 3 || instituicao.length > 150) return { valido: false, mensagem: "Informe a instituição de origem (3 a 150 caracteres)." };
  const disciplinaOrigem = textoLimpo(corpo.disciplinaOrigem);
  if (disciplinaOrigem.length < 3 || disciplinaOrigem.length > 150) return { valido: false, mensagem: "Informe a disciplina cursada lá (3 a 150 caracteres)." };
  const carga = numero(corpo.cargaHorariaOrigem, 1);
  if (carga == null || carga <= 0 || carga > 2000) return { valido: false, mensagem: "Informe a carga horária cursada lá (em horas)." };
  const ano = Number(corpo.anoOrigem);
  if (!Number.isInteger(ano) || ano < 1950 || ano > Number(String(hojeIso).slice(0, 4))) return { valido: false, mensagem: "Informe o ano em que a disciplina foi cursada." };
  const notaOrigem = textoLimpo(corpo.notaOrigem);
  if (notaOrigem.length > 20) return { valido: false, mensagem: "A nota de origem tem no máximo 20 caracteres (como veio no documento)." };
  if (!Object.prototype.hasOwnProperty.call(DECISOES, corpo.decisao)) return { valido: false, mensagem: "Escolha a decisão: deferido ou indeferido." };
  const parecer = textoLimpo(corpo.parecer);
  if (parecer.length < 20 || parecer.length > 600) return { valido: false, mensagem: "Escreva o parecer (de 20 a 600 caracteres): por que a disciplina de origem equivale (ou não)." };
  const pareceristaMembroId = idValido(corpo.pareceristaMembroId);
  if (!pareceristaMembroId) return { valido: false, mensagem: "Escolha quem deu o parecer (o Reitor ou um docente)." };
  if (pareceristaMembroId === membroId) return { valido: false, mensagem: "O aluno não dá parecer no próprio aproveitamento." };
  if (!dataValida(corpo.dataParecer) || corpo.dataParecer > hojeIso || corpo.dataParecer < "2020-01-01") return { valido: false, mensagem: "Informe a data do parecer (até hoje)." };
  if (corpo.decisao === "DEFERIDO" && corpo.documentoConferido !== true) return { valido: false, mensagem: "Para deferir, confira o documento da instituição de origem (histórico ou declaração)." };
  return { valido: true, aproveitamento: { membroId, disciplinaId, instituicao, disciplinaOrigem, cargaHorariaOrigem: carga, anoOrigem: ano, notaOrigem: notaOrigem || null,
    decisao: corpo.decisao, parecer, pareceristaMembroId, dataParecer: corpo.dataParecer } };
}

function textoMotivo(v, minimo = 10) {
  const t = textoLimpo(v);
  return t.length >= minimo && t.length <= 300 ? t : null;
}

// ---- o que a pessoa já cumpriu ----
// `tentativas`: as inscrições da pessoa, [{ disciplinaId, turmaSituacao, situacao, resultado, encerradaEm }]; `aproveitamentos`: [{ disciplinaId, decisao, anuladoEm, dataParecer }].
// Devolve Map disciplinaId -> { cumprida, fonte: "TURMA"|"APROVEITAMENTO"|null, data, cursando }. Só a turma ENCERRADA vale (a nota da aberta ainda pode mudar).
function estadoDasDisciplinas(tentativas, aproveitamentos) {
  const out = new Map();
  const de = (id) => out.get(Number(id)) || { cumprida: false, fonte: null, data: null, cursando: false };
  for (const t of tentativas || []) {
    const atual = de(t.disciplinaId);
    if (t.situacao !== "INSCRITO") continue;
    if (t.turmaSituacao === "ABERTA") atual.cursando = true;
    else if (t.resultado === "APROVADO" && (!atual.cumprida || (t.encerradaEm && atual.data && t.encerradaEm < atual.data))) Object.assign(atual, { cumprida: true, fonte: "TURMA", data: t.encerradaEm || null });
    out.set(Number(t.disciplinaId), atual);
  }
  for (const a of aproveitamentos || []) {
    if (a.decisao !== "DEFERIDO" || a.anuladoEm) continue;
    const atual = de(a.disciplinaId);
    if (!atual.cumprida) Object.assign(atual, { cumprida: true, fonte: "APROVEITAMENTO", data: a.dataParecer || null });
    out.set(Number(a.disciplinaId), atual);
  }
  return out;
}

// A conclusão de um curso: todas as obrigatórias ATIVAS cumpridas. `disciplinas`: as do curso, [{ disciplinaId, nome, cargaHoraria, obrigatoria, ativa }];
// `estado`: o Map de estadoDasDisciplinas. A carga cumprida soma as disciplinas do curso cumpridas (obrigatórias e optativas).
function avaliarConclusao(disciplinas, estado) {
  const obrig = (disciplinas || []).filter((d) => d.obrigatoria && d.ativa);
  const cumpre = (d) => !!(estado.get(Number(d.disciplinaId)) || {}).cumprida;
  const faltam = obrig.filter((d) => !cumpre(d)).map((d) => d.nome);
  const soma = (lista) => Math.round(lista.reduce((s, d) => s + Number(d.cargaHoraria), 0) * 10) / 10;
  return { semObrigatorias: obrig.length === 0, completo: obrig.length > 0 && faltam.length === 0, faltam,
    cargaObrigatoria: soma(obrig), cargaCumprida: soma((disciplinas || []).filter(cumpre)) };
}

// ---- o requisito de formação que exige uma disciplina (v6.9: o mesmo formato da avaliação da trilha, para o resumo e os fluxos que já o leem) ----
function avaliarRequisitoDisciplina({ requisito, estado }) {
  const base = { requisitoId: requisito.requisitoId, disciplinaId: requisito.disciplinaId, disciplinaNome: requisito.disciplinaNome, modo: requisito.modo, tipo: "DISCIPLINA" };
  const e = estado || {};
  if (e.cumprida) return { ...base, ok: true, situacao: "VIGENTE", detalhe: e.fonte === "APROVEITAMENTO" ? "cumprida por aproveitamento" : "aprovada", validoAte: null, diasParaVencer: null };
  if (e.cursando) return { ...base, ok: false, situacao: "EM_ANDAMENTO", detalhe: "cursando (a turma ainda não foi encerrada)", validoAte: null, diasParaVencer: null };
  return { ...base, ok: false, situacao: "NAO_INICIADA", detalhe: "ainda não cursada", validoAte: null, diasParaVencer: null };
}

// ---- o nível do Art. 72 que vem do histórico ----
// `matriculas`: as matrículas da pessoa nos cursos, [{ nivel, situacao }]. Cursando -> (nível, não concluído); concluído -> (nível, concluído). A cancelada não conta.
function paresDeNivel(matriculas) {
  return (matriculas || []).filter((m) => m && NIVEIS[m.nivel] && (m.situacao === "CURSANDO" || m.situacao === "CONCLUIDO"))
    .map((m) => ({ nivel: m.nivel, concluido: m.situacao === "CONCLUIDO" }));
}

// ---- os textos dos documentos ----
const br = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
function descricaoDiploma({ curso, dataConclusao, cargaCumprida, disciplinas }) {
  return `concluiu o ${curso} da Academia de Formação Ministerial (AFM) em ${br(dataConclusao)}, com carga horária de ${String(cargaCumprida).replace(".", ",")} horas em ${disciplinas} disciplina(s), e recebe este diploma (Regimento Interno, Art. 72).`;
}
function descricaoDeclaracao({ curso, dataInicio, hojeIso, turmas }) {
  const t = turmas && turmas.length ? ` Turma(s) em andamento: ${turmas.join("; ")}.` : "";
  const texto = `está regularmente matriculado(a) no ${curso} da Academia de Formação Ministerial (AFM) desde ${br(dataInicio)}, situação "cursando" em ${br(hojeIso)}.${t} Esta declaração vale ${DIAS_DECLARACAO} dias.`;
  return texto.length > 600 ? `${texto.slice(0, 597)}...` : texto;
}
function descricaoHistorico({ hojeIso, cursos, disciplinasCumpridas, cargaCumprida }) {
  const texto = `tem, na Academia de Formação Ministerial (AFM), o histórico escolar abaixo, na posição de ${br(hojeIso)}: ${disciplinasCumpridas} disciplina(s) cumprida(s), ${String(cargaCumprida).replace(".", ",")} horas. Cursos: ${cursos.length ? cursos.join("; ") : "nenhum"}.`;
  return texto.length > 600 ? `${texto.slice(0, 597)}...` : texto;
}

module.exports = { AREAS, AREAS_GOVERNANCA, RESULTADOS, SITUACOES_CURSO, DECISOES, TIPOS_DOCUMENTO, DIAS_DECLARACAO, textoLimpo, dataValida, idValido, somarDias, numero,
  horasMinimas, rotuloNivel, validarCurso, validarDisciplina, criariaCiclo, lacunasGovernanca, validarTurma, validarLancamento, validarAproveitamento, textoMotivo,
  estadoDasDisciplinas, avaliarConclusao, avaliarRequisitoDisciplina, paresDeNivel, descricaoDiploma, descricaoDeclaracao, descricaoHistorico };
