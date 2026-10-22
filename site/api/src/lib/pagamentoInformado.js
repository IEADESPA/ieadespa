"use strict";
/*
 * "INFORMAR O PAGAMENTO" (v7.13, 22/10/2026). O pagamento das inscrições e das camisetas continua manual (Pix, transferência, dinheiro): a pessoa só AVISA que pagou — a data, o
 * meio, o valor e o nome de quem pagou — e a equipe confere no extrato e confirma no painel. Não se manda comprovante. Informar NUNCA marca como pago: só a equipe marca, e fica
 * registrado quem confirmou e quando (ver `auditoriaPagamento.js`). Informar de novo SUBSTITUI o aviso anterior (fica só o último, com "informado em").
 *
 * Regras de cada campo (o que vem do navegador nunca é confiável):
 *   - data: um dia de verdade (AAAA-MM-DD), não no futuro (pelo dia de Brasília) e não mais antigo que 1 ano;
 *   - meio: PIX, TRANSFERENCIA, DINHEIRO ou OUTRO;
 *   - valor: maior que zero, no máximo R$ 50.000,00, com no máximo 2 casas decimais (aceita "50", "50.5", "50,50" e "1.234,56");
 *   - nome de quem pagou: de 2 a 120 caracteres, sem caractere de controle nem caractere invisível de direção de texto (o nome aparece no painel da equipe).
 */
const MEIOS = Object.freeze({ PIX: "Pix", TRANSFERENCIA: "Transferência", DINHEIRO: "Dinheiro", OUTRO: "Outro" });
const VALOR_MAXIMO = 50000;
const NOME_MAX = 120;
const DIA_MS = 24 * 60 * 60 * 1000;
// Controles e invisíveis: ver `textoSeguro.js`.
const { temCaractereProibido } = require("./textoSeguro");

/** O dia de hoje em Brasília (UTC-3, sem horário de verão), como AAAA-MM-DD. */
function hojeEmBrasilia(agora = Date.now()) {
  return new Date(agora - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function lerData(bruto, agora) {
  const texto = typeof bruto === "string" ? bruto.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return { erro: "Informe a data do pagamento." };
  const d = new Date(`${texto}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== texto) return { erro: "A data do pagamento não existe no calendário." };
  const hoje = hojeEmBrasilia(agora);
  if (texto > hoje) return { erro: "A data do pagamento não pode ser no futuro." };
  const umAnoAtras = new Date(new Date(`${hoje}T12:00:00Z`).getTime() - 365 * DIA_MS).toISOString().slice(0, 10);
  if (texto < umAnoAtras) return { erro: "A data do pagamento é de mais de 1 ano atrás. Confira a data ou fale com a equipe." };
  return { valor: texto };
}

/** "50" | 50 | "50,5" | "1.234,56" | "1234.56" → número com 2 casas, ou null quando não é um valor em reais válido. */
function lerValor(bruto) {
  let n;
  if (typeof bruto === "number") n = bruto;
  else if (typeof bruto === "string") {
    let t = bruto.trim().replace(/^R\$\s*/i, "");
    if (/^[1-9]\d{0,2}(\.\d{3})+(,\d{1,2})?$/.test(t)) t = t.replace(/\./g, "").replace(",", "."); // 1.234,56
    else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", "."); // 50,50
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    n = Number(t);
  } else return null;
  if (!Number.isFinite(n) || n <= 0 || n > VALOR_MAXIMO) return null;
  if (Math.abs(Math.round(n * 100) - n * 100) > 1e-6) return null; // mais de 2 casas decimais
  return Math.round(n * 100) / 100;
}

function lerNome(bruto) {
  if (typeof bruto !== "string") return { erro: "Informe o nome de quem pagou." };
  if (temCaractereProibido(bruto)) return { erro: "O nome de quem pagou tem um caractere que não é aceito." };
  const nome = bruto.trim().replace(/\s+/g, " ");
  if (nome.length < 2) return { erro: "Informe o nome de quem pagou." };
  if (nome.length > NOME_MAX) return { erro: `O nome de quem pagou pode ter no máximo ${NOME_MAX} letras.` };
  return { valor: nome };
}

/**
 * Confere o que a pessoa informou. Devolve `{ ok: true, pagamento: { data, meio, valor, nome } }` ou `{ ok: false, erro }` (a primeira coisa errada, em português simples).
 */
function validarPagamentoInformado(entrada, agora = Date.now()) {
  const e = entrada && typeof entrada === "object" ? entrada : {};
  const data = lerData(e.data, agora);
  if (data.erro) return { ok: false, erro: data.erro };
  const meio = typeof e.meio === "string" ? e.meio.trim().toUpperCase() : "";
  if (!Object.prototype.hasOwnProperty.call(MEIOS, meio)) return { ok: false, erro: "Escolha como pagou: Pix, transferência, dinheiro ou outro." };
  const valor = lerValor(e.valor);
  if (valor == null) return { ok: false, erro: `Informe o valor pago (maior que zero, até R$ ${VALOR_MAXIMO.toLocaleString("pt-BR")},00).` };
  const nome = lerNome(e.nome);
  if (nome.erro) return { ok: false, erro: nome.erro };
  return { ok: true, pagamento: { data: data.valor, meio, valor, nome: nome.valor } };
}

/** Os campos gravados no registro (inscrição ou pedido). Informar de novo substitui todos eles. */
function camposDoAviso(pagamento, agoraIso = new Date().toISOString()) {
  return {
    pagamento_informado_data: pagamento.data,
    pagamento_informado_meio: pagamento.meio,
    pagamento_informado_valor: pagamento.valor,
    pagamento_informado_nome: pagamento.nome,
    pagamento_informado_em: agoraIso,
  };
}

/** O aviso guardado num registro, no formato que as páginas mostram (null = nunca informou). */
function avisoDoRegistro(r) {
  if (!r || !r.pagamento_informado_em) return null;
  return {
    data: r.pagamento_informado_data || null,
    meio: r.pagamento_informado_meio || null,
    meioRotulo: MEIOS[r.pagamento_informado_meio] || r.pagamento_informado_meio || null,
    valor: r.pagamento_informado_valor == null ? null : Number(r.pagamento_informado_valor),
    nome: r.pagamento_informado_nome || null,
    em: r.pagamento_informado_em,
  };
}

const CAMPOS_AVISO = "pagamento_informado_data,pagamento_informado_meio,pagamento_informado_valor,pagamento_informado_nome,pagamento_informado_em";

module.exports = { MEIOS, VALOR_MAXIMO, NOME_MAX, CAMPOS_AVISO, hojeEmBrasilia, lerValor, validarPagamentoInformado, camposDoAviso, avisoDoRegistro };
