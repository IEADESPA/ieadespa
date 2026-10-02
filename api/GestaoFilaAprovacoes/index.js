// GestaoFilaAprovacoes (v1.11 — staff, permissão "pessoas")
// Fila de decisão dos pedidos de edição que exigem aprovação (ver
// shared/camposEdicaoPessoa.js) — uma solicitação pode ter vários campos, cada
// um decidido separadamente (aprovar um, rejeitar outro) ou todos de uma vez.
// GET  /api/fila-aprovacoes                         -> solicitações pendentes (com campos aninhados)
// POST /api/fila-aprovacoes/{solicitacaoId}/decidir -> body: { decisoes: [{ campoId, decisao: 'APROVADO'|'REJEITADO' }] }
//
// ESCOPO: o pedido é sobre a ficha de uma PESSOA — só entra na fila (e só se decide) o pedido de quem está na congregação que o decisor alcança (shared/escopoRotas.js); fora
// do escopo vale a resposta de "não existe". Ninguém decide o PRÓPRIO pedido (quem propõe não aprova): o pedido do próprio usuário nem aparece na fila.
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { registrarAuditoria } = require("../shared/auditoria");
const { CAMPOS_APROVACAO } = require("../shared/camposEdicaoPessoa");
const { filtrarPorEscopo, pessoaAlcancavel } = require("../shared/escopoRotas");
const { dataISOValida } = require("../shared/escopoFichas");

const MAX_DECISOES = 50;

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const solicitacaoIdBruto = context.bindingData.solicitacaoId;
  const solicitacaoId = auth.idDeRota(solicitacaoIdBruto);
  const acao = context.bindingData.acao;
  const pool = await getPool();

  // ---- GET: listar solicitações pendentes (só do escopo, e não as do próprio usuário) ----
  if (req.method === "GET" && !solicitacaoIdBruto) {
    const result = await pool.request().query(`
      SELECT s.SolicitacaoId AS solicitacaoId, s.MembroId AS membroId, m.Nome AS nome,
             CONVERT(varchar(33), s.DataSolicitacao, 126) AS dataSolicitacao, s.Status AS status,
             c.CampoId AS campoId, c.NomeCampo AS nomeCampo, c.ValorAnterior AS valorAnterior,
             c.ValorProposto AS valorProposto, c.Status AS statusCampo,
             cg.Nome AS congregacaoNome, ex.Nome AS extensaoNome
      FROM SolicitacoesEdicaoPessoa s
      JOIN MembroReferencia m ON m.MembroId = s.MembroId
      JOIN SolicitacoesEdicaoCampos c ON c.SolicitacaoId = s.SolicitacaoId
      LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
      LEFT JOIN ExtensoesTenda ex ON ex.ExtensaoId = m.ExtensaoId
      WHERE s.Status = 'PENDENTE'
      ORDER BY s.DataSolicitacao ASC, c.CampoId`);

    const porSolicitacao = {};
    filtrarPorEscopo(usuario, result.recordset, r => r.congregacaoNome, r => r.extensaoNome)
      .filter(r => Number(r.membroId) !== Number(usuario.membroId))
      .forEach(r => {
        if (!porSolicitacao[r.solicitacaoId]) {
          porSolicitacao[r.solicitacaoId] = {
            solicitacaoId: r.solicitacaoId, membroId: r.membroId, nome: r.nome,
            dataSolicitacao: r.dataSolicitacao, status: r.status, campos: []
          };
        }
        porSolicitacao[r.solicitacaoId].campos.push({
          campoId: r.campoId,
          nomeCampo: r.nomeCampo,
          rotulo: (Object.prototype.hasOwnProperty.call(CAMPOS_APROVACAO, r.nomeCampo) && CAMPOS_APROVACAO[r.nomeCampo].rotulo) || r.nomeCampo,
          valorAnterior: r.valorAnterior,
          valorProposto: r.valorProposto,
          status: r.statusCampo
        });
      });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: Object.values(porSolicitacao) };
    return;
  }

  // ---- POST /{solicitacaoId}/decidir: aprova/rejeita campo a campo ----
  if (req.method === "POST" && solicitacaoIdBruto && acao === "decidir") {
    const decisoes = (req.body || {}).decisoes;
    if (!Array.isArray(decisoes) || decisoes.length === 0 || decisoes.length > MAX_DECISOES) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Envie de 1 a ${MAX_DECISOES} decisões { campoId, decisao }.` } };
      return;
    }

    const solicitacao = solicitacaoId
      ? await pool.request().input("id", sql.Int, solicitacaoId).query(`SELECT SolicitacaoId, MembroId, Status FROM SolicitacoesEdicaoPessoa WHERE SolicitacaoId = @id`)
      : { recordset: [] };
    // Pedido inexistente e pedido de pessoa fora do escopo têm a MESMA resposta.
    const dono = solicitacao.recordset.length ? await pessoaAlcancavel(pool, usuario, solicitacao.recordset[0].MembroId) : null;
    if (!dono) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Solicitação não encontrada." } };
      return;
    }
    const membroId = solicitacao.recordset[0].MembroId;
    if (Number(membroId) === Number(usuario.membroId)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Você não pode decidir o seu próprio pedido — peça a outra pessoa da Secretaria." } };
      return;
    }

    let aplicados = 0;
    let rejeitados = 0;
    for (const item of decisoes) {
      const campoId = item ? auth.idDeRota(item.campoId) : null;
      const decisao = item ? item.decisao : null;
      if (!campoId || !["APROVADO", "REJEITADO"].includes(decisao)) continue;

      const campo = await pool.request().input("id", sql.Int, campoId).input("sol", sql.Int, solicitacaoId)
        .query(`SELECT CampoId, NomeCampo, ValorAnterior, ValorProposto, Status FROM SolicitacoesEdicaoCampos WHERE CampoId = @id AND SolicitacaoId = @sol`);
      if (campo.recordset.length === 0 || campo.recordset[0].Status !== "PENDENTE") continue; // ignora campo de outra solicitação ou já decidido

      const { NomeCampo, ValorAnterior, ValorProposto } = campo.recordset[0];
      // Só campo do mapa fixo (chave PRÓPRIA — "constructor"/"toString" não são campos).
      const config = Object.prototype.hasOwnProperty.call(CAMPOS_APROVACAO, NomeCampo) ? CAMPOS_APROVACAO[NomeCampo] : null;
      // Aprovar algo que não dá para aplicar (campo fora do mapa, data inválida) vira rejeição: nunca fica "APROVADO" sem ter mudado a ficha.
      const aplicavel = decisao === "APROVADO" && !!config && (!config.tipoData || dataISOValida(ValorProposto));
      const decisaoFinal = aplicavel ? "APROVADO" : "REJEITADO";

      if (aplicavel) {
        const tipoSql = config.tipoData ? sql.Date : sql.NVarChar(300);
        await pool.request().input("id", sql.Int, membroId).input("valor", tipoSql, ValorProposto)
          .query(`UPDATE MembroReferencia SET ${config.coluna} = @valor WHERE MembroId = @id`);
        aplicados++;
      } else {
        rejeitados++;
      }

      await pool.request().input("id", sql.Int, campoId).input("status", sql.NVarChar(20), decisaoFinal).input("decididoPor", sql.Int, usuario.membroId)
        .query(`UPDATE SolicitacoesEdicaoCampos SET Status = @status, DecididoPor = @decididoPor, DataDecisao = SYSUTCDATETIME() WHERE CampoId = @id AND Status = 'PENDENTE'`);

      await registrarAuditoria({
        tabela: "MembroReferencia",
        registroId: Number(membroId),
        acao: decisaoFinal === "APROVADO" ? `Aprovou edição de ${config.rotulo}` : `Rejeitou edição de ${config ? config.rotulo : "campo desconhecido"}`,
        usuarioId: usuario.membroId,
        dadosAntes: { [NomeCampo]: ValorAnterior },
        dadosDepois: { [NomeCampo]: ValorProposto }
      });
    }

    // Se todos os campos da solicitação já foram decididos, encerra a solicitação.
    const pendentesRestantes = await pool.request().input("sol", sql.Int, solicitacaoId)
      .query(`SELECT COUNT(*) AS total FROM SolicitacoesEdicaoCampos WHERE SolicitacaoId = @sol AND Status = 'PENDENTE'`);
    if (pendentesRestantes.recordset[0].total === 0) {
      await pool.request().input("sol", sql.Int, solicitacaoId).query(`UPDATE SolicitacoesEdicaoPessoa SET Status = 'CONCLUIDA' WHERE SolicitacaoId = @sol`);
    }

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: `✅ ${aplicados} campo(s) aprovado(s), ${rejeitados} rejeitado(s).` }
    };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método/rota não suportado." } };
};
