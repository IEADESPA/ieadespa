const { app } = require("@azure/functions");
const { conferirHash } = require("../lib/telefone");
const { permitir, ipDoPedido } = require("../lib/rateLimit");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

/*
 * Ferramenta de exercício de direito de exclusão (LGPD, Art. 18) — achado
 * real: o telefone só existe como hash (scrypt, salt aleatório por linha),
 * então nem a equipe nem o próprio sistema conseguem "procurar" por um
 * telefone com um filtro comum do Directus. Isso não torna a exclusão
 * impossível: o mesmo truque já usado em `verificarInscricao.js`/
 * `cancelarInscricao.js` (conferir o telefone digitado contra cada hash
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

app.http("buscar-dados-pessoais", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "buscar-dados-pessoais",
  handler: async (request, context) => {
    if (!permitir(`lgpd-buscar:${ipDoPedido(request)}`)) {
      return { status: 429, jsonBody: { erro: "Muitas tentativas. Aguarde alguns minutos." } };
    }

    if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
      context.error("Configuração ausente (DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN).");
      return { status: 500, jsonBody: { erro: "Configuração ausente." } };
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { erro: "Corpo inválido." } };
    }

    if (!(await exigirStaff(body?.staffToken))) {
      return { status: 401, jsonBody: { erro: "Sessão de equipe inválida — entre de novo no painel." } };
    }

    const telefone = String(body?.telefone || "");
    if (!telefone) {
      return { status: 400, jsonBody: { erro: "Telefone ausente." } };
    }

    const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` };

    const [inscricoesRes, pedidosRes] = await Promise.all([
      fetch(`${DIRECTUS_URL}/items/inscricoes_eventos?fields=id,nome,telefone,codigo,evento.title&limit=-1`, { headers }),
      fetch(`${DIRECTUS_URL}/items/camiseta_pedidos?fields=id,nome,telefone,grupo.nome&limit=-1`, { headers }),
    ]);

    const inscricoesTodas = inscricoesRes.ok ? (await inscricoesRes.json()).data || [] : [];
    const pedidosTodos = pedidosRes.ok ? (await pedidosRes.json()).data || [] : [];

    const inscricoes = inscricoesTodas
      .filter((i) => conferirHash(telefone, i.telefone))
      .map((i) => ({ id: i.id, nome: i.nome, codigo: i.codigo, eventoTitulo: i.evento?.title ?? null }));

    const pedidos = pedidosTodos
      .filter((p) => conferirHash(telefone, p.telefone))
      .map((p) => ({ id: p.id, nome: p.nome, grupoNome: p.grupo?.nome ?? null }));

    return { jsonBody: { inscricoes, pedidos } };
  },
});
