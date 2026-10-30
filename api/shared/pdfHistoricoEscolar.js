// shared/pdfHistoricoEscolar.js (v8.7 — o Seminário como sistema acadêmico)
// A página do histórico escolar da AFM: a fotografia gravada no dia da emissão (AFMDocumentosAcademicos — a correção posterior não muda um histórico já emitido), com
// os cursos, as disciplinas cumpridas (nota, frequência, resultado; o aproveitamento com a instituição de origem) e o QR de verificação pública. O nome vem do cadastro.
const { cabecalhoInstitucional, MARINHO, OURO, CINZA } = require("./pdfInstitucional");
const { desenharQrNoPdf } = require("./certificadoQr");
const certificados = require("./certificados");

const br = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
const periodo = (p) => String(p || "").replace(/(\d{4}-\d{2}-\d{2})/g, (x) => br(x));
const virgula = (n) => (n == null ? "—" : String(n).replace(".", ","));

// `d`: { nome, membroId, conteudo: { emitidoEm, cursos:[...], linhas:[...] }, codigo, revogadoEm (texto ou null), rodape, reitor }
function desenharHistoricoEscolar(doc, d) {
  const c = d.conteudo || { cursos: [], linhas: [] };
  const esq = doc.page.margins.left;
  const largura = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const limite = () => doc.page.height - doc.page.margins.bottom - 40;
  cabecalhoInstitucional(doc);
  doc.fontSize(18).font("Helvetica-Bold").fillColor(MARINHO).text("HISTÓRICO ESCOLAR", { align: "center" });
  doc.moveDown(0.3).fontSize(11).font("Helvetica").fillColor(CINZA).text("Academia de Formação Ministerial (AFM) — Regimento Interno, Art. 66 a 72", { align: "center" }).fillColor("#000000").moveDown(0.8);
  if (d.revogadoEm) doc.fontSize(12).font("Helvetica-Bold").fillColor("#B3261E").text(`DOCUMENTO REVOGADO em ${d.revogadoEm} — não tem validade.`, { align: "center" }).fillColor("#000000").moveDown(0.6);
  doc.fontSize(11).font("Helvetica").text(`Aluno(a): ${d.nome} (Cartão de Membro nº ${d.membroId}). Posição em ${br(c.emitidoEm)}.`, esq, doc.y, { width: largura }).moveDown(0.6);

  doc.font("Helvetica-Bold").fontSize(11).fillColor(MARINHO).text("Cursos", esq, doc.y, { width: largura }).fillColor("#000000").font("Helvetica").fontSize(10);
  for (const cu of c.cursos || []) {
    doc.text(`• ${cu.curso} — ${cu.situacao}; início ${br(cu.inicio)}${cu.conclusao ? `; conclusão ${br(cu.conclusao)}` : ""}; carga cumprida ${virgula(cu.cargaCumprida)} h (obrigatórias: ${virgula(cu.cargaObrigatoria)} h).`, esq, doc.y, { width: largura });
  }
  if (!(c.cursos || []).length) doc.text("Nenhum curso.", esq, doc.y, { width: largura });
  doc.moveDown(0.8);

  // a tabela: Curso | Disciplina | CH | Período | Nota | Freq. | Resultado
  const colunas = [{ t: "Curso", w: 0.17 }, { t: "Disciplina", w: 0.25 }, { t: "CH", w: 0.06 }, { t: "Período", w: 0.17 }, { t: "Nota", w: 0.07 }, { t: "Freq.", w: 0.07 }, { t: "Resultado", w: 0.21 }];
  const linhaTabela = (valores, negrito) => {
    const alturas = colunas.map((col, i) => doc.font(negrito ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).heightOfString(String(valores[i]), { width: col.w * largura - 4 }));
    const altura = Math.max(...alturas) + 4;
    if (doc.y + altura > limite()) { doc.addPage(); }
    const y = doc.y;
    let x = esq;
    colunas.forEach((col, i) => { doc.font(negrito ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).text(String(valores[i]), x + 2, y + 2, { width: col.w * largura - 4 }); x += col.w * largura; });
    doc.moveTo(esq, y + altura).lineTo(esq + largura, y + altura).lineWidth(0.3).strokeColor("#BBBBBB").stroke();
    doc.x = esq;
    doc.y = y + altura;
  };
  doc.font("Helvetica-Bold").fontSize(11).fillColor(MARINHO).text("Disciplinas cursadas", esq, doc.y, { width: largura }).fillColor("#000000").moveDown(0.3);
  linhaTabela(colunas.map((col) => col.t), true);
  for (const l of c.linhas || []) {
    linhaTabela([l.curso, l.disciplina, virgula(l.cargaHoraria), periodo(l.periodo), virgula(l.nota), l.frequenciaPct == null ? "—" : `${l.frequenciaPct}%`, l.resultado || "—"], false);
  }
  if (!(c.linhas || []).length) doc.font("Helvetica").fontSize(10).text("Nenhuma disciplina concluída até esta data.", esq, doc.y + 4, { width: largura });

  // assinatura e QR: se não couber no fim da página, vão para a próxima
  const tamanho = 92;
  if (doc.y + 60 + tamanho + 30 > limite()) doc.addPage();
  doc.moveDown(2);
  const y = doc.y;
  doc.fontSize(10).font("Helvetica").text("_______________________________", esq, y, { width: 220, align: "center" });
  doc.text(d.reitor ? `${d.reitor}\nReitor(a) da AFM` : "Reitor(a) da AFM", esq, doc.y, { width: 220, align: "center" });
  if (d.codigo) {
    const codigo = certificados.formatarCodigo(certificados.normalizarCodigo(d.codigo));
    const url = certificados.urlVerificacao(codigo);
    const yQr = doc.y + 14;
    const xTexto = esq + tamanho + 14;
    desenharQrNoPdf(doc, url, { x: esq, y: yQr, tamanho });
    doc.fontSize(9).font("Helvetica-Bold").fillColor(MARINHO).text("Verifique a autenticidade deste documento", xTexto, yQr + 10, { width: largura - tamanho - 14 });
    doc.font("Helvetica").fillColor(CINZA).text("Aponte a câmera para o QR Code ou acesse o endereço abaixo e informe o código.", xTexto, doc.y + 2, { width: largura - tamanho - 14 });
    doc.font("Helvetica-Bold").fillColor(MARINHO).text(url.split("?")[0], xTexto, doc.y + 4, { width: largura - tamanho - 14 });
    doc.text(`Código: ${codigo}${d.selo ? ` · selo do conteúdo ${d.selo}` : ""}`, xTexto, doc.y + 2, { width: largura - tamanho - 14 });
    doc.fillColor("#000000");
  }
  const yRodape = doc.page.height - doc.page.margins.bottom - 24;
  doc.moveTo(esq, yRodape - 6).lineTo(esq + largura, yRodape - 6).lineWidth(0.8).strokeColor(OURO).stroke();
  doc.fontSize(8).fillColor(CINZA).font("Helvetica").text(d.rodape, esq, yRodape, { align: "center", width: largura });
  doc.fillColor("#000000");
}

module.exports = { desenharHistoricoEscolar };
