// shared/ministerioMenores.js (v7.7 — Habilitação para Ministério com Menores)
//
// Lei 14.811/2024 (art. 59-A do ECA, em vigor desde 12/01/2024): quem faz atividade com crianças e adolescentes — inclusive voluntário — precisa ter ficha
// cadastral e certidão de antecedentes criminais atualizadas, com atualização semestral. Regimento Art. 133 §5º (vistoria e dever de auto-denúncia).
//
// Este módulo é a REGRA, pura (sem banco): decide se uma pessoa está apta a servir com menores, o que a bloqueia, quando cada documento vence, se uma sala
// tem adultos suficientes e o que cada aviso diz. O banco (shared/ministerioMenoresDb.js) só reúne os fatos e grava o que aqui se decide.
//
// Princípios (os mesmos da v5.7): o status NUNCA é digitado — é calculado na leitura, com a data de hoje; vencimento não depende de job para valer; a escala
// é bloqueada na hora em que se tenta escalar, e a rotina diária só limpa o que já estava escalado.
const crypto = require("crypto");
const cal = require("./calendario");
const vol = require("./voluntariado");
const { inteiroPositivo } = require("./setoresTecnicos");

// ---------------------------------------------------------------
// Prazos e números (todos configuráveis em Catálogos → Prazos; estes são os padrões).
// ---------------------------------------------------------------

const ANTECEDENTES_DIAS_PADRAO = 180;     // a certidão vale 180 dias contados da EMISSÃO (atualização semestral)
const TREINAMENTO_DIAS_PADRAO = 730;      // quando o treinamento é atestado à mão (sem trilha de formação): 2 anos
const FICHA_DIAS_PADRAO = 180;            // a ficha cadastral é reconfirmada a cada semestre
const ADULTOS_MINIMOS_PADRAO = 2;         // regra dos dois adultos
const ALERTAS_DIAS = [60, 30, 15];        // a renovação leva dias para sair: avisar no dia do vencimento é inútil
const SALA_ALERTA_DIAS_PADRAO = 7;        // quantos dias à frente a rotina confere as salas
const AUTODENUNCIA_LEMBRETE_DIAS_PADRAO = 1;
const MAIORIDADE = vol.MAIORIDADE;

const SIGLAS_PRAZO = {
  antecedentesDias: "HABILITACAO_ANTECEDENTES_DIAS",
  treinamentoDias: "HABILITACAO_TREINAMENTO_DIAS",
  fichaDias: "HABILITACAO_FICHA_DIAS",
  adultosMinimos: "MENORES_ADULTOS_MINIMOS",
  salaAlertaDias: "MENORES_SALA_ALERTA_DIAS",
  autodenunciaLembreteDias: "MENORES_AUTODENUNCIA_LEMBRETE_DIAS"
};

// A faixa etária da equipe define quantas crianças um adulto pode acompanhar (padrões de seguradoras e de políticas de proteção; ajustáveis em Prazos).
const FAIXAS = {
  BERCARIO:     { rotulo: "Berçário (0 a 2 anos)",        sigla: "MENORES_CRIANCAS_POR_ADULTO_BERCARIO",     padrao: 3 },
  MATERNAL:     { rotulo: "Maternal (3 a 5 anos)",        sigla: "MENORES_CRIANCAS_POR_ADULTO_MATERNAL",     padrao: 5 },
  INFANTIL:     { rotulo: "Infantil (6 a 9 anos)",        sigla: "MENORES_CRIANCAS_POR_ADULTO_INFANTIL",     padrao: 8 },
  JUNIORES:     { rotulo: "Juniores (10 a 12 anos)",      sigla: "MENORES_CRIANCAS_POR_ADULTO_JUNIORES",     padrao: 10 },
  ADOLESCENTES: { rotulo: "Adolescentes (13 a 17 anos)",  sigla: "MENORES_CRIANCAS_POR_ADULTO_ADOLESCENTES", padrao: 12 }
};
const CODIGOS_FAIXA = Object.keys(FAIXAS);

// As duas certidões criminais que a Lei pede (a distribuição cível é informativa).
const CERTIDOES_CRIMINAIS = ["ANTECEDENTES_FEDERAL", "ANTECEDENTES_ESTADUAL"];
const ROTULO_CERTIDAO = { ANTECEDENTES_FEDERAL: "antecedentes criminais federais (Polícia Federal)", ANTECEDENTES_ESTADUAL: "antecedentes criminais estaduais (Tribunal de Justiça)" };

const MAX_CRIANCAS_POR_SALA = 200;
const MAX_OBSERVACAO = 300;

const limpar = (v) => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const temMarca = (s) => /[<>]/.test(s);
const sha256 = (txt) => crypto.createHash("sha256").update(txt).digest("hex");

// ---------------------------------------------------------------
// Datas ('YYYY-MM-DD', sempre em UTC: o resultado não pode depender do fuso do servidor).
// ---------------------------------------------------------------

function paraIso(v) {
  if (v == null || v === "") return null;
  const s = v instanceof Date ? (Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10)) : String(v).slice(0, 10);
  return cal.dataIsoValida(s) ? s : null;
}
function somarDiasIso(iso, dias) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}
function somarMesesIso(iso, meses) {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth(), Math.min(d, ultimoDia))).toISOString().slice(0, 10);
}
// Dias de `deIso` até `ateIso` (positivo = ainda falta; negativo = já passou).
function diasEntreIso(deIso, ateIso) {
  const [a1, m1, d1] = deIso.split("-").map(Number);
  const [a2, m2, d2] = ateIso.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}
// Dias desde 01/01/2026: um número pequeno e estável para compor a referência dos avisos (cada ciclo de validade tem a sua).
function ordinalDeIso(iso) { return diasEntreIso("2026-01-01", iso); }

// Prazo configurado com limites sãos (o leitor de Prazos já limita a 1..3650; aqui só o padrão quando vier lixo).
function prazoOuPadrao(valor, padrao) { return Number.isInteger(valor) && valor >= 1 ? valor : padrao; }
// A Lei pede atualização SEMESTRAL e o Regimento, dois adultos: o prazo das certidões e da ficha pode ser mais CURTO que o padrão, nunca mais longo (teto de 180 dias), e o
// mínimo de adultos nunca fica abaixo de dois. O treinamento tem teto de 3 anos (o padrão internacional é de 2 a 3).
function prazosEfetivos(p = {}) {
  return {
    antecedentesDias: Math.min(ANTECEDENTES_DIAS_PADRAO, prazoOuPadrao(p.antecedentesDias, ANTECEDENTES_DIAS_PADRAO)),
    treinamentoDias: Math.min(1095, prazoOuPadrao(p.treinamentoDias, TREINAMENTO_DIAS_PADRAO)),
    fichaDias: Math.min(FICHA_DIAS_PADRAO, prazoOuPadrao(p.fichaDias, FICHA_DIAS_PADRAO)),
    adultosMinimos: Math.max(ADULTOS_MINIMOS_PADRAO, prazoOuPadrao(p.adultosMinimos, ADULTOS_MINIMOS_PADRAO))
  };
}

// ---------------------------------------------------------------
// Antecedentes: vêm do Termo de Vistoria da v7.6 (hash + data de emissão de cada certidão). Vale a ÚLTIMA vistoria não anulada.
// ---------------------------------------------------------------

// vistoria: { vistoriaId, resultado, dataVerificacao, documentos:[{ tipo, dataEmissao }] } | null
// situacao: AUSENTE | COM_RESTRICAO | INCOMPLETO | VENCIDO | VIGENTE
function avaliarAntecedentes(vistoria, { hoje, validadeDias = ANTECEDENTES_DIAS_PADRAO }) {
  if (!vistoria) return { situacao: "AUSENTE", validoAte: null, emitidaEm: null, faltam: [...CERTIDOES_CRIMINAIS], vistoriaId: null };
  const base = { vistoriaId: vistoria.vistoriaId == null ? null : vistoria.vistoriaId, faltam: [] };
  if (vistoria.resultado !== "SEM_RESTRICAO") return { ...base, situacao: "COM_RESTRICAO", validoAte: null, emitidaEm: null };
  // De cada tipo de certidão criminal vale a emitida mais recentemente; a vistoria vence quando a mais antiga dessas vence.
  const maisNova = new Map();
  for (const d of vistoria.documentos || []) {
    const emissao = paraIso(d && d.dataEmissao);
    if (!d || !CERTIDOES_CRIMINAIS.includes(d.tipo) || !emissao) continue;
    if (!maisNova.has(d.tipo) || emissao > maisNova.get(d.tipo)) maisNova.set(d.tipo, emissao);
  }
  const faltam = CERTIDOES_CRIMINAIS.filter((t) => !maisNova.has(t));
  if (faltam.length) return { ...base, situacao: "INCOMPLETO", validoAte: null, emitidaEm: null, faltam };
  const emitidaEm = [...maisNova.values()].sort()[0];
  const validoAte = somarDiasIso(emitidaEm, validadeDias);
  return { ...base, situacao: hoje > validoAte ? "VENCIDO" : "VIGENTE", validoAte, emitidaEm };
}

// ---------------------------------------------------------------
// Treinamento de proteção: pela trilha de formação (v6.9) quando há requisito configurado; senão, atestado à mão com validade.
// ---------------------------------------------------------------

// entrada: { modo: "TRILHA", situacao, validoAte } | { modo: "MANUAL", atestadoEm }
// situacao do resultado: AUSENTE | VENCIDO | VIGENTE (a trilha VENCENDO ainda vale)
function avaliarTreinamento(entrada, { hoje, validadeDias = TREINAMENTO_DIAS_PADRAO }) {
  if (!entrada) return { situacao: "AUSENTE", modo: "MANUAL", validoAte: null };
  if (entrada.modo === "TRILHA") {
    const validoAte = paraIso(entrada.validoAte);
    if (entrada.situacao === "VIGENTE" || entrada.situacao === "VENCENDO") return { situacao: "VIGENTE", modo: "TRILHA", validoAte };
    if (entrada.situacao === "VENCIDA") return { situacao: "VENCIDO", modo: "TRILHA", validoAte };
    return { situacao: "AUSENTE", modo: "TRILHA", validoAte: null };
  }
  const atestado = paraIso(entrada.atestadoEm);
  if (!atestado) return { situacao: "AUSENTE", modo: "MANUAL", validoAte: null };
  const validoAte = somarDiasIso(atestado, validadeDias);
  return { situacao: hoje > validoAte ? "VENCIDO" : "VIGENTE", modo: "MANUAL", validoAte };
}

// ---------------------------------------------------------------
// Aptidão para servir com menores.
// ---------------------------------------------------------------

const ROTULO_BLOQUEIO = {
  FORA_DE_COMUNHAO: "Fora de plena comunhão",
  SEM_DATA_NASCIMENTO: "Cadastro sem data de nascimento",
  AUTO_DENUNCIA_EM_ANALISE: "Comunicação à Diretoria em análise",
  INCIDENTE_EM_APURACAO: "Incidente de proteção em apuração (afastamento cautelar)",
  PENDENCIA_DIRETORIA: "Pendência a tratar com a Diretoria Executiva",
  INAPTO: "Marcado como inapto na habilitação",
  CADASTRO_NACIONAL: "Consta no cadastro nacional",
  SEM_HABILITACAO: "Sem habilitação aberta",
  ESTEIRA_INCOMPLETA: "Habilitação incompleta",
  HABILITACAO_VENCIDA: "Habilitação vencida",
  ANTECEDENTES_AUSENTES: "Sem certidões de antecedentes",
  ANTECEDENTES_INCOMPLETOS: "Certidões de antecedentes incompletas",
  ANTECEDENTES_COM_RESTRICAO: "Antecedentes com restrição",
  ANTECEDENTES_VENCIDOS: "Certidões de antecedentes vencidas",
  TREINAMENTO_AUSENTE: "Sem treinamento de proteção",
  TREINAMENTO_VENCIDO: "Treinamento de proteção vencido",
  FICHA_DESATUALIZADA: "Ficha cadastral desatualizada",
  POLITICA_NAO_ACEITA: "Política de comunicação com menores não aceita",
  SEIS_MESES: "Menos de 6 meses de comunhão"
};
// Estes só a Diretoria Executiva (e o Conselho de Ética) enxerga com o motivo: quem habilita na congregação vê só "pendência com a Diretoria".
const BLOQUEIOS_RESERVADOS = ["ANTECEDENTES_COM_RESTRICAO", "AUTO_DENUNCIA_EM_ANALISE", "CADASTRO_NACIONAL", "FORA_DE_COMUNHAO", "INCIDENTE_EM_APURACAO"];

const bloq = (codigo, mensagem, extra = {}) => ({ codigo, mensagem, ...extra });

// e = {
//   membro: { dataNascimento, dataAdmissao },
//   esteira: { existe, status: PENDENTE|APTO|INAPTO|VENCIDO, proximaEtapaTitulo, validoAte },
//   vistoria: (ver avaliarAntecedentes) | null,
//   treinamento: (ver avaliarTreinamento) | null,
//   fichaEm: data (a mais recente entre a ficha de inscrição e a última confirmação) | null,
//   politicaVersaoAceita: número | null, politicaVersaoVigente: número,
//   autoDenunciaAberta: boolean, cadastroNacional: 'CONSTA' | 'NADA_CONSTA' | 'INDISPONIVEL' | null,
//   incidenteEmApuracao: boolean   (v7.8: envolvido de suspeita de violência cujo afastamento cautelar o Comitê ainda não levantou)
// }
// Resultado: { apto, contaComoAdulto, idade, bloqueios[], validades{}, proximoVencimento }
function avaliarAptidao(e, { hoje, prazos = {} }) {
  const p = prazosEfetivos(prazos);
  const bloqueios = [];
  const membro = e.membro || {};
  const nasc = paraIso(membro.dataNascimento);
  const idade = nasc ? vol.idadeEmAnos(nasc, hoje) : null;
  const adulto = idade != null && idade >= MAIORIDADE;
  const menorDeIdade = idade != null && idade < MAIORIDADE;

  // Em plena comunhão (a mesma noção dos Setores Técnicos, v7.6). Só se confere quando o banco informou a situação.
  if (membro.status !== undefined && (membro.status !== "ATIVO" || membro.situacao === "SEM_COMUNHAO")) bloqueios.push(bloq("FORA_DE_COMUNHAO", "O ministério com menores é para membros em plena comunhão. Procure a Secretaria ou a Diretoria."));
  if (idade == null) bloqueios.push(bloq("SEM_DATA_NASCIMENTO", "O seu cadastro não tem a data de nascimento. Com menores, a Igreja precisa saber a idade de quem serve: procure a Secretaria para completar o cadastro."));
  if (e.autoDenunciaAberta) bloqueios.push(bloq("AUTO_DENUNCIA_EM_ANALISE", "Por cautela, o contato com menores fica suspenso enquanto a Diretoria analisa a sua comunicação. Não é punição: a Diretoria decide em seguida."));
  // v7.8: o afastamento cautelar por incidente de proteção. A mensagem NUNCA diz o motivo (a apuração é das autoridades; avisar o envolvido do que consta contra ele não cabe ao sistema).
  if (e.incidenteEmApuracao) bloqueios.push(bloq("INCIDENTE_EM_APURACAO", "Por cautela, o seu contato com crianças e adolescentes está suspenso, por decisão da Diretoria Executiva. Isso não é uma condenação. A Diretoria entrará em contato com você."));
  if (e.cadastroNacional === "CONSTA") bloqueios.push(bloq("CADASTRO_NACIONAL", "Há registro no cadastro nacional de condenados por crimes contra menores. Procure a Diretoria Executiva."));

  const esteira = e.esteira || { existe: false };
  if (!esteira.existe) bloqueios.push(bloq("SEM_HABILITACAO", "Você ainda não tem a habilitação aberta. Peça à Secretaria da congregação para iniciar a sua habilitação de voluntário."));
  else if (esteira.status === "INAPTO") bloqueios.push(bloq("INAPTO", "A sua habilitação foi marcada como inapta. Procure a Secretaria ou a Diretoria."));
  else if (esteira.status === "VENCIDO") bloqueios.push(bloq("HABILITACAO_VENCIDA", "A sua habilitação de voluntário venceu: é preciso renová-la.", { venceuEm: esteira.validoAte || null }));
  else if (esteira.status === "PENDENTE") bloqueios.push(bloq("ESTEIRA_INCOMPLETA", `A sua habilitação ainda não terminou${esteira.proximaEtapaTitulo ? `: falta “${esteira.proximaEtapaTitulo}”` : ""}.`));

  // Antecedentes: quem é menor de 18 não tem certidão de antecedentes criminais (ato infracional corre em segredo de justiça): o menor serve só como
  // auxiliar, sempre ao lado de adultos, e nunca conta como adulto da sala.
  const ant = adulto || idade == null ? avaliarAntecedentes(e.vistoria || null, { hoje, validadeDias: p.antecedentesDias }) : { situacao: "DISPENSADO", validoAte: null, emitidaEm: null, faltam: [] };
  if (adulto || idade == null) {
    if (ant.situacao === "AUSENTE") bloqueios.push(bloq("ANTECEDENTES_AUSENTES", "Faltam as certidões de antecedentes criminais (federal e estadual). Entregue-as à Diretoria Executiva, que confere e registra."));
    else if (ant.situacao === "INCOMPLETO") bloqueios.push(bloq("ANTECEDENTES_INCOMPLETOS", `Falta ${ant.faltam.map((t) => ROTULO_CERTIDAO[t]).join(" e ")} no Termo de Vistoria. Entregue a certidão que falta à Diretoria Executiva.`));
    else if (ant.situacao === "COM_RESTRICAO") bloqueios.push(bloq("ANTECEDENTES_COM_RESTRICAO", "A vistoria dos seus antecedentes tem uma pendência. Procure a Diretoria Executiva."));
    else if (ant.situacao === "VENCIDO") bloqueios.push(bloq("ANTECEDENTES_VENCIDOS", "As suas certidões de antecedentes venceram (valem 180 dias da emissão). Entregue certidões novas à Diretoria Executiva.", { venceuEm: ant.validoAte }));
  }

  const trein = avaliarTreinamento(e.treinamento || null, { hoje, validadeDias: p.treinamentoDias });
  if (trein.situacao === "AUSENTE") bloqueios.push(bloq("TREINAMENTO_AUSENTE", "Falta o treinamento de proteção de crianças e adolescentes. Procure o líder da sua equipe ou a Secretaria para fazê-lo."));
  else if (trein.situacao === "VENCIDO") bloqueios.push(bloq("TREINAMENTO_VENCIDO", "O seu treinamento de proteção venceu: refaça-o para voltar às escalas com menores.", { venceuEm: trein.validoAte }));

  const fichaEm = paraIso(e.fichaEm);
  const fichaValidoAte = fichaEm ? somarDiasIso(fichaEm, p.fichaDias) : null;
  if (!fichaEm || hoje > fichaValidoAte) bloqueios.push(bloq("FICHA_DESATUALIZADA", "A confirmação da sua ficha cadastral venceu (vale 6 meses). Confirme os seus dados em Meu Painel → Ministério com menores.", { venceuEm: fichaValidoAte }));

  const versaoVigente = e.politicaVersaoVigente == null ? POLITICA_VERSAO : e.politicaVersaoVigente;
  if (e.politicaVersaoAceita == null || e.politicaVersaoAceita < versaoVigente) bloqueios.push(bloq("POLITICA_NAO_ACEITA", "Falta aceitar a política de comunicação eletrônica com crianças e adolescentes. Leia e aceite em Meu Painel → Ministério com menores."));

  // Regra dos 6 meses: calculada da data da última recepção na Igreja (batismo ou carta de mudança), nunca digitada. Sem a data, não se presume.
  const admissao = paraIso(membro.dataAdmissao);
  if (!admissao) bloqueios.push(bloq("SEIS_MESES", "O seu cadastro não tem a data de admissão na Igreja, e a regra dos 6 meses de comunhão não pode ser conferida. Procure a Secretaria."));
  else if (hoje < somarMesesIso(admissao, 6)) bloqueios.push(bloq("SEIS_MESES", `Servir com menores exige 6 meses de comunhão na Igreja: você poderá a partir de ${formatarDataBr(somarMesesIso(admissao, 6))}.`, { elegivelEm: somarMesesIso(admissao, 6) }));

  const validades = {
    esteira: { validoAte: paraIso(esteira.validoAte) },
    antecedentes: { situacao: ant.situacao, validoAte: ant.validoAte, emitidaEm: ant.emitidaEm },
    treinamento: { situacao: trein.situacao, modo: trein.modo, validoAte: trein.validoAte },
    ficha: { validoAte: fichaValidoAte }
  };
  return {
    apto: bloqueios.length === 0,
    contaComoAdulto: adulto,
    menorDeIdade,
    idade,
    bloqueios,
    validades,
    proximoVencimento: proximoVencimento(validades, hoje)
  };
}

const ROTULO_ITEM_VENCIMENTO = {
  antecedentes: "certidões de antecedentes",
  treinamento: "treinamento de proteção",
  ficha: "confirmação da ficha cadastral",
  esteira: "habilitação de voluntário"
};

// Os itens que ainda valem e vencem, do mais próximo ao mais distante.
function itensAVencer(validades, hoje) {
  const itens = [];
  for (const chave of Object.keys(ROTULO_ITEM_VENCIMENTO)) {
    const v = validades[chave];
    const ate = v && v.validoAte;
    if (!ate || ate < hoje) continue;
    if (chave === "antecedentes" && v.situacao !== "VIGENTE") continue;
    if (chave === "treinamento" && v.situacao !== "VIGENTE") continue;
    itens.push({ item: chave, rotulo: ROTULO_ITEM_VENCIMENTO[chave], data: ate, dias: diasEntreIso(hoje, ate) });
  }
  return itens.sort((a, b) => a.dias - b.dias);
}
function proximoVencimento(validades, hoje) {
  const itens = itensAVencer(validades, hoje);
  return itens.length ? itens[0] : null;
}

// Em qual degrau da escada de avisos (60, 30 ou 15 dias) o vencimento está AGORA. Quem entra tarde (já a menos de 15 dias) só recebe o último aviso.
function faixaDeAlerta(dias) {
  if (!Number.isInteger(dias) || dias < 0) return null;
  for (const f of [...ALERTAS_DIAS].sort((a, b) => a - b)) if (dias <= f) return f;
  return null;
}

// Para a referência do aviso: um número por ciclo de validade (habilitação × data em que vence), de modo que a renovação reabre a escada de avisos.
// habilitacaoId * 4096 + (dias desde 2026 mod 4096): cabe em INT até a habilitação nº 524.000 e muda a cada data de vencimento.
function referenciaDoAviso(habilitacaoId, dataVencimentoIso) {
  return Number(habilitacaoId) * 4096 + (ordinalDeIso(dataVencimentoIso) % 4096);
}
// Uma referência por (serviço, equipe, nº de adultos escalados): se o problema muda (o 2º adulto saiu e depois voltou a faltar), o aviso é reaberto.
function referenciaDaSala(servicoId, equipeId, adultos) {
  return (Number(servicoId) % 2000000) * 1000 + (Number(equipeId) % 100) * 10 + Math.min(Math.max(Number(adultos) || 0, 0), 9);
}
// Nome de equipe que sugere crianças: o que a Secretaria precisa conferir se ainda NÃO tem a marca de "contato com menores" (a marca nasce desligada).
function nomeSugereMenores(nome) {
  const s = String(nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /infantil|crianc|bercari|maternal|junior|adolescen|teen|kids|menor|mirim|pre-?adolesc|ebd.*infan/.test(s);
}

// Quem gere a congregação vê o que a pessoa precisa fazer, mas NÃO o motivo de uma pendência com a Diretoria (restrição, auto-denúncia, cadastro nacional).
function mascararParaGestao(bloqueios) {
  const saida = [];
  let jaTemReservado = false;
  for (const b of bloqueios || []) {
    if (BLOQUEIOS_RESERVADOS.includes(b.codigo)) {
      if (jaTemReservado) continue;
      jaTemReservado = true;
      saida.push({ codigo: "PENDENCIA_DIRETORIA", mensagem: "Há uma pendência a tratar com a Diretoria Executiva." });
    } else saida.push(b);
  }
  return saida;
}

// O painel da congregação mostra a cada bloqueio só o código e um rótulo curto (as mensagens são para a própria pessoa: falam em "você"). A Diretoria (reservado)
// vê todos os códigos; a gestão vê os reservados como "pendência com a Diretoria".
function bloqueiosParaPainel(bloqueios, { reservado = false } = {}) {
  const lista = reservado ? (bloqueios || []) : mascararParaGestao(bloqueios);
  return lista.map((b) => ({ codigo: b.codigo, rotulo: ROTULO_BLOQUEIO[b.codigo] || b.codigo, ...(b.venceuEm ? { venceuEm: b.venceuEm } : {}), ...(b.elegivelEm ? { elegivelEm: b.elegivelEm } : {}) }));
}
// A pessoa tem alguma pendência reservada à Diretoria? (restrição, comunicação em análise, cadastro nacional, fora de comunhão)
function temBloqueioReservado(bloqueios) {
  return (bloqueios || []).some((b) => BLOQUEIOS_RESERVADOS.includes(b.codigo));
}
// A situação das certidões também revelaria a restrição ("COM_RESTRICAO"), e o "próximo vencimento" muda quando as certidões não valem. Para a gestão, QUALQUER pendência
// reservada vira a mesma linha — "pendência com a Diretoria", sem datas de certidão — para que as quatro causas não se distingam por um detalhe da tela.
// `bloqueios` são os bloqueios BRUTOS da aptidão (antes da máscara).
function validadesParaGestao(validades, bloqueios = []) {
  const v = JSON.parse(JSON.stringify(validades || {}));
  const reservado = temBloqueioReservado(bloqueios) || (v.antecedentes && v.antecedentes.situacao === "COM_RESTRICAO");
  if (reservado && v.antecedentes) v.antecedentes = { situacao: "PENDENCIA_DIRETORIA", validoAte: null, emitidaEm: null };
  return v;
}
function proximoVencimentoParaGestao(proximo, bloqueios = []) {
  return temBloqueioReservado(bloqueios) ? null : proximo;
}

// APTO | VENCENDO (apto, mas algo vence em até 60 dias) | BLOQUEADO
function statusDaLinha(aptidao) {
  if (!aptidao.apto) return "BLOQUEADO";
  const prox = aptidao.proximoVencimento;
  return prox && prox.dias <= Math.max(...ALERTAS_DIAS) ? "VENCENDO" : "APTO";
}

// ---------------------------------------------------------------
// Salas: regra dos dois adultos e proporção adulto/criança. Confere antes de publicar; não é alerta.
// ---------------------------------------------------------------

function criancasPorAdulto(faixa, prazosFaixa = {}) {
  const f = FAIXAS[faixa];
  if (!f) return null;
  const v = prazosFaixa[faixa];
  return Number.isInteger(v) && v >= 1 ? v : f.padrao;
}

// { equipeNome, faixa, criancasPrevistas (null = não informado), adultos (habilitados e maiores de 18, já escalados), semHabilitacao (nomes), adultosMinimos, criancasPorAdulto }
function avaliarSala(s) {
  const problemas = [];
  const nome = s.equipeNome || "a sala";
  const minimo = Math.max(ADULTOS_MINIMOS_PADRAO, prazoOuPadrao(s.adultosMinimos, ADULTOS_MINIMOS_PADRAO));
  if (!s.faixa || !FAIXAS[s.faixa]) problemas.push({ codigo: "SEM_FAIXA", mensagem: `Defina a faixa etária da equipe ${nome} para conferir a proporção de adultos por criança.` });
  if (s.criancasPrevistas == null) problemas.push({ codigo: "SEM_CRIANCAS_PREVISTAS", mensagem: `Informe quantas crianças a equipe ${nome} espera neste serviço.` });
  const porAdulto = s.criancasPorAdulto || (s.faixa ? criancasPorAdulto(s.faixa) : null);
  let necessarios = minimo;
  if (porAdulto && s.criancasPrevistas != null) necessarios = Math.max(minimo, Math.ceil(s.criancasPrevistas / porAdulto));
  if ((s.semHabilitacao || []).length) problemas.push({ codigo: "ESCALADO_SEM_HABILITACAO", mensagem: `${nome}: há voluntário escalado sem habilitação em dia (${s.semHabilitacao.join(", ")}). Retire-o da escala antes de publicar.` });
  if (s.adultos < minimo) problemas.push({ codigo: "UM_ADULTO_SOZINHO", mensagem: `${nome}: uma sala com menores nunca fica com um adulto só — são necessários ao menos ${minimo} adultos habilitados e há ${s.adultos}.` });
  else if (s.adultos < necessarios) problemas.push({ codigo: "PROPORCAO", mensagem: `${nome}: para ${s.criancasPrevistas} criança(s) (${FAIXAS[s.faixa].rotulo.toLowerCase()}) são necessários ${necessarios} adultos habilitados e há ${s.adultos}.` });
  return { ok: problemas.length === 0, necessarios, adultos: s.adultos, problemas };
}

function validarCriancasPrevistas(valor) {
  if (valor == null || valor === "" || typeof valor === "boolean" || Array.isArray(valor) || typeof valor === "object") return { valido: false, mensagem: "Informe quantas crianças são esperadas (um número de 0 a 200)." };
  const n = typeof valor === "number" ? valor : /^\d{1,3}$/.test(String(valor).trim()) ? Number(String(valor).trim()) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > MAX_CRIANCAS_POR_SALA) return { valido: false, mensagem: `Informe quantas crianças são esperadas: um número inteiro de 0 a ${MAX_CRIANCAS_POR_SALA}.` };
  return { valido: true, criancas: n };
}

function validarFaixa(valor) {
  if (valor == null || valor === "") return { valido: true, faixa: null };
  if (typeof valor !== "string" || !CODIGOS_FAIXA.includes(valor)) return { valido: false, mensagem: `Faixa etária inválida. Use uma de: ${CODIGOS_FAIXA.join(", ")}.` };
  return { valido: true, faixa: valor };
}

// ---------------------------------------------------------------
// Política de comunicação eletrônica com menores (Lei 14.811/2024; Regra das 24 Horas da v7.3). Texto versionado, com hash.
// ---------------------------------------------------------------

const POLITICA_VERSAO = 1;
const POLITICA_TITULO = "Política de comunicação eletrônica com crianças e adolescentes";
const POLITICA_ITENS = [
  { codigo: "SEM_PRIVADO", texto: "Não troco mensagem privada, ligação nem videochamada individual (só eu e uma criança ou adolescente) em nome da Igreja. Toda comunicação é feita em grupo oficial, à vista de outros adultos." },
  { codigo: "GRUPO_OFICIAL", texto: "Só uso canais e grupos oficiais cadastrados no sistema. Todo grupo com menores tem ao menos dois adultos habilitados como administradores e um responsável (pai, mãe ou tutor) com acesso." },
  { codigo: "IMAGEM", texto: "Só fotografo, filmo ou divulgo imagem de criança ou adolescente com o consentimento do responsável registrado no sistema, e nunca a publico em perfil pessoal." },
  { codigo: "REDES_PESSOAIS", texto: "Não chamo nem aceito criança ou adolescente nas minhas redes pessoais para tratar de assuntos da Igreja, e não peço nem guardo segredos." },
  { codigo: "CONTEUDO", texto: "Falo com menores só sobre as atividades da Igreja, em horário razoável, e com o tom e o conteúdo adequados à idade." },
  { codigo: "RISCO", texto: "Se uma criança ou adolescente me pedir uma conversa reservada ou contar algo que a coloque em risco, não prometo sigilo: levo ao líder da equipe e à Diretoria na mesma hora." },
  { codigo: "COMUNICAR", texto: "Se eu vir outro adulto descumprir esta política, comunico o líder ou a Diretoria. Qualquer conteúdo impróprio em canal oficial é retirado em até 24 horas." },
  { codigo: "CONSEQUENCIA", texto: "Sei que descumprir esta política me afasta do ministério com menores e é comunicado à Diretoria." }
];
const POLITICA_ACEITE = "Li a política, entendi e me comprometo a cumpri-la.";
const POLITICA_HASH = sha256(JSON.stringify({ v: POLITICA_VERSAO, t: POLITICA_TITULO, i: POLITICA_ITENS.map((x) => [x.codigo, x.texto]), a: POLITICA_ACEITE }));

function politicaVigente() {
  return { versao: POLITICA_VERSAO, titulo: POLITICA_TITULO, itens: POLITICA_ITENS.map((x) => ({ ...x })), aceite: POLITICA_ACEITE, hash: POLITICA_HASH };
}

// O hash aceito confere com o texto desta versão? (Só a versão atual tem texto em código; versão anterior = precisa reaceitar.)
function avaliarIntegridadePolitica(aceite) {
  if (!aceite || aceite.hash == null || aceite.versao == null) return { status: "SEM_HASH" };
  if (aceite.versao < POLITICA_VERSAO) return { status: "VERSAO_ANTERIOR" };
  return { status: aceite.hash === POLITICA_HASH ? "OK" : "DIVERGENTE" };
}

// ---------------------------------------------------------------
// Auto-denúncia (Regimento Art. 133 §5º, V).
// ---------------------------------------------------------------

const TIPOS_AUTODENUNCIA = {
  INQUERITO_POLICIAL: "Inquérito policial",
  PROCESSO_CRIMINAL: "Processo criminal",
  OUTRO_PROCEDIMENTO: "Outro procedimento criminal"
};
const DECISOES_AUTODENUNCIA = {
  MANTIDO: "Mantido: pode voltar a servir com menores",
  AFASTADO_PREVENTIVAMENTE: "Afastado preventivamente do ministério com menores"
};

function validarAutoDenuncia(d = {}, { hoje }) {
  const tipo = typeof d.tipo === "string" ? d.tipo.trim().toUpperCase() : "";
  if (!TIPOS_AUTODENUNCIA[tipo]) return { valido: false, mensagem: "Informe o que você está respondendo: inquérito policial, processo criminal ou outro procedimento criminal." };
  const data = typeof d.dataCiencia === "string" ? d.dataCiencia.trim() : "";
  if (!cal.dataIsoValida(data) || data > hoje || data < "1990-01-01") return { valido: false, mensagem: "Informe a data em que você soube (dia/mês/ano, não pode ser no futuro)." };
  if (d.ciente !== true) return { valido: false, mensagem: "Marque que você está ciente: a comunicação vai à Diretoria Executiva e, por cautela, suspende o seu contato com menores até a decisão." };
  return { valido: true, dados: { tipo, dataCiencia: data } };
}

function validarDecisaoAutoDenuncia(d = {}, { atorId, membroId }) {
  const decisao = typeof d.decisao === "string" ? d.decisao.trim().toUpperCase() : "";
  if (!DECISOES_AUTODENUNCIA[decisao]) return { valido: false, mensagem: `Decisão inválida. Use uma de: ${Object.keys(DECISOES_AUTODENUNCIA).join(", ")}.` };
  if (inteiroPositivo(atorId) === inteiroPositivo(membroId)) return { valido: false, proibido: true, mensagem: "Ninguém decide sobre a própria comunicação: peça a outra pessoa da Diretoria." };
  const obs = limpar(d.observacao);
  if (obs.length < 10 || obs.length > MAX_OBSERVACAO || temMarca(obs)) return { valido: false, mensagem: `Registre o motivo da decisão (de 10 a ${MAX_OBSERVACAO} caracteres, sem < ou >). Não cite nomes de terceiros.` };
  return { valido: true, dados: { decisao, observacao: obs } };
}

// O afastamento preventivo pode ser levantado depois, uma única vez, por OUTRA pessoa da Diretoria.
function validarLiberacaoAutoDenuncia(d = {}, { atorId, membroId }) {
  if (inteiroPositivo(atorId) === inteiroPositivo(membroId)) return { valido: false, proibido: true, mensagem: "Ninguém levanta o próprio afastamento: peça a outra pessoa da Diretoria." };
  const obs = limpar(d.observacao);
  if (obs.length < 10 || obs.length > MAX_OBSERVACAO || temMarca(obs)) return { valido: false, mensagem: `Registre o motivo da liberação (de 10 a ${MAX_OBSERVACAO} caracteres, sem < ou >). Não cite nomes de terceiros.` };
  return { valido: true, dados: { observacao: obs } };
}

// ---------------------------------------------------------------
// Aceite da política e confirmação da ficha: validações de forma.
// ---------------------------------------------------------------

function validarAceitePolitica(d = {}) {
  if (d.aceito !== true) return { valido: false, mensagem: "Marque que você leu e aceita a política." };
  return { valido: true };
}
function validarConfirmacaoFicha(d = {}) {
  if (d.confirmo !== true) return { valido: false, mensagem: "Marque que os seus dados cadastrais (nome, telefone, e-mail e endereço) estão atualizados." };
  return { valido: true };
}

// ---------------------------------------------------------------
// Painel de conformidade.
// ---------------------------------------------------------------

// linhas: [{ membroId, nome, congregacaoId, congregacaoNome, equipes:[nome], aptidao }]
// `reservado`: só a Diretoria vê a contagem por motivo reservado (restrição, auto-denúncia...); para a gestão da congregação as contagens seguem a mesma máscara da lista
// (senão "1 pessoa com restrição" no resumo, somado à lista, diria quem é e por quê).
function resumirPainel(linhas, { reservado = false } = {}) {
  const r = { total: 0, aptos: 0, vencendo: 0, bloqueados: 0, porMotivo: {} };
  for (const l of linhas) {
    r.total++;
    const st = statusDaLinha(l.aptidao);
    if (st === "APTO") r.aptos++;
    else if (st === "VENCENDO") r.vencendo++;
    else {
      r.bloqueados++;
      for (const b of (reservado ? l.aptidao.bloqueios : mascararParaGestao(l.aptidao.bloqueios))) r.porMotivo[b.codigo] = (r.porMotivo[b.codigo] || 0) + 1;
    }
  }
  return r;
}

function agruparPorCongregacao(linhas, opcoes) {
  const mapa = new Map();
  for (const l of linhas) {
    if (!mapa.has(l.congregacaoId)) mapa.set(l.congregacaoId, { congregacaoId: l.congregacaoId, congregacaoNome: l.congregacaoNome, linhas: [] });
    mapa.get(l.congregacaoId).linhas.push(l);
  }
  return [...mapa.values()].map((g) => ({ congregacaoId: g.congregacaoId, congregacaoNome: g.congregacaoNome, ...resumirPainel(g.linhas, opcoes) })).sort((a, b) => String(a.congregacaoNome).localeCompare(String(b.congregacaoNome), "pt-BR"));
}

// ---------------------------------------------------------------
// Textos dos avisos (e-mail e painel). Nunca levam o motivo de uma pendência com a Diretoria.
// ---------------------------------------------------------------

function formatarDataBr(iso) { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; }
function listaEmTexto(itens) {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

function textoVencendo({ itens, faixa }) {
  const lista = listaEmTexto(itens.map((i) => `${i.rotulo} (${formatarDataBr(i.data)})`));
  return `Ministério com menores: o que vence em até ${faixa} dias na sua habilitação — ${lista}. A renovação leva dias para sair: providencie agora, porque no dia do vencimento você sai automaticamente das escalas com crianças e adolescentes. Veja o que fazer em Meu Painel → Ministério com menores.`.slice(0, 1000);
}
function textoRetiradaPessoa({ equipes, nEscalas }) {
  const onde = listaEmTexto(equipes);
  return `Você saiu das escalas futuras com menores (${onde}) por uma pendência na habilitação${nEscalas ? `: ${nEscalas} escala(s) foram desmarcadas` : ""}. Veja o que falta em Meu Painel → Ministério com menores. Assim que regularizar, você volta a poder ser escalado. Isso não abre processo disciplinar.`.slice(0, 1000);
}
function textoVagaAberta({ nome, equipe, nEscalas }) {
  return `${nome} saiu das escalas da equipe ${equipe} por uma pendência de habilitação para servir com menores${nEscalas ? ` (${nEscalas} escala(s) desmarcada(s))` : ""}. Confira as vagas abertas e a regra dos dois adultos antes de cada serviço.`.slice(0, 1000);
}
function textoSalaSemAdulto({ equipe, dataHora, adultos, necessarios }) {
  return `A equipe ${equipe} tem ${adultos} adulto(s) habilitado(s) escalado(s) para ${dataHora}, e a sala com menores precisa de ${necessarios}. Uma sala com crianças nunca fica com um adulto só: complete a escala ou ajuste o serviço.`.slice(0, 1000);
}
function textoVistoriasARenovar({ total, nomes }) {
  const mostrados = nomes.slice(0, 6);
  const resto = total - mostrados.length;
  return `${total} voluntário(s) que servem com menores precisam de certidões de antecedentes novas nos próximos 60 dias, ou já estão sem elas: ${mostrados.join(", ")}${resto > 0 ? ` e mais ${resto}` : ""}. Confira em Vistoria de Antecedentes e solicite as certidões.`.slice(0, 1000);
}
// O e-mail sai do sistema e não se recolhe: nenhum aviso leva o NOME de quem comunicou nem o TIPO do procedimento (isso só se vê dentro do sistema, na fila da Diretoria).
function textoAutoDenuncia() {
  return "Há uma comunicação nova de voluntário aguardando a decisão da Diretoria Executiva (Regimento Art. 133 §5º, V). Por cautela, o contato dessa pessoa com menores já está suspenso. Abra Ministério com Menores → Comunicações dos voluntários para ver e decidir.";
}
function textoAutoDenunciaPendente({ dias }) {
  return `Há uma comunicação de voluntário sem decisão da Diretoria há ${dias} dia(s), e o contato dessa pessoa com menores segue suspenso. Abra Ministério com Menores → Comunicações dos voluntários para decidir: manter ou afastar preventivamente.`.slice(0, 1000);
}
function textoAutoDenunciaPessoa() {
  return "A sua comunicação foi recebida pela Diretoria Executiva. Obrigado por avisar: é o que o Regimento pede. Por cautela, o seu contato com menores fica suspenso até a decisão da Diretoria — isso não é punição e não afeta os seus outros serviços. A Diretoria pode pedir certidões novas.";
}
function textoAutoDenunciaDecidida({ decisao }) {
  return decisao === "MANTIDO"
    ? "A Diretoria Executiva decidiu sobre a sua comunicação: o seu contato com menores foi liberado, desde que a sua habilitação esteja em dia."
    : "A Diretoria Executiva decidiu sobre a sua comunicação: você fica afastado preventivamente do ministério com menores. A Diretoria entrará em contato.";
}
function textoCanalIrregular({ canalNome, problemas }) {
  return `O canal “${canalNome}” inclui menores e está fora da regra: ${problemas.join("; ")}. Regularize: todo grupo com menores precisa de ao menos dois administradores adultos habilitados e de um responsável com acesso.`.slice(0, 1000);
}

module.exports = {
  ANTECEDENTES_DIAS_PADRAO, TREINAMENTO_DIAS_PADRAO, FICHA_DIAS_PADRAO, ADULTOS_MINIMOS_PADRAO, ALERTAS_DIAS, SALA_ALERTA_DIAS_PADRAO, AUTODENUNCIA_LEMBRETE_DIAS_PADRAO,
  SIGLAS_PRAZO, FAIXAS, CODIGOS_FAIXA, CERTIDOES_CRIMINAIS, ROTULO_CERTIDAO, ROTULO_BLOQUEIO, BLOQUEIOS_RESERVADOS, ROTULO_ITEM_VENCIMENTO, MAX_CRIANCAS_POR_SALA, MAIORIDADE,
  paraIso, somarDiasIso, somarMesesIso, diasEntreIso, ordinalDeIso, prazosEfetivos, formatarDataBr,
  temBloqueioReservado, proximoVencimentoParaGestao, avaliarAntecedentes, avaliarTreinamento, avaliarAptidao, itensAVencer, proximoVencimento, faixaDeAlerta, referenciaDoAviso, referenciaDaSala, nomeSugereMenores, mascararParaGestao, bloqueiosParaPainel, validadesParaGestao, statusDaLinha,
  criancasPorAdulto, avaliarSala, validarCriancasPrevistas, validarFaixa,
  POLITICA_VERSAO, POLITICA_TITULO, POLITICA_ITENS, POLITICA_ACEITE, POLITICA_HASH, politicaVigente, avaliarIntegridadePolitica,
  TIPOS_AUTODENUNCIA, DECISOES_AUTODENUNCIA, validarAutoDenuncia, validarDecisaoAutoDenuncia, validarLiberacaoAutoDenuncia, validarAceitePolitica, validarConfirmacaoFicha,
  resumirPainel, agruparPorCongregacao,
  textoVencendo, textoRetiradaPessoa, textoVagaAberta, textoSalaSemAdulto, textoVistoriasARenovar, textoAutoDenuncia, textoAutoDenunciaPendente, textoAutoDenunciaPessoa,
  textoAutoDenunciaDecidida, textoCanalIrregular
};
