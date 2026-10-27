// shared/politicasRetencao.js (Trava 7-C) — o prazo de uma política de retenção (Proteção de Dados → Políticas de retenção), com o padrão quando a política foi
// desativada, apagada ou tem um número inválido. O Encarregado ajusta o prazo na tela; a rotina diária lê aqui. (Mesmo molde do diasDeRetencao da v7.11, v7.12 e v7.15.)
const { sql } = require("./db");

async function diasDaPolitica(pool, categoria, padrao) {
  const linha = (await pool.request().input("c", sql.NVarChar(60), categoria)
    .query(`SELECT TOP 1 DiasRetencao FROM PoliticasRetencao WHERE Categoria = @c AND Ativo = 1`)).recordset[0];
  const n = linha ? Number(linha.DiasRetencao) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : padrao;
}

module.exports = { diasDaPolitica };
