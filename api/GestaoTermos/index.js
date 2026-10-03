// GestaoTermos (v2.7)
// GET  /api/termos       -> catálogo completo (título, versão, texto) de todos os termos
// POST /api/termos/{tipo} -> assina o termo {tipo} pra quem está logado; devolve
//                            um token novo já sem esse pendente (o front troca
//                            o token guardado com esse valor).
// Usa exigirLoginIgnorandoTermos (não exigirLogin) de propósito: esta é a
// única rota que precisa continuar acessível mesmo com termos pendentes —
// senão ninguém conseguiria assinar o que está bloqueando o próprio acesso.
const auth = require("../shared/auth");
const { registrarAuditoria, sha256 } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { TERMOS, termosPendentes } = require("../shared/termos");
const { registrarAceiteClausulaCompromissoria } = require("../shared/mediacaoArbitragem");

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
    // hasOwnProperty: "constructor", "__proto__" e afins existem em qualquer objeto e passavam em `!TERMOS[tipo]`, quebrando depois em `.aplicaA` (500).
    if (typeof tipo !== "string" || !Object.prototype.hasOwnProperty.call(TERMOS, tipo)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Tipo de termo inválido." } };
      return;
    }
    // v7.6 — o nível do CARGO PRÓPRIO (uma delegação recebida não muda quais termos a pessoa assina; ver auth.nivelDoCargoProprio)
    if (!TERMOS[tipo].aplicaA(auth.nivelDoCargoProprio(usuario))) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este termo não se aplica ao seu papel." } };
      return;
    }

    const jaAssinouEssaVersao = await pool.request()
      .input("id", sql.Int, usuario.membroId)
      .input("tipo", sql.NVarChar(40), tipo)
      .input("versao", sql.NVarChar(20), TERMOS[tipo].versao)
      .query(`SELECT 1 FROM TermosAssinados WHERE MembroId = @id AND TipoTermo = @tipo AND VersaoTermo = @versao`);
    if (jaAssinouEssaVersao.recordset.length === 0) {
      // vB.6 — trilha de integridade: hash do TEXTO do termo no momento da
      // assinatura. Sem isso, se o catálogo (shared/termos.js) mudasse o
      // texto sem bump de versão, não haveria como detectar depois — o
      // hash é o que permite `VerificarTermoAssinado` flagrar essa
      // divergência (ver a Function nova).
      const hashConteudo = sha256(TERMOS[tipo].texto);
      await pool.request()
        .input("membroId", sql.Int, usuario.membroId)
        .input("tipo", sql.NVarChar(40), tipo)
        .input("versao", sql.NVarChar(20), TERMOS[tipo].versao)
        .input("hash", sql.NVarChar(64), hashConteudo)
        .query(`INSERT INTO TermosAssinados (MembroId, TipoTermo, VersaoTermo, HashConteudo) VALUES (@membroId, @tipo, @versao, @hash)`);
      await registrarAuditoria({
        tabela: "TermosAssinados", registroId: Number(usuario.membroId),
        acao: `Assinou termo ${tipo} (versão ${TERMOS[tipo].versao})`, usuarioId: usuario.membroId
      });

      // vB.16 (Art. 161-A) — a via de Mediação/Arbitragem só é realmente
      // obrigatória se a adesão existir ANTES do conflito (Lei 9.307 art.
      // 4º §2º: aceite expresso e datado, nunca presumido). O Termo de
      // Compromisso de Gestão (Art. 57) já é o momento em que um Dirigente
      // assume — é o gancho natural, sem precisar de uma 2ª tela pra isso.
      if (tipo === "COMPROMISSO_DIRIGENTE") {
        await registrarAceiteClausulaCompromissoria(pool, usuario.membroId);
      }
    }

    const pendentes = await termosPendentes(pool, sql, usuario.membroId, auth.nivelDoCargoProprio(usuario));
    // O token novo MANTÉM a validade do original (como na troca de PIN): antes cada POST aqui renovava 12 h, então um token roubado nunca vencia e um acesso
    // suspenso por Medida Cautelar seguia vivo para sempre. Assinar um termo atualiza só a lista de pendências.
    const token = auth.reassinarMantendoValidade(auth.extrairToken(req), { termosPendentes: pendentes });
    if (!token) {
      context.res = { status: 401, body: { sucesso: false, mensagem: "Faça login para continuar." } };
      return;
    }

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: "✅ Termo assinado.", token, termosPendentes: pendentes }
    };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método não suportado." } };
};
