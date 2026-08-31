// GestaoCatalogos — CRUD genérico para catálogos e hierarquia configuráveis.
// GET    /api/catalogos/{catalogo}        -> lista
// POST   /api/catalogos/{catalogo}        -> cria (sem id) ou atualiza (com id)
// DELETE /api/catalogos/{catalogo}/{id}   -> exclui
const auth = require("../shared/auth");
const mockDb = require("../shared/mockDb");

const CATALOGOS = {
  situacoes: mockDb.situacoesMembro,
  departamentos: mockDb.departamentos,
  areas: mockDb.areas,
  regioes: mockDb.regioes,
  quadrantes: mockDb.quadrantes,
  distritos: mockDb.distritos,
  extensoes: mockDb.extensoes,
  congregacoes: {
    listar: () => mockDb.listarCongregacoes(),
    criar: (dados) => mockDb.criarCongregacao(dados),
    atualizar: (id, dados) => mockDb.atualizarCongregacao(id, dados),
    excluir: (id) => { const r = mockDb.excluirCongregacao(id); return r === true; }
  },
  funcionalidades: mockDb.funcionalidades,
  papeis: mockDb.papeis
};

module.exports = async function (context, req) {
  const method = (req.method || "GET").toUpperCase();
  const catalogoNome = context.bindingData.catalogo;
  const id = context.bindingData.id;
  const crud = CATALOGOS[catalogoNome];

  if (!crud) {
    context.res = { status: 404, body: { sucesso: false, mensagem: "Catálogo não encontrado." } };
    return;
  }

  if (method === "GET") {
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: crud.listar() };
    return;
  }

  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  if (method === "POST") {
    const dados = req.body || {};
    const idCorpo = dados.id;
    if (idCorpo) {
      const x = crud.atualizar(idCorpo, dados);
      if (!x) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Registro não encontrado." } };
        return;
      }
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Registro atualizado.", registro: x } };
    } else {
      const x = crud.criar(dados);
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Registro criado.", registro: x } };
    }
    return;
  }

  if (method === "DELETE") {
    if (!id) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/catalogos/{catalogo}/{id}" } };
      return;
    }
    const ok = crud.excluir(id);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: ok, mensagem: ok ? "✅ Excluído." : "Registro não encontrado." } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};