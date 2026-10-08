const { conferirHash, chaveTelefone, normalizarNome, cifrarTelefone } = require("../src/lib/telefone");
const { permitir, ipDoPedido } = require("../src/lib/rateLimit");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

/*
 * Fase 22 (camisetas/uniformes) — consulta pública só com telefone, de
 * propósito sem código nenhum (decisão explícita do usuário: "só digita o
 * telefone e pronto"). `camiseta_pedidos`/`camiseta_itens_pedido` não têm
 * leitura pública (protege telefone e valores), então essa Function faz o
 * mesmo papel de `VerificarInscricao`: acha com o token de admin e só
 * devolve o que é da pessoa.
 *
 * COMO ACHA (06/10/2026): pelo campo indexado `telefone_chave` (HMAC do
 * telefone, ver `telefone.js`) — um filtro de igualdade no Directus, em
 * milissegundos. Antes, baixava TODOS os pedidos do site e rodava scrypt em
 * cada um (50 ms cada): com 1.083 pedidos, 39 s por consulta, medido em
 * produção — e isso é o que travou o site no pico.
 *
 * Pedidos ANTIGOS (feitos antes da chave existir) não têm `telefone_chave` e
 * o telefone deles só existe como scrypt com salt — não dá para calcular a
 * chave deles por fora. Para esses, a pessoa informa também o NOME usado no
 * pedido: filtra-se pelo nome (poucos candidatos) e só neles roda o scrypt.
 * Ao casar, a chave é gravada no pedido (reindexação preguiçosa) e a próxima
 * consulta já sai pelo caminho rápido. Resposta `precisaNome: true` avisa a
 * página para pedir o nome quando o telefone sozinho não achou nada.
 *
 * Um pedido é um "carrinho": um valor pago só (`camiseta_pedidos.valor_pago`)
 * cobre várias linhas de item (tamanho+modelo+quantidade). Não existe
 * pagamento por item — a alocação de quanto de cada item já está "pago" é
 * calculada aqui, em ordem de criação dos itens (o primeiro item cadastrado
 * consome pagamento primeiro), pra decidir quantas peças de cada linha já
 * podem ser retiradas.
 *
 * Preço por peça pode variar por tamanho (`camiseta_grupos.precos_tamanho`,
 * opcional) — tamanho sem entrada aí usa `valor_venda` como padrão (ou é
 * grátis, se nem isso estiver definido). Por isso a alocação caminha em
 * dinheiro (não mais em "peças equivalentes"), consumindo o valor pago pelo
 * preço de cada item conforme anda pela lista.
 */
const CAMPOS_PEDIDO =
  "id,nome,telefone,valor_pago,avulso,separado,separado_em,aviso_retirada_em,date_created,lote.numero,lote.status,lote.fechado_em,grupo.nome,grupo.valor_venda,grupo.precos_tamanho,grupo.retirada_local,grupo.email_retirada_corpo,grupo.retirada_liberada";
const MAX_CANDIDATOS_ANTIGOS = 12;

function precoTamanho(grupo, tamanho) {
  const precos = grupo?.precos_tamanho || {};
  if (tamanho && precos[tamanho] != null && precos[tamanho] !== "") return Number(precos[tamanho]);
  return grupo?.valor_venda != null ? Number(grupo.valor_venda) : 0;
}

function alocarPagamento(itens, valorPago, grupo) {
  let restante = Number(valorPago) || 0;
  return itens.map((item) => {
    const preco = precoTamanho(grupo, item.tamanho);
    if (preco <= 0) return { ...item, quantidadePaga: item.quantidade };
    const quantidadePaga = Math.max(0, Math.min(item.quantidade, Math.floor(restante / preco)));
    restante -= quantidadePaga * preco;
    return { ...item, quantidadePaga };
  });
}

async function buscar(headers, consulta) {
  // O Directus (plano B1) devolve 5xx de vez em quando sob rajada: até 3 tentativas, com pausa.
  let res;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    res = await fetch(`${DIRECTUS_URL}/items/camiseta_pedidos?${consulta}`, { headers });
    if (res.status < 500) break;
    await new Promise((r) => setTimeout(r, 400 * tentativa));
  }
  if (!res.ok) throw new Error(`falha ao buscar pedidos (${res.status})`);
  return (await res.json()).data || [];
}

/** Caminho rápido: igualdade na chave indexada. */
async function pelaChave(headers, chave) {
  return buscar(headers, `filter[telefone_chave][_eq]=${encodeURIComponent(chave)}&fields=${CAMPOS_PEDIDO}&sort=-id&limit=50`);
}

/** Existe algum pedido antigo (sem chave) no site? Um registro basta para saber. */
async function existemAntigos(headers) {
  const rows = await buscar(headers, "filter[telefone_chave][_null]=true&fields=id&limit=1");
  return rows.length > 0;
}

/** Caminho antigo: candidatos pelo nome, scrypt só neles, e grava a chave nos que casarem. */
async function pelosAntigosComNome(headers, telefone, nome, chave, log) {
  const termo = normalizarNome(nome);
  if (termo.length < 3) return [];

  // 1ª tentativa no próprio Directus (ILIKE), com o texto como veio; 2ª, se nada veio,
  // sem acento dos dois lados, em memória (só nome e id — leve).
  let candidatos = await buscar(
    headers,
    `filter[telefone_chave][_null]=true&filter[nome][_icontains]=${encodeURIComponent(String(nome).trim())}&fields=${CAMPOS_PEDIDO}&limit=${MAX_CANDIDATOS_ANTIGOS}`,
  );
  if (candidatos.length === 0) {
    const todos = await buscar(headers, "filter[telefone_chave][_null]=true&fields=id,nome&limit=-1");
    const ids = todos.filter((p) => normalizarNome(p.nome).includes(termo)).slice(0, MAX_CANDIDATOS_ANTIGOS).map((p) => p.id);
    if (ids.length > 0) candidatos = await buscar(headers, `filter[id][_in]=${ids.join(",")}&fields=${CAMPOS_PEDIDO}&limit=${MAX_CANDIDATOS_ANTIGOS}`);
  }

  const meus = candidatos.filter((p) => conferirHash(telefone, p.telefone));
  // Reindexação preguiçosa: grava a chave de busca E o telefone cifrado (este é o único momento em
  // que um pedido antigo tem o número em mãos, conferido pelo scrypt) — a partir daqui o painel
  // consegue chamar essa pessoa no WhatsApp.
  const cifrado = cifrarTelefone(telefone);
  await Promise.all(
    meus.map((p) =>
      fetch(`${DIRECTUS_URL}/items/camiseta_pedidos/${p.id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(cifrado ? { telefone_chave: chave, telefone_cifrado: cifrado } : { telefone_chave: chave }),
      }).catch((err) => log && log(`reindexação do pedido ${p.id} falhou: ${err}`)),
    ),
  );
  return meus;
}

module.exports = async function (context, req) {
  if (!permitir(`camiseta:${ipDoPedido(req)}`)) {
    context.res = { status: 429, body: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    return;
  }

  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN || !process.env.TELEFONE_CHAVE_SEGREDO) {
    context.log.error("DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN/TELEFONE_CHAVE_SEGREDO não configurados nas Application Settings.");
    context.res = { status: 500, body: { erro: "Configuração ausente." } };
    return;
  }

  const body = req.body || {};
  const telefone = String(body.telefone || "");
  const nome = body.nome ? String(body.nome).slice(0, 120) : "";
  const chave = chaveTelefone(telefone);
  if (!chave) {
    context.res = { status: 400, body: { erro: "Telefone ausente ou inválido (mínimo 8 dígitos)." } };
    return;
  }

  const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` };

  let meusPedidos;
  let precisaNome = false;
  try {
    meusPedidos = await pelaChave(headers, chave);
    if (meusPedidos.length === 0 && (await existemAntigos(headers))) {
      if (nome) meusPedidos = await pelosAntigosComNome(headers, telefone, nome, chave, (m) => context.log.warn(m));
      else precisaNome = true;
    }
  } catch (err) {
    context.log.error("Falha ao buscar pedidos no Directus:", err);
    context.res = { status: 502, body: { erro: "Falha ao consultar pedidos." } };
    return;
  }

  if (meusPedidos.length === 0) {
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { pedidos: [], precisaNome } };
    return;
  }

  const idsPedidos = meusPedidos.map((p) => p.id).join(",");
  const itensRes = await fetch(
    `${DIRECTUS_URL}/items/camiseta_itens_pedido?filter[pedido][_in]=${idsPedidos}&fields=id,pedido,tamanho,modelo,quantidade,quantidade_retirada&sort=id&limit=-1`,
    { headers },
  );
  const todosItens = itensRes.ok ? (await itensRes.json()).data || [] : [];

  const resultado = meusPedidos.map((p) => {
    const itensDoPedido = todosItens.filter((i) => i.pedido === p.id);
    const itensComAlocacao = alocarPagamento(itensDoPedido, Number(p.valor_pago ?? 0), p.grupo);
    const valorTotal = itensDoPedido.reduce((s, i) => s + i.quantidade * precoTamanho(p.grupo, i.tamanho), 0);

    return {
      lote: p.grupo?.nome ?? null,
      nome: p.nome ?? null,
      // Andamento (06/10/2026, pedido do responsável): a maioria dos pedidos não tem e-mail,
      // então a página é onde a pessoa acompanha — quando pediu, se o lote já foi encomendado
      // (lote fechado = pedido feito à malharia), se já chegou (separado) e se já retirou.
      criadoEm: p.date_created ?? null,
      loteNumero: p.lote?.numero ?? null,
      loteStatus: p.lote?.status ?? null,
      loteFechadoEm: p.lote?.fechado_em ?? null,
      valorTotal,
      valorPago: p.valor_pago,
      separado: Boolean(p.separado),
      separadoEm: p.separado_em ?? null,
      // Onde e como retirar: o mesmo texto que vai no e-mail de "pode retirar" — mas
      // 1 em cada 4 pedidos de 06/10/2026 não tinha e-mail, então a página precisa
      // mostrar isto também (pedido explícito do responsável).
      retiradaLocal: p.grupo?.retirada_local ?? null,
      // 08/10/2026 — "as camisetas chegaram" vale para o grupo inteiro (retirada_liberada): a mensagem aparece mesmo
      // antes de separar (separar no balcão é o de menos) e também para quem não tem e-mail.
      retiradaLiberada: Boolean(p.grupo?.retirada_liberada),
      avisoRetiradaEm: p.aviso_retirada_em ?? null,
      mensagemRetirada: p.separado || p.grupo?.retirada_liberada ? p.grupo?.email_retirada_corpo ?? null : null,
      itens: itensComAlocacao.map((i) => ({
        tamanho: i.tamanho,
        modelo: i.modelo,
        quantidade: i.quantidade,
        valorUnitario: precoTamanho(p.grupo, i.tamanho),
        quantidadePaga: i.quantidadePaga,
        quantidadeRetirada: i.quantidade_retirada,
      })),
    };
  });

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { pedidos: resultado } };
};
