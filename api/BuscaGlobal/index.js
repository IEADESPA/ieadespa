// BuscaGlobal (vB.4 — Busca global)
// Busca no topo do painel, sem precisar saber de antemão em qual das abas
// o dado mora. Cada fonte só entra no resultado se o usuário tiver a
// permissão daquela fonte (mesma checagem que a tela correspondente já
// faz) e respeita o escopo territorial de quem procura (mesmo padrão
// `auth.estaNoEscopo` já usado em GestaoPessoas). TOP 5 por fonte —
// dropdown de busca rápida, não substitui a tela cheia de cada módulo.
//
// De propósito fora daqui: Processos Disciplinares e Procedimentos de
// Abandono são sigilosos (Art. 45) — um campo de busca genérico no topo
// aumentaria o risco de exposição sem necessidade real (quem precisa
// desses dados já sabe entrar na aba própria).
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { permissoesDaTabela } = require("../shared/anexos");

const ABA_POR_TABELA_ANEXO = { Projetos: "reunioes", Fornecedores: "financeiro", ProcedimentosAbandono: "disciplina", DenunciasOuvidoria: "ouvidoria" };

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;
  const termo = ((req.query || {}).q || "").trim();
  if (termo.length < 2) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Digite ao menos 2 caracteres." } };
    return;
  }
  const pool = await getPool();
  const like = `%${termo}%`;
  const resultados = [];

  if (usuario.permissoes.includes("pessoas")) {
    const r = await pool.request().input("q", sql.NVarChar(200), like).query(`
      SELECT TOP 5 m.MembroId AS id, m.Nome AS titulo, cg.Nome AS congregacao
      FROM MembroReferencia m LEFT JOIN Congregacoes cg ON cg.CongregacaoId = m.CongregacaoId
      WHERE m.Nome LIKE @q
    `);
    r.recordset.filter(p => auth.estaNoEscopo(usuario, p.congregacao))
      .forEach(p => resultados.push({ tipo: "Pessoa", titulo: p.titulo, subtitulo: p.congregacao || "-", aba: "pessoas" }));
  }

  if (usuario.permissoes.includes("financeiro")) {
    const rf = await pool.request().input("q", sql.NVarChar(200), like).query(`
      SELECT TOP 5 FornecedorId AS id, Nome AS titulo, CpfCnpj AS subtitulo FROM Fornecedores WHERE Nome LIKE @q OR CpfCnpj LIKE @q
    `);
    rf.recordset.forEach(f => resultados.push({ tipo: "Fornecedor", titulo: f.titulo, subtitulo: f.subtitulo, aba: "financeiro" }));

    const numero = Number(termo);
    const rl = await pool.request()
      .input("q", sql.NVarChar(200), like).input("numero", sql.Int, Number.isInteger(numero) ? numero : -1)
      .query(`
        SELECT TOP 5 l.LancamentoId AS id, l.TermoNumero AS termoNumero, l.Valor AS valor, cg.Nome AS congregacao
        FROM LancamentosTesouraria l JOIN Congregacoes cg ON cg.CongregacaoId = l.CongregacaoId
        WHERE l.TermoNumero = @numero OR l.NomeAvulso LIKE @q
      `);
    rl.recordset.filter(l => auth.estaNoEscopo(usuario, l.congregacao))
      .forEach(l => resultados.push({ tipo: "Lançamento", titulo: `Termo nº ${l.termoNumero}`, subtitulo: `${l.congregacao} — R$ ${Number(l.valor).toFixed(2)}`, aba: "financeiro" }));
  }

  if (usuario.permissoes.includes("reunioes") || usuario.permissoes.includes("cli")) {
    const rp = await pool.request().input("q", sql.NVarChar(200), like).query(`
      SELECT TOP 5 ProjetoId AS id, Titulo AS titulo, Protocolo AS protocolo FROM Projetos WHERE Titulo LIKE @q OR Protocolo LIKE @q
    `);
    rp.recordset.forEach(p => resultados.push({ tipo: "Projeto", titulo: p.titulo, subtitulo: p.protocolo, aba: "reunioes" }));
  }

  // Anexos genéricos: busca por nome de arquivo, mas só entre tabelas cuja
  // permissão o usuário já tem — nunca revela nome de anexo de tabela que
  // ele não pode ver (ex: alguém sem "ouvidoria" não vê anexo de denúncia).
  const tabelasPermitidas = Object.keys(ABA_POR_TABELA_ANEXO).filter(tabela =>
    (permissoesDaTabela(tabela) || []).some(p => usuario.permissoes.includes(p))
  );
  if (tabelasPermitidas.length > 0) {
    const requestAnexos = pool.request().input("q", sql.NVarChar(200), like);
    const parametrosTabela = tabelasPermitidas.map((tabela, i) => {
      requestAnexos.input(`t${i}`, sql.NVarChar(60), tabela);
      return `@t${i}`;
    });
    const ra = await requestAnexos.query(`
      SELECT TOP 5 AnexoId AS id, Tabela AS tabela, RegistroId AS registroId, NomeArquivo AS nomeArquivo
      FROM AnexosGenericos WHERE NomeArquivo LIKE @q AND Tabela IN (${parametrosTabela.join(",")})
    `);
    ra.recordset.forEach(a => resultados.push({ tipo: "Documento", titulo: a.nomeArquivo, subtitulo: a.tabela, aba: ABA_POR_TABELA_ANEXO[a.tabela] || null }));
  }

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: resultados };
};
