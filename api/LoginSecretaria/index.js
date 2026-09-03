// LoginSecretaria
// Só quem tem registro em Lideranca (Dirigente, Pastor de Área etc.) consegue
// logar no painel da Secretaria. Ver api/shared/auth.js.
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { resolverEscopoCongregacoes, resolverNomeExtensao } = require("../shared/escopo");

module.exports = async function (context, req) {
  const { matricula, senha } = req.body || {};

  if (!matricula || !senha) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe matrícula e senha." } };
    return;
  }

  const pool = await getPool();
  const result = await pool.request().input("mat", sql.Int, matricula).query(`
    SELECT l.MembroId AS membroId, l.EscopoTipo AS escopoTipo, l.EscopoId AS escopoId, l.SenhaHash AS senhaHash,
           p.Nome AS papelNome, p.Nivel AS papelNivel, p.Permissoes AS permissoesStr, m.Nome AS nome
    FROM Lideranca l
    JOIN Papeis p ON p.PapelId = l.PapelId
    JOIN MembroReferencia m ON m.MembroId = l.MembroId
    WHERE l.MembroId = @mat
  `);
  const lideranca = result.recordset[0];
  if (!lideranca) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula sem acesso à Secretaria." } };
    return;
  }
  if (!auth.verificarSenha(senha, lideranca.senhaHash)) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Senha incorreta." } };
    return;
  }

  const escopo = await resolverEscopoCongregacoes(pool, lideranca.escopoTipo, lideranca.escopoId);
  const escopoExtensaoNome = await resolverNomeExtensao(pool, lideranca.escopoTipo, lideranca.escopoId);
  const permissoes = lideranca.permissoesStr ? lideranca.permissoesStr.split(",").map(p => p.trim()).filter(Boolean) : [];

  const token = auth.criarSessao({
    membroId: lideranca.membroId,
    nome: lideranca.nome,
    tipo: lideranca.papelNome,
    nivel: lideranca.papelNivel,
    escopoCongregacoes: escopo,
    escopoExtensaoNome,
    permissoes
  });

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: {
      sucesso: true,
      token,
      nome: lideranca.nome,
      tipo: lideranca.papelNome,
      nivel: lideranca.papelNivel,
      escopo,
      permissoes
    }
  };
};
