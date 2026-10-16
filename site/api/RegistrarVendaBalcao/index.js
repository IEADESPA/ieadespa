const { permitir, ipDoPedido } = require("../src/lib/rateLimit");
const { cifrarTelefone } = require("../src/lib/telefone");
const { validarVenda } = require("../src/lib/vendaBalcao");
const { limitesDoGrupo, temLimite, normalizarItens, criarPedidoComLimite, umaVezPorChave } = require("../src/lib/limiteLote");

const DIRECTUS_URL = process.env.DIRECTUS_URL;

/*
 * Venda de balcão (13/10/2026): quem tem a função "Gestor de Camisetas" (ou é administrador)
 * lança pelo painel a venda de uma camiseta para alguém que está na sua frente, com nome,
 * telefone e e-mail se houver (muita gente não tem), congregação e o LOTE em que a peça entra,
 * esteja a campanha aberta ou fechada para o público (a regra de prazo é do formulário público;
 * o gestor lança por conta própria).
 *
 * Por que passa por esta função e não direto pelo painel (como a venda avulsa antiga): o
 * telefone precisa virar hash (scrypt), chave de busca (HMAC) e número cifrado, e o segredo
 * dessas contas só existe aqui no servidor.
 *
 * SEGURANÇA: a função NÃO usa o token de administrador para gravar. Ela usa o token do próprio
 * gestor (`x-painel-token`, o mesmo do painel): quem o Directus não deixaria criar pedido, não
 * cria por aqui; só o que a pessoa não consegue calcular (as três formas do telefone) é
 * acrescentado pelo servidor. Quem registrou fica no registro de execução (id do usuário).
 */
const LIMITE_POR_IP = 120; // 5 min — uma mesa de venda lança muitas seguidas

const cabecalhoDe = (req, nome) => { const k = Object.keys(req.headers || {}).find((c) => c.toLowerCase() === nome); return k ? String(req.headers[k]) : ""; };

async function directus(token, caminho, init = {}) {
  return fetch(`${DIRECTUS_URL}${caminho}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
}

async function lotesAbertos(token, grupoId) {
  const res = await directus(token, `/items/camiseta_lotes?filter[grupo][_eq]=${grupoId}&filter[status][_eq]=aberto&sort=id&fields=id,numero&limit=5`);
  if (!res.ok) throw new Error(`falha ao consultar lote aberto (${res.status})`);
  return (await res.json()).data || [];
}

// Mesma regra do formulário público: erro do Directus é erro, nunca "não existe lote" (em 06/10/2026 isso criou seis lotes abertos).
async function encontrarOuCriarLoteAberto(token, grupoId, log) {
  const abertos = await lotesAbertos(token, grupoId);
  if (abertos.length > 0) return abertos[0];
  const ultimoRes = await directus(token, `/items/camiseta_lotes?filter[grupo][_eq]=${grupoId}&sort=-numero&limit=1&fields=numero`);
  if (!ultimoRes.ok) throw new Error(`falha ao consultar último lote (${ultimoRes.status})`);
  const ultimo = (await ultimoRes.json()).data?.[0];
  const criadoRes = await directus(token, "/items/camiseta_lotes", { method: "POST", body: JSON.stringify({ grupo: grupoId, numero: (ultimo?.numero ?? 0) + 1, status: "aberto" }) });
  if (!criadoRes.ok) throw new Error("falha ao criar lote");
  const criado = (await criadoRes.json()).data;
  const depois = await lotesAbertos(token, grupoId);
  const vencedor = depois.length > 0 ? depois[0] : criado;
  if (vencedor.id !== criado.id) {
    const apagar = await directus(token, `/items/camiseta_lotes/${criado.id}`, { method: "DELETE" });
    if (log) log(`lote ${criado.id} criado em corrida; mantido o ${vencedor.id}; apagado=${apagar.ok}`);
  }
  return vencedor;
}

// A mensagem da recusa por limite, para quem está no balcão (a do formulário público fala com o cliente).
function mensagemDoLimiteParaGestor(recusa, limites, loteNumero) {
  const lote = loteNumero ? `lote ${loteNumero}` : "lote aberto";
  const pecas = (n) => `${n} ${n === 1 ? "peça" : "peças"}`;
  if (recusa.motivo === "esgotado") return `O ${lote} já atingiu o limite de pedidos (${pecas(limites.total)}). Para vender mais, aumente o limite na campanha (aba Dados). Nada foi registrado.`;
  if (recusa.motivo === "quantidade") return `Só restam ${pecas(recusa.restam)} no limite de pedidos do ${lote}. Diminua a quantidade ou aumente o limite na campanha. Nada foi registrado.`;
  if (recusa.motivo === "tamanho_esgotado") return `O tamanho ${recusa.tamanho} já atingiu o limite do ${lote} (${pecas(limites.porTamanho[recusa.tamanho])}). Aumente o limite do tamanho na campanha (aba Dados) ou escolha outro. Nada foi registrado.`;
  return `Do tamanho ${recusa.tamanho} só restam ${pecas(recusa.restam)} no limite do ${lote}. Diminua a quantidade ou aumente o limite na campanha. Nada foi registrado.`;
}

module.exports = async function (context, req) {
  const responder =(status, body) => { context.res = { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body }; };

  if (!permitir(`venda-balcao:${ipDoPedido(req)}`, LIMITE_POR_IP)) return responder(429, { erro: "Muitas tentativas. Aguarde alguns minutos." });
  if (!DIRECTUS_URL || !process.env.TELEFONE_CHAVE_SEGREDO) {
    context.log.error("Configuração ausente (DIRECTUS_URL/TELEFONE_CHAVE_SEGREDO).");
    return responder(500, { erro: "Configuração ausente." });
  }
  // Mesmo cabeçalho do painel (o Authorization pode ser alterado pelo proxy do Static Web Apps; ver TelefonePedido).
  const token = (cabecalhoDe(req, "x-painel-token") || cabecalhoDe(req, "authorization")).replace(/^Bearer\s+/i, "").trim();
  if (!token) return responder(401, { erro: "Entre no painel para registrar a venda." });

  const grupoId = Number((req.body || {}).grupoId);
  if (!Number.isInteger(grupoId) || grupoId <= 0) return responder(400, { erro: "Campanha inválida." });

  // Prova de acesso e lista de tamanhos/modelos: a campanha lida com o token da PRÓPRIA pessoa.
  // `fields=*`: `limite_total` e `limites_tamanho` são campos novos (16/10/2026) e o Directus responde 403 a quem pede um campo que não existe.
  const grupoRes = await directus(token, `/items/camiseta_grupos/${grupoId}?fields=*`);
  if (grupoRes.status === 401) return responder(401, { erro: "Sua sessão do painel venceu. Entre de novo." });
  // (o Directus responde 403, e não 404, a quem não é administrador quando o item não existe)
  if (grupoRes.status === 403) return responder(403, { erro: "Campanha não encontrada, ou o seu perfil não pode registrar vendas de camiseta nela." });
  if (grupoRes.status === 404) return responder(404, { erro: "Campanha não encontrada." });
  if (!grupoRes.ok) return responder(502, { erro: "Falha ao conferir a campanha. Tente de novo." });
  const grupo = (await grupoRes.json()).data;

  const v = validarVenda(req.body, grupo);
  if (!v.ok) return responder(400, { erro: v.erro });
  const d = v.dados;

  try {
    // Já existe pedido deste telefone ou e-mail nesta campanha? Avisa (o gestor confirma): evita lançar duas vezes a mesma pessoa.
    if ((d.telefone || d.email) && !d.confirmarDuplicado) {
      const ou = [];
      if (d.telefone) ou.push(`filter[_or][${ou.length}][telefone_chave][_eq]=${encodeURIComponent(d.telefone.chave)}`);
      if (d.email) ou.push(`filter[_or][${ou.length}][email][_eq]=${encodeURIComponent(d.email)}`);
      const dupRes = await directus(token, `/items/camiseta_pedidos?filter[grupo][_eq]=${grupoId}&${ou.join("&")}&fields=id,nome&limit=3`);
      if (!dupRes.ok) throw new Error(`falha ao conferir pedidos existentes (${dupRes.status})`);
      const existentes = (await dupRes.json()).data || [];
      if (existentes.length > 0) {
        return responder(409, { duplicado: true, existentes: existentes.map((e) => ({ id: e.id, nome: e.nome })), erro: `Já existe pedido com este ${d.telefone && d.email ? "telefone ou e-mail" : d.telefone ? "telefone" : "e-mail"} nesta campanha (#${existentes[0].id}, ${existentes[0].nome}).` });
      }
    }

    // O lote
    let loteId = null;
    let avulso = false;
    let loteNumero = null;
    let loteEstaAberto = false; // o limite de pedidos vale para o lote ABERTO (16/10/2026)
    if (d.lote === "avulso") avulso = true;
    else if (d.lote === "aberto") {
      const l = await umaVezPorChave(`criar-lote-balcao:${grupoId}`, () => encontrarOuCriarLoteAberto(token, grupoId, (m) => context.log.warn(m))); // uma vez só por instância (ver CriarPedidoCamiseta)
      loteId = l.id; loteNumero = l.numero; loteEstaAberto = true;
    } else {
      const loteRes = await directus(token, `/items/camiseta_lotes/${d.lote}?fields=id,numero,grupo,status`);
      if (loteRes.status === 404 || loteRes.status === 403) return responder(400, { erro: "Lote não encontrado." });
      if (!loteRes.ok) throw new Error(`falha ao ler o lote (${loteRes.status})`);
      const l = (await loteRes.json()).data;
      if (Number(l.grupo) !== grupoId) return responder(400, { erro: "Esse lote é de outra campanha." });
      // Lote fechado: a encomenda à malharia dele já foi feita; a peça só entra com a confirmação do gestor, ciente de que ficou fora daquela encomenda.
      if (l.status !== "aberto" && !d.confirmarLoteFechado) {
        return responder(409, { loteFechado: true, erro: `O lote ${l.numero} já está fechado: a encomenda dele já foi feita e esta peça ficaria fora dela. Confirme só se isso é mesmo o que você quer.` });
      }
      loteId = l.id; loteNumero = l.numero; loteEstaAberto = l.status === "aberto";
    }

    // Pedido + itens numa gravação só (criação aninhada, numa transação): ou grava tudo, ou nada.
    const corpoPedido = {
      grupo: grupoId,
      lote: loteId,
      avulso,
      nome: d.nome,
      telefone: d.telefone ? d.telefone.hash : null,
      telefone_chave: d.telefone ? d.telefone.chave : null,
      telefone_cifrado: d.telefone ? cifrarTelefone(d.telefone.bruto) : null,
      email: d.email,
      congregacao: d.congregacao,
      valor_pago: d.valorPago,
      itens: d.itens,
    };

    let pedidoId;
    const limites = limitesDoGrupo(grupo);
    if (temLimite(limites) && loteId && loteEstaAberto) {
      // Mesmo limite do formulário público (ver `limiteLote.js`): a peça vendida no balcão também sai do que o lote tem. Sem exceção: para vender além do número, aumente o limite na campanha.
      const itensLimite = normalizarItens(d.itens);
      if (!itensLimite.ok) return responder(400, { erro: itensLimite.erro });
      const r = await criarPedidoComLimite({
        directus: (caminho, init = {}) => directus(token, caminho, init),
        grupoId, limites, pedido: { total: itensLimite.total, porTamanho: itensLimite.porTamanho }, corpoPedido, log: (m) => context.log.warn(m),
      });
      if (r.erroHttp) {
        const { status, body } = r.erroHttp;
        if (body.motivo === "permissao") return responder(status, { erro: status === 401 ? "Sua sessão do painel venceu. Entre de novo." : "Seu perfil não pode registrar vendas de camiseta." });
        if (status === 409) return responder(409, { limiteDoLote: true, motivo: body.motivo, restam: body.restam, erro: mensagemDoLimiteParaGestor(body, limites, loteNumero) });
        if (status === 503) return responder(503, { erro: "O sistema está recebendo muitos pedidos agora. Nada foi registrado; tente de novo em alguns segundos." });
        return responder(502, { erro: "Não foi possível gravar a venda. Nada foi registrado; tente de novo." });
      }
      pedidoId = r.pedidoId;
    } else {
      const pedidoRes = await directus(token, "/items/camiseta_pedidos", { method: "POST", body: JSON.stringify(corpoPedido) });
      if (pedidoRes.status === 401) return responder(401, { erro: "Sua sessão do painel venceu. Entre de novo." });
      if (pedidoRes.status === 403) return responder(403, { erro: "Seu perfil não pode registrar vendas de camiseta." });
      if (!pedidoRes.ok) {
        context.log.error("Falha ao criar a venda de balcão:", pedidoRes.status, (await pedidoRes.text()).slice(0, 300));
        return responder(502, { erro: "Não foi possível gravar a venda. Nada foi registrado; tente de novo." });
      }
      pedidoId = (await pedidoRes.json()).data.id;
    }

    // Quem lançou: só no registro de execução (o Directus não guarda esse dado no pedido).
    let quem = "desconhecido";
    try { const eu = await directus(token, "/users/me?fields=id"); if (eu.ok) quem = (await eu.json()).data?.id || quem; } catch { /* só para o registro */ }
    context.log(`[balcao] pedido ${pedidoId} da campanha ${grupoId}, lote ${loteNumero ?? "avulso"}, ${d.itens.length} linha(s), telefone ${d.telefone ? "sim" : "não"}, lançado pelo usuário ${quem}`);

    return responder(200, { pedidoId, lote: loteId, loteNumero, avulso, telefoneGuardado: !!d.telefone });
  } catch (err) {
    context.log.error("Falha na venda de balcão:", err && err.message);
    return responder(502, { erro: "Falha ao preparar a venda. Nada foi registrado; tente de novo." });
  }
};
