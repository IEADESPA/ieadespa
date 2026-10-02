// RelatorioImunidadeTributaria (v4.20 — Painel de Imunidade Tributária)
// Semáforo dos 3 requisitos do CTN Art. 14 (CF Art. 150, VI, "b"), alerta de
// conflito de interesses e carga tributária embutida (LC 214/2025). Tudo
// CALCULADO NA LEITURA (shared/imunidade.js).
// GET /api/imunidade-tributaria
const { exigirGeral } = require("../shared/escopoRotas");
const { getPool, sql } = require("../shared/db");
const imunidade = require("../shared/imunidade");

module.exports = async function (context, req) {
  // Matéria da Tesouraria Geral (consolidado da denominação, com CPF de ministros): só o nível GERAL — papel Global E escopo de todas as congregações.
  const usuario = exigirGeral(req, context, "financeiro");
  if (!usuario) return;
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
