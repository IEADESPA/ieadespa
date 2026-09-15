// ExportarPessoas (vB.8 — LGPD: bloqueio técnico de compartilhamento externo)
// Achado real: a exportação do rol de membros (v1.8) era 100% client-side —
// nenhuma chamada ao servidor, então NENHUMA trilha de auditoria e NENHUMA
// restrição além da permissão "pessoas" já existente. Esta rota vira porta
// de entrada obrigatória antes de gerar a planilha (app/script.js chama
// aqui antes de montar o .xlsx com os dados que já tinha em memória — não
// reconsulta o banco, só valida e registra): colunas sensíveis em massa
// (telefone, e-mail, endereço, data de nascimento) exigem nível Global; e
// toda exportação fica registrada em AuditLog (quem, quando, quantas
// linhas, quais colunas) — antes disso, um rol inteiro podia sair da
// Secretaria sem deixar rastro nenhum.
// POST /api/pessoas/exportar -> { colunas: string[], quantidade?: number }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");

const COLUNAS_SENSIVEIS = ["telefone", "email", "endereco", "dataNascimento"];

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const { colunas, quantidade } = req.body || {};
  if (!Array.isArray(colunas) || colunas.length === 0) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe ao menos uma coluna." } };
    return;
  }

  const colunasSensiveisPedidas = colunas.filter((c) => COLUNAS_SENSIVEIS.includes(c));
  if (colunasSensiveisPedidas.length > 0 && usuario.nivel !== "GLOBAL") {
    context.res = {
      status: 403,
      body: { sucesso: false, mensagem: `Exportar em massa ${colunasSensiveisPedidas.join(", ")} é restrito a nível Global. Peça pra alguém com esse nível, ou remova essas colunas.` }
    };
    return;
  }

  // registroId=0: não é sobre UM MembroReferencia específico, é uma ação em
  // massa sobre a tabela inteira — sem FK em AuditLog.RegistroId, 0 é um
  // sentinel válido e já documentado aqui, não um id real de ninguém.
  await registrarAuditoria({
    tabela: "MembroReferencia", registroId: 0, usuarioId: usuario.membroId,
    acao: `Exportou rol de membros (${quantidade != null ? quantidade : "?"} linha(s), colunas: ${colunas.join(", ")})`
  });

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Exportação registrada." } };
};
