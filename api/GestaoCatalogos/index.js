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
const { exigirGeral } = require("../shared/escopoRotas");
const { violouUnicidade, comConflito } = require("../shared/violacaoUnica");

// Catálogos que, mesmo tendo uma permissão de escrita própria, podem ser LIDOS por qualquer pessoa logada (o membro os usa no Meu Painel).
const LEITURA_SO_COM_LOGIN = new Set(["categoriasEntrada"]);

// Trava 9-A — o Distrito a que uma unidade do território pertence hoje (pela cadeia Congregação → Área → Região → Quadrante → Distrito), ou null.
const SUBIR = {
  CONGREGACAO: `SELECT q.DistritoId FROM Congregacoes c JOIN Areas a ON a.AreaId = c.AreaId JOIN Regioes r ON r.RegiaoId = a.RegiaoId JOIN Quadrantes q ON q.QuadranteId = r.QuadranteId WHERE c.CongregacaoId = @id`,
  AREA: `SELECT q.DistritoId FROM Areas a JOIN Regioes r ON r.RegiaoId = a.RegiaoId JOIN Quadrantes q ON q.QuadranteId = r.QuadranteId WHERE a.AreaId = @id`,
  REGIAO: `SELECT q.DistritoId FROM Regioes r JOIN Quadrantes q ON q.QuadranteId = r.QuadranteId WHERE r.RegiaoId = @id`,
  QUADRANTE: `SELECT DistritoId FROM Quadrantes WHERE QuadranteId = @id`,
  DISTRITO: `SELECT DistritoId FROM Distritos WHERE DistritoId = @id`
};
async function distritoDe(pool, tipo, id) {
  const n = auth.idDeRota(id);
  if (!n || !SUBIR[tipo]) return null;
  const r = await pool.request().input("id", sql.Int, n).query(SUBIR[tipo]);
  return r.recordset[0] && r.recordset[0].DistritoId ? Number(r.recordset[0].DistritoId) : null;
}
// A troca do ponteiro da unidade (para `novo`, quando vem no corpo) que sai de um Distrito sob intervenção ou entra nele: recusada (mensagem) ou null.
async function territorioSobIntervencao(pool, tipo, id, novo) {
  if (novo === undefined || !id) return null;   // criar unidade nova no território continua livre (o CDE expande — Art. 126-M, III)
  const antes = await distritoDe(pool, tipo, id);
  const depois = novo.id === null || novo.id === "" ? null : await distritoDe(pool, novo.tipo, novo.id);
  if (antes === depois) return null;
  const ids = [antes, depois].filter(Boolean);
  if (!ids.length) return null;
  const r = await pool.request().query(`SELECT TOP 1 DistritoId FROM DistritoIntervencoes WHERE EncerradaEm IS NULL AND DistritoId IN (${ids.join(",")})`);
  return r.recordset.length ? "O território de um Distrito sob intervenção não muda até o Pastor Presidente encerrar a intervenção (Regimento, Art. 126-P, II)." : null;
}
// A unidade com algo embaixo (`subordinados`, SQL com @id), com liderança de escopo dela ou citada num pedido de expansão: não se exclui.
async function unidadeEmUso(pool, escopoTipo, id, subordinados) {
  const r = await pool.request().input("id", sql.Int, id).input("t", sql.NVarChar(30), escopoTipo).query(`SELECT COUNT(*) AS Total FROM (
    ${subordinados} UNION ALL SELECT 1 FROM Lideranca WHERE EscopoTipo = @t AND EscopoId = @id) u`);
  return Number((r.recordset[0] || {}).Total) > 0;
}

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
  // Trava 9-A — a Área, a Região e o Quadrante: o território de um Distrito sob intervenção não muda (senão a Secretaria tiraria do Distrito interditado a unidade de
  // um Vice ou Superintendente destituído e o recolocaria sem o Presidente); e a unidade com liderança, pedido de expansão ou território embaixo não se exclui
  // (antes o Pastor de Área de uma Área apagada continuava na CME, e a Área citada num pedido dava erro 500).
  areas: {
    tabela: "Areas", chave: "AreaId", idField: "areaId",
    campos: { nome: sql.NVarChar(150), ativa: sql.Bit, ativadaEm: sql.Date, regiaoId: sql.Int },
    conferirEscrita: (pool, dados, id) => territorioSobIntervencao(pool, "AREA", id, dados.regiaoId === undefined ? undefined : { tipo: "REGIAO", id: dados.regiaoId }),
    emUso: (pool, id) => unidadeEmUso(pool, "AREA", id, `SELECT 1 AS x FROM Congregacoes WHERE AreaId = @id UNION ALL SELECT 1 FROM PedidosExpansao WHERE AreaId = @id`)
  },
  regioes: {
    tabela: "Regioes", chave: "RegiaoId", idField: "regiaoId",
    campos: { nome: sql.NVarChar(150), subsede: sql.Bit, ativa: sql.Bit, quadranteId: sql.Int },
    conferirEscrita: (pool, dados, id) => territorioSobIntervencao(pool, "REGIAO", id, dados.quadranteId === undefined ? undefined : { tipo: "QUADRANTE", id: dados.quadranteId }),
    emUso: (pool, id) => unidadeEmUso(pool, "REGIAO", id, `SELECT 1 AS x FROM Areas WHERE RegiaoId = @id`)
  },
  quadrantes: {
    tabela: "Quadrantes", chave: "QuadranteId", idField: "quadranteId",
    campos: { nome: sql.NVarChar(150), ativo: sql.Bit, distritoId: sql.Int },
    conferirEscrita: (pool, dados, id) => territorioSobIntervencao(pool, "QUADRANTE", id, dados.distritoId === undefined ? undefined : { tipo: "DISTRITO", id: dados.distritoId }),
    emUso: (pool, id) => unidadeEmUso(pool, "QUADRANTE", id, `SELECT 1 AS x FROM Regioes WHERE QuadranteId = @id`)
  },
  distritos: {
    tabela: "Distritos", chave: "DistritoId", idField: "distritoId",
    campos: { nome: sql.NVarChar(150), ativo: sql.Bit },
    // v9.3 — o Distrito só fica ativo (ou deixa de ficar) por decreto da CLI (Regimento Art. 126-K §2º), registrado em Expansão → Distritos: o cadastro cria,
    // renomeia e monta o território, mas não liga nem desliga.
    conferirEscrita: async (pool, dados, id) => {
      if (dados.ativo === undefined) return null;
      const quer = dados.ativo === true || dados.ativo === 1 || dados.ativo === "1" || dados.ativo === "true";
      let recusa = null;
      if (!id) recusa = quer ? "O Distrito nasce inativo: a ativação é decreto da CLI, registrado em Expansão → Distritos." : null;
      else {
        const r = await pool.request().input("id", sql.Int, id).query(`SELECT Ativo FROM Distritos WHERE DistritoId = @id`);
        if (r.recordset[0] && !!r.recordset[0].Ativo !== quer) recusa = "A ativação e a desativação do Distrito são decretos da CLI, registrados em Expansão → Distritos (não no cadastro).";
      }
      // o cadastro nunca grava o Ativo (nem o valor igual): uma edição que corresse junto com o decreto o desfaria (revisão de 04/11/2026)
      delete dados.ativo;
      return recusa;
    },
    // o Distrito com território, decreto, intervenção, balanço, repasse ou acesso de escopo não se exclui
    emUso: async (pool, id) => {
      const r = await pool.request().input("id", sql.Int, id).query(`SELECT COUNT(*) AS Total FROM (
        SELECT 1 AS x FROM Quadrantes WHERE DistritoId = @id UNION ALL SELECT 1 FROM DistritoPeriodos WHERE DistritoId = @id
        UNION ALL SELECT 1 FROM DistritoIntervencoes WHERE DistritoId = @id UNION ALL SELECT 1 FROM DistritoBalancos WHERE DistritoId = @id
        UNION ALL SELECT 1 FROM RepassesInstitucionais WHERE OrigemTipo = N'DISTRITO' AND OrigemId = @id
        UNION ALL SELECT 1 FROM Lideranca WHERE EscopoTipo = 'DISTRITO' AND EscopoId = @id) u`);
      return Number((r.recordset[0] || {}).Total) > 0;
    }
  },
  extensoes: {
    tabela: "ExtensoesTenda", chave: "ExtensaoId", idField: "extensaoId",
    campos: { nome: sql.NVarChar(150), congregacaoMaeId: sql.Int, ativa: sql.Bit },
    // Trava 9-A — desativar a Extensão pelo cadastro faz o que a emancipação faz com ela: recusa com pedido de emancipação em andamento (a decisão da CLI
    // ficaria sem objeto) e, desativada, encerra o Encarregado e o acesso de escopo dela (as sessões caem: "ativa" está entre os campos do bilhete)
    conferirEscrita: async (pool, dados, id) => {
      if (!id || dados.ativa === undefined || dados.ativa === true || dados.ativa === 1 || dados.ativa === "1" || dados.ativa === "true") return null;
      const r = await pool.request().input("id", sql.Int, id).query(`SELECT TOP 1 1 AS ok FROM PedidosExpansao WHERE ExtensaoId = @id AND Status IN (N'EM_PARECER', N'AGUARDANDO_CLI')`);
      return r.recordset.length ? "Esta Extensão tem pedido de emancipação em andamento: peça a desistência (ou espere a decisão da CLI) antes de desativá-la." : null;
    },
    aposAtualizar: async (pool, antes, depois, usuario) => {
      if (!antes || !antes.ativa || depois.ativa) return;
      const hoje = require("../shared/dataBrasilia").hojeBrasilia();
      await pool.request().input("id", sql.Int, depois.extensaoId).input("h", sql.Date, hoje).input("por", sql.Int, usuario.membroId).query(`
        UPDATE ExtensaoEncarregados SET Ate = CASE WHEN Desde > @h THEN Desde ELSE @h END, MotivoSaida = N'Extensão desativada no cadastro', EncerradoPor = @por
        WHERE ExtensaoId = @id AND Ate IS NULL;
        UPDATE Lideranca SET AtivoAte = DATEADD(DAY, -1, @h) WHERE EscopoTipo = 'EXTENSAO' AND EscopoId = @id AND (AtivoAte IS NULL OR AtivoAte >= @h)`);
    },
    // v9.2 — a Extensão com membros, Encarregado ou pedido de expansão não se exclui (desativa-se); a emancipada é história: não se edita (a congregação que nasceu dela, sim)
    emUso: async (pool, id) => {
      const r = await pool.request().input("id", sql.Int, id).query(`SELECT COUNT(*) AS Total FROM (
        SELECT 1 AS x FROM MembroReferencia WHERE ExtensaoId = @id UNION ALL SELECT 1 FROM ExtensaoEncarregados WHERE ExtensaoId = @id
        UNION ALL SELECT 1 FROM PedidosExpansao WHERE ExtensaoId = @id OR ExtensaoCriadaId = @id) u`);
      return Number((r.recordset[0] || {}).Total) > 0;
    },
    bloqueioDeEdicao: async (pool, id) => {
      const r = await pool.request().input("id", sql.Int, id).query(`SELECT EmancipadaEm FROM ExtensoesTenda WHERE ExtensaoId = @id`);
      return r.recordset && r.recordset[0] && r.recordset[0].EmancipadaEm ? "Esta Extensão já foi emancipada em congregação: ela fica como registro histórico e não se edita. Edite a congregação que nasceu dela." : null;
    }
  },
  congregacoes: {
    tabela: "Congregacoes", chave: "CongregacaoId", idField: "congregacaoId",
    // Endereço/bairro/cidade/estado/horário/mapa (v075, vC.2): campos que só
    // existiam soltos na coleção "congregacoes" do Directus (site
    // institucional) — viram fonte única aqui. NomePastor propositalmente
    // NÃO é coluna: ver DIRIGENTE_ATUAL_SQL/enriquecerComDirigente abaixo —
    // quem dirige a congregação hoje já é 100% calculável em Lideranca
    // (mesmo critério de api/shared/universo.js), guardar de novo aqui
    // duplicaria dado e dessincronizaria no primeiro dia em que alguém
    // trocasse de dirigente sem lembrar de atualizar os dois lugares.
    // cep/notaEndereco/googleMapsPlaceQuery vieram na v076, junto com a
    // migração de dado real do Directus — mesmo motivo dos campos da v075.
    campos: {
      nome: sql.NVarChar(150), ativa: sql.Bit, areaId: sql.Int,
      slug: sql.NVarChar(150), endereco: sql.NVarChar(300), bairro: sql.NVarChar(150),
      cidade: sql.NVarChar(150), estado: sql.NVarChar(2), horarios: sql.NVarChar(500),
      mapsUrl: sql.NVarChar(500), lat: sql.Decimal(9, 6), lng: sql.Decimal(9, 6),
      cep: sql.NVarChar(10), notaEndereco: sql.NVarChar(300), googleMapsPlaceQuery: sql.NVarChar(300),
      fundacaoAno: sql.SmallInt
    },
    // Trava 9-A — a congregação não troca de Área para dentro ou para fora de um Distrito sob intervenção
    conferirEscrita: (pool, dados, id) => territorioSobIntervencao(pool, "CONGREGACAO", id, dados.areaId === undefined ? undefined : { tipo: "AREA", id: dados.areaId }),
    emUso: async (pool, id) => {
      // v9.2 — também a Congregação-Mãe de alguma Extensão e a congregação de um pedido de expansão (a certidão de nascimento dela)
      const r = await pool.request().input("id", sql.Int, id).query(`SELECT COUNT(*) AS Total FROM MembroReferencia WHERE CongregacaoId = @id`);
      if (Number((r.recordset[0] || {}).Total) > 0) return true;
      const x = await pool.request().input("id", sql.Int, id).query(`SELECT COUNT(*) AS Total FROM (
        SELECT 1 AS x FROM ExtensoesTenda WHERE CongregacaoMaeId = @id OR CongregacaoEmancipadaId = @id
        UNION ALL SELECT 1 FROM PedidosExpansao WHERE CongregacaoMaeId = @id OR CongregacaoCriadaId = @id) u`);
      return Number((x.recordset[0] || {}).Total) > 0;
    },
    // Só pra este catálogo: acrescenta o dirigente atual calculado (nunca
    // marcação manual) em cada item já devolvido por listar().
    enriquecer: async (pool, itens) => {
      const result = await pool.request().query(`
        SELECT l.EscopoId AS congregacaoId, m.Nome AS dirigenteAtual
        FROM Lideranca l
        JOIN Papeis p ON p.PapelId = l.PapelId AND p.Nome = 'Dirigente de Congregação'
        JOIN MembroReferencia m ON m.MembroId = l.MembroId
        WHERE l.EscopoTipo = 'CONGREGACAO'
          AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))
      `);
      const porCongregacao = {};
      result.recordset.forEach(r => { porCongregacao[r.congregacaoId] = r.dirigenteAtual; });
      itens.forEach(item => { item.dirigenteAtual = porCongregacao[item.congregacaoId] || null; });
      return itens;
    }
  },
  funcionalidades: {
    tabela: "Funcionalidades", chave: "FuncionalidadeId", idField: "funcionalidadeId",
    campos: { chave: sql.NVarChar(50), nome: sql.NVarChar(100) },
    // fecho da v7.5 — quem altera os PAPÉIS (nível e permissões de cada cargo) e as funcionalidades define o que todos os cargos podem; com o padrão "pessoas" quem só
    // cuida do cadastro de membros de uma congregação fazia um papel virar Global com todas as permissões. É a mesma permissão de GestaoLideranca.
    permissao: "permissoes"
  },
  papeis: {
    tabela: "Papeis", chave: "PapelId", idField: "papelId",
    campos: { nome: sql.NVarChar(100), nivel: sql.NVarChar(30), permissoes: sql.NVarChar(500) },
    arrayFields: ["permissoes"],
    permissao: "permissoes",
    // v9.3 — "Pastor Distrital" e "Interventor Distrital" só o Pastor Presidente dá (a tela de Liderança reconhece os dois pelo nome): eles não se renomeiam, não
    // mudam de nível, e nenhum outro papel ganha esses nomes (senão bastaria renomear, dar e renomear de volta).
    // Trava 9-A — o mesmo vale para os papéis cujo NOME o sistema usa nas contas: a CLI (Art. 6-A), a CME (Art. 23), o CDE, a destituição da intervenção, o
    // Presidente de hoje, o Reitor e a sucessão dos canais. Renomear um deles tiraria as pessoas dessas contas sem aviso; as permissões continuam editáveis.
    conferirEscrita: async (pool, dados, id) => {
      const RESERVADOS = ["Pastor Distrital", "Interventor Distrital", "Presidente", "Secretário Geral", "Dirigente de Congregação", "Pastor de Área", "Superintendente Regional",
        "Vice-Presidente de Quadrante", "Secretário de Missões", "Líder Geral de Departamento/Secretaria", "Reitor da AFM", "Tesoureiro de Distrito"];
      const chave = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
      const reservado = (t) => RESERVADOS.some((r) => chave(r) === chave(t));
      const atual = id ? (await pool.request().input("id", sql.Int, id).query(`SELECT Nome, Nivel FROM Papeis WHERE PapelId = @id`)).recordset[0] : null;
      if (atual && reservado(atual.Nome)) {
        if ((dados.nome !== undefined && dados.nome !== atual.Nome) || (dados.nivel !== undefined && dados.nivel !== atual.Nivel)) {
          return `O papel "${atual.Nome}" não se renomeia nem muda de nível: o sistema usa o nome dele (na CLI, nas comissões, no Distrito ou na Liderança). As permissões dele podem mudar.`;
        }
        return null;
      }
      if (dados.nome !== undefined && reservado(dados.nome)) return `O nome "${String(dados.nome).trim()}" é de um papel que o sistema já usa: escolha outro nome.`;
      return null;
    },
    // o papel de que o sistema depende não se exclui; o que está dado a alguém em Liderança também não (a chave estrangeira daria erro)
    emUso: async (pool, id) => {
      const r = await pool.request().input("id", sql.Int, id).query(`SELECT Nome, (SELECT COUNT(*) FROM Lideranca WHERE PapelId = @id) AS Usos FROM Papeis WHERE PapelId = @id`);
      const l = r.recordset[0];
      return !!(l && (Number(l.Usos) > 0 || ["Pastor Distrital", "Interventor Distrital", "Presidente", "Secretário Geral", "Dirigente de Congregação", "Pastor de Área",
        "Superintendente Regional", "Vice-Presidente de Quadrante", "Secretário de Missões", "Líder Geral de Departamento/Secretaria", "Reitor da AFM", "Tesoureiro de Distrito"].includes(l.Nome)));
    }
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
  // 'politicasRetencao' removido daqui (vB.8, achado real): este catálogo
  // genérico só exige a permissão "pessoas" (linha ~289) — aberto demais
  // pra editar base legal/prazo de retenção de dado pessoal. A edição real
  // é GestaoPoliticasRetencao (vB.6), restrita a nível Global.
  // 'canaisOficiais' removido daqui (v7.3): a relação de Canais Oficiais (Estatuto Art. 12) agora tem
  // validação própria — conta pessoal é recusada, o vínculo institucional é declarado, há administrador
  // com termo e custódia da senha. Editar pelo catálogo genérico (permissão "pessoas") contornaria tudo
  // isso. A edição real é GestaoCanais (/api/canais, permissão "canais_gestao").
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
  },
  rateioGeralDestinos: {
    tabela: "RateioGeralDestinos", chave: "DestinoId", idField: "destinoId",
    campos: { codigo: sql.NVarChar(30), nome: sql.NVarChar(150), percentual: sql.Decimal(5, 2), ativo: sql.Bit },
    permissao: "financeiro"
  },
  mediadoresArbitros: {
    tabela: "CatalogoMediadoresArbitros", chave: "MediadorArbitroId", idField: "mediadorArbitroId",
    campos: { membroId: sql.Int, papel: sql.NVarChar(20), ativo: sql.Bit },
    permissao: "mediacao"
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
    try {
      await pool.request()
        .input("sigla", sql.NVarChar(30), orgao.sigla)
        .input("nome", sql.NVarChar(200), `${orgao.nome} — ${registro.nome}`)
        .input("nivel", sql.Int, cfg.nivel)
        .input("referenciaId", sql.Int, referenciaId)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM OrgaosLocais WHERE Nivel = @nivel AND ReferenciaId = @referenciaId AND Sigla = @sigla)
            INSERT INTO OrgaosLocais (Sigla, Nome, Nivel, ReferenciaId, Ativo) VALUES (@sigla, @nome, @nivel, @referenciaId, 1)
        `);
    } catch (e) {
      // O IF NOT EXISTS não é atômico: se outro pedido criou o mesmo órgão no meio, o índice único (UX_OrgaosLocais_Unidade_Sigla) recusa o segundo — e o órgão que se queria já existe.
      if (!violouUnicidade(e)) throw e;
    }
  }
}

// Frase do 409 quando o banco recusa uma repetição (índices únicos das migrações 127 e 130), escolhida pelo nome do índice que vem no erro. O resto cai na frase genérica.
const FRASES_DE_REPETICAO = [
  [/UX_Congregacoes_Nome/, "Já existe uma congregação com esse nome (maiúscula e minúscula contam como a mesma). Escolha outro nome ou ajuste a que já existe."],
  [/UX_Congregacoes_Slug/, "Já existe uma congregação com esse endereço no site (slug). Escolha outro."],
  [/UX_OrgaosLocais_Unidade_Sigla/, "Essa unidade já tem um órgão com essa sigla."],
  [/UX_CargosMinisteriais_Sigla/, "Já existe um cargo ministerial com essa sigla."],
  [/UX_Departamentos_Sigla/, "Já existe um departamento com essa sigla."],
  [/UX_Papeis_Nome/, "Já existe um papel com esse nome."],
  [/UX_SituacoesMembro_Sigla/, "Já existe uma situação de membro com essa sigla."],
  [/UX_StatusMembro_Sigla/, "Já existe um status de membro com essa sigla."],
  [/UX_Prazos_Sigla/, "Já existe um prazo com essa sigla."],
  [/UX_Funcionalidades_Chave/, "Já existe uma funcionalidade com essa chave."]
];
function fraseDeRepeticao(erro) {
  const texto = String((erro && erro.message) || "");
  const achada = FRASES_DE_REPETICAO.find(([padrao]) => padrao.test(texto));
  return achada ? achada[1] : "Já existe um registro com esses dados neste cadastro (nome, sigla ou código repetido). Confira a lista antes de salvar.";
}

// v7.6 — o ESCOPO de acesso compara o NOME da congregação (a sessão guarda a lista de nomes; ver shared/escopo.js) e, para escopo de Extensão da Tenda, o nome
// da extensão dentro da congregação-mãe. Duas homônimas dividiriam o acesso. Criar ou renomear é recusado (409) se já existe outra com o mesmo nome — a
// comparação é do SQL, ignorando maiúscula/minúscula, ACENTO e espaço nas pontas ("São Pedro", "sao pedro " e "SÃO PEDRO" são o mesmo nome). É mais rígida que
// o índice único do banco (migração 130, que distingue acento): o lado seguro. O nome é gravado sem os espaços das pontas.
const NOME_SEM_HOMONIMA = {
  congregacoes: { mensagem: "Já existe uma congregação com esse nome (maiúsculas, acentos e espaços nas pontas não diferenciam). Escolha outro nome ou ajuste a que já existe." },
  extensoes: { mensagem: "Essa congregação-mãe já tem uma extensão com esse nome (maiúsculas, acentos e espaços nas pontas não diferenciam). Escolha outro nome." }
};
async function nomeHomonimo(pool, catalogoNome, dados, idCorpo) {
  const id = idCorpo ? auth.idDeRota(idCorpo) : null;
  const comparar = `LTRIM(RTRIM(Nome)) COLLATE Latin1_General_CI_AI = LTRIM(RTRIM(@nome)) COLLATE Latin1_General_CI_AI`;
  if (catalogoNome === "congregacoes") {
    const r = await pool.request().input("nome", sql.NVarChar(150), dados.nome).input("id", sql.Int, id)
      .query(`SELECT TOP 1 CongregacaoId FROM Congregacoes WHERE ${comparar} AND (@id IS NULL OR CongregacaoId <> @id)`);
    return (r.recordset || []).length > 0;
  }
  // Extensão: homônima dentro da MESMA congregação-mãe (a do corpo ou, numa edição sem ela, a que já está gravada).
  const r = await pool.request().input("nome", sql.NVarChar(150), dados.nome).input("id", sql.Int, id).input("mae", sql.Int, dados.congregacaoMaeId === undefined ? null : auth.idDeRota(dados.congregacaoMaeId))
    .query(`SELECT TOP 1 ExtensaoId FROM ExtensoesTenda
            WHERE ${comparar} AND (@id IS NULL OR ExtensaoId <> @id)
              AND CongregacaoMaeId = COALESCE(@mae, (SELECT CongregacaoMaeId FROM ExtensoesTenda WHERE ExtensaoId = @id))`);
  return (r.recordset || []).length > 0;
}

// v7.6 — SESSÃO REVOGÁVEL (shared/auth.js): o token carrega os NOMES de congregação (e de extensão) já resolvidos pela hierarquia, e as permissões e o nível
// de cada papel. Renomear, mudar de área/região/quadrante/distrito, excluir uma unidade ou mudar as permissões/nível de um papel deixaria tokens velhos
// alcançando o que não devem (ou deixando de alcançar) até expirar: todas as sessões abertas caem (menos a de quem fez a mudança, que é do nível geral) e o
// login seguinte já monta o escopo novo. Os campos de endereço, horário, mapa etc. não estão no token e não derrubam ninguém.
const CAMPOS_NO_TOKEN = {
  congregacoes: ["nome", "areaId"], extensoes: ["nome", "congregacaoMaeId", "ativa"], areas: ["regiaoId"], regioes: ["quadranteId"], quadrantes: ["distritoId"],
  distritos: [], papeis: ["nivel", "permissoes"]
};
async function derrubarSessoesSeMudouOToken(pool, catalogoNome, antes, depois, usuario) {
  const campos = CAMPOS_NO_TOKEN[catalogoNome];
  if (!campos || !antes) return 0;
  const mudou = !depois || campos.some((c) => JSON.stringify(antes[c] === undefined ? null : antes[c]) !== JSON.stringify(depois[c] === undefined ? null : depois[c]));
  if (!mudou) return 0;
  return auth.revogarTodasAsSessoes(pool, sql, { exceto: usuario && usuario.sid });
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
  const itens = result.recordset.map(linha => paraJson(config, linha));
  return config.enriquecer ? await config.enriquecer(pool, itens) : itens;
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

module.exports = comConflito(async function (context, req) {
  const method = (req.method || "GET").toUpperCase();
  const catalogoNome = context.bindingData.catalogo;
  const id = context.bindingData.id;
  const config = Object.prototype.hasOwnProperty.call(CATALOGOS, catalogoNome) ? CATALOGOS[catalogoNome] : null;

  if (!config) {
    context.res = { status: 404, body: { sucesso: false, mensagem: "Catálogo não encontrado." } };
    return;
  }

  const pool = await getPool();

  // LEITURA (decisão do responsável, 02/10/2026: o módulo de catálogos é da administração, não de "uma pessoa comum"). Antes qualquer pessoa da internet, sem login,
  // lia todos os catálogos — inclusive a matriz de permissões de cada cargo, alçadas de aprovação e o plano de contas. Agora: exige LOGIN (as telas de formulário usam
  // congregações, cargos, departamentos... para montar listas) e, nos catálogos internos, a permissão da área (a mesma que escreve neles). Exceção: as categorias de entrada
  // são o que o membro escolhe ao lançar a própria contribuição (Meu Painel), então ficam só com login.
  if (method === "GET") {
    const usuarioLeitura = config.permissao && !LEITURA_SO_COM_LOGIN.has(catalogoNome)
      ? auth.exigirPermissao(req, context, config.permissao)
      : auth.exigirLoginIgnorandoTermos(req, context);
    if (!usuarioLeitura) return;
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: await listar(pool, config) };
    return;
  }

  // ESCRITA: só o nível GERAL (papel Global com escopo de todas as congregações). Antes bastava a permissão "pessoas" — um Dirigente de Congregação renomeava ou
  // desativava congregações, áreas e departamentos de toda a igreja. A permissão de cada catálogo continua exigida (financeiro, disciplina, mediacao, permissoes).
  const usuario = exigirGeral(req, context, config.permissao || "pessoas");
  if (!usuario) return;

  if (method === "POST") {
    const dados = req.body || {};
    const idCorpo = dados.id;
    // v7.6 — nome de congregação/extensão: sem espaço nas pontas e sem homônima (ver nomeHomonimo).
    if (NOME_SEM_HOMONIMA[catalogoNome] && dados.nome !== undefined) {
      if (typeof dados.nome !== "string" || !dados.nome.trim()) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o nome." } };
        return;
      }
      dados.nome = dados.nome.trim();
      if (await nomeHomonimo(pool, catalogoNome, dados, idCorpo)) {
        context.res = { status: 409, body: { sucesso: false, mensagem: NOME_SEM_HOMONIMA[catalogoNome].mensagem } };
        return;
      }
    }
    const recusa = config.conferirEscrita ? await config.conferirEscrita(pool, dados, idCorpo ? auth.idDeRota(idCorpo) : null) : null;
    if (recusa) {
      context.res = { status: 200, body: { sucesso: false, mensagem: recusa } };
      return;
    }
    if (idCorpo) {
      const bloqueio = config.bloqueioDeEdicao && auth.idDeRota(idCorpo) ? await config.bloqueioDeEdicao(pool, auth.idDeRota(idCorpo)) : null;
      if (bloqueio) {
        context.res = { status: 200, body: { sucesso: false, mensagem: bloqueio } };
        return;
      }
      const dadosAntes = await buscarPorId(pool, config, idCorpo);
      const registro = await atualizar(pool, config, idCorpo, dados);
      if (!registro) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Registro não encontrado." } };
        return;
      }
      if (config.aposAtualizar) await config.aposAtualizar(pool, dadosAntes, registro, usuario);   // Trava 9-A — o efeito que a mudança pede (ex.: a Extensão desativada)
      const sessoesEncerradas = await derrubarSessoesSeMudouOToken(pool, catalogoNome, dadosAntes, registro, usuario);
      await registrarAuditoria({
        tabela: config.tabela, registroId: Number(idCorpo), acao: "Atualizou registro",
        usuarioId: usuario.membroId, dadosAntes, dadosDepois: sessoesEncerradas ? { ...registro, sessoesEncerradas } : registro
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
      const sessoesEncerradas = await derrubarSessoesSeMudouOToken(pool, catalogoNome, dadosAntes, null, usuario);
      await registrarAuditoria({ tabela: config.tabela, registroId: Number(id), acao: "Excluiu registro", usuarioId: usuario.membroId, dadosAntes, dadosDepois: sessoesEncerradas ? { sessoesEncerradas } : undefined });
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: ok, mensagem: ok ? "✅ Excluído." : "Registro não encontrado." } };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método não suportado." } };
}, fraseDeRepeticao);
