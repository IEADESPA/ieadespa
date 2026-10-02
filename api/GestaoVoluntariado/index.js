// GestaoVoluntariado (v7.5 — Escalas e voluntariado)
// Regimento Art. 133 §§ 7 e 8, Art. 133-D e Art. 135 §1º; Lei 9.608/1998.
//
// As escalas (v5.6, /api/escalas) e a esteira de habilitação (v5.7, /api/habilitacao-voluntarios) continuam onde estão. Aqui ficam o que o
// Regimento exige e elas não tinham: o RODÍZIO por grupos com a trava de habitualidade, o TERMO DE ADESÃO (aceite digital com IP/data/hora,
// ficha, e-mail/WhatsApp e a ratificação coletiva "Lista de Ouro"), a REMOÇÃO DA ESCALA com efeito imediato e reintegração.
// Toda a regra está em shared/voluntariado.js (pura, testada); o banco, em shared/voluntariadoDb.js.
//
// Permissões, nenhuma nova (já existiam e não vêm concedidas a papel nenhum):
//   "escalas"                  rodízios, grupos, geração, habitualidade, natureza da equipe (no escopo da congregação);
//   "habilitacao_voluntarios"  adesão ao Termo (ficha/mensagem), ratificação coletiva, cobertura do Termo;
//   as duas                    podem remover da escala e reintegrar (no escopo); o LÍDER da equipe remove e reintegra na própria equipe, sem permissão.
// Qualquer pessoa logada, sobre si mesma: ver e aceitar o Termo, ver os próprios rodízios.
//
// ---- Leitura (GET /api/voluntariado/...) ---------------------------------------------------------
//  catalogos          -> { naturezas[{codigo,rotulo,exigeRevezamento}], diasSemana[{codigo,rotulo}], formasAdesao[], canaisMensageria[], origensRatificacao[],
//                          tiposMotivoRemocao[], ratificacao:{versao,texto,hash}, regras:{ limiteSequencia, maxSemanas, semanasPadrao, maxGrupos, maxSignatariosManuais } }  (login)
//  meu-painel         -> { termo:{versao,titulo,itens[{codigo,texto,base}],aceite,hash}, aderiu, adesao|null, podeAderirDigital, motivoSemAdesaoDigital|null, menorDeIdade, rodizios[{rodizioId,rodizioNome,equipeNome,rotuloDia,hora,
//                          grupoNome,totalGrupos,proximasDatas[AAAA-MM-DD]}] }                                                                  (login)
//  minhas-equipes     -> { equipes[{equipeId,nome,congregacaoNome,natureza,rotuloNatureza,membros[{membroId,nome}],
//                          remocoes[{desligamentoId,membroId,membroNome,equipeId,equipeNome,tipoMotivo,motivo,alocacoesCanceladas,desligadoEm,reintegradoEm,reintegracaoObs,podeReintegrar}]}] }
//                          as equipes que EU lidero (vazio para quem não lidera): é a tela do dirigente que remove e reintegra na própria equipe     (login)
//  adesoes?congregacaoId=     -> { total, comTermo, semTermo, voluntarios[{membroId,nome,equipes,aderiu,forma,rotuloForma,dataAceite,referencia}] }   (habilitacao_voluntarios)
//  ratificacoes       -> { ratificacoes[{ratificacaoId,origem,rotuloOrigem,descricao,dataLista,totalSignatarios,novasAdesoes,registradoEm}] }       (habilitacao_voluntarios)
//  rodizios?congregacaoId=    -> { rodizios[{...rodizio, grupos[{grupoId,nome,ordem,membros[{membroId,nome}]}], composicao:{valido,mensagem}, proximas[{dataIso,grupoId,grupoNome,gerada}]}],
//                                  equipes[{equipeId,nome,natureza,rotuloNatureza,ativa,exigeRevezamento}], equipesSemRodizio[] }                (escalas)
//  rodizio?rodizioId=         -> { rodizio:{...mesma forma} }                                                                                       (escalas)
//  rodizio-previa?rodizioId=&semanas=  -> { ocorrencias[{dataIso,dataHora,grupoId,grupoNome}], jaExistem[], de, ate }                                (escalas)
//  habitualidade?congregacaoId=        -> { alertas[{equipeId,equipeNome,natureza,temRodizio,limite,itens[{membroId,nome,sequencia,desde,ate}]}] }  (escalas)
//  remocoes?congregacaoId= | ?equipeId= -> { remocoes[{desligamentoId,membroId,membroNome,equipeId,equipeNome,tipoMotivo,motivo,alocacoesCanceladas,desligadoEm,reintegradoEm,podeReintegrar}] }
//                                          (escalas ou habilitacao_voluntarios no escopo; ?equipeId= também para o líder da equipe)
//
// ---- Escrita (POST /api/voluntariado/...) --------------------------------------------------------
//  aceitar-termo      body:{aceito:true}   -> o aceite digital: guarda versão, hash do texto, IP, data e hora. Sem IP identificável, recusa.            (login)
//                          O IP é o penúltimo do x-forwarded-for (shared/origemConexao.js). Menor de 18 anos, ou cadastro sem data de nascimento, não adere por aqui.
//  adesao             body:{membroId, forma:FICHA_FISICA|MENSAGERIA, dataAceite, referencia, canal?:EMAIL|WHATSAPP,
//                          responsavelNome?, responsavelVinculo?:PAI|MAE|TUTOR|RESPONSAVEL_LEGAL}    (habilitacao_voluntarios, membro no escopo)
//                          menor de 18 anos: responsavelNome e responsavelVinculo são OBRIGATÓRIOS (quem assinou pelo menor); para maior de idade são descartados
//  ratificar          body:{origem:ASSEMBLEIA_GERAL|REUNIAO_OBREIROS|ESCALA_SERVICO, sessaoId|servicoId, descricao, dataLista, cabecalhoConfirmado:true, membroIds?[]}
//                                           (habilitacao_voluntarios; assembleia/reunião exige escopo geral; escala exige a congregação no escopo)
//  equipe-natureza    body:{equipeId, natureza:LITURGIA|ZELADORIA|PORTARIA|COZINHA|OUTRA}                                                             (escalas)
//  rodizios           body:{congregacaoId, nome, equipeId, diaSemana:0-6, hora:"HH:MM", intervaloSemanas?:1-4, dataAncora}                           (escalas) -> 201
//  rodizio-ativo      body:{rodizioId, ativo:true|false}                                                                                              (escalas)
//  grupos             body:{rodizioId, nome, membroIds?[]}                                                                                            (escalas) -> 201
//  grupo-membro       body:{grupoId, membroId}     entra no grupo (e na equipe); recusa quem foi removido da equipe ou não tem a formação exigida     (escalas)
//  grupo-membro-remover body:{grupoId, membroId}                                                                                                      (escalas)
//  grupo-desativar    body:{grupoId}                                                                                                                  (escalas)
//  gerar              body:{rodizioId, semanas?:1-26, publicar?:false} -> serviços (rascunho ou publicados) + convites aos membros do grupo da vez       (escalas)
//  cancelar-futuros   body:{rodizioId}             cancela os serviços futuros ainda em rascunho, para ajustar e gerar de novo                          (escalas)
//  remover-da-escala  body:{membroId, equipeId?, tipoMotivo?:PERDA_CONFIANCA..., motivo}  efeito imediato; sem equipeId, todas as equipes que o escopo alcança
//  reintegrar         body:{desligamentoId, observacao?}
//
// Respostas: { sucesso:true, ... } (200; 201 quando cria) · recusa de regra: 422 { sucesso:false, mensagem } · 400 dado ruim · 403 sem permissão · 404 não achou.
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const es = require("../shared/escalas");
const vol = require("../shared/voluntariado");
const db = require("../shared/voluntariadoDb");
const { hojeBrasilia } = require("../shared/dataBrasilia");

const SEM_PERMISSAO = "Você não tem permissão para isso. Fale com quem administra as Permissões.";

function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, resultado, statusOk = 200) {
  context.res = { status: resultado.sucesso ? statusOk : (resultado.proibido ? 403 : 422), body: resultado };
}
const lista = (obj) => Object.entries(obj).map(([codigo, rotulo]) => ({ codigo, rotulo }));
const idDe = vol.inteiroPositivo;        // estrito: "0x10", "1e1", true e [5] não são identificadores

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;

  const perms = usuario.permissoes || [];
  const ehEscalas = perms.includes("escalas");
  const ehHabilitacao = perms.includes("habilitacao_voluntarios");
  const escopoGlobal = !usuario.escopoCongregacoes || usuario.escopoCongregacoes === "TODAS";
  const pool = await getPool();
  const acao = context.bindingData.acao;
  const metodo = req.method;
  const corpo = req.body || {};
  const consulta = req.query || {};
  const hoje = hojeBrasilia();

  async function congregacaoNome(congregacaoId) {
    const r = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
    return r.recordset[0] ? r.recordset[0].Nome : null;
  }
  // Permissão + congregação dentro do escopo de quem pede.
  async function alcanca(permitido, congregacaoId) {
    if (!permitido) return false;
    const nome = await congregacaoNome(congregacaoId);
    return !!nome && auth.estaNoEscopo(usuario, nome);
  }
  const autorizacao = { global: escopoGlobal, podeCongregacao: (nome) => auth.estaNoEscopo(usuario, nome) };

  // Quem não tem a permissão recebe 403 antes de qualquer busca: assim a resposta não revela se o rodízio, a equipe ou o membro existe.
  const EXIGE_ESCALAS = ["rodizios", "rodizio", "rodizio-previa", "habitualidade", "equipe-natureza", "rodizio-ativo", "grupos", "grupo-membro", "grupo-membro-remover", "grupo-desativar", "gerar", "cancelar-futuros"];
  const EXIGE_HABILITACAO = ["adesoes", "ratificacoes", "adesao", "ratificar"];

  try {
    if (EXIGE_ESCALAS.includes(acao) && !ehEscalas) return erro(context, 403, SEM_PERMISSAO);
    if (EXIGE_HABILITACAO.includes(acao) && !ehHabilitacao) return erro(context, 403, SEM_PERMISSAO);

    // =============================== Leitura ===============================
    if (metodo === "GET") {
      if (acao === "catalogos") {
        context.res = {
          status: 200,
          body: {
            sucesso: true,
            naturezas: Object.entries(vol.NATUREZAS).map(([codigo, rotulo]) => ({ codigo, rotulo, exigeRevezamento: vol.equipeExigeRevezamento(codigo) })),
            diasSemana: vol.DIAS_SEMANA.map((rotulo, codigo) => ({ codigo, rotulo })),
            formasAdesao: lista(vol.FORMAS_ADESAO), formasRegistroManual: vol.FORMAS_REGISTRO_MANUAL.map(c => ({ codigo: c, rotulo: vol.FORMAS_ADESAO[c] })),
            canaisMensageria: lista(vol.CANAIS_MENSAGERIA), origensRatificacao: lista(vol.ORIGENS_RATIFICACAO), vinculosResponsavel: lista(vol.VINCULOS_RESPONSAVEL),
            tiposMotivoRemocao: vol.TIPOS_MOTIVO_DESLIGAMENTO.map(c => ({ codigo: c })),
            ratificacao: vol.ratificacaoVigente(),
            regras: { limiteSequencia: await db.lerLimiteSequencia(pool), maxSemanas: vol.MAX_SEMANAS_GERACAO, semanasPadrao: vol.SEMANAS_GERACAO_PADRAO, maxGrupos: vol.MAX_GRUPOS, maxSignatariosManuais: vol.MAX_SIGNATARIOS_MANUAIS }
          }
        };
        return;
      }

      if (acao === "meu-painel") {
        const situacao = await db.situacaoDoTermo(pool, usuario.membroId, { hoje });
        context.res = { status: 200, body: { sucesso: true, ...situacao, rodizios: await db.meusRodizios(pool, { membroId: usuario.membroId, hoje }) } };
        return;
      }

      if (acao === "minhas-equipes") {
        context.res = { status: 200, body: { sucesso: true, equipes: await db.equipesLideradas(pool, { membroId: usuario.membroId }) } };
        return;
      }

      if (acao === "adesoes") {
        const congregacaoId = idDe(consulta.congregacaoId);
        if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
        if (!(await alcanca(ehHabilitacao, congregacaoId))) return erro(context, 403, ehHabilitacao ? "Fora do seu escopo de atuação." : SEM_PERMISSAO);
        context.res = { status: 200, body: { sucesso: true, ...(await db.coberturaDoTermo(pool, { congregacaoId, hoje })) } };
        return;
      }

      if (acao === "ratificacoes") {
        if (!ehHabilitacao) return erro(context, 403, SEM_PERMISSAO);
        // Quem não tem escopo geral só vê as ratificações que registrou.
        context.res = { status: 200, body: { sucesso: true, ratificacoes: await db.listarRatificacoes(pool, { porMembroId: escopoGlobal ? null : usuario.membroId }) } };
        return;
      }

      if (acao === "rodizios") {
        const congregacaoId = idDe(consulta.congregacaoId);
        if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
        if (!(await alcanca(ehEscalas, congregacaoId))) return erro(context, 403, ehEscalas ? "Fora do seu escopo de atuação." : SEM_PERMISSAO);
        context.res = { status: 200, body: { sucesso: true, ...(await db.listarRodizios(pool, { congregacaoId, hoje })) } };
        return;
      }

      if (acao === "rodizio" || acao === "rodizio-previa") {
        const rodizioId = idDe(consulta.rodizioId);
        if (!rodizioId) return erro(context, 400, "Informe rodizioId.");
        const rodizio = await db.buscarRodizio(pool, rodizioId);
        if (!rodizio) return erro(context, 404, "Rodízio não encontrado.");
        if (!(await alcanca(ehEscalas, rodizio.congregacaoId))) return erro(context, 403, ehEscalas ? "Fora do seu escopo de atuação." : SEM_PERMISSAO);
        if (acao === "rodizio") {
          context.res = { status: 200, body: { sucesso: true, rodizio: await db.detalharRodizio(pool, rodizioId, { hoje }) } };
          return;
        }
        resposta(context, await db.previaGeracao(pool, { rodizioId, semanas: consulta.semanas, hoje }));
        return;
      }

      if (acao === "habitualidade") {
        const congregacaoId = idDe(consulta.congregacaoId);
        if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
        if (!(await alcanca(ehEscalas, congregacaoId))) return erro(context, 403, ehEscalas ? "Fora do seu escopo de atuação." : SEM_PERMISSAO);
        context.res = { status: 200, body: { sucesso: true, alertas: await db.habitualidade(pool, { congregacaoId, hoje }) } };
        return;
      }

      if (acao === "remocoes") {
        const equipeId = idDe(consulta.equipeId), congregacaoId = idDe(consulta.congregacaoId);
        if (equipeId) {
          const temPermissao = ehEscalas || ehHabilitacao;
          if (!temPermissao && !(await db.lideraAlgumaEquipe(pool, { membroId: usuario.membroId }))) return erro(context, 403, SEM_PERMISSAO);
          const equipe = await es.buscarEquipe(pool, equipeId);
          if (!equipe) return erro(context, 404, "Equipe não encontrada.");
          const lider = await db.liderAtivo(pool, { equipe, membroId: usuario.membroId });
          if (!lider && !(await alcanca(temPermissao, equipe.congregacaoId))) return erro(context, 403, "Só o líder da equipe ou quem administra as escalas.");
          context.res = { status: 200, body: { sucesso: true, remocoes: await db.listarRemocoes(pool, { equipeIds: [equipeId] }) } };
          return;
        }
        if (!congregacaoId) return erro(context, 400, "Informe congregacaoId ou equipeId.");
        if (!(await alcanca(ehEscalas || ehHabilitacao, congregacaoId))) return erro(context, 403, (ehEscalas || ehHabilitacao) ? "Fora do seu escopo de atuação." : SEM_PERMISSAO);
        context.res = { status: 200, body: { sucesso: true, remocoes: await db.listarRemocoes(pool, { congregacaoId }) } };
        return;
      }

      return erro(context, 404, "Ação inválida.");
    }

    // =============================== Escrita ===============================
    if (metodo !== "POST") return erro(context, 405, "Método não suportado.");

    if (acao === "aceitar-termo") {
      resposta(context, await db.aceitarDigital(pool, { membroId: usuario.membroId, aceito: corpo.aceito, ip: vol.extrairIp(req.headers), cadeia: vol.cadeiaDeCabecalhos(req.headers), hoje }), 201);
      return;
    }

    if (acao === "adesao") {
      const membroId = idDe(corpo.membroId);
      if (!membroId) return erro(context, 400, "Informe membroId.");
      if (!ehHabilitacao) return erro(context, 403, SEM_PERMISSAO);
      const m = await pool.request().input("id", sql.Int, membroId).query(`SELECT m.MembroId, c.Nome AS CongregacaoNome FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @id`);
      if (!m.recordset[0]) return erro(context, 404, "Voluntário não encontrado.");
      if (!auth.estaNoEscopo(usuario, m.recordset[0].CongregacaoNome)) return erro(context, 403, "Fora do seu escopo de atuação.");
      resposta(context, await db.registrarAdesaoManual(pool, { membroId, dados: corpo, por: usuario.membroId, hoje }), 201);
      return;
    }

    if (acao === "ratificar") {
      if (!ehHabilitacao) return erro(context, 403, SEM_PERMISSAO);
      resposta(context, await db.ratificar(pool, { dados: corpo, por: usuario.membroId, autorizacao, hoje }), 201);
      return;
    }

    if (acao === "equipe-natureza") {
      const equipeId = idDe(corpo.equipeId);
      if (!equipeId) return erro(context, 400, "Informe equipeId.");
      const equipe = await es.buscarEquipe(pool, equipeId);
      if (!equipe) return erro(context, 404, "Equipe não encontrada.");
      if (!(await alcanca(ehEscalas, equipe.congregacaoId))) return erro(context, 403, ehEscalas ? "Fora do seu escopo de atuação." : SEM_PERMISSAO);
      resposta(context, await db.definirNaturezaEquipe(pool, { equipe, natureza: corpo.natureza, por: usuario.membroId }));
      return;
    }

    if (acao === "rodizios") {
      const congregacaoId = idDe(corpo.congregacaoId);
      if (!congregacaoId) return erro(context, 400, "Informe congregacaoId.");
      if (!(await alcanca(ehEscalas, congregacaoId))) return erro(context, 403, ehEscalas ? "Fora do seu escopo de atuação." : SEM_PERMISSAO);
      resposta(context, await db.criarRodizio(pool, { dados: corpo, congregacaoId, por: usuario.membroId }), 201);
      return;
    }

    // Daqui em diante, as ações partem de um rodízio (direto ou pelo grupo) e exigem "escalas" na congregação dele.
    async function rodizioAutorizado(rodizioId) {
      const rodizio = await db.buscarRodizio(pool, rodizioId);
      if (!rodizio) { erro(context, 404, "Rodízio não encontrado."); return null; }
      if (!(await alcanca(ehEscalas, rodizio.congregacaoId))) { erro(context, 403, ehEscalas ? "Fora do seu escopo de atuação." : SEM_PERMISSAO); return null; }
      return rodizio;
    }
    async function grupoAutorizado(grupoId) {
      const grupo = await db.buscarGrupo(pool, grupoId);
      if (!grupo) { erro(context, 404, "Grupo não encontrado."); return {}; }
      const rodizio = await rodizioAutorizado(grupo.rodizioId);
      return rodizio ? { grupo, rodizio } : {};
    }

    if (acao === "rodizio-ativo") {
      const rodizioId = idDe(corpo.rodizioId);
      if (!rodizioId || typeof corpo.ativo !== "boolean") return erro(context, 400, "Informe rodizioId e ativo (true/false).");
      const rodizio = await rodizioAutorizado(rodizioId);
      if (!rodizio) return;
      resposta(context, await db.alterarAtivoRodizio(pool, { rodizio, ativo: corpo.ativo, por: usuario.membroId }));
      return;
    }

    if (acao === "grupos") {
      const rodizioId = idDe(corpo.rodizioId);
      if (!rodizioId) return erro(context, 400, "Informe rodizioId.");
      const rodizio = await rodizioAutorizado(rodizioId);
      if (!rodizio) return;
      resposta(context, await db.criarGrupo(pool, { rodizio, nome: corpo.nome, membroIds: Array.isArray(corpo.membroIds) ? corpo.membroIds : [], por: usuario.membroId, podeCongregacao: autorizacao.podeCongregacao }), 201);
      return;
    }

    if (acao === "grupo-membro" || acao === "grupo-membro-remover") {
      const grupoId = idDe(corpo.grupoId), membroId = idDe(corpo.membroId);
      if (!grupoId || !membroId) return erro(context, 400, "Informe grupoId e membroId.");
      const { grupo, rodizio } = await grupoAutorizado(grupoId);
      if (!grupo) return;
      const f = acao === "grupo-membro" ? db.adicionarMembroAoGrupo : db.removerMembroDoGrupo;
      resposta(context, await f(pool, { rodizio, grupo, membroId, por: usuario.membroId, podeCongregacao: autorizacao.podeCongregacao }));
      return;
    }

    if (acao === "grupo-desativar") {
      const grupoId = idDe(corpo.grupoId);
      if (!grupoId) return erro(context, 400, "Informe grupoId.");
      const { grupo, rodizio } = await grupoAutorizado(grupoId);
      if (!grupo) return;
      resposta(context, await db.desativarGrupo(pool, { rodizio, grupo, por: usuario.membroId }));
      return;
    }

    if (acao === "gerar" || acao === "cancelar-futuros") {
      const rodizioId = idDe(corpo.rodizioId);
      if (!rodizioId) return erro(context, 400, "Informe rodizioId.");
      const rodizio = await rodizioAutorizado(rodizioId);
      if (!rodizio) return;
      resposta(context, acao === "gerar"
        ? await db.gerarRodizio(pool, { rodizioId, dados: corpo, por: usuario.membroId, hoje })
        : await db.cancelarServicosFuturos(pool, { rodizio, por: usuario.membroId, hoje }));
      return;
    }

    if (acao === "remover-da-escala") {
      const membroId = idDe(corpo.membroId), equipeId = corpo.equipeId == null || corpo.equipeId === "" ? null : idDe(corpo.equipeId);
      if (!membroId) return erro(context, 400, "Informe membroId.");
      if (corpo.equipeId != null && corpo.equipeId !== "" && !equipeId) return erro(context, 400, "equipeId inválido.");
      let podeCongregacao;
      if (ehEscalas || ehHabilitacao) podeCongregacao = autorizacao.podeCongregacao;
      else {
        // Sem permissão: só o líder da própria equipe (Art. 133-D, III: "o Dirigente simplesmente informará").
        // Quem nem lidera equipe recebe 403 ANTES de qualquer busca (a resposta não revela se a equipe existe); o líder removido da própria equipe perde o poder.
        if (!equipeId || !(await db.lideraAlgumaEquipe(pool, { membroId: usuario.membroId }))) return erro(context, 403, SEM_PERMISSAO);
        const equipe = await es.buscarEquipe(pool, equipeId);
        if (!equipe || !(await db.liderAtivo(pool, { equipe, membroId: usuario.membroId }))) return erro(context, 403, "Só o líder da equipe ou quem administra as escalas pode remover alguém da escala.");
        podeCongregacao = null;
      }
      resposta(context, await db.removerDaEscala(pool, { dados: corpo, equipeId, podeCongregacao, por: usuario.membroId, hoje }));
      return;
    }

    if (acao === "reintegrar") {
      const desligamentoId = idDe(corpo.desligamentoId);
      if (!desligamentoId) return erro(context, 400, "Informe desligamentoId.");
      const temPermissao = ehEscalas || ehHabilitacao;
      // Quem nem tem permissão nem lidera equipe recebe 403 antes de qualquer busca: a resposta não revela se o registro existe.
      if (!temPermissao && !(await db.lideraAlgumaEquipe(pool, { membroId: usuario.membroId }))) return erro(context, 403, SEM_PERMISSAO);
      const d = await db.buscarRemocao(pool, desligamentoId);
      if (!d) return erro(context, 404, "Registro de remoção não encontrado.");
      // A gestão (no escopo) reintegra qualquer um. O LÍDER só reintegra o que ele mesmo removeu — não desfaz a decisão da gestão nem de outro líder — e só
      // enquanto ele próprio não estiver removido da equipe. Ninguém reintegra a si mesmo (a regra está em db.reintegrar).
      let autorizado = temPermissao && (await alcanca(true, d.CongregacaoId));
      if (!autorizado && d.EquipeId && Number(d.RegistradoPorMembroId) === Number(usuario.membroId)) {
        const equipe = await es.buscarEquipe(pool, d.EquipeId);
        autorizado = await db.liderAtivo(pool, { equipe, membroId: usuario.membroId });
      }
      if (!autorizado) return erro(context, 403, "Só quem registrou a remoção (se for o líder da equipe) ou quem administra as escalas pode reintegrar.");
      resposta(context, await db.reintegrar(pool, { desligamentoId, observacao: corpo.observacao, por: usuario.membroId, hoje }));
      return;
    }

    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoVoluntariado] erro:", e);
    erro(context, 500, "Erro interno ao processar o voluntariado.");
  }
};
