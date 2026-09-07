// AbrirProcessoDisciplinar
// v3.2 — abre um processo vinculado a um membro, citando 1+ infrações do
// catálogo estruturado `TiposInfracao` (Art. 96-99); `motivo` agora é só o
// detalhamento complementar em texto livre do caso, não mais o único campo.
// v3.6 — órgão responsável pode ser um dos 5 órgãos centrais OU uma JAI/JEA/TER
// territorial (escada disciplinar, `shared/disciplinar.js::validarOrgaoProcesso`).
// v3.7 — a criação em si foi extraída pra `shared/disciplinar.js::criarProcessoDisciplinar`,
// reaproveitada também pela Ouvidoria (ENCAMINHAR_PROCESSO).
// Exige a permissão "disciplina" (já cadastrada em Funcionalidades desde a
// migração 002).
// POST /api/processos-disciplinares -> body: { membroId, orgaoResponsavelId?, orgaoLocalId?, infracoesIds: number[], motivo?, dataAbertura?, sigiloso? }
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { validarOrgaoProcesso, criarProcessoDisciplinar } = require("../shared/disciplinar");
const { membroAutorizadoNoOrgaoLocal } = require("../shared/escopo");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "disciplina");
  if (!usuario) return;

  const { orgaoResponsavelId, orgaoLocalId } = req.body || {};

  const pool = await getPool();

  // v3.6.2 — só quem é membro daquele órgão territorial (Lideranca Papel+
  // Escopo, ou GLOBAL) pode abrir processo nele. Checagem feita aqui (antes
  // de delegar a criação em si) porque depende de QUEM está chamando, não
  // só dos dados do processo.
  if (orgaoResponsavelId || orgaoLocalId) {
    const orgao = await validarOrgaoProcesso(pool, sql, { orgaoResponsavelId, orgaoLocalId });
    if (!orgao.valido) {
      context.res = { status: 200, body: { sucesso: false, mensagem: orgao.mensagem } };
      return;
    }
    if (orgao.orgaoLocalId && !(await membroAutorizadoNoOrgaoLocal(pool, sql, usuario.membroId, orgao.orgaoLocalId))) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Você não tem vínculo com este órgão territorial." } };
      return;
    }
  }

  const resultado = await criarProcessoDisciplinar(pool, sql, req.body || {}, usuario.membroId);
  context.res = {
    status: resultado.sucesso ? 201 : 200,
    headers: { "Content-Type": "application/json" },
    body: resultado
  };
};
