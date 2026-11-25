// shared/nivelDoCargo.js — qual secretaria muda a situação no rol de quem tem cargo de liderança.
// Regra do responsável (25/11/2026): mudar a situação no rol (INATIVO, AFASTADO, LICENÇA, DESLIGADO, FALECIDO) ou desligar quem tem cargo é da secretaria do
// NÍVEL DAQUELE CARGO ou de cima: o cargo local, a secretaria local, a da área e a Geral; o de área, a da área e a Geral; o geral, só a Geral. Com mais de um
// cargo, vale o mais alto. "Nível" é o alcance do cargo (Lideranca.EscopoTipo); a secretaria passa quando uma concessão dela com "pessoas" tem nível de papel
// igual ou acima E cobre todas as congregações do cargo (a Extensão só cobre a própria Extensão).
const auth = require("./auth");
const { resolverEscopoCongregacoes, resolverNomeExtensao } = require("./escopo");

const ORDEM_DO_ESCOPO = { EXTENSAO: 0, CONGREGACAO: 1, AREA: 2, REGIAO: 3, QUADRANTE: 4, DISTRITO: 5 };   // GLOBAL, DEPARTAMENTO e sem tipo: 6 (o geral)
const ORDEM_DO_NIVEL = { EXTENSAO: 0, CONGREGACAO: 1, AREA: 2, REGIAO: 3, QUADRANTE: 4, DISTRITO: 5, GLOBAL: 6 };
const GERAL = 6;
const ordemDoCargo = (tipo) => (Object.prototype.hasOwnProperty.call(ORDEM_DO_ESCOPO, tipo) ? ORDEM_DO_ESCOPO[tipo] : GERAL);
const ordemDoNivel = (nivel) => (Object.prototype.hasOwnProperty.call(ORDEM_DO_NIVEL, nivel) ? ORDEM_DO_NIVEL[nivel] : -1);

// Os cargos de liderança vigentes da pessoa (dia de Brasília). `executor`: o pool ou a transação de quem chama.
async function cargosVigentes(executor, sql, membroId, hoje) {
  const r = await executor.request().input("id", sql.Int, membroId).input("hoje", sql.Date, hoje)
    .query(`SELECT l.EscopoTipo, l.EscopoId FROM Lideranca l WHERE l.MembroId = @id AND (l.AtivoAte IS NULL OR l.AtivoAte >= @hoje)`);
  return (r.recordset || []).map((l) => ({ tipo: l.EscopoTipo || null, id: l.EscopoId == null ? null : Number(l.EscopoId) }));
}

// A concessão alcança o cargo: nível de papel igual ou acima, e todas as congregações do cargo no escopo dela. O cargo que vale para a igreja inteira (ou cujo
// escopo não resolve para nenhuma congregação) só a concessão do nível geral alcança.
function concessaoAlcanca(c, ordem, congregacoes, extensaoNome) {
  if (!c || ordemDoNivel(c.nivel) < ordem) return false;
  if (congregacoes === "TODAS" || !Array.isArray(congregacoes) || congregacoes.length === 0) return c.nivel === "GLOBAL" && c.escopoCongregacoes === "TODAS";
  return congregacoes.every((nome) => auth.estaNoEscopo(c, nome) && (!c.escopoExtensaoNome || extensaoNome === c.escopoExtensaoNome));
}

// true quando a visão de quem pede alcança todos os cargos vigentes da pessoa (sem cargo: true).
async function alcancaOsCargos(pool, sql, usuario, membroId, hoje) {
  const cargos = await cargosVigentes(pool, sql, membroId, hoje);
  if (cargos.length === 0) return true;
  // Só a concessão com "pessoas" conta, mesmo que quem chama passe a sessão inteira em vez da visão da permissão.
  const concessoes = auth.concessoesDaVisao(usuario).filter((c) => Array.isArray(c.permissoes) && c.permissoes.includes("pessoas"));
  for (const cargo of cargos) {
    const ordem = ordemDoCargo(cargo.tipo);
    const congregacoes = ordem === GERAL ? "TODAS" : await resolverEscopoCongregacoes(pool, cargo.tipo, cargo.id);
    const extensaoNome = cargo.tipo === "EXTENSAO" ? await resolverNomeExtensao(pool, cargo.tipo, cargo.id) : null;
    if (!concessoes.some((c) => concessaoAlcanca(c, ordem, congregacoes, extensaoNome))) return false;
  }
  return true;
}

const MENSAGEM_NIVEL = "Esta pessoa tem cargo de liderança de nível acima do seu: só a secretaria do nível do cargo (ou de cima) muda a situação dela no rol.";

module.exports = { cargosVigentes, concessaoAlcanca, alcancaOsCargos, ordemDoCargo, MENSAGEM_NIVEL };
