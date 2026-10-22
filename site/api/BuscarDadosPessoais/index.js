const { conferirHash } = require("../src/lib/telefone");
const { permitir, ipDoPedido } = require("../src/lib/rateLimit");
const { avisoDoRegistro } = require("../src/lib/pagamentoInformado");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

/*
 * Ferramenta de exercício de direito de exclusão (LGPD, Art. 18) — achado
 * real: o telefone só existe como hash (scrypt, salt aleatório por linha),
 * então nem a equipe nem o próprio sistema conseguem "procurar" por um
 * telefone com um filtro comum do Directus. Isso não torna a exclusão
 * impossível: o mesmo truque já usado em `VerificarInscricao`/
 * `CancelarInscricao` (conferir o telefone digitado contra cada hash
 * guardado, com `conferirHash`) encontra todos os registros de uma pessoa
 * sem nunca precisar reverter o hash.
 *
 * Só a equipe autenticada usa isso (nunca público/self-service) — o pedido
 * de exclusão chega pelo canal já existente (`/contato/?assunto=lgpd`), a
 * equipe confirma a identidade por fora e só então usa esta tela pra
 * localizar e apagar. `staffToken` é o próprio token de sessão do Directus
 * que o painel já usa (conferido aqui contra `/users/me`) — não existe
 * autenticação nova, só reaproveita a que já existe.
 */
async function exigirStaff(staffToken) {
  if (!staffToken) return false;
  const res = await fetch(`${DIRECTUS_URL}/users/me`, { headers: { Authorization: `Bearer ${staffToken}` } });
  return res.ok;
}

module.exports = async function (context, req) {
  if (!permitir(`lgpd-buscar:${ipDoPedido(req)}`)) {
    context.res = { status: 429, body: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    return;
  }

  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
    context.log.error("Configuração ausente (DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN).");
    context.res = { status: 500, body: { erro: "Configuração ausente." } };
    return;
  }

  const body = req.body || {};

  if (!(await exigirStaff(body.staffToken))) {
    context.res = { status: 401, body: { erro: "Sessão de equipe inválida — entre de novo no painel." } };
    return;
  }

  const telefone = String(body.telefone || "");
  if (!telefone) {
    context.res = { status: 400, body: { erro: "Telefone ausente." } };
    return;
  }

  const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` };

  const [inscricoesRes, pedidosRes] = await Promise.all([
    fetch(`${DIRECTUS_URL}/items/inscricoes_eventos?fields=id,nome,telefone,codigo,evento.title&limit=-1`, { headers }),
    fetch(`${DIRECTUS_URL}/items/camiseta_pedidos?fields=id,nome,telefone,grupo.nome&limit=-1`, { headers }),
  ]);

  const inscricoesTodas = inscricoesRes.ok ? (await inscricoesRes.json()).data || [] : [];
  const pedidosTodos = pedidosRes.ok ? (await pedidosRes.json()).data || [] : [];

  const inscricoesBase = inscricoesTodas.filter((i) => conferirHash(telefone, i.telefone));
  const pedidosBase = pedidosTodos.filter((p) => conferirHash(telefone, p.telefone));

  // v7.13 (revisão de 22/10/2026, LGPD): o pedido de acesso/exclusão mostra também os dados novos — o pagamento informado, o tipo de participante, a
  // cortesia e as entradas do credenciamento. Leitura à parte com `fields=*` (num Directus sem os campos novos, nada quebra).
  const porId = async (caminho) => {
    const r = await fetch(`${DIRECTUS_URL}${caminho}`, { headers }).catch(() => null);
    return r && r.ok ? (await r.json()).data || [] : [];
  };
  const idsInscricoes = inscricoesBase.map((i) => i.id).join(",");
  const idsPedidos = pedidosBase.map((p) => p.id).join(",");
  const [detalhesInscricoes, entradas, detalhesPedidos] = await Promise.all([
    idsInscricoes ? porId(`/items/inscricoes_eventos?filter[id][_in]=${idsInscricoes}&fields=*&limit=-1`) : [],
    idsInscricoes ? porId(`/items/evento_entradas?filter[inscricao][_in]=${idsInscricoes}&fields=inscricao,local,entrou_em,date_created&sort=id&limit=-1`) : [],
    idsPedidos ? porId(`/items/camiseta_pedidos?filter[id][_in]=${idsPedidos}&fields=*&limit=-1`) : [],
  ]);
  const detalheInscricao = new Map(detalhesInscricoes.map((d) => [d.id, d]));
  const detalhePedido = new Map(detalhesPedidos.map((d) => [d.id, d]));

  const inscricoes = inscricoesBase.map((i) => {
    const d = detalheInscricao.get(i.id) || {};
    return {
      id: i.id, nome: i.nome, codigo: i.codigo, eventoTitulo: i.evento?.title ?? null,
      lote: d.faixa_rotulo ?? null,
      tipoParticipante: d.tipo_participante ?? null,
      cortesia: d.cortesia === true ? { motivo: d.cortesia_motivo ?? null, autorizadaPor: d.cortesia_autorizada_por ?? null } : null,
      pagamentoInformado: avisoDoRegistro(d),
      entradas: entradas.filter((e) => e.inscricao === i.id).map((e) => ({ local: e.local ?? null, em: e.entrou_em || e.date_created || null })),
    };
  });

  const pedidos = pedidosBase.map((p) => ({ id: p.id, nome: p.nome, grupoNome: p.grupo?.nome ?? null, pagamentoInformado: avisoDoRegistro(detalhePedido.get(p.id) || {}) }));

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { inscricoes, pedidos } };
};
