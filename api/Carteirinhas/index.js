// Carteirinhas (FASE 10, v10.1b passo 8, 19/11/2026) — as carteirinhas da física e da digital. A regra está em shared/carteirinha.js e o banco em
// shared/carteirinhaDb.js (migração 180). Desenho aprovado nas rodadas 9 a 11.
//
//  GET  carteirinhas/modelos                      (pessoas)            os modelos e quantas pessoas cada um cobre
//  POST carteirinhas/modelos {nome, publico, desenho?}            (geral pessoas)  modelo novo
//  PUT  carteirinhas/modelos/{id} {nome, desenho, versao}         (geral pessoas)  salvar o editor (409 se outra pessoa salvou no meio)
//  POST carteirinhas/ativar/{id}                                  (geral pessoas)  "usar este modelo"
//  POST carteirinhas/arte/{id} {lado, imagemBase64, tipo}         (geral pessoas)  guarda a arte de fundo como veio e devolve o nome do arquivo; ela só passa
//                                                                                    a valer no "salvar" do modelo (junto com o desenho, conferindo a versão)
//  GET  carteirinhas/resumo                       (pessoas)            por congregação do escopo: prontas para imprimir e bloqueadas
//  GET  carteirinhas/fila?congregacaoId=          (pessoas, no escopo) quem imprimir na congregação (nova, mudou, segunda via) e quem está bloqueado
//  POST carteirinhas/preparar {membroIds, material}               (pessoas, no escopo) confere e devolve os cartões para a impressora (NADA registrado)
//  POST carteirinhas/confirmar {membroIds, material, frenteVerso} (pessoas, no escopo) depois da impressora: registra só as que saíram certas
//  POST carteirinhas/segunda-via {membroId, motivo}               (pessoas, no escopo) pede a segunda via
//  GET  carteirinhas/ficha/{membroId}             (pessoas, no escopo) a carteirinha de uma pessoa (o botão da ficha)
//  GET  carteirinhas/minha                        (login)              a carteirinha digital da própria pessoa, com o QR fixo
// Fora do escopo e matrícula que não existe respondem igual (404). A carteirinha de obreiro só a Secretaria Geral imprime (Regimento, Art. 76 §2º).
// A conferência pública do QR (sem login) é outra rota: ConferirCarteirinha.
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { exigirGeral, ehGeral, noEscopoDaPessoa, condicaoSqlEscopoPessoa, congregacaoNoEscopo } = require("../shared/escopoRotas");
const db = require("../shared/carteirinhaDb");
const regra = require("../shared/carteirinha");
const storage = require("../shared/storage");
const imagem = require("../shared/imagemArquivo");
const { gerarMatriz, matrizParaSvg } = require("../shared/certificadoQr");

const svgDoQr = (url) => matrizParaSvg(gerarMatriz(url));
const MAX_ARTE = 10 * 1024 * 1024;
const MAX_ARTE_BASE64 = Math.ceil(MAX_ARTE / 3) * 4 + 16;
// 300 dpi no tamanho do cartão (85,6 × 54 mm): a arte menor que isso sai borrada no PVC
const MIN_LARGURA = 1011;
const MIN_ALTURA = 638;

function erro(context, status, mensagem) { context.res = { status, headers: { "Cache-Control": "no-store" }, body: { sucesso: false, mensagem } }; }
function resposta(context, r, statusOk = 200) {
  if (!r || r.naoExiste) return erro(context, 404, "Não encontrado.");
  const status = r.sucesso ? statusOk : r.mudou ? 409 : 422;
  const { naoExiste, mudou, ...corpo } = r;
  context.res = { status, headers: { "Cache-Control": "no-store" }, body: corpo };
}
const ok = (context, body) => { context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { sucesso: true, ...body } }; };

module.exports = async function (context, req) {
  const acao = String((context.bindingData && context.bindingData.acao) || "");
  const idRota = context.bindingData && context.bindingData.id;
  const metodo = String(req.method || "GET").toUpperCase();
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};

  // ---- a própria pessoa ----
  if (metodo === "GET" && acao === "minha") {
    const usuario = auth.exigirLogin(req, context);
    if (!usuario) return;
    const c = await db.minha(await getPool(), usuario.membroId, { urlFoto: storage.urlComSas, svgDoQr });
    if (!c) return erro(context, 404, "Não encontrado.");
    return ok(context, { carteirinha: c });
  }

  // ---- os modelos: ver é de quem tem "pessoas"; criar e mudar, só a Secretaria Geral ----
  if (acao === "modelos" && metodo === "GET") {
    const usuario = auth.exigirPermissao(req, context, "pessoas");
    if (!usuario) return;
    return ok(context, { modelos: await db.listarModelos(await getPool(), storage.urlDocumentoComSas), geral: ehGeral(usuario) });
  }
  if (["modelos", "ativar", "arte"].includes(acao)) {
    const usuario = exigirGeral(req, context, "pessoas");
    if (!usuario) return;
    const pool = await getPool();
    const por = usuario.membroId;
    if (acao === "modelos" && metodo === "POST" && !idRota) {
      return resposta(context, await db.criarModelo(pool, { nome: corpo.nome, publico: corpo.publico, desenho: corpo.desenho, por }), 201);
    }
    const modeloId = auth.idDeRota(idRota);
    if (!modeloId) return erro(context, 404, "Modelo não encontrado.");
    if (acao === "modelos" && metodo === "PUT") {
      const r = await db.salvarModelo(pool, { modeloId, nome: corpo.nome, desenho: corpo.desenho, versao: corpo.versao, arteFrente: corpo.arteFrente, arteVerso: corpo.arteVerso, por });
      // as artes que deixaram de ser usadas saem do armazenamento (melhor esforço: o modelo já está salvo)
      if (r && r.sucesso) for (const nome of r.sobras || []) await storage.excluirDocumento(nome);
      if (r && r.sucesso) delete r.sobras;
      return resposta(context, r);
    }
    if (acao === "ativar" && metodo === "POST") return resposta(context, await db.ativarModelo(pool, { modeloId, por }));
    if (acao === "arte" && metodo === "POST") {
      const lado = corpo.lado === "verso" ? "verso" : corpo.lado === "frente" ? "frente" : null;
      if (!lado) return erro(context, 400, "Diga se a arte é da frente ou do verso.");
      if (!imagem.TIPOS.includes(corpo.tipo)) return erro(context, 400, "A arte precisa ser PNG, JPEG ou WebP.");
      if (typeof corpo.imagemBase64 !== "string" || !corpo.imagemBase64 || corpo.imagemBase64.length > MAX_ARTE_BASE64) return erro(context, 400, "Arquivo vazio ou maior que 10 MB.");
      const buffer = Buffer.from(corpo.imagemBase64, "base64");
      if (!buffer.length || buffer.length > MAX_ARTE || !imagem.assinaturaConfere(buffer, corpo.tipo)) return erro(context, 400, "O arquivo não é uma imagem do formato informado.");
      const dim = imagem.dimensoes(buffer, corpo.tipo);
      if (!dim) return erro(context, 400, "Não deu para ler o tamanho da imagem: salve de novo como PNG ou JPEG.");
      if (dim.largura < MIN_LARGURA || dim.altura < MIN_ALTURA) {
        return erro(context, 400, `A arte precisa ter pelo menos 1.011 × 638 pixels (300 dpi no tamanho do cartão); esta tem ${dim.largura} × ${dim.altura}.`);
      }
      if (!(await db.lerModelo(pool, modeloId))) return erro(context, 404, "Modelo não encontrado.");
      let arteId;
      try {
        arteId = await storage.salvarArteCarteirinha(buffer, corpo.tipo);
      } catch (e) {
        context.log.error("[Carteirinhas] a arte não foi guardada no armazenamento:", e && e.message);
        return erro(context, 503, "Não foi possível guardar a arte agora. Tente de novo em instantes.");
      }
      // só o arquivo: a arte passa a valer quando o modelo for salvo (o desenho e a arte juntos, conferindo a versão — "desfazer" e "sair sem salvar" não perdem a anterior)
      if (!db.RX_ARTE.test(String(arteId))) return erro(context, 503, "Não foi possível guardar a arte agora. Tente de novo em instantes.");
      // a arte enviada antes, que nenhum modelo usa (a pessoa trocou de ideia antes de salvar), sai do armazenamento
      if (typeof corpo.substitui === "string" && db.RX_ARTE.test(corpo.substitui) && !(await db.arteEmUso(pool, corpo.substitui))) await storage.excluirDocumento(corpo.substitui);
      return ok(context, { mensagem: `Arte do ${lado} pronta (${dim.largura} × ${dim.altura} px, como veio). Salve o modelo para valer.`, arteId, arte: storage.urlDocumentoComSas(arteId), largura: dim.largura, altura: dim.altura });
    }
    return erro(context, 404, "Ação inválida.");
  }

  // ---- a secretaria (local, área ou Geral), sempre no escopo ----
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;
  const pool = await getPool();
  const geral = ehGeral(usuario);
  const alcanca = (p) => !!p && noEscopoDaPessoa(usuario, p.congregacao, p.extensao);

  if (metodo === "GET" && acao === "resumo") {
    const pedido = pool.request();
    const cond = await condicaoSqlEscopoPessoa(pool, usuario, pedido, "m.CongregacaoId", "ex.Nome");
    if (cond === "") return ok(context, { congregacoes: [], prontas: 0, bloqueadas: 0, repetidas: 0, numeros: 0, geral });
    return ok(context, { ...(await db.resumoPorCongregacao(pool, { condEscopo: cond, pedido, podeObreiro: geral })), geral });
  }
  if (metodo === "GET" && acao === "fila") {
    const congregacaoId = auth.idDeRota((req.query || {}).congregacaoId);
    if (!congregacaoId || !(geral || (await congregacaoNoEscopo(pool, usuario, congregacaoId)))) return erro(context, 404, "Congregação não encontrada.");
    const pedido = pool.request();
    const cond = await condicaoSqlEscopoPessoa(pool, usuario, pedido, "m.CongregacaoId", "ex.Nome");
    if (cond === "") return ok(context, { itens: [], geral });
    return ok(context, { itens: await db.filaParaImprimir(pool, { congregacaoId, condEscopo: cond, pedido, podeObreiro: geral }), geral });
  }
  if (metodo === "POST" && acao === "preparar") {
    return resposta(context, await db.preparar(pool, { membroIds: corpo.membroIds, material: corpo.material, podeObreiro: geral, alcanca,
      urlFoto: storage.urlComSas, urlArte: storage.urlDocumentoComSas, svgDoQr }));
  }
  if (metodo === "POST" && acao === "confirmar") {
    return resposta(context, await db.confirmar(pool, { membroIds: corpo.membroIds, material: corpo.material, frenteVerso: corpo.frenteVerso === true, por: usuario.membroId,
      podeObreiro: geral, alcanca }));
  }
  if (metodo === "POST" && acao === "segunda-via") {
    const membroId = auth.idDeRota(corpo.membroId);
    const p = membroId ? await db.pessoa(pool, membroId) : null;
    if (!alcanca(p)) return erro(context, 404, "Matrícula não encontrada.");
    if (!regra.podeImprimir(p).pode) return erro(context, 422, regra.podeImprimir(p).mensagem);
    return resposta(context, await db.pedirSegundaVia(pool, { membroId, motivo: corpo.motivo, por: usuario.membroId }), 201);
  }
  if (metodo === "GET" && acao === "ficha") {
    const membroId = auth.idDeRota(idRota);
    const p = membroId ? await db.pessoa(pool, membroId) : null;
    if (!alcanca(p)) return erro(context, 404, "Matrícula não encontrada.");
    return ok(context, { carteirinha: await db.situacaoDaFicha(pool, membroId, { podeObreiro: geral }) });
  }
  return erro(context, 404, "Ação inválida.");
};

module.exports.MIN_LARGURA = MIN_LARGURA;
module.exports.MIN_ALTURA = MIN_ALTURA;
void sql;
