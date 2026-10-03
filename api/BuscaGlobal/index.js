// BuscaGlobal (vB.4 — Busca global)
// Busca no topo do painel, sem precisar saber de antemão em qual das abas
// o dado mora. Cada fonte só entra no resultado se o usuário tiver a
// permissão daquela fonte (mesma checagem que a tela correspondente já
// faz) e respeita o escopo territorial de quem procura. TOP 5 por fonte —
// dropdown de busca rápida, não substitui a tela cheia de cada módulo.
//
// Escopo (auditoria de 02/10/2026):
//  - Pessoa e Lançamento têm congregação: o filtro de escopo (congregação e, para quem tem escopo de Extensão da Tenda, a Extensão) vai para o SQL ANTES do
//    TOP 5. Antes o corte vinha primeiro e o filtro depois: nomes de fora do escopo ocupavam as cinco vagas e escondiam os de dentro.
//  - Fornecedor e Projeto são INSTITUCIONAIS (a tabela não tem congregação; o fornecedor traz CPF/CNPJ): só o nível geral os encontra por aqui.
//  - Documento (anexo): só as tabelas institucionais acima, e só para o geral. Processos de abandono e denúncias da Ouvidoria NÃO entram na busca — são sigilosos
//    (Art. 45) e o nome do arquivo costuma trazer o nome da pessoa; quem precisa deles entra na aba própria.
//  - Sessão sem permissão nenhuma (membro por PIN/código) recebe lista vazia sem tocar no banco.
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { permissoesDaTabela } = require("../shared/anexos");
const { ehGeral, filtrarPorEscopo } = require("../shared/escopoRotas");

const ABA_POR_TABELA_ANEXO = { Projetos: "reunioes", Fornecedores: "financeiro" };
const LIMITE_POR_FONTE = 5;
const LIMITE_NOMES_NO_SQL = 1500;   // o SQL Server aceita ~2100 parâmetros por consulta
const TOP_EM_MEMORIA = 200;         // escopo gigante demais para ir ao SQL: busca mais linhas e corta depois do filtro

// Filtro de congregação para o SQL. `vazio`: o escopo não alcança congregação nenhuma (nem consulta). `emMemoria`: lista grande demais, filtra no JS.
function filtroDeCongregacoes(request, coluna, usuario) {
  if (usuario.escopoCongregacoes === "TODAS") return { sql: "", vazio: false, emMemoria: false };
  const nomes = Array.isArray(usuario.escopoCongregacoes) ? usuario.escopoCongregacoes : [];
  if (nomes.length === 0) return { sql: "", vazio: true, emMemoria: false };
  if (nomes.length > LIMITE_NOMES_NO_SQL) return { sql: "", vazio: false, emMemoria: true };
  const marcadores = nomes.map((nome, i) => { request.input(`escopo${i}`, sql.NVarChar(150), nome); return `@escopo${i}`; });
  return { sql: ` AND ${coluna} IN (${marcadores.join(", ")})`, vazio: false, emMemoria: false };
}

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;
  const bruto = req.query && req.query.q;
  const termo = typeof bruto === "string" ? bruto.trim() : "";
  if (termo.length < 2) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Digite ao menos 2 caracteres." } };
    return;
  }
  const permissoes = Array.isArray(usuario.permissoes) ? usuario.permissoes : [];
  if (permissoes.length === 0) {
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: [] };
    return;
  }
  // v7.6 — cada fonte usa a visão da SUA permissão (escopo/nível só das concessões que têm aquela permissão; ver shared/auth.js, "Concessões").
  const vPessoas = auth.visaoDaPermissao(usuario, "pessoas");
  const vFinanceiro = auth.visaoDaPermissao(usuario, "financeiro");
  const vProjetos = auth.visaoDaPermissao(usuario, ["reunioes", "cli"]);
  const pool = await getPool();
  const like = `%${termo}%`;
  const resultados = [];

  if (vPessoas) {
    const request = pool.request().input("q", sql.NVarChar(200), like);
    const escopo = filtroDeCongregacoes(request, "cg.Nome", vPessoas);
    if (!escopo.vazio) {
      let filtroExtensao = "";
      // extensão no SQL só quando a visão é de UMA concessão; com várias, filtrarPorEscopo (abaixo) confere concessão por concessão
      if (vPessoas.escopoExtensaoNome && auth.concessoesDaVisao(vPessoas).length === 1) { request.input("extensao", sql.NVarChar(150), vPessoas.escopoExtensaoNome); filtroExtensao = " AND ex.Nome = @extensao"; }
      const r = await request.query(`
        SELECT TOP ${escopo.emMemoria ? TOP_EM_MEMORIA : LIMITE_POR_FONTE} m.MembroId AS id, m.Nome AS titulo, cg.Nome AS congregacao, ex.Nome AS extensao
        FROM MembroReferencia m
        LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
        LEFT JOIN ExtensoesTenda ex ON ex.ExtensaoId = m.ExtensaoId
        WHERE m.Nome LIKE @q${escopo.sql}${filtroExtensao}
      `);
      // O SQL já filtrou; o JS repete a conferência (e é ele que corta quando a lista de congregações é grande demais para o SQL).
      filtrarPorEscopo(vPessoas, r.recordset, p => p.congregacao, p => p.extensao).slice(0, LIMITE_POR_FONTE)
        .forEach(p => resultados.push({ tipo: "Pessoa", titulo: p.titulo, subtitulo: p.congregacao || "-", aba: "pessoas" }));
    }
  }

  if (vFinanceiro) {
    if (ehGeral(vFinanceiro)) {
      const rf = await pool.request().input("q", sql.NVarChar(200), like).query(`
        SELECT TOP ${LIMITE_POR_FONTE} FornecedorId AS id, Nome AS titulo, CpfCnpj AS subtitulo FROM Fornecedores WHERE Nome LIKE @q OR CpfCnpj LIKE @q
      `);
      rf.recordset.forEach(f => resultados.push({ tipo: "Fornecedor", titulo: f.titulo, subtitulo: f.subtitulo, aba: "financeiro" }));
    }

    const numero = Number(termo);
    const requestL = pool.request().input("q", sql.NVarChar(200), like).input("numero", sql.Int, Number.isInteger(numero) && Math.abs(numero) < 2147483647 ? numero : -1);
    const escopoL = filtroDeCongregacoes(requestL, "cg.Nome", vFinanceiro);
    if (!escopoL.vazio) {
      const rl = await requestL.query(`
        SELECT TOP ${escopoL.emMemoria ? TOP_EM_MEMORIA : LIMITE_POR_FONTE} l.LancamentoId AS id, l.TermoNumero AS termoNumero, l.Valor AS valor, cg.Nome AS congregacao
        FROM LancamentosTesouraria l JOIN Congregacoes cg ON cg.CongregacaoId = l.CongregacaoId
        WHERE (l.TermoNumero = @numero OR l.NomeAvulso LIKE @q)${escopoL.sql}
      `);
      rl.recordset.filter(l => auth.estaNoEscopo(vFinanceiro, l.congregacao)).slice(0, LIMITE_POR_FONTE)
        .forEach(l => resultados.push({ tipo: "Lançamento", titulo: `Termo nº ${l.termoNumero}`, subtitulo: `${l.congregacao} — R$ ${Number(l.valor).toFixed(2)}`, aba: "financeiro" }));
    }
  }

  if (vProjetos && ehGeral(vProjetos)) {
    const rp = await pool.request().input("q", sql.NVarChar(200), like).query(`
      SELECT TOP ${LIMITE_POR_FONTE} ProjetoId AS id, Titulo AS titulo, Protocolo AS protocolo FROM Projetos WHERE Titulo LIKE @q OR Protocolo LIKE @q
    `);
    rp.recordset.forEach(p => resultados.push({ tipo: "Projeto", titulo: p.titulo, subtitulo: p.protocolo, aba: "reunioes" }));
  }

  // Anexos genéricos: busca por nome de arquivo, só do nível geral e só entre tabelas cuja permissão ele já tem — nunca revela nome de anexo de tabela que
  // ele não pode ver. As tabelas de anexo não têm congregação, então não há como filtrar por escopo: quem não é geral não os encontra por aqui.
  const tabelasPermitidas = Object.keys(ABA_POR_TABELA_ANEXO).filter(tabela => {
    const permissoesTabela = permissoesDaTabela(tabela) || [];
    return permissoesTabela.length > 0 && ehGeral(auth.visaoDaPermissao(usuario, permissoesTabela));
  });
  if (tabelasPermitidas.length > 0) {
    const requestAnexos = pool.request().input("q", sql.NVarChar(200), like);
    const parametrosTabela = tabelasPermitidas.map((tabela, i) => {
      requestAnexos.input(`t${i}`, sql.NVarChar(60), tabela);
      return `@t${i}`;
    });
    const ra = await requestAnexos.query(`
      SELECT TOP ${LIMITE_POR_FONTE} AnexoId AS id, Tabela AS tabela, RegistroId AS registroId, NomeArquivo AS nomeArquivo
      FROM AnexosGenericos WHERE NomeArquivo LIKE @q AND Tabela IN (${parametrosTabela.join(",")})
    `);
    ra.recordset.forEach(a => resultados.push({ tipo: "Documento", titulo: a.nomeArquivo, subtitulo: a.tabela, aba: ABA_POR_TABELA_ANEXO[a.tabela] || null }));
  }

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: resultados };
};
