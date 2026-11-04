// shared/expansao.js — v9.2: Expansão (Extensões da Tenda, emancipação e nova congregação). A regra pura, sem banco; o banco está em expansaoDb.js.
// Estatuto Art. 5º §§2º, 3º e 5º; Regimento Art. 23 (CME), Art. 24 §2º (15 dias para o parecer; sem ele, só em urgência por 2/3), Art. 104-B, I, e Art. 109-A.
// Desenho em docs/plano/fase-9-entidades-vinculadas.md ("Desenho da v9.2").
const { texto, idDe, booleano, somarDias, br, diasEntre, UFS } = require("./entidadesVinculadas");

const TIPOS = {
  ABERTURA_EXTENSAO: "Abertura de Extensão da Tenda",
  EMANCIPACAO: "Emancipação de Extensão em Congregação",
  NOVA_CONGREGACAO: "Nova congregação"
};
const STATUS = {
  EM_PARECER: "Aguardando o parecer da CME",
  AGUARDANDO_CLI: "Aguardando a decisão da CLI",
  APROVADO: "Aprovado pela CLI (executado)",
  REJEITADO: "Recusado pela CLI",
  DESISTIDO: "Desistência"
};
const EM_ANDAMENTO = ["EM_PARECER", "AGUARDANDO_CLI"];
const PARECERES = { FAVORAVEL: "Favorável", CONTRARIO: "Contrário" };
const RESULTADOS_CLI = { APROVADO: "Aprovado", REJEITADO: "Recusado" };
// Regimento Art. 24 §2º: as comissões têm até 15 dias para emitir o parecer.
const PRAZO_PARECER_DIAS = 15;

// O Art. 23 dá à CME a análise da abertura de congregações e da emancipação; a Extensão da Tenda vai direto à CLI (Estatuto Art. 5º §5º).
const precisaCME = (tipo) => tipo === "EMANCIPACAO" || tipo === "NOVA_CONGREGACAO";
const prazoParecer = (solicitadoEm) => somarDias(solicitadoEm, PRAZO_PARECER_DIAS);
function parecerVencido(pedido, hoje) {
  return !!pedido && pedido.status === "EM_PARECER" && precisaCME(pedido.tipo) && prazoParecer(pedido.solicitadoEm) < hoje;
}

// O nome de uma unidade: espaços das pontas e repetidos fora (a comparação de homônima, no banco, ignora maiúscula e acento).
function nomeDaUnidade(valor, rotulo) {
  const t = texto(valor, { minimo: 2, maximo: 150, rotulo });
  return t;
}

function validarPedido(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const tipo = typeof d.tipo === "string" ? d.tipo.toUpperCase() : "";
  if (!TIPOS[tipo]) return { valido: false, mensagem: "Escolha o tipo do pedido: abertura de Extensão, emancipação ou nova congregação." };
  const nome = nomeDaUnidade(d.nome, tipo === "ABERTURA_EXTENSAO" ? "O nome da Extensão" : "O nome da nova congregação");
  if (!nome.valido) return nome;
  const endereco = texto(d.endereco, { maximo: 300, rotulo: "O endereço", obrigatorio: false });
  if (!endereco.valido) return endereco;
  const bairro = texto(d.bairro, { maximo: 150, rotulo: "O bairro", obrigatorio: false });
  if (!bairro.valido) return bairro;
  const cidade = texto(d.cidade, { maximo: 150, rotulo: "A cidade", obrigatorio: false });
  if (!cidade.valido) return cidade;
  let uf = null;
  if (d.uf != null && d.uf !== "") {
    uf = typeof d.uf === "string" ? d.uf.trim().toUpperCase() : "";
    if (!UFS.includes(uf)) return { valido: false, mensagem: "UF inválida." };
  }
  const justificativa = texto(d.justificativa, { minimo: 10, maximo: 2000, rotulo: "A justificativa", multilinha: true });
  if (!justificativa.valido) return justificativa;
  const dadosOk = { tipo, nome: nome.texto, endereco: endereco.texto, bairro: bairro.texto, cidade: cidade.texto, uf, justificativa: justificativa.texto,
    congregacaoMaeId: null, extensaoId: null, areaId: null, encarregadoMembroId: null };
  if (tipo === "ABERTURA_EXTENSAO") {
    dadosOk.congregacaoMaeId = idDe(d.congregacaoMaeId);
    if (!dadosOk.congregacaoMaeId) return { valido: false, mensagem: "Escolha a Congregação-Mãe." };
    dadosOk.encarregadoMembroId = idDe(d.encarregadoMembroId);
    if (!dadosOk.encarregadoMembroId) return { valido: false, mensagem: "Informe a matrícula do Encarregado (Regimento, Art. 109-A, I)." };
  } else if (tipo === "EMANCIPACAO") {
    dadosOk.extensaoId = idDe(d.extensaoId);
    if (!dadosOk.extensaoId) return { valido: false, mensagem: "Escolha a Extensão que vai se emancipar." };
  }
  if (tipo !== "ABERTURA_EXTENSAO" && d.areaId != null && d.areaId !== "") {
    dadosOk.areaId = idDe(d.areaId);
    if (!dadosOk.areaId) return { valido: false, mensagem: "Área inválida." };
  }
  return { valido: true, dados: dadosOk };
}

function validarParecer(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const parecer = typeof d.parecer === "string" ? d.parecer.toUpperCase() : "";
  if (!PARECERES[parecer]) return { valido: false, mensagem: "O parecer é favorável ou contrário." };
  const f = texto(d.fundamentacao, { minimo: 10, maximo: 2000, rotulo: "A fundamentação do parecer", multilinha: true });
  if (!f.valido) return f;
  return { valido: true, dados: { parecer, fundamentacao: f.texto } };
}

function validarDecisao(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const resultado = typeof d.resultado === "string" ? d.resultado.toUpperCase() : "";
  if (!RESULTADOS_CLI[resultado]) return { valido: false, mensagem: "O resultado da CLI é aprovado ou recusado." };
  const sessaoId = idDe(d.sessaoId);
  if (!sessaoId) return { valido: false, mensagem: "Escolha a reunião da CLI que decidiu." };
  const motivo = texto(d.motivo, { minimo: resultado === "REJEITADO" ? 5 : 0, maximo: 1000, rotulo: "O motivo da recusa", obrigatorio: resultado === "REJEITADO", multilinha: true });
  if (!motivo.valido) return motivo;
  return { valido: true, dados: { resultado, sessaoId, urgencia: booleano(d.urgencia), motivo: motivo.texto } };
}

// Pode a CLI decidir agora? `reuniao` = { data } (já conferida como da CLI, realizada e encerrada); `pedido` com status, tipo, solicitadoEm e parecerEm.
function podeDecidir(pedido, { reuniao, urgencia }) {
  if (!pedido || !EM_ANDAMENTO.includes(pedido.status)) return { pode: false, mensagem: "Este pedido já foi decidido ou retirado." };
  if (pedido.status === "EM_PARECER") {
    if (!urgencia) return { pode: false, mensagem: "Sem o parecer da CME, a CLI só decide em regime de urgência aprovado por 2/3 do Plenário (Regimento, Art. 24 §2º). Marque a urgência se foi assim." };
  } else if (urgencia) {
    // a urgência só dispensa o parecer que falta: com o parecer emitido, ou num pedido que nem passa pela CME, não há o que dispensar
    return { pode: false, mensagem: precisaCME(pedido.tipo) ? "O parecer da CME já foi emitido: não há urgência a registrar." : "A abertura de Extensão não passa pela CME: não há urgência a registrar." };
  }
  if (reuniao.data < pedido.solicitadoEm) return { pode: false, mensagem: `A reunião é anterior ao pedido (${br(pedido.solicitadoEm)}). Escolha a reunião que decidiu este pedido.` };
  if (pedido.parecerEm && reuniao.data < pedido.parecerEm) return { pode: false, mensagem: `A reunião é anterior ao parecer da CME (${br(pedido.parecerEm)}): a CLI decide depois do parecer.` };
  return { pode: true };
}

function validarMotivo(dados, rotulo = "O motivo") {
  const d = dados && typeof dados === "object" ? dados : {};
  const m = texto(d.motivo, { minimo: 5, maximo: 1000, rotulo, multilinha: true });
  if (!m.valido) return m;
  return { valido: true, dados: { motivo: m.texto } };
}

// O motivo é de quem SAI: na troca é obrigatório (o banco confere se havia alguém); ao definir o primeiro Encarregado, ninguém sai e ele pode faltar.
function validarTrocaEncarregado(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const membroId = idDe(d.membroId);
  if (!membroId) return { valido: false, mensagem: "Informe a matrícula do novo Encarregado." };
  const m = texto(d.motivo, { minimo: 5, maximo: 1000, rotulo: "O motivo da troca", obrigatorio: false, multilinha: true });
  if (!m.valido) return m;
  return { valido: true, dados: { membroId, motivo: m.texto } };
}

// ---- textos dos avisos ----
function textoPedidoNovo({ tipo, nome, mae }) {
  const qual = `${TIPOS[tipo] || tipo}: ${nome}${mae ? ` (Congregação-Mãe: ${mae})` : ""}`;
  return precisaCME(tipo)
    ? `Novo pedido de expansão para a CME analisar — ${qual}. O parecer vence em ${PRAZO_PARECER_DIAS} dias (Regimento, Art. 24 §2º).`
    : `Novo pedido de expansão aguardando a CLI — ${qual}.`;
}
function textoParecerVencido({ tipo, nome, prazo, hoje }) {
  const atraso = diasEntre(prazo, hoje);
  return `O parecer da CME sobre "${TIPOS[tipo] || tipo}: ${nome}" venceu em ${br(prazo)} (${atraso} dia${atraso === 1 ? "" : "s"} de atraso). Sem ele, a CLI só decide em regime de urgência (Regimento, Art. 24 §2º).`;
}
function textoDecidido({ tipo, nome, resultado, motivo }) {
  return resultado === "APROVADO"
    ? `A CLI aprovou o pedido "${TIPOS[tipo] || tipo}: ${nome}". Já está no sistema.`
    : `A CLI recusou o pedido "${TIPOS[tipo] || tipo}: ${nome}".${motivo ? ` Motivo: ${motivo}` : ""}`;
}

module.exports = {
  TIPOS, STATUS, EM_ANDAMENTO, PARECERES, RESULTADOS_CLI, PRAZO_PARECER_DIAS, UFS,
  precisaCME, prazoParecer, parecerVencido, validarPedido, validarParecer, validarDecisao, podeDecidir, validarMotivo, validarTrocaEncarregado,
  textoPedidoNovo, textoParecerVencido, textoDecidido, idDe, br
};
