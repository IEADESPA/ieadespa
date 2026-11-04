// shared/entidadesVinculadasDb.js — v9.1: Entidades vinculadas. O banco (migração 165); a regra pura está em entidadesVinculadas.js.
// Toda escrita que muda de etapa é condicional (WHERE Status = o esperado): dois pedidos ao mesmo tempo, um só passa; o outro recebe "mudou enquanto isso".
const { sql } = require("./db");
const ev = require("./entidadesVinculadas");
const { registrarAuditoria, registrarAuditoriaNaTransacao } = require("./auditoria");
const { violouUnicidade } = require("./violacaoUnica");
const { hojeBrasilia } = require("./dataBrasilia");
const { existeParentescoAte2Grau } = require("./parentesco");
const { ehPresidenteAtual } = require("./diretoria");

const NAO_EXISTE = { sucesso: false, naoExiste: true, mensagem: "Não encontrado." };
const MUDOU = (mensagem = "Isto mudou enquanto você olhava. Atualize a tela.") => ({ sucesso: false, mensagem });
const iso = (v) => (v == null ? null : (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)));
// O fim de um mandato encerrado por uma deliberação (a reunião @em) nunca fica antes da própria indicação: quem foi indicado depois da reunião, mas antes do
// registro, encerra no dia da indicação (revisão de 03/11/2026).
const ENCERRA_EM = "CASE WHEN @em < IndicadoEm THEN IndicadoEm ELSE @em END";
const STATUS_MEMBRO_ATIVO = "m.Status IN (N'ATIVO', N'LICENÇA', N'LICENCA_CANDIDATURA')";

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

async function lerPrazoDias(pool, sigla, padrao) {
  try {
    const r = await pool.request().input("s", sql.NVarChar(60), sigla).query(`SELECT TOP 1 Dias FROM Prazos WHERE Sigla = @s`);
    const d = r.recordset[0] ? Number(r.recordset[0].Dias) : NaN;
    return Number.isInteger(d) && d > 0 && d <= 365 ? d : padrao;
  } catch (_) { return padrao; }
}

// ================================================================ reuniões ================================================================
// As reuniões já realizadas e encerradas da CLI (sem o Seminário e sem a que "não conta" — as mesmas da homologação da consagração) e da Assembleia Geral.
const PLENARIO_CLI = `ISNULL(s.TipoSessao, N'') <> N'SEMINARIO_AFM' AND s.NaoContaEm IS NULL`;
// Só as de data até hoje: a reunião "encerrada" com data futura (erro de digitação) seria recusada por lerReuniao — a lista não a oferece (v9.2).
async function reunioesEncerradas(pool, orgao, hoje = hojeBrasilia()) {
  const filtro = orgao === "CLI" ? `o.Sigla = N'CLI' AND ${PLENARIO_CLI}` : `o.Sigla = N'ASSEMBLEIA_GERAL'`;
  const r = await pool.request().input("h", sql.Date, hoje).query(`
    SELECT TOP 60 s.SessaoId, CONVERT(varchar(10), s.DataSessao, 120) AS DataSessao, s.Descricao
    FROM Sessoes s JOIN Orgaos o ON o.OrgaoId = s.OrgaoId
    WHERE ${filtro} AND s.Status = N'ENCERRADA' AND s.DataSessao IS NOT NULL AND s.DataSessao <= @h
    ORDER BY s.DataSessao DESC, s.SessaoId DESC`);
  return r.recordset.map((l) => ({ sessaoId: l.SessaoId, data: l.DataSessao, descricao: l.Descricao }));
}
async function lerReuniao(pool, sessaoId, orgao, hoje) {
  const id = ev.idDe(sessaoId);
  if (!id) return null;
  const filtro = orgao === "CLI" ? `o.Sigla = N'CLI' AND ${PLENARIO_CLI}` : `o.Sigla = N'ASSEMBLEIA_GERAL'`;
  const r = await pool.request().input("s", sql.Int, id).query(`
    SELECT s.SessaoId, CONVERT(varchar(10), s.DataSessao, 120) AS DataSessao, s.Status FROM Sessoes s JOIN Orgaos o ON o.OrgaoId = s.OrgaoId
    WHERE s.SessaoId = @s AND ${filtro}`);
  const l = r.recordset[0];
  if (!l || l.Status !== "ENCERRADA" || !l.DataSessao || l.DataSessao > hoje) return null;
  return { sessaoId: l.SessaoId, data: l.DataSessao };
}
const ESCOLHA_CLI = "Escolha uma reunião da CLI já realizada e encerrada.";
const ESCOLHA_AG = "Escolha uma Assembleia Geral já realizada e encerrada.";

// ================================================================ tipos ================================================================
async function listarTipos(pool, { todos = false } = {}) {
  const r = await pool.request().query(`
    SELECT t.TipoId, t.Nome, t.Natureza, t.Ativo, (SELECT COUNT(*) FROM EntidadesVinculadas e WHERE e.TipoId = t.TipoId) AS Entidades
    FROM EntidadeTipos t ${todos ? "" : "WHERE t.Ativo = 1"} ORDER BY t.Nome`);
  const f = await pool.request().query(`SELECT TipoId, Formacao FROM EntidadeTipoFormacoes ORDER BY Formacao`);
  const porTipo = new Map();
  for (const l of f.recordset) { if (!porTipo.has(l.TipoId)) porTipo.set(l.TipoId, []); porTipo.get(l.TipoId).push(l.Formacao); }
  return r.recordset.map((t) => ({
    tipoId: t.TipoId, nome: t.Nome, natureza: t.Natureza, naturezaRotulo: ev.NATUREZAS[t.Natureza] || t.Natureza, ativo: !!t.Ativo,
    entidades: Number(t.Entidades), formacoes: porTipo.get(t.TipoId) || []
  }));
}
async function lerTipo(pool, tipoId) {
  const r = await pool.request().input("id", sql.Int, tipoId).query(`SELECT TipoId, Nome, Natureza, Ativo FROM EntidadeTipos WHERE TipoId = @id`);
  const t = r.recordset[0];
  if (!t) return null;
  const f = await pool.request().input("id", sql.Int, tipoId).query(`SELECT Formacao FROM EntidadeTipoFormacoes WHERE TipoId = @id ORDER BY Formacao`);
  return { tipoId: t.TipoId, nome: t.Nome, natureza: t.Natureza, ativo: !!t.Ativo, formacoes: f.recordset.map((x) => x.Formacao) };
}
async function gravarFormacoes(rq, tipoId, formacoes) {
  await rq().input("id", sql.Int, tipoId).query(`DELETE FROM EntidadeTipoFormacoes WHERE TipoId = @id`);
  for (const f of formacoes) await rq().input("id", sql.Int, tipoId).input("f", sql.NVarChar(80), f).query(`INSERT INTO EntidadeTipoFormacoes (TipoId, Formacao) VALUES (@id, @f)`);
}
async function criarTipo(pool, { dados, por }) {
  const v = ev.validarTipo(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  try {
    return await emTransacao(pool, async (t, rq) => {
      const r = await rq().input("n", sql.NVarChar(80), v.dados.nome).input("nat", sql.NVarChar(20), v.dados.natureza).input("por", sql.Int, por)
        .query(`INSERT INTO EntidadeTipos (Nome, Natureza, CriadoPor) OUTPUT inserted.TipoId VALUES (@n, @nat, @por)`);
      const tipoId = r.recordset[0].TipoId;
      await gravarFormacoes(rq, tipoId, v.dados.formacoes);
      await registrarAuditoriaNaTransacao(t, { tabela: "EntidadeTipos", registroId: tipoId, acao: "ENTIDADE_TIPO_CRIADO", usuarioId: por, dadosDepois: v.dados });
      return { sucesso: true, tipoId, mensagem: "Tipo cadastrado." };
    });
  } catch (e) {
    if (violouUnicidade(e)) return { sucesso: false, mensagem: "Já existe um tipo com esse nome." };
    throw e;
  }
}
async function editarTipo(pool, { tipoId, dados, por }) {
  const atual = await lerTipo(pool, tipoId);
  if (!atual) return NAO_EXISTE;
  const v = ev.validarTipo(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const ativo = dados.ativo == null ? atual.ativo : ev.booleano(dados.ativo);
  if (v.dados.natureza !== atual.natureza) {
    const usados = await pool.request().input("id", sql.Int, tipoId).query(`SELECT COUNT(*) AS n FROM EntidadesVinculadas WHERE TipoId = @id`);
    if (Number(usados.recordset[0].n) > 0) return { sucesso: false, mensagem: "A natureza não muda depois que há entidade deste tipo: ela decide o destino do patrimônio na extinção (Estatuto, Art. 68). Crie outro tipo." };
  }
  try {
    return await emTransacao(pool, async (t, rq) => {
      const u = await rq().input("id", sql.Int, tipoId).input("n", sql.NVarChar(80), v.dados.nome).input("nat", sql.NVarChar(20), v.dados.natureza)
        .input("a", sql.Bit, ativo).input("por", sql.Int, por)
        .query(`UPDATE EntidadeTipos SET Nome = @n, Natureza = @nat, Ativo = @a, AtualizadoPor = @por, AtualizadoEm = SYSUTCDATETIME() WHERE TipoId = @id`);
      if (!u.rowsAffected[0]) return NAO_EXISTE;
      await gravarFormacoes(rq, tipoId, v.dados.formacoes);
      await registrarAuditoriaNaTransacao(t, { tabela: "EntidadeTipos", registroId: tipoId, acao: "ENTIDADE_TIPO_EDITADO", usuarioId: por, dadosAntes: atual, dadosDepois: { ...v.dados, ativo } });
      return { sucesso: true, mensagem: "Tipo atualizado." };
    });
  } catch (e) {
    if (violouUnicidade(e)) return { sucesso: false, mensagem: "Já existe um tipo com esse nome." };
    throw e;
  }
}

// ================================================================ entidades ================================================================
const COLUNAS_ENTIDADE = `
  e.EntidadeId, e.RazaoSocial, e.NomeFantasia, e.Cnpj, e.TipoId, t.Nome AS TipoNome, t.Natureza, e.Finalidade, e.Municipio, e.UF, e.Status,
  e.CadastradaEm, e.VinculoSessaoId, CONVERT(varchar(10), e.VinculoEm, 120) AS VinculoEm, CONVERT(varchar(10), e.NaoAprovadaEm, 120) AS NaoAprovadaEm, e.NaoAprovadaMotivo,
  e.VinculoAGSessaoId, e.VinculoAGResultado, CONVERT(varchar(10), e.VinculoAGEm, 120) AS VinculoAGEm, e.VinculoAGObs,
  e.Periodicidade, e.PrazoEntregaDias,
  e.ExtincaoSessaoId, CONVERT(varchar(10), e.ExtincaoEm, 120) AS ExtincaoEm, e.DestinoPatrimonio, e.DestinatarioNome, e.DestinatarioCnpj, e.BensComodato,
  e.ExtincaoAGSessaoId, e.ExtincaoAGResultado, CONVERT(varchar(10), e.ExtincaoAGEm, 120) AS ExtincaoAGEm, e.ExtincaoAGObs,
  CONVERT(varchar(10), e.ExtincaoVetadaEm, 120) AS ExtincaoVetadaEm, e.RenovacaoAGSessaoId`;
function formaEntidade(l) {
  return {
    entidadeId: l.EntidadeId, razaoSocial: l.RazaoSocial, nomeFantasia: l.NomeFantasia, cnpj: l.Cnpj, cnpjFormatado: ev.formatarCnpj(l.Cnpj), tipoId: l.TipoId, tipoNome: l.TipoNome,
    natureza: l.Natureza, naturezaRotulo: ev.NATUREZAS[l.Natureza] || l.Natureza, finalidade: l.Finalidade, municipio: l.Municipio, uf: l.UF,
    status: l.Status, statusRotulo: ev.STATUS_ENTIDADE[l.Status] || l.Status,
    vinculo: l.VinculoEm ? { sessaoId: l.VinculoSessaoId, em: l.VinculoEm } : null,
    naoAprovada: l.NaoAprovadaEm ? { em: l.NaoAprovadaEm, motivo: l.NaoAprovadaMotivo } : null,
    vinculoAG: l.VinculoAGResultado ? { sessaoId: l.VinculoAGSessaoId, resultado: l.VinculoAGResultado, resultadoRotulo: ev.RESULTADOS_AG[l.VinculoAGResultado], em: l.VinculoAGEm, obs: l.VinculoAGObs } : null,
    periodicidade: l.Periodicidade, periodicidadeRotulo: ev.PERIODICIDADES[l.Periodicidade], prazoEntregaDias: Number(l.PrazoEntregaDias),
    extincao: l.ExtincaoEm ? {
      sessaoId: l.ExtincaoSessaoId, em: l.ExtincaoEm, destino: l.DestinoPatrimonio, destinoRotulo: ev.DESTINOS[l.DestinoPatrimonio] ? ev.DESTINOS[l.DestinoPatrimonio].rotulo : l.DestinoPatrimonio,
      destinatarioNome: l.DestinatarioNome, destinatarioCnpj: l.DestinatarioCnpj ? ev.formatarCnpj(l.DestinatarioCnpj) : null, bensComodato: l.BensComodato
    } : null,
    // Art. 19 §1º: a extinção que a Assembleia já recusou só se renova com a autorização dela
    extincaoVetadaEm: l.ExtincaoVetadaEm || null, renovacaoAutorizada: !!l.RenovacaoAGSessaoId,
    extincaoAG: l.ExtincaoAGResultado ? { sessaoId: l.ExtincaoAGSessaoId, resultado: l.ExtincaoAGResultado, resultadoRotulo: ev.RESULTADOS_AG[l.ExtincaoAGResultado], em: l.ExtincaoAGEm, obs: l.ExtincaoAGObs } : null,
    // Art. 18, VII, "b": a deliberação da CLI que criou ou extinguiu espera a Assembleia
    aguardandoAG: (l.Status === "ATIVA" && !l.VinculoAGResultado) ? "VINCULO" : (l.Status === "EXTINTA" && !l.ExtincaoAGResultado ? "EXTINCAO" : null)
  };
}
async function lerEntidade(pool, entidadeId) {
  const r = await pool.request().input("id", sql.Int, entidadeId).query(`SELECT ${COLUNAS_ENTIDADE} FROM EntidadesVinculadas e JOIN EntidadeTipos t ON t.TipoId = e.TipoId WHERE e.EntidadeId = @id`);
  return r.recordset[0] ? formaEntidade(r.recordset[0]) : null;
}

async function criarEntidade(pool, { dados, por, hoje = hojeBrasilia() }) {
  const v = ev.validarEntidade(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const tipo = await lerTipo(pool, v.dados.tipoId);
  if (!tipo || !tipo.ativo) return { sucesso: false, mensagem: "Escolha um tipo de entidade ativo." };
  // Art. 19 §1º: o CNPJ de um vínculo que a Assembleia desfez só volta com nova autorização dela (uma Assembleia posterior, já encerrada)
  const desfeita = await pool.request().input("c", sql.Char(14), v.dados.cnpj)
    .query(`SELECT TOP 1 CONVERT(varchar(10), VinculoAGEm, 120) AS Em FROM EntidadesVinculadas WHERE Cnpj = @c AND Status = N'DESFEITA' ORDER BY VinculoAGEm DESC`);
  let renovacao = null;
  if (desfeita.recordset[0]) {
    const desde = desfeita.recordset[0].Em;
    if (dados.autorizacaoAGSessaoId == null || dados.autorizacaoAGSessaoId === "") {
      return { sucesso: false, mensagem: `A Assembleia Geral desfez o vínculo deste CNPJ em ${ev.br(desde)}: a nova proposta precisa da autorização de uma Assembleia posterior (Estatuto, Art. 19 §1º). Escolha a Assembleia que autorizou.` };
    }
    renovacao = await lerReuniao(pool, dados.autorizacaoAGSessaoId, "AG", hoje);
    if (!renovacao || renovacao.data < desde) return { sucesso: false, mensagem: `Escolha uma Assembleia Geral encerrada, posterior a ${ev.br(desde)}, que autorizou a nova proposta.` };
  }
  const prazo = await lerPrazoDias(pool, "ENTIDADE_PRESTACAO_PRAZO_DIAS", ev.PRAZO_ENTREGA_PADRAO);
  try {
    const r = await pool.request().input("rs", sql.NVarChar(150), v.dados.razaoSocial).input("nf", sql.NVarChar(100), v.dados.nomeFantasia).input("c", sql.Char(14), v.dados.cnpj)
      .input("t", sql.Int, v.dados.tipoId).input("f", sql.NVarChar(500), v.dados.finalidade).input("mu", sql.NVarChar(80), v.dados.municipio).input("uf", sql.Char(2), v.dados.uf)
      .input("por", sql.Int, por).input("p", sql.Int, prazo).input("ren", sql.Int, renovacao ? renovacao.sessaoId : null)
      .query(`INSERT INTO EntidadesVinculadas (RazaoSocial, NomeFantasia, Cnpj, TipoId, Finalidade, Municipio, UF, CadastradaPor, PrazoEntregaDias, RenovacaoAGSessaoId)
              OUTPUT inserted.EntidadeId VALUES (@rs, @nf, @c, @t, @f, @mu, @uf, @por, @p, @ren)`);
    const entidadeId = r.recordset[0].EntidadeId;
    await registrarAuditoria({ tabela: "EntidadesVinculadas", registroId: entidadeId, acao: "ENTIDADE_CADASTRADA", usuarioId: por, dadosDepois: { ...v.dados, hoje, renovacaoAGSessaoId: renovacao ? renovacao.sessaoId : null } });
    return { sucesso: true, entidadeId, mensagem: "Entidade cadastrada como proposta. O vínculo vale quando a aprovação da CLI for registrada (Estatuto, Art. 64, parágrafo único)." };
  } catch (e) {
    if (violouUnicidade(e)) return { sucesso: false, mensagem: "Já existe uma entidade proposta, ativa ou extinta com este CNPJ." };
    throw e;
  }
}

async function editarEntidade(pool, { entidadeId, dados, por }) {
  const atual = await lerEntidade(pool, entidadeId);
  if (!atual) return NAO_EXISTE;
  if (!["PROPOSTA", "ATIVA"].includes(atual.status)) return { sucesso: false, mensagem: "Só se edita a entidade proposta ou ativa." };
  const v = ev.validarEntidade({ ...dados, cnpj: atual.status === "PROPOSTA" ? dados.cnpj : null }, { edicao: true });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  if (atual.status !== "PROPOSTA" && v.dados.tipoId !== atual.tipoId) return { sucesso: false, mensagem: "O tipo só muda enquanto a entidade é proposta: a CLI aprovou com este tipo." };
  if (atual.status !== "PROPOSTA" && dados.cnpj != null && dados.cnpj !== "" && ev.normalizarCnpj(dados.cnpj) !== atual.cnpj) {
    return { sucesso: false, mensagem: "O CNPJ só muda enquanto a entidade é proposta: a CLI aprovou com este CNPJ." };
  }
  if (v.dados.tipoId !== atual.tipoId) {
    const tipo = await lerTipo(pool, v.dados.tipoId);
    if (!tipo || !tipo.ativo) return { sucesso: false, mensagem: "Escolha um tipo de entidade ativo." };
  }
  const cnpj = v.dados.cnpj || atual.cnpj;
  try {
    const u = await pool.request().input("id", sql.Int, entidadeId).input("rs", sql.NVarChar(150), v.dados.razaoSocial).input("nf", sql.NVarChar(100), v.dados.nomeFantasia)
      .input("c", sql.Char(14), cnpj).input("t", sql.Int, v.dados.tipoId).input("f", sql.NVarChar(500), v.dados.finalidade).input("mu", sql.NVarChar(80), v.dados.municipio)
      .input("uf", sql.Char(2), v.dados.uf).input("por", sql.Int, por).input("st", sql.NVarChar(15), atual.status)
      .query(`UPDATE EntidadesVinculadas SET RazaoSocial = @rs, NomeFantasia = @nf, Cnpj = @c, TipoId = @t, Finalidade = @f, Municipio = @mu, UF = @uf,
                AtualizadaPor = @por, AtualizadaEm = SYSUTCDATETIME()
              WHERE EntidadeId = @id AND Status = @st`);
    if (!u.rowsAffected[0]) return MUDOU();
  } catch (e) {
    if (violouUnicidade(e)) return { sucesso: false, mensagem: "Já existe uma entidade com este CNPJ." };
    throw e;
  }
  await registrarAuditoria({ tabela: "EntidadesVinculadas", registroId: entidadeId, acao: "ENTIDADE_EDITADA", usuarioId: por,
    dadosAntes: { razaoSocial: atual.razaoSocial, nomeFantasia: atual.nomeFantasia, cnpj: atual.cnpj, tipoId: atual.tipoId, finalidade: atual.finalidade, municipio: atual.municipio, uf: atual.uf },
    dadosDepois: { ...v.dados, cnpj } });
  return { sucesso: true, mensagem: "Dados da entidade atualizados." };
}

// A CLI aprovou o vínculo (Art. 64, parágrafo único): vale na hora (Art. 19) e espera a Assembleia.
async function aprovarVinculo(pool, { entidadeId, sessaoId, por, hoje = hojeBrasilia() }) {
  const atual = await lerEntidade(pool, entidadeId);
  if (!atual) return NAO_EXISTE;
  if (atual.status !== "PROPOSTA") return { sucesso: false, mensagem: "Só a entidade proposta recebe a aprovação da CLI." };
  const reuniao = await lerReuniao(pool, sessaoId, "CLI", hoje);
  if (!reuniao) return { sucesso: false, mensagem: ESCOLHA_CLI };
  const u = await pool.request().input("id", sql.Int, entidadeId).input("s", sql.Int, reuniao.sessaoId).input("em", sql.Date, reuniao.data).input("por", sql.Int, por)
    .query(`UPDATE EntidadesVinculadas SET Status = N'ATIVA', VinculoSessaoId = @s, VinculoEm = @em, VinculoRegistradoPor = @por WHERE EntidadeId = @id AND Status = N'PROPOSTA'`);
  if (!u.rowsAffected[0]) return MUDOU();
  await registrarAuditoria({ tabela: "EntidadesVinculadas", registroId: entidadeId, acao: "ENTIDADE_VINCULO_APROVADO_CLI", usuarioId: por, dadosDepois: { sessaoId: reuniao.sessaoId, em: reuniao.data } });
  return { sucesso: true, mensagem: "Vínculo aprovado pela CLI e em vigor. Leve à próxima Assembleia Geral para a ratificação (Estatuto, Art. 18, VII, \"b\", e Art. 19)." };
}
async function naoAprovar(pool, { entidadeId, dados, por, hoje = hojeBrasilia() }) {
  const atual = await lerEntidade(pool, entidadeId);
  if (!atual) return NAO_EXISTE;
  if (atual.status !== "PROPOSTA") return { sucesso: false, mensagem: "Só a entidade proposta pode ficar sem aprovação." };
  const reuniao = await lerReuniao(pool, dados.sessaoId, "CLI", hoje);
  if (!reuniao) return { sucesso: false, mensagem: ESCOLHA_CLI };
  const motivo = ev.texto(dados.motivo, { minimo: 10, maximo: 500, rotulo: "O motivo", multilinha: true });
  if (!motivo.valido) return { sucesso: false, mensagem: motivo.mensagem };
  return emTransacao(pool, async (t, rq) => {
    const u = await rq().input("id", sql.Int, entidadeId).input("em", sql.Date, reuniao.data).input("s", sql.Int, reuniao.sessaoId).input("m", sql.NVarChar(500), motivo.texto)
      .query(`UPDATE EntidadesVinculadas SET Status = N'NAO_APROVADA', NaoAprovadaEm = @em, NaoAprovadaSessaoId = @s, NaoAprovadaMotivo = @m WHERE EntidadeId = @id AND Status = N'PROPOSTA'`);
    if (!u.rowsAffected[0]) return MUDOU();
    // as indicações que esperavam a CLI caem junto
    await rq().input("id", sql.Int, entidadeId).input("em", sql.Date, reuniao.data).input("por", sql.Int, por)
      .query(`UPDATE EntidadeDirigentes SET Status = N'ENCERRADO', EncerradoEm = ${ENCERRA_EM}, MotivoEncerramento = N'OUTRO', EncerramentoObs = N'A entidade não foi aprovada pela CLI.', EncerradoPor = @por
              WHERE EntidadeId = @id AND Status = N'INDICADO'`);
    await registrarAuditoriaNaTransacao(t, { tabela: "EntidadesVinculadas", registroId: entidadeId, acao: "ENTIDADE_NAO_APROVADA", usuarioId: por, dadosDepois: { sessaoId: reuniao.sessaoId, em: reuniao.data, motivo: motivo.texto } });
    return { sucesso: true, mensagem: "Registrado: a CLI não aprovou. O CNPJ fica livre para uma nova proposta, se um dia houver." };
  });
}

// A Assembleia Geral ratificou (ou não) a deliberação da CLI que criou ou extinguiu a entidade (Art. 18, VII, "b"; Art. 19).
async function registrarAssembleia(pool, { entidadeId, dados, por, hoje = hojeBrasilia() }) {
  const atual = await lerEntidade(pool, entidadeId);
  if (!atual) return NAO_EXISTE;
  const objeto = atual.aguardandoAG;
  if (!objeto) return { sucesso: false, mensagem: "Esta entidade não tem deliberação da CLI esperando a Assembleia." };
  const resultado = typeof dados.resultado === "string" ? dados.resultado.trim().toUpperCase() : "";
  if (!ev.RESULTADOS_AG[resultado]) return { sucesso: false, mensagem: "Informe se a Assembleia ratificou ou não." };
  const reuniao = await lerReuniao(pool, dados.sessaoId, "AG", hoje);
  if (!reuniao) return { sucesso: false, mensagem: ESCOLHA_AG };
  const desde = objeto === "VINCULO" ? atual.vinculo.em : atual.extincao.em;
  if (reuniao.data < desde) return { sucesso: false, mensagem: `A Assembleia escolhida é anterior à deliberação da CLI (${ev.br(desde)}).` };
  const obs = ev.texto(dados.observacao, { maximo: 500, rotulo: "A observação", obrigatorio: resultado === "NAO_RATIFICADA", minimo: resultado === "NAO_RATIFICADA" ? 10 : 0, multilinha: true });
  if (!obs.valido) return { sucesso: false, mensagem: obs.mensagem };
  return emTransacao(pool, async (t, rq) => {
    let u;
    if (objeto === "VINCULO") {
      u = await rq().input("id", sql.Int, entidadeId).input("s", sql.Int, reuniao.sessaoId).input("r", sql.NVarChar(15), resultado).input("em", sql.Date, reuniao.data).input("o", sql.NVarChar(500), obs.texto)
        .input("novo", sql.NVarChar(15), resultado === "RATIFICADA" ? "ATIVA" : "DESFEITA")
        .query(`UPDATE EntidadesVinculadas SET VinculoAGSessaoId = @s, VinculoAGResultado = @r, VinculoAGEm = @em, VinculoAGObs = @o, Status = @novo
                WHERE EntidadeId = @id AND Status = N'ATIVA' AND VinculoAGResultado IS NULL`);
    } else {
      // a extinção não ratificada: a entidade volta a ativa e a deliberação fica sem efeito, mas a recusa fica GUARDADA (ExtincaoVetadaEm): pelo Art. 19 §1º a CLI só
      // renova a extinção com nova autorização da Assembleia
      u = await rq().input("id", sql.Int, entidadeId).input("s", sql.Int, reuniao.sessaoId).input("r", sql.NVarChar(15), resultado).input("em", sql.Date, reuniao.data).input("o", sql.NVarChar(500), obs.texto)
        .query(resultado === "RATIFICADA"
          ? `UPDATE EntidadesVinculadas SET ExtincaoAGSessaoId = @s, ExtincaoAGResultado = @r, ExtincaoAGEm = @em, ExtincaoAGObs = @o
             WHERE EntidadeId = @id AND Status = N'EXTINTA' AND ExtincaoAGResultado IS NULL`
          : `UPDATE EntidadesVinculadas SET Status = N'ATIVA', ExtincaoVetadaEm = @em, ExtincaoVetadaSessaoId = @s, ExtincaoSessaoId = NULL, ExtincaoEm = NULL, ExtincaoRegistradaPor = NULL,
               DestinoPatrimonio = NULL, DestinatarioNome = NULL, DestinatarioCnpj = NULL, BensComodato = NULL, ExtincaoAutorizacaoAGSessaoId = NULL,
               ExtincaoAGSessaoId = NULL, ExtincaoAGResultado = NULL, ExtincaoAGEm = NULL, ExtincaoAGObs = NULL
             WHERE EntidadeId = @id AND Status = N'EXTINTA' AND ExtincaoAGResultado IS NULL`);
    }
    if (!u.rowsAffected[0]) return MUDOU();
    // o vínculo desfeito encerra os mandatos em aberto e os processos de intervenção
    if (objeto === "VINCULO" && resultado === "NAO_RATIFICADA") {
      await rq().input("id", sql.Int, entidadeId).input("em", sql.Date, reuniao.data).input("por", sql.Int, por)
        .query(`UPDATE EntidadeDirigentes SET Status = N'ENCERRADO', EncerradoEm = ${ENCERRA_EM}, MotivoEncerramento = N'OUTRO', EncerramentoObs = N'Vínculo desfeito: a Assembleia Geral não ratificou a criação.', EncerradoPor = @por
                WHERE EntidadeId = @id AND Status IN (N'INDICADO', N'HOMOLOGADO')`);
      await fecharProcessosDaEntidade(rq, { entidadeId, hoje, por, motivo: "Vínculo desfeito: a Assembleia Geral não ratificou a criação." });
    }
    await registrarAuditoriaNaTransacao(t, { tabela: "EntidadesVinculadas", registroId: entidadeId, acao: `ENTIDADE_AG_${objeto}_${resultado}`, usuarioId: por,
      dadosAntes: objeto === "EXTINCAO" ? atual.extincao : null, dadosDepois: { sessaoId: reuniao.sessaoId, em: reuniao.data, observacao: obs.texto } });
    const msg = objeto === "VINCULO"
      ? (resultado === "RATIFICADA" ? "A Assembleia ratificou o vínculo." : "Registrado: a Assembleia não ratificou; o vínculo foi desfeito e os mandatos encerrados. O mesmo CNPJ só volta com nova autorização da Assembleia (Art. 19 §1º).")
      : (resultado === "RATIFICADA" ? "A Assembleia ratificou a extinção." : "Registrado: a Assembleia não ratificou a extinção; a entidade volta a ativa (os mandatos encerrados pela extinção precisam de nova indicação). Nova extinção só com autorização da Assembleia (Art. 19 §1º).");
    return { sucesso: true, mensagem: msg };
  });
}

// A periodicidade e o prazo valem desde o vínculo (os períodos são calculados): mudá-los depois que um período já acabou mudaria para trás o que está atrasado ou
// em dia. Por isso só mudam enquanto nenhum período terminou (revisão de 03/11/2026).
async function configurarPrestacao(pool, { entidadeId, dados, por, hoje = hojeBrasilia() }) {
  const atual = await lerEntidade(pool, entidadeId);
  if (!atual) return NAO_EXISTE;
  if (!["PROPOSTA", "ATIVA"].includes(atual.status)) return { sucesso: false, mensagem: "Só a entidade proposta ou ativa." };
  const periodicidade = typeof dados.periodicidade === "string" ? dados.periodicidade.trim().toUpperCase() : "";
  if (!ev.PERIODICIDADES[periodicidade]) return { sucesso: false, mensagem: "Escolha a periodicidade (anual, semestral ou trimestral)." };
  const prazo = typeof dados.prazoEntregaDias === "number" ? dados.prazoEntregaDias : ev.idDe(dados.prazoEntregaDias);
  if (!Number.isInteger(prazo) || prazo < 1 || prazo > 365) return { sucesso: false, mensagem: "O prazo de entrega vai de 1 a 365 dias depois do fim do período." };
  const mudou = periodicidade !== atual.periodicidade || prazo !== atual.prazoEntregaDias;
  if (!mudou) return { sucesso: true, mensagem: "Nada mudou." };
  const primeiro = atual.vinculo ? ev.periodosDesde(atual.vinculo.em, atual.periodicidade, atual.prazoEntregaDias, hoje)[0] : null;
  if (primeiro && hoje > primeiro.fim) {
    return { sucesso: false, mensagem: `A periodicidade e o prazo só mudam antes de terminar o primeiro período (${primeiro.codigo}): depois, mudariam para trás o que já está em dia ou atrasado.` };
  }
  const u = await pool.request().input("id", sql.Int, entidadeId).input("p", sql.NVarChar(10), periodicidade).input("d", sql.Int, prazo).input("por", sql.Int, por)
    .input("pa", sql.NVarChar(10), atual.periodicidade).input("da", sql.Int, atual.prazoEntregaDias)
    .query(`UPDATE EntidadesVinculadas SET Periodicidade = @p, PrazoEntregaDias = @d, AtualizadaPor = @por, AtualizadaEm = SYSUTCDATETIME()
            WHERE EntidadeId = @id AND Periodicidade = @pa AND PrazoEntregaDias = @da AND NOT EXISTS (SELECT 1 FROM EntidadePrestacoes x WHERE x.EntidadeId = @id)`);
  if (!u.rowsAffected[0]) return MUDOU();
  await registrarAuditoria({ tabela: "EntidadesVinculadas", registroId: entidadeId, acao: "ENTIDADE_PRESTACAO_CONFIGURADA", usuarioId: por,
    dadosAntes: { periodicidade: atual.periodicidade, prazoEntregaDias: atual.prazoEntregaDias }, dadosDepois: { periodicidade, prazoEntregaDias: prazo } });
  return { sucesso: true, mensagem: "Prestação de contas configurada." };
}

// ================================================================ dirigentes ================================================================
const COLUNAS_DIRIGENTE = `
  d.DirigenteId, d.EntidadeId, d.Funcao, d.FuncaoDescricao, d.MembroId, m.Nome AS MembroNome, d.NomeExterno, d.Remunerado, d.Formacao, d.RegistroProfissional,
  d.DeclaracaoParentesco, d.Status, CONVERT(varchar(10), d.IndicadoEm, 120) AS IndicadoEm, d.IndicacaoAto, d.IndicacaoRegistradaPor, d.HomologacaoSessaoId,
  CONVERT(varchar(10), d.HomologadoEm, 120) AS HomologadoEm, CONVERT(varchar(10), d.MandatoAte, 120) AS MandatoAte, CONVERT(varchar(10), d.RecusadoEm, 120) AS RecusadoEm,
  CONVERT(varchar(10), d.EncerradoEm, 120) AS EncerradoEm, d.MotivoEncerramento, d.EncerramentoObs, d.IntervencaoId`;
function formaDirigente(l, hoje) {
  const situacao = ev.situacaoDirigente({ status: l.Status, mandatoAte: l.MandatoAte }, hoje);
  return {
    dirigenteId: l.DirigenteId, entidadeId: l.EntidadeId, funcao: l.Funcao, funcaoRotulo: l.Funcao === "OUTRA" && l.FuncaoDescricao ? l.FuncaoDescricao : (ev.FUNCOES[l.Funcao] || l.Funcao),
    membroId: l.MembroId, nome: l.MembroId ? l.MembroNome : l.NomeExterno, externo: !l.MembroId, remunerado: !!l.Remunerado,
    formacao: l.Formacao, registroProfissional: l.RegistroProfissional, declaracaoParentesco: !!l.DeclaracaoParentesco,
    status: l.Status, situacao, situacaoRotulo: situacao === "MANDATO_VENCIDO" ? "Mandato vencido" : (ev.STATUS_DIRIGENTE[l.Status] || l.Status),
    indicadoEm: l.IndicadoEm, indicacaoAto: l.IndicacaoAto, homologadoEm: l.HomologadoEm, homologacaoSessaoId: l.HomologacaoSessaoId, mandatoAte: l.MandatoAte,
    recusadoEm: l.RecusadoEm, encerradoEm: l.EncerradoEm, motivoEncerramento: l.MotivoEncerramento,
    motivoEncerramentoRotulo: l.MotivoEncerramento ? ev.MOTIVOS_ENCERRAMENTO[l.MotivoEncerramento] : null, encerramentoObs: l.EncerramentoObs, intervencaoId: l.IntervencaoId
  };
}
async function lerDirigente(pool, dirigenteId) {
  const r = await pool.request().input("id", sql.Int, dirigenteId)
    .query(`SELECT ${COLUNAS_DIRIGENTE} FROM EntidadeDirigentes d LEFT JOIN MembroReferencia m ON m.MembroId = d.MembroId WHERE d.DirigenteId = @id`);
  return r.recordset[0] || null;
}

// O membro indicado: existe, está ativo e é maior de idade (dirige pessoa jurídica).
async function membroParaDirigir(pool, membroId, hoje) {
  const r = await pool.request().input("id", sql.Int, membroId).input("h", sql.Date, hoje).query(`
    SELECT m.MembroId, m.Nome,
      CASE WHEN ${STATUS_MEMBRO_ATIVO} THEN 1 ELSE 0 END AS Ativo,
      CASE WHEN m.DataNascimento IS NOT NULL AND m.DataNascimento > DATEADD(YEAR, -18, @h) THEN 1 ELSE 0 END AS Menor
    FROM MembroReferencia m WHERE m.MembroId = @id`);
  const m = r.recordset[0];
  if (!m) return { ok: false, mensagem: "Matrícula não encontrada." };
  if (!m.Ativo) return { ok: false, mensagem: "Só membro ativo é indicado para a direção de entidade vinculada." };
  if (m.Menor) return { ok: false, mensagem: "Menor de idade não dirige entidade vinculada." };
  return { ok: true, nome: m.Nome };
}
// Art. 76 §2º: cargo remunerado nas entidades vinculadas não vai a parente até o 2º grau de quem está na Diretoria Executiva.
async function nepotismo(pool, { membroId, remunerado, externo, declaracaoParentesco }) {
  if (!remunerado) return null;
  if (externo) return declaracaoParentesco ? null : "Cargo remunerado: o profissional de fora declara por escrito que não é parente até o 2º grau de membro da Diretoria Executiva (Estatuto, Art. 76 §2º) — marque a declaração.";
  const r = await pool.request().query(`
    SELECT DISTINCT a.MembroId FROM Assentos a JOIN Orgaos o ON o.OrgaoId = a.OrgaoId
    WHERE o.Sigla = 'DIRETORIA_EXECUTIVA' AND a.DataFim IS NULL AND a.MembroId IS NOT NULL`);
  const diretoria = r.recordset.map((x) => Number(x.MembroId)).filter((id) => id !== Number(membroId));
  if (diretoria.length === 0) return null;
  const achou = await existeParentescoAte2Grau(pool, sql, membroId, new Set(diretoria));
  if (achou && achou.encontrado) {
    return "Vedado: cargo remunerado em entidade vinculada não vai a parente até o 2º grau de membro da Diretoria Executiva (Estatuto, Art. 76 §2º).";
  }
  return null;
}

async function indicarDirigente(pool, { entidadeId, dados, por, hoje = hojeBrasilia() }) {
  const ent = await lerEntidade(pool, entidadeId);
  if (!ent) return NAO_EXISTE;
  if (!["PROPOSTA", "ATIVA"].includes(ent.status)) return { sucesso: false, mensagem: "Só se indica dirigente de entidade proposta ou ativa." };
  const v = ev.validarIndicacao(dados, { hoje });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const d = v.dados;
  if (d.membroId) {
    if (Number(d.membroId) === Number(por)) return { sucesso: false, mensagem: "Ninguém registra a própria indicação." };
    const m = await membroParaDirigir(pool, d.membroId, hoje);
    if (!m.ok) return { sucesso: false, mensagem: m.mensagem };
  }
  if (d.funcao === "GESTOR_TECNICO") {
    const tipo = await lerTipo(pool, ent.tipoId);
    if (!ev.formacaoAtende(d.formacao, tipo.formacoes)) return { sucesso: false, mensagem: ev.mensagemFormacao(tipo.nome, tipo.formacoes) };
  }
  const nep = await nepotismo(pool, { membroId: d.membroId, remunerado: d.remunerado, externo: !d.membroId, declaracaoParentesco: d.declaracaoParentesco });
  if (nep) return { sucesso: false, mensagem: nep };
  try {
    const r = await pool.request().input("e", sql.Int, entidadeId).input("f", sql.NVarChar(20), d.funcao).input("fd", sql.NVarChar(80), d.funcaoDescricao)
      .input("m", sql.Int, d.membroId).input("ne", sql.NVarChar(120), d.nomeExterno).input("rem", sql.Bit, d.remunerado).input("fo", sql.NVarChar(80), d.formacao)
      .input("rp", sql.NVarChar(40), d.registroProfissional).input("dp", sql.Bit, d.declaracaoParentesco).input("ie", sql.Date, d.indicadoEm).input("ia", sql.NVarChar(200), d.indicacaoAto)
      .input("por", sql.Int, por).input("ma", sql.Date, d.mandatoAte)
      .query(`INSERT INTO EntidadeDirigentes (EntidadeId, Funcao, FuncaoDescricao, MembroId, NomeExterno, Remunerado, Formacao, RegistroProfissional, DeclaracaoParentesco,
                IndicadoEm, IndicacaoAto, IndicacaoRegistradaPor, MandatoAte)
              OUTPUT inserted.DirigenteId
              SELECT @e, @f, @fd, @m, @ne, @rem, @fo, @rp, @dp, @ie, @ia, @por, @ma
              WHERE EXISTS (SELECT 1 FROM EntidadesVinculadas WITH (UPDLOCK, ROWLOCK) WHERE EntidadeId = @e AND Status IN (N'PROPOSTA', N'ATIVA'))`);
    if (!r.recordset[0]) return MUDOU();
    const dirigenteId = r.recordset[0].DirigenteId;
    await registrarAuditoria({ tabela: "EntidadeDirigentes", registroId: dirigenteId, acao: "ENTIDADE_DIRIGENTE_INDICADO", usuarioId: por, dadosDepois: { entidadeId, ...d } });
    return { sucesso: true, dirigenteId, mensagem: "Indicação registrada. Falta a homologação da CLI (Estatuto, Art. 65 §1º)." };
  } catch (e) {
    if (violouUnicidade(e)) return { sucesso: false, mensagem: d.membroId && !ev.FUNCOES_UNICAS.includes(d.funcao) ? "Esta pessoa já ocupa esta função na entidade." : `Já há ${ev.FUNCOES[d.funcao]} em aberto nesta entidade: encerre o mandato anterior antes.` };
    throw e;
  }
}

async function homologarDirigente(pool, { dirigenteId, sessaoId, por, hoje = hojeBrasilia() }) {
  const l = await lerDirigente(pool, dirigenteId);
  if (!l) return NAO_EXISTE;
  if (l.Status !== "INDICADO") return { sucesso: false, mensagem: "Só a indicação que espera a CLI é homologada." };
  if (l.MembroId && Number(l.MembroId) === Number(por)) return { sucesso: false, mensagem: "Ninguém registra a homologação da própria indicação." };
  const ent = await lerEntidade(pool, l.EntidadeId);
  if (ent.status !== "ATIVA") return { sucesso: false, mensagem: "Primeiro registre a aprovação do vínculo pela CLI (a entidade ainda não é ativa)." };
  const reuniao = await lerReuniao(pool, sessaoId, "CLI", hoje);
  if (!reuniao) return { sucesso: false, mensagem: ESCOLHA_CLI };
  if (reuniao.data < l.IndicadoEm) return { sucesso: false, mensagem: `A reunião da CLI é anterior à indicação (${ev.br(l.IndicadoEm)}).` };
  // as regras de novo, no dia da homologação: o tipo pode ter mudado as formações e a Diretoria pode ter mudado
  if (l.Funcao === "GESTOR_TECNICO") {
    const tipo = await lerTipo(pool, ent.tipoId);
    if (!ev.formacaoAtende(l.Formacao, tipo.formacoes)) return { sucesso: false, mensagem: ev.mensagemFormacao(tipo.nome, tipo.formacoes) };
  }
  if (l.MembroId) {
    const m = await membroParaDirigir(pool, l.MembroId, hoje);
    if (!m.ok) return { sucesso: false, mensagem: m.mensagem };
  }
  const nep = await nepotismo(pool, { membroId: l.MembroId, remunerado: !!l.Remunerado, externo: !l.MembroId, declaracaoParentesco: !!l.DeclaracaoParentesco });
  if (nep) return { sucesso: false, mensagem: nep };
  const u = await pool.request().input("id", sql.Int, dirigenteId).input("s", sql.Int, reuniao.sessaoId).input("em", sql.Date, reuniao.data).input("por", sql.Int, por)
    .query(`UPDATE EntidadeDirigentes SET Status = N'HOMOLOGADO', HomologacaoSessaoId = @s, HomologadoEm = @em, HomologacaoRegistradaPor = @por
            WHERE DirigenteId = @id AND Status = N'INDICADO'`);
  if (!u.rowsAffected[0]) return MUDOU();
  await registrarAuditoria({ tabela: "EntidadeDirigentes", registroId: dirigenteId, acao: "ENTIDADE_DIRIGENTE_HOMOLOGADO", usuarioId: por, dadosDepois: { sessaoId: reuniao.sessaoId, em: reuniao.data } });
  return { sucesso: true, mensagem: "Homologado pela CLI." };
}

async function recusarDirigente(pool, { dirigenteId, dados, por, hoje = hojeBrasilia() }) {
  const l = await lerDirigente(pool, dirigenteId);
  if (!l) return NAO_EXISTE;
  if (l.Status !== "INDICADO") return { sucesso: false, mensagem: "Só a indicação que espera a CLI é recusada." };
  const reuniao = await lerReuniao(pool, dados.sessaoId, "CLI", hoje);
  if (!reuniao) return { sucesso: false, mensagem: ESCOLHA_CLI };
  if (reuniao.data < l.IndicadoEm) return { sucesso: false, mensagem: `A reunião da CLI é anterior à indicação (${ev.br(l.IndicadoEm)}).` };
  const obs = ev.texto(dados.observacao, { maximo: 500, rotulo: "A observação", obrigatorio: false, multilinha: true });
  if (!obs.valido) return { sucesso: false, mensagem: obs.mensagem };
  const u = await pool.request().input("id", sql.Int, dirigenteId).input("s", sql.Int, reuniao.sessaoId).input("em", sql.Date, reuniao.data).input("o", sql.NVarChar(500), obs.texto)
    .query(`UPDATE EntidadeDirigentes SET Status = N'RECUSADO', HomologacaoSessaoId = @s, RecusadoEm = @em, EncerramentoObs = @o WHERE DirigenteId = @id AND Status = N'INDICADO'`);
  if (!u.rowsAffected[0]) return MUDOU();
  await registrarAuditoria({ tabela: "EntidadeDirigentes", registroId: dirigenteId, acao: "ENTIDADE_DIRIGENTE_RECUSADO", usuarioId: por, dadosDepois: { sessaoId: reuniao.sessaoId, em: reuniao.data, observacao: obs.texto } });
  return { sucesso: true, mensagem: "Registrado: a CLI não homologou a indicação." };
}

async function encerrarDirigente(pool, { dirigenteId, dados, por, hoje = hojeBrasilia() }) {
  const l = await lerDirigente(pool, dirigenteId);
  if (!l) return NAO_EXISTE;
  if (!["INDICADO", "HOMOLOGADO"].includes(l.Status)) return { sucesso: false, mensagem: "Este mandato já não está em aberto." };
  const motivo = typeof dados.motivo === "string" ? dados.motivo.trim().toUpperCase() : "";
  if (!ev.MOTIVOS_ENCERRAMENTO_MANUAL.includes(motivo)) return { sucesso: false, mensagem: "Escolha o motivo do encerramento." };
  const data = ev.dataDoAto(dados.data, hoje, "a data do encerramento");
  if (!data.valido) return { sucesso: false, mensagem: data.mensagem };
  if (data.data < l.IndicadoEm) return { sucesso: false, mensagem: "O encerramento não é anterior à indicação." };
  const obs = ev.texto(dados.observacao, { maximo: 500, rotulo: "A observação", obrigatorio: motivo === "OUTRO", minimo: motivo === "OUTRO" ? 5 : 0, multilinha: true });
  if (!obs.valido) return { sucesso: false, mensagem: obs.mensagem };
  const u = await pool.request().input("id", sql.Int, dirigenteId).input("em", sql.Date, data.data).input("m", sql.NVarChar(25), motivo).input("o", sql.NVarChar(500), obs.texto).input("por", sql.Int, por)
    .input("st", sql.NVarChar(10), l.Status)
    .query(`UPDATE EntidadeDirigentes SET Status = N'ENCERRADO', EncerradoEm = @em, MotivoEncerramento = @m, EncerramentoObs = @o, EncerradoPor = @por WHERE DirigenteId = @id AND Status = @st`);
  if (!u.rowsAffected[0]) return MUDOU();
  await registrarAuditoria({ tabela: "EntidadeDirigentes", registroId: dirigenteId, acao: "ENTIDADE_DIRIGENTE_ENCERRADO", usuarioId: por, dadosAntes: { status: l.Status }, dadosDepois: { motivo, em: data.data, observacao: obs.texto } });
  return { sucesso: true, mensagem: "Mandato encerrado." };
}

// ================================================================ intervenção ================================================================
const COLUNAS_INTERVENCAO = `
  i.IntervencaoId, i.EntidadeId, i.Status, i.Motivo, i.Fatos, CONVERT(varchar(10), i.AbertaEm, 120) AS AbertaEm, i.AbertaPor,
  CONVERT(varchar(10), i.NotificadoEm, 120) AS NotificadoEm, i.NotificacaoForma, CONVERT(varchar(10), i.ManifestacaoEm, 120) AS ManifestacaoEm, i.ManifestacaoResumo,
  i.Urgencia, i.UrgenciaJustificativa, CONVERT(varchar(10), i.DecretadaEm, 120) AS DecretadaEm, i.DecretadaPor, i.Fundamentacao, i.InterventorMembroId, mi.Nome AS InterventorMembroNome,
  i.InterventorNome, i.AfastaDiretoria, CONVERT(varchar(10), i.PrazoRatificacao, 120) AS PrazoRatificacao, i.RatificacaoSessaoId, CONVERT(varchar(10), i.RatificacaoEm, 120) AS RatificacaoEm,
  i.RatificacaoObs, CONVERT(varchar(10), i.CaducadaEm, 120) AS CaducadaEm, CONVERT(varchar(10), i.DefesaCEIEm, 120) AS DefesaCEIEm, i.DefesaCEIReferencia,
  CONVERT(varchar(10), i.EncerradaEm, 120) AS EncerradaEm, i.EncerramentoMotivo, i.CorrecaoAta, i.DestituicaoAGSessaoId, i.DestituicaoAGResultado,
  CONVERT(varchar(10), i.DestituicaoAGEm, 120) AS DestituicaoAGEm, i.DestituicaoAGObs,
  (SELECT COUNT(*) FROM EntidadeDirigentes dd WHERE dd.IntervencaoId = i.IntervencaoId) AS Destituidos`;
function formaIntervencao(l, hoje, membroId = null) {
  const estado = ev.estadoEfetivo({ status: l.Status, prazoRatificacao: l.PrazoRatificacao }, hoje);
  const correndo = estado === "DECRETADA";
  return {
    intervencaoId: l.IntervencaoId, entidadeId: l.EntidadeId, status: estado, statusRotulo: ev.STATUS_INTERVENCAO[estado] || estado,
    motivo: l.Motivo, motivoRotulo: ev.MOTIVOS_INTERVENCAO[l.Motivo] || l.Motivo, fatos: l.Fatos, abertaEm: l.AbertaEm,
    notificadoEm: l.NotificadoEm, notificacaoForma: l.NotificacaoForma, manifestacaoEm: l.ManifestacaoEm, manifestacaoResumo: l.ManifestacaoResumo,
    // sem urgência, a decretação só a partir do 5º dia depois da notificação
    manifestacaoAte: l.NotificadoEm ? ev.manifestacaoAte(l.NotificadoEm) : null, decretavelDesde: l.NotificadoEm ? ev.decretavelDesde(l.NotificadoEm) : null,
    urgencia: !!l.Urgencia, urgenciaJustificativa: l.UrgenciaJustificativa, decretadaEm: l.DecretadaEm, fundamentacao: l.Fundamentacao,
    interventor: l.InterventorMembroId ? l.InterventorMembroNome : l.InterventorNome, interventorMembroId: l.InterventorMembroId, afastaDiretoria: !!l.AfastaDiretoria,
    prazoRatificacao: l.PrazoRatificacao, diasRestantes: correndo ? ev.diasEntre(hoje, l.PrazoRatificacao) : null,
    ratificacaoSessaoId: l.RatificacaoSessaoId, ratificacaoEm: l.RatificacaoEm, ratificacaoObs: l.RatificacaoObs, caducadaEm: l.CaducadaEm || (estado === "CADUCADA" ? ev.somarDias(l.PrazoRatificacao, 1) : null),
    defesaCEIEm: l.DefesaCEIEm, defesaCEIReferencia: l.DefesaCEIReferencia, encerradaEm: l.EncerradaEm, encerramentoMotivo: l.EncerramentoMotivo,
    vale: ev.intervencaoVale({ status: l.Status, prazoRatificacao: l.PrazoRatificacao }, hoje),
    // quem decretou não registra a decisão da CLI (o servidor recusa): a tela esconde o botão para ele
    decretadaPorMim: membroId != null && l.DecretadaPor != null && Number(l.DecretadaPor) === Number(membroId),
    correcaoAta: l.CorrecaoAta, destituidos: Number(l.Destituidos || 0),
    destituicaoAG: l.DestituicaoAGResultado ? { sessaoId: l.DestituicaoAGSessaoId, resultado: l.DestituicaoAGResultado, resultadoRotulo: ev.RESULTADOS_AG[l.DestituicaoAGResultado], em: l.DestituicaoAGEm, obs: l.DestituicaoAGObs } : null,
    // Art. 18, VII, "c": a destituição que a CLI ratificou espera a Assembleia
    destituicaoAguardandoAG: !!(l.RatificacaoEm && l.Status !== "NAO_RATIFICADA" && Number(l.Destituidos || 0) > 0 && !l.DestituicaoAGResultado)
  };
}
async function lerIntervencao(pool, intervencaoId) {
  const r = await pool.request().input("id", sql.Int, intervencaoId)
    .query(`SELECT ${COLUNAS_INTERVENCAO} FROM EntidadeIntervencoes i LEFT JOIN MembroReferencia mi ON mi.MembroId = i.InterventorMembroId WHERE i.IntervencaoId = @id`);
  return r.recordset[0] || null;
}

// A caducidade automática (Reg. Art. 47-A §2º): passado o 15º dia sem ratificação, a intervenção perde a eficácia. Roda no começo de cada pedido da rota e na rotina
// diária; quem marca grava na auditoria e avisa (o UPDATE condicional garante que cada uma é marcada e avisada uma vez só, mesmo com dois pedidos juntos).
async function caducarVencidas(pool, { hoje = hojeBrasilia(), deps = {} } = {}) {
  const r = await pool.request().input("h", sql.Date, hoje).query(`
    UPDATE i SET Status = N'CADUCADA', CaducadaEm = @h
    OUTPUT inserted.IntervencaoId, inserted.EntidadeId, CONVERT(varchar(10), inserted.PrazoRatificacao, 120) AS PrazoRatificacao
    FROM EntidadeIntervencoes i WHERE i.Status = N'DECRETADA' AND i.PrazoRatificacao < @h`);
  const caducadas = r.recordset;
  for (const c of caducadas) {
    await registrarAuditoria({ tabela: "EntidadeIntervencoes", registroId: c.IntervencaoId, acao: "ENTIDADE_INTERVENCAO_CADUCADA", usuarioId: null,
      dadosDepois: { entidadeId: c.EntidadeId, prazoRatificacao: c.PrazoRatificacao, caducadaEm: hoje, base: "Regimento Art. 47-A §2º" } });
    const ent = await lerEntidade(pool, c.EntidadeId);
    await avisar(pool, { regraChave: "ENTIDADE_INTERVENCAO_CADUCADA", mensagem: ev.textoCaducada({ entidade: ent ? ent.razaoSocial : "entidade vinculada", prazo: c.PrazoRatificacao }),
      referenciaId: c.IntervencaoId, deps });
  }
  return caducadas.map((c) => c.IntervencaoId);
}

async function avisar(pool, { regraChave, mensagem, referenciaId, fora = null, deps = {} }) {
  try {
    const canaisDb = require("./canaisDb");
    const { resolverDestinatariosPorPermissao } = require("./notificacoes");
    const lista = (await resolverDestinatariosPorPermissao(pool, { permissao: "entidades_vinculadas", nivel: "GLOBAL" }))
      .filter((d) => fora == null || Number(d.membroId) !== Number(fora)).map((d) => ({ membroId: d.membroId, nome: d.nome, email: d.email }));
    for (const d of lista) {
      await canaisDb.notificarAgora(pool, { regraChave, destinatarios: [d], mensagem, referenciaId, referenciaTabela: "EntidadeIntervencoes", aguardarEntrega: false, deps });
    }
    return lista.length;
  } catch (e) {
    console.error("[ENTIDADES] falha ao avisar:", e.message);
    return 0;
  }
}

async function abrirApuracao(pool, { entidadeId, dados, por, hoje = hojeBrasilia() }) {
  const ent = await lerEntidade(pool, entidadeId);
  if (!ent) return NAO_EXISTE;
  if (ent.status !== "ATIVA") return { sucesso: false, mensagem: "Só entidade ativa passa por apuração e intervenção." };
  const v = ev.validarApuracao(dados);
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  try {
    const r = await pool.request().input("e", sql.Int, entidadeId).input("m", sql.NVarChar(20), v.dados.motivo).input("f", sql.NVarChar(2000), v.dados.fatos)
      .input("h", sql.Date, hoje).input("por", sql.Int, por)
      .query(`INSERT INTO EntidadeIntervencoes (EntidadeId, Motivo, Fatos, AbertaEm, AbertaPor) OUTPUT inserted.IntervencaoId
              SELECT @e, @m, @f, @h, @por WHERE EXISTS (SELECT 1 FROM EntidadesVinculadas WITH (UPDLOCK, ROWLOCK) WHERE EntidadeId = @e AND Status = N'ATIVA')`);
    if (!r.recordset[0]) return MUDOU();
    const intervencaoId = r.recordset[0].IntervencaoId;
    await registrarAuditoria({ tabela: "EntidadeIntervencoes", registroId: intervencaoId, acao: "ENTIDADE_APURACAO_ABERTA", usuarioId: por, dadosDepois: { entidadeId, ...v.dados } });
    return { sucesso: true, intervencaoId, mensagem: "Apuração aberta (Regimento, Art. 47-A §1º). Notifique o gestor por escrito: ele tem 5 dias para se manifestar." };
  } catch (e) {
    if (violouUnicidade(e)) return { sucesso: false, mensagem: "Já há um processo de apuração ou intervenção em curso nesta entidade." };
    throw e;
  }
}

async function registrarNotificacao(pool, { intervencaoId, dados, por, hoje = hojeBrasilia() }) {
  const l = await lerIntervencao(pool, intervencaoId);
  if (!l) return NAO_EXISTE;
  if (l.Status !== "APURACAO") return { sucesso: false, mensagem: "A notificação é da apuração aberta." };
  const data = ev.dataDoAto(dados.notificadoEm, hoje, "a data da notificação");
  if (!data.valido) return { sucesso: false, mensagem: data.mensagem };
  if (data.data < l.AbertaEm) return { sucesso: false, mensagem: "A notificação não é anterior à abertura da apuração." };
  const forma = ev.texto(dados.forma, { minimo: 5, maximo: 200, rotulo: "Como o gestor foi notificado (por escrito: carta, e-mail com confirmação...)" });
  if (!forma.valido) return { sucesso: false, mensagem: forma.mensagem };
  // uma nova notificação recomeça os 5 dias e a manifestação anterior fica para trás
  const u = await pool.request().input("id", sql.Int, intervencaoId).input("em", sql.Date, data.data).input("f", sql.NVarChar(200), forma.texto).input("por", sql.Int, por)
    .query(`UPDATE EntidadeIntervencoes SET NotificadoEm = @em, NotificacaoForma = @f, NotificacaoRegistradaPor = @por, ManifestacaoEm = NULL, ManifestacaoResumo = NULL
            WHERE IntervencaoId = @id AND Status = N'APURACAO'`);
  if (!u.rowsAffected[0]) return MUDOU();
  await registrarAuditoria({ tabela: "EntidadeIntervencoes", registroId: intervencaoId, acao: "ENTIDADE_APURACAO_NOTIFICADA", usuarioId: por,
    dadosAntes: l.NotificadoEm ? { notificadoEm: l.NotificadoEm, forma: l.NotificacaoForma } : null, dadosDepois: { notificadoEm: data.data, forma: forma.texto } });
  return { sucesso: true, mensagem: `Notificação registrada. O gestor pode se manifestar até ${ev.br(ev.somarDias(data.data, ev.PRAZO_MANIFESTACAO_DIAS))} (Estatuto, Art. 65 §3º).` };
}

async function registrarManifestacao(pool, { intervencaoId, dados, por, hoje = hojeBrasilia() }) {
  const l = await lerIntervencao(pool, intervencaoId);
  if (!l) return NAO_EXISTE;
  if (l.Status !== "APURACAO") return { sucesso: false, mensagem: "A manifestação do gestor é registrada durante a apuração." };
  if (!l.NotificadoEm) return { sucesso: false, mensagem: "Registre primeiro a notificação do gestor." };
  const data = ev.dataDoAto(dados.manifestacaoEm, hoje, "a data da manifestação");
  if (!data.valido) return { sucesso: false, mensagem: data.mensagem };
  if (data.data < l.NotificadoEm) return { sucesso: false, mensagem: "A manifestação não é anterior à notificação." };
  const resumo = ev.texto(dados.resumo, { minimo: 10, maximo: 1000, rotulo: "O resumo da manifestação", multilinha: true });
  if (!resumo.valido) return { sucesso: false, mensagem: resumo.mensagem };
  const u = await pool.request().input("id", sql.Int, intervencaoId).input("em", sql.Date, data.data).input("r", sql.NVarChar(1000), resumo.texto)
    .query(`UPDATE EntidadeIntervencoes SET ManifestacaoEm = @em, ManifestacaoResumo = @r WHERE IntervencaoId = @id AND Status = N'APURACAO' AND NotificadoEm IS NOT NULL`);
  if (!u.rowsAffected[0]) return MUDOU();
  await registrarAuditoria({ tabela: "EntidadeIntervencoes", registroId: intervencaoId, acao: "ENTIDADE_APURACAO_MANIFESTACAO", usuarioId: por, dadosDepois: { manifestacaoEm: data.data } });
  return { sucesso: true, mensagem: "Manifestação do gestor registrada." };
}

async function arquivarApuracao(pool, { intervencaoId, dados, por, hoje = hojeBrasilia() }) {
  const l = await lerIntervencao(pool, intervencaoId);
  if (!l) return NAO_EXISTE;
  if (l.Status !== "APURACAO") return { sucesso: false, mensagem: "Só a apuração aberta é arquivada." };
  const motivo = ev.texto(dados.motivo, { minimo: 10, maximo: 1000, rotulo: "O motivo do arquivamento", multilinha: true });
  if (!motivo.valido) return { sucesso: false, mensagem: motivo.mensagem };
  const u = await pool.request().input("id", sql.Int, intervencaoId).input("h", sql.Date, hoje).input("por", sql.Int, por).input("m", sql.NVarChar(1000), motivo.texto)
    .query(`UPDATE EntidadeIntervencoes SET Status = N'ARQUIVADA', EncerradaEm = @h, EncerradaPor = @por, EncerramentoMotivo = @m WHERE IntervencaoId = @id AND Status = N'APURACAO'`);
  if (!u.rowsAffected[0]) return MUDOU();
  await registrarAuditoria({ tabela: "EntidadeIntervencoes", registroId: intervencaoId, acao: "ENTIDADE_APURACAO_ARQUIVADA", usuarioId: por, dadosDepois: { motivo: motivo.texto } });
  return { sucesso: true, mensagem: "Apuração arquivada." };
}

// Só o Pastor Presidente em exercício (a cadeira de Presidente na Diretoria Executiva) decreta e encerra a intervenção (Estatuto Art. 33, IV, e Art. 65 §2º).
async function ehPresidente(pool, membroId) { return ehPresidenteAtual(pool, sql, membroId); }

async function decretar(pool, { intervencaoId, dados, por, hoje = hojeBrasilia(), deps = {} }) {
  const l = await lerIntervencao(pool, intervencaoId);
  if (!l) return NAO_EXISTE;
  if (!(await ehPresidente(pool, por))) return { sucesso: false, proibido: true, mensagem: "Só o Pastor Presidente em exercício decreta a intervenção (Estatuto, Art. 65 §2º)." };
  const v = ev.validarDecretacao(dados, { iv: { status: l.Status, notificadoEm: l.NotificadoEm }, hoje });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const d = v.dados;
  // Depois de uma intervenção que a CLI não ratificou ou que caducou, a nova não usa a urgência: o gestor é notificado de novo e tem os 5 dias — senão a recusa
  // da CLI (Reg. Art. 47-A §2º) se contornaria decretando outra vez no mesmo dia (revisão de 03/11/2026).
  if (d.urgencia) {
    const antes = await pool.request().input("e", sql.Int, l.EntidadeId).input("i", sql.Int, intervencaoId)
      .query(`SELECT COUNT(*) AS n FROM EntidadeIntervencoes WHERE EntidadeId = @e AND IntervencaoId <> @i AND Status IN (N'NAO_RATIFICADA', N'CADUCADA')`);
    if (Number(antes.recordset[0].n) > 0) return { sucesso: false, mensagem: "Esta entidade já teve intervenção sem ratificação da CLI (recusada ou caducada): a nova exige a notificação do gestor e os 5 dias, sem urgência (Regimento, Art. 47-A §2º; Estatuto, Art. 65 §3º)." };
  }
  if (d.interventorMembroId) {
    const m = await membroParaDirigir(pool, d.interventorMembroId, hoje);
    if (!m.ok) return { sucesso: false, mensagem: `Interventor: ${m.mensagem}` };
  }
  const ent = await lerEntidade(pool, l.EntidadeId);
  if (ent.status !== "ATIVA") return { sucesso: false, mensagem: "Só entidade ativa recebe intervenção." };
  const u = await pool.request().input("id", sql.Int, intervencaoId).input("urg", sql.Bit, d.urgencia).input("uj", sql.NVarChar(1000), d.urgenciaJustificativa)
    .input("de", sql.Date, d.decretadaEm).input("por", sql.Int, por).input("f", sql.NVarChar(2000), d.fundamentacao).input("im", sql.Int, d.interventorMembroId)
    .input("in", sql.NVarChar(120), d.interventorNome).input("af", sql.Bit, d.afastaDiretoria).input("pr", sql.Date, d.prazoRatificacao)
    .query(`UPDATE EntidadeIntervencoes SET Status = N'DECRETADA', Urgencia = @urg, UrgenciaJustificativa = @uj, DecretadaEm = @de, DecretadaPor = @por, Fundamentacao = @f,
              InterventorMembroId = @im, InterventorNome = @in, AfastaDiretoria = @af, PrazoRatificacao = @pr
            WHERE IntervencaoId = @id AND Status = N'APURACAO'
              AND EXISTS (SELECT 1 FROM EntidadesVinculadas WITH (UPDLOCK, ROWLOCK) WHERE EntidadeId = EntidadeIntervencoes.EntidadeId AND Status = N'ATIVA')`);
  if (!u.rowsAffected[0]) return MUDOU();
  await registrarAuditoria({ tabela: "EntidadeIntervencoes", registroId: intervencaoId, acao: "ENTIDADE_INTERVENCAO_DECRETADA", usuarioId: por, dadosDepois: { entidadeId: l.EntidadeId, ...d } });
  await avisar(pool, { regraChave: "ENTIDADE_INTERVENCAO_DECRETADA", mensagem: ev.textoDecretada({ entidade: ent.razaoSocial, prazo: d.prazoRatificacao }), referenciaId: intervencaoId, fora: por, deps });
  return { sucesso: true, mensagem: `Intervenção decretada. A CLI precisa ratificá-la até ${ev.br(d.prazoRatificacao)}, ou ela perde a eficácia (Regimento, Art. 47-A §2º).` };
}

// A CLI ratificou (ou não) numa reunião dentro dos 15 dias. Se o registro chega depois do prazo e a rotina já marcou "perdeu a eficácia", a reunião feita a
// tempo prevalece — mas só até PRAZO_CORRECAO_CADUCIDADE_DIAS depois do prazo e com a referência da ata, e a correção avisa todo mundo (revisão de 03/11/2026).
async function ratificar(pool, { intervencaoId, dados, por, hoje = hojeBrasilia(), deps = {} }) {
  const l = await lerIntervencao(pool, intervencaoId);
  if (!l) return NAO_EXISTE;
  if (!["DECRETADA", "CADUCADA"].includes(l.Status)) return { sucesso: false, mensagem: "Só a intervenção decretada espera a ratificação da CLI." };
  if (Number(l.DecretadaPor) === Number(por)) return { sucesso: false, mensagem: "Quem decretou a intervenção não registra a decisão da CLI sobre ela." };
  const ent = await lerEntidade(pool, l.EntidadeId);
  if (!ent || ent.status !== "ATIVA") return { sucesso: false, mensagem: "A entidade não está mais ativa (extinta ou com o vínculo desfeito): a intervenção já foi encerrada." };
  const resultado = typeof dados.resultado === "string" ? dados.resultado.trim().toUpperCase() : "";
  if (!["RATIFICADA", "NAO_RATIFICADA"].includes(resultado)) return { sucesso: false, mensagem: "Informe se a CLI ratificou ou não." };
  const reuniao = await lerReuniao(pool, dados.sessaoId, "CLI", hoje);
  if (!reuniao) return { sucesso: false, mensagem: ESCOLHA_CLI };
  if (!ev.reuniaoNoPrazo(reuniao.data, { decretadaEm: l.DecretadaEm, prazoRatificacao: l.PrazoRatificacao })) {
    return { sucesso: false, mensagem: `A reunião precisa ser entre a decretação (${ev.br(l.DecretadaEm)}) e o fim do prazo (${ev.br(l.PrazoRatificacao)}). Depois disso a intervenção perdeu a eficácia (Regimento, Art. 47-A §2º).` };
  }
  const corrigindo = l.Status === "CADUCADA" || hoje > l.PrazoRatificacao;
  let ata = null;
  if (corrigindo) {
    const limite = ev.somarDias(l.PrazoRatificacao, ev.PRAZO_CORRECAO_CADUCIDADE_DIAS);
    if (hoje > limite) return { sucesso: false, mensagem: `O prazo fatal venceu em ${ev.br(l.PrazoRatificacao)} e a correção só cabia até ${ev.br(limite)}: a intervenção perdeu a eficácia. Uma nova exige nova apuração.` };
    const a = ev.texto(dados.ataReferencia, { minimo: 3, maximo: 200, rotulo: "A referência da ata da reunião da CLI (o registro chega depois do prazo)" });
    if (!a.valido) return { sucesso: false, mensagem: a.mensagem };
    ata = a.texto;
  }
  const obs = ev.texto(dados.observacao, { maximo: 500, rotulo: "A observação", obrigatorio: false, multilinha: true });
  if (!obs.valido) return { sucesso: false, mensagem: obs.mensagem };
  let r;
  try {
    r = await emTransacao(pool, async (t, rq) => {
      const u = await rq().input("id", sql.Int, intervencaoId).input("st", sql.NVarChar(15), resultado).input("s", sql.Int, reuniao.sessaoId).input("em", sql.Date, reuniao.data)
        .input("por", sql.Int, por).input("o", sql.NVarChar(500), obs.texto).input("ant", sql.NVarChar(15), l.Status).input("ata", sql.NVarChar(200), ata)
        .query(`UPDATE EntidadeIntervencoes SET Status = @st, RatificacaoSessaoId = @s, RatificacaoEm = @em, RatificacaoRegistradaPor = @por, RatificacaoObs = @o, CaducadaEm = NULL, CorrecaoAta = @ata
                WHERE IntervencaoId = @id AND Status = @ant
                  AND EXISTS (SELECT 1 FROM EntidadesVinculadas WITH (UPDLOCK, ROWLOCK) WHERE EntidadeId = EntidadeIntervencoes.EntidadeId AND Status = N'ATIVA')`);
      if (!u.rowsAffected[0]) return MUDOU();
      let destituidos = 0;
      // ratificada com o afastamento da diretoria: os mandatos que existiam na decretação se encerram por destituição (os indicados depois dela, não)
      if (resultado === "RATIFICADA" && l.AfastaDiretoria) {
        const d = await rq().input("e", sql.Int, l.EntidadeId).input("em", sql.Date, reuniao.data).input("de", sql.Date, l.DecretadaEm).input("iv", sql.Int, intervencaoId).input("por", sql.Int, por)
          .query(`UPDATE EntidadeDirigentes SET Status = N'ENCERRADO', EncerradoEm = ${ENCERRA_EM}, MotivoEncerramento = N'DESTITUICAO_INTERVENCAO', IntervencaoId = @iv, EncerradoPor = @por,
                    EncerramentoObs = N'Destituído pela intervenção ratificada pela CLI (Regimento, Art. 47-A). Direito de defesa no Conselho de Ética.'
                  WHERE EntidadeId = @e AND Status IN (N'INDICADO', N'HOMOLOGADO') AND IndicadoEm <= @de`);
        destituidos = d.rowsAffected[0] || 0;
      }
      await registrarAuditoriaNaTransacao(t, { tabela: "EntidadeIntervencoes", registroId: intervencaoId, acao: resultado === "RATIFICADA" ? "ENTIDADE_INTERVENCAO_RATIFICADA" : "ENTIDADE_INTERVENCAO_NAO_RATIFICADA",
        usuarioId: por, dadosAntes: { status: l.Status }, dadosDepois: { sessaoId: reuniao.sessaoId, em: reuniao.data, destituidos, observacao: obs.texto, corrigiuCaducidade: corrigindo, ata } });
      return { sucesso: true, destituidos, mensagem: resultado === "RATIFICADA"
        ? `Intervenção ratificada pela CLI.${destituidos ? ` ${destituidos} mandato(s) encerrado(s) por destituição; os destituídos têm direito de defesa no Conselho de Ética, e a destituição vai à próxima Assembleia Geral (Estatuto, Art. 18, VII, "c").` : ""}`
        : "Registrado: a CLI não ratificou; a intervenção ficou sem efeito." };
    });
  } catch (e) {
    if (violouUnicidade(e)) return { sucesso: false, mensagem: "Já há outro processo em curso nesta entidade: a correção da caducidade não cabe." };
    throw e;
  }
  if (r.sucesso && corrigindo && resultado === "RATIFICADA") {
    await avisar(pool, { regraChave: "ENTIDADE_INTERVENCAO_CORRIGIDA", mensagem: ev.textoCorrigida({ entidade: ent.razaoSocial, reuniao: reuniao.data }), referenciaId: intervencaoId, fora: por, deps });
  }
  return r;
}

// Depois da caducidade ou da não ratificação, uma nova decretação parte de uma nova apuração com os mesmos fatos. A notificação NÃO se aproveita: o gestor é
// notificado de novo e tem outros 5 dias (revisão de 03/11/2026: copiar a notificação deixava decretar no mesmo dia e contornar a recusa da CLI).
async function reabrirApuracao(pool, { intervencaoId, por, hoje = hojeBrasilia() }) {
  const l = await lerIntervencao(pool, intervencaoId);
  if (!l) return NAO_EXISTE;
  const estado = ev.estadoEfetivo({ status: l.Status, prazoRatificacao: l.PrazoRatificacao }, hoje);
  if (!["CADUCADA", "NAO_RATIFICADA"].includes(estado)) return { sucesso: false, mensagem: "Só depois que a intervenção perdeu a eficácia ou não foi ratificada." };
  if (l.Status === "DECRETADA") await caducarVencidas(pool, { hoje });
  try {
    const r = await pool.request().input("e", sql.Int, l.EntidadeId).input("m", sql.NVarChar(20), l.Motivo).input("f", sql.NVarChar(2000), l.Fatos).input("h", sql.Date, hoje).input("por", sql.Int, por)
      .query(`INSERT INTO EntidadeIntervencoes (EntidadeId, Motivo, Fatos, AbertaEm, AbertaPor)
              OUTPUT inserted.IntervencaoId
              SELECT @e, @m, @f, @h, @por WHERE EXISTS (SELECT 1 FROM EntidadesVinculadas WITH (UPDLOCK, ROWLOCK) WHERE EntidadeId = @e AND Status = N'ATIVA')`);
    if (!r.recordset[0]) return { sucesso: false, mensagem: "Só entidade ativa passa por apuração." };
    const novo = r.recordset[0].IntervencaoId;
    await registrarAuditoria({ tabela: "EntidadeIntervencoes", registroId: novo, acao: "ENTIDADE_APURACAO_REABERTA", usuarioId: por, dadosDepois: { origem: intervencaoId, entidadeId: l.EntidadeId } });
    return { sucesso: true, intervencaoId: novo, mensagem: "Nova apuração aberta com os mesmos fatos. O gestor precisa ser notificado de novo e ter 5 dias; a urgência não vale mais nesta entidade." };
  } catch (e) {
    if (violouUnicidade(e)) return { sucesso: false, mensagem: "Já há um processo de apuração ou intervenção em curso nesta entidade." };
    throw e;
  }
}

async function registrarDefesa(pool, { intervencaoId, dados, por, hoje = hojeBrasilia() }) {
  const l = await lerIntervencao(pool, intervencaoId);
  if (!l) return NAO_EXISTE;
  if (!["RATIFICADA", "ENCERRADA"].includes(l.Status) || !l.RatificacaoEm || !l.AfastaDiretoria) return { sucesso: false, mensagem: "A defesa no Conselho de Ética é dos diretores destituídos pela intervenção ratificada." };
  const data = ev.dataDoAto(dados.defesaEm, hoje, "a data da defesa");
  if (!data.valido) return { sucesso: false, mensagem: data.mensagem };
  if (data.data < l.DecretadaEm) return { sucesso: false, mensagem: "A defesa não é anterior à decretação." };
  const ref = ev.texto(dados.referencia, { minimo: 3, maximo: 200, rotulo: "A referência da defesa (protocolo no Conselho de Ética)" });
  if (!ref.valido) return { sucesso: false, mensagem: ref.mensagem };
  const u = await pool.request().input("id", sql.Int, intervencaoId).input("em", sql.Date, data.data).input("r", sql.NVarChar(200), ref.texto)
    .query(`UPDATE EntidadeIntervencoes SET DefesaCEIEm = @em, DefesaCEIReferencia = @r WHERE IntervencaoId = @id AND Status IN (N'RATIFICADA', N'ENCERRADA')`);
  if (!u.rowsAffected[0]) return MUDOU();
  await registrarAuditoria({ tabela: "EntidadeIntervencoes", registroId: intervencaoId, acao: "ENTIDADE_INTERVENCAO_DEFESA", usuarioId: por, dadosDepois: { defesaEm: data.data, referencia: ref.texto } });
  return { sucesso: true, mensagem: "Defesa no Conselho de Ética registrada." };
}

async function encerrarIntervencao(pool, { intervencaoId, dados, por, hoje = hojeBrasilia() }) {
  const l = await lerIntervencao(pool, intervencaoId);
  if (!l) return NAO_EXISTE;
  if (!(await ehPresidente(pool, por))) return { sucesso: false, proibido: true, mensagem: "Só o Pastor Presidente em exercício encerra a intervenção (Estatuto, Art. 65 §2º)." };
  const estado = ev.estadoEfetivo({ status: l.Status, prazoRatificacao: l.PrazoRatificacao }, hoje);
  if (!["DECRETADA", "RATIFICADA"].includes(estado)) return { sucesso: false, mensagem: "Só a intervenção em vigor é encerrada." };
  const motivo = ev.texto(dados.motivo, { minimo: 10, maximo: 1000, rotulo: "O motivo do encerramento (a gestão devolvida a quem)", multilinha: true });
  if (!motivo.valido) return { sucesso: false, mensagem: motivo.mensagem };
  const u = await pool.request().input("id", sql.Int, intervencaoId).input("h", sql.Date, hoje).input("por", sql.Int, por).input("m", sql.NVarChar(1000), motivo.texto)
    .input("st", sql.NVarChar(15), l.Status)
    .query(`UPDATE EntidadeIntervencoes SET Status = N'ENCERRADA', EncerradaEm = @h, EncerradaPor = @por, EncerramentoMotivo = @m
            WHERE IntervencaoId = @id AND Status = @st AND (Status = N'RATIFICADA' OR PrazoRatificacao >= @h)`);
  if (!u.rowsAffected[0]) return MUDOU();
  await registrarAuditoria({ tabela: "EntidadeIntervencoes", registroId: intervencaoId, acao: "ENTIDADE_INTERVENCAO_ENCERRADA", usuarioId: por, dadosAntes: { status: l.Status }, dadosDepois: { motivo: motivo.texto } });
  return { sucesso: true, mensagem: "Intervenção encerrada." };
}

// ================================================================ prestação de contas ================================================================
const COLUNAS_PRESTACAO = `
  p.PrestacaoId, p.EntidadeId, p.Periodo, CONVERT(varchar(10), p.Inicio, 120) AS Inicio, CONVERT(varchar(10), p.Fim, 120) AS Fim, CONVERT(varchar(10), p.EntregueEm, 120) AS EntregueEm,
  p.RelatorioAtividades, p.BalancoAuditado, p.AuditoriaOrgao, p.Observacao, p.ApreciacaoSessaoId, CONVERT(varchar(10), p.ApreciadaEm, 120) AS ApreciadaEm, p.Resultado, p.ApreciacaoObs,
  CONVERT(varchar(10), p.CFVerificadaEm, 120) AS CFVerificadaEm, p.CFResultado, p.CFObs`;
function formaPrestacao(l) {
  return {
    prestacaoId: l.PrestacaoId, entidadeId: l.EntidadeId, periodo: l.Periodo, inicio: l.Inicio, fim: l.Fim, entregueEm: l.EntregueEm,
    relatorioAtividades: !!l.RelatorioAtividades, balancoAuditado: !!l.BalancoAuditado, auditoriaOrgao: l.AuditoriaOrgao, observacao: l.Observacao,
    apreciacaoSessaoId: l.ApreciacaoSessaoId, apreciadaEm: l.ApreciadaEm, resultado: l.Resultado, resultadoRotulo: l.Resultado ? ev.RESULTADOS_APRECIACAO[l.Resultado] : null, apreciacaoObs: l.ApreciacaoObs,
    cfVerificadaEm: l.CFVerificadaEm, cfResultado: l.CFResultado, cfResultadoRotulo: l.CFResultado ? ev.RESULTADOS_CF[l.CFResultado] : null, cfObs: l.CFObs
  };
}
async function prestacoesDa(pool, entidadeId) {
  const r = await pool.request().input("e", sql.Int, entidadeId).query(`SELECT ${COLUNAS_PRESTACAO} FROM EntidadePrestacoes p WHERE p.EntidadeId = @e ORDER BY p.Inicio`);
  return r.recordset.map(formaPrestacao);
}
// Os períodos da entidade com a situação de cada um (o mesmo cálculo no painel, na ficha e no aviso). Proposta e não aprovada não devem nada; a extinta e a
// desfeita devem até o período em que deixaram de existir.
function periodosDaEntidade(ent, prestacoes, hoje) {
  if (!ent.vinculo) return [];
  const ate = ent.status === "EXTINTA" && ent.extincao ? ent.extincao.em : (ent.status === "DESFEITA" && ent.vinculoAG ? ent.vinculoAG.em : hoje);
  const lista = ev.periodosDesde(ent.vinculo.em, ent.periodicidade, ent.prazoEntregaDias, ate < hoje ? ate : hoje);
  return ev.situacaoDosPeriodos(lista, prestacoes, hoje);
}

async function registrarPrestacao(pool, { entidadeId, dados, por, hoje = hojeBrasilia() }) {
  const ent = await lerEntidade(pool, entidadeId);
  if (!ent) return NAO_EXISTE;
  if (!ent.vinculo) return { sucesso: false, mensagem: "A entidade ainda não tem vínculo aprovado: não há período a prestar contas." };
  const periodos = periodosDaEntidade(ent, await prestacoesDa(pool, entidadeId), hoje);
  const codigo = typeof dados.periodo === "string" ? dados.periodo.trim().toUpperCase() : "";
  const p = periodos.find((x) => x.codigo === codigo);
  if (!p) return { sucesso: false, mensagem: "Escolha um período desta entidade." };
  if (p.situacao === "EM_CURSO") return { sucesso: false, mensagem: "O período ainda não terminou." };
  if (p.prestacao && p.prestacao.resultado) return { sucesso: false, mensagem: "Esta prestação de contas já foi apreciada pela CLI: não muda mais." };
  const v = ev.validarEntrega(dados, { periodo: p, hoje });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  try {
    if (p.prestacao) {
      const u = await pool.request().input("id", sql.Int, p.prestacao.prestacaoId).input("em", sql.Date, v.dados.entregueEm).input("ao", sql.NVarChar(150), v.dados.auditoriaOrgao)
        .input("o", sql.NVarChar(1000), v.dados.observacao).input("por", sql.Int, por)
        .query(`UPDATE EntidadePrestacoes SET EntregueEm = @em, RelatorioAtividades = 1, BalancoAuditado = 1, AuditoriaOrgao = @ao, Observacao = @o, RegistradaPor = @por, RegistradaEm = SYSUTCDATETIME()
                WHERE PrestacaoId = @id AND Resultado IS NULL`);
      if (!u.rowsAffected[0]) return MUDOU();
      await registrarAuditoria({ tabela: "EntidadePrestacoes", registroId: p.prestacao.prestacaoId, acao: "ENTIDADE_PRESTACAO_CORRIGIDA", usuarioId: por,
        dadosAntes: { entregueEm: p.prestacao.entregueEm, auditoriaOrgao: p.prestacao.auditoriaOrgao }, dadosDepois: v.dados });
      return { sucesso: true, prestacaoId: p.prestacao.prestacaoId, mensagem: "Prestação de contas corrigida." };
    }
    const r = await pool.request().input("e", sql.Int, entidadeId).input("p", sql.NVarChar(7), p.codigo).input("i", sql.Date, p.inicio).input("f", sql.Date, p.fim)
      .input("em", sql.Date, v.dados.entregueEm).input("ao", sql.NVarChar(150), v.dados.auditoriaOrgao).input("o", sql.NVarChar(1000), v.dados.observacao).input("por", sql.Int, por)
      .input("per", sql.NVarChar(10), ent.periodicidade)
      .query(`INSERT INTO EntidadePrestacoes (EntidadeId, Periodo, Inicio, Fim, EntregueEm, RelatorioAtividades, BalancoAuditado, AuditoriaOrgao, Observacao, RegistradaPor)
              OUTPUT inserted.PrestacaoId SELECT @e, @p, @i, @f, @em, 1, 1, @ao, @o, @por
              WHERE EXISTS (SELECT 1 FROM EntidadesVinculadas WITH (UPDLOCK, ROWLOCK) WHERE EntidadeId = @e AND Periodicidade = @per)`);
    if (!r.recordset[0]) return MUDOU("A periodicidade desta entidade mudou enquanto isso. Atualize a tela.");
    const prestacaoId = r.recordset[0].PrestacaoId;
    await registrarAuditoria({ tabela: "EntidadePrestacoes", registroId: prestacaoId, acao: "ENTIDADE_PRESTACAO_ENTREGUE", usuarioId: por, dadosDepois: { entidadeId, periodo: p.codigo, ...v.dados } });
    return { sucesso: true, prestacaoId, mensagem: "Prestação de contas registrada. Falta a apreciação da CLI." };
  } catch (e) {
    if (violouUnicidade(e)) return MUDOU("A prestação deste período acabou de ser registrada por outra pessoa. Atualize a tela.");
    throw e;
  }
}

async function lerPrestacao(pool, prestacaoId) {
  const r = await pool.request().input("id", sql.Int, prestacaoId).query(`SELECT ${COLUNAS_PRESTACAO} FROM EntidadePrestacoes p WHERE p.PrestacaoId = @id`);
  return r.recordset[0] ? formaPrestacao(r.recordset[0]) : null;
}

async function apreciarPrestacao(pool, { prestacaoId, dados, por, hoje = hojeBrasilia() }) {
  const p = await lerPrestacao(pool, prestacaoId);
  if (!p) return NAO_EXISTE;
  if (p.resultado) return { sucesso: false, mensagem: "Esta prestação de contas já foi apreciada." };
  const resultado = typeof dados.resultado === "string" ? dados.resultado.trim().toUpperCase() : "";
  if (!ev.RESULTADOS_APRECIACAO[resultado]) return { sucesso: false, mensagem: "Escolha o resultado da apreciação." };
  const reuniao = await lerReuniao(pool, dados.sessaoId, "CLI", hoje);
  if (!reuniao) return { sucesso: false, mensagem: ESCOLHA_CLI };
  if (reuniao.data < p.entregueEm) return { sucesso: false, mensagem: `A reunião da CLI é anterior à entrega (${ev.br(p.entregueEm)}).` };
  const exige = resultado !== "APROVADA";
  const obs = ev.texto(dados.observacao, { minimo: exige ? 10 : 0, maximo: 1000, rotulo: exige ? "As ressalvas ou o motivo da reprovação" : "A observação", obrigatorio: exige, multilinha: true });
  if (!obs.valido) return { sucesso: false, mensagem: obs.mensagem };
  const u = await pool.request().input("id", sql.Int, prestacaoId).input("s", sql.Int, reuniao.sessaoId).input("em", sql.Date, reuniao.data).input("r", sql.NVarChar(25), resultado)
    .input("o", sql.NVarChar(1000), obs.texto).input("por", sql.Int, por)
    .query(`UPDATE EntidadePrestacoes SET ApreciacaoSessaoId = @s, ApreciadaEm = @em, Resultado = @r, ApreciacaoObs = @o, ApreciacaoRegistradaPor = @por
            WHERE PrestacaoId = @id AND Resultado IS NULL AND EntregueEm <= @em`);
  if (!u.rowsAffected[0]) return MUDOU();
  await registrarAuditoria({ tabela: "EntidadePrestacoes", registroId: prestacaoId, acao: "ENTIDADE_PRESTACAO_APRECIADA", usuarioId: por, dadosDepois: { resultado, sessaoId: reuniao.sessaoId, em: reuniao.data, observacao: obs.texto } });
  return { sucesso: true, mensagem: "Apreciação da CLI registrada." };
}

// Art. 66 §3º: a verificação anual do Conselho Fiscal (no período que fecha o ano).
async function verificacaoConselhoFiscal(pool, { prestacaoId, dados, por, hoje = hojeBrasilia() }) {
  const p = await lerPrestacao(pool, prestacaoId);
  if (!p) return NAO_EXISTE;
  if (p.fim.slice(5) !== "12-31") return { sucesso: false, mensagem: "A verificação anual do Conselho Fiscal vai no período que fecha o ano (Estatuto, Art. 66 §3º)." };
  if (p.cfResultado) return { sucesso: false, mensagem: "A verificação deste ano já foi registrada." };
  const resultado = typeof dados.resultado === "string" ? dados.resultado.trim().toUpperCase() : "";
  if (!ev.RESULTADOS_CF[resultado]) return { sucesso: false, mensagem: "Informe o resultado da verificação do Conselho Fiscal." };
  const data = ev.dataDoAto(dados.verificadaEm, hoje, "a data da verificação");
  if (!data.valido) return { sucesso: false, mensagem: data.mensagem };
  if (data.data <= p.fim) return { sucesso: false, mensagem: "A verificação é depois do fim do exercício." };
  const exige = resultado === "IRREGULARIDADE";
  const obs = ev.texto(dados.observacao, { minimo: exige ? 10 : 0, maximo: 1000, rotulo: exige ? "A irregularidade encontrada" : "A observação", obrigatorio: exige, multilinha: true });
  if (!obs.valido) return { sucesso: false, mensagem: obs.mensagem };
  const u = await pool.request().input("id", sql.Int, prestacaoId).input("em", sql.Date, data.data).input("r", sql.NVarChar(15), resultado).input("o", sql.NVarChar(1000), obs.texto).input("por", sql.Int, por)
    .query(`UPDATE EntidadePrestacoes SET CFVerificadaEm = @em, CFResultado = @r, CFObs = @o, CFRegistradaPor = @por WHERE PrestacaoId = @id AND CFResultado IS NULL`);
  if (!u.rowsAffected[0]) return MUDOU();
  await registrarAuditoria({ tabela: "EntidadePrestacoes", registroId: prestacaoId, acao: "ENTIDADE_PRESTACAO_CF", usuarioId: por, dadosDepois: { resultado, em: data.data, observacao: obs.texto } });
  return { sucesso: true, mensagem: "Verificação do Conselho Fiscal registrada." };
}

// ================================================================ extinção ================================================================
async function extinguir(pool, { entidadeId, dados, por, hoje = hojeBrasilia() }) {
  const ent = await lerEntidade(pool, entidadeId);
  if (!ent) return NAO_EXISTE;
  if (ent.status !== "ATIVA") return { sucesso: false, mensagem: "Só a entidade ativa é extinta." };
  if (ent.aguardandoAG === "VINCULO") return { sucesso: false, mensagem: "A criação desta entidade ainda espera a Assembleia: registre primeiro a ratificação (ou a não ratificação, que desfaz o vínculo)." };
  const v = ev.validarExtincao(dados, { natureza: ent.natureza });
  if (!v.valido) return { sucesso: false, mensagem: v.mensagem };
  const reuniao = await lerReuniao(pool, dados.sessaoId, "CLI", hoje);
  if (!reuniao) return { sucesso: false, mensagem: ESCOLHA_CLI };
  if (reuniao.data < ent.vinculo.em) return { sucesso: false, mensagem: "A reunião da extinção é anterior à do vínculo." };
  // Art. 19 §1º: a Assembleia já recusou uma extinção desta entidade — a CLI só a renova com nova autorização da Assembleia
  let autorizacao = null;
  if (ent.extincaoVetadaEm) {
    autorizacao = dados.autorizacaoAGSessaoId == null || dados.autorizacaoAGSessaoId === "" ? null : await lerReuniao(pool, dados.autorizacaoAGSessaoId, "AG", hoje);
    if (!autorizacao || autorizacao.data < ent.extincaoVetadaEm) {
      return { sucesso: false, mensagem: `A Assembleia Geral não ratificou a extinção desta entidade em ${ev.br(ent.extincaoVetadaEm)}: a CLI só a renova com nova autorização da Assembleia (Estatuto, Art. 19 §1º). Escolha a Assembleia posterior que autorizou.` };
    }
  }
  return emTransacao(pool, async (t, rq) => {
    const u = await rq().input("id", sql.Int, entidadeId).input("s", sql.Int, reuniao.sessaoId).input("em", sql.Date, reuniao.data).input("por", sql.Int, por)
      .input("d", sql.NVarChar(30), v.dados.destinoPatrimonio).input("n", sql.NVarChar(150), v.dados.destinatarioNome).input("c", sql.Char(14), v.dados.destinatarioCnpj)
      .input("b", sql.NVarChar(1000), v.dados.bensComodato).input("aut", sql.Int, autorizacao ? autorizacao.sessaoId : null)
      .query(`UPDATE EntidadesVinculadas SET Status = N'EXTINTA', ExtincaoSessaoId = @s, ExtincaoEm = @em, ExtincaoRegistradaPor = @por, DestinoPatrimonio = @d, DestinatarioNome = @n,
                DestinatarioCnpj = @c, BensComodato = @b, ExtincaoAutorizacaoAGSessaoId = @aut, ExtincaoAGSessaoId = NULL, ExtincaoAGResultado = NULL, ExtincaoAGEm = NULL, ExtincaoAGObs = NULL
              WHERE EntidadeId = @id AND Status = N'ATIVA'`);
    if (!u.rowsAffected[0]) return MUDOU();
    const d = await rq().input("e", sql.Int, entidadeId).input("em", sql.Date, reuniao.data).input("por", sql.Int, por)
      .query(`UPDATE EntidadeDirigentes SET Status = N'ENCERRADO', EncerradoEm = ${ENCERRA_EM}, MotivoEncerramento = N'EXTINCAO', EncerradoPor = @por
              WHERE EntidadeId = @e AND Status IN (N'INDICADO', N'HOMOLOGADO')`);
    // a intervenção em vigor se encerra e a apuração aberta perde o objeto
    await fecharProcessosDaEntidade(rq, { entidadeId, hoje, por, motivo: "Entidade extinta (Estatuto, Art. 68)." });
    await registrarAuditoriaNaTransacao(t, { tabela: "EntidadesVinculadas", registroId: entidadeId, acao: "ENTIDADE_EXTINTA", usuarioId: por,
      dadosDepois: { sessaoId: reuniao.sessaoId, em: reuniao.data, ...v.dados, autorizacaoAGSessaoId: autorizacao ? autorizacao.sessaoId : null, mandatosEncerrados: d.rowsAffected[0] || 0 } });
    return { sucesso: true, mensagem: "Extinção registrada; os mandatos e a intervenção em vigor foram encerrados. Leve à próxima Assembleia Geral para a ratificação (Estatuto, Art. 18, VII, \"b\")." };
  });
}

// A entidade deixou de existir para a Igreja (extinta ou com o vínculo desfeito): a intervenção em vigor se encerra e a apuração aberta se arquiva — nada fica
// "valendo" nem avisando sobre uma entidade que não é mais vinculada.
async function fecharProcessosDaEntidade(rq, { entidadeId, hoje, por, motivo }) {
  await rq().input("e", sql.Int, entidadeId).input("h", sql.Date, hoje).input("por", sql.Int, por).input("m", sql.NVarChar(1000), motivo)
    .query(`UPDATE EntidadeIntervencoes SET Status = CASE WHEN Status = N'APURACAO' THEN N'ARQUIVADA' ELSE N'ENCERRADA' END, EncerradaEm = @h, EncerradaPor = @por, EncerramentoMotivo = @m
            WHERE EntidadeId = @e AND Status IN (N'APURACAO', N'RATIFICADA', N'DECRETADA') AND (Status <> N'DECRETADA' OR PrazoRatificacao >= @h)`);
  await rq().input("e", sql.Int, entidadeId).input("h", sql.Date, hoje)
    .query(`UPDATE EntidadeIntervencoes SET Status = N'CADUCADA', CaducadaEm = @h WHERE EntidadeId = @e AND Status = N'DECRETADA' AND PrazoRatificacao < @h`);
}

// Art. 18, VII, "c", e Art. 19: a Assembleia Geral sobre a destituição que a ratificação da intervenção produziu. Não ratificada, a destituição não se renova sem nova
// autorização da Assembleia; os destituídos podem ser indicados de novo pelo caminho de sempre (indicação e homologação).
async function registrarAssembleiaDestituicao(pool, { intervencaoId, dados, por, hoje = hojeBrasilia() }) {
  const l = await lerIntervencao(pool, intervencaoId);
  if (!l) return NAO_EXISTE;
  const iv = formaIntervencao(l, hoje);
  if (!iv.destituicaoAguardandoAG) return { sucesso: false, mensagem: "Esta intervenção não tem destituição esperando a Assembleia." };
  const resultado = typeof dados.resultado === "string" ? dados.resultado.trim().toUpperCase() : "";
  if (!ev.RESULTADOS_AG[resultado]) return { sucesso: false, mensagem: "Informe se a Assembleia ratificou ou não." };
  const reuniao = await lerReuniao(pool, dados.sessaoId, "AG", hoje);
  if (!reuniao) return { sucesso: false, mensagem: ESCOLHA_AG };
  if (reuniao.data < l.RatificacaoEm) return { sucesso: false, mensagem: `A Assembleia escolhida é anterior à ratificação da CLI (${ev.br(l.RatificacaoEm)}).` };
  const obs = ev.texto(dados.observacao, { maximo: 500, rotulo: "A observação", obrigatorio: resultado === "NAO_RATIFICADA", minimo: resultado === "NAO_RATIFICADA" ? 10 : 0, multilinha: true });
  if (!obs.valido) return { sucesso: false, mensagem: obs.mensagem };
  const u = await pool.request().input("id", sql.Int, intervencaoId).input("s", sql.Int, reuniao.sessaoId).input("r", sql.NVarChar(15), resultado).input("em", sql.Date, reuniao.data).input("o", sql.NVarChar(500), obs.texto)
    .query(`UPDATE EntidadeIntervencoes SET DestituicaoAGSessaoId = @s, DestituicaoAGResultado = @r, DestituicaoAGEm = @em, DestituicaoAGObs = @o WHERE IntervencaoId = @id AND DestituicaoAGResultado IS NULL`);
  if (!u.rowsAffected[0]) return MUDOU();
  await registrarAuditoria({ tabela: "EntidadeIntervencoes", registroId: intervencaoId, acao: `ENTIDADE_AG_DESTITUICAO_${resultado}`, usuarioId: por, dadosDepois: { sessaoId: reuniao.sessaoId, em: reuniao.data, observacao: obs.texto } });
  return { sucesso: true, mensagem: resultado === "RATIFICADA" ? "A Assembleia ratificou a destituição." : "Registrado: a Assembleia não ratificou a destituição. Quem foi destituído pode ser indicado de novo (indicação do Presidente e homologação da CLI)." };
}

// ================================================================ leitura: ficha, lista e painel ================================================================
async function dirigentesDa(pool, entidadeId, hoje) {
  const r = await pool.request().input("e", sql.Int, entidadeId)
    .query(`SELECT ${COLUNAS_DIRIGENTE} FROM EntidadeDirigentes d LEFT JOIN MembroReferencia m ON m.MembroId = d.MembroId WHERE d.EntidadeId = @e
            ORDER BY CASE WHEN d.Status IN (N'INDICADO', N'HOMOLOGADO') THEN 0 ELSE 1 END, d.IndicadoEm DESC, d.DirigenteId DESC`);
  return r.recordset.map((l) => formaDirigente(l, hoje));
}
async function intervencoesDa(pool, entidadeId, hoje, membroId = null) {
  const r = await pool.request().input("e", sql.Int, entidadeId)
    .query(`SELECT ${COLUNAS_INTERVENCAO} FROM EntidadeIntervencoes i LEFT JOIN MembroReferencia mi ON mi.MembroId = i.InterventorMembroId WHERE i.EntidadeId = @e ORDER BY i.IntervencaoId DESC`);
  return r.recordset.map((l) => formaIntervencao(l, hoje, membroId));
}
// O gestor técnico habilitado (Art. 153): homologado e com a formação aceita hoje pelo tipo. Tipo sem formação exigida não pede nada.
function pendenciaGestor(ent, dirigentes, formacoesDoTipo) {
  if (ent.status !== "ATIVA" || !formacoesDoTipo.length) return null;
  const ok = dirigentes.some((d) => d.funcao === "GESTOR_TECNICO" && d.status === "HOMOLOGADO" && d.situacao !== "MANDATO_VENCIDO" && ev.formacaoAtende(d.formacao, formacoesDoTipo));
  return ok ? null : `Sem gestor técnico homologado com a formação exigida (${formacoesDoTipo.join(" ou ")} — Regimento, Art. 153).`;
}

async function detalharEntidade(pool, { entidadeId, hoje = hojeBrasilia(), membroId = null }) {
  const ent = await lerEntidade(pool, entidadeId);
  if (!ent) return null;
  const [dirigentes, intervencoes, prestacoes, tipo] = [await dirigentesDa(pool, entidadeId, hoje), await intervencoesDa(pool, entidadeId, hoje, membroId), await prestacoesDa(pool, entidadeId), await lerTipo(pool, ent.tipoId)];
  const periodos = periodosDaEntidade(ent, prestacoes, hoje);
  const emVigor = intervencoes.find((i) => i.vale) || null;
  return {
    ...ent, formacoesExigidas: tipo ? tipo.formacoes : [],
    dirigentes: dirigentes.map((d) => ({ ...d, afastadoPelaIntervencao: !!(emVigor && emVigor.afastaDiretoria && ["INDICADO", "HOMOLOGADO"].includes(d.status) && d.indicadoEm <= emVigor.decretadaEm) })),
    intervencoes, periodos: periodos.slice().reverse(), emIntervencao: !!emVigor,
    pendencias: [
      pendenciaGestor(ent, dirigentes, tipo ? tipo.formacoes : []),
      ...periodos.filter((p) => p.situacao === "ATRASADA").map((p) => `Prestação de contas do período ${p.codigo} atrasada (venceu em ${ev.br(p.prazo)}).`),
      ...periodos.filter((p) => p.cfPendente).map((p) => `Falta a verificação anual do Conselho Fiscal do exercício ${p.codigo.slice(0, 4)} (Estatuto, Art. 66 §3º).`)
    ].filter(Boolean)
  };
}

// A lista (com o resumo de cada uma) e o painel de pendências. Entidades vinculadas são poucas (dezenas): a conta dos períodos é feita aqui, como na ficha.
async function listarEntidades(pool, { hoje = hojeBrasilia(), status = null } = {}) {
  const rq = pool.request();
  if (status) rq.input("st", sql.NVarChar(15), status);
  const r = await rq.query(`SELECT TOP 500 ${COLUNAS_ENTIDADE} FROM EntidadesVinculadas e JOIN EntidadeTipos t ON t.TipoId = e.TipoId ${status ? "WHERE e.Status = @st" : ""} ORDER BY e.RazaoSocial`);
  const entidades = r.recordset.map(formaEntidade);
  if (!entidades.length) return [];
  const [pres, dirs, ivs, form] = await Promise.all([
    pool.request().query(`SELECT ${COLUNAS_PRESTACAO} FROM EntidadePrestacoes p`),
    pool.request().query(`SELECT ${COLUNAS_DIRIGENTE} FROM EntidadeDirigentes d LEFT JOIN MembroReferencia m ON m.MembroId = d.MembroId WHERE d.Status IN (N'INDICADO', N'HOMOLOGADO')`),
    pool.request().query(`SELECT ${COLUNAS_INTERVENCAO} FROM EntidadeIntervencoes i LEFT JOIN MembroReferencia mi ON mi.MembroId = i.InterventorMembroId WHERE i.Status IN (N'APURACAO', N'DECRETADA', N'RATIFICADA')`),
    pool.request().query(`SELECT TipoId, Formacao FROM EntidadeTipoFormacoes`)
  ]);
  const agrupar = (linhas, chave) => { const m = new Map(); for (const l of linhas) { if (!m.has(l[chave])) m.set(l[chave], []); m.get(l[chave]).push(l); } return m; };
  const presPor = agrupar(pres.recordset.map(formaPrestacao), "entidadeId");
  const dirPor = agrupar(dirs.recordset.map((l) => formaDirigente(l, hoje)), "entidadeId");
  const ivPor = agrupar(ivs.recordset.map((l) => formaIntervencao(l, hoje)), "entidadeId");
  const formPor = new Map();
  for (const l of form.recordset) { if (!formPor.has(l.TipoId)) formPor.set(l.TipoId, []); formPor.get(l.TipoId).push(l.Formacao); }
  return entidades.map((e) => {
    const periodos = periodosDaEntidade(e, presPor.get(e.entidadeId) || [], hoje);
    const dirigentes = dirPor.get(e.entidadeId) || [];
    const iv = (ivPor.get(e.entidadeId) || [])[0] || null;
    return {
      ...e,
      intervencao: iv ? { intervencaoId: iv.intervencaoId, status: iv.status, statusRotulo: iv.statusRotulo, prazoRatificacao: iv.prazoRatificacao, diasRestantes: iv.diasRestantes,
        decretavelDesde: iv.decretavelDesde, notificadoEm: iv.notificadoEm } : null,
      atrasadas: periodos.filter((p) => p.situacao === "ATRASADA").map((p) => ({ codigo: p.codigo, prazo: p.prazo })),
      aguardandoApreciacao: periodos.filter((p) => p.situacao === "ENTREGUE").map((p) => ({ codigo: p.codigo, prestacaoId: p.prestacao.prestacaoId })),
      cfPendente: periodos.filter((p) => p.cfPendente).map((p) => ({ codigo: p.codigo, prestacaoId: p.prestacao.prestacaoId })),
      indicadosAguardando: dirigentes.filter((d) => d.status === "INDICADO").length,
      mandatosVencidos: dirigentes.filter((d) => d.situacao === "MANDATO_VENCIDO").length,
      pendenciaGestor: pendenciaGestor(e, dirigentes, formPor.get(e.tipoId) || [])
    };
  });
}

async function painel(pool, { hoje = hojeBrasilia() } = {}) {
  const lista = await listarEntidades(pool, { hoje });
  const nome = (e) => e.nomeFantasia || e.razaoSocial;
  // Art. 19: a ratificação é na PRIMEIRA reunião da Assembleia depois da CLI — se uma Assembleia já aconteceu e nada foi registrado, o painel avisa
  const ags = (await reunioesEncerradas(pool, "AG")).map((s) => s.data);
  const jaHouve = (desde) => ags.some((d) => d >= desde);
  const destituicoes = await pool.request().query(`
    SELECT i.EntidadeId, CONVERT(varchar(10), i.RatificacaoEm, 120) AS RatificacaoEm FROM EntidadeIntervencoes i
    WHERE i.RatificacaoEm IS NOT NULL AND i.Status IN (N'RATIFICADA', N'ENCERRADA') AND i.DestituicaoAGResultado IS NULL
      AND EXISTS (SELECT 1 FROM EntidadeDirigentes d WHERE d.IntervencaoId = i.IntervencaoId)`);
  const porId = new Map(lista.map((e) => [e.entidadeId, e]));
  return {
    hoje,
    intervencoesCorrendo: lista.filter((e) => e.intervencao && e.intervencao.status === "DECRETADA")
      .map((e) => ({ entidadeId: e.entidadeId, entidade: nome(e), intervencaoId: e.intervencao.intervencaoId, prazo: e.intervencao.prazoRatificacao, diasRestantes: e.intervencao.diasRestantes }))
      .sort((a, b) => a.diasRestantes - b.diasRestantes),
    apuracoes: lista.filter((e) => e.intervencao && e.intervencao.status === "APURACAO")
      .map((e) => ({ entidadeId: e.entidadeId, entidade: nome(e), intervencaoId: e.intervencao.intervencaoId, notificadoEm: e.intervencao.notificadoEm, decretavelDesde: e.intervencao.decretavelDesde })),
    prestacoesAtrasadas: lista.flatMap((e) => e.atrasadas.map((p) => ({ entidadeId: e.entidadeId, entidade: nome(e), periodo: p.codigo, prazo: p.prazo }))),
    aguardandoApreciacao: lista.flatMap((e) => e.aguardandoApreciacao.map((p) => ({ entidadeId: e.entidadeId, entidade: nome(e), periodo: p.codigo, prestacaoId: p.prestacaoId }))),
    cfPendente: lista.flatMap((e) => e.cfPendente.map((p) => ({ entidadeId: e.entidadeId, entidade: nome(e), periodo: p.codigo, prestacaoId: p.prestacaoId }))),
    propostas: lista.filter((e) => e.status === "PROPOSTA").map((e) => ({ entidadeId: e.entidadeId, entidade: nome(e) })),
    aguardandoAG: [
      ...lista.filter((e) => e.aguardandoAG).map((e) => {
        const desde = e.aguardandoAG === "VINCULO" ? e.vinculo.em : e.extincao.em;
        return { entidadeId: e.entidadeId, entidade: nome(e), objeto: e.aguardandoAG, desde, assembleiaJaHouve: jaHouve(desde) };
      }),
      ...destituicoes.recordset.filter((x) => porId.has(x.EntidadeId)).map((x) => ({ entidadeId: x.EntidadeId, entidade: nome(porId.get(x.EntidadeId)), objeto: "DESTITUICAO", desde: x.RatificacaoEm, assembleiaJaHouve: jaHouve(x.RatificacaoEm) }))
    ],
    indicacoes: lista.filter((e) => e.indicadosAguardando > 0).map((e) => ({ entidadeId: e.entidadeId, entidade: nome(e), quantidade: e.indicadosAguardando })),
    mandatosVencidos: lista.filter((e) => e.mandatosVencidos > 0).map((e) => ({ entidadeId: e.entidadeId, entidade: nome(e), quantidade: e.mandatosVencidos })),
    semGestor: lista.filter((e) => e.pendenciaGestor).map((e) => ({ entidadeId: e.entidadeId, entidade: nome(e), mensagem: e.pendenciaGestor }))
  };
}

// ================================================================ avisos (detectores) e LGPD ================================================================
const diaDoAviso = (hoje) => Number(hoje.replace(/-/g, "")) % 10000;   // MMDD: um aviso por dia
async function detectarPrazoIntervencao(pool, { hoje = hojeBrasilia() } = {}) {
  await caducarVencidas(pool, { hoje });
  const r = await pool.request().query(`
    SELECT i.IntervencaoId, CONVERT(varchar(10), i.PrazoRatificacao, 120) AS Prazo, e.RazaoSocial FROM EntidadeIntervencoes i JOIN EntidadesVinculadas e ON e.EntidadeId = i.EntidadeId
    WHERE i.Status = N'DECRETADA' AND e.Status = N'ATIVA'`);
  return r.recordset.filter((x) => x.Prazo >= hoje).map((x) => ({
    referenciaId: x.IntervencaoId * 10000 + diaDoAviso(hoje),
    fatoGerador: ev.textoPrazoIntervencao({ entidade: x.RazaoSocial, prazo: x.Prazo, hoje })
  }));
}
// A caducidade avisa no próprio ato de marcar (caducarVencidas); o detector é a rede de segurança: a caducada sem aviso ainda recebe (o motor não duplica).
async function detectarCaducadas(pool, { hoje = hojeBrasilia() } = {}) {
  await caducarVencidas(pool, { hoje });
  const r = await pool.request().input("h", sql.Date, hoje).query(`
    SELECT i.IntervencaoId, CONVERT(varchar(10), i.PrazoRatificacao, 120) AS Prazo, e.RazaoSocial FROM EntidadeIntervencoes i JOIN EntidadesVinculadas e ON e.EntidadeId = i.EntidadeId
    WHERE i.Status = N'CADUCADA' AND i.CaducadaEm >= DATEADD(DAY, -30, @h)`);
  return r.recordset.map((x) => ({ referenciaId: x.IntervencaoId, fatoGerador: ev.textoCaducada({ entidade: x.RazaoSocial, prazo: x.Prazo }) }));
}
// A prestação atrasada: um aviso por mês por ENTIDADE (com todos os períodos atrasados dela), só das ativas — a referência cabe no INT para qualquer EntidadeId.
async function detectarPrestacoesAtrasadas(pool, { hoje = hojeBrasilia() } = {}) {
  const lista = await listarEntidades(pool, { hoje, status: "ATIVA" });
  const mes = (Number(hoje.slice(0, 4)) * 12 + Number(hoje.slice(5, 7))) % 1000;
  return lista.filter((e) => e.atrasadas.length && e.entidadeId <= 2000000).map((e) => ({
    referenciaId: e.entidadeId * 1000 + mes,
    fatoGerador: ev.textoPrestacaoAtrasada({ entidade: e.razaoSocial, periodos: e.atrasadas })
  }));
}

// Meus Dados (LGPD Art. 18): as funções que a pessoa ocupa ou ocupou em entidade vinculada.
async function dadosDoTitular(pool, membroId) {
  const r = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT d.Funcao, d.FuncaoDescricao, d.Status, CONVERT(varchar(10), d.IndicadoEm, 120) AS IndicadoEm, CONVERT(varchar(10), d.HomologadoEm, 120) AS HomologadoEm,
      CONVERT(varchar(10), d.EncerradoEm, 120) AS EncerradoEm, d.MotivoEncerramento, d.Remunerado, d.Formacao, e.RazaoSocial
    FROM EntidadeDirigentes d JOIN EntidadesVinculadas e ON e.EntidadeId = d.EntidadeId WHERE d.MembroId = @m ORDER BY d.IndicadoEm DESC`);
  const i = await pool.request().input("m", sql.Int, membroId).query(`
    SELECT CONVERT(varchar(10), i.DecretadaEm, 120) AS DecretadaEm, i.Status, e.RazaoSocial FROM EntidadeIntervencoes i JOIN EntidadesVinculadas e ON e.EntidadeId = i.EntidadeId
    WHERE i.InterventorMembroId = @m ORDER BY i.IntervencaoId DESC`);
  return {
    funcoes: r.recordset.map((l) => ({
      entidade: l.RazaoSocial, funcao: l.Funcao === "OUTRA" && l.FuncaoDescricao ? l.FuncaoDescricao : ev.FUNCOES[l.Funcao], situacao: ev.STATUS_DIRIGENTE[l.Status] || l.Status,
      indicadoEm: l.IndicadoEm, homologadoEm: l.HomologadoEm, encerradoEm: l.EncerradoEm, motivoEncerramento: l.MotivoEncerramento ? ev.MOTIVOS_ENCERRAMENTO[l.MotivoEncerramento] : null,
      remunerado: !!l.Remunerado, formacao: l.Formacao
    })),
    comoInterventor: i.recordset.map((l) => ({ entidade: l.RazaoSocial, decretadaEm: l.DecretadaEm, situacao: ev.STATUS_INTERVENCAO[l.Status] || l.Status }))
  };
}

module.exports = {
  NAO_EXISTE, reunioesEncerradas, lerReuniao, listarTipos, lerTipo, criarTipo, editarTipo, lerEntidade, criarEntidade, editarEntidade, aprovarVinculo, naoAprovar,
  registrarAssembleia, configurarPrestacao, lerDirigente, indicarDirigente, homologarDirigente, recusarDirigente, encerrarDirigente, lerIntervencao, caducarVencidas,
  abrirApuracao, registrarAssembleiaDestituicao, registrarNotificacao, registrarManifestacao, arquivarApuracao, ehPresidente, decretar, ratificar, reabrirApuracao, registrarDefesa, encerrarIntervencao,
  registrarPrestacao, lerPrestacao, apreciarPrestacao, verificacaoConselhoFiscal, extinguir, detalharEntidade, listarEntidades, painel,
  detectarPrazoIntervencao, detectarCaducadas, detectarPrestacoesAtrasadas, dadosDoTitular, periodosDaEntidade
};
