// shared/consentimentoFoto.js
// Trava real de Foto (v1.7) — encontrado um bug real (v1.10): o autoatendimento
// (MinhaFoto) e o upload pela Secretaria (UploadFotoMembro) checavam só o
// consentimento Tipo='FOTO', mas a ÚNICA caixa de consentimento que existe na
// tela de autoatendimento (Meu Painel > Meus Dados LGPD) concede Tipo=
// 'DADOS_CONTATO' — generalizado na v1.9 pra cobrir "dados sensíveis" em geral,
// com o próprio rótulo dizendo "...contato, foto e demais dados sensíveis...".
// Sem esse ajuste, o membro marcava a única caixa que existe e o upload
// continuava bloqueado do mesmo jeito, sem nenhum jeito de resolver.
// Aceita qualquer um dos dois tipos concedido (o mais recente de cada um,
// trilha append-only) — cobre tanto quem já tinha FOTO concedido antes (fluxo
// antigo, Secretaria) quanto quem só concedeu o DADOS_CONTATO novo.
//
// v7.7 — MENOR DE 18 ANOS NÃO CONSENTE SOZINHO (LGPD art. 14, § 1º): se a pessoa tem idade CONHECIDA abaixo de 18, só vale o consentimento de IMAGEM VIGENTE do
// responsável (MinisterioMenoresConsentimentos, shared/menoresConsentimentoDb.js::consentimentoVigente: a última linha concede, quem concedeu ainda é responsável
// ativo). O consentimento genérico da própria pessoa (FOTO/DADOS_CONTATO) não destrava a foto de um menor. Adulto e idade desconhecida (cadastro sem data de
// nascimento: não se presume menor) seguem exatamente como antes.
const { hojeBrasilia } = require("./dataBrasilia");
const vol = require("./voluntariado");
const { consentimentoVigente } = require("./menoresConsentimentoDb");

// { concedido, menor }: `menor` diz qual regra valeu, para a tela e a mensagem de recusa poderem falar com a pessoa certa (o menor ou o responsável).
async function situacaoDoConsentimentoFoto(pool, sql, membroId, { hoje = hojeBrasilia() } = {}) {
  const nasc = await pool.request().input("id", sql.Int, membroId).query(`SELECT DataNascimento FROM MembroReferencia WHERE MembroId = @id`);
  const idade = vol.idadeEmAnos(nasc.recordset[0] && nasc.recordset[0].DataNascimento, hoje);
  if (idade != null && idade < vol.MAIORIDADE) return { menor: true, concedido: await consentimentoVigente(pool, membroId, "IMAGEM", { hoje }) };

  const result = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT c1.Tipo, c1.Concedido
    FROM ConsentimentosLGPD c1
    WHERE c1.MembroId = @id AND c1.Tipo IN ('FOTO', 'DADOS_CONTATO')
      AND c1.ConsentimentoId = (
        SELECT MAX(c2.ConsentimentoId) FROM ConsentimentosLGPD c2
        WHERE c2.MembroId = c1.MembroId AND c2.Tipo = c1.Tipo
      )
  `);
  return { menor: false, concedido: result.recordset.some(r => r.Concedido) };
}

async function fotoConsentimentoConcedido(pool, sql, membroId) {
  return (await situacaoDoConsentimentoFoto(pool, sql, membroId)).concedido;
}

module.exports = { fotoConsentimentoConcedido, situacaoDoConsentimentoFoto };
