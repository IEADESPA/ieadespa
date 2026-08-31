// LoginSecretaria
// Só quem tem registro em Lideranca (Dirigente, Pastor de Área etc.) consegue
// logar no painel da Secretaria. Ver api/shared/auth.js.
const auth = require("../shared/auth");
const mockDb = require("../shared/mockDb");

module.exports = async function (context, req) {
  const { matricula, senha } = req.body || {};

  if (!matricula || !senha) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe matrícula e senha." } };
    return;
  }

  // ---- Versão real com Azure SQL ----
  // const sql = require("mssql");
  // const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
  // const result = await pool.request().input("mat", sql.Int, matricula).query(`
  //   SELECT l.LiderancaId, l.MembroId, l.Tipo, l.Escopo, l.SenhaHash, m.Nome
  //   FROM Lideranca l JOIN MembroReferencia m ON m.MembroId = l.MembroId
  //   WHERE l.MembroId = @mat
  // `);
  // if (result.recordset.length === 0) { ... "Matrícula sem acesso à Secretaria." }
  // if (!auth.verificarSenha(senha, result.recordset[0].SenhaHash)) { ... "Senha incorreta." }

  const lideranca = mockDb.getLideranca(matricula);
  if (!lideranca) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula sem acesso à Secretaria." } };
    return;
  }
  if (!auth.verificarSenha(senha, lideranca.senhaHash)) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Senha incorreta." } };
    return;
  }

  const membro = mockDb.getMembro(lideranca.membroId);
  const token = auth.criarSessao({
    membroId: lideranca.membroId,
    nome: membro ? membro.nome : "(desconhecido)",
    tipo: lideranca.tipo,
    escopoCongregacoes: lideranca.escopo,
    permissoes: lideranca.permissoes || []
  });

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: {
      sucesso: true,
      token,
      nome: membro ? membro.nome : null,
      tipo: lideranca.tipo,
      escopo: lideranca.escopo,
      permissoes: lideranca.permissoes || []
    }
  };
};
