// shared/licencaCandidatura.js — a licença por candidatura política (Reg. Art. 157 §2º) que fecha sem a decisão da Diretoria: quem sai do rol durante a licença
// (o falecimento gravado pela ficha, o desligamento) tem a licença aberta encerrada na mesma transação da saída (resposta do responsável, 25/11/2026). A licença
// fica como "não retornou", com a data e o motivo do encerramento. A volta a ATIVO continua só pela decisão do retorno (GestaoLicencasCandidatura).

// `executor` é o da transação de quem chama (shared/transacaoCurta.js). Devolve quantas licenças fechou (0 ou 1).
async function encerrarLicencaAberta(executor, sql, membroId, observacao, hoje) {
  const r = await executor.request()
    .input("m", sql.Int, membroId)
    .input("hoje", sql.Date, hoje)
    .input("obs", sql.NVarChar(300), observacao)
    .query(`UPDATE LicencasCandidatura SET Status = 'NAO_RETORNOU', DataRetornoDecidida = @hoje, ObservacaoRetorno = @obs
            WHERE MembroId = @m AND Status = 'EM_LICENCA'`);
  return (r && r.rowsAffected && r.rowsAffected[0]) || 0;
}

module.exports = { encerrarLicencaAberta };
