// GestaoTextoMestre (vB.15 — Texto Mestre Consolidado, Reg. Art. 162 §§2º-4º e 162-B)
// Versionamento do ARQUIVO consolidado inteiro + ficha de vigência ao redor
// dele — não é editor de texto (a v2.9 já descartou isso, com razão).
// "Qual era o texto vigente na data X" é uma leitura direta, nunca somar
// alteração sobre alteração.
// GET  /api/texto-mestre                 -> painel: vigente hoje, pendências de 48h, revisão quadrienal, histórico
// GET  /api/texto-mestre?data=YYYY-MM-DD -> versão vigente naquela data
// GET  /api/texto-mestre/{id}            -> uma versão específica (com link assinado)
// POST /api/texto-mestre                 -> { arquivoBase64, mimeType, dataVigencia, documentoOrigemId?, totalArtigos?, artigosTocados? }
// PUT  /api/texto-mestre                 -> { acao: 'DEFINIR_REVISAO_QUADRIENAL', data } (nível Global)
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const textoMestre = require("../shared/textoMestre");

const MIME_PERMITIDOS = ["application/pdf"];
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const hoje = new Date().toISOString().slice(0, 10);
    const data = (req.query || {}).data || hoje;
    const [vigente, pendencias, revisaoQuadrienal, historico] = await Promise.all([
      textoMestre.versaoVigenteEm(pool, data),
      textoMestre.alteracoesRegimentoPendentes(pool, hoje),
      textoMestre.situacaoRevisaoQuadrienal(pool, hoje),
      pool.request().query(`SELECT VersaoId AS versaoId, NumeroVersao AS numeroVersao,
                                    CONVERT(varchar(10), DataVigencia, 120) AS dataVigencia,
                                    TotalArtigos AS totalArtigos, ArtigosTocados AS artigosTocados
                             FROM TextoMestreVersoes ORDER BY DataVigencia DESC, NumeroVersao DESC`)
    ]);
    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: {
        vigente: vigente ? Object.assign({}, vigente, { urlAssinada: storage.urlDocumentoComSas(vigente.urlBlob) }) : null,
        pendenciasAtualizacao: pendencias, revisaoQuadrienal, historico: historico.recordset
      }
    };
    return;
  }

  if (req.method === "GET" && id) {
    const r = await pool.request().input("id", sql.Int, id).query(`
      SELECT VersaoId AS versaoId, NumeroVersao AS numeroVersao, UrlBlob AS urlBlob,
             CONVERT(varchar(10), DataVigencia, 120) AS dataVigencia, DocumentoOrigemId AS documentoOrigemId,
             TotalArtigos AS totalArtigos, ArtigosTocados AS artigosTocados
      FROM TextoMestreVersoes WHERE VersaoId = @id
    `);
    const versao = r.recordset[0];
    if (!versao) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Versão não encontrada." } };
      return;
    }
    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: Object.assign({}, versao, { urlAssinada: storage.urlDocumentoComSas(versao.urlBlob) })
    };
    return;
  }

  // POST/PUT exigem autenticação — leitura (GET) fica pública, mesmo
  // padrão de GestaoDocumentos (o Regimento vigente não é sigiloso).
  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;

  if (req.method === "POST") {
    const { arquivoBase64, mimeType, dataVigencia, documentoOrigemId, totalArtigos, artigosTocados } = req.body || {};
    if (!arquivoBase64 || !mimeType || !dataVigencia) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: arquivoBase64, mimeType, dataVigencia." } };
      return;
    }
    if (!MIME_PERMITIDOS.includes(mimeType)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Formato inválido. O Texto Mestre consolidado é sempre PDF." } };
      return;
    }
    let buffer;
    try { buffer = Buffer.from(arquivoBase64, "base64"); } catch (e) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "arquivoBase64 inválido." } };
      return;
    }
    if (buffer.length === 0 || buffer.length > TAMANHO_MAXIMO_BYTES) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Arquivo vazio ou maior que 15 MB." } };
      return;
    }

    // Art. 162 §§3º-4º — alerta, não bloqueia: a decisão de registro
    // integral x averbação fica com o Secretário, o sistema só ilumina.
    const limiar = textoMestre.avaliarLimiar30Porcento(totalArtigos, artigosTocados);

    let urlBlob;
    try {
      urlBlob = await storage.salvarDocumento(buffer, mimeType);
    } catch (erro) {
      context.log.error("Falha ao salvar Texto Mestre no Blob Storage:", erro.message);
      context.res = { status: 200, body: { sucesso: false, mensagem: "Falha ao salvar no armazenamento. Avise a equipe técnica: " + erro.message } };
      return;
    }

    const { versaoId, numeroVersao } = await textoMestre.registrarVersao(pool, {
      urlBlob, dataVigencia, documentoOrigemId: documentoOrigemId || null,
      totalArtigos: totalArtigos || null, artigosTocados: artigosTocados || null, registradoPor: usuario.membroId
    });

    await registrarAuditoria({
      tabela: "TextoMestreVersoes", registroId: versaoId, acao: `Registrou versão consolidada nº ${numeroVersao} do Texto Mestre`, usuarioId: usuario.membroId,
      dadosDepois: { dataVigencia, documentoOrigemId: documentoOrigemId || null, totalArtigos: totalArtigos || null, artigosTocados: artigosTocados || null }
    });

    context.res = {
      status: 201, headers: { "Content-Type": "application/json" },
      body: {
        sucesso: true,
        mensagem: `✅ Versão nº ${numeroVersao} do Texto Mestre registrada.${limiar.percentual !== null ? ` ${limiar.detalhe}` : ""}`,
        versaoId, numeroVersao, alertaLimiar30: limiar
      }
    };
    return;
  }

  if (req.method === "PUT") {
    const { acao, data } = req.body || {};
    if (acao !== "DEFINIR_REVISAO_QUADRIENAL") {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Ação inválida." } };
      return;
    }
    if (usuario.nivel !== "GLOBAL") {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Definir a baseline da revisão sistêmica quadrienal (Art. 162-B) é restrito a papéis de nível Global." } };
      return;
    }
    if (!data) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe data (última revisão sistêmica realizada)." } };
      return;
    }
    await textoMestre.definirUltimaRevisaoQuadrienal(pool, data);
    await registrarAuditoria({
      tabela: "ParametrosTextoMestre", registroId: 1, acao: `Definiu a data-base da revisão sistêmica quadrienal: ${data}`, usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Data-base da revisão sistêmica quadrienal definida." } };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método não suportado." } };
};
