// shared/vistoriaAntecedentesDb.js (v7.6 — Termo de Vistoria de antecedentes)
//
// A parte com banco. A regra (validação, textos) está em shared/vistoriaAntecedentes.js. Acesso exclusivo da Diretoria Executiva e do Conselho de Ética
// (permissão `vistoria_antecedentes`, nível geral): a rota confere antes de chegar aqui. O sistema NUNCA recebe a certidão, só o hash dela. Nada do parecer nem
// do hash vai para a trilha de auditoria (que é imutável e replicaria o dado): ali ficam o resultado, o motivo e as contagens.
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const { hojeBrasilia } = require("./dataBrasilia");
const cal = require("./calendario");
const vol = require("./voluntariado");
const va = require("./vistoriaAntecedentes");
const canaisDb = require("./canaisDb");

const { isoInstante, notificarAgora } = canaisDb;
const isoData = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
async function fecharTransacao(transaction, ok) {
  try { if (ok) await transaction.commit(); else await transaction.rollback(); } catch { /* já encerrada */ }
}
const chaveMensal = (hoje) => { const [a, m] = hoje.split("-").map(Number); return (a - 2000) * 12 + m; };

async function lerMembro(pool, membroId) {
  const r = await pool.request().input("id", sql.Int, membroId).query(`SELECT MembroId, Nome, Email, Status FROM MembroReferencia WHERE MembroId = @id`);
  return r.recordset[0] || null;
}

function mapearVistoria(r, documentos = []) {
  return {
    vistoriaId: r.VistoriaId, membroId: r.MembroId, membroNome: r.MembroNome, motivo: r.Motivo, rotuloMotivo: va.MOTIVOS[r.Motivo].rotulo, baseMotivo: va.MOTIVOS[r.Motivo].base,
    funcao: r.Funcao, comVulneraveis: !!r.ComVulneraveis, dataVerificacao: isoData(r.DataVerificacao), resultado: r.Resultado, rotuloResultado: va.RESULTADOS[r.Resultado],
    parecer: r.Parecer, destinoOriginal: r.DestinoOriginal || null, rotuloDestino: r.DestinoOriginal ? va.DESTINOS_ORIGINAL[r.DestinoOriginal] : null,
    assinadaPorMembroId: r.AssinadaPorMembroId, assinadaPorNome: r.AssinadaPorNome, assinadaEm: isoInstante(r.AssinadaEm),
    documentos: documentos.map(d => ({ tipo: d.Tipo, rotuloTipo: va.TIPOS_DOCUMENTO[d.Tipo], hash: d.HashSha256, dataEmissao: isoData(d.DataEmissao) }))
  };
}

const SELECT_VISTORIA = `
  SELECT v.*, m.Nome AS MembroNome, a.Nome AS AssinadaPorNome
  FROM VistoriasAntecedentes v JOIN MembroReferencia m ON m.MembroId = v.MembroId JOIN MembroReferencia a ON a.MembroId = v.AssinadaPorMembroId`;

async function carregarDocumentos(pool, vistoriaIds) {
  const mapa = new Map();
  if (vistoriaIds.length === 0) return mapa;
  const rq = pool.request();
  const marcas = vistoriaIds.map((id, i) => { rq.input(`v${i}`, sql.Int, id); return `@v${i}`; }).join(", ");
  const r = await rq.query(`SELECT VistoriaId, Tipo, HashSha256, DataEmissao FROM VistoriasDocumentos WHERE VistoriaId IN (${marcas}) ORDER BY DocumentoId`);
  for (const d of r.recordset) { if (!mapa.has(d.VistoriaId)) mapa.set(d.VistoriaId, []); mapa.get(d.VistoriaId).push(d); }
  return mapa;
}

async function listarVistorias(pool, { membroId = null, limite = va.LIMITE_LISTA } = {}) {
  const rq = pool.request();
  if (membroId) rq.input("m", sql.Int, membroId);
  const r = await rq.query(`SELECT TOP (${Number(limite) || va.LIMITE_LISTA}) * FROM (${SELECT_VISTORIA} ${membroId ? "WHERE v.MembroId = @m" : ""}) x ORDER BY x.VistoriaId DESC`);
  const docs = await carregarDocumentos(pool, r.recordset.map(x => x.VistoriaId));
  return r.recordset.map(x => mapearVistoria(x, docs.get(x.VistoriaId) || []));
}

async function detalharVistoria(pool, vistoriaId) {
  const r = await pool.request().input("id", sql.Int, vistoriaId).query(`${SELECT_VISTORIA} WHERE v.VistoriaId = @id`);
  if (!r.recordset[0]) return null;
  const docs = await carregarDocumentos(pool, [vistoriaId]);
  return mapearVistoria(r.recordset[0], docs.get(vistoriaId) || []);
}

// O pedido da Diretoria (Art. 133 §5º, I): avisa a pessoa. Não cria registro; o ato fica na trilha de auditoria.
async function solicitarCertidoes(pool, { dados, por, deps }) {
  const v = va.validarSolicitacao(dados, { atorId: por });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const membro = await lerMembro(pool, v.dados.membroId);
  if (!membro) return { sucesso: false, mensagem: "Pessoa não encontrada." };
  const n = await pool.request().input("m", sql.Int, membro.MembroId).query(`SELECT COUNT(*) AS n FROM Notificacoes WHERE RegraChave = N'VISTORIA_SOLICITADA' AND DestinatarioMembroId = @m AND CriadaEm >= DATEADD(HOUR, -24, SYSUTCDATETIME())`);
  if (Number(n.recordset[0].n) >= 2) return { sucesso: false, mensagem: "Esta pessoa já foi avisada duas vezes nas últimas 24 horas. Fale com ela diretamente." };
  await registrarAuditoria({ tabela: "VistoriasAntecedentes", registroId: 0, acao: "VISTORIA_SOLICITADA", usuarioId: por, dadosDepois: { membroId: membro.MembroId, motivo: v.dados.motivo } });
  // A referência leva o instante (em segundos) para cada pedido gerar um aviso novo (o motor deduplica por regra, pessoa e referência).
  const r = await notificarAgora(pool, { regraChave: "VISTORIA_SOLICITADA", destinatarios: [{ membroId: membro.MembroId, nome: membro.Nome, email: membro.Email }],
    mensagem: va.textoSolicitacao(v.dados), referenciaId: Math.floor(Date.now() / 1000) % 2000000000, referenciaTabela: "VistoriasAntecedentes", deps });
  return { sucesso: true, avisou: !!(r && r.criadas), mensagem: `${membro.Nome} foi avisado(a) de que a Diretoria solicita as certidões.` };
}

// Lavra o Termo de Vistoria: o termo e as certidões (só os hashes) entram juntos ou não entram.
async function lavrarVistoria(pool, { dados, por, hoje = hojeBrasilia() }) {
  const v = va.validarVistoria(dados, { hoje, atorId: por });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const d = v.dados;
  const membro = await lerMembro(pool, d.membroId);
  if (!membro) return { sucesso: false, mensagem: "Pessoa não encontrada." };
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let id;
  try {
    const r = await new sql.Request(transaction).input("m", sql.Int, d.membroId).input("mot", sql.NVarChar(24), d.motivo).input("f", sql.NVarChar(150), d.funcao)
      .input("vuln", sql.Bit, d.comVulneraveis ? 1 : 0).input("dv", sql.Date, d.dataVerificacao).input("res", sql.NVarChar(14), d.resultado).input("p", sql.NVarChar(1000), d.parecer)
      .input("dest", sql.NVarChar(10), d.destinoOriginal).input("por", sql.Int, por)
      .query(`INSERT INTO VistoriasAntecedentes (MembroId, Motivo, Funcao, ComVulneraveis, DataVerificacao, Resultado, Parecer, DestinoOriginal, AssinadaPorMembroId)
              VALUES (@m, @mot, @f, @vuln, @dv, @res, @p, @dest, @por); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`);
    id = r.recordset[0].id;
    for (const doc of d.documentos) {
      await new sql.Request(transaction).input("v", sql.Int, id).input("t", sql.NVarChar(30), doc.tipo).input("h", sql.NVarChar(64), doc.hash).input("e", sql.Date, doc.dataEmissao)
        .query(`INSERT INTO VistoriasDocumentos (VistoriaId, Tipo, HashSha256, DataEmissao) VALUES (@v, @t, @h, @e)`);
    }
    await transaction.commit();
  } catch (e) { await fecharTransacao(transaction, false); throw e; }
  await registrarAuditoria({ tabela: "VistoriasAntecedentes", registroId: id, acao: "VISTORIA_LAVRADA", usuarioId: por,
    dadosDepois: { membroId: d.membroId, motivo: d.motivo, resultado: d.resultado, comVulneraveis: d.comVulneraveis, documentos: d.documentos.length, parecerTamanho: d.parecer.length } });
  return { sucesso: true, mensagem: `Termo de Vistoria de ${membro.Nome} lavrado e assinado por você${d.resultado === "RECUSA" ? ": a recusa implica impedimento ou afastamento preventivo da função (Art. 133 §5º, I, “a”), que a Diretoria aplica" : ""}.`, vistoria: await detalharVistoria(pool, id) };
}

// A última vistoria da pessoa (para outras telas e para a v7.7). null = nunca vistoriada.
async function ultimaVistoria(pool, membroId) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`SELECT TOP 1 VistoriaId, DataVerificacao, Resultado, Motivo FROM VistoriasAntecedentes WHERE MembroId = @m ORDER BY VistoriaId DESC`);
  const x = r.recordset[0];
  return x ? { vistoriaId: x.VistoriaId, dataVerificacao: isoData(x.DataVerificacao), resultado: x.Resultado, motivo: x.Motivo } : null;
}

// Quem exerce liderança e ainda não passou pela vistoria (ou só tem a recusa registrada): o que a Diretoria precisa ver para a regra da investidura (II, "a").
async function liderancasSemVistoria(pool) {
  const r = await pool.request().query(`
    SELECT m.MembroId, m.Nome, c.Nome AS CongregacaoNome, STRING_AGG(p.Nome, N', ') WITHIN GROUP (ORDER BY p.Nome) AS Cargos,
           (SELECT TOP 1 v.Resultado FROM VistoriasAntecedentes v WHERE v.MembroId = m.MembroId ORDER BY v.VistoriaId DESC) AS UltimoResultado
    FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId JOIN MembroReferencia m ON m.MembroId = l.MembroId LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    WHERE (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE)) AND m.Status = 'ATIVO'
      AND NOT EXISTS (SELECT 1 FROM VistoriasAntecedentes v WHERE v.MembroId = m.MembroId AND v.Resultado <> 'RECUSA')
    GROUP BY m.MembroId, m.Nome, c.Nome ORDER BY m.Nome`);
  return r.recordset.map(x => ({ membroId: x.MembroId, nome: x.Nome, congregacaoNome: x.CongregacaoNome || null, cargos: x.Cargos, ultimoResultado: x.UltimoResultado || null, recusou: x.UltimoResultado === "RECUSA" }));
}

// Aviso mensal à Diretoria: quantas lideranças em exercício seguem sem Termo de Vistoria. Um aviso por mês (a chave leva o mês).
async function detectarLiderancasSemVistoria(pool, { hoje = hojeBrasilia() } = {}) {
  const lista = await liderancasSemVistoria(pool);
  if (lista.length === 0) return [];
  const { resolverDestinatariosPorPermissao } = require("./notificacoes");
  const destinatarios = (await resolverDestinatariosPorPermissao(pool, { permissao: "vistoria_antecedentes" })).map(d => ({ membroId: d.membroId, nome: d.nome, email: d.email }));
  if (destinatarios.length === 0) return [];
  return [{ referenciaId: chaveMensal(hoje), destinatarios, fatoGerador: va.textoPendentes({ total: lista.length, nomes: lista.map(x => x.nome) }) }];
}

// O direito de acesso do titular (LGPD art. 18, I): as vistorias feitas sobre a PRÓPRIA pessoa, com o parecer e os hashes. Não inclui quem assinou.
async function dadosDoTitular(pool, membroId) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`SELECT VistoriaId, Motivo, Funcao, DataVerificacao, Resultado, Parecer, DestinoOriginal, AssinadaEm FROM VistoriasAntecedentes WHERE MembroId = @m ORDER BY VistoriaId DESC`);
  const docs = await carregarDocumentos(pool, r.recordset.map(x => x.VistoriaId));
  return {
    vistorias: r.recordset.map(x => ({
      motivo: va.MOTIVOS[x.Motivo].rotulo, funcao: x.Funcao, dataVerificacao: isoData(x.DataVerificacao), resultado: va.RESULTADOS[x.Resultado], parecer: x.Parecer,
      destinoDoOriginal: x.DestinoOriginal ? va.DESTINOS_ORIGINAL[x.DestinoOriginal] : null, lavradaEm: isoInstante(x.AssinadaEm),
      certidoes: (docs.get(x.VistoriaId) || []).map(d => ({ tipo: va.TIPOS_DOCUMENTO[d.Tipo], hash: d.HashSha256, dataEmissao: isoData(d.DataEmissao) }))
    })),
    aviso: "A Igreja guarda só o código (hash) de cada certidão, nunca o documento. Quem assinou cada termo fica com a Diretoria: peça-o pelo canal do Encarregado de Dados (LGPD art. 18)."
  };
}

module.exports = { mapearVistoria, listarVistorias, detalharVistoria, solicitarCertidoes, lavrarVistoria, ultimaVistoria, liderancasSemVistoria, detectarLiderancasSemVistoria, dadosDoTitular };
