// shared/missoesDb.js — v9.4: Missões. O banco (migração 169); a regra pura está em missoes.js.
// Toda mudança de etapa é condicional (lida com UPDLOCK dentro da transação e gravada com WHERE no estado lido): dois pedidos ao mesmo tempo, um só passa. A geração
// do sustento, o reajuste e o encerramento passam um de cada vez (a mesma trava de aplicação): o reajuste nunca cai num mês que acabou de ser gerado.
//
// `alcance` (montado por montarAlcance): { geral, semiadespa, cme, presidente, tesouraria } — tudo vem do banco (Liderança vigente, CME calculada, assento de
// Presidente), nunca do bilhete. Quem vê: o nível geral, a SEMIADESPA, a CME e o Presidente. Quem gere (campos, pedidos, relatórios, encerramento): o nível geral
// e a SEMIADESPA. A CME dá o parecer; o nível geral registra a decisão da CLI; o Presidente concorda e reajusta; a Tesouraria Geral gera o sustento.
const { sql } = require("./db");
const mi = require("./missoes");
const storage = require("./storage");
const { registrarAuditoriaNaTransacao } = require("./auditoria");
const { violouUnicidade } = require("./violacaoUnica");
const { hojeBrasilia } = require("./dataBrasilia");
const { membrosSobDisciplina } = require("./disciplina");
const { lerReuniao, reunioesEncerradas } = require("./entidadesVinculadasDb");
const { ehPresidenteAtual } = require("./diretoria");
const { composicaoCME } = require("./comissoes");
const { chaveDeComparacao } = require("./entidadesVinculadas");
const { lerBase64, obterTrava } = require("./financeiroSeguro");

const NAO_EXISTE = { sucesso: false, naoExiste: true, mensagem: "Não encontrado." };
const PROIBIDO = (mensagem) => ({ sucesso: false, proibido: true, mensagem });
const MUDOU = { sucesso: false, mensagem: "Isto mudou enquanto você olhava. Atualize a tela." };
const SO_GESTAO = "Isto é da SEMIADESPA (o Secretário de Missões) ou do nível geral (Regimento, Art. 44).";
const SO_PRESIDENTE = "Só o Pastor Presidente em exercício faz este ato (Regimento, Art. 44 §2º e Art. 134 §6º, I).";
const TRAVA_SUSTENTO = "MissoesSustento";
const iso = (v) => (v == null ? null : (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)));
const mes7 = (v) => (v == null ? null : String(v).slice(0, 7));
const reais = (v) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
// Uma de cada vez (dentro da transação): os pedidos e decisões de envio, ou a geração/reajuste/encerramento do sustento.
async function enfileirar(rq, recurso) {
  const r = await rq().input("rec", sql.NVarChar(60), `ieadespa-missoes-${recurso}`)
    .query(`DECLARE @r INT; EXEC @r = sp_getapplock @Resource = @rec, @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = 20000; SELECT @r AS r`);
  return Number(r.recordset[0].r) >= 0;
}
const OCUPADO = { sucesso: false, mensagem: "Outro ato de Missões está sendo gravado agora. Tente de novo em instantes." };

// ================================================================ alcance ================================================================
async function ehDaSemiadespa(pool, membroId, hoje) {
  const r = await pool.request().input("m", sql.Int, membroId).input("h", sql.Date, hoje).query(`
    SELECT TOP 1 1 AS x FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId JOIN Departamentos d ON d.DepartamentoId = l.EscopoId
    WHERE l.MembroId = @m AND l.EscopoTipo = 'DEPARTAMENTO' AND d.Sigla = 'SEMIADESPA'
      AND p.Nome IN (N'Secretário de Missões', N'Líder Geral de Departamento/Secretaria') AND (l.AtivoAte IS NULL OR l.AtivoAte >= @h)`);
  return r.recordset.length > 0;
}
async function montarAlcance(pool, { membroId, geral, tesouraria, hoje = hojeBrasilia() }) {
  const [semiadespa, cme, presidente] = await Promise.all([
    ehDaSemiadespa(pool, membroId, hoje),
    composicaoCME(pool).then((l) => l.some((m) => Number(m.membroId) === Number(membroId))),
    ehPresidenteAtual(pool, sql, membroId)
  ]);
  return { geral: !!geral, semiadespa, cme, presidente, tesouraria: !!tesouraria };
}
const veMissoes = (a) => !!a && (a.geral || a.semiadespa || a.cme || a.presidente);
const gere = (a) => !!a && (a.geral || a.semiadespa);
// Revisão de 05/11/2026 — a CME (que não é também da SEMIADESPA, do nível geral nem o Presidente) vê o que precisa para o parecer: os envios aguardando o parecer, os que
// ela mesma já analisou e os números gerais; não o sustento de cada um, os relatórios nem a prévia do pagamento.
const soCME = (a) => !!a && a.cme && !a.geral && !a.semiadespa && !a.presidente;
// A Tesouraria Geral (financeiro do nível geral) sem nenhum outro papel em Missões: só a prévia e a geração do sustento.
const soTesouraria = (a) => !!a && a.tesouraria && !veMissoes(a);

// ================================================================ pessoas ================================================================
// O missionário: membro ativo, em comunhão e sem processo disciplinar em curso. Devolve a recusa ou null.
async function problemaDoMissionario(pool, rq, membroId) {
  const m = (await rq().input("m", sql.Int, membroId).query(`SELECT MembroId, Nome, Status, SituacaoMembro FROM MembroReferencia WHERE MembroId = @m`)).recordset[0];
  if (!m) return "Matrícula do missionário não encontrada.";
  if (m.Status !== "ATIVO" || m.SituacaoMembro === "SEM_COMUNHAO" || (await membrosSobDisciplina(pool)).has(m.MembroId)) {
    return "O missionário precisa ser membro ativo e em comunhão, sem processo disciplinar em curso.";
  }
  return null;
}
async function lerFornecedor(rq, fornecedorId) {
  const f = (await rq().input("f", sql.Int, fornecedorId).query(`
    SELECT FornecedorId, Nome, Tipo, Ativo, DadosBancariosConfirmados, Banco, Agencia, Conta, MembroId FROM Fornecedores WHERE FornecedorId = @f`)).recordset[0];
  return f ? { fornecedorId: f.FornecedorId, nome: f.Nome, tipo: f.Tipo, ativo: !!f.Ativo, confirmado: !!f.DadosBancariosConfirmados, bancoCompleto: !!(f.Banco && f.Agencia && f.Conta),
    membroId: f.MembroId == null ? null : Number(f.MembroId) } : null;
}
async function lerCongregacao(rq, congregacaoId) {
  const c = (await rq().input("c", sql.Int, congregacaoId).query(`SELECT CongregacaoId, Nome, Ativa FROM Congregacoes WHERE CongregacaoId = @c`)).recordset[0];
  return c ? { congregacaoId: c.CongregacaoId, nome: c.Nome, ativa: !!c.Ativa } : null;
}
// A fonte e quem recebe, conferidos no banco (o pedido e o reajuste usam o mesmo). Revisão de 05/11/2026:
//  - a pessoa física que recebe é o próprio missionário (o fornecedor ligado à matrícula dele, como a prebenda confere o CPF); outra pessoa, só como pessoa jurídica
//    (agência ou igreja parceira: convênio externo);
//  - o caixa local é o da congregação mantenedora do CAMPO (preenchido aqui, em `d.congregacaoFonteId`): ninguém compromete o caixa de outra congregação.
async function problemaDoDinheiro(rq, d, { membroId, campo }) {
  if (!d.sustento) return { problema: null, recebedor: null };
  const f = await lerFornecedor(rq, d.fornecedorId);
  if (!f || !f.ativo) return { problema: "Quem recebe precisa ser um fornecedor ativo do Contas a Pagar." };
  if (f.tipo === "PF" && f.membroId !== Number(membroId)) {
    return { problema: "A pessoa física que recebe é o próprio missionário: escolha o fornecedor ligado à matrícula dele (em Fornecedores). Outra pessoa só recebe como pessoa jurídica (agência ou igreja parceira — convênio externo)." };
  }
  if (d.fonte === "CONGREGACAO") {
    const mant = campo && campo.mantenedora ? await lerCongregacao(rq, campo.mantenedora.congregacaoId) : null;
    if (!mant) return { problema: "O campo não tem congregação mantenedora: cadastre-a no campo, ou escolha o Tesouro Geral." };
    if (!mant.ativa) return { problema: "A congregação mantenedora do campo está inativa." };
    d.congregacaoFonteId = mant.congregacaoId;
  }
  return { problema: null, recebedor: f };
}
// A trava da pessoa antes da do envio (a mesma ordem da vacância, que trava a ficha e depois mexe no envio): os dois ao mesmo tempo não se travam um no outro.
async function travarMissionarioDoEnvio(rq, envioId) {
  const m = (await rq().input("id", sql.Int, envioId).query(`SELECT MembroId FROM EnviosMissionarios WHERE EnvioId = @id`)).recordset[0];
  if (m) await rq().input("m", sql.Int, m.MembroId).query(`SELECT MembroId FROM MembroReferencia WITH (UPDLOCK, ROWLOCK) WHERE MembroId = @m`);
}
async function salvarArquivo(arquivo) {
  if (!arquivo) return { url: null };
  const lido = lerBase64(arquivo.base64);
  if (lido.erro) return { erro: lido.erro };
  return { url: await storage.salvarDocumento(lido.buffer, arquivo.mime) };
}

// ================================================================ campos ================================================================
const lugarDe = (c) => (mi.ehBrasil(c.pais)
  ? `${c.cidade || ""}${c.uf ? `/${c.uf}` : ""}${c.zonaRural ? " (zona rural adjacente)" : ""}`
  : `${c.cidade ? `${c.cidade}, ` : ""}${c.pais}`);
function formaCampo(l) {
  const c = {
    campoId: l.CampoId, nome: l.Nome, pais: l.Pais, uf: l.UF, cidade: l.Cidade, zonaRural: !!l.ZonaRuralAdjacente, abrangencia: l.Abrangencia,
    abrangenciaRotulo: mi.ABRANGENCIAS[l.Abrangencia] || l.Abrangencia,
    mantenedora: l.CongregacaoMantenedoraId ? { congregacaoId: l.CongregacaoMantenedoraId, nome: l.MantenedoraNome } : null,
    divulgacao: l.Divulgacao, divulgacaoRotulo: mi.DIVULGACOES[l.Divulgacao] || l.Divulgacao, descricao: l.Descricao, status: l.Status,
    statusRotulo: mi.STATUS_CAMPO[l.Status] || l.Status, abertoEm: iso(l.AbertoEm), encerradoEm: iso(l.EncerradoEm), motivoEncerramento: l.MotivoEncerramento,
    enviosVivos: Number(l.EnviosVivos || 0), enviosAtivos: Number(l.EnviosAtivos || 0)
  };
  c.lugar = lugarDe(c);
  return c;
}
const SQL_CAMPO = (travar) => `
  SELECT c.*, mc.Nome AS MantenedoraNome,
         (SELECT COUNT(*) FROM EnviosMissionarios e WHERE e.CampoId = c.CampoId AND e.Status IN (N'EM_PARECER', N'AGUARDANDO_CLI', N'AGUARDANDO_PRESIDENTE', N'ATIVO')) AS EnviosVivos,
         (SELECT COUNT(*) FROM EnviosMissionarios e WHERE e.CampoId = c.CampoId AND e.Status = N'ATIVO') AS EnviosAtivos
  FROM CamposMissionarios c ${travar ? "WITH (UPDLOCK, ROWLOCK)" : ""} LEFT JOIN Congregacoes mc ON mc.CongregacaoId = c.CongregacaoMantenedoraId`;
async function lerCampo(rq, campoId, { travar = false } = {}) {
  const r = await rq().input("id", sql.Int, campoId).query(`${SQL_CAMPO(travar)} WHERE c.CampoId = @id`);
  return r.recordset[0] ? formaCampo(r.recordset[0]) : null;
}
async function listarCampos(pool, { alcance, todos = false }) {
  if (!veMissoes(alcance)) return [];
  const r = await pool.request().query(`${SQL_CAMPO(false)} ${todos ? "" : "WHERE c.Status = N'ATIVO'"} ORDER BY CASE WHEN c.Status = N'ATIVO' THEN 0 ELSE 1 END, c.Nome`);
  return r.recordset.map(formaCampo).map((c) => ({ ...c, podeEditar: gere(alcance) && c.status === "ATIVO" }));
}
// Nome igual a outro campo ativo, sem diferenciar maiúscula, acento nem espaço nas pontas.
async function haHomonimo(rq, nome, excetoId = null) {
  const r = await rq().query(`SELECT CampoId, Nome FROM CamposMissionarios WHERE Status = N'ATIVO'`);
  return r.recordset.some((l) => l.CampoId !== excetoId && chaveDeComparacao(l.Nome) === chaveDeComparacao(nome));
}
const HOMONIMO = "Já existe um campo ativo com esse nome (maiúsculas, acentos e espaços nas pontas não diferenciam). Escolha outro nome.";

async function criarCampo(pool, { dados, por, hoje = hojeBrasilia(), alcance }) {
  if (!gere(alcance)) return PROIBIDO(SO_GESTAO);
  const v = mi.validarCampo(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const d = v.dados;
  try {
    return await emTransacao(pool, async (t, rq) => {
      if (!(await enfileirar(rq, "campo"))) return OCUPADO;
      if (d.congregacaoMantenedoraId) {
        const c = await lerCongregacao(rq, d.congregacaoMantenedoraId);
        if (!c || !c.ativa) return { sucesso: false, mensagem: "A congregação mantenedora precisa estar ativa." };
      }
      if (await haHomonimo(rq, d.nome)) return { sucesso: false, mensagem: HOMONIMO };
      const r = await rq().input("nome", sql.NVarChar(150), d.nome).input("pais", sql.NVarChar(80), d.pais).input("uf", sql.NVarChar(2), d.uf)
        .input("cid", sql.NVarChar(150), d.cidade).input("zona", sql.Bit, d.zonaRural).input("abr", sql.NVarChar(15), d.abrangencia)
        .input("mant", sql.Int, d.congregacaoMantenedoraId).input("div", sql.NVarChar(10), d.divulgacao).input("desc", sql.NVarChar(1000), d.descricao)
        .input("h", sql.Date, hoje).input("por", sql.Int, por)
        .query(`INSERT INTO CamposMissionarios (Nome, Pais, UF, Cidade, ZonaRuralAdjacente, Abrangencia, CongregacaoMantenedoraId, Divulgacao, Descricao, Status, AbertoEm, AbertoPor)
                OUTPUT inserted.CampoId VALUES (@nome, @pais, @uf, @cid, @zona, @abr, @mant, @div, @desc, N'ATIVO', @h, @por)`);
      const campoId = r.recordset[0].CampoId;
      await registrarAuditoriaNaTransacao(t, { tabela: "CamposMissionarios", registroId: campoId, acao: "MISSOES_CAMPO_ABERTO", usuarioId: por, dadosDepois: d });
      return { sucesso: true, campoId, mensagem: `Campo cadastrado (${mi.ABRANGENCIAS[d.abrangencia]}).` };
    });
  } catch (e) {
    if (violouUnicidade(e)) return { sucesso: false, mensagem: HOMONIMO };
    throw e;
  }
}

async function editarCampo(pool, { campoId, dados, por, alcance }) {
  if (!gere(alcance)) return PROIBIDO(SO_GESTAO);
  const v = mi.validarCampo(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const d = v.dados;
  try {
    return await emTransacao(pool, async (t, rq) => {
      // a trava dos envios também: um pedido que está sendo gravado agora não pega a abrangência de antes da mudança do lugar (revisão de 05/11/2026)
      if (!(await enfileirar(rq, "campo")) || !(await enfileirar(rq, "envio"))) return OCUPADO;
      const c = await lerCampo(rq, campoId, { travar: true });
      if (!c) return NAO_EXISTE;
      if (c.status !== "ATIVO") return { sucesso: false, mensagem: "Este campo está encerrado." };
      // os envios vivos já passaram (ou estão passando) pelas etapas que a abrangência deste lugar pediu
      if (c.enviosVivos > 0 && mi.mudouOLugar(c, d)) return { sucesso: false, mensagem: "O campo tem envio em andamento ou ativo: o lugar (país, UF, cidade, zona rural) não muda, porque foi ele que decidiu por onde o envio passou. Encerre o campo e cadastre outro." };
      if (d.congregacaoMantenedoraId && (!c.mantenedora || c.mantenedora.congregacaoId !== d.congregacaoMantenedoraId)) {
        const mc = await lerCongregacao(rq, d.congregacaoMantenedoraId);
        if (!mc || !mc.ativa) return { sucesso: false, mensagem: "A congregação mantenedora precisa estar ativa." };
      }
      if (await haHomonimo(rq, d.nome, campoId)) return { sucesso: false, mensagem: HOMONIMO };
      const u = await rq().input("id", sql.Int, campoId).input("nome", sql.NVarChar(150), d.nome).input("pais", sql.NVarChar(80), d.pais).input("uf", sql.NVarChar(2), d.uf)
        .input("cid", sql.NVarChar(150), d.cidade).input("zona", sql.Bit, d.zonaRural).input("abr", sql.NVarChar(15), d.abrangencia)
        .input("mant", sql.Int, d.congregacaoMantenedoraId).input("div", sql.NVarChar(10), d.divulgacao).input("desc", sql.NVarChar(1000), d.descricao)
        .query(`UPDATE CamposMissionarios SET Nome = @nome, Pais = @pais, UF = @uf, Cidade = @cid, ZonaRuralAdjacente = @zona, Abrangencia = @abr,
                       CongregacaoMantenedoraId = @mant, Divulgacao = @div, Descricao = @desc WHERE CampoId = @id AND Status = N'ATIVO'`);
      if (!u.rowsAffected[0]) return MUDOU;
      await registrarAuditoriaNaTransacao(t, { tabela: "CamposMissionarios", registroId: campoId, acao: "MISSOES_CAMPO_EDITADO", usuarioId: por,
        dadosAntes: { nome: c.nome, lugar: c.lugar, divulgacao: c.divulgacao, mantenedora: c.mantenedora }, dadosDepois: d });
      return { sucesso: true, mensagem: "Campo atualizado." };
    });
  } catch (e) {
    if (violouUnicidade(e)) return { sucesso: false, mensagem: HOMONIMO };
    throw e;
  }
}

async function encerrarCampo(pool, { campoId, dados, por, hoje = hojeBrasilia(), alcance }) {
  if (!gere(alcance)) return PROIBIDO(SO_GESTAO);
  const v = mi.validarMotivo(dados, "O motivo do encerramento");
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  return emTransacao(pool, async (t, rq) => {
    if (!(await enfileirar(rq, "envio"))) return OCUPADO;
    const c = await lerCampo(rq, campoId, { travar: true });
    if (!c) return NAO_EXISTE;
    if (c.status !== "ATIVO") return { sucesso: false, mensagem: "Este campo já está encerrado." };
    if (c.enviosVivos > 0) return { sucesso: false, mensagem: "O campo tem envio em andamento ou ativo: encerre o envio (ou registre a desistência) antes." };
    const u = await rq().input("id", sql.Int, campoId).input("h", sql.Date, hoje).input("por", sql.Int, por).input("m", sql.NVarChar(1000), v.dados.motivo)
      .query(`UPDATE CamposMissionarios SET Status = N'ENCERRADO', EncerradoEm = @h, EncerradoPor = @por, MotivoEncerramento = @m WHERE CampoId = @id AND Status = N'ATIVO'`);
    if (!u.rowsAffected[0]) return MUDOU;
    await registrarAuditoriaNaTransacao(t, { tabela: "CamposMissionarios", registroId: campoId, acao: "MISSOES_CAMPO_ENCERRADO", usuarioId: por, dadosDepois: v.dados });
    return { sucesso: true, mensagem: "Campo encerrado." };
  });
}

// ================================================================ envios ================================================================
const COLUNAS_ENVIO = `
  e.EnvioId, e.CampoId, c.Nome AS CampoNome, c.Abrangencia, c.Divulgacao, c.Pais, c.UF, c.Cidade, c.ZonaRuralAdjacente, c.Status AS CampoStatus,
  e.MembroId, m.Nome AS MissionarioNome, m.CongregacaoId AS MissionarioCongregacaoId, m.Status AS MissionarioStatus, m.SituacaoMembro AS MissionarioSituacao, e.EncerradoPorVacancia, e.Status, e.PrecisaCME, e.PrecisaCLI, e.PrecisaPresidente,
  e.SustentoMensal, e.Fonte, e.CongregacaoFonteId, cf.Nome AS CongregacaoFonteNome, e.FornecedorId, f.Nome AS FornecedorNome, f.Tipo AS FornecedorTipo,
  e.DocumentoUrl, e.Periodicidade, e.DivulgarNome, e.Justificativa, e.SolicitadoPor, sol.Nome AS SolicitanteNome, CONVERT(varchar(10), e.SolicitadoEm, 120) AS SolicitadoEm,
  e.ParecerCME, e.ParecerFundamentacao, e.ParecerPor, pp.Nome AS ParecerPorNome, CONVERT(varchar(10), e.ParecerEm, 120) AS ParecerEm,
  e.DecisaoSessaoId, CONVERT(varchar(10), e.DecisaoEm, 120) AS DecisaoEm, e.DecisaoResultado, e.DecisaoUrgencia, e.DecisaoMotivo, e.DecisaoRegistradaPor,
  e.PresidenteResultado, e.PresidenteMotivo, e.PresidentePor, CONVERT(varchar(10), e.PresidenteEm, 120) AS PresidenteEm,
  CONVERT(varchar(10), e.AtivadoEm, 120) AS AtivadoEm, e.InicioMes, CONVERT(varchar(10), e.EncerradoEm, 120) AS EncerradoEm, e.FimMes, e.MotivoEncerramento, e.EncerradoPor,
  CONVERT(varchar(10), e.DesistidoEm, 120) AS DesistidoEm, e.DesistenciaMotivo, e.DesistidoPor`;
const JUNCOES_ENVIO = (travar) => `
  FROM EnviosMissionarios e ${travar ? "WITH (UPDLOCK, ROWLOCK)" : ""}
  JOIN CamposMissionarios c ON c.CampoId = e.CampoId
  JOIN MembroReferencia m ON m.MembroId = e.MembroId
  LEFT JOIN Congregacoes cf ON cf.CongregacaoId = e.CongregacaoFonteId
  LEFT JOIN Fornecedores f ON f.FornecedorId = e.FornecedorId
  LEFT JOIN MembroReferencia sol ON sol.MembroId = e.SolicitadoPor
  LEFT JOIN MembroReferencia pp ON pp.MembroId = e.ParecerPor`;
function formaEnvio(l, hoje) {
  const envio = {
    envioId: l.EnvioId, status: l.Status, statusRotulo: mi.STATUS_ENVIO[l.Status] || l.Status,
    campo: { campoId: l.CampoId, nome: l.CampoNome, abrangencia: l.Abrangencia, abrangenciaRotulo: mi.ABRANGENCIAS[l.Abrangencia] || l.Abrangencia, divulgacao: l.Divulgacao,
      status: l.CampoStatus, lugar: lugarDe({ pais: l.Pais, uf: l.UF, cidade: l.Cidade, zonaRural: !!l.ZonaRuralAdjacente }) },
    missionario: { membroId: l.MembroId, nome: l.MissionarioNome, congregacaoId: l.MissionarioCongregacaoId },
    encerradoPorVacancia: !!l.EncerradoPorVacancia,
    etapas: { cme: !!l.PrecisaCME, cli: !!l.PrecisaCLI, presidente: !!l.PrecisaPresidente },
    sustentoProposto: Number(l.SustentoMensal), fonte: l.Fonte, fonteRotulo: l.Fonte ? mi.FONTES[l.Fonte] : null,
    congregacaoFonte: l.CongregacaoFonteId ? { congregacaoId: l.CongregacaoFonteId, nome: l.CongregacaoFonteNome } : null,
    recebedor: l.FornecedorId ? { fornecedorId: l.FornecedorId, nome: l.FornecedorNome, tipo: l.FornecedorTipo } : null,
    temDocumento: !!l.DocumentoUrl, documentoUrlInterno: l.DocumentoUrl || null,
    periodicidade: l.Periodicidade, periodicidadeRotulo: mi.PERIODICIDADES[l.Periodicidade] || l.Periodicidade, divulgarNome: !!l.DivulgarNome,
    justificativa: l.Justificativa, solicitadoPor: l.SolicitadoPor, solicitanteNome: l.SolicitanteNome, solicitadoEm: l.SolicitadoEm,
    parecer: l.ParecerCME ? { resultado: l.ParecerCME, rotulo: mi.PARECERES[l.ParecerCME], fundamentacao: l.ParecerFundamentacao, por: l.ParecerPor, porNome: l.ParecerPorNome, em: l.ParecerEm } : null,
    parecerEm: l.ParecerEm || null,
    decisao: l.DecisaoResultado ? { sessaoId: l.DecisaoSessaoId, em: l.DecisaoEm, resultado: l.DecisaoResultado, rotulo: mi.RESULTADOS_CLI[l.DecisaoResultado], urgencia: !!l.DecisaoUrgencia, motivo: l.DecisaoMotivo } : null,
    presidente: l.PresidenteResultado ? { resultado: l.PresidenteResultado, rotulo: mi.RESULTADOS_PRESIDENTE[l.PresidenteResultado], motivo: l.PresidenteMotivo, em: l.PresidenteEm } : null,
    ativadoEm: l.AtivadoEm || null, inicioMes: mes7(l.InicioMes), encerradoEm: l.EncerradoEm || null, fimMes: mes7(l.FimMes), motivoEncerramento: l.MotivoEncerramento,
    desistencia: l.DesistidoEm ? { em: l.DesistidoEm, motivo: l.DesistenciaMotivo } : null,
    _atos: { decisaoPor: l.DecisaoRegistradaPor, presidentePor: l.PresidentePor, encerradoPor: l.EncerradoPor, desistidoPor: l.DesistidoPor },
    _pessoa: { status: l.MissionarioStatus, situacao: l.MissionarioSituacao }
  };
  envio.prazoParecer = envio.etapas.cme ? mi.prazoParecer(envio.solicitadoEm) : null;
  envio.parecerVencido = mi.parecerVencido(envio, hoje);
  return envio;
}
// O que sai para a tela: sem a URL interna do documento (a ficha dá o endereço assinado a quem gere) e sem os atos internos.
const publico = ({ documentoUrlInterno, _atos, _pessoa, ...resto }) => resto;
async function lerEnvio(rq, envioId, hoje, { travar = false } = {}) {
  const r = await rq().input("id", sql.Int, envioId).query(`SELECT ${COLUNAS_ENVIO} ${JUNCOES_ENVIO(travar)} WHERE e.EnvioId = @id`);
  return r.recordset[0] ? formaEnvio(r.recordset[0], hoje) : null;
}

// ---- tudo de uma vez (painel, prévia, geração): os valores, os relatórios e as gerações de todos os envios ----
async function carregarDinheiro(rq, envioIds = null) {
  const filtro = (col) => (envioIds ? `WHERE ${col} IN (${envioIds.map((n) => Number(n)).filter(Number.isInteger).join(",") || "0"})` : "");
  // uma consulta depois da outra: dentro da transação (geração, reajuste, encerramento) a conexão não aceita duas ao mesmo tempo
  const valores = await rq().query(`SELECT v.EnvioId, v.ValorId, v.DesdeMes, v.Valor, v.Fonte, v.CongregacaoFonteId, cg.Nome AS CongNome, cg.Ativa AS CongAtiva, v.FornecedorId, f.Nome AS FornNome, f.Tipo AS FornTipo,
                       f.Ativo AS FornAtivo, f.DadosBancariosConfirmados AS FornConfirmado, CASE WHEN f.Banco IS NOT NULL AND f.Agencia IS NOT NULL AND f.Conta IS NOT NULL THEN 1 ELSE 0 END AS FornBanco,
                       v.Motivo, CONVERT(varchar(10), v.RegistradoEm, 120) AS RegistradoEm
                FROM EnvioSustentoValores v LEFT JOIN Congregacoes cg ON cg.CongregacaoId = v.CongregacaoFonteId LEFT JOIN Fornecedores f ON f.FornecedorId = v.FornecedorId
                ${filtro("v.EnvioId")} ORDER BY v.EnvioId, v.DesdeMes`);
  const relatorios = await rq().query(`SELECT RelatorioId, EnvioId, PeriodoInicio, Batismos, Conversoes, Discipulado FROM RelatoriosCampo ${filtro("EnvioId")}`);
  const geracoes = await rq().query(`SELECT g.EnvioId, g.MesReferencia, g.Valor, g.SaidaId, s.Status AS SaidaStatus FROM SustentoGeracoes g JOIN SaidasTesouraria s ON s.SaidaId = g.SaidaId
                ${filtro("g.EnvioId")} ORDER BY g.EnvioId, g.MesReferencia`);
  const porEnvio = new Map();
  const de = (id) => { if (!porEnvio.has(id)) porEnvio.set(id, { valores: [], relatorios: [], geracoes: [] }); return porEnvio.get(id); };
  for (const l of valores.recordset) {
    de(l.EnvioId).valores.push({ valorId: l.ValorId, desdeMes: mes7(l.DesdeMes), valor: Number(l.Valor), fonte: l.Fonte, fonteRotulo: l.Fonte ? mi.FONTES[l.Fonte] : null,
      congregacaoFonte: l.CongregacaoFonteId ? { congregacaoId: l.CongregacaoFonteId, nome: l.CongNome, ativa: !!l.CongAtiva } : null,
      recebedor: l.FornecedorId ? { fornecedorId: l.FornecedorId, nome: l.FornNome, tipo: l.FornTipo, ativo: !!l.FornAtivo, confirmado: !!l.FornConfirmado, bancoCompleto: !!l.FornBanco } : null,
      motivo: l.Motivo, registradoEm: l.RegistradoEm });
  }
  for (const l of relatorios.recordset) {
    de(l.EnvioId).relatorios.push({ relatorioId: l.RelatorioId, periodoInicio: mes7(l.PeriodoInicio), batismos: Number(l.Batismos), conversoes: Number(l.Conversoes), discipulado: Number(l.Discipulado) });
  }
  for (const l of geracoes.recordset) {
    de(l.EnvioId).geracoes.push({ mes: mes7(l.MesReferencia), valor: Number(l.Valor), saidaId: l.SaidaId, saidaStatus: l.SaidaStatus });
  }
  return (id) => porEnvio.get(id) || { valores: [], relatorios: [], geracoes: [] };
}
const vigenteNoMes = (valores, mes) => valores.filter((v) => v.desdeMes <= mes).reduce((a, v) => (!a || v.desdeMes > a.desdeMes ? v : a), null);
// A geração que vale: a Saída cancelada ou rejeitada no Contas a Pagar não conta (revisão de 05/11/2026: antes o mês ficava "gerado" para sempre e o missionário
// nunca o recebia) — o mês volta a ser gerável, e o reajuste e o encerramento não esbarram nela.
const SAIDA_DESFEITA = ["CANCELADA", "REJEITADA"];
const geracoesValidas = (geracoes) => geracoes.filter((g) => !SAIDA_DESFEITA.includes(g.saidaStatus));
const ultimoGerado = (geracoes) => geracoesValidas(geracoes).reduce((a, g) => (!a || g.mes > a ? g.mes : a), null);
// A pessoa que não pode receber o sustento agora (revisão de 05/11/2026): saiu do estado ativo (licença de candidatura, por exemplo), perdeu a comunhão ou tem processo
// disciplinar em curso — o mês fica impedido enquanto durar (não se perde: volta quando a situação se resolve). O envio encerrado pela vacância não passa por aqui: o
// último mês dele ainda é gerado.
function impedimentoDaPessoa(envio, sob) {
  if (envio.encerradoPorVacancia || !envio._pessoa) return null;
  if (envio._pessoa.status !== "ATIVO") return "O missionário não está ativo no rol agora (licença de candidatura ou outra situação): o sustento fica parado enquanto durar.";
  if (envio._pessoa.situacao === "SEM_COMUNHAO") return "O missionário está sem comunhão: o sustento fica parado enquanto durar.";
  if (sob && sob.has(Number(envio.missionario.membroId))) return "O missionário tem processo disciplinar em curso: o sustento fica parado até a decisão.";
  return null;
}

// O mês de um envio para a Tesouraria: já gerado, a gerar, suspenso (relatório vencido) ou impedido (o motivo diz o que falta). `null` = o envio não tem sustento
// nesse mês (fora do período, ou o valor vigente é zero). `sob`: quem está sob disciplina (lido uma vez por quem chama).
function avaliarMes(envio, din, mes, hoje, sob = null) {
  if (!["ATIVO", "ENCERRADO"].includes(envio.status) || !envio.inicioMes || mes < envio.inicioMes || (envio.fimMes && mes > envio.fimMes)) return null;
  const gerado = geracoesValidas(din.geracoes).find((g) => g.mes === mes);
  if (gerado) return { situacao: "GERADO", valor: gerado.valor, saidaId: gerado.saidaId, saidaStatus: gerado.saidaStatus };
  const desfeita = din.geracoes.find((g) => g.mes === mes);
  const v = vigenteNoMes(din.valores, mes);
  if (!v || !v.valor) return null;
  const base = { valor: v.valor, fonte: v.fonte, fonteRotulo: v.fonteRotulo, recebedor: v.recebedor ? { nome: v.recebedor.nome, tipo: v.recebedor.tipo } : null,
    congregacaoFonte: v.congregacaoFonte ? { nome: v.congregacaoFonte.nome } : null, saidaDesfeita: desfeita ? desfeita.saidaId : null };
  const sit = mi.situacaoRelatorios(envio, din.relatorios.map((r) => r.periodoInicio), hoje);
  if (sit.suspenso) {
    return { ...base, situacao: "SUSPENSO", motivo: `Relatório de campo vencido: ${sit.vencidos.map((p) => `${mi.mesBr(p.inicio)}${p.fim !== p.inicio ? ` a ${mi.mesBr(p.fim)}` : ""} (venceu em ${mi.br(p.prazo)})`).join(", ")}. Lance o relatório e gere de novo (a prestação de contas condiciona o recurso, como no Regimento, Art. 133-C §2º).` };
  }
  const pessoa = impedimentoDaPessoa(envio, sob);
  if (pessoa) return { ...base, situacao: "IMPEDIDO", motivo: pessoa };
  const r = v.recebedor;
  if (!r || !r.ativo) return { ...base, situacao: "IMPEDIDO", motivo: "Quem recebe não é um fornecedor ativo: o Presidente precisa reajustar o sustento com outro recebedor." };
  if (!r.confirmado || !r.bancoCompleto) return { ...base, situacao: "IMPEDIDO", motivo: "Os dados bancários de quem recebe estão incompletos ou esperando a confirmação de outra pessoa (Fornecedores)." };
  if (v.fonte === "CONGREGACAO" && (!v.congregacaoFonte || !v.congregacaoFonte.ativa)) return { ...base, situacao: "IMPEDIDO", motivo: "A congregação mantenedora que paga está inativa: o Presidente precisa reajustar a fonte." };
  if (v.fonte === "GERAL" && !envio.missionario.congregacaoId) return { ...base, situacao: "IMPEDIDO", motivo: "O missionário está sem congregação no cadastro: corrija a ficha dele." };
  if (!envio.documentoUrlInterno) return { ...base, situacao: "IMPEDIDO", motivo: "O envio está sem o documento (termo de compromisso): o Presidente anexa no reajuste." };
  return { ...base, situacao: "A_GERAR", _v: v };
}

// A CME que só é CME vê os envios aguardando o parecer e os que ela mesma analisou (revisão de 05/11/2026: minimização).
const cmeAlcanca = (e, membroId) => e.status === "EM_PARECER" || (e.parecer && Number(e.parecer.por) === Number(membroId));
async function listarEnvios(pool, { alcance, hoje = hojeBrasilia(), status = null, membroId = null }) {
  if (!veMissoes(alcance)) return [];
  const r = await pool.request().input("s", sql.NVarChar(25), status)
    .query(`SELECT ${COLUNAS_ENVIO} ${JUNCOES_ENVIO(false)} WHERE (@s IS NULL OR e.Status = @s)
            ORDER BY CASE WHEN e.Status IN (N'EM_PARECER', N'AGUARDANDO_CLI', N'AGUARDANDO_PRESIDENTE') THEN 0 WHEN e.Status = N'ATIVO' THEN 1 ELSE 2 END, e.SolicitadoEm DESC, e.EnvioId DESC`);
  const envios = r.recordset.map((l) => formaEnvio(l, hoje)).filter((e) => !soCME(alcance) || cmeAlcanca(e, membroId));
  const din = await carregarDinheiro(() => pool.request());
  const atual = mi.mesDe(hoje);
  return envios.map((e) => {
    const d = din(e.envioId);
    const vig = vigenteNoMes(d.valores, atual);
    const sit = e.inicioMes ? mi.situacaoRelatorios(e, d.relatorios.map((x) => x.periodoInicio), hoje) : null;
    return { ...publico(e), sustentoVigente: vig ? vig.valor : (e.inicioMes ? 0 : null), relatoriosVencidos: sit ? sit.vencidos.length : 0, suspenso: !!(sit && sit.suspenso && e.status === "ATIVO") };
  });
}

function acoesDoEnvio(e, alcance, membroId, temPeriodos) {
  const andamento = mi.EM_ANDAMENTO.includes(e.status);
  const ehSolicitante = Number(e.solicitadoPor) === Number(membroId);
  return {
    parecer: e.status === "EM_PARECER" && !!alcance.cme && !ehSolicitante,
    decidir: !!alcance.geral && (e.status === "AGUARDANDO_CLI" || e.status === "EM_PARECER"),
    // o Presidente não concorda com o envio que ele mesmo pediu (revisão de 05/11/2026: quem pede não autoriza o próprio pedido)
    presidente: e.status === "AGUARDANDO_PRESIDENTE" && !!alcance.presidente && !ehSolicitante,
    desistir: andamento && (ehSolicitante || !!alcance.geral),
    encerrar: e.status === "ATIVO" && gere(alcance),
    reajustar: e.status === "ATIVO" && !!alcance.presidente,
    relatorio: ["ATIVO", "ENCERRADO"].includes(e.status) && gere(alcance) && temPeriodos,
    // a autorização do nome no mural se dá e se retira (LGPD Art. 8º §5º): a SEMIADESPA registra o que o missionário pediu
    divulgacao: mi.VIVOS.includes(e.status) && gere(alcance)
  };
}

async function detalharEnvio(pool, { envioId, alcance, hoje = hojeBrasilia(), membroId }) {
  if (!veMissoes(alcance)) return null;
  const e = await lerEnvio(() => pool.request(), envioId, hoje);
  if (!e) return null;
  if (soCME(alcance)) {
    if (!cmeAlcanca(e, membroId)) return null;
    // a CME vê o pedido (com o sustento proposto e quem recebe, para a viabilidade), nunca o documento, os relatórios nem os pagamentos
    return { ...publico(e), documentoUrl: null, valores: [], geracoes: [], periodos: [], relatorios: [], ultimoGerado: null, acoes: acoesDoEnvio(e, alcance, membroId, false) };
  }
  const din = (await carregarDinheiro(() => pool.request(), [envioId]))(envioId);
  const rel = await pool.request().input("id", sql.Int, envioId).query(`
    SELECT r.RelatorioId, r.PeriodoInicio, r.Batismos, r.Conversoes, r.Discipulado, r.Atividades, r.Pedidos, r.AnexoUrl, CONVERT(varchar(10), r.RecebidoEm, 120) AS RecebidoEm,
           rp.Nome AS RegistradoPorNome, CONVERT(varchar(10), r.RetificadoEm, 120) AS RetificadoEm
    FROM RelatoriosCampo r LEFT JOIN MembroReferencia rp ON rp.MembroId = r.RegistradoPor WHERE r.EnvioId = @id ORDER BY r.PeriodoInicio DESC`);
  const sit = mi.situacaoRelatorios(e, din.relatorios.map((x) => x.periodoInicio), hoje);
  const atual = mi.mesDe(hoje);
  const vig = vigenteNoMes(din.valores, atual);
  const verArquivos = gere(alcance) || !!alcance.presidente;
  return {
    ...publico(e),
    documentoUrl: verArquivos && e.documentoUrlInterno ? storage.urlDocumentoComSas(e.documentoUrlInterno) : null,
    sustentoVigente: vig ? vig.valor : (e.inicioMes ? 0 : null),
    valores: din.valores.map((v) => ({ desdeMes: v.desdeMes, valor: v.valor, fonteRotulo: v.fonteRotulo, congregacaoFonte: v.congregacaoFonte ? v.congregacaoFonte.nome : null,
      recebedor: v.recebedor ? `${v.recebedor.nome} (${v.recebedor.tipo})` : null, motivo: v.motivo, registradoEm: v.registradoEm })),
    geracoes: din.geracoes.map((g) => ({ mes: g.mes, valor: g.valor, saidaId: g.saidaId, saidaStatus: g.saidaStatus, desfeita: SAIDA_DESFEITA.includes(g.saidaStatus),
      semRelatorio: !SAIDA_DESFEITA.includes(g.saidaStatus) && !sit.periodos.some((p) => p.entregue && p.inicio <= g.mes && g.mes <= p.fim) })),
    periodos: sit.periodos, suspenso: sit.suspenso && e.status === "ATIVO",
    relatorios: rel.recordset.map((l) => ({
      relatorioId: l.RelatorioId, periodoInicio: mes7(l.PeriodoInicio), batismos: Number(l.Batismos), conversoes: Number(l.Conversoes), discipulado: Number(l.Discipulado),
      atividades: l.Atividades, pedidos: l.Pedidos, anexoUrl: verArquivos && l.AnexoUrl ? storage.urlDocumentoComSas(l.AnexoUrl) : null, temAnexo: !!l.AnexoUrl,
      recebidoEm: l.RecebidoEm, registradoPorNome: l.RegistradoPorNome, retificadoEm: l.RetificadoEm
    })),
    ultimoGerado: ultimoGerado(din.geracoes),
    acoes: acoesDoEnvio(e, alcance, membroId, sit.periodos.length > 0)
  };
}

// ---- o pedido ----
async function criarEnvio(pool, { dados, por, hoje = hojeBrasilia(), alcance, deps = {} }) {
  if (!gere(alcance)) return PROIBIDO(SO_GESTAO);
  const v = mi.validarEnvio(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const d = v.dados;
  const rq0 = () => pool.request();
  const campo = await lerCampo(rq0, d.campoId);
  if (!campo || campo.status !== "ATIVO") return { sucesso: false, mensagem: "Escolha um campo ativo." };
  const problema = await problemaDoMissionario(pool, rq0, d.membroId);
  if (problema) return { sucesso: false, mensagem: problema };
  const dinheiro = await problemaDoDinheiro(rq0, d, { membroId: d.membroId, campo });
  if (dinheiro.problema) return { sucesso: false, mensagem: dinheiro.problema };
  const recebedorPJ = !!dinheiro.recebedor && dinheiro.recebedor.tipo === "PJ";
  const doc = await salvarArquivo(d.documento);
  if (doc.erro) return { sucesso: false, mensagem: `Documento do envio: ${doc.erro}` };
  let envioId, status, etapas, fundamento;
  try {
    const r = await emTransacao(pool, async (t, rq) => {
      if (!(await enfileirar(rq, "envio"))) return OCUPADO;
      await rq().input("m", sql.Int, d.membroId).query(`SELECT MembroId FROM MembroReferencia WITH (UPDLOCK, ROWLOCK) WHERE MembroId = @m`);
      const c = await lerCampo(rq, d.campoId, { travar: true });
      if (!c || c.status !== "ATIVO") return { sucesso: false, mensagem: "Escolha um campo ativo." };
      // as etapas e a mantenedora pelo campo lido AQUI, sob a trava (revisão de 05/11/2026: com o campo lido antes, uma mudança do lugar no meio passava o envio pelas etapas erradas)
      if (d.fonte === "CONGREGACAO" && (!c.mantenedora || Number(c.mantenedora.congregacaoId) !== Number(d.congregacaoFonteId))) return MUDOU;
      etapas = mi.etapasDoEnvio({ abrangencia: c.abrangencia, sustento: d.sustento, recebedorPJ });
      status = mi.statusInicial(etapas);
      fundamento = mi.fundamentoPresidente({ abrangencia: c.abrangencia, sustento: d.sustento, recebedorPJ });
      const vivo = (await rq().input("m", sql.Int, d.membroId).query(`SELECT TOP 1 EnvioId FROM EnviosMissionarios WHERE MembroId = @m AND Status IN (N'EM_PARECER', N'AGUARDANDO_CLI', N'AGUARDANDO_PRESIDENTE', N'ATIVO')`)).recordset[0];
      if (vivo) return { sucesso: false, mensagem: "Esse missionário já tem um envio em andamento ou ativo: encerre (ou desista d)ele antes." };
      const ins = await rq().input("campo", sql.Int, d.campoId).input("m", sql.Int, d.membroId).input("st", sql.NVarChar(25), status)
        .input("cme", sql.Bit, etapas.cme).input("cli", sql.Bit, etapas.cli).input("pres", sql.Bit, etapas.presidente)
        .input("sus", sql.Decimal(10, 2), d.sustento).input("fonte", sql.NVarChar(12), d.fonte).input("cf", sql.Int, d.congregacaoFonteId).input("forn", sql.Int, d.fornecedorId)
        .input("doc", sql.NVarChar(500), doc.url).input("per", sql.NVarChar(12), d.periodicidade).input("div", sql.Bit, d.divulgarNome)
        .input("just", sql.NVarChar(2000), d.justificativa).input("por", sql.Int, por).input("h", sql.Date, hoje)
        .query(`INSERT INTO EnviosMissionarios (CampoId, MembroId, Status, PrecisaCME, PrecisaCLI, PrecisaPresidente, SustentoMensal, Fonte, CongregacaoFonteId, FornecedorId,
                                                DocumentoUrl, Periodicidade, DivulgarNome, Justificativa, SolicitadoPor, SolicitadoEm)
                OUTPUT inserted.EnvioId VALUES (@campo, @m, CASE WHEN @st = N'ATIVO' THEN N'AGUARDANDO_PRESIDENTE' ELSE @st END, @cme, @cli, @pres, @sus, @fonte, @cf, @forn,
                                                @doc, @per, @div, @just, @por, @h)`);
      const id = ins.recordset[0].EnvioId;
      // Campo Local sem sustento: a SEMIADESPA tem autonomia (Art. 44 §1º): o envio já nasce ativo
      if (status === "ATIVO") {
        const env = await lerEnvio(rq, id, hoje, { travar: true });
        const at = await ativar(t, rq, env, { pool, por, hoje, deStatus: "AGUARDANDO_PRESIDENTE" });
        if (at.sucesso === false) return at;
      }
      await registrarAuditoriaNaTransacao(t, { tabela: "EnviosMissionarios", registroId: id, acao: "MISSOES_ENVIO_PEDIDO", usuarioId: por,
        dadosDepois: { ...d, documento: !!doc.url, etapas, status } });
      return { sucesso: true, id };
    });
    if (!r.sucesso) return r;
    envioId = r.id;
  } catch (e) {
    if (violouUnicidade(e)) return { sucesso: false, mensagem: "Esse missionário já tem um envio em andamento ou ativo: encerre (ou desista d)ele antes." };
    throw e;
  }
  const quem = await nomeDoMembro(pool, d.membroId);
  if (status === "EM_PARECER") await avisar(pool, "MISSOES_ENVIO_NOVO", (await composicaoCME(pool)).filter((x) => Number(x.membroId) !== Number(por)), mi.textoEnvioNovo({ missionario: quem, campo: campo.nome }), envioId, deps);
  if (status === "AGUARDANDO_PRESIDENTE") await avisar(pool, "MISSOES_AGUARDANDO_PRESIDENTE", await presidentes(pool), mi.textoAguardandoPresidente({ missionario: quem, campo: campo.nome, fundamento }), envioId, deps);
  const mensagem = {
    EM_PARECER: "Pedido registrado. Agora a CME tem 15 dias para o parecer; depois decide a CLI.",
    AGUARDANDO_CLI: "Pedido registrado. Agora aguarda a decisão da CLI.",
    AGUARDANDO_PRESIDENTE: `Pedido registrado. Agora aguarda a concordância do Pastor Presidente (${fundamento}).`,
    ATIVO: "Envio registrado e ativo: frente local sem sustento é da autonomia da SEMIADESPA (Regimento, Art. 44 §1º)."
  }[status];
  return { sucesso: true, envioId, status, mensagem };
}

// A ativação (a última etapa): confere de novo o missionário e o campo, grava o mês de início e o sustento vigente desde ele.
async function ativar(t, rq, e, { pool, por, hoje, deStatus }) {
  const problema = await problemaDoMissionarioNaTransacao(rq, e.missionario.membroId)
    || ((await membrosSobDisciplina(pool)).has(Number(e.missionario.membroId)) ? "O missionário precisa ser membro ativo e em comunhão, sem processo disciplinar em curso." : null);
  if (problema) return { sucesso: false, mensagem: `${problema} O envio não pode ser ativado: registre a desistência.` };
  if (e.campo.status !== "ATIVO") return { sucesso: false, mensagem: "O campo foi encerrado: o envio não pode ser ativado. Registre a desistência." };
  const inicio = mi.mesDe(hoje);
  const u = await rq().input("id", sql.Int, e.envioId).input("st", sql.NVarChar(25), deStatus).input("h", sql.Date, hoje).input("ini", sql.Char(7), inicio)
    .query(`UPDATE EnviosMissionarios SET Status = N'ATIVO', AtivadoEm = @h, InicioMes = @ini WHERE EnvioId = @id AND Status = @st`);
  if (!u.rowsAffected[0]) return MUDOU;
  await rq().input("id", sql.Int, e.envioId).input("ini", sql.Char(7), inicio).input("v", sql.Decimal(10, 2), e.sustentoProposto).input("fonte", sql.NVarChar(12), e.fonte)
    .input("cf", sql.Int, e.congregacaoFonte ? e.congregacaoFonte.congregacaoId : null).input("forn", sql.Int, e.recebedor ? e.recebedor.fornecedorId : null).input("por", sql.Int, por)
    .query(`INSERT INTO EnvioSustentoValores (EnvioId, DesdeMes, Valor, Fonte, CongregacaoFonteId, FornecedorId, Motivo, RegistradoPor)
            VALUES (@id, @ini, @v, @fonte, @cf, @forn, N'Ativação do envio', @por)`);
  await registrarAuditoriaNaTransacao(t, { tabela: "EnviosMissionarios", registroId: e.envioId, acao: "MISSOES_ENVIO_ATIVADO", usuarioId: por,
    dadosDepois: { inicioMes: inicio, sustento: e.sustentoProposto } });
  return { sucesso: true, inicioMes: inicio };
}
// A mesma conferência do missionário, mas pela transação (a lista dos que estão sob disciplina é lida fora dela: só leitura).
async function problemaDoMissionarioNaTransacao(rq, membroId) {
  const m = (await rq().input("m", sql.Int, membroId).query(`SELECT MembroId, Status, SituacaoMembro FROM MembroReferencia WITH (UPDLOCK, ROWLOCK) WHERE MembroId = @m`)).recordset[0];
  if (!m) return "Matrícula do missionário não encontrada.";
  if (m.Status !== "ATIVO" || m.SituacaoMembro === "SEM_COMUNHAO") return "O missionário precisa ser membro ativo e em comunhão, sem processo disciplinar em curso.";
  return null;
}

async function emitirParecer(pool, { envioId, dados, por, hoje = hojeBrasilia(), alcance }) {
  if (!alcance.cme) return PROIBIDO("Só quem compõe a CME (o Secretário de Missões e os Pastores de Área) emite o parecer (Regimento, Art. 23, II).");
  const v = mi.validarParecer(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  return emTransacao(pool, async (t, rq) => {
    const e = await lerEnvio(rq, envioId, hoje, { travar: true });
    if (!e) return NAO_EXISTE;
    if (e.status !== "EM_PARECER") return { sucesso: false, mensagem: "Este envio não está aguardando o parecer da CME." };
    if (Number(e.solicitadoPor) === Number(por)) return { sucesso: false, mensagem: "Quem fez o pedido não emite o parecer sobre ele." };
    const u = await rq().input("id", sql.Int, envioId).input("par", sql.NVarChar(10), v.dados.parecer).input("f", sql.NVarChar(2000), v.dados.fundamentacao)
      .input("por", sql.Int, por).input("h", sql.Date, hoje)
      .query(`UPDATE EnviosMissionarios SET Status = N'AGUARDANDO_CLI', ParecerCME = @par, ParecerFundamentacao = @f, ParecerPor = @por, ParecerEm = @h
              WHERE EnvioId = @id AND Status = N'EM_PARECER'`);
    if (!u.rowsAffected[0]) return MUDOU;
    await registrarAuditoriaNaTransacao(t, { tabela: "EnviosMissionarios", registroId: envioId, acao: "MISSOES_PARECER_CME", usuarioId: por, dadosDepois: v.dados });
    return { sucesso: true, mensagem: "Parecer da CME registrado. O envio segue para a CLI." };
  });
}

async function desistir(pool, { envioId, dados, por, hoje = hojeBrasilia(), alcance }) {
  if (!veMissoes(alcance)) return NAO_EXISTE;
  const v = mi.validarMotivo(dados, "O motivo da desistência");
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  return emTransacao(pool, async (t, rq) => {
    const e = await lerEnvio(rq, envioId, hoje, { travar: true });
    if (!e) return NAO_EXISTE;
    if (!alcance.geral && Number(e.solicitadoPor) !== Number(por)) return PROIBIDO("Só quem fez o pedido (ou o nível geral) desiste dele.");
    if (!mi.EM_ANDAMENTO.includes(e.status)) return { sucesso: false, mensagem: "Este envio já foi decidido, ativado ou retirado." };
    const u = await rq().input("id", sql.Int, envioId).input("st", sql.NVarChar(25), e.status).input("h", sql.Date, hoje).input("por", sql.Int, por)
      .input("m", sql.NVarChar(1000), v.dados.motivo)
      .query(`UPDATE EnviosMissionarios SET Status = N'DESISTIDO', DesistidoEm = @h, DesistidoPor = @por, DesistenciaMotivo = @m WHERE EnvioId = @id AND Status = @st`);
    if (!u.rowsAffected[0]) return MUDOU;
    await registrarAuditoriaNaTransacao(t, { tabela: "EnviosMissionarios", registroId: envioId, acao: "MISSOES_ENVIO_DESISTENCIA", usuarioId: por, dadosDepois: v.dados });
    return { sucesso: true, mensagem: "Desistência registrada." };
  });
}

// ---- a decisão da CLI ----
async function decidir(pool, { envioId, dados, por, hoje = hojeBrasilia(), alcance, deps = {} }) {
  if (!alcance.geral) return PROIBIDO("A decisão da CLI é registrada pelo nível geral.");
  const v = mi.validarDecisao(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const reuniao = await lerReuniao(pool, v.dados.sessaoId, "CLI", hoje);
  if (!reuniao) return { sucesso: false, mensagem: "Escolha uma reunião da CLI já realizada e encerrada." };
  const r = await emTransacao(pool, async (t, rq) => {
    if (!(await enfileirar(rq, "envio"))) return OCUPADO;
    await travarMissionarioDoEnvio(rq, envioId);
    const e = await lerEnvio(rq, envioId, hoje, { travar: true });
    if (!e) return NAO_EXISTE;
    const pode = mi.podeDecidirCLI(e, { reuniao, urgencia: v.dados.urgencia });
    if (!pode.pode) return { sucesso: false, mensagem: pode.mensagem };
    const aprovado = v.dados.resultado === "APROVADO";
    const novo = aprovado ? mi.statusDepoisDaCLI(e.etapas) : "REJEITADO";
    // grava a decisão primeiro (o envio passa a AGUARDANDO_PRESIDENTE ou REJEITADO); sem o Presidente na cadeia, a ativação vem logo depois, na mesma transação
    const u = await rq().input("id", sql.Int, envioId).input("st", sql.NVarChar(25), e.status).input("novo", sql.NVarChar(25), novo === "ATIVO" ? "AGUARDANDO_PRESIDENTE" : novo)
      .input("s", sql.Int, reuniao.sessaoId).input("em", sql.Date, reuniao.data).input("res", sql.NVarChar(10), v.dados.resultado).input("urg", sql.Bit, v.dados.urgencia)
      .input("mot", sql.NVarChar(1000), v.dados.motivo).input("por", sql.Int, por)
      .query(`UPDATE EnviosMissionarios SET Status = @novo, DecisaoSessaoId = @s, DecisaoEm = @em, DecisaoResultado = @res, DecisaoUrgencia = @urg, DecisaoMotivo = @mot,
                     DecisaoRegistradaPor = @por, DecisaoRegistradaEm = SYSUTCDATETIME() WHERE EnvioId = @id AND Status = @st`);
    if (!u.rowsAffected[0]) return MUDOU;
    if (novo === "ATIVO") {
      const at = await ativar(t, rq, await lerEnvio(rq, envioId, hoje, { travar: true }), { pool, por, hoje, deStatus: "AGUARDANDO_PRESIDENTE" });
      if (at.sucesso === false) return at;
    }
    await registrarAuditoriaNaTransacao(t, { tabela: "EnviosMissionarios", registroId: envioId, acao: aprovado ? "MISSOES_CLI_APROVOU" : "MISSOES_CLI_RECUSOU", usuarioId: por,
      dadosAntes: { status: e.status }, dadosDepois: { ...v.dados, reuniao: reuniao.data, status: novo } });
    return { sucesso: true, envio: e, novo };
  });
  if (!r.sucesso) return r;
  const quem = r.envio.missionario.nome, campo = r.envio.campo.nome;
  if (r.novo === "AGUARDANDO_PRESIDENTE") {
    const fundamento = mi.fundamentoPresidente({ abrangencia: r.envio.campo.abrangencia, sustento: r.envio.sustentoProposto, recebedorPJ: !!r.envio.recebedor && r.envio.recebedor.tipo === "PJ" });
    await avisar(pool, "MISSOES_AGUARDANDO_PRESIDENTE", await presidentes(pool), mi.textoAguardandoPresidente({ missionario: quem, campo, fundamento }), envioId, deps);
  }
  if (r.novo !== "AGUARDANDO_PRESIDENTE") {
    await avisar(pool, "MISSOES_ENVIO_DECIDIDO", await pessoas(pool, [r.envio.solicitadoPor]), mi.textoDecidido({ missionario: quem, campo, ativo: r.novo === "ATIVO", recusadoPor: "CLI", motivo: v.dados.motivo }), envioId, deps);
  }
  const mensagem = r.novo === "REJEITADO" ? "Recusa da CLI registrada." : r.novo === "ATIVO" ? "Aprovado pela CLI: o envio está ativo." : "Aprovado pela CLI. Agora aguarda a concordância do Pastor Presidente.";
  return { sucesso: true, status: r.novo, mensagem };
}

// ---- o Pastor Presidente (Art. 44 §2º; Art. 134 §6º, I) ----
async function decidirPresidente(pool, { envioId, dados, por, hoje = hojeBrasilia(), alcance, deps = {} }) {
  if (!alcance.presidente) return PROIBIDO(SO_PRESIDENTE);
  const v = mi.validarPresidente(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const r = await emTransacao(pool, async (t, rq) => {
    if (!(await enfileirar(rq, "envio"))) return OCUPADO;
    await travarMissionarioDoEnvio(rq, envioId);
    const e = await lerEnvio(rq, envioId, hoje, { travar: true });
    if (!e) return NAO_EXISTE;
    if (e.status !== "AGUARDANDO_PRESIDENTE") return { sucesso: false, mensagem: "Este envio não está aguardando o Pastor Presidente." };
    if (Number(e.solicitadoPor) === Number(por)) return { sucesso: false, mensagem: "Quem fez o pedido não concorda com ele: o pedido feito pelo Pastor Presidente precisa de outro pedido, da SEMIADESPA (quem pede não autoriza o próprio pedido)." };
    const concorda = v.dados.resultado === "CONCORDA";
    const u = await rq().input("id", sql.Int, envioId).input("res", sql.NVarChar(10), v.dados.resultado).input("mot", sql.NVarChar(1000), v.dados.motivo)
      .input("por", sql.Int, por).input("h", sql.Date, hoje).input("novo", sql.NVarChar(25), concorda ? "AGUARDANDO_PRESIDENTE" : "REJEITADO")
      .query(`UPDATE EnviosMissionarios SET PresidenteResultado = @res, PresidenteMotivo = @mot, PresidentePor = @por, PresidenteEm = @h, Status = @novo
              WHERE EnvioId = @id AND Status = N'AGUARDANDO_PRESIDENTE' AND PresidenteResultado IS NULL`);
    if (!u.rowsAffected[0]) return MUDOU;
    if (concorda) {
      const at = await ativar(t, rq, e, { pool, por, hoje, deStatus: "AGUARDANDO_PRESIDENTE" });
      if (at.sucesso === false) return at;
    }
    await registrarAuditoriaNaTransacao(t, { tabela: "EnviosMissionarios", registroId: envioId, acao: concorda ? "MISSOES_PRESIDENTE_CONCORDOU" : "MISSOES_PRESIDENTE_RECUSOU",
      usuarioId: por, dadosDepois: v.dados });
    return { sucesso: true, envio: e, concorda };
  });
  if (!r.sucesso) return r;
  await avisar(pool, "MISSOES_ENVIO_DECIDIDO", await pessoas(pool, [r.envio.solicitadoPor]),
    mi.textoDecidido({ missionario: r.envio.missionario.nome, campo: r.envio.campo.nome, ativo: r.concorda, recusadoPor: "PRESIDENTE", motivo: v.dados.motivo }), envioId, deps);
  return { sucesso: true, status: r.concorda ? "ATIVO" : "REJEITADO", mensagem: r.concorda ? "Concordância registrada: o envio está ativo." : "Recusa registrada." };
}

// ---- o encerramento do envio ativo (retorno, troca de campo) ----
async function encerrarEnvio(pool, { envioId, dados, por, hoje = hojeBrasilia(), alcance }) {
  if (!gere(alcance)) return PROIBIDO(SO_GESTAO);
  return emTransacao(pool, async (t, rq) => {
    if (!(await obterTrava(rq, TRAVA_SUSTENTO))) return OCUPADO;
    const e = await lerEnvio(rq, envioId, hoje, { travar: true });
    if (!e) return NAO_EXISTE;
    if (e.status !== "ATIVO") return { sucesso: false, mensagem: "Este envio não está ativo." };
    const din = (await carregarDinheiro(rq, [envioId]))(envioId);
    const v = mi.validarEncerramentoEnvio(dados, { inicioMes: e.inicioMes, ultimoGerado: ultimoGerado(din.geracoes), hoje });
    if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
    const u = await rq().input("id", sql.Int, envioId).input("h", sql.Date, hoje).input("fim", sql.Char(7), v.dados.ultimoMes).input("por", sql.Int, por)
      .input("m", sql.NVarChar(1000), v.dados.motivo)
      .query(`UPDATE EnviosMissionarios SET Status = N'ENCERRADO', EncerradoEm = @h, FimMes = @fim, EncerradoPor = @por, MotivoEncerramento = @m WHERE EnvioId = @id AND Status = N'ATIVO'`);
    if (!u.rowsAffected[0]) return MUDOU;
    await registrarAuditoriaNaTransacao(t, { tabela: "EnviosMissionarios", registroId: envioId, acao: "MISSOES_ENVIO_ENCERRADO", usuarioId: por, dadosDepois: v.dados });
    return { sucesso: true, mensagem: `Envio encerrado. O último mês de sustento é ${mi.mesBr(v.dados.ultimoMes)}.` };
  });
}

// ---- o reajuste (Pastor Presidente) ----
async function reajustar(pool, { envioId, dados, por, hoje = hojeBrasilia(), alcance }) {
  if (!alcance.presidente) return PROIBIDO(SO_PRESIDENTE);
  // a validação de forma primeiro (sem banco); o mês é conferido de novo dentro da trava
  const pre = mi.validarReajuste(dados, { inicioMes: null, ultimoGerado: null, hoje });
  if (!pre.valido) return { sucesso: false, mensagem: pre.mensagem };
  const e0 = await lerEnvio(() => pool.request(), envioId, hoje);
  if (!e0) return NAO_EXISTE;
  const campo0 = await lerCampo(() => pool.request(), e0.campo.campoId);
  const dinheiro = await problemaDoDinheiro(() => pool.request(), pre.dados, { membroId: e0.missionario.membroId, campo: campo0 });
  if (dinheiro.problema) return { sucesso: false, mensagem: dinheiro.problema };
  // o convênio externo (quem recebe é pessoa jurídica) é da CLI com o Presidente (Art. 44 §2º): num envio que não passou pela CLI, ele não entra por reajuste
  if (dinheiro.recebedor && dinheiro.recebedor.tipo === "PJ" && !e0.etapas.cli) {
    return { sucesso: false, mensagem: "Pagar a uma pessoa jurídica é convênio externo, que passa pela CME e pela CLI (Regimento, Art. 44 §2º): este envio não passou por elas. Encerre-o e faça um novo pedido." };
  }
  const doc = await salvarArquivo(pre.dados.documento);
  if (doc.erro) return { sucesso: false, mensagem: `Documento: ${doc.erro}` };
  return emTransacao(pool, async (t, rq) => {
    if (!(await obterTrava(rq, TRAVA_SUSTENTO))) return OCUPADO;
    const e = await lerEnvio(rq, envioId, hoje, { travar: true });
    if (!e) return NAO_EXISTE;
    if (e.status !== "ATIVO") return { sucesso: false, mensagem: "Só o envio ativo tem o sustento reajustado." };
    const din = (await carregarDinheiro(rq, [envioId]))(envioId);
    const v = mi.validarReajuste(dados, { inicioMes: e.inicioMes, ultimoGerado: ultimoGerado(din.geracoes), hoje });
    if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
    const d = v.dados;
    d.congregacaoFonteId = pre.dados.congregacaoFonteId;   // a mantenedora do campo, conferida acima
    if (d.sustento > 0 && !e.documentoUrlInterno && !doc.url) return { sucesso: false, mensagem: "O envio não tem o documento (o termo de compromisso): anexe-o com o reajuste, porque ele acompanha cada pagamento." };
    const existente = din.valores.find((x) => x.desdeMes === d.desdeMes);
    const comum = (q) => q.input("id", sql.Int, envioId).input("desde", sql.Char(7), d.desdeMes).input("v", sql.Decimal(10, 2), d.sustento).input("fonte", sql.NVarChar(12), d.fonte)
      .input("cf", sql.Int, d.congregacaoFonteId).input("forn", sql.Int, d.fornecedorId).input("mot", sql.NVarChar(1000), d.motivo).input("por", sql.Int, por);
    if (existente) {
      await comum(rq()).query(`UPDATE EnvioSustentoValores SET Valor = @v, Fonte = @fonte, CongregacaoFonteId = @cf, FornecedorId = @forn, Motivo = @mot, RegistradoPor = @por, RegistradoEm = SYSUTCDATETIME()
                               WHERE EnvioId = @id AND DesdeMes = @desde`);
    } else {
      await comum(rq()).query(`INSERT INTO EnvioSustentoValores (EnvioId, DesdeMes, Valor, Fonte, CongregacaoFonteId, FornecedorId, Motivo, RegistradoPor)
                               VALUES (@id, @desde, @v, @fonte, @cf, @forn, @mot, @por)`);
    }
    if (doc.url) await rq().input("id", sql.Int, envioId).input("doc", sql.NVarChar(500), doc.url).query(`UPDATE EnviosMissionarios SET DocumentoUrl = @doc WHERE EnvioId = @id`);
    await registrarAuditoriaNaTransacao(t, { tabela: "EnviosMissionarios", registroId: envioId, acao: "MISSOES_SUSTENTO_REAJUSTADO", usuarioId: por,
      dadosAntes: existente ? { desdeMes: existente.desdeMes, valor: existente.valor } : { vigente: vigenteNoMes(din.valores, d.desdeMes) ? vigenteNoMes(din.valores, d.desdeMes).valor : 0 },
      dadosDepois: { ...d, documento: !!doc.url } });
    return { sucesso: true, mensagem: `Sustento reajustado: ${reais(d.sustento)} por mês a partir de ${mi.mesBr(d.desdeMes)}.` };
  });
}

// ================================================================ relatórios de campo ================================================================
async function registrarRelatorio(pool, { envioId, dados, por, hoje = hojeBrasilia(), alcance }) {
  if (!gere(alcance)) return PROIBIDO(SO_GESTAO);
  const e0 = await lerEnvio(() => pool.request(), envioId, hoje);
  if (!e0) return NAO_EXISTE;
  if (!["ATIVO", "ENCERRADO"].includes(e0.status)) return { sucesso: false, mensagem: "O relatório de campo é do envio ativo (ou já encerrado)." };
  const v = mi.validarRelatorio(dados, e0, hoje);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const anexo = await salvarArquivo(v.dados.anexo);
  if (anexo.erro) return { sucesso: false, mensagem: `Anexo: ${anexo.erro}` };
  try {
    return await emTransacao(pool, async (t, rq) => {
      const e = await lerEnvio(rq, envioId, hoje, { travar: true });
      if (!e || !["ATIVO", "ENCERRADO"].includes(e.status)) return MUDOU;
      const v2 = mi.validarRelatorio(dados, e, hoje);
      if (!v2.valido) return { sucesso: false, mensagem: v2.mensagem };
      const d = v2.dados;
      const r = await rq().input("id", sql.Int, envioId).input("p", sql.Char(7), d.periodoInicio).input("b", sql.Int, d.batismos).input("c", sql.Int, d.conversoes)
        .input("di", sql.Int, d.discipulado).input("at", sql.NVarChar(4000), d.atividades).input("pe", sql.NVarChar(2000), d.pedidos).input("an", sql.NVarChar(500), anexo.url)
        .input("h", sql.Date, hoje).input("por", sql.Int, por)
        .query(`INSERT INTO RelatoriosCampo (EnvioId, PeriodoInicio, Batismos, Conversoes, Discipulado, Atividades, Pedidos, AnexoUrl, RecebidoEm, RegistradoPor)
                OUTPUT inserted.RelatorioId VALUES (@id, @p, @b, @c, @di, @at, @pe, @an, @h, @por)`);
      await registrarAuditoriaNaTransacao(t, { tabela: "RelatoriosCampo", registroId: r.recordset[0].RelatorioId, acao: "MISSOES_RELATORIO", usuarioId: por,
        dadosDepois: { envioId, periodoInicio: d.periodoInicio, batismos: d.batismos, conversoes: d.conversoes, discipulado: d.discipulado, anexo: !!anexo.url } });
      return { sucesso: true, relatorioId: r.recordset[0].RelatorioId, mensagem: "Relatório de campo registrado." };
    });
  } catch (e) {
    if (violouUnicidade(e)) return { sucesso: false, mensagem: "Esse período já tem relatório: use a correção." };
    throw e;
  }
}

async function retificarRelatorio(pool, { relatorioId, dados, por, hoje = hojeBrasilia(), alcance }) {
  if (!gere(alcance)) return PROIBIDO(SO_GESTAO);
  const atual0 = (await pool.request().input("id", sql.Int, relatorioId).query(`SELECT EnvioId, PeriodoInicio FROM RelatoriosCampo WHERE RelatorioId = @id`)).recordset[0];
  if (!atual0) return NAO_EXISTE;
  const e0 = await lerEnvio(() => pool.request(), atual0.EnvioId, hoje);
  // o período não muda na correção: o servidor usa o do relatório gravado
  const v = mi.validarRelatorio({ ...(dados && typeof dados === "object" ? dados : {}), periodoInicio: mes7(atual0.PeriodoInicio) }, e0, hoje);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const anexo = await salvarArquivo(v.dados.anexo);
  if (anexo.erro) return { sucesso: false, mensagem: `Anexo: ${anexo.erro}` };
  return emTransacao(pool, async (t, rq) => {
    const antes = (await rq().input("id", sql.Int, relatorioId).query(`SELECT * FROM RelatoriosCampo WITH (UPDLOCK, ROWLOCK) WHERE RelatorioId = @id`)).recordset[0];
    if (!antes) return NAO_EXISTE;
    const d = v.dados;
    await rq().input("id", sql.Int, relatorioId).input("b", sql.Int, d.batismos).input("c", sql.Int, d.conversoes).input("di", sql.Int, d.discipulado)
      .input("at", sql.NVarChar(4000), d.atividades).input("pe", sql.NVarChar(2000), d.pedidos).input("an", sql.NVarChar(500), anexo.url).input("por", sql.Int, por)
      .query(`UPDATE RelatoriosCampo SET Batismos = @b, Conversoes = @c, Discipulado = @di, Atividades = @at, Pedidos = @pe, AnexoUrl = ISNULL(@an, AnexoUrl),
                     RetificadoPor = @por, RetificadoEm = SYSUTCDATETIME() WHERE RelatorioId = @id`);
    await registrarAuditoriaNaTransacao(t, { tabela: "RelatoriosCampo", registroId: relatorioId, acao: "MISSOES_RELATORIO_CORRIGIDO", usuarioId: por,
      dadosAntes: { batismos: antes.Batismos, conversoes: antes.Conversoes, discipulado: antes.Discipulado, atividades: antes.Atividades, pedidos: antes.Pedidos },
      dadosDepois: { batismos: d.batismos, conversoes: d.conversoes, discipulado: d.discipulado, atividades: d.atividades, pedidos: d.pedidos, anexoNovo: !!anexo.url } });
    return { sucesso: true, mensagem: "Relatório corrigido (a versão anterior fica na auditoria)." };
  });
}

// ================================================================ sustento do mês (Tesouraria Geral) ================================================================
async function enviosComSustento(rq, hoje) {
  const r = await rq().query(`SELECT ${COLUNAS_ENVIO} ${JUNCOES_ENVIO(false)} WHERE e.Status IN (N'ATIVO', N'ENCERRADO') ORDER BY m.Nome`);
  return r.recordset.map((l) => formaEnvio(l, hoje));
}
async function previaSustento(pool, { mes, hoje = hojeBrasilia(), alcance }) {
  // a prévia do pagamento: quem gere, o Presidente e a Tesouraria Geral (não a CME, que só dá o parecer)
  if (!(veMissoes(alcance) && !soCME(alcance)) && !alcance.tesouraria) return { sucesso: false, proibido: true, mensagem: "A prévia do sustento é da SEMIADESPA, do Pastor Presidente, do nível geral e da Tesouraria Geral." };
  const v = mi.validarGeracao({ mesReferencia: mes }, hoje);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const envios = await enviosComSustento(() => pool.request(), hoje);
  const din = await carregarDinheiro(() => pool.request());
  const sob = await membrosSobDisciplina(pool);
  const linhas = [];
  for (const e of envios) {
    const a = avaliarMes(e, din(e.envioId), v.dados.mesReferencia, hoje, sob);
    if (!a) continue;
    const { _v, ...resto } = a;
    linhas.push({ envioId: e.envioId, missionario: e.missionario.nome, campo: e.campo.nome, ...resto });
  }
  const soma = (s) => linhas.filter((l) => l.situacao === s).reduce((t, l) => t + l.valor, 0);
  return { sucesso: true, mes: v.dados.mesReferencia, linhas, totais: { aGerar: soma("A_GERAR"), gerado: soma("GERADO"), suspenso: soma("SUSPENSO"), impedido: soma("IMPEDIDO") },
    podeGerar: !!alcance.tesouraria };
}

// Gera, numa transação e sob a trava, a Saída já aprovada de cada envio "a gerar" do mês; os suspensos e impedidos ficam de fora com o motivo.
async function gerarSustento(pool, { dados, por, hoje = hojeBrasilia(), alcance }) {
  if (!alcance.tesouraria) return PROIBIDO("O sustento do mês é gerado pela Tesouraria Geral (a permissão \"financeiro\" do nível geral).");
  const v = mi.validarGeracao(dados, hoje);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const mes = v.dados.mesReferencia;
  const sob = await membrosSobDisciplina(pool);
  try {
    return await emTransacao(pool, async (t, rq) => {
      if (!(await obterTrava(rq, TRAVA_SUSTENTO))) return { sucesso: false, mensagem: "Já existe uma geração do sustento em andamento: aguarde e confira o resultado antes de tentar de novo." };
      const envios = await enviosComSustento(rq, hoje);
      const din = await carregarDinheiro(rq);
      const geradas = [], fora = [];
      for (const e of envios) {
        const a = avaliarMes(e, din(e.envioId), mes, hoje, sob);
        if (!a || a.situacao === "GERADO") continue;
        if (a.situacao !== "A_GERAR") { fora.push({ envioId: e.envioId, missionario: e.missionario.nome, situacao: a.situacao, motivo: a.motivo }); continue; }
        const val = a._v;
        // a geração do mês cuja Saída foi cancelada ou rejeitada sai da frente (a Saída desfeita fica no Contas a Pagar, com o motivo): o mês é gerado de novo
        if (a.saidaDesfeita) await rq().input("id", sql.Int, e.envioId).input("mes", sql.Char(7), mes).input("s", sql.Int, a.saidaDesfeita)
          .query(`DELETE FROM SustentoGeracoes WHERE EnvioId = @id AND MesReferencia = @mes AND SaidaId = @s`);
        const congregacaoId = val.fonte === "CONGREGACAO" ? val.congregacaoFonte.congregacaoId : e.missionario.congregacaoId;
        // campo de divulgação restrita: a descrição da Saída não diz o nome nem o campo (o Contas a Pagar é visto por mais gente; quem recebe já está no fornecedor)
        const descricao = e.campo.divulgacao === "RESTRITA" ? `Sustento missionário — ${mi.mesBr(mes)} — envio nº ${e.envioId} (campo de divulgação restrita)`
          : `Sustento missionário — ${mi.mesBr(mes)} — ${e.missionario.nome} (campo ${e.campo.nome})`;
        const saida = await rq().input("cong", sql.Int, congregacaoId).input("forn", sql.Int, val.recebedor.fornecedorId).input("tipo", sql.NVarChar(30), mi.CATEGORIA_SAIDA[val.fonte])
          .input("desc", sql.NVarChar(300), descricao.slice(0, 300))
          .input("valor", sql.Decimal(10, 2), val.valor).input("doc", sql.NVarChar(500), e.documentoUrlInterno).input("por", sql.Int, por)
          .query(`INSERT INTO SaidasTesouraria (CongregacaoId, FornecedorId, Tipo, Descricao, Valor, DocumentoFiscalUrl, SolicitadoPor, Status)
                  OUTPUT inserted.SaidaId VALUES (@cong, @forn, @tipo, @desc, @valor, @doc, @por, N'APROVADA')`);
        const saidaId = saida.recordset[0].SaidaId;
        await rq().input("id", sql.Int, e.envioId).input("mes", sql.Char(7), mes).input("valor", sql.Decimal(10, 2), val.valor).input("saida", sql.Int, saidaId).input("por", sql.Int, por)
          .query(`INSERT INTO SustentoGeracoes (EnvioId, MesReferencia, Valor, SaidaId, GeradaPor) VALUES (@id, @mes, @valor, @saida, @por)`);
        geradas.push({ envioId: e.envioId, missionario: e.missionario.nome, valor: val.valor, saidaId, refeita: !!a.saidaDesfeita });
      }
      if (!geradas.length) {
        return { sucesso: false, mensagem: fora.length ? `Nenhum sustento gerado em ${mi.mesBr(mes)}: ${fora.length} envio(s) suspenso(s) ou impedido(s) — veja o motivo de cada um.` : `Nada a gerar em ${mi.mesBr(mes)}.`, fora };
      }
      await registrarAuditoriaNaTransacao(t, { tabela: "SustentoGeracoes", registroId: geradas[0].saidaId, acao: "MISSOES_SUSTENTO_GERADO", usuarioId: por,
        dadosDepois: { mes, geradas: geradas.map((g) => ({ envioId: g.envioId, valor: g.valor, saidaId: g.saidaId })), fora: fora.map((f) => ({ envioId: f.envioId, situacao: f.situacao })) } });
      const total = geradas.reduce((s, g) => s + g.valor, 0);
      return { sucesso: true, mes, geradas, fora,
        mensagem: `Sustento de ${mi.mesBr(mes)} gerado: ${geradas.length} pagamento(s), ${reais(total)}, já aprovados no Contas a Pagar.${fora.length ? ` ${fora.length} ficou(aram) de fora (suspenso ou impedido).` : ""}` };
    });
  } catch (e) {
    // a restrição única (envio + mês): uma geração simultânea que furasse a trava volta inteira, sem Saída solta
    if (violouUnicidade(e)) return { sucesso: false, mensagem: "O sustento deste mês já foi gerado para um dos envios (outra geração simultânea). Nada foi gravado: confira a prévia antes de tentar de novo." };
    throw e;
  }
}

// ================================================================ painel e mural ================================================================
async function painel(pool, { alcance, hoje = hojeBrasilia() }) {
  const completo = await painelCompleto(pool, { alcance, hoje });
  if (!soCME(alcance)) return completo;
  // a CME: os números gerais e os envios aguardando o parecer, nada de sustento nem de relatório por pessoa
  const t = completo.totais;
  return { hoje: completo.hoje, ano: completo.ano, mesAtual: completo.mesAtual, soCME: true,
    totais: { camposAtivos: t.camposAtivos, missionariosAtivos: t.missionariosAtivos, batismos: t.batismos, conversoes: t.conversoes, discipulado: t.discipulado },
    porAbrangencia: completo.porAbrangencia, parecerVencido: completo.parecerVencido, emParecer: completo.emParecer, semSecretario: completo.semSecretario };
}
async function painelCompleto(pool, { alcance, hoje }) {
  const envios = (await pool.request().query(`SELECT ${COLUNAS_ENVIO} ${JUNCOES_ENVIO(false)}`)).recordset.map((l) => formaEnvio(l, hoje));
  const campos = await listarCampos(pool, { alcance });
  const din = await carregarDinheiro(() => pool.request());
  const atual = mi.mesDe(hoje), ano = hoje.slice(0, 4);
  const andamento = envios.filter((e) => mi.EM_ANDAMENTO.includes(e.status));
  const item = (e, extra = {}) => ({ envioId: e.envioId, missionario: e.missionario.nome, campo: e.campo.nome, status: e.status, statusRotulo: e.statusRotulo, ...extra });
  const ativos = envios.filter((e) => e.status === "ATIVO");
  const atrasados = [], suspensos = [], semRelatorio = [];
  let emDia = 0;
  let comprometido = 0, pagoNoAno = 0, geradoNaoPago = 0, batismos = 0, conversoes = 0, discipulado = 0;
  for (const e of envios) {
    const d = din(e.envioId);
    for (const r of d.relatorios) if (r.periodoInicio.slice(0, 4) === ano) { batismos += r.batismos; conversoes += r.conversoes; discipulado += r.discipulado; }
    for (const g of d.geracoes) {
      if (g.saidaStatus === "PAGA" && g.mes.slice(0, 4) === ano) pagoNoAno += g.valor;
      if (["APROVADA", "PENDENTE"].includes(g.saidaStatus)) geradoNaoPago += g.valor;
    }
    if (!e.inicioMes) continue;
    if (e.status === "ATIVO") { const vig = vigenteNoMes(d.valores, atual); comprometido += vig ? vig.valor : 0; }
    const sit = mi.situacaoRelatorios(e, d.relatorios.map((r) => r.periodoInicio), hoje);
    if (e.status === "ATIVO" && !sit.vencidos.length) emDia++;
    if (sit.vencidos.length) atrasados.push(item(e, { periodos: sit.vencidos.map((p) => ({ inicio: p.inicio, fim: p.fim, prazo: p.prazo })) }));
    if (sit.suspenso && e.status === "ATIVO" && vigenteNoMes(d.valores, atual) && vigenteNoMes(d.valores, atual).valor > 0) suspensos.push(item(e));
    // o número que a Assembleia cobra: sustento PAGO de um mês cujo período não tem relatório recebido
    const pagosSem = geracoesValidas(d.geracoes).filter((g) => g.saidaStatus === "PAGA" && !sit.periodos.some((p) => p.entregue && p.inicio <= g.mes && g.mes <= p.fim));
    if (pagosSem.length) semRelatorio.push(item(e, { meses: pagosSem.map((g) => g.mes), valor: pagosSem.reduce((s, g) => s + g.valor, 0) }));
  }
  const porAbrangencia = Object.keys(mi.ABRANGENCIAS).map((k) => ({ codigo: k, rotulo: mi.ABRANGENCIAS[k], campos: campos.filter((c) => c.abrangencia === k).length }));
  return {
    hoje, ano, mesAtual: atual,
    totais: { camposAtivos: campos.length, missionariosAtivos: ativos.length, sustentoComprometido: comprometido, pagoNoAno, geradoNaoPago, batismos, conversoes, discipulado,
      relatoriosEmDia: emDia, mesesPagosSemRelatorio: semRelatorio.reduce((s, x) => s + x.meses.length, 0), valorPagoSemRelatorio: semRelatorio.reduce((s, x) => s + x.valor, 0) },
    porAbrangencia,
    parecerVencido: andamento.filter((e) => e.parecerVencido).map((e) => item(e, { prazo: e.prazoParecer })),
    emParecer: andamento.filter((e) => e.status === "EM_PARECER" && !e.parecerVencido).map((e) => item(e, { prazo: e.prazoParecer })),
    aguardandoCLI: andamento.filter((e) => e.status === "AGUARDANDO_CLI").map((e) => item(e)),
    aguardandoPresidente: andamento.filter((e) => e.status === "AGUARDANDO_PRESIDENTE").map((e) => item(e)),
    relatoriosAtrasados: atrasados, suspensos, pagosSemRelatorio: semRelatorio,
    semSecretario: !(await composicaoCME(pool)).some((m) => m.secretarioMissoes)
  };
}

// A versão mural (para imprimir e expor): só os campos públicos; o nome do missionário só com a autorização; nenhum valor por pessoa.
async function mural(pool, { hoje = hojeBrasilia() }) {
  const ano = hoje.slice(0, 4);
  const camposR = await pool.request().query(`SELECT CampoId, Nome, Pais, UF, Cidade, ZonaRuralAdjacente, Abrangencia, Divulgacao FROM CamposMissionarios WHERE Status = N'ATIVO' ORDER BY Nome`);
  const enviosR = await pool.request().query(`SELECT e.EnvioId, e.CampoId, e.DivulgarNome, m.Nome FROM EnviosMissionarios e JOIN MembroReferencia m ON m.MembroId = e.MembroId WHERE e.Status = N'ATIVO'`);
  const relR = await pool.request().input("a", sql.NVarChar(4), ano).query(`
    SELECT e.CampoId, SUM(r.Batismos) AS Batismos, SUM(r.Conversoes) AS Conversoes, SUM(r.Discipulado) AS Discipulado
    FROM RelatoriosCampo r JOIN EnviosMissionarios e ON e.EnvioId = r.EnvioId WHERE LEFT(r.PeriodoInicio, 4) = @a GROUP BY e.CampoId`);
  const invR = await pool.request().input("a", sql.NVarChar(4), ano).query(`
    SELECT ISNULL(SUM(g.Valor), 0) AS Total, COUNT(DISTINCT g.EnvioId) AS Envios FROM SustentoGeracoes g JOIN SaidasTesouraria s ON s.SaidaId = g.SaidaId
    WHERE s.Status = N'PAGA' AND LEFT(g.MesReferencia, 4) = @a`);
  const numeros = new Map(relR.recordset.map((l) => [l.CampoId, { batismos: Number(l.Batismos), conversoes: Number(l.Conversoes), discipulado: Number(l.Discipulado) }]));
  const publicos = [];
  let camposRestritos = 0, missionariosRestritos = 0;
  const totais = { batismos: 0, conversoes: 0, discipulado: 0 };
  for (const n of numeros.values()) { totais.batismos += n.batismos; totais.conversoes += n.conversoes; totais.discipulado += n.discipulado; }
  for (const c of camposR.recordset) {
    const doCampo = enviosR.recordset.filter((e) => e.CampoId === c.CampoId);
    if (c.Divulgacao !== "PUBLICA") { camposRestritos++; missionariosRestritos += doCampo.length; continue; }
    const nomes = doCampo.filter((e) => e.DivulgarNome).map((e) => e.Nome).sort((a, b) => a.localeCompare(b, "pt-BR"));
    publicos.push({ nome: c.Nome, lugar: lugarDe({ pais: c.Pais, uf: c.UF, cidade: c.Cidade, zonaRural: !!c.ZonaRuralAdjacente }), abrangenciaRotulo: mi.ABRANGENCIAS[c.Abrangencia],
      missionarios: nomes, outrosMissionarios: doCampo.length - nomes.length, ...(numeros.get(c.CampoId) || { batismos: 0, conversoes: 0, discipulado: 0 }) });
  }
  return { ano, campos: publicos, camposRestritos, missionariosRestritos, totais: { ...totais, campos: camposR.recordset.length, missionarios: enviosR.recordset.length,
    // com um só missionário pago no ano, o total seria o valor dele: o mural não mostra (revisão de 05/11/2026)
    investidoNoAno: Number(invR.recordset[0].Envios) >= 2 ? Number(invR.recordset[0].Total) : null } };
}

// ================================================================ catálogos ================================================================
async function catalogos(pool, { alcance }) {
  const lista = (o) => Object.entries(o).map(([codigo, rotulo]) => ({ codigo, rotulo }));
  const congs = await pool.request().query(`SELECT CongregacaoId, Nome FROM Congregacoes WHERE Ativa = 1 ORDER BY Nome`);
  // quem recebe: só para quem pede (a SEMIADESPA e o nível geral) e para o Presidente (reajuste) — o nome e o tipo, nunca os dados bancários nem o documento
  const forn = gere(alcance) || alcance.presidente
    // a pessoa física só aparece se estiver ligada a uma matrícula (é o próprio missionário que recebe); a jurídica é a agência ou igreja parceira
    ? (await pool.request().query(`SELECT FornecedorId, Nome, Tipo, DadosBancariosConfirmados, MembroId FROM Fornecedores WHERE Ativo = 1 AND (Tipo = 'PJ' OR MembroId IS NOT NULL) ORDER BY Nome`)).recordset
      .map((f) => ({ fornecedorId: f.FornecedorId, nome: f.Nome, tipo: f.Tipo, confirmado: !!f.DadosBancariosConfirmados, membroId: f.MembroId == null ? null : Number(f.MembroId) }))
    : [];
  return {
    abrangencias: lista(mi.ABRANGENCIAS), divulgacoes: lista(mi.DIVULGACOES), periodicidades: lista(mi.PERIODICIDADES), fontes: lista(mi.FONTES),
    status: lista(mi.STATUS_ENVIO), pareceres: lista(mi.PARECERES), resultados: lista(mi.RESULTADOS_CLI), resultadosPresidente: lista(mi.RESULTADOS_PRESIDENTE),
    ufs: mi.UFS, prazoParecerDias: mi.PRAZO_PARECER_DIAS, diaPrazoRelatorio: mi.DIA_PRAZO_RELATORIO, sustentoMaximo: mi.SUSTENTO_MAXIMO,
    congregacoes: congs.recordset.map((c) => ({ congregacaoId: c.CongregacaoId, nome: c.Nome })),
    fornecedores: forn,
    campos: (await listarCampos(pool, { alcance })).map((c) => ({ campoId: c.campoId, nome: c.nome, abrangencia: c.abrangencia, lugar: c.lugar })),
    papeis: { geral: !!alcance.geral, semiadespa: !!alcance.semiadespa, cme: !!alcance.cme, presidente: !!alcance.presidente, tesouraria: !!alcance.tesouraria }
  };
}

// ================================================================ avisos ================================================================
async function nomeDoMembro(pool, membroId) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`SELECT Nome FROM MembroReferencia WHERE MembroId = @m`);
  return r.recordset[0] ? r.recordset[0].Nome : `matrícula ${membroId}`;
}
async function pessoas(pool, ids) {
  const lista = [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!lista.length) return [];
  const r = await pool.request().query(`SELECT MembroId, Nome, Email FROM MembroReferencia WHERE MembroId IN (${lista.join(",")})`);
  return r.recordset.map((l) => ({ membroId: l.MembroId, nome: l.Nome, email: l.Email }));
}
// O Pastor Presidente em exercício (o assento de Presidente vigente na Diretoria Executiva).
async function presidentes(pool) {
  const r = await pool.request().query(`
    SELECT m.MembroId, m.Nome, m.Email FROM Assentos a JOIN Orgaos o ON o.OrgaoId = a.OrgaoId JOIN MembroReferencia m ON m.MembroId = a.MembroId
    WHERE o.Sigla = 'DIRETORIA_EXECUTIVA' AND a.CargoOuFuncao = 'PRESIDENTE' AND a.DataFim IS NULL`);
  return r.recordset.map((l) => ({ membroId: l.MembroId, nome: l.Nome, email: l.Email }));
}
async function destinatariosGerais(pool) {
  const { resolverDestinatariosPorPermissao } = require("./notificacoes");
  return resolverDestinatariosPorPermissao(pool, { permissao: "missoes", nivel: "GLOBAL" });
}
async function destinatariosSemiadespa(pool, hoje) {
  const r = await pool.request().input("h", sql.Date, hoje).query(`
    SELECT DISTINCT m.MembroId, m.Nome, m.Email FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId JOIN Departamentos d ON d.DepartamentoId = l.EscopoId
    JOIN MembroReferencia m ON m.MembroId = l.MembroId
    WHERE l.EscopoTipo = 'DEPARTAMENTO' AND d.Sigla = 'SEMIADESPA' AND p.Nome IN (N'Secretário de Missões', N'Líder Geral de Departamento/Secretaria')
      AND (l.AtivoAte IS NULL OR l.AtivoAte >= @h) AND m.Status = 'ATIVO'`);
  return r.recordset.map((l) => ({ membroId: l.MembroId, nome: l.Nome, email: l.Email }));
}
const semRepetir = (listas) => {
  const vistos = new Set();
  return listas.flat().filter((d) => !vistos.has(Number(d.membroId)) && vistos.add(Number(d.membroId))).map((d) => ({ membroId: d.membroId, nome: d.nome, email: d.email }));
};
async function avisar(pool, regraChave, lista, mensagem, envioId, deps = {}) {
  try {
    const destinatarios = semRepetir([lista || []]);
    if (!destinatarios.length) return 0;
    const canaisDb = deps.canaisDb || require("./canaisDb");
    await canaisDb.notificarAgora(pool, { regraChave, destinatarios, mensagem, referenciaId: envioId, referenciaTabela: "EnviosMissionarios", aguardarEntrega: false, deps });
    return destinatarios.length;
  } catch (e) {
    console.error(`[MISSOES] falha ao avisar (${regraChave}):`, e.message);
    return 0;
  }
}
// O parecer vencido: um aviso por envio (o motor não duplica a referência), à CME e ao nível geral.
async function detectarParecerVencido(pool, { hoje = hojeBrasilia() } = {}) {
  const r = await pool.request().query(`SELECT ${COLUNAS_ENVIO} ${JUNCOES_ENVIO(false)} WHERE e.Status = N'EM_PARECER'`);
  const vencidos = r.recordset.map((l) => formaEnvio(l, hoje)).filter((e) => e.parecerVencido);
  if (!vencidos.length) return [];
  const destinatarios = semRepetir([await composicaoCME(pool), await destinatariosGerais(pool)]);
  return vencidos.map((e) => ({ referenciaId: e.envioId, destinatarios,
    fatoGerador: mi.textoParecerVencido({ missionario: e.missionario.nome, campo: e.campo.nome, prazo: e.prazoParecer, hoje }) }));
}
// O relatório de campo vencido: um aviso por envio e período, à SEMIADESPA e ao nível geral.
async function detectarRelatorioAtrasado(pool, { hoje = hojeBrasilia() } = {}) {
  const envios = (await pool.request().query(`SELECT ${COLUNAS_ENVIO} ${JUNCOES_ENVIO(false)} WHERE e.Status IN (N'ATIVO', N'ENCERRADO')`)).recordset.map((l) => formaEnvio(l, hoje));
  if (!envios.length) return [];
  const din = await carregarDinheiro(() => pool.request());
  const atual = mi.mesDe(hoje);
  const fatos = [];
  for (const e of envios) {
    const d = din(e.envioId);
    const sit = mi.situacaoRelatorios(e, d.relatorios.map((r) => r.periodoInicio), hoje);
    // o texto só diz "suspenso" quando suspende de fato: o envio ativo com sustento neste mês
    const vig = vigenteNoMes(d.valores, atual);
    const suspende = e.status === "ATIVO" && !!vig && vig.valor > 0;
    for (const p of sit.vencidos) fatos.push({ e, p, suspende });
  }
  if (!fatos.length) return [];
  const destinatarios = semRepetir([await destinatariosSemiadespa(pool, hoje), await destinatariosGerais(pool)]);
  return fatos.map(({ e, p, suspende }) => ({ referenciaId: mi.referenciaPeriodo(p.inicio, e.envioId), destinatarios,
    fatoGerador: mi.textoRelatorioAtrasado({ missionario: e.missionario.nome, campo: e.campo.nome, periodo: p, prazo: p.prazo, hoje, suspende }) }));
}

// ================================================================ a autorização do nome no mural ================================================================
// O missionário dá ou retira a autorização de ter o nome no mural (LGPD Art. 8º §5º e Art. 18, IX): a SEMIADESPA (ou o nível geral) registra o que ele pediu.
async function alterarDivulgacao(pool, { envioId, dados, por, hoje = hojeBrasilia(), alcance }) {
  if (!gere(alcance)) return PROIBIDO(SO_GESTAO);
  const d = dados && typeof dados === "object" ? dados : {};
  if (typeof d.divulgarNome !== "boolean") return { sucesso: false, mensagem: "Diga se o missionário autoriza (verdadeiro) ou não (falso) o nome no mural." };
  return emTransacao(pool, async (t, rq) => {
    const e = await lerEnvio(rq, envioId, hoje, { travar: true });
    if (!e) return NAO_EXISTE;
    if (!mi.VIVOS.includes(e.status)) return { sucesso: false, mensagem: "O envio não está em andamento nem ativo: ele já não aparece no mural." };
    if (e.divulgarNome === d.divulgarNome) return { sucesso: true, mensagem: d.divulgarNome ? "O nome já estava autorizado." : "O nome já não aparecia no mural." };
    const u = await rq().input("id", sql.Int, envioId).input("v", sql.Bit, d.divulgarNome).input("st", sql.NVarChar(25), e.status)
      .query(`UPDATE EnviosMissionarios SET DivulgarNome = @v WHERE EnvioId = @id AND Status = @st`);
    if (!u.rowsAffected[0]) return MUDOU;
    await registrarAuditoriaNaTransacao(t, { tabela: "EnviosMissionarios", registroId: envioId, acao: d.divulgarNome ? "MISSOES_NOME_AUTORIZADO" : "MISSOES_NOME_RETIRADO", usuarioId: por,
      dadosAntes: { divulgarNome: e.divulgarNome }, dadosDepois: { divulgarNome: d.divulgarNome } });
    return { sucesso: true, mensagem: d.divulgarNome ? "Autorização registrada: o nome aparece no mural (se o campo for público)." : "Autorização retirada: o nome sai do mural na hora." };
  });
}

// ================================================================ Meus Dados (LGPD Art. 18) ================================================================
// O que se registrou sobre a pessoa como missionária: o envio, o que se disse dele (a justificativa, o parecer, os motivos da decisão), o sustento e os pagamentos.
async function dadosDoTitular(pool, membroId) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT e.EnvioId, c.Nome AS Campo, e.Status, CONVERT(varchar(10), e.SolicitadoEm, 120) AS SolicitadoEm, e.InicioMes, e.FimMes, e.MotivoEncerramento, e.DivulgarNome, e.Periodicidade,
           e.Justificativa, e.ParecerCME, e.ParecerFundamentacao, e.DecisaoResultado, e.DecisaoMotivo, e.PresidenteResultado, e.PresidenteMotivo, e.DesistenciaMotivo,
           (SELECT COUNT(*) FROM RelatoriosCampo r WHERE r.EnvioId = e.EnvioId) AS Relatorios
    FROM EnviosMissionarios e JOIN CamposMissionarios c ON c.CampoId = e.CampoId WHERE e.MembroId = @m ORDER BY e.SolicitadoEm DESC, e.EnvioId DESC`);
  const valores = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT v.EnvioId, v.DesdeMes, v.Valor FROM EnvioSustentoValores v JOIN EnviosMissionarios e ON e.EnvioId = v.EnvioId WHERE e.MembroId = @m ORDER BY v.DesdeMes`);
  const pagamentos = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT g.EnvioId, g.MesReferencia, g.Valor, s.Status FROM SustentoGeracoes g JOIN EnviosMissionarios e ON e.EnvioId = g.EnvioId JOIN SaidasTesouraria s ON s.SaidaId = g.SaidaId
    WHERE e.MembroId = @m ORDER BY g.MesReferencia`);
  return r.recordset.map((l) => ({
    campo: l.Campo, status: mi.STATUS_ENVIO[l.Status] || l.Status, pedidoEm: iso(l.SolicitadoEm), inicio: mes7(l.InicioMes), fim: mes7(l.FimMes),
    motivoEncerramento: l.MotivoEncerramento, autorizouDivulgarNome: !!l.DivulgarNome, periodicidade: mi.PERIODICIDADES[l.Periodicidade] || l.Periodicidade,
    relatoriosRecebidos: Number(l.Relatorios), justificativa: l.Justificativa,
    parecerCME: l.ParecerCME ? { resultado: mi.PARECERES[l.ParecerCME], fundamentacao: l.ParecerFundamentacao } : null,
    decisaoCLI: l.DecisaoResultado ? { resultado: mi.RESULTADOS_CLI[l.DecisaoResultado], motivo: l.DecisaoMotivo } : null,
    presidente: l.PresidenteResultado ? { resultado: mi.RESULTADOS_PRESIDENTE[l.PresidenteResultado], motivo: l.PresidenteMotivo } : null,
    desistencia: l.DesistenciaMotivo || null,
    sustento: valores.recordset.filter((v) => v.EnvioId === l.EnvioId).map((v) => ({ desde: mes7(v.DesdeMes), valor: Number(v.Valor) })),
    pagamentos: pagamentos.recordset.filter((g) => g.EnvioId === l.EnvioId).map((g) => ({ mes: mes7(g.MesReferencia), valor: Number(g.Valor), situacao: g.Status }))
  }));
}
// Os atos da pessoa em Missões: nos envios (pediu, parecer, decisão, Presidente, desistência, encerramento) e no resto (relatórios, campos, reajustes, gerações).
async function atosDoTitular(pool, membroId) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT e.EnvioId, c.Nome AS Campo, mm.Nome AS Missionario, CONVERT(varchar(10), e.SolicitadoEm, 120) AS SolicitadoEm,
           CASE WHEN e.SolicitadoPor = @m THEN 1 ELSE 0 END AS Pediu, CASE WHEN e.ParecerPor = @m THEN 1 ELSE 0 END AS DeuParecer,
           CASE WHEN e.DecisaoRegistradaPor = @m THEN 1 ELSE 0 END AS RegistrouDecisao, CASE WHEN e.PresidentePor = @m THEN 1 ELSE 0 END AS Presidente,
           CASE WHEN e.DesistidoPor = @m THEN 1 ELSE 0 END AS Desistiu, CASE WHEN e.EncerradoPor = @m THEN 1 ELSE 0 END AS Encerrou,
           (SELECT COUNT(*) FROM RelatoriosCampo r WHERE r.EnvioId = e.EnvioId AND (r.RegistradoPor = @m OR r.RetificadoPor = @m)) AS Relatorios,
           (SELECT COUNT(*) FROM EnvioSustentoValores v WHERE v.EnvioId = e.EnvioId AND v.RegistradoPor = @m AND v.Motivo <> N'Ativação do envio') AS Reajustes,
           (SELECT COUNT(*) FROM SustentoGeracoes g WHERE g.EnvioId = e.EnvioId AND g.GeradaPor = @m) AS Geracoes
    FROM EnviosMissionarios e JOIN CamposMissionarios c ON c.CampoId = e.CampoId JOIN MembroReferencia mm ON mm.MembroId = e.MembroId
    WHERE @m IN (e.SolicitadoPor, e.ParecerPor, e.DecisaoRegistradaPor, e.PresidentePor, e.DesistidoPor, e.EncerradoPor)
       OR EXISTS (SELECT 1 FROM RelatoriosCampo r WHERE r.EnvioId = e.EnvioId AND (r.RegistradoPor = @m OR r.RetificadoPor = @m))
       OR EXISTS (SELECT 1 FROM EnvioSustentoValores v WHERE v.EnvioId = e.EnvioId AND v.RegistradoPor = @m AND v.Motivo <> N'Ativação do envio')
       OR EXISTS (SELECT 1 FROM SustentoGeracoes g WHERE g.EnvioId = e.EnvioId AND g.GeradaPor = @m)
    ORDER BY e.SolicitadoEm DESC, e.EnvioId DESC`);
  const campos = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT Nome, CONVERT(varchar(10), AbertoEm, 120) AS AbertoEm, CASE WHEN AbertoPor = @m THEN 1 ELSE 0 END AS Abriu, CASE WHEN EncerradoPor = @m THEN 1 ELSE 0 END AS Encerrou
    FROM CamposMissionarios WHERE @m IN (AbertoPor, EncerradoPor) ORDER BY AbertoEm DESC`);
  return r.recordset.map((l) => ({
    envio: `${l.Missionario} — campo ${l.Campo}`, em: iso(l.SolicitadoEm),
    papeis: [l.Pediu ? "pediu" : null, l.DeuParecer ? "deu o parecer da CME" : null, l.RegistrouDecisao ? "registrou a decisão da CLI" : null,
      l.Presidente ? "decidiu como Pastor Presidente" : null, l.Desistiu ? "desistiu" : null, l.Encerrou ? "encerrou o envio" : null,
      Number(l.Relatorios) ? `lançou ou corrigiu ${l.Relatorios} relatório(s)` : null, Number(l.Reajustes) ? `reajustou o sustento ${l.Reajustes} vez(es)` : null,
      Number(l.Geracoes) ? `gerou ${l.Geracoes} pagamento(s)` : null].filter(Boolean)
  })).concat(campos.recordset.map((c) => ({ envio: `Campo ${c.Nome}`, em: iso(c.AbertoEm), papeis: [c.Abriu ? "abriu o campo" : null, c.Encerrou ? "encerrou o campo" : null].filter(Boolean) })));
}

module.exports = {
  montarAlcance, veMissoes, gere, soCME, soTesouraria, reunioesEncerradas, listarCampos, lerCampo, criarCampo, editarCampo, encerrarCampo, listarEnvios, detalharEnvio, criarEnvio,
  emitirParecer, desistir, decidir, decidirPresidente, encerrarEnvio, reajustar, alterarDivulgacao, registrarRelatorio, retificarRelatorio, previaSustento, gerarSustento, painel,
  mural, catalogos, detectarParecerVencido, detectarRelatorioAtrasado, dadosDoTitular, atosDoTitular, avaliarMes, vigenteNoMes
};
