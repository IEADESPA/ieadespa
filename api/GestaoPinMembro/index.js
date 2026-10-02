// GestaoPinMembro (fecho da v7.5) — a Secretaria gera um PIN PROVISÓRIO para o membro que não tem e-mail (ou perdeu o acesso a ele).
// POST /api/gestao/pin-membro -> { membroId }      (permissão "pessoas"; a congregação do membro precisa estar no escopo de quem gera)
//
// O PIN é aleatório, sem nenhum dos padrões fáceis, vale por 7 dias e o membro é obrigado a trocar por um dele ao entrar. Aparece UMA vez, na tela da
// Secretaria, que o entrega pessoalmente. Não vai para a auditoria, para o log nem para o e-mail; se o membro tem e-mail, é avisado de que a Secretaria
// gerou um PIN provisório (para estranhar se não foi ele quem pediu). Gerar um novo também desbloqueia a pessoa.
const { getPool, sql } = require("../shared/db");
const auth = require("../shared/auth");
const pinMembro = require("../shared/pinMembro");
const { registrarAuditoria } = require("../shared/auditoria");
const { enviarEmailNotificacao } = require("../shared/notificacaoEmail");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const membroId = auth.idDeRota(corpo.membroId);
  if (!membroId) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula do membro." } };
    return;
  }

  const pool = await getPool();
  const m = (await pool.request().input("id", sql.Int, membroId).query(`
    SELECT m.MembroId, m.Nome, m.Email, m.DataNascimento, c.Nome AS CongregacaoNome
    FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    WHERE m.MembroId = @id AND m.Status = 'ATIVO'`)).recordset[0];
  // Mesma resposta para quem não existe e para quem está fora do escopo: a recusa não diz quem tem cadastro.
  if (!m || !auth.estaNoEscopo(usuario, m.CongregacaoNome)) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
    return;
  }

  const pin = pinMembro.gerarPinProvisorio({ nascimento: m.DataNascimento, matricula: membroId });
  await pinMembro.gravarPin(pool, membroId, pin, { provisorioPor: usuario.membroId });
  await registrarAuditoria({ tabela: "MembroPins", registroId: membroId, acao: "PIN_PROVISORIO_GERADO", usuarioId: usuario.membroId, dadosDepois: { validadeDias: pinMembro.VALIDADE_PROVISORIO_DIAS } });

  let avisado = false;
  if (m.Email) {
    try {
      await enviarEmailNotificacao({
        email: m.Email,
        titulo: "A Secretaria gerou um PIN provisório para o seu acesso",
        mensagem: `Olá, ${m.Nome}. A Secretaria gerou um PIN provisório para você entrar no Meu Painel. Ele foi entregue a você pela Secretaria, vale por ${pinMembro.VALIDADE_PROVISORIO_DIAS} dias e você vai criar o seu próprio ao entrar. Se você não pediu isso, avise a Secretaria.`
      });
      avisado = true;
    } catch (e) { context.log.error("Falha ao avisar o membro do PIN provisório:", e.message); }
  }

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: { sucesso: true, pin, nome: m.Nome, validadeDias: pinMembro.VALIDADE_PROVISORIO_DIAS, avisadoPorEmail: avisado, mensagem: `PIN provisório de ${m.Nome}: entregue pessoalmente. Vale por ${pinMembro.VALIDADE_PROVISORIO_DIAS} dias, e o membro cria o próprio PIN ao entrar. Esta tela não mostra o PIN de novo.` }
  };
};
