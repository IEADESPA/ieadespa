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
const { registrarAuditoria, registrarAuditoriaNaTransacao } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const travaPermissoes = require("../shared/travaPermissoes");
const { emTransacao } = require("../shared/transacaoCurta");
const estatuto = require("../shared/estatuto");
const { exigirGeral } = require("../shared/escopoRotas");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const { encerrarDelegacoesDaPessoa } = require("../shared/delegacoes");

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
  // Medida cautelar do Art. 45 é da igreja como um todo (Conselho Fiscal) e suspende o LOGIN de qualquer liderança, inclusive Pastor e Presidente: só o GERAL (papel Global com
  // escopo de todas as congregações). Antes bastava "pessoas" — um Dirigente local suspendia o acesso do Presidente e lia o motivo de todas as medidas.
  const usuario = exigirGeral(req, context, "pessoas");
  if (!usuario) return;

  const idBruto = context.bindingData.id;
  const id = auth.idDeRota(idBruto);
  const acao = context.bindingData.acao;
  // Um id na rota que não é uma matrícula canônica nunca vira "criar medida nova" (o ramo de criação é o POST SEM id).
  if (idBruto !== undefined && idBruto !== null && idBruto !== "" && !id) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Medida cautelar não encontrada." } };
    return;
  }
  const pool = await getPool();

  if (req.method === "GET") {
    const result = await pool.request().query(`${SELECT_MEDIDA} ORDER BY mc.DataAplicacao DESC`);
    const hoje = hojeBrasilia();                      // o prazo conta pelo dia de Brasília, o mesmo da data gravada
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
    await pool.request().input("id", sql.Int, id).input("hoje", sql.Date, hojeBrasilia())
      .query(`UPDATE MedidasCautelares SET DataConclusaoRelatorio = @hoje WHERE MedidaId = @id`);
    await registrarAuditoria({
      tabela: "MedidasCautelares", registroId: Number(id), acao: "Concluiu relatório de auditoria (Art. 45 §2º)", usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Relatório concluído — representação à CLI registrada." } };
    return;
  }

  if (req.method === "POST" && !id) {
    const { membroId: membroIdBruto, motivo, suspenderAcessoSistema, suspensaoContasBancarias, suspensaoChavesFisicas } = req.body || {};
    // Suspender o acesso tira cargo e permissão: pede a confirmação recente (428), como retirar um cargo ou cancelar uma delegação.
    if (suspenderAcessoSistema && !auth.exigirFatorRecente(req, context)) return;
    if (!membroIdBruto || !motivo || typeof motivo !== "string" || !motivo.trim()) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: membroId, motivo." } };
      return;
    }
    const membroId = auth.idDeRota(membroIdBruto);
    const membro = membroId ? await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`) : { recordset: [] };
    if (membro.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
      return;
    }

    // Trava de segurança: nunca deixa "suspender acesso ao sistema" tirar a última pessoa que administra os acessos (permissão "permissoes") — senão ninguém
    // mais consegue nem desfazer a própria medida. Conta só quem entra de verdade com ela (shared/travaPermissoes.js: cargo vigente, ATIVO no rol, nível geral,
    // recertificação em dia).
    if (suspenderAcessoSistema) {
      const situacao = await travaPermissoes.situacaoDoCargo(pool, sql, membroId, hojeBrasilia());   // o dia de Brasília, o mesmo do login
      if (travaPermissoes.ficariaSemAdministrador(situacao)) {
        context.res = {
          status: 200,
          body: { sucesso: false, mensagem: "Não é possível suspender o acesso ao sistema desta pessoa: ela é a única com a permissão \"permissoes\" ativa — ninguém mais conseguiria gerenciar acesso/senha depois. Conceda a permissão a outra pessoa antes de aplicar essa medida." }
        };
        return;
      }
    }

    // A medida, o fim dos cargos, as sessões, as delegações e a trilha numa transação só (shared/transacaoCurta.js): uma falha no meio desfaz tudo, e a nova
    // tentativa não deixa uma medida "aplicada" sem a suspensão nem uma segunda medida igual.
    const medidaId = await emTransacao(pool, async ({ rq, executor, transacao }) => {
      const hoje = hojeBrasilia();                    // a data da decisão é o dia de Brasília (shared/dataBrasilia.js)
      const result = await rq()
        .input("membroId", sql.Int, membroId)
        .input("motivo", sql.NVarChar(1000), motivo.trim().slice(0, 1000))
        .input("susAcesso", sql.Bit, !!suspenderAcessoSistema)
        .input("susBancaria", sql.Bit, !!suspensaoContasBancarias)
        .input("susChaves", sql.Bit, !!suspensaoChavesFisicas)
        .input("aplicadoPor", sql.Int, usuario.membroId)
        .input("hoje", sql.Date, hoje)
        .query(`INSERT INTO MedidasCautelares (MembroId, Motivo, SuspenderAcessoSistema, SuspensaoContasBancarias, SuspensaoChavesFisicas, AplicadoPor, DataAplicacao)
                OUTPUT INSERTED.MedidaId
                VALUES (@membroId, @motivo, @susAcesso, @susBancaria, @susChaves, @aplicadoPor, @hoje)`);
      const id = result.recordset[0].MedidaId;

      let cargosEncerrados = [];
      if (suspenderAcessoSistema) {
        // Ontem, não hoje: o login checa "AtivoAte < hoje" (mesmo padrão de vencimento de Assentos) — pra suspender JÁ no dia de hoje, precisa que a data fique
        // estritamente no passado. "Hoje" é o de Brasília, a mesma régua do login (sessaoLideranca.suspensa; shared/dataBrasilia.js).
        // Só os cargos vigentes (como na vacância): o fim de um mandato já encerrado fica como estava, e o fim anterior de cada cargo vai para a trilha.
        const fim = await rq().input("membroId", sql.Int, membroId).input("h", sql.Date, hoje)
          .query(`UPDATE Lideranca SET AtivoAte = DATEADD(day, -1, @h)
                  OUTPUT DELETED.LiderancaId, CONVERT(varchar(10), DELETED.AtivoAte, 120) AS AtivoAteAnterior
                  WHERE MembroId = @membroId AND (AtivoAte IS NULL OR AtivoAte >= @h)`);
        cargosEncerrados = (fim.recordset || []).map((l) => ({ liderancaId: l.LiderancaId, ativoAteAnterior: l.AtivoAteAnterior || null }));
        // v7.6 — e as sessões abertas caem na hora (antes o token valia até expirar sozinho, 12 h).
        await auth.revogarSessoesDoMembro(executor, sql, membroId);
        // Trava 7-C — e as delegações que a pessoa RECEBEU ou DEU deixam de valer (a suspensa sai também da lista de quem recebe avisos por delegação, como o pedido
        // da imprensa na crise). Ficam canceladas, com a trilha: levantar a medida não as revive (quem delegou faz uma nova, se quiser). As sessões abertas de quem
        // recebeu uma delegação dela caem junto (shared/delegacoes.js).
        await encerrarDelegacoesDaPessoa(executor, sql, membroId);
      }

      await registrarAuditoriaNaTransacao(transacao, {
        tabela: "MedidasCautelares", registroId: id, acao: "Aplicou Medida Cautelar de Proteção Patrimonial (Art. 45)",
        usuarioId: usuario.membroId,
        ...(suspenderAcessoSistema ? { dadosAntes: { cargos: cargosEncerrados } } : {}),
        dadosDepois: { membroId, motivo, suspenderAcessoSistema: !!suspenderAcessoSistema, suspensaoContasBancarias: !!suspensaoContasBancarias, suspensaoChavesFisicas: !!suspensaoChavesFisicas }
      });
      return id;
    });

    const criado = await pool.request().input("id", sql.Int, medidaId).query(`${SELECT_MEDIDA} WHERE mc.MedidaId = @id`);
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Medida cautelar aplicada.", medida: criado.recordset[0] } };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método/rota não suportado." } };
};
