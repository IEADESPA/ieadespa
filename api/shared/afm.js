// shared/afm.js (v8.1 — AFM e faltas da CLI)
// Regra PURA (sem banco) da Academia de Formação Ministerial e do comparecimento obrigatório à CLI. O banco fica em shared/afmDb.js.
//
// Base legal: Estatuto Art. 15 §1º (CLI mista; o membro por Ordenação só fica "devidamente credenciado") e Art. 27 (3 faltas seguidas sem justificativa = exclusão automática;
// §2º providências quando a pessoa entra por cargo); Regimento Art. 22 (CDER), Art. 66 a 69 (AFM: matrícula obrigatória, Reitor, Sessão Magna integrada à CLI, falta dupla,
// desmatrícula automática), Art. 72 (nível de escolaridade por cargo), Art. 149 (reingresso; catálogo fechado de justificativa) e Art. 56 §2º (perda por tabela).
// O desenho completo está em docs/plano/fase-8-ministerial-afm.md ("Desenho da v8.1").

// Art. 66 §2º — todos os oficiais do Campo integram a AFM, obrigatoriamente.
const CARGOS_OFICIAIS = ["AUXILIAR", "MISSIONARIO", "DIACONO", "PRESBITERO", "EVANGELISTA", "PASTOR"];
// Estatuto Art. 15 §1º, I — quem entra na CLI por Ordenação.
const CARGOS_ORDENACAO_CLI = ["PRESBITERO", "EVANGELISTA", "PASTOR"];

// Art. 72 — níveis da AFM, do mais baixo para o mais alto.
const NIVEIS = {
  BASICO: { rotulo: "Básico", ordem: 1 },
  MEDIO: { rotulo: "Médio", ordem: 2 },
  AVANCADO: { rotulo: "Avançado", ordem: 3 },
  BACHAREL: { rotulo: "Bacharel Livre", ordem: 4 }
};

// Art. 72 — o nível mínimo exigido de cada cargo. Evangelista e Pastor: o curso precisa estar CONCLUÍDO ("não sendo aceita apenas a matrícula em curso", V, b).
const REQUISITO_NIVEL = {
  AUXILIAR: { minimo: "BASICO", concluido: false, artigo: "Art. 72, I, b" },
  MISSIONARIO: { minimo: "MEDIO", concluido: false, artigo: "Art. 72, II, b" },
  DIACONO: { minimo: "MEDIO", concluido: false, artigo: "Art. 72, III, b" },
  PRESBITERO: { minimo: "AVANCADO", concluido: false, artigo: "Art. 72, IV, b" },
  EVANGELISTA: { minimo: "AVANCADO", concluido: true, artigo: "Art. 72, V, b" },
  PASTOR: { minimo: "AVANCADO", concluido: true, artigo: "Art. 72, V, b" }
};

// Tipo da reunião da CLI. Só a Ordinária e a Sessão Magna contam para as 3 faltas: o Estatuto, Art. 27 caput, fala das "reuniões mensais"; a Extraordinária (Regimento
// Art. 147 §2º, convocada a qualquer tempo com 48 h) registra presença, mas não pesa na sanção (lida de forma restrita, por ser sanção).
// O Seminário Anual de novembro (Regimento Art. 70 §1º) é dia da Academia em que "suspende-se a pauta administrativa ordinária da CLI": a presença é mandatória para os
// oficiais (conta para a AFM), mas não há reunião da Câmara naquele dia — não conta falta da CLI (revisão independente, 27/10/2026).
// `contaCLI`: entra nas 3 faltas da CLI; `contaAFM`: entra nas 3 faltas da Academia (sempre com a turma da AFM esperada: `magna`).
const TIPOS_SESSAO_CLI = {
  ORDINARIA: { rotulo: "Ordinária (mensal)", contaFaltas: true, contaCLI: true, contaAFM: false, magna: false },
  EXTRAORDINARIA: { rotulo: "Extraordinária (não conta falta)", contaFaltas: false, contaCLI: false, contaAFM: false, magna: false },
  MAGNA_AFM: { rotulo: "Sessão Magna da AFM (integrada; conta para a CLI e para a Academia)", contaFaltas: true, contaCLI: true, contaAFM: true, magna: true },
  SEMINARIO_AFM: { rotulo: "Seminário Anual de novembro (só da Academia; não conta falta da CLI)", contaFaltas: true, contaCLI: false, contaAFM: true, magna: true }
};
const TIPOS_AFM_SQL = "N'MAGNA_AFM', N'SEMINARIO_AFM'";

// Regimento Art. 149 §2º, I — só fator EXTERNO à rotina da igreja justifica.
const MOTIVOS_ACEITOS = {
  SAUDE: "Problema de saúde (próprio ou de dependente)",
  VIAGEM_PROFISSIONAL: "Viagem profissional civil",
  LUTO: "Luto",
  EMERGENCIA_FAMILIAR: "Emergência familiar grave",
  OUTRO_EXTERNO: "Outro fator externo à rotina da igreja"
};
// Art. 149 §2º, II — vedados expressamente. Aparecem na tela, bloqueados, para quem preenche saber por quê.
const MOTIVOS_VEDADOS = {
  SERVICO_IGREJA: "Atividade de serviço na igreja",
  ESCALA_CONGREGACAO: "Cumprimento de escala em congregação",
  EVENTO_DEPARTAMENTO: "Evento de departamento",
  ENTIDADE_VINCULADA: "Ação em entidade vinculada"
};
const MENSAGEM_VEDADO = "Este motivo é vedado pelo Regimento, Art. 149 §2º, II: no dia da reunião da Câmara, o comparecimento ao colegiado vem antes de qualquer outra atividade da igreja.";
const DETALHE_MAXIMO = 250;      // o texto gravado é "rótulo — detalhe" (coluna de 300): com o rótulo mais longo (41), cabe sem corte
const DETALHE_MINIMO_OUTRO = 10;

const FALTAS_PARA_PERDA = 3;       // Estatuto Art. 27 §1º e Regimento Art. 69 §2º, I
const DIAS_PRAZO_AGE = 30;         // Estatuto Art. 27 §2º

const textoLimpo = (v) => (typeof v === "string" ? v.trim() : "");

// Valida a justificativa de falta de uma reunião da CLI (inclusive a Sessão Magna). `exigirComprovante`: na Sessão Magna, quem APROVA confirma que viu o documento
// (Regimento Art. 69 §2º, I: "justificativa legal documentada"); o pedido do próprio obreiro não tem esse campo.
function validarJustificativa({ codigo, detalhe, exigirComprovante = false, comprovanteConferido = false } = {}) {
  const c = typeof codigo === "string" ? codigo.trim().toUpperCase() : "";
  if (Object.prototype.hasOwnProperty.call(MOTIVOS_VEDADOS, c)) return { valido: false, mensagem: MENSAGEM_VEDADO };
  if (!Object.prototype.hasOwnProperty.call(MOTIVOS_ACEITOS, c)) return { valido: false, mensagem: "Escolha o motivo da falta na lista (Regimento, Art. 149 §2º)." };
  if (detalhe != null && typeof detalhe !== "string") return { valido: false, mensagem: "O detalhe da justificativa é um texto." };
  const d = textoLimpo(detalhe);
  if (d.length > DETALHE_MAXIMO) return { valido: false, mensagem: `O detalhe tem no máximo ${DETALHE_MAXIMO} caracteres.` };
  if (c === "OUTRO_EXTERNO" && d.length < DETALHE_MINIMO_OUTRO) return { valido: false, mensagem: `Em "outro fator externo", descreva o motivo (pelo menos ${DETALHE_MINIMO_OUTRO} caracteres).` };
  if (exigirComprovante && comprovanteConferido !== true) {
    return { valido: false, mensagem: "Na Sessão Magna da AFM a justificativa precisa ser documentada (Regimento, Art. 69 §2º, I): confirme que viu o documento." };
  }
  return { valido: true, codigo: c, detalhe: d || null };
}

// O texto que fica gravado em Presencas.MotivoJustificativa (a coluna antiga, lida pelas telas e pela minuta de ata): o rótulo do catálogo e o detalhe.
function textoDaJustificativa(codigo, detalhe) {
  const rotulo = MOTIVOS_ACEITOS[codigo] || codigo;
  return (detalhe ? `${rotulo} — ${detalhe}` : rotulo).slice(0, 300);
}

// Sequência de faltas sem justificativa, em ordem de data. `historico`: [{ sessaoId, data:'AAAA-MM-DD', presente, justificada }] — só as reuniões que contam e em que a
// pessoa era esperada. Presença e falta justificada INTERROMPEM a sequência (sanção se lê de forma restrita: as 3 faltas têm de ser em reuniões seguidas).
// Devolve o PRIMEIRO ponto em que a sequência chegou a 3 (é a data da exclusão/desmatrícula) e a sequência que está correndo agora (para o aviso "2 de 3").
// `quebra`: reunião que conta, mas em que a pessoa NÃO era esperada (estava fora da CLI, sob disciplina, não era oficial) — interrompe a sequência: faltas separadas por um
// período fora não somam (revisão independente, 27/10/2026). `pendente`: falta com pedido de justificativa esperando a Secretaria; com `pendenteInterrompe`, conta como
// interrupção (a exclusão não nasce enquanto a Secretaria não decide), sem ela conta como falta (um pedido sozinho não desfaz uma exclusão já registrada).
function apurarSequencia(historico, limite = FALTAS_PARA_PERDA, { pendenteInterrompe = false } = {}) {
  const ordenado = (Array.isArray(historico) ? historico : []).slice().sort((a, b) => (String(a.data) < String(b.data) ? -1 : String(a.data) > String(b.data) ? 1 : Number(a.sessaoId) - Number(b.sessaoId)));
  let corrente = [];
  let gatilho = null;
  for (const h of ordenado) {
    if (!h.quebra && !h.presente && !h.justificada && !(pendenteInterrompe && h.pendente)) {
      corrente.push(h);
      if (!gatilho && corrente.length >= limite) gatilho = { sessoes: corrente.slice(0, limite).map((x) => Number(x.sessaoId)), data: String(corrente[limite - 1].data).slice(0, 10) };
    } else {
      corrente = [];
    }
  }
  return { atingiu: !!gatilho, gatilho, atual: corrente.length, sessoesAtuais: corrente.map((x) => Number(x.sessaoId)) };
}

// As providências da exclusão por faltas, conforme por onde a pessoa entrava na CLI (Estatuto Art. 27 §2º; Regimento Art. 56 §2º). `caminhos`:
// [{ via:'ORDENACAO'|'ASSENTO'|'LIDERANCA', orgaoSigla?, cargo?, nivel? }]. O sistema NÃO fecha cadeira nem convoca: só diz o que a Secretaria e a CLI precisam fazer.
function providenciasDaExclusao(caminhos, dataExclusao) {
  const lista = [];
  const cs = Array.isArray(caminhos) ? caminhos : [];
  const eletivos = cs.filter((c) => c.via === "ASSENTO" && (c.orgaoSigla === "DIRETORIA_EXECUTIVA" || c.orgaoSigla === "CONSELHO_FISCAL"));
  const livres = cs.filter((c) => c.via === "LIDERANCA");
  if (eletivos.length || livres.length) {
    lista.push({ tipo: "COMUNICAR_CLI", texto: "A Secretaria Geral comunica a exclusão à CLI, que a aprecia (Estatuto, Art. 27 §2º)." });
  }
  if (eletivos.length) {
    const prazo = dataExclusao ? somarDias(dataExclusao, DIAS_PRAZO_AGE) : null;
    const cargos = eletivos.map((c) => c.cargo || (c.orgaoSigla === "CONSELHO_FISCAL" ? "Conselho Fiscal" : "Diretoria Executiva")).join(", ");
    lista.push({
      tipo: "AGE_DESTITUICAO",
      prazo,
      texto: `Cargo eletivo (${cargos}): a CLI convoca Assembleia Geral Extraordinária para deliberar a destituição em até ${DIAS_PRAZO_AGE} dias, com contraditório e ampla defesa `
        + `(Estatuto, Art. 27 §2º) — use "Convocar Assembleia" com a matéria "Destituição". No Conselho Fiscal e na Tesouraria, a CLI dá posse ao suplente eleito, se houver (Regimento, Art. 56 §2º).`
    });
  }
  if (livres.length) {
    const funcoes = livres.map((c) => c.cargo || "função de liderança").join(", ");
    lista.push({ tipo: "SUBSTITUICAO", texto: `Função de livre nomeação (${funcoes}): perde a função no mesmo ato e o Pastor Presidente nomeia o substituto (Regimento, Art. 56 §2º; Estatuto, Art. 27 §2º).` });
  }
  if (cs.some((c) => c.via === "ORDENACAO")) {
    lista.push({ tipo: "MANTEM_CARGO", texto: "Sai da composição da CLI, mas continua com o cargo ministerial: perder a cadeira na Câmara não é deixar de ser ministro." });
  }
  lista.push({ tipo: "REINGRESSO", texto: "Só volta à CLI por novo processo de admissão (Regimento, Art. 149 §1º): registre a readmissão com a data e o ato." });
  return lista;
}

function somarDias(dataIso, dias) {
  const [a, m, d] = String(dataIso).slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

// Regimento Art. 68 §1º — mandato do Reitor coincide com o exercício fiscal (ano civil: Estatuto Art. 30 §2º): termina em 31/12 do ano em que começa.
function fimDoMandatoReitor(dataInicioIso) {
  const ano = Number(String(dataInicioIso || "").slice(0, 4));
  return Number.isInteger(ano) && ano > 1900 ? `${ano}-12-31` : null;
}

// Reitor em exercício: não encerrado, homologado pela CLI e com mandato em dia. Nomeado e ainda não homologado aparece como "aguardando homologação".
function situacaoReitor(linha, hojeIso) {
  if (!linha) return "VAGA";
  if (linha.dataFim) return "ENCERRADO";
  if (linha.mandatoAte && String(linha.mandatoAte).slice(0, 10) < hojeIso) return "MANDATO_VENCIDO";
  if (!linha.homologadoCLIEm) return "AGUARDANDO_HOMOLOGACAO";
  return "EM_EXERCICIO";
}

// Art. 72 — o nível atende o cargo? null quando o cargo não é de oficial (não há exigência) ou o nível não foi informado ainda (a tela mostra "a informar").
function avaliarNivel(cargo, nivel, concluido) {
  const req = REQUISITO_NIVEL[cargo];
  if (!req) return { atende: null, exigido: null };
  const exigido = `${NIVEIS[req.minimo].rotulo} ou acima${req.concluido ? " (concluído)" : ""} — ${req.artigo}`;
  if (!nivel || !NIVEIS[nivel]) return { atende: null, exigido };
  const atende = NIVEIS[nivel].ordem >= NIVEIS[req.minimo].ordem && (!req.concluido || !!concluido);
  return { atende, exigido };
}

// Art. 66 §2º, I e II; Art. 69 §3º — licença para oficiar (batizar, ceia, casamento, dirigir culto oficial). Só oficial com matrícula ATIVA.
function licencaLiturgica({ cargo, statusMatricula }) {
  if (!CARGOS_OFICIAIS.includes(cargo)) return { podeOficiar: false, motivo: "Só oficiais do Campo oficiam atos litúrgicos (Regimento, Art. 66 §2º, I)." };
  if (statusMatricula === "INATIVA") {
    return { podeOficiar: false, motivo: "Obreiro inativo na AFM: mantém o título, mas está sem licença para oficiar até nova matrícula e aprovação na reciclagem (Regimento, Art. 69 §3º)." };
  }
  return { podeOficiar: true, motivo: null };
}

// Rematrícula (Art. 69 §3º): exige a data de aprovação no curso de reciclagem, que não pode ser no futuro nem antes da desmatrícula.
function validarRematricula({ reciclagemAprovadaEm, observacao }, { hojeIso, desmatriculaEm }) {
  const data = typeof reciclagemAprovadaEm === "string" ? reciclagemAprovadaEm.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(`${data}T00:00:00Z`)) || new Date(`${data}T00:00:00Z`).toISOString().slice(0, 10) !== data) {
    return { valido: false, mensagem: "Informe a data de aprovação no curso de reciclagem (Regimento, Art. 69 §3º)." };
  }
  if (data > hojeIso) return { valido: false, mensagem: "A aprovação na reciclagem não pode ser numa data futura." };
  if (desmatriculaEm && data < String(desmatriculaEm).slice(0, 10)) return { valido: false, mensagem: "A aprovação na reciclagem tem de ser depois da desmatrícula." };
  if (observacao != null && typeof observacao !== "string") return { valido: false, mensagem: "A observação é um texto." };
  const obs = textoLimpo(observacao);
  if (obs.length > 300) return { valido: false, mensagem: "A observação tem no máximo 300 caracteres." };
  return { valido: true, data, observacao: obs || null };
}

// Data no formato AAAA-MM-DD, real, não futura e não antes de 2000 (atos da AFM e da CLI registrados depois do fato).
function dataDoAto(valor, hojeIso, rotulo) {
  const d = typeof valor === "string" ? valor.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`)) || new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) !== d) return { valido: false, mensagem: `Informe ${rotulo} (dia/mês/ano).` };
  if (d > hojeIso) return { valido: false, mensagem: `${rotulo[0].toUpperCase()}${rotulo.slice(1)} não pode ser no futuro.` };
  if (d < "2000-01-01") return { valido: false, mensagem: `${rotulo[0].toUpperCase()}${rotulo.slice(1)} está antiga demais.` };
  return { valido: true, data: d };
}

function textoObrigatorio(valor, { minimo = 5, maximo = 300, rotulo }) {
  if (valor != null && typeof valor !== "string") return { valido: false, mensagem: `${rotulo} é um texto.` };
  const t = textoLimpo(valor);
  if (t.length < minimo) return { valido: false, mensagem: `Informe ${rotulo.toLowerCase()} (pelo menos ${minimo} caracteres).` };
  if (t.length > maximo) return { valido: false, mensagem: `${rotulo} tem no máximo ${maximo} caracteres.` };
  return { valido: true, texto: t };
}

module.exports = {
  CARGOS_OFICIAIS, CARGOS_ORDENACAO_CLI, NIVEIS, REQUISITO_NIVEL, TIPOS_SESSAO_CLI, TIPOS_AFM_SQL, MOTIVOS_ACEITOS, MOTIVOS_VEDADOS, MENSAGEM_VEDADO, FALTAS_PARA_PERDA, DIAS_PRAZO_AGE,
  validarJustificativa, textoDaJustificativa, apurarSequencia, providenciasDaExclusao, somarDias, fimDoMandatoReitor, situacaoReitor, avaliarNivel, licencaLiturgica,
  validarRematricula, dataDoAto, textoObrigatorio
};
