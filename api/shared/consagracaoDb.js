// shared/consagracaoDb.js (v8.3 — Consagração e documentação)
// O banco da esteira de consagração depois do protocolo. A regra pura está em shared/consagracao.js; o desenho, em docs/plano/fase-8-ministerial-afm.md.
//
// - PARECER DO CEI (PareceresCEIConsagracao): um por processo (índice único). APTO leva à homologação; INAPTO arquiva (Art. 9º §2º). A fundamentação é sigilosa: só a
//   rota do CEI a lê. Processo que já estava "aguardando homologação" antes da v8.3, sem parecer, também recebe o parecer (senão ficaria parado para sempre).
// - HOMOLOGAÇÃO: o Presidente valida a lista (Auxiliar, Missionário(a), Diácono — com o ato e a data) ou a CLI homologa em plenário (Presbítero, Evangelista, Pastor —
//   com a reunião da CLI já encerrada). Os requisitos da escada são conferidos de novo a cada passo (como na v8.2).
// - TAXA (Art. 75, I): registrada pela Secretaria ou pela tesouraria no processo aprovado; vale para a cerimônia se paga até 45 dias antes e no valor dela.
// - CERIMÔNIA (Art. 75): a Comissão de Unção, os candidatos (processos homologados), o roteiro e o registro da presença — numa transação só, com a trava de cada
//   candidato ("escada_<pessoa>", a mesma da v8.2): presente e com a taxa em dia → consagrado (cargo, histórico, CHM usado e o diploma); ausente → perde naquele ano;
//   sem a taxa em dia ou com um requisito que caiu → volta para a fila (continua homologado, fora da cerimônia).
const { sql } = require("./db");
const regra = require("./consagracao");
const escada = require("./escada");
const escadaDb = require("./escadaDb");
const certificados = require("./certificados");
const estatuto = require("./estatuto");
const trilhas = require("./trilhas");
const afm = require("./afm");
const { obterTrava } = require("./financeiroSeguro");
const { registrarAuditoria } = require("./auditoria");
const { hojeBrasilia } = require("./dataBrasilia");
const { violouUnicidade } = require("./violacaoUnica");

const { NAO_EXISTE, MUDOU, fecharTransacao, dia, ORIGEM_DA_MODALIDADE } = escadaDb;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ehGuid = (v) => typeof v === "string" && GUID.test(v);
const alvoValido = (c) => (c && escada.ESCADA.includes(c) && c !== "MEMBRO" ? c : null);
const numero = (v) => (v == null ? null : Number(v));

const SELECT_PROCESSO = `
  SELECT c.ConsagracaoId, c.Numero, c.MembroId, m.Nome, c.Status, c.Assunto, ISNULL(c.CargoAlvo, t.CargoMinisterialResultante) AS CargoAlvo,
         ISNULL(c.Modalidade, N'INDICACAO') AS Modalidade, CONVERT(varchar(10), c.DataProtocolo, 120) AS DataProtocolo, m.EstadoCivil,
         CASE WHEN m.FotoUrl IS NULL OR m.FotoUrl = N'' THEN 0 ELSE 1 END AS TemFoto, cg.Nome AS Congregacao, ex.Nome AS Extensao,
         c.CerimoniaId, CONVERT(varchar(10), c.TaxaPagaEm, 120) AS TaxaPagaEm, c.TaxaValor, c.TaxaForma, c.DiplomaCodigo,
         CONVERT(varchar(10), c.HomologadoEm, 120) AS HomologadoEm, CONVERT(varchar(10), p.SabatinaEm, 120) AS ParecerEm,
         (SELECT COUNT(*) FROM Casamentos k WHERE k.MembroId = c.MembroId OR k.MembroConjugeId = c.MembroId) AS Casamentos, p.Resultado AS ParecerResultado,
         (SELECT COUNT(*) FROM AnexosGenericos a WHERE a.Tabela = N'Consagracoes' AND a.RegistroId = c.Numero) AS Documentos
  FROM Consagracoes c
  JOIN MembroReferencia m ON m.MembroId = c.MembroId
  LEFT JOIN TiposConsagracao t ON t.Nome = c.Assunto
  LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
  LEFT JOIN ExtensoesTenda ex ON ex.ExtensaoId = m.ExtensaoId
  LEFT JOIN PareceresCEIConsagracao p ON p.ConsagracaoId = c.ConsagracaoId`;

function mapearProcesso(l) {
  return {
    consagracaoId: l.ConsagracaoId, numero: l.Numero, membroId: Number(l.MembroId), nome: l.Nome, status: l.Status, assunto: l.Assunto,
    cargoAlvo: alvoValido(l.CargoAlvo), modalidade: l.Modalidade, dataProtocolo: l.DataProtocolo, estadoCivil: l.EstadoCivil || null,
    temFoto: !!l.TemFoto, documentos: Number(l.Documentos) || 0, congregacaoNome: l.Congregacao || null, extensaoNome: l.Extensao || null,
    cerimoniaId: numero(l.CerimoniaId), taxaPagaEm: l.TaxaPagaEm || null, taxaValor: l.TaxaValor == null ? null : Number(l.TaxaValor), taxaForma: l.TaxaForma || null,
    diplomaCodigo: l.DiplomaCodigo || null, homologadoEm: l.HomologadoEm || null, parecer: l.ParecerResultado || null, parecerEm: l.ParecerEm || null,
    casamentos: Number(l.Casamentos) || 0
  };
}

// `conexao`: o pool ou a transação.
async function carregarProcesso(conexao, consagracaoId) {
  if (!ehGuid(consagracaoId)) return null;
  const r = await new sql.Request(conexao).input("id", sql.UniqueIdentifier, consagracaoId).query(`${SELECT_PROCESSO} WHERE c.ConsagracaoId = @id`);
  return r.recordset[0] ? mapearProcesso(r.recordset[0]) : null;
}

// Art. 74, II — a proposta digital: foto atualizada (a do cadastro) e cópia dos documentos pessoais (anexo do processo). O certificado da Academia é o CHM, que o
// sistema já confere na escada.
function faltaNoDossie(p) {
  const faltas = [];
  if (!p.temFoto) faltas.push("a foto atualizada (no cadastro da pessoa)");
  if (!p.documentos) faltas.push("a cópia dos documentos pessoais (em \"Documentos\" do processo)");
  return faltas.length ? `Para enviar ao CEI falta ${faltas.join(" e ")} (Regimento, Art. 74, II).` : null;
}

// A escada e a formação conferidas de novo (cada passo da esteira é um "avanço" — v6.9 e v8.2). `sessao`: quem age, para mascarar a disciplina de quem não a vê.
async function conferirDeNovo(conexao, p, sessao) {
  const conf = await escadaDb.avaliar(conexao, { membroId: p.membroId, assunto: p.assunto, modalidade: p.modalidade, alvo: p.cargoAlvo });
  if (conf.avaliacao && conf.avaliacao.bloqueado) {
    const ve = escadaDb.veDisciplinaDe(sessao, { congregacaoNome: p.congregacaoNome, extensaoNome: p.extensaoNome });
    return { sucesso: false, mensagem: conf.avaliacao.mensagemBloqueio, requisitos: ve ? conf.avaliacao : escada.mascararParaEscopo(conf.avaliacao) };
  }
  const formacao = await trilhas.avaliarRequisitos(conexao, { contexto: "CONSAGRACAO", alvoChave: p.assunto, membroId: p.membroId });
  if (formacao.bloqueado) return { sucesso: false, mensagem: formacao.mensagemBloqueio, formacao };
  return { sucesso: true, retrato: conf.avaliacao ? escada.retrato(conf.avaliacao, hojeBrasilia()) : null };
}

// ============================== CEI ==============================

const SQL_AGUARDA_CEI = `ISNULL(c.CargoAlvo, t.CargoMinisterialResultante) IS NOT NULL
  AND (c.Status = N'EM_ANALISE_CONSELHO' OR (c.Status = N'AGUARDANDO_PLENARIO' AND p.ParecerId IS NULL))`;

// A fila do CEI: o que espera parecer, com o que o formulário precisa saber (sabatina, escrutínio, Pastor não casado).
// Quem é do CEI e também candidato não vê o próprio processo (nem o estado civil dele na fila) — revisão independente, 28/10/2026.
async function filaDoCEI(pool, eu) {
  const r = await pool.request().input("eu", sql.Int, Number(eu) || 0).query(`${SELECT_PROCESSO} WHERE ${SQL_AGUARDA_CEI} AND c.MembroId <> @eu ORDER BY c.DataProtocolo, m.Nome`);
  return r.recordset.map(mapearProcesso).filter((p) => p.cargoAlvo).map((p) => ({
    consagracaoId: p.consagracaoId, numero: p.numero, membroId: p.membroId, nome: p.nome, congregacao: p.congregacaoNome, assunto: p.assunto,
    cargoAlvo: p.cargoAlvo, cargoAlvoRotulo: escada.ROTULO_CARGO[p.cargoAlvo], modalidade: p.modalidade, dataProtocolo: p.dataProtocolo, status: p.status,
    estadoCivil: p.estadoCivil, sabatina: regra.homologacaoPelaCLI(p.cargoAlvo), escrutinio: regra.precisaEscrutinio(p.estadoCivil, false, p.casamentos),
    excecaoPastor: regra.precisaExcecaoPastor(p.cargoAlvo, p.estadoCivil), documentos: p.documentos
  }));
}

async function registrarParecer(pool, { consagracaoId, corpo, usuario, sessao }) {
  const p = await carregarProcesso(pool, consagracaoId);
  if (!p) return NAO_EXISTE;
  if (!p.cargoAlvo) return { sucesso: false, mensagem: "Este processo não leva a um cargo: não passa pelo parecer do CEI." };
  const legado = p.status === "AGUARDANDO_PLENARIO" && !p.parecer;
  if (p.status !== "EM_ANALISE_CONSELHO" && !legado) return MUDOU("Este processo não está aguardando o parecer do CEI. Atualize a lista.");
  if (Number(p.membroId) === Number(usuario.membroId)) return { sucesso: false, mensagem: "Ninguém dá parecer no próprio processo." };
  const v = regra.validarParecer(corpo, { alvo: p.cargoAlvo, estadoCivil: p.estadoCivil, casamentos: p.casamentos, hojeIso: hojeBrasilia(), dataProtocolo: p.dataProtocolo });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const pa = v.parecer;
  const apto = pa.resultado === "APTO";
  let retrato = null;
  if (apto) {
    const c = await conferirDeNovo(pool, p, sessao);
    if (!c.sucesso) return c;
    retrato = c.retrato;
  }
  const hoje = hojeBrasilia();
  const r = await escadaDb.comTravaDaPessoa(pool, p.membroId, async (t) => {
    try {
      await new sql.Request(t).input("id", sql.UniqueIdentifier, consagracaoId).input("res", sql.NVarChar(8), pa.resultado).input("sab", sql.Date, pa.sabatinaEm)
        .input("fund", sql.NVarChar(2000), pa.fundamentacao).input("vp", sql.Bit, pa.sabatinaVidaPregressa).input("fin", sql.Bit, pa.sabatinaFinanceira).input("dou", sql.Bit, pa.sabatinaDoutrina)
        .input("esc", sql.Bit, pa.escrutinioConjugal ? 1 : 0).input("escF", sql.NVarChar(20), pa.escrutinioFundamento).input("escD", sql.Bit, pa.escrutinioDocumental)
        .input("rec", sql.Bit, pa.recasado).input("est", sql.Bit, pa.casamentoAtualEstavel).input("exc", sql.NVarChar(500), pa.excecaoPastorNaoCasado).input("por", sql.Int, usuario.membroId)
        .query(`INSERT INTO PareceresCEIConsagracao (ConsagracaoId, Resultado, SabatinaEm, Fundamentacao, SabatinaVidaPregressa, SabatinaFinanceira, SabatinaDoutrina,
                  EscrutinioConjugal, EscrutinioFundamento, EscrutinioDocumental, Recasado, CasamentoAtualEstavel, ExcecaoPastorNaoCasado, EmitidoPor)
                VALUES (@id, @res, @sab, @fund, @vp, @fin, @dou, @esc, @escF, @escD, @rec, @est, @exc, @por)`);
    } catch (e) {
      if (violouUnicidade(e)) return MUDOU("O CEI já deu o parecer deste processo. Atualize a lista.");
      throw e;
    }
    const upd = await new sql.Request(t).input("id", sql.UniqueIdentifier, consagracaoId).input("etapa", sql.NVarChar(30), p.status).input("hoje", sql.Date, hoje)
      .input("retrato", sql.NVarChar(4000), retrato)
      .query(apto
        ? `UPDATE Consagracoes SET Status = N'AGUARDANDO_PLENARIO', RequisitosRetrato = ISNULL(@retrato, RequisitosRetrato) WHERE ConsagracaoId = @id AND Status = @etapa`
        : `UPDATE Consagracoes SET Status = N'REPROVADO', MotivoEncerramento = N'INAPTO_CEI', DataConclusao = @hoje WHERE ConsagracaoId = @id AND Status = @etapa`);
    if (!upd.rowsAffected[0]) return MUDOU("Este processo mudou de etapa enquanto isso. Atualize a lista.");
    return { sucesso: true };
  });
  if (!r.sucesso) return r;
  // a fundamentação não vai para a auditoria (sigilo do CEI)
  await registrarAuditoria({ tabela: "Consagracoes", registroId: p.membroId, acao: `CEI_PARECER_${pa.resultado}`, usuarioId: usuario.membroId,
    dadosDepois: { consagracaoId, resultado: pa.resultado, sabatinaEm: pa.sabatinaEm, escrutinioConjugal: pa.escrutinioConjugal } });
  return { sucesso: true, mensagem: apto
    ? `Parecer APTO registrado: o processo segue para a homologação (${regra.homologacaoPelaCLI(p.cargoAlvo) ? "da CLI em plenário" : "do Pastor Presidente"}).`
    : "Parecer INAPTO registrado: o processo foi arquivado (Regimento, Art. 9º §2º)." };
}

// O parecer inteiro (só a rota do CEI chama).
async function lerParecer(pool, consagracaoId, eu) {
  if (!ehGuid(consagracaoId)) return null;
  // o próprio parecer, não: a mesma resposta de "não encontrado"
  const r = await pool.request().input("id", sql.UniqueIdentifier, consagracaoId).input("eu", sql.Int, Number(eu) || 0).query(`
    SELECT p.*, CONVERT(varchar(10), p.SabatinaEm, 120) AS Sabatina, e.Nome AS EmitidoPorNome
    FROM PareceresCEIConsagracao p JOIN Consagracoes c ON c.ConsagracaoId = p.ConsagracaoId LEFT JOIN MembroReferencia e ON e.MembroId = p.EmitidoPor
    WHERE p.ConsagracaoId = @id AND c.MembroId <> @eu`);
  const l = r.recordset[0];
  if (!l) return null;
  return {
    resultado: l.Resultado, sabatinaEm: l.Sabatina, fundamentacao: l.Fundamentacao, emitidoPor: l.EmitidoPorNome, emitidoEm: l.EmitidoEm,
    sabatina: l.SabatinaVidaPregressa === null ? null : { vidaPregressa: !!l.SabatinaVidaPregressa, regularidadeFinanceira: !!l.SabatinaFinanceira, alinhamentoDoutrinario: !!l.SabatinaDoutrina },
    escrutinio: l.EscrutinioConjugal ? { fundamento: l.EscrutinioFundamento, documental: l.EscrutinioDocumental, recasado: l.Recasado, casamentoEstavel: l.CasamentoAtualEstavel } : null,
    excecaoPastorNaoCasado: l.ExcecaoPastorNaoCasado
  };
}

// ============================== Homologação ==============================

// As reuniões da CLI já encerradas (para a homologação em plenário), as mais recentes primeiro.
async function reunioesCLIEncerradas(pool) {
  const r = await pool.request().query(`
    SELECT TOP 40 s.SessaoId, CONVERT(varchar(10), s.DataSessao, 120) AS DataSessao, s.Descricao, s.TipoSessao
    FROM Sessoes s JOIN Orgaos o ON o.OrgaoId = s.OrgaoId
    WHERE o.Sigla = N'CLI' AND s.Status = N'ENCERRADA'
    ORDER BY s.DataSessao DESC, s.SessaoId DESC`);
  return r.recordset.map((l) => ({ sessaoId: l.SessaoId, data: l.DataSessao, descricao: l.Descricao, tipo: l.TipoSessao }));
}

async function homologar(pool, { ids, sessaoId, ato, data, usuario, sessao }) {
  const hoje = hojeBrasilia();
  let reuniao = null;
  if (sessaoId != null && sessaoId !== "") {
    const r = await pool.request().input("s", sql.Int, Number(sessaoId)).query(`
      SELECT s.SessaoId, CONVERT(varchar(10), s.DataSessao, 120) AS DataSessao, s.Status FROM Sessoes s JOIN Orgaos o ON o.OrgaoId = s.OrgaoId
      WHERE s.SessaoId = @s AND o.Sigla = N'CLI'`);
    reuniao = r.recordset[0] || null;
    if (!reuniao || reuniao.Status !== "ENCERRADA" || reuniao.DataSessao > hoje) return { sucesso: false, mensagem: "Escolha uma reunião da CLI já realizada e encerrada." };
  }
  let atoTexto = null;
  let dataAto = null;
  if (ato != null && ato !== "") {
    const a = afm.textoObrigatorio(ato, { minimo: 3, maximo: 200, rotulo: "O ato da Presidência" });
    if (!a.valido) return { sucesso: false, mensagem: a.mensagem };
    atoTexto = a.texto;
    const d = afm.dataDoAto(data, hoje, "a data da validação do Pastor Presidente");
    if (!d.valido) return { sucesso: false, mensagem: d.mensagem };
    dataAto = d.data;
  }
  const resultados = [];
  for (const id of ids) {
    const p = await carregarProcesso(pool, id);
    const falha = (mensagem) => resultados.push({ consagracaoId: id, nome: p ? p.nome : null, sucesso: false, mensagem });
    if (!p) { falha("Processo não encontrado."); continue; }
    if (!p.cargoAlvo || p.status !== "AGUARDANDO_PLENARIO") { falha("Não está aguardando homologação."); continue; }
    if (p.parecer !== "APTO") { falha("Ainda sem o parecer APTO do CEI (Regimento, Art. 74, III)."); continue; }
    if (Number(p.membroId) === Number(usuario.membroId)) { falha("Ninguém homologa o próprio processo."); continue; }
    const pelaCLI = regra.homologacaoPelaCLI(p.cargoAlvo);
    if (pelaCLI && !reuniao) { falha("Presbítero, Evangelista e Pastor: a homologação é da CLI em plenário — escolha a reunião (Regimento, Art. 7º, III)."); continue; }
    if (pelaCLI && reuniao.DataSessao < p.dataProtocolo) { falha("A reunião da CLI escolhida é anterior ao protocolo do processo."); continue; }
    if (!pelaCLI && !atoTexto) { falha("Auxiliar, Missionário(a) e Diácono: informe o ato e a data da validação do Pastor Presidente (Regimento, Art. 74, IV)."); continue; }
    if (!pelaCLI && dataAto < p.dataProtocolo) { falha("A validação do Pastor Presidente não pode ser anterior ao protocolo."); continue; }
    // o APTO vai à homologação (Art. 9º §2º e §3º): a homologação não é anterior ao parecer
    if (p.parecerEm && (pelaCLI ? reuniao.DataSessao : dataAto) < p.parecerEm) { falha(`A homologação não pode ser anterior ao parecer do CEI (${regra.br(p.parecerEm)}).`); continue; }
    const c = await conferirDeNovo(pool, p, sessao);
    if (!c.sucesso) { resultados.push({ consagracaoId: id, nome: p.nome, sucesso: false, mensagem: c.mensagem, requisitos: c.requisitos }); continue; }
    const quando = pelaCLI ? reuniao.DataSessao : dataAto;
    const upd = await pool.request().input("id", sql.UniqueIdentifier, id).input("em", sql.Date, quando).input("por", sql.Int, usuario.membroId)
      .input("s", sql.Int, pelaCLI ? reuniao.SessaoId : null).input("ato", sql.NVarChar(200), pelaCLI ? null : atoTexto).input("retrato", sql.NVarChar(4000), c.retrato)
      .query(`UPDATE Consagracoes SET Status = N'HOMOLOGADO', HomologadoEm = @em, HomologadoPor = @por, HomologacaoSessaoId = @s, HomologacaoAto = @ato,
                RequisitosRetrato = ISNULL(@retrato, RequisitosRetrato)
              WHERE ConsagracaoId = @id AND Status = N'AGUARDANDO_PLENARIO'`);
    if (!upd.rowsAffected[0]) { falha("Este processo mudou de etapa enquanto isso."); continue; }
    await registrarAuditoria({ tabela: "Consagracoes", registroId: p.membroId, acao: "CONSAGRACAO_HOMOLOGADA", usuarioId: usuario.membroId,
      dadosDepois: { consagracaoId: id, cargoAlvo: p.cargoAlvo, homologadoEm: quando, sessaoId: pelaCLI ? reuniao.SessaoId : null, ato: pelaCLI ? null : atoTexto } });
    resultados.push({ consagracaoId: id, nome: p.nome, sucesso: true, mensagem: "Homologado." });
  }
  const ok = resultados.filter((x) => x.sucesso).length;
  return { sucesso: ok > 0, resultados, mensagem: ok === resultados.length ? `${ok === 1 ? "Processo homologado" : `${ok} processos homologados`}: agora esperam a cerimônia.` : `${ok} de ${resultados.length} homologado(s). Veja os que não passaram.` };
}

// ============================== Taxa ==============================

async function registrarTaxa(pool, { consagracaoId, taxa, usuario }) {
  const p = await carregarProcesso(pool, consagracaoId);
  if (!p) return NAO_EXISTE;
  if (!p.cargoAlvo) return { sucesso: false, mensagem: "Este processo não leva a um cargo: não há taxa de consagração." };
  if (!["AGUARDANDO_PLENARIO", "HOMOLOGADO"].includes(p.status)) return { sucesso: false, mensagem: "A taxa é do candidato aprovado pelo CEI (Regimento, Art. 75, I, a)." };
  if (Number(p.membroId) === Number(usuario.membroId)) return { sucesso: false, mensagem: "Ninguém registra a própria taxa." };
  const upd = await pool.request().input("id", sql.UniqueIdentifier, consagracaoId).input("em", sql.Date, taxa ? taxa.pagoEm : null)
    .input("v", sql.Decimal(10, 2), taxa ? taxa.valor : null).input("f", sql.NVarChar(10), taxa ? taxa.forma : null).input("por", sql.Int, taxa ? usuario.membroId : null)
    .query(`UPDATE Consagracoes SET TaxaPagaEm = @em, TaxaValor = @v, TaxaForma = @f, TaxaRegistradaPor = @por
            WHERE ConsagracaoId = @id AND Status IN (N'AGUARDANDO_PLENARIO', N'HOMOLOGADO')`);
  if (!upd.rowsAffected[0]) return MUDOU("Este processo mudou de etapa enquanto isso. Atualize a lista.");
  await registrarAuditoria({ tabela: "Consagracoes", registroId: p.membroId, acao: taxa ? "CONSAGRACAO_TAXA_REGISTRADA" : "CONSAGRACAO_TAXA_REMOVIDA", usuarioId: usuario.membroId,
    dadosAntes: { pagoEm: p.taxaPagaEm, valor: p.taxaValor, forma: p.taxaForma }, dadosDepois: taxa ? { consagracaoId, ...taxa } : { consagracaoId } });
  return { sucesso: true, mensagem: taxa ? `Taxa registrada: R$ ${regra.moeda(taxa.valor)} em ${regra.br(taxa.pagoEm)} (${regra.FORMAS_TAXA[taxa.forma]}). O lançamento no caixa é da tesouraria, no financeiro.` : "Registro da taxa removido." };
}

// ============================== Cerimônia ==============================

function mapearCerimonia(l) {
  return {
    cerimoniaId: l.CerimoniaId, dataCerimonia: dia(l.DataCerimonia), local: l.Local, ocasiao: l.Ocasiao, ocasiaoRotulo: regra.OCASIOES[l.Ocasiao] || l.Ocasiao,
    valorTaxa: Number(l.ValorTaxa), status: l.Status, motivoCancelamento: l.MotivoCancelamento || null, prazoTaxa: regra.prazoDaTaxa(dia(l.DataCerimonia))
  };
}

async function carregarCerimonia(conexao, cerimoniaId, { travar = false } = {}) {
  const r = await new sql.Request(conexao).input("id", sql.Int, Number(cerimoniaId))
    .query(`SELECT * FROM CerimoniasConsagracao ${travar ? "WITH (UPDLOCK, HOLDLOCK)" : ""} WHERE CerimoniaId = @id`);
  return r.recordset[0] ? mapearCerimonia(r.recordset[0]) : null;
}

async function listarCerimonias(pool) {
  const r = await pool.request().query(`
    SELECT TOP 60 ce.*,
      (SELECT COUNT(*) FROM Consagracoes c WHERE c.CerimoniaId = ce.CerimoniaId AND c.Status = N'HOMOLOGADO') AS Candidatos,
      (SELECT COUNT(*) FROM Consagracoes c WHERE c.CerimoniaId = ce.CerimoniaId AND c.Status = N'CONCLUIDO') AS Consagrados,
      (SELECT COUNT(*) FROM CerimoniasComissaoUncao u WHERE u.CerimoniaId = ce.CerimoniaId) AS Comissao
    FROM CerimoniasConsagracao ce ORDER BY ce.DataCerimonia DESC, ce.CerimoniaId DESC`);
  return r.recordset.map((l) => ({ ...mapearCerimonia(l), candidatos: l.Candidatos, consagrados: l.Consagrados, comissao: l.Comissao }));
}

async function criarCerimonia(pool, { dados, por }) {
  const r = await pool.request().input("d", sql.Date, dados.dataCerimonia).input("l", sql.NVarChar(200), dados.local).input("o", sql.NVarChar(12), dados.ocasiao)
    .input("v", sql.Decimal(10, 2), dados.valorTaxa).input("por", sql.Int, por)
    .query(`INSERT INTO CerimoniasConsagracao (DataCerimonia, Local, Ocasiao, ValorTaxa, CriadaPor) OUTPUT INSERTED.CerimoniaId VALUES (@d, @l, @o, @v, @por)`);
  const cerimoniaId = r.recordset[0].CerimoniaId;
  await registrarAuditoria({ tabela: "CerimoniasConsagracao", registroId: cerimoniaId, acao: "CERIMONIA_CRIADA", usuarioId: por, dadosDepois: dados });
  return { sucesso: true, cerimoniaId, mensagem: `Cerimônia criada. A taxa precisa estar paga até ${regra.br(regra.prazoDaTaxa(dados.dataCerimonia))} (45 dias antes — Regimento, Art. 75, I, b).` };
}

// `fazer(t, cerimonia)` com a cerimônia travada e ainda PLANEJADA.
async function comCerimoniaPlanejada(pool, cerimoniaId, fazer) {
  const t = new sql.Transaction(pool);
  await t.begin();
  try {
    const ce = await carregarCerimonia(t, cerimoniaId, { travar: true });
    if (!ce) { await fecharTransacao(t, false); return NAO_EXISTE; }
    if (ce.status !== "PLANEJADA") { await fecharTransacao(t, false); return MUDOU("Esta cerimônia já foi registrada ou cancelada."); }
    const r = await fazer(t, ce);
    await fecharTransacao(t, !(r && r.sucesso === false));
    return r;
  } catch (e) { await fecharTransacao(t, false); throw e; }
}

async function editarCerimonia(pool, { cerimoniaId, dados, por }) {
  const r = await comCerimoniaPlanejada(pool, cerimoniaId, async (t, ce) => {
    const depois = await new sql.Request(t).input("id", sql.Int, Number(cerimoniaId)).input("d", sql.Date, dados.dataCerimonia)
      .query(`SELECT TOP 1 m.Nome FROM Consagracoes c JOIN MembroReferencia m ON m.MembroId = c.MembroId
              WHERE c.CerimoniaId = @id AND c.Status = N'HOMOLOGADO' AND c.HomologadoEm > @d`);
    if (depois.recordset[0]) return { sucesso: false, mensagem: `${depois.recordset[0].Nome} foi homologado(a) depois dessa data: a cerimônia não pode ser antes da homologação.` };
    await new sql.Request(t).input("id", sql.Int, Number(cerimoniaId)).input("d", sql.Date, dados.dataCerimonia).input("l", sql.NVarChar(200), dados.local)
      .input("o", sql.NVarChar(12), dados.ocasiao).input("v", sql.Decimal(10, 2), dados.valorTaxa)
      .query(`UPDATE CerimoniasConsagracao SET DataCerimonia = @d, Local = @l, Ocasiao = @o, ValorTaxa = @v WHERE CerimoniaId = @id`);
    return { sucesso: true, antes: ce };
  });
  if (!r.sucesso) return r;
  await registrarAuditoria({ tabela: "CerimoniasConsagracao", registroId: Number(cerimoniaId), acao: "CERIMONIA_ALTERADA", usuarioId: por, dadosAntes: r.antes, dadosDepois: dados });
  const mudouData = r.antes.dataCerimonia !== dados.dataCerimonia;
  return { sucesso: true, mensagem: `Cerimônia alterada.${mudouData ? " A data mudou: imprima os diplomas de novo (eles levam a data)." : ""}` };
}

async function cancelarCerimonia(pool, { cerimoniaId, motivo, por }) {
  const r = await comCerimoniaPlanejada(pool, cerimoniaId, async (t) => {
    await new sql.Request(t).input("id", sql.Int, Number(cerimoniaId)).input("m", sql.NVarChar(300), motivo)
      .query(`UPDATE CerimoniasConsagracao SET Status = N'CANCELADA', MotivoCancelamento = @m WHERE CerimoniaId = @id`);
    const solt = await new sql.Request(t).input("id", sql.Int, Number(cerimoniaId))
      .query(`UPDATE Consagracoes SET CerimoniaId = NULL, DiplomaCodigo = NULL WHERE CerimoniaId = @id AND Status = N'HOMOLOGADO'`);
    return { sucesso: true, soltos: solt.rowsAffected[0] || 0 };
  });
  if (!r.sucesso) return r;
  await registrarAuditoria({ tabela: "CerimoniasConsagracao", registroId: Number(cerimoniaId), acao: "CERIMONIA_CANCELADA", usuarioId: por, dadosDepois: { motivo, candidatosDevolvidos: r.soltos } });
  return { sucesso: true, mensagem: `Cerimônia cancelada. ${r.soltos} candidato(s) voltaram para a fila dos homologados.` };
}

const listaDeIds = (ids) => [...new Set(ids.map(Number))].filter((n) => Number.isInteger(n) && n > 0).join(",");

// As pessoas (para a Comissão de Unção), com a situação de comunhão.
async function pessoasPorId(conexao, membroIds) {
  const lista = listaDeIds(membroIds);
  if (!lista) return [];
  const r = await new sql.Request(conexao).query(`
    SELECT MembroId, Nome, CargoMinisterial, Status, SituacaoMembro, CONVERT(varchar(10), DataNascimento, 120) AS DataNascimento, CONVERT(varchar(10), DataAdmissao, 120) AS DataAdmissao
    FROM MembroReferencia WHERE MembroId IN (${lista})`);
  return r.recordset.map((l) => ({
    membroId: Number(l.MembroId), nome: l.Nome, cargo: l.CargoMinisterial, status: l.Status,
    emComunhao: estatuto.calcularCapacidadeEleitoral({ situacaoMembro: l.SituacaoMembro, status: l.Status, dataNascimento: l.DataNascimento, dataAdmissao: l.DataAdmissao }).emComunhao
  }));
}

// `travar`: dentro da transação do registro, lê o que está gravado agora e segura as linhas (com o "instantâneo" do Azure SQL, a leitura comum pode trazer a versão de
// antes de uma taxa corrigida ou de um código de diploma reservado por outra tela — revisão independente, 28/10/2026).
async function candidatosDaCerimonia(conexao, cerimoniaId, { travar = false } = {}) {
  const r = await new sql.Request(conexao).input("c", sql.Int, Number(cerimoniaId))
    .query(`${travar ? SELECT_PROCESSO.replace(/FROM Consagracoes c(\r?\n)/, "FROM Consagracoes c WITH (UPDLOCK, ROWLOCK)$1") : SELECT_PROCESSO} WHERE c.CerimoniaId = @c AND c.Status = N'HOMOLOGADO' ORDER BY m.Nome`);
  return r.recordset.map(mapearProcesso);
}

async function comissaoDaCerimonia(conexao, cerimoniaId) {
  const r = await new sql.Request(conexao).input("c", sql.Int, Number(cerimoniaId)).query(`SELECT MembroId FROM CerimoniasComissaoUncao WHERE CerimoniaId = @c`);
  return pessoasPorId(conexao, r.recordset.map((l) => l.MembroId));
}

async function definirComissao(pool, { cerimoniaId, membroIds, por }) {
  const ids = [...new Set(membroIds.map(Number))];
  const r = await comCerimoniaPlanejada(pool, cerimoniaId, async (t) => {
    const pessoas = await pessoasPorId(t, ids);
    if (pessoas.length !== ids.length) {
      const achados = new Set(pessoas.map((p) => p.membroId));
      return { sucesso: false, mensagem: `Matrícula não encontrada: ${ids.filter((i) => !achados.has(i)).join(", ")}.` };
    }
    const candidatos = new Set((await candidatosDaCerimonia(t, cerimoniaId)).map((p) => p.membroId));
    const v = regra.validarComissao(pessoas, candidatos);
    if (v.problemas.length) return { sucesso: false, mensagem: `A Comissão de Unção é de pastores titulares em atividade (Regimento, Art. 75, IV, c): ${v.problemas.join("; ")}.` };
    await new sql.Request(t).input("c", sql.Int, Number(cerimoniaId)).query(`DELETE FROM CerimoniasComissaoUncao WHERE CerimoniaId = @c`);
    for (const p of pessoas) {
      await new sql.Request(t).input("c", sql.Int, Number(cerimoniaId)).input("m", sql.Int, p.membroId)
        .query(`INSERT INTO CerimoniasComissaoUncao (CerimoniaId, MembroId) VALUES (@c, @m)`);
    }
    return { sucesso: true, quantos: pessoas.length };
  });
  if (!r.sucesso) return r;
  await registrarAuditoria({ tabela: "CerimoniasConsagracao", registroId: Number(cerimoniaId), acao: "CERIMONIA_COMISSAO", usuarioId: por, dadosDepois: { membroIds: ids } });
  const falta = regra.MINIMO_COMISSAO_UNCAO - r.quantos;
  return { sucesso: true, mensagem: falta > 0 ? `Comissão salva com ${r.quantos}. Faltam ${falta} para o mínimo de ${regra.MINIMO_COMISSAO_UNCAO} (Regimento, Art. 75, IV, c).` : `Comissão de Unção salva (${r.quantos} pastores).` };
}

async function incluirCandidatos(pool, { cerimoniaId, ids, por }) {
  const r = await comCerimoniaPlanejada(pool, cerimoniaId, async (t, ce) => {
    const resultados = [];
    for (const id of ids) {
      const upd = await new sql.Request(t).input("id", sql.UniqueIdentifier, id).input("c", sql.Int, Number(cerimoniaId)).input("por", sql.Int, por).input("d", sql.Date, ce.dataCerimonia)
        .query(`UPDATE c SET CerimoniaId = @c FROM Consagracoes c
                WHERE c.ConsagracaoId = @id AND c.Status = N'HOMOLOGADO' AND c.CerimoniaId IS NULL AND c.MembroId <> @por
                  AND (c.HomologadoEm IS NULL OR c.HomologadoEm <= @d)
                  AND NOT EXISTS (SELECT 1 FROM CerimoniasComissaoUncao u WHERE u.CerimoniaId = @c AND u.MembroId = c.MembroId)`);
      resultados.push({ consagracaoId: id, sucesso: !!upd.rowsAffected[0] });
    }
    return { sucesso: true, resultados };
  });
  if (!r.sucesso) return r;
  const ok = r.resultados.filter((x) => x.sucesso).length;
  await registrarAuditoria({ tabela: "CerimoniasConsagracao", registroId: Number(cerimoniaId), acao: "CERIMONIA_CANDIDATOS_INCLUIDOS", usuarioId: por, dadosDepois: { incluidos: r.resultados.filter((x) => x.sucesso).map((x) => x.consagracaoId) } });
  return { sucesso: ok > 0, resultados: r.resultados, mensagem: ok === ids.length ? `${ok} candidato(s) incluído(s) na cerimônia.` : `${ok} de ${ids.length} incluído(s): os outros já estão em outra cerimônia, não estão homologados, foram homologados depois da data desta cerimônia, são da comissão ou são você.` };
}

async function retirarCandidato(pool, { cerimoniaId, consagracaoId, por }) {
  const r = await comCerimoniaPlanejada(pool, cerimoniaId, async (t) => {
    const upd = await new sql.Request(t).input("id", sql.UniqueIdentifier, consagracaoId).input("c", sql.Int, Number(cerimoniaId))
      .query(`UPDATE Consagracoes SET CerimoniaId = NULL, DiplomaCodigo = NULL WHERE ConsagracaoId = @id AND CerimoniaId = @c AND Status = N'HOMOLOGADO'`);
    return upd.rowsAffected[0] ? { sucesso: true } : MUDOU("Este candidato não está nesta cerimônia. Atualize a tela.");
  });
  if (!r.sucesso) return r;
  await registrarAuditoria({ tabela: "CerimoniasConsagracao", registroId: Number(cerimoniaId), acao: "CERIMONIA_CANDIDATO_RETIRADO", usuarioId: por, dadosDepois: { consagracaoId } });
  return { sucesso: true, mensagem: "Candidato retirado: volta para a fila dos homologados." };
}

// Os pares de cônjuges entre as pessoas da lista (Art. 75, III, b), pelos casamentos registrados.
async function conjugesEntre(conexao, membroIds) {
  const lista = listaDeIds(membroIds);
  if (!lista) return [];
  // só o casamento mais recente de cada um conta (o registro não tem "fim": o ex-cônjuge não fica lado a lado — revisão independente, 28/10/2026)
  const r = await new sql.Request(conexao).query(`
    SELECT k.MembroId, k.MembroConjugeId FROM Casamentos k
    WHERE k.MembroConjugeId IS NOT NULL AND k.MembroId IN (${lista}) AND k.MembroConjugeId IN (${lista})
      AND NOT EXISTS (SELECT 1 FROM Casamentos d WHERE d.DataCasamento > k.DataCasamento
                      AND (d.MembroId IN (k.MembroId, k.MembroConjugeId) OR d.MembroConjugeId IN (k.MembroId, k.MembroConjugeId)))`);
  return r.recordset.map((l) => [Number(l.MembroId), Number(l.MembroConjugeId)]);
}

async function detalheCerimonia(pool, cerimoniaId) {
  const ce = await carregarCerimonia(pool, cerimoniaId);
  if (!ce) return null;
  const comissao = await comissaoDaCerimonia(pool, cerimoniaId);
  if (ce.status !== "PLANEJADA") {
    const r = await pool.request().input("c", sql.Int, Number(cerimoniaId)).query(`
      ${SELECT_PROCESSO.replace("p.Resultado AS ParecerResultado,", "p.Resultado AS ParecerResultado, c.PresenteCerimonia, c.DiplomaCertificadoId, c.MotivoEncerramento,")}
      WHERE c.CerimoniaId = @c AND c.Status IN (N'CONCLUIDO', N'REPROVADO') ORDER BY m.Nome`);
    return { cerimonia: ce, comissao, resultado: r.recordset.map((l) => ({ ...mapearProcesso(l), presente: l.PresenteCerimonia === null ? null : !!l.PresenteCerimonia,
      diplomaCertificadoId: l.DiplomaCertificadoId || null, motivoEncerramento: l.MotivoEncerramento || null, cargoAlvoRotulo: escada.ROTULO_CARGO[alvoValido(l.CargoAlvo)] || null })) };
  }
  const candidatos = await candidatosDaCerimonia(pool, cerimoniaId);
  const roteiro = regra.montarRoteiro(ce, candidatos, await conjugesEntre(pool, candidatos.map((p) => p.membroId)));
  const disp = await pool.request().query(`${SELECT_PROCESSO} WHERE c.Status = N'HOMOLOGADO' AND c.CerimoniaId IS NULL ORDER BY m.Nome`);
  return {
    cerimonia: ce, comissao, comissaoValida: regra.validarComissao(comissao, new Set(candidatos.map((p) => p.membroId))),
    candidatos: candidatos.map((p) => ({ consagracaoId: p.consagracaoId, membroId: p.membroId, nome: p.nome, cargoAlvo: p.cargoAlvo, cargoAlvoRotulo: escada.ROTULO_CARGO[p.cargoAlvo],
      modalidade: p.modalidade, taxaPagaEm: p.taxaPagaEm, taxaValor: p.taxaValor, taxa: regra.situacaoDaTaxa(p, ce), diplomaImpresso: !!p.diplomaCodigo })),
    roteiro,
    disponiveis: disp.recordset.map(mapearProcesso).filter((p) => p.cargoAlvo).map((p) => ({ consagracaoId: p.consagracaoId, membroId: p.membroId, nome: p.nome,
      cargoAlvoRotulo: escada.ROTULO_CARGO[p.cargoAlvo], taxa: regra.situacaoDaTaxa(p, ce) }))
  };
}

// Os diplomas para imprimir antes da cerimônia (Art. 75, IV, e — "a entrega do Certificado (Diploma)"): só de quem está com a taxa em dia. Cada um ganha o código de
// verificação agora (reservado; o certificado nasce com ele na conclusão — até lá a verificação pública não o encontra).
async function diplomasParaImprimir(pool, cerimoniaId) {
  const ce = await carregarCerimonia(pool, cerimoniaId);
  if (!ce) return NAO_EXISTE;
  if (ce.status !== "PLANEJADA") return MUDOU("Esta cerimônia já foi registrada ou cancelada: os diplomas emitidos estão em Meus Certificados de cada pessoa.");
  const candidatos = (await candidatosDaCerimonia(pool, cerimoniaId)).filter((p) => regra.situacaoDaTaxa(p, ce).emDia);
  if (!candidatos.length) return { sucesso: false, mensagem: "Nenhum candidato com a taxa em dia nesta cerimônia." };
  const saida = [];
  for (const p of candidatos) {
    let codigo = p.diplomaCodigo;
    for (let tentativa = 1; !codigo && tentativa <= 3; tentativa++) {
      const novo = certificados.gerarCodigoVerificacao();
      try {
        const upd = await pool.request().input("id", sql.UniqueIdentifier, p.consagracaoId).input("cod", sql.NVarChar(20), novo).input("c", sql.Int, Number(cerimoniaId))
          .query(`UPDATE Consagracoes SET DiplomaCodigo = @cod WHERE ConsagracaoId = @id AND CerimoniaId = @c AND Status = N'HOMOLOGADO' AND DiplomaCodigo IS NULL
                    AND NOT EXISTS (SELECT 1 FROM CertificadosEmitidos e WHERE e.CodigoVerificacao = @cod)`);
        if (upd.rowsAffected[0]) codigo = novo;
        else codigo = (await carregarProcesso(pool, p.consagracaoId) || {}).diplomaCodigo || null;   // outra impressão ao mesmo tempo já reservou (ou o código colidiu)
      } catch (e) { if (!violouUnicidade(e) || tentativa === 3) throw e; }
    }
    if (!codigo) continue;
    saida.push({ nome: p.nome, membroId: p.membroId, codigo, ...regra.textoDiploma({ cargoAlvo: p.cargoAlvo, modalidade: p.modalidade, dataCerimonia: ce.dataCerimonia, ocasiao: ce.ocasiao }) });
  }
  return { sucesso: true, cerimonia: ce, diplomas: saida };
}

// O registro da cerimônia: quem estava presente. Tudo ou nada (uma transação), com a cerimônia e cada candidato travados.
// `presentes` e `ausentes`: a lista INTEIRA que a Secretaria classificou. Quem não está em nenhuma das duas (incluído por outra tela depois que ela abriu a cerimônia) faz o
// registro voltar sem mudar nada — ninguém perde o ano por um nome que a Secretaria não viu (revisão independente, 28/10/2026).
async function registrarCerimonia(pool, { cerimoniaId, presentes, ausentes, usuario, sessao }) {
  const hoje = hojeBrasilia();
  const ce0 = await carregarCerimonia(pool, cerimoniaId);
  if (!ce0) return NAO_EXISTE;
  if (ce0.status !== "PLANEJADA") return MUDOU("Esta cerimônia já foi registrada ou cancelada.");
  if (ce0.dataCerimonia > hoje) return { sucesso: false, mensagem: `A presença se registra no dia da cerimônia (${regra.br(ce0.dataCerimonia)}) ou depois.` };
  const candidatos0 = await candidatosDaCerimonia(pool, cerimoniaId);
  if (!candidatos0.length) return { sucesso: false, mensagem: "Nenhum candidato nesta cerimônia." };
  const ids = new Set(candidatos0.map((p) => String(p.consagracaoId).toLowerCase()));
  const marcados = new Set(presentes.map((x) => String(x).toLowerCase()));
  const faltaram = new Set(ausentes.map((x) => String(x).toLowerCase()));
  const listaConfere = (conjunto) => [...marcados].every((x) => !faltaram.has(x)) && marcados.size + faltaram.size === conjunto.size && [...conjunto].every((x) => marcados.has(x) || faltaram.has(x));
  if ([...marcados].some((x) => !ids.has(x))) return MUDOU("Há presença marcada para quem não está nesta cerimônia. Atualize a tela.");
  if (!listaConfere(ids)) return MUDOU("A lista de candidatos desta cerimônia mudou desde que você a abriu (ou falta marcar alguém). Abra a cerimônia de novo e confira a presença de todos.");
  if (candidatos0.some((p) => Number(p.membroId) === Number(usuario.membroId))) return { sucesso: false, mensagem: "Quem é candidato nesta cerimônia não registra a presença dela." };
  // A formação exigida (v6.9) é conferida ANTES da transação: a leitura dela usa outra conexão, que esperaria pelas linhas que a transação já gravou.
  const formacaoTravada = new Map();
  for (const p of candidatos0.filter((x) => marcados.has(String(x.consagracaoId).toLowerCase()))) {
    const f = await trilhas.avaliarRequisitos(pool, { contexto: "CONSAGRACAO", alvoChave: p.assunto, membroId: p.membroId });
    if (f.bloqueado) formacaoTravada.set(String(p.consagracaoId).toLowerCase(), f.mensagemBloqueio);
  }

  const t = new sql.Transaction(pool);
  await t.begin();
  let resultados;
  let ce;
  try {
    ce = await carregarCerimonia(t, cerimoniaId, { travar: true });
    if (!ce || ce.status !== "PLANEJADA") { await fecharTransacao(t, false); return MUDOU("Esta cerimônia já foi registrada ou cancelada."); }
    const comissao = await comissaoDaCerimonia(t, cerimoniaId);
    const quem = await candidatosDaCerimonia(t, cerimoniaId);
    for (const id of [...new Set(quem.map((p) => p.membroId))].sort((a, b) => a - b)) {
      if (!(await obterTrava(() => new sql.Request(t), `escada_${id}`))) { await fecharTransacao(t, false); return MUDOU("Outra alteração de um dos candidatos está em andamento. Tente de novo."); }
    }
    // relidos com trava (a taxa, o código reservado do diploma e a etapa de agora)
    const candidatos = await candidatosDaCerimonia(t, cerimoniaId, { travar: true });
    // vetados ou reprovados em outra tela enquanto isso: sem ninguém, a cerimônia não vira "realizada" vazia
    if (!candidatos.length) { await fecharTransacao(t, false); return MUDOU("Os candidatos desta cerimônia mudaram enquanto isso. Atualize a tela."); }
    // quem saiu (veto, reprovação) pode sair; quem entrou sem a Secretaria ver, não
    const agora = new Set(candidatos.map((p) => String(p.consagracaoId).toLowerCase()));
    if ([...agora].some((x) => !marcados.has(x) && !faltaram.has(x))) { await fecharTransacao(t, false); return MUDOU("A lista de candidatos desta cerimônia mudou enquanto isso. Abra a cerimônia de novo e confira a presença de todos."); }
    const v = regra.validarComissao(comissao, new Set(candidatos.map((p) => p.membroId)));
    if (!v.valida) {
      await fecharTransacao(t, false);
      return { sucesso: false, mensagem: `A Comissão de Unção precisa de pelo menos ${regra.MINIMO_COMISSAO_UNCAO} pastores titulares em atividade (Regimento, Art. 75, IV, c)${v.problemas.length ? `: ${v.problemas.join("; ")}` : `; hoje tem ${v.validos}`}.` };
    }
    await new sql.Request(t).input("id", sql.Int, Number(cerimoniaId)).input("por", sql.Int, usuario.membroId)
      .query(`UPDATE CerimoniasConsagracao SET Status = N'REALIZADA', RealizadaPor = @por, RealizadaEm = SYSUTCDATETIME() WHERE CerimoniaId = @id`);
    resultados = [];
    for (const p of candidatos) {
      const base = { consagracaoId: p.consagracaoId, membroId: p.membroId, nome: p.nome, cargoAlvo: p.cargoAlvo };
      const devolver = async (motivo, extra = {}) => {
        await new sql.Request(t).input("id", sql.UniqueIdentifier, p.consagracaoId)
          .query(`UPDATE Consagracoes SET CerimoniaId = NULL, DiplomaCodigo = NULL WHERE ConsagracaoId = @id AND Status = N'HOMOLOGADO'`);
        resultados.push({ ...base, resultado: "VOLTOU", motivo, ...extra });
      };
      const taxa = regra.situacaoDaTaxa(p, ce);
      if (!taxa.emDia) { await devolver(`${taxa.motivo}: volta para a fila (Regimento, Art. 75, I, c)`); continue; }
      // a consagração não fica com data anterior à homologação (cerimônia criada com data passada — revisão independente, 28/10/2026)
      if (p.homologadoEm && p.homologadoEm > ce.dataCerimonia) { await devolver(`homologado em ${regra.br(p.homologadoEm)}, depois da data desta cerimônia: volta para a fila`); continue; }
      if (!marcados.has(String(p.consagracaoId).toLowerCase())) {
        const upd = await new sql.Request(t).input("id", sql.UniqueIdentifier, p.consagracaoId).input("d", sql.Date, ce.dataCerimonia)
          .query(`UPDATE Consagracoes SET Status = N'REPROVADO', MotivoEncerramento = N'AUSENCIA_CERIMONIA', PresenteCerimonia = 0, DataConclusao = @d, DiplomaCodigo = NULL
                  WHERE ConsagracaoId = @id AND Status = N'HOMOLOGADO'`);
        if (upd.rowsAffected[0]) resultados.push({ ...base, resultado: "AUSENTE", motivo: "Ausente: perde a consagração neste ano; novo processo só no ano que vem (Regimento, Art. 75, II, b)." });
        continue;
      }
      const formacao = formacaoTravada.get(String(p.consagracaoId).toLowerCase());
      if (formacao) { await devolver(`a formação exigida não está em dia (${formacao}): volta para a fila`); continue; }
      const conf = await escadaDb.avaliar(t, { membroId: p.membroId, assunto: p.assunto, modalidade: p.modalidade, alvo: p.cargoAlvo });
      if (!conf.avaliacao || conf.avaliacao.bloqueado) {
        const ve = escadaDb.veDisciplinaDe(sessao, { congregacaoNome: p.congregacaoNome, extensaoNome: p.extensaoNome });
        const av = conf.avaliacao ? (ve ? conf.avaliacao : escada.mascararParaEscopo(conf.avaliacao)) : null;
        await devolver(`um requisito deixou de valer (${(av && av.mensagemBloqueio) || "pessoa não encontrada"}): volta para a fila`, { requisitos: av });
        continue;
      }
      // nem antes da entrada no cargo atual (o histórico não pode ter um cargo que começa antes do anterior)
      if (conf.dados && conf.dados.cargoDesde && conf.dados.cargoDesde > ce.dataCerimonia) {
        await devolver(`no cargo atual desde ${regra.br(conf.dados.cargoDesde)}, depois da data desta cerimônia: volta para a fila`);
        continue;
      }
      const concluiu = await new sql.Request(t).input("id", sql.UniqueIdentifier, p.consagracaoId).input("d", sql.Date, ce.dataCerimonia)
        .input("retrato", sql.NVarChar(4000), escada.retrato(conf.avaliacao, hoje))
        .query(`UPDATE Consagracoes SET Status = N'CONCLUIDO', DataConclusao = @d, PresenteCerimonia = 1, RequisitosRetrato = @retrato
                WHERE ConsagracaoId = @id AND Status = N'HOMOLOGADO'`);
      if (!concluiu.rowsAffected[0]) continue;   // reprovado em outra tela enquanto isso
      // o CHM foi para ESTA subida (Art. 67 §1º): a matrícula perde o CHM e o documento é revogado
      const mat = (await new sql.Request(t).input("m", sql.Int, p.membroId)
        .query(`SELECT TOP 1 MatriculaId, CHMCertificadoId FROM Matriculas_AFM WHERE MembroId = @m ORDER BY MatriculaId DESC`)).recordset[0];
      if (mat) {
        await new sql.Request(t).input("id", sql.Int, mat.MatriculaId)
          .query(`UPDATE Matriculas_AFM SET CertificadoHabilitacao = 0, CHMEm = NULL, CHMPor = NULL, CHMCertificadoId = NULL WHERE MatriculaId = @id`);
        await escadaDb.revogarDocumentoCHM(t, mat.CHMCertificadoId, `Usado na consagração a ${escada.ROTULO_CARGO[p.cargoAlvo]} em ${regra.br(ce.dataCerimonia)} (Regimento, Art. 67 §1º).`, usuario.membroId);
      }
      await escadaDb.trocarCargoNaTransacao(t, { membroId: p.membroId, cargoNovo: p.cargoAlvo, desde: ce.dataCerimonia, origem: ORIGEM_DA_MODALIDADE[p.modalidade] || "CONSAGRACAO",
        consagracaoId: p.consagracaoId, funcao: p.assunto, por: usuario.membroId });
      const texto = regra.textoDiploma({ cargoAlvo: p.cargoAlvo, modalidade: p.modalidade, dataCerimonia: ce.dataCerimonia, ocasiao: ce.ocasiao });
      const diploma = await certificados.emitirCertificado(escadaDb.naTransacao(t), { membroId: p.membroId, titulo: texto.titulo, descricao: texto.descricao, emitidoPorMembroId: usuario.membroId,
        natureza: "DIPLOMA", codigo: p.diplomaCodigo || null, auditar: false });
      if (!diploma.sucesso) throw new Error(`diploma não emitido: ${diploma.mensagem}`);
      // o código que valeu fica no processo (o reservado na impressão, ou o novo, se ninguém imprimiu)
      await new sql.Request(t).input("id", sql.UniqueIdentifier, p.consagracaoId).input("cert", sql.Int, diploma.certificadoId)
        .input("cod", sql.NVarChar(20), certificados.normalizarCodigo(diploma.codigoVerificacao))
        .query(`UPDATE Consagracoes SET DiplomaCertificadoId = @cert, DiplomaCodigo = @cod WHERE ConsagracaoId = @id`);
      resultados.push({ ...base, resultado: "CONSAGRADO", certificadoId: diploma.certificadoId, nivelamento: !!conf.avaliacao.nivelamento,
        motivo: `Agora é ${escada.ROTULO_CARGO[p.cargoAlvo]}.${conf.avaliacao.nivelamento ? " Fica em nivelamento obrigatório na AFM (Regimento, Art. 66 §5º)." : ""}` });
    }
    await t.commit();
  } catch (e) { await fecharTransacao(t, false); throw e; }

  await registrarAuditoria({ tabela: "CerimoniasConsagracao", registroId: Number(cerimoniaId), acao: "CERIMONIA_REALIZADA", usuarioId: usuario.membroId,
    dadosDepois: { resultados: resultados.map((x) => ({ consagracaoId: x.consagracaoId, resultado: x.resultado })) } });
  for (const x of resultados) {
    await registrarAuditoria({ tabela: "Consagracoes", registroId: x.membroId, acao: `CERIMONIA_${x.resultado}`, usuarioId: usuario.membroId,
      dadosDepois: { consagracaoId: x.consagracaoId, cerimoniaId: Number(cerimoniaId), cargoNovo: x.resultado === "CONSAGRADO" ? x.cargoAlvo : undefined, diplomaCertificadoId: x.certificadoId } });
  }
  const conta = (r) => resultados.filter((x) => x.resultado === r).length;
  return {
    sucesso: true, resultados: resultados.map(({ cargoAlvo, ...x }) => ({ ...x, cargoAlvoRotulo: escada.ROTULO_CARGO[cargoAlvo] })),
    mensagem: `Cerimônia registrada: ${conta("CONSAGRADO")} consagrado(s), ${conta("AUSENTE")} ausente(s), ${conta("VOLTOU")} de volta à fila.`
  };
}

// Art. 75, II, b: quem faltou à cerimônia só reinicia o processo no ano seguinte (o "exercício" é o ano civil — Estatuto Art. 30 §2º).
async function perdeuNoAno(pool, membroId, hojeIso) {
  const r = await pool.request().input("m", sql.Int, Number(membroId)).input("ano", sql.Int, Number(String(hojeIso).slice(0, 4)))
    .query(`SELECT TOP 1 CONVERT(varchar(10), DataConclusao, 120) AS Data FROM Consagracoes
            WHERE MembroId = @m AND MotivoEncerramento = N'AUSENCIA_CERIMONIA' AND YEAR(DataConclusao) = @ano`);
  return r.recordset[0] ? r.recordset[0].Data : null;
}

// Meus Dados (LGPD): os processos da pessoa. Do parecer do CEI, o resultado e a data (a fundamentação é deliberação sigilosa do Conselho).
async function dadosDoTitular(pool, membroId) {
  const r = await pool.request().input("m", sql.Int, Number(membroId)).query(`
    SELECT c.Numero, c.Assunto, ISNULL(c.CargoAlvo, t.CargoMinisterialResultante) AS CargoAlvo, c.Status, CONVERT(varchar(10), c.DataProtocolo, 120) AS DataProtocolo,
           p.Resultado AS Parecer, CONVERT(varchar(10), p.SabatinaEm, 120) AS ParecerEm, CONVERT(varchar(10), c.HomologadoEm, 120) AS HomologadoEm,
           CONVERT(varchar(10), c.TaxaPagaEm, 120) AS TaxaPagaEm, c.TaxaValor, CONVERT(varchar(10), ce.DataCerimonia, 120) AS Cerimonia, c.PresenteCerimonia,
           c.MotivoEncerramento, CONVERT(varchar(10), c.DataConclusao, 120) AS DataConclusao
    FROM Consagracoes c
    LEFT JOIN TiposConsagracao t ON t.Nome = c.Assunto
    LEFT JOIN PareceresCEIConsagracao p ON p.ConsagracaoId = c.ConsagracaoId
    LEFT JOIN CerimoniasConsagracao ce ON ce.CerimoniaId = c.CerimoniaId
    WHERE c.MembroId = @m ORDER BY c.DataProtocolo DESC`);
  return r.recordset.map((l) => ({
    numero: l.Numero, assunto: l.Assunto, cargo: escada.ROTULO_CARGO[alvoValido(l.CargoAlvo)] || null, etapa: regra.ROTULO_ETAPA[l.Status] || l.Status, protocolo: l.DataProtocolo,
    parecerCEI: l.Parecer ? `${l.Parecer} em ${regra.br(l.ParecerEm)}` : null, homologadoEm: l.HomologadoEm, taxaPagaEm: l.TaxaPagaEm, taxaValor: l.TaxaValor == null ? null : Number(l.TaxaValor),
    cerimonia: l.Cerimonia, presente: l.PresenteCerimonia === null ? null : !!l.PresenteCerimonia,
    encerramento: l.MotivoEncerramento === "INAPTO_CEI" ? "Parecer INAPTO do CEI" : l.MotivoEncerramento === "AUSENCIA_CERIMONIA" ? "Ausente na cerimônia" : null, conclusao: l.DataConclusao
  }));
}

module.exports = {
  dadosDoTitular, ehGuid, carregarProcesso, faltaNoDossie, filaDoCEI, registrarParecer, lerParecer, reunioesCLIEncerradas, homologar, registrarTaxa,
  listarCerimonias, criarCerimonia, editarCerimonia, cancelarCerimonia, definirComissao, incluirCandidatos, retirarCandidato, detalheCerimonia,
  diplomasParaImprimir, registrarCerimonia, perdeuNoAno
};
