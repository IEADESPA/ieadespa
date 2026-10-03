// shared/psc.js (v7.1 — PSC: Programa de Saúde Congregacional)
//
// Regimento Art. 127-129: avaliação ANUAL obrigatória de cada congregação,
// em 5 Sinais Vitais, pela "Escada Bloqueada" — a certificação num nível
// superior depende do cumprimento integral e cumulativo do nível anterior.
//
// Princípios (os mesmos das fases anteriores):
// - O nível NUNCA é digitado: é calculado das respostas (calcularSinal /
//   calcularAvaliacao, puras) e só é CONGELADO na homologação.
// - O catálogo de critérios é editável, mas cada avaliação aberta COPIA os
//   critérios vigentes para PscRespostas: mudar o catálogo depois não reescreve
//   uma avaliação já feita.
// - Quatro etapas, feitas por pessoas diferentes (seção 2.7 do README):
//   RASCUNHO -> ENVIADA (quem preenche) -> VALIDADA (outra pessoa, no escopo)
//   -> HOMOLOGADA (CLI, nem quem enviou nem quem validou).
// - Reclassificação compulsória (Art. 129 §§2º-3º) nunca é automática: o
//   sistema só PROPÕE; a CLI decreta ou arquiva. O decreto não apaga ninguém —
//   muda a categoria, recolhe o caixa local, encerra os mandatos da diretoria
//   local e registra o encarregado; e é reversível (restabelecer).
// - Lógica de decisão pura (testável sem banco) primeiro, funções de banco
//   (finas) depois.
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const { hojeBrasilia } = require("./dataBrasilia");

const NIVEIS = [1, 2, 3, 4, 5];
const STATUS_AVALIACAO = ["RASCUNHO", "ENVIADA", "VALIDADA", "HOMOLOGADA"];
const SITUACOES_RESPOSTA = ["PENDENTE", "ATENDIDO", "NAO_ATENDIDO"];
const ROTULO_CLASSIFICACAO = {
  REPROVADA: "Reprovada no Nível 1",
  EM_DESENVOLVIMENTO: "Congregação em Desenvolvimento (Níveis 1 a 3)",
  REFERENCIA: "Congregação de Referência (Níveis 4 e 5)"
};
const LIMITE_RESPOSTAS_POR_CHAMADA = 200;
const LIMITE_LISTA_SQL = 500;

// ---------------------------------------------------------------
// Lógica pura — utilidades
// ---------------------------------------------------------------

const limpar = (v) => String(v == null ? "" : v).trim();

function somarDias(iso, dias) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + Number(dias))).toISOString().slice(0, 10);
}

function formatarDataBr(iso) {
  if (!iso) return "";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

// ---------------------------------------------------------------
// Lógica pura — a Escada Bloqueada
// ---------------------------------------------------------------

// Núcleo do cálculo, a partir de contagens por nível (é o que a visão geral
// usa: uma consulta agregada, sem baixar as respostas de todas as congregações).
// `contagens`: { [nivel]: { total, atendidos, naoAtendidos } }.
//
// Degrau por degrau, do 1 ao 5:
//  - COMPLETO     todas as alíneas atendidas -> sobe;
//  - REPROVADO    alguma alínea não atendida -> a escada para aqui, e os
//                 degraus de cima ficam BLOQUEADOS (não precisam ser
//                 respondidos: não adiantam nada enquanto este não for vencido);
//  - INCOMPLETO   sem reprovação, mas ainda há alínea por responder -> para
//                 aqui, e a avaliação NÃO está concluída;
//  - SEM_CRITERIOS nível sem nenhum critério ativo no catálogo -> transposto.
// `nivel` é o maior degrau completo sem lacuna (0 = nem o Nível 1).
function calcularSinalPorContagem(contagens) {
  const niveis = [];
  let nivel = 0;
  let parou = false;
  let concluido = true;
  let nivelDeParada = null;
  for (const n of NIVEIS) {
    const c = contagens[n] || { total: 0, atendidos: 0, naoAtendidos: 0 };
    const total = Number(c.total) || 0;
    const atendidos = Number(c.atendidos) || 0;
    const naoAtendidos = Number(c.naoAtendidos) || 0;
    const pendentes = total - atendidos - naoAtendidos;
    let situacao;
    if (parou) situacao = "BLOQUEADO";
    else if (total === 0) { situacao = "SEM_CRITERIOS"; nivel = n; }
    else if (naoAtendidos > 0) { situacao = "REPROVADO"; parou = true; nivelDeParada = n; }
    else if (pendentes > 0) { situacao = "INCOMPLETO"; parou = true; nivelDeParada = n; concluido = false; }
    else { situacao = "COMPLETO"; nivel = n; }
    niveis.push({ nivel: n, total, atendidos, naoAtendidos, pendentes, situacao });
  }
  return { nivel, concluido, nivelDeParada, niveis };
}

function contagensDeRespostas(respostas) {
  const contagens = {};
  for (const r of respostas) {
    const c = contagens[r.nivel] || (contagens[r.nivel] = { total: 0, atendidos: 0, naoAtendidos: 0 });
    c.total++;
    if (r.situacao === "ATENDIDO") c.atendidos++;
    else if (r.situacao === "NAO_ATENDIDO") c.naoAtendidos++;
  }
  return contagens;
}

function calcularSinal(respostas) {
  return calcularSinalPorContagem(contagensDeRespostas(respostas));
}

// Resultado da avaliação a partir dos resultados por Sinal Vital.
//  - reprovada no Nível 1 = QUALQUER Sinal com alínea do Nível 1 não atendida
//    (cada Sinal tem o seu próprio "Bloqueio" do Nível 1 no Art. 128);
//  - concluída = todos os Sinais com a escada resolvida;
//  - nível da congregação = o MENOR nível entre os Sinais (a escada é
//    cumulativa: a congregação só vale o que o seu Sinal mais fraco vale).
//    O Regimento não diz como consolidar os 5 Sinais num único nível; esta é
//    a leitura mais estrita e está registrada no README como decisão;
//  - classificação: 4 ou 5 = Referência; 1 a 3 = Em Desenvolvimento
//    (Art. 129 §1º); reprovada no Nível 1 não é nenhuma das duas.
function consolidarSinais(sinais) {
  const reprovadaNivel1 = sinais.some(s => s.niveis[0] && s.niveis[0].situacao === "REPROVADO");
  const concluido = sinais.length > 0 && sinais.every(s => s.concluido);
  const nivelProvisorio = sinais.length ? Math.min(...sinais.map(s => s.nivel)) : 0;
  let nivelFinal = null;
  let classificacao = null;
  if (reprovadaNivel1) {
    nivelFinal = 0;
    classificacao = "REPROVADA";
  } else if (concluido) {
    nivelFinal = nivelProvisorio;
    classificacao = nivelFinal >= 4 ? "REFERENCIA" : "EM_DESENVOLVIMENTO";
  }
  return {
    concluido, reprovadaNivel1, nivelProvisorio, nivelFinal, classificacao,
    rotuloClassificacao: classificacao ? ROTULO_CLASSIFICACAO[classificacao] : null
  };
}

// `respostas`: [{ sinalId, nivel, situacao, ... }]; `sinaisMeta`: [{ sinalId, codigo, nome, ordem }].
function calcularAvaliacao(respostas, sinaisMeta = []) {
  const porSinal = new Map();
  for (const r of respostas) {
    if (!porSinal.has(r.sinalId)) porSinal.set(r.sinalId, []);
    porSinal.get(r.sinalId).push(r);
  }
  const sinais = [];
  for (const [sinalId, itens] of porSinal) {
    const meta = sinaisMeta.find(s => s.sinalId === sinalId) || {};
    sinais.push({ sinalId, codigo: meta.codigo || null, nome: meta.nome || null, ordem: meta.ordem != null ? meta.ordem : sinalId, ...calcularSinal(itens) });
  }
  sinais.sort((a, b) => a.ordem - b.ordem || a.sinalId - b.sinalId);
  return { sinais, ...consolidarSinais(sinais) };
}

// Alíneas que impedem o envio: em cada Sinal ainda não resolvido, as pendentes
// do degrau onde a escada parou (ao responder, a escada sobe e podem surgir
// as do degrau seguinte).
function pendenciasDeEnvio(respostas, sinaisMeta = []) {
  const calculo = calcularAvaliacao(respostas, sinaisMeta);
  const pendencias = [];
  for (const sinal of calculo.sinais) {
    if (sinal.concluido) continue;
    for (const r of respostas) {
      if (r.sinalId === sinal.sinalId && r.nivel === sinal.nivelDeParada && r.situacao === "PENDENTE") pendencias.push(r.codigo);
    }
  }
  return pendencias;
}

// Monta a escada para a tela: cada Sinal com seus degraus e as alíneas de cada
// um (alínea de degrau BLOQUEADO vem marcada — não precisa de resposta).
function montarEscada(respostas, sinaisMeta = []) {
  const calculo = calcularAvaliacao(respostas, sinaisMeta);
  const sinais = calculo.sinais.map(s => ({
    ...s,
    niveis: s.niveis.map(n => ({
      ...n,
      criterios: respostas
        .filter(r => r.sinalId === s.sinalId && r.nivel === n.nivel)
        .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "pt-BR", { numeric: true }))
        .map(r => ({ ...r, bloqueada: n.situacao === "BLOQUEADO" }))
    }))
  }));
  return { ...calculo, sinais };
}

// ---------------------------------------------------------------
// Lógica pura — exercício, prazo e transições
// ---------------------------------------------------------------

// Exercício = ano civil. O prazo de envio vai até N dias depois de 31/12 do ano
// avaliado (Parâmetros, padrão 90).
function prazoEnvio(ano, prazoDias) {
  return somarDias(`${Number(ano)}-12-31`, prazoDias);
}

// `primeiroExercicio` (opcional): antes dele o PSC não existia, então não há prazo
// a cumprir — o painel de 2025 não pode pintar todas as congregações de atrasadas.
function situacaoPrazo({ ano, status, hoje, prazoDias, primeiroExercicio }) {
  const prazo = prazoEnvio(ano, prazoDias);
  let situacao;
  if (primeiroExercicio != null && Number(ano) < Number(primeiroExercicio) && !status) situacao = "NAO_SE_APLICA";
  else if (["ENVIADA", "VALIDADA", "HOMOLOGADA"].includes(status)) situacao = "CUMPRIDO";
  else if (hoje <= `${Number(ano)}-12-31`) situacao = "EM_ANDAMENTO";
  else if (hoje <= prazo) situacao = "NO_PRAZO";
  else situacao = "ATRASADO";
  return { situacao, prazoEnvio: prazo };
}

function validarAno(ano, { hoje, primeiroExercicio }) {
  const a = Number(ano);
  if (!Number.isInteger(a)) return { valido: false, mensagem: "Informe o ano do exercício." };
  if (a < primeiroExercicio) return { valido: false, mensagem: `O PSC começa a valer no exercício ${primeiroExercicio}.` };
  const anoAtual = Number(String(hoje).slice(0, 4));
  if (a > anoAtual) return { valido: false, mensagem: `O exercício ${a} ainda não começou — a avaliação é do ano corrente ou de anos anteriores.` };
  return { valido: true, ano: a };
}

const TRANSICOES = {
  enviar: { de: ["RASCUNHO"], para: "ENVIADA", verbo: "enviada" },
  validar: { de: ["ENVIADA"], para: "VALIDADA", verbo: "validada" },
  homologar: { de: ["VALIDADA"], para: "HOMOLOGADA", verbo: "homologada" },
  devolver: { de: ["ENVIADA", "VALIDADA"], para: "RASCUNHO", verbo: "devolvida" },
  reabrir: { de: ["HOMOLOGADA"], para: "RASCUNHO", verbo: "reaberta" }
};

// Estado + segregação de funções. Quem enviou não valida; quem enviou ou
// validou não homologa. Sem identificar quem age, a etapa NEGA (a regra não
// pode falhar aberta). O outro lado da segregação — quem RESPONDEU as alíneas
// também não valida nem homologa — precisa do banco e está em
// `respondeuAlgumaAlinea`.
function checarTransicao(acao, avaliacao, membroId) {
  const t = TRANSICOES[acao];
  if (!t) return { ok: false, mensagem: "Ação inválida." };
  if (!t.de.includes(avaliacao.status)) {
    return { ok: false, mensagem: `Esta avaliação está ${rotuloStatus(avaliacao.status)} e não pode ser ${t.verbo} agora.` };
  }
  const eu = Number(membroId);
  if (!Number.isInteger(eu) || eu <= 0) {
    return { ok: false, mensagem: "Não foi possível identificar quem está agindo — entre de novo no painel." };
  }
  if (acao === "validar" && eu === Number(avaliacao.enviadaPorMembroId)) {
    return { ok: false, mensagem: "Quem enviou a avaliação não pode validá-la — a validação é de outra pessoa (segregação de funções)." };
  }
  if (acao === "homologar" && (eu === Number(avaliacao.enviadaPorMembroId) || eu === Number(avaliacao.validadaPorMembroId))) {
    return { ok: false, mensagem: "Quem enviou ou validou a avaliação não pode homologá-la — a homologação é de outra pessoa (segregação de funções)." };
  }
  return { ok: true, para: t.para };
}

const MENSAGEM_PREPARADOR = "Quem preencheu as respostas desta avaliação não pode validá-la nem homologá-la — a conferência é de outra pessoa (segregação de funções).";

// Quem deu alguma resposta é o preparador da avaliação, ainda que outra pessoa
// tenha clicado em "Enviar".
function respondeuAlgumaAlinea(respostas, membroId) {
  const eu = Number(membroId);
  return respostas.some(r => Number(r.respondidaPorMembroId) === eu);
}

function rotuloStatus(status) {
  return { RASCUNHO: "em preenchimento", ENVIADA: "aguardando validação", VALIDADA: "aguardando homologação", HOMOLOGADA: "homologada" }[status] || String(status).toLowerCase();
}

// ---------------------------------------------------------------
// Lógica pura — entrada de respostas e catálogo
// ---------------------------------------------------------------

function validarEvidenciaUrl(url) {
  const u = limpar(url);
  if (!u) return { valido: true, url: null };
  if (u.length > 500) return { valido: false, mensagem: "O link da evidência passa de 500 caracteres." };
  if (/\s/.test(u)) return { valido: false, mensagem: "O link da evidência não pode ter espaços." };
  if (!/^https:\/\/[^/]/i.test(u)) return { valido: false, mensagem: "A evidência é um link https:// (foto, documento ou planilha já guardados em algum lugar)." };
  return { valido: true, url: u };
}

// Normaliza o lote de respostas enviado pela tela. Campo ausente = vazio
// (a tela sempre manda o estado completo da alínea que mexeu).
function validarRespostasEntrada(lista) {
  if (!Array.isArray(lista) || lista.length === 0) return { valido: false, mensagem: "Nenhuma resposta para salvar." };
  if (lista.length > LIMITE_RESPOSTAS_POR_CHAMADA) return { valido: false, mensagem: `No máximo ${LIMITE_RESPOSTAS_POR_CHAMADA} respostas por vez.` };
  const vistos = new Set();
  const itens = [];
  for (const bruto of lista) {
    const respostaId = Number(bruto && bruto.respostaId);
    if (!Number.isInteger(respostaId) || respostaId <= 0) return { valido: false, mensagem: "Resposta sem identificação (respostaId)." };
    if (vistos.has(respostaId)) return { valido: false, mensagem: `A resposta ${respostaId} veio repetida.` };
    vistos.add(respostaId);
    const situacao = limpar(bruto.situacao).toUpperCase();
    if (!SITUACOES_RESPOSTA.includes(situacao)) return { valido: false, mensagem: "Situação inválida — use PENDENTE, ATENDIDO ou NAO_ATENDIDO." };
    const observacao = limpar(bruto.observacao);
    if (observacao.length > 500) return { valido: false, mensagem: "A observação passa de 500 caracteres." };
    const evidencia = validarEvidenciaUrl(bruto.evidenciaUrl);
    if (!evidencia.valido) return { valido: false, mensagem: evidencia.mensagem };
    itens.push({ respostaId, situacao, observacao: observacao || null, evidenciaUrl: evidencia.url });
  }
  return { valido: true, itens };
}

function validarNovoCriterio({ sinalId, nivel, texto, orientacao } = {}) {
  const sid = Number(sinalId);
  if (!Number.isInteger(sid) || sid <= 0) return { valido: false, mensagem: "Informe o Sinal Vital." };
  const n = Number(nivel);
  if (!NIVEIS.includes(n)) return { valido: false, mensagem: "O nível deve ser de 1 a 5." };
  const t = limpar(texto);
  if (t.length < 10) return { valido: false, mensagem: "Descreva o critério (mínimo 10 caracteres)." };
  if (t.length > 600) return { valido: false, mensagem: "O critério passa de 600 caracteres." };
  const o = limpar(orientacao);
  if (o.length > 500) return { valido: false, mensagem: "A orientação passa de 500 caracteres." };
  return { valido: true, dados: { sinalId: sid, nivel: n, texto: t, orientacao: o || null } };
}

function proximaLetraLivre(codigosExistentes, prefixo) {
  const usadas = new Set(
    codigosExistentes.filter(c => String(c).startsWith(`${prefixo}.`)).map(c => String(c).slice(prefixo.length + 1))
  );
  for (let i = 0; i < 26; i++) {
    const letra = String.fromCharCode(97 + i);
    if (!usadas.has(letra)) return letra;
  }
  return null;
}

function validarParametros({ primeiroExercicio, prazoEnvioDias, exerciciosParaReclassificacao } = {}) {
  const primeiro = Number(primeiroExercicio);
  if (!Number.isInteger(primeiro) || primeiro < 2000 || primeiro > 2200) return { valido: false, mensagem: "O primeiro exercício deve ser um ano entre 2000 e 2200." };
  const prazo = Number(prazoEnvioDias);
  if (!Number.isInteger(prazo) || prazo < 0 || prazo > 365) return { valido: false, mensagem: "O prazo de envio deve ser de 0 a 365 dias depois de 31/12." };
  const exercicios = Number(exerciciosParaReclassificacao);
  if (!Number.isInteger(exercicios) || exercicios < 1 || exercicios > 10) return { valido: false, mensagem: "Os exercícios seguidos para a reclassificação devem ser de 1 a 10 (o Regimento diz 2)." };
  return { valido: true, dados: { primeiroExercicio: primeiro, prazoEnvioDias: prazo, exerciciosParaReclassificacao: exercicios } };
}

// ---------------------------------------------------------------
// Lógica pura — reclassificação compulsória (Art. 129 §§2º-3º)
// ---------------------------------------------------------------

// Reprovações seguidas (homologadas) que terminam em `anoReferencia`; se o
// próprio ano ainda não está homologado, conta a partir do anterior.
function sequenciaDeReprovacoes(historico, anoReferencia) {
  const mapa = new Map(historico.map(h => [Number(h.ano), h]));
  const homologada = (a) => { const h = mapa.get(a); return !!h && h.status === "HOMOLOGADA"; };
  let ano = homologada(anoReferencia) ? anoReferencia : anoReferencia - 1;
  let conta = 0;
  while (homologada(ano) && mapa.get(ano).reprovadaNivel1) { conta++; ano--; }
  return conta;
}

// Existe uma janela de `exercicios` anos seguidos, todos HOMOLOGADOS e
// reprovados no Nível 1, que contenha `anoHomologado`? Procura as janelas
// que terminam entre esse ano e o ano + exercícios - 1 (cobre a homologação
// fora de ordem: o ano anterior homologado DEPOIS do seguinte) e devolve a
// mais recente.
function avaliarGatilhoReclassificacao(historico, anoHomologado, exercicios) {
  const mapa = new Map(historico.map(h => [Number(h.ano), h]));
  for (let fim = anoHomologado + exercicios - 1; fim >= anoHomologado; fim--) {
    let todos = true;
    for (let a = fim - exercicios + 1; a <= fim; a++) {
      const h = mapa.get(a);
      if (!h || h.status !== "HOMOLOGADA" || !h.reprovadaNivel1) { todos = false; break; }
    }
    if (todos) return { dispara: true, anoInicial: fim - exercicios + 1, anoFinal: fim, exercicios };
  }
  return { dispara: false };
}

// Para restabelecer: uma avaliação HOMOLOGADA, de exercício POSTERIOR ao que
// motivou a reclassificação, sem reprovação no Nível 1 ("até que a unidade
// recupere os indicadores mínimos de dignidade", Art. 129 §3º, II).
function avaliacaoDeRecuperacao(historico, anoFinalDaReclassificacao) {
  return historico
    .filter(h => h.status === "HOMOLOGADA" && !h.reprovadaNivel1 && Number(h.ano) > Number(anoFinalDaReclassificacao))
    .sort((a, b) => Number(b.ano) - Number(a.ano))[0] || null;
}

function validarDecreto({ resolucao, encarregadoMembroId, congregacaoMaeId, congregacaoId } = {}) {
  const r = limpar(resolucao);
  if (r.length < 3) return { valido: false, mensagem: "Informe a resolução da CLI que decreta a reclassificação (número ou data)." };
  if (r.length > 150) return { valido: false, mensagem: "A referência da resolução passa de 150 caracteres." };
  const enc = Number(encarregadoMembroId);
  if (!Number.isInteger(enc) || enc <= 0) return { valido: false, mensagem: "Indique o encarregado que passa a gerir a unidade (matrícula) — o Regimento exige gestão por encarregado nomeado (Art. 129 §3º, II)." };
  let mae = null;
  if (congregacaoMaeId != null && limpar(congregacaoMaeId) !== "") {
    mae = Number(congregacaoMaeId);
    if (!Number.isInteger(mae) || mae <= 0) return { valido: false, mensagem: "Congregação-Mãe inválida." };
    if (mae === Number(congregacaoId)) return { valido: false, mensagem: "A Congregação-Mãe não pode ser a própria unidade rebaixada." };
  }
  return { valido: true, dados: { resolucao: r, encarregadoMembroId: enc, congregacaoMaeId: mae } };
}

function validarTextoObrigatorio(texto, rotulo, minimo = 10, maximo = 500) {
  const t = limpar(texto);
  if (t.length < minimo) return { valido: false, mensagem: `Informe ${rotulo} (mínimo ${minimo} caracteres).` };
  if (t.length > maximo) return { valido: false, mensagem: `${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)} passa de ${maximo} caracteres.` };
  return { valido: true, texto: t };
}

// ---------------------------------------------------------------
// Banco — mapeamento
// ---------------------------------------------------------------

function mapearAvaliacao(r, { hoje, parametros } = {}) {
  const h = hoje || hojeBrasilia();
  const prazoDias = parametros ? parametros.prazoEnvioDias : 90;
  return {
    avaliacaoId: r.AvaliacaoId, congregacaoId: r.CongregacaoId, congregacaoNome: r.CongregacaoNome, categoria: r.Categoria,
    ano: r.Ano, status: r.Status, rotuloStatus: rotuloStatus(r.Status),
    prazo: situacaoPrazo({ ano: r.Ano, status: r.Status, hoje: h, prazoDias, primeiroExercicio: parametros ? parametros.primeiroExercicio : undefined }),
    abertaEm: r.AbertaEm, enviadaEm: r.EnviadaEm, enviadaPorMembroId: r.EnviadaPorMembroId, enviadaPorNome: r.EnviadaPorNome || null,
    validadaEm: r.ValidadaEm, validadaPorMembroId: r.ValidadaPorMembroId, validadaPorNome: r.ValidadaPorNome || null, parecerValidacao: r.ParecerValidacao,
    homologadaEm: r.HomologadaEm, homologadaPorMembroId: r.HomologadaPorMembroId, homologadaPorNome: r.HomologadaPorNome || null, resolucaoReferencia: r.ResolucaoReferencia,
    devolvidaEm: r.DevolvidaEm, motivoDevolucao: r.MotivoDevolucao,
    nivelFinal: r.NivelFinal, reprovadaNivel1: r.ReprovadaNivel1 == null ? null : !!r.ReprovadaNivel1,
    classificacao: r.Classificacao, rotuloClassificacao: r.Classificacao ? ROTULO_CLASSIFICACAO[r.Classificacao] : null,
    ciclo: r.Ciclo, versao: r.Versao
  };
}

function mapearResposta(r) {
  return {
    respostaId: r.RespostaId, criterioId: r.CriterioId, sinalId: r.SinalId, nivel: r.Nivel, codigo: r.Codigo,
    texto: r.Texto, orientacao: r.Orientacao, situacao: r.Situacao, observacao: r.Observacao, evidenciaUrl: r.EvidenciaUrl,
    sugestaoSituacao: r.SugestaoSituacao, sugestaoSistema: r.SugestaoSistema, sugestaoEm: r.SugestaoEm,
    respondidaPorMembroId: r.RespondidaPorMembroId == null ? null : r.RespondidaPorMembroId
  };
}

// O escopo e o limite vão para o SQL: ler a tabela inteira para filtrar e cortar em
// memória custava o mesmo para quem só enxerga uma congregação, e o corte (os
// exercícios mais antigos) sumia sem aviso. Pede-se uma linha a mais que o
// limite só para saber que houve corte (`truncado`).
const LIMITE_PARAMETROS_NOMES = 1500; // o SQL Server aceita ~2100 parâmetros por consulta
function filtroPorNomes(request, coluna, nomes) {
  if (!nomes) return { sql: "", emMemoria: false };
  if (nomes.length === 0) return { sql: " AND 1 = 0", emMemoria: false };
  if (nomes.length > LIMITE_PARAMETROS_NOMES) return { sql: "", emMemoria: true };
  const marcadores = nomes.map((nome, i) => { request.input(`escopo${i}`, sql.NVarChar(150), nome); return `@escopo${i}`; });
  return { sql: ` AND ${coluna} IN (${marcadores.join(", ")})`, emMemoria: false };
}
function comTop(selectSql) {
  return selectSql.replace("SELECT ", `SELECT TOP (${LIMITE_LISTA_SQL + 1}) `);
}

const SELECT_AVALIACAO = `
  SELECT a.AvaliacaoId, a.CongregacaoId, c.Nome AS CongregacaoNome, c.Categoria, a.Ano, a.Status,
         a.AbertaEm, a.EnviadaPorMembroId, me.Nome AS EnviadaPorNome, a.EnviadaEm,
         a.ValidadaPorMembroId, mv.Nome AS ValidadaPorNome, a.ValidadaEm, a.ParecerValidacao,
         a.HomologadaPorMembroId, mh.Nome AS HomologadaPorNome, a.HomologadaEm, a.ResolucaoReferencia,
         a.DevolvidaEm, a.MotivoDevolucao, a.NivelFinal, a.ReprovadaNivel1, a.Classificacao, a.Ciclo, a.Versao
  FROM PscAvaliacoes a
  JOIN Congregacoes c ON c.CongregacaoId = a.CongregacaoId
  LEFT JOIN MembroReferencia me ON me.MembroId = a.EnviadaPorMembroId
  LEFT JOIN MembroReferencia mv ON mv.MembroId = a.ValidadaPorMembroId
  LEFT JOIN MembroReferencia mh ON mh.MembroId = a.HomologadaPorMembroId
`;

// ---------------------------------------------------------------
// Banco — parâmetros e catálogo
// ---------------------------------------------------------------

async function lerParametros(pool) {
  const r = await pool.request().query(`SELECT TOP 1 PrimeiroExercicio, PrazoEnvioDias, ExerciciosParaReclassificacao FROM PscParametros WHERE ParametroId = 1`);
  const p = r.recordset[0];
  return {
    primeiroExercicio: p ? p.PrimeiroExercicio : 2026,
    prazoEnvioDias: p ? p.PrazoEnvioDias : 90,
    exerciciosParaReclassificacao: p ? p.ExerciciosParaReclassificacao : 2
  };
}

async function atualizarParametros(pool, { dados, membroId }) {
  const antes = await lerParametros(pool);
  await pool.request()
    .input("primeiro", sql.SmallInt, dados.primeiroExercicio)
    .input("prazo", sql.Int, dados.prazoEnvioDias)
    .input("exercicios", sql.TinyInt, dados.exerciciosParaReclassificacao)
    .input("membroId", sql.Int, membroId || null)
    .query(`
      UPDATE PscParametros SET PrimeiroExercicio = @primeiro, PrazoEnvioDias = @prazo, ExerciciosParaReclassificacao = @exercicios,
             AtualizadoPorMembroId = @membroId, AtualizadoEm = SYSUTCDATETIME()
      WHERE ParametroId = 1
    `);
  await registrarAuditoria({ tabela: "PscParametros", registroId: 1, acao: "PARAMETROS_ATUALIZADOS", usuarioId: membroId, dadosAntes: antes, dadosDepois: dados });
  return { sucesso: true, mensagem: "Parâmetros do PSC atualizados.", parametros: dados };
}

async function listarCatalogo(pool, { incluirInativos = false } = {}) {
  const sinais = (await pool.request().query(`SELECT SinalId, Codigo, Nome, Descricao, ArtigoRef, Ordem, Ativo FROM PscSinaisVitais ORDER BY Ordem, SinalId`)).recordset;
  const criterios = (await pool.request().query(`
    SELECT CriterioId, SinalId, Nivel, Codigo, Texto, Orientacao, ArtigoRef, FonteAutomatica, Ordem, Ativo
    FROM PscCriterios ${incluirInativos ? "" : "WHERE Ativo = 1"} ORDER BY SinalId, Nivel, Ordem, CriterioId
  `)).recordset;
  return sinais.map(s => ({
    sinalId: s.SinalId, codigo: s.Codigo, nome: s.Nome, descricao: s.Descricao, artigoRef: s.ArtigoRef, ordem: s.Ordem, ativo: !!s.Ativo,
    niveis: NIVEIS.map(n => ({
      nivel: n,
      criterios: criterios.filter(c => c.SinalId === s.SinalId && c.Nivel === n).map(c => ({
        criterioId: c.CriterioId, codigo: c.Codigo, texto: c.Texto, orientacao: c.Orientacao, artigoRef: c.ArtigoRef,
        fonteAutomatica: c.FonteAutomatica, ordem: c.Ordem, ativo: !!c.Ativo
      }))
    }))
  }));
}

async function criarCriterio(pool, { dados, membroId }) {
  const sinal = (await pool.request().input("id", sql.Int, dados.sinalId).query(`SELECT SinalId, Ordem FROM PscSinaisVitais WHERE SinalId = @id`)).recordset[0];
  if (!sinal) return { sucesso: false, mensagem: "Sinal Vital não encontrado." };
  const existentes = (await pool.request().input("sinalId", sql.Int, dados.sinalId).input("nivel", sql.TinyInt, dados.nivel)
    .query(`SELECT Codigo, Ordem FROM PscCriterios WHERE SinalId = @sinalId AND Nivel = @nivel`)).recordset;
  const prefixo = `${sinal.Ordem}.${dados.nivel}`;
  const letra = proximaLetraLivre(existentes.map(e => e.Codigo), prefixo);
  if (!letra) return { sucesso: false, mensagem: "Este degrau já tem 26 critérios — é o máximo." };
  const ordem = existentes.reduce((m, e) => Math.max(m, e.Ordem), 0) + 1;
  const codigo = `${prefixo}.${letra}`;
  const inserido = await pool.request()
    .input("sinalId", sql.Int, dados.sinalId).input("nivel", sql.TinyInt, dados.nivel).input("codigo", sql.NVarChar(20), codigo)
    .input("texto", sql.NVarChar(600), dados.texto).input("orientacao", sql.NVarChar(500), dados.orientacao).input("ordem", sql.Int, ordem)
    .query(`
      INSERT INTO PscCriterios (SinalId, Nivel, Codigo, Texto, Orientacao, ArtigoRef, Ordem)
      OUTPUT INSERTED.CriterioId
      VALUES (@sinalId, @nivel, @codigo, @texto, @orientacao, N'Acréscimo da CLI', @ordem)
    `);
  const criterioId = inserido.recordset[0].CriterioId;
  await registrarAuditoria({ tabela: "PscCriterios", registroId: criterioId, acao: "CRITERIO_CRIADO", usuarioId: membroId, dadosAntes: null, dadosDepois: { codigo, ...dados } });
  return { sucesso: true, mensagem: `Critério ${codigo} criado. Vale para as avaliações abertas daqui em diante.`, criterioId, codigo };
}

async function atualizarCriterio(pool, { criterioId, texto, orientacao, ativo, membroId }) {
  const atual = (await pool.request().input("id", sql.Int, criterioId).query(`SELECT CriterioId, Codigo, Texto, Orientacao, Ativo FROM PscCriterios WHERE CriterioId = @id`)).recordset[0];
  if (!atual) return { sucesso: false, mensagem: "Critério não encontrado." };
  const novoTexto = texto == null ? atual.Texto : limpar(texto);
  if (novoTexto.length < 10 || novoTexto.length > 600) return { sucesso: false, mensagem: "O texto do critério deve ter de 10 a 600 caracteres." };
  const novaOrientacao = orientacao === undefined ? atual.Orientacao : (limpar(orientacao) || null);
  if (novaOrientacao && novaOrientacao.length > 500) return { sucesso: false, mensagem: "A orientação passa de 500 caracteres." };
  // Booleano de verdade: "false"/"0" em texto não pode reativar (nem desativar) um critério por coerção.
  if (ativo != null && typeof ativo !== "boolean") return { sucesso: false, mensagem: "O campo ativo deve ser verdadeiro ou falso." };
  const novoAtivo = ativo == null ? !!atual.Ativo : ativo;
  await pool.request().input("id", sql.Int, criterioId).input("texto", sql.NVarChar(600), novoTexto)
    .input("orientacao", sql.NVarChar(500), novaOrientacao).input("ativo", sql.Bit, novoAtivo)
    .query(`UPDATE PscCriterios SET Texto = @texto, Orientacao = @orientacao, Ativo = @ativo WHERE CriterioId = @id`);
  await registrarAuditoria({
    tabela: "PscCriterios", registroId: criterioId, acao: "CRITERIO_ATUALIZADO", usuarioId: membroId,
    dadosAntes: { texto: atual.Texto, orientacao: atual.Orientacao, ativo: !!atual.Ativo },
    dadosDepois: { texto: novoTexto, orientacao: novaOrientacao, ativo: novoAtivo }
  });
  return { sucesso: true, mensagem: `Critério ${atual.Codigo} atualizado. Avaliações já abertas não mudam — só as próximas.` };
}

// ---------------------------------------------------------------
// Banco — avaliação
// ---------------------------------------------------------------

async function buscarCongregacao(pool, congregacaoId) {
  const r = await pool.request().input("id", sql.Int, congregacaoId)
    .query(`SELECT CongregacaoId, Nome, Ativa, Categoria, TutelaCongregacaoMaeId, PercentualRetencaoLocal FROM Congregacoes WHERE CongregacaoId = @id`);
  return r.recordset[0] || null;
}

async function abrirAvaliacao(pool, { congregacaoId, ano, membroId, hoje = hojeBrasilia() }) {
  const congregacao = await buscarCongregacao(pool, congregacaoId);
  if (!congregacao) return { sucesso: false, mensagem: "Congregação não encontrada." };
  if (!congregacao.Ativa) return { sucesso: false, mensagem: "Esta congregação está desativada." };
  const parametros = await lerParametros(pool);
  const checagem = validarAno(ano, { hoje, primeiroExercicio: parametros.primeiroExercicio });
  if (!checagem.valido) return { sucesso: false, mensagem: checagem.mensagem };

  const existente = await pool.request().input("c", sql.Int, congregacaoId).input("a", sql.SmallInt, checagem.ano)
    .query(`SELECT AvaliacaoId FROM PscAvaliacoes WHERE CongregacaoId = @c AND Ano = @a`);
  if (existente.recordset[0]) return { sucesso: false, mensagem: `Já existe a avaliação de ${checagem.ano} desta congregação.`, avaliacaoId: existente.recordset[0].AvaliacaoId };

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let avaliacaoId;
  try {
    const inserida = await new sql.Request(transaction).input("c", sql.Int, congregacaoId).input("a", sql.SmallInt, checagem.ano).input("por", sql.Int, membroId || null)
      .query(`INSERT INTO PscAvaliacoes (CongregacaoId, Ano, AbertaPorMembroId) OUTPUT INSERTED.AvaliacaoId VALUES (@c, @a, @por)`);
    avaliacaoId = inserida.recordset[0].AvaliacaoId;
    // A foto dos critérios vigentes hoje. Sinal ou critério desativado fica de fora.
    await new sql.Request(transaction).input("id", sql.Int, avaliacaoId).query(`
      INSERT INTO PscRespostas (AvaliacaoId, CriterioId, SinalId, Nivel, Codigo, Texto, Orientacao)
      SELECT @id, c.CriterioId, c.SinalId, c.Nivel, c.Codigo, c.Texto, c.Orientacao
      FROM PscCriterios c JOIN PscSinaisVitais s ON s.SinalId = c.SinalId
      WHERE c.Ativo = 1 AND s.Ativo = 1
    `);
    const total = await new sql.Request(transaction).input("id", sql.Int, avaliacaoId).query(`SELECT COUNT(*) AS n FROM PscRespostas WHERE AvaliacaoId = @id`);
    if (total.recordset[0].n === 0) {
      await transaction.rollback();
      return { sucesso: false, mensagem: "O catálogo do PSC está vazio — não há critério ativo para avaliar." };
    }
    await transaction.commit();
  } catch (e) {
    try { await transaction.rollback(); } catch { /* transação já encerrada */ }
    if (e && (e.number === 2627 || e.number === 2601)) return { sucesso: false, mensagem: `Já existe a avaliação de ${checagem.ano} desta congregação.` };
    throw e;
  }
  await registrarAuditoria({ tabela: "PscAvaliacoes", registroId: avaliacaoId, acao: "AVALIACAO_ABERTA", usuarioId: membroId, dadosAntes: null, dadosDepois: { congregacaoId, ano: checagem.ano } });
  return { sucesso: true, mensagem: `Avaliação PSC ${checagem.ano} de ${congregacao.Nome} aberta.`, avaliacaoId };
}

async function carregarAvaliacaoBruta(pool, avaliacaoId) {
  const r = await pool.request().input("id", sql.Int, avaliacaoId).query(`${SELECT_AVALIACAO} WHERE a.AvaliacaoId = @id`);
  return r.recordset[0] || null;
}

async function carregarRespostas(pool, avaliacaoId) {
  const r = await pool.request().input("id", sql.Int, avaliacaoId).query(`
    SELECT RespostaId, CriterioId, SinalId, Nivel, Codigo, Texto, Orientacao, Situacao, Observacao, EvidenciaUrl,
           SugestaoSituacao, SugestaoSistema, CONVERT(varchar(33), SugestaoEm, 126) AS SugestaoEm, RespondidaPorMembroId
    FROM PscRespostas WHERE AvaliacaoId = @id ORDER BY SinalId, Nivel, Codigo
  `);
  return r.recordset.map(mapearResposta);
}

async function carregarSinaisMeta(pool) {
  const r = await pool.request().query(`SELECT SinalId, Codigo, Nome, Ordem FROM PscSinaisVitais`);
  return r.recordset.map(s => ({ sinalId: s.SinalId, codigo: s.Codigo, nome: s.Nome, ordem: s.Ordem }));
}

// Cabeçalho (sem as respostas), para checar estado e permissão antes de agir.
async function buscarAvaliacao(pool, avaliacaoId, { hoje, parametros } = {}) {
  const bruta = await carregarAvaliacaoBruta(pool, avaliacaoId);
  if (!bruta) return null;
  return mapearAvaliacao(bruta, { hoje, parametros: parametros || await lerParametros(pool) });
}

async function detalharAvaliacao(pool, avaliacaoId, { hoje = hojeBrasilia() } = {}) {
  const parametros = await lerParametros(pool);
  const avaliacao = await buscarAvaliacao(pool, avaliacaoId, { hoje, parametros });
  if (!avaliacao) return null;
  const respostas = await carregarRespostas(pool, avaliacaoId);
  const sinaisMeta = await carregarSinaisMeta(pool);
  const escada = montarEscada(respostas, sinaisMeta);
  const pendencias = pendenciasDeEnvio(respostas, sinaisMeta);
  // Homologada: vale o resultado congelado; antes, o calculado agora.
  const congelado = avaliacao.status === "HOMOLOGADA" && avaliacao.classificacao;
  return {
    ...avaliacao,
    editavel: avaliacao.status === "RASCUNHO",
    resultado: {
      concluido: escada.concluido, reprovadaNivel1: congelado ? avaliacao.reprovadaNivel1 : escada.reprovadaNivel1,
      nivelProvisorio: escada.nivelProvisorio,
      nivelFinal: congelado ? avaliacao.nivelFinal : escada.nivelFinal,
      classificacao: congelado ? avaliacao.classificacao : escada.classificacao,
      rotuloClassificacao: congelado ? avaliacao.rotuloClassificacao : escada.rotuloClassificacao,
      congelado: !!congelado
    },
    pendenciasEnvio: pendencias,
    sinais: escada.sinais,
    totalRespostas: respostas.length
  };
}

async function listarAvaliacoes(pool, { ano, congregacaoId, status, nomesCongregacoesPermitidas, hoje = hojeBrasilia() } = {}) {
  const parametros = await lerParametros(pool);
  const request = pool.request();
  let where = "1=1";
  if (ano) { request.input("ano", sql.SmallInt, Number(ano)); where += " AND a.Ano = @ano"; }
  if (congregacaoId) { request.input("c", sql.Int, Number(congregacaoId)); where += " AND a.CongregacaoId = @c"; }
  if (status && STATUS_AVALIACAO.includes(status)) { request.input("status", sql.NVarChar(12), status); where += " AND a.Status = @status"; }
  const escopo = filtroPorNomes(request, "c.Nome", nomesCongregacoesPermitidas);
  const r = await request.query(`${comTop(SELECT_AVALIACAO)} WHERE ${where}${escopo.sql} ORDER BY a.Ano DESC, c.Nome`);
  const itens = (escopo.emMemoria ? r.recordset.filter(x => nomesCongregacoesPermitidas.includes(x.CongregacaoNome)) : r.recordset);
  return { itens: itens.slice(0, LIMITE_LISTA_SQL).map(x => mapearAvaliacao(x, { hoje, parametros })), truncado: itens.length > LIMITE_LISTA_SQL };
}

async function salvarRespostas(pool, { avaliacao, itens, membroId }) {
  if (avaliacao.status !== "RASCUNHO") return { sucesso: false, mensagem: `A avaliação está ${rotuloStatus(avaliacao.status)} — só se responde enquanto está em preenchimento.` };
  const ids = (await pool.request().input("id", sql.Int, avaliacao.avaliacaoId).query(`SELECT RespostaId FROM PscRespostas WHERE AvaliacaoId = @id`)).recordset.map(r => r.RespostaId);
  const dela = new Set(ids);
  const alheia = itens.find(i => !dela.has(i.respostaId));
  if (alheia) return { sucesso: false, mensagem: `A resposta ${alheia.respostaId} não pertence a esta avaliação.` };

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    for (const i of itens) {
      await new sql.Request(transaction)
        .input("id", sql.Int, i.respostaId).input("situacao", sql.NVarChar(14), i.situacao)
        .input("obs", sql.NVarChar(500), i.observacao).input("url", sql.NVarChar(500), i.evidenciaUrl).input("por", sql.Int, membroId || null)
        .query(`
          UPDATE PscRespostas SET Situacao = @situacao, Observacao = @obs, EvidenciaUrl = @url,
                 RespondidaPorMembroId = CASE WHEN @situacao = 'PENDENTE' THEN NULL ELSE @por END,
                 RespondidaEm = CASE WHEN @situacao = 'PENDENTE' THEN NULL ELSE SYSUTCDATETIME() END
          WHERE RespostaId = @id
        `);
    }
    // Só mexe em quem ainda é rascunho: nunca recua uma avaliação que mudou de estado no meio.
    const atualizada = await new sql.Request(transaction).input("id", sql.Int, avaliacao.avaliacaoId)
      .query(`UPDATE PscAvaliacoes SET AtualizadaEm = SYSUTCDATETIME(), Versao = Versao + 1 WHERE AvaliacaoId = @id AND Status = 'RASCUNHO'`);
    if (atualizada.rowsAffected[0] !== 1) {
      await transaction.rollback();
      return { sucesso: false, mensagem: "A avaliação mudou de estado enquanto você respondia — recarregue a tela." };
    }
    await transaction.commit();
  } catch (e) {
    try { await transaction.rollback(); } catch { /* já encerrada */ }
    throw e;
  }
  await registrarAuditoria({
    tabela: "PscAvaliacoes", registroId: avaliacao.avaliacaoId, acao: "RESPOSTAS_SALVAS", usuarioId: membroId,
    dadosAntes: null, dadosDepois: { quantidade: itens.length, atendidas: itens.filter(i => i.situacao === "ATENDIDO").length, naoAtendidas: itens.filter(i => i.situacao === "NAO_ATENDIDO").length }
  });
  return { sucesso: true, mensagem: `${itens.length} resposta(s) salva(s).` };
}

// Muda o estado com a condição do estado anterior no UPDATE: duas pessoas
// agindo ao mesmo tempo nunca passam as duas.
async function mudarEstado(pool, { avaliacao, acao, membroId, sets, entradas, auditoria, condicao }) {
  const t = TRANSICOES[acao];
  const request = pool.request()
    .input("id", sql.Int, avaliacao.avaliacaoId).input("para", sql.NVarChar(12), t.para).input("por", sql.Int, membroId || null)
    .input("de", sql.NVarChar(12), avaliacao.status);
  for (const [nome, tipo, valor] of entradas || []) request.input(nome, tipo, valor);
  const r = await request.query(`
    UPDATE PscAvaliacoes SET Status = @para, AtualizadaEm = SYSUTCDATETIME()${sets ? ", " + sets : ""}
    WHERE AvaliacaoId = @id AND Status = @de${condicao ? " " + condicao : ""}
  `);
  if (r.rowsAffected[0] !== 1) return { sucesso: false, mensagem: "A avaliação mudou de estado enquanto você agia — recarregue a tela." };
  await registrarAuditoria({
    tabela: "PscAvaliacoes", registroId: avaliacao.avaliacaoId, acao: auditoria.acao, usuarioId: membroId,
    dadosAntes: { status: avaliacao.status }, dadosDepois: { status: t.para, ...(auditoria.depois || {}) }
  });
  return { sucesso: true };
}

async function enviarAvaliacao(pool, { avaliacao, membroId }) {
  const checagem = checarTransicao("enviar", avaliacao, membroId);
  if (!checagem.ok) return { sucesso: false, mensagem: checagem.mensagem };
  const respostas = await carregarRespostas(pool, avaliacao.avaliacaoId);
  const sinaisMeta = await carregarSinaisMeta(pool);
  const pendencias = pendenciasDeEnvio(respostas, sinaisMeta);
  if (pendencias.length > 0) {
    return { sucesso: false, mensagem: `Ainda há alínea(s) sem resposta na escada: ${pendencias.slice(0, 12).join(", ")}${pendencias.length > 12 ? "…" : ""}. Responda-as para enviar.`, pendencias };
  }
  // `Versao = @visto`: se alguém gravou resposta depois que esta checagem leu as
  // respostas, o envio não passa por cima — recarregue e confira de novo.
  const feito = await mudarEstado(pool, {
    avaliacao, acao: "enviar", membroId,
    sets: "EnviadaPorMembroId = @por, EnviadaEm = SYSUTCDATETIME(), Ciclo = Ciclo + 1, DevolvidaPorMembroId = NULL, DevolvidaEm = NULL, MotivoDevolucao = NULL",
    condicao: "AND Versao = @visto",
    entradas: [["visto", sql.Int, avaliacao.versao]],
    auditoria: { acao: "AVALIACAO_ENVIADA" }
  });
  if (!feito.sucesso) return feito;
  return { sucesso: true, mensagem: "Avaliação enviada. Ela agora aguarda a validação de outra pessoa." };
}

async function validarAvaliacao(pool, { avaliacao, parecer, membroId }) {
  const checagem = checarTransicao("validar", avaliacao, membroId);
  if (!checagem.ok) return { sucesso: false, mensagem: checagem.mensagem };
  const texto = limpar(parecer);
  if (texto.length > 1000) return { sucesso: false, mensagem: "O parecer passa de 1000 caracteres." };
  if (respondeuAlgumaAlinea(await carregarRespostas(pool, avaliacao.avaliacaoId), membroId)) return { sucesso: false, mensagem: MENSAGEM_PREPARADOR };
  const feito = await mudarEstado(pool, {
    avaliacao, acao: "validar", membroId,
    sets: "ValidadaPorMembroId = @por, ValidadaEm = SYSUTCDATETIME(), ParecerValidacao = @parecer",
    entradas: [["parecer", sql.NVarChar(1000), texto || null]],
    auditoria: { acao: "AVALIACAO_VALIDADA" }
  });
  if (!feito.sucesso) return feito;
  return { sucesso: true, mensagem: "Avaliação validada. Ela agora aguarda a homologação da CLI." };
}

async function devolverAvaliacao(pool, { avaliacao, motivo, membroId }) {
  const checagem = checarTransicao("devolver", avaliacao, membroId);
  if (!checagem.ok) return { sucesso: false, mensagem: checagem.mensagem };
  const m = validarTextoObrigatorio(motivo, "o motivo da devolução", 10, 500);
  if (!m.valido) return { sucesso: false, mensagem: m.mensagem };
  const feito = await mudarEstado(pool, {
    avaliacao, acao: "devolver", membroId,
    sets: "DevolvidaPorMembroId = @por, DevolvidaEm = SYSUTCDATETIME(), MotivoDevolucao = @motivo, EnviadaPorMembroId = NULL, EnviadaEm = NULL, ValidadaPorMembroId = NULL, ValidadaEm = NULL, ParecerValidacao = NULL",
    entradas: [["motivo", sql.NVarChar(500), m.texto]],
    auditoria: { acao: "AVALIACAO_DEVOLVIDA", depois: { motivo: m.texto } }
  });
  if (!feito.sucesso) return feito;
  return { sucesso: true, mensagem: "Avaliação devolvida para correção." };
}

// Há reclassificação (proposta, decretada ou revertida) apoiada neste exercício?
async function exercicioSustentaReclassificacao(pool, { congregacaoId, ano }) {
  const r = await pool.request().input("c", sql.Int, congregacaoId).input("a", sql.SmallInt, ano).query(`
    SELECT TOP 1 ReclassificacaoId FROM PscReclassificacoes
    WHERE CongregacaoId = @c AND Status IN ('PROPOSTA', 'DECRETADA', 'REVERTIDA') AND @a BETWEEN AnoInicial AND AnoFinal
  `);
  return r.recordset.length > 0;
}

async function reabrirAvaliacao(pool, { avaliacao, motivo, membroId }) {
  const checagem = checarTransicao("reabrir", avaliacao, membroId);
  if (!checagem.ok) return { sucesso: false, mensagem: checagem.mensagem };
  const m = validarTextoObrigatorio(motivo, "o motivo da reabertura", 10, 500);
  if (!m.valido) return { sucesso: false, mensagem: m.mensagem };
  if (await exercicioSustentaReclassificacao(pool, { congregacaoId: avaliacao.congregacaoId, ano: avaliacao.ano })) {
    return { sucesso: false, mensagem: "Este exercício sustenta uma reclassificação (proposta, decretada ou revertida). Arquive a proposta antes — um decreto não se apoia em avaliação que pode mudar." };
  }
  const feito = await mudarEstado(pool, {
    avaliacao, acao: "reabrir", membroId,
    sets: `DevolvidaPorMembroId = @por, DevolvidaEm = SYSUTCDATETIME(), MotivoDevolucao = @motivo, EnviadaPorMembroId = NULL, EnviadaEm = NULL,
           ValidadaPorMembroId = NULL, ValidadaEm = NULL, ParecerValidacao = NULL, HomologadaPorMembroId = NULL, HomologadaEm = NULL,
           ResolucaoReferencia = NULL, NivelFinal = NULL, ReprovadaNivel1 = NULL, Classificacao = NULL, ResultadoSinaisJson = NULL`,
    entradas: [["motivo", sql.NVarChar(500), m.texto]],
    auditoria: { acao: "AVALIACAO_REABERTA", depois: { motivo: m.texto } }
  });
  if (!feito.sucesso) return feito;
  return { sucesso: true, mensagem: "Avaliação reaberta para correção. O resultado oficial anterior foi desfeito." };
}

async function homologarAvaliacao(pool, { avaliacao, resolucao, membroId }) {
  const checagem = checarTransicao("homologar", avaliacao, membroId);
  if (!checagem.ok) return { sucesso: false, mensagem: checagem.mensagem };
  const r = limpar(resolucao);
  if (r.length < 3 || r.length > 150) return { sucesso: false, mensagem: "Informe a resolução da CLI que homologa (de 3 a 150 caracteres)." };
  const respostas = await carregarRespostas(pool, avaliacao.avaliacaoId);
  if (respondeuAlgumaAlinea(respostas, membroId)) return { sucesso: false, mensagem: MENSAGEM_PREPARADOR };
  const sinaisMeta = await carregarSinaisMeta(pool);
  const escada = montarEscada(respostas, sinaisMeta);
  if (!escada.concluido || escada.classificacao == null) {
    return { sucesso: false, mensagem: "A escada de algum Sinal Vital não está resolvida — devolva a avaliação para completar as respostas." };
  }
  const resultadoJson = JSON.stringify(escada.sinais.map(s => ({
    sinalId: s.sinalId, codigo: s.codigo, nivel: s.nivel, nivelDeParada: s.nivelDeParada,
    niveis: s.niveis.map(n => ({ nivel: n.nivel, situacao: n.situacao, atendidos: n.atendidos, naoAtendidos: n.naoAtendidos, total: n.total }))
  })));
  const feito = await mudarEstado(pool, {
    avaliacao, acao: "homologar", membroId,
    sets: "HomologadaPorMembroId = @por, HomologadaEm = SYSUTCDATETIME(), ResolucaoReferencia = @resolucao, NivelFinal = @nivel, ReprovadaNivel1 = @reprovada, Classificacao = @classificacao, ResultadoSinaisJson = @json",
    entradas: [
      ["resolucao", sql.NVarChar(150), r], ["nivel", sql.TinyInt, escada.nivelFinal], ["reprovada", sql.Bit, escada.reprovadaNivel1],
      ["classificacao", sql.NVarChar(20), escada.classificacao], ["json", sql.NVarChar(sql.MAX), resultadoJson]
    ],
    auditoria: { acao: "AVALIACAO_HOMOLOGADA", depois: { resolucao: r, nivelFinal: escada.nivelFinal, classificacao: escada.classificacao, reprovadaNivel1: escada.reprovadaNivel1 } }
  });
  if (!feito.sucesso) return feito;

  // A homologação já valeu; se a checagem da reclassificação falhar, não desfaz
  // nem esconde isso — avisa que ela precisa ser conferida.
  let reclassificacao = null;
  let avisoChecagem = "";
  try {
    reclassificacao = await proporReclassificacaoSeCabivel(pool, { avaliacao, reprovadaNivel1: escada.reprovadaNivel1, membroId });
  } catch (e) {
    console.error("[PSC] checagem da reclassificação falhou:", e.message);
    avisoChecagem = " Atenção: não foi possível verificar a reclassificação compulsória agora — avise a equipe técnica para conferir.";
  }
  return {
    sucesso: true,
    mensagem: `Avaliação homologada: ${escada.rotuloClassificacao}${escada.classificacao !== "REPROVADA" ? ` — nível ${escada.nivelFinal}` : ""}.` +
      (reclassificacao ? ` Atenção: ${reclassificacao.exercicios} exercícios seguidos reprovados no Nível 1 (${reclassificacao.anoInicial} a ${reclassificacao.anoFinal}) — foi aberta uma PROPOSTA de reclassificação compulsória para a CLI decidir.` : "") + avisoChecagem,
    nivelFinal: escada.nivelFinal, classificacao: escada.classificacao, reclassificacaoProposta: reclassificacao
  };
}

// ---------------------------------------------------------------
// Banco — reclassificação compulsória
// ---------------------------------------------------------------

async function historicoDeAvaliacoes(pool, congregacaoId, { anoMinimo, anoMaximo } = {}) {
  const request = pool.request().input("c", sql.Int, congregacaoId);
  let where = "CongregacaoId = @c";
  if (anoMinimo != null) { request.input("min", sql.SmallInt, anoMinimo); where += " AND Ano >= @min"; }
  if (anoMaximo != null) { request.input("max", sql.SmallInt, anoMaximo); where += " AND Ano <= @max"; }
  const r = await request.query(`SELECT AvaliacaoId, Ano, Status, ReprovadaNivel1, NivelFinal, Classificacao FROM PscAvaliacoes WHERE ${where} ORDER BY Ano`);
  return r.recordset.map(x => ({
    avaliacaoId: x.AvaliacaoId, ano: x.Ano, status: x.Status, reprovadaNivel1: x.ReprovadaNivel1 == null ? null : !!x.ReprovadaNivel1,
    nivelFinal: x.NivelFinal, classificacao: x.Classificacao
  }));
}

async function proporReclassificacaoSeCabivel(pool, { avaliacao, reprovadaNivel1, membroId }) {
  if (!reprovadaNivel1) return null;
  const congregacao = await buscarCongregacao(pool, avaliacao.congregacaoId);
  if (!congregacao || !congregacao.Ativa || congregacao.Categoria !== "CONGREGACAO") return null; // já é Extensão: não há o que rebaixar
  const parametros = await lerParametros(pool);
  const exercicios = parametros.exerciciosParaReclassificacao;
  const historico = await historicoDeAvaliacoes(pool, avaliacao.congregacaoId, {
    anoMinimo: avaliacao.ano - exercicios, anoMaximo: avaliacao.ano + exercicios
  });
  // O histórico já traz a avaliação recém-homologada (o UPDATE rodou antes).
  const gatilho = avaliarGatilhoReclassificacao(historico, avaliacao.ano, exercicios);
  if (!gatilho.dispara) return null;
  const avaliacaoGatilho = historico.find(h => h.ano === gatilho.anoFinal);
  const ja = await pool.request().input("av", sql.Int, avaliacaoGatilho.avaliacaoId).input("c", sql.Int, avaliacao.congregacaoId).query(`
    SELECT TOP 1 ReclassificacaoId FROM PscReclassificacoes
    WHERE AvaliacaoGatilhoId = @av OR (CongregacaoId = @c AND Status IN ('PROPOSTA', 'DECRETADA'))
  `);
  if (ja.recordset.length > 0) return null;
  let reclassificacaoId;
  try {
    const ins = await pool.request()
      .input("c", sql.Int, avaliacao.congregacaoId).input("ex", sql.TinyInt, exercicios)
      .input("ini", sql.SmallInt, gatilho.anoInicial).input("fim", sql.SmallInt, gatilho.anoFinal).input("av", sql.Int, avaliacaoGatilho.avaliacaoId)
      .query(`
        INSERT INTO PscReclassificacoes (CongregacaoId, ExerciciosConsecutivos, AnoInicial, AnoFinal, AvaliacaoGatilhoId)
        OUTPUT INSERTED.ReclassificacaoId VALUES (@c, @ex, @ini, @fim, @av)
      `);
    reclassificacaoId = ins.recordset[0].ReclassificacaoId;
  } catch (e) {
    if (e && (e.number === 2627 || e.number === 2601)) return null; // outra homologação simultânea já abriu
    throw e;
  }
  await registrarAuditoria({
    tabela: "PscReclassificacoes", registroId: reclassificacaoId, acao: "RECLASSIFICACAO_PROPOSTA", usuarioId: membroId,
    dadosAntes: null, dadosDepois: { congregacaoId: avaliacao.congregacaoId, anoInicial: gatilho.anoInicial, anoFinal: gatilho.anoFinal, exercicios }
  });
  return { reclassificacaoId, exercicios, anoInicial: gatilho.anoInicial, anoFinal: gatilho.anoFinal };
}

const SELECT_RECLASSIFICACAO = `
  SELECT r.ReclassificacaoId, r.CongregacaoId, c.Nome AS CongregacaoNome, c.Categoria, r.Status, r.ExerciciosConsecutivos, r.AnoInicial, r.AnoFinal,
         r.AvaliacaoGatilhoId, r.PropostaEm, r.DecididaPorMembroId, md.Nome AS DecididaPorNome, r.DecididaEm, r.ResolucaoReferencia, r.MotivoArquivamento,
         r.CongregacaoMaeId, cm.Nome AS CongregacaoMaeNome, r.EncarregadoMembroId, me.Nome AS EncarregadoNome,
         r.PercentualRetencaoAnterior, r.SaldoLocalNoDecreto, r.LiderancasEncerradas,
         r.RestabelecidaPorMembroId, mr.Nome AS RestabelecidaPorNome, r.RestabelecidaEm, r.ResolucaoRestabelecimento, r.MotivoRestabelecimento
  FROM PscReclassificacoes r
  JOIN Congregacoes c ON c.CongregacaoId = r.CongregacaoId
  LEFT JOIN Congregacoes cm ON cm.CongregacaoId = r.CongregacaoMaeId
  LEFT JOIN MembroReferencia md ON md.MembroId = r.DecididaPorMembroId
  LEFT JOIN MembroReferencia me ON me.MembroId = r.EncarregadoMembroId
  LEFT JOIN MembroReferencia mr ON mr.MembroId = r.RestabelecidaPorMembroId
`;

function mapearReclassificacao(r) {
  return {
    reclassificacaoId: r.ReclassificacaoId, congregacaoId: r.CongregacaoId, congregacaoNome: r.CongregacaoNome, categoriaAtual: r.Categoria,
    status: r.Status, exerciciosConsecutivos: r.ExerciciosConsecutivos, anoInicial: r.AnoInicial, anoFinal: r.AnoFinal,
    avaliacaoGatilhoId: r.AvaliacaoGatilhoId, propostaEm: r.PropostaEm,
    decididaPorMembroId: r.DecididaPorMembroId, decididaPorNome: r.DecididaPorNome || null, decididaEm: r.DecididaEm,
    resolucaoReferencia: r.ResolucaoReferencia, motivoArquivamento: r.MotivoArquivamento,
    congregacaoMaeId: r.CongregacaoMaeId, congregacaoMaeNome: r.CongregacaoMaeNome || null,
    encarregadoMembroId: r.EncarregadoMembroId, encarregadoNome: r.EncarregadoNome || null,
    percentualRetencaoAnterior: r.PercentualRetencaoAnterior == null ? null : Number(r.PercentualRetencaoAnterior),
    saldoLocalNoDecreto: r.SaldoLocalNoDecreto == null ? null : Number(r.SaldoLocalNoDecreto),
    liderancasEncerradas: r.LiderancasEncerradas,
    restabelecidaPorNome: r.RestabelecidaPorNome || null, restabelecidaEm: r.RestabelecidaEm,
    resolucaoRestabelecimento: r.ResolucaoRestabelecimento, motivoRestabelecimento: r.MotivoRestabelecimento
  };
}

async function buscarReclassificacao(pool, id) {
  const r = await pool.request().input("id", sql.Int, id).query(`${SELECT_RECLASSIFICACAO} WHERE r.ReclassificacaoId = @id`);
  return r.recordset[0] ? mapearReclassificacao(r.recordset[0]) : null;
}

async function listarReclassificacoes(pool, { status, nomesCongregacoesPermitidas } = {}) {
  const request = pool.request();
  let where = "1=1";
  if (status) { request.input("status", sql.NVarChar(12), status); where += " AND r.Status = @status"; }
  const escopo = filtroPorNomes(request, "c.Nome", nomesCongregacoesPermitidas);
  const r = await request.query(`${comTop(SELECT_RECLASSIFICACAO)} WHERE ${where}${escopo.sql} ORDER BY r.PropostaEm DESC`);
  const itens = (escopo.emMemoria ? r.recordset.filter(x => nomesCongregacoesPermitidas.includes(x.CongregacaoNome)) : r.recordset);
  return { itens: itens.slice(0, LIMITE_LISTA_SQL).map(mapearReclassificacao), truncado: itens.length > LIMITE_LISTA_SQL };
}

// Saldo do caixa local no momento do decreto: é o que a Tesouraria da Sede ou a
// Congregação-Mãe precisa recolher. Calculado, nunca digitado.
async function saldoLocalDaCongregacao(pool, congregacaoId) {
  const tesouraria = require("./tesouraria");
  return tesouraria.saldoCentroCusto(pool, sql, "LOCAL", congregacaoId);
}

async function decretarReclassificacao(pool, { reclassificacao, dados, membroId }) {
  if (reclassificacao.status !== "PROPOSTA") return { sucesso: false, mensagem: `Esta reclassificação está ${reclassificacao.status.toLowerCase()} — só se decreta uma proposta.` };
  const congregacao = await buscarCongregacao(pool, reclassificacao.congregacaoId);
  if (!congregacao) return { sucesso: false, mensagem: "Congregação não encontrada." };
  if (congregacao.Categoria !== "CONGREGACAO") return { sucesso: false, mensagem: "Esta unidade já não é uma Congregação." };

  const encarregado = (await pool.request().input("id", sql.Int, dados.encarregadoMembroId).query(`SELECT MembroId, Nome, Status, SituacaoMembro FROM MembroReferencia WHERE MembroId = @id`)).recordset[0];
  if (!encarregado) return { sucesso: false, mensagem: "Encarregado não encontrado — confira a matrícula." };
  // Quem assume a gestão da unidade tem de ser membro ativo e em comunhão (não desligado, falecido, em licença ou sem comunhão).
  if (encarregado.Status !== "ATIVO" || encarregado.SituacaoMembro !== "EM_COMUNHAO") {
    return { sucesso: false, mensagem: "O encarregado precisa ser membro ativo e em comunhão — confira a situação dessa matrícula." };
  }
  if (dados.congregacaoMaeId != null) {
    const mae = await buscarCongregacao(pool, dados.congregacaoMaeId);
    if (!mae || !mae.Ativa) return { sucesso: false, mensagem: "Congregação-Mãe não encontrada ou desativada." };
    if (mae.Categoria !== "CONGREGACAO") return { sucesso: false, mensagem: "A tutela só pode ser assumida por uma Congregação (não por outra Extensão da Tenda)." };
  }
  // O encarregado não pode ser quem está sendo destituído.
  const naDiretoria = await pool.request().input("c", sql.Int, congregacao.CongregacaoId).input("m", sql.Int, encarregado.MembroId).query(`
    SELECT TOP 1 LiderancaId FROM Lideranca
    WHERE MembroId = @m AND EscopoTipo = 'CONGREGACAO' AND EscopoId = @c AND (AtivoAte IS NULL OR AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))
  `);
  if (naDiretoria.recordset.length > 0) return { sucesso: false, mensagem: "O encarregado não pode ser alguém da diretoria que está sendo dissolvida." };

  const saldo = await saldoLocalDaCongregacao(pool, congregacao.CongregacaoId);
  const retencaoAnterior = Number(congregacao.PercentualRetencaoLocal);

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let liderancas;
  try {
    const rebaixada = await new sql.Request(transaction).input("c", sql.Int, congregacao.CongregacaoId).input("mae", sql.Int, dados.congregacaoMaeId)
      .query(`
        UPDATE Congregacoes SET Categoria = 'EXTENSAO_TENDA', TutelaCongregacaoMaeId = @mae, PercentualRetencaoLocal = 0
        WHERE CongregacaoId = @c AND Categoria = 'CONGREGACAO'
      `);
    if (rebaixada.rowsAffected[0] !== 1) { await transaction.rollback(); return { sucesso: false, mensagem: "A unidade mudou de categoria enquanto você decidia — recarregue a tela." }; }

    // Diretoria dissolvida: encerra o mandato de todo cargo local (escopo desta congregação).
    // "Ontem": o login confere AtivoAte < hoje (mesmo padrão das medidas cautelares).
    const dissolvidos = await new sql.Request(transaction).input("c", sql.Int, congregacao.CongregacaoId).query(`
      UPDATE Lideranca SET AtivoAte = DATEADD(day, -1, CAST(SYSUTCDATETIME() AS DATE))
      OUTPUT INSERTED.MembroId
      WHERE EscopoTipo = 'CONGREGACAO' AND EscopoId = @c AND (AtivoAte IS NULL OR AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))
    `);
    liderancas = dissolvidos.recordset.map(x => x.MembroId);

    const decretada = await new sql.Request(transaction)
      .input("id", sql.Int, reclassificacao.reclassificacaoId).input("por", sql.Int, membroId || null).input("res", sql.NVarChar(150), dados.resolucao)
      .input("mae", sql.Int, dados.congregacaoMaeId).input("enc", sql.Int, encarregado.MembroId).input("ret", sql.Decimal(5, 2), retencaoAnterior)
      .input("saldo", sql.Decimal(12, 2), saldo).input("n", sql.Int, liderancas.length)
      .query(`
        UPDATE PscReclassificacoes SET Status = 'DECRETADA', DecididaPorMembroId = @por, DecididaEm = SYSUTCDATETIME(), ResolucaoReferencia = @res,
               CongregacaoMaeId = @mae, EncarregadoMembroId = @enc, PercentualRetencaoAnterior = @ret, SaldoLocalNoDecreto = @saldo, LiderancasEncerradas = @n
        WHERE ReclassificacaoId = @id AND Status = 'PROPOSTA'
      `);
    if (decretada.rowsAffected[0] !== 1) { await transaction.rollback(); return { sucesso: false, mensagem: "A proposta mudou de estado enquanto você decidia — recarregue a tela." }; }
    await transaction.commit();
  } catch (e) {
    try { await transaction.rollback(); } catch { /* já encerrada */ }
    throw e;
  }
  // v7.6 — a diretoria dissolvida perde também as sessões abertas, na hora (antes o token valia até expirar sozinho).
  const { revogarSessoesDoMembro } = require("./auth");
  for (const membroDissolvido of new Set(liderancas)) await revogarSessoesDoMembro(pool, sql, membroDissolvido);
  await registrarAuditoria({
    tabela: "PscReclassificacoes", registroId: reclassificacao.reclassificacaoId, acao: "RECLASSIFICACAO_DECRETADA", usuarioId: membroId,
    dadosAntes: { categoria: "CONGREGACAO", percentualRetencaoLocal: retencaoAnterior },
    dadosDepois: { categoria: "EXTENSAO_TENDA", congregacaoMaeId: dados.congregacaoMaeId, encarregadoMembroId: encarregado.MembroId, resolucao: dados.resolucao, saldoLocal: saldo, membrosSemMandato: liderancas }
  });
  return {
    sucesso: true,
    mensagem: `${congregacao.Nome} passa a Extensão da Tenda${dados.congregacaoMaeId ? " sob a tutela da Congregação-Mãe indicada" : " sob a tutela da Sede"}. ` +
      `Caixa local recolhido (retenção local em 0%), ${liderancas.length} mandato(s) da diretoria encerrado(s), encarregado: ${encarregado.Nome}. ` +
      (saldo > 0 ? `Saldo local a recolher: R$ ${saldo.toFixed(2).replace(".", ",")}. ` : "") +
      "Se o encarregado ainda não tem acesso ao painel, conceda em Permissões.",
    saldoLocal: saldo, liderancasEncerradas: liderancas.length
  };
}

async function arquivarReclassificacao(pool, { reclassificacao, motivo, resolucao, membroId }) {
  if (reclassificacao.status !== "PROPOSTA") return { sucesso: false, mensagem: "Só se arquiva uma proposta em aberto." };
  const m = validarTextoObrigatorio(motivo, "o motivo do arquivamento (fundamente a decisão da CLI)", 10, 500);
  if (!m.valido) return { sucesso: false, mensagem: m.mensagem };
  const res = limpar(resolucao);
  if (res.length > 150) return { sucesso: false, mensagem: "A referência da resolução passa de 150 caracteres." };
  const r = await pool.request().input("id", sql.Int, reclassificacao.reclassificacaoId).input("por", sql.Int, membroId || null)
    .input("motivo", sql.NVarChar(500), m.texto).input("res", sql.NVarChar(150), res || null)
    .query(`
      UPDATE PscReclassificacoes SET Status = 'ARQUIVADA', DecididaPorMembroId = @por, DecididaEm = SYSUTCDATETIME(), MotivoArquivamento = @motivo, ResolucaoReferencia = @res
      WHERE ReclassificacaoId = @id AND Status = 'PROPOSTA'
    `);
  if (r.rowsAffected[0] !== 1) return { sucesso: false, mensagem: "A proposta mudou de estado enquanto você decidia — recarregue a tela." };
  await registrarAuditoria({
    tabela: "PscReclassificacoes", registroId: reclassificacao.reclassificacaoId, acao: "RECLASSIFICACAO_ARQUIVADA", usuarioId: membroId,
    dadosAntes: { status: "PROPOSTA" }, dadosDepois: { status: "ARQUIVADA", motivo: m.texto, resolucao: res || null }
  });
  return { sucesso: true, mensagem: "Proposta arquivada. A congregação segue como está." };
}

async function restabelecerReclassificacao(pool, { reclassificacao, resolucao, motivo, membroId }) {
  if (reclassificacao.status !== "DECRETADA") return { sucesso: false, mensagem: "Só se restabelece uma reclassificação decretada." };
  const res = limpar(resolucao);
  if (res.length < 3 || res.length > 150) return { sucesso: false, mensagem: "Informe a resolução da CLI que restabelece a autonomia (de 3 a 150 caracteres)." };
  const m = validarTextoObrigatorio(motivo, "o motivo do restabelecimento", 10, 500);
  if (!m.valido) return { sucesso: false, mensagem: m.mensagem };
  const historico = await historicoDeAvaliacoes(pool, reclassificacao.congregacaoId);
  const recuperacao = avaliacaoDeRecuperacao(historico, reclassificacao.anoFinal);
  if (!recuperacao) {
    return { sucesso: false, mensagem: `Para restabelecer é preciso uma avaliação HOMOLOGADA, de exercício posterior a ${reclassificacao.anoFinal}, sem reprovação no Nível 1 — a unidade tem de provar que recuperou os indicadores mínimos (Art. 129 §3º, II).` };
  }
  const retorno = reclassificacao.percentualRetencaoAnterior != null ? reclassificacao.percentualRetencaoAnterior : 40;

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const volta = await new sql.Request(transaction).input("c", sql.Int, reclassificacao.congregacaoId).input("ret", sql.Decimal(5, 2), retorno)
      .query(`
        UPDATE Congregacoes SET Categoria = 'CONGREGACAO', TutelaCongregacaoMaeId = NULL, PercentualRetencaoLocal = @ret
        WHERE CongregacaoId = @c AND Categoria = 'EXTENSAO_TENDA'
      `);
    if (volta.rowsAffected[0] !== 1) { await transaction.rollback(); return { sucesso: false, mensagem: "A unidade já não está sob tutela — recarregue a tela." }; }
    const revertida = await new sql.Request(transaction).input("id", sql.Int, reclassificacao.reclassificacaoId).input("por", sql.Int, membroId || null)
      .input("res", sql.NVarChar(150), res).input("motivo", sql.NVarChar(500), m.texto)
      .query(`
        UPDATE PscReclassificacoes SET Status = 'REVERTIDA', RestabelecidaPorMembroId = @por, RestabelecidaEm = SYSUTCDATETIME(),
               ResolucaoRestabelecimento = @res, MotivoRestabelecimento = @motivo
        WHERE ReclassificacaoId = @id AND Status = 'DECRETADA'
      `);
    if (revertida.rowsAffected[0] !== 1) { await transaction.rollback(); return { sucesso: false, mensagem: "A reclassificação mudou de estado — recarregue a tela." }; }
    await transaction.commit();
  } catch (e) {
    try { await transaction.rollback(); } catch { /* já encerrada */ }
    throw e;
  }
  await registrarAuditoria({
    tabela: "PscReclassificacoes", registroId: reclassificacao.reclassificacaoId, acao: "RECLASSIFICACAO_REVERTIDA", usuarioId: membroId,
    dadosAntes: { categoria: "EXTENSAO_TENDA", percentualRetencaoLocal: 0 },
    dadosDepois: { categoria: "CONGREGACAO", percentualRetencaoLocal: retorno, resolucao: res, avaliacaoDeRecuperacaoAno: recuperacao.ano }
  });
  return {
    sucesso: true,
    mensagem: `Autonomia restabelecida (avaliação ${recuperacao.ano} sem reprovação). Retenção local de volta a ${retorno}%. A diretoria não volta sozinha: nomeie ou eleja a nova em Permissões.`
  };
}

// A congregação está sob tutela (rebaixada a Extensão da Tenda)? Os fluxos do
// caixa local consultam isto: o dinheiro é recolhido, não gasto localmente.
async function consultarTutela(pool, congregacaoId) {
  const c = await buscarCongregacao(pool, congregacaoId);
  if (!c || c.Categoria !== "EXTENSAO_TENDA") return { sobTutela: false };
  return {
    sobTutela: true,
    mensagem: "Esta unidade foi reclassificada como Extensão da Tenda (PSC, Regimento Art. 129 §3º): o caixa local está recolhido e é gerido pela Tesouraria da Sede ou pela Congregação-Mãe."
  };
}

// ---------------------------------------------------------------
// Banco — visão geral, histórico e destinatários
// ---------------------------------------------------------------

async function montarPainel(pool, { ano, nomesCongregacoesPermitidas, hoje = hojeBrasilia() }) {
  const parametros = await lerParametros(pool);
  const anoNum = Number(ano);
  const congregacoes = (await pool.request().query(`
    SELECT c.CongregacaoId, c.Nome, c.Categoria, c.AreaId, a.Nome AS AreaNome
    FROM Congregacoes c LEFT JOIN Areas a ON a.AreaId = c.AreaId
    WHERE c.Ativa = 1 ORDER BY c.Nome
  `)).recordset.filter(c => !nomesCongregacoesPermitidas || nomesCongregacoesPermitidas.includes(c.Nome));

  const avaliacoes = (await pool.request().input("ano", sql.SmallInt, anoNum).query(`
    SELECT AvaliacaoId, CongregacaoId, Status, NivelFinal, ReprovadaNivel1, Classificacao, EnviadaEm, ValidadaEm, HomologadaEm FROM PscAvaliacoes WHERE Ano = @ano
  `)).recordset;
  const porCongregacao = new Map(avaliacoes.map(a => [a.CongregacaoId, a]));

  // Contagens por Sinal e degrau de todas as avaliações do ano numa consulta só.
  const contagensLinhas = (await pool.request().input("ano", sql.SmallInt, anoNum).query(`
    SELECT r.AvaliacaoId, r.SinalId, r.Nivel,
           COUNT(*) AS Total,
           SUM(CASE WHEN r.Situacao = 'ATENDIDO' THEN 1 ELSE 0 END) AS Atendidos,
           SUM(CASE WHEN r.Situacao = 'NAO_ATENDIDO' THEN 1 ELSE 0 END) AS NaoAtendidos
    FROM PscRespostas r JOIN PscAvaliacoes a ON a.AvaliacaoId = r.AvaliacaoId
    WHERE a.Ano = @ano GROUP BY r.AvaliacaoId, r.SinalId, r.Nivel
  `)).recordset;
  const sinaisMeta = await carregarSinaisMeta(pool);
  const porAvaliacao = new Map();
  for (const l of contagensLinhas) {
    if (!porAvaliacao.has(l.AvaliacaoId)) porAvaliacao.set(l.AvaliacaoId, new Map());
    const porSinal = porAvaliacao.get(l.AvaliacaoId);
    if (!porSinal.has(l.SinalId)) porSinal.set(l.SinalId, {});
    porSinal.get(l.SinalId)[l.Nivel] = { total: l.Total, atendidos: l.Atendidos, naoAtendidos: l.NaoAtendidos };
  }

  const historicoTodos = (await pool.request().input("ano", sql.SmallInt, anoNum).query(`
    SELECT CongregacaoId, Ano, Status, ReprovadaNivel1 FROM PscAvaliacoes WHERE Status = 'HOMOLOGADA' AND Ano <= @ano
  `)).recordset;
  const historicoPorCongregacao = new Map();
  for (const h of historicoTodos) {
    if (!historicoPorCongregacao.has(h.CongregacaoId)) historicoPorCongregacao.set(h.CongregacaoId, []);
    historicoPorCongregacao.get(h.CongregacaoId).push({ ano: h.Ano, status: h.Status, reprovadaNivel1: !!h.ReprovadaNivel1 });
  }

  const abertas = (await pool.request().query(`SELECT CongregacaoId, ReclassificacaoId, Status FROM PscReclassificacoes WHERE Status IN ('PROPOSTA', 'DECRETADA')`)).recordset;
  const reclassificacaoPorCongregacao = new Map(abertas.map(r => [r.CongregacaoId, r]));

  const linhas = congregacoes.map(c => {
    const a = porCongregacao.get(c.CongregacaoId) || null;
    let sinais = [];
    let resultado = null;
    if (a) {
      const porSinal = porAvaliacao.get(a.AvaliacaoId) || new Map();
      sinais = [...porSinal.entries()].map(([sinalId, contagens]) => {
        const meta = sinaisMeta.find(s => s.sinalId === sinalId) || {};
        return { sinalId, codigo: meta.codigo || null, nome: meta.nome || null, ordem: meta.ordem != null ? meta.ordem : sinalId, ...calcularSinalPorContagem(contagens) };
      }).sort((x, y) => x.ordem - y.ordem);
      resultado = consolidarSinais(sinais);
      if (a.Status === "HOMOLOGADA" && a.Classificacao) {
        resultado = { ...resultado, nivelFinal: a.NivelFinal, classificacao: a.Classificacao, reprovadaNivel1: !!a.ReprovadaNivel1, rotuloClassificacao: ROTULO_CLASSIFICACAO[a.Classificacao] };
      }
    }
    const status = a ? a.Status : null;
    let prazo = situacaoPrazo({ ano: anoNum, status, hoje, prazoDias: parametros.prazoEnvioDias, primeiroExercicio: parametros.primeiroExercicio });
    // Unidade já rebaixada a Extensão da Tenda não tem avaliação a entregar (só avalia se quiser provar a recuperação):
    // o painel concorda com os avisos, que também a deixam de fora.
    if (!a && c.Categoria !== "CONGREGACAO") prazo = { ...prazo, situacao: "NAO_SE_APLICA" };
    const reclass = reclassificacaoPorCongregacao.get(c.CongregacaoId) || null;
    return {
      congregacaoId: c.CongregacaoId, congregacaoNome: c.Nome, areaNome: c.AreaNome || null, categoria: c.Categoria,
      avaliacaoId: a ? a.AvaliacaoId : null, status, rotuloStatus: status ? rotuloStatus(status) : "sem avaliação aberta",
      prazo,
      sinais: sinais.map(s => ({ sinalId: s.sinalId, codigo: s.codigo, nivel: s.nivel, concluido: s.concluido })),
      nivelProvisorio: resultado ? resultado.nivelProvisorio : null,
      nivelFinal: resultado ? resultado.nivelFinal : null,
      classificacao: resultado ? resultado.classificacao : null,
      rotuloClassificacao: resultado ? resultado.rotuloClassificacao : null,
      reprovadaNivel1: resultado ? resultado.reprovadaNivel1 : null,
      reprovacoesSeguidas: sequenciaDeReprovacoes(historicoPorCongregacao.get(c.CongregacaoId) || [], anoNum),
      reclassificacao: reclass ? { reclassificacaoId: reclass.ReclassificacaoId, status: reclass.Status } : null
    };
  });

  const resumo = {
    total: linhas.length,
    semAvaliacao: linhas.filter(l => !l.status).length,
    emPreenchimento: linhas.filter(l => l.status === "RASCUNHO").length,
    aguardandoValidacao: linhas.filter(l => l.status === "ENVIADA").length,
    aguardandoHomologacao: linhas.filter(l => l.status === "VALIDADA").length,
    homologadas: linhas.filter(l => l.status === "HOMOLOGADA").length,
    atrasadas: linhas.filter(l => l.prazo.situacao === "ATRASADO").length,
    emDesenvolvimento: linhas.filter(l => l.status === "HOMOLOGADA" && l.classificacao === "EM_DESENVOLVIMENTO").length,
    referencia: linhas.filter(l => l.status === "HOMOLOGADA" && l.classificacao === "REFERENCIA").length,
    reprovadas: linhas.filter(l => l.status === "HOMOLOGADA" && l.classificacao === "REPROVADA").length
  };
  return { ano: anoNum, parametros, prazoEnvio: prazoEnvio(anoNum, parametros.prazoEnvioDias), resumo, congregacoes: linhas, sinais: sinaisMeta.sort((a, b) => a.ordem - b.ordem) };
}

async function historicoDaCongregacao(pool, congregacaoId) {
  const congregacao = await buscarCongregacao(pool, congregacaoId);
  if (!congregacao) return null;
  const parametros = await lerParametros(pool);
  const avaliacoes = (await pool.request().input("c", sql.Int, congregacaoId).query(`${SELECT_AVALIACAO} WHERE a.CongregacaoId = @c ORDER BY a.Ano DESC`)).recordset
    .map(x => mapearAvaliacao(x, { parametros }));
  const reclassificacoes = (await pool.request().input("c", sql.Int, congregacaoId).query(`${SELECT_RECLASSIFICACAO} WHERE r.CongregacaoId = @c ORDER BY r.PropostaEm DESC`)).recordset
    .map(mapearReclassificacao);
  return {
    congregacao: { congregacaoId: congregacao.CongregacaoId, nome: congregacao.Nome, categoria: congregacao.Categoria, percentualRetencaoLocal: Number(congregacao.PercentualRetencaoLocal) },
    avaliacoes, reclassificacoes
  };
}

// Quem recebe aviso de uma congregação: quem tem a permissão E um escopo que a
// alcança (GLOBAL ou algum nível acima dela). O motor de notificações resolve
// por permissão só — para o PSC isso avisaria o Pastor de uma Área sobre uma
// congregação de outra.
async function resolverDestinatariosDaCongregacao(pool, { permissao, congregacaoId }) {
  const escopo = require("./escopo");
  const { areaId, regiaoId, quadranteId, distritoId } = await escopo.ancestraisTerritoriais(pool, sql, 1, congregacaoId);
  const r = await pool.request()
    .input("permissao", sql.NVarChar(60), `%,${permissao},%`).input("congregacaoId", sql.Int, congregacaoId)
    .input("areaId", sql.Int, areaId).input("regiaoId", sql.Int, regiaoId).input("quadranteId", sql.Int, quadranteId).input("distritoId", sql.Int, distritoId)
    .query(`
      SELECT DISTINCT m.MembroId AS membroId, m.Nome AS nome, m.Email AS email
      FROM Lideranca l
      JOIN Papeis p ON p.PapelId = l.PapelId
      JOIN MembroReferencia m ON m.MembroId = l.MembroId
      WHERE (',' + p.Permissoes + ',') LIKE @permissao
        AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))
        AND (
          l.EscopoTipo IN ('GLOBAL', 'DEPARTAMENTO')
          OR (l.EscopoTipo = 'CONGREGACAO' AND l.EscopoId = @congregacaoId)
          OR (l.EscopoTipo = 'AREA' AND l.EscopoId = @areaId)
          OR (l.EscopoTipo = 'REGIAO' AND l.EscopoId = @regiaoId)
          OR (l.EscopoTipo = 'QUADRANTE' AND l.EscopoId = @quadranteId)
          OR (l.EscopoTipo = 'DISTRITO' AND l.EscopoId = @distritoId)
        )
    `);
  return r.recordset;
}

// Fatos para o motor de notificações (vB.2) — ver shared/notificacaoDetectores.js.
// Chave de deduplicação inteira: congregação * 10000 + ano (um aviso por
// exercício e congregação, por mais que a rotina diária rode).
// Cada congregação é resolvida uma vez por rodada (a escada territorial custa 5 consultas) e não uma vez por exercício pendente.
function destinatariosEmCache(pool, permissao) {
  const cache = new Map();
  return async (congregacaoId) => {
    if (!cache.has(congregacaoId)) cache.set(congregacaoId, await resolverDestinatariosDaCongregacao(pool, { permissao, congregacaoId }));
    return cache.get(congregacaoId);
  };
}

async function detectarAvaliacoesPendentes(pool, { hoje = hojeBrasilia() } = {}) {
  const parametros = await lerParametros(pool);
  const destinatariosDe = destinatariosEmCache(pool, "psc_gestao");
  const anoAtual = Number(hoje.slice(0, 4));
  const fatos = [];
  // No máximo os 5 últimos exercícios: um primeiro exercício digitado errado
  // (2000, por exemplo) não pode virar 26 varreduras por dia.
  for (let ano = Math.max(parametros.primeiroExercicio, anoAtual - 5); ano < anoAtual; ano++) {
    const prazo = prazoEnvio(ano, parametros.prazoEnvioDias);
    if (hoje <= prazo) continue;
    const pendentes = (await pool.request().input("ano", sql.SmallInt, ano).query(`
      SELECT c.CongregacaoId, c.Nome FROM Congregacoes c
      WHERE c.Ativa = 1 AND c.Categoria = 'CONGREGACAO' AND NOT EXISTS (
        SELECT 1 FROM PscAvaliacoes a WHERE a.CongregacaoId = c.CongregacaoId AND a.Ano = @ano AND a.Status IN ('ENVIADA', 'VALIDADA', 'HOMOLOGADA')
      )
    `)).recordset;
    for (const c of pendentes) {
      const destinatarios = await destinatariosDe(c.CongregacaoId);
      if (destinatarios.length === 0) continue;
      fatos.push({
        referenciaId: c.CongregacaoId * 10000 + ano, destinatarios,
        fatoGerador: `A avaliação do PSC ${ano} de ${c.Nome} não foi enviada até ${formatarDataBr(prazo)}. A avaliação anual é obrigatória (Regimento Art. 127).`
      });
    }
  }
  return fatos;
}

// A chave de aviso leva o CICLO (quantas vezes a avaliação foi enviada): devolvida e reenviada,
// ou reaberta e validada de novo, é um fato novo — a deduplicação do motor não pode engolir o segundo aviso.
const chaveDoCiclo = (avaliacaoId, ciclo) => avaliacaoId * 100 + Math.min(Number(ciclo) || 0, 99);

async function detectarAvaliacoesParaValidar(pool) {
  const r = await pool.request().query(`
    SELECT a.AvaliacaoId, a.CongregacaoId, a.Ano, a.Ciclo, c.Nome FROM PscAvaliacoes a JOIN Congregacoes c ON c.CongregacaoId = a.CongregacaoId WHERE a.Status = 'ENVIADA'
  `);
  const destinatariosDe = destinatariosEmCache(pool, "psc_gestao");
  const fatos = [];
  for (const a of r.recordset) {
    const destinatarios = await destinatariosDe(a.CongregacaoId);
    if (destinatarios.length === 0) continue;
    fatos.push({ referenciaId: chaveDoCiclo(a.AvaliacaoId, a.Ciclo), destinatarios, fatoGerador: `A avaliação do PSC ${a.Ano} de ${a.Nome} foi enviada e aguarda validação.` });
  }
  return fatos;
}

async function detectarAvaliacoesParaHomologar(pool) {
  const r = await pool.request().query(`
    SELECT a.AvaliacaoId, a.Ano, a.Ciclo, c.Nome FROM PscAvaliacoes a JOIN Congregacoes c ON c.CongregacaoId = a.CongregacaoId WHERE a.Status = 'VALIDADA'
  `);
  return r.recordset.map(a => ({ referenciaId: chaveDoCiclo(a.AvaliacaoId, a.Ciclo), fatoGerador: `A avaliação do PSC ${a.Ano} de ${a.Nome} foi validada e aguarda a homologação da CLI.` }));
}

async function detectarReclassificacoesPropostas(pool) {
  const r = await pool.request().query(`
    SELECT r.ReclassificacaoId, r.AnoInicial, r.AnoFinal, r.ExerciciosConsecutivos, c.Nome
    FROM PscReclassificacoes r JOIN Congregacoes c ON c.CongregacaoId = r.CongregacaoId WHERE r.Status = 'PROPOSTA'
  `);
  return r.recordset.map(x => ({
    referenciaId: x.ReclassificacaoId,
    fatoGerador: `${x.Nome} foi reprovada no Nível 1 do PSC por ${x.ExerciciosConsecutivos} exercícios seguidos (${x.AnoInicial} a ${x.AnoFinal}). A reclassificação compulsória (Regimento Art. 129 §2º) aguarda a decisão da CLI.`
  }));
}

module.exports = {
  // constantes
  NIVEIS, STATUS_AVALIACAO, SITUACOES_RESPOSTA, ROTULO_CLASSIFICACAO, TRANSICOES,
  // lógica pura
  somarDias, formatarDataBr, rotuloStatus,
  calcularSinalPorContagem, calcularSinal, consolidarSinais, calcularAvaliacao, pendenciasDeEnvio, montarEscada,
  prazoEnvio, situacaoPrazo, validarAno, checarTransicao, respondeuAlgumaAlinea,
  validarEvidenciaUrl, validarRespostasEntrada, validarNovoCriterio, proximaLetraLivre, validarParametros,
  sequenciaDeReprovacoes, avaliarGatilhoReclassificacao, avaliacaoDeRecuperacao, validarDecreto, validarTextoObrigatorio,
  // banco
  lerParametros, atualizarParametros, listarCatalogo, criarCriterio, atualizarCriterio,
  buscarCongregacao, abrirAvaliacao, buscarAvaliacao, detalharAvaliacao, listarAvaliacoes, salvarRespostas,
  enviarAvaliacao, validarAvaliacao, devolverAvaliacao, reabrirAvaliacao, homologarAvaliacao,
  buscarReclassificacao, listarReclassificacoes, decretarReclassificacao, arquivarReclassificacao, restabelecerReclassificacao, consultarTutela,
  montarPainel, historicoDaCongregacao, resolverDestinatariosDaCongregacao,
  detectarAvaliacoesPendentes, detectarAvaliacoesParaValidar, detectarAvaliacoesParaHomologar, detectarReclassificacoesPropostas
};
