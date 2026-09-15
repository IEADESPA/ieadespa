// shared/notificacaoDetectores.js
// Um detector por Chave de NotificacaoRegras: consulta a tabela de origem e
// devolve os fatos geradores (quem recebe + de qual registro). O motor
// (shared/notificacoes.js) é quem decide se cria/envia — o detector só
// reaproveita a MESMA leitura que já existe no "alertas" de cada módulo
// (GestaoSeguros, FecharMesTesouraria/PrestacoesContas, RepassesInstitucionais),
// pra não duplicar a regra de negócio de "o que é vencido/atrasado".
//
// Registrar uma regra nova = 1 linha em NotificacaoRegras (migração) + 1
// entrada aqui. O motor em si (AvaliarNotificacoes) não muda.
const { sql } = require("./db");

// Seguros (v4.16) — mesma janela de 30 dias e mesmo critério de "vencida"
// que GET /api/seguros/alertas já usa.
async function detectarSegurosVencendo(pool) {
  const result = await pool.request().query(`
    SELECT ApoliceId, Tipo, Seguradora, NumeroApolice, DataFim
    FROM ApolicesSeguro
    WHERE Status = 'ATIVA' AND DataFim <= DATEADD(DAY, 30, CAST(SYSUTCDATETIME() AS DATE))
  `);
  return result.recordset.map(a => ({
    referenciaId: a.ApoliceId,
    fatoGerador: new Date(a.DataFim) < new Date()
      ? `Apólice ${a.NumeroApolice} (${a.Seguradora}, ${a.Tipo}) está VENCIDA desde ${new Date(a.DataFim).toLocaleDateString("pt-BR")}.`
      : `Apólice ${a.NumeroApolice} (${a.Seguradora}, ${a.Tipo}) vence em ${new Date(a.DataFim).toLocaleDateString("pt-BR")}.`
  }));
}

// Prestação de contas (v4.12/Reg. Art. 120) — atrasada é qualquer mês de
// referência anterior ao atual que ainda não fechou PENDENTE→COMPLETA.
async function detectarPrestacaoContasAtrasada(pool) {
  const mesAtual = new Date().toISOString().slice(0, 7);
  const result = await pool.request().input("mesAtual", sql.Char(7), mesAtual).query(`
    SELECT p.PrestacaoId, p.MesReferencia, c.Nome AS congregacaoNome
    FROM PrestacoesContas p
    JOIN Congregacoes c ON c.CongregacaoId = p.CongregacaoId
    WHERE p.Status = 'PENDENTE' AND p.MesReferencia < @mesAtual
  `);
  return result.recordset.map(p => ({
    referenciaId: p.PrestacaoId,
    fatoGerador: `Prestação de contas de ${p.congregacaoNome} (${p.MesReferencia}) ainda está pendente.`
  }));
}

// Repasse institucional (v4.15) — "parado no malote": mês de referência
// anterior ao atual, ainda sem repasse confirmado.
async function detectarRepasseMaloteParado(pool) {
  const mesAtual = new Date().toISOString().slice(0, 7);
  const result = await pool.request().input("mesAtual", sql.Char(7), mesAtual).query(`
    SELECT RepasseId, OrigemNome, MesReferencia, ValorRepasse
    FROM RepassesInstitucionais
    WHERE Status = 'PENDENTE' AND MesReferencia < @mesAtual
  `);
  return result.recordset.map(r => ({
    referenciaId: r.RepasseId,
    fatoGerador: `Repasse de ${r.OrigemNome} (${r.MesReferencia}, R$ ${Number(r.ValorRepasse).toFixed(2)}) ainda não foi confirmado.`
  }));
}

const DETECTORES = {
  SEGUROS_VENCENDO: { tabela: "ApolicesSeguro", detectar: detectarSegurosVencendo },
  PRESTACAO_CONTAS_ATRASADA: { tabela: "PrestacoesContas", detectar: detectarPrestacaoContasAtrasada },
  REPASSE_MALOTE_PARADO: { tabela: "RepassesInstitucionais", detectar: detectarRepasseMaloteParado }
};

module.exports = { DETECTORES };
