// ApresentacaoCriancaPdf (vB.12 — certificado de Apresentação de Criança, Art. 82)
// Só emite certificado pra modalidade SOLENE — RESERVADA nunca gera (Art. 82
// §2º, II "b"): a regra é checada aqui em código, não deixada só documentada.
// Mesmo esqueleto de CartaPdf (protocolo institucional gerado sob demanda,
// na 1ª emissão, nunca antes). Exige a permissão "pessoas" (não é
// autoatendimento: a criança não é matrícula própria).
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { gerarProtocolo } = require("../shared/protocolo");
const { geraCertificado } = require("../shared/apresentacaoCriancas");
const { novoDocumento, cabecalhoInstitucional, rodapeInstitucional, gerarBuffer } = require("../shared/pdfInstitucional");

function fmtData(iso) {
  if (!iso) return null;
  return iso.split("-").reverse().join("/");
}

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const apresentacaoId = context.bindingData.id;
  const pool = await getPool();
  const item = (await pool.request().input("id", sql.Int, apresentacaoId).query(`
    SELECT a.ApresentacaoId AS apresentacaoId, a.NomeCrianca AS nomeCrianca,
           CONVERT(varchar(10), a.DataNascimento, 120) AS dataNascimento,
           pai.Nome AS nomePai, mae.Nome AS nomeMae, a.Oficiante AS oficiante, a.Modalidade AS modalidade,
           CONVERT(varchar(10), a.DataApresentacao, 120) AS dataApresentacao, a.Protocolo AS protocolo
    FROM ApresentacoesCrianca a
    LEFT JOIN MembroReferencia pai ON pai.MembroId = a.MembroIdPai
    LEFT JOIN MembroReferencia mae ON mae.MembroId = a.MembroIdMae
    WHERE a.ApresentacaoId = @id
  `)).recordset[0];

  if (!item) {
    context.res = { status: 404, body: { sucesso: false, mensagem: "Apresentação não encontrada." } };
    return;
  }
  if (!geraCertificado(item.modalidade)) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Apresentação reservada não gera certificado (Art. 82 §2º, II 'b')." } };
    return;
  }

  let protocolo = item.protocolo;
  if (!protocolo) {
    protocolo = await gerarProtocolo(pool, "APRESENTACAO");
    await pool.request().input("id", sql.Int, apresentacaoId).input("protocolo", sql.NVarChar(30), protocolo)
      .query(`UPDATE ApresentacoesCrianca SET Protocolo = @protocolo WHERE ApresentacaoId = @id`);
  }

  const doc = novoDocumento({ titulo: "CERTIFICADO DE APRESENTAÇÃO DE CRIANÇA" });
  cabecalhoInstitucional(doc);

  doc.fontSize(14).font("Helvetica-Bold").text("CERTIFICADO DE APRESENTAÇÃO DE CRIANÇA", { align: "center" }).moveDown(1.5);

  doc.fontSize(11).font("Helvetica");
  const pais = [item.nomePai, item.nomeMae].filter(Boolean).join(" e ");
  doc.text(
    `Certificamos que a criança ${item.nomeCrianca}, nascida em ${fmtData(item.dataNascimento)}, filho(a) de ${pais || "___________________"}, ` +
    `foi apresentada solenemente perante esta Igreja em ${fmtData(item.dataApresentacao)}${item.oficiante ? `, sob a condução de ${item.oficiante}` : ""}, ` +
    `conforme o Regimento Interno, Art. 82.`,
    { align: "justify" }
  ).moveDown(2);

  doc.moveDown(3);
  const larguraAssinatura = 200;
  const y = doc.y;
  doc.text("_______________________________", doc.page.margins.left, y, { width: larguraAssinatura, align: "center" });
  doc.text("Pastor Congregacional", doc.page.margins.left, doc.y, { width: larguraAssinatura, align: "center" });
  doc.text("_______________________________", doc.page.width - doc.page.margins.right - larguraAssinatura, y, { width: larguraAssinatura, align: "center" });
  doc.text("Secretário Local(a)", doc.page.width - doc.page.margins.right - larguraAssinatura, doc.y, { width: larguraAssinatura, align: "center" });

  rodapeInstitucional(doc, { protocolo, emitidoPor: null });
  const buffer = await gerarBuffer(doc);

  context.res = {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="apresentacao-crianca-${apresentacaoId}.pdf"`
    },
    body: buffer,
    isRaw: true
  };
};
