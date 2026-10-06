const { permitir, ipDoPedido } = require("../src/lib/rateLimit");
const { gerarHash, chaveTelefone } = require("../src/lib/telefone");
const { avaliarJanela } = require("../src/lib/janela");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

/*
 * Cria um pedido público de camiseta, atribuindo-o automaticamente ao
 * "lote" (janela de compra) que estiver aberto na campanha — do jeito que a
 * planilha de camisetas da tesouraria já funciona há anos: cada pedido cai
 * sozinho no lote vigente, sem o admin escolher nada; quando a equipe fecha
 * o lote (painel, `/painel-camisetas/grupo/pedidos/`), o próximo pedido cria
 * um lote novo sozinho, com o número seguinte.
 *
 * A criação de pedido/item/resposta deixou de ser feita direto pelo
 * navegador (permissão pública removida do Directus) — reunir tudo aqui
 * evita a corrida de duas pessoas criarem o "lote 1" ao mesmo tempo (só um
 * lugar decide isso) e evita expor a lógica de atribuição de lote no
 * cliente.
 *
 * Telefone chega em texto puro e vira DUAS coisas gravadas: `telefone`
 * (scrypt com salt, como sempre) e `telefone_chave` (HMAC com segredo do
 * servidor, 06/10/2026) — a chave é o que permite achar "este telefone já
 * pediu?" com um filtro de igualdade no Directus, em vez de baixar todos os
 * pedidos da campanha e rodar scrypt um por um (50 ms cada): com 1.000
 * pedidos isso dava 50 s por pedido, estourava o limite da função, e foi o
 * que travou o site no pico de 06/10/2026.
 */
const LIMITE_PEDIDOS_POR_IP = 40; // 5 min; muita gente pede do mesmo Wi-Fi da igreja/evento

function emailNormalizado(email) {
  const texto = email ? String(email).trim().toLowerCase() : "";
  return texto || null;
}

async function pedidoDuplicado(headers, grupoId, telefoneChave, email) {
  const ou = [`filter[_or][0][telefone_chave][_eq]=${encodeURIComponent(telefoneChave)}`];
  if (email) ou.push(`filter[_or][1][email][_eq]=${encodeURIComponent(email)}`);
  const res = await fetch(
    `${DIRECTUS_URL}/items/camiseta_pedidos?filter[grupo][_eq]=${grupoId}&${ou.join("&")}&fields=id&limit=1`,
    { headers },
  );
  if (!res.ok) throw new Error(`falha ao conferir pedidos existentes (${res.status})`);
  return ((await res.json()).data || []).length > 0;
}

const CACHE_GRUPO_MS = 10 * 1000;
const cacheGrupos = new Map();

async function lerGrupo(headers, grupoId) {
  const agora = Date.now();
  const guardado = cacheGrupos.get(grupoId);
  if (guardado && agora - guardado.em < CACHE_GRUPO_MS) return guardado.valor;
  const res = await fetch(`${DIRECTUS_URL}/items/camiseta_grupos/${grupoId}?fields=id,limite_uma_por_pessoa,ativo,pedidos_ate`, { headers });
  const valor = res.ok ? { ok: true, grupo: (await res.json()).data } : { ok: false, status: res.status };
  if (res.ok || res.status === 404) cacheGrupos.set(grupoId, { em: agora, valor });
  return valor;
}

async function lotesAbertos(headers, grupoId) {
  const res = await fetch(
    `${DIRECTUS_URL}/items/camiseta_lotes?filter[grupo][_eq]=${grupoId}&filter[status][_eq]=aberto&sort=id&fields=id,numero&limit=5`,
    { headers },
  );
  if (!res.ok) throw new Error(`falha ao consultar lote aberto (${res.status})`);
  return (await res.json()).data || [];
}

async function encontrarOuCriarLoteAberto(headers, grupoId, log) {
  // Erro do Directus aqui é ERRO, nunca "não existe lote": em 06/10/2026, sob carga
  // (centenas de pedidos por hora), respostas falhas foram lidas como "nenhum lote
  // aberto" e "nenhum lote anterior", e a rota criou seis lotes "abertos" ao mesmo
  // tempo, três deles com o número 1. Falhou a consulta: 502 e o pedido não entra.
  const abertos = await lotesAbertos(headers, grupoId);
  if (abertos.length > 0) return abertos[0].id;

  const ultimoRes = await fetch(
    `${DIRECTUS_URL}/items/camiseta_lotes?filter[grupo][_eq]=${grupoId}&sort=-numero&limit=1&fields=numero`,
    { headers },
  );
  if (!ultimoRes.ok) throw new Error(`falha ao consultar último lote (${ultimoRes.status})`);
  const ultimo = (await ultimoRes.json()).data?.[0];
  const proximoNumero = (ultimo?.numero ?? 0) + 1;

  const criadoRes = await fetch(`${DIRECTUS_URL}/items/camiseta_lotes`, {
    method: "POST",
    headers,
    body: JSON.stringify({ grupo: grupoId, numero: proximoNumero, status: "aberto" }),
  });
  if (!criadoRes.ok) throw new Error("falha ao criar lote");
  const criado = (await criadoRes.json()).data;

  // Corrida: dois pedidos simultâneos podem ter criado dois lotes. Vale o de menor id;
  // o que este pedido criou, se não for ele, é apagado (ainda sem nenhum pedido).
  const depois = await lotesAbertos(headers, grupoId);
  const vencedor = depois.length > 0 ? depois[0] : criado;
  if (vencedor.id !== criado.id) {
    const apagar = await fetch(`${DIRECTUS_URL}/items/camiseta_lotes/${criado.id}`, { method: "DELETE", headers });
    if (log) log(`lote ${criado.id} criado em corrida; mantido o ${vencedor.id}; apagado=${apagar.ok}`);
  }
  return vencedor.id;
}

module.exports = async function (context, req) {
  if (!permitir(`criar-pedido-camiseta:${ipDoPedido(req)}`, LIMITE_PEDIDOS_POR_IP)) {
    context.res = { status: 429, body: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    return;
  }

  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN || !process.env.TELEFONE_CHAVE_SEGREDO) {
    context.log.error("Configuração ausente (DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN/TELEFONE_CHAVE_SEGREDO).");
    context.res = { status: 500, body: { erro: "Configuração ausente." } };
    return;
  }

  const body = req.body || {};
  const grupoId = Number(body.grupoId);
  const nome = String(body.nome || "").trim().slice(0, 120);
  const telefone = String(body.telefone || "");
  const email = emailNormalizado(body.email);
  const itens = Array.isArray(body.itens) ? body.itens.slice(0, 20) : [];
  const respostas = Array.isArray(body.respostas) ? body.respostas.slice(0, 30) : [];

  const telefoneHash = gerarHash(telefone);
  const telefoneChave = chaveTelefone(telefone);
  if (!Number.isInteger(grupoId) || grupoId <= 0 || !nome || !telefoneHash || !telefoneChave || itens.length === 0) {
    context.res = { status: 400, body: { erro: "Parâmetros ausentes." } };
    return;
  }

  const totalQuantidade = itens.reduce((soma, item) => soma + (Number(item.quantidade) || 0), 0);

  const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}`, "Content-Type": "application/json" };

  // Cada ida ao Directus custa ~150 ms (as Functions do site rodam em East US 2; o Directus,
  // em Brazil South) e CPU do Directus (plano B1, 1 núcleo: o gargalo medido em 06/10/2026 —
  // 98 % de CPU com 6 gravações em paralelo, PostgreSQL a 8 %). Por isso: a campanha fica em
  // cache 10 s por instância (ativo/prazo/limite mudam raramente; o 403 chega em até 10 s), e
  // as consultas de abertura que restam vão juntas.
  const [grupoRes, duplicadoRes, abertosRes] = await Promise.all([
    lerGrupo(headers, grupoId),
    pedidoDuplicado(headers, grupoId, telefoneChave, email).then((v) => ({ ok: true, v })).catch((err) => ({ ok: false, err })),
    lotesAbertos(headers, grupoId).then((v) => ({ ok: true, v })).catch((err) => ({ ok: false, err })),
  ]);
  if (!grupoRes.ok) {
    context.res = { status: 404, body: { erro: "Camiseta não encontrada." } };
    return;
  }
  const grupo = grupoRes.grupo;

  // Campanha encerrada não aceita pedido — nem pelo formulário antigo ainda aberto num
  // navegador, nem por chamada direta. Até 06/10/2026 esta rota olhava só a existência do
  // grupo: uma campanha desativada no Directus (`ativo = false`) e com prazo vencido
  // continuou recebendo centenas de pedidos. `ativo` manda acima de tudo (desativou,
  // fechou, mesmo com prazo no futuro); `pedidos_ate` (dia, inclusive, no horário de
  // Brasília) fecha pelo prazo. A mesma regra está em `StatusCamiseta`, que a página
  // consulta ao abrir.
  const janela = avaliarJanela({ ativo: grupo.ativo !== false, ate: grupo.pedidos_ate, rotulo: "pedidos" });
  if (!janela.aberto) {
    context.res = { status: 403, body: { erro: janela.mensagem, motivo: janela.motivo } };
    return;
  }

  if (grupo.limite_uma_por_pessoa) {
    if (totalQuantidade > 1) {
      context.res = { status: 400, body: { erro: "Esta campanha permite só 1 peça por pessoa." } };
      return;
    }
    if (!duplicadoRes.ok) {
      context.log.error("Falha ao conferir pedido duplicado:", duplicadoRes.err);
      context.res = { status: 502, body: { erro: "Falha ao preparar o pedido." } };
      return;
    }
    if (duplicadoRes.v) {
      context.res = {
        status: 409,
        body: { erro: "Você já fez um pedido nesta campanha. Esta campanha permite só 1 peça por pessoa." },
      };
      return;
    }
  }

  let loteId;
  try {
    if (!abertosRes.ok) throw abertosRes.err;
    loteId = abertosRes.v.length > 0 ? abertosRes.v[0].id : await encontrarOuCriarLoteAberto(headers, grupoId, (m) => context.log.warn(m));
  } catch (err) {
    context.log.error("Falha ao resolver lote aberto:", err);
    context.res = { status: 502, body: { erro: "Falha ao preparar o pedido." } };
    return;
  }

  // Pedido + itens + respostas numa gravação só (criação aninhada pelas relações `itens` e
  // `respostas` do Directus, numa transação): antes eram 1 + N + M idas. Ou grava tudo, ou nada.
  const pedidoRes = await fetch(`${DIRECTUS_URL}/items/camiseta_pedidos`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      grupo: grupoId,
      lote: loteId,
      nome,
      telefone: telefoneHash,
      telefone_chave: telefoneChave,
      email,
      congregacao: body.congregacaoId ? Number(body.congregacaoId) : null,
      itens: itens.map((item) => ({ tamanho: item.tamanho || null, modelo: item.modelo || null, quantidade: Number(item.quantidade) || 0 })),
      respostas: respostas.map((resposta) => ({ pergunta: resposta.pergunta, valor: resposta.valor })),
    }),
  });
  if (!pedidoRes.ok) {
    context.log.error("Falha ao criar pedido:", pedidoRes.status);
    context.res = { status: 502, body: { erro: "Falha ao criar pedido." } };
    return;
  }
  const pedidoId = (await pedidoRes.json()).data.id;

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { pedidoId, lote: loteId } };
};
