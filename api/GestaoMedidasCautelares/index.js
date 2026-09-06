// GestaoMedidasCautelares (v2.6)
// Medidas Cautelares de Proteção Patrimonial (Art. 45) — o Conselho Fiscal
// registra a decisão; se marcar "suspender acesso ao sistema", a única das 3
// restrições do §1º que este sistema de fato controla, o login da pessoa em
// Lideranca é suspenso na hora (reaproveita a coluna AtivoAte, que já
// existia desde a migração 001 mas nunca era checada em lugar nenhum).
// GET  /api/medidas-cautelares                          -> lista, com prazo do Art. 45 §2º calculado
// POST /api/medidas-cautelares                          -> body: { membroId, motivo, suspenderAcessoSistema?, suspensaoContasBancarias?, suspensaoChavesFisicas? }
// POST /api/medidas-cautelares/{id}/concluir-relatorio  -> fecha o prazo (representação à CLI feita)
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const estatuto = require("../shared/estatuto");

const DIAS_RELATORIO = 30; // Art. 45 §2º

const SELECT_MEDIDA = `
  SELECT mc.MedidaId AS medidaId, mc.MembroId AS membroId, m.Nome AS nome, mc.Motivo AS motivo,
         mc.SuspenderAcessoSistema AS suspenderAcessoSistema,
         mc.SuspensaoContasBancarias AS suspensaoContasBancarias,
         mc.SuspensaoChavesFisicas AS suspensaoChavesFisicas,
         CONVERT(varchar(10), mc.DataAplicacao, 120) AS dataAplicacao,
         CONVERT(varchar(10), mc.DataConclusaoRelatorio, 120) AS dataConclusaoRelatorio
  FROM MedidasCautelares mc
  JOIN MembroReferencia m ON m.MembroId = mc.MembroId`;

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const id = context.bindingData.id;
  const acao = context.bindingData.acao;
  const pool = await getPool();

  if (req.method === "GET") {
    const result = await pool.request().query(`${SELECT_MEDIDA} ORDER BY mc.DataAplicacao DESC`);
    const hoje = new Date().toISOString().slice(0, 10);
    const comPrazo = result.recordset.map(m => {
      const diasDesde = estatuto.diasDesde(m.dataAplicacao, hoje);
      const prazoVencido = !m.dataConclusaoRelatorio && diasDesde > DIAS_RELATORIO;
      return Object.assign({}, m, { diasDesdeAplicacao: diasDesde, prazoRelatorioVencido: prazoVencido, diasPrazoRelatorio: DIAS_RELATORIO });
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: comPrazo };
    return;
  }

  if (req.method === "POST" && id && acao === "concluir-relatorio") {
    const antes = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM MedidasCautelares WHERE MedidaId = @id`);
    if (!antes.recordset[0]) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Medida cautelar não encontrada." } };
      return;
    }
    if (antes.recordset[0].DataConclusaoRelatorio) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "O relatório dessa medida já foi concluído." } };
      return;
    }
    await pool.request().input("id", sql.Int, id)
      .query(`UPDATE MedidasCautelares SET DataConclusaoRelatorio = CAST(SYSUTCDATETIME() AS DATE) WHERE MedidaId = @id`);
    await registrarAuditoria({
      tabela: "MedidasCautelares", registroId: Number(id), acao: "Concluiu relatório de auditoria (Art. 45 §2º)", usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Relatório concluído — representação à CLI registrada." } };
    return;
  }

  if (req.method === "POST" && !id) {
    const { membroId, motivo, suspenderAcessoSistema, suspensaoContasBancarias, suspensaoChavesFisicas } = req.body || {};
    if (!membroId || !motivo) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: membroId, motivo." } };
      return;
    }
    const membro = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
    if (membro.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
      return;
    }

    const result = await pool.request()
      .input("membroId", sql.Int, membroId)
      .input("motivo", sql.NVarChar(1000), motivo)
      .input("susAcesso", sql.Bit, !!suspenderAcessoSistema)
      .input("susBancaria", sql.Bit, !!suspensaoContasBancarias)
      .input("susChaves", sql.Bit, !!suspensaoChavesFisicas)
      .input("aplicadoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO MedidasCautelares (MembroId, Motivo, SuspenderAcessoSistema, SuspensaoContasBancarias, SuspensaoChavesFisicas, AplicadoPor)
              OUTPUT INSERTED.MedidaId
              VALUES (@membroId, @motivo, @susAcesso, @susBancaria, @susChaves, @aplicadoPor)`);
    const medidaId = result.recordset[0].MedidaId;

    if (suspenderAcessoSistema) {
      // Ontem, não hoje: o login checa "AtivoAte < hoje" (mesmo padrão de
      // vencimento de Assentos) — pra suspender JÁ no dia de hoje, precisa
      // que a data fique estritamente no passado.
      await pool.request().input("membroId", sql.Int, membroId)
        .query(`UPDATE Lideranca SET AtivoAte = DATEADD(day, -1, CAST(SYSUTCDATETIME() AS DATE)) WHERE MembroId = @membroId`);
    }

    await registrarAuditoria({
      tabela: "MedidasCautelares", registroId: medidaId, acao: "Aplicou Medida Cautelar de Proteção Patrimonial (Art. 45)",
      usuarioId: usuario.membroId,
      dadosDepois: { membroId, motivo, suspenderAcessoSistema: !!suspenderAcessoSistema, suspensaoContasBancarias: !!suspensaoContasBancarias, suspensaoChavesFisicas: !!suspensaoChavesFisicas }
    });

    const criado = await pool.request().input("id", sql.Int, medidaId).query(`${SELECT_MEDIDA} WHERE mc.MedidaId = @id`);
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Medida cautelar aplicada.", medida: criado.recordset[0] } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método/rota não suportado." } };
};
