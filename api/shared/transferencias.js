// shared/transferencias.js (FASE 10, v10.1b passo 3, 17/11/2026) — a TRANSFERÊNCIA DE CONGREGAÇÃO como fluxo: as regras puras (sem banco; quem lê e grava é
// shared/transferenciasDb.js). Decisão 3 do responsável (13/11/2026), plano da fase 10, v10.1a–e:
//  - quem pede: a secretaria da congregação de ORIGEM, a PRÓPRIA pessoa ou a Secretaria GERAL; a pessoa não precisa aceitar;
//  - pedido pela Geral → entra na hora; MESMA ÁREA → entra na hora; ÁREAS DIFERENTES → a secretaria de DESTINO (ou a Geral) aceita ou recusa, com motivo;
//  - a área ACOMPANHA (vê os pedidos das suas congregações), mas não pede nem decide (desenho aprovado da rodada 8: "a área acompanha; quem aceita é o destino").
// O nome é TRANSFERÊNCIA: a carta de mudança/recomendação para OUTRA igreja continua em CartasTransito.
const auth = require("./auth");
const { ehGeral } = require("./escopoRotas");

const DIAS_PARADO = 7;                       // depois disso o pedido aparece para a Geral na caixa "paradas" (ela pode decidir a qualquer hora)
const MOTIVO_MAX = 500;
const STATUS_SEM_TRANSFERENCIA = new Set(["DESLIGADO", "FALECIDO"]);   // quem já saiu do rol não muda de congregação

const MSG = {
  QUEM_PEDE: "Quem pede a transferência é a secretaria da congregação de origem, a própria pessoa ou a Secretaria Geral.",
  QUEM_DECIDE: "Quem aceita ou recusa é a secretaria da congregação de destino (ou a Secretaria Geral).",
  QUEM_CANCELA: "Só quem fez o pedido, a secretaria da congregação de origem ou a Secretaria Geral cancela.",
  JA_HA_PEDIDO: "Já há um pedido de transferência em andamento para esta pessoa. Espere a resposta ou cancele o pedido.",
  MESMA_CONGREGACAO: "A congregação de destino é a mesma em que a pessoa já está.",
  DESTINO_INVALIDO: "Escolha uma congregação de destino ativa.",
  SAIU_DO_ROL: "Esta pessoa já saiu do rol de membros: não há transferência.",
  SEM_CONGREGACAO: "Esta pessoa ainda não tem congregação na ficha: a Secretaria acerta o cadastro antes.",
  NAO_PENDENTE: "Este pedido já foi resolvido (aceito, recusado ou cancelado). Atualize a tela.",
  MUDOU: "Isto mudou enquanto você olhava. Atualize a tela.",
  NAO_EXISTE: "Pedido de transferência não encontrado.",
  MOTIVO_RECUSA: "Diga o motivo da recusa (a congregação de origem recebe esse motivo).",
  NA_CONGREGACAO: "A congregação muda pela transferência (Membros › Transferência): a congregação de origem ou a própria pessoa pede; pela Secretaria Geral ou dentro da mesma área entra na hora."
};

// O texto livre do pedido/recusa: sem espaços nas pontas, até 500 letras; vazio = null.
function textoLimpo(v, max = MOTIVO_MAX) {
  if (typeof v !== "string") return null;   // só texto: número, lista ou objeto no lugar do motivo não vira "[object Object]" gravado
  const t = String(v).replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

// A regra do pedido: pela Geral, na mesma área ou entre áreas. Área desconhecida (congregação sem área) conta como "outra área" — o caminho seguro: o destino aceita.
function regraDaTransferencia({ pedidoComo, areaOrigemId, areaDestinoId }) {
  if (pedidoComo === "GERAL") return "GERAL";
  if (areaOrigemId != null && areaDestinoId != null && Number(areaOrigemId) === Number(areaDestinoId)) return "MESMA_AREA";
  return "ENTRE_AREAS";
}
const entraNaHora = (regra) => regra === "GERAL" || regra === "MESMA_AREA";

// As concessões da visão (da permissão "pessoas") de nível CONGREGAÇÃO que cobrem a congregação inteira (não só uma Extensão da Tenda): é a "secretaria local".
function secretariaLocalDe(visao, congregacaoNome) {
  if (!visao || !congregacaoNome) return false;
  return auth.concessoesDaVisao(visao).filter(Boolean)
    .some((c) => c.nivel === "CONGREGACAO" && !c.escopoExtensaoNome && auth.estaNoEscopo(c, congregacaoNome));
}

// Quem pode PEDIR pela secretaria (a visão de "pessoas"): a Geral (entra na hora) ou a secretaria local da ORIGEM. A área não pede (acompanha). null = não pode.
function papelParaPedir(visao, origemNome) {
  if (!visao) return null;
  if (ehGeral(visao)) return "GERAL";
  if (secretariaLocalDe(visao, origemNome)) return "ORIGEM";
  return null;
}

// Quem pode DECIDIR (aceitar/recusar) um pedido entre áreas: a Geral (a qualquer hora) ou a secretaria local do DESTINO. null = não pode.
function papelParaDecidir(visao, destinoNome) {
  if (!visao) return null;
  if (ehGeral(visao)) return "GERAL";
  if (secretariaLocalDe(visao, destinoNome)) return "DESTINO";
  return null;
}

// Quem pode CANCELAR um pedido pendente: quem o fez, a secretaria local da origem ou a Geral.
function podeCancelar(visao, membroIdDeQuemPede, t) {
  if (!t || t.situacao !== "PENDENTE") return false;
  if (membroIdDeQuemPede != null && Number(t.pedidoPor) === Number(membroIdDeQuemPede)) return true;
  if (!visao) return false;
  return ehGeral(visao) || secretariaLocalDe(visao, t.origemNome);
}

// Alguma concessão da visão cobre a congregação INTEIRA (não só uma Extensão da Tenda)? É o que vale para ver pedidos de transferência: quem só alcança uma
// Extensão não vê quem sai ou chega na congregação toda (revisão do passo 3: a união dos escopos da visão mostraria nomes de fora da Extensão).
function cobreCongregacaoInteira(visao, congregacaoNome) {
  if (!visao || !congregacaoNome) return false;
  return auth.concessoesDaVisao(visao).filter(Boolean).some((c) => !c.escopoExtensaoNome && auth.estaNoEscopo(c, congregacaoNome));
}

// O pedido é visível para esta visão? A Geral vê tudo; os outros, quando a origem OU o destino está no escopo (a área acompanha as suas congregações).
function visivelPara(visao, t) {
  if (!visao || !t) return false;
  if (ehGeral(visao)) return true;
  return cobreCongregacaoInteira(visao, t.origemNome) || cobreCongregacaoInteira(visao, t.destinoNome);
}

// Quantos dias o pedido está parado (para a caixa "paradas" da Geral e o aviso de "há N dias").
function diasParado(pedidoEm, agora = new Date()) {
  const d = pedidoEm instanceof Date ? pedidoEm : new Date(pedidoEm);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((agora.getTime() - d.getTime()) / 86400000));
}

module.exports = {
  DIAS_PARADO, MOTIVO_MAX, STATUS_SEM_TRANSFERENCIA, MSG,
  textoLimpo, regraDaTransferencia, entraNaHora, secretariaLocalDe, cobreCongregacaoInteira, papelParaPedir, papelParaDecidir, podeCancelar, visivelPara, diasParado
};
