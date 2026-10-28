// shared/consagracao.js (v8.3) — Consagração e documentação (Regimento Art. 7º, III; 9º; 10; 67; 73, II e III; 74 e 75). Regra pura: nenhuma consulta ao banco aqui
// (quem busca e grava é shared/consagracaoDb.js). Desenho em docs/plano/fase-8-ministerial-afm.md.
//
// A esteira dos processos que levam a cargo: PROTOCOLADO (documentos da indicação) → EM_ANALISE_CONSELHO (o CEI dá o parecer) → AGUARDANDO_PLENARIO (homologação: o
// Presidente valida a lista ou a CLI homologa em plenário) → HOMOLOGADO (espera a cerimônia) → CONCLUIDO (presente na cerimônia, com a taxa em dia). Integração e
// Reintegração (sem cargo) seguem a esteira simples de antes.
const { ROTULO_CARGO, ESCADA } = require("./escada");
const { somarDias, dataDoAto, textoObrigatorio } = require("./afm");

const ROTULO_ETAPA = {
  PROTOCOLADO: "Protocolado — documentos da indicação",
  EM_ANALISE_CONSELHO: "Em análise no CEI",
  AGUARDANDO_PLENARIO: "Aguardando homologação",
  HOMOLOGADO: "Homologado — aguardando a cerimônia",
  CONCLUIDO: "Consagrado",
  REPROVADO: "Encerrado"
};
const EM_ANDAMENTO = ["PROTOCOLADO", "EM_ANALISE_CONSELHO", "AGUARDANDO_PLENARIO", "HOMOLOGADO"];
const EM_ANDAMENTO_SQL = "N'PROTOCOLADO', N'EM_ANALISE_CONSELHO', N'AGUARDANDO_PLENARIO', N'HOMOLOGADO'";

// Art. 7º, III e Art. 9º: Presbítero e Ministros (Evangelista e Pastor) passam pela sabatina do CEI e são homologados pela CLI em plenário. Os demais, pelo Presidente
// (Art. 74, IV: "valida a lista dos Aptos").
const CARGOS_DA_CLI = new Set(["PRESBITERO", "EVANGELISTA", "PASTOR"]);
const homologacaoPelaCLI = (alvo) => CARGOS_DA_CLI.has(alvo);

const OCASIOES = {
  AGO: "Assembleia Geral Ordinária",
  MAGNA_CLI: "Sessão Magna da CLI",
  SOLENE_CLI: "Sessão Solene da CLI"
};
const FORMAS_TAXA = { PIX: "PIX", BOLETO: "Boleto bancário" };   // Art. 75, I, b
const FUNDAMENTOS_ESCRUTINIO = {
  TEMPO_IGNORANCIA: "O divórcio ocorreu no \"tempo da ignorância\" (antes da conversão)",
  EXCECAO_BIBLICA: "Depois da conversão, com fundamento em cláusula de exceção bíblica"
};
const DIAS_PRAZO_TAXA = 45;          // Art. 75, I, b
const VALOR_TAXA_REFERENCIA = 70;    // Art. 75, I, a (valor de 2026)
const MINIMO_COMISSAO_UNCAO = 4;     // Art. 75, IV, c

// Art. 73, III: o escrutínio especial é obrigatório para quem tem histórico de ruptura conjugal — o cadastro diz "divorciado(a)", ou o CEI marca.
const precisaEscrutinio = (estadoCivil, marcado) => estadoCivil === "DIVORCIADO" || marcado === true;
// Art. 73, II: Pastor "geralmente" casado; a exceção (b: celibato) é do CEI, por escrito.
const precisaExcecaoPastor = (alvo, estadoCivil) => alvo === "PASTOR" && estadoCivil !== "CASADO";

// Em reais, com até 2 casas. 75.40 * 100 dá 7540.000000000001 no computador: compara com folga, nunca com igualdade exata.
const centavosExatos = (v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6;
const simNao = (v) => (v === true ? true : v === false ? false : null);

// O parecer do CEI. `ctx`: { alvo, estadoCivil, hojeIso, dataProtocolo }. Devolve { valido, mensagem } ou { valido:true, parecer } com os campos prontos para gravar.
function validarParecer(corpo, ctx) {
  const c = corpo || {};
  if (c.resultado !== "APTO" && c.resultado !== "INAPTO") return { valido: false, mensagem: "O parecer é \"Apto\" ou \"Inapto\" (Regimento, Art. 74, III)." };
  const d = dataDoAto(c.sabatinaEm, ctx.hojeIso, "a data da sabatina (ou da análise)");
  if (!d.valido) return d;
  if (ctx.dataProtocolo && d.data < String(ctx.dataProtocolo).slice(0, 10)) return { valido: false, mensagem: "A sabatina não pode ser antes do protocolo do processo." };
  const f = textoObrigatorio(c.fundamentacao, { minimo: 10, maximo: 2000, rotulo: "A fundamentação do parecer" });
  if (!f.valido) return f;
  const apto = c.resultado === "APTO";
  const sab = c.sabatina || {};
  const parecer = {
    resultado: c.resultado, sabatinaEm: d.data, fundamentacao: f.texto,
    sabatinaVidaPregressa: null, sabatinaFinanceira: null, sabatinaDoutrina: null,
    escrutinioConjugal: false, escrutinioFundamento: null, escrutinioDocumental: null, recasado: null, casamentoAtualEstavel: null,
    excecaoPastorNaoCasado: null
  };
  if (homologacaoPelaCLI(ctx.alvo)) {
    parecer.sabatinaVidaPregressa = simNao(sab.vidaPregressa);
    parecer.sabatinaFinanceira = simNao(sab.regularidadeFinanceira);
    parecer.sabatinaDoutrina = simNao(sab.alinhamentoDoutrinario);
    if (apto && !(parecer.sabatinaVidaPregressa && parecer.sabatinaFinanceira && parecer.sabatinaDoutrina)) {
      return { valido: false, mensagem: "Para Presbítero, Evangelista e Pastor, o APTO pede a sabatina completa: vida pregressa e antecedentes, regularidade financeira e alinhamento doutrinário (Regimento, Art. 9º §1º)." };
    }
  }
  const esc = c.escrutinio || {};
  if (precisaEscrutinio(ctx.estadoCivil, esc.historico === true)) {
    parecer.escrutinioConjugal = true;
    parecer.escrutinioFundamento = Object.prototype.hasOwnProperty.call(FUNDAMENTOS_ESCRUTINIO, esc.fundamento) ? esc.fundamento : null;
    parecer.escrutinioDocumental = simNao(esc.documental);
    parecer.recasado = simNao(esc.recasado);
    parecer.casamentoAtualEstavel = parecer.recasado ? simNao(esc.casamentoEstavel) : null;
    if (apto) {
      if (!parecer.escrutinioFundamento) return { valido: false, mensagem: "Escrutínio especial: diga se o divórcio foi no \"tempo da ignorância\" ou com fundamento em cláusula de exceção bíblica (Regimento, Art. 73, III, c)." };
      if (parecer.escrutinioDocumental !== true) return { valido: false, mensagem: "Escrutínio especial: o CEI verifica documentalmente (Regimento, Art. 73, III, c)." };
      if (parecer.recasado === null) return { valido: false, mensagem: "Escrutínio especial: diga se a pessoa é recasada." };
      if (parecer.recasado && parecer.casamentoAtualEstavel !== true) return { valido: false, mensagem: "Recasado(a): o atual casamento precisa ser estável, legalizado e exemplar (Regimento, Art. 73, III, d)." };
    }
  }
  if (precisaExcecaoPastor(ctx.alvo, ctx.estadoCivil)) {
    if (c.excecaoPastorNaoCasado != null && c.excecaoPastorNaoCasado !== "") {
      const e = textoObrigatorio(c.excecaoPastorNaoCasado, { minimo: 10, maximo: 500, rotulo: "O motivo da exceção" });
      if (!e.valido) return e;
      parecer.excecaoPastorNaoCasado = e.texto;
    }
    if (apto && !parecer.excecaoPastorNaoCasado) {
      return { valido: false, mensagem: "Pastor não casado: o CEI escreve o motivo da exceção (por exemplo, o dom de celibato reconhecido — Regimento, Art. 73, II, b)." };
    }
  }
  return { valido: true, parecer };
}

// Art. 75, I, b: a taxa é paga até 45 dias antes da cerimônia.
const prazoDaTaxa = (dataCerimoniaIso) => somarDias(dataCerimoniaIso, -DIAS_PRAZO_TAXA);

// A taxa do processo vale para a cerimônia? { emDia, motivo }.
function situacaoDaTaxa(processo, cerimonia) {
  if (!processo || !processo.taxaPagaEm) return { emDia: false, motivo: "taxa não paga" };
  if (cerimonia) {
    const prazo = prazoDaTaxa(cerimonia.dataCerimonia);
    if (String(processo.taxaPagaEm).slice(0, 10) > prazo) return { emDia: false, motivo: `taxa paga depois do prazo (até ${br(prazo)})` };
    if (Number(processo.taxaValor) + 0.005 < Number(cerimonia.valorTaxa)) return { emDia: false, motivo: `valor pago menor que a taxa da cerimônia (R$ ${moeda(cerimonia.valorTaxa)})` };
  }
  return { emDia: true, motivo: null };
}

function validarTaxa(corpo, hojeIso) {
  const c = corpo || {};
  const d = dataDoAto(c.pagoEm, hojeIso, "a data do pagamento");
  if (!d.valido) return d;
  const valor = Number(c.valor);
  if (typeof c.valor !== "number" && typeof c.valor !== "string") return { valido: false, mensagem: "Informe o valor pago." };
  if (!Number.isFinite(valor) || valor <= 0 || valor > 10000 || !centavosExatos(valor)) return { valido: false, mensagem: "Valor pago inválido (em reais, com até 2 casas)." };
  if (!Object.prototype.hasOwnProperty.call(FORMAS_TAXA, c.forma)) return { valido: false, mensagem: "A taxa é recolhida por PIX ou boleto bancário (Regimento, Art. 75, I, b)." };
  return { valido: true, taxa: { pagoEm: d.data, valor, forma: c.forma } };
}

function validarCerimonia(corpo, hojeIso) {
  const c = corpo || {};
  const data = typeof c.dataCerimonia === "string" ? c.dataCerimonia.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(`${data}T00:00:00Z`)) || new Date(`${data}T00:00:00Z`).toISOString().slice(0, 10) !== data) {
    return { valido: false, mensagem: "Informe a data da cerimônia (dia/mês/ano)." };
  }
  if (data < somarDias(hojeIso, -366)) return { valido: false, mensagem: "A data da cerimônia está antiga demais." };
  if (data > somarDias(hojeIso, 2 * 366)) return { valido: false, mensagem: "A data da cerimônia está longe demais (no máximo 2 anos)." };
  const local = textoObrigatorio(c.local, { minimo: 3, maximo: 200, rotulo: "O local" });
  if (!local.valido) return local;
  if (!Object.prototype.hasOwnProperty.call(OCASIOES, c.ocasiao)) return { valido: false, mensagem: "A consagração ocorre na Assembleia Geral Ordinária ou em Sessão Magna ou Solene da CLI (Regimento, Art. 75)." };
  const valor = c.valorTaxa == null || c.valorTaxa === "" ? VALOR_TAXA_REFERENCIA : Number(c.valorTaxa);
  if (!Number.isFinite(valor) || valor <= 0 || valor > 10000 || !centavosExatos(valor)) return { valido: false, mensagem: "Valor da taxa inválido (em reais, com até 2 casas)." };
  return { valido: true, cerimonia: { dataCerimonia: data, local: local.texto, ocasiao: c.ocasiao, valorTaxa: valor } };
}

// Art. 75, IV, c: Comissão de Unção — pastores titulares em atividade, no mínimo 4, nenhum deles candidato na mesma cerimônia. `pastores`: [{membroId, nome, cargo,
// status, emComunhao}] lidos do banco; `candidatos`: Set dos membroId dos candidatos.
function validarComissao(pastores, candidatos) {
  const problemas = [];
  for (const p of pastores) {
    if (p.cargo !== "PASTOR") problemas.push(`${p.nome}: não é Pastor`);
    else if (p.status !== "ATIVO" || !p.emComunhao) problemas.push(`${p.nome}: não está em atividade`);
    else if (candidatos && candidatos.has(Number(p.membroId))) problemas.push(`${p.nome}: é candidato nesta cerimônia`);
  }
  const validos = pastores.length - problemas.length;
  return { valida: problemas.length === 0 && validos >= MINIMO_COMISSAO_UNCAO, validos, problemas };
}

// O roteiro da cerimônia (Art. 75, III e IV): por patente (do Auxiliar ao Pastor), casais lado a lado (III, b — quando os dois são consagrados na mesma cerimônia),
// quem vem de outra convenção como diplomação (Art. 10, parágrafo único), as insígnias por patente e as pendências (taxa). `processos`: [{consagracaoId, membroId, nome,
// cargoAlvo, modalidade, taxaPagaEm, taxaValor}]; `conjuges`: [[membroIdA, membroIdB]] dos casamentos registrados.
function montarRoteiro(cerimonia, processos, conjuges) {
  const ordem = (c) => ESCADA.indexOf(c);
  const porMembro = new Map(processos.map((p) => [Number(p.membroId), p]));
  const parDe = new Map();
  for (const [a, b] of conjuges || []) {
    if (porMembro.has(Number(a)) && porMembro.has(Number(b)) && Number(a) !== Number(b)) { parDe.set(Number(a), Number(b)); parDe.set(Number(b), Number(a)); }
  }
  const comTaxa = processos.map((p) => ({ ...p, taxa: situacaoDaTaxa(p, cerimonia) }));
  const aptos = comTaxa.filter((p) => p.taxa.emDia);
  const usados = new Set();
  const posicoes = [];
  for (const p of [...aptos].sort((x, y) => ordem(x.cargoAlvo) - ordem(y.cargoAlvo) || String(x.nome).localeCompare(String(y.nome), "pt-BR"))) {
    if (usados.has(Number(p.membroId))) continue;
    usados.add(Number(p.membroId));
    const conjuge = parDe.has(Number(p.membroId)) ? aptos.find((q) => Number(q.membroId) === parDe.get(Number(p.membroId))) : null;
    if (conjuge) usados.add(Number(conjuge.membroId));
    const pessoas = conjuge ? [p, conjuge] : [p];
    posicoes.push({
      casal: !!conjuge,
      patente: pessoas.reduce((m, q) => (ordem(q.cargoAlvo) > ordem(m) ? q.cargoAlvo : m), p.cargoAlvo),
      pessoas: pessoas.map((q) => ({ consagracaoId: q.consagracaoId, membroId: q.membroId, nome: q.nome, cargoAlvo: q.cargoAlvo, cargoRotulo: ROTULO_CARGO[q.cargoAlvo] || q.cargoAlvo,
        ato: q.modalidade === "OUTRA_CONVENCAO" ? "DIPLOMACAO" : "UNCAO" }))
    });
  }
  posicoes.sort((x, y) => ordem(x.patente) - ordem(y.patente));
  const insignias = {};
  for (const p of aptos) insignias[p.cargoAlvo] = (insignias[p.cargoAlvo] || 0) + 1;
  return {
    posicoes,
    insignias: ESCADA.filter((c) => insignias[c]).map((c) => ({ cargo: c, rotulo: ROTULO_CARGO[c], quantidade: insignias[c] })),
    pendentes: comTaxa.filter((p) => !p.taxa.emDia).map((p) => ({ consagracaoId: p.consagracaoId, membroId: p.membroId, nome: p.nome, cargoRotulo: ROTULO_CARGO[p.cargoAlvo] || p.cargoAlvo, motivo: p.taxa.motivo })),
    prazoTaxa: cerimonia ? prazoDaTaxa(cerimonia.dataCerimonia) : null
  };
}

// O texto dos documentos (o PDF põe "Certificamos que NOME (Cartão nº) " antes).
function textoDiploma({ cargoAlvo, modalidade, dataCerimonia, ocasiao }) {
  const cargo = ROTULO_CARGO[cargoAlvo] || cargoAlvo;
  const quando = `em ${br(dataCerimonia)}, na ${OCASIOES[ocasiao] || "cerimônia"}`;
  if (modalidade === "OUTRA_CONVENCAO") {
    return { titulo: `Diploma de Reconhecimento Ministerial — ${cargo}`, descricao: `teve reconhecida a sua ordenação ao cargo de ${cargo}, já recebida em outra convenção, e foi diplomado(a) ${quando}, na forma do Regimento Interno, Art. 10.` };
  }
  return { titulo: `Diploma de Consagração — ${cargo}`, descricao: `foi consagrado(a) ao cargo de ${cargo} ${quando}, na forma do Regimento Interno, Art. 75.` };
}
function textoCHM(dataIso) {
  return { titulo: "Certificado de Habilitação Ministerial (CHM)", descricao: `está habilitado(a) pela Academia de Formação Ministerial desde ${br(dataIso)}, na forma do Regimento Interno, Art. 67.` };
}

function br(iso) { return iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : ""; }
function moeda(v) { return Number(v).toFixed(2).replace(".", ","); }

module.exports = {
  ROTULO_ETAPA, EM_ANDAMENTO, EM_ANDAMENTO_SQL, CARGOS_DA_CLI, OCASIOES, FORMAS_TAXA, FUNDAMENTOS_ESCRUTINIO, DIAS_PRAZO_TAXA, VALOR_TAXA_REFERENCIA, MINIMO_COMISSAO_UNCAO,
  homologacaoPelaCLI, precisaEscrutinio, precisaExcecaoPastor, validarParecer, prazoDaTaxa, situacaoDaTaxa, validarTaxa, validarCerimonia, validarComissao, montarRoteiro,
  textoDiploma, textoCHM, br, moeda
};
