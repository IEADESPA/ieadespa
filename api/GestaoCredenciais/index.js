// GestaoCredenciais (v8.4 — Credencial digital com QR Code; Regimento Art. 76)
// A Secretaria Geral (nível geral da permissão "pessoas") emite, emite em lote, emite nova via, cancela, gera o PDF para impressão e registra a impressão — a congregação
// não emite nem imprime (Art. 76 §2º, anti-fraude). A pessoa vê a própria credencial no Meu Painel, baixa o PDF e pede a impressão.
//  GET  (sem ação) [?busca=]     (geral pessoas) a lista: pedidos de impressão e as mais recentes, ou as que batem com a busca (nome ou matrícula); e quantos ainda não têm
//  GET  minha                   (login)         a própria credencial, com a situação de agora e a foto do cadastro
//  GET  qr?membroId=            (titular ou geral pessoas) o QR em SVG
//  GET  pdf?membroId=           (titular ou geral pessoas) o cartão em PDF (tamanho de cartão de crédito)
//  POST emitir {membroId} | lote | nova-via {membroId, motivo} | cancelar {membroId, motivo} | impressa {credencialId}   (geral pessoas)
//  POST pedir-impressao         (login)         a própria
// Matrícula malformada, inexistente ou sem credencial: 404 igual.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const { exigirGeral, ehGeral } = require("../shared/escopoRotas");
const regra = require("../shared/credencial");
const db = require("../shared/credencialDb");
const storage = require("../shared/storage");
const { gerarMatriz, matrizParaSvg } = require("../shared/certificadoQr");
const { pdfDaCredencial } = require("../shared/pdfCredencial");

function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, resultado, statusOk = 200) {
  if (!resultado || resultado.naoExiste) return erro(context, 404, "Matrícula não encontrada.");
  const status = resultado.sucesso ? statusOk : resultado.mudou ? 409 : 422;
  const { naoExiste, mudou, ...corpo } = resultado;
  context.res = { status, body: corpo };
}
// O dono da credencial pedida: a própria pessoa, ou (só para o nível geral de "pessoas") a matrícula informada. null = recusado (a resposta já foi escrita).
function alvoDaLeitura(req, context, usuario) {
  const pedido = (req.query || {}).membroId;
  if (pedido === undefined || pedido === "" || Number(pedido) === Number(usuario.membroId)) return Number(usuario.membroId);
  const visao = auth.visaoDaPermissao(usuario, "pessoas");
  if (!visao || !ehGeral(visao)) { erro(context, 403, "Só a Secretaria Geral vê a credencial de outra pessoa."); return null; }
  const id = auth.idDeRota(pedido);
  if (!id) { erro(context, 404, "Credencial não encontrada."); return null; }
  return id;
}

module.exports = async function (context, req) {
  const acao = String((context.bindingData && context.bindingData.acao) || "");
  const metodo = String(req.method || "GET").toUpperCase();
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};

  // ---- a própria pessoa (e a Secretaria Geral, para qualquer matrícula) ----
  if (metodo === "GET" && ["minha", "qr", "pdf"].includes(acao)) {
    const usuario = auth.exigirLogin(req, context);
    if (!usuario) return;
    const pool = await getPool();
    if (acao === "minha") {
      context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: await db.minha(pool, usuario.membroId, storage.urlComSas) };
      return;
    }
    const membroId = alvoDaLeitura(req, context, usuario);
    if (!membroId) return;
    const c = await db.dadosDoCartao(pool, membroId);
    if (!c) return erro(context, 404, "Credencial não encontrada.");
    if (acao === "qr") {
      context.res = { status: 200, headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, no-store" }, body: matrizParaSvg(gerarMatriz(c.url)) };
      return;
    }
    // só a foto que está no cadastro: a que foi tirada (consentimento revogado) não volta pelo arquivo que sobrou no armazenamento
    const buffer = await pdfDaCredencial(c, c.fotoUrlCrua ? await storage.lerFoto(membroId) : null);
    context.res = { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="credencial-${membroId}-via${c.via}.pdf"`, "Cache-Control": "no-store" }, body: buffer, isRaw: true };
    return;
  }
  if (metodo === "POST" && acao === "pedir-impressao") {
    const usuario = auth.exigirLogin(req, context);
    if (!usuario) return;
    return resposta(context, await db.pedirImpressao(await getPool(), { membroId: usuario.membroId }));
  }

  // ---- Secretaria Geral ----
  const usuario = exigirGeral(req, context, "pessoas");
  if (!usuario) return;
  const pool = await getPool();
  const por = usuario.membroId;
  if (metodo === "GET" && !acao) {
    context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { sucesso: true, ...(await db.listar(pool, { busca: (req.query || {}).busca })) } };
    return;
  }
  if (metodo !== "POST") return erro(context, 404, "Ação inválida.");
  if (acao === "lote") return resposta(context, await db.emitirEmLote(pool, { por }));
  if (acao === "impressa") {
    const credencialId = auth.idDeRota(corpo.credencialId);
    if (!credencialId) return erro(context, 404, "Credencial não encontrada.");
    return resposta(context, await db.registrarImpressao(pool, { credencialId, por }));
  }
  if (!["emitir", "nova-via", "cancelar"].includes(acao)) return erro(context, 404, "Ação inválida.");
  const membroId = auth.idDeRota(corpo.membroId);
  if (!membroId) return erro(context, 404, "Matrícula não encontrada.");
  if (acao === "emitir") return resposta(context, await db.emitir(pool, { membroId, por }), 201);
  const m = regra.validarMotivo(corpo.motivo);
  if (!m.valido) return erro(context, 400, m.mensagem);
  if (acao === "nova-via") return resposta(context, await db.novaVia(pool, { membroId, motivo: m.texto, por }), 201);
  return resposta(context, await db.cancelar(pool, { membroId, motivo: m.texto, por }));
};
