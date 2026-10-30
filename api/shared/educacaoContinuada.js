// shared/educacaoContinuada.js (v8.6 — Educação continuada) — regra PURA (sem banco): a situação de um obreiro diante da reciclagem anual e do exame bienal da AFM,
// e a validação do que a AFM registra. O banco está em shared/educacaoContinuadaDb.js; o desenho, em docs/plano/fase-8-ministerial-afm.md.
//
// Regimento Art. 68 §3º: o Curso de Reciclagem e Prática Pastoral é anual; "frequência mínima e aprovação" são "critério indispensável e eliminatório para a renovação e
// manutenção da credencial de obreiro ativo no exercício seguinte" (o exercício é o ano civil — Estatuto Art. 30 §2º).
// Art. 70 §3º: o Exame Bienal de Proficiência; I — reprovado: "sob observação" até a aprovação na repescagem; II — "a ausência injustificada no exame equivale à
// reprovação por abandono, sujeitando o infrator à suspensão imediata das funções ministeriais".

const RESULTADOS_RECICLAGEM = { APROVADO: "Aprovado", REPROVADO: "Reprovado", AUSENTE: "Ausente" };
const RESULTADOS_EXAME = { APROVADO: "Aprovado", REPROVADO: "Reprovado", AUSENTE_JUSTIFICADO: "Ausente com justificativa", AUSENTE: "Ausente sem justificativa" };
const TIPOS_EXAME = { BIENAL: "Exame bienal (Seminário de novembro)", REPESCAGEM: "Repescagem" };
const MESES_DO_ALERTA = [10, 11, 12];   // o aviso da reciclagem pendente: de outubro a dezembro (antes de vencer, não depois)

const dataIso = (v) => {
  if (v == null || v === "") return null;
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
const horasMinimas = (edicao) => Math.round(Number(edicao.cargaHoraria) * Number(edicao.frequenciaMinimaPct)) / 100;

// A situação de UMA pessoa. Entradas:
//  hojeIso; ehObreiro (oficial em atividade); obreiroDesde (o primeiro dia como oficial SEM interrupção — a promoção não zera, ver inicioNoMinisterio; null = sem
//  data — o legado conta como de antes); edicaoAnterior: a edição da reciclagem do ANO ANTERIOR ({ ano, data }) ou null; resultadoAnterior: o resultado dela ou null;
//  exames: TODOS os resultados da pessoa em exames já realizados (bienais e repescagens), [{ tipo, data, resultado, exameId? }]. A sanção vem do primeiro resultado
//  que a impõe e só cai com uma APROVAÇÃO depois dele (Art. 70 §3º: "até ser aprovado"): a ausência justificada numa repescagem, a reprovação depois da ausência
//  ou um bienal novo em que a pessoa não foi registrada não tiram a sanção.
// Saída: { reciclagemPendente (inativo pela reciclagem), sobObservacao, suspensoExame, devendoRepescagem, pendencias: [texto] }.
function situacao({ hojeIso, ehObreiro = true, obreiroDesde = null, edicaoAnterior = null, resultadoAnterior = null, exames = [] }) {
  const r = { reciclagemPendente: false, sobObservacao: false, suspensoExame: false, devendoRepescagem: false, pendencias: [] };
  if (!ehObreiro) return r;
  const desde = dataIso(obreiroDesde);
  if (edicaoAnterior && Number(edicaoAnterior.ano) === Number(String(hojeIso).slice(0, 4)) - 1
      && (!desde || desde <= dataIso(edicaoAnterior.data)) && (!resultadoAnterior || resultadoAnterior.resultado !== "APROVADO")) {
    r.reciclagemPendente = true;
    r.pendencias.push(`Sem a aprovação na Reciclagem e Prática Pastoral de ${edicaoAnterior.ano}: a credencial não foi renovada para ${Number(edicaoAnterior.ano) + 1} (Regimento, Art. 68 §3º).`);
  }
  const chave = (e) => `${dataIso(e.data) || ""}|${e.tipo === "BIENAL" ? 0 : 1}|${String(Number(e.exameId) || 0).padStart(10, "0")}`;
  const ordenados = [...(exames || [])].filter((e) => e && e.resultado).sort((a, b) => (chave(a) < chave(b) ? -1 : chave(a) > chave(b) ? 1 : 0));
  let sancao = null;        // null | "OBSERVACAO" | "SUSPENSAO" (a suspensão nunca desce para observação sem a aprovação)
  let devendo = false;
  for (const e of ordenados) {
    if (e.resultado === "APROVADO") { sancao = null; devendo = false; }
    else if (e.resultado === "AUSENTE") { sancao = "SUSPENSAO"; devendo = false; }
    else if (e.resultado === "REPROVADO") { if (sancao !== "SUSPENSAO") sancao = "OBSERVACAO"; devendo = false; }
    else if (e.resultado === "AUSENTE_JUSTIFICADO" && !sancao) devendo = true;
  }
  if (sancao === "OBSERVACAO") {
    r.sobObservacao = true;
    r.pendencias.push("Reprovado(a) no exame bienal: sob observação até a aprovação na repescagem (Regimento, Art. 70 §3º, I).");
  } else if (sancao === "SUSPENSAO") {
    r.suspensoExame = true;
    r.pendencias.push("Ausente sem justificativa no exame bienal: suspenso(a) das funções ministeriais até a aprovação na repescagem (Regimento, Art. 70 §3º, II).");
  } else if (devendo) {
    r.devendoRepescagem = true;
    r.pendencias.push("Ausência justificada no exame bienal: falta fazer a repescagem.");
  }
  return r;
}

// O primeiro dia como oficial sem interrupção: a promoção (Diácono → Presbítero) fecha uma linha do histórico e abre outra no mesmo dia, e isso não pode zerar a
// contagem (senão o reprovado na reciclagem escapa sendo promovido). `linhas`: o histórico de cargos de OFICIAL da pessoa, [{ desde, ate }] (ate null = a aberta).
// Devolve null quando não há linha aberta ou alguma linha da sequência não tem data (o legado conta como de antes).
function inicioNoMinisterio(linhas) {
  const lista = (linhas || []).filter(Boolean);
  const aberta = lista.find((l) => !l.ate);
  if (!aberta || !dataIso(aberta.desde)) return null;
  let inicio = dataIso(aberta.desde);
  const fechadas = lista.filter((l) => l !== aberta && l.ate).sort((a, b) => (dataIso(b.ate) < dataIso(a.ate) ? -1 : dataIso(b.ate) > dataIso(a.ate) ? 1 : 0));
  for (const l of fechadas) {
    const ate = dataIso(l.ate);
    if (!ate || Date.parse(`${ate}T00:00:00Z`) < Date.parse(`${inicio}T00:00:00Z`) - 86400000) continue;   // terminou antes (houve interrupção): não emenda
    if (!dataIso(l.desde)) return null;
    if (dataIso(l.desde) < inicio) inicio = dataIso(l.desde);
  }
  return inicio;
}

// Fora das funções pela educação continuada (a licença para oficiar, a Comissão de Unção e o QR leem isto): a reciclagem não renovada ou a ausência no exame.
const foraDasFuncoes = (s) => !!(s && (s.reciclagemPendente || s.suspensoExame));

// ---- validações do que a AFM registra ----
const textoLimpo = (v) => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim() : "");
const dataValida = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

function validarEdicao(c, hojeIso) {
  const corpo = c && typeof c === "object" ? c : {};
  if (!dataValida(corpo.data)) return { valido: false, mensagem: "Informe a data da reciclagem (dia/mês/ano)." };
  if (corpo.data < "2020-01-01") return { valido: false, mensagem: "A data da reciclagem está antiga demais." };
  if (corpo.data > `${Number(String(hojeIso).slice(0, 4)) + 1}-12-31`) return { valido: false, mensagem: "A data da reciclagem está longe demais." };
  const carga = Number(String(corpo.cargaHoraria ?? "").replace(",", "."));
  if (!Number.isFinite(carga) || carga <= 0 || carga > 500 || Math.round(carga * 10) !== carga * 10) return { valido: false, mensagem: "Informe a carga horária (em horas, até uma casa decimal)." };
  const freq = Number(corpo.frequenciaMinimaPct);
  if (!Number.isInteger(freq) || freq < 1 || freq > 100) return { valido: false, mensagem: "A frequência mínima é um número de 1 a 100 (%)." };
  const observacao = textoLimpo(corpo.observacao);
  if (observacao.length > 300) return { valido: false, mensagem: "A observação tem no máximo 300 caracteres." };
  return { valido: true, edicao: { ano: Number(corpo.data.slice(0, 4)), data: corpo.data, cargaHoraria: carga, frequenciaMinimaPct: freq, observacao: observacao || null } };
}

// O resultado de UM obreiro numa edição: o aprovado precisa da frequência mínima (Art. 68 §3º: "frequência mínima e aprovação"); o ausente não tem horas.
function validarResultadoReciclagem(c, edicao) {
  const corpo = c && typeof c === "object" ? c : {};
  if (!Object.prototype.hasOwnProperty.call(RESULTADOS_RECICLAGEM, corpo.resultado)) return { valido: false, mensagem: "Escolha o resultado: aprovado, reprovado ou ausente." };
  let horas = null;
  if (corpo.resultado !== "AUSENTE") {
    horas = Number(String(corpo.horasPresentes ?? "").replace(",", "."));
    if (!Number.isFinite(horas) || horas < 0 || horas > Number(edicao.cargaHoraria) || Math.round(horas * 10) !== horas * 10) {
      return { valido: false, mensagem: `Informe as horas presentes (de 0 a ${edicao.cargaHoraria}).` };
    }
    if (corpo.resultado === "APROVADO" && horas < horasMinimas(edicao)) {
      return { valido: false, mensagem: `Aprovado só com a frequência mínima: ${horasMinimas(edicao)} h de ${edicao.cargaHoraria} h (${edicao.frequenciaMinimaPct}%) — Regimento, Art. 68 §3º.` };
    }
  }
  return { valido: true, resultado: { resultado: corpo.resultado, horasPresentes: horas } };
}

function validarExame(c, hojeIso) {
  const corpo = c && typeof c === "object" ? c : {};
  if (!Object.prototype.hasOwnProperty.call(TIPOS_EXAME, corpo.tipo)) return { valido: false, mensagem: "Escolha: o exame bienal ou uma repescagem." };
  if (!dataValida(corpo.data)) return { valido: false, mensagem: "Informe a data do exame (dia/mês/ano)." };
  if (corpo.data < "2020-01-01" || corpo.data > `${Number(String(hojeIso).slice(0, 4)) + 1}-12-31`) return { valido: false, mensagem: "Data do exame fora do intervalo aceito." };
  let exameOrigemId = null;
  if (corpo.tipo === "REPESCAGEM") {
    exameOrigemId = Number(corpo.exameOrigemId);
    if (!Number.isInteger(exameOrigemId) || exameOrigemId <= 0 || exameOrigemId > 2147483647) return { valido: false, mensagem: "Escolha o exame bienal desta repescagem." };
  }
  const observacao = textoLimpo(corpo.observacao);
  if (observacao.length > 300) return { valido: false, mensagem: "A observação tem no máximo 300 caracteres." };
  return { valido: true, exame: { tipo: corpo.tipo, data: corpo.data, exameOrigemId, observacao: observacao || null } };
}

function validarResultadoExame(c) {
  const corpo = c && typeof c === "object" ? c : {};
  if (!Object.prototype.hasOwnProperty.call(RESULTADOS_EXAME, corpo.resultado)) return { valido: false, mensagem: "Escolha o resultado do exame." };
  const justificativa = textoLimpo(corpo.justificativa);
  if (corpo.resultado === "AUSENTE_JUSTIFICADO" && justificativa.length < 5) return { valido: false, mensagem: "A ausência justificada precisa da justificativa (pelo menos 5 caracteres)." };
  if (justificativa.length > 300) return { valido: false, mensagem: "A justificativa tem no máximo 300 caracteres." };
  return { valido: true, resultado: { resultado: corpo.resultado, justificativa: corpo.resultado === "AUSENTE_JUSTIFICADO" ? justificativa : null } };
}

// O aviso da reciclagem pendente sai de outubro a dezembro, para quem é obreiro e ainda não foi aprovado na edição DO ANO (se a edição já foi registrada).
const mesDoAlerta = (hojeIso) => MESES_DO_ALERTA.includes(Number(String(hojeIso).slice(5, 7)));

module.exports = { RESULTADOS_RECICLAGEM, RESULTADOS_EXAME, TIPOS_EXAME, situacao, inicioNoMinisterio, foraDasFuncoes, horasMinimas, validarEdicao, validarResultadoReciclagem,
  validarExame, validarResultadoExame, mesDoAlerta, dataIso };
