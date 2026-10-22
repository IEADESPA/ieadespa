// shared/comunicacaoFilaMarca.js (v7.12) — "há e-mail ou aviso de celular na fila de comunicados?" guardado FORA do banco.
//
// A rotina da fila (rotinas-comunicacao.yml) passa a cada 15 minutos. Abrir o banco a cada 15 minutos o dia todo o manteria acordado à toa (o mesmo cuidado da proteção:
// shared/protecaoPendencia.js). A contagem de pendentes fica num blob privado, regravada por quem mexe na fila (o banco já está acordado nesse momento); a rotina pergunta ao
// blob e só abre o banco se houver fila — ou se o blob não existir ou não puder ser lido (na dúvida, olha). Se a regravação falha, a marca é INVALIDADA ("não sei"), nunca
// fica um "0" velho valendo com fila parada.
const storage = require("./storage");

const TEMPO_MAXIMO_MS = 5000;

function nomeDoBlob() {
  const m = /(?:Initial Catalog|Database)=([^;]+)/i.exec(process.env.SQL_CONNECTION_STRING || "");
  const banco = (m ? m[1].trim() : "padrao").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return `comunicacao/fila-${banco}.json`;
}
const disponivel = () => !!process.env.AZURE_STORAGE_CONNECTION_STRING;
const comPrazo = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("tempo esgotado")), TEMPO_MAXIMO_MS))]);

// { pendentes } guardado; null = não sei (sem Storage, sem blob, blob inválido ou erro). Nunca lança.
async function lerGuardada() {
  if (!disponivel()) return null;
  try {
    const g = await comPrazo(storage.lerJsonPrivado(nomeDoBlob()));
    return g && Number.isInteger(g.pendentes) && g.pendentes >= 0 ? { pendentes: g.pendentes, em: g.em || null } : null;
  } catch (e) { return null; }
}
// Regrava com a contagem dada; na falha, tenta invalidar. Nunca lança.
async function gravar(pendentes) {
  if (!disponivel()) return false;
  try {
    await comPrazo(storage.salvarJsonPrivado(nomeDoBlob(), { pendentes, em: new Date().toISOString() }));
    return true;
  } catch (e) {
    console.error("[COMUNICACAO] não gravou a marca da fila:", e.message);
    try { await comPrazo(storage.salvarJsonPrivado(nomeDoBlob(), { pendentes: null, em: new Date().toISOString() })); } catch (_) { /* a leitura também falhará e dará "não sei" */ }
    return false;
  }
}

module.exports = { lerGuardada, gravar, nomeDoBlob };
