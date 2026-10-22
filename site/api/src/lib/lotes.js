"use strict";
/*
 * LOTES DE INSCRIÇÃO (v7.13, 22/10/2026). Cada faixa de valor do evento (`eventos.faixas_valor`, lista JSON) pode ter, além de `descricao` (o público: "Membro", "Visitante",
 * "1º lote") e `valor`, dois campos opcionais:
 *   - `ate`   — o ÚLTIMO dia (inclusive, horário de Brasília) em que o lote vale: "1º lote até 05/11" = "2026-11-05";
 *   - `vagas` — quantas inscrições cabem naquele lote.
 * Lote vencido ou esgotado não aparece para escolher. O esgotado só é RECUSADO dentro da trava de vagas (`vagasEvento.js`): a contagem do lote é lida DEPOIS da última senha do
 * livro do evento, igual às vagas e ao cupom, então nunca passa do número mesmo com muita gente ao mesmo tempo. O limite GERAL de vagas do evento continua mandando para a lista
 * de espera, sem recusar ninguém; o do LOTE recusa (com o aviso "escolha o lote seguinte"), porque o lote é um preço, não um lugar na sala.
 *
 * Conta para o lote TODA inscrição gravada com aquele rótulo (`inscricoes_eventos.faixa_rotulo`), confirmada, na lista de espera ou aguardando aprovação: quem está na lista de
 * espera garantiu o preço do lote, e se a contagem ignorasse essas pessoas o lote passaria do número quando elas fossem promovidas.
 */
const { fimDoDiaBrasilia, formatarDia } = require("./janela");

const MAX_ROTULO = 120;

function inteiroPositivo(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

function diaValido(v) {
  if (!v) return null;
  const texto = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const d = new Date(`${texto}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== texto ? null : texto;
}

/** As faixas do evento como lista limpa: `{ descricao, valor, ate, vagas }` (ate/vagas = null quando não há). Faixa sem descrição é ignorada (o painel já não grava assim). */
function normalizarFaixas(bruto) {
  let lista = bruto;
  if (typeof lista === "string") { try { lista = JSON.parse(lista); } catch { lista = null; } }
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((f) => f && typeof f === "object" && String(f.descricao ?? "").trim())
    .map((f) => ({
      descricao: String(f.descricao).trim().slice(0, MAX_ROTULO),
      valor: Number(f.valor) || 0,
      ate: diaValido(f.ate),
      vagas: inteiroPositivo(f.vagas),
    }));
}

/** O lote já venceu? (`ate` é o último dia, inclusive, em Brasília.) */
function loteVencido(faixa, agora = Date.now()) {
  const fim = faixa && faixa.ate ? fimDoDiaBrasilia(faixa.ate) : null;
  return Boolean(fim && agora > fim.getTime());
}

const algumLoteComVagas = (faixas) => faixas.some((f) => f.vagas != null);

/**
 * Qual faixa a pessoa escolheu. A página nova manda o rótulo (`faixa`); a antiga mandava só o valor (`valorFaixa`) — ainda aceito, para não quebrar uma página aberta antes da
 * atualização: com valor repetido entre faixas, vale a primeira ainda em vigor. Devolve `{ faixa }` (null = evento sem faixas, ou a pessoa não escolheu) ou `{ erro: { status, body } }`.
 */
function escolherFaixa(faixas, { rotulo = null, valor = null } = {}, agora = Date.now()) {
  if (!faixas.length) return { faixa: null };
  const textoRotulo = rotulo == null ? "" : String(rotulo).trim();
  const temValor = valor !== null && valor !== undefined && valor !== "";
  // Revisão de 22/10/2026: evento COM faixas exige a escolha. Antes, mandar sem faixa passava por cima do lote (data, vagas e preço) — inclusive depois de o lote
  // esgotar, quando a página voltava a escolha para "Selecione…".
  if (!textoRotulo && !temValor) return { erro: { status: 400, body: { erro: "Escolha o lote (faixa de valor) da inscrição.", motivo: "lote_obrigatorio" } } };
  let candidatas;
  if (textoRotulo) {
    candidatas = faixas.filter((f) => f.descricao === textoRotulo);
    // Página antiga em cache mandando rótulo E valor: o valor tem de bater, senão alguém escolheria o lote barato com o rótulo do caro (ou o contrário).
    if (temValor) candidatas = candidatas.filter((f) => f.valor === Number(valor));
  } else {
    candidatas = faixas.filter((f) => f.valor === Number(valor));
  }
  if (!candidatas.length) return { erro: { status: 400, body: { erro: "Faixa de valor inválida." } } };
  const emVigor = candidatas.find((f) => !loteVencido(f, agora));
  if (!emVigor) {
    const f = candidatas[0];
    return { erro: { status: 409, body: { erro: `O lote "${f.descricao}" encerrou em ${formatarDia(f.ate)}. Escolha o lote seguinte.`, motivo: "lote_vencido", lote: f.descricao } } };
  }
  return { faixa: emVigor };
}

/** A recusa por lote esgotado, para quem está se inscrevendo. `cabem` = quantas vagas ainda restavam no lote (0 = esgotado). */
function mensagemLoteEsgotado(faixa, cabem, pessoas) {
  if (cabem <= 0) return `Esse lote esgotou ("${faixa.descricao}"). Escolha o lote seguinte.`;
  return `O lote "${faixa.descricao}" só tem ${cabem} ${cabem === 1 ? "vaga" : "vagas"} e a inscrição tem ${pessoas} pessoas. Escolha o lote seguinte ou inscreva menos pessoas.`;
}

/**
 * Situação de cada lote para a página pública: `{ descricao, valor, ate, vagas, inscritos, restantes, disponivel, motivo }`. `contagens` = { rotulo: número de inscrições }
 * (só precisa existir para lotes com vagas; sem contagem, o lote com vagas fica "disponível" e a trava decide na hora).
 */
function situacaoDosLotes(faixas, contagens = {}, agora = Date.now()) {
  return faixas.map((f) => {
    const inscritos = contagens && contagens[f.descricao] != null ? Number(contagens[f.descricao]) || 0 : null;
    const restantes = f.vagas != null && inscritos != null ? Math.max(f.vagas - inscritos, 0) : null;
    let motivo = null;
    if (loteVencido(f, agora)) motivo = "vencido";
    else if (restantes === 0) motivo = "esgotado";
    return { descricao: f.descricao, valor: f.valor, ate: f.ate, vagas: f.vagas, inscritos, restantes, disponivel: motivo === null, motivo };
  });
}

module.exports = { MAX_ROTULO, normalizarFaixas, loteVencido, algumLoteComVagas, escolherFaixa, mensagemLoteEsgotado, situacaoDosLotes, diaValido };
