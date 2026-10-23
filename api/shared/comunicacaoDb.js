// shared/comunicacaoDb.js (v7.12 — Comunicação) — o banco. A regra está em shared/comunicacao.js (pura, testada).
//
// Quatro partes: (1) o consentimento de cada membro, por canal e categoria (Meu Painel, ficha em papel, link de saída); (2) os modelos aprovados; (3) o grupo, calculado na hora
// pelos critérios, sempre cortado pelo território de quem envia; (4) o envio: o sininho e o registro de entrega nascem juntos, o celular e o e-mail vão por uma fila que respeita
// o limite do serviço de e-mail do Azure (30 por minuto e 100 por hora no domínio da Igreja, somando os avisos e os códigos de acesso). Um e-mail nunca sai duas vezes: a entrega
// é "tomada" (ENVIANDO) antes de mandar; a que travar no meio vira FALHOU, não é repetida sozinha; a que não chegou a ser tentada volta para a fila.
// A convocação oficial passa na frente na fila (o prazo do Estatuto não espera um devocional grande).
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
const MAX_NAO_ALCANCADOS = 500;
const LOTE_INSERCAO = 1000;                  // o envio grava entregas e avisos em blocos (5.000 pessoas = 15.000 entregas): cada comando fica pequeno no banco de 5 DTU
const RETENCAO = {
  entregas: { categoria: "Comunicação — registro de entrega", padrao: 365 },
  convocacao: { categoria: "Comunicação — registro de entrega da convocação oficial", padrao: 1825 }
};
const BASE_URL = () => (process.env.APP_BASE_URL || "https://app.ieadespa.org.br").replace(/\/+$/, "");
const PUSH_POR_LOTE = 25;
const PRESO_MINUTOS = 30;                    // ENVIANDO há mais que isto = a rodada caiu no meio de um envio: vira FALHOU (nunca reenviado sozinho)
const REPETIDO_MINUTOS = 10;                 // o mesmo modelo para o mesmo grupo, pela mesma pessoa, em 10 minutos = o mesmo envio (duplo clique, resposta perdida)
const MAX_FICHA_ANOS = 2;

const NAO_EXISTE = { sucesso: false, naoExiste: true };
const PROIBIDO = (mensagem) => ({ sucesso: false, proibido: true, mensagem });
const MUDOU = (mensagem) => ({ sucesso: false, mudou: true, mensagem });
const RECUSA = (mensagem) => ({ sucesso: false, mensagem });
const OCUPADO = (mensagem) => ({ sucesso: false, limite: true, mensagem });
const iso = (v) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
// v7.15: a categoria do sistema (CRISE) nunca entra pela tela de comunicados; ela nasce em shared/criseSegurancaDb.js (avisoDoSistema* abaixo)
const doSistema = (categoria) => cm.CATEGORIAS_DO_SISTEMA.includes(categoria);
const SEM_SISTEMA = (coluna) => `${coluna} NOT IN (${cm.CATEGORIAS_DO_SISTEMA.map((c) => `'${c}'`).join(", ") || "''"})`;
const COM_SISTEMA = (coluna) => `${coluna} IN (${cm.CATEGORIAS_DO_SISTEMA.map((c) => `'${c}'`).join(", ") || "''"})`;
const LISTA_DE_PROVA = cm.CATEGORIAS_DE_PROVA.map((c) => `'${c}'`).join(", ");
const dia = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
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
function emBlocos(lista, tamanho) { const saida = []; for (let i = 0; i < lista.length; i += tamanho) saida.push(lista.slice(i, i + tamanho)); return saida; }
// Data AAAA-MM-DD que existe de verdade ("2026-02-30" não vira 2 de março).
function dataValida(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0, 10) === v;
}
const EXCLUIDO_SQL = "EXISTS (SELECT 1 FROM SolicitacoesTitularLGPD s WHERE s.MembroId = m.MembroId AND s.Tipo = 'EXCLUSAO' AND s.Status = 'ATENDIDA')";

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
// A situação da pessoa para consentir: menor de 18 com data conhecida (o consentimento do menor é dos responsáveis: LGPD art. 14) e quem teve a exclusão LGPD atendida não
// marcam "sim".
async function situacaoDoTitular(rq, membroId, hoje) {
  return (await rq.input("m", sql.Int, membroId).input("hoje", sql.Date, hoje).query(`
    SELECT m.MembroId, m.Status, c.Nome AS Congregacao,
      CASE WHEN m.DataNascimento IS NOT NULL AND m.DataNascimento > DATEADD(YEAR, -18, @hoje) THEN 1 ELSE 0 END AS Menor,
      CASE WHEN ${EXCLUIDO_SQL} THEN 1 ELSE 0 END AS Excluido
    FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @m`)).recordset[0] || null;
}

// O que a pessoa vê em Meu Painel → Comunicações.
async function minhasPreferencias(pool, membroId) {
  const v = await vigentes(pool, membroId);
  const m = (await pool.request().input("m", sql.Int, membroId).query(`
    SELECT CASE WHEN Email IS NULL OR LTRIM(RTRIM(Email)) = '' THEN 0 ELSE 1 END AS TemEmail,
           (SELECT COUNT(*) FROM PushInscricoesMembro p WHERE p.MembroId = @m) AS Aparelhos
    FROM MembroReferencia WHERE MembroId = @m`)).recordset[0] || { TemEmail: 0, Aparelhos: 0 };
  const categorias = Object.entries(cm.CATEGORIAS).filter(([, c]) => !c.sistema).map(([codigo, c]) => ({
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
    if (!x || typeof x !== "object" || !cm.ehCanal(x.canal) || !cm.CATEGORIAS_COM_CONSENTIMENTO.includes(x.categoria) || typeof x.concedido !== "boolean") return { problema: "Escolha inválida." };
    const chave = `${x.canal}|${x.categoria}`;
    if (vistas.has(chave)) return { problema: "Escolha repetida." };
    vistas.add(chave);
    if (x.concedido && x.hash !== cm.hashDoTexto(x.categoria)) return { problema: "O texto da autorização mudou: recarregue a página, leia de novo e marque outra vez.", textoMudou: true };
    saida.push({ canal: x.canal, categoria: x.categoria, concedido: x.concedido });
  }
  return { mudancas: saida };
}
async function gravarMudancas(pool, { membroId, mudancas, origem, ip = null, registradoPor = null, dataFicha = null, fichaReferencia = null, envioId = null }) {
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
      // a ficha em papel não passa por cima do que a pessoa disse DEPOIS da data da ficha (no Meu Painel ou no link do e-mail)
      if (origem === "FICHA_PAPEL" && x.concedido) {
        const depois = (await new sql.Request(t).input("m", sql.Int, membroId).input("c", sql.NVarChar(10), x.canal).input("k", sql.NVarChar(12), x.categoria).input("df", sql.Date, dataFicha)
          .query(`SELECT COUNT(*) AS n FROM ComunicacaoConsentimentos WHERE MembroId = @m AND Canal = @c AND Categoria = @k AND Origem IN ('MEU_PAINEL', 'LINK_SAIR') AND CAST(CriadoEm AS DATE) > @df`));
        if (contagem(depois)) { await fecharTransacao(t, false); return { depoisDaFicha: true }; }
      }
      const saida = origem === "LINK_SAIR";
      await new sql.Request(t).input("m", sql.Int, membroId).input("c", sql.NVarChar(10), x.canal).input("k", sql.NVarChar(12), x.categoria).input("s", sql.Bit, x.concedido ? 1 : 0)
        .input("o", sql.NVarChar(14), origem).input("v", sql.NVarChar(20), cm.TEXTO_VERSAO).input("h", sql.Char(64), saida ? cm.HASH_SAIDA : cm.hashDoTexto(x.categoria))
        .input("df", sql.Date, dataFicha).input("fr", sql.NVarChar(100), fichaReferencia).input("ip", sql.NVarChar(64), ip ? String(ip).slice(0, 64) : null)
        .input("por", sql.Int, registradoPor).input("e", sql.Int, envioId)
        .query(`INSERT INTO ComunicacaoConsentimentos (MembroId, Canal, Categoria, Concedido, Origem, TextoVersao, TextoHash, DataFicha, FichaReferencia, EnderecoIp, RegistradoPorMembroId, EnvioId)
                VALUES (@m, @c, @k, @s, @o, @v, @h, @df, @fr, @ip, @por, @e)`);
      gravadas++;
    }
    await t.commit();
  } catch (e) { await fecharTransacao(t, false); throw e; }
  if (gravadas) await auditar("ComunicacaoConsentimentos", membroId, `COMUNICACAO_CONSENTIMENTO_${origem}`, registradoPor || membroId);
  return { gravadas };
}
async function salvarPreferencias(pool, { membroId, dados, ip, hoje = hojeBrasilia() }) {
  const v = validarMudancas((dados || {}).mudancas);
  if (v.problema) return { ...RECUSA(v.problema), ...(v.textoMudou ? { textoMudou: true } : {}) };
  if (v.mudancas.some((x) => x.concedido)) {
    const p = await situacaoDoTitular(pool.request(), membroId, hoje);
    if (!p || p.Excluido) return RECUSA("Não é possível autorizar comunicados: os seus dados foram excluídos a seu pedido.");
    if (p.Menor) return RECUSA("Quem tem menos de 18 anos não autoriza sozinho: fale com a Secretaria (a autorização é dos seus responsáveis).");
  }
  const r = await gravarMudancas(pool, { membroId, mudancas: v.mudancas, origem: "MEU_PAINEL", ip });
  if (r.ocupado) return OCUPADO("Outra mudança está sendo gravada. Tente de novo.");
  return { sucesso: true, gravadas: r.gravadas, ...(await minhasPreferencias(pool, membroId)) };
}

// O nível geral (a Secretaria) lança o "sim" ou o "não" que a pessoa deu numa ficha em papel, com a referência da ficha guardada (a prova do consentimento é da Igreja: LGPD
// art. 8º, § 2º). A ficha não vence o que a pessoa disse depois da data dela.
async function registrarFicha(pool, { ver, dados, hoje = hojeBrasilia() }) {
  if (!ver.geral) return PROIBIDO("A ficha em papel é lançada pela Secretaria (nível geral), que guarda a ficha.");
  const d = dados || {};
  const membroId = Number.isInteger(d.membroId) && d.membroId > 0 ? d.membroId : null;
  if (!membroId) return RECUSA("Informe a matrícula.");
  if (!cm.ehCanal(d.canal) || !cm.CATEGORIAS_COM_CONSENTIMENTO.includes(d.categoria) || typeof d.concedido !== "boolean") return RECUSA("Escolha o canal, a categoria e se a pessoa autorizou.");
  if (!dataValida(d.dataFicha)) return RECUSA("Informe a data da ficha.");
  if (d.dataFicha > hoje) return RECUSA("A data da ficha não pode ser no futuro.");
  if (d.dataFicha < `${Number(hoje.slice(0, 4)) - MAX_FICHA_ANOS}${hoje.slice(4)}`) return RECUSA("Ficha com mais de 2 anos: peça à pessoa uma ficha nova.");
  const ref = cm.validarTexto(d.fichaReferencia, { campo: "a referência da ficha (número, livro ou pasta)", max: 100, min: 3 });
  if (ref.problema) return RECUSA(ref.problema);
  if (membroId === ver.membroId) return RECUSA("O seu próprio consentimento você marca em Meu Painel → Comunicações.");
  const p = await situacaoDoTitular(pool.request(), membroId, hoje);
  if (!p) return NAO_EXISTE;
  if (p.Excluido) return RECUSA("Esta pessoa teve a exclusão dos dados atendida: não se registra consentimento.");
  if (d.concedido && p.Status !== "ATIVO") return RECUSA("A pessoa não está ativa no cadastro.");
  if (d.concedido && p.Menor) return RECUSA("Menor de 18 anos: a autorização é dos responsáveis, e o comunicado ao menor fica fora desta versão.");
  const r = await gravarMudancas(pool, { membroId, mudancas: [{ canal: d.canal, categoria: d.categoria, concedido: d.concedido }], origem: "FICHA_PAPEL", registradoPor: ver.membroId,
    dataFicha: d.dataFicha, fichaReferencia: ref.texto });
  if (r.ocupado) return OCUPADO("Outra mudança está sendo gravada. Tente de novo.");
  if (r.depoisDaFicha) return RECUSA("A pessoa mudou esta escolha no sistema depois da data desta ficha: vale o que ela marcou por último. Se ela quer receber de novo, ela marca em Meu Painel ou assina uma ficha nova.");
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
async function confirmarSaida(pool, { token, segredo, ip, hoje = hojeBrasilia() }) {
  const s = cm.lerSaida(segredo, token);
  if (!s) return { sucesso: false, invalido: true };
  const p = await situacaoDoTitular(pool.request(), s.membroId, hoje);
  if (!p) return { sucesso: false, invalido: true };
  // quem teve a exclusão atendida já não recebe nada e não ganha linha nova (nem o endereço de quem clicou)
  if (p.Excluido) return { sucesso: true, rotulo: cm.CATEGORIAS[s.categoria].rotulo, jaEstava: true };
  const r = await gravarMudancas(pool, { membroId: s.membroId, mudancas: [{ canal: "EMAIL", categoria: s.categoria, concedido: false }], origem: "LINK_SAIR", ip, envioId: s.envioId });
  if (r.ocupado) return { sucesso: false, limite: true };
  return { sucesso: true, rotulo: cm.CATEGORIAS[s.categoria].rotulo, jaEstava: !r.gravadas };
}

// ---------------------------------------------------------------
// 2) Modelos
// ---------------------------------------------------------------

const formatarModelo = (m) => ({
  modeloId: m.ModeloId, chave: m.Chave, versao: m.Versao, categoria: m.Categoria, categoriaRotulo: (cm.CATEGORIAS[m.Categoria] || {}).rotulo, titulo: m.Titulo, corpo: m.Corpo,
  hash: cm.hashDoModelo({ categoria: m.Categoria, titulo: m.Titulo, corpo: m.Corpo }),
  status: m.Status, criadoEm: iso(m.CriadoEm), criadoPor: m.CriadoPorNome || null, aprovadoEm: iso(m.AprovadoEm), aprovadoPor: m.AprovadoPorNome || null, arquivadoEm: iso(m.ArquivadoEm)
});
const SELECT_MODELO = `SELECT m.*, a.Nome AS CriadoPorNome, b.Nome AS AprovadoPorNome FROM ComunicacaoModelos m
  LEFT JOIN MembroReferencia a ON a.MembroId = m.CriadoPorMembroId LEFT JOIN MembroReferencia b ON b.MembroId = m.AprovadoPorMembroId`;

// O nível geral vê tudo (rascunhos e arquivados dos últimos 2 anos); os outros, só os aprovados que podem usar (a convocação só o nível geral envia).
async function listarModelos(pool, { ver }) {
  const cond = ver.geral ? "(m.Status <> 'ARQUIVADO' OR m.ArquivadoEm >= DATEADD(YEAR, -2, SYSUTCDATETIME()))" : "m.Status = 'APROVADO' AND m.Categoria <> 'CONVOCACAO'";
  // v7.15: o modelo do SISTEMA (o aviso de crise) não aparece na tela: não se edita, não se arquiva e não se reenvia por aqui
  const r = await pool.request().query(`SELECT TOP 300 * FROM (${SELECT_MODELO}) m WHERE ${cond} AND ${SEM_SISTEMA("m.Categoria")} ORDER BY CASE m.Status WHEN 'APROVADO' THEN 0 WHEN 'RASCUNHO' THEN 1 ELSE 2 END, m.ModeloId DESC`);
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
    if (!(await obterTrava(() => new sql.Request(t), "comunicacao-modelos", 8000))) { await fecharTransacao(t, false); return OCUPADO("Outro modelo está sendo gravado. Tente de novo."); }
    if (chave) {
      const versoes = (await new sql.Request(t).input("c", sql.NVarChar(40), chave).query(`SELECT ModeloId, Versao, Status, Categoria FROM ComunicacaoModelos WHERE Chave = @c ORDER BY Versao DESC`)).recordset;
      if (!versoes.length || versoes.some((x) => doSistema(x.Categoria))) { await fecharTransacao(t, false); return NAO_EXISTE; }
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
// Aprovar: o rascunho vira o modelo em uso daquela chave; a versão aprovada anterior é arquivada (envios antigos continuam apontando para ela). Aprova-se o texto que a pessoa
// LEU: a tela manda a impressão digital do modelo da lista, e se outro editou o rascunho no meio, a resposta é "mudou".
async function aprovarModelo(pool, { ver, modeloId, hash }) {
  if (!ver.geral) return PROIBIDO("Só o nível geral aprova modelos.");
  const m = await carregarModelo(pool, modeloId);
  if (!m || doSistema(m.Categoria)) return NAO_EXISTE;
  if (m.Status !== "RASCUNHO") return RECUSA(m.Status === "APROVADO" ? "Este modelo já está aprovado." : "Este modelo está arquivado.");
  if (typeof hash !== "string" || hash !== cm.hashDoModelo({ categoria: m.Categoria, titulo: m.Titulo, corpo: m.Corpo })) return MUDOU("O texto deste rascunho mudou depois que você o abriu: leia de novo antes de aprovar.");
  const t = new sql.Transaction(pool);
  try {
    await t.begin();
    const r = await new sql.Request(t).input("id", sql.Int, modeloId).input("por", sql.Int, ver.membroId)
      .input("k", sql.NVarChar(12), m.Categoria).input("ti", sql.NVarChar(150), m.Titulo).input("co", sql.NVarChar(2000), m.Corpo)
      .query(`UPDATE ComunicacaoModelos SET Status = 'APROVADO', AprovadoEm = SYSUTCDATETIME(), AprovadoPorMembroId = @por
              WHERE ModeloId = @id AND Status = 'RASCUNHO' AND Categoria = @k AND Titulo = @ti AND Corpo = @co; SELECT @@ROWCOUNT AS n`);
    if (!contagem(r)) { await fecharTransacao(t, false); return MUDOU("O modelo mudou enquanto você decidia. Abra de novo."); }
    await new sql.Request(t).input("c", sql.NVarChar(40), m.Chave).input("id", sql.Int, modeloId)
      .query(`UPDATE ComunicacaoModelos SET Status = 'ARQUIVADO', ArquivadoEm = SYSUTCDATETIME() WHERE Chave = @c AND Status = 'APROVADO' AND ModeloId <> @id`);
    await t.commit();
  } catch (e) { await fecharTransacao(t, false); throw e; }
  await auditar("ComunicacaoModelos", modeloId, "COMUNICACAO_MODELO_APROVADO", ver.membroId);
  return { sucesso: true, modelo: formatarModelo(await carregarModelo(pool, modeloId)) };
}
async function arquivarModelo(pool, { ver, modeloId }) {
  if (!ver.geral) return PROIBIDO("Só o nível geral arquiva modelos.");
  const m = await carregarModelo(pool, modeloId);
  if (!m || doSistema(m.Categoria)) return NAO_EXISTE;
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

// As pessoas do grupo, calculadas agora: ativas, adultas, sem exclusão LGPD atendida, no território de quem envia, com os critérios. Quem não tem data de nascimento no cadastro
// fica FORA (pode ser menor), salvo na convocação oficial (vai a todos do grupo); a contagem dos que ficaram de fora volta em `semNascimento`.
// O critério "direito a voto na Assembleia Geral" é só do nível geral (ele cruza com a disciplina, que os outros não veem) e entra no SQL antes do TOP: o grupo nunca é cortado
// antes do filtro.
async function resolverGrupo(pool, { ver, criterios, categoria, hoje = hojeBrasilia(), deps = {} }) {
  if (criterios.assembleiaGeral && !ver.geral) return { proibido: true };
  const escopo = await congregacoesDoEscopo(pool, ver);
  const rq = pool.request().input("hoje", sql.Date, hoje);
  const cond = ["m.Status = 'ATIVO'", `NOT (m.DataNascimento IS NOT NULL AND m.DataNascimento > DATEADD(YEAR, -18, @hoje))`, `NOT ${EXCLUIDO_SQL}`, filtroDeIds(rq, "c.CongregacaoId", escopo, "e")];
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
  if (criterios.assembleiaGeral) {
    const universo = deps.universoDoOrgao || require("./universo").universoDoOrgao;
    const votam = (await universo(pool, { sigla: "ASSEMBLEIA_GERAL" })).map((x) => Number(x.membroId)).filter((x) => Number.isInteger(x) && x > 0);
    rq.input("votam", sql.NVarChar(sql.MAX), JSON.stringify(votam));
    cond.push("m.MembroId IN (SELECT CAST(value AS INT) FROM OPENJSON(@votam))");
  }
  const r = await rq.query(`SELECT TOP ${MAX_GRUPO + 1} m.MembroId, m.Nome, c.Nome AS Congregacao, CASE WHEN m.DataNascimento IS NULL THEN 1 ELSE 0 END AS SemNascimento
    FROM MembroReferencia m JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE ${cond.join(" AND ")} ORDER BY m.MembroId`);
  const todos = r.recordset;
  const truncado = todos.length > MAX_GRUPO;
  const convocacao = categoria === "CONVOCACAO";
  const pessoas = convocacao ? todos : todos.filter((p) => !Number(p.SemNascimento));
  return { pessoas, truncado, semNascimento: convocacao ? 0 : todos.length - pessoas.length };
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
const GRANDE_DEMAIS = `O grupo passa de ${MAX_GRUPO} pessoas: divida em partes (por área ou região).`;
const SO_GERAL_VOTO = "O critério \"direito a voto na Assembleia Geral\" é só do nível geral.";

// Antes de enviar: quantas pessoas e o que cada canal fará. Nenhum nome sai daqui.
async function previa(pool, { ver, dados, deps }) {
  const d = dados || {};
  const v = cm.validarCriterios(d.criterios);
  if (v.problema) return RECUSA(v.problema);
  if (!cm.ehCategoriaDaTela(d.categoria)) return RECUSA("Escolha a categoria (ou o modelo).");
  if (d.categoria === "CONVOCACAO" && !ver.geral) return PROIBIDO("A convocação oficial só sai pelo nível geral.");
  const g = await resolverGrupo(pool, { ver, criterios: v.criterios, categoria: d.categoria, deps });
  if (g.proibido) return PROIBIDO(SO_GERAL_VOTO);
  if (g.truncado) return RECUSA(GRANDE_DEMAIS);
  const linhas = await situacaoPorCanal(pool, { ids: g.pessoas.map((p) => p.MembroId), categoria: d.categoria });
  return { sucesso: true, total: g.pessoas.length, semNascimento: g.semNascimento, canais: resumoDosCanais(linhas),
    grupo: cm.descreverCriterios(v.criterios, await nomesDosCriterios(pool, v.criterios)), criterios: v.criterios };
}

async function salvarGrupo(pool, { ver, dados }) {
  const d = dados || {};
  const nome = cm.validarTexto(d.nome, { campo: "o nome do grupo", max: cm.MAX_NOME_GRUPO, min: 3 });
  if (nome.problema) return RECUSA(nome.problema);
  const v = cm.validarCriterios(d.criterios);
  if (v.problema) return RECUSA(v.problema);
  if (v.criterios.assembleiaGeral && !ver.geral) return PROIBIDO(SO_GERAL_VOTO);
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

// { n, seq }: quantas entregas de e-mail/celular esperam e o maior EntregaId que existe (um envio novo sempre o aumenta: a marca do Storage usa isso para não voltar atrás)
async function pendentesNaFila(pool) {
  const r = (await pool.request().query(`SELECT (SELECT COUNT(*) FROM ComunicacaoEntregas WHERE Situacao IN ('PENDENTE', 'ENVIANDO') AND Canal IN ('EMAIL', 'PUSH')) AS n,
    (SELECT ISNULL(MAX(EntregaId), 0) FROM ComunicacaoEntregas) AS seq`)).recordset[0];
  return { n: Number(r.n) || 0, seq: Number(r.seq) || 0 };
}
async function regravarMarca(pool) {
  try { const p = await pendentesNaFila(pool); await marca.gravar(p.n, p.seq); } catch (e) { await marca.gravar(null); }
}

// Envia um modelo aprovado ao grupo. O sininho e o registro de entrega nascem na hora (uma transação, em blocos); o celular e o e-mail vão para a fila, e a primeira rodada
// (curta) roda já.
async function enviar(pool, { ver, dados, deps = {} }) {
  const d = dados || {};
  const modeloId = Number.isInteger(d.modeloId) && d.modeloId > 0 ? d.modeloId : null;
  if (!modeloId) return RECUSA("Escolha o modelo.");
  const v = cm.validarCriterios(d.criterios);
  if (v.problema) return RECUSA(v.problema);
  const m = await carregarModelo(pool, modeloId);
  if (!m || doSistema(m.Categoria)) return NAO_EXISTE;
  if (m.Categoria === "CONVOCACAO" && !ver.geral) return PROIBIDO("A convocação oficial só sai pelo nível geral.");
  if (m.Status !== "APROVADO") return RECUSA("Só se envia modelo aprovado.");
  const criteriosJson = JSON.stringify(v.criterios);
  const g = await resolverGrupo(pool, { ver, criterios: v.criterios, categoria: m.Categoria, deps });
  if (g.proibido) return PROIBIDO(SO_GERAL_VOTO);
  if (g.truncado) return RECUSA(GRANDE_DEMAIS);
  if (!g.pessoas.length) return RECUSA("Ninguém neste grupo: confira os critérios.");
  const linhas = await situacaoPorCanal(pool, { ids: g.pessoas.map((p) => p.MembroId), categoria: m.Categoria });
  const porId = new Map(linhas.map((l) => [l.membroId, l]));
  const grupo = cm.descreverCriterios(v.criterios, await nomesDosCriterios(pool, v.criterios));
  const entregas = [], sininho = [];
  for (const p of g.pessoas) {
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
    if (!(await obterTrava(() => new sql.Request(t), `comunicacao-envio-${ver.membroId}`, 15000))) { await fecharTransacao(t, false); return OCUPADO("Outro envio seu está sendo gravado. Aguarde."); }
    const antes = (await new sql.Request(t).input("mo", sql.Int, modeloId).input("j", sql.NVarChar(2000), criteriosJson).input("eu", sql.Int, ver.membroId).input("min", sql.Int, REPETIDO_MINUTOS)
      .query(`SELECT TOP 1 EnvioId FROM ComunicacaoEnvios WHERE ModeloId = @mo AND CriteriosJson = @j AND EnviadoPorMembroId = @eu AND Status <> 'CANCELADO'
              AND CriadoEm >= DATEADD(MINUTE, -@min, SYSUTCDATETIME()) ORDER BY EnvioId DESC`)).recordset[0];
    if (antes) { envioId = antes.EnvioId; repetido = true; await fecharTransacao(t, false); }
    else {
      envioId = (await new sql.Request(t).input("mo", sql.Int, modeloId).input("k", sql.NVarChar(12), m.Categoria).input("j", sql.NVarChar(2000), criteriosJson).input("g", sql.NVarChar(500), grupo)
        .input("eu", sql.Int, ver.membroId).input("tot", sql.Int, sininho.length)
        .query(`INSERT INTO ComunicacaoEnvios (ModeloId, Categoria, CriteriosJson, GrupoDescricao, EnviadoPorMembroId, Total) VALUES (@mo, @k, @j, @g, @eu, @tot); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
      for (const bloco of emBlocos(entregas, LOTE_INSERCAO)) {
        await new sql.Request(t).input("e", sql.Int, envioId).input("j", sql.NVarChar(sql.MAX), JSON.stringify(bloco)).query(`
          INSERT INTO ComunicacaoEntregas (EnvioId, MembroId, Canal, Situacao) SELECT @e, x.m, x.c, x.s FROM OPENJSON(@j) WITH (m INT '$.m', c NVARCHAR(10) '$.c', s NVARCHAR(18) '$.s') x`);
      }
      for (const bloco of emBlocos(sininho, LOTE_INSERCAO)) {
        await new sql.Request(t).input("e", sql.Int, envioId).input("j", sql.NVarChar(sql.MAX), JSON.stringify(bloco)).query(`
          INSERT INTO Notificacoes (RegraChave, DestinatarioMembroId, Titulo, Mensagem, Categoria, ReferenciaTabela, ReferenciaId)
          SELECT N'COMUNICADO', x.d, x.t, x.msg, N'COMUNICACAO', N'ComunicacaoEnvios', @e FROM OPENJSON(@j) WITH (d INT '$.d', t NVARCHAR(200) '$.t', msg NVARCHAR(1000) '$.msg') x`);
      }
      await t.commit();
    }
  } catch (e) { await fecharTransacao(t, false); throw e; }
  if (!repetido) {
    await auditar("ComunicacaoEnvios", envioId, `COMUNICACAO_ENVIO_${m.Categoria}`, ver.membroId);
    await regravarMarca(pool);
    // a primeira rodada vai junto com a resposta: curta (até ~8 s e no máximo 10 e-mails), o resto segue pela rotina de 15 em 15 minutos
    try { await processarFila(pool, { deps, orcamentoMs: deps.orcamentoMs || 8000, maxEmails: 10 }); } catch (e) { console.error("[COMUNICACAO] primeira rodada da fila:", e.message); }
  }
  return { sucesso: true, envioId, repetido, ...(await relatorio(pool, { ver, envioId })) };
}

async function cancelar(pool, { ver, envioId }) {
  const e = (await pool.request().input("id", sql.Int, envioId).query(`SELECT EnvioId, EnviadoPorMembroId, Status, Categoria FROM ComunicacaoEnvios WHERE EnvioId = @id`)).recordset[0];
  if (!e || !(ver.geral || Number(e.EnviadoPorMembroId) === Number(ver.membroId))) return NAO_EXISTE;
  if (doSistema(e.Categoria)) return RECUSA("O aviso da crise é obrigatório e não se cancela: o que ainda estiver na fila para sozinho quando a crise é encerrada.");
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

// Toma até `n` entregas pendentes do canal (ninguém mais as pega: READPAST + UPDLOCK), o aviso de crise (v7.15) e a convocação oficial primeiro, e devolve o que é preciso para mandar.
const PRIORIDADE = "CASE v.Categoria WHEN 'CRISE' THEN 0 WHEN 'CONVOCACAO' THEN 1 ELSE 2 END";
// `filtro` (v7.15, revisão independente): "SISTEMA" toma só o aviso do sistema (CRISE); "SEM_SISTEMA", só os outros; omitido, todos.
async function tomar(rq, canal, n, filtro = null) {
  if (n <= 0) return [];
  const cond = filtro === "SISTEMA" ? `AND ${COM_SISTEMA("v.Categoria")}` : filtro === "SEM_SISTEMA" ? `AND ${SEM_SISTEMA("v.Categoria")}` : "";
  const r = await rq.input("canal", sql.NVarChar(10), canal).input("n", sql.Int, n).query(`
    DECLARE @tomadas TABLE (EntregaId INT, EnvioId INT, MembroId INT);
    WITH alvo AS (
      SELECT TOP (@n) x.* FROM ComunicacaoEntregas x WITH (READPAST, UPDLOCK, ROWLOCK) JOIN ComunicacaoEnvios v ON v.EnvioId = x.EnvioId
      WHERE x.Canal = @canal AND x.Situacao = 'PENDENTE' ${cond} ORDER BY ${PRIORIDADE}, x.EntregaId)
    UPDATE alvo SET Situacao = 'ENVIANDO', AtualizadoEm = SYSUTCDATETIME() OUTPUT inserted.EntregaId, inserted.EnvioId, inserted.MembroId INTO @tomadas;
    SELECT t.EntregaId, t.EnvioId, t.MembroId FROM @tomadas t JOIN ComunicacaoEnvios v ON v.EnvioId = t.EnvioId ORDER BY ${PRIORIDADE}, t.EntregaId`);
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
      (SELECT COUNT(*) FROM PushInscricoesMembro p WHERE p.MembroId = m.MembroId) AS Aparelhos,
      (SELECT TOP 1 CAST(k.Concedido AS INT) FROM ComunicacaoConsentimentos k WHERE k.MembroId = m.MembroId AND k.Canal = @c AND k.Categoria = @k ORDER BY k.ConsentimentoId DESC) AS Sim
    FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @m`)).recordset[0] || null;
}
async function marcar(pool, entregaId, situacao) {
  await pool.request().input("id", sql.Int, entregaId).input("s", sql.NVarChar(18), situacao)
    .query(`UPDATE ComunicacaoEntregas SET Situacao = @s, AtualizadoEm = SYSUTCDATETIME() WHERE EntregaId = @id AND Situacao = 'ENVIANDO'`);
}
// As entregas tomadas que NÃO chegaram a ser tentadas (o tempo acabou, o banco piscou, o serviço recusou por excesso) voltam para a fila: nada saiu delas.
async function devolver(pool, entregaIds) {
  if (!entregaIds.length) return;
  await pool.request().input("ids", sql.NVarChar(sql.MAX), JSON.stringify(entregaIds))
    .query(`UPDATE ComunicacaoEntregas SET Situacao = 'PENDENTE', AtualizadoEm = SYSUTCDATETIME() WHERE Situacao = 'ENVIANDO' AND EntregaId IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))`);
}
// O que mudou entre o envio e a rodada: envio cancelado, consentimento retirado, pessoa que saiu.
function antesDeMandar(envio, pessoa) {
  if (!envio || envio.Status === "CANCELADO") return "CANCELADO";
  if (!pessoa || pessoa.Status !== "ATIVO") return "CANCELADO";
  if (!cm.CATEGORIAS[envio.Categoria].obrigatoria && !Number(pessoa.Sim)) return "SEM_CONSENTIMENTO";
  return null;
}

// v7.15 (revisão independente): a pessoa já foi alcançada por este aviso do sistema — leu no sininho, deu ciência ou o celular foi entregue? Então o e-mail não sai (ALCANCADO):
// a cota da hora fica para quem ainda não sabe (e para a convocação oficial).
async function jaAlcancado(pool, envioId, membroId) {
  return contagem(await pool.request().input("e", sql.Int, envioId).input("m", sql.Int, membroId).query(`
    SELECT COUNT(*) AS n FROM ComunicacaoEntregas s WHERE s.EnvioId = @e AND s.MembroId = @m
      AND ((s.Canal = 'SININHO' AND (s.CienciaEm IS NOT NULL OR ${LIDA_SQL})) OR (s.Canal = 'PUSH' AND s.Situacao = 'ACEITO'))`)) > 0;
}

// v7.15 (revisão independente): o CELULAR do aviso do sistema (a crise) sai EM PARALELO, em lotes de 25 — um a um (0,2 a 0,4 s cada), com 400 líderes o último receberia
// horas depois. Por lote: uma consulta traz a pessoa, o aparelho e o texto curto do celular; os avisos saem juntos (cada um com prazo); uma gravação por situação.
const PUSH_SISTEMA_POR_LOTE = 25;
const PUSH_PRAZO_MS = 8000;
async function celularDoSistema(pool, { deps = {}, orcamentoMs = 15000 } = {}) {
  const inicio = Date.now();
  const enviarPush = deps.enviarPush || ((membroId, msg) => enviarPushNotificacao(pool, sql, membroId, msg));
  const r = { aceitos: 0, outros: 0, lotes: 0 };
  while (Date.now() - inicio < orcamentoMs - PUSH_PRAZO_MS / 2) {
    const lote = await tomar(pool.request(), "PUSH", PUSH_SISTEMA_POR_LOTE, "SISTEMA");
    if (!lote.length) break;
    r.lotes++;
    const dados = (await pool.request().input("ids", sql.NVarChar(sql.MAX), JSON.stringify(lote.map((x) => x.EntregaId))).query(`
      SELECT x.EntregaId, x.MembroId, e.Status AS EnvioStatus, e.CriteriosJson, mo.Titulo, mo.Corpo, p.Nome, p.Status, cg.Nome AS Congregacao,
        (SELECT COUNT(*) FROM PushInscricoesMembro i WHERE i.MembroId = x.MembroId) AS Aparelhos
      FROM ComunicacaoEntregas x JOIN ComunicacaoEnvios e ON e.EnvioId = x.EnvioId JOIN ComunicacaoModelos mo ON mo.ModeloId = e.ModeloId
      LEFT JOIN MembroReferencia p ON p.MembroId = x.MembroId LEFT JOIN Congregacoes cg ON cg.CongregacaoId = p.CongregacaoId
      WHERE x.EntregaId IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))`)).recordset;
    const situacoes = await Promise.all(dados.map(async (d) => {
      if (d.EnvioStatus === "CANCELADO" || d.Status !== "ATIVO") return [d.EntregaId, "CANCELADO"];
      if (!Number(d.Aparelhos)) return [d.EntregaId, "SEM_APARELHO"];
      let texto = null;
      try { texto = (JSON.parse(d.CriteriosJson) || {}).celular || null; } catch (e) { texto = null; }
      if (!texto || typeof texto.titulo !== "string" || typeof texto.mensagem !== "string") {
        const corpo = cm.preencher(d.Corpo, { nome: d.Nome, congregacao: d.Congregacao });
        texto = { titulo: cm.preencher(d.Titulo, { nome: d.Nome, congregacao: d.Congregacao }), mensagem: corpo.length > 180 ? corpo.slice(0, 177) + "…" : corpo };
      }
      let prazo = null;
      try {
        const n = await Promise.race([enviarPush(d.MembroId, { titulo: texto.titulo, mensagem: texto.mensagem }), new Promise((ok) => { prazo = setTimeout(() => ok(0), PUSH_PRAZO_MS); })]);
        return [d.EntregaId, Number(n) > 0 ? "ACEITO" : "FALHOU"];
      } catch (e) { return [d.EntregaId, "FALHOU"]; } finally { if (prazo) clearTimeout(prazo); }
    }));
    const porSituacao = new Map();
    for (const [id, sit] of situacoes) { if (!porSituacao.has(sit)) porSituacao.set(sit, []); porSituacao.get(sit).push(id); }
    for (const [sit, ids] of porSituacao) {
      await pool.request().input("s", sql.NVarChar(18), sit).input("ids", sql.NVarChar(sql.MAX), JSON.stringify(ids))
        .query(`UPDATE ComunicacaoEntregas SET Situacao = @s, AtualizadoEm = SYSUTCDATETIME() WHERE Situacao = 'ENVIANDO' AND EntregaId IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))`);
      if (sit === "ACEITO") r.aceitos += ids.length; else r.outros += ids.length;
    }
    // a entrega que a consulta não trouxe (não deveria acontecer) volta para a fila
    const vistas = new Set(dados.map((d) => d.EntregaId));
    await devolver(pool, lote.map((x) => x.EntregaId).filter((id) => !vistas.has(id)));
  }
  return r;
}

// Uma rodada: os presos viram FALHOU; o celular sai em lotes até o tempo acabar; o e-mail sai até o teto da rodada e da hora (somando os avisos do sistema já mandados na hora);
// o tempo é conferido a cada mensagem e o que não foi tentado volta à fila; o envio sem nada na fila é concluído.
async function processarFila(pool, { deps = {}, orcamentoMs = 20000, segredo = null, maxEmails = Infinity } = {}) {
  const inicio = Date.now();
  const resta = () => orcamentoMs - (Date.now() - inicio);
  const enviarEmail = deps.enviarEmail || enviarEmailComunicado;
  const enviarPush = deps.enviarPush || ((membroId, msg) => enviarPushNotificacao(pool, sql, membroId, msg));
  const segredoSaida = segredo || require("./segredoSessao").resolverSegredo();
  const cache = new Map();
  const res = { presos: 0, push: { aceitos: 0, outros: 0 }, email: { aceitos: 0, outros: 0, adiados: 0, cota: 0 }, devolvidos: 0, concluidos: 0 };
  res.presos = contagem(await pool.request().input("min", sql.Int, PRESO_MINUTOS).query(`
    UPDATE ComunicacaoEntregas SET Situacao = 'FALHOU', AtualizadoEm = SYSUTCDATETIME() WHERE Situacao = 'ENVIANDO' AND AtualizadoEm < DATEADD(MINUTE, -@min, SYSUTCDATETIME()); SELECT @@ROWCOUNT AS n`));

  // percorre as tomadas; para cada uma, `mandar` decide e grava; o que sobra (tempo, erro, excesso) volta à fila
  async function percorrer(lote, mandar, minimoMs) {
    for (let i = 0; i < lote.length; i++) {
      if (resta() < minimoMs) { const sobra = lote.slice(i).map((y) => y.EntregaId); await devolver(pool, sobra); res.devolvidos += sobra.length; return false; }
      let r;
      try { r = await mandar(lote[i]); } catch (e) {
        console.error("[COMUNICACAO] entrega não tentada:", e && e.message);
        const sobra = lote.slice(i).map((y) => y.EntregaId);
        try { await devolver(pool, sobra); res.devolvidos += sobra.length; } catch (_) { /* fica ENVIANDO e vira FALHOU em 30 min */ }
        return false;
      }
      if (r === "PARAR") { const sobra = lote.slice(i).map((y) => y.EntregaId); await devolver(pool, sobra); res.email.adiados += sobra.length; return false; }
    }
    return true;
  }

  // celular: o aviso do sistema (a crise) primeiro, em paralelo (v7.15); depois os comunicados, um a um
  if (deps.celularDoSistema !== false) {
    try { res.pushSistema = await celularDoSistema(pool, { deps, orcamentoMs: Math.floor(orcamentoMs * 0.3) }); } catch (e) { console.error("[COMUNICACAO] celular do aviso do sistema:", e && e.message); }
  }
  while (resta() > orcamentoMs * 0.5) {
    const lote = await tomar(pool.request(), "PUSH", PUSH_POR_LOTE, "SEM_SISTEMA");
    if (!lote.length) break;
    const seguiu = await percorrer(lote, async (x) => {
      const envio = await dadosDoEnvio(pool, cache, x.EnvioId);
      const pessoa = await dadosDaPessoa(pool, x.MembroId, "PUSH", envio && envio.Categoria);
      const barrado = antesDeMandar(envio, pessoa) || (!Number(pessoa.Aparelhos) ? "SEM_APARELHO" : null);
      if (barrado) { await marcar(pool, x.EntregaId, barrado); res.push.outros++; return null; }
      const vars = { nome: pessoa.Nome, congregacao: pessoa.Congregacao };
      const corpo = cm.preencher(envio.Corpo, vars);
      let n = 0;
      try { n = await enviarPush(x.MembroId, { titulo: cm.preencher(envio.Titulo, vars), mensagem: corpo.length > 180 ? corpo.slice(0, 177) + "…" : corpo }); } catch (e) { n = 0; }
      // com aparelho inscrito e nada entregue = falhou (VAPID ausente, serviço de push fora); "sem aparelho" é só para quem não tem nenhum
      await marcar(pool, x.EntregaId, n > 0 ? "ACEITO" : "FALHOU");
      if (n > 0) res.push.aceitos++; else res.push.outros++;
      return null;
    }, orcamentoMs * 0.45);
    if (!seguiu) break;
  }

  // e-mail: a cota da rodada e a da última hora (os comunicados e os avisos do sistema já mandados) decidem quantos saem; uma rodada por vez decide
  // v7.15 (revisão independente): o aviso de crise tem um teto PRÓPRIO por hora (menor) e, havendo convocação oficial na fila, nunca leva mais da metade da rodada.
  const porRodada = await lerPrazoDias(pool, "COMUNICACAO_EMAILS_POR_RODADA", 20);
  const porHora = await lerPrazoDias(pool, "COMUNICACAO_EMAILS_POR_HORA", 60);
  const criseHora = await lerPrazoDias(pool, "COMUNICACAO_CRISE_EMAILS_POR_HORA", 30);
  const t = new sql.Transaction(pool);
  let lote = [];
  try {
    await t.begin();
    if (await obterTrava(() => new sql.Request(t), "comunicacao-fila-email", 5000)) {
      const h = (await new sql.Request(t).query(`SELECT
        (SELECT COUNT(*) FROM ComunicacaoEntregas WHERE Canal = 'EMAIL' AND Situacao IN ('ACEITO', 'ENVIANDO') AND AtualizadoEm >= DATEADD(MINUTE, -60, SYSUTCDATETIME()))
        + (SELECT COUNT(*) FROM Notificacoes WHERE EnviadaEmail = 1 AND EnviadaEmailEm >= DATEADD(MINUTE, -60, SYSUTCDATETIME())) AS n,
        (SELECT COUNT(*) FROM ComunicacaoEntregas x JOIN ComunicacaoEnvios v ON v.EnvioId = x.EnvioId WHERE x.Canal = 'EMAIL' AND x.Situacao IN ('ACEITO', 'ENVIANDO')
           AND x.AtualizadoEm >= DATEADD(MINUTE, -60, SYSUTCDATETIME()) AND ${COM_SISTEMA("v.Categoria")}) AS sistema,
        CASE WHEN EXISTS (SELECT 1 FROM ComunicacaoEntregas x JOIN ComunicacaoEnvios v ON v.EnvioId = x.EnvioId WHERE x.Canal = 'EMAIL' AND x.Situacao = 'PENDENTE' AND v.Categoria = 'CONVOCACAO')
          THEN 1 ELSE 0 END AS convocacao`)).recordset[0];
      res.email.cota = Math.max(0, Math.min(porRodada, porHora - Number(h.n), maxEmails));
      const reserva = Number(h.convocacao) ? Math.ceil(res.email.cota / 2) : 0;
      res.email.cotaSistema = Math.max(0, Math.min(res.email.cota - reserva, criseHora - Number(h.sistema)));
      const loteSistema = await tomar(new sql.Request(t), "EMAIL", res.email.cotaSistema, "SISTEMA");
      lote = [...loteSistema, ...(await tomar(new sql.Request(t), "EMAIL", res.email.cota - loteSistema.length, "SEM_SISTEMA"))];
    }
    await t.commit();
  } catch (e) { await fecharTransacao(t, false); throw e; }
  await percorrer(lote, async (x) => {
    const envio = await dadosDoEnvio(pool, cache, x.EnvioId);
    const pessoa = await dadosDaPessoa(pool, x.MembroId, "EMAIL", envio && envio.Categoria);
    const barrado = antesDeMandar(envio, pessoa) || (!pessoa.Email || !String(pessoa.Email).trim() ? "SEM_CONTATO" : null)
      || (envio && doSistema(envio.Categoria) && (await jaAlcancado(pool, x.EnvioId, x.MembroId)) ? "ALCANCADO" : null);
    if (barrado) { await marcar(pool, x.EntregaId, barrado); res.email.outros++; return null; }
    const vars = { nome: pessoa.Nome, congregacao: pessoa.Congregacao };
    const linkSair = cm.CATEGORIAS[envio.Categoria].obrigatoria ? null
      : `${BASE_URL()}/sair.html?t=${encodeURIComponent(cm.assinarSaida(segredoSaida, { membroId: x.MembroId, categoria: envio.Categoria, envioId: x.EnvioId }))}`;
    const email = cm.montarEmail({ titulo: cm.preencher(envio.Titulo, vars), corpo: cm.preencher(envio.Corpo, vars), categoria: envio.Categoria, linkSair });
    const r = await enviarEmail({ email: String(pessoa.Email).trim(), assunto: email.assunto, texto: email.texto, html: email.html });
    if (r && r.limite) return "PARAR";                 // o serviço recusou por excesso: nada saiu; esta e as que sobraram voltam para a fila
    await marcar(pool, x.EntregaId, r && r.ok ? "ACEITO" : "FALHOU");
    if (r && r.ok) res.email.aceitos++; else res.email.outros++;
    return null;
  }, 2500);

  res.concluidos = contagem(await pool.request().query(`
    UPDATE e SET Status = 'CONCLUIDO', ConcluidoEm = SYSUTCDATETIME() FROM ComunicacaoEnvios e
    WHERE e.Status = 'FILA' AND NOT EXISTS (SELECT 1 FROM ComunicacaoEntregas x WHERE x.EnvioId = e.EnvioId AND x.Situacao IN ('PENDENTE', 'ENVIANDO')); SELECT @@ROWCOUNT AS n`));
  const p = await pendentesNaFila(pool);
  res.pendentes = p.n;
  await marca.gravar(p.n, p.seq);
  return res;
}

// ---- Relatório ----

const LIDA_SQL = `(s.LidaEm IS NOT NULL OR EXISTS (SELECT 1 FROM Notificacoes n WHERE n.RegraChave = 'COMUNICADO' AND n.ReferenciaTabela = 'ComunicacaoEnvios' AND n.ReferenciaId = s.EnvioId
  AND n.DestinatarioMembroId = s.MembroId AND n.Lida = 1))`;
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
    SELECT (SELECT COUNT(*) FROM ComunicacaoEntregas s WHERE s.EnvioId = @id AND s.Canal = 'SININHO' AND ${LIDA_SQL}) AS lidos,
           (SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @id AND Canal = 'SININHO' AND CienciaEm IS NOT NULL) AS ciencia`)).recordset[0];
  const saida = {
    envio: { envioId: e.EnvioId, titulo: e.Titulo, versao: e.Versao, categoria: e.Categoria, categoriaRotulo: cm.CATEGORIAS[e.Categoria].rotulo, grupo: e.GrupoDescricao, total: e.Total,
      status: e.Status, criadoEm: iso(e.CriadoEm), concluidoEm: iso(e.ConcluidoEm), enviadoPor: e.EnviadoPor },
    canais, lidos: Number(leitura.lidos) || 0, ciencia: Number(leitura.ciencia) || 0
  };
  // Na convocação: quem não foi alcançado por canal nenhum fora do sistema e não leu nem deu ciência — para a Secretaria procurar por telefone (só o nível geral vê o telefone).
  if (cm.CATEGORIAS_DE_PROVA.includes(e.Categoria)) {
    const condicao = `s.EnvioId = @id AND s.Canal = 'SININHO' AND s.MembroId IS NOT NULL AND s.CienciaEm IS NULL
        AND NOT EXISTS (SELECT 1 FROM ComunicacaoEntregas x WHERE x.EnvioId = s.EnvioId AND x.MembroId = s.MembroId AND x.Canal IN ('EMAIL', 'PUSH') AND x.Situacao = 'ACEITO')
        AND NOT ${LIDA_SQL}`;
    const total = contagem(await pool.request().input("id", sql.Int, envioId).query(`SELECT COUNT(*) AS n FROM ComunicacaoEntregas s WHERE ${condicao}`));
    const r = await pool.request().input("id", sql.Int, envioId).query(`
      SELECT TOP ${MAX_NAO_ALCANCADOS} m.MembroId, m.Nome, c.Nome AS Congregacao, m.Telefone FROM ComunicacaoEntregas s
      JOIN MembroReferencia m ON m.MembroId = s.MembroId LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
      WHERE ${condicao} ORDER BY c.Nome, m.Nome`);
    saida.naoAlcancados = r.recordset.map((p) => ({ membroId: p.MembroId, nome: p.Nome, congregacao: p.Congregacao, ...(ver.geral ? { telefone: p.Telefone || null } : {}) }));
    saida.naoAlcancadosTotal = total;
    saida.naoAlcancadosCortado = total > saida.naoAlcancados.length;
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
    SELECT TOP 100 e.EnvioId, e.Categoria, e.CriadoEm, m.Titulo, m.Corpo, s.CienciaEm, s.LidaEm, mr.Nome, c.Nome AS Congregacao,
      (SELECT TOP 1 CAST(n.Lida AS INT) FROM Notificacoes n WHERE n.RegraChave = 'COMUNICADO' AND n.ReferenciaTabela = 'ComunicacaoEnvios' AND n.ReferenciaId = e.EnvioId AND n.DestinatarioMembroId = @m) AS Lida
    FROM ComunicacaoEntregas s JOIN ComunicacaoEnvios e ON e.EnvioId = s.EnvioId JOIN ComunicacaoModelos m ON m.ModeloId = e.ModeloId
    JOIN MembroReferencia mr ON mr.MembroId = s.MembroId LEFT JOIN Congregacoes c ON c.CongregacaoId = mr.CongregacaoId
    WHERE s.MembroId = @m AND s.Canal = 'SININHO' ORDER BY e.EnvioId DESC`);
  return r.recordset.map((x) => {
    const vars = { nome: x.Nome, congregacao: x.Congregacao };
    return { envioId: x.EnvioId, categoria: x.Categoria, categoriaRotulo: cm.CATEGORIAS[x.Categoria].rotulo, titulo: cm.preencher(x.Titulo, vars), texto: cm.preencher(x.Corpo, vars),
      recebidoEm: iso(x.CriadoEm), lido: !!Number(x.Lida) || !!x.LidaEm, cienciaEm: iso(x.CienciaEm), pedeCiencia: cm.CATEGORIAS_DE_PROVA.includes(x.Categoria) };
  });
}
// "Recebi a convocação": a ciência fica no registro de entrega, e o aviso do sininho conta como lido.
async function darCiencia(pool, { membroId, envioId }) {
  const s = (await pool.request().input("m", sql.Int, membroId).input("e", sql.Int, envioId).query(`
    SELECT s.EntregaId, s.CienciaEm, e.Categoria FROM ComunicacaoEntregas s JOIN ComunicacaoEnvios e ON e.EnvioId = s.EnvioId WHERE s.MembroId = @m AND s.EnvioId = @e AND s.Canal = 'SININHO'`)).recordset[0];
  if (!s) return NAO_EXISTE;
  if (!cm.CATEGORIAS_DE_PROVA.includes(s.Categoria)) return RECUSA("Só a convocação oficial e o aviso de crise pedem ciência.");
  if (!s.CienciaEm) {
    await pool.request().input("id", sql.Int, s.EntregaId).query(`UPDATE ComunicacaoEntregas SET CienciaEm = SYSUTCDATETIME() WHERE EntregaId = @id AND CienciaEm IS NULL`);
    await auditar("ComunicacaoEntregas", s.EntregaId, "COMUNICACAO_CIENCIA", membroId);
  }
  await pool.request().input("m", sql.Int, membroId).input("e", sql.Int, envioId).query(`
    UPDATE Notificacoes SET Lida = 1, LidaEm = SYSUTCDATETIME() WHERE RegraChave = 'COMUNICADO' AND ReferenciaTabela = 'ComunicacaoEnvios' AND ReferenciaId = @e AND DestinatarioMembroId = @m AND Lida = 0`);
  return { sucesso: true, comunicados: await meusComunicados(pool, membroId) };
}

// ---------------------------------------------------------------
// 5) O aviso do SISTEMA (v7.15 — o aviso do regime de crise, Regimento Art. 161-B)
// ---------------------------------------------------------------
// Não passa pela tela de modelos nem pelo grupo por critérios: quem chama (shared/criseSegurancaDb.js) decide as pessoas e o texto. É feito em partes, para caber na transação
// de quem chama: `prepararAvisoDoSistema` (FORA da transação: só lê se cada pessoa tem e-mail e aparelho e monta o texto de cada uma), `gravarAvisoDoSistema` (DENTRO dela: o
// modelo já aprovado, o envio, as entregas e o sininho, tudo junto com o ato) e, depois do commit, `depoisDoAvisoDoSistema` (a marca da fila e a primeira rodada: o celular sai
// na hora; o e-mail, aos poucos, pela mesma fila que respeita os 100 por hora do Azure). A categoria é obrigatória: não pede consentimento e não tem link de saída.
async function prepararAvisoDoSistema(pool, { categoria, titulo, corpo, pessoas, celular = null }) {
  if (!doSistema(categoria)) throw new Error("Categoria do sistema desconhecida.");
  const linhas = await situacaoPorCanal(pool, { ids: pessoas.map((p) => p.MembroId), categoria });
  const porId = new Map(linhas.map((l) => [l.membroId, l]));
  const entregas = [], sininho = [];
  for (const p of pessoas) {
    const l = porId.get(p.MembroId);
    if (!l) continue;
    entregas.push({ m: p.MembroId, c: "SININHO", s: "ACEITO" }, { m: p.MembroId, c: "EMAIL", s: l.EMAIL }, { m: p.MembroId, c: "PUSH", s: l.PUSH });
    sininho.push({ d: p.MembroId, t: cm.preencher(titulo, { nome: p.Nome, congregacao: p.Congregacao }).slice(0, 200),
      msg: cm.textoDoSininho(cm.preencher(corpo, { nome: p.Nome, congregacao: p.Congregacao })) });
  }
  return { categoria, titulo, corpo, entregas, sininho, celular };
}
// `novoRequest`: () => new sql.Request(transacao). Devolve o envioId.
async function gravarAvisoDoSistema(novoRequest, preparo, { chave, enviadoPor, grupo }) {
  const { categoria, titulo, corpo } = preparo;
  const modeloId = (await novoRequest().input("c", sql.NVarChar(40), chave).input("k", sql.NVarChar(12), categoria).input("ti", sql.NVarChar(150), titulo)
    .input("co", sql.NVarChar(2000), corpo).input("por", sql.Int, enviadoPor)
    .query(`INSERT INTO ComunicacaoModelos (Chave, Versao, Categoria, Titulo, Corpo, Status, CriadoPorMembroId, AprovadoPorMembroId, AprovadoEm)
            VALUES (@c, 1, @k, @ti, @co, 'APROVADO', @por, @por, SYSUTCDATETIME()); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
  // o texto CURTO do celular (quem fala e o contato) vai junto do envio: o celular não corta no meio o texto longo do aviso (revisão independente, v7.15)
  const celular = preparo.celular && typeof preparo.celular === "object" ? { titulo: String(preparo.celular.titulo).slice(0, 120), mensagem: String(preparo.celular.mensagem).slice(0, 180) } : undefined;
  const envioId = (await novoRequest().input("mo", sql.Int, modeloId).input("k", sql.NVarChar(12), categoria).input("j", sql.NVarChar(2000), JSON.stringify({ sistema: categoria, ...(celular ? { celular } : {}) }))
    .input("g", sql.NVarChar(500), String(grupo).slice(0, 500)).input("eu", sql.Int, enviadoPor).input("tot", sql.Int, preparo.sininho.length)
    .query(`INSERT INTO ComunicacaoEnvios (ModeloId, Categoria, CriteriosJson, GrupoDescricao, EnviadoPorMembroId, Total) VALUES (@mo, @k, @j, @g, @eu, @tot); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`)).recordset[0].id;
  for (const bloco of emBlocos(preparo.entregas, LOTE_INSERCAO)) {
    await novoRequest().input("e", sql.Int, envioId).input("j", sql.NVarChar(sql.MAX), JSON.stringify(bloco)).query(`
      INSERT INTO ComunicacaoEntregas (EnvioId, MembroId, Canal, Situacao) SELECT @e, x.m, x.c, x.s FROM OPENJSON(@j) WITH (m INT '$.m', c NVARCHAR(10) '$.c', s NVARCHAR(18) '$.s') x`);
  }
  for (const bloco of emBlocos(preparo.sininho, LOTE_INSERCAO)) {
    await novoRequest().input("e", sql.Int, envioId).input("j", sql.NVarChar(sql.MAX), JSON.stringify(bloco)).query(`
      INSERT INTO Notificacoes (RegraChave, DestinatarioMembroId, Titulo, Mensagem, Categoria, ReferenciaTabela, ReferenciaId)
      SELECT N'COMUNICADO', x.d, x.t, x.msg, N'COMUNICACAO', N'ComunicacaoEnvios', @e FROM OPENJSON(@j) WITH (d INT '$.d', t NVARCHAR(200) '$.t', msg NVARCHAR(1000) '$.msg') x`);
  }
  return envioId;
}
// O aviso anterior que ainda não saiu (celular e e-mail na fila) fica velho quando a crise muda de porta-voz ou acaba: o novo vai a todos. O que já saiu fica.
async function cancelarPendentesDoSistema(novoRequest, envioIds) {
  const ids = (envioIds || []).filter((x) => Number.isInteger(x) && x > 0);
  if (!ids.length) return 0;
  return contagem(await novoRequest().input("ids", sql.NVarChar(sql.MAX), JSON.stringify(ids)).query(`
    UPDATE x SET Situacao = 'CANCELADO', AtualizadoEm = SYSUTCDATETIME() FROM ComunicacaoEntregas x JOIN ComunicacaoEnvios e ON e.EnvioId = x.EnvioId
    WHERE x.Situacao = 'PENDENTE' AND x.Canal IN ('EMAIL', 'PUSH') AND e.Categoria IN (${cm.CATEGORIAS_DO_SISTEMA.map((c) => `'${c}'`).join(", ")})
      AND x.EnvioId IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids)); SELECT @@ROWCOUNT AS n`));
}
// Depois do commit, dentro do tempo da requisição: o CELULAR do aviso em paralelo, com orçamento próprio (v7.15, revisão independente), e uma rodada curta da fila (e-mail aos
// poucos). O resto vai pela rotina de 15 em 15 minutos (que também manda primeiro o celular do aviso, em paralelo) e pelo botão "Continuar o aviso agora".
async function depoisDoAvisoDoSistema(pool, { deps = {}, orcamentoCelularMs = 15000, orcamentoFilaMs = 5000 } = {}) {
  await regravarMarca(pool);
  const r = { celular: null, fila: null };
  try { r.celular = await celularDoSistema(pool, { deps, orcamentoMs: orcamentoCelularMs }); } catch (e) { console.error("[COMUNICACAO] celular do aviso do sistema:", e && e.message); }
  try { r.fila = await processarFila(pool, { deps: { ...deps, celularDoSistema: false }, orcamentoMs: orcamentoFilaMs, maxEmails: 10 }); } catch (e) { console.error("[COMUNICACAO] primeira rodada do aviso do sistema:", e && e.message); }
  return r;
}
// Para o painel da crise: quantas pessoas, o que cada canal já fez e quantas leram ou deram ciência (sem nomes).
async function situacaoDoAvisoDoSistema(pool, envioId) {
  const porCanal = (await pool.request().input("id", sql.Int, envioId).query(`SELECT Canal, Situacao, COUNT(*) AS n FROM ComunicacaoEntregas WHERE EnvioId = @id GROUP BY Canal, Situacao`)).recordset;
  const canais = {};
  for (const l of porCanal) (canais[l.Canal] = canais[l.Canal] || {})[l.Situacao] = Number(l.n);
  const leitura = (await pool.request().input("id", sql.Int, envioId).query(`
    SELECT (SELECT COUNT(*) FROM ComunicacaoEntregas s WHERE s.EnvioId = @id AND s.Canal = 'SININHO' AND ${LIDA_SQL}) AS lidos,
           (SELECT COUNT(*) FROM ComunicacaoEntregas WHERE EnvioId = @id AND Canal = 'SININHO' AND CienciaEm IS NOT NULL) AS ciencia,
           (SELECT Total FROM ComunicacaoEnvios WHERE EnvioId = @id) AS total`)).recordset[0] || {};
  return { envioId, total: Number(leitura.total) || 0, canais, lidos: Number(leitura.lidos) || 0, ciencia: Number(leitura.ciencia) || 0 };
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
// Depois do prazo (1 ano; 5 na convocação oficial): a leitura passa para a entrega, o aviso do sininho (que tem o texto e o primeiro nome) sai e a entrega perde o nome.
// A contagem do envio fica.
async function aplicarRetencao(pool) {
  const comum = await diasDeRetencao(pool, "entregas");
  const conv = await diasDeRetencao(pool, "convocacao");
  const vencidos = `SELECT e.EnvioId FROM ComunicacaoEnvios e WHERE e.CriadoEm < DATEADD(DAY, -CASE WHEN e.Categoria IN (${LISTA_DE_PROVA}) THEN @dv ELSE @dc END, SYSUTCDATETIME())`;
  const t = new sql.Transaction(pool);
  let entregas = 0, avisos = 0;
  try {
    await t.begin();
    const rq = () => new sql.Request(t).input("dc", sql.Int, comum).input("dv", sql.Int, conv);
    await rq().query(`UPDATE s SET LidaEm = n.LidaEm FROM ComunicacaoEntregas s JOIN Notificacoes n ON n.RegraChave = 'COMUNICADO' AND n.ReferenciaTabela = 'ComunicacaoEnvios'
      AND n.ReferenciaId = s.EnvioId AND n.DestinatarioMembroId = s.MembroId AND n.Lida = 1
      WHERE s.Canal = 'SININHO' AND s.LidaEm IS NULL AND s.MembroId IS NOT NULL AND s.EnvioId IN (${vencidos})`);
    avisos = contagem(await rq().query(`DELETE FROM Notificacoes WHERE RegraChave = 'COMUNICADO' AND ReferenciaTabela = 'ComunicacaoEnvios' AND ReferenciaId IN (${vencidos}); SELECT @@ROWCOUNT AS n`));
    entregas = contagem(await rq().query(`UPDATE ComunicacaoEntregas SET MembroId = NULL, AnonimizadoEm = SYSUTCDATETIME() WHERE MembroId IS NOT NULL AND EnvioId IN (${vencidos}); SELECT @@ROWCOUNT AS n`));
    await t.commit();
  } catch (e) { await fecharTransacao(t, false); throw e; }
  return { entregas, avisos };
}
// A rodada das 7h só faz a retenção e regrava a marca da fila: a fila em si roda de 15 em 15 minutos desde as 6h (rodar aqui atrasaria os avisos do dia e a marca da proteção).
async function rotinaDiaria(pool) {
  const r = { falhas: [] };
  try { r.retencao = await aplicarRetencao(pool); } catch (e) { r.falhas.push("retencao"); console.error("[COMUNICACAO] retenção:", e.message); }
  try { await regravarMarca(pool); } catch (e) { r.falhas.push("marca"); }
  return r;
}

// Exclusão LGPD (dentro da transação de ExecutarExclusaoLGPD): o histórico de consentimento sai, os avisos de comunicado do sininho saem, as entregas perdem o nome — menos a da
// CONVOCAÇÃO OFICIAL, que é prova do ato por 5 anos (LGPD art. 16, I: cumprimento de obrigação; o ROPA diz isso); o que estava na fila é cancelado. As preferências de aviso e os
// aparelhos inscritos também saem (a exclusão antiga não os tocava).
async function exclusaoLgpd(r, membroId) {
  const consent = await r().input("m", sql.Int, membroId).query(comMarcaDePurga(`DELETE FROM ComunicacaoConsentimentos WHERE MembroId = @m; SET @apagadas = @@ROWCOUNT;`));
  await r().input("m", sql.Int, membroId).query(`UPDATE ComunicacaoEntregas SET Situacao = 'CANCELADO', AtualizadoEm = SYSUTCDATETIME() WHERE MembroId = @m AND Situacao IN ('PENDENTE', 'ENVIANDO')`);
  const entregas = await r().input("m", sql.Int, membroId).query(`
    UPDATE s SET MembroId = NULL, AnonimizadoEm = SYSUTCDATETIME() FROM ComunicacaoEntregas s JOIN ComunicacaoEnvios e ON e.EnvioId = s.EnvioId
    WHERE s.MembroId = @m AND e.Categoria NOT IN (${LISTA_DE_PROVA}); SELECT @@ROWCOUNT AS n`);
  const avisos = await r().input("m", sql.Int, membroId).query(`DELETE FROM Notificacoes WHERE RegraChave = 'COMUNICADO' AND DestinatarioMembroId = @m; SELECT @@ROWCOUNT AS n`);
  const prefs = await r().input("m", sql.Int, membroId).query(`DELETE FROM NotificacaoPreferencias WHERE MembroId = @m; SELECT @@ROWCOUNT AS n`);
  const aparelhos = await r().input("m", sql.Int, membroId).query(`DELETE FROM PushInscricoesMembro WHERE MembroId = @m; SELECT @@ROWCOUNT AS n`);
  return { consentimentos: contagem(consent), entregas: contagem(entregas), avisos: contagem(avisos), preferencias: contagem(prefs), aparelhos: contagem(aparelhos) };
}
// Meus Dados: o histórico de consentimento (com a origem, o endereço de quem marcou, a ficha e quem a lançou, o e-mail de onde veio a saída) e os comunicados recebidos.
async function dadosDoTitular(pool, membroId) {
  const k = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT k.Canal, k.Categoria, k.Concedido, k.Origem, k.TextoVersao, k.DataFicha, k.FichaReferencia, k.EnderecoIp, k.EnvioId, k.CriadoEm, p.Nome AS RegistradoPor
    FROM ComunicacaoConsentimentos k LEFT JOIN MembroReferencia p ON p.MembroId = k.RegistradoPorMembroId WHERE k.MembroId = @m ORDER BY k.ConsentimentoId DESC`);
  const comunicados = (await meusComunicados(pool, membroId)).map((c) => ({ envioId: c.envioId, categoria: c.categoriaRotulo, titulo: c.titulo, recebidoEm: c.recebidoEm, lido: c.lido, cienciaEm: c.cienciaEm }));
  return {
    consentimentos: k.recordset.map((x) => ({ canal: cm.CANAIS[x.Canal] || x.Canal, categoria: (cm.CATEGORIAS[x.Categoria] || {}).rotulo || x.Categoria, concedido: !!x.Concedido, origem: x.Origem,
      versaoDoTexto: x.TextoVersao, dataFicha: dia(x.DataFicha), fichaReferencia: x.FichaReferencia || null, registradoPor: x.RegistradoPor || null, enderecoIp: x.EnderecoIp || null,
      envioDeOrigem: x.EnvioId || null, em: iso(x.CriadoEm) })),
    comunicadosRecebidos: comunicados.length,
    comunicados
  };
}

module.exports = {
  PERMISSAO, MAX_GRUPO, minhasPreferencias, salvarPreferencias, validarMudancas, registrarFicha, consultarSaida, confirmarSaida,
  listarModelos, salvarModelo, aprovarModelo, arquivarModelo, opcoes, resolverGrupo, previa, salvarGrupo, listarGrupos, excluirGrupo,
  enviar, cancelar, processarFila, relatorio, listarEnvios, meusComunicados, darCiencia, aplicarRetencao, rotinaDiaria, exclusaoLgpd, dadosDoTitular, regravarMarca,
  prepararAvisoDoSistema, gravarAvisoDoSistema, cancelarPendentesDoSistema, depoisDoAvisoDoSistema, situacaoDoAvisoDoSistema, celularDoSistema, jaAlcancado
};
