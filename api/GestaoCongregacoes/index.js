// GestaoCongregacoes
// Leitura resolvida do catálogo de congregações — usada por quem só precisa
// consultar (ex: dropdown do cadastro de pessoa). Exige a permissão
// "pessoas" (é dado de apoio ao cadastro de pessoas). Quem cria/edita/
// desativa/exclui congregação é api/GestaoCatalogos (catálogo "congregacoes"
// — é quem também cria o órgão JAI automático de toda congregação nova,
// ver ORGAOS_AUTOMATICOS_POR_CATALOGO lá); não duplicar essa escrita aqui.
// Desde a v075 (vC.2) devolve também endereço/bairro/cidade/estado/mapa —
// campos que não existem em nenhum outro lugar do sistema, trazidos da
// coleção "congregacoes" do Directus (site institucional) pra virar fonte
// única. Quem é o dirigente atual NÃO é uma coluna: é calculado na leitura
// a partir de Lideranca (mesma lógica de api/shared/universo.js na
// composição da CLI) — ver DIRIGENTE_ATUAL_SQL abaixo. Ler essa lista sem
// login (site institucional) é feito por api/CongregacoesPublico (só os
// campos públicos, sem exigir a permissão "pessoas" daqui).
// GET /api/congregacoes -> lista (inclusive inativas), com dirigenteAtual calculado
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");

// Subconsulta reaproveitada pelo GET: mesmo critério de "quem dirige essa
// congregação hoje" usado em api/shared/universo.js (composição da CLI) —
// Papeis.Nome = 'Dirigente de Congregação', escopo batendo e mandato (se
// houver) ainda não vencido. Nunca gravar isso como coluna: já dessincroniza
// no primeiro dia em que alguém trocar de dirigente.
const DIRIGENTE_ATUAL_SQL = `
  OUTER APPLY (
    SELECT TOP 1 m.Nome
    FROM Lideranca l
    JOIN Papeis p ON p.PapelId = l.PapelId AND p.Nome = 'Dirigente de Congregação'
    JOIN MembroReferencia m ON m.MembroId = l.MembroId
    WHERE l.EscopoTipo = 'CONGREGACAO' AND l.EscopoId = c.CongregacaoId
      AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))
    ORDER BY l.LiderancaId DESC
  ) dirigente
`;

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  if (req.method !== "GET") {
    context.res = { status: 405, body: { erro: "Método não suportado. Use /api/catalogos/congregacoes para criar/editar/excluir." } };
    return;
  }

  const pool = await getPool();
  const result = await pool.request().query(
    `SELECT c.CongregacaoId AS congregacaoId, c.Nome AS nome, c.Ativa AS ativa, c.AreaId AS areaId,
            c.Slug AS slug, c.Endereco AS endereco, c.Bairro AS bairro, c.Cidade AS cidade, c.Estado AS estado,
            c.Cep AS cep, c.NotaEndereco AS notaEndereco, c.Horarios AS horarios, c.MapsUrl AS mapsUrl,
            c.Lat AS lat, c.Lng AS lng, c.GoogleMapsPlaceQuery AS googleMapsPlaceQuery,
            dirigente.Nome AS dirigenteAtual
     FROM Congregacoes c
     ${DIRIGENTE_ATUAL_SQL}
     ORDER BY c.Nome`
  );
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
};
