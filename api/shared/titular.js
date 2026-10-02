// shared/titular.js (fecho da v7.5) — autoatendimento que a Secretaria também usa em nome da pessoa.
// Quase toda rota "meus dados" é só do titular (auth.exigirTitular). Poucas — consentimento LGPD e o PDF da carta — são também usadas pela Secretaria na
// ficha da pessoa. Aqui: o titular passa; quem não é o titular passa SÓ com a permissão certa E com a congregação da pessoa dentro do seu escopo. Toda recusa
// tem a mesma resposta (403), exista ou não a matrícula.
const auth = require("./auth");
const { sql } = require("./db");

const NEGADO = { sucesso: false, mensagem: "Você só pode acessar os seus próprios dados." };

async function exigirTitularOuPermissao(req, context, pool, matriculaDaRota, permissao) {
  const usuario = auth.exigirLoginIgnorandoTermos(req, context);
  if (!usuario) return null;
  const alvo = auth.idDeRota(matriculaDaRota);
  if (!alvo) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Matrícula inválida." } };
    return null;
  }
  if (Number(usuario.membroId) === alvo) return { usuario, alvo, proprio: true };

  // Terceiro: precisa ter assinado os termos de quem acessa dado alheio, ter a permissão e alcançar a congregação da pessoa.
  if (usuario.termosPendentes && usuario.termosPendentes.length > 0) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Assine os termos pendentes para continuar.", termosPendentes: usuario.termosPendentes } };
    return null;
  }
  if (!usuario.permissoes || !usuario.permissoes.includes(permissao)) {
    context.res = { status: 403, body: NEGADO };
    return null;
  }
  const r = (await pool.request().input("id", sql.Int, alvo)
    .query(`SELECT c.Nome AS CongregacaoNome FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @id`)).recordset[0];
  if (!r || !auth.estaNoEscopo(usuario, r.CongregacaoNome)) {
    context.res = { status: 403, body: NEGADO };
    return null;
  }
  return { usuario, alvo, proprio: false };
}

module.exports = { exigirTitularOuPermissao, NEGADO };
