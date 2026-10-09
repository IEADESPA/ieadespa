// GestaoConsentimentoMenor (v7.7 — Habilitação para Ministério com Menores)
// LGPD art. 14, § 1º: o consentimento ESPECÍFICO e em DESTAQUE do responsável legal para tratar dado de criança ou adolescente — a imagem (foto no cadastro, no
// crachá e em materiais internos) e a alergia ou condição de saúde que ele escolher informar para o crachá do check-in infantil (v7.10; LGPD art. 11, I). Versionado
// (texto com hash), revogável a qualquer momento, e OPCIONAL: nunca condiciona a participação do menor.
//
// Toda a regra está em shared/menoresConsentimento.js (pura, testada); o banco, em shared/menoresConsentimentoDb.js. A trilha é de acréscimo (cada concessão ou
// revogação é uma linha nova) e o estado atual é a última linha; a autorização só vale enquanto quem a deu ainda é responsável ATIVO do menor (cadastrado pela
// Secretaria em Voluntariado → Responsáveis, com o documento conferido) e o menor ainda tem menos de 18 anos.
//
// Quem pode o quê (a matrícula do responsável é SEMPRE a da sessão — nunca vem da URL nem do corpo; por isso não há exigirTitular aqui):
//   qualquer login (inclusive PIN e código)   ler os textos; ver os próprios menores; CONCEDER e REVOGAR como responsável ativo do menor (como o aceite da v7.5);
//   "habilitacao_voluntarios" (sessão de liderança, congregação do menor no escopo)   ver o menor e REGISTRAR A FICHA assinada pelo responsável.
//
// ---- Leitura (GET /api/consentimento-menor/...) --------------------------------------------------
//  textos           -> { versao, finalidades[{codigo,rotulo}], textos[{finalidade,rotulo,versao,titulo,itens[{codigo,base,texto}],aceite,hash}] }   o texto que a tela mostra e o
//                       hash que ela devolve ao autorizar                                                                                                       (login)
//  meus-menores     -> { menores[{menorId,nome,idade,vinculo,rotuloVinculo,estados:{IMAGEM,SAUDE_CRACHA}}] }   os menores (menos de 18 anos) de quem o logado é responsável ATIVO   (login)
//  menor?menorId=   -> { menor:{membroId,nome,idade,aindaMenor,congregacaoNome?}, estados|null, responsaveis[{nome,vinculo,rotuloVinculo,membroId?}], visao:'RESPONSAVEL'|'GESTAO', mensagem? }
//                       o responsável ativo do menor, ou a Secretaria (permissão + pessoa no escopo, que também vê a matrícula de quem concedeu e a referência da ficha);
//                       quem não tem relação recebe 404, igual a "não existe"                                                                                     (login)
//   estado de cada finalidade: { finalidade, rotuloFinalidade, situacao:CONCEDIDO|REVOGADO|NUNCA_DADO|SEM_RESPONSAVEL_ATIVO, rotulo, vigente, mensagem, podeConceder,
//                                quemAutorizouSaiu, textoVersao?, desatualizado?, forma?, rotuloForma?, registradoEm?, integridade, concedidoPorVoce, ... }
//
// ---- Escrita (POST /api/consentimento-menor/...) -------------------------------------------------
//  conceder         body:{menorId, finalidade:IMAGEM|SAUDE_CRACHA, aceito:true, termoHash} -> 201 { consentimentoId, mensagem, estado }. `termoHash` é o hash do texto que a tela
//                       MOSTROU (textos → hash): se o texto mudou desde então, recusa (422 com `termoMudou:true`). Sem IP público identificável, recusa. Só o responsável
//                       ativo do menor (403 igual para menor inexistente e responsável de outro); o menor precisa ter idade conhecida < 18.      (login, o responsável)
//  revogar          body:{menorId, finalidade} -> 200 { mensagem, estado, fotoApagada, jaRevogada? }. Qualquer responsável ativo revoga; sem caixa, sem hash e sem exigir IP
//                       público. Revogar IMAGEM APAGA o arquivo da foto do menor e zera a referência.                                           (login, o responsável)
//  registrar-ficha  body:{menorId, responsavelId, finalidade, concedido:true|false, referencia} -> 201 { consentimentoId, mensagem, estado }. A Secretaria registra a ficha
//                       assinada pelo responsável (concede ou revoga); `referencia` diz onde a ficha está. Quem registra não é o responsável que assinou nem o menor; o
//                       responsável tem de ser ativo deste menor.                                           (habilitacao_voluntarios, sessão de liderança, pessoa do menor no escopo)
//
// Respostas: { sucesso:true, ... } (200; 201 quando cria) · recusa de regra: 422 { sucesso:false, mensagem } · 400 dado ruim (id ou finalidade malformados) · 403 sem
// permissão · 404 não achou. Quem não tem a permissão recebe 403 ANTES de qualquer busca; quem não tem relação com o menor recebe 404, igual a "não existe".
// Identificadores são estritos (vol.inteiroPositivo): "0x10", "1e1", true e [5] não são identificadores.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const esc = require("../shared/escopoRotas");
const vol = require("../shared/voluntariado");
const origem = require("../shared/origemConexao");
const mc = require("../shared/menoresConsentimento");
const db = require("../shared/menoresConsentimentoDb");
const { hojeBrasilia } = require("../shared/dataBrasilia");

const SEM_PERMISSAO = "Você não tem permissão para isso. Fale com quem administra as Permissões.";

function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, resultado, statusOk = 200) {
  context.res = { status: resultado.sucesso ? statusOk : (resultado.proibido ? 403 : 422), body: resultado };
}
const idDe = vol.inteiroPositivo;        // estrito: "0x10", "1e1", true e [5] não são identificadores

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;

  // A Secretaria: sessão de liderança (senha) com a permissão `habilitacao_voluntarios`. Sessão de PIN ou de código é de MEMBRO — serve para o responsável agir pelo
  // próprio menor, nunca como Secretaria, mesmo que a pessoa também tenha cargo. A visão traz só as concessões daquela permissão: o escopo conferido é o dela.
  const lideranca = auth.ehSessaoDeLideranca(usuario);
  const gestao = lideranca ? auth.visaoDaPermissao(usuario, "habilitacao_voluntarios") : null;
  // O escopo é o da PESSOA do menor (congregação e, se for o caso, Extensão da Tenda).
  const alcancaPessoa = (congregacaoNome, extensaoNome) => !!gestao && esc.noEscopoDaPessoa(gestao, congregacaoNome || null, extensaoNome || null);

  const pool = await getPool();
  const acao = context.bindingData.acao;
  const metodo = req.method;
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const consulta = req.query || {};
  const hoje = hojeBrasilia();

  const EXIGE_GESTAO = ["registrar-ficha"];

  try {
    if (EXIGE_GESTAO.includes(acao) && !gestao) return erro(context, 403, SEM_PERMISSAO);

    // =============================== Leitura ===============================
    if (metodo === "GET") {
      if (acao === "textos") {
        context.res = {
          status: 200,
          body: {
            sucesso: true, versao: mc.CONSENTIMENTO_VERSAO,
            finalidades: mc.CODIGOS_FINALIDADE.map((codigo) => ({ codigo, rotulo: mc.FINALIDADES[codigo] })),
            textos: mc.textosVigentes()
          }
        };
        return;
      }

      if (acao === "meus-menores") {
        context.res = { status: 200, body: { sucesso: true, menores: await db.menoresDoResponsavel(pool, usuario.membroId, { hoje }) } };
        return;
      }

      if (acao === "menor") {
        const menorId = idDe(consulta.menorId);
        if (!menorId) return erro(context, 400, "Informe menorId.");
        const acesso = await db.acessoAoMenor(pool, { menorId, membroId: usuario.membroId });
        const daGestao = !!acesso.menor && alcancaPessoa(acesso.menor.CongregacaoNome, acesso.menor.ExtensaoNome);
        // Menor que não existe, pessoa fora do escopo e quem não é responsável dele: a MESMA resposta (a rota não serve de sonda de matrículas).
        if (!acesso.menor || (!acesso.ehResponsavel && !daGestao)) return erro(context, 404, mc.MENSAGENS.MENOR_NAO_ACHADO);
        const r = await db.estadoDoMenor(pool, menorId, { hoje, menor: acesso.menor, paraGestao: daGestao, visitanteId: usuario.membroId });
        context.res = { status: r.sucesso ? 200 : 404, body: r.sucesso ? { ...r, visao: daGestao ? "GESTAO" : "RESPONSAVEL" } : r };
        return;
      }

      return erro(context, 404, "Ação inválida.");
    }

    // =============================== Escrita ===============================
    if (metodo !== "POST") return erro(context, 405, "Método não suportado.");

    if (acao === "conceder" || acao === "revogar" || acao === "registrar-ficha") {
      const menorId = idDe(corpo.menorId);
      if (!menorId) return erro(context, 400, "Informe menorId.");
      const fin = mc.validarFinalidade(corpo.finalidade);
      if (!fin.valido) return erro(context, 400, fin.mensagem);

      if (acao === "conceder") {
        // O IP é o do RESPONSÁVEL (o da sessão que clica); sem IP público identificável não há prova, e o aceite é recusado.
        resposta(context, await db.conceder(pool, { menorId, responsavelId: usuario.membroId, finalidade: corpo.finalidade, aceito: corpo.aceito, textoHash: corpo.termoHash, ip: vol.extrairIp(req.headers), cadeia: vol.cadeiaDeCabecalhos(req.headers), hoje }), 201);
        return;
      }
      if (acao === "revogar") {
        // Revogar nunca fica refém do IP: se o público não foi identificado, vale o que houver (e, sem nada, o marcador "indisponivel").
        const ip = vol.extrairIp(req.headers) || origem.ipDoCliente(req.headers, { apenasPublico: false });
        resposta(context, await db.revogar(pool, { menorId, responsavelId: usuario.membroId, finalidade: corpo.finalidade, ip, cadeia: vol.cadeiaDeCabecalhos(req.headers), hoje }));
        return;
      }
      const responsavelId = idDe(corpo.responsavelId);
      if (!responsavelId) return erro(context, 400, "Informe responsavelId.");
      resposta(context, await db.registrarManual(pool, {
        menorId, responsavelId, finalidade: corpo.finalidade, concedido: corpo.concedido, referencia: corpo.referencia, por: usuario.membroId,
        autorizacao: { podeMembro: alcancaPessoa }, hoje
      }), 201);
      return;
    }

    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoConsentimentoMenor] erro:", e);
    erro(context, 500, "Erro interno ao processar o consentimento do responsável.");
  }
};
