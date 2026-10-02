// SolicitarCodigoAcessoMembro (vB.5 — Login simplificado pro membro comum)
// Passo 1 do login sem senha do "Meu Painel": manda um código de 6 dígitos
// pro e-mail já cadastrado da matrícula. Resposta sempre genérica (nunca
// diz se a matrícula existe ou se tem e-mail) — matrícula é um número
// sequencial adivinhável, então uma resposta diferente por caso vazaria
// quem tem conta.
// POST /api/membro/solicitar-codigo -> { matricula }
const { getPool, sql } = require("../shared/db");
const { gerarCodigo, podeSolicitarCodigo, registrarCodigo } = require("../shared/codigoAcesso");
const { enviarEmailNotificacao } = require("../shared/notificacaoEmail");
const auth = require("../shared/auth");
const { criarLimitador, chaveDeOrigem } = require("../shared/limiteTaxa");

// fecho da v7.5 — além do teto por matrícula (shared/codigoAcesso.js), contenção por origem (por instância): a rota é anônima e manda e-mail.
const limitador = criarLimitador({ janelaMs: 60000, maximo: 60 });

const MENSAGEM_GENERICA = "Se a matrícula existir e tiver e-mail cadastrado, um código foi enviado.";

module.exports = async function (context, req) {
  const limite = limitador.registrar(chaveDeOrigem(req));
  if (!limite.permitido) {
    context.res = { status: 429, headers: { "Retry-After": String(limite.retryAposSegundos) }, body: { sucesso: false, mensagem: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo." } };
    return;
  }
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const matricula = auth.idDeRota(corpo.matricula);          // "0x10", "1e1", lista, número gigante: 400, nunca 500
  if (!matricula) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula." } };
    return;
  }
  const pool = await getPool();
  const membro = (await pool.request().input("id", sql.Int, matricula).query(
    `SELECT MembroId, Nome, Email FROM MembroReferencia WHERE MembroId = @id AND Status = 'ATIVO'`
  )).recordset[0];

  if (membro && membro.Email) {
    const cooldown = await podeSolicitarCodigo(pool, membro.MembroId);
    if (cooldown.podeEnviar) {
      const codigo = gerarCodigo();
      await registrarCodigo(pool, membro.MembroId, codigo);
      await enviarEmailNotificacao({
        email: membro.Email,
        titulo: `Seu código de acesso: ${codigo}`,
        mensagem: `Olá, ${membro.Nome}. Seu código de acesso ao Meu Painel é ${codigo} — vale por 10 minutos, não compartilhe com ninguém.`
      });
    }
    // Cooldown ativo não é erro pro usuário: ele já tem um código válido na
    // caixa de entrada, a mensagem genérica continua correta.
  }

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: MENSAGEM_GENERICA } };
};
