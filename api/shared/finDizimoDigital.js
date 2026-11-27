// shared/finDizimoDigital.js (FASE 10, Financeiro, incremento 4, 27/11/2026) — a REGRA PURA do DÍZIMO DIGITAL (migração 206). As consultas estão
// em shared/finDizimoDigitalDb.js. Tela aprovada: rodada 22, "r22-dizimo-digital", opção 1 (versão única); as regras dele das rodadas 20 a 22:
//
// - É raro: o normal continua sendo entregar à tesouraria e levar o recibo de papel. O membro informa o Pix (o valor e o dia e a hora) na página
//   dele; a tesouraria escreve o recibo na próxima folha em branco do bloco de papel e LIGA o Pix àquela folha, digitando o número dela (a folha
//   não fica presa: quem liga escolhe; o sistema só confere se a folha é do bloco e se ninguém a usou).
// - Ligar RESERVA a folha para o Pix: o lançamento acontece na planilha, na ordem do bloco, e a folha ligada vem preenchida (o dízimo, o Pix, o
//   valor e o membro vêm do Pix, no servidor; o corpo do pedido não os escreve). Marcada "mês posterior", ela vem preenchida no mês seguinte.
// - Ou EXCLUIR com o motivo (o membro é avisado do porquê): o caso típico é o membro que fez o Pix e, no mesmo dia, entregou também o físico.
// - Sem resolver cada um (ligar ou excluir), não se lança (salva) nem se fecha o mês da congregação; a planilha fica aberta para ver.
// - Os 3 passos de cada Pix: informado, recibo de papel (ligado) e conferido no extrato (o 3º vem com o extrato, incremento 7).
const L = require("./finLancamentos");

const MAX_MOTIVO = 300;
const MAX_FOLHA = 999999999;
/** quantos Pix um membro pode ter esperando a tesouraria ao mesmo tempo (para conferir: um membro sozinho não trava a planilha com dezenas) */
const MAX_ABERTOS_POR_MEMBRO = 5;
const PIX_EM = /^(\d{4}-\d{2}-\d{2})[T ]([01]\d|2[0-3]):([0-5]\d)$/;
const PASSOS = Object.freeze({ __proto__: null, INFORMADO: 1, LIGADO: 2 });
const tem = (v) => v !== undefined && v !== null && v !== "";
const milhar = (x) => Number(x).toLocaleString("pt-BR");

/** o que o membro informa: { valor, pixEm: "AAAA-MM-DDTHH:MM" } → { ok, valor (centavos), pixEm (com os segundos), dia }. O dia do Pix: o mês de agora
 *  ou o anterior, nunca depois de hoje (a mesma janela do lançamento). */
function validarInforme(d, hoje) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return { ok: false, mensagem: "Informe o valor do Pix." };
  const valor = L.lerValor(d.valor);
  if (valor === null) return { ok: false, mensagem: "Informe o valor do Pix." };
  const m = typeof d.pixEm === "string" ? PIX_EM.exec(d.pixEm.trim()) : null;
  if (!m || !L.dataValida(m[1])) return { ok: false, mensagem: "Informe o dia e a hora do Pix." };
  const dia = m[1];
  if (dia > hoje) return { ok: false, mensagem: "O dia do Pix é depois de hoje: confira a data." };
  const antes = L.mesAnterior(L.mesDe(hoje));
  if (dia < antes) return { ok: false, mensagem: `Só se informa o Pix deste mês ou do anterior (${L.nomeDoMes(antes)}).` };
  return { ok: true, valor, pixEm: `${dia}T${m[2]}:${m[3]}:00`, dia };
}

/** o número da folha digitado para ligar (o número inteiro que veio no corpo); null quando não vale */
const folhaParaLigar = (f) => (Number.isInteger(f) && f > 0 && f <= MAX_FOLHA ? f : null);

/** a exclusão: o motivo obrigatório, limpo (o membro lê o porquê) */
function validarExclusao(d) {
  const motivo = d && typeof d.motivo === "string" ? d.motivo.trim().replace(/\s+/g, " ") : "";
  if (!motivo) return { ok: false, mensagem: "Escreva o motivo da exclusão: o membro é avisado do porquê." };
  if (motivo.length > MAX_MOTIVO) return { ok: false, mensagem: `O motivo tem no máximo ${MAX_MOTIVO} letras.` };
  return { ok: true, motivo };
}

/**
 * A linha da planilha numa folha ligada a um Pix (`pix`: { membroId, valor em centavos }). O nome e o valor vêm do Pix: o corpo traz só a folha e,
 * na folha nova, o "Referente a". "Este mês": o dízimo por Pix, já preenchido. "Mês posterior": só a linha (o Pix preenche no mês seguinte).
 * { preencher: true }: a folha que veio marcada do mês anterior, que o Pix preenche agora.
 */
function linhaDaFolhaLigada(l, pix, { preencher = false } = {}) {
  const erro = (m) => ({ ok: false, mensagem: `Folha ${milhar(l.folha)}: ${m}` });
  if (tem(l.tipo) || tem(l.forma) || tem(l.valor) || tem(l.voluntaria) || tem(l.pessoa)) return erro("a folha está ligada a um dízimo por Pix; o nome e o valor vêm do Pix.");
  const doPix = { tipo: "DIZIMO", forma: "PIX", valor: pix.valor, voluntaria: null, membroId: pix.membroId, nome: null };
  if (preencher) return { ok: true, linha: { folha: l.folha, referente: "MES_POSTERIOR", ...doPix } };
  if (!L.REFERENTES.includes(l.referente)) return erro("escolha “Este mês” ou “Mês posterior”.");
  if (l.referente === "MES_POSTERIOR") {
    return { ok: true, linha: { folha: l.folha, referente: "MES_POSTERIOR", tipo: null, forma: null, valor: null, voluntaria: null, membroId: null, nome: null } };
  }
  return { ok: true, linha: { folha: l.folha, referente: "ESTE_MES", ...doPix } };
}

/** o passo de cada Pix (1 informado, 2 recibo de papel); o excluído fica fora dos passos (0) */
const passoDe = (situacao) => PASSOS[situacao] || 0;

module.exports = { MAX_MOTIVO, MAX_ABERTOS_POR_MEMBRO, validarInforme, folhaParaLigar, validarExclusao, linhaDaFolhaLigada, passoDe };
