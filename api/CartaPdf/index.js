// CartaPdf (vB.6 — Documento institucional: geração de PDF no servidor)
// Mesmo conteúdo que app/script.js::renderizarImpressaoCarta já imprime
// via window.print() — só que gerado no servidor, com protocolo
// institucional único (vB.4) e rodapé de emissão, pra sair igual em
// qualquer máquina (não depender de driver de impressão/navegador de quem
// está solicitando).
// GET /api/cartas/{id}/pdf?matricula=123 — mesmo modelo de autoatendimento
// de SolicitarCarta: só quem informa a PRÓPRIA matrícula baixa a própria carta.
const { getPool, sql } = require("../shared/db");
const { gerarProtocolo } = require("../shared/protocolo");
const { novoDocumento, cabecalhoInstitucional, rodapeInstitucional, gerarBuffer } = require("../shared/pdfInstitucional");

const ROTULO_CARTA = { RECOMENDACAO: "CARTA DE RECOMENDAÇÃO", MUDANCA: "CARTA DE MUDANÇA", ATESTADO_SUPLETIVO: "ATESTADO SUPLETIVO" };
const LABEL_SITUACAO_CARTA = { EM_COMUNHAO: "Comunhão", SEM_COMUNHAO: "Paz", CONGREGADO: "Observação", NOVO_CONVERTIDO: "Observação" };
const LABEL_ESTADO_CIVIL = { SOLTEIRO: "Solteiro(a)", CASADO: "Casado(a)", VIUVO: "Viúvo(a)", DIVORCIADO: "Divorciado(a)", UNIAO_ESTAVEL: "União Estável" };
const LABEL_CARGO_MINISTERIAL = { AUXILIAR: "Auxiliar", MISSIONARIO: "Missionário(a)", DIACONO: "Diácono", PRESBITERO: "Presbítero", EVANGELISTA: "Evangelista", PASTOR: "Pastor" };

function fmtData(iso) {
  if (!iso) return null;
  return iso.split("-").reverse().join("/");
}

module.exports = async function (context, req) {
  const cartaId = context.bindingData.id;
  const matricula = Number((req.query || {}).matricula);
  if (!cartaId || !matricula) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula: /api/cartas/{id}/pdf?matricula=123" } };
    return;
  }
  const pool = await getPool();
  const carta = (await pool.request().input("id", sql.Int, cartaId).query(`
    SELECT c.CartaId AS cartaId, c.MembroId AS membroId, m.Nome AS nome, cg.Nome AS congregacao,
           c.Tipo AS tipo, c.Status AS status, c.Destino AS destino, c.Protocolo AS protocolo,
           c.MotivoSaida AS motivoSaida, c.DeclaracaoCiencia AS declaracaoCiencia,
           CONVERT(varchar(10), c.DataEmissao, 120) AS dataEmissao,
           CONVERT(varchar(10), c.DataValidade, 120) AS dataValidade,
           CONVERT(varchar(10), m.DataAdmissao, 120) AS dataAdmissao,
           COALESCE(cm.Nome, m.Funcao) AS funcao, m.CargoMinisterial AS cargoMinisterial,
           m.SituacaoMembro AS situacaoMembro, m.EstadoCivil AS estadoCivil
    FROM CartasTransito c
    JOIN MembroReferencia m ON m.MembroId = c.MembroId
    LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
    LEFT JOIN CargosMinisteriais cm ON cm.Sigla = m.CargoMinisterial
    WHERE c.CartaId = @id
  `)).recordset[0];

  if (!carta || carta.membroId !== matricula) {
    context.res = { status: 404, body: { sucesso: false, mensagem: "Carta não encontrada." } };
    return;
  }
  if (!["EMITIDA", "CONFIRMADA"].includes(carta.status)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Esta carta ainda não foi emitida/confirmada." } };
    return;
  }

  // Protocolo único (vB.4) gerado sob demanda, na 1ª vez que a carta sai em
  // PDF — nunca antes (rascunho nunca "gasta" número da sequência).
  let protocolo = carta.protocolo;
  if (!protocolo) {
    protocolo = await gerarProtocolo(pool, "CARTA");
    await pool.request().input("id", sql.Int, cartaId).input("protocolo", sql.NVarChar(30), protocolo)
      .query(`UPDATE CartasTransito SET Protocolo = @protocolo WHERE CartaId = @id`);
  }

  const doc = novoDocumento({ titulo: ROTULO_CARTA[carta.tipo] || carta.tipo });
  cabecalhoInstitucional(doc);

  const opcoes = ["RECOMENDACAO", "MUDANCA", "ATESTADO_SUPLETIVO"]
    .map((t) => `${t === carta.tipo ? "(X)" : "( )"} ${ROTULO_CARTA[t]}`).join("   ");
  doc.fontSize(12).font("Helvetica-Bold").text(opcoes, { align: "right" }).moveDown(1);

  doc.fontSize(11).font("Helvetica");
  const dataEmissaoFmt = fmtData(carta.dataEmissao) || "____/____/______";
  doc.text(`Parauapebas, PA, ${dataEmissaoFmt}.`).moveDown(0.5);
  doc.text("Saudações no SENHOR JESUS.").moveDown(0.5);
  doc.text(
    `Apresentamos à Igreja em ${carta.destino || "______________________"} o(a) portador(a) desta carta o(a) Sr(a). ${carta.nome} (Cartão de Membro nº ${carta.membroId}).`
  ).moveDown(0.5);

  const ehCongregado = carta.situacaoMembro === "CONGREGADO";
  doc.text(`${!ehCongregado ? "(X)" : "( )"} Membro     ${ehCongregado ? "(X)" : "( )"} Congregado`).moveDown(0.5);

  const situacaoRotulo = LABEL_SITUACAO_CARTA[carta.situacaoMembro] || "Comunhão";
  doc.text(`Nesta Igreja desde ${fmtData(carta.dataAdmissao) || "____/____/______"}, por se achar em: ${situacaoRotulo}.`).moveDown(0.5);
  doc.text("Nós o(a) recomendamos que recebais no Senhor, como usam os Santos.").moveDown(0.5);

  doc.text(
    `Função: ${carta.funcao || "—"}     Cargo: ${LABEL_CARGO_MINISTERIAL[carta.cargoMinisterial] || "—"}     Estado Civil: ${LABEL_ESTADO_CIVIL[carta.estadoCivil] || "—"}`
  ).moveDown(0.8);

  if (carta.declaracaoCiencia) {
    doc.font("Helvetica-Oblique").fontSize(10).text(carta.declaracaoCiencia, { align: "justify" }).font("Helvetica").fontSize(11).moveDown(0.8);
  }
  if (carta.motivoSaida || carta.destino) {
    doc.fontSize(10).text(`OBS: ${carta.motivoSaida || ""}`).fontSize(11).moveDown(0.8);
  }

  doc.moveDown(3);
  const larguraAssinatura = 200;
  const y = doc.y;
  doc.text("_______________________________", doc.page.margins.left, y, { width: larguraAssinatura, align: "center" });
  doc.text("Pastor Congregacional", doc.page.margins.left, doc.y, { width: larguraAssinatura, align: "center" });
  doc.text("_______________________________", doc.page.width - doc.page.margins.right - larguraAssinatura, y, { width: larguraAssinatura, align: "center" });
  doc.text("Secretário Local(a)", doc.page.width - doc.page.margins.right - larguraAssinatura, doc.y, { width: larguraAssinatura, align: "center" });

  doc.moveDown(2).fontSize(9).fillColor("#555555");
  const validadeTexto = carta.dataValidade ? `VALIDADE: até ${fmtData(carta.dataValidade)}` : (carta.tipo === "MUDANCA" ? "" : "VALIDADE: 30 dias a partir da data de emissão");
  if (validadeTexto) doc.text(validadeTexto, { align: "center" });

  rodapeInstitucional(doc, { protocolo, emitidoPor: null });
  const buffer = await gerarBuffer(doc);

  context.res = {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="carta-${carta.tipo.toLowerCase()}-${carta.membroId}.pdf"`
    },
    body: buffer,
    isRaw: true
  };
};
