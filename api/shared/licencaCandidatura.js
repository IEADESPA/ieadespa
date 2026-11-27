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

// O início da licença (Art. 157 §2º: o obreiro entra em licença 90 dias antes do pleito). Revisão de fora, 26/11/2026: antes a licença valia no dia do registro,
// qualquer que fosse o pleito. Agora: o pleito que já passou é recusado; antes dos 90 dias, recusado com o dia em que a licença começa (a pessoa continua nos
// cargos); dentro dos 90 dias, a licença começa no dia do registro, e é esse o início gravado (o de verdade). `dataPleito` e `hoje`: AAAA-MM-DD (hoje de Brasília).
const DIAS_ANTECEDENCIA = 90;
function inicioDaLicenca(dataPleito, hoje) {
  const d = new Date(`${dataPleito}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - DIAS_ANTECEDENCIA);
  const peloPleito = d.toISOString().slice(0, 10);
  if (dataPleito < hoje) return { ok: false, motivo: "PLEITO_PASSADO", peloPleito };
  if (peloPleito > hoje) return { ok: false, motivo: "ANTES_DO_INICIO", peloPleito };
  return { ok: true, inicio: hoje, peloPleito };
}
const dataBr = (iso) => String(iso).slice(0, 10).split("-").reverse().join("/");
// a recusa de inicioDaLicenca em palavras (null quando a licença pode começar)
function mensagemDoInicio(r, dataPleito) {
  if (r.motivo === "ANTES_DO_INICIO") {
    return `A licença por candidatura começa ${DIAS_ANTECEDENCIA} dias antes do pleito, em ${dataBr(r.peloPleito)}: registre a partir desse dia. Até lá a pessoa continua nos cargos.`;
  }
  if (r.motivo === "PLEITO_PASSADO") return `A data do pleito (${dataBr(dataPleito)}) já passou: confira a data.`;
  return null;
}

module.exports = { encerrarLicencaAberta, MOTIVO_SAIDA_DO_ROL, DIAS_ANTECEDENCIA, inicioDaLicenca, mensagemDoInicio };
