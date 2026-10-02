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
// As colunas que a tela de exportação oferece (COLUNAS_EXPORT_PESSOAS em app/script.js). O texto da trilha de auditoria nunca carrega texto livre do cliente.
const COLUNAS_VALIDAS = [
  "membroId", "nome", "idade", "categoria", "formaAdmissao", "funcao", "cargoMinisterial", "congregacao",
  "status", "situacaoMembro", "telefone", "email", "endereco", "dataNascimento", "dataAdmissao"
];
const MAX_QUANTIDADE = 1000000;
const LIMITE_ACAO_AUDITORIA = 100; // AuditLog.Acao é NVARCHAR(100): texto maior fazia a gravação da trilha falhar em silêncio

// ESCOPO: esta rota só valida e audita; os dados da planilha vêm de GET /api/pessoas, que já entrega só o escopo de quem exporta.
module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const { colunas: colunasBrutas, quantidade: quantidadeBruta } = req.body || {};
  if (!Array.isArray(colunasBrutas) || colunasBrutas.length === 0 || colunasBrutas.length > COLUNAS_VALIDAS.length * 2) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe ao menos uma coluna." } };
    return;
  }
  if (!colunasBrutas.every((c) => typeof c === "string" && COLUNAS_VALIDAS.includes(c))) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Coluna desconhecida na exportação." } };
    return;
  }
  const colunas = [...new Set(colunasBrutas)];
  const quantidade = Number.isInteger(quantidadeBruta) && quantidadeBruta >= 0 && quantidadeBruta <= MAX_QUANTIDADE ? quantidadeBruta : null;

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
    acao: `Exportou rol de membros (${quantidade != null ? quantidade : "?"} linha(s), colunas: ${colunas.join(", ")})`.slice(0, LIMITE_ACAO_AUDITORIA),
    // A lista completa de colunas fica no corpo da trilha (sem o limite de 100 caracteres do título).
    dadosDepois: { quantidade, colunas }
  });

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Exportação registrada." } };
};
