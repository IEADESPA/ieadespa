// SortearCampanha (v4.4)
// Realiza o sorteio de uma campanha do tipo SORTEIO — sorteia um número
// entre os já vendidos (CampanhaSorteioNumeros) e grava o resultado de
// forma permanente (Campanhas.NumeroVencedor nunca muda depois de
// sorteado — não existe endpoint de "sortear de novo"). Restrito a nível
// Global: quem sorteia nunca é quem vendeu os números localmente (mesmo
// princípio de segregação de funções da Tesouraria Geral conferindo o que
// o Local lançou, v4.1.3/seção 2.7) — dá lisura ao sorteio.
// POST /api/campanhas/{campanhaId}/sortear
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const campanhaId = context.bindingData.campanhaId;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Sortear é restrito a papéis de nível Global — quem sorteia nunca é quem vendeu os números." } };
    return;
  }
  if (!campanhaId) {
    context.res = { status: 400, body: { erro: "Informe o campanhaId na rota." } };
    return;
  }

  const pool = await getPool();
  const campanha = await pool.request().input("id", sql.Int, campanhaId).query(`SELECT * FROM Campanhas WHERE CampanhaId = @id`);
  if (campanha.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Campanha não encontrada." } };
    return;
  }
  const camp = campanha.recordset[0];
  if (camp.Tipo !== "SORTEIO") {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Esta campanha não é do tipo Sorteio." } };
    return;
  }
  if (camp.NumeroVencedor != null) {
    context.res = { status: 200, body: { sucesso: false, mensagem: `Esta campanha já foi sorteada — número vencedor: ${camp.NumeroVencedor}.` } };
    return;
  }

  const numeros = await pool.request().input("campanhaId", sql.Int, campanhaId)
    .query(`SELECT Numero, DizimistaId, NomeAvulso FROM CampanhaSorteioNumeros WHERE CampanhaId = @campanhaId`);
  if (numeros.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Nenhum número vendido ainda — não é possível sortear." } };
    return;
  }

  const sorteado = numeros.recordset[Math.floor(Math.random() * numeros.recordset.length)];
  let nomeVencedor = sorteado.NomeAvulso;
  if (sorteado.DizimistaId) {
    const dizimista = await pool.request().input("id", sql.Int, sorteado.DizimistaId).query(`SELECT Nome FROM Dizimistas WHERE DizimistaId = @id`);
    if (dizimista.recordset.length > 0) nomeVencedor = dizimista.recordset[0].Nome;
  }

  await pool.request().input("campanhaId", sql.Int, campanhaId).input("numeroVencedor", sql.Int, sorteado.Numero).input("sorteadoPor", sql.Int, usuario.membroId)
    .query(`UPDATE Campanhas SET NumeroVencedor = @numeroVencedor, SorteadoPor = @sorteadoPor, SorteadoEm = SYSUTCDATETIME() WHERE CampanhaId = @campanhaId`);
  await pool.request().input("campanhaId", sql.Int, campanhaId).input("numero", sql.Int, sorteado.Numero)
    .query(`UPDATE CampanhaSorteioNumeros SET Sorteado = 1 WHERE CampanhaId = @campanhaId AND Numero = @numero`);

  await registrarAuditoria({
    tabela: "Campanhas", registroId: Number(campanhaId), acao: "Sorteou campanha", usuarioId: usuario.membroId,
    dadosDepois: { numeroVencedor: sorteado.Numero, totalParticipantes: numeros.recordset.length, participantes: numeros.recordset.map(n => n.Numero) }
  });

  context.res = {
    status: 200, headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: `🎉 Número sorteado: ${sorteado.Numero} — ${nomeVencedor}.`, numeroVencedor: sorteado.Numero, nomeVencedor }
  };
};
