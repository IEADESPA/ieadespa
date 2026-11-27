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
// cancelada ("o relógio zerou", Reg. Art. 131 §4º, II). A readmissão e a situação são conferidas de novo dentro da transação de cada carta: quem já saiu
// do rol por outra causa (falecido, desligado por outro motivo) fica como está e a carta é cancelada (revisão de fora, 26/11/2026).
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
const { prazoMinimizacaoExMembro, minimizarNaTransacao, excluirDocumentos } = require("../shared/minimizacaoLgpd");
const { emTransacao } = require("../shared/transacaoCurta");
const licencaCandidatura = require("../shared/licencaCandidatura");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const { obterTrava } = require("../shared/financeiroSeguro");
const travaPermissoes = require("../shared/travaPermissoes");
const { filtrarPorEscopo, pessoaAlcancavel } = require("../shared/escopoRotas");

// as situações de quem já saiu do rol (as terminais da ficha, GestaoPessoas::STATUS_TERMINAIS): o "processar" não as troca pela saída por carta
const SAIU_DO_ROL = ["DESLIGADO", "FALECIDO"];

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

// "AAAA-MM-DD" + n dias, sem passar pelo fuso do servidor (as Functions rodam em UTC; o dia de partida já é o de Brasília).
function somarDias(diaISO, n) {
  const d = new Date(`${diaISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const MSG_CANCELAR_NAO = "Carta não encontrada, já concluída ou já cancelada.";
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
    const hoje = hojeBrasilia();   // a emissão e a validade pelo dia de Brasília (das 21h à meia-noite o servidor, em UTC, já está no dia seguinte)
    const validade = carta.Tipo === "RECOMENDACAO" ? somarDias(hoje, 30) : null;
    // Só emite quem ainda a encontra CONFIRMADA (ou SOLICITADA, fora a Mudança): duas emissões ao mesmo tempo não se atropelam, e a regra da Mudança vale também aqui.
    // O ato e a trilha numa transação só: a carta nunca fica emitida sem o registro de quem emitiu.
    const emitiu = await emTransacao(pool, async ({ rq, transacao, desistir }) => {
      const upd = await rq()
        .input("id", sql.Int, cartaId)
        .input("hoje", sql.Date, hoje)
        .input("validade", sql.Date, validade)
        .input("emitidoPor", sql.Int, usuario.membroId)
        .query(`UPDATE CartasTransito SET Status = 'EMITIDA', DataEmissao = @hoje, DataValidade = @validade, EmitidoPor = @emitidoPor WHERE CartaId = @id AND (Status = 'CONFIRMADA' OR (Status = 'SOLICITADA' AND Tipo <> 'MUDANCA'))`);
      if (!((upd.rowsAffected && upd.rowsAffected[0]) || 0)) { await desistir(); return false; }
      await registrarAuditoriaNaTransacao(transacao, { tabela: "CartasTransito", registroId: Number(cartaId), acao: "Emitiu carta", usuarioId: usuario.membroId, dadosDepois: { status: "EMITIDA", validade } });
      return true;
    });
    if (!emitiu) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Carta não pode ser emitida (o status mudou)." } };
      return;
    }
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
      context.res = { status: 200, body: { sucesso: false, mensagem: MSG_CANCELAR_NAO } };
      return;
    }
    // A carta já cancelada não é cancelada de novo (nem ganha outra linha na trilha); o ato e a trilha numa transação só.
    const cancelou = await emTransacao(pool, async ({ rq, transacao, desistir }) => {
      const upd = await rq().input("id", sql.Int, cartaId)
        .query(`UPDATE CartasTransito SET Status = 'CANCELADA' WHERE CartaId = @id AND Status NOT IN ('CONCLUIDA','CANCELADA')`);
      if (!((upd.rowsAffected && upd.rowsAffected[0]) || 0)) { await desistir(); return false; }
      await registrarAuditoriaNaTransacao(transacao, { tabela: "CartasTransito", registroId: Number(cartaId), acao: "Cancelou carta", usuarioId: usuario.membroId });
      return true;
    });
    if (!cancelou) {
      context.res = { status: 200, body: { sucesso: false, mensagem: MSG_CANCELAR_NAO } };
      return;
    }
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
    const prazo = await prazoMinimizacaoExMembro(pool);   // o da política de retenção ou, sem ela ativa e com prazo, o padrão de 30 dias (dito na resposta)
    const diasMinimizacao = prazo.dias;
    let minimizadas = 0;
    let canceladas = 0;
    let semConfirmacao = 0;
    let jaSaiuDoRol = 0;
    let arquivosNaoApagados = 0;

    for (const c of candidatas) {
      if (!Number(c.ConfirmadaPeloMembro)) { semConfirmacao++; continue; }   // sem a confirmação do próprio membro não há desligamento a processar
      const dias = estatuto.diasDesde(c.dataReferencia);
      if (c.dataAdmissao && c.dataReferencia && c.dataAdmissao > c.dataReferencia) {
        // O cancelamento e a trilha numa transação; só cancela a carta ainda pendente (dois processamentos ao mesmo tempo: só um cancela e só um registra).
        const cancelou = await emTransacao(pool, async ({ rq, transacao, desistir }) => {
          const upd = await rq().input("id", sql.Int, c.CartaId)
            .query(`UPDATE CartasTransito SET Status = 'CANCELADA' WHERE CartaId = @id AND Status IN ('CONFIRMADA','EMITIDA')`);
          if (!((upd.rowsAffected && upd.rowsAffected[0]) || 0)) { await desistir(); return false; }
          await registrarAuditoriaNaTransacao(transacao, {
            tabela: "CartasTransito", registroId: Number(c.CartaId), acao: "Cancelou carta por retorno do membro (processamento)", usuarioId: usuario.membroId,
            dadosDepois: { status: "CANCELADA", membroId: c.MembroId }
          });
          return true;
        });
        if (cancelou) canceladas++;
      } else if (dias !== null && dias >= diasMinimizacao) {
        // A carta concluída, a minimização (com a vacância) e a trilha numa transação só: ou tudo vale, ou nada muda e a carta volta no próximo processamento.
        // O estado da carta vai no WHERE (dois processamentos ao mesmo tempo: só um minimiza); a trava da escada põe em fila com a cerimônia da mesma pessoa.
        const desfecho = await emTransacao(pool, async ({ rq, executor, transacao, desistir }) => {
          if (!(await obterTrava(rq, `escada_${c.MembroId}`))) { await desistir(); return null; }
          // A pessoa como está AGORA, com a linha travada até o commit (a ficha que grava a readmissão ou o falecimento espera esta transação): a leitura de
          // antes do laço pode ter ficado velha (revisão de fora, 26/11/2026).
          const atual = (await rq().input("m", sql.Int, c.MembroId).query(`SELECT Status, MotivoSaida, CONVERT(varchar(10), DataAdmissao, 120) AS DataAdmissao,
              CONVERT(varchar(10), DataSaida, 120) AS DataSaida FROM MembroReferencia WITH (UPDLOCK, HOLDLOCK) WHERE MembroId = @m`)).recordset[0];
          if (!atual) { await desistir(); return null; }
          const readmitido = atual.DataAdmissao && c.dataReferencia && atual.DataAdmissao > c.dataReferencia;
          // quem já saiu do rol por outra causa (o falecimento, a exclusão gravada na ficha...) fica como está: a carta perdeu o objeto
          const saiuPorOutraCausa = SAIU_DO_ROL.includes(atual.Status) && atual.MotivoSaida !== "CARTA_MUDANCA";
          if (readmitido || saiuPorOutraCausa) {
            const cancelou = await rq().input("id", sql.Int, c.CartaId).query(`UPDATE CartasTransito SET Status = 'CANCELADA' WHERE CartaId = @id AND Status IN ('CONFIRMADA','EMITIDA')`);
            if (!((cancelou.rowsAffected && cancelou.rowsAffected[0]) || 0)) { await desistir(); return null; }
            await registrarAuditoriaNaTransacao(transacao, readmitido
              ? { tabela: "CartasTransito", registroId: Number(c.CartaId), acao: "Cancelou carta por retorno do membro (processamento)", usuarioId: usuario.membroId,
                dadosDepois: { status: "CANCELADA", membroId: c.MembroId } }
              : { tabela: "CartasTransito", registroId: Number(c.CartaId), acao: "Cancelou carta: a pessoa já saiu do rol por outra causa (processamento)", usuarioId: usuario.membroId,
                dadosDepois: { status: "CANCELADA", membroId: c.MembroId, situacaoNoRol: atual.Status } });
            return { tipo: readmitido ? "RETORNO" : "JA_SAIU" };
          }
          const concluiu = await rq().input("id", sql.Int, c.CartaId)
            .query(`UPDATE CartasTransito SET Status = 'CONCLUIDA' WHERE CartaId = @id AND Status IN ('CONFIRMADA','EMITIDA') AND DataConfirmacao IS NOT NULL AND DeclaracaoCiencia IS NOT NULL`);
          if (!((concluiu.rowsAffected && concluiu.rowsAffected[0]) || 0)) { await desistir(); return null; }
          // O membro sai mesmo sendo o último que administra os acessos (a saída é dele); a trilha registra, antes de a vacância encerrar o cargo.
          const ultimoAdministrador = travaPermissoes.ficariaSemAdministrador(await travaPermissoes.situacaoDoCargo(executor, sql, c.MembroId, hojeBrasilia()));
          // A causa da saída é a da lista (CARTA_MUDANCA), a que a ficha e a vacância entendem; o motivo que o membro escreveu continua na carta. A saída por
          // carta já gravada na ficha mantém a data dela.
          const dataSaida = (atual.Status === "DESLIGADO" && atual.DataSaida) || c.dataReferencia;
          const urls = await minimizarNaTransacao({ executor, transacao }, c.MembroId, { dataSaida, motivo: "CARTA_MUDANCA" });
          // a licença por candidatura ainda aberta fecha junto (decisão de 25/11/2026)
          await licencaCandidatura.encerrarLicencaAberta(executor, sql, c.MembroId, "Encerrada pela carta de mudança.", hojeBrasilia());
          // Irreversível (contatos e vínculo territorial zerados): fica na trilha QUEM mandou processar e QUAL carta, sem repetir o dado minimizado.
          await registrarAuditoriaNaTransacao(transacao, {
            tabela: "MembroReferencia", registroId: Number(c.MembroId), acao: "Minimizou dados de ex-membro (Carta de Mudança, Art. 132 §2º)", usuarioId: usuario.membroId,
            dadosDepois: { cartaId: c.CartaId, diasDesdeOPedido: dias, prazoDias: diasMinimizacao, ...(prazo.padrao ? { prazoPadrao: true } : {}), ...(ultimoAdministrador ? { ultimoAdministrador: true } : {}) }
          });
          return { tipo: "MINIMIZOU", urls };
        });
        if (desfecho === null) continue;   // outra alteração em andamento, ou a carta já mudou: fica para o próximo processamento
        if (desfecho.tipo === "RETORNO") { canceladas++; continue; }
        if (desfecho.tipo === "JA_SAIU") { jaSaiuDoRol++; continue; }
        const naoApagados = await excluirDocumentos(desfecho.urls);   // os arquivos, só depois do commit
        if (naoApagados.length) {
          // O banco já não tem o endereço: a trilha guarda quais arquivos ficaram para apagar à mão (o nome do arquivo é aleatório, sem dado de pessoa).
          arquivosNaoApagados += naoApagados.length;
          await registrarAuditoria({
            tabela: "MembroReferencia", registroId: Number(c.MembroId), acao: "Arquivos da minimização não apagados do armazenamento", usuarioId: usuario.membroId,
            dadosDepois: { cartaId: c.CartaId, arquivos: naoApagados.map((u) => String(u).split("/").pop()) }
          });
        }
        minimizadas++;
      }
    }

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        sucesso: true,
        mensagem: `✅ Processamento concluído: ${minimizadas} saída(s) minimizada(s), ${canceladas} carta(s) cancelada(s) por retorno`
          + (prazo.padrao ? ` (prazo padrão de ${diasMinimizacao} dias: a política de retenção dos ex-membros está inativa ou sem prazo).` : ` (prazo de ${diasMinimizacao} dias, da política de retenção).`)
          + (jaSaiuDoRol ? ` ${jaSaiuDoRol} carta(s) cancelada(s) porque a pessoa já tinha saído do rol por outra causa (falecimento ou desligamento): a ficha dela não mudou.` : "")
          + (arquivosNaoApagados ? ` ${arquivosNaoApagados} arquivo(s) de documentos não puderam ser apagados do armazenamento agora: a trilha guarda quais.` : "")
          + (semConfirmacao ? ` ${semConfirmacao} carta(s) de mudança sem a confirmação do próprio membro ficam fora do processamento: peça a ele que confirme no aplicativo, ou cancele a carta.` : "")
      }
    };
    return;
  }

  context.res = { status: 404, body: { sucesso: false, mensagem: "Ação não reconhecida. Use emitir, cancelar ou processar." } };
};
