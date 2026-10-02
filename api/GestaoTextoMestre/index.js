// GestaoTextoMestre (vB.15 — Texto Mestre Consolidado, Reg. Art. 162 §§2º-4º e 162-B)
// Versionamento do ARQUIVO consolidado inteiro + ficha de vigência ao redor
// dele — não é editor de texto (a v2.9 já descartou isso, com razão).
// "Qual era o texto vigente na data X" é uma leitura direta, nunca somar
// alteração sobre alteração.
// GET  /api/texto-mestre                 -> SEM sessão: só a versão vigente hoje (com link assinado). COM sessão: painel (vigente, pendências de 48h, revisão quadrienal, histórico)
// GET  /api/texto-mestre?data=YYYY-MM-DD -> (com sessão) versão vigente naquela data
// GET  /api/texto-mestre/{id}            -> (com sessão) uma versão específica (com link assinado)
// POST /api/texto-mestre                 -> { arquivoBase64, mimeType, dataVigencia, documentoOrigemId?, totalArtigos?, artigosTocados? } (nível geral)
// PUT  /api/texto-mestre                 -> { acao: 'DEFINIR_REVISAO_QUADRIENAL', data } (nível geral)
const auth = require("../shared/auth");
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const storage = require("../shared/storage");
const textoMestre = require("../shared/textoMestre");

const MIME_PERMITIDOS = ["application/pdf"];
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;
const DATA_AAAA_MM_DD = /^\d{4}-\d{2}-\d{2}$/;
// Data AAAA-MM-DD que existe no calendário ("2026-02-30" não existe): reconverte e compara.
const dataValida = (v) => {
  if (typeof v !== "string" || !DATA_AAAA_MM_DD.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const inteiroNaoNegativo = (v) => v === undefined || v === null || (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100000);

// O GET é público só para o texto vigente: quem não tem sessão (ou só a sessão provisória de criar PIN) vê UMA coisa — a versão em vigor hoje e o link assinado dela.
// O histórico, as pendências de atualização, a revisão quadrienal, uma versão por número e qualquer data diferente de hoje (passada ou futura = rascunho ainda não vigente) exigem login.
function temSessao(req) {
  const token = auth.extrairToken(req);
  const sessao = token ? auth.getSessao(token) : null;
  return !!sessao && sessao.pinProvisorio !== true;
}
const recusaSemLogin = () => ({ status: 401, body: { sucesso: false, mensagem: "Faça login para continuar." } });

module.exports = async function (context, req) {
  const id = context.bindingData.id;

  if (req.method === "GET" && !id) {
    const hoje = hojeBrasilia();
    const dataPedida = (req.query || {}).data;
    const logado = temSessao(req);
    if (dataPedida !== undefined && dataPedida !== "" && !dataValida(dataPedida)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "data inválida (use AAAA-MM-DD)." } };
      return;
    }
    if (!logado && dataPedida && dataPedida !== hoje) {
      context.res = recusaSemLogin();
      return;
    }
    const pool = await getPool();
    if (!logado) {
      const publico = await textoMestre.versaoVigenteEm(pool, hoje);
      context.res = {
        status: 200, headers: { "Content-Type": "application/json" },
        body: { vigente: publico ? { numeroVersao: publico.numeroVersao, dataVigencia: publico.dataVigencia, urlAssinada: storage.urlDocumentoComSas(publico.urlBlob) } : null }
      };
      return;
    }
    const data = dataPedida || hoje;
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
    if (!temSessao(req)) { context.res = recusaSemLogin(); return; }
    const versaoId = auth.idDeRota(id);
    const pool = await getPool();
    const r = !versaoId ? { recordset: [] } : await pool.request().input("id", sql.Int, versaoId).query(`
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

  // POST/PUT: o Texto Mestre é o Regimento consolidado da igreja inteira (documento normativo, sem congregação) — só o nível GERAL (papel Global E escopo de todas as
  // congregações), com uma das permissões que já valiam. Antes bastava "reunioes": o Dirigente de Congregação e o Pastor de Área publicavam o texto "vigente".
  const usuario = exigirGeral(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;
  const pool = await getPool();

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
    if (!dataValida(dataVigencia) || !inteiroNaoNegativo(totalArtigos) || !inteiroNaoNegativo(artigosTocados)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "dataVigencia (AAAA-MM-DD), totalArtigos e artigosTocados (inteiros) inválidos." } };
      return;
    }
    const documentoOrigem = documentoOrigemId === undefined || documentoOrigemId === null || documentoOrigemId === "" ? null : auth.idDeRota(documentoOrigemId);
    if (documentoOrigemId !== undefined && documentoOrigemId !== null && documentoOrigemId !== "" && !documentoOrigem) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "documentoOrigemId inválido." } };
      return;
    }
    if (typeof arquivoBase64 !== "string" || arquivoBase64.length > Math.ceil(TAMANHO_MAXIMO_BYTES / 3) * 4 + 8) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Arquivo vazio ou maior que 15 MB." } };
      return;
    }
    const buffer = Buffer.from(arquivoBase64, "base64");
    if (buffer.length === 0 || buffer.length > TAMANHO_MAXIMO_BYTES) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Arquivo vazio ou maior que 15 MB." } };
      return;
    }
    // O tipo vem declarado pelo cliente: confere que o conteúdo é mesmo um PDF (a assinatura "%PDF-" fica nos primeiros bytes).
    if (!buffer.subarray(0, 1024).includes("%PDF-")) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Formato inválido. O Texto Mestre consolidado é sempre PDF." } };
      return;
    }
    if (documentoOrigem) {
      const doc = await pool.request().input("id", sql.Int, documentoOrigem).query(`SELECT DocumentoId FROM Documentos WHERE DocumentoId = @id`);
      if (doc.recordset.length === 0) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "documentoOrigemId não encontrado." } };
        return;
      }
    }

    // Art. 162 §§3º-4º — alerta, não bloqueia: a decisão de registro
    // integral x averbação fica com o Secretário, o sistema só ilumina.
    const limiar = textoMestre.avaliarLimiar30Porcento(totalArtigos, artigosTocados);

    let urlBlob;
    try {
      urlBlob = await storage.salvarDocumento(buffer, mimeType);
    } catch (erro) {
      // O motivo técnico fica no log do servidor; o cliente não recebe a mensagem do Storage (pode citar conta, container e caminho).
      context.log.error("Falha ao salvar Texto Mestre no Blob Storage:", erro.message);
      context.res = { status: 200, body: { sucesso: false, mensagem: "Falha ao salvar no armazenamento. Avise a equipe técnica." } };
      return;
    }

    const { versaoId, numeroVersao } = await textoMestre.registrarVersao(pool, {
      urlBlob, dataVigencia, documentoOrigemId: documentoOrigem,
      totalArtigos: totalArtigos || null, artigosTocados: artigosTocados || null, registradoPor: usuario.membroId
    });

    await registrarAuditoria({
      tabela: "TextoMestreVersoes", registroId: versaoId, acao: `Registrou versão consolidada nº ${numeroVersao} do Texto Mestre`, usuarioId: usuario.membroId,
      dadosDepois: { dataVigencia, documentoOrigemId: documentoOrigem, totalArtigos: totalArtigos || null, artigosTocados: artigosTocados || null }
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
    if (!data || !dataValida(data)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe data (última revisão sistêmica realizada, AAAA-MM-DD)." } };
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
