// shared/comunicacaoDb.js (v7.12 — Comunicação) — o banco. A regra está em shared/comunicacao.js (pura, testada).
//
// Quatro partes: (1) o consentimento de cada membro, por canal e categoria (Meu Painel, ficha em papel, link de saída); (2) os modelos aprovados; (3) o grupo, calculado na hora
// pelos critérios, sempre cortado pelo território de quem envia; (4) o envio: o sininho e o registro de entrega nascem juntos, o celular e o e-mail vão por uma fila que respeita
// o limite do serviço de e-mail do Azure (30 por minuto e 100 por hora no domínio da Igreja). Um e-mail nunca sai duas vezes: a entrega é "tomada" (ENVIANDO) antes de mandar;
// a que travar no meio vira FALHOU, não é repetida sozinha.
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const cm = require("./comunicacao");
const { hojeBrasilia } = require("./dataBrasilia");
const { lerPrazoDias } = require("./canaisDb");
const { obterTrava } = require("./financeiroSeguro");
const { enviarEmailComunicado } = require("./notificacaoEmail");
const { enviarPushNotificacao } = require("./notificacaoPush");
const marca = require("./comunicacaoFilaMarca");

const PERMISSAO = "comunicacao";
const MAX_GRUPO = 5000;
const RETENCAO = {
  entregas: { categoria: "Comunicação — registro de entrega", padrao: 365 },
  convocacao: { categoria: "Comunicação — registro de entrega da convocação oficial", padrao: 1825 }
};
const BASE_URL = () => (process.env.APP_BASE_URL || "https://app.ieadespa.org.br").replace(/\/+$/, "");
const PUSH_POR_LOTE = 25;
const PRESO_MINUTOS = 30;                    // ENVIANDO há mais que isto = a rodada caiu no meio: vira FALHOU (nunca reenviado sozinho)
const REPETIDO_MINUTOS = 10;                 // o mesmo modelo para o mesmo grupo, pela mesma pessoa, em 10 minutos = o mesmo envio (duplo clique, resposta perdida)

const NAO_EXISTE = { sucesso: false, naoExiste: true };
const PROIBIDO = (mensagem) => ({ sucesso: false, proibido: true, mensagem });
const MUDOU = (mensagem) => ({ sucesso: false, mudou: true, mensagem });
const RECUSA = (mensagem) => ({ sucesso: false, mensagem });
const iso = (v) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
const contagem = (x) => Number((((x && x.recordset) || [])[0] || {}).n) || 0;
async function fecharTransacao(t, ok) { try { if (ok) await t.commit(); else await t.rollback(); } catch (e) { /* já encerrada */ } }
async function auditar(tabela, registroId, acao, usuarioId) {
  await registrarAuditoria({ tabela, registroId: registroId || 0, acao, usuarioId: usuarioId || null, dadosDepois: {} });
}
function comMarcaDePurga(corpo) {
  return `DECLARE @apagadas INT = 0;
BEGIN TRY
  EXEC sp_set_session_context @key = N'comunicacao_purga', @value = 1;
  ${corpo}
  EXEC sp_set_session_context @key = N'comunicacao_purga', @value = NULL;
END TRY
BEGIN CATCH
  EXEC sp_set_session_context @key = N'comunicacao_purga', @value = NULL;
  THROW;
END CATCH;
SELECT @apagadas AS n`;
}

// ---------------------------------------------------------------
// Território de quem envia
// ---------------------------------------------------------------

// null = todas (nível geral); senão os ids das congregações que a pessoa alcança.
async function congregacoesDoEscopo(pool, ver) {
  if (ver && ver.geral) return null;
  const r = await pool.request().query(`SELECT CongregacaoId, Nome FROM Congregacoes`);
  return r.recordset.filter((c) => ver && ver.podeVerCongregacao(c.Nome)).map((c) => c.CongregacaoId);
}
function filtroDeIds(rq, coluna, ids, prefixo) {
  if (ids === null) return "1 = 1";
  if (!ids.length) return "1 = 0";
  return `${coluna} IN (${ids.map((id, i) => { rq.input(`${prefixo}${i}`, sql.Int, id); return `@${prefixo}${i}`; }).join(", ")})`;
}

// ---------------------------------------------------------------
// 1) Consentimento
// ---------------------------------------------------------------

async function vigentes(pool, membroId) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT k.Canal, k.Categoria, k.Concedido, k.Origem, k.CriadoEm, k.DataFicha FROM ComunicacaoConsentimentos k
    WHERE k.MembroId = @m AND k.ConsentimentoId = (SELECT MAX(x.ConsentimentoId) FROM ComunicacaoConsentimentos x WHERE x.MembroId = k.MembroId AND x.Canal = k.Canal AND x.Categoria = k.Categoria)`);
  const mapa = {};
  for (const l of r.recordset) mapa[`${l.Canal}|${l.Categoria}`] = l;
  return mapa;
}

// O que a pessoa vê em Meu Painel → Comunicações.
async function minhasPreferencias(pool, membroId) {
  const v = await vigentes(pool, membroId);
  const m = (await pool.request().input("m", sql.Int, membroId).query(`
    SELECT CASE WHEN Email IS NULL OR LTRIM(RTRIM(Email)) = '' THEN 0 ELSE 1 END AS TemEmail,
           (SELECT COUNT(*) FROM PushInscricoesMembro p WHERE p.MembroId = @m) AS Aparelhos
    FROM MembroReferencia WHERE MembroId = @m`)).recordset[0] || { TemEmail: 0, Aparelhos: 0 };
  const categorias = Object.entries(cm.CATEGORIAS).map(([codigo, c]) => ({
    categoria: codigo, rotulo: c.rotulo, descricao: c.descricao, obrigatoria: !!c.obrigatoria,
    ...(c.obrigatoria ? {} : { texto: cm.textoConsentimento(codigo), versao: cm.TEXTO_VERSAO, hash: cm.hashDoTexto(codigo) }),
    canais: Object.fromEntries(Object.keys(cm.CANAIS).map((canal) => {
      if (c.obrigatoria) return [canal, { concedido: true, obrigatoria: true }];
      const l = v[`${canal}|${codigo}`];
      return [canal, { concedido: !!(l && l.Concedido), desde: l ? iso(l.CriadoEm) : null, origem: l ? l.Origem : null }];
    }))
  }));
  return { categorias, canais: Object.entries(cm.CANAIS).map(([codigo, rotulo]) => ({ codigo, rotulo })), temEmail: !!Number(m.TemEmail), aparelhos: Number(m.Aparelhos) || 0 };
}

// Cada mudança: { canal, categoria, concedido, hash }. O "sim" só vale com a impressão digital do texto que a tela mostrou (texto mudou = recarregue).
// Só grava o que mudou de verdade (marcar de novo o que já está marcado não cria linha).
function validarMudancas(lista) {
  if (!Array.isArray(lista) || !lista.length || lista.length > 12) return { problema: "Nada para salvar." };
  const vistas = new Set();
  const saida = [];
  for (const x of lista) {
    if (!x || typeof x !== "object" || !cm.CANAIS[x.canal] || !cm.CATEGORIAS_COM_CONSENTIMENTO.includes(x.categoria) || typeof x.concedido !== "boolean") return { problema: "Escolha inválida." };
    const chave = `${x.canal}|${x.categoria}`;
    if (vistas.has(chave)) return { problema: "Escolha repetida." };
    vistas.add(chave);
    if (x.concedido && x.hash !== cm.hashDoTexto(x.categoria)) return { problema: "O texto da autorização mudou: recarregue a página, leia de novo e marque outra vez.", textoMudou: true };
    saida.push({ canal: x.canal, categoria: x.categoria, concedido: x.concedido });
  }
  return { mudancas: saida };
}
async function gravarMudancas(pool, { membroId, mudancas, origem, ip = null, registradoPor = null, dataFicha = null, envioId = null }) {
  const t = new sql.Transaction(pool);
  let gravadas = 0;
  try {
    await t.begin();
    if (!(await obterTrava(() => new sql.Request(t), `comunicacao-consentimento-${membroId}`, 8000))) { await fecharTransacao(t, false); return { ocupado: true }; }
    for (const x of mudancas) {
      const atual = (await new sql.Request(t).input("m", sql.Int, membroId).input("c", sql.NVarChar(10), x.canal).input("k", sql.NVarChar(12), x.categoria)
        .query(`SELECT TOP 1 Concedido FROM ComunicacaoConsentimentos WHERE MembroId = @m AND Canal = @c AND Categoria = @k ORDER BY ConsentimentoId DESC`)).recordset[0];
      const agora = !!(atual && atual.Concedido);
      if (agora === x.concedido && (atual || !x.concedido)) continue;       // nada muda (e "não" sem nenhuma linha antes já é "não")
      const saida = origem === "LINK_SAIR";
      await new sql.Request(t).input("m", sql.Int, membroId).input("c", sql.NVarChar(10), x.canal).input("k", sql.NVarChar(12), x.categoria).input("s", sql.Bit, x.concedido ? 1 : 0)
        .input("o", sql.NVarChar(14), origem).input("v", sql.NVarChar(20), cm.TEXTO_VERSAO).input("h", sql.Char(64), saida ? cm.HASH_SAIDA : cm.hashDoTexto(x.categoria))
        .input("df", sql.Date, dataFicha).input("ip", sql.NVarChar(64), ip ? String(ip).slice(0, 64) : null).input("por", sql.Int, registradoPor).input("e", sql.Int, envioId)
        .query(`INSERT INTO ComunicacaoConsentimentos (MembroId, Canal, Categoria, Concedido, Origem, TextoVersao, TextoHash, DataFicha, EnderecoIp, RegistradoPorMembroId, EnvioId)
                VALUES (@m, @c, @k, @s, @o, @v, @h, @df, @ip, @por, @e)`);
      gravadas++;
    }
    await t.commit();
  } catch (e) { await fecharTransacao(t, false); throw e; }
  if (gravadas) await auditar("ComunicacaoConsentimentos", membroId, `COMUNICACAO_CONSENTIMENTO_${origem}`, registradoPor || membroId);
  return { gravadas };
}
async function salvarPreferencias(pool, { membroId, dados, ip }) {
  const v = validarMudancas((dados || {}).mudancas);
  if (v.problema) return { ...RECUSA(v.problema), ...(v.textoMudou ? { textoMudou: true } : {}) };
  const r = await gravarMudancas(pool, { membroId, mudancas: v.mudancas, origem: "MEU_PAINEL", ip });
  if (r.ocupado) return { sucesso: false, limite: true, mensagem: "Outra mudança está sendo gravada. Tente de novo." };
  return { sucesso: true, gravadas: r.gravadas, ...(await minhasPreferencias(pool, membroId)) };
}

// A Secretaria lança o "sim" ou o "não" que a pessoa deu numa ficha em papel (a ficha tem o texto impresso da versão vigente).
async function registrarFicha(pool, { ver, dados, hoje = hojeBrasilia() }) {
  const d = dados || {};
  const membroId = Number.isInteger(d.membroId) && d.membroId > 0 ? d.membroId : null;
  if (!membroId) return RECUSA("Informe a matrícula.");
  if (!cm.CANAIS[d.canal] || !cm.CATEGORIAS_COM_CONSENTIMENTO.includes(d.categoria) || typeof d.concedido !== "boolean") return RECUSA("Escolha o canal, a categoria e se a pessoa autorizou.");
  if (typeof d.dataFicha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.dataFicha) || isNaN(Date.parse(d.dataFicha + "T12:00:00Z"))) return RECUSA("Informe a data da ficha.");
  if (d.dataFicha > hoje) return RECUSA("A data da ficha não pode ser no futuro.");
  if (d.dataFicha < `${Number(hoje.slice(0, 4)) - 2}${hoje.slice(4)}`) return RECUSA("Ficha com mais de 2 anos: peça à pessoa uma ficha nova.");
  const p = (await pool.request().input("m", sql.Int, membroId).query(`
    SELECT m.MembroId, m.Status, c.Nome AS Congregacao FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @m`)).recordset[0];
  if (!p || !p.Congregacao || !(ver.geral || ver.podeVerCongregacao(p.Congregacao))) return NAO_EXISTE;
  if (membroId === ver.membroId) return RECUSA("O seu próprio consentimento você marca em Meu Painel → Comunicações.");
  const r = await gravarMudancas(pool, { membroId, mudancas: [{ canal: d.canal, categoria: d.categoria, concedido: d.concedido }], origem: "FICHA_PAPEL", registradoPor: ver.membroId, dataFicha: d.dataFicha });
  if (r.ocupado) return { sucesso: false, limite: true, mensagem: "Outra mudança está sendo gravada. Tente de novo." };
  return { sucesso: true, gravadas: r.gravadas, mensagem: r.gravadas ? "Ficha lançada." : "Nada mudou: a pessoa já estava assim." };
}

// O link "não quero mais receber" do e-mail. Sem login: o link assinado é a prova. Ler não grava; só o botão da página grava.
async function consultarSaida(pool, { token, segredo }) {
  const s = cm.lerSaida(segredo, token);
  if (!s) return { valido: false };
  const v = await vigentes(pool, s.membroId);
  const l = v[`EMAIL|${s.categoria}`];
  return { valido: true, categoria: s.categoria, rotulo: cm.CATEGORIAS[s.categoria].rotulo, texto: cm.TEXTO_SAIDA, jaSaiu: !(l && l.Concedido) };
}
async function confirmarSaida(pool, { token, segredo, ip }) {
  const s = cm.lerSaida(segredo, token);
  if (!s) return { sucesso: false, invalido: true };
  const existe = (await pool.request().input("m", sql.Int, s.membroId).query(`SELECT COUNT(*) AS n FROM MembroReferencia WHERE MembroId = @m`));
  if (!contagem(existe)) return { sucesso: false, invalido: true };
  const r = await gravarMudancas(pool, { membroId: s.membroId, mudancas: [{ canal: "EMAIL", categoria: s.categoria, concedido: false }], origem: "LINK_SAIR", ip, envioId: s.envioId });
  if (r.ocupado) return { sucesso: false, limite: true };
  return { sucesso: true, rotulo: cm.CATEGORIAS[s.categoria].rotulo, jaEstava: !r.gravadas };
}

// ---------------------------------------------------------------
// 2) Modelos
// ---------------------------------------------------------------

const formatarModelo = (m) => ({
  modeloId: m.ModeloId, chave: m.Chave, versao: m.Versao, categoria: m.Categoria, categoriaRotulo: (cm.CATEGORIAS[m.Categoria] || {}).rotulo, titulo: m.Titulo, corpo: m.Corpo,
  status: m.Status, criadoEm: iso(m.CriadoEm), criadoPor: m.CriadoPorNome || null, aprovadoEm: iso(m.AprovadoEm), aprovadoPor: m.AprovadoPorNome || null, arquivadoEm: iso(m.ArquivadoEm)
});
const SELECT_MODELO = `SELECT m.*, a.Nome AS CriadoPorNome, b.Nome AS AprovadoPorNome FROM ComunicacaoModelos m
  LEFT JOIN MembroReferencia a ON a.MembroId = m.CriadoPorMembroId LEFT JOIN MembroReferencia b ON b.MembroId = m.AprovadoPorMembroId`;

// O nível geral vê tudo (rascunhos e arquivados dos últimos 2 anos); os outros, só os aprovados que podem usar (a convocação só o nível geral envia).
async function listarModelos(pool, { ver }) {
  const cond = ver.geral ? "(m.Status <> 'ARQUIVADO' OR m.ArquivadoEm >= DATEADD(YEAR, -2, SYSUTCDATETIME()))" : "m.Status = 'APROVADO' AND m.Categoria <> 'CONVOCACAO'";
  const r = await pool.request().query(`SELECT TOP 300 * FROM (${SELECT_MODELO}) m WHERE ${cond} ORDER BY CASE m.Status WHEN 'APROVADO' THEN 0 WHEN 'RASCUNHO' THEN 1 ELSE 2 END, m.ModeloId DESC`);
  return r.recordset.map(formatarModelo);
}
async function carregarModelo(pool, modeloId) {
  return (await pool.request().input("id", sql.Int, modeloId).query(`${SELECT_MODELO} WHERE m.ModeloId = @id`)).recordset[0] || null;
}

// Rascunho novo, ou a versão seguinte de um modelo (com `chave`). Um rascunho que já existe para a mesma chave é editado no lugar (só o rascunho se edita).
async function salvarModelo(pool, { ver, dados }) {
  if (!ver.geral) return PROIBIDO("Os modelos são a voz da Igreja: só o nível geral escreve e aprova.");
  const v = cm.validarModelo(dados);
  if (v.problema) return RECUSA(v.problema);
  const { categoria, titulo, corpo } = v.dados;
  const t = new sql.Transaction(pool);
  let modeloId, chave = v.dados.chave;
  try {
    await t.begin();
    if (!(await obterTrava(() => new sql.Request(t), "comunicacao-modelos", 8000))) { await fecharTransacao(t, false); return { sucesso: false, limite: true, mensagem: "Outro modelo está sendo gravado. Tente de novo." }; }
    if (chave) {
      const versoes = (await new sql.Request(t).input("c", sql.NVarChar(40), chave).query(`SELECT ModeloId, Versao, Status FROM ComunicacaoModelos WHERE Chave = @c ORDER BY Versao DESC`)).recordset;
      if (!versoes.length) { await fecharTransacao(t, false); return NAO_EXISTE; }
      const rascunho = versoes.find((x) => x.Status === "RASCUNHO");
      if (rascunho) {
        await new sql.Request(t).input("id", sql.Int, rascunho.ModeloId).input("k", sql.NVarChar(12), categoria).input("ti", sql.NVarChar(150), titulo).input("co", sql.NVarChar(2000), corpo)
          .query(`UPDATE ComunicacaoModelos SET Categoria = @k, Titulo = @ti, Corpo = @co WHERE ModeloId = @id AND Status = 'RASCUNHO'`);
        modeloId = rascunho.ModeloId;
      } else {
        modeloId = (await new sql.Request(t).input("c", sql.NVarChar(40), chave).input("v", sql.Int, versoes[0].Versao + 1).input("k", sql.NVarChar(12), categoria)
          .input("ti", sql.NVarChar(150), titulo).input("co", sql.NVarChar(2000), corpo).input("por", sql.Int, ver.membroId)
          .query(`INSERT INTO ComunicacaoModelos (Chave, Versao, Categoria, Titulo, Corpo, CriadoPorMembroId) VALUES (@c, @v, @k, @ti, @co, @por); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
      }
    } else {
      chave = cm.chaveDoTitulo(titulo);
      modeloId = (await new sql.Request(t).input("c", sql.NVarChar(40), chave).input("k", sql.NVarChar(12), categoria).input("ti", sql.NVarChar(150), titulo).input("co", sql.NVarChar(2000), corpo)
        .input("por", sql.Int, ver.membroId)
        .query(`INSERT INTO ComunicacaoModelos (Chave, Versao, Categoria, Titulo, Corpo, CriadoPorMembroId) VALUES (@c, 1, @k, @ti, @co, @por); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
    }
    await t.commit();
  } catch (e) { await fecharTransacao(t, false); throw e; }
  await auditar("ComunicacaoModelos", modeloId, "COMUNICACAO_MODELO_RASCUNHO", ver.membroId);
  return { sucesso: true, modelo: formatarModelo(await carregarModelo(pool, modeloId)) };
}
// Aprovar: o rascunho vira o modelo em uso daquela chave; a versão aprovada anterior é arquivada (envios antigos continuam apontando para ela).
async function aprovarModelo(pool, { ver, modeloId }) {
  if (!ver.geral) return PROIBIDO("Só o nível geral aprova modelos.");
  const m = await carregarModelo(pool, modeloId);
  if (!m) return NAO_EXISTE;
  if (m.Status !== "RASCUNHO") return RECUSA(m.Status === "APROVADO" ? "Este modelo já está aprovado." : "Este modelo está arquivado.");
  const t = new sql.Transaction(pool);
  try {
    await t.begin();
    await new sql.Request(t).input("c", sql.NVarChar(40), m.Chave).input("id", sql.Int, modeloId)
      .query(`UPDATE ComunicacaoModelos SET Status = 'ARQUIVADO', ArquivadoEm = SYSUTCDATETIME() WHERE Chave = @c AND Status = 'APROVADO' AND ModeloId <> @id`);
    const r = await new sql.Request(t).input("id", sql.Int, modeloId).input("por", sql.Int, ver.membroId)
      .query(`UPDATE ComunicacaoModelos SET Status = 'APROVADO', AprovadoEm = SYSUTCDATETIME(), AprovadoPorMembroId = @por WHERE ModeloId = @id AND Status = 'RASCUNHO'; SELECT @@ROWCOUNT AS n`);
    if (!contagem(r)) { await fecharTransacao(t, false); return MUDOU("O modelo mudou enquanto você decidia. Abra de novo."); }
    await t.commit();
  } catch (e) { await fecharTransacao(t, false); throw e; }
  await auditar("ComunicacaoModelos", modeloId, "COMUNICACAO_MODELO_APROVADO", ver.membroId);
  return { sucesso: true, modelo: formatarModelo(await carregarModelo(pool, modeloId)) };
}
async function arquivarModelo(pool, { ver, modeloId }) {
  if (!ver.geral) return PROIBIDO("Só o nível geral arquiva modelos.");
  const m = await carregarModelo(pool, modeloId);
  if (!m) return NAO_EXISTE;
  if (m.Status === "RASCUNHO") {
    const r = await pool.request().input("id", sql.Int, modeloId).query(`DELETE FROM ComunicacaoModelos WHERE ModeloId = @id AND Status = 'RASCUNHO'; SELECT @@ROWCOUNT AS n`);
    if (!contagem(r)) return MUDOU("O modelo mudou enquanto você decidia. Abra de novo.");
    await auditar("ComunicacaoModelos", modeloId, "COMUNICACAO_MODELO_RASCUNHO_APAGADO", ver.membroId);
    return { sucesso: true, apagado: true };
  }
  if (m.Status === "ARQUIVADO") return RECUSA("Este modelo já está arquivado.");
  const r = await pool.request().input("id", sql.Int, modeloId).query(`UPDATE ComunicacaoModelos SET Status = 'ARQUIVADO', ArquivadoEm = SYSUTCDATETIME() WHERE ModeloId = @id AND Status = 'APROVADO'; SELECT @@ROWCOUNT AS n`);
  if (!contagem(r)) return MUDOU("O modelo mudou enquanto você decidia. Abra de novo.");
  await auditar("ComunicacaoModelos", modeloId, "COMUNICACAO_MODELO_ARQUIVADO", ver.membroId);
  return { sucesso: true };
}

// ---------------------------------------------------------------
// 3) Grupos
// ---------------------------------------------------------------

// As opções da tela: o território que a pessoa alcança, os cargos e os departamentos.
async function opcoes(pool, { ver }) {
  const escopo = await congregacoesDoEscopo(pool, ver);
  const rq = pool.request();
  const congs = (await rq.query(`SELECT c.CongregacaoId, c.Nome, c.AreaId FROM Congregacoes c WHERE ${filtroDeIds(rq, "c.CongregacaoId", escopo, "e")} ORDER BY c.Nome`)).recordset;
  const areasIds = [...new Set(congs.map((c) => c.AreaId).filter((x) => x != null))];
  const rqa = pool.request();
  const areas = areasIds.length ? (await rqa.query(`SELECT AreaId, Nome, RegiaoId FROM Areas WHERE ${filtroDeIds(rqa, "AreaId", areasIds, "a")} ORDER BY Nome`)).recordset : [];
  const regIds = [...new Set(areas.map((a) => a.RegiaoId).filter((x) => x != null))];
  const rqr = pool.request();
  const regioes = regIds.length ? (await rqr.query(`SELECT RegiaoId, Nome FROM Regioes WHERE ${filtroDeIds(rqr, "RegiaoId", regIds, "r")} ORDER BY Nome`)).recordset : [];
  const cargos = (await pool.request().query(`SELECT Sigla, Nome FROM CargosMinisteriais WHERE Ativo = 1 ORDER BY ISNULL(Ordem, 999), Nome`)).recordset;
  const deps = (await pool.request().query(`SELECT DepartamentoId, Nome FROM Departamentos WHERE Ativo = 1 ORDER BY Nome`)).recordset;
  return {
    congregacoes: congs.map((c) => ({ id: c.CongregacaoId, nome: c.Nome })), areas: areas.map((a) => ({ id: a.AreaId, nome: a.Nome })), regioes: regioes.map((r) => ({ id: r.RegiaoId, nome: r.Nome })),
    cargos: cargos.map((c) => ({ sigla: c.Sigla, nome: c.Nome })), departamentos: deps.map((d) => ({ id: d.DepartamentoId, nome: d.Nome })), geral: !!ver.geral
  };
}

// As pessoas do grupo, calculadas agora: ativas, adultas, sem exclusão LGPD atendida, no território de quem envia, com os critérios.
async function resolverGrupo(pool, { ver, criterios, hoje = hojeBrasilia(), deps = {} }) {
  const escopo = await congregacoesDoEscopo(pool, ver);
  const rq = pool.request().input("hoje", sql.Date, hoje);
  const cond = ["m.Status = 'ATIVO'", "(m.DataNascimento IS NULL OR m.DataNascimento <= DATEADD(YEAR, -18, @hoje))",
    "NOT EXISTS (SELECT 1 FROM SolicitacoesTitularLGPD s WHERE s.MembroId = m.MembroId AND s.Tipo = 'EXCLUSAO' AND s.Status = 'ATENDIDA')",
    filtroDeIds(rq, "c.CongregacaoId", escopo, "e")];
  const t = criterios.territorio;
  if (t.tipo === "CONGREGACAO") cond.push(filtroDeIds(rq, "c.CongregacaoId", t.ids, "tc"));
  if (t.tipo === "AREA") cond.push(filtroDeIds(rq, "c.AreaId", t.ids, "ta"));
  if (t.tipo === "REGIAO") cond.push(`c.AreaId IN (SELECT a.AreaId FROM Areas a WHERE ${filtroDeIds(rq, "a.RegiaoId", t.ids, "tr")})`);
  if (criterios.cargos.length) cond.push(`m.CargoMinisterial IN (${criterios.cargos.map((s, i) => { rq.input(`cg${i}`, sql.NVarChar(30), s); return `@cg${i}`; }).join(", ")})`);
  if (criterios.departamentos.length) cond.push(filtroDeIds(rq, "m.DepartamentoId", criterios.departamentos, "dp"));
  if (criterios.lideranca) cond.push("EXISTS (SELECT 1 FROM Lideranca l WHERE l.MembroId = m.MembroId AND (l.AtivoAte IS NULL OR l.AtivoAte >= @hoje))");
  if (criterios.ebdProfessores) cond.push("EXISTS (SELECT 1 FROM EbdTurmaProfessores p WHERE p.MembroId = m.MembroId AND p.Ativo = 1)");
  if (criterios.formacaoVencendoDias != null) {
    rq.input("fd", sql.Int, criterios.formacaoVencendoDias);
    // a última conclusão de cada trilha vence até a data (uma conclusão mais nova e válida tira a pessoa do grupo)
    cond.push(`EXISTS (SELECT 1 FROM TrilhaMatriculas tm WHERE tm.MembroId = m.MembroId AND tm.Status = 'CONCLUIDA' AND tm.ValidoAte IS NOT NULL AND tm.ValidoAte <= DATEADD(DAY, @fd, @hoje)
      AND NOT EXISTS (SELECT 1 FROM TrilhaMatriculas t2 WHERE t2.MembroId = tm.MembroId AND t2.TrilhaId = tm.TrilhaId AND t2.Status = 'CONCLUIDA' AND t2.ValidoAte > DATEADD(DAY, @fd, @hoje)))`);
  }
  if (criterios.habilitacaoVencendoDias != null) {
    rq.input("hd", sql.Int, criterios.habilitacaoVencendoDias);
    cond.push(`EXISTS (SELECT 1 FROM VoluntariosHabilitacao vh WHERE vh.MembroId = m.MembroId AND vh.InaptoEm IS NULL AND vh.AptoValidoAte IS NOT NULL AND vh.AptoValidoAte <= DATEADD(DAY, @hd, @hoje)
      AND NOT EXISTS (SELECT 1 FROM VoluntariosHabilitacao v2 WHERE v2.MembroId = vh.MembroId AND v2.InaptoEm IS NULL AND v2.AptoValidoAte > DATEADD(DAY, @hd, @hoje)))`);
  }
  const r = await rq.query(`SELECT TOP ${MAX_GRUPO + 1} m.MembroId, m.Nome, c.Nome AS Congregacao FROM MembroReferencia m JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    WHERE ${cond.join(" AND ")} ORDER BY m.MembroId`);
  let pessoas = r.recordset;
  if (criterios.assembleiaGeral) {
    const universo = deps.universoDoOrgao || require("./universo").universoDoOrgao;
    const votam = new Set((await universo(pool, { sigla: "ASSEMBLEIA_GERAL" })).map((x) => Number(x.membroId)));
    pessoas = pessoas.filter((p) => votam.has(Number(p.MembroId)));
  }
  return pessoas;
}

// Para cada pessoa, o que acontece em cada canal: sem consentimento, sem contato, sem aparelho ou na fila.
async function situacaoPorCanal(pool, { ids, categoria }) {
  if (!ids.length) return [];
  const obrigatoria = !!cm.CATEGORIAS[categoria].obrigatoria;
  const r = await pool.request().input("ids", sql.NVarChar(sql.MAX), JSON.stringify(ids)).input("k", sql.NVarChar(12), categoria).query(`
    SELECT j.id AS MembroId,
      CASE WHEN m.Email IS NULL OR LTRIM(RTRIM(m.Email)) = '' THEN 0 ELSE 1 END AS TemEmail,
      CASE WHEN EXISTS (SELECT 1 FROM PushInscricoesMembro p WHERE p.MembroId = j.id) THEN 1 ELSE 0 END AS TemAparelho,
      (SELECT TOP 1 CAST(k.Concedido AS INT) FROM ComunicacaoConsentimentos k WHERE k.MembroId = j.id AND k.Canal = 'EMAIL' AND k.Categoria = @k ORDER BY k.ConsentimentoId DESC) AS SimEmail,
      (SELECT TOP 1 CAST(k.Concedido AS INT) FROM ComunicacaoConsentimentos k WHERE k.MembroId = j.id AND k.Canal = 'PUSH' AND k.Categoria = @k ORDER BY k.ConsentimentoId DESC) AS SimPush
    FROM OPENJSON(@ids) WITH (id INT '$') j JOIN MembroReferencia m ON m.MembroId = j.id`);
  return r.recordset.map((x) => ({
    membroId: x.MembroId,
    EMAIL: !obrigatoria && !Number(x.SimEmail) ? "SEM_CONSENTIMENTO" : !Number(x.TemEmail) ? "SEM_CONTATO" : "PENDENTE",
    PUSH: !obrigatoria && !Number(x.SimPush) ? "SEM_CONSENTIMENTO" : !Number(x.TemAparelho) ? "SEM_APARELHO" : "PENDENTE"
  }));
}
function resumoDosCanais(linhas) {
  const resumo = { EMAIL: {}, PUSH: {} };
  for (const l of linhas) for (const canal of ["EMAIL", "PUSH"]) resumo[canal][l[canal]] = (resumo[canal][l[canal]] || 0) + 1;
  return Object.fromEntries(Object.entries(resumo).map(([canal, s]) => [canal, { receberao: s.PENDENTE || 0, semConsentimento: s.SEM_CONSENTIMENTO || 0, semContato: (s.SEM_CONTATO || 0) + (s.SEM_APARELHO || 0) }]));
}
async function nomesDosCriterios(pool, c) {
  const nomes = { territorio: {}, cargos: {}, departamentos: {} };
  const tabela = { CONGREGACAO: ["Congregacoes", "CongregacaoId"], AREA: ["Areas", "AreaId"], REGIAO: ["Regioes", "RegiaoId"] }[c.territorio.tipo];
  if (tabela) {
    const rq = pool.request();
    for (const l of (await rq.query(`SELECT ${tabela[1]} AS id, Nome FROM ${tabela[0]} WHERE ${filtroDeIds(rq, tabela[1], c.territorio.ids, "n")}`)).recordset) nomes.territorio[l.id] = l.Nome;
  }
  if (c.cargos.length) for (const l of (await pool.request().query(`SELECT Sigla, Nome FROM CargosMinisteriais`)).recordset) nomes.cargos[l.Sigla] = l.Nome;
  if (c.departamentos.length) {
    const rq = pool.request();
    for (const l of (await rq.query(`SELECT DepartamentoId AS id, Nome FROM Departamentos WHERE ${filtroDeIds(rq, "DepartamentoId", c.departamentos, "d")}`)).recordset) nomes.departamentos[l.id] = l.Nome;
  }
  return nomes;
}

// Antes de enviar: quantas pessoas e o que cada canal fará. Nenhum nome sai daqui.
async function previa(pool, { ver, dados, deps }) {
  const d = dados || {};
  const v = cm.validarCriterios(d.criterios);
  if (v.problema) return RECUSA(v.problema);
  if (!cm.CATEGORIAS[d.categoria]) return RECUSA("Escolha a categoria (ou o modelo).");
  if (d.categoria === "CONVOCACAO" && !ver.geral) return PROIBIDO("A convocação oficial só sai pelo nível geral.");
  const pessoas = await resolverGrupo(pool, { ver, criterios: v.criterios, deps });
  if (pessoas.length > MAX_GRUPO) return RECUSA(`O grupo passa de ${MAX_GRUPO} pessoas: divida em partes (por área ou região).`);
  const linhas = await situacaoPorCanal(pool, { ids: pessoas.map((p) => p.MembroId), categoria: d.categoria });
  return { sucesso: true, total: pessoas.length, canais: resumoDosCanais(linhas), grupo: cm.descreverCriterios(v.criterios, await nomesDosCriterios(pool, v.criterios)), criterios: v.criterios };
}

async function salvarGrupo(pool, { ver, dados }) {
  const d = dados || {};
  const nome = cm.validarTexto(d.nome, { campo: "o nome do grupo", max: cm.MAX_NOME_GRUPO, min: 3 });
  if (nome.problema) return RECUSA(nome.problema);
  const v = cm.validarCriterios(d.criterios);
  if (v.problema) return RECUSA(v.problema);
  const id = (await pool.request().input("n", sql.NVarChar(100), nome.texto).input("j", sql.NVarChar(2000), JSON.stringify(v.criterios)).input("por", sql.Int, ver.membroId)
    .query(`INSERT INTO ComunicacaoAudiencias (Nome, CriteriosJson, CriadoPorMembroId) VALUES (@n, @j, @por); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
  return { sucesso: true, audienciaId: id };
}
// Cada um vê os grupos que guardou; o nível geral vê todos. Os critérios valem no território de quem envia (o grupo de outro é cortado no envio).
async function listarGrupos(pool, { ver }) {
  const rq = pool.request().input("eu", sql.Int, ver.membroId);
  const r = await rq.query(`SELECT TOP 200 a.AudienciaId, a.Nome, a.CriteriosJson, a.CriadoEm, m.Nome AS CriadoPor FROM ComunicacaoAudiencias a LEFT JOIN MembroReferencia m ON m.MembroId = a.CriadoPorMembroId
    WHERE a.Ativa = 1 ${ver.geral ? "" : "AND a.CriadoPorMembroId = @eu"} ORDER BY a.Nome`);
  return r.recordset.map((a) => ({ audienciaId: a.AudienciaId, nome: a.Nome, criterios: JSON.parse(a.CriteriosJson), criadoEm: iso(a.CriadoEm), criadoPor: a.CriadoPor }));
}
async function excluirGrupo(pool, { ver, audienciaId }) {
  const rq = pool.request().input("id", sql.Int, audienciaId).input("eu", sql.Int, ver.membroId);
  const r = await rq.query(`UPDATE ComunicacaoAudiencias SET Ativa = 0 WHERE AudienciaId = @id AND Ativa = 1 ${ver.geral ? "" : "AND CriadoPorMembroId = @eu"}; SELECT @@ROWCOUNT AS n`);
  return contagem(r) ? { sucesso: true } : NAO_EXISTE;
}

// ---------------------------------------------------------------
// 4) Envio
// ---------------------------------------------------------------

async function pendentesNaFila(pool) {
  return contagem(await pool.request().query(`SELECT COUNT(*) AS n FROM ComunicacaoEntregas WHERE Situacao IN ('PENDENTE', 'ENVIANDO') AND Canal IN ('EMAIL', 'PUSH')`));
}
async function regravarMarca(pool) {
  try { await marca.gravar(await pendentesNaFila(pool)); } catch (e) { await marca.gravar(null); }
}

// Envia um modelo aprovado ao grupo. O sininho e o registro de entrega nascem na hora (uma transação); o celular e o e-mail vão para a fila, e a primeira rodada roda já.
async function enviar(pool, { ver, dados, deps = {} }) {
  const d = dados || {};
  const modeloId = Number.isInteger(d.modeloId) && d.modeloId > 0 ? d.modeloId : null;
  if (!modeloId) return RECUSA("Escolha o modelo.");
  const v = cm.validarCriterios(d.criterios);
  if (v.problema) return RECUSA(v.problema);
  const m = await carregarModelo(pool, modeloId);
  if (!m) return NAO_EXISTE;
  if (m.Categoria === "CONVOCACAO" && !ver.geral) return PROIBIDO("A convocação oficial só sai pelo nível geral.");
  if (m.Status !== "APROVADO") return RECUSA("Só se envia modelo aprovado.");
  const criteriosJson = JSON.stringify(v.criterios);
  const pessoas = await resolverGrupo(pool, { ver, criterios: v.criterios, deps });
  if (!pessoas.length) return RECUSA("Ninguém neste grupo: confira os critérios.");
  if (pessoas.length > MAX_GRUPO) return RECUSA(`O grupo passa de ${MAX_GRUPO} pessoas: divida em partes (por área ou região).`);
  const linhas = await situacaoPorCanal(pool, { ids: pessoas.map((p) => p.MembroId), categoria: m.Categoria });
  const porId = new Map(linhas.map((l) => [l.membroId, l]));
  const grupo = cm.descreverCriterios(v.criterios, await nomesDosCriterios(pool, v.criterios));
  const entregas = [], sininho = [];
  for (const p of pessoas) {
    const l = porId.get(p.MembroId);
    if (!l) continue;
    entregas.push({ m: p.MembroId, c: "SININHO", s: "ACEITO" }, { m: p.MembroId, c: "EMAIL", s: l.EMAIL }, { m: p.MembroId, c: "PUSH", s: l.PUSH });
    sininho.push({ d: p.MembroId, t: cm.preencher(m.Titulo, { nome: p.Nome, congregacao: p.Congregacao }).slice(0, 200),
      msg: cm.textoDoSininho(cm.preencher(m.Corpo, { nome: p.Nome, congregacao: p.Congregacao })) });
  }
  const t = new sql.Transaction(pool);
  let envioId, repetido = false;
  try {
    await t.begin();
    if (!(await obterTrava(() => new sql.Request(t), `comunicacao-envio-${ver.membroId}`, 15000))) { await fecharTransacao(t, false); return { sucesso: false, limite: true, mensagem: "Outro envio seu está sendo gravado. Aguarde." }; }
    const antes = (await new sql.Request(t).input("mo", sql.Int, modeloId).input("j", sql.NVarChar(2000), criteriosJson).input("eu", sql.Int, ver.membroId).input("min", sql.Int, REPETIDO_MINUTOS)
      .query(`SELECT TOP 1 EnvioId FROM ComunicacaoEnvios WHERE ModeloId = @mo AND CriteriosJson = @j AND EnviadoPorMembroId = @eu AND CriadoEm >= DATEADD(MINUTE, -@min, SYSUTCDATETIME()) ORDER BY EnvioId DESC`)).recordset[0];
    if (antes) { envioId = antes.EnvioId; repetido = true; await fecharTransacao(t, false); }
    else {
      envioId = (await new sql.Request(t).input("mo", sql.Int, modeloId).input("k", sql.NVarChar(12), m.Categoria).input("j", sql.NVarChar(2000), criteriosJson).input("g", sql.NVarChar(500), grupo)
        .input("eu", sql.Int, ver.membroId).input("tot", sql.Int, sininho.length)
        .query(`INSERT INTO ComunicacaoEnvios (ModeloId, Categoria, CriteriosJson, GrupoDescricao, EnviadoPorMembroId, Total) VALUES (@mo, @k, @j, @g, @eu, @tot); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
      await new sql.Request(t).input("e", sql.Int, envioId).input("j", sql.NVarChar(sql.MAX), JSON.stringify(entregas)).query(`
        INSERT INTO ComunicacaoEntregas (EnvioId, MembroId, Canal, Situacao) SELECT @e, x.m, x.c, x.s FROM OPENJSON(@j) WITH (m INT '$.m', c NVARCHAR(10) '$.c', s NVARCHAR(18) '$.s') x`);
      await new sql.Request(t).input("e", sql.Int, envioId).input("j", sql.NVarChar(sql.MAX), JSON.stringify(sininho)).query(`
        INSERT INTO Notificacoes (RegraChave, DestinatarioMembroId, Titulo, Mensagem, Categoria, ReferenciaTabela, ReferenciaId)
        SELECT N'COMUNICADO', x.d, x.t, x.msg, N'COMUNICACAO', N'ComunicacaoEnvios', @e FROM OPENJSON(@j) WITH (d INT '$.d', t NVARCHAR(200) '$.t', msg NVARCHAR(1000) '$.msg') x`);
      await t.commit();
    }
  } catch (e) { await fecharTransacao(t, false); throw e; }
  if (!repetido) {
    await auditar("ComunicacaoEnvios", envioId, `COMUNICACAO_ENVIO_${m.Categoria}`, ver.membroId);
    await regravarMarca(pool);
    // a primeira rodada vai junto com a resposta: curta (o celular por até ~6 s e no máximo 10 e-mails), o resto segue pela rotina de 15 em 15 minutos
    try { await processarFila(pool, { deps, orcamentoMs: deps.orcamentoMs || 12000, maxEmails: 10 }); } catch (e) { console.error("[COMUNICACAO] primeira rodada da fila:", e.message); }
  }
  return { sucesso: true, envioId, repetido, ...(await relatorio(pool, { ver, envioId })) };
}

async function cancelar(pool, { ver, envioId }) {
  const e = (await pool.request().input("id", sql.Int, envioId).query(`SELECT EnvioId, EnviadoPorMembroId, Status FROM ComunicacaoEnvios WHERE EnvioId = @id`)).recordset[0];
  if (!e || !(ver.geral || Number(e.EnviadoPorMembroId) === Number(ver.membroId))) return NAO_EXISTE;
  if (e.Status !== "FILA") return RECUSA(e.Status === "CANCELADO" ? "Este envio já foi cancelado." : "Este envio já terminou: não há o que cancelar.");
  const t = new sql.Transaction(pool);
  try {
    await t.begin();
    const r = await new sql.Request(t).input("id", sql.Int, envioId).input("por", sql.Int, ver.membroId)
      .query(`UPDATE ComunicacaoEnvios SET Status = 'CANCELADO', ConcluidoEm = SYSUTCDATETIME(), CanceladoPorMembroId = @por WHERE EnvioId = @id AND Status = 'FILA'; SELECT @@ROWCOUNT AS n`);
    if (!contagem(r)) { await fecharTransacao(t, false); return MUDOU("O envio mudou enquanto você decidia. Abra de novo."); }
    await new sql.Request(t).input("id", sql.Int, envioId).query(`UPDATE ComunicacaoEntregas SET Situacao = 'CANCELADO', AtualizadoEm = SYSUTCDATETIME() WHERE EnvioId = @id AND Situacao = 'PENDENTE'`);
    await t.commit();
  } catch (x) { await fecharTransacao(t, false); throw x; }
  await auditar("ComunicacaoEnvios", envioId, "COMUNICACAO_ENVIO_CANCELADO", ver.membroId);
  await regravarMarca(pool);
  return { sucesso: true, mensagem: "Envio cancelado: o que ainda estava na fila não sai. O que já foi entregue (e o sininho) fica." };
}

// ---- A fila ----

// Toma até `n` entregas pendentes do canal (ninguém mais as pega: READPAST + UPDLOCK) e devolve o que é preciso para mandar.
async function tomar(rq, canal, n) {
  if (n <= 0) return [];
  const r = await rq.input("canal", sql.NVarChar(10), canal).input("n", sql.Int, n).query(`
    DECLARE @tomadas TABLE (EntregaId INT, EnvioId INT, MembroId INT);
    WITH alvo AS (SELECT TOP (@n) * FROM ComunicacaoEntregas WITH (READPAST, UPDLOCK, ROWLOCK) WHERE Canal = @canal AND Situacao = 'PENDENTE' ORDER BY EntregaId)
    UPDATE alvo SET Situacao = 'ENVIANDO', AtualizadoEm = SYSUTCDATETIME() OUTPUT inserted.EntregaId, inserted.EnvioId, inserted.MembroId INTO @tomadas;
    SELECT EntregaId, EnvioId, MembroId FROM @tomadas ORDER BY EntregaId`);
  return r.recordset;
}
async function dadosDoEnvio(pool, cache, envioId) {
  if (!cache.has(envioId)) {
    cache.set(envioId, (await pool.request().input("id", sql.Int, envioId).query(`
      SELECT e.EnvioId, e.Status, e.Categoria, m.Titulo, m.Corpo FROM ComunicacaoEnvios e JOIN ComunicacaoModelos m ON m.ModeloId = e.ModeloId WHERE e.EnvioId = @id`)).recordset[0] || null);
  }
  return cache.get(envioId);
}
async function dadosDaPessoa(pool, membroId, canal, categoria) {
  return (await pool.request().input("m", sql.Int, membroId).input("c", sql.NVarChar(10), canal).input("k", sql.NVarChar(12), categoria).query(`
    SELECT m.Nome, m.Email, m.Status, c.Nome AS Congregacao,
      (SELECT TOP 1 CAST(k.Concedido AS INT) FROM ComunicacaoConsentimentos k WHERE k.MembroId = m.MembroId AND k.Canal = @c AND k.Categoria = @k ORDER BY k.ConsentimentoId DESC) AS Sim
    FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @m`)).recordset[0] || null;
}
async function marcar(pool, entregaId, situacao) {
  await pool.request().input("id", sql.Int, entregaId).input("s", sql.NVarChar(18), situacao)
    .query(`UPDATE ComunicacaoEntregas SET Situacao = @s, AtualizadoEm = SYSUTCDATETIME() WHERE EntregaId = @id AND Situacao = 'ENVIANDO'`);
}
// O que mudou entre o envio e a rodada: envio cancelado, consentimento retirado, pessoa que saiu.
function antesDeMandar(envio, pessoa) {
  if (!envio || envio.Status === "CANCELADO") return "CANCELADO";
  if (!pessoa || pessoa.Status !== "ATIVO") return "CANCELADO";
  if (!cm.CATEGORIAS[envio.Categoria].obrigatoria && !Number(pessoa.Sim)) return "SEM_CONSENTIMENTO";
  return null;
}

// Uma rodada: os presos viram FALHOU; o celular sai em lotes até o tempo acabar; o e-mail sai até o teto da rodada e da hora; o envio sem nada na fila é concluído.
async function processarFila(pool, { deps = {}, orcamentoMs = 20000, segredo = null, maxEmails = Infinity } = {}) {
  const inicio = Date.now();
  const enviarEmail = deps.enviarEmail || enviarEmailComunicado;
  const enviarPush = deps.enviarPush || ((membroId, msg) => enviarPushNotificacao(pool, sql, membroId, msg));
  const segredoSaida = segredo || require("./segredoSessao").resolverSegredo();
  const cache = new Map();
  const res = { presos: 0, push: { aceitos: 0, outros: 0 }, email: { aceitos: 0, outros: 0, adiados: 0, cota: 0 }, concluidos: 0 };
  res.presos = contagem(await pool.request().input("min", sql.Int, PRESO_MINUTOS).query(`
    UPDATE ComunicacaoEntregas SET Situacao = 'FALHOU', AtualizadoEm = SYSUTCDATETIME() WHERE Situacao = 'ENVIANDO' AND AtualizadoEm < DATEADD(MINUTE, -@min, SYSUTCDATETIME()); SELECT @@ROWCOUNT AS n`));

  // celular
  while (Date.now() - inicio < orcamentoMs * 0.5) {
    const lote = await tomar(pool.request(), "PUSH", PUSH_POR_LOTE);
    if (!lote.length) break;
    for (const x of lote) {
      const envio = await dadosDoEnvio(pool, cache, x.EnvioId);
      const pessoa = await dadosDaPessoa(pool, x.MembroId, "PUSH", envio && envio.Categoria);
      const barrado = antesDeMandar(envio, pessoa);
      if (barrado) { await marcar(pool, x.EntregaId, barrado); res.push.outros++; continue; }
      let n = 0;
      try {
        const corpo = cm.preencher(envio.Corpo, { nome: pessoa.Nome, congregacao: pessoa.Congregacao });
        n = await enviarPush(x.MembroId, { titulo: cm.preencher(envio.Titulo, { nome: pessoa.Nome, congregacao: pessoa.Congregacao }), mensagem: corpo.length > 180 ? corpo.slice(0, 177) + "…" : corpo });
      } catch (e) { n = 0; }
      await marcar(pool, x.EntregaId, n > 0 ? "ACEITO" : "SEM_APARELHO");
      if (n > 0) res.push.aceitos++; else res.push.outros++;
    }
  }

  // e-mail: a cota da rodada e a da última hora (somando os comunicados já aceitos) decidem quantos saem; uma rodada por vez decide
  const porRodada = await lerPrazoDias(pool, "COMUNICACAO_EMAILS_POR_RODADA", 20);
  const porHora = await lerPrazoDias(pool, "COMUNICACAO_EMAILS_POR_HORA", 80);
  const t = new sql.Transaction(pool);
  let lote = [];
  try {
    await t.begin();
    if (await obterTrava(() => new sql.Request(t), "comunicacao-fila-email", 5000)) {
      const naHora = contagem(await new sql.Request(t).query(`SELECT COUNT(*) AS n FROM ComunicacaoEntregas WHERE Canal = 'EMAIL' AND Situacao IN ('ACEITO', 'ENVIANDO') AND AtualizadoEm >= DATEADD(MINUTE, -60, SYSUTCDATETIME())`));
      res.email.cota = Math.max(0, Math.min(porRodada, porHora - naHora, maxEmails));
      lote = await tomar(new sql.Request(t), "EMAIL", res.email.cota);
    }
    await t.commit();
  } catch (e) { await fecharTransacao(t, false); throw e; }
  for (let i = 0; i < lote.length; i++) {
    const x = lote[i];
    const envio = await dadosDoEnvio(pool, cache, x.EnvioId);
    const pessoa = await dadosDaPessoa(pool, x.MembroId, "EMAIL", envio && envio.Categoria);
    const barrado = antesDeMandar(envio, pessoa) || (!pessoa.Email || !String(pessoa.Email).trim() ? "SEM_CONTATO" : null);
    if (barrado) { await marcar(pool, x.EntregaId, barrado); res.email.outros++; continue; }
    const vars = { nome: pessoa.Nome, congregacao: pessoa.Congregacao };
    const linkSair = cm.CATEGORIAS[envio.Categoria].obrigatoria ? null
      : `${BASE_URL()}/sair.html?t=${encodeURIComponent(cm.assinarSaida(segredoSaida, { membroId: x.MembroId, categoria: envio.Categoria, envioId: x.EnvioId }))}`;
    const email = cm.montarEmail({ titulo: cm.preencher(envio.Titulo, vars), corpo: cm.preencher(envio.Corpo, vars), categoria: envio.Categoria, linkSair });
    const r = await enviarEmail({ email: String(pessoa.Email).trim(), assunto: email.assunto, texto: email.texto, html: email.html });
    if (r && r.limite) {
      // o serviço recusou por excesso: nada saiu; esta e as que sobraram voltam para a fila
      const ids = lote.slice(i).map((y) => y.EntregaId);
      await pool.request().input("ids", sql.NVarChar(sql.MAX), JSON.stringify(ids))
        .query(`UPDATE ComunicacaoEntregas SET Situacao = 'PENDENTE', AtualizadoEm = SYSUTCDATETIME() WHERE Situacao = 'ENVIANDO' AND EntregaId IN (SELECT value FROM OPENJSON(@ids))`);
      res.email.adiados += ids.length;
      break;
    }
    await marcar(pool, x.EntregaId, r && r.ok ? "ACEITO" : "FALHOU");
    if (r && r.ok) res.email.aceitos++; else res.email.outros++;
  }

  res.concluidos = contagem(await pool.request().query(`
    UPDATE e SET Status = 'CONCLUIDO', ConcluidoEm = SYSUTCDATETIME() FROM ComunicacaoEnvios e
    WHERE e.Status = 'FILA' AND NOT EXISTS (SELECT 1 FROM ComunicacaoEntregas x WHERE x.EnvioId = e.EnvioId AND x.Situacao IN ('PENDENTE', 'ENVIANDO')); SELECT @@ROWCOUNT AS n`));
  res.pendentes = await pendentesNaFila(pool);
  await marca.gravar(res.pendentes);
  return res;
}

// ---- Relatório ----

async function relatorio(pool, { ver, envioId }) {
  const e = (await pool.request().input("id", sql.Int, envioId).query(`
    SELECT e.*, m.Titulo, m.Versao, m.Chave, p.Nome AS EnviadoPor FROM ComunicacaoEnvios e JOIN ComunicacaoModelos m ON m.ModeloId = e.ModeloId
    LEFT JOIN MembroReferencia p ON p.MembroId = e.EnviadoPorMembroId WHERE e.EnvioId = @id`)).recordset[0];
  if (!e || !(ver.geral || Number(e.EnviadoPorMembroId) === Number(ver.membroId))) return NAO_EXISTE;
  const porCanal = (await pool.request().input("id", sql.Int, envioId).query(`
    SELECT Canal, Situacao, COUNT(*) AS n FROM ComunicacaoEntregas WHERE EnvioId = @id GROUP BY Canal, Situacao`)).recordset;
  const canais = {};
  for (const l of porCanal) (canais[l.Canal] = canais[l.Canal] || {})[l.Situacao] = Number(l.n);
  const leitura = (await pool.request().input("id", sql.Int, envioId).query(`
    SELECT (SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'COMUNICADO' AND ReferenciaTabela = 'ComunicacaoEnvios' AND ReferenciaId = @id AND Lida = 1) AS lidos,
           (SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @id AND Canal = 'SININHO' AND CienciaEm IS NOT NULL) AS ciencia`)).recordset[0];
  const saida = {
    envio: { envioId: e.EnvioId, titulo: e.Titulo, versao: e.Versao, categoria: e.Categoria, categoriaRotulo: cm.CATEGORIAS[e.Categoria].rotulo, grupo: e.GrupoDescricao, total: e.Total,
      status: e.Status, criadoEm: iso(e.CriadoEm), concluidoEm: iso(e.ConcluidoEm), enviadoPor: e.EnviadoPor },
    canais, lidos: Number(leitura.lidos) || 0, ciencia: Number(leitura.ciencia) || 0
  };
  // Na convocação: quem não foi alcançado por canal nenhum fora do sistema e não leu nem deu ciência — para a Secretaria procurar por telefone (só o nível geral vê o telefone).
  if (e.Categoria === "CONVOCACAO") {
    const r = await pool.request().input("id", sql.Int, envioId).query(`
      SELECT TOP 500 m.MembroId, m.Nome, c.Nome AS Congregacao, m.Telefone FROM ComunicacaoEntregas s
      JOIN MembroReferencia m ON m.MembroId = s.MembroId LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
      WHERE s.EnvioId = @id AND s.Canal = 'SININHO' AND s.CienciaEm IS NULL
        AND NOT EXISTS (SELECT 1 FROM ComunicacaoEntregas x WHERE x.EnvioId = s.EnvioId AND x.MembroId = s.MembroId AND x.Canal IN ('EMAIL', 'PUSH') AND x.Situacao = 'ACEITO')
        AND NOT EXISTS (SELECT 1 FROM Notificacoes n WHERE n.RegraChave = 'COMUNICADO' AND n.ReferenciaTabela = 'ComunicacaoEnvios' AND n.ReferenciaId = s.EnvioId AND n.DestinatarioMembroId = s.MembroId AND n.Lida = 1)
      ORDER BY c.Nome, m.Nome`);
    saida.naoAlcancados = r.recordset.map((p) => ({ membroId: p.MembroId, nome: p.Nome, congregacao: p.Congregacao, ...(ver.geral ? { telefone: p.Telefone || null } : {}) }));
  }
  return saida;
}
async function listarEnvios(pool, { ver }) {
  const r = await pool.request().input("eu", sql.Int, ver.membroId).query(`
    SELECT TOP 200 e.EnvioId, e.Categoria, e.GrupoDescricao, e.Total, e.Status, e.CriadoEm, e.ConcluidoEm, m.Titulo, p.Nome AS EnviadoPor,
      (SELECT COUNT(*) FROM ComunicacaoEntregas x WHERE x.EnvioId = e.EnvioId AND x.Canal IN ('EMAIL', 'PUSH') AND x.Situacao IN ('PENDENTE', 'ENVIANDO')) AS NaFila
    FROM ComunicacaoEnvios e JOIN ComunicacaoModelos m ON m.ModeloId = e.ModeloId LEFT JOIN MembroReferencia p ON p.MembroId = e.EnviadoPorMembroId
    WHERE ${ver.geral ? "1 = 1" : "e.EnviadoPorMembroId = @eu"} ORDER BY e.EnvioId DESC`);
  return r.recordset.map((e) => ({ envioId: e.EnvioId, titulo: e.Titulo, categoria: e.Categoria, categoriaRotulo: cm.CATEGORIAS[e.Categoria].rotulo, grupo: e.GrupoDescricao, total: e.Total,
    status: e.Status, naFila: Number(e.NaFila) || 0, criadoEm: iso(e.CriadoEm), concluidoEm: iso(e.ConcluidoEm), enviadoPor: e.EnviadoPor }));
}

// ---- Do lado de quem recebe ----

async function meusComunicados(pool, membroId) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT TOP 100 e.EnvioId, e.Categoria, e.CriadoEm, m.Titulo, m.Corpo, s.CienciaEm, mr.Nome, c.Nome AS Congregacao,
      (SELECT TOP 1 CAST(n.Lida AS INT) FROM Notificacoes n WHERE n.RegraChave = 'COMUNICADO' AND n.ReferenciaTabela = 'ComunicacaoEnvios' AND n.ReferenciaId = e.EnvioId AND n.DestinatarioMembroId = @m) AS Lida
    FROM ComunicacaoEntregas s JOIN ComunicacaoEnvios e ON e.EnvioId = s.EnvioId JOIN ComunicacaoModelos m ON m.ModeloId = e.ModeloId
    JOIN MembroReferencia mr ON mr.MembroId = s.MembroId LEFT JOIN Congregacoes c ON c.CongregacaoId = mr.CongregacaoId
    WHERE s.MembroId = @m AND s.Canal = 'SININHO' ORDER BY e.EnvioId DESC`);
  return r.recordset.map((x) => {
    const vars = { nome: x.Nome, congregacao: x.Congregacao };
    return { envioId: x.EnvioId, categoria: x.Categoria, categoriaRotulo: cm.CATEGORIAS[x.Categoria].rotulo, titulo: cm.preencher(x.Titulo, vars), texto: cm.preencher(x.Corpo, vars),
      recebidoEm: iso(x.CriadoEm), lido: !!Number(x.Lida), cienciaEm: iso(x.CienciaEm), pedeCiencia: x.Categoria === "CONVOCACAO" };
  });
}
// "Recebi a convocação": a ciência fica no registro de entrega, e o aviso do sininho conta como lido.
async function darCiencia(pool, { membroId, envioId }) {
  const s = (await pool.request().input("m", sql.Int, membroId).input("e", sql.Int, envioId).query(`
    SELECT s.EntregaId, s.CienciaEm, e.Categoria FROM ComunicacaoEntregas s JOIN ComunicacaoEnvios e ON e.EnvioId = s.EnvioId WHERE s.MembroId = @m AND s.EnvioId = @e AND s.Canal = 'SININHO'`)).recordset[0];
  if (!s) return NAO_EXISTE;
  if (s.Categoria !== "CONVOCACAO") return RECUSA("Só a convocação oficial pede ciência.");
  if (!s.CienciaEm) {
    await pool.request().input("id", sql.Int, s.EntregaId).query(`UPDATE ComunicacaoEntregas SET CienciaEm = SYSUTCDATETIME() WHERE EntregaId = @id AND CienciaEm IS NULL`);
    await auditar("ComunicacaoEntregas", s.EntregaId, "COMUNICACAO_CIENCIA", membroId);
  }
  await pool.request().input("m", sql.Int, membroId).input("e", sql.Int, envioId).query(`
    UPDATE Notificacoes SET Lida = 1, LidaEm = SYSUTCDATETIME() WHERE RegraChave = 'COMUNICADO' AND ReferenciaTabela = 'ComunicacaoEnvios' AND ReferenciaId = @e AND DestinatarioMembroId = @m AND Lida = 0`);
  return { sucesso: true, comunicados: await meusComunicados(pool, membroId) };
}

// ---------------------------------------------------------------
// Rotina diária, retenção e LGPD
// ---------------------------------------------------------------

async function diasDeRetencao(pool, chave) {
  const r = RETENCAO[chave];
  const linha = (await pool.request().input("c", sql.NVarChar(60), r.categoria).query(`SELECT TOP 1 DiasRetencao FROM PoliticasRetencao WHERE Categoria = @c AND Ativo = 1`)).recordset[0];
  const n = linha ? Number(linha.DiasRetencao) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : r.padrao;
}
// O registro de entrega perde o nome depois do prazo (1 ano; 5 na convocação oficial). A contagem do envio fica.
async function aplicarRetencao(pool) {
  const comum = await diasDeRetencao(pool, "entregas");
  const conv = await diasDeRetencao(pool, "convocacao");
  const r = await pool.request().input("dc", sql.Int, comum).input("dv", sql.Int, conv).query(`
    UPDATE s SET MembroId = NULL, AnonimizadoEm = SYSUTCDATETIME() FROM ComunicacaoEntregas s JOIN ComunicacaoEnvios e ON e.EnvioId = s.EnvioId
    WHERE s.MembroId IS NOT NULL AND e.CriadoEm < DATEADD(DAY, -CASE WHEN e.Categoria = 'CONVOCACAO' THEN @dv ELSE @dc END, SYSUTCDATETIME()); SELECT @@ROWCOUNT AS n`);
  return { entregas: contagem(r) };
}
async function rotinaDiaria(pool) {
  const r = { falhas: [] };
  try { r.retencao = await aplicarRetencao(pool); } catch (e) { r.falhas.push("retencao"); console.error("[COMUNICACAO] retenção:", e.message); }
  try { r.fila = await processarFila(pool); } catch (e) { r.falhas.push("fila"); console.error("[COMUNICACAO] fila:", e.message); }
  return r;
}

// Exclusão LGPD (dentro da transação de ExecutarExclusaoLGPD): o histórico de consentimento sai, o registro de entrega perde o nome; as preferências de aviso e os aparelhos
// inscritos também saem (a exclusão antiga não os tocava).
async function exclusaoLgpd(r, membroId) {
  const consent = await r().input("m", sql.Int, membroId).query(comMarcaDePurga(`DELETE FROM ComunicacaoConsentimentos WHERE MembroId = @m; SET @apagadas = @@ROWCOUNT;`));
  const entregas = await r().input("m", sql.Int, membroId).query(`
    UPDATE ComunicacaoEntregas SET Situacao = CASE WHEN Situacao IN ('PENDENTE', 'ENVIANDO') THEN 'CANCELADO' ELSE Situacao END, MembroId = NULL, AnonimizadoEm = SYSUTCDATETIME()
    WHERE MembroId = @m; SELECT @@ROWCOUNT AS n`);
  const prefs = await r().input("m", sql.Int, membroId).query(`DELETE FROM NotificacaoPreferencias WHERE MembroId = @m; SELECT @@ROWCOUNT AS n`);
  const aparelhos = await r().input("m", sql.Int, membroId).query(`DELETE FROM PushInscricoesMembro WHERE MembroId = @m; SELECT @@ROWCOUNT AS n`);
  return { consentimentos: contagem(consent), entregas: contagem(entregas), preferencias: contagem(prefs), aparelhos: contagem(aparelhos) };
}
// Meus Dados: o histórico de consentimento e quantos comunicados a pessoa recebeu.
async function dadosDoTitular(pool, membroId) {
  const k = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT Canal, Categoria, Concedido, Origem, TextoVersao, DataFicha, CriadoEm FROM ComunicacaoConsentimentos WHERE MembroId = @m ORDER BY ConsentimentoId DESC`);
  const n = contagem(await pool.request().input("m", sql.Int, membroId).query(`SELECT COUNT(*) AS n FROM ComunicacaoEntregas WHERE MembroId = @m AND Canal = 'SININHO'`));
  return {
    consentimentos: k.recordset.map((x) => ({ canal: cm.CANAIS[x.Canal] || x.Canal, categoria: (cm.CATEGORIAS[x.Categoria] || {}).rotulo || x.Categoria, concedido: !!x.Concedido, origem: x.Origem,
      versaoDoTexto: x.TextoVersao, dataFicha: x.DataFicha ? iso(x.DataFicha).slice(0, 10) : null, em: iso(x.CriadoEm) })),
    comunicadosRecebidos: n
  };
}

module.exports = {
  PERMISSAO, MAX_GRUPO, minhasPreferencias, salvarPreferencias, validarMudancas, registrarFicha, consultarSaida, confirmarSaida,
  listarModelos, salvarModelo, aprovarModelo, arquivarModelo, opcoes, resolverGrupo, previa, salvarGrupo, listarGrupos, excluirGrupo,
  enviar, cancelar, processarFila, relatorio, listarEnvios, meusComunicados, darCiencia, aplicarRetencao, rotinaDiaria, exclusaoLgpd, dadosDoTitular, regravarMarca
};
