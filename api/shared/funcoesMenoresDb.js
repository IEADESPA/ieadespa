// shared/funcoesMenoresDb.js (Trava 7-C, decisão de 23/10/2026 — aptidão para funções com criança fora das escalas: departamentos e liderança)
//
// A camada de banco de shared/funcoesMenores.js. "Quem ocupa" a função:
//   - CARGO marcado: quem tem a liderança (Lideranca) desse papel, vigente (AtivoAte nulo ou ainda não passou);
//   - DEPARTAMENTO marcado (e ativo): quem tem a liderança com escopo desse departamento (Líder Geral) ou restrita a ele (Lideranca.DepartamentoId: Líder Local, de Área).
// A aptidão é a MESMA da v7.7 (ministerioMenoresDb.aptidaoEmLote): nada novo é gravado sobre a pessoa; o painel e o aviso são calculados na leitura.
"use strict";
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const { hojeBrasilia } = require("./dataBrasilia");
const mm = require("./ministerioMenores");
const fm = require("./funcoesMenores");

const TABELA = { DEPARTAMENTO: ["Departamentos", "DepartamentoId"], PAPEL: ["Papeis", "PapelId"] };

// As linhas pessoa × função marcada, de quem ocupa hoje. `membroId`: só desta pessoa (a nomeação).
async function ocupantes(pool, { hoje = hojeBrasilia(), membroId = null } = {}) {
  const rq = pool.request().input("hoje", sql.Date, hoje).input("m", sql.Int, membroId);
  const r = await rq.query(`
    SELECT l.MembroId, m.Nome, c.Nome AS CongregacaoNome, 'PAPEL' AS Tipo, p.PapelId AS FuncaoId, p.Nome AS FuncaoNome
    FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId AND p.ContatoComMenores = 1
    JOIN MembroReferencia m ON m.MembroId = l.MembroId LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    WHERE (l.AtivoAte IS NULL OR l.AtivoAte >= @hoje) AND (@m IS NULL OR l.MembroId = @m)
    UNION ALL
    SELECT l.MembroId, m.Nome, c.Nome, 'DEPARTAMENTO', d.DepartamentoId, d.Nome
    FROM Lideranca l
    JOIN Departamentos d ON d.DepartamentoId = CASE WHEN l.EscopoTipo = 'DEPARTAMENTO' THEN l.EscopoId ELSE l.DepartamentoId END AND d.ContatoComMenores = 1 AND d.Ativo = 1
    JOIN MembroReferencia m ON m.MembroId = l.MembroId LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId
    WHERE (l.AtivoAte IS NULL OR l.AtivoAte >= @hoje) AND (@m IS NULL OR l.MembroId = @m)`);
  return fm.agruparPorPessoa(r.recordset.map((x) => ({ membroId: x.MembroId, nome: x.Nome, congregacaoNome: x.CongregacaoNome, tipo: x.Tipo, funcaoId: x.FuncaoId, funcaoNome: x.FuncaoNome })));
}

// Quem ocupa função marcada e não está apto hoje (com a aptidão bruta, para o painel decidir o que cada um vê).
async function inaptos(pool, { hoje = hojeBrasilia() } = {}) {
  const pessoas = await ocupantes(pool, { hoje });
  if (!pessoas.length) return { ocupantes: 0, inaptos: [] };
  const aptidoes = await require("./ministerioMenoresDb").aptidaoEmLote(pool, pessoas.map((p) => p.membroId), { hoje });
  // Sem a aptidão calculada (não deveria acontecer), a pessoa conta como NÃO apta: a dúvida aparece para a Diretoria, não some.
  const lista = pessoas.map((p) => ({ ...p, aptidao: aptidoes.get(p.membroId) || { apto: false, bloqueios: [] } })).filter((p) => !p.aptidao.apto);
  return { ocupantes: pessoas.length, inaptos: lista };
}

// Os departamentos e cargos com a marca (e os que PARECEM de crianças pelo nome e ainda não têm: a marca nasce desligada e quem decide é o nível geral).
async function listarFuncoes(pool) {
  const deps = (await pool.request().query(`SELECT DepartamentoId, Sigla, Nome, Ativo, ContatoComMenores FROM Departamentos ORDER BY Nome`)).recordset;
  const papeis = (await pool.request().query(`SELECT PapelId, Nome, Nivel, ContatoComMenores FROM Papeis ORDER BY Nome`)).recordset;
  return {
    departamentos: deps.map((d) => ({ departamentoId: d.DepartamentoId, sigla: d.Sigla, nome: d.Nome, ativo: !!d.Ativo, contatoComMenores: !!d.ContatoComMenores, pareceInfantil: !d.ContatoComMenores && (mm.nomeSugereMenores(d.Nome) || mm.nomeSugereMenores(d.Sigla)) })),
    papeis: papeis.map((p) => ({ papelId: p.PapelId, nome: p.Nome, nivel: p.Nivel, contatoComMenores: !!p.ContatoComMenores, pareceInfantil: !p.ContatoComMenores && mm.nomeSugereMenores(p.Nome) }))
  };
}

// O painel. `verInaptos`: Diretoria ou Proteção do nível geral; `reservado`: Diretoria (lê o motivo da pendência reservada; os demais, "pendência com a Diretoria").
// `verMembroId`: quem olha — na própria linha, o afastamento por incidente vira "pendência com a Diretoria" (o mesmo do painel da v7.7).
async function painel(pool, { verInaptos = false, reservado = false, verMembroId = null, hoje = hojeBrasilia() } = {}) {
  const funcoes = await listarFuncoes(pool);
  if (!verInaptos) return { ...funcoes, inaptos: null, resumo: null };
  const r = await inaptos(pool, { hoje });
  const linhas = r.inaptos.map((p) => {
    const brutos = verMembroId && Number(p.membroId) === Number(verMembroId) ? mm.bloqueiosParaAPessoa(p.aptidao.bloqueios) : p.aptidao.bloqueios;
    return { membroId: p.membroId, nome: p.nome, congregacaoNome: p.congregacaoNome, funcoes: p.funcoes.map((f) => ({ tipo: f.tipo, id: f.id, nome: f.nome, rotulo: fm.rotuloFuncao(f) })), bloqueios: mm.bloqueiosParaPainel(brutos, { reservado }) };
  }).sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  return { ...funcoes, inaptos: linhas, resumo: { ocupantes: r.ocupantes, inaptos: linhas.length } };
}

// Marcar ou desmarcar (a rota já conferiu o nível geral e a confirmação reforçada). O estado antigo vai no WHERE: duas mudanças ao mesmo tempo não se sobrescrevem às cegas.
async function marcar(pool, { tipo, id, contatoComMenores, por }) {
  const [tabela, chave] = TABELA[tipo];
  const atual = (await pool.request().input("id", sql.Int, id).query(`SELECT Nome, ContatoComMenores FROM ${tabela} WHERE ${chave} = @id`)).recordset[0];
  if (!atual) return { sucesso: false, naoEncontrado: true, mensagem: tipo === "PAPEL" ? "Cargo não encontrado." : "Departamento não encontrado." };
  const antes = !!atual.ContatoComMenores;
  if (antes === contatoComMenores) return { sucesso: true, mudou: false, mensagem: "Nada mudou: a marca já estava assim." };
  const upd = await pool.request().input("id", sql.Int, id).input("novo", sql.Bit, contatoComMenores ? 1 : 0).input("antes", sql.Bit, antes ? 1 : 0)
    .query(`UPDATE ${tabela} SET ContatoComMenores = @novo WHERE ${chave} = @id AND ContatoComMenores = @antes`);
  if (!upd.rowsAffected || upd.rowsAffected[0] === 0) return { sucesso: false, mensagem: "A marca mudou enquanto você alterava (outra pessoa mexeu ao mesmo tempo). Atualize a lista." };
  await registrarAuditoria({ tabela, registroId: id, acao: "CONTATO_COM_MENORES_ALTERADO", usuarioId: por, dadosAntes: { contatoComMenores: antes }, dadosDepois: { contatoComMenores } });
  return {
    sucesso: true, mudou: true,
    mensagem: contatoComMenores
      ? `✅ ${fm.TIPOS[tipo]} "${atual.Nome}" marcado com contato com crianças e adolescentes. Quem o ocupa sem aptidão aparece no painel e a Diretoria e a Proteção de crianças são avisadas na rotina diária. Ninguém sai do cargo sozinho.`
      : `✅ Marca retirada de ${fm.TIPOS[tipo].toLowerCase()} "${atual.Nome}": quem o ocupa deixa de ser conferido por esta regra.`
  };
}

// O aviso da nomeação: a pessoa ocupa (agora) função marcada e não está apta? Devolve o texto genérico ou null.
async function avisoNaNomeacao(pool, membroId, { hoje = hojeBrasilia() } = {}) {
  const pessoas = await ocupantes(pool, { hoje, membroId });
  if (!pessoas.length) return null;
  const ap = await require("./ministerioMenoresDb").aptidaoDe(pool, membroId, { hoje });
  if (ap && ap.apto) return null;
  return fm.textoDaNomeacao(pessoas[0].funcoes);
}

// Quem recebe: a Diretoria (vistoria_antecedentes) e a Proteção de crianças (protecao_menores), ambas em papel de nível GLOBAL.
async function destinatarios(pool) {
  const { resolverDestinatariosPorPermissao } = require("./notificacoes");
  const vistos = new Set();
  const lista = [];
  for (const permissao of ["vistoria_antecedentes", "protecao_menores"]) {
    for (const d of await resolverDestinatariosPorPermissao(pool, { permissao, nivel: "GLOBAL" })) {
      if (vistos.has(Number(d.membroId))) continue;
      vistos.add(Number(d.membroId));
      lista.push({ membroId: d.membroId, nome: d.nome, email: d.email });
    }
  }
  return lista;
}

// Detector da regra MENORES_FUNCAO_SEM_APTIDAO (obrigatória; rotina diária): um fato por pessoa e função, com a referência do mês. Nunca vai à própria pessoa.
async function detectar(pool, { hoje = hojeBrasilia() } = {}) {
  const r = await inaptos(pool, { hoje });
  if (!r.inaptos.length) return [];
  const todos = await destinatarios(pool);
  if (!todos.length) return [];
  const mes = hoje.slice(0, 7);
  const fatos = [];
  for (const p of r.inaptos) {
    const dest = todos.filter((d) => Number(d.membroId) !== Number(p.membroId));
    if (!dest.length) continue;
    for (const f of p.funcoes) {
      fatos.push({ referenciaId: fm.referenciaDoAviso(mes, p.membroId, f.tipo, f.id), destinatarios: dest, fatoGerador: fm.textoDoAviso({ nome: p.nome, funcao: f, congregacaoNome: p.congregacaoNome }) });
    }
  }
  return fatos;
}

module.exports = { ocupantes, inaptos, listarFuncoes, painel, marcar, avisoNaNomeacao, destinatarios, detectar };
