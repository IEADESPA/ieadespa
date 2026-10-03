// GestaoCanais (v7.3 — Canais Oficiais e Comunicação: Estatuto Art. 11 V e Art. 12; Regimento Art. 157 §5º, 160 e 160-A)
//
// Toda a regra (o que é canal oficial, o relógio de 24 horas, conformidade, sucessão) está em
// shared/canais.js (pura, testada); o banco, em shared/canaisDb.js. Este arquivo só expõe HTTP +
// permissão + escopo.
//
// Uma permissão (migração 115), nunca concedida a papel nenhum por padrão:
//   "canais_gestao"  Secretaria Geral/Comunicação: registra e mantém a relação de canais (Art. 12 §1º),
//                    designa administradores, custodia as senhas, confere a conformidade, registra a
//                    transmissão dos cultos e decide as ocorrências. Respeita o ESCOPO: escopo global vê
//                    tudo; dirigente só os canais da própria congregação; canal do campo, de Área
//                    inteira ou de departamento exige escopo global.
// Sem permissão nenhuma (qualquer login, inclusive o voluntário que entra por código de acesso):
//   - lê o catálogo, o termo e o diretório de canais; avisa conteúdo irregular (limite de 10 por hora);
//   - quem é ADMINISTRADOR/OPERADOR de um canal aceita o Termo de Dever de Moderação, vê as ocorrências
//     do SEU canal (sem saber quem avisou) e registra a remoção, com a prova.
//
// ---- Leitura (GET /api/canais/...) -------------------------------------------------------------
//  catalogos              -> { plataformas[{codigo,rotulo,tipoIdent,credencial,notifica,grupo,rede}], categorias[{codigo,rotulo,artigo}],
//                              temasFocados[{codigo,rotulo,artigo}], escopos[{codigo,rotulo}], vinculos[{codigo,rotulo}], papeisAdmin[{codigo,rotulo}],
//                              categoriasOcorrencia[{codigo,rotulo,artigo,gravidade,tema}], motivosTroca[{codigo,rotulo}],
//                              areaCegaSituacoes[{codigo,rotulo}], prazoRemocaoHoras, avisoAtencao, fraseRedirecionamento, modeloTermoDeUso }   (login)
//  referencias            -> { escopoGlobal, congregacoes[{id,nome,areaId,noMeuEscopo}], areas[{id,nome}], departamentos[{id,sigla,nome}] }     (login)
//  termo                  -> { termo:{versao,titulo,itens[],hash} }                                                                                (login)
//  meus                   -> { termo, canais[{adminId,papel,rotuloPapel,termoAceito,termoAceitoEm,ocorrenciasAbertas,ocorrenciasVencidas,
//                              canal:{canalId,nome,rotuloPlataforma,rotuloCategoria,rotuloEscopo,ativo,descricao,temaFocado,rotuloTema},
//                              orientacoes:{modeloTermoDeUso,avisoAtencao,fraseRedirecionamento}}], termosPendentes }                              (login)
//  diretorio              -> { canais[{canalId,nome,rotuloPlataforma,rotuloCategoria,rotuloEscopo,escopo,congregacaoId}] }  só ativos, para escolher onde avisar (login)
//  para-contato           -> { canais[{canalId,nome,rotuloPlataforma,identificador,cadastroIncompleto}] }  canais que valem como tentativa de contato (Abandono Digital) (login)
//  minhas-ocorrencias     -> { ocorrencias[...] }  o que EU avisei, com a situação                                                               (login)
//  ocorrencias[?status=ABERTA|REMOVIDA|IMPROCEDENTE&canalId=] -> { comoGestao, ocorrencias[...] }  gestão: todas no escopo (com quem avisou);
//                            administrador: as dos seus canais (SEM quem avisou)
//  ocorrencia?ocorrenciaId=  -> { ocorrencia, acoes:{remover,improcedente,advertir} }  gestão no escopo, administrador do canal ou quem avisou
//  canais[?todos=1]       -> { canais[{...canal, situacao, pendencias[{codigo,gravidade,mensagem}], administradoresAtivos, ultimaConferencia}] }      (gestão)
//  canal?canalId=         -> { canal, situacao, pendencias, administradores[{adminId,membroId,nome,papel,termoVersaoAceita,termoAceitoEm}],
//                              trocasAbertas[], conferencias[], itensConferencia[{codigo,texto,artigo}], ocorrenciasRecentes[], orientacoes }      (gestão)
//  trocas[?todas=1]       -> { trocas[{trocaId,canalId,canalNome,motivo,rotuloMotivo,acao,saiuNome,prazoEm,vencida,...}] }  (gestão; atualiza a sucessão antes)
//  cobertura              -> { resumo{...contadores}, canaisComPendencia[], congregacoes[{congregacaoId,congregacaoNome,canaisProprios,semCanal,
//                              situacao,pendencias[],transmite,...}] }  (gestão; atualiza a sucessão antes)
//  transmissao            -> { congregacoes[...] }  Art. 160 §2º: transmissão, placa de aviso e Área Cega por congregação                           (gestão)
//
// ---- Escrita (POST /api/canais/...) ------------------------------------------------------------
//  canais                 body:{nome,plataforma,categoria,temaFocado?,identificador,vinculoInstitucional,declaracaoInstitucional:true,escopo,
//                               congregacaoId?|areaId?|departamentoId?,incluiMenores?,publicoNoSite?,custodiaSecretaria?,descricao?}   (gestão) -> 201
//  canais/atualizar       body:{canalId, ...campos do cadastro}                                                                                   (gestão)
//  canais/desativar       body:{canalId, motivo}   canais/reativar  body:{canalId}                                                                (gestão)
//  administradores/designar  body:{canalId, membroId, papel:ADMINISTRADOR|OPERADOR}                                                               (gestão)
//  administradores/encerrar  body:{adminId, motivo}  -> abre a pendência de troca de senha/acesso                                                 (gestão)
//  termo/aceitar          body:{adminId} | {todos:true}  só a PRÓPRIA designação                                                                  (login)
//  ocorrencias            body:{canalId,categoria,descricao,linkEvidencia?}  -> 201; o relógio de 24 h corre a partir daqui                       (login)
//  ocorrencias/remover    body:{ocorrenciaId,provaRemocao,linkProva?,removidaEm?}                                                                 (gestão no escopo ou administrador do canal)
//  ocorrencias/improcedente  body:{ocorrenciaId,motivo}                                                                                           (gestão)
//  ocorrencias/advertir   body:{ocorrenciaId,observacao}                                                                                          (gestão ou administrador do canal)
//  credenciais/resolver   body:{trocaId,observacao}  (nunca a senha)                                                                              (gestão)
//  credenciais/registrar  body:{canalId,motivo:SUSPEITA_INVASAO|ROTINA,observacao?}                                                               (gestão)
//  conferencias           body:{canalId,itens:{CODIGO:true|false},observacao?}                                                                    (gestão)
//  transmissao            body:{congregacaoId,transmite,placaAvisoInstaladaEm?,areaCegaSituacao?,areaCegaDescricao?}                             (gestão)
//  sincronizar            body:{}  -> compara quem lidera cada congregação/Área/departamento e abre as trocas de senha pendentes                  (gestão)
//
// Escopo (auditoria de 02/10/2026): canal, ocorrência, congregação e designação FORA do escopo dão a mesma resposta de "não existe" (404); `sincronizar` e o sincronismo de
// `trocas`/`cobertura` são só do nível geral (papel GLOBAL e escopo TODAS); os contadores de `cobertura.resumo` somam só os canais do escopo; quem só AVISOU uma ocorrência
// não vê advertência, prova de remoção, quem removeu nem motivo de improcedência; `para-contato` só traz o identificador a quem tem `disciplina` (Abandono Digital) ou `canais_gestao`.
//
// Respostas: { sucesso:true, ... } (200; 201 quando cria) · recusa de regra: 422 { sucesso:false, mensagem } · 400 dado ruim · 403 sem permissão · 401 sem sessão.
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const canais = require("../shared/canais");
const db = require("../shared/canaisDb");
const { hojeBrasilia } = require("../shared/dataBrasilia");
const { criarLimitador } = require("../shared/limiteTaxa");
const { ehGeral, MSG_GERAL } = require("../shared/escopoRotas");

// Avisar conteúdo é aberto a qualquer login: o limite por pessoa segura quem tentar inundar a Secretaria.
const limitadorOcorrencias = criarLimitador({ janelaMs: 3600000, maximo: 10 });

const SEM_PERMISSAO = "Você não tem permissão para isso. Fale com quem administra as Permissões.";

function erro(context, status, mensagem) { context.res = { status, body: { sucesso: false, mensagem } }; }
function resposta(context, resultado, statusOk = 200) { context.res = { status: resultado.sucesso ? statusOk : 422, body: resultado }; }

const lista = (obj, extra = () => ({})) => Object.entries(obj).map(([codigo, v]) => (typeof v === "string" ? { codigo, rotulo: v } : { codigo, ...v, ...extra(codigo, v) }));

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;

  const perms = usuario.permissoes || [];
  const ehGestao = perms.includes("canais_gestao");
  // Falha FECHADO: sessão sem a lista de congregações não alcança nenhum canal (antes, "sem lista" valia como escopo global).
  // v7.6 — o escopo e o nível geral são os da permissão "canais_gestao" (só as concessões que a têm); quem não a tem usa a sessão inteira (só para a tela).
  const vCanais = auth.visaoDaPermissao(usuario, "canais_gestao") || usuario;
  const escopoGlobal = vCanais.escopoCongregacoes === "TODAS";
  const escopo = escopoGlobal ? "TODAS" : (Array.isArray(vCanais.escopoCongregacoes) ? vCanais.escopoCongregacoes : []);
  const geral = ehGeral(vCanais);   // papel GLOBAL E escopo TODAS: só ele dispara o sincronismo da igreja inteira
  const membroId = usuario.membroId || null;

  const acao = context.bindingData.acao || "";
  const metodo = req.method;
  const q = req.query || {};
  const corpo = req.body || {};
  const hoje = hojeBrasilia();

  const pool = await getPool();
  const ctx = await db.carregarContexto(pool);

  const canalNoEscopo = (c) => canais.escopoCobreCanal(escopo, c, ctx);
  function exigirGestao() {
    if (!ehGestao) { erro(context, 403, SEM_PERMISSAO); return false; }
    return true;
  }
  const idDe = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

  // Canal pelo corpo/consulta, já conferindo o escopo de quem gere. Devolve o canal ou null (já respondeu). Canal de fora do escopo dá a MESMA resposta de canal
  // que não existe (404): a rota não serve de sonda de canalId. `naoExiste`: a mensagem que a rota que chegou aqui já dava para "não existe".
  async function canalGerido(origem, naoExiste = "Canal não encontrado.") {
    const id = idDe(origem.canalId);
    if (!id) { erro(context, 400, "Informe o canalId."); return null; }
    const canal = await db.buscarCanal(pool, id, ctx);
    if (!canal || !canalNoEscopo(canal)) { erro(context, 404, naoExiste); return null; }
    return canal;
  }

  // Relação de quem pode agir numa ocorrência.
  async function contextoDaOcorrencia(ocorrenciaId) {
    const bruta = await db.buscarOcorrenciaBruta(pool, ocorrenciaId);
    if (!bruta) return null;
    const canal = await db.buscarCanal(pool, bruta.CanalId, ctx);
    const papeis = membroId ? await db.papeisNoCanal(pool, bruta.CanalId, membroId) : [];
    return {
      bruta, canal,
      gestao: ehGestao && !!canal && canalNoEscopo(canal),
      administrador: papeis.length > 0,
      autor: membroId != null && bruta.RelatadaPorMembroId === membroId
    };
  }

  try {
    // ================= Leitura =================
    if (metodo === "GET") {
      if (acao === "catalogos") {
        context.res = { status: 200, body: {
          sucesso: true,
          plataformas: lista(canais.PLATAFORMAS),
          categorias: lista(canais.CATEGORIAS_CANAL),
          temasFocados: lista(canais.TEMAS_FOCADOS),
          escopos: lista(canais.ESCOPOS), vinculos: lista(canais.VINCULOS), papeisAdmin: lista(canais.PAPEIS_ADMIN),
          categoriasOcorrencia: lista(canais.CATEGORIAS_OCORRENCIA),
          motivosTroca: lista(canais.MOTIVOS_TROCA), areaCegaSituacoes: lista(canais.AREA_CEGA_SITUACOES),
          prazoRemocaoHoras: canais.PRAZO_REMOCAO_HORAS, avisoAtencao: canais.AVISO_ATENCAO,
          fraseRedirecionamento: canais.FRASE_REDIRECIONAMENTO, modeloTermoDeUso: canais.modeloTermoDeUso()
        } };
        return;
      }
      if (acao === "referencias") {
        const noMeuEscopo = (c) => escopoGlobal || (Array.isArray(escopo) && escopo.includes(c.nome));
        context.res = { status: 200, body: {
          sucesso: true, escopoGlobal,
          congregacoes: [...ctx.congregacoes.values()].filter(c => c.ativa).map(c => ({ id: c.id, nome: c.nomeExibicao, areaId: c.areaId, noMeuEscopo: noMeuEscopo(c) })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
          areas: [...ctx.areas.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
          departamentos: [...ctx.departamentos.values()]
        } };
        return;
      }
      if (acao === "termo") { context.res = { status: 200, body: { sucesso: true, termo: canais.termoVigente() } }; return; }
      if (acao === "meus") {
        if (!membroId) { context.res = { status: 200, body: { sucesso: true, termo: canais.termoVigente(), canais: [], termosPendentes: 0 } }; return; }
        context.res = { status: 200, body: { sucesso: true, ...(await db.meusCanais(pool, ctx, membroId)) } };
        return;
      }
      if (acao === "diretorio") {
        const todos = await db.carregarCanais(pool, ctx, { incluirInativos: false });
        context.res = { status: 200, body: { sucesso: true, canais: todos.map(c => ({ canalId: c.canalId, nome: c.nome, rotuloPlataforma: c.rotuloPlataforma, rotuloCategoria: c.rotuloCategoria, rotuloEscopo: c.rotuloEscopo, escopo: c.escopo, congregacaoId: c.congregacaoId })) } };
        return;
      }
      if (acao === "para-contato") {
        // O identificador (número, e-mail) do canal só vai para quem usa a lista de verdade: o Abandono Digital (`disciplina`) e a gestão de canais. Os demais veem só o nome.
        const comIdentificador = ehGestao || perms.includes("disciplina");
        context.res = { status: 200, body: { sucesso: true, canais: await db.listarParaContato(pool, ctx, { comIdentificador }) } };
        return;
      }
      if (acao === "minhas-ocorrencias") {
        // Quem só avisou acompanha o andamento; não vê os textos internos (advertência, prova de remoção, motivo de improcedência) — eles descrevem um terceiro.
        const ocs = membroId ? await db.carregarOcorrencias(pool, ctx, { relatadaPor: membroId, verAutor: false, verInterno: false }) : [];
        context.res = { status: 200, body: { sucesso: true, ocorrencias: ocs } };
        return;
      }
      if (acao === "ocorrencias") {
        const status = q.status ? String(q.status).toUpperCase() : null;
        if (status && !canais.STATUS_OCORRENCIA[status]) { erro(context, 400, "Situação inválida."); return; }
        const canalId = q.canalId ? idDe(q.canalId) : null;
        if (q.canalId && !canalId) { erro(context, 400, "canalId inválido."); return; }
        if (ehGestao) {
          const visiveis = (await db.carregarCanais(pool, ctx, { incluirInativos: true })).filter(canalNoEscopo).map(c => c.canalId);
          const ocs = await db.carregarOcorrencias(pool, ctx, { status, canalId, canaisIds: visiveis, verAutor: true });
          context.res = { status: 200, body: { sucesso: true, comoGestao: true, ocorrencias: ocs } };
          return;
        }
        const meus = membroId ? (await db.meusCanais(pool, ctx, membroId)).canais.map(c => c.canal.canalId) : [];
        const ids = canalId ? meus.filter(i => i === canalId) : meus;
        const ocs = await db.carregarOcorrencias(pool, ctx, { status, canaisIds: ids, verAutor: false });
        context.res = { status: 200, body: { sucesso: true, comoGestao: false, ocorrencias: ocs } };
        return;
      }
      if (acao === "ocorrencia") {
        const id = idDe(q.ocorrenciaId);
        if (!id) { erro(context, 400, "Informe ocorrenciaId."); return; }
        const c = await contextoDaOcorrencia(id);
        // Sem relação com a ocorrência = a mesma resposta de ocorrência que não existe (sem sonda de id).
        if (!c || !(c.gestao || c.administrador || c.autor)) { erro(context, 404, "Ocorrência não encontrada."); return; }
        const [oc] = await db.carregarOcorrencias(pool, ctx, { ocorrenciaId: id, verAutor: c.gestao, verInterno: c.gestao || c.administrador });
        const aberta = c.bruta.Status === "ABERTA";
        context.res = { status: 200, body: { sucesso: true, ocorrencia: (c.gestao || c.administrador) ? oc : { ...oc, orientacao: undefined, temaRedirecionamento: undefined }, acoes: {
          remover: aberta && (c.gestao || c.administrador), improcedente: aberta && c.gestao, advertir: c.bruta.Status !== "IMPROCEDENTE" && !c.bruta.AdvertenciaEm && (c.gestao || c.administrador)
        } } };
        return;
      }

      // ---- a partir daqui, só gestão ----
      if (acao === "canais") {
        if (!exigirGestao()) return;
        const todos = await db.listarCanais(pool, ctx, { incluirInativos: q.todos === "1", hoje });
        context.res = { status: 200, body: { sucesso: true, canais: todos.filter(canalNoEscopo) } };
        return;
      }
      if (acao === "canal") {
        if (!exigirGestao()) return;
        const canal = await canalGerido(q);
        if (!canal) return;
        context.res = { status: 200, body: { sucesso: true, ...(await db.detalharCanal(pool, canal.canalId, ctx, { hoje })) } };
        return;
      }
      if (acao === "trocas") {
        if (!exigirGestao()) return;
        // O sincronismo olha a liderança da igreja inteira e abre pendência em canal de qualquer unidade: só o nível geral o dispara (o escopo local apenas lê).
        if (geral) { try { await db.sincronizarSucessoes(pool, { hoje, por: membroId }); } catch (e) { context.log.error("[GestaoCanais] sucessão:", e); } }
        const todas = await db.listarTrocas(pool, ctx, { abertas: q.todas !== "1", hoje });
        const noEscopo = new Map((await db.carregarCanais(pool, ctx, { incluirInativos: true })).map(c => [c.canalId, canalNoEscopo(c)]));
        context.res = { status: 200, body: { sucesso: true, trocas: todas.filter(t => noEscopo.get(t.canalId)) } };
        return;
      }
      if (acao === "cobertura") {
        if (!exigirGestao()) return;
        if (geral) { try { await db.sincronizarSucessoes(pool, { hoje, por: membroId }); } catch (e) { context.log.error("[GestaoCanais] sucessão:", e); } }
        const naoGlobalCong = (id) => { const c = ctx.congregacoes.get(id); return escopoGlobal || (!!c && escopo.includes(c.nome)); };
        const cob = await db.montarCobertura(pool, ctx, { hoje, filtrarCanal: canalNoEscopo, filtrarCongregacao: naoGlobalCong });
        context.res = { status: 200, body: { sucesso: true, ...cob } };
        return;
      }
      if (acao === "transmissao") {
        if (!exigirGestao()) return;
        const naoGlobalCong = (id) => { const c = ctx.congregacoes.get(id); return escopoGlobal || (!!c && escopo.includes(c.nome)); };
        context.res = { status: 200, body: { sucesso: true, congregacoes: (await db.listarTransmissao(pool, ctx)).filter(t => naoGlobalCong(t.congregacaoId)) } };
        return;
      }
      erro(context, 404, "Ação inválida.");
      return;
    }

    // ================= Escrita =================
    if (metodo !== "POST") { erro(context, 405, "Método não suportado."); return; }

    if (acao === "canais") {
      if (!exigirGestao()) return;
      const v = canais.validarCanal(corpo);
      if (v.valido && !canalNoEscopo(v.dados)) { erro(context, 403, "Você só registra canais dentro do seu escopo (canal do campo, de Área inteira ou de departamento exige escopo global)."); return; }
      resposta(context, await db.criarCanal(pool, ctx, corpo, { membroId }), 201);
      return;
    }
    if (acao === "canais/atualizar") {
      if (!exigirGestao()) return;
      const canal = await canalGerido(corpo);
      if (!canal) return;
      const mudaEscopo = ["escopo", "congregacaoId", "areaId", "departamentoId"].some(k => Object.prototype.hasOwnProperty.call(corpo, k));
      if (mudaEscopo) {
        const v = canais.validarCanal({ ...canal, identificador: canal.identificador || "x", vinculoInstitucional: canal.vinculoInstitucional || "ESTRUTURA", declaracaoInstitucional: true, ...corpo });
        if (v.valido && !canalNoEscopo(v.dados)) { erro(context, 403, "O novo escopo está fora do seu escopo."); return; }
      }
      resposta(context, await db.atualizarCanal(pool, ctx, canal.canalId, corpo, { membroId }));
      return;
    }
    if (acao === "canais/desativar") {
      if (!exigirGestao()) return;
      const canal = await canalGerido(corpo);
      if (!canal) return;
      resposta(context, await db.desativarCanal(pool, ctx, canal.canalId, corpo.motivo, { membroId }));
      return;
    }
    if (acao === "canais/reativar") {
      if (!exigirGestao()) return;
      const canal = await canalGerido(corpo);
      if (!canal) return;
      resposta(context, await db.reativarCanal(pool, ctx, canal.canalId, { membroId }));
      return;
    }
    if (acao === "administradores/designar") {
      if (!exigirGestao()) return;
      const canal = await canalGerido(corpo);
      if (!canal) return;
      resposta(context, await db.designarAdministrador(pool, ctx, { canalId: canal.canalId, membroId: corpo.membroId, papel: corpo.papel, designadoPor: membroId }), 201);
      return;
    }
    if (acao === "administradores/encerrar") {
      if (!exigirGestao()) return;
      const adminId = idDe(corpo.adminId);
      if (!adminId) { erro(context, 400, "Informe o adminId."); return; }
      const a = (await pool.request().input("id", sql.Int, adminId).query(`SELECT CanalId FROM CanalAdministradores WHERE AdminId = @id`)).recordset[0];
      if (!a) { erro(context, 404, "Designação não encontrada."); return; }
      const canal = await canalGerido({ canalId: a.CanalId }, "Designação não encontrada.");
      if (!canal) return;
      resposta(context, await db.encerrarAdministrador(pool, ctx, { adminId, motivo: corpo.motivo, por: membroId, hoje }));
      return;
    }
    if (acao === "termo/aceitar") {
      if (!membroId) { erro(context, 403, "Sua sessão não identifica a matrícula."); return; }
      resposta(context, await db.aceitarTermo(pool, { membroId, adminId: corpo.adminId, todos: corpo.todos === true }));
      return;
    }
    if (acao === "ocorrencias") {
      if (!membroId) { erro(context, 403, "Sua sessão não identifica a matrícula."); return; }
      const lim = limitadorOcorrencias.registrar(String(membroId));
      if (!lim.permitido) { erro(context, 429, "Você já enviou muitos avisos nesta hora. Aguarde um pouco ou fale com a Secretaria."); return; }
      resposta(context, await db.abrirOcorrencia(pool, ctx, corpo, { membroId }), 201);
      return;
    }
    if (acao === "ocorrencias/remover" || acao === "ocorrencias/advertir") {
      const id = idDe(corpo.ocorrenciaId);
      if (!id) { erro(context, 400, "Informe a ocorrenciaId."); return; }
      const c = await contextoDaOcorrencia(id);
      // Sem relação com o canal = a mesma resposta de ocorrência que não existe.
      if (!c || !(c.gestao || c.administrador)) { erro(context, 404, "Ocorrência não encontrada."); return; }
      if (acao === "ocorrencias/remover") resposta(context, await db.registrarRemocao(pool, { ocorrenciaId: id, dados: corpo, membroId }));
      else resposta(context, await db.registrarAdvertencia(pool, { ocorrenciaId: id, observacao: corpo.observacao, membroId }));
      return;
    }
    if (acao === "ocorrencias/improcedente") {
      if (!exigirGestao()) return;
      const id = idDe(corpo.ocorrenciaId);
      if (!id) { erro(context, 400, "Informe a ocorrenciaId."); return; }
      const c = await contextoDaOcorrencia(id);
      if (!c || !c.gestao) { erro(context, 404, "Ocorrência não encontrada."); return; }   // canal fora do escopo = ocorrência que não existe
      resposta(context, await db.marcarImprocedente(pool, { ocorrenciaId: id, motivo: corpo.motivo, membroId }));
      return;
    }
    if (acao === "credenciais/resolver") {
      if (!exigirGestao()) return;
      const id = idDe(corpo.trocaId);
      if (!id) { erro(context, 400, "Informe a trocaId."); return; }
      const t = (await pool.request().input("id", sql.Int, id).query(`SELECT CanalId FROM CanalTrocasCredencial WHERE TrocaId = @id`)).recordset[0];
      if (!t) { erro(context, 404, "Pendência não encontrada."); return; }
      const canal = await canalGerido({ canalId: t.CanalId }, "Pendência não encontrada.");
      if (!canal) return;
      resposta(context, await db.resolverTroca(pool, { trocaId: id, observacao: corpo.observacao, por: membroId }));
      return;
    }
    if (acao === "credenciais/registrar") {
      if (!exigirGestao()) return;
      const canal = await canalGerido(corpo);
      if (!canal) return;
      resposta(context, await db.gerarTrocaManual(pool, ctx, { canalId: canal.canalId, motivo: corpo.motivo, observacao: corpo.observacao, por: membroId }), 201);
      return;
    }
    if (acao === "conferencias") {
      if (!exigirGestao()) return;
      const canal = await canalGerido(corpo);
      if (!canal) return;
      resposta(context, await db.registrarConferencia(pool, ctx, { canalId: canal.canalId, itens: corpo.itens, observacao: corpo.observacao, por: membroId }), 201);
      return;
    }
    if (acao === "transmissao") {
      if (!exigirGestao()) return;
      const congId = idDe(corpo.congregacaoId);
      const cong = congId ? ctx.congregacoes.get(congId) : null;
      // Congregação fora do escopo = a mesma resposta de congregação que não existe.
      if (!cong || (!escopoGlobal && !escopo.includes(cong.nome))) { erro(context, 404, "Congregação não encontrada."); return; }
      resposta(context, await db.salvarTransmissao(pool, ctx, corpo, { por: membroId }));
      return;
    }
    if (acao === "sincronizar") {
      if (!exigirGestao()) return;
      // A varredura compara a liderança da igreja inteira e abre pendência em canal de qualquer unidade: é do nível geral.
      if (!geral) { erro(context, 403, MSG_GERAL); return; }
      context.res = { status: 200, body: { sucesso: true, mensagem: "Sucessões conferidas.", resumo: await db.sincronizarSucessoes(pool, { hoje, por: membroId }) } };
      return;
    }
    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoCanais] erro:", e);
    context.res = { status: 500, body: { sucesso: false, mensagem: "Erro interno ao processar os canais." } };
  }
};
