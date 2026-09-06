// GestaoTermos (v2.7)
// GET  /api/termos       -> catálogo completo (título, versão, texto) de todos os termos
// POST /api/termos/{tipo} -> assina o termo {tipo} pra quem está logado; devolve
//                            um token novo já sem esse pendente (o front troca
//                            o token guardado com esse valor).
// Usa exigirLoginIgnorandoTermos (não exigirLogin) de propósito: esta é a
// única rota que precisa continuar acessível mesmo com termos pendentes —
// senão ninguém conseguiria assinar o que está bloqueando o próprio acesso.
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { TERMOS, termosPendentes } = require("../shared/termos");

module.exports = async function (context, req) {
  const usuario = auth.exigirLoginIgnorandoTermos(req, context);
  if (!usuario) return;

  const tipo = context.bindingData.tipo;
  const pool = await getPool();

  if (req.method === "GET") {
    const catalogo = {};
    for (const chave of Object.keys(TERMOS)) {
      catalogo[chave] = { titulo: TERMOS[chave].titulo, versao: TERMOS[chave].versao, texto: TERMOS[chave].texto };
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, termos: catalogo } };
    return;
  }

  if (req.method === "POST") {
    if (!tipo || !TERMOS[tipo]) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Tipo de termo inválido." } };
      return;
    }
    if (!TERMOS[tipo].aplicaA(usuario.nivel)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este termo não se aplica ao seu papel." } };
      return;
    }

    const jaAssinouEssaVersao = await pool.request()
      .input("id", sql.Int, usuario.membroId)
      .input("tipo", sql.NVarChar(40), tipo)
      .input("versao", sql.NVarChar(20), TERMOS[tipo].versao)
      .query(`SELECT 1 FROM TermosAssinados WHERE MembroId = @id AND TipoTermo = @tipo AND VersaoTermo = @versao`);
    if (jaAssinouEssaVersao.recordset.length === 0) {
      await pool.request()
        .input("membroId", sql.Int, usuario.membroId)
        .input("tipo", sql.NVarChar(40), tipo)
        .input("versao", sql.NVarChar(20), TERMOS[tipo].versao)
        .query(`INSERT INTO TermosAssinados (MembroId, TipoTermo, VersaoTermo) VALUES (@membroId, @tipo, @versao)`);
      await registrarAuditoria({
        tabela: "TermosAssinados", registroId: Number(usuario.membroId),
        acao: `Assinou termo ${tipo} (versão ${TERMOS[tipo].versao})`, usuarioId: usuario.membroId
      });
    }

    const pendentes = await termosPendentes(pool, sql, usuario.membroId, usuario.nivel);
    const { termosPendentes: antigo, exp, ...dadosSessao } = usuario;
    const token = auth.criarSessao(Object.assign({}, dadosSessao, { termosPendentes: pendentes }));

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: "✅ Termo assinado.", token, termosPendentes: pendentes }
    };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
