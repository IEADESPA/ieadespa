// GestaoTerritorio (v9.5 — Mapa territorial e inteligência de expansão). Desenho em docs/plano/fase-9-entidades-vinculadas.md.
//
// A regra pura está em shared/territorio.js (testada); o banco em shared/territorioDb.js. Só a sessão de liderança (senha). Entra quem entra na Expansão da v9.2: a
// permissão "expansao" OU compor a CME. O alcance é o mesmo:
//   - nível geral: vê os membros de todos; é o único que cadastra bairros, muda o raio de cobertura e monta a tabela de critérios;
//   - CME: vê os membros de todos (contagem por bairro, nunca nome);
//   - os demais (Dirigente, Pastor de Área): os membros das congregações que o escopo cobre por inteiro; o Dirigente da Mãe marca o ponto das Extensões dela.
//
// ---- Leitura (GET /api/territorio/...) ----
//  catalogos   -> { indicadores[], operadores[], ufs[], raioKm, versaoParametros, bairros[], mapa:{ chave }, papeis:{ geral, cme } }
//  mapa        -> { raioKm, bairros[], unidades[], densidade[], totais, fila[], escopo }
//  bairros     -> { bairros[] }                          só o nível geral (o cadastro, com os inativos e a contagem)
//  extensoes   -> { extensoes[] }                        as Extensões ativas no alcance, com o ponto e se pode marcar
//  criterios   -> { criterios[], raioKm, versaoParametros }
//  simulacao   -> { hoje, janelaDizimo, criterios[], extensoes[] }
//
// ---- Escrita (POST /api/territorio/...) ----
//  bairro            {nome, cidade, uf, lat?, lng?}                         nível geral; liga a ele a fila de quem escreveu o mesmo nome
//  bairro-editar     {bairroId, versao, nome, cidade, uf, lat?, lng?}       nível geral
//  bairro-ativo      {bairroId, versao, ativo}                              nível geral (desativar só sem membros ativos ligados)
//  bairro-juntar     {bairroId, versao, destinoId}                          nível geral (o repetido vai para o que fica)
//  ponto-extensao    {extensaoId, lat?, lng?}                               o Dirigente da Mãe ou o nível geral (os dois vazios apagam o ponto)
//  raio              {raioKm, versao}                                       nível geral
//  criterio          {indicador, operador, valor?, ativo?, ordem?, observacao?}   nível geral
//  criterio-editar   {criterioId, versao, ...}                              nível geral
//  criterio-apagar   {criterioId, versao}                                   nível geral
//
// Respostas: { sucesso:true, ... } (200; 201 quando cria) · recusa de regra: 422 · 400 dado ruim · 403 sem permissão · 404 não achou.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const esc = require("../shared/escopoRotas");
const { idDe } = require("../shared/entidadesVinculadas");
const db = require("../shared/territorioDb");
const { composicaoCME } = require("../shared/expansaoDb");
const { hojeBrasilia } = require("../shared/dataBrasilia");

const SEM_PERMISSAO = "Você não tem permissão para isso. Fale com quem administra as Permissões.";

function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, r, statusOk = 200) {
  context.res = { status: r.sucesso ? statusOk : (r.proibido ? 403 : (r.naoExiste ? 404 : 422)), body: r };
}

// As ações de escrita e o identificador que cada uma exige no corpo; as do nível geral.
const ESCRITA = {
  "bairro": null, "bairro-editar": "bairroId", "bairro-ativo": "bairroId", "bairro-juntar": "bairroId", "ponto-extensao": "extensaoId",
  "raio": null, "criterio": null, "criterio-editar": "criterioId", "criterio-apagar": "criterioId"
};
const SO_GERAL = new Set(["bairro", "bairro-editar", "bairro-ativo", "bairro-juntar", "raio", "criterio", "criterio-editar", "criterio-apagar"]);

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;
  if (!auth.ehSessaoDeLideranca(usuario)) return erro(context, 403, SEM_PERMISSAO);

  const acao = context.bindingData.acao;
  const metodo = req.method;
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const hoje = hojeBrasilia();
  const por = usuario.membroId;

  const pool = await getPool();
  try {
    const visao = auth.visaoDaPermissao(usuario, "expansao");
    const cme = (await composicaoCME(pool)).some((m) => Number(m.membroId) === Number(por));
    if (!visao && !cme) return erro(context, 403, SEM_PERMISSAO);
    const concessoes = visao ? auth.concessoesDaVisao(visao) : [];
    const alcance = {
      geral: !!visao && esc.ehGeral(visao),
      cme,
      // as mesmas regras da v9.2 (GestaoExpansao): o escopo de uma Extensão não alcança a Mãe; o de departamento não alcança congregação
      cobreMae: (nome) => concessoes.some((c) => !c.escopoExtensaoNome && c.nivel !== "DEPARTAMENTO" && auth.estaNoEscopo(c, nome)),
      dirigeMae: (nome) => concessoes.some((c) => !c.escopoExtensaoNome && c.nivel === "CONGREGACAO" && auth.estaNoEscopo(c, nome))
    };

    if (metodo === "GET") {
      if (acao === "catalogos") { context.res = { status: 200, body: { sucesso: true, ...(await db.catalogos(pool, { alcance })) } }; return; }
      if (acao === "mapa") { context.res = { status: 200, body: { sucesso: true, ...(await db.mapa(pool, { alcance })) } }; return; }
      if (acao === "bairros") {
        if (!alcance.geral) return erro(context, 403, db.SO_GERAL);
        context.res = { status: 200, body: { sucesso: true, bairros: await db.listarBairros(pool) } };
        return;
      }
      if (acao === "extensoes") { context.res = { status: 200, body: { sucesso: true, extensoes: await db.extensoesDoMapa(pool, { alcance }) } }; return; }
      if (acao === "criterios") { context.res = { status: 200, body: { sucesso: true, ...(await db.listarCriterios(pool)) } }; return; }
      if (acao === "simulacao") { context.res = { status: 200, body: { sucesso: true, ...(await db.simulacao(pool, { alcance, hoje })) } }; return; }
      return erro(context, 404, "Ação inválida.");
    }

    if (metodo !== "POST") return erro(context, 405, "Método não suportado.");
    if (!Object.prototype.hasOwnProperty.call(ESCRITA, acao)) return erro(context, 404, "Ação inválida.");
    if (SO_GERAL.has(acao) && !alcance.geral) return erro(context, 403, db.SO_GERAL);
    const campoId = ESCRITA[acao];
    const id = campoId ? idDe(corpo[campoId]) : null;
    if (campoId && !id) return erro(context, 400, `Informe ${campoId}.`);
    const dados = campoId ? { ...corpo, [campoId]: id } : corpo;
    if (acao === "bairro-juntar") {
      const destino = idDe(corpo.destinoId);
      if (!destino) return erro(context, 400, "Informe destinoId.");
      dados.destinoId = destino;
    }
    const base = { dados, por, hoje, alcance };
    let r;
    switch (acao) {
      case "bairro": r = await db.criarBairro(pool, base); break;
      case "bairro-editar": r = await db.editarBairro(pool, base); break;
      case "bairro-ativo": r = await db.ativarBairro(pool, base); break;
      case "bairro-juntar": r = await db.juntarBairros(pool, base); break;
      case "ponto-extensao": r = await db.marcarPontoExtensao(pool, base); break;
      case "raio": r = await db.mudarRaio(pool, base); break;
      case "criterio": r = await db.criarCriterio(pool, base); break;
      case "criterio-editar": r = await db.editarCriterio(pool, base); break;
      case "criterio-apagar": r = await db.apagarCriterio(pool, base); break;
      default: return erro(context, 404, "Ação inválida.");
    }
    resposta(context, r, acao === "bairro" || acao === "criterio" ? 201 : 200);
  } catch (e) {
    context.log.error("[GestaoTerritorio]", e.message);
    erro(context, 500, "Erro interno no mapa territorial.");
  }
};
