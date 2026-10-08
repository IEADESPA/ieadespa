// shared/vistoriaAntecedentes.js (v7.6 — Termo de Vistoria de antecedentes)
//
// Regra pura, sem banco (a parte com banco está em shared/vistoriaAntecedentesDb.js). Regimento Art. 133 §5º.
//
// O que o Regimento manda, e o que o sistema faz:
//  - A Diretoria Executiva pode pedir, a qualquer tempo, certidão de antecedentes criminais e de distribuição cível a qualquer membro ou congregado (I). A recusa
//    em apresentar implica impedimento imediato ou afastamento preventivo da função (I, "a"): o sistema registra a RECUSA como resultado da vistoria.
//  - A checagem é obrigatória na investidura em cargo de liderança, de confiança ou em trabalho com vulneráveis; na mudança para área sensível; e por suspeita
//    fundada ou notoriedade (II). Não há checagem periódica para quem tem vida irrepreensível (a periodicidade da Lei 14.811/2024 para quem serve com menores é a v7.7).
//  - Só a Diretoria Executiva ou o Conselho de Ética analisa as certidões (IV, "a"), e NÃO se guarda cópia delas (IV, "b"): o sistema nunca recebe a certidão, só o
//    hash de cada uma, calculado no aparelho de quem confere. O original é devolvido ao membro ou descartado, e o termo diz qual dos dois (IV, "c").
//  - O Termo de Vistoria é o documento interno assinado pela Diretoria com: a data da verificação, o hash da certidão, o parecer final e o diretor que conferiu (IV, "c").
const cal = require("./calendario");
const vol = require("./voluntariado");

const limpar = (v) => String(v == null ? "" : v).trim();
const inteiroPositivo = vol.inteiroPositivo;
const temMarca = (s) => /[<>]/.test(s);

const MOTIVOS = {
  INVESTIDURA: { rotulo: "Investidura em cargo de liderança, de confiança ou em trabalho com vulneráveis", base: "Art. 133 §5º, II, “a”" },
  MUDANCA_FUNCAO: { rotulo: "Mudança de função para área sensível", base: "Art. 133 §5º, II, “b”" },
  SUSPEITA_FUNDADA: { rotulo: "Suspeita fundada ou notoriedade (rumor, denúncia ou notícia pública)", base: "Art. 133 §5º, II, “c”" },
  SOLICITACAO_DIRETORIA: { rotulo: "Solicitação da Diretoria Executiva", base: "Art. 133 §5º, I" }
};
const TIPOS_DOCUMENTO = {
  ANTECEDENTES_FEDERAL: "Certidão de antecedentes criminais — federal (Polícia Federal)",
  ANTECEDENTES_ESTADUAL: "Certidão de antecedentes criminais — estadual (Tribunal de Justiça)",
  DISTRIBUICAO_CIVEL: "Certidão de distribuição cível",
  OUTRO: "Outra certidão"
};
const RESULTADOS = {
  SEM_RESTRICAO: "Sem restrição",
  COM_RESTRICAO: "Com restrição (a Diretoria decide sobre a função)",
  RECUSA: "Recusou apresentar as certidões (impedimento ou afastamento preventivo da função)"
};
const DESTINOS_ORIGINAL = { DEVOLVIDO: "Devolvido ao membro", DESCARTADO: "Descartado" };
const MAX_DOCUMENTOS = 6;
const DATA_MINIMA_EMISSAO = "2000-01-01";
const LIMITE_LISTA = 300;

// O hash que o aparelho de quem confere calculou (SHA-256 da certidão): 64 caracteres hexadecimais. Maiúsculas são aceitas e guardadas em minúsculas.
function validarHash(texto) {
  if (typeof texto !== "string") return { valido: false };        // lista, número e objeto não são hash (String() de uma lista de um item daria o item)
  const h = limpar(texto).toLowerCase();
  return /^[0-9a-f]{64}$/.test(h) ? { valido: true, hash: h } : { valido: false };
}

function validarMotivo(valor) {
  const m = limpar(valor).toUpperCase();
  return MOTIVOS[m] ? m : null;
}

// Pedido da Diretoria (Art. 133 §5º, I): a pessoa é avisada de que deve apresentar as certidões. Não cria registro de vistoria: ela só existe quando é lavrada.
function validarSolicitacao(d = {}, { atorId }) {
  const membroId = inteiroPositivo(d.membroId);
  if (!membroId) return { valido: false, mensagem: "Informe a matrícula de quem deve apresentar as certidões." };
  if (membroId === inteiroPositivo(atorId)) return { valido: false, mensagem: "Você não pode solicitar certidões a si mesmo: peça a outra pessoa da Diretoria ou do Conselho de Ética." };
  const motivo = validarMotivo(d.motivo || "SOLICITACAO_DIRETORIA");
  if (!motivo) return { valido: false, mensagem: `Motivo inválido. Use um de: ${Object.keys(MOTIVOS).join(", ")}.` };
  const funcao = limpar(d.funcao);
  if (funcao && (funcao.length < 3 || funcao.length > 150 || temMarca(funcao))) return { valido: false, mensagem: "A função aceita de 3 a 150 caracteres, sem < ou >." };
  return { valido: true, dados: { membroId, motivo, funcao: funcao || null } };
}

// Lavra do Termo de Vistoria. `documentos`: as certidões conferidas, cada uma só com o tipo, o hash e a data de emissão.
function validarVistoria(d = {}, { hoje, atorId }) {
  const membroId = inteiroPositivo(d.membroId);
  if (!membroId) return { valido: false, mensagem: "Informe a matrícula de quem foi vistoriado." };
  if (membroId === inteiroPositivo(atorId)) return { valido: false, mensagem: "Ninguém assina a própria vistoria: peça a outra pessoa da Diretoria ou do Conselho de Ética." };
  const motivo = validarMotivo(d.motivo);
  if (!motivo) return { valido: false, mensagem: `Escolha o motivo da vistoria: ${Object.keys(MOTIVOS).join(", ")}.` };
  const funcao = limpar(d.funcao);
  if (funcao.length < 3 || funcao.length > 150 || temMarca(funcao)) return { valido: false, mensagem: "Diga o cargo ou a função em jogo (de 3 a 150 caracteres, sem < ou >), por exemplo: Professor da EBD infantil." };
  if (d.comVulneraveis != null && typeof d.comVulneraveis !== "boolean") return { valido: false, mensagem: "comVulneraveis deve ser verdadeiro ou falso." };
  const dataVerificacao = limpar(d.dataVerificacao);
  if (!cal.dataIsoValida(dataVerificacao)) return { valido: false, mensagem: "Informe a data da verificação (AAAA-MM-DD)." };
  if (dataVerificacao > hoje) return { valido: false, mensagem: "A data da verificação não pode estar no futuro." };
  if (dataVerificacao < DATA_MINIMA_EMISSAO) return { valido: false, mensagem: "A data da verificação é anterior a 2000: confira." };
  const resultado = limpar(d.resultado).toUpperCase();
  if (!RESULTADOS[resultado]) return { valido: false, mensagem: `Resultado inválido. Use um de: ${Object.keys(RESULTADOS).join(", ")}.` };
  const parecer = limpar(d.parecer);
  if (parecer.length < 10 || parecer.length > 1000 || temMarca(parecer)) return { valido: false, mensagem: "Registre o parecer final (de 10 a 1000 caracteres, sem < ou >). Não copie dados da certidão: o parecer diz só a conclusão." };

  const lista = d.documentos == null ? [] : d.documentos;
  if (!Array.isArray(lista)) return { valido: false, mensagem: "documentos deve ser uma lista." };
  if (lista.length > MAX_DOCUMENTOS) return { valido: false, mensagem: `Informe até ${MAX_DOCUMENTOS} certidões por termo.` };
  if (resultado === "RECUSA") {
    if (lista.length > 0) return { valido: false, mensagem: "Quem recusou não apresentou certidão: não há documento a registrar." };
    return { valido: true, dados: { membroId, motivo, funcao, comVulneraveis: d.comVulneraveis === true, dataVerificacao, resultado, parecer, destinoOriginal: null, documentos: [] } };
  }
  if (lista.length === 0) return { valido: false, mensagem: "Registre ao menos uma certidão conferida (o tipo, o hash e a data de emissão)." };
  const destinoOriginal = limpar(d.destinoOriginal).toUpperCase();
  if (!DESTINOS_ORIGINAL[destinoOriginal]) return { valido: false, mensagem: "Diga o que foi feito do documento original: devolvido ao membro ou descartado (Art. 133 §5º, IV, “c”). A Igreja não guarda cópia." };
  const documentos = [], vistos = new Set();
  for (const item of lista) {
    if (!item || typeof item !== "object") return { valido: false, mensagem: "Há uma certidão malformada na lista." };
    const tipo = limpar(item.tipo).toUpperCase();
    if (!TIPOS_DOCUMENTO[tipo]) return { valido: false, mensagem: `Tipo de certidão inválido. Use um de: ${Object.keys(TIPOS_DOCUMENTO).join(", ")}.` };
    const h = validarHash(item.hash);
    if (!h.valido) return { valido: false, mensagem: "O hash da certidão tem de ser o SHA-256 dela, com 64 caracteres hexadecimais (0-9 e a-f). Use o botão de escolher o arquivo para calcular." };
    if (vistos.has(h.hash)) return { valido: false, mensagem: "Há duas certidões com o mesmo hash: o mesmo documento foi informado duas vezes." };
    vistos.add(h.hash);
    const dataEmissao = limpar(item.dataEmissao);
    if (!cal.dataIsoValida(dataEmissao)) return { valido: false, mensagem: "Informe a data de emissão de cada certidão (AAAA-MM-DD)." };
    if (dataEmissao > hoje) return { valido: false, mensagem: "A data de emissão de uma certidão não pode estar no futuro." };
    if (dataEmissao < DATA_MINIMA_EMISSAO) return { valido: false, mensagem: "A data de emissão é anterior a 2000: confira." };
    documentos.push({ tipo, hash: h.hash, dataEmissao });
  }
  return { valido: true, dados: { membroId, motivo, funcao, comVulneraveis: d.comVulneraveis === true, dataVerificacao, resultado, parecer, destinoOriginal, documentos } };
}

function textoSolicitacao({ motivo, funcao }) {
  const porque = motivo === "INVESTIDURA" ? "pela investidura em cargo ou função" : motivo === "MUDANCA_FUNCAO" ? "pela mudança de função" : motivo === "SUSPEITA_FUNDADA" ? "por notícia que chegou à Diretoria" : "por determinação da Diretoria";
  const qual = funcao ? ` (${funcao})` : "";
  return `A Diretoria Executiva solicita que você apresente certidão de antecedentes criminais e certidão de distribuição cível, ${porque}${qual} — Regimento Art. 133 §5º. Procure a Diretoria: o documento é conferido na sua presença e devolvido a você ou descartado, e a Igreja guarda apenas o código (hash) dele, nunca uma cópia. A recusa em apresentar implica impedimento ou afastamento preventivo da função (§5º, I, “a”).`;
}

function textoPendentes({ total, nomes }) {
  const quem = nomes.slice(0, 6).join(", ") + (nomes.length > 6 ? ` e mais ${nomes.length - 6}` : "");
  return `${total} liderança(s) em exercício ainda sem Termo de Vistoria de antecedentes: ${quem}. A checagem é obrigatória na primeira vez que o membro assume cargo de liderança ou de confiança (Regimento Art. 133 §5º, II, “a”). Abra Vistoria de Antecedentes → Quem falta.`;
}

module.exports = {
  MOTIVOS, TIPOS_DOCUMENTO, RESULTADOS, DESTINOS_ORIGINAL, MAX_DOCUMENTOS, LIMITE_LISTA,
  validarHash, validarMotivo, validarSolicitacao, validarVistoria, textoSolicitacao, textoPendentes, inteiroPositivo
};
