// shared/licencaCandidatura.js — a licença por candidatura política (Reg. Art. 157 §2º) que fecha sem a decisão da Diretoria: quem sai do rol durante a licença
// (o falecimento gravado pela ficha, o desligamento) tem a licença aberta encerrada na mesma transação da saída (resposta do responsável, 25/11/2026). A licença
// fica como "não retornou", com a data e o motivo do encerramento. A volta a ATIVO continua só pela decisão do retorno (GestaoLicencasCandidatura).

// O motivo das saídas disciplinares (a exclusão, o abandono) é sigiloso: só quem tem "disciplina" o vê, e a observação da licença aparece para quem tem só
// "pessoas". Nelas a licença fecha com este texto neutro; a trilha de cada rota guarda o ato.
const MOTIVO_SAIDA_DO_ROL = "Encerrada pela saída do rol.";

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

module.exports = { encerrarLicencaAberta, MOTIVO_SAIDA_DO_ROL };
