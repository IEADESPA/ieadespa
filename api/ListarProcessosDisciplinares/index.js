// ListarProcessosDisciplinares
// v3.2 (núcleo desde v0.2). Exige a permissão "disciplina" — quem não tem essa
// permissão não vê processos disciplinares em lugar nenhum (diferente do
// mascaramento parcial usado em GestaoPessoas, aqui é a tela inteira).
// GET /api/processos-disciplinares?status=&membroId=&incluirEncerrados=1
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { SELECT_PROCESSO_BASE, anexarInfracoesEPrazo, redigirSeSigiloso } = require("../shared/disciplinar");

function situacaoEfetiva(p, hoje) {
  if (p.status === "AFASTAMENTO_CAUTELAR") return "AFASTAMENTO_CAUTELAR";
  if (p.status === "EM_ANDAMENTO") return "EM_ANDAMENTO";
  if (p.status === "EM_RECURSO") return "EM_RECURSO";
  if (p.resultado === "ARQUIVADO") return "ARQUIVADO";
  if (p.resultado === "EXCLUSAO") return "EXCLUIDO";
  if (p.resultado === "SANCAO") {
    if (!p.dataTerminoPrevisao) return "PRAZO_INDETERMINADO";
    return p.dataTerminoPrevisao >= hoje ? "CUMPRINDO_SANCAO" : "CUMPRIDO";
  }
  return p.status;
}

const SITUACOES_ATIVAS = ["EM_ANDAMENTO", "AFASTAMENTO_CAUTELAR", "EM_RECURSO", "EXCLUIDO", "PRAZO_INDETERMINADO", "CUMPRINDO_SANCAO"];

function diasRestantes(p, hoje) {
  if (!p.dataTerminoPrevisao) return null;
  const diffMs = new Date(p.dataTerminoPrevisao).getTime() - new Date(hoje).getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "disciplina");
  if (!usuario) return;

  const { status, membroId, incluirEncerrados } = req.query || {};
  const pool = await getPool();
  const request = pool.request();
  const condicoes = [];
  if (status) { request.input("status", sql.NVarChar(30), status); condicoes.push("p.Status = @status"); }
  if (membroId) { request.input("membroId", sql.Int, membroId); condicoes.push("p.MembroId = @membroId"); }
  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";

  const result = await request.query(`${SELECT_PROCESSO_BASE} ${where} ORDER BY p.DataAbertura DESC`);

  const hoje = new Date().toISOString().slice(0, 10);
  let processos = result.recordset.map(p => Object.assign({}, p, {
    situacaoEfetiva: situacaoEfetiva(p, hoje),
    diasRestantes: diasRestantes(p, hoje)
  }));
  processos = await anexarInfracoesEPrazo(pool, sql, processos);
  processos = redigirSeSigiloso(processos, usuario);

  if (!incluirEncerrados) {
    processos = processos.filter(p => SITUACOES_ATIVAS.includes(p.situacaoEfetiva));
  }

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: processos };
};
