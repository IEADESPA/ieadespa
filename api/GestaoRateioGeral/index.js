// GestaoRateioGeral (v4.10, fundação)
// O "malote": controle interno dos repasses de 60% que a Tesouraria Geral
// já liberou (v4.1.3) mas ainda não dividiu entre Convenção, Prebenda
// Pastoral, Fundo PDQ e Tesouro Geral (RateioGeralDestinos, configurável).
// Cada congregação reporta em ritmo próprio — semanal, mensal, às vezes
// atrasada vários meses — então o malote vai acumulando repasses
// liberados de fechamentos de meses diferentes, de congregações
// diferentes, até a Tesouraria Geral fechar o Rateio Geral do mês
// (mesmo espírito do fechamento local, um nível acima). Regra de ouro:
// um repasse (FechamentoTesouraria) só entra em UM Rateio Geral — nunca
// dois (UNIQUE em RateioGeralItens.FechamentoId, trava física, não só
// checagem de aplicação) — "o que já foi rateado não pode misturar com o
// que ainda não foi".
// GET  /api/rateio-geral -> lista dos rateios já fechados
// GET  /api/rateio-geral/pendentes -> preview do malote acumulado (ainda não fechado)
// GET  /api/rateio-geral/{id} -> detalhe de um rateio fechado (itens + valores por destino)
// POST /api/rateio-geral -> { mesReferencia? } fecha o rateio com tudo que está pendente
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { round2 } = require("../shared/tesouraria");

function exigirFinanceiroGlobal(req, context) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return null;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "O Rateio Geral é matéria da Tesouraria Geral — restrito a papéis de nível Global." } };
    return null;
  }
  return usuario;
}

async function buscarPendentes(pool) {
  const result = await pool.request().query(`
    SELECT f.FechamentoId AS fechamentoId, f.CongregacaoId AS congregacaoId, c.Nome AS congregacaoNome,
           f.MesReferencia AS mesReferencia, f.ValorRepasseGeral AS valor,
           CONVERT(varchar(10), f.DataRepasse, 120) AS dataRepasse,
           DATEDIFF(MONTH, CAST(f.MesReferencia + '-01' AS DATE), CAST(SYSUTCDATETIME() AS DATE)) AS mesesAtraso
    FROM FechamentosTesouraria f
    JOIN Congregacoes c ON c.CongregacaoId = f.CongregacaoId
    WHERE f.Status = 'REPASSADO'
      AND NOT EXISTS (SELECT 1 FROM RateioGeralItens ri WHERE ri.FechamentoId = f.FechamentoId)
    ORDER BY f.MesReferencia, c.Nome
  `);
  return result.recordset;
}

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && id === "pendentes") {
    const itens = await buscarPendentes(pool);
    const totalBase = round2(itens.reduce((soma, i) => soma + Number(i.valor), 0));
    const destinos = await pool.request().query(`SELECT * FROM RateioGeralDestinos WHERE Ativo = 1 ORDER BY DestinoId`);
    const previsao = destinos.recordset.map(d => ({ codigo: d.Codigo, nome: d.Nome, percentual: d.Percentual, valor: round2(totalBase * Number(d.Percentual) / 100) }));
    const valorTesouroGeral = round2(totalBase - previsao.reduce((soma, p) => soma + p.valor, 0));
    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: { totalItens: itens.length, totalBase, previsaoDestinos: previsao, previsaoTesouroGeral: valorTesouroGeral, itens }
    };
    return;
  }

  if (req.method === "GET" && !id) {
    const result = await pool.request().query(`
      SELECT RateioGeralId AS rateioGeralId, MesReferencia AS mesReferencia, TotalBase AS totalBase,
             ValorTesouroGeral AS valorTesouroGeral, TotalItens AS totalItens, CONVERT(varchar(33), FechadoEm, 126) AS fechadoEm
      FROM RateiosGerais ORDER BY RateioGeralId DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && id) {
    const rateio = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM RateiosGerais WHERE RateioGeralId = @id`);
    if (rateio.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Rateio Geral não encontrado." } };
      return;
    }
    const valores = await pool.request().input("id", sql.Int, id).query(`SELECT DestinoCodigo AS destinoCodigo, DestinoNome AS destinoNome, Percentual AS percentual, Valor AS valor FROM RateioGeralValores WHERE RateioGeralId = @id`);
    const itens = await pool.request().input("id", sql.Int, id).query(`
      SELECT ri.FechamentoId AS fechamentoId, c.Nome AS congregacaoNome, ri.MesReferenciaCongregacao AS mesReferenciaCongregacao, ri.Valor AS valor
      FROM RateioGeralItens ri JOIN Congregacoes c ON c.CongregacaoId = ri.CongregacaoId
      WHERE ri.RateioGeralId = @id ORDER BY c.Nome
    `);
    const r = rateio.recordset[0];
    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: {
        rateioGeralId: r.RateioGeralId, mesReferencia: r.MesReferencia, totalBase: r.TotalBase,
        valorTesouroGeral: r.ValorTesouroGeral, totalItens: r.TotalItens,
        valores: valores.recordset, itens: itens.recordset
      }
    };
    return;
  }

  if (req.method === "POST") {
    const usuarioGlobal = exigirFinanceiroGlobal(req, context);
    if (!usuarioGlobal) return;
    const hoje = new Date();
    const mesReferencia = (req.body && req.body.mesReferencia) || `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

    const itens = await buscarPendentes(pool);
    if (itens.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Nada pendente no malote — todos os repasses liberados já foram rateados." } };
      return;
    }
    const totalBase = round2(itens.reduce((soma, i) => soma + Number(i.valor), 0));
    const destinos = await pool.request().query(`SELECT * FROM RateioGeralDestinos WHERE Ativo = 1 ORDER BY DestinoId`);

    const criado = await pool.request()
      .input("mesReferencia", sql.Char(7), mesReferencia).input("totalBase", sql.Decimal(12, 2), totalBase)
      .input("totalItens", sql.Int, itens.length).input("fechadoPor", sql.Int, usuarioGlobal.membroId)
      .query(`INSERT INTO RateiosGerais (MesReferencia, TotalBase, ValorTesouroGeral, TotalItens, FechadoPor)
              OUTPUT INSERTED.RateioGeralId VALUES (@mesReferencia, @totalBase, 0, @totalItens, @fechadoPor)`);
    const rateioGeralId = criado.recordset[0].RateioGeralId;

    let somaDestinos = 0;
    const valoresPorDestino = [];
    for (const d of destinos.recordset) {
      const valor = round2(totalBase * Number(d.Percentual) / 100);
      somaDestinos = round2(somaDestinos + valor);
      valoresPorDestino.push({ codigo: d.Codigo, nome: d.Nome, percentual: d.Percentual, valor });
      await pool.request().input("rateioGeralId", sql.Int, rateioGeralId).input("destinoCodigo", sql.NVarChar(30), d.Codigo)
        .input("destinoNome", sql.NVarChar(150), d.Nome).input("percentual", sql.Decimal(5, 2), d.Percentual).input("valor", sql.Decimal(12, 2), valor)
        .query(`INSERT INTO RateioGeralValores (RateioGeralId, DestinoCodigo, DestinoNome, Percentual, Valor) VALUES (@rateioGeralId, @destinoCodigo, @destinoNome, @percentual, @valor)`);
    }
    const valorTesouroGeral = round2(totalBase - somaDestinos);
    await pool.request().input("id", sql.Int, rateioGeralId).input("valor", sql.Decimal(12, 2), valorTesouroGeral)
      .query(`UPDATE RateiosGerais SET ValorTesouroGeral = @valor WHERE RateioGeralId = @id`);

    for (const item of itens) {
      await pool.request().input("rateioGeralId", sql.Int, rateioGeralId).input("fechamentoId", sql.Int, item.fechamentoId)
        .input("congregacaoId", sql.Int, item.congregacaoId).input("mesReferenciaCongregacao", sql.Char(7), item.mesReferencia)
        .input("valor", sql.Decimal(12, 2), item.valor)
        .query(`INSERT INTO RateioGeralItens (RateioGeralId, FechamentoId, CongregacaoId, MesReferenciaCongregacao, Valor)
                VALUES (@rateioGeralId, @fechamentoId, @congregacaoId, @mesReferenciaCongregacao, @valor)`);
    }

    await registrarAuditoria({
      tabela: "RateiosGerais", registroId: rateioGeralId, acao: "Fechou Rateio Geral (malote)", usuarioId: usuarioGlobal.membroId,
      dadosDepois: { mesReferencia, totalBase, totalItens: itens.length, valoresPorDestino, valorTesouroGeral }
    });
    context.res = {
      status: 201, headers: { "Content-Type": "application/json" },
      body: {
        sucesso: true,
        mensagem: `✅ Rateio Geral de ${mesReferencia} fechado — ${itens.length} repasse(s) de ${new Set(itens.map(i => i.congregacaoId)).size} congregação(ões), total R$ ${totalBase.toFixed(2)}.`,
        rateioGeralId, totalBase, valoresPorDestino, valorTesouroGeral
      }
    };
    return;
  }
};
