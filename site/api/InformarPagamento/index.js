const { permitir, ipDoPedido } = require("../src/lib/rateLimit");
const { conferirHashAssincrono, chaveTelefone } = require("../src/lib/telefone");
const { verificar } = require("../src/lib/contaToken");
const { validarPagamentoInformado, camposDoAviso, avisoDoRegistro } = require("../src/lib/pagamentoInformado");

/*
 * "Informar o pagamento" (v7.13, 22/10/2026) — da inscrição em evento e do pedido de camiseta. A pessoa diz a data, o meio, o valor e o nome de quem pagou; a equipe confere no
 * extrato e confirma no painel. Esta rota NUNCA marca nada como pago: só grava o aviso (`pagamento_informado_*`), e informar de novo substitui o anterior.
 *
 * Quem pode informar (a mesma prova que cada página já usa para mostrar o registro):
 *   - inscrição pelo CÓDIGO + TELEFONE (página "Informar pagamento" do evento):  { tipo: "inscricao", evento, codigo, telefone, pagamento };
 *   - inscrição pela MINHA CONTA (o token assinado; o e-mail da inscrição tem de ser o da conta):  { tipo: "inscricao", token, inscricaoId, pagamento };
 *   - pedido de camiseta pelo TELEFONE do pedido ("Meus pedidos"):  { tipo: "pedido", telefone, pedidoId, pagamento };
 *   - pedido de camiseta pela MINHA CONTA:  { tipo: "pedido", token, pedidoId, pagamento }.
 * Dado que não confere responde sempre a mesma coisa (404 "não encontramos"), para a rota não servir para descobrir se um código ou um pedido existe. Limite: 50 chamadas por IP
 * em 5 minutos (o mesmo das outras consultas por telefone). Grava com o token de administrador, só os 5 campos do aviso.
 */
const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;
// Revisão de 22/10/2026: 50 (era 20) — no dia do evento muita gente informa pelo mesmo Wi-Fi (mesmo IP de saída). Adivinhar código + telefone continua inviável.
const LIMITE_POR_IP = 50; // 5 min

/** Preço por peça (o mesmo de `ConsultarPedidosCamiseta`): o do tamanho, se a campanha tiver; senão o valor de venda; sem nada, grátis. */
function precoTamanho(grupo, tamanho) {
  const precos = (grupo && grupo.precos_tamanho) || {};
  if (tamanho && precos[tamanho] != null && precos[tamanho] !== "") return Number(precos[tamanho]);
  return grupo && grupo.valor_venda != null ? Number(grupo.valor_venda) : 0;
}

/**
 * O telefone confere com o registro? Com a chave de busca gravada, só a chave (HMAC, rápido); sem ela (registro antigo), o scrypt FORA do processo principal
 * (revisão de 22/10/2026: antes rodava o `scryptSync`, que trava o processo).
 */
async function telefoneConfere(telefone, registro) {
  const chave = chaveTelefone(telefone);
  if (!chave) return false;
  if (registro.telefone_chave) return registro.telefone_chave === chave;
  return Boolean(registro.telefone) && conferirHashAssincrono(telefone, registro.telefone);
}

const NAO_ACHOU = "Não encontramos esse registro com os dados informados. Confira e tente de novo.";

async function lerUm(colecao, id, campos) {
  const r = await fetch(`${DIRECTUS_URL}/items/${colecao}/${id}?fields=${campos}`, { headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` } });
  if (r.status === 404 || r.status === 403) return { naoAchou: true };
  if (!r.ok) return { falhou: r.status };
  return { item: (await r.json()).data };
}

/** Acha o registro e confere a prova. Devolve `{ colecao, item }`, `{ naoAchou: true }`, `{ falhou }` ou `{ sessao: true }` (token da conta vencido). */
async function acharRegistro(body) {
  const tipo = body.tipo === "pedido" ? "pedido" : body.tipo === "inscricao" ? "inscricao" : null;
  if (!tipo) return { invalido: "Tipo de registro inválido." };
  const porConta = typeof body.token === "string" && body.token.length > 0;
  let email = null;
  if (porConta) {
    email = verificar(body.token);
    if (!email) return { sessao: true };
  }

  if (tipo === "inscricao") {
    // `*`: num Directus sem os campos novos pedir `cortesia` daria 403 (e a resposta seria 502 em vez do 503 "não disponível").
    const campos = "*";
    if (porConta) {
      const id = Number(body.inscricaoId);
      if (!Number.isInteger(id) || id <= 0) return { invalido: "Inscrição inválida." };
      const lido = await lerUm("inscricoes_eventos", id, campos);
      if (!lido.item) return lido;
      if (String(lido.item.email || "").trim().toLowerCase() !== String(email).trim().toLowerCase()) return { naoAchou: true };
      return { colecao: "inscricoes_eventos", item: lido.item };
    }
    const evento = Number(body.evento);
    const codigo = String(body.codigo || "").trim().toUpperCase();
    if (!Number.isInteger(evento) || evento <= 0 || !/^[A-Z0-9]{4,12}$/.test(codigo)) return { invalido: "Informe o código da inscrição e o telefone." };
    const r = await fetch(`${DIRECTUS_URL}/items/inscricoes_eventos?filter[evento][_eq]=${evento}&filter[codigo][_eq]=${encodeURIComponent(codigo)}&fields=${campos}&limit=2`, { headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` } });
    if (!r.ok) return { falhou: r.status };
    const linhas = (await r.json()).data || [];
    for (const l of linhas) if (await telefoneConfere(body.telefone, l)) return { colecao: "inscricoes_eventos", item: l };
    return { naoAchou: true };
  }

  const id = Number(body.pedidoId);
  if (!Number.isInteger(id) || id <= 0) return { invalido: "Pedido inválido." };
  const lido = await lerUm("camiseta_pedidos", id, "*,grupo.valor_venda,grupo.precos_tamanho");
  if (!lido.item) return lido;
  if (porConta) {
    if (String(lido.item.email || "").trim().toLowerCase() !== String(email).trim().toLowerCase()) return { naoAchou: true };
    return { colecao: "camiseta_pedidos", item: lido.item };
  }
  const chave = chaveTelefone(body.telefone);
  if (!chave) return { invalido: "Informe o telefone usado no pedido." };
  return (await telefoneConfere(body.telefone, lido.item)) ? { colecao: "camiseta_pedidos", item: lido.item } : { naoAchou: true };
}

module.exports = async function (context, req) {
  const responder = (status, body) => { context.res = { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body }; };
  if (!permitir(`informar-pagamento:${ipDoPedido(req)}`, LIMITE_POR_IP)) return responder(429, { erro: "Muitas tentativas. Aguarde alguns minutos." });
  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN || !process.env.TELEFONE_CHAVE_SEGREDO) {
    context.log.error("Configuração ausente (DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN/TELEFONE_CHAVE_SEGREDO).");
    return responder(500, { erro: "Configuração ausente." });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};

  // Primeiro o que é barato: o aviso em si.
  const validado = validarPagamentoInformado(body.pagamento);
  if (!validado.ok) return responder(400, { erro: validado.erro });

  let achado;
  try {
    achado = await acharRegistro(body);
  } catch (e) {
    context.log.error("Falha ao procurar o registro:", e);
    return responder(502, { erro: "Não foi possível conferir agora. Tente de novo em instantes." });
  }
  if (achado.invalido) return responder(400, { erro: achado.invalido });
  if (achado.sessao) return responder(401, { erro: "Sua sessão da Minha Conta expirou. Entre de novo." });
  if (achado.falhou) return responder(502, { erro: "Não foi possível conferir agora. Tente de novo em instantes." });
  if (achado.naoAchou) return responder(404, { erro: NAO_ACHOU });

  const { colecao, item } = achado;
  if (colecao === "inscricoes_eventos") {
    if (item.cortesia === true) return responder(409, { erro: "Esta inscrição é cortesia: não há pagamento a informar." });
    if (item.pago === true) return responder(409, { erro: "O pagamento desta inscrição já foi confirmado pela equipe." });
    // Revisão de 22/10/2026: a mesma regra da tela — só quem tem vaga e algo a pagar informa.
    if (item.aguardando_vaga === true) return responder(409, { erro: "Esta inscrição está na lista de espera: pague só depois que a vaga for confirmada." });
    if (item.pendente_aprovacao === true) return responder(409, { erro: "Esta inscrição ainda aguarda a aprovação da equipe: pague só depois de aprovada." });
    if (!(Number(item.valor) > 0)) return responder(409, { erro: "Esta inscrição não tem valor a pagar." });
  } else {
    if (item.avulso === true) return responder(409, { erro: "Venda de balcão: o pagamento é acertado direto com a equipe." });
    const itens = await fetch(`${DIRECTUS_URL}/items/camiseta_itens_pedido?filter[pedido][_eq]=${item.id}&fields=tamanho,quantidade&limit=-1`, { headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` } });
    if (!itens.ok) return responder(502, { erro: "Não foi possível conferir agora. Tente de novo em instantes." });
    const total = ((await itens.json()).data || []).reduce((s, i) => s + (Number(i.quantidade) || 0) * precoTamanho(item.grupo, i.tamanho), 0);
    if (!(total > 0)) return responder(409, { erro: "Este pedido não tem valor a pagar." });
    if (Number(item.valor_pago || 0) >= total) return responder(409, { erro: "Este pedido já está pago." });
  }

  const campos = camposDoAviso(validado.pagamento);
  const r = await fetch(`${DIRECTUS_URL}/items/${colecao}/${item.id}?fields=*`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(campos),
  });
  if (!r.ok) {
    context.log.error(`Falha ao gravar o aviso de pagamento em ${colecao}/${item.id}: ${r.status}`);
    return responder(502, { erro: "Não foi possível registrar agora. Tente de novo em instantes." });
  }
  const gravado = (await r.json().catch(() => ({}))).data || {};
  // O Directus IGNORA em silêncio um campo que não existe: sem o esquema v7.13 o PATCH "dá certo" e nada fica guardado. Conferir na resposta.
  if (!gravado.pagamento_informado_em) {
    context.log.error(`O aviso de pagamento não ficou gravado em ${colecao}/${item.id}: aplique site/scripts/directus-eventos-v713-esquema.mjs`);
    return responder(503, { erro: "Este recurso ainda não está disponível. Avise a equipe do evento." });
  }
  return responder(200, { ok: true, informado: avisoDoRegistro(gravado) });
};
