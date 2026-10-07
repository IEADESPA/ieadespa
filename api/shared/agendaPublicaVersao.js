// shared/agendaPublicaVersao.js (vD.5, 07/10/2026) — a "versão" da agenda pública guardada FORA do banco.
//
// O site é estático e só muda quando é reconstruído; o sincronizador (.github/workflows/site-agenda-sync.yml)
// pergunta ao sistema "qual é a versão da agenda?" e, se o site publicado mostra outra, manda reconstruir. Até
// 06/10/2026 essa pergunta abria o banco (Azure SQL serverless) a cada 20 min — e o banco nunca pausava
// (R$ 65-86 por dia contra R$ 6-7 pausado). Agora a versão fica num blob privado do Storage:
//   - toda mudança que pode alterar a agenda pública (rotas de calendário, canais e eventos, método != GET, resposta
//     2xx) recalcula a versão e grava o blob — o banco já estava acordado para a mudança (ver shared/entrada.js);
//   - a rotina diária (rotinas-diarias.yml, 7h, banco acordado) grava de novo — rede de segurança para qualquer
//     caminho que tenha passado despercebido;
//   - GET /api/agenda-publica/versao responde pelo blob, sem banco; só abre o banco se o blob ainda não existir.
// A versão é a mesma de sempre: calcularVersao() do pacote público (calendarioDb). Falha ao gravar/ler o blob nunca
// derruba a chamada que a provocou: só fica no log, e a próxima mudança ou a rotina diária corrige.
const storage = require("./storage");
const calendarioDb = require("./calendarioDb");

// Um blob POR BANCO: o preview da homologação nasce com as configurações de produção copiadas (mesmo Storage), e
// a versão da agenda fictícia da homologação não pode sobrescrever a da produção. O nome do banco vem da própria
// conexão SQL (app-db-prod × ieadespa-homolog); sem conexão (testes), "padrao".
function nomeDoBlob() {
  const m = /(?:Initial Catalog|Database)=([^;]+)/i.exec(process.env.SQL_CONNECTION_STRING || "");
  const banco = (m ? m[1].trim() : "padrao").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return `agenda-publica/versao-${banco}.json`;
}
const FUNCOES_QUE_MUDAM_A_AGENDA = new Set(["GestaoCalendario", "GestaoCanais", "GestaoEventos"]);
const INTERVALO_MINIMO_MS = 2000; // várias ações seguidas na mesma instância: uma gravação basta
const TEMPO_MAXIMO_MS = 8000;
let ultimaGravacao = 0;

const disponivel = () => !!process.env.AZURE_STORAGE_CONNECTION_STRING;
const versaoValida = (v) => typeof v === "string" && /^[0-9a-f]{16}$/.test(v);

// Lê a versão guardada. Sem Storage configurado (máquina local, testes) ou sem blob: null. Nunca lança.
async function lerGuardada() {
  if (!disponivel()) return null;
  try {
    const g = await storage.lerJsonPrivado(nomeDoBlob());
    return g && versaoValida(g.versao) ? { versao: g.versao, em: g.em || null, motivo: g.motivo || null } : null;
  } catch (_) { return null; }
}

// Grava a versão (com o instante e o motivo, só para leitura humana no Storage). Lança se o Storage falhar.
async function guardar(versao, motivo) {
  if (!disponivel()) return false;
  if (!versaoValida(versao)) throw new Error("versão inválida: " + String(versao));
  await storage.salvarJsonPrivado(nomeDoBlob(), { versao, em: new Date().toISOString(), motivo: String(motivo || "") });
  ultimaGravacao = Date.now();
  return true;
}

// Recalcula a versão a partir do banco (o mesmo pacote que o site usa) e grava.
async function atualizar(pool, motivo) {
  const ctx = await calendarioDb.carregarContextoTerritorial(pool);
  const { versao } = await calendarioDb.pacotePublicoCompleto(pool, ctx);
  await guardar(versao, motivo);
  return versao;
}

// Esta chamada mudou a agenda pública? (função que mexe em calendário/canais/eventos, método que escreve, resposta 2xx)
function mudouAAgenda(pasta, req, res) {
  if (!FUNCOES_QUE_MUDAM_A_AGENDA.has(pasta)) return false;
  if (String((req && req.method) || "GET").toUpperCase() === "GET") return false;
  const status = res && res.status;
  return !status || (status >= 200 && status < 300);
}

// Chamada pela entrada única DEPOIS do handler. Nunca lança; devolve se gravou.
async function depoisDeMudanca(context, pasta, req) {
  if (!mudouAAgenda(pasta, req, context && context.res) || !disponivel()) return false;
  if (Date.now() - ultimaGravacao < INTERVALO_MINIMO_MS) return false;
  let temporizador;
  try {
    const { getPool } = require("./db");
    const pool = await getPool();
    await Promise.race([
      atualizar(pool, `mudança em ${pasta}`),
      new Promise((_, rejeitar) => { temporizador = setTimeout(() => rejeitar(new Error(`tempo esgotado (${TEMPO_MAXIMO_MS} ms)`)), TEMPO_MAXIMO_MS); })
    ]);
    return true;
  } catch (e) {
    const log = context && context.log;
    if (log && typeof log.warn === "function") log.warn("[agendaPublicaVersao] não guardou a versão da agenda:", e && e.message);
    return false;
  } finally { clearTimeout(temporizador); }
}

module.exports = { lerGuardada, guardar, atualizar, depoisDeMudanca, mudouAAgenda, nomeDoBlob, FUNCOES_QUE_MUDAM_A_AGENDA, _zerar: () => { ultimaGravacao = 0; } };
