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
//   Cada evento traz `convidados[{nome,tipo,rotuloTipo,ministerio}]` (v7.4): só o convidado externo AUTORIZADO pelo
//   Protocolo de Convidados (Regimento Art. 111-A), com o convite OFICIALIZADO e que autorizou divulgar o nome.
// GET /api/agenda-publica/canais    -> { canais[{id,nome,plataforma,rotuloPlataforma,categoria,identificador,link,escopo,rotuloEscopo,congregacaoNome,areaNome,departamentoNome,descricao}] }
// GET /api/agenda-publica/eventos   -> { eventos[] }
// GET /api/agenda-publica/liturgia  -> { liturgia[] }   (formato da coleção `programacao` do Directus)
// GET /api/agenda-publica/versao    -> { versao, em, origem }   (vD.5: pelo blob guardado, sem abrir o banco; "origem": "guardada" | "banco")
// POST /api/agenda-publica/atualizar-versao  (x-cron-secret) -> { sucesso, versao }   (vD.5: a rotina diária regrava o blob)
const { getPool } = require("../shared/db");
const calendarioDb = require("../shared/calendarioDb");
const { criarLimitador, chaveDeOrigem } = require("../shared/limiteTaxa");
const agendaVersao = require("../shared/agendaPublicaVersao");
const { exigirSegredoRotina } = require("../shared/cronAuth");

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
  const acao = context.bindingData.acao || "";
  // vD.5 — rotina diária (x-cron-secret; o banco já está acordado pelas rotinas das 7h): recalcula a versão da
  // agenda e guarda fora do banco (shared/agendaPublicaVersao.js). Rede de segurança do gancho da entrada única.
  if (req.method === "POST" && acao === "atualizar-versao") {
    if (!exigirSegredoRotina(req, context)) return;
    try {
      const versao = await agendaVersao.atualizar(await getPool(), "rotina diária");
      context.res = { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: { sucesso: true, versao } };
    } catch (e) {
      context.log.error("[AgendaPublica] atualizar-versao:", e);
      context.res = { status: 500, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: { sucesso: false, mensagem: "Não consegui guardar a versão da agenda." } };
    }
    return;
  }
  if (req.method !== "GET") {
    context.res = { status: 405, headers: cabecalhos, body: { sucesso: false, mensagem: "Método não suportado." } };
    return;
  }
  const limite = limitador.registrar(chaveDeOrigem(req));
  if (!limite.permitido) {
    context.res = { status: 429, headers: { ...cabecalhos, "Retry-After": String(limite.retryAposSegundos) }, body: { sucesso: false, mensagem: "Muitas consultas seguidas. Aguarde um minuto." } };
    return;
  }

  try {
    // vD.5 — a versão responde pelo blob, SEM abrir o banco (é o que o sincronizador do site pergunta a cada
    // 15 min); só na primeira vez, sem blob guardado, calcula pelo banco e guarda.
    if (acao === "versao") {
      const guardada = await agendaVersao.lerGuardada();
      if (guardada) {
        context.res = { status: 200, headers: cabecalhos, body: { versao: guardada.versao, em: guardada.em, origem: "guardada" } };
        return;
      }
      const p = await pacote();
      await agendaVersao.guardar(p.versao, "primeira leitura").catch((e) => context.log.warn("[AgendaPublica] não guardou a versão:", e.message));
      context.res = { status: 200, headers: cabecalhos, body: { versao: p.versao, origem: "banco" } };
      return;
    }
    if (acao === "tudo" || acao === "eventos" || acao === "liturgia" || acao === "canais") {
      const p = await pacote();
      // o build do site acabou de ler o pacote inteiro: a versão guardada passa a ser exatamente esta
      if (acao === "tudo") await agendaVersao.guardar(p.versao, "build do site").catch((e) => context.log.warn("[AgendaPublica] não guardou a versão:", e.message));
      const corpo = acao === "tudo" ? p : acao === "eventos" ? { eventos: p.eventos } : acao === "liturgia" ? { liturgia: p.liturgia } : { canais: p.canais };
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
