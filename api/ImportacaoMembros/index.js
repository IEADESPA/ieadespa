// ImportacaoMembros (FASE 10, v10.1e, passo 9 de Membros; migração 185; 22/11/2026) — a IMPORTAÇÃO dos membros do sistema pago, UMA VEZ SÓ.
// Só a Secretaria Geral (exigirGeral + "pessoas"). A TELA (r27 aprovada, 22/11) é a "Importar do sistema pago" do módulo Membros (front/src/membros).
// GET  /api/importacao-membros                          -> { feita, emAndamento, importacao: { importacaoId, situacao, resumo... } | null, restantes, retrato, campos }
// POST /api/importacao-membros/previa                   -> { nomeArquivo?, texto, colunas? } — lê e confere o arquivo (CSV do sistema pago); nada entra ainda. A nova
//                                                          prévia substitui a anterior. `colunas`: o mapa escolhido na tela (um campo ou null por coluna).
//                                                          Devolve { importacaoId, resumo } (os números, as colunas, os avisos gerais)
// GET  /api/importacao-membros/lista?importacaoId=&filtro=problemas|avisos|acertar|repetidas|todas&pagina= -> as linhas com os motivos e o detalhe (nunca o CPF
//                                                          nem o contato)
// GET  /api/importacao-membros/lista.csv?importacaoId=  -> a lista dos que não entram ou entram com aviso, para abrir no Excel
// POST /api/importacao-membros/descartar                -> { importacaoId } — a prévia sai (os dados pessoais das linhas também)
// POST /api/importacao-membros/confirmar                -> { importacaoId } — confirmação reforçada (428): a prévia vira a importação; daqui não volta
// POST /api/importacao-membros/lote                     -> { importacaoId } — importa o próximo lote (até 200); a tela chama até "concluida"
// Regras (decisões do responsável, 18/11 e 22/11/2026): uma vez só; colunas extras aceitas; a matrícula que já é de uma ficha do sistema fica de fora (a rodada
// 28); matrícula repetida no arquivo ou zerada entra com a próxima do sistema e a pendência NUMERO; possível repetida, a pendência REPETIDA; a linha sem congregação ("IEADESPA - GERAL" ou vazia) fica de fora (G3, 24/11); todo importado em "Arrolamento a completar" (sem voto) com a
// pendência ARROLAMENTO (shared/importacaoMembros.js e shared/importacaoMembrosDb.js).
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const { exigirGeral } = require("../shared/escopoRotas");
const db = require("../shared/importacaoMembrosDb");
const { criarLimitador } = require("../shared/limiteTaxa");

// a prévia lê o arquivo inteiro: no máximo 10 por minuto por pessoa (por instância)
const limitador = criarLimitador({ janelaMs: 60000, maximo: 10 });
const semCache = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const corpoDe = (req) => (req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {});

module.exports = async function (context, req) {
  const usuario = exigirGeral(req, context, "pessoas");
  if (!usuario) return;
  const acao = String((context.bindingData && context.bindingData.acao) || "");
  const metodo = String(req.method || "GET").toUpperCase();
  const q = req.query || {};
  const responder = (r) => { const { status, ...corpo } = r; context.res = { status: status || 200, headers: semCache, body: corpo }; };
  try {
    const pool = await getPool();
    if (metodo === "GET" && acao === "") { responder(await db.estado(pool)); return; }
    if (metodo === "GET" && acao === "lista") { responder(await db.listar(pool, q.importacaoId, { filtro: String(q.filtro || "todas"), pagina: q.pagina })); return; }
    if (metodo === "GET" && acao === "lista.csv") {
      const texto = await db.csv(pool, q.importacaoId);
      if (texto == null) { responder({ sucesso: false, status: 400, mensagem: "Informe a importação." }); return; }
      context.res = { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store",
        "Content-Disposition": "attachment; filename=\"importacao-conferir.csv\"" }, body: texto };
      return;
    }
    if (metodo === "POST" && acao === "previa") {
      const lim = limitador.registrar(`p${usuario.membroId}`);
      if (!lim.permitido) {
        context.res = { status: 429, headers: { ...semCache, "Retry-After": String(lim.retryAposSegundos) }, body: { sucesso: false, mensagem: "Muitas prévias seguidas. Aguarde um minuto." } };
        return;
      }
      const corpo = corpoDe(req);
      if (typeof corpo.texto !== "string") { responder({ sucesso: false, status: 400, mensagem: "Envie o texto do arquivo (CSV do sistema pago)." }); return; }
      // o mapa das colunas escolhido na tela: uma lista (um campo ou null por coluna); a camada confere cada item contra o arquivo
      if (corpo.colunas !== undefined && corpo.colunas !== null && !(Array.isArray(corpo.colunas) && corpo.colunas.length <= 200)) {
        responder({ sucesso: false, status: 400, mensagem: "O mapa das colunas veio num formato que não serve. Escolha o arquivo de novo." });
        return;
      }
      const opcoes = { nomeArquivo: corpo.nomeArquivo, texto: corpo.texto };
      if (Array.isArray(corpo.colunas)) opcoes.colunas = corpo.colunas;
      // G2: a importação só das linhas que faltaram (só o true de verdade; o resto é a prévia de sempre)
      if (corpo.resto === true) opcoes.resto = true;
      responder(await db.criarPrevia(pool, usuario, opcoes));
      return;
    }
    if (metodo === "POST" && acao === "descartar") { responder(await db.descartar(pool, usuario, corpoDe(req).importacaoId)); return; }
    // G2 (decisão dele de 24/11/2026): descartar a importação JÁ CONFIRMADA que parou sem ninguém importado é ato sensível como confirmar
    if (metodo === "POST" && acao === "descartar-parada") {
      if (!auth.exigirFatorRecente(req, context)) return;   // 428
      responder(await db.descartarParada(pool, usuario, corpoDe(req).importacaoId));
      return;
    }
    if (metodo === "POST" && acao === "confirmar") {
      if (!auth.exigirFatorRecente(req, context)) return;   // 428: importar o rol inteiro é ato sensível
      responder(await db.confirmar(pool, usuario, corpoDe(req).importacaoId));
      return;
    }
    // A6: o "deixar de fora e continuar" da tela vai só como true (nenhuma lista de linhas do cliente: o servidor vê quais recusam)
    if (metodo === "POST" && acao === "lote") {
      const corpo = corpoDe(req);
      responder(await db.importarLote(pool, usuario, corpo.importacaoId, { deixarDeFora: corpo.deixarDeFora === true }));
      return;
    }
    context.res = { status: 405, headers: semCache, body: { sucesso: false, mensagem: "Método/rota não suportado." } };
  } catch (e) {
    context.log.error("[ImportacaoMembros]", acao, e && e.message);
    context.res = { status: 500, headers: semCache, body: { sucesso: false, mensagem: "Erro interno." } };
  }
};
