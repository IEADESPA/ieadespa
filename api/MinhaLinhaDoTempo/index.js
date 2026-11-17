// MinhaLinhaDoTempo (FASE 10, v10.1b passo 2, 17/11/2026) — a PRÓPRIA pessoa vê a sua linha do tempo por inteiro (Minha vida na igreja: "a linha do tempo
// primeiro", desenho aprovado na rodada 10).
// GET /api/minha-linha-do-tempo/{matricula}?pagina=1&porPagina=50
// Só a matrícula da própria sessão (auth.exigirTitular, como Meus Dados). Disciplina e abandono NÃO entram aqui: a pessoa vê o processo dela pelo próprio
// processo (o que ele já lhe mostra), não por esta rota — a linha do tempo não acrescenta nada sobre isso. A regra é a mesma da ficha (shared/linhaDoTempo.js).
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const linha = require("../shared/linhaDoTempo");

module.exports = async function (context, req) {
  const matricula = context.bindingData && context.bindingData.matricula;
  const usuario = auth.exigirTitular(req, context, matricula);
  if (!usuario) return;

  const pool = await getPool();
  const membroId = Number(usuario.membroId);
  const fontes = await linha.lerFontes(pool, sql, membroId, { disciplina: false });
  if (!fontes.membro) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
    return;
  }
  const { vidaEspiritual, eventos } = linha.montarLinhaDoTempo(fontes, { disciplina: false });
  const pagina = linha.paginar(eventos, (req && req.query) || {});
  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: { sucesso: true, nome: fontes.membro.Nome, vidaEspiritual, eventos: pagina.itens, total: pagina.total, pagina: pagina.pagina, porPagina: pagina.porPagina }
  };
};
