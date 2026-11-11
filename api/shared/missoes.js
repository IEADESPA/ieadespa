// shared/missoes.js — v9.4: Missões (campos, envio de missionários, sustento e relatórios de campo). A regra pura, sem banco; o banco está em missoesDb.js.
// Regimento Art. 23 e 24 §2º (parecer da CME), Art. 43 e 44 (SEMIADESPA; §1º frentes no município; §2º outros Estados ou Países e convênios externos: CLI e
// Pastor Presidente), Art. 133-C §2º (sem prestação de contas, nada de recurso novo) e Art. 134 §6º, I (sustento só por determinação expressa).
// Desenho em docs/plano/fase-9-entidades-vinculadas.md ("Desenho da v9.4").
const { texto, idDe, booleano, br, UFS, chaveDeComparacao, diasEntre } = require("./entidadesVinculadas");
const { PARECERES, RESULTADOS_CLI, PRAZO_PARECER_DIAS, prazoParecer, validarParecer, validarDecisao, validarMotivo } = require("./expansao");

const ABRANGENCIAS = {
  LOCAL: "Local (Parauapebas e zona rural adjacente)",
  ESTADUAL: "Estadual (outra cidade do Pará)",
  NACIONAL: "Nacional (outro Estado)",
  TRANSCULTURAL: "Transcultural (outro país)"
};
const DIVULGACOES = { PUBLICA: "Pública (aparece no mural)", RESTRITA: "Restrita (no mural, só na contagem)" };
const STATUS_CAMPO = { ATIVO: "Ativo", ENCERRADO: "Encerrado" };
const STATUS_ENVIO = {
  EM_PARECER: "Aguardando o parecer da CME",
  AGUARDANDO_CLI: "Aguardando a decisão da CLI",
  AGUARDANDO_PRESIDENTE: "Aguardando o Pastor Presidente",
  ATIVO: "Ativo (no campo)",
  ENCERRADO: "Encerrado",
  REJEITADO: "Recusado",
  DESISTIDO: "Desistência"
};
const EM_ANDAMENTO = ["EM_PARECER", "AGUARDANDO_CLI", "AGUARDANDO_PRESIDENTE"];
const VIVOS = [...EM_ANDAMENTO, "ATIVO"];
const PERIODICIDADES = { MENSAL: "Mensal", TRIMESTRAL: "Trimestral" };
const MESES_DO_PERIODO = { MENSAL: 1, TRIMESTRAL: 3 };
const FONTES = { GERAL: "Tesouro Geral", CONGREGACAO: "Caixa local da congregação mantenedora" };
const RESULTADOS_PRESIDENTE = { CONCORDA: "Concorda", RECUSA: "Recusa" };
// O relatório de um período vence no dia 10 do mês seguinte ao fim dele.
const DIA_PRAZO_RELATORIO = 10;
const SUSTENTO_MAXIMO = 100000;
const NUMERO_MAXIMO = 100000;
// A categoria de Saída do Contas a Pagar de cada fonte (migração 169).
const CATEGORIA_SAIDA = { GERAL: "SUSTENTO_MISSIONARIO", CONGREGACAO: "SUSTENTO_MISSIONARIO_LOCAL" };
const MIME_DOCUMENTO = ["application/pdf", "image/jpeg", "image/png"];

// ---------------------------------------------------------------- meses ----------------------------------------------------------------
const MES_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const mesValido = (m) => typeof m === "string" && MES_RE.test(m);
const mesDe = (dataIso) => String(dataIso).slice(0, 7);
const indiceDoMes = (mes) => { const [a, m] = mes.split("-").map(Number); return a * 12 + (m - 1); };
const mesDoIndice = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
const somarMeses = (mes, k) => mesDoIndice(indiceDoMes(mes) + k);
const mesesEntre = (de, ate) => indiceDoMes(ate) - indiceDoMes(de);
const mesBr = (mes) => (mes ? `${mes.slice(5, 7)}/${mes.slice(0, 4)}` : "");

// ---------------------------------------------------------------- o campo ----------------------------------------------------------------
const ehBrasil = (pais) => ["brasil", "brazil"].includes(chaveDeComparacao(pais));
// "Zonas rurais adjacentes" (Art. 44 §1º): a zona rural de Parauapebas e a dos municípios que fazem divisa com ele — uma lista fechada, para a marca não virar escolha
// (revisão de 05/11/2026: com a marca livre, Belém ou Marabá-cidade ficariam "Local" e escapariam da CME e da CLI). Decisão que o responsável pode mudar.
const MUNICIPIOS_ZONA_RURAL = ["Parauapebas", "Canaã dos Carajás", "Curionópolis", "Eldorado do Carajás", "Marabá", "Água Azul do Norte", "São Félix do Xingu"];
const zonaRuralAceita = (cidade) => MUNICIPIOS_ZONA_RURAL.some((m) => chaveDeComparacao(m) === chaveDeComparacao(cidade));
// A abrangência sai do lugar, nunca da escolha de quem cadastra: é ela que diz por onde o envio passa (Art. 44 §§1º e 2º).
function abrangenciaDe({ pais, uf, cidade, zonaRural }) {
  if (!ehBrasil(pais)) return "TRANSCULTURAL";
  if (uf !== "PA") return "NACIONAL";
  if (chaveDeComparacao(cidade) === "parauapebas" || (zonaRural && zonaRuralAceita(cidade))) return "LOCAL";
  return "ESTADUAL";
}

function validarCampo(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const nome = texto(d.nome, { minimo: 2, maximo: 150, rotulo: "O nome do campo" });
  if (!nome.valido) return nome;
  const paisT = texto(d.pais, { minimo: 2, maximo: 80, rotulo: "O país", obrigatorio: false });
  if (!paisT.valido) return paisT;
  const pais = paisT.texto || "Brasil";
  const zonaRural = booleano(d.zonaRural);
  let uf = null, cidade = null;
  if (ehBrasil(pais)) {
    uf = typeof d.uf === "string" ? d.uf.trim().toUpperCase() : "";
    if (!UFS.includes(uf)) return { valido: false, mensagem: "Escolha a UF do campo." };
    const c = texto(d.cidade, { minimo: 2, maximo: 150, rotulo: "A cidade do campo" });
    if (!c.valido) return c;
    cidade = c.texto;
    if (zonaRural && (uf !== "PA" || !zonaRuralAceita(cidade))) {
      return { valido: false, mensagem: `A zona rural adjacente (Regimento, Art. 44 §1º) é a de Parauapebas ou de um município vizinho: ${MUNICIPIOS_ZONA_RURAL.join(", ")} (PA).` };
    }
  } else {
    if (zonaRural) return { valido: false, mensagem: "A zona rural adjacente é a de Parauapebas, no Pará (Regimento, Art. 44 §1º)." };
    const c = texto(d.cidade, { minimo: 2, maximo: 150, rotulo: "A cidade do campo", obrigatorio: false });
    if (!c.valido) return c;
    cidade = c.texto;
  }
  let congregacaoMantenedoraId = null;
  if (d.congregacaoMantenedoraId != null && d.congregacaoMantenedoraId !== "") {
    congregacaoMantenedoraId = idDe(d.congregacaoMantenedoraId);
    if (!congregacaoMantenedoraId) return { valido: false, mensagem: "Congregação mantenedora inválida." };
  }
  const divulgacao = typeof d.divulgacao === "string" && d.divulgacao ? d.divulgacao.toUpperCase() : "RESTRITA";
  if (!DIVULGACOES[divulgacao]) return { valido: false, mensagem: "A divulgação do campo é pública ou restrita." };
  const descricao = texto(d.descricao, { maximo: 1000, rotulo: "A descrição", obrigatorio: false, multilinha: true });
  if (!descricao.valido) return descricao;
  const dadosOk = { nome: nome.texto, pais: ehBrasil(pais) ? "Brasil" : pais, uf, cidade, zonaRural: ehBrasil(pais) && uf === "PA" && zonaRural,
    congregacaoMantenedoraId, divulgacao, descricao: descricao.texto };
  dadosOk.abrangencia = abrangenciaDe({ pais: dadosOk.pais, uf, cidade, zonaRural: dadosOk.zonaRural });
  return { valido: true, dados: dadosOk };
}
// O lugar de um campo com envio vivo não muda: a abrangência decidiu por onde o envio passou.
const mudouOLugar = (antes, depois) => antes.pais !== depois.pais || (antes.uf || null) !== (depois.uf || null)
  || chaveDeComparacao(antes.cidade) !== chaveDeComparacao(depois.cidade) || !!antes.zonaRural !== !!depois.zonaRural;

// ---------------------------------------------------------------- o envio ----------------------------------------------------------------
// Dinheiro: número (ou texto "1500,00"/"1500.00"), de 0 a 100.000, com até 2 casas.
function valorDe(v) {
  let n = v;
  if (typeof v === "string") {
    const t = v.trim().replace(/\s/g, "");
    if (!/^\d{1,9}([.,]\d{1,2})?$/.test(t)) return null;
    n = Number(t.replace(",", "."));
  }
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > SUSTENTO_MAXIMO) return null;
  if (Math.abs(Math.round(n * 100) - n * 100) > 1e-6) return null;
  return Math.round(n * 100) / 100;
}
function inteiroDe(v) {
  const n = typeof v === "string" && /^\d{1,6}$/.test(v.trim()) ? Number(v.trim()) : v;
  return Number.isInteger(n) && n >= 0 && n <= NUMERO_MAXIMO ? n : null;
}

// A fonte, a congregação e quem recebe, quando há sustento; sem sustento, nada disso vale.
function validarDinheiro(d, { rotuloValor = "O sustento mensal" } = {}) {
  const sustento = valorDe(d.sustento == null || d.sustento === "" ? 0 : d.sustento);
  if (sustento === null) return { valido: false, mensagem: `${rotuloValor} é um valor de R$ 0,00 a R$ ${SUSTENTO_MAXIMO.toLocaleString("pt-BR")},00, com até 2 casas.` };
  if (sustento === 0) return { valido: true, dados: { sustento: 0, fonte: null, congregacaoFonteId: null, fornecedorId: null } };
  const fonte = typeof d.fonte === "string" ? d.fonte.toUpperCase() : "";
  if (!FONTES[fonte]) return { valido: false, mensagem: "Escolha de onde sai o sustento: o Tesouro Geral ou o caixa local da congregação mantenedora." };
  const fornecedorId = idDe(d.fornecedorId);
  if (!fornecedorId) return { valido: false, mensagem: "Escolha quem recebe o sustento (um fornecedor do Contas a Pagar)." };
  // o caixa local é sempre o da congregação mantenedora do campo (o banco a põe aqui; revisão de 05/11/2026: antes dava para escolher qualquer congregação)
  return { valido: true, dados: { sustento, fonte, congregacaoFonteId: null, fornecedorId } };
}

function validarEnvio(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const campoId = idDe(d.campoId);
  if (!campoId) return { valido: false, mensagem: "Escolha o campo." };
  const membroId = idDe(d.membroId);
  if (!membroId) return { valido: false, mensagem: "Informe a matrícula do missionário." };
  const dinheiro = validarDinheiro(d);
  if (!dinheiro.valido) return dinheiro;
  const periodicidade = typeof d.periodicidade === "string" && d.periodicidade ? d.periodicidade.toUpperCase() : "";
  if (!PERIODICIDADES[periodicidade]) return { valido: false, mensagem: "Escolha a periodicidade do relatório de campo: mensal ou trimestral." };
  const justificativa = texto(d.justificativa, { minimo: 10, maximo: 2000, rotulo: "A justificativa", multilinha: true });
  if (!justificativa.valido) return justificativa;
  let documento = null;
  if (dinheiro.dados.sustento > 0) {
    if (typeof d.documentoBase64 !== "string" || !d.documentoBase64) return { valido: false, mensagem: "Com sustento, anexe o documento do envio (o termo de compromisso assinado): ele acompanha cada pagamento." };
    if (!MIME_DOCUMENTO.includes(d.documentoMime)) return { valido: false, mensagem: "O documento do envio é PDF, JPG ou PNG." };
    documento = { base64: d.documentoBase64, mime: d.documentoMime };
  }
  return { valido: true, dados: { campoId, membroId, ...dinheiro.dados, periodicidade, divulgarNome: booleano(d.divulgarNome), justificativa: justificativa.texto, documento } };
}

// As etapas do envio, pelo caso (Desenho da v9.4, item 2): campo Local fica com a SEMIADESPA (Art. 44 §1º); fora do município, ou com convênio externo (quem
// recebe é pessoa jurídica), passa pela CME e pela CLI (Art. 23, II); Nacional, Transcultural, convênio externo ou qualquer sustento passam pelo Presidente
// (Art. 44 §2º; Art. 134 §6º, I). Trava 9-B: qualquer sustento passa também pela CLI — o Estatuto, Art. 58 §4º, só aceita o pagamento a obreiros (que não é
// distribuição de resultado, §3º) com a prévia aprovação da CLI; o campo Local com sustento vai à CLI sem a CME (a frente Local segue da SEMIADESPA, Art. 44 §1º).
function etapasDoEnvio({ abrangencia, sustento, recebedorPJ }) {
  const longe = abrangencia === "NACIONAL" || abrangencia === "TRANSCULTURAL";
  const colegiado = abrangencia !== "LOCAL" || !!recebedorPJ;
  const comSustento = Number(sustento) > 0;
  return { cme: colegiado, cli: colegiado || comSustento, presidente: longe || !!recebedorPJ || comSustento };
}
function statusInicial(etapas) {
  if (etapas.cme) return "EM_PARECER";
  if (etapas.cli) return "AGUARDANDO_CLI";
  return etapas.presidente ? "AGUARDANDO_PRESIDENTE" : "ATIVO";
}
const statusDepoisDaCLI = (etapas) => (etapas.presidente ? "AGUARDANDO_PRESIDENTE" : "ATIVO");

function parecerVencido(envio, hoje) {
  return !!envio && envio.status === "EM_PARECER" && prazoParecer(envio.solicitadoEm) < hoje;
}

function podeDecidirCLI(envio, { reuniao, urgencia }) {
  if (!envio || !["EM_PARECER", "AGUARDANDO_CLI"].includes(envio.status)) return { pode: false, mensagem: "Este envio não está aguardando a decisão da CLI." };
  if (envio.status === "EM_PARECER" && !urgencia) {
    return { pode: false, mensagem: "Sem o parecer da CME, a CLI só decide em regime de urgência aprovado por 2/3 do Plenário (Regimento, Art. 24 §2º). Marque a urgência se foi assim." };
  }
  if (envio.status === "AGUARDANDO_CLI" && urgencia) return { pode: false, mensagem: "O parecer da CME já foi emitido: não há urgência a registrar." };
  if (reuniao.data < envio.solicitadoEm) return { pode: false, mensagem: `A reunião é anterior ao pedido (${br(envio.solicitadoEm)}). Escolha a reunião que decidiu este envio.` };
  if (envio.parecerEm && reuniao.data < envio.parecerEm) return { pode: false, mensagem: `A reunião é anterior ao parecer da CME (${br(envio.parecerEm)}): a CLI decide depois do parecer.` };
  return { pode: true };
}

function validarPresidente(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const resultado = typeof d.resultado === "string" ? d.resultado.toUpperCase() : "";
  if (!RESULTADOS_PRESIDENTE[resultado]) return { valido: false, mensagem: "O Pastor Presidente concorda ou recusa." };
  const motivo = texto(d.motivo, { minimo: resultado === "RECUSA" ? 5 : 0, maximo: 1000, rotulo: "O motivo da recusa", obrigatorio: resultado === "RECUSA", multilinha: true });
  if (!motivo.valido) return motivo;
  return { valido: true, dados: { resultado, motivo: motivo.texto } };
}

// ---------------------------------------------------------------- os períodos do relatório ----------------------------------------------------------------
const mesesDoPeriodo = (periodicidade) => MESES_DO_PERIODO[periodicidade] || 1;
// O período a que um mês pertence, contado do mês de início do envio.
function periodoDoMes(inicioMes, periodicidade, mes) {
  const n = mesesDoPeriodo(periodicidade);
  return somarMeses(inicioMes, Math.floor(mesesEntre(inicioMes, mes) / n) * n);
}
// Os períodos já começados até hoje (e só até o último mês, se o envio se encerrou); o último pode ser mais curto (o envio acabou no meio dele).
function periodosDoEnvio({ inicioMes, fimMes, periodicidade }, hoje) {
  if (!inicioMes) return [];
  const atual = mesDe(hoje);
  const ultimo = fimMes && fimMes < atual ? fimMes : atual;
  if (ultimo < inicioMes) return [];
  const n = mesesDoPeriodo(periodicidade);
  const lista = [];
  for (let p = inicioMes; p <= ultimo; p = somarMeses(p, n)) {
    let fim = somarMeses(p, n - 1);
    if (fimMes && fim > fimMes) fim = fimMes;
    lista.push({ inicio: p, fim, prazo: `${somarMeses(fim, 1)}-${String(DIA_PRAZO_RELATORIO).padStart(2, "0")}` });
  }
  return lista;
}
// A situação de cada período: entregue, em aberto (dentro do prazo) ou vencido. Relatório vencido suspende o sustento (Desenho da v9.4, item 4).
// O envio encerrado pela vacância (a pessoa faleceu ou saiu do rol): o relatório que ainda estava no prazo no dia da vacância fica dispensado — não vence nem
// suspende. Trava 9-B: o que já tinha vencido ANTES da vacância continua vencido (antes, a vacância dispensava todos e liberava para pagamento os meses que
// estavam suspensos por falta de relatório).
function situacaoRelatorios(envio, entregues, hoje) {
  const feitos = entregues instanceof Set ? entregues : new Set(entregues || []);
  const vacancia = envio && envio.encerradoPorVacancia ? envio.encerradoEm || null : null;
  const periodos = periodosDoEnvio(envio, hoje).map((p) => {
    const entregue = feitos.has(p.inicio);
    const dispensado = !entregue && !!vacancia && p.prazo >= vacancia;
    return { ...p, entregue, dispensado, vencido: !entregue && !dispensado && p.prazo < hoje };
  });
  const vencidos = periodos.filter((p) => p.vencido);
  return { periodos, vencidos, suspenso: vencidos.length > 0 };
}

function validarRelatorio(dados, envio, hoje) {
  const d = dados && typeof dados === "object" ? dados : {};
  const periodoInicio = typeof d.periodoInicio === "string" ? d.periodoInicio.trim() : "";
  if (!mesValido(periodoInicio)) return { valido: false, mensagem: "Escolha o período do relatório." };
  const possivel = periodosDoEnvio(envio, hoje).some((p) => p.inicio === periodoInicio);
  if (!possivel) return { valido: false, mensagem: "Esse período não é deste envio (ou ainda não começou)." };
  const numeros = {};
  for (const [campo, rotulo] of [["batismos", "Os batismos"], ["conversoes", "As conversões"], ["discipulado", "As pessoas em discipulado"]]) {
    const n = inteiroDe(d[campo] == null || d[campo] === "" ? 0 : d[campo]);
    if (n === null) return { valido: false, mensagem: `${rotulo} são um número inteiro de 0 a ${NUMERO_MAXIMO.toLocaleString("pt-BR")}.` };
    numeros[campo] = n;
  }
  const atividades = texto(d.atividades, { minimo: 10, maximo: 4000, rotulo: "As atividades do período", multilinha: true });
  if (!atividades.valido) return atividades;
  const pedidos = texto(d.pedidos, { maximo: 2000, rotulo: "Os pedidos", obrigatorio: false, multilinha: true });
  if (!pedidos.valido) return pedidos;
  let anexo = null;
  if (d.anexoBase64) {
    if (typeof d.anexoBase64 !== "string" || !MIME_DOCUMENTO.includes(d.anexoMime)) return { valido: false, mensagem: "O anexo do relatório é PDF, JPG ou PNG." };
    anexo = { base64: d.anexoBase64, mime: d.anexoMime };
  }
  return { valido: true, dados: { periodoInicio, ...numeros, atividades: atividades.texto, pedidos: pedidos.texto, anexo } };
}

// ---------------------------------------------------------------- sustento: geração, reajuste e encerramento ----------------------------------------------------------------
function validarGeracao(dados, hoje) {
  const d = dados && typeof dados === "object" ? dados : {};
  const mes = typeof d.mesReferencia === "string" && d.mesReferencia ? d.mesReferencia.trim() : mesDe(hoje);
  if (!mesValido(mes)) return { valido: false, mensagem: "O mês é no formato AAAA-MM." };
  if (mes > mesDe(hoje)) return { valido: false, mensagem: "O sustento não se gera antes do mês começar." };
  return { valido: true, dados: { mesReferencia: mes } };
}
// O reajuste vale de um mês ainda não gerado em diante, e nunca para trás do mês de hoje.
function validarReajuste(dados, { inicioMes, ultimoGerado, hoje }) {
  const d = dados && typeof dados === "object" ? dados : {};
  const desdeMes = typeof d.desdeMes === "string" ? d.desdeMes.trim() : "";
  if (!mesValido(desdeMes)) return { valido: false, mensagem: "Informe o mês em que o novo sustento começa a valer (AAAA-MM)." };
  if (desdeMes < mesDe(hoje)) return { valido: false, mensagem: "O reajuste não vale para trás: comece no mês de hoje ou depois." };
  if (inicioMes && desdeMes < inicioMes) return { valido: false, mensagem: `O envio começou em ${mesBr(inicioMes)}: o reajuste vale desse mês em diante.` };
  if (ultimoGerado && desdeMes <= ultimoGerado) return { valido: false, mensagem: `O sustento de ${mesBr(ultimoGerado)} já foi gerado: o reajuste começa depois.` };
  const dinheiro = validarDinheiro(d, { rotuloValor: "O novo sustento mensal" });
  if (!dinheiro.valido) return dinheiro;
  const motivo = texto(d.motivo, { minimo: 5, maximo: 1000, rotulo: "O motivo do reajuste", multilinha: true });
  if (!motivo.valido) return motivo;
  let documento = null;
  if (d.documentoBase64) {
    if (typeof d.documentoBase64 !== "string" || !MIME_DOCUMENTO.includes(d.documentoMime)) return { valido: false, mensagem: "O documento é PDF, JPG ou PNG." };
    documento = { base64: d.documentoBase64, mime: d.documentoMime };
  }
  // Trava 9-B: a reunião da CLI que aprovou o aumento (Estatuto, Art. 58 §4º) — conferida no banco por quem chama; só o aumento a exige
  const sessaoId = d.sessaoId == null || d.sessaoId === "" ? null : idDe(d.sessaoId);
  if (d.sessaoId != null && d.sessaoId !== "" && !sessaoId) return { valido: false, mensagem: "Escolha a reunião da CLI que aprovou o aumento." };
  return { valido: true, dados: { desdeMes, ...dinheiro.dados, motivo: motivo.texto, documento, sessaoId } };
}
// Trava 9-B — o aumento do sustento (Estatuto, Art. 58 §4º): a CLI aprova antes, numa reunião já realizada, depois da ativação do envio e não depois de hoje.
function problemaDaCLIdoAumento({ novo, vigente, reuniao, ativadoEm, hoje }) {
  if (!(Number(novo) > Number(vigente || 0))) return null;
  if (!reuniao) return "O aumento do sustento depende da prévia aprovação da CLI (Estatuto, Art. 58 §4º): escolha a reunião da CLI, já realizada e encerrada, que o aprovou.";
  if (ativadoEm && reuniao.data < ativadoEm) return `A reunião é anterior à ativação do envio (${br(ativadoEm)}): escolha a reunião que aprovou este aumento.`;
  if (reuniao.data > hoje) return "A reunião da CLI precisa já ter acontecido.";
  return null;
}
// O último mês de sustento: não antes de um mês já gerado, nem depois do mês de hoje; o mês anterior ao início quer dizer "nenhum sustento".
function validarEncerramentoEnvio(dados, { inicioMes, ultimoGerado, hoje }) {
  const d = dados && typeof dados === "object" ? dados : {};
  const motivo = texto(d.motivo, { minimo: 5, maximo: 1000, rotulo: "O motivo do encerramento", multilinha: true });
  if (!motivo.valido) return motivo;
  const ultimoMes = typeof d.ultimoMes === "string" ? d.ultimoMes.trim() : "";
  if (!mesValido(ultimoMes)) return { valido: false, mensagem: "Informe o último mês de sustento (AAAA-MM)." };
  if (ultimoMes > mesDe(hoje)) return { valido: false, mensagem: "O último mês de sustento não pode ser depois do mês de hoje: encerre o envio quando ele acabar." };
  if (ultimoGerado && ultimoMes < ultimoGerado) return { valido: false, mensagem: `O sustento de ${mesBr(ultimoGerado)} já foi gerado: o último mês não pode ser antes dele.` };
  if (inicioMes && ultimoMes < somarMeses(inicioMes, -1)) return { valido: false, mensagem: `O envio começou em ${mesBr(inicioMes)}: o último mês é desse mês em diante (ou o anterior, sem sustento nenhum).` };
  return { valido: true, dados: { motivo: motivo.texto, ultimoMes } };
}

// ---------------------------------------------------------------- avisos ----------------------------------------------------------------
// A referência do aviso de um período: o mês do período e o envio no mesmo número (cabe num INT até 2099 e 99.999 envios).
const referenciaPeriodo = (periodoInicio, envioId) => (Number(periodoInicio.replace("-", "")) - 200000) * 100000 + Number(envioId);

function textoEnvioNovo({ missionario, campo }) {
  return `Novo pedido de envio de missionário para a CME analisar — ${missionario}, para o campo ${campo}. O parecer vence em ${PRAZO_PARECER_DIAS} dias (Regimento, Art. 24 §2º).`;
}
function textoParecerVencido({ missionario, campo, prazo, hoje }) {
  const atraso = diasEntre(prazo, hoje);
  return `O parecer da CME sobre o envio de ${missionario} para o campo ${campo} venceu em ${br(prazo)} (${atraso} dia${atraso === 1 ? "" : "s"} de atraso). Sem ele, a CLI só decide em regime de urgência (Regimento, Art. 24 §2º).`;
}
// O artigo pelo caso: outro Estado, outro país ou convênio externo é o Art. 44 §2º; o sustento é o Art. 134 §6º, I.
function fundamentoPresidente({ abrangencia, sustento, recebedorPJ }) {
  const partes = [];
  if (abrangencia === "NACIONAL" || abrangencia === "TRANSCULTURAL" || recebedorPJ) partes.push("Art. 44 §2º");
  if (Number(sustento) > 0) partes.push("Art. 134 §6º, I");
  return partes.length ? `Regimento, ${partes.join(" e ")}` : "Regimento, Art. 44";
}
function textoAguardandoPresidente({ missionario, campo, fundamento }) {
  return `O envio de ${missionario} para o campo ${campo} aguarda a concordância do Pastor Presidente (${fundamento || "Regimento, Art. 44 §2º"}).`;
}
function textoDecidido({ missionario, campo, ativo, recusadoPor, motivo }) {
  if (ativo) return `O envio de ${missionario} para o campo ${campo} foi aprovado e está ativo.`;
  return `O envio de ${missionario} para o campo ${campo} foi recusado ${recusadoPor === "PRESIDENTE" ? "pelo Pastor Presidente" : "pela CLI"}.${motivo ? ` Motivo: ${motivo}` : ""}`;
}
function textoRelatorioAtrasado({ missionario, campo, periodo, prazo, hoje, suspende = true }) {
  const atraso = diasEntre(prazo, hoje);
  return `O relatório de campo de ${missionario} (${campo}) do período ${mesBr(periodo.inicio)}${periodo.fim !== periodo.inicio ? ` a ${mesBr(periodo.fim)}` : ""} venceu em ${br(prazo)} (${atraso} dia${atraso === 1 ? "" : "s"} de atraso).${suspende ? " Enquanto não chegar, o sustento fica suspenso." : " É a prestação de contas do envio."}`;
}

module.exports = {
  ABRANGENCIAS, DIVULGACOES, STATUS_CAMPO, STATUS_ENVIO, EM_ANDAMENTO, VIVOS, PERIODICIDADES, FONTES, RESULTADOS_PRESIDENTE, PARECERES, RESULTADOS_CLI,
  PRAZO_PARECER_DIAS, DIA_PRAZO_RELATORIO, SUSTENTO_MAXIMO, CATEGORIA_SAIDA, MIME_DOCUMENTO, UFS, MUNICIPIOS_ZONA_RURAL, zonaRuralAceita, fundamentoPresidente,
  mesValido, mesDe, somarMeses, mesesEntre, mesBr, ehBrasil, abrangenciaDe, validarCampo, mudouOLugar, valorDe, inteiroDe, validarDinheiro, validarEnvio,
  etapasDoEnvio, statusInicial, statusDepoisDaCLI, prazoParecer, parecerVencido, podeDecidirCLI, validarParecer, validarDecisao, validarMotivo, validarPresidente,
  periodoDoMes, periodosDoEnvio, situacaoRelatorios, validarRelatorio, validarGeracao, validarReajuste, problemaDaCLIdoAumento, validarEncerramentoEnvio, referenciaPeriodo,
  textoEnvioNovo, textoParecerVencido, textoAguardandoPresidente, textoDecidido, textoRelatorioAtrasado, idDe, br
};
