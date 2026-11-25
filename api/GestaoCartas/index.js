// GestaoCartas — Secretaria gerencia as Cartas de Trânsito (v1.4 — Reg. Art. 131).
// Exige a permissão "pessoas".
//
// GET   /api/cartas                  -> lista (com nome do membro)
// POST  /api/cartas/emitir           -> body: { cartaId }  (Recomendação ganha validade de 30 dias)
// POST  /api/cartas/cancelar         -> body: { cartaId }
// POST  /api/cartas/processar        -> minimização de 30 dias (Reg. Art. 132 §2º)
//
// A minimização é SOB DEMANDA (sem job/timer): cartas de Mudança com ≥30 dias da
// confirmação têm os dados pessoais minimizados (Registro Histórico Mínimo), salvo
// se o membro foi readmitido (DataAdmissao posterior ao pedido) — aí a carta é
// cancelada ("o relógio zerou", Reg. Art. 131 §4º, II).
//
// A Carta de Mudança é o desligamento, e só vale com a CONFIRMAÇÃO DO PRÓPRIO MEMBRO (SolicitarCarta: a sessão dele, com a declaração de ciência). Decisões de
// 25/11/2026: a secretaria não emite a Mudança que o membro só pediu; o processamento só conta o prazo da confirmação e exige que ela exista. O membro sai
// sozinho, seja qual for o cargo (regra do responsável, "A movimentação", 23/11): a vacância deixa os cargos vagos e não se barra pela trava do último que
// administra os acessos; nesse caso a trilha registra (o aviso à Geral sai na confirmação da carta, não aqui).
//
// ESCOPO: a carta é da PESSOA — lista, emissão, cancelamento e o "processar" só alcançam as cartas de quem está na congregação que o usuário alcança
// (shared/escopoRotas.js); carta de fora do escopo tem a MESMA resposta de "não encontrada". O "processar" é irreversível (zera contatos e desliga o membro), então cada
// minimização e cada cancelamento por retorno deixam trilha de auditoria.
const auth = require("../shared/auth");
const { registrarAuditoria, registrarAuditoriaNaTransacao } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const estatuto = require("../shared/estatuto");
const { diasMinimizacaoExMembro, minimizarNaTransacao, excluirDocumentos } = require("../shared/minimizacaoLgpd");
const { emTransacao } = require("../shared/transacaoCurta");
const licencaCandidatura = require("../shared/licencaCandidatura");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const { obterTrava } = require("../shared/financeiroSeguro");
const travaPermissoes = require("../shared/travaPermissoes");
const { filtrarPorEscopo, pessoaAlcancavel } = require("../shared/escopoRotas");

const SELECT_LISTA = `
  SELECT c.CartaId AS cartaId, c.MembroId AS membroId, m.Nome AS nome, cg.Nome AS congregacao,
         c.Tipo AS tipo, c.Status AS status, c.Destino AS destino, c.MotivoSaida AS motivoSaida,
         c.DeclaracaoCiencia AS declaracaoCiencia,
         CONVERT(varchar(10), c.DataEmissao, 120) AS dataEmissao,
         CONVERT(varchar(10), c.DataValidade, 120) AS dataValidade,
         CONVERT(varchar(10), ISNULL(c.DataConfirmacao, c.DataSolicitacao), 120) AS dataPedido,
         CONVERT(varchar(10), m.DataAdmissao, 120) AS dataAdmissao,
         COALESCE(cm.Nome, m.Funcao) AS funcao, m.CargoMinisterial AS cargoMinisterial,
         m.SituacaoMembro AS situacaoMembro, m.EstadoCivil AS estadoCivil, m.Status AS statusMembro,
         c.ManterAcessoSite AS manterAcessoSite, ex.Nome AS extensaoNome
  FROM CartasTransito c
  JOIN MembroReferencia m ON m.MembroId = c.MembroId
  LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
  LEFT JOIN ExtensoesTenda ex ON ex.ExtensaoId = m.ExtensaoId
  LEFT JOIN CargosMinisteriais cm ON cm.Sigla = m.CargoMinisterial`;

function dataISO(data) {
  if (!data) return null;
  const d = new Date(data);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const method = req.method;
  const acao = context.bindingData.acao;
  const pool = await getPool();

  if (method === "GET") {
    const result = await pool.request().query(`${SELECT_LISTA} ORDER BY c.CartaId DESC`);
    const visiveis = filtrarPorEscopo(usuario, result.recordset, c => c.congregacao, c => c.extensaoNome)
      .map(({ extensaoNome, ...resto }) => resto);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: visiveis };
    return;
  }

  if (method === "POST" && acao === "emitir") {
    const { cartaId: cartaIdBruto } = req.body || {};
    if (!cartaIdBruto) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe cartaId." } };
      return;
    }
    const cartaId = auth.idDeRota(cartaIdBruto);
    const cartaResult = cartaId ? await pool.request().input("id", sql.Int, cartaId).query(`SELECT Tipo, Status, MembroId FROM CartasTransito WHERE CartaId = @id`) : { recordset: [] };
    const carta = cartaResult.recordset[0];
    // Carta inexistente e carta de pessoa fora do escopo: a mesma resposta.
    if (!carta || !(await pessoaAlcancavel(pool, usuario, carta.MembroId))) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Carta não encontrada." } };
      return;
    }
    // A Carta de Mudança só sai depois da confirmação do próprio membro (a declaração de ciência do desligamento); as outras, pedidas ou confirmadas.
    if (carta.Tipo === "MUDANCA" && carta.Status === "SOLICITADA") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "A Carta de Mudança só é emitida depois que o próprio membro a confirma no aplicativo (a declaração de que sabe do desligamento)." } };
      return;
    }
    if (!["SOLICITADA", "CONFIRMADA"].includes(carta.Status)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Carta com status "${carta.Status}" não pode ser emitida.` } };
      return;
    }
    const hoje = new Date();
    const validade = carta.Tipo === "RECOMENDACAO"
      ? dataISO(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 30))
      : null;
    // Só emite quem ainda a encontra CONFIRMADA (ou SOLICITADA, fora a Mudança): duas emissões ao mesmo tempo não se atropelam, e a regra da Mudança vale também aqui.
    const upd = await pool.request()
      .input("id", sql.Int, cartaId)
      .input("hoje", sql.Date, dataISO(hoje))
      .input("validade", sql.Date, validade)
      .input("emitidoPor", sql.Int, usuario.membroId)
      .query(`UPDATE CartasTransito SET Status = 'EMITIDA', DataEmissao = @hoje, DataValidade = @validade, EmitidoPor = @emitidoPor WHERE CartaId = @id AND (Status = 'CONFIRMADA' OR (Status = 'SOLICITADA' AND Tipo <> 'MUDANCA'))`);
    if (upd.rowsAffected[0] === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Carta não pode ser emitida (o status mudou)." } };
      return;
    }
    await registrarAuditoria({ tabela: "CartasTransito", registroId: Number(cartaId), acao: "Emitiu carta", usuarioId: usuario.membroId, dadosDepois: { status: "EMITIDA", validade } });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Carta emitida." } };
    return;
  }

  if (method === "POST" && acao === "cancelar") {
    const { cartaId: cartaIdBruto } = req.body || {};
    if (!cartaIdBruto) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe cartaId." } };
      return;
    }
    const cartaId = auth.idDeRota(cartaIdBruto);
    const carta = cartaId ? (await pool.request().input("id", sql.Int, cartaId).query(`SELECT MembroId FROM CartasTransito WHERE CartaId = @id`)).recordset[0] : null;
    if (!carta || !(await pessoaAlcancavel(pool, usuario, carta.MembroId))) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Carta não encontrada ou já concluída." } };
      return;
    }
    const upd = await pool.request().input("id", sql.Int, cartaId)
      .query(`UPDATE CartasTransito SET Status = 'CANCELADA' WHERE CartaId = @id AND Status <> 'CONCLUIDA'`);
    if (upd.rowsAffected[0] === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Carta não encontrada ou já concluída." } };
      return;
    }
    await registrarAuditoria({ tabela: "CartasTransito", registroId: Number(cartaId), acao: "Cancelou carta", usuarioId: usuario.membroId });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Carta cancelada." } };
    return;
  }

  if (method === "POST" && acao === "processar") {
    // (o apelido da data não pode se chamar "dataBase": DATABASE é palavra reservada do SQL Server e a consulta daria erro)
    // O prazo conta da confirmação do membro (o dia de Brasília: a confirmação é gravada em UTC). A Mudança sem a confirmação dele (dado de antes da regra) não entra.
    const candidatasResult = await pool.request().query(`
      SELECT c.CartaId, c.MembroId, c.MotivoSaida,
             CASE WHEN c.DataConfirmacao IS NOT NULL AND c.DeclaracaoCiencia IS NOT NULL THEN 1 ELSE 0 END AS ConfirmadaPeloMembro,
             CONVERT(varchar(10), DATEADD(hour, -3, c.DataConfirmacao), 120) AS dataReferencia,
             CONVERT(varchar(10), m.DataAdmissao, 120) AS dataAdmissao,
             cg.Nome AS congregacaoNome, ex.Nome AS extensaoNome
      FROM CartasTransito c
      JOIN MembroReferencia m ON m.MembroId = c.MembroId
      LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
      LEFT JOIN ExtensoesTenda ex ON ex.ExtensaoId = m.ExtensaoId
      WHERE c.Tipo = 'MUDANCA' AND c.Status IN ('CONFIRMADA','EMITIDA')`);
    // Só as cartas de quem está no escopo de quem aciona o processamento.
    const candidatas = filtrarPorEscopo(usuario, candidatasResult.recordset, c => c.congregacaoNome, c => c.extensaoNome);

    // vB.8 — o prazo agora vem de PoliticasRetencao (antes era um número
    // fixo no código, sem nenhuma relação com o catálogo de retenção).
    const diasMinimizacao = await diasMinimizacaoExMembro(pool);
    let minimizadas = 0;
    let canceladas = 0;
    let semConfirmacao = 0;

    for (const c of candidatas) {
      if (!Number(c.ConfirmadaPeloMembro)) { semConfirmacao++; continue; }   // sem a confirmação do próprio membro não há desligamento a processar
      const dias = estatuto.diasDesde(c.dataReferencia);
      if (c.dataAdmissao && c.dataReferencia && c.dataAdmissao > c.dataReferencia) {
        await pool.request().input("id", sql.Int, c.CartaId)
          .query(`UPDATE CartasTransito SET Status = 'CANCELADA' WHERE CartaId = @id`);
        await registrarAuditoria({
          tabela: "CartasTransito", registroId: Number(c.CartaId), acao: "Cancelou carta por retorno do membro (processamento)", usuarioId: usuario.membroId,
          dadosDepois: { status: "CANCELADA", membroId: c.MembroId }
        });
        canceladas++;
      } else if (dias !== null && dias >= diasMinimizacao) {
        // A carta concluída, a minimização (com a vacância) e a trilha numa transação só: ou tudo vale, ou nada muda e a carta volta no próximo processamento.
        // O estado da carta vai no WHERE (dois processamentos ao mesmo tempo: só um minimiza); a trava da escada põe em fila com a cerimônia da mesma pessoa.
        const documentos = await emTransacao(pool, async ({ rq, executor, transacao, desistir }) => {
          if (!(await obterTrava(rq, `escada_${c.MembroId}`))) { await desistir(); return null; }
          const concluiu = await rq().input("id", sql.Int, c.CartaId)
            .query(`UPDATE CartasTransito SET Status = 'CONCLUIDA' WHERE CartaId = @id AND Status IN ('CONFIRMADA','EMITIDA') AND DataConfirmacao IS NOT NULL AND DeclaracaoCiencia IS NOT NULL`);
          if (!((concluiu.rowsAffected && concluiu.rowsAffected[0]) || 0)) { await desistir(); return null; }
          // O membro sai mesmo sendo o último que administra os acessos (a saída é dele); a trilha registra, antes de a vacância encerrar o cargo.
          const ultimoAdministrador = travaPermissoes.ficariaSemAdministrador(await travaPermissoes.situacaoDoCargo(executor, sql, c.MembroId, hojeBrasilia()));
          const urls = await minimizarNaTransacao({ executor, transacao }, c.MembroId, { dataSaida: c.dataReferencia, motivo: c.MotivoSaida });
          // a licença por candidatura ainda aberta fecha junto (decisão de 25/11/2026)
          await licencaCandidatura.encerrarLicencaAberta(executor, sql, c.MembroId, "Encerrada pela carta de mudança.", hojeBrasilia());
          // Irreversível (contatos e vínculo territorial zerados): fica na trilha QUEM mandou processar e QUAL carta, sem repetir o dado minimizado.
          await registrarAuditoriaNaTransacao(transacao, {
            tabela: "MembroReferencia", registroId: Number(c.MembroId), acao: "Minimizou dados de ex-membro (Carta de Mudança, Art. 132 §2º)", usuarioId: usuario.membroId,
            dadosDepois: { cartaId: c.CartaId, diasDesdeOPedido: dias, ...(ultimoAdministrador ? { ultimoAdministrador: true } : {}) }
          });
          return urls;
        });
        if (documentos === null) continue;   // outra alteração em andamento, ou a carta já mudou: fica para o próximo processamento
        await excluirDocumentos(documentos);   // os arquivos, só depois do commit
        minimizadas++;
      }
    }

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        sucesso: true,
        mensagem: `✅ Processamento concluído: ${minimizadas} saída(s) minimizada(s), ${canceladas} carta(s) cancelada(s) por retorno.`
          + (semConfirmacao ? ` ${semConfirmacao} carta(s) de mudança sem a confirmação do próprio membro ficam fora do processamento: peça a ele que confirme no aplicativo, ou cancele a carta.` : "")
      }
    };
    return;
  }

  context.res = { status: 404, body: { sucesso: false, mensagem: "Ação não reconhecida. Use emitir, cancelar ou processar." } };
};
