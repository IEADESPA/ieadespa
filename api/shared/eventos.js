// shared/eventos.js (v7.4 — Eventos e Congressos: governança do evento)
//
// Regra pura, sem banco. O calendário (v7.2) é o cadastro de eventos e o SITE segue dono da inscrição,
// lista de espera, check-in, certificado e programação do evento com página. Aqui ficam as duas coisas
// que o Regimento exige e o site não tem:
//
//  1) PROTOCOLO DE CONVIDADOS (Art. 111, parágrafo único e Art. 111-A): convidado externo de reputação
//     desconhecida passa por consulta ao Conselho de Ética com 10 dias de antecedência; nos eventos gerais
//     a lista vai à Presidência e SÓ depois do "Nada Consta" o convite é oficializado e divulgado.
//  2) CAIXA FLUTUANTE DE EVENTOS (Art. 53-E, §2º e §3º): a arrecadação do evento de Área/Região/Geral é
//     liquidada no custeio; o superávit é recolhido à Sede ou convertido em benfeitoria — nunca fica em
//     conta com saldo acumulado — e conta bancária paralela é infração gravíssima.
//
// Dinheiro sempre em CENTAVOS inteiros nas contas (sem erro de ponto flutuante); só vira reais na saída.
const cal = require("./calendario");
const { hojeBrasilia } = require("./dataBrasilia");

const limpar = (v) => String(v == null ? "" : v).trim();

// ---------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------

const PAPEIS_ORGANIZADOR = {
  RESPONSAVEL: "Responsável pelo evento",
  ORGANIZADOR: "Organizador (convidados)",
  TESOUREIRO: "Tesoureiro do evento (caixa)"
};

const TIPOS_CONVIDADO = { PRELETOR: "Preletor", CANTOR: "Cantor", BANDA: "Banda ou grupo", OUTRO: "Outro" };

const STATUS_CONVIDADO = {
  RASCUNHO: "Rascunho — ainda não enviado à análise",
  EM_ANALISE: "Em análise",
  AUTORIZADO: "Autorizado — convite pode ser oficializado",
  VETADO: "Vetado",
  CANCELADO: "Cancelado"
};

const CATEGORIAS_ENTRADA = {
  OFERTA_VOLUNTARIA: "Oferta voluntária do evento",
  CAMPANHA: "Campanha do evento",
  VENDAS_CANTINA: "Cantina e vendas do evento",
  OUTRA_ENTRADA: "Outra entrada"
};
const CATEGORIAS_SAIDA = {
  ESTRUTURA: "Estrutura e locação",
  ALIMENTACAO: "Alimentação",
  TRANSPORTE: "Transporte",
  HOSPEDAGEM: "Hospedagem",
  MATERIAL: "Material e divulgação",
  SOM_E_MIDIA: "Som e mídia",
  OFERTA_A_CONVIDADO: "Oferta ou ajuda de custo a convidado",
  OUTRA_SAIDA: "Outra saída"
};

const DESTINOS_SUPERAVIT = {
  RECOLHIDO_SEDE: "Recolhido à Sede Geral",
  BENFEITORIA: "Convertido em benfeitoria para o Campo"
};

const STATUS_CAIXA = { ABERTO: "Aberto", ENCERRADO: "Encerrado — aguardando a conferência", CONFERIDO: "Conferido pela Tesouraria Geral" };

// Eventos de Nível 1 e 2 são "gerais" (Lideranças Gerais): a lista de convidados vai à Presidência (Art. 111-A).
// Nos Níveis 3 a 5 a responsabilidade pelo púlpito é do Dirigente/Supervisor (Art. 111) — valendo a consulta
// ao Conselho de Ética quando a reputação é desconhecida.
const NIVEL_MAXIMO_NADA_CONSTA = 2;
const ANTECEDENCIA_ETICA_DIAS = 10;
const PRAZO_CAIXA_DIAS = 15;

// Eventos em que o convite e o caixa fazem sentido (decididos ou em planejamento, nunca perdidos).
const STATUS_EVENTO_PLANEJAVEL = ["PROPOSTO", "DEFERIDO", "HOMOLOGADO"];
const STATUS_EVENTO_COM_CAIXA = ["DEFERIDO", "HOMOLOGADO"];
// Caixa Flutuante é o regime das Áreas/Regiões e do Geral (Art. 53-E §2º); congregação usa a tesouraria local.
const ABRANGENCIAS_COM_CAIXA = ["AREAS", "CAMPO"];

// ---------------------------------------------------------------
// Dinheiro
// ---------------------------------------------------------------

function centavos(v) {
  const n = Number(typeof v === "string" ? v.replace(",", ".") : v);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}
const reais = (c) => Math.round(c) / 100;
const formatarReais = (c) => reais(c).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ---------------------------------------------------------------
// Convidados
// ---------------------------------------------------------------

function validarConvidado(d) {
  const nome = limpar(d.nome);
  if (nome.length < 3 || nome.length > 150) return { valido: false, mensagem: "O nome do convidado deve ter de 3 a 150 caracteres." };
  const tipo = limpar(d.tipo || "PRELETOR").toUpperCase();
  if (!TIPOS_CONVIDADO[tipo]) return { valido: false, mensagem: "Tipo de convidado inválido." };
  if (typeof d.reputacaoConhecida !== "boolean") {
    return { valido: false, mensagem: "Informe se a reputação do convidado é CONHECIDA da liderança (sim ou não): é o que decide se há consulta ao Conselho de Ética (Art. 111)." };
  }
  const ministerio = limpar(d.ministerioOrigem);
  if (ministerio.length > 150) return { valido: false, mensagem: "O ministério ou igreja de origem aceita até 150 caracteres." };
  const contato = limpar(d.contato);
  if (contato.length > 150) return { valido: false, mensagem: "O contato aceita até 150 caracteres." };
  const obs = limpar(d.observacaoOrganizador);
  if (obs.length > 500) return { valido: false, mensagem: "A observação aceita até 500 caracteres." };
  if (d.reputacaoConhecida === false && ministerio.length < 3) {
    return { valido: false, mensagem: "Convidado de reputação desconhecida: informe a igreja ou ministério de origem para o Conselho de Ética poder verificar." };
  }
  return {
    valido: true,
    dados: {
      nome, tipo, ministerioOrigem: ministerio || null, contato: contato || null, reputacaoConhecida: d.reputacaoConhecida,
      observacaoOrganizador: obs || null, divulgacaoAutorizada: d.divulgacaoAutorizada === true
    }
  };
}

// O que ESTE convite exige, dado o convidado e o nível do evento.
function exigenciasDoConvite({ reputacaoConhecida }, { nivel }) {
  return { exigeEtica: reputacaoConhecida === false, exigeNadaConsta: Number(nivel) <= NIVEL_MAXIMO_NADA_CONSTA };
}

// Pode enviar à análise? A consulta ao Conselho de Ética precisa de 10 dias de antecedência (Art. 111).
function avaliarSubmissao(convidado, evento, { hoje, antecedenciaDias = ANTECEDENCIA_ETICA_DIAS }) {
  if (!STATUS_EVENTO_PLANEJAVEL.includes(evento.status)) return { ok: false, mensagem: "O evento não está ativo no calendário." };
  const dias = cal.diasEntre(hoje, evento.dataInicio);
  if (dias < 0) return { ok: false, mensagem: "O evento já começou: não se convida mais ninguém para ele." };
  const ex = exigenciasDoConvite(convidado, evento);
  if (ex.exigeEtica && dias < antecedenciaDias) {
    return {
      ok: false, ...ex,
      mensagem: `Convidado de reputação desconhecida exige consulta ao Conselho de Ética com ${antecedenciaDias} dias de antecedência (Art. 111, parágrafo único) e o evento é daqui a ${dias} dia(s). Convide quem a liderança já conhece ou escolha outro nome.`
    };
  }
  return { ok: true, ...ex, diasAteEvento: dias, prazoParecerEtica: ex.exigeEtica ? cal.somarDias(evento.dataInicio, -antecedenciaDias) : null };
}

// O estado do convite depois de cada parecer. Uma negativa veta na hora; autoriza quando TODO parecer exigido é favorável.
function statusDoConvite(c) {
  if (c.status === "CANCELADO") return "CANCELADO";
  if (c.eticaParecer === "DESFAVORAVEL" || c.nadaConsta === "NEGADO") return "VETADO";
  const eticaOk = !c.exigeEtica || c.eticaParecer === "FAVORAVEL";
  const nadaOk = !c.exigeNadaConsta || c.nadaConsta === "CONCEDIDO";
  return eticaOk && nadaOk ? "AUTORIZADO" : "EM_ANALISE";
}

function validarParecer({ valor, motivo }, { favoravel, contrario, rotulo }) {
  const v = limpar(valor).toUpperCase();
  if (v !== favoravel && v !== contrario) return { valido: false, mensagem: `Decisão inválida: use ${favoravel} ou ${contrario}.` };
  const m = limpar(motivo);
  if (m.length > 500) return { valido: false, mensagem: "O motivo aceita até 500 caracteres." };
  if (v === contrario && m.length < 10) return { valido: false, mensagem: `${rotulo} contrário exige o motivo (mínimo de 10 caracteres): ele fica registrado e o organizador é informado.` };
  return { valido: true, valor: v, motivo: m || null };
}
const validarParecerEtica = (d) => validarParecer({ valor: d.parecer, motivo: d.motivo }, { favoravel: "FAVORAVEL", contrario: "DESFAVORAVEL", rotulo: "Parecer" });
const validarNadaConsta = (d) => validarParecer({ valor: d.decisao, motivo: d.motivo }, { favoravel: "CONCEDIDO", contrario: "NEGADO", rotulo: "Nada Consta" });

// Só o autorizado é oficializado; só o oficializado, com consentimento, é divulgado (Art. 111-A, §2º).
const podeOficializar = (c) => c.status === "AUTORIZADO" && !c.oficializadoEm;
const ehDivulgavel = (c) => c.status === "AUTORIZADO" && !!c.oficializadoEm && c.divulgacaoAutorizada === true;

// ---------------------------------------------------------------
// Caixa Flutuante
// ---------------------------------------------------------------

const prazoDeEncerramento = (dataFimIso, dias = PRAZO_CAIXA_DIAS) => cal.somarDias(dataFimIso, dias);

function validarLancamento(d, { eventoInicio, hoje }) {
  const tipo = limpar(d.tipo).toUpperCase();
  if (tipo !== "ENTRADA" && tipo !== "SAIDA") return { valido: false, mensagem: "Informe se é entrada ou saída." };
  const categoria = limpar(d.categoria).toUpperCase();
  const catalogo = tipo === "ENTRADA" ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA;
  if (!catalogo[categoria]) return { valido: false, mensagem: "Categoria inválida para este tipo de lançamento." };
  const c = centavos(d.valor);
  if (!Number.isFinite(c) || c <= 0) return { valido: false, mensagem: "Informe um valor maior que zero." };
  if (c > 1000000000) return { valido: false, mensagem: "Valor acima do limite aceito." };
  if (Math.abs(Number(String(d.valor).replace(",", ".")) * 100 - c) > 1e-6) return { valido: false, mensagem: "O valor aceita no máximo duas casas decimais." };
  const data = limpar(d.dataLancamento || hoje);
  if (!cal.dataIsoValida(data)) return { valido: false, mensagem: "Data do lançamento inválida." };
  if (data > hoje) return { valido: false, mensagem: "O lançamento não pode estar no futuro." };
  if (cal.diasEntre(data, eventoInicio) > 90) return { valido: false, mensagem: "O lançamento é de mais de 90 dias antes do evento: confira a data." };
  const descricao = limpar(d.descricao);
  if (descricao.length < 3 || descricao.length > 300) return { valido: false, mensagem: "Descreva o lançamento (3 a 300 caracteres)." };
  const comprovante = limpar(d.comprovante);
  if (comprovante.length > 200) return { valido: false, mensagem: "O comprovante aceita até 200 caracteres." };
  if (tipo === "SAIDA" && comprovante.length < 3) {
    return { valido: false, mensagem: "Toda saída precisa de comprovante (número da nota ou do recibo, ou link): a arrecadação e o gasto do evento são documentados para a auditoria (Art. 152, I)." };
  }
  return { valido: true, dados: { tipo, categoria, valor: reais(c), centavos: c, dataLancamento: data, descricao, comprovante: comprovante || null } };
}

// lancamentos: [{ tipo, valor, cancelado }] — os cancelados não entram na conta.
function totaisDoCaixa(lancamentos) {
  let entradas = 0, saidas = 0;
  for (const l of lancamentos) {
    if (l.cancelado) continue;
    const c = centavos(l.valor);
    if (l.tipo === "ENTRADA") entradas += c; else saidas += c;
  }
  return { entradasCentavos: entradas, saidasCentavos: saidas, saldoCentavos: entradas - saidas, entradas: reais(entradas), saidas: reais(saidas), saldo: reais(entradas - saidas) };
}

// Encerramento (Art. 53-E §2º, II): superávit TODO destinado; déficit explicado; nada sobra em conta.
function validarEncerramento({ saldoCentavos, destinos, justificativaDeficit }, { hoje = hojeBrasilia() } = {}) {
  const lista = Array.isArray(destinos) ? destinos : [];
  if (saldoCentavos < 0) {
    const j = limpar(justificativaDeficit);
    if (j.length < 10 || j.length > 500) return { valido: false, mensagem: "O caixa fechou no negativo: explique o déficit (10 a 500 caracteres) para a Tesouraria Geral." };
    if (lista.length) return { valido: false, mensagem: "Caixa no negativo não tem superávit para destinar." };
    return { valido: true, destinos: [], justificativaDeficit: j };
  }
  if (saldoCentavos === 0) {
    if (lista.length) return { valido: false, mensagem: "O caixa fechou zerado: não há superávit para destinar." };
    return { valido: true, destinos: [], justificativaDeficit: null };
  }
  if (lista.length === 0) {
    return { valido: false, mensagem: `Sobrou ${formatarReais(saldoCentavos)} no caixa. O superávit deve ser recolhido à Sede Geral ou convertido em benfeitoria para o Campo — não pode ficar com a Área ou a Região (Art. 53-E, §2º, II).` };
  }
  const normalizados = [];
  let soma = 0;
  for (const [i, x] of lista.entries()) {
    const tipo = limpar(x.tipo).toUpperCase();
    if (!DESTINOS_SUPERAVIT[tipo]) return { valido: false, mensagem: `Destino ${i + 1}: use "recolhido à Sede" ou "benfeitoria".` };
    const c = centavos(x.valor);
    if (!Number.isFinite(c) || c <= 0) return { valido: false, mensagem: `Destino ${i + 1}: informe um valor maior que zero.` };
    const data = limpar(x.data || hoje);
    if (!cal.dataIsoValida(data) || data > hoje) return { valido: false, mensagem: `Destino ${i + 1}: data inválida ou no futuro.` };
    const comprovante = limpar(x.comprovante);
    if (comprovante.length < 3 || comprovante.length > 200) return { valido: false, mensagem: `Destino ${i + 1}: informe o comprovante (depósito, recibo da Sede, nota da benfeitoria).` };
    const descricao = limpar(x.descricao);
    if (tipo === "BENFEITORIA" && descricao.length < 5) return { valido: false, mensagem: `Destino ${i + 1}: descreva a benfeitoria.` };
    if (descricao.length > 300) return { valido: false, mensagem: `Destino ${i + 1}: a descrição aceita até 300 caracteres.` };
    soma += c;
    normalizados.push({ tipo, valor: reais(c), centavos: c, dataDestino: data, comprovante, descricao: descricao || null });
  }
  if (soma !== saldoCentavos) {
    return { valido: false, mensagem: `Os destinos somam ${formatarReais(soma)} e o superávit é ${formatarReais(saldoCentavos)}: o saldo inteiro precisa ter destino, sem sobra nem falta.` };
  }
  return { valido: true, destinos: normalizados, justificativaDeficit: null };
}

function situacaoDoCaixa({ status, prazoEm }, hoje) {
  if (status === "CONFERIDO") return { fase: "CONFERIDO", atrasado: false, diasAtraso: 0 };
  if (status === "ENCERRADO") return { fase: "ENCERRADO", atrasado: false, diasAtraso: 0 };
  const atraso = cal.diasEntre(prazoEm, hoje);
  return atraso > 0 ? { fase: "ABERTO_ATRASADO", atrasado: true, diasAtraso: atraso } : { fase: "ABERTO_NO_PRAZO", atrasado: false, diasAtraso: 0, diasRestantes: Math.max(0, -atraso) };
}

// O caixa só abre para o evento certo: decidido, de Área/Região/Geral, e nunca de congregação (usa a tesouraria local).
function avaliarAberturaDeCaixa(evento, declarou) {
  if (!STATUS_EVENTO_COM_CAIXA.includes(evento.status)) return { ok: false, mensagem: "Só se abre caixa para evento já deferido ou homologado no calendário." };
  if (!ABRANGENCIAS_COM_CAIXA.includes(evento.abrangencia)) {
    return { ok: false, mensagem: "O Caixa Flutuante é o regime dos eventos de Área, Região e Geral (Art. 53-E, §2º). O evento de uma congregação usa a tesouraria da própria congregação." };
  }
  if (declarou !== true) {
    return { ok: false, mensagem: "Confirme a declaração: nenhuma conta bancária foi aberta para este evento e o dinheiro não passará por conta paralela em nome da Igreja ou de associação (Art. 53-E, §3º)." };
  }
  return { ok: true };
}

module.exports = {
  PAPEIS_ORGANIZADOR, TIPOS_CONVIDADO, STATUS_CONVIDADO, CATEGORIAS_ENTRADA, CATEGORIAS_SAIDA, DESTINOS_SUPERAVIT, STATUS_CAIXA,
  NIVEL_MAXIMO_NADA_CONSTA, ANTECEDENCIA_ETICA_DIAS, PRAZO_CAIXA_DIAS, STATUS_EVENTO_PLANEJAVEL, STATUS_EVENTO_COM_CAIXA, ABRANGENCIAS_COM_CAIXA,
  centavos, reais, formatarReais,
  validarConvidado, exigenciasDoConvite, avaliarSubmissao, statusDoConvite, validarParecerEtica, validarNadaConsta, podeOficializar, ehDivulgavel,
  prazoDeEncerramento, validarLancamento, totaisDoCaixa, validarEncerramento, situacaoDoCaixa, avaliarAberturaDeCaixa
};
