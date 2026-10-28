// CerimoniasConsagracao (v8.3 — Consagração e documentação; Regimento Art. 10 e 75)
// A cerimônia de consagração: data, local, ocasião (AGO, Sessão Magna ou Solene da CLI), o valor da taxa daquele ano, a Comissão de Unção (no mínimo 4 pastores titulares
// em atividade), os candidatos (processos homologados), o roteiro, os diplomas para imprimir e o registro da presença. Tudo do nível geral de "consagracoes".
//  GET  (sem ação)                    a lista das cerimônias
//  GET  detalhe?cerimoniaId=          a cerimônia, a comissão, os candidatos, o roteiro e os homologados que ainda podem entrar (ou o resultado, se já foi registrada)
//  GET  diplomas?cerimoniaId=         PDF com os diplomas de quem está com a taxa em dia (o código de verificação fica reservado; vale depois do registro)
//  POST criar      {dataCerimonia, local, ocasiao, valorTaxa?}
//  POST editar     {cerimoniaId, dataCerimonia, local, ocasiao, valorTaxa}
//  POST cancelar   {cerimoniaId, motivo}
//  POST comissao   {cerimoniaId, membroIds:[...]}
//  POST incluir    {cerimoniaId, ids:[consagracaoId...]}
//  POST retirar    {cerimoniaId, consagracaoId}
//  POST registrar  {cerimoniaId, presentes:[...], ausentes:[...]}   (a lista inteira; no dia da cerimônia ou depois; ausente perde a consagração no ano — Art. 75, II, b)
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const { exigirGeral } = require("../shared/escopoRotas");
const regra = require("../shared/consagracao");
const db = require("../shared/consagracaoDb");
const afm = require("../shared/afm");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const { novoDocumento, gerarBuffer } = require("../shared/pdfInstitucional");
const { desenharDocumentoMinisterial } = require("../shared/pdfDocumentoMinisterial");

function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, resultado, statusOk = 200) {
  if (!resultado || resultado.naoExiste) return erro(context, 404, "Cerimônia não encontrada.");
  const status = resultado.sucesso ? statusOk : resultado.mudou ? 409 : 422;
  const { naoExiste, mudou, ...corpo } = resultado;
  context.res = { status, body: corpo };
}
const listaDeGuids = (v) => (Array.isArray(v) ? [...new Set(v.map((x) => String(x).toLowerCase()))] : null);

module.exports = async function (context, req) {
  const usuario = exigirGeral(req, context, "consagracoes");
  if (!usuario) return;
  const acao = String((context.bindingData && context.bindingData.acao) || "");
  const metodo = String(req.method || "GET").toUpperCase();
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const pool = await getPool();
  const por = usuario.membroId;

  if (metodo === "GET" && !acao) {
    context.res = { status: 200, body: { sucesso: true, itens: await db.listarCerimonias(pool), valorReferencia: regra.VALOR_TAXA_REFERENCIA, ocasioes: regra.OCASIOES } };
    return;
  }
  if (metodo === "GET" && (acao === "detalhe" || acao === "diplomas")) {
    const cerimoniaId = auth.idDeRota((req.query || {}).cerimoniaId);
    if (!cerimoniaId) return erro(context, 404, "Cerimônia não encontrada.");
    if (acao === "detalhe") {
      const d = await db.detalheCerimonia(pool, cerimoniaId);
      if (!d) return erro(context, 404, "Cerimônia não encontrada.");
      context.res = { status: 200, body: { sucesso: true, ...d } };
      return;
    }
    const r = await db.diplomasParaImprimir(pool, cerimoniaId);
    if (!r.sucesso) return resposta(context, r);
    const doc = novoDocumento({ titulo: `Diplomas — cerimônia de ${regra.br(r.cerimonia.dataCerimonia)}` });
    r.diplomas.forEach((d, i) => {
      if (i > 0) doc.addPage();
      desenharDocumentoMinisterial(doc, {
        natureza: "DIPLOMA", nome: d.nome, membroId: d.membroId, titulo: d.titulo, descricao: d.descricao, revogadoEm: null, codigo: d.codigo,
        rodape: `Cerimônia de ${regra.br(r.cerimonia.dataCerimonia)} — o diploma vale depois que a Secretaria registrar a cerimônia com a presença do(a) titular (Regimento, Art. 75, II, a). Confira pelo código.`
      });
    });
    const buffer = await gerarBuffer(doc);
    context.res = { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="diplomas-cerimonia-${cerimoniaId}.pdf"` }, body: buffer, isRaw: true };
    return;
  }
  if (metodo !== "POST") return erro(context, 404, "Ação inválida.");

  if (acao === "criar" || acao === "editar") {
    const v = regra.validarCerimonia(corpo, hojeBrasilia());
    if (!v.valido) return erro(context, 400, v.mensagem);
    if (acao === "criar") return resposta(context, await db.criarCerimonia(pool, { dados: v.cerimonia, por }), 201);
    const cerimoniaId = auth.idDeRota(corpo.cerimoniaId);
    if (!cerimoniaId) return erro(context, 404, "Cerimônia não encontrada.");
    return resposta(context, await db.editarCerimonia(pool, { cerimoniaId, dados: v.cerimonia, por }));
  }
  const cerimoniaId = auth.idDeRota(corpo.cerimoniaId);
  if (!cerimoniaId) return erro(context, 404, "Cerimônia não encontrada.");
  if (acao === "cancelar") {
    const m = afm.textoObrigatorio(corpo.motivo, { minimo: 5, maximo: 300, rotulo: "O motivo do cancelamento" });
    if (!m.valido) return erro(context, 400, m.mensagem);
    return resposta(context, await db.cancelarCerimonia(pool, { cerimoniaId, motivo: m.texto, por }));
  }
  if (acao === "comissao") {
    const ids = Array.isArray(corpo.membroIds) ? corpo.membroIds.map((x) => auth.idDeRota(x)) : null;
    if (!ids || ids.some((x) => !x) || ids.length > 20) return erro(context, 400, "Informe as matrículas dos pastores da Comissão de Unção (até 20).");
    return resposta(context, await db.definirComissao(pool, { cerimoniaId, membroIds: ids, por }));
  }
  if (acao === "incluir") {
    const ids = listaDeGuids(corpo.ids);
    if (!ids || !ids.length || ids.length > 200 || ids.some((x) => !db.ehGuid(x))) return erro(context, 400, "Marque os processos homologados que entram na cerimônia.");
    return resposta(context, await db.incluirCandidatos(pool, { cerimoniaId, ids, por }));
  }
  if (acao === "retirar") {
    if (!db.ehGuid(corpo.consagracaoId)) return erro(context, 404, "Processo não encontrado.");
    return resposta(context, await db.retirarCandidato(pool, { cerimoniaId, consagracaoId: corpo.consagracaoId, por }));
  }
  if (acao === "registrar") {
    // v8.3 (revisão independente): a lista INTEIRA — presentes e ausentes —, para ninguém perder o ano por um nome que a Secretaria não viu
    const presentes = listaDeGuids(corpo.presentes);
    const ausentes = listaDeGuids(corpo.ausentes);
    if (!presentes || !ausentes || presentes.length + ausentes.length > 200 || [...presentes, ...ausentes].some((x) => !db.ehGuid(x))) {
      return erro(context, 400, "Informe a lista de presentes e a de ausentes (cada uma pode ser vazia).");
    }
    return resposta(context, await db.registrarCerimonia(pool, { cerimoniaId, presentes, ausentes, usuario, sessao: auth.exigirLoginIgnorandoTermos(req, {}) || usuario }));
  }
  erro(context, 404, "Ação inválida.");
};
