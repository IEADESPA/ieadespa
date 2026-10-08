// shared/setoresTecnicosDb.js (v7.6 — Setores Técnicos, voluntariado profissional)
//
// A parte com banco. Toda decisão de regra (Termo, validações, quem pode o quê, textos) está em shared/setoresTecnicos.js, pura e testada; aqui só se
// carrega, se chama a regra e se grava, com auditoria. Funções devolvem { sucesso, mensagem, ... }; recusa de regra é sucesso:false (a rota a mostra como
// 422); `proibido:true` vira 403. Nenhum texto livre (justificativa, observação, formação) vai para a trilha de auditoria, que é imutável: ali ficam só os
// códigos e o tamanho do texto — e o IP do aceite fica só na tabela da adesão.
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const { hojeBrasilia } = require("./dataBrasilia");
const cal = require("./calendario");
const vol = require("./voluntariado");
const st = require("./setoresTecnicos");
const canaisDb = require("./canaisDb");

const { isoInstante, lerPrazoDias, notificarAgora } = canaisDb;
const limpar = (v) => String(v == null ? "" : v).trim();
const isoData = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const duplicado = (e) => e && (e.number === 2601 || e.number === 2627);
const VIGENTES_SQL = "'CANDIDATO','AGUARDANDO_TERMO','ATIVO'";
const MAX_IN = 1000;

function listaIn(request, prefixo, valores, tipo = sql.Int) {
  return valores.map((v, i) => { request.input(`${prefixo}${i}`, tipo, v); return `@${prefixo}${i}`; }).join(", ");
}
async function fecharTransacao(transaction, ok) {
  try { if (ok) await transaction.commit(); else await transaction.rollback(); } catch { /* já encerrada */ }
}
// Dias desde 01/01/2026: dá a chave de um aviso diário (a deduplicação do motor é por regra, destinatário e referência).
const diaDoAviso = (hoje) => cal.diasEntre("2026-01-01", hoje);
const diasDesde = (instante, hoje) => Math.max(0, cal.diasEntre(isoData(instante), hoje));

async function lerMembro(pool, membroId) {
  const r = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT m.MembroId, m.Nome, m.Email, m.DataNascimento, m.Status, m.SituacaoMembro, m.CongregacaoId, c.Nome AS CongregacaoNome
    FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @id`);
  return r.recordset[0] || null;
}
const condicaoDoMembro = (m, hoje) => st.condicaoParaServir(m && { Status: m.Status, SituacaoMembro: m.SituacaoMembro, idade: vol.idadeEmAnos(m.DataNascimento, hoje) });

// ---------------------------------------------------------------
// Catálogo (Art. 52)
// ---------------------------------------------------------------

function mapearSetor(r) {
  return {
    setorId: r.SetorId, codigo: r.Codigo, inciso: r.Inciso || null, nome: r.Nome, competencia: r.Competencia, profissoes: r.Profissoes || null,
    conselhoClasse: r.ConselhoClasse || null, exigeRegistro: !!r.ExigeRegistro, podeInterditar: !!r.PodeInterditar, podeSolicitarRemocao: !!r.PodeSolicitarRemocao,
    ativo: !!r.Ativo, ordem: r.Ordem
  };
}
// O que a linha do setor diz ao Termo (as marcas que escolhem as cláusulas próprias).
const setorParaTermo = (s) => ({ codigo: s.codigo, nome: s.nome, podeInterditar: s.podeInterditar, podeSolicitarRemocao: s.podeSolicitarRemocao });

async function buscarSetor(pool, setorId) {
  const r = await pool.request().input("id", sql.Int, setorId).query(`SELECT * FROM SetoresTecnicos WHERE SetorId = @id`);
  return r.recordset[0] ? mapearSetor(r.recordset[0]) : null;
}

// Quem lê o catálogo vê o setor e QUANTOS profissionais servem nele — nunca quem são (isso é da administração). Setor sem profissional não é "instalado"
// (Art. 48 §2º: onde não houver profissionais, não haverá o setor).
async function listarCatalogo(pool, { todos = false } = {}) {
  const r = await pool.request().input("todos", sql.Bit, todos ? 1 : 0).query(`
    SELECT s.*,
      (SELECT COUNT(*) FROM SetoresTecnicosMembros v WHERE v.SetorId = s.SetorId AND v.Status = 'ATIVO') AS Profissionais,
      (SELECT COUNT(*) FROM SetoresTecnicosMembros v WHERE v.SetorId = s.SetorId AND v.Status IN ('CANDIDATO','AGUARDANDO_TERMO')) AS EmAnalise
    FROM SetoresTecnicos s WHERE @todos = 1 OR s.Ativo = 1 ORDER BY s.Ordem, s.Nome`);
  return r.recordset.map(x => ({
    ...mapearSetor(x), profissionais: Number(x.Profissionais), emAnalise: Number(x.EmAnalise), instalado: Number(x.Profissionais) > 0,
    situacao: Number(x.Profissionais) > 0 ? "INSTALADO" : "SEM_PROFISSIONAIS"
  }));
}

async function criarSetor(pool, { dados, por }) {
  const v = st.validarSetor(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const codigo = st.gerarCodigoSetor(v.dados.nome);
  if (!codigo) return { sucesso: false, mensagem: "O nome do setor precisa ter pelo menos 3 letras ou números." };
  let id;
  try {
    const r = await pool.request().input("c", sql.NVarChar(30), codigo).input("i", sql.NVarChar(6), v.dados.inciso).input("n", sql.NVarChar(100), v.dados.nome)
      .input("comp", sql.NVarChar(600), v.dados.competencia).input("p", sql.NVarChar(200), v.dados.profissoes).input("cc", sql.NVarChar(60), v.dados.conselhoClasse)
      .input("er", sql.Bit, v.dados.exigeRegistro ? 1 : 0).input("pi", sql.Bit, v.dados.podeInterditar ? 1 : 0).input("pr", sql.Bit, v.dados.podeSolicitarRemocao ? 1 : 0).input("o", sql.Int, v.dados.ordem)
      .query(`INSERT INTO SetoresTecnicos (Codigo, Inciso, Nome, Competencia, Profissoes, ConselhoClasse, ExigeRegistro, PodeInterditar, PodeSolicitarRemocao, Ordem)
              VALUES (@c, @i, @n, @comp, @p, @cc, @er, @pi, @pr, @o); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`);
    id = r.recordset[0].id;
  } catch (e) {
    if (duplicado(e)) return { sucesso: false, mensagem: "Já existe um setor com esse nome (ou muito parecido). Escolha outro nome." };
    throw e;
  }
  await registrarAuditoria({ tabela: "SetoresTecnicos", registroId: id, acao: "SETOR_CRIADO", usuarioId: por, dadosDepois: { codigo, nome: v.dados.nome, exigeRegistro: v.dados.exigeRegistro, podeInterditar: v.dados.podeInterditar, podeSolicitarRemocao: v.dados.podeSolicitarRemocao } });
  return { sucesso: true, mensagem: `Setor “${v.dados.nome}” criado.`, setor: await buscarSetor(pool, id) };
}

async function editarSetor(pool, { setorId, dados, por }) {
  const atual = await buscarSetor(pool, setorId);
  if (!atual) return { sucesso: false, mensagem: "Setor não encontrado." };
  // O campo que a edição não mandou MANTÉM o valor atual (mandar só nome e competência não desarma as marcas).
  const v = st.validarSetor(st.mesclarEdicaoDoSetor(atual, dados));
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const d = v.dados;
  // Dar o PODER (interditar, pedir remoção) a um setor que já tem gente servindo faria quem já aceitou o Termo ganhar um poder cuja cláusula nunca leu (Art. 49 §2º: só o
  // vínculo ativo COM o Termo aceito dá os poderes). A administração encerra os vínculos e indica de novo: o Termo novo traz a cláusula. Tirar o poder é sempre livre.
  if ((d.podeInterditar && !atual.podeInterditar) || (d.podeSolicitarRemocao && !atual.podeSolicitarRemocao)) {
    const n = (await pool.request().input("s", sql.Int, setorId).query(`SELECT COUNT(*) AS n FROM SetoresTecnicosMembros WHERE SetorId = @s AND Status = 'ATIVO'`)).recordset[0];
    if (Number(n.n) > 0) return { sucesso: false, mensagem: `Este setor já tem ${n.n} pessoa(s) servindo, e elas aceitaram um Termo sem a cláusula deste poder. Encerre os vínculos atuais e indique as pessoas de novo: o Termo novo traz a cláusula e só então o poder vale.` };
  }
  await pool.request().input("id", sql.Int, setorId).input("n", sql.NVarChar(100), d.nome).input("i", sql.NVarChar(6), d.inciso).input("comp", sql.NVarChar(600), d.competencia)
    .input("p", sql.NVarChar(200), d.profissoes).input("cc", sql.NVarChar(60), d.conselhoClasse).input("er", sql.Bit, d.exigeRegistro ? 1 : 0)
    .input("pi", sql.Bit, d.podeInterditar ? 1 : 0).input("pr", sql.Bit, d.podeSolicitarRemocao ? 1 : 0).input("o", sql.Int, d.ordem)
    .query(`UPDATE SetoresTecnicos SET Nome = @n, Inciso = @i, Competencia = @comp, Profissoes = @p, ConselhoClasse = @cc, ExigeRegistro = @er, PodeInterditar = @pi, PodeSolicitarRemocao = @pr, Ordem = @o WHERE SetorId = @id`);
  await registrarAuditoria({ tabela: "SetoresTecnicos", registroId: setorId, acao: "SETOR_EDITADO", usuarioId: por,
    dadosAntes: { nome: atual.nome, exigeRegistro: atual.exigeRegistro, podeInterditar: atual.podeInterditar, podeSolicitarRemocao: atual.podeSolicitarRemocao },
    dadosDepois: { nome: d.nome, exigeRegistro: d.exigeRegistro, podeInterditar: d.podeInterditar, podeSolicitarRemocao: d.podeSolicitarRemocao } });
  return { sucesso: true, mensagem: "Setor atualizado.", setor: await buscarSetor(pool, setorId) };
}

async function alterarAtivoSetor(pool, { setorId, ativo, por }) {
  const atual = await buscarSetor(pool, setorId);
  if (!atual) return { sucesso: false, mensagem: "Setor não encontrado." };
  if (atual.ativo === ativo) return { sucesso: true, mensagem: ativo ? "O setor já estava ativo." : "O setor já estava desativado.", setor: atual };
  await pool.request().input("id", sql.Int, setorId).input("a", sql.Bit, ativo ? 1 : 0).query(`UPDATE SetoresTecnicos SET Ativo = @a WHERE SetorId = @id`);
  await registrarAuditoria({ tabela: "SetoresTecnicos", registroId: setorId, acao: ativo ? "SETOR_REATIVADO" : "SETOR_DESATIVADO", usuarioId: por, dadosDepois: { nome: atual.nome } });
  return { sucesso: true, mensagem: ativo ? "Setor reativado." : "Setor desativado: não recebe candidaturas nem emite atos. Quem já serve nele continua registrado.", setor: await buscarSetor(pool, setorId) };
}

// ---------------------------------------------------------------
// Vínculo da pessoa com o setor
// ---------------------------------------------------------------

const SELECT_VINCULO = `
  SELECT v.*, s.Codigo AS SetorCodigo, s.Nome AS SetorNome, s.PodeInterditar, s.PodeSolicitarRemocao, s.ExigeRegistro, s.ConselhoClasse, s.Ativo AS SetorAtivo,
         m.Nome AS MembroNome, m.Email AS MembroEmail, c.Nome AS CongregacaoNome,
         a.AdesaoId, a.Forma AS AdesaoForma, a.TermoVersao AS AdesaoVersao, a.TermoHash AS AdesaoHash, a.TermoEspecificos AS AdesaoEspecificos, a.DataAceite AS AdesaoData, a.Referencia AS AdesaoReferencia
  FROM SetoresTecnicosMembros v
  JOIN SetoresTecnicos s ON s.SetorId = v.SetorId
  JOIN MembroReferencia m ON m.MembroId = v.MembroId
  LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
  LEFT JOIN SetoresTecnicosAdesoes a ON a.VinculoId = v.VinculoId`;

const setorDaLinha = (r) => ({ codigo: r.SetorCodigo, nome: r.SetorNome, podeInterditar: !!r.PodeInterditar, podeSolicitarRemocao: !!r.PodeSolicitarRemocao });

// `completo`: a administração vê o motivo escrito do encerramento; quem lê o próprio vínculo também (é dele).
// `comObs`: só a administração lê o texto livre que ela mesma escreveu ao encerrar o vínculo; a pessoa (Meu Painel) recebe o fato, nunca esse texto.
function mapearVinculo(r, { comObs = false } = {}) {
  const setor = setorDaLinha(r);
  const o = {
    vinculoId: r.VinculoId, setorId: r.SetorId, setorCodigo: r.SetorCodigo, setorNome: r.SetorNome, setorAtivo: !!r.SetorAtivo, membroId: r.MembroId, membroNome: r.MembroNome, congregacaoNome: r.CongregacaoNome || null,
    status: r.Status, rotuloStatus: st.STATUS_VINCULO[r.Status], origem: r.Origem, rotuloOrigem: st.ORIGENS_VINCULO[r.Origem], formacao: r.Formacao,
    registro: st.rotuloRegistro(r.ConselhoSigla, r.RegistroNumero), conselhoSigla: r.ConselhoSigla || null, registroNumero: r.RegistroNumero || null,
    exigeRegistro: !!r.ExigeRegistro, conselhoClasse: r.ConselhoClasse || null,
    podeInterditar: !!r.PodeInterditar, podeSolicitarRemocao: !!r.PodeSolicitarRemocao,
    criadoEm: isoInstante(r.CriadoEm), aprovadoEm: isoInstante(r.AprovadoEm), ativadoEm: isoInstante(r.AtivadoEm), encerradoEm: isoInstante(r.EncerradoEm),
    motivoEncerramento: r.MotivoEncerramento || null, rotuloMotivoEncerramento: r.MotivoEncerramento ? st.MOTIVOS_ENCERRAMENTO[r.MotivoEncerramento] : null, obsEncerramento: comObs ? (r.ObsEncerramento || null) : null,
    termo: r.AdesaoId ? {
      adesaoId: r.AdesaoId, forma: r.AdesaoForma, rotuloForma: vol.FORMAS_ADESAO[r.AdesaoForma], dataAceite: isoData(r.AdesaoData), referencia: r.AdesaoReferencia || null,
      integridade: st.avaliarIntegridadeAdesao({ forma: r.AdesaoForma, termoVersao: r.AdesaoVersao, termoHash: r.AdesaoHash, termoEspecificos: r.AdesaoEspecificos }, setor)
    } : null
  };
  return o;
}

async function buscarVinculo(pool, vinculoId) {
  const r = await pool.request().input("id", sql.Int, vinculoId).query(`${SELECT_VINCULO} WHERE v.VinculoId = @id`);
  return r.recordset[0] || null;
}

// A lista da administração: quem espera decisão primeiro, depois quem espera o Termo, os ativos e, por fim, os encerrados.
async function listarVinculos(pool, { setorId = null, status = null, limite = st.LIMITE_LISTA } = {}) {
  const rq = pool.request();
  const cond = [];
  if (setorId) { rq.input("s", sql.Int, setorId); cond.push("v.SetorId = @s"); }
  if (status) { rq.input("st", sql.NVarChar(16), status); cond.push("v.Status = @st"); }
  const r = await rq.query(`SELECT TOP (${Number(limite) || st.LIMITE_LISTA}) * FROM (${SELECT_VINCULO} ${cond.length ? "WHERE " + cond.join(" AND ") : ""}) x
    ORDER BY CASE x.Status WHEN 'CANDIDATO' THEN 0 WHEN 'AGUARDANDO_TERMO' THEN 1 WHEN 'ATIVO' THEN 2 ELSE 3 END, x.VinculoId DESC`);
  return r.recordset.map((x) => mapearVinculo(x, { comObs: true }));
}

// Tudo o que a pessoa vê em Meu Painel → Setores Técnicos.
async function meuPainel(pool, { membroId, hoje = hojeBrasilia() }) {
  const membro = await lerMembro(pool, membroId);
  const condicao = condicaoDoMembro(membro, hoje);
  const linhas = (await pool.request().input("m", sql.Int, membroId).query(`${SELECT_VINCULO} WHERE v.MembroId = @m ORDER BY v.VinculoId DESC`)).recordset;
  const vinculos = linhas.map(r => {
    const v = mapearVinculo(r);
    // O texto do Termo só vai junto quando a pessoa precisa dele para aceitar.
    if (v.status === "AGUARDANDO_TERMO") v.termoParaAceitar = st.termoDoSetor(setorDaLinha(r));
    return v;
  });
  const vigentes = new Set(linhas.filter(r => r.Status !== "ENCERRADO").map(r => Number(r.SetorId)));
  const catalogo = await listarCatalogo(pool);
  // Os poderes que a tela oferece são EXATAMENTE os que a emissão aceita (vinculosQueEmitem): vínculo ativo, setor ativo, pessoa em comunhão e o Termo aceito com a cláusula.
  const [emInterdicao, emRemocao] = condicao.pode
    ? await Promise.all([vinculosQueEmitem(pool, { membroId, tipo: "INTERDICAO" }), vinculosQueEmitem(pool, { membroId, tipo: "REMOCAO_POSTAGEM" })]) : [[], []];
  const acesso = await contextoDeAcesso(pool, { membroId });
  const poder = (x) => ({ vinculoId: x.VinculoId, setorId: x.SetorId, setorNome: x.SetorNome });
  return {
    condicao, vinculos,
    setoresParaCandidatura: catalogo.filter(s => !vigentes.has(s.setorId)),
    poderes: { interdicao: emInterdicao.map(poder), remocao: emRemocao.map(poder) },
    atos: await listarAtos(pool, { emitenteId: membroId, limite: 20, acesso })
  };
}

async function contarVigentes(pool, membroId) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`SELECT COUNT(*) AS n FROM SetoresTecnicosMembros WHERE MembroId = @m AND Status IN (${VIGENTES_SQL})`);
  return Number(r.recordset[0].n);
}

// Quem recebe aviso de gestão (setores_tecnicos) ou de decisão (setores_ratificacao): os portadores da permissão num papel de nível GLOBAL (a administração geral).
async function portadoresDe(pool, permissao) {
  const { resolverDestinatariosPorPermissao } = require("./notificacoes");
  return (await resolverDestinatariosPorPermissao(pool, { permissao, nivel: "GLOBAL" })).map(d => ({ membroId: d.membroId, nome: d.nome, email: d.email }));
}
// O aviso imediato de um ato sai em lotes de 8 em paralelo e SEM esperar a entrega do e-mail (só a aceitação): com dezenas de destinatários, esperar cada entrega
// passaria do tempo da requisição, o ato já estaria gravado e quem o emitiu veria erro. Devolve quantos avisos foram criados.
async function avisarEmLotes(pool, base, destinatarios) {
  let criadas = 0;
  const lista = destinatarios || [];
  for (let i = 0; i < lista.length; i += 8) {
    const rs = await Promise.all(lista.slice(i, i + 8).map(d => notificarAgora(pool, { ...base, destinatarios: [d], aguardarEntrega: false })));
    for (const r of rs) criadas += (r && r.criadas) || 0;
  }
  return criadas;
}
function mesclar(...listas) {
  const mapa = new Map();
  for (const l of listas) for (const d of l || []) if (d && d.membroId && !mapa.has(d.membroId)) mapa.set(d.membroId, { membroId: d.membroId, nome: d.nome, email: d.email });
  return [...mapa.values()];
}
// Os líderes que alcançam a congregação: dirigente, pastor de área e assim até o geral (o de departamento não, que não cuida de prédio nem de rede).
async function lideresDaCongregacao(pool, congregacaoId) {
  const escopo = require("./escopo");
  const { areaId, regiaoId, quadranteId, distritoId } = await escopo.ancestraisTerritoriais(pool, sql, 1, congregacaoId);
  const r = await pool.request().input("congregacaoId", sql.Int, congregacaoId)
    .input("areaId", sql.Int, areaId).input("regiaoId", sql.Int, regiaoId).input("quadranteId", sql.Int, quadranteId).input("distritoId", sql.Int, distritoId)
    .query(`
      SELECT DISTINCT m.MembroId AS membroId, m.Nome AS nome, m.Email AS email
      FROM Lideranca l JOIN MembroReferencia m ON m.MembroId = l.MembroId
      WHERE (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))
        AND (l.EscopoTipo = 'GLOBAL'
          OR (l.EscopoTipo = 'CONGREGACAO' AND l.EscopoId = @congregacaoId)
          OR (l.EscopoTipo = 'AREA' AND l.EscopoId = @areaId)
          OR (l.EscopoTipo = 'REGIAO' AND l.EscopoId = @regiaoId)
          OR (l.EscopoTipo = 'QUADRANTE' AND l.EscopoId = @quadranteId)
          OR (l.EscopoTipo = 'DISTRITO' AND l.EscopoId = @distritoId))`);
  return r.recordset;
}
async function administradoresDoCanal(pool, canalId) {
  if (!canalId) return [];
  const r = await pool.request().input("c", sql.Int, canalId).query(`
    SELECT DISTINCT m.MembroId AS membroId, m.Nome AS nome, m.Email AS email
    FROM CanalAdministradores a JOIN MembroReferencia m ON m.MembroId = a.MembroId WHERE a.CanalId = @c AND a.EncerradoEm IS NULL`);
  return r.recordset;
}
const destinatarioMembro = (m) => (m ? { membroId: m.MembroId, nome: m.Nome, email: m.Email } : null);

async function candidatar(pool, { membroId, dados, hoje = hojeBrasilia(), deps }) {
  const membro = await lerMembro(pool, membroId);
  const c = condicaoDoMembro(membro, hoje);
  if (!c.pode) return { sucesso: false, mensagem: c.mensagem };
  const setor = await buscarSetor(pool, st.inteiroPositivo(dados && dados.setorId) || 0);
  if (!setor || !setor.ativo) return { sucesso: false, mensagem: "Setor não encontrado." };
  const v = st.validarCandidatura(dados, { setor });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const msgTeto = `Você já tem ${st.MAX_VINCULOS_VIGENTES_POR_PESSOA} vínculos em andamento com Setores Técnicos.`;
  if ((await contarVigentes(pool, membroId)) >= st.MAX_VINCULOS_VIGENTES_POR_PESSOA) return { sucesso: false, mensagem: msgTeto };
  let id;
  try {
    // Os dois tetos (vínculos em andamento e candidaturas nas últimas 24 horas) são conferidos NO MESMO comando que grava, com trava de intervalo (UPDLOCK, HOLDLOCK): 20 pedidos
    // ao mesmo tempo não furam o teto. Sem a linha gravada, `id` volta nulo e a mensagem diz qual teto foi.
    const r = await pool.request().input("s", sql.Int, setor.setorId).input("m", sql.Int, membroId).input("f", sql.NVarChar(150), v.dados.formacao)
      .input("cs", sql.NVarChar(20), v.dados.conselhoSigla).input("rn", sql.NVarChar(30), v.dados.registroNumero)
      .input("max", sql.Int, st.MAX_VINCULOS_VIGENTES_POR_PESSOA).input("maxDia", sql.Int, st.MAX_CANDIDATURAS_POR_DIA)
      .query(`INSERT INTO SetoresTecnicosMembros (SetorId, MembroId, Status, Origem, Formacao, ConselhoSigla, RegistroNumero, CriadoPorMembroId)
              SELECT @s, @m, 'CANDIDATO', 'CANDIDATURA', @f, @cs, @rn, @m
              WHERE (SELECT COUNT(*) FROM SetoresTecnicosMembros WITH (UPDLOCK, HOLDLOCK) WHERE MembroId = @m AND Status IN (${VIGENTES_SQL})) < @max
                AND (SELECT COUNT(*) FROM SetoresTecnicosMembros WITH (UPDLOCK, HOLDLOCK) WHERE CriadoPorMembroId = @m AND Origem = 'CANDIDATURA' AND CriadoEm >= DATEADD(HOUR, -24, SYSUTCDATETIME())) < @maxDia;
              DECLARE @n INT = @@ROWCOUNT; SELECT CASE WHEN @n = 1 THEN CAST(SCOPE_IDENTITY() AS INT) ELSE NULL END AS id`);
    id = r.recordset[0].id;
  } catch (e) {
    if (duplicado(e)) return { sucesso: false, mensagem: "Você já tem um vínculo em andamento com este setor." };
    throw e;
  }
  if (id == null) return { sucesso: false, mensagem: (await contarVigentes(pool, membroId)) >= st.MAX_VINCULOS_VIGENTES_POR_PESSOA ? msgTeto : `Você já enviou ${st.MAX_CANDIDATURAS_POR_DIA} candidaturas hoje: tente de novo amanhã.` };
  await registrarAuditoria({ tabela: "SetoresTecnicosMembros", registroId: id, acao: "SETOR_CANDIDATURA", usuarioId: membroId, dadosDepois: { setorId: setor.setorId, comRegistro: !!v.dados.conselhoSigla } });
  await notificarAgora(pool, { regraChave: "SETOR_CANDIDATURA", destinatarios: await portadoresDe(pool, "setores_tecnicos"), mensagem: st.textoCandidatura({ nome: membro.Nome, setorNome: setor.nome }), referenciaId: id, referenciaTabela: "SetoresTecnicosMembros", limiteDia: 10, deps });
  return { sucesso: true, mensagem: `Candidatura ao ${setor.nome} enviada. A administração vai analisar e, aprovada, você aceita o Termo de Adesão.`, vinculoId: id };
}

async function indicar(pool, { dados, por, hoje = hojeBrasilia(), deps }) {
  const membroId = st.inteiroPositivo(dados && dados.membroId);
  if (!membroId) return { sucesso: false, mensagem: "Informe a matrícula de quem será indicado." };
  const setor = await buscarSetor(pool, st.inteiroPositivo(dados && dados.setorId) || 0);
  if (!setor || !setor.ativo) return { sucesso: false, mensagem: "Setor não encontrado." };
  const v = st.validarIndicacao(dados, { setor });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  if (membroId === Number(por)) return { sucesso: false, mensagem: "Você não pode se indicar: use a candidatura, que outra pessoa da administração aprova." };
  const membro = await lerMembro(pool, membroId);
  const c = condicaoDoMembro(membro, hoje);
  if (!c.pode) return { sucesso: false, mensagem: membro ? `${membro.Nome}: ${c.mensagem}` : c.mensagem };
  const msgTeto = `${membro.Nome} já tem ${st.MAX_VINCULOS_VIGENTES_POR_PESSOA} vínculos em andamento com Setores Técnicos.`;
  if ((await contarVigentes(pool, membroId)) >= st.MAX_VINCULOS_VIGENTES_POR_PESSOA) return { sucesso: false, mensagem: msgTeto };
  let id;
  try {
    const r = await pool.request().input("s", sql.Int, setor.setorId).input("m", sql.Int, membroId).input("f", sql.NVarChar(150), v.dados.formacao)
      .input("cs", sql.NVarChar(20), v.dados.conselhoSigla).input("rn", sql.NVarChar(30), v.dados.registroNumero).input("por", sql.Int, por).input("max", sql.Int, st.MAX_VINCULOS_VIGENTES_POR_PESSOA)
      .query(`INSERT INTO SetoresTecnicosMembros (SetorId, MembroId, Status, Origem, Formacao, ConselhoSigla, RegistroNumero, CriadoPorMembroId, AprovadoPorMembroId, AprovadoEm)
              SELECT @s, @m, 'AGUARDANDO_TERMO', 'INDICACAO', @f, @cs, @rn, @por, @por, SYSUTCDATETIME()
              WHERE (SELECT COUNT(*) FROM SetoresTecnicosMembros WITH (UPDLOCK, HOLDLOCK) WHERE MembroId = @m AND Status IN (${VIGENTES_SQL})) < @max;
              DECLARE @n INT = @@ROWCOUNT; SELECT CASE WHEN @n = 1 THEN CAST(SCOPE_IDENTITY() AS INT) ELSE NULL END AS id`);
    id = r.recordset[0].id;
  } catch (e) {
    if (duplicado(e)) return { sucesso: false, mensagem: `${membro.Nome} já tem um vínculo em andamento com este setor.` };
    throw e;
  }
  if (id == null) return { sucesso: false, mensagem: msgTeto };
  await registrarAuditoria({ tabela: "SetoresTecnicosMembros", registroId: id, acao: "SETOR_INDICACAO", usuarioId: por, dadosDepois: { membroId, setorId: setor.setorId, comRegistro: !!v.dados.conselhoSigla } });
  await notificarAgora(pool, { regraChave: "SETOR_INDICADO", destinatarios: [destinatarioMembro(membro)], mensagem: st.textoVinculoIndicado({ setorNome: setor.nome }), referenciaId: id, referenciaTabela: "SetoresTecnicosMembros", deps });
  return { sucesso: true, mensagem: `${membro.Nome} foi indicado(a) ao ${setor.nome}. O vínculo só é ativado quando a pessoa aceitar o Termo de Adesão.`, vinculoId: id };
}

async function aprovar(pool, { vinculoId, por, deps }) {
  const v = await buscarVinculo(pool, vinculoId);
  if (!v) return { sucesso: false, mensagem: "Vínculo não encontrado." };
  if (Number(v.MembroId) === Number(por)) return { sucesso: false, proibido: true, mensagem: "Ninguém aprova a própria candidatura: peça a outra pessoa da administração." };
  if (v.Status !== "CANDIDATO") return { sucesso: false, mensagem: "Esta candidatura já foi decidida." };
  if (!v.SetorAtivo) return { sucesso: false, mensagem: "O setor está desativado." };
  const u = await pool.request().input("id", sql.Int, vinculoId).input("por", sql.Int, por)
    .query(`UPDATE SetoresTecnicosMembros SET Status = 'AGUARDANDO_TERMO', AprovadoPorMembroId = @por, AprovadoEm = SYSUTCDATETIME() WHERE VinculoId = @id AND Status = 'CANDIDATO'`);
  if (u.rowsAffected && u.rowsAffected[0] === 0) return { sucesso: false, mensagem: "Esta candidatura já foi decidida." };
  await registrarAuditoria({ tabela: "SetoresTecnicosMembros", registroId: vinculoId, acao: "SETOR_CANDIDATURA_APROVADA", usuarioId: por, dadosDepois: { membroId: v.MembroId, setorId: v.SetorId } });
  await notificarAgora(pool, { regraChave: "SETOR_INDICADO", destinatarios: [{ membroId: v.MembroId, nome: v.MembroNome, email: v.MembroEmail }], mensagem: st.textoCandidaturaAprovada({ setorNome: v.SetorNome }), referenciaId: vinculoId, referenciaTabela: "SetoresTecnicosMembros", deps });
  return { sucesso: true, mensagem: `Candidatura de ${v.MembroNome} aprovada: a pessoa foi avisada para aceitar o Termo de Adesão.` };
}

async function encerrarNoBanco(pool, { v, por, tipoMotivo, observacao, estados }) {
  const u = await pool.request().input("id", sql.Int, v.VinculoId).input("por", sql.Int, por).input("t", sql.NVarChar(16), tipoMotivo).input("o", sql.NVarChar(300), observacao)
    .query(`UPDATE SetoresTecnicosMembros SET Status = 'ENCERRADO', EncerradoEm = SYSUTCDATETIME(), EncerradoPorMembroId = @por, MotivoEncerramento = @t, ObsEncerramento = @o
            WHERE VinculoId = @id AND Status IN (${estados})`);
  return !(u.rowsAffected && u.rowsAffected[0] === 0);
}

async function recusarCandidatura(pool, { vinculoId, observacao, por }) {
  const v = await buscarVinculo(pool, vinculoId);
  if (!v) return { sucesso: false, mensagem: "Vínculo não encontrado." };
  if (Number(v.MembroId) === Number(por)) return { sucesso: false, proibido: true, mensagem: "Ninguém decide a própria candidatura." };
  if (v.Status !== "CANDIDATO") return { sucesso: false, mensagem: "Esta candidatura já foi decidida." };
  const obs = limpar(observacao);
  if (obs.length > 300 || /[<>]/.test(obs)) return { sucesso: false, mensagem: "A observação aceita até 300 caracteres, sem < ou >." };
  if (!(await encerrarNoBanco(pool, { v, por, tipoMotivo: "RECUSADO", observacao: obs || null, estados: "'CANDIDATO'" }))) return { sucesso: false, mensagem: "Esta candidatura já foi decidida." };
  await registrarAuditoria({ tabela: "SetoresTecnicosMembros", registroId: vinculoId, acao: "SETOR_CANDIDATURA_RECUSADA", usuarioId: por, dadosDepois: { membroId: v.MembroId, setorId: v.SetorId, observacaoTamanho: obs.length } });
  return { sucesso: true, mensagem: `Candidatura de ${v.MembroNome} encerrada.` };
}

async function encerrarVinculo(pool, { vinculoId, dados, por }) {
  const v = await buscarVinculo(pool, vinculoId);
  if (!v) return { sucesso: false, mensagem: "Vínculo não encontrado." };
  if (v.Status === "ENCERRADO") return { sucesso: false, mensagem: "Este vínculo já está encerrado." };
  const e = st.validarEncerramento(dados, { atorId: por, membroId: v.MembroId });
  if (!e.valido) return { sucesso: false, mensagem: e.mensagem };
  if (!(await encerrarNoBanco(pool, { v, por, tipoMotivo: e.dados.tipoMotivo, observacao: e.dados.observacao, estados: VIGENTES_SQL }))) return { sucesso: false, mensagem: "Este vínculo já está encerrado." };
  await registrarAuditoria({ tabela: "SetoresTecnicosMembros", registroId: vinculoId, acao: "SETOR_VINCULO_ENCERRADO", usuarioId: por, dadosDepois: { membroId: v.MembroId, setorId: v.SetorId, tipoMotivo: e.dados.tipoMotivo, observacaoTamanho: (e.dados.observacao || "").length } });
  return { sucesso: true, mensagem: `${v.MembroNome} deixou o ${v.SetorNome}. Os atos que emitiu seguem registrados.` };
}

// Art. 133 §7º: a pessoa sai quando quiser, sem penalidade.
async function sairDoSetor(pool, { vinculoId, membroId }) {
  const v = await buscarVinculo(pool, vinculoId);
  if (!v || Number(v.MembroId) !== Number(membroId)) return { sucesso: false, mensagem: "Vínculo não encontrado." };
  if (v.Status === "ENCERRADO") return { sucesso: false, mensagem: "Este vínculo já está encerrado." };
  if (!(await encerrarNoBanco(pool, { v, por: membroId, tipoMotivo: "SAIDA_PROPRIA", observacao: null, estados: VIGENTES_SQL }))) return { sucesso: false, mensagem: "Este vínculo já está encerrado." };
  await registrarAuditoria({ tabela: "SetoresTecnicosMembros", registroId: vinculoId, acao: "SETOR_VINCULO_ENCERRADO", usuarioId: membroId, dadosDepois: { membroId, setorId: v.SetorId, tipoMotivo: "SAIDA_PROPRIA" } });
  return { sucesso: true, mensagem: `Você saiu do ${v.SetorNome}. Obrigado por ter servido — é um direito seu, sem penalidade.` };
}

// ---------------------------------------------------------------
// Termo de Adesão do setor (Art. 49 §2º)
// ---------------------------------------------------------------

// O Termo de um vínculo (para ler ou imprimir). Quem não é o dono nem tem gestão recebe a mesma resposta de "não existe".
async function termoDoVinculo(pool, { vinculoId, membroId, gestao = false }) {
  const v = await buscarVinculo(pool, vinculoId);
  if (!v || (!gestao && Number(v.MembroId) !== Number(membroId))) return { sucesso: false, mensagem: "Vínculo não encontrado." };
  // Quem já tem prova (aceite ou ficha) vê o texto com as cláusulas que valiam NA HORA; quem ainda não tem, o de hoje.
  return { sucesso: true, vinculo: mapearVinculo(v), termo: st.termoDoSetor(setorDaLinha(v), v.AdesaoId ? st.listaDosEspecificos(v.AdesaoEspecificos) : null) };
}

// Ativa o vínculo e grava a prova na mesma transação. A porta de entrada é o UPDATE do status: se duas ações chegam juntas, só uma o encontra em
// AGUARDANDO_TERMO, e a outra desfaz tudo — nunca duas provas nem um vínculo ativo sem prova.
async function ativarComTermo(pool, { v, forma, campos, por }) {
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let adesaoId;
  try {
    const u = await new sql.Request(transaction).input("id", sql.Int, v.VinculoId)
      .query(`UPDATE SetoresTecnicosMembros SET Status = 'ATIVO', AtivadoEm = SYSUTCDATETIME() WHERE VinculoId = @id AND Status = 'AGUARDANDO_TERMO'`);
    if (u.rowsAffected && u.rowsAffected[0] === 0) { await fecharTransacao(transaction, false); return { ok: false, mensagem: "Este vínculo mudou de situação: atualize a tela." }; }
    const rq = new sql.Request(transaction).input("v", sql.Int, v.VinculoId).input("m", sql.Int, v.MembroId).input("s", sql.Int, v.SetorId).input("f", sql.NVarChar(12), forma)
      .input("ver", sql.Int, campos.versao).input("h", sql.NVarChar(64), campos.hash).input("esp", sql.NVarChar(120), campos.especificos).input("d", sql.Date, campos.dataAceite)
      .input("ip", sql.NVarChar(45), campos.ip).input("cad", sql.NVarChar(400), campos.cadeia).input("c", sql.NVarChar(8), campos.canal).input("ref", sql.NVarChar(200), campos.referencia).input("por", sql.Int, por);
    const r = await rq.query(`INSERT INTO SetoresTecnicosAdesoes (VinculoId, MembroId, SetorId, Forma, TermoVersao, TermoHash, TermoEspecificos, DataAceite, AceitoEm, EnderecoIp, CadeiaCabecalhos, CanalMensageria, Referencia, RegistradoPorMembroId)
      VALUES (@v, @m, @s, @f, @ver, @h, @esp, @d, ${forma === "CLICKWRAP" ? "SYSUTCDATETIME()" : "NULL"}, @ip, @cad, @c, @ref, @por); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`);
    adesaoId = r.recordset[0].id;
    await transaction.commit();
  } catch (e) {
    await fecharTransacao(transaction, false);
    if (duplicado(e)) return { ok: false, mensagem: "Este vínculo já tem o Termo registrado." };
    throw e;
  }
  return { ok: true, adesaoId };
}

// `termoHash`: o hash do texto que a tela mostrou. Se o catálogo mudou entre "ver" e "aceitar", o aceite é recusado: ninguém aceita um texto que não leu.
async function aceitarTermo(pool, { vinculoId, membroId, aceito, termoHash, ip, cadeia = null, hoje = hojeBrasilia() }) {
  const forma = vol.validarAceiteDigital({ aceito, ip, idade: vol.MAIORIDADE });
  if (!forma.valido) return { sucesso: false, mensagem: forma.mensagem };
  const v = await buscarVinculo(pool, vinculoId);
  if (!v || Number(v.MembroId) !== Number(membroId)) return { sucesso: false, mensagem: "Vínculo não encontrado." };
  if (v.Status === "ATIVO") return { sucesso: false, mensagem: "Você já aceitou o Termo deste setor." };
  if (v.Status === "CANDIDATO") return { sucesso: false, mensagem: "A sua candidatura ainda não foi aprovada: o Termo é aceito depois da aprovação." };
  if (v.Status !== "AGUARDANDO_TERMO") return { sucesso: false, mensagem: "Este vínculo está encerrado." };
  const membro = await lerMembro(pool, membroId);
  const c = condicaoDoMembro(membro, hoje);
  if (!c.pode) return { sucesso: false, mensagem: c.mensagem };
  const termo = st.termoDoSetor(setorDaLinha(v));
  if (typeof termoHash !== "string" || termoHash.trim().toLowerCase() !== termo.hash) return { sucesso: false, termoMudou: true, mensagem: "O texto do Termo mudou desde que você abriu a tela (ou a tela está desatualizada): recarregue, leia de novo e aceite." };
  const res = await ativarComTermo(pool, { v, forma: "CLICKWRAP", por: null, campos: { versao: termo.versao, hash: termo.hash, especificos: st.textoDosEspecificos(termo.especificos), dataAceite: hoje, ip, cadeia, canal: null, referencia: null } });
  if (!res.ok) return { sucesso: false, mensagem: res.mensagem };
  // O IP fica só na tabela da adesão: a trilha de auditoria é imutável e não deve replicar dado pessoal.
  await registrarAuditoria({ tabela: "SetoresTecnicosAdesoes", registroId: res.adesaoId, acao: "SETOR_ADESAO_REGISTRADA", usuarioId: membroId, dadosDepois: { vinculoId, setorId: v.SetorId, forma: "CLICKWRAP", termoVersao: termo.versao, termoHash: termo.hash } });
  return { sucesso: true, mensagem: `Termo aceito. Você agora serve no ${v.SetorNome}. Obrigado por servir de coração.`, vinculo: mapearVinculo(await buscarVinculo(pool, vinculoId)) };
}

// Ficha assinada ou e-mail/WhatsApp com resposta positiva: a administração registra, a prova é o documento arquivado.
async function registrarTermoManual(pool, { vinculoId, dados, por, hoje = hojeBrasilia() }) {
  const forma = st.validarRegistroTermo(dados, { hoje });
  if (!forma.valido) return { sucesso: false, mensagem: forma.mensagem };
  const v = await buscarVinculo(pool, vinculoId);
  if (!v) return { sucesso: false, mensagem: "Vínculo não encontrado." };
  if (v.Status === "ATIVO") return { sucesso: false, mensagem: `${v.MembroNome} já tem o Termo registrado.` };
  if (v.Status === "CANDIDATO") return { sucesso: false, mensagem: "Aprove a candidatura antes de registrar o Termo." };
  if (v.Status !== "AGUARDANDO_TERMO") return { sucesso: false, mensagem: "Este vínculo está encerrado." };
  // Separação de funções: ninguém ativa a si mesmo, e onde o Termo dá poder de polícia (interditar, pedir remoção) quem indicou ou aprovou a pessoa não registra a ficha dela.
  if (Number(por) === Number(v.MembroId)) return { sucesso: false, proibido: true, mensagem: "Ninguém registra o próprio Termo: peça a outra pessoa da administração." };
  if ((v.PodeInterditar || v.PodeSolicitarRemocao) && Number(v.AprovadoPorMembroId) === Number(por)) return { sucesso: false, proibido: true, mensagem: "Neste setor o Termo dá poder de polícia (interditar ou pedir remoção): quem indicou ou aprovou a pessoa não registra a ficha dela. Peça a outra pessoa da administração." };
  const membro = await lerMembro(pool, v.MembroId);
  const c = condicaoDoMembro(membro, hoje);
  if (!c.pode) return { sucesso: false, mensagem: c.mensagem };
  const d = forma.dados;
  // A ficha impressa tem as cláusulas do catálogo de HOJE: a lista fica guardada com a prova (o poder só vale se a cláusula estava no que foi assinado).
  const termoImpresso = st.termoDoSetor(setorDaLinha(v));
  const res = await ativarComTermo(pool, { v, forma: d.forma, por, campos: { versao: null, hash: null, especificos: st.textoDosEspecificos(termoImpresso.especificos), dataAceite: d.dataAceite, ip: null, cadeia: null, canal: d.canal, referencia: d.referencia } });
  if (!res.ok) return { sucesso: false, mensagem: res.mensagem };
  await registrarAuditoria({ tabela: "SetoresTecnicosAdesoes", registroId: res.adesaoId, acao: "SETOR_ADESAO_REGISTRADA", usuarioId: por, dadosDepois: { vinculoId, membroId: v.MembroId, setorId: v.SetorId, forma: d.forma, dataAceite: d.dataAceite, canal: d.canal, referenciaTamanho: d.referencia.length } });
  return { sucesso: true, mensagem: `Termo de ${v.MembroNome} registrado (${vol.FORMAS_ADESAO[d.forma]}): o vínculo está ativo.`, vinculo: mapearVinculo(await buscarVinculo(pool, vinculoId)) };
}

// ---------------------------------------------------------------
// Atos cautelares (Art. 50)
// ---------------------------------------------------------------

async function contextoDeAcesso(pool, { membroId, diretoria = false, gestao = false, lider = null }) {
  const [v, c] = await Promise.all([
    pool.request().input("m", sql.Int, membroId).query(`SELECT SetorId FROM SetoresTecnicosMembros WHERE MembroId = @m AND Status = 'ATIVO'`),
    pool.request().input("m", sql.Int, membroId).query(`SELECT CanalId FROM CanalAdministradores WHERE MembroId = @m AND EncerradoEm IS NULL`)
  ]);
  return { membroId, diretoria, gestao, lider, setoresAtivos: new Set(v.recordset.map(x => Number(x.SetorId))), canaisAdministrados: new Set(c.recordset.map(x => Number(x.CanalId))) };
}

const SELECT_ATO = `
  SELECT i.*, s.Nome AS SetorNome, s.Codigo AS SetorCodigo, me.Nome AS EmitenteNome, c.Nome AS CongregacaoNome,
         ca.Nome AS CanalNome, ca.Plataforma AS CanalPlataforma, ca.Identificador AS CanalIdentificador, md.Nome AS DecididaPorNome, mf.Nome AS FechadaPorNome
  FROM SetoresTecnicosIntervencoes i
  JOIN SetoresTecnicos s ON s.SetorId = i.SetorId
  JOIN MembroReferencia me ON me.MembroId = i.EmitidaPorMembroId
  JOIN Congregacoes c ON c.CongregacaoId = i.CongregacaoId
  LEFT JOIN CanaisOficiaisComunicacao ca ON ca.CanalId = i.CanalId
  LEFT JOIN MembroReferencia md ON md.MembroId = i.DecididaPorMembroId
  LEFT JOIN MembroReferencia mf ON mf.MembroId = i.FechadaPorMembroId`;

// O identificador do canal (telefone, e-mail, link de grupo) só vai a quem administra o canal, à gestão e à Diretoria.
function podeVerIdentificador(r, acesso) {
  return !!acesso && (!!acesso.diretoria || !!acesso.gestao || (r.CanalId != null && !!acesso.canaisAdministrados && acesso.canaisAdministrados.has(Number(r.CanalId))));
}

function mapearAto(r, acesso = null) {
  const ato = {
    intervencaoId: r.IntervencaoId, tipo: r.Tipo, rotuloTipo: st.TIPOS_ATO[r.Tipo], setorId: r.SetorId, setorNome: r.SetorNome, setorCodigo: r.SetorCodigo,
    emitidaPorMembroId: r.EmitidaPorMembroId, emitenteNome: r.EmitenteNome, registroProfissional: r.RegistroProfissional || null,
    congregacaoId: r.CongregacaoId, congregacaoNome: r.CongregacaoNome, canalId: r.CanalId || null, canalNome: r.CanalNome || null,
    canalDescricao: r.CanalNome ? `${r.CanalPlataforma ? r.CanalPlataforma + " — " : ""}${r.CanalNome}${r.CanalIdentificador && podeVerIdentificador(r, acesso) ? ` (${r.CanalIdentificador})` : ""}` : null,
    motivo: r.Motivo, rotuloMotivo: (r.Tipo === "INTERDICAO" ? st.MOTIVOS_INTERDICAO : st.MOTIVOS_REMOCAO)[r.Motivo], objeto: r.Objeto || null, referencia: r.Referencia || null, descricao: r.Descricao,
    status: r.Status, rotuloStatus: st.STATUS_ATO[r.Status], emitidaEm: isoInstante(r.EmitidaEm),
    decididaPorNome: r.DecididaPorNome || null, decididaEm: isoInstante(r.DecididaEm), decisaoObs: r.DecisaoObs || null,
    fechadaPorNome: r.FechadaPorNome || null, fechadaEm: isoInstante(r.FechadaEm), fechamentoObs: r.FechamentoObs || null,
    emVigor: r.Tipo === "INTERDICAO" && st.STATUS_ATO_ABERTOS.includes(r.Status)
  };
  ato.acoes = acesso ? st.ACOES_DO_ATO.filter(a => st.podeAgirNoAto(ato, a, acesso)) : [];
  return ato;
}

// `congregacaoNomes`: restringe às congregações do escopo de quem lê (array de nomes; null = sem restrição). `acesso` decide as ações de cada linha.
async function listarAtos(pool, { tipo = null, status = null, abertos = false, congregacaoNomes = null, emitenteId = null, limite = st.LIMITE_LISTA, acesso = null } = {}) {
  const rq = pool.request();
  const cond = [];
  if (tipo) { rq.input("t", sql.NVarChar(16), tipo); cond.push("i.Tipo = @t"); }
  if (status) { rq.input("st", sql.NVarChar(12), status); cond.push("i.Status = @st"); }
  if (abertos) cond.push("i.Status IN ('EMITIDA','RATIFICADA')");
  if (emitenteId) { rq.input("e", sql.Int, emitenteId); cond.push("i.EmitidaPorMembroId = @e"); }
  let posFiltro = null;
  if (Array.isArray(congregacaoNomes)) {
    if (congregacaoNomes.length === 0) return [];
    if (congregacaoNomes.length <= MAX_IN) cond.push(`c.Nome IN (${listaIn(rq, "n", congregacaoNomes, sql.NVarChar(200))})`);
    else { const conj = new Set(congregacaoNomes); posFiltro = (a) => conj.has(a.congregacaoNome); }
  }
  const r = await rq.query(`SELECT TOP (${Number(limite) || st.LIMITE_LISTA}) * FROM (${SELECT_ATO} ${cond.length ? "WHERE " + cond.join(" AND ") : ""}) x
    ORDER BY CASE x.Status WHEN 'EMITIDA' THEN 0 WHEN 'RATIFICADA' THEN 1 ELSE 2 END, x.IntervencaoId DESC`);
  const atos = r.recordset.map(x => mapearAto(x, acesso));
  return posFiltro ? atos.filter(posFiltro) : atos;
}

async function buscarAto(pool, intervencaoId) {
  const r = await pool.request().input("id", sql.Int, intervencaoId).query(`${SELECT_ATO} WHERE i.IntervencaoId = @id`);
  return r.recordset[0] || null;
}
async function detalharAto(pool, { intervencaoId, acesso = null }) {
  const r = await buscarAto(pool, intervencaoId);
  return r ? mapearAto(r, acesso) : null;
}

// Os canais cadastrados da congregação (para escolher onde está a postagem).
async function canaisDaCongregacao(pool, congregacaoId) {
  const r = await pool.request().input("c", sql.Int, congregacaoId).query(`
    SELECT CanalId, Nome, Plataforma FROM CanaisOficiaisComunicacao WHERE Ativo = 1 AND CongregacaoId = @c ORDER BY Nome`);
  // Só nome e plataforma: o identificador do canal (telefone, e-mail, link de grupo) é de quem administra canais (a política da v7.3), não de todo voluntário.
  return r.recordset.map(x => ({ canalId: x.CanalId, nome: x.Nome, plataforma: x.Plataforma || null }));
}

// Os vínculos ATIVOS da pessoa que dão o poder deste tipo de ato (o setor ativo e a pessoa ainda em plena comunhão).
async function vinculosQueEmitem(pool, { membroId, tipo }) {
  const marca = tipo === "INTERDICAO" ? "s.PodeInterditar" : "s.PodeSolicitarRemocao";
  // E o Termo que a pessoa aceitou (ou a ficha que a administração registrou) precisa TER a cláusula do poder: o poder nunca vale por uma marca posta no catálogo depois.
  const clausula = tipo === "INTERDICAO" ? "INTERDICAO" : "REMOCAO_POSTAGEM";
  const r = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT v.VinculoId, v.SetorId, v.ConselhoSigla, v.RegistroNumero, s.Nome AS SetorNome, s.Codigo AS SetorCodigo
    FROM SetoresTecnicosMembros v JOIN SetoresTecnicos s ON s.SetorId = v.SetorId JOIN MembroReferencia m ON m.MembroId = v.MembroId
    JOIN SetoresTecnicosAdesoes a ON a.VinculoId = v.VinculoId AND (',' + ISNULL(a.TermoEspecificos, '') + ',') LIKE '%,${clausula},%'
    WHERE v.MembroId = @m AND v.Status = 'ATIVO' AND s.Ativo = 1 AND ${marca} = 1 AND m.Status = 'ATIVO' AND ISNULL(m.SituacaoMembro, '') <> 'SEM_COMUNHAO'
    ORDER BY v.VinculoId`);
  return r.recordset;
}

// A emissão dos dois tipos de ato. Dentro da transação, o UPDATE "status = status" no vínculo da pessoa a serializa (duas emissões juntas esperam uma à outra) e
// confirma que o vínculo continua ATIVO; depois valem os tetos (atos em aberto e atos nas últimas 24 horas) e a recusa de duplicata.
async function emitirAto(pool, { tipo, membroId, dados, hoje, deps }) {
  const v = tipo === "INTERDICAO" ? st.validarInterdicao(dados) : st.validarPedidoRemocao(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const d = v.dados;
  const elegiveis = await vinculosQueEmitem(pool, { membroId, tipo });
  if (elegiveis.length === 0) {
    return { sucesso: false, proibido: true, mensagem: tipo === "INTERDICAO"
      ? "Só quem serve (com o Termo aceito) num Setor com poder de interdição — Engenharia ou Segurança — pode emitir este ato (Regimento Art. 50, I)."
      : "Só quem serve (com o Termo aceito) num Setor com poder de pedir remoção — Comunicação — pode emitir este ato (Regimento Art. 50, II)." };
  }
  const setorPedido = st.inteiroPositivo(dados && dados.setorId);
  let vinculo = setorPedido ? elegiveis.find(x => Number(x.SetorId) === setorPedido) : (elegiveis.length === 1 ? elegiveis[0] : null);
  if (!vinculo) return { sucesso: false, mensagem: setorPedido ? "Você não serve nesse setor com este poder." : "Você serve em mais de um setor com este poder: escolha qual deles emite o ato." };

  const cong = (await pool.request().input("c", sql.Int, d.congregacaoId).query(`SELECT CongregacaoId, Nome, Ativa FROM Congregacoes WHERE CongregacaoId = @c`)).recordset[0];
  if (!cong) return { sucesso: false, mensagem: "Congregação não encontrada." };
  let canal = null;
  if (d.canalId) {
    canal = (await pool.request().input("id", sql.Int, d.canalId).query(`SELECT CanalId, Nome, CongregacaoId, Ativo FROM CanaisOficiaisComunicacao WHERE CanalId = @id`)).recordset[0];
    if (!canal || !canal.Ativo || Number(canal.CongregacaoId) !== Number(d.congregacaoId)) return { sucesso: false, mensagem: "Esse canal não é um canal ativo desta congregação." };
  }
  const registro = st.rotuloRegistro(vinculo.ConselhoSigla, vinculo.RegistroNumero);

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let id;
  try {
    // Trava por EMITENTE: quem serve em dois setores com poder (Engenharia e Segurança) não fura os tetos emitindo pelos dois ao mesmo tempo.
    const lock = await new sql.Request(transaction).input("r", sql.NVarChar(200), `setor-emitente-${membroId}`)
      .query(`DECLARE @res INT; EXEC @res = sp_getapplock @Resource = @r, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 20000; SELECT @res AS r`);
    if (!lock.recordset[0] || Number(lock.recordset[0].r) < 0) { await fecharTransacao(transaction, false); return { sucesso: false, mensagem: "O sistema está ocupado com outro ato seu: tente de novo em instantes." }; }
    const trava = await new sql.Request(transaction).input("v", sql.Int, vinculo.VinculoId)
      .query(`UPDATE SetoresTecnicosMembros SET Status = Status WHERE VinculoId = @v AND Status = 'ATIVO'`);
    if (trava.rowsAffected && trava.rowsAffected[0] === 0) { await fecharTransacao(transaction, false); return { sucesso: false, proibido: true, mensagem: "O seu vínculo com o setor não está mais ativo." }; }
    // Repetido: a mesma estrutura (interdição) ou o mesmo link (pedido de remoção), na mesma congregação, ainda em aberto.
    const chave = tipo === "INTERDICAO" ? d.objeto : d.referencia;
    const lim = (await new sql.Request(transaction).input("m", sql.Int, membroId).input("c", sql.Int, d.congregacaoId).input("t", sql.NVarChar(16), tipo).input("k", sql.NVarChar(300), chave || "")
      .query(`SELECT
          (SELECT COUNT(*) FROM SetoresTecnicosIntervencoes WHERE EmitidaPorMembroId = @m AND Status IN ('EMITIDA','RATIFICADA')) AS Abertos,
          (SELECT COUNT(*) FROM SetoresTecnicosIntervencoes WHERE EmitidaPorMembroId = @m AND EmitidaEm >= DATEADD(HOUR, -24, SYSUTCDATETIME())) AS Dia,
          (SELECT COUNT(*) FROM SetoresTecnicosIntervencoes WHERE Tipo = @t AND CongregacaoId = @c AND Status IN ('EMITIDA','RATIFICADA')
              AND (CASE WHEN @t = 'INTERDICAO' THEN ISNULL(Objeto, N'') ELSE ISNULL(Referencia, N'') END) = @k) AS Repetidos`)).recordset[0];
    if (Number(lim.Abertos) >= st.MAX_ATOS_ABERTOS_POR_EMITENTE) { await fecharTransacao(transaction, false); return { sucesso: false, mensagem: `Você já tem ${st.MAX_ATOS_ABERTOS_POR_EMITENTE} atos em aberto: espere a Diretoria decidir ou levante/encerre algum antes de emitir outro.` }; }
    if (Number(lim.Dia) >= st.MAX_ATOS_POR_DIA) { await fecharTransacao(transaction, false); return { sucesso: false, mensagem: `No máximo ${st.MAX_ATOS_POR_DIA} atos por dia. Se a situação é grave, avise a Diretoria Executiva diretamente.` }; }
    if (Number(lim.Repetidos) > 0) { await fecharTransacao(transaction, false); return { sucesso: false, mensagem: tipo === "INTERDICAO" ? "Já existe uma interdição em aberto para este mesmo local." : "Já existe um pedido em aberto para esta mesma rede." }; }
    const r = await new sql.Request(transaction).input("t", sql.NVarChar(16), tipo).input("s", sql.Int, vinculo.SetorId).input("v", sql.Int, vinculo.VinculoId).input("por", sql.Int, membroId)
      .input("c", sql.Int, d.congregacaoId).input("canal", sql.Int, d.canalId || null).input("mot", sql.NVarChar(24), d.motivo).input("obj", sql.NVarChar(150), d.objeto)
      .input("ref", sql.NVarChar(300), d.referencia).input("desc", sql.NVarChar(1000), d.descricao).input("reg", sql.NVarChar(60), registro)
      .query(`INSERT INTO SetoresTecnicosIntervencoes (Tipo, SetorId, VinculoId, EmitidaPorMembroId, CongregacaoId, CanalId, Motivo, Objeto, Referencia, Descricao, RegistroProfissional, Status)
              VALUES (@t, @s, @v, @por, @c, @canal, @mot, @obj, @ref, @desc, @reg, 'EMITIDA'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`);
    id = r.recordset[0].id;
    await transaction.commit();
  } catch (e) { await fecharTransacao(transaction, false); throw e; }

  // O texto livre (justificativa, referência) fica só no registro do ato; a trilha imutável leva os códigos e o tamanho.
  await registrarAuditoria({ tabela: "SetoresTecnicosIntervencoes", registroId: id, acao: tipo === "INTERDICAO" ? "INTERDICAO_EMITIDA" : "REMOCAO_POSTAGEM_SOLICITADA", usuarioId: membroId,
    dadosDepois: { setorId: vinculo.SetorId, congregacaoId: d.congregacaoId, canalId: d.canalId || null, motivo: d.motivo, descricaoTamanho: d.descricao.length } });

  // O ato JÁ está gravado: se algo falhar ao avisar, o emitente precisa ouvir isso (e telefonar à Diretoria), e não receber um erro que o faria repetir um ato que já existe.
  let avisos = 0, semDiretoria = false, falhaNosAvisos = false;
  try {
    const diretoria = await portadoresDe(pool, "setores_ratificacao");
    const emitente = await lerMembro(pool, membroId);
    const lideres = await lideresDaCongregacao(pool, d.congregacaoId);
    const gestao = await portadoresDe(pool, "setores_tecnicos");
    semDiretoria = diretoria.length === 0;
    const base = { setorNome: vinculo.SetorNome, emitenteNome: emitente ? emitente.Nome : `matrícula ${membroId}`, congregacaoNome: cong.Nome, objeto: d.objeto, motivo: d.motivo, hoje };
    if (tipo === "INTERDICAO") {
      // Diretoria, líderes que alcançam a congregação, a secretaria dos setores e o PRÓPRIO emitente (a confirmação de que o ato saiu em seu nome).
      avisos = await avisarEmLotes(pool, { regraChave: "SETOR_INTERDICAO", mensagem: st.textoInterdicaoEmitida({ ...base, registro }), referenciaId: id, referenciaTabela: "SetoresTecnicosIntervencoes", deps }, mesclar(diretoria, lideres, gestao, [destinatarioMembro(emitente)]));
    } else {
      avisos = await avisarEmLotes(pool, { regraChave: "SETOR_REMOCAO_SOLICITADA", mensagem: st.textoPedidoRemocao({ ...base, objeto: d.objeto || (canal && canal.Nome) || null }), referenciaId: id, referenciaTabela: "SetoresTecnicosIntervencoes", deps },
        mesclar(await administradoresDoCanal(pool, d.canalId), lideres, diretoria, gestao, [destinatarioMembro(emitente)]));
    }
  } catch (e) {
    falhaNosAvisos = true;
    console.error("[SETORES] falha ao avisar um ato já gravado:", e && e.message);
  }
  // A mensagem só diz que a Diretoria foi comunicada se algum aviso saiu de fato (a regra pode estar desligada ou o banco ter falhado).
  const semAviso = falhaNosAvisos || avisos === 0;
  const orientacao = semAviso ? " ATENÇÃO: o ato foi registrado, mas NENHUM aviso saiu — avise a Diretoria Executiva e o dirigente da congregação por telefone agora." : "";
  const semPermissao = !semAviso && semDiretoria ? " ATENÇÃO: ninguém na Diretoria tem a permissão de decidir sobre este ato — avise a Diretoria por telefone e peça que a Secretaria conceda a permissão." : "";
  return {
    sucesso: true, intervencaoId: id, avisados: avisos, semDiretoria, semAviso,
    mensagem: tipo === "INTERDICAO"
      ? `Interdição registrada em nome de ${vinculo.SetorNome}. Ela vale desde já${semAviso ? "." : " e foi comunicada à Diretoria Executiva e aos líderes da congregação, que precisam ratificá-la ou revogá-la (Art. 50, I)."}${orientacao}${semPermissao}`
      : `Pedido de remoção registrado em nome de ${vinculo.SetorNome}${semAviso ? "." : " e comunicado a quem cuida da rede e aos líderes da congregação (Art. 50, II)."}${orientacao}${semPermissao}`
  };
}
const emitirInterdicao = (pool, args) => emitirAto(pool, { ...args, tipo: "INTERDICAO" });
const emitirPedidoRemocao = (pool, args) => emitirAto(pool, { ...args, tipo: "REMOCAO_POSTAGEM" });

// Troca o status do ato (a porta é o UPDATE com o status de origem na cláusula: se outra pessoa decidiu antes, ninguém sobrescreve).
// `decisao: true` grava nas colunas da decisão da Diretoria (Decidida*, DecisaoObs); senão nas do fechamento (Fechada*, FechamentoObs). Os nomes são constantes do código.
async function moverAto(pool, { intervencaoId, de, para, decisao, por, observacao }) {
  const rq = pool.request().input("id", sql.Int, intervencaoId).input("para", sql.NVarChar(12), para).input("por", sql.Int, por).input("obs", sql.NVarChar(300), observacao);
  const marcas = de.map((d, i) => { rq.input(`de${i}`, sql.NVarChar(12), d); return `@de${i}`; }).join(", ");
  const colunas = decisao ? "DecididaPorMembroId = @por, DecididaEm = SYSUTCDATETIME(), DecisaoObs = @obs" : "FechadaPorMembroId = @por, FechadaEm = SYSUTCDATETIME(), FechamentoObs = @obs";
  const u = await rq.query(`UPDATE SetoresTecnicosIntervencoes SET Status = @para, ${colunas} WHERE IntervencaoId = @id AND Status IN (${marcas})`);
  return !(u.rowsAffected && u.rowsAffected[0] === 0);
}

// Quem é avisado de uma decisão ou do fim de um ato: o emitente, os líderes da congregação (e quem cuida da rede, no pedido de remoção). Quem decidiu não.
async function avisarDecisao(pool, { ato, por, hoje, regraChave, mensagem, referenciaId, deps }) {
  const emitente = destinatarioMembro(await lerMembro(pool, ato.EmitidaPorMembroId));
  const extras = ato.Tipo === "REMOCAO_POSTAGEM" ? await administradoresDoCanal(pool, ato.CanalId) : [];
  const lista = mesclar([emitente], await lideresDaCongregacao(pool, ato.CongregacaoId), extras).filter(d => Number(d.membroId) !== Number(por));
  await avisarEmLotes(pool, { regraChave, mensagem, referenciaId, referenciaTabela: "SetoresTecnicosIntervencoes", deps }, lista);
}

// Ratificar ou revogar (a Diretoria Executiva). `acesso`: o contexto de quem decide (a regra de quem pode está em st.podeAgirNoAto).
async function decidirAto(pool, { intervencaoId, dados, por, acesso, hoje = hojeBrasilia(), deps }) {
  const a = await buscarAto(pool, intervencaoId);
  if (!a) return { sucesso: false, mensagem: "Ato não encontrado." };
  const v = st.validarDecisao(dados, { tipo: a.Tipo });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const ato = mapearAto(a);
  if (Number(a.EmitidaPorMembroId) === Number(por)) return { sucesso: false, proibido: true, mensagem: "Quem emitiu o ato não o ratifica nem o revoga: peça a outra pessoa da Diretoria Executiva." };
  if (!st.podeAgirNoAto(ato, v.dados.decisao, acesso)) return { sucesso: false, mensagem: a.Status === "EMITIDA" ? "Você não pode decidir este ato." : `Este ato já está ${st.STATUS_ATO[a.Status].toLowerCase()}.` };
  const ok = await moverAto(pool, { intervencaoId, de: ["EMITIDA"], para: v.dados.para, decisao: true, por, observacao: v.dados.observacao });
  if (!ok) return { sucesso: false, mensagem: "Outra pessoa da Diretoria decidiu este ato antes de você: atualize a tela." };
  await registrarAuditoria({ tabela: "SetoresTecnicosIntervencoes", registroId: intervencaoId, acao: v.dados.para === "RATIFICADA" ? "INTERDICAO_RATIFICADA" : "ATO_REVOGADO", usuarioId: por, dadosDepois: { tipo: a.Tipo, congregacaoId: a.CongregacaoId, observacaoTamanho: (v.dados.observacao || "").length } });
  if (a.Tipo === "INTERDICAO") {
    await avisarDecisao(pool, { ato: a, por, hoje, regraChave: "SETOR_INTERDICAO_DECIDIDA", referenciaId: intervencaoId * 10 + (v.dados.para === "RATIFICADA" ? 1 : 2), deps,
      mensagem: st.textoInterdicaoDecidida({ decisao: v.dados.para, setorNome: a.SetorNome, congregacaoNome: a.CongregacaoNome, objeto: a.Objeto, observacao: v.dados.observacao }) });
  } else {
    await avisarDecisao(pool, { ato: a, por, hoje, regraChave: "SETOR_REMOCAO_DECIDIDA", referenciaId: intervencaoId * 10 + 2, deps,
      mensagem: st.textoRemocaoDecidida({ para: "REVOGADA", setorNome: a.SetorNome, congregacaoNome: a.CongregacaoNome, observacao: v.dados.observacao }) });
  }
  return { sucesso: true, mensagem: v.dados.para === "RATIFICADA" ? "Interdição ratificada: ela segue em vigor até o Setor levantá-la." : "Ato revogado: ele deixa de valer.", ato: await detalharAto(pool, { intervencaoId, acesso }) };
}

// Levantar a interdição, atender ou cancelar o pedido de remoção.
async function fecharAto(pool, { intervencaoId, acao, dados, por, acesso, hoje = hojeBrasilia(), deps }) {
  const a = await buscarAto(pool, intervencaoId);
  if (!a) return { sucesso: false, mensagem: "Ato não encontrado." };
  const v = st.validarFechamento(dados, { acao });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const ato = mapearAto(a);
  if (ato.tipo !== v.dados.tipo) return { sucesso: false, mensagem: ato.tipo === "INTERDICAO" ? "Uma interdição se levanta; ela não é atendida nem cancelada." : "Um pedido de remoção é atendido ou cancelado; ele não se levanta." };
  if (!st.podeAgirNoAto(ato, acao, acesso)) {
    if (!st.STATUS_ATO_ABERTOS.includes(a.Status)) return { sucesso: false, mensagem: `Este ato já está ${st.STATUS_ATO[a.Status].toLowerCase()}.` };
    return { sucesso: false, proibido: true, mensagem: acao === "LEVANTAR" ? "Só quem emitiu a interdição (enquanto serve no setor) ou a Diretoria Executiva a levanta."
      : acao === "ATENDER" ? "Só quem cuida da rede, o líder da congregação, a administração dos setores ou a Diretoria marca o pedido como atendido (e nunca quem o emitiu)."
      : "Só quem emitiu o pedido o cancela." };
  }
  const de = acao === "LEVANTAR" ? ["EMITIDA", "RATIFICADA"] : ["EMITIDA"];
  const ok = await moverAto(pool, { intervencaoId, de, para: v.dados.para, decisao: false, por, observacao: v.dados.observacao });
  if (!ok) return { sucesso: false, mensagem: "Este ato já mudou de situação: atualize a tela." };
  await registrarAuditoria({ tabela: "SetoresTecnicosIntervencoes", registroId: intervencaoId, acao: acao === "LEVANTAR" ? "INTERDICAO_LEVANTADA" : acao === "ATENDER" ? "REMOCAO_POSTAGEM_ATENDIDA" : "REMOCAO_POSTAGEM_CANCELADA", usuarioId: por, dadosDepois: { tipo: a.Tipo, congregacaoId: a.CongregacaoId, observacaoTamanho: (v.dados.observacao || "").length } });
  if (a.Tipo === "INTERDICAO") {
    await avisarDecisao(pool, { ato: a, por, hoje, regraChave: "SETOR_INTERDICAO_DECIDIDA", referenciaId: intervencaoId * 10 + 3, deps,
      mensagem: st.textoInterdicaoDecidida({ decisao: "LEVANTADA", setorNome: a.SetorNome, congregacaoNome: a.CongregacaoNome, objeto: a.Objeto, observacao: v.dados.observacao }) });
  } else {
    await avisarDecisao(pool, { ato: a, por, hoje, regraChave: "SETOR_REMOCAO_DECIDIDA", referenciaId: intervencaoId * 10 + (v.dados.para === "ATENDIDA" ? 3 : 4), deps,
      mensagem: st.textoRemocaoDecidida({ para: v.dados.para, setorNome: a.SetorNome, congregacaoNome: a.CongregacaoNome, observacao: v.dados.observacao }) });
  }
  return { sucesso: true, mensagem: acao === "LEVANTAR" ? "Interdição levantada: o risco foi sanado." : acao === "ATENDER" ? "Pedido dado como atendido." : "Pedido cancelado.", ato: await detalharAto(pool, { intervencaoId, acesso }) };
}

// ---------------------------------------------------------------
// Avisos periódicos (motor vB.2): cobrança diária da Diretoria
// ---------------------------------------------------------------

async function destinatariosDaCobranca(pool) {
  const diretoria = await portadoresDe(pool, "setores_ratificacao");
  return diretoria.length ? diretoria : portadoresDe(pool, "setores_tecnicos");
}

// A interdição sem ratificação, depois do prazo, é cobrada TODO dia (a chave do aviso leva o dia): a segurança da vida não pode esperar um aviso por mês.
async function detectarInterdicoesPendentes(pool, { hoje = hojeBrasilia() } = {}) {
  const dias = await lerPrazoDias(pool, "SETOR_INTERDICAO_LEMBRETE_DIAS", st.LEMBRETE_DIAS_PADRAO);
  const r = await pool.request().input("d", sql.Int, dias).query(`
    SELECT i.IntervencaoId, c.Nome AS CongregacaoNome, s.Nome AS SetorNome, i.Objeto, i.EmitidaEm
    FROM SetoresTecnicosIntervencoes i JOIN SetoresTecnicos s ON s.SetorId = i.SetorId JOIN Congregacoes c ON c.CongregacaoId = i.CongregacaoId
    WHERE i.Tipo = 'INTERDICAO' AND i.Status = 'EMITIDA' AND i.EmitidaEm <= DATEADD(DAY, -@d, SYSUTCDATETIME()) ORDER BY i.IntervencaoId`);
  if (r.recordset.length === 0) return [];
  const destinatarios = await destinatariosDaCobranca(pool);
  if (destinatarios.length === 0) return [];
  return r.recordset.map(x => ({
    referenciaId: x.IntervencaoId * 10000 + diaDoAviso(hoje), destinatarios,
    fatoGerador: st.textoInterdicaoPendente({ setorNome: x.SetorNome, congregacaoNome: x.CongregacaoNome, objeto: x.Objeto, emitidaEm: isoData(x.EmitidaEm), dias: diasDesde(x.EmitidaEm, hoje) })
  }));
}

async function detectarRemocoesPendentes(pool, { hoje = hojeBrasilia() } = {}) {
  const dias = await lerPrazoDias(pool, "SETOR_REMOCAO_LEMBRETE_DIAS", st.LEMBRETE_DIAS_PADRAO);
  const r = await pool.request().input("d", sql.Int, dias).query(`
    SELECT i.IntervencaoId, i.CongregacaoId, i.CanalId, c.Nome AS CongregacaoNome, s.Nome AS SetorNome, i.EmitidaEm
    FROM SetoresTecnicosIntervencoes i JOIN SetoresTecnicos s ON s.SetorId = i.SetorId JOIN Congregacoes c ON c.CongregacaoId = i.CongregacaoId
    WHERE i.Tipo = 'REMOCAO_POSTAGEM' AND i.Status = 'EMITIDA' AND i.EmitidaEm <= DATEADD(DAY, -@d, SYSUTCDATETIME()) ORDER BY i.IntervencaoId`);
  const fatos = [];
  const diretoria = await destinatariosDaCobranca(pool);
  for (const x of r.recordset) {
    const destinatarios = mesclar(diretoria, await administradoresDoCanal(pool, x.CanalId), await lideresDaCongregacao(pool, x.CongregacaoId));
    if (destinatarios.length === 0) continue;
    fatos.push({ referenciaId: x.IntervencaoId * 10000 + diaDoAviso(hoje), destinatarios, fatoGerador: st.textoRemocaoPendente({ setorNome: x.SetorNome, congregacaoNome: x.CongregacaoNome, emitidaEm: isoData(x.EmitidaEm), dias: diasDesde(x.EmitidaEm, hoje) }) });
  }
  return fatos;
}

// ---------------------------------------------------------------
// Retenção do IP (LGPD art. 16) e direito de acesso do titular (art. 18)
// ---------------------------------------------------------------

// Anonimiza o IP e os cabeçalhos do aceite digital de quem deixou o setor há mais de N dias (o mesmo prazo da adesão geral). Quem segue servindo mantém o IP:
// a prova ainda pode ser necessária. O gatilho do banco só admite esta mudança.
async function anonimizarIpsVencidos(pool, { hoje = hojeBrasilia() } = {}) {
  const dias = await lerPrazoDias(pool, "VOLUNTARIADO_IP_RETENCAO_DIAS", st.IP_RETENCAO_DIAS_PADRAO);
  const r = await pool.request().input("hoje", sql.Date, hoje).input("dias", sql.Int, dias).query(`
    UPDATE a SET EnderecoIp = N'anonimizado', CadeiaCabecalhos = NULL
    FROM SetoresTecnicosAdesoes a JOIN SetoresTecnicosMembros v ON v.VinculoId = a.VinculoId
    WHERE a.Forma = 'CLICKWRAP' AND (a.EnderecoIp <> N'anonimizado' OR a.CadeiaCabecalhos IS NOT NULL)
      AND v.Status = 'ENCERRADO' AND v.EncerradoEm < DATEADD(DAY, -@dias, @hoje);
    SELECT @@ROWCOUNT AS total;`);
  const total = r.recordset[0] ? Number(r.recordset[0].total) : 0;
  if (total > 0) await registrarAuditoria({ tabela: "SetoresTecnicosAdesoes", registroId: 0, acao: "IP_ANONIMIZADO", usuarioId: null, dadosDepois: { quantidade: total, retencaoDias: dias, referencia: hoje } });
  return { anonimizados: total, retencaoDias: dias };
}

// O que os Setores Técnicos guardam da PRÓPRIA pessoa. Fica de fora o texto livre escrito por outras pessoas (as observações de encerramento) e a identidade de
// quem decidiu; o titular recebe o fato (quando, onde, de que tipo) e a orientação de pedir o resto à Secretaria.
async function dadosDoTitular(pool, membroId) {
  const q = (texto) => pool.request().input("m", sql.Int, membroId).query(texto);
  const [vinculos, atos] = await Promise.all([
    q(`SELECT v.Status, v.Origem, v.Formacao, v.ConselhoSigla, v.RegistroNumero, v.CriadoEm, v.AtivadoEm, v.EncerradoEm, v.MotivoEncerramento, s.Nome AS Setor,
              a.Forma, a.TermoVersao, a.TermoHash, a.DataAceite, a.AceitoEm, a.EnderecoIp, a.CadeiaCabecalhos, a.CanalMensageria, a.Referencia, a.RegistradoPorMembroId
       FROM SetoresTecnicosMembros v JOIN SetoresTecnicos s ON s.SetorId = v.SetorId LEFT JOIN SetoresTecnicosAdesoes a ON a.VinculoId = v.VinculoId WHERE v.MembroId = @m ORDER BY v.VinculoId DESC`),
    q(`SELECT TOP (${st.LIMITE_LISTA}) i.Tipo, i.Motivo, i.Status, i.EmitidaEm, i.Objeto, i.Referencia, i.Descricao, i.RegistroProfissional, s.Nome AS Setor, c.Nome AS Congregacao
       FROM SetoresTecnicosIntervencoes i JOIN SetoresTecnicos s ON s.SetorId = i.SetorId JOIN Congregacoes c ON c.CongregacaoId = i.CongregacaoId WHERE i.EmitidaPorMembroId = @m ORDER BY i.IntervencaoId DESC`)
  ]);
  return {
    vinculos: vinculos.recordset.map(x => ({
      setor: x.Setor, situacao: x.Status, origem: x.Origem, formacao: x.Formacao, registroProfissional: st.rotuloRegistro(x.ConselhoSigla, x.RegistroNumero),
      desde: isoInstante(x.CriadoEm), ativadoEm: isoInstante(x.AtivadoEm), encerradoEm: isoInstante(x.EncerradoEm), motivoEncerramento: x.MotivoEncerramento ? st.MOTIVOS_ENCERRAMENTO[x.MotivoEncerramento] : null,
      termo: x.Forma ? {
        forma: vol.FORMAS_ADESAO[x.Forma], versao: x.TermoVersao, hash: x.TermoHash, dataAceite: isoData(x.DataAceite), aceitoEm: isoInstante(x.AceitoEm),
        enderecoIp: x.EnderecoIp, cadeiaCabecalhos: x.CadeiaCabecalhos, canalMensageria: x.CanalMensageria, referencia: x.Referencia, registradoPelaSecretaria: x.RegistradoPorMembroId != null
      } : null
    })),
    atosQueEmiti: atos.recordset.map(x => ({
      tipo: st.TIPOS_ATO[x.Tipo], setor: x.Setor, congregacao: x.Congregacao, motivo: (x.Tipo === "INTERDICAO" ? st.MOTIVOS_INTERDICAO : st.MOTIVOS_REMOCAO)[x.Motivo], situacao: st.STATUS_ATO[x.Status],
      emitidoEm: isoInstante(x.EmitidaEm), objeto: x.Objeto || null, referencia: x.Referencia || null, justificativa: x.Descricao, registroProfissional: x.RegistroProfissional || null
    })),
    aviso: "As observações escritas por quem aprovou, encerrou ou decidiu cada ato ficam com a Secretaria: peça-as pelo canal do Encarregado de Dados (LGPD art. 18)."
  };
}

module.exports = {
  mapearSetor, setorParaTermo, buscarSetor, listarCatalogo, criarSetor, editarSetor, alterarAtivoSetor,
  mapearVinculo, buscarVinculo, listarVinculos, meuPainel, candidatar, indicar, aprovar, recusarCandidatura, encerrarVinculo, sairDoSetor,
  termoDoVinculo, aceitarTermo, registrarTermoManual,
  contextoDeAcesso, mapearAto, listarAtos, detalharAto, canaisDaCongregacao, vinculosQueEmitem, emitirInterdicao, emitirPedidoRemocao, decidirAto, fecharAto,
  detectarInterdicoesPendentes, detectarRemocoesPendentes, anonimizarIpsVencidos, dadosDoTitular,
  lideresDaCongregacao, administradoresDoCanal, portadoresDe, mesclar
};
