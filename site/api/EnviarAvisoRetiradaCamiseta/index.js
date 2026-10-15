const { EmailClient } = require("@azure/communication-email");
const { permitir, ipDoPedido } = require("../src/lib/rateLimit");
const { montarAvisoRetirada, enviarAviso } = require("../src/lib/avisoRetirada");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const ACS_CONNECTION_STRING = process.env.ACS_CONNECTION_STRING;
const REMETENTE = process.env.ACS_REMETENTE || "DoNotReply@ieadespa.org.br";

/*
 * Aviso de "pode retirar" de UM pedido, disparado pelo painel (`/painel-camisetas/grupo/pedidos/`) quando a equipe marca o
 * pedido como "separado" (Fase 28) ou clica em "Reenviar aviso" (15/10/2026).
 *
 * 15/10/2026 — FECHADA (achado do que o responsável perguntou): até aqui a rota era anônima e mandava e-mail para o
 * endereço e com o texto que a chamada trouxesse; o login do painel só protegia o botão, não a porta. Agora:
 *   1) exige o token do painel (`x-painel-token`) e PROVA o acesso lendo o pedido no Directus COM O TOKEN DA PESSOA
 *      (quem não enxerga o pedido lá não envia por aqui);
 *   2) recebe só o `pedidoId`: destinatário, nome, itens, local de retirada, assunto e mensagem vêm DO PEDIDO e da
 *      campanha, lidos no servidor — nada do que a chamada escrever vira e-mail (a pessoa não escolhe para quem nem o que);
 *   3) só envia se o pedido tem e-mail, não é venda avulsa, tem itens e está separado (ou a retirada foi liberada ao grupo).
 * O texto do e-mail mora em src/lib/avisoRetirada.js (o mesmo do aviso em massa).
 */
const LIMITE_POR_IP = 30; // 5 min

const cabecalhoDe = (req, nome) => { const k = Object.keys(req.headers || {}).find((c) => c.toLowerCase() === nome); return k ? String(req.headers[k]) : ""; };

module.exports = async function (context, req) {
  const responder = (status, body) => { context.res = { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body }; };

  if (!permitir(`aviso-retirada-camiseta:${ipDoPedido(req)}`, LIMITE_POR_IP)) return responder(429, { erro: "Muitas tentativas. Aguarde alguns minutos." });
  if (!DIRECTUS_URL || !ACS_CONNECTION_STRING) {
    context.log.error("DIRECTUS_URL/ACS_CONNECTION_STRING não configuradas nas Application Settings.");
    return responder(500, { erro: "Configuração ausente." });
  }

  const token = (cabecalhoDe(req, "x-painel-token") || cabecalhoDe(req, "authorization")).replace(/^Bearer\s+/i, "").trim();
  if (!token) return responder(401, { erro: "Entre no painel para enviar o aviso." });

  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const pedidoId = Number(corpo.pedidoId);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) return responder(400, { erro: "Pedido inválido." });

  // O pedido e a campanha, lidos com o token DA PESSOA: o Directus decide se ela pode.
  const campos = "id,nome,email,avulso,separado,grupo.id,grupo.nome,grupo.retirada_local,grupo.retirada_liberada,grupo.email_retirada_assunto,grupo.email_retirada_corpo,itens.tamanho,itens.modelo,itens.quantidade";
  let lido;
  try {
    lido = await fetch(`${DIRECTUS_URL}/items/camiseta_pedidos/${pedidoId}?fields=${campos}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    context.log.error("Falha ao consultar o pedido:", err && err.message);
    return responder(502, { erro: "Não foi possível conferir o pedido agora. Tente de novo." });
  }
  if (lido.status === 401) return responder(401, { erro: "Sua sessão do painel venceu. Entre de novo." });
  // (o Directus responde 403, e não 404, a quem não é administrador quando o pedido não existe)
  if (lido.status === 403 || lido.status === 404) return responder(lido.status, { erro: "Pedido não encontrado, ou o seu perfil não pode avisar sobre ele." });
  if (!lido.ok) return responder(502, { erro: "Não foi possível conferir o pedido agora. Tente de novo." });
  const pedido = (await lido.json()).data;
  const grupo = pedido && pedido.grupo && typeof pedido.grupo === "object" ? pedido.grupo : null;
  const itens = Array.isArray(pedido && pedido.itens) ? pedido.itens : [];

  if (!pedido || !grupo) return responder(404, { erro: "Pedido não encontrado." });
  if (pedido.avulso) return responder(409, { erro: "Venda avulsa não tem aviso de retirada (a peça já sai na hora)." });
  if (!pedido.email) return responder(400, { erro: "Este pedido não tem e-mail. Avise pelo WhatsApp." });
  if (itens.length === 0) return responder(409, { erro: "Este pedido não tem itens." });
  if (!pedido.separado && !grupo.retirada_liberada) return responder(409, { erro: "Este pedido ainda não está separado e a retirada não foi liberada: não há o que avisar." });

  try {
    const aviso = montarAvisoRetirada({
      nome: pedido.nome,
      campanhaNome: grupo.nome,
      itens: itens.map((i) => ({ tamanho: i.tamanho, modelo: i.modelo, quantidade: i.quantidade })),
      retiradaLocal: grupo.retirada_local || null,
      assunto: grupo.email_retirada_assunto || null,
      corpo: grupo.email_retirada_corpo || null,
    });
    await enviarAviso(new EmailClient(ACS_CONNECTION_STRING), REMETENTE, { email: pedido.email, aviso, aguardarEntrega: true });
    return responder(200, { enviado: true });
  } catch (err) {
    context.log.error("Falha ao enviar e-mail de aviso de retirada:", err);
    return responder(200, { enviado: false });
  }
};
