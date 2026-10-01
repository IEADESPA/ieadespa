// AgendaPublica (v7.2; canais na v7.3) — o calendário oficial, a agenda litúrgica e os canais oficiais para o SITE.
//
// Sem login (anonymous): só o que já é público por natureza — eventos HOMOLOGADOS
// marcados como públicos, a grade semanal do Art. 79 e (v7.3) os Canais Oficiais marcados como públicos
// (Estatuto Art. 12: o membro precisa poder conferir o que é oficial). Nada de quem propôs, quem decidiu,
// estado interno, atas, motivos de indeferimento, administradores, senhas ou ocorrências. O site é estático (Astro) e chama
// isto em tempo de build, no runner do GitHub Actions (como as congregações, vC.2).
//
// A "versão" é um hash do que o site mostra. O sincronizador do GitHub
// (.github/workflows/site-agenda-sync.yml) compara a versão daqui com a que o site
// publicou em /agenda-versao.json e, se diferem, manda reconstruir o site.
//
// GET /api/agenda-publica/tudo      -> { versao, eventos[], liturgia[], canais[] }   (o que o build do site usa)
// GET /api/agenda-publica/canais    -> { canais[{id,nome,plataforma,rotuloPlataforma,categoria,identificador,link,escopo,rotuloEscopo,congregacaoNome,areaNome,departamentoNome,descricao}] }
// GET /api/agenda-publica/eventos   -> { eventos[] }
// GET /api/agenda-publica/liturgia  -> { liturgia[] }   (formato da coleção `programacao` do Directus)
// GET /api/agenda-publica/versao    -> { versao }
const { getPool } = require("../shared/db");
const calendarioDb = require("../shared/calendarioDb");
const { criarLimitador, chaveDeOrigem } = require("../shared/limiteTaxa");

// Limite por origem e por instância (shared/limiteTaxa.js): o build do site e o
// sincronizador fazem poucas chamadas por hora.
const limitador = criarLimitador({ janelaMs: 60000, maximo: 60 });

// Cache de 60 s por instância: a rota é anônima e consulta o banco serverless.
const CACHE_MS = 60000;
let cache = { em: 0, pacote: null };

async function pacote() {
  const agora = Date.now();
  if (cache.pacote && agora - cache.em < CACHE_MS) return cache.pacote;
  const pool = await getPool();
  const ctx = await calendarioDb.carregarContextoTerritorial(pool);
  cache = { em: agora, pacote: await calendarioDb.pacotePublicoCompleto(pool, ctx) };
  return cache.pacote;
}

module.exports = async function (context, req) {
  const cabecalhos = { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" };
  if (req.method !== "GET") {
    context.res = { status: 405, headers: cabecalhos, body: { sucesso: false, mensagem: "Método não suportado." } };
    return;
  }
  const limite = limitador.registrar(chaveDeOrigem(req));
  if (!limite.permitido) {
    context.res = { status: 429, headers: { ...cabecalhos, "Retry-After": String(limite.retryAposSegundos) }, body: { sucesso: false, mensagem: "Muitas consultas seguidas. Aguarde um minuto." } };
    return;
  }

  const acao = context.bindingData.acao || "";
  try {
    if (acao === "tudo" || acao === "eventos" || acao === "liturgia" || acao === "canais" || acao === "versao") {
      const p = await pacote();
      const corpo = acao === "tudo" ? p : acao === "eventos" ? { eventos: p.eventos } : acao === "liturgia" ? { liturgia: p.liturgia } : acao === "canais" ? { canais: p.canais } : { versao: p.versao };
      context.res = { status: 200, headers: cabecalhos, body: corpo };
      return;
    }
    context.res = { status: 404, headers: cabecalhos, body: { sucesso: false, mensagem: "Ação inválida." } };
  } catch (e) {
    context.log.error("[AgendaPublica] erro:", e);
    context.res = { status: 500, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: { sucesso: false, mensagem: "Erro interno ao ler a agenda." } };
  }
};

// Só para os testes: zera o cache entre os cenários.
module.exports._limparCache = () => { cache = { em: 0, pacote: null }; };
