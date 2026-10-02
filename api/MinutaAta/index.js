// MinutaAta (vB.6 — Documento institucional: minuta de ata, não a ata final)
// A v2.9 descartou de propósito "gerar Ata (PDF)": sem editor de texto no
// sistema, e assinatura de ata com fé pública continua sendo ICP-Brasil/
// GOV.BR, fora daqui. Essa decisão fica de pé. O que esta versão resolve é
// mais modesto: presença, quórum e resultado de votação JÁ estão no banco
// e hoje são redigitados à mão no Word pelo Secretário — a minuta exporta
// esses dados prontos (.docx) pra ele PARTIR dela, escrever a deliberação,
// exportar PDF e assinar no GOV.BR exatamente como já faz hoje. Elimina a
// redigitação, não o fluxo de assinatura.
const { Document, Paragraph, TextRun, Table, TableRow, TableCell, Packer, HeadingLevel, WidthType } = require("docx");
const { getPool, sql } = require("../shared/db");
const auth = require("../shared/auth");
const { ehGeral } = require("../shared/escopoRotas");
const { membroAutorizadoNoOrgaoLocal } = require("../shared/escopo");
const { universoDoOrgao } = require("../shared/universo");
const estatuto = require("../shared/estatuto");

function celula(texto, { cabecalho = false } = {}) {
  return new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: texto, bold: cabecalho })] })] });
}

module.exports = async function (context, req) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;
  const sessaoId = auth.idDeRota(context.bindingData.sessaoId);
  if (!sessaoId) {
    context.res = { status: 404, body: { sucesso: false, mensagem: "Reunião não encontrada." } };
    return;
  }
  const pool = await getPool();

  const sessao = (await pool.request().input("id", sql.Int, sessaoId).query(`
    SELECT s.SessaoId, s.OrgaoId, s.OrgaoLocalId, s.Descricao, CONVERT(varchar(10), s.DataSessao, 120) AS dataSessao,
           s.TipoSessao, s.Status, s.Pauta, s.Materias, s.ReformaNucleoFundamental, s.VinculadaSessaoId,
           COALESCE(o.Nome, ol.Nome) AS orgaoNome, COALESCE(o.Sigla, ol.Sigla) AS orgaoSigla,
           ol.Nivel AS orgaoLocalNivel, ol.ReferenciaId AS orgaoLocalReferenciaId
    FROM Sessoes s
    LEFT JOIN Orgaos o ON o.OrgaoId = s.OrgaoId
    LEFT JOIN OrgaosLocais ol ON ol.OrgaoLocalId = s.OrgaoLocalId
    WHERE s.SessaoId = @id
  `)).recordset[0];
  // ESCOPO (02/10/2026): a minuta lista TODOS os presentes e ausentes pelo nome, com a justificativa de falta (texto livre). Sessão de órgão territorial: só quem é do órgão
  // (ou o geral) — a mesma regra de AbrirReuniao/EncerrarReuniao. Sessão de órgão central (Assembleia, CLI, Diretoria...): só o geral, porque a lista é a da igreja inteira.
  // Fora disso, a mesma resposta de "reunião não encontrada".
  const geral = ehGeral(usuario);
  const alcanca = !!sessao && (geral || (sessao.OrgaoLocalId != null && await membroAutorizadoNoOrgaoLocal(pool, sql, usuario.membroId, sessao.OrgaoLocalId)));
  if (!alcanca) {
    context.res = { status: 404, body: { sucesso: false, mensagem: "Reunião não encontrada." } };
    return;
  }

  const presencas = (await pool.request().input("id", sql.Int, sessaoId).query(`
    SELECT p.Presente AS presente, p.FaltaJustificada AS faltaJustificada, p.MotivoJustificativa AS motivoJustificativa, m.Nome AS nome
    FROM Presencas p JOIN MembroReferencia m ON m.MembroId = p.MembroId
    WHERE p.SessaoId = @id
    ORDER BY m.Nome
  `)).recordset;
  const presentes = presencas.filter((p) => p.presente);
  const ausentes = presencas.filter((p) => !p.presente);

  const universo = await universoDoOrgao(pool, {
    orgaoId: sessao.OrgaoId, sigla: sessao.orgaoSigla, orgaoLocalId: sessao.OrgaoLocalId,
    nivel: sessao.orgaoLocalNivel, referenciaId: sessao.orgaoLocalReferenciaId
  });
  const totalUniverso = universo.length;
  const totalPresentes = presentes.length;

  const enquetes = (await pool.request().input("id", sql.Int, sessaoId).query(`
    SELECT EnqueteId, Titulo, Vinculante, QuorumTipo, Status, ResultadoAprovado FROM Enquetes WHERE SessaoId = @id
  `)).recordset;
  for (const enquete of enquetes) {
    // Contagem por opção a partir do modelo atual (PerguntasEnquete/OpcoesEnquete/RespostasEnquete). A consulta antiga lia VotosEnquete e OpcoesEnquete.EnqueteId, que a
    // migração 034 removeu: qualquer sessão com enquete vinculada dava erro 500. Só as perguntas de Opções têm contagem; o texto livre não entra na minuta.
    const linhas = (await pool.request().input("id", sql.Int, enquete.EnqueteId).query(`
      SELECT p.PerguntaId AS perguntaId, p.Ordem AS ordem, p.Titulo AS pergunta, o.Texto AS opcao, COUNT(r.RespostaId) AS total
      FROM PerguntasEnquete p
      JOIN OpcoesEnquete o ON o.PerguntaId = p.PerguntaId
      LEFT JOIN RespostasEnquete r ON r.OpcaoId = o.OpcaoId
      WHERE p.EnqueteId = @id AND p.Tipo = 'OPCOES'
      GROUP BY p.PerguntaId, p.Ordem, p.Titulo, o.OpcaoId, o.Texto
      ORDER BY p.Ordem, COUNT(r.RespostaId) DESC
    `)).recordset;
    const variasPerguntas = new Set(linhas.map((l) => l.perguntaId)).size > 1;
    enquete.votos = linhas.map((l) => ({ opcao: variasPerguntas ? `${l.pergunta} — ${l.opcao}` : l.opcao, total: l.total }));
  }

  // Quórum: só mostra veredito formal onde a regra estatutária já é
  // conhecida e calculável (shared/estatuto.js) — pros demais órgãos, só os
  // números crus (presentes/universo), sem inventar um "atingido: sim/não"
  // que a lei não define pra aquele órgão.
  const linhasQuorum = [`${totalPresentes} de ${totalUniverso} do universo do órgão compareceram.`];
  const quorumInstalacao = estatuto.avaliarQuorumInstalacao(sessao.orgaoSigla, totalPresentes, totalUniverso);
  if (quorumInstalacao) linhasQuorum.push(quorumInstalacao.mensagem);
  if (sessao.ReformaNucleoFundamental) {
    const quorumReforma = estatuto.avaliarQuorumReformaDestituicao(totalPresentes, totalUniverso, !!sessao.VinculadaSessaoId);
    if (quorumReforma) linhasQuorum.push(`Reforma de núcleo fundamental: ${quorumReforma.mensagem || JSON.stringify(quorumReforma)}`);
  }

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: "IGREJA EVANGÉLICA ASSEMBLEIA DE DEUS", heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: "Ministério do SETA em Parauapebas — PA · IEADESPA" }),
        new Paragraph({ text: "" }),
        new Paragraph({ text: `MINUTA DE ATA — ${sessao.orgaoNome || sessao.orgaoSigla}`, heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ children: [new TextRun({ text: `Data: ${sessao.dataSessao.split("-").reverse().join("/")}   Tipo: ${sessao.TipoSessao}   Status: ${sessao.Status}` })] }),
        new Paragraph({ text: "" }),

        new Paragraph({ text: "1. Pauta / Matérias", heading: HeadingLevel.HEADING_3 }),
        new Paragraph({ text: sessao.Pauta || "(não registrada)" }),
        new Paragraph({ text: "" }),

        new Paragraph({ text: "2. Presença e Quórum", heading: HeadingLevel.HEADING_3 }),
        ...linhasQuorum.map((linha) => new Paragraph({ text: linha })),
        new Paragraph({ text: "" }),
        new Paragraph({ text: "Presentes:", bold: true }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [celula("Nome", { cabecalho: true })] }),
            ...presentes.map((p) => new TableRow({ children: [celula(p.nome)] }))
          ]
        }),
        new Paragraph({ text: "" }),
        new Paragraph({ text: "Ausentes:", bold: true }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [celula("Nome", { cabecalho: true }), celula("Justificada?", { cabecalho: true }), celula("Motivo", { cabecalho: true })] }),
            ...ausentes.map((p) => new TableRow({ children: [celula(p.nome), celula(p.faltaJustificada ? "Sim" : "Não"), celula(p.motivoJustificativa || "-")] }))
          ]
        }),
        new Paragraph({ text: "" }),

        new Paragraph({ text: "3. Enquetes e Resultado de Votação", heading: HeadingLevel.HEADING_3 }),
        ...(enquetes.length === 0 ? [new Paragraph({ text: "(nenhuma enquete vinculada a esta sessão)" })] : enquetes.flatMap((e) => [
          new Paragraph({ children: [new TextRun({ text: `${e.Titulo}${e.Vinculante ? " (vinculante)" : ""} — ${e.Status === "ENCERRADA" ? (e.ResultadoAprovado ? "APROVADA" : "REPROVADA") : "em andamento"}`, bold: true })] }),
          ...e.votos.map((v) => new Paragraph({ text: `   ${v.opcao}: ${v.total} voto(s)` })),
          new Paragraph({ text: "" })
        ])),

        new Paragraph({ text: "4. Deliberação", heading: HeadingLevel.HEADING_3 }),
        new Paragraph({ text: "________________________________________________________________________" }),
        new Paragraph({ text: "________________________________________________________________________" }),
        new Paragraph({ text: "________________________________________________________________________" }),
        new Paragraph({ text: "" }),
        new Paragraph({ text: "Minuta gerada eletronicamente — não substitui a ata final assinada (Secretário redige, exporta PDF e assina no GOV.BR, conforme fluxo já em uso)." })
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  context.res = {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="minuta-sessao-${sessaoId}.docx"`
    },
    body: buffer,
    isRaw: true
  };
};
