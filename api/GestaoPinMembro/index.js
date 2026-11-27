// GestaoPinMembro (fecho da v7.5) — a Secretaria gera um PIN PROVISÓRIO para o membro que não tem e-mail (ou perdeu o acesso a ele).
// POST /api/gestao/pin-membro -> { membroId }      (permissão "pessoas"; o membro precisa estar no escopo de quem gera, pela regra de PESSOA:
//                                                    congregação e, para quem alcança só uma Extensão da Tenda, a mesma Extensão — escopoRotas.noEscopoDaPessoa)
//
// O PIN é aleatório, sem nenhum dos padrões fáceis, vale por 7 dias e o membro é obrigado a trocar por um dele ao entrar. Aparece UMA vez, na tela da
// Secretaria, que o entrega pessoalmente. Não vai para a auditoria, para o log nem para o e-mail; se o membro tem e-mail, é avisado de que a Secretaria
// gerou um PIN provisório (para estranhar se não foi ele quem pediu); a resposta só diz "avisado" quando o e-mail saiu. Gerar um novo também desbloqueia a pessoa.
const { getPool, sql } = require("../shared/db");
const auth = require("../shared/auth");
const { noEscopoDaPessoa } = require("../shared/escopoRotas");
const nivelDoCargo = require("../shared/nivelDoCargo");
const pinMembro = require("../shared/pinMembro");
const { registrarAuditoria, registrarAuditoriaNaTransacao } = require("../shared/auditoria");
const { emTransacao } = require("../shared/transacaoCurta");
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
    SELECT m.MembroId, m.Nome, m.Email, m.DataNascimento, c.Nome AS CongregacaoNome, e.Nome AS ExtensaoNome
    FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId
    WHERE m.MembroId = @id AND m.Status = 'ATIVO'`)).recordset[0];
  // Mesma resposta para quem não existe e para quem está fora do escopo: a recusa não diz quem tem cadastro.
  if (!m || !noEscopoDaPessoa(usuario, m.CongregacaoNome, m.ExtensaoNome || null)) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
    return;
  }
  // Quem tem cargo de liderança vigente: o PIN provisório abre a sessão de titular dele, e a regra é a do nível do cargo com a confirmação recente (25 e 26/11).
  if (!(await nivelDoCargo.conferirPinDeLideranca(pool, sql, req, context, usuario, membroId))) return;

  const pin = pinMembro.gerarPinProvisorio({ nascimento: m.DataNascimento, matricula: membroId });
  // O PIN novo, a queda das sessões abertas da pessoa (v7.6: se alguém entrou com o PIN antigo, sai) e a trilha de quem gerou numa transação só
  // (shared/transacaoCurta.js): se a trilha não grava, o PIN não muda e nenhum PIN é entregue (revisão de fora, 26/11/2026). O e-mail fica para depois do commit.
  const derrubadas = await emTransacao(pool, async ({ executor, transacao }) => {
    await pinMembro.gravarPinNaTransacao(executor, membroId, pin, { provisorioPor: usuario.membroId });
    const sessoes = await auth.revogarSessoesDoMembro(executor, sql, membroId);
    await registrarAuditoriaNaTransacao(transacao, { tabela: "MembroPins", registroId: membroId, acao: "PIN_PROVISORIO_GERADO", usuarioId: usuario.membroId, dadosDepois: { validadeDias: pinMembro.VALIDADE_PROVISORIO_DIAS, sessoesEncerradas: sessoes } });
    return sessoes;
  });

  // O aviso ao membro: enviarEmailNotificacao devolve false (sem lançar) quando o serviço não manda. "Avisado" só quando o envio deu certo; o aviso que não sai
  // fica dito na resposta e na trilha (sem o PIN e sem o endereço).
  let avisado = false, avisoEmailNaoSaiu = false;
  if (m.Email) {
    try {
      avisado = (await enviarEmailNotificacao({
        email: m.Email,
        titulo: "A Secretaria gerou um PIN provisório para o seu acesso",
        mensagem: `Olá, ${m.Nome}. A Secretaria gerou um PIN provisório para você entrar no Meu Painel. Ele foi entregue a você pela Secretaria, vale por ${pinMembro.VALIDADE_PROVISORIO_DIAS} dias e você vai criar o seu próprio ao entrar. Se você não pediu isso, avise a Secretaria.`
      })) === true;
    } catch (e) { context.log.error("Falha ao avisar o membro do PIN provisório:", e.message); }
    if (!avisado) {
      avisoEmailNaoSaiu = true;
      await registrarAuditoria({ tabela: "MembroPins", registroId: membroId, acao: "Aviso do PIN provisório não enviado", usuarioId: usuario.membroId });
    }
  }

  const mensagem = `PIN provisório de ${m.Nome}: entregue pessoalmente. Vale por ${pinMembro.VALIDADE_PROVISORIO_DIAS} dias, e o membro cria o próprio PIN ao entrar. Esta tela não mostra o PIN de novo.`
    + (avisoEmailNaoSaiu ? " Atenção: o aviso por e-mail não saiu; avise a pessoa por outro meio." : "");
  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: { sucesso: true, pin, nome: m.Nome, validadeDias: pinMembro.VALIDADE_PROVISORIO_DIAS, avisadoPorEmail: avisado, avisoEmailNaoSaiu, mensagem }
  };
};
