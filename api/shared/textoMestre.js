// shared/textoMestre.js (vB.15 — Texto Mestre Consolidado, Reg. Art. 162 §§2º-4º e 162-B)
// Consolidação = versionamento do arquivo inteiro + ficha de vigência ao
// redor dele (a v2.9 já descartou editor de texto, com razão — isso não
// muda aqui). "Qual era o texto vigente na data X" é uma leitura contra
// TextoMestreVersoes, nunca reconstruída somando alterações soltas.
const { sql } = require("./db");
const estatuto = require("./estatuto");

// Art. 162 §2º — 48h após o registro da ata de alteração. O sistema só tem
// granularidade de DIA em todo o resto (DIAS_LAVRATURA/DIAS_CARTORIO em
// GestaoDocumentos são o mesmo padrão) — 2 dias é a aproximação mais
// próxima de 48h nesse padrão já estabelecido, documentada aqui, não
// escondida atrás de uma falsa precisão de hora.
const DIAS_PRAZO_ATUALIZACAO = 2;

// Art. 162 §§3º-4º — acima de 30% dos artigos tocados, exige registro
// integral, não só averbação. O sistema não mede diff de texto jurídico —
// só alerta a partir de uma contagem que o Secretário informa.
const LIMIAR_REGISTRO_INTEGRAL = 0.30;

// Art. 162-B — revisão sistêmica a cada 4 anos. v7.2 (motor de calendário
// institucional oficial) ainda não existe — isso fica como um alerta
// mínimo e autônomo (mesmo padrão diasDesde de todo o resto), não uma
// integração fabricada com um motor que não foi construído ainda.
const ANOS_REVISAO_QUADRIENAL = 4;
const DIAS_ANTECEDENCIA_REVISAO = 180; // ~6 meses de horizonte de planejamento

async function versaoVigenteEm(pool, data) {
  const r = await pool.request().input("data", sql.Date, data).query(`
    SELECT TOP 1 VersaoId AS versaoId, NumeroVersao AS numeroVersao, UrlBlob AS urlBlob,
           CONVERT(varchar(10), DataVigencia, 120) AS dataVigencia, DocumentoOrigemId AS documentoOrigemId,
           TotalArtigos AS totalArtigos, ArtigosTocados AS artigosTocados
    FROM TextoMestreVersoes
    WHERE DataVigencia <= @data
    ORDER BY DataVigencia DESC, NumeroVersao DESC
  `);
  return r.recordset[0] || null;
}

// "Alteração do Regimento registrada mas ainda não consolidada no Texto
// Mestre" — o gatilho real do prazo de 48h. Reaproveita o catálogo
// Tipo=REGIMENTO que a v2.9 já usa pra guardar alterações (não fabrica um
// tipo novo): qualquer Documento desses sem TextoMestreVersoes apontando
// pra ele é uma pendência.
async function alteracoesRegimentoPendentes(pool, hoje) {
  const r = await pool.request().query(`
    SELECT d.DocumentoId AS documentoId, d.Descricao AS descricao,
           CONVERT(varchar(10), d.CriadoEm, 120) AS registradoEm
    FROM Documentos d
    LEFT JOIN TextoMestreVersoes v ON v.DocumentoOrigemId = d.DocumentoId
    WHERE d.Tipo = 'REGIMENTO' AND v.VersaoId IS NULL
    ORDER BY d.CriadoEm
  `);
  const hojeStr = hoje || new Date().toISOString().slice(0, 10);
  return r.recordset.map((doc) => {
    const diasDesdeRegistro = estatuto.diasDesde(doc.registradoEm, hojeStr);
    return Object.assign({}, doc, { diasDesdeRegistro, prazoVencido: diasDesdeRegistro > DIAS_PRAZO_ATUALIZACAO });
  });
}

function avaliarLimiar30Porcento(totalArtigos, artigosTocados) {
  if (!totalArtigos || totalArtigos <= 0 || artigosTocados == null) {
    return { percentual: null, exigeRegistroIntegral: false, detalhe: "Contagem de artigos não informada." };
  }
  const percentual = artigosTocados / totalArtigos;
  return {
    percentual,
    exigeRegistroIntegral: percentual > LIMIAR_REGISTRO_INTEGRAL,
    detalhe: `${artigosTocados} de ${totalArtigos} artigos tocados (${(percentual * 100).toFixed(1)}%)${percentual > LIMIAR_REGISTRO_INTEGRAL ? " — acima de 30%, exige registro integral (Art. 162 §§3º-4º), não apenas averbação." : "."}`
  };
}

async function registrarVersao(pool, { urlBlob, dataVigencia, documentoOrigemId, totalArtigos, artigosTocados, registradoPor }) {
  const proximo = await pool.request().query(`SELECT ISNULL(MAX(NumeroVersao), 0) + 1 AS proximo FROM TextoMestreVersoes`);
  const numeroVersao = proximo.recordset[0].proximo;
  const inserido = await pool.request()
    .input("numeroVersao", sql.Int, numeroVersao).input("urlBlob", sql.NVarChar(500), urlBlob)
    .input("dataVigencia", sql.Date, dataVigencia).input("documentoOrigemId", sql.Int, documentoOrigemId || null)
    .input("totalArtigos", sql.Int, totalArtigos || null).input("artigosTocados", sql.Int, artigosTocados || null)
    .input("registradoPor", sql.Int, registradoPor || null)
    .query(`INSERT INTO TextoMestreVersoes (NumeroVersao, UrlBlob, DataVigencia, DocumentoOrigemId, TotalArtigos, ArtigosTocados, RegistradoPor)
            OUTPUT INSERTED.VersaoId VALUES (@numeroVersao, @urlBlob, @dataVigencia, @documentoOrigemId, @totalArtigos, @artigosTocados, @registradoPor)`);
  return { versaoId: inserido.recordset[0].VersaoId, numeroVersao };
}

function proximaDataRevisao(dataUltimaRevisao) {
  const d = new Date(`${dataUltimaRevisao}T00:00:00`);
  d.setFullYear(d.getFullYear() + ANOS_REVISAO_QUADRIENAL);
  return d.toISOString().slice(0, 10);
}

async function situacaoRevisaoQuadrienal(pool, hoje) {
  const r = await pool.request().query(`SELECT CONVERT(varchar(10), DataUltimaRevisaoSistemica, 120) AS data FROM ParametrosTextoMestre WHERE ParametroId = 1`);
  const dataUltima = r.recordset[0] ? r.recordset[0].data : null;
  if (!dataUltima) return { definida: false };
  const hojeStr = hoje || new Date().toISOString().slice(0, 10);
  const proximaRevisao = proximaDataRevisao(dataUltima);
  const diasRestantes = estatuto.diasDesde(hojeStr, proximaRevisao);
  return {
    definida: true, ultimaRevisao: dataUltima, proximaRevisao, diasRestantes,
    dentroAntecedencia: diasRestantes <= DIAS_ANTECEDENCIA_REVISAO, vencida: diasRestantes < 0
  };
}

async function definirUltimaRevisaoQuadrienal(pool, data) {
  await pool.request().input("data", sql.Date, data).query(`UPDATE ParametrosTextoMestre SET DataUltimaRevisaoSistemica = @data WHERE ParametroId = 1`);
}

module.exports = {
  DIAS_PRAZO_ATUALIZACAO, LIMIAR_REGISTRO_INTEGRAL, ANOS_REVISAO_QUADRIENAL, DIAS_ANTECEDENCIA_REVISAO,
  versaoVigenteEm, alteracoesRegimentoPendentes, avaliarLimiar30Porcento, registrarVersao,
  situacaoRevisaoQuadrienal, definirUltimaRevisaoQuadrienal
};
