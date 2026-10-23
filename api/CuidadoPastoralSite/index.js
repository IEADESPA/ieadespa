// CuidadoPastoralSite (v7.11.1 — o mural de oração do site entra no cuidado pastoral)
// POST /api/cuidado-pastoral-site   body:{ texto, nome?, confidencial, siteItemId? }   cabeçalho x-site-key = CHAVE_SITE_SISTEMA (a mesma nos dois aplicativos do Azure)
//
// Chamada pelo site (site/api/EnviarPedidoMural), servidor a servidor, no instante em que alguém envia um pedido no mural de oração. Aqui:
//   - o pedido sem confidencialidade e sem sinal de risco não abre o banco (nem pede a conexão: Trava 7-C): a resposta é { gravado:false, risco:false } e ele segue só no
//     Directus, com a moderação de sempre;
//   - o CONFIDENCIAL ou com SINAL DE RISCO entra na fila do cuidado pastoral, só do nível geral (o site não diz a congregação), e com risco o aviso obrigatório sai na hora.
// A resposta é sempre pequena (nunca devolve o texto nem quem é avisado): o site só precisa saber se havia risco, para mostrar o 188 e o 190 a quem escreveu.
//
// Diferente da VerificarContaMembro, esta rota FALHA FECHADA: sem a CHAVE_SITE_SISTEMA configurada neste aplicativo, ninguém entra (401) — gravar e alertar a Diretoria com um
// texto vindo de fora só com a chave combinada.
const { getPool } = require("../shared/db");
const { criarLimitador, chaveDeOrigem } = require("../shared/limiteTaxa");
const { conferirChaveDoSite } = require("../shared/chaveSiteSistema");
const db = require("../shared/cuidadoPastoralDb");
const { inteiroPositivo } = require("../shared/voluntariado");

// o site chama de poucos servidores: o limite por origem segura um vazamento da chave; o teto por hora (no banco) segura a inundação vinda do formulário público
const limitador = criarLimitador({ janelaMs: 60000, maximo: 60 });

module.exports = async function (context, req) {
  const res = (status, body) => { context.res = { status, headers: { "Cache-Control": "no-store", "Content-Type": "application/json" }, body }; };
  const chave = conferirChaveDoSite(req);
  if (!chave.exigida || !chave.ok) return res(401, { sucesso: false, mensagem: "Não autorizado." });
  const limite = limitador.registrar(chaveDeOrigem(req));
  if (!limite.permitido) { context.res = { status: 429, headers: { "Retry-After": String(limite.retryAposSegundos) }, body: { sucesso: false, mensagem: "Muitas chamadas seguidas." } }; return; }
  if (req.method !== "POST") return res(405, { sucesso: false, mensagem: "Método não suportado." });
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  if (typeof corpo.texto !== "string") return res(400, { sucesso: false, mensagem: "Informe o texto do pedido." });
  if (corpo.nome != null && typeof corpo.nome !== "string") return res(400, { sucesso: false, mensagem: "Nome inválido." });
  if (typeof corpo.confidencial !== "boolean") return res(400, { sucesso: false, mensagem: "Diga se o pedido é confidencial." });
  const siteItemId = corpo.siteItemId == null ? null : inteiroPositivo(corpo.siteItemId);
  if (corpo.siteItemId != null && !siteItemId) return res(400, { sucesso: false, mensagem: "siteItemId inválido." });
  // Trava 7-C: o que dá para decidir sem o banco é decidido ANTES de pedir a conexão — o pedido comum (sem confidencialidade e sem sinal de risco) responde na hora, mesmo com o
  // Azure SQL pausado (acordá-lo levaria mais que os 8 s que o site espera).
  const previa = db.preverDoSite({ texto: corpo.texto, confidencial: corpo.confidencial });
  if (previa.invalido) return res(400, { sucesso: false, mensagem: "O texto do pedido está vazio." });
  if (!previa.precisaBanco) return res(200, { sucesso: true, gravado: false, risco: false });
  try {
    const r = await db.receberDoSite(await getPool(), { texto: corpo.texto, nome: corpo.nome, confidencial: corpo.confidencial, siteItemId });
    if (r.invalido) return res(400, { sucesso: false, mensagem: "O texto do pedido está vazio." });
    return res(200, { sucesso: true, gravado: !!r.gravado, risco: !!r.risco, ...(r.risco ? { avisada: !!r.avisada } : {}), ...(r.limite ? { limite: true } : {}) });
  } catch (e) {
    context.log.error("[CuidadoPastoralSite] erro:", e);
    return res(500, { sucesso: false, mensagem: "Erro interno." });
  }
};
