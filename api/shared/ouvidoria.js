// shared/ouvidoria.js (v3.7)
// Ouvidoria Eclesiástica (Art. 104) — canal de denúncias/sugestões sigiloso
// e opcionalmente anônimo, vinculado ao NIF (Conselho Fiscal) + CEI,
// independente da Diretoria Executiva.
const crypto = require("crypto");

// Protocolo é a única forma de o denunciante (inclusive anônimo) acompanhar
// depois — sequencial (organização) + sufixo aleatório (dificulta
// enumeração por quem só vê o formato).
async function gerarProtocolo(pool, sql) {
  const ano = new Date().getFullYear();
  const totalResult = await pool.request().input("prefixo", sql.NVarChar(20), `OUV-${ano}-`)
    .query(`SELECT COUNT(*) AS total FROM DenunciasOuvidoria WHERE Protocolo LIKE @prefixo + '%'`);
  const sequencial = String(totalResult.recordset[0].total + 1).padStart(5, "0");
  const sufixo = crypto.randomBytes(2).toString("hex");
  return `OUV-${ano}-${sequencial}-${sufixo}`;
}

// Art. 104 §8º — vedado compartilhar com a Diretoria Executiva quando ela
// for parte denunciada. Mesma ideia de membroAutorizadoNoOrgaoLocal, só que
// fixa num órgão central (Assentos já referencia Orgaos diretamente).
async function usuarioEhDaDiretoria(pool, sql, membroId) {
  const result = await pool.request().input("membroId", sql.Int, membroId).query(`
    SELECT TOP 1 a.AssentoId
    FROM Assentos a JOIN Orgaos o ON o.OrgaoId = a.OrgaoId
    WHERE a.MembroId = @membroId AND a.DataFim IS NULL AND o.Sigla = 'DIRETORIA_EXECUTIVA'
  `);
  return result.recordset.length > 0;
}

// Remove da lista qualquer denúncia contra alguém da Diretoria quando quem
// está vendo TAMBÉM é da Diretoria (conflito de interesse real, Art. 104
// §8º) — não é redação parcial, é ocultação total da linha.
async function redigirDenuncias(pool, sql, denuncias, usuario) {
  if (denuncias.length === 0) return denuncias;
  const usuarioEhDiretoria = await usuarioEhDaDiretoria(pool, sql, usuario.membroId);
  if (!usuarioEhDiretoria) return denuncias;
  return denuncias.filter(d => !d.denunciadoEhDiretoria);
}

module.exports = { gerarProtocolo, usuarioEhDaDiretoria, redigirDenuncias };
