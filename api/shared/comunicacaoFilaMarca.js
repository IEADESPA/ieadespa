// shared/comunicacaoFilaMarca.js (v7.12) — "há e-mail ou aviso de celular na fila de comunicados?" guardado FORA do banco.
//
// A rotina da fila (rotinas-comunicacao.yml) passa a cada 15 minutos. Abrir o banco a cada 15 minutos o dia todo o manteria acordado à toa (o mesmo cuidado da proteção:
// shared/protecaoPendencia.js). A contagem de pendentes fica num blob privado, regravada por quem mexe na fila (o banco já está acordado nesse momento); a rotina pergunta ao
// blob e só abre o banco se houver fila — ou se o blob não existir ou não puder ser lido (na dúvida, olha).
// Revisão independente (22/10/2026): uma gravação lenta de "0" não pode chegar DEPOIS da gravação de um envio novo e fazer a fila dormir. Por isso cada marca leva `seq` (o maior
// EntregaId que existia quando a contagem foi feita: um envio novo sempre o aumenta), e a gravação é condicional (ETag): marca com `seq` menor que a guardada não entra, e se alguém
// gravou no meio, relê e decide de novo. Na falha, a marca é INVALIDADA ("não sei"), nunca fica um "0" velho valendo com fila parada.
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
    // `sistema` (Trava 7-C): quantas das pendentes são do aviso do sistema (a crise); null = não sei (marca gravada antes da Trava 7-C)
    return g && Number.isInteger(g.pendentes) && g.pendentes >= 0
      ? { pendentes: g.pendentes, seq: g.seq, sistema: Number.isInteger(g.sistema) && g.sistema >= 0 ? g.sistema : null, em: g.em || null } : null;
  } catch (e) { return null; }
}
// Grava { pendentes, seq, sistema } se não houver marca mais nova; na falha, tenta invalidar. Nunca lança. `pendentes` null = invalidar ("não sei"). `sistema` = quantas
// das pendentes são do aviso do sistema (a crise): de madrugada a rotina só abre o banco se houver alguma (Trava 7-C).
async function gravar(pendentes, seq = 0, deps = {}, sistema = null) {
  const st = deps.storage || storage;
  if (!deps.storage && !disponivel()) return false;
  const objeto = { pendentes: Number.isInteger(pendentes) ? pendentes : null, seq: Number.isInteger(seq) ? seq : 0, em: new Date().toISOString() };
  if (objeto.pendentes !== null && Number.isInteger(sistema) && sistema >= 0) objeto.sistema = sistema;
  try {
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const atual = await comPrazo(st.lerJsonPrivadoComVersao(nomeDoBlob()));
      const seqAtual = atual && atual.dados && Number.isInteger(atual.dados.seq) ? atual.dados.seq : -1;
      // uma marca mais nova já está lá (um envio novo depois desta contagem): esta não entra — salvo para invalidar, que é sempre seguro
      if (objeto.pendentes !== null && seqAtual > objeto.seq) return true;
      try { await comPrazo(st.salvarJsonPrivadoSe(nomeDoBlob(), objeto, atual ? atual.etag : null)); return true; } catch (e) { if (!e || !e.conflito) throw e; }
    }
    throw new Error("a marca mudou três vezes seguidas");
  } catch (e) {
    console.error("[COMUNICACAO] não gravou a marca da fila:", e && e.message);
    try { await comPrazo(st.salvarJsonPrivado(nomeDoBlob(), { pendentes: null, seq: objeto.seq, em: new Date().toISOString() })); } catch (_) { /* a leitura também falhará e dará "não sei" */ }
    return false;
  }
}

module.exports = { lerGuardada, gravar, nomeDoBlob };
