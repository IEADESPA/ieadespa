// shared/menoresConsentimentoDb.js (v7.7 — Habilitação para Ministério com Menores)
//
// A parte com banco do consentimento do responsável (LGPD art. 14, § 1º). Toda decisão de regra (textos, hash, validações, estado) está em
// shared/menoresConsentimento.js, pura e testada; aqui só se carrega, se chama a regra e se grava, com auditoria. Funções devolvem { sucesso, mensagem, ... }; recusa de
// regra é sucesso:false (a rota a mostra como 422); `proibido:true` vira 403. Nenhum IP nem texto livre vai para a trilha de auditoria (imutável): só ids e códigos.
//
// A trilha é de ACRÉSCIMO (tabela MinisterioMenoresConsentimentos, migração 143): conceder e revogar são linhas novas, o estado de cada (menor, finalidade) é a
// ÚLTIMA linha, e quem concedeu tem de continuar sendo responsável ATIVO do menor (VoluntariadoResponsaveis, cadastrado pela Secretaria com o documento conferido).
// Os dois comandos que gravam (concedir e revogar) conferem as condições NO MESMO comando do INSERT, com trava de intervalo (UPDLOCK, HOLDLOCK): dois cliques ou
// dois responsáveis ao mesmo tempo não duplicam a linha, e um responsável revogado no meio do caminho não consegue gravar.
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const { hojeBrasilia } = require("./dataBrasilia");
const vol = require("./voluntariado");
const mc = require("./menoresConsentimento");
const storage = require("./storage");
const { isoInstante, lerPrazoDias } = require("./canaisDb");

const MAX_IN = 500;
const TABELA = "MinisterioMenoresConsentimentos";

function listaIn(request, prefixo, valores, tipo = sql.Int) {
  return valores.map((v, i) => { request.input(`${prefixo}${i}`, tipo, v); return `@${prefixo}${i}`; }).join(", ");
}

async function lerMembro(pool, membroId) {
  const r = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT m.MembroId, m.Nome, m.DataNascimento, m.FotoUrl, c.Nome AS CongregacaoNome, e.Nome AS ExtensaoNome
    FROM MembroReferencia m
    LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId
    WHERE m.MembroId = @id`);
  return r.recordset[0] || null;
}

// ---------------------------------------------------------------
// Leitura: a última linha de cada finalidade e os responsáveis ativos
// ---------------------------------------------------------------

function mapearLinha(r) {
  return {
    consentimentoId: r.ConsentimentoId, menorId: r.MenorMembroId, responsavelId: Number(r.ResponsavelMembroId), finalidade: r.Finalidade, concedido: !!r.Concedido,
    textoVersao: r.TextoVersao, textoHash: r.TextoHash, forma: r.Forma, registradoEm: isoInstante(r.RegistradoEm), referencia: r.Referencia || null
  };
}

// Para cada menor de `menorIds`: { linhas: { IMAGEM, SAUDE_CRACHA } (a ÚLTIMA de cada uma), ativos: [{ responsavelId, nome, vinculo, rotuloVinculo }] }.
// Duas consultas, qualquer que seja o número de menores.
async function carregarContexto(pool, menorIds) {
  const ids = [...new Set((menorIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX_IN);
  const mapa = new Map(ids.map((id) => [id, { linhas: {}, ativos: [] }]));
  if (!ids.length) return mapa;
  const rq1 = pool.request();
  const l1 = listaIn(rq1, "m", ids);
  const linhas = await rq1.query(`
    SELECT c.ConsentimentoId, c.MenorMembroId, c.ResponsavelMembroId, c.Finalidade, c.Concedido, c.TextoVersao, c.TextoHash, c.Forma, c.RegistradoEm, c.Referencia
    FROM ${TABELA} c
    WHERE c.MenorMembroId IN (${l1})
      AND c.ConsentimentoId = (SELECT MAX(x.ConsentimentoId) FROM ${TABELA} x WHERE x.MenorMembroId = c.MenorMembroId AND x.Finalidade = c.Finalidade)`);
  for (const r of linhas.recordset) { const c = mapa.get(Number(r.MenorMembroId)); if (c) c.linhas[r.Finalidade] = mapearLinha(r); }
  const rq2 = pool.request();
  const l2 = listaIn(rq2, "m", ids);
  const ativos = await rq2.query(`
    SELECT r.MenorMembroId, r.ResponsavelMembroId, r.Vinculo, p.Nome
    FROM VoluntariadoResponsaveis r JOIN MembroReferencia p ON p.MembroId = r.ResponsavelMembroId
    WHERE r.MenorMembroId IN (${l2}) AND r.RevogadoEm IS NULL ORDER BY r.ResponsavelId`);
  for (const r of ativos.recordset) {
    const c = mapa.get(Number(r.MenorMembroId));
    if (c) c.ativos.push({ responsavelId: Number(r.ResponsavelMembroId), nome: r.Nome, vinculo: r.Vinculo, rotuloVinculo: vol.VINCULOS_RESPONSAVEL[r.Vinculo] || null });
  }
  return mapa;
}

// O estado de uma finalidade como a tela o recebe. `paraGestao`: a Secretaria também vê quem concedeu (matrícula) e a referência da ficha; `visitanteId`: marca
// "concedido por você" para o responsável. A tela do responsável nunca recebe a matrícula nem o nome dos outros responsáveis.
function estadoDaFinalidade(finalidade, linha, ativos, { paraGestao = false, visitanteId = null } = {}) {
  const estado = mc.estadoDoConsentimento(linha, ativos.map((a) => a.responsavelId));
  const o = { finalidade, rotuloFinalidade: mc.FINALIDADES[finalidade], ...estado, integridade: linha ? mc.avaliarIntegridade(linha, finalidade) : null };
  if (visitanteId != null) o.concedidoPorVoce = !!(linha && linha.concedido && Number(linha.responsavelId) === Number(visitanteId));
  if (paraGestao) { o.concedidoPorMembroId = linha ? linha.responsavelId : null; o.referencia = linha ? linha.referencia : null; }
  return o;
}
function estadosDoContexto(ctx, opcoes) {
  const saida = {};
  for (const f of mc.CODIGOS_FINALIDADE) saida[f] = estadoDaFinalidade(f, ctx.linhas[f] || null, ctx.ativos, opcoes);
  return saida;
}

// Quem tem relação com o menor: o responsável ATIVO dele, e o próprio cadastro (a Secretaria confere o escopo depois, com o que volta daqui).
async function acessoAoMenor(pool, { menorId, membroId }) {
  const rel = await pool.request().input("mn", sql.Int, menorId).input("rs", sql.Int, membroId)
    .query(`SELECT TOP 1 ResponsavelId FROM VoluntariadoResponsaveis WHERE MenorMembroId = @mn AND ResponsavelMembroId = @rs AND RevogadoEm IS NULL`);
  return { ehResponsavel: !!rel.recordset[0], menor: await lerMembro(pool, menorId) };
}

// Os dois estados do menor e os responsáveis ativos, sem dado desnecessário (nunca a data de nascimento: só a idade). `menor`: a linha já lida (acessoAoMenor).
async function estadoDoMenor(pool, menorId, { hoje = hojeBrasilia(), menor = null, paraGestao = false, visitanteId = null } = {}) {
  const m = menor || await lerMembro(pool, menorId);
  if (!m) return { sucesso: false, mensagem: mc.MENSAGENS.MENOR_NAO_ACHADO };
  const idade = vol.idadeEmAnos(m.DataNascimento, hoje);
  const cond = mc.condicaoDoMenor(idade);
  const info = { membroId: Number(m.MembroId), nome: m.Nome, idade, aindaMenor: cond.menor };
  if (paraGestao) info.congregacaoNome = m.CongregacaoNome || null;
  // Quem não é menor de 18 anos (ou não tem data de nascimento) não tem consentimento de responsável a dar: o aviso diz por quê.
  if (!cond.menor) return { sucesso: true, menor: info, estados: null, responsaveis: [], mensagem: cond.motivo };
  const ctx = (await carregarContexto(pool, [menorId])).get(Number(menorId));
  return {
    sucesso: true, menor: info, estados: estadosDoContexto(ctx, { paraGestao, visitanteId }),
    responsaveis: ctx.ativos.map((a) => ({ ...(paraGestao ? { membroId: a.responsavelId } : {}), nome: a.nome, vinculo: a.vinculo, rotuloVinculo: a.rotuloVinculo }))
  };
}

// Meu Painel do responsável: os menores dele (só os que ainda têm menos de 18 anos) e os dois estados de cada um. Reaproveita o cadastro de responsáveis da v7.5.
async function menoresDoResponsavel(pool, responsavelId, { hoje = hojeBrasilia() } = {}) {
  const lista = (await require("./voluntariadoDb").menoresDoResponsavel(pool, responsavelId, { hoje })).filter((x) => x.aindaMenor);
  const ctx = await carregarContexto(pool, lista.map((x) => x.menorId));
  return lista.map((x) => ({
    menorId: x.menorId, nome: x.nome, idade: x.idade, vinculo: x.vinculo, rotuloVinculo: x.rotuloVinculo,
    estados: estadosDoContexto(ctx.get(Number(x.menorId)), { visitanteId: responsavelId })
  }));
}

// A peça que as outras telas consultam: há consentimento VIGENTE desta finalidade para este menor? Uma consulta: a última linha concede, quem concedeu ainda é
// responsável ativo e a pessoa ainda tem menos de 18 anos (idade conhecida). Qualquer outra coisa (inclusive id ou finalidade inválidos) é "não".
async function consentimentoVigente(pool, menorId, finalidade, { hoje = hojeBrasilia() } = {}) {
  const id = mc.inteiroPositivo(menorId);
  if (!id || !mc.ehFinalidade(finalidade)) return false;
  const r = await pool.request().input("mn", sql.Int, id).input("f", sql.NVarChar(14), finalidade).query(`
    SELECT TOP 1 c.Concedido, m.DataNascimento,
           CASE WHEN EXISTS (SELECT 1 FROM VoluntariadoResponsaveis r WHERE r.MenorMembroId = c.MenorMembroId AND r.ResponsavelMembroId = c.ResponsavelMembroId AND r.RevogadoEm IS NULL) THEN 1 ELSE 0 END AS ResponsavelAtivo
    FROM ${TABELA} c JOIN MembroReferencia m ON m.MembroId = c.MenorMembroId
    WHERE c.MenorMembroId = @mn AND c.Finalidade = @f ORDER BY c.ConsentimentoId DESC`);
  const x = r.recordset[0];
  return !!x && !!x.Concedido && !!x.ResponsavelAtivo && mc.ehMenor(vol.idadeEmAnos(x.DataNascimento, hoje));
}

// ---------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------

// As condições do INSERT (conferidas no mesmo comando que grava, com trava de intervalo):
//  - o responsável ainda é ativo; e
//  - conceder: a última linha NÃO é um consentimento vigente com este mesmo texto (dois cliques gravam uma linha só); revogar: a última linha NÃO é uma revogação.
const ULTIMA = (a) => `${a}.ConsentimentoId = (SELECT MAX(x.ConsentimentoId) FROM ${TABELA} x WHERE x.MenorMembroId = @mn AND x.Finalidade = @f)`;
const RESPONSAVEL_ATIVO = `EXISTS (SELECT 1 FROM VoluntariadoResponsaveis WITH (UPDLOCK, HOLDLOCK) WHERE MenorMembroId = @mn AND ResponsavelMembroId = @rs AND RevogadoEm IS NULL)`;
const JA_REVOGADA = `EXISTS (SELECT 1 FROM ${TABELA} u WITH (UPDLOCK, HOLDLOCK) WHERE u.MenorMembroId = @mn AND u.Finalidade = @f AND u.Concedido = 0 AND ${ULTIMA("u")})`;
const JA_CONCEDIDA = `EXISTS (SELECT 1 FROM ${TABELA} u WITH (UPDLOCK, HOLDLOCK) WHERE u.MenorMembroId = @mn AND u.Finalidade = @f AND u.Concedido = 1 AND u.TextoHash = @h AND ${ULTIMA("u")}
      AND EXISTS (SELECT 1 FROM VoluntariadoResponsaveis ra WHERE ra.MenorMembroId = @mn AND ra.ResponsavelMembroId = u.ResponsavelMembroId AND ra.RevogadoEm IS NULL))`;

// Devolve o id da linha nova, ou null se as condições não valiam mais na hora de gravar (corrida).
async function inserirLinha(pool, { menorId, responsavelId, finalidade, concedido, textoVersao, textoHash, forma, ip = null, cadeia = null, referencia = null, por = null }) {
  const r = await pool.request().input("mn", sql.Int, menorId).input("rs", sql.Int, responsavelId).input("f", sql.NVarChar(14), finalidade).input("c", sql.Bit, concedido ? 1 : 0)
    .input("ver", sql.Int, textoVersao).input("h", sql.NVarChar(64), textoHash).input("forma", sql.NVarChar(12), forma)
    .input("ip", sql.NVarChar(45), ip).input("cad", sql.NVarChar(400), cadeia).input("ref", sql.NVarChar(200), referencia).input("por", sql.Int, por)
    .query(`INSERT INTO ${TABELA} (MenorMembroId, ResponsavelMembroId, Finalidade, Concedido, TextoVersao, TextoHash, Forma, EnderecoIp, CadeiaCabecalhos, Referencia, RegistradoPorMembroId)
            SELECT @mn, @rs, @f, @c, @ver, @h, @forma, @ip, @cad, @ref, @por
            WHERE ${RESPONSAVEL_ATIVO} AND NOT ${concedido ? JA_CONCEDIDA : JA_REVOGADA};
            DECLARE @n INT = @@ROWCOUNT; SELECT CASE WHEN @n = 1 THEN CAST(SCOPE_IDENTITY() AS INT) ELSE NULL END AS id`);
  return r.recordset[0] && r.recordset[0].id != null ? Number(r.recordset[0].id) : null;
}

// O efeito da revogação da IMAGEM: o arquivo da foto do menor é apagado (blob) e a referência zerada — a imagem "deixa de ser usada" de verdade, como o texto promete
// e como o ROPA/RIPD afirmam. É idempotente (sem foto, não há o que apagar) e o apagar do blob é best-effort (storage.excluirFoto nunca lança): a referência no SQL
// já foi zerada de qualquer forma. Devolve se HAVIA foto guardada.
async function apagarFotoDoMenor(pool, { menorId, fotoUrl, por }) {
  await pool.request().input("id", sql.Int, menorId).query(`UPDATE MembroReferencia SET FotoUrl = NULL WHERE MembroId = @id`);
  await storage.excluirFoto(menorId);
  const havia = !!fotoUrl;
  if (havia) await registrarAuditoria({ tabela: "MembroReferencia", registroId: Number(menorId), acao: "Excluiu a foto (consentimento de imagem revogado)", usuarioId: por, dadosDepois: { motivo: "REVOGACAO_IMAGEM" } });
  return havia;
}

// A foto de menor de 18 anos só fica guardada com a autorização VIGENTE do responsável. Quando a autorização acaba (revogada, o responsável deixou de ser responsável) ou nunca existiu
// (foto enviada antes da v7.7, com o consentimento do próprio menor, que não vale), o arquivo é apagado: na hora, no ato que tirou o responsável, e na rotina diária. Idade desconhecida
// não é menor. `menorId` limita a um menor.
async function apagarFotosDeMenoresSemConsentimento(pool, { menorId = null, hoje = hojeBrasilia(), por = null } = {}) {
  const rq = pool.request().input("hoje", sql.Date, hoje);
  let filtro = "";
  if (menorId) { rq.input("m", sql.Int, menorId); filtro = " AND m.MembroId = @m"; }
  const alvos = (await rq.query(`SELECT m.MembroId, m.FotoUrl FROM MembroReferencia m WHERE m.FotoUrl IS NOT NULL AND m.DataNascimento IS NOT NULL AND m.DataNascimento > DATEADD(YEAR, -18, @hoje)${filtro}`)).recordset;
  let apagadas = 0;
  for (const a of alvos) {
    if (await consentimentoVigente(pool, a.MembroId, "IMAGEM", { hoje })) continue;
    await apagarFotoDoMenor(pool, { menorId: a.MembroId, fotoUrl: a.FotoUrl, por });
    apagadas++;
  }
  return { apagadas };
}

// O responsável ATIVO concede, pelo menor, no aceite digital dele (sessão do próprio responsável; o IP é o dele). Valem os mesmos cuidados do aceite do voluntariado:
// caixa marcada, IP público identificável, responsável cadastrado, menor com idade conhecida abaixo de 18 — e mais: `textoHash` é o hash do texto que a tela MOSTROU.
// Se o texto mudou desde então, recusa com `termoMudou:true` (ninguém autoriza um texto que não leu).
async function conceder(pool, { menorId, responsavelId, finalidade, aceito, textoHash, ip, cadeia = null, hoje = hojeBrasilia() }) {
  const v = mc.validarConceder({ menorId, responsavelId, finalidade, aceito, termoHash: textoHash, ip });
  if (!v.valido) return { sucesso: false, ...(v.termoMudou ? { termoMudou: true } : {}), ...(v.proibido ? { proibido: true } : {}), mensagem: v.mensagem };
  const d = v.dados;
  // Só o responsável ATIVO deste menor: menor inexistente e responsável de outro recebem a mesma recusa (a rota não serve de sonda).
  const ctx = (await carregarContexto(pool, [d.menorId])).get(d.menorId);
  if (!ctx.ativos.some((a) => a.responsavelId === d.responsavelId)) return { sucesso: false, proibido: true, mensagem: mc.MENSAGENS.NAO_E_RESPONSAVEL };
  const menor = await lerMembro(pool, d.menorId);
  const resp = await lerMembro(pool, d.responsavelId);
  if (!menor || !resp) return { sucesso: false, proibido: true, mensagem: mc.MENSAGENS.NAO_E_RESPONSAVEL };
  const cm = mc.condicaoDoMenor(vol.idadeEmAnos(menor.DataNascimento, hoje));
  if (!cm.menor) return { sucesso: false, mensagem: cm.motivo };
  const cr = mc.condicaoDoResponsavel(vol.idadeEmAnos(resp.DataNascimento, hoje));
  if (!cr.pode) return { sucesso: false, mensagem: cr.motivo };
  const linha = ctx.linhas[d.finalidade] || null;
  const atual = mc.estadoDoConsentimento(linha, ctx.ativos.map((a) => a.responsavelId));
  if (atual.situacao === "CONCEDIDO" && linha.textoHash === d.textoHash) return { sucesso: false, mensagem: mc.mensagemJaConcedido() };
  const id = await inserirLinha(pool, { ...d, concedido: true, forma: "CLICK_RESP", ip, cadeia });
  if (id == null) return { sucesso: false, mensagem: mc.MENSAGENS.CONCORRENCIA };
  // O IP fica só na tabela do consentimento: a trilha de auditoria é imutável e não deve replicar dado pessoal.
  await registrarAuditoria({ tabela: TABELA, registroId: id, acao: "MENOR_CONSENTIMENTO_CONCEDIDO", usuarioId: d.responsavelId, dadosDepois: { menorId: d.menorId, finalidade: d.finalidade, forma: "CLICK_RESP", textoVersao: d.textoVersao, textoHash: d.textoHash } });
  const nova = { consentimentoId: id, menorId: d.menorId, responsavelId: d.responsavelId, finalidade: d.finalidade, concedido: true, textoVersao: d.textoVersao, textoHash: d.textoHash, forma: "CLICK_RESP", registradoEm: new Date().toISOString(), referencia: null };
  return {
    sucesso: true, consentimentoId: id, mensagem: mc.mensagemConcedido({ finalidade: d.finalidade, menorNome: menor.Nome }),
    estado: estadoDaFinalidade(d.finalidade, nova, ctx.ativos, { visitanteId: d.responsavelId })
  };
}

// Qualquer responsável ATIVO revoga (não só quem concedeu) — a qualquer momento, sem caixa, sem hash e sem exigir IP público (LGPD art. 8º, § 5º). Revogar IMAGEM apaga
// o arquivo da foto do menor. Revogar o que já estava revogado não grava de novo (mas, para IMAGEM, ainda limpa uma foto que tenha sobrado: quem pede para apagar
// quer a foto apagada). v7.10: quando o dado de saúde do crachá existir, é AQUI (finalidade SAUDE_CRACHA) que ele deve ser apagado.
async function revogar(pool, { menorId, responsavelId, finalidade, ip = null, cadeia = null, hoje = hojeBrasilia() }) {
  const v = mc.validarRevogar({ menorId, responsavelId, finalidade });
  if (!v.valido) return { sucesso: false, ...(v.proibido ? { proibido: true } : {}), mensagem: v.mensagem };
  const d = v.dados;
  const ctx = (await carregarContexto(pool, [d.menorId])).get(d.menorId);
  if (!ctx.ativos.some((a) => a.responsavelId === d.responsavelId)) return { sucesso: false, proibido: true, mensagem: mc.MENSAGENS.NAO_E_RESPONSAVEL };
  const menor = await lerMembro(pool, d.menorId);
  if (!menor) return { sucesso: false, proibido: true, mensagem: mc.MENSAGENS.NAO_E_RESPONSAVEL };
  // Quem já tem 18 anos decide sozinho: o responsável não revoga mais por ele (a foto e os dados dele passam a depender do consentimento dele).
  if (mc.ehAdulto(vol.idadeEmAnos(menor.DataNascimento, hoje))) return { sucesso: false, mensagem: mc.condicaoDoMenor(mc.MAIORIDADE).motivo };
  const linha = ctx.linhas[d.finalidade] || null;
  const ehImagem = d.finalidade === "IMAGEM";
  if (linha && !linha.concedido) {
    const fotoApagada = ehImagem ? await apagarFotoDoMenor(pool, { menorId: d.menorId, fotoUrl: menor.FotoUrl, por: d.responsavelId }) : false;
    return { sucesso: true, jaRevogada: true, fotoApagada, mensagem: mc.mensagemJaRevogado({ finalidade: d.finalidade, fotoApagada }), estado: estadoDaFinalidade(d.finalidade, linha, ctx.ativos, { visitanteId: d.responsavelId }) };
  }
  const t = mc.textoDe(d.finalidade);
  const id = await inserirLinha(pool, { ...d, concedido: false, textoVersao: t.versao, textoHash: t.hash, forma: "CLICK_RESP", ip: ip || mc.IP_INDISPONIVEL, cadeia });
  if (id == null) return { sucesso: false, mensagem: mc.MENSAGENS.CONCORRENCIA };
  // Primeiro a trilha do ato (a revogação já está gravada), depois o efeito: apagar a foto.
  const fotoApagada = ehImagem && !!menor.FotoUrl;
  await registrarAuditoria({ tabela: TABELA, registroId: id, acao: "MENOR_CONSENTIMENTO_REVOGADO", usuarioId: d.responsavelId, dadosDepois: { menorId: d.menorId, finalidade: d.finalidade, forma: "CLICK_RESP", fotoApagada } });
  if (ehImagem) await apagarFotoDoMenor(pool, { menorId: d.menorId, fotoUrl: menor.FotoUrl, por: d.responsavelId });
  const nova = { consentimentoId: id, menorId: d.menorId, responsavelId: d.responsavelId, finalidade: d.finalidade, concedido: false, textoVersao: t.versao, textoHash: t.hash, forma: "CLICK_RESP", registradoEm: new Date().toISOString(), referencia: null };
  return {
    sucesso: true, consentimentoId: id, fotoApagada, mensagem: mc.mensagemRevogado({ finalidade: d.finalidade, menorNome: menor.Nome, fotoApagada }),
    estado: estadoDaFinalidade(d.finalidade, nova, ctx.ativos, { visitanteId: d.responsavelId })
  };
}

// A ficha assinada pelo responsável, registrada pela Secretaria (concede ou revoga; a prova é o documento arquivado, apontado em `referencia`). `autorizacao`:
// { podeMembro(congregacaoNome, extensaoNome) } — o escopo é o da pessoa do MENOR; menor inexistente e menor fora do escopo recebem a mesma recusa (como em
// voluntariadoDb.designarResponsavel). Quem registra não é o responsável que assinou nem o próprio menor; o responsável tem de ser ATIVO deste menor.
async function registrarManual(pool, { menorId, responsavelId, finalidade, concedido, referencia, por, autorizacao, hoje = hojeBrasilia() }) {
  const v = mc.validarRegistroManual({ menorId, responsavelId, finalidade, concedido, referencia, por });
  if (!v.valido) return { sucesso: false, ...(v.proibido ? { proibido: true } : {}), mensagem: v.mensagem };
  const d = v.dados;
  const menor = await lerMembro(pool, d.menorId);
  if (!menor || !autorizacao || typeof autorizacao.podeMembro !== "function" || !autorizacao.podeMembro(menor.CongregacaoNome || null, menor.ExtensaoNome || null)) {
    return { sucesso: false, proibido: true, mensagem: mc.MENSAGENS.FORA_DO_ESCOPO };
  }
  const idade = vol.idadeEmAnos(menor.DataNascimento, hoje);
  // Conceder exige menor de idade conhecida; revogar só não vale para quem já é adulto (idade desconhecida não impede de desfazer).
  if (d.concedido ? !mc.condicaoDoMenor(idade).menor : mc.ehAdulto(idade)) return { sucesso: false, mensagem: mc.condicaoDoMenor(idade).motivo };
  const ctx = (await carregarContexto(pool, [d.menorId])).get(d.menorId);
  if (!ctx.ativos.some((a) => a.responsavelId === d.responsavelId)) {
    return { sucesso: false, mensagem: "Esta pessoa não consta como responsável cadastrado(a) deste(a) menor. Cadastre o responsável (com o documento conferido) antes de registrar a ficha." };
  }
  const linha = ctx.linhas[d.finalidade] || null;
  const ehImagem = d.finalidade === "IMAGEM";
  if (d.concedido) {
    const atual = mc.estadoDoConsentimento(linha, ctx.ativos.map((a) => a.responsavelId));
    if (atual.situacao === "CONCEDIDO" && linha.textoHash === d.textoHash) return { sucesso: false, mensagem: mc.mensagemJaConcedido() };
  } else if (linha && !linha.concedido) {
    const fotoApagada = ehImagem ? await apagarFotoDoMenor(pool, { menorId: d.menorId, fotoUrl: menor.FotoUrl, por: d.registradoPor }) : false;
    return { sucesso: true, jaRevogada: true, fotoApagada, mensagem: mc.mensagemJaRevogado({ finalidade: d.finalidade, fotoApagada }), estado: estadoDaFinalidade(d.finalidade, linha, ctx.ativos, { paraGestao: true }) };
  }
  const id = await inserirLinha(pool, { menorId: d.menorId, responsavelId: d.responsavelId, finalidade: d.finalidade, concedido: d.concedido, textoVersao: d.textoVersao, textoHash: d.textoHash, forma: "FICHA_FISICA", referencia: d.referencia, por: d.registradoPor });
  if (id == null) return { sucesso: false, mensagem: mc.MENSAGENS.CONCORRENCIA };
  const fotoApagada = !d.concedido && ehImagem && !!menor.FotoUrl;
  await registrarAuditoria({ tabela: TABELA, registroId: id, acao: "MENOR_CONSENTIMENTO_FICHA", usuarioId: d.registradoPor,
    dadosDepois: { menorId: d.menorId, responsavelId: d.responsavelId, finalidade: d.finalidade, concedido: d.concedido, forma: "FICHA_FISICA", textoVersao: d.textoVersao, textoHash: d.textoHash, referenciaTamanho: d.referencia.length, fotoApagada } });
  if (!d.concedido && ehImagem) await apagarFotoDoMenor(pool, { menorId: d.menorId, fotoUrl: menor.FotoUrl, por: d.registradoPor });
  const nova = { consentimentoId: id, menorId: d.menorId, responsavelId: d.responsavelId, finalidade: d.finalidade, concedido: d.concedido, textoVersao: d.textoVersao, textoHash: d.textoHash, forma: "FICHA_FISICA", registradoEm: new Date().toISOString(), referencia: d.referencia };
  return {
    sucesso: true, consentimentoId: id, fotoApagada, mensagem: mc.mensagemRegistroManual({ finalidade: d.finalidade, menorNome: menor.Nome, concedido: d.concedido, fotoApagada }),
    estado: estadoDaFinalidade(d.finalidade, nova, ctx.ativos, { paraGestao: true })
  };
}

// ---------------------------------------------------------------
// Retenção do IP (LGPD art. 16) e direito de acesso do titular (art. 18)
// ---------------------------------------------------------------

// Rotina diária: anonimiza o IP e os cabeçalhos das linhas de aceite digital registradas há mais de N dias (VOLUNTARIADO_IP_RETENCAO_DIAS, padrão 1825 = 5 anos).
// A linha em si (versão, hash, data, quem concedeu) NÃO tem prazo final: é a prova. O gatilho do banco só admite esta mudança (IP virando 'anonimizado' e cabeçalhos
// virando nulos). Sem usuário (rotina automática) e sem dado pessoal na auditoria: só a contagem e o prazo.
async function anonimizarIpsVencidos(pool, { hoje = hojeBrasilia() } = {}) {
  const dias = await lerPrazoDias(pool, "VOLUNTARIADO_IP_RETENCAO_DIAS", mc.IP_RETENCAO_DIAS_PADRAO);
  const r = await pool.request().input("hoje", sql.Date, hoje).input("dias", sql.Int, dias).query(`
    UPDATE c SET EnderecoIp = N'${mc.IP_ANONIMIZADO}', CadeiaCabecalhos = NULL
    FROM ${TABELA} c
    WHERE c.Forma = 'CLICK_RESP' AND (c.EnderecoIp <> N'${mc.IP_ANONIMIZADO}' OR c.CadeiaCabecalhos IS NOT NULL)
      AND c.RegistradoEm < DATEADD(DAY, -@dias, @hoje);
    SELECT @@ROWCOUNT AS total;`);
  const total = r.recordset[0] ? Number(r.recordset[0].total) : 0;
  if (total > 0) await registrarAuditoria({ tabela: TABELA, registroId: 0, acao: "IP_ANONIMIZADO", usuarioId: null, dadosDepois: { quantidade: total, retencaoDias: dias, referencia: hoje } });
  return { anonimizados: total, retencaoDias: dias };
}

// Direito de acesso do titular (Meus Dados): o que a pessoa consentiu COMO RESPONSÁVEL (o IP e a data são dela) e o que foi consentido SOBRE ela quando era menor.
// Fica de fora o nome de quem registrou a ficha (o titular recebe o fato) e, no que foi dado sobre o menor, o IP do responsável (é do responsável, não do menor).
async function dadosDoTitular(pool, membroId) {
  const q = (texto) => pool.request().input("m", sql.Int, membroId).query(texto);
  const [comoResponsavel, comoMenor] = await Promise.all([
    q(`SELECT TOP (${mc.LIMITE_LISTA}) c.Finalidade, c.Concedido, c.TextoVersao, c.TextoHash, c.Forma, c.RegistradoEm, c.EnderecoIp, c.CadeiaCabecalhos, c.Referencia, c.RegistradoPorMembroId, mn.Nome AS Menor
       FROM ${TABELA} c JOIN MembroReferencia mn ON mn.MembroId = c.MenorMembroId WHERE c.ResponsavelMembroId = @m ORDER BY c.ConsentimentoId DESC`),
    q(`SELECT TOP (${mc.LIMITE_LISTA}) c.Finalidade, c.Concedido, c.TextoVersao, c.TextoHash, c.Forma, c.RegistradoEm, c.Referencia, c.RegistradoPorMembroId, p.Nome AS Responsavel
       FROM ${TABELA} c JOIN MembroReferencia p ON p.MembroId = c.ResponsavelMembroId WHERE c.MenorMembroId = @m ORDER BY c.ConsentimentoId DESC`)
  ]);
  const comum = (x) => ({
    finalidade: mc.FINALIDADES[x.Finalidade] || x.Finalidade, situacao: x.Concedido ? "Autorizou" : "Revogou", textoVersao: x.TextoVersao, textoHash: x.TextoHash,
    forma: mc.FORMAS[x.Forma] || x.Forma, registradoEm: isoInstante(x.RegistradoEm), referencia: x.Referencia || null, registradaPelaSecretaria: x.RegistradoPorMembroId != null
  });
  return {
    comoResponsavel: comoResponsavel.recordset.map((x) => ({ menor: x.Menor, ...comum(x), enderecoIp: x.EnderecoIp || null, cadeiaCabecalhos: x.CadeiaCabecalhos || null })),
    comoMenor: comoMenor.recordset.map((x) => ({ responsavel: x.Responsavel, ...comum(x) })),
    aviso: "O nome de quem registrou cada ficha fica com a Secretaria: peça-o pelo canal do Encarregado de Dados (LGPD art. 18). O IP de uma autorização dada pelo responsável é dado do responsável."
  };
}

module.exports = {
  lerMembro, mapearLinha, carregarContexto, estadoDaFinalidade, estadosDoContexto, acessoAoMenor, estadoDoMenor, menoresDoResponsavel, consentimentoVigente,
  inserirLinha, apagarFotoDoMenor, apagarFotosDeMenoresSemConsentimento, conceder, revogar, registrarManual, anonimizarIpsVencidos, dadosDoTitular
};
