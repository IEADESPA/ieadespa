// ImportarPessoas (v1.8)
// Endpoint "burro" de propósito: a decisão de duplicata (matrícula exata ou nome
// muito parecido) já foi tomada no navegador, numa tela de revisão linha a linha —
// aqui só chega o que o operador confirmou. Mesmo padrão de parsing client-side
// (SheetJS) já usado em GestaoElegiveisAssembleia.
// POST /api/pessoas/importar -> body: { linhas: [{ membroId, nome, situacaoMembro, sobrescrever }] }
//
// Importação em lote do rol é do nível GERAL (papel Global com escopo de todas as congregações): a linha NOVA nasce sem congregação (a planilha não traz) e a linha que
// SOBRESCREVE troca nome e situação de uma matrícula de qualquer congregação — com escopo local, o Dirigente alteraria membros alheios e não enxergaria o que importou.
// Tudo dentro de UMA transação: ou entra a planilha inteira, ou nada (antes, um erro no meio deixava o rol pela metade).
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { exigirGeral } = require("../shared/escopoRotas");

const MAX_LINHAS = 2000;

module.exports = async function (context, req) {
  const usuario = exigirGeral(req, context, "pessoas");
  if (!usuario) return;

  const linhas = (req.body || {}).linhas;
  if (!Array.isArray(linhas) || linhas.length === 0) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Envie ao menos uma linha { membroId, nome, situacaoMembro }." } };
    return;
  }
  if (linhas.length > MAX_LINHAS) {
    context.res = { status: 400, body: { sucesso: false, mensagem: `Envie no máximo ${MAX_LINHAS} linhas por importação — divida a planilha.` } };
    return;
  }

  // Matrícula só na forma canônica (auth.idDeRota): "1.5", "0x10", "1e1" e " 5" não viram a matrícula 1, 16, 10 e 5 por baixo dos panos.
  const linhasValidas = linhas
    .filter(l => l && typeof l === "object" && !Array.isArray(l) && auth.idDeRota(l.membroId) && String(l.nome || "").trim())
    .map(l => ({ membroId: auth.idDeRota(l.membroId), nome: String(l.nome).trim().slice(0, 200), situacaoMembro: l.situacaoMembro, sobrescrever: l.sobrescrever === true }));
  if (linhasValidas.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Nenhuma linha válida (matrícula numérica + nome) encontrada." } };
    return;
  }

  const pool = await getPool();
  const situacoesResult = await pool.request().query(`SELECT Sigla FROM SituacoesMembro`);
  const situacoesValidas = new Set(situacoesResult.recordset.map(s => s.Sigla));

  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;
  const transaction = new sql.Transaction(pool);
  const r = () => new sql.Request(transaction);
  await transaction.begin();
  try {
    const vistos = new Set();
    for (const linha of linhasValidas) {
      const { membroId, nome } = linha;
      const situacaoMembro = situacoesValidas.has(linha.situacaoMembro) ? linha.situacaoMembro : null;

      // A mesma matrícula duas vezes na planilha vale uma vez só (a primeira) — a segunda não "sobrescreve" a recém-criada.
      if (vistos.has(membroId)) { ignorados++; continue; }
      vistos.add(membroId);

      const existente = await r().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
      const existia = existente.recordset.length > 0;

      if (existia && !linha.sobrescrever) {
        // Proteção redundante: o front já deveria ter filtrado isso na tela de revisão,
        // mas o backend não confia cegamente no que vem do cliente.
        ignorados++;
        continue;
      }

      if (existia) {
        const request = r().input("id", sql.Int, membroId).input("nome", sql.NVarChar(200), nome);
        if (situacaoMembro) {
          await request.input("situacaoMembro", sql.NVarChar(30), situacaoMembro)
            .query(`UPDATE MembroReferencia SET Nome = @nome, SituacaoMembro = @situacaoMembro WHERE MembroId = @id`);
        } else {
          await request.query(`UPDATE MembroReferencia SET Nome = @nome WHERE MembroId = @id`);
        }
        atualizados++;
      } else {
        await r()
          .input("id", sql.Int, membroId)
          .input("nome", sql.NVarChar(200), nome)
          .input("situacaoMembro", sql.NVarChar(30), situacaoMembro || "EM_COMUNHAO")
          .query(`INSERT INTO MembroReferencia (MembroId, Nome, Status, SituacaoMembro) VALUES (@id, @nome, 'ATIVO', @situacaoMembro)`);
        criados++;
      }
    }
    await transaction.commit();
  } catch (e) {
    try { await transaction.rollback(); } catch (_) { /* a conexão já pode ter caído */ }
    context.log.error("Falha ao importar pessoas:", e.message);
    context.res = { status: 500, body: { sucesso: false, mensagem: "Não foi possível importar: nenhuma linha foi gravada. Confira a planilha e tente de novo." } };
    return;
  }

  const resumo = { criados, atualizados, ignorados };
  await registrarAuditoria({
    tabela: "MembroReferencia",
    registroId: 0,
    acao: "Importou pessoas em lote (planilha)",
    usuarioId: usuario.membroId,
    dadosDepois: resumo
  });

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: {
      sucesso: true,
      mensagem: `✅ Importação concluída: ${criados} criados, ${atualizados} atualizados, ${ignorados} ignorados.`,
      resumo
    }
  };
};
