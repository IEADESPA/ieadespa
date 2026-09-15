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

const MENSAGEM_GENERICA = "Se a matrícula existir e tiver e-mail cadastrado, um código foi enviado.";

module.exports = async function (context, req) {
  const matricula = Number((req.body || {}).matricula);
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
