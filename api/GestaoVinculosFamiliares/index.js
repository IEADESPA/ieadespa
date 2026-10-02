// GestaoVinculosFamiliares
// Núcleo mínimo (v0.2) — cadastro de relacionamentos entre membros (cônjuge, pai/mãe-
// filho, irmão, sogro/genro/nora), base para as vedações de nepotismo de fases futuras
// (v2.6 Conselho Fiscal, v3.1 CEI). Sem cálculo de grau de parentesco por travessia
// ainda (shared/parentesco.js nasce quando houver um consumidor de verdade).
// Exige a permissão "pessoas" (mesma que já vê telefone/e-mail/endereço). A
// validação/criação em si mora em shared/vinculosFamiliares.js (v1.11) — reaproveitada
// também pelo autoatendimento (MeusVinculosFamiliares).
// GET    /api/vinculos-familiares?membroId=123 -> vínculos de uma pessoa (ou todos, sem o filtro)
// POST   /api/vinculos-familiares              -> body: { membroId, membroParenteId, tipoVinculoId }
// DELETE /api/vinculos-familiares/{id}
//
// ESCOPO (fica nesta rota, não no shared que o autoatendimento reaproveita): o vínculo alimenta as vedações de nepotismo (Conselho Fiscal, CEI, suspeição de relator),
// então criar/apagar vínculo de gente de outra congregação adulteraria essas vedações. Um vínculo liga DUAS pessoas, e as famílias atravessam congregações: vale quando ao
// menos UMA das pontas está no escopo de quem lista/cria/apaga. Fora disso, a resposta é a mesma de "não existe".
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const vinculos = require("../shared/vinculosFamiliares");
const { noEscopoDaPessoa, pessoaAlcancavel, carregarPessoa } = require("../shared/escopoRotas");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const method = req.method;
  const idRotaBruto = context.bindingData.id;
  const pool = await getPool();

  if (method === "GET") {
    const membroIdBruto = (req.query || {}).membroId;
    if (membroIdBruto !== undefined && membroIdBruto !== null && membroIdBruto !== "") {
      // Pessoa inexistente, malformada ou fora do escopo: lista vazia, igual a quem não tem parentes cadastrados.
      const pessoa = await pessoaAlcancavel(pool, usuario, membroIdBruto);
      const lista = pessoa ? await vinculos.listarVinculosDeMembro(pool, sql, pessoa.membroId) : [];
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: lista };
      return;
    }
    // Sem filtro: todos os vínculos em que ao menos uma ponta é do escopo (a consulta do shared não traz a congregação, por isso esta é local da rota).
    const result = await pool.request().query(`
      SELECT v.VinculoId AS vinculoId, v.MembroId AS membroId, m1.Nome AS nome,
             v.MembroParenteId AS membroParenteId, m2.Nome AS parenteNome,
             t.Codigo AS tipoCodigo, t.RotuloDireto AS rotulo, v.ResponsavelLegal AS responsavelLegal,
             c1.Nome AS congregacaoNome, e1.Nome AS extensaoNome, c2.Nome AS parenteCongregacaoNome, e2.Nome AS parenteExtensaoNome
      FROM VinculosFamiliares v
      JOIN TiposVinculoFamiliar t ON t.TipoVinculoId = v.TipoVinculoId
      JOIN MembroReferencia m1 ON m1.MembroId = v.MembroId
      JOIN MembroReferencia m2 ON m2.MembroId = v.MembroParenteId
      LEFT JOIN Congregacoes c1 ON c1.CongregacaoId = m1.CongregacaoId
      LEFT JOIN ExtensoesTenda e1 ON e1.ExtensaoId = m1.ExtensaoId
      LEFT JOIN Congregacoes c2 ON c2.CongregacaoId = m2.CongregacaoId
      LEFT JOIN ExtensoesTenda e2 ON e2.ExtensaoId = m2.ExtensaoId
      ORDER BY m1.Nome`);
    const lista = result.recordset
      .filter(l => noEscopoDaPessoa(usuario, l.congregacaoNome, l.extensaoNome) || noEscopoDaPessoa(usuario, l.parenteCongregacaoNome, l.parenteExtensaoNome))
      .map(({ congregacaoNome, extensaoNome, parenteCongregacaoNome, parenteExtensaoNome, ...resto }) => resto);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: lista };
    return;
  }

  if (method === "POST") {
    const { membroId, membroParenteId, tipoVinculoId, responsavelLegal } = req.body || {};
    const membroIdOk = auth.idDeRota(membroId);
    const parenteIdOk = auth.idDeRota(membroParenteId);
    const tipoOk = auth.idDeRota(tipoVinculoId);
    // Id malformado: a mesma resposta de campos faltando do shared (nada de 500).
    if (!membroIdOk || !parenteIdOk || !tipoOk) {
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: false, mensagem: "Campos obrigatórios: membroId, membroParenteId, tipoVinculoId." } };
      return;
    }
    // A pessoa de quem o vínculo é cadastrado precisa estar no escopo; a outra ponta só precisa existir (a família atravessa congregações — o shared confere).
    if (!(await pessoaAlcancavel(pool, usuario, membroIdOk))) {
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: false, mensagem: "Cadastre as duas pessoas antes de vincular." } };
      return;
    }
    const resultado = await vinculos.criarVinculo(pool, sql, { membroId: membroIdOk, membroParenteId: parenteIdOk, tipoVinculoId: tipoOk, responsavelLegal, criadoPor: usuario.membroId });
    context.res = { status: resultado.sucesso ? 201 : 200, headers: { "Content-Type": "application/json" }, body: resultado };
    return;
  }

  if (method === "DELETE") {
    if (!idRotaBruto) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/vinculos-familiares/{id}" } };
      return;
    }
    const idRota = auth.idDeRota(idRotaBruto);
    const vinculo = idRota ? (await pool.request().input("id", sql.Int, idRota).query(`SELECT MembroId, MembroParenteId FROM VinculosFamiliares WHERE VinculoId = @id`)).recordset[0] : null;
    let alcanca = false;
    if (vinculo) {
      const a = await carregarPessoa(pool, vinculo.MembroId);
      const b = await carregarPessoa(pool, vinculo.MembroParenteId);
      alcanca = (!!a && noEscopoDaPessoa(usuario, a.congregacaoNome, a.extensaoNome)) || (!!b && noEscopoDaPessoa(usuario, b.congregacaoNome, b.extensaoNome));
    }
    // Vínculo inexistente e vínculo sem ponta no escopo: a mesma resposta do shared.
    if (!alcanca) {
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: false, mensagem: "Vínculo não encontrado." } };
      return;
    }
    const resultado = await vinculos.removerVinculo(pool, sql, idRota, usuario.membroId);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: resultado };
    return;
  }

  context.res = { status: 405, body: { sucesso: false, mensagem: "Método não suportado." } };
};
