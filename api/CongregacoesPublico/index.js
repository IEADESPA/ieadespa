// CongregacoesPublico (vC.2)
// Fonte única de congregações pro site institucional — substitui a coleção
// "congregacoes" do Directus. Sem login (anonymous): só devolve dado que já
// é público por natureza (endereço, bairro, cidade, mapa, horário, nome do
// dirigente), nunca dado pessoal do dirigente (telefone/e-mail/CPF ficam em
// MembroReferencia, fora daqui). Só lista congregação Ativa = 1.
// GET /api/congregacoes-publico          -> lista todas as ativas
// GET /api/congregacoes-publico/{slug}   -> uma congregação por slug
const { getPool, sql } = require("../shared/db");

const SELECT_PUBLICO = `
  SELECT c.CongregacaoId AS congregacaoId, c.Nome AS nome, c.Slug AS slug,
         c.Endereco AS endereco, c.Bairro AS bairro, c.Cidade AS cidade, c.Estado AS estado,
         c.Cep AS cep, c.NotaEndereco AS notaEndereco, c.Horarios AS horarios, c.MapsUrl AS mapsUrl,
         c.Lat AS lat, c.Lng AS lng, c.GoogleMapsPlaceQuery AS googleMapsPlaceQuery,
         dirigente.Nome AS dirigenteAtual
  FROM Congregacoes c
  OUTER APPLY (
    SELECT TOP 1 m.Nome
    FROM Lideranca l
    JOIN Papeis p ON p.PapelId = l.PapelId AND p.Nome = 'Dirigente de Congregação'
    JOIN MembroReferencia m ON m.MembroId = l.MembroId
    WHERE l.EscopoTipo = 'CONGREGACAO' AND l.EscopoId = c.CongregacaoId
      AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))
    ORDER BY l.LiderancaId DESC
  ) dirigente
  WHERE c.Ativa = 1
`;

module.exports = async function (context, req) {
  if (req.method !== "GET") {
    context.res = { status: 405, body: { erro: "Método não suportado." } };
    return;
  }

  const slug = context.bindingData.slug;
  const pool = await getPool();

  if (slug) {
    const result = await pool.request().input("slug", sql.NVarChar(150), slug)
      .query(`${SELECT_PUBLICO} AND c.Slug = @slug`);
    if (result.recordset.length === 0) {
      context.res = { status: 404, body: { erro: "Congregação não encontrada." } };
      return;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset[0] };
    return;
  }

  const result = await pool.request().query(`${SELECT_PUBLICO} ORDER BY c.Nome`);
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
};
