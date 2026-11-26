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
  const { vidaEspiritual, eventos: todos } = linha.montarLinhaDoTempo(fontes, { disciplina: false });
  // volta 10 do Membros (menor 8 do portão v9): quem está em arrolamento (a ficha a completar) não vê "membro desde" nem a entrada no rol: a data veio do sistema
  // pago, com sentido desconhecido, e a carteirinha já não a mostra. A ficha da secretaria (LinhaDoTempoMembro) continua com ela, para completar.
  const emArrolamento = fontes.membro.SituacaoMembro === "ARROLAMENTO";
  const eventos = emArrolamento ? todos.filter((e) => e.tipo !== "ADMISSAO" && e.tipo !== "READMISSAO") : todos;
  const pagina = linha.paginar(eventos, (req && req.query) || {});
  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    // FASE 10 (19/11/2026): o cabeçalho da Minha vida (a congregação, a situação e o "membro desde" da própria pessoa)
    body: { sucesso: true, nome: fontes.membro.Nome, situacao: fontes.membro.SituacaoMembro || null, status: fontes.membro.Status || null,
      congregacao: fontes.membro.CongregacaoNome || null, dataAdmissao: emArrolamento ? null : (fontes.membro.DataAdmissao || null),
      vidaEspiritual, eventos: pagina.itens, total: pagina.total, pagina: pagina.pagina, porPagina: pagina.porPagina }
  };
};
