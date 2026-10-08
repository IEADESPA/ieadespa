const { EmailClient } = require("@azure/communication-email");
const { permitir, ipDoPedido } = require("../src/lib/rateLimit");
const { montarAvisoRetirada, enviarAviso } = require("../src/lib/avisoRetirada");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;
const ACS_CONNECTION_STRING = process.env.ACS_CONNECTION_STRING;
const REMETENTE = process.env.ACS_REMETENTE || "DoNotReply@ieadespa.org.br";

/*
 * AVISO EM MASSA de retirada (08/10/2026, pedido do responsável: "mil pedidos; não dá para avisar um por um").
 *
 * As camisetas chegaram: o painel chama esta rota repetidas vezes, em lotes de até 40 pedidos, até não sobrar
 * ninguém. Em cada lote: lê os pedidos do grupo que TÊM e-mail e ainda NÃO foram avisados (`aviso_retirada_em`
 * nulo), manda o e-mail de "pode retirar" (o mesmo texto do aviso individual: assunto/corpo do grupo + itens +
 * onde retirar) e carimba `aviso_retirada_em`. Na primeira chamada liga `retirada_liberada` no grupo — a partir
 * daí a página "Meus pedidos" mostra "chegou, pode retirar" para TODOS os pedidos do grupo, inclusive os sem
 * e-mail (1 em 4) e os ainda não separados: separar no balcão é o de menos.
 *
 * Quem pode: só quem está logado no painel — o token do Directus da pessoa vem em `x-painel-token` e tem de
 * enxergar o grupo (mesma prova do telefone-pedido). `simular: true` só conta, não envia nem carimba.
 * Melhor esforço por e-mail: um envio que falha não derruba o lote (fica sem carimbo e entra no próximo).
 */
const LOTE_MAX = 40;
const LIMITE_POR_IP = 60; // 5 min: 805 e-mails são ~21 lotes

const cabecalhoDe = (req, nome) => { const k = Object.keys(req.headers || {}).find((c) => c.toLowerCase() === nome); return k ? String(req.headers[k]) : ""; };

async function directus(metodo, caminho, token, corpo) {
  const r = await fetch(`${DIRECTUS_URL}${caminho}`, { method: metodo, headers: { Authorization: `Bearer ${token}`, ...(corpo ? { "Content-Type": "application/json" } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  const j = await r.json().catch(() => null);
  return { status: r.status, ok: r.ok, data: j && j.data };
}

module.exports = async function (context, req) {
  if (!permitir(`avisar-retirada-camisetas:${ipDoPedido(req)}`, LIMITE_POR_IP)) {
    context.res = { status: 429, body: { sucesso: false, erro: "Muitas chamadas. Aguarde alguns minutos." } };
    return;
  }
  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN || !ACS_CONNECTION_STRING) {
    context.res = { status: 500, body: { sucesso: false, erro: "Configuração ausente." } };
    return;
  }
  const corpo = req.body && typeof req.body === "object" ? req.body : {};
  const grupoId = Number(corpo.grupoId);
  const simular = corpo.simular === true;
  const lote = Math.max(1, Math.min(LOTE_MAX, Number(corpo.lote) || LOTE_MAX));
  if (!Number.isInteger(grupoId) || grupoId <= 0) {
    context.res = { status: 400, body: { sucesso: false, erro: "Grupo inválido." } };
    return;
  }
  const tokenPainel = (cabecalhoDe(req, "x-painel-token") || cabecalhoDe(req, "authorization")).replace(/^Bearer\s+/i, "").trim();
  if (!tokenPainel) {
    context.res = { status: 401, body: { sucesso: false, erro: "Entre no painel para avisar os pedidos." } };
    return;
  }

  // prova de acesso: o token da pessoa enxerga ESTE grupo
  const prova = await directus("GET", `/items/camiseta_grupos/${grupoId}?fields=id`, tokenPainel);
  if (prova.status === 401 || prova.status === 403) { context.res = { status: 401, body: { sucesso: false, erro: `Sua sessão do painel não vale mais. Entre de novo. (Directus respondeu ${prova.status})` } }; return; }
  if (prova.status === 404) { context.res = { status: 404, body: { sucesso: false, erro: "Grupo não encontrado." } }; return; }
  if (!prova.ok) { context.res = { status: 502, body: { sucesso: false, erro: "Falha ao conferir o acesso." } }; return; }

  const g = await directus("GET", `/items/camiseta_grupos/${grupoId}?fields=id,nome,retirada_local,email_retirada_assunto,email_retirada_corpo,retirada_liberada`, DIRECTUS_ADMIN_TOKEN);
  if (!g.ok || !g.data) { context.res = { status: 502, body: { sucesso: false, erro: "Falha ao ler o grupo." } }; return; }
  const grupo = g.data;

  const filtro = `filter[grupo][_eq]=${grupoId}&filter[email][_nempty]=true&filter[aviso_retirada_em][_null]=true`;
  const total = await directus("GET", `/items/camiseta_pedidos?aggregate[count]=id&${filtro}`, DIRECTUS_ADMIN_TOKEN);
  const pendentes = Number(total.ok && total.data && total.data[0] ? total.data[0].count.id : 0);
  const avisadosAntes = await directus("GET", `/items/camiseta_pedidos?aggregate[count]=id&filter[grupo][_eq]=${grupoId}&filter[aviso_retirada_em][_nnull]=true`, DIRECTUS_ADMIN_TOKEN);
  const jaAvisados = Number(avisadosAntes.ok && avisadosAntes.data && avisadosAntes.data[0] ? avisadosAntes.data[0].count.id : 0);
  const semEmail = await directus("GET", `/items/camiseta_pedidos?aggregate[count]=id&filter[grupo][_eq]=${grupoId}&filter[email][_empty]=true`, DIRECTUS_ADMIN_TOKEN);
  const semEmailN = Number(semEmail.ok && semEmail.data && semEmail.data[0] ? semEmail.data[0].count.id : 0);

  if (simular) {
    context.res = { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: { sucesso: true, simulado: true, enviados: 0, falhas: 0, restantes: pendentes, jaAvisados, semEmail: semEmailN, retiradaLiberada: !!grupo.retirada_liberada } };
    return;
  }

  // 1ª chamada: libera a retirada para todos (Meus pedidos passa a mostrar "chegou")
  if (!grupo.retirada_liberada) await directus("PATCH", `/items/camiseta_grupos/${grupoId}`, DIRECTUS_ADMIN_TOKEN, { retirada_liberada: true });

  const lista = await directus("GET", `/items/camiseta_pedidos?fields=id,nome,email,itens.tamanho,itens.modelo,itens.quantidade&${filtro}&limit=${lote}&sort=id`, DIRECTUS_ADMIN_TOKEN);
  const pedidos = lista.ok && Array.isArray(lista.data) ? lista.data : [];
  const client = new EmailClient(ACS_CONNECTION_STRING);
  const agora = new Date().toISOString();
  const carimbar = [];
  let falhas = 0;
  for (const p of pedidos) {
    try {
      const aviso = montarAvisoRetirada({ nome: p.nome, campanhaNome: grupo.nome, itens: p.itens || [], retiradaLocal: grupo.retirada_local || null, assunto: grupo.email_retirada_assunto || null, corpo: grupo.email_retirada_corpo || null });
      await enviarAviso(client, REMETENTE, { email: p.email, aviso, aguardarEntrega: false });
      carimbar.push({ id: p.id, aviso_retirada_em: agora });
    } catch (e) {
      falhas++;
      context.log.warn(`[AvisarRetiradaCamisetas] pedido ${p.id}: ${e && e.message}`);
    }
  }
  if (carimbar.length) {
    const r = await directus("PATCH", `/items/camiseta_pedidos`, DIRECTUS_ADMIN_TOKEN, carimbar);
    if (!r.ok) context.log.error(`[AvisarRetiradaCamisetas] não carimbou ${carimbar.length} pedido(s) (Directus ${r.status})`);
  }
  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: { sucesso: true, simulado: false, enviados: carimbar.length, falhas, restantes: Math.max(0, pendentes - carimbar.length), jaAvisados: jaAvisados + carimbar.length, semEmail: semEmailN, retiradaLiberada: true }
  };
};
