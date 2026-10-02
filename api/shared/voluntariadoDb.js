// shared/voluntariadoDb.js (v7.5 — Escalas e voluntariado)
//
// A parte com banco. Toda decisão de regra (termo, rodízio, habitualidade, remoção) está em shared/voluntariado.js, pura e testada;
// aqui só se carrega, se chama a regra e se grava, com auditoria. As escalas em si continuam sendo de shared/escalas.js (v5.6) e a
// esteira de habilitação, de shared/habilitacaoVoluntarios.js (v5.7) — este módulo NÃO as refaz: gera serviços e alocações nas mesmas
// tabelas e reaproveita o motor de avisos.
// Funções devolvem { sucesso, mensagem, ... }; recusa de regra é sucesso:false (o handler a mostra como 422). `proibido:true` vira 403.
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const { hojeBrasilia } = require("./dataBrasilia");
const cal = require("./calendario");
const vol = require("./voluntariado");
const es = require("./escalas");
const trilhas = require("./trilhas");
const canaisDb = require("./canaisDb");

const { isoInstante, lerPrazoDias, notificarAgora } = canaisDb;
const limpar = (v) => String(v == null ? "" : v).trim();
const isoData = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const duplicado = (e) => e && (e.number === 2601 || e.number === 2627);
const LIMITE_LISTA = 500;
// Remover e reintegrar a mesma pessoa em ciclo geraria um aviso a cada volta: depois de 4 avisos de alteração de participação em 24 horas, o fato segue
// registrado (ficha de RH e auditoria) e o aviso para. E o aviso do rodízio publicado sai em lotes pequenos em paralelo, para um grupo grande não estourar o
// tempo da requisição (e-mails em sequência, um por um, levariam minutos).
const AVISOS_AO_VOLUNTARIO_POR_DIA = 4;
const AVISOS_EM_PARALELO = 8;
const STATUS_ATIVOS_SQL = "'CONVIDADO','ACEITO','CONFIRMADO'";

function listaIn(request, prefixo, valores, tipo = sql.Int) {
  return valores.map((v, i) => { request.input(`${prefixo}${i}`, tipo, v); return `@${prefixo}${i}`; }).join(", ");
}

async function lerMembro(pool, membroId) {
  const r = await pool.request().input("id", sql.Int, membroId)
    .query(`SELECT m.MembroId, m.Nome, m.Email, m.DataNascimento, m.CongregacaoId, c.Nome AS CongregacaoNome FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @id`);
  return r.recordset[0] || null;
}

async function nomeDe(pool, membroId) {
  const m = await lerMembro(pool, membroId);
  return m ? m.Nome : `matrícula ${membroId}`;
}

async function fecharTransacao(transaction, ok) {
  try { if (ok) await transaction.commit(); else await transaction.rollback(); } catch { /* já encerrada */ }
}

// ---------------------------------------------------------------
// Termo de Adesão (Art. 133 §8º)
// ---------------------------------------------------------------

function mapearAdesao(r, { comIp = false } = {}) {
  if (!r) return null;
  const o = {
    adesaoId: r.AdesaoId, membroId: r.MembroId, forma: r.Forma, rotuloForma: vol.FORMAS_ADESAO[r.Forma],
    termoVersao: r.TermoVersao, dataAceite: isoData(r.DataAceite), aceitoEm: isoInstante(r.AceitoEm),
    canalMensageria: r.CanalMensageria, rotuloCanal: r.CanalMensageria ? vol.CANAIS_MENSAGERIA[r.CanalMensageria] : null,
    referencia: r.Referencia, ratificacaoId: r.RatificacaoId, convalidaPeriodoAnterior: !!r.ConvalidaPeriodoAnterior,
    responsavelNome: r.ResponsavelNome || null, responsavelVinculo: r.ResponsavelVinculo || null, rotuloVinculo: r.ResponsavelVinculo ? vol.VINCULOS_RESPONSAVEL[r.ResponsavelVinculo] : null,
    registradoPorMembroId: r.RegistradoPorMembroId, registradoEm: isoInstante(r.RegistradoEm),
    integridade: vol.avaliarIntegridadeAdesao({ forma: r.Forma, termoVersao: r.TermoVersao, termoHash: r.TermoHash })
  };
  if (comIp) o.enderecoIp = r.EnderecoIp;
  return o;
}

async function buscarAdesao(pool, membroId, opcoes) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`SELECT * FROM VoluntariadoAdesoes WHERE MembroId = @m`);
  return mapearAdesao(r.recordset[0], opcoes);
}

// O que a pessoa vê em Meu Painel: o texto vigente, se já aderiu (sem o IP: ele é prova da Igreja, não conteúdo da tela) e se a idade lhe permite aderir pelo aceite digital.
async function situacaoDoTermo(pool, membroId, { hoje = hojeBrasilia() } = {}) {
  const adesao = await buscarAdesao(pool, membroId);
  const m = await lerMembro(pool, membroId);
  const cond = vol.condicaoDeIdade(vol.idadeEmAnos(m && m.DataNascimento, hoje));
  return { termo: vol.termoVigente(), aderiu: !!adesao, adesao, podeAderirDigital: cond.podeAderirDigital, motivoSemAdesaoDigital: cond.motivo, menorDeIdade: cond.menor };
}

// `cadeia`: os cabeçalhos de origem como chegaram (vol.cadeiaDeCabecalhos), guardados junto do IP escolhido — o x-forwarded-for pode ter sido escrito pelo cliente.
async function aceitarDigital(pool, { membroId, aceito, ip, cadeia = null, hoje = hojeBrasilia() }) {
  // Recusa de forma (caixa não marcada, sem IP) acontece sem consultar o banco; a idade, que exige o cadastro, vem em seguida.
  const forma = vol.validarAceiteDigital({ aceito, ip, idade: vol.MAIORIDADE });
  if (!forma.valido) return { sucesso: false, mensagem: forma.mensagem };
  const membro = await lerMembro(pool, membroId);
  const v = vol.validarAceiteDigital({ aceito, ip, idade: vol.idadeEmAnos(membro && membro.DataNascimento, hoje) });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const ja = await buscarAdesao(pool, membroId);
  if (ja) return { sucesso: false, mensagem: `Você já aderiu ao Termo em ${cal.formatarDataBr(ja.dataAceite)}.`, adesao: ja };
  let id;
  try {
    const r = await pool.request().input("m", sql.Int, membroId).input("v", sql.Int, vol.TERMO_VERSAO).input("h", sql.NVarChar(64), vol.TERMO_HASH)
      .input("d", sql.Date, hoje).input("ip", sql.NVarChar(45), ip).input("cad", sql.NVarChar(400), cadeia)
      .query(`INSERT INTO VoluntariadoAdesoes (MembroId, Forma, TermoVersao, TermoHash, DataAceite, AceitoEm, EnderecoIp, CadeiaCabecalhos)
              VALUES (@m, 'CLICKWRAP', @v, @h, @d, SYSUTCDATETIME(), @ip, @cad); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`);
    id = r.recordset[0].id;
  } catch (e) {
    if (duplicado(e)) return { sucesso: false, mensagem: "Você já aderiu ao Termo." };
    throw e;
  }
  // O IP fica só na tabela da adesão: a trilha de auditoria é imutável e não deve replicar dado pessoal.
  await registrarAuditoria({ tabela: "VoluntariadoAdesoes", registroId: id, acao: "ADESAO_REGISTRADA", usuarioId: membroId, dadosDepois: { forma: "CLICKWRAP", termoVersao: vol.TERMO_VERSAO, termoHash: vol.TERMO_HASH } });
  return { sucesso: true, mensagem: "Adesão registrada. Obrigado por servir de coração.", adesao: await buscarAdesao(pool, membroId) };
}

// Ficha física e confirmação por e-mail/WhatsApp: a Secretaria registra, a prova é o documento arquivado.
async function registrarAdesaoManual(pool, { membroId, dados, por, hoje = hojeBrasilia() }) {
  const forma = vol.validarRegistroAdesao(dados, { hoje, idade: vol.MAIORIDADE });      // a forma do pedido, sem consultar o banco
  if (!forma.valido) return { sucesso: false, mensagem: forma.mensagem };
  const m = await lerMembro(pool, membroId);
  if (!m) return { sucesso: false, mensagem: "Voluntário não encontrado." };
  // Menor de 18 anos: só vale com o nome e o vínculo de quem assinou por ele.
  const v = vol.validarRegistroAdesao(dados, { hoje, idade: vol.idadeEmAnos(m.DataNascimento, hoje) });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const ja = await buscarAdesao(pool, membroId);
  if (ja) return { sucesso: false, mensagem: `${m.Nome} já tem a adesão registrada em ${cal.formatarDataBr(ja.dataAceite)} (${ja.rotuloForma}).`, adesao: ja };
  let id;
  try {
    const r = await pool.request().input("m", sql.Int, membroId).input("f", sql.NVarChar(12), v.dados.forma).input("d", sql.Date, v.dados.dataAceite)
      .input("c", sql.NVarChar(8), v.dados.canal).input("ref", sql.NVarChar(200), v.dados.referencia).input("por", sql.Int, por)
      .input("rn", sql.NVarChar(150), v.dados.responsavelNome).input("rv", sql.NVarChar(18), v.dados.responsavelVinculo)
      .query(`INSERT INTO VoluntariadoAdesoes (MembroId, Forma, DataAceite, CanalMensageria, Referencia, RegistradoPorMembroId, ResponsavelNome, ResponsavelVinculo)
              VALUES (@m, @f, @d, @c, @ref, @por, @rn, @rv); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`);
    id = r.recordset[0].id;
  } catch (e) {
    if (duplicado(e)) return { sucesso: false, mensagem: `${m.Nome} já tem a adesão registrada.` };
    throw e;
  }
  await registrarAuditoria({ tabela: "VoluntariadoAdesoes", registroId: id, acao: "ADESAO_REGISTRADA", usuarioId: por, dadosDepois: { membroId, forma: v.dados.forma, dataAceite: v.dados.dataAceite, canal: v.dados.canal, referencia: v.dados.referencia, comResponsavel: !!v.dados.responsavelNome } });
  return { sucesso: true, mensagem: `Adesão de ${m.Nome} registrada (${vol.FORMAS_ADESAO[v.dados.forma]}).`, adesao: await buscarAdesao(pool, membroId) };
}

// Lista de Ouro (Art. 133 §8º, III). `autorizacao`: { global:boolean, podeCongregacao(nome):boolean } decide o escopo de quem registra.
async function ratificar(pool, { dados, por, autorizacao, hoje = hojeBrasilia() }) {
  const v = vol.validarRatificacao(dados, { hoje });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const d = v.dados;
  let assinantes = [];
  if (d.origem === "ESCALA_SERVICO") {
    const servico = await es.buscarServico(pool, d.servicoId);
    if (!servico) return { sucesso: false, mensagem: "Serviço não encontrado." };
    const cong = (await pool.request().input("c", sql.Int, servico.congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @c`)).recordset[0];
    if (!cong || !autorizacao.podeCongregacao(cong.Nome)) return { sucesso: false, proibido: true, mensagem: "Fora do seu escopo de atuação." };
    // A data da adesão é a data da lista: tem que ser a da própria escala. Sem isso, qualquer data passada poderia ser carimbada, e a adesão é irreversível.
    if (isoData(servico.dataHora) !== d.dataLista) return { sucesso: false, mensagem: `A data da lista precisa ser a da escala: ${cal.formatarDataBr(isoData(servico.dataHora))}.` };
    assinantes = (await pool.request().input("s", sql.Int, d.servicoId).query(`SELECT DISTINCT MembroId FROM EscalasAlocacoes WHERE ServicoId = @s AND Status IN ('ACEITO','CONFIRMADO')`)).recordset.map(x => x.MembroId);
  } else {
    // Assembleia e reunião de obreiros reúnem gente de várias congregações: só quem tem escopo geral ratifica.
    if (!autorizacao.global) return { sucesso: false, proibido: true, mensagem: "A ratificação de assembleia ou reunião de obreiros é da gestão com escopo geral." };
    const sessao = (await pool.request().input("s", sql.Int, d.sessaoId).query(`SELECT s.SessaoId, s.DataSessao, o.Sigla AS OrgaoSigla FROM Sessoes s LEFT JOIN Orgaos o ON o.OrgaoId = s.OrgaoId WHERE s.SessaoId = @s`)).recordset[0];
    if (!sessao) return { sucesso: false, mensagem: "Sessão não encontrada." };
    // A origem "Assembleia Geral" só vale para sessão do órgão Assembleia Geral. (Não há órgão cadastrado para a Reunião de Obreiros: ali só a data amarra a lista.)
    if (d.origem === "ASSEMBLEIA_GERAL" && sessao.OrgaoSigla !== "ASSEMBLEIA_GERAL") return { sucesso: false, mensagem: "Esta sessão não é de Assembleia Geral. Se for uma reunião de obreiros, escolha essa origem." };
    if (isoData(sessao.DataSessao) !== d.dataLista) return { sucesso: false, mensagem: `A data da lista precisa ser a da sessão: ${cal.formatarDataBr(isoData(sessao.DataSessao))}.` };
    assinantes = (await pool.request().input("s", sql.Int, d.sessaoId).query(`SELECT DISTINCT MembroId FROM Presencas WHERE SessaoId = @s AND Presente = 1`)).recordset.map(x => x.MembroId);
  }
  const ignorados = [];
  if (d.membroIds.length) {
    // Matrícula avulsa também respeita o escopo de quem registra (a adesão é irreversível): uma só fora dele recusa o pedido inteiro.
    const r = pool.request();
    const linhas = (await r.query(`SELECT m.MembroId, c.Nome AS CongregacaoNome FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId IN (${listaIn(r, "x", d.membroIds)})`)).recordset;
    const existentes = new Set(linhas.map(x => x.MembroId));
    const fora = linhas.filter(x => !autorizacao.podeCongregacao(x.CongregacaoNome)).map(x => x.MembroId);
    if (fora.length) return { sucesso: false, proibido: true, mensagem: `${fora.length} matrícula(s) avulsa(s) fora do seu escopo de atuação: ${fora.slice(0, 10).join(", ")}${fora.length > 10 ? "…" : ""}. Nada foi registrado.` };
    for (const id of d.membroIds) { if (existentes.has(id)) assinantes.push(id); else ignorados.push(id); }
  }
  assinantes = [...new Set(assinantes)];
  if (assinantes.length === 0) return { sucesso: false, mensagem: "A lista não tem nenhum signatário: confira a sessão/escala escolhida ou informe as matrículas." };

  // Menor de 18 anos não adere assinando uma lista (precisa do responsável): quem é menor de idade no cadastro fica de fora e a quantidade é devolvida.
  // Quem não tem data de nascimento no cadastro NÃO é excluído (a Secretaria atesta a assinatura em papel; a lista é de assembleia, reunião de obreiros ou escala).
  const menoresDoCadastro = new Set((await pool.request().input("hoje", sql.Date, hoje)
    .query(`SELECT MembroId, DataNascimento FROM MembroReferencia WHERE DataNascimento IS NOT NULL AND DataNascimento > DATEADD(YEAR, -${vol.MAIORIDADE}, @hoje)`)).recordset
    .filter(x => { const idade = vol.idadeEmAnos(x.DataNascimento, hoje); return idade != null && idade < vol.MAIORIDADE; }).map(x => x.MembroId));
  const menoresIgnorados = assinantes.filter(id => menoresDoCadastro.has(id)).length;
  assinantes = assinantes.filter(id => !menoresDoCadastro.has(id));
  if (assinantes.length === 0) return { sucesso: false, mensagem: `Todos os signatários são menores de 18 anos (${menoresIgnorados}): a adesão deles é feita com a assinatura do responsável, pela ficha.` };

  const jaAderiram = new Set((await pool.request().query(`SELECT MembroId FROM VoluntariadoAdesoes`)).recordset.map(x => x.MembroId));
  const novos = assinantes.filter(id => !jaAderiram.has(id));

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let ratificacaoId;
  try {
    const r = await new sql.Request(transaction)
      .input("o", sql.NVarChar(16), d.origem).input("sessao", sql.Int, d.sessaoId).input("servico", sql.Int, d.servicoId)
      .input("desc", sql.NVarChar(200), d.descricao).input("data", sql.Date, d.dataLista)
      .input("tv", sql.Int, vol.RATIFICACAO_VERSAO).input("th", sql.NVarChar(64), vol.RATIFICACAO_HASH)
      .input("tot", sql.Int, assinantes.length).input("nov", sql.Int, novos.length).input("por", sql.Int, por)
      .query(`INSERT INTO VoluntariadoRatificacoes (Origem, SessaoId, ServicoId, Descricao, DataLista, CabecalhoConfirmadoEm, TextoVersao, TextoHash, TotalSignatarios, NovasAdesoes, RegistradoPorMembroId)
              VALUES (@o, @sessao, @servico, @desc, @data, SYSUTCDATETIME(), @tv, @th, @tot, @nov, @por); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`);
    ratificacaoId = r.recordset[0].id;
    for (const membroId of novos) {
      await new sql.Request(transaction).input("m", sql.Int, membroId).input("tv", sql.Int, vol.RATIFICACAO_VERSAO).input("th", sql.NVarChar(64), vol.RATIFICACAO_HASH)
        .input("d", sql.Date, d.dataLista).input("ref", sql.NVarChar(200), d.descricao).input("rat", sql.Int, ratificacaoId).input("por", sql.Int, por)
        .query(`INSERT INTO VoluntariadoAdesoes (MembroId, Forma, TermoVersao, TermoHash, DataAceite, Referencia, RatificacaoId, ConvalidaPeriodoAnterior, RegistradoPorMembroId)
                VALUES (@m, 'LISTA_OURO', @tv, @th, @d, @ref, @rat, 1, @por)`);
    }
    await transaction.commit();
  } catch (e) {
    await fecharTransacao(transaction, false);
    if (duplicado(e)) return { sucesso: false, mensagem: "Alguém da lista aderiu ao Termo enquanto isto era registrado. Tente de novo." };
    throw e;
  }
  await registrarAuditoria({ tabela: "VoluntariadoRatificacoes", registroId: ratificacaoId, acao: "RATIFICACAO_REGISTRADA", usuarioId: por,
    dadosDepois: { origem: d.origem, sessaoId: d.sessaoId, servicoId: d.servicoId, descricao: d.descricao, dataLista: d.dataLista, totalSignatarios: assinantes.length, novasAdesoes: novos.length, textoHash: vol.RATIFICACAO_HASH } });
  return {
    sucesso: true, ratificacaoId, totalSignatarios: assinantes.length, novasAdesoes: novos.length, jaAderiam: assinantes.length - novos.length, matriculasIgnoradas: ignorados, menoresIgnorados,
    mensagem: `Ratificação registrada: ${novos.length} adesão(ões) nova(s)${assinantes.length - novos.length ? `, ${assinantes.length - novos.length} já aderira(m) antes` : ""}.${menoresIgnorados ? ` ${menoresIgnorados} menor(es) de 18 anos ficaram de fora: a adesão deles é pela ficha assinada pelo responsável.` : ""}`
  };
}

// `porMembroId`: quem não tem escopo geral só vê as ratificações que ele mesmo registrou.
async function listarRatificacoes(pool, { limite = 50, porMembroId = null } = {}) {
  const rq = pool.request();
  let filtro = "";
  if (porMembroId) { rq.input("por", sql.Int, porMembroId); filtro = "WHERE RegistradoPorMembroId = @por"; }
  const r = await rq.query(`SELECT TOP (${Number(limite) || 50}) RatificacaoId, Origem, Descricao, DataLista, TotalSignatarios, NovasAdesoes, RegistradoEm FROM VoluntariadoRatificacoes ${filtro} ORDER BY RatificacaoId DESC`);
  return r.recordset.map(x => ({ ratificacaoId: x.RatificacaoId, origem: x.Origem, rotuloOrigem: vol.ORIGENS_RATIFICACAO[x.Origem], descricao: x.Descricao, dataLista: isoData(x.DataLista), totalSignatarios: x.TotalSignatarios, novasAdesoes: x.NovasAdesoes, registradoEm: isoInstante(x.RegistradoEm) }));
}

// Quem serve nas equipes ativas da congregação e quem já aderiu. Sem termo primeiro.
async function coberturaDoTermo(pool, { congregacaoId, hoje = hojeBrasilia() }) {
  const r = await pool.request().input("c", sql.Int, congregacaoId).query(`
    SELECT TOP (${LIMITE_LISTA}) m.MembroId, m.Nome, m.DataNascimento, STRING_AGG(e.Nome, ', ') AS Equipes, a.AdesaoId, a.Forma, a.DataAceite, a.Referencia
    FROM EscalasEquipeMembros em
    JOIN EscalasEquipes e ON e.EquipeId = em.EquipeId AND e.Ativa = 1 AND e.CongregacaoId = @c
    JOIN MembroReferencia m ON m.MembroId = em.MembroId
    LEFT JOIN VoluntariadoAdesoes a ON a.MembroId = m.MembroId
    WHERE em.Ativo = 1
    GROUP BY m.MembroId, m.Nome, m.DataNascimento, a.AdesaoId, a.Forma, a.DataAceite, a.Referencia
    ORDER BY CASE WHEN a.AdesaoId IS NULL THEN 0 ELSE 1 END, m.Nome`);
  // `menor` marca quem tem menos de 18 anos: a adesão dele exige o responsável (a tela da Secretaria avisa); a data de nascimento em si não sai daqui.
  const voluntarios = r.recordset.map(x => ({
    membroId: x.MembroId, nome: x.Nome, equipes: x.Equipes, aderiu: x.AdesaoId != null,
    menor: (() => { const i = vol.idadeEmAnos(x.DataNascimento, hoje); return i != null && i < vol.MAIORIDADE; })(),
    forma: x.Forma || null, rotuloForma: x.Forma ? vol.FORMAS_ADESAO[x.Forma] : null, dataAceite: isoData(x.DataAceite), referencia: x.Referencia || null
  }));
  const comTermo = voluntarios.filter(v => v.aderiu).length;
  return { total: voluntarios.length, comTermo, semTermo: voluntarios.length - comTermo, voluntarios };
}

// Retenção do IP do aceite digital (LGPD art. 16). Rotina diária (NotificacoesAgendador). Só mexe no IP e nos cabeçalhos: a adesão continua íntegra (o gatilho
// TR_VoluntariadoAdesoes_Imutavel recusa qualquer outra mudança). Anonimiza quem NÃO serve mais — fora de equipe ativa e sem serviço nos últimos N dias —
// e aderiu há mais de N dias; quem segue servindo mantém o IP, porque a prova ainda pode ser necessária.
async function anonimizarIpsVencidos(pool, { hoje = hojeBrasilia() } = {}) {
  const dias = await lerPrazoDias(pool, "VOLUNTARIADO_IP_RETENCAO_DIAS", vol.IP_RETENCAO_DIAS_PADRAO);
  const r = await pool.request().input("hoje", sql.Date, hoje).input("dias", sql.Int, dias).query(`
    UPDATE a SET EnderecoIp = N'anonimizado', CadeiaCabecalhos = NULL
    FROM VoluntariadoAdesoes a
    WHERE a.Forma = 'CLICKWRAP' AND (a.EnderecoIp <> N'anonimizado' OR a.CadeiaCabecalhos IS NOT NULL)
      AND a.DataAceite < DATEADD(DAY, -@dias, @hoje)
      AND NOT EXISTS (SELECT 1 FROM EscalasEquipeMembros em WHERE em.MembroId = a.MembroId AND em.Ativo = 1)
      AND NOT EXISTS (SELECT 1 FROM EscalasAlocacoes al JOIN EscalasServicos s ON s.ServicoId = al.ServicoId WHERE al.MembroId = a.MembroId AND s.DataHora >= DATEADD(DAY, -@dias, @hoje));
    SELECT @@ROWCOUNT AS total;`);
  const total = r.recordset[0] ? Number(r.recordset[0].total) : 0;
  // Lote: registroId 0 (mesma convenção das outras rotinas). Sem usuário (rotina automática) e sem dado pessoal: só a contagem e o prazo aplicado.
  if (total > 0) await registrarAuditoria({ tabela: "VoluntariadoAdesoes", registroId: 0, acao: "IP_ANONIMIZADO", usuarioId: null, dadosDepois: { quantidade: total, retencaoDias: dias, referencia: hoje } });
  return { anonimizados: total, retencaoDias: dias };
}

// Direito de acesso do titular (LGPD art. 18, I): o que o voluntariado guarda da PRÓPRIA pessoa. Só é lido quando ela pede (Meus Dados) — nenhuma rotina
// exporta isto para lugar nenhum. Fica de fora o texto livre escrito por outras pessoas sobre ela (o motivo da remoção da escala) e a identidade de quem
// registrou: o titular recebe o fato (quando, onde, de que tipo) e a orientação de pedir o resto à Secretaria.
async function dadosDoTitular(pool, membroId) {
  const q = (texto) => pool.request().input("m", sql.Int, membroId).query(texto);
  const [adesao, equipes, alocacoes, indisponibilidades, remocoes, grupos] = await Promise.all([
    q(`SELECT AdesaoId, Forma, TermoVersao, TermoHash, DataAceite, AceitoEm, EnderecoIp, CadeiaCabecalhos, CanalMensageria, Referencia, ResponsavelNome, ResponsavelVinculo, RegistradoPorMembroId, RegistradoEm
       FROM VoluntariadoAdesoes WHERE MembroId = @m`),
    q(`SELECT e.Nome AS Equipe, c.Nome AS Congregacao, em.Ativo, em.CriadoEm
       FROM EscalasEquipeMembros em JOIN EscalasEquipes e ON e.EquipeId = em.EquipeId LEFT JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoId
       WHERE em.MembroId = @m ORDER BY em.CriadoEm DESC`),
    q(`SELECT TOP (${LIMITE_LISTA}) s.DataHora, s.Descricao, e.Nome AS Equipe, al.Status
       FROM EscalasAlocacoes al JOIN EscalasServicos s ON s.ServicoId = al.ServicoId JOIN EscalasEquipes e ON e.EquipeId = al.EquipeId
       WHERE al.MembroId = @m ORDER BY s.DataHora DESC`),
    q(`SELECT DataInicio, DataFim, Motivo FROM EscalasIndisponibilidades WHERE MembroId = @m ORDER BY DataInicio DESC`),
    q(`SELECT d.DesligadoEm, e.Nome AS Equipe, d.TipoMotivo, d.RemovidoDaEscala, d.ReintegradoEm
       FROM VoluntariosDesligamentos d LEFT JOIN EscalasEquipes e ON e.EquipeId = d.EquipeId WHERE d.MembroId = @m ORDER BY d.DesligadoEm DESC`),
    q(`SELECT r.Nome AS Rodizio, g.Nome AS Grupo, gm.EntrouEm, gm.SaiuEm
       FROM EscalasRodizioGrupoMembros gm JOIN EscalasRodizioGrupos g ON g.GrupoId = gm.GrupoId JOIN EscalasRodizios r ON r.RodizioId = gm.RodizioId
       WHERE gm.MembroId = @m ORDER BY gm.EntrouEm DESC`)
  ]);
  const a = adesao.recordset[0];
  return {
    adesao: a ? {
      forma: a.Forma, rotuloForma: vol.FORMAS_ADESAO[a.Forma], termoVersao: a.TermoVersao, termoHash: a.TermoHash, dataAceite: isoData(a.DataAceite), aceitoEm: isoInstante(a.AceitoEm),
      enderecoIp: a.EnderecoIp, cadeiaCabecalhos: a.CadeiaCabecalhos, canalMensageria: a.CanalMensageria, referencia: a.Referencia,
      responsavelNome: a.ResponsavelNome || null, responsavelVinculo: a.ResponsavelVinculo ? vol.VINCULOS_RESPONSAVEL[a.ResponsavelVinculo] : null,
      registradaPelaSecretaria: a.RegistradoPorMembroId != null, registradoEm: isoInstante(a.RegistradoEm)
    } : null,
    equipes: equipes.recordset.map(x => ({ equipe: x.Equipe, congregacao: x.Congregacao || null, ativo: !!x.Ativo, desde: isoInstante(x.CriadoEm) })),
    servicos: alocacoes.recordset.map(x => ({ dataHora: isoInstante(x.DataHora), descricao: x.Descricao || null, equipe: x.Equipe, situacao: x.Status })),
    indisponibilidades: indisponibilidades.recordset.map(x => ({ dataInicio: isoData(x.DataInicio), dataFim: isoData(x.DataFim), motivo: x.Motivo || null })),
    remocoesDaEscala: remocoes.recordset.map(x => ({ em: isoInstante(x.DesligadoEm), equipe: x.Equipe || null, tipo: x.TipoMotivo, removidoDaEscala: !!x.RemovidoDaEscala, reintegradoEm: isoInstante(x.ReintegradoEm) })),
    gruposDeRodizio: grupos.recordset.map(x => ({ rodizio: x.Rodizio, grupo: x.Grupo, entrouEm: isoInstante(x.EntrouEm), saiuEm: isoInstante(x.SaiuEm) })),
    aviso: "O motivo escrito de uma remoção da escala e o nome de quem registrou cada ato ficam com a Secretaria: peça-os pelo canal do Encarregado de Dados (LGPD art. 18)."
  };
}

// ---------------------------------------------------------------
// Equipes: natureza
// ---------------------------------------------------------------

async function definirNaturezaEquipe(pool, { equipe, natureza, por }) {
  const v = vol.validarNatureza(natureza);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  await pool.request().input("id", sql.Int, equipe.equipeId).input("n", sql.NVarChar(10), v.natureza).query(`UPDATE EscalasEquipes SET Natureza = @n WHERE EquipeId = @id`);
  await registrarAuditoria({ tabela: "EscalasEquipes", registroId: equipe.equipeId, acao: "NATUREZA_DEFINIDA", usuarioId: por, dadosAntes: { natureza: equipe.natureza || null }, dadosDepois: { natureza: v.natureza } });
  return { sucesso: true, mensagem: `A equipe ${equipe.nome} agora é “${vol.NATUREZAS[v.natureza]}”.${vol.equipeExigeRevezamento(v.natureza) ? " Nesta natureza o revezamento é obrigatório (Art. 135 §1º) e a trava de habitualidade fica de olho." : ""}`, natureza: v.natureza };
}

// ---------------------------------------------------------------
// Remoção da escala: quem foi removido de uma equipe e ainda não voltou não entra de novo por outra porta
// ---------------------------------------------------------------

async function removidoDaEquipe(pool, { membroId, equipeId }) {
  const r = await pool.request().input("m", sql.Int, membroId).input("e", sql.Int, equipeId)
    .query(`SELECT TOP 1 DesligamentoId, DesligadoEm FROM VoluntariosDesligamentos WHERE MembroId = @m AND EquipeId = @e AND RemovidoDaEscala = 1 AND ReintegradoEm IS NULL ORDER BY DesligamentoId DESC`);
  return r.recordset[0] ? { desligamentoId: r.recordset[0].DesligamentoId, desligadoEm: isoInstante(r.recordset[0].DesligadoEm) } : null;
}

// O líder da equipe só age como líder se não estiver, ele mesmo, removido da escala dela (a remoção do líder não troca o LiderMembroId).
async function liderAtivo(pool, { equipe, membroId }) {
  if (!equipe || Number(equipe.liderMembroId) !== Number(membroId)) return false;
  return !(await removidoDaEquipe(pool, { membroId, equipeId: equipe.equipeId }));
}

// Para recusar com 403 (e não com 404) quem não tem permissão nem lidera nada: a resposta não revela se a equipe ou o registro existem.
async function lideraAlgumaEquipe(pool, { membroId }) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`SELECT TOP 1 1 AS ok FROM EscalasEquipes WHERE LiderMembroId = @m AND Ativa = 1`);
  return r.recordset.length > 0;
}

function mensagemRemovido(r, nomeMembro) {
  return `${nomeMembro} foi removido(a) da escala desta equipe em ${cal.formatarDataBr(isoData(r.desligadoEm))}. Reintegre-o(a) antes de escalar de novo (registro de remoções).`;
}

// ---------------------------------------------------------------
// Rodízio voluntário (Art. 135 §1º)
// ---------------------------------------------------------------

function mapearRodizio(r) {
  return {
    rodizioId: r.RodizioId, congregacaoId: r.CongregacaoId, equipeId: r.EquipeId, equipeNome: r.EquipeNome, natureza: r.Natureza, rotuloNatureza: vol.NATUREZAS[r.Natureza],
    nome: r.Nome, diaSemana: r.DiaSemana, rotuloDia: vol.DIAS_SEMANA[r.DiaSemana], hora: r.Hora, intervaloSemanas: r.IntervaloSemanas,
    dataAncora: isoData(r.DataAncora), ativo: !!r.Ativo, geradoAte: isoData(r.GeradoAte), criadoEm: isoInstante(r.CriadoEm)
  };
}

const SELECT_RODIZIO = `SELECT r.*, e.Nome AS EquipeNome, e.Natureza FROM EscalasRodizios r JOIN EscalasEquipes e ON e.EquipeId = r.EquipeId`;

async function carregarGrupos(pool, rodizioIds) {
  if (!rodizioIds.length) return new Map();
  const r1 = pool.request();
  const gs = (await r1.query(`SELECT GrupoId, RodizioId, Nome, Ordem FROM EscalasRodizioGrupos WHERE Ativo = 1 AND RodizioId IN (${listaIn(r1, "r", rodizioIds)}) ORDER BY RodizioId, Ordem, GrupoId`)).recordset;
  const r2 = pool.request();
  const ms = (await r2.query(`SELECT gm.GrupoId, gm.MembroId, m.Nome FROM EscalasRodizioGrupoMembros gm JOIN MembroReferencia m ON m.MembroId = gm.MembroId
                              WHERE gm.SaiuEm IS NULL AND gm.RodizioId IN (${listaIn(r2, "r", rodizioIds)}) ORDER BY m.Nome`)).recordset;
  const porGrupo = new Map();
  for (const m of ms) { if (!porGrupo.has(m.GrupoId)) porGrupo.set(m.GrupoId, []); porGrupo.get(m.GrupoId).push({ membroId: m.MembroId, nome: m.Nome }); }
  const porRodizio = new Map();
  for (const g of gs) {
    if (!porRodizio.has(g.RodizioId)) porRodizio.set(g.RodizioId, []);
    porRodizio.get(g.RodizioId).push({ grupoId: g.GrupoId, nome: g.Nome, ordem: g.Ordem, membros: porGrupo.get(g.GrupoId) || [] });
  }
  return porRodizio;
}

async function proximasDatas(pool, rodizio, grupos, { hoje, semanas = 8 }) {
  if (!rodizio.ativo || grupos.length === 0) return [];
  const ate = cal.somarDias(hoje, semanas * 7);
  const existentes = new Set((await pool.request().input("r", sql.Int, rodizio.rodizioId).input("de", sql.Date, hoje)
    .query(`SELECT DataHora FROM EscalasServicos WHERE RodizioId = @r AND Status <> 'CANCELADA' AND CAST(DataHora AS DATE) >= @de`)).recordset.map(x => isoData(x.DataHora)));
  const plano = vol.planejarOcorrencias({ rodizio, grupos, de: hoje, ate, existentes: new Set() });
  return plano.ocorrencias.map(o => ({ dataIso: o.dataIso, grupoId: o.grupoId, grupoNome: o.grupoNome, gerada: existentes.has(o.dataIso) }));
}

async function listarRodizios(pool, { congregacaoId, hoje = hojeBrasilia() }) {
  const rodizios = (await pool.request().input("c", sql.Int, congregacaoId).query(`${SELECT_RODIZIO} WHERE r.CongregacaoId = @c ORDER BY r.Ativo DESC, r.Nome`)).recordset.map(mapearRodizio);
  const grupos = await carregarGrupos(pool, rodizios.map(r => r.rodizioId));
  for (const r of rodizios) {
    r.grupos = grupos.get(r.rodizioId) || [];
    r.composicao = vol.validarComposicao(r.grupos.map(g => ({ nome: g.nome, membros: g.membros.length })));
    r.proximas = (await proximasDatas(pool, r, r.grupos, { hoje, semanas: 6 })).slice(0, 6);
  }
  const equipes = (await pool.request().input("c", sql.Int, congregacaoId).query(`SELECT EquipeId, Nome, Natureza, Ativa FROM EscalasEquipes WHERE CongregacaoId = @c ORDER BY Nome`)).recordset
    .map(e => ({ equipeId: e.EquipeId, nome: e.Nome, natureza: e.Natureza, rotuloNatureza: vol.NATUREZAS[e.Natureza], ativa: !!e.Ativa, exigeRevezamento: vol.equipeExigeRevezamento(e.Natureza) }));
  const comRodizio = new Set(rodizios.filter(r => r.ativo).map(r => r.equipeId));
  const equipesSemRodizio = equipes.filter(e => e.ativa && e.exigeRevezamento && !comRodizio.has(e.equipeId));
  return { rodizios, equipes, equipesSemRodizio };
}

async function buscarRodizio(pool, rodizioId) {
  const r = (await pool.request().input("id", sql.Int, rodizioId).query(`${SELECT_RODIZIO} WHERE r.RodizioId = @id`)).recordset[0];
  return r ? mapearRodizio(r) : null;
}

async function detalharRodizio(pool, rodizioId, { hoje = hojeBrasilia() } = {}) {
  const rodizio = await buscarRodizio(pool, rodizioId);
  if (!rodizio) return null;
  rodizio.grupos = (await carregarGrupos(pool, [rodizioId])).get(rodizioId) || [];
  rodizio.composicao = vol.validarComposicao(rodizio.grupos.map(g => ({ nome: g.nome, membros: g.membros.length })));
  rodizio.proximas = (await proximasDatas(pool, rodizio, rodizio.grupos, { hoje, semanas: 12 })).slice(0, 12);
  return rodizio;
}

async function criarRodizio(pool, { dados, congregacaoId, por }) {
  const v = vol.validarRodizio(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const equipe = await es.buscarEquipe(pool, v.dados.equipeId);
  if (!equipe) return { sucesso: false, mensagem: "Equipe não encontrada." };
  if (Number(equipe.congregacaoId) !== Number(congregacaoId)) return { sucesso: false, mensagem: "A equipe não é desta congregação." };
  if (!equipe.ativa) return { sucesso: false, mensagem: "A equipe está inativa." };
  const ativos = (await pool.request().input("c", sql.Int, congregacaoId).query(`SELECT COUNT(*) AS n FROM EscalasRodizios WHERE CongregacaoId = @c AND Ativo = 1`)).recordset[0].n;
  if (ativos >= vol.MAX_RODIZIOS_POR_CONGREGACAO) return { sucesso: false, mensagem: `Cada congregação aceita até ${vol.MAX_RODIZIOS_POR_CONGREGACAO} rodízios ativos: desative algum antes.` };
  const r = await pool.request().input("c", sql.Int, congregacaoId).input("e", sql.Int, v.dados.equipeId).input("n", sql.NVarChar(100), v.dados.nome)
    .input("dia", sql.TinyInt, v.dados.diaSemana).input("h", sql.NVarChar(5), v.dados.hora).input("i", sql.TinyInt, v.dados.intervaloSemanas).input("a", sql.Date, v.dados.dataAncora).input("por", sql.Int, por)
    .query(`INSERT INTO EscalasRodizios (CongregacaoId, EquipeId, Nome, DiaSemana, Hora, IntervaloSemanas, DataAncora, CriadoPorMembroId) VALUES (@c, @e, @n, @dia, @h, @i, @a, @por);
            SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`);
  const rodizioId = r.recordset[0].id;
  await registrarAuditoria({ tabela: "EscalasRodizios", registroId: rodizioId, acao: "RODIZIO_CRIADO", usuarioId: por, dadosDepois: { ...v.dados, congregacaoId } });
  return { sucesso: true, rodizioId, mensagem: "Rodízio criado. Agora crie pelo menos dois grupos e coloque os voluntários neles." };
}

async function alterarAtivoRodizio(pool, { rodizio, ativo, por }) {
  if (rodizio.ativo === !!ativo) return { sucesso: false, mensagem: ativo ? "O rodízio já está ativo." : "O rodízio já está desativado." };
  await pool.request().input("id", sql.Int, rodizio.rodizioId).input("a", sql.Bit, ativo ? 1 : 0).query(`UPDATE EscalasRodizios SET Ativo = @a WHERE RodizioId = @id`);
  await registrarAuditoria({ tabela: "EscalasRodizios", registroId: rodizio.rodizioId, acao: ativo ? "RODIZIO_REATIVADO" : "RODIZIO_DESATIVADO", usuarioId: por });
  return { sucesso: true, mensagem: ativo ? "Rodízio reativado." : "Rodízio desativado. Os serviços já gerados continuam; nada novo será gerado." };
}

async function buscarGrupo(pool, grupoId) {
  const r = (await pool.request().input("id", sql.Int, grupoId).query(`SELECT GrupoId, RodizioId, Nome, Ordem, Ativo FROM EscalasRodizioGrupos WHERE GrupoId = @id`)).recordset[0];
  return r ? { grupoId: r.GrupoId, rodizioId: r.RodizioId, nome: r.Nome, ordem: r.Ordem, ativo: !!r.Ativo } : null;
}

// `podeCongregacao(nome)`: o escopo de quem coloca; o voluntário também precisa estar nele (sem isso, as mensagens abaixo — com nome — virariam consulta de nomes por matrícula).
async function adicionarMembroAoGrupo(pool, { rodizio, grupo, membroId, por, podeCongregacao = null }) {
  if (!rodizio.ativo) return { sucesso: false, mensagem: "O rodízio está desativado." };
  if (!grupo.ativo) return { sucesso: false, mensagem: "O grupo está desativado." };
  const m = await lerMembro(pool, membroId);
  if (!m) return { sucesso: false, mensagem: `Matrícula ${membroId} não encontrada.` };
  if (podeCongregacao && !podeCongregacao(m.CongregacaoNome)) return { sucesso: false, proibido: true, mensagem: `A matrícula ${membroId} está fora do seu escopo de atuação.` };
  const removido = await removidoDaEquipe(pool, { membroId, equipeId: rodizio.equipeId });
  if (removido) return { sucesso: false, mensagem: mensagemRemovido(removido, m.Nome) };
  // v6.9: a equipe pode exigir uma formação vigente; vale também para quem entra por um grupo.
  const formacao = await trilhas.filtrarMembrosQueAtendem(pool, { contexto: "ESCALA_EQUIPE", alvoChave: String(rodizio.equipeId), membroIds: [membroId] });
  if (formacao.bloqueados.has(Number(membroId))) return { sucesso: false, mensagem: `${m.Nome}: ${formacao.bloqueados.get(Number(membroId))}` };
  const outro = (await pool.request().input("r", sql.Int, rodizio.rodizioId).input("m", sql.Int, membroId)
    .query(`SELECT g.Nome FROM EscalasRodizioGrupoMembros gm JOIN EscalasRodizioGrupos g ON g.GrupoId = gm.GrupoId WHERE gm.RodizioId = @r AND gm.MembroId = @m AND gm.SaiuEm IS NULL`)).recordset[0];
  if (outro) return { sucesso: false, mensagem: `${m.Nome} já está no grupo “${outro.Nome}” deste rodízio: grupos distintos é que se alternam (Art. 135 §1º, I).` };
  const noGrupo = (await pool.request().input("g", sql.Int, grupo.grupoId).query(`SELECT COUNT(*) AS n FROM EscalasRodizioGrupoMembros WHERE GrupoId = @g AND SaiuEm IS NULL`)).recordset[0].n;
  if (noGrupo >= vol.MAX_MEMBROS_POR_GRUPO) return { sucesso: false, mensagem: `Um grupo aceita até ${vol.MAX_MEMBROS_POR_GRUPO} voluntários: divida em outro grupo.` };
  try {
    await pool.request().input("g", sql.Int, grupo.grupoId).input("r", sql.Int, rodizio.rodizioId).input("m", sql.Int, membroId)
      .query(`INSERT INTO EscalasRodizioGrupoMembros (GrupoId, RodizioId, MembroId) VALUES (@g, @r, @m)`);
  } catch (e) {
    if (duplicado(e)) return { sucesso: false, mensagem: `${m.Nome} já está em um grupo deste rodízio.` };
    throw e;
  }
  // O voluntário do grupo é membro da equipe (sem apagar a frequência preferida que ele já tinha).
  await pool.request().input("e", sql.Int, rodizio.equipeId).input("m", sql.Int, membroId).query(`
    IF EXISTS (SELECT 1 FROM EscalasEquipeMembros WHERE EquipeId = @e AND MembroId = @m) UPDATE EscalasEquipeMembros SET Ativo = 1 WHERE EquipeId = @e AND MembroId = @m
    ELSE INSERT INTO EscalasEquipeMembros (EquipeId, MembroId) VALUES (@e, @m)`);
  await registrarAuditoria({ tabela: "EscalasRodizioGrupos", registroId: grupo.grupoId, acao: "MEMBRO_ENTROU_NO_GRUPO", usuarioId: por, dadosDepois: { rodizioId: rodizio.rodizioId, membroId } });
  return { sucesso: true, mensagem: `${m.Nome} entrou no ${grupo.nome}.` };
}

async function criarGrupo(pool, { rodizio, nome, membroIds = [], por, podeCongregacao = null }) {
  if (!rodizio.ativo) return { sucesso: false, mensagem: "O rodízio está desativado." };
  const v = vol.validarNomeGrupo(nome);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const pedidos = [...new Set((membroIds || []).map(Number).filter(Boolean))];
  if (pedidos.length > vol.MAX_MEMBROS_AO_CRIAR_GRUPO) return { sucesso: false, mensagem: `Ao criar o grupo, informe até ${vol.MAX_MEMBROS_AO_CRIAR_GRUPO} voluntários; os demais entram depois, um a um.` };
  const ativos = (await pool.request().input("r", sql.Int, rodizio.rodizioId).query(`SELECT COUNT(*) AS n, ISNULL(MAX(Ordem), 0) AS maxOrdem FROM EscalasRodizioGrupos WHERE RodizioId = @r AND Ativo = 1`)).recordset[0];
  if (ativos.n >= vol.MAX_GRUPOS) return { sucesso: false, mensagem: `Um rodízio aceita até ${vol.MAX_GRUPOS} grupos.` };
  let grupoId;
  try {
    const r = await pool.request().input("r", sql.Int, rodizio.rodizioId).input("n", sql.NVarChar(60), v.nome).input("o", sql.Int, ativos.maxOrdem + 1)
      .query(`INSERT INTO EscalasRodizioGrupos (RodizioId, Nome, Ordem) VALUES (@r, @n, @o); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`);
    grupoId = r.recordset[0].id;
  } catch (e) {
    if (duplicado(e)) return { sucesso: false, mensagem: `Já existe um grupo “${v.nome}” neste rodízio.` };
    throw e;
  }
  await registrarAuditoria({ tabela: "EscalasRodizioGrupos", registroId: grupoId, acao: "GRUPO_CRIADO", usuarioId: por, dadosDepois: { rodizioId: rodizio.rodizioId, nome: v.nome } });
  const recusados = [];
  const grupo = { grupoId, rodizioId: rodizio.rodizioId, nome: v.nome, ativo: true };
  for (const id of pedidos) {
    const r = await adicionarMembroAoGrupo(pool, { rodizio, grupo, membroId: id, por, podeCongregacao });
    if (!r.sucesso) recusados.push({ membroId: id, mensagem: r.mensagem });
  }
  return { sucesso: true, grupoId, recusados, mensagem: recusados.length ? `Grupo criado, mas ${recusados.length} voluntário(s) não entraram.` : "Grupo criado." };
}

async function removerMembroDoGrupo(pool, { rodizio, grupo, membroId, por }) {
  const r = await pool.request().input("g", sql.Int, grupo.grupoId).input("m", sql.Int, membroId)
    .query(`UPDATE EscalasRodizioGrupoMembros SET SaiuEm = SYSUTCDATETIME() WHERE GrupoId = @g AND MembroId = @m AND SaiuEm IS NULL`);
  if (!r.rowsAffected || r.rowsAffected[0] === 0) return { sucesso: false, mensagem: "Esse voluntário não está neste grupo." };
  await registrarAuditoria({ tabela: "EscalasRodizioGrupos", registroId: grupo.grupoId, acao: "MEMBRO_SAIU_DO_GRUPO", usuarioId: por, dadosDepois: { rodizioId: rodizio.rodizioId, membroId } });
  return { sucesso: true, mensagem: "Voluntário retirado do grupo. Os serviços já gerados não mudam: cancele os futuros e gere de novo para refletir." };
}

async function desativarGrupo(pool, { rodizio, grupo, por }) {
  if (!grupo.ativo) return { sucesso: false, mensagem: "O grupo já está desativado." };
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction).input("g", sql.Int, grupo.grupoId).query(`UPDATE EscalasRodizioGrupoMembros SET SaiuEm = SYSUTCDATETIME() WHERE GrupoId = @g AND SaiuEm IS NULL`);
    await new sql.Request(transaction).input("g", sql.Int, grupo.grupoId).query(`UPDATE EscalasRodizioGrupos SET Ativo = 0 WHERE GrupoId = @g`);
    await transaction.commit();
  } catch (e) { await fecharTransacao(transaction, false); throw e; }
  await registrarAuditoria({ tabela: "EscalasRodizioGrupos", registroId: grupo.grupoId, acao: "GRUPO_DESATIVADO", usuarioId: por, dadosDepois: { rodizioId: rodizio.rodizioId } });
  return { sucesso: true, mensagem: "Grupo desativado. A sequência do revezamento passa a considerar só os grupos ativos." };
}

async function carregarContextoDeGeracao(pool, rodizioId) {
  const rodizio = await buscarRodizio(pool, rodizioId);
  if (!rodizio) return null;
  const grupos = (await carregarGrupos(pool, [rodizioId])).get(rodizioId) || [];
  return { rodizio, grupos };
}

// O que seria gerado, sem gravar nada.
async function previaGeracao(pool, { rodizioId, semanas, hoje = hojeBrasilia() }) {
  const v = vol.validarGeracao({ semanas }, { hoje });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const ctx = await carregarContextoDeGeracao(pool, rodizioId);
  if (!ctx) return { sucesso: false, mensagem: "Rodízio não encontrado." };
  const comp = vol.validarComposicao(ctx.grupos.map(g => ({ nome: g.nome, membros: g.membros.length })));
  if (!comp.valido) return { sucesso: false, mensagem: comp.mensagem };
  const existentes = new Set((await pool.request().input("r", sql.Int, rodizioId).input("de", sql.Date, v.dados.de)
    .query(`SELECT DataHora FROM EscalasServicos WHERE RodizioId = @r AND Status <> 'CANCELADA' AND CAST(DataHora AS DATE) >= @de`)).recordset.map(x => isoData(x.DataHora)));
  const plano = vol.planejarOcorrencias({ rodizio: ctx.rodizio, grupos: ctx.grupos, de: v.dados.de, ate: v.dados.ate, existentes });
  return { sucesso: true, ocorrencias: plano.ocorrencias, jaExistem: plano.jaExistem, de: v.dados.de, ate: v.dados.ate };
}

async function gerarRodizio(pool, { rodizioId, dados, por, hoje = hojeBrasilia(), deps }) {
  const v = vol.validarGeracao(dados, { hoje });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const ctx = await carregarContextoDeGeracao(pool, rodizioId);
  if (!ctx) return { sucesso: false, mensagem: "Rodízio não encontrado." };
  const { rodizio, grupos } = ctx;
  if (!rodizio.ativo) return { sucesso: false, mensagem: "O rodízio está desativado." };
  const comp = vol.validarComposicao(grupos.map(g => ({ nome: g.nome, membros: g.membros.length })));
  if (!comp.valido) return { sucesso: false, mensagem: comp.mensagem };

  const existentes = new Set((await pool.request().input("r", sql.Int, rodizioId).input("de", sql.Date, v.dados.de)
    .query(`SELECT DataHora FROM EscalasServicos WHERE RodizioId = @r AND Status <> 'CANCELADA' AND CAST(DataHora AS DATE) >= @de`)).recordset.map(x => isoData(x.DataHora)));
  const plano = vol.planejarOcorrencias({ rodizio, grupos, de: v.dados.de, ate: v.dados.ate, existentes });
  if (plano.ocorrencias.length === 0) return { sucesso: true, criados: [], jaExistem: plano.jaExistem, semCobertura: [], mensagem: "Nada novo para gerar neste período: as datas do rodízio já têm serviço." };

  // Quem pode ser convidado: membro ativo da equipe, que atende à formação exigida (v6.9) e não foi removido.
  const todos = [...new Set(grupos.flatMap(g => g.membros.map(m => m.membroId)))];
  const formacao = await trilhas.filtrarMembrosQueAtendem(pool, { contexto: "ESCALA_EQUIPE", alvoChave: String(rodizio.equipeId), membroIds: todos });
  const rInd = pool.request().input("de", sql.Date, v.dados.de).input("ate", sql.Date, v.dados.ate);
  const indisp = (await rInd.query(`SELECT MembroId, DataInicio, DataFim FROM EscalasIndisponibilidades WHERE DataFim >= @de AND DataInicio <= @ate AND MembroId IN (${listaIn(rInd, "m", todos)})`)).recordset;
  const indispPorMembro = new Map();
  for (const i of indisp) { if (!indispPorMembro.has(i.MembroId)) indispPorMembro.set(i.MembroId, []); indispPorMembro.get(i.MembroId).push({ dataInicio: i.DataInicio, dataFim: i.DataFim }); }

  const criados = [], semCobertura = [];
  const datasPorMembro = new Map();   // membroId -> [Date] (para o aviso)
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    // Quem está ativo na equipe é lido DENTRO da transação, com trava (UPDLOCK): uma remoção da escala que esteja acontecendo ao mesmo tempo espera
    // este "gerar" terminar (e então cancela as escalas novas) ou já terminou (e o removido nem é convidado). Antes, a leitura ficava fora e o
    // removido ainda recebia convite e aviso.
    const rEq = new sql.Request(transaction).input("e", sql.Int, rodizio.equipeId);
    const ativosNaEquipe = new Set((await rEq.query(`SELECT MembroId FROM EscalasEquipeMembros WITH (UPDLOCK, HOLDLOCK) WHERE EquipeId = @e AND Ativo = 1 AND MembroId IN (${listaIn(rEq, "m", todos)})`)).recordset.map(x => x.MembroId));
    for (const oc of plano.ocorrencias) {
      const grupo = grupos.find(g => g.grupoId === oc.grupoId);
      const dataHora = vol.dataHoraDeParede(oc.dataIso, rodizio.hora);
      const rs = await new sql.Request(transaction)
        .input("c", sql.Int, rodizio.congregacaoId).input("dh", sql.DateTime2, dataHora).input("desc", sql.NVarChar(200), `${rodizio.nome} — ${grupo.nome}`.slice(0, 200))
        .input("rod", sql.Int, rodizioId).input("gr", sql.Int, grupo.grupoId).input("pub", sql.Bit, v.dados.publicar ? 1 : 0).input("por", sql.Int, por)
        .query(`INSERT INTO EscalasServicos (CongregacaoId, DataHora, Descricao, Status, PublicadaEm, CriadoPorMembroId, RodizioId, RodizioGrupoId)
                VALUES (@c, @dh, @desc, CASE WHEN @pub = 1 THEN 'PUBLICADA' ELSE 'RASCUNHO' END, CASE WHEN @pub = 1 THEN SYSUTCDATETIME() ELSE NULL END, @por, @rod, @gr);
                SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`);
      const servicoId = rs.recordset[0].id;
      let convidados = 0;
      for (const m of grupo.membros) {
        let motivo = null;
        if (!ativosNaEquipe.has(m.membroId)) motivo = "não está mais ativo na equipe";
        else if (formacao.bloqueados.has(Number(m.membroId))) motivo = formacao.bloqueados.get(Number(m.membroId));
        else if (es.estaIndisponivelNaData(indispPorMembro.get(m.membroId) || [], oc.dataIso)) motivo = "declarou indisponibilidade nesta data";
        if (motivo) { semCobertura.push({ dataIso: oc.dataIso, grupoNome: grupo.nome, membroId: m.membroId, nome: m.nome, motivo }); continue; }
        await new sql.Request(transaction).input("s", sql.Int, servicoId).input("e", sql.Int, rodizio.equipeId).input("m", sql.Int, m.membroId)
          .query(`INSERT INTO EscalasAlocacoes (ServicoId, EquipeId, MembroId, Status, OrdemConvite) VALUES (@s, @e, @m, 'CONVIDADO', 1)`);
        convidados++;
        if (!datasPorMembro.has(m.membroId)) datasPorMembro.set(m.membroId, { grupoNome: grupo.nome, datas: [], nome: m.nome });
        datasPorMembro.get(m.membroId).datas.push(dataHora);
      }
      criados.push({ servicoId, dataIso: oc.dataIso, dataHora: dataHora.toISOString(), grupoId: grupo.grupoId, grupoNome: grupo.nome, convidados });
    }
    await new sql.Request(transaction).input("id", sql.Int, rodizioId).input("ate", sql.Date, plano.ocorrencias[plano.ocorrencias.length - 1].dataIso)
      .query(`UPDATE EscalasRodizios SET GeradoAte = CASE WHEN GeradoAte IS NULL OR GeradoAte < @ate THEN @ate ELSE GeradoAte END WHERE RodizioId = @id`);
    await transaction.commit();
  } catch (e) {
    await fecharTransacao(transaction, false);
    if (duplicado(e)) return { sucesso: false, mensagem: "Outra pessoa gerou este rodízio ao mesmo tempo. Atualize a tela e confira." };
    throw e;
  }
  await registrarAuditoria({ tabela: "EscalasRodizios", registroId: rodizioId, acao: "RODIZIO_GERADO", usuarioId: por,
    dadosDepois: { servicos: criados.length, de: v.dados.de, ate: v.dados.ate, publicado: v.dados.publicar, semCobertura: semCobertura.length } });

  let avisados = 0;
  if (v.dados.publicar) {
    const entradas = [...datasPorMembro];
    for (let i = 0; i < entradas.length; i += AVISOS_EM_PARALELO) {
      const lote = await Promise.all(entradas.slice(i, i + AVISOS_EM_PARALELO).map(async ([membroId, info]) => {
        const email = (await lerMembro(pool, membroId) || {}).Email;
        return notificarAgora(pool, {
          regraChave: "ESCALA_RODIZIO_ESCALADO", destinatarios: [{ membroId, email }],
          mensagem: vol.textoEscaladoNoRodizio({ rodizioNome: rodizio.nome, grupoNome: info.grupoNome, datas: info.datas }),
          referenciaId: criados[0].servicoId, referenciaTabela: "EscalasServicos", deps
        });
      }));
      avisados += lote.reduce((s, r) => s + (r.criadas || 0), 0);
    }
  }
  const nGrupos = new Set(criados.map(c => c.grupoId)).size;
  return {
    sucesso: true, criados, jaExistem: plano.jaExistem, semCobertura, avisados,
    mensagem: `${criados.length} serviço(s) gerado(s), alternando ${nGrupos} grupo(s)${v.dados.publicar ? " e já publicado(s)" : " como rascunho — confira e publique"}.${semCobertura.length ? ` Atenção: ${semCobertura.length} vaga(s) ficaram sem cobertura.` : ""}`
  };
}

// Desfaz a geração ainda não publicada (para ajustar os grupos e gerar de novo).
async function cancelarServicosFuturos(pool, { rodizio, por, hoje = hojeBrasilia() }) {
  const r = await pool.request().input("r", sql.Int, rodizio.rodizioId).input("hoje", sql.Date, hoje)
    .query(`SELECT ServicoId FROM EscalasServicos WHERE RodizioId = @r AND Status = 'RASCUNHO' AND CAST(DataHora AS DATE) >= @hoje`);
  const ids = r.recordset.map(x => x.ServicoId);
  if (ids.length === 0) return { sucesso: false, mensagem: "Não há serviço futuro em rascunho neste rodízio. O que já foi publicado não se cancela por aqui." };
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let cancelados = 0;
  try {
    // Só cancela o que AINDA é rascunho no instante da gravação (uma publicação feita ao mesmo tempo não é desfeita), e as alocações acompanham
    // exatamente os serviços que foram cancelados.
    const rq = new sql.Request(transaction);
    const lista = listaIn(rq, "s", ids);
    const res = await rq.query(`
      DECLARE @cancelados TABLE (ServicoId INT);
      UPDATE EscalasServicos SET Status = 'CANCELADA' OUTPUT INSERTED.ServicoId INTO @cancelados WHERE ServicoId IN (${lista}) AND Status = 'RASCUNHO';
      UPDATE a SET a.Status = 'CANCELADA' FROM EscalasAlocacoes a JOIN @cancelados c ON c.ServicoId = a.ServicoId WHERE a.Status IN (${STATUS_ATIVOS_SQL});
      SELECT COUNT(*) AS n FROM @cancelados;`);
    cancelados = res.recordset[0].n;
    await transaction.commit();
  } catch (e) { await fecharTransacao(transaction, false); throw e; }
  if (cancelados === 0) return { sucesso: false, mensagem: "Os serviços em rascunho foram publicados enquanto isto era feito: nada foi cancelado." };
  await registrarAuditoria({ tabela: "EscalasRodizios", registroId: rodizio.rodizioId, acao: "RODIZIO_FUTUROS_CANCELADOS", usuarioId: por, dadosDepois: { servicos: cancelados } });
  return { sucesso: true, cancelados, mensagem: `${cancelados} serviço(s) em rascunho cancelado(s). Ajuste os grupos e gere de novo.` };
}

// "Meu Painel": em quais rodízios a pessoa está, qual o grupo e as próximas datas do grupo dela.
async function meusRodizios(pool, { membroId, hoje = hojeBrasilia(), semanas = 26, maximo = 4 }) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT gm.GrupoId, gm.RodizioId FROM EscalasRodizioGrupoMembros gm
    JOIN EscalasRodizioGrupos g ON g.GrupoId = gm.GrupoId AND g.Ativo = 1
    JOIN EscalasRodizios r ON r.RodizioId = gm.RodizioId AND r.Ativo = 1
    WHERE gm.MembroId = @m AND gm.SaiuEm IS NULL`);
  const itens = [];
  for (const x of r.recordset) {
    const ctx = await carregarContextoDeGeracao(pool, x.RodizioId);
    if (!ctx) continue;
    const meu = ctx.grupos.find(g => g.grupoId === x.GrupoId);
    const plano = vol.planejarOcorrencias({ rodizio: ctx.rodizio, grupos: ctx.grupos, de: hoje, ate: cal.somarDias(hoje, semanas * 7) });
    itens.push({
      rodizioId: ctx.rodizio.rodizioId, rodizioNome: ctx.rodizio.nome, equipeNome: ctx.rodizio.equipeNome, rotuloDia: ctx.rodizio.rotuloDia, hora: ctx.rodizio.hora,
      grupoNome: meu ? meu.nome : null, totalGrupos: ctx.grupos.length,
      proximasDatas: plano.ocorrencias.filter(o => o.grupoId === x.GrupoId).slice(0, maximo).map(o => o.dataIso)
    });
  }
  return itens;
}

// ---------------------------------------------------------------
// Trava de habitualidade (Art. 135 §1º, II)
// ---------------------------------------------------------------

async function lerLimiteSequencia(pool) {
  return lerPrazoDias(pool, "ESCALA_HABITUALIDADE_SEQUENCIA", vol.LIMITE_SEQUENCIA_PADRAO);
}

// Para cada equipe operacional (zeladoria, portaria, cozinha): quem está nas últimas escalas SEGUIDAS. A janela vai de 90 dias atrás a 30 à frente,
// para pegar o padrão antes que ele se repita mais uma vez.
async function habitualidade(pool, { congregacaoId = null, hoje = hojeBrasilia() } = {}) {
  const limite = await lerLimiteSequencia(pool);
  const rq = pool.request().input("de", sql.Date, cal.somarDias(hoje, -90)).input("ate", sql.Date, cal.somarDias(hoje, 30));
  let filtro = "";
  if (congregacaoId) { rq.input("c", sql.Int, congregacaoId); filtro = "AND e.CongregacaoId = @c"; }
  const linhas = (await rq.query(`
    SELECT e.EquipeId, e.Nome AS EquipeNome, e.Natureza, e.CongregacaoId, e.LiderMembroId, s.ServicoId, s.DataHora, a.MembroId, a.Status, m.Nome AS MembroNome,
           CASE WHEN EXISTS (SELECT 1 FROM EscalasRodizios r WHERE r.EquipeId = e.EquipeId AND r.Ativo = 1) THEN 1 ELSE 0 END AS TemRodizio
    FROM EscalasAlocacoes a
    JOIN EscalasEquipes e ON e.EquipeId = a.EquipeId AND e.Ativa = 1 AND e.Natureza IN ('ZELADORIA','PORTARIA','COZINHA') ${filtro}
    JOIN EscalasServicos s ON s.ServicoId = a.ServicoId AND s.Status <> 'CANCELADA' AND CAST(s.DataHora AS DATE) BETWEEN @de AND @ate
    JOIN MembroReferencia m ON m.MembroId = a.MembroId`)).recordset;
  const equipes = new Map();
  for (const l of linhas) {
    if (!equipes.has(l.EquipeId)) equipes.set(l.EquipeId, { equipeId: l.EquipeId, equipeNome: l.EquipeNome, natureza: l.Natureza, congregacaoId: l.CongregacaoId, liderMembroId: l.LiderMembroId, temRodizio: !!l.TemRodizio, servicos: new Map(), nomes: new Map() });
    const eq = equipes.get(l.EquipeId);
    // O serviço conta para a equipe desde que ela tenha convidado alguém; só alocação ativa conta como "serviu".
    if (!eq.servicos.has(l.ServicoId)) eq.servicos.set(l.ServicoId, { servicoId: l.ServicoId, dataHora: l.DataHora, membroIds: [] });
    if (["CONVIDADO", "ACEITO", "CONFIRMADO"].includes(l.Status)) eq.servicos.get(l.ServicoId).membroIds.push(l.MembroId);
    eq.nomes.set(l.MembroId, l.MembroNome);
  }
  const resultado = [];
  for (const eq of equipes.values()) {
    const achados = vol.analisarHabitualidade({ servicos: [...eq.servicos.values()], limite });
    if (achados.length === 0) continue;
    resultado.push({
      equipeId: eq.equipeId, equipeNome: eq.equipeNome, natureza: eq.natureza, rotuloNatureza: vol.NATUREZAS[eq.natureza], congregacaoId: eq.congregacaoId,
      liderMembroId: eq.liderMembroId, temRodizio: eq.temRodizio, limite,
      itens: achados.map(a => ({ membroId: a.membroId, nome: eq.nomes.get(a.membroId), sequencia: a.sequencia, desde: isoInstante(a.desde), ate: isoInstante(a.ate) }))
    });
  }
  return resultado.sort((a, b) => a.equipeNome.localeCompare(b.equipeNome));
}

// ---------------------------------------------------------------
// Remoção da escala, reintegração e afastamento (Art. 133-D e Art. 133 §7º)
// ---------------------------------------------------------------

// `criarRequest`: para ler DENTRO de uma transação (o resultado enxerga o que outra transação já confirmou); sem ele, lê direto do pool.
async function alocacoesFuturas(pool, { membroId, equipeIds = null, de, ate = null, criarRequest = null }) {
  const rq = (criarRequest ? criarRequest() : pool.request()).input("m", sql.Int, membroId).input("de", sql.Date, de);
  let filtro = "";
  if (ate) { rq.input("ate", sql.Date, ate); filtro += " AND CAST(s.DataHora AS DATE) <= @ate"; }
  if (equipeIds) {
    if (equipeIds.length === 0) return [];
    filtro += ` AND a.EquipeId IN (${listaIn(rq, "e", equipeIds)})`;
  }
  const r = await rq.query(`
    SELECT a.AlocacaoId, a.ServicoId, a.EquipeId, a.Status, s.DataHora, s.Descricao, e.Nome AS EquipeNome, e.LiderMembroId
    FROM EscalasAlocacoes a JOIN EscalasServicos s ON s.ServicoId = a.ServicoId JOIN EscalasEquipes e ON e.EquipeId = a.EquipeId
    WHERE a.MembroId = @m AND a.Status IN (${STATUS_ATIVOS_SQL}) AND s.Status <> 'CANCELADA' AND CAST(s.DataHora AS DATE) >= @de ${filtro}
    ORDER BY s.DataHora`);
  return r.recordset.map(x => ({ alocacaoId: x.AlocacaoId, servicoId: x.ServicoId, equipeId: x.EquipeId, equipeNome: x.EquipeNome, liderMembroId: x.LiderMembroId, status: x.Status, dataHora: x.DataHora, descricao: x.Descricao }));
}

// Dentro de uma transação: cancela as alocações e recusa as trocas pendentes que dependiam delas (ou que traziam a pessoa como destino).
async function cancelarAlocacoes(transaction, { alocacoes, membroId, por, de, ate = null, equipeIds = null }) {
  if (alocacoes.length) {
    const rq = new sql.Request(transaction);
    await rq.query(`UPDATE EscalasAlocacoes SET Status = 'CANCELADA' WHERE AlocacaoId IN (${listaIn(rq, "a", alocacoes.map(a => a.alocacaoId))})`);
  }
  // Troca pendente que dependia das alocações canceladas, ou que trazia a pessoa como destino de um serviço dentro do mesmo recorte.
  const rt = new sql.Request(transaction).input("m", sql.Int, membroId).input("por", sql.Int, por).input("de", sql.Date, de);
  let recorte = `SELECT a2.AlocacaoId FROM EscalasAlocacoes a2 JOIN EscalasServicos s2 ON s2.ServicoId = a2.ServicoId WHERE CAST(s2.DataHora AS DATE) >= @de`;
  if (ate) { rt.input("ate", sql.Date, ate); recorte += " AND CAST(s2.DataHora AS DATE) <= @ate"; }
  if (equipeIds && equipeIds.length) recorte += ` AND a2.EquipeId IN (${listaIn(rt, "q", equipeIds)})`;
  const ids = alocacoes.map(a => a.alocacaoId);
  const condOrigem = ids.length ? `OR AlocacaoOrigemId IN (${listaIn(rt, "o", ids)})` : "";
  await rt.query(`UPDATE EscalasTrocas SET Status = 'RECUSADA', ObservacaoLider = N'Cancelada: o voluntário saiu da escala.', DecididaPorMembroId = @por, DecididaEm = SYSUTCDATETIME()
                  WHERE Status = 'PENDENTE' AND ((MembroDestinoId = @m AND AlocacaoOrigemId IN (${recorte})) ${condOrigem})`);
}

async function destinatarioMembro(pool, membroId) {
  const m = await lerMembro(pool, membroId);
  return m ? { membroId: m.MembroId, nome: m.Nome, email: m.Email } : null;
}

// `podeCongregacao(nome)`: o escopo de quem remove (null = sem restrição, quando o ator é o líder da equipe e `equipeId` já a fixa).
// Sem `equipeId`, remove da(s) equipe(s) ativa(s) que o ator alcança.
async function removerDaEscala(pool, { dados, equipeId = null, podeCongregacao = null, por, hoje = hojeBrasilia(), deps }) {
  const v = vol.validarRemocao({ membroId: dados.membroId, atorId: por, motivo: dados.motivo, tipoMotivo: dados.tipoMotivo });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  // As recusas abaixo NÃO citam o nome: quem lidera uma equipe (sem nenhuma permissão) poderia, tentando matrículas, descobrir o nome de toda a igreja.
  const naoAtivo = { sucesso: false, mensagem: equipeId ? "Esse voluntário não está ativo nessa equipe." : "Esse voluntário não está ativo em nenhuma equipe que você alcance." };
  const m = await lerMembro(pool, v.dados.membroId);
  if (!m) return naoAtivo;

  const rq = pool.request().input("m", sql.Int, v.dados.membroId);
  const memb = (await rq.query(`SELECT e.EquipeId, e.Nome, e.LiderMembroId, e.CongregacaoId, c.Nome AS CongregacaoNome FROM EscalasEquipeMembros em
                                JOIN EscalasEquipes e ON e.EquipeId = em.EquipeId JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoId
                                WHERE em.MembroId = @m AND em.Ativo = 1 AND e.Ativa = 1`)).recordset;
  let equipes = memb.filter(e => equipeId ? Number(e.EquipeId) === Number(equipeId) : true);
  if (podeCongregacao) equipes = equipes.filter(e => podeCongregacao(e.CongregacaoNome));
  if (equipes.length === 0) return naoAtivo;

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  const registros = [];
  try {
    // A porta de entrada é a própria desativação na equipe (só quem ainda está ativo sai): se duas pessoas removem ao mesmo tempo, a segunda
    // espera a primeira e não acha mais ninguém ativo — nada de registro de RH nem aviso em duplicata.
    const efetivas = [];
    for (const eq of equipes) {
      const u = await new sql.Request(transaction).input("e", sql.Int, eq.EquipeId).input("m", sql.Int, v.dados.membroId)
        .query(`UPDATE EscalasEquipeMembros SET Ativo = 0 WHERE EquipeId = @e AND MembroId = @m AND Ativo = 1`);
      if (u.rowsAffected && u.rowsAffected[0] > 0) efetivas.push(eq);
    }
    if (efetivas.length === 0) {
      await fecharTransacao(transaction, false);
      return { sucesso: false, mensagem: "Esse voluntário já foi removido dessa escala por outra pessoa." };
    }
    equipes = efetivas;
    const idsEfetivos = efetivas.map(e => e.EquipeId);
    // As escalas a cancelar são lidas aqui, depois da trava na equipe, DENTRO da transação: um "gerar" que acabou de confirmar já aparece.
    const aCancelar = await alocacoesFuturas(pool, { membroId: v.dados.membroId, equipeIds: idsEfetivos, de: hoje, criarRequest: () => new sql.Request(transaction) });
    await cancelarAlocacoes(transaction, { alocacoes: aCancelar, membroId: v.dados.membroId, por, de: hoje, equipeIds: idsEfetivos });
    for (const eq of equipes) {
      const proprias = aCancelar.filter(a => a.equipeId === eq.EquipeId);
      // A pessoa sai também dos grupos de rodízio dessa equipe: o revezamento segue com quem ficou.
      await new sql.Request(transaction).input("e", sql.Int, eq.EquipeId).input("m", sql.Int, v.dados.membroId)
        .query(`UPDATE gm SET SaiuEm = SYSUTCDATETIME() FROM EscalasRodizioGrupoMembros gm JOIN EscalasRodizios r ON r.RodizioId = gm.RodizioId
                WHERE r.EquipeId = @e AND gm.MembroId = @m AND gm.SaiuEm IS NULL`);
      const ins = await new sql.Request(transaction).input("m", sql.Int, v.dados.membroId).input("e", sql.Int, eq.EquipeId).input("t", sql.NVarChar(30), v.dados.tipoMotivo)
        .input("mot", sql.NVarChar(300), v.dados.motivo).input("por", sql.Int, por).input("n", sql.Int, proprias.length)
        .query(`INSERT INTO VoluntariosDesligamentos (MembroId, EquipeId, TipoMotivo, Motivo, RemovidoDaEscala, RegistradoPorMembroId, AlocacoesCanceladas)
                VALUES (@m, @e, @t, @mot, 1, @por, @n); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id`);
      registros.push({ desligamentoId: ins.recordset[0].id, equipe: eq, vagas: proprias });
    }
    await transaction.commit();
  } catch (e) { await fecharTransacao(transaction, false); throw e; }

  for (const reg of registros) {
    await registrarAuditoria({ tabela: "VoluntariosDesligamentos", registroId: reg.desligamentoId, acao: "REMOCAO_DA_ESCALA", usuarioId: por,
      // O texto livre do motivo fica só na ficha de RH (que pode ser anonimizada); a trilha de auditoria é imutável e não deve replicá-lo.
      dadosDepois: { membroId: v.dados.membroId, equipeId: reg.equipe.EquipeId, tipoMotivo: v.dados.tipoMotivo, motivoTamanho: v.dados.motivo.length, alocacoesCanceladas: reg.vagas.length } });
  }
  // Avisos na hora (Art. 133-D, III: "a partir de hoje"). O motivo NÃO vai no aviso do voluntário nem no do líder.
  await notificarAgora(pool, {
    regraChave: "ESCALA_ALTERACAO_PARTICIPACAO", destinatarios: [{ membroId: m.MembroId, email: m.Email }],
    mensagem: vol.textoAvisoRemocao({ equipes: registros.map(r => r.equipe.Nome), hoje }),
    referenciaId: registros[0].desligamentoId * 2, referenciaTabela: "VoluntariosDesligamentos", limiteDia: AVISOS_AO_VOLUNTARIO_POR_DIA, deps
  });
  for (const reg of registros) {
    if (!reg.equipe.LiderMembroId || reg.equipe.LiderMembroId === por || reg.equipe.LiderMembroId === m.MembroId) continue;
    const lider = await destinatarioMembro(pool, reg.equipe.LiderMembroId);
    if (!lider) continue;
    await notificarAgora(pool, {
      regraChave: "ESCALA_VAGA_ABERTA", destinatarios: [lider],
      mensagem: vol.textoVagaAberta({ membroNome: m.Nome, equipeNome: reg.equipe.Nome, vagas: reg.vagas, causa: "REMOCAO" }),
      referenciaId: reg.desligamentoId, referenciaTabela: "VoluntariosDesligamentos", deps
    });
  }
  const total = registros.reduce((s, r) => s + r.vagas.length, 0);
  return {
    sucesso: true, alocacoesCanceladas: total, desligamentoId: registros[0].desligamentoId,
    equipes: registros.map(r => ({ equipeId: r.equipe.EquipeId, nome: r.equipe.Nome, desligamentoId: r.desligamentoId, vagasAbertas: r.vagas.map(a => ({ servicoId: a.servicoId, dataHora: isoInstante(a.dataHora) })) })),
    mensagem: `${m.Nome} saiu da escala ${equipes.length === 1 ? `da equipe ${equipes[0].Nome}` : `de ${equipes.length} equipes`} a partir de hoje.${total ? ` ${total} escala(s) futura(s) cancelada(s) — as vagas foram avisadas ao líder.` : " Não havia escala futura marcada."} Nada disso abre processo disciplinar.`
  };
}

async function buscarRemocao(pool, desligamentoId) {
  const r = (await pool.request().input("id", sql.Int, desligamentoId).query(`
    SELECT d.*, m.Nome AS MembroNome, e.Nome AS EquipeNome, e.CongregacaoId, e.LiderMembroId
    FROM VoluntariosDesligamentos d JOIN MembroReferencia m ON m.MembroId = d.MembroId LEFT JOIN EscalasEquipes e ON e.EquipeId = d.EquipeId
    WHERE d.DesligamentoId = @id`)).recordset[0];
  return r || null;
}

async function reintegrar(pool, { desligamentoId, observacao, por, hoje = hojeBrasilia(), deps }) {
  const d = await buscarRemocao(pool, desligamentoId);
  if (!d) return { sucesso: false, mensagem: "Registro de remoção não encontrado." };
  if (!d.RemovidoDaEscala || !d.EquipeId) return { sucesso: false, mensagem: "Este registro não removeu ninguém de uma equipe: não há o que reintegrar." };
  if (d.ReintegradoEm) return { sucesso: false, mensagem: `${d.MembroNome} já foi reintegrado(a) em ${cal.formatarDataBr(isoData(d.ReintegradoEm))}.` };
  // Ninguém desfaz a própria remoção: quem decide é outra pessoa (a gestão, ou o líder da equipe que não seja o removido).
  if (Number(d.MembroId) === Number(por)) return { sucesso: false, proibido: true, mensagem: "Ninguém reintegra a si mesmo: peça a outra pessoa da liderança ou da gestão." };
  const obs = limpar(observacao);
  if (obs.length > 300) return { sucesso: false, mensagem: "A observação aceita até 300 caracteres." };
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const u = await new sql.Request(transaction).input("id", sql.Int, desligamentoId).input("por", sql.Int, por).input("obs", sql.NVarChar(300), obs || null)
      .query(`UPDATE VoluntariosDesligamentos SET ReintegradoEm = SYSUTCDATETIME(), ReintegradoPorMembroId = @por, ReintegracaoObs = @obs WHERE DesligamentoId = @id AND ReintegradoEm IS NULL`);
    if (u.rowsAffected && u.rowsAffected[0] === 0) { await fecharTransacao(transaction, false); return { sucesso: false, mensagem: "Este voluntário já foi reintegrado." }; }
    await new sql.Request(transaction).input("e", sql.Int, d.EquipeId).input("m", sql.Int, d.MembroId).query(`UPDATE EscalasEquipeMembros SET Ativo = 1 WHERE EquipeId = @e AND MembroId = @m`);
    await transaction.commit();
  } catch (e) { await fecharTransacao(transaction, false); throw e; }
  await registrarAuditoria({ tabela: "VoluntariosDesligamentos", registroId: desligamentoId, acao: "REINTEGRADO_NA_ESCALA", usuarioId: por, dadosDepois: { membroId: d.MembroId, equipeId: d.EquipeId, observacaoTamanho: obs.length } });
  const dest = await destinatarioMembro(pool, d.MembroId);
  if (dest) await notificarAgora(pool, { regraChave: "ESCALA_ALTERACAO_PARTICIPACAO", destinatarios: [dest], mensagem: vol.textoAvisoReintegracao({ equipeNome: d.EquipeNome, hoje }), referenciaId: desligamentoId * 2 + 1, referenciaTabela: "VoluntariosDesligamentos", limiteDia: AVISOS_AO_VOLUNTARIO_POR_DIA, deps });
  return { sucesso: true, mensagem: `${d.MembroNome} voltou à equipe ${d.EquipeNome}. As escalas canceladas não voltam sozinhas: o líder convida de novo. Se estava num grupo de rodízio, coloque-o(a) no grupo outra vez.` };
}

async function listarRemocoes(pool, { congregacaoId = null, membroId = null, equipeIds = null, limite = 200 }) {
  const rq = pool.request();
  let filtro = "WHERE d.RemovidoDaEscala = 1 AND d.EquipeId IS NOT NULL";
  if (congregacaoId) { rq.input("c", sql.Int, congregacaoId); filtro += " AND e.CongregacaoId = @c"; }
  if (membroId) { rq.input("m", sql.Int, membroId); filtro += " AND d.MembroId = @m"; }
  if (equipeIds) { if (!equipeIds.length) return []; filtro += ` AND d.EquipeId IN (${listaIn(rq, "e", equipeIds)})`; }
  const r = await rq.query(`SELECT TOP (${Number(limite) || 200}) d.DesligamentoId, d.MembroId, m.Nome AS MembroNome, d.EquipeId, e.Nome AS EquipeNome, d.TipoMotivo, d.Motivo, d.AlocacoesCanceladas, d.DesligadoEm,
      d.RegistradoPorMembroId, d.ReintegradoEm, d.ReintegracaoObs
    FROM VoluntariosDesligamentos d JOIN MembroReferencia m ON m.MembroId = d.MembroId JOIN EscalasEquipes e ON e.EquipeId = d.EquipeId ${filtro} ORDER BY d.DesligamentoId DESC`);
  return r.recordset.map(x => ({
    desligamentoId: x.DesligamentoId, membroId: x.MembroId, membroNome: x.MembroNome, equipeId: x.EquipeId, equipeNome: x.EquipeNome, tipoMotivo: x.TipoMotivo, motivo: x.Motivo,
    alocacoesCanceladas: x.AlocacoesCanceladas, desligadoEm: isoInstante(x.DesligadoEm), registradoPorMembroId: x.RegistradoPorMembroId,
    reintegradoEm: isoInstante(x.ReintegradoEm), reintegracaoObs: x.ReintegracaoObs, podeReintegrar: !x.ReintegradoEm
  }));
}

// As equipes que a pessoa LIDERA, com os voluntários ativos e as remoções recentes: é o que o dirigente da equipe precisa para
// "simplesmente informar" a remoção (Art. 133-D, III) sem depender de ter a permissão de escalas.
// Líder removido da equipe perde os poderes de líder dela até ser reintegrado: não aparece aqui, não remove nem reintegra (ver liderAtivo).
async function equipesLideradas(pool, { membroId }) {
  const eqs = (await pool.request().input("m", sql.Int, membroId).query(`
    SELECT e.EquipeId, e.Nome, e.Natureza, c.Nome AS CongregacaoNome FROM EscalasEquipes e JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoId
    WHERE e.LiderMembroId = @m AND e.Ativa = 1
      AND NOT EXISTS (SELECT 1 FROM VoluntariosDesligamentos d WHERE d.MembroId = e.LiderMembroId AND d.EquipeId = e.EquipeId AND d.RemovidoDaEscala = 1 AND d.ReintegradoEm IS NULL)
    ORDER BY c.Nome, e.Nome`)).recordset;
  if (eqs.length === 0) return [];
  const ids = eqs.map(e => e.EquipeId);
  const rq = pool.request();
  const membros = (await rq.query(`SELECT em.EquipeId, m.MembroId, m.Nome FROM EscalasEquipeMembros em JOIN MembroReferencia m ON m.MembroId = em.MembroId
                                   WHERE em.Ativo = 1 AND em.EquipeId IN (${listaIn(rq, "e", ids)}) ORDER BY m.Nome`)).recordset;
  const remocoes = await listarRemocoes(pool, { equipeIds: ids, limite: 100 });
  return eqs.map(e => ({
    equipeId: e.EquipeId, nome: e.Nome, congregacaoNome: e.CongregacaoNome, natureza: e.Natureza, rotuloNatureza: vol.NATUREZAS[e.Natureza],
    membros: membros.filter(x => x.EquipeId === e.EquipeId).map(x => ({ membroId: x.MembroId, nome: x.Nome })),
    remocoes: remocoes.filter(r => r.equipeId === e.EquipeId)
  }));
}

// Afastamento temporário (Art. 133 §7º, II): as escalas que já estavam marcadas no período são liberadas, sem penalidade, e a vaga é avisada ao líder.
async function conflitosDoAfastamento(pool, { membroId, dataInicio, dataFim, hoje = hojeBrasilia() }) {
  const de = dataInicio > hoje ? dataInicio : hoje;
  if (dataFim < de) return [];
  return alocacoesFuturas(pool, { membroId, de, ate: dataFim });
}

async function liberarPorAfastamento(pool, { membroId, dataInicio, dataFim, por, hoje = hojeBrasilia(), deps }) {
  const alocs = await conflitosDoAfastamento(pool, { membroId, dataInicio, dataFim, hoje });
  if (alocs.length === 0) return { liberadas: 0, vagas: [] };
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  const de = dataInicio > hoje ? dataInicio : hoje;
  try { await cancelarAlocacoes(transaction, { alocacoes: alocs, membroId, por, de, ate: dataFim }); await transaction.commit(); }
  catch (e) { await fecharTransacao(transaction, false); throw e; }
  const nome = await nomeDe(pool, membroId);
  await registrarAuditoria({ tabela: "EscalasAlocacoes", registroId: alocs[0].alocacaoId, acao: "AFASTAMENTO_ESCALAS_LIBERADAS", usuarioId: por, dadosDepois: { membroId, dataInicio, dataFim, alocacoes: alocs.map(a => a.alocacaoId) } });
  const porEquipe = new Map();
  for (const a of alocs) { if (!porEquipe.has(a.equipeId)) porEquipe.set(a.equipeId, []); porEquipe.get(a.equipeId).push(a); }
  for (const [, lista] of porEquipe) {
    const lider = lista[0].liderMembroId;
    if (!lider || lider === membroId) continue;
    const dest = await destinatarioMembro(pool, lider);
    if (!dest) continue;
    await notificarAgora(pool, {
      regraChave: "ESCALA_VAGA_ABERTA", destinatarios: [dest],
      mensagem: vol.textoVagaAberta({ membroNome: nome, equipeNome: lista[0].equipeNome, vagas: lista, causa: "AFASTAMENTO" }),
      referenciaId: lista[0].alocacaoId, referenciaTabela: "EscalasAlocacoes", deps
    });
  }
  return { liberadas: alocs.length, vagas: alocs.map(a => ({ servicoId: a.servicoId, equipeId: a.equipeId, equipeNome: a.equipeNome, dataHora: isoInstante(a.dataHora) })) };
}

// Serviço de rodízio: quem recusa não dispara o convite em cadeia (que traria alguém de fora do grupo da vez). O líder é avisado e decide.
async function avisarRecusaEmRodizio(pool, { alocacao, servico, deps }) {
  const eq = await es.buscarEquipe(pool, alocacao.equipeId);
  if (!eq || !eq.liderMembroId || Number(eq.liderMembroId) === Number(alocacao.membroId)) return { criadas: 0 };
  const lider = await destinatarioMembro(pool, eq.liderMembroId);
  if (!lider) return { criadas: 0 };
  return notificarAgora(pool, {
    regraChave: "ESCALA_VAGA_ABERTA", destinatarios: [lider],
    mensagem: vol.textoVagaAberta({ membroNome: await nomeDe(pool, alocacao.membroId), equipeNome: eq.nome, vagas: [{ dataHora: servico.dataHora }], causa: "RECUSA" }),
    referenciaId: alocacao.alocacaoId, referenciaTabela: "EscalasAlocacoes", deps
  });
}

// ---------------------------------------------------------------
// Avisos periódicos (motor vB.2)
// ---------------------------------------------------------------

function chaveMensal(hoje) {
  const [a, m] = hoje.split("-").map(Number);
  return (a - 2000) * 12 + m;
}

async function destinatariosDaEquipe(pool, { liderMembroId, congregacaoId }) {
  const psc = require("./psc");
  const mapa = new Map();
  for (const d of await psc.resolverDestinatariosDaCongregacao(pool, { permissao: "escalas", congregacaoId })) mapa.set(d.membroId, { membroId: d.membroId, nome: d.nome, email: d.email });
  if (liderMembroId && !mapa.has(liderMembroId)) { const l = await destinatarioMembro(pool, liderMembroId); if (l) mapa.set(l.membroId, l); }
  return [...mapa.values()];
}

// Um aviso por equipe e por mês enquanto a situação durar.
async function detectarHabitualidade(pool, { hoje = hojeBrasilia() } = {}) {
  const achados = await habitualidade(pool, { hoje });
  const fatos = [];
  for (const a of achados) {
    const destinatarios = await destinatariosDaEquipe(pool, { liderMembroId: a.liderMembroId, congregacaoId: a.congregacaoId });
    if (destinatarios.length === 0) continue;
    fatos.push({ referenciaId: a.equipeId * 10000 + chaveMensal(hoje), destinatarios, fatoGerador: vol.textoHabitualidade({ equipeNome: a.equipeNome, itens: a.itens, limite: a.limite }) });
  }
  return fatos;
}

// Voluntários escalados sem Termo de Adesão registrado: um aviso por congregação e por mês, para quem cuida da habilitação.
async function detectarTermosPendentes(pool, { hoje = hojeBrasilia() } = {}) {
  const r = await pool.request().query(`
    SELECT e.CongregacaoId, c.Nome AS CongregacaoNome, m.MembroId, m.Nome
    FROM EscalasEquipeMembros em
    JOIN EscalasEquipes e ON e.EquipeId = em.EquipeId AND e.Ativa = 1
    JOIN Congregacoes c ON c.CongregacaoId = e.CongregacaoId
    JOIN MembroReferencia m ON m.MembroId = em.MembroId
    LEFT JOIN VoluntariadoAdesoes a ON a.MembroId = m.MembroId
    WHERE em.Ativo = 1 AND a.AdesaoId IS NULL
    GROUP BY e.CongregacaoId, c.Nome, m.MembroId, m.Nome ORDER BY e.CongregacaoId, m.Nome`);
  const porCong = new Map();
  for (const x of r.recordset) {
    if (!porCong.has(x.CongregacaoId)) porCong.set(x.CongregacaoId, { nome: x.CongregacaoNome, nomes: [] });
    porCong.get(x.CongregacaoId).nomes.push(x.Nome);
  }
  const psc = require("./psc");
  const fatos = [];
  for (const [congregacaoId, info] of porCong) {
    const destinatarios = (await psc.resolverDestinatariosDaCongregacao(pool, { permissao: "habilitacao_voluntarios", congregacaoId })).map(d => ({ membroId: d.membroId, nome: d.nome, email: d.email }));
    if (destinatarios.length === 0) continue;
    const quem = info.nomes.slice(0, 5).join(", ") + (info.nomes.length > 5 ? ` e mais ${info.nomes.length - 5}` : "");
    fatos.push({
      referenciaId: congregacaoId * 10000 + chaveMensal(hoje), destinatarios,
      fatoGerador: `${info.nomes.length} voluntário(s) de ${info.nome} servem em escalas sem o Termo de Adesão registrado (Lei 9.608/98, art. 2º): ${quem}. Peça o aceite em Meu Painel, registre a ficha/mensagem ou ratifique uma lista (Regimento Art. 133 §8º). Menor de 18 anos adere pela ficha assinada pelo responsável.`
    });
  }
  return fatos;
}

module.exports = {
  LIMITE_LISTA, nomeDoMembro: nomeDe,
  mapearAdesao, buscarAdesao, situacaoDoTermo, aceitarDigital, registrarAdesaoManual, ratificar, listarRatificacoes, coberturaDoTermo, anonimizarIpsVencidos, dadosDoTitular,
  definirNaturezaEquipe, removidoDaEquipe, liderAtivo, lideraAlgumaEquipe, mensagemRemovido,
  buscarRodizio, listarRodizios, detalharRodizio, criarRodizio, alterarAtivoRodizio, buscarGrupo, criarGrupo, adicionarMembroAoGrupo, removerMembroDoGrupo, desativarGrupo,
  previaGeracao, gerarRodizio, cancelarServicosFuturos, meusRodizios,
  habitualidade, lerLimiteSequencia,
  alocacoesFuturas, removerDaEscala, buscarRemocao, reintegrar, listarRemocoes, equipesLideradas, conflitosDoAfastamento, liberarPorAfastamento, avisarRecusaEmRodizio,
  detectarHabitualidade, detectarTermosPendentes
};
