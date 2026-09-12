// RelatorioImunidadeTributaria (v4.20 — Painel de Imunidade Tributária)
// Semáforo dos 3 requisitos do CTN Art. 14 (CF Art. 150, VI, "b"), alerta de
// conflito de interesses e carga tributária embutida (LC 214/2025). Tudo
// CALCULADO NA LEITURA (shared/imunidade.js).
// GET /api/imunidade-tributaria
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const imunidade = require("../shared/imunidade");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Painel de Imunidade Tributária é matéria da Tesouraria Geral — restrito a nível Global." } };
    return;
  }
  const pool = await getPool();
  const ano = new Date().getFullYear();

  const semaforo = await imunidade.calcularSemaforo(pool, sql);
  const conflitos = await imunidade.conflitosInteresse(pool, sql);
  const carga = await imunidade.cargaTributaria(pool, sql, ano);

  context.res = {
    status: 200, headers: { "Content-Type": "application/json" },
    body: { semaforo, conflitosInteresse: conflitos, cargaTributaria: carga }
  };
};
