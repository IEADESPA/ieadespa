"use strict";
/*
 * Qual resposta vai para o crachá (v7.13, revisão de 22/10/2026). `respostas_inscricao` tem CRIAÇÃO PÚBLICA (a pesquisa pós-evento grava pelo navegador), então
 * qualquer pessoa poderia criar uma resposta nova para a pergunta "igreja" de outra inscrição e mudar o crachá dela. Regra (a mesma de `src/lib/cracha.ts`, usada na
 * impressão em lote do painel):
 *   - só pergunta DO EVENTO e feita NA INSCRIÇÃO (momento diferente de "pos_evento");
 *   - a resposta MAIS ANTIGA (menor id) — a da própria inscrição; uma criada depois não substitui;
 *   - criada até 10 minutos depois da inscrição (`date_created`, campo acrescentado pelo esquema v7.13; resposta antiga, sem a data, vale).
 */
const JANELA_MS = 10 * 60 * 1000;

function respostaParaCracha(respostas, perguntaId, { perguntasValidas, inscricaoCriadaEm = null, janelaMs = JANELA_MS } = {}) {
  const id = Number(perguntaId);
  if (!Number.isInteger(id) || id <= 0 || !perguntasValidas || !perguntasValidas.has(id)) return null;
  const limite = inscricaoCriadaEm ? Date.parse(inscricaoCriadaEm) + janelaMs : null;
  const candidatas = (respostas || [])
    .filter((r) => Number(r.pergunta) === id)
    .filter((r) => !r.date_created || limite == null || Number.isNaN(limite) || Date.parse(r.date_created) <= limite)
    .sort((a, b) => Number(a.id) - Number(b.id));
  const valor = candidatas.length ? candidatas[0].valor : null;
  return valor == null || String(valor).trim() === "" ? null : String(valor);
}

/** As perguntas que podem ir para o crachá: do evento e da inscrição (não da pesquisa pós-evento). */
function perguntasDoCracha(perguntas, eventoId) {
  return new Set((perguntas || []).filter((p) => String(p.evento) === String(eventoId) && p.momento !== "pos_evento").map((p) => Number(p.id)));
}

module.exports = { JANELA_MS, respostaParaCracha, perguntasDoCracha };
