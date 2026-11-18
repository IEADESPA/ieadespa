// SolicitarEdicaoPessoa (v1.11 — autoatendimento por matrícula)
// A SUGESTÃO do membro: o que ele não muda sozinho (o que já está preenchido e os atos da igreja — admissão, batismo, rito, procedência — e o nome) ele propõe, e a
// secretaria confere campo a campo na CAIXA DE SUGESTÕES (GestaoFilaAprovacoes) antes de valer na ficha. FASE 10, v10.1b passo 5 (18/11/2026): os campos e a
// conferência vêm de shared/edicaoFicha.js (os mesmos da edição campo a campo); UMA sugestão pendente por campo; o membro vê a resposta (o motivo da recusa).
// GET  /api/solicitacoes-edicao/{matricula} -> os próprios pedidos (com os campos aninhados, a situação e o motivo da recusa)
// POST /api/solicitacoes-edicao/{matricula} -> body: { campos: { nome?, dataNascimento?, dataAdmissao?, ... } }
const { getPool } = require("../shared/db");
const auth = require("../shared/auth");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const edicaoFichaDb = require("../shared/edicaoFichaDb");

module.exports = async function (context, req) {
  // fecho da v7.5 — exige sessão e só a matrícula da própria sessão (antes qualquer um propunha mudar a data de nascimento de qualquer pessoa).
  const matricula = context.bindingData.matricula;
  if (!auth.exigirTitular(req, context, matricula)) return;
  const pool = await getPool();

  if (req.method === "GET") {
    context.res = { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: await edicaoFichaDb.minhasSugestoes(pool, Number(matricula)) };
    return;
  }

  if (req.method === "POST") {
    const bruto = req.body && typeof req.body === "object" ? req.body.campos : null;
    const campos = {};
    // o que veio vazio não é sugestão (a tela antiga manda só o que foi preenchido)
    if (bruto && typeof bruto === "object" && !Array.isArray(bruto)) {
      for (const [k, v] of Object.entries(bruto)) if (v !== null && v !== undefined && String(v).trim() !== "") campos[k] = v;
    }
    const r = await edicaoFichaDb.sugerir(pool, { membroId: Number(matricula), campos, hoje: hojeBrasilia() });
    const { status, ...corpo } = r;
    context.res = { status: status || 200, headers: { "Content-Type": "application/json" }, body: corpo };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método não suportado." } };
};
