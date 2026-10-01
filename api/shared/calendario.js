// shared/calendario.js (v7.2 — Calendário Oficial e Agenda Unificada)
//
// O motor de regras do calendário, SEM banco (puro e testável): datas, a agenda
// litúrgica semanal do Art. 79, o ciclo mensal de governança (Art. 154-A) e o
// algoritmo de agendamento do Art. 154 — precedência por nível, conflito
// territorial, Direito Adquirido Temporal, trava de simultaneidade por Área,
// bloqueio total do campo e Esgotamento de Pauta. As funções de banco ficam em
// shared/calendarioDb.js e só chamam o que está aqui.
//
// Vocabulário do Art. 154 §1º (nível menor = prevalece):
//   1 Estratégico-Institucional — nenhuma outra atividade no Campo naquele dia
//   2 Geral-Focalizado         — prevalece sobre Área e Local na região onde ocorre
//   3 Regional-Intermediário   — prevalece sobre a congregação individual
//   4 Local-Operacional        — só se não houver bloqueio dos níveis 1, 2 e 3
//   5 Social e Privado         — terceiros no templo; os primeiros a cair
//
// Evento do motor (o que as funções esperam; o banco monta a partir das linhas):
//   { id, nivel, tipo: { codigo, festividade, compativeis: [codigos], fechaCongregacoes },
//     dataInicio, dataFim ("AAAA-MM-DD"), horaInicio, horaFim ("HH:MM" | null),
//     abrangencia: "CAMPO" | "AREAS" | "CONGREGACAO", congregacaoId, areaIds: [],
//     propostaEm (ISO), status, tardia, origem }
// Contexto: { areaDe: (congregacaoId) => areaId | null }

const NIVEIS = [1, 2, 3, 4, 5];
const ROTULO_NIVEL = {
  1: "Estratégico-Institucional",
  2: "Geral-Focalizado",
  3: "Regional-Intermediário",
  4: "Local-Operacional",
  5: "Social e Privado"
};
const ABRANGENCIAS = ["CAMPO", "AREAS", "CONGREGACAO"];
const STATUS_EVENTO = ["PROPOSTO", "DEFERIDO", "HOMOLOGADO", "INDEFERIDO", "ABSORVIDO", "CANCELADO"];
// Ocupam a pauta (disputam data com os demais).
const STATUS_ATIVOS = ["PROPOSTO", "DEFERIDO", "HOMOLOGADO"];
const MOTIVOS_INDEFERIMENTO = ["CONFLITO_HIERARQUIA", "DIREITO_ADQUIRIDO", "TRAVA_AREA", "ESGOTAMENTO_PAUTA", "ABSORVIDO_NIVEL_1", "DECISAO_SECRETARIA", "DECISAO_CLI"];
const ROTULO_MOTIVO = {
  CONFLITO_HIERARQUIA: "Choque de datas: o evento de nível superior (ou o que chegou primeiro, no mesmo nível) prevalece",
  DIREITO_ADQUIRIDO: "A data já é Direito Adquirido de evento homologado",
  TRAVA_AREA: "Vedado: duas festividades de Nível 4 na mesma Área no mesmo fim de semana",
  ESGOTAMENTO_PAUTA: "Esgotamento de Pauta: proposta fora do prazo de 15 de janeiro, sem data livre — indeferida sem direito a recurso",
  ABSORVIDO_NIVEL_1: "Absorvido por evento de Nível 1 (convocação estratégico-institucional)",
  DECISAO_SECRETARIA: "Indeferido pela Secretaria Geral",
  DECISAO_CLI: "Decisão excepcional da CLI"
};
const DURACAO_PADRAO_MINUTOS = 120;
const LIMITE_DIAS_EVENTO = 30;

// ---------------------------------------------------------------
// Datas (ISO "AAAA-MM-DD"; sem fuso: um dia de calendário)
// ---------------------------------------------------------------

function dataIsoValida(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return false;
  const a = Number(m[1]), me = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(a, me - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === me - 1 && dt.getUTCDate() === d;
}

const paraUtc = (iso) => { const [a, m, d] = iso.split("-").map(Number); return Date.UTC(a, m - 1, d); };
const deUtc = (ms) => new Date(ms).toISOString().slice(0, 10);
const somarDias = (iso, n) => deUtc(paraUtc(iso) + Number(n) * 86400000);
const diasEntre = (deIso, ateIso) => Math.round((paraUtc(ateIso) - paraUtc(deIso)) / 86400000);
const diaDaSemana = (iso) => new Date(paraUtc(iso)).getUTCDay(); // 0 = domingo
const doisDigitos = (n) => String(n).padStart(2, "0");
const ultimoDiaDoMes = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

function formatarDataBr(iso) {
  if (!iso) return "";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

// Todas as datas do mês com aquele dia da semana, em ordem.
function datasDoDiaNoMes(ano, mes, dow) {
  const datas = [];
  for (let d = 1; d <= ultimoDiaDoMes(ano, mes); d++) {
    const iso = `${ano}-${doisDigitos(mes)}-${doisDigitos(d)}`;
    if (diaDaSemana(iso) === dow) datas.push(iso);
  }
  return datas;
}
const ultimoDomingo = (ano, mes) => datasDoDiaNoMes(ano, mes, 0).at(-1);
// n = 1.. (1º, 2º, 3º domingo...). null se o mês não tem.
const enesimoDomingo = (ano, mes, n) => datasDoDiaNoMes(ano, mes, 0)[n - 1] || null;

// Chave do fim de semana (sábado e domingo da mesma semana) a que o dia pertence;
// null em dia de semana. O sábado identifica o fim de semana.
function chaveFimDeSemana(iso) {
  const dow = diaDaSemana(iso);
  if (dow === 6) return iso;
  if (dow === 0) return somarDias(iso, -1);
  return null;
}
function fimDeSemanasDoPeriodo(dataInicio, dataFim) {
  const chaves = new Set();
  const dias = diasEntre(dataInicio, dataFim);
  for (let i = 0; i <= dias && i <= 400; i++) {
    const chave = chaveFimDeSemana(somarDias(dataInicio, i));
    if (chave) chaves.add(chave);
  }
  return chaves;
}

function minutos(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function formatarHora(hhmm) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(hhmm || "").trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${doisDigitos(m[1])}:${m[2]}`;
}
// "19:30" -> "19h30"; "19:00" -> "19h" (o formato que o site já usa).
function horaParaSite(hhmm) {
  const h = formatarHora(hhmm);
  if (!h) return null;
  const [hh, mm] = h.split(":");
  return mm === "00" ? `${Number(hh)}h` : `${Number(hh)}h${mm}`;
}

// ---------------------------------------------------------------
// Agenda litúrgica oficial (Art. 79) — regras, não datas
// ---------------------------------------------------------------

const DIAS_LITURGICOS = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo_manha", "domingo_noite"];
const ROTULO_DIA = {
  segunda: "Segunda-feira", terca: "Terça-feira", quarta: "Quarta-feira", quinta: "Quinta-feira", sexta: "Sexta-feira",
  sabado: "Sábado", domingo_manha: "Domingo de manhã", domingo_noite: "Domingo à noite"
};
const DOW_DO_DIA = { segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, domingo_manha: 0, domingo_noite: 0 };
const OCORRENCIAS = ["1", "2", "3", "4_se_5", "ultimo"];
const ESCOPOS_LITURGICOS = ["SEDE", "CONGREGACOES", "TODAS"];
const TIPOS_LITURGICOS = ["CULTO", "EBD", "DESCANSO", "FECHADA", "NOITE_LIVRE", "CEIA"];

// A regra vale nesta data? (dia da semana + ocorrência no mês)
//  - sem ocorrência: toda semana;
//  - "1" "2" "3": o 1º/2º/3º daquele dia da semana no mês;
//  - "4_se_5": o 4º domingo SÓ nos meses de 5 domingos (nos de 4, o 4º é o último
//    e é dia de Ceia — Art. 79, III, a);
//  - "ultimo": o último daquele dia da semana no mês.
function regraAplicaNaData(regra, iso) {
  if (diaDaSemana(iso) !== DOW_DO_DIA[regra.dia]) return false;
  if (!regra.ocorrencia) return true;
  const [ano, mes] = iso.split("-").map(Number);
  const todas = datasDoDiaNoMes(ano, mes, DOW_DO_DIA[regra.dia]);
  const posicao = todas.indexOf(iso) + 1;
  switch (regra.ocorrencia) {
    case "1": case "2": case "3": return posicao === Number(regra.ocorrencia);
    case "4_se_5": return posicao === 4 && todas.length === 5;
    case "ultimo": return posicao === todas.length;
    default: return false;
  }
}

// Itens da grade num dia para quem é da Sede ("SEDE") ou de uma congregação
// ("CONGREGACAO"). Regra com ocorrência SUBSTITUI a regra da semana comum no
// mesmo dia (a última quarta-feira da UHADESPA troca a da USADESPA).
function agendaLiturgicaDoDia(regras, iso, local) {
  const aplicaveis = regras.filter(r => r.ativo !== false
    && (r.escopo === "TODAS" || (local === "SEDE" ? r.escopo === "SEDE" : r.escopo === "CONGREGACOES"))
    && regraAplicaNaData(r, iso));
  const dias = new Set(aplicaveis.map(r => r.dia));
  const resultado = [];
  for (const dia of dias) {
    const doDia = aplicaveis.filter(r => r.dia === dia);
    const temEspecifica = doDia.some(r => r.ocorrencia);
    resultado.push(...doDia.filter(r => !temEspecifica || r.ocorrencia));
  }
  return resultado.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
}

// Marca os itens da grade que um evento de Nível 1 engole naquele dia (Art. 154
// §1º, I: "nenhuma outra atividade pode ocorrer no Campo") e as congregações
// fechadas (Ceia Geral e Congressos Unificados). A Ceia da grade é a MESMA coisa
// que o evento oficial da Ceia — fica como "coberta", não duplicada.
function absorverLiturgia(itens, eventosDoDia, local) {
  const n1 = eventosDoDia.filter(e => e.nivel === 1 && STATUS_ATIVOS.includes(e.status));
  return itens.map(item => {
    if (n1.length === 0) return { ...item, absorvido: false };
    const cobre = n1.find(e => item.tipo === "CEIA" && /^SANTA_CEIA/.test(e.tipo.codigo));
    if (cobre) return { ...item, absorvido: false, cobertoPor: { eventoId: cobre.id, titulo: cobre.titulo } };
    const fecha = local === "CONGREGACAO" ? n1.find(e => e.tipo.fechaCongregacoes) : null;
    const quem = fecha || n1.find(e => e.tipo.codigo !== "REUNIAO_CLI") || n1[0];
    return {
      ...item, absorvido: true,
      absorvidoPor: { eventoId: quem.id, titulo: quem.titulo, nivel: 1 },
      fechada: !!fecha
    };
  });
}

// A grade como o site a consome (mesmo formato da coleção `programacao` do
// Directus que ela substitui). Fora: "noite livre" (nada a divulgar). Hora e
// ocorrência de dia de semana (última quarta/quinta) viram texto do título.
function liturgiaParaSite(regras) {
  const mapaEscopo = { SEDE: "sede", CONGREGACOES: "congregacoes", TODAS: "todas" };
  return regras
    .filter(r => r.ativo !== false && r.tipo !== "NOITE_LIVRE")
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || (a.id ?? 0) - (b.id ?? 0))
    .map(r => ({
      day: r.dia,
      title: r.titulo,
      scope: mapaEscopo[r.escopo],
      occurrence: r.dia.startsWith("domingo") ? (r.ocorrencia || null) : null,
      time: horaParaSite(r.horaInicio)
    }));
}

function validarRegraLiturgica(d = {}) {
  const dia = String(d.dia || "").trim();
  if (!DIAS_LITURGICOS.includes(dia)) return { valido: false, mensagem: "Dia inválido." };
  const escopo = String(d.escopo || "").trim().toUpperCase();
  if (!ESCOPOS_LITURGICOS.includes(escopo)) return { valido: false, mensagem: "Escopo inválido — use SEDE, CONGREGACOES ou TODAS." };
  let ocorrencia = null;
  if (d.ocorrencia != null && String(d.ocorrencia).trim() !== "") {
    ocorrencia = String(d.ocorrencia).trim();
    if (!OCORRENCIAS.includes(ocorrencia)) return { valido: false, mensagem: "Ocorrência inválida." };
    if (!dia.startsWith("domingo") && ocorrencia !== "ultimo") return { valido: false, mensagem: "Em dia de semana, a única ocorrência possível é a última do mês." };
    if (dia === "domingo_manha") return { valido: false, mensagem: "Domingo de manhã é toda semana (EBD em todo o campo)." };
  }
  const titulo = String(d.titulo || "").trim();
  if (titulo.length < 3 || titulo.length > 200) return { valido: false, mensagem: "O título deve ter de 3 a 200 caracteres." };
  let hora = null;
  if (d.horaInicio != null && String(d.horaInicio).trim() !== "") {
    hora = formatarHora(d.horaInicio);
    if (!hora) return { valido: false, mensagem: "Hora inválida — use HH:MM." };
  }
  const tipo = String(d.tipo || "CULTO").trim().toUpperCase();
  if (!TIPOS_LITURGICOS.includes(tipo)) return { valido: false, mensagem: "Tipo inválido." };
  const sigla = String(d.departamentoSigla || "").trim().toUpperCase();
  if (sigla.length > 30) return { valido: false, mensagem: "A sigla do departamento passa de 30 caracteres." };
  return { valido: true, dados: { dia, escopo, ocorrencia, titulo, horaInicio: hora, tipo, departamentoSigla: sigla || null } };
}

// ---------------------------------------------------------------
// Ciclo mensal de governança (Art. 154-A) e Santa Ceia (Art. 81 §1º)
// ---------------------------------------------------------------

// Eventos que a norma já fixa para o ano inteiro. `RegraChave` é única por
// evento: gerar de novo não duplica.
//  - Ceia: último domingo de todo mês; em maio e outubro é a Ceia GERAL
//    (congregações fechadas), nos demais a Ceia Local;
//  - CLI: último domingo, 14h-17h, no Templo Central;
//  - Conselho Fiscal (NIF): 3º domingo, 14h-17h, na Sala de Reuniões da Sede;
//  - CEI: dia útil da semana que antecede o último domingo, 19h30 — a quinta-feira
//    é o padrão (o Regimento deixa o dia a critério; a Secretaria pode mover);
//  - a Diretoria Executiva reúne sob demanda: não gera nada.
function gerarCicloAnual(ano) {
  const eventos = [];
  for (let mes = 1; mes <= 12; mes++) {
    const mm = doisDigitos(mes);
    const ultimo = ultimoDomingo(ano, mes);
    const geral = mes === 5 || mes === 10;
    eventos.push({
      regraChave: `CEIA:${ano}-${mm}`, tipoCodigo: geral ? "SANTA_CEIA_GERAL" : "SANTA_CEIA_LOCAL",
      titulo: geral ? "Santa Ceia Geral — congregações fechadas" : "Santa Ceia do Senhor — Ceia Local",
      descricao: geral
        ? "Ceia Geral de maio/outubro (Art. 81 §1º, II): todo o campo reunido; as congregações permanecem fechadas (§1º, III)."
        : "Ceia Local no último domingo do mês, em todas as congregações com Dirigente autorizado (Art. 81 §1º, I).",
      dataInicio: ultimo, dataFim: ultimo, horaInicio: null, horaFim: null, abrangencia: "CAMPO", local: geral ? "Templo Central ou ginásio locado" : null, orgaoSigla: null, publico: true
    });
    eventos.push({
      regraChave: `CLI:${ano}-${mm}`, tipoCodigo: "REUNIAO_CLI", titulo: "Reunião ordinária da CLI",
      descricao: "Deliberação legislativa, homologações e avisos gerais (Art. 154-A, IV). Presença obrigatória de todos os oficiais e lideranças.",
      dataInicio: ultimo, dataFim: ultimo, horaInicio: "14:00", horaFim: "17:00", abrangencia: "CAMPO", local: "Templo Central", orgaoSigla: "CLI", publico: false
    });
    const terceiro = enesimoDomingo(ano, mes, 3);
    eventos.push({
      regraChave: `NIF:${ano}-${mm}`, tipoCodigo: "REUNIAO_ORGAO_MENSAL", titulo: "Reunião ordinária do Conselho Fiscal (NIF)",
      descricao: "Fechamento dos balancetes do mês anterior (Art. 154-A, I).",
      dataInicio: terceiro, dataFim: terceiro, horaInicio: "14:00", horaFim: "17:00", abrangencia: "CONGREGACAO", congregacaoSlug: "sede", local: "Sala de Reuniões da Sede", orgaoSigla: "CONSELHO_FISCAL", publico: false
    });
    const preCamara = somarDias(ultimo, -3);
    eventos.push({
      regraChave: `CEI:${ano}-${mm}`, tipoCodigo: "REUNIAO_ORGAO_MENSAL", titulo: "Reunião ordinária do CEI",
      descricao: "Instrução e julgamento de processos disciplinares para limpar a pauta antes da Santa Ceia (Art. 154-A, II). Dia útil da semana que antecede o último domingo.",
      dataInicio: preCamara, dataFim: preCamara, horaInicio: "19:30", horaFim: "21:30", abrangencia: "CONGREGACAO", congregacaoSlug: "sede", local: "Sede", orgaoSigla: "CEI", publico: false
    });
  }
  return eventos;
}

// ---------------------------------------------------------------
// Conflito, prevalência e avaliação (Art. 154)
// ---------------------------------------------------------------

const sobrepoeDatas = (a, b) => a.dataInicio <= b.dataFim && b.dataInicio <= a.dataFim;

function intervaloMinutos(e) {
  const ini = minutos(e.horaInicio);
  if (ini == null) return null;
  const fim = minutos(e.horaFim);
  return [ini, fim != null && fim > ini ? fim : ini + DURACAO_PADRAO_MINUTOS];
}
// Dois eventos de UM dia só, no MESMO dia, com horário nos dois e sem sobreposição:
// podem coexistir. Nunca vale quando um deles é de Nível 1 (dia inteiro do campo).
function horariosDisjuntos(a, b) {
  if (a.nivel === 1 || b.nivel === 1) return false;
  if (!(a.dataInicio === a.dataFim && b.dataInicio === b.dataFim && a.dataInicio === b.dataInicio)) return false;
  const ia = intervaloMinutos(a), ib = intervaloMinutos(b);
  if (!ia || !ib) return false;
  return ia[1] <= ib[0] || ib[1] <= ia[0];
}

// Os territórios se cruzam? CAMPO cruza com tudo; Área com Área (mesma) ou com
// congregação daquela Área; congregação só com ela mesma.
function territoriosSeCruzam(a, b, ctx) {
  if (a.abrangencia === "CAMPO" || b.abrangencia === "CAMPO") return true;
  const areaDe = ctx.areaDe || (() => null);
  const areasA = a.abrangencia === "AREAS" ? new Set(a.areaIds || []) : null;
  const areasB = b.abrangencia === "AREAS" ? new Set(b.areaIds || []) : null;
  if (areasA && areasB) return [...areasA].some(x => areasB.has(x));
  if (areasA) return b.congregacaoId != null && areasA.has(areaDe(b.congregacaoId));
  if (areasB) return a.congregacaoId != null && areasB.has(areaDe(a.congregacaoId));
  return a.congregacaoId != null && a.congregacaoId === b.congregacaoId;
}

function tiposCompativeis(a, b) {
  const ca = a.tipo.compativeis || [];
  const cb = b.tipo.compativeis || [];
  return ca.includes(b.tipo.codigo) || cb.includes(a.tipo.codigo);
}

// Art. 154 §3º, II: vedadas 2+ festividades de Nível 4 na mesma Área no mesmo
// fim de semana. (A mesma congregação no mesmo fim de semana também cai aqui.)
function violaTravaDeArea(a, b, ctx) {
  const festa = e => e.nivel === 4 && e.tipo.festividade && e.abrangencia === "CONGREGACAO" && e.congregacaoId != null;
  if (!festa(a) || !festa(b)) return false;
  const areaDe = ctx.areaDe || (() => null);
  const areaA = areaDe(a.congregacaoId), areaB = areaDe(b.congregacaoId);
  const mesmaArea = a.congregacaoId === b.congregacaoId || (areaA != null && areaA === areaB);
  if (!mesmaArea) return false;
  const fa = fimDeSemanasDoPeriodo(a.dataInicio, a.dataFim);
  const fb = fimDeSemanasDoPeriodo(b.dataInicio, b.dataFim);
  return [...fa].some(x => fb.has(x));
}

// null = convivem; senão { motivo, detalhe }.
function detectarConflito(a, b, ctx = {}) {
  if (a.id != null && a.id === b.id) return null;
  if (tiposCompativeis(a, b)) return null;
  if (sobrepoeDatas(a, b) && territoriosSeCruzam(a, b, ctx) && !horariosDisjuntos(a, b)) {
    return { motivo: "DATA", detalhe: `mesma data (${formatarDataBr(a.dataInicio > b.dataInicio ? a.dataInicio : b.dataInicio)})` };
  }
  if (violaTravaDeArea(a, b, ctx)) return { motivo: "TRAVA_AREA", detalhe: "mesma Área, mesmo fim de semana" };
  return null;
}

// Quem leva a data: nível menor; no mesmo nível, a proposta mais antiga (Direito
// Adquirido Temporal, §2º, IV); persistindo o empate, o menor id. <0: a prevalece.
function compararPrevalencia(a, b) {
  if (a.nivel !== b.nivel) return a.nivel - b.nivel;
  const ta = Date.parse(a.propostaEm) || 0, tb = Date.parse(b.propostaEm) || 0;
  if (ta !== tb) return ta - tb;
  return (a.id ?? 0) - (b.id ?? 0);
}

const estaAtivo = (e) => STATUS_ATIVOS.includes(e.status);

function causaDoIndeferimento(conflitos, tardia) {
  if (tardia) return "ESGOTAMENTO_PAUTA";
  if (conflitos.some(c => c.motivoConflito === "TRAVA_AREA")) return "TRAVA_AREA";
  if (conflitos.some(c => c.evento.status === "HOMOLOGADO")) return "DIREITO_ADQUIRIDO";
  return "CONFLITO_HIERARQUIA";
}

function textoConflitos(conflitos) {
  return conflitos.slice(0, 4).map(c => `"${c.evento.titulo || c.evento.id}" (Nível ${c.evento.nivel}, ${formatarDataBr(c.evento.dataInicio)})`).join("; ")
    + (conflitos.length > 4 ? ` e mais ${conflitos.length - 4}` : "");
}

// Avaliação IMEDIATA de uma proposta contra a pauta atual (proposta tardia,
// remarcação, ou a pré-checagem na tela). Ela perde para qualquer evento ativo
// com que choque — a data é Direito Adquirido de quem chegou antes —, exceto o
// Nível 1, que absorve os de nível inferior (convocação estratégico-institucional,
// §2º, IV: a única exceção, além da calamidade pública).
//   -> { veredito: "LIVRE" | "RECUSADA" | "ABSORVE", conflitos, motivo?, detalhe?, prevalecidoPorId?, absorvidos? }
function avaliarProposta(prop, existentes, ctx = {}, { tardia = false } = {}) {
  const conflitos = [];
  for (const e of existentes) {
    if (!estaAtivo(e) || (prop.id != null && e.id === prop.id)) continue;
    const c = detectarConflito(prop, e, ctx);
    if (c) conflitos.push({ evento: e, motivoConflito: c.motivo, detalhe: c.detalhe });
  }
  if (conflitos.length === 0) return { veredito: "LIVRE", conflitos };

  if (prop.nivel === 1 && conflitos.every(c => c.evento.nivel > 1)) {
    return { veredito: "ABSORVE", conflitos, absorvidos: conflitos.map(c => c.evento) };
  }
  const prevalece = [...conflitos].sort((x, y) => compararPrevalencia(x.evento, y.evento))[0];
  const motivo = causaDoIndeferimento(conflitos, tardia);
  return {
    veredito: "RECUSADA", conflitos, motivo,
    prevalecidoPorId: prevalece.evento.id,
    detalhe: `${ROTULO_MOTIVO[motivo]}. Conflita com: ${textoConflitos(conflitos)}.`
  };
}

// Consolidação da Secretaria (§2º, II): aplica a Tabela de Hierarquia a TODAS as
// propostas no prazo e limpa os choques antes da homologação. `pool` são os
// eventos ainda movíveis (propostos, deferidos, e os de regra); `fixos` os
// imóveis (homologados). Ordem de decisão: pontual primeiro, depois nível,
// depois ordem de chegada.
//   -> [{ eventoId, status: "DEFERIDO" | "INDEFERIDO", motivo?, detalhe?, prevalecidoPorId?, conflitos }]
function consolidar(pool, fixos, ctx = {}) {
  const ordenados = [...pool].sort((a, b) => (Number(!!a.tardia) - Number(!!b.tardia)) || compararPrevalencia(a, b));
  const aceitos = [...fixos.filter(estaAtivo)];
  const decisoes = [];
  for (const e of ordenados) {
    const conflitos = [];
    for (const a of aceitos) {
      const c = detectarConflito(e, a, ctx);
      if (c) conflitos.push({ evento: a, motivoConflito: c.motivo, detalhe: c.detalhe });
    }
    if (conflitos.length === 0) {
      aceitos.push(e);
      decisoes.push({ eventoId: e.id, status: "DEFERIDO", conflitos });
      continue;
    }
    const prevalece = [...conflitos].sort((x, y) => compararPrevalencia(x.evento, y.evento))[0];
    const motivo = causaDoIndeferimento(conflitos, false);
    decisoes.push({
      eventoId: e.id, status: "INDEFERIDO", motivo, prevalecidoPorId: prevalece.evento.id, conflitos,
      detalhe: `${ROTULO_MOTIVO[motivo]}. Prevaleceu: "${prevalece.evento.titulo || prevalece.evento.id}" (Nível ${prevalece.evento.nivel}, ${formatarDataBr(prevalece.evento.dataInicio)}). Escolha outra data.`
    });
  }
  return decisoes;
}

// Datas livres próximas, mantendo o dia da semana e a duração: "escolher outra
// data" com ajuda. Anda de 7 em 7 dias para os dois lados, da mais próxima à mais
// distante, e devolve só as que passam na avaliação imediata.
function sugerirDatasLivres(prop, existentes, ctx = {}, { hoje, janelaDias = 91, maximo = 5 } = {}) {
  const duracao = diasEntre(prop.dataInicio, prop.dataFim);
  const sugestoes = [];
  for (let passo = 1; passo * 7 <= janelaDias && sugestoes.length < maximo * 2; passo++) {
    for (const sinal of [1, -1]) {
      const inicio = somarDias(prop.dataInicio, sinal * passo * 7);
      if (hoje && inicio < hoje) continue;
      const candidata = { ...prop, id: null, dataInicio: inicio, dataFim: somarDias(inicio, duracao), status: "PROPOSTO" };
      if (avaliarProposta(candidata, existentes, ctx).veredito === "LIVRE") sugestoes.push({ dataInicio: candidata.dataInicio, dataFim: candidata.dataFim });
    }
  }
  return sugestoes.slice(0, maximo);
}

// ---------------------------------------------------------------
// Validação da proposta
// ---------------------------------------------------------------

// Antecedência mínima de convocação (CLI extraordinária: 48 h, Art. 147 §2º).
// `agoraBrasiliaMs` = o instante atual em ms; a data/hora do evento é de Brasília (UTC-3).
function horasAteOEvento(dataInicio, horaInicio, agoraMs) {
  const m = minutos(horaInicio);
  if (m == null) return null;
  const [a, mes, d] = dataInicio.split("-").map(Number);
  const inicioMs = Date.UTC(a, mes - 1, d, Math.floor(m / 60) + 3, m % 60);
  return (inicioMs - agoraMs) / 3600000;
}

// `tipo`: linha do catálogo; `hoje`: AAAA-MM-DD de Brasília; `agoraMs`: Date.now().
function validarProposta(d = {}, { tipo, hoje, agoraMs } = {}) {
  if (!tipo || tipo.ativo === false) return { valido: false, mensagem: "Tipo de evento inválido ou desativado." };
  const titulo = String(d.titulo == null ? "" : d.titulo).trim();
  if (titulo.length < 3 || titulo.length > 200) return { valido: false, mensagem: "O título deve ter de 3 a 200 caracteres." };
  const descricao = String(d.descricao == null ? "" : d.descricao).trim();
  if (descricao.length > 1000) return { valido: false, mensagem: "A descrição passa de 1000 caracteres." };

  const dataInicio = String(d.dataInicio || "").trim();
  if (!dataIsoValida(dataInicio)) return { valido: false, mensagem: "Informe a data de início (AAAA-MM-DD)." };
  const dataFim = d.dataFim ? String(d.dataFim).trim() : dataInicio;
  if (!dataIsoValida(dataFim)) return { valido: false, mensagem: "Data de término inválida (AAAA-MM-DD)." };
  if (dataFim < dataInicio) return { valido: false, mensagem: "A data de término é anterior à de início." };
  if (diasEntre(dataInicio, dataFim) + 1 > LIMITE_DIAS_EVENTO) return { valido: false, mensagem: `Um evento dura no máximo ${LIMITE_DIAS_EVENTO} dias.` };
  if (hoje && dataInicio < hoje) return { valido: false, mensagem: "A data de início já passou." };

  let horaInicio = null, horaFim = null;
  if (d.horaInicio != null && String(d.horaInicio).trim() !== "") {
    horaInicio = formatarHora(d.horaInicio);
    if (!horaInicio) return { valido: false, mensagem: "Hora de início inválida — use HH:MM." };
  }
  if (d.horaFim != null && String(d.horaFim).trim() !== "") {
    horaFim = formatarHora(d.horaFim);
    if (!horaFim) return { valido: false, mensagem: "Hora de término inválida — use HH:MM." };
    if (!horaInicio) return { valido: false, mensagem: "Informe a hora de início para usar a de término." };
    if (minutos(horaFim) <= minutos(horaInicio)) return { valido: false, mensagem: "A hora de término deve ser depois da de início." };
  }

  const permitidas = String(tipo.abrangenciasPermitidas || "CONGREGACAO").split(",").map(s => s.trim()).filter(Boolean);
  const abrangencia = String(d.abrangencia || permitidas[0]).trim().toUpperCase();
  if (!ABRANGENCIAS.includes(abrangencia) || !permitidas.includes(abrangencia)) {
    return { valido: false, mensagem: `Este tipo de evento só pode ser ${permitidas.map(a => ({ CAMPO: "do campo todo", AREAS: "de uma ou mais Áreas", CONGREGACAO: "de uma congregação" })[a]).join(" ou ")}.` };
  }
  let congregacaoId = null;
  let areaIds = [];
  if (abrangencia === "CONGREGACAO") {
    congregacaoId = Number(d.congregacaoId);
    if (!Number.isInteger(congregacaoId) || congregacaoId <= 0) return { valido: false, mensagem: "Informe a congregação do evento." };
  } else if (abrangencia === "AREAS") {
    areaIds = [...new Set((Array.isArray(d.areaIds) ? d.areaIds : []).map(Number))];
    if (areaIds.length === 0 || areaIds.some(a => !Number.isInteger(a) || a <= 0)) return { valido: false, mensagem: "Informe a(s) Área(s) do evento." };
    if (areaIds.length > 30) return { valido: false, mensagem: "Áreas demais para um só evento." };
  }

  if (tipo.antecedenciaMinimaHoras) {
    if (!horaInicio) return { valido: false, mensagem: `Este tipo de convocação exige a hora de início (antecedência mínima de ${tipo.antecedenciaMinimaHoras} horas).` };
    const horas = horasAteOEvento(dataInicio, horaInicio, agoraMs ?? Date.now());
    if (horas < tipo.antecedenciaMinimaHoras) {
      return { valido: false, mensagem: `A convocação exige antecedência mínima de ${tipo.antecedenciaMinimaHoras} horas (Art. 147 §2º) — faltam ${Math.max(0, Math.floor(horas))} h para o evento.` };
    }
  }

  const local = String(d.local == null ? "" : d.local).trim();
  if (local.length > 200) return { valido: false, mensagem: "O local passa de 200 caracteres." };
  let slugSite = null;
  if (d.slugSite != null && String(d.slugSite).trim() !== "") {
    slugSite = String(d.slugSite).trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,148}$/.test(slugSite)) return { valido: false, mensagem: "O identificador no site deve ter só letras minúsculas, números e hífen." };
  }
  const departamentoId = d.departamentoId ? Number(d.departamentoId) : null;
  if (departamentoId != null && (!Number.isInteger(departamentoId) || departamentoId <= 0)) return { valido: false, mensagem: "Departamento inválido." };

  return {
    valido: true,
    dados: {
      tipoId: tipo.tipoId, titulo, descricao: descricao || null, dataInicio, dataFim, horaInicio, horaFim,
      abrangencia, congregacaoId, areaIds, local: local || null, slugSite, departamentoId,
      publicoNoSite: d.publicoNoSite == null ? !!tipo.publicoNoSite : !!d.publicoNoSite
    }
  };
}

// Catálogo de tipos (CLI). O nível de um evento é a FOTO do nível do tipo no dia da
// proposta: mudar o tipo vale para as propostas de agora em diante.
function validarTipo(d = {}, { criando = false } = {}) {
  let codigo = null;
  if (criando) {
    codigo = String(d.codigo || "").trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{2,49}$/.test(codigo)) return { valido: false, mensagem: "O código deve ter de 3 a 50 caracteres: letras maiúsculas, números e _ (começa por letra)." };
  }
  const nome = String(d.nome == null ? "" : d.nome).trim();
  if (nome.length < 3 || nome.length > 150) return { valido: false, mensagem: "O nome deve ter de 3 a 150 caracteres." };
  const nivel = Number(d.nivel);
  if (!NIVEIS.includes(nivel)) return { valido: false, mensagem: "O nível deve ser de 1 a 5." };
  const lista = Array.isArray(d.abrangenciasPermitidas) ? d.abrangenciasPermitidas : String(d.abrangenciasPermitidas || "").split(",");
  const abrangencias = [...new Set(lista.map(a => String(a).trim().toUpperCase()).filter(Boolean))];
  if (abrangencias.length === 0 || abrangencias.some(a => !ABRANGENCIAS.includes(a))) return { valido: false, mensagem: "Informe onde o evento pode acontecer: CAMPO, AREAS e/ou CONGREGACAO." };
  if (nivel === 1 && (abrangencias.length !== 1 || abrangencias[0] !== "CAMPO")) return { valido: false, mensagem: "Nível 1 (Estratégico-Institucional) é sempre do campo todo." };
  let antecedencia = null;
  if (d.antecedenciaMinimaHoras != null && String(d.antecedenciaMinimaHoras).trim() !== "") {
    antecedencia = Number(d.antecedenciaMinimaHoras);
    if (!Number.isInteger(antecedencia) || antecedencia < 1 || antecedencia > 720) return { valido: false, mensagem: "A antecedência mínima deve ser de 1 a 720 horas." };
  }
  const artigo = String(d.artigoRef == null ? "" : d.artigoRef).trim();
  if (artigo.length > 80) return { valido: false, mensagem: "A referência passa de 80 caracteres." };
  return {
    valido: true,
    dados: {
      codigo, nome, nivel, abrangenciasPermitidas: abrangencias.join(","), fechaCongregacoes: !!d.fechaCongregacoes, festividade: !!d.festividade,
      publicoNoSite: !!d.publicoNoSite, antecedenciaMinimaHoras: antecedencia, registraPresencaDirigente: !!d.registraPresencaDirigente, artigoRef: artigo || null
    }
  };
}

// Quem pode propor este tipo de evento? Nível 1 (atos litúrgicos oficiais, atos
// governamentais, grandes unificados) é da Secretaria Geral / CLI; os demais, de
// quem tem a permissão de proposta (líderes gerais, supervisores de Área,
// dirigentes, coordenadores) ou de quem administra o calendário.
function podeProporNivel(permissoes, nivel) {
  const tem = (chave) => Array.isArray(permissoes) && permissoes.includes(chave);
  if (tem("calendario_secretaria") || tem("calendario_homologacao")) return true;
  return nivel > 1 && tem("calendario_proposta");
}

// O escopo territorial de quem propõe cobre o evento? `escopo` é "TODAS" ou a lista
// de NOMES de congregação do token; `ctx.congregacoes` é um Map id -> { nome, areaId };
// `ctx.congregacoesDaArea(areaId)` devolve os ids da Área.
//  - campo todo: só escopo global;
//  - Áreas: todas as congregações de cada Área precisam estar no escopo (Área sem
//    congregação nenhuma só se o escopo for global);
//  - congregação: ela no escopo.
function escopoCobreEvento(escopo, evento, ctx) {
  if (!escopo || escopo === "TODAS") return { ok: true };
  const nomes = new Set(escopo);
  if (evento.abrangencia === "CAMPO") return { ok: false, mensagem: "Evento do campo todo exige escopo global." };
  if (evento.abrangencia === "CONGREGACAO") {
    const cong = ctx.congregacoes.get(evento.congregacaoId);
    return cong && nomes.has(cong.nome) ? { ok: true } : { ok: false, mensagem: "Congregação fora do seu escopo de atuação." };
  }
  for (const areaId of evento.areaIds || []) {
    const ids = ctx.congregacoesDaArea(areaId);
    if (ids.length === 0) return { ok: false, mensagem: "Há Área sem congregações cadastradas — só o escopo global propõe para ela." };
    for (const id of ids) {
      const cong = ctx.congregacoes.get(id);
      if (!cong || !nomes.has(cong.nome)) return { ok: false, mensagem: "Há Área que não está inteira no seu escopo de atuação." };
    }
  }
  return { ok: true };
}

// Dentro do prazo? Nível 1 nunca é "tardio" (convocação do Campo não depende do
// planejamento de janeiro); o ciclo gerado também não.
function propostaEhTardia({ nivel, origem, hoje, prazoPropostas }) {
  if (nivel === 1 || origem === "REGRA") return false;
  return hoje > prazoPropostas;
}

function prazoPropostasDoAno(ano) {
  return `${ano}-01-15`;
}

module.exports = {
  NIVEIS, ROTULO_NIVEL, ABRANGENCIAS, STATUS_EVENTO, STATUS_ATIVOS, MOTIVOS_INDEFERIMENTO, ROTULO_MOTIVO, LIMITE_DIAS_EVENTO,
  DIAS_LITURGICOS, ROTULO_DIA, OCORRENCIAS, ESCOPOS_LITURGICOS, TIPOS_LITURGICOS,
  dataIsoValida, somarDias, diasEntre, diaDaSemana, ultimoDiaDoMes, formatarDataBr, datasDoDiaNoMes, ultimoDomingo, enesimoDomingo,
  chaveFimDeSemana, fimDeSemanasDoPeriodo, minutos, formatarHora, horaParaSite,
  regraAplicaNaData, agendaLiturgicaDoDia, absorverLiturgia, liturgiaParaSite, validarRegraLiturgica,
  gerarCicloAnual,
  sobrepoeDatas, horariosDisjuntos, territoriosSeCruzam, tiposCompativeis, violaTravaDeArea, detectarConflito, compararPrevalencia,
  avaliarProposta, consolidar, sugerirDatasLivres,
  horasAteOEvento, validarProposta, propostaEhTardia, prazoPropostasDoAno, podeProporNivel, escopoCobreEvento, validarTipo
};
