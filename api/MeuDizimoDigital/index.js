// MeuDizimoDigital (FASE 10, Financeiro, incremento 4, 27/11/2026) — O DÍZIMO DIGITAL, o lado do membro (migração 206; regra em
// shared/finDizimoDigital.js, consultas em shared/finDizimoDigitalDb.js). Tela aprovada: rodada 22, "r22-dizimo-digital", opção 1, no nível
// "membro" (o r20 "Meus dízimos" na Minha vida na igreja: informar o Pix e os 3 passos de cada um).
//  GET  meu-dizimo-digital/{matricula}                 os Pix do próprio membro (os 50 mais novos), com os passos e o número do recibo de papel
//  POST meu-dizimo-digital/{matricula} {valor, pixEm}  informa um Pix (o valor e o dia e a hora); quem deu e a congregação vêm da sessão e do cadastro
// Autoatendimento: a matrícula da rota tem de ser a da sessão (exigirTitular: 401 sem sessão, 400 malformada, 403 de outra pessoa, exista ou não).
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const db = require("../shared/finDizimoDigitalDb");

const SEM_CACHE = { "Cache-Control": "no-store" };

module.exports = async function (context, req) {
  const usuario = auth.exigirTitular(req, context, context.bindingData && context.bindingData.matricula);
  if (!usuario) return;
  const membroId = Number(usuario.membroId);
  const metodo = String(req.method || "GET").toUpperCase();
  if (metodo === "GET") {
    context.res = { status: 200, headers: SEM_CACHE, body: await db.meus(await getPool(), { membroId }) };
    return;
  }
  if (metodo === "POST") {
    const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const r = await db.informar(await getPool(), { membroId, dados: corpo });
    context.res = { status: r.sucesso ? 201 : 422, headers: SEM_CACHE, body: r };
    return;
  }
  context.res = { status: 404, headers: SEM_CACHE, body: { sucesso: false, mensagem: "Ação inválida." } };
};
