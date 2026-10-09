// shared/protecaoDb.js (v7.8 — Incidentes, notificação obrigatória e escuta protegida)
//
// A camada de banco da regra pura de shared/protecaoMenores.js. Reúne os fatos, pede a decisão à regra e grava só o que ela decidiu. Nada aqui inventa regra.
//
// Quem vê o quê (decidido uma vez, aqui, e conferido pelos roteiros ponta a ponta):
//   - qualquer pessoa logada REGISTRA um incidente e vê só a situação (aberto/encerrado) do que ela mesma registrou;
//   - quem tem a permissão `protecao_menores` vê a fila da sua congregação (a Diretoria e o Comitê veem tudo), registra a comunicação ao órgão e lê o relato;
//   - só o nível geral (Diretoria e Comitê) decide o afastamento cautelar, encerra o caso e vê padrões, composição do Comitê e relatório anual;
//   - quem é ENVOLVIDO no incidente nunca o vê (conflito de interesse): para ele o incidente simplesmente não existe;
//   - cada leitura do relato fica registrada (quem e quando), nunca o conteúdo.
// O módulo de aptidão (ministerioMenoresDb) é carregado sob demanda para não criar ciclo.
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const pm = require("./protecaoMenores");
const mm = require("./ministerioMenores");
const { hojeBrasilia } = require("./dataBrasilia");
const { notificarAgora } = require("./canaisDb");
const { gerarProtocolo } = require("./ouvidoria");
const { resolverDestinatariosPorPermissao } = require("./notificacoes");
const { obterTrava } = require("./financeiroSeguro");

const PERMISSAO = "protecao_menores";
const PAPEL_COMITE = "Comitê de Proteção";
const LIMITE_REGISTROS_DIA = 10;            // por pessoa, em 24 horas (contra uso de má-fé; um relato verdadeiro nunca chega perto)
const LIMITE_ALEGACOES_DIA = 3;
const LIMITE_CANAL_HORA = 40;               // pedidos de ajuda sem login que a Igreja aceita por hora (contra inundação; a orientação sempre aparece)
const MAX_ADENDOS = 5;
const MAX_ADENDO = 2000;
const CAUTELAR_LEMBRETE_DIAS = 3;           // afastamento sem decisão do Comitê: o primeiro aviso sai em 3 dias, depois toda semana

const numeroDoErro = (e) => e && (e.number || (e.originalError && e.originalError.info && e.originalError.info.number));
const duplicado = (e) => numeroDoErro(e) === 2627 || numeroDoErro(e) === 2601;
async function fecharTransacao(transaction, ok) {
  try { if (ok) await transaction.commit(); else await transaction.rollback(); } catch (e) { /* a transação já pode ter sido encerrada pelo servidor */ }
}
const iso = (v) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
const destinatarioDe = (m) => ({ membroId: m.membroId != null ? m.membroId : m.MembroId, nome: m.nome != null ? m.nome : m.Nome, email: m.email !== undefined ? m.email : m.Email });

// ---------------------------------------------------------------
// Quem recebe os avisos e quem pode ver
// ---------------------------------------------------------------

// A Diretoria e o Comitê (papéis de nível geral com a permissão) e o Dirigente da congregação do incidente. Nunca o envolvido.
async function destinatariosDaGestao(pool, { congregacaoId = null, excluirMembroIds = [] } = {}) {
  const globais = await resolverDestinatariosPorPermissao(pool, { permissao: PERMISSAO, nivel: "GLOBAL" });
  let locais = [];
  if (congregacaoId) {
    locais = (await pool.request().input("permissao", sql.NVarChar(60), `%,${PERMISSAO},%`).input("cong", sql.Int, congregacaoId).query(`
      SELECT DISTINCT m.MembroId AS membroId, m.Nome AS nome, m.Email AS email
      FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId JOIN MembroReferencia m ON m.MembroId = l.MembroId
      WHERE (',' + p.Permissoes + ',') LIKE @permissao AND l.EscopoTipo = 'CONGREGACAO' AND l.EscopoId = @cong
        AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))`)).recordset;
  }
  const fora = new Set((excluirMembroIds || []).map(Number));
  const vistos = new Set();
  return [...globais, ...locais].filter((d) => { if (!d || fora.has(Number(d.membroId)) || vistos.has(d.membroId)) return false; vistos.add(d.membroId); return true; });
}
async function destinatariosGeraisDaDiretoria(pool, excluirMembroIds = []) {
  const fora = new Set((excluirMembroIds || []).map(Number));
  return (await resolverDestinatariosPorPermissao(pool, { permissao: PERMISSAO, nivel: "GLOBAL" })).filter((d) => !fora.has(Number(d.membroId)));
}

// ver = { membroId, geral, podeVerCongregacao(nome) } — montado pela rota a partir da sessão de liderança.
function visivelPara(ver, incidente, membrosEnvolvidos) {
  if (!ver) return false;
  if ((membrosEnvolvidos || []).map(Number).includes(Number(ver.membroId))) return false;       // quem é envolvido não vê (nem sabe que existe)
  if (ver.geral) return true;
  return !!(incidente.CongregacaoNome && ver.podeVerCongregacao && ver.podeVerCongregacao(incidente.CongregacaoNome));
}

const SELECT_INCIDENTE = `
  SELECT i.IncidenteId, i.Protocolo, i.Nivel, i.Origem, i.CongregacaoId, c.Nome AS CongregacaoNome, i.EquipeId, q.Nome AS EquipeNome, i.DataOcorrencia, i.Onde, i.Descricao, i.RelatadoPor,
         i.ContatoCanal, i.ConhecidoEm, i.ExigeComunicacao, i.PrazoNotificacaoEm, i.RegistradoPorMembroId, i.RegistradoEm, i.Status, i.EncerradoEm, i.EncerradoPorMembroId,
         i.EncerramentoResultado, i.EncerramentoProvidencia
  FROM IncidentesProtecao i LEFT JOIN Congregacoes c ON c.CongregacaoId = i.CongregacaoId LEFT JOIN EscalasEquipes q ON q.EquipeId = i.EquipeId`;

async function carregarIncidente(pool, id) {
  return (await pool.request().input("id", sql.Int, id).query(`${SELECT_INCIDENTE} WHERE i.IncidenteId = @id`)).recordset[0] || null;
}
async function envolvidosDe(pool, incidenteId) {
  return (await pool.request().input("id", sql.Int, incidenteId).query(`
    SELECT e.EnvolvidoId, e.MembroId, COALESCE(m.Nome, e.Nome) AS Nome,
           (SELECT TOP 1 d.Decisao FROM IncidenteDecisoesCautelares d WHERE d.EnvolvidoId = e.EnvolvidoId ORDER BY d.DecisaoId DESC) AS UltimaDecisao,
           (SELECT COUNT(*) FROM IncidenteDecisoesCautelares d WHERE d.EnvolvidoId = e.EnvolvidoId) AS NDecisoes
    FROM IncidenteEnvolvidos e LEFT JOIN MembroReferencia m ON m.MembroId = e.MembroId WHERE e.IncidenteId = @id ORDER BY e.EnvolvidoId`)).recordset;
}
async function comunicacoesDe(pool, incidenteId) {
  return (await pool.request().input("id", sql.Int, incidenteId).query(`
    SELECT k.ComunicacaoId, k.Orgao, k.Forma, k.ComunicadoEm, k.ProtocoloExterno, k.ReferenciaArquivo, k.Observacao, k.ForaDoPrazo, k.RegistradoEm, r.Nome AS RegistradoPorNome
    FROM IncidenteComunicacoes k JOIN MembroReferencia r ON r.MembroId = k.RegistradoPorMembroId WHERE k.IncidenteId = @id ORDER BY k.ComunicacaoId`)).recordset;
}
async function contarAnexos(pool, incidenteId) {
  return Number((await pool.request().input("id", sql.Int, incidenteId).query(`SELECT COUNT(*) AS n FROM AnexosGenericos WHERE Tabela = 'IncidentesProtecao' AND RegistroId = @id`)).recordset[0].n);
}
// O carregamento que as rotas de escrita usam: o incidente + os membros envolvidos, já conferida a visão. null = "não existe" (a mesma resposta para tudo).
async function incidenteVisivel(pool, incidenteId, ver) {
  const i = await carregarIncidente(pool, incidenteId);
  if (!i) return null;
  const env = await envolvidosDe(pool, incidenteId);
  if (!visivelPara(ver, i, env.filter((e) => e.MembroId).map((e) => e.MembroId))) return null;
  return { incidente: i, envolvidos: env };
}

// A trilha de auditoria é lida por quem tem a permissão "auditoria" (que pode não ser da Diretoria): a suspeita de violência não deixa nela nem o número do caso nem quem agiu.
async function auditar(incidente, acao, por, extra = {}) {
  const sensivel = incidente.Nivel === "ALEGACAO";
  await registrarAuditoria({ tabela: "IncidentesProtecao", registroId: sensivel ? 0 : incidente.IncidenteId, acao, usuarioId: sensivel ? null : (por || null), dadosDepois: sensivel ? {} : extra });
}

// ---------------------------------------------------------------
// Mapeamento para as rotas
// ---------------------------------------------------------------

function relogioDoIncidente(i, temComunicacao, agora) {
  if (!i.ExigeComunicacao || i.Status !== "ABERTO" || temComunicacao) return null;
  const r = pm.relogio(i.PrazoNotificacaoEm, agora);
  return { prazoEm: iso(i.PrazoNotificacaoEm), restanteMs: r.restanteMs, faixa: r.faixa, vencido: r.vencido, texto: r.texto };
}
function mapearResumo(x, agora) {
  const nivel = pm.NIVEIS[x.Nivel];
  const temComunicacao = Number(x.NComunicacoes) > 0;
  return {
    incidenteId: x.IncidenteId, protocolo: x.Protocolo, nivel: x.Nivel, nivelRotulo: nivel ? nivel.rotulo : x.Nivel, origem: x.Origem, origemRotulo: pm.ORIGENS[x.Origem] || x.Origem,
    congregacaoId: x.CongregacaoId || null, congregacaoNome: x.CongregacaoNome || null, dataOcorrencia: pm.paraIso(x.DataOcorrencia), status: x.Status, exigeComunicacao: !!x.ExigeComunicacao,
    prazoEm: x.ExigeComunicacao ? iso(x.PrazoNotificacaoEm) : null, relogio: relogioDoIncidente(x, temComunicacao, agora), comunicado: temComunicacao, comComprovante: Number(x.NComComprovante) > 0 || Number(x.NAnexos) > 0,
    cautelarSemDecisao: x.Nivel === "ALEGACAO" ? Number(x.NSemDecisao) : 0, registradoEm: iso(x.RegistradoEm), encerradoEm: iso(x.EncerradoEm)
  };
}

// ---------------------------------------------------------------
// Registrar
// ---------------------------------------------------------------

async function contarRegistrosRecentes(pool, membroId) {
  const r = (await pool.request().input("m", sql.Int, membroId).query(`
    SELECT COUNT(*) AS total, SUM(CASE WHEN Nivel = 'ALEGACAO' THEN 1 ELSE 0 END) AS alegacoes FROM IncidentesProtecao
    WHERE RegistradoPorMembroId = @m AND RegistradoEm >= DATEADD(HOUR, -24, SYSUTCDATETIME())`)).recordset[0];
  return { total: Number(r.total) || 0, alegacoes: Number(r.alegacoes) || 0 };
}
async function gerarProtocoloDeIncidente(pool) {
  for (let tentativa = 1; ; tentativa++) {
    const p = (await gerarProtocolo(pool)).replace(/^OUV-/, "PRO-");
    const ja = (await pool.request().input("p", sql.NVarChar(30), p).query(`SELECT 1 AS x FROM IncidentesProtecao WHERE Protocolo = @p`)).recordset[0];
    if (!ja || tentativa >= 3) return p;
  }
}
const RELATADO_DO_CANAL = { CRIANCA_ADOLESCENTE: "PROPRIA_CRIANCA", RESPONSAVEL: "RESPONSAVEL", OUTRA_PESSOA: "OUTRA_PESSOA" };

// Grava o incidente, o envolvido e o relato numa transação só. `d` já passou por pm.validarIncidente (ou pelo canal de ajuda).
async function gravarIncidente(pool, { d, registrante, envolvidoNome, evitarRepeticao = false }) {
  const protocolo = await gerarProtocoloDeIncidente(pool);
  const prazo = d.exigeComunicacao ? pm.prazoNotificacao(d.conhecidoEm) : null;
  const transaction = new sql.Transaction(pool);
  let incidenteId;
  try {
    await transaction.begin();
    if (evitarRepeticao && registrante) {
      if (!(await obterTrava(() => new sql.Request(transaction), `protecao-reg-${registrante}`, 8000))) { await fecharTransacao(transaction, false); return { ocupado: true }; }
      const repetido = (await new sql.Request(transaction).input("m", sql.Int, registrante).input("n", sql.NVarChar(16), d.nivel).input("dt", sql.Date, d.dataOcorrencia).input("ds", sql.NVarChar(1000), d.descricao).query(`
        SELECT TOP 1 IncidenteId, Protocolo, PrazoNotificacaoEm FROM IncidentesProtecao
        WHERE RegistradoPorMembroId = @m AND Nivel = @n AND DataOcorrencia = @dt AND Descricao = @ds AND RegistradoEm >= DATEADD(MINUTE, -10, SYSUTCDATETIME()) ORDER BY IncidenteId DESC`)).recordset[0];
      if (repetido) { await fecharTransacao(transaction, false); return { repetido }; }
    }
    const rq = new sql.Request(transaction);
    const ins = await rq.input("p", sql.NVarChar(30), protocolo).input("n", sql.NVarChar(16), d.nivel).input("o", sql.NVarChar(12), d.origem).input("c", sql.Int, d.congregacaoId || null).input("e", sql.Int, d.equipeId || null)
      .input("dt", sql.Date, d.dataOcorrencia).input("on", sql.NVarChar(150), d.onde || null).input("ds", sql.NVarChar(1000), d.descricao).input("rp", sql.NVarChar(16), d.relatadoPor || null)
      .input("ct", sql.NVarChar(150), d.contatoCanal || null).input("ce", sql.DateTime2, d.conhecidoEm).input("x", sql.Bit, d.exigeComunicacao ? 1 : 0).input("pz", sql.DateTime2, prazo).input("r", sql.Int, registrante || null)
      .query(`INSERT INTO IncidentesProtecao (Protocolo, Nivel, Origem, CongregacaoId, EquipeId, DataOcorrencia, Onde, Descricao, RelatadoPor, ContatoCanal, ConhecidoEm, ExigeComunicacao, PrazoNotificacaoEm, RegistradoPorMembroId)
              VALUES (@p, @n, @o, @c, @e, @dt, @on, @ds, @rp, @ct, @ce, @x, @pz, @r); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`);
    incidenteId = ins.recordset[0].id;
    if (d.envolvidoMembroId || envolvidoNome) {
      await new sql.Request(transaction).input("i", sql.Int, incidenteId).input("m", sql.Int, d.envolvidoMembroId || null).input("n", sql.NVarChar(150), envolvidoNome || null)
        .query(`INSERT INTO IncidenteEnvolvidos (IncidenteId, MembroId, Nome) VALUES (@i, @m, @n)`);
    }
    if (d.relato) {
      await new sql.Request(transaction).input("i", sql.Int, incidenteId).input("t", sql.NVarChar(4000), d.relato).input("r", sql.Int, registrante || null)
        .query(`INSERT INTO IncidenteRelatos (IncidenteId, Tipo, Texto, RegistradoPorMembroId) VALUES (@i, 'RELATO', @t, @r)`);
    }
    await transaction.commit();
  } catch (e) { await fecharTransacao(transaction, false); throw e; }
  return { incidenteId, protocolo, prazo };
}

// A pessoa envolvida sai das escalas com menores AGORA (a rotina diária e a horária refazem se isto falhar). Devolve quantas escalas foram desmarcadas, ou null.
async function afastarDasEscalas(pool, membroId) {
  try { return (await require("./ministerioMenoresDb").retirarInaptosDasEscalas(pool, { membroId })).alocacoes; } catch (e) { console.error("[PROTECAO] a retirada imediata da escala falhou (a rotina refaz):", e.message); return null; }
}

// `registrante`: { membroId } de quem registra. Devolve { sucesso, incidenteId, protocolo, prazoEm, relogio, escalasDesmarcadas, avisados } ou { sucesso:false, mensagem }.
async function registrarIncidente(pool, { dados, registrante, agora = new Date(), deps }) {
  const hoje = hojeBrasilia(agora);
  const v = pm.validarIncidente(dados, { hoje, agora, origem: "MEMBRO" });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const d = v.dados;
  const recentes = await contarRegistrosRecentes(pool, registrante.membroId);
  if (recentes.total >= LIMITE_REGISTROS_DIA || (d.nivel === "ALEGACAO" && recentes.alegacoes >= LIMITE_ALEGACOES_DIA)) {
    return { sucesso: false, mensagem: "Você já registrou muitos incidentes nas últimas 24 horas. Se há uma criança em perigo agora, ligue 100 (Disque Direitos Humanos) ou 190, ou fale direto com o Dirigente.", limite: true };
  }
  const cong = (await pool.request().input("id", sql.Int, d.congregacaoId).query(`SELECT CongregacaoId, Nome FROM Congregacoes WHERE CongregacaoId = @id`)).recordset[0];
  if (!cong) return { sucesso: false, mensagem: "Congregação não encontrada." };
  if (d.equipeId) {
    const eq = (await pool.request().input("id", sql.Int, d.equipeId).query(`SELECT CongregacaoId FROM EscalasEquipes WHERE EquipeId = @id`)).recordset[0];
    if (!eq || Number(eq.CongregacaoId) !== Number(d.congregacaoId)) return { sucesso: false, mensagem: "A equipe informada não é desta congregação." };
  }
  let envolvidoNome = d.envolvidoNome;
  if (d.envolvidoMembroId) {
    const m = (await pool.request().input("id", sql.Int, d.envolvidoMembroId).query(`SELECT MembroId, Nome FROM MembroReferencia WHERE MembroId = @id`)).recordset[0];
    if (!m) return { sucesso: false, mensagem: "A matrícula da pessoa envolvida não foi encontrada." };
    envolvidoNome = null;       // quem é do cadastro tem o nome no cadastro
  }
  // um clique duplo não registra duas vezes o mesmo fato (mesma pessoa, mesmo nível, mesma data e mesmo texto nos últimos 10 minutos): a conferência e a gravação são uma coisa só, sob trava
  const gravado = await gravarIncidente(pool, { d: { ...d, contatoCanal: null }, registrante: registrante.membroId, envolvidoNome, evitarRepeticao: true });
  if (gravado.ocupado) return { sucesso: false, mensagem: "O sistema está ocupado com outro registro seu. Aguarde alguns segundos e confira em \"Meus registros\" antes de tentar de novo." };
  if (gravado.repetido) return { sucesso: true, repetido: true, incidenteId: gravado.repetido.IncidenteId, protocolo: gravado.repetido.Protocolo, prazoEm: iso(gravado.repetido.PrazoNotificacaoEm), mensagem: "Este incidente já tinha sido registrado agora há pouco." };
  const { incidenteId, protocolo, prazo } = gravado;
  await auditar({ IncidenteId: incidenteId, Nivel: d.nivel }, "PROTECAO_INCIDENTE_REGISTRADO", registrante.membroId, { nivel: d.nivel });

  let escalasDesmarcadas = null;
  if (d.nivel === "ALEGACAO" && d.envolvidoMembroId) escalasDesmarcadas = await afastarDasEscalas(pool, d.envolvidoMembroId);
  const destinatarios = await destinatariosDaGestao(pool, { congregacaoId: d.congregacaoId, excluirMembroIds: d.envolvidoMembroId ? [d.envolvidoMembroId] : [] });
  const aviso = await notificarAgora(pool, { regraChave: "PROTECAO_INCIDENTE_NOVO", destinatarios, mensagem: pm.textoIncidenteNovo({ nivel: d.nivel, prazoEm: prazo }), referenciaId: incidenteId, referenciaTabela: "IncidentesProtecao", aguardarEntrega: false, deps });
  return {
    sucesso: true, incidenteId, protocolo, prazoEm: prazo ? prazo.toISOString() : null, exigeComunicacao: d.exigeComunicacao, escalasDesmarcadas, avisados: aviso.criadas || 0,
    mensagem: d.exigeComunicacao
      ? `Registrado (protocolo ${protocolo}). A liderança foi avisada e o prazo de 24 horas para comunicar o Conselho Tutelar já está contando. Não faça perguntas à criança e não converse sobre o caso com outras pessoas.`
      : `Registrado (protocolo ${protocolo}). A liderança foi avisada.`
  };
}

// O canal de ajuda (sem login): a criança, o responsável ou um terceiro contam o que quiserem. Cria uma SUSPEITA DE VIOLÊNCIA (o relógio de 24 horas conta) sem registrar quem escreveu.
async function registrarPedidoDeAjuda(pool, { dados, agora = new Date(), deps }) {
  const hoje = hojeBrasilia(agora);
  const v = pm.validarPedidoDeAjuda(dados, { hoje, agora });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const x = v.dados;
  const naHora = Number((await pool.request().query(`SELECT COUNT(*) AS n FROM IncidentesProtecao WHERE Origem = 'CANAL_AJUDA' AND RegistradoEm >= DATEADD(HOUR, -1, SYSUTCDATETIME())`)).recordset[0].n);
  if (naHora >= LIMITE_CANAL_HORA) return { sucesso: false, limite: true, mensagem: "Estamos recebendo muitas mensagens agora e não conseguimos registrar a sua. Se você precisa de ajuda, ligue 100 (de graça, a qualquer hora) ou 190 se existe perigo agora." };
  let congregacaoId = null;
  if (x.congregacaoId) {
    const c = (await pool.request().input("id", sql.Int, x.congregacaoId).query(`SELECT CongregacaoId FROM Congregacoes WHERE CongregacaoId = @id`)).recordset[0];
    if (c) congregacaoId = c.CongregacaoId;
  }
  const d = {
    nivel: "ALEGACAO", origem: "CANAL_AJUDA", congregacaoId, equipeId: null, dataOcorrencia: hoje, onde: null, descricao: "Pedido de ajuda recebido pelo canal da Igreja, sem login. O texto está registrado à parte, como foi escrito.",
    relatadoPor: RELATADO_DO_CANAL[x.quemSou] || "OUTRA_PESSOA", relato: x.texto, contatoCanal: x.contato, conhecidoEm: x.conhecidoEm, exigeComunicacao: true, envolvidoMembroId: null
  };
  const { incidenteId, protocolo, prazo } = await gravarIncidente(pool, { d, registrante: null, envolvidoNome: null });
  await auditar({ IncidenteId: incidenteId, Nivel: "ALEGACAO" }, "PROTECAO_PEDIDO_DE_AJUDA", null);
  const destinatarios = await destinatariosDaGestao(pool, { congregacaoId });
  const aviso = await notificarAgora(pool, { regraChave: "PROTECAO_INCIDENTE_NOVO", destinatarios, mensagem: pm.textoIncidenteNovo({ nivel: "ALEGACAO", prazoEm: prazo }), referenciaId: incidenteId, referenciaTabela: "IncidentesProtecao", aguardarEntrega: false, deps });
  return { sucesso: true, protocolo, avisados: aviso.criadas || 0, mensagem: pm.textoConfirmacaoDeAjuda() };
}

// ---------------------------------------------------------------
// Ler
// ---------------------------------------------------------------

async function meusIncidentes(pool, membroId) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT TOP 50 IncidenteId, Protocolo, Nivel, DataOcorrencia, Status, RegistradoEm FROM IncidentesProtecao WHERE RegistradoPorMembroId = @m ORDER BY IncidenteId DESC`);
  return r.recordset.map((x) => ({ protocolo: x.Protocolo, nivelRotulo: (pm.NIVEIS[x.Nivel] || {}).rotulo || x.Nivel, dataOcorrencia: pm.paraIso(x.DataOcorrencia), situacao: x.Status === "ENCERRADO" ? "Encerrado" : "Em andamento", registradoEm: iso(x.RegistradoEm) }));
}

async function listarIncidentes(pool, { ver, status = null, agora = new Date(), limite = 200 } = {}) {
  const rq = pool.request().input("viewer", sql.Int, ver.membroId);
  const filtro = status ? " WHERE i.Status = @status" : "";
  if (status) rq.input("status", sql.NVarChar(10), status);
  const r = await rq.query(`
    SELECT TOP 500 i.IncidenteId, i.Protocolo, i.Nivel, i.Origem, i.CongregacaoId, c.Nome AS CongregacaoNome, i.DataOcorrencia, i.ExigeComunicacao, i.PrazoNotificacaoEm, i.Status, i.RegistradoEm, i.EncerradoEm,
      (SELECT COUNT(*) FROM IncidenteComunicacoes k WHERE k.IncidenteId = i.IncidenteId) AS NComunicacoes,
      (SELECT COUNT(*) FROM IncidenteComunicacoes k WHERE k.IncidenteId = i.IncidenteId AND (k.ProtocoloExterno IS NOT NULL OR k.ReferenciaArquivo IS NOT NULL)) AS NComComprovante,
      (SELECT COUNT(*) FROM AnexosGenericos a WHERE a.Tabela = 'IncidentesProtecao' AND a.RegistroId = i.IncidenteId) AS NAnexos,
      (SELECT COUNT(*) FROM IncidenteEnvolvidos e WHERE e.IncidenteId = i.IncidenteId AND e.MembroId IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM IncidenteDecisoesCautelares d WHERE d.EnvolvidoId = e.EnvolvidoId)) AS NSemDecisao,
      CASE WHEN EXISTS (SELECT 1 FROM IncidenteEnvolvidos e WHERE e.IncidenteId = i.IncidenteId AND e.MembroId = @viewer) THEN 1 ELSE 0 END AS ViewerEnvolvido
    FROM IncidentesProtecao i LEFT JOIN Congregacoes c ON c.CongregacaoId = i.CongregacaoId${filtro} ORDER BY i.IncidenteId DESC`);
  const visiveis = r.recordset.filter((x) => !x.ViewerEnvolvido && (ver.geral || (x.CongregacaoNome && ver.podeVerCongregacao && ver.podeVerCongregacao(x.CongregacaoNome))));
  const itens = visiveis.map((x) => mapearResumo(x, agora));
  // o que pede ação primeiro: a comunicação mais urgente, depois os demais abertos, depois os encerrados
  const peso = (i) => (i.status === "ENCERRADO" ? 3 : i.relogio ? 0 : i.exigeComunicacao && !i.comunicado ? 0 : 1);
  itens.sort((a, b) => peso(a) - peso(b) || (peso(a) === 0 ? String(a.prazoEm).localeCompare(String(b.prazoEm)) : String(b.registradoEm).localeCompare(String(a.registradoEm))));
  return itens.slice(0, limite);
}

async function detalheIncidente(pool, incidenteId, { ver, agora = new Date() } = {}) {
  const achado = await incidenteVisivel(pool, incidenteId, ver);
  if (!achado) return null;
  const { incidente: i, envolvidos } = achado;
  const comunicacoes = await comunicacoesDe(pool, incidenteId);
  const nAnexos = await contarAnexos(pool, incidenteId);
  const relato = (await pool.request().input("id", sql.Int, incidenteId).query(`
    SELECT SUM(CASE WHEN Tipo = 'RELATO' THEN 1 ELSE 0 END) AS relatos, SUM(CASE WHEN Tipo = 'ADENDO' THEN 1 ELSE 0 END) AS adendos FROM IncidenteRelatos WHERE IncidenteId = @id`)).recordset[0];
  const decisoes = (await pool.request().input("id", sql.Int, incidenteId).query(`
    SELECT d.DecisaoId, d.EnvolvidoId, d.Decisao, d.Observacao, d.DecididaEm, r.Nome AS DecididaPorNome
    FROM IncidenteDecisoesCautelares d JOIN IncidenteEnvolvidos e ON e.EnvolvidoId = d.EnvolvidoId JOIN MembroReferencia r ON r.MembroId = d.DecididaPorMembroId WHERE e.IncidenteId = @id ORDER BY d.DecisaoId`)).recordset;
  const reclass = (await pool.request().input("id", sql.Int, incidenteId).query(`
    SELECT x.NivelAnterior, x.NivelNovo, x.Motivo, x.ReclassificadoEm, r.Nome AS PorNome FROM IncidenteReclassificacoes x JOIN MembroReferencia r ON r.MembroId = x.ReclassificadoPorMembroId WHERE x.IncidenteId = @id ORDER BY x.ReclassificacaoId`)).recordset;
  const leitura = ver.geral ? (await pool.request().input("id", sql.Int, incidenteId).query(`
    SELECT TOP 10 l.LidoEm, m.Nome FROM IncidenteLeituras l JOIN MembroReferencia m ON m.MembroId = l.MembroId WHERE l.IncidenteId = @id ORDER BY l.LeituraId DESC`)).recordset : [];

  const com = comunicacoes.map((c) => ({
    comunicacaoId: c.ComunicacaoId, orgao: c.Orgao, orgaoRotulo: pm.ORGAOS[c.Orgao] || c.Orgao, forma: c.Forma, formaRotulo: pm.FORMAS_COMUNICACAO[c.Forma] || c.Forma, comunicadoEm: iso(c.ComunicadoEm),
    protocoloExterno: c.ProtocoloExterno || null, referenciaArquivo: c.ReferenciaArquivo || null, observacao: c.Observacao || null, foraDoPrazo: !!c.ForaDoPrazo, registradoEm: iso(c.RegistradoEm), registradoPorNome: c.RegistradoPorNome
  }));
  const envMapeado = envolvidos.map((e) => ({
    envolvidoId: e.EnvolvidoId, membroId: e.MembroId || null, nome: e.Nome, ehMembro: !!e.MembroId,
    afastamentoCautelar: !!e.MembroId && i.Nivel === "ALEGACAO" && e.UltimaDecisao !== "LIBERADO", ultimaDecisao: e.UltimaDecisao || null, decisoes: Number(e.NDecisoes)
  }));
  const comprovante = com.some((c) => pm.temComprovante(c)) || nAnexos > 0;
  const encerrar = pm.podeEncerrar({ nivel: i.Nivel, status: i.Status }, com.map((c) => ({ protocoloExterno: c.protocoloExterno, referenciaArquivo: c.referenciaArquivo, temAnexo: nAnexos > 0 })),
    envolvidos.map((e) => ({ membroId: e.MembroId, nivelAlegacao: i.Nivel === "ALEGACAO", decisao: Number(e.NDecisoes) > 0 ? e.UltimaDecisao : null })));
  return {
    incidente: {
      ...mapearResumo({ ...i, NComunicacoes: com.length, NComComprovante: com.filter((c) => pm.temComprovante(c)).length, NAnexos: nAnexos, NSemDecisao: envMapeado.filter((e) => e.afastamentoCautelar && !e.decisoes && e.membroId).length }, agora),
      descricao: i.Descricao, onde: i.Onde || null, equipeNome: i.EquipeNome || null, relatadoPor: i.RelatadoPor || null, relatadoPorRotulo: pm.QUEM_RELATOU[i.RelatadoPor] || null,
      conhecidoEm: iso(i.ConhecidoEm), contatoCanal: ver.geral ? i.ContatoCanal || null : null, encerramento: i.Status === "ENCERRADO" ? { resultado: i.EncerramentoResultado, resultadoRotulo: pm.RESULTADOS_ENCERRAMENTO[i.EncerramentoResultado], providencia: i.EncerramentoProvidencia, em: iso(i.EncerradoEm) } : null
    },
    envolvidos: envMapeado, comunicacoes: com, anexos: nAnexos, comprovante,
    decisoes: ver.geral ? decisoes.map((d) => ({ envolvidoId: d.EnvolvidoId, decisao: d.Decisao, decisaoRotulo: pm.DECISOES_CAUTELAR[d.Decisao], observacao: d.Observacao, decididaEm: iso(d.DecididaEm), decididaPorNome: d.DecididaPorNome })) : [],
    reclassificacoes: reclass.map((x) => ({ de: x.NivelAnterior, para: x.NivelNovo, motivo: x.Motivo, em: iso(x.ReclassificadoEm), porNome: x.PorNome })),
    relato: { registrado: Number(relato.relatos) > 0, adendos: Number(relato.adendos) || 0 },
    leituras: leitura.map((l) => ({ nome: l.Nome, em: iso(l.LidoEm) })),
    acoes: {
      comunicar: i.Status === "ABERTO" && !!i.ExigeComunicacao, encerrar: !!ver.geral && i.Status === "ABERTO", reclassificar: i.Status === "ABERTO" && i.Nivel !== "ALEGACAO", decidirCautelar: !!ver.geral && i.Nivel === "ALEGACAO",
      adendo: i.Status === "ABERTO" && i.Nivel === "ALEGACAO"
    },
    encerramentoPossivel: encerrar
  };
}

// O relato é dado sensível de criança: cada leitura é registrada (quem e quando), nunca o conteúdo.
async function lerRelato(pool, incidenteId, { ver, deps } = {}) {
  const achado = await incidenteVisivel(pool, incidenteId, ver);
  if (!achado) return null;
  const linhas = (await pool.request().input("id", sql.Int, incidenteId).query(`SELECT Tipo, Texto, RegistradoEm FROM IncidenteRelatos WHERE IncidenteId = @id ORDER BY RelatoId`)).recordset;
  await pool.request().input("i", sql.Int, incidenteId).input("m", sql.Int, ver.membroId).query(`INSERT INTO IncidenteLeituras (IncidenteId, MembroId) VALUES (@i, @m)`);
  await auditar(achado.incidente, "PROTECAO_RELATO_LIDO", ver.membroId);
  return { relato: linhas.filter((l) => l.Tipo === "RELATO").map((l) => ({ texto: l.Texto, registradoEm: iso(l.RegistradoEm) }))[0] || null, adendos: linhas.filter((l) => l.Tipo === "ADENDO").map((l) => ({ texto: l.Texto, registradoEm: iso(l.RegistradoEm) })) };
}

// ---------------------------------------------------------------
// Agir sobre o incidente
// ---------------------------------------------------------------

async function registrarComunicacao(pool, { incidenteId, dados, ver, agora = new Date() }) {
  const achado = await incidenteVisivel(pool, incidenteId, ver);
  if (!achado) return { sucesso: false, naoExiste: true };
  const i = achado.incidente;
  if (i.Status !== "ABERTO") return { sucesso: false, mensagem: "Este incidente já foi encerrado." };
  if (!i.ExigeComunicacao) return { sucesso: false, mensagem: "Este incidente não exige comunicação ao Conselho Tutelar. Se ele virou uma suspeita de violência, reclassifique-o primeiro." };
  const v = pm.validarComunicacaoExterna(dados, { agora, conhecidoEm: i.ConhecidoEm });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const x = v.dados;
  const fora = pm.foraDoPrazo(x.comunicadoEm, i.PrazoNotificacaoEm);
  const ins = await pool.request().input("i", sql.Int, incidenteId).input("o", sql.NVarChar(20), x.orgao).input("f", sql.NVarChar(16), x.forma).input("c", sql.DateTime2, x.comunicadoEm).input("p", sql.NVarChar(60), x.protocoloExterno)
    .input("a", sql.NVarChar(200), x.referenciaArquivo).input("ob", sql.NVarChar(300), x.observacao).input("fp", sql.Bit, fora ? 1 : 0).input("r", sql.Int, ver.membroId)
    .query(`INSERT INTO IncidenteComunicacoes (IncidenteId, Orgao, Forma, ComunicadoEm, ProtocoloExterno, ReferenciaArquivo, Observacao, ForaDoPrazo, RegistradoPorMembroId)
            SELECT @i, @o, @f, @c, @p, @a, @ob, @fp, @r WHERE EXISTS (SELECT 1 FROM IncidentesProtecao WITH (UPDLOCK, HOLDLOCK) WHERE IncidenteId = @i AND Status = 'ABERTO')`);
  if (!ins.rowsAffected || !ins.rowsAffected[0]) return { sucesso: false, mensagem: "Este incidente já foi encerrado." };
  await auditar(i, "PROTECAO_COMUNICACAO_REGISTRADA", ver.membroId, { foraDoPrazo: fora });
  const comprovante = pm.temComprovante(x) || (await contarAnexos(pool, incidenteId)) > 0;
  return {
    sucesso: true, foraDoPrazo: fora, comprovante,
    mensagem: `Comunicação registrada${fora ? ", mas FORA do prazo de 24 horas (isso fica no relatório do Comitê)" : " dentro do prazo"}.${comprovante ? "" : " Falta o comprovante (protocolo do órgão, onde o papel está guardado ou o arquivo anexado): o caso não encerra sem ele."}`
  };
}

async function adicionarAdendo(pool, { incidenteId, texto, ver }) {
  const achado = await incidenteVisivel(pool, incidenteId, ver);
  if (!achado) return { sucesso: false, naoExiste: true };
  const i = achado.incidente;
  if (i.Status !== "ABERTO" || i.Nivel !== "ALEGACAO") return { sucesso: false, mensagem: "O adendo é para uma suspeita de violência ainda aberta." };
  const t = typeof texto === "string" ? texto.trim() : "";
  if (t.length < 10 || t.length > MAX_ADENDO || /[<>]/.test(t)) return { sucesso: false, mensagem: `Registre só o que a criança disse por conta própria, com as palavras dela (de 10 a ${MAX_ADENDO} caracteres, sem < ou >). Não faça novas perguntas para obter mais.` };
  const n = Number((await pool.request().input("i", sql.Int, incidenteId).query(`SELECT COUNT(*) AS n FROM IncidenteRelatos WHERE IncidenteId = @i AND Tipo = 'ADENDO'`)).recordset[0].n);
  if (n >= MAX_ADENDOS) return { sucesso: false, mensagem: `Já há ${MAX_ADENDOS} adendos. Repetir a escuta machuca de novo: o que for novo deve ir direto às autoridades.` };
  const insA = await pool.request().input("i", sql.Int, incidenteId).input("t", sql.NVarChar(4000), t).input("r", sql.Int, ver.membroId).query(`
    INSERT INTO IncidenteRelatos (IncidenteId, Tipo, Texto, RegistradoPorMembroId)
    SELECT @i, 'ADENDO', @t, @r WHERE EXISTS (SELECT 1 FROM IncidentesProtecao WITH (UPDLOCK, HOLDLOCK) WHERE IncidenteId = @i AND Status = 'ABERTO')
      AND (SELECT COUNT(*) FROM IncidenteRelatos WITH (UPDLOCK, HOLDLOCK) WHERE IncidenteId = @i AND Tipo = 'ADENDO') < ${MAX_ADENDOS}`);
  if (!insA.rowsAffected || !insA.rowsAffected[0]) return { sucesso: false, mensagem: "O incidente foi encerrado ou já tem o máximo de adendos. Repetir a escuta machuca de novo: o que for novo deve ir direto às autoridades." };
  await auditar(i, "PROTECAO_ADENDO_REGISTRADO", ver.membroId);
  return { sucesso: true, mensagem: "Adendo registrado." };
}

async function reclassificarIncidente(pool, { incidenteId, dados, ver, agora = new Date(), deps }) {
  const achado = await incidenteVisivel(pool, incidenteId, ver);
  if (!achado) return { sucesso: false, naoExiste: true };
  const i = achado.incidente;
  if (i.Status !== "ABERTO") return { sucesso: false, mensagem: "Este incidente já foi encerrado." };
  const v = pm.validarReclassificacao(dados, { nivelAtual: i.Nivel, agora });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const x = v.dados;
  const exige = pm.NIVEL_EXIGE_COMUNICACAO[x.nivelNovo];
  const prazo = exige ? pm.prazoNotificacao(x.conhecidoEm) : null;
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const rq = new sql.Request(transaction).input("id", sql.Int, incidenteId).input("n", sql.NVarChar(16), x.nivelNovo).input("x", sql.Bit, exige ? 1 : (i.ExigeComunicacao ? 1 : 0))
      .input("pz", sql.DateTime2, exige && !i.ExigeComunicacao ? prazo : i.PrazoNotificacaoEm).input("rp", sql.NVarChar(16), i.RelatadoPor || x.relatadoPor);
    const u = await rq.query(`UPDATE IncidentesProtecao SET Nivel = @n, ExigeComunicacao = @x, PrazoNotificacaoEm = @pz, RelatadoPor = @rp WHERE IncidenteId = @id AND Status = 'ABERTO' AND Nivel <> @n`);
    if (!u.rowsAffected || !u.rowsAffected[0]) { await fecharTransacao(transaction, false); return { sucesso: false, mensagem: "O incidente mudou enquanto você registrava. Abra-o de novo." }; }
    await new sql.Request(transaction).input("i", sql.Int, incidenteId).input("a", sql.NVarChar(16), i.Nivel).input("n", sql.NVarChar(16), x.nivelNovo).input("m", sql.NVarChar(300), x.motivo).input("r", sql.Int, ver.membroId)
      .query(`INSERT INTO IncidenteReclassificacoes (IncidenteId, NivelAnterior, NivelNovo, Motivo, ReclassificadoPorMembroId) VALUES (@i, @a, @n, @m, @r)`);
    if (x.relato) {
      const jaTem = (await new sql.Request(transaction).input("i", sql.Int, incidenteId).query(`SELECT COUNT(*) AS n FROM IncidenteRelatos WHERE IncidenteId = @i AND Tipo = 'RELATO'`)).recordset[0].n > 0;
      await new sql.Request(transaction).input("i", sql.Int, incidenteId).input("t", sql.NVarChar(4000), x.relato).input("r", sql.Int, ver.membroId).input("tp", sql.NVarChar(8), jaTem ? "ADENDO" : "RELATO")
        .query(`INSERT INTO IncidenteRelatos (IncidenteId, Tipo, Texto, RegistradoPorMembroId) VALUES (@i, @tp, @t, @r)`);
    }
    await transaction.commit();
  } catch (e) { await fecharTransacao(transaction, false); throw e; }
  await auditar({ IncidenteId: incidenteId, Nivel: x.nivelNovo }, "PROTECAO_INCIDENTE_RECLASSIFICADO", ver.membroId, { de: i.Nivel, para: x.nivelNovo });
  let escalasDesmarcadas = null;
  const envMembros = achado.envolvidos.filter((e) => e.MembroId).map((e) => e.MembroId);
  if (x.nivelNovo === "ALEGACAO") for (const m of envMembros) escalasDesmarcadas = (escalasDesmarcadas || 0) + ((await afastarDasEscalas(pool, m)) || 0);
  const destinatarios = await destinatariosDaGestao(pool, { congregacaoId: i.CongregacaoId, excluirMembroIds: envMembros });
  const prazoEfetivo = prazo || i.PrazoNotificacaoEm;
  const aviso = await notificarAgora(pool, { regraChave: "PROTECAO_INCIDENTE_NOVO", destinatarios, mensagem: pm.textoIncidenteNovo({ nivel: x.nivelNovo, prazoEm: prazoEfetivo }), referenciaId: 1000000 + incidenteId, referenciaTabela: "IncidentesProtecao", aguardarEntrega: false, deps });
  return {
    sucesso: true, nivel: x.nivelNovo, prazoEm: exige ? iso(prazoEfetivo) : null, escalasDesmarcadas, avisados: aviso.criadas || 0,
    mensagem: exige ? "Incidente reclassificado como suspeita de violência: o prazo de 24 horas para comunicar o Conselho Tutelar começou a contar agora." : "Incidente reclassificado."
  };
}

async function decidirCautelar(pool, { incidenteId, envolvidoId, dados, ver, deps }) {
  const achado = await incidenteVisivel(pool, incidenteId, ver);
  if (!achado) return { sucesso: false, naoExiste: true };
  const i = achado.incidente;
  const e = achado.envolvidos.find((x) => Number(x.EnvolvidoId) === Number(envolvidoId));
  if (!e || !e.MembroId || i.Nivel !== "ALEGACAO") return { sucesso: false, naoExiste: true };
  const v = pm.validarDecisaoCautelar(dados, { atorId: ver.membroId, membroId: e.MembroId });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  await pool.request().input("e", sql.Int, e.EnvolvidoId).input("d", sql.NVarChar(18), v.dados.decisao).input("o", sql.NVarChar(300), v.dados.observacao).input("p", sql.Int, ver.membroId)
    .query(`INSERT INTO IncidenteDecisoesCautelares (EnvolvidoId, Decisao, Observacao, DecididaPorMembroId) VALUES (@e, @d, @o, @p)`);
  await auditar(i, "PROTECAO_CAUTELAR_DECIDIDA", ver.membroId);
  let escalas = null;
  if (v.dados.decisao === "MANTIDO_AFASTADO") escalas = await afastarDasEscalas(pool, e.MembroId);
  else {
    const m = (await pool.request().input("id", sql.Int, e.MembroId).query(`SELECT MembroId, Nome, Email FROM MembroReferencia WHERE MembroId = @id`)).recordset[0];
    if (m) await notificarAgora(pool, { regraChave: "PROTECAO_AFASTAMENTO_PESSOA", destinatarios: [destinatarioDe(m)], mensagem: pm.textoCautelarLevantada(), referenciaId: Number(e.EnvolvidoId) * 100 + Number(e.NDecisoes) + 1, referenciaTabela: "IncidenteDecisoesCautelares", deps });
  }
  return { sucesso: true, decisao: v.dados.decisao, escalasDesmarcadas: escalas, mensagem: v.dados.decisao === "LIBERADO" ? "Afastamento levantado. A pessoa só volta às escalas com menores se a habilitação dela estiver em dia." : "Afastamento mantido." };
}

async function encerrarIncidente(pool, { incidenteId, dados, ver }) {
  const achado = await incidenteVisivel(pool, incidenteId, ver);
  if (!achado) return { sucesso: false, naoExiste: true };
  const i = achado.incidente;
  const v = pm.validarEncerramento(dados, { nivel: i.Nivel });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const comunicacoes = await comunicacoesDe(pool, incidenteId);
  const temAnexo = (await contarAnexos(pool, incidenteId)) > 0;
  const regra = pm.podeEncerrar({ nivel: i.Nivel, status: i.Status },
    comunicacoes.map((c) => ({ protocoloExterno: c.ProtocoloExterno, referenciaArquivo: c.ReferenciaArquivo, temAnexo })),
    achado.envolvidos.map((e) => ({ membroId: e.MembroId, nivelAlegacao: i.Nivel === "ALEGACAO", decisao: Number(e.NDecisoes) > 0 ? e.UltimaDecisao : null })));
  if (!regra.ok) return { sucesso: false, mensagem: regra.motivos.join(" "), motivos: regra.motivos };
  const u = await pool.request().input("id", sql.Int, incidenteId).input("p", sql.Int, ver.membroId).input("r", sql.NVarChar(24), v.dados.resultado).input("pv", sql.NVarChar(500), v.dados.providencia)
    .query(`UPDATE IncidentesProtecao SET Status = 'ENCERRADO', EncerradoEm = SYSUTCDATETIME(), EncerradoPorMembroId = @p, EncerramentoResultado = @r, EncerramentoProvidencia = @pv WHERE IncidenteId = @id AND Status = 'ABERTO'`);
  if (!u.rowsAffected || !u.rowsAffected[0]) return { sucesso: false, mensagem: "Este incidente já foi encerrado." };
  await auditar(i, "PROTECAO_INCIDENTE_ENCERRADO", ver.membroId, { resultado: v.dados.resultado });
  return { sucesso: true, mensagem: "Incidente encerrado. O registro fica guardado." };
}

// ---------------------------------------------------------------
// O Comitê, os padrões e o relatório anual
// ---------------------------------------------------------------

async function comiteComposicao(pool) {
  const r = await pool.request().input("papel", sql.NVarChar(80), PAPEL_COMITE).query(`
    SELECT DISTINCT m.MembroId, m.Nome, m.CargoMinisterial FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId JOIN MembroReferencia m ON m.MembroId = l.MembroId
    WHERE p.Nome = @papel AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE)) ORDER BY m.Nome`);
  const membros = r.recordset.map((x) => ({ membroId: x.MembroId, nome: x.Nome, cargoMinisterial: x.CargoMinisterial }));
  const avaliacao = pm.avaliarComposicao(membros);
  return { papel: PAPEL_COMITE, membros: membros.map((m) => ({ membroId: m.membroId, nome: m.nome, clerigo: pm.ehClerigo(m.cargoMinisterial) })), avaliacao };
}

async function eventosDeQuebras(pool, { hoje }) {
  const r = await pool.request().query(`
    SELECT i.IncidenteId, i.Nivel, i.EquipeId, i.DataOcorrencia, (SELECT TOP 1 e.MembroId FROM IncidenteEnvolvidos e WHERE e.IncidenteId = i.IncidenteId AND e.MembroId IS NOT NULL ORDER BY e.EnvolvidoId) AS EnvolvidoMembroId
    FROM IncidentesProtecao i WHERE i.Nivel IN ('QUASE_ACIDENTE', 'QUEBRA_POLITICA') AND i.DataOcorrencia >= DATEADD(DAY, -${pm.JANELA_PADRAO_DIAS + 1}, CAST(SYSUTCDATETIME() AS DATE))`);
  return r.recordset.map((x) => ({ incidenteId: x.IncidenteId, nivel: x.Nivel, equipeId: x.EquipeId, envolvidoMembroId: x.EnvolvidoMembroId, data: pm.paraIso(x.DataOcorrencia) }));
}
async function padroes(pool, { hoje = hojeBrasilia() } = {}) {
  const achados = pm.padraoDeQuebras(await eventosDeQuebras(pool, { hoje }), { hoje });
  if (!achados.length) return [];
  const nomesEquipe = new Map((await pool.request().query(`SELECT q.EquipeId, q.Nome, c.Nome AS CongregacaoNome FROM EscalasEquipes q JOIN Congregacoes c ON c.CongregacaoId = q.CongregacaoId`)).recordset.map((x) => [x.EquipeId, `${x.Nome} (${x.CongregacaoNome})`]));
  const nomesPessoa = new Map((await pool.request().query(`SELECT MembroId, Nome FROM MembroReferencia`)).recordset.map((x) => [x.MembroId, x.Nome]));
  return achados.map((a) => ({ ...a, nome: a.tipo === "EQUIPE" ? nomesEquipe.get(a.id) || `Equipe ${a.id}` : nomesPessoa.get(a.id) || `Matrícula ${a.id}` }));
}

// Por congregação, no ano: quantos incidentes de cada nível, quantas suspeitas foram comunicadas dentro das 24 horas, quanto tempo levou, quantos afastamentos seguem ativos.
async function relatorioAnual(pool, { ano, agora = new Date() } = {}) {
  const a = Number.isInteger(ano) && ano >= 2024 && ano <= 2100 ? ano : Number(hojeBrasilia(agora).slice(0, 4));
  const r = await pool.request().input("ano", sql.Int, a).query(`
    SELECT i.IncidenteId, i.Nivel, i.Status, i.ExigeComunicacao, i.ConhecidoEm, c.Nome AS CongregacaoNome,
      (SELECT MIN(k.ComunicadoEm) FROM IncidenteComunicacoes k WHERE k.IncidenteId = i.IncidenteId) AS PrimeiraComunicacao,
      (SELECT COUNT(*) FROM IncidenteComunicacoes k WHERE k.IncidenteId = i.IncidenteId AND k.ForaDoPrazo = 0) AS NNoPrazo
    FROM IncidentesProtecao i LEFT JOIN Congregacoes c ON c.CongregacaoId = i.CongregacaoId WHERE YEAR(i.RegistradoEm) = @ano`);
  const cautelaresAtivos = Number((await pool.request().query(`
    SELECT COUNT(DISTINCT e.MembroId) AS n FROM IncidenteEnvolvidos e JOIN IncidentesProtecao i ON i.IncidenteId = e.IncidenteId
    WHERE e.MembroId IS NOT NULL AND i.Nivel = 'ALEGACAO' AND ISNULL((SELECT TOP 1 d.Decisao FROM IncidenteDecisoesCautelares d WHERE d.EnvolvidoId = e.EnvolvidoId ORDER BY d.DecisaoId DESC), 'MANTIDO_AFASTADO') <> 'LIBERADO'`)).recordset[0].n);
  const por = new Map();
  const linha = (nome) => { if (!por.has(nome)) por.set(nome, { congregacaoNome: nome, quaseAcidentes: 0, quebrasDePolitica: 0, suspeitasDeViolencia: 0, abertos: 0, suspeitasComunicadasNoPrazo: 0, suspeitasForaDoPrazoOuSemComunicacao: 0, horasAteComunicar: [] }); return por.get(nome); };
  for (const x of r.recordset) {
    const l = linha(x.CongregacaoNome || "Sem congregação definida (canal de ajuda)");
    if (x.Nivel === "QUASE_ACIDENTE") l.quaseAcidentes++; else if (x.Nivel === "QUEBRA_POLITICA") l.quebrasDePolitica++; else l.suspeitasDeViolencia++;
    if (x.Status === "ABERTO") l.abertos++;
    if (x.ExigeComunicacao) {
      if (Number(x.NNoPrazo) > 0) l.suspeitasComunicadasNoPrazo++; else l.suspeitasForaDoPrazoOuSemComunicacao++;
      if (x.PrimeiraComunicacao) l.horasAteComunicar.push((new Date(x.PrimeiraComunicacao).getTime() - new Date(x.ConhecidoEm).getTime()) / 3600000);
    }
  }
  const porCongregacao = [...por.values()].map((l) => {
    const h = l.horasAteComunicar;
    const { horasAteComunicar, ...resto } = l;
    return { ...resto, horasMediasAteComunicar: h.length ? Math.round((h.reduce((s, n) => s + Math.max(0, n), 0) / h.length) * 10) / 10 : null };
  }).sort((x, y) => String(x.congregacaoNome).localeCompare(String(y.congregacaoNome), "pt-BR"));
  const total = porCongregacao.reduce((t, l) => ({
    quaseAcidentes: t.quaseAcidentes + l.quaseAcidentes, quebrasDePolitica: t.quebrasDePolitica + l.quebrasDePolitica, suspeitasDeViolencia: t.suspeitasDeViolencia + l.suspeitasDeViolencia, abertos: t.abertos + l.abertos,
    suspeitasComunicadasNoPrazo: t.suspeitasComunicadasNoPrazo + l.suspeitasComunicadasNoPrazo, suspeitasForaDoPrazoOuSemComunicacao: t.suspeitasForaDoPrazoOuSemComunicacao + l.suspeitasForaDoPrazoOuSemComunicacao
  }), { quaseAcidentes: 0, quebrasDePolitica: 0, suspeitasDeViolencia: 0, abertos: 0, suspeitasComunicadasNoPrazo: 0, suspeitasForaDoPrazoOuSemComunicacao: 0 });
  let habilitacao = [];
  try { habilitacao = (await require("./ministerioMenoresDb").painel(pool, { congregacaoIds: null, reservado: false })).porCongregacao || []; } catch (e) { habilitacao = []; }
  return { ano: a, geradoEm: agora.toISOString(), total: { ...total, afastamentosCautelaresAtivos: cautelaresAtivos }, porCongregacao, comite: await comiteComposicao(pool), habilitacaoPorCongregacao: habilitacao };
}

// ---------------------------------------------------------------
// Detectores do motor de avisos (a rotina diária e a horária)
// ---------------------------------------------------------------

// O relógio: suspeitas ainda sem comunicação em 12 h, 4 h e vencidas (a cada 6 h). Para de avisar quando a comunicação é registrada.
async function detectarPrazos(pool, { agora = new Date() } = {}) {
  const r = await pool.request().query(`
    SELECT i.IncidenteId, i.CongregacaoId, i.PrazoNotificacaoEm FROM IncidentesProtecao i
    WHERE i.Status = 'ABERTO' AND i.ExigeComunicacao = 1 AND NOT EXISTS (SELECT 1 FROM IncidenteComunicacoes k WHERE k.IncidenteId = i.IncidenteId)`);
  const fatos = [];
  for (const x of r.recordset) {
    const etapa = pm.etapaDeAviso(x.PrazoNotificacaoEm, agora);
    if (!etapa) continue;
    const env = (await pool.request().input("id", sql.Int, x.IncidenteId).query(`SELECT MembroId FROM IncidenteEnvolvidos WHERE IncidenteId = @id AND MembroId IS NOT NULL`)).recordset.map((e) => e.MembroId);
    const dest = await destinatariosDaGestao(pool, { congregacaoId: x.CongregacaoId, excluirMembroIds: env });
    // vencido há mais de 12 horas: o aviso sobe para a Diretoria e o Comitê (o Dirigente local já foi avisado várias vezes)
    const destinatarios = etapa.codigo.startsWith("VENCIDO_") && etapa.bloco >= 5 ? await destinatariosGeraisDaDiretoria(pool, env) : dest;
    fatos.push({ referenciaId: pm.referenciaDoAviso(x.IncidenteId, etapa.bloco), fatoGerador: pm.textoPrazo({ etapa: etapa.codigo, prazoEm: x.PrazoNotificacaoEm }), destinatarios });
  }
  return fatos;
}
// A rede de segurança do aviso imediato: incidentes das últimas 48 horas cujo aviso não saiu (e-mail fora do ar, falha momentânea) são avisados de novo; o motor não duplica.
async function detectarIncidentesNovos(pool, { agora = new Date() } = {}) {
  const r = await pool.request().query(`SELECT IncidenteId, Nivel, CongregacaoId, PrazoNotificacaoEm FROM IncidentesProtecao WHERE Status = 'ABERTO' AND RegistradoEm >= DATEADD(HOUR, -48, SYSUTCDATETIME())`);
  const fatos = [];
  for (const x of r.recordset) {
    const env = (await pool.request().input("id", sql.Int, x.IncidenteId).query(`SELECT MembroId FROM IncidenteEnvolvidos WHERE IncidenteId = @id AND MembroId IS NOT NULL`)).recordset.map((e) => e.MembroId);
    fatos.push({ referenciaId: x.IncidenteId, fatoGerador: pm.textoIncidenteNovo({ nivel: x.Nivel, prazoEm: x.PrazoNotificacaoEm }), destinatarios: await destinatariosDaGestao(pool, { congregacaoId: x.CongregacaoId, excluirMembroIds: env }) });
  }
  return fatos;
}
async function detectarPadroes(pool, { hoje = hojeBrasilia() } = {}) {
  const lista = await padroes(pool, { hoje });
  if (!lista.length) return [];
  const dest = await destinatariosGeraisDaDiretoria(pool);
  return lista.map((p) => ({ referenciaId: pm.referenciaDoPadrao(p.tipo, p.id, p.total), fatoGerador: pm.textoPadrao({ tipo: p.tipo, total: p.total }), destinatarios: dest }));
}
// Uma vez por semana, enquanto o Comitê estiver incompleto.
async function detectarComiteIncompleto(pool, { hoje = hojeBrasilia() } = {}) {
  const c = await comiteComposicao(pool);
  if (c.avaliacao.ok) return [];
  const [a, m, d] = hoje.split("-").map(Number);
  const semana = Math.floor(Date.UTC(a, m - 1, d) / (7 * 86400000));
  return [{ referenciaId: semana, fatoGerador: pm.textoComiteIncompleto({ problemas: c.avaliacao.problemas }), destinatarios: await destinatariosGeraisDaDiretoria(pool) }];
}
// Afastamento sem decisão do Comitê: primeiro aviso em 3 dias, depois toda semana.
async function detectarCautelarSemDecisao(pool, { agora = new Date() } = {}) {
  const r = await pool.request().query(`
    SELECT e.EnvolvidoId, e.MembroId, i.RegistradoEm FROM IncidenteEnvolvidos e JOIN IncidentesProtecao i ON i.IncidenteId = e.IncidenteId
    WHERE e.MembroId IS NOT NULL AND i.Nivel = 'ALEGACAO' AND NOT EXISTS (SELECT 1 FROM IncidenteDecisoesCautelares d WHERE d.EnvolvidoId = e.EnvolvidoId)`);
  const fatos = [];
  for (const x of r.recordset) {
    const dias = Math.floor((agora.getTime() - new Date(x.RegistradoEm).getTime()) / 86400000);
    if (dias < CAUTELAR_LEMBRETE_DIAS) continue;
    const semanas = Math.floor((dias - CAUTELAR_LEMBRETE_DIAS) / 7);
    fatos.push({ referenciaId: Number(x.EnvolvidoId) * 100 + Math.min(semanas, 99), fatoGerador: pm.textoCautelarSemDecisao({ dias }), destinatarios: await destinatariosGeraisDaDiretoria(pool, [x.MembroId]) });
  }
  return fatos;
}

module.exports = {
  PERMISSAO, PAPEL_COMITE, LIMITE_REGISTROS_DIA, LIMITE_ALEGACOES_DIA, LIMITE_CANAL_HORA, MAX_ADENDOS,
  destinatariosDaGestao, visivelPara, incidenteVisivel, carregarIncidente, contarRegistrosRecentes,
  registrarIncidente, registrarPedidoDeAjuda, meusIncidentes, listarIncidentes, detalheIncidente, lerRelato,
  registrarComunicacao, adicionarAdendo, reclassificarIncidente, decidirCautelar, encerrarIncidente,
  comiteComposicao, padroes, relatorioAnual,
  detectarPrazos, detectarIncidentesNovos, detectarPadroes, detectarComiteIncompleto, detectarCautelarSemDecisao
};
