// shared/protecaoPendencia.js (v7.8) — "há suspeita de violência com o relógio de 24 horas correndo?" guardado FORA do banco.
//
// A rotina horária da proteção (rotinas-protecao.yml) só precisa abrir o banco quando há prazo correndo. O banco é serverless e só pausa se ficar uma hora sem uso: uma chamada
// por hora, o dia inteiro, o manteria ligado (e cobrando — o mesmo problema que a agenda pública já teve, ver shared/agendaPublicaVersao.js). Por isso o resultado de
// "quantas suspeitas abertas, sem comunicação, ainda estão dentro da janela de avisos" fica num blob privado do Storage, regravado por toda mudança que pode alterá-lo (o banco
// já está acordado nesse momento) e pela rodada diária das 7h; a rotina horária pergunta ao blob e só abre o banco se houver pendência (ou se o blob não existir: na dúvida, olha).
// Falha ao gravar ou ler o blob NUNCA derruba a chamada que a provocou; o relógio, que é calculado na leitura, continua certo. Trava 7-B (20/10/2026): se a regravação falha ou estoura
// o tempo, a marca antiga ("0 pendentes") NÃO pode ficar valendo — ela faria a rotina horária dormir até as 7h com uma suspeita nova correndo. Na falha, a marca é INVALIDADA
// (regravada como "não sei"), e a rotina horária, na dúvida, abre o banco na hora seguinte. Se nem a invalidação grava (Storage fora do ar), em geral a leitura da rotina também falha e
// dá o mesmo "não sei"; o resto (Storage que lê mas não grava por horas) fica para a rodada diária, como antes.
const storage = require("./storage");
const { sql } = require("./db");

const JANELA_HORAS = 30;                      // depois de 5 avisos de prazo vencido (até 24 h do prazo) o caso sai da rotina horária; o resumo diário assume
const TEMPO_MAXIMO_MS = 6000;
const TEMPO_INVALIDAR_MS = 3000;              // a invalidação é uma gravação só, sem consulta: teto menor (quem registrou um incidente está esperando a resposta)

// Um blob POR BANCO (a homologação não pode sobrescrever o da produção): o nome do banco vem da própria conexão SQL; sem conexão (testes), "padrao".
function nomeDoBlob() {
  const m = /(?:Initial Catalog|Database)=([^;]+)/i.exec(process.env.SQL_CONNECTION_STRING || "");
  const banco = (m ? m[1].trim() : "padrao").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return `protecao/pendencia-${banco}.json`;
}
const disponivel = () => !!process.env.AZURE_STORAGE_CONNECTION_STRING;

// { pendentes, proximoPrazo } calculado no banco.
async function calcular(pool) {
  const r = (await pool.request().input("h", sql.Int, JANELA_HORAS).query(`
    SELECT COUNT(*) AS n, MIN(i.PrazoNotificacaoEm) AS proximo FROM IncidentesProtecao i
    WHERE i.Status = 'ABERTO' AND i.ExigeComunicacao = 1 AND i.PrazoNotificacaoEm > DATEADD(HOUR, -@h, SYSUTCDATETIME())
      AND NOT EXISTS (SELECT 1 FROM IncidenteComunicacoes k WHERE k.IncidenteId = i.IncidenteId)`)).recordset[0];
  return { pendentes: Number(r.n) || 0, proximoPrazo: r.proximo instanceof Date ? r.proximo.toISOString() : r.proximo || null };
}

// Lê o blob. Sem Storage (máquina local, testes) ou sem blob: null. Nunca lança.
async function lerGuardada() {
  if (!disponivel()) return null;
  try {
    const g = await storage.lerJsonPrivado(nomeDoBlob());
    return g && Number.isInteger(g.pendentes) && g.pendentes >= 0 ? { pendentes: g.pendentes, proximoPrazo: g.proximoPrazo || null, em: g.em || null } : null;
  } catch (_) { return null; }
}

// Com prazo: a promessa `p` ou o erro de tempo esgotado. Não cancela `p` (quem chama decide o que fazer com ela).
async function comPrazo(p, ms) {
  let temporizador;
  try { return await Promise.race([p, new Promise((_, rejeitar) => { temporizador = setTimeout(() => rejeitar(new Error(`tempo esgotado (${ms} ms)`)), ms); })]); }
  finally { if (temporizador) clearTimeout(temporizador); }
}

// A marca "não sei": lerGuardada a devolve como null (pendentes não é inteiro), e a rotina horária abre o banco.
const MARCA_INVALIDA = (motivo) => ({ pendentes: null, invalida: true, motivo, em: new Date().toISOString() });

// Recalcula e grava. Nunca lança; devolve o que gravou (ou null). `tempoMaximoMs` só para os testes.
async function atualizar(pool, { tempoMaximoMs = TEMPO_MAXIMO_MS } = {}) {
  if (!disponivel()) return null;
  let desistiu = false;
  // Se o tempo esgotar ainda no cálculo, a gravação NÃO acontece depois (um "0" atrasado sobrescreveria a invalidação abaixo)
  const trabalho = (async () => {
    const v = await calcular(pool);
    if (desistiu) throw new Error("abandonado por tempo esgotado");
    await storage.salvarJsonPrivado(nomeDoBlob(), { ...v, em: new Date().toISOString() });
    return v;
  })();
  try {
    return await comPrazo(trabalho, tempoMaximoMs);
  } catch (e) {
    desistiu = true;
    console.error("[PROTECAO] não foi possível guardar a marca de pendência (a marca é invalidada: a rotina horária abre o banco):", e && e.message);
    try { await comPrazo(storage.salvarJsonPrivado(nomeDoBlob(), MARCA_INVALIDA("falha ao regravar")), TEMPO_INVALIDAR_MS); }
    catch (e2) { console.error("[PROTECAO] nem a invalidação da marca de pendência foi gravada (em geral a leitura também falha e a rotina abre o banco; senão, a rodada diária corrige):", e2 && e2.message); }
    return null;
  }
}

module.exports = { JANELA_HORAS, nomeDoBlob, disponivel, calcular, lerGuardada, atualizar };
