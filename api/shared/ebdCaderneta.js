// shared/ebdCaderneta.js (v6.8 — EBD: Caderneta digital no padrão CPAD)
//
// Continua a FASE 6 em cima de tudo que já existe (turmas v6.1, chamada
// v6.2, revistas v6.6, oferta v6.7). Quatro peças, nenhuma duplica dado:
//
// 1) CADERNETA DO DOMINGO — a tela que o secretário de EBD já conhece da
//    caderneta de papel da CPAD: por classe, matriculados, presentes,
//    ausentes, visitantes, Bíblias, revistas e a oferta. Presentes/ausentes/
//    visitantes são DERIVADOS da chamada (EbdChamadas) — "calculado, nunca
//    digitado". O que a chamada não tem e a caderneta sim (Bíblias e
//    Revistas trazidas) mora em EbdCadernetas, uma linha por Lição × Turma.
//    A oferta continua sendo a da v6.7 (EbdOfertas, por lição) — um único
//    lugar para o dinheiro.
// 2) FECHAMENTO TRIMESTRAL — foto congelada (JSON) do trimestre de uma
//    congregação: manual ("Fechar trimestre") ou automático (rotina diária).
// 3) RELATÓRIO DO SUPERINTENDENTE — Área → Congregação → Turma, somado a
//    partir das linhas da caderneta; usa o fechamento quando existe e o
//    cálculo ao vivo (marcado "parcial") quando não.
// 4) IMPORTAÇÃO — cadernetas antigas de papel/planilha (só totais, sem linha
//    por aluno), em CSV, com simulação antes de gravar.
//
// Aluno não-membro (o terceiro item do README) vive em shared/ebdTurmas.js,
// junto da matrícula; aqui só aparece como "mais um matriculado".
//
// Lógica de decisão pura (testável sem banco) primeiro, funções de banco
// (finas) depois — mesmo padrão do resto da FASE 6.
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const ebdChamada = require("./ebdChamada");
const ebdRevistas = require("./ebdRevistas");

const ORIGEM_CADERNETA = { SISTEMA: "SISTEMA", IMPORTADA: "IMPORTADA" };
const ORIGEM_FECHAMENTO = { MANUAL: "MANUAL", AUTOMATICO: "AUTOMATICO" };
const CARENCIA_FECHAMENTO_AUTOMATICO_DIAS = 7;
const LIMITE_CONTAGEM = 10000;
const LIMITE_OBSERVACAO = 500;
const LIMITE_LINHAS_IMPORTACAO = 2000;
const VERSAO_SNAPSHOT = 1;

// ---------------------------------------------------------------
// Lógica pura — datas e trimestres
// ---------------------------------------------------------------

const arred1 = (n) => Math.round(n * 10) / 10;
const arred2 = (n) => Math.round(n * 100) / 100;
const pad2 = (n) => String(n).padStart(2, "0");
const num = (v) => (v == null || Number.isNaN(Number(v)) ? 0 : Number(v));

function dataIsoValida(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return false;
  const ano = Number(m[1]), mes = Number(m[2]), dia = Number(m[3]);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

// Coluna DATE do mssql chega como Date à meia-noite UTC (o dia gravado);
// qualquer outro Date é um instante e usa o dia local — mesma regra da
// Trava 6-A (conquistas.js::paraDataLocal), aqui devolvendo 'AAAA-MM-DD'.
function paraIsoData(valor) {
  if (!valor) return null;
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    const meiaNoiteUtc = valor.getUTCHours() === 0 && valor.getUTCMinutes() === 0
      && valor.getUTCSeconds() === 0 && valor.getUTCMilliseconds() === 0;
    const [a, m, d] = meiaNoiteUtc
      ? [valor.getUTCFullYear(), valor.getUTCMonth() + 1, valor.getUTCDate()]
      : [valor.getFullYear(), valor.getMonth() + 1, valor.getDate()];
    return `${a}-${pad2(m)}-${pad2(d)}`;
  }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(valor));
  return m && dataIsoValida(m[1]) ? m[1] : null;
}

function somarDias(iso, dias) {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

// Trimestres CIVIS (T1 = jan-mar ... T4 = out-dez), o mesmo formato
// 'AAAA-Tn' do catálogo de revistas (v6.6, ebdRevistas.trimestreValido).
function trimestreDaData(data) {
  const iso = paraIsoData(data);
  if (!iso) return null;
  return `${iso.slice(0, 4)}-T${Math.ceil(Number(iso.slice(5, 7)) / 3)}`;
}

function intervaloDoTrimestre(trimestre) {
  if (!ebdRevistas.trimestreValido(trimestre)) return null;
  const t = String(trimestre).trim();
  const ano = Number(t.slice(0, 4));
  const n = Number(t.slice(-1));
  const mesFim = n * 3;
  const diaFim = new Date(Date.UTC(ano, mesFim, 0)).getUTCDate();
  return { inicio: `${ano}-${pad2((n - 1) * 3 + 1)}-01`, fim: `${ano}-${pad2(mesFim)}-${pad2(diaFim)}` };
}

function trimestreAnterior(trimestre) {
  const ano = Number(trimestre.slice(0, 4));
  const n = Number(trimestre.slice(-1));
  return n === 1 ? `${ano - 1}-T4` : `${ano}-T${n - 1}`;
}

// Só é "encerrado" depois do último dia + a carência. A carência existe só
// pra rotina automática (dar tempo de lançar o último domingo); o fechamento
// manual usa carência 0.
function trimestreEncerrado(trimestre, hojeIso, carenciaDias = 0) {
  const intervalo = intervaloDoTrimestre(trimestre);
  if (!intervalo || !dataIsoValida(hojeIso)) return false;
  return hojeIso > somarDias(intervalo.fim, carenciaDias);
}

// Quais trimestres a rotina diária olha: os `quantidade` mais recentes já
// encerrados (com carência). Limitado de propósito — a rotina não sai
// fechando anos de histórico importado de uma vez.
function trimestresParaFechamentoAutomatico(hojeIso, { carenciaDias = CARENCIA_FECHAMENTO_AUTOMATICO_DIAS, quantidade = 2 } = {}) {
  let atual = trimestreDaData(hojeIso);
  const encontrados = [];
  for (let i = 0; atual && i < 12 && encontrados.length < quantidade; i++) {
    if (trimestreEncerrado(atual, hojeIso, carenciaDias)) encontrados.push(atual);
    atual = trimestreAnterior(atual);
  }
  return encontrados.reverse();
}

// ---------------------------------------------------------------
// Lógica pura — registro de Bíblias/Revistas
// ---------------------------------------------------------------

function lerContagem(valor, rotulo) {
  if (valor === undefined || valor === null) return { ok: true, valor: null };
  if (typeof valor === "string" && valor.trim() === "") return { ok: true, valor: null };
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0 || n > LIMITE_CONTAGEM) {
    return { ok: false, mensagem: `${rotulo}: informe um número inteiro entre 0 e ${LIMITE_CONTAGEM}.` };
  }
  return { ok: true, valor: n };
}

// Em branco = "não informado" (NULL), que é diferente de 0 — a caderneta de
// papel em branco não quer dizer que ninguém trouxe Bíblia.
function validarRegistroCaderneta({ biblias, revistas, observacao } = {}) {
  const b = lerContagem(biblias, "Bíblias");
  if (!b.ok) return { valido: false, mensagem: b.mensagem };
  const r = lerContagem(revistas, "Revistas");
  if (!r.ok) return { valido: false, mensagem: r.mensagem };
  const obs = observacao == null ? "" : String(observacao).trim();
  if (obs.length > LIMITE_OBSERVACAO) {
    return { valido: false, mensagem: `A observação passa de ${LIMITE_OBSERVACAO} caracteres.` };
  }
  return { valido: true, valores: { biblias: b.valor, revistas: r.valor, observacao: obs || null } };
}

function normalizarTexto(valor) {
  return String(valor == null ? "" : valor).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// "Revista/trimestre vigente" da classe (item 1 da v6.8): o que a turma
// PEDIU para o trimestre da lição (v6.6); sem pedido, sugere do catálogo as
// edições da mesma faixa etária; sem nada, devolve só o trimestre.
function resolverRevistaVigente({ trimestre, itensPedido = [], catalogoDoTrimestre = [], faixaEtaria = null }) {
  if (itensPedido.length > 0) {
    return { trimestre, origem: "PEDIDO", revistas: itensPedido.map(i => ({ nome: i.revistaNome, quantidade: i.quantidade })) };
  }
  const alvo = normalizarTexto(faixaEtaria);
  if (alvo) {
    const candidatas = catalogoDoTrimestre.filter(r => normalizarTexto(r.faixaEtaria) === alvo);
    if (candidatas.length > 0) {
      return { trimestre, origem: "CATALOGO", revistas: candidatas.map(r => ({ nome: r.nome, quantidade: null })) };
    }
  }
  return { trimestre, origem: null, revistas: [] };
}

// ---------------------------------------------------------------
// Lógica pura — a linha da caderneta (uma classe num domingo)
// ---------------------------------------------------------------

function avaliarAlertas(l) {
  if (!l.lancada) return ["Nenhuma chamada nem caderneta lançada para esta turma neste domingo."];
  const alertas = [];
  if (l.origem === ORIGEM_CADERNETA.SISTEMA) {
    if (l.semChamada > 0) alertas.push(`${l.semChamada} aluno(s) sem chamada lançada — contado(s) como ausente(s).`);
    if (l.presentes > l.matriculados) alertas.push("Mais presentes do que matriculados — confira a matrícula da turma.");
    if (l.biblias == null || l.revistas == null) alertas.push("Bíblias/Revistas ainda não informadas.");
  }
  if (l.biblias != null && l.biblias > l.frequentes) alertas.push(`Bíblias (${l.biblias}) acima do total de frequentes (${l.frequentes}).`);
  if (l.revistas != null && l.revistas > l.frequentes) alertas.push(`Revistas (${l.revistas}) acima do total de frequentes (${l.frequentes}).`);
  return alertas;
}

// A linha é sempre montada aqui, num lugar só, pra tela do dia, o relatório
// e o fechamento nunca discordarem.
//  - SISTEMA: matriculados = foto gravada ao salvar/fechar a lição, senão o
//    número atual de alunos ativos; ausentes = matriculados - presentes (a
//    definição da caderneta de papel, em que não-presente é ausente);
//    `ausentesMarcados`/`semChamada` mostram quanto disso foi marcado de
//    fato na chamada, pra o secretário ver o que faltou lançar.
//  - IMPORTADA: os totais vêm das colunas importadas, sem nada derivado.
function montarLinhaCaderneta({ turma, professores = [], revistaVigente = null, matriculadosAtuais = 0, resumo = {}, caderneta = null }) {
  const importada = !!caderneta && caderneta.origem === ORIGEM_CADERNETA.IMPORTADA;
  let matriculados, presentes, ausentes, visitantes, ausentesMarcados, semChamada;

  if (importada) {
    matriculados = num(caderneta.matriculadosRegistrado);
    presentes = num(caderneta.presentesImportado);
    ausentes = num(caderneta.ausentesImportado);
    visitantes = num(caderneta.visitantesImportado);
    ausentesMarcados = ausentes;
    semChamada = 0;
  } else {
    matriculados = caderneta && caderneta.matriculadosRegistrado != null ? num(caderneta.matriculadosRegistrado) : num(matriculadosAtuais);
    presentes = num(resumo.presentes);
    visitantes = num(resumo.visitantes);
    ausentesMarcados = num(resumo.ausentes);
    ausentes = Math.max(0, matriculados - presentes);
    semChamada = Math.max(0, matriculados - presentes - ausentesMarcados);
  }

  const temChamada = presentes + ausentesMarcados + visitantes > 0;
  const linha = {
    turmaId: turma.turmaId, turmaNome: turma.nome, faixaEtaria: turma.faixaEtaria || null, turmaAtiva: turma.ativa !== false,
    professores: professores.map(p => ({ membroId: p.membroId, nome: p.nome, principal: !!p.principal })),
    revistaVigente,
    origem: importada ? ORIGEM_CADERNETA.IMPORTADA : ORIGEM_CADERNETA.SISTEMA,
    salva: !!caderneta,
    lancada: importada || temChamada || !!caderneta,
    matriculados, presentes, ausentes, ausentesMarcados, semChamada, visitantes,
    frequentes: presentes + visitantes,
    percentualPresenca: matriculados > 0 ? arred1((presentes / matriculados) * 100) : 0,
    biblias: caderneta ? caderneta.biblias : null,
    revistas: caderneta ? caderneta.revistas : null,
    ofertaImportada: importada ? num(caderneta.ofertaImportada) : 0,
    observacao: caderneta ? caderneta.observacao : null
  };
  linha.alertas = avaliarAlertas(linha);
  return linha;
}

// Só entram na soma as classes que lançaram alguma coisa — uma classe que
// não se reuniu não deve puxar a média de presença pra baixo.
function somarLinhas(linhas) {
  const lancadas = (linhas || []).filter(l => l.lancada);
  const t = {
    turmasLancadas: lancadas.length, turmasSemLancamento: (linhas || []).length - lancadas.length,
    matriculados: 0, presentes: 0, ausentes: 0, visitantes: 0, frequentes: 0, biblias: 0, revistas: 0, ofertaImportada: 0
  };
  for (const l of lancadas) {
    t.matriculados += l.matriculados; t.presentes += l.presentes; t.ausentes += l.ausentes;
    t.visitantes += l.visitantes; t.frequentes += l.frequentes;
    t.biblias += num(l.biblias); t.revistas += num(l.revistas); t.ofertaImportada += num(l.ofertaImportada);
  }
  t.ofertaImportada = arred2(t.ofertaImportada);
  t.percentualPresenca = t.matriculados > 0 ? arred1((t.presentes / t.matriculados) * 100) : 0;
  return t;
}

// A tela do domingo de uma congregação. `ofertaLicao` é a oferta da v6.7
// (EbdOfertas) — null se ainda não foi registrada.
function montarCadernetaDoDomingo({ licao, linhas, ofertaLicao = null }) {
  const totais = somarLinhas(linhas);
  return {
    licao,
    trimestre: trimestreDaData(licao.data),
    parcial: licao.status !== ebdChamada.STATUS_LICAO.FECHADA,
    linhas,
    totais,
    ofertaRegistrada: ofertaLicao == null ? null : num(ofertaLicao),
    ofertaTotal: arred2(num(ofertaLicao) + totais.ofertaImportada)
  };
}

// ---------------------------------------------------------------
// Lógica pura — Relatório do Superintendente (Área → Congregação → Turma)
// ---------------------------------------------------------------

function totaisVazios() {
  return {
    domingos: 0, matriculadosMedio: 0, baseMatriculados: 0, mediaPresentes: 0,
    presentes: 0, ausentes: 0, visitantes: 0, frequentes: 0, biblias: 0, revistas: 0, oferta: 0, percentualPresenca: 0
  };
}

function fecharPercentual(t) {
  t.percentualPresenca = t.baseMatriculados > 0 ? arred1((t.presentes / t.baseMatriculados) * 100) : 0;
  t.oferta = arred2(t.oferta);
  return t;
}

// `registros` são as linhas (classe × domingo) já planas, cada uma com
// licaoId. Médias são por domingo lançado; percentual é sobre a base de
// matriculados-somados (presentes / Σ matriculados), não média de médias.
function totaisDeTurma(registros) {
  const t = totaisVazios();
  const licoes = new Set();
  for (const r of registros) {
    t.baseMatriculados += num(r.matriculados);
    t.presentes += num(r.presentes); t.ausentes += num(r.ausentes); t.visitantes += num(r.visitantes);
    t.biblias += num(r.biblias); t.revistas += num(r.revistas); t.oferta += num(r.ofertaImportada);
    licoes.add(r.licaoId);
  }
  t.domingos = licoes.size;
  t.frequentes = t.presentes + t.visitantes;
  t.matriculadosMedio = registros.length ? arred1(t.baseMatriculados / registros.length) : 0;
  t.mediaPresentes = registros.length ? arred1(t.presentes / registros.length) : 0;
  return fecharPercentual(t);
}

// Soma os totais dos filhos (turmas numa congregação, congregações numa
// área...). Médias somam: a "média de matriculados da área" é a soma das
// médias das congregações (o tamanho típico da EBD da área num domingo).
function somarTotais(lista) {
  const t = totaisVazios();
  for (const x of lista) {
    t.domingos += x.domingos; t.matriculadosMedio += x.matriculadosMedio; t.baseMatriculados += x.baseMatriculados;
    t.mediaPresentes += x.mediaPresentes; t.presentes += x.presentes; t.ausentes += x.ausentes;
    t.visitantes += x.visitantes; t.frequentes += x.frequentes; t.biblias += x.biblias; t.revistas += x.revistas;
    t.oferta += x.oferta;
  }
  t.matriculadosMedio = arred1(t.matriculadosMedio);
  t.mediaPresentes = arred1(t.mediaPresentes);
  return fecharPercentual(t);
}

function montarNoCongregacao(registros, { ofertaSistema = 0 } = {}) {
  if (!registros || registros.length === 0) return null;
  const primeiro = registros[0];
  const porTurma = new Map();
  for (const r of registros) {
    if (!porTurma.has(r.turmaId)) porTurma.set(r.turmaId, { turmaId: r.turmaId, turmaNome: r.turmaNome, faixaEtaria: r.faixaEtaria || null, registros: [] });
    porTurma.get(r.turmaId).registros.push(r);
  }
  const turmas = Array.from(porTurma.values())
    .map(t => ({ turmaId: t.turmaId, turmaNome: t.turmaNome, faixaEtaria: t.faixaEtaria, totais: totaisDeTurma(t.registros) }))
    .sort((a, b) => a.turmaNome.localeCompare(b.turmaNome));
  const totais = somarTotais(turmas.map(t => t.totais));
  totais.domingos = new Set(registros.map(r => r.licaoId)).size; // domingos DA congregação, não soma das turmas
  totais.oferta = arred2(totais.oferta + num(ofertaSistema));
  return {
    congregacaoId: primeiro.congregacaoId, congregacaoNome: primeiro.congregacaoNome,
    areaId: primeiro.areaId != null ? primeiro.areaId : null, areaNome: primeiro.areaNome || null,
    turmas, totais, ofertaSistema: arred2(num(ofertaSistema))
  };
}

function agruparNosPorArea(nos) {
  const areas = new Map();
  for (const no of nos || []) {
    const chave = no.areaId != null ? no.areaId : "SEM_AREA";
    if (!areas.has(chave)) areas.set(chave, { areaId: no.areaId != null ? no.areaId : null, areaNome: no.areaNome || "Sem Área definida", congregacoes: [] });
    areas.get(chave).congregacoes.push(no);
  }
  const listaAreas = Array.from(areas.values()).map(a => ({
    ...a,
    congregacoes: a.congregacoes.sort((x, y) => x.congregacaoNome.localeCompare(y.congregacaoNome)),
    totais: somarTotais(a.congregacoes.map(c => c.totais))
  })).sort((a, b) => a.areaNome.localeCompare(b.areaNome));
  return { areas: listaAreas, totais: somarTotais(listaAreas.map(a => a.totais)) };
}

function consolidarRelatorio(registros, { ofertasPorCongregacao = {} } = {}) {
  const porCong = new Map();
  for (const r of registros || []) {
    if (!porCong.has(r.congregacaoId)) porCong.set(r.congregacaoId, []);
    porCong.get(r.congregacaoId).push(r);
  }
  const nos = [];
  for (const [congregacaoId, lista] of porCong) {
    nos.push(montarNoCongregacao(lista, { ofertaSistema: ofertasPorCongregacao[congregacaoId] || 0 }));
  }
  return agruparNosPorArea(nos);
}

// ---------------------------------------------------------------
// Lógica pura — Fechamento trimestral
// ---------------------------------------------------------------

function montarSnapshotFechamento({ no, trimestre, licoesAbertas = 0, geradoEm }) {
  return {
    versao: VERSAO_SNAPSHOT, trimestre, periodo: intervaloDoTrimestre(trimestre),
    licoesAbertas, geradoEm: geradoEm || new Date().toISOString(), congregacao: no
  };
}

function lerSnapshot(texto) {
  try {
    const obj = typeof texto === "string" ? JSON.parse(texto) : texto;
    return obj && obj.congregacao ? obj : null;
  } catch {
    return null;
  }
}

// Quem pode fechar o quê, e quando. Automático nunca refaz (só preenche o
// que falta); manual só depois do fim do trimestre (antes disso existe o
// relatório parcial); refazer exige fechamento anterior.
function decidirFechamento({ existente, trimestre, hojeIso, origem, refazer = false, temRegistros = true }) {
  if (!ebdRevistas.trimestreValido(trimestre)) {
    return { permitido: false, mensagem: "Informe o trimestre no formato AAAA-T1 a AAAA-T4 (ex: 2026-T3)." };
  }
  const carencia = origem === ORIGEM_FECHAMENTO.AUTOMATICO ? CARENCIA_FECHAMENTO_AUTOMATICO_DIAS : 0;
  if (!trimestreEncerrado(trimestre, hojeIso, carencia)) {
    return { permitido: false, mensagem: `O trimestre ${trimestre} ainda não terminou — enquanto isso use o relatório parcial.` };
  }
  if (refazer && origem === ORIGEM_FECHAMENTO.AUTOMATICO) {
    return { permitido: false, mensagem: "A rotina automática nunca refaz um fechamento existente." };
  }
  if (existente && !refazer) {
    return { permitido: false, mensagem: `O trimestre ${trimestre} já foi fechado (versão ${existente.versao}) — use "refazer" se precisar atualizar.` };
  }
  if (!existente && refazer) {
    return { permitido: false, mensagem: `O trimestre ${trimestre} ainda não foi fechado — não há o que refazer.` };
  }
  if (!temRegistros) {
    return { permitido: false, mensagem: "Nenhuma chamada ou caderneta lançada neste trimestre para esta congregação." };
  }
  return { permitido: true };
}

// ---------------------------------------------------------------
// Lógica pura — Importação de cadernetas antigas (CSV)
// ---------------------------------------------------------------

// Cabeçalho aceito sem acento, sem maiúscula e sem pontuação; vários
// apelidos, porque planilha de secretaria não segue padrão nenhum.
const ALIAS_COLUNAS = {
  congregacao: ["congregacao", "igreja", "comunidade"],
  data: ["data", "domingo", "dia"],
  turma: ["turma", "classe", "sala"],
  matriculados: ["matriculados", "matricula", "matriculas", "alunos"],
  presentes: ["presentes", "presenca", "presencas"],
  ausentes: ["ausentes", "ausencia", "ausencias", "faltas"],
  visitantes: ["visitantes", "visitas", "visitante"],
  biblias: ["biblias", "biblia"],
  revistas: ["revistas", "revista"],
  oferta: ["oferta", "ofertas", "valor"]
};
const COLUNAS_OBRIGATORIAS_IMPORTACAO = ["congregacao", "data", "turma", "matriculados", "presentes"];

function chaveCabecalho(texto) {
  return normalizarTexto(texto).replace(/[^a-z0-9]/g, "");
}

function canonicoDoCabecalho(texto) {
  const chave = chaveCabecalho(texto);
  for (const [canonico, apelidos] of Object.entries(ALIAS_COLUNAS)) {
    if (apelidos.includes(chave)) return canonico;
  }
  return null;
}

// CSV de verdade: delimitador detectado (; , ou tab — Excel em português
// exporta com ponto-e-vírgula), aspas com delimitador/quebra de linha
// dentro, "" como aspas literais, BOM e CRLF.
function lerCsv(texto) {
  const s = String(texto || "").replace(/^﻿/, "");
  const primeira = s.split(/\r?\n/).find(l => l.trim() !== "") || "";
  const delimitador = [";", "\t", ","].map(d => [d, primeira.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const registros = [];
  let campo = "", campos = [], dentroAspas = false, numeroLinha = 1, inicioLinha = 1;

  const fecharLinha = () => {
    campos.push(campo);
    if (campos.some(x => x.trim() !== "")) registros.push({ numero: inicioLinha, campos });
    campo = ""; campos = [];
  };

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (dentroAspas) {
      if (c === '"') {
        if (s[i + 1] === '"') { campo += '"'; i++; } else dentroAspas = false;
      } else {
        campo += c;
        if (c === "\n") numeroLinha++;
      }
    } else if (c === '"') {
      dentroAspas = true;
    } else if (c === delimitador) {
      campos.push(campo); campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      fecharLinha();
      numeroLinha++; inicioLinha = numeroLinha;
    } else {
      campo += c;
    }
  }
  fecharLinha();
  return registros;
}

function converterDataImportacao(texto) {
  const t = String(texto == null ? "" : texto).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return dataIsoValida(t) ? t : null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return null;
  const iso = `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
  return dataIsoValida(iso) ? iso : null;
}

// "1.234,56", "12,50", "12.50", "R$ 30" -> número; "" -> null; ilegível -> NaN.
function converterValorMonetario(texto) {
  let t = String(texto == null ? "" : texto).replace(/R\$/gi, "").replace(/\s/g, "");
  if (t === "") return null;
  if (t.includes(",") && t.includes(".")) t = t.replace(/\./g, "").replace(",", ".");
  else if (t.includes(",")) t = t.replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : NaN;
}

function lerInteiroImportacao(texto, rotulo, erros, { obrigatorio = false } = {}) {
  const t = String(texto == null ? "" : texto).trim();
  if (t === "") {
    if (obrigatorio) erros.push(`${rotulo}: valor obrigatório.`);
    return null;
  }
  if (!/^\d+$/.test(t) || Number(t) > LIMITE_CONTAGEM) {
    erros.push(`${rotulo}: "${t}" não é um número inteiro válido.`);
    return null;
  }
  return Number(t);
}

function ehDomingo(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay() === 0;
}

// Uma linha bruta (texto do CSV ou JSON) -> linha normalizada + erros/avisos.
// Erro impede gravar; aviso só chama atenção (ex.: data que não é domingo).
function validarLinhaImportacao(bruta, hojeIso) {
  const erros = [], avisos = [];
  const get = (k) => (bruta[k] == null ? "" : String(bruta[k]));
  const congregacao = get("congregacao").trim();
  const turma = get("turma").trim();
  if (!congregacao) erros.push("Congregação: valor obrigatório.");
  if (!turma) erros.push("Turma: valor obrigatório.");

  const data = converterDataImportacao(get("data"));
  if (!data) erros.push(`Data: "${get("data").trim()}" inválida (use AAAA-MM-DD ou DD/MM/AAAA).`);
  else if (hojeIso && data > hojeIso) erros.push("Data: não pode ser futura.");
  else if (!ehDomingo(data)) avisos.push("A data não cai num domingo — confira.");

  const matriculados = lerInteiroImportacao(get("matriculados"), "Matriculados", erros, { obrigatorio: true });
  const presentes = lerInteiroImportacao(get("presentes"), "Presentes", erros, { obrigatorio: true });
  let ausentes = lerInteiroImportacao(get("ausentes"), "Ausentes", erros);
  const visitantes = lerInteiroImportacao(get("visitantes"), "Visitantes", erros) || 0;
  const biblias = lerInteiroImportacao(get("biblias"), "Bíblias", erros);
  const revistas = lerInteiroImportacao(get("revistas"), "Revistas", erros);

  const oferta = converterValorMonetario(get("oferta"));
  if (Number.isNaN(oferta)) erros.push(`Oferta: "${get("oferta").trim()}" não é um valor válido.`);

  if (matriculados != null && presentes != null) {
    if (presentes > matriculados) erros.push(`Presentes (${presentes}) maior que matriculados (${matriculados}).`);
    else if (ausentes == null) ausentes = matriculados - presentes;
    else if (presentes + ausentes !== matriculados) erros.push(`Presentes + ausentes (${presentes + ausentes}) diferente de matriculados (${matriculados}).`);
  }
  const frequentes = (presentes || 0) + visitantes;
  if (biblias != null && biblias > frequentes) avisos.push(`Bíblias (${biblias}) acima do total de frequentes (${frequentes}).`);
  if (revistas != null && revistas > frequentes) avisos.push(`Revistas (${revistas}) acima do total de frequentes (${frequentes}).`);

  return {
    numero: bruta.numero || null,
    valido: erros.length === 0,
    erros, avisos,
    linha: {
      congregacao, turma, data, matriculados, presentes, ausentes, visitantes, biblias, revistas,
      oferta: oferta == null || Number.isNaN(oferta) ? null : oferta
    }
  };
}

// Texto do CSV -> linhas validadas. Erros "de arquivo" (cabeçalho sem as
// colunas mínimas, arquivo vazio, linhas demais) vêm em `erroGeral`.
function lerCsvImportacao(texto, hojeIso) {
  const registros = lerCsv(texto);
  if (registros.length < 2) return { erroGeral: "O arquivo precisa do cabeçalho e de ao menos uma linha de dados.", itens: [] };

  const cabecalho = registros[0].campos.map(canonicoDoCabecalho);
  const faltando = COLUNAS_OBRIGATORIAS_IMPORTACAO.filter(c => !cabecalho.includes(c));
  if (faltando.length > 0) {
    return { erroGeral: `Colunas obrigatórias ausentes no cabeçalho: ${faltando.join(", ")}.`, itens: [] };
  }
  if (registros.length - 1 > LIMITE_LINHAS_IMPORTACAO) {
    return { erroGeral: `O arquivo passa de ${LIMITE_LINHAS_IMPORTACAO} linhas — divida em partes.`, itens: [] };
  }

  const itens = registros.slice(1).map(reg => {
    const bruta = { numero: reg.numero };
    cabecalho.forEach((canonico, i) => { if (canonico && bruta[canonico] === undefined) bruta[canonico] = reg.campos[i]; });
    return validarLinhaImportacao(bruta, hojeIso);
  });
  return { erroGeral: null, itens };
}

// Linhas já em JSON (mesmos nomes de coluna) — alternativa ao CSV.
function validarLinhasImportacaoJson(linhas, hojeIso) {
  if (!Array.isArray(linhas) || linhas.length === 0) return { erroGeral: "Envie ao menos uma linha.", itens: [] };
  if (linhas.length > LIMITE_LINHAS_IMPORTACAO) return { erroGeral: `Mais de ${LIMITE_LINHAS_IMPORTACAO} linhas — divida em partes.`, itens: [] };
  return { erroGeral: null, itens: linhas.map((l, i) => validarLinhaImportacao({ ...l, numero: i + 1 }, hojeIso)) };
}

// ---------------------------------------------------------------
// Funções de banco (finas)
// ---------------------------------------------------------------

function mapearCaderneta(row) {
  if (!row) return null;
  return {
    cadernetaId: row.CadernetaId, licaoId: row.LicaoId, turmaId: row.TurmaId,
    biblias: row.Biblias, revistas: row.Revistas, observacao: row.Observacao, origem: row.Origem,
    matriculadosRegistrado: row.MatriculadosRegistrado,
    presentesImportado: row.PresentesImportado, ausentesImportado: row.AusentesImportado,
    visitantesImportado: row.VisitantesImportado,
    ofertaImportada: row.OfertaImportada != null ? Number(row.OfertaImportada) : null
  };
}

function hojeIsoLocal() {
  return require("./dataBrasilia").hojeBrasilia(); // Trava 6-B: dia de Brasília, não do servidor (UTC)
}

// Junta tudo de que as linhas de UMA lição dependem, com consultas em bloco
// (nunca uma por turma): turmas, chamada agregada, cadernetas, professores,
// pedidos de revista e catálogo do trimestre.
async function carregarLinhasDaLicao(pool, licao, { turmaId = null } = {}) {
  const trimestre = trimestreDaData(licao.data);
  const req = () => pool.request().input("c", sql.Int, licao.congregacaoId).input("l", sql.Int, licao.licaoId).input("t", sql.Int, turmaId);

  const turmas = await req().query(`
    SELECT t.TurmaId, t.Nome, t.FaixaEtaria, t.Ativa,
           (SELECT COUNT(*) FROM EbdAlunos a WHERE a.TurmaId = t.TurmaId AND a.Ativo = 1) AS MatriculadosAtuais
    FROM EbdTurmas t
    WHERE t.CongregacaoId = @c AND (@t IS NULL OR t.TurmaId = @t)
      AND (t.Ativa = 1
           OR EXISTS (SELECT 1 FROM EbdChamadas ch WHERE ch.LicaoId = @l AND ch.TurmaId = t.TurmaId)
           OR EXISTS (SELECT 1 FROM EbdCadernetas cd WHERE cd.LicaoId = @l AND cd.TurmaId = t.TurmaId))
    ORDER BY t.Nome
  `);
  if (turmas.recordset.length === 0) return [];

  const [chamadas, cadernetas, professores, pedidos, catalogo] = await Promise.all([
    req().query(`
      SELECT TurmaId,
             SUM(CASE WHEN Status = 'PRESENTE' THEN 1 ELSE 0 END) AS Presentes,
             SUM(CASE WHEN Status = 'AUSENTE' THEN 1 ELSE 0 END) AS Ausentes,
             SUM(CASE WHEN Status = 'VISITANTE' THEN 1 ELSE 0 END) AS Visitantes
      FROM EbdChamadas WHERE LicaoId = @l GROUP BY TurmaId
    `),
    req().query(`SELECT * FROM EbdCadernetas WHERE LicaoId = @l`),
    req().query(`
      SELECT p.TurmaId, p.MembroId, p.Principal, m.Nome
      FROM EbdTurmaProfessores p
      JOIN EbdTurmas t ON t.TurmaId = p.TurmaId
      JOIN MembroReferencia m ON m.MembroId = p.MembroId
      WHERE t.CongregacaoId = @c AND p.Ativo = 1
      ORDER BY p.Principal DESC, m.Nome
    `),
    req().input("tri", sql.NVarChar(10), trimestre).query(`
      SELECT p.TurmaId, i.Quantidade, r.Nome AS RevistaNome
      FROM EbdPedidosRevistas p
      JOIN EbdTurmas t ON t.TurmaId = p.TurmaId
      JOIN EbdPedidosRevistasItens i ON i.PedidoId = p.PedidoId
      JOIN EbdCatalogoRevistas r ON r.RevistaId = i.RevistaId
      WHERE t.CongregacaoId = @c AND p.Trimestre = @tri
      ORDER BY r.Nome
    `),
    req().input("tri", sql.NVarChar(10), trimestre).query(`
      SELECT Nome, FaixaEtaria FROM EbdCatalogoRevistas WHERE Trimestre = @tri AND Ativa = 1 ORDER BY Nome
    `)
  ]);

  const chamadaPorTurma = new Map(chamadas.recordset.map(r => [r.TurmaId, { presentes: r.Presentes, ausentes: r.Ausentes, visitantes: r.Visitantes }]));
  const cadernetaPorTurma = new Map(cadernetas.recordset.map(r => [r.TurmaId, mapearCaderneta(r)]));
  const catalogoDoTrimestre = catalogo.recordset.map(r => ({ nome: r.Nome, faixaEtaria: r.FaixaEtaria }));
  const agrupar = (recordset, mapear) => {
    const m = new Map();
    for (const r of recordset) {
      if (!m.has(r.TurmaId)) m.set(r.TurmaId, []);
      m.get(r.TurmaId).push(mapear(r));
    }
    return m;
  };
  const professoresPorTurma = agrupar(professores.recordset, r => ({ membroId: r.MembroId, nome: r.Nome, principal: r.Principal }));
  const itensPorTurma = agrupar(pedidos.recordset, r => ({ revistaNome: r.RevistaNome, quantidade: r.Quantidade }));

  return turmas.recordset.map(t => montarLinhaCaderneta({
    turma: { turmaId: t.TurmaId, nome: t.Nome, faixaEtaria: t.FaixaEtaria, ativa: t.Ativa },
    professores: professoresPorTurma.get(t.TurmaId) || [],
    revistaVigente: resolverRevistaVigente({
      trimestre, itensPedido: itensPorTurma.get(t.TurmaId) || [], catalogoDoTrimestre, faixaEtaria: t.FaixaEtaria
    }),
    matriculadosAtuais: t.MatriculadosAtuais,
    resumo: chamadaPorTurma.get(t.TurmaId) || {},
    caderneta: cadernetaPorTurma.get(t.TurmaId) || null
  }));
}

async function buscarOfertaDaLicao(pool, licaoId) {
  const r = await pool.request().input("l", sql.Int, licaoId).query(`SELECT Valor FROM EbdOfertas WHERE LicaoId = @l`);
  return r.recordset[0] ? Number(r.recordset[0].Valor) : null;
}

// Tela do domingo de uma congregação: todas as classes, com o total.
async function montarCadernetaDaLicao(pool, licaoId) {
  const licao = await ebdChamada.buscarLicaoPorId(pool, licaoId);
  if (!licao) return null;
  const [linhas, oferta] = await Promise.all([carregarLinhasDaLicao(pool, licao), buscarOfertaDaLicao(pool, licaoId)]);
  return montarCadernetaDoDomingo({ licao: { ...licao, data: paraIsoData(licao.data) }, linhas, ofertaLicao: oferta });
}

// Uma classe só (tela do professor).
async function montarLinhaDaTurma(pool, licaoId, turmaId) {
  const licao = await ebdChamada.buscarLicaoPorId(pool, licaoId);
  if (!licao) return null;
  const linhas = await carregarLinhasDaLicao(pool, licao, { turmaId });
  return { licao: { ...licao, data: paraIsoData(licao.data) }, linha: linhas[0] || null };
}

async function contarAlunosAtivos(pool, turmaId) {
  const r = await pool.request().input("t", sql.Int, turmaId).query(`SELECT COUNT(*) AS Total FROM EbdAlunos WHERE TurmaId = @t AND Ativo = 1`);
  return r.recordset[0].Total;
}

// Bíblias/Revistas de uma classe num domingo. Mesma regra da chamada: só
// com a lição ABERTA, e a turma tem que ser da congregação da lição.
// Grava junto a foto dos matriculados do momento. Caderneta importada é
// histórico: não se edita por aqui.
async function salvarCaderneta(pool, { licaoId, turmaId, biblias, revistas, observacao, registradoPorMembroId }) {
  const validacao = validarRegistroCaderneta({ biblias, revistas, observacao });
  if (!validacao.valido) return { sucesso: false, mensagem: validacao.mensagem };

  const licao = await ebdChamada.buscarLicaoPorId(pool, licaoId);
  const podeLancar = ebdChamada.podeLancarChamada(licao);
  if (!podeLancar.permitido) return { sucesso: false, mensagem: podeLancar.mensagem };

  const turma = await pool.request().input("id", sql.Int, turmaId).query(`SELECT TurmaId, CongregacaoId, Ativa FROM EbdTurmas WHERE TurmaId = @id`);
  if (turma.recordset.length === 0) return { sucesso: false, mensagem: "Turma não encontrada." };
  if (turma.recordset[0].CongregacaoId !== licao.congregacaoId) return { sucesso: false, mensagem: "Esta turma não pertence à congregação desta lição." };
  if (!turma.recordset[0].Ativa) return { sucesso: false, mensagem: "Esta turma está inativa." };

  const existente = await pool.request().input("l", sql.Int, licaoId).input("t", sql.Int, turmaId).query(`SELECT * FROM EbdCadernetas WHERE LicaoId = @l AND TurmaId = @t`);
  const anterior = mapearCaderneta(existente.recordset[0]);
  if (anterior && anterior.origem === ORIGEM_CADERNETA.IMPORTADA) {
    return { sucesso: false, mensagem: "Esta caderneta foi importada de registro antigo e não pode ser editada aqui." };
  }

  const v = validacao.valores;
  const matriculados = await contarAlunosAtivos(pool, turmaId);
  const r = pool.request()
    .input("l", sql.Int, licaoId).input("t", sql.Int, turmaId)
    .input("b", sql.Int, v.biblias).input("r", sql.Int, v.revistas).input("o", sql.NVarChar(500), v.observacao)
    .input("m", sql.Int, matriculados).input("por", sql.Int, registradoPorMembroId || null);

  let cadernetaId = anterior ? anterior.cadernetaId : null;
  if (anterior) {
    await r.query(`
      UPDATE EbdCadernetas SET Biblias = @b, Revistas = @r, Observacao = @o, MatriculadosRegistrado = @m,
             RegistradoPorMembroId = @por, AtualizadoEm = SYSUTCDATETIME()
      WHERE LicaoId = @l AND TurmaId = @t
    `);
  } else {
    // Trava 6-B: RegistroId de AuditLog é NOT NULL — o id da linha nova vem do
    // OUTPUT; antes ia nulo, e a auditoria de toda linha NOVA falhava calada.
    const inserida = await r.query(`
      INSERT INTO EbdCadernetas (LicaoId, TurmaId, Biblias, Revistas, Observacao, MatriculadosRegistrado, RegistradoPorMembroId)
      OUTPUT INSERTED.CadernetaId
      VALUES (@l, @t, @b, @r, @o, @m, @por)
    `);
    cadernetaId = inserida.recordset[0].CadernetaId;
  }

  await registrarAuditoria({
    tabela: "EbdCadernetas", registroId: cadernetaId, acao: "CADERNETA_SALVA",
    usuarioId: registradoPorMembroId,
    dadosAntes: anterior ? { biblias: anterior.biblias, revistas: anterior.revistas } : null,
    dadosDepois: { licaoId, turmaId, biblias: v.biblias, revistas: v.revistas, matriculados }
  });
  return { sucesso: true, mensagem: "✅ Caderneta da turma salva." };
}

// Ao fechar a lição, congela o número de matriculados de cada classe que
// fez chamada — sem isso a transferência/saída de um aluno mudaria o
// passado. Fail-soft (chamado por ebdChamada.fecharLicao): falhar aqui
// nunca pode impedir o fechamento da lição.
async function congelarMatriculadosDaLicao(pool, licaoId) {
  try {
    const turmas = await pool.request().input("l", sql.Int, licaoId).query(`
      SELECT DISTINCT ch.TurmaId FROM EbdChamadas ch WHERE ch.LicaoId = @l
      UNION
      SELECT cd.TurmaId FROM EbdCadernetas cd WHERE cd.LicaoId = @l AND cd.Origem = 'SISTEMA'
    `);
    for (const { TurmaId } of turmas.recordset) {
      const matriculados = await contarAlunosAtivos(pool, TurmaId);
      const atualizou = await pool.request().input("l", sql.Int, licaoId).input("t", sql.Int, TurmaId).input("m", sql.Int, matriculados).query(`
        UPDATE EbdCadernetas SET MatriculadosRegistrado = @m, AtualizadoEm = SYSUTCDATETIME()
        WHERE LicaoId = @l AND TurmaId = @t AND Origem = 'SISTEMA'
      `);
      if (atualizou.rowsAffected[0] === 0) {
        await pool.request().input("l", sql.Int, licaoId).input("t", sql.Int, TurmaId).input("m", sql.Int, matriculados).query(`
          IF NOT EXISTS (SELECT 1 FROM EbdCadernetas WHERE LicaoId = @l AND TurmaId = @t)
            INSERT INTO EbdCadernetas (LicaoId, TurmaId, MatriculadosRegistrado) VALUES (@l, @t, @m)
        `);
      }
    }
  } catch (e) {
    console.error("[CADERNETA] falha ao congelar matriculados da lição:", e.message);
  }
}

// ---- Relatório ----

function condicaoEscopo(request, { nomesCongregacoesPermitidas, congregacaoId }, alias = "c") {
  const condicoes = [];
  if (congregacaoId) {
    request.input("congId", sql.Int, congregacaoId);
    condicoes.push(`${alias}.CongregacaoId = @congId`);
  }
  if (Array.isArray(nomesCongregacoesPermitidas)) {
    if (nomesCongregacoesPermitidas.length === 0) return null; // escopo vazio: não vê nada
    const params = nomesCongregacoesPermitidas.map((nome, i) => {
      request.input(`cong${i}`, sql.NVarChar(150), nome);
      return `@cong${i}`;
    });
    condicoes.push(`${alias}.Nome IN (${params.join(",")})`);
  }
  return condicoes.length ? ` AND ${condicoes.join(" AND ")}` : "";
}

// Linhas (classe × domingo) do trimestre, no escopo dado. Uma classe só
// vira linha se lançou alguma coisa naquele domingo (chamada ou caderneta).
async function listarRegistrosDoTrimestre(pool, { trimestre, nomesCongregacoesPermitidas, congregacaoId }) {
  const intervalo = intervaloDoTrimestre(trimestre);
  const request = pool.request().input("ini", sql.Date, intervalo.inicio).input("fim", sql.Date, intervalo.fim);
  const escopo = condicaoEscopo(request, { nomesCongregacoesPermitidas, congregacaoId });
  if (escopo === null) return [];

  const result = await request.query(`
    SELECT a.AreaId, a.Nome AS AreaNome, c.CongregacaoId, c.Nome AS CongregacaoNome,
           t.TurmaId, t.Nome AS TurmaNome, t.FaixaEtaria, l.LicaoId, l.Data,
           ISNULL(ch.Presentes, 0) AS Presentes, ISNULL(ch.Ausentes, 0) AS AusentesMarcados, ISNULL(ch.Visitantes, 0) AS Visitantes,
           cd.CadernetaId, cd.Biblias, cd.Revistas, cd.Observacao, cd.Origem, cd.MatriculadosRegistrado,
           cd.PresentesImportado, cd.AusentesImportado, cd.VisitantesImportado, cd.OfertaImportada,
           (SELECT COUNT(*) FROM EbdAlunos al WHERE al.TurmaId = t.TurmaId AND al.Ativo = 1) AS MatriculadosAtuais
    FROM EbdLicoes l
    JOIN Congregacoes c ON c.CongregacaoId = l.CongregacaoId
    LEFT JOIN Areas a ON a.AreaId = c.AreaId
    JOIN EbdTurmas t ON t.CongregacaoId = c.CongregacaoId
    LEFT JOIN (
      SELECT LicaoId, TurmaId,
             SUM(CASE WHEN Status = 'PRESENTE' THEN 1 ELSE 0 END) AS Presentes,
             SUM(CASE WHEN Status = 'AUSENTE' THEN 1 ELSE 0 END) AS Ausentes,
             SUM(CASE WHEN Status = 'VISITANTE' THEN 1 ELSE 0 END) AS Visitantes
      FROM EbdChamadas
      WHERE LicaoId IN (SELECT LicaoId FROM EbdLicoes WHERE Data BETWEEN @ini AND @fim)
      GROUP BY LicaoId, TurmaId
    ) ch ON ch.LicaoId = l.LicaoId AND ch.TurmaId = t.TurmaId
    LEFT JOIN EbdCadernetas cd ON cd.LicaoId = l.LicaoId AND cd.TurmaId = t.TurmaId
    WHERE l.Data BETWEEN @ini AND @fim
      AND (ch.TurmaId IS NOT NULL OR cd.CadernetaId IS NOT NULL)
      ${escopo}
    ORDER BY a.Nome, c.Nome, t.Nome, l.Data
  `);

  return result.recordset.map(row => {
    const linha = montarLinhaCaderneta({
      turma: { turmaId: row.TurmaId, nome: row.TurmaNome, faixaEtaria: row.FaixaEtaria, ativa: true },
      matriculadosAtuais: row.MatriculadosAtuais,
      resumo: { presentes: row.Presentes, ausentes: row.AusentesMarcados, visitantes: row.Visitantes },
      caderneta: row.CadernetaId ? mapearCaderneta(row) : null
    });
    return {
      areaId: row.AreaId, areaNome: row.AreaNome, congregacaoId: row.CongregacaoId, congregacaoNome: row.CongregacaoNome,
      turmaId: row.TurmaId, turmaNome: row.TurmaNome, faixaEtaria: row.FaixaEtaria,
      licaoId: row.LicaoId, data: paraIsoData(row.Data),
      matriculados: linha.matriculados, presentes: linha.presentes, ausentes: linha.ausentes, visitantes: linha.visitantes,
      biblias: linha.biblias, revistas: linha.revistas, ofertaImportada: linha.ofertaImportada
    };
  });
}

async function somarOfertasDoTrimestre(pool, { trimestre, nomesCongregacoesPermitidas, congregacaoId }) {
  const intervalo = intervaloDoTrimestre(trimestre);
  const request = pool.request().input("ini", sql.Date, intervalo.inicio).input("fim", sql.Date, intervalo.fim);
  const escopo = condicaoEscopo(request, { nomesCongregacoesPermitidas, congregacaoId });
  if (escopo === null) return {};
  const result = await request.query(`
    SELECT c.CongregacaoId, SUM(o.Valor) AS Total
    FROM EbdOfertas o
    JOIN EbdLicoes l ON l.LicaoId = o.LicaoId
    JOIN Congregacoes c ON c.CongregacaoId = l.CongregacaoId
    WHERE l.Data BETWEEN @ini AND @fim ${escopo}
    GROUP BY c.CongregacaoId
  `);
  const mapa = {};
  for (const r of result.recordset) mapa[r.CongregacaoId] = Number(r.Total);
  return mapa;
}

async function contarLicoesAbertas(pool, { congregacaoId, trimestre }) {
  const intervalo = intervaloDoTrimestre(trimestre);
  const r = await pool.request().input("c", sql.Int, congregacaoId).input("ini", sql.Date, intervalo.inicio).input("fim", sql.Date, intervalo.fim).query(`
    SELECT COUNT(*) AS Total FROM EbdLicoes WHERE CongregacaoId = @c AND Data BETWEEN @ini AND @fim AND Status = 'ABERTA'
  `);
  return r.recordset[0].Total;
}

function mapearFechamento(row) {
  if (!row) return null;
  return {
    fechamentoId: row.FechamentoId, congregacaoId: row.CongregacaoId, trimestre: row.Trimestre, origem: row.Origem,
    licoesAbertas: row.LicoesAbertas, versao: row.Versao, fechadoEm: row.FechadoEm, refeitoEm: row.RefeitoEm,
    snapshot: lerSnapshot(row.Snapshot)
  };
}

async function buscarFechamento(pool, congregacaoId, trimestre) {
  const r = await pool.request().input("c", sql.Int, congregacaoId).input("t", sql.NVarChar(10), trimestre).query(`
    SELECT * FROM EbdFechamentosTrimestrais WHERE CongregacaoId = @c AND Trimestre = @t
  `);
  return mapearFechamento(r.recordset[0]);
}

// Fechamentos (com a foto) de um trimestre, dentro do escopo — é o que o
// relatório usa no lugar do cálculo ao vivo.
async function buscarFechamentosDoTrimestre(pool, { trimestre, nomesCongregacoesPermitidas, congregacaoId }) {
  const request = pool.request().input("t", sql.NVarChar(10), trimestre);
  const escopo = condicaoEscopo(request, { nomesCongregacoesPermitidas, congregacaoId });
  if (escopo === null) return [];
  const r = await request.query(`
    SELECT f.* FROM EbdFechamentosTrimestrais f JOIN Congregacoes c ON c.CongregacaoId = f.CongregacaoId
    WHERE f.Trimestre = @t ${escopo}
  `);
  return r.recordset.map(mapearFechamento);
}

async function listarFechamentos(pool, { congregacaoId, nomesCongregacoesPermitidas, trimestre } = {}) {
  const request = pool.request();
  const escopo = condicaoEscopo(request, { nomesCongregacoesPermitidas, congregacaoId });
  if (escopo === null) return [];
  let filtroTri = "";
  if (trimestre) { request.input("t", sql.NVarChar(10), trimestre); filtroTri = " AND f.Trimestre = @t"; }
  const r = await request.query(`
    SELECT f.FechamentoId, f.CongregacaoId, c.Nome AS CongregacaoNome, f.Trimestre, f.Origem, f.LicoesAbertas, f.Versao, f.FechadoEm, f.RefeitoEm
    FROM EbdFechamentosTrimestrais f JOIN Congregacoes c ON c.CongregacaoId = f.CongregacaoId
    WHERE 1 = 1 ${escopo}${filtroTri}
    ORDER BY f.Trimestre DESC, c.Nome
  `);
  return r.recordset.map(x => ({
    fechamentoId: x.FechamentoId, congregacaoId: x.CongregacaoId, congregacaoNome: x.CongregacaoNome, trimestre: x.Trimestre,
    origem: x.Origem, licoesAbertas: x.LicoesAbertas, versao: x.Versao, fechadoEm: x.FechadoEm, refeitoEm: x.RefeitoEm
  }));
}

// Relatório do Superintendente. Congregação com fechamento usa a foto
// congelada; sem fechamento, calcula ao vivo e marca `fonte: AO_VIVO` (e
// `parcial` enquanto o trimestre não terminou).
async function gerarRelatorioTrimestre(pool, { trimestre, nomesCongregacoesPermitidas, congregacaoId, hojeIso = hojeIsoLocal() }) {
  const escopo = { nomesCongregacoesPermitidas, congregacaoId };
  const fechamentos = await buscarFechamentosDoTrimestre(pool, { trimestre, ...escopo });
  const fechadasPorCong = new Map(fechamentos.filter(f => f.snapshot).map(f => [f.congregacaoId, f]));

  const [registros, ofertas] = await Promise.all([listarRegistrosDoTrimestre(pool, { trimestre, ...escopo }), somarOfertasDoTrimestre(pool, { trimestre, ...escopo })]);
  const aoVivo = registros.filter(r => !fechadasPorCong.has(r.congregacaoId));

  const porCong = new Map();
  for (const r of aoVivo) {
    if (!porCong.has(r.congregacaoId)) porCong.set(r.congregacaoId, []);
    porCong.get(r.congregacaoId).push(r);
  }
  const nos = [];
  for (const [id, lista] of porCong) {
    nos.push({ ...montarNoCongregacao(lista, { ofertaSistema: ofertas[id] || 0 }), fonte: "AO_VIVO" });
  }
  for (const f of fechadasPorCong.values()) {
    nos.push({
      ...f.snapshot.congregacao, fonte: "FECHAMENTO",
      fechamento: { origem: f.origem, versao: f.versao, fechadoEm: f.fechadoEm, refeitoEm: f.refeitoEm, licoesAbertas: f.licoesAbertas }
    });
  }

  return {
    trimestre, periodo: intervaloDoTrimestre(trimestre),
    parcial: !trimestreEncerrado(trimestre, hojeIso),
    ...agruparNosPorArea(nos)
  };
}

// Fecha (ou refaz) o trimestre de UMA congregação. `origem` AUTOMATICO é a
// rotina diária; `refazer` só existe no caminho manual.
async function fecharTrimestre(pool, { congregacaoId, trimestre, origem, fechadoPorMembroId = null, refazer = false, hojeIso = hojeIsoLocal() }) {
  const cong = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT CongregacaoId, Nome FROM Congregacoes WHERE CongregacaoId = @id`);
  if (cong.recordset.length === 0) return { sucesso: false, mensagem: "Congregação não encontrada." };

  const existente = ebdRevistas.trimestreValido(trimestre) ? await buscarFechamento(pool, congregacaoId, trimestre) : null;
  const registros = ebdRevistas.trimestreValido(trimestre) ? await listarRegistrosDoTrimestre(pool, { trimestre, congregacaoId }) : [];
  const decisao = decidirFechamento({ existente, trimestre, hojeIso, origem, refazer, temRegistros: registros.length > 0 });
  if (!decisao.permitido) return { sucesso: false, mensagem: decisao.mensagem };

  const ofertas = await somarOfertasDoTrimestre(pool, { trimestre, congregacaoId });
  const licoesAbertas = await contarLicoesAbertas(pool, { congregacaoId, trimestre });
  const no = montarNoCongregacao(registros, { ofertaSistema: ofertas[congregacaoId] || 0 });
  const snapshot = JSON.stringify(montarSnapshotFechamento({ no, trimestre, licoesAbertas }));

  const r = pool.request()
    .input("c", sql.Int, congregacaoId).input("t", sql.NVarChar(10), trimestre)
    .input("s", sql.NVarChar(sql.MAX), snapshot).input("a", sql.Int, licoesAbertas)
    .input("por", sql.Int, fechadoPorMembroId).input("o", sql.NVarChar(10), origem);

  let fechamentoId = existente ? existente.fechamentoId : null;
  if (existente) {
    await r.query(`
      UPDATE EbdFechamentosTrimestrais
      SET Snapshot = @s, LicoesAbertas = @a, Versao = Versao + 1, RefeitoPorMembroId = @por, RefeitoEm = SYSUTCDATETIME()
      WHERE CongregacaoId = @c AND Trimestre = @t
    `);
  } else {
    // Trava 6-B: RegistroId de AuditLog é NOT NULL — o id da linha nova vem do
    // OUTPUT; antes ia nulo, e a auditoria de toda linha NOVA falhava calada.
    const inserido = await r.query(`
      INSERT INTO EbdFechamentosTrimestrais (CongregacaoId, Trimestre, Origem, Snapshot, LicoesAbertas, FechadoPorMembroId)
      OUTPUT INSERTED.FechamentoId
      VALUES (@c, @t, @o, @s, @a, @por)
    `);
    fechamentoId = inserido.recordset[0].FechamentoId;
  }

  await registrarAuditoria({
    tabela: "EbdFechamentosTrimestrais", registroId: fechamentoId,
    acao: existente ? "TRIMESTRE_REFEITO" : (origem === ORIGEM_FECHAMENTO.AUTOMATICO ? "TRIMESTRE_FECHADO_AUTO" : "TRIMESTRE_FECHADO"),
    usuarioId: fechadoPorMembroId,
    dadosAntes: existente && existente.snapshot ? { versao: existente.versao, totais: existente.snapshot.congregacao.totais } : null,
    dadosDepois: { congregacaoId, trimestre, licoesAbertas, totais: no.totais }
  });

  const aviso = licoesAbertas > 0 ? ` Atenção: ${licoesAbertas} lição(ões) do trimestre ainda estão abertas.` : "";
  return { sucesso: true, mensagem: `✅ Trimestre ${trimestre} ${existente ? "refeito" : "fechado"}.${aviso}`, licoesAbertas };
}

// Rotina diária (api/EbdFechamentoAutomatico): fecha os trimestres recém
// encerrados das congregações que ainda não têm fechamento. Uma congregação
// com problema não impede as outras.
async function fecharTrimestresEncerrados(pool, { hojeIso = hojeIsoLocal() } = {}) {
  const resumo = { trimestres: [], fechados: 0, ignorados: 0, falhas: 0 };
  for (const trimestre of trimestresParaFechamentoAutomatico(hojeIso)) {
    resumo.trimestres.push(trimestre);
    const intervalo = intervaloDoTrimestre(trimestre);
    const candidatas = await pool.request().input("ini", sql.Date, intervalo.inicio).input("fim", sql.Date, intervalo.fim).input("t", sql.NVarChar(10), trimestre).query(`
      SELECT DISTINCT l.CongregacaoId FROM EbdLicoes l
      WHERE l.Data BETWEEN @ini AND @fim
        AND NOT EXISTS (SELECT 1 FROM EbdFechamentosTrimestrais f WHERE f.CongregacaoId = l.CongregacaoId AND f.Trimestre = @t)
    `);
    for (const { CongregacaoId } of candidatas.recordset) {
      try {
        const r = await fecharTrimestre(pool, { congregacaoId: CongregacaoId, trimestre, origem: ORIGEM_FECHAMENTO.AUTOMATICO, hojeIso });
        if (r.sucesso) resumo.fechados++; else resumo.ignorados++;
      } catch (e) {
        resumo.falhas++;
        console.error(`[CADERNETA] falha ao fechar ${trimestre} da congregação ${CongregacaoId}:`, e.message);
      }
    }
  }
  return resumo;
}

// ---- Importação ----

// Só lê e confere — nada é gravado. Resolve congregação/turma por nome
// (sem acento nem maiúscula), confere o escopo e os conflitos com dado que
// já existe no sistema. `podeCongregacao(nome)` vem da rota (escopo).
async function prepararImportacao(pool, itens, { podeCongregacao }) {
  const congs = await pool.request().query(`SELECT CongregacaoId, Nome FROM Congregacoes`);
  const congPorNome = new Map(congs.recordset.map(c => [normalizarTexto(c.Nome), c]));
  const turmasCache = new Map();
  const licaoCache = new Map();
  const fechamentosVistos = new Map();
  const vistos = new Set();

  async function turmasDe(congregacaoId) {
    if (!turmasCache.has(congregacaoId)) {
      const r = await pool.request().input("c", sql.Int, congregacaoId).query(`SELECT TurmaId, Nome FROM EbdTurmas WHERE CongregacaoId = @c`);
      turmasCache.set(congregacaoId, new Map(r.recordset.map(t => [normalizarTexto(t.Nome), t.TurmaId])));
    }
    return turmasCache.get(congregacaoId);
  }
  async function licaoDe(congregacaoId, data) {
    const chave = `${congregacaoId}|${data}`;
    if (!licaoCache.has(chave)) licaoCache.set(chave, await ebdChamada.buscarLicaoPorCongregacaoData(pool, congregacaoId, data));
    return licaoCache.get(chave);
  }

  const resultado = [];
  for (const item of itens) {
    const erros = [...item.erros];
    const avisos = [...item.avisos];
    let acao = null, congregacaoId = null, turmaId = null, licaoId = null;

    if (item.valido) {
      const cong = congPorNome.get(normalizarTexto(item.linha.congregacao));
      if (!cong) erros.push(`Congregação "${item.linha.congregacao}" não encontrada.`);
      else if (!podeCongregacao(cong.Nome)) erros.push(`Congregação "${cong.Nome}" fora do seu escopo de atuação.`);
      else {
        congregacaoId = cong.CongregacaoId;
        turmaId = (await turmasDe(congregacaoId)).get(normalizarTexto(item.linha.turma)) || null;
        if (!turmaId) erros.push(`Turma "${item.linha.turma}" não cadastrada em ${cong.Nome} — cadastre a turma antes de importar.`);
      }
    }

    if (erros.length === 0 && congregacaoId && turmaId) {
      const chave = `${congregacaoId}|${item.linha.data}|${turmaId}`;
      if (vistos.has(chave)) erros.push("Linha repetida no arquivo (mesma congregação, data e turma).");
      vistos.add(chave);

      const licao = await licaoDe(congregacaoId, item.linha.data);
      acao = "CRIAR";
      if (licao) {
        licaoId = licao.licaoId;
        const [chamada, caderneta, oferta] = await Promise.all([
          pool.request().input("l", sql.Int, licaoId).input("t", sql.Int, turmaId).query(`SELECT COUNT(*) AS Total FROM EbdChamadas WHERE LicaoId = @l AND TurmaId = @t`),
          pool.request().input("l", sql.Int, licaoId).input("t", sql.Int, turmaId).query(`SELECT Origem FROM EbdCadernetas WHERE LicaoId = @l AND TurmaId = @t`),
          buscarOfertaDaLicao(pool, licaoId)
        ]);
        // Trava 6-B: lição ABERTA é domingo em andamento no sistema — uma
        // caderneta IMPORTADA ali escondia a chamada lançada depois (a linha
        // da caderneta passa a ler só os números importados) e travava o
        // salvar da caderneta do sistema.
        if (licao.status === "ABERTA") erros.push("A lição desta data está aberta no sistema (a chamada pode estar sendo lançada) — feche a lição antes de importar o registro antigo.");
        else if (chamada.recordset[0].Total > 0) erros.push("Esta turma já tem chamada lançada no sistema nesta data — não dá pra sobrepor com registro antigo.");
        else if (caderneta.recordset[0] && caderneta.recordset[0].Origem === ORIGEM_CADERNETA.SISTEMA) erros.push("Esta turma já tem caderneta do sistema nesta data.");
        else if (caderneta.recordset[0]) { acao = "ATUALIZAR"; avisos.push("Já existia uma caderneta importada nesta data — será substituída."); }
        if (oferta != null && item.linha.oferta) erros.push("A lição já tem oferta registrada no financeiro da EBD (v6.7) — deixe a oferta em branco para não contar duas vezes.");
      }
      // Trava 6-B: trimestre já fechado tem a foto congelada — sem refazer o
      // fechamento, o relatório não enxerga a caderneta importada.
      const trimestre = trimestreDaData(item.linha.data);
      const chaveFechamento = `${congregacaoId}|${trimestre}`;
      if (trimestre && !fechamentosVistos.has(chaveFechamento)) fechamentosVistos.set(chaveFechamento, await buscarFechamento(pool, congregacaoId, trimestre));
      if (trimestre && fechamentosVistos.get(chaveFechamento)) avisos.push(`O trimestre ${trimestre} já foi fechado nesta congregação — depois de importar, use "Refazer" no Relatório do Superintendente para o fechamento incluir esta caderneta.`);
    }

    resultado.push({ numero: item.numero, linha: item.linha, erros, avisos, valido: erros.length === 0, acao: erros.length === 0 ? acao : null, congregacaoId, turmaId });
  }
  return resultado;
}

// Grava tudo numa transação: ou entra o arquivo inteiro, ou nada.
async function executarImportacao(pool, itens, { importadoPorMembroId }) {
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  const resumo = { cadernetasCriadas: 0, cadernetasAtualizadas: 0, licoesCriadas: 0 };
  try {
    const licoes = new Map();
    for (const item of itens) {
      const chave = `${item.congregacaoId}|${item.linha.data}`;
      if (!licoes.has(chave)) {
        const existente = await new sql.Request(transaction).input("c", sql.Int, item.congregacaoId).input("d", sql.Date, item.linha.data)
          .query(`SELECT LicaoId FROM EbdLicoes WHERE CongregacaoId = @c AND Data = @d`);
        if (existente.recordset[0]) {
          licoes.set(chave, existente.recordset[0].LicaoId);
        } else {
          const nova = await new sql.Request(transaction).input("c", sql.Int, item.congregacaoId).input("d", sql.Date, item.linha.data).input("por", sql.Int, importadoPorMembroId || null)
            .query(`
              INSERT INTO EbdLicoes (CongregacaoId, Data, Status, AbertaPorMembroId, FechadaPorMembroId, FechadaEm)
              OUTPUT INSERTED.LicaoId
              VALUES (@c, @d, 'FECHADA', @por, @por, SYSUTCDATETIME())
            `);
          licoes.set(chave, nova.recordset[0].LicaoId);
          resumo.licoesCriadas++;
        }
      }
      const licaoId = licoes.get(chave);
      const l = item.linha;
      const req = new sql.Request(transaction)
        .input("l", sql.Int, licaoId).input("t", sql.Int, item.turmaId)
        .input("b", sql.Int, l.biblias).input("r", sql.Int, l.revistas)
        .input("m", sql.Int, l.matriculados).input("p", sql.Int, l.presentes).input("a", sql.Int, l.ausentes).input("v", sql.Int, l.visitantes)
        .input("o", sql.Decimal(14, 2), l.oferta).input("por", sql.Int, importadoPorMembroId || null);
      if (item.acao === "ATUALIZAR") {
        await req.query(`
          UPDATE EbdCadernetas SET Biblias = @b, Revistas = @r, MatriculadosRegistrado = @m, PresentesImportado = @p,
                 AusentesImportado = @a, VisitantesImportado = @v, OfertaImportada = @o, RegistradoPorMembroId = @por, AtualizadoEm = SYSUTCDATETIME()
          WHERE LicaoId = @l AND TurmaId = @t AND Origem = 'IMPORTADA'
        `);
        resumo.cadernetasAtualizadas++;
      } else {
        await req.query(`
          INSERT INTO EbdCadernetas (LicaoId, TurmaId, Biblias, Revistas, Origem, MatriculadosRegistrado, PresentesImportado,
                                     AusentesImportado, VisitantesImportado, OfertaImportada, RegistradoPorMembroId)
          VALUES (@l, @t, @b, @r, 'IMPORTADA', @m, @p, @a, @v, @o, @por)
        `);
        resumo.cadernetasCriadas++;
      }
    }
    await transaction.commit();
  } catch (e) {
    await transaction.rollback();
    throw e;
  }

  await registrarAuditoria({
    tabela: "EbdCadernetas", registroId: 0, acao: "CADERNETAS_IMPORTADAS", // lote: 0 = vários registros (mesma convenção de ImportarPessoas)
    usuarioId: importadoPorMembroId, dadosAntes: null, dadosDepois: resumo
  });
  return resumo;
}

// Ponto único usado pela rota: confere, e só grava se não houver nenhum erro.
async function importarCadernetas(pool, { itens, simular, importadoPorMembroId, podeCongregacao }) {
  const preparados = await prepararImportacao(pool, itens, { podeCongregacao });
  const comErro = preparados.filter(p => !p.valido).length;
  const base = { total: preparados.length, validas: preparados.length - comErro, comErro, itens: preparados };
  if (comErro > 0) return { sucesso: false, simulado: true, mensagem: `Nada foi importado: ${comErro} linha(s) com erro. Corrija e envie de novo.`, ...base };
  if (simular) return { sucesso: true, simulado: true, mensagem: `Simulação ok: ${preparados.length} linha(s) prontas para importar.`, ...base };
  const resumo = await executarImportacao(pool, preparados, { importadoPorMembroId });
  return { sucesso: true, simulado: false, mensagem: `✅ Importação concluída: ${resumo.cadernetasCriadas} criada(s), ${resumo.cadernetasAtualizadas} substituída(s).`, resumo, ...base };
}

module.exports = {
  ORIGEM_CADERNETA, ORIGEM_FECHAMENTO, CARENCIA_FECHAMENTO_AUTOMATICO_DIAS, LIMITE_LINHAS_IMPORTACAO,
  // Lógica pura
  dataIsoValida, paraIsoData, trimestreDaData, intervaloDoTrimestre, trimestreAnterior, trimestreEncerrado,
  trimestresParaFechamentoAutomatico,
  validarRegistroCaderneta, resolverRevistaVigente, montarLinhaCaderneta, somarLinhas, montarCadernetaDoDomingo,
  totaisDeTurma, somarTotais, montarNoCongregacao, agruparNosPorArea, consolidarRelatorio,
  montarSnapshotFechamento, lerSnapshot, decidirFechamento,
  lerCsv, lerCsvImportacao, validarLinhaImportacao, validarLinhasImportacaoJson,
  converterDataImportacao, converterValorMonetario, canonicoDoCabecalho,
  // Banco
  montarCadernetaDaLicao, montarLinhaDaTurma, salvarCaderneta, congelarMatriculadosDaLicao,
  listarRegistrosDoTrimestre, gerarRelatorioTrimestre, buscarFechamento, listarFechamentos,
  fecharTrimestre, fecharTrimestresEncerrados, importarCadernetas
};
