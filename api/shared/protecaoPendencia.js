// shared/protecaoPendencia.js (v7.8) — "há suspeita de violência com o relógio de 24 horas correndo?" guardado FORA do banco.
//
// A rotina horária da proteção (rotinas-protecao.yml) só precisa abrir o banco quando há prazo correndo. O banco é serverless e só pausa se ficar uma hora sem uso: uma chamada
// por hora, o dia inteiro, o manteria ligado (e cobrando — o mesmo problema que a agenda pública já teve, ver shared/agendaPublicaVersao.js). Por isso o resultado de
// "quantas suspeitas abertas, sem comunicação, ainda estão dentro da janela de avisos" fica num blob privado do Storage, regravado por toda mudança que pode alterá-lo (o banco
// já está acordado nesse momento) e pela rodada diária das 7h; a rotina horária pergunta ao blob e só abre o banco se houver pendência (ou se o blob não existir: na dúvida, olha).
// Falha ao gravar ou ler o blob NUNCA derruba a chamada que a provocou: no pior caso o lembrete de hora em hora espera a rodada diária; o relógio, que é calculado na leitura,
// continua certo.
const storage = require("./storage");
const { sql } = require("./db");

const JANELA_HORAS = 30;                      // depois de 5 avisos de prazo vencido (até 24 h do prazo) o caso sai da rotina horária; o resumo diário assume
const TEMPO_MAXIMO_MS = 6000;

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

// Recalcula e grava. Nunca lança; devolve o que gravou (ou null).
async function atualizar(pool) {
  if (!disponivel()) return null;
  let temporizador;
  try {
    const valor = await Promise.race([
      (async () => { const v = await calcular(pool); await storage.salvarJsonPrivado(nomeDoBlob(), { ...v, em: new Date().toISOString() }); return v; })(),
      new Promise((_, rejeitar) => { temporizador = setTimeout(() => rejeitar(new Error(`tempo esgotado (${TEMPO_MAXIMO_MS} ms)`)), TEMPO_MAXIMO_MS); })
    ]);
    return valor;
  } catch (e) {
    console.error("[PROTECAO] não foi possível guardar a marca de pendência (a rotina diária corrige):", e && e.message);
    return null;
  } finally { if (temporizador) clearTimeout(temporizador); }
}

module.exports = { JANELA_HORAS, nomeDoBlob, disponivel, calcular, lerGuardada, atualizar };
