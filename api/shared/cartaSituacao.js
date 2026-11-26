// shared/cartaSituacao.js (volta 10 do Membros, 25/11/2026) — a situação da pessoa nas cartas de trânsito antigas (SolicitarCarta, CartaPdf e a impressão do
// app/modulos/pessoas.js). Regra pura, sem banco.
//
// Quem está em ARROLAMENTO tem a ficha a completar: veio do sistema pago e a secretaria ainda não conferiu a situação nem a data (a data de lá tem sentido
// desconhecido). Por isso (importante 1 do portão v9):
//  - não emite pelo aplicativo a Carta de Recomendação nem o Atestado Supletivo, que saem na hora, sem a secretaria ver a ficha;
//  - nenhum documento de carta sai para essa pessoa: o modelo antigo marca "Membro" e "Comunhão" para toda situação fora da lista, e isso seria falso.
// A recusa é neutra (não diz por quê, nem a origem dos dados) e é da mesma família da recusa da carteirinha (shared/carteirinha.js).
// A carta de MUDANÇA não muda aqui: a saída de quem está em arrolamento é pergunta da movimentação nova (rodadas 29 e 31).

const RECUSA_FICHA_A_COMPLETAR = "A ficha ainda está para completar: a carta sai depois que a secretaria completar a ficha.";
const EMISSAO_IMEDIATA = ["RECOMENDACAO", "ATESTADO_SUPLETIVO"];
// o modelo antigo da carta (o papel das congregações): a situação por extenso. Fora desta lista não há rótulo (antes caía em "Comunhão").
const ROTULO_CARTA_ANTIGA = { EM_COMUNHAO: "Comunhão", SEM_COMUNHAO: "Paz", CONGREGADO: "Observação", NOVO_CONVERTIDO: "Observação" };

/** a carta que sai na hora pelo aplicativo (Recomendação, Atestado Supletivo): a frase da recusa, ou null */
function recusaDaEmissaoNaHora(tipo, situacaoMembro) {
  if (situacaoMembro === "ARROLAMENTO" && EMISSAO_IMEDIATA.includes(tipo)) return RECUSA_FICHA_A_COMPLETAR;
  return null;
}

/** o documento da carta (PDF ou impressão), de qualquer tipo: a frase da recusa, ou null */
function recusaDoDocumento(_tipo, situacaoMembro) {
  return situacaoMembro === "ARROLAMENTO" ? RECUSA_FICHA_A_COMPLETAR : null;
}

/** a situação por extenso no modelo antigo; null quando a situação não está na lista (nunca "Comunhão" por padrão) */
function rotuloSituacaoCartaAntiga(situacaoMembro) {
  return Object.prototype.hasOwnProperty.call(ROTULO_CARTA_ANTIGA, situacaoMembro) ? ROTULO_CARTA_ANTIGA[situacaoMembro] : null;
}

module.exports = { recusaDaEmissaoNaHora, recusaDoDocumento, rotuloSituacaoCartaAntiga, RECUSA_FICHA_A_COMPLETAR };
