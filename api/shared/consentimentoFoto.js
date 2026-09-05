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
async function fotoConsentimentoConcedido(pool, sql, membroId) {
  const result = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT c1.Tipo, c1.Concedido
    FROM ConsentimentosLGPD c1
    WHERE c1.MembroId = @id AND c1.Tipo IN ('FOTO', 'DADOS_CONTATO')
      AND c1.ConsentimentoId = (
        SELECT MAX(c2.ConsentimentoId) FROM ConsentimentosLGPD c2
        WHERE c2.MembroId = c1.MembroId AND c2.Tipo = c1.Tipo
      )
  `);
  return result.recordset.some(r => r.Concedido);
}

module.exports = { fotoConsentimentoConcedido };
