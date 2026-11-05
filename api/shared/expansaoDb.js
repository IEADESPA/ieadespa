// shared/expansaoDb.js — v9.2: Expansão. O banco (migração 166); a regra pura está em expansao.js.
// Toda mudança de etapa é condicional (lida com UPDLOCK dentro da transação e gravada com WHERE Status = o lido): dois pedidos ao mesmo tempo, um só passa.
//
// `alcance` (montado pela rota): { geral, cme, cobreMae(nomeDaCongregacao) } — o nível geral e a CME veem tudo; os demais só o que é da congregação que o escopo
// deles cobre por inteiro (o escopo de uma Extensão não alcança a Mãe).
const { sql } = require("./db");
const ex = require("./expansao");
const { registrarAuditoriaNaTransacao } = require("./auditoria");
const { violouUnicidade } = require("./violacaoUnica");
const { hojeBrasilia } = require("./dataBrasilia");
const { composicaoCME } = require("./comissoes");
const { membrosSobDisciplina } = require("./disciplina");
const { reunioesEncerradas, lerReuniao } = require("./entidadesVinculadasDb");

const NAO_EXISTE = { sucesso: false, naoExiste: true, mensagem: "Não encontrado." };
const PROIBIDO = (mensagem) => ({ sucesso: false, proibido: true, mensagem });
const MUDOU = { sucesso: false, mensagem: "Isto mudou enquanto você olhava. Atualize a tela." };
const iso = (v) => (v == null ? null : (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)));
// Nome igual ignorando maiúscula, acento e espaço nas pontas — a mesma comparação do cadastro (GestaoCatalogos, v7.6): o escopo de acesso compara nomes.
const MESMO_NOME = `LTRIM(RTRIM(Nome)) COLLATE Latin1_General_CI_AI = LTRIM(RTRIM(@nome)) COLLATE Latin1_General_CI_AI`;

async function emTransacao(pool, fazer) {
  const t = new sql.Transaction(pool);
  await t.begin();
  try {
    const r = await fazer(t, () => new sql.Request(t));
    if (r && r.sucesso === false) { await t.rollback(); return r; }
    await t.commit();
    return r;
  } catch (e) {
    try { await t.rollback(); } catch (_) { /* já desfeita */ }
    throw e;
  }
}

const alcanceVeTudo = (alcance) => !!alcance && (alcance.geral || alcance.cme);
const alcanceCobre = (alcance, nomeMae) => !!alcance && (alcance.geral || (!!nomeMae && typeof alcance.cobreMae === "function" && alcance.cobreMae(nomeMae)));
// O Dirigente da Mãe (papel de nível Congregação com ela no escopo) ou o nível geral: quem escolhe o Encarregado, "de confiança do Dirigente Local" (Art. 109-A, I).
const alcanceDirige = (alcance, nomeMae) => !!alcance && (alcance.geral || (!!nomeMae && typeof alcance.dirigeMae === "function" && alcance.dirigeMae(nomeMae)));

// ================================================================ leitura básica ================================================================
async function lerCongregacao(rq, congregacaoId, { travar = false } = {}) {
  const r = await rq().input("id", sql.Int, congregacaoId)
    .query(`SELECT CongregacaoId, Nome, Ativa, ISNULL(Categoria, N'CONGREGACAO') AS Categoria, AreaId FROM Congregacoes ${travar ? "WITH (UPDLOCK, ROWLOCK)" : ""} WHERE CongregacaoId = @id`);
  const l = r.recordset[0];
  return l ? { congregacaoId: l.CongregacaoId, nome: l.Nome, ativa: !!l.Ativa, categoria: l.Categoria, areaId: l.AreaId } : null;
}
async function lerExtensao(rq, extensaoId, { travar = false } = {}) {
  const r = await rq().input("id", sql.Int, extensaoId).query(`
    SELECT e.ExtensaoId, e.Nome, e.CongregacaoMaeId, e.Ativa, e.Endereco, e.Bairro, e.Cidade, e.UF, CONVERT(varchar(10), e.AbertaEm, 120) AS AbertaEm,
           CONVERT(varchar(10), e.EmancipadaEm, 120) AS EmancipadaEm, e.CongregacaoEmancipadaId, c.Nome AS MaeNome, c.AreaId AS MaeAreaId
    FROM ExtensoesTenda e ${travar ? "WITH (UPDLOCK, ROWLOCK)" : ""} JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoMaeId
    WHERE e.ExtensaoId = @id`);
  const l = r.recordset[0];
  return l ? {
    extensaoId: l.ExtensaoId, nome: l.Nome, congregacaoMaeId: l.CongregacaoMaeId, maeNome: l.MaeNome, maeAreaId: l.MaeAreaId, ativa: !!l.Ativa,
    endereco: l.Endereco, bairro: l.Bairro, cidade: l.Cidade, uf: l.UF, abertaEm: l.AbertaEm, emancipadaEm: l.EmancipadaEm, congregacaoEmancipadaId: l.CongregacaoEmancipadaId
  } : null;
}
// O Distrito a que a Área pertence hoje (Área → Região → Quadrante → Distrito), ou null.
async function distritoDaArea(rq, areaId) {
  const r = await rq().input("id", sql.Int, areaId).query(`SELECT q.DistritoId FROM Areas a JOIN Regioes r ON r.RegiaoId = a.RegiaoId JOIN Quadrantes q ON q.QuadranteId = r.QuadranteId WHERE a.AreaId = @id`);
  return r.recordset[0] && r.recordset[0].DistritoId ? Number(r.recordset[0].DistritoId) : null;
}
async function lerArea(rq, areaId) {
  const r = await rq().input("id", sql.Int, areaId).query(`SELECT AreaId, Nome, Ativa FROM Areas WHERE AreaId = @id`);
  return r.recordset[0] ? { areaId: r.recordset[0].AreaId, nome: r.recordset[0].Nome, ativa: !!r.recordset[0].Ativa } : null;
}

// O Encarregado (Art. 109-A, I): membro da própria Congregação-Mãe, ATIVO e em comunhão (nem "sem comunhão" nem sob disciplina). Devolve a mensagem da recusa ou null.
// A congregação é conferida PRIMEIRO, com a mesma resposta para "não existe" e "é de outra congregação": só depois a situação da pessoa é dita — e ela já está no
// escopo de quem pergunta (revisão de 04/11/2026: na ordem antiga, a recusa contava se uma matrícula de qualquer congregação estava sob disciplina).
async function problemaDoEncarregado(pool, rq, membroId, congregacaoMaeId) {
  const r = await rq().input("m", sql.Int, membroId)
    .query(`SELECT MembroId, Nome, Status, SituacaoMembro, CongregacaoId FROM MembroReferencia WHERE MembroId = @m`);
  const m = r.recordset[0];
  if (!m || Number(m.CongregacaoId) !== Number(congregacaoMaeId)) return "Informe a matrícula de um membro da própria Congregação-Mãe: o Encarregado é de confiança do Dirigente Local (Regimento, Art. 109-A, I).";
  if (m.Status !== "ATIVO" || m.SituacaoMembro === "SEM_COMUNHAO" || (await membrosSobDisciplina(pool)).has(m.MembroId)) return "O Encarregado precisa ser membro ativo e em comunhão (sem disciplina em curso).";
  return null;
}

async function haHomonimaExtensao(rq, congregacaoMaeId, nome) {
  const r = await rq().input("mae", sql.Int, congregacaoMaeId).input("nome", sql.NVarChar(150), nome)
    .query(`SELECT TOP 1 ExtensaoId FROM ExtensoesTenda WHERE CongregacaoMaeId = @mae AND ${MESMO_NOME}`);
  return r.recordset.length > 0;
}
async function haHomonimaCongregacao(rq, nome) {
  const r = await rq().input("nome", sql.NVarChar(150), nome)
    .query(`SELECT TOP 1 CongregacaoId FROM Congregacoes WHERE ${MESMO_NOME}`);
  return r.recordset.length > 0;
}
// As decisões da CLI executadas uma de cada vez (trava de aplicação, dentro da transação): duas aberturas ou congregações homônimas não passam juntas, e as decisões
// não travam linhas umas das outras em ordem cruzada (revisão de 04/11/2026: a varredura com HOLDLOCK podia dar deadlock).
async function enfileirarDecisao(rq) {
  const r = await rq().query(`DECLARE @r INT; EXEC @r = sp_getapplock @Resource = N'ieadespa-expansao-decisao', @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = 20000; SELECT @r AS r`);
  return Number(r.recordset[0].r) >= 0;
}
const HOMONIMA_EXTENSAO = "Essa Congregação-Mãe já tem uma Extensão com esse nome (maiúsculas, acentos e espaços nas pontas não diferenciam). Escolha outro nome.";
const HOMONIMA_CONGREGACAO = "Já existe uma congregação com esse nome (maiúsculas, acentos e espaços nas pontas não diferenciam). Escolha outro nome.";

// ================================================================ pedidos ================================================================
const COLUNAS_PEDIDO = `
  p.PedidoId, p.Tipo, p.Status, p.Nome, p.Endereco, p.Bairro, p.Cidade, p.UF, p.Justificativa, p.CongregacaoMaeId, mae.Nome AS MaeNome, p.ExtensaoId, ext.Nome AS ExtensaoNome,
  p.AreaId, ar.Nome AS AreaNome, p.EncarregadoMembroId, enc.Nome AS EncarregadoNome, p.SolicitadoPor, sol.Nome AS SolicitanteNome,
  CONVERT(varchar(10), p.SolicitadoEm, 120) AS SolicitadoEm, p.ParecerCME, p.ParecerFundamentacao, p.ParecerPor, pp.Nome AS ParecerPorNome,
  CONVERT(varchar(10), p.ParecerEm, 120) AS ParecerEm, p.DecisaoSessaoId, CONVERT(varchar(10), p.DecisaoEm, 120) AS DecisaoEm, p.DecisaoResultado, p.DecisaoUrgencia,
  p.DecisaoMotivo, p.ExtensaoCriadaId, p.CongregacaoCriadaId, cc.Nome AS CongregacaoCriadaNome, p.MembrosTransferidos,
  CONVERT(varchar(10), p.DesistidoEm, 120) AS DesistidoEm, p.DesistenciaMotivo`;
const JUNCOES_PEDIDO = `
  FROM PedidosExpansao p
  LEFT JOIN Congregacoes mae ON mae.CongregacaoId = p.CongregacaoMaeId
  LEFT JOIN ExtensoesTenda ext ON ext.ExtensaoId = p.ExtensaoId
  LEFT JOIN Areas ar ON ar.AreaId = p.AreaId
  LEFT JOIN MembroReferencia enc ON enc.MembroId = p.EncarregadoMembroId
  LEFT JOIN MembroReferencia sol ON sol.MembroId = p.SolicitadoPor
  LEFT JOIN MembroReferencia pp ON pp.MembroId = p.ParecerPor
  LEFT JOIN Congregacoes cc ON cc.CongregacaoId = p.CongregacaoCriadaId`;
function formaPedido(l, hoje) {
  const pedido = {
    pedidoId: l.PedidoId, tipo: l.Tipo, tipoRotulo: ex.TIPOS[l.Tipo] || l.Tipo, status: l.Status, statusRotulo: ex.STATUS[l.Status] || l.Status,
    nome: l.Nome, endereco: l.Endereco, bairro: l.Bairro, cidade: l.Cidade, uf: l.UF, justificativa: l.Justificativa,
    congregacaoMaeId: l.CongregacaoMaeId, maeNome: l.MaeNome, extensaoId: l.ExtensaoId, extensaoNome: l.ExtensaoNome, areaId: l.AreaId, areaNome: l.AreaNome,
    encarregado: l.EncarregadoMembroId ? { membroId: l.EncarregadoMembroId, nome: l.EncarregadoNome } : null,
    solicitadoPor: l.SolicitadoPor, solicitanteNome: l.SolicitanteNome, solicitadoEm: l.SolicitadoEm,
    precisaCME: ex.precisaCME(l.Tipo),
    parecer: l.ParecerCME ? { resultado: l.ParecerCME, rotulo: ex.PARECERES[l.ParecerCME], fundamentacao: l.ParecerFundamentacao, por: l.ParecerPor, porNome: l.ParecerPorNome, em: l.ParecerEm } : null,
    parecerEm: l.ParecerEm || null,
    decisao: l.DecisaoResultado ? { sessaoId: l.DecisaoSessaoId, em: l.DecisaoEm, resultado: l.DecisaoResultado, rotulo: ex.RESULTADOS_CLI[l.DecisaoResultado], urgencia: !!l.DecisaoUrgencia, motivo: l.DecisaoMotivo } : null,
    resultado: l.ExtensaoCriadaId || l.CongregacaoCriadaId
      ? { extensaoId: l.ExtensaoCriadaId, congregacaoId: l.CongregacaoCriadaId, congregacaoNome: l.CongregacaoCriadaNome, membrosTransferidos: l.MembrosTransferidos == null ? null : Number(l.MembrosTransferidos) }
      : null,
    desistencia: l.DesistidoEm ? { em: l.DesistidoEm, motivo: l.DesistenciaMotivo } : null
  };
  pedido.prazoParecer = pedido.precisaCME ? ex.prazoParecer(pedido.solicitadoEm) : null;
  pedido.parecerVencido = ex.parecerVencido(pedido, hoje);
  return pedido;
}
async function lerPedido(rq, pedidoId, hoje, { travar = false } = {}) {
  // a trava vai na linha do pedido (a primeira tabela): quem decide e quem desiste ao mesmo tempo esperam um pelo outro
  const r = await rq().input("id", sql.Int, pedidoId)
    .query(`SELECT ${COLUNAS_PEDIDO} ${JUNCOES_PEDIDO.replace("FROM PedidosExpansao p", `FROM PedidosExpansao p ${travar ? "WITH (UPDLOCK, ROWLOCK)" : ""}`)} WHERE p.PedidoId = @id`);
  return r.recordset[0] ? formaPedido(r.recordset[0], hoje) : null;
}
// O pedido visível para quem pergunta? A CME e o nível geral veem todos; os demais, só os da congregação que o escopo deles cobre (a nova congregação é do geral).
const pedidoVisivel = (pedido, alcance) => alcanceVeTudo(alcance) || (!!pedido.maeNome && alcanceCobre(alcance, pedido.maeNome));

async function listarPedidos(pool, { alcance, hoje = hojeBrasilia(), status = null }) {
  const rq = () => pool.request();
  const r = await rq().input("s", sql.NVarChar(20), status)
    .query(`SELECT ${COLUNAS_PEDIDO} ${JUNCOES_PEDIDO} WHERE (@s IS NULL OR p.Status = @s) ORDER BY CASE WHEN p.Status IN (N'EM_PARECER', N'AGUARDANDO_CLI') THEN 0 ELSE 1 END, p.SolicitadoEm DESC, p.PedidoId DESC`);
  return r.recordset.map((l) => formaPedido(l, hoje)).filter((p) => pedidoVisivel(p, alcance));
}

async function detalharPedido(pool, { pedidoId, alcance, hoje = hojeBrasilia(), membroId }) {
  const pedido = await lerPedido(() => pool.request(), pedidoId, hoje);
  if (!pedido || !pedidoVisivel(pedido, alcance)) return null;
  // o que esta pessoa pode fazer neste pedido (a tela só mostra o botão que o servidor aceitaria)
  const emAndamento = ex.EM_ANDAMENTO.includes(pedido.status);
  const ehSolicitante = Number(pedido.solicitadoPor) === Number(membroId);
  pedido.acoes = {
    parecer: emAndamento && pedido.status === "EM_PARECER" && !!alcance.cme && !ehSolicitante,
    decidir: emAndamento && !!alcance.geral && (pedido.status === "AGUARDANDO_CLI" || pedido.precisaCME),
    desistir: emAndamento && (ehSolicitante || !!alcance.geral)
  };
  return pedido;
}

async function criarPedido(pool, { dados, por, hoje = hojeBrasilia(), alcance }) {
  const v = ex.validarPedido(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const d = v.dados;
  const rq = () => pool.request();
  let maeNome = null;
  if (d.tipo === "NOVA_CONGREGACAO") {
    if (!alcance.geral) return PROIBIDO("O pedido de nova congregação (sem passar por Extensão) é do nível geral.");
  } else if (d.tipo === "ABERTURA_EXTENSAO") {
    const mae = await lerCongregacao(rq, d.congregacaoMaeId);
    if (!mae || !alcanceDirige(alcance, mae.nome)) return { sucesso: false, mensagem: "Congregação-Mãe não encontrada no seu escopo (a abertura de Extensão é pedida pelo Dirigente dela)." };
    if (!mae.ativa) return { sucesso: false, mensagem: "A Congregação-Mãe está inativa." };
    if (mae.categoria !== "CONGREGACAO") return { sucesso: false, mensagem: "Esta unidade foi rebaixada a Extensão da Tenda (PSC) e perdeu a autonomia (Regimento, Art. 129 §3º): não abre Extensão própria." };
    const problema = await problemaDoEncarregado(pool, rq, d.encarregadoMembroId, mae.congregacaoId);
    if (problema) return { sucesso: false, mensagem: problema };
    if (await haHomonimaExtensao(rq, mae.congregacaoId, d.nome)) return { sucesso: false, mensagem: HOMONIMA_EXTENSAO };
    maeNome = mae.nome;
  } else {
    const ext = await lerExtensao(rq, d.extensaoId);
    if (!ext || !alcanceCobre(alcance, ext.maeNome)) return { sucesso: false, mensagem: "Extensão não encontrada no seu escopo." };
    if (!ext.ativa) return { sucesso: false, mensagem: ext.emancipadaEm ? "Esta Extensão já foi emancipada." : "Esta Extensão está inativa." };
    d.congregacaoMaeId = ext.congregacaoMaeId;
    maeNome = ext.maeNome;
  }
  if (d.tipo !== "ABERTURA_EXTENSAO") {
    if (await haHomonimaCongregacao(rq, d.nome)) return { sucesso: false, mensagem: HOMONIMA_CONGREGACAO };
    if (d.areaId) {
      const area = await lerArea(rq, d.areaId);
      if (!area || !area.ativa) return { sucesso: false, mensagem: "Escolha uma Área ativa (ou deixe em branco)." };
      // Trava 9-A — a congregação que nasce da emancipação fica no território da Mãe: uma Área de outro Distrito mudaria, sem decreto, para onde vai o repasse dela
      if (d.tipo === "EMANCIPACAO") {
        const ext = await lerExtensao(rq, d.extensaoId);
        const [daArea, daMae] = [await distritoDaArea(rq, d.areaId), ext && ext.maeAreaId ? await distritoDaArea(rq, ext.maeAreaId) : null];
        if (daArea !== daMae) return { sucesso: false, mensagem: "A Área escolhida é de outro Distrito (ou fora de Distrito) que a Congregação-Mãe: a congregação nova fica no mesmo território. Deixe a Área em branco ou escolha uma do mesmo Distrito." };
      }
    }
  }
  const status = ex.precisaCME(d.tipo) ? "EM_PARECER" : "AGUARDANDO_CLI";
  let pedidoId;
  try {
    pedidoId = await emTransacao(pool, async (t, trq) => {
      const r = await trq().input("tipo", sql.NVarChar(20), d.tipo).input("st", sql.NVarChar(20), status).input("nome", sql.NVarChar(150), d.nome)
        .input("end", sql.NVarChar(300), d.endereco).input("bai", sql.NVarChar(150), d.bairro).input("cid", sql.NVarChar(150), d.cidade).input("uf", sql.NVarChar(2), d.uf)
        .input("just", sql.NVarChar(2000), d.justificativa).input("mae", sql.Int, d.congregacaoMaeId).input("ext", sql.Int, d.extensaoId).input("area", sql.Int, d.areaId)
        .input("enc", sql.Int, d.encarregadoMembroId).input("por", sql.Int, por).input("h", sql.Date, hoje)
        .query(`INSERT INTO PedidosExpansao (Tipo, Status, Nome, Endereco, Bairro, Cidade, UF, Justificativa, CongregacaoMaeId, ExtensaoId, AreaId, EncarregadoMembroId, SolicitadoPor, SolicitadoEm)
                OUTPUT inserted.PedidoId VALUES (@tipo, @st, @nome, @end, @bai, @cid, @uf, @just, @mae, @ext, @area, @enc, @por, @h)`);
      const id = r.recordset[0].PedidoId;
      await registrarAuditoriaNaTransacao(t, { tabela: "PedidosExpansao", registroId: id, acao: "EXPANSAO_PEDIDO", usuarioId: por, dadosDepois: { ...d, status } });
      return id;
    });
  } catch (e) {
    if (violouUnicidade(e)) return { sucesso: false, mensagem: "Esta Extensão já tem um pedido de emancipação em andamento." };
    throw e;
  }
  await avisarPedidoNovo(pool, { tipo: d.tipo, nome: d.nome, mae: maeNome, pedidoId, fora: por });
  return { sucesso: true, pedidoId, mensagem: status === "EM_PARECER" ? "Pedido registrado. Agora a CME tem 15 dias para o parecer." : "Pedido registrado. Agora aguarda a decisão da CLI." };
}

async function emitirParecer(pool, { pedidoId, dados, por, hoje = hojeBrasilia(), alcance }) {
  if (!alcance.cme) return PROIBIDO("Só quem compõe a CME (o Secretário de Missões e os Pastores de Área) emite o parecer (Regimento, Art. 23).");
  const v = ex.validarParecer(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  return emTransacao(pool, async (t, rq) => {
    const p = await lerPedido(rq, pedidoId, hoje, { travar: true });
    if (!p) return NAO_EXISTE;
    if (p.status !== "EM_PARECER") return { sucesso: false, mensagem: "Este pedido não está aguardando o parecer da CME." };
    if (Number(p.solicitadoPor) === Number(por)) return { sucesso: false, mensagem: "Quem fez o pedido não emite o parecer sobre ele." };
    const u = await rq().input("id", sql.Int, pedidoId).input("par", sql.NVarChar(10), v.dados.parecer).input("f", sql.NVarChar(2000), v.dados.fundamentacao)
      .input("por", sql.Int, por).input("h", sql.Date, hoje)
      .query(`UPDATE PedidosExpansao SET Status = N'AGUARDANDO_CLI', ParecerCME = @par, ParecerFundamentacao = @f, ParecerPor = @por, ParecerEm = @h
              WHERE PedidoId = @id AND Status = N'EM_PARECER'`);
    if (!u.rowsAffected[0]) return MUDOU;
    await registrarAuditoriaNaTransacao(t, { tabela: "PedidosExpansao", registroId: pedidoId, acao: "EXPANSAO_PARECER_CME", usuarioId: por, dadosDepois: v.dados });
    return { sucesso: true, mensagem: "Parecer da CME registrado. O pedido segue para a CLI." };
  });
}

async function desistir(pool, { pedidoId, dados, por, hoje = hojeBrasilia(), alcance }) {
  const v = ex.validarMotivo(dados, "O motivo da desistência");
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  return emTransacao(pool, async (t, rq) => {
    const p = await lerPedido(rq, pedidoId, hoje, { travar: true });
    if (!p || !pedidoVisivel(p, alcance)) return NAO_EXISTE;
    if (!alcance.geral && Number(p.solicitadoPor) !== Number(por)) return PROIBIDO("Só quem fez o pedido (ou o nível geral) desiste dele.");
    if (!ex.EM_ANDAMENTO.includes(p.status)) return { sucesso: false, mensagem: "Este pedido já foi decidido ou retirado." };
    const u = await rq().input("id", sql.Int, pedidoId).input("st", sql.NVarChar(20), p.status).input("h", sql.Date, hoje).input("por", sql.Int, por)
      .input("m", sql.NVarChar(1000), v.dados.motivo)
      .query(`UPDATE PedidosExpansao SET Status = N'DESISTIDO', DesistidoEm = @h, DesistidoPor = @por, DesistenciaMotivo = @m WHERE PedidoId = @id AND Status = @st`);
    if (!u.rowsAffected[0]) return MUDOU;
    await registrarAuditoriaNaTransacao(t, { tabela: "PedidosExpansao", registroId: pedidoId, acao: "EXPANSAO_DESISTENCIA", usuarioId: por, dadosDepois: v.dados });
    return { sucesso: true, mensagem: "Desistência registrada." };
  });
}

// ---- a decisão da CLI e a execução ----
// Aprovado, executa na mesma transação: a Extensão nasce com o Encarregado; a nova congregação nasce; na emancipação, a congregação nasce, os membros da Extensão
// passam para ela, a Extensão fica inativa (emancipada) e o acesso com escopo daquela Extensão se encerra. `sid`: a sessão de quem registrou (não cai).
async function decidir(pool, { pedidoId, dados, por, hoje = hojeBrasilia(), alcance, sid = null, deps = {} }) {
  if (!alcance.geral) return PROIBIDO("A decisão da CLI é registrada pelo nível geral.");
  const v = ex.validarDecisao(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const reuniao = await lerReuniao(pool, v.dados.sessaoId, "CLI", hoje);
  if (!reuniao) return { sucesso: false, mensagem: "Escolha uma reunião da CLI já realizada e encerrada." };
  let executado = null;
  const auth = deps.auth || require("./auth");
  const r = await emTransacao(pool, async (t, rq) => {
    if (!(await enfileirarDecisao(rq))) return { sucesso: false, mensagem: "Outra decisão de expansão está sendo gravada agora. Tente de novo em instantes." };
    const p = await lerPedido(rq, pedidoId, hoje, { travar: true });
    if (!p) return NAO_EXISTE;
    const pode = ex.podeDecidir(p, { reuniao, urgencia: v.dados.urgencia });
    if (!pode.pode) return { sucesso: false, mensagem: pode.mensagem };
    const aprovado = v.dados.resultado === "APROVADO";
    let extensaoCriadaId = null, congregacaoCriadaId = null, membrosTransferidos = null;
    if (aprovado) {
      const feito = await executar(t, rq, pool, p, { reuniao, por, hoje, sid });
      if (feito.sucesso === false) return feito;
      ({ extensaoCriadaId, congregacaoCriadaId, membrosTransferidos } = feito);
      executado = feito;
    }
    const u = await rq().input("id", sql.Int, pedidoId).input("st", sql.NVarChar(20), p.status).input("novo", sql.NVarChar(20), aprovado ? "APROVADO" : "REJEITADO")
      .input("s", sql.Int, reuniao.sessaoId).input("em", sql.Date, reuniao.data).input("res", sql.NVarChar(10), v.dados.resultado).input("urg", sql.Bit, v.dados.urgencia)
      .input("mot", sql.NVarChar(1000), v.dados.motivo).input("por", sql.Int, por)
      .input("ext", sql.Int, extensaoCriadaId).input("cong", sql.Int, congregacaoCriadaId).input("mt", sql.Int, membrosTransferidos)
      .query(`UPDATE PedidosExpansao SET Status = @novo, DecisaoSessaoId = @s, DecisaoEm = @em, DecisaoResultado = @res, DecisaoUrgencia = @urg, DecisaoMotivo = @mot,
                     DecisaoRegistradaPor = @por, DecisaoRegistradaEm = SYSUTCDATETIME(), ExtensaoCriadaId = @ext, CongregacaoCriadaId = @cong, MembrosTransferidos = @mt
              WHERE PedidoId = @id AND Status = @st`);
    if (!u.rowsAffected[0]) return MUDOU;
    await registrarAuditoriaNaTransacao(t, {
      tabela: "PedidosExpansao", registroId: pedidoId, acao: aprovado ? "EXPANSAO_APROVADA" : "EXPANSAO_RECUSADA", usuarioId: por,
      dadosAntes: { status: p.status }, dadosDepois: { ...v.dados, reuniao: reuniao.data, extensaoCriadaId, congregacaoCriadaId, membrosTransferidos }
    });
    return { sucesso: true, pedido: p, aprovado, extensaoCriadaId, congregacaoCriadaId, membrosTransferidos };
  });
  if (!r.sucesso) return r;
  // as sessões encerradas na transação da emancipação passam a valer já neste processo (os outros releem a lista a cada 3 s)
  const sessoesEncerradas = executado && Array.isArray(executado.sessoesEncerradas) ? executado.sessoesEncerradas.length : 0;
  if (sessoesEncerradas) auth.marcarRevogadas(executado.sessoesEncerradas);
  await avisarDecisao(pool, { pedido: r.pedido, resultado: v.dados.resultado, motivo: v.dados.motivo, deps });
  const mensagem = !r.aprovado ? "Recusa da CLI registrada."
    : r.pedido.tipo === "ABERTURA_EXTENSAO" ? "Aprovado: a Extensão da Tenda foi aberta com o Encarregado."
      : r.pedido.tipo === "NOVA_CONGREGACAO" ? "Aprovado: a nova congregação foi criada. Falta dar o acesso ao Dirigente em Liderança."
        : `Aprovado: a congregação nasceu e ${r.membrosTransferidos} membro(s) da Extensão passaram para ela. Falta dar o acesso ao Dirigente em Liderança.`;
  return { sucesso: true, mensagem, extensaoCriadaId: r.extensaoCriadaId, congregacaoCriadaId: r.congregacaoCriadaId, membrosTransferidos: r.membrosTransferidos, sessoesEncerradas };
}

async function executar(t, rq, pool, p, { reuniao, por, hoje, sid = null }) {
  if (p.tipo === "ABERTURA_EXTENSAO") {
    const mae = await lerCongregacao(rq, p.congregacaoMaeId, { travar: true });
    if (!mae || !mae.ativa || mae.categoria !== "CONGREGACAO") return { sucesso: false, mensagem: "A Congregação-Mãe não está mais ativa como congregação: a Extensão não pode ser aberta." };
    const problema = await problemaDoEncarregado(pool, rq, p.encarregado.membroId, mae.congregacaoId);
    if (problema) return { sucesso: false, mensagem: `${problema} Peça a desistência e faça um novo pedido com outro Encarregado.` };
    if (await haHomonimaExtensao(rq, mae.congregacaoId, p.nome)) return { sucesso: false, mensagem: HOMONIMA_EXTENSAO };
    const ins = await rq().input("nome", sql.NVarChar(150), p.nome).input("mae", sql.Int, mae.congregacaoId).input("end", sql.NVarChar(300), p.endereco)
      .input("bai", sql.NVarChar(150), p.bairro).input("cid", sql.NVarChar(150), p.cidade).input("uf", sql.NVarChar(2), p.uf).input("em", sql.Date, reuniao.data)
      .query(`INSERT INTO ExtensoesTenda (Nome, CongregacaoMaeId, Ativa, Endereco, Bairro, Cidade, UF, AbertaEm) OUTPUT inserted.ExtensaoId
              VALUES (@nome, @mae, 1, @end, @bai, @cid, @uf, @em)`);
    const extensaoCriadaId = ins.recordset[0].ExtensaoId;
    await rq().input("ext", sql.Int, extensaoCriadaId).input("m", sql.Int, p.encarregado.membroId).input("d", sql.Date, reuniao.data).input("por", sql.Int, por)
      .query(`INSERT INTO ExtensaoEncarregados (ExtensaoId, MembroId, Desde, RegistradoPor) VALUES (@ext, @m, @d, @por)`);
    await registrarAuditoriaNaTransacao(t, { tabela: "ExtensoesTenda", registroId: extensaoCriadaId, acao: "EXTENSAO_ABERTA", usuarioId: por,
      dadosDepois: { nome: p.nome, congregacaoMaeId: mae.congregacaoId, encarregado: p.encarregado.membroId, pedidoId: p.pedidoId } });
    return { extensaoCriadaId, congregacaoCriadaId: null, membrosTransferidos: null };
  }
  // nova congregação ou emancipação: a congregação nasce
  let ext = null, areaId = p.areaId || null;
  if (p.tipo === "EMANCIPACAO") {
    ext = await lerExtensao(rq, p.extensaoId, { travar: true });
    if (!ext || !ext.ativa) return { sucesso: false, mensagem: "A Extensão não está mais ativa: a emancipação não pode ser executada." };
    if (Number(ext.congregacaoMaeId) !== Number(p.congregacaoMaeId)) return { sucesso: false, mensagem: "A Extensão mudou de Congregação-Mãe depois do pedido. Peça a desistência e faça um novo pedido." };
    if (!areaId) areaId = ext.maeAreaId || null;
  }
  if (areaId) {
    const area = await lerArea(rq, areaId);
    // Trava 9-A — quando ninguém escolheu a Área (ela vem da Mãe), a mensagem diz isso: a saída é reativar a Área em Catálogos, não desistir do pedido
    if (!area || !area.ativa) {
      return { sucesso: false, mensagem: p.areaId ? "A Área escolhida não está mais ativa. Peça a desistência e faça um novo pedido."
        : "A Área da Congregação-Mãe (que a congregação nova herdaria) está inativa: reative a Área em Catálogos antes de registrar a decisão." };
    }
  }
  if (await haHomonimaCongregacao(rq, p.nome)) return { sucesso: false, mensagem: HOMONIMA_CONGREGACAO };
  // o endereço campo a campo: o que o pedido trouxe vale; o que ficou em branco vem da Extensão emancipada
  const campo = (nome) => p[nome] || (ext ? ext[nome] : null) || null;
  const ins = await rq().input("nome", sql.NVarChar(150), p.nome).input("area", sql.Int, areaId).input("end", sql.NVarChar(300), campo("endereco"))
    .input("bai", sql.NVarChar(150), campo("bairro")).input("cid", sql.NVarChar(150), campo("cidade")).input("uf", sql.NVarChar(2), campo("uf"))
    .input("ano", sql.SmallInt, Number(reuniao.data.slice(0, 4)))
    .query(`INSERT INTO Congregacoes (Nome, Ativa, AreaId, Endereco, Bairro, Cidade, Estado, FundacaoAno) OUTPUT inserted.CongregacaoId
            VALUES (@nome, 1, @area, @end, @bai, @cid, @uf, @ano)`);
  const congregacaoCriadaId = ins.recordset[0].CongregacaoId;
  // a JAI da congregação nova (o mesmo órgão que o cadastro de congregações cria — Regimento Art. 105), sem esperar o próximo deploy
  await rq().input("ref", sql.Int, congregacaoCriadaId).input("nome", sql.NVarChar(200), `Junta de Articulação Institucional — ${p.nome}`)
    .query(`IF NOT EXISTS (SELECT 1 FROM OrgaosLocais WHERE Nivel = 1 AND ReferenciaId = @ref AND Sigla = N'JAI')
              INSERT INTO OrgaosLocais (Sigla, Nome, Nivel, ReferenciaId, Ativo) VALUES (N'JAI', @nome, 1, @ref, 1)`);
  await registrarAuditoriaNaTransacao(t, { tabela: "Congregacoes", registroId: congregacaoCriadaId, acao: p.tipo === "EMANCIPACAO" ? "CONGREGACAO_EMANCIPADA" : "CONGREGACAO_CRIADA",
    usuarioId: por, dadosDepois: { nome: p.nome, areaId, pedidoId: p.pedidoId, extensaoId: p.extensaoId || null } });
  if (p.tipo !== "EMANCIPACAO") return { extensaoCriadaId: null, congregacaoCriadaId, membrosTransferidos: null };

  // os membros da Extensão passam para a congregação nova (deixam de estar na Extensão). Quem já saiu (desligado ou falecido) fica onde estava: a ficha dele é
  // história da Mãe e da Extensão, e o Dirigente novo não passa a alcançá-la (revisão de 04/11/2026).
  const mov = await rq().input("ext", sql.Int, ext.extensaoId).input("nova", sql.Int, congregacaoCriadaId)
    .query(`UPDATE MembroReferencia SET CongregacaoId = @nova, ExtensaoId = NULL OUTPUT inserted.MembroId WHERE ExtensaoId = @ext AND Status NOT IN (N'DESLIGADO', N'FALECIDO')`);
  const transferidos = mov.recordset.map((l) => l.MembroId);
  // o dízimo deles passa a ser registrado na tesouraria da congregação nova (antes, 100% ia à Mãe — Art. 109-A, II)
  if (transferidos.length) {
    await rq().input("nova", sql.Int, congregacaoCriadaId).input("mae", sql.Int, ext.congregacaoMaeId).input("ext", sql.Int, ext.extensaoId)
      .query(`UPDATE d SET CongregacaoId = @nova FROM Dizimistas d JOIN MembroReferencia m ON m.MembroId = d.MembroId
              WHERE m.CongregacaoId = @nova AND d.CongregacaoId = @mae AND d.Ativo = 1`);
  }
  const fim = await rq().input("ext", sql.Int, ext.extensaoId).input("em", sql.Date, reuniao.data).input("nova", sql.Int, congregacaoCriadaId)
    .query(`UPDATE ExtensoesTenda SET Ativa = 0, EmancipadaEm = @em, CongregacaoEmancipadaId = @nova WHERE ExtensaoId = @ext AND Ativa = 1`);
  if (!fim.rowsAffected[0]) return MUDOU;
  await rq().input("ext", sql.Int, ext.extensaoId).input("em", sql.Date, hoje).input("por", sql.Int, por)
    .query(`UPDATE ExtensaoEncarregados SET Ate = CASE WHEN @em < Desde THEN Desde ELSE @em END, MotivoSaida = N'Emancipação da Extensão em congregação', EncerradoPor = @por
            WHERE ExtensaoId = @ext AND Ate IS NULL`);
  // o acesso com escopo desta Extensão termina hoje (a Extensão deixou de existir; o escopo dela resolveria para a Congregação-Mãe)
  const acessos = await rq().input("ext", sql.Int, ext.extensaoId).input("h", sql.Date, hoje)
    .query(`UPDATE Lideranca SET AtivoAte = DATEADD(DAY, -1, @h) OUTPUT inserted.LiderancaId, inserted.MembroId
            WHERE EscopoTipo = 'EXTENSAO' AND EscopoId = @ext AND (AtivoAte IS NULL OR AtivoAte >= @h)`);
  // os bilhetes de acesso abertos guardam os nomes do escopo: todas as sessões caem (menos a de quem registrou, do nível geral) — na mesma transação
  const sessoes = await rq().input("exceto", sql.NVarChar(40), sid ? String(sid).toLowerCase() : null)
    .query(`UPDATE SessoesAtivas SET Encerrada = 1, EncerradaEm = SYSUTCDATETIME() OUTPUT inserted.SessaoId
            WHERE Encerrada = 0 AND CriadoEm >= DATEADD(HOUR, -14, SYSUTCDATETIME()) AND (@exceto IS NULL OR LOWER(CAST(SessaoId AS NVARCHAR(40))) <> @exceto)`);
  await registrarAuditoriaNaTransacao(t, { tabela: "ExtensoesTenda", registroId: ext.extensaoId, acao: "EXTENSAO_EMANCIPADA", usuarioId: por,
    dadosAntes: { ativa: true, congregacaoMaeId: ext.congregacaoMaeId },
    dadosDepois: { congregacaoEmancipadaId: congregacaoCriadaId, membrosTransferidos: transferidos, acessosEncerrados: acessos.recordset.map((l) => l.LiderancaId) } });
  return { extensaoCriadaId: null, congregacaoCriadaId, membrosTransferidos: transferidos.length, sessoesEncerradas: sessoes.recordset.map((l) => l.SessaoId) };
}

// ================================================================ extensões ================================================================
async function listarExtensoes(pool, { alcance, todas = false }) {
  const r = await pool.request().query(`
    SELECT e.ExtensaoId, e.Nome, e.CongregacaoMaeId, c.Nome AS MaeNome, e.Ativa, e.Endereco, e.Bairro, e.Cidade, e.UF, CONVERT(varchar(10), e.AbertaEm, 120) AS AbertaEm,
           CONVERT(varchar(10), e.EmancipadaEm, 120) AS EmancipadaEm, ce.Nome AS EmancipadaNome,
           (SELECT COUNT(*) FROM MembroReferencia m WHERE m.ExtensaoId = e.ExtensaoId) AS Membros,
           enc.EncarregadoId, enc.MembroId AS EncMembroId, me.Nome AS EncNome, CONVERT(varchar(10), enc.Desde, 120) AS EncDesde, me.Status AS EncStatus,
           me.SituacaoMembro AS EncSituacao, me.CongregacaoId AS EncCongregacaoId,
           (SELECT TOP 1 p.PedidoId FROM PedidosExpansao p WHERE p.ExtensaoId = e.ExtensaoId AND p.Status IN (N'EM_PARECER', N'AGUARDANDO_CLI')) AS PedidoEmAndamento
    FROM ExtensoesTenda e
    JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoMaeId
    LEFT JOIN Congregacoes ce ON ce.CongregacaoId = e.CongregacaoEmancipadaId
    LEFT JOIN ExtensaoEncarregados enc ON enc.ExtensaoId = e.ExtensaoId AND enc.Ate IS NULL
    LEFT JOIN MembroReferencia me ON me.MembroId = enc.MembroId
    ${todas ? "" : "WHERE e.Ativa = 1"}
    ORDER BY c.Nome, e.Nome`);
  const sobDisciplina = await membrosSobDisciplina(pool);
  return r.recordset.filter((l) => alcanceVeTudo(alcance) || alcanceCobre(alcance, l.MaeNome)).map((l) => {
    const encarregado = l.EncarregadoId ? { membroId: l.EncMembroId, nome: l.EncNome, desde: l.EncDesde } : null;
    // A pendência diz algo da pessoa do Encarregado: só aparece a quem cuida da Mãe (o Dirigente, a Área, o nível geral) — a CME de outra Área não a vê — e nunca diz
    // o motivo (ativo, comunhão, disciplina ou congregação): quem pode ver a ficha confere lá (revisão de 04/11/2026).
    let pendencia = null;
    if (l.Ativa && alcanceCobre(alcance, l.MaeNome)) {
      if (!encarregado) pendencia = "Sem Encarregado: defina quem dirige a Extensão (Regimento, Art. 109-A, I).";
      else if (l.EncStatus !== "ATIVO" || l.EncSituacao === "SEM_COMUNHAO" || sobDisciplina.has(l.EncMembroId) || Number(l.EncCongregacaoId) !== Number(l.CongregacaoMaeId)) {
        pendencia = "O Encarregado não preenche mais os requisitos (membro ativo, em comunhão, da Congregação-Mãe): confira a ficha dele e, se for o caso, troque o Encarregado.";
      }
    }
    return {
      extensaoId: l.ExtensaoId, nome: l.Nome, congregacaoMaeId: l.CongregacaoMaeId, maeNome: l.MaeNome, ativa: !!l.Ativa, endereco: l.Endereco, bairro: l.Bairro,
      cidade: l.Cidade, uf: l.UF, abertaEm: l.AbertaEm, emancipadaEm: l.EmancipadaEm, emancipadaNome: l.EmancipadaNome, membros: Number(l.Membros), encarregado,
      pendencia, pedidoEmAndamento: l.PedidoEmAndamento || null, podeEditar: !!l.Ativa && alcanceDirige(alcance, l.MaeNome),
      // a emancipação pode ser pedida por quem cuida da Mãe (o Dirigente ou o Pastor da Área); o histórico dos Encarregados, idem
      podeEmancipar: !!l.Ativa && alcanceCobre(alcance, l.MaeNome), podeVerHistorico: alcanceCobre(alcance, l.MaeNome)
    };
  });
}

async function historicoEncarregados(pool, extensaoId) {
  const r = await pool.request().input("ext", sql.Int, extensaoId).query(`
    SELECT h.EncarregadoId, h.MembroId, m.Nome, CONVERT(varchar(10), h.Desde, 120) AS Desde, CONVERT(varchar(10), h.Ate, 120) AS Ate, h.MotivoSaida
    FROM ExtensaoEncarregados h JOIN MembroReferencia m ON m.MembroId = h.MembroId WHERE h.ExtensaoId = @ext ORDER BY h.Desde DESC, h.EncarregadoId DESC`);
  return r.recordset.map((l) => ({ encarregadoId: l.EncarregadoId, membroId: l.MembroId, nome: l.Nome, desde: l.Desde, ate: l.Ate, motivoSaida: l.MotivoSaida }));
}

async function trocarEncarregado(pool, { extensaoId, dados, por, hoje = hojeBrasilia(), alcance }) {
  const v = ex.validarTrocaEncarregado(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  try {
    return await emTransacao(pool, async (t, rq) => {
      const ext = await lerExtensao(rq, extensaoId, { travar: true });
      if (!ext || !(alcanceVeTudo(alcance) || alcanceCobre(alcance, ext.maeNome))) return NAO_EXISTE;
      if (!alcanceDirige(alcance, ext.maeNome)) return PROIBIDO("Quem troca o Encarregado é o Dirigente da Congregação-Mãe (ou o nível geral): ele é de confiança do Dirigente Local (Regimento, Art. 109-A, I).");
      if (!ext.ativa) return { sucesso: false, mensagem: "Esta Extensão está inativa." };
      const problema = await problemaDoEncarregado(pool, rq, v.dados.membroId, ext.congregacaoMaeId);
      if (problema) return { sucesso: false, mensagem: problema };
      const atual = (await rq().input("ext", sql.Int, extensaoId)
        .query(`SELECT EncarregadoId, MembroId, CONVERT(varchar(10), Desde, 120) AS Desde FROM ExtensaoEncarregados WITH (UPDLOCK, ROWLOCK) WHERE ExtensaoId = @ext AND Ate IS NULL`)).recordset[0];
      if (atual && Number(atual.MembroId) === v.dados.membroId) return { sucesso: false, mensagem: "Essa pessoa já é a Encarregada desta Extensão." };
      if (atual && !v.dados.motivo) return { sucesso: false, mensagem: "Informe o motivo da troca (quem sai fica com o registro)." };
      if (atual) {
        await rq().input("id", sql.Int, atual.EncarregadoId).input("h", sql.Date, hoje).input("m", sql.NVarChar(1000), v.dados.motivo).input("por", sql.Int, por)
          .query(`UPDATE ExtensaoEncarregados SET Ate = CASE WHEN @h < Desde THEN Desde ELSE @h END, MotivoSaida = @m, EncerradoPor = @por WHERE EncarregadoId = @id AND Ate IS NULL`);
      }
      await rq().input("ext", sql.Int, extensaoId).input("m", sql.Int, v.dados.membroId).input("h", sql.Date, hoje).input("por", sql.Int, por)
        .query(`INSERT INTO ExtensaoEncarregados (ExtensaoId, MembroId, Desde, RegistradoPor) VALUES (@ext, @m, @h, @por)`);
      await registrarAuditoriaNaTransacao(t, { tabela: "ExtensoesTenda", registroId: extensaoId, acao: "EXTENSAO_ENCARREGADO", usuarioId: por,
        dadosAntes: atual ? { membroId: atual.MembroId } : null, dadosDepois: v.dados });
      return { sucesso: true, mensagem: atual ? "Encarregado trocado." : "Encarregado definido." };
    });
  } catch (e) {
    if (violouUnicidade(e)) return MUDOU;
    throw e;
  }
}

// ================================================================ catálogos e painel ================================================================
async function catalogos(pool, { alcance }) {
  const cong = await pool.request().query(`SELECT CongregacaoId, Nome, AreaId, ISNULL(Categoria, N'CONGREGACAO') AS Categoria FROM Congregacoes WHERE Ativa = 1 ORDER BY Nome`);
  const areas = await pool.request().query(`SELECT AreaId, Nome FROM Areas WHERE Ativa = 1 ORDER BY Nome`);
  const extensoes = await listarExtensoes(pool, { alcance });
  const lista = (o) => Object.entries(o).map(([codigo, rotulo]) => ({ codigo, rotulo }));
  return {
    tipos: lista(ex.TIPOS).filter((t) => alcance.geral || t.codigo !== "NOVA_CONGREGACAO"),
    status: lista(ex.STATUS), pareceres: lista(ex.PARECERES), resultados: lista(ex.RESULTADOS_CLI), ufs: ex.UFS, prazoParecerDias: ex.PRAZO_PARECER_DIAS,
    // as Mães possíveis: congregações ativas, não rebaixadas, que a pessoa dirige (ou todas, no nível geral)
    maes: cong.recordset.filter((c) => c.Categoria === "CONGREGACAO" && alcanceDirige(alcance, c.Nome)).map((c) => ({ congregacaoId: c.CongregacaoId, nome: c.Nome })),
    extensoes: extensoes.filter((e) => e.podeEmancipar && !e.pedidoEmAndamento).map((e) => ({ extensaoId: e.extensaoId, nome: e.nome, maeNome: e.maeNome })),
    areas: areas.recordset.map((a) => ({ areaId: a.AreaId, nome: a.Nome })),
    papeis: { geral: !!alcance.geral, cme: !!alcance.cme }
  };
}

async function painel(pool, { alcance, hoje = hojeBrasilia() }) {
  const pedidos = await listarPedidos(pool, { alcance, hoje });
  const andamento = pedidos.filter((p) => ex.EM_ANDAMENTO.includes(p.status));
  const extensoes = await listarExtensoes(pool, { alcance });
  // congregação nascida de um pedido aprovado, ainda ativa, sem ninguém com o papel de Dirigente no escopo dela
  const semDirigente = (await pool.request().query(`
    SELECT p.PedidoId, p.Tipo, c.CongregacaoId, c.Nome, CONVERT(varchar(10), p.DecisaoEm, 120) AS DecisaoEm
    FROM PedidosExpansao p JOIN Congregacoes c ON c.CongregacaoId = p.CongregacaoCriadaId
    WHERE p.Status = N'APROVADO' AND c.Ativa = 1
      AND NOT EXISTS (SELECT 1 FROM Lideranca l JOIN Papeis pa ON pa.PapelId = l.PapelId
                      WHERE l.EscopoTipo = 'CONGREGACAO' AND l.EscopoId = c.CongregacaoId AND pa.Nome = N'Dirigente de Congregação'
                        AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE)))
    ORDER BY p.DecisaoEm DESC`)).recordset
    .filter(() => alcanceVeTudo(alcance))
    .map((l) => ({ pedidoId: l.PedidoId, tipoRotulo: ex.TIPOS[l.Tipo], congregacaoId: l.CongregacaoId, nome: l.Nome, desde: l.DecisaoEm }));
  const cme = await composicaoCME(pool);
  const secretario = cme.filter((m) => m.secretarioMissoes);
  return {
    hoje,
    parecerVencido: andamento.filter((p) => p.parecerVencido),
    emParecer: andamento.filter((p) => p.status === "EM_PARECER" && !p.parecerVencido),
    aguardandoCLI: andamento.filter((p) => p.status === "AGUARDANDO_CLI"),
    extensoesComPendencia: extensoes.filter((e) => e.pendencia),
    congregacoesSemDirigente: semDirigente,
    cme: {
      membros: cme.map((m) => ({ membroId: m.membroId, nome: m.nome, cargo: m.cargoOuFuncao, origem: m.origemSigla })),
      semSecretario: secretario.length === 0,
      secretarioSemAcesso: secretario.filter((m) => !m.comAcessoTela).map((m) => ({ membroId: m.membroId, nome: m.nome })),
      // Trava 9-A — o Pastor de Área da CME a quem tiraram a permissão "expansao" recebe o aviso do pedido e não abre a tela: o painel acusa também
      pastoresSemAcesso: cme.filter((m) => !m.secretarioMissoes && !m.comAcessoTela).map((m) => ({ membroId: m.membroId, nome: m.nome }))
    }
  };
}

// ================================================================ avisos ================================================================
async function destinatariosGerais(pool) {
  const { resolverDestinatariosPorPermissao } = require("./notificacoes");
  return resolverDestinatariosPorPermissao(pool, { permissao: "expansao", nivel: "GLOBAL" });
}
async function avisarPedidoNovo(pool, { tipo, nome, mae, pedidoId, fora, deps = {} }) {
  try {
    const canaisDb = deps.canaisDb || require("./canaisDb");
    // a CME, quando o pedido precisa do parecer dela; senão, o nível geral, que registra a decisão da CLI
    const lista = ex.precisaCME(tipo) ? await composicaoCME(pool) : await destinatariosGerais(pool);
    const destinatarios = lista.filter((d) => Number(d.membroId) !== Number(fora)).map((d) => ({ membroId: d.membroId, nome: d.nome, email: d.email }));
    if (destinatarios.length) {
      await canaisDb.notificarAgora(pool, { regraChave: "EXPANSAO_PEDIDO_NOVO", destinatarios, mensagem: ex.textoPedidoNovo({ tipo, nome, mae }), referenciaId: pedidoId,
        referenciaTabela: "PedidosExpansao", aguardarEntrega: false, deps });
    }
    return destinatarios.length;
  } catch (e) {
    console.error("[EXPANSAO] falha ao avisar o pedido novo:", e.message);
    return 0;
  }
}
async function avisarDecisao(pool, { pedido, resultado, motivo, deps = {} }) {
  try {
    const canaisDb = deps.canaisDb || require("./canaisDb");
    const m = (await pool.request().input("m", sql.Int, pedido.solicitadoPor).query(`SELECT MembroId, Nome, Email FROM MembroReferencia WHERE MembroId = @m`)).recordset[0];
    if (!m) return 0;
    await canaisDb.notificarAgora(pool, { regraChave: "EXPANSAO_DECIDIDO", destinatarios: [{ membroId: m.MembroId, nome: m.Nome, email: m.Email }],
      mensagem: ex.textoDecidido({ tipo: pedido.tipo, nome: pedido.nome, resultado, motivo }), referenciaId: pedido.pedidoId, referenciaTabela: "PedidosExpansao",
      aguardarEntrega: false, deps });
    return 1;
  } catch (e) {
    console.error("[EXPANSAO] falha ao avisar a decisão:", e.message);
    return 0;
  }
}
// O parecer vencido: um aviso por pedido (o motor não duplica a referência), à CME e ao nível geral.
async function detectarParecerVencido(pool, { hoje = hojeBrasilia() } = {}) {
  const r = await pool.request().query(`SELECT PedidoId, Tipo, Nome, CONVERT(varchar(10), SolicitadoEm, 120) AS SolicitadoEm FROM PedidosExpansao WHERE Status = N'EM_PARECER'`);
  const vencidos = r.recordset.filter((l) => ex.parecerVencido({ status: "EM_PARECER", tipo: l.Tipo, solicitadoEm: l.SolicitadoEm }, hoje));
  if (!vencidos.length) return [];
  const vistos = new Set();
  const destinatarios = [...(await composicaoCME(pool)), ...(await destinatariosGerais(pool))]
    .filter((d) => !vistos.has(Number(d.membroId)) && vistos.add(Number(d.membroId)))
    .map((d) => ({ membroId: d.membroId, nome: d.nome, email: d.email }));
  return vencidos.map((l) => ({
    referenciaId: l.PedidoId, destinatarios,
    fatoGerador: ex.textoParecerVencido({ tipo: l.Tipo, nome: l.Nome, prazo: ex.prazoParecer(l.SolicitadoEm), hoje })
  }));
}

// Meus Dados (LGPD Art. 18): as Extensões que a pessoa encarregou ou encarrega.
async function dadosDoTitular(pool, membroId) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT e.Nome AS Extensao, c.Nome AS Mae, CONVERT(varchar(10), h.Desde, 120) AS Desde, CONVERT(varchar(10), h.Ate, 120) AS Ate, h.MotivoSaida
    FROM ExtensaoEncarregados h JOIN ExtensoesTenda e ON e.ExtensaoId = h.ExtensaoId JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoMaeId
    WHERE h.MembroId = @m ORDER BY h.Desde DESC`);
  return r.recordset.map((l) => ({ extensao: l.Extensao, congregacaoMae: l.Mae, desde: iso(l.Desde), ate: iso(l.Ate), motivoSaida: l.MotivoSaida }));
}
// Trava 9-A — Meus Dados também mostra os atos da pessoa nos pedidos de expansão (o ROPA a lista como titular: quem pede, dá o parecer, desiste ou registra a decisão).
async function atosDoTitular(pool, membroId) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT p.PedidoId, p.Tipo, p.Nome, CONVERT(varchar(10), p.SolicitadoEm, 120) AS SolicitadoEm,
           CASE WHEN p.SolicitadoPor = @m THEN 1 ELSE 0 END AS Pediu, CASE WHEN p.ParecerPor = @m THEN 1 ELSE 0 END AS DeuParecer,
           CASE WHEN p.DesistidoPor = @m THEN 1 ELSE 0 END AS Desistiu, CASE WHEN p.DecisaoRegistradaPor = @m THEN 1 ELSE 0 END AS RegistrouDecisao
    FROM PedidosExpansao p WHERE @m IN (p.SolicitadoPor, p.ParecerPor, p.DesistidoPor, p.DecisaoRegistradaPor) ORDER BY p.SolicitadoEm DESC, p.PedidoId DESC`);
  return r.recordset.map((l) => ({
    pedido: `${ex.TIPOS[l.Tipo] || l.Tipo}: ${l.Nome}`, em: iso(l.SolicitadoEm),
    papeis: [l.Pediu ? "pediu" : null, l.DeuParecer ? "deu o parecer da CME" : null, l.Desistiu ? "desistiu" : null, l.RegistrouDecisao ? "registrou a decisão da CLI" : null].filter(Boolean)
  }));
}

module.exports = {
  reunioesEncerradas, lerPedido, listarPedidos, detalharPedido, criarPedido, emitirParecer, desistir, decidir, listarExtensoes, historicoEncarregados, trocarEncarregado,
  catalogos, painel, detectarParecerVencido, dadosDoTitular, atosDoTitular, composicaoCME
};
