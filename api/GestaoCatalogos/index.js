// GestaoCatalogos — CRUD genérico para catálogos e hierarquia configuráveis.
// GET    /api/catalogos/{catalogo}        -> lista
// POST   /api/catalogos/{catalogo}        -> cria (sem id) ou atualiza (com id)
// DELETE /api/catalogos/{catalogo}/{id}   -> exclui
//
// Cada entrada mapeia o nome do catálogo (o que o front usa na URL) pra
// tabela + campos (camelCase do front -> PascalCase da coluna, por
// capitalização simples — ex: "congregacaoMaeId" -> "CongregacaoMaeId").
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const CATALOGOS = {
  situacoes: {
    tabela: "SituacoesMembro", chave: "SituacaoId", idField: "situacaoId",
    campos: { sigla: sql.NVarChar(30), nome: sql.NVarChar(100), ativa: sql.Bit }
  },
  statuses: {
    tabela: "StatusMembro", chave: "StatusId", idField: "statusId",
    campos: { sigla: sql.NVarChar(30), nome: sql.NVarChar(100), ativa: sql.Bit }
  },
  departamentos: {
    tabela: "Departamentos", chave: "DepartamentoId", idField: "departamentoId",
    campos: { sigla: sql.NVarChar(30), nome: sql.NVarChar(150), numero: sql.Int, tipo: sql.NVarChar(30), ativo: sql.Bit }
  },
  areas: {
    tabela: "Areas", chave: "AreaId", idField: "areaId",
    campos: { nome: sql.NVarChar(150), ativa: sql.Bit, ativadaEm: sql.Date, regiaoId: sql.Int }
  },
  regioes: {
    tabela: "Regioes", chave: "RegiaoId", idField: "regiaoId",
    campos: { nome: sql.NVarChar(150), subsede: sql.Bit, ativa: sql.Bit, quadranteId: sql.Int }
  },
  quadrantes: {
    tabela: "Quadrantes", chave: "QuadranteId", idField: "quadranteId",
    campos: { nome: sql.NVarChar(150), ativo: sql.Bit, distritoId: sql.Int }
  },
  distritos: {
    tabela: "Distritos", chave: "DistritoId", idField: "distritoId",
    campos: { nome: sql.NVarChar(150), ativo: sql.Bit }
  },
  extensoes: {
    tabela: "ExtensoesTenda", chave: "ExtensaoId", idField: "extensaoId",
    campos: { nome: sql.NVarChar(150), congregacaoMaeId: sql.Int, ativa: sql.Bit }
  },
  congregacoes: {
    tabela: "Congregacoes", chave: "CongregacaoId", idField: "congregacaoId",
    campos: { nome: sql.NVarChar(150), ativa: sql.Bit, areaId: sql.Int },
    emUso: async (pool, id) => {
      const r = await pool.request().input("id", sql.Int, id).query(`SELECT COUNT(*) AS Total FROM MembroReferencia WHERE CongregacaoId = @id`);
      return r.recordset[0].Total > 0;
    }
  },
  funcionalidades: {
    tabela: "Funcionalidades", chave: "FuncionalidadeId", idField: "funcionalidadeId",
    campos: { chave: sql.NVarChar(50), nome: sql.NVarChar(100) }
  },
  papeis: {
    tabela: "Papeis", chave: "PapelId", idField: "papelId",
    campos: { nome: sql.NVarChar(100), nivel: sql.NVarChar(30), permissoes: sql.NVarChar(500) },
    arrayFields: ["permissoes"]
  },
  tiposConsagracao: {
    tabela: "TiposConsagracao", chave: "TipoConsagracaoId", idField: "tipoConsagracaoId",
    campos: { nome: sql.NVarChar(100), ativo: sql.Bit, cargoMinisterialResultante: sql.NVarChar(30) }
  },
  orgaosLocais: {
    tabela: "OrgaosLocais", chave: "OrgaoLocalId", idField: "orgaoLocalId",
    campos: { sigla: sql.NVarChar(30), nome: sql.NVarChar(200), nivel: sql.Int, referenciaId: sql.Int, ativo: sql.Bit }
  },
  cargosMinisteriais: {
    tabela: "CargosMinisteriais", chave: "CargoId", idField: "cargoId",
    campos: { sigla: sql.NVarChar(30), nome: sql.NVarChar(100), ordem: sql.Int, ativo: sql.Bit }
  },
  prazos: {
    tabela: "Prazos", chave: "PrazoId", idField: "prazoId",
    campos: { sigla: sql.NVarChar(40), nome: sql.NVarChar(150), dias: sql.Int, ativo: sql.Bit }
  },
  tiposVinculoFamiliar: {
    tabela: "TiposVinculoFamiliar", chave: "TipoVinculoId", idField: "tipoVinculoId",
    campos: { codigo: sql.NVarChar(30), rotuloDireto: sql.NVarChar(100), rotuloInverso: sql.NVarChar(100), simetrico: sql.Bit, ativo: sql.Bit }
  },
  politicasRetencao: {
    tabela: "PoliticasRetencao", chave: "PoliticaId", idField: "politicaId",
    campos: { categoria: sql.NVarChar(60), baseLegal: sql.NVarChar(300), diasRetencao: sql.Int, ativo: sql.Bit }
  },
  canaisOficiais: {
    tabela: "CanaisOficiaisComunicacao", chave: "CanalId", idField: "canalId",
    campos: { sigla: sql.NVarChar(30), nome: sql.NVarChar(150), ativo: sql.Bit }
  },
  tiposInfracao: {
    tabela: "TiposInfracao", chave: "InfracaoId", idField: "infracaoId",
    campos: { codigo: sql.NVarChar(30), nome: sql.NVarChar(200), referenciaRegimento: sql.NVarChar(40), gravidade: sql.NVarChar(20), ativo: sql.Bit },
    permissao: "disciplina"
  },
  tiposPenalidade: {
    tabela: "TiposPenalidade", chave: "PenalidadeId", idField: "penalidadeId",
    campos: { codigo: sql.NVarChar(30), nome: sql.NVarChar(100), referenciaRegimento: sql.NVarChar(40), ativo: sql.Bit },
    permissao: "disciplina"
  },
  categoriasEntrada: {
    tabela: "CategoriasEntrada", chave: "CategoriaId", idField: "categoriaId",
    campos: { codigo: sql.NVarChar(30), nome: sql.NVarChar(150), tipoFundo: sql.NVarChar(20), contaContabilId: sql.Int, ativa: sql.Bit },
    permissao: "financeiro"
  },
  planoContas: {
    tabela: "PlanoContas", chave: "ContaId", idField: "contaId",
    campos: { codigo: sql.NVarChar(20), nome: sql.NVarChar(200), tipo: sql.NVarChar(20), contaPaiId: sql.Int, ativa: sql.Bit },
    permissao: "financeiro"
  },
  categoriasSaida: {
    tabela: "CategoriasSaida", chave: "CategoriaId", idField: "categoriaId",
    campos: { codigo: sql.NVarChar(30), nome: sql.NVarChar(150), centroCusto: sql.NVarChar(20), tipoFundo: sql.NVarChar(20), classificacaoFuncional: sql.NVarChar(20), contaContabilId: sql.Int, ativa: sql.Bit },
    permissao: "financeiro"
  },
  alcadasAprovacao: {
    tabela: "AlcadasAprovacao", chave: "AlcadaId", idField: "alcadaId",
    campos: { valorMinimo: sql.Decimal(10, 2), nivelMinimoAprovador: sql.NVarChar(20), quantidadeAprovadores: sql.Int },
    permissao: "financeiro"
  }
};

// v3.6.1 — criar uma unidade territorial já cria os órgãos daquele nível,
// vinculados por Nivel+ReferenciaId (nunca cadastro manual separado; manual
// só serve depois pra ajustar Nome/Ativo do órgão já criado). Congregação
// já tinha isso via migração 007 (só JAI) — aqui generaliza pros demais 4
// níveis e pros órgãos que faltavam em Área/Região/Quadrante.
const ORGAOS_AUTOMATICOS_POR_CATALOGO = {
  congregacoes: { nivel: 1, idField: "congregacaoId", orgaos: [
    { sigla: "JAI", nome: "Junta de Articulação Institucional" }
  ] },
  areas: { nivel: 2, idField: "areaId", orgaos: [
    { sigla: "JEA", nome: "Junta Executiva de Área" },
    { sigla: "JUC", nome: "Junta de Contas de Área" }
  ] },
  regioes: { nivel: 3, idField: "regiaoId", orgaos: [
    { sigla: "CRA", nome: "Conselho Regional de Administração" },
    { sigla: "TER", nome: "Tribunal Eclesiástico Regional" },
    { sigla: "CRAF", nome: "Conselho Regional de Auditoria e Fiscalização" }
  ] },
  quadrantes: { nivel: 4, idField: "quadranteId", orgaos: [
    { sigla: "CEQ", nome: "Colegiado Estratégico de Quadrante" },
    { sigla: "CAQ", nome: "Câmara de Arbitragem do Quadrante" }
  ] },
  distritos: { nivel: 5, idField: "distritoId", orgaos: [
    { sigla: "CDE", nome: "Conselho Distrital Eclesiástico" }
  ] }
};

async function criarOrgaosAutomaticos(pool, catalogoNome, registro) {
  const cfg = ORGAOS_AUTOMATICOS_POR_CATALOGO[catalogoNome];
  if (!cfg) return;
  const referenciaId = registro[cfg.idField];
  for (const orgao of cfg.orgaos) {
    await pool.request()
      .input("sigla", sql.NVarChar(30), orgao.sigla)
      .input("nome", sql.NVarChar(200), `${orgao.nome} — ${registro.nome}`)
      .input("nivel", sql.Int, cfg.nivel)
      .input("referenciaId", sql.Int, referenciaId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM OrgaosLocais WHERE Nivel = @nivel AND ReferenciaId = @referenciaId AND Sigla = @sigla)
          INSERT INTO OrgaosLocais (Sigla, Nome, Nivel, ReferenciaId, Ativo) VALUES (@sigla, @nome, @nivel, @referenciaId, 1)
      `);
  }
}

function coluna(campo) {
  return campo.charAt(0).toUpperCase() + campo.slice(1);
}

function paraJson(config, linha) {
  const objeto = { [config.idField]: linha[config.chave] };
  for (const campo of Object.keys(config.campos)) {
    let valor = linha[coluna(campo)];
    if (config.arrayFields && config.arrayFields.includes(campo)) {
      valor = valor ? String(valor).split(",").map(v => v.trim()).filter(Boolean) : [];
    }
    objeto[campo] = valor;
  }
  return objeto;
}

async function buscarPorId(pool, config, id) {
  const result = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM ${config.tabela} WHERE ${config.chave} = @id`);
  return result.recordset[0] ? paraJson(config, result.recordset[0]) : null;
}

async function listar(pool, config) {
  const result = await pool.request().query(`SELECT * FROM ${config.tabela}`);
  return result.recordset.map(linha => paraJson(config, linha));
}

async function criar(pool, config, dados) {
  const camposPresentes = Object.keys(config.campos).filter(c => dados[c] !== undefined);
  const request = pool.request();
  const colunas = [];
  const placeholders = [];
  for (const campo of camposPresentes) {
    let valor = dados[campo];
    if (config.arrayFields && config.arrayFields.includes(campo) && Array.isArray(valor)) valor = valor.join(",");
    request.input(campo, config.campos[campo], valor);
    colunas.push(coluna(campo));
    placeholders.push(`@${campo}`);
  }
  const result = await request.query(
    `INSERT INTO ${config.tabela} (${colunas.join(", ")}) OUTPUT INSERTED.${config.chave} VALUES (${placeholders.join(", ")})`
  );
  return buscarPorId(pool, config, result.recordset[0][config.chave]);
}

async function atualizar(pool, config, id, dados) {
  const camposPresentes = Object.keys(config.campos).filter(c => dados[c] !== undefined);
  if (camposPresentes.length === 0) return buscarPorId(pool, config, id);
  const request = pool.request().input("id", sql.Int, id);
  const sets = [];
  for (const campo of camposPresentes) {
    let valor = dados[campo];
    if (config.arrayFields && config.arrayFields.includes(campo) && Array.isArray(valor)) valor = valor.join(",");
    request.input(campo, config.campos[campo], valor);
    sets.push(`${coluna(campo)} = @${campo}`);
  }
  const upd = await request.query(`UPDATE ${config.tabela} SET ${sets.join(", ")} WHERE ${config.chave} = @id`);
  if (upd.rowsAffected[0] === 0) return null;
  return buscarPorId(pool, config, id);
}

async function excluir(pool, config, id) {
  const del = await pool.request().input("id", sql.Int, id).query(`DELETE FROM ${config.tabela} WHERE ${config.chave} = @id`);
  return del.rowsAffected[0] > 0;
}

module.exports = async function (context, req) {
  const method = (req.method || "GET").toUpperCase();
  const catalogoNome = context.bindingData.catalogo;
  const id = context.bindingData.id;
  const config = CATALOGOS[catalogoNome];

  if (!config) {
    context.res = { status: 404, body: { sucesso: false, mensagem: "Catálogo não encontrado." } };
    return;
  }

  const pool = await getPool();

  if (method === "GET") {
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: await listar(pool, config) };
    return;
  }

  const usuario = auth.exigirPermissao(req, context, config.permissao || "pessoas");
  if (!usuario) return;

  if (method === "POST") {
    const dados = req.body || {};
    const idCorpo = dados.id;
    if (idCorpo) {
      const dadosAntes = await buscarPorId(pool, config, idCorpo);
      const registro = await atualizar(pool, config, idCorpo, dados);
      if (!registro) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Registro não encontrado." } };
        return;
      }
      await registrarAuditoria({
        tabela: config.tabela, registroId: Number(idCorpo), acao: "Atualizou registro",
        usuarioId: usuario.membroId, dadosAntes, dadosDepois: registro
      });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Registro atualizado.", registro } };
    } else {
      const registro = await criar(pool, config, dados);
      await criarOrgaosAutomaticos(pool, catalogoNome, registro);
      await registrarAuditoria({
        tabela: config.tabela, registroId: registro[config.idField], acao: "Criou registro",
        usuarioId: usuario.membroId, dadosDepois: registro
      });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Registro criado.", registro } };
    }
    return;
  }

  if (method === "DELETE") {
    if (!id) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/catalogos/{catalogo}/{id}" } };
      return;
    }
    if (config.emUso && (await config.emUso(pool, id))) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Não é possível excluir: registro em uso. Desative em vez de excluir." } };
      return;
    }
    const dadosAntes = await buscarPorId(pool, config, id);
    const ok = await excluir(pool, config, id);
    if (ok) {
      await registrarAuditoria({ tabela: config.tabela, registroId: Number(id), acao: "Excluiu registro", usuarioId: usuario.membroId, dadosAntes });
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: ok, mensagem: ok ? "✅ Excluído." : "Registro não encontrado." } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
